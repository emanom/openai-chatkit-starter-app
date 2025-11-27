import { ColorScheme, StartScreenPrompt, ThemeOption } from "@openai/chatkit";

export const WORKFLOW_ID =
  process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";
export const PROMPT_METADATA_ENDPOINT = "/api/prompt-metadata";
export const RESOLVE_TITLE_ENDPOINT = "/api/resolve-title";

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

export const GREETING = "Do you need help with any particular topic?";

export const getThemeConfig = (theme: ColorScheme): ThemeOption => ({
  color: {
    grayscale: {
      hue: 220,
      tint: 6,
      shade: theme === "dark" ? -1 : -4,
    },
    accent: {
      primary: theme === "dark" ? "#f1f5f9" : "#0f172a",
      level: 1,
    },
  },
  radius: "round",
  // Add other theme options here
  // chatkit.studio/playground to explore config options
});
