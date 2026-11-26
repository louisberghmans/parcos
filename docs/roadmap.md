# ParcOS roadmap

Last reconciled: 26 November 2026. Baseline: application 1.4.1, HEAD b5cfb1e.

The [full product specification](ParcOS-Full-Product-Specification.md) supersedes
the earlier feed-first sequencing, limited planting history and optional-map
position. Desired weekly harvest now drives planning, constrained by physical
space, crop timing, seeds/materials and volunteer work. The specification's
revision 2.0 is not an application version.

Each delivery should have one demonstrable outcome, tested upgrades, FR/NL/EN,
mobile/keyboard accessibility, server authorization and human-confirmed writes.
Keep one Node.js/SQLite container until measured needs justify more complexity.
Existing public opt-in features and private-by-default boundaries remain intact.
No production deployment is authorized by this roadmap.

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
| `1.3.3` | Let coordinators manage member accounts and recover access within role boundaries. |
| `1.4.0` | Ship garden posts, questions, announcements, replies, photos and moderation. |
| `1.4.1` | Add app installation, persistent unread state and opt-in daily Web Push. |

The [changelog](../CHANGELOG.md) retains release history. Earlier roadmap
acceptance criteria were targets, not proof of completion: feed context links,
editing/pinning/resolution and moderation audit still need work.

## Proposed dependency order

Milestones below are work packages, not approved release numbers or promises of
delivery dates. Ship small independent slices, and prove a seasonal journey
before expanding catalogues or optimizing algorithms.

| Milestone | Outcome | Exit condition |
| --- | --- | --- |
| M0 — Reconcile and protect | Verify HEAD, docs, security baseline, local demo, tests and backup/restore; record gaps and migration plan. | Existing behavior verified or limitations recorded; no live changes. |
| M1 — UX architecture | Prototype four manually selected workspaces, canonical routes, task/admin separation, responsive task/bed screens and seasonal journeys. | Review actual mobile/desktop flows; preserve existing functions and permissions. |
| M2 — Agricultural foundations | Reviewed species/variety/supplier/profile data, physical bed metadata/map, batch lifecycle and normalized harvests. | Small reviewed dataset, mapped subset, direct-sown/transplanted batches; safe legacy compatibility. |
| M3 — Food choices and draft plan | Recipe ingredients, weekly portions/choices, demand and deterministic backward schedules. | Choices produce explainable draft batches; impossible timing and missing data stay explicit. |
| M4 — Space and approved plan | Bed/nursery allocation, succession, reviewed intercropping/rotation, forecast/workload and revisions. | Human-approved feasible mapped subset, diagnostics and idempotent linked work. |
| M5 — Operational execution | Multi-member tasks, instructions, sessions/attendance, labels, nursery moves, inventory and procurement quantities, notifications. | Approved plan → sow → transplant → harvest, with actual versus forecast. Build minimal primitives alongside M2–M4. |
| M6 — Crop coverage and readiness | Expand toward roughly 200 rights-cleared recipes, permitted imports, local profiles and actual 2027 planning. | Owner validates assumptions, shortages and feasible plan; manual fallback remains usable. |
| M7 — Coop and recurring work | Shared recurring care, stock/eggs, deadlines and coverage/escalation. | Human-approved care policy and contingency; uncovered work is visible. |
| AI-A — Shared service and translation | Optional provider adapter, revision-aware translation, local jobs and glossary. | Mocked tests first; explicit external processing/provider policy gate. Does not block planning. |
| AI-B — Grounded text assistant | Permitted read tools, confirmed operational writes and explicit wipeable local preferences. | Authorization, stale/replay and privacy tests; no permanent raw chat. |
| AI-C — Voice | Independent April 2027 experiment with configurable STT/TTS and text fallback. | Owner listening/latency/privacy review; no assumed provider or hardware capability. |
| L — Skills and recognition | Individual learning and collective achievements. | Separate owner-reviewed taxonomy/visibility; no rankings or punitive streaks. |
| K — Knowledge and search | Reusable task guidance, library, resolved questions, permission-aware search and summaries. | Discoverable contextual instructions; preserve remaining feed commitments. |
| Scale — conditional | Database, storage or hosting changes only for measured limits. | Evidence and tested migration/restore path; small self-hosting retained. |

Event-day attendance, registration windows, recurrence and completion from the
old roadmap now belong in M5. Knowledge/search remains K, with task instructions
earlier. Assistance is optional and available within member permissions rather
than coordinator-only. Financial/budget features remain excluded.

## First seasonal integration journey

Use synthetic, explicitly labeled fixture values and a small reviewed catalogue
before real agronomic planning. A member selects a seasonal recipe and week;
quantified demand produces direct-sown and transplant crop drafts. A coordinator
reviews space, nursery, expected yield, workload and shortages before approval.
Volunteers claim work, print labels, record sowing/transplanting and measured
harvest; results compare with the approved forecast. Restore preserves records,
media, identities and permissions. All manual workflows work with AI disabled.

This is a sequence of vertical slices, not a claim that one short task delivers
the whole planner. Real surveying and rights-cleared catalogue curation can
proceed alongside implementation.

## Decisions and proposed timing

Use the full specification §19 (D01–D14) as the decision register: measurements,
catalogue rights and agronomy, portions/distribution, planning assumptions,
labels, task/time policies, stock discrepancies, animal care, UX defaults,
external AI/free text, memory/backup retention, recognition, voice and estimates.
Do not silently resolve these through schemas or fabricated coefficients.

The target is a usable 2027 growing-season plan. Late-2026 foundation/design and
early-2027 planning/operations are proposals to reassess after reconciliation;
only the April 2027 voice experiment has an explicit owner timing target.

See [implementation reconciliation](implementation-reconciliation.md) for this
branch's actual checks, gaps and next bounded slice.
