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
| `a -> b : x latency=1h` | Time the data takes on that connection, e.g. `15m`, `1h`, `1d` (Spanish: `latencia=`); it feeds the end-to-end freshness of the datasets it carries |
| `region=eu-west-1` | Region of a node or a group (aliases `country=`, `país=`, `región=`); nodes inherit it from their group |
| `dataset DS-001 orders: layer=silver freshness=1d …` | Dataset of the catalog (Spanish: `conjunto`), with its `column`, `rule` and `contract` lines; see *Datasets* below |
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
| `phase mvp: "MVP" date=2026-12 goal="…"` | Phase of the plan, in timeline order (Spanish: `fase mvp: "MVP" fecha=2026-12 objetivo="…"`); see *Phases* below |
| `a: A phase=mvp until=wave2` · `a -> b : x phase=wave1` · `group g "G" phase=mvp {` | Phase in which a node, connection or group appears (Spanish: `fase=`) and, if temporary, the phase in which it is retired (`until=`, Spanish `hasta=`) |
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
The text is the source of truth for notes, zones, trust boundaries, STRIDE notes, dismissed findings, phases, architecture decisions (ADR), requirements and the RAID log: deleting them from the text deletes them from the diagram. Versions are kept.
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
- `signoffs:` (Spanish `firmas:`) lists the sign-offs of the decision, oldest first: `SH-001 approve 2026-10-08 note="…"` separated by `;` (Spanish `SH-001 aprueba 2026-10-08 nota="…"`; `reject` is `rechaza`). Every id must be a stakeholder of the diagram, otherwise the line number is reported. See *Stakeholders (RACI)* below.
- Options and criteria (all optional) go in the same field lines. Add `area="Storage"` (`área=`) to the `adr` line, then:

```
adr ADR-003: "Open table format" status=proposed area="Storage"
  criterion cost: "Cost" weight=3
  criterion skills: "Team skills" weight=4
  option A: "Delta Lake" chosen cost=0 risk=low version=v2 scores=cost:4,skills:5 summary="Most mature ecosystem." pros="• Wide tooling\n• Familiar to the team" cons="• Needs maintenance jobs"
  option B: "Iceberg" scores=cost:3,skills:2
```

  `criterion <id>: "Label" weight=1..5` (Spanish `criterio … peso=`; id `a-z 0-9 -`, up to 30 characters). `option <id>: "Title"` (`opción`; id letters, digits and `-`, up to 20) with the optional bare word `chosen` (`elegida`; only one option per decision), `cost=` monthly number (`costo=`), `risk=low|medium|high` (`riesgo=bajo|medio|alto`), `version=<id of a saved version>` (`versión=`; dropped if it does not exist), `scores=criterion:1..5,…` (`puntos=`; only criteria declared in the same decision) and quoted `summary=`, `pros=`, `cons=` (`resumen=`, `contras=`). Both languages are accepted when reading; the text is written in the active language. Errors report the line number.
- A field only counts right after its `adr` line (or another field); any other line closes the decision. Deleting an `adr` block from the text deletes the decision. Versions are not in the text: `version:<id>` links are kept only for versions that already exist.

### Requirements

A `req` line records one requirement; its optional detail follows on the next line. Requirements are written after the decisions.

```
req REQ-001: "Personal data stays in the EU" kind=constraint priority=must status=agreed source="CISO" check=residency cls=pii jur=eu links=ADR-005,raw,raw->bi
  detail: "No copy of personal data may be stored or processed outside the EU."
req REQ-002: "Serving layer available 99.9%" kind=nfr priority=should status=draft check=availability from=gold to=bi target=99.9 links=ADR-012,sqlwh
```

