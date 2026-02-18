export type PromptCompileContext = {
  nowIso?: string;
  timezone?: string;
};

const PLACEHOLDER_RE = /{{\s*([A-Za-z0-9_]+)\s*}}/g;

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTimezone(value: unknown): string {
  if (typeof value !== "string") return "UTC";
  const trimmed = value.trim();
  if (!trimmed) return "UTC";

  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return "UTC";
  }
}

function formatDateParts(now: Date, timezone: string): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return { date, time };
}

export function coerceStringVars(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k === "string" && typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

export function compilePromptTemplate(template: string, variables: Record<string, string>, ctx?: PromptCompileContext): string {
  const now = asDate(ctx?.nowIso) ?? new Date();
  const timezone = normalizeTimezone(ctx?.timezone);
  const parts = formatDateParts(now, timezone);

  const builtins: Record<string, string> = {
    now_iso: now.toISOString(),
    timezone,
    date: parts.date,
    time: parts.time,
  };

  const values: Record<string, string> = { ...builtins, ...variables };

  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? "";
    }
    return full;
  });
}
