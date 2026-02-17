import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    await requireUserId();

    const templates = await prisma.promptWriterTemplate.findMany({
      orderBy: { name: "asc" },
      select: {
        key: true,
        name: true,
        description: true,
        template: true,
        defaultVariables: true,
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    return errorResponse(error, 401);
  }
}
