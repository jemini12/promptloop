"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function getOrCreateChatId(storageKey: string): string {
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing && existing.trim()) return existing;
  } catch {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  try {
    window.localStorage.setItem(storageKey, next);
  } catch {
    return next;
  }
  return next;
}

function renderPart(part: unknown, key: string) {
  if (part && typeof part === "object" && "type" in part && (part as { type?: unknown }).type === "text") {
    const text = "text" in part && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "";
    return (
      <div key={key} className="whitespace-pre-wrap">
        {text}
      </div>
    );
  }

  if (part && typeof part === "object" && "type" in part && typeof (part as { type?: unknown }).type === "string") {
    const type = (part as { type: string }).type;
    if (!type.startsWith("tool-")) return null;

    const toolName = type.slice("tool-".length);
    const title = "title" in part && typeof (part as { title?: unknown }).title === "string" ? (part as { title: string }).title : undefined;
    const errorText = "errorText" in part && typeof (part as { errorText?: unknown }).errorText === "string" ? (part as { errorText: string }).errorText : undefined;
    const output = "output" in part ? (part as { output?: unknown }).output : undefined;

    const jobId =
      output && typeof output === "object" && output !== null && "jobId" in output
        ? (output as { jobId?: unknown }).jobId
        : null;
    const editUrl = typeof jobId === "string" && jobId.trim() ? `/jobs/${jobId}/edit` : null;

    const outputText =
      output == null
        ? ""
        : typeof output === "string"
          ? output
          : (() => {
              try {
                return JSON.stringify(output, null, 2);
              } catch {
                return String(output);
              }
            })();

    const baseClass =
      errorText && errorText.trim()
        ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        : editUrl
          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          : "rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700";

    return (
      <div key={key} className={baseClass}>
        <div className="font-medium">{title?.trim() ? title : toolName}</div>
        {errorText ? <div className="mt-1">{errorText}</div> : null}
        {!editUrl && outputText.trim() ? (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-white/70 px-3 py-2 text-[11px] leading-4 text-zinc-800">
            {outputText}
          </pre>
        ) : null}
        {editUrl ? (
          <div className="mt-1">
            <Link className="underline underline-offset-2" href={editUrl}>
              Open job editor
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

export function JobBuilderChatClient() {
  const [chatId, setChatId] = useState<string>(() => getOrCreateChatId("promptloop.job-builder.chatId"));
  const lastLoadedChatId = useRef<string | null>(null);

  const transport = useMemo(() => {
    return new DefaultChatTransport<UIMessage>({
      api: "/api/chat",
      body: { chatId, persist: true },
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (response.status === 401) {
          window.location.assign(`/signin?callbackUrl=${encodeURIComponent("/chat")}`);
          throw new Error("Unauthorized");
        }
        if (!response.ok) {
          let message = `Request failed (${response.status})`;
          try {
            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
              const data = (await response.json()) as unknown;
              if (data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string") {
                message = (data as { error: string }).error;
              }
            } else {
              const text = await response.text();
              if (text.trim()) message = text;
            }
          } catch {
            message = `Request failed (${response.status})`;
          }
          throw new Error(message);
        }
        return response;
      },
    });
  }, [chatId]);

  const {
    messages,
    setMessages,
    status,
    error,
    stop,
    sendMessage,
    regenerate,
  } = useChat({
    id: chatId,
    transport,
  });

  const typedMessages = messages as UIMessage[];
  const [input, setInput] = useState("");

  function readParts(value: unknown): unknown[] | null {
    if (!value || typeof value !== "object") return null;
    const parts = (value as { parts?: unknown }).parts;
    return Array.isArray(parts) ? parts : null;
  }

  const canSend = status === "ready" && !!input.trim();

  const loadHistory = useCallback(
    async (nextChatId: string) => {
      try {
        const response = await fetch(`/api/chat/history?chatId=${encodeURIComponent(nextChatId)}`);
        if (response.status === 401) {
          const next = `/signin?callbackUrl=${encodeURIComponent("/chat")}`;
          window.location.assign(next);
          return;
        }
        const data = (await response.json()) as unknown;
        if (!response.ok) return;
        const list =
          data && typeof data === "object" && data !== null && "messages" in data
            ? (data as { messages?: unknown }).messages
            : null;
        if (!Array.isArray(list)) return;

        const parsed: UIMessage[] = [];
        for (const raw of list) {
          if (!raw || typeof raw !== "object") continue;
          const r = raw as { id?: unknown; role?: unknown; content?: unknown; parts?: unknown };
          if (typeof r.id !== "string" || typeof r.role !== "string" || typeof r.content !== "string") continue;
          if (r.role !== "system" && r.role !== "user" && r.role !== "assistant" && r.role !== "data") continue;
          const parts = Array.isArray(r.parts) ? r.parts : [];
          parsed.push({ id: r.id, role: r.role, content: r.content, parts } as unknown as UIMessage);
        }

        setMessages(parsed);
      } catch {
        return;
      }
    },
    [setMessages],
  );

  useEffect(() => {
    if (lastLoadedChatId.current === chatId) return;
    lastLoadedChatId.current = chatId;
    loadHistory(chatId);
  }, [chatId, loadHistory]);

  function newChat() {
    const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    try {
      window.localStorage.setItem("promptloop.job-builder.chatId", next);
    } catch {
      setChatId(next);
      return;
    }
    setMessages([]);
    setChatId(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    if (!text) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Job Builder</h1>
          <p className="mt-1 text-sm text-zinc-600">Chat to create a new scheduled job. The assistant will create it when ready.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={newChat}
            className="text-sm text-zinc-600 hover:text-zinc-900"
            disabled={status === "streaming" || status === "submitted"}
          >
            New chat
          </button>
          <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900">
            Dashboard
          </Link>
        </div>
      </div>

      <section className="surface-card mt-6">
        <div className="space-y-4">
          {typedMessages.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Start with something like: Every weekday 9am, send a brief project status summary to Discord.
            </p>
          ) : null}

            {typedMessages.map((m: { id: string; role: string; parts?: unknown }) => (
              <div key={m.id} className="text-sm text-zinc-900">
                <div className="mb-1 text-xs font-medium text-zinc-500">{m.role}</div>
                <div className="space-y-2">
                  {readParts(m)?.map((part, i) => renderPart(part, `${m.id}-${i}`))}
                </div>
              </div>
            ))}
          </div>
        </section>

      {error ? <p className="mt-3 text-sm text-red-600">{error.message}</p> : null}

      {(status === "submitted" || status === "streaming") && (
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={() => stop()}
          >
            Stop
          </button>
        </div>
      )}

      {(status === "ready" || status === "error") && typedMessages.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
            onClick={() => regenerate()}
          >
            Regenerate last response
          </button>
        </div>
      ) : null}

      <form className="mt-6 flex gap-2" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          className="input-base h-11 flex-1"
          placeholder={status === "streaming" ? "Responding..." : "Type a message"}
          disabled={status !== "ready"}
        />
        <button
          type="submit"
          className="h-11 rounded-md bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSend}
        >
          Send
        </button>
      </form>
    </div>
  );
}
