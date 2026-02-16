import { z } from "zod";

const discordConfigSchema = z.object({
  webhookUrl: z.string().url(),
});

const telegramConfigSchema = z.object({
  botToken: z.string().min(10),
  chatId: z.string().min(1),
});

const webhookConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  headers: z.string().default("{}"),
  payload: z.string().default(""),
}).superRefine((value, ctx) => {
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

export const previewSchema = z.object({
  template: z.string().min(1).max(8000),
  variables: z.string().default("{}").optional(),
  allowWebSearch: z.boolean().default(false),
  testSend: z.boolean().optional().default(false),
  name: z.string().max(100).optional().default("Preview"),
  nowIso: z.string().optional(),
  timezone: z.string().max(64).optional(),
  channel: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("discord"), config: discordConfigSchema }),
      z.object({ type: z.literal("telegram"), config: telegramConfigSchema }),
      z.object({ type: z.literal("webhook"), config: webhookConfigSchema }),
    ])
    .optional(),
}).superRefine((value, ctx) => {
  if (value.variables == null) {
    return;
  }
  try {
    const parsed = JSON.parse(value.variables || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables"], message: "Variables must be a JSON object" });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables"], message: "Variables must be valid JSON" });
  }
  if (value.nowIso) {
    const date = new Date(value.nowIso);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nowIso"], message: "nowIso must be a valid ISO date" });
    }
  }
});

export const jobUpsertSchema = z
  .object({
    name: z.string().min(1).max(100),
    template: z.string().min(1).max(8000),
    variables: z.string().default("{}").optional(),
    allowWebSearch: z.boolean().default(false),
    scheduleType: z.enum(["daily", "weekly", "cron"]),
    scheduleTime: z.string().optional().nullable(),
    scheduleDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
    scheduleCron: z.string().optional().nullable(),
    channel: z.discriminatedUnion("type", [
      z.object({ type: z.literal("discord"), config: discordConfigSchema }),
      z.object({ type: z.literal("telegram"), config: telegramConfigSchema }),
      z.object({ type: z.literal("webhook"), config: webhookConfigSchema }),
    ]),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.variables != null) {
      try {
        const parsed = JSON.parse(value.variables || "{}");
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables"], message: "Variables must be a JSON object" });
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables"], message: "Variables must be valid JSON" });
      }
    }

    if (value.scheduleType !== "cron" && !value.scheduleTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleTime"], message: "Required for daily/weekly" });
    }
    if (value.scheduleType !== "cron" && value.scheduleTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value.scheduleTime)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleTime"], message: "Time must be HH:mm" });
    }
    if (value.scheduleType === "weekly" && value.scheduleDayOfWeek == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleDayOfWeek"], message: "Required for weekly" });
    }
    if (value.scheduleType === "cron" && !value.scheduleCron) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduleCron"], message: "Required for cron" });
    }
  })
  .transform((value) => ({
    ...value,
    scheduleTime: value.scheduleType === "cron" ? "00:00" : (value.scheduleTime ?? "00:00"),
  }));
