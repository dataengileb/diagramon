[← Diagramon](../README.md) · **English** · [Español](guide.es.md)

# 📘 Tutorial

**Contents**

- [1. Your first diagram](#1-your-first-diagram)
- [2. Connect](#2-connect)
- [3. Edit and group](#3-edit-and-group)
- [4. Many at once and alignment](#4-many-at-once-and-alignment)
- [5. Costs](#5-costs)
  - [Breakdown and scenarios](#breakdown-and-scenarios)
- [Availability, RPO/RTO and single points of failure](#availability-rporto-and-single-points-of-failure)
- [6. Data classification and encryption](#6-data-classification-and-encryption)
  - [Data lineage](#data-lineage)
  - [Data residency](#data-residency)
  - [Data lake layers](#data-lake-layers)
- [7. Review findings](#7-review-findings)
  - [Automatic security review](#automatic-security-review)
  - [Compliance mapping](#compliance-mapping)
  - [Owners and stewards](#owners-and-stewards)
- [Filters](#filters)
- [8. Versions and environments](#8-versions-and-environments)
  - [Architecture decisions (ADR)](#architecture-decisions-adr)
- [9. Sticky notes and risk zones](#9-sticky-notes-and-risk-zones)
  - [Threat modeling (STRIDE)](#threat-modeling-stride)
- [10. Present and export](#10-present-and-export)
  - [Architecture report](#architecture-report)
  - [Inventory (CSV / Excel)](#inventory-csv--excel)
- [Views](#views)
- [C4 levels (drill-down)](#c4-levels-drill-down)
- [Keyboard shortcuts](#keyboard-shortcuts)

## 1. Your first diagram

1. Open the **Templates** tab and pick *Web app on AWS (3 tiers)* to see a complete example.
2. Click **New** to start with an empty canvas.
3. In **Components**, open the **Provider** list and pick **Generic**, **AWS**, **Azure**, **Google Cloud**, **SAP BTP** or **Microsoft Fabric**.
   Only that provider's components are shown. Use the search box: `lambda`, `s3`, `hana`…
   It also matches synonyms and equivalents, in English and Spanish: `sql` finds RDS, Cloud SQL and Azure SQL; `k8s` finds EKS, AKS and GKE; `cola` finds SQS and Service Bus.
   For **SAP**, the **SAP business systems** (S/4HANA, ECC, TM, EWM…) appear at the top, with the SAP logo.
4. **Click** a component to add it to the center, or **drag** it onto the canvas.
   Double-click an empty spot on the canvas to add another one like the last.

## 2. Connect

- Select a node, press **`C`**, then click the target.
- Or select a node and **`⇧` + click** the target.
- Click a connection to change its label, style and importance:
  - **Style** (line pattern): **synchronous** (request), **asynchronous** (event), **data flow**, **optional**, **replication**, **batch / scheduled**, **streaming** and **control / management**.
  - **Importance**: **Normal**, **Important** or **Critical**. A heavier flow is drawn with a thicker line, a larger arrowhead and more moving dots (critical also gets a soft glow). In the *Context* view, a bundle of connections takes the highest importance among them. The legend lists *Important flow* / *Critical flow* only when the diagram uses them.
  - **Your own types**: open the **Style** list and choose **+ New type…**. Give it a name, pick a line pattern, color, width and moving dots; it is applied to the selected connection. Your types live in this diagram (they travel with the JSON, versions, the *Text* tab and the exports) and appear in the legend. The **Connection types…** button in the panel lists them to edit or delete; deleting a type in use sends its connections back to *Synchronous* (one undo step).

## 3. Edit and group

- **Click** a node: the right panel shows its name, detail, icon, color and description.
- To change the icon, type part of its name in the **Icon** search (`lamb`, `sql`, `kafka`…) and pick a suggestion with the mouse or with ↑ ↓ and Enter. The × goes back to the generic icon.
- **Double-click** a node, group or connection to rename it right there: type, then `Enter` to accept (`Shift+Enter` adds a line break in a connection label) or `Esc` to cancel. Clicking elsewhere also accepts. An empty connection label removes it.
- Use **Group › + New group…** to create a group. Drag its label to move the whole group.

## 4. Many at once and alignment

- **`⌘` + click** (or **`Ctrl` + click**) adds or removes nodes from the selection.
- **`⇧` + drag** on the background selects an area. **`⌘A`** selects everything.
- With several nodes selected, the right panel can **align** them (left, center, right, top, middle, bottom)
  and **distribute** them with equal spacing, horizontally or vertically.
- With exactly two nodes selected, the right panel shows **Show path A → B** (or press **`R`**): the shortest route follows the arrows, lights up every edge of any shortest route and numbers the steps. If no directed route exists it falls back to ignoring direction and says so. **`Esc`**, the × or any click clears it.
- While dragging, pink **guides** snap the node to the edges and centers of the others. Hold **`Alt`** to turn them off.

## 5. Costs

1. Select a service.
2. Type the price in **Cost (USD)**.
3. Pick the period: **Hourly**, **Monthly**, **Yearly** or **Multi-year** (with a number of years).

The price appears in a tag under the service. The **approximate monthly total** is shown above the canvas.
With several services selected, the panel shows the cost of the selection.

> Diagramon never looks up prices online (privacy first). You type the costs yourself.

### Breakdown and scenarios

Open **Costs…** from the *Export* menu, or from the **Costs** button in the pill of the **Cost** view (key `7`).

- **Breakdown** tab: group the monthly cost by **Team**, **Cost center**, **Owner**, **Group**, **Type**, **Provider**, **Region** or **Layer**. Each row shows the components, the monthly and yearly cost (monthly × 12) and its share of the total with a bar. Components without a value go to **Unassigned**. Click a row to filter the canvas by it (not available for *Type*). **Group** is a tree by the full group path (e.g. *Production account › Primary region › Gold layer*): each row shows the **Direct** cost (components placed straight in that group) and the **Subtotal** (including nested groups); siblings are sorted by subtotal and the bars follow the subtotal. Use ▾ / ▸ to collapse or expand a group (the first two levels start expanded). Groups inside an internal diagram (C4 levels) hang under a row for that level (*[inner diagram]*), which is its own top-level branch. Components without a group go to **Unassigned**. The grand total is the sum of the *Direct* column (or of the top-level subtotals), never of all subtotals.
- **Compare scenarios** tab: pick **A** and **B** among the canvas and every saved version. Version snapshots are used as they were saved; the canvas is not touched. You get the totals, the change (amount and %), per month and per year, a table per component (new in green, changed in yellow, removed in red; click a header to sort, *Only changes* hides the unchanged ones) and the change by team, cost center, owner, group… (by group the rows are aligned by group path and show added / removed groups).
- **Current vs proposed**: save the architecture as it is today as a version (e.g. *Approved*), change the canvas into the proposal and open the dialog: A is the latest approved version and B the canvas. **Save canvas as proposed scenario** saves a version called *Proposed* and selects it as B. In the **Versions** tab, **Compare costs** on any version opens the dialog with that version as A and the canvas as B.
- **CSV** exports the table that is shown (`<diagram>-costs.csv` or `<diagram>-cost-compare.csv`).
- The Cost view legend lists the 5 most expensive teams, a group's panel shows the group's monthly total, comparing a version on the canvas adds a *Cost: $A → $B* line, and the architecture report adds *Cost by team* and *Cost by cost center*, and its *Cost per group* table is the indented path tree with Direct and Subtotal columns.
- From the console: `Diagramon.costBreakdown(by)` returns `[{ key, label, monthly, nodes }]` (for `'group'` also `path`, `pathLabel`, `depth`, `own`, `total`, `nodesAll`, `kind`; `monthly` = `own`, so summing `monthly` over all rows gives the grand total; `'groupTop'` keeps the old flat top-level grouping); `Diagramon.compareCosts(aVersionId, bVersionId)` (`null` = canvas) returns `{ a: { label, monthly }, b: { label, monthly }, delta, deltaPct, rows: [{ id, label, a, b, delta, status }] }`; `Diagramon.openCosts('breakdown' | 'compare')` opens the dialog.

## Availability, RPO/RTO and single points of failure

1. Select a component and fill **Availability**: the **SLA %** target (pick a tier such as 99.9 or 99.99, or type `99.95`), **RPO** and **RTO** (`15m`, `4h`, `1d`, `0`) and **Replicas / instances**.
2. The panel shows the effective availability, assuming independent parallel instances: `1 − (1 − SLA)^replicas`, for example *99.9% with 2 replicas = 99.9999%*, plus the expected downtime (*≈ 32 s/year*). With several components selected, the fields apply to all of them.
3. Select two components and show the path between them: the path bar adds the **composite availability**, the probability that **at least one route** between them works. It combines the alternative routes (each component fails independently; connections are assumed reliable; both ends count), so a second path through other components raises the figure, e.g. two parallel 99% components give 99.99% for that stage. Next to it, *combining N alternative routes* says how many routes were combined; it also shows the weakest link on the most likely route, and the largest RPO and RTO along that route. Routes follow the direction of the connections (two-way connections count both ways). With a single possible route the figure is just the product of its components. In very meshed diagrams (roughly more than 20 uncertain components in play) the figure is a lower bound and is marked *(lower bound)*. Components without an SLA are counted and left out of the calculation (they are treated as always up).
4. Diagramon marks **single points of failure**: a component without replicas whose failure cuts an entry point (users, web, mobile, external or a component with no incoming flow) off from the rest. Single-instance data stores without an SLA of 99.9% or better, and data stores missing RPO/RTO (only when the diagram uses them anywhere), also show up in the *Review* tab under *Availability & resilience*. These findings appear only once the diagram uses SLA, RPO, RTO or replicas somewhere, so a diagram of managed services without availability data stays quiet; the **Resilience** view always shows the topological single points of failure.
5. Press **`9`** for the **Resilience** view: components are colored by effective availability (≥ 99.99%, ≥ 99.9%, ≥ 99%, below, or no SLA), single points of failure get a red dashed border, and a chip under each component reads *99.95% · RPO 15 min · RTO 1 h · ×2*.

From the console: `Diagramon.availability(fromId, toId)` returns `{ availability, downtimeYear, nodes, unknown, routes, method, approx, worst, rpo, rto }` (RPO and RTO in seconds; `nodes` is the most likely route, `routes` the number of simple routes, capped at 100, `method` is `'single'`, `'exact'` or `'approx'`) and `Diagramon.spofs()` returns `[{ id, label, reason }]`. The *Architecture report* has a **Resilience** section.

## 6. Data classification and encryption

1. Select a component. Under **Data classification**, click the tags for the data it stores or handles: **PUB**, **INT**, **CONF**, **PII**, **PCI**, **PHI**. You can pick several.
2. Select a connection. Set **Encryption in transit** to **Encrypted** or **Not encrypted**, and tag the **Data in transit**.

The tags appear on top of each node and on the connection's label, next to a padlock: closed 🔒 when encrypted, open when not.
When a connection marked *Not encrypted* carries sensitive data, or links a component with sensitive data, it turns red and a warning appears above the canvas.
With several components selected, the tags apply to all of them.

### Data lineage

Mark which tables or datasets travel through each connection, then follow one from its origin to where it is consumed.

1. Select a connection. Under **Datasets**, type a table name and press `Enter` or `,` to add it (the field suggests names already used in the diagram). Click the **×** on a chip to remove it.
2. Click a dataset chip (or press `D` and pick one from the list, or click a row in the **Datasets** legend of the document card) to see its lineage: the whole route is highlighted, and each component gets a number (its depth). Origins are green, consumers orange.
3. The bar above the canvas summarizes it (*origins → consumers · hops*). `Esc` clears it. It also works in the *Context* view, where it is shown on the closed boxes and the combined connections between them.

Selecting a component lists the datasets on its connections. In the **Data** view the dataset names are drawn under each connection's label, and they are included in the exports. Connections drawn with arrows on both ends count in both directions.

### Data residency

1. Select a component or a group and type its **Region** (a cloud region such as `eu-west-1`, `westeurope`, `europe-west1`, or a country code such as `ES`, `US`). The box suggests the regions already used in the diagram. Components inherit the region of the nearest group that has one; a group named like its region (`Region eu-west-1 (Ireland)`) is detected on its own and the panel says *inherited from…* or *deduced from…*.
2. Diagramon maps each region to a jurisdiction (EU, UK, US, Canada, Brazil, Latin America, Asia-Pacific, Middle East, Africa) and shows it next to the box. Unknown regions are simply ignored.
3. When a connection links two regions in different jurisdictions and carries sensitive data (its own classes or, if it has none, those of its source), the inspector shows `eu-west-1 (EU) → us-east-1 (US)` and a red warning such as *PII leaves the EU → US*. If the transfer is covered (SCCs, adequacy decision…), turn on **Transfer approved**: it stays listed but no longer raises the alarm.

The **Security** and **Physical** views show a small region chip on each component. In **Security**, unapproved cross-border connections are critical (red, with a globe marker) and their ends are highlighted; the legend gets a *Cross-border sensitive data* row and the summary above the canvas counts them. The filter has a **Cross-border** chip (in *Data*) and a **Region** section (one chip per jurisdiction, plus *Unknown region*). From the console: `Diagramon.crossBorder()`.

### Data lake layers

Tag where a component sits in a medallion-style data lake.

1. Select a component or a group. Under **Data lake layer**, pick **Bronze**, **Silver** or **Gold** (or *None*).
2. Components inherit the layer of their group, so you can tag a whole zone once. The *None* button then reads *Inherited (Gold)* and a hint says which group it comes from.
3. Below the buttons, switch the document-wide naming between **Bronze · Silver · Gold** and **Raw · Curated · Serving**. It applies to every label, the legend and the filters.

A layered component gets a colored band on its left edge and a small layer label at its bottom-left corner. A group with its own layer gets a thicker, tinted border and a label next to its title.
The **Layers** legend (exports and the document card, key **I**) lists the layers in use; click a row in the document card to filter by it. The **Filters** menu has a *Layer* section, and the **Data** view highlights layered components.
The *Context* and *Cost* views hide layer marks. Scripts can read `Diagramon.layers()` and call `Diagramon.setLayerNames('zones')`.

## 7. Review findings

1. Select a component and click **⚑ Raise a review finding**.
2. Write the **Finding** (what must be fixed), **Raised by**, **Raised on** (today by default) and the **Due date**.
3. When it is fixed, click **✓ Mark resolved**. **Reopen** brings it back; **Remove** deletes it.

The component gets a tag: **IN REVIEW** (orange), **OVERDUE** (red, once the due date has passed) or **RESOLVED** (green).
The panel shows how many days are left or how late it is, and the summary above the canvas counts open and overdue findings.
Diagramon remembers the last reviewer name. Exports with the legend list the open findings with their due date.

### Automatic security review

Diagramon checks the diagram for common security problems and **only warns, it never blocks anything**. The **Review** tab (next to *Versions*) lists every finding, grouped by source and severity, and its label shows the number of open findings in the color of the worst one. The same number appears in the line above the canvas (*⚑ N findings*), and in the **Security** view each component with findings gets a small *⚠ n* pill.

| Rule | Severity | Fires when |
|---|---|---|
| Sensitive data unencrypted | critical | A connection marked *Not encrypted* carries PII, PCI, PHI or confidential data |
| Encryption not stated | medium | A connection carries sensitive data but its encryption is not set |
| Public with sensitive data | high | A component that holds sensitive data is public |
| Data store without backup | medium | A database or storage has no backup component or backup connection |
| Unapproved cross-border transfer | high | Sensitive data crosses jurisdictions without an approved transfer |
| Sensitive data without owner | low | A component with sensitive data has no owner and no steward (only once the diagram assigns owners somewhere) |
| Public data store | high | A data store is public or is reached directly by users or an external service |

- **Exposure and backup are deduced.** A component is *public* when it sits in a public area (a group with the AWS public-subnet icon, or named *public*, *DMZ*, *internet*…) or receives a connection from users, a web or mobile app or an external service. A data store *has a backup* when it is connected to a backup component (AWS Backup, Recovery Services, a name with *backup*, *snapshot*, *replica*…) or to a connection labelled *backup*, *snapshot*, *replica*… In the component panel, **Security** shows the deduced value and why; choose **Public / Internal** or **Yes / No** to override it.
- **Dismiss** a finding to hide it: Diagramon asks for a short reason and stores it (with the author and date) in the diagram. **Show dismissed (N)** lists them with their reason and a **Restore** button.
- **Raise as review observation** turns a finding into a manual review observation on the component (see above), with the finding as its note.
- Click a finding's target to select it and zoom to it. Your own review observations appear in the same list (they cannot be dismissed: resolve them in the component panel).
- **Export CSV** saves all findings, dismissed ones included, for a spreadsheet.
- From the console: `Diagramon.findings({ dismissed: false })`, `Diagramon.dismissFinding(id, reason)` and `Diagramon.restoreFinding(id)`.

### Compliance mapping

Tag which controls each component meets (ISO 27001, SOC 2, GDPR, HIPAA, PCI DSS) and export a matrix of component × control.

1. Select a component or a group and open the **Compliance** section of the panel (it opens by itself once a control is set).
2. Type in **Add control** to search the catalog (`iso27001:A.8.24 — Use of cryptography`) and pick one. It is added as **Gap**: nothing counts as met until you confirm it.
3. Set each control to **Met**, **Partial**, **Gap** or **N/A**. The **×** removes it.
4. Components **inherit** the controls of their groups: set `pcidss:1.3` once on the *Payments* group and every component inside gets it. Choosing a status on a component overrides the inherited one (the **×** then goes back to the inherited value).
5. **Suggested** chips offer controls for the data classes of the component (PII → GDPR Art. 32, 5, 25…; PCI → PCI DSS 3.5, 4.2…; PHI → HIPAA transmission security…) and for components on a cross-border connection (GDPR Art. 44–46). Click one to add it as a gap.
6. With several components selected, the same section applies to all of them.

**Compliance matrix** (button in the section, or **Export › Compliance matrix**): one row per component that has controls or sensitive data, one column per control in use grouped by framework, with ✓ met, ◐ partial, ✗ gap, — N/A and blank for not mapped. The header stays in view while you scroll; a row at the bottom shows the coverage of each control (met ÷ components that are not N/A) and cards on top summarize each framework. Pick a framework to narrow it down. **CSV** exports one row per component and one column per control (`met|partial|gap|na|`); **CSV (long)** one row per component × control with framework, control, title, group, status, inherited-from and data classes (`<diagram>-compliance.csv`, `<diagram>-compliance-long.csv`).

Review findings include a **Compliance** group: a gap is *medium* (*high* for a PCI DSS control on a component that handles PCI data, or HIPAA with PHI), a partial control is *low*, and a component with PII, PCI or PHI that lacks its main suggested control (for example GDPR Art. 32) is *low*, but only for frameworks the diagram already uses, so a diagram without controls stays quiet. The **Filter** gets a **Compliance** section (one chip per framework in use, plus *Has gaps*). From the console: `Diagramon.compliance()` and `Diagramon.exportCompliance('wide' | 'long')`.
The catalog lives in `src/config.js` › `compliance` and is a practical subset, not the full standards; the control titles are short paraphrases. This is a documentation aid, not an audit or a certification.

### Owners and stewards

Say who is responsible for each component.

1. Select a component (or a group) and open the **Ownership** section of the panel (it opens by itself once a value is set).
2. Fill in **Owner**, **Data steward**, **Team** and **Cost center**. Each field suggests the values already used in the diagram, so names stay consistent.
3. Components **inherit** each field from the nearest group that has it: set the team once on a group and everything inside gets it. An inherited value shows as a gray placeholder with *inherited from <group>*; typing your own overrides it.
4. With several components selected the same four fields apply to all of them (*Mixed* when they differ; clearing a field clears it on all).

The tooltip of a component lists its owner, steward, team and cost center. The **Filter** panel gets **Team**, **Owner**, **Steward** and **Cost center** chips (plus *Unassigned* for owner and team). The document card (**`I`**) lists the **Teams** with their owners and component counts; click one to filter by it.
Press **`8`** for the **Governance** view: each component is colored by its team (or by its owner when it has no team), shows a small team chip underneath, and the exports and the legend list every team. From the console: `Diagramon.owners()` returns `[{ team, owners, stewards, nodes }]`.

## Filters

**Filter** (or **`G`**) opens a panel of chips: **Data** (each class in the diagram, plus *Unencrypted sensitive flows*), **Review**, **Provider**, **Category**, **Group**, **Cost**, and **Team**, **Owner**, **Steward** and **Cost center** when they are set.
Chips in the same section add up (OR); different sections combine (AND). What does not match fades out, including empty groups and connections whose ends do not both match, and selecting a component still works on top.
A pill above the canvas shows the active filter (`Filter: PII · AWS · 7 of 20`) with an **×** to clear it. The filter is remembered per browser and never changes the exports. From the console: `Diagramon.setFilter({ data: ['pii'], provider: ['aws'] })` and `Diagramon.clearFilter()`.

## 8. Versions and environments

Open the **Versions** tab.

- **+ Version N** saves a frozen snapshot of the canvas. Use it as your history: *Version 1*, *Version 2*…
- **DEV**, **QA** and **PROD** save the canvas as that environment. Each environment keeps one copy; saving again updates it.
- Add an optional **note** before saving, for example *before the migration*.
- **Open** loads it on the canvas. A pill above the title shows what is open and warns about unsaved changes.
- **Compare** marks the differences with the canvas: **green** is new, **yellow** changed, and **red dashed** ghosts were removed.
  Custom connection types are compared by id (name, line pattern, color, width, moving dots): the compare bar adds *Types +1 −0 ~1* and the card lists each type. A connection using a type whose look changed is not marked as changed (its style is the same); versions saved before custom types have none, so every current type counts as new.
  The card lists every difference; click one to jump to it. **Esc** or **Stop** ends the comparison.
- Each card shows its **status**: **Draft**, **In review**, **Approved** or **Rejected**, also shown above the title and in the exported title block.
- **Version name**: in **✎**, give a version or environment an optional name such as `1.2`, `2026-Q4` or `MVP`. A number-like name shows as *Version 1.2*, any other as is, and an environment as *Production · 1.2*. It also feeds the title block.
- **✎** edits the status, the **architecture author**, the **created** and **updated** dates and the note, with no need to delete and save again. The last author you typed is suggested for new versions.
- Above the list, **status chips** (*All*, *Draft*, *In review*…) with their counts filter versions and environments; click the active chip again to show everything.
- Updating an environment that was **Approved** or **Rejected** puts it back **In review**, because its content changed.
- Updating or deleting an **Approved** version or environment asks for confirmation first. Approving one that still has **open review findings** in its snapshot warns you, lists them, and keeps the previous status if you cancel. A card that is approved with open findings shows a coral **⚑ open findings** flag.
- Approving or rejecting records **who decided and when** (shown on the card and in the exported title block). A rejection asks for a **reason**, and every status change is kept in a **status history** you can read in the edit form.
- Saving, opening, deleting and every edit can be undone with **`⌘Z`**.
- Versions are stored inside the diagram, so **Export › JSON** carries them all.

### Architecture decisions (ADR)

Open the **ADR** tab to record *why* the architecture is the way it is, in the MADR style: **context**, **decision** and **consequences**.

- **+ New decision** adds a card (`ADR-001`, `ADR-002`…). Click it to edit its title, **status** (*Proposed*, *Accepted*, *Rejected*, *Deprecated*, *Superseded*), date, deciders and the three texts. Choosing **Superseded by** marks it *Superseded*.
- Link a decision to what it affects: **Link selection** links the selected components, connection or group, and **Link version…** a saved version. Linked items show as chips; click one to select it on the canvas (or to jump to the version).
- The component, connection and group panels have a **Decisions** field with the linked ADRs, **+ New decision** (already linked) and **Link…** to pick an existing one. Each version card lists its ADRs and has **+ ADR**.
- Components with a *proposed* or *accepted* decision show an **ADR n** tag on the canvas (views that show review marks); hover it to read the titles.
- Status chips with counts and a search box filter the list. **Export Markdown** downloads every decision as one `.md` file: an index table plus one section per ADR.
- Every status change is recorded in a **history** (date, status, who — your author name — and a note you can edit on the last entry), shown in the card, the Markdown export and the report. Older decisions show one entry with their current status and date.
- Each version also stores a copy of the decisions. When you **compare** a version, the ADR tab marks every decision as new, changed (with the fields and old → new status) or unchanged, lists removed ones at the end, and the compare bar adds the ADR counts. Versions saved before this feature have no decisions and get no marks. API: `Diagramon.compareDecisions(id)`.
- A decision *proposed* for more than 30 days is a low finding in the **Review** tab.
- **Options and criteria.** Open a decision and use **Options considered** to record the alternatives. **+ Criterion** adds a column (a label and a weight ×1 to ×5, both editable); **+ Option** adds a row. Score each option from 1 (poor) to 5 (excellent) per criterion. The **Total** column is the weighted percentage of the maximum, `Σ(weight × score) / Σ(weight × 5)`, over the criteria already scored (hover it to see how many). **★** marks the *leader*: the option with every criterion scored and the highest total (ties go to the first). **Choose** marks the option you picked (**✓ Chosen**); it does not change the decision status. Click an option's name for its details: title, summary, pros, cons, monthly cost, risk and the **version** that shows that option's diagram, with **Compare with current** (starts the usual version comparison) and **Show version**. The matrix scrolls sideways inside the card; **⤢ Expand** opens it in a large window over the canvas, handy for scoring it with the client on a shared screen (**Close** or Esc returns). Up to 12 options and 12 criteria per decision.
- **Area and progress.** The **Area** field (for example *Storage*, *Ingestion*, *Security*) groups decisions. The ADR tab shows **N of M accepted** with a progress bar, and one chip per area with its accepted/total count; click a chip to filter, together with the status chips and the search.
- **Decision kits.** When the app ships a kit (`src/adr-kits.js`, for example the *Data lakehouse · greenfield decisions* kit), **Add decision kit…** lists the kits. Choosing one and confirming appends its decisions as *Proposed*, with the options (pros and cons already written) and the default criteria, but no scores. Decisions whose title already exists are skipped, and the toast tells how many were added and skipped. The whole kit is one undo step. Links to components that do not exist in your diagram are dropped. API: `Diagramon.decisionKits()`, `Diagramon.addDecisionKit(id)`, `Diagramon.adrScore(decisionId)`.
- Two more low findings in the **Review** tab: an *accepted* decision with two or more options and no chosen one, and a chosen option that is not the leader while every option is fully scored (explain why in *Decision*, or dismiss it).
- Comparing versions also lists option, criterion and chosen changes in the card (for example *Option changed: Delta (scores)*, *Chosen: A → B*). **Export Markdown** and the **report** add, per decision with options, the matrix (criteria with weights × options, total, ✓ and ★) and each option's summary, cost, risk, pros and cons; the Area appears in the list table, and the Excel *Decisions* sheet gets *Area* and *Chosen option* columns when they are used.
- Decisions belong to the document, not to a version: opening a version keeps them, the *Text* tab writes them as `adr` blocks (deleting a block there deletes the decision), and they are saved in **Export › JSON** under `decisions`. Everything can be undone with **`⌘Z`**.
- From the console: `Diagramon.decisions()`, `Diagramon.addDecision({ title, status, context, decision, consequences, links: { nodes: [...] } })`, `Diagramon.updateDecision(id, patch)`, `Diagramon.removeDecision(id)` and `Diagramon.exportDecisions()`.

## 9. Sticky notes and risk zones

Use the two buttons next to the zoom controls (bottom right of the canvas).
- **Add a sticky note** puts a note in the middle of the view. Double-click it (or use the panel) to write.
- **Add a risk zone** draws a hatched, dashed area under the groups, with a tag like `⚠ HIGH · Public subnet exposure`. Pick its **Severity** (*Low, Medium, High, Critical*) and an optional description in the panel.
- Select several components and click **⚠ Mark as risk zone** to draw a zone around them.
- Drag to move, drag the corner handle to resize (it snaps to the grid), **`⌘D`** duplicates and **Delete** removes. Everything can be undone.
- The summary above the canvas counts the zones (*⚠ 2 risk zones (1 critical)*), exports with the legend list them by severity, and versions and JSON files keep notes and zones.

### Threat modeling (STRIDE)

Some zones are **trust boundaries** instead of risk zones: open a zone and switch **Kind** to *Trust boundary* (or select components and click **Trust boundary** next to *Mark as risk zone*). A trust boundary has a name, an optional **Trust level** (*Internet, DMZ, Internal, Restricted*…) and a description. It is drawn with a bold dashed line, no hatch, and a tag like `TRUST BOUNDARY · DMZ` with a shield; the legend and the document card list boundaries apart from risk zones.
- A component is inside a boundary when its center is inside the zone. Zones can nest or overlap. A connection **crosses** a boundary when its two ends are not in the same set of boundaries.
- Select a crossing connection: the **Threats (STRIDE)** section shows *Crosses: ‹Internet› → ‹DMZ›* and one suggestion per category (**S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure, **D**enial of service, **E**levation of privilege) with a severity from simple rules (encryption, sensitive data, inbound direction, target is a data store or identity component).
- Decide each one: **Open · Mitigated · Accepted · N/A**, with a note (what you did, or why). Only decisions are saved, and every change can be undone. Open threats show up as findings under *STRIDE threats*.
- In the **Security** view crossing connections get a small `STRIDE n` pill (n = open threats). **Export › Threat model (CSV)** writes one row per crossing connection and category (`<diagram>-stride.csv`).
- From the console: `Diagramon.threats()` returns `[{ edge, from, to, zones, category, severity, status, note }]` and `Diagramon.exportThreats()` downloads the CSV.

## 10. Present and export

- **Flow** (or **`P`**) lights up the diagram step by step, from clients to data. Bidirectional connections are followed both ways.
- **Present** (or **`V`**) goes full screen with no panels: an overview with the title, then one slide per group (in reading order, zooming in and dimming the rest) and a closing overview. Without groups it steps through the flow. **`→`**, **`Space`** or click go forward, **`←`** goes back, **`Home`/`End`** and number keys jump, **`P`** plays the flow, **`Esc`** exits and restores your view. Editing is off while presenting.
- **Arrange** lays everything out automatically, following the flow. Each group is arranged inside its own box, so groups never overlap. **Fit** (or **`F`**) centers the diagram.
- **Elbows** (or **`E`**) switches the connections between curves and right-angle lines that go around the nodes. Several elbow lines on the same side of a node leave from separate, evenly spaced points so they never overlap.
  To change only one connection, select it and pick its **Line**.
- **Export** › SVG, PNG or JSON. Keep the JSON to open it again later with **Import**.
- **Export › Mermaid, PlantUML or draw.io** turns the diagram into code or a file for other tools: a Mermaid flowchart (renders in GitHub, GitLab and Notion), a PlantUML diagram with no external includes, or a `.drawio` file that keeps the same layout, nested groups and official icons. Notes, risk zones and trust boundaries are exported too, components with an internal diagram become nested boxes (Mermaid, PlantUML) or one page per level linked from the component (draw.io), and owners, region, layer, data classes, SLA, cost, compliance and STRIDE decisions travel as metadata (comments in Mermaid and PlantUML, *Edit Data* fields and tooltips in draw.io). Architecture decisions (ADR) are exported as comments (Mermaid, PlantUML) or as a last «Architecture decisions» page (draw.io), linked components carry `adrs=ADR-001,…`, and dismissed findings travel as `dismissed` comments or attributes on their target.
- **Export › Encrypted HTML** creates one `.html` file to share a diagram privately. Whoever receives it double-clicks it, types the password and sees the diagram (dark or light, with zoom). No app, no install, no download. Details below.
- The **Export** menu also has **Legend and title block** (on by default), with **Author** and **Version** fields.
  SVG and PNG files then get a panel at the bottom with only what the diagram uses (connection styles, padlocks,
  component colors, data classes) and a title block with title, author, version, date and estimated cost.

### Architecture report

**Export › Architecture report…** builds the document architecture review boards ask for, with no libraries and no network:

- **Format**: **PDF** (opens your browser's print dialog on a print-ready A4 document: choose *Save as PDF*), **Markdown** (`.md`) or **HTML** (`.html`, one self-contained file, the same document as the PDF with no external requests).
- **Sections** (all on by default, remembered): Summary · Diagram · Components · Connections · Data classification & residency · Owners · Data lake layers · Costs · Security findings · Compliance · Threat model · Decisions (ADR) · Version history · Notes & risk zones. A section with no data is skipped and shown as *(none)*.
- **Compliance section**: per framework, a table of controls with their counts and coverage, followed by a real grid: one row per component, one column per control (framework header row spanning its controls, then control ids), with ✓ met, ◐ partial, ✗ gap, — N/A and a colour per status; a control inherited from a group carries a ↑ (italic in HTML), and a blank cell means not mapped. With more than 10 controls in use the grid is split into one table per framework so it fits an A4 page. In Markdown each grid is a pipe table with the same symbols and a legend line below.
- **Connections**: style (custom types by name) and cross-border; an *Importance* column appears only when some connection is Important or Critical (reports of diagrams without importance stay as before), and a *Connection types* table follows when the diagram has custom types.
- **Diagram**: pick which of the 9 views to include (the active view, plus Security and Data when they add something). If the diagram has internal diagrams (C4 levels), **Include internal diagrams** renders each one. Images use the light theme by default (good for print); **Use current theme** keeps the one on screen.
- **Markdown images** are embedded as `data:` PNGs. Some Markdown viewers block them, so tick **Save images as separate files** to download the PNGs next to the `.md` and reference them by file name.
- Texts come out in the current interface language, dates and money in the document's formats, and everything is escaped.
- From the console: `Diagramon.exportReport({ format: 'pdf' | 'md' | 'html', sections?: [...], views?: [...], scopes?: true | false, theme?: 'light' | 'current', separateImages?: boolean })` returns a promise with the generated HTML or Markdown after starting the download or the print dialog. Section keys: `summary diagram components connections data owners layers costs findings compliance threats decisions versions notes`.

### Inventory (CSV / Excel)

**Export › Inventory (Excel)** and **Export › Inventory (CSV)…** turn the diagram into a table for a CMDB or an audit, fully offline and with no libraries.

- **Components** (one row per component, every C4 level): ID, name, detail, type, provider, service, category, C4 kind and level path, group path, owner, data steward, team and cost center (the effective value, plus an *Inherited from* column when a group supplies it), region and jurisdiction, data classes, sensitive (yes/no), data lake layer, exposure and backup (effective), encrypted connections in and out, unencrypted sensitive connections, SLA, RPO, RTO, replicas, cost as entered, period, cost per month and per year, review status, open findings, linked ADRs, a compliance summary (for example *ISO 27001: 3 met / 1 gap*) and the description.
- **Excel** (`.xlsx`) has one sheet per table: Components, Connections (style with the custom type's name, importance Normal / Important / Critical, custom type yes/no, encryption, data classes, datasets, cross-border, transfer approved, open STRIDE threats), Connection types (only when the diagram has custom types: id, name, line pattern, color, width, moving dots and how many connections use it), Groups, Owners (per team), Decisions, Findings (with dismissed ones and their reason) and Versions. Empty tables are skipped. The *Importance* and *Custom type* columns are always present in Connections (stable schema, even for old diagrams). The header row is bold, frozen and filterable, columns are sized to their content, costs use a currency number format and SLA keeps three decimals.
- **CSV** opens a small dialog: *Components only* (`<diagram>-inventory.csv`) or *All tables as separate CSV files* (one download per table, named `<diagram>-inventory-<table>.csv`). The files include the BOM so Excel respects accents.
- From the console: `Diagramon.inventory()` returns the component rows, and `Diagramon.exportInventory('xlsx' | 'csv' | 'csv-all')` starts the download.

## Views

A **view** is a way of looking at the same diagram: it only decides what is shown, how much detail and what stands out. It never changes your components or positions. Pick one from the **View** selector in the top bar, with keys **`1`**–**`9`**, or from the console (`Diagramon.setView('security')`). When the view is not *Full*, a pill above the canvas names it, counts what it hides or dims, and has an **×** to go back. The document card and the legend of exports follow the active view.

| Key | View | What you see |
|---|---|---|
| `1` | **Full** | Everything: components, groups, labels, tags, costs, zones and notes |
| `2` | **Context** | Top-level groups as closed boxes with combined flows between them (read-only; double-click a box to open it in Full) |
| `3` | **Logical** | Services and flows without the physical groups (VPCs, subnets, regions, accounts…) |
| `4` | **Physical** | Where things run: all groups and risk zones, without connection labels |
| `5` | **Security** | Sensitive data and encryption in transit highlighted (unencrypted, or not stated, with sensitive data); the rest fades |
| `6` | **Data** | Data stores and flows, colored by their most sensitive classification |
| `7` | **Cost** | Monthly cost as a heat map, with the total |
| `8` | **Governance** | Who owns what: components colored by team (or owner), with a team chip under each; components with neither fade |
| `9` | **Resilience** | Availability tiers (effective SLA), RPO/RTO chip under each component and single points of failure with a red dashed border |

The rules of each view live in `src/config.js` › `views`; groups can be marked `logical` or `physical` in the inspector.

## C4 levels (drill-down)

One file can hold several levels of detail, as in the **C4 model**: *system context* → *containers* → *components*. Any component can have an **internal diagram**; the model stays flat (each element just says which component it lives `in`), so reviews, lineage, compliance, owners, costs and versions keep seeing everything.

1. Select a component and press **Create internal diagram** in the inspector (**C4 element** section), then add components inside it. New components, groups, notes and zones take the level you are in. Inside a *Software system* they default to *Container*, inside a *Container* to *Component*.
2. A component that has an internal diagram shows a **⊞ n** chip on the right of its card. **Click the chip**, **double-click the component** (double-click its *name* to rename), press **`Enter`** with it selected, or use **Open internal diagram** in the inspector.
3. Go back with **`Esc`** (with nothing selected), **`Alt`+`↑`** or the **breadcrumb** above the canvas (*Top › Shop system › API*), which also names the C4 level (*L1 System context*, *L2 Containers*, *L3 Components*).
4. Inside a level, a dashed **boundary frame** carries the parent's name and C4 type. What lives outside but connects to it (other systems, the parent's neighbours) appears as dimmed **ghost cards** left (incoming) and right (outgoing) of the frame; click one to jump to its level.
5. Pick a **C4 element** (*Person*, *Software system*, *Container*, *Component*, *External system*) in the inspector; it shows as a `[Container]` tag on components without a detail line, and in the tooltip.
6. **Move into…** (nodes you selected go inside another component of the same level) and **Move up a level** are in the inspector; connections follow, and groups travel with their nodes when all of them move. Deleting a component with an internal diagram asks first, and deletes everything inside it. **Duplicate** also copies the internal diagram, at every depth.
7. Each level has its own positions and its own **Auto layout**, **Fit** and presentation. Views (*Context* collapse included), filters, findings and exports all work inside the open level. **Export** › *All levels* writes one image per level with content.

From the console: `Diagramon.setScope('api')`, `Diagramon.scope`, `Diagramon.scopes()`, `Diagramon.exportLevels('png')`.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘D` | Duplicate |
| `⌘A` | Select all |
| `Delete` | Delete |
| Arrows (`⇧` = faster) | Move the selection (nodes, notes and risk zones) |
| `Alt`+click | Select the risk zone under the pointer, even if nodes or groups cover it |
| `Z` / `⇧Z` | Select the next / previous risk zone |
| `C` | Connect |
| `F` | Fit to view |
| `P` | Play the flow |
| `R` | Show the path between two selected nodes |
| `D` | Pick a dataset to show its lineage (type to filter, `↑` `↓` `Enter`, `Esc` closes) |
| `V` | Present full screen (`→` `←` `Space` `Home` `End` `1`–`9`, `Esc` to exit) |
| `T` | Cycle light → dark → high-contrast black mode |
| `L` | Switch English / Spanish |
| `E` | Switch curved / elbow connectors |
| `G` | Open the filter panel (`Esc` closes it) |
| `1`–`9` | Switch view: Full, Context, Logical, Physical, Security, Data, Cost, Governance, Resilience |
| `Enter` | Open the internal diagram of the selected component (C4 levels) |
| `Esc` | Cancel or clear the selection; with nothing selected, go up one C4 level |
| `Alt`+`↑` | Go up one C4 level |
