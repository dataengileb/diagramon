[← Diagramon](../README.md) · **English** · [Español](project-structure.es.md)

# 🗂️ Project structure

| File | Purpose |
|---|---|
| `index.html` | UI and styles. `#diagram-css` holds the styles that are also embedded in exports |
| `src/config.js` | **Everything you can customize**: themes, palettes, types, connections, animation and costs |
| `src/i18n.js` | UI texts in English and Spanish |
| `src/app.js` | Editor engine |
| `src/text-lang.js` | Text language (diagram as code) |
| `src/examples.js` | Templates |
| `src/export/mermaid.js`, `src/export/plantuml.js`, `src/export/drawio.js` | Exporters to Mermaid, PlantUML and draw.io |
| `src/export/xlsx.js` | Minimal ZIP and Excel (`.xlsx`) writer, no libraries (used by the inventory export) |
| `src/export/datacontract.js` | Data contracts (Open Data Contract Standard, ODCS v3.2.0 YAML, one file per dataset or all in one), written by hand with no libraries |
| `src/share.js` | Encrypted, self-contained HTML viewer for sharing |
| `src/iac.js` | Infrastructure-as-code import (Terraform, CloudFormation, Kubernetes, Compose) |
| `src/workspace.js` | Workspace (a folder of diagrams): recognizes Diagramon files, summarizes them (title, counts, format version, `docId`) and names new files; pure, no DOM. Reading and writing the folder is in `src/app.js` |
| `src/drift.js` | Design vs reality (pure, no DOM): pairs the components of a diagram with the resources of imported infrastructure by their `iac` address, proposes (never applies) matches by name and type, and lists differences in region, replicas, public exposure and backup. |
| `src/dbt.js` | dbt manifest import (`manifest.json` to datasets, quality rules, freshness and a lineage diagram); pure, no DOM |
| `src/models/*.js` | Pure models (no DOM) split out of `src/app.js` for v2, one file per area: `comments.js` comments and review threads; `radar.js` technology radar and end of support; `disposition.js` migration disposition (6R); `decisions.js` architecture decisions (ADR) and approvals; `raid.js` RAID log; `stakeholders.js` stakeholders and RACI; `requirements.js` requirements and their checks; `phases.js` phases (roadmap) and effort estimation; `status.js` status report; `datasets.js` datasets, catalog and freshness; `reliability.js` route reliability (availability). Each one adds its part to `window.DiagramonModels`. Files still marked "reserved" are empty and the code is still in `src/app.js` |
| `src/core/*.js` | Shared base of the interface, split out of `src/app.js` for v2 (add to `window.DiagramonCore`): `util.js` helpers (`$`, `esc`, `clone`, `store`, icons); `state.js` shared state `S` (plus `R`, `VW`, `HL`), fonts and views. `src/app.js` takes them back with one destructuring line |
| `src/ui/*.js` | Interface pieces split out of `src/app.js` for v2 (add to `window.DiagramonUI`): `dialogs.js` confirmation boxes and toasts; `panel.js` side panel width; `tabs.js` grouped tabs; `sidebar.js` providers, component palette and templates; `topbar.js` title and top bar buttons; `raid.js` RAID log tab; `people.js` stakeholders tab and RACI matrix (it also holds the decision export that sat in the same block); `reqs.js` requirements tab, traceability matrix and inspector section; `datatab.js` data tab (dataset cards: general, schema, quality, contract, lineage); `adr.js` decisions (ADR) tab, version and inspector sections, and approvals (sign-offs); `workspaceui.js` workspace dialog and design-vs-reality dialog (the screens for `src/workspace.js` and `src/drift.js`); `exportother.js` export to other tools (Mermaid, PlantUML, draw.io), data contracts, JSON, inventory (CSV/Excel) and dbt import; `exportshare.js` SVG/PNG export, legend and title block, multi-view export and encrypted sharing; `report.js` architecture report (PDF, Markdown, HTML) and status report; `inspfields.js` inspector fields (custom color picker, icon search, cost, data, layers, radar). Pieces that need app functions get them through a `ctx` object (`create(ctx)`): wrappers like `undo: (...a) => undo(...a)` when the function is used later, plain values when already defined at that point |
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

## Diagramon v2: splitting `src/app.js`

`src/app.js` is being split into smaller files without changing what the app does. The rules that keep it safe:

1. **Classic scripts, no modules.** Each file is a plain `<script src>` that adds to a `window` namespace (`window.DiagramonModels.<area>`). ES modules (`import`/`export`) do not load from `file://`, so they would break opening the app with a double-click.
2. **One area per pull request.** The PR moves the code to its file, leaves in its place in `src/app.js` one line that takes the functions back from the namespace, and points the tests in `tests/run.js` at the new file. No behavior changes in the same PR.
3. **The script tags and test loads are already in place** (`index.html`, `tests/run.js`), so PRs for different areas do not touch the same lines and can be worked on at the same time.
4. **`node tests/run.js` and `node tests/smoke.js` must pass.** Before merging, bring in the latest `main` and let CI run again, so two PRs merged one after the other are also tested together. `window.Diagramon` must keep the same API.
5. The previous version is kept in the `v1` branch.
