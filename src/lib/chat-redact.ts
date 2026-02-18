const DISCORD_WEBHOOK_RE = /https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g;
const TELEGRAM_BOT_TOKEN_RE = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const GENERIC_SECRET_KV_RE = /\b(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi;

function redactText(value: string): { value: string; redacted: boolean } {
  let next = value;
  next = next.replace(DISCORD_WEBHOOK_RE, "[REDACTED_DISCORD_WEBHOOK]");
  next = next.replace(TELEGRAM_BOT_TOKEN_RE, "[REDACTED_TELEGRAM_TOKEN]");
  next = next.replace(GENERIC_SECRET_KV_RE, "$1=[REDACTED]");
  return { value: next, redacted: next !== value };
}

function isSensitiveKey(key: string): boolean {
  return /webhook|token|secret|password|authorization/i.test(key);
}

function toJsonSafe(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJsonSafe(v);
    }
    return out;
  }
  return value;
}

function redactJson(value: unknown): { value: unknown; redacted: boolean } {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    let redacted = false;
    const out = value.map((v) => {
      const r = redactJson(v);
      redacted = redacted || r.redacted;
      return r.value;
    });
    return { value: out, redacted };
  }

  if (value && typeof value === "object") {
    let redacted = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string" && isSensitiveKey(k)) {
        out[k] = "[REDACTED]";
        redacted = true;
        continue;
      }

      const r = redactJson(v);
      out[k] = r.value;
      redacted = redacted || r.redacted;
    }
    return { value: out, redacted };
  }

  return { value, redacted: false };
}

export function redactMessageForStorage(message: unknown): { message: unknown; content: string; redacted: boolean } {
  const safe = toJsonSafe(message);
  const r = redactJson(safe);

  const obj = r.value && typeof r.value === "object" ? (r.value as Record<string, unknown>) : null;
  const content = obj && typeof obj.content === "string" ? obj.content : "";

  return { message: r.value, content, redacted: r.redacted };
}
