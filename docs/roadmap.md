# ParcOS roadmap

Last updated: 2026-08-22

ParcOS is a private-first operating app for community parks and vegetable
gardens. Each release below has one primary outcome. A feature belongs in a
version only when it strengthens that outcome; otherwise it waits.

Version numbers describe product milestones, not delivery dates. Patch releases
may still be used for focused fixes, security work, and release hardening.

## Product direction

ParcOS should feel like a shared garden conversation with useful actions
attached, not a collection of management dashboards.

The **Today** page will therefore put the garden feed first. Members should see
what people have said, asked, noticed, or completed before secondary summaries.
Tasks, events, beds, and harvest information remain important, but Today should
link to those records instead of repeating every screen in stacked cards.

## Scope rules

- **One outcome per version.** Avoid unrelated feature bundles.
- **Conversation before administration.** Member communication and next actions
  come before statistics, hero imagery, and coordinator controls.
- **Progressive detail.** Today stays short; Calendar and Garden hold operational
  detail.
- **Private by default.** A post, reply, event, image, or other record inherits
  its private context unless a coordinator explicitly publishes it.
- **Human confirmed.** Assistance may propose changes, but a person confirms
  changes to trusted garden data.
- **Small and self-hostable.** Keep the one-container Node and SQLite deployment
  until measured usage proves that more infrastructure is necessary.
- **Accessible and multilingual.** New workflows must work in French, Dutch,
  and English and target WCAG 2.2 AA.

## Shipped versions

| Version | Explicit feature goal |
| --- | --- |
| `1.0.0` | Establish a secure, self-hosted private member application with invitations, recovery, roles, areas, beds, events, and private photos. |
| `1.0.1` | Make generated links proxy-safe and add private member profile pictures. |
| `1.0.2` | Extend event participation with attendance names, opt-in public registration, bilingual flows, and administrator CSV import. |
| `1.0.4` | Repair embedded tutorial playback and make photo actions clearer. |
| `1.1.0` | Let members record garden work from a phone through Quick Log, bed actions, and activity history. |
| `1.1.1` | Let administrators personalize core application imagery and ensure recent activity loads reliably. |
| `1.2.0` | Make the interface and authored content usable in French, Dutch, and English with a safe manual translation workflow. |
| `1.3.0` | Add an explicitly published public park surface while strengthening private-by-default event and member boundaries. |
| `1.3.1` | Make complete backups, offline restores, health checks, and container releases dependable. |
| `1.3.2` | Make daily work actionable with first-class tasks, fast claim/completion flows, and versioned database migrations. |

## 1.4.0 — Garden feed and conversations

**Feature goal:** make Today the place where members catch up and talk about
the garden, without turning ParcOS into a general-purpose chat application.

### Member result

A member opens ParcOS, immediately sees the latest relevant conversation, can
post an update or question, and can reply without navigating through every bed,
event, or task.

### Coordinator result

A coordinator can publish and pin an announcement, answer questions in context,
and moderate a conversation without copying it into an external chat.

### Included

- Put the feed immediately below the compact Today header, before tasks, events,
  harvest summaries, imagery, or statistics.
- Replace the separate Quick Log and recent-activity blocks with one feed
  composer and one chronological stream.
- Support four intentional post types: update, question, announcement, and
  automatically generated activity.
- Add replies so a discussion stays attached to its originating post.
- Allow posts to reference an area, bed, task, or event and open that context in
  one tap.
- Add unread state, a visible reply count, coordinator pinning, and resolved
  questions.
- Let authors edit or remove their own posts and let coordinators moderate any
  post, with a minimal audit record.
- Preserve private-area and member-only access rules for posts, replies, and
  linked records.
- Show a compact **Next actions** section after the feed for assigned or urgent
  work and the next event; keep the full lists in Garden and Calendar.
- Provide translated interface copy and keyboard/screen-reader usable controls
  in French, Dutch, and English.

### Deliberately not included

- One-to-one private messages, arbitrary group chats, typing indicators, online
  presence, reactions, read receipts per person, or end-to-end encryption.
