[← Diagramon](../README.es.md) · [English](customize.md) · **Español**

# 🎨 Personalizar

Todo lo personalizable está en **`src/config.js`**. Guarda y recarga `index.html`.

- **Tema por defecto**: `app.defaultTheme: 'dark' | 'light' | 'black'`. La tecla `T` y el botón de tema alternan claro → oscuro → negro.
- **Idioma por defecto**: `app.defaultLang: 'en' | 'es'`. Los textos de la interfaz están en `src/i18n.js`; los de `src/config.js` y `src/examples.js` pueden ser `{ en: '…', es: '…' }`.
- **Clasificaciones de datos**: `dataClasses` define las etiquetas (nombre, texto corto y color). `sensitive: true` activa el aviso rojo en flujos sin cifrar.
- **Jurisdicciones (residencia de datos)**: `residency.jurisdictions` en `src/config.js` es un mapa ordenado `clave → { label: { en, es }, short, match }`. `match` es una expresión regular (sin distinguir mayúsculas) que se prueba contra el texto de la región (`eu-west-1`, `westeurope`, `ES`…); gana la primera que coincide, así que pon las específicas (`uk`, `ch`) antes que las amplias (`eu`). Para añadir una, copia una línea y cambia clave, etiquetas y `match`. `of` es el texto opcional del aviso (*salen de **la UE***). Con `residency.warnSameJurisdiction: true` también avisa cuando cambian de región dentro de una misma jurisdicción.
- **Reglas de amenazas STRIDE**: `stride` en `src/config.js` fija los umbrales y los textos. `inboundSeverity` es la severidad de *Suplantación* en cruces entrantes, `criticalClasses` las clases de datos que vuelven crítica la *Divulgación de información*, `storeTypes` y `storeIconCategories` lo que cuenta como almacén de datos, secretos o identidad para la *Elevación de privilegios*, y `categories` la etiqueta, descripción y pista de mitigación (`{ en, es }`) de cada letra. Las reglas están explicadas en un comentario encima.
- **Capas del data lake**: `dataLayers` define las capas en orden (`label` para los nombres medallón, `alt` para Crudo/Curado/Consumo, letras cortas y `color`). Los colores usan `--layer-bronze`, `--layer-silver` y `--layer-gold`, definidos por tema en `index.html`; cámbialos ahí o pon un color fijo en `src/config.js`. `layerAliases` lista otras palabras aceptadas al leer JSON y texto. La opción `layers` de cada vista las muestra u oculta.
- **Revisión de seguridad automática**: `securityRules` en `src/config.js` tiene una entrada por regla (`sec.unencrypted-sensitive`, `sec.unstated-encryption`, `sec.public-sensitive`, `sec.datastore-backup`, `sec.cross-border`, `sec.sensitive-no-owner`, `sec.public-datastore`) con `enabled` (pon `false` para apagarla) y `severity` (`low`, `medium`, `high`, `critical`). Lo demás son parámetros de la regla: `clientTypes`, `publicGroupIcons` y `publicGroupName` (qué cuenta como público), `dataStoreTypes` y `dataStoreIconCategories`, `backupIcons`, `backupName` y `backupEdgeLabel` (qué cuenta como respaldo). Los patrones de texto son RegExp sin distinguir mayúsculas.
- **Cumplimiento**: `compliance.frameworks` es un mapa ordenado `clave → { label, short, url?, controls: { '<id>': { label: { en, es } } } }`. Añade un control con una línea en su marco, o un marco (NIST CSF, ENS, DORA…) copiando un bloque; el JSON y el Texto aceptan cualquier `marco:id`, aunque no esté en el catálogo. `compliance.suggest` asocia cada clase de datos (y `crossBorder`) con los controles que se ofrecen como fichas; el primero de cada lista es el que espera la revisión.
- **Decisiones de arquitectura**: `adr.staleDays` (por defecto `30`) son los días que una decisión *propuesta* puede esperar antes de aparecer como hallazgo bajo en la pestaña *Revisión*; `0` lo desactiva.
- **Resiliencia**: `resilience` en `src/config.js` define `entryTypes` (tipos de componente que cuentan como puntos de entrada, además de cualquier nodo sin flujos entrantes), `dataStoreTypes` y `dataStoreIconCategories` (qué es un almacén de datos), `spofSeverity` y `singleStoreSeverity` (gravedad de los hallazgos) y `defaultTarget` (SLA en % que se espera de un almacén de datos, por defecto `99.9`).
- **Ambientes**: `environments` define los botones de la pestaña *Versiones* (nombre, texto corto y color). Añade o quita los que necesites.
- **Tamaño de los nodos**: con `node.sameSize: true` (por defecto) todos miden `node.width` y los nombres largos usan 2 líneas.
  Con `false`, cada nodo crece con su texto.
