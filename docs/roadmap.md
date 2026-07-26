# ParcOS roadmap

Last updated: 2026-07-26

ParcOS is a private-first operating app for community parks and vegetable
gardens. The roadmap follows one product rule: make everyday garden work clear
and dependable before adding scale or automation.

## Product principles

- Private by default. Publishing an event, text, image, or other data must
  always be an explicit administrator or coordinator decision.
- Useful in the garden. A member should understand what needs doing and record
  the result from a phone in a few taps.
- Human confirmed. Automation may propose changes, but a person remains
  responsible for changes to trusted garden data.
- Small and self-hostable. Keep the one-container Node and SQLite deployment
  until real usage proves that more infrastructure is necessary.
- Accessible and multilingual. New public and member workflows should work in
  French, Dutch, and English and target WCAG 2.2 AA.

## Shipped foundation

- Invitation-only member access, account recovery, and member, coordinator, and
  administrator roles.
- Managed garden areas, beds, bed status, notes, photos, harvests, tutorials,
  and activity history.
- Mobile Quick Log and bed actions for watering, weeding, clearing, planting,
  mulching, pruning, general work, observations, problems, harvests, and photos.
- Events, capacity, member registration, waitlists, calendar downloads, and
  coordinator attendee views.
- An administrator-configurable public page for the park philosophy and
  explicitly public events, with guest registration and a private-by-default
  publishing model.
- Private member media, CSRF protection, hashed sessions and one-time tokens,
  upload validation, security headers, and locked-down container defaults.
- French, Dutch, and English interface support plus export/import translation
  workflows for authored content.

## Now: daily work and live-data safety

Goal: make ParcOS the garden's reliable daily action list.

- Add first-class tasks connected to an area, bed, event, or no location.
- Support open, claimed, done, skipped, and archived task states.
- Show urgent, available, and assigned work on Today.
- Let members claim and complete work in under a minute.
- Turn logged problems into proposed tasks without duplicating data.
- Add administrator backup/export controls and document a tested restore flow.
- Introduce explicit, versioned database migrations before the next group of
  tables is added.
- Add focused tests for public/private boundaries, migrations, waitlists, and
  media authorization.

Success means a member can choose useful work, complete it, and leave a durable
record without learning a project-management system.

## Next: event-day operations

Goal: support the work of running an event, not only announcing it.

- Add fast attendee check-in and attended/no-show controls.
- Add registration opening and closing dates.
- Improve waitlist promotion visibility and cancellation communication.
- Add an event completion flow with attendance, notes, and a shareable summary.
- Add recurring sessions while preserving clear registration boundaries.
- Add optional registration confirmation and coordinator contact workflows.

## Then: planting and harvest lifecycle

Goal: preserve what grows in each bed across seasons.

- Add planting records with crop, variety, start date, expected harvest window,
  and end date.
- Derive the current bed summary from active planting records where possible.
- Connect watering, weeding, clearing, planting, mulching, pruning, observation,
  and harvest activity to the relevant planting.
- Add seasonal archives and lightweight bed/planting import and export.

## Later: knowledge and communication

Goal: help members learn how this specific park and garden work.

- Add a Learn section with administrator-authored articles and announcements.
- Connect guidance to relevant tasks, beds, plantings, and events.
- Add search across knowledge, events, tasks, and crops.
- Generate WhatsApp-ready weekly summaries without exposing private member
  information.
- Improve the public page with optional accessibility details, contact
  information, and public calendar feeds, all opt-in.

## Future: assisted coordination and scale

Goal: save coordinator time without silently changing trusted data.

- Draft event descriptions, task summaries, announcements, and seasonal notes.
- Convert free-form notes into proposed structured tasks or planting updates.
- Require review before every AI-proposed write and record source, reviewer,
  timestamp, and before/after values.
- Reassess SQLite, local media, and the one-container deployment only when
  measured concurrency, reliability, or hosting requirements justify it.

## Open decisions

- Which quick actions and fields do members actually use in the garden?
- How much task detail is useful before due dates, priority, recurrence, and
  assignment become administrative overhead?
- Which contribution history should be visible to members without creating
  social pressure?
- Should public guest registrations support self-service cancellation, and what
  contact channel is appropriate for a self-hosted installation?
- What is the smallest backup and restore experience that administrators can
  test confidently?

Feedback and implementation proposals are welcome through GitHub issues. Keep
proposals tied to a real garden workflow and state the privacy impact of any new
public surface.
