import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Health check for the host: the app is up and the database answers. */
export async function GET() {
  try {
    await db.run(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
