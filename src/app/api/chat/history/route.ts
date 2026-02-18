import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  chatId: z.string().min(1).max(64),
});

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const parsed = querySchema.parse({ chatId: url.searchParams.get("chatId") ?? "" });

    const prismaAny = prisma as unknown as Record<string, unknown>;
    const prismaChat = {
      chat: prismaAny.chat as
        | {
            findFirst: (args: unknown) => Promise<{ id: string } | null>;
          }
        | undefined,
      chatMessage: prismaAny.chatMessage as
        | {
            findMany: (args: unknown) => Promise<Array<{ message: unknown }>>;
          }
        | undefined,
    };

    if (!prismaChat.chat || !prismaChat.chatMessage) {
      return Response.json({ messages: [] });
    }

    const chat = await prismaChat.chat.findFirst({
      where: { id: parsed.chatId, userId },
      select: { id: true },
    });

    if (!chat) {
      return Response.json({ messages: [] });
    }

    const rows = await prismaChat.chatMessage.findMany({
      where: { chatId: parsed.chatId },
      orderBy: { createdAt: "asc" },
      select: { message: true },
    });

    return Response.json({ messages: rows.map((r: { message: unknown }) => r.message) });
  } catch (error) {
    return errorResponse(error);
  }
}
