<div align="center">

[English](README.md) · **Español**

<img src="docs/logo.svg" width="112" alt="Diagramon, una nube con antenas">

# Diagramon

**Diagramas de arquitectura cloud animados, que viven 100 % en tu computadora.**

Sin servidor. Sin cuenta. Sin internet. Sin enviar ni un byte de los datos de tus clientes.

![Open source](https://img.shields.io/badge/open%20source-MIT-C2B6F6?style=flat-square)
![Privacidad](https://img.shields.io/badge/privacidad-100%25%20local-A6E3C8?style=flat-square)
![Sin instalar](https://img.shields.io/badge/instalaci%C3%B3n-ninguna-F8C99E?style=flat-square)
![Sin dependencias](https://img.shields.io/badge/dependencias-0-F5A9C6?style=flat-square)
![Funciona offline](https://img.shields.io/badge/funciona-offline-A9D2F3?style=flat-square)

<img src="docs/diagram-dark.es.png" alt="Diagrama de una web app en AWS hecho con Diagramon, en modo oscuro, con costos bajo cada servicio">

</div>

---

## 🔒 Tus datos no salen de tu equipo

Diagramon nació para dibujar arquitecturas **reales**, con nombres de clientes, IPs, cuentas y costos
de verdad. Ese tipo de información no debería viajar a un servicio de terceros solo para hacer un dibujo.

| | Diagramon | Herramientas de diagramas en la nube |
|---|---|---|
| ¿Dónde vive tu diagrama? | En tu navegador y en los archivos que tú exportas | En los servidores del proveedor |
| ¿Necesita cuenta? | No | Normalmente sí |
| ¿Necesita internet? | No, ni para los iconos | Sí |
| ¿Hay analítica o telemetría? | No, cero | A menudo |
| ¿Usa IA en la nube para "texto a diagrama"? | No: el lenguaje de texto se procesa en local | A veces |

**Cómo lo garantiza**

- **Es un solo HTML con JavaScript propio.** Sin librerías externas, sin CDN, sin fuentes web cargadas de internet, sin trackers.
  Los iconos oficiales van incrustados en los archivos `icons/*.js` y las tres tipografías en `fonts/fonts.js` (base64).
- **El navegador bloquea la red.** `index.html` declara una política de seguridad
  (`Content-Security-Policy: connect-src 'none'`). Aunque alguien añadiera código que intente enviar datos,
  el navegador lo rechaza.
- **El código es abierto y corto.** Puedes leer cada línea y comprobarlo tú mismo: no hay ninguna llamada a `fetch`,
  `XMLHttpRequest`, `WebSocket` ni `sendBeacon`.
- **El guardado automático es local.** Se usa el `localStorage` de tu navegador, en tu equipo.
  Las exportaciones (SVG, PNG, JSON) son archivos que solo tú decides dónde guardar.

> **Consejos para datos sensibles:** en un equipo compartido, usa una ventana privada o borra los datos del sitio al terminar.
> Revisa también las extensiones del navegador: tienen acceso a las páginas que abres, incluida esta.

---

## ✨ Qué puedes hacer

- 🎞️ **Diagramas vivos**: partículas que recorren las conexiones, trazos que fluyen y un botón **Flujo** que reproduce el recorrido paso a paso.
- ☁️ **Iconos oficiales** de **AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric** (unos 290 servicios), además de iconos genéricos.
- 🏗️ **Importar infraestructura como código**: Terraform (estado, plan o `.tfstate`), CloudFormation/SAM, Kubernetes y Docker Compose, procesados en local.
- 🧩 **Grupos anidados**: región › VPC › subred, clúster › namespace…
- 🖱️ **Selección múltiple, alineación y guías**: alinea, reparte con el mismo espacio y pega nodos a bordes y centros.
- 💵 **Costos a mano**: precio en USD por hora, mes, año o varios años, en un recuadro bajo cada servicio y con el total mensual.
- 🏷️ **Clasificación de datos y cifrado en tránsito**: marca nodos y conexiones como *Público, Interno, Confidencial, PII, PCI* o *PHI*, indica si cada conexión va cifrada 🔒 o no, y recibe un aviso en rojo cuando datos sensibles viajan sin cifrar.
- ⌨️ **Diagrama como código**: escribe en texto y el lienzo se actualiza al momento. Texto, JSON y lienzo siempre sincronizados.
- 🗂️ **Versiones y ambientes**: guarda el lienzo como *Versión 1, 2, 3…* o como *Desarrollo, Calidad, Producción*, ábrelos cuando quieras y compáralos con el lienzo: lo nuevo en verde, lo cambiado en amarillo y lo eliminado como fantasma rojo.
- ⚑ **Observaciones de revisión**: levanta a mano una observación en cualquier componente, con qué hay que corregir, quién la levantó, cuándo y la fecha compromiso. Las etiquetas muestran *EN REVISIÓN*, *VENCIDA* o *RESUELTA*, y las abiertas salen listadas en la exportación.
- 📐 **Conectores en ángulo recto**: cambia entre curvas y líneas en ángulo recto que esquivan los nodos, para todo el diagrama o para una sola conexión.
- 🧾 **Leyenda y cajetín** en las exportaciones SVG y PNG: estilos de conexión, colores de los componentes, clasificaciones de datos, autor, versión, fecha y costo estimado. Listo para entregar.
- 🔦 **Resaltar el flujo** de un componente: vecinos, destinos, orígenes o todo.
- 🌐 **Inglés o español**: la app abre en inglés; el botón 🌐 de la barra superior (o la tecla **`L`**) la pasa a español y recuerda tu elección.
- 🌗 **Modo oscuro** por defecto, modos **claro** y **negro de alto contraste** con una tecla, y dos paletas (Pastel y Neón).
- 📤 **Exporta** a SVG (animado), PNG o JSON. **Importa** un JSON arrastrándolo al lienzo.
- ↩️ **Deshacer y rehacer**, guardado automático y orden automático del diagrama.

<div align="center">
<img src="docs/diagram-light.es.png" alt="Diagrama de microservicios en Google Kubernetes Engine, en modo claro">
</div>

---

## 🚀 Empezar en 30 segundos

**¿Solo quieres probarlo?** Abre la [demo en línea](https://dataengileb.github.io/diagramon/). Es la misma página, servida por GitHub Pages: tu diagrama se queda en tu navegador.

1. **Descarga** el proyecto: botón verde **Code › Download ZIP**, o con git:

   ```bash
   git clone https://github.com/dataengileb/diagramon.git
   ```

2. **Abre** `index.html` con doble clic en cualquier navegador moderno.
3. Listo. No hay paso 3. 🎉

---

## 📘 Tutorial

### 1. Tu primer diagrama

1. Abre la pestaña **Plantillas** y elige *Web app en AWS · 3 capas* para ver un ejemplo completo.
2. Pulsa **Nuevo** para empezar con el lienzo vacío.
3. En **Componentes**, abre la lista **Proveedor** y elige **Genéricos**, **AWS**, **Azure**, **Google Cloud**, **SAP BTP** o **Microsoft Fabric**.
   Solo verás los componentes de ese proveedor. Usa el buscador: `lambda`, `s3`, `hana`…
   También entiende sinónimos y equivalentes, en español e inglés: `sql` encuentra RDS, Cloud SQL y Azure SQL; `k8s` encuentra EKS, AKS y GKE; `cola` encuentra SQS y Service Bus.
   En **SAP**, arriba salen los **sistemas de negocio SAP** (S/4HANA, ECC, TM, EWM…) con el logotipo de SAP.
4. Haz **clic** en un componente para añadirlo al centro, o **arrástralo** al lienzo.
   Doble clic en un hueco del lienzo añade otro igual al último.

### 2. Conectar

- Selecciona un nodo y pulsa **`C`**, luego haz clic en el destino.
- O selecciona un nodo y haz **`⇧` + clic** en el destino.
- Haz clic en una conexión para cambiar su etiqueta y su estilo:
  **síncrona** (petición), **asíncrona** (evento), **flujo de datos** u **opcional**.

### 3. Editar y agrupar

- Haz **clic** en un nodo: el panel derecho muestra nombre, detalle, icono, color y descripción.
- Para cambiar el icono, escribe parte de su nombre en el buscador **Icono** (`lamb`, `sql`, `kafka`…) y elige una sugerencia con el ratón o con ↑ ↓ y Enter. La × vuelve al icono genérico.
- **Doble clic** sobre un nodo, grupo o conexión lo renombra.
- En **Grupo › + Nuevo grupo…** creas un grupo. Arrastra su etiqueta para mover el grupo entero.

### 4. Varios a la vez y alineación

- **`⌘` + clic** (o **`Ctrl` + clic**) añade o quita nodos de la selección.
- **`⇧` + arrastrar** en el fondo selecciona un área. **`⌘A`** selecciona todo.
- Con varios elegidos, el panel derecho los **alinea** (izquierda, centro, derecha, arriba, medio, abajo)
  y los **reparte** con el mismo espacio en horizontal o vertical.
- Al arrastrar aparecen **guías** rosas que pegan el nodo a los bordes y centros de los demás. **`Alt`** las desactiva.

### 5. Costos

1. Selecciona un servicio.
2. En **Costo (USD)** escribe el precio.
3. Elige el periodo: **Por hora**, **Mensual**, **Anual** o **Multianual** (con número de años).

El precio aparece en un recuadro bajo el servicio. Arriba del lienzo ves el **total aproximado al mes**.
Con varios servicios elegidos, el panel muestra el costo de la selección.

> Diagramon no consulta precios en internet (por privacidad). Los costos los escribes tú.

### 6. Clasificación de datos y cifrado

1. Selecciona un componente. En **Clasificación de datos**, pulsa las etiquetas de los datos que guarda o maneja: **PUB**, **INT**, **CONF**, **PII**, **PCI**, **PHI**. Puedes elegir varias.
2. Selecciona una conexión. En **Cifrado en tránsito** elige **Cifrado** o **Sin cifrar**, y marca los **Datos en tránsito**.

Las etiquetas salen arriba de cada nodo y en la etiqueta de la conexión, junto a un candado: cerrado 🔒 si va cifrada, abierto si no.
Si una conexión *Sin cifrar* lleva datos sensibles, o une un componente con datos sensibles, se pone roja y aparece un aviso arriba del lienzo.
Con varios componentes elegidos, las etiquetas se aplican a todos.

### 7. Observaciones de revisión

1. Selecciona un componente y pulsa **⚑ Levantar una observación**.
2. Escribe la **Observación** (qué hay que corregir), **Levantada por**, la **Fecha de levantamiento** (hoy por defecto) y la **Fecha compromiso**.
3. Cuando esté corregida, pulsa **✓ Marcar resuelta**. **Reabrir** la vuelve a abrir; **Quitar** la borra.

El componente lleva una etiqueta: **EN REVISIÓN** (naranja), **VENCIDA** (roja, si pasó la fecha compromiso) o **RESUELTA** (verde).
El panel dice cuántos días faltan o cuántos lleva vencida, y el resumen sobre el lienzo cuenta las abiertas y las vencidas.
Diagramon recuerda el último nombre de revisor. Las exportaciones con leyenda listan las observaciones abiertas con su fecha compromiso.

### Filtros

**Filtrar** (o **`G`**) abre un panel de fichas: **Datos** (cada clase del diagrama, más *Flujos sensibles sin cifrar*), **Revisión**, **Proveedor**, **Categoría**, **Grupo** y **Costo**.
Las fichas de una misma sección suman (O); las secciones distintas se combinan (Y). Lo que no coincide se atenúa, incluidos los grupos vacíos y las conexiones cuyos extremos no coinciden ambos; seleccionar un componente sigue funcionando encima.
Una etiqueta sobre el lienzo muestra el filtro activo (`Filtro: PII · AWS · 7 de 20`) con una **×** para quitarlo. Se recuerda por navegador y nunca altera las exportaciones. Desde la consola: `Diagramon.setFilter({ data: ['pii'], provider: ['aws'] })` y `Diagramon.clearFilter()`.

### 8. Versiones y ambientes

Abre la pestaña **Versiones**.

- **+ Versión N** guarda una foto fija del lienzo. Sirve como historial: *Versión 1*, *Versión 2*…
- **DEV**, **QA** y **PROD** guardan el lienzo como ese ambiente. Cada ambiente tiene una sola copia; al guardar otra vez se actualiza.
- Antes de guardar puedes escribir una **nota**, por ejemplo *antes de la migración*.
- **Abrir** lo carga en el lienzo. Una etiqueta sobre el título muestra qué está abierto y avisa si hay cambios sin guardar.
- **Comparar** marca las diferencias con el lienzo: **verde** es nuevo, **amarillo** cambiado y los fantasmas **rojos punteados** se eliminaron.
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

### 9. Notas adhesivas y zonas de riesgo

Usa los dos botones junto al zoom (abajo a la derecha del lienzo).
- **Añadir una nota adhesiva** pone una nota en el centro de la vista. Haz doble clic (o usa el panel) para escribir.
- **Añadir una zona de riesgo** dibuja un área rayada y con borde discontinuo bajo los grupos, con una etiqueta como `⚠ ALTA · Subred pública expuesta`. Elige su **Severidad** (*Baja, Media, Alta, Crítica*) y una descripción opcional en el panel.
- Selecciona varios componentes y pulsa **⚠ Marcar como zona de riesgo** para dibujar una zona alrededor.
- Arrastra para mover, arrastra el tirador de la esquina para cambiar el tamaño (se ajusta a la cuadrícula), **`⌘D`** duplica y **Supr** elimina. Todo se puede deshacer.
- El resumen sobre el lienzo cuenta las zonas (*⚠ 2 zonas de riesgo (1 crítica)*), las exportaciones con leyenda las listan por severidad, y las versiones y el JSON conservan notas y zonas.

### 10. Presentar y exportar

- **Flujo** (o **`P`**) ilumina el diagrama paso a paso, de los clientes a los datos.
- **Presentar** (o **`V`**) pasa a pantalla completa sin paneles: una vista general con el título, una diapositiva por grupo (en orden de lectura, acercando y atenuando el resto) y una vista general final. Sin grupos, recorre el flujo. **`→`**, **`Espacio`** o clic avanzan, **`←`** retrocede, **`Inicio`/`Fin`** y las teclas numéricas saltan, **`P`** reproduce el flujo y **`Esc`** sale y restaura tu vista. La edición se desactiva mientras presentas.
- **Ordenar** recoloca todo automáticamente, siguiendo el flujo. Cada grupo se ordena dentro de su propia caja, así los grupos nunca se pisan. **Ajustar** (o **`F`**) centra el diagrama.
- **Ángulos** (o **`E`**) cambia las conexiones entre curvas y líneas en ángulo recto que esquivan los nodos. Varias líneas en el mismo lado de un nodo salen de puntos separados y repartidos, para que no se solapen.
  Para cambiar una sola conexión, selecciónala y elige su **Línea**.
- **Exportar** › SVG, PNG o JSON. Guarda el JSON para volver a abrirlo más tarde con **Importar**.
- **Exportar › Mermaid, PlantUML o draw.io** convierte el diagrama en código o en un archivo para otras herramientas: un flowchart de Mermaid (se ve en GitHub, GitLab y Notion), un diagrama de PlantUML sin inclusiones externas, o un `.drawio` que conserva la misma disposición, los grupos anidados y los iconos oficiales.
- **Exportar › HTML cifrado** crea un único `.html` para compartir un diagrama en privado. Quien lo recibe le da doble clic, escribe la contraseña y ve el diagrama (oscuro o claro, con zoom). Sin la app, sin instalar ni descargar nada. Detalles más abajo.
- El menú **Exportar** también tiene **Leyenda y cajetín** (activado por defecto), con los campos **Autor** y **Versión**.
  Los archivos SVG y PNG llevan entonces un panel abajo con solo lo que usa el diagrama (estilos de conexión, candados,
  colores de los componentes, clasificaciones de datos) y un cajetín con título, autor, versión, fecha y costo estimado.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `⌘Z` / `⇧⌘Z` | Deshacer / rehacer |
| `⌘D` | Duplicar |
| `⌘A` | Seleccionar todo |
| `Supr` | Borrar |
| Flechas (`⇧` = más rápido) | Mover la selección |
| `C` | Conectar |
| `R` | Ver el camino entre dos nodos seleccionados |
| `F` | Ajustar a la vista |
| `P` | Reproducir el flujo |
| `V` | Presentar a pantalla completa (`→` `←` `Espacio` `Inicio` `Fin` `1`–`9`, `Esc` para salir) |
| `T` | Alternar claro → oscuro → negro de alto contraste |
| `L` | Cambiar entre inglés y español |
| `E` | Cambiar entre conectores curvos y en ángulo recto |
| `G` | Abrir el panel de filtros (`Esc` lo cierra) |
| `Esc` | Cancelar o quitar la selección |

---

## 🏗️ De infraestructura como código a diagrama

Arrastra tus archivos de IaC al lienzo, o usa **Importar**. Diagramon dibuja la arquitectura real en segundos, sin subir nada a ningún sitio: todo se procesa en tu navegador.

| Origen | Cómo obtener el archivo |
|---|---|
| **Terraform** | `terraform show -json > infra.json` (estado), `terraform show -json plan.out` (plan) o el propio `.tfstate` |
| **CloudFormation / SAM** | La plantilla, en YAML o JSON |
| **Kubernetes** | Tus manifiestos (varios documentos por archivo, varios archivos a la vez), o `kubectl get all,ingress,pvc,secret -o yaml` |
| **Docker Compose** | `docker-compose.yml` / `compose.yaml` |

Qué obtienes:

- **Grupos**: región de AWS › VPC › subredes (grupos de recursos y VNet de Azure, VPC de Google Cloud), namespaces de Kubernetes y redes de Compose.
- **Conexiones** deducidas de las referencias: ARN, ids, nombres de buckets, rutas `s3://`, nombres de host en variables de entorno, selectores e Ingress de Kubernetes, `depends_on`. La dirección sigue a los datos: el stream *origen* de un Firehose apunta al Firehose, y una notificación de S3 apunta a la Lambda que dispara.
- **Iconos oficiales** y detalles: runtime, motor, horario, réplicas.
- **Clasificación de datos** desde etiquetas como `DataClassification = pii`.
- **Menos ruido**: los recursos de apoyo (IAM, políticas, rutas, grupos de seguridad, asociaciones…) se ocultan, pero se usan para ubicar y conectar el resto.

![Data lake de AWS importado desde terraform show -json](docs/iac-data-lake.png)

Pruébalo con los archivos de [`samples/`](samples): un data lake simple en AWS (en Terraform y en CloudFormation), una tienda en Kubernetes y un stack de Docker Compose.

---

## 🔐 Compartir un diagrama cifrado

**Exportar › HTML cifrado** pide una contraseña (12 caracteres o más, con medidor de fortaleza) y guarda un único archivo `.html`.

- **Autosuficiente y de solo lectura.** El archivo lleva su propio visor. Se abre con doble clic en cualquier navegador reciente, sin conexión, sin Diagramon, sin instalar ni descargar nada.
- **Todo va cifrado**, también el título. En claro solo quedan los parámetros del cifrado.
- **Criptografía estándar y robusta** del propio navegador (Web Crypto): la clave sale de la contraseña con PBKDF2-SHA-256, 600 000 iteraciones y una sal aleatoria de 16 bytes; el diagrama se comprime y se cifra con AES-256-GCM (vector inicial aleatorio de 12 bytes), que además detecta cualquier alteración.
- **El visor no puede filtrar ni ejecutar nada.** Bloquea la red con su propia política CSP y muestra el diagrama como imagen.
- Envía la contraseña por un **canal distinto** al del archivo. Una contraseña perdida no se puede recuperar.

---

## ⌨️ Diagrama como código (pestaña *Texto*)

La forma más rápida de dibujar. Escribe y el lienzo se actualiza solo. Todo se procesa en local, sin IA.

```text
título: Tienda online
dirección: LR
líneas: codos
autor: Equipo de plataforma
versión: 1.2

grupo aws "AWS" color=melocoton {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 costo=350/mes datos=pii,pci
}
web: Clientes [user] desc="Navegador"

web -> api : HTTPS
api => db : SQL cifrado=sí
api ~> cola : eventos
```

| Escribe | Significa |
|---|---|
| `id: Nombre [tipo] "detalle"` | Nodo. `[tipo]` es un tipo genérico (`db`, `user`…) o un icono oficial (`aws/lambda`, `rds`) |
| `color=… badge=… desc="…"` | Opciones del nodo |
| `costo=120/mes` · `0.1/hora` · `1400/año` · `5000/3años` | Costo en USD (sin periodo = mensual) |
| `datos=pii,pci` | Clasificación de datos de un nodo o una conexión |
| `a -> b : TLS cifrado=sí` | Cifrado en tránsito (`sí` o `no`) |
| `grupo id "Nombre" color=… { … }` | Grupo; se pueden anidar |
| `a -> b` · `a => b` · `a ~> b` · `a ..> b` | Petición · datos · evento · opcional |
| `a -> b -> c : etiqueta` | Cadena; la etiqueta va en la última flecha |
| `líneas: codos` · `a -> b : x línea=curva` | Líneas en ángulo recto o curvas, para el diagrama o una conexión |
| `autor: …` · `versión: …` | Salen en el cajetín de la exportación |
| `revisión db: "BD en subred pública" por=Ana levantada=2026-10-01 compromiso=2026-11-15` | Observación de revisión (`estado=resuelta cerrada=…` al corregirla) |
| `# …` o `// …` | Comentario |

Las palabras clave funcionan en los dos idiomas: `title`/`título`, `group`/`grupo`, `cost`/`costo`, `/month`/`/mes`, `/hour`/`/hora`, `/year`/`/año`, `/3years`/`/3años`.
Los colores también aceptan su nombre en inglés (`peach`, `sky`, `mint`…).

Un nodo que solo aparece en una conexión se crea solo. Los errores salen en rojo con su número de línea.
El texto no guarda posiciones: los nodos que ya existían no se mueven y los nuevos se colocan junto a sus vecinos.

<details>
<summary><b>Formato JSON</b></summary>

```json
{
  "title": "Mi arquitectura",
  "direction": "LR",
  "groups": [ { "id": "vpc", "label": "VPC", "color": "cielo", "parent": "aws" } ],
  "nodes":  [ { "id": "api", "label": "API", "type": "gateway", "icon": "aws/apigateway", "sub": "REST", "badge": "x2",
                "group": "vpc", "x": 0, "y": 0, "cost": 0.05, "costPeriod": "hour", "desc": "…" } ],
  "edges":  [ { "from": "api", "to": "db", "label": "SQL", "style": "sync | async | data | optional", "color": "rosa" } ]
}
```

- Solo `id` y `type` son necesarios en los nodos. Sin `x`/`y` se colocan solos.
- `costPeriod`: `hour`, `year` o `multi` (con `costYears`). Sin `costPeriod` el costo es mensual.
- `routing: "elbow"` pone líneas en ángulo recto en todo el diagrama; `route` (`curved` o `elbow`) lo cambia en una conexión. `meta` guarda `author` y `version`.
- `review` en un nodo: `{ "status": "open" | "resolved", "note", "by", "raised", "due", "closed" }`, con fechas `AAAA-MM-DD`.
- `data` es la lista de clasificaciones (`["pii", "pci"]`) en nodos y conexiones. `encrypted` (`true` o `false`) es el cifrado en tránsito de una conexión.
- El archivo exportado también lleva `versions` (cada una con `kind`: `version` o `env`, y su propio `diagram`) y `active`.
- `color` acepta una clave de la paleta o cualquier color CSS.

</details>

---

## 🎨 Personalizar

Todo lo personalizable está en **`config.js`**. Guarda y recarga `index.html`.

- **Tema por defecto**: `app.defaultTheme: 'dark' | 'light' | 'black'`. La tecla `T` y el botón de tema alternan claro → oscuro → negro.
- **Idioma por defecto**: `app.defaultLang: 'en' | 'es'`. Los textos de la interfaz están en `i18n.js`; los de `config.js` y `examples.js` pueden ser `{ en: '…', es: '…' }`.
- **Clasificaciones de datos**: `dataClasses` define las etiquetas (nombre, texto corto y color). `sensitive: true` activa el aviso rojo en flujos sin cifrar.
- **Ambientes**: `environments` define los botones de la pestaña *Versiones* (nombre, texto corto y color). Añade o quita los que necesites.
- **Tamaño de los nodos**: con `node.sameSize: true` (por defecto) todos miden `node.width` y los nombres largos usan 2 líneas.
  Con `false`, cada nodo crece con su texto.
- **Atajos sin icono oficial**: `presets` añade elementos arriba de la lista de un proveedor (por ejemplo, los sistemas SAP).
- **Tipografías**: elige Inter (por defecto), IBM Plex Sans o Fira Code en la barra superior; la elección se guarda en tu navegador y se incrusta en las exportaciones SVG/PNG. Vienen incluidas en la app (no se cargan de la web). Para añadir una, deja sus archivos `.woff2` en `fonts/`, añade una entrada a `FONTS` en `tools/build-fonts.py` (mira su cabecera) y ejecuta `python3 tools/build-fonts.py`.
- **Paletas**: añade una entrada en `palettes` con las mismas claves de color (`rosa`, `coral`, …) para `dark`, `light` y `black` (por defecto vienen Pastel y Neón). Una paleta guardada que ya no existe vuelve a Pastel.
- **Nuevo tipo de componente**: copia una entrada de `types` y cambia `label`, `category`, `color`, `keywords` e `icon` (SVG de 24×24).
- **Conexiones**: `edgeStyles` define trazo, grosor y número de partículas.
- **Animación**: velocidad, aparición y duración de los pasos en `animation`.
- **Costos**: `cost.currency`, `cost.hoursPerMonth` (730 = horas de un mes) y `cost.defaultYears`.
- **Plantillas**: añade las tuyas en `examples.js`.

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

`"icons": { "enabled": false }` en `config.js` los desactiva.

</details>

<details>
<summary><b>API para extensiones</b></summary>

`window.Diagramon` expone `model`, `load()`, `addNode()`, `addEdge()`, `select()`, `align()`, `relayout()`,
`fitView()`, `togglePlay()`, `toggleTheme()`, `toggleLang()`, `lang`, `saveVersion()`, `openVersion()`, `compareVersion()`, `deleteVersion()`, `exportSVG()`, `exportPNG()`, `exportJSON()`, `config` e `icons`.
El lenguaje de texto está en `window.DiagramonText` (`parse` y `stringify`).

</details>

---

## 🗂️ Estructura

| Archivo | Para qué |
|---|---|
| `index.html` | Interfaz y estilos. `#diagram-css` son los estilos que también van en la exportación |
| `config.js` | **Todo lo personalizable**: temas, paletas, tipos, conexiones, animación y costos |
| `i18n.js` | Textos de la interfaz en inglés y en español |
| `app.js` | Motor del editor |
| `text-lang.js` | Lenguaje de texto (diagrama como código) |
| `examples.js` | Plantillas |
| `export-mermaid.js`, `export-plantuml.js`, `export-drawio.js` | Exportadores a Mermaid, PlantUML y draw.io |
| `share.js` | Visor HTML cifrado y autosuficiente para compartir |
| `iac.js` | Importación de infraestructura como código (Terraform, CloudFormation, Kubernetes, Compose) |
| `samples/` | Archivos de IaC de ejemplo para probar la importación |
| `icons/*.js` | Iconos oficiales de AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric, incrustados |
| `tools/build-icons.py` | Genera `icons/*.js` desde los paquetes oficiales |
| `icons/logos.js`, `tools/build-logos.py` | Logotipos de Azure, Google Cloud y SAP para grupos, generados desde `tools/logos/` |
| `fonts/` | Tipografías incluidas (`.woff2`, licencias OFL) y el `fonts.js` generado |
| `tools/build-fonts.py` | Genera `fonts/fonts.js` desde `fonts/*.woff2` |

---

## 🧭 Pendientes conocidos

Cosas que funcionan pero aún no se han revisado a fondo. Probablemente necesiten depurarse; se agradecen avisos y *pull requests*.

- **Importación de infraestructura como código de Azure y Google Cloud**: la correspondencia de iconos existe, pero no se ha probado con archivos reales de Azure ni de Google Cloud.
- **Exportaciones a Mermaid, PlantUML y draw.io**: cubren los casos principales, pero en diagramas complejos pueden perder detalles o necesitar ajustes.
  Los iconos de grupo en la exportación a draw.io aún no se han abierto en draw.io.
- **Temas claro y negro** con iconos de grupo y colores personalizados: sin revisar. Un color personalizado muy claro puede leerse mal en el tema claro, porque los colores personalizados no cambian con el tema.
- **Ida y vuelta en la pestaña Texto** de conexiones bidireccionales (`ambos=sí`) y etiquetas con saltos de línea: escribirlas funciona; editarlas y volver a leerlas no se ha probado del todo.
- *Reproducir flujo* y el modo presentación siguen las conexiones bidireccionales solo en un sentido.
- Las notas y las zonas de riesgo no se exportan a Mermaid, PlantUML ni draw.io.

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Abre un *issue* con tu idea o envía un *pull request*.

Para mantener el espíritu del proyecto:

- **Sin dependencias externas** ni pasos de compilación: tiene que seguir funcionando con doble clic.
- **Sin conexiones de red**: nada de analítica, CDN, fuentes web cargadas de internet ni APIs (las tipografías van incluidas).
- Lo personalizable va en `config.js`.

---

## 🙏 Créditos

Diagramon está inspirado en [**archify**](https://github.com/tt-a1i/archify) de [@tt-a1i](https://github.com/tt-a1i),
una skill para agentes que convierte ideas, planes o código en diagramas interactivos (licencia MIT).
Gracias por la inspiración. 💜

---

## 📄 Licencia

El código de Diagramon es **open source** bajo la [licencia MIT](LICENSE): úsalo, modifícalo y compártelo libremente,
también en proyectos comerciales.

Las tipografías incluidas son [Inter](https://github.com/rsms/inter), [IBM Plex Sans](https://github.com/IBM/plex) y [Fira Code](https://github.com/tonsky/FiraCode), con la licencia SIL Open Font License 1.1
(copias en [`fonts/OFL-Inter.txt`](fonts/OFL-Inter.txt), [`fonts/OFL-IBMPlexSans.txt`](fonts/OFL-IBMPlexSans.txt) y [`fonts/OFL-FiraCode.txt`](fonts/OFL-FiraCode.txt)).

Los **iconos oficiales** de `icons/` pertenecen a Amazon Web Services, Microsoft, Google y SAP, y **no** están cubiertos por la licencia MIT.
AWS, Microsoft y Google permiten usarlos en diagramas de arquitectura según sus propias condiciones.
Los iconos de SAP BTP vienen de [SAP/btp-solution-diagrams](https://github.com/SAP/btp-solution-diagrams)
bajo la licencia Apache 2.0 (copia en [`icons/LICENSE-SAP.txt`](icons/LICENSE-SAP.txt)).
Los iconos de Microsoft Fabric vienen del paquete oficial `@fabric-msft/svg-icons` de Microsoft, con licencia MIT
(copia en [`icons/LICENSE-FABRIC.txt`](icons/LICENSE-FABRIC.txt)), y siguen las mismas reglas de uso que los de Azure.
SAP solo publica iconos para sus servicios BTP. Sus aplicaciones de negocio (S/4HANA, ECC, TM, EWM…) no tienen icono oficial,
así que Diagramon las muestra con el logotipo de SAP.
Los **logotipos** de Azure, Google Cloud y SAP que se ofrecen como icono de grupo (una suscripción de Azure, un proyecto de Google Cloud, una cuenta de SAP BTP)
son marcas de sus dueños y solo identifican el servicio. Origen y condiciones en [`icons/LICENSE-LOGOS.txt`](icons/LICENSE-LOGOS.txt).
Diagramon los muestra sin cambios: no los recortes, gires ni deformes, y no los uses para representar un producto propio.
AWS, Azure, Microsoft Fabric, Google Cloud y SAP son marcas de sus respectivos dueños. Diagramon no está afiliado a ninguno de ellos.

<div align="center">
<sub>Hecho con 💜 y colores pastel. Tus diagramas, en tu equipo.</sub>
</div>
