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

- Serve ParcOS through an HTTPS reverse proxy on untrusted networks.
- Set `PARCOS_BASE_URL`, `PARCOS_COOKIE_SECURE=true`, and only set
  `PARCOS_TRUST_PROXY=true` when requests come exclusively from that proxy.
- Use a unique administrator password of at least 12 characters.
- Keep `/data` private, persistent, and backed up; it contains the SQLite
  database and member-uploaded photos.
- Do not publish `.env`, database files, backups, or invitation/reset URLs.

