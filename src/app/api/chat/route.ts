import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage, createUIMessageStreamResponse, consumeStream } from "ai";
import { format } from "date-fns";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { AVAILABLE_OPENAI_MODELS, DEFAULT_LLM_MODEL, normalizeLlmModel, normalizeWebSearchMode } from "@/lib/llm-defaults";
import { computeNextRunAt } from "@/lib/schedule";
import { toDbChannelConfig, toMaskedApiJob, toRunnableChannel } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";
import { enforceDailyRunLimit } from "@/lib/limits";
import { runPrompt } from "@/lib/llm";
import { sendChannelMessage } from "@/lib/channel";
import { getOrCreatePublishedPromptVersion } from "@/lib/prompt-version";
import { compilePromptTemplate, coerceStringVars } from "@/lib/prompt-compile";
import { enhancePrompt } from "@/lib/prompt-writer";
import { generatePromptDraftFromIntent, inferUseWebSearch, proposeSchedule } from "@/lib/job-intents";
import { redactMessageForStorage } from "@/lib/chat-redact";

export const maxDuration = 300;

function generateChatMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

const bodySchema = z.object({
  messages: z.array(z.unknown()),
  chatId: z.string().min(1).max(64).optional(),
  persist: z.boolean().optional(),
});

const webhookConfigSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    headers: z.string().default("{}"),
    payload: z.string().default(""),
  })
  .superRefine((value, ctx) => {
    try {
      const parsedHeaders = JSON.parse(value.headers || "{}");
      if (typeof parsedHeaders !== "object" || parsedHeaders === null || Array.isArray(parsedHeaders)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headers"], message: "Headers must be a JSON object" });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["headers"], message: "Headers must be valid JSON" });
    }

    if (value.payload.trim()) {
      try {
        JSON.parse(value.payload);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "Payload must be valid JSON" });
      }
    }
  });

const discordChannelSchema = z
  .union([
    z.object({ type: z.literal("discord"), config: z.object({ webhookUrl: z.string().url() }) }),
    z.object({ type: z.literal("discord"), webhookUrl: z.string().url() }),
  ])
  .transform((value) => {
    if ("config" in value) {
      return value;
    }
    return { type: "discord" as const, config: { webhookUrl: value.webhookUrl } };
  });

const telegramChannelSchema = z
  .union([
    z.object({ type: z.literal("telegram"), config: z.object({ botToken: z.string().min(10), chatId: z.string().min(1) }) }),
    z.object({ type: z.literal("telegram"), botToken: z.string().min(10), chatId: z.string().min(1) }),
  ])
  .transform((value) => {
    if ("config" in value) {
      return value;
    }
    return { type: "telegram" as const, config: { botToken: value.botToken, chatId: value.chatId } };
  });

const webhookChannelSchema = z
  .union([
    z.object({ type: z.literal("webhook"), config: webhookConfigSchema }),
    z.object({ type: z.literal("webhook") }).merge(webhookConfigSchema),
  ])
  .transform((value) => {
    if ("config" in value) {
      return value;
    }
    const { type: _type, ...config } = value;
    void _type;
    return { type: "webhook" as const, config };
  });

const channelSchema = z.union([discordChannelSchema, telegramChannelSchema, webhookChannelSchema]);

const createJobInputSchema = z
  .object({
    name: z.string().min(1).max(100),
    template: z.string().min(1).max(8000),
    variables: z.record(z.string(), z.string()).optional().default({}),
    useWebSearch: z.boolean().optional().default(false),
    llmModel: z.string().optional(),
    webSearchMode: z.enum(["native", "parallel"]).optional(),
    scheduleType: z.enum(["daily", "weekly", "cron"]),
    scheduleTime: z.string().optional(),
    scheduleDayOfWeek: z.number().int().min(0).max(6).optional(),
    scheduleCron: z.string().optional(),
    enabled: z.boolean().optional().default(true),
    channel: channelSchema,
  })
  .superRefine((value, ctx) => {
    if (value.scheduleType === "cron") {
      if (!value.scheduleCron || !value.scheduleCron.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleCron"], message: "Required for cron" });
      }
      return;
    }

    if (!value.scheduleTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value.scheduleTime)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleTime"], message: "Required for daily/weekly (HH:mm)" });
    }

    if (value.scheduleType === "weekly" && value.scheduleDayOfWeek == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleDayOfWeek"], message: "Required for weekly" });
    }
  });

