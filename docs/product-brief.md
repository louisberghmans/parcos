# ParcOS MVP product brief

## Product promise

ParcOS helps a communal garden coordinate itself without requiring members to
learn farm-management software or coordinators to maintain spreadsheets.

Two coordinators maintain the trusted garden state. Members can quickly learn
what needs doing, what may be harvested, what is happening next, and who is
currently present.

## People and permissions

ParcOS is a members-only application. Membership is invitation-only and does
not depend on email or SMS. A coordinator creates a one-time invitation link;
the member chooses a username and password and receives an individual profile.
If access is lost, a coordinator creates a one-time recovery link for that
existing profile.

### Visitor

- No access to the ParcOS member application
- Public event information may later be published as a separate surface

### Member

- Join or leave events in one tap
- View the garden directory and harvest guidance
- Claim tasks and record contributions
- Check in at the garden
- Comment or ask questions where enabled

### Coordinator

- Everything a member can do
- Create and manage events, recurring sessions, tasks, plantings, and beds
- Set event capacity and registration rules
- Record attendance and contact registered participants
- Publish announcements and knowledge
- Review and confirm AI-proposed changes

## Core navigation

1. **Today** — next event, urgent work, harvest-ready beds, and who is here
2. **Calendar** — agenda and month views, filters, event registration
3. **Garden** — photographic place and bed cards, crops, state, tasks, and
   harvest information; maps are optional orientation aids
4. **Learn** — searchable articles and videos
5. **Profile** — registrations, tasks, contributions, badges, and preferences

## Calendar and registration

Calendar and registration in the first private release are for invited members.
Public guest registration is deferred until it can be exposed separately from
private garden operations.

Calendar entries can represent:

- Volunteer work sessions
- Workshops and training
- Community events
- School visits
- Coordinator planning meetings
- Seasonal milestones

Each event supports:

- Title, description, location, start and end time
- Event type and audience
- Optional capacity and waitlist
- Registration opening and closing times
- One-tap registration for signed-in members
- Participant counts by age group: adults (18+), teenagers (13–17), children
  (6–12), and young children (0–5), without collecting children's names or
  exact ages
- Accessibility and preparation notes
- Repeating schedules, with individual occurrences editable
- Cancellation and attendee notification
- Calendar download/subscription using iCalendar
- A WhatsApp-ready share link and generated summary
- Coordinator attendee list and attendance recording

### Registration experience

Returning member:

1. Open event from ParcOS or a shared link.
2. Tap **I'm joining**.
3. See immediate confirmation and **Add to calendar**.

New member:

1. Receive a one-time invitation link from a coordinator.
2. Choose a display name, username, and password.
3. Enter the private member application with an individual profile.

### Event states

- Draft
- Published
- Cancelled
- Completed

Registration states:

- Going
- Waitlisted
- Cancelled
- Attended
- No-show

## Garden operations

The initial hierarchy is:

```text
Ferme du Parc Parmentier
├── Grand Potager
│   └── Zone
│       └── Bed
├── Potager des enfants
├── Compost
├── Pépinière
├── Poulailler
└── Infrastructure
```

Beds and other places have map geometry, an active date range, photos, and a
current operational state. Historical geometry is preserved when the garden
layout changes between seasons.

The primary mobile wayfinding experience is a list of cards. Each card shows a
real thumbnail, stable code and number, garden/section breadcrumb, current
planting, operational state, and last update. A plan is never required to find
or open a bed.

Plantings connect crops to places and date ranges. Activities form the durable
history: planted, watered, observed, harvested, cleared, moved, or maintained.

## AI interaction rules

AI is an input and summarisation layer, not the source of truth.

- Natural-language and voice input are converted into proposed structured actions.
- Every proposed write is shown for confirmation.
- Confirmed changes record the person, time, source, and before/after values.
- Plant-health suggestions are clearly presented as guidance, not diagnosis.
- AI may draft event descriptions, reminders, translations, and WhatsApp updates.
- AI never silently changes bed, planting, harvest, task, or attendance state.

## First usable milestone

A member can:

- Sign in to an individual profile without email or SMS
- Open the application on a phone
- See the next work session
- Register in one tap
- View harvest-ready beds
- Choose an available task
- Check in at the garden

A coordinator can:

- Invite a member and recover a member's access
- Add a current bed photograph from a phone
- Create and publish an event
- Set capacity and view registrations
- Create a task connected to a bed
- Change a bed's state
- Publish a short harvest instruction
- Generate a WhatsApp-ready daily or weekly update

## Explicitly deferred

- Private instant messaging
- Continuous location tracking
- Complex yield accounting
- Competitive leaderboards
- Native iOS and Android applications
- Automated AI writes without confirmation
- Passkeys (the first self-hosted release uses usernames and passwords)
- Public/guest event registration

## First self-hosted architecture

The first testable production slice is distributed as one Docker image:

- Node.js HTTP application and static mobile web interface
- Built-in SQLite database with WAL mode
- Private uploaded-photo storage on the same persistent Docker volume
- Server-side sessions, scrypt password hashes, CSRF protection, and role-based
  write permissions

This deliberately minimizes server administration for the first real garden
test. The HTTP API forms a migration boundary for PostgreSQL when usage,
redundancy, or concurrent-write needs justify operating a separate database.
