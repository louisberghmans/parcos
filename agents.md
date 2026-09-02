# ParcOS engineering instructions

## 1. Mission

ParcOS is a practical operating system for Parc Parmentier and similar communal
gardens and parks.

Its purpose is to help members and coordinators understand:

1. Where things are.
2. What is happening.
3. What needs to be done.
4. What is growing and when.
5. What has happened historically.

ParcOS must remain understandable to ordinary garden volunteers. It must not
turn into generic project-management, ERP, GIS, social-network, or farm-
management software.

The product owner is Louis Berghmans.

Product direction is decided by the product owner. Agents may identify product
questions and propose alternatives, but must not silently resolve important
product decisions by changing the application.

---

## 2. Current product priorities

The current execution priority is:

1. Restore a useful interactive garden map.
2. Start with the existing PowerPoint/SVG-derived garden plans.
3. Separate persistent ParcOS entities from their map geometry.
4. Make beds and relevant physical objects selectable from the map.
5. Preserve geometry history when layouts change.
6. Keep the architecture compatible with a future drone/WebODM mapping source,
   but DO NOT build advanced drone/GIS functionality now.
7. After the spatial foundation is usable, improve planning, projects,
   seasonal work, and seed-to-harvest workflows.

Advanced mapping, computer vision, WebODM integration, GIS, GPS positioning,
automatic drone change detection, and browser CAD/drawing tools are explicitly
deferred unless the product owner changes this priority.

The existing roadmap is useful context but is not immutable product truth.
Do not rewrite the roadmap or product brief without explicit product-owner
approval.

Known product question:
The current product brief describes maps as optional orientation aids. This is
under reconsideration. Do not use that sentence as justification for
de-prioritising spatial functionality.

---

## 3. Product operating model

Prefer workflows that follow:

Observe -> Decide -> Plan -> Execute -> Record

Keep these concepts distinct:

- Idea: something someone thinks might be worth doing.
- Project: an approved outcome that should happen.
- Task: executable work.
- Activity: a historical record of what actually happened.
- Planting: a crop occupying a growing place during a time range.
- Spatial feature: geometry representing an entity at a particular time.

Do not conflate planned state with historical fact.

---

## 4. Spatial architecture

Spatial geometry must not become permanently embedded in the business logic of
beds.

Prefer a model conceptually similar to:

SpatialFeature
- id
- entityType
- entityId
- geometryType
- geometry
- validFrom
- validTo
- layer
- source
- sourceRevision

A bed such as GP-17 is a persistent ParcOS entity.

Its map geometry may change without changing the identity of GP-17.

The initial geometry source may be PowerPoint/SVG-derived data.

Future geometry sources may include orthophotos or WebODM. The rest of ParcOS
must not care which source produced the geometry.

Do not build GIS infrastructure for the first implementation.

---

## 5. Existing architecture

Preserve the current deployment model unless a specific approved issue requires
otherwise:

- Node.js
- built-in SQLite
- one Docker image
- one persistent data volume
- static mobile-first browser application
- HTTP API between browser and storage
- private media
- Docker Compose deployment

Do not introduce PostgreSQL, Redis, Kubernetes, queues, microservices, a
frontend framework, or a large new runtime dependency merely because it would
make a feature easier.

A dependency is acceptable when it materially reduces implementation risk or
complexity. Explain the reason in the PR.

---

## 6. Data safety

Production data is more important than implementation convenience.

Every schema change must:

- use an explicit ordered migration;
- preserve existing data;
- have migration tests;
- work from at least the previous released schema;
- fail clearly rather than leave an unknown partial schema state.

Never rewrite historical migrations after release.

Never delete or reinterpret existing user data merely to simplify a new model.

Map imports and future map revisions must be non-destructive unless a human
explicitly confirms destructive changes.

---

## 7. Security and privacy

ParcOS is private by default.

Never weaken:

- server-side authorisation;
- CSRF protection;
- session security;
- password hashing;
- media access controls;
- container hardening;
- private/public data separation.

Do not rely on browser-side checks for permissions.

Never expose member information through public APIs or public pages unless an
approved product requirement explicitly requires it.

---

## 8. AI behaviour inside ParcOS

AI may assist with:

