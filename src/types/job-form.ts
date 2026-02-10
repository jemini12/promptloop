export type JobFormState = {
  name: string;
  prompt: string;
  allowWebSearch: boolean;
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
  };
};

export const defaultJobFormState: JobFormState = {
  name: "",
  prompt: "",
  allowWebSearch: false,
  scheduleType: "daily",
  time: "09:00",
  dayOfWeek: 1,
  cron: "",
  channel: { type: "discord", config: { webhookUrl: "" } },
  enabled: true,
  preview: { loading: false, status: "idle" },
};
