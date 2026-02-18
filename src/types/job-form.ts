import { DEFAULT_LLM_MODEL, DEFAULT_WEB_SEARCH_MODE, type WebSearchMode } from "@/lib/llm-defaults";

export type JobFormState = {
  name: string;
  prompt: string;
  variables: string;
  llmModel: string;
  useWebSearch: boolean;
  webSearchMode: WebSearchMode;
  scheduleType: "daily" | "weekly" | "cron";
  time: string;
  dayOfWeek?: number;
  cron?: string;
  channel:
    | { type: "discord"; config: { webhookUrl: string } }
    | { type: "telegram"; config: { botToken: string; chatId: string } }
    | {
        type: "webhook";
        config: {
          url: string;
          method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
          headers: string;
          payload: string;
        };
      };
  enabled: boolean;
  preview: {
    loading: boolean;
    status: "idle" | "success" | "fail";
    output?: string;
    errorMessage?: string;
    executedAt?: string;
    usedWebSearch?: boolean;
    llmModel?: string | null;
    citations?: Array<{ url: string; title?: string }>;
  };
};

export const defaultJobFormState: JobFormState = {
  name: "",
  prompt: "",
  variables: "{}",
  llmModel: DEFAULT_LLM_MODEL,
  useWebSearch: false,
  webSearchMode: DEFAULT_WEB_SEARCH_MODE,
  scheduleType: "daily",
  time: "09:00",
  dayOfWeek: 1,
  cron: "",
  channel: { type: "discord", config: { webhookUrl: "" } },
  enabled: true,
  preview: { loading: false, status: "idle" },
};
