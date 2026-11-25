[← Diagramon](../README.es.md) · [English](roadmap-databricks.md) · **Español**

# 🧱 Roadmap: ideas tomadas de la Databricks Reference Architecture

Databricks publica una herramienta propia de arquitecturas de referencia interactivas, la
[Databricks Reference Architecture](https://databricks-industry-solutions.github.io/databricks-reference-architecture/)
([código](https://github.com/databricks-industry-solutions/databricks-reference-architecture)).
Este documento recoge **qué ofrece**, **qué tiene ya Diagramon**, y un **roadmap de mejoras** para Diagramon inspirado en ella.

Cada idea se adapta a los principios del proyecto: **sin servidor, sin red, sin dependencias, sin paso de build** y todo en
inglés y español. Lo que no encaja con esos principios está al final, con el motivo.

> Análisis hecho en noviembre de 2026 sobre la versión pública (tablero de Fabricación en Azure, en español).
> Si quieres encargarte de una idea, abre antes un *issue* para acordar el enfoque, como en el [roadmap general](roadmap.es.md).

---

## 1. Qué ofrece la herramienta de Databricks

| Área | Características |
|---|---|
| **Contenido** | 70 industrias más una arquitectura estándar, con buscador (`⌘K` / `Ctrl K`). Cada tablero especializa fuentes, ingesta, equipos, consumidores, casos de uso y apps; la plataforma del centro es siempre la misma. 10 casos de uso, 4 agentes Genie, 4 paneles AI/BI y 4 Databricks Apps por industria. Capas medallón con los términos de cada industria. Formatos de datos del sector (FHIR, ISO 20022, FIX, DICOM…) enlazados a su organismo de estándares. |
| **Estructura del tablero** | Bandas fijas: casos de uso y agentes arriba, fuentes, plataforma en el centro (ingesta, gobierno, medallón, servir), equipos, consumidores, productos publicados y servicios de la nube abajo. Cada banda se puede ampliar o cerrar, y hay un zoom a la plataforma sola. |
| **Simplificado / Detallado** | Simplificado muestra lo imprescindible para leer la industria; Detallado añade el resto con subtítulos, etiquetas de capacidades y descripciones. La elección se recuerda, viaja en el enlace y la siguen todas las exportaciones. |
| **Fichas al hacer clic** | Productos: qué es, lo que el nombre no dice, capacidades, documentación de tu nube, demos, cursos, certificaciones, vídeos y cajas relacionadas. Casos de uso: problema, beneficiarios, cómo se construye, componentes, casos de clientes y aceleradores. Equipos: personas, capacidades, casos que poseen, itinerario formativo. Fuentes: qué hace el sistema, quién lo usa y qué datos envía (batch o streaming, forma, volumen, cadencia). Agentes y paneles: datos que leen, preguntas típicas, KPI. Cada etiqueta enlaza a otra ficha y todo es accesible con teclado. |
| **Nube, región y madurez** | Azure, AWS o GCP redibuja servicios e ingesta y cambia los enlaces de documentación. Elegir una región atenúa lo que no está disponible allí, con una tabla filtrable y descargable en Excel. Filtro de estado de lanzamiento: GA, Public Preview, Beta, Private Preview, Próximamente. |
| **Presentación** | 16 idiomas (con árabe y hebreo de derecha a izquierda). Nombres de producto *Branded* o *Categorizados*. 5 formas de plataforma, 13 paletas que cumplen WCAG AA, claro y oscuro. Puntos de *highlight* que marcan qué cajas tienen caso de cliente, conector, demo, curso, vídeo o acelerador. Flujos de datos animados, panel de detalle acoplable, tour guiado de 10 pasos y formulario de feedback. |
| **Compartir y exportar** | Todas las opciones en la URL: un enlace copiado reabre el mismo tablero. PDF y PowerPoint con portada, índice, el tablero (formas editables en el PPTX) y una página por caso de uso, agente, panel y app. PNG, GIF animado, HTML autónomo, draw.io, Visio, SVG, Excalidraw y un descriptor YAML editable que se puede volver a importar. «Editar» clona un tablero en una pestaña propia, y las pestañas se recuerdan entre visitas. |
| **IA y agentes** | Asistente que genera una arquitectura editable a partir de una descripción, una foto de pizarra o un PDF (modelos Claude en endpoints de Databricks). Servidor MCP con cuatro herramientas: `list_industries`, `get_architecture`, `search_architectures`, `list_resources`. |
| **Ingeniería** | HTML estático sin build, una única dependencia (js-yaml). Contenido en YAML por industria con un esquema compartido entre app y herramientas. Datos públicos (regiones, estados, cursos) refrescados por scripts. Comprobaciones antes de publicar: regiones, estados, alturas, layout, enlaces, ajuste de etiquetas, i18n, exportaciones, rendimiento y YAML. |

## 2. Qué tiene ya Diagramon (y Databricks no)

Diagramon es un **banco de trabajo** para *tu* arquitectura; la de Databricks es un **catálogo de lectura** de *su* plataforma.
Por eso Diagramon ya cubre, y a menudo supera, varias de sus funciones:

| Función de Databricks | En Diagramon |
|---|---|
| Flujos de datos animados | Partículas en las conexiones y modo **Flow** paso a paso |
| Capas medallón | Capas bronce / plata / oro, catálogo de datos, contratos y linaje |
| Descriptor YAML de ida y vuelta | Pestaña **Texto** (diagrama como código) y JSON, siempre sincronizados |
| PNG, SVG, draw.io, HTML autónomo | PNG, SVG animado, draw.io, Mermaid, PlantUML y HTML **cifrado** con comentarios de vuelta |
| Presentar el tablero | Modo **Presentar** a pantalla completa, grupo a grupo |
| Ampliar o cerrar bandas | Grupos anidados, cajas cerradas, vistas y niveles **C4** |
| Tabla en Excel | Inventario en CSV / Excel y exportación de portfolio |
| Claro / oscuro | Claro, oscuro y alto contraste, dos paletas |

Y lo que Databricks no tiene: costes y escenarios, disponibilidad y puntos únicos de fallo, revisión de seguridad, STRIDE,
cumplimiento normativo, residencia de datos, ADR, requisitos, RAID, RACI, versiones, importación de IaC y comparación con lo desplegado.
**Este roadmap no busca copiar el catálogo de Databricks, sino traer su capa de lectura y presentación a los diagramas propios.**

---

## 3. Roadmap

Esfuerzo: **S** (un PR pequeño) · **M** (varios días, un área) · **L** (toca muchas áreas o necesita contenido nuevo).

### Resumen

| # | Idea | Fase | Esfuerzo | Inspirado en |
|---|---|---|---|---|
| 1 | Estado de la vista en la URL y enlaces profundos | 1 | S | Opciones en la barra de direcciones |
| 2 | Modo Simplificado / Detallado | 1 | M | Simplified / Detailed |
| 3 | Marcadores de *highlight* configurables | 1 | S | Highlights |
| 4 | Tour guiado de primera vez | 1 | S | Tour de 10 pasos |
| 5 | Modo foco sobre un grupo | 1 | S | Zoom a la plataforma |
| 6 | Paletas accesibles verificadas (WCAG AA) | 1 | M | 13 paletas AA |
| 7 | Nombres de marca o de categoría | 2 | M | Branded / Categorized |
| 8 | Equivalencias multinube | 2 | L | Cambio Azure / AWS / GCP |
| 9 | Disponibilidad por región y madurez del servicio | 2 | L | Región y release stage |
| 10 | Fichas enriquecidas de componente | 2 | M | Panel de detalle de producto |
| 11 | Fuentes con perfil de datos y formatos estándar | 2 | M | Fichas de fuentes, formatos de datos |
| 12 | Casos de uso, personas y KPI como elementos | 2 | L | Casos de uso, equipos, paneles |
| 13 | Biblioteca de arquitecturas de referencia por sector | 3 | L | 70 industrias con buscador |
| 14 | Layout por bandas | 3 | M | Estructura de bandas del tablero |
| 15 | Exportar presentación PPTX editable | 4 | L | PDF y PowerPoint |
| 16 | Exportar GIF animado | 4 | M | GIF animado |
| 17 | Exportar Excalidraw y Visio | 4 | M | Excalidraw, Visio |
| 18 | HTML autónomo de solo lectura (sin cifrar) | 4 | S | HTML autónomo |
| 19 | Pestañas con varios diagramas abiertos | 4 | M | Copia propia en pestañas |
| 20 | Más idiomas, incluido RTL | 5 | M | 16 idiomas |
| 21 | Servidor MCP local | 6 | M | Servidor MCP |
| 22 | Kit de prompt para tu propio asistente de IA | 6 | S | Asistente de arquitectura |
| 23 | Comprobaciones de calidad del contenido | transversal | M | Gates antes de publicar |

---

### Fase 1 · Lectura y navegación (victorias rápidas)

#### 1. Estado de la vista en la URL y enlaces profundos · S

**La necesidad.** En Databricks un enlace copiado reabre exactamente lo mismo. En Diagramon, la vista, el tema, el idioma y el
componente seleccionado se pierden al compartir o recargar.

**Diseño propuesto.** Guardar en el *hash* (`#view=security&theme=dark&lang=es&c4=api&sel=db1&detail=simple`) **solo el estado de
la vista, nunca datos del diagrama**. Al abrir, `hashchange` aplica el estado. Funciona desde `file://` y con el HTML compartido. Un botón
«Copiar enlace a este componente» en el inspector. Los enlaces entre diagramas (`ref`) del workspace podrían apuntar a un componente
concreto con el mismo formato, lo que cierra una de las [limitaciones conocidas](known-gaps.es.md).

#### 2. Modo Simplificado / Detallado · M

**La necesidad.** Un mismo diagrama sirve a un comité de dirección y a un equipo técnico. Hoy hay vistas y niveles C4, pero no un
interruptor rápido de densidad.

**Diseño propuesto.** Un campo `detail: 'core' | 'extra'` en componentes, grupos y conexiones (por defecto `core`). El modo
**Simplificado** oculta lo `extra` y los subtítulos, pills y etiquetas de conexión; **Detallado** lo muestra todo. Atajo de teclado,
se guarda en la URL (idea 1) y **todas las exportaciones siguen lo que hay en pantalla**. En la pestaña *Texto*, un sufijo `+extra`.
Los análisis (coste, seguridad, disponibilidad) siempre usan el diagrama completo y lo avisan en la leyenda.

#### 3. Marcadores de *highlight* configurables · S

**La necesidad.** Databricks pone puntos de color en las cajas que tienen caso de cliente, demo, curso… Para ver de un vistazo
«dónde hay algo».

**Diseño propuesto.** Un menú de marcadores con criterios que Diagramon ya conoce: tiene ADR, hallazgo abierto, comentarios
sin resolver, datos PII/PCI, punto único de fallo, fin de soporte próximo (radar), sin owner, coste por encima de un umbral. Cada uno
es un punto de color en la esquina del nodo, con leyenda. Los criterios se definen en `src/config.js` (bloque `highlights`), sin
lenguaje de reglas (ver *Reglas propias* en el [roadmap general](roadmap.es.md)).

#### 4. Tour guiado de primera vez · S

**La necesidad.** Diagramon hace muchas cosas y la primera apertura no las enseña. Databricks abre un tour de 10 pasos que se puede
omitir.

**Diseño propuesto.** Un tour de 8 a 10 pasos sobre una plantilla (dibujar, vistas, coste, seguridad, texto, exportar, compartir cifrado),
con «Omitir» y «Siguiente», relanzable desde el menú de ayuda y recordado en `localStorage`. Textos en `src/i18n.js`. Sin librerías:
un recuadro posicionado sobre el elemento destacado.

#### 5. Modo foco sobre un grupo · S

**La necesidad.** Databricks permite «acercarse a la plataforma sola» ocultando lo demás.

**Diseño propuesto.** En el menú de un grupo, «Enfocar»: oculta todo lo que no está dentro ni conectado directamente, y muestra las
conexiones externas como *fantasmas* en el borde (como ya hacen los niveles C4). `Esc` sale. Se puede exportar y presentar en ese estado.

#### 6. Paletas accesibles verificadas (WCAG AA) · M

**La necesidad.** Databricks ofrece 13 paletas que cumplen WCAG AA. Diagramon tiene dos paletas y alto contraste.

**Diseño propuesto.** Añadir paletas (incluidas variantes seguras para daltonismo) en `src/config.js` y una prueba en `tests/run.js` que
calcule el contraste de cada texto sobre su fondo en claro y oscuro y falle por debajo de 4.5:1. El selector de paleta va al menú de opciones.

---

### Fase 2 · Conocimiento sobre el diagrama

#### 7. Nombres de marca o de categoría · M

**La necesidad.** En propuestas neutrales o comparativas conviene mostrar «Almacenamiento de objetos» en vez de «Amazon S3».
Databricks alterna entre *Branded* y *Categorized*.

**Diseño propuesto.** Cada tipo de icono gana una `category` (ya hay familias en `src/config.js`). Un interruptor muestra la categoría
en lugar del nombre del producto y, opcionalmente, un icono genérico. Útil también para la vista Contexto y para clientes que no han
elegido aún proveedor.

#### 8. Equivalencias multinube · L

**La necesidad.** Databricks redibuja servicios e ingesta al cambiar entre Azure, AWS y GCP. Para Diagramon es muy valioso en
migraciones y en decisiones de proveedor.

**Diseño propuesto.** Una tabla de equivalencias en un archivo nuevo, `src/equivalents.js` (S3 ↔ ADLS Gen2 ↔ Cloud Storage, Lambda ↔
Functions ↔ Cloud Run functions, …). Acción «Traducir diagrama a Azure/GCP/AWS» que crea una **versión nueva** (no toca la actual) con
los iconos equivalentes, conserva ids, conexiones, datos y owners, y marca lo que no tiene equivalente directo como hallazgo de revisión.
La comparación de versiones existente enseña qué cambió. Los costes no se traducen: se marcan como «por revisar».

#### 9. Disponibilidad por región y madurez del servicio · L

**La necesidad.** Databricks atenúa los productos no disponibles en la región elegida y filtra por estado (GA, Preview…).
Diagramon ya conoce la región de los grupos y tiene un radar tecnológico.

**Diseño propuesto.** Un catálogo local `assets/regions/*.js` con la disponibilidad por servicio y región de cada nube, generado
**fuera de la app** por un script en `tools/` (como los iconos) y versionado en el repositorio con su fecha. La app sigue sin red. Un nuevo
hallazgo de revisión: «el servicio X no está disponible en la región Y» y atenuación en el lienzo. Un campo `stage` (GA, Preview, Beta)
en componentes alimenta el radar y un filtro «mostrar solo GA». La tabla se exporta con el inventario.
**Riesgo:** los datos caducan; cada informe debe mostrar la fecha del catálogo.

#### 10. Fichas enriquecidas de componente · M

**La necesidad.** En Databricks cada caja explica qué es, sus capacidades, su documentación y qué cajas se relacionan.

**Diseño propuesto.** Un catálogo local de descripciones cortas por tipo de servicio (`src/catalog.js`: qué es, para qué se usa, enlace a la
documentación oficial de cada nube). El inspector muestra una pestaña «Acerca de» con eso y con **cajas relacionadas** del propio diagrama
(conectadas, mismo dataset, mismo owner). Los enlaces abren una pestaña nueva solo al hacer clic, así que la CSP `connect-src 'none'`
no cambia. Para tipos sin entrada, la ficha se oculta.

#### 11. Fuentes con perfil de datos y formatos estándar · M

**La necesidad.** Las fichas de fuentes de Databricks dicen si envían batch o streaming, la forma, el volumen y la cadencia, y listan los
formatos del sector (FHIR, ISO 20022, FIX, DICOM…).

**Diseño propuesto.** Campos opcionales en componentes y conexiones: `mode` (batch, micro-batch, streaming, CDC), `format` (de una lista en
`src/config.js` con formatos genéricos y sectoriales), `volume` y `cadence`. Se muestran como pills en modo Detallado, viajan al catálogo de datos,
a los contratos de datos y al inventario, y la vista Datos puede colorear las conexiones por modo.

#### 12. Casos de uso, personas y KPI como elementos · L

**La necesidad.** Databricks relaciona casos de uso con componentes, equipos, beneficiarios y KPI. Diagramon tiene requisitos con matriz
de trazabilidad y stakeholders, pero no «casos de uso» que se vean sobre el lienzo.

**Diseño propuesto.** Una pestaña **Casos de uso** (modelo en `src/models/usecases.js`): problema, beneficiarios (stakeholders existentes),
componentes y datasets que usa, KPI y estado. Seleccionar un caso de uso **resalta su recorrido** en el lienzo (reutilizando el camino entre
componentes y el modo Flow). Cada caso de uso puede tener una página propia en el informe y en la presentación (idea 15).

---

### Fase 3 · Contenido de partida

#### 13. Biblioteca de arquitecturas de referencia por sector · L

**La necesidad.** El gran valor de Databricks son 70 tableros listos por industria. Diagramon tiene 5 plantillas genéricas.

**Diseño propuesto.** Una galería de plantillas con buscador (`Ctrl K`) y filtros por sector y nube, empezando por pocas y bien hechas:
lakehouse para retail, banca (fraude en tiempo real), fabricación (IoT e historians), salud (FHIR) y sector público. Cada una trae fuentes,
capas medallón, consumidores, casos de uso (idea 12), owners, riesgos y ADR de ejemplo, en inglés y español. Las plantillas viven en
`src/examples/` (un archivo por sector) para que la comunidad pueda contribuir sin tocar código. Se usarían los iconos existentes y genéricos;
solo se añadirían iconos de plataformas de datos (Databricks, Snowflake…) si su licencia permite redistribuirlos.

#### 14. Layout por bandas · M

**La necesidad.** Las arquitecturas de referencia se leen mejor en bandas fijas: fuentes → ingesta → plataforma → servir → consumidores.

**Diseño propuesto.** Una opción del layout automático que coloca los componentes en bandas según su `layer` (o un nuevo campo `band`),
horizontales o verticales, con la cabecera de cada banda plegable como en Databricks. Los grupos se conservan dentro de su banda.

---

### Fase 4 · Exportar y compartir

#### 15. Exportar presentación PPTX editable · L

**La necesidad.** Databricks exporta PowerPoint con portada, índice, el tablero como formas editables y una página por caso de uso.
Diagramon tiene informe PDF y modo Presentar, pero no PPTX.

**Diseño propuesto.** Un escritor mínimo `src/export/pptx.js`, igual que el de Excel (ZIP sin compresión, sin librerías): portada,
índice, el diagrama como formas y conectores nativos (no imagen), una diapositiva por grupo (como Presentar) y una por caso de uso, ADR o
hallazgo abierto, según lo que el usuario marque. Sigue el idioma, el tema y el modo Simplificado/Detallado en pantalla.
**Riesgo:** el formato OOXML de PowerPoint es delicado; necesita pruebas abriendo el archivo en PowerPoint, Keynote y LibreOffice.

#### 16. Exportar GIF animado · M

**La necesidad.** Un GIF con las partículas en movimiento se pega en un correo, una wiki o un chat donde un SVG animado no se reproduce.

**Diseño propuesto.** Renderizar N fotogramas del canvas a un `<canvas>` y codificarlos con un codificador GIF propio (LZW, paleta de 256 colores),
sin dependencias. Opciones: duración, tamaño y vista. El propio README podría generarse así.

#### 17. Exportar Excalidraw y Visio · M

**La necesidad.** Databricks exporta a Excalidraw y a Visio, dos herramientas muy usadas en talleres y en grandes empresas.

**Diseño propuesto.** `src/export/excalidraw.js` (JSON sencillo: rectángulos, flechas y texto, con iconos como imágenes embebidas) y
`src/export/vsdx.js` (ZIP sin compresión como el Excel). Empezar por Excalidraw, que es más simple; Visio después, con las mismas reglas
que draw.io para grupos y fronteras.

#### 18. HTML autónomo de solo lectura (sin cifrar) · S

**La necesidad.** Hoy el HTML compartido siempre pide contraseña. Para diagramas no sensibles, un visor de un solo archivo sin contraseña
es más cómodo.

**Diseño propuesto.** Una casilla «sin contraseña» en el diálogo de compartir, con aviso claro de que cualquiera con el archivo lo puede leer.
El HTML abre en modo de solo lectura con vistas, Flow, fichas y presentación.

#### 19. Pestañas con varios diagramas abiertos · M

**La necesidad.** En Databricks, «Editar» clona un tablero en una pestaña propia y las pestañas se recuerdan entre visitas.

**Diseño propuesto.** Una barra de pestañas para tener varios diagramas abiertos a la vez, cada uno con su autoguardado en `localStorage`
y su historial de deshacer. «Duplicar en pestaña nueva» sustituye a copiar y pegar el archivo. Complementa al workspace, que sigue siendo
la forma de trabajar con carpetas.

---

### Fase 5 · Idiomas

#### 20. Más idiomas, incluido RTL · M

**La necesidad.** Databricks está en 16 idiomas. Diagramon solo en inglés y español.

**Diseño propuesto.** Preparar `src/i18n.js` para más idiomas (un archivo por idioma en `src/i18n/`, con el inglés como respaldo para las claves
que falten), una prueba que liste las claves sin traducir y soporte `dir="rtl"`. Las plantillas y la pestaña *Texto* aceptan textos por idioma
como hoy (`{ en, es, … }`). Empezar por portugués, francés y alemán con ayuda de la comunidad.

---

### Fase 6 · IA y agentes, sin romper la privacidad

#### 21. Servidor MCP local · M

**La necesidad.** Databricks expone sus arquitecturas a agentes de IA por MCP. Con Diagramon, un agente podría leer y proponer cambios en
los diagramas del equipo.

**Diseño propuesto.** Un servidor MCP **opcional y separado** en `tools/mcp/` (Node, sin dependencias, por stdio), que trabaja sobre una carpeta
local de diagramas. Herramientas: `list_diagrams`, `get_diagram` (JSON o texto), `search` (componentes, datasets, owners), `review` (los hallazgos
que calcula la app) y `apply_text` (proponer un diagrama nuevo en el formato de texto, escrito como archivo nuevo, nunca sobrescribiendo).
La app web no cambia ni gana acceso a red: el servidor solo lee y escribe archivos, y lo instala quien lo quiera.

#### 22. Kit de prompt para tu propio asistente de IA · S

**La necesidad.** El asistente de Databricks genera una arquitectura a partir de una descripción o una foto de pizarra. Diagramon no
llama a ninguna IA en la nube a propósito.

**Diseño propuesto.** Un botón «Copiar prompt para IA» que copia al portapapeles la gramática del [formato de texto](text-format.es.md), la lista
de tipos de icono válidos y, si se quiere, el diagrama actual. El usuario lo pega en **el asistente que su empresa ya tenga aprobado** junto a su
descripción o foto, y pega la respuesta en la pestaña *Texto*, que la valida y la dibuja. Cero red, cero claves y el usuario decide qué sale de
su equipo.

---

### Transversal

#### 23. Comprobaciones de calidad del contenido · M

**La necesidad.** Databricks pasa comprobaciones de layout, ajuste de etiquetas, enlaces, i18n y exportaciones antes de publicar un tablero.

**Diseño propuesto.** Ampliar `tests/smoke.js` para que cada plantilla (y cada una de la biblioteca de la idea 13) compruebe: etiquetas que no
se salen de su caja, nodos que no se solapan, todas las claves de `i18n` presentes en cada idioma, contraste de paletas (idea 6) y que
cada exportación se genera sin errores. Es la red de seguridad para que la biblioteca crezca con contribuciones.

---

## 4. Lo que no adoptamos, y por qué

| Función de Databricks | Por qué no en Diagramon |
|---|---|
| Asistente que llama a modelos de IA en un servidor | Rompe la promesa de que ningún byte sale del equipo. Alternativas: kit de prompt (22) y MCP local (21). |
| Formulario de feedback y botones para compartir en redes | Requieren red. El feedback va por *issues* de GitHub. |
| Tarjetas de previsualización por industria (`share/`) | Necesitan un servidor que sirva páginas; Diagramon se abre desde el disco. |
| Carga de recursos bajo demanda (`fetch`) | La CSP bloquea `connect-src`. Todo va embebido en scripts, como los iconos. |
| Contenido de formación de Databricks (cursos, certificaciones, demos, vídeos) | Es contenido de un proveedor concreto. Diagramon es neutral entre nubes; los enlaces a documentación oficial de la idea 10 cubren la necesidad. |
| Dependencia js-yaml | Diagramon no tiene dependencias; ya lee YAML para IaC con su propio analizador. |

## Orden sugerido

1. **Fase 1** completa: mejora mucho la experiencia con poco riesgo y no cambia el modelo de datos salvo `detail`.
2. Ideas **7, 10 y 11**: enriquecen las fichas sin tocar los análisis.
3. Ideas **12, 13 y 14** juntas: casos de uso, biblioteca y bandas se refuerzan entre sí.
4. Ideas **15 y 16**: las exportaciones que más piden los clientes.
5. Ideas **8 y 9**: las más ambiciosas, mejor con la biblioteca ya hecha para probarlas.
6. El resto según demanda de la comunidad.
