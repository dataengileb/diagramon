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

- **Es un solo HTML con JavaScript propio.** Sin librerías externas, sin CDN, sin fuentes web, sin trackers.
  Los iconos oficiales van incrustados en los archivos `icons/*.js`.
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
- 🧩 **Grupos anidados**: región › VPC › subred, clúster › namespace…
- 🖱️ **Selección múltiple, alineación y guías**: alinea, reparte con el mismo espacio y pega nodos a bordes y centros.
- 💵 **Costos a mano**: precio en USD por hora, mes, año o varios años, en un recuadro bajo cada servicio y con el total mensual.
- ⌨️ **Diagrama como código**: escribe en texto y el lienzo se actualiza al momento. Texto, JSON y lienzo siempre sincronizados.
- 🗂️ **Versiones y ambientes**: guarda el lienzo como *Versión 1, 2, 3…* o como *Desarrollo, Calidad, Producción*, ábrelos cuando quieras y compáralos con el lienzo: lo nuevo en verde, lo cambiado en amarillo y lo eliminado como fantasma rojo.
- 🔦 **Resaltar el flujo** de un componente: vecinos, destinos, orígenes o todo.
- 🌐 **Inglés o español**: la app abre en inglés; el botón 🌐 de la barra superior (o la tecla **`L`**) la pasa a español y recuerda tu elección.
- 🌗 **Modo oscuro** por defecto, **modo claro** con una tecla y paletas pastel (Pastel, Sorbete, Nórdico).
- 📤 **Exporta** a SVG (animado), PNG o JSON. **Importa** un JSON arrastrándolo al lienzo.
- ↩️ **Deshacer y rehacer**, guardado automático y orden automático del diagrama.

<div align="center">
<img src="docs/diagram-light.es.png" alt="Diagrama de microservicios en Google Kubernetes Engine, en modo claro">
</div>

---

## 🚀 Empezar en 30 segundos

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
   En **SAP**, arriba salen los **sistemas SAP** sin icono oficial (S/4HANA, ECC, TM, EWM…).
4. Haz **clic** en un componente para añadirlo al centro, o **arrástralo** al lienzo.
   Doble clic en un hueco del lienzo añade otro igual al último.

### 2. Conectar

- Selecciona un nodo y pulsa **`C`**, luego haz clic en el destino.
- O selecciona un nodo y haz **`⇧` + clic** en el destino.
- Haz clic en una conexión para cambiar su etiqueta y su estilo:
  **síncrona** (petición), **asíncrona** (evento), **flujo de datos** u **opcional**.

### 3. Editar y agrupar

- Haz **clic** en un nodo: el panel derecho muestra nombre, detalle, icono, color y descripción.
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

### 6. Versiones y ambientes

Abre la pestaña **Versiones**.

- **+ Versión N** guarda una foto fija del lienzo. Sirve como historial: *Versión 1*, *Versión 2*…
- **DEV**, **QA** y **PROD** guardan el lienzo como ese ambiente. Cada ambiente tiene una sola copia; al guardar otra vez se actualiza.
- Antes de guardar puedes escribir una **nota**, por ejemplo *antes de la migración*.
- **Abrir** lo carga en el lienzo. Una etiqueta sobre el título muestra qué está abierto y avisa si hay cambios sin guardar.
- **Comparar** marca las diferencias con el lienzo: **verde** es nuevo, **amarillo** cambiado y los fantasmas **rojos punteados** se eliminaron.
  La tarjeta lista cada diferencia; haz clic en una para ir a ella. **Esc** o **Parar** terminan la comparación.
- Guardar, abrir y eliminar se deshacen con **`⌘Z`**.
- Las versiones se guardan dentro del diagrama, así que **Exportar › JSON** las lleva todas.

### 7. Presentar y exportar

- **Flujo** (o **`P`**) ilumina el diagrama paso a paso, de los clientes a los datos.
- **Ordenar** recoloca todo automáticamente. **Ajustar** (o **`F`**) centra el diagrama.
- **Exportar** › SVG, PNG o JSON. Guarda el JSON para volver a abrirlo más tarde con **Importar**.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `⌘Z` / `⇧⌘Z` | Deshacer / rehacer |
| `⌘D` | Duplicar |
| `⌘A` | Seleccionar todo |
| `Supr` | Borrar |
| Flechas (`⇧` = más rápido) | Mover la selección |
| `C` | Conectar |
| `F` | Ajustar a la vista |
| `P` | Reproducir el flujo |
| `T` | Cambiar entre modo oscuro y claro |
| `L` | Cambiar entre inglés y español |
| `Esc` | Cancelar o quitar la selección |

---

## ⌨️ Diagrama como código (pestaña *Texto*)

La forma más rápida de dibujar. Escribe y el lienzo se actualiza solo. Todo se procesa en local, sin IA.

