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
            findMany: (args: unknown) => Promise<
              Array<{ id: string; message: unknown; messageId: string; role: string; content: string; createdAt: Date; seq: number; messageCreatedAt: Date }>
            >;
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
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, seq: true, messageCreatedAt: true, createdAt: true, message: true, messageId: true, role: true, content: true },
    });

    const messages = rows
      .map((row) => {
        const createdAt = row.messageCreatedAt instanceof Date ? row.messageCreatedAt.toISOString() : null;
        const seq = typeof row.seq === "number" && Number.isFinite(row.seq) ? row.seq : null;

        if (row.message && typeof row.message === "object") {
          const msg = row.message as Record<string, unknown>;
          const meta = msg.metadata && typeof msg.metadata === "object" && msg.metadata !== null ? (msg.metadata as Record<string, unknown>) : {};
          return {
            ...msg,
            metadata: {
              ...meta,
              ...(createdAt ? { createdAt } : {}),
              ...(seq != null ? { seq } : {}),
            },
          };
        }

        const role = row.role;
        if (role !== "system" && role !== "user" && role !== "assistant") {
          return null;
        }

        return {
          id: row.messageId,
          role,
          metadata: { ...(createdAt ? { createdAt } : {}), ...(seq != null ? { seq } : {}) },
          parts: row.content.trim() ? [{ type: "text", text: row.content }] : [],
        };
      })
      .filter((m): m is NonNullable<typeof m> => m != null);

    return Response.json({ messages });
  } catch (error) {
    return errorResponse(error);
  }
}