- Header keys (Spanish in brackets): `kind=` (`tipo=`) with `driver`, `nfr`, `constraint` or `principle` (`impulsor`, `rnf`, `restricción`, `principio`); `priority=` (`prioridad=`) with `must`, `should` or `could` (`debe`, `debería`, `podría`); `status=` (`estado=`) with `draft`, `agreed` or `dropped` (`borrador`, `acordado`, `descartado`); `source=` (`fuente=`, who asked for it, up to 120 characters). Without `kind=` the requirement is a `driver`; without `status=`, a `draft`.
- `links=` (`enlaces=`) is a comma-separated list of decision ids, component ids, group ids and connections written `source->target` (`#2` picks the second of several identical connections).
- `check=` (`control=`) attaches a check that the app evaluates with what it already computes; it only runs for `agreed` requirements. The metric decides which parameters apply:

| `check=` (Spanish) | Parameters | Passes when |
|---|---|---|
| `availability` (`disponibilidad`) | `from=` `to=` (`desde=` `hasta=`) component ids, `target=` (`objetivo=`) percent, e.g. `99.9` | composite availability of the route is at least the target |
| `rpo`, `rto` | `from=` `to=`, `target=` hours | the worst RPO / RTO on the route is at most the target |
| `cost` (`costo`) | `target=` monthly cost in the app currency | the total monthly cost is at most the target |
| `encryption` (`cifrado`) | `cls=` (`clase=`) data class id, e.g. `pii` | every connection carrying that class is marked encrypted |
| `residency` (`residencia`) | `cls=`, `jur=` (`jurisdicción=`) jurisdiction id, e.g. `eu` | no unapproved cross-border connection carries that class out of that jurisdiction |
| `freshness` (`frescura`) | `ds=` (`conjunto=`) dataset name, `target=` hours, e.g. `4` | the end-to-end freshness of the dataset (sum of the latencies on its slowest path) is at most the target |

- The field line is `detail:` (`detalle:`) and counts only right after its `req` line. Both languages are accepted when reading; the text is written in the active language, so it round-trips exactly. Parameters without `check=`, unknown values, a `from=` / `to=` that is not a component and links to things that do not exist are reported with their line number. Deleting a `req` block from the text deletes the requirement.

### RAID log (risks, assumptions, issues, dependencies)

One line per item, written after the decisions and requirements. The first word is the type and the id starts with its letter: `R-` risk, `A-` assumption, `I-` issue, `D-` dependency. Text fields go on the next lines, in quotes (`\n` = line break).

```
risk R-001: "SAP CDC licence not available" p=3 i=4 owner="PMO" status=open raised=2026-10-07 links=ADR-007,erp
  mitigation: "Ask the vendor for a quote now."
  detail: "Vendors often charge extra for log-based CDC."
assumption A-001: "Volume <= 2 TB/day" validation=pending due=2026-11-15 owner="Data owner" links=ADR-002,REQ-003
  history: validated 2026-11-02 by="Ana" note="Checked with finance"; invalidated 2026-12-01
issue I-001: "No access to the ERP test system" status=open due=2026-11-01
dependency D-001: "Network team opens the private link" status=open due=2026-11-30 links=ADR-014,iam
```

- Keys (Spanish in brackets): `p=` probability and `i=` impact, 1 to 5, risks only; `owner=` (`dueño=`); `status=open|closed` (`estado=abierto|cerrado`) for risks, issues and dependencies; `validation=pending|validated|invalidated` (`validación=pendiente|validado|invalidado`) for assumptions; `due=` (`fecha=`, validate by / needed by, not for risks); `raised=` (`registrado=`); `links=` (`enlaces=`).
- Type words: `risk`, `assumption`, `issue`, `dependency` (Spanish `riesgo`, `supuesto`, `problema`, `dependencia`).
- `links=` is a comma-separated list of decision ids (`ADR-001`), requirement ids (`REQ-001`), component ids, group ids and connections written `source->target` (add `#2` for the second of several identical ones). Links to things that do not exist are errors, except requirement ids, which are checked when the diagram loads.
- Fields: `detail:` (`detalle:`), `mitigation:` (`mitigación:`, risks) and `history:` (`historial:`, assumptions): validation changes oldest first, `validated|invalidated|pending YYYY-MM-DD by="…" note="…"` separated by `;` (Spanish `validado`, `invalidado`, `pendiente`, `por=`, `nota=`).
- A field only counts right after its item line (or another field). Both languages are accepted when reading; the text is written in the active language. Deleting an item's lines deletes the item.

