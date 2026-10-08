[← Diagramon](../README.es.md) · [English](text-format.md) · **Español**

# ⌨️ Diagrama como código (pestaña *Texto*)

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
| `id: nombre="Tienda [legado]" [db]` | Nodo cuyo nombre lleva comillas, corchetes, llaves o `clave=valor` (en inglés: `name="…"`); se escribe solo cuando hace falta |
| `color=… badge=… desc="…"` | Opciones del nodo |
| `costo=120/mes` · `0.1/hora` · `1400/año` · `5000/3años` | Costo en USD (sin periodo = mensual) |
| `sla=99.95` · `rpo=15m` · `rto=4h` · `réplicas=2` | Objetivo de disponibilidad en % (también `99.95%` o `99,95`), objetivos de punto y tiempo de recuperación (`s`, `m`, `h`, `d`) e instancias en paralelo; en inglés: `replicas=` |
| `datos=pii,pci` | Clasificación de datos de un nodo o una conexión |
| `a -> b : TLS cifrado=sí` | Cifrado en tránsito (`sí` o `no`) |
| `dueño="Ana Pérez" responsable=… equipo="Ing. de datos" centro=CC-100` | Responsables de un nodo o grupo (en inglés: `owner=` `steward=` `team=` `costcenter=`); los nodos heredan del grupo |
| `a -> b : SQL tablas=pedidos,clientes` | Conjuntos de datos de una conexión (también `datasets=` o `conjuntos=`); con espacios, entre comillas: `tablas="ventas pedidos,crm.clientes"` |
| `región=eu-west-1` | Región de un nodo o grupo (también `region=`, `país=`, `country=`); los nodos la heredan del grupo |
| `a -> b : x datos=pii transferencia=ok` | Transferencia entre jurisdicciones autorizada (`transfer=ok` en inglés) |
| `capa=oro` (`bronce`, `plata`, `oro`; también `crudo`, `curado`, `consumo` y los nombres en inglés) | Capa del data lake de un nodo o grupo (en inglés: `layer=gold`); los nodos la heredan del grupo |
| `capas: zonas` | Muestra Crudo / Curado / Consumo en vez de Bronce / Plata / Oro (en inglés: `layers: zones`) |
| `exposición=pública` (`interna`) · `respaldo=sí` (`no`) | Anula la exposición y el respaldo deducidos de un nodo (en inglés: `exposure=public` / `internal`, `backup=yes` / `no`) |
| `a -> b : SQL amenazas="T=mitigada,I=aceptada"` | Decisiones STRIDE de una conexión (en inglés: `threats=`); letras `S T R I D E`, estados `mitigada`, `aceptada`, `na` (en inglés `mitigated`, `accepted`, `na`) |
| `amenaza api -> db T: "TLS 1.3 siempre"` | Nota de una amenaza STRIDE ya decidida (en inglés: `threat`); la conexión se identifica por `origen -> destino` (cualquier flecha); si varias coinciden, `#2` elige la segunda: `amenaza api -> db #2 T: "…"`. La amenaza debe tener ya estado (`amenazas=…`); si no, es un error |
| `nota n1: "Texto\notra línea" en=120,40 tamaño=180,110 color=limon` | Nota adhesiva (en inglés: `note n1: "…" at=120,40 size=180,110`); `\n` es un salto de línea; posición y tamaño son opcionales (sin `en=` se coloca a la derecha de su nivel) |
| `zona z1: "Alcance PCI" severidad=alta en=… tamaño=… desc="…"` | Zona de riesgo (en inglés: `zone`, `severity=high`; severidades `baja`, `media`, `alta`, `crítica` · `low`, `medium`, `high`, `critical`) |
| `confianza t1: "DMZ" confianza=internet en=… tamaño=… desc="…"` | Frontera de confianza (en inglés: `trust t1: "DMZ" trust=internet …`) |
| `descartar sec:public-db:db: "Riesgo aceptado" por="Ana" fecha=2026-10-01` | Hallazgo descartado (en inglés: `dismiss … by=… date=…`). El id puede llevar `:` (el separador es el primer `:` seguido de espacio) o ir entre comillas: `descartar "sec:x:y": "motivo"` |
| `controles="iso27001:A.8.24=cumple,pcidss:4.2=brecha"` | Controles de cumplimiento de un nodo o grupo (en inglés: `controls=`, estados `met` `partial` `gap` `na`); cada uno es `marco:id=cumple\|parcial\|brecha\|na`; los nodos heredan de su grupo |
| `grupo id "Nombre" color=… { … }` | Grupo; se pueden anidar |
| `dentro=tienda` (en inglés: `in=tienda`) · `c4=contenedor` | Niveles C4: el nodo o grupo vive en el diagrama interno de `tienda`; tipo C4 `persona`, `sistema`, `contenedor`, `componente` o `externo` (en inglés: `person`, `system`, `container`, `component`, `external`). Los nodos dentro de las llaves de un grupo con `dentro=` heredan su nivel |
| `dentro tienda { … }` | Bloque de nivel C4 (en inglés: `inside tienda { … }`): todo lo declarado dentro (nodos, grupos, notas, zonas) vive en el diagrama interno de `tienda`, sin escribir `dentro=` en cada uno. Los bloques se anidan (`dentro api { … }` dentro de `dentro tienda { … }` exige que `api` sea un nodo de `tienda`); los grupos funcionan dentro de un bloque, pero un bloque no se abre dentro de un grupo. `dentro=` sigue valiendo |
| `a -> b` · `a => b` · `a ~> b` · `a ..> b` | Petición · datos · evento · opcional |
| `a -> b : copia nocturna estilo=replicación` | Tipo de conexión sin flecha propia (en inglés: `style=replication`): `replicación` (`replication`), `lotes` (`batch`), `streaming` (`stream`), `control`; también `sync`, `async`, `data`, `optional` y tus tipos propios. `estilo=` manda sobre la flecha; la pestaña Texto escribe `->` más `estilo=…` para estos |
| `a -> b : pedidos peso=alto` · `peso=crítico` | Importancia de una conexión (en inglés: `weight=high` / `weight=critical`; alias `importante` / `important`; `normal` es lo habitual y no se escribe). Línea más gruesa, punta mayor, más puntos |
| `tipo respaldo: "Tráfico de respaldo" trazo="6 3" color=cielo ancho=2 partículas=1` | Tipo de conexión propio de este diagrama (en inglés: `type backup: "…" dash=… width=… particles=…`). `id`: `a-z`, `0-9`, `-` (hasta 32, que no sea un nombre predefinido); `trazo`: de 1 a 6 números (`"12 4 2 4"`, vacío = continua); `color`: clave de la paleta o hex; `ancho` 1-4; `partículas` 0-4. Se usa con `a -> b : x estilo=respaldo` |
| `a -> b -> c : etiqueta` | Cadena; la etiqueta va en la última flecha |
| `líneas: codos` · `a -> b : x línea=curva` | Líneas en ángulo recto o curvas, para el diagrama o una conexión |
| `autor: …` · `versión: …` | Salen en el cajetín de la exportación |
| `revisión db: "BD en subred pública" por=Ana levantada=2026-10-01 compromiso=2026-11-15` | Observación de revisión (`estado=resuelta cerrada=…` al corregirla) |
| `# …` o `// …` | Comentario |

