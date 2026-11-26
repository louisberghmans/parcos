# ParcOS — Full product and engineering specification

**Revision:** 2.0 of this specification (not an application version)  
**Date:** 26 November 2026  
**Repository:** [louisberghmans/parcos](https://github.com/louisberghmans/parcos)  
**Baseline:** ParcOS 1.4.1 on the repository's default branch, as inspected during the roadmap review.  
**Status:** Consolidated product requirements and proposed technical implementation, ready for repository reconciliation and incremental development with Codex.

## 0. Read this first — instructions for Codex

This document supersedes the earlier four-file `parcos-codex-handoff` dated 26 November 2026. Those files mistakenly deferred the annual vegetable production plan, species catalogue and other requirements already discussed. Do not treat them as independent sources of scope or implement their earlier sequencing. Preserve the existing repository's project instructions, security policies, release history, and working functionality. Reconcile this specification with current HEAD before editing the canonical roadmap and product brief.

Decision semantics throughout:

- **REQUIRED**: owner-requested or accepted product behavior; implement unless a material conflict is raised with the owner.
- **PROPOSED**: implementation design or sensible default, not an already agreed architecture; verify against the repository and adjust transparently.
- **OPEN**: decision requiring further evidence, owner input or a later design discussion; do not silently make a binding policy decision.
- **DEFERRED**: intentionally outside the initial usable release, not deleted from the vision.
- **VERIFY**: source, deployment, compatibility, security, legal or empirical claim to validate before reliance.

Unless explicitly qualified, the product behaviors below describe the target; the example schemas, algorithms, stage names, screen names and implementation order are proposals. No application version number beyond the current baseline is approved by this document. The target is to make the 2027 growing season plan usable in time for actual work; only April 2027 was explicitly agreed for voice experimentation. Do not present other proposed milestones as contractual delivery dates.

**Execution mandate:**

1. Read repository instructions, check working tree and HEAD, inspect schema/migrations, routes, frontend, CI, backup/restore and existing docs. Compare with §2 and report any drift. Preserve unrelated work. Do not assume production is running HEAD.
2. Reconcile `docs/product-brief.md`, `docs/roadmap.md` and relevant technical docs with this specification. Preserve shipped release history and still-valid commitments. Record unresolved product decisions and proposed milestones. Do not discard existing features because they are not described here.
3. Deliver independently testable vertical slices in the order of §17, prioritizing the seasonal planning path. Do not begin with a standalone chatbot, cosmetic restyle or generalized ERP. Where design questions do not block safe implementation, proceed with reversible defaults and record them. Ask the owner about material policy or irreversible choices before locking them in.
4. Extend the existing application instead of rewriting it by default. Keep the public open-source repository free of deployment secrets, private data, proprietary catalogues and installation-specific assumptions. Do not provision, modify or deploy to live OVH as part of this mandate.
5. For each slice: provide scope, affected files, migration/backup implications, verified test results, accessibility and privacy implications, open risks, and a concise demo path. No claims of successful tests, data imports, vendor guarantees or production deployment without evidence. Use local fixtures and mocked AI endpoints until external processing is explicitly approved.

## 1. Product vision and boundaries

### 1.1 What ParcOS is becoming

ParcOS is a private-first, open-source, self-hostable operating system for community gardens and shared outdoor spaces. It should make a community capable of growing the food its members actually want, at approximately the times they want it, while sharing the work and learning together.

The central operational loop is:

**Discover seasonal recipes → express weekly food preferences → calculate demand → plan backwards from harvest → allocate growing space → obtain seeds/materials → grow seedlings → transplant/direct sow → maintain → harvest → measure results → share food and celebrate progress.**

A volunteer should be able to arrive, understand what is useful to do, learn how to do it, and record the result without needing a coordinator to repeat instructions. A coordinator should have a credible view of the annual production plan, space use, expected yields, upcoming work, committed labour, uncovered tasks and material shortages. Members at home should be able to discuss, share photos, choose meals, follow cultivation progress and plan participation.

The current pilot is the owner's private group of neighbours, invited personally, hosted on the owner's OVH instance. It is not a formal association as described by the owner. ParcOS itself is reusable public GPL-3.0-or-later software, not a bespoke service for this pilot. The pilot has roughly 1,500 m² or more of vegetable garden, with potential expansion but no desire to expand simply because planning is inefficient. Actual usable bed area has not been measured. Do not use 1,500 m² as net growing area or assume exact dimensions.

### 1.2 Product principles

- **REQUIRED:** plan primarily from desired weekly harvest, with physical land and other resources as constraints, not from arbitrary bed filling.
- **REQUIRED:** support Community, Contributor, Coordinator and Administration experiences with explicit user selection. No automatic workspace selection based on location, behavior, device or time.
- One application, one authoritative data model, reusable operational primitives; avoid duplicated features or competing sources of truth.
- Friendly, beautiful, comprehensible design, not an enterprise dashboard for every user. Rich analytical views where they serve coordination.
- Private by default, minimal personal data, no mandatory email/SMS registration, no continuous location tracking. Preserve optional explicitly public product features.
- AI is optional, API-based and grounded in ParcOS records. No autonomous writes to trusted operational data. Users choose whether to interact with it.
- Multilingual interface and content in French, Belgian/Flemish Dutch and English. Aim for WCAG 2.2 AA and usable outdoor mobile interaction.
- Keep small self-hosting easy; no unnecessary platform dependencies. Prefer existing Node.js/SQLite/Docker architecture until measured need warrants change.
- Encourage meaningful individual and collective achievements; do not optimize addictive app engagement, rankings, punitive streaks or attendance pressure.
- **REQUIRED exclusion:** no financial/budget management, cost per recipe, accounting, payments or commercial purchasing workflow. Material quantities and procurement lists are in scope, not prices or budgets.

### 1.3 Operational domains

| Domain | Target behavior |
|---|---|
| Grand Potager | Full seasonal cultivation, bed occupancy, intercropping, rotation, harvest and operational planning. |
| Potager des Enfants | Same agricultural primitives with age-appropriate tasks and educational activities. No new child profiles or sensitive records required. |
| Nursery / pépinière | Seed stock, sowing, trays/containers, germination, maintenance and movement of plants to growing beds. |
| Chicken coop / poulailler | Essential recurring care, feeding, watering, cleaning, egg collection, consumables, coverage and escalation. |
| Compost and infrastructure | Preserve the existing product brief's domains. Generic tasks, observations and locations first; specialized modules later only when needed. |

Use a common task, calendar, inventory, notification, member and permissions system. Areas are configurable and may have private access restrictions; modules are proposed as optional per installation. Do not make the pilot's names mandatory. Coordinators manage all enabled domains, not one role per domain. Existing private-area visibility for ordinary members stays intact.

## 2. Verified baseline and reconciliation

Repository inspection during the preceding review identified the following baseline. These are source-code findings, not claims about the live OVH instance or successful execution of tests. Recheck HEAD at implementation time.

| Existing capability | Observed state | Required treatment |
|---|---|---|
| Version / stack | `package.json` v1.4.1; Node >=24.17.0, built-in SQLite, static JS frontend, `web-push` dependency | Preserve compatibility and single-container deployment. Do not migrate to MySQL (an earlier spoken reference was incorrect). |
| Member access | Individual username/password, one-time invitations and recovery, member/coordinator/admin roles, promotion/demotion, private profiles/avatars | Reuse authentication and roles. Improve permission definitions and admin UI; do not add mandatory email. |
| Areas and beds | `garden_areas`, `beds`, area visibility, stable codes, photos, notes and one crop/variety/status per bed | Extend physical metadata; separate cultivation from physical space, preserve stable codes and history. |
| Tasks | First-class tasks, open/claimed/done/skipped/archived, normal/urgent, single assignee, one optional area OR bed OR event reference, claim/complete and coordinator PATCH | Extend rather than replace. Multiple commitments, time windows, batch links, instructions, dependencies and actual work. |
| Activities/harvests | Quick Log, bed-specific activity types, notes, harvest photos, harvest quantity free text | Unify operational records with tasks and batches; add structured yield units without losing legacy text. |
| Tutorials | `how_to_videos` attached to beds with YouTube links | Preserve; add reusable task instruction templates, links, short video and safety guidance. |
| Events | Member/public/coordinator audiences, capacity, registrations, waitlists, iCalendar, WhatsApp-ready sharing | Preserve. Add recurrence, actual attendance, registration windows, work sessions; do not reimplement waitlist logic. |
| Public surface | Optional public park page, separately published public events and guest registration; guest name and optional contact | Preserve privacy-by-default and explicit publication. Pilot's private membership does not imply these features are absent. Exclude guest identity/contact from AI. |
| Feed | Posts, questions, announcements, replies, photos, deletion/moderation, unread state | Move to Community; complete context links, edit/pin/resolved status and moderation audit per earlier roadmap. |
| PWA/push | Install prompt, service worker, per-member preferences and device subscriptions, persistent VAPID identity, daily feed digest | Extend existing dispatcher; no second push stack. Keep generic lock-screen payloads and user controls. |
| Translations | `localized_content`, `content_translations`, source revisions, stale detection, manual JSON export/import; backend allowlist includes tasks but not feed posts/replies | Extend existing revision workflow to AI and new entity types. Keep manual fallback. |
| Persistence/restore | SQLite WAL, ordered migration versions 1–4, complete checksummed backup, offline restore, Docker volume, health endpoint | Preserve/extend migration and restore compatibility for new records and files. |
| Frontend | `public/app.js` renders main views using shared state and DOM templates; bottom nav Home/Agenda/Quick Log/Garden/Profile | Reorganize UX and modularize progressively. Not a mandate to replace the framework. |
| Production planning / AI | No species/variety/supplier catalogue, recipes, planting batch model, solver, inventory, structured labour model or AI integration found | New work, not an already shipped capability. |

Known source details that matter for design:

- `beds.crop` and `beds.variety` are text fields and `beds.status` describes a whole bed. They cannot represent intercropping or successive batches; keep physical bed identity separate from plant occupancy.
- `tasks` has a constraint that at most one of `area_id`, `bed_id`, `event_id` can be non-null; it uses `claimed_by` and `completed_by`. Do not simply add incompatible UI controls without changing the model safely.
- `harvests.quantity` is text, and current frontend requires a harvest photo. Quantitative planning requires normalized measurements, with photos optional for routine measurement (proposed change; preserve previous photos).
- `event_registrations` includes `attended` and `no_show` in the schema; this does not prove a complete attendance workflow exists.
- `feed_posts` has no linked area/bed/task/event or source revision fields; access rules for contextual posts must prevent leakage. Existing Home shows the feed before tasks, and each task group is sliced to six cards. Profile contains administrative functions; bed modal mixes history, actions, notes, harvest forms and tutorials.
- Notification preference schema only accepts daily frequency and feed categories. Time-sensitive care needs different policy and a migration, not merely a new UI checkbox. Existing public pages and Web Push use external services despite the pilot's lack of a mail server.

Baseline references (default branch, as reviewed):

- [package.json](https://github.com/louisberghmans/parcos/blob/main/package.json)
- [CHANGELOG.md](https://github.com/louisberghmans/parcos/blob/main/CHANGELOG.md)
- [README.md](https://github.com/louisberghmans/parcos/blob/main/README.md)
- [server.mjs](https://github.com/louisberghmans/parcos/blob/main/server.mjs), observed blob SHA `8f94a078372a940f9ad7332d24f4bb292aadfcea`; tasks ~507–535, feed and notifications ~542–617, members/beds/harvests/events/translations ~656–883, task routes ~2740–2855.
- [public/app.js](https://github.com/louisberghmans/parcos/blob/main/public/app.js), observed blob SHA `19651a44f7e95921a68225293b5f8d0a6113a668`.
- [Original roadmap](https://github.com/louisberghmans/parcos/blob/main/docs/roadmap.md), [product brief](https://github.com/louisberghmans/parcos/blob/main/docs/product-brief.md), [database and import workflow](https://github.com/louisberghmans/parcos/blob/main/docs/database-structure-and-import-workflow.md), [translations](https://github.com/louisberghmans/parcos/blob/main/docs/multilingual-content-workflow.md), [backup/restore](https://github.com/louisberghmans/parcos/blob/main/docs/backup-and-restore.md).

The original roadmap's feed-first mandate, limited planting history, optional map purely for orientation, deferral of complex yields and coordinator-only assistance are superseded by the new product direction. Preserve its principles of one primary outcome per release, privacy, accessibility, progressive detail and human-confirmed writes. Preserve previously planned event-day operations and knowledge/search; fit them into the new dependency order instead of abandoning them. The 2.0 scaling phase was conditional, not a committed database migration.

## 3. UX and design system

### 3.1 Design objective

**REQUIRED:** perform a comprehensive information architecture and interaction redesign, not a cosmetic refresh. Preserve the garden-oriented warmth and original visual identity where it works. The current source establishes navigation/structural problems but no live cross-device visual or usability audit has been performed. Run the existing application locally with a synthetic dataset, capture key mobile/desktop screens and map journeys before final UI design. Prototype future food, task and cultivation flows now so the new navigation can accommodate them.

### 3.2 Workspaces, navigation and permissions

| Workspace | Main questions it answers | Primary surfaces |
|---|---|---|
| Community | What is happening? What can I eat? What will be ready? | Feed, recipes, personal food calendar, cultivation milestones, upcoming sessions, shared achievements |
| Contributor | What can I do now? Where? How? | My work, available work, sessions, garden map/list, scan/quick log, instructions, harvest |
| Coordinator | What is planned? What is late, uncovered or constrained? | Annual plan, crop calendar, space/harvest/workload analytics, nursery, inventory, work sessions, exceptions |
| Administration | Who has access? What is configured? | Accounts, roles, invitations, access, configuration, privacy/AI, backup and system health |

Workspace selection is explicit. **PROPOSED:** a clearly labeled switcher, remember last manually selected workspace and optionally a user-selected default. Do not switch on GPS, calendar, detected activity, AI inference or whether the user is on desktop. A coordinator can act as a contributor without losing their permissions; a workspace switch does not elevate privileges. Use actual server authorization for every route, deep link, media request and tool call. All users have Community and Contributor where permitted; Coordinator and Administration require corresponding permissions. Preserve the current three roles; define an explicit authorization matrix, not a new RBAC framework by default. Admin can configure accounts, role assignment, security and provider settings. Coordinators can manage plans, tasks, operational areas, catalogue and approved content across the garden; ordinary members select meals, browse allowed tasks, participate, record work/observations and control their own preferences. Preserve existing coordinator invitation/recovery rights unless a deliberate permission review changes them.

### 3.3 Canonical pages and information hierarchy

Every operational record has one canonical detail route, reachable from all permitted workspaces. Use clear breadcrumbs/back behavior, stable deep links, and preserve filters and scroll when navigating back. Dashboards show concise summaries and links, not entire duplicated pages. Never put management controls in personal profile by default. Task lists must expose all permitted tasks through paging/filtering, not silently cap the visible board at six per group. Search and filters respect selected area and time range; area scope should be obvious.

Proposed canonical entity screens: recipe, food preference calendar, crop/variety, plan, batch, area/bed, nursery tray, task, work session/event, harvest, inventory item, instruction, feed thread, member profile and admin settings. On a bed screen prioritize identity, location, active batches and actionable work; use sections/tabs for upcoming plan, harvests, history and notes rather than one long modal. A task opened from a notification or map is the same task as the one in a work session. Distinguish a quick action (log watering) from navigation to an activity history. Preserve a list alternative to maps, including when geometry is incomplete.

### 3.4 Interaction patterns and visual system

- Establish design tokens (color, typography, spacing, elevation, radii, states), accessible reusable components (navigation, tables, cards, buttons, form fields, filters, status labels, empty/error/loading states, dialogs), and consistent icons/labels in all three languages. Use semantic HTML, keyboard/focus management, accessible names, contrast, reduced motion and responsive layouts. Status not communicated by color alone.
- Contributor mobile: clear urgent vs optional work, large touch targets (prefer 44–48 CSS px), high legibility outdoors, short steps, minimal typing, quick confirmations, optional photos, no needless dashboard statistics. Handle network failures without showing false success; no offline write synchronization claim unless explicitly engineered and tested. Existing PWA behavior preserved.
- Community: inviting photos and feed, contextual threads, clear recipe/harvest calls to action and notification control. No forced infinite scroll or automatic feed ranking. Separate human discussion from routine machine-generated milestones to avoid noise.
- Coordinator desktop: information-dense but legible data tables, editable planning timelines, graphs and map overlays; responsive summarized equivalents on phone. Display forecast vs measured vs uncertain state, filters, units, data freshness and next actions.
- Administration: separate account governance and operational administration from personal settings; show privileges clearly, keep backup and recovery accessible to authorized roles. High-impact actions need confirmation.
- Assistant: same small, unobtrusive launcher in each eligible page/workspace; no auto-opening, forced onboarding or takeover. See §14.

UX acceptance: a new member can find, claim and understand a task from Contributor without scrolling through social posts; a member at home can choose a recipe and find its expected availability; coordinator can review the week's coverage and annual plan without opening individual beds; admin can manage roles without searching Profile; all canonical deep links preserve visibility checks. Test representative mobile widths, desktop, keyboard navigation, FR/NL/EN text expansion and task completion with real volunteers before finalizing patterns.

## 4. Agricultural catalogue — species, crops, varieties and suppliers

**REQUIRED:** create a structured browsing and planning catalogue that covers seed acquisition through harvest. Members can browse what can be grown, when, how, and which vegetables are available in a given season. Coordinators maintain and validate cultivation data. The owner uses Semailles and Vreeken's Zaden; support importing those suppliers' catalogues, subject to source access and rights verification. Do not hardcode their private installation's catalogue as a universal dataset.

### 4.1 Data model (conceptual)

| Entity | Purpose / essential fields |
|---|---|
| Botanical taxon / crop | Stable ID, scientific name (where known), family/genus/species, common names and synonyms in FR/NL/EN, culinary crop group, edible part, annual/biennial/perennial, rotation family/group. Distinguish botanical species from culinary crops (e.g. multiple Brassica crops within one species). |
| Cultivar / variety | Crop link, normalized name and aliases, growth habit, early/late maturity, supported production methods, spacing/yield overrides, resistance claims with provenance. |
| Supplier product | Supplier, source URL/SKU, cultivar/crop match, packet size/seed count or weight if available, sale/availability status, date fetched. No pricing/budget features. Multiple offers can link to one variety. |
| Cultivation profile | Versioned method: direct sow, nursery/transplant, protected culture, perennial or other supported routes. Applicable locale/climate/season, open-field vs greenhouse/tunnel, operation graph and parameter ranges. |
| Cultivation operation template | Operation type, dependencies, offsets or windows, required inputs, duration model, optional frequency/trigger, instruction reference, success criteria and safety flags. |
| Agronomic source/claim | Source, fetched date, applicable context, raw value/unit when lawfully retained, normalized value/range, confidence/review status, curator and revision. |
| Cultivation combination template | Named tested combination (e.g. Three Sisters, tomatoes+basil), component crops, spatial arrangements, yield/spacing rules, timing/compatibility, evidence and local review. |

Do not conflate seed stock with supplier catalogue; inventory is actual on-site material and lots (§11). The recipe catalogue uses ingredient/crop mapping, not supplier SKUs.

### 4.2 Cultivation parameters

Support ranges, not just point dates. Store units and method/region assumptions explicitly. Unknown values remain unknown; do not invent agronomic facts.

- Seasonal windows for indoor/outdoor sowing, transplanting, harvest, overwintering; earliest safe windows by protection type and frost risk. For pilot, configure Belgium/Brussels climate rather than universally apply Belgian dates.
- Seed amount/density, germination temperature/days, expected germination fraction, seedlings per cell/tray, thinning, nursery duration, survival fraction, hardening-off where applicable.
- In-row/row spacing, usable area per plant, expected size/height/spread/root characteristics, light preference, soil/drainage/pH preferences, water and support requirements. Distinguish hard restrictions from preferences and allow review.
- Growth duration to harvest, distribution/duration of harvest, yield basis (per plant, per m², per sowing row, etc.), yield range, marketable/usable fraction, number of picks, storage life/conditions where relevant.
- Maintenance operations: watering, weeding, mulching, thinning, pruning, staking, feeding, pest observation, clearing, seasonal or recurring checks. Record estimated setup and variable labour and material coefficients.
- Crop family/rotation and companion combinations, provenance and confidence; do not treat unverified companion-planting anecdotes as guaranteed productivity benefits. No automatic unsafe plant-protection recommendations.
- For perennials and overwintering crops, occupation and planning spans can cross calendar-year boundaries.

### 4.3 Supplier ingestion and review

**PROPOSED pipeline:** independent import adapters for Semailles and Vreeken's Zaden; start with lawful supplier CSV/export or public pages only where permitted. Verify terms, robots instructions, rate limits, rights to reproduce text/images/catalogue structure and extraction reliability before automated bulk scraping or distribution. Do not bypass login, blocks or rate limits. Use source links and independently normalized factual fields; no unlicensed copied descriptions/photos. Supplier-specific content can be locally imported without being committed to the public repository. Ship a small synthetic or rights-cleared demo catalogue with provenance.

Fetch or upload → parse into staging → optionally extract structured values via approved AI on non-personal text → validate units/ranges/taxonomy → deduplicate or flag ambiguous matches → human review differences → publish selected records with revision/source. Import dry-run, reject malformed or ambiguous values, idempotent upsert by stable source key, no silent overwrite of reviewed/local values, do not delete catalogue history when a supplier removes a listing. Catalogues must work without AI. Provide coordinator editing and CSV/JSON import/export; preserve existing import format and its all-or-nothing behavior for legacy entities. Use larger imports in bounded chunks/staging rather than weaken controls. Record import errors, coverage and missing parameters.

Acceptance: coordinator can add/import a crop, two varieties and multiple supplier products; member can find them by localized names; planner distinguishes method-specific durations/yields, marks missing fields and retains reviewed values after reimport; one supplier listing removed does not erase existing batches; new import never requires personal data or an external AI service.

## 5. Recipes, seasonal browsing and member food calendar

### 5.1 Recipe catalogue

**REQUIRED:** build a catalogue of approximately 200 useful vegetable-garden recipes, organized around seasonal produce. This is a target content collection, not a prerequisite to demonstrate the first end-to-end implementation. The collection should be curated for the garden rather than copy a commercial recipe database. Use original or appropriately licensed recipes and images; preserve attribution where required.

Each recipe contains: stable ID, translated title and description, servings basis, preparation instructions, preparation time (where available), optional image, tags/season and dietary information where reliably established, and structured ingredients. Each ingredient has a canonical ingredient ID, quantity, unit, whether garden-supplied or externally purchased/pantry, edible part and optional accepted substitution(s). A garden ingredient maps to crop types, not seed products. Allow multiple varieties to satisfy an ingredient if culinarily appropriate. Quantities must scale linearly for portions where appropriate; store conversion factors explicitly; never convert volume/count to mass without a known conversion or flagging uncertainty. Recipe version changes must not silently change a member's previously accepted selection or approved demand calculation.

Seasonality is derived from cultivation profiles, local climate, available protection and stored produce where supported. Separate:

1. Typical seasonal window (what could usually be grown here).
2. Earliest feasible availability based on current date, seed/seedling availability, cultivation duration and available methods.
3. Planned availability based on approved cultivation batches.
4. Current forecast based on actual progress and losses.
5. Actual harvest availability based on recorded harvests and withdrawals/distribution if implemented.

A seasonal recipe is feasible only when its required garden ingredients have overlapping feasible availability windows (or explicitly approved storage/substitution assumptions). Pantry ingredients do not drive garden planting. If an ingredient is unknown, insufficiently modeled, unavailable, or would require planting before today, explain why rather than show false availability. Recipe suggestions may include a suitable substitution, with explicit member approval before it affects demand. No promised guaranteed meal or delivery date.

### 5.2 Annual poll and weekly preference calendar

**REQUIRED:** members select what they would like to eat and approximately when; they can place recipes on a weekly calendar. ParcOS suggests roughly four or five relevant recipe choices for each week as a convenient entry point, while allowing broader catalogue browsing. Support an annual/seasonal poll in which members may choose roughly two or three favorites per season; do not make those favorites the only demand signal. Do not force 52 weekly choices or a binding subscription. Plan against individual actual recipe selections, not just popularity votes.

Proposed workflow:

- Coordinator creates a season planning cycle (e.g. 2027), enables preference collection and defines its horizon/cutoffs; members browse recipes and feasibility before selecting.
- Member opens a recipe, sees earliest plausible week, suitable range and seasonal explanation, chooses desired ISO week and portions, and adds it to their personal food calendar. A week may be empty or have several selections. Members can edit/cancel within policy; no compulsory household profiles.
- Show a provisional estimate when not yet planned, later the planned/forecast status and any significant change. Do not show personal choices of other members unless separately and deliberately shared. Aggregate demand for coordinators; notifications routed to interested members locally.
- Coordinator sees aggregate weekly requirements and response coverage, can adjust explicit community demand independently of selections (e.g. educational crops or buffer) and review missing data.
- Once a plan is approved, changes to food choices create demand deltas for review, not destructive changes to already sown plants. Planned and actual supply should remain visible. Show unmet demand; allow members to move a desired meal to a feasible week or choose another recipe.

**OPEN:** exact number of portions per selection and whether default portions are a user preference or one-off input; cutoff/late-selection rules, distribution model (individual collection/reservation vs shared harvest) and any allocation priority under shortage. The user explicitly said approximate availability, not guaranteed individual baskets. Default MVP: an indicative demand forecast with editable servings per selection, no reservation of individual plants or guaranteed delivery. Owner to confirm before enforcing allocation rules.

### 5.3 Demand calculation and transparency

For each selected recipe and week, scale the garden ingredients by requested servings divided by recipe reference servings. Aggregate by ingredient and week, convert only compatible units, and map to eligible crop production profiles. For example, a recipe requiring 0.4 kg of tomatoes for four portions requested by five households for four portions each represents 2 kg of tomato demand, before any explicit buffer or loss assumption. Do not count the same household selection twice; do not infer whole household demand from an alias. Support manual coordinator targets for crops independent of recipes. Store source selection/revision and demand snapshot for reproducibility; changes trigger recomputation of a draft, not silent changes to an approved plan.

If ingredients are counted by heads, bunches, pieces or weight, keep those units or use a reviewed conversion factor; display assumptions. Do not add a generic loss factor twice (e.g. yield already expresses usable produce). Model demand (desired edible amount) separately from planned production, expected usable yield, actual measured harvest and actual distribution.

Acceptance: a member can choose a salad for a feasible June week and change servings; coordinator sees exact aggregated mizuna and other ingredient demand, with pantry items excluded; overlapping recipes consolidate without double-counting; unavailable ingredients produce actionable explanations; changing one choice creates a reproducible demand delta. Support direct vegetable targets in addition to meal-driven targets. The system remains functional with AI disabled.

## 6. Physical garden model, mapping and occupancy

### 6.1 Spatial inventory

**REQUIRED:** map the Grand Potager, Potager des Enfants and nursery sufficiently to allow automatic allocation. Actual surveying is a prerequisite for reliable optimization, not a prerequisite for building the feature. Approximate measurements can be entered and marked as such, then refined. Do not assume the former demo dataset represents the physical garden.

Extend existing `garden_areas` and `beds` with physical characteristics and stable identifiers. Proposed model: garden → area/zone → bed or other resource (nursery bench/tray capacity, greenhouse, compost, coop). A bed has length, width, usable area, polygon or line/rectangle geometry, local map reference/coordinates, sun exposure (full/partial/shade or more granular observations), soil type/pH/drainage/fertility and test dates, irrigation/protection/support infrastructure, access constraints, physical availability and data quality. Distinguish gross parcel, paths and net cultivable surface. Nursery resources include usable tray/cell/bench capacity and environmental constraints. Area can have a custom operational type, including non-cultivation areas.

Proposed mapping UI: import a surveyed plan or simple image as background, draw/edit bed polygons or measured rectangles, attach codes and dimensions, calibrate to scale/coordinate system, validate overlaps and approximate geometry, optionally import/export GeoJSON or a simple structured file. Do not require a paid map or GIS service. If using georeferenced geometry, avoid exposing private location to unauthenticated users; keep a list/photo-based mobile wayfinding alternative. Save historical geometry versions with validity dates; changes should not alter past occupancy records. Confirm measured area overrides and keep source. Beds with unknown dimensions, exposure or critical conditions are shown as incomplete and either excluded from automatic assignment or included only under clearly reviewed assumptions.

### 6.2 Spatial allocation types

**REQUIRED:** multiple crops per bed, including true intercropping, not merely a free-text label listing several crops.

- Spatial subdivision: allocate different segments/rows of one bed concurrently (e.g. 5 m carrots, 3 m lettuce, 12 m onions on a 20 m bed).
- Succession: same physical space used by different batches at different times, with realistic clearing/preparation/rotation windows.
- Intercropping: crops occupy overlapping physical footprint simultaneously using reviewed combination templates (e.g. maize, climbing beans and squash; tomatoes and basil). Model a shared footprint and per-component densities/yields; do not count overlap twice for occupancy or allow arbitrary unvalidated overlaps.
- Perennial or overwintering: allocations across seasonal/year boundaries, with existing occupation as a constraint.

Model allocations separately from physical bed geometry and plant batches. A batch may use multiple segments; one segment can host a reviewed combination. Coordinate dimensions and area, plant count, occupancy interval, allocation version, method/protection and status. Model physical bed availability separately from biological growth stages; bed summaries derived from active allocations, rather than overwriting crop fields.

### 6.3 Metrics

Occupancy = union of occupied usable bed footprint at selected time / total usable bed area in the selected scope, excluding unknown geometry from the denominator with explicit coverage. Do not double count intercropped components. Show available area and active/future allocations, unknown/unmapped space, constraints and conflicts. A plan must not show 100% of a bed occupied merely because one small batch is there. Distinguish planned occupancy, current actual occupancy, reserved but not yet used and annual time-weighted utilization. Provide annual Gantt by bed/zone and map overlay for selected week, with crop/batch details and accessible table alternative.

Acceptance: mapped bed dimensions and characteristics can be entered and updated; two adjacent crops and reviewed shared-footprint crops can coexist; unapproved overlaps are flagged; a future batch may follow a cleared one; previous year's geometry/history remains available; percentage and map/list agree; missing geometry is visible, not silently guessed.

## 7. Cultivation batches and lifecycle

**REQUIRED:** connect recipe demand and cultivation plans to actual identifiable plants from seeds to harvest. Batch is the operational traceability object, not the bed itself.

### 7.1 Conceptual entities and states

- Season/plan, version and approved snapshot; plan line with crop/variety/method, demand window, quantity and assumptions.
- Cultivation batch with stable ID/code, cultivar/profile revision, originating plan/demand links, planned seed quantity, expected/actual viable plants, origin seed lot(s), operation schedule, nursery locations/trays, allocation(s), expected and actual harvests, status and changes.
- Batch group/parent-child linkage for splits, merges or partial transfers. Preserve quantities and genealogy; do not duplicate plant counts when one tray is split between beds. Distinguish seedlings grown vs purchased and direct-sown crop routes.
- Physical container/tray and occupancy/transfer record: ID, capacity, batch/plant counts, nursery location, destination allocations, timestamps. Trays may be reused after clearing without reusing batch identity.
- Actual cultivation event: type, target, recorded timestamp and occurrence timestamp, actor internal ID, quantity/unit, observations, related task, source, optional photo and correction history.
- State derived from relevant actual operations (proposed stages: planned, seed/stock available, sown, germinating, seedlings ready, transplanted/direct growing, maintenance, harvestable, completed/cleared, failed/cancelled). Not every crop follows every stage. Allow mixed stages after partial operations and overlapping harvests. Keep status distinct from a date passing; never mark biologically ready solely because the calendar predicts it.

Maintain planned, current estimated and actual dates/quantities independently. Keep the approved baseline immutable for comparison, with explicit plan revisions. When sowing is delayed, germination is low, a transfer is partial or a crop fails, recompute affected forecasts and dependent tasks, flag demand shortfalls, propose a corrective plan. Do not silently relocate or cancel approved work or change committed tasks; coordinator validates consequential changes. Replanning must respect completed work and existing physical occupancy.

### 7.2 Labels and traceability

**REQUIRED:** generate printable durable human-readable seedling/tray/batch labels; identify what is in a tray and where/when it should go. Include crop/variety, stable batch and container code, sowing date, target destination where known and expected next operation/window. Printable sheets with configurable label size and browser print/PDF-friendly layout. Reprint without creating duplicate batches; do not include member names, private recipe preferences, credentials or invitation tokens. QR-code scanning is a strong proposed default, explicitly discussed, but exact physical label stock/printer and code format remain open. QR should encode only a stable opaque ID or authenticated deep link, never a secret that grants access. Human-readable fallback and manual search remain mandatory. Existing bed codes preserved.

### 7.3 End-to-end lifecycle example

A member selects a mizuna salad for week 23. The planner aggregates requests; nursery task generated to sow a reviewed quantity (all numbers and durations are cultivar/local-profile dependent, not universal facts). A volunteer records actual sowing and prints labels. A later volunteer opens or scans a tray, sees expected transplanting window and destination bed/segment, reads instructions and records actual transfer. ParcOS updates plant counts, nursery occupancy, destination occupancy and harvest forecast, completes or partially completes relevant tasks and alerts interested members at meaningful milestones. If a batch is delayed, show revised week and shortfall; notify only affected people according to preferences. At harvest, record quantity and optionally photo, link to batch, show available recipes; compare actual vs expected. Attribution displayed inside authorized app, not sent to AI or exposed in lock-screen notifications.

Acceptance: handle a direct-sown carrot batch and transplanted mizuna batch, split one tray across two beds, preserve plant counts and complete partial transfer; record germination variance and update forecast without erasing approved plan; QR or text code opens correct authenticated record; previous year's batch remains discoverable; planned and actual quantities/dates never confused.

## 8. Annual production planning and optimization engine

### 8.1 Scope and inputs

**REQUIRED:** plan backwards from desired weekly harvest. Automatically propose crops, batches, timing, quantities, bed allocations and work; support succession and intercropping. Coordinator retains final authority. The model is deterministic/constraint-based rather than an LLM making agronomic or allocation decisions. A mathematical solver is proposed; begin with a transparent deterministic heuristic if it meets acceptance, then improve optimization as actual constraints require. No framework/vendor decision is mandated. Keep engine independent of UI and AI service, testable from fixed data snapshots.

Inputs: weekly demand by crop/ingredient, approved cultivation profiles and combination templates, climate/season/method constraints, existing living crops and fixed allocations, prior rotation history, physical bed/nursery capacity and attributes, current seed/material inventory, available time windows, desired buffer/production strategy, and optionally estimated labour constraints/actual commitments. Start dates must not precede the current planning cutoff unless modeling already existing work. Land expansion is not a default solver action. Prioritize existing cultivable land and surface infeasibility.

### 8.2 Calculations and illustrative formulae

Use compatible canonical units and ranges. Illustrative point-estimate for a single harvest crop (not a universal model):

```text
required_usable_yield = demand + explicit_buffer - usable_existing_supply
productive_plants = ceil(max(0, required_usable_yield) / usable_yield_per_plant)
seeds_to_sow = ceil(productive_plants / (germination_fraction * survival_fraction))
space_required = productive_plants * effective_area_per_plant
```

Only apply germination/survival losses when not already reflected in usable yield or plant count; distinguish sowing vs transplanting counts, and guard against zero/unknown denominators. For direct sowing model density/row-length where more appropriate. For extended-harvest crops use a weekly production curve (or reviewed distribution across harvest window) and overlapping demand rather than assume the whole yield arrives on one day. For stored crops use optional stock carryover based on storage and loss assumptions; do not claim continuous fresh harvest year-round when infeasible. Forecast low/base/high or uncertainty intervals, document missing parameter and local calibration. Round seeds, trays and whole plants up, not fractional physical objects. Preserve recipe portions and agricultural units.

Schedule backward from harvest week and method-specific duration. Generate possible sow/transplant windows and operation graph, apply local earliest/latest windows and safety constraints, calculate planned quantities, then assign space/time. Use successive sowings for repeated demand, consolidate nearby weeks only when harvest window/storage makes it credible. Examples such as four weeks nursery plus six weeks growing are illustrative from the discussion and never hardcoded across species.

### 8.3 Constraints and objectives

Hard constraints (where known/reviewed): no overlapping exclusive allocations, physical area/spacing, required protection/light/soil compatibility, occupied/perennial/fixed areas, cultivation windows/frost constraints, nursery capacity, required operation precedence, reviewed crop rotation prohibitions, inaccessible or disabled resources, known essential-care deadlines. Combination templates explicitly permit defined shared footprint only. Constraints with unknown values are identified, not presumed satisfied. Allow coordinator overrides of appropriate soft agronomic preferences, with recorded rationale; never bypass access controls or present an impossible space allocation as valid.

Soft objectives: satisfy desired weekly demand as closely as possible; minimize shortage and surplus, improve land use, reduce unrealistic workload peaks, avoid unnecessary changes to existing approved plans, prefer compatible combinations and succession, and maintain rotation quality. Show tradeoffs and configurable priorities before locking default weights. No objective to maximize member engagement or monetary return. Do not optimize the plan as if volunteer hours were a fixed budget: forecast required labour first; commitments emerge as members sign up. Where realistic estimates exist, surface peak workloads and suggest moving work within biological windows. Uncovered work and critical tasks remain visible; no automatic reduction of animal care or other essential work.

### 8.4 Planning workflow and revision control

1. Create annual draft with configurable local climate, areas, plan horizon and assumptions; import or enter reviewed catalogue/map data. Collect member choices and direct demand targets.
2. Snapshot inputs and calculate candidate batches, quantities, allocation and operation windows. Return feasible plan or partial plan with explainable constraint conflicts (seed timing, unsuitable bed, missing geometry, nursery space, demand not in season, workload, rotation, etc.). Never silently drop unmet demand.
3. Coordinator reviews full year timeline, weekly demand vs supply, space map, labour and material forecast, exceptions and input quality. Allow manual locks/overrides for specific beds/batches, direct edits, recompute affected parts and compare alternatives.
4. Explicitly approve/publish plan revision; generate task occurrences, expected material requirements and forecast notifications through idempotent internal services. Draft does not create real volunteer commitments or stock movements. Show baseline and current estimated plan separately.
5. Actual operations update current state; new preferences, crop failure, delayed operations, stock or space changes generate a forecast/draft delta. Preserve completed operations, commitments and labels. Coordinator reviews changes before publishing consequential revisions. If existing claimed tasks are affected, retain assignments unless explicitly changed and notify relevant members.
6. Close season, record actual yields/labour/losses, compare with baseline, improve local cultivation/operation estimates with reviewed historical evidence, archive history and support next year's rotation.

**PROPOSED implementation:** pure planning input/output schema with versioned algorithm and deterministic stable ordering; candidate generation, time/space assignment and scoring. Store input hashes/versions, constraints, chosen allocations, diagnostic output and approval state. Use fixed seed or deterministic tie-breaker, time limits and best-known feasible result; never imply global optimality if heuristic/time-limited. Isolate calculation from database writes and use transactionally applied diffs. The planner must work when AI is entirely unavailable. Test with small enumerated fixtures before scale. Exact rotation intervals, companion templates, objective weights, local agronomic sources and agronomic safety rules are open for domain review.

Acceptance: same data snapshot produces reproducible plan; a synthetic multi-week demand scenario creates expected successions, respects geometry and reviewed intercropping, identifies missing resources and does not double-allocate; insoluble plan reports unmet demand with reasons; manual locks and previous crops are respected; approval creates each operation once; replan cannot erase actual harvest or completed work. Compare algorithm on small brute-force/verifiable fixtures before claiming optimality. Benchmark with actual garden scale once mapping is available.

## 9. Operational dashboards and harvest measurement

### 9.1 Coordinator's annual plan workspace

**REQUIRED:** show an entire year at a glance and allow drill-down by week, crop/variety, area and bed. Proposed views:

- Demand/supply/actual: weekly target versus forecast usable harvest versus actual harvest, crop-filterable, shortages/surplus and revised forecast. Monthly summary in addition to weekly, not instead. Keep units compatible; totals in kg only for crops with reliable weight or conversion. Show expected range and incomplete measurement coverage.
- Labour: weekly estimated person-hours by operation and domain, committed person-hours, completed actual hours, uncovered workload; drill down to generated tasks and sessions. Avoid counting multiple signups for the same hours or assuming an event registration equals working time.
- Space: weekly utilization and map, Gantt with occupied windows, nursery capacity, succession/combination, fixed reservations, planned vs actual; highlight unallocated demand and unknown geometry.
- Stock and procurement: upcoming materials required by date, current availability, shortages, outstanding procurement tasks.
- Exceptions: missed sowings, insufficient germination, delayed transplant, uncovered essential care, schedule conflicts, incomplete catalogue data, harvest shortfall, pending plan review.

Each chart labels time range, units, scope, estimate vs measured and uncertainty; accessible data table and export (CSV proposal). Summaries link to source records and underlying assumptions, not duplicate mutable data. Do not show invented numbers as real forecasts. Use synthetic fixtures for demos.

### 9.2 Harvest and feedback

Replace reliance on free text with structured harvest measurements: quantity, unit, crop/variety/batch/bed, harvest time, optional quality/usable portion, note and photo. Preserve existing free-text history and photo/media; legacy entries without a reliable conversion remain unquantified, not zero or guessed. Support repeated picks per batch and partial harvest; correction creates audit trail or reversible revision. Distinguish produce harvested from remaining availability or actual distribution (allocation mechanism still open). Do not require a photo simply to record a weight unless product owner explicitly retains that restriction; proposed optional photo for routine measurement. Allow actual labour at task or session level without forcing volunteers to fill timesheets. Compare local outcomes with planned assumptions, review updates to catalogue yield/labour coefficients instead of blindly fitting sparse data.

Acceptance: record 2 kg and later 1 kg of a batch, forecast/actual charts show 3 kg actual without modifying baseline; a legacy 'two baskets' remains visible but excluded from kg sum; user can distinguish fresh availability from expected harvest and see data coverage; member sees recipe readiness based on real available data or clear forecast labels.

## 10. Tasks, volunteer scheduling and work instructions

### 10.1 Shared task model

**REQUIRED:** generate a concrete task list from the approved cultivation plan; members can claim tasks and plan their participation by week/session. Reuse existing tasks API and data rather than build a parallel agricultural task system. Support manual tasks and recurring operations across all domains. Generated work remains visible and manageable independent of AI.

Conceptual extensions (map to existing schema with explicit migration):

| Entity | Data/behavior |
|---|---|
| Work instruction template/revision | Operation type, title, purpose, steps, tools/materials, short video where available, precautions, difficulty, skills, time estimate, success/completion criteria; localized, reviewed and versioned. |
| Task occurrence | Stable ID, origin (manual/plan/recurrence/observation), origin version and unique generation key, target batch(s)/bed/segment/tray/area/coop, associated work session(s), instruction revision, earliest/preferred/latest time, priority, dependencies, expected quantity and person-hours, status and completion criteria. |
| Work commitment | Member, task, optional session/time slot, expected contribution hours or quantity, status (claimed/confirmed/released/completed), timestamps; multiple people may share a task. |
| Actual intervention | Who (internal only), when, target, action, actual quantity, unit, optional actual hours/notes/photo; may be unplanned; linked to task when relevant. |
| Task recurrence | Template, rule, local timezone, validity period, exception/cancellation, priority/essential-care deadline; generates bounded future instances with stable keys. |
| Work session | Existing event extended with task agenda, volunteer signup and optional availability intervals, linked tasks, attendance, completion summary. |

Keep task lifecycle and individual commitment separate. A task may be open for additional participants even if some have claimed work; distinguish coverage, progress and completion. Coordinator can assign/adjust/skip/archive with reason. Member can claim or release own commitments without penalizing absence, record partial or full work, and access instructions. Define sensible status transitions and backwards compatibility for old `claimed_by` and `completed_by`; preserve audit history. Do not equate claiming a task with doing it. All changes remain subject to server permissions and private-area visibility. Prevent duplicate completion/claim races with transactional validation and idempotent operations. An authorized member can complete open/unplanned work without first artificially claiming it when existing rules allow.

A location and a work session are distinct references. Replace the legacy exclusive area/bed/event reference constraint safely; inherit the most restrictive visibility of linked operational targets, rather than union of permissions. A task can link to nursery source, destination bed and session without losing traceability. Keep original IDs and translate legacy references during migration. Do not double-create activity and task records when one completion event can drive both views.

### 10.2 Labour estimation and coverage

Each operation template has an editable estimation basis: setup/cleanup time plus variable time per unit (per seed/plant/tray/row/metre/m² or other task), optional crew-size/skill effects if reviewed. Estimate person-hours, not simply elapsed clock hours; ten people working for two hours contribute twenty person-hours, but do not assume speed scales linearly (tool/space bottlenecks). Reuse actual historical observations to improve estimates with coordinator review. Display estimated vs actual, not performance scores by person.

Example work session: end of February, 600 plants, 10–15 volunteers. The session board shows preparation, sowing separate batches, labels, watering and cleanup, each with target quantity, duration, available roles, instructions and capacity. The example discussed was 14 person-hours total; this is fictional, not a crop-specific validated productivity assumption. Members can book time and choose a particular task (peas, squash etc.) rather than merely indicate attendance. Coordinator sees overlapping time slots, bottlenecks, committed vs required hours and unclaimed work. Do not mandate a fixed volunteer-hours budget or compulsory weekly declarations.

Weekly coverage metrics: sum estimated remaining task person-hours in applicable windows, sum non-duplicated commitments, display uncovered work and essential tasks separately. Allow a volunteer to indicate availability without committing to a specific task, but do not count availability as committed labour. If a commitment is withdrawn, reopen the relevant capacity and notify according to preferences. Suggest moving flexible tasks only within valid operational windows; do not silently reschedule confirmed activities.

### 10.3 Contributor experience and task-linked education

**REQUIRED:** education initially attached to actual work, not a standalone course platform. Each generated task answers: what, where, when, how, with which materials/tools, and what constitutes success. Provide short practical video when available, clear steps, common mistakes and precautions, estimated effort, expected quantity, difficulty and any supervision requirement. Show destination bed/segment and source tray for transplant; show clear harvest criteria for harvest tasks. Allow completion with minimal taps and optional actual time/quantity, observations and photo. Use structured defaults without hiding uncertainty.

Instruction templates are reusable by crop/profile/operation, not copied into every bed. Preserve existing bed-specific videos and link useful ones to templates through curator review; respect existing privacy/YouTube settings. For video use an authorized source or own garden footage, do not fabricate media. Keep instructions available as text even if video cannot load. Coordinators review changes; critical animal care, machinery and safety translations require validation. An instruction revision used by a completed task remains traceable; do not rewrite historical instructions silently. Members can propose improvements for review. Avoid asserting novice independence for tasks that need supervision.

### 10.4 Event-day operations and recurring work

Carry forward the original roadmap's event milestone: actual attendee check-in and attended/no-show, opening/closing registration windows, visible waitlist/cancellation status, recurring sessions with individual exceptions, accurate completion summary and privacy-safe WhatsApp-ready copy. Reuse existing event states, participant age-band counts, iCalendar and waitlist rebalance; don't collect children's names/exact ages. Keep public registrations separate from private tasks and member access. A work session can have multiple tasks and time slots. Public registration must never grant private garden access. No external email/WhatsApp automation required; existing manual sharing remains.

**REQUIRED:** weekly flexible participation, especially for recurring work; recurrence describes the task, not a compulsory recurring volunteer. Optional recurring commitments with week-by-week adjustment were discussed as a possible convenience, not mandated. Recurrence jobs are idempotent and use local timezone/calendar dates; support exceptions and edits to a single occurrence or future series, preserve past completions. Never duplicate tasks on restart/plan reapproval. Generate bounded horizon with enough warning for essential coverage; track skipped/cancelled reason.

### 10.5 Operational logging

Quick Log stays accessible; a volunteer can record watering, weeding, pruning, planting, mulching, harvest, clearing, observation, problem or photo against the right target. If a matching open/claimed task exists, propose linking/completing only if actual quantity, action, actor authority, timing and target match; ask when ambiguous or claimed by someone else. Unscheduled work remains an intervention, not an invented preexisting task. Partial work updates remaining scope. Update inventory/batch/forecast only as relevant and transactionally. Allow corrections/undo via explicit records so actual history remains trustworthy.

Acceptance: coordinator creates task manually and plan generator creates one equivalent type; two volunteers claim distinct contributions, one cancels without losing remaining work; work session and weekly coverage agree; a novice sees short instructions and completes a partial transplant; actual quantities and task remain consistent; no duplicate recurrence/approval/confirmation; members cannot infer private linked resources; original event/invite/quick-log flows survive.

## 11. Inventory and procurement without financial management

**REQUIRED:** a lightweight inventory linked to planning, not accounting. Cover seeds, seedlings where useful (avoid duplication with batch counts), potting mix, compost, trays/cells, labels, fertilizer/approved inputs, tools/equipment availability, chicken feed/bedding and other relevant consumables. Model reusable equipment separately from consumed items. Do not add cost, budget, invoicing, margins, payment or monetary KPIs.

Proposed model: inventory item with canonical unit and type, location and stock lot (variety/seed product, expiry/viability, lot source/date for seeds), quantity on hand, reserved, condition (when relevant), stock movement (receipt, consumption, adjustment, disposal, transfer, reservation/release), actor/time/internal links, and expected future need by plan/task/window. Track actual quantity via movement, not an unreviewable overwritten number. Seed lots consumed by sowing linked to cultivation batch. Reusable trays are reserved/occupied/released, not consumed every time they are used. Support unit conversions with explicit factors; unknown seed packet count remains unknown.

On plan calculation, produce total gross requirements by crop/material and date. Net requirements = future required quantities less available compatible stock (account for prior reservations/expiry/reusable capacity and expected receipts only if reliable). Avoid double-deducting existing reservations or counting one lot for multiple incompatible batches. Consolidate purchasing list by needed item/variety/supplier and earliest date, with rounded packet quantities when known. A coordinator can adjust/substitute a suitable variety with planner review. Generate a procurement task or checklist; no automatic purchase or sending order to supplier. Receive stock explicitly, then consume when operation performed; task completion may propose appropriate material movement, but not silently consume planned amount if actual differs.

Provide quick stock count/correction, searchable inventory, shortages, future needs, batch links, stock history and export. Preserve access restrictions where an inventory location is private. Missing quantities should be visible rather than assumed zero. Avoid rigid negative stock bans that block recording real work; if negative is allowed, flag and reconcile explicitly (OPEN policy).

Acceptance: planned 600 plants generate seed/tray/potting requirements using reviewed coefficients; existing seed packets reduce purchase quantities; reused trays are reserved not consumed; two batches cannot reserve the same seed stock twice; received stock changes availability and actual sowing decrements correct lot; no financial fields or automatic external orders.

## 12. Chicken coop, other domains and operational safety

**REQUIRED:** the chicken coop joins the same operating system as garden and nursery; authorized coordinators oversee all. Provide recurring tasks for feeding, fresh water, cleaning, egg collection, observations, and other care procedures as defined by the owner/qualified guidance. Use actual coop configuration and human-validated care schedules; do not invent universal frequencies or veterinary protocols. Care differs from flexible garden work: a strict deadline/coverage plan is necessary.

Proposed essential-care workflow: task occurrence has local deadline, essential-care flag, explicit responsible coverage, early warning, unclaimed/late state and escalation to designated coordinator(s). Member can release a commitment; the occurrence reopens and escalation is recomputed. Verify actual completion separately; a volunteer's sign-up or a delivered push is not proof of care. Display a manual fallback roster/contact procedure and require owner-approved operational responsibility before relying on app reminders. No automatic medical/veterinary diagnosis or actions; observation can notify coordinator and link vetted guidance. Track egg collection in appropriate units, feed/bedding inventory, coop tasks and equipment; no individual animal-health data model until required. Preserve children's garden, compost and general infrastructure tasks without forcing crop-specific fields on them.

**OPEN:** exact care schedule, alert lead time/escalation policy, responsible fallback individuals, and treatment of notification-disabled users. The app cannot guarantee that animals receive care. Until human-approved contingency procedure exists, show coverage in app and keep external/manual arrangements in place.

Acceptance: generate required care occurrences without assigning volunteers automatically; cancel one week's commitment and expose uncovered duty; essential care is flagged before/after deadline according to approved policy; offline/notification failure does not mark task done; coordinator can see combined garden/nursery/coop workload; non-crop tasks operate without a cultivation batch.

## 13. Community, notification and content architecture

### 13.1 Feed and sharing

Keep existing feed, private posts/replies/photos, unread state, member communication and public website as distinct surfaces. Community workspace becomes the primary feed home when selected. Complete earlier feed roadmap: contextual links to permitted area/bed/batch/task/event, questions and resolved answers, pinned announcements, editing by author where authorized and moderation with minimal audit. A linked thread respects the most restrictive context; no leaking private names, photos, search snippets, counts or notifications. Preserve original authored content and revisions. No private messaging, arbitrary group chats, presence, read receipts or engagement ranking in initial scope. Search and knowledge library later as in §16; contextual navigation earlier.

Auto-generated milestones should be meaningful (e.g. first seedlings sown, transplant finished, harvest window changed, collective achievement), not every routine watering. Provide explicit categories/preferences and aggregation. A community update is distinct from an authoritative operation; posting 'I watered' does not change garden state until recorded/confirmed. WhatsApp-ready summaries are review-and-copy, not automatic external broadcasts.

### 13.2 Notification requirements

**REQUIRED:** notify interested members when cultivation relevant to their chosen recipes progresses or changes; inform volunteers of upcoming relevant tasks and schedules; surface uncovered essential work to coordinators. Reuse existing Web Push/VAPID subscriptions, daily dispatcher and preferences. Extend schema/services, do not create a second push stack.

Proposed categories: community posts/replies, my tasks/session changes, recipe/cultivation milestones, harvest-ready, coordinator planning exceptions, essential-care coverage. In-app inbox/read state and entity deep links for new categories (while preserving existing feed unread behavior); daily digest default for routine activity, separately controlled time-sensitive alerts for critical deadlines and explicitly subscribed commitments. Distinguish forecast availability vs confirmed harvest. Notifications generated from committed domain events only; deduplicate by recipient/event/revision, respect opt-outs, quiet hours and timezone where applicable, do not flood for repeated estimates. Route using internal member IDs and demand/batch links, never AI. Lock-screen push contains generic wording and no names, recipe choices or private details by default; authenticated app displays authorized content. Do not infer identity or access from possession of a link. Preserve existing VAPID identity through backup. No email/SMS/WhatsApp service required.

Privacy note: Web Push sends data to browser/platform endpoints; treat endpoint and keys as confidential personal/operational data, never include them in AI requests. Existing YouTube embeds can contact external services; preserve clear privacy controls and document external dependencies. Notification delivery can fail; maintain in-app visibility and human fallback for essential work.

Acceptance: member selecting mizuna receives allowed progress update after actual sowing, then changed forecast when relevant; other members do not receive private preference-specific notice; ordinary digest stays bounded; a duplicate retry generates no duplicate notification; unauthorized/private area references never leak; opt-out works, failure doesn't undo committed work, old subscriptions continue after migration.

## 14. AI architecture, translation and contextual assistant

### 14.1 Shared optional API boundary

**REQUIRED:** one shared, optional, configurable AI integration. Inference is API-based regardless of where it runs; prefer OpenAI-compatible LLM interface. Candidate: inexpensive European-hosted DeepSeek endpoint, not selected or verified. Keep capability-level configuration for translation, catalogue extraction, recipe drafting and interactive assistant; independent speech endpoints later. The complete garden operation, planner, recipe selection, tasks, inventory, authorization and backup work without AI. No direct model database connection or SQL. No vendor lock-in.

Proposed implementation: internal provider adapter with endpoint, model, secret reference, timeout, token/input limits, optional streaming/tool support, feature flags, region/policy metadata, server-side test connection, error handling and usage counters without raw prompts. Use existing single Node container and a durable SQLite-backed queue for suitable background jobs (translation and catalogue extraction). Interactive chat requests need not be persisted in queue; active context ephemeral. Isolate provider I/O from transaction scope; bounded concurrency, backoff/retry, cancellation, failure states, idempotent result application, stale-revision protection and resource limits. No Redis/Kubernetes or separate worker container unless evidence warrants. Keep manual alternatives. For external API endpoint configuration restrict to admin, prevent SSRF and uncontrolled redirects/DNS rebinding, restrict hosts/schemes/ports via deployment policy; local/self-hosted endpoints may be allowed explicitly, not reachable by arbitrary user-supplied URLs. Credentials are secrets, never browser-exposed, model-visible, logged or committed. Mock adapters in tests; no silent fallback to unauthorized provider.

### 14.2 Translation, existing storage and quality

**REQUIRED:** contextual AI-assisted translation in French, Flemish/Belgian Dutch and English. Reuse `localized_content` and `content_translations`, not a duplicate subsystem. Preserve original, source language, source revision, stale detection, manual export/import and original-language fallback. Extend allowlist to recipes, crop/variety names/descriptions, cultivation profiles, instructions, task content and, only with policy approval, feed posts/replies and other allowed free text. Separate UI localization from authored text translation; interface strings reviewed as code resources and remain functional without AI.

Translation job key: entity type, field, source revision, target locale and policy/model version where needed. On create/edit/publish, enqueue missing or stale allowed target languages; include content type, reviewed gardening glossary, audience and minimal text context, not identifiers or author profile. Validate result format, lengths, and language as feasible; store with source revision and provenance/review status (schema extension proposed). On completion recheck revision and preferences; discard stale or now-disallowed results. Do not call provider on every page view. Protect human-reviewed corrections and safety-critical translations against automated overwrite; mark machine/pending/reviewed appropriately. Provide member feedback and coordinator correction workflow. Safety/animal care/machinery instructions need verified language versions or a clear approved source fallback; do not operationalize unchecked AI-generated safety instructions. Never invent translations for missing factual data. No sending whole export file with unnecessary IDs/metadata to automatic provider.

### 14.3 Assistant UX and product behavior

**REQUIRED:** contextual assistant accessible through one small launcher on each eligible page; opens only when pressed, same position/pattern across workspaces. It should know current page/entity context and use actual permitted data, not guess. User decides when to use it; no popups, surveillance or forced suggestions. Text-first; voice April branch. Provide accessible input/output, loading/error/cancel states and entity links. Distinguish answers based on records, forecasts, missing data and general guidance. Avoid falsely stating tasks or harvests are ready. When no suitable work is available, say so and provide alternatives supported by records.

Use cases by permission:

| Context | Examples |
|---|---|
| Community | What can I harvest/cook this week? Which recipe can be ready in June? When is the next session? |
| Contributor | I've got an hour; what can I do? Show the transplanting video. I just watered radishes in bed 58. The tomato leaves look yellow. |
| Coordinator | Which work is uncovered? What is the occupancy forecast? Which requested recipes face a shortage? Propose adjustments to draft plan or task priorities. |
| Administration | Explain application settings/help, report safe operational health information; no credentials, arbitrary commands or private member dumps. |

For recommendations, deterministic internal filtering/ranking uses task existence, permission, actual state, dependencies, urgency, location, time available, equipment, commitments and relevant approved preferences/skills (once implemented). Model presents candidate summaries in natural language and may ask questions; advanced tasks remain discoverable. Explain why recommended and offer a suitable learning opportunity when relevant. Do not let LLM invent work or unilaterally alter priorities. Assistant may suggest new tasks to coordinators as a separate proposal, never confuse them with existing tasks.

### 14.4 Read tools, action proposals and executor

**REQUIRED:** assistant can perform authorized actions after explicit user confirmation. ParcOS is sole source of truth; LLM interprets, application validates and persists. Tool catalog server-controlled, typed, capability-scoped, session authorization for each read/write. External model cannot access database, arbitrary URLs, shell, SQL or unrestricted HTTP. Read results restricted to allowed fields/context; internal actor IDs stay in app, external tool references may use scoped opaque aliases. User-supplied content, retrieved documents, catalogue text and model outputs are untrusted; treat embedded instructions as data, not authorization. Prevent prompt injection from expanding tools or access scope.

Proposed tools (align names with actual app services):

| Read | Confirmed action proposal |
|---|---|
| `find_bed`, `get_batch_context` | `record_intervention`, `record_observation`, `record_harvest` |
| `list_available_tasks`, `get_task_instruction`, `get_my_commitment_summary` | `claim_task`, `release_task`, `complete_task` |
| `list_events`, `get_harvest_availability`, `get_recipe_feasibility` | `register_for_session`, `select_recipe_week` |
| `get_weekly_workload`, `get_plan_exceptions`, `get_inventory_shortages` (authorized) | `propose_task`, `propose_plan_revision` (coordinator review) |
| `get_current_preferences` (local only) | `save_preference`, `edit_preference`, `remove_preference` |

Model output is an untrusted structured suggestion, never a write credential. Resolve exact target server-side; validate types, units, bounds, permissions, current revisions and linked context. Show clear action preview (target, operation, quantity, affected task/stock/plan, before/after if consequential), require explicit confirmation scoped to proposal payload/actor/session, with expiry and idempotency key. A conversational 'yes' is not sufficient if ambiguous; routine unambiguous work gets one confirmation, consequential changes get detailed review, destructive/admin/plan-publish operations remain explicit authorized UI actions until deliberately supported. On confirm revalidate state/permission, execute via existing domain service in transaction, record actor/time/source/action and relevant audit trail, then report actual success or failure. No durable raw chat log in audit. Allow cancellation, correction/undo where domain permits. Handle duplicate confirmations and concurrent claims; if state changed, present a fresh proposal. Proposal creation must never change actual garden state.

Example: 'I've just watered the radishes in bed 58.' Resolve bed code (ask if several areas contain 58), active radish batch, existing compatible task. Preview 'Record watering now for bed GP-58, radishes, and complete matching watering task?' Only after confirmation write intervention and link/complete if authorized and scope matches. No task? Record intervention only. Ambiguous quantity? Ask or record unknown, not invented. 'Yellow leaves' logs observation after confirmation, optional photo (photo sent to AI only with separate future approved policy); plant-health guidance labeled general/suspected, no automatic treatment. User can always use standard UI instead.

Acceptance: read-only grounding with existing fixtures; confirmed routine operation persists exactly once and updates applicable state; denied tool and private area never leak through response/error; malicious feed instructions cannot invoke tools; stale action requires review; provider failure cannot mark task complete; disabled AI leaves all manual flows intact.

### 14.5 Privacy: agreed intent, explicit policy gate

**REQUIRED:** account identity and personal administrative records never included in AI provider context. The owner wants an EU zero-retention endpoint, no training, data minimization, and no complex privacy filter by default for the private pilot. Important tension: a free-text request or conversation can contain identifiable/sensitive data even without attached names; zero retention does not mean no processing. Do not claim external unfiltered text guarantees no PII leaves the installation. Prior discussion considered lightweight data minimization preferable to a sophisticated automatic anonymization engine, not a blanket authorization to enable external AI now.

- Default deny data fields by capability. Never send account names/aliases, usernames, emails/contact, guest identities, passwords/hashes, invites/reset tokens, sessions/CSRF, push endpoints/keys, member IDs, private admin content, children's records or raw DB exports as context. Resolve identity, recipient relationships and authorization locally. Send minimal permitted crop/task/plan data and required text only; avoid exposing other members' identities or private areas via model context. Do not send full member profile, raw history or raw backup. No browser-side provider key.
- Proposed external modes: (1) disabled; (2) approved non-personal structured content only; (3) explicitly permitted free-text assistant/translation under reviewed policy with residual risk notice and opt-in/opt-out controls; (4) configured local processing with documented security/retention. Strict absolute no-PII external requirement means free-text translation/chat must remain local or excluded unless verified non-personal; a regex/NER filter cannot guarantee this. No sophisticated redaction service required for initial build. Keep provider approval and user choices configurable across self-hosted installations.
- Verify exact endpoint/contract, EU-only processing/inference/access and subprocessors, zero content retention including prompt/response/audio/monitoring/debug logs, no training, appropriate processing agreement where applicable, incident procedures and transfer restrictions. An OpenAI-compatible API is a protocol, not a privacy guarantee. No specific provider contract verified. No silent fallbacks. For live external processing, owner explicitly accepts policy and provider; until then mock/local or non-personal test data only.
- Inform members clearly about optional AI processing, choices and how to disable AI translation of their contributions. Preserve original messages, access/correction/deletion mechanism and reasonable retention. Avoid unsolicited processing of private conversations or children's information. Audio/image processing requires separate policy review. Do not log prompts, responses, audio or raw model tool contexts; diagnostic metrics only with redacted metadata and controlled retention. Audit confirmed operational actions without raw conversation. Document data flows and backup behavior.
- Private pilot context: personal OVH account, invitation-only neighbours, aliases/no email server, manual WhatsApp invitation sharing, no legal association described. Public software still has optional guest registration and push; do not generalize private pilot facts to all self-hosters. The GDPR household exemption may be relevant but is not established by invite-only status; zero retention is not automatic compliance. If GDPR applies, verify controller, lawful basis, transparency, processor arrangements, security and rights. Consent is not the sole possible lawful basis. Keep proportionate reusable privacy settings and short notices, not enterprise bureaucracy. Do not assume a formal association or require one. This specification is not a legal opinion or a compliance certification.

### 14.6 Explicit local memory and preferences

**REQUIRED:** no persistent chat history or silent profiling by default. Keep active session context temporary, stateless provider requests where possible, and store only explicitly approved preferences in ParcOS. User can inspect, modify, remove individual entries or wipe all assistant memory. Suggested structured fields: preferred activities (nursery, coop etc.), preferred times, interests/skills to learn, language, detail level. Preference for mornings is not an actual weekly commitment. Avoid storing sensitive or unnecessary information. Assistant offers to save a precise preference only when useful; user sees content and confirms. Store approved data locally under own authorization; preference selection/filtering performed internally and only minimal derived candidate summaries sent to provider. No background inferred memory from transcripts, work logs or repeated questions. Allow opting out entirely.

Deletion invalidates active cached preferences and recommendations; session expiry/clear control deletes temporary chat state; define retention for server/browser, no durable transcripts in logs/queues/analytics, and document backup retention/restore implications (old backups may contain older preferences; avoid promising instant physical erasure from backups). A restore must respect documented deletion procedures. Do not silently reconstruct deleted preferences. Keep actual task/harvest history, skills evidence, event registrations and operational records distinct from personal assistant memory; wiping memory does not destroy legitimate community records. Access scope for competency data and coordinator visibility to be designed separately.

Acceptance: user explicitly approves 'I like working in the nursery'; stored preference appears in profile; recommendation changes; edit/delete/wipe changes recommendation and cache; no transcripts persisted after active session expiry; no entire member profile leaves server; preference choice does not create a commitment.

## 15. Voice integration — April 2027 branch

**REQUIRED:** separate experiment/integration branch targeted for April 2027; text assistant and garden planning not blocked by speech provider decisions. Owner is selective about voice quality and does not favor existing OpenAI voices. Consider reuse of the dual Intel Arc Pro B60 rig being built for Reachy Mini; RTX 6000 Ada is occupied and not the assumed target. Each B60's memory and software/runtime support must be verified for chosen models; do not assume pooled VRAM, throughput or compatibility. No definitive provider/model chosen.

Proposed modular voice path: independently configurable speech-to-text, OpenAI-compatible reasoning, text-to-speech API endpoints. Start with push-to-talk via launcher, clearly visible recording state, stop/cancel, editable transcript, streaming where supported, interruptible playback, text fallback, explicit confirmation before actions; no always-listening microphone. Optional per-user voice selection. Support French, natural Flemish/Belgian Dutch (not generic Netherlands Dutch) and English (British English candidate from prior preference). Voice endpoint privacy separate from text endpoint; no raw audio sent to unapproved service. Self-hosted speech endpoints need authenticated access and secure networking from OVH; do not expose an unauthenticated inference API publicly. Consider outages/latency when local rig not available; fallback text, not unapproved cloud.

Experiment: compare Whisper/OpenVINO and candidate multilingual TTS via supported B60 runtimes with verified European zero-retention API options (e.g. Soniox/Azure candidates from discussion, not verified or selected). Use identical garden utterances across languages, evaluate accent, naturalness, pronunciation, domain vocabulary, background noise, interruption, end-to-end latency, concurrency, endpoint availability, quality and data retention. Record measured results and owner listening assessment; model-specific compatibility (including Qwen3-TTS on B60) unresolved. Keep voice server infrastructure separate/reusable across projects, not a dependency of core self-hosting.

Acceptance: user records 'I watered radishes in bed 58', reviews/clarifies transcript, hears grounded response, confirms explicit proposed write; cancellation works; no unintended writes on speech recognition ambiguity; acceptable outdoor latency and pronunciation based on agreed criteria, no claims before benchmark; text assistant still works if speech endpoint absent. April is a target, not a promised date for production-ready local TTS.

## 16. Skills, recognition and later knowledge

**REQUIRED direction:** skills help recommend suitable tasks, and volunteers develop skills by actually contributing. All advanced tasks remain visible; skill recommendation is not a hidden access barrier. Both individual and collective achievements are wanted; recognition must be constructive, optional and rooted in real contributions, not designed to keep people compulsively engaged. Detailed design is a separate workstream and should not block first 2027 planning release.

Proposed conceptual separation:

- Skills/competencies: task templates link to relevant skills; completion and learning experience provide evidence, not automatic proof of mastery. Possible levels beginner/independent/experienced/mentor, not final. Safety-critical work may require validated competence/supervision (rules to review); a user can browse such work and learn how to become eligible. Do not automatically grant machinery/animal-care authorization from completion counts or AI evaluation.
- Preferences: what a member likes or wants to learn; explicit local memory as above; do not infer ability or availability solely from likes.
- Achievements: meaningful individual milestones (first seed-to-harvest cycle, new technique learned, helping another member) and group milestones (measured communal harvest, garden project completed), optionally share/celebrate. No leaderboards, points races, punitive streaks, comparative productivity rankings, shame or excessive nudges. A member with little free time should feel welcome. Collective milestone requires actual evidence, not forecast.

**OPEN:** skill taxonomy, evidence and validation, whether to self-assess or have coordinator/mentor sign-off, visibility to others/coordinators, safety rules, milestone definitions, opt-in and presentation. Proposed: private competencies by default, selectively visible verified safety capability; sharing individual achievement voluntary; collective recognition without member rankings. Don't implement arbitrary thresholds until design review. Prepare compatible links/evidence but avoid prematurely building a full learning management system.

**DEFERRED:** searchable library of reusable articles/videos, member-contributed lessons and resolved questions, permission-aware search across tasks/crops/beds/feed/events/instructions, weekly summaries with source links. Original roadmap's knowledge/search remains valuable after task-linked instructions. Structured courses, quizzes, certificates or formal learning progression not in initial scope. Search must not leak private context. A coordinator can convert a resolved question into reviewed guidance, retaining link to source. No AI-required search in MVP.

## 17. Dependency-driven implementation roadmap

This is a proposed sequence, not agreed application version numbers. Each release has one primary outcome and acceptance scenario, with regression tests and compatible upgrades. Workstreams can run in parallel where contracts are stable. Do not delay the core production system for full design polish, all 200 recipes, a sophisticated solver, a comprehensive skills model or voice. Conversely, do not ship a planner that cannot account for space/time or silently invents data. Deliver an end-to-end thin slice early using a small reviewed catalogue and mapped subset.

| Milestone | Outcome / scope | Dependencies and exit criteria |
|---|---|---|
| M0 — Reconcile and protect | Inspect HEAD; update roadmap/product brief and source docs; local demo, backup/restore test, baseline `npm run check`, gap list; identify migration plan. | Existing features verified or failures recorded. No production changes. |
| M1 — UX architecture | Prototype manually selectable workspaces; canonical routes, design tokens, task/admin separation; move feed to Community; responsive task/bed screens; retain Quick Log and all existing functions. | User review of actual mobile/desktop journeys; no permission regressions. Prototype seasonal screens before freezing navigation. |
| M2 — Agricultural foundations | Species/crop/variety/supplier/profile/operation model, reviewed seed data, physical bed metadata/map and batch lifecycle, normalized harvest model. | Small reviewed fixture and sample mapped beds; migrate old crop fields safely; direct and transplanted batches/history supported. Garden surveying runs in parallel. |
| M3 — Food choices and draft plan | Recipe/ingredient catalogue, weekly calendar/poll, portions, feasibility, demand aggregation, deterministic backward scheduling first slice. | Member selection -> quantified demand -> explainable proposed batches -> review; handle impossible timing. No guarantee of harvest. |
| M4 — Space and approved plan | Automatic allocation, bed timeline/map, nursery capacity, successions, reviewed intercropping, rotation, forecast & workload charts, approval/revision/delta. | Feasible mapped-subset plan with unmet-demand diagnostics; approved revision produces idempotent operational events. Task foundation M5 must be ready where approval generates tasks. |
| M5 — Operational execution | Extend tasks, reusable instructions, multi-volunteer commitments, event/session attendance, actual interventions, labels/trays, inventory/net purchasing, notifications and feedback. | Approved plan -> procurement/sow -> labeled batch -> transplant -> harvest -> actual vs forecast. Build minimal task/stock/label support in parallel with M2–M4; extend once vertical slice works. |
| M6 — Expand crop coverage & readiness | Curate toward ~200 recipes, import permitted supplier catalogue data, calibrate local profiles, expand mapped areas, actual 2027 plan review; improve solver based on real bottlenecks. | Owner validates plan/assumptions, seed and labour shortages visible. Preserve manual work if map/catalogue incomplete. |
| M7 — Coop and recurring operations | Flexible weekly recurring care, essential deadlines/coverage, inventory and egg collection, human contingency. | Human-approved care/escalation policy and no uncovered work hidden. Shared operations already available; can proceed independently as needed. |
| AI-A — Shared service & translation (parallel) | Provider adapter, capability allowlists, local durable jobs, glossary and existing revision-aware translation pipeline; optional catalogue extraction. | Mocked API tests; verified privacy/provider gate before live use. May begin in M2; never block planner. |
| AI-B — Text assistant (parallel) | Quiet contextual launcher, read tools, confirmed writes, explicit memory. Start with task discovery, instructions, quick log; add garden planning tools as domain services mature. | Grounded answer, verified bed action, explicit confirmation and authorization tests; no permanent raw chat. |
| AI-C — April 2027 voice branch | Independently configurable STT/TTS; compare B60/Reachy reuse and approved providers. | Benchmark/voice preference decision, privacy and usability review; text fallback. |
| L — Skills & recognition | Separate design review, then appropriate recommendations and positive individual/group achievements. | Owner-approved competency and recognition rules; no punitive engagement mechanics. |
| K — Knowledge & search | Curated/member-contributed library, contextual search, reviewed summaries, complete feed refinements not already shipped. | Accessible and permission-aware, tied to operational instruction reuse. |
| Scale — conditional | PostgreSQL, object storage, multi-instance worker/container or other infrastructure only if measured limits justify. | Evidence, migration/backup path, small self-hosting preserved. No committed application 2.0 architecture. |

### 17.1 Suggested first vertical slice (not a release number)

Prototype UX and agricultural model with synthetic catalogue of e.g. lettuce/mizuna, tomatoes, carrots, beans, maize, squash and one reviewed combination; no fabricated agronomic values presented as real. Use two or three mapped synthetic beds, a nursery bench, 5–10 sample rights-cleared recipes, member weekly choices and demand, one direct-sown crop plus one transplant crop. Generate deterministic draft schedules and simple feasible allocation, review/approve, create minimal linked tasks, print labels, record sow/transplant and actual harvest, show weekly demand vs production/space/labour. Existing task/translation/notification services reused. This proves lifecycle before large imports or sophisticated optimization. Real garden mapping/catalogue curation starts concurrently, early enough for planning. Full tasks, procurement, recurrence and intercropping refinement follow incrementally; do not claim first slice delivers the entire product.

### 17.2 Calendar planning proposal (requires owner review)

Late 2026: UX prototypes, garden survey and catalogue preparation, baseline and agricultural migration. Early 2027: recipe poll, weekly choices and draft/approved production plan in time for actual crop windows; prioritize reliable timing for early sowings, even if some later features are manual. February/March: operational execution, label and procurement flows, real volunteer scheduling, harvest tracking. April: separate voice branch as agreed. These are suggested planning targets, not verified estimates or promised delivery dates. Reassess effort after repository reconciliation and avoid rushing unsafe data migrations. Missing data should allow a manual fallback plan rather than invalidate all garden work.

## 18. Engineering, migration, quality and release requirements

### 18.1 Architecture and schema migration

Preserve single-container Node.js/SQLite/static PWA unless a justified design review chooses otherwise. Modularize incrementally around domain services (catalogue, demand/planning, cultivation, tasks, inventory, notifications, permissions, AI) with clear interfaces. Use shared server-side domain operations from HTTP handlers, generated work and assistant executor; no duplicate business rules. Keep domain transactions short; do not perform provider calls or long solver computations inside write transactions. Maintain stable identifiers and canonical routes. New tables are conceptual proposals, not mandate to use exact names. Schema changes must integrate existing ordered migrations and foreign keys/indexes, preserve current role constraints and access rules, and safely handle legacy data.

Migration policy:

- Add physical fields and batch tables without destructively replacing `beds.crop`/`variety`/status. Map existing records to legacy/imported batch candidates with unknown dates/varieties when appropriate, or expose compatible legacy summaries until curated; do not infer historic start/harvest dates. Existing bed IDs/codes and photos remain intact. Define one authoritative source once migrated and avoid dual-write drift; use explicit compatibility view/adapter and migration tests. Preserve notes, tutorials, activities, harvests and their references.
- Normalize new harvest amounts and units without losing old free-text quantities or media. Existing unknown quantities remain unknown. Preserve language source revisions/translations when fields move, provide explicit mapping where needed.
- Extend tasks for multiple commitments and links. Translate old single claims into commitments, retain claimed/completed identities/timestamps/history, migrate exclusive location constraint with tested copy/rebuild strategy if necessary. Preserve idempotency and authorization. Existing task API behaviors retained via compatible contract or versioned deliberate migration.
- Extend events, notification categories and translations using current tables/service; migrate preferences with defaults preserving user intent, do not silently enable new alerts or external AI. Preserve VAPID identity and push subscriptions, existing feed unread cursors, media paths, roles, invitations and sessions according to policy.
- Back up before upgrade; test migrations from actual supported historical schema fixtures, fresh install and restart. Version backup format only if necessary, maintain documented restore compatibility or explicit migration path. Reject unknown newer schemas safely. No destructive downgrade; rollback with compatible backups and documented procedures. Test new media files, label assets, crop catalogue data, plan revisions, jobs, preferences and inventory in round-trip restore. AI secrets managed independently as deployment secrets or encrypted with separately protected key; document what complete backup includes/excludes. Restore must not silently activate unverified AI credentials or replay obsolete side effects/jobs; revalidate queued work on start.

### 18.2 Security and privacy controls

Preserve current scrypt passwords, hashed session/invitation/recovery tokens, CSRF, trusted proxy boundaries, authenticated media, private areas, explicit public publication, secure cookies/HTTPS and least-privilege container. Apply server-side authorization to every new resource, query, export, media, map, chart, search, feed context, notification and AI tool. No exposure of private counts/IDs via errors or aggregates. Protect public/private separation. Validate untrusted import data, quantities, units, filenames, MIME types, image limits, URLs and prompt inputs. Use parameterized DB queries, escape user content and preserve CSP. Handle concurrent claims/approvals/stock updates transactionally; enforce foreign keys and consistent references. Public repository and demo contain no private records, real invitations, credentials or copyrighted supplier bulk data. No new collection of email or child identities. Keep dependency footprint small and review supply-chain/licensing/security. Provide admin controls for role/access management and privacy settings; don't conflate workspace switch with privilege escalation.

### 18.3 Test strategy and acceptance gate

Use existing `npm run check` (syntax plus Node tests) and existing smoke, translation, notification, backup/restore suites. Extend tests for every new invariant. Proposed browser automation/visual regression only as needed; use synthetic data for screenshots and demos. Do not claim tests pass until run in target Node version. Required cross-cutting test matrix:

| Test category | Minimum scenarios |
|---|---|
| Regression | Invite/recovery, member/admin/coordinator roles, private/public event registration/waitlist, bed photos/logs, existing tasks, PWA, manual translation, push and backup/restore. |
| Catalogue | Idempotent import, duplicate cultivars, wrong units, unknown field, provenance/revision, no reviewed-value overwrite, localization. |
| Recipes | Portions and units, pantry excluded, seasonality/earliest date, overlapping ingredient windows, edits and snapshot reproducibility, private preferences. |
| Allocation | Bed area/subdivision, intercropping union area, rotation, successive/overwintering crops, nursery capacity, conflicting locks, unsatisfiable demand, missing geometry. |
| Lifecycle | Direct sow/transplant, partial batch split/transfer, loss/delay, forecast vs actual, labels reprint, no duplicate tasks, measured harvests and legacy free text. |
| Operations | Multi-member claims/partial completion, release, actual time, recurrence and DST/timezone, session registration vs commitment, essential deadline, stock reservations/consumption/shortages, notification deduplication. |
| Authorization | Role/area changes applied on each request, private link and aggregate access, public guest boundary, malicious URLs/imports, AI read/write scope, CSRF and prompt injection. |
| AI | Mock payload allowlist excludes identities, free-text policy, no live external test calls, stale translation, reviewed translation protected, tool schema validation, confirmation expiry/replay/concurrency, failure/cancel, memory wipe/session expiry, no permanent chat. |
| UX/accessibility | Four explicit workspaces, touch/keyboard/focus, small screen and desktop, all three languages, canonical links and correct context, error states, no automatic mode switch. |
| Data integrity and restore | Fresh install, supported migrations with real-shaped synthetic fixtures, rollback procedure, export/import, full backup restore, preserve identities/media/old records, no duplicate background work after restart. |

Release readiness: demonstrable user journey; schema compatibility/backup verified; authorized actions and privacy tested; all applicable existing/new checks pass or blockers clearly identified; docs and changelog updated; no feature flag falsely implying live provider configured. Use manual coordinator review for production plan and critical instructions. No deployment until owner reviews changed behavior and approves. Preserve public open-source quick-start; installation-specific IaC, credentials and OVH recovery live in separate private operational documentation, not public app repo. Do not turn OpenTofu/Ansible into a requirement for using ParcOS.

### 18.4 End-to-end acceptance scenario (reference test)

Use fixture values with explicit provenance `synthetic test`, not real agronomy. Set up a 2027 planning cycle and two gardens plus nursery and optionally coop; create reviewed species/varieties, cultivation methods and operation templates, known geometry with partial shade and existing rotation, stock, seasonal recipes and volunteers. Member chooses recipe for feasible week and servings. Aggregate ingredient demand, propose a plan with succession and reviewed intercropping, show impossible cases. Coordinator reviews mapped area, nursery cells, weekly workloads, harvest forecast and seed shortage, approves a revision. Procurement task records receipt; volunteers claim session time and individual sowing tasks, view instructions, record actual sowing and print labels. Germination count lower than forecast; see flagged shortfall and revised draft. Volunteer moves partial tray to correct bed, records quantity; recipient members see permitted progress. Subsequent intervention matches actual task, recorded once via UI and mock assistant confirmation. Harvest recorded with measured quantity, compare with baseline, notify relevant members and show recipe availability. Recurring coop duty appears in same board and uncovered duty escalates under approved policy. Restore backup and confirm all IDs, data/permissions and history intact. Repeat with AI disabled. This is the intended integration test for the full initial product, not a claim that the current baseline supports it.

## 19. Decision register — unresolved versus already settled

The following are real decisions still open, not permission to remove agreed features. Owner review can happen alongside development; synthetic defaults are acceptable for prototype only when labeled.

| ID | Open decision | Proposed initial approach / gate |
|---|---|---|
| D01 | Physical map survey, dimensions, sun/soil, usable area, nursery capacity | Start with measured subset and explicit approximate/unknown values; actual plan needs validated geometry. |
| D02 | Catalogue data access, licensing, supplier import cadence, regional agronomy and yield sources | Verify Semailles/Vreeken rights, curate small reviewed profiles, no bulk proprietary dataset in repo. |
| D03 | Recipe servings per choice, poll frequency, cutoff and distribution/reservation model | Editable portions, indicative demand, no guaranteed basket; clarify shortage allocation before individual reservations. |
| D04 | Production objectives, loss assumptions, rotation intervals, intercropping template details, storage carryover | Transparent configurable reviewed rules; no fabricated defaults, no unvalidated overlap, deterministic engine before optimizing weights. |
| D05 | Labelling printer/stock, QR format and optional scanning/offline behavior | Browser-print human-readable labels; opaque authenticated link plus text search; test physical printing before procurement. |
| D06 | Task time tracking, release/partial completion specifics, recurrence horizon, event policies | Low-friction optional actual hours; explicit commitments, reusable task templates, idempotency. Validate with volunteers. |
| D07 | Inventory discrepancy/negative-stock policy, material estimation coefficients | Preserve evidence, flag discrepancies, avoid financial scope; choose reservation and reconciliation rules before live use. |
| D08 | Animal care schedule, supervision, reminders/escalation and manual fallback | Human-approved configuration and coverage plan mandatory before relying on alerts. |
| D09 | Exact workspace navigation/design and default | Prototype with members, explicit switch, remember last choice or user-defined default; no automatic mode. |
| D10 | External AI free-text policy and provider contract, GDPR assessment, preference/notification defaults | Minimal allowlists, disabled until approved, clear residual risk; EU/zero-retention/no-training verified; no elaborate filter required unless strict policy changes. |
| D11 | Memory session expiry, backup retention/deletion policy | Ephemeral context, explicit local preferences, documented cache/restore behavior. |
| D12 | Skill taxonomy, validation, coordinator visibility, recognition presentation | Separate design workstream, both achievement types, no rankings/streak pressure. |
| D13 | Voice provider/model, natural Flemish voice, B60 runtime/latency, security/availability | April 2027 independent comparative experiment; no provider/model commitment. |
| D14 | Exact release numbering and delivery estimates | Assign after M0 and design review; no automatic 2.0 migration. |

Already settled and NOT open for reinterpretation: desired weekly harvest drives production; species/variety/seed catalogue and ~200 recipes are part of product; calendar-based member choices; automated backward planning and bed assignment; multiple crops including intercropping; nursery/batch traceability and printable labels; weekly workload and volunteer task claims; inventory/purchasing quantities with no budget; manual workspace selection and role separation; global coordinator responsibility; task-linked education first; shared optional API AI, grounded assistant with confirmed actions, user-controlled wipeable memory; both individual and collective achievements; voice branch April 2027. Do not defer the entire cultivation planning system to a later discussion just because detailed coefficients, mapping or optimization choices remain open.

## 20. Completion of reconciliation and limitations

This replacement incorporates the original four Markdown documents, the full product conversation on 26 November 2026 and the prior direct GitHub inspection of the v1.4.1 code/docs. It corrects the missing cultivation/food system, stale SQLite/MySQL uncertainty, notifications, existing translations, public registration, and omitted compost/infrastructure. It preserves prior event-day and knowledge milestones rather than discarding them. All proposed formulas, entity shapes, phased implementation, UI details and default policies require reconciliation/validation; the original roadmap remains repository history until Codex updates it deliberately.

No application code, live OVH installation, GitHub branch or existing user data has been changed. Repository source inspection did not execute tests, run the app or inspect production. Actual garden map, supplier permission, agronomic estimates, AI contractual/privacy compliance and B60 speech quality remain unverified. No final provider, framework migration, solver vendor, application version number or financial module is authorized. Owner's decision to target April for voice is preserved; other calendar targets are proposed. A spec is not proof of implementation.
