# Changelog

## 1.2.0 - 2026-07-15

- Completed French, Dutch, and English interface support so the language badge
  always identifies the active language and navigation stays consistent.
- Added source-language and revision tracking for user-authored areas, beds,
  events, notes, activities, harvests, tutorials, and photo captions.
- Added an administrator workflow to export missing or stale translations as a
  timestamped JSON file, translate it manually with ChatGPT, and safely import
  it without overwriting newer source content.
- Localized member and public API responses, public event pages, and calendar
  exports, with safe fallback to the original source text.
- Added pull-request CI for server syntax, browser JavaScript syntax, and the
  complete automated test suite.

## 1.1.1 - 2026-07-13

- Added administrator-configurable images for welcome and sign-in screens, the
  Today dashboard, and events, with neutral fallbacks and reset controls.
- Stored configured application images in the persistent ParcOS data volume so
  they survive container upgrades.
- Fixed recent activity loading immediately after sign-in, setup, and account
  recovery.

## 1.1.0 - 2026-07-11

- Added a mobile Quick Log for work, observations, problems, harvests, and
  photos, available to every member from the main navigation.
- Added recent garden activity to Today while preserving private-area access
  controls and CSRF protection.
- Moved bed edit and camera controls into compact actions beside the bed title.
- Fixed account-invitation completion so new members return to the app root.
- Replaced Parc Parmentier-specific default imagery, names, and app metadata
  with reusable garden defaults, including French, Dutch, and English examples.
- Fixed automatic bed-code generation when the optional code field is blank.

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