Las palabras clave funcionan en los dos idiomas: `title`/`título`, `group`/`grupo`, `cost`/`costo`, `/month`/`/mes`, `/hour`/`/hora`, `/year`/`/año`, `/3years`/`/3años`.
El texto es la fuente de verdad de notas, zonas, fronteras de confianza, notas STRIDE, hallazgos descartados, decisiones de arquitectura (ADR) y requisitos: borrarlos del texto los borra del diagrama. Las versiones se conservan.
### Decisiones de arquitectura (ADR)

Una línea `adr` abre una decisión; los campos van en las líneas siguientes, cada uno con su texto entre comillas (`\n` = salto de línea). Las decisiones se escriben al final del texto.

```
adr ADR-001: "Separar la tienda en front end web y API" estado=aceptada fecha=2026-06-02 decisores="Comité de arquitectura" enlaces=tienda,api,tienda->api,version:v1
  contexto: "El monolito ata las versiones de la interfaz a las del backend.\nNo permite escalarlas por separado."
  decisión: "Servir el front end React desde CloudFront y exponer una API sin estado."
  consecuencias: "Despliegues independientes; ahora hace falta versionar la API."
  historial: propuesta 2026-05-20 por="Ana" nota="Primer borrador"; aceptada 2026-06-02
adr ADR-002: "Procesar el despacho con una cola" estado=reemplazada reemplazada-por=ADR-003
```

