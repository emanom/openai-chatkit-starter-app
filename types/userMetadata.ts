export const USER_METADATA_KEYS = [
  "first_name",
  "last_name",
  "user_email",
  "link_url",
  "user_subscription_plan",
  "user_admin_status",
  "fyi_region",
  "practice_mgmt",
  "fyi_age",
] as const;

export type UserMetadataKey = (typeof USER_METADATA_KEYS)[number];

export type UserMetadata = Partial<Record<UserMetadataKey, string>>;

export const isUserMetadataKey = (value: string): value is UserMetadataKey =>
  USER_METADATA_KEYS.includes(value as UserMetadataKey);

