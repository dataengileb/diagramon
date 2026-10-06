<div align="center">

**English** · [Español](README.es.md)

<img src="docs/logo.svg" width="112" alt="Diagramon, a cloud with antennas">

# Diagramon

**Animated cloud architecture diagrams that live 100% on your computer.**

No server. No account. No internet. Not a single byte of your customers' data leaves your machine.

![Open source](https://img.shields.io/badge/open%20source-MIT-C2B6F6?style=flat-square)
![Privacy](https://img.shields.io/badge/privacy-100%25%20local-A6E3C8?style=flat-square)
![No install](https://img.shields.io/badge/install-none-F8C99E?style=flat-square)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-F5A9C6?style=flat-square)
![Works offline](https://img.shields.io/badge/works-offline-A9D2F3?style=flat-square)
![English and Spanish](https://img.shields.io/badge/UI-EN%20%7C%20ES-E0B5EE?style=flat-square)

<img src="docs/diagram-dark.png" alt="A 3-tier AWS web app drawn with Diagramon in dark mode, with a cost tag under each service">

</div>

---

## Why Diagramon?

Architecture diagrams often hold the most sensitive facts a team has: customer names, account IDs, IP ranges, network layout
and real costs. Most diagram tools ask you to upload all of that to someone else's cloud just to draw boxes and arrows.

**Diagramon does not.** It is a single HTML page that you open from your disk. It draws polished, animated diagrams with
around 290 official cloud icons, and the browser itself blocks every network request.

- **Private by design.** Your diagrams stay in your browser and in the files you export.
- **Zero setup.** Double-click `index.html`. No install, no build step, no sign-up.
- **Built for real architectures.** Official AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric icons, nested groups, costs and flow playback.
- **From your real infrastructure.** Drop a `terraform show -json`, a CloudFormation template, Kubernetes manifests or a `docker-compose.yml` and get the diagram, grouped by VPC, subnet or namespace.
- **Diagrams as code.** Type a short text and the canvas updates live. Text, JSON and canvas always stay in sync.
- **English or Spanish.** The app opens in English. One click switches it to Spanish.

---

## 🔒 Your data never leaves your machine

| | Diagramon | Typical cloud diagram tools |
|---|---|---|
| Where does your diagram live? | In your browser and in the files you export | On the vendor's servers |
| Account required? | No | Usually |
| Internet required? | No, not even for icons | Yes |
| Analytics or telemetry? | None | Often |
| Cloud AI for "text to diagram"? | No: the text language runs locally | Sometimes |

**How it is enforced**

- **One HTML page with plain JavaScript.** No third-party libraries, no CDN, no web fonts loaded from the internet, no trackers.
  The official icons are embedded in `icons/*.js` and the three fonts in `fonts/fonts.js` (base64).
- **The browser blocks the network.** `index.html` sets a Content Security Policy (`connect-src 'none'`).
  Even if someone added code that tried to send data, the browser would refuse it.
- **Short, open code.** You can read every line. There are no calls to `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`.
- **Local autosave.** Work is saved in your browser's `localStorage`, on your machine.
  Exports (SVG, PNG, JSON) are files that you decide where to keep.

> **Tips for sensitive data:** on a shared computer, use a private window or clear the site data when you finish.
> Also review your browser extensions: they can read the pages you open, this one included.

---

## ✨ Features

- 🎞️ **Living diagrams**: particles travel along connections, dashed lines flow, and **Flow** plays the path step by step.
- ☁️ **Official icons** for **AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric** (about 290 services), plus generic icons.
- 🏗️ **Import infrastructure as code**: Terraform (state, plan or `.tfstate`), CloudFormation/SAM, Kubernetes and Docker Compose, parsed locally.
- 🧩 **Nested groups**: region › VPC › subnet, cluster › namespace, and more.
- 🖱️ **Multi-select, alignment and smart guides**: align, distribute with equal spacing, and snap to edges and centers.
- 💵 **Manual costs**: USD per hour, month, year or multi-year, shown under each service, with an approximate monthly total.
- 🏷️ **Data classification and encryption in transit**: tag nodes and connections as *Public, Internal, Confidential, PII, PCI* or *PHI*, mark each connection as encrypted 🔒 or not, and get a red warning when sensitive data travels unencrypted.
- ⌨️ **Diagram as code**: a small text language, with errors shown by line number.
- 🗂️ **Versions and environments**: save the canvas as *Version 1, 2, 3…* or as *Development, QA, Production*, open any of them, and compare it with the canvas: new items in green, changed in yellow, removed as red ghosts.
- ⚑ **Review findings**: raise a finding on any component by hand, with what must be fixed, who raised it, when, and the due date. Tags show *IN REVIEW*, *OVERDUE* or *RESOLVED*, and open findings are listed in the export.
- 📐 **Elbow connectors**: switch between curves and right-angle lines that route around the nodes, for the whole diagram or one connection.
- 🧾 **Legend and title block** in SVG and PNG exports: connection styles, component colors, data classes, author, version, date and estimated cost. Ready to hand in.
- 🔦 **Flow highlighting** for any component: neighbors, targets, sources or everything.
- 🌐 **English and Spanish UI**: the 🌐 button in the top bar (or the **`L`** key) switches the language and remembers your choice.
- 🌗 **Dark mode** by default, **light** and **high-contrast black** modes with one key, and two palettes (Pastel and Neon).
- 📤 **Export** to SVG (animated), PNG or JSON. **Import** JSON by dropping it on the canvas.
- ↩️ **Undo and redo**, autosave and automatic layout.

<div align="center">
<img src="docs/diagram-light.png" alt="Microservices on Google Kubernetes Engine drawn with Diagramon in light mode">
</div>

---

## 🚀 Get started in 30 seconds

**Just want to try it?** Open the [online demo](https://dataengileb.github.io/diagramon/). It is the same page, served by GitHub Pages: your diagram stays in your browser.

1. **Download** the project: green **Code › Download ZIP** button, or with git:

   ```bash
   git clone https://github.com/dataengileb/diagramon.git
   ```

2. **Open** `index.html` with a double-click in any modern browser.
3. That's it. There is no step 3. 🎉

Prefer Spanish? Click the 🌐 **EN** button in the top bar, or press **`L`**.

---

## 📘 Tutorial

### 1. Your first diagram

1. Open the **Templates** tab and pick *Web app on AWS (3 tiers)* to see a complete example.
2. Click **New** to start with an empty canvas.
3. In **Components**, open the **Provider** list and pick **Generic**, **AWS**, **Azure**, **Google Cloud**, **SAP BTP** or **Microsoft Fabric**.
   Only that provider's components are shown. Use the search box: `lambda`, `s3`, `hana`…
   It also matches synonyms and equivalents, in English and Spanish: `sql` finds RDS, Cloud SQL and Azure SQL; `k8s` finds EKS, AKS and GKE; `cola` finds SQS and Service Bus.
   For **SAP**, the **SAP systems** without an official icon (S/4HANA, ECC, TM, EWM…) appear at the top.
4. **Click** a component to add it to the center, or **drag** it onto the canvas.
   Double-click an empty spot on the canvas to add another one like the last.

### 2. Connect

- Select a node, press **`C`**, then click the target.
- Or select a node and **`⇧` + click** the target.
- Click a connection to change its label and style:
  **synchronous** (request), **asynchronous** (event), **data flow** or **optional**.

### 3. Edit and group

- **Click** a node: the right panel shows its name, detail, icon, color and description.
- To change the icon, type part of its name in the **Icon** search (`lamb`, `sql`, `kafka`…) and pick a suggestion with the mouse or with ↑ ↓ and Enter. The × goes back to the generic icon.
- **Double-click** a node, group or connection to rename it.
- Use **Group › + New group…** to create a group. Drag its label to move the whole group.

### 4. Many at once and alignment

- **`⌘` + click** (or **`Ctrl` + click**) adds or removes nodes from the selection.
- **`⇧` + drag** on the background selects an area. **`⌘A`** selects everything.
- With several nodes selected, the right panel can **align** them (left, center, right, top, middle, bottom)
  and **distribute** them with equal spacing, horizontally or vertically.
- With exactly two nodes selected, the right panel shows **Show path A → B** (or press **`R`**): the shortest route follows the arrows, lights up every edge of any shortest route and numbers the steps. If no directed route exists it falls back to ignoring direction and says so. **`Esc`**, the × or any click clears it.
- While dragging, pink **guides** snap the node to the edges and centers of the others. Hold **`Alt`** to turn them off.

### 5. Costs

1. Select a service.
2. Type the price in **Cost (USD)**.
3. Pick the period: **Hourly**, **Monthly**, **Yearly** or **Multi-year** (with a number of years).

The price appears in a tag under the service. The **approximate monthly total** is shown above the canvas.
With several services selected, the panel shows the cost of the selection.

> Diagramon never looks up prices online (privacy first). You type the costs yourself.

### 6. Data classification and encryption

1. Select a component. Under **Data classification**, click the tags for the data it stores or handles: **PUB**, **INT**, **CONF**, **PII**, **PCI**, **PHI**. You can pick several.
2. Select a connection. Set **Encryption in transit** to **Encrypted** or **Not encrypted**, and tag the **Data in transit**.

The tags appear on top of each node and on the connection's label, next to a padlock: closed 🔒 when encrypted, open when not.
When a connection marked *Not encrypted* carries sensitive data, or links a component with sensitive data, it turns red and a warning appears above the canvas.
With several components selected, the tags apply to all of them.

### 7. Review findings

1. Select a component and click **⚑ Raise a review finding**.
2. Write the **Finding** (what must be fixed), **Raised by**, **Raised on** (today by default) and the **Due date**.
3. When it is fixed, click **✓ Mark resolved**. **Reopen** brings it back; **Remove** deletes it.

The component gets a tag: **IN REVIEW** (orange), **OVERDUE** (red, once the due date has passed) or **RESOLVED** (green).
The panel shows how many days are left or how late it is, and the summary above the canvas counts open and overdue findings.
Diagramon remembers the last reviewer name. Exports with the legend list the open findings with their due date.

### Filters

**Filter** (or **`G`**) opens a panel of chips: **Data** (each class in the diagram, plus *Unencrypted sensitive flows*), **Review**, **Provider**, **Category**, **Group** and **Cost**.
Chips in the same section add up (OR); different sections combine (AND). What does not match fades out, including empty groups and connections whose ends do not both match, and selecting a component still works on top.
A pill above the canvas shows the active filter (`Filter: PII · AWS · 7 of 20`) with an **×** to clear it. The filter is remembered per browser and never changes the exports. From the console: `Diagramon.setFilter({ data: ['pii'], provider: ['aws'] })` and `Diagramon.clearFilter()`.

### 8. Versions and environments

Open the **Versions** tab.

- **+ Version N** saves a frozen snapshot of the canvas. Use it as your history: *Version 1*, *Version 2*…
- **DEV**, **QA** and **PROD** save the canvas as that environment. Each environment keeps one copy; saving again updates it.
- Add an optional **note** before saving, for example *before the migration*.
- **Open** loads it on the canvas. A pill above the title shows what is open and warns about unsaved changes.
- **Compare** marks the differences with the canvas: **green** is new, **yellow** changed, and **red dashed** ghosts were removed.
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

### 9. Sticky notes and risk zones

Use the two buttons next to the zoom controls (bottom right of the canvas).
- **Add a sticky note** puts a note in the middle of the view. Double-click it (or use the panel) to write.
- **Add a risk zone** draws a hatched, dashed area under the groups, with a tag like `⚠ HIGH · Public subnet exposure`. Pick its **Severity** (*Low, Medium, High, Critical*) and an optional description in the panel.
- Select several components and click **⚠ Mark as risk zone** to draw a zone around them.
- Drag to move, drag the corner handle to resize (it snaps to the grid), **`⌘D`** duplicates and **Delete** removes. Everything can be undone.
- The summary above the canvas counts the zones (*⚠ 2 risk zones (1 critical)*), exports with the legend list them by severity, and versions and JSON files keep notes and zones.

### 10. Present and export

- **Flow** (or **`P`**) lights up the diagram step by step, from clients to data.
- **Present** (or **`V`**) goes full screen with no panels: an overview with the title, then one slide per group (in reading order, zooming in and dimming the rest) and a closing overview. Without groups it steps through the flow. **`→`**, **`Space`** or click go forward, **`←`** goes back, **`Home`/`End`** and number keys jump, **`P`** plays the flow, **`Esc`** exits and restores your view. Editing is off while presenting.
- **Arrange** lays everything out automatically, following the flow. Each group is arranged inside its own box, so groups never overlap. **Fit** (or **`F`**) centers the diagram.
- **Elbows** (or **`E`**) switches the connections between curves and right-angle lines that go around the nodes. Several elbow lines on the same side of a node leave from separate, evenly spaced points so they never overlap.
  To change only one connection, select it and pick its **Line**.
- **Export** › SVG, PNG or JSON. Keep the JSON to open it again later with **Import**.
- **Export › Mermaid, PlantUML or draw.io** turns the diagram into code or a file for other tools: a Mermaid flowchart (renders in GitHub, GitLab and Notion), a PlantUML diagram with no external includes, or a `.drawio` file that keeps the same layout, nested groups and official icons.
- **Export › Encrypted HTML** creates one `.html` file to share a diagram privately. Whoever receives it double-clicks it, types the password and sees the diagram (dark or light, with zoom). No app, no install, no download. Details below.
- The **Export** menu also has **Legend and title block** (on by default), with **Author** and **Version** fields.
  SVG and PNG files then get a panel at the bottom with only what the diagram uses (connection styles, padlocks,
  component colors, data classes) and a title block with title, author, version, date and estimated cost.

### Keyboard shortcuts

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
| `V` | Present full screen (`→` `←` `Space` `Home` `End` `1`–`9`, `Esc` to exit) |
| `T` | Cycle light → dark → high-contrast black mode |
| `L` | Switch English / Spanish |
| `E` | Switch curved / elbow connectors |
| `G` | Open the filter panel (`Esc` closes it) |
| `Esc` | Cancel or clear the selection |

---

## 🏗️ From infrastructure as code to diagram

Drop your IaC files on the canvas, or use **Import**. Diagramon draws the real architecture in seconds, and nothing is uploaded anywhere: parsing runs in your browser.

| Source | How to get the file |
|---|---|
| **Terraform** | `terraform show -json > infra.json` (state), `terraform show -json plan.out` (plan) or the `.tfstate` file itself |
| **CloudFormation / SAM** | The template, in YAML or JSON |
| **Kubernetes** | Your manifests (several documents per file, several files at once), or `kubectl get all,ingress,pvc,secret -o yaml` |
| **Docker Compose** | `docker-compose.yml` / `compose.yaml` |

What you get:

- **Groups**: AWS region › VPC › subnets (Azure resource groups and VNets, Google Cloud VPCs), Kubernetes namespaces and Compose networks.
- **Connections** deduced from references: ARNs, ids, bucket names, `s3://` paths, hostnames in environment variables, Kubernetes selectors and Ingress rules, `depends_on`. The direction follows the data: a Firehose *source* stream points to the Firehose, and an S3 notification points to the Lambda it triggers.
- **Official icons** and details: runtime, engine, schedule, replicas.
- **Data classification** from tags such as `DataClassification = pii`.
- **Less noise**: supporting resources (IAM, policies, routes, security groups, attachments…) are hidden, but still used to place and connect the rest.

![AWS data lake imported from terraform show -json](docs/iac-data-lake.png)

Try it with the files in [`samples/`](samples): a simple AWS data lake (as Terraform and as CloudFormation), a Kubernetes shop and a Docker Compose stack.

---

## 🔐 Share an encrypted diagram

**Export › Encrypted HTML** asks for a password (12 characters or more, with a strength meter) and saves a single `.html` file.

- **Self-contained and view only.** The file carries its own small viewer. It opens in any recent browser with a double click, offline, with no Diagramon, no install and no download.
- **Everything is encrypted**, the title too. In clear there are only the encryption parameters.
- **Strong, standard crypto** from the browser (Web Crypto): the key comes from the password with PBKDF2-SHA-256 and 600,000 iterations and a random 16-byte salt; the diagram is compressed and encrypted with AES-256-GCM (random 12-byte IV), which also detects any tampering.
- **The viewer cannot leak or run anything.** It blocks the network with its own Content Security Policy and shows the diagram as an image.
- Send the password through a **different channel** than the file. A lost password cannot be recovered.

---

## ⌨️ Diagram as code (*Text* tab)

The fastest way to draw. Type, and the canvas updates by itself. Everything runs locally, with no AI.

```text
title: Online store
direction: LR
lines: elbow
author: Platform team
version: 1.2

group aws "AWS" color=peach {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 cost=350/month data=pii,pci
}
web: Customers [user] desc="Browser"

web -> api : HTTPS
api => db : SQL encrypted=yes
api ~> queue : events
```

| Write | Meaning |
|---|---|
| `id: Name [type] "detail"` | Node. `[type]` is a generic type (`db`, `user`…) or an official icon (`aws/lambda`, `rds`) |
| `color=… badge=… desc="…"` | Node options |
| `cost=120/month` · `0.1/hour` · `1400/year` · `5000/3years` | Cost in USD (no period = monthly) |
| `data=pii,pci` | Data classification of a node or a connection |
| `a -> b : TLS encrypted=yes` | Encryption in transit (`yes` or `no`) |
| `group id "Name" color=… { … }` | Group; groups can be nested |
| `a -> b` · `a => b` · `a ~> b` · `a ..> b` | Request · data · event · optional |
| `a -> b -> c : label` | Chain; the label goes on the last arrow |
| `lines: elbow` · `a -> b : x line=curved` | Elbow or curved lines, for the diagram or one connection |
| `author: …` · `version: …` | Shown in the export's title block |
| `review db: "DB in a public subnet" by=Ana raised=2026-10-01 due=2026-11-15` | Review finding (`status=resolved closed=…` when fixed) |
| `# …` or `// …` | Comment |

Keywords work in English and Spanish (`title`/`título`, `group`/`grupo`, `cost`/`costo`, `/month`/`/mes`…).
A node that only appears in a connection is created for you. Errors are shown in red with their line number.
The text does not store positions: existing nodes stay where they are, and new nodes are placed next to their neighbors.

<details>
<summary><b>JSON format</b></summary>

```json
{
  "title": "My architecture",
  "direction": "LR",
  "groups": [ { "id": "vpc", "label": "VPC", "color": "cielo", "parent": "aws" } ],
  "nodes":  [ { "id": "api", "label": "API", "type": "gateway", "icon": "aws/apigateway", "sub": "REST", "badge": "x2",
                "group": "vpc", "x": 0, "y": 0, "cost": 0.05, "costPeriod": "hour", "desc": "…" } ],
  "edges":  [ { "from": "api", "to": "db", "label": "SQL", "style": "sync | async | data | optional", "color": "rosa" } ]
}
```

- Nodes only need `id` and `type`. Without `x`/`y` they are placed automatically.
- `costPeriod`: `hour`, `year` or `multi` (with `costYears`). Without `costPeriod` the cost is monthly.
- `routing: "elbow"` sets elbow lines for the diagram; `route` (`curved` or `elbow`) overrides it on one edge. `meta` holds `author` and `version`.
- `review` on a node: `{ "status": "open" | "resolved", "note", "by", "raised", "due", "closed" }`, dates as `YYYY-MM-DD`.
- `data` is a list of data classes (`["pii", "pci"]`) on nodes and edges. `encrypted` (`true` or `false`) is the encryption in transit of an edge.
- Exported files also carry `versions` (each with `kind`: `version` or `env`, and its own `diagram`) and `active`.
- `color` takes a palette key (`rosa`, `coral`, `melocoton`, `limon`, `menta`, `cielo`, `lavanda`, `lila`),
  its English name (`pink`, `coral`, `peach`, `lemon`, `mint`, `sky`, `lavender`, `lilac`) or any CSS color.

</details>

---

## 🎨 Customize

Everything you can customize is in **`config.js`**. Save and reload `index.html`.

- **Default theme**: `app.defaultTheme: 'dark' | 'light' | 'black'`. The `T` key and the theme button cycle light → dark → black.
- **Default language**: `app.defaultLang: 'en' | 'es'`. UI texts live in `i18n.js`; texts in `config.js` and `examples.js` can be `{ en: '…', es: '…' }`.
- **Data classes**: `dataClasses` sets the tags (name, short label, color). `sensitive: true` turns on the red warning for unencrypted flows.
- **Environments**: `environments` sets the buttons of the *Versions* tab (name, short label and color). Add or remove as many as you need.
- **Node size**: with `node.sameSize: true` (default) every node is `node.width` wide and long names wrap to 2 lines.
  With `false`, each node grows with its text.
- **Shortcuts without an official icon**: `presets` adds items at the top of a provider's list (for example, SAP systems).
- **Fonts**: pick Inter (default), IBM Plex Sans or Fira Code from the top bar; the choice is saved in your browser and embedded in SVG/PNG exports. They are bundled with the app (not loaded from the web). To add one, drop its `.woff2` files in `fonts/`, add an entry to `FONTS` in `tools/build-fonts.py` (see the header) and run `python3 tools/build-fonts.py`.
- **Palettes**: add an entry to `palettes` with the same color keys (`rosa`, `coral`, …) for `dark`, `light` and `black` (Pastel and Neon ship by default). A saved palette that no longer exists falls back to Pastel.
- **New component type**: copy an entry in `types` and change `label`, `category`, `color`, `keywords` and `icon` (a 24×24 SVG).
- **Connections**: `edgeStyles` sets dash, width and particle count.
- **Animation**: speed, entrance and step duration in `animation`.
- **Costs**: `cost.currency`, `cost.hoursPerMonth` (730 = hours in a month) and `cost.defaultYears`.
- **Templates**: add your own in `examples.js`.

<details>
<summary><b>Update or add official icons</b></summary>

1. Download the official packs: [AWS](https://aws.amazon.com/architecture/icons/),
   [Azure](https://learn.microsoft.com/azure/architecture/icons/), [Google Cloud](https://cloud.google.com/icons)
   (core products and category icons), [SAP BTP](https://github.com/SAP/btp-solution-diagrams)
   (folder `assets/shape-libraries-and-editable-presets/svg`) and [Microsoft Fabric](https://learn.microsoft.com/fabric/fundamentals/icons)
   (`Icons.zip`, folder `package/dist/svg`).
2. Unzip them into one folder with `aws/`, `azure/`, `gcp-core/`, `gcp-cat/`, `sap/` and `fabric/`.
   If a folder is missing, that cloud is skipped and its file is left untouched.
3. Add services to the lists in `tools/build-icons.py` (or set `ALL = True` to include them all).
4. Run:

   ```bash
   python3 tools/build-icons.py <folder>
   ```

Set `"icons": { "enabled": false }` in `config.js` to turn them off.

</details>

<details>
<summary><b>Extension API</b></summary>

`window.Diagramon` exposes `model`, `load()`, `addNode()`, `addEdge()`, `select()`, `align()`, `relayout()`,
`fitView()`, `togglePlay()`, `toggleTheme()`, `toggleLang()`, `lang`, `saveVersion()`, `openVersion()`, `compareVersion()`, `deleteVersion()`, `exportSVG()`, `exportPNG()`, `exportJSON()`, `config` and `icons`.
The text language is in `window.DiagramonText` (`parse` and `stringify`). UI translations are in `window.DiagramonI18n`.

</details>

---

## 🗂️ Project structure

| File | Purpose |
|---|---|
| `index.html` | UI and styles. `#diagram-css` holds the styles that are also embedded in exports |
| `config.js` | **Everything you can customize**: themes, palettes, types, connections, animation and costs |
| `i18n.js` | UI texts in English and Spanish |
| `app.js` | Editor engine |
| `text-lang.js` | Text language (diagram as code) |
| `examples.js` | Templates |
| `export-mermaid.js`, `export-plantuml.js`, `export-drawio.js` | Exporters to Mermaid, PlantUML and draw.io |
| `share.js` | Encrypted, self-contained HTML viewer for sharing |
| `iac.js` | Infrastructure-as-code import (Terraform, CloudFormation, Kubernetes, Compose) |
| `samples/` | Sample IaC files to try the import |
| `icons/*.js` | Embedded official icons for AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric |
| `tools/build-icons.py` | Builds `icons/*.js` from the official packs |
| `fonts/` | Bundled fonts (`.woff2`, OFL licenses) and the generated `fonts.js` |
| `tools/build-fonts.py` | Builds `fonts/fonts.js` from `fonts/*.woff2` |

---

## 🤝 Contributing

Contributions are welcome! Open an *issue* with your idea or send a *pull request*.

To keep the spirit of the project:

- **No external dependencies** and no build step: it must keep working with a double-click.
- **No network connections**: no analytics, CDN, web fonts loaded from the web or APIs (the fonts are bundled).
- Customizable things belong in `config.js`. New UI text goes in `i18n.js`, in both languages.

---

## 🙏 Credits

Diagramon is inspired by [**archify**](https://github.com/tt-a1i/archify) by [@tt-a1i](https://github.com/tt-a1i),
an agent skill that turns ideas, plans and codebases into interactive diagrams (MIT license).
Thank you for the inspiration. 💜

---

## 📄 License

Diagramon's code is **open source** under the [MIT license](LICENSE): use it, change it and share it freely,
including in commercial projects.

The bundled fonts are [Inter](https://github.com/rsms/inter), [IBM Plex Sans](https://github.com/IBM/plex) and [Fira Code](https://github.com/tonsky/FiraCode), under the SIL Open Font License 1.1
(copies in [`fonts/OFL-Inter.txt`](fonts/OFL-Inter.txt), [`fonts/OFL-IBMPlexSans.txt`](fonts/OFL-IBMPlexSans.txt) and [`fonts/OFL-FiraCode.txt`](fonts/OFL-FiraCode.txt)).

The **official icons** in `icons/` belong to Amazon Web Services, Microsoft, Google and SAP, and are **not** covered by the MIT license.
AWS, Microsoft and Google allow their use in architecture diagrams under their own terms.
SAP BTP icons come from [SAP/btp-solution-diagrams](https://github.com/SAP/btp-solution-diagrams)
under the Apache 2.0 license (copy in [`icons/LICENSE-SAP.txt`](icons/LICENSE-SAP.txt)).
Microsoft Fabric icons come from Microsoft's official `@fabric-msft/svg-icons` package, under the MIT license
(copy in [`icons/LICENSE-FABRIC.txt`](icons/LICENSE-FABRIC.txt)), and follow the same usage rules as Azure icons.
SAP only publishes icons for its BTP services. Its business applications (S/4HANA, ECC, TM, EWM…) have no official icon:
SAP's guidelines draw them as named boxes, and Diagramon does the same with its own generic icon.
Diagramon shows the icons unchanged: do not crop, rotate or distort them, and do not use them to represent your own product.
AWS, Azure, Microsoft Fabric, Google Cloud and SAP are trademarks of their respective owners. Diagramon is not affiliated with any of them.

<div align="center">
<sub>Made with 💜 and pastel colors. Your diagrams, on your machine.</sub>
</div>
