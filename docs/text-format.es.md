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
| `a -> b : x latencia=1h` | Tiempo que tarda el dato en esa conexión, p. ej. `15m`, `1h`, `1d` (en inglés: `latency=`); alimenta la frescura de extremo a extremo de los conjuntos que lleva |
| `región=eu-west-1` | Región de un nodo o grupo (también `region=`, `país=`, `country=`); los nodos la heredan del grupo |
| `conjunto DS-001 orders: capa=plata frescura=1d …` | Conjunto del catálogo (en inglés: `dataset`), con sus líneas `columna`, `regla` y `contrato`; ver *Conjuntos de datos* más abajo |
| `a -> b : x datos=pii transferencia=ok` | Transferencia entre jurisdicciones autorizada (`transfer=ok` en inglés) |
| `fase mvp: "MVP" fecha=2026-12 objetivo="…"` | Fase del plan, en orden de línea de tiempo (en inglés: `phase mvp: "MVP" date=2026-12 goal="…"`); ver *Fases* abajo |
| `a: A fase=mvp hasta=ola2` · `a -> b : x fase=ola1` · `grupo g "G" fase=mvp {` | Fase en la que aparece un nodo, conexión o grupo (en inglés: `phase=`) y, si es temporal, la fase en la que se retira (`hasta=`, en inglés `until=`) |
| `capa=oro` (`bronce`, `plata`, `oro`; también `crudo`, `curado`, `consumo` y los nombres en inglés) | Capa del data lake de un nodo o grupo (en inglés: `layer=gold`); los nodos la heredan del grupo |
| `capas: zonas` | Muestra Crudo / Curado / Consumo en vez de Bronce / Plata / Oro (en inglés: `layers: zones`) |
| `disposición=rehospedar` (`retener`, `rehospedar`, `replataformar`, `refactorizar`, `recomprar`, `retirar`) | Disposición de migración (6R) de un nodo (en inglés: `disposition=rehost`; `retain`, `rehost`, `replatform`, `refactor`, `repurchase`, `retire`). También valen los alias de `config.js › migration`, y un valor desconocido es un error en su línea |
| `radar=oracle11` (o `radar=none`) | Fija un nodo a una entrada del radar tecnológico (un `id` de `config.js › techRadar` o de la lista `radar` del propio diagrama), o lo excluye. Sin él, el nodo se reconoce por las reglas de coincidencia de las entradas. Las entradas no se escriben en el texto |
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
El texto es la fuente de verdad de notas, zonas, fronteras de confianza, notas STRIDE, hallazgos descartados, fases, decisiones de arquitectura (ADR), requisitos y el registro RAID: borrarlos del texto los borra del diagrama. Las versiones se conservan.
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
- `firmas:` (en inglés `signoffs:`) lista las firmas de la decisión, la más antigua primero: `SH-001 aprueba 2026-10-08 nota="…"` separadas por `;` (en inglés `SH-001 approve 2026-10-08 note="…"`; `rechaza` es `reject`). Cada id debe ser un interesado del diagrama, si no se reporta el número de línea. Ver *Interesados (RACI)* más abajo.
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
| `frescura` (`freshness`) | `conjunto=` (`ds=`) nombre del conjunto, `objetivo=` (`target=`) horas, p. ej. `4` | la frescura de extremo a extremo del conjunto (suma de las latencias de su camino más lento) no supera el objetivo |

- La línea de campo es `detalle:` (`detail:`) y solo vale justo después de su línea `req`. Al leer se aceptan los dos idiomas; el texto se escribe en el idioma activo, así que el viaje de ida y vuelta es exacto. Parámetros sin `control=`, valores desconocidos, un `desde=` / `hasta=` que no es un componente y enlaces a cosas que no existen se señalan con su número de línea. Borrar un bloque `req` del texto borra el requisito.

### Registro RAID (riesgos, supuestos, problemas, dependencias)

Una línea por item, escrita después de las decisiones y los requisitos. La primera palabra es el tipo y el id empieza por su letra: `R-` riesgo, `A-` supuesto, `I-` problema, `D-` dependencia. Los campos de texto van en las líneas siguientes, entre comillas (`\n` = salto de línea).

```
riesgo R-001: "Falta la licencia CDC de SAP" p=3 i=4 dueño="PMO" estado=abierto registrado=2026-10-07 enlaces=ADR-007,erp
  mitigación: "Pedir cotización al proveedor ya."
  detalle: "Los proveedores suelen cobrar aparte el CDC basado en logs."
supuesto A-001: "Volumen <= 2 TB/día" validación=pendiente fecha=2026-11-15 dueño="Dueño del dato" enlaces=ADR-002,REQ-003
  historial: validado 2026-11-02 por="Ana" nota="Revisado con finanzas"; invalidado 2026-12-01
problema I-001: "Sin acceso al sistema de pruebas del ERP" estado=abierto fecha=2026-11-01
dependencia D-001: "El equipo de red abre el enlace privado" estado=abierto fecha=2026-11-30 enlaces=ADR-014,iam
```