- **Atajos sin icono oficial**: `presets` añade elementos arriba de la lista de un proveedor (por ejemplo, los sistemas SAP).
- **Tipografías**: elige Inter (por defecto), IBM Plex Sans o Fira Code en la barra superior; la elección se guarda en tu navegador y se incrusta en las exportaciones SVG/PNG. Vienen incluidas en la app (no se cargan de la web). Para añadir una, deja sus archivos `.woff2` en `assets/fonts/`, añade una entrada a `FONTS` en `tools/build-fonts.py` (mira su cabecera) y ejecuta `python3 tools/build-fonts.py`.
- **Paletas**: añade una entrada en `palettes` con las mismas claves de color (`rosa`, `coral`, …) para `dark`, `light` y `black` (por defecto vienen Pastel y Neón). Una paleta guardada que ya no existe vuelve a Pastel.
- **Nuevo tipo de componente**: copia una entrada de `types` y cambia `label`, `category`, `color`, `keywords` e `icon` (SVG de 24×24).
- **Conexiones**: `edgeStyles` define trazo, grosor y número de partículas. Trae ocho tipos predefinidos (`sync`, `async`, `data`, `optional`, `replication`, `batch`, `stream`, `control`); añade los tuyos ahí para tenerlos en todos los diagramas (en la pestaña Texto se escribe `estilo=<clave>`). Los tipos que solo necesita un diagrama se crean en el inspector de la conexión (**Estilo › + Nuevo tipo…**) y se guardan en ese diagrama (`edgeTypes`). La importancia (`weight`: `high`, `critical`) multiplica el grosor del trazo (`EDGE_W` en `src/app.js`).
- **Animación**: velocidad, aparición y duración de los pasos en `animation`.
- **Costos**: `cost.currency`, `cost.hoursPerMonth` (730 = horas de un mes) y `cost.defaultYears`.
- **Plantillas**: añade las tuyas en `src/examples.js`.

<details>
<summary><b>Actualizar o añadir iconos oficiales</b></summary>

1. Descarga los paquetes oficiales: [AWS](https://aws.amazon.com/architecture/icons/),
   [Azure](https://learn.microsoft.com/azure/architecture/icons/), [Google Cloud](https://cloud.google.com/icons)
   (core products y category icons) y [SAP BTP](https://github.com/SAP/btp-solution-diagrams)
   (carpeta `assets/shape-libraries-and-editable-presets/svg`) y [Microsoft Fabric](https://learn.microsoft.com/fabric/fundamentals/icons)
   (`Icons.zip`, carpeta `package/dist/svg`).
2. Descomprímelos en una carpeta con `aws/`, `azure/`, `gcp-core/`, `gcp-cat/`, `sap/` y `fabric/`.
   Si falta una carpeta, esa nube se salta y su archivo no se toca.
3. Añade servicios a las listas de `tools/build-icons.py` (o pon `ALL = True` para incluirlos todos).
4. Ejecuta:

   ```bash
   python3 tools/build-icons.py <carpeta>
   ```

`"icons": { "enabled": false }` en `src/config.js` los desactiva.

</details>

<details>
<summary><b>API para extensiones</b></summary>

`window.Diagramon` expone `model`, `load()`, `addNode()`, `addEdge()`, `select()`, `align()`, `relayout()`,
`fitView()`, `togglePlay()`, `toggleTheme()`, `toggleLang()`, `lang`, `saveVersion()`, `openVersion()`, `compareVersion()`, `deleteVersion()`, `exportSVG()`, `exportPNG()`, `exportJSON()`, `lineage()`, `datasets()`, `owners()`, `crossBorder()`, `layers()`, `setLayerNames()`, `compliance()`, `exportCompliance()`, `inventory()`, `exportInventory()`, `decisions()`, `addDecision()`, `updateDecision()`, `removeDecision()`, `exportDecisions()`, `config` e `icons`.
Además: `setScope(id | null)`, `scope`, `scopes()` y `exportLevels(formato)` para los niveles C4.
El lenguaje de texto está en `window.DiagramonText` (`parse` y `stringify`).

</details>
