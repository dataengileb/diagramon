[← Diagramon](../README.md) · **English** · [Español](guide.es.md)

# 📘 Tutorial

**Contents**

- [The side panel](#the-side-panel)
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
  - [Data catalog and data contracts](#data-catalog-and-data-contracts)
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
  - [Status report](#status-report)
  - [Inventory (CSV / Excel)](#inventory-csv--excel)
- [Workspace (several diagrams)](#workspace-several-diagrams)
- [Views](#views)
- [C4 levels (drill-down)](#c4-levels-drill-down)
- [Keyboard shortcuts](#keyboard-shortcuts)

## The side panel

The right-hand panel has its tabs in two rows. The first row holds three groups: **Design** (*Components*, *Templates*, *Versions*, *Text*, *JSON*), **Governance** (*Review*, *ADR*, *Requirements*, *RAID*, *Stakeholders*) and **Data** (*Catalog*). Click a group to open the tab you last used in it. The count of open findings also shows on the **Governance** group, so you see it while another group is open. In a row, the arrow keys move between the tabs (and between the groups in the first row), **Home** goes to the first one and **End** to the last. The panel is 320 px wide by default; drag its edge to resize it.

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

### Data catalog and data contracts

Declare the datasets your architecture moves, with their columns, quality rules and contract, and check that they arrive within their freshness SLA. A **declared dataset** is an entry of the catalog. A name typed on a connection is only a name: until a dataset with that name is declared, it is **undocumented**.

- Open the **Catalog** tab (group **Data**). **+ Dataset** adds one. The summary line counts the declared datasets, the data products, the undocumented names and the SLA breaches. Filter by layer, by **★ Products** or **Not products**, by domain and by contract, or type in the search box.
- Each card has a header with the ID, the name, the layer, a freshness badge (**✓** meets its SLA, **✗** does not, **?** unknown) and a **★** that marks a data product (click to mark or unmark). Under it: the domain and owner, the real freshness against the SLA, and the storage estimate. Click the header to open the card. Its sections are:
  - **General**: description, domain, layer, **Owner** (a stakeholder, or *Other (free text)…*), steward, data classes, format, **Freshness SLA**, volume per day and retention, and the phase.
  - **Schema**: one row per column (name, type, **Key**, **PII**, **Null**, description). **+ Column**, the ▲ ▼ and × buttons, and **⤢ Expand** for a large window.
  - **Quality**: **+ Rule** adds a rule with its column, parameter and severity (not null, unique, range, pattern, accepted values, freshness or custom).
  - **Contract**: version, status (**Draft**, **Agreed** or **Deprecated**), consumers (components) and terms. **Create contract**, **Export contract** and **Remove contract**.
  - **Lineage**: the slowest path with the latency of each hop, and **Show on canvas**, which highlights the dataset's lineage.
  - **Delete dataset** at the bottom asks first (you can undo).
- Renaming a dataset in its **Name** field also renames it on every connection that carries it, as one undo step. A name that another dataset already uses is refused.
- The **Undocumented** list at the bottom names the connections' names with no entry. Click one to see its lineage, or press **Document** to create the dataset; its layer is the layer of the target of its first connection.
- A **data product** should have an owner and a contract; the Review tab says so when it does not.

**Latency** is a field of each connection (**Latency**, `15m`, `1h`, `1d`): the time the data takes on that hop, such as a batch window or a micro-batch interval. The **end-to-end freshness** of a dataset is the sum of the latencies along its **slowest path**, from an origin of its lineage to a consumer. A hop without latency counts as zero and is shown as **?** (the total then reads *≥*). It is **unknown** when the dataset has no SLA or no path has a latency. The card and the **Freshness** requirement check (below) use it.

**Storage estimate**: volume per day × retention (365 days when not given), priced per GB-month by layer with the indicative rates of `src/config.js › datasets.storagePrice` (see *Customize*). It is an estimate, shown on the card, in the report and in the phase comparison (*Storage/mo*), and it is kept apart from the cost of the components.

**Phases**: a dataset with a phase exists from that phase on, and the comparison table of the phases gets a *Datasets* column when the diagram has datasets, and a *Storage/mo* column when some dataset has a volume.

**Review findings** (group *Data catalog* in the **Review** tab):

| Finding | Severity | Fires when |
|---|---|---|
| Undocumented dataset | low | A name on connections has no entry (only once the diagram declares a dataset) |
| Data product without owner or contract | medium | A data product has no owner, no contract, or neither |
| Freshness SLA not met | high | The end-to-end freshness is above the dataset's SLA |
| PII columns not classified as PII | medium | A column is marked PII but the dataset has no *pii* class |
| Sensitive dataset on an unencrypted connection | high | A dataset with a sensitive class travels on a connection marked *Not encrypted* |
| Consumer outside the lineage | low | A consumer in the contract is not reached by the dataset's lineage |
| No quality rules | low | A data product or a gold dataset has no quality rules |

**Export and the console**

- **Export › Data contracts (ODCS YAML)** (shown only when the diagram declares datasets) writes one YAML document per dataset, separated by `---`. The card's **Export contract** writes one file for that dataset (`<name>.odcs.yaml`). The YAML follows the Open Data Contract Standard **v3.2.0** and is written by hand, with no libraries. Diagramon fields map to it as: name to name and to the schema; version and status (*draft*, *agreed* as *active*, *deprecated*); domain; description to the purpose and terms to the usage; data classes to tags; columns to the schema properties (type, key, required, classification, description); quality rules to the quality checks; the freshness SLA to the latency and the retention to the retention of the SLA; owner and steward to the team members. Data that the standard has no field for, such as the Diagramon id, the layer, the format, the consumers, the phase, the daily volume and the product flag (as `dataProduct`), goes to `customProperties`.
- The **report** has a section *Data catalog and contracts*: a summary, one table of the datasets (domain, layer, owner, product, freshness, contract and storage), the undocumented names, and for each data product its schema and quality rules. The **Excel** inventory gets a *Datasets* sheet, and *Columns* and *Quality* sheets when they have rows; the *Connections* sheet gets a *Latency* column when some connection has one.
- From the console: `Diagramon.catalog()` (declared and undocumented names, with their connections and nodes), `Diagramon.dataset(idOrName)`, `Diagramon.addDataset({ name, … })` (returns the new id, or an empty string when refused), `Diagramon.updateDataset(id, patch)`, `Diagramon.removeDataset(id)`, `Diagramon.renameDataset(id, name)`, `Diagramon.freshness(name)` (`{ worst, path, hops, unknownHops, sla, state }`, times in milliseconds), `Diagramon.storage(id)`, `Diagramon.contractYaml(idOrName)` and `Diagramon.contractsYaml()`. Changes can be undone with **`⌘Z`**.
- Diagrams without datasets and without latencies export exactly as before.

The *Lakehouse greenfield* template comes with ten datasets: five raw ones in bronze, *orders*, *customers* and *products* in silver, and *sales_daily* and *customer_360* in gold as data products. *sales_daily* is set up to miss its freshness SLA, so the **Review** tab shows a high finding to look at.

#### Import a dbt manifest

Many lakehouse teams already describe their tables in dbt. **Import** (or dropping the file on the canvas) accepts the `target/manifest.json` that `dbt compile` or `dbt build` writes (manifest schema v10 to v12). Everything happens in the browser: the file is read locally and nothing is sent anywhere. A small dialog asks how to apply it and previews the counts (datasets by layer, columns, quality rules, exposures) and warnings:

- **Merge into this diagram's catalog** (the default when the diagram has components). Datasets are added or updated by name. What dbt provides replaces what was there (description, columns, quality rules, layer, domain, owner, freshness, product and contract when present); what dbt does not know (volume, phase, consumers, steward, an owner you set when dbt has none, the format you chose) is kept, and datasets that are not in dbt are untouched. No component or connection is created. The result is summarized as *N new · M updated · K unchanged*; importing the same file twice changes nothing the second time.
- **New diagram with lineage** (the default for an empty diagram). Draws a readable diagram, never one component per model: one component per source system, one store per layer (Bronze, Silver, Gold, in groups tagged with the layer), one *dbt* component per layer change (bronze → silver, silver → gold, and bronze → gold only if a gold model reads bronze) and one component per exposure. Connections carry the dataset names, so lineage, the catalog and the freshness check work: source system to bronze, bronze to dbt (bronze → silver) to silver, silver to dbt (silver → gold) to gold, gold to the exposures that use it. The title is the dbt project name. It replaces the current diagram; **`⌘Z`** brings it back.

How dbt maps to the catalog (the tunable parts are in `datasets.dbt` of `src/config.js`):

| dbt | Diagramon |
|---|---|
| Source table, model, seed, snapshot | One dataset (name = table or model name; on a clash a source becomes `source_name__name`). Tests, analyses, ephemeral models and older model versions are skipped |
| Folder, name prefix, source, `meta.layer` | Layer: sources are bronze; `staging` / `stg_` and `intermediate` / `int_` are silver; `marts` / `fct_` / `dim_` / `mart_` are gold; `meta.layer` wins. No match: no layer, reported in the preview and not drawn |
| `description` | Description |
| `meta.domain`, the model's `group`, or the first folder under `models/` | Domain |
| `meta.owner`, else the group's owner | Owner (the stakeholder id when the name matches one, ignoring case) |
| `access: public` or `meta.data_product: true` | Data product |
| `config.contract.enforced` | Contract *agreed*, version from `latest_version` as semver (`2` becomes `2.0.0`; else `1.0.0`) |
| `meta.format` | Format (default `delta`) |
| Columns | Schema: type from `data_type`; *key* for a `primary_key` constraint or a `unique` + `not_null` pair of tests; *not nullable* for `not_null`; *pii* for `meta.pii` or the `pii` tag (the dataset also gets the *pii* class); `meta.classification` and tags that match a data class |
| Tests | Quality rules: `not_null`, `unique` and `accepted_values` (values joined with commas) map directly; `relationships` becomes *custom* with `→ table.field`; any other test (dbt_utils, singular…) becomes *custom* named after the test. `error` is high, `warn` is medium |
| Source `freshness` | Freshness SLA from `error_after` (else `warn_after`), as `30m`, `12h` or `1d` |
| Exposures | Consumer components in the new diagram, and the consumers of the dataset contracts |

The limits of the data model apply (500 datasets, 300 columns and 100 rules per dataset); anything over is left out and reported. The file may be up to 20 MB and 5,000 objects. From the console: `Diagramon.importDbt(text, { mode: 'merge' | 'new' })` applies it without the dialog and returns the summary. A sample is in `samples/dbt/`.

## 7. Review findings

1. Select a component and click **⚑ Raise a review finding**.
2. Write the **Finding** (what must be fixed), **Raised by**, **Raised on** (today by default) and the **Due date**.
3. When it is fixed, click **✓ Mark resolved**. **Reopen** brings it back; **Remove** deletes it.

The component gets a tag: **IN REVIEW** (orange), **OVERDUE** (red, once the due date has passed) or **RESOLVED** (green).
The panel shows how many days are left or how late it is, and the summary above the canvas counts open and overdue findings.
Diagramon remembers the last reviewer name. Exports with the legend list the open findings with their due date.

### Automatic security review

Diagramon checks the diagram for common security problems and **only warns, it never blocks anything**. The **Review** tab (in the **Governance** group) lists every finding, grouped by source and severity, and its label shows the number of open findings in the color of the worst one. The same number appears in the line above the canvas (*⚑ N findings*), and in the **Security** view each component with findings gets a small *⚠ n* pill.

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

### Requirements and traceability

The **Requirements** tab records *what the client needs*, so each decision and component can be traced back to a reason. Requirements belong to the document, like decisions: opening a version keeps them, the *Text* tab writes them as `req` lines, and **Export › JSON** saves them under `requirements` (the key does not exist while there are none).

- **+ New requirement** adds a card (`REQ-001`, `REQ-002`…) with a **title**, **kind** (*Driver*, *Quality (NFR)*, *Constraint*, *Principle*), **priority** (*Must*, *Should*, *Could*), **status** (*Draft*, *Agreed*, *Dropped*), **source** (who asked for it) and **detail**. Chips by kind, status and priority, and a search box, filter the list. The header shows **N agreed · X covered · Y checks passing**.
- **Link it** to what satisfies it: **Link selection** (components, a connection or a group) and **Link decision…**. A requirement is **covered** when it links to an *accepted* decision or to at least one component, connection or group; each card says so (*Covered by ADR-003 (accepted), 2 components*). The ADR cards list *Addresses: REQ-001 …* and the component, connection and group panels list their requirements; click a chip to open it in its tab.
- **Checks** (fitness functions). Give a requirement a **Check** and the app evaluates it with what it already computes, but only while the requirement is *Agreed*. The badge shows ✓ passing, ✗ failing or ? unknown; hover it for the actual value against the target.
  - *Availability*: the composite availability of the route **from** one component **to** another reaches the target percent (set component SLAs first).
  - *RPO* / *RTO*: the worst RPO / RTO on that route is at most the target, in hours.
  - *Cost*: the total monthly cost of the diagram is at most the target.
  - *Encryption*: every connection carrying a data class is marked encrypted; the failing connections are listed.
  - *Residency*: no unapproved cross-border connection carries a sensitive data class out of a jurisdiction (set component regions first).
  - *Freshness*: the end-to-end freshness of a dataset (the sum of the connection latencies along its slowest path, see *Data catalog and data contracts*) is at most the target hours.
  Missing or invalid parameters give *unknown* with the reason.
- **Review findings** (source *Requirements*): an *Agreed* **Must** (medium) or **Should** (low) requirement with no accepted decision and no linked component, and an *Agreed* requirement whose check fails (high for *Must*, medium otherwise).
- **Matrix** switches the tab to a **traceability matrix**: one row per requirement, one column per decision, ✓ where they are linked and *accepted* decisions highlighted in green. Click a cell to link or unlink; **⤢ Expand** opens it large over the canvas (**Close** or Esc returns).
- The **report** has a *Requirements and traceability* section (id, title, kind, priority, status, covered by, check result) and the **Excel** inventory a *Requirements* sheet. The *Lakehouse greenfield* template starts with eight requirements in *Draft*, linked to its decisions and components, to refine and agree with the client.
- From the console: `Diagramon.requirements()`, `Diagramon.addRequirement({ title, kind, priority, status, check: { metric: 'residency', cls: 'pii', jur: 'eu' }, links: { decisions: ['ADR-005'] } })`, `Diagramon.updateRequirement(id, patch)`, `Diagramon.removeRequirement(id)` and `Diagramon.checkRequirement(id)` (returns `{ state, actual, detail }`). Everything can be undone with **`⌘Z`**.

### RAID log (risks, assumptions, issues, dependencies)

Open the **RAID** tab to record *what could go wrong and what we are assuming*, next to the diagram (*what*) and the ADRs (*why*). Four kinds of item, each with its own id: **Risk** (`R-001`), **Assumption** (`A-001`), **Issue** (`I-001`) and **Dependency** (`D-001`). Use **+ Risk**, **+ Assumption**, **+ Issue** or **+ Dependency**; click a card to edit it.

- **Every item**: title, detail, owner, *raised* date and links. **Risks** add *probability* and *impact* (1 to 5; the score is probability × impact, 15 or more is high, 8 to 14 medium), a **mitigation** and a status (*Open* / *Closed*). **Assumptions** have a **validation** (*Pending*, *Validated*, *Invalidated*) and a *validate by* date. **Issues** and **dependencies** have a status and a *needed by* date.
- **Assumptions**: the **✓ Validated** and **✗ Invalidated** buttons record the date and who (your author name) in a small **validation history**; changing the validation select does the same.
- **Links**: **Link selection** links the selected components, connection or group, **Link decision…** an ADR and **Link requirement…** a requirement (when the diagram has them). Links to things you delete disappear by themselves. Linked items show as chips; click one to jump to it.
- **Where it shows up**: an ADR card and a requirement card list the items that link to them (*Assumptions & risks*), and the component, connection and group panels show a *Risks & assumptions* row when something links to them; click a chip to open the item in the RAID tab. If an **invalidated assumption** supports a *proposed* or *accepted* decision, the ADR card shows a red banner, with **Reopen decision** for accepted ones: it sets the decision back to *Proposed* and writes *Assumption A-002 invalidated* in its history.
- **Filters**: Risks / Assumptions / Issues / Dependencies / All, a status filter and a search box. With **Risks** selected a 5 × 5 **heat map** (probability across, impact up) shows the count per cell, coloured low / medium / high; click a cell to filter the list. The header summarises, for example *3 open risks (1 high) · 2 assumptions to validate · 1 overdue*.
- **Findings** (Review tab, source *Risks and assumptions*): **high** when an invalidated assumption supports a proposed or accepted decision (*ADR-003 relies on assumption A-002, which was invalidated*, fix: review the decision); **medium** for a pending assumption past its *validate by* date (it says so when an accepted decision relies on it) and for an open issue or dependency past its *needed by* date; an open risk scoring 15 or more is **high** without a mitigation and **low** with one (still visible).
- **Export**: the **report** has a section *Risks, assumptions, issues and dependencies* (summary, heat-map table and one table per type), the **Excel** inventory has a *RAID* sheet, and **Export › JSON** keeps the log under `raid`. The *Text* tab writes it as `risk`, `assumption`, `issue` and `dependency` lines (see the text format guide). Diagrams without a log export exactly as before.
- The log belongs to the document, not to a version: opening a version keeps it. Everything can be undone with **`⌘Z`**. The **Lakehouse greenfield** template comes with seven items (four assumptions, two risks, one dependency) linked to its ADRs and components.
- From the console: `Diagramon.raid()`, `Diagramon.addRaid({ type, title, ... })`, `Diagramon.updateRaid(id, patch)`, `Diagramon.removeRaid(id)` and `Diagramon.validateAssumption(id, true | false)`.

### Stakeholders, RACI and approvals

Open the **Stakeholders** tab (in the **Governance** group) to record the people who decide on the project (architect, CISO, data owner, FinOps…) and who approves what. Each stakeholder is a card with a name, a role and an **organisation** (*Client*, *Partner* or *Internal*), shown as a coloured pill. Use **+ Stakeholder**, click a card to edit it, and the summary counts the stakeholders and the decision areas that have no approver.

- **Flags on the card**: **Approves versions** makes the stakeholder a required approver of every saved version. **Inactive** (*left the project*) means they are never required again, but their sign-offs stay in the history.
- **Delete** asks for confirmation. A stakeholder with sign-offs cannot be deleted, so the approval history stays intact: the dialog offers **Mark inactive** instead.
- **RACI matrix**: one row per stakeholder and one column per decision area: **All areas** (the `*` column, which applies to every area) and each area used by a decision or by the matrix itself. Each cell is a select with *–*, **R** (responsible), **A** (accountable: approves), **C** (consulted) or **I** (informed). A **⚠** in a column header means that area has no active **A**; hover it for *No approver for this area*. The matrix scrolls sideways inside its box; **⤢ Expand** opens it in a large window over the canvas (**Close** or Esc returns).
- **Required approvers**: for a decision, the active stakeholders with **A** on its area or on **All areas** (a decision without area only needs the *All areas* approvers). For a version, the active stakeholders with **Approves versions**. Nobody else is asked, and an area without any approver gets a Review finding (see below).
- **Approvals on the cards**: an ADR card and a version card have an **Approvals** section, with one row per required approver: name, role, a state (*Pending*, or ✓ *Approved* / ✗ *Rejected* with the date) and the buttons **Approve** and **Reject**. The optional **sign-off note** field below the rows is used by the next Approve or Reject. The header shows *2 of 3 approvals*, and the sign-off history is collapsed below (*Sign-off history (n)*). On an ADR card, the section also warns (⚠, without blocking) when a linked invalidated or overdue assumption, or a linked requirement whose check fails, supports the decision.
- **Review rounds**: only the sign-offs that belong to the current round count. For a decision, a round starts at its last *Proposed* history entry; for a version, it starts when the version last went to *In review*. Within a round the latest sign-off of each approver wins, so an approver can change their mind by signing again.
- **Gates**: when an ADR is set to *Accepted*, or a version to *Approved*, while required approvals are missing, the app asks first: *Missing approvals: X, Y. Accept anyway?* (or *Approve this version anyway?*). **Continue anyway** records it, and the history note says *Accepted without approval of X, Y*. A version that becomes complete gets its *Approved by* field filled with the approvers' names if it was empty. The API (`updateDecision`) never asks, but adds the same note.
- **Findings** (Review tab, source *Approvals*): **low** for a decision area with no approver (*Nobody approves the “Security” decisions*, fix: give a stakeholder **A** for this area); **medium** for an accepted decision with missing approvals, and for an approved version with missing approvals; **high** when a required approver's latest sign-off is a rejection on a proposed or accepted decision (fix: address the objection and ask for a new sign-off, or change the status).
- **Text and history**: the *Text* tab writes stakeholders as `stakeholder` lines and the decision sign-offs as a `signoffs:` field (see the text format guide). The ADR comparison between versions lists sign-offs that were added or changed (for example *SH-002 approved*).
- **Report and Excel**: the **report** has a section *Stakeholders, RACI and approvals* (the stakeholders, the RACI matrix, and the approvals of each decision and version with the pending and rejected names), and the **Excel** inventory has a *Stakeholders* sheet (RACI as `area:letter; …`) and a *Sign-offs* sheet (one row per sign-off). Both sheets appear only when there is data. Diagrams without stakeholders export exactly as before.
- The stakeholders belong to the document, not to a version: opening a version keeps them, and the sign-offs stay with the decisions and versions they were given on. Everything can be undone with **`⌘Z`**.
- From the console: `Diagramon.stakeholders()`, `Diagramon.addStakeholder({ name, role, org, raci: { '*': 'C', Security: 'A' }, versions: true })`, `Diagramon.updateStakeholder(id, patch)`, `Diagramon.removeStakeholder(id)` (refused when the stakeholder has sign-offs), `Diagramon.signoff(kind, id, stakeholderId, verdict, note?)` (kind `decision` or `version`, verdict `approve` or `reject`, today's date) and `Diagramon.approval(kind, id)` (returns the required, approved, rejected and pending ids, `complete` and the sign-offs).

### Architecture by phases

A greenfield is not built at once. Plan the build in **phases**: an ordered list of steps (*MVP*, *Wave 1*, *Wave 2*…), each with a name, an optional **date** (`2026-12` or `2026-12-15`) and an optional **goal** (*What the client has at the end of this phase*). The order of the list is the timeline; up to 12 phases.

- **Phases manager**: at the top of the **Versions** tab, above the version list. **+ Add phase** adds one (named *Phase N*; rename it in place). Each row has the name, the date, the goal, **↑** and **↓** (*Move earlier* / *Move later*) and **✕** (*Delete phase*). The **+a · −r** counter shows how many components enter and leave in that phase, compared with the previous one.
- **Delete** asks first and moves the phase's elements to the previous phase (or to *always present* when it was the first). A component that was retired in the deleted phase is retired in the next one, or no longer retires.
- **Phase and Retired in**: every component, connection and group can say in which phase it **appears** (**Phase**) and, if it is temporary, the phase from which it is **retired** (**Retired in**). An empty *Phase* means *always (from the start)*; *Retired in* offers only the phases after the chosen one. Several selected elements can be changed at once; with different values the select shows *Mixed*.
- **New components** created while a phase is selected get that phase (in the first phase they are simply there from the start).
- **Phase bar** (bottom left of the canvas, shown when the diagram has phases): **All** and one chip per phase, with its date. Click a chip, or press **`[`** and **`]`** for the previous and next phase (not while typing). **All** shows everything.
- **Show future as ghosts** (on by default): what does not exist yet in the selected phase is drawn dimmed and dashed instead of hidden; turn it off to hide it. Elements retired by the selected phase are hidden. Ghosts can be selected and edited, so you can give them a phase from the canvas.
- A **NEW** badge marks the components that appear exactly in the selected phase.
- The canvas summary line gives the phase, for example *Phase: Wave 1 · 14 components · ≈ $4,200/mo* (the cost only when there is one).
- **Versions** keep the phases with the elements, so each saved version carries its own plan. **SVG** and **PNG** exports show the selected phase as it is on screen (ghosts or hidden elements included); the **JSON** export keeps `phases`, and the Text tab writes them (see the text format guide).
- **Excel**: the Components and Connections sheets get **Phase** and **Retired in** columns, and a **Phases** sheet has one row per phase: ID, name, date, goal, components, added, retired and monthly total. Only diagrams with phases get them.
- From the console: `Diagramon.phases()`, `addPhase({ name, date, goal })` (returns the new id), `updatePhase(id, patch)`, `removePhase(id)`, `setPhase(i | id | null)` (the phase shown; `null` = All), `Diagramon.phase` (the index shown, `-1` = All), `phaseModel(i)` (a copy of the diagram as it is in phase `i`) and `phaseStats(i)` (components, connections, monthly cost and open findings of that phase).

### Migration disposition (6R)

Say what happens to each component when the architecture is migrated: **Retain**, **Rehost**, **Replatform**, **Refactor**, **Repurchase** or **Retire**.

- Select a component (or several). Under **Migration (6R)**, pick one of the buttons; *None* removes it. Hover a button for a one-line meaning.
- The component shows a small pill at the bottom right with its initials (*RH* for rehost). It is hidden in the **Context**, **Security** and **Physical** views.
- The **Migration (6R)** filter in the lenses dims everything with another disposition (or none).
- The comparison table of the phases gets a **6R** column with the split of each phase, for example *RH 3 · RT 1*. Phases and 6R say different things: the phase says *when*, the disposition says *what*.
- The **Review** panel has a *Migration* source with three warnings, all low and dismissible: a component to retire that no phase retires, a component marked retain, rehost or replatform that a phase retires, and (off by default) a repurchase or refactor with no linked decision.
- The **report** has a *Migration strategy (6R)* section (counts, and each component with the phases where it appears and where it is retired); the **Excel** and CSV inventory get a *Migration (6R)* column; comparing versions lists a changed disposition. Diagrams that do not use it export exactly as before.
- In the *Text* tab: `app: Billing app disposition=rehost` (Spanish: `disposición=rehospedar`). JSON: `"disposition": "rehost"`.
- The values, colors, initials and warnings are in `src/config.js › migration`; the seventh R, *Relocate*, is there and off by default.

### Tech radar and end of support

Keep a list of which products are accepted and which are on their way out, and see it on the diagram. Each entry says how to recognise a product (by **icon**, **type** or **text** in the name or subtitle), its **ring** (**Adopt**, **Trial**, **Hold** or **Retire**), and optionally the **end of support** date, a replacement and a note.

- Entries live in `src/config.js › techRadar.entries` (empty by default, with commented examples), and a diagram can add its own in a `radar` list in the JSON (same shape; the same `id` replaces the one from `config.js`). The first entry that matches a component wins, and every field you give in `match` must match.
- Select a component. Under **Tech radar**, leave *Automatic* to use the matching rules, pick an entry to pin it, or choose *Not in the radar* to exclude it. The line below shows the ring, the end of support, the replacement and the note.
- On the canvas a small tag appears at the top left only when something needs attention: *HOLD*, *RETIRE*, or *EOL* when support has ended or ends within `warnMonths` (6 by default). Hover it for the details.
- The **Tech radar** filter in the lenses has *Needs attention*, one chip per ring in use, and *Not in the radar*.
- The **Review** panel has a *Tech radar* source: support already ended and ring *Retire* (high), support ending soon and a component still present in a phase dated after the end of its support (medium), a phase that adds a component on *Hold* (low), and a component in *Retire* that the 6R marks as *Retain* (medium). They only warn, can be dismissed, and each rule can be turned off or re-rated in `techRadar.rules`.
- The **report** has a *Tech radar* section (components per ring, and each recognised component with its product, ring, end of support and replacement); the **Excel** and CSV inventory get *Tech radar* and *End of support* columns when some component matches.
- In the *Text* tab: `db: Core radar=oracle11` pins a component to an entry and `radar=none` excludes it. The entries themselves are kept in the JSON and are not lost when you edit the text.
- Dates are compared with today's date, so the warnings change as time passes.

### Effort estimation

Say how many person-days each component takes to build, by role, so the phases can later be priced. The roles and their daily rates are yours: they live in `src/config.js › estimation.roles` and ship empty, so the field only appears once a company adds its own.

- Select a component. Under **Effort (person-days)**, pick a role, type the days and press **Add**; change a row in place or press **×** to remove it. The total shows days, hours and, when the roles have a rate, the cost in the currency of `cost.currency`. Up to 8 roles per component.
- The effort counts in the phase where the component appears (its *Appears in phase*; with no phase, the first one).
- A role that is not in `config.js` is kept and marked ⚠: it has no rate, so it adds days but no cost.
- In the *Text* tab: `api: Orders API effort=dev:10,devops:3` (Spanish: `esfuerzo=dev:10,devops:3`). Decimals use a point. JSON: `"effort": [{ "role": "dev", "days": 10 }]`.
- Work that is not a component (management, testing, data migration) goes in the JSON, per phase: `"extra": [{ "label": "Testing", "role": "qa", "days": 5 }]`, and the document can set its own contingency with `"estimation": { "contingency": 15 }` (percent on top of the effort). The Text tab does not carry these two, but editing the text keeps them.
- **Estimation by phase**: under the phase comparison (*Versions* tab) a second table appears as soon as something has effort: per phase, how many components are estimated out of those that appear in it, the person-days (hover for the split by role, with the extra work noted apart), the build cost with the contingency, the total to date, and the monthly running cost of that phase next to it, so building and running can be compared. The cost columns show only when some role has a rate.
- The **contingency** is a percentage on top of the effort: `estimation.contingency` in `config.js` is the default and the document can set its own in the JSON; a document value of `0` wins over the default.
- The **Review** panel has an *Estimation* source with two low, dismissible warnings: a phase where some components have effort and others do not, and a role with no daily rate. Both can be switched off in `config.js › estimation.rules`.
- The **report** has an *Effort estimation* section (a row per phase with days per role, build cost, contingency, total and total to date, plus a total row), and the **Excel** inventory gets an *Estimation* sheet and an *Effort (days)* column in Components.
- Without effort nothing changes: no key in the JSON, no column anywhere.

### Comments

Keep the discussion inside the document: threads with an author on a component, a connection, a group, a decision, a requirement or a version, or on the whole diagram.

- Press the **speech bubble** button at the bottom right of the canvas (the number is the open threads), or select a component, connection or group and press **Comments** in the inspector. The dialog lists the threads with a filter (*Open*, *All*, *Resolved*); from the inspector it starts filtered to that element, and the **×** shows them all.
- To comment, write your name (it is remembered), choose what it is about, write the text and press **Comment**. Each thread can be answered, **resolved** or reopened, marked **internal** and deleted (press twice to confirm). Every change is one undo step.
- A component with open threads shows a small yellow bubble with their number on its left edge (hidden in the **Context** view and never in exported images).
- Mark a thread **internal** when it is only for you: internal comments never leave the document (the files and reports that carry comments in the next steps skip them).
- Comments written by a reviewer in the encrypted viewer come back as a file you import (see [Share an encrypted diagram](sharing.md)); they arrive as threads marked *client*.
- If an element is deleted, its threads move to *The whole diagram* and remember what they were about. Restoring a version keeps the comments, and saved versions do not carry them.
- The **Review** panel has a *Comments* source: one low, dismissible notice per component, connection or group that still has open threads (`comments.rules` in `src/config.js`, where the limits also live).
- JSON: a `comments` list, oldest first (`id`, `on: { kind, id }`, `author`, `date`, `text`, `status: "resolved"`, `internal`, `source: "client"`, `imp`, `replies`). The *Text* tab does not show comments and does not lose them. A document without comments writes exactly what it wrote before.

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
  The JSON starts with `formatVersion`, the number of the file format. Files saved before the field existed open as they always did and are brought up to date when opened, saved versions included. A file with a *newer* format than your copy of Diagramon still opens, with a notice: anything your version does not know will be lost if you save it. (Not to be confused with the *Version* field of the title block, which is the document's own version.)
- **Export › Mermaid, PlantUML or draw.io** turns the diagram into code or a file for other tools: a Mermaid flowchart (renders in GitHub, GitLab and Notion), a PlantUML diagram with no external includes, or a `.drawio` file that keeps the same layout, nested groups and official icons. Notes, risk zones and trust boundaries are exported too, components with an internal diagram become nested boxes (Mermaid, PlantUML) or one page per level linked from the component (draw.io), and owners, region, layer, data classes, SLA, cost, compliance and STRIDE decisions travel as metadata (comments in Mermaid and PlantUML, *Edit Data* fields and tooltips in draw.io). Architecture decisions (ADR) are exported as comments (Mermaid, PlantUML) or as a last «Architecture decisions» page (draw.io), linked components carry `adrs=ADR-001,…`, and dismissed findings travel as `dismissed` comments or attributes on their target.
- **Export › Encrypted HTML** creates one `.html` file to share a diagram privately. Whoever receives it double-clicks it, types the password and sees the diagram (dark or light, with zoom). No app, no install, no download. Details below.
- The **Export** menu also has **Legend and title block** (on by default), with **Author** and **Version** fields.
  SVG and PNG files then get a panel at the bottom with only what the diagram uses (connection styles, padlocks,
  component colors, data classes) and a title block with title, author, version, date and estimated cost.

### Architecture report

**Export › Architecture report…** builds the document architecture review boards ask for, with no libraries and no network:

- **Format**: **PDF** (opens your browser's print dialog on a print-ready A4 document: choose *Save as PDF*), **Markdown** (`.md`) or **HTML** (`.html`, one self-contained file, the same document as the PDF with no external requests).
- **Sections** (all on by default, remembered): Summary · Diagram · Components · Connections · Data classification & residency · Owners · Data lake layers · Costs · Security findings · Compliance · Threat model · Decisions (ADR) · Risks, assumptions, issues & dependencies · Version history · Notes & risk zones. A section with no data is skipped and shown as *(none)*.
- **Compliance section**: per framework, a table of controls with their counts and coverage, followed by a real grid: one row per component, one column per control (framework header row spanning its controls, then control ids), with ✓ met, ◐ partial, ✗ gap, — N/A and a colour per status; a control inherited from a group carries a ↑ (italic in HTML), and a blank cell means not mapped. With more than 10 controls in use the grid is split into one table per framework so it fits an A4 page. In Markdown each grid is a pipe table with the same symbols and a legend line below.
- **Connections**: style (custom types by name) and cross-border; an *Importance* column appears only when some connection is Important or Critical (reports of diagrams without importance stay as before), and a *Connection types* table follows when the diagram has custom types.
- **Diagram**: pick which of the 9 views to include (the active view, plus Security and Data when they add something). If the diagram has internal diagrams (C4 levels), **Include internal diagrams** renders each one. Images use the light theme by default (good for print); **Use current theme** keeps the one on screen.
- **Markdown images** are embedded as `data:` PNGs. Some Markdown viewers block them, so tick **Save images as separate files** to download the PNGs next to the `.md` and reference them by file name.
- Texts come out in the current interface language, dates and money in the document's formats, and everything is escaped.
- From the console: `Diagramon.exportReport({ format: 'pdf' | 'md' | 'html', sections?: [...], views?: [...], scopes?: true | false, theme?: 'light' | 'current', separateImages?: boolean })` returns a promise with the generated HTML or Markdown after starting the download or the print dialog. Section keys: `summary diagram components connections data owners layers costs findings compliance threats decisions raid approvals versions notes`.

### Status report

**Export › Status report…** writes the paragraph you would otherwise compose on Friday: what changed since a reference, in short sentences ready to paste into an email. It is built from the diagram, the decisions and the findings, with fixed templates in English and Spanish (the language of the app): no AI, no service, and the same document always gives the same text.

- **Compare with**: the last saved version (the default), another saved version, or a date. With a date, the diagram is compared with the latest version saved up to that day; with no version at all, only the dated things count.
- The sections are *Decisions* (accepted, rejected or newly proposed), *Risks* (new and resolved Review findings), *Phases* (a date that moves, a component that changes phase), *Architecture* (components added, removed or modified, and connections), *Cost and effort* (monthly running cost and estimated effort), *Pending approvals*, *Comments* (open public threads) and *Versions*. A section with nothing to say is not printed; untick the ones you do not want.
- Versions only keep the diagram, so decisions, comments and approvals are placed by their dates: what happened **after** the reference day counts, and the same day does not.
- The preview is the text itself. **Copy text** puts it on the clipboard as plain text; **Markdown** and **HTML** download it with the same escaping and styling as the architecture report.
- From the console: `Diagramon.statusReport({ kind: 'last' | 'version' | 'date', id, day })` returns `{ data, text }`, and `Diagramon.statusOutput({ …, sections, format: 'text' | 'md' | 'html' })` returns the document as a string.

Example (English):

```
Changes since Version 3 (Oct 3, 2026).

Decisions
- 1 decision was accepted: ADR-004 Use Kafka for ingestion.

Risks
- 1 new risk was detected: Orders API is exposed to the internet (High).
- 2 risks were resolved: Unencrypted link to Billing and Old batch has no owner.

Architecture
- 2 components were added: Queue and Consumer.
- 1 connection added.

Cost and effort
- Monthly running cost goes from $1200 to $1500 (+$300).
```

### Inventory (CSV / Excel)

**Export › Inventory (Excel)** and **Export › Inventory (CSV)…** turn the diagram into a table for a CMDB or an audit, fully offline and with no libraries.

- **Components** (one row per component, every C4 level): ID, name, detail, type, provider, service, category, C4 kind and level path, group path, owner, data steward, team and cost center (the effective value, plus an *Inherited from* column when a group supplies it), region and jurisdiction, data classes, sensitive (yes/no), data lake layer, exposure and backup (effective), encrypted connections in and out, unencrypted sensitive connections, SLA, RPO, RTO, replicas, cost as entered, period, cost per month and per year, review status, open findings, linked ADRs, a compliance summary (for example *ISO 27001: 3 met / 1 gap*) and the description.
- **Excel** (`.xlsx`) has one sheet per table: Components, Connections (style with the custom type's name, importance Normal / Important / Critical, custom type yes/no, encryption, data classes, datasets, cross-border, transfer approved, open STRIDE threats), Connection types (only when the diagram has custom types: id, name, line pattern, color, width, moving dots and how many connections use it), Groups, Owners (per team), Decisions, RAID, Stakeholders and Sign-offs (one row per sign-off), Findings (with dismissed ones and their reason) and Versions. Empty tables are skipped. The *Importance* and *Custom type* columns are always present in Connections (stable schema, even for old diagrams). The header row is bold, frozen and filterable, columns are sized to their content, costs use a currency number format and SLA keeps three decimals.
- **CSV** opens a small dialog: *Components only* (`<diagram>-inventory.csv`) or *All tables as separate CSV files* (one download per table, named `<diagram>-inventory-<table>.csv`). The files include the BOM so Excel respects accents.
- From the console: `Diagramon.inventory()` returns the component rows, and `Diagramon.exportInventory('xlsx' | 'csv' | 'csv-all')` starts the download.

## Workspace (several diagrams)

A client rarely has one diagram. The **Workspace** button (folder icon, next to *Import*) opens a folder that holds several Diagramon files, lists them and lets you switch between them.

- **Open folder…** reads the `.json` files directly inside the folder (subfolders are not read). Each one that is a Diagramon diagram is listed with its title, components, connections and format version; other JSON files are counted as ignored.
- **Open** loads a diagram. If the one on screen changed since it was opened or saved in the folder, you are asked first, and **Undo** brings it back.
- **Save current diagram here** (Chromium browsers: Chrome, Edge, Brave) writes the diagram into the folder, replacing its own file or creating `<title>.json`. It asks before replacing a file.
- Other browsers read the folder but cannot write into it: the list says *read-only*, and you keep using **Export › JSON**.
- Every diagram saved this way gets a `docId`, a stable identifier that does not change if you rename the file. It is the anchor for the links between diagrams that come next. The folder may also hold an optional `diagramon-workspace.json` with `{ "name": "Client X" }`, shown instead of the folder name.

Nothing leaves your browser: the folder is read and written locally, and permission is asked by the browser each time you open it.

### Systems map

- Select a component and pick **Detailed in** in the inspector to say that another diagram of the folder details it (a «Payments» box here, the Payments diagram there). **Open** jumps to that diagram. Only diagrams that have a `docId` can be chosen: open a diagram and use **Save current diagram here** to give it one.
- The **Systems map** tab of the Workspace window draws one box per diagram and one arrow for each pair that is linked, with the component names in the arrow's tooltip. Click a box (or press Enter on it) to open that diagram. The diagram on screen is drawn from its current state, even if the file in the folder is older.
- A link to a diagram that is not in the open folder shows up under the map and as a low **Review** finding (source *Workspace*) while a folder is open.
- Links are saved in the JSON as `ref: { "doc": "<docId>" }` on the component. The Text tab does not show them, but editing the text keeps them.

### Data lineage across diagrams

The **Data lineage** tab of the Workspace window follows a dataset from one diagram to the next. Datasets are matched by name (upper and lower case do not matter), the same name you already put on connections.

- A dataset *produces* in a diagram when it starts at a component that nothing feeds with it, and *consumes* where it ends. The tab lists every dataset that appears in two or more diagrams, with the role in each.
- If a component is "detailed in" another diagram and the dataset flows out of or into that component, the other diagram should carry the dataset too. If it does not, the tab warns and **Review** raises a low finding on that component.
- If two diagrams both produce the same dataset (and neither links to the other), Review flags it once so you keep a single source.

Nothing is stored for this: it is computed from the files in the folder and the diagram on screen.

### Shared items

People, decisions and datasets often repeat across the diagrams of one client. The **Shared items** box of the Workspace window keeps one copy for the whole folder, in `diagramon-workspace.json`:

- **Share from this diagram** (Chromium browsers) publishes the stakeholders, decisions (ADR) and datasets you tick. An item with the same name or title (ignoring case and accents) is replaced; the others are added.
- **Add shared items to this diagram** copies what the diagram lacks, matching by name or title, so nothing is duplicated. The diagram numbers them itself (`SH-…`, `ADR-…`, `DS-…`) and each decision starts its history today. One step of **Undo** removes the whole addition.
- Each diagram stays self-contained: it is a copy, not a live link, so a later change to the shared list does not reach a diagram until you add again, and a copy never overwrites what the diagram already has. Ids, links to components, sign-offs, phases and version links do not travel, because they only mean something in the diagram where they were made.

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
