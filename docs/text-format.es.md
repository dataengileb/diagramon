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
| `a -> b -> c : etiqueta` | Cadena; la etiqueta va en la última flecha |
| `líneas: codos` · `a -> b : x línea=curva` | Líneas en ángulo recto o curvas, para el diagrama o una conexión |
| `autor: …` · `versión: …` | Salen en el cajetín de la exportación |
| `revisión db: "BD en subred pública" por=Ana levantada=2026-10-01 compromiso=2026-11-15` | Observación de revisión (`estado=resuelta cerrada=…` al corregirla) |
| `# …` o `// …` | Comentario |

Las palabras clave funcionan en los dos idiomas: `title`/`título`, `group`/`grupo`, `cost`/`costo`, `/month`/`/mes`, `/hour`/`/hora`, `/year`/`/año`, `/3years`/`/3años`.
El texto es la fuente de verdad de notas, zonas, fronteras de confianza, notas STRIDE y hallazgos descartados: borrarlos del texto los borra del diagrama. Las versiones y las decisiones de arquitectura (ADR) se conservan.
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
