[← Diagramon](../README.md) · **English** · [Español](text-format.es.md)

# ⌨️ Diagram as code (*Text* tab)

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
| `id: name="Store [legacy]" [db]` | Node whose name contains quotes, brackets, braces or `key=value` (Spanish: `nombre="…"`); written automatically when needed |
| `color=… badge=… desc="…"` | Node options |
| `cost=120/month` · `0.1/hour` · `1400/year` · `5000/3years` | Cost in USD (no period = monthly) |
| `sla=99.95` · `rpo=15m` · `rto=4h` · `replicas=2` | Availability target in % (also `99.95%` or `99,95`), recovery point and time objectives (`s`, `m`, `h`, `d`) and parallel instances; Spanish: `réplicas=` |
| `data=pii,pci` | Data classification of a node or a connection |
| `owner="Ana Pérez" steward=… team="Data Eng" costcenter=CC-100` | Ownership of a node or group (Spanish: `dueño=` `responsable=` `equipo=` `centro=`); nodes inherit from their group |
| `a -> b : TLS encrypted=yes` | Encryption in transit (`yes` or `no`) |
| `a -> b : SQL datasets=orders,customers` | Datasets carried by a connection (Spanish: `tablas=`); quote names with spaces: `datasets="sales orders,crm.customers"` |
| `region=eu-west-1` | Region of a node or a group (aliases `country=`, `país=`, `región=`); nodes inherit it from their group |
| `a -> b : x data=pii transfer=ok` | Cross-border transfer approved (`transferencia=ok` in Spanish) |
| `a -> b : SQL threats="T=mitigated,I=accepted"` | STRIDE decisions of a connection (Spanish: `amenazas=`); letters `S T R I D E`, statuses `mitigated`, `accepted`, `na` (Spanish `mitigada`, `aceptada`, `na`) |
| `threat api -> db T: "TLS 1.3 everywhere"` | Note on a decided STRIDE threat (Spanish: `amenaza`); the connection is found by `from -> to` (any arrow); if several connections share them, `#2` picks the second: `threat api -> db #2 T: "…"`. The threat must already have a status (`threats=…`), otherwise it is an error |
| `note n1: "Text\nmore" at=120,40 size=180,110 color=limon` | Sticky note (Spanish: `nota n1: "…" en=120,40 tamaño=180,110`); `\n` is a line break; position and size are optional (without `at=` it is placed to the right of its level) |
| `zone z1: "PCI scope" severity=high at=… size=… desc="…"` | Risk zone (Spanish: `zona`, `severidad=alta`; severities `low`, `medium`, `high`, `critical` · `baja`, `media`, `alta`, `crítica`) |
| `trust t1: "DMZ" trust=internet at=… size=… desc="…"` | Trust boundary (Spanish: `confianza t1: "DMZ" confianza=internet …`) |
| `dismiss sec:public-db:db: "Accepted risk" by="Ana" date=2026-10-01` | Dismissed finding (Spanish: `descartar … por=… fecha=…`). The id may contain `:` (the separator is the first `:` followed by a space) or be quoted: `dismiss "sec:x:y": "reason"` |
| `group id "Name" color=… { … }` | Group; groups can be nested |
| `in=shop` (Spanish: `dentro=shop`) · `c4=container` | C4 levels: the node or group lives in the internal diagram of `shop`; C4 type `person`, `system`, `container`, `component` or `external` (Spanish: `persona`, `sistema`, `contenedor`, `componente`, `externo`). Nodes inside the braces of a group with `in=` inherit its level |
| `inside shop { … }` | C4 level block (Spanish: `dentro tienda { … }`): everything declared inside (nodes, groups, notes, zones) lives in the internal diagram of `shop`, without writing `in=` on each. Blocks nest (`inside api { … }` inside `inside shop { … }` requires `api` to be a node of `shop`); groups work inside a block, but a block cannot be opened inside a group. `in=` still works |
| `layer=gold` (`bronze`, `silver`, `gold`; also `raw`, `curated`, `serving`) | Data lake layer of a node or group (Spanish: `capa=oro`); nodes inherit it from their group |
| `layers: zones` | Show Raw / Curated / Serving instead of Bronze / Silver / Gold (Spanish: `capas: zonas`) |
| `exposure=public` (`internal`) · `backup=yes` (`no`) | Override the deduced exposure and backup of a node (Spanish: `exposición=pública` / `interna`, `respaldo=sí` / `no`) |
| `controls="iso27001:A.8.24=met,pcidss:4.2=gap"` | Compliance controls of a node or group (Spanish: `controles=`, states `cumple` `parcial` `brecha` `na`); each is `framework:id=met\|partial\|gap\|na`; nodes inherit from their group |
| `a -> b` · `a => b` · `a ~> b` · `a ..> b` | Request · data · event · optional |
| `a -> b : nightly copy style=replication` | Connection type without an arrow of its own (Spanish: `estilo=replicación`): `replication`, `batch` (`lotes`), `stream` (`streaming`), `control`; also `sync`, `async`, `data`, `optional` and your own types. `style=` wins over the arrow; the Text tab writes `->` plus `style=…` for these |
| `a -> b : orders weight=high` · `weight=critical` | Importance of a connection (Spanish: `peso=alto` / `peso=crítico`; alias `important` / `importante`; `normal` is the default and is not written). Thicker line, bigger arrowhead, more dots |
| `type backup: "Backup traffic" dash="6 3" color=sky width=2 particles=1` | Your own connection type for this diagram (Spanish: `tipo backup: "…" trazo=… ancho=… partículas=…`). `id`: `a-z`, `0-9`, `-` (up to 32, not a built-in name); `dash`: 1-6 numbers (`"12 4 2 4"`, empty = solid); `color`: palette key or hex; `width` 1-4; `particles` 0-4. Use it with `a -> b : x style=backup` |
| `a -> b -> c : label` | Chain; the label goes on the last arrow |
| `lines: elbow` · `a -> b : x line=curved` | Elbow or curved lines, for the diagram or one connection |
| `author: …` · `version: …` | Shown in the export's title block |
| `review db: "DB in a public subnet" by=Ana raised=2026-10-01 due=2026-11-15` | Review finding (`status=resolved closed=…` when fixed) |
| `# …` or `// …` | Comment |