```text
título: Tienda online
dirección: LR

grupo aws "AWS" color=melocoton {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 costo=350/mes
}
web: Clientes [user] desc="Navegador"

web -> api : HTTPS
api => db : SQL
api ~> cola : eventos
```

| Escribe | Significa |
|---|---|
| `id: Nombre [tipo] "detalle"` | Nodo. `[tipo]` es un tipo genérico (`db`, `user`…) o un icono oficial (`aws/lambda`, `rds`) |
| `color=… badge=… desc="…"` | Opciones del nodo |
| `costo=120/mes` · `0.1/hora` · `1400/año` · `5000/3años` | Costo en USD (sin periodo = mensual) |
| `grupo id "Nombre" color=… { … }` | Grupo; se pueden anidar |
| `a -> b` · `a => b` · `a ~> b` · `a ..> b` | Petición · datos · evento · opcional |
| `a -> b -> c : etiqueta` | Cadena; la etiqueta va en la última flecha |
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
- El archivo exportado también lleva `versions` (cada una con `kind`: `version` o `env`, y su propio `diagram`) y `active`.
- `color` acepta una clave de la paleta o cualquier color CSS.

</details>

---

## 🎨 Personalizar

Todo lo personalizable está en **`config.js`**. Guarda y recarga `index.html`.

- **Tema por defecto**: `app.defaultTheme: 'dark' | 'light'`.
- **Idioma por defecto**: `app.defaultLang: 'en' | 'es'`. Los textos de la interfaz están en `i18n.js`; los de `config.js` y `examples.js` pueden ser `{ en: '…', es: '…' }`.
- **Ambientes**: `environments` define los botones de la pestaña *Versiones* (nombre, texto corto y color). Añade o quita los que necesites.
- **Tamaño de los nodos**: con `node.sameSize: true` (por defecto) todos miden `node.width` y los nombres largos usan 2 líneas.
  Con `false`, cada nodo crece con su texto.
- **Atajos sin icono oficial**: `presets` añade elementos arriba de la lista de un proveedor (por ejemplo, los sistemas SAP).
- **Paletas**: añade una entrada en `palettes` con las mismas claves de color (`rosa`, `coral`, …) para `dark` y `light`.
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
| `icons/*.js` | Iconos oficiales de AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric, incrustados |
| `tools/build-icons.py` | Genera `icons/*.js` desde los paquetes oficiales |

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Abre un *issue* con tu idea o envía un *pull request*.

Para mantener el espíritu del proyecto:

- **Sin dependencias externas** ni pasos de compilación: tiene que seguir funcionando con doble clic.
- **Sin conexiones de red**: nada de analítica, CDN, fuentes web ni APIs.
- Lo personalizable va en `config.js`.

---

## 🙏 Créditos

Diagramon se basa en [**archify**](https://github.com/tt-a1i/archify) de [@tt-a1i](https://github.com/tt-a1i),
una skill para agentes que convierte ideas, planes o código en diagramas interactivos (licencia MIT).
Gracias por la idea y el punto de partida. 💜

---

## 📄 Licencia

El código de Diagramon es **open source** bajo la [licencia MIT](LICENSE): úsalo, modifícalo y compártelo libremente,
también en proyectos comerciales.

Los **iconos oficiales** de `icons/` pertenecen a Amazon Web Services, Microsoft, Google y SAP, y **no** están cubiertos por la licencia MIT.
AWS, Microsoft y Google permiten usarlos en diagramas de arquitectura según sus propias condiciones.
Los iconos de SAP BTP vienen de [SAP/btp-solution-diagrams](https://github.com/SAP/btp-solution-diagrams)
bajo la licencia Apache 2.0 (copia en [`icons/LICENSE-SAP.txt`](icons/LICENSE-SAP.txt)).
Los iconos de Microsoft Fabric vienen del paquete oficial `@fabric-msft/svg-icons` de Microsoft, con licencia MIT
(copia en [`icons/LICENSE-FABRIC.txt`](icons/LICENSE-FABRIC.txt)), y siguen las mismas reglas de uso que los de Azure.
SAP solo publica iconos para sus servicios BTP. Sus aplicaciones de negocio (S/4HANA, ECC, TM, EWM…) no tienen icono oficial:
la guía de SAP las dibuja como cajas con nombre, y Diagramon hace lo mismo con un icono genérico propio.
Diagramon los muestra sin cambios: no los recortes, gires ni deformes, y no los uses para representar un producto propio.
AWS, Azure, Microsoft Fabric, Google Cloud y SAP son marcas de sus respectivos dueños. Diagramon no está afiliado a ninguno de ellos.

<div align="center">
<sub>Hecho con 💜 y colores pastel. Tus diagramas, en tu equipo.</sub>
</div>
