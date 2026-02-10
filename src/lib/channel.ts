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

export async function sendChannelMessage(channel: SendChannelInput, title: string, body: string) {
  const text = `${title}\n\n${body}`;

  if (channel.type === "discord") {
    for (const chunk of chunkMessage(text, DISCORD_MAX)) {
      const res = await fetch(channel.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chunk }),
      });
      if (!res.ok) {
        throw new Error(`Discord webhook failed: ${res.status}`);
      }
    }
    return;
  }

  if (channel.type === "webhook") {
    const headers = channel.headers.trim() ? JSON.parse(channel.headers) : {};
    const payload = channel.payload.trim() ? JSON.parse(channel.payload) : { content: text };
    const res = await fetch(channel.url, {
      method: channel.method,
      headers: {
        "Content-Type": "application/json",
        ...(headers as Record<string, string>),
      },
      body: channel.method === "GET" ? undefined : JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Webhook failed: ${res.status}`);
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
      throw new Error(`Telegram sendMessage failed: ${res.status}`);
    }
  }
}
