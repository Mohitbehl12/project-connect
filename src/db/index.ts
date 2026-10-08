import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pcClient?: Client };

const client =
  globalForDb.__pcClient ??
  createClient({
    url: process.env.DATABASE_URL ?? "file:./data/dev.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__pcClient = client;

export const db = drizzle(client, { schema });
export { schema };
