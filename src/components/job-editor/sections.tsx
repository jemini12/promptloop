"use client";

import cronstrue from "cronstrue";
import { useState } from "react";
import { useJobForm } from "@/components/job-editor/job-form-provider";
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

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between">
        <label className="field-label" htmlFor="job-prompt">
          {uiText.jobEditor.prompt.label}
        </label>
        <div className="flex items-center gap-2">
          {state.prompt ? (
            <button
              type="button"
              onClick={() => setState((prev) => ({ ...prev, prompt: "" }))}
              className="px-2 py-1 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-zinc-100 rounded-md transition-colors"
              aria-label="Clear prompt"
            >
              {uiText.jobEditor.prompt.clear}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                prompt: uiText.jobEditor.prompt.examplePrompt,
              }))
            }
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-100 transition-colors"
          >
            {uiText.jobEditor.prompt.useExample}
          </button>
        </div>
      </div>
      <p className="field-help">{uiText.jobEditor.prompt.description}</p>
      <textarea
        id="job-prompt"
        value={state.prompt}
        onChange={(event) => setState((prev) => ({ ...prev, prompt: event.target.value }))}
        className="input-base mt-2 h-44 resize-y"
        placeholder={uiText.jobEditor.prompt.placeholder}
      />
    </section>
  );
}

export function JobOptionsSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <h3 className="field-label">{uiText.jobEditor.options.title}</h3>
      <div className="mt-3 grid gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-900">
          <input
            type="checkbox"
            checked={state.allowWebSearch}
            onChange={(event) => setState((prev) => ({ ...prev, allowWebSearch: event.target.checked }))}
          />
          {uiText.jobEditor.options.allowWebSearch}
        </label>
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

  async function preview() {
    setState((prev) => ({ ...prev, preview: { ...prev.preview, loading: true, status: "idle" } }));
    try {
      const payload: {
        name: string;
        prompt: string;
        allowWebSearch: boolean;
        testSend: boolean;
        channel?: typeof state.channel;
      } = {
        name: state.name || uiText.jobEditor.preview.defaultName,
        prompt: state.prompt,
        allowWebSearch: state.allowWebSearch,
        testSend,
      };

      if (testSend) {
        payload.channel = state.channel;
      }

      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { output?: string; error?: string; executedAt?: string; usedWebSearch?: boolean };
      if (!response.ok) {
        throw new Error(data.error ?? uiText.jobEditor.preview.failed);
      }

      setState((prev) => ({
        ...prev,
        preview: {
          loading: false,
          status: "success",
          output: data.output,
          executedAt: data.executedAt,
          usedWebSearch: data.usedWebSearch,
        },
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        preview: {
          loading: false,
          status: "fail",
          errorMessage: error instanceof Error ? error.message : uiText.jobEditor.preview.unknownError,
        },
      }));
    }
  }

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900">{uiText.jobEditor.preview.title}</h3>
        <button
          type="button"
          onClick={preview}
          disabled={state.preview.loading}
          className="inline-flex items-center justify-center rounded-lg border border-transparent bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {state.preview.loading ? uiText.jobEditor.preview.running : uiText.jobEditor.preview.run}
        </button>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-700">
        <input type="checkbox" checked={testSend} onChange={(event) => setTestSend(event.target.checked)} />
        {uiText.jobEditor.preview.testSend}
      </label>
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
    </section>
  );
}
