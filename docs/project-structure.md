[← Diagramon](../README.md) · **English** · [Español](project-structure.es.md)

# 🗂️ Project structure

| File | Purpose |
|---|---|
| `index.html` | UI and styles. `#diagram-css` holds the styles that are also embedded in exports |
| `src/config.js` | **Everything you can customize**: themes, palettes, types, connections, animation and costs |
| `src/i18n.js` | UI texts in English and Spanish |
| `src/app.js` | Editor engine |
| `src/text-lang.js` | Text language (diagram as code) |
| `src/examples.js` | Templates |
| `src/export/mermaid.js`, `src/export/plantuml.js`, `src/export/drawio.js` | Exporters to Mermaid, PlantUML and draw.io |
| `src/export/xlsx.js` | Minimal ZIP and Excel (`.xlsx`) writer, no libraries (used by the inventory export) |
| `src/export/datacontract.js` | Data contracts (Open Data Contract Standard, ODCS v3.2.0 YAML, one file per dataset or all in one), written by hand with no libraries |
| `src/share.js` | Encrypted, self-contained HTML viewer for sharing |
| `src/iac.js` | Infrastructure-as-code import (Terraform, CloudFormation, Kubernetes, Compose) |
| `src/dbt.js` | dbt manifest import (`manifest.json` to datasets, quality rules, freshness and a lineage diagram); pure, no DOM |
| `samples/` | Sample IaC files and a dbt manifest (`samples/dbt/`) to try the imports |
| `assets/icons/*.js` | Embedded official icons for AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric |
| `tools/build-icons.py` | Builds `assets/icons/*.js` from the official packs |
| `assets/icons/logos.js`, `tools/build-logos.py` | Azure, Google Cloud and SAP logos for groups, built from `tools/logos/` |
| `assets/fonts/` | Bundled fonts (`.woff2`, OFL licenses) and the generated `fonts.js` |
| `tools/build-fonts.py` | Builds `assets/fonts/fonts.js` from `assets/fonts/*.woff2` |
| `tests/run.js` | Automated tests without dependencies (text format, exports, IaC and dbt import, translations, pure functions); run with `node tests/run.js` |

## Changing the file format

Every JSON the app writes starts with `formatVersion`. Files from before the field existed count as version 0, and a file with a higher number than the app's opens with a warning, because anything this version does not know is lost on save.

When a change to the model would break old files (a renamed or moved key, a changed meaning), and not when you only add an optional field:

1. In `src/app.js`, raise `FORMAT_VERSION` and add `{ to: <new number>, up: doc => … }` to `MIGRATIONS` (between the `/* migrate:start */` and `/* migrate:end */` markers).
2. `up` must be pure: it receives a document and returns the converted one without touching the original. It runs on the root document and on every saved version snapshot (`versions[].diagram`), in order, starting after the file's version.
3. Add a test in the "Format version" section of `tests/run.js` with a document in the old shape and the expected result.

Templates, saved versions, new diagrams and the Text tab already come in the current format and skip the migrations. Files, local saves and the JSON tab go through them.
