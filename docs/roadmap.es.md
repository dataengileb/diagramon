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
