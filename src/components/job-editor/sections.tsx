"use client";

import cronstrue from "cronstrue";
import { useEffect, useRef, useState } from "react";
import { useJobForm } from "@/components/job-editor/job-form-provider";
import { Button } from "@/components/ui/button";
import { uiText } from "@/content/ui-text";

const sectionClass = "surface-card";
const dayOptions = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeCron(expression: string) {
  if (!expression.trim()) {
    return uiText.jobEditor.schedule.emptyCron;
  }

  try {
    return cronstrue.toString(expression, { throwExceptionOnParseError: true });
  } catch {
    return uiText.jobEditor.schedule.invalidCron;
  }
}

export function JobHeaderSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <label className="field-label" htmlFor="job-name">
        {uiText.jobEditor.header.jobNameLabel}
      </label>
      <p className="field-help">{uiText.jobEditor.header.jobNameDescription}</p>
      <input
        id="job-name"
        value={state.name}
        onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
        className="input-base mt-2"
        placeholder={uiText.jobEditor.header.jobNamePlaceholder}
      />
    </section>
  );
}

export function JobPromptSection() {
  const { state, setState } = useJobForm();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [allowStrongerRewrite, setAllowStrongerRewrite] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  async function enhance() {
    if (!state.prompt.trim()) return;
    setEnhancing(true);
    setEnhanceError(null);
    try {
      const response = await fetch("/api/prompt-writer/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: state.prompt, allowStrongerRewrite }),
      });

      const data = (await response.json()) as {
        improvedTemplate?: string;
        suggestedVariables?: unknown;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? uiText.jobEditor.prompt.writer.enhanceFailed);
      }

      const improved = typeof data.improvedTemplate === "string" ? data.improvedTemplate : "";
      if (!improved.trim()) {
        throw new Error(uiText.jobEditor.prompt.writer.enhanceFailed);
      }

      setState((prev) => ({
        ...prev,
        prompt: improved,
        variables: prev.variables,
      }));
    } catch (error) {
      setEnhanceError(error instanceof Error ? error.message : uiText.jobEditor.prompt.writer.enhanceFailed);
    } finally {
      setEnhancing(false);
    }
  }

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between">
        <label className="field-label" htmlFor="job-prompt">
          {uiText.jobEditor.prompt.label}
        </label>
      </div>
      <p className="field-help">{uiText.jobEditor.prompt.description}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={allowStrongerRewrite}
              onChange={(event) => setAllowStrongerRewrite(event.target.checked)}
              disabled={enhancing}
            />
            <span>{uiText.jobEditor.prompt.writer.strongerRewrite}</span>
          </label>
          <Button
            type="button"
            onClick={enhance}
            variant="secondary"
            size="sm"
            className="shadow-sm"
            loading={enhancing}
            disabled={enhancing || !state.prompt.trim()}
          >
            {enhancing ? uiText.jobEditor.prompt.writer.enhancing : uiText.jobEditor.prompt.writer.enhance}
          </Button>
        </div>
        {enhanceError ? <p className="mt-2 text-xs text-red-600">{enhanceError}</p> : null}

        <details
          className="mt-4 rounded-lg border border-zinc-200 bg-white p-3"
          open={advancedOpen}
          onToggle={(event) => {
            setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open);
          }}
        >
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">
            {uiText.jobEditor.prompt.writer.advancedSummary}
          </summary>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-700">{uiText.jobEditor.prompt.writer.advancedLabel}</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setState((prev) => ({ ...prev, prompt: "" }))}
                  variant="ghost"
                  size="sm"
                  className="text-zinc-500 hover:text-red-600"
                >
                  {uiText.jobEditor.prompt.clear}
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      prompt: uiText.jobEditor.prompt.examplePrompt,
                    }))
                  }
                  variant="secondary"
                  size="sm"
                  className="shadow-sm"
                >
                  {uiText.jobEditor.prompt.useExample}
                </Button>
              </div>
            </div>
            <textarea
              id="job-prompt"
              value={state.prompt}
              onChange={(event) => setState((prev) => ({ ...prev, prompt: event.target.value }))}
              className="input-base mt-2 h-44 resize-y"
              placeholder={uiText.jobEditor.prompt.placeholder}
            />
          </div>
        </details>
      </div>
    </section>
  );
}