A node that only appears in a connection is created for you. Errors are shown in red with their line number.
The text does not store positions: existing nodes stay where they are, and new nodes are placed next to their neighbors.

### Stakeholders (RACI)

One `stakeholder` line per person, written after the RAID log. The id is `SH-` and a number; the name is quoted.

```
stakeholder SH-001: "Ana Pérez" role="CISO" org=client raci=*:C,Security:A,Platform:R versions
stakeholder SH-002: "Luis Gómez" role="Data owner" org=partner raci=Consumption:A,*:I inactive
```

- Keys (Spanish in brackets): `role=` (`rol=`); `org=` with `client`, `partner` or `internal` (`cliente`, `socio`, `interno`); `raci=` is a comma-separated list of `area:letter`, with `R` (responsible), `A` (accountable: approves), `C` (consulted) or `I` (informed). `*` means every area. Areas are decision areas and cannot contain commas.
- Bare words: `versions` (`versiones`) makes the stakeholder an approver of versions; `inactive` (`inactivo`) marks someone who left the project: never required, history kept.
- Both languages are accepted when reading; the text is written in the active language (`interesado … rol= org=cliente raci= versiones inactivo`). A duplicate id, an invalid id or org, or an invalid RACI letter is an error with its line number. Deleting a `stakeholder` line deletes the stakeholder and its RACI row.

### Phases

`phase` lines describe the build in steps. Write them before the nodes, in timeline order (the first line is the first phase). Each has an id, a quoted name and, optionally, a date and a goal:

```
phase mvp: "MVP" date=2026-12 goal="Batch ingestion of ERP and CRM files, first BI"
phase wave1: "Wave 1" date=2027-03 goal="Change data capture and the gold layer"
phase wave2: "Wave 2" date=2027-06

erp: ERP [db]
crm: CRM [db]
upload: Manual file upload phase=mvp until=wave1
cdc: CDC replication phase=wave1
stream: Event stream phase=wave2
erp -> cdc : changes phase=wave1
erp -> upload : extract phase=mvp
```

- Keys (Spanish in brackets): `date=` (`fecha=`), `YYYY-MM` or `YYYY-MM-DD`; `goal=` (`objetivo=`), free text in quotes. Up to 12 phases; ids are letters, digits, `-` and `_` (up to 30 characters).
- Nodes, connections and groups take `phase=<id>` (`fase=`): the phase in which they appear. Without it they are there from the first phase. `until=<id>` (`hasta=`) is the phase from which they are no longer there (a temporary component). `until` must come after `phase` in the order (after the first phase when there is no `phase`).
- An unknown phase id, or an `until` that does not come after its phase, is an error with its line number. Deleting a `phase` line while elements still use it is an error too: change or delete those references first.
- Both languages are accepted when reading; the text is written in the active language (`fase mvp: "MVP" fecha=2026-12 objetivo="…"` and `fase=wave1 hasta=wave2`), so it round-trips exactly.

### Datasets

`dataset` lines declare the datasets of the data catalog. Write them after the stakeholders. A name on a connection (`datasets=`) joins with the dataset of the same name (case-insensitive), and a name that is only used on connections is *undocumented* until it is declared. Each dataset line is followed by indented field lines: `column`, `rule` and `contract`, which must come right below a `dataset` line.

