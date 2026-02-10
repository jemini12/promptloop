import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { previewSchema } from "@/lib/validation";
import { runPrompt } from "@/lib/llm";
import { sendChannelMessage } from "@/lib/channel";
import { prisma } from "@/lib/prisma";
import { enforceDailyRunLimit } from "@/lib/limits";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceDailyRunLimit(userId);
    const payload = previewSchema.parse(await request.json());

    const result = await runPrompt(payload.prompt, payload.allowWebSearch);
    const title = `[${payload.name}] ${format(new Date(), "yyyy-MM-dd HH:mm")}`;

    if (payload.testSend && payload.channel) {
      if (payload.channel.type === "discord") {
        await sendChannelMessage(
          { type: "discord", webhookUrl: payload.channel.config.webhookUrl },
          title,
          result.output,
        );
      } else if (payload.channel.type === "telegram") {
        await sendChannelMessage(
          {
            type: "telegram",
            botToken: payload.channel.config.botToken,
            chatId: payload.channel.config.chatId,
          },
          title,
          result.output,
        );
      } else {
        await sendChannelMessage(
          {
            type: "webhook",
            url: payload.channel.config.url,
            method: payload.channel.config.method,
            headers: payload.channel.config.headers,
            payload: payload.channel.config.payload,
          },
          title,
          result.output,
        );
      }
    }

    await prisma.previewEvent.create({ data: { userId } });

    return NextResponse.json({
      status: "success",
      output: result.output,
      executedAt: new Date().toISOString(),
      usedWebSearch: payload.allowWebSearch,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
