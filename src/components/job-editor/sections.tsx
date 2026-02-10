"use client";

import cronstrue from "cronstrue";
import { useState } from "react";
import { useJobForm } from "@/components/job-editor/job-form-provider";

const sectionClass = "surface-card";
const dayOptions = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeCron(expression: string) {
  if (!expression.trim()) {
    return "Enter a cron expression to see a readable schedule.";
  }

  try {
    return cronstrue.toString(expression, { throwExceptionOnParseError: true });
  } catch {
    return "Invalid cron expression";
  }
}

export function JobHeaderSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <label className="field-label" htmlFor="job-name">
        Job Name
      </label>
      <p className="field-help">Use a name that helps you quickly identify this workflow.</p>
      <input
        id="job-name"
        value={state.name}
        onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
        className="input-base mt-2"
        placeholder="Morning market brief"
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
          Prompt
        </label>
        <div className="flex items-center gap-2">
          {state.prompt ? (
            <button
              type="button"
              onClick={() => setState((prev) => ({ ...prev, prompt: "" }))}
              className="px-2 py-1 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-zinc-100 rounded-md transition-colors"
              aria-label="Clear prompt"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                prompt: "Summarize top AI news in 5 bullets with one contrarian insight.",
              }))
            }
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-100 transition-colors"
          >
            Use example
          </button>
        </div>
      </div>
      <p className="field-help">Describe the exact format and outcome you want from the model.</p>
      <textarea
        id="job-prompt"
        value={state.prompt}
        onChange={(event) => setState((prev) => ({ ...prev, prompt: event.target.value }))}
        className="input-base mt-2 h-44 resize-y"
        placeholder="Write your prompt"
      />
    </section>
  );
}

export function JobOptionsSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <h3 className="field-label">Options</h3>
      <div className="mt-3 grid gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-900">
          <input
            type="checkbox"
            checked={state.allowWebSearch}
            onChange={(event) => setState((prev) => ({ ...prev, allowWebSearch: event.target.checked }))}
          />
          Allow web search (OpenAI web search tool)
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-900">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(event) => setState((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          Keep this job enabled after save
        </label>
      </div>
    </section>
  );
}

export function JobScheduleSection() {
  const { state, setState } = useJobForm();

  return (
    <section className={sectionClass}>
      <h3 className="text-sm font-medium text-zinc-900">Schedule</h3>
      <p className="field-help">Choose how often this prompt runs.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select
          aria-label="Schedule type"
          value={state.scheduleType}
          onChange={(event) =>
            setState((prev) => ({ ...prev, scheduleType: event.target.value as "daily" | "weekly" | "cron" }))
          }
          className="input-base h-10"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="cron">Cron</option>
        </select>
        {state.scheduleType !== "cron" ? (
          <input
            type="time"
            aria-label="Schedule time"
            value={state.time}
            onChange={(event) => setState((prev) => ({ ...prev, time: event.target.value }))}
            className="input-base"
            placeholder="09:00"
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
              placeholder="0 9 * * *"
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
      <h3 className="text-sm font-medium text-zinc-900">Channel</h3>
      <p className="field-help">Pick where completed outputs should be delivered.</p>
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
        <option value="discord">Discord</option>
        <option value="telegram">Telegram</option>
        <option value="webhook">Custom Webhook</option>
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
          placeholder="Discord Webhook URL"
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
            placeholder="Telegram Bot Token"
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
            placeholder="Telegram Chat ID"
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
            placeholder="Custom Webhook URL"
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
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
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
            placeholder='Headers JSON, e.g. {"Authorization":"Bearer token","X-API-Key":"your-key"}'
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
            placeholder='Payload JSON (optional), e.g. {"content":"hello"}'
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
        name: state.name || "Preview",
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
        throw new Error(data.error ?? "Preview failed");
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
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    }
  }

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900">Preview</h3>
        <button
          type="button"
          onClick={preview}
          disabled={state.preview.loading}
          className="inline-flex items-center justify-center rounded-lg border border-transparent bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {state.preview.loading ? "Running..." : "Run preview"}
        </button>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-700">
        <input type="checkbox" checked={testSend} onChange={(event) => setTestSend(event.target.checked)} />
        Send test message to selected channel
      </label>
      <pre
        className="mt-3 min-h-24 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700"
        aria-live="polite"
      >
        {state.preview.status === "success"
          ? state.preview.output
          : state.preview.status === "fail"
            ? state.preview.errorMessage
            : "No preview yet. Run preview to validate output before saving."}
      </pre>
    </section>
  );
}
