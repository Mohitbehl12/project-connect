# Incident Response Plan (draft)

**Applies to:** security incidents affecting TwoFold's systems, accounts or data. Personal-data breaches also follow the [Data breach response](data-breach-response.md) plan.

## Roles (to be named by the owner)

- **Incident lead:** decides severity and coordinates the response.
- **Technical lead:** containment and fix.
- **CERT-In point of contact:** required by CERT-In Directions 28 April 2022 (vi). Register the name with CERT-In.
- **Comms and legal:** messages to members and authorities.

## Steps

1. **Detect.** Signals:
   - the monitor and alerts (Admin → Engineering → Incidents; OPS_ALERT_EMAIL);
   - audit-chain failure;
   - unusual private-record views;
   - reports from members or researchers.
2. **Triage (within 1 hour).**
   - Severity: Sev1 = data exposed or service down; Sev2 = contained or partial; Sev3 = no impact.
   - Open an incident record and note the time it was noticed.
3. **Report to CERT-In within 6 hours of noticing**, for reportable types: unauthorised access, data breach or leak, compromise of systems, malicious code, attacks on servers or apps, and the other types in Annexure I of the Directions.
   - Email incident@cert-in.org.in using the format on cert-in.org.in.
   - Send what is known; follow up later.
4. **Contain.** Use whatever applies:
   - rotate secrets (session secret, FIELD_KEYS via `npm run keys:rotate`, API keys);
   - sign out all sessions (token version bump);
   - block the endpoint or IP;
   - roll back the release (Admin → Engineering).
5. **Preserve evidence.** Keep logs and the database snapshot; legal-hold affected accounts.
6. **Recover.** Fix, test (`npm test`, e2e, security suite), deploy by PR, and monitor.
7. **Review within 7 days.** Root cause, timeline, what worked and what changes. Add a regression test.

## Standing requirements

- **CERT-In (vii).** Keep ICT system logs for 180 days within India and provide them on request. **Gap:** hosting is in Singapore; move logs or hosting to an Indian region, or keep a copy in India.
- **CERT-In (i).** Synchronise clocks with NTP servers of NIC or NPL, or traceable to them. Render uses its own NTP; confirm with them or document traceability.
- **Rehearsal.** Run a drill every 6 months.
