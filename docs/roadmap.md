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
