# ParcOS database structure and admin import workflow

This file describes the production data shape used by ParcOS and the CSV workflow admins can use for launch testing.

## Core tables

| Table | Purpose | Key fields |
| --- | --- | --- |
| `members` | Member, coordinator, and admin accounts. | `username`, `display_name`, `role`, `preferred_locale`, `bio`, `avatar_path` |
| `garden_areas` | Managed areas or gardens. | `name`, `slug`, `code_prefix`, `description`, `location_hint`, `members_can_access` |
| `beds` | Individual beds inside an area. | `area_id`, `code`, `display_number`, `garden`, `section`, `crop`, `variety`, `status`, `note`, `harvest_note` |
| `events` | Member, coordinator, or public events. | `title`, `description`, `location`, `event_type`, `state`, `audience`, `starts_at`, `ends_at`, `capacity` |
| `tasks` | Daily work connected to an area, bed, event, or no location. | `title`, `description`, `status`, `priority`, `due_at`, location foreign keys, claim/completion fields |
| `feed_posts` | Private garden-wide member updates, questions, announcements, and optional photos. | `post_type`, `body`, `image_path`, `image_content_type`, `author_id`, timestamps |
| `feed_replies` | One-level discussions attached to feed posts. | `post_id`, `body`, `author_id`, timestamps |
| `feed_read_state` | Per-member point used to calculate private feed unread counts. | `member_id`, `last_read_at`, `updated_at` |
| `notification_preferences` | Per-member daily summary choices and delivery cursor. | `member_id`, `enabled`, `delivery_time`, `time_zone`, category flags, digest timestamps |
| `push_subscriptions` | Private browser/device Web Push endpoints and encryption keys. | `member_id`, `endpoint`, `p256dh`, `auth`, `expiration_time`, timestamps |
| `event_registrations` | Member event attendance. | `event_id`, `member_id`, participant counts, `status` |
| `public_event_registrations` | Non-member attendance for public event links. | `event_id`, `guest_name`, `guest_contact`, participant counts, `status` |
| `invites` | Member invite links. | `token_hash`, `role`, `created_by`, `expires_at`, `used_at` |
| `access_resets` | Recovery links created by coordinators/admins. | `token_hash`, `member_id`, `created_by`, `expires_at`, `used_at` |
| `schema_migrations` | Ordered record of database migrations applied at startup. | `version`, `name`, `applied_at` |

## Schema migrations

ParcOS applies pending migrations in version order when it starts. Each migration runs in a transaction and is recorded in `schema_migrations` only after it succeeds. Startup stops rather than opening a database created by a newer, unknown schema version.

The first versioned migration adds `tasks` and its indexes. The second adds the private garden feed and its replies. The third adds durable per-member feed read state. The fourth adds member notification preferences and device subscriptions. Existing installations receive these tables automatically while keeping their current members, areas, beds, events, activity, and media data.

Feed photos remain private uploaded media. They are included in complete backups and validated during restore in the same way as avatars, bed photos, and harvest photos.

Push endpoints, device encryption keys, and the installation's VAPID identity are private operational data. The VAPID private key is generated once and stored in `app_meta`; no API returns it. Complete backups preserve this identity so restored installations can continue sending to existing subscriptions.

## CSV import

Admins can import data from the profile page: **Profile -> Import data**. Coordinators and members do not see this form, and the server rejects non-admin import attempts.

Use [parcos-import-template.csv](./parcos-import-template.csv) as the starting file. Excel is supported by saving/exporting the spreadsheet as CSV before upload.

The import is all-or-nothing:

- If every row is valid, ParcOS inserts all rows.
- If any row has an error, ParcOS inserts nothing and reports the failing row numbers.
- The maximum import size is 500 rows.

## Accepted row types

Set the `entity` column to one of these values:

| entity | Required columns | Optional columns |
| --- | --- | --- |
| `area` | `name`, `codePrefix` | `description`, `locationHint`, `membersCanAccess` |
| `bed` | `areaCodePrefix` or `areaName` | `number`, `code`, `section`, `crop`, `variety`, `status`, `locationHint`, `note`, `harvestNote` |
| `event` | `title`, `location`, `startsAt`, `endsAt` | `description`, `eventType`, `state`, `audience`, `capacity`, `preparationNote`, `accessibilityNote` |
| `member` | `username`, `displayName`, `initialPassword` | `role`, `preferredLocale`, `bio` |

## Controlled values

`status` for beds: `unknown`, `ready`, `growing`, `harvest`, `clear`, `winter`.

`eventType`: `work`, `workshop`, `community`, `school`, `planning`, `milestone`.

`state`: `draft`, `published`, `cancelled`, `completed`.

`audience`: `members`, `coordinators`, `public`.

`role`: `member`, `coordinator`.

`preferredLocale`: `fr`, `nl`, `en`.

Dates must be parseable by the browser and server. ISO format is recommended, for example `2026-09-12T10:00:00+02:00`.
