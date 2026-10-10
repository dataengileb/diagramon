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
| Inspector, modo conectar, borrar/duplicar | `src/ui/inspector.js` y las secciones `src/ui/insp*.js`, «acciones», «interacción con el lienzo» |
| Pestaña Texto | `src/text-lang.js` (parse + stringify) |
| Exportaciones | `src/export/mermaid.js`, `plantuml.js`, `drawio.js` y el inventario (`inventoryRows` y la hoja de conexiones, en `src/ui/exportother.js`) |

Además, borrar un grupo tendría que borrar o reenganchar sus conexiones, y deshacer debe restaurar ambas cosas.

**Plan sugerido para quien colabore.** Hazlo en pull requests pequeños:

1. Solo modelo y dibujo. Se añaden los extremos de grupo con una nota de «aún no analizado» en el inspector.
2. Camino, linaje y disponibilidad.
3. Expansión en seguridad, residencia y STRIDE.
4. Vista Contexto y C4.
5. Pestaña Texto y exportaciones.

Cada paso debe dejar idénticos, byte a byte, los diagramas que no tengan extremos de grupo.

## Dividir `src/app.js` en módulos

**Estado: hecho en la v2.** Los modelos puros, el estado compartido y toda la interfaz viven ahora en `src/models/`, `src/core/` y `src/ui/`, como scripts clásicos que siguen abriendo con doble clic desde `file://`. `src/app.js` pasó de unas 11.700 a unas 5.800 líneas, las pruebas y la API pública `window.Diagramon` no cambiaron, y la versión anterior a la división se guarda en la rama `v1`. Más detalle en [cómo está dividido el código](project-structure.es.md#cómo-está-dividido-el-código-v2).

**Lo que queda, si alguien lo quiere.** El motor del lienzo (dibujo, conectores, partículas, interacción) y los análisis (seguridad, residencia, STRIDE, disponibilidad, linaje) se quedan en `src/app.js` a propósito: comparten mucho estado a través de clausuras (`S`, `R`, `VW`, `C`). Dividirlos más pediría las mismas reglas: un área por pull request, sin cambios de comportamiento y con las dos baterías de pruebas pasando.

## Reglas propias escritas por la persona usuaria

**Estado: no está previsto por ahora.** La mayoría de quienes usan Diagramon trabajan con equipos pequeños, donde las reglas de Revisión incluidas bastan.

**La necesidad.** Un equipo puede querer comprobaciones propias, por ejemplo «toda base de datos tiene dueño y copia de seguridad» o «nada etiquetado como *pci* puede estar en un grupo público», sin esperar a que exista una regla nueva.

**Hoy (alternativa).** Las reglas incluidas se activan o desactivan y se les da una severidad en `src/config.js` (bloques `rules`, `sec.*`, etc.). Para añadir un tipo nuevo de comprobación hay que escribir código en `src/app.js` y registrarlo con `addFindingSource`.

**Diseño propuesto.** Una lista declarativa pequeña de reglas guardada en el diagrama (o en el manifiesto del espacio de trabajo para compartirlas): *qué mirar* (componentes, conexiones o grupos, filtrados por tipo, etiqueta o campo), *la condición* (falta un campo, es igual a, o no es uno de varios valores) y *el mensaje y la severidad*. Se ejecutarían como una fuente más de Revisión (`custom`). Sin programación: solo datos, para que una regla no pueda ejecutar código de un archivo importado.

**Por qué no ahora.** Añade un lenguaje de reglas que documentar, validar y mantener estable, y una forma de equivocarse difícil de depurar. Las reglas incluidas ya cubren los casos habituales, y `addFindingSource` es un camino corto para quien necesite una más.

## Firmas verificables en las aprobaciones

**Estado: no está previsto por ahora.**

**La necesidad.** Donde una aprobación tiene peso legal o de auditoría, alguien puede necesitar probar *quién* aprobó *qué versión exacta*, y que no se cambió después.

**Hoy (alternativa).** Una aprobación guarda el interesado, el veredicto, una fecha y una nota. Cualquiera que pueda editar el archivo podría escribir cualquier nombre, así que el registro es una comodidad para un equipo pequeño que ya confía entre sí, no una prueba. Si necesitas prueba, guarda el archivo exportado en un sistema que firme o selle documentos (un *commit* firmado, un servicio de firma de documentos).

**Diseño propuesto.** Firmar la foto aprobada (la versión, tal como se serializa) con una clave que controle quien aprueba, con Web Crypto del navegador (por ejemplo ECDSA P-256): la aprobación guarda la clave pública, la firma y el *hash* de la foto. Al ver la versión se verificaría y mostraría *firma válida* o *la versión cambió después de firmarse*. El almacenamiento de claves y quién puede firmar serían ajustes del manifiesto del espacio de trabajo.

**Por qué no ahora.** Lo difícil no es la criptografía sino la confianza: cómo obtiene una clave quien aprueba, cómo se ata a una persona, qué pasa si se pierde. Sin eso, una firma parece más fuerte de lo que es. Con clientes pequeños es más fácil comprobar directamente que quien aprobó es quien dice ser.

## Exportar a ArchiMate

**Estado: no está previsto por ahora.**

**La necesidad.** Los equipos de arquitectura empresarial que modelan en herramientas ArchiMate (Archi y otras) querrían partir de un diagrama de Diagramon en lugar de redibujarlo.

**Hoy (alternativa).** Exporta a draw.io, Mermaid o PlantUML, o a Excel (el inventario), y reconstruye el modelo en la otra herramienta.

**Diseño propuesto.** Un exportador en `src/export/` que escriba el *Open Exchange File Format* de ArchiMate (XML): los componentes pasan a ser elementos de aplicación o de tecnología según su tipo, las conexiones pasan a ser relaciones de flujo o de servicio, los grupos pasan a ser elementos de agrupación, y las capas (negocio, aplicación, tecnología) siguen el campo `layer` cuando está puesto. Importar es un paso aparte y mayor, y no forma parte de esta idea.

**Por qué no ahora.** La correspondencia entre los tipos de Diagramon y las reglas estrictas de elementos y relaciones de ArchiMate exige decisiones que solo puede tomar bien quien usa ArchiMate a diario, y una correspondencia incorrecta produce modelos que las herramientas rechazan o que engañan.

## Exportar e importar Structurizr

**Estado: no está previsto por ahora.**

**La necesidad.** Los equipos que describen su arquitectura como código con el modelo C4 en Structurizr querrían pasar entre ese texto y un diagrama de Diagramon.

**Hoy (alternativa).** Diagramon ya tiene niveles C4 (`in` en componentes y grupos) y sus exportaciones a Mermaid, PlantUML y draw.io conservan el anidado C4 como contenedores. La pestaña *Texto* es una descripción en texto plano de todo el diagrama.

**Diseño propuesto.** Un exportador que escriba un espacio de trabajo en el DSL de Structurizr (personas, sistemas de software, contenedores y componentes a partir de los niveles C4, relaciones con sus etiquetas). Un importador del mismo subconjunto vendría después, conservando solo lo que Diagramon puede representar y listando lo que descartó.

**Por qué no ahora.** El DSL es un lenguaje completo (vistas, estilos, inclusiones, scripts). Un importador parcial que ignore partes en silencio sería peor que ninguno, y la exportación sola aporta poco a quien aún no usa Structurizr.

## Exportar al catálogo de Backstage

**Estado: no está previsto por ahora.**

**La necesidad.** Los equipos con un portal de desarrolladores Backstage quieren llevar al catálogo los componentes, dueños y dependencias de un diagrama de Diagramon, sin teclearlos dos veces.

**Hoy (alternativa).** El inventario (Excel o CSV) lista cada componente con su dueño, equipo y capa; puede convertirse en archivos `catalog-info.yaml` con un script corto.

**Diseño propuesto.** Un exportador que escriba un documento `catalog-info.yaml` por componente (`kind: Component` o `Resource` según el tipo), con `spec.owner` a partir del campo dueño o equipo, `spec.system` a partir del grupo, y `dependsOn` a partir de las conexiones. Los campos que Backstage exige y Diagramon no tiene (como `lifecycle`) tendrían un valor por defecto visible.

**Por qué no ahora.** Los catálogos de Backstage tienen convenciones propias (nombres de dueños, de sistemas, anotaciones) que deben coincidir con el portal. Sin conocerlas, la exportación habría que editarla igualmente, y quienes la necesitan están en equipos mayores que aquellos a los que apunta Diagramon.

## Combinar dos copias editadas de un diagrama

**Estado: no está previsto por ahora.**

**La necesidad.** Dos personas editan el mismo diagrama a la vez y luego necesitan juntar su trabajo.

**Hoy (alternativa).** Guarda una versión antes de compartir (ver *Versiones*), compara luego los dos archivos con la comparación de versiones y copia los cambios a mano. En una carpeta de espacio de trabajo, deja una persona responsable de cada diagrama.

**Diseño propuesto.** Una combinación a tres bandas por id de elemento: tomar el ancestro común (una versión guardada de la que partieron ambas) y las dos copias, aplicar solos los cambios que tocan elementos distintos y pedir una decisión donde ambas cambiaron el mismo campo del mismo elemento. La comparación ya sabe qué campos importan (`DIFF_FIELDS`), así que puede ser la base. Las posiciones (`x`, `y`) se tomarían del lado que movió el elemento.

**Por qué no ahora.** Una combinación errónea pierde en silencio el trabajo de alguien, así que necesita una pantalla de conflictos cuidadosa y muchas pruebas. Con una o dos personas por diagrama, la comparación de versiones y una conversación breve bastan.