- Claves (en inglés entre paréntesis): `p=` probabilidad e `i=` impacto, de 1 a 5, solo en riesgos; `dueño=` (`owner=`); `estado=abierto|cerrado` (`status=open|closed`) en riesgos, problemas y dependencias; `validación=pendiente|validado|invalidado` (`validation=pending|validated|invalidated`) en supuestos; `fecha=` (`due=`, validar antes de / necesario para, no en riesgos); `registrado=` (`raised=`); `enlaces=` (`links=`).
- Palabras de tipo: `riesgo`, `supuesto`, `problema`, `dependencia` (en inglés `risk`, `assumption`, `issue`, `dependency`).
- `enlaces=` es una lista separada por comas de ids de decisión (`ADR-001`), ids de requisito (`REQ-001`), ids de componente, ids de grupo y conexiones escritas `origen->destino` (añade `#2` para la segunda de varias iguales). Un enlace a algo que no existe es un error, salvo los ids de requisito, que se comprueban al cargar el diagrama.
- Campos: `detalle:` (`detail:`), `mitigación:` (`mitigation:`, riesgos) e `historial:` (`history:`, supuestos): cambios de validación del más antiguo al más reciente, `validado|invalidado|pendiente AAAA-MM-DD por="…" nota="…"` separados por `;` (en inglés `validated`, `invalidated`, `pending`, `by=`, `note=`).
- Un campo solo vale justo después de la línea del item (o de otro campo). Al leer se aceptan ambos idiomas; el texto se escribe en el idioma activo. Borrar las líneas de un item lo borra.

Un nodo que solo aparece en una conexión se crea solo. Los errores salen en rojo con su número de línea.
El texto no guarda posiciones: los nodos que ya existían no se mueven y los nuevos se colocan junto a sus vecinos.

### Interesados (RACI)

Una línea `stakeholder` por persona (en español `interesado`), escrita después del registro RAID. El id es `SH-` y un número; el nombre va entre comillas.

```
interesado SH-001: "Ana Pérez" rol="CISO" org=cliente raci=*:C,Seguridad:A,Platform:R versiones
interesado SH-002: "Luis Gómez" rol="Dueño del dato" org=socio raci=Consumo:A,*:I inactivo
```

- Claves (en inglés entre corchetes): `rol=` (`role=`); `org=` con `cliente`, `socio` o `interno` (`client`, `partner`, `internal`); `raci=` es una lista separada por comas de `área:letra`, con `R` (responsable), `A` (aprueba), `C` (consultado) o `I` (informado). `*` vale para todas las áreas. Las áreas son las de decisión y no pueden llevar comas.
- Palabras sueltas: `versiones` (`versions`) hace al interesado aprobador de versiones; `inactivo` (`inactive`) marca a quien dejó el proyecto: nunca se exige, el historial se conserva.
- Al leer se aceptan ambos idiomas; el texto se escribe en el idioma activo (`stakeholder … role= org=client raci= versions inactive`). Un id repetido, un id o org no válido, o una letra de RACI no válida es un error con su número de línea. Borrar una línea `interesado` borra al interesado y su fila RACI.

### Fases

Las líneas `fase` describen la construcción por etapas. Escríbelas antes de los nodos, en orden de línea de tiempo (la primera línea es la primera fase). Cada una tiene un id, un nombre entre comillas y, opcionalmente, una fecha y un objetivo:

```
fase mvp: "MVP" fecha=2026-12 objetivo="Ingesta por lotes de archivos del ERP y el CRM, primer BI"
fase ola1: "Ola 1" fecha=2027-03 objetivo="Captura de cambios y la capa oro"
fase ola2: "Ola 2" fecha=2027-06

erp: ERP [db]
crm: CRM [db]
subida: Carga manual de archivos fase=mvp hasta=ola1
cdc: Replicación CDC fase=ola1
flujo: Flujo de eventos fase=ola2
erp -> cdc : cambios fase=ola1
erp -> subida : extracción fase=mvp
```

- Claves (en inglés entre corchetes): `fecha=` (`date=`), `AAAA-MM` o `AAAA-MM-DD`; `objetivo=` (`goal=`), texto libre entre comillas. Hasta 12 fases; los ids son letras, dígitos, `-` y `_` (hasta 30 caracteres).
- Los nodos, conexiones y grupos llevan `fase=<id>` (`phase=`): la fase en la que aparecen. Sin ella, están desde la primera fase. `hasta=<id>` (`until=`) es la fase desde la que ya no están (un componente temporal). `hasta` debe ir después de `fase` en el orden (después de la primera fase si no hay `fase`).
- Un id de fase desconocido, o un `hasta` que no va después de su fase, es un error con su número de línea. Borrar una línea `fase` mientras hay elementos que la usan también es un error: cambia o borra antes esas referencias.
- Al leer se aceptan ambos idiomas; el texto se escribe en el idioma activo (`phase mvp: "MVP" date=… goal=…` y `phase=wave1 until=wave2`), así que hace el viaje de ida y vuelta exacto.

