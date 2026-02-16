import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { runPrompt } from "@/lib/llm";
import { sendChannelMessage, ChannelRequestError } from "@/lib/channel";
import { toRunnableChannel } from "@/lib/jobs";
import { computeNextRunAt } from "@/lib/schedule";
import { enforceDailyRunLimit } from "@/lib/limits";
import { renderPromptTemplate } from "@/lib/prompt-template";
import { getOrCreatePublishedPromptVersion } from "@/lib/prompt-version";

const DEFAULT_LOCK_STALE_MINUTES = 10;
const MAX_FAILS_BEFORE_DISABLE = 10;
const OUTPUT_PREVIEW_MAX = 1000;
const ERROR_MAX = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function retryBackoff(attempt: number) {
  const base = 400;
  const backoff = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(backoff, 4000);
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function errorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") {
    return null;
  }
  const maybeStatus = (err as { status?: unknown }).status;
  if (typeof maybeStatus === "number") {
    return maybeStatus;
  }
  return null;
}

function truncate(value: string, max: number) {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

async function lockNextDueJob() {
  const staleMinutes = Number(process.env.WORKER_LOCK_STALE_MINUTES ?? DEFAULT_LOCK_STALE_MINUTES);
  const stale = Number.isFinite(staleMinutes) && staleMinutes > 0 ? staleMinutes : DEFAULT_LOCK_STALE_MINUTES;

  const rows = await prisma.$queryRaw<Array<{ id: string; locked_at: Date }>>`
    WITH candidate AS (
      SELECT id
      FROM jobs
      WHERE enabled = true
        AND next_run_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - make_interval(mins => ${stale}))
      ORDER BY next_run_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs
    SET locked_at = date_trunc('milliseconds', now())
    FROM candidate
    WHERE jobs.id = candidate.id
    RETURNING jobs.id, jobs.locked_at;
  `;

  if (!rows.length) {
    return null;
  }

  return { id: rows[0].id, lockedAt: rows[0].locked_at };
}

async function recordDeliveryAttempt(runHistoryId: string, attempt: number, status: string, statusCode?: number, errorMessage?: string) {
  await prisma.deliveryAttempt.create({
    data: {
      runHistoryId,
      attempt,
      status,
      statusCode: statusCode ?? null,
      errorMessage: errorMessage ?? null,
    },
  });
}

async function deliverWithRetryAndReceipts(runHistoryId: string, channel: ReturnType<typeof toRunnableChannel>, title: string, output: string) {
  const maxRetries = Number(process.env.WORKER_DELIVERY_MAX_RETRIES ?? 3);
  const retries = Number.isFinite(maxRetries) && maxRetries > 0 ? Math.floor(maxRetries) : 3;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendChannelMessage(channel, title, output);
      await recordDeliveryAttempt(runHistoryId, attempt, "success");
      return { attempts: attempt, lastError: null as string | null };
    } catch (err) {
      const statusCode = err instanceof ChannelRequestError ? err.status : undefined;
      const message = err instanceof Error ? err.message : String(err);
      await recordDeliveryAttempt(runHistoryId, attempt, "fail", statusCode, truncate(message, ERROR_MAX));

      if (!statusCode || !shouldRetryStatus(statusCode) || attempt >= retries) {
        return { attempts: attempt, lastError: truncate(message, ERROR_MAX) };
      }
      await sleep(retryBackoff(attempt));
    }
  }

  return { attempts: retries, lastError: "Delivery failed" };
}

async function runPromptWithRetry(prompt: string, allowWebSearch: boolean) {
  const maxRetries = Number(process.env.WORKER_LLM_MAX_RETRIES ?? 2);
  const retries = Number.isFinite(maxRetries) && maxRetries > 0 ? Math.floor(maxRetries) : 2;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await runPrompt(prompt, allowWebSearch);
    } catch (err) {
      lastErr = err;
      const status = errorStatus(err);
      if (!status || !shouldRetryStatus(status) || attempt >= retries) {
        throw err;
      }
      await sleep(retryBackoff(attempt));
    }
  }

  if (lastErr) {
    throw lastErr;
  }
  throw new Error("LLM execution failed");
}

export type RunDueJobsResult = {
  processed: number;
  success: number;
  fail: number;
  disabled: number;
  duplicates: number;
  quotaBlocked: number;
};

