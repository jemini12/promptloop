"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JobFormProvider, useJobForm } from "@/components/job-editor/job-form-provider";
import {
  JobChannelSection,
  JobHeaderSection,
  JobOptionsSection,
  JobPreviewSection,
  JobPromptSection,
  JobScheduleSection,
} from "@/components/job-editor/sections";
import { uiText } from "@/content/ui-text";
import type { JobFormState } from "@/types/job-form";

function getSaveValidationMessage(state: JobFormState): string | null {
  if (!state.name.trim()) {
    return "Job name is required.";
  }
  if (!state.prompt.trim()) {
    return "Prompt is required.";
  }

  if (state.scheduleType !== "cron" && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(state.time)) {
    return "Schedule time must be in HH:mm format.";
  }

  if (state.scheduleType === "cron" && !state.cron?.trim()) {
    return "Cron expression is required.";
  }

  if (state.channel.type === "discord") {
    if (!state.channel.config.webhookUrl.trim()) {
      return "Discord webhook URL is required.";
    }
    return null;
  }

  if (state.channel.type === "telegram") {
    if (!state.channel.config.botToken.trim() || !state.channel.config.chatId.trim()) {
      return "Telegram bot token and chat ID are required.";
    }
    return null;
  }

  if (!state.channel.config.url.trim()) {
    return "Webhook URL is required.";
  }

  if (state.channel.config.headers.trim()) {
    try {
      JSON.parse(state.channel.config.headers);
    } catch {
      return "Webhook headers must be valid JSON.";
    }
  }

  if (state.channel.config.payload.trim()) {
    try {
      JSON.parse(state.channel.config.payload);
    } catch {
      return "Webhook payload must be valid JSON.";
    }
  }

  return null;
}

function JobActionsSection({ jobId }: { jobId?: string }) {
  const { state } = useJobForm();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validationMessage = getSaveValidationMessage(state);
  const canSave = !validationMessage && !saving && !deleting;

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      name: state.name,
      prompt: state.prompt,
      allowWebSearch: state.allowWebSearch,
      scheduleType: state.scheduleType,
      scheduleTime: state.scheduleType === "cron" ? "00:00" : state.time,
      scheduleDayOfWeek: state.dayOfWeek,
      scheduleCron: state.cron,
      channel: state.channel,
      enabled: state.enabled,
    };

    const endpoint = jobId ? `/api/jobs/${jobId}` : "/api/jobs";
    const method = jobId ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? uiText.jobEditor.actions.saveError);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(uiText.jobEditor.actions.saveNetworkError);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!jobId) {
      return;
    }

    const confirmed = window.confirm(uiText.jobEditor.actions.confirmDelete);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!response.ok) {
        setError(uiText.jobEditor.actions.deleteError);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(uiText.jobEditor.actions.deleteNetworkError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="surface-card">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-zinc-900">{uiText.jobEditor.actions.title}</h3>
        <p className="mt-1 text-xs text-zinc-500">{uiText.jobEditor.actions.description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center justify-center rounded-lg border border-transparent bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          disabled={!canSave}
        >
          {saving ? uiText.jobEditor.actions.saving : uiText.jobEditor.actions.save}
        </button>
        {jobId ? (
          <button
            type="button"
            onClick={remove}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            disabled={saving || deleting}
          >
            {deleting ? uiText.jobEditor.actions.deleting : uiText.jobEditor.actions.delete}
          </button>
        ) : null}
      </div>
      {validationMessage ? <p className="mt-3 text-xs text-zinc-500">{validationMessage}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-600" role="alert">{error}</p> : null}
    </section>
  );
}

function JobEditorBody({ jobId }: { jobId?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-10">
      <section className="surface-card bg-zinc-50/70">
        <h1 className="text-xl font-semibold text-zinc-900">{jobId ? uiText.jobEditor.page.editTitle : uiText.jobEditor.page.createTitle}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {uiText.jobEditor.page.description}
        </p>
      </section>
      <JobHeaderSection />
      <JobPromptSection />
      <JobOptionsSection />
      <JobPreviewSection />
      <JobScheduleSection />
      <JobChannelSection />
      <JobActionsSection jobId={jobId} />
    </div>
  );
}

export function JobEditorPage({ initialState, jobId }: { initialState?: Partial<JobFormState>; jobId?: string }) {
  return (
    <JobFormProvider initialState={initialState}>
      <JobEditorBody jobId={jobId} />
    </JobFormProvider>
  );
}
