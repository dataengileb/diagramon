/* ==========================================================================
   Diagramon · lenguaje de texto (diagrama como código)
   --------------------------------------------------------------------------
   Convierte texto en un diagrama y un diagrama en texto. Sin IA, sin red.

     título: Tienda online
     dirección: LR                      (LR = izquierda→derecha, TB = arriba→abajo)

     grupo aws "AWS" color=melocoton {
       api: API Gateway [aws/apigateway] "REST"
       db: RDS Postgres [rds] "Multi-AZ" badge=x2
     }
     usuarios: Usuarios [user] desc="Clientes web"

     usuarios -> api : HTTPS            (-> petición)
     api -> db : SQL                    (=> datos, ~> evento, ..> opcional)
     api ~> cola : eventos              (un nodo no declarado se crea solo)

   Nodo:     id: Nombre [tipo o icono] "detalle" color=… badge=… costo=120/mes desc="…"
             nombre con comillas, corchetes o clave=valor: id: name="Tienda [legado]" (es: nombre="…")
             costo: número en USD + /hora, /mes, /año o /3años (sin periodo = mensual)
   Grupo:    grupo id "Nombre" icon=aws/group-vpc color=… kind=physical { … }   (se pueden anidar; icon = icono de grupo, opcional;
             kind=logical|physical / tipo=lógico|físico, opcional: sin él se deduce del icono y del nombre)
   Vista:    view: security   (vista con la que se abre: full, context, logical, physical, security, data, cost, governance/gobierno, resilience/resiliencia; opcional)
   Gobierno: nodo o grupo … owner="Ana Pérez" steward=… team="Data Eng" costcenter=CC-100   (en español: dueño= responsable= equipo= centro=;
             los nodos heredan cada campo del grupo más cercano que lo tenga; los valores con espacios van entre comillas)
   Conexión: a -> b -> c : etiqueta color=…   (la etiqueta va en la última flecha)
   Datos:    nodo … data=pii,pci · conexión a -> b : SQL data=pii encrypted=yes
   Tipo y peso: conexión a -> b : réplica style=replication (es: estilo=replicación; sin flecha propia: replication|replicación, batch|lotes,
             stream|streaming, control; también async, data… y los tipos propios) · weight=high|critical (es: peso=alto|crítico; alias importante)
   Tipos propios: type backup: "Tráfico de respaldo" dash="6 3" color=sky width=2 particles=1 (es: tipo …; trazo= ancho= partículas=); id a-z 0-9 y -;
             luego a -> b : x style=backup. Viven en el diagrama (model.edgeTypes)
   Linaje:   conexión a -> b : SQL datasets=orders,customers   (es: tablas= o conjuntos=; con espacios: datasets="sales orders,crm.customers")
   Residencia: nodo o grupo … region=eu-west-1 (también región=, country=/país= como alias; hereda del grupo) ·
             conexión a -> b : SQL data=pii transfer=ok (transferencia=ok: transferencia entre jurisdicciones autorizada)
   Amenazas: conexión a -> b : SQL threats="T=mitigated,I=accepted" (es: amenazas=): letras S T R I D E (STRIDE) con estado
             mitigated|mitigada, accepted|aceptada o na|no aplica; solo las decididas (las abiertas no se escriben)
   Capas:    nodo o grupo … layer=gold (capa=oro): bronze|silver|gold · bronce|plata|oro · raw|curated|serving · crudo|curado|consumo
             (los nodos heredan la capa de su grupo) · línea `layers: zones` / `capas: zonas` muestra Raw/Curated/Serving en vez de Bronze/Silver/Gold
   Migración: nodo … disposition=rehost (disposición=rehospedar): retain|rehost|replatform|refactor|repurchase|retire · retener|rehospedar|replataformar|refactorizar|recomprar|retirar
             (las 6R; también aceptan los alias de config.js › migration, y relocate|reubicar si ese valor está encendido)
   Radar:    nodo … radar=oracle11 (fija el componente a una entrada del radar tecnológico de config.js › techRadar o del diagrama; radar=none lo excluye; sin él se reconoce solo)
   Seguridad: nodo … exposure=public|internal (exposición=pública|interna: sustituye a la deducida) · backup=yes|no (respaldo=sí|no)
   Cumplimiento: nodo o grupo … controls="iso27001:A.8.24=met,pcidss:4.2=gap" (es: controles=; estados met|partial|gap|na · cumple|parcial|brecha|na;
             cada control es marco:id=estado, los nodos heredan de sus grupos; sin espacios no hacen falta comillas)
   Niveles C4: nodo o grupo … in=tienda (es: dentro=tienda): vive en el diagrama interno del nodo `tienda` (sin él, en el nivel superior);
             un nodo dentro de las llaves de un grupo con `in=` hereda ese nivel · nodo … c4=container (es: c4=contenedor): tipo C4
             person|persona, system|sistema, container|contenedor, component|componente, external|externo
   Disponibilidad: nodo … sla=99.95 (objetivo en %; también 99.95% o 99,95) · rpo=15m rto=4h (s, m, h, d; es: igual) · replicas=2 (es: réplicas=; instancias en paralelo, 1 = una sola)
   Niveles (bloque): inside tienda { … } (es: dentro tienda { … }): todo lo declarado dentro de las llaves (nodos, grupos, notas, zonas) vive en el
             diagrama interno del nodo `tienda`, sin escribir `in=` en cada uno; los bloques se anidan (`inside api { … }` dentro de `inside tienda { … }`
             exige que `api` sea un nodo de `tienda`); un bloque no se abre dentro de un grupo, pero un grupo sí dentro de un bloque; `in=` sigue valiendo
   Notas:    note n1: "Texto\ncon saltos" at=120,40 size=180,110 color=limon (es: nota n1: "…" en=120,40 tamaño=180,110); posición y tamaño opcionales
   Zonas:    zone z1: "Alcance PCI" severity=high at=… size=… desc="…" (es: zona z1: "…" severidad=alta|media|baja|crítica); low|medium|high|critical
   Fronteras de confianza: trust t1: "DMZ" trust=internet at=… size=… desc="…" (es: confianza t1: "DMZ" confianza=internet …)
   Notas STRIDE: threat api -> db T: "TLS 1.3 siempre" (es: amenaza api -> db T: "…"); la conexión se identifica por origen -> destino (cualquier flecha);
             si hay varias conexiones iguales, `#2` elige la segunda: threat api -> db #2 T: "…". La amenaza debe tener ya estado (threats=…); si no, es un error
   Descartados: dismiss sec:public-db:db: "motivo" by="Ana" date=2026-10-01 (es: descartar id: "motivo" por=Ana fecha=…); el id puede llevar `:`
             (el separador es el primer `:` seguido de espacio) o ir entre comillas: dismiss "sec:x:y": "motivo"
   Decisiones (ADR): adr ADR-001: "Título" status=accepted date=2026-06-02 deciders="Comité" links=tienda,api,tienda->api,version:v1 superseded-by=ADR-002
             (es: adr … estado=aceptada fecha= decisores= enlaces= reemplazada-por=; estados proposed|propuesta, accepted|aceptada, rejected|rechazada,
             deprecated|obsoleta, superseded|reemplazada). Los campos van en las líneas siguientes, cada uno con su texto entre comillas (\n = salto de línea):
               context: "…"  decision: "…"  consequences: "…"  history: proposed 2026-05-20 by="Ana" note="…"; accepted 2026-06-02
               signoffs: SH-001 approve 2026-10-08 note="…"; SH-002 reject 2026-10-09   (es: firmas: SH-001 aprueba … nota=; rechaza)
             (es: contexto: decisión: consecuencias: historial: … por= nota=). links= lista ids de nodos, grupos, conexiones (`origen->destino`, `#2` si hay
             varias iguales) y versiones (`version:<id>`; las versiones no viven en el texto, así que solo se conservan los enlaces a las que ya existen).
             Opciones evaluadas (opcional): area="Almacenamiento" en la línea `adr`, y líneas de campo con criterios y opciones:
               criterion cost: "Cost" weight=3
               option A: "Delta Lake" chosen cost=0 risk=low version=v2 scores=cost:4,skills:5 summary="…" pros="…" cons="…"
             (es: área= · criterio … peso= · opción … elegida costo= riesgo=bajo|medio|alto versión= puntos= resumen= pros= contras=). Puntos 1..5 por id de criterio;
             `version=` es el id de una versión guardada (las versiones no viven en el texto: setModel descarta las que no existen).
             Los campos solo valen justo después de la línea `adr` (o de otro campo); cualquier otra línea cierra la decisión.
   Requisitos: req REQ-001: "Los datos se quedan en la UE" kind=constraint priority=must status=agreed source="CISO" check=residency cls=pii jur=eu links=ADR-005,raw
             (es: req … tipo= prioridad= estado= fuente= control= clase= jurisdicción= enlaces=; tipos driver|impulsor, nfr|rnf, constraint|restricción, principle|principio;
             prioridades must|debe, should|debería, could|podría; estados draft|borrador, agreed|acordado, dropped|descartado). Un control (check=) es una función de aptitud
             que la app evalúa con lo que ya calcula (solo en requisitos acordados): availability|disponibilidad from= to= target=99.9 (es desde= hasta= objetivo=), rpo|rto from= to=
             target=horas, cost|costo target=mensual, encryption|cifrado cls=pii, residency|residencia cls=pii jur=eu, freshness|frescura ds=orders target=horas (es conjunto=). links= lista ids de decisiones, nodos, grupos y conexiones (`origen->destino`).
             El campo opcional va en la línea siguiente:   detail: "…"   (es: detalle:)
   Registro RAID: risk R-001: "Falta la licencia CDC" p=3 i=4 owner="PMO" status=open raised=2026-10-07 links=ADR-007,erp
             assumption A-001: "Volumen ≤ 2 TB/día" validation=pending due=2026-11-15 owner="Dueño del dato" links=ADR-002,REQ-003
             issue I-001: "…" status=open due=2026-11-01 · dependency D-001: "…" status=open due=2026-11-30
             (es: riesgo/supuesto/problema/dependencia, dueño=, estado=abierto|cerrado, validación=pendiente|validado|invalidado, fecha= (límite), registrado=, enlaces=;
             p= es la probabilidad y i= el impacto, de 1 a 5, solo en riesgos). Los ids son R-, A-, I- o D- más un número. Líneas de campo justo después:
               detail: "…"  mitigation: "…" (riesgos)  history: validated 2026-11-02 by="Ana" note="…"; invalidated 2026-12-01 (supuestos)
             (es: detalle: mitigación: historial: validado… invalidado… por= nota=). links= lista ids de decisiones (ADR-001), requisitos (REQ-001), nodos, grupos y conexiones (`origen->destino`, `#2` si hay varias iguales).
   Fases:    phase mvp: "MVP" date=2026-12 goal="Ingesta por lotes y primer BI" (es: fase mvp: "MVP" fecha=2026-12 objetivo="…"); el orden de las líneas es la línea de tiempo
             (máx. 12; fecha AAAA-MM o AAAA-MM-DD, opcional). Se escriben antes de los nodos. Nodo, grupo o conexión … phase=mvp until=wave2 (es: fase=mvp hasta=wave2):
             aparece en esa fase y se retira en la otra (hasta debe ir después de fase); sin phase, ya estaba en la primera. Una fase que no existe es un error con su línea.
   Interesados: stakeholder SH-001: "Ana Pérez" role="CISO" org=client raci="*:C,Seguridad:A,Data Platform:R" versions inactive
             (es: interesado … rol= org=cliente|socio|interno raci= versiones inactivo). raci= lista área:letra (R responsable, A aprueba, C consultado, I informado);
             `*` vale para todas las áreas; las áreas son las de las decisiones (ADR) y no pueden llevar comas; si alguna lleva espacios, la lista entera va entre comillas. `versions` = aprueba versiones; `inactive` = ya no participa.
   Conjuntos de datos: dataset DS-001 orders: layer=silver domain=Sales owner=SH-003 product=yes classes=pii format=delta freshness=1h per_day=2 retention=365 phase=wave1 steward="Ana" desc="Pedidos del ERP"
             (es: conjunto DS-001 orders: capa=plata dominio= dueño= producto=sí clases= formato= frescura= por_dia= retencion= fase= responsable= desc=; el nombre es la clave que une con
             `datasets=` de las conexiones; si lleva espacios o `:` va entre comillas). Líneas de campo justo debajo, con sangría:
               column order_id: string key   ·   column email: string pii nullable=no desc="Correo del cliente"   (es: columna … clave pii nulo=no desc=; el tipo con espacios va entre comillas)
               rule not_null order_id severity=high   ·   rule range amount param="0..1000000"   (es: regla … severidad=baja|media|alta param=; reglas not_null unique range regex accepted_values freshness custom)
               contract 1.0.0 status=agreed consumers=bi,api terms="Diario antes de las 06:00"   (es: contrato … estado=borrador|acordado|obsoleto consumidores= terminos=)
             Latencia de una conexión: a -> b : carga latency=1h (es: latencia=1h; 15m, 4h, 1d…): el tiempo que tarda el dato en ese salto. Se escriben después de los interesados.
   El texto es la fuente de verdad de notas, zonas, fronteras, notas STRIDE, descartados, decisiones (ADR), requisitos, registro RAID, fases, interesados y conjuntos de datos: borrarlos del texto los borra del diagrama.
   Comentario: líneas que empiezan por # o //

   Acepta las palabras clave en inglés y en español (title/título, group/grupo,
   cost/costo, /month/mes…). stringify(m, 'en') escribe en inglés y
   stringify(m, 'es') en español. Los errores salen en el idioma de ctx.lang.
   ========================================================================== */
