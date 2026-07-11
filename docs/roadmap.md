# ParcOS roadmap

Last updated: 2026-07-11

This roadmap starts from the current 1.1.0 codebase and the MVP product brief.
It is meant to be a living planning document: concrete enough to choose the next
build, but not so detailed that every implementation choice is frozen.

## Where we stand

ParcOS is past prototype stage. The repository currently contains a private,
self-hosted 1.0.x product with:

- One-container Node and SQLite deployment through Docker Compose.
- Initial admin setup for park name and managed areas.
- Invitation-only member access without email or SMS.
- Coordinator-created recovery links for lost access.
- Role boundaries for member, coordinator, and admin.
- Mobile-first private web app with Today, Agenda, Garden, and Profile.
- Managed areas, beds, bed state, harvest notes, current cover photos, and bed
  activity history.
- Member Quick Log for work, observations, problems, harvests, and photos, with
  recent activity visible on Today.
- Event creation, editing, states, capacity, member registration, waitlist
  balancing, attendee lists for coordinators, sharing, public event pages, guest
  registration for public events, and iCalendar download.
- Member profiles, bios, language preference, and private profile photos.
- Private media serving, upload signature checks, CSRF protection, hashed
  sessions and one-time tokens, scrypt passwords, login throttling, hardening
  headers, and locked-down container defaults.
- Automated smoke coverage for the core private workflows, permissions, proxy
  origin handling, media privacy, and setup flow.

In product terms, the current app is a credible first self-hosted private
release for a real garden test. It covers the trust, access, calendar,
registration, garden state, and photo backbone. It is not yet the full operating
system described in the brief.

## Main gaps

The largest gaps are not infrastructure; they are operating workflows.

- Tasks and contributions are described in the brief but do not yet exist as
  first-class objects.
- Attendance states exist in the database model, but the coordinator attendance
  workflow is still thin.
- Plantings are represented indirectly through bed crop and variety fields, but
  there is no durable planting lifecycle.
- Quick Log now captures normal member contributions; the next product question
  is which entry types people actually use and what should be easier still.
- The Learn section, announcements, and searchable knowledge base are not built.
- Recurring event/session support is not built.
- Registration windows, cancellation notification, and attendee contact flows
  are not built.
- AI-assisted drafts and proposed structured actions are not built.
- Public/guest event surfaces now exist, but need clearer separation from
  private event operations before broader use.
- There is no visible backup/restore admin experience, only deployment docs.
- Test coverage is concentrated in smoke tests; higher-risk workflows will need
  more focused tests as the product grows.

## Roadmap principles

- Keep ParcOS private-first until member data, permissions, and operations are
  boringly reliable.
- Prefer coordinator confirmation over automation whenever garden state changes.
- Keep the mobile garden workflow fast: members should be able to understand
  "what can I do now?" without learning a management system.
- Grow the data model around real garden operations, not generic project
  management abstractions.
- Maintain the one-container deployment path until usage proves that Postgres,
  external storage, or worker processes are worth the extra operations cost.

## Architecture review

### Current shape

ParcOS is intentionally compact: one Node HTTP process, one SQLite database, one
static mobile web app, and uploaded media on the same persistent volume. This is
the right deployment shape for the first garden because it keeps operations
simple and makes backup/restore understandable.

The main architectural risk is not the deployment model. It is that product
logic, routing, data access, migrations, validation, and rendering are all
accumulating in two large files:

- `server.mjs` is about 1,800 lines and owns schema creation, migrations,
  helpers, every API route, media serving, and static serving.
- `public/app.js` is about 1,500 lines and owns state, routing, rendering,
  forms, API calls, uploads, and interaction binding.
- `tests/smoke.test.mjs` covers broad workflows well, but focused regression
  tests are thin for individual rules like waitlist promotion, media
  authorization, public/private event separation, and migrations.

### Strengths to keep

- The HTTP API is already a useful boundary for future Postgres or object
  storage work.
- SQLite plus local media is still the right default until concurrency,
  redundancy, or hosting requirements prove otherwise.
- Server-side permission checks are consistently present for private garden
  areas, member data, photos, CSRF-protected writes, and coordinator actions.
- Smoke coverage exercises the product as a real self-hosted app rather than
  only isolated functions.

### Constraints to address before larger features

- Schema changes are currently embedded as ad hoc startup logic. More tables
  for tasks, plantings, recurrences, articles, and AI proposals will need a
  versioned migration pattern.
- Route handlers are becoming hard to schedule across contributors because
  unrelated workflows share one large control flow.
- The frontend has legacy render functions and hardcoded copy mixed with a
  partial translation dictionary, which increases the cost of adding Learn,
  tasks, and attendance screens.
- Activities are promising as an audit trail, but they are bed-centered today.
  Tasks, plantings, attendance, and AI proposals need a broader activity model.
- Public event registration exists ahead of the older roadmap. The next work
  should explicitly define the public/private boundary before adding more
  public surfaces.

### Scheduling recommendation

Let field behavior drive the next build, while adding only the technical safety
needed for live data:

1. Validate Quick Log and simplify Today and bed details.
2. Add backup/export safety and a small migration convention.
3. Add simple tasks connected to real logged problems.
4. Improve attendance operations.
5. Add planting, knowledge, and automation only after the daily loop works.

## Release track

### 1.1.0: quick field logging and hardening

Goal: make recording real garden work fast enough to become a member habit,
while keeping the private release dependable for daily use.

Shipped:

- Add one global Quick Log for work, observations, problems, harvests, and
  photos, without requiring coordinator permissions.
- Show recent member activity on Today.
- Put bed edit and photo actions at the top of the bed detail.
- Fix invitation completion and remove site-specific default names and imagery.
- Add focused tests for member logging, private-area access, CSRF, and photos.

