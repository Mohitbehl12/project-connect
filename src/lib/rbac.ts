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
  "payments.view", // revenue, payment list, invoices — never card or bank details (we don't hold them)
  "payments.refund_request",
  "payments.refund_approve", // must be a different person from the requester
  "offers.edit", "coupons.edit",
  "referrals.manage",
  "security.view", // login history, risk queue
  "risk.resolve",
  "grievances.handle", // formal complaints to the Grievance Officer
  "style.view", // Kinara Style: orders, customers, designs, reports
  "style.manage", // update order status, fabric stock
  "style.measurements", // see customers' body measurements (needed to make the clothes)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Role → permission map. Kept in code for reviewability; move to DB if roles must be edited at runtime.
// Least privilege: Finance sees payments but no conversations; Support can open a refund request but
// not approve it; Moderators see reported messages but nothing about payments.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER: [],
  SUPPORT: ["admin.access", "users.view", "reports.view", "payments.refund_request", "grievances.handle", "style.view"],
  // The workshop: sees and updates clothing orders (with measurements) and fabric stock — nothing about dating.
  TAILOR: ["admin.access", "style.view", "style.manage", "style.measurements"],
  FINANCE: ["admin.access", "plans.edit", "payments.view", "payments.refund_request", "payments.refund_approve", "offers.edit", "coupons.edit", "referrals.manage", "analytics.view"],
  SECURITY: ["admin.access", "users.view", "security.view", "risk.resolve", "referrals.manage", "audit.view"],
  MODERATOR: ["admin.access", "users.view", "users.moderate", "users.verify", "reports.view", "reports.resolve", "messages.view_reported", "grievances.handle"],
  ADMIN: ["admin.access", "users.view", "users.moderate", "users.ban", "users.verify", "reports.view", "reports.resolve",
    "messages.view_reported", "analytics.view", "config.edit", "plans.edit", "legal.edit", "audit.view",
    "payments.view", "payments.refund_request", "offers.edit", "coupons.edit", "referrals.manage", "security.view", "risk.resolve", "grievances.handle", "style.view", "style.manage", "style.measurements"],
  SUPER_ADMIN: [...PERMISSIONS],
};

export function can(role: string, perm: Permission): boolean {
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(perm);
}
