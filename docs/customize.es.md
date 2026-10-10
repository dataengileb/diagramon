[← Diagramon](../README.es.md) · [English](customize.md) · **Español**

# 🎨 Personalizar

Todo lo personalizable está en **`src/config.js`**. Guarda y recarga `index.html`.

- **Tema por defecto**: `app.defaultTheme: 'dark' | 'light' | 'black'`. La tecla `T` y el botón de tema alternan claro → oscuro → negro.
- **Idioma por defecto**: `app.defaultLang: 'en' | 'es'`. Los textos de la interfaz están en `src/i18n.js`; los de `src/config.js` y `src/examples.js` pueden ser `{ en: '…', es: '…' }`.
- **Clasificaciones de datos**: `dataClasses` define las etiquetas (nombre, texto corto y color). `sensitive: true` activa el aviso rojo en flujos sin cifrar.
- **Jurisdicciones (residencia de datos)**: `residency.jurisdictions` en `src/config.js` es un mapa ordenado `clave → { label: { en, es }, short, match }`. `match` es una expresión regular (sin distinguir mayúsculas) que se prueba contra el texto de la región (`eu-west-1`, `westeurope`, `ES`…); gana la primera que coincide, así que pon las específicas (`uk`, `ch`) antes que las amplias (`eu`). Para añadir una, copia una línea y cambia clave, etiquetas y `match`. `of` es el texto opcional del aviso (*salen de **la UE***). Con `residency.warnSameJurisdiction: true` también avisa cuando cambian de región dentro de una misma jurisdicción.
- **Reglas de amenazas STRIDE**: `stride` en `src/config.js` fija los umbrales y los textos. `inboundSeverity` es la severidad de *Suplantación* en cruces entrantes, `criticalClasses` las clases de datos que vuelven crítica la *Divulgación de información*, `storeTypes` y `storeIconCategories` lo que cuenta como almacén de datos, secretos o identidad para la *Elevación de privilegios*, y `categories` la etiqueta, descripción y pista de mitigación (`{ en, es }`) de cada letra. Las reglas están explicadas en un comentario encima.
- **Capas del data lake**: `dataLayers` define las capas en orden (`label` para los nombres medallón, `alt` para Crudo/Curado/Consumo, letras cortas y `color`). Los colores usan `--layer-bronze`, `--layer-silver` y `--layer-gold`, definidos por tema en `index.html`; cámbialos ahí o pon un color fijo en `src/config.js`. `layerAliases` lista otras palabras aceptadas al leer JSON y texto. La opción `layers` de cada vista las muestra u oculta.
- **Disposición de migración (6R)**: `migration.dispositions` lista los valores en orden, cada uno con `label` (en/es), `alias` (más palabras que se aceptan al leer JSON y texto), `short` (las iniciales de la pastilla), `color` y `hint`. Pon `enabled: false` en uno para quitarlo (un valor quitado se descarta al leer JSON y es un error en la pestaña Texto); `relocate`, la séptima R, viene apagada. `migration.rules` enciende o apaga los tres avisos de Revisión y fija su `severity`: `mig.retire-no-until`, `mig.until-kept` (con la lista `keepers`) y `mig.change-no-decision` (con `needsDecision`, apagado por defecto).
- **Conjuntos de datos**: `datasets` en `src/config.js` define los `formats` que se ofrecen a un conjunto (`delta`, `iceberg`, `hudi`, `parquet`, `avro`, `json`, `csv`, `other`), las `qualityRules` ofrecidas (`not_null`, `unique`, `range`, `regex`, `accepted_values`, `freshness`, `custom`) y `storagePrice`, el precio orientativo de almacenamiento por GB-mes y por capa (`bronze`, `silver`, `gold`, con `default` para el resto). Los precios solo estiman el almacenamiento de un conjunto (volumen × retención); son independientes de los costos escritos a mano en cada componente (`cost`). Para ajustarlos, cambia los números por los de tu proveedor o contrato, p. ej. `storagePrice: { default: 0.023, gold: 0.026 }`. Un formato que no esté en la lista se acepta igualmente al leer JSON y texto.
- **Importación de dbt**: `datasets.dbt` en `src/config.js` define cómo un `manifest.json` de dbt se vuelve conjuntos de datos (ver la guía). `layerRules` es una lista ordenada, gana la primera que coincide, cada una con la `layer` de destino y las `folders` (alguna carpeta de la ruta del modelo bajo `models/`) o `prefixes` del nombre que la eligen; `sourceLayer` y `seedLayer` colocan fuentes y semillas, y el `meta.layer` de un modelo manda sobre todo. `domainFrom` es el orden para buscar el dominio (`meta`, `group`, `folder`); `format` y `contractVersion` son los valores por defecto; `severity` traduce el `error` / `warn` de una prueba de dbt a una severidad de regla; `publicAccess` lista los valores de `access` que marcan un producto de datos; `skipMaterialized` lista las materializaciones que no se importan (`ephemeral`); `exposureTypes` da el tipo de componente de cada tipo de exposición de dbt (`exposureDefault` para el resto). `maxBytes`, `maxNodes`, `maxDatasets`, `maxColumns`, `maxRules` y `maxExposures` son los límites. Por ejemplo, para tratar como plata los modelos `curated_` añade `{ layer: 'silver', prefixes: ['curated_'] }` a `layerRules`.
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
- **Kits de decisiones**: backlogs ya redactados de decisiones de arquitectura (ADR), que salen en **Añadir kit de decisiones…** de la pestaña ADR. Viven en `src/adr-kits.js` (ver abajo). La plantilla *Lakehouse greenfield · kit de decisiones* muestra un kit aplicado a un diagrama inicial.