### Conjuntos de datos

Las líneas `conjunto` declaran los conjuntos del catálogo de datos. Escríbelas después de los interesados. Un nombre en una conexión (`tablas=`) se une con el conjunto del mismo nombre (sin distinguir mayúsculas), y un nombre que solo aparece en conexiones está *sin documentar* hasta que se declara. Cada línea de conjunto va seguida de líneas de campo con sangría: `columna`, `regla` y `contrato`, que deben ir justo debajo de una línea `conjunto`.

```
fase ola1: "Ola 1" fecha=2027-03

erp: ERP [db]
lake: Lakehouse [storage] capa=plata
bi: BI dashboards [user]

conjunto DS-001 orders: capa=plata dominio=Ventas dueño="Plataforma de datos" producto=sí clases=pii formato=delta frescura=2d por_dia=2 retencion=365 responsable="Ana Pérez" desc="Pedidos del ERP"
  columna order_id: string clave nulo=no
  columna email: string pii desc="Correo del cliente"
  columna amount: decimal
  regla not_null order_id severidad=alta
  regla range amount param="0..1000000"
  contrato 1.0.0 estado=acordado consumidores=bi terminos="Diario antes de las 06:00"
conjunto DS-002 customers: capa=plata clases=pii fase=ola1
  columna customer_id: string clave
  regla unique customer_id severidad=alta
  contrato 0.1.0 estado=borrador

erp -> lake : carga nocturna tablas=orders,customers latencia=1d
lake -> bi : JDBC tablas=orders latencia=15m
```

- **Línea de conjunto**: `conjunto DS-001 orders: …`. El id es `DS-` y un número (único); el nombre es la clave que se une con `tablas=` (entre comillas si lleva espacios o `:`). Claves (en inglés entre corchetes): `capa=` (`layer=`) `bronce`, `plata` u `oro` (también `crudo`, `curado`, `consumo`…); `dominio=` (`domain=`); `dueño=` (`owner=`), id de un interesado o texto libre; `responsable=` (`steward=`); `producto=sí` (`product=yes`) marca un producto de datos; `clases=` (`classes=`) clases de datos, p. ej. `pii`; `formato=` (`format=`) `delta`, `iceberg`, `hudi`, `parquet`, `avro`, `json`, `csv` u `other`; `frescura=` (`freshness=`) el SLA, como `15m`, `4h` o `1d`; `por_dia=` (`per_day=`) el volumen en GB por día; `retencion=` (`retention=`) la retención en días; `fase=` (`phase=`) la fase desde la que existe el conjunto; `desc=` la descripción.
- **Línea de columna**: `columna <nombre> <tipo> clave pii nulo=no desc="…"` (en inglés `column … key pii nullable=no desc=`). `clave` marca una clave primaria y `pii` una columna de datos personales; el tipo puede llevar espacios si va entre comillas.
- **Línea de regla**: `regla <regla> <columna> param="…" severidad=baja|media|alta` (`rule … severity=`). Las reglas son `not_null`, `unique`, `range`, `regex`, `accepted_values`, `freshness` y `custom`; la columna y `param=` son opcionales.
- **Línea de contrato**: `contrato <versión> estado=borrador|acordado|obsoleto consumidores=<ids de componente> terminos="…"` (`contract … status= consumers= terms=`). Los consumidores son ids de componente, separados por comas.
- La **latencia** va en una conexión: `a -> b : carga latencia=1h` (`latency=1h`), el tiempo que tarda el dato en ese salto. Para cómo se calcula la frescura, ver la sección *Catálogo de datos y contratos de datos* de la guía.
- Un nivel, clase de datos, fase, regla, severidad, estado, formato o duración desconocidos, un id de conjunto no válido o repetido, un nombre usado dos veces, un consumidor que no es un componente, y una línea de campo que no va justo debajo de un conjunto son errores, con su número de línea. Borrar las líneas `conjunto` borra los conjuntos.

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
- `datasets` (opcional, solo se escribe si hay alguno) lista el catálogo: `id`, `name` y, opcionalmente, `domain`, `layer`, `owner`, `steward`, `product`, `classes`, `format`, `freshness`, `volume` (`perDay`, `retentionDays`), `schema`, `quality`, `contract` (`version`, `status`, `consumers`, `terms`) y `phase`. Una conexión con `latency` (`"1h"`) es el tiempo que tarda su dato en ese salto.
- `requirements` (opcional, solo se escribe si hay alguno) lista los requisitos: `id`, `title`, `kind`, `status` y, opcionalmente, `detail`, `priority`, `source`, `check` (`{ metric, from, to, target, cls, jur }`) y `links` (`decisions`, `nodes`, `edges`, `groups`).
- El archivo exportado también lleva `versions` (cada una con `kind`: `version` o `env`, y su propio `diagram`) y `active`.
- `color` acepta una clave de la paleta o cualquier color CSS.

</details>
