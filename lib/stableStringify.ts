/**
 * Deterministically stringify values so identical structures share the same output.
 * Supports objects, arrays, primitives, null, and undefined (treated as null).
 */
export function stableStringify(value: unknown): string {
  return stringifyInternal(value);
}

function stringifyInternal(value: unknown): string {
  if (value === null) {
    return "null";
  }

  const type = typeof value;
  if (type === "string") {
    return JSON.stringify(value);
  }
  if (type === "number") {
    return Number.isFinite(value as number)
      ? String(value)
      : JSON.stringify(null);
  }
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  if (type === "bigint") {
    return (value as bigint).toString();
  }
  if (type === "undefined" || type === "function" || type === "symbol") {
    return "null";
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stringifyInternal(item));
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v !== "function" && typeof v !== "symbol")
      .map(([k, v]) => [k, stringifyInternal(v)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const serialized = entries
      .map(([k, v]) => `${JSON.stringify(k)}:${v}`)
      .join(",");
    return `{${serialized}}`;
  }

  return JSON.stringify(String(value));
}