### Kits de decisiones

`src/adr-kits.js` define `window.DIAGRAMON_ADR_KITS`, una lista de kits. Para añadir el tuyo, agrega un objeto (o edita el `lakehouse`) y recarga `index.html`:

```js
window.DIAGRAMON_ADR_KITS.push({
  id: 'mi-kit',                                        // clave única
  name: { en: 'My kit', es: 'Mi kit' },                // se ve en el menú de kits
  desc: { en: 'What it covers', es: 'Qué cubre' },
  criteria: [                                          // criterios por defecto, se copian a cada decisión que no tenga los suyos
    { id: 'cost', label: { en: 'Total cost', es: 'Costo total' }, weight: 3 }   // id: a-z 0-9 -, peso 1..5
  ],
  decisions: [{
    area: { en: 'Storage', es: 'Almacenamiento' },     // agrupa las decisiones en la pestaña ADR
    title: { en: 'Which table format?', es: '¿Qué formato de tabla?' },
    context: { en: 'Why it matters and what to ask the client.', es: 'Por qué importa y qué preguntar al cliente.' },
    criteria: [],                                      // opcional: reemplaza los criterios del kit en esta decisión
    options: [{                                        // lo habitual son 2 a 4 opciones (hasta 12)
      id: 'A', title: 'Delta Lake',                    // texto simple o { en, es }
      summary: { en: 'One sentence.', es: 'Una frase.' },
      pros: { en: '• First\n• Second', es: '• Primero\n• Segundo' },
      cons: { en: '• First\n• Second', es: '• Primero\n• Segundo' }
    }],
    links: { nodes: ['bronze', 'silver'] }             // ids de nodo; los que no existan en el diagrama actual se descartan
  }]
});
```

- Cada texto puede ser un texto simple o `{ en, es }`; se usa el del idioma activo.
- Las decisiones se añaden como *proposed* con ids `ADR-###` nuevos y sin puntuar: el consultor las puntúa con el cliente. Si ya existe una decisión con el mismo título en el diagrama, se omite.
- Escribe `pros` y `cons` como líneas cortas que empiezan con `• ` unidas por `\n`. Que sean factuales y neutrales respecto a los proveedores; evita precios.
- Una plantilla puede construir sus decisiones desde un kit (ver el final de la plantilla *Lakehouse greenfield* en `src/examples.js`), por eso los `links` apuntan a los ids de nodo de esa plantilla. `src/adr-kits.js` debe cargarse antes que `src/examples.js`.

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
