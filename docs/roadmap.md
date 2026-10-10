[← Diagramon](../README.md) · **English** · [Español](roadmap.es.md)

# 🛣️ Ideas and possible improvements

Larger changes that would be useful but touch many parts of the code. They are open for contributors: if you want to take one, open an issue first so we can agree on the approach.

## Connections between groups

**The need.** Sometimes the arrow should not come from one service but from a *set of possible services*. For example, an ETL step could be done with Glue, Lambda, EC2 or EMR: you would draw an **ETL** group with those options and point it at another group or at an S3 bucket.

**Today (workaround).** Use a **generic component** that names the options, for example a *Generic* node called «ETL» with the detail «Glue / Lambda / EC2 / EMR», and connect it like any other component. It keeps every analysis working, but it loses the official icons of each option. You can also keep the options inside a group next to it, as documentation, and connect only the generic component.

**Proposed design.**

- A connection could start or end at a group as well as at a component: `from` / `to` would accept a group id. The arrow would leave or enter the group's border. It would keep everything a connection has today: style, weight, label, data classes, datasets, encryption and STRIDE decisions.
- In the *Text* tab `etl -> s3raw` would already parse, because groups have ids (the parser must resolve group ids as endpoints).
- **Meaning:** a connection from a group means «any of its members may do this». Each analysis interprets it like this:
  - **Security review, data residency, STRIDE:** expand the connection to every member of the group. This is the conservative choice: a warning appears for all of them.
  - **Lineage and node-to-node path:** the group acts as one pass-through node.
  - **Composite availability:** the group's members count as alternative routes in parallel. The `routeReliability` function already handles alternatives.
  - **Context view:** connections to an inner group become connections to its closed top-level box.
  - **C4 levels:** a group lives on one level (`in`), so the same rules as node endpoints apply (crossing connections become ghosts).
  - **Exports:** Mermaid (links to a `subgraph` id), PlantUML (arrows to a container alias) and draw.io (edges to a container cell) all support it.

**Why it is risky.** Almost every part of `src/app.js` assumes that both ends of a connection are components. These blocks would need changes:

| Area | Where (block header in `src/app.js` unless noted) |
|---|---|
| Model cleanup, JSON order, version diff | `sanitize` / `normalize`, `ORDER`, `DIFF_FIELDS` |
| Drawing, arrowheads, labels | «dibujo» |
| Elbow connectors that avoid nodes | «conectores en ángulo recto que esquivan los nodos» |
| Particles | «partículas (bucle de animación)» |
| Path between components, lineage | «camino entre dos componentes», «linaje de datos» |
| Availability and single points of failure | «disponibilidad (SLA), RPO/RTO, réplicas y puntos únicos de fallo» |
| Security review, residency, STRIDE | «revisión de seguridad automática», «residencia y soberanía de datos», «STRIDE: fronteras de confianza…» |
| Context view and C4 ghosts | «vista Contexto…», «niveles C4: abrir, salir, marco de límite y fantasmas del exterior» |
| Inspector, connect mode, delete/duplicate | inspector blocks, «acciones», «interacción con el lienzo» |
| Text tab | `src/text-lang.js` (parse + stringify) |
| Exports | `src/export/mermaid.js`, `plantuml.js`, `drawio.js`, and the inventory (`inventoryRows` / connections sheet) |

Deleting a group would also have to delete or re-attach its connections, and undo must restore both.

**Suggested plan for a contributor.** Do it in small pull requests:

1. Model and drawing only. Add group endpoints with a «not analysed yet» note in the inspector.
2. Path, lineage and availability.
3. Security, residency and STRIDE expansion.
4. Context view and C4.
5. Text tab and exports.

Each step must keep existing diagrams byte-identical when they have no group endpoints.

## Split `src/app.js` into modules

**Status: open for contributors.** The current maintainers do not plan to do it themselves.

**The need.** `src/app.js` has grown to about 8,000 lines in a single closure, organized in about 80 blocks marked with `/* ---------- … ---------- */` headers. It works, but it is hard to navigate, review and change in parallel, and most helpers cannot be tested on their own. (`tests/run.js` reaches only the few that are pure, by cutting them out of the file.)

**Constraints that must stay.**

- **No build step and no dependencies:** Diagramon must keep opening with a double-click on `index.html`, from disk (`file://`).
- **The Content Security Policy stays strict** (`script-src 'self'`).
- **Every existing feature, export and the encrypted viewer keep working byte-for-byte**, and `tests/run.js` keeps passing.

**Possible approach.**

- Keep classic `<script>` files: ES modules (`type="module"`) do not load from `file://` in every browser.
- Split by the existing block headers into files under `src/` that share one namespace object (for example `window.DiagramonApp`): model and sanitizing, drawing, routing, views, analyses (security, residency, STRIDE, availability, costs, compliance, lineage), inspector, versions, exports, report, and canvas interaction.
- Move the pure functions first (model cleaning, diff, availability, cost breakdown, inventory rows), so that `tests/run.js` can load them directly and cover more.
- Do it step by step, one area per pull request, with no behavior change. The browser check and the automated tests must pass after each step.

**Why it is risky.** The blocks share a lot of state through closures: `S`, `R`, `VW`, `C`, `T` and many small helpers. A careless split can break features that are rarely exercised, such as the encrypted viewer, the report or C4 ghosts.

## Custom rules written by the user

