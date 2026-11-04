import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, can } from "../../src/lib/rbac";

describe("least-privilege staff roles", () => {
  it("Compliance handles legal, complaints, holds and audit — never money, moderation or private messages", () => {
    for (const p of ["legal.edit", "legal.publish", "legal.holds", "grievances.handle", "audit.view"] as const) expect(can("COMPLIANCE", p), p).toBe(true);
    for (const p of ["payments.view", "payments.refund_approve", "reports.resolve", "messages.view_reported", "users.ban", "users.moderate", "config.edit", "roles.assign"] as const)
      expect(can("COMPLIANCE", p), p).toBe(false);
  });
  it("Technical runs the system — never member records, payments or reports", () => {
    for (const p of ["ops.view", "ops.manage", "security.view"] as const) expect(can("TECHNICAL", p), p).toBe(true);
    for (const p of ["users.view", "payments.view", "reports.view", "messages.view_reported", "legal.edit", "config.edit", "roles.assign"] as const)
      expect(can("TECHNICAL", p), p).toBe(false);
  });
  it("moderators can still place legal holds; members and advertisers have nothing", () => {
    expect(can("MODERATOR", "legal.holds")).toBe(true);
    expect(ROLE_PERMISSIONS.USER).toEqual([]);
    expect(ROLE_PERMISSIONS.ADVERTISER).toEqual([]);
  });
});