```
phase wave1: "Wave 1" date=2027-03

erp: ERP [db]
lake: Lakehouse [storage] layer=silver
bi: BI dashboards [user]

dataset DS-001 orders: layer=silver domain=Sales owner="Data platform" product=yes classes=pii format=delta freshness=2d per_day=2 retention=365 steward="Ana Pérez" desc="Orders from the ERP"
  column order_id: string key nullable=no
  column email: string pii desc="Customer e-mail"
  column amount: decimal
  rule not_null order_id severity=high
  rule range amount param="0..1000000"
  contract 1.0.0 status=agreed consumers=bi terms="Daily by 06:00"
dataset DS-002 customers: layer=silver classes=pii phase=wave1
  column customer_id: string key
  rule unique customer_id severity=high
  contract 0.1.0 status=draft

erp -> lake : nightly load datasets=orders,customers latency=1d
lake -> bi : JDBC datasets=orders latency=15m
```

- **Dataset line**: `dataset DS-001 orders: …`, the id is `DS-` and a number (unique), the name is the key that joins with `datasets=` (quote it if it has spaces or `:`). Keys (Spanish in brackets): `layer=` (`capa=`) `bronze`, `silver` or `gold` (also `raw`, `curated`, `serving` and `bronce`, `plata`, `oro`); `domain=` (`dominio=`); `owner=` (`dueño=`), a stakeholder id or free text; `steward=` (`responsable=`); `product=yes` (`producto=sí`) marks a data product; `classes=` (`clases=`) data classes, e.g. `pii`; `format=` (`formato=`) `delta`, `iceberg`, `hudi`, `parquet`, `avro`, `json`, `csv` or `other`; `freshness=` (`frescura=`) the SLA, as `15m`, `4h` or `1d`; `per_day=` (`por_dia=`) the volume in GB per day; `retention=` (`retencion=`) the retention in days; `phase=` (`fase=`) the phase from which the dataset exists; `desc=` the description.
- **Column line**: `column <name> <type> key pii nullable=no desc="…"` (Spanish `columna … clave pii nulo=no desc=`). `key` (`clave`) marks a primary key and `pii` a personal-data column; the type may have spaces if it is quoted.
- **Rule line**: `rule <rule> <column> param="…" severity=low|medium|high` (Spanish `regla … severidad=baja|media|alta`). The rules are `not_null`, `unique`, `range`, `regex`, `accepted_values`, `freshness` and `custom`; the column and `param=` are optional.
- **Contract line**: `contract <version> status=draft|agreed|deprecated consumers=<component ids> terms="…"` (Spanish `contrato … estado=borrador|acordado|obsoleto consumidores= terminos=`). Consumers are component ids, separated by commas.
- **Latency** goes on a connection: `a -> b : carga latency=1h` (Spanish `latencia=1h`), the time the data takes on that hop. See the *Data catalog and data contracts* section of the guide for how freshness is computed.
- An unknown layer, data class, phase, rule, severity, status, format or duration, an invalid or repeated dataset id, a name used twice, a consumer that is not a component, and a field line that is not right below a dataset are errors, reported with their line number. Deleting the `dataset` lines deletes the datasets.

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
- `datasets` (optional, only written when there are any) lists the catalog: `id`, `name` and, optionally, `domain`, `layer`, `owner`, `steward`, `product`, `classes`, `format`, `freshness`, `volume` (`perDay`, `retentionDays`), `schema`, `quality`, `contract` (`version`, `status`, `consumers`, `terms`) and `phase`. An edge with `latency` (`"1h"`) is the time its data takes on that hop.
- `requirements` (optional, only written when there are any) lists the requirements: `id`, `title`, `kind`, `status` and, optionally, `detail`, `priority`, `source`, `check` (`{ metric, from, to, target, cls, jur }`) and `links` (`decisions`, `nodes`, `edges`, `groups`).
- Exported files also carry `versions` (each with `kind`: `version` or `env`, and its own `diagram`) and `active`.
- `color` takes a palette key (`rosa`, `coral`, `melocoton`, `limon`, `menta`, `cielo`, `lavanda`, `lila`),
  its English name (`pink`, `coral`, `peach`, `lemon`, `mint`, `sky`, `lavender`, `lilac`) or any CSS color.

</details>