export function JobOptionsSection() {
  const { state, setState } = useJobForm();

  const [models, setModels] = useState<Array<{ id: string; name: string }> | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      setModelsLoading(true);
      try {
        const response = await fetch("/api/models", { method: "GET" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as unknown;
        const listRaw =
          data && typeof data === "object" && data !== null && "models" in data
            ? (data as { models?: unknown }).models
            : [];
        const list = Array.isArray(listRaw)
          ? listRaw
              .map((m) => {
                if (!m || typeof m !== "object") return null;
                const id = (m as { id?: unknown }).id;
                const name = (m as { name?: unknown }).name;
                if (typeof id !== "string" || !id.trim()) return null;
                return { id, name: typeof name === "string" && name.trim() ? name : id };
              })
              .filter((m): m is { id: string; name: string } => Boolean(m))
          : [];
        if (!cancelled) {
          setModels(list);
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    }

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const modelOptions = (() => {
    if (!models || models.length === 0) return null;
    const hasCurrent = models.some((m) => m.id === state.llmModel);
    return hasCurrent ? models : [{ id: state.llmModel, name: state.llmModel }, ...models];
  })();

  return (
    <section className={sectionClass}>
      <h3 className="field-label">{uiText.jobEditor.options.title}</h3>
      <div className="mt-3 grid gap-2">
        <label className="text-xs text-zinc-600" htmlFor="job-llm-model">
          {uiText.jobEditor.options.modelLabel}
        </label>
        {modelOptions ? (
          <select
            id="job-llm-model"
            value={state.llmModel}
            onChange={(event) => setState((prev) => ({ ...prev, llmModel: event.target.value }))}
            className="input-base h-10"
            disabled={modelsLoading}
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="job-llm-model"
            value={state.llmModel}
            onChange={(event) => setState((prev) => ({ ...prev, llmModel: event.target.value }))}
            className="input-base h-10"
            placeholder="openai/gpt-5-mini"
          />
        )}
        <p className="text-xs text-zinc-500">{uiText.jobEditor.options.modelHelp}</p>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-900">
          <input
            type="checkbox"
            checked={state.useWebSearch}
            onChange={(event) => setState((prev) => ({ ...prev, useWebSearch: event.target.checked }))}
          />
          {uiText.jobEditor.options.useWebSearch}
        </label>
        {state.useWebSearch ? <p className="text-xs text-zinc-500">{uiText.jobEditor.options.webSearchNativeHelp}</p> : null}
        <label className="inline-flex items-center gap-2 text-sm text-zinc-900">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(event) => setState((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          {uiText.jobEditor.options.keepEnabled}
        </label>
      </div>
    </section>
  );
}

export function JobScheduleSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <h3 className="text-sm font-medium text-zinc-900">{uiText.jobEditor.schedule.title}</h3>
      <p className="field-help">{uiText.jobEditor.schedule.description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select
          aria-label="Schedule type"
          value={state.scheduleType}
          onChange={(event) =>
            setState((prev) => ({ ...prev, scheduleType: event.target.value as "daily" | "weekly" | "cron" }))
          }
          className="input-base h-10"
        >
          <option value="daily">{uiText.jobEditor.schedule.types.daily}</option>
          <option value="weekly">{uiText.jobEditor.schedule.types.weekly}</option>
          <option value="cron">{uiText.jobEditor.schedule.types.cron}</option>
        </select>
        {state.scheduleType !== "cron" ? (
          <input
            type="time"
            aria-label="Schedule time"
            value={state.time}
            onChange={(event) => setState((prev) => ({ ...prev, time: event.target.value }))}
            className="input-base"
            placeholder={uiText.jobEditor.schedule.timePlaceholder}
          />
        ) : null}
        {state.scheduleType === "weekly" ? (
          <select
            aria-label="Weekly day"
            value={state.dayOfWeek ?? 1}
            onChange={(event) => setState((prev) => ({ ...prev, dayOfWeek: Number(event.target.value) }))}
            className="input-base h-10"
          >
            {dayOptions.map((label, index) => (
              <option key={label} value={index} className="h-10">
                {label}
              </option>
            ))}
          </select>
        ) : state.scheduleType === "cron" ? (
          <div className="sm:col-span-2">
            <input
              aria-label="Cron expression"
              value={state.cron ?? ""}
              onChange={(event) => setState((prev) => ({ ...prev, cron: event.target.value }))}
              className="input-base"
              placeholder={uiText.jobEditor.schedule.cronPlaceholder}
            />
            <p className="mt-2 text-xs text-zinc-500">{describeCron(state.cron ?? "")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function JobChannelSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <h3 className="text-sm font-medium text-zinc-900">{uiText.jobEditor.channel.title}</h3>
      <p className="field-help">{uiText.jobEditor.channel.description}</p>
      <select
        aria-label="Delivery channel"
        value={state.channel.type}
        onChange={(event) => {
          if (event.target.value === "discord") {
            setState((prev) => ({ ...prev, channel: { type: "discord", config: { webhookUrl: "" } } }));
            return;
          }
          if (event.target.value === "webhook") {
            setState((prev) => ({
              ...prev,
              channel: {
                type: "webhook",
                config: { url: "", method: "POST", headers: "", payload: "" },
              },
            }));
            return;
          }
          setState((prev) => ({ ...prev, channel: { type: "telegram", config: { botToken: "", chatId: "" } } }));
        }}
        className="input-base mt-2 h-10"
      >
        <option value="discord">{uiText.jobEditor.channel.types.discord}</option>
        <option value="telegram">{uiText.jobEditor.channel.types.telegram}</option>
        <option value="webhook">{uiText.jobEditor.channel.types.webhook}</option>
      </select>

      {state.channel.type === "discord" ? (
        <input
          aria-label="Discord webhook URL"
          value={state.channel.config.webhookUrl}
          onChange={(event) =>
            setState((prev) => ({
              ...prev,
              channel: { type: "discord", config: { webhookUrl: event.target.value } },
            }))
          }
          className="input-base mt-3"
          placeholder={uiText.jobEditor.channel.discordPlaceholder}
        />
      ) : state.channel.type === "telegram" ? (
        <div className="mt-3 grid gap-2">
          <input
            aria-label="Telegram bot token"
            value={state.channel.config.botToken}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                channel: {
                  type: "telegram",
                  config: {
                    botToken: event.target.value,
                    chatId: prev.channel.type === "telegram" ? prev.channel.config.chatId : "",
                  },
                },
              }))
            }
            className="input-base"
            placeholder={uiText.jobEditor.channel.telegramBotPlaceholder}
          />
          <input
            aria-label="Telegram chat ID"
            value={state.channel.config.chatId}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                channel: {
                  type: "telegram",
                  config: {
                    botToken: prev.channel.type === "telegram" ? prev.channel.config.botToken : "",
                    chatId: event.target.value,
                  },
                },
              }))
            }
            className="input-base"
            placeholder={uiText.jobEditor.channel.telegramChatPlaceholder}
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <input
            aria-label="Webhook URL"
            value={state.channel.config.url}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                channel: {
                  type: "webhook",
                  config: {
                    ...(prev.channel.type === "webhook"
                      ? prev.channel.config
                      : { method: "POST", headers: "", payload: "" }),
                    url: event.target.value,
                  },
                },
              }))
            }
            className="input-base"
            placeholder={uiText.jobEditor.channel.webhookUrlPlaceholder}
          />
          <select
            aria-label="Webhook method"
            value={state.channel.config.method}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                channel: {
                  type: "webhook",
                  config: {
                    ...(prev.channel.type === "webhook"
                      ? prev.channel.config
                      : { url: "", headers: "", payload: "" }),
                    method: event.target.value as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
                  },
                },
              }))
            }
            className="input-base h-10"
          >
            <option value="POST">{uiText.jobEditor.channel.methods.post}</option>
            <option value="GET">{uiText.jobEditor.channel.methods.get}</option>
            <option value="PUT">{uiText.jobEditor.channel.methods.put}</option>
            <option value="PATCH">{uiText.jobEditor.channel.methods.patch}</option>
            <option value="DELETE">{uiText.jobEditor.channel.methods.delete}</option>
          </select>
          <textarea
            aria-label="Webhook headers JSON"
            value={state.channel.config.headers}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                channel: {
                  type: "webhook",
                  config: {
                    ...(prev.channel.type === "webhook"
                      ? prev.channel.config
                      : { url: "", method: "POST", payload: "" }),
                    headers: event.target.value,
                  },
                },
              }))
            }
            className="input-base h-24"
            placeholder={uiText.jobEditor.channel.headersPlaceholder}
          />
          <textarea
            aria-label="Webhook payload JSON"
            value={state.channel.config.payload}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                channel: {
                  type: "webhook",
                  config: {
                    ...(prev.channel.type === "webhook"
                      ? prev.channel.config
                      : { url: "", method: "POST", headers: "" }),
                    payload: event.target.value,
                  },
                },
              }))
            }
            className="input-base h-28"
            placeholder={uiText.jobEditor.channel.payloadPlaceholder}
          />
        </div>
      )}
    </section>
  );
}

