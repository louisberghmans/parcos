# Changelog

## 1.0.4 - 2026-07-09

- Fixed embedded YouTube tutorial playback by allowing YouTube frames with a
  strict-origin referrer policy.
- Replaced photo upload pencil/text controls with clearer camera-icon actions.

## 1.0.2 - 2026-07-06

- Added member-visible attendance names on event cards and event details.
- Added public events with non-member registration links.
- Added FR/EN language toggling for member and public event flows.
- Added admin-only CSV import with database structure documentation and a
  starter template.

## 1.0.1 - 2026-06-23

- Generate invitation, recovery, sharing, and calendar links from the actual
  request origin, including the HTTPS host forwarded by a trusted reverse proxy.
- Added authenticated member profile-picture upload and display.
- Validate avatar file signatures, cap stored avatars at 2 MiB, use unpredictable
  filenames, and keep avatar responses private to authenticated members.

## 1.0.0 - 2026-06-22

- Added one-time administrator onboarding for a park and its managed areas.
- Removed automatic demo content from production installations.
- Added authenticated member, invitation, recovery, agenda, area, bed, and
  private photo workflows.
- Hardened member-directory authorization, password changes, upload signature
  validation, proxy handling, browser headers, and container privileges.
- Added multi-architecture GHCR publishing with provenance and an SBOM.
- Released under GPL-3.0-or-later.
