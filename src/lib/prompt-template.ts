type TemplateVars = Record<string, string>;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateParts(now: Date) {
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const min = pad2(now.getMinutes());
  return { yyyy, mm, dd, hh, min };
}

export type RenderPromptInput = {
  template: string;
  vars?: TemplateVars;
  now?: Date;
  timezone?: string;
};

export function renderPromptTemplate(input: RenderPromptInput): string {
  const now = input.now ?? new Date();
  const tz = input.timezone ?? "";
  const parts = dateParts(now);

  const builtins: TemplateVars = {
    now_iso: now.toISOString(),
    date: `${parts.yyyy}-${parts.mm}-${parts.dd}`,
    time: `${parts.hh}:${parts.min}`,
    timezone: tz,
  };

  const vars: TemplateVars = { ...builtins, ...(input.vars ?? {}) };

  return input.template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return typeof value === "string" ? value : "";
  });
}
