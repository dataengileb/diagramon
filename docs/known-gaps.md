[← Diagramon](../README.md) · **English** · [Español](known-gaps.es.md)

# 🧭 Known gaps

What Diagramon does not do yet, what has not been tried outside the browser, and what is limited on purpose. Reports and pull requests are welcome. Larger ideas live in the [roadmap](roadmap.md).

## 🧪 Needs testing outside the browser (help wanted)

These features work in the browser and their output was checked for structure, but nobody has tried them in the real target tool yet. If you can, please try them and open an issue with what you find.

- **Excel inventory (`.xlsx`)**: checked as a valid ZIP with well-formed XML parts, but not opened in Excel, Numbers or LibreOffice yet.
- **PlantUML export**: checked for structure only (balanced blocks, declared aliases), not rendered. The Mermaid and draw.io exports of the templates were rendered with their own renderers (Mermaid 11 and the draw.io viewer, group icons included).
- **IaC import for Azure and Google Cloud**: tested with the two hand-written `terraform show -json` samples in `samples/`, which follow the real azurerm and google schemas, not with the output of a live account. Unusual resource types may show as generic components.
- **Architecture report as PDF**: checked up to the browser print call. The full document, its 14 sections, images and tables load, `print()` is called, and tables fit an A4 page width. The print dialog itself and the final pagination have not been reviewed.
- **Lakehouse decision kit** (`src/adr-kits.js`): the options, pros and cons are written to be neutral and durable, but they have not been reviewed by specialists in each product. Check them against current vendor documentation before presenting them to a client.
- **Very small components** carrying every pill at once (layer, region, team, availability) have not been reviewed. With the default fixed node width they fit.
- **Workspace folders** (`src/workspace.js`): the listing logic is tested, and opening, saving and the read-only fallback were driven in headless Chromium with a simulated folder. Nobody has tried a real folder with a real folder picker yet, nor browsers other than Chromium (Firefox and Safari take the read-only path).

## 🔧 Not done yet (small improvements)

- **Mermaid, PlantUML and draw.io exports** cover the main cases, but complex diagrams may lose details or need fixes. The cost breakdown is not exported to them.

## 📐 Limits by design

These are deliberate choices, usually to keep Diagramon local, dependency-free and honest about what it can know.

- **Mermaid and PlantUML cannot overlap boxes.** Risk zones and trust boundaries become a colored border on the components inside them plus a list (comments in Mermaid, a note in PlantUML), and governance and security fields go into comments. draw.io keeps them as shapes and as *Edit Data* fields.
- **Availability is a model, not a measurement.**
  - Single points of failure come from the diagram topology only (articulation points of the undirected graph). Diagramon does not know about the internal redundancy of a load balancer or a managed service unless you set `replicas`.
  - Effective availability assumes independent instances (no shared failures, no failover time).
  - Composite availability combines every alternative route exactly. In very meshed diagrams (roughly more than 20 uncertain components in play) it shows a lower bound, marked as such, so the page never freezes.
- **The compliance catalog** is a practical subset of each standard with paraphrased titles. Check it before relying on it for an audit.
- **Cost scenarios** compare only the monthly-equivalent price of components, not edges or groups.
- **The Excel file is written by a minimal built-in writer** (a ZIP without compression), with no libraries. It is larger than one saved by Excel, and has no formulas (totals are not calculated in the file), no shared strings and no charts.
- **The report's printed layout belongs to the browser.**
  - Page headers and numbers appear only where the browser supports CSS `@page` margin boxes.
  - Markdown viewers that block `data:` images show nothing for the diagrams unless you save the images as separate files.
  - Large diagrams with many views and internal levels can take several seconds.
- **C4 levels**: ghost cards show at most 8 per side, and connections between two levels are only drawn as ghosts (reach them from the inspector links).
- **Workspace**: only the files directly inside the folder are read (no subfolders), up to 200 diagrams of at most 8 MB each. Saving into the folder needs a Chromium browser.
- **Data lineage across diagrams** matches datasets by name only and takes "produces" to mean "starts at a component nothing feeds with it". It does not follow a dataset through renamed copies, and a diagram without an id is left out.
- **Shared items** are copies, not live links: there is no automatic sync, and a change made in a diagram to a shared item does not go back unless you share it again. Items are matched by name or title only.
- **Links between diagrams** (`ref`) are not part of the version comparison and are not in the text format. They are kept when you edit the text. A component can point to a whole diagram, not yet to one of its components.
- **Region detection** from a group's name covers the usual AWS, Azure and Google Cloud codes. Other names need the **Region** field.
- Several CSV downloads in a row may trigger a «download multiple files» prompt in some browsers.
