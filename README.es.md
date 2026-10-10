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
![Inglés y español](https://img.shields.io/badge/interfaz-EN%20%7C%20ES-E0B5EE?style=flat-square)

<img src="docs/diagramon-demo.gif" width="960" alt="Diagramon en acción: una web app en AWS animada, las vistas de Seguridad y Costos, el linaje de datos de un lakehouse, la vista de Resiliencia y un nivel C4">

<sub>Arquitectura animada · vistas de Seguridad y Costos · linaje de datos · resiliencia · niveles C4</sub>

</div>

---

## ¿Qué es Diagramon?

Diagramon es un banco de trabajo de arquitectura que abres desde tu disco. Dibujas una arquitectura cloud con iconos oficiales,
y ese mismo diagrama responde a lo que pregunta una revisión: cuánto cuesta, qué se cae si falla una pieza, por dónde viajan
los datos sensibles, quién es dueño de cada parte y qué decisiones lo explican. Al terminar, te entrega los entregables:
imágenes, un informe, un inventario o una copia protegida con contraseña para tu cliente.

Los diagramas de arquitectura suelen guardar los datos más delicados de un equipo: nombres de clientes, cuentas, rangos de IP,
la red y los costos reales. Por eso Diagramon no tiene ningún servidor. Es una sola página HTML con archivos de JavaScript
propio, y el propio navegador bloquea cualquier conexión de red.

## 🚀 Empezar en 30 segundos

**¿Solo quieres probarlo?** Abre la [demo en línea](https://dataengileb.github.io/diagramon/). Es la misma página, servida por GitHub Pages: tu diagrama se queda en tu navegador.

1. **Descarga** el proyecto: botón verde **Code › Download ZIP**, o con git:

   ```bash
   git clone https://github.com/dataengileb/diagramon.git
   ```

2. **Abre** `index.html` con doble clic en cualquier navegador moderno.
3. Listo. No hay paso 3. 🎉

La app abre en inglés. Pulsa el botón 🌐 **EN** de la barra superior, o la tecla **`L`**, para pasarla a español; recuerda tu elección.

---

## ✨ Qué puedes hacer

### Dibujar

- ☁️ **Iconos oficiales** de **AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric** (unos 290 servicios), además de genéricos.
- 🧩 **Grupos anidados** (región › VPC › subred, clúster › namespace), selección múltiple, alineación y guías.
- 🎞️ **Diagramas vivos**: partículas que recorren las conexiones y un botón **Flujo** que reproduce un recorrido paso a paso. Conectores curvos o en ángulo recto que esquivan los nodos.
- ⌨️ **Diagrama como código**: escribe un texto corto y el lienzo se actualiza al momento. Texto, JSON y lienzo siempre sincronizados.
- 🏗️ **Parte de tu infraestructura real**: archivos de Terraform, CloudFormation/SAM, Kubernetes o Docker Compose se convierten en un diagrama agrupado por VPC, subred o namespace. Un `manifest.json` de dbt se convierte en conjuntos de datos y linaje.
- 🔭 **Vistas y niveles**: nueve vistas del mismo diagrama (Contexto, Lógica, Física, Seguridad, Datos, Costos, Gobierno, Resiliencia…) y **niveles C4** para bajar de sistema a contenedores y a componentes.

### Analizar

- 💵 **Costos** por componente, con desglose por equipo o centro de costo y escenarios *actual vs propuesto*.
- 🛟 **Resiliencia**: disponibilidad (SLA), RPO/RTO, réplicas, disponibilidad compuesta de una ruta y puntos únicos de fallo.
- 🔐 **Seguridad**: clasificación de datos (*PII, PCI, PHI*…), cifrado en tránsito, revisión de seguridad automática, modelado de amenazas **STRIDE** en las fronteras de confianza y mapeo de cumplimiento (ISO 27001, GDPR, PCI DSS…).
- 🧭 **Gobierno de datos**: dueños y responsables, residencia de datos con aviso cuando datos sensibles salen de su jurisdicción, capas bronce / plata / oro, un catálogo de datos con **contratos de datos** y linaje de origen a consumo.
- 📡 **Planificación**: radar tecnológico con fin de soporte, disposición de migración (6R), fases y estimación de esfuerzo.

### Decidir y hacer seguimiento

- 🗂️ **Versiones y ambientes**: guarda *Versión 1, 2, 3…* o *Desarrollo, Calidad, Producción* y compara cualquiera con el lienzo.
- 📜 **Decisiones de arquitectura (ADR)**, **requisitos** con matriz de trazabilidad, **registro RAID** e **interesados** con matriz RACI y aprobaciones.
- ⚑ **Revisión**: los hallazgos de todas las fuentes en una pestaña (manuales, seguridad, STRIDE, resiliencia, cumplimiento…), además de hilos de comentarios en cualquier elemento.
- 📁 **Espacio de trabajo**: abre una carpeta de diagramas para ver un mapa de sistemas, el linaje entre diagramas, una exportación de portafolio y la comparación del diseño con la infraestructura desplegada.

### Compartir

- 📤 **SVG** (animado) y **PNG** con leyenda y cajetín, listos para entregar. **JSON** para seguir trabajando, y **Mermaid, PlantUML y draw.io** para otras herramientas.
- 📑 **Informe de arquitectura** (PDF, Markdown o HTML), **informe de estado**, **inventario** en CSV o Excel y contratos de datos en YAML.
- 🔒 **Compartir cifrado**: un único HTML protegido con contraseña que se abre en cualquier sitio y te devuelve los comentarios de quien lo revisa.
- 🎤 **Presenta** a pantalla completa, grupo a grupo.

Y lo básico: deshacer y rehacer, guardado automático, orden automático, modos oscuro, claro y de alto contraste, dos paletas y toda la interfaz en inglés y español.

<div align="center">
<img src="docs/diagram-light.es.png" alt="Diagrama de microservicios en Google Kubernetes Engine, en modo claro">
</div>

---

## 🔒 Tus datos no salen de tu equipo

| | Diagramon | Herramientas de diagramas en la nube |
|---|---|---|
| ¿Dónde vive tu diagrama? | En tu navegador y en los archivos que tú exportas | En los servidores del proveedor |
| ¿Necesita cuenta? | No | Normalmente sí |
| ¿Necesita internet? | No, ni para los iconos | Sí |
| ¿Hay analítica o telemetría? | No, cero | A menudo |
| ¿Usa IA en la nube para "texto a diagrama"? | No: el lenguaje de texto se procesa en local | A veces |

**Cómo lo garantiza**

- **Es una sola página HTML con JavaScript propio.** Sin librerías externas, sin CDN, sin fuentes web cargadas de internet, sin trackers.
  Los iconos oficiales van incrustados en `assets/icons/*.js` y las tres tipografías en `assets/fonts/fonts.js` (base64).
- **El navegador bloquea la red.** `index.html` declara una política de seguridad de contenidos (`connect-src 'none'`).
  Aunque alguien añadiera código que intente enviar datos, el navegador lo rechaza.
- **El código es abierto.** Puedes leer cada línea: no hay ninguna llamada a `fetch`, `XMLHttpRequest`, `WebSocket` ni `sendBeacon`.
- **El guardado automático es local.** Se usa el `localStorage` de tu navegador, en tu equipo.
  Las exportaciones son archivos que solo tú decides dónde guardar.

> **Consejos para datos sensibles:** en un equipo compartido, usa una ventana privada o borra los datos del sitio al terminar.
> Revisa también las extensiones del navegador: tienen acceso a las páginas que abres, incluida esta.
>
> **Importa solo archivos de confianza.** Trata los JSON o archivos de infraestructura como código de origen desconocido como cualquier archivo descargado.

---

## 📚 Documentación

| Guía | Qué encontrarás |
|---|---|
| [📘 Tutorial](docs/guide.es.md) | Todas las funciones paso a paso, desde tu primer diagrama hasta los niveles C4, y los [atajos de teclado](docs/guide.es.md#atajos-de-teclado) |
| [🏗️ Importar infraestructura como código](docs/iac-import.es.md) | De Terraform, CloudFormation/SAM, Kubernetes y Docker Compose a un diagrama, con los archivos de ejemplo |
| [🔐 Compartir un diagrama cifrado](docs/sharing.es.md) | Un único HTML protegido con contraseña que se abre en cualquier sitio |
| [⌨️ Diagrama como código](docs/text-format.es.md) | La sintaxis de la pestaña *Texto*, en inglés y en español |
| [🎨 Personalizar](docs/customize.es.md) | Temas, paletas, tipos, reglas y plantillas en `src/config.js` |
| [🗂️ Estructura del proyecto](docs/project-structure.es.md) | Qué hace cada archivo y carpeta, y cómo está dividido el código |
| [🧭 Pendientes conocidos](docs/known-gaps.es.md) | Lo que falta probar fuera del navegador, mejoras pequeñas pendientes y límites por diseño |
| [🛣️ Ideas y posibles mejoras](docs/roadmap.es.md) | Cambios grandes abiertos a colaboradores, como las conexiones entre grupos, y las ideas que no están previstas |

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Abre un *issue* con tu idea o envía un *pull request*.

Para mantener el espíritu del proyecto:

- **Sin dependencias externas** ni pasos de compilación: tiene que seguir funcionando con doble clic.
- **Sin conexiones de red**: nada de analítica, CDN, fuentes web cargadas de internet ni APIs (las tipografías van incluidas).
- Lo personalizable va en `src/config.js`. Los textos nuevos de la interfaz van en `src/i18n.js`, en los dos idiomas.

Más detalles en [CONTRIBUTING.md](CONTRIBUTING.md) (en inglés). Para reportar una vulnerabilidad de forma privada, consulta [SECURITY.md](SECURITY.md).

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
(copias en [`assets/fonts/OFL-Inter.txt`](assets/fonts/OFL-Inter.txt), [`assets/fonts/OFL-IBMPlexSans.txt`](assets/fonts/OFL-IBMPlexSans.txt) y [`assets/fonts/OFL-FiraCode.txt`](assets/fonts/OFL-FiraCode.txt)).

Los **iconos oficiales** de `assets/icons/` pertenecen a Amazon Web Services, Microsoft, Google y SAP, y **no** están cubiertos por la licencia MIT.
AWS, Microsoft y Google permiten usarlos en diagramas de arquitectura según sus propias condiciones.
Los iconos de SAP BTP vienen de [SAP/btp-solution-diagrams](https://github.com/SAP/btp-solution-diagrams)
bajo la licencia Apache 2.0 (copia en [`assets/icons/LICENSE-SAP.txt`](assets/icons/LICENSE-SAP.txt)).
Los iconos de Microsoft Fabric vienen del paquete oficial `@fabric-msft/svg-icons` de Microsoft, con licencia MIT
(copia en [`assets/icons/LICENSE-FABRIC.txt`](assets/icons/LICENSE-FABRIC.txt)), y siguen las mismas reglas de uso que los de Azure.
SAP solo publica iconos para sus servicios BTP. Sus aplicaciones de negocio (S/4HANA, ECC, TM, EWM…) no tienen icono oficial,
así que Diagramon las muestra con el logotipo de SAP.
Los **logotipos** de Azure, Google Cloud y SAP que se ofrecen como icono de grupo (una suscripción de Azure, un proyecto de Google Cloud, una cuenta de SAP BTP)
son marcas de sus dueños y solo identifican el servicio. Origen y condiciones en [`assets/icons/LICENSE-LOGOS.txt`](assets/icons/LICENSE-LOGOS.txt).
Diagramon los muestra sin cambios: no los recortes, gires ni deformes, y no los uses para representar un producto propio.
AWS, Azure, Microsoft Fabric, Google Cloud y SAP son marcas de sus respectivos dueños. Diagramon no está afiliado a ninguno de ellos.

<div align="center">
<sub>Hecho con 💜 y colores pastel. Tus diagramas, en tu equipo.</sub>
</div>
