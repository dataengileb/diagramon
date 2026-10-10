[← Diagramon](../README.es.md) · [English](guide.md) · **Español**

# 📘 Tutorial

**Contenido**

- [El panel lateral](#el-panel-lateral)
- [1. Tu primer diagrama](#1-tu-primer-diagrama)
- [2. Conectar](#2-conectar)
- [3. Editar y agrupar](#3-editar-y-agrupar)
- [4. Varios a la vez y alineación](#4-varios-a-la-vez-y-alineación)
- [5. Costos](#5-costos)
  - [Desglose y escenarios](#desglose-y-escenarios)
- [Disponibilidad, RPO/RTO y puntos únicos de fallo](#disponibilidad-rporto-y-puntos-únicos-de-fallo)
- [6. Clasificación de datos y cifrado](#6-clasificación-de-datos-y-cifrado)
  - [Linaje de datos](#linaje-de-datos)
  - [Residencia de datos](#residencia-de-datos)
  - [Capas del data lake](#capas-del-data-lake)
  - [Catálogo de datos y contratos de datos](#catálogo-de-datos-y-contratos-de-datos)
- [7. Observaciones de revisión](#7-observaciones-de-revisión)
  - [Revisión de seguridad automática](#revisión-de-seguridad-automática)
  - [Mapeo de cumplimiento](#mapeo-de-cumplimiento)
  - [Dueños y responsables](#dueños-y-responsables)
- [Filtros](#filtros)
- [8. Versiones y ambientes](#8-versiones-y-ambientes)
  - [Decisiones de arquitectura (ADR)](#decisiones-de-arquitectura-adr)
- [9. Notas adhesivas y zonas de riesgo](#9-notas-adhesivas-y-zonas-de-riesgo)
  - [Modelado de amenazas (STRIDE)](#modelado-de-amenazas-stride)
- [10. Presentar y exportar](#10-presentar-y-exportar)
  - [Informe de arquitectura](#informe-de-arquitectura)
  - [Inventario (CSV / Excel)](#inventario-csv--excel)
- [Vistas](#vistas)
- [Niveles C4 (drill-down)](#niveles-c4-drill-down)
- [Atajos de teclado](#atajos-de-teclado)

## El panel lateral

El panel de la derecha tiene sus pestañas en dos filas. La primera fila tiene tres grupos: **Diseño** (*Componentes*, *Plantillas*, *Versiones*, *Texto*, *JSON*), **Gobierno** (*Revisión*, *ADR*, *Requisitos*, *RAID*, *Interesados*) y **Datos** (*Catálogo*). Haz clic en un grupo para abrir la pestaña que usaste por última vez en él. El contador de hallazgos abiertos también aparece en el grupo **Gobierno**, así lo ves aunque tengas abierto otro grupo. Dentro de una fila, las flechas se mueven entre las pestañas (y entre los grupos en la primera fila), **Inicio** va a la primera y **Fin** a la última. El panel mide 320 px de ancho por defecto; arrastra su borde para cambiarlo.

## 1. Tu primer diagrama

1. Abre la pestaña **Plantillas** y elige *Web app en AWS · 3 capas* para ver un ejemplo completo.
2. Pulsa **Nuevo** para empezar con el lienzo vacío.
3. En **Componentes**, abre la lista **Proveedor** y elige **Genéricos**, **AWS**, **Azure**, **Google Cloud**, **SAP BTP** o **Microsoft Fabric**.
   Solo verás los componentes de ese proveedor. Usa el buscador: `lambda`, `s3`, `hana`…
   También entiende sinónimos y equivalentes, en español e inglés: `sql` encuentra RDS, Cloud SQL y Azure SQL; `k8s` encuentra EKS, AKS y GKE; `cola` encuentra SQS y Service Bus.
   En **SAP**, arriba salen los **sistemas de negocio SAP** (S/4HANA, ECC, TM, EWM…) con el logotipo de SAP.
4. Haz **clic** en un componente para añadirlo al centro, o **arrástralo** al lienzo.
   Doble clic en un hueco del lienzo añade otro igual al último.

## 2. Conectar

- Selecciona un nodo y pulsa **`C`**, luego haz clic en el destino.
- O selecciona un nodo y haz **`⇧` + clic** en el destino.
- Haz clic en una conexión para cambiar su etiqueta, su estilo y su importancia:
  - **Estilo** (patrón de línea): **síncrona** (petición), **asíncrona** (evento), **flujo de datos**, **opcional**, **replicación**, **por lotes / programado**, **streaming** y **control / gestión**.
  - **Importancia**: **Normal**, **Importante** o **Crítica**. Un flujo más pesado se dibuja con línea más gruesa, punta de flecha mayor y más puntos en movimiento (la crítica añade además un halo suave). En la vista *Contexto*, un conjunto de conexiones toma la mayor importancia entre ellas. La leyenda muestra *Flujo importante* / *Flujo crítico* solo si el diagrama los usa.
  - **Tipos propios**: abre la lista **Estilo** y elige **+ Nuevo tipo…**. Ponle nombre y elige patrón de línea, color, grosor y puntos en movimiento; se aplica a la conexión seleccionada. Tus tipos viven en este diagrama (viajan con el JSON, las versiones, la pestaña *Texto* y las exportaciones) y salen en la leyenda. El botón **Tipos de conexión…** del panel los lista para editarlos o eliminarlos; eliminar un tipo en uso devuelve sus conexiones a *Síncrona* (un solo paso de deshacer).

## 3. Editar y agrupar

- Haz **clic** en un nodo: el panel derecho muestra nombre, detalle, icono, color y descripción.
- Para cambiar el icono, escribe parte de su nombre en el buscador **Icono** (`lamb`, `sql`, `kafka`…) y elige una sugerencia con el ratón o con ↑ ↓ y Enter. La × vuelve al icono genérico.
- **Doble clic** sobre un nodo, grupo o conexión lo renombra ahí mismo: escribe y pulsa `Intro` para aceptar (`Mayús+Intro` añade un salto de línea en la etiqueta de una conexión) o `Esc` para cancelar. Hacer clic fuera también acepta. Una etiqueta de conexión vacía la quita.
- En **Grupo › + Nuevo grupo…** creas un grupo. Arrastra su etiqueta para mover el grupo entero.

## 4. Varios a la vez y alineación

- **`⌘` + clic** (o **`Ctrl` + clic**) añade o quita nodos de la selección.
- **`⇧` + arrastrar** en el fondo selecciona un área. **`⌘A`** selecciona todo.
- Con varios elegidos, el panel derecho los **alinea** (izquierda, centro, derecha, arriba, medio, abajo)
  y los **reparte** con el mismo espacio en horizontal o vertical.
- Al arrastrar aparecen **guías** rosas que pegan el nodo a los bordes y centros de los demás. **`Alt`** las desactiva.

## 5. Costos

1. Selecciona un servicio.
2. En **Costo (USD)** escribe el precio.
3. Elige el periodo: **Por hora**, **Mensual**, **Anual** o **Multianual** (con número de años).

El precio aparece en un recuadro bajo el servicio. Arriba del lienzo ves el **total aproximado al mes**.
Con varios servicios elegidos, el panel muestra el costo de la selección.

> Diagramon no consulta precios en internet (por privacidad). Los costos los escribes tú.

### Desglose y escenarios

Abre **Costos…** desde el menú *Exportar*, o con el botón **Costos** de la pastilla de la vista **Costo** (tecla `7`).

- Pestaña **Desglose**: agrupa el costo mensual por **Equipo**, **Centro de costo**, **Dueño**, **Grupo**, **Tipo**, **Proveedor**, **Región** o **Capa**. Cada fila muestra los componentes, el costo mensual y anual (mensual × 12) y su parte del total con una barra. Los componentes sin valor van a **Sin asignar**. Un clic en una fila filtra el lienzo por ella (no disponible para *Tipo*). **Grupo** es un árbol por la ruta completa de grupos (p. ej. *Cuenta de producción › Región primaria › Capa oro*): cada fila muestra el costo **Directo** (componentes puestos justo en ese grupo) y el **Subtotal** (con los grupos anidados); los hermanos se ordenan por subtotal y las barras siguen el subtotal. Usa ▾ / ▸ para contraer o expandir un grupo (los dos primeros niveles empiezan expandidos). Los grupos dentro de un diagrama interno (niveles C4) cuelgan de una fila de ese nivel (*[diagrama interno]*), que es su propia rama de nivel superior. Los componentes sin grupo van a **Sin asignar**. El total general es la suma de la columna *Directo* (o de los subtotales de nivel superior), nunca de todos los subtotales.
- Pestaña **Comparar escenarios**: elige **A** y **B** entre el lienzo y cada versión guardada. Se usan las fotos de las versiones tal como se guardaron; el lienzo no se toca. Verás los totales, el cambio (importe y %), por mes y por año, una tabla por componente (nuevo en verde, cambiado en amarillo, eliminado en rojo; un clic en el encabezado ordena, *Solo cambios* oculta los que no cambian) y el cambio por equipo, centro de costo, dueño, grupo… (por grupo las filas se alinean por la ruta del grupo y se ven los grupos añadidos o eliminados).
- **Actual vs propuesto**: guarda como versión la arquitectura de hoy (p. ej. *Aprobada*), convierte el lienzo en la propuesta y abre el diálogo: A es la última versión aprobada y B el lienzo. **Guardar el lienzo como escenario propuesto** guarda una versión llamada *Propuesto* y la elige como B. En la pestaña **Versiones**, **Comparar costos** en cualquier versión abre el diálogo con esa versión como A y el lienzo como B.
- **CSV** exporta la tabla que se ve (`<diagrama>-costs.csv` o `<diagrama>-cost-compare.csv`).
- La leyenda de la vista Costo lista los 5 equipos que más cuestan, el panel de un grupo muestra su total mensual, al comparar una versión en el lienzo se añade una línea *Costo: $A → $B*, y el informe de arquitectura suma *Costo por equipo* y *Costo por centro de costo*, y su tabla *Costo por grupo* es el árbol con sangría por ruta, con columnas Directo y Subtotal.
- Desde la consola: `Diagramon.costBreakdown(by)` devuelve `[{ key, label, monthly, nodes }]` (con `'group'` además `path`, `pathLabel`, `depth`, `own`, `total`, `nodesAll`, `kind`; `monthly` = `own`, así que sumar `monthly` de todas las filas da el total general; `'groupTop'` conserva la agrupación plana anterior por nivel superior); `Diagramon.compareCosts(idVersionA, idVersionB)` (`null` = lienzo) devuelve `{ a: { label, monthly }, b: { label, monthly }, delta, deltaPct, rows: [{ id, label, a, b, delta, status }] }`; `Diagramon.openCosts('breakdown' | 'compare')` abre el diálogo.

## Disponibilidad, RPO/RTO y puntos únicos de fallo

1. Selecciona un componente y rellena **Disponibilidad**: el objetivo **SLA %** (elige un nivel como 99,9 o 99,99, o escribe `99.95`), **RPO** y **RTO** (`15m`, `4h`, `1d`, `0`) y **Réplicas / instancias**.
2. El panel muestra la disponibilidad efectiva, suponiendo instancias paralelas independientes: `1 − (1 − SLA)^réplicas`; por ejemplo *99,9% con 2 réplicas = 99,9999%*, y la parada esperada (*≈ 32 s/año*). Con varios componentes elegidos, los campos se aplican a todos.
3. Selecciona dos componentes y muestra el camino entre ellos: la barra del camino añade la **disponibilidad compuesta**, la probabilidad de que **al menos una ruta** entre ellos funcione. Combina las rutas alternativas (cada componente falla de forma independiente; las conexiones se suponen fiables; cuentan ambos extremos), de modo que un segundo camino por otros componentes sube la cifra; por ejemplo, dos componentes paralelos al 99% dan 99,99% en esa etapa. A su lado, *combinando N rutas alternativas* indica cuántas rutas se combinaron; también muestra el eslabón más débil de la ruta más probable y el mayor RPO y RTO de esa ruta. Las rutas siguen el sentido de las conexiones (las bidireccionales cuentan en ambos sentidos). Con una sola ruta posible la cifra es simplemente el producto de sus componentes. En diagramas muy mallados (más de unos 20 componentes inciertos en juego) la cifra es una cota inferior y se marca *(cota inferior)*. Los componentes sin SLA se cuentan y se dejan fuera del cálculo (se tratan como siempre activos).
4. Diagramon marca los **puntos únicos de fallo**: un componente sin réplicas cuya caída deja incomunicado un punto de entrada (usuarios, web, móvil, externo o un componente sin flujos entrantes) del resto. Los almacenes de datos de una sola instancia sin un SLA de 99,9% o mejor, y los almacenes sin RPO/RTO (solo si el diagrama los usa en algún sitio), salen también en la pestaña *Revisión* como *Disponibilidad y resiliencia*. Estos hallazgos solo aparecen cuando el diagrama ya usa SLA, RPO, RTO o réplicas en algún componente, así que un diagrama de servicios gestionados sin datos de disponibilidad no genera avisos; la vista **Resiliencia** siempre muestra los puntos únicos de fallo topológicos.
5. La tecla **`9`** abre la vista **Resiliencia**: los componentes se colorean por disponibilidad efectiva (≥ 99,99%, ≥ 99,9%, ≥ 99%, menos, o sin SLA), los puntos únicos de fallo llevan borde rojo discontinuo y una pastilla bajo cada componente dice *99,95% · RPO 15 min · RTO 1 h · ×2*.

Desde la consola: `Diagramon.availability(origen, destino)` devuelve `{ availability, downtimeYear, nodes, unknown, routes, method, approx, worst, rpo, rto }` (RPO y RTO en segundos; `nodes` es la ruta más probable, `routes` el número de rutas simples, con tope en 100, y `method` es `'single'`, `'exact'` o `'approx'`) y `Diagramon.spofs()` devuelve `[{ id, label, reason }]`. El *Informe de arquitectura* tiene una sección **Resiliencia**.

## 6. Clasificación de datos y cifrado

1. Selecciona un componente. En **Clasificación de datos**, pulsa las etiquetas de los datos que guarda o maneja: **PUB**, **INT**, **CONF**, **PII**, **PCI**, **PHI**. Puedes elegir varias.
2. Selecciona una conexión. En **Cifrado en tránsito** elige **Cifrado** o **Sin cifrar**, y marca los **Datos en tránsito**.

Las etiquetas salen arriba de cada nodo y en la etiqueta de la conexión, junto a un candado: cerrado 🔒 si va cifrada, abierto si no.
Si una conexión *Sin cifrar* lleva datos sensibles, o une un componente con datos sensibles, se pone roja y aparece un aviso arriba del lienzo.
Con varios componentes elegidos, las etiquetas se aplican a todos.

### Linaje de datos

Marca qué tablas o conjuntos de datos viajan por cada conexión y sigue uno desde su origen hasta donde se consume.

1. Selecciona una conexión. En **Conjuntos de datos** escribe el nombre de una tabla y pulsa `Intro` o `,` para añadirla (el campo sugiere los nombres que ya usa el diagrama). La **×** de cada ficha la quita.
2. Pulsa una ficha (o la tecla `D` y elige de la lista, o una fila de la leyenda **Conjuntos de datos** de la ficha del documento) para ver su linaje: se resalta todo el recorrido y cada componente lleva un número (su profundidad). Los orígenes salen en verde y los consumos en naranja.
3. La barra sobre el lienzo lo resume (*orígenes → consumos · saltos*). `Esc` lo quita. También funciona en la vista *Contexto*, donde se muestra en las cajas cerradas y en las conexiones combinadas entre ellas.

Al seleccionar un componente se listan los conjuntos de sus conexiones. En la vista **Datos** los nombres se dibujan bajo la etiqueta de cada conexión y salen en las exportaciones. Las conexiones con flecha en los dos extremos cuentan en ambos sentidos.

### Residencia de datos

1. Selecciona un componente o un grupo y escribe su **Región** (una región cloud como `eu-west-1`, `westeurope`, `europe-west1`, o un código de país como `ES`, `US`). El campo sugiere las regiones que ya usa el diagrama. Los componentes heredan la región del grupo más cercano que la tenga; un grupo con la región en el nombre (`Región eu-west-1 (Irlanda)`) se detecta solo, y el panel dice *heredada de…* o *deducida de…*.
2. Diagramon asigna a cada región una jurisdicción (UE, Reino Unido, EE. UU., Canadá, Brasil, Latinoamérica, Asia-Pacífico, Medio Oriente, África) y la muestra junto al campo. Las regiones desconocidas se ignoran.
3. Si una conexión une dos regiones de jurisdicciones distintas y lleva datos sensibles (sus propias clases o, si no tiene, las de su origen), el inspector muestra `eu-west-1 (UE) → us-east-1 (EE. UU.)` y un aviso en rojo como *Datos PII salen de la UE → EE. UU.*. Si la transferencia está cubierta (cláusulas tipo, decisión de adecuación…), activa **Transferencia autorizada**: sigue listada pero deja de avisar.

Las vistas **Seguridad** y **Física** muestran la región en cada componente. En **Seguridad**, las transferencias no autorizadas son críticas (rojo, con un globo) y sus extremos se resaltan; la leyenda añade *Datos sensibles fuera de su jurisdicción* y el resumen sobre el lienzo las cuenta. El filtro tiene la ficha **Fuera de su jurisdicción** (en *Datos*) y una sección **Región** (una ficha por jurisdicción y *Región desconocida*). Desde la consola: `Diagramon.crossBorder()`.

### Capas del data lake

Indica en qué capa de un data lake tipo medallón está cada componente.

1. Selecciona un componente o un grupo. En **Capa del data lake** elige **Bronce**, **Plata** u **Oro** (o *Ninguna*).
2. Los componentes heredan la capa de su grupo, así que basta con marcar la zona una vez. El botón *Ninguna* pasa a decir *Heredada (Oro)* y una nota indica de qué grupo viene.
3. Bajo los botones puedes cambiar los nombres de todo el documento entre **Bronce · Plata · Oro** y **Crudo · Curado · Consumo** (raw / curated / serving). Se aplica a etiquetas, leyenda y filtros.

Un componente con capa lleva una franja de color en su borde izquierdo y una etiqueta pequeña en la esquina inferior izquierda. Un grupo con capa propia tiene el borde más grueso y teñido, y una etiqueta junto al título.
La leyenda **Capas** (exportaciones y ficha del documento, tecla **I**) lista las capas en uso; en la ficha del documento, una fila filtra por esa capa. El menú **Filtrar** tiene una sección *Capa* y la vista **Datos** resalta los componentes con capa.
Las vistas *Contexto* y *Costo* ocultan las capas. Desde la consola: `Diagramon.layers()` y `Diagramon.setLayerNames('zones')`.

### Catálogo de datos y contratos de datos

Declara los conjuntos de datos que mueve tu arquitectura, con sus columnas, reglas de calidad y contrato, y comprueba que llegan dentro de su SLA de frescura. Un **conjunto declarado** es una ficha del catálogo. Un nombre escrito en una conexión es solo un nombre: mientras no se declare un conjunto con ese nombre, está **sin documentar**.

- Abre la pestaña **Catálogo** (grupo **Datos**). **+ Conjunto** añade uno. La línea de resumen cuenta los conjuntos declarados, los productos de datos, los nombres sin documentar y los incumplimientos de SLA. Filtra por capa, por **★ Productos** o **No productos**, por dominio y por contrato, o escribe en el buscador.
- Cada ficha tiene una cabecera con el id, el nombre, la capa, una insignia de frescura (**✓** cumple su SLA, **✗** no lo cumple, **?** desconocida) y una **★** que marca un producto de datos (haz clic para marcarlo o desmarcarlo). Debajo van el dominio y el dueño, la frescura real frente al SLA y la estimación de almacenamiento. Haz clic en la cabecera para abrir la ficha. Sus secciones son:
  - **General**: descripción, dominio, capa, **Dueño** (un interesado, o *Otro (texto libre)…*), custodio, clases de datos, formato, **SLA de frescura**, volumen por día y retención, y la fase.
  - **Esquema**: una fila por columna (nombre, tipo, **Clave**, **PII**, **Nulo**, descripción). **+ Columna**, los botones ▲ ▼ y ×, y **⤢ Ampliar** para una ventana grande.
  - **Calidad**: **+ Regla** añade una regla con su columna, parámetro y severidad (no nulo, único, rango, patrón, valores aceptados, frescura o personalizada).
  - **Contrato**: versión, estado (**Borrador**, **Acordado** u **Obsoleto**), consumidores (componentes) y términos. **Crear contrato**, **Exportar contrato** y **Quitar contrato**.
  - **Linaje**: el camino más lento con la latencia de cada salto, y **Ver en el lienzo**, que resalta el linaje del conjunto.
  - **Eliminar conjunto**, al pie, pide confirmación (puedes deshacerlo).
  - Renombrar en el campo **Nombre** cambia también el nombre en cada conexión que lo lleva, en un solo paso de deshacer. Un nombre que ya usa otro conjunto se rechaza.
- La lista **Sin documentar** al pie reúne los nombres de las conexiones que no tienen ficha. Haz clic en uno para ver su linaje, o pulsa **Documentar** para crear el conjunto; su capa es la del destino de su primera conexión.
- Un **producto de datos** debe tener dueño y contrato; la pestaña Revisión lo indica si falta alguno.

**Latencia** es un campo de cada conexión (**Latencia**, `15m`, `1h`, `1d`): el tiempo que tarda el dato en ese salto, como una ventana de lote o un intervalo de micro-lote. La **frescura de extremo a extremo** de un conjunto es la suma de las latencias a lo largo de su **camino más lento**, desde un origen de su linaje hasta un consumidor. Un salto sin latencia cuenta como cero y se muestra como **?** (el total se lee entonces *≥*). Es **desconocida** cuando el conjunto no tiene SLA o ningún camino tiene latencias. La ficha y el control de requisito **Frescura** (abajo) la usan.

**Estimación de almacenamiento**: volumen por día × retención (365 días si no se indica), con el precio por GB-mes de su capa, según las tarifas orientativas de `src/config.js › datasets.storagePrice` (ver *Personalizar*). Es una estimación: aparece en la ficha, en el informe y en la comparación por fases (*Almac./mes*), y se mantiene aparte del costo de los componentes.

**Fases**: un conjunto con fase existe desde esa fase en adelante, y la tabla de comparación de fases gana una columna *Conjuntos* cuando el diagrama tiene conjuntos, y una columna *Almac./mes* cuando algún conjunto tiene volumen.

**Observaciones de revisión** (grupo *Catálogo de datos* de la pestaña **Revisión**):

| Hallazgo | Gravedad | Salta cuando |
|---|---|---|
| Conjunto sin documentar | baja | Un nombre de las conexiones no tiene ficha (solo cuando el diagrama declara algún conjunto) |
| Producto de datos sin dueño o sin contrato | media | Un producto de datos no tiene dueño, no tiene contrato, o no tiene ninguno de los dos |
| Incumple el SLA de frescura | alta | La frescura de extremo a extremo supera el SLA del conjunto |
| Columnas PII sin clasificar como PII | media | Una columna está marcada como PII pero el conjunto no tiene la clase *pii* |
| Conjunto sensible en una conexión sin cifrar | alta | Un conjunto con clase sensible viaja por una conexión marcada *Sin cifrar* |
| Consumidor fuera del linaje | baja | Un consumidor del contrato no lo alcanza el linaje del conjunto |
| Sin reglas de calidad | baja | Un producto de datos o un conjunto de la capa oro no tiene reglas de calidad |

**Exportación y consola**

- **Exportar › Contratos de datos (YAML ODCS)** (solo aparece si el diagrama declara conjuntos) escribe un documento YAML por conjunto, separados por `---`. **Exportar contrato** de la ficha escribe un archivo para ese conjunto (`<nombre>.odcs.yaml`). El YAML sigue el Open Data Contract Standard **v3.2.0** y se escribe a mano, sin librerías. Los campos de Diagramon se asignan así: el nombre a `name` y al esquema; la versión y el estado (*borrador*, *acordado* como *active*, *obsoleto*); el dominio; la descripción al propósito y los términos al uso; las clases de datos a etiquetas; las columnas a las propiedades del esquema (tipo, clave, requerido, clasificación, descripción); las reglas de calidad a los chequeos de calidad; el SLA de frescura a la latencia y la retención a la retención del SLA; el dueño y el custodio a los miembros del equipo. Lo que el estándar no tiene campo (el id de Diagramon, la capa, el formato, los consumidores, la fase, el volumen diario y la marca de producto, como `dataProduct`) va a `customProperties`.
- El **informe** tiene una sección *Catálogo de datos y contratos*: un resumen, una tabla de los conjuntos (dominio, capa, dueño, producto, frescura, contrato y almacenamiento), los nombres sin documentar y, para cada producto de datos, su esquema y sus reglas de calidad. El inventario de **Excel** añade una hoja *Conjuntos de datos* y las hojas *Columnas* y *Calidad* cuando tienen filas; la hoja *Conexiones* gana una columna *Latencia* cuando alguna conexión la tiene.
- Desde la consola: `Diagramon.catalog()` (conjuntos declarados y nombres sin documentar, con sus conexiones y nodos), `Diagramon.dataset(idONombre)`, `Diagramon.addDataset({ name, … })` (devuelve el id nuevo, o una cadena vacía si se rechaza), `Diagramon.updateDataset(id, cambios)`, `Diagramon.removeDataset(id)`, `Diagramon.renameDataset(id, nombre)`, `Diagramon.freshness(nombre)` (`{ worst, path, hops, unknownHops, sla, state }`, tiempos en milisegundos), `Diagramon.storage(id)`, `Diagramon.contractYaml(idONombre)` y `Diagramon.contractsYaml()`. Los cambios se pueden deshacer con **`⌘Z`**.
- Los diagramas sin conjuntos ni latencias exportan exactamente igual que antes.

La plantilla *Lakehouse greenfield* trae diez conjuntos: cinco crudos en bronce, *orders*, *customers* y *products* en plata, y *sales_daily* y *customer_360* en oro como productos de datos. *sales_daily* está preparado para no cumplir su SLA de frescura, así que la pestaña **Revisión** muestra un hallazgo alto que conviene revisar.

#### Importar un manifest de dbt

Muchos equipos de lakehouse ya describen sus tablas en dbt. **Importar** (o soltar el archivo en el lienzo) acepta el `target/manifest.json` que escribe `dbt compile` o `dbt build` (esquemas de manifest v10 a v12). Todo ocurre en el navegador: el archivo se lee en local y no se envía a ningún sitio. Un diálogo pequeño pregunta cómo aplicarlo y muestra una vista previa con las cuentas (conjuntos por capa, columnas, reglas de calidad, exposiciones) y los avisos:

- **Fusionar con el catálogo de este diagrama** (por defecto si el diagrama tiene componentes). Los conjuntos se añaden o se actualizan por nombre. Lo que trae dbt reemplaza lo que había (descripción, columnas, reglas de calidad, capa, dominio, responsable, frescura, producto y contrato cuando vienen); lo que dbt no conoce (volumen, fase, consumidores, responsable de datos, un responsable que pusiste tú si dbt no trae ninguno, el formato que elegiste) se conserva, y los conjuntos que no están en dbt no se tocan. No se crea ningún componente ni conexión. El resultado se resume como *N nuevos · M actualizados · K sin cambios*; importar dos veces el mismo archivo no cambia nada la segunda vez.
- **Diagrama nuevo con linaje** (por defecto si el diagrama está vacío). Dibuja un diagrama legible, nunca un componente por modelo: un componente por sistema origen, un almacén por capa (Bronce, Plata, Oro, en grupos marcados con la capa), un componente *dbt* por cada cambio de capa (bronce → plata, plata → oro, y bronce → oro solo si un modelo de oro lee bronce) y uno por exposición. Las conexiones llevan los nombres de los conjuntos, así que el linaje, el catálogo y el control de frescura funcionan: sistema origen a bronce, bronce a dbt (bronce → plata) a plata, plata a dbt (plata → oro) a oro, oro a las exposiciones que lo usan. El título es el nombre del proyecto de dbt. Reemplaza el diagrama actual; **`⌘Z`** lo recupera.

Cómo se traduce dbt al catálogo (lo ajustable está en `datasets.dbt` de `src/config.js`):

| dbt | Diagramon |
|---|---|
| Tabla de fuente, modelo, semilla, instantánea | Un conjunto (nombre = el de la tabla o del modelo; si chocan, la fuente pasa a `source_name__name`). Se omiten las pruebas, los análisis, los modelos efímeros y las versiones antiguas de un modelo |
| Carpeta, prefijo del nombre, fuente, `meta.layer` | Capa: las fuentes son bronce; `staging` / `stg_` e `intermediate` / `int_` son plata; `marts` / `fct_` / `dim_` / `mart_` son oro; manda `meta.layer`. Sin coincidencia: sin capa, se avisa en la vista previa y no se dibuja |
| `description` | Descripción |
| `meta.domain`, el `group` del modelo o la primera carpeta bajo `models/` | Dominio |
| `meta.owner`, si no el dueño del grupo | Responsable (el id del interesado si el nombre coincide con uno, sin distinguir mayúsculas) |
| `access: public` o `meta.data_product: true` | Producto de datos |
| `config.contract.enforced` | Contrato *acordado*, versión de `latest_version` como semver (`2` pasa a `2.0.0`; si no, `1.0.0`) |
| `meta.format` | Formato (por defecto `delta`) |
| Columnas | Esquema: tipo de `data_type`; *llave* con una restricción `primary_key` o con la pareja de pruebas `unique` + `not_null`; *no nula* con `not_null`; *pii* con `meta.pii` o la etiqueta `pii` (el conjunto también recibe la clase *pii*); `meta.classification` y las etiquetas que coinciden con una clase de datos |
| Pruebas | Reglas de calidad: `not_null`, `unique` y `accepted_values` (valores unidos con comas) se traducen directamente; `relationships` pasa a *personalizada* con `→ tabla.campo`; cualquier otra prueba (dbt_utils, singulares…) pasa a *personalizada* con el nombre de la prueba. `error` es alta y `warn` es media |
| `freshness` de la fuente | SLA de frescura de `error_after` (si no, `warn_after`), como `30m`, `12h` o `1d` |
| Exposiciones | Componentes de consumo en el diagrama nuevo y consumidores de los contratos de los conjuntos |

Se aplican los límites del modelo de datos (500 conjuntos, 300 columnas y 100 reglas por conjunto); lo que sobra se deja fuera y se avisa. El archivo puede tener hasta 20 MB y 5.000 objetos. Desde la consola: `Diagramon.importDbt(texto, { mode: 'merge' | 'new' })` lo aplica sin diálogo y devuelve el resumen. Hay un ejemplo en `samples/dbt/`.

## 7. Observaciones de revisión

1. Selecciona un componente y pulsa **⚑ Levantar una observación**.
2. Escribe la **Observación** (qué hay que corregir), **Levantada por**, la **Fecha de levantamiento** (hoy por defecto) y la **Fecha compromiso**.
3. Cuando esté corregida, pulsa **✓ Marcar resuelta**. **Reabrir** la vuelve a abrir; **Quitar** la borra.

El componente lleva una etiqueta: **EN REVISIÓN** (naranja), **VENCIDA** (roja, si pasó la fecha compromiso) o **RESUELTA** (verde).
El panel dice cuántos días faltan o cuántos lleva vencida, y el resumen sobre el lienzo cuenta las abiertas y las vencidas.
Diagramon recuerda el último nombre de revisor. Las exportaciones con leyenda listan las observaciones abiertas con su fecha compromiso.

### Revisión de seguridad automática

Diagramon revisa el diagrama en busca de problemas de seguridad habituales y **solo avisa, nunca bloquea nada**. La pestaña **Revisión** (en el grupo **Gobierno**) lista todos los hallazgos, agrupados por fuente y gravedad; su etiqueta muestra cuántos hay abiertos con el color del peor. El mismo número aparece en la línea sobre el lienzo (*⚑ N hallazgos*) y, en la vista **Seguridad**, cada componente con hallazgos lleva una pastilla *⚠ n*.

| Regla | Gravedad | Salta cuando |
|---|---|---|
| Datos sensibles sin cifrar | crítica | Una conexión marcada *Sin cifrar* lleva PII, PCI, PHI o datos confidenciales |
| Cifrado sin indicar | media | Una conexión lleva datos sensibles pero no se indica si va cifrada |
| Público con datos sensibles | alta | Un componente público guarda datos sensibles |
| Almacén sin respaldo | media | Una base de datos o almacenamiento no tiene componente ni conexión de respaldo |
| Transferencia entre fronteras sin autorizar | alta | Datos sensibles cruzan jurisdicciones sin transferencia autorizada |
| Datos sensibles sin dueño | baja | Un componente con datos sensibles no tiene dueño ni responsable (solo cuando el diagrama ya asigna dueños en algún sitio) |
| Almacén público | alta | Un almacén de datos es público o lo alcanzan directamente usuarios o un servicio externo |

- **La exposición y el respaldo se deducen.** Un componente es *público* si está en un área pública (un grupo con el icono de subred pública de AWS, o llamado *pública*, *DMZ*, *internet*…) o si recibe una conexión de usuarios, una app web o móvil o un servicio externo. Un almacén *tiene respaldo* si está conectado a un componente de respaldo (AWS Backup, Recovery Services, un nombre con *backup*, *respaldo*, *snapshot*, *réplica*…) o por una conexión llamada *backup*, *snapshot*, *réplica*… En el panel del componente, **Seguridad** muestra el valor deducido y por qué; elige **Pública / Interna** o **Sí / No** para anularlo.
- **Descartar** un hallazgo lo oculta: Diagramon pide un motivo breve y lo guarda (con el autor y la fecha) en el diagrama. **Ver descartados (N)** los lista con su motivo y un botón **Restaurar**.
- **Levantar como observación de revisión** convierte el hallazgo en una observación de revisión manual del componente (ver arriba), con el hallazgo como texto.
- Pulsa el objetivo de un hallazgo para seleccionarlo y acercarte a él. Tus observaciones de revisión aparecen en la misma lista (no se descartan: se resuelven en el panel del componente).
- **Exportar CSV** guarda todos los hallazgos, también los descartados, para una hoja de cálculo.
- Desde la consola: `Diagramon.findings({ dismissed: false })`, `Diagramon.dismissFinding(id, motivo)` y `Diagramon.restoreFinding(id)`.

### Mapeo de cumplimiento

Marca qué controles cumple cada componente (ISO 27001, SOC 2, GDPR, HIPAA, PCI DSS) y exporta una matriz componente × control.

1. Selecciona un componente o un grupo y abre la sección **Cumplimiento** del panel (se abre sola cuando hay algún control).
2. Escribe en **Añadir control** para buscar en el catálogo (`iso27001:A.8.24 — Uso de criptografía`) y elige uno. Se añade como **Brecha**: nada cuenta como cumplido hasta que lo confirmes.
3. Pon cada control en **Cumple**, **Parcial**, **Brecha** o **N/A**. La **×** lo quita.
4. Los componentes **heredan** los controles de sus grupos: marca `pcidss:1.3` una vez en el grupo *Pagos* y todo lo que contiene lo recibe. Elegir un estado en un componente sustituye al heredado (la **×** vuelve entonces al valor heredado).
5. Las fichas **Sugeridos** proponen controles según las clases de datos del componente (PII → GDPR Art. 32, 5, 25…; PCI → PCI DSS 3.5, 4.2…; PHI → seguridad en la transmisión de HIPAA…) y para componentes en una conexión entre jurisdicciones (GDPR Art. 44–46). Pulsa una para añadirla como brecha.
6. Con varios componentes seleccionados, la misma sección se aplica a todos.

**Matriz de cumplimiento** (botón de la sección, o **Exportar › Matriz de cumplimiento**): una fila por componente con controles o datos sensibles, una columna por control en uso agrupada por marco, con ✓ cumple, ◐ parcial, ✗ brecha, — N/A y vacío si no está mapeado. La cabecera se queda a la vista al desplazarte; una fila inferior muestra la cobertura de cada control (cumple ÷ componentes que no son N/A) y las tarjetas de arriba resumen cada marco. Elige un marco para acotarla. **CSV** exporta una fila por componente y una columna por control (`met|partial|gap|na|`); **CSV (largo)** una fila por componente × control con marco, control, título, grupo, estado, heredado de y clases de datos (`<diagrama>-compliance.csv`, `<diagrama>-compliance-long.csv`).

Los hallazgos de revisión incluyen un grupo **Cumplimiento**: una brecha es *media* (*alta* para un control de PCI DSS en un componente con datos PCI, o de HIPAA con PHI), un control parcial es *baja*, y un componente con PII, PCI o PHI al que le falta su control principal sugerido (por ejemplo GDPR Art. 32) es *baja*, solo para los marcos que el diagrama ya usa, así que un diagrama sin controles no genera avisos. El **Filtro** tiene una sección **Cumplimiento** (una ficha por marco en uso, más *Con brechas*). Desde la consola: `Diagramon.compliance()` y `Diagramon.exportCompliance('wide' | 'long')`.
El catálogo está en `src/config.js` › `compliance` y es un subconjunto práctico, no las normas completas; los títulos de los controles son paráfrasis cortas. Es una ayuda de documentación, no una auditoría ni una certificación.

### Dueños y responsables

Indica quién responde por cada componente.

1. Selecciona un componente (o un grupo) y abre la sección **Responsables** del panel (se abre sola cuando ya tiene algún valor).
2. Rellena **Dueño**, **Responsable de datos**, **Equipo** y **Centro de costo**. Cada campo sugiere los valores ya usados en el diagrama para que los nombres coincidan.
3. Los componentes **heredan** cada campo del grupo más cercano que lo tenga: pon el equipo una vez en el grupo y todo lo de dentro lo recibe. Un valor heredado aparece en gris con *heredado de <grupo>*; si escribes uno propio, lo sustituye.
4. Con varios componentes seleccionados, los cuatro campos se aplican a todos (*Varios* cuando difieren; vaciar un campo lo borra en todos).

La descripción emergente de un componente muestra dueño, responsable, equipo y centro de costo. El panel **Filtrar** añade fichas de **Equipo**, **Dueño**, **Responsable** y **Centro de costo** (y *Sin asignar* para dueño y equipo). La ficha del documento (**`I`**) lista los **Equipos** con sus dueños y cuántos componentes tienen; al pulsar uno se filtra por él.
La tecla **`8`** abre la vista **Gobierno**: cada componente toma el color de su equipo (o de su dueño si no tiene equipo), lleva debajo una etiqueta con el equipo, y la leyenda y las exportaciones listan todos los equipos. Desde la consola: `Diagramon.owners()` devuelve `[{ team, owners, stewards, nodes }]`.

## Filtros

**Filtrar** (o **`G`**) abre un panel de fichas: **Datos** (cada clase del diagrama, más *Flujos sensibles sin cifrar*), **Revisión**, **Proveedor**, **Categoría**, **Grupo**, **Costo** y, cuando el diagrama los usa, **Equipo**, **Dueño**, **Responsable**, **Centro de costo**, **Región** y **Capa**.
Las fichas de una misma sección suman (O); las secciones distintas se combinan (Y). Lo que no coincide se atenúa, incluidos los grupos vacíos y las conexiones cuyos extremos no coinciden ambos; seleccionar un componente sigue funcionando encima.
Una etiqueta sobre el lienzo muestra el filtro activo (`Filtro: PII · AWS · 7 de 20`) con una **×** para quitarlo. Se recuerda por navegador y nunca altera las exportaciones. Desde la consola: `Diagramon.setFilter({ data: ['pii'], provider: ['aws'] })` y `Diagramon.clearFilter()`.

## 8. Versiones y ambientes

Abre la pestaña **Versiones**.

- **+ Versión N** guarda una foto fija del lienzo. Sirve como historial: *Versión 1*, *Versión 2*…
- **DEV**, **QA** y **PROD** guardan el lienzo como ese ambiente. Cada ambiente tiene una sola copia; al guardar otra vez se actualiza.
- Antes de guardar puedes escribir una **nota**, por ejemplo *antes de la migración*.
- **Abrir** lo carga en el lienzo. Una etiqueta sobre el título muestra qué está abierto y avisa si hay cambios sin guardar.
- **Comparar** marca las diferencias con el lienzo: **verde** es nuevo, **amarillo** cambiado y los fantasmas **rojos punteados** se eliminaron.
  Los tipos de conexión propios se comparan por id (nombre, patrón de línea, color, grosor, puntos en movimiento): la barra de comparación añade *Tipos +1 −0 ~1* y la tarjeta lista cada tipo. Una conexión cuyo tipo cambió de aspecto no se marca como cambiada (su estilo es el mismo); las versiones guardadas antes de los tipos propios no los tienen, así que todos los actuales cuentan como nuevos.
  La tarjeta lista cada diferencia; haz clic en una para ir a ella. **Esc** o **Parar** terminan la comparación.
- Cada tarjeta muestra su **estado**: **Borrador**, **En revisión**, **Aprobado** o **Rechazado**, que también aparece sobre el título y en el cajetín exportado.
- **Nombre de la versión**: en **✎** puedes ponerle a una versión o ambiente un nombre opcional como `1.2`, `2026-T4` o `MVP`. Si parece un número se muestra como *Versión 1.2*, si no tal cual, y un ambiente como *Producción · 1.2*. También alimenta el cajetín.
- **✎** edita el estado, el **autor de la arquitectura**, las fechas de **creación** y **actualización** y la nota, sin tener que borrar y volver a guardar. El último autor que escribiste se propone en las versiones nuevas.
- Sobre la lista, las **fichas de estado** (*Todos*, *Borrador*, *En revisión*…) con su cuenta filtran versiones y ambientes; vuelve a pulsar la activa para verlo todo.
- Al actualizar un ambiente **Aprobado** o **Rechazado**, vuelve a **En revisión**, porque su contenido cambió.
- Actualizar o eliminar una versión o ambiente **Aprobado** pide confirmación antes. Aprobar uno que aún tiene **observaciones de revisión abiertas** en su foto avisa, las lista y conserva el estado anterior si cancelas. Una tarjeta aprobada con observaciones abiertas muestra una marca coral **⚑ observaciones abiertas**.
- Aprobar o rechazar registra **quién decidió y cuándo** (se ve en la tarjeta y en el cajetín exportado). Un rechazo pide un **motivo**, y cada cambio de estado queda en un **historial de estados** que se lee en el formulario de edición.
- Guardar, abrir, eliminar y cada edición se deshacen con **`⌘Z`**.
- Las versiones se guardan dentro del diagrama, así que **Exportar › JSON** las lleva todas.

### Decisiones de arquitectura (ADR)

Abre la pestaña **ADR** para registrar *por qué* la arquitectura es como es, al estilo MADR: **contexto**, **decisión** y **consecuencias**.

- **+ Nueva decisión** agrega una ficha (`ADR-001`, `ADR-002`…). Haz clic para editar su título, **estado** (*Propuesta*, *Aceptada*, *Rechazada*, *Obsoleta*, *Reemplazada*), fecha, decisores y los tres textos. Elegir **Reemplazada por** la marca como *Reemplazada*.
- Vincula la decisión a lo que afecta: **Vincular selección** enlaza los componentes, la conexión o el grupo seleccionados, y **Vincular versión…** una versión guardada. Lo vinculado aparece como fichas; haz clic en una para seleccionarla en el lienzo (o ir a la versión).
- Los paneles de componente, conexión y grupo tienen un campo **Decisiones** con los ADR vinculados, **+ Nueva decisión** (ya vinculada) y **Vincular…** para elegir una existente. Cada tarjeta de versión lista sus ADR y tiene **+ ADR**.
- Los componentes con una decisión *propuesta* o *aceptada* muestran una etiqueta **ADR n** en el lienzo (en las vistas que muestran las marcas de revisión); pasa el cursor para leer los títulos.
- Fichas de estado con su conteo y un buscador filtran la lista. **Exportar Markdown** descarga todas las decisiones en un solo `.md`: una tabla índice y una sección por ADR.
- Cada cambio de estado se anota en un **historial** (fecha, estado, quién —tu nombre de autor— y una nota editable en la última entrada); se ve en la ficha, en el Markdown y en el informe. Las decisiones antiguas muestran una entrada con su estado y fecha actuales.
- Cada versión guarda también una copia de las decisiones. Al **comparar** una versión, la pestaña ADR marca cada decisión como nueva, cambiada (con los campos y el estado anterior → actual) o sin cambios, lista al final las eliminadas, y la barra de comparación suma los ADR. Las versiones guardadas antes de esta función no tienen decisiones y no se marcan. API: `Diagramon.compareDecisions(id)`.
- Una decisión *propuesta* desde hace más de 30 días es un hallazgo bajo en la pestaña **Revisión**.
- **Opciones y criterios.** Abre una decisión y usa **Opciones consideradas** para registrar las alternativas. **+ Criterio** añade una columna (nombre y peso ×1 a ×5, ambos editables); **+ Opción** añade una fila. Puntúa cada opción de 1 (malo) a 5 (excelente) en cada criterio. La columna **Total** es el porcentaje ponderado del máximo, `Σ(peso × puntaje) / Σ(peso × 5)`, sobre los criterios ya puntuados (pasa el cursor para ver cuántos). **★** marca al *líder*: la opción con todos los criterios puntuados y el mayor total (en empate, la primera). **Elegir** marca la opción escogida (**✓ Elegida**); no cambia el estado de la decisión. Haz clic en el nombre de una opción para ver su detalle: título, resumen, a favor, en contra, costo mensual, riesgo y la **versión** que muestra el diagrama de esa opción, con **Comparar con el actual** (inicia la comparación de versiones habitual) y **Mostrar versión**. La matriz se desplaza hacia los lados dentro de la ficha; **⤢ Ampliar** la abre en grande sobre el lienzo, útil para puntuarla con el cliente en una pantalla compartida (**Cerrar** o Esc vuelve). Hasta 12 opciones y 12 criterios por decisión.
- **Área y avance.** El campo **Área** (por ejemplo *Almacenamiento*, *Ingesta*, *Seguridad*) agrupa las decisiones. La pestaña ADR muestra **N de M aceptadas** con una barra de avance y una ficha por área con su conteo de aceptadas/total; haz clic en una para filtrar, junto con las fichas de estado y el buscador.
- **Kits de decisiones.** Si la aplicación incluye un kit (`src/adr-kits.js`, por ejemplo el kit *Data lakehouse · decisiones de un greenfield*), **Añadir kit de decisiones…** los lista. Al elegir uno y confirmar, añade sus decisiones como *Propuesta*, con las opciones (con sus pros y contras ya escritos) y los criterios por defecto, pero sin puntajes. Se omiten las decisiones cuyo título ya existe y el aviso indica cuántas se añadieron y cuántas se omitieron. Todo el kit es un solo paso de deshacer. Los vínculos a componentes que no existen en tu diagrama se descartan. API: `Diagramon.decisionKits()`, `Diagramon.addDecisionKit(id)`, `Diagramon.adrScore(idDecisión)`.
- Dos hallazgos bajos más en la pestaña **Revisión**: una decisión *aceptada* con dos o más opciones y sin elegida, y una opción elegida que no es la líder cuando todas las opciones están completamente puntuadas (explica el porqué en *Decisión*, o descártalo).
- Al comparar versiones, la ficha también lista los cambios de opciones, criterios y elegida (por ejemplo *Opción cambiada: Delta (puntajes)*, *Elegida: A → B*). **Exportar Markdown** y el **informe** agregan, por cada decisión con opciones, la matriz (criterios con pesos × opciones, total, ✓ y ★) y el resumen, costo, riesgo, pros y contras de cada opción; el Área aparece en la tabla de la lista, y la hoja *Decisiones* de Excel suma las columnas *Área* y *Opción elegida* cuando se usan.
- Las decisiones son del documento, no de una versión: abrir una versión no las toca, la pestaña *Texto* las escribe como bloques `adr` (borrar un bloque ahí borra la decisión) y se guardan en **Exportar › JSON** bajo `decisions`. Todo se puede deshacer con **`⌘Z`**.
- Desde la consola: `Diagramon.decisions()`, `Diagramon.addDecision({ title, status, context, decision, consequences, links: { nodes: [...] } })`, `Diagramon.updateDecision(id, cambios)`, `Diagramon.removeDecision(id)` y `Diagramon.exportDecisions()`.

### Requisitos y trazabilidad

La pestaña **Requisitos** registra *lo que necesita el cliente*, para que cada decisión y componente pueda rastrearse hasta una razón. Los requisitos son del documento, como las decisiones: abrir una versión no los toca, la pestaña *Texto* los escribe como líneas `req` y **Exportar › JSON** los guarda bajo `requirements` (la clave no existe mientras no haya ninguno).

- **+ Nuevo requisito** agrega una ficha (`REQ-001`, `REQ-002`…) con **título**, **tipo** (*Impulsor*, *Calidad (RNF)*, *Restricción*, *Principio*), **prioridad** (*Debe*, *Debería*, *Podría*), **estado** (*Borrador*, *Acordado*, *Descartado*), **fuente** (quién lo pidió) y **detalle**. Fichas por tipo, estado y prioridad, y un buscador, filtran la lista. La cabecera muestra **N acordados · X cubiertos · Y controles cumplen**.
- **Vincúlalo** a lo que lo cumple: **Vincular selección** (componentes, una conexión o un grupo) y **Vincular decisión…**. Un requisito está **cubierto** cuando enlaza una decisión *aceptada* o al menos un componente, conexión o grupo; cada ficha lo dice (*Cubierto por ADR-003 (aceptada), 2 componentes*). Las fichas ADR listan *Aborda: REQ-001 …* y los paneles de componente, conexión y grupo listan sus requisitos; haz clic en una ficha para abrirlo en su pestaña.
- **Controles** (funciones de aptitud). Dale a un requisito un **Control** y la aplicación lo evalúa con lo que ya calcula, pero solo mientras el requisito está *Acordado*. La insignia muestra ✓ cumple, ✗ no cumple o ? desconocido; pasa el cursor para ver el valor real frente al objetivo.
  - *Disponibilidad*: la disponibilidad compuesta de la ruta **desde** un componente **hasta** otro alcanza el porcentaje objetivo (define antes los SLA de los componentes).
  - *RPO* / *RTO*: el peor RPO / RTO de esa ruta no supera el objetivo, en horas.
  - *Costo*: el costo mensual total del diagrama no supera el objetivo.
  - *Cifrado*: toda conexión que lleva una clase de datos está marcada como cifrada; se listan las que fallan.
  - *Residencia*: ninguna conexión que cruza fronteras sin aprobar lleva una clase de datos sensible fuera de una jurisdicción (define antes las regiones de los componentes).
  - *Frescura*: la frescura de extremo a extremo de un conjunto (la suma de las latencias de las conexiones de su camino más lento, ver *Catálogo de datos y contratos de datos*) no supera el objetivo en horas.
  Si faltan parámetros o no son válidos, el resultado es *desconocido* con el motivo.
- **Hallazgos de revisión** (fuente *Requisitos*): un requisito *Acordado* **Debe** (medio) o **Debería** (bajo) sin decisión aceptada ni componente vinculado, y un requisito *Acordado* cuyo control falla (alto si es *Debe*, medio en los demás casos).
- **Matriz** cambia la pestaña a una **matriz de trazabilidad**: una fila por requisito, una columna por decisión, ✓ donde están vinculados y las decisiones *aceptadas* resaltadas en verde. Haz clic en una celda para vincular o desvincular; **⤢ Ampliar** la abre en grande sobre el lienzo (**Cerrar** o Esc vuelve).
- El **informe** tiene una sección *Requisitos y trazabilidad* (id, título, tipo, prioridad, estado, cubierto por, resultado del control) y el inventario de **Excel** una hoja *Requisitos*. La plantilla *Lakehouse greenfield* arranca con ocho requisitos en *Borrador*, vinculados a sus decisiones y componentes, para afinar y acordar con el cliente.
- Desde la consola: `Diagramon.requirements()`, `Diagramon.addRequirement({ title, kind, priority, status, check: { metric: 'residency', cls: 'pii', jur: 'eu' }, links: { decisions: ['ADR-005'] } })`, `Diagramon.updateRequirement(id, cambios)`, `Diagramon.removeRequirement(id)` y `Diagramon.checkRequirement(id)` (devuelve `{ state, actual, detail }`). Todo se puede deshacer con **`⌘Z`**.

### Registro RAID (riesgos, supuestos, problemas, dependencias)

Abre la pestaña **RAID** para anotar *qué podría salir mal y qué estamos suponiendo*, junto al diagrama (*qué*) y las ADR (*por qué*). Hay cuatro tipos de item, cada uno con su id: **Riesgo** (`R-001`), **Supuesto** (`A-001`), **Problema** (`I-001`) y **Dependencia** (`D-001`). Usa **+ Riesgo**, **+ Supuesto**, **+ Problema** o **+ Dependencia**; haz clic en una ficha para editarla.

- **Todos los items**: título, detalle, dueño, fecha de *registro* y vínculos. Los **riesgos** añaden *probabilidad* e *impacto* (de 1 a 5; el puntaje es probabilidad × impacto, 15 o más es alto, de 8 a 14 medio), una **mitigación** y un estado (*Abierto* / *Cerrado*). Los **supuestos** tienen una **validación** (*Pendiente*, *Validado*, *Invalidado*) y una fecha *validar antes de*. Los **problemas** y las **dependencias** tienen un estado y una fecha *necesario para*.
- **Supuestos**: los botones **✓ Validado** y **✗ Invalidado** anotan la fecha y quién (tu nombre de autor) en un pequeño **historial de validación**; cambiar el selector de validación hace lo mismo.
- **Vínculos**: **Vincular selección** enlaza los componentes, la conexión o el grupo seleccionados, **Vincular decisión…** una ADR y **Vincular requisito…** un requisito (cuando el diagrama los tiene). Los vínculos a lo que borres desaparecen solos. Lo enlazado aparece como chips; haz clic en uno para ir a él.
- **Dónde aparece**: las fichas de una ADR y de un requisito listan los items que las enlazan (*Supuestos y riesgos*), y los paneles de componente, conexión y grupo muestran una fila *Riesgos y supuestos* cuando algo los enlaza; haz clic en un chip para abrir el item en la pestaña RAID. Si un **supuesto invalidado** sostiene una decisión *propuesta* o *aceptada*, la ficha de la ADR muestra un aviso rojo, con **Reabrir decisión** en las aceptadas: la devuelve a *Propuesta* y escribe *Supuesto A-002 invalidado* en su historial.
- **Filtros**: Riesgos / Supuestos / Problemas / Dependencias / Todos, un filtro de estado y una búsqueda. Con **Riesgos** seleccionado, un **mapa de calor** de 5 × 5 (probabilidad en horizontal, impacto en vertical) muestra la cuenta por celda, en color bajo / medio / alto; haz clic en una celda para filtrar la lista. La cabecera resume, por ejemplo, *3 riesgos abiertos (1 alto) · 2 supuestos por validar · 1 vencido*.
- **Hallazgos** (pestaña Revisión, fuente *Riesgos y supuestos*): **alto** cuando un supuesto invalidado sostiene una decisión propuesta o aceptada (*ADR-003 se apoya en el supuesto A-002, que se invalidó*, corrección: revisa la decisión); **medio** para un supuesto pendiente que pasó su fecha *validar antes de* (lo indica si hay una decisión aceptada que depende de él) y para un problema o dependencia abiertos que pasaron su fecha *necesario para*; un riesgo abierto con puntaje 15 o más es **alto** sin mitigación y **bajo** con ella (sigue visible).
- **Exportar**: el **informe** tiene una sección *Riesgos, supuestos, problemas y dependencias* (resumen, tabla del mapa de calor y una tabla por tipo), el inventario **Excel** tiene una hoja *RAID*, y **Exportar › JSON** guarda el registro en `raid`. La pestaña *Texto* lo escribe como líneas `riesgo`, `supuesto`, `problema` y `dependencia` (ver la guía del formato de texto). Los diagramas sin registro se exportan exactamente igual que antes.
- El registro pertenece al documento, no a una versión: abrir una versión lo conserva. Todo se puede deshacer con **`⌘Z`**. La plantilla **Lakehouse greenfield** trae siete items (cuatro supuestos, dos riesgos, una dependencia) enlazados a sus ADR y componentes.
- Desde la consola: `Diagramon.raid()`, `Diagramon.addRaid({ type, title, ... })`, `Diagramon.updateRaid(id, cambios)`, `Diagramon.removeRaid(id)` y `Diagramon.validateAssumption(id, true | false)`.

### Interesados, RACI y aprobaciones

Abre la pestaña **Interesados** (en el grupo **Gobierno**) para anotar a quienes deciden en el proyecto (arquitecto, CISO, dueño del dato, FinOps…) y qué aprueba cada uno. Cada interesado es una ficha con nombre, rol y una **organización** (*Cliente*, *Socio* o *Interno*), que se muestra como una pastilla de color. Usa **+ Interesado**, haz clic en una ficha para editarla, y el resumen cuenta los interesados y las áreas de decisión sin aprobador.

- **Marcas de la ficha**: **Aprueba versiones** hace al interesado aprobador obligatorio de cada versión guardada. **Inactivo** (*dejó el proyecto*) significa que ya no se le exige nunca, pero sus firmas se conservan en el historial.
- **Borrar** pide confirmación. Un interesado con firmas no se puede borrar, para que el historial de aprobaciones quede íntegro: el diálogo ofrece **Marcar inactivo** en su lugar.
- **Matriz RACI**: una fila por interesado y una columna por área de decisión: **Todas las áreas** (la columna `*`, que vale para cada área) y cada área usada por una decisión o por la propia matriz. Cada celda es un selector con *–*, **R** (responsable), **A** (aprueba: accountable), **C** (consultado) o **I** (informado). Un **⚠** en el encabezado de una columna indica que esa área no tiene una **A** activa; al pasar el cursor dice *Sin aprobador para esta área*. La matriz se desplaza a los lados dentro de su recuadro; **⤢ Ampliar** la abre en una ventana grande sobre el lienzo (**Cerrar** o Esc vuelve).
- **Aprobadores requeridos**: para una decisión, los interesados activos con **A** en su área o en **Todas las áreas** (una decisión sin área solo necesita a los aprobadores de *Todas las áreas*). Para una versión, los interesados activos con **Aprueba versiones**. A nadie más se le pide, y un área sin ningún aprobador genera un hallazgo de revisión (ver abajo).
- **Aprobaciones en las fichas**: la ficha de una ADR y la de una versión tienen una sección **Aprobaciones**, con una fila por aprobador requerido: nombre, rol, un estado (*Pendiente*, o ✓ *Aprobó* / ✗ *Rechazó* con la fecha) y los botones **Aprobar** y **Rechazar**. El campo **nota de la firma** que está bajo las filas lo usa la siguiente firma. El encabezado muestra *2 de 3 aprobaciones*, y el historial de firmas queda plegado debajo (*Historial de firmas (n)*). En la ficha de una ADR, la sección también avisa (⚠, sin bloquear) cuando un supuesto enlazado invalidado o vencido, o un requisito enlazado cuyo control falla, sostiene la decisión.
- **Rondas de revisión**: solo cuentan las firmas de la ronda actual. En una decisión, la ronda empieza en su última entrada *Propuesta* del historial; en una versión, empieza cuando la versión pasó por última vez a *En revisión*. Dentro de una ronda manda la última firma de cada aprobador, así que puede cambiar de opinión volviendo a firmar.
- **Compuertas**: cuando una ADR pasa a *Aceptada*, o una versión a *Aprobada*, con aprobaciones requeridas que faltan, la app pregunta antes: *Faltan aprobaciones: X, Y. ¿Aceptar de todos modos?* (o *¿Aprobar esta versión de todos modos?*). **Continuar de todos modos** lo registra, y la nota del historial dice *Aceptada sin la aprobación de X, Y*. Una versión que queda completa rellena su campo *Aprobado por* con los nombres de quienes aprobaron, si estaba vacío. La API (`updateDecision`) nunca pregunta, pero añade la misma nota.
- **Hallazgos** (pestaña Revisión, fuente *Aprobaciones*): **bajo** para un área de decisión sin aprobador (*Nadie aprueba las decisiones de «Seguridad»*, arreglo: asignar una **A** a un interesado para esta área); **medio** para una decisión aceptada con aprobaciones que faltan, y para una versión aprobada con aprobaciones que faltan; **alto** cuando la última firma de un aprobador requerido es un rechazo en una decisión propuesta o aceptada (arreglo: atender la objeción y pedir una nueva firma, o cambiar el estado).
- **Texto e historial**: la pestaña *Texto* escribe los interesados como líneas `interesado` y las firmas de las decisiones como el campo `firmas:` (ver la guía del formato de texto). La comparación de ADR entre versiones lista las firmas añadidas o cambiadas (por ejemplo *SH-002 aprobó*).
- **Informe y Excel**: el **informe** tiene una sección *Interesados, RACI y aprobaciones* (los interesados, la matriz RACI y las aprobaciones de cada decisión y versión con los nombres pendientes y rechazados), y el inventario de **Excel** tiene una hoja *Interesados* (RACI como `área:letra; …`) y una hoja *Firmas* (una fila por firma). Ambas hojas aparecen solo cuando hay datos. Los diagramas sin interesados se exportan exactamente igual que antes.
- Los interesados pertenecen al documento, no a una versión: abrir una versión los conserva, y las firmas quedan con las decisiones y versiones a las que se dieron. Todo se puede deshacer con **`⌘Z`**.
- Desde la consola: `Diagramon.stakeholders()`, `Diagramon.addStakeholder({ name, role, org, raci: { '*': 'C', Seguridad: 'A' }, versions: true })`, `Diagramon.updateStakeholder(id, cambios)`, `Diagramon.removeStakeholder(id)` (se rechaza si el interesado tiene firmas), `Diagramon.signoff(kind, id, stakeholderId, verdict, note?)` (kind `decision` o `version`, verdict `approve` o `reject`, con la fecha de hoy) y `Diagramon.approval(kind, id)` (devuelve los ids requeridos, aprobados, rechazados y pendientes, `complete` y las firmas).

### Arquitectura por fases

Un greenfield no se construye de golpe. Planifica la construcción en **fases**: una lista ordenada de etapas (*MVP*, *Ola 1*, *Ola 2*…), cada una con un nombre, una **fecha** opcional (`2026-12` o `2026-12-15`) y un **objetivo** opcional (*Qué tiene el cliente al terminar esta fase*). El orden de la lista es la línea de tiempo; hasta 12 fases.

- **Gestor de fases**: arriba de la pestaña **Versiones**, encima de la lista de versiones. **+ Añadir fase** agrega una (se llama *Fase N*; renómbrala en su lugar). Cada fila tiene el nombre, la fecha, el objetivo, **↑** y **↓** (*Mover antes* / *Mover después*) y **✕** (*Eliminar fase*). El contador **+a · −r** muestra cuántos componentes entran y salen en esa fase, comparado con la anterior.
- **Eliminar** pide confirmación y pasa los elementos de la fase a la anterior (o a *siempre presentes* si era la primera). Un componente que se retiraba en la fase eliminada se retira en la siguiente, o deja de retirarse.
- **Fase y Se retira en**: cada componente, conexión y grupo puede decir en qué fase **aparece** (**Fase**) y, si es temporal, desde qué fase se **retira** (**Se retira en**). Una *Fase* vacía significa *siempre (desde el inicio)*; *Se retira en* ofrece solo las fases posteriores a la elegida. Se pueden cambiar varios elementos seleccionados a la vez; con valores distintos, el selector muestra *Varios*.
- **Componentes nuevos** creados con una fase elegida reciben esa fase (en la primera fase simplemente están desde el inicio).
- **Barra de fases** (abajo a la izquierda del lienzo, si el diagrama tiene fases): **Todas** y un chip por fase, con su fecha. Haz clic en un chip, o pulsa **`[`** y **`]`** para la fase anterior y la siguiente (no mientras escribes). **Todas** muestra todo.
- **Mostrar lo futuro atenuado** (activado por defecto): lo que aún no existe en la fase elegida se dibuja atenuado y punteado en vez de ocultarse; desactívalo para ocultarlo. Lo retirado por la fase elegida se oculta. Los fantasmas se pueden seleccionar y editar, así que puedes asignarles una fase desde el lienzo.
- Una insignia **NUEVO** marca los componentes que aparecen justo en la fase elegida.
- La línea de resumen del lienzo indica la fase, por ejemplo *Fase: Ola 1 · 14 componentes · ≈ $4,200/mes* (el costo solo si hay).
- Las **versiones** guardan las fases junto con los elementos, así que cada versión lleva su propio plan. Las exportaciones **SVG** y **PNG** muestran la fase elegida tal como se ve en pantalla (con los fantasmas o los elementos ocultos); la exportación **JSON** conserva `phases`, y la pestaña Texto las escribe (ver la guía del formato de texto).
- **Excel**: las hojas Componentes y Conexiones reciben las columnas **Fase** y **Se retira en**, y una hoja **Fases** tiene una fila por fase: ID, nombre, fecha, objetivo, componentes, nuevos, retirados y total mensual. Solo los diagramas con fases las tienen.
- Desde la consola: `Diagramon.phases()`, `addPhase({ name, date, goal })` (devuelve el id nuevo), `updatePhase(id, patch)`, `removePhase(id)`, `setPhase(i | id | null)` (la fase mostrada; `null` = Todas), `Diagramon.phase` (el índice mostrado, `-1` = Todas), `phaseModel(i)` (una copia del diagrama tal como está en la fase `i`) y `phaseStats(i)` (componentes, conexiones, costo mensual y hallazgos abiertos de esa fase).

### Disposición de migración (6R)

Indica qué se hace con cada componente al migrar la arquitectura: **Retener**, **Rehospedar**, **Replataformar**, **Refactorizar**, **Recomprar** o **Retirar**.

- Selecciona un componente (o varios). En **Migración (6R)** elige uno de los botones; *Ninguna* la quita. Pasa el puntero por un botón para ver su significado en una línea.
- El componente muestra una pastilla abajo a la derecha con sus iniciales (*RH* para rehospedar). Se oculta en las vistas **Contexto**, **Seguridad** y **Física**.
- El filtro **Migración (6R)** de las lentes atenúa todo lo que tenga otra disposición (o ninguna).
- La tabla comparativa de fases gana una columna **6R** con el reparto de cada fase, por ejemplo *RH 3 · RT 1*. Fases y 6R dicen cosas distintas: la fase dice *cuándo*, la disposición dice *qué*.
- El panel **Revisión** tiene una fuente *Migración* con tres avisos, todos de severidad baja y descartables: un componente por retirar que ninguna fase retira, un componente marcado retener, rehospedar o replataformar que una fase retira y (apagado por defecto) un componente por recomprar o refactorizar sin una decisión enlazada.
- El **informe** tiene una sección *Estrategia de migración (6R)* (recuentos, y cada componente con las fases en que aparece y en que se retira); el inventario **Excel** y CSV gana una columna *Migración (6R)*; al comparar versiones sale la disposición cambiada. Los diagramas que no la usan se exportan exactamente igual que antes.
- En la pestaña *Texto*: `app: Facturación disposición=rehospedar` (en inglés: `disposition=rehost`). JSON: `"disposition": "rehost"`.
- Los valores, colores, iniciales y avisos están en `src/config.js › migration`; la séptima R, *Reubicar*, está ahí y viene apagada.

### Radar tecnológico y fin de soporte

Mantén una lista de qué productos se aceptan y cuáles van de salida, y míralo sobre el diagrama. Cada entrada dice cómo reconocer un producto (por **icono**, **tipo** o **texto** en el nombre o el subtítulo), su **anillo** (**Adoptar**, **Probar**, **En pausa** o **Retirar**) y, si quieres, la fecha de **fin de soporte**, un sustituto y una nota.

- Las entradas viven en `src/config.js › techRadar.entries` (vacía por defecto, con ejemplos comentados), y un diagrama puede añadir las suyas en una lista `radar` del JSON (misma forma; el mismo `id` reemplaza al de `config.js`). Gana la primera entrada que coincida, y todos los campos que pongas en `match` deben coincidir.
- Selecciona un componente. En **Radar tecnológico**, deja *Automático* para usar las reglas de coincidencia, elige una entrada para fijarlo o *Fuera del radar* para excluirlo. La línea de abajo muestra el anillo, el fin de soporte, el sustituto y la nota.
- En el lienzo aparece una etiqueta arriba a la izquierda solo cuando algo pide atención: *HOLD*, *RETIRE* o *EOL* cuando el soporte ya terminó o termina dentro de `warnMonths` (6 por defecto). Pasa el puntero para ver el detalle.
- El filtro **Radar tecnológico** de las lentes tiene *Requiere atención*, una ficha por anillo en uso y *Fuera del radar*.
- El panel **Revisión** tiene una fuente *Radar tecnológico*: soporte ya terminado y anillo *Retirar* (alta), soporte que termina pronto y un componente que sigue en una fase con fecha posterior al fin de su soporte (media), una fase que incorpora un componente en *En pausa* (baja), y un componente en *Retirar* que la 6R marca como *Retener* (media). Solo avisan, se pueden descartar, y cada regla se apaga o se recalifica en `techRadar.rules`.
- El **informe** tiene una sección *Radar tecnológico* (componentes por anillo, y cada componente reconocido con su producto, anillo, fin de soporte y sustituto); el inventario **Excel** y CSV gana las columnas *Radar tecnológico* y *Fin de soporte* cuando algún componente coincide.
- En la pestaña *Texto*: `db: Core radar=oracle11` fija un componente a una entrada y `radar=none` lo excluye. Las entradas se guardan en el JSON y no se pierden al editar el texto.
- Las fechas se comparan con la de hoy, así que los avisos cambian con el tiempo.

## 9. Notas adhesivas y zonas de riesgo

Usa los dos botones junto al zoom (abajo a la derecha del lienzo).
- **Añadir una nota adhesiva** pone una nota en el centro de la vista. Haz doble clic (o usa el panel) para escribir.
- **Añadir una zona de riesgo** dibuja un área rayada y con borde discontinuo bajo los grupos, con una etiqueta como `⚠ ALTA · Subred pública expuesta`. Elige su **Severidad** (*Baja, Media, Alta, Crítica*) y una descripción opcional en el panel.
- Selecciona varios componentes y pulsa **⚠ Marcar como zona de riesgo** para dibujar una zona alrededor.
- Arrastra para mover, arrastra el tirador de la esquina para cambiar el tamaño (se ajusta a la cuadrícula), **`⌘D`** duplica y **Supr** elimina. Todo se puede deshacer.
- El resumen sobre el lienzo cuenta las zonas (*⚠ 2 zonas de riesgo (1 crítica)*), las exportaciones con leyenda las listan por severidad, y las versiones y el JSON conservan notas y zonas.

### Modelado de amenazas (STRIDE)

Algunas zonas son **fronteras de confianza** en vez de zonas de riesgo: abre una zona y cambia **Tipo** a *Frontera de confianza* (o selecciona componentes y pulsa **Frontera de confianza**, junto a *Marcar como zona de riesgo*). Una frontera tiene nombre, un **Nivel de confianza** opcional (*Internet, DMZ, Interna, Restringida*…) y una descripción. Se dibuja con una línea discontinua gruesa, sin rayado, y una etiqueta como `FRONTERA DE CONFIANZA · DMZ` con un escudo; la leyenda y la ficha del documento listan las fronteras aparte de las zonas de riesgo.
- Un componente está dentro de una frontera cuando su centro cae dentro de la zona. Las zonas pueden anidarse o solaparse. Una conexión **cruza** una frontera cuando sus dos extremos no están en el mismo conjunto de fronteras.
- Selecciona una conexión que cruza: la sección **Amenazas (STRIDE)** muestra *Cruza: ‹Internet› → ‹DMZ›* y una sugerencia por categoría (**S**uplantación, manipulación (**T**ampering), **R**epudio, divulgación de **I**nformación, **D**enegación de servicio, **E**levación de privilegios) con una severidad según reglas sencillas (cifrado, datos sensibles, dirección entrante, destino que es un almacén de datos o de identidad).
- Decide cada una: **Abierta · Mitigada · Aceptada · No aplica**, con una nota (qué hiciste o por qué). Solo se guardan las decisiones y todo se puede deshacer. Las amenazas abiertas aparecen como hallazgos en *Amenazas STRIDE*.
- En la vista **Seguridad** las conexiones que cruzan llevan una pastilla `STRIDE n` (n = amenazas abiertas). **Exportar › Modelo de amenazas (CSV)** escribe una fila por conexión que cruza y categoría (`<diagrama>-stride.csv`).
- Desde la consola: `Diagramon.threats()` devuelve `[{ edge, from, to, zones, category, severity, status, note }]` y `Diagramon.exportThreats()` descarga el CSV.

## 10. Presentar y exportar

- **Flujo** (o **`P`**) ilumina el diagrama paso a paso, de los clientes a los datos. Las conexiones bidireccionales se siguen en los dos sentidos.
- **Presentar** (o **`V`**) pasa a pantalla completa sin paneles: una vista general con el título, una diapositiva por grupo (en orden de lectura, acercando y atenuando el resto) y una vista general final. Sin grupos, recorre el flujo. **`→`**, **`Espacio`** o clic avanzan, **`←`** retrocede, **`Inicio`/`Fin`** y las teclas numéricas saltan, **`P`** reproduce el flujo y **`Esc`** sale y restaura tu vista. La edición se desactiva mientras presentas.
- **Ordenar** recoloca todo automáticamente, siguiendo el flujo. Cada grupo se ordena dentro de su propia caja, así los grupos nunca se pisan. **Ajustar** (o **`F`**) centra el diagrama.
- **Ángulos** (o **`E`**) cambia las conexiones entre curvas y líneas en ángulo recto que esquivan los nodos. Varias líneas en el mismo lado de un nodo salen de puntos separados y repartidos, para que no se solapen.
  Para cambiar una sola conexión, selecciónala y elige su **Línea**.
- **Exportar** › SVG, PNG o JSON. Guarda el JSON para volver a abrirlo más tarde con **Importar**.
  El JSON empieza con `formatVersion`, el número del formato del archivo. Los archivos guardados antes de que existiera el campo se abren como siempre y se actualizan al abrirlos, versiones guardadas incluidas. Un archivo con un formato *más nuevo* que tu copia de Diagramon se abre igual, con un aviso: lo que tu versión no conoce se perderá si lo guardas. (No es el campo *Versión* del cajetín, que es la versión del propio documento.)
- **Exportar › Mermaid, PlantUML o draw.io** convierte el diagrama en código o en un archivo para otras herramientas: un flowchart de Mermaid (se ve en GitHub, GitLab y Notion), un diagrama de PlantUML sin inclusiones externas, o un `.drawio` que conserva la misma disposición, los grupos anidados y los iconos oficiales. También se exportan las notas, las zonas de riesgo y las fronteras de confianza; los componentes con diagrama interno se convierten en cajas anidadas (Mermaid, PlantUML) o en una página por nivel enlazada desde el componente (draw.io), y dueños, región, capa, clases de datos, SLA, costo, cumplimiento y decisiones STRIDE viajan como metadatos (comentarios en Mermaid y PlantUML, campos de *Edit Data* y descripciones emergentes en draw.io). Las decisiones de arquitectura (ADR) salen como comentarios (Mermaid, PlantUML) o como una última página «Decisiones de arquitectura» (draw.io), los componentes enlazados llevan `adrs=ADR-001,…` y los hallazgos descartados viajan como comentarios o atributos `dismissed` en su objetivo.
- **Exportar › HTML cifrado** crea un único `.html` para compartir un diagrama en privado. Quien lo recibe le da doble clic, escribe la contraseña y ve el diagrama (oscuro o claro, con zoom). Sin la app, sin instalar ni descargar nada. Detalles más abajo.
- El menú **Exportar** también tiene **Leyenda y cajetín** (activado por defecto), con los campos **Autor** y **Versión**.
  Los archivos SVG y PNG llevan entonces un panel abajo con solo lo que usa el diagrama (estilos de conexión, candados,
  colores de los componentes, clasificaciones de datos) y un cajetín con título, autor, versión, fecha y costo estimado.

### Informe de arquitectura

**Exportar › Informe de arquitectura…** genera el documento que piden los comités de arquitectura, sin bibliotecas y sin red:

- **Formato**: **PDF** (abre el diálogo de impresión del navegador con un documento A4 listo para imprimir: elige *Guardar como PDF*), **Markdown** (`.md`) o **HTML** (`.html`, un único archivo autocontenido, el mismo documento que el PDF y sin peticiones externas).
- **Secciones** (todas activas por defecto, se recuerdan): Resumen · Diagrama · Componentes · Conexiones · Clasificación y residencia de datos · Dueños · Capas del data lake · Costos · Hallazgos de seguridad · Cumplimiento · Modelo de amenazas · Decisiones (ADR) · Riesgos, supuestos, problemas y dependencias · Interesados, RACI y aprobaciones · Historial de versiones · Notas y zonas de riesgo. Una sección sin datos se omite y aparece como *(ninguno)*.
- **Sección Cumplimiento**: por marco, una tabla de controles con sus conteos y cobertura, seguida de una rejilla real: una fila por componente, una columna por control (fila de marcos que abarca sus controles y luego los ids), con ✓ cumple, ◐ parcial, ✗ brecha, — N/A y un color por estado; un control heredado de un grupo lleva ↑ (cursiva en HTML) y una celda vacía significa sin mapear. Con más de 10 controles en uso la rejilla se divide en una tabla por marco para que quepa en A4. En Markdown cada rejilla es una tabla con los mismos símbolos y una línea de leyenda debajo.
- **Conexiones**: estilo (los tipos propios con su nombre) y cruce de fronteras; la columna *Importancia* solo aparece si alguna conexión es Importante o Crítica (los informes de diagramas sin importancia no cambian) y, si el diagrama tiene tipos propios, sigue una tabla *Tipos de conexión*.
- **Diagrama**: elige cuáles de las 9 vistas incluir (la activa, más Seguridad y Datos cuando aportan algo). Si el diagrama tiene diagramas internos (niveles C4), **Incluir diagramas internos** dibuja cada uno. Las imágenes usan el tema claro por defecto (ideal para imprimir); **Usar el tema actual** mantiene el de la pantalla.
- **Imágenes en Markdown**: van incrustadas como PNG `data:`. Algunos visores de Markdown las bloquean, así que marca **Guardar las imágenes como archivos aparte** para descargar los PNG junto al `.md` y referenciarlos por nombre.
- Los textos salen en el idioma actual de la interfaz, con fechas y dinero en sus formatos, y todo va escapado.
- Desde la consola: `Diagramon.exportReport({ format: 'pdf' | 'md' | 'html', sections?: [...], views?: [...], scopes?: true | false, theme?: 'light' | 'current', separateImages?: boolean })` devuelve una promesa con el HTML o Markdown generado tras iniciar la descarga o el diálogo de impresión. Claves de sección: `summary diagram components connections data owners layers costs findings compliance threats decisions raid approvals versions notes`.

### Inventario (CSV / Excel)

**Exportar › Inventario (Excel)** e **Inventario (CSV)…** convierten el diagrama en una tabla para una CMDB o una auditoría, sin conexión y sin librerías.

- **Componentes** (una fila por componente, todos los niveles C4): ID, nombre, detalle, tipo, proveedor, servicio, categoría, tipo C4 y ruta de nivel, ruta de grupos, dueño, responsable de datos, equipo y centro de costo (el valor efectivo, más una columna *Heredado de* cuando lo aporta un grupo), región y jurisdicción, clases de datos, sensible (sí/no), capa del data lake, exposición y respaldo (efectivos), conexiones cifradas entrantes y salientes, conexiones sensibles sin cifrar, SLA, RPO, RTO, réplicas, costo como se ingresó, periodo, costo por mes y por año, estado de revisión, hallazgos abiertos, ADR vinculados, un resumen de cumplimiento (por ejemplo *ISO 27001: 3 cumple / 1 brecha*) y la descripción.
- **Excel** (`.xlsx`) trae una hoja por tabla: Componentes, Conexiones (estilo con el nombre del tipo propio, importancia Normal / Importante / Crítica, tipo propio sí/no, cifrado, clases de datos, datasets, cruza fronteras, transferencia aprobada, amenazas STRIDE abiertas), Tipos de conexión (solo si el diagrama tiene tipos propios: id, nombre, patrón de línea, color, grosor, puntos en movimiento y cuántas conexiones lo usan), Grupos, Dueños (por equipo), Decisiones, RAID, Interesados y Firmas (una fila por firma), Hallazgos (con los descartados y su motivo) y Versiones. Las tablas vacías se omiten. Las columnas *Importancia* y *Tipo propio* siempre están en Conexiones (esquema estable, también en diagramas viejos). La fila de títulos va en negrita, inmovilizada y con filtro; las columnas se ajustan al contenido, los costos usan formato de moneda y el SLA conserva tres decimales.
- **CSV** abre un diálogo pequeño: *Solo componentes* (`<diagrama>-inventory.csv`) o *Todas las tablas como CSV separados* (una descarga por tabla, con nombre `<diagrama>-inventory-<tabla>.csv`). Los archivos llevan BOM para que Excel respete las tildes.
- Desde la consola: `Diagramon.inventory()` devuelve las filas de componentes y `Diagramon.exportInventory('xlsx' | 'csv' | 'csv-all')` inicia la descarga.

## Vistas

Una **vista** es una forma de mirar el mismo diagrama: solo decide qué se ve, con cuánto detalle y qué destaca. Nunca cambia tus componentes ni posiciones. Elígela en el selector **Vista** de la barra superior, con las teclas **`1`**–**`9`**, o desde la consola (`Diagramon.setView('security')`). Cuando la vista no es *Completa*, una pastilla sobre el lienzo la nombra, cuenta lo que oculta o atenúa y tiene una **×** para volver. La ficha del documento y la leyenda de las exportaciones siguen la vista activa.

| Tecla | Vista | Qué ves |
|---|---|---|
| `1` | **Completa** | Todo: componentes, grupos, etiquetas, marcas, costos, zonas y notas |
| `2` | **Contexto** | Grupos de primer nivel como cajas cerradas con flujos combinados entre ellas (solo lectura; doble clic en una caja la abre en Completa) |
| `3` | **Lógica** | Servicios y flujos sin los grupos físicos (VPC, subredes, regiones, cuentas…) |
| `4` | **Física** | Dónde corre cada cosa: todos los grupos y zonas de riesgo, sin etiquetas de conexión |
| `5` | **Seguridad** | Datos sensibles y cifrado en tránsito resaltados (sin cifrar, o sin indicar, con datos sensibles); el resto se atenúa |
| `6` | **Datos** | Almacenes y flujos de datos, coloreados por su clasificación más sensible |
| `7` | **Costo** | Costo mensual como mapa de calor, con el total |
| `8` | **Gobierno** | Quién es dueño de qué: componentes coloreados por equipo (o dueño), con una etiqueta de equipo bajo cada uno; los que no tienen ninguno se atenúan |
| `9` | **Resiliencia** | Niveles de disponibilidad (SLA efectivo), pastilla con RPO/RTO bajo cada componente y puntos únicos de fallo con borde rojo discontinuo |

Las reglas de cada vista están en `src/config.js` › `views`; en el inspector puedes marcar un grupo como `lógico` o `físico`.

## Niveles C4 (drill-down)

Un mismo archivo puede tener varios niveles de detalle, como en el **modelo C4**: *contexto del sistema* → *contenedores* → *componentes*. Cualquier componente puede tener un **diagrama interno**; el modelo sigue siendo plano (cada elemento solo indica en qué componente vive, con `in`), así que revisiones, linaje, cumplimiento, dueños, costos y versiones siguen viéndolo todo.

1. Elige un componente y pulsa **Crear diagrama interno** en el inspector (sección **Elemento C4**); luego añade componentes dentro. Lo nuevo (componentes, grupos, notas y zonas) nace en el nivel en el que estás. Dentro de un *Sistema de software* los nuevos son *Contenedor* por defecto; dentro de un *Contenedor*, *Componente*.
2. Un componente con diagrama interno muestra una pastilla **⊞ n** a la derecha de su tarjeta. **Haz clic en la pastilla**, **doble clic en el componente** (doble clic en su *nombre* lo renombra), pulsa **`Intro`** con él elegido, o usa **Abrir diagrama interno** en el inspector.
3. Para volver: **`Esc`** (sin nada seleccionado), **`Alt`+`↑`** o las **migas de pan** sobre el lienzo (*Superior › Sistema tienda › API*), que además nombran el nivel C4 (*L1 Contexto del sistema*, *L2 Contenedores*, *L3 Componentes*).
4. Dentro de un nivel, un **marco de límite** discontinuo lleva el nombre y el tipo C4 del padre. Lo que vive fuera pero se conecta con él (otros sistemas, los vecinos del padre) aparece como **tarjetas fantasma** atenuadas a la izquierda (entrantes) y a la derecha (salientes) del marco; haz clic en una para saltar a su nivel.
5. Elige un **Elemento C4** (*Persona*, *Sistema de software*, *Contenedor*, *Componente*, *Sistema externo*) en el inspector; se ve como una etiqueta `[Contenedor]` en los componentes sin línea de detalle, y en el tooltip.
6. **Mover dentro de…** (los nodos elegidos pasan dentro de otro componente del mismo nivel) y **Subir un nivel** están en el inspector; las conexiones los siguen y los grupos viajan con sus nodos cuando se mueven todos. Borrar un componente con diagrama interno pide confirmación y borra todo lo que contiene. **Duplicar** también copia el diagrama interno, a cualquier profundidad.
7. Cada nivel tiene sus propias posiciones y su propio **Ordenar**, **Ajustar** y presentación. Las vistas (también el colapso de *Contexto*), los filtros, los hallazgos y las exportaciones funcionan dentro del nivel abierto. **Exportar** › *Todos los niveles* escribe una imagen por cada nivel con contenido.

Desde la consola: `Diagramon.setScope('api')`, `Diagramon.scope`, `Diagramon.scopes()`, `Diagramon.exportLevels('png')`.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `⌘Z` / `⇧⌘Z` | Deshacer / rehacer |
| `⌘D` | Duplicar |
| `⌘A` | Seleccionar todo |
| `Supr` | Borrar |
| Flechas (`⇧` = más rápido) | Mover la selección (nodos, notas y zonas de riesgo) |
| `Alt`+clic | Seleccionar la zona de riesgo bajo el puntero, aunque la tapen nodos o grupos |
| `Z` / `⇧Z` | Seleccionar la zona de riesgo siguiente / anterior |
| `C` | Conectar |
| `R` | Ver el camino entre dos nodos seleccionados |
| `D` | Elegir un conjunto de datos para ver su linaje (escribe para filtrar, `↑` `↓` `Intro`, `Esc` cierra) |
| `F` | Ajustar a la vista |
| `P` | Reproducir el flujo |
| `V` | Presentar a pantalla completa (`→` `←` `Espacio` `Inicio` `Fin` `1`–`9`, `Esc` para salir) |
| `T` | Alternar claro → oscuro → negro de alto contraste |
| `L` | Cambiar entre inglés y español |
| `E` | Cambiar entre conectores curvos y en ángulo recto |
| `G` | Abrir el panel de filtros (`Esc` lo cierra) |
| `1`–`9` | Cambiar de vista: Completa, Contexto, Lógica, Física, Seguridad, Datos, Costo, Gobierno, Resiliencia |
| `Intro` | Abrir el diagrama interno del componente elegido (niveles C4) |
| `Esc` | Cancelar o quitar la selección; sin selección, subir un nivel C4 |
| `Alt`+`↑` | Subir un nivel C4 |