**Status: not planned for now.** Most of the people who use Diagramon work with small teams, where the built-in Review rules are enough.

**The need.** A team may want its own checks, for example «every database has an owner and a backup» or «nothing tagged *pci* may sit in a public group», without waiting for a new built-in rule.

**Today (workaround).** The built-in rules are switched on or off and given a severity in `src/config.js` (blocks `rules`, `sec.*`, and so on). To add a new kind of check you have to write code in `src/app.js` and register it with `addFindingSource`.

**Proposed design.** A small declarative list of rules stored in the diagram (or in the workspace manifest to share them): *what to look at* (components, connections or groups, filtered by type, tag or field), *the condition* (a field is missing, equals or is not one of some values) and *the message and severity*. They would run as one more Review source (`custom`). No scripting: only data, so a rule cannot run code from an imported file.

**Why not now.** It adds a rule language to document, validate and keep stable, and a way to get it wrong that is hard to debug. The built-in rules already cover the usual cases, and `addFindingSource` is a short path for a contributor who needs one more.

## Verifiable signatures on approvals

**Status: not planned for now.**

**The need.** Where an approval has legal or audit weight, someone may need to prove *who* approved *which exact version*, and that it was not changed afterwards.

**Today (workaround).** An approval records the stakeholder, the verdict, a date and a note. Anyone who can edit the file could type any name, so the record is a convenience for a small team that already trusts each other, not proof. If you need proof, keep the exported file in a system that signs or timestamps documents (a signed commit, a document-signing service).

**Proposed design.** Sign the approved snapshot (the version, as it is serialized) with a key the approver controls, using the browser's Web Crypto (for example ECDSA P-256): the approval stores the public key, the signature and the hash of the snapshot. Viewing the version would verify it and show *signature valid* or *the version changed after it was signed*. Key storage and who may sign would be settings in the workspace manifest.

**Why not now.** The hard part is not the cryptography but trust: how an approver gets a key, how it is tied to a person, what happens when it is lost. Without that, a signature looks stronger than it is. With small clients it is easier to check directly that the person who approved is the person who says so.

## ArchiMate export

**Status: not planned for now.**

**The need.** Enterprise architecture teams that model in ArchiMate tools (Archi and others) would like to start from a Diagramon diagram instead of redrawing it.

**Today (workaround).** Export to draw.io, Mermaid or PlantUML, or to Excel (the inventory), and rebuild the model in the other tool.

**Proposed design.** An exporter in `src/export/` that writes the ArchiMate *Open Exchange File Format* (XML): components become application or technology elements depending on their type, connections become flow or serving relationships, groups become grouping elements, and the layers (business, application, technology) follow the `layer` field when it is set. Importing is a separate, larger step and is not part of this idea.

**Why not now.** The mapping from Diagramon's types to ArchiMate's strict element and relationship rules needs decisions that only someone who uses ArchiMate daily can make well, and an incorrect mapping produces models that tools reject or that mislead.

## Structurizr export and import

**Status: not planned for now.**

**The need.** Teams that describe their architecture as code with the C4 model in Structurizr would like to move between that text and a Diagramon diagram.

**Today (workaround).** Diagramon already has C4 levels (`in` on components and groups) and its Mermaid, PlantUML and draw.io exports keep the C4 nesting as containers. The *Text* tab is a plain text description of the whole diagram.

**Proposed design.** An exporter that writes a Structurizr DSL workspace (people, software systems, containers and components from the C4 levels, relationships with their labels). An importer for the same subset would come second, keeping only what Diagramon can represent and listing what it dropped.

**Why not now.** The DSL is a full language (views, styles, includes, scripts). A partial importer that silently ignores parts of it would be worse than none, and the export alone has little to offer people who do not already use Structurizr.

## Backstage catalog export

**Status: not planned for now.**

**The need.** Teams with a Backstage developer portal want their components, owners and dependencies from a Diagramon diagram in the catalog, without typing them twice.

**Today (workaround).** The inventory (Excel or CSV) lists every component with its owner, team and layer; it can be turned into `catalog-info.yaml` files with a short script.

**Proposed design.** An exporter that writes one `catalog-info.yaml` document per component (`kind: Component` or `Resource` depending on the type), with `spec.owner` from the owner or team field, `spec.system` from the group, and `dependsOn` from the connections. Fields Backstage requires and Diagramon does not have (such as `lifecycle`) would get a visible default.

**Why not now.** Backstage catalogs have local conventions (owner names, system names, annotations) that must match the portal. Without knowing them the export would need editing anyway, and the people who need it are in teams larger than the ones Diagramon is aimed at.

## Merge two edited copies of a diagram

**Status: not planned for now.**

**The need.** Two people edit the same diagram at the same time and later need to combine their work.

**Today (workaround).** Save a version before sharing (see *Versions*), then compare the two files with the version comparison and copy the changes by hand. In a workspace folder, keep one person responsible for each diagram.

**Proposed design.** A three-way merge by element id: take the common ancestor (a saved version both started from) and the two copies, apply changes that touch different elements automatically and ask for a decision where both changed the same field of the same element. The comparison already knows which fields matter (`DIFF_FIELDS`), so it can be the base. Positions (`x`, `y`) would be taken from whichever side moved the element.

**Why not now.** A wrong merge silently loses someone's work, so it needs a careful conflict screen and many tests. For one or two authors per diagram, the version comparison plus a short conversation is enough.