- Claves de la cabecera (en inglés entre paréntesis): `estado=` (`status=`) con `propuesta`, `aceptada`, `rechazada`, `obsoleta` o `reemplazada` (`proposed`, `accepted`, `rejected`, `deprecated`, `superseded`); `fecha=` (`date=`); `decisores=` (`deciders=`); `enlaces=` (`links=`); `reemplazada-por=` (`superseded-by=`, el id de la decisión más nueva).
- `enlaces=` es una lista separada por comas de ids de componentes, ids de grupos, conexiones escritas `origen->destino` (añade `#2` para elegir la segunda de varias conexiones iguales) y versiones escritas `version:<id>`.
- Campos: `contexto:`, `decisión:`, `consecuencias:` (en inglés: `context:`, `decision:`, `consequences:`) e `historial:` (`history:`): los cambios de estado, el más antiguo primero, `estado AAAA-MM-DD por="…" nota="…"` separados por `;`.
- Las opciones y los criterios (todo opcional) van en las mismas líneas de campo. Agrega `área="Almacenamiento"` (`area=`) a la línea `adr` y luego:

```
adr ADR-003: "Formato de tabla abierto" estado=propuesta área="Almacenamiento"
  criterio costo: "Costo" peso=3
  criterio habilidades: "Habilidades del equipo" peso=4
  opción A: "Delta Lake" elegida costo=0 riesgo=bajo versión=v2 puntos=costo:4,habilidades:5 resumen="El ecosistema más maduro." pros="• Amplio soporte\n• Conocido por el equipo" contras="• Requiere tareas de mantenimiento"
  opción B: "Iceberg" puntos=costo:3,habilidades:2
```

  `criterio <id>: "Etiqueta" peso=1..5` (inglés `criterion … weight=`; id `a-z 0-9 -`, hasta 30 caracteres). `opción <id>: "Título"` (`option`; id con letras, dígitos y `-`, hasta 20) con la palabra suelta opcional `elegida` (`chosen`; solo una opción por decisión), `costo=` número mensual (`cost=`), `riesgo=bajo|medio|alto` (`risk=low|medium|high`), `versión=<id de una versión guardada>` (`version=`; se descarta si no existe), `puntos=criterio:1..5,…` (`scores=`; solo criterios declarados en la misma decisión) y `resumen=`, `pros=`, `contras=` entre comillas (`summary=`, `cons=`). Al leer se aceptan ambos idiomas; el texto se escribe en el idioma activo. Los errores indican el número de línea.
- Un campo solo vale justo después de su línea `adr` (o de otro campo); cualquier otra línea cierra la decisión. Borrar un bloque `adr` del texto borra la decisión. Las versiones no están en el texto: los enlaces `version:<id>` solo se conservan para versiones que ya existen.

Los colores también aceptan su nombre en inglés (`peach`, `sky`, `mint`…).

### Requisitos

Una línea `req` registra un requisito; su detalle opcional va en la línea siguiente. Los requisitos se escriben después de las decisiones.

```
req REQ-001: "Los datos personales se quedan en la UE" tipo=restricción prioridad=debe estado=acordado fuente="CISO" control=residencia clase=pii jurisdicción=eu enlaces=ADR-005,raw,raw->bi
  detalle: "Ninguna copia de datos personales puede almacenarse ni procesarse fuera de la UE."
req REQ-002: "Capa de consumo disponible al 99,9 %" tipo=rnf prioridad=debería estado=borrador control=disponibilidad desde=gold hasta=bi objetivo=99.9 enlaces=ADR-012,sqlwh
```

