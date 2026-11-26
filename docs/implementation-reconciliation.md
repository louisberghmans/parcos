# Specification reconciliation and first delivery

26 November 2026 · baseline `b5cfb1e` / ParcOS 1.4.1 · branch
`feature/spec-foundation`. This report describes repository work and local
synthetic validation, not the live OVH installation. The owner-supplied full
specification is preserved unchanged.

## Problem and user outcome

The repository still described a feed-first roadmap and pinned Node 24.17.0.
Home task groups counted all tasks but silently rendered only six, leaving
later available or assigned work unreachable from that board.

Each assigned, urgent and available group now has independent six-card pages,
a visible range, previous/next controls and keyboard focus restoration. A
volunteer can reach and claim later work. Paging clamps safely when the final
task on a page is claimed or completed. No workspace redesign is claimed.

## Implementation and security

- Runtime/CI/container baseline is Node 24.22.3, verified against the official
  release index and [security release notes](https://nodejs.org/en/blog/release/v24.22.3).
  The portable Windows archive matched official SHA-256 checksums; the Alpine
  image digest was fetched from the official Docker registry manifest.
- `npm audit --json` reported zero advisories across the locked production
  dependencies. No speculative major dependency upgrade was made. CI/release
  now check npm advisories at moderate severity and above.
- Web Push no longer connects to private/local/reserved destinations. Direct
  addresses are validated on registration and again on delivery, including old
  subscriptions. DNS validation happens in the HTTPS agent's socket lookup,
  avoiding a separate check/connect DNS race. Mixed private/public answers are
  rejected; custom public providers remain possible. Socket timeout: 10 seconds.
- Restore limits decompressed bytes (10 GiB default, explicit CLI override),
  checks declared entry sizes before writing, limits the manifest to 16 MiB and
  limits archive entries to 100,000. Failed validation preserves the target.
- Request-origin precedence was reviewed: forwarded headers are trusted only
  under the existing explicit proxy setting; the base URL is a documented
  fallback. Existing tested proxy behavior is preserved. The reverse proxy must
  reject unapproved hosts and strip/replace forwarded headers.
- Task paging is a small browser module using the existing authorized task API.
  It does not change task permissions or expose additional private records.
  The service-worker shell includes the new module and has a new cache version.

## Data and migrations

No schema migration or reinterpretation of existing records is introduced.
Existing migrations 1–4, backup format, IDs, media, translations, VAPID identity,
subscriptions and preferences are retained. Restore limits are operator-visible
and documented; installations above the entry/manifest limits need a reviewed
limit change before recovery. Always retain a compatible pre-upgrade backup.

The next agricultural slice must add ordered migrations, keep legacy crop,
variety/status and free-text harvests readable, and avoid inventing dates or
agronomic quantities. Geometry must remain independent of stable bed identity.
Batch compatibility and the eventual authoritative crop summary need explicit
contracts before replacing old fields. New tables must be covered by historical
fixture upgrade, fresh-install/restart and full restore tests.

## Verified tests and browser validation

- Baseline `npm run check`: 7 tests passed on Node 24.22.3.
- Updated `npm run check`: 13 tests passed, including existing authentication,
  roles/CSRF/private areas, events, translations, notifications, migration and
  backup round-trip tests. New coverage checks private-address aliases, DNS
  mixed answers, restored subscriptions, rejected restore limits with intact
  target data, oversize manifests/entries, and task-page boundaries/localization.
- `git diff --check`: passed.
- Disposable synthetic Edge browser checks: 320 × 740 and 1280 × 900, keyboard
  Enter paging, focus restoration, independent group pages, final-page claim,
  range clamping, FR/NL/EN using the actual language switcher, no horizontal
  overflow and no JavaScript page errors. Mobile/desktop task screenshots were
  inspected. The synthetic database and browser were closed and removed.

Demo: create more than six tasks in a group; Home → Next actions → Next.
Visit the last page and claim its final task; the group remains on a valid page.
Switch language using the top-bar control and repeat with the keyboard.

No real screen-reader or outdoor device study was performed; automated focus,
labels and touch sizing are evidence for this slice, not WCAG certification.
No live push-provider delivery, external AI call or production deployment was
performed. Container build/smoke verification remains blocked: Docker Desktop
was initially stopped, and the local startup attempt returned an engine API 500
error. Only the official image manifest/digest was verified. npm audit does not
cover Alpine packages or prove absence of all CVEs. Build and smoke-test the
container in CI before releasing; no release number, tag, merge or deployment
was made by this work.

## Baseline drift and remaining product gaps

The specification's 1.4.1 baseline matches HEAD: existing tasks/feed/PWA/push,
translations, private/public event separation and migrations are present.
The canonical docs were stale: they still deferred shipped public registration,
future-planned shipped feed releases, limited cultivation history and treated
maps as optional. The brief/roadmap now point to the full specification and
preserve shipped history plus unfinished event-day and knowledge commitments.

Four workspaces, canonical detail routes, admin/profile separation, seasonal
prototypes, species/variety/supplier data, physical metadata/map history, batches,
recipes/weekly choices, demand/planning, inventory, labour commitments and AI are
not implemented by this delivery. Current bed crop fields and task single-claim/
single-location constraints remain. No missing scope is treated as cancelled.

## Files changed

- Runtime/security: `Dockerfile`, `package.json`, `package-lock.json`,
  `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `server.mjs`,
  `src/services/push-notifications.mjs`, `src/services/push-network.mjs`,
  `backup.mjs`, `restore.mjs`.
- Task UI: `public/app.js`, `public/app/tasks/task-group.js`,
  `public/styles.css`, `public/sw.js`.
- Tests: `tests/push-network.test.mjs`, `tests/notifications.test.mjs`,
  `tests/backup-restore.test.mjs`, `tests/task-group.test.mjs`.
- Documentation: `agents.md`, `README.md`, `SECURITY.md`, `CHANGELOG.md`,
  `docs/backup-and-restore.md`, `docs/product-brief.md`, `docs/roadmap.md`,
  `docs/database-structure-and-import-workflow.md`,
  and this report. The supplied specification remains a separate input file.

## Next logical issue

Prototype explicit Community/Contributor/Coordinator/Administration journeys
with seasonal planning placeholders and a canonical task detail route; review
mobile/desktop flows before freezing navigation. In parallel, define the first
additive crop/batch/physical-bed migration and small synthetic planning fixture.
Keep actual agronomy, data rights and allocation policies in the specification's
D01–D14 decision register until evidence or owner decisions resolve them.
