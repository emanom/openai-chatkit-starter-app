import type { UserMetadata, UserMetadataKey } from "@/types/userMetadata";
import { USER_METADATA_KEYS } from "@/types/userMetadata";

const USER_METADATA_KEY_SET = new Set<UserMetadataKey>(USER_METADATA_KEYS);

export function sanitizeMetadataParamValue(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (value.includes("{{") || value.includes("}}")) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeMetadataParamKey(
  rawKey: string
): UserMetadataKey | null {
  if (!rawKey) {
    return null;
  }
  if (USER_METADATA_KEY_SET.has(rawKey as UserMetadataKey)) {
    return rawKey as UserMetadataKey;
  }
  if (rawKey.startsWith("meta.")) {
    const trimmed = rawKey.slice(5);
    if (USER_METADATA_KEY_SET.has(trimmed as UserMetadataKey)) {
      return trimmed as UserMetadataKey;
    }
    return null;
  }
  if (rawKey.startsWith("meta_")) {
    const trimmed = rawKey.slice(5);
    if (USER_METADATA_KEY_SET.has(trimmed as UserMetadataKey)) {
      return trimmed as UserMetadataKey;
    }
  }
  return null;
}

type SearchParamsLike = Pick<URLSearchParams, "toString"> | null | undefined;

export function extractUserMetadataFromQueryString(
  queryString: string | null | undefined
): UserMetadata {
  const metadata: UserMetadata = {};
  if (!queryString) {
    return metadata;
  }
  const params = new URLSearchParams(queryString);
  params.forEach((value, key) => {
    const normalizedKey = normalizeMetadataParamKey(key);
    if (!normalizedKey) {
      return;
    }
    const sanitized = sanitizeMetadataParamValue(value);
    if (sanitized) {
      metadata[normalizedKey] = sanitized;
    }
  });
  return metadata;
}

export function extractUserMetadataFromSearchParams(
  params: SearchParamsLike
): UserMetadata {
  if (!params) {
    return {};
  }
  const serialized = params.toString();
  if (!serialized) {
    return {};
  }
  return extractUserMetadataFromQueryString(serialized);
}


