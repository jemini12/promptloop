import { ChannelType, type Job } from "@prisma/client";
import { decryptString, encryptString, maskSecret } from "@/lib/crypto";

type IncomingChannel =
  | { type: "discord"; config: { webhookUrl: string } }
  | { type: "telegram"; config: { botToken: string; chatId: string } }
  | {
      type: "webhook";
      config: {
        url: string;
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        headers: string;
        payload: string;
      };
    };

type ChannelConfigDb =
  | { webhookUrlEnc: string }
  | { botTokenEnc: string; chatIdEnc: string }
  | { configEnc: string };

export function toDbChannelConfig(channel: IncomingChannel): { channelType: ChannelType; channelConfig: ChannelConfigDb } {
  if (channel.type === "discord") {
    return {
      channelType: ChannelType.discord,
      channelConfig: { webhookUrlEnc: encryptString(channel.config.webhookUrl) },
    };
  }

  if (channel.type === "webhook") {
    return {
      channelType: ChannelType.webhook,
      channelConfig: { configEnc: encryptString(JSON.stringify(channel.config)) },
    };
  }

  return {
    channelType: ChannelType.telegram,
    channelConfig: {
      botTokenEnc: encryptString(channel.config.botToken),
      chatIdEnc: encryptString(channel.config.chatId),
    },
  };
}

export function toMaskedApiJob(job: Job) {
  if (job.channelType === ChannelType.discord) {
    const raw = job.channelConfig as { webhookUrlEnc: string };
    const webhook = decryptString(raw.webhookUrlEnc);
    return {
      ...job,
      channel: {
        type: "discord" as const,
        config: { webhookUrl: maskSecret(webhook) },
      },
    };
  }

  if (job.channelType === ChannelType.webhook) {
    const raw = job.channelConfig as { configEnc: string };
    const parsed = JSON.parse(decryptString(raw.configEnc)) as {
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers: string;
      payload: string;
    };
    return {
      ...job,
      channel: {
        type: "webhook" as const,
        config: {
          url: maskSecret(parsed.url),
          method: parsed.method,
          headers: parsed.headers,
          payload: parsed.payload,
        },
      },
    };
  }

  const raw = job.channelConfig as { botTokenEnc: string; chatIdEnc: string };
  return {
    ...job,
    channel: {
      type: "telegram" as const,
      config: {
        botToken: maskSecret(decryptString(raw.botTokenEnc)),
        chatId: maskSecret(decryptString(raw.chatIdEnc)),
      },
    },
  };
}

export function toRunnableChannel(job: Job) {
  if (job.channelType === ChannelType.discord) {
    const raw = job.channelConfig as { webhookUrlEnc: string };
    return {
      type: "discord" as const,
      webhookUrl: decryptString(raw.webhookUrlEnc),
    };
  }

  if (job.channelType === ChannelType.webhook) {
    const raw = job.channelConfig as { configEnc: string };
    const parsed = JSON.parse(decryptString(raw.configEnc)) as {
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers: string;
      payload: string;
    };
    return {
      type: "webhook" as const,
      url: parsed.url,
      method: parsed.method,
      headers: parsed.headers,
      payload: parsed.payload,
    };
  }

  const raw = job.channelConfig as { botTokenEnc: string; chatIdEnc: string };
  return {
    type: "telegram" as const,
    botToken: decryptString(raw.botTokenEnc),
    chatId: decryptString(raw.chatIdEnc),
  };
}
