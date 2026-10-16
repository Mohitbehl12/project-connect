import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { route } from "@/lib/http";
import { exportMyData } from "@/lib/privacy";
import { rateLimit } from "@/lib/ratelimit";

/** "Download my data" as a JSON file. */
export const GET = route(async ({ user }) => {
  await rateLimit(`export:${user.id}`, 5, 60 * 60_000);
  const data = await exportMyData(user);
  await audit(user.id, "privacy.export", "user", user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="project-connect-data.json"`, "cache-control": "no-store" },
  });
}, { allowSuspended: true });
