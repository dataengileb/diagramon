[← Diagramon](../README.md) · **English** · [Español](roadmap-databricks.es.md)

# 🧱 Roadmap: ideas from the Databricks Reference Architecture

Databricks publishes its own interactive reference architecture tool, the
[Databricks Reference Architecture](https://databricks-industry-solutions.github.io/databricks-reference-architecture/)
([source](https://github.com/databricks-industry-solutions/databricks-reference-architecture)).
This page lists **what it offers**, **what Diagramon already has**, and a **roadmap of improvements** for Diagramon inspired by it.

Every idea is adapted to the project's principles: **no server, no network, no dependencies, no build step**, and everything in
English and Spanish. What does not fit those principles is listed at the end, with the reason.

> Reviewed in November 2026 against the public version (the Manufacturing board on Azure, in Spanish).
> If you want to take an idea, open an issue first to agree on the approach, as in the [main roadmap](roadmap.md).

---

## 1. What the Databricks tool offers

| Area | Features |
|---|---|
| **Content** | 70 industries plus a standard architecture, in a searchable picker (`⌘K` / `Ctrl K`). Each board specializes sources, ingestion, teams, consumers, use cases and apps; the platform in the middle never changes. 10 use cases, 4 Genie agents, 4 AI/BI dashboards and 4 Databricks Apps per industry. Medallion layers in each industry's own terms. The industry's data formats (FHIR, ISO 20022, FIX, DICOM…) linked to their standards bodies. |
| **Board structure** | Fixed bands: use cases and agents on top, then sources, the platform in the middle (ingestion, governance, medallion, serving), teams, consumers, published products and cloud services at the bottom. Each band can be expanded or closed, and there is a zoom to the platform alone. |
| **Simplified / Detailed** | Simplified keeps what you need to read the industry; Detailed adds the rest with captions, capability tags and descriptions. The choice is remembered, travels in the link, and every export follows it. |
| **Click any box** | Products: what it is, what the name does not tell you, capabilities, docs for your cloud, demos, courses, certifications, videos and related boxes. Use cases: the problem, who benefits, how it is built, components, customer stories and accelerators. Teams: personas, capabilities, use cases they own, a learning track. Sources: what the system does, who uses it and the data it sends (batch or streaming, shape, volume, cadence). Agents and dashboards: the data they read, top questions, KPIs. Every chip links onward and everything is reachable by keyboard. |
| **Cloud, region and maturity** | Azure, AWS or GCP redraws services and ingestion and repoints the docs links. Picking a region dims what is not available there, with a filterable table downloadable as Excel. A release stage filter: GA, Public Preview, Beta, Private Preview, Coming soon. |
| **Presentation** | 16 languages (Arabic and Hebrew right to left). *Branded* or *Categorized* product names. 5 platform shapes, 13 palettes that pass WCAG AA, light and dark. *Highlight* dots mark the boxes that have a customer story, connector, demo, course, video or accelerator. Animated data flows, a docked details panel, a 10-step guided tour and a feedback form. |
| **Share and export** | Every option lives in the URL: a copied link reopens the same board. PDF and PowerPoint with a cover, contents, the board (editable shapes in the PPTX) and a page per use case, agent, dashboard and app. PNG, animated GIF, standalone HTML, draw.io, Visio, SVG, Excalidraw and an editable YAML descriptor that imports back. *Edit* clones a board into a tab of your own, and tabs are remembered between visits. |
| **AI and agents** | An assistant that builds an editable architecture from a description, a whiteboard photo or a PDF (Claude models on Databricks endpoints). An MCP server with four tools: `list_industries`, `get_architecture`, `search_architectures`, `list_resources`. |
| **Engineering** | Static HTML with no build step and one dependency (js-yaml). Content as one YAML per industry, with a schema shared by the app and the tools. Public data (regions, stages, courses) refreshed by scripts. Checks before a board ships: regions, stages, heights, layout, links, label fit, i18n, exports, performance and YAML. |

## 2. What Diagramon already has (and Databricks does not)

Diagramon is a **workbench** for *your* architecture; the Databricks tool is a **reading catalog** of *its* platform.
So Diagramon already covers, and often goes beyond, several of its features:

| Databricks feature | In Diagramon |
|---|---|
| Animated data flows | Particles on connections and step-by-step **Flow** |
| Medallion layers | Bronze / silver / gold layers, data catalog, contracts and lineage |
| Round-trip YAML descriptor | The **Text** tab (diagram as code) and JSON, always in sync |
| PNG, SVG, draw.io, standalone HTML | PNG, animated SVG, draw.io, Mermaid, PlantUML and **encrypted** HTML that brings comments back |
| Presenting the board | Full-screen **Present** mode, group by group |
| Expanding or closing bands | Nested groups, closed boxes, views and **C4** levels |
| Excel table | Inventory in CSV / Excel and portfolio export |
| Light / dark | Light, dark and high contrast, two palettes |

And what Databricks does not have: costs and scenarios, availability and single points of failure, security review, STRIDE,
compliance, data residency, ADRs, requirements, RAID, RACI, versions, IaC import and comparison with what is deployed.
**This roadmap does not aim to copy the Databricks catalog, but to bring its reading and presentation layer to your own diagrams.**

---

## 3. Roadmap

Effort: **S** (one small PR) · **M** (several days, one area) · **L** (touches many areas or needs new content).

### Summary

| # | Idea | Phase | Effort | Inspired by |
|---|---|---|---|---|
| 1 | View state in the URL and deep links | 1 | S | Options in the address bar |
| 2 | Simplified / Detailed mode | 1 | M | Simplified / Detailed |
| 3 | Configurable highlight markers | 1 | S | Highlights |
| 4 | First-run guided tour | 1 | S | 10-step tour |
| 5 | Focus mode on a group | 1 | S | Platform zoom |
| 6 | Verified accessible palettes (WCAG AA) | 1 | M | 13 AA palettes |
| 7 | Brand or category names | 2 | M | Branded / Categorized |
| 8 | Multi-cloud equivalents | 2 | L | Azure / AWS / GCP switch |
| 9 | Availability by region and service maturity | 2 | L | Region and release stage |
| 10 | Rich component cards | 2 | M | Product details panel |
| 11 | Sources with a data profile and standard formats | 2 | M | Source cards, data formats |
| 12 | Use cases, personas and KPIs as elements | 2 | L | Use cases, teams, dashboards |
| 13 | Library of reference architectures by industry | 3 | L | 70 industries with a picker |
| 14 | Band layout | 3 | M | The board's band structure |
| 15 | Editable PPTX deck export | 4 | L | PDF and PowerPoint |
| 16 | Animated GIF export | 4 | M | Animated GIF |
| 17 | Excalidraw and Visio export | 4 | M | Excalidraw, Visio |
| 18 | Read-only standalone HTML (unencrypted) | 4 | S | Standalone HTML |
| 19 | Tabs with several open diagrams | 4 | M | Your own copy in tabs |
| 20 | More languages, including RTL | 5 | M | 16 languages |
| 21 | Local MCP server | 6 | M | MCP server |
| 22 | Prompt kit for your own AI assistant | 6 | S | Architecture assistant |
| 23 | Content quality checks | cross-cutting | M | Gates before shipping |

---

### Phase 1 · Reading and navigation (quick wins)

#### 1. View state in the URL and deep links · S

**The need.** In Databricks a copied link reopens exactly the same thing. In Diagramon the view, theme, language and selected
component are lost when you share or reload.

**Proposed design.** Keep **only the view state, never diagram data**, in the hash (`#view=security&theme=dark&lang=es&c4=api&sel=db1&detail=simple`).
On open and on `hashchange` the state is applied. It works from `file://` and in the shared HTML. A «Copy link to this component» button in the
inspector. Links between workspace diagrams (`ref`) could point to one component with the same format, which closes one of the
[known gaps](known-gaps.md).

#### 2. Simplified / Detailed mode · M

**The need.** The same diagram serves a steering committee and an engineering team. Today there are views and C4 levels, but no quick
density switch.

**Proposed design.** A `detail: 'core' | 'extra'` field on components, groups and connections (default `core`). **Simplified** hides `extra`
items and captions, pills and connection labels; **Detailed** shows everything. A keyboard shortcut, kept in the URL (idea 1), and
**every export follows what is on screen**. In the *Text* tab, a `+extra` suffix. The analyses (cost, security, availability) always use the
whole diagram and say so in the legend.

#### 3. Configurable highlight markers · S

**The need.** Databricks puts colored dots on boxes that have a customer story, a demo, a course… to see at a glance «where there is something».

**Proposed design.** A markers menu with criteria Diagramon already knows: has an ADR, an open finding, unresolved comments, PII/PCI data,
a single point of failure, end of support soon (radar), no owner, cost above a threshold. Each one is a colored dot in the node's corner, with a
legend. The criteria are defined in `src/config.js` (a `highlights` block), with no rule language (see *Custom rules* in the [main roadmap](roadmap.md)).

#### 4. First-run guided tour · S

**The need.** Diagramon does many things and the first opening does not show them. Databricks opens a 10-step tour you can skip.

**Proposed design.** An 8 to 10 step tour over a template (draw, views, cost, security, text, export, encrypted sharing), with «Skip» and «Next»,
relaunchable from the help menu and remembered in `localStorage`. Texts in `src/i18n.js`. No libraries: a box positioned over the highlighted element.

#### 5. Focus mode on a group · S

**The need.** Databricks lets you «zoom into the platform alone», hiding everything else.

**Proposed design.** «Focus» in a group's menu: hides everything that is not inside it or directly connected, and shows the outside
connections as *ghosts* on the border (as C4 levels already do). `Esc` exits. It can be exported and presented in that state.

#### 6. Verified accessible palettes (WCAG AA) · M

**The need.** Databricks offers 13 palettes that pass WCAG AA. Diagramon has two palettes and high contrast.

**Proposed design.** More palettes (including color-blind safe variants) in `src/config.js`, and a test in `tests/run.js` that computes the
contrast of each text over its background in light and dark and fails below 4.5:1. The palette picker moves to the options menu.

---

### Phase 2 · Knowledge on the diagram

#### 7. Brand or category names · M

**The need.** In neutral or comparative proposals it is better to show «Object storage» instead of «Amazon S3».
Databricks switches between *Branded* and *Categorized*.

**Proposed design.** Each icon type gets a `category` (there are already families in `src/config.js`). A switch shows the category instead of
the product name and, optionally, a generic icon. Also useful for the Context view and for clients who have not chosen a provider yet.

#### 8. Multi-cloud equivalents · L

**The need.** Databricks redraws services and ingestion when you switch between Azure, AWS and GCP. For Diagramon this is very valuable in
migrations and provider decisions.

**Proposed design.** A table of equivalents in a new file, `src/equivalents.js` (S3 ↔ ADLS Gen2 ↔ Cloud Storage, Lambda ↔ Functions ↔ Cloud Run
functions, …). A «Translate diagram to Azure/GCP/AWS» action that creates a **new version** (it never touches the current one) with the equivalent
icons, keeps ids, connections, data and owners, and marks what has no direct equivalent as a review finding. The existing version comparison
shows what changed. Costs are not translated: they are marked «to review».

#### 9. Availability by region and service maturity · L

**The need.** Databricks dims the products not available in the chosen region and filters by stage (GA, Preview…). Diagramon already knows each
group's region and has a tech radar.

**Proposed design.** A local catalog, `assets/regions/*.js`, with availability per service and region for each cloud, generated **outside the app**
by a script in `tools/` (like the icons) and versioned in the repository with its date. The app still has no network. A new review finding: «service X is
not available in region Y», and dimming on the canvas. A `stage` field (GA, Preview, Beta) on components feeds the radar and a «GA only» filter.
The table is exported with the inventory.
**Risk:** the data goes stale; every report must show the catalog's date.

#### 10. Rich component cards · M

**The need.** In Databricks every box explains what it is, its capabilities, its docs and which boxes are related.

**Proposed design.** A local catalog of short descriptions per service type (`src/catalog.js`: what it is, what it is used for, a link to each cloud's
official docs). The inspector shows an «About» tab with that and with **related boxes** from the same diagram (connected, same dataset, same owner).
Links open a new tab only on click, so the CSP `connect-src 'none'` does not change. For types with no entry, the card is hidden.

#### 11. Sources with a data profile and standard formats · M

**The need.** Databricks source cards say whether they send batch or streaming, the shape, volume and cadence, and list the industry formats
(FHIR, ISO 20022, FIX, DICOM…).

**Proposed design.** Optional fields on components and connections: `mode` (batch, micro-batch, streaming, CDC), `format` (from a list in
`src/config.js` with generic and industry formats), `volume` and `cadence`. They show as pills in Detailed mode, travel to the data catalog, data
contracts and inventory, and the Data view can color connections by mode.

#### 12. Use cases, personas and KPIs as elements · L

**The need.** Databricks links use cases with components, teams, beneficiaries and KPIs. Diagramon has requirements with a traceability matrix
and stakeholders, but no «use cases» you can see on the canvas.

**Proposed design.** A **Use cases** tab (model in `src/models/usecases.js`): problem, beneficiaries (existing stakeholders), the components and
datasets it uses, KPIs and status. Selecting a use case **highlights its route** on the canvas (reusing the path between components and Flow). Each use
case can get its own page in the report and in the deck (idea 15).

---

### Phase 3 · Starting content

#### 13. Library of reference architectures by industry · L

**The need.** Databricks' big value is 70 ready boards by industry. Diagramon has 5 generic templates.

**Proposed design.** A template gallery with a search (`Ctrl K`) and filters by industry and cloud, starting with a few done well: a lakehouse for
retail, banking (real-time fraud), manufacturing (IoT and historians), healthcare (FHIR) and public sector. Each brings sources, medallion layers,
consumers, use cases (idea 12), owners, risks and sample ADRs, in English and Spanish. Templates live in `src/examples/` (one file per industry) so the
community can contribute without touching code. They would use the existing and generic icons; icons for data platforms (Databricks, Snowflake…) would
be added only if their license allows redistributing them.

#### 14. Band layout · M

**The need.** Reference architectures read better in fixed bands: sources → ingestion → platform → serving → consumers.

**Proposed design.** An automatic layout option that places components in bands by their `layer` (or a new `band` field), horizontal or vertical, with
a collapsible header for each band as in Databricks. Groups stay inside their band.

---

### Phase 4 · Export and share

#### 15. Editable PPTX deck export · L

**The need.** Databricks exports PowerPoint with a cover, contents, the board as editable shapes and a page per use case. Diagramon has a PDF report and
Present mode, but no PPTX.

**Proposed design.** A minimal writer, `src/export/pptx.js`, like the Excel one (uncompressed ZIP, no libraries): cover, contents, the diagram as native
shapes and connectors (not an image), one slide per group (as in Present) and one per use case, ADR or open finding, as the user chooses. It follows the
language, theme and Simplified/Detailed mode on screen.
**Risk:** PowerPoint's OOXML is fragile; it needs testing by opening the file in PowerPoint, Keynote and LibreOffice.

#### 16. Animated GIF export · M

**The need.** A GIF with the particles moving can be pasted in an email, a wiki or a chat where an animated SVG does not play.

**Proposed design.** Render N frames of the canvas to a `<canvas>` and encode them with a built-in GIF encoder (LZW, 256-color palette), with no
dependencies. Options: duration, size and view. The README demo itself could be generated this way.

#### 17. Excalidraw and Visio export · M

**The need.** Databricks exports to Excalidraw and Visio, two tools widely used in workshops and large companies.

**Proposed design.** `src/export/excalidraw.js` (simple JSON: rectangles, arrows and text, with icons as embedded images) and `src/export/vsdx.js`
(an uncompressed ZIP like the Excel file). Start with Excalidraw, which is simpler; Visio next, with the same rules as draw.io for groups and boundaries.

#### 18. Read-only standalone HTML (unencrypted) · S

**The need.** Today the shared HTML always asks for a password. For diagrams that are not sensitive, a one-file viewer without a password is easier.

**Proposed design.** A «no password» checkbox in the share dialog, with a clear warning that anyone with the file can read it. The HTML opens read-only
with views, Flow, cards and presentation.

#### 19. Tabs with several open diagrams · M

**The need.** In Databricks, *Edit* clones a board into a tab of your own, and tabs are remembered between visits.

**Proposed design.** A tab bar to keep several diagrams open at once, each with its own autosave in `localStorage` and its own undo history.
«Duplicate in a new tab» replaces copying and pasting the file. It complements the workspace, which stays the way to work with folders.

---

### Phase 5 · Languages

#### 20. More languages, including RTL · M

**The need.** Databricks is in 16 languages. Diagramon only in English and Spanish.

**Proposed design.** Prepare `src/i18n.js` for more languages (one file per language in `src/i18n/`, with English as the fallback for missing keys), a
test that lists untranslated keys, and `dir="rtl"` support. Templates and the *Text* tab accept per-language texts as they do today (`{ en, es, … }`).
Start with Portuguese, French and German with help from the community.

---

### Phase 6 · AI and agents, without breaking privacy

#### 21. Local MCP server · M

**The need.** Databricks exposes its architectures to AI agents through MCP. With Diagramon, an agent could read the team's diagrams and propose changes.

**Proposed design.** An **optional, separate** MCP server in `tools/mcp/` (Node, no dependencies, over stdio) that works on a local folder of diagrams.
Tools: `list_diagrams`, `get_diagram` (JSON or text), `search` (components, datasets, owners), `review` (the findings the app computes) and `apply_text`
(propose a new diagram in the text format, written as a new file, never overwriting). The web app does not change and gains no network access: the server
only reads and writes files, and only whoever wants it installs it.

#### 22. Prompt kit for your own AI assistant · S

**The need.** The Databricks assistant builds an architecture from a description or a whiteboard photo. Diagramon does not call any cloud AI, on purpose.

**Proposed design.** A «Copy prompt for AI» button that copies to the clipboard the grammar of the [text format](text-format.md), the list of valid icon
types and, optionally, the current diagram. The user pastes it into **the assistant their company has already approved** together with their description or
photo, and pastes the answer into the *Text* tab, which validates and draws it. No network, no keys, and the user decides what leaves their machine.

---

### Cross-cutting

#### 23. Content quality checks · M

**The need.** Databricks runs layout, label fit, link, i18n and export checks before shipping a board.

**Proposed design.** Extend `tests/smoke.js` so every template (and every one in the idea 13 library) checks: labels that do not overflow their box, nodes
that do not overlap, every `i18n` key present in every language, palette contrast (idea 6), and that every export is produced without errors. It is the
safety net that lets the library grow with contributions.

---

## 4. What we do not adopt, and why

| Databricks feature | Why not in Diagramon |
|---|---|
| An assistant that calls AI models on a server | It breaks the promise that no byte leaves the machine. Alternatives: the prompt kit (22) and the local MCP server (21). |
| Feedback form and social share buttons | They need the network. Feedback goes through GitHub issues. |
| Preview cards per industry (`share/`) | They need a server that serves pages; Diagramon opens from the disk. |
| Loading resources on demand (`fetch`) | The CSP blocks `connect-src`. Everything is embedded in scripts, like the icons. |
| Databricks learning content (courses, certifications, demos, videos) | It is one vendor's content. Diagramon is cloud-neutral; the official docs links of idea 10 cover the need. |
| The js-yaml dependency | Diagramon has no dependencies; it already reads YAML for IaC with its own parser. |

## Suggested order

1. All of **Phase 1**: a big improvement in experience at low risk, with no data model change except `detail`.
2. Ideas **7, 10 and 11**: they enrich the cards without touching the analyses.
3. Ideas **12, 13 and 14** together: use cases, the library and bands reinforce each other.
4. Ideas **15 and 16**: the exports clients ask for most.
5. Ideas **8 and 9**: the most ambitious, better once the library exists to test them on.
6. The rest as the community asks for it.