- Claves de la cabecera (en inglés entre paréntesis): `tipo=` (`kind=`) con `impulsor`, `rnf`, `restricción` o `principio` (`driver`, `nfr`, `constraint`, `principle`); `prioridad=` (`priority=`) con `debe`, `debería` o `podría` (`must`, `should`, `could`); `estado=` (`status=`) con `borrador`, `acordado` o `descartado` (`draft`, `agreed`, `dropped`); `fuente=` (`source=`, quién lo pidió, hasta 120 caracteres). Sin `tipo=` el requisito es un `impulsor`; sin `estado=`, un `borrador`.
- `enlaces=` (`links=`) es una lista separada por comas de ids de decisiones, de componentes, de grupos y conexiones escritas `origen->destino` (`#2` elige la segunda de varias conexiones idénticas).
- `control=` (`check=`) añade un control que la aplicación evalúa con lo que ya calcula; solo corre en requisitos `acordado`. La métrica decide qué parámetros se usan:

| `control=` (inglés) | Parámetros | Cumple cuando |
|---|---|---|
| `disponibilidad` (`availability`) | `desde=` `hasta=` (`from=` `to=`) ids de componentes, `objetivo=` (`target=`) porcentaje, p. ej. `99.9` | la disponibilidad compuesta de la ruta alcanza el objetivo |
| `rpo`, `rto` | `desde=` `hasta=`, `objetivo=` en horas | el peor RPO / RTO de la ruta no supera el objetivo |
| `costo` (`cost`) | `objetivo=` costo mensual en la moneda de la aplicación | el costo mensual total no supera el objetivo |
| `cifrado` (`encryption`) | `clase=` (`cls=`) id de clase de datos, p. ej. `pii` | toda conexión que lleva esa clase está marcada como cifrada |
| `residencia` (`residency`) | `clase=`, `jurisdicción=` (`jur=`) id de jurisdicción, p. ej. `eu` | ninguna conexión que cruza fronteras sin aprobar lleva esa clase fuera de esa jurisdicción |

- La línea de campo es `detalle:` (`detail:`) y solo vale justo después de su línea `req`. Al leer se aceptan los dos idiomas; el texto se escribe en el idioma activo, así que el viaje de ida y vuelta es exacto. Parámetros sin `control=`, valores desconocidos, un `desde=` / `hasta=` que no es un componente y enlaces a cosas que no existen se señalan con su número de línea. Borrar un bloque `req` del texto borra el requisito.

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
  "edges":  [ { "from": "api", "to": "db", "label": "SQL", "style": "sync | async | data | optional | replication | batch | stream | control | <id propio>", "weight": "high | critical", "color": "rosa" } ],
  "edgeTypes": [ { "id": "backup", "label": "Tráfico de respaldo", "dash": "6 3", "color": "cielo", "width": 2, "particles": 1 } ]
}
```

- Solo `id` y `type` son necesarios en los nodos. Sin `x`/`y` se colocan solos.
- `costPeriod`: `hour`, `year` o `multi` (con `costYears`). Sin `costPeriod` el costo es mensual.
- `weight` (`high` o `critical`; sin él = normal) es la importancia de una conexión. `edgeTypes` (opcional) son los tipos de conexión propios del diagrama: `id` (`a-z0-9-`, hasta 32), `label` (hasta 60) y, opcionales, `dash` (números separados por espacios), `color` (clave de la paleta o hex), `width` (1-4) y `particles` (0-4); una conexión usa uno con `"style": "<id>"`.
- `routing: "elbow"` pone líneas en ángulo recto en todo el diagrama; `route` (`curved` o `elbow`) lo cambia en una conexión. `meta` guarda `author` y `version`.
- `review` en un nodo: `{ "status": "open" | "resolved", "note", "by", "raised", "due", "closed" }`, con fechas `AAAA-MM-DD`.
- `data` es la lista de clasificaciones (`["pii", "pci"]`) en nodos y conexiones. `encrypted` (`true` o `false`) es el cifrado en tránsito de una conexión.
- `requirements` (opcional, solo se escribe si hay alguno) lista los requisitos: `id`, `title`, `kind`, `status` y, opcionalmente, `detail`, `priority`, `source`, `check` (`{ metric, from, to, target, cls, jur }`) y `links` (`decisions`, `nodes`, `edges`, `groups`).
- El archivo exportado también lleva `versions` (cada una con `kind`: `version` o `env`, y su propio `diagram`) y `active`.
- `color` acepta una clave de la paleta o cualquier color CSS.

</details>
