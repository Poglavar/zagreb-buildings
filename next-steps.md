<!-- Critical audit and prioritized next work for the public building explorer and claims export. -->
# Next steps — Zgrade Zagreba

Audit: 2026-09-22 · `/Users/simun/Code/zagreb-zgrade` · branch `main` · HEAD `cfffcab` · clean before this document.
Reviewed the frontend, 3D module, export scripts, local claims artifact and the narrowly relevant shared API in `../cadastre-data/api/src/domains/buildings/routes.js`. `npm test` passed **11/11**. Isolated source-function reproductions tested a selection race and inert HTML attribute injection; no claims were submitted. Direct live API/export requests returned 403 to this audit client, so production coverage and exploitability were not tested. No browser suite, database writes or export/publish jobs were run.

## Assessment

The explorer does valuable work separating cadastral, GDI, Overture and contributor values. Source-specific geometry, the GDI `×N` shared-object warning, direct-vs-dataset provenance links and a measured-versus-derived distinction are real strengths. The primary risks are untrusted values entering HTML, contribution provenance being user-controlled, and late asynchronous responses changing the wrong selection. The tests currently cover geometry only.

P1 = material correctness, security or core-function issue; P2 = reliability, usability and coverage improvement. A vulnerable source path is not evidence of a public compromise.

## P1 — Protect contribution integrity and selected-building identity

### 1. Text escaping is reused in HTML attribute contexts

`escapeHtml()` (`index.html:961`) serializes a div's text content. It escapes text delimiters but not quotes. `buildPopupHtml()` inserts that output into double-quoted `href`, `title` and input `value` attributes (`:1358`, `:1377`, `:1448`). Public claim URLs and remembered contributor names reach those contexts. A comment near the source tabs already acknowledges that this helper does not escape quotes, but the other attribute sinks remain.

The shared API's `isValidUrl()` checks URL protocol; the original string is stored. `new URL()` accepting a value is not HTML attribute escaping. A local inert proof rendered a quoted URL containing `data-audit`: parsing the generated anchor produced a separate `data-audit` attribute. No script payload or public POST was used.

**Fix:** construct dynamic links/inputs with DOM properties or use context-correct escaping, validate allowed URL schemes, and remove inline handlers for data-dependent values. Keep backend validation as an additional boundary. Audit all popup sinks, not just tab labels.

**Acceptance:** quotes, ampersands and markup in every contributor-controlled field remain literal data; attributes and handlers cannot be injected. Test rendering through a real HTML parser.

### 2. Contributors can impersonate system provenance and overwrite another source's assertion

`POST /claims` accepts free-text `source` and upserts on `(building_id, field, source)` (shared route `:1489–1556`). There is no reserved namespace check or contributor ownership check in this handler. The frontend interprets strings such as `cadastre`, `gdi`, `auto_estimate` and `gup:*` as trusted source categories (`index.html:830–929`). A user-entered source label can therefore look like system provenance; choosing another contributor's exact source can overwrite that row. Rate limiting does not establish who owns an assertion.

**Fix:** separate immutable source/provider identity, contributor display name and assertion identity. Assign the user-contribution namespace server-side. Preserve competing assertions and revision history; if anonymous editing remains desired, use an edit capability for one's own claim rather than making the display label an overwrite key.

**Acceptance:** public submissions cannot become GDI/GUP/cadastre rows, cannot replace another author's record, and can be traced through revisions without removing the open-contribution workflow. The implementation owner is the shared API as well as this frontend.

### 3. Numerical field constraints exist only in the browser

The UI limits years, floors, jobs and other fields and enforces integer counts (`index.html:1883–1888`). The shared route only requires a finite numeric value for numeric fields; it does not mirror the ranges/integer requirements. Direct clients can submit negative areas, fractional floors or implausible years, and claim values feed thematic maps/effective jobs.

**Fix:** define field metadata and validation once, enforce it server-side and reuse it for controls. Decide which zero values are meaningful. Distinguish a valid extreme measurement from a rejected malformed number and route extraordinary values to review when appropriate.

**Acceptance:** direct API fixtures reject negative/noninteger/out-of-range values consistently, while valid zero counts and well-supported exceptional values follow an explicit policy.

### 4. A late building response replaces the current detail with another building

**Reproduced from the real function:** `onBuildingClick()` sets `selectedCadastreId`, then awaits fetch and assigns global `currentDetail` without checking whether the selection is still current (`index.html:1782–1866`). A VM harness started buildings 1 and 2, resolved 2 first and 1 second: final state was **selected building 2, detail building 1**. The background Overture fetch has an ID guard, but the primary detail fetch does not.

`saveClaim()` similarly refreshes global detail after a POST even if the user moved elsewhere. `openBuilding3d()` only checks whether the dialog is open, not whether the response belongs to its currently named building, so close/reopen can publish an old model under a new title.

**Fix:** use one request generation/abort controller per selection and one per 3D dialog; gate every global/DOM update by both selected identity and generation. A save response should refresh only the building it belongs to.

**Acceptance:** out-of-order A/B responses, close/reopen, and save-A-then-select-B never replace B's content, model or source tabs.

### 5. Map movement during loading can be dropped

`loadCurrentView()` returns immediately if `loadInFlight` is true (`index.html:2195`). `scheduleViewReload()` invokes it after a pan, but there is no pending-request flag or current-viewport reconciliation in the first request's `finally`. If a user pans while a slow request is active, the later request can be discarded and the first viewport gets drawn until another movement occurs. Fetches also lack deadlines, so controls can remain busy indefinitely.

