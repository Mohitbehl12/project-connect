# Running on more than one server

Today the app runs on one Render server with the database and photos on its disk. That's right for
launch and comfortably handles thousands of members. When you need more, move to several servers behind
Render's load balancer. The code is ready for that; it needs three services in place of the disk.

| Today (one server) | Several servers | Setting |
| --- | --- | --- |
| SQLite file on the disk | A shared libSQL database (Turso, or `sqld` on your own server) | `DATABASE_URL=libsql://…`, `DATABASE_AUTH_TOKEN` |
| Photos on the disk | Object storage (Cloudflare R2, AWS S3, Backblaze B2) | `STORAGE_DRIVER=s3` + the `S3_*` settings |
| Chat signals, typing, calls, rate limits in memory | Redis (Render Key Value, Upstash, or your own) | `REDIS_URL=redis://…` |

## What Redis does here

- **Chat:** the conversation's version number is stored in Redis, and every change is broadcast to all servers.
  A phone waiting on server A hears about a message sent through server B at once.
- **Typing indicators** are broadcast the same way.
- **Calls:** ringing, the connection setup messages and "still in the call" times are kept in Redis for 2 hours,
  so the two people can be on different servers.
- **Rate limits** count across all servers. "10 tries an hour" means 10 in total, not 10 on each server.
- If Redis goes down, rate limits fall back to each server's own count rather than blocking everyone.

## Tested

`tests/multi-server.ts` was run against two servers sharing Redis, with one person on each server. It checks
typing, messages, ringing, offer and answer, hang-up, and shared rate limits: 8 checks, all passing. The full
end-to-end suite (421 checks) also passes with Redis on.

## Before you switch

- **Scheduled jobs** (billing, renewals, backups) should run once, not once per server. Set `CRON_SECRET` on one
  server only, or create a Render Cron Job that calls `/api/cron/billing`.
- **Backups:** the built-in backup copies a database *file*. With Turso, use Turso's point-in-time restore instead.
- **On-server photo checks** run on every server, so give each one the memory (`PHOTO_SCAN_LOCAL`).
- **Data move:** copy the SQLite file into Turso (`turso db create --from-file`), and copy `uploads/` to the bucket.
  Plan an hour of downtime, or ask me to write a migration script when you get there.

## Rough capacity

One Render Standard server (2 GB) handles a few thousand people online at once. Long-polling chat holds one open
request per open chat. Beyond that, add servers. Each one adds roughly the same capacity once the three services
above are in place.
