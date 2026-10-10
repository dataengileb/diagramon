[← Diagramon](../README.es.md) · [English](known-gaps.md) · **Español**

# 🧭 Pendientes conocidos

Lo que Diagramon aún no hace, lo que no se ha probado fuera del navegador y lo que está limitado a propósito. Se agradecen avisos y *pull requests*. Las ideas más grandes están en el [roadmap](roadmap.es.md).

## 🧪 Por probar fuera del navegador (se busca ayuda)

Estas funciones van bien en el navegador y se comprobó la estructura de lo que generan, pero nadie las ha probado aún en la herramienta de destino. Si puedes, pruébalas y abre un *issue* con lo que encuentres.

- **Inventario en Excel (`.xlsx`)**: se comprobó que es un ZIP válido con partes XML bien formadas, pero aún no se ha abierto en Excel, Numbers ni LibreOffice.
- **Exportación a PlantUML**: solo se comprobó su estructura (bloques cerrados, alias declarados), sin dibujarla. Las exportaciones de las plantillas a Mermaid y draw.io sí se dibujaron con sus propios motores (Mermaid 11 y el visor de draw.io, incluidos los iconos de grupo).
- **Importación de infraestructura como código de Azure y Google Cloud**: se probó con los dos ejemplos de `terraform show -json` escritos a mano en `samples/`, que siguen los esquemas reales de azurerm y google, no con la salida de una cuenta real. Los tipos de recurso poco comunes pueden salir como componentes genéricos.
- **Informe de arquitectura en PDF**: se probó hasta la llamada de impresión del navegador. Se carga el documento completo con sus 14 secciones, imágenes y tablas, se llama a `print()` y las tablas caben en el ancho de un A4. El diálogo de impresión y la paginación final no se han revisado.
- **Kit de decisiones de lakehouse** (`src/adr-kits.js`): las opciones, pros y contras están escritos para ser neutrales y duraderos, pero no los ha revisado un especialista de cada producto. Contrástalos con la documentación actual de cada fabricante antes de presentarlos a un cliente.
- **Componentes muy pequeños** con todas las etiquetas a la vez (capa, región, equipo, disponibilidad): sin revisar. Con el ancho fijo por defecto caben.
- **Carpetas de espacio de trabajo** (`src/workspace.js`): la lógica del listado está probada, y abrir, guardar y el modo de solo lectura se ejercitaron en Chromium sin interfaz con una carpeta simulada. Nadie ha probado aún una carpeta real con el selector real, ni navegadores que no sean Chromium (Firefox y Safari usan el modo de solo lectura).

## 🔧 Aún no hecho (mejoras pequeñas)

- **Las exportaciones a Mermaid, PlantUML y draw.io** cubren los casos principales, pero en diagramas complejos pueden perder detalles o necesitar ajustes. El desglose de costos no se exporta a ellas.

## 📐 Límites por diseño

Son decisiones tomadas a propósito, casi siempre para que Diagramon siga siendo local, sin dependencias y honesto sobre lo que puede saber.

- **Mermaid y PlantUML no pueden solapar cajas.** Las zonas de riesgo y las fronteras de confianza se convierten en un borde de color en los componentes que contienen más una lista (comentarios en Mermaid, una nota en PlantUML), y los campos de gobierno y seguridad van en comentarios. draw.io las conserva como formas y como campos de *Edit Data*.
- **La disponibilidad es un modelo, no una medición.**
  - Los puntos únicos de fallo salen solo de la topología del diagrama (puntos de articulación del grafo sin dirección). Diagramon no conoce la redundancia interna de un balanceador o de un servicio gestionado salvo que indiques `réplicas`.
  - La disponibilidad efectiva supone instancias independientes (sin fallos compartidos ni tiempo de conmutación).
  - La compuesta combina de forma exacta todas las rutas alternativas. En diagramas muy mallados (más de unos 20 componentes inciertos en juego) muestra una cota inferior, marcada como tal, para que la página nunca se congele.
- **El catálogo de cumplimiento** es un subconjunto práctico de cada norma con títulos parafraseados. Revísalo antes de usarlo en una auditoría.
- **Los escenarios de costos** comparan solo el precio mensual equivalente de los componentes, no conexiones ni grupos.
- **El Excel lo escribe un generador mínimo propio** (un ZIP sin compresión), sin librerías. Pesa más que uno guardado por Excel, y no tiene fórmulas (los totales no se calculan en el archivo), cadenas compartidas ni gráficos.
- **La maquetación impresa del informe depende del navegador.**
  - Los encabezados y números de página solo salen donde el navegador admite los márgenes `@page` de CSS.
  - Los visores de Markdown que bloquean imágenes `data:` no muestran los diagramas salvo que guardes las imágenes aparte.
  - Un diagrama grande con muchas vistas y niveles internos puede tardar varios segundos.
- **Niveles C4**: las tarjetas fantasma son como mucho 8 por lado, y las conexiones entre dos niveles solo se dibujan como fantasmas (se llega a ellas desde los enlaces del inspector).
- **Espacio de trabajo**: solo se leen los archivos que están directamente en la carpeta (sin subcarpetas), hasta 200 diagramas de 8 MB como máximo. Guardar en la carpeta requiere un navegador Chromium.
- **Linaje de datos entre diagramas**: une los conjuntos solo por nombre y entiende "produce" como "nace en un componente al que nada se lo entrega". No sigue un conjunto que cambia de nombre entre diagramas, y un diagrama sin id queda fuera.
- **Exportar la cartera**: solo genera Excel (sin CSV ni sección de informe) y es una foto: no guarda historial entre exportaciones.
- **Elementos compartidos**: son copias, no enlaces vivos; no hay sincronización automática, y un cambio hecho en un diagrama a un elemento compartido no vuelve a la carpeta salvo que lo compartas otra vez. Los elementos se comparan solo por nombre o título.
- **Enlaces entre diagramas** (`ref`): no entran en la comparación de versiones ni en el formato de texto. Se conservan al editar el texto. Un componente puede apuntar a un diagrama entero, todavía no a uno de sus componentes.
- **La región se deduce del nombre de un grupo** con los códigos habituales de AWS, Azure y Google Cloud. Para otros nombres hay que usar el campo **Región**.
- Varias descargas CSV seguidas pueden activar el aviso de «descargar varios archivos» en algunos navegadores.
