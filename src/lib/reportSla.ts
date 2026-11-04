import { REPORT_REVIEW_HOURS } from "./constants";

const HOUR = 3600_000;

/** When a person should have looked at a report, and whether that time has passed (open reports only). */
export function reviewDue(r: { priority: string; createdAt: Date | string | number; status: string }, now = Date.now()) {
  const hours = REPORT_REVIEW_HOURS[r.priority] ?? REPORT_REVIEW_HOURS.LOW;
  const dueAt = new Date(new Date(r.createdAt).getTime() + hours * HOUR);
  const open = r.status === "OPEN";
  return { reviewHours: hours, dueAt: dueAt.toISOString(), overdue: open && dueAt.getTime() < now, hoursLeft: open ? Math.round((dueAt.getTime() - now) / HOUR) : null };
}

/** Plain words for members: "usually within 12 hours". */
export function reviewPromise(priority: string) {
  const h = REPORT_REVIEW_HOURS[priority] ?? REPORT_REVIEW_HOURS.LOW;
  return h < 48 ? `usually within ${h} hours` : `usually within ${Math.round(h / 24)} days`;
}
