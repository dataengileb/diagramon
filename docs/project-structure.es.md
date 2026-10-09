[← Diagramon](../README.es.md) · [English](project-structure.md) · **Español**

# 🗂️ Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | Interfaz y estilos. `#diagram-css` son los estilos que también van en la exportación |
| `src/config.js` | **Todo lo personalizable**: temas, paletas, tipos, conexiones, animación y costos |
| `src/i18n.js` | Textos de la interfaz en inglés y en español |
| `src/app.js` | Motor del editor |
| `src/text-lang.js` | Lenguaje de texto (diagrama como código) |
| `src/examples.js` | Plantillas |
| `src/export/mermaid.js`, `src/export/plantuml.js`, `src/export/drawio.js` | Exportadores a Mermaid, PlantUML y draw.io |
| `src/export/xlsx.js` | Generador mínimo de ZIP y Excel (`.xlsx`) sin librerías (lo usa la exportación del inventario) |
| `src/export/datacontract.js` | Contratos de datos (Open Data Contract Standard, YAML ODCS v3.2.0, un archivo por conjunto o todos en uno), escritos a mano sin librerías |
| `src/share.js` | Visor HTML cifrado y autosuficiente para compartir |
| `src/iac.js` | Importación de infraestructura como código (Terraform, CloudFormation, Kubernetes, Compose) |
| `src/dbt.js` | Importación del manifest de dbt (`manifest.json` a conjuntos, reglas de calidad, frescura y un diagrama de linaje); puro, sin DOM |
| `samples/` | Archivos de IaC y un manifest de dbt (`samples/dbt/`) de ejemplo para probar las importaciones |
| `assets/icons/*.js` | Iconos oficiales de AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric, incrustados |
| `tools/build-icons.py` | Genera `assets/icons/*.js` desde los paquetes oficiales |
| `assets/icons/logos.js`, `tools/build-logos.py` | Logotipos de Azure, Google Cloud y SAP para grupos, generados desde `tools/logos/` |
| `assets/fonts/` | Tipografías incluidas (`.woff2`, licencias OFL) y el `fonts.js` generado |
| `tools/build-fonts.py` | Genera `assets/fonts/fonts.js` desde `assets/fonts/*.woff2` |
| `tests/run.js` | Pruebas automáticas sin dependencias (formato de texto, exportaciones, importación de IaC y de dbt, traducciones, funciones puras); se ejecutan con `node tests/run.js` |