Keywords work in English and Spanish (`title`/`título`, `group`/`grupo`, `cost`/`costo`, `/month`/`/mes`…).
The text is the source of truth for notes, zones, trust boundaries, STRIDE notes, dismissed findings and architecture decisions (ADR): deleting them from the text deletes them from the diagram. Versions are kept.
### Architecture decisions (ADR)

An `adr` line starts a decision; the fields follow on the next lines, each with its text in quotes (`\n` = line break). Decisions are written at the end of the text.

```
adr ADR-001: "Split the shop into a web front end and an API" status=accepted date=2026-06-02 deciders="Architecture board" links=shop,api,shop->api,version:v1
  context: "The monolith couples UI releases to backend releases.\nIt cannot scale them separately."
  decision: "Serve the React front end from CloudFront and expose a stateless API."
  consequences: "Independent deploys; we now need API versioning."
  history: proposed 2026-05-20 by="Ana" note="First draft"; accepted 2026-06-02
adr ADR-002: "Process fulfilment with a queue" status=superseded superseded-by=ADR-003
```

- Header keys (Spanish in brackets): `status=` (`estado=`) with `proposed`, `accepted`, `rejected`, `deprecated` or `superseded` (`propuesta`, `aceptada`, `rechazada`, `obsoleta`, `reemplazada`); `date=` (`fecha=`); `deciders=` (`decisores=`); `links=` (`enlaces=`); `superseded-by=` (`reemplazada-por=`, the id of the newer decision).
- `links=` is a comma-separated list of component ids, group ids, connections written `source->target` (add `#2` to pick the second of several identical connections) and versions written `version:<id>`.
- Fields: `context:`, `decision:`, `consequences:` (Spanish: `contexto:`, `decisión:`, `consecuencias:`) and `history:` (`historial:`): status changes oldest first, `status YYYY-MM-DD by="…" note="…"` separated by `;`.
- A field only counts right after its `adr` line (or another field); any other line closes the decision. Deleting an `adr` block from the text deletes the decision. Versions are not in the text: `version:<id>` links are kept only for versions that already exist.

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
  "edges":  [ { "from": "api", "to": "db", "label": "SQL", "style": "sync | async | data | optional | replication | batch | stream | control | <custom id>", "weight": "high | critical", "color": "rosa" } ],
  "edgeTypes": [ { "id": "backup", "label": "Backup traffic", "dash": "6 3", "color": "sky", "width": 2, "particles": 1 } ]
}
```

- Nodes only need `id` and `type`. Without `x`/`y` they are placed automatically.
- `costPeriod`: `hour`, `year` or `multi` (with `costYears`). Without `costPeriod` the cost is monthly.
- `weight` (`high` or `critical`; omitted = normal) is the importance of an edge. `edgeTypes` (optional) are the diagram's own connection types: `id` (`a-z0-9-`, up to 32), `label` (up to 60), and optional `dash` (numbers separated by spaces), `color` (palette key or hex), `width` (1-4) and `particles` (0-4); an edge uses one with `"style": "<id>"`.
- `routing: "elbow"` sets elbow lines for the diagram; `route` (`curved` or `elbow`) overrides it on one edge. `meta` holds `author` and `version`.
- `review` on a node: `{ "status": "open" | "resolved", "note", "by", "raised", "due", "closed" }`, dates as `YYYY-MM-DD`.
- `owner`, `steward`, `team` and `costCenter` (strings) on nodes and groups; a node without one inherits it from the nearest group that has it.
- `data` is a list of data classes (`["pii", "pci"]`) on nodes and edges. `encrypted` (`true` or `false`) is the encryption in transit of an edge.
- Exported files also carry `versions` (each with `kind`: `version` or `env`, and its own `diagram`) and `active`.
- `color` takes a palette key (`rosa`, `coral`, `melocoton`, `limon`, `menta`, `cielo`, `lavanda`, `lila`),
  its English name (`pink`, `coral`, `peach`, `lemon`, `mint`, `sky`, `lavender`, `lilac`) or any CSS color.

</details>