export function JobPreviewSection() {
  const { state, setState } = useJobForm();
  const [testSend, setTestSend] = useState(false);
  const [runAsScheduled, setRunAsScheduled] = useState(false);
  const [runAt, setRunAt] = useState("");
  const [timezone, setTimezone] = useState("");

  const previewAbortRef = useRef<AbortController | null>(null);
  const previewSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort();
    };
  }, []);

  const previewDisabled = state.preview.loading || !state.prompt.trim();

  async function preview() {
    const seq = ++previewSeqRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    setState((prev) => ({ ...prev, preview: { ...prev.preview, loading: true, status: "idle" } }));
    try {
      const payload: {
        name: string;
        template: string;
        variables: string;
        useWebSearch: boolean;
        llmModel: string;
        webSearchMode: "native";
        testSend: boolean;
        nowIso?: string;
        timezone?: string;
        channel?: typeof state.channel;
      } = {
        name: state.name || uiText.jobEditor.preview.defaultName,
        template: state.prompt,
        variables: state.variables,
        useWebSearch: state.useWebSearch,
        llmModel: state.llmModel,
        webSearchMode: "native",
        testSend,
      };

      if (runAsScheduled && runAt) {
        const date = new Date(runAt);
        if (!Number.isNaN(date.getTime())) {
          payload.nowIso = date.toISOString();
        }
      }
      if (runAsScheduled && timezone.trim()) {
        payload.timezone = timezone.trim();
      }

      if (testSend) {
        payload.channel = state.channel;
      }

      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (seq !== previewSeqRef.current) {
        return;
      }

      const data = (await response.json()) as {
        output?: string;
        error?: string;
        executedAt?: string;
        usedWebSearch?: boolean;
        llmModel?: string | null;
        citations?: Array<{ url?: unknown; title?: unknown }>;
      };
      if (!response.ok) {
        throw new Error(data.error ?? uiText.jobEditor.preview.failed);
      }

      const citations = Array.isArray(data.citations)
        ? data.citations.reduce(
            (acc, c) => {
              const url = typeof c?.url === "string" ? c.url : "";
              if (!url) return acc;
              const title = typeof c?.title === "string" && c.title.trim() ? c.title : undefined;
              acc.push(title ? { url, title } : { url });
              return acc;
            },
            [] as Array<{ url: string; title?: string }>,
          )
        : [];

      setState((prev) => ({
        ...prev,
        preview: {
          loading: false,
          status: "success",
          output: data.output,
          executedAt: data.executedAt,
          usedWebSearch: data.usedWebSearch,
          llmModel: data.llmModel ?? null,
          citations,
        },
      }));
    } catch (error) {
      if (seq !== previewSeqRef.current) {
        return;
      }
      if (error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError") {
        return;
      }
      setState((prev) => ({
        ...prev,
        preview: {
          loading: false,
          status: "fail",
          errorMessage: error instanceof Error ? error.message : uiText.jobEditor.preview.unknownError,
        },
      }));
    } finally {
      if (seq === previewSeqRef.current && previewAbortRef.current === controller) {
        previewAbortRef.current = null;
      }
    }
  }

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900">{uiText.jobEditor.preview.title}</h3>
        <Button
          type="button"
          onClick={preview}
          variant="primary"
          size="sm"
          loading={state.preview.loading}
          className="shadow-sm"
          disabled={previewDisabled}
        >
          {state.preview.loading ? uiText.jobEditor.preview.running : uiText.jobEditor.preview.run}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-zinc-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={testSend} onChange={(event) => setTestSend(event.target.checked)} />
          <span>{uiText.jobEditor.preview.testSend}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={runAsScheduled} onChange={(event) => setRunAsScheduled(event.target.checked)} />
          <span>Run as scheduled</span>
        </label>
        {runAsScheduled ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="datetime-local"
              value={runAt}
              onChange={(event) => setRunAt(event.target.value)}
              className="input-base"
              aria-label="Run time"
            />
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="input-base"
              placeholder="Timezone (optional)"
              aria-label="Timezone"
            />
          </div>
        ) : null}
      </div>
      <pre
        className="mt-3 min-h-24 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700"
        aria-live="polite"
      >
        {state.preview.status === "success"
          ? state.preview.output
          : state.preview.status === "fail"
            ? state.preview.errorMessage
            : uiText.jobEditor.preview.empty}
      </pre>
      {state.preview.status === "success" ? (
        <div className="mt-2 text-xs text-zinc-600">
          <p>
            {state.preview.executedAt ? `Executed: ${state.preview.executedAt}` : null}
            {state.preview.llmModel ? ` · Model: ${state.preview.llmModel}` : null}
            {typeof state.preview.usedWebSearch === "boolean"
              ? state.preview.usedWebSearch
                ? " · Web search: on"
                : state.useWebSearch
                  ? " · Web search: skipped"
                  : " · Web search: off"
              : null}
          </p>
          {state.preview.citations && state.preview.citations.length ? (
            <div className="mt-2">
              <p className="font-medium text-zinc-800">Sources</p>
              <ul className="mt-1 space-y-0.5">
                {state.preview.citations.slice(0, 5).map((c) => (
                  <li key={c.url}>
                    <a
                      className="underline decoration-zinc-300 underline-offset-2"
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.title && c.title.trim() ? c.title : c.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