- drafting;
- summarisation;
- translation;
- extracting proposed structured data;
- suggesting tasks or changes.

AI must not silently modify trusted operational state.

Human confirmation is required for changes to:

- beds;
- geometry;
- plantings;
- harvest state;
- tasks;
- attendance;
- permissions;
- important operational records.

---

## 9. Mobile and accessibility

Field use on a phone is a primary use case.

Touched workflows must:

- remain usable with one hand;
- use sufficiently large touch targets;
- handle narrow screens;
- handle loading, empty, error, and denied states;
- remain keyboard accessible where relevant;
- aim for WCAG 2.2 AA.

Do not optimise desktop presentation at the expense of field use.

---

## 10. Languages

ParcOS supports:

- French
- Dutch
- English

Any user-facing workflow changed by a PR must remain complete in all three
languages.

Do not leave newly introduced user-visible strings untranslated.

---

## 11. Codebase evolution

The existing application has oversized server and browser files.

Improve modularity incrementally when touching relevant functionality.

Prefer cohesive boundaries such as:

src/
  db/
  domain/
    spatial/
    garden/
    projects/
    tasks/
    plantings/
    events/
  http/
  services/

public/
  app/
    map/
    garden/
    today/
    calendar/
    projects/

Do not perform a full rewrite merely to improve structure.

Do not combine a large refactor with an unrelated feature.

When extracting a module, preserve behaviour and tests.

---

## 12. Work discipline

Every implementation task must have a bounded outcome.

Before writing code:

1. Read the relevant existing implementation.
2. Read relevant tests.
3. Identify the data flow.
4. State the smallest defensible implementation.
5. Identify migration, privacy, mobile, translation, and test implications.

Do not start coding merely because the requested feature sounds straightforward.

Prefer one meaningful outcome per PR.

Avoid unrelated cleanup.

Do not change product behaviour outside the issue scope unless necessary for
correctness.

If a materially better product or architectural decision is discovered, stop
that part of the implementation and report it rather than silently expanding
scope.

---

## 13. Testing

Before considering work complete run:

npm run check

The current check command validates JavaScript syntax and executes the test
suite.

Add focused tests for changed behaviour.

Features involving persistence require migration/data-integrity coverage.

Features involving permissions require server-side permission coverage.

For regressions, first add or identify a reproduction where practical.

Do not declare success with failing tests.

---

## 14. Definition of done

A change is complete only when:

- the approved user outcome works;
- the implementation is scoped;
- existing data survives;
- permissions are correct;
- FR/NL/EN remain complete;
- mobile behaviour is acceptable;
- tests cover meaningful failure modes;
- npm run check passes;
- documentation is updated when architecture or operation changed;
- the diff contains no unrelated changes.

---

## 15. Git rules

Never commit directly to main for feature work.

Use a dedicated branch or worktree.

One issue should normally produce one PR.

Branch naming:

feature/<issue>-short-description
fix/<issue>-short-description
refactor/<issue>-short-description

Commit messages should describe the user or engineering outcome.

Never force-push shared branches unless explicitly requested.

Never merge to main autonomously.

Agents may prepare a PR and recommend merge.
The product owner controls product-significant merges.

---

## 16. Agent behaviour

Act like a senior engineer, not an enthusiastic feature generator.

Ask the product owner only about decisions that materially affect product
behaviour, data semantics, privacy, or architecture.

Resolve ordinary implementation details independently.

When uncertain:

- inspect the code;
- inspect history;
- inspect tests;
- choose the smallest reversible implementation.

Do not invent requirements.

Do not turn brainstormed future ideas into code.

---

## 17. Parallel agents

Use parallel agents primarily for independent read-heavy work:

- code exploration;
- history analysis;
- test analysis;
- security review;
- regression review;
- documentation comparison.

Only one agent should normally own writes to the same feature area.

Parallel write-heavy work is acceptable only when work is cleanly separated by
different branches/worktrees and different issues.

The parent agent remains responsible for reconciling results.

---

## 18. PR report

Every completed implementation should report:

Problem
User outcome
Implementation
Data/migrations
Security/privacy
Tests
Manual validation
Known limitations
Files changed
Next logical issue

Keep the report concise and concrete.