[← Diagramon](../README.md) · **English** · [Español](project-structure.es.md)

# 🗂️ Project structure

| File | Purpose |
|---|---|
| `index.html` | UI and styles. `#diagram-css` holds the styles that are also embedded in exports |
| `src/config.js` | **Everything you can customize**: themes, palettes, types, connections, animation and costs |
| `src/i18n.js` | UI texts in English and Spanish |
| `src/app.js` | Editor core: canvas drawing and interaction, routing, views, C4 levels, the analyses (security, residency, STRIDE, availability, lineage), versions, file format, startup and the public `window.Diagramon` API. It wires together the pieces below |
| `src/text-lang.js` | Text language (diagram as code) |
| `src/examples.js` | Templates |
| `src/export/mermaid.js`, `src/export/plantuml.js`, `src/export/drawio.js` | Exporters to Mermaid, PlantUML and draw.io |
| `src/export/xlsx.js` | Minimal ZIP and Excel (`.xlsx`) writer, no libraries (used by the inventory export) |
| `src/export/datacontract.js` | Data contracts (Open Data Contract Standard, ODCS v3.2.0 YAML, one file per dataset or all in one), written by hand with no libraries |
| `src/share.js` | Encrypted, self-contained HTML viewer for sharing |
| `src/iac.js` | Infrastructure-as-code import (Terraform, CloudFormation, Kubernetes, Compose) |
| `src/workspace.js` | Workspace (a folder of diagrams): recognizes Diagramon files, summarizes them (title, counts, format version, `docId`) and names new files; pure, no DOM. Its dialog, with reading and writing the folder, is `src/ui/workspaceui.js` |
| `src/drift.js` | Design vs reality (pure, no DOM): pairs the components of a diagram with the resources of imported infrastructure by their `iac` address, proposes (never applies) matches by name and type, and lists differences in region, replicas, public exposure and backup. |
| `src/dbt.js` | dbt manifest import (`manifest.json` to datasets, quality rules, freshness and a lineage diagram); pure, no DOM |
| `src/models/*.js` | Pure models (no DOM) split out of `src/app.js` for v2, one file per area: `comments.js` comments and review threads; `radar.js` technology radar and end of support; `disposition.js` migration disposition (6R); `decisions.js` architecture decisions (ADR) and approvals; `raid.js` RAID log; `stakeholders.js` stakeholders and RACI; `requirements.js` requirements and their checks; `phases.js` phases (roadmap) and effort estimation; `status.js` status report; `datasets.js` datasets, catalog and freshness; `reliability.js` route reliability (availability). Each one adds its part to `window.DiagramonModels` |
| `src/core/*.js` | Shared base of the interface (adds to `window.DiagramonCore`): `util.js` helpers (`$`, `esc`, `clone`, `store`, icons); `state.js` shared state `S` (plus `R`, `VW`, `HL`), fonts and views |
| `src/ui/*.js` | Interface pieces: tabs, dialogs, inspector, exports and reports. One file per area, listed [below](#interface-pieces-srcui) |
| `samples/` | Sample IaC files and a dbt manifest (`samples/dbt/`) to try the imports |
| `assets/icons/*.js` | Embedded official icons for AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric |
| `tools/build-icons.py` | Builds `assets/icons/*.js` from the official packs |
| `assets/icons/logos.js`, `tools/build-logos.py` | Azure, Google Cloud and SAP logos for groups, built from `tools/logos/` |
| `assets/fonts/` | Bundled fonts (`.woff2`, OFL licenses) and the generated `fonts.js` |
| `tools/build-fonts.py` | Builds `assets/fonts/fonts.js` from `assets/fonts/*.woff2` |
| `tests/run.js` | Automated tests without dependencies (text format, exports, IaC and dbt import, translations, pure functions); run with `node tests/run.js` |
| `tests/smoke.js` | Browser smoke test without dependencies: opens `index.html` from `file://` in headless Chrome and checks startup (no errors or CSP reports), templates, views, exports, the encrypted HTML and the public `window.Diagramon` API; run with `node tests/smoke.js` |

## Changing the file format

Every JSON the app writes starts with `formatVersion`. Files from before the field existed count as version 0, and a file with a higher number than the app's opens with a warning, because anything this version does not know is lost on save.

When a change to the model would break old files (a renamed or moved key, a changed meaning), and not when you only add an optional field:

1. In `src/app.js`, raise `FORMAT_VERSION` and add `{ to: <new number>, up: doc => … }` to `MIGRATIONS` (between the `/* migrate:start */` and `/* migrate:end */` markers).
2. `up` must be pure: it receives a document and returns the converted one without touching the original. It runs on the root document and on every saved version snapshot (`versions[].diagram`), in order, starting after the file's version.
3. Add a test in the "Format version" section of `tests/run.js` with a document in the old shape and the expected result.

Templates, saved versions, new diagrams and the Text tab already come in the current format and skip the migrations. Files, local saves and the JSON tab go through them.

## Interface pieces (`src/ui/`)

| File | What it holds |
|---|---|
| `dialogs.js` | Confirmation boxes and toasts |
| `panel.js`, `tabs.js` | Side panel width and the grouped tabs |
| `sidebar.js`, `topbar.js` | Providers, component palette and templates; title and top bar buttons |
| `inspector.js` | The inspector itself: what it shows for each selection, field events and edits |
| `inspfields.js`, `inspconn.js`, `inspcomp.js` | Inspector sections: color picker, icon search, cost, data, layers and radar; STRIDE, encryption, region, governance and availability; compliance (section and matrix) and custom connection types |
| `comments.js` | Comment threads dialog and the import of a reviewer's comments |
| `raid.js`, `people.js`, `reqs.js`, `adr.js`, `datatab.js` | The RAID, Stakeholders (with RACI and the decision export), Requirements, ADR (with approvals) and Data tabs |
| `workspaceui.js` | Workspace dialog and the design-vs-reality dialog (the screens for `src/workspace.js` and `src/drift.js`) |
| `exportshare.js`, `exportother.js`, `report.js` | SVG/PNG export with legend and title block, several views at once and encrypted sharing; Mermaid, PlantUML, draw.io, data contracts, JSON, inventory and dbt import; architecture and status reports |

## How the code is split (v2)

Until v2, almost all the app lived in `src/app.js`, about 11,700 lines in a single closure. v2 moved the pure models to `src/models/`, the shared state and helpers to `src/core/` and the interface to `src/ui/`, without changing what the app does. `src/app.js` now holds about 5,800 lines. The previous version is kept in the `v1` branch.

1. **Classic scripts, no modules.** Each file is a plain `<script src>` in `index.html` that adds to a `window` namespace (`DiagramonModels`, `DiagramonCore`, `DiagramonUI`). ES modules (`import`/`export`) do not load from `file://`, so they would break opening the app with a double-click. There is still no build step.
2. **`create(ctx)` for interface pieces.** Each `src/ui/` file exposes `create(ctx)` and returns the functions the rest of the app needs. `src/app.js` calls it at the place where the code used to be, with one line such as `const { renderInspector } = window.DiagramonUI.inspector.create({ … })`. `ctx` carries what the piece needs from the app: functions defined later go as wrappers (`undo: (...a) => undo(...a)`), and values that change or are defined later (`WS`, `DUR_TIERS`) go as getters (`get WS() { return WS; }`), never as wrappers.
3. **Tests.** `tests/run.js` reads `src/app.js` together with the `src/ui/` files (the `UI_FILES` list), so a test that looks for a piece of code finds it wherever it lives. When you add a file to `src/ui/`, add it to `index.html`, to `UI_FILES` and to the table above.
4. **What it changes in practice.** Nothing for the people who use the app: the same features, the same files and the same public API. Opening the page takes a few tens of milliseconds longer, because the browser reads 55 small scripts instead of 23 larger ones. The gain is for whoever changes the code: smaller files, reviews that touch one area, and parts that can be tested on their own.
