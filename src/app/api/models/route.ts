import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";

type GatewayModel = {
  id: string;
  name?: string;
  type?: string;
  context_window?: number;
  max_tokens?: number;
  tags?: string[];
};

let cached:
  | {
      expiresAt: number;
      models: Array<{ id: string; name: string; contextWindow: number | null; maxTokens: number | null; tags: string[] }>;
    }
  | null = null;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

export async function GET() {
  try {
    await requireUserId();

    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ models: cached.models });
    }

    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = (await response.json().catch(() => null)) as unknown;
    const list =
      data && typeof data === "object" && data !== null && "data" in data && Array.isArray((data as { data?: unknown }).data)
        ? ((data as { data: unknown[] }).data as GatewayModel[])
        : [];

    const models = list
      .filter((m) => m && typeof m.id === "string" && m.id.trim() && (m.type == null || m.type === "language"))
      .map((m) => ({
        id: m.id,
        name: typeof m.name === "string" && m.name.trim() ? m.name : m.id,
        contextWindow: typeof m.context_window === "number" ? m.context_window : null,
        maxTokens: typeof m.max_tokens === "number" ? m.max_tokens : null,
        tags: asStringArray(m.tags),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!response.ok) {
      return NextResponse.json({ models: [] }, { status: response.status });
    }

    cached = {
      expiresAt: now + 10 * 60 * 1000,
      models,
    };

    return NextResponse.json({ models });
  } catch (error) {
    return errorResponse(error);
  }
}
