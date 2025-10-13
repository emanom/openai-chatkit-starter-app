import { StartScreenPrompt } from "@openai/chatkit";

export const WORKFLOW_ID = process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "Enhancement request",
    prompt: "I want to request a product enhancement: ",
    icon: "sparkle",
  },
  {
    label: "Report an issue",
    prompt: "I want to report a bug: ",
    icon: "bug",
  },
  {
    label: "I need help with...",
    prompt: "I need help with: ",
    icon: "lifesaver",
  },
];

export const PLACEHOLDER_INPUT = "Message the assistant";

export const GREETING = "How can I help you today?";
