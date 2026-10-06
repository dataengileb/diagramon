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
   Linaje:   conexión a -> b : SQL datasets=orders,customers   (es: tablas= o conjuntos=; con espacios: datasets="sales orders,crm.customers")
   Residencia: nodo o grupo … region=eu-west-1 (también región=, country=/país= como alias; hereda del grupo) ·
             conexión a -> b : SQL data=pii transfer=ok (transferencia=ok: transferencia entre jurisdicciones autorizada)
   Amenazas: conexión a -> b : SQL threats="T=mitigated,I=accepted" (es: amenazas=): letras S T R I D E (STRIDE) con estado
             mitigated|mitigada, accepted|aceptada o na|no aplica; solo las decididas (las abiertas no se escriben)
   Capas:    nodo o grupo … layer=gold (capa=oro): bronze|silver|gold · bronce|plata|oro · raw|curated|serving · crudo|curado|consumo
             (los nodos heredan la capa de su grupo) · línea `layers: zones` / `capas: zonas` muestra Raw/Curated/Serving en vez de Bronze/Silver/Gold
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
   El texto es la fuente de verdad de notas, zonas, fronteras, notas STRIDE y descartados: borrarlos del texto los borra del diagrama.
   Comentario: líneas que empiezan por # o //

   Acepta las palabras clave en inglés y en español (title/título, group/grupo,
   cost/costo, /month/mes…). stringify(m, 'en') escribe en inglés y
   stringify(m, 'es') en español. Los errores salen en el idioma de ctx.lang.
   ========================================================================== */
