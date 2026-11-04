# Disaster Recovery Plan (draft)

## Targets

- **RPO 6 hours.** Backups run every `BACKUP_EVERY_HOURS`, default 6.
- **RTO 4 hours** to restore service from the latest backup.

## Backups

- `lib/backup.ts` copies the database, encrypts it with `BACKUP_KEY` and stores it.
- It keeps `BACKUP_KEEP_DAYS` days, and always at least 3 backups.
- Admin → Settings shows the last backup and has "Back up now". The monitor alerts when backups are stale.
- **For launch:**
  - `BACKUP_DRIVER=s3`: a bucket separate from the app's disk, in India if possible.
  - Keep `BACKUP_KEY` offline as well. Without it, no backup can be opened.
- **Photos and voice notes** live in object storage. Turn on versioning or replication on that bucket.

## Restore

1. `npm run backup:restore -- --list`
2. `npm run backup:restore -- --latest --out ./restored.db` (checks integrity and counts accounts)
3. Point `DATABASE_URL` at the restored copy and deploy. Run `npx tsx scripts/migrate.ts`, then the health check.
4. Tell members if data from the gap between backup and failure was lost.

## Other failures

| Failure | Response |
|---|---|
| Bad release | Roll back from Admin → Engineering (needs `RENDER_API_KEY`) or redeploy the previous commit on Render |
| Region outage | Restore the latest backup to a new service in another region; update DNS |
| Key loss | Restore secrets from the offline copy. Without `FIELD_KEYS`, encrypted fields can't be read |
| Third-party outage (payments, email, SMS, TURN) | Degrade gracefully: the app shows the feature as unavailable; no data is lost |

## Drill

- Restore the latest backup to a scratch service every quarter.
- Run the end-to-end suite against it.
- Record the time it took.