export async function runDueJobs(opts: { timeBudgetMs: number; maxJobs: number; runnerId?: string }): Promise<RunDueJobsResult> {
  const startedAt = Date.now();
  const result: RunDueJobsResult = { processed: 0, success: 0, fail: 0, disabled: 0, duplicates: 0, quotaBlocked: 0 };

  while (true) {
    if (result.processed >= opts.maxJobs) {
      return result;
    }
    if (Date.now() - startedAt >= opts.timeBudgetMs) {
      return result;
    }

    const lock = await lockNextDueJob();
    if (!lock) {
      return result;
    }

    const job = await prisma.job.findUnique({ where: { id: lock.id }, include: { publishedPromptVersion: true } });
    if (!job) {
      result.processed++;
      result.fail++;
      continue;
    }

    const scheduledFor = job.nextRunAt;
    const pv = job.publishedPromptVersion ?? (await getOrCreatePublishedPromptVersion(job.id));
    const template = pv.template;
    const vars = (pv.variables as Record<string, string> | null) ?? {};
    const renderedPrompt = renderPromptTemplate({ template, vars, now: scheduledFor });

    const title = `[${job.name}] ${format(new Date(), "yyyy-MM-dd HH:mm")}`;

    let runHistoryId: string | null = null;
    try {
      const created = await prisma.runHistory.create({
        data: {
          jobId: job.id,
          promptVersionId: pv.id,
          scheduledFor,
          status: "running",
          outputText: null,
          outputPreview: null,
          errorMessage: null,
          isPreview: false,
          runnerId: opts.runnerId ?? null,
          deliveredAt: null,
          deliveryAttempts: 0,
          deliveryLastError: null,
        },
        select: { id: true },
      });
      runHistoryId = created.id;
    } catch (err) {
      const isUnique =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "P2002";
      if (!isUnique) {
        throw err;
      }

      let nextRunAt: Date;
      try {
        nextRunAt = computeNextRunAt(
          {
            scheduleType: job.scheduleType,
            scheduleTime: job.scheduleTime,
            scheduleDayOfWeek: job.scheduleDayOfWeek,
            scheduleCron: job.scheduleCron,
          },
          new Date(),
        );
      } catch {
        nextRunAt = new Date(Date.now() + 10 * 60 * 1000);
      }

      await prisma.job.updateMany({ where: { id: job.id, lockedAt: lock.lockedAt }, data: { lockedAt: null, nextRunAt } });
      result.processed++;
      result.duplicates++;
      continue;
    }

    let output = "";
    let error: unknown;
    try {
      await enforceDailyRunLimit(job.userId);
      const llm = await runPromptWithRetry(renderedPrompt, job.allowWebSearch);
      output = llm.output;

      await prisma.runHistory.update({
        where: { id: runHistoryId },
        data: {
          outputText: output,
          outputPreview: truncate(output, OUTPUT_PREVIEW_MAX),
        },
      });

      const delivery = await deliverWithRetryAndReceipts(runHistoryId, toRunnableChannel(job), title, output);
      if (delivery.lastError) {
        throw new Error(delivery.lastError);
      }

      await prisma.runHistory.update({
        where: { id: runHistoryId },
        data: {
          deliveredAt: new Date(),
          deliveryAttempts: delivery.attempts,
          deliveryLastError: null,
        },
      });
    } catch (err) {
      error = err;
    }

    let nextRunAt: Date;
    try {
      nextRunAt = computeNextRunAt(
        {
          scheduleType: job.scheduleType,
          scheduleTime: job.scheduleTime,
          scheduleDayOfWeek: job.scheduleDayOfWeek,
          scheduleCron: job.scheduleCron,
        },
        new Date(),
      );
    } catch (scheduleErr) {
      nextRunAt = new Date(Date.now() + 10 * 60 * 1000);
      error = new Error(`Schedule calculation error: ${scheduleErr instanceof Error ? scheduleErr.message : String(scheduleErr)}`);
    }

    if (!error) {
      const finished = await prisma.$transaction(async (tx) => {
        const updated = await tx.job.updateMany({
          where: { id: job.id, lockedAt: lock.lockedAt },
          data: { lockedAt: null, failCount: 0, nextRunAt },
        });
        if (updated.count !== 1) {
          return { updated: false as const };
        }
        await tx.runHistory.update({
          where: { id: runHistoryId },
          data: {
            status: "success",
            errorMessage: null,
          },
        });
        return { updated: true as const };
      });
      result.processed++;
      if (finished.updated) {
        result.success++;
      } else {
        result.fail++;
      }
      continue;
    }

    const errorMessage = truncate(error instanceof Error ? error.message : String(error), ERROR_MAX);
    const quotaBlocked = errorMessage.startsWith("Daily run limit exceeded");

    const finished = await prisma.$transaction(async (tx) => {
      const base = { updated: false, disabled: false, quotaBlocked: false };

      if (quotaBlocked) {
        const updated = await tx.job.updateMany({ where: { id: job.id, lockedAt: lock.lockedAt }, data: { lockedAt: null, nextRunAt } });
        if (updated.count !== 1) {
          return base;
        }
        await tx.runHistory.update({
          where: { id: runHistoryId },
          data: {
            status: "fail",
            errorMessage,
          },
        });
        return { updated: true, disabled: false, quotaBlocked: true };
      }

      const nextFailCount = job.failCount + 1;
      const disable = nextFailCount >= MAX_FAILS_BEFORE_DISABLE;
      const updated = await tx.job.updateMany({
        where: { id: job.id, lockedAt: lock.lockedAt },
        data: {
          lockedAt: null,
          failCount: nextFailCount,
          enabled: disable ? false : undefined,
          nextRunAt,
        },
      });
      if (updated.count !== 1) {
        return base;
      }
      await tx.runHistory.update({
        where: { id: runHistoryId },
        data: {
          status: "fail",
          errorMessage,
        },
      });
      return { updated: true, disabled: disable, quotaBlocked: false };
    });
    result.processed++;
    if (finished.updated) {
      result.fail++;
      if (finished.quotaBlocked) {
        result.quotaBlocked++;
      }
      if (finished.disabled) {
        result.disabled++;
      }
    } else {
      result.fail++;
    }
  }
}