- Email, push, SMS, or WhatsApp delivery. The in-app unread state comes first.
- A second notification centre or a separate messaging navigation item.
- Feed ranking, engagement scores, streaks, or infinite scrolling.

### Done when

- A phone user can read, post, and reply from the top of Today in under a minute.
- A question and its answer remain discoverable from both the feed and linked
  garden context.
- Members cannot infer posts or replies from private areas they cannot access.
- Today no longer repeats large task, calendar, garden, image, and statistics
  panels before the conversation.

## 1.5.0 — Event-day operations

**Feature goal:** support running an event from registration through completion,
not only announcing it.

### Included

- Fast attendee check-in plus attended and no-show states.
- Registration opening and closing dates.
- Visible waitlist promotion and cancellation status.
- Recurring sessions with individually editable occurrences.
- An event completion flow with attendance, notes, and a feed summary.
- Optional confirmation text and a coordinator contact workflow that does not
  expose member details publicly.

### Done when

A coordinator can run a work session from a phone and finish with an accurate
attendance record and a concise update visible to the appropriate members.

## 1.6.0 — Planting and harvest lifecycle

**Feature goal:** preserve what grows in each bed across seasons.

### Included

- Planting records with crop, variety, start date, expected harvest window, and
  end date.
- A current bed summary derived from active planting records.
- Links from watering, weeding, clearing, planting, mulching, pruning,
  observation, and harvest activity to the relevant planting.
- Seasonal archives and lightweight planting import/export.
- Feed updates for meaningful planting and harvest transitions without flooding
  the conversation with routine changes.

### Done when

A member can understand what is growing now and what happened in prior seasons,
and a coordinator no longer has to overwrite a bed description to record change.

## 1.7.0 — Garden knowledge and search

**Feature goal:** make the garden's accumulated instructions and discussions
easy to find and reuse.

### Included

- Administrator-authored articles and short guidance in Learn.
- Links between guidance and relevant posts, tasks, beds, plantings, and events.
- Search across articles, conversations, events, tasks, crops, and beds with
  permission-aware results.
- Convert a resolved feed question into draft guidance while retaining a link
  to its source discussion.
- Generate privacy-safe, WhatsApp-ready weekly summaries for a coordinator to
  review and copy.

### Done when

A member can find an earlier answer or garden instruction without asking the
same question in an external chat.

## 1.8.0 — Assisted coordination

**Feature goal:** reduce coordinator writing and triage work without silently
changing trusted data.

### Included

- Draft event descriptions, task summaries, announcements, and seasonal notes.
- Convert free-form posts and notes into proposed structured tasks or planting
  updates.
- Show the source, proposed before/after values, and confirmation step for every
  assisted write.
- Record the reviewer and timestamp for accepted or rejected proposals.

### Done when

Assistance saves preparation time, every write remains understandable and
reversible, and disabling assistance leaves all core workflows intact.

## 2.0.0 — Scale only when evidence requires it

**Feature goal:** change the deployment or data architecture only for measured
reliability, concurrency, or hosting needs that the `1.x` design cannot meet.

Possible work includes PostgreSQL, external object storage, background jobs, or
multiple application instances. None is committed until real installations
provide thresholds and migration requirements. A `2.0.0` plan must preserve a
documented path from SQLite backups and must not make small self-hosting an
afterthought.

## Product questions to validate during 1.4.0

- Does one garden-wide feed plus contextual threads cover real conversations,
  or do users need narrower area subscriptions?
- Which automatic activities are meaningful enough for the feed, and which are
  noise?
- How many unread items should Today show before older conversation moves to a
  dedicated history view?
- Do coordinators need to restrict an announcement to coordinators, a private
  area, or an event audience?
- Which current Today panels can be removed entirely after **Next actions** is
  introduced?

Feedback and implementation proposals are welcome through GitHub issues. Tie a
proposal to one version outcome, describe the real garden workflow, and state
the privacy impact of any new surface.