(() => {
  'use strict';

  const ARROWS = { '->': 'sync', '~>': 'async', '=>': 'data', '..>': 'optional' };
  const ARROW_OF = { sync: '->', async: '~>', data: '=>', optional: '..>' };
  /* ---------- tipo (style=) y peso (weight=) de la conexión; tipos propios (type id: …) ---------- */
  const BUILTIN_STYLES = ['sync', 'async', 'data', 'optional', 'replication', 'batch', 'stream', 'control'];
  const STYLE_ES = { sincrona: 'sync', asincrona: 'async', datos: 'data', opcional: 'optional', replicacion: 'replication', lotes: 'batch', porlotes: 'batch', streaming: 'stream', flujo: 'stream', gestion: 'control' };
  const STYLE_OUT = { es: { replication: 'replicación', batch: 'lotes', stream: 'streaming', control: 'control' } };
  const WEIGHT_IN = { normal: '', high: 'high', alto: 'high', alta: 'high', important: 'high', importante: 'high', critical: 'critical', critico: 'critical', critica: 'critical' };
  const WEIGHT_OUT = { en: { high: 'high', critical: 'critical' }, es: { high: 'alto', critical: 'crítico' } };
  const TYPE_RE = /^(type|tipo)\s+([^\s:]+)\s*:\s*(.*)$/i;
  const TYPE_KEYS = ['dash', 'trazo', 'color', 'width', 'ancho', 'particles', 'particulas', 'partículas'];
  const DASH_OK = /^\d{1,2}(\.\d)?( \d{1,2}(\.\d)?){0,5}$/;
  const ARROW_SPLIT = /\s*(\.\.>|~>|=>|->)\s*/;
  const HAS_ARROW = /\.\.>|~>|=>|->/;
  const ID = /^[^\s:[\]"{}]+$/;
  /* ---------- fases: phase id: "nombre" date= goal= · y phase= until= en nodos, grupos y conexiones ---------- */
  const PHASE_RE = /^(phase|fase)\s+([^\s:]+)\s*:\s*(.*)$/i;
  const PHASE_KEYS = ['phase', 'fase', 'until', 'hasta'];
  const PHASE_LINE_KEYS = ['date', 'fecha', 'goal', 'objetivo'];
  const PHASE_ID = /^[A-Za-z0-9_-]{1,30}$/, PHASE_MAX = 12;
  const isPhaseDay = v => { const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v); if (!r) return false; const mo = +r[2], d = r[3] == null ? 1 : +r[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(+r[1], mo, 0)).getUTCDate(); };
  const NODE_KEYS = ['color', 'badge', 'desc', 'sub', 'x', 'y', 'costo', 'cost', 'data', 'datos', 'region', 'región', 'country', 'pais', 'país', 'layer', 'capa', 'disposition', 'disposición', 'disposicion', 'radar', 'exposure', 'exposición', 'exposicion', 'backup', 'respaldo', 'controls', 'controles', 'in', 'dentro', 'c4', 'sla', 'rpo', 'rto', 'replicas', 'réplicas', ...PHASE_KEYS];
  /* ---------- gobierno: dueño, responsable, equipo, centro de costo ---------- */
  const GOV_KEYS = { owner: 'owner', dueño: 'owner', dueno: 'owner', steward: 'steward', responsable: 'steward', team: 'team', equipo: 'team',
    costcenter: 'costCenter', centro: 'costCenter', centrocosto: 'costCenter', centrodecosto: 'costCenter' };
  const GOV_WORDS = ['owner', 'steward', 'team', 'costCenter'];
  const applyGov = (o, kv) => { for (const [key, v] of Object.entries(kv)) { const k = GOV_KEYS[key]; if (k && String(v).trim()) o[k] = String(v).trim(); } };
  /* ---------- cumplimiento: controls=marco:id=estado,… ---------- */
  const CTL_WORD = { met: 'met', cumple: 'met', partial: 'partial', parcial: 'partial', gap: 'gap', brecha: 'gap', na: 'na', 'n/a': 'na' };
  const CTL_OUT = { en: { met: 'met', partial: 'partial', gap: 'gap', na: 'na' }, es: { met: 'cumple', partial: 'parcial', gap: 'brecha', na: 'na' } };
  const CTL_KEY = { en: 'controls', es: 'controles' };
  // → { controls: { 'marco:id': estado }, bad: [par no válido] }
  const parseControls = v => {
    const controls = {}, bad = [];
    String(v).split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(p => {
      const i = p.lastIndexOf('='), k = p.slice(0, i).trim(), st = CTL_WORD[p.slice(i + 1).trim().toLowerCase()], c = k.indexOf(':');
      if (i > 0 && st && c > 0 && c < k.length - 1) controls[k] = st; else bad.push(p);
    });
    return { controls, bad };
  };
  /* ---------- niveles C4: in=<nodo> y c4=<tipo> ---------- */
  const C4_IN = { person: 'person', persona: 'person', system: 'system', sistema: 'system', container: 'container', contenedor: 'container', component: 'component', componente: 'component', external: 'external', externo: 'external' };
  const C4_OUT = { en: { person: 'person', system: 'system', container: 'container', component: 'component', external: 'external' }, es: { person: 'persona', system: 'sistema', container: 'contenedor', component: 'componente', external: 'externo' } };
  const REGION_KEYS = ['region', 'región', 'country', 'pais', 'país']; // todas escriben en `region`
  // review id: "observación" by=… raised=AAAA-MM-DD due=AAAA-MM-DD status=open|resolved closed=AAAA-MM-DD
  const REVIEW_KEYS = { by: 'by', por: 'by', raised: 'raised', levantada: 'raised', due: 'due', compromiso: 'due', status: 'status', estado: 'status', closed: 'closed', cerrada: 'closed' };
  const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00Z`)) && new Date(`${v}T12:00Z`).toISOString().slice(0, 10) === v;
  // Opciones al final de una conexión: a -> b : etiqueta color=… data=pii encrypted=yes
  // (el valor puede ir entre comillas: datasets="sales orders,crm.customers")
  const EDGE_OPT = /(?:^|\s)(color|style|estilo|weight|peso|data|datos|encrypted|cifrado|both|ambos|line|linea|línea|datasets|tablas|conjuntos|latency|latencia|transfer|transferencia|threats|amenazas|phase|fase|until|hasta)=("(?:[^"\\]|\\.)*"|\S+)\s*$/i;
  /* ---------- amenazas STRIDE: threats="T=mitigated,I=accepted" ---------- */
  const TH_KEY = { en: 'threats', es: 'amenazas' };
  const TH_ST = { en: { mitigated: 'mitigated', accepted: 'accepted', na: 'na' }, es: { mitigated: 'mitigada', accepted: 'aceptada', na: 'na' } };
  const TH_IN = { mitigated: 'mitigated', mitigada: 'mitigated', accepted: 'accepted', aceptada: 'accepted', na: 'na', 'n/a': 'na', 'no aplica': 'na', noaplica: 'na' };
  // → { threats: { T: { status } }, bad: [pares no válidos] }
  const parseThreats = v => {
    const out = { threats: {}, bad: [] };
    String(v).replace(/^"([\s\S]*)"$/, (_, x) => { try { return JSON.parse(`"${x}"`); } catch { return x; } }).split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(pair => {
      const [k, st] = pair.split('=').map(x => (x ?? '').trim()), L = k.toUpperCase(), S = TH_IN[st.toLowerCase()];
      if (/^[STRIDE]$/.test(L) && S) out.threats[L] = { status: S }; else out.bad.push(pair);
    });
    return out;
  };
  /* ---------- linaje: datasets=a,b ---------- */
  const DS_KEY = { en: 'datasets', es: 'tablas' };
  const parseDatasets = v => [...new Set(String(v).replace(/^"([\s\S]*)"$/, (_, x) => { try { return JSON.parse(`"${x}"`); } catch { return x; } }).split(/[,;]/).map(s => s.trim()).filter(Boolean))];
  /* ---------- conjuntos de datos: dataset ID nombre: layer= domain= owner= … + líneas column / rule / contract ---------- */
  const DSET_RE = /^(dataset|conjunto)\s+([^\s:]+)\s+(?:("(?:[^"\\]|\\.)*")|([^\s:"]+))\s*:\s*(.*)$/i;
  const DS_COL_RE = /^(column|columna)\s+(?:("(?:[^"\\]|\\.)*")|([^\s:"]+))\s*:\s*(.*)$/i, DS_RULE_RE = /^(rule|regla)\s+(\S+)(?:\s+(.*))?$/i, DS_CON_RE = /^(contract|contrato)\s+(\S+)(?:\s+(.*))?$/i;
  const DS_KEYS = ['layer', 'capa', 'domain', 'dominio', 'owner', 'dueño', 'dueno', 'steward', 'responsable', 'product', 'producto', 'classes', 'clases', 'format', 'formato', 'freshness', 'frescura', 'per_day', 'por_dia', 'retention', 'retencion', 'retención', 'phase', 'fase', 'desc'];
  const DS_COL_KEYS = ['nullable', 'nulo', 'desc'], DS_RULE_KEYS = ['severity', 'severidad', 'param'], DS_CON_KEYS = ['status', 'estado', 'consumers', 'consumidores', 'terms', 'terminos', 'términos'];
  const DS_FORMATS = ['delta', 'iceberg', 'hudi', 'parquet', 'avro', 'json', 'csv', 'other'], DS_RULES = ['not_null', 'unique', 'range', 'regex', 'accepted_values', 'freshness', 'custom'];
  const DS_ST_IN = { draft: 'draft', borrador: 'draft', agreed: 'agreed', acordado: 'agreed', acordada: 'agreed', deprecated: 'deprecated', obsoleto: 'deprecated', obsoleta: 'deprecated' };
  const DS_ST_OUT = { en: {}, es: { draft: 'borrador', agreed: 'acordado', deprecated: 'obsoleto' } };
  const DS_SEV_IN = { low: 'low', baja: 'low', bajo: 'low', medium: 'medium', media: 'medium', medio: 'medium', high: 'high', alta: 'high', alto: 'high' };
  const DS_W = { en: { dataset: 'dataset', domain: 'domain', product: 'product', classes: 'classes', format: 'format', freshness: 'freshness', perDay: 'per_day', retention: 'retention', desc: 'desc', column: 'column', key: 'key', pii: 'pii', nullable: 'nullable',
      rule: 'rule', severity: 'severity', param: 'param', contract: 'contract', status: 'status', consumers: 'consumers', terms: 'terms', latency: 'latency' },
    es: { dataset: 'conjunto', domain: 'dominio', product: 'producto', classes: 'clases', format: 'formato', freshness: 'frescura', perDay: 'por_dia', retention: 'retencion', desc: 'desc', column: 'columna', key: 'clave', pii: 'pii', nullable: 'nulo',
      rule: 'regla', severity: 'severidad', param: 'param', contract: 'contrato', status: 'estado', consumers: 'consumidores', terms: 'terminos', latency: 'latencia' } };
  const DS_FLAG = { key: 'key', clave: 'key', pii: 'pii' };
  const DS_DUR_UNITS = ['s', 'sec', 'seg', 'm', 'min', 'h', 'hr', 'hora', 'horas', 'hour', 'hours', 'd', 'dia', 'dias', 'day', 'days'];
  // Duración «15m», «4 h», «1d», «0» (la misma forma que acepta la app)
  const durOk = v => { const t = String(v ?? '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-záéíóú]*)$/); return !!t && (t[2] ? DS_DUR_UNITS.includes(t[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')) : +t[1].replace(',', '.') === 0); };
  const dsName = n => (/[\s:"]/.test(n) || n === '' ? quote(n) : n);
  /* ---------- notas, zonas, fronteras de confianza, notas STRIDE y hallazgos descartados ---------- */
  const SEV_IN = { low: 'low', baja: 'low', bajo: 'low', medium: 'medium', media: 'medium', medio: 'medium', high: 'high', alta: 'high', alto: 'high', critical: 'critical', critica: 'critical', critico: 'critical' };
  const NOTE_KEYS = ['at', 'en', 'pos', 'size', 'tamaño', 'tamano', 'color', 'in', 'dentro'];
  const ZONE_KEYS = [...NOTE_KEYS, 'severity', 'severidad', 'desc', 'trust', 'confianza'];
  const DISMISS_KEYS = { by: 'by', por: 'by', date: 'date', fecha: 'date' };
  const foldK = v => String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // "120,40" · "180x110" → [120, 40]
  const parsePair = v => { const m = String(v).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,x×]\s*(-?\d+(?:\.\d+)?)$/i); return m ? [+m[1], +m[2]] : null; };
  const rnd = n => Math.round(+n || 0);
  const NOTE_RE = /^(note|nota)\s+([^\s:]+)\s*:\s*(.*)$/i, ZONE_RE = /^(zone|zona)\s+([^\s:]+)\s*:\s*(.*)$/i, TRUST_RE = /^(trust|confianza)\s+([^\s:]+)\s*:\s*(.*)$/i;
  const LEVEL_RE = /^(inside|dentro)\s+([^\s:{]+)\s*\{\s*$/i;
  const THREAT_RE = /^(threat|amenaza)\s+(\S+?)\s*(\.\.>|~>|=>|->)\s*(\S+?)(?:\s+#(\d+))?\s+([STRIDEstride])\s*:\s*(.*)$/;
  const DISMISS_RE = /^(dismiss|descartar|descartado)\s+(?:("(?:[^"\\]|\\.)*")|(\S+?))\s*:\s+(.*)$/i;
  /* ---------- decisiones de arquitectura (ADR): adr ID: "título" status= date= … + líneas context/decision/consequences/history ---------- */
  const ADR_RE = /^adr\s+([^\s:]+)\s*:\s*(.*)$/i;
  const ADR_FIELD_RE = /^(context|contexto|decision|decisi[oó]n|consequences|consecuencias|history|historial|signoffs|firmas)\s*:\s*(.*)$/i;
  const ADR_KEYS = ['status', 'estado', 'date', 'fecha', 'deciders', 'decisores', 'links', 'enlaces', 'superseded-by', 'reemplazada-por', 'sustituida-por', 'area', 'área'];
  // Criterios y opciones de una decisión (líneas de campo tras `adr`)
  const ADR_CRIT_RE = /^(criterion|criterio)\s+([^\s:]+)\s*:\s*(.*)$/i, ADR_OPT_RE = /^(option|opci[oó]n)\s+([^\s:]+)\s*:\s*(.*)$/i;
  const ADR_CKEYS = ['weight', 'peso'];
  const ADR_OKEYS = ['cost', 'costo', 'risk', 'riesgo', 'version', 'versión', 'scores', 'puntos', 'summary', 'resumen', 'pros', 'cons', 'contras'];
  const ADR_CHOSEN = ['chosen', 'elegida', 'elegido'];
  const ADR_RISK_IN = { low: 'low', bajo: 'low', baja: 'low', medium: 'medium', medio: 'medium', media: 'medium', high: 'high', alto: 'high', alta: 'high' };
  const ADR_RISK_OUT = { en: {}, es: { low: 'bajo', medium: 'medio', high: 'alto' } };
  const ADR_HKEYS = ['by', 'por', 'note', 'nota'];
  // Firmas (aprobaciones): `signoffs: SH-001 approve 2026-10-08 note="…"; SH-002 reject 2026-10-09` (es: firmas: … aprueba|rechaza … nota=)
  const ADR_SKEYS = ['note', 'nota'];
  const SIGN_IN = { approve: 'approve', aprueba: 'approve', aprobar: 'approve', aprobada: 'approve', aprobado: 'approve', reject: 'reject', rechaza: 'reject', rechazar: 'reject', rechazada: 'reject', rechazado: 'reject' };
  const SIGN_OUT = { en: {}, es: { approve: 'aprueba', reject: 'rechaza' } };
  const ADR_ST_IN = { proposed: 'proposed', propuesta: 'proposed', propuesto: 'proposed', accepted: 'accepted', aceptada: 'accepted', aceptado: 'accepted', rejected: 'rejected', rechazada: 'rejected', rechazado: 'rejected',
    deprecated: 'deprecated', obsoleta: 'deprecated', obsoleto: 'deprecated', superseded: 'superseded', reemplazada: 'superseded', reemplazado: 'superseded', sustituida: 'superseded', sustituido: 'superseded', superada: 'superseded', superado: 'superseded' };
  const ADR_ST_OUT = { en: {}, es: { proposed: 'propuesta', accepted: 'aceptada', rejected: 'rechazada', deprecated: 'obsoleta', superseded: 'reemplazada' } };
  const ADR_W = { en: { area: 'area', crit: 'criterion', opt: 'option', weight: 'weight', chosen: 'chosen', cost: 'cost', risk: 'risk', version: 'version', scores: 'scores', summary: 'summary', pros: 'pros', cons: 'cons', status: 'status', date: 'date', deciders: 'deciders', links: 'links', sup: 'superseded-by', context: 'context', decision: 'decision', consequences: 'consequences', history: 'history', signoffs: 'signoffs', by: 'by', note: 'note' },
    es: { area: 'área', crit: 'criterio', opt: 'opción', weight: 'peso', chosen: 'elegida', cost: 'costo', risk: 'riesgo', version: 'versión', scores: 'puntos', summary: 'resumen', pros: 'pros', cons: 'contras', status: 'estado', date: 'fecha', deciders: 'decisores', links: 'enlaces', sup: 'reemplazada-por', context: 'contexto', decision: 'decisión', consequences: 'consecuencias', history: 'historial', signoffs: 'firmas', by: 'por', note: 'nota' } };
  const ADR_FIELD = { context: 'context', contexto: 'context', decision: 'decision', decisión: 'decision', consequences: 'consequences', consecuencias: 'consequences', history: 'history', historial: 'history', signoffs: 'signoffs', firmas: 'signoffs' };
  /* ---------- requisitos: req ID: "título" kind= priority= status= source= check= from= to= target= cls= jur= links= + línea detail ---------- */
  const REQ_RE = /^(?:req|requisito)\s+([^\s:]+)\s*:\s*(.*)$/i, REQ_FIELD_RE = /^(detail|detalle)\s*:\s*(.*)$/i;
  const REQ_KEYS = ['kind', 'tipo', 'priority', 'prioridad', 'status', 'estado', 'source', 'fuente', 'check', 'control', 'from', 'desde', 'to', 'hasta', 'target', 'objetivo', 'ds', 'conjunto', 'cls', 'clase', 'jur', 'jurisdiccion', 'jurisdicción', 'links', 'enlaces'];
  const REQ_KIND_IN = { driver: 'driver', impulsor: 'driver', nfr: 'nfr', rnf: 'nfr', constraint: 'constraint', restriccion: 'constraint', principle: 'principle', principio: 'principle' };
  const REQ_PRIO_IN = { must: 'must', debe: 'must', should: 'should', deberia: 'should', could: 'could', podria: 'could' };
  const REQ_ST_IN = { draft: 'draft', borrador: 'draft', agreed: 'agreed', acordado: 'agreed', acordada: 'agreed', dropped: 'dropped', descartado: 'dropped', descartada: 'dropped' };
  const REQ_MET_IN = { availability: 'availability', disponibilidad: 'availability', rpo: 'rpo', rto: 'rto', cost: 'cost', costo: 'cost', coste: 'cost', encryption: 'encryption', cifrado: 'encryption', residency: 'residency', residencia: 'residency', freshness: 'freshness', frescura: 'freshness' };
  const REQ_OUT = { en: {}, es: { driver: 'impulsor', nfr: 'rnf', constraint: 'restricción', principle: 'principio', must: 'debe', should: 'debería', could: 'podría', draft: 'borrador', agreed: 'acordado', dropped: 'descartado', availability: 'disponibilidad', cost: 'costo', encryption: 'cifrado', residency: 'residencia', freshness: 'frescura' } };
  const REQ_W = { en: { kind: 'kind', priority: 'priority', status: 'status', source: 'source', check: 'check', from: 'from', to: 'to', target: 'target', ds: 'ds', cls: 'cls', jur: 'jur', links: 'links', detail: 'detail' },
    es: { kind: 'tipo', priority: 'prioridad', status: 'estado', source: 'fuente', check: 'control', from: 'desde', to: 'hasta', target: 'objetivo', ds: 'conjunto', cls: 'clase', jur: 'jurisdicción', links: 'enlaces', detail: 'detalle' } };
  const adrText = v => { const t = v.trim(); return /^"(?:[^"\\]|\\.)*"$/.test(t) ? unquote(t) : t.replace(/\\n/g, '\n'); };
  /* ---------- registro RAID: risk|assumption|issue|dependency ID: "título" p= i= owner= status= validation= due= raised= links= + líneas detail/mitigation/history ---------- */
  const RAID_RE = /^(risk|riesgo|assumption|supuesto|issue|problema|dependency|dependencia)\s+([^\s:]+)\s*:\s*(.*)$/i;
  const RAID_FIELD_RE = /^(detail|detalle|mitigation|mitigaci[oó]n|history|historial)\s*:\s*(.*)$/i;
  const RAID_KEYS = ['p', 'i', 'owner', 'dueño', 'dueno', 'status', 'estado', 'validation', 'validación', 'validacion', 'due', 'fecha', 'raised', 'registrado', 'links', 'enlaces'];
  const RAID_PFX = { risk: 'R', assumption: 'A', issue: 'I', dependency: 'D' };
  const RAID_TYPE_IN = { risk: 'risk', riesgo: 'risk', assumption: 'assumption', supuesto: 'assumption', issue: 'issue', problema: 'issue', dependency: 'dependency', dependencia: 'dependency' };
  const RAID_ST_IN = { open: 'open', abierto: 'open', abierta: 'open', closed: 'closed', cerrado: 'closed', cerrada: 'closed' };
  const RAID_VAL_IN = { pending: 'pending', pendiente: 'pending', validated: 'validated', validado: 'validated', validada: 'validated', invalidated: 'invalidated', invalidado: 'invalidated', invalidada: 'invalidated' };
  const RAID_FIELD = { detail: 'detail', detalle: 'detail', mitigation: 'mitigation', mitigación: 'mitigation', mitigacion: 'mitigation', history: 'history', historial: 'history' };
  const RAID_ST_OUT = { en: {}, es: { open: 'abierto', closed: 'cerrado' } }, RAID_VAL_OUT = { en: {}, es: { pending: 'pendiente', validated: 'validado', invalidated: 'invalidado' } };
  const RAID_W = { en: { risk: 'risk', assumption: 'assumption', issue: 'issue', dependency: 'dependency', owner: 'owner', status: 'status', validation: 'validation', due: 'due', raised: 'raised', links: 'links', detail: 'detail', mitigation: 'mitigation', history: 'history', by: 'by', note: 'note' },
    es: { risk: 'riesgo', assumption: 'supuesto', issue: 'problema', dependency: 'dependencia', owner: 'dueño', status: 'estado', validation: 'validación', due: 'fecha', raised: 'registrado', links: 'enlaces', detail: 'detalle', mitigation: 'mitigación', history: 'historial', by: 'por', note: 'nota' } };
  /* ---------- interesados: stakeholder ID: "nombre" role= org= raci=área:letra,… + marcas versions / inactive ---------- */
  const SH_RE = /^(stakeholder|interesado)\s+([^\s:]+)\s*:\s*(.*)$/i;
  const SH_KEYS = ['role', 'rol', 'org', 'raci'];
  const SH_ORG_IN = { client: 'client', cliente: 'client', partner: 'partner', socio: 'partner', internal: 'internal', interno: 'internal' };
  const SH_ORG_OUT = { en: {}, es: { client: 'cliente', partner: 'socio', internal: 'interno' } };
  const SH_FLAG = { versions: 'versions', versiones: 'versions', inactive: 'inactive', inactivo: 'inactive' };
  const SH_W = { en: { stakeholder: 'stakeholder', role: 'role', org: 'org', raci: 'raci', versions: 'versions', inactive: 'inactive' }, es: { stakeholder: 'interesado', role: 'rol', org: 'org', raci: 'raci', versions: 'versiones', inactive: 'inactivo' } };
  // Divide por `;` ignorando los de dentro de comillas
  const splitSemi = v => { const out = []; let cur = '', q = false; for (let i = 0; i < v.length; i++) { const c = v[i]; if (c === '\\' && q) { cur += c + (v[++i] ?? ''); continue; } if (c === '"') q = !q; if (c === ';' && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const hv = v => (/[\s";[\]{}]/.test(String(v)) || String(v) === '' ? quote(v) : String(v));
  // curved | elbow (también curva/curvas, codo/codos, orthogonal)
  const parseRoute = v => (/^(elbows?|codos?|orthogonal|ortogonal(es)?|angle|ángulos?)$/i.test(v) ? 'elbow' : /^(curved?|curvas?)$/i.test(v) ? 'curved' : null);
  // data=pii,pci → ['pii', 'pci'] · encrypted=yes|no (también sí/no, true/false)
  const parseData = v => [...new Set(String(v).split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
  const parseBool = v => (/^(yes|y|true|si|sí|1|on)$/i.test(v) ? true : /^(no|n|false|0|off)$/i.test(v) ? false : null);

  // Palabras que escribe stringify y mensajes de error, por idioma
  const WORDS = {
    en: { title: 'title', direction: 'direction', group: 'group', cost: 'cost', hour: 'hour', month: 'month', year: 'year', years: 'years', data: 'data', encrypted: 'encrypted', both: 'both', yes: 'yes', no: 'no', lines: 'lines', line: 'line', region: 'region', transfer: 'transfer', ok: 'ok', elbow: 'elbow', curved: 'curved', elbowOne: 'elbow', curvedOne: 'curved', author: 'author', version: 'version', view: 'view', kind: 'kind', physical: 'physical', logical: 'logical',
      review: 'review', by: 'by', raised: 'raised', due: 'due', status: 'status', closed: 'closed', resolved: 'resolved', layer: 'layer', layers: 'layers', zones: 'zones',
      owner: 'owner', steward: 'steward', team: 'team', costCenter: 'costcenter',
      in: 'in', layerOf: { bronze: 'bronze', silver: 'silver', gold: 'gold' }, disposition: 'disposition', dispOf: { retain: 'retain', rehost: 'rehost', replatform: 'replatform', refactor: 'refactor', repurchase: 'repurchase', retire: 'retire', relocate: 'relocate' }, exposure: 'exposure', backup: 'backup', expoOf: { public: 'public', internal: 'internal' },
      note: 'note', zone: 'zone', trust: 'trust', threat: 'threat', dismiss: 'dismiss', phase: 'phase', until: 'until', goal: 'goal', at: 'at', size: 'size', severity: 'severity', date: 'date', inside: 'inside', sevOf: { low: 'low', medium: 'medium', high: 'high', critical: 'critical' } },
    es: { title: 'título', direction: 'dirección', group: 'grupo', cost: 'costo', hour: 'hora', month: 'mes', year: 'año', years: 'años', data: 'datos', encrypted: 'cifrado', both: 'ambos', yes: 'sí', no: 'no', lines: 'líneas', line: 'línea', region: 'región', transfer: 'transferencia', ok: 'ok', elbow: 'codos', curved: 'curvas', elbowOne: 'codo', curvedOne: 'curva', author: 'autor', version: 'versión', view: 'vista', kind: 'tipo', physical: 'físico', logical: 'lógico',
      review: 'revisión', by: 'por', raised: 'levantada', due: 'compromiso', status: 'estado', closed: 'cerrada', resolved: 'resuelta', layer: 'capa', layers: 'capas', zones: 'zonas',
      owner: 'dueño', steward: 'responsable', team: 'equipo', costCenter: 'centro',
      in: 'dentro', layerOf: { bronze: 'bronce', silver: 'plata', gold: 'oro' }, disposition: 'disposición', dispOf: { retain: 'retener', rehost: 'rehospedar', replatform: 'replataformar', refactor: 'refactorizar', repurchase: 'recomprar', retire: 'retirar', relocate: 'reubicar' }, exposure: 'exposición', backup: 'respaldo', expoOf: { public: 'pública', internal: 'interna' },
      note: 'nota', zone: 'zona', trust: 'confianza', threat: 'amenaza', dismiss: 'descartar', phase: 'fase', until: 'hasta', goal: 'objetivo', at: 'en', size: 'tamaño', severity: 'severidad', date: 'fecha', inside: 'dentro', sevOf: { low: 'baja', medium: 'media', high: 'alta', critical: 'crítica' } }
  };
  const MSG = {
    en: {
      icon: r => `unknown icon “${r}”`, kind: r => `unknown type or icon “${r}”`, dir: 'direction must be LR or TB',
      brace: 'extra closing brace }', groupId: id => `invalid group id “${id}”`, groupDup: id => `group “${id}” already exists`,
      style: v => `unknown connection type “${v}” (use sync, async, data, optional, replication, batch, stream, control or a type declared with “type id: …”)`, weight: v => `invalid weight “${v}” (use normal, high or critical)`,
      etId: v => `invalid type id “${v}” (use a-z, 0-9 and -, up to 32 characters)`, etDup: v => `type “${v}” is already declared or is a built-in type`, etDash: v => `invalid dash “${v}” (e.g. "6 3" or "12 4 2 4")`, etWidth: v => `invalid width “${v}” (1 to 4)`, etPart: v => `invalid particles “${v}” (0 to 4)`,
      edge: 'incomplete connection', id: id => `invalid id “${id || '(empty)'}”`,
      cost: v => `invalid cost “${v}” (e.g. 120/month, 0.1/hour, 1400/year, 5000/3years)`,
      data: v => `unknown data class “${v}” (e.g. pii, pci, confidential)`, enc: v => `invalid encrypted value “${v}” (use yes or no)`,
      route: v => `invalid line style “${v}” (use curved or elbow)`, transfer: v => `invalid transfer value “${v}” (use ok)`, threats: v => `invalid threat “${v}” (use e.g. T=mitigated; letters S T R I D E; mitigated, accepted or na)`,
      day: v => `invalid date “${v}” (use YYYY-MM-DD)`, status: v => `invalid status “${v}” (use open or resolved)`,
      ctl: v => `invalid control “${v}” (use framework:id=met|partial|gap|na, e.g. iso27001:A.8.24=met)`,
      layer: v => `unknown layer “${v}” (use bronze, silver or gold; also raw, curated or serving)`, lnames: v => `invalid layer naming “${v}” (use medallion or zones)`,
      radar: v => `invalid radar entry “${v}” (use an entry id from the tech radar, or none)`,
      disp: v => `unknown disposition “${v}” (use retain, rehost, replatform, refactor, repurchase or retire)`, expo: v => `invalid exposure “${v}” (use public or internal)`, backup: v => `invalid backup value “${v}” (use yes or no)`,
      view: v => `unknown view “${v}”`, gkind: v => `invalid group type “${v}” (use logical or physical)`,
      c4: v => `unknown C4 type “${v}” (use person, system, container, component or external)`, inRef: id => `“in” points to “${id}”, which is not a component`,
      line: 'cannot understand this line', open: (n, lv) => `missing } to close ${lv ? (n === 1 ? 'a block' : `${n} blocks`) : n === 1 ? 'a group' : `${n} groups`}`,
      at: v => `invalid position “${v}” (use at=120,40)`, size: v => `invalid size “${v}” (use size=180,110)`, sev: v => `unknown severity “${v}” (use low, medium, high or critical)`,
      lvInGroup: id => `“inside ${id}” cannot be opened inside a group`, lvConflict: (a, b) => `in=${a} conflicts with the enclosing “inside ${b}” block`,
      lvNest: (id, o) => `“${id}” is not a component of “${o}”, so “inside ${id}” cannot be nested there`,
      adrDup: id => `decision “${id}” is declared twice`, adrSt: v => `unknown decision status “${v}” (use proposed, accepted, rejected, deprecated or superseded)`, adrLink: v => `“${v}” is not a node, group or connection (use ids, source->target or version:<id>)`,
      reqDup: id => `requirement “${id}” is declared twice`, reqKind: v => `unknown requirement kind “${v}” (use driver, nfr, constraint or principle)`, reqPrio: v => `unknown priority “${v}” (use must, should or could)`,
      reqStatus: v => `unknown requirement status “${v}” (use draft, agreed or dropped)`, reqMetric: v => `unknown check “${v}” (use availability, rpo, rto, cost, encryption, residency or freshness)`, reqNum: v => `invalid target “${v}” (a number, 0 or more)`,
      reqNode: v => `“${v}” is not a node (use a component id in from= and to=)`, reqLink: v => `“${v}” is not a decision, node, group or connection (use ids or source->target)`, reqNoCheck: 'from=, to=, target=, ds=, cls= and jur= need check=… on the same line',
      adrSign: v => `invalid sign-off “${v}” (use SH-001 approve|reject YYYY-MM-DD note="…"; separate entries with ;)`, adrSignBy: v => `“${v}” is not a stakeholder`,
      adrHist: v => `invalid history entry “${v}” (use status YYYY-MM-DD by="…" note="…"; separate entries with ;)`,
      raidDup: id => `item “${id}” is declared twice`, raidId: (id, p) => `invalid id “${id}” (use ${p}-001, ${p}-002…)`, raidNum: (k, v) => `invalid ${k} “${v}” (use a whole number from 1 to 5)`,
      raidSt: v => `invalid status “${v}” (use open or closed)`, raidVal: v => `invalid validation “${v}” (use pending, validated or invalidated)`,
      raidLink: v => `“${v}” is not a node, group, connection, decision or requirement (use ids, source->target, ADR-001 or REQ-001)`,
      raidHist: v => `invalid history entry “${v}” (use pending|validated|invalidated YYYY-MM-DD by="…" note="…"; separate entries with ;)`,
      stkDup: id => `stakeholder “${id}” is declared twice`, stkId: id => `invalid stakeholder id “${id}” (use SH-001, SH-002…)`, stkOrg: v => `invalid org “${v}” (use client, partner or internal)`, stkRaci: v => `invalid raci “${v}” (use area:R|A|C|I separated by commas; * means every area)`,
      adrCritId: v => `invalid criterion id “${v}” (use a-z, 0-9 and -, up to 30 characters)`, adrCritDup: v => `criterion “${v}” is declared twice in this decision`, adrWeight: v => `invalid weight “${v}” (use a whole number from 1 to 5)`,
      adrOptId: v => `invalid option id “${v}” (use letters, digits and -, up to 20 characters)`, adrOptDup: v => `option “${v}” is declared twice in this decision`, adrChosen: v => `only one option can be chosen (“${v}” is already)`,
      adrCost: v => `invalid cost “${v}” (a number, 0 or more)`, adrRisk: v => `invalid risk “${v}” (use low, medium or high)`, adrScore: v => `invalid score “${v}” (use criterion:1..5, e.g. scores=cost:4,skills:5)`, adrScoreCrit: v => `score for “${v}”, which is not a criterion of this decision`,
      phaseId: id => `invalid phase id “${id}” (use letters, digits, - or _, up to 30 characters)`, phaseDup: id => `phase “${id}” is declared twice`, phaseDate: v => `invalid phase date “${v}” (use YYYY-MM or YYYY-MM-DD)`,
      phaseMax: n => `too many phases (at most ${n})`, phaseUnknown: id => `unknown phase “${id}” (declare it first with: phase ${id}: "Name")`, phaseOrder: (a, b) => `“until=${b}” must come after “phase=${a}” in the phase order`,
      dsId: id => `invalid dataset id “${id}” (use DS-001, DS-002…)`, dsDup: id => `dataset “${id}” is declared twice`, dsName: n => `dataset name “${n}” is already used by another dataset`, dsBool: v => `invalid product value “${v}” (use yes or no)`,
      dsFormat: v => `unknown format “${v}” (use delta, iceberg, hudi, parquet, avro, json, csv or other)`, dsDur: v => `invalid duration “${v}” (e.g. 15m, 4h, 1d)`, dsNum: (k, v) => `invalid ${k} “${v}” (a number, 0 or more)`,
      dsRule: v => `unknown quality rule “${v}” (use not_null, unique, range, regex, accepted_values, freshness or custom)`, dsRuleSev: v => `invalid severity “${v}” (use low, medium or high)`, dsStatus: v => `unknown contract status “${v}” (use draft, agreed or deprecated)`,
      dsConsumer: v => `“${v}” is not a node (use component ids in consumers=)`, dsNoDs: 'column, rule and contract lines go right below a dataset line', dsNullable: v => `invalid nullable value “${v}” (use yes or no)`,
      thEdge: (a, b) => `no connection ${a} -> ${b} for this threat note`, thNone: (a, b, k) => `${a} -> ${b} has no decided ${k} threat (add it with threats="${k}=mitigated")`
    },
    es: {
      icon: r => `icono desconocido «${r}»`, kind: r => `tipo o icono desconocido «${r}»`, dir: 'la dirección debe ser LR o TB',
      brace: 'sobra una llave }', groupId: id => `id de grupo no válido «${id}»`, groupDup: id => `el grupo «${id}» ya existe`,
      style: v => `tipo de conexión desconocido «${v}» (usa sync, async, data, optional, replicación, lotes, streaming, control o un tipo declarado con «tipo id: …»)`, weight: v => `peso no válido «${v}» (usa normal, alto o crítico)`,
      etId: v => `id de tipo no válido «${v}» (usa a-z, 0-9 y -, hasta 32 caracteres)`, etDup: v => `el tipo «${v}» ya está declarado o es uno predefinido`, etDash: v => `trazo no válido «${v}» (p. ej. "6 3" o "12 4 2 4")`, etWidth: v => `grosor no válido «${v}» (de 1 a 4)`, etPart: v => `partículas no válidas «${v}» (de 0 a 4)`,
      edge: 'conexión incompleta', id: id => `id no válido «${id || '(vacío)'}»`,
      cost: v => `costo no válido «${v}» (ej.: 120/mes, 0.1/hora, 1400/año, 5000/3años)`,
      data: v => `clasificación de datos desconocida «${v}» (ej.: pii, pci, confidential)`, enc: v => `valor de cifrado no válido «${v}» (usa sí o no)`,
      route: v => `estilo de línea no válido «${v}» (usa curvas o codos)`, transfer: v => `valor de transferencia no válido «${v}» (usa ok)`, threats: v => `amenaza no válida «${v}» (usa p. ej. T=mitigada; letras S T R I D E; mitigada, aceptada o na)`,
      day: v => `fecha no válida «${v}» (usa AAAA-MM-DD)`, status: v => `estado no válido «${v}» (usa abierta o resuelta)`,
      ctl: v => `control no válido «${v}» (usa marco:id=cumple|parcial|brecha|na, ej.: iso27001:A.8.24=cumple)`,
      layer: v => `capa desconocida «${v}» (usa bronce, plata u oro; también crudo, curado o consumo)`, lnames: v => `nombres de capa no válidos «${v}» (usa medallón o zonas)`,
      radar: v => `entrada de radar no válida «${v}» (usa el id de una entrada del radar tecnológico, o ninguno)`,
      disp: v => `disposición desconocida «${v}» (usa retener, rehospedar, replataformar, refactorizar, recomprar o retirar)`, expo: v => `exposición no válida «${v}» (usa pública o interna)`, backup: v => `valor de respaldo no válido «${v}» (usa sí o no)`,
      view: v => `vista desconocida «${v}»`, gkind: v => `tipo de grupo no válido «${v}» (usa lógico o físico)`,
      c4: v => `tipo C4 desconocido «${v}» (usa persona, sistema, contenedor, componente o externo)`, inRef: id => `«dentro» apunta a «${id}», que no es un componente`,
      line: 'no se entiende esta línea', open: (n, lv) => `falta cerrar ${lv ? (n === 1 ? 'un bloque' : `${n} bloques`) : n === 1 ? 'un grupo' : `${n} grupos`} con }`,
      at: v => `posición no válida «${v}» (usa en=120,40)`, size: v => `tamaño no válido «${v}» (usa tamaño=180,110)`, sev: v => `severidad desconocida «${v}» (usa baja, media, alta o crítica)`,
      lvInGroup: id => `«dentro ${id}» no se puede abrir dentro de un grupo`, lvConflict: (a, b) => `dentro=${a} choca con el bloque «dentro ${b}» que lo contiene`,
      lvNest: (id, o) => `«${id}» no es un componente de «${o}», así que «dentro ${id}» no puede anidarse ahí`,
      adrDup: id => `la decisión «${id}» está declarada dos veces`, adrSt: v => `estado de decisión desconocido «${v}» (usa propuesta, aceptada, rechazada, obsoleta o reemplazada)`, adrLink: v => `«${v}» no es un nodo, grupo ni conexión (usa ids, origen->destino o version:<id>)`,
      reqDup: id => `el requisito «${id}» está declarado dos veces`, reqKind: v => `tipo de requisito desconocido «${v}» (usa impulsor, rnf, restricción o principio)`, reqPrio: v => `prioridad desconocida «${v}» (usa debe, debería o podría)`,
      reqStatus: v => `estado de requisito desconocido «${v}» (usa borrador, acordado o descartado)`, reqMetric: v => `control desconocido «${v}» (usa disponibilidad, rpo, rto, costo, cifrado, residencia o frescura)`, reqNum: v => `objetivo no válido «${v}» (un número, 0 o más)`,
      reqNode: v => `«${v}» no es un nodo (usa el id de un componente en desde= y hasta=)`, reqLink: v => `«${v}» no es una decisión, nodo, grupo ni conexión (usa ids u origen->destino)`, reqNoCheck: 'desde=, hasta=, objetivo=, conjunto=, clase= y jurisdicción= necesitan control=… en la misma línea',
      adrSign: v => `firma no válida «${v}» (usa SH-001 aprueba|rechaza AAAA-MM-DD nota="…"; separa las entradas con ;)`, adrSignBy: v => `«${v}» no es un interesado`,
      adrHist: v => `entrada de historial no válida «${v}» (usa estado AAAA-MM-DD por="…" nota="…"; separa las entradas con ;)`,
      raidDup: id => `el item «${id}» está declarado dos veces`, raidId: (id, p) => `id no válido «${id}» (usa ${p}-001, ${p}-002…)`, raidNum: (k, v) => `${k} no válido «${v}» (usa un número entero de 1 a 5)`,
      raidSt: v => `estado no válido «${v}» (usa abierto o cerrado)`, raidVal: v => `validación no válida «${v}» (usa pendiente, validado o invalidado)`,
      raidLink: v => `«${v}» no es un nodo, grupo, conexión, decisión ni requisito (usa ids, origen->destino, ADR-001 o REQ-001)`,
      raidHist: v => `entrada de historial no válida «${v}» (usa pendiente|validado|invalidado AAAA-MM-DD por="…" nota="…"; separa las entradas con ;)`,
      stkDup: id => `el interesado «${id}» está declarado dos veces`, stkId: id => `id de interesado no válido «${id}» (usa SH-001, SH-002…)`, stkOrg: v => `org no válida «${v}» (usa cliente, socio o interno)`, stkRaci: v => `raci no válido «${v}» (usa área:R|A|C|I separados por comas; * vale para todas las áreas)`,
      adrCritId: v => `id de criterio no válido «${v}» (usa a-z, 0-9 y -, hasta 30 caracteres)`, adrCritDup: v => `el criterio «${v}» está declarado dos veces en esta decisión`, adrWeight: v => `peso no válido «${v}» (usa un número entero de 1 a 5)`,
      adrOptId: v => `id de opción no válido «${v}» (usa letras, dígitos y -, hasta 20 caracteres)`, adrOptDup: v => `la opción «${v}» está declarada dos veces en esta decisión`, adrChosen: v => `solo una opción puede ser la elegida («${v}» ya lo es)`,
      adrCost: v => `costo no válido «${v}» (un número, 0 o más)`, adrRisk: v => `riesgo no válido «${v}» (usa bajo, medio o alto)`, adrScore: v => `puntaje no válido «${v}» (usa criterio:1..5, p. ej. puntos=costo:4,habilidades:5)`, adrScoreCrit: v => `puntaje para «${v}», que no es un criterio de esta decisión`,
      phaseId: id => `id de fase no válido «${id}» (usa letras, dígitos, - o _, hasta 30 caracteres)`, phaseDup: id => `la fase «${id}» está declarada dos veces`, phaseDate: v => `fecha de fase no válida «${v}» (usa AAAA-MM o AAAA-MM-DD)`,
      phaseMax: n => `demasiadas fases (máximo ${n})`, phaseUnknown: id => `fase desconocida «${id}» (decláralo antes con: fase ${id}: "Nombre")`, phaseOrder: (a, b) => `«hasta=${b}» debe ir después de «fase=${a}» en el orden de las fases`,
      dsId: id => `id de conjunto no válido «${id}» (usa DS-001, DS-002…)`, dsDup: id => `el conjunto «${id}» está declarado dos veces`, dsName: n => `el nombre de conjunto «${n}» ya lo usa otro conjunto`, dsBool: v => `valor de producto no válido «${v}» (usa sí o no)`,
      dsFormat: v => `formato desconocido «${v}» (usa delta, iceberg, hudi, parquet, avro, json, csv u other)`, dsDur: v => `duración no válida «${v}» (p. ej. 15m, 4h, 1d)`, dsNum: (k, v) => `${k} no válido «${v}» (un número, 0 o más)`,
      dsRule: v => `regla de calidad desconocida «${v}» (usa not_null, unique, range, regex, accepted_values, freshness o custom)`, dsRuleSev: v => `severidad no válida «${v}» (usa baja, media o alta)`, dsStatus: v => `estado de contrato desconocido «${v}» (usa borrador, acordado u obsoleto)`,
      dsConsumer: v => `«${v}» no es un nodo (usa ids de componentes en consumidores=)`, dsNoDs: 'las líneas column, rule y contract van justo debajo de una línea de conjunto', dsNullable: v => `valor de nulo no válido «${v}» (usa sí o no)`,
      thEdge: (a, b) => `no hay conexión ${a} -> ${b} para esta nota de amenaza`, thNone: (a, b, k) => `${a} -> ${b} no tiene decidida la amenaza ${k} (añádela con amenazas="${k}=mitigada")`
    }
  };

  // costo=120/mes · 0.1/hora · 1400/año · 5000/3años (sin periodo = mensual)
  // cost=120/month · 0.1/hour · 1400/year · 5000/3years
  function parseCost(v) {
    const m = String(v).trim().replace(/^\$/, '').match(/^(\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*\/\s*(.+))?$/);
    if (!m) return null;
    const cost = +m[1].replace(/,/g, ''), p = (m[2] || 'mes').toLowerCase();
    let y;
    if (/^(h|hr|hrs|hora|horas|hours?|hourly)$/.test(p)) return { cost, costPeriod: 'hour' };
    if (/^(m|mo|mes|meses|months?|mensual|monthly)$/.test(p)) return { cost };
    if (/^(a|año|ano|y|yr|year|anual|annual|yearly)$/.test(p)) return { cost, costPeriod: 'year' };
    if ((y = p.match(/^(\d+)\s*(a|años|anos|año|ano|y|yrs?|years?)$/))) return { cost, costPeriod: 'multi', costYears: Math.max(1, +y[1]) };
    return null;
  }
  const costValue = (n, w) => `${+n.cost}/${n.costPeriod === 'multi' ? `${n.costYears || 3}${w.years}` : w[n.costPeriod] || w.month}`;

  const TYPE_W = { en: { type: 'type', dash: 'dash', width: 'width', particles: 'particles' }, es: { type: 'tipo', dash: 'trazo', width: 'ancho', particles: 'partículas' } };
  const quote = s => JSON.stringify(String(s));
  const bare = v => (/[\s"[\]{}]/.test(String(v)) || String(v) === '' ? quote(v) : String(v));
  const unquote = s => { try { return JSON.parse(s); } catch { return s.slice(1, -1); } };

  // Divide el resto de una línea en etiqueta, [tipo], "detalle" y clave=valor
  function tokens(rest, keys) {
    const out = { words: [], brackets: [], quotes: [], kv: {} };
    const re = /\[([^\]]*)\]|("(?:[^"\\]|\\.)*")|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_-]*)=("(?:[^"\\]|\\.)*"|\S+)|(\S+)/g;
    let m;
    while ((m = re.exec(rest))) {
      if (m[1] != null) out.brackets.push(m[1].trim());
      else if (m[2] != null) out.quotes.push(unquote(m[2]));
      else if (m[3] != null && keys.includes(m[3].toLowerCase())) out.kv[m[3].toLowerCase()] = m[4].startsWith('"') ? unquote(m[4]) : m[4];
      else out.words.push(m[0]);
    }
    return out;
  }

  // [lambda], [aws/lambda] o [db]: tipo propio, icono oficial o error
  function resolveKind(raw, ctx, msg) {
    const t = raw.trim().toLowerCase();
    if (!t) return {};
    if (t.includes('/')) return ctx.icons[t] ? { icon: t, type: ctx.icons[t].type } : { error: msg.icon(raw) };
    if (ctx.types[t]) return { type: t };
    for (const p of ctx.providers) {
      const ref = `${p}/${t}`;
      if (ctx.icons[ref]) return { icon: ref, type: ctx.icons[ref].type };
    }
    return { error: msg.kind(raw) };
  }

  function parse(src, ctx) {
    const msg = MSG[ctx.lang] || MSG.en;
    const model = { title: ctx.lang === 'es' ? 'Diagrama sin título' : 'Untitled diagram', groups: [], nodes: [], edges: [] };
    const errors = [];
    const nodes = new Map(), groups = new Set(), stack = [], gobj = new Map(), inRefs = [], nests = [], thLines = [];
    model.notes = []; model.zones = []; model.dismissed = {}; model.edgeTypes = []; model.decisions = []; model.requirements = [];
    const adrSeen = new Set(), adrRefs = [], adrScores = [], adrSigns = []; let adrCur = null, adrOpen = false;
    const reqSeen = new Set(), reqRefs = [], reqNodes = []; let reqCur = null, reqOpen = false;
    model.raid = [];
    const raidSeen = new Set(), raidRefs = []; let raidCur = null, raidOpen = false;
    model.stakeholders = [];
    const shSeen = new Set();
    model.phases = [];
    model.datasets = [];
    const dsSeen = new Set(), dsNames = new Set(), dsPhases = [], dsCons = []; let dsCur = null, dsOpen = false;
    const phRefs = [];   // phase= / until= de nodos, grupos y conexiones: se validan al final, cuando ya están todas las fases
    const phaseOf = (o, kv, ln) => { const a = (kv.phase ?? kv.fase)?.trim(), b = (kv.until ?? kv.hasta)?.trim(); if (a || b) phRefs.push({ o, a, b, ln }); };
    // Tipos propios declarados en cualquier línea (una conexión puede usarlos antes de que se declaren)
    const customIds = new Set();
    String(src).split(/\r?\n/).forEach(l => { const q = l.trim().match(TYPE_RE); if (q) customIds.add(q[2].toLowerCase()); });
    const parseStyle = v => { const k = foldK(v); return BUILTIN_STYLES.includes(k) ? k : Object.hasOwn(STYLE_ES, k) ? STYLE_ES[k] : (customIds.has(k) && !BUILTIN_STYLES.includes(k) ? k : null); };
    // La pila lleva marcos { kind: 'group' | 'level', id }: los bloques `inside` quedan siempre por fuera de los grupos
    const curGroup = () => (stack.length && stack[stack.length - 1].kind === 'group' ? stack[stack.length - 1].id : undefined);
    const curLevel = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === 'level') return stack[i].id; return undefined; };
    // Nivel C4 de lo declarado aquí: el bloque `inside` manda; `in=` explícito debe coincidir; si no, el del grupo que lo contiene
    const resolveIn = (explicit, ln) => {
      const lv = curLevel();
      if (lv) { if (explicit && explicit !== lv) err(ln, msg.lvConflict(explicit, lv)); return lv; }
      if (explicit) inRefs.push({ ln, id: explicit });
      return explicit || gobj.get(curGroup())?.in || undefined;
    };
    const err = (line, msg) => errors.push({ line, msg });
    // Clasificaciones: solo las de config.js (ctx.dataClasses), si se conocen
    const checkData = (v, ln) => {
      if (v == null) return null;
      const d = parseData(v), bad = ctx.dataClasses ? d.filter(k => !ctx.dataClasses.includes(k)) : [];
      if (bad.length) err(ln, msg.data(bad[0]));
      return d.filter(k => !bad.includes(k));
    };

    // Capa: clave o alias (bronze, raw, bronce, crudo…); si se conocen las de config.js (ctx.layers), avisa de las desconocidas
    const checkLayer = (v, ln) => {
      const k = String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!ctx.layers) return k;
      if (ctx.layers[k]) return ctx.layers[k];
      err(ln, msg.layer(v));
      return null;
    };

    // Disposición de migración (6R): clave, nombre o alias; si se conocen las de config.js (ctx.dispositions), avisa de las desconocidas
    const checkDisp = (v, ln) => {
      const k = String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '');
      if (!ctx.dispositions) return k;
      if (ctx.dispositions[k]) return ctx.dispositions[k];
      err(ln, msg.disp(v));
      return null;
    };

    // controls=… / controles=… de un nodo o grupo
    const applyCtl = (o, kv, ln) => {
      const v = kv.controls ?? kv.controles;
      if (v == null) return;
      const r = parseControls(v);
      r.bad.forEach(p => err(ln, msg.ctl(p)));
      if (Object.keys(r.controls).length) o.controls = r.controls;
    };

    const nodeFor = id => {
      if (!nodes.has(id)) {
        const n = { id, label: id, type: 'generic' };
        if (curLevel()) n.in = curLevel();
        nodes.set(id, n);
        model.nodes.push(n);
      }
      return nodes.get(id);
    };

    String(src).split(/\r?\n/).forEach((rawLine, i) => {
      const ln = i + 1, line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;

      const inAdr = adrOpen, inReq = reqOpen; adrOpen = false; reqOpen = false;
      const inRaid = raidOpen; raidOpen = false;
      const inDs = dsOpen; dsOpen = false;
      let m;
      if (inRaid && raidCur && (m = line.match(RAID_FIELD_RE))) {   // campo del item RAID: detail: / mitigation: / history:
        raidOpen = true;
        const f = RAID_FIELD[m[1].toLowerCase()];
        if (f !== 'history') { raidCur[f] = adrText(m[2]); return; }
        splitSemi(m[2]).map(x => x.trim()).filter(Boolean).forEach(ent => {
          const tk = tokens(ent, ADR_HKEYS), v = RAID_VAL_IN[foldK(tk.words[0] || '')], h = { validation: v, date: tk.words[1] };
          if (!v || tk.words.length !== 2 || !isDay(h.date) || tk.quotes.length) return err(ln, msg.raidHist(ent));
          const by = (tk.kv.by ?? tk.kv.por)?.trim(), nt = (tk.kv.note ?? tk.kv.nota)?.trim();
          if (by) h.by = by;
          if (nt) h.note = nt;
          (raidCur.history ||= []).push(h);
        });
        return;
      }
      if ((m = line.match(PHASE_RE))) {   // phase mvp: "MVP" date=2026-12 goal="…"
        const id = m[2], tk = tokens(m[3], PHASE_LINE_KEYS), ph = { id, name: (tk.quotes[0] ?? tk.words.join(' ')).trim() || id }, kv = tk.kv;
        if (!PHASE_ID.test(id)) return err(ln, msg.phaseId(id));
        if (model.phases.some(x => x.id === id)) return err(ln, msg.phaseDup(id));
        if (model.phases.length >= PHASE_MAX) return err(ln, msg.phaseMax(PHASE_MAX));
        const dv = (kv.date ?? kv.fecha)?.trim();
        if (dv) { if (isPhaseDay(dv)) ph.date = dv; else err(ln, msg.phaseDate(dv)); }
        const gv = (kv.goal ?? kv.objetivo)?.trim();
        if (gv) ph.goal = gv;
        model.phases.push(ph);
        return;
      }
      if (inDs && dsCur && (m = line.match(DS_COL_RE))) {   // columna: column order_id: string key pii nullable=no desc="…"
        dsOpen = true;
        const name = (m[2] != null ? unquote(m[2]) : m[3]).trim(), tk = tokens(m[4], DS_COL_KEYS), flags = tk.words.filter(w => DS_FLAG[foldK(w)]), rest = tk.words.filter(w => !DS_FLAG[foldK(w)]), c = { name };
        const ty = (tk.quotes[0] ?? rest[0] ?? '').trim();
        if (ty) c.type = ty;
        if (flags.some(w => DS_FLAG[foldK(w)] === 'key')) c.key = true;
        if (flags.some(w => DS_FLAG[foldK(w)] === 'pii')) c.pii = true;
        const nv = tk.kv.nullable ?? tk.kv.nulo;
        if (nv != null) { const b = parseBool(nv.trim()); if (b === false) c.nullable = false; else if (b == null) err(ln, msg.dsNullable(nv)); }
        const dv = tk.kv.desc?.trim();
        if (dv) c.desc = dv;
        (dsCur.schema ||= []).push(c);
        return;
      }
      if (inDs && dsCur && (m = line.match(DS_RULE_RE))) {   // regla de calidad: rule not_null order_id severity=high param="…"
        dsOpen = true;
        const tk = tokens(m[3] || '', DS_RULE_KEYS), rule = foldK(m[2]), q = { rule };
        if (!DS_RULES.includes(rule)) return err(ln, msg.dsRule(m[2]));
        const col = (tk.quotes[0] ?? tk.words[0] ?? '').trim();
        if (col) q.column = col;
        const pv = tk.kv.param?.trim();
        if (pv) q.param = pv;
        const sv = tk.kv.severity ?? tk.kv.severidad;
        if (sv != null) { const sev = DS_SEV_IN[foldK(sv)]; if (sev) q.severity = sev; else err(ln, msg.dsRuleSev(sv)); }
        (dsCur.quality ||= []).push(q);
        return;
      }
      if (inDs && dsCur && (m = line.match(DS_CON_RE))) {   // contrato: contract 1.0.0 status=agreed consumers=bi,api terms="…"
        dsOpen = true;
        const tk = tokens(m[3] || '', DS_CON_KEYS), c = { version: m[2].replace(/^"(.*)"$/, '$1'), status: 'draft' };
        const sv = tk.kv.status ?? tk.kv.estado;
        if (sv != null) { const st = DS_ST_IN[foldK(sv)]; if (st) c.status = st; else err(ln, msg.dsStatus(sv)); }
        const cv = tk.kv.consumers ?? tk.kv.consumidores;
        if (cv != null) { c.consumers = [...new Set(String(cv).split(',').map(x => x.trim()).filter(Boolean))]; c.consumers.forEach(id => dsCons.push({ ln, id })); }
        const tv = (tk.kv.terms ?? tk.kv.terminos ?? tk.kv['términos'])?.trim();
        if (tv) c.terms = tv;
        dsCur.contract = c;
        return;
      }
      if (!inDs && (DS_COL_RE.test(line) || DS_CON_RE.test(line) || (DS_RULE_RE.test(line) && DS_RULES.includes(foldK(line.split(/\s+/)[1]))))) return err(ln, msg.dsNoDs);
      if ((m = line.match(DSET_RE))) {   // dataset DS-001 orders: layer=silver domain=Sales owner=SH-003 product=yes classes=pii format=delta freshness=1h per_day=2 retention=365 phase=wave1 steward="Ana" desc="…"
        dsOpen = true;
        const id = m[2], name = (m[3] != null ? unquote(m[3]) : m[4]).trim(), tk = tokens(m[5], DS_KEYS), kv = tk.kv, kvv = (...ks) => ks.map(k => kv[k]).find(v => v != null), d = { id, name };
        if (!/^DS-\d+$/.test(id)) err(ln, msg.dsId(id));
        if (dsSeen.has(id)) err(ln, msg.dsDup(id)); else dsSeen.add(id);
        if (dsNames.has(name.toLowerCase())) err(ln, msg.dsName(name)); else dsNames.add(name.toLowerCase());
        const lv = kvv('layer', 'capa');
        if (lv != null) { const l = checkLayer(lv, ln); if (l) d.layer = l; }
        const dm = kvv('domain', 'dominio')?.trim(); if (dm) d.domain = dm;
        const ow = kvv('owner', 'dueño', 'dueno')?.trim(); if (ow) d.owner = ow;
        const st = kvv('steward', 'responsable')?.trim(); if (st) d.steward = st;
        const pv = kvv('product', 'producto');
        if (pv != null) { const b = parseBool(pv.trim()); if (b) d.product = true; else if (b == null) err(ln, msg.dsBool(pv)); }
        const cl = kvv('classes', 'clases');
        if (cl != null) { const c = checkData(cl, ln); if (c?.length) d.classes = c; }
        const fv = kvv('format', 'formato');
        if (fv != null) { const f = fv.trim().toLowerCase(); if (DS_FORMATS.includes(f)) d.format = f; else err(ln, msg.dsFormat(fv)); }
        const fr = kvv('freshness', 'frescura')?.trim();
        if (fr) { if (durOk(fr)) d.freshness = fr; else err(ln, msg.dsDur(fr)); }
        const pd = kvv('per_day', 'por_dia'), rt = kvv('retention', 'retencion', 'retención'), vol = {}, dwk = DS_W[ctx.lang === 'es' ? 'es' : 'en'];
        if (pd != null) { const n = Number(pd.replace(',', '.')); if (pd.trim() !== '' && Number.isFinite(n) && n >= 0) vol.perDay = n; else err(ln, msg.dsNum(dwk.perDay, pd)); }
        if (rt != null) { const n = Number(rt); if (rt.trim() !== '' && Number.isInteger(n) && n >= 0) vol.retentionDays = n; else err(ln, msg.dsNum(dwk.retention, rt)); }
        if (Object.keys(vol).length) d.volume = vol;
        const ph = kvv('phase', 'fase')?.trim(); if (ph) dsPhases.push({ d, id: ph, ln });
        const dv = kv.desc?.trim(); if (dv) d.description = dv;
        model.datasets.push(d); dsCur = d;
        return;
      }
      if ((m = line.match(RAID_RE))) {   // risk R-001: "título" p=3 i=4 owner= status= validation= due= raised= links=
        raidOpen = true;
        const type = RAID_TYPE_IN[m[1].toLowerCase()], id = m[2], tk = tokens(m[3], RAID_KEYS), it = { id, type, title: (tk.quotes[0] ?? tk.words.join(' ')).trim() }, kv = tk.kv;
        if (!new RegExp(`^${RAID_PFX[type]}-\\d+$`).test(id)) err(ln, msg.raidId(id, RAID_PFX[type]));
        if (raidSeen.has(id)) err(ln, msg.raidDup(id)); else raidSeen.add(id);
        [['p', 'probability'], ['i', 'impact']].forEach(([k, f]) => { if (kv[k] != null) { const n = Number(kv[k]); if (kv[k].trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 5) it[f] = n; else err(ln, msg.raidNum(k, kv[k])); } });
        const ow = (kv.owner ?? kv.dueño ?? kv.dueno)?.trim();
        if (ow) it.owner = ow;
        const sv = kv.status ?? kv.estado;
        if (sv != null) { const s = RAID_ST_IN[foldK(sv)]; if (s) it.status = s; else err(ln, msg.raidSt(sv)); }
        const vv = kv.validation ?? kv.validación ?? kv.validacion;
        if (vv != null) { const s = RAID_VAL_IN[foldK(vv)]; if (s) it.validation = s; else err(ln, msg.raidVal(vv)); }
        const du = kv.due ?? kv.fecha;
        if (du != null) { if (isDay(du)) it.due = du; else err(ln, msg.day(du)); }
        const ra = kv.raised ?? kv.registrado;
        if (ra != null) { if (isDay(ra)) it.raised = ra; else err(ln, msg.day(ra)); }
        const lk = kv.links ?? kv.enlaces;
        if (lk != null) raidRefs.push({ it, ln, refs: String(lk).split(',').map(x => x.trim()).filter(Boolean) });
        model.raid.push(it); raidCur = it;
        return;
      }
      if ((m = line.match(SH_RE))) {   // stakeholder SH-001: "nombre" role= org= raci=área:letra,… versions inactive
        const id = m[2], tk = tokens(m[3], SH_KEYS), flags = tk.words.filter(w => SH_FLAG[foldK(w)]), rest = tk.words.filter(w => !SH_FLAG[foldK(w)]), kv = tk.kv;
        const it = { id, name: (tk.quotes[0] ?? rest.join(' ')).trim() };
        if (!/^SH-\d+$/.test(id)) err(ln, msg.stkId(id));
        if (shSeen.has(id)) err(ln, msg.stkDup(id)); else shSeen.add(id);
        const ro = (kv.role ?? kv.rol)?.trim();
        if (ro) it.role = ro;
        const ov = kv.org;
        if (ov != null) { const o = SH_ORG_IN[foldK(ov)]; if (o) it.org = o; else err(ln, msg.stkOrg(ov)); } else it.org = 'client';
        if (kv.raci != null) {
          const raci = {};
          String(kv.raci).split(',').map(x => x.trim()).filter(Boolean).forEach(x => {
            const c = x.lastIndexOf(':'), a = c > 0 ? x.slice(0, c).trim() : '', r = c > 0 ? x.slice(c + 1).trim().toUpperCase() : '';
            if (a && /^[RACI]$/.test(r)) raci[a] = r; else err(ln, msg.stkRaci(x));
          });
          if (Object.keys(raci).length) it.raci = raci;
        }
        if (flags.some(w => SH_FLAG[foldK(w)] === 'versions')) it.versions = true;
        if (flags.some(w => SH_FLAG[foldK(w)] === 'inactive')) it.inactive = true;
        model.stakeholders.push(it);
        return;
      }
      if (inAdr && adrCur && (m = line.match(ADR_CRIT_RE))) {   // criterio de la decisión: criterion id: "Etiqueta" weight=3
        adrOpen = true;
        const id = m[2], tk = tokens(m[3], ADR_CKEYS), c = { id, label: (tk.quotes[0] ?? tk.words.join(' ')).trim() || id, weight: 3 }, wv = tk.kv.weight ?? tk.kv.peso;
        if (!/^[a-z0-9-]{1,30}$/.test(id)) return err(ln, msg.adrCritId(id));
        if ((adrCur.criteria || []).some(x => x.id === id)) return err(ln, msg.adrCritDup(id));
        if (wv != null) { const w = Number(wv); if (wv.trim() !== '' && Number.isInteger(w) && w >= 1 && w <= 5) c.weight = w; else err(ln, msg.adrWeight(wv)); }
        (adrCur.criteria ||= []).push(c);
        return;
      }
      if (inAdr && adrCur && (m = line.match(ADR_OPT_RE))) {   // opción: option A: "Título" chosen cost= risk= version= scores=crit:n,… summary= pros= cons=
        adrOpen = true;
        const id = m[2], tk = tokens(m[3], ADR_OKEYS), chosen = tk.words.filter(x => ADR_CHOSEN.includes(foldK(x))), rest = tk.words.filter(x => !ADR_CHOSEN.includes(foldK(x)));
        if (!/^[A-Za-z0-9-]{1,20}$/.test(id)) return err(ln, msg.adrOptId(id));
        if ((adrCur.options || []).some(x => x.id === id)) return err(ln, msg.adrOptDup(id));
        const o = { id, title: (tk.quotes[0] ?? rest.join(' ')).trim() }, kv = k => tk.kv[k.en] ?? tk.kv[k.es] ?? tk.kv[foldK(k.es)];
        const cv = kv({ en: 'cost', es: 'costo' }), rv = kv({ en: 'risk', es: 'riesgo' }), vv = kv({ en: 'version', es: 'versión' }), sv = kv({ en: 'scores', es: 'puntos' });
        if (cv != null) { const c = Number(cv); if (String(cv).trim() !== '' && Number.isFinite(c) && c >= 0) o.cost = c; else err(ln, msg.adrCost(cv)); }
        if (rv != null) { const r = ADR_RISK_IN[foldK(rv)]; if (r) o.risk = r; else err(ln, msg.adrRisk(rv)); }
        if (vv != null && String(vv).trim()) o.version = String(vv).trim();
        if (sv != null) {
          const sc = {}, ids = [];
          String(sv).split(',').map(x => x.trim()).filter(Boolean).forEach(pr => {
            const i = pr.lastIndexOf(':'), k = pr.slice(0, i).trim(), n = Number(pr.slice(i + 1));
            if (i > 0 && pr.slice(i + 1).trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 5) { sc[k] = n; ids.push(k); } else err(ln, msg.adrScore(pr));
          });
          if (ids.length) { o.scores = sc; adrScores.push({ d: adrCur, ids, ln }); }
        }
        for (const [k, key] of [['summary', 'summary'], ['resumen', 'summary'], ['pros', 'pros'], ['cons', 'cons'], ['contras', 'cons']]) if (tk.kv[k] != null && String(tk.kv[k]).trim()) o[key] = tk.kv[k];
        if (chosen.length) { if (adrCur.chosen) err(ln, msg.adrChosen(adrCur.chosen)); else adrCur.chosen = id; }
        (adrCur.options ||= []).push(o);
        return;
      }
      if (inAdr && adrCur && (m = line.match(ADR_FIELD_RE))) {
        adrOpen = true;
        const f = ADR_FIELD[m[1].toLowerCase()];
        if (f === 'signoffs') {
          splitSemi(m[2]).map(x => x.trim()).filter(Boolean).forEach(ent => {
            const tk = tokens(ent, ADR_SKEYS), vd = SIGN_IN[foldK(tk.words[1] || '')], h = { by: tk.words[0], verdict: vd, date: tk.words[2] };
            if (!vd || tk.words.length !== 3 || !isDay(h.date) || tk.quotes.length) return err(ln, msg.adrSign(ent));
            const nt = (tk.kv.note ?? tk.kv.nota)?.trim();
            if (nt) h.note = nt;
            adrSigns.push({ ln, by: h.by });
            (adrCur.signoffs ||= []).push(h);
          });
          return;
        }
        if (f !== 'history') { adrCur[f] = adrText(m[2]); return; }
        splitSemi(m[2]).map(x => x.trim()).filter(Boolean).forEach(ent => {
          const tk = tokens(ent, ADR_HKEYS), st = ADR_ST_IN[foldK(tk.words[0] || '')], h = { status: st, date: tk.words[1] };
          if (!st || tk.words.length !== 2 || !isDay(h.date) || tk.quotes.length) return err(ln, msg.adrHist(ent));
          const by = (tk.kv.by ?? tk.kv.por)?.trim(), nt = (tk.kv.note ?? tk.kv.nota)?.trim();
          if (by) h.by = by;
          if (nt) h.note = nt;
          (adrCur.history ||= []).push(h);
        });
        return;
      }
      if ((m = line.match(ADR_RE))) {
        adrOpen = true;
        const id = m[1], tk = tokens(m[2], ADR_KEYS), d = { id, title: (tk.quotes[0] ?? tk.words.join(' ')).trim() };
        if (adrSeen.has(id)) err(ln, msg.adrDup(id)); else adrSeen.add(id);
        const sv = tk.kv.status ?? tk.kv.estado;
        if (sv != null) { const s = ADR_ST_IN[foldK(sv)]; if (s) d.status = s; else err(ln, msg.adrSt(sv)); }
        const dv = tk.kv.date ?? tk.kv.fecha;
        if (dv != null) { if (isDay(dv)) d.date = dv; else err(ln, msg.day(dv)); }
        const dc = (tk.kv.deciders ?? tk.kv.decisores)?.trim();
        if (dc) d.deciders = dc;
        const sp = (tk.kv['superseded-by'] ?? tk.kv['reemplazada-por'] ?? tk.kv['sustituida-por'])?.trim();
        if (sp) d.supersededBy = sp;
        const ar = (tk.kv.area ?? tk.kv['área'])?.trim();
        if (ar) d.area = ar;
        const lk = tk.kv.links ?? tk.kv.enlaces;
        if (lk != null) adrRefs.push({ d, ln, refs: String(lk).split(',').map(x => x.trim()).filter(Boolean) });
        model.decisions.push(d); adrCur = d;
        return;
      }
      if (inReq && reqCur && (m = line.match(REQ_FIELD_RE))) { reqOpen = true; reqCur.detail = adrText(m[2]); return; }
      if ((m = line.match(REQ_RE))) {   // req REQ-001: "título" kind= priority= status= source= check= from= to= target= cls= jur= links=
        reqOpen = true;
        const id = m[1], tk = tokens(m[2], REQ_KEYS), kv = (...ks) => ks.map(k => tk.kv[k]).find(v => v != null), r = { id, title: (tk.quotes[0] ?? tk.words.join(' ')).trim() };
        if (reqSeen.has(id)) err(ln, msg.reqDup(id)); else reqSeen.add(id);
        [['kind', 'tipo', REQ_KIND_IN, msg.reqKind], ['priority', 'prioridad', REQ_PRIO_IN, msg.reqPrio], ['status', 'estado', REQ_ST_IN, msg.reqStatus]].forEach(([k, ke, map, bad]) => {
          const v = kv(k, ke);
          if (v == null) return;
          const x = map[foldK(v)];
          if (x) r[k] = x; else err(ln, bad(v));
        });
        const sv = kv('source', 'fuente')?.trim();
        if (sv) r.source = sv;
        const mv = kv('check', 'control'), ps = { from: kv('from', 'desde'), to: kv('to', 'hasta'), target: kv('target', 'objetivo'), ds: kv('ds', 'conjunto'), cls: kv('cls', 'clase'), jur: kv('jur', 'jurisdiccion', 'jurisdicción') };
        if (mv != null) {
          const mt = REQ_MET_IN[foldK(mv)];
          if (!mt) err(ln, msg.reqMetric(mv));
          else {
            const c = { metric: mt };
            ['from', 'to'].forEach(k => { if (ps[k] != null) { c[k] = ps[k].trim(); reqNodes.push({ ln, id: c[k] }); } });
            if (ps.ds != null && ps.ds.trim()) c.ds = ps.ds.trim();
            if (ps.target != null) { const n = Number(ps.target.replace(',', '.')); if (ps.target.trim() !== '' && Number.isFinite(n) && n >= 0) c.target = n; else err(ln, msg.reqNum(ps.target)); }
            ['cls', 'jur'].forEach(k => { if (ps[k] != null) c[k] = ps[k].trim().toLowerCase(); });
            if (c.cls && ctx.dataClasses && !ctx.dataClasses.includes(c.cls)) err(ln, msg.data(c.cls));
            r.check = c;
          }
        } else if (Object.values(ps).some(v => v != null)) err(ln, msg.reqNoCheck);
        const lk = kv('links', 'enlaces');
        if (lk != null) reqRefs.push({ r, ln, refs: String(lk).split(',').map(x => x.trim()).filter(Boolean) });
        model.requirements.push(r); reqCur = r;
        return;
      }
      if ((m = line.match(/^(t[ií]tulo|title)\s*:\s*(.*)$/i))) { model.title = m[2].trim() || model.title; return; }
      if ((m = line.match(/^(direcci[oó]n|direction)\s*:\s*(\S+)\s*$/i))) {
        const d = m[2].toUpperCase();
        if (d === 'LR' || d === 'TB') model.direction = d; else err(ln, msg.dir);
        return;
      }
      if ((m = line.match(/^(l[ií]neas|lines|routing)\s*:\s*(\S+)\s*$/i))) {
        const r = parseRoute(m[2]);
        if (r === 'elbow') model.routing = 'elbow'; else if (!r) err(ln, msg.route(m[2]));
        return;
      }
      if ((m = line.match(/^(layers|capas)\s*:\s*(\S+)\s*$/i))) {
        const f = m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/^(zones?|zonas?)$/.test(f)) model.layerNames = 'zones'; else if (!/^(medallion|medallon|medalla)$/.test(f)) err(ln, msg.lnames(m[2]));
        return;
      }
      if ((m = line.match(/^(autor|author)\s*:\s*(.*)$/i))) { if (m[2].trim()) (model.meta ||= {}).author = m[2].trim(); return; }
      if ((m = line.match(/^(versi[oó]n|version)\s*:\s*(.*)$/i))) { if (m[2].trim()) (model.meta ||= {}).version = m[2].trim(); return; }
      if ((m = line.match(/^(view|vista)\s*:\s*(\S+)\s*$/i))) {
        const v = m[2].toLowerCase() === 'gobierno' ? 'governance' : m[2].toLowerCase();
        if (!ctx.views || ctx.views.includes(v)) (model.meta ||= {}).view = v; else err(ln, msg.view(m[2]));
        return;
      }
      if ((m = line.match(TYPE_RE))) {
        const id = m[2].toLowerCase();
        if (!/^[a-z0-9-]{1,32}$/.test(id)) return err(ln, msg.etId(m[2]));
        if (BUILTIN_STYLES.includes(id) || model.edgeTypes.some(t => t.id === id)) return err(ln, msg.etDup(id));
        const tk = tokens(m[3], TYPE_KEYS), kv = tk.kv, t = { id, label: (tk.quotes[0] ?? tk.words.join(' ')) || id };
        const dv = kv.dash ?? kv.trazo;
        if (dv != null) { const d = String(dv).replace(/[,;]/g, ' ').trim().replace(/\s+/g, ' '); if (d === '' || DASH_OK.test(d)) { if (d) t.dash = d; } else err(ln, msg.etDash(dv)); }
        if (kv.color) t.color = kv.color;
        const wv = kv.width ?? kv.ancho;
        if (wv != null) { if (Number.isFinite(+wv) && +wv >= 1 && +wv <= 4) t.width = +wv; else err(ln, msg.etWidth(wv)); }
        const pv = kv.particles ?? kv.particulas ?? kv['partículas'];
        if (pv != null) { if (/^[0-4]$/.test(pv)) t.particles = +pv; else err(ln, msg.etPart(pv)); }
        model.edgeTypes.push(t);
        return;
      }
      if ((m = line.match(/^(review|revisi[oó]n)\s+([^\s:]+)\s*:\s*(.*)$/i))) {
        if (!ID.test(m[2])) return err(ln, msg.id(m[2]));
        const tk = tokens(m[3], Object.keys(REVIEW_KEYS)), r = { status: 'open' };
        const note = tk.quotes[0] ?? tk.words.join(' ');
        if (note) r.note = note;
        for (const [key, v] of Object.entries(tk.kv)) {
          const k = REVIEW_KEYS[key];
          if (k === 'by') r.by = v;
          else if (k === 'status') { if (/^(resolved|resuelta|closed|cerrada)$/i.test(v)) r.status = 'resolved'; else if (!/^(open|abierta)$/i.test(v)) err(ln, msg.status(v)); }
          else if (isDay(v)) r[k] = v; else err(ln, msg.day(v));
        }
        if (r.status !== 'resolved') delete r.closed;
        nodeFor(m[2]).review = r;
        return;
      }
      if ((m = line.match(LEVEL_RE))) {
        const id = m[2];
        if (!ID.test(id)) return err(ln, msg.id(id));
        if (stack.some(f => f.kind === 'group')) err(ln, msg.lvInGroup(id));
        inRefs.push({ ln, id });
        if (curLevel()) nests.push({ ln, id, outer: curLevel() });
        stack.push({ kind: 'level', id });
        return;
      }
      if (line === '}') { if (stack.length) stack.pop(); else err(ln, msg.brace); return; }
      if ((m = line.match(NOTE_RE)) || (m = line.match(ZONE_RE)) || (m = line.match(TRUST_RE))) {
        if (!ID.test(m[2])) return err(ln, msg.id(m[2]));
        const kw = m[1].toLowerCase(), isNote = /^not/.test(kw), isTrust = /^(trust|confianza)$/.test(kw);
        const tk = tokens(m[3], isNote ? NOTE_KEYS : ZONE_KEYS), o = { id: m[2] };
        const text = tk.quotes[0] ?? tk.words.join(' ').replace(/\\n/g, '\n');
        const at = tk.kv.at ?? tk.kv.en ?? tk.kv.pos, sz = tk.kv.size ?? tk.kv.tamaño ?? tk.kv.tamano;
        if (at != null) { const p = parsePair(at); if (p) { o.x = p[0]; o.y = p[1]; } else err(ln, msg.at(at)); }
        if (sz != null) { const p = parsePair(sz); if (p) { o.w = p[0]; o.h = p[1]; } else err(ln, msg.size(sz)); }
        if (isNote) { o.text = text; if (tk.kv.color) o.color = tk.kv.color; } else {
          o.label = text;
          if (isTrust) { o.kind = 'trust'; const tv = (tk.kv.trust ?? tk.kv.confianza)?.trim(); if (tv) o.trust = tv; } else {
            const sv = tk.kv.severity ?? tk.kv.severidad;
            if (sv != null) { const s = SEV_IN[foldK(sv)]; if (s) o.severity = s; else err(ln, msg.sev(sv)); }
          }
          if (tk.kv.desc != null) o.desc = tk.kv.desc;
        }
        const inN = resolveIn((tk.kv.in ?? tk.kv.dentro)?.trim(), ln);
        if (inN) o.in = inN;
        (isNote ? model.notes : model.zones).push(o);
        return;
      }
      if ((m = line.match(THREAT_RE))) { thLines.push({ ln, from: m[2], to: m[4], nth: m[5] ? +m[5] : 1, k: m[6].toUpperCase(), rest: m[7].trim() }); return; }
      if ((m = line.match(DISMISS_RE))) {
        const id = m[2] != null ? unquote(m[2]) : m[3], tk = tokens(m[4], Object.keys(DISMISS_KEYS)), d = { reason: tk.quotes[0] ?? tk.words.join(' ') };
        for (const [key, v] of Object.entries(tk.kv)) { if (DISMISS_KEYS[key] === 'by') { if (v.trim()) d.by = v.trim(); } else if (isDay(v)) d.date = v; else err(ln, msg.day(v)); }
        model.dismissed[id] = d;
        return;
      }
      if ((m = line.match(/^(grupo|group)\s+([^\s:{]+)\s*:?\s*(.*?)\s*\{\s*$/i))) {
        const id = m[2];
        if (!ID.test(id)) return err(ln, msg.groupId(id));
        if (groups.has(id)) return err(ln, msg.groupDup(id));
        const tk = tokens(m[3], ['color', 'icon', 'icono', 'kind', 'tipo', ...Object.keys(GOV_KEYS), ...REGION_KEYS, 'layer', 'capa', 'controls', 'controles', 'in', 'dentro', ...PHASE_KEYS]);
        const g = { id, label: tk.quotes[0] ?? (tk.words.join(' ') || id) };
        if (tk.kv.color) g.color = tk.kv.color;
        applyGov(g, tk.kv);
        const gi = (tk.kv.icon ?? tk.kv.icono)?.trim().toLowerCase();
        if (gi) { if (ctx.icons[gi] && gi.includes('/')) g.icon = gi; else err(ln, msg.icon(gi)); } // icono de grupo: proveedor/clave
        const gk = tk.kv.kind ?? tk.kv.tipo;
        if (gk != null) { // lógico / físico (también en inglés o español, con o sin tilde)
          const f = gk.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (/^(physical|fisic[oa]?)$/.test(f)) g.kind = 'physical'; else if (/^(logical|logic[oa]?)$/.test(f)) g.kind = 'logical'; else err(ln, msg.gkind(gk));
        }
        const gr = REGION_KEYS.map(k => tk.kv[k]).find(v => v != null && v.trim());
        if (gr) g.region = gr.trim();
        const gl = tk.kv.layer ?? tk.kv.capa;
        if (gl != null) { const l = checkLayer(gl, ln); if (l) g.layer = l; }
        applyCtl(g, tk.kv, ln);
        phaseOf(g, tk.kv, ln);
        if (curGroup()) g.parent = curGroup();
        const gin = resolveIn((tk.kv.in ?? tk.kv.dentro)?.trim(), ln);
        if (gin) g.in = gin;
        gobj.set(id, g);
        groups.add(id);
        model.groups.push(g);
        stack.push({ kind: 'group', id });
        return;
      }

      const colon = line.indexOf(':');
      const left = colon < 0 ? line : line.slice(0, colon);
      const right = colon < 0 ? '' : line.slice(colon + 1).trim();

      if (HAS_ARROW.test(left)) {
        const parts = left.split(ARROW_SPLIT).map(s => s.trim());
        if (parts.length < 3 || parts.length % 2 === 0) return err(ln, msg.edge);
        for (let k = 0; k < parts.length; k += 2) if (!ID.test(parts[k])) return err(ln, msg.id(parts[k]));
        let label = right, km;
        const kv = {};
        while ((km = label.match(EDGE_OPT))) { kv[km[1].toLowerCase()] = km[2]; label = label.slice(0, km.index).trim(); }
        const dsV = kv.datasets ?? kv.tablas ?? kv.conjuntos, dsets = dsV == null ? [] : parseDatasets(dsV);
        const color = kv.color, data = checkData(kv.data ?? kv.datos, ln), encV = kv.encrypted ?? kv.cifrado;
        const enc = encV == null ? null : parseBool(encV);
        if (encV != null && enc == null) err(ln, msg.enc(encV));
        const routeV = kv.line ?? kv.linea ?? kv['línea'], route = routeV == null ? null : parseRoute(routeV);
        if (routeV != null && !route) err(ln, msg.route(routeV));
        const bothV = kv.both ?? kv.ambos, both = bothV == null ? null : parseBool(bothV);
        if (bothV != null && both == null) err(ln, msg.enc(bothV));
        const stV = kv.style ?? kv.estilo, stl = stV == null ? null : parseStyle(stV);
        if (stV != null && !stl) err(ln, msg.style(stV));
        const wtV = kv.weight ?? kv.peso, wt = wtV == null ? null : Object.hasOwn(WEIGHT_IN, foldK(wtV)) ? WEIGHT_IN[foldK(wtV)] : undefined;
        if (wtV != null && wt === undefined) err(ln, msg.weight(wtV));
        const trV = kv.transfer ?? kv.transferencia, tr = trV == null ? null : /^(ok|yes|y|true|si|sí|1|on)$/i.test(trV);
        if (trV != null && !tr) err(ln, msg.transfer(trV));
        const thV = kv.threats ?? kv.amenazas, th = thV == null ? null : parseThreats(thV);
        const ltV = kv.latency ?? kv.latencia, lat = ltV == null ? null : (ltV.startsWith('"') ? unquote(ltV) : ltV).trim();
        if (lat != null && !durOk(lat)) err(ln, msg.dsDur(lat));

        if (th) th.bad.forEach(b => err(ln, msg.threats(b)));
        // Etiqueta entre comillas (JSON) o con \n escapado = varias líneas
        if (/^".*"$/.test(label)) label = unquote(label); else label = label.replace(/\\n/g, '\n');
        for (let k = 0; k + 2 < parts.length; k += 2) {
          nodeFor(parts[k]); nodeFor(parts[k + 2]);
          const e = { from: parts[k], to: parts[k + 2] };
          const style = ARROWS[parts[k + 1]];
          const sty = stl || style;
          if (sty !== 'sync') e.style = sty;
          if (wt) e.weight = wt;
          if (k + 3 === parts.length && label) e.label = label;
          if (color) e.color = color;
          if (data?.length) e.data = data;
          if (dsets.length) e.datasets = [...dsets];
          if (lat && durOk(lat)) e.latency = lat;
          if (enc != null) e.encrypted = enc;
          if (route) e.route = route;
          if (both) e.both = true;
          if (tr) e.transferOk = true;
          if (th && Object.keys(th.threats).length) e.threats = JSON.parse(JSON.stringify(th.threats));
          phaseOf(e, kv, ln);
          model.edges.push(e);
        }
        return;
      }

      if (colon > 0 && ID.test(left.trim())) {
        const n = nodeFor(left.trim());
        const tk = tokens(right, [...NODE_KEYS, ...Object.keys(GOV_KEYS), 'name', 'nombre']);
        if (tk.brackets.length) {
          const kind = resolveKind(tk.brackets[0], ctx, msg);
          if (kind.error) err(ln, kind.error);
          if (kind.type) n.type = kind.type;
          if (kind.icon) n.icon = kind.icon;
        }
        // name="…" / nombre="…": nombre con comillas, corchetes o clave=valor (lo escribe stringify cuando hace falta)
        const label = tk.kv.name ?? tk.kv.nombre ?? tk.words.join(' ');
        n.label = label || (n.icon && ctx.icons[n.icon].label) || (n.type !== 'generic' && ctx.types[n.type]?.label) || n.id;
        const sub = tk.kv.sub ?? tk.quotes[0];
        if (sub) n.sub = sub;
        ['color', 'badge', 'desc'].forEach(k => { if (tk.kv[k] != null) n[k] = tk.kv[k]; });
        ['x', 'y'].forEach(k => { if (tk.kv[k] != null && Number.isFinite(+tk.kv[k])) n[k] = +tk.kv[k]; });
        const cv = tk.kv.costo ?? tk.kv.cost;
        if (cv != null) { const c = parseCost(cv); if (c) Object.assign(n, c); else err(ln, msg.cost(cv)); }
        const dv = tk.kv.data ?? tk.kv.datos;
        if (dv != null) { const d = checkData(dv, ln); if (d.length) n.data = d; }
        applyGov(n, tk.kv);
        const nr = REGION_KEYS.map(k => tk.kv[k]).find(v => v != null && v.trim());
        if (nr) n.region = nr.trim();
        const lv = tk.kv.layer ?? tk.kv.capa;
        if (lv != null) { const l = checkLayer(lv, ln); if (l) n.layer = l; }
        const dpv = tk.kv.disposition ?? tk.kv.disposición ?? tk.kv.disposicion;
        if (dpv != null) { const d = checkDisp(dpv, ln); if (d) n.disposition = d; }
        if (tk.kv.radar != null) { const rv = tk.kv.radar.trim(); if (/^(none|ninguno|ninguna)$/i.test(rv)) n.radar = 'none'; else if (/^[A-Za-z0-9_.-]{1,40}$/.test(rv)) n.radar = rv; else err(ln, msg.radar(rv)); }
        const ev = tk.kv.exposure ?? tk.kv.exposición ?? tk.kv.exposicion;
        if (ev != null) { if (/^(public|publico|público|pública|publica|external|externa?)$/i.test(ev.trim())) n.exposure = 'public'; else if (/^(internal|interno|interna|private|privado|privada)$/i.test(ev.trim())) n.exposure = 'internal'; else err(ln, msg.expo(ev)); }
        const bv = tk.kv.backup ?? tk.kv.respaldo;
        if (bv != null) { const b = parseBool(bv.trim()); if (b == null) err(ln, msg.backup(bv)); else n.backup = b; }
        applyCtl(n, tk.kv, ln);
        phaseOf(n, tk.kv, ln);
        ['sla', 'rpo', 'rto'].forEach(k => { if (tk.kv[k] != null && tk.kv[k].trim()) n[k] = tk.kv[k].trim(); }); // se limpian en sanitize
        { const rv = tk.kv.replicas ?? tk.kv.réplicas; if (rv != null && rv.trim()) n.replicas = rv.trim(); }
        const c4v = tk.kv.c4;
        if (c4v != null) { const k = C4_IN[c4v.trim().toLowerCase()]; if (k) n.c4 = k; else err(ln, msg.c4(c4v)); }
        const inN = resolveIn((tk.kv.in ?? tk.kv.dentro)?.trim(), ln);
        if (inN) n.in = inN; else delete n.in;
        if (curGroup()) n.group = curGroup();
        return;
      }

      err(ln, msg.line);
    });
    if (stack.length) err(String(src).split(/\r?\n/).length, msg.open(stack.length, stack.some(f => f.kind === 'level')));
    inRefs.forEach(r => { if (!nodes.has(r.id)) err(r.ln, msg.inRef(r.id)); });
    nests.forEach(r => { if (nodes.has(r.id) && nodes.get(r.id).in !== r.outer) err(r.ln, msg.lvNest(r.id, r.outer)); });
    // Fases de los elementos: deben existir y until debe ir después de phase (si no, se avisa y no se aplica)
    { const ix = new Map(model.phases.map((p, i) => [p.id, i]));
      phRefs.forEach(({ o, a, b, ln }) => {
        let ia = -1;
        if (a) { if (ix.has(a)) { o.phase = a; ia = ix.get(a); } else err(ln, msg.phaseUnknown(a)); }
        if (b) { if (!ix.has(b)) err(ln, msg.phaseUnknown(b)); else if (ix.get(b) > Math.max(ia, 0)) o.until = b; else err(ln, msg.phaseOrder(a || model.phases[0].id, b)); }
      }); }
    // Conjuntos de datos: la fase y los consumidores del contrato deben existir (si no, se avisa y no se aplica)
    { const ix = new Set(model.phases.map(p => p.id));
      dsPhases.forEach(({ d, id, ln }) => { if (ix.has(id)) d.phase = id; else err(ln, msg.phaseUnknown(id)); });
      dsCons.forEach(({ ln, id }) => { if (!nodes.has(id)) err(ln, msg.dsConsumer(id)); }); }
    // Notas de decisiones STRIDE: la conexión se busca por origen -> destino (la n-ésima si hay varias); la amenaza ya debe tener estado
    thLines.forEach(t => {
      const es = model.edges.filter(e => e.from === t.from && e.to === t.to), e = es[t.nth - 1];
      if (!e) return err(t.ln, msg.thEdge(t.from, t.to));
      if (!e.threats?.[t.k]) return err(t.ln, msg.thNone(t.from, t.to, t.k));
      const tk = tokens(t.rest, []), note = tk.quotes[0] ?? tk.words.join(' ').replace(/\\n/g, '\n');
      if (note) e.threats[t.k].note = note;
    });
    // Firmas: el interesado debe existir (los de la página, o los declarados en el propio texto)
    { const known = new Set([...(ctx.stakeholders || []), ...(model.stakeholders || []).map(x => x.id)]); adrSigns.forEach(({ ln, by }) => { if (!known.has(by)) err(ln, msg.adrSignBy(by)); }); }
    // Puntajes: cada criterio citado debe estar declarado en la misma decisión
    adrScores.forEach(({ d, ids, ln }) => ids.forEach(k => { if (!(d.criteria || []).some(c => c.id === k)) err(ln, msg.adrScoreCrit(k)); }));
    // Enlaces de las decisiones: nodo, grupo, conexión (origen->destino[#n]) o version:<id> (las versiones no están en el texto: las valida setModel)
    adrRefs.forEach(({ d, ln, refs }) => {
      const l = {}, add = (k, id) => { if (!(l[k] ||= []).includes(id)) l[k].push(id); };
      refs.forEach(r => {
        let x;
        if (nodes.has(r)) add('nodes', r);
        else if (groups.has(r)) add('groups', r);
        else if ((x = r.match(/^(.+?)->(.+?)(?:#(\d+))?$/))) {
          const e = model.edges.filter(q => q.from === x[1] && q.to === x[2])[(x[3] ? +x[3] : 1) - 1];
          if (e) { e.id ||= `e${model.edges.indexOf(e) + 1}`; add('edges', e.id); } else err(ln, msg.adrLink(r));
        } else if (/^version:./.test(r)) add('versions', r.slice(8));
        else err(ln, msg.adrLink(r));
      });
      if (Object.keys(l).length) d.links = l;
    });
    // Requisitos: origen y destino del control deben ser nodos; enlaces a decisiones, nodos, grupos y conexiones (origen->destino[#n])
    reqNodes.forEach(({ ln, id }) => { if (!nodes.has(id)) err(ln, msg.reqNode(id)); });
    reqRefs.forEach(({ r, ln, refs }) => {
      const l = {}, add = (k, id) => { if (!(l[k] ||= []).includes(id)) l[k].push(id); };
      refs.forEach(x => {
        let q;
        if (nodes.has(x)) add('nodes', x);
        else if (groups.has(x)) add('groups', x);
        else if (adrSeen.has(x)) add('decisions', x);
        else if ((q = x.match(/^(.+?)->(.+?)(?:#(\d+))?$/))) {
          const e = model.edges.filter(z => z.from === q[1] && z.to === q[2])[(q[3] ? +q[3] : 1) - 1];
          if (e) { e.id ||= `e${model.edges.indexOf(e) + 1}`; add('edges', e.id); } else err(ln, msg.reqLink(x));
        } else err(ln, msg.reqLink(x));
      });
      if (Object.keys(l).length) r.links = l;
    });
    // Enlaces del registro RAID: decisión (ADR-001), requisito (REQ-001; si el modelo no los trae, basta la forma), nodo, grupo o conexión (origen->destino[#n])
    raidRefs.forEach(({ it, ln, refs }) => {
      const l = {}, add = (k, id) => { if (!(l[k] ||= []).includes(id)) l[k].push(id); }, decs = new Set(model.decisions.map(d => d.id)), reqs = new Set((model.requirements || []).map(r => r.id));
      refs.forEach(r => {
        let x;
        if (nodes.has(r)) add('nodes', r);
        else if (groups.has(r)) add('groups', r);
        else if (decs.has(r)) add('decisions', r);
        else if (reqs.has(r) || /^REQ-\d+$/i.test(r)) add('requirements', r);
        else if ((x = r.match(/^(.+?)->(.+?)(?:#(\d+))?$/))) {
          const e = model.edges.filter(q => q.from === x[1] && q.to === x[2])[(x[3] ? +x[3] : 1) - 1];
          if (e) { e.id ||= `e${model.edges.indexOf(e) + 1}`; add('edges', e.id); } else err(ln, msg.raidLink(r));
        } else err(ln, msg.raidLink(r));
      });
      if (Object.keys(l).length) it.links = l;
    });
    return { model, errors };
  }

  function stringify(m, lang = 'en') {
    const w = { ...(WORDS[lang] || WORDS.en), ...(TYPE_W[lang] || TYPE_W.en) };
    const out = [`${w.title}: ${m.title}`];
    if (m.direction) out.push(`${w.direction}: ${m.direction}`);
    if (m.routing === 'elbow') out.push(`${w.lines}: ${w.elbow}`);
    if (m.layerNames === 'zones') out.push(`${w.layers}: ${w.zones}`);
    if (m.meta?.author) out.push(`${w.author}: ${m.meta.author}`);
    if (m.meta?.version) out.push(`${w.version}: ${m.meta.version}`);
    if (m.meta?.view) out.push(`${w.view}: ${m.meta.view}`);
    (m.edgeTypes || []).forEach(t => out.push(`${w.type} ${t.id}: ${quote(t.label ?? t.id)}${t.dash ? ` ${w.dash}=${bare(t.dash)}` : ''}${t.color ? ` color=${bare(t.color)}` : ''}${t.width != null ? ` ${w.width}=${t.width}` : ''}${t.particles != null ? ` ${w.particles}=${t.particles}` : ''}`));
    (m.phases || []).forEach(p => out.push(`${w.phase} ${p.id}: ${quote(p.name ?? p.id)}${p.date ? ` ${w.date}=${p.date}` : ''}${p.goal ? ` ${w.goal}=${quote(p.goal)}` : ''}`));
    out.push('');
    const ctlText = o => `${CTL_KEY[lang] || CTL_KEY.en}=${bare(Object.entries(o.controls).map(([k, v]) => `${k}=${(CTL_OUT[lang] || CTL_OUT.en)[v] || v}`).join(','))}`;
    // Lo que vive en un nivel C4 se escribe dentro de un bloque `inside`, sin `in=`; `inBlock` evita repetirlo
    let inBlock = false;
    const nodeLine = n => {
      // Un nombre que el lector confundiría (comillas, corchetes, llaves, clave=valor, saltos de línea) va como name="…"
      const plain = !/["[\]{}\n]|(^|\s)[A-Za-zÀ-ÿñÑ0-9]+=/.test(n.label) && n.label.trim() === n.label && n.label !== '';
      const p = [plain ? `${n.id}: ${n.label}` : `${n.id}: ${lang === 'es' ? 'nombre' : 'name'}=${quote(n.label)}`];
      if (n.icon) p.push(`[${n.icon}]`); else if (n.type && n.type !== 'generic') p.push(`[${n.type}]`);
      if (n.sub) p.push(quote(n.sub));
      if (n.badge != null && n.badge !== '') p.push(`badge=${bare(n.badge)}`);
      if (n.color) p.push(`color=${bare(n.color)}`);
      if (n.cost != null && n.cost !== '' && Number.isFinite(+n.cost)) p.push(`${w.cost}=${costValue(n, w)}`);
      if (n.data?.length) p.push(`${w.data}=${n.data.join(',')}`);
      GOV_WORDS.forEach(k => { if (n[k]) p.push(`${w[k]}=${bare(n[k])}`); });
      if (n.region) p.push(`${w.region}=${bare(n.region)}`);
      if (n.layer) p.push(`${w.layer}=${w.layerOf[n.layer] || n.layer}`);
      if (n.disposition) p.push(`${w.disposition}=${w.dispOf[n.disposition] || n.disposition}`);
      if (n.radar) p.push(`radar=${bare(n.radar)}`);
      if (n.exposure) p.push(`${w.exposure}=${w.expoOf[n.exposure] || n.exposure}`);
      if (typeof n.backup === 'boolean') p.push(`${w.backup}=${n.backup ? w.yes : w.no}`);
      if (n.sla != null) p.push(`sla=${n.sla}`);
      if (n.rpo != null) p.push(`rpo=${n.rpo}`);
      if (n.rto != null) p.push(`rto=${n.rto}`);
      if (n.replicas != null) p.push(`${lang === 'es' ? 'réplicas' : 'replicas'}=${n.replicas}`);
      if (n.controls) p.push(ctlText(n));
      if (n.c4) p.push(`c4=${(C4_OUT[lang] || C4_OUT.en)[n.c4] || n.c4}`);
      if (n.in && !inBlock) p.push(`${w.in}=${bare(n.in)}`);
      if (n.phase) p.push(`${w.phase}=${bare(n.phase)}`);
      if (n.until) p.push(`${w.until}=${bare(n.until)}`);
      if (n.desc) p.push(`desc=${quote(n.desc)}`);
      return p.join(' ');
    };
    const groupIds = new Set(m.groups.map(g => g.id));
    const nodeIds = new Set(m.nodes.map(n => n.id)), notes = m.notes || [], zones = m.zones || [];
    const scopeOf = x => (x.in && nodeIds.has(x.in) ? x.in : null); // nivel C4 donde vive (null = superior)
    const writeGroup = (g, ind) => {
      out.push(`${ind}${w.group} ${g.id} ${quote(g.label)}${g.icon ? ` icon=${bare(g.icon)}` : ''}${g.color ? ` color=${bare(g.color)}` : ''}${g.kind ? ` ${w.kind}=${w[g.kind]}` : ''}${GOV_WORDS.filter(k => g[k]).map(k => ` ${w[k]}=${bare(g[k])}`).join('')}${g.region ? ` ${w.region}=${bare(g.region)}` : ''}${g.layer ? ` ${w.layer}=${w.layerOf[g.layer] || g.layer}` : ''}${g.controls ? ` ${ctlText(g)}` : ''}${g.in && !inBlock ? ` ${w.in}=${bare(g.in)}` : ''}${g.phase ? ` ${w.phase}=${bare(g.phase)}` : ''}${g.until ? ` ${w.until}=${bare(g.until)}` : ''} {`);
      m.nodes.filter(n => n.group === g.id).forEach(n => out.push(`${ind}  ${nodeLine(n)}`));
      m.groups.filter(c => c.parent === g.id).forEach(c => writeGroup(c, ind + '  '));
      out.push(`${ind}}`);
    };
    const boxText = o => `${w.at}=${rnd(o.x)},${rnd(o.y)} ${w.size}=${rnd(o.w)},${rnd(o.h)}`;
    const noteLine = (o, ind) => `${ind}${w.note} ${o.id}: ${quote(o.text ?? '')} ${boxText(o)}${o.color ? ` color=${bare(o.color)}` : ''}${o.in && !inBlock ? ` ${w.in}=${bare(o.in)}` : ''}`;
    const zoneLine = (o, ind) => `${ind}${o.kind === 'trust' ? `${w.trust} ${o.id}: ${quote(o.label ?? '')}${o.trust ? ` ${w.trust}=${bare(o.trust)}` : ''}` : `${w.zone} ${o.id}: ${quote(o.label ?? '')} ${w.severity}=${w.sevOf[o.severity] || o.severity || w.sevOf.medium}`} ${boxText(o)}${o.desc ? ` desc=${quote(o.desc)}` : ''}${o.in && !inBlock ? ` ${w.in}=${bare(o.in)}` : ''}`;
    // Contenido de un nivel (null = superior): grupos, nodos y, dentro de un bloque, notas y zonas; luego un bloque `inside` por cada nodo que tenga diagrama interno
    const seenScope = new Set();
    const writeScope = (sc, ind) => {
      if (seenScope.has(sc)) return;
      seenScope.add(sc);
      const here = x => scopeOf(x) === sc;
      m.groups.filter(g => here(g) && (!g.parent || !groupIds.has(g.parent))).forEach(g => writeGroup(g, ind));
      m.nodes.filter(n => here(n) && (!n.group || !groupIds.has(n.group))).forEach(n => out.push(ind + nodeLine(n)));
      if (sc != null) { notes.filter(here).forEach(o => out.push(noteLine(o, ind))); zones.filter(here).forEach(o => out.push(zoneLine(o, ind))); }
      m.nodes.filter(n => here(n) && [...m.nodes, ...m.groups, ...notes, ...zones].some(x => scopeOf(x) === n.id)).forEach(n => {
        out.push(`${ind}${w.inside} ${n.id} {`);
        const was = inBlock; inBlock = true;
        writeScope(n.id, ind + '  ');
        inBlock = was;
        out.push(`${ind}}`);
      });
    };
    writeScope(null, '');
    if (m.edges.length) out.push('');
    m.edges.forEach(e => {
      const arrow = ARROW_OF[e.style] || '->';
      const tail = [e.label ? (EDGE_OPT.test(e.label) || /^".*"$/.test(e.label) || /[\n\\]/.test(e.label) ? quote(e.label) : e.label) : '', e.color ? `color=${bare(e.color)}` : '',
        e.style && !ARROW_OF[e.style] ? `${lang === 'es' ? 'estilo' : 'style'}=${bare((STYLE_OUT[lang] || {})[e.style] || e.style)}` : '', WEIGHT_OUT.en[e.weight] ? `${lang === 'es' ? 'peso' : 'weight'}=${(WEIGHT_OUT[lang] || WEIGHT_OUT.en)[e.weight]}` : '',
        e.data?.length ? `${w.data}=${e.data.join(',')}` : '', e.datasets?.length ? `${DS_KEY[lang] || DS_KEY.en}=${bare(e.datasets.join(','))}` : '', e.latency ? `${(DS_W[lang] || DS_W.en).latency}=${bare(e.latency)}` : '', e.encrypted != null ? `${w.encrypted}=${e.encrypted ? w.yes : w.no}` : '',
        e.both ? `${w.both}=${w.yes}` : '', e.transferOk ? `${w.transfer}=${w.ok}` : '', e.threats && Object.keys(e.threats).length ? `${TH_KEY[lang] || TH_KEY.en}=${Object.entries(e.threats).map(([k, d]) => `${k}=${(TH_ST[lang] || TH_ST.en)[d.status] || d.status}`).join(',')}` : '', e.route ? `${w.line}=${e.route === 'elbow' ? w.elbowOne : w.curvedOne}` : '', e.phase ? `${w.phase}=${bare(e.phase)}` : '', e.until ? `${w.until}=${bare(e.until)}` : ''].filter(Boolean).join(' ');
      out.push(`${e.from} ${arrow} ${e.to}${tail ? ` : ${tail}` : ''}`);
    });
    const reviewed = m.nodes.filter(n => n.review);
    if (reviewed.length) out.push('');
    reviewed.forEach(n => {
      const r = n.review, p = [`${w.review} ${n.id}: ${quote(r.note || '')}`];
      if (r.by) p.push(`${w.by}=${bare(r.by)}`);
      if (r.raised) p.push(`${w.raised}=${r.raised}`);
      if (r.due) p.push(`${w.due}=${r.due}`);
      if (r.status === 'resolved') p.push(`${w.status}=${w.resolved}`, ...(r.closed ? [`${w.closed}=${r.closed}`] : []));
      out.push(p.join(' '));
    });
    const tops = [...notes.filter(o => scopeOf(o) == null).map(o => noteLine(o, '')), ...zones.filter(o => scopeOf(o) == null).map(o => zoneLine(o, ''))];
    if (tops.length) out.push('', ...tops);
    // Notas de decisiones STRIDE: una línea por amenaza decidida con nota; `#n` solo si varias conexiones comparten origen y destino
    const tl = [];
    m.edges.forEach(e => {
      const same = m.edges.filter(x => x.from === e.from && x.to === e.to);
      Object.entries(e.threats || {}).forEach(([k, d]) => { if (d.note) tl.push(`${w.threat} ${e.from} -> ${e.to}${same.length > 1 ? ` #${same.indexOf(e) + 1}` : ''} ${k}: ${quote(d.note)}`); });
    });
    if (tl.length) out.push('', ...tl);
    const dis = Object.entries(m.dismissed || {});
    if (dis.length) out.push('', ...dis.map(([id, d]) => `${w.dismiss} ${/[\s"]/.test(id) || id.endsWith(':') || !id ? quote(id) : id}: ${quote(d.reason || '')}${d.by ? ` ${w.by}=${bare(d.by)}` : ''}${d.date ? ` ${w.date}=${d.date}` : ''}`));
    // Decisiones (ADR): al final; los campos de texto entre comillas (JSON), el historial en una sola línea
    const aw = ADR_W[lang] || ADR_W.en, ast = ADR_ST_OUT[lang] || {};
    (m.decisions || []).forEach(d => {
      const l = d.links || {}, same = e => m.edges.filter(x => x.from === e.from && x.to === e.to);
      const refs = [...(l.nodes || []), ...(l.groups || []),
        ...(l.edges || []).map(id => m.edges.find(e => e.id === id)).filter(Boolean).map(e => `${e.from}->${e.to}${same(e).length > 1 ? `#${same(e).indexOf(e) + 1}` : ''}`),
        ...(l.versions || []).map(id => `version:${id}`)];
      out.push('', `adr ${d.id}: ${quote(d.title ?? '')} ${aw.status}=${ast[d.status] || d.status || 'proposed'}${d.date ? ` ${aw.date}=${d.date}` : ''}${d.deciders ? ` ${aw.deciders}=${bare(d.deciders)}` : ''}${refs.length ? ` ${aw.links}=${bare(refs.join(','))}` : ''}${d.supersededBy ? ` ${aw.sup}=${bare(d.supersededBy)}` : ''}${d.area ? ` ${aw.area}=${bare(d.area)}` : ''}`);
      (d.criteria || []).forEach(c => out.push(`  ${aw.crit} ${c.id}: ${quote(c.label ?? c.id)} ${aw.weight}=${c.weight ?? 3}`));
      (d.options || []).forEach(o => {
        const sc = (d.criteria || []).filter(c => o.scores?.[c.id] != null).map(c => `${c.id}:${o.scores[c.id]}`).join(',');
        out.push(`  ${aw.opt} ${o.id}: ${quote(o.title ?? '')}${d.chosen === o.id ? ` ${aw.chosen}` : ''}${o.cost != null ? ` ${aw.cost}=${+o.cost}` : ''}${o.risk ? ` ${aw.risk}=${(ADR_RISK_OUT[lang] || {})[o.risk] || o.risk}` : ''}${o.version ? ` ${aw.version}=${bare(o.version)}` : ''}${sc ? ` ${aw.scores}=${sc}` : ''}${['summary', 'pros', 'cons'].filter(k => o[k]).map(k => ` ${aw[k]}=${quote(o[k])}`).join('')}`);
      });
      ['context', 'decision', 'consequences'].forEach(k => { if (d[k]) out.push(`  ${aw[k]}: ${quote(d[k])}`); });
      if (d.signoffs?.length) out.push(`  ${aw.signoffs}: ${d.signoffs.map(x => `${x.by} ${(SIGN_OUT[lang] || {})[x.verdict] || x.verdict} ${x.date}${x.note ? ` ${aw.note}=${hv(x.note)}` : ''}`).join('; ')}`);
      if (d.history?.length) out.push(`  ${aw.history}: ${d.history.map(h => `${ast[h.status] || h.status} ${h.date}${h.by ? ` ${aw.by}=${hv(h.by)}` : ''}${h.note ? ` ${aw.note}=${hv(h.note)}` : ''}`).join('; ')}`);
    });
    // Requisitos: al final; el detalle en una línea de campo entre comillas (JSON)
    const rw = REQ_W[lang] || REQ_W.en, ro = REQ_OUT[lang] || {}, rv = v => ro[v] || v;
    (m.requirements || []).forEach(r => {
      const l = r.links || {}, same = e => m.edges.filter(x => x.from === e.from && x.to === e.to), c = r.check;
      const refs = [...(l.decisions || []), ...(l.nodes || []), ...(l.groups || []),
        ...(l.edges || []).map(id => m.edges.find(e => e.id === id)).filter(Boolean).map(e => `${e.from}->${e.to}${same(e).length > 1 ? `#${same(e).indexOf(e) + 1}` : ''}`)];
      out.push('', [`req ${r.id}: ${quote(r.title ?? '')}`, `${rw.kind}=${rv(r.kind || 'driver')}`, r.priority ? `${rw.priority}=${rv(r.priority)}` : '', `${rw.status}=${rv(r.status || 'draft')}`, r.source ? `${rw.source}=${bare(r.source)}` : '',
        c ? `${rw.check}=${rv(c.metric)}` : '', c?.from != null ? `${rw.from}=${bare(c.from)}` : '', c?.to != null ? `${rw.to}=${bare(c.to)}` : '', c?.ds ? `${rw.ds}=${bare(c.ds)}` : '', c?.target != null ? `${rw.target}=${+c.target}` : '',
        c?.cls ? `${rw.cls}=${bare(c.cls)}` : '', c?.jur ? `${rw.jur}=${bare(c.jur)}` : '', refs.length ? `${rw.links}=${bare(refs.join(','))}` : ''].filter(Boolean).join(' '));
      if (r.detail) out.push(`  ${rw.detail}: ${quote(r.detail)}`);
    });
    // Registro RAID: después de las decisiones (y de los requisitos); una línea por item y, debajo, detalle, mitigación e historial
    const xw = RAID_W[lang] || RAID_W.en;
    (m.raid || []).forEach(it => {
      const l = it.links || {}, same = e => m.edges.filter(x => x.from === e.from && x.to === e.to);
      const refs = [...(l.decisions || []), ...(l.requirements || []), ...(l.nodes || []), ...(l.groups || []),
        ...(l.edges || []).map(id => m.edges.find(e => e.id === id)).filter(Boolean).map(e => `${e.from}->${e.to}${same(e).length > 1 ? `#${same(e).indexOf(e) + 1}` : ''}`)];
      out.push('', [`${xw[it.type]} ${it.id}: ${quote(it.title ?? '')}`, it.probability ? `p=${it.probability}` : '', it.impact ? `i=${it.impact}` : '', it.owner ? `${xw.owner}=${bare(it.owner)}` : '',
        it.status ? `${xw.status}=${(RAID_ST_OUT[lang] || {})[it.status] || it.status}` : '', it.validation ? `${xw.validation}=${(RAID_VAL_OUT[lang] || {})[it.validation] || it.validation}` : '',
        it.due ? `${xw.due}=${it.due}` : '', it.raised ? `${xw.raised}=${it.raised}` : '', refs.length ? `${xw.links}=${bare(refs.join(','))}` : ''].filter(Boolean).join(' '));
      ['detail', 'mitigation'].forEach(k => { if (it[k]) out.push(`  ${xw[k]}: ${quote(it[k])}`); });
      if (it.history?.length) out.push(`  ${xw.history}: ${it.history.map(h => `${(RAID_VAL_OUT[lang] || {})[h.validation] || h.validation} ${h.date}${h.by ? ` ${xw.by}=${hv(h.by)}` : ''}${h.note ? ` ${xw.note}=${hv(h.note)}` : ''}`).join('; ')}`);
    });
    // Interesados: después del registro RAID; una línea por persona
    const sw = SH_W[lang] || SH_W.en;
    (m.stakeholders || []).forEach(s => {
      const raci = Object.entries(s.raci || {}).map(([k, v]) => `${k}:${v}`).join(',');
      out.push('', [`${sw.stakeholder} ${s.id}: ${quote(s.name ?? '')}`, s.role ? `${sw.role}=${quote(s.role)}` : '', `${sw.org}=${(SH_ORG_OUT[lang] || {})[s.org || 'client'] || s.org || 'client'}`, raci ? `${sw.raci}=${bare(raci)}` : '',
        s.versions ? sw.versions : '', s.inactive ? sw.inactive : ''].filter(Boolean).join(' '));
    });
    // Conjuntos de datos: después de los interesados; una línea por conjunto y, debajo, columnas, reglas y contrato
    const dw = DS_W[lang] || DS_W.en;
    (m.datasets || []).forEach(d => {
      const v = d.volume || {};
      out.push('', [`${dw.dataset} ${d.id} ${dsName(d.name)}:`, d.layer ? `${w.layer}=${w.layerOf[d.layer] || d.layer}` : '', d.domain ? `${dw.domain}=${bare(d.domain)}` : '', d.owner ? `${w.owner}=${bare(d.owner)}` : '',
        d.product ? `${dw.product}=${w.yes}` : '', d.classes?.length ? `${dw.classes}=${d.classes.join(',')}` : '', d.format ? `${dw.format}=${d.format}` : '', d.freshness ? `${dw.freshness}=${bare(d.freshness)}` : '',
        v.perDay != null ? `${dw.perDay}=${v.perDay}` : '', v.retentionDays != null ? `${dw.retention}=${v.retentionDays}` : '', d.phase ? `${w.phase}=${bare(d.phase)}` : '', d.steward ? `${w.steward}=${bare(d.steward)}` : '',
        d.description ? `${dw.desc}=${quote(d.description)}` : ''].filter(Boolean).join(' '));
      (d.schema || []).forEach(c => out.push(`  ${[`${dw.column} ${dsName(c.name)}:`, c.type ? (/[\s"]/.test(c.type) ? quote(c.type) : c.type) : '', c.key ? dw.key : '', c.pii ? dw.pii : '', c.nullable === false ? `${dw.nullable}=${w.no}` : '', c.desc ? `${dw.desc}=${quote(c.desc)}` : ''].filter(Boolean).join(' ')}`));
      (d.quality || []).forEach(q => out.push(`  ${[`${dw.rule} ${q.rule}`, q.column ? dsName(q.column) : '', q.param ? `${dw.param}=${quote(q.param)}` : '', q.severity ? `${dw.severity}=${w.sevOf[q.severity] || q.severity}` : ''].filter(Boolean).join(' ')}`));
      if (d.contract) out.push(`  ${[`${dw.contract} ${/[\s"]/.test(d.contract.version || '') ? quote(d.contract.version) : d.contract.version || '1.0.0'}`, `${dw.status}=${(DS_ST_OUT[lang] || {})[d.contract.status] || d.contract.status || 'draft'}`,
        d.contract.consumers?.length ? `${dw.consumers}=${bare(d.contract.consumers.join(','))}` : '', d.contract.terms ? `${dw.terms}=${quote(d.contract.terms)}` : ''].filter(Boolean).join(' ')}`);
    });
    return out.join('\n') + '\n';
  }

  window.DiagramonText = { parse, stringify };
})();