const updateJobInputSchema = z
  .object({
    jobId: z.string().min(1).max(64),
    name: z.string().min(1).max(100).optional(),
    template: z.string().min(1).max(8000).optional(),
    variables: z.record(z.string(), z.string()).optional(),
    useWebSearch: z.boolean().optional(),
    llmModel: z.string().optional(),
    webSearchMode: z.enum(["native", "parallel"]).optional(),
    scheduleType: z.enum(["daily", "weekly", "cron"]).optional(),
    scheduleTime: z.string().optional(),
    scheduleDayOfWeek: z.number().int().min(0).max(6).optional(),
    scheduleCron: z.string().optional(),
    enabled: z.boolean().optional(),
    channel: channelSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.scheduleType) {
      return;
    }

    if (value.scheduleType === "cron") {
      if (!value.scheduleCron || !value.scheduleCron.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleCron"], message: "Required for cron" });
      }
      return;
    }

    if (!value.scheduleTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value.scheduleTime)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleTime"], message: "Required for daily/weekly (HH:mm)" });
    }

    if (value.scheduleType === "weekly" && value.scheduleDayOfWeek == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleDayOfWeek"], message: "Required for weekly" });
    }
  });

const deleteJobInputSchema = z.object({
  jobId: z.string().min(1).max(64),
  confirm: z.literal("DELETE"),
});

const previewTemplateInputSchema = z.object({
  name: z.string().max(100).optional().default("Preview"),
  template: z.string().min(1).max(8000),
  variables: z.record(z.string(), z.string()).optional().default({}),
  useWebSearch: z.boolean().optional().default(false),
  llmModel: z.string().optional(),
  webSearchMode: z.enum(["native", "parallel"]).optional(),
  testSend: z.boolean().optional().default(false),
  nowIso: z.string().optional(),
  timezone: z.string().max(64).optional(),
  channel: channelSchema.optional(),
});

const jobIdInputSchema = z.object({ jobId: z.string().min(1).max(64) });

const jobPreviewInputSchema = z.object({
  jobId: z.string().min(1).max(64),
  testSend: z.boolean().optional().default(false),
});

const planFromIntentInputSchema = z.object({ intentText: z.string().min(1).max(8000) });

const enhancePromptInputSchema = z.object({
  prompt: z.string().min(1).max(8000),
  allowStrongerRewrite: z.boolean().optional().default(false),
});

const historiesInputSchema = z.object({ jobId: z.string().min(1).max(64), take: z.number().int().min(1).max(200).optional() });

const createEvalSuiteInputSchema = z.object({
  jobId: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  cases: z
    .array(
      z.object({
        variables: z.record(z.string(), z.string()).default({}),
        mustInclude: z.array(z.string().min(1).max(200)).default([]),
      }),
    )
    .min(1)
    .max(10),
});

const runEvalSuiteInputSchema = z.object({
  promptVersionId: z.string().min(1).max(64),
  suiteId: z.string().min(1).max(64),
});

const CHAT_SYSTEM_PROMPT = `You are Promptloop's agent.

Goal: help the user create, update, preview, and manage scheduled jobs that deliver to Discord/Telegram/Webhook.

Rules:
- Ask only the minimum questions needed.
- Never repeat secrets back (webhook URLs, bot tokens).
- Before creating or updating a job, confirm: schedule, delivery target, and what the prompt should produce.
- If the user message contains a Discord webhook URL, assume delivery is Discord and do not ask where to deliver.
- If the user says "proceed" / "yes" / "create it" and the required fields are known, call create_job.
- For destructive operations (delete), ask for explicit confirmation and then call the tool.
- Use tools to read current state before changing it.`;

