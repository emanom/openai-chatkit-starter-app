import { StartScreenPrompt } from "@openai/chatkit";

export const WORKFLOW_ID = process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "Enhancement request",
    prompt:
      "I'd like to request an enhancement. Ask me the product area, the problem, and the desired outcome. Then propose next steps.",
    icon: "sparkle",
  },
  {
    label: "Report an issue",
    prompt:
      "I need to report an issue. Please collect a concise title, steps to reproduce, expected vs actual behavior, and any relevant IDs or screenshots.",
    icon: "triangle-exclamation",
  },
  {
    label: "I need help with...",
    prompt:
      "Help me troubleshoot. Start by asking clarifying questions, then suggest the top 3 fixes with step-by-step instructions.",
    icon: "circle-question",
  },
];

export const PLACEHOLDER_INPUT = "Ask anything...";

export const GREETING = "How can I help you today?";
