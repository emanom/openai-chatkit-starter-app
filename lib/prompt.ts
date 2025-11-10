import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { stableStringify } from "./stableStringify";

const TEMPLATE_PATH = path.join(process.cwd(), "system_prompt.md");
const DEFAULT_PROMPT_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Primitive = string | number | boolean | null;

export type PromptParameters = Record<string, PromptParameterValue>;

export type PromptParameterValue =
  | Primitive
  | PromptParameters
  | (Primitive | PromptParameters)[];

type PromptCacheEntry = {
  key: string;
  prompt: string;
  expiresAt: number;
  workflowId: string;
  serializedParams: string;
};

let promptTemplatePromise: Promise<string> | null = null;
const promptCache = new Map<string, PromptCacheEntry>();

export async function loadPromptTemplate(): Promise<string> {
  if (!promptTemplatePromise) {
    promptTemplatePromise = fs.readFile(TEMPLATE_PATH, "utf8");
  }
  return promptTemplatePromise;
}

export function normalizePromptParameters(
  input: unknown
): PromptParameters {
  if (!input || typeof input !== "object") {
    return {};
  }

  const result: PromptParameters = {};
  for (const [key, value] of Object.entries(
    input as Record<string, unknown>
  )) {
    if (!key) continue;
    result[key] = normalizeValue(value);
  }
  return result;
}

function normalizeValue(value: unknown): PromptParameterValue {
  if (value === null) {
    return null;
  }
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return value as Primitive;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (type === "object") {
    return normalizePromptParameters(value);
  }
  return String(value);
}

export async function getCompiledPrompt(options: {
  workflowId: string;
  parameters: PromptParameters;
  ttlMs?: number;
}): Promise<PromptCacheEntry> {
  const ttlMs = Number.isFinite(options.ttlMs)
    ? Math.max(1_000, Number(options.ttlMs))
    : DEFAULT_PROMPT_TTL_MS;

  const serializedParams = stableStringify(options.parameters);
  const hash = crypto
    .createHash("sha256")
    .update(options.workflowId)
    .update(serializedParams)
    .digest("hex");
  const key = `pr_${hash}`;

  const cached = promptCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const template = await loadPromptTemplate();
  const prompt = renderTemplate(template, options.parameters);

  const entry: PromptCacheEntry = {
    key,
    prompt,
    expiresAt: now + ttlMs,
    workflowId: options.workflowId,
    serializedParams,
  };
  promptCache.set(key, entry);
  return entry;
}

export function getPromptByKey(
  workflowId: string,
  key: string,
  parameters?: PromptParameters
): PromptCacheEntry | null {
  const entry = promptCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.workflowId !== workflowId) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    promptCache.delete(key);
    return null;
  }
  if (parameters) {
    const serialized = stableStringify(parameters);
    if (serialized !== entry.serializedParams) {
      return null;
    }
  }
  return entry;
}

function renderTemplate(template: string, parameters: PromptParameters): string {
  return template.replace(/{{\s*([^}\s]+)\s*}}/g, (_, token: string) => {
    const value = resolveToken(parameters, token);
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "object") {
      return stringifyValue(value);
    }
    return String(value);
  });
}

function resolveToken(
  parameters: PromptParameters,
  token: string
): PromptParameterValue | undefined {
  const parts = token.split(".");
  let current: unknown = parameters;
  for (const part of parts) {
    if (
      !current ||
      typeof current !== "object" ||
      !(part in (current as Record<string, unknown>))
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as PromptParameterValue | undefined;
}

function stringifyValue(value: PromptParameterValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item)).join(", ");
  }
  return Object.entries(value)
    .map(([key, val]) => `${key}: ${stringifyValue(val)}`)
    .join(", ");
}

export function clearPromptCache(): void {
  promptCache.clear();
}