(() => {
  'use strict';

  const ARROWS = { '->': 'sync', '~>': 'async', '=>': 'data', '..>': 'optional' };
  const ARROW_OF = { sync: '->', async: '~>', data: '=>', optional: '..>' };
  const ARROW_SPLIT = /\s*(\.\.>|~>|=>|->)\s*/;
  const HAS_ARROW = /\.\.>|~>|=>|->/;
  const ID = /^[^\s:[\]"{}]+$/;
  const NODE_KEYS = ['color', 'badge', 'desc', 'sub', 'x', 'y', 'costo', 'cost', 'data', 'datos', 'region', 'región', 'country', 'pais', 'país', 'layer', 'capa', 'exposure', 'exposición', 'exposicion', 'backup', 'respaldo', 'controls', 'controles', 'in', 'dentro', 'c4', 'sla', 'rpo', 'rto', 'replicas', 'réplicas'];
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
  const EDGE_OPT = /(?:^|\s)(color|data|datos|encrypted|cifrado|both|ambos|line|linea|línea|datasets|tablas|conjuntos|transfer|transferencia|threats|amenazas)=("(?:[^"\\]|\\.)*"|\S+)\s*$/i;
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
      in: 'in', layerOf: { bronze: 'bronze', silver: 'silver', gold: 'gold' }, exposure: 'exposure', backup: 'backup', expoOf: { public: 'public', internal: 'internal' },
      note: 'note', zone: 'zone', trust: 'trust', threat: 'threat', dismiss: 'dismiss', at: 'at', size: 'size', severity: 'severity', date: 'date', inside: 'inside', sevOf: { low: 'low', medium: 'medium', high: 'high', critical: 'critical' } },
    es: { title: 'título', direction: 'dirección', group: 'grupo', cost: 'costo', hour: 'hora', month: 'mes', year: 'año', years: 'años', data: 'datos', encrypted: 'cifrado', both: 'ambos', yes: 'sí', no: 'no', lines: 'líneas', line: 'línea', region: 'región', transfer: 'transferencia', ok: 'ok', elbow: 'codos', curved: 'curvas', elbowOne: 'codo', curvedOne: 'curva', author: 'autor', version: 'versión', view: 'vista', kind: 'tipo', physical: 'físico', logical: 'lógico',
      review: 'revisión', by: 'por', raised: 'levantada', due: 'compromiso', status: 'estado', closed: 'cerrada', resolved: 'resuelta', layer: 'capa', layers: 'capas', zones: 'zonas',
      owner: 'dueño', steward: 'responsable', team: 'equipo', costCenter: 'centro',
      in: 'dentro', layerOf: { bronze: 'bronce', silver: 'plata', gold: 'oro' }, exposure: 'exposición', backup: 'respaldo', expoOf: { public: 'pública', internal: 'interna' },
      note: 'nota', zone: 'zona', trust: 'confianza', threat: 'amenaza', dismiss: 'descartar', at: 'en', size: 'tamaño', severity: 'severidad', date: 'fecha', inside: 'dentro', sevOf: { low: 'baja', medium: 'media', high: 'alta', critical: 'crítica' } }
  };
  const MSG = {
    en: {
      icon: r => `unknown icon “${r}”`, kind: r => `unknown type or icon “${r}”`, dir: 'direction must be LR or TB',
      brace: 'extra closing brace }', groupId: id => `invalid group id “${id}”`, groupDup: id => `group “${id}” already exists`,
      edge: 'incomplete connection', id: id => `invalid id “${id || '(empty)'}”`,
      cost: v => `invalid cost “${v}” (e.g. 120/month, 0.1/hour, 1400/year, 5000/3years)`,
      data: v => `unknown data class “${v}” (e.g. pii, pci, confidential)`, enc: v => `invalid encrypted value “${v}” (use yes or no)`,
      route: v => `invalid line style “${v}” (use curved or elbow)`, transfer: v => `invalid transfer value “${v}” (use ok)`, threats: v => `invalid threat “${v}” (use e.g. T=mitigated; letters S T R I D E; mitigated, accepted or na)`,
      day: v => `invalid date “${v}” (use YYYY-MM-DD)`, status: v => `invalid status “${v}” (use open or resolved)`,
      ctl: v => `invalid control “${v}” (use framework:id=met|partial|gap|na, e.g. iso27001:A.8.24=met)`,
      layer: v => `unknown layer “${v}” (use bronze, silver or gold; also raw, curated or serving)`, lnames: v => `invalid layer naming “${v}” (use medallion or zones)`,
      expo: v => `invalid exposure “${v}” (use public or internal)`, backup: v => `invalid backup value “${v}” (use yes or no)`,
      view: v => `unknown view “${v}”`, gkind: v => `invalid group type “${v}” (use logical or physical)`,
      c4: v => `unknown C4 type “${v}” (use person, system, container, component or external)`, inRef: id => `“in” points to “${id}”, which is not a component`,
      line: 'cannot understand this line', open: (n, lv) => `missing } to close ${lv ? (n === 1 ? 'a block' : `${n} blocks`) : n === 1 ? 'a group' : `${n} groups`}`,
      at: v => `invalid position “${v}” (use at=120,40)`, size: v => `invalid size “${v}” (use size=180,110)`, sev: v => `unknown severity “${v}” (use low, medium, high or critical)`,
      lvInGroup: id => `“inside ${id}” cannot be opened inside a group`, lvConflict: (a, b) => `in=${a} conflicts with the enclosing “inside ${b}” block`,
      lvNest: (id, o) => `“${id}” is not a component of “${o}”, so “inside ${id}” cannot be nested there`,
      thEdge: (a, b) => `no connection ${a} -> ${b} for this threat note`, thNone: (a, b, k) => `${a} -> ${b} has no decided ${k} threat (add it with threats="${k}=mitigated")`
    },
    es: {
      icon: r => `icono desconocido «${r}»`, kind: r => `tipo o icono desconocido «${r}»`, dir: 'la dirección debe ser LR o TB',
      brace: 'sobra una llave }', groupId: id => `id de grupo no válido «${id}»`, groupDup: id => `el grupo «${id}» ya existe`,
      edge: 'conexión incompleta', id: id => `id no válido «${id || '(vacío)'}»`,
      cost: v => `costo no válido «${v}» (ej.: 120/mes, 0.1/hora, 1400/año, 5000/3años)`,
      data: v => `clasificación de datos desconocida «${v}» (ej.: pii, pci, confidential)`, enc: v => `valor de cifrado no válido «${v}» (usa sí o no)`,
      route: v => `estilo de línea no válido «${v}» (usa curvas o codos)`, transfer: v => `valor de transferencia no válido «${v}» (usa ok)`, threats: v => `amenaza no válida «${v}» (usa p. ej. T=mitigada; letras S T R I D E; mitigada, aceptada o na)`,
      day: v => `fecha no válida «${v}» (usa AAAA-MM-DD)`, status: v => `estado no válido «${v}» (usa abierta o resuelta)`,
      ctl: v => `control no válido «${v}» (usa marco:id=cumple|parcial|brecha|na, ej.: iso27001:A.8.24=cumple)`,
      layer: v => `capa desconocida «${v}» (usa bronce, plata u oro; también crudo, curado o consumo)`, lnames: v => `nombres de capa no válidos «${v}» (usa medallón o zonas)`,
      expo: v => `exposición no válida «${v}» (usa pública o interna)`, backup: v => `valor de respaldo no válido «${v}» (usa sí o no)`,
      view: v => `vista desconocida «${v}»`, gkind: v => `tipo de grupo no válido «${v}» (usa lógico o físico)`,
      c4: v => `tipo C4 desconocido «${v}» (usa persona, sistema, contenedor, componente o externo)`, inRef: id => `«dentro» apunta a «${id}», que no es un componente`,
      line: 'no se entiende esta línea', open: (n, lv) => `falta cerrar ${lv ? (n === 1 ? 'un bloque' : `${n} bloques`) : n === 1 ? 'un grupo' : `${n} grupos`} con }`,
      at: v => `posición no válida «${v}» (usa en=120,40)`, size: v => `tamaño no válido «${v}» (usa tamaño=180,110)`, sev: v => `severidad desconocida «${v}» (usa baja, media, alta o crítica)`,
      lvInGroup: id => `«dentro ${id}» no se puede abrir dentro de un grupo`, lvConflict: (a, b) => `dentro=${a} choca con el bloque «dentro ${b}» que lo contiene`,
      lvNest: (id, o) => `«${id}» no es un componente de «${o}», así que «dentro ${id}» no puede anidarse ahí`,
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

  const quote = s => JSON.stringify(String(s));
  const bare = v => (/[\s"[\]{}]/.test(String(v)) || String(v) === '' ? quote(v) : String(v));
  const unquote = s => { try { return JSON.parse(s); } catch { return s.slice(1, -1); } };

  // Divide el resto de una línea en etiqueta, [tipo], "detalle" y clave=valor
  function tokens(rest, keys) {
    const out = { words: [], brackets: [], quotes: [], kv: {} };
    const re = /\[([^\]]*)\]|("(?:[^"\\]|\\.)*")|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)=("(?:[^"\\]|\\.)*"|\S+)|(\S+)/g;
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
    model.notes = []; model.zones = []; model.dismissed = {};
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

      let m;
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
        const tk = tokens(m[3], ['color', 'icon', 'icono', 'kind', 'tipo', ...Object.keys(GOV_KEYS), ...REGION_KEYS, 'layer', 'capa', 'controls', 'controles', 'in', 'dentro']);
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
        const trV = kv.transfer ?? kv.transferencia, tr = trV == null ? null : /^(ok|yes|y|true|si|sí|1|on)$/i.test(trV);
        if (trV != null && !tr) err(ln, msg.transfer(trV));
        const thV = kv.threats ?? kv.amenazas, th = thV == null ? null : parseThreats(thV);
        if (th) th.bad.forEach(b => err(ln, msg.threats(b)));
        // Etiqueta entre comillas (JSON) o con \n escapado = varias líneas
        if (/^".*"$/.test(label)) label = unquote(label); else label = label.replace(/\\n/g, '\n');
        for (let k = 0; k + 2 < parts.length; k += 2) {
          nodeFor(parts[k]); nodeFor(parts[k + 2]);
          const e = { from: parts[k], to: parts[k + 2] };
          const style = ARROWS[parts[k + 1]];
          if (style !== 'sync') e.style = style;
          if (k + 3 === parts.length && label) e.label = label;
          if (color) e.color = color;
          if (data?.length) e.data = data;
          if (dsets.length) e.datasets = [...dsets];
          if (enc != null) e.encrypted = enc;
          if (route) e.route = route;
          if (both) e.both = true;
          if (tr) e.transferOk = true;
          if (th && Object.keys(th.threats).length) e.threats = JSON.parse(JSON.stringify(th.threats));
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
        const ev = tk.kv.exposure ?? tk.kv.exposición ?? tk.kv.exposicion;
        if (ev != null) { if (/^(public|publico|público|pública|publica|external|externa?)$/i.test(ev.trim())) n.exposure = 'public'; else if (/^(internal|interno|interna|private|privado|privada)$/i.test(ev.trim())) n.exposure = 'internal'; else err(ln, msg.expo(ev)); }
        const bv = tk.kv.backup ?? tk.kv.respaldo;
        if (bv != null) { const b = parseBool(bv.trim()); if (b == null) err(ln, msg.backup(bv)); else n.backup = b; }
        applyCtl(n, tk.kv, ln);
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
    // Notas de decisiones STRIDE: la conexión se busca por origen -> destino (la n-ésima si hay varias); la amenaza ya debe tener estado
    thLines.forEach(t => {
      const es = model.edges.filter(e => e.from === t.from && e.to === t.to), e = es[t.nth - 1];
      if (!e) return err(t.ln, msg.thEdge(t.from, t.to));
      if (!e.threats?.[t.k]) return err(t.ln, msg.thNone(t.from, t.to, t.k));
      const tk = tokens(t.rest, []), note = tk.quotes[0] ?? tk.words.join(' ').replace(/\\n/g, '\n');
      if (note) e.threats[t.k].note = note;
    });
    return { model, errors };
  }

  function stringify(m, lang = 'en') {
    const w = WORDS[lang] || WORDS.en;
    const out = [`${w.title}: ${m.title}`];
    if (m.direction) out.push(`${w.direction}: ${m.direction}`);
    if (m.routing === 'elbow') out.push(`${w.lines}: ${w.elbow}`);
    if (m.layerNames === 'zones') out.push(`${w.layers}: ${w.zones}`);
    if (m.meta?.author) out.push(`${w.author}: ${m.meta.author}`);
    if (m.meta?.version) out.push(`${w.version}: ${m.meta.version}`);
    if (m.meta?.view) out.push(`${w.view}: ${m.meta.view}`);
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
      if (n.exposure) p.push(`${w.exposure}=${w.expoOf[n.exposure] || n.exposure}`);
      if (typeof n.backup === 'boolean') p.push(`${w.backup}=${n.backup ? w.yes : w.no}`);
      if (n.sla != null) p.push(`sla=${n.sla}`);
      if (n.rpo != null) p.push(`rpo=${n.rpo}`);
      if (n.rto != null) p.push(`rto=${n.rto}`);
      if (n.replicas != null) p.push(`${lang === 'es' ? 'réplicas' : 'replicas'}=${n.replicas}`);
      if (n.controls) p.push(ctlText(n));
      if (n.c4) p.push(`c4=${(C4_OUT[lang] || C4_OUT.en)[n.c4] || n.c4}`);
      if (n.in && !inBlock) p.push(`${w.in}=${bare(n.in)}`);
      if (n.desc) p.push(`desc=${quote(n.desc)}`);
      return p.join(' ');
    };
    const groupIds = new Set(m.groups.map(g => g.id));
    const nodeIds = new Set(m.nodes.map(n => n.id)), notes = m.notes || [], zones = m.zones || [];
    const scopeOf = x => (x.in && nodeIds.has(x.in) ? x.in : null); // nivel C4 donde vive (null = superior)
    const writeGroup = (g, ind) => {
      out.push(`${ind}${w.group} ${g.id} ${quote(g.label)}${g.icon ? ` icon=${bare(g.icon)}` : ''}${g.color ? ` color=${bare(g.color)}` : ''}${g.kind ? ` ${w.kind}=${w[g.kind]}` : ''}${GOV_WORDS.filter(k => g[k]).map(k => ` ${w[k]}=${bare(g[k])}`).join('')}${g.region ? ` ${w.region}=${bare(g.region)}` : ''}${g.layer ? ` ${w.layer}=${w.layerOf[g.layer] || g.layer}` : ''}${g.controls ? ` ${ctlText(g)}` : ''}${g.in && !inBlock ? ` ${w.in}=${bare(g.in)}` : ''} {`);
      m.nodes.filter(n => n.group === g.id).forEach(n => out.push(`${ind}  ${nodeLine(n)}`));
      m.groups.filter(c => c.parent === g.id).forEach(c => writeGroup(c, ind + '  '));
      out.push(`${ind}}`);
    };
    const boxText = o => `at=${rnd(o.x)},${rnd(o.y)} size=${rnd(o.w)},${rnd(o.h)}`;
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
        e.data?.length ? `${w.data}=${e.data.join(',')}` : '', e.datasets?.length ? `${DS_KEY[lang] || DS_KEY.en}=${bare(e.datasets.join(','))}` : '', e.encrypted != null ? `${w.encrypted}=${e.encrypted ? w.yes : w.no}` : '',
        e.both ? `${w.both}=${w.yes}` : '', e.transferOk ? `${w.transfer}=${w.ok}` : '', e.threats && Object.keys(e.threats).length ? `${TH_KEY[lang] || TH_KEY.en}=${Object.entries(e.threats).map(([k, d]) => `${k}=${(TH_ST[lang] || TH_ST.en)[d.status] || d.status}`).join(',')}` : '', e.route ? `${w.line}=${e.route === 'elbow' ? w.elbowOne : w.curvedOne}` : ''].filter(Boolean).join(' ');
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
    return out.join('\n') + '\n';
  }

  window.DiagramonText = { parse, stringify };
})();
