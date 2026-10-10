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
| `src/workspace.js` | Espacio de trabajo (una carpeta de diagramas): reconoce los archivos de Diagramon, los resume (título, cantidades, versión de formato, `docId`) y nombra los archivos nuevos; puro, sin DOM. La lectura y escritura de la carpeta está en `src/app.js` |
| `src/drift.js` | Diseño frente a realidad (puro, sin DOM): une los componentes de un diagrama con los recursos de la infraestructura importada por su dirección `iac`, propone (nunca aplica) uniones por nombre y tipo, y lista las diferencias de región, réplicas, exposición pública y copia de seguridad. |
| `src/dbt.js` | Importación del manifest de dbt (`manifest.json` a conjuntos, reglas de calidad, frescura y un diagrama de linaje); puro, sin DOM |
| `samples/` | Archivos de IaC y un manifest de dbt (`samples/dbt/`) de ejemplo para probar las importaciones |
| `assets/icons/*.js` | Iconos oficiales de AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric, incrustados |
| `tools/build-icons.py` | Genera `assets/icons/*.js` desde los paquetes oficiales |
| `assets/icons/logos.js`, `tools/build-logos.py` | Logotipos de Azure, Google Cloud y SAP para grupos, generados desde `tools/logos/` |
| `assets/fonts/` | Tipografías incluidas (`.woff2`, licencias OFL) y el `fonts.js` generado |
| `tools/build-fonts.py` | Genera `assets/fonts/fonts.js` desde `assets/fonts/*.woff2` |
| `tests/run.js` | Pruebas automáticas sin dependencias (formato de texto, exportaciones, importación de IaC y de dbt, traducciones, funciones puras); se ejecutan con `node tests/run.js` |
| `tests/smoke.js` | Prueba de humo en navegador sin dependencias: abre `index.html` desde `file://` en Chrome sin ventana y comprueba el arranque (sin errores ni avisos de la CSP), las plantillas, las vistas, las exportaciones, el HTML cifrado y la API pública `window.Diagramon`; se ejecuta con `node tests/smoke.js` |

## Cambiar el formato del archivo

Todo JSON que escribe la app empieza con `formatVersion`. Los archivos anteriores al campo cuentan como versión 0, y uno con un número mayor que el de la app se abre con un aviso, porque lo que esta versión no conoce se pierde al guardar.

Cuando un cambio del modelo rompería los archivos viejos (una clave renombrada o movida, un significado distinto), y no cuando solo añades un campo opcional:

1. En `src/app.js`, sube `FORMAT_VERSION` y añade `{ to: <número nuevo>, up: doc => … }` a `MIGRATIONS` (entre los marcadores `/* migrate:start */` y `/* migrate:end */`).
2. `up` debe ser pura: recibe un documento y devuelve el convertido sin tocar el original. Se aplica al documento raíz y a cada foto de versión guardada (`versions[].diagram`), en orden, a partir de la versión del archivo.
3. Añade una prueba en la sección «Format version» de `tests/run.js` con un documento en el formato viejo y el resultado esperado.

Las plantillas, las versiones guardadas, los diagramas nuevos y la pestaña Texto ya están en el formato actual y no pasan por las migraciones. Los archivos, el guardado local y la pestaña JSON sí pasan por ellas.
