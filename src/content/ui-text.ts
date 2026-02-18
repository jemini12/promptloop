export const uiText = {
  brand: {
    name: "promptloop",
  },
  nav: {
    help: "Help",
    dashboard: "Dashboard",
    signIn: "Sign in",
    signOut: "Sign out",
  },
  landing: {
    title: "Automate recurring prompts with reliable scheduled runs.",
    description:
      "Promptloop runs your prompt on schedule, lets you validate output before saving, and delivers final messages to Discord, Telegram, or a custom webhook.",
    cta: {
      primarySignedIn: "Create Job",
      primarySignedOut: "Sign in to Create",
      secondarySignedIn: "View Dashboard",
      secondarySignedOut: "Help",
    },
    highlights: [
      "Preview before saving changes",
      "Daily, weekly, or cron schedule",
      "Discord, Telegram, or webhook delivery",
    ],
    steps: [
      {
        title: "1. Write Prompt",
        description: "Define a clear task and run preview before saving.",
      },
      {
        title: "2. Set Schedule",
        description: "Choose daily, weekly, or cron timing.",
      },
      {
        title: "3. Deliver Output",
        description: "Send final responses to Discord, Telegram, or a custom webhook automatically.",
      },
    ],
  },
  dashboard: {
    title: "Dashboard",
    description: "Manage schedules and monitor the latest run results.",
    createJob: "Create Job",
    noJobsTitle: "No jobs yet",
    noJobsDescription: "Create your first scheduled prompt to start automation.",
    actions: {
      edit: "Edit",
      history: "History",
    },
    status: {
      nextRun: "next run",
      enabled: "enabled",
      disabled: "disabled",
      lastRunAt: "last run at",
    },
    totalJobs(count: number) {
      return `${count} total job${count === 1 ? "" : "s"}`;
    },
  },
  help: {
    title: "Help",
    description: "Setup steps, channel requirements, and troubleshooting for reliable scheduled runs.",
    cta: {
      createJob: "Create Job",
      viewDashboard: "View Dashboard",
    },
    quickStart: {
      title: "Quick start",
      steps: ["Create a new job.", "Write your prompt and run preview.", "Set schedule and channel, then save."],
    },
    channelSetup: {
      title: "Channel setup",
      items: [
        "Discord: provide a webhook URL.",
        "Telegram: provide a bot token and chat ID.",
        "Custom webhook: provide a URL, HTTP method, and optional headers/payload JSON.",
      ],
    },
    customWebhook: {
      title: "Custom webhook",
      description:
        "Use Custom Webhook to integrate with any endpoint. Headers and payload are stored as JSON strings and must be valid JSON.",
      examples: {
        headers: '{"Authorization":"Bearer <token>","X-Job":"promptloop"}',
        payload: '{"content":"Hello from Promptloop"}',
      },
      notes: [
        "If your endpoint expects JSON, include a Content-Type header (often `application/json`).",
        "Use Preview with test-send enabled to validate delivery before saving.",
      ],
    },
    preview: {
      title: "Preview and test-send",
      description: "Run preview to validate output. Enable test-send to send preview output to the selected channel before saving.",
    },
    issues: {
      title: "Common issues",
      items: [
        "Unauthorized preview: sign in again and use the same host (`localhost`).",
        "Delivery error: verify Discord/Telegram/webhook configuration and ensure webhook headers/payload JSON is valid.",
        "No scheduled sends: check job is enabled and the Vercel Cron endpoint is being invoked.",
      ],
    },
  },
  signIn: {
    page: {
      title: "Sign in",
      description: "Choose a social provider to access your scheduled jobs.",
    },
    error: "Sign in failed. Please try again.",
    pending: "Preparing provider redirect...",
    providers: {
      google: {
        continue: "Continue with Google",
        redirecting: "Redirecting to Google...",
      },
      github: {
        continue: "Continue with GitHub",
        redirecting: "Redirecting to GitHub...",
      },
      discord: {
        continue: "Continue with Discord",
        redirecting: "Redirecting to Discord...",
      },
    },
  },
  jobEditor: {
    page: {
      createTitle: "Create Job",
      editTitle: "Edit Job",
      description: "Configure prompt, schedule, and channel settings. Run preview before saving.",
    },
    header: {
      jobNameLabel: "Job Name",
      jobNameDescription: "Use a name that helps you quickly identify this workflow.",
      jobNamePlaceholder: "Morning market brief",
    },
    actions: {
      title: "Actions",
      description: "Save to apply updates and keep this schedule active.",
      save: "Save Job",
      saving: "Saving...",
      delete: "Delete Job",
      deleting: "Deleting...",
      confirmDelete: "Delete this job? This cannot be undone.",
      saveError: "Failed to save job.",
      saveNetworkError: "Network error while saving job.",
      deleteError: "Failed to delete job.",
      deleteNetworkError: "Network error while deleting job.",
    },
    prompt: {
      label: "Prompt",
      description: "Describe the exact format and outcome you want from the model.",
      placeholder: "Write your prompt",
      clear: "Clear",
      useExample: "Use example",
      examplePrompt: "Summarize top AI news in 5 bullets with one contrarian insight.",
      variablesLabel: "Variables (JSON)",
      variablesHelp: "Optional. Use {{var_name}} placeholders in the prompt template.",
        writer: {
          title: "Prompt Writer",
        templateAppliedHint: "Template is applied to prompt.",
        templateNotAppliedHint: "This job uses a custom prompt. Templates will not overwrite unless you apply.",
        inputsLabel: "Inputs",
        inputsHelp: "Fill in template variables.",
        templatesLabel: "Template",
        templatesLoading: "Loading templates...",
        templatesFailed: "Failed to load templates.",
        applyTemplateNow: "Apply template",
        showTemplatePreview: "Show template preview",
        reviewLabel: "Review",
          renderedPromptLabel: "Rendered prompt",
          advancedLabel: "Advanced",
          advancedSummary: "Edit prompt",
          enhance: "Enhance",
          enhancing: "Enhancing...",
          strongerRewrite: "Allow stronger rewrite",
          enhanceFailed: "Enhancement failed.",
        },
      },
    options: {
      title: "Options",
      modelLabel: "Model",
      modelHelp: "AI Gateway model id (creator/model).",
      useWebSearch: "Use web search",
      webSearchModeLabel: "Web search mode",
      webSearchModes: {
        perplexity: "Perplexity (universal)",
        parallel: "Parallel (universal)",
      },
      keepEnabled: "Keep this job enabled after save",
    },
    schedule: {
      title: "Schedule",
      description: "Choose how often this prompt runs.",
      types: {
        daily: "Daily",
        weekly: "Weekly",
        cron: "Cron",
      },
      timePlaceholder: "09:00",
      cronPlaceholder: "0 9 * * *",
      emptyCron: "Enter a cron expression to see a readable schedule.",
      invalidCron: "Invalid cron expression",
    },
    channel: {
      title: "Channel",
      description: "Pick where completed outputs should be delivered.",
      types: {
        discord: "Discord",
        telegram: "Telegram",
        webhook: "Custom Webhook",
      },
      discordPlaceholder: "Discord Webhook URL",
      telegramBotPlaceholder: "Telegram Bot Token",
      telegramChatPlaceholder: "Telegram Chat ID",
      webhookUrlPlaceholder: "Custom Webhook URL",
      methods: {
        post: "POST",
        get: "GET",
        put: "PUT",
        patch: "PATCH",
        delete: "DELETE",
      },
      headersPlaceholder: 'Headers JSON, e.g. {"Authorization":"Bearer token","X-API-Key":"your-key"}',
      payloadPlaceholder: 'Payload JSON (optional), e.g. {"content":"hello"}',
    },
    preview: {
      title: "Preview",
      run: "Run preview",
      running: "Running...",
      testSend: "Send test message to selected channel",
      empty: "No preview yet. Run preview to validate output before saving.",
      defaultName: "Preview",
      failed: "Preview failed",
      unknownError: "Unknown error",
    },
  },
} as const;