**Fix:** store the latest desired viewport/mode, cancel or finish the current load, and schedule the newest state before becoming idle. Bound requests and distinguish failed coverage from an empty map. Test an in-flight pan beyond the fetched bounds and a never-resolving endpoint.

### 6. The advertised self-contained export drops supported claim content

`scripts/export-claims.js` selects `value` but omits `text_value`. The shared API stores a `history_url` claim as `value = 0` plus the URL in `text_value`, so that supported type cannot be reconstructed from the export. It also omits AI uncertainty/range/reasoning metadata that the public detail UI can display. The local export currently contains no `history_url` rows; the loss is confirmed from the producer/consumer contract, not claimed as an observed lost local URL.

**Fix:** publish a versioned export schema containing the fields needed to reconstruct each supported assertion, provenance and revision timestamps. Preserve numeric/text types and source-specific evidence. Include a manifest with generation time, source cutoff, counts and checksum.

**Acceptance:** a text URL, a numeric claim and an AI year interval round-trip through export with their meaning intact; consumers distinguish an old unchanged record from an old failed export job.

## P2 — Make coverage, estimates and interaction more useful

### 7. Coverage needs denominators and measurement status

The local `data/claims.json` has **2,599 claims: 2,590 year-built rows and nine rows across five other fields**. Of the total, **1,709** have an `ai:` source prefix. Its latest record timestamp is 2026-04-16; this does not prove the export job stopped, because an unchanged successful export could contain the same dates. The claims archive is not the full merged API, so these counts do not establish citywide GDI/Overture coverage.

Keep the existing field-coverage picker, but add total eligible buildings, measured/derived/user/AI counts, unmatched footprints and source dates. Show zero observations separately from an unavailable coverage request; the current bootstrap catches building-type/coverage failures silently (`index.html:938`, `:1079`). Make employment/population heatmaps visibly estimates and calibrate them against independent totals before interpreting fine-scale precision.

### 8. Editing can lose unsaved input during background enrichment

`loadOvertureForPopup()` rebuilds the entire popup when data arrives (`index.html:1730`). `filterSource()` also replaces popup content. That replaces the claim form and can discard an in-progress value/URL/source without warning. Separate the form's state from table rendering or patch only source rows. Preserve draft values/focus across enrichment, tab changes and failed saves; prevent duplicate submit while a save is active.

### 9. Deep-link/navigation state is incomplete

The public app supports a building path and optional `?3d`, but `shareBuilding()` serializes only the building ID, losing thematic field, source tab, model visibility and API override. The deep-link loader waits a fixed 300 ms for map movement and runs outside the central load guard. Use an explicit map-ready/movement event and serialize meaningful viewing state. A local static server also needs the building-path fallback; the README's generic static-server command alone does not establish that refreshes on `/123` work.

### 10. Three advertised npm commands target nonexistent files

`package.json` names `scripts/server.js`, `scripts/estimate-jobs.js` and `scripts/build-3d-match.js`; none exists in this checkout. `npm start` therefore cannot start the advertised server. Remove obsolete commands or point them to the actual owning shared service/scripts, and provide a working local static/proxy command with no-cache headers and deep-link handling. Do not resurrect retired duplicate API implementations merely to satisfy stale commands.

### 11. Modal and map workflows need a keyboard equivalent

Information, classification, analysis and 3D overlays are class-toggled divs rather than a complete dialog focus lifecycle. Claim inputs mostly rely on placeholders and a group heading; source tabs have visual active state without a full tab interaction. Add field labels, modal semantics/focus return, accessible selected-source state and an address/building search plus result list. Keep mobile sheet behavior and existing reduced-motion CSS. Verify actual layout at 320–400 px and 200% zoom; this audit did not render those sizes.

### 12. Extract the stateful workflows before broadening features

The 2,388-line `index.html` mixes CSS, model classification copy, data contracts, rendering, mutations and request orchestration. The 11 tests cover `geo-local` calculations, not editing, source rendering, async identity or exports. Extract small pure field/claim/URL modules and a testable selection controller first; the meaningful regression cases are the failures above, not snapshots of the current monolith.

## Validation and limitations

- `npm test`: **11 passed**. Node also reported ambiguous package module type; clean that up when modules are extracted, without blindly setting all CommonJS export scripts to ESM.
- Source-function VM reproduction: two reversed response completions left selected ID 2 with detail ID 1.
- Inert HTML parser reproduction: the current text-escaping strategy allowed an extra attribute in a quoted link. No exploit was submitted to the live service.
- Parsed all 2,599 local export rows and checked package-script targets. No DB-backed collector/export was executed.
- Live field coverage and live claims freshness remain unverified after HTTP 403 responses to the audit client. The fetched [public page shell](https://zagreb.lol/zgrade/) establishes page content only, not API correctness.

## Valuable additions and order

1. **Evidence comparison workspace:** pin several source assertions, show their dates/geometries and explain which value drives each map.
2. **Correction/review queue:** surface disagreement and unsupported claims with a revision trail; preserve anonymous contributions without permitting source impersonation.
3. **Coverage missions:** suggest buildings where a sourced year, height or use would close a meaningful gap, rather than asking visitors to add arbitrary data.
4. **Reproducible area export:** download a bounded selection with measured/estimated flags, missing-value reasons, source dates and the exact calculation version.

Start with attribute handling, server-side validation/provenance and selection cancellation. Repair export completeness and dropped viewport loads next. Then improve draft preservation, accessible navigation and coverage before expanding analysis.