Acceptance criteria:

- A member can record normal work from any screen in under ten seconds.
- A basic entry requires only a bed and a short description; photos are optional.
- The saved entry appears on Today and in the bed journal.

### 1.1.x: field validation and live-data safety

Goal: learn from the first real logs and protect the data already being created.

Build:

- Observe which Quick Log types and fields members use or abandon.
- Remove or demote Today sections that do not help members act.
- Simplify the long bed detail into primary information and secondary sections.
- Add backup/export safety and document a tested restore path.
- Write the first explicit migration-version convention before adding tables.
- Expand translations incrementally on touched screens instead of blocking all
  product work on a complete i18n rewrite.
- Add focused tests around invitation completion and upgrades from live data.

### 1.2: tasks and daily work

Goal: turn ParcOS from a directory/calendar into the garden's daily action list.

Build:

- Add first-class tasks connected to areas, beds, events, or no location.
- Support task state: open, claimed, done, skipped, and archived.
- Let coordinators create tasks from bed screens and from Today.
- Let members claim, release, and complete available tasks.
- Record member contributions when tasks are completed.
- Show urgent work and assigned work on Today.
- Add task history into bed activity feeds.
- Add filters for "available", "mine", "urgent", and "done recently".

Acceptance criteria:

- A member can open ParcOS on a phone, choose an available task, do it, and mark
  it complete in under a minute.
- A coordinator can see what was done, by whom, where, and when.
- Completing a task leaves a durable activity record.

### 1.3: attendance and event operations

Goal: make events useful on the day itself, not just before registration.

Build:

- Add coordinator attendance controls for going, attended, no-show, and
  cancelled.
- Add quick check-in from an event attendee list.
- Add event completion flow that summarizes registrations, attendance, and notes.
- Add registration opening and closing dates.
- Add clearer waitlist promotion behavior and coordinator visibility.
- Add cancellation reason and cancellation display for members.
- Add WhatsApp-ready event and weekly summaries based on current data.

Acceptance criteria:

- A coordinator can run an event from ParcOS, mark attendance, close the event,
  and share a useful summary without exporting a spreadsheet.

### 1.4: plantings and harvest lifecycle

Goal: make bed state durable across seasons and reduce ambiguity about what is
actually growing.

Build:

- Add planting records with crop, variety, start date, optional expected harvest
  window, and end date.
- Preserve bed crop fields as the current summary, derived from active planting
  where possible.
- Add planting activities: planted, observed, watered, harvested, cleared,
  maintained, and moved.
- Add harvest guidance connected to active plantings.
- Add seasonal archive views for old plantings and bed history.
- Add simple import/export for beds and plantings if coordinators already have
  spreadsheet data.

Acceptance criteria:

- A coordinator can update the garden through seasonal changes without losing
  the historical record of what grew where.

### 1.5: knowledge and announcements

Goal: let ParcOS teach members how the specific garden works.

Build:

- Add Learn as a real navigation item.
- Add coordinator-authored articles with tags, related beds/tasks/events, and
  optional video links.
- Add announcements for time-sensitive updates.
- Show relevant knowledge from task, bed, and event screens.
- Add search across articles, beds, tasks, and events.

Acceptance criteria:

- A new member can answer common "how do we do this here?" questions from
  ParcOS without asking a coordinator every time.

### 1.6: AI-assisted coordination

Goal: use AI as drafting and structuring help while keeping ParcOS data human
confirmed.

Build:

- Draft event descriptions, preparation notes, summaries, and WhatsApp updates.
- Convert natural-language coordinator notes into proposed tasks, bed updates,
  planting activities, or event changes.
- Present every proposed write for review before saving.
- Record source, reviewer, timestamp, before/after values, and resulting action.
- Add guardrails for plant-health language so suggestions are guidance, not
  diagnosis.

Acceptance criteria:

- AI saves coordinator time without silently changing trusted garden state.

### 2.0: public surface and scale choices

Goal: expose selected public information and revisit architecture only after the
private operating core is proven.

Build:

- Public event pages that do not leak private member or garden operations data.
- Optional guest registration if the permission model is ready.
- Public calendar feed for selected events.
- Decide whether SQLite remains enough or whether Postgres is justified.
- Decide whether local private media remains enough or whether object storage is
  justified.
- Add migration tooling for the chosen storage path.

Acceptance criteria:

- Public/guest flows are clearly separated from private member operations, and
  the deployment model still feels maintainable for a small self-hosted garden.

## Near-term priorities

1. Observe Quick Log use and simplify Today and bed details around real habits.
2. Add backup/export safety and a small migration convention for live data.
3. Add a deliberately simple task model connected to logged problems.
4. Improve attendance operations for coordinators.
5. Add the planting lifecycle only after daily logging and tasks are proven.
6. Add Learn, announcements, and AI-assisted drafts later.

## Open decisions

- Which Quick Log types do members use in the garden, and which fields create
  hesitation or get skipped?
- Which Today sections help people act, and which can be removed?
- Should tasks be deliberately simple at first, or should they include due dates,
  recurrence, priority, and assignment from day one?
- Should member contributions be visible as lightweight profile history, or kept
  mostly operational to avoid social pressure?
- Should WhatsApp summaries be hand-generated templates first, with AI drafting
  added later?
- What is the first real garden's minimum useful backup and restore workflow:
  documentation only, admin UI, or an external script?
- Should public event registration stay enabled by default, or be guarded by a
  deployment/config flag until the first private workflows are proven?

## Suggested next build

The best next build is a short field-validation pass on Quick Log and a quieter
Today screen. In parallel, add backup/export safety and the first explicit
migration convention now that the app has live users. Tasks should follow once
real logs show what work members and coordinators actually need to coordinate.
