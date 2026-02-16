type SendChannelInput =
  | { type: "discord"; webhookUrl: string }
  | { type: "telegram"; botToken: string; chatId: string }
  | {
      type: "webhook";
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers: string;
      payload: string;
    };

export type ChannelCitation = { url: string; title?: string };

type SendChannelOptions = {
  citations?: ChannelCitation[];
  usedWebSearch?: boolean;
  meta?: Record<string, unknown>;
};

export class ChannelRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChannelRequestError";
    this.status = status;
  }
}

const DISCORD_MAX = 1900;
const TELEGRAM_MAX = 4000;

function chunkMessage(text: string, max: number) {
  const chunks: string[] = [];
  let value = text;
  while (value.length > max) {
    chunks.push(value.slice(0, max));
    value = value.slice(max);
  }
  if (value.length) {
    chunks.push(value);
  }
  return chunks;
}

export async function sendChannelMessage(channel: SendChannelInput, title: string, body: string, opts?: SendChannelOptions) {
  const citations = (opts?.citations ?? []).filter((c) => c && typeof c.url === "string" && c.url.length > 0);
  const meta = opts?.meta && typeof opts.meta === "object" && opts.meta !== null && !Array.isArray(opts.meta) ? opts.meta : undefined;
  const sources = citations.length
    ? `\n\nSources:\n${citations
        .slice(0, 5)
        .map((c) => (c.title ? `- ${c.title}: ${c.url}` : `- ${c.url}`))
        .join("\n")}`
    : "";

  const text = `${title}\n\n${body}${sources}`;

  if (channel.type === "discord") {
    for (const chunk of chunkMessage(text, DISCORD_MAX)) {
      const res = await fetch(channel.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chunk }),
      });
      if (!res.ok) {
        throw new ChannelRequestError(`Discord webhook failed: ${res.status}`, res.status);
      }
    }
    return;
  }

  if (channel.type === "webhook") {
    const headers = channel.headers.trim() ? JSON.parse(channel.headers) : {};
    const payload = channel.payload.trim()
      ? JSON.parse(channel.payload)
      : { title, body, content: text, usedWebSearch: opts?.usedWebSearch ?? false, citations, meta };
    const res = await fetch(channel.url, {
      method: channel.method,
      headers: {
        "Content-Type": "application/json",
        ...(headers as Record<string, string>),
      },
      body: channel.method === "GET" ? undefined : JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new ChannelRequestError(`Webhook failed: ${res.status}`, res.status);
    }
    return;
  }

  const url = `https://api.telegram.org/bot${channel.botToken}/sendMessage`;
  for (const chunk of chunkMessage(text, TELEGRAM_MAX)) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channel.chatId, text: chunk }),
    });
    if (!res.ok) {
      throw new ChannelRequestError(`Telegram sendMessage failed: ${res.status}`, res.status);
    }
  }
}
