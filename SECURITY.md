# Security policy

## Supported versions

Security fixes are provided for the latest 1.x release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not
open a public issue containing an exploit, credentials, personal data, or a live
deployment address. Include the affected version, impact, reproduction steps,
and any suggested mitigation. You should receive an acknowledgement within
seven days.

## Deployment baseline

- Use Node.js 24.22.3 or newer patched releases; the container and CI pin the
  verified 24.22.3 security release. Rebuild and deliberately deploy to update
  an existing installation; changing the repository does not update a server.
- Web Push accepts HTTPS endpoints but blocks local/private/reserved addresses,
  including DNS answers at socket connection time. Custom public push services
  remain supported; internal push services are intentionally blocked. Each send
  has a 10-second socket timeout. Existing subscriptions are rechecked on send.
- Restore enforces a configurable expanded archive limit; see
  [backup and restore](docs/backup-and-restore.md). Treat backups as sensitive,
  trusted administrative input and validate them in an isolated directory.
- Serve ParcOS through an HTTPS reverse proxy on untrusted networks.
- Set `PARCOS_COOKIE_SECURE=true`, and only set `PARCOS_TRUST_PROXY=true` when
  requests come exclusively from that proxy. Trusted proxy headers determine
  the public origin used in generated links.
- Use a unique administrator password of at least 12 characters.
- Keep `/data` private, persistent, and backed up; it contains the SQLite
  database, member-uploaded photos, Web Push endpoints, and the installation's
  VAPID private key.
- Do not publish `.env`, database files, backups, or invitation/reset URLs.