function ensureValidNowIso(nowIso?: string) {
  if (!nowIso) {
    return;
  }
  const d = new Date(nowIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error("nowIso must be a valid ISO date");
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    const parsed = bodySchema.parse(await req.json());
    const messages = parsed.messages as UIMessage[];
    const chatId = typeof parsed.chatId === "string" && parsed.chatId.trim() ? parsed.chatId : null;
    const persist = parsed.persist === true && !!chatId;

    const prismaAny = prisma as unknown as Record<string, unknown>;
    const prismaChat = {
      chat: prismaAny.chat as
        | {
            findUnique: (args: unknown) => Promise<{ userId: string } | null>;
            upsert: (args: unknown) => Promise<unknown>;
          }
        | undefined,
      chatMessage: prismaAny.chatMessage as
        | {
            upsert: (args: unknown) => Promise<unknown>;
          }
        | undefined,
    };

    if (persist && (!prismaChat.chat || !prismaChat.chatMessage)) {
      throw new Error("Chat persistence is not available (Prisma Client missing Chat models). Run `npm run prisma:generate` and restart the server.");
    }

    async function ensureChat() {
      if (!persist || !chatId) return;
      if (!prismaChat.chat) {
        throw new Error("Chat persistence is not available.");
      }
      const existing = await prismaChat.chat.findUnique({ where: { id: chatId }, select: { userId: true } });
      if (existing && existing.userId !== userId) {
        throw new Error("Chat not found");
      }
      await prismaChat.chat.upsert({
        where: { id: chatId },
        create: { id: chatId, userId },
        update: {},
      });
    }

    function parseMessageCreatedAt(message: UIMessage): Date | null {
      const meta = message.metadata;
      if (!meta || typeof meta !== "object") return null;
      const createdAt = (meta as { createdAt?: unknown }).createdAt;
      if (typeof createdAt !== "string") return null;
      const t = Date.parse(createdAt);
      if (!Number.isFinite(t)) return null;
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }

    async function persistTranscript(transcript: UIMessage[]) {
      if (!persist || !chatId) return;
      if (!prismaChat.chatMessage) throw new Error("Chat persistence is not available.");

      const filtered = transcript
        .filter((m): m is UIMessage => !!m && typeof m === "object")
        .filter((m) => typeof m.id === "string" && m.id.trim())
        .filter((m) => m.role === "system" || m.role === "user" || m.role === "assistant");

      if (filtered.length === 0) return;

      await prisma.$transaction(async (tx) => {
        const txAny = tx as unknown as Record<string, unknown>;
        const txChatMessage = txAny.chatMessage as
          | {
              findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
              upsert: (args: unknown) => Promise<unknown>;
            }
          | undefined;
        if (!txChatMessage) {
          throw new Error("Chat persistence is not available.");
        }

        const ids = filtered.map((m) => m.id);
        const existing = await txChatMessage.findMany({
          where: { chatId, messageId: { in: ids } },
          select: { messageId: true, messageCreatedAt: true },
        });
        const existingById = new Map(
          existing
            .map((r) => {
              const messageId = typeof r.messageId === "string" ? r.messageId : "";
              const messageCreatedAt = r.messageCreatedAt instanceof Date ? r.messageCreatedAt : null;
              return messageId ? ([messageId, { messageId, messageCreatedAt }] as const) : null;
            })
            .filter((x): x is NonNullable<typeof x> => x != null),
        );

        for (const [i, message] of filtered.entries()) {
          const messageId = message.id;
          const redacted = redactMessageForStorage(message);
          const desiredSeq = i + 1;
          const desiredCreatedAt = parseMessageCreatedAt(message);
          const prev = existingById.get(messageId);
          const messageCreatedAt = desiredCreatedAt ?? prev?.messageCreatedAt ?? undefined;

          await txChatMessage.upsert({
            where: { chatId_messageId: { chatId, messageId } },
            create: {
              chatId,
              messageId,
              seq: desiredSeq,
              role: message.role,
              content: redacted.content,
              message: redacted.message as Prisma.InputJsonValue,
              redacted: redacted.redacted,
              ...(messageCreatedAt ? { messageCreatedAt } : {}),
            },
            update: {
              seq: desiredSeq,
              role: message.role,
              content: redacted.content,
              message: redacted.message as Prisma.InputJsonValue,
              redacted: redacted.redacted,
              ...(messageCreatedAt ? { messageCreatedAt } : {}),
            },
          });
        }
      });
    }

    const tools = {
      list_jobs: tool({
        description: "List the user's jobs.",
        inputSchema: z.object({}),
        execute: async () => {
          const jobs = await prisma.job.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
          return { jobs: jobs.map(toMaskedApiJob) };
        },
      }),
      get_job: tool({
        description: "Get a single job by id.",
        inputSchema: jobIdInputSchema,
        execute: async ({ jobId }) => {
          const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
          if (!job) {
            return { error: "Not found" };
          }
          return { job: toMaskedApiJob(job) };
        },
      }),
      create_job: tool({
        description: "Create a new Promptloop job.",
        inputSchema: createJobInputSchema,
        execute: async (input) => {
          const { channelType, channelConfig } = toDbChannelConfig(input.channel);
          const scheduleTime = input.scheduleType === "cron" ? "00:00" : (input.scheduleTime ?? "09:00");
          const nextRunAt = computeNextRunAt({
            scheduleType: input.scheduleType,
            scheduleTime,
            scheduleDayOfWeek: input.scheduleDayOfWeek ?? null,
            scheduleCron: input.scheduleCron ?? null,
          });

          const llmModel = normalizeLlmModel(input.llmModel);
          const webSearchMode = normalizeWebSearchMode(input.webSearchMode);

          const job = await prisma.job.create({
            data: {
              userId,
              name: input.name,
              prompt: input.template,
              allowWebSearch: input.useWebSearch,
              llmModel: llmModel || null,
              webSearchMode: webSearchMode || null,
              scheduleType: input.scheduleType,
              scheduleTime,
              scheduleDayOfWeek: input.scheduleType === "weekly" ? (input.scheduleDayOfWeek ?? null) : null,
              scheduleCron: input.scheduleType === "cron" ? (input.scheduleCron ?? null) : null,
              channelType,
              channelConfig,
              enabled: input.enabled,
              nextRunAt,
              promptVersions: {
                create: {
                  template: input.template,
                  variables: input.variables,
                },
              },
            },
            include: { promptVersions: { orderBy: { createdAt: "desc" }, take: 1 } },
          });

          const latest = job.promptVersions[0];
          const updated = await prisma.job.update({
            where: { id: job.id },
            data: { publishedPromptVersionId: latest?.id ?? null },
          });

          await recordAudit({
            userId,
            action: "job.create",
            entityType: "job",
            entityId: updated.id,
            data: {
              useWebSearch: updated.allowWebSearch,
              llmModel: updated.llmModel,
              webSearchMode: updated.webSearchMode,
              scheduleType: updated.scheduleType,
              scheduleTime: updated.scheduleTime,
              scheduleDayOfWeek: updated.scheduleDayOfWeek,
              scheduleCron: updated.scheduleCron,
              channelType: updated.channelType,
              enabled: updated.enabled,
            },
          });

          if (latest?.id) {
            await recordAudit({
              userId,
              action: "prompt.publish",
              entityType: "prompt_version",
              entityId: latest.id,
              data: { jobId: updated.id },
            });
          }

          const masked = toMaskedApiJob(updated);
          return { jobId: masked.id, job: masked };
        },
      }),
      update_job: tool({
        description: "Update an existing Promptloop job. Omitted fields are preserved.",
        inputSchema: updateJobInputSchema,
        execute: async (input) => {
          const { jobId } = input;

          const existing = await prisma.job.findFirst({
            where: { id: jobId, userId },
            include: { publishedPromptVersion: true },
          });
          if (!existing) {
            return { error: "Not found" };
          }

          const nextName = input.name ?? existing.name;
          const nextTemplate = input.template ?? existing.prompt;
          const nextUseWebSearch = input.useWebSearch ?? existing.allowWebSearch;
          const nextLlmModel = normalizeLlmModel(input.llmModel ?? existing.llmModel ?? undefined) || null;
          const nextWebSearchMode = normalizeWebSearchMode(input.webSearchMode ?? existing.webSearchMode ?? undefined) || null;
          const nextEnabled = input.enabled ?? existing.enabled;

          const nextScheduleType = input.scheduleType ?? existing.scheduleType;
          const nextScheduleTime =
            nextScheduleType === "cron" ? "00:00" : (input.scheduleTime ?? existing.scheduleTime ?? "09:00");
          const nextScheduleDayOfWeek =
            nextScheduleType === "weekly"
              ? (input.scheduleDayOfWeek ?? existing.scheduleDayOfWeek ?? null)
              : null;
          const nextScheduleCron =
            nextScheduleType === "cron" ? (input.scheduleCron ?? existing.scheduleCron ?? null) : null;

          const nextRunAt = computeNextRunAt({
            scheduleType: nextScheduleType,
            scheduleTime: nextScheduleTime,
            scheduleDayOfWeek: nextScheduleDayOfWeek,
            scheduleCron: nextScheduleCron,
          });

          const channel = input.channel ? toDbChannelConfig(input.channel) : null;

          const shouldCreatePromptVersion = input.template != null || input.variables != null;
          const pvTemplate = nextTemplate;
          const pvVariables = input.variables ?? coerceStringVars(existing.publishedPromptVersion?.variables ?? {});

          const updatedJob = await prisma.job.update({
            where: { id: existing.id },
            data: {
              name: nextName,
              prompt: nextTemplate,
              allowWebSearch: nextUseWebSearch,
              llmModel: nextLlmModel,
              webSearchMode: nextWebSearchMode,
              scheduleType: nextScheduleType,
              scheduleTime: nextScheduleTime,
              scheduleDayOfWeek: nextScheduleDayOfWeek,
              scheduleCron: nextScheduleCron,
              enabled: nextEnabled,
              nextRunAt,
              ...(channel ? { channelType: channel.channelType, channelConfig: channel.channelConfig } : {}),
              ...(shouldCreatePromptVersion
                ? {
                    promptVersions: {
                      create: {
                        template: pvTemplate,
                        variables: pvVariables,
                      },
                    },
                  }
                : {}),
            },
            include: { promptVersions: { orderBy: { createdAt: "desc" }, take: 1 } },
          });

          const latest = shouldCreatePromptVersion ? updatedJob.promptVersions[0] : null;
          const jobAfterPublish = latest?.id
            ? await prisma.job.update({ where: { id: updatedJob.id }, data: { publishedPromptVersionId: latest.id } })
            : updatedJob;

          await recordAudit({
            userId,
            action: "job.update",
            entityType: "job",
            entityId: jobAfterPublish.id,
            data: {
              useWebSearch: jobAfterPublish.allowWebSearch,
              llmModel: jobAfterPublish.llmModel,
              webSearchMode: jobAfterPublish.webSearchMode,
              scheduleType: jobAfterPublish.scheduleType,
              scheduleTime: jobAfterPublish.scheduleTime,
              scheduleDayOfWeek: jobAfterPublish.scheduleDayOfWeek,
              scheduleCron: jobAfterPublish.scheduleCron,
              channelType: jobAfterPublish.channelType,
              enabled: jobAfterPublish.enabled,
            },
          });

          if (latest?.id) {
            await recordAudit({
              userId,
              action: "prompt.publish",
              entityType: "prompt_version",
              entityId: latest.id,
              data: { jobId: jobAfterPublish.id },
            });
          }

          const masked = toMaskedApiJob(jobAfterPublish);
          return { jobId: masked.id, job: masked };
        },
      }),
      delete_job: tool({
        description: "Delete a job. Requires confirm=DELETE.",
        inputSchema: deleteJobInputSchema,
        execute: async ({ jobId }) => {
          await prisma.job.deleteMany({ where: { id: jobId, userId } });
          await recordAudit({ userId, action: "job.delete", entityType: "job", entityId: jobId });
          return { ok: true, jobId };
        },
      }),
      preview_job: tool({
        description: "Run a preview for an existing job. Optionally test-send.",
        inputSchema: jobPreviewInputSchema,
        execute: async ({ jobId, testSend }) => {
          await enforceDailyRunLimit(userId);
          const job = await prisma.job.findFirst({ where: { id: jobId, userId }, include: { publishedPromptVersion: true } });
          if (!job) {
            return { error: "Not found" };
          }

          const pv = job.publishedPromptVersion ?? (await getOrCreatePublishedPromptVersion(job.id));
          const vars = coerceStringVars(pv.variables);
          const prompt = compilePromptTemplate(pv.template, vars);

          const result = await runPrompt(prompt, {
            model: normalizeLlmModel(job.llmModel),
            useWebSearch: job.allowWebSearch,
            webSearchMode: normalizeWebSearchMode(job.webSearchMode),
          });
          const title = `[${job.name}] ${format(new Date(), "yyyy-MM-dd HH:mm")}`;

          if (testSend) {
            await sendChannelMessage(toRunnableChannel(job), title, result.output, {
              citations: result.citations,
              usedWebSearch: result.usedWebSearch,
              meta: { kind: "job-preview", jobId: job.id, promptVersionId: pv.id },
            });
          }

          await prisma.runHistory.create({
            data: {
              job: { connect: { id: job.id } },
              promptVersion: { connect: { id: pv.id } },
              status: "success",
              outputText: result.output,
              outputPreview: result.output.slice(0, 1000),
              llmModel: result.llmModel ?? null,
              llmUsage: result.llmUsage == null ? Prisma.DbNull : (result.llmUsage as Prisma.InputJsonValue),
              llmToolCalls: result.llmToolCalls == null ? Prisma.DbNull : (result.llmToolCalls as Prisma.InputJsonValue),
              usedWebSearch: result.usedWebSearch,
              citations: (result.citations as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
              isPreview: true,
            },
          });
          await prisma.previewEvent.create({ data: { userId } });

          return {
            status: "success",
            jobId: job.id,
            output: result.output,
            executedAt: new Date().toISOString(),
            usedWebSearch: result.usedWebSearch,
            citations: result.citations,
            llmModel: result.llmModel ?? null,
          };
        },
      }),
      preview_template: tool({
        description: "Preview a template + variables without creating a job. Optionally test-send.",
        inputSchema: previewTemplateInputSchema,
        execute: async (input) => {
          await enforceDailyRunLimit(userId);
          ensureValidNowIso(input.nowIso);

          const now = input.nowIso ? new Date(input.nowIso) : new Date();
          const prompt = compilePromptTemplate(input.template, input.variables, {
            nowIso: input.nowIso,
            timezone: input.timezone,
          });

          const result = await runPrompt(prompt, {
            model: normalizeLlmModel(input.llmModel),
            useWebSearch: input.useWebSearch,
            webSearchMode: normalizeWebSearchMode(input.webSearchMode),
          });
          const title = `[${input.name}] ${format(now, "yyyy-MM-dd HH:mm")}`;

          if (input.testSend && input.channel) {
            if (input.channel.type === "discord") {
              await sendChannelMessage(
                { type: "discord", webhookUrl: input.channel.config.webhookUrl },
                title,
                result.output,
                { citations: result.citations, usedWebSearch: result.usedWebSearch, meta: { kind: "preview" } },
              );
            } else if (input.channel.type === "telegram") {
              await sendChannelMessage(
                { type: "telegram", botToken: input.channel.config.botToken, chatId: input.channel.config.chatId },
                title,
                result.output,
                { citations: result.citations, usedWebSearch: result.usedWebSearch, meta: { kind: "preview" } },
              );
            } else {
              await sendChannelMessage(
                {
                  type: "webhook",
                  url: input.channel.config.url,
                  method: input.channel.config.method,
                  headers: input.channel.config.headers,
                  payload: input.channel.config.payload,
                },
                title,
                result.output,
                { citations: result.citations, usedWebSearch: result.usedWebSearch, meta: { kind: "preview" } },
              );
            }
          }

          await prisma.previewEvent.create({ data: { userId } });

          return {
            status: "success",
            output: result.output,
            executedAt: new Date().toISOString(),
            usedWebSearch: result.usedWebSearch,
            citations: result.citations,
            llmModel: result.llmModel ?? null,
          };
        },
      }),
      list_models: tool({
        description: "List available OpenAI language models.",
        inputSchema: z.object({}),
        execute: async () => {
          return { ok: true, models: AVAILABLE_OPENAI_MODELS };
        },
      }),
      enhance_prompt: tool({
        description: "Improve a prompt template and suggest variables.",
        inputSchema: enhancePromptInputSchema,
        execute: async ({ prompt, allowStrongerRewrite }) => {
          await enforceDailyRunLimit(userId);
          const result = await enhancePrompt({ prompt, allowStrongerRewrite });
          return {
            improvedTemplate: result.improvedTemplate,
            suggestedVariables: result.suggestedVariables,
            rationale: result.rationale,
            warnings: result.warnings,
          };
        },
      }),
      plan_from_intent: tool({
        description: "Plan a job (name/template/schedule) from a natural-language intent.",
        inputSchema: planFromIntentInputSchema,
        execute: async ({ intentText }) => {
          const scheduleResult = proposeSchedule(intentText);
          const useWebSearch = inferUseWebSearch(intentText);
          if (!scheduleResult.schedule) {
            return { status: "needs_clarification" as const, clarifications: scheduleResult.clarifications };
          }
          const draft = await generatePromptDraftFromIntent(intentText);
          const variablesJson = JSON.stringify(draft.suggestedVariables ?? {}, null, 2);
          return {
            status: "ok" as const,
            clarifications: [],
            proposedJob: {
              name: draft.name,
              template: draft.template,
              variables: variablesJson,
              useWebSearch,
              llmModel: DEFAULT_LLM_MODEL,
              webSearchMode: normalizeWebSearchMode(undefined),
              schedule: scheduleResult.schedule,
              rationale: draft.rationale,
              warnings: draft.warnings,
            },
          };
        },
      }),
      get_job_histories: tool({
        description: "Get run histories for a job.",
        inputSchema: historiesInputSchema,
        execute: async ({ jobId, take }) => {
          const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { id: true } });
          if (!job) {
            return { error: "Not found" };
          }
          const histories = await prisma.runHistory.findMany({
            where: { jobId },
            orderBy: { runAt: "desc" },
            take: take ?? 50,
          });
          return { jobId, histories };
        },
      }),
      list_eval_suites: tool({
        description: "List eval suites for a job.",
        inputSchema: jobIdInputSchema,
        execute: async ({ jobId }) => {
          const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { id: true } });
          if (!job) {
            return { error: "Not found" };
          }
          const client = prisma as unknown as { evalSuite: { findMany: (args: unknown) => Promise<unknown> } };
          const suites = await client.evalSuite.findMany({
            where: { jobId },
            orderBy: { createdAt: "desc" },
            include: { cases: { orderBy: { createdAt: "asc" } } },
            take: 20,
          });
          return { jobId, suites };
        },
      }),
      create_eval_suite: tool({
        description: "Create an eval suite for a job.",
        inputSchema: createEvalSuiteInputSchema,
        execute: async ({ jobId, name, cases }) => {
          const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { id: true } });
          if (!job) {
            return { error: "Not found" };
          }
          const client = prisma as unknown as { evalSuite: { create: (args: unknown) => Promise<unknown> } };
          const suite = await client.evalSuite.create({
            data: {
              jobId,
              name,
              cases: { create: cases.map((c) => ({ variables: c.variables, mustInclude: c.mustInclude })) },
            },
            include: { cases: { orderBy: { createdAt: "asc" } } },
          });
          return { jobId, suite };
        },
      }),
      run_eval_suite: tool({
        description: "Run an eval suite against a prompt version.",
        inputSchema: runEvalSuiteInputSchema,
        execute: async ({ promptVersionId, suiteId }) => {
          const pv = await prisma.promptVersion.findFirst({
            where: { id: promptVersionId },
            include: { job: { select: { id: true, userId: true } } },
          });
          if (!pv || pv.job.userId !== userId) {
            return { error: "Not found" };
          }
          const suiteClient = prisma as unknown as {
            evalSuite: { findFirst: (args: unknown) => Promise<unknown> };
            evalRun: { create: (args: unknown) => Promise<unknown> };
          };
          const suite = (await suiteClient.evalSuite.findFirst({
            where: { id: suiteId, jobId: pv.job.id },
            include: { cases: { orderBy: { createdAt: "asc" } } },
          })) as
            | {
                id: string;
                cases: Array<{ id: string; variables: unknown; mustInclude: unknown }>;
              }
            | null;
          if (!suite) {
            return { error: "Suite not found" };
          }

          const results: Array<{ caseId: string; pass: boolean; missing: string[]; outputPreview?: string; error?: string }> = [];
          for (const c of suite.cases.slice(0, 10)) {
            const mustInclude = Array.isArray(c.mustInclude) ? c.mustInclude.filter((v) => typeof v === "string" && v.length > 0) : [];
            try {
              const llm = await runPrompt(pv.template, {
                model: DEFAULT_LLM_MODEL,
                useWebSearch: false,
                webSearchMode: normalizeWebSearchMode(undefined),
              });
              const out = llm.output;
              const missing = mustInclude.filter((s) => !out.includes(s));
              results.push({ caseId: c.id, pass: missing.length === 0, missing, outputPreview: out.slice(0, 1000) });
            } catch (err) {
              results.push({
                caseId: c.id,
                pass: false,
                missing: mustInclude,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          const status = results.every((r) => r.pass) ? "pass" : "fail";
          const run = await suiteClient.evalRun.create({
            data: { suiteId: suite.id, promptVersionId: pv.id, status, results },
          });
          return { promptVersionId, suiteId, run };
        },
      }),
    };

    const nowIso = new Date().toISOString();
    const result = streamText({
      model: openai("gpt-5.2-chat-latest"),
      system: `${CHAT_SYSTEM_PROMPT}\n\nCurrent time (UTC): ${nowIso}`,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(10),
    });

    const uiStream = result.toUIMessageStream<UIMessage>({
      originalMessages: messages,
      generateMessageId: generateChatMessageId,
      onFinish: async ({ messages: finalMessages }) => {
        if (!persist) return;
        try {
          await ensureChat();
          await persistTranscript(finalMessages);
        } catch (e) {
          console.error("[chat.persist] finish failed", e);
        }
      },
      onError: (e) => {
        console.error("[chat.ui-stream] error", e);
        return "Streaming error";
      },
    });

    return createUIMessageStreamResponse({
      stream: uiStream,
      consumeSseStream: persist
        ? ({ stream }) => consumeStream({ stream, onError: (e) => console.error("[chat.persist] consume failed", e) })
        : undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
