import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { DEFAULT_LLM_MODEL, DEFAULT_WEB_SEARCH_MODE } from "@/lib/llm-defaults";
import { CronExpressionParser } from "cron-parser";

export type ProposedSchedule =
  | {
      scheduleType: "daily";
      scheduleTime: string;
      scheduleDayOfWeek: null;
      scheduleCron: null;
      human: string;
    }
  | {
      scheduleType: "weekly";
      scheduleTime: string;
      scheduleDayOfWeek: number;
      scheduleCron: null;
      human: string;
    }
  | {
      scheduleType: "cron";
      scheduleTime: "00:00";
      scheduleDayOfWeek: null;
      scheduleCron: string;
      human: string;
    };

export type PlanClarification = {
  key: "schedule";
  question: string;
};

function normalizeTimeMatch(match: { hour: number; minute: number; ampm: string | null }): string | null {
  let hour = match.hour;
  const minute = match.minute;
  const ampm = match.ampm?.toLowerCase() ?? null;

  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "am") {
      hour = hour === 12 ? 0 : hour;
    } else if (ampm === "pm") {
      hour = hour === 12 ? 12 : hour + 12;
    } else {
      return null;
    }
  }

  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeIntentTextForSchedule(intentText: string): string {
  return intentText
    .replace(/everyday/gi, "every day")
    .replace(/(\d)(am|pm)([a-z])/gi, "$1$2 $3")
    .replace(/\b(a\.?m\.?|p\.?m\.?)\b/gi, (m) => m.replace(/\./g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function findTime(intentText: string): string | null {
  const normalized = normalizeIntentTextForSchedule(intentText);
  const re = /\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b/i;
  const m = normalized.match(re);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3] ? String(m[3]) : null;
  return normalizeTimeMatch({ hour, minute, ampm });
}

function parseCronFromIntent(intentText: string): string | null {
  const labeled = intentText.match(/\bcron\s*[:=]\s*([^\n;]+)/i);
  const candidate = labeled ? labeled[1].trim() : null;

  const fallback = candidate
    ? candidate
    : (() => {
        const lines = intentText.split(/\r?\n/).map((l) => l.trim());
        for (const l of lines) {
          if (!l) continue;
          const parts = l.split(/\s+/);
          if (parts.length === 5 && parts.every((p) => /^[0-9*/\-,]+$/.test(p))) {
            return l;
          }
        }
        return null;
      })();

  if (!fallback) return null;

  try {
    CronExpressionParser.parse(fallback);
    return fallback;
  } catch {
    return null;
  }
}

function findWeeklyDay(intentText: string): number | null {
  const lower = intentText.toLowerCase();
  const days: Array<[string[], number]> = [
    [["sunday", "sun"], 0],
    [["monday", "mon"], 1],
    [["tuesday", "tue", "tues"], 2],
    [["wednesday", "wed"], 3],
    [["thursday", "thu", "thur", "thurs"], 4],
    [["friday", "fri"], 5],
    [["saturday", "sat"], 6],
  ];
  for (const [names, dow] of days) {
    for (const n of names) {
      if (lower.includes(n)) return dow;
    }
  }
  return null;
}

export function proposeSchedule(intentText: string): { schedule: ProposedSchedule | null; clarifications: PlanClarification[] } {
  const normalizedIntentText = normalizeIntentTextForSchedule(intentText);
  const cron = parseCronFromIntent(intentText);
  if (cron) {
    return {
      schedule: {
        scheduleType: "cron",
        scheduleTime: "00:00",
        scheduleDayOfWeek: null,
        scheduleCron: cron,
        human: `cron ${cron}`,
      },
      clarifications: [],
    };
  }

  const time = findTime(normalizedIntentText);
  const weeklyDay = findWeeklyDay(normalizedIntentText);
  const lower = normalizedIntentText.toLowerCase();
  const weekdays = lower.includes("weekday") || lower.includes("weekdays");
  const weekends = lower.includes("weekend") || lower.includes("weekends");
  const everyMinutes = lower.match(/\bevery\s+(\d{1,2})\s+minutes?\b/);
  const hourly = lower.includes("every hour") || lower.includes("hourly");
  const isDaily = lower.includes("every day") || lower.includes("daily");
  const isWeekly = weeklyDay != null || lower.includes("weekly");

  if (everyMinutes) {
    const n = Number(everyMinutes[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 59) {
      const cronExpr = `*/${n} * * * *`;
      return {
        schedule: {
          scheduleType: "cron",
          scheduleTime: "00:00",
          scheduleDayOfWeek: null,
          scheduleCron: cronExpr,
          human: `every ${n} minutes`,
        },
        clarifications: [],
      };
    }
  }

  if (hourly) {
    const minute = time ? Number(time.split(":")[1] || 0) : 0;
    const cronExpr = `${minute} * * * *`;
    return {
      schedule: {
        scheduleType: "cron",
        scheduleTime: "00:00",
        scheduleDayOfWeek: null,
        scheduleCron: cronExpr,
        human: `hourly at :${String(minute).padStart(2, "0")}`,
      },
      clarifications: [],
    };
  }

  if ((weekdays || weekends) && time) {
    const [hh, mm] = time.split(":").map(Number);
    const dow = weekdays ? "1-5" : "0,6";
    const cronExpr = `${mm} ${hh} * * ${dow}`;
    return {
      schedule: {
        scheduleType: "cron",
        scheduleTime: "00:00",
        scheduleDayOfWeek: null,
        scheduleCron: cronExpr,
        human: `${weekdays ? "weekdays" : "weekends"} at ${time}`,
      },
      clarifications: [],
    };
  }

  if (isWeekly && weeklyDay != null && time) {
    return {
      schedule: {
        scheduleType: "weekly",
        scheduleTime: time,
        scheduleDayOfWeek: weeklyDay,
        scheduleCron: null,
        human: `weekly dow=${weeklyDay} at ${time}`,
      },
      clarifications: [],
    };
  }

  if ((isDaily || (!isWeekly && time != null)) && time) {
    return {
      schedule: {
        scheduleType: "daily",
        scheduleTime: time,
        scheduleDayOfWeek: null,
        scheduleCron: null,
        human: `daily at ${time}`,
      },
      clarifications: [],
    };
  }

  return {
    schedule: null,
    clarifications: [
      {
        key: "schedule",
        question: "I couldn't infer a schedule. Include a schedule like: 'daily 09:00', 'every Monday 09:00', or 'cron: */15 * * * *'.",
      },
    ],
  };
}

export function inferUseWebSearch(intentText: string): boolean {
  const lower = intentText.toLowerCase();
  return lower.includes("with sources") || lower.includes("use web search") || lower.includes("web search");
}

const llmOutputSchema = z.object({
  job_name: z.string().min(1).max(100),
  template: z.string().min(1).max(8000),
  suggested_variables: z.record(z.string(), z.string()).optional().default({}),
  rationale: z.string().optional().default(""),
  warnings: z.array(z.string()).optional().default([]),
});

export type PromptDraft = {
  name: string;
  template: string;
  suggestedVariables: Record<string, string>;
  rationale: string;
  warnings: string[];
  llmModel: string;
  webSearchMode: string;
};

export async function generatePromptDraftFromIntent(intentText: string): Promise<PromptDraft> {
  const system = [
    "You are a product-grade prompt author.",
    "Given a natural-language job description, write a SINGLE prompt (not a conversation) that produces the requested deliverable.",
    "Return JSON only with keys: job_name (string), template (string), suggested_variables (object string->string), rationale (string), warnings (array of strings).",
    "The template must be plain text and must not include markdown code fences.",
    "Do not invent external integrations or secrets.",
    "Prefer a structured output with short headings if it helps the deliverable.",
  ].join("\n");

  const result = await generateText({
    model: openai(DEFAULT_LLM_MODEL),
    system,
    prompt: intentText,
    timeout: 60_000,
  });

  const text = (result.text ?? "").trim();
  if (!text) {
    throw new Error("Planner LLM returned empty output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Planner LLM returned non-JSON output");
  }

  const out = llmOutputSchema.parse(parsed);
  return {
    name: out.job_name,
    template: out.template,
    suggestedVariables: out.suggested_variables,
    rationale: out.rationale,
    warnings: out.warnings,
    llmModel: DEFAULT_LLM_MODEL,
    webSearchMode: DEFAULT_WEB_SEARCH_MODE,
  };
}
