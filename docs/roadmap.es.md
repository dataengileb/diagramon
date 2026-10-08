[← Diagramon](../README.es.md) · [English](roadmap.md) · **Español**

# 🛣️ Ideas y posibles mejoras

Cambios grandes que serían útiles pero tocan muchas partes del código. Están abiertos a colaboradores: si quieres encargarte de uno, abre antes un *issue* para acordar el enfoque.

## Conexiones entre grupos

**La necesidad.** A veces la flecha no debe salir de un servicio concreto, sino de un *conjunto de servicios posibles*. Por ejemplo, un paso de ETL podría hacerse con Glue, Lambda, EC2 o EMR: dibujarías un grupo **ETL** con esas opciones y apuntarías desde él a otro grupo o a un bucket de S3.

**Hoy (alternativa).** Usa un **componente genérico** que nombre las opciones, por ejemplo un nodo *Genérico* llamado «ETL» con el detalle «Glue / Lambda / EC2 / EMR», y conéctalo como cualquier otro componente. Así todos los análisis siguen funcionando, aunque se pierden los iconos oficiales de cada opción. También puedes dejar las opciones dentro de un grupo al lado, como documentación, y conectar solo el componente genérico.

**Diseño propuesto.**

- Una conexión podría empezar o terminar en un grupo además de en un componente: `from` / `to` aceptarían el id de un grupo. La flecha saldría del borde del grupo o entraría en él. Conservaría todo lo que hoy tiene una conexión: estilo, peso, etiqueta, clases de datos, datasets, cifrado y decisiones STRIDE.
- En la pestaña *Texto*, `etl -> s3raw` ya se entendería porque los grupos tienen id (el analizador debe aceptar ids de grupo como extremos).
- **Significado:** una conexión desde un grupo quiere decir «cualquiera de sus miembros puede hacerlo». Cada análisis la interpreta así:
  - **Revisión de seguridad, residencia de datos, STRIDE:** se expande a todos los miembros del grupo. Es la opción prudente: el aviso aparece para todos.
  - **Linaje y camino entre componentes:** el grupo actúa como un único nodo de paso.
  - **Disponibilidad compuesta:** los miembros del grupo cuentan como rutas alternativas en paralelo. La función `routeReliability` ya maneja alternativas.
  - **Vista Contexto:** las conexiones a un grupo interior pasan a su caja cerrada de primer nivel.
  - **Niveles C4:** un grupo vive en un nivel (`in`), así que aplican las mismas reglas que a los extremos de componente (las conexiones que cruzan niveles se dibujan como fantasmas).
  - **Exportaciones:** Mermaid (enlaces a un `subgraph`), PlantUML (flechas a un contenedor) y draw.io (aristas a una celda contenedora) lo admiten.

**Por qué es arriesgado.** Casi todo `src/app.js` supone que los dos extremos de una conexión son componentes. Habría que cambiar estos bloques:

| Área | Dónde (cabecera del bloque en `src/app.js` salvo que se indique) |
|---|---|
| Limpieza del modelo, orden JSON, diferencias de versiones | `sanitize` / `normalize`, `ORDER`, `DIFF_FIELDS` |
| Dibujo, puntas de flecha, etiquetas | «dibujo» |
| Conectores en ángulo que esquivan nodos | «conectores en ángulo recto que esquivan los nodos» |
| Partículas | «partículas (bucle de animación)» |
| Camino entre componentes, linaje | «camino entre dos componentes», «linaje de datos» |
| Disponibilidad y puntos únicos de fallo | «disponibilidad (SLA), RPO/RTO, réplicas y puntos únicos de fallo» |
| Revisión de seguridad, residencia, STRIDE | «revisión de seguridad automática», «residencia y soberanía de datos», «STRIDE: fronteras de confianza…» |
| Vista Contexto y fantasmas C4 | «vista Contexto…», «niveles C4: abrir, salir, marco de límite y fantasmas del exterior» |
| Inspector, modo conectar, borrar/duplicar | bloques del inspector, «acciones», «interacción con el lienzo» |
| Pestaña Texto | `src/text-lang.js` (parse + stringify) |
| Exportaciones | `src/export/mermaid.js`, `plantuml.js`, `drawio.js` y el inventario (`inventoryRows` / hoja de conexiones) |

Además, borrar un grupo tendría que borrar o reenganchar sus conexiones, y deshacer debe restaurar ambas cosas.

**Plan sugerido para quien colabore.** Hazlo en pull requests pequeños:

1. Solo modelo y dibujo. Se añaden los extremos de grupo con una nota de «aún no analizado» en el inspector.
2. Camino, linaje y disponibilidad.
3. Expansión en seguridad, residencia y STRIDE.
4. Vista Contexto y C4.
5. Pestaña Texto y exportaciones.

Cada paso debe dejar idénticos, byte a byte, los diagramas que no tengan extremos de grupo.

## Dividir `src/app.js` en módulos

**Estado: abierto a colaboradores.** Los mantenedores actuales no tienen previsto hacerlo.

**La necesidad.** `src/app.js` ha crecido hasta unas 8.000 líneas en una sola clausura, organizada en unos 80 bloques marcados con cabeceras `/* ---------- … ---------- */`. Funciona, pero cuesta recorrerlo, revisarlo y cambiarlo en paralelo, y la mayoría de sus funciones no se pueden probar por separado. (`tests/run.js` solo llega a las pocas que son puras, recortándolas del archivo.)

**Condiciones que deben mantenerse.**

- **Sin paso de compilación ni dependencias:** Diagramon debe seguir abriéndose con doble clic en `index.html`, desde el disco (`file://`).
- **La política de seguridad de contenidos (CSP) sigue siendo estricta** (`script-src 'self'`).
- **Todas las funciones, exportaciones y el visor cifrado siguen funcionando igual, byte a byte**, y `tests/run.js` sigue pasando.

**Enfoque posible.**

- Mantener archivos `<script>` clásicos: los módulos ES (`type="module"`) no cargan desde `file://` en todos los navegadores.
- Dividir según las cabeceras de bloque que ya existen, en archivos bajo `src/` que compartan un objeto de espacio de nombres (por ejemplo `window.DiagramonApp`): modelo y saneado, dibujo, conectores, vistas, análisis (seguridad, residencia, STRIDE, disponibilidad, costos, cumplimiento, linaje), inspector, versiones, exportaciones, informe e interacción con el lienzo.
- Mover primero las funciones puras (limpieza del modelo, diferencias, disponibilidad, desglose de costos, filas del inventario), para que `tests/run.js` pueda cargarlas directamente y cubrir más.
- Hacerlo paso a paso, un área por pull request y sin cambios de comportamiento. Tras cada paso deben pasar la revisión en el navegador y las pruebas automáticas.

**Por qué es arriesgado.** Los bloques comparten mucho estado a través de clausuras: `S`, `R`, `VW`, `C`, `T` y muchas funciones auxiliares pequeñas. Una división descuidada puede romper funciones que se usan poco, como el visor cifrado, el informe o los fantasmas C4.
