// Deletes the local SQLite database file. Refuses to touch remote databases.
import "./env";
import { rmSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) {
  console.error("db:reset only works on a local file database. Refusing to reset", url);
  process.exit(1);
}
const path = url.replace(/^file:/, "");
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
rmSync("data/uploads", { recursive: true, force: true });
console.log("Removed", path);
