[← Diagramon](../README.md) · **English** · [Español](customize.es.md)

# 🎨 Customize

Everything you can customize is in **`src/config.js`**. Save and reload `index.html`.

- **Default theme**: `app.defaultTheme: 'dark' | 'light' | 'black'`. The `T` key and the theme button cycle light → dark → black.
- **Default language**: `app.defaultLang: 'en' | 'es'`. UI texts live in `src/i18n.js`; texts in `src/config.js` and `src/examples.js` can be `{ en: '…', es: '…' }`.
- **Data classes**: `dataClasses` sets the tags (name, short label, color). `sensitive: true` turns on the red warning for unencrypted flows.
- **Jurisdictions (data residency)**: `residency.jurisdictions` in `src/config.js` is an ordered map `key → { label: { en, es }, short, match }`. `match` is a case-insensitive RegExp tested against the region text (`eu-west-1`, `westeurope`, `ES`…); the first jurisdiction that matches wins, so put specific ones (`uk`, `ch`) before wide ones (`eu`). To add one, copy a line and change its key, labels and `match`; to adjust one, edit its `match` (anchor it with `^…$`). `of` is the optional text used in the warning (*leaves **the EU***). Set `residency.warnSameJurisdiction: true` to also warn when regions differ inside the same jurisdiction.
- **STRIDE threat rules**: `stride` in `src/config.js` sets the thresholds and the text. `inboundSeverity` is the severity of *Spoofing* on inbound crossings, `criticalClasses` the data classes that make *Information disclosure* critical, `storeTypes` and `storeIconCategories` what counts as a data store, secrets or identity component for *Elevation of privilege*, and `categories` the label, description and mitigation hint (`{ en, es }`) of each letter. The rules are explained in a comment above it.
- **Data lake layers**: `dataLayers` sets the layers in order (`label` for the medallion names, `alt` for the Raw/Curated/Serving names, short letters and `color`). Colors default to `--layer-bronze`, `--layer-silver` and `--layer-gold`, set per theme in `index.html`; edit them there or put a fixed color in `src/config.js`. `layerAliases` lists the other words accepted when reading JSON and text. Each view's `layers` flag shows or hides them.
- **Migration disposition (6R)**: `migration.dispositions` lists the values in order, each with `label` (en/es), `alias` (more words accepted when reading JSON and text), `short` (the pill's initials), `color` and `hint`. Set `enabled: false` on one to remove it (a removed value is dropped when reading JSON and is an error in the Text tab); `relocate`, the seventh R, ships disabled. `migration.rules` turns the three Review warnings on or off and sets their `severity`: `mig.retire-no-until`, `mig.until-kept` (with the `keepers` list) and `mig.change-no-decision` (with `needsDecision`, off by default).
- **Effort estimation**: `estimation.roles` is the list of roles (`id` in lower case, `label` as `{ en, es }`, and `rate`, the price of one person-day in the currency of `cost.currency`). It ships empty: the *Effort* field of the inspector appears when you add roles. `estimation.hoursPerDay` (8) turns days into hours and `estimation.contingency` (0) is the default contingency in percent; a diagram can set its own with `"estimation": { "contingency": 15 }`. `estimation.rules` turns the two Review warnings on or off and sets their `severity`: `est.unestimated` (a phase where only some components have effort) and `est.no-rate` (a role with no rate).
- **Comments**: `comments.max`, `comments.maxReplies` and `comments.textMax` set the limits (500 threads, 50 replies per thread, 4000 characters). `comments.rules['cmt.open']` turns the Review notice for open threads on or off and sets its `severity`.
- **Tech radar**: `techRadar.entries` is the list of products (`id`, `name`, `match` with `icon`, `type` and/or `text`, `ring` of `adopt`, `trial`, `hold` or `retire`, and optional `eos` as `YYYY-MM` or `YYYY-MM-DD`, `replaceWith` and `note`; text accepts plain strings or `{ en, es }`). It ships empty with commented examples; the first matching entry wins. `warnMonths` sets how early the end of support is flagged, `rings` gives each ring its `label`, `short` and `color`, and `rules` turns the six Review warnings on or off and sets their `severity`: `rdr.eos-passed`, `rdr.retire`, `rdr.eos-soon`, `rdr.phase-after-eos`, `rdr.hold-added` and `rdr.retire-retained`.
- **Datasets**: `datasets` in `src/config.js` sets the `formats` offered for a dataset (`delta`, `iceberg`, `hudi`, `parquet`, `avro`, `json`, `csv`, `other`), the `qualityRules` offered (`not_null`, `unique`, `range`, `regex`, `accepted_values`, `freshness`, `custom`) and `storagePrice`, the indicative storage price per GB-month by layer (`bronze`, `silver`, `gold`, with `default` for the rest). The prices only estimate the storage of a dataset (volume × retention); they are separate from the hand-written costs of each component (`cost`). To adjust them, change the numbers to match your provider or contract, e.g. `storagePrice: { default: 0.023, gold: 0.026 }`. An unlisted format is still accepted when reading JSON and text.
- **dbt import**: `datasets.dbt` in `src/config.js` sets how a dbt `manifest.json` becomes datasets (see the guide). `layerRules` is an ordered list, first match wins, each with a target `layer` and the `folders` (any folder of the model's path under `models/`) or name `prefixes` that select it; `sourceLayer` and `seedLayer` place sources and seeds, and a model's `meta.layer` overrides all. `domainFrom` is the order to look for the domain (`meta`, `group`, `folder`); `format` and `contractVersion` are the defaults; `severity` maps a dbt test's `error` / `warn` to a rule severity; `publicAccess` lists the `access` values that mark a data product; `skipMaterialized` lists the materializations that are not imported (`ephemeral`); `exposureTypes` gives the component type of each dbt exposure type (`exposureDefault` for the rest). `maxBytes`, `maxNodes`, `maxDatasets`, `maxColumns`, `maxRules` and `maxExposures` are the limits. For example, to treat `curated_` models as silver add `{ layer: 'silver', prefixes: ['curated_'] }` to `layerRules`.
- **Automatic security review**: `securityRules` in `src/config.js` has one entry per rule (`sec.unencrypted-sensitive`, `sec.unstated-encryption`, `sec.public-sensitive`, `sec.datastore-backup`, `sec.cross-border`, `sec.sensitive-no-owner`, `sec.public-datastore`) with `enabled` (set `false` to turn a rule off) and `severity` (`low`, `medium`, `high`, `critical`). The rest are the rule's parameters: `clientTypes`, `publicGroupIcons` and `publicGroupName` (what counts as public), `dataStoreTypes` and `dataStoreIconCategories`, `backupIcons`, `backupName` and `backupEdgeLabel` (what counts as a backup). Text patterns are case-insensitive RegExps.
- **Compliance**: `compliance.frameworks` is an ordered map `key → { label, short, url?, controls: { '<id>': { label: { en, es } } } }`. Add a control by adding a line in its framework, or a framework (NIST CSF, ENS, DORA…) by copying a block; JSON and Text accept any `framework:id`, even without a catalog entry. `compliance.suggest` maps each data class (and `crossBorder`) to the controls offered as chips; the first one of each list is the one the review expects.
- **Architecture decisions**: `adr.staleDays` (default `30`) is how many days a *proposed* decision can wait before it shows as a low finding in the *Review* tab; `0` turns it off.
- **Resilience**: `resilience` in `src/config.js` sets `entryTypes` (component types treated as entry points, besides any node with no incoming flow), `dataStoreTypes` and `dataStoreIconCategories` (what counts as a data store), `spofSeverity` and `singleStoreSeverity` (severity of the findings) and `defaultTarget` (SLA in % expected from a data store, default `99.9`).
- **Environments**: `environments` sets the buttons of the *Versions* tab (name, short label and color). Add or remove as many as you need.
- **Node size**: with `node.sameSize: true` (default) every node is `node.width` wide and long names wrap to 2 lines.
  With `false`, each node grows with its text.
- **Shortcuts without an official icon**: `presets` adds items at the top of a provider's list (for example, SAP systems).
- **Fonts**: pick Inter (default), IBM Plex Sans or Fira Code from the top bar; the choice is saved in your browser and embedded in SVG/PNG exports. They are bundled with the app (not loaded from the web). To add one, drop its `.woff2` files in `assets/fonts/`, add an entry to `FONTS` in `tools/build-fonts.py` (see the header) and run `python3 tools/build-fonts.py`.
- **Palettes**: add an entry to `palettes` with the same color keys (`rosa`, `coral`, …) for `dark`, `light` and `black` (Pastel and Neon ship by default). A saved palette that no longer exists falls back to Pastel.
- **New component type**: copy an entry in `types` and change `label`, `category`, `color`, `keywords` and `icon` (a 24×24 SVG).
- **Connections**: `edgeStyles` sets dash, width and particle count. It ships eight built-in types (`sync`, `async`, `data`, `optional`, `replication`, `batch`, `stream`, `control`); add yours there to make it available in every diagram (in the Text tab it is written `style=<key>`). Types that only one diagram needs are created in the connection inspector (**Style › + New type…**) and stored in that diagram (`edgeTypes`). Importance (`weight`: `high`, `critical`) multiplies the stroke width in `index.html` / `src/app.js` (`EDGE_W`).
- **Animation**: speed, entrance and step duration in `animation`.
- **Costs**: `cost.currency`, `cost.hoursPerMonth` (730 = hours in a month) and `cost.defaultYears`.
- **Templates**: add your own in `src/examples.js`.
- **Decision kits**: ready-made backlogs of architecture decisions (ADR), listed under **Add decision kit…** in the ADR tab. They live in `src/adr-kits.js` (see below). The *Lakehouse greenfield · decision kit* template shows a kit applied to a starter diagram.

### Decision kits

`src/adr-kits.js` defines `window.DIAGRAMON_ADR_KITS`, an array of kits. To add your own, append an object (or edit the `lakehouse` one) and reload `index.html`:

```js
window.DIAGRAMON_ADR_KITS.push({
  id: 'my-kit',                                        // unique key
  name: { en: 'My kit', es: 'Mi kit' },                // shown in the kit menu
  desc: { en: 'What it covers', es: 'Qué cubre' },
  criteria: [                                          // default criteria, copied into every decision without its own
    { id: 'cost', label: { en: 'Total cost', es: 'Costo total' }, weight: 3 }   // id: a-z 0-9 -, weight 1..5
  ],
  decisions: [{
    area: { en: 'Storage', es: 'Almacenamiento' },     // groups decisions in the ADR tab
    title: { en: 'Which table format?', es: '¿Qué formato de tabla?' },
    context: { en: 'Why it matters and what to ask the client.', es: 'Por qué importa y qué preguntar al cliente.' },
    criteria: [],                                      // optional: replaces the kit criteria for this decision
    options: [{                                        // 2 to 4 options is usual (up to 12)
      id: 'A', title: 'Delta Lake',                    // plain text or { en, es }
      summary: { en: 'One sentence.', es: 'Una frase.' },
      pros: { en: '• First\n• Second', es: '• Primero\n• Segundo' },
      cons: { en: '• First\n• Second', es: '• Primero\n• Segundo' }
    }],
    links: { nodes: ['bronze', 'silver'] }             // node ids; ids missing from the current diagram are dropped
  }]
});
```

- Every text can be a plain string or `{ en, es }`; the active language is used.
- Decisions are added as *proposed* with new `ADR-###` ids and no scores: the consultant scores them with the client. A decision whose title already exists in the diagram is skipped.
- Write `pros` and `cons` as short lines starting with `• ` and joined with `\n`. Keep them factual and vendor-neutral; avoid prices.
- A template can build its decisions from a kit (see the end of the *Lakehouse greenfield* template in `src/examples.js`), so the `links` point at that template's node ids. `src/adr-kits.js` must be loaded before `src/examples.js`.

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

Set `"icons": { "enabled": false }` in `src/config.js` to turn them off.

</details>

<details>
<summary><b>Extension API</b></summary>

`window.Diagramon` exposes `model`, `load()`, `addNode()`, `addEdge()`, `select()`, `align()`, `relayout()`,
`fitView()`, `togglePlay()`, `toggleTheme()`, `toggleLang()`, `lang`, `saveVersion()`, `openVersion()`, `compareVersion()`, `deleteVersion()`, `exportSVG()`, `exportPNG()`, `exportJSON()`, `lineage()`, `datasets()`, `owners()`, `crossBorder()`, `layers()`, `setLayerNames()`, `compliance()`, `exportCompliance()`, `inventory()`, `exportInventory()`, `decisions()`, `addDecision()`, `updateDecision()`, `removeDecision()`, `exportDecisions()`, `config` and `icons`.
Also: `setScope(id | null)`, `scope`, `scopes()` and `exportLevels(format)` for C4 levels.
The text language is in `window.DiagramonText` (`parse` and `stringify`). UI translations are in `window.DiagramonI18n`.

</details>
