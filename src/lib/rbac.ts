import type { Role } from "./constants";

export const PERMISSIONS = [
  "admin.access",
  "users.view", "users.moderate", "users.ban", "users.verify",
  "reports.view", "reports.resolve",
  "messages.view_reported",
  "analytics.view",
  "config.edit",
  "plans.edit",
  "legal.edit", "legal.publish",
  "audit.view",
  "roles.assign",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Role → permission map. Kept in code for reviewability; move to DB if roles must be edited at runtime.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER: [],
  SUPPORT: ["admin.access", "users.view", "reports.view"],
  MODERATOR: ["admin.access", "users.view", "users.moderate", "users.verify", "reports.view", "reports.resolve", "messages.view_reported"],
  ADMIN: ["admin.access", "users.view", "users.moderate", "users.ban", "users.verify", "reports.view", "reports.resolve",
    "messages.view_reported", "analytics.view", "config.edit", "plans.edit", "legal.edit", "audit.view"],
  SUPER_ADMIN: [...PERMISSIONS],
};

export function can(role: string, perm: Permission): boolean {
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(perm);
}
