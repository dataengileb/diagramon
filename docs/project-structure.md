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
| `samples/` | Sample IaC files to try the import |
| `assets/icons/*.js` | Embedded official icons for AWS, Azure, Google Cloud, SAP BTP and Microsoft Fabric |
| `tools/build-icons.py` | Builds `assets/icons/*.js` from the official packs |
| `assets/icons/logos.js`, `tools/build-logos.py` | Azure, Google Cloud and SAP logos for groups, built from `tools/logos/` |
| `assets/fonts/` | Bundled fonts (`.woff2`, OFL licenses) and the generated `fonts.js` |
| `tools/build-fonts.py` | Builds `assets/fonts/fonts.js` from `assets/fonts/*.woff2` |
| `tests/run.js` | Automated tests without dependencies (text format, exports, IaC import, translations, pure functions); run with `node tests/run.js` |
