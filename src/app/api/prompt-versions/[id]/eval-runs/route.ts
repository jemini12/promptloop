import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { renderPromptTemplate } from "@/lib/prompt-template";
import { runPrompt } from "@/lib/llm";

type Params = { params: Promise<{ id: string }> };

const runSchema = z.object({ suiteId: z.string().min(1).max(64) });

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.length > 0) : [];
}

function asVars(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === "string" && typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id: promptVersionId } = await params;
    const payload = runSchema.parse(await request.json());

    const pv = await prisma.promptVersion.findFirst({
      where: { id: promptVersionId },
      include: { job: { select: { id: true, userId: true } } },
    });
    if (!pv || pv.job.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const suiteClient = prisma as unknown as {
      evalSuite: { findFirst: (args: unknown) => Promise<unknown> };
      evalRun: { create: (args: unknown) => Promise<unknown> };
    };

    const suite = (await suiteClient.evalSuite.findFirst({
      where: { id: payload.suiteId, jobId: pv.job.id },
      include: { cases: { orderBy: { createdAt: "asc" } } },
    })) as
      | {
          id: string;
          cases: Array<{ id: string; variables: unknown; mustInclude: unknown }>;
        }
      | null;

    if (!suite) {
      return NextResponse.json({ error: "Suite not found" }, { status: 404 });
    }

    const now = new Date();
    const results: Array<{ caseId: string; pass: boolean; missing: string[]; outputPreview?: string; error?: string }> = [];

    for (const c of suite.cases.slice(0, 10)) {
      const vars = asVars(c.variables);
      const mustInclude = asStringArray(c.mustInclude);
      const prompt = renderPromptTemplate({ template: pv.template, vars, now });

      try {
        const llm = await runPrompt(prompt, {
          model: "openai/gpt-5-mini",
          allowWebSearch: false,
          webSearchMode: "perplexity",
        });
        const out = llm.output;
        const missing = mustInclude.filter((s) => !out.includes(s));
        results.push({ caseId: c.id, pass: missing.length === 0, missing, outputPreview: out.slice(0, 1000) });
      } catch (err) {
        results.push({ caseId: c.id, pass: false, missing: mustInclude, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const status = results.every((r) => r.pass) ? "pass" : "fail";

    const run = await suiteClient.evalRun.create({
      data: {
        suiteId: suite.id,
        promptVersionId: pv.id,
        status,
        results,
      },
    });

    return NextResponse.json({ run });
  } catch (error) {
    return errorResponse(error);
  }
}
