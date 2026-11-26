# ParcOS product brief

Reconciled 26 November 2026 against application 1.4.1 and the
[full product specification](ParcOS-Full-Product-Specification.md). That
specification is the authority for product direction. Requirements below are
targets unless explicitly described as shipped. Proposed designs and open
decisions are not implemented capabilities or delivery promises.

## Product promise

ParcOS is a private-first, open-source, self-hostable operating system for
community gardens. Volunteers should understand where things are, what is
happening, what needs doing, what is growing, and what happened previously.
Coordinators should plan the food members want with credible space, timing,
seed, material and labour constraints.

The central loop is **seasonal recipes → weekly food preferences → demand →
backward harvest planning → space allocation → seeds and materials → nursery
and growing → maintenance → measured harvest → learning and sharing**.
Operational decisions follow Observe → Decide → Plan → Execute → Record.
Plans, proposed AI actions and forecast yields must remain distinct from
recorded historical facts.

## People, workspaces and privacy

Invitation-only username/password membership, recovery links, member,
coordinator and administrator roles are shipped. No mandatory email or SMS.
The separate optional public park page, explicitly published public events and
guest registration are also shipped and must be preserved. Private areas and
member data remain protected on the server, including linked records and media.

The target interface has four **manually selected** workspaces:

| Workspace | Purpose |
| --- | --- |
| Community | Conversations, recipes, personal food calendar, progress and gatherings. |
| Contributor | My work, available tasks, sessions, map/list, instructions and Quick Log. |
| Coordinator | Annual plan, crop calendar, nursery, space, yields, labour, inventory and exceptions. |
| Administration | Accounts, permissions, installation configuration, privacy, backups and health. |

Changing workspace does not grant permissions. Coordinators work across enabled
domains and retain existing invitation/recovery rights. Administrator-only
controls belong in Administration rather than personal Profile. Exact navigation
and defaults require prototype review. Each operational record should have one
canonical detail route, and task lists must expose all relevant permitted work.

## Growing food and caring for places

The target includes a reviewed species/variety/seed catalogue, cultivation
profiles with provenance and uncertainty, roughly 200 rights-cleared seasonal
recipes, weekly member choices, portions and ingredient demand. Deterministic
backward scheduling and bed assignment produce explainable drafts, unmet-demand
diagnostics and human-approved plan revisions. Quantified harvest forecasts,
actual measurements and weekly workload are core requirements.

Physical beds retain stable identity independently of geometry and cultivation.
Versioned geometry starts from existing plans or measured subsets; maps and a
list alternative both matter. Unknown usable area, dates and yields stay unknown.
Do not treat the pilot's approximate footprint as measured growing area.

Batches track direct sowing and transplant crops, nursery containers, partial
transfers/losses, successions, reviewed intercropping and rotation. Printable
labels connect physical plants to authenticated records. Preserve old bed crop
text, notes, photos, tutorials, activities and harvest text during additive,
ordered migrations; do not invent historical dates.

Enabled areas are configurable: vegetable gardens, children's garden, nursery,
coop, compost and infrastructure. Pilot names are examples, not mandatory
installation defaults. No child profiles or sensitive child records are required.

## Shared operational primitives

Tasks, events, notifications, inventory and permissions serve all domains.
Extend the shipped claim/complete flow toward multiple commitments, time
windows, instructions, dependencies and optional actual effort. Planned work,
participation commitments and recorded interventions remain distinct.

Preserve shipped event audiences, capacity, waitlists, registration, iCalendar
and sharing. Complete event-day attendance, registration windows, recurrence,
cancellation and work-session workflows incrementally. Age-group counts do not
require children's names or exact ages.

Material quantities, stock, reservations, shortages and procurement lists are
in scope. Financial/budget management, prices, payments, cost per recipe and
commercial purchasing are excluded. Coop care requires human-approved schedules,
coverage, escalation and a manual contingency before relying on notifications.

Preserve feed updates/questions/announcements, replies, photos, unread state,
moderation and optional daily push. Context links, edits, pinning, resolved
questions and moderation audit remain unfinished commitments. Education starts
with task-linked instructions; searchable knowledge and positive individual and
collective recognition follow their own design work, without rankings or pressure.

## Optional assistance

AI may draft, translate, summarize, extract proposed data and offer grounded
help to permitted members. It must never silently modify trusted state. Every
write requires explicit review, current authorization and stale/replay checks.
Keep manual translation and all non-AI workflows functional.

Use local fixtures and mocked endpoints until external processing is expressly
approved. Account identities, credentials, contact details and guest data never
enter provider context. Free text can contain personal information; provider
privacy claims and free-text policy need review. No permanent raw chat or silent
profiling. Only explicitly approved local preferences are inspectable, editable
and wipeable. Voice is a separate April 2027 experiment, not a planner dependency.

## Architecture and delivery

Retain Node.js, built-in SQLite/WAL, static mobile-first browser UI, HTTP API,
private media, one Docker image and one persistent data volume. Improve module
boundaries incrementally. Scale infrastructure only after measured need.

Each slice preserves existing data and permissions, completes FR/NL/EN,
supports phone and keyboard use, targets WCAG 2.2 AA, and passes `npm run check`.
Backups and supported migrations require regression coverage. No live OVH
changes are authorized by the specification.

See the [roadmap](roadmap.md) for proposed dependency order and the full spec
§19 for unresolved agronomy, catalogue rights, allocation, care, AI, recognition
and UX decisions. Start with small reviewed datasets and a usable seasonal
journey; do not delay production planning until every detail is settled.

Advanced drone/GIS, general-purpose private chat, continuous location tracking,
native apps, autonomous AI writes and unnecessary platform migrations remain
outside the initial delivery. Passkeys remain deferred.
