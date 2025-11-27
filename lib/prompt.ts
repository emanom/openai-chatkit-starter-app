import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { stableStringify } from "./stableStringify";

const TEMPLATE_PATH = path.join(process.cwd(), "system_prompt.md");
const DEFAULT_PROMPT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_REGEX = /{{\s*([^}]+?)\s*}}/g;

type Primitive = string | number | boolean | null;

export interface PromptParameters {
  [key: string]: PromptParameterValue;
}

export type PromptParameterValue =
  | Primitive
  | PromptParameters
  | Array<Primitive | PromptParameters>;

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
    // Only allow arrays of primitives or objects; flatten/serialize nested arrays
    const mapped = value.map((item) => normalizeValue(item));
    const normalized: Array<Primitive | PromptParameters> = mapped.map(
      (v) => (Array.isArray(v) ? String(v) : (v as Primitive | PromptParameters))
    );
    return normalized;
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

type ParsedToken = {
  path: string;
  defaultValue?: string;
};

function renderTemplate(template: string, parameters: PromptParameters): string {
  return template.replace(TOKEN_REGEX, (_, rawToken: string) => {
    const parsed = parseToken(rawToken);
    if (!parsed) {
      return "";
    }
    const value = resolveToken(parameters, parsed.path);
    const resolved =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
        ? parsed.defaultValue
        : value;
    if (resolved === undefined || resolved === null) {
      return "";
    }
    if (typeof resolved === "object") {
      return stringifyValue(resolved as PromptParameterValue);
    }
    return String(resolved);
  });
}

function parseToken(rawToken: string): ParsedToken | null {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return null;
  }
  const [pathPart, ...modifierParts] = trimmed.split("|");
  const path = pathPart.trim();
  if (!path) {
    return null;
  }
  let defaultValue: string | undefined;
  for (const part of modifierParts) {
    const normalized = part.trim();
    if (normalized.startsWith("default:")) {
      const rawDefault = normalized.slice("default:".length).trim();
      defaultValue = parseDefaultValue(rawDefault);
    }
  }
  return { path, defaultValue };
}

function parseDefaultValue(rawValue: string): string {
  if (!rawValue) {
    return "";
  }
  const firstChar = rawValue[0];
  if ((firstChar === '"' || firstChar === "'") && rawValue.length > 1) {
    const closingIndex = rawValue.indexOf(firstChar, 1);
    if (closingIndex > 0) {
      return rawValue.slice(1, closingIndex);
    }
  }
  return rawValue;
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

