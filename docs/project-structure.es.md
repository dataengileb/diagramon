[← Diagramon](../README.es.md) · [English](project-structure.md) · **Español**

# 🗂️ Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | Interfaz y estilos. `#diagram-css` son los estilos que también van en la exportación |
| `src/config.js` | **Todo lo personalizable**: temas, paletas, tipos, conexiones, animación y costos |
| `src/i18n.js` | Textos de la interfaz en inglés y en español |
| `src/app.js` | Núcleo del editor: dibujo e interacción del lienzo, conectores, vistas, niveles C4, los análisis (seguridad, residencia, STRIDE, disponibilidad, linaje), versiones, formato del archivo, arranque y la API pública `window.Diagramon`. Une las piezas de abajo |
| `src/text-lang.js` | Lenguaje de texto (diagrama como código) |
| `src/examples.js` | Plantillas |
| `src/export/mermaid.js`, `src/export/plantuml.js`, `src/export/drawio.js` | Exportadores a Mermaid, PlantUML y draw.io |
| `src/export/xlsx.js` | Generador mínimo de ZIP y Excel (`.xlsx`) sin librerías (lo usa la exportación del inventario) |
| `src/export/datacontract.js` | Contratos de datos (Open Data Contract Standard, YAML ODCS v3.2.0, un archivo por conjunto o todos en uno), escritos a mano sin librerías |
| `src/share.js` | Visor HTML cifrado y autosuficiente para compartir |
| `src/iac.js` | Importación de infraestructura como código (Terraform, CloudFormation, Kubernetes, Compose) |
| `src/workspace.js` | Espacio de trabajo (una carpeta de diagramas): reconoce los archivos de Diagramon, los resume (título, cantidades, versión de formato, `docId`) y nombra los archivos nuevos; puro, sin DOM. Su diálogo, con la lectura y escritura de la carpeta, es `src/ui/workspaceui.js` |
| `src/drift.js` | Diseño frente a realidad (puro, sin DOM): une los componentes de un diagrama con los recursos de la infraestructura importada por su dirección `iac`, propone (nunca aplica) uniones por nombre y tipo, y lista las diferencias de región, réplicas, exposición pública y copia de seguridad. |
| `src/dbt.js` | Importación del manifest de dbt (`manifest.json` a conjuntos, reglas de calidad, frescura y un diagrama de linaje); puro, sin DOM |
| `src/models/*.js` | Modelos puros (sin DOM) que salen de `src/app.js` en la v2, un archivo por área: `comments.js` comentarios e hilos de revisión; `radar.js` radar tecnológico y fin de soporte; `disposition.js` disposición de migración (6R); `decisions.js` decisiones de arquitectura (ADR) y aprobaciones; `raid.js` registro RAID; `stakeholders.js` interesados y matriz RACI; `requirements.js` requisitos y sus controles; `phases.js` fases (hoja de ruta) y estimación de esfuerzo; `status.js` informe de estado; `datasets.js` conjuntos de datos, catálogo y frescura; `reliability.js` fiabilidad de rutas (disponibilidad). Cada uno añade su parte a `window.DiagramonModels`. |
| `src/core/*.js` | Base compartida de la interfaz (se suma a `window.DiagramonCore`): `util.js` utilidades (`$`, `esc`, `clone`, `store`, iconos); `state.js` estado compartido `S` (y `R`, `VW`, `HL`), tipografías y vistas |
| `src/ui/*.js` | Piezas de la interfaz: pestañas, diálogos, inspector, exportaciones e informes. Un archivo por área, en la [tabla de abajo](#piezas-de-la-interfaz-srcui) |
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

## Piezas de la interfaz (`src/ui/`)

| Archivo | Qué contiene |
|---|---|
| `dialogs.js` | Cajas de confirmación y avisos |
| `panel.js`, `tabs.js` | Ancho del panel lateral y pestañas agrupadas |
| `sidebar.js`, `topbar.js` | Proveedores, paleta de componentes y plantillas; título y botones de la barra superior |
| `inspector.js` | El inspector en sí: qué muestra para cada selección, eventos de los campos y ediciones |
| `inspfields.js`, `inspconn.js`, `inspcomp.js` | Secciones del inspector: selector de color, buscador de iconos, costo, datos, capas y radar; STRIDE, cifrado, región, gobierno y disponibilidad; cumplimiento (sección y matriz) y tipos de conexión propios |
| `comments.js` | Diálogo de hilos de comentarios e importación de los comentarios de quien revisa |
| `raid.js`, `people.js`, `reqs.js`, `adr.js`, `datatab.js` | Pestañas RAID, Interesados (con RACI y la exportación de decisiones), Requisitos, ADR (con aprobaciones) y Datos |
| `workspaceui.js` | Diálogo del espacio de trabajo y de diseño frente a realidad (las pantallas de `src/workspace.js` y `src/drift.js`) |
| `exportshare.js`, `exportother.js`, `report.js` | Exportar SVG/PNG con leyenda y cajetín, varias vistas a la vez y compartir cifrado; Mermaid, PlantUML, draw.io, contratos de datos, JSON, inventario e importar dbt; informes de arquitectura y de estado |

## Cómo está dividido el código (v2)

Hasta la v2 casi toda la app vivía en `src/app.js`, unas 11.700 líneas en una sola clausura. La v2 movió los modelos puros a `src/models/`, el estado compartido y las utilidades a `src/core/` y la interfaz a `src/ui/`, sin cambiar lo que hace la app. `src/app.js` tiene ahora unas 5.800 líneas. La versión anterior se guarda en la rama `v1`.

1. **Scripts clásicos, sin módulos.** Cada archivo es un `<script src>` normal en `index.html` que añade su parte a un espacio de nombres en `window` (`DiagramonModels`, `DiagramonCore`, `DiagramonUI`). Los módulos ES (`import`/`export`) no cargan desde `file://`, así que romperían abrir la app con doble clic. Sigue sin haber paso de compilación.
2. **`create(ctx)` en las piezas de la interfaz.** Cada archivo de `src/ui/` expone `create(ctx)` y devuelve las funciones que necesita el resto de la app. `src/app.js` lo llama en el sitio donde estaba el código, con una línea como `const { renderInspector } = window.DiagramonUI.inspector.create({ … })`. `ctx` lleva lo que la pieza necesita de la app: las funciones definidas más abajo van como envolturas (`undo: (...a) => undo(...a)`), y los valores que cambian o se definen más abajo (`WS`, `DUR_TIERS`) van como getters (`get WS() { return WS; }`), nunca como envolturas.
3. **Pruebas.** `tests/run.js` lee `src/app.js` junto con los archivos de `src/ui/` (la lista `UI_FILES`), así que una prueba que busca un trozo de código lo encuentra esté donde esté. Si añades un archivo a `src/ui/`, súmalo a `index.html`, a `UI_FILES` y a la tabla de arriba.
4. **Qué cambia en la práctica.** Nada para quien usa la app: las mismas funciones, los mismos archivos y la misma API pública. Abrir la página tarda unas decenas de milisegundos más, porque el navegador lee 55 scripts pequeños en lugar de 23 más grandes. La ganancia es para quien cambia el código: archivos más pequeños, revisiones que tocan una sola área y partes que se pueden probar por separado.
