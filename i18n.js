/* ==========================================================================
   Diagramon · idiomas de la interfaz (inglés por defecto, español)
   --------------------------------------------------------------------------
   - Textos fijos de index.html: atributos data-i18n, data-i18n-html,
     data-i18n-title, data-i18n-placeholder y data-i18n-aria.
   - Textos de app.js: T('clave', { variables }).
   - Textos de config.js y examples.js: { en: '…', es: '…' } (ver loc()).
   Para añadir un idioma, copia el bloque `en` con otra clave.
   ========================================================================== */
window.DiagramonI18n = (() => {
  'use strict';

  const C = window.DIAGRAMON_CONFIG || { app: {} };
  const KEY = `${C.app.storageKey || 'diagramon'}.lang`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const DICT = {
    en: {
      'lang.name': 'English', 'lang.switch': 'Cambiar a español (L)', 'lang.toast': 'English',
      'doc.title': 'Diagramon · Cloud diagrams',
      'top.side': 'Show or hide the panel', 'top.title': 'Diagram title', 'top.tools': 'Tools',
      'top.undo': 'Undo (⌘Z)', 'top.redo': 'Redo (⇧⌘Z)',
      'top.layout': 'Auto-arrange', 'top.layout.lbl': 'Arrange',
      'top.fit': 'Fit to view (F)', 'top.fit.lbl': 'Fit',
      'top.anim': 'Animate connections', 'top.anim.lbl': 'Animation',
      'top.play': 'Play the flow step by step (P)', 'top.play.lbl': 'Flow',
      'top.export': 'Export', 'exp.svg': 'Vector image', 'exp.png': 'Image', 'exp.json': 'Diagram', 'exp.copy': 'Copy JSON', 'exp.clip': 'clipboard',
      'top.import': 'Import JSON', 'top.import.lbl': 'Import',
      'top.new': 'New canvas', 'top.new.lbl': 'New',
      'top.palette': 'Color palette', 'top.theme': 'Switch theme (T)',
      'tab.components': 'Components', 'tab.templates': 'Templates', 'tab.text': 'Text', 'tab.json': 'JSON',
      'side.provider': 'Provider', 'side.provider.aria': 'Component provider',
      'side.search': 'Search: lambda, s3, kafka…', 'side.tip': 'Click to add to the center, or drag onto the canvas.',
      'side.generic': n => `Generic (${n})`, 'side.none': 'No results.', 'side.none.types': 'No results. You can add types in config.js.',
      'side.noTemplates': 'No templates. Add them in examples.js.', 'side.resize': 'Drag to change the panel width',
      'side.wide': 'Expand', 'side.narrow': 'Shrink', 'side.format': 'Format',
      'text.help': 'Text syntax quick guide', 'text.aria': 'Diagram as text', 'json.aria': 'Diagram as JSON',
      'text.guide': `title: Online store
direction: LR            (or TB)

group aws "AWS" color=peach {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 cost=350/month
}
web: Customers [user] desc="Browser"

web -&gt; api : HTTPS       -&gt; request
api =&gt; db : SQL          =&gt; data
api ~&gt; queue : events    ~&gt; event
api ..&gt; cache            ..&gt; optional

[ ]   own type (db, user, cache…)
      or official icon (aws/lambda, rds…)
" "   detail under the name
cost=0.1/hour · 120/month · 1400/year · 5000/3years  (USD)
#     comment`,
      'stage.empty': '<b>Empty canvas</b>Drag a component from the left<br>or double-click here.',
      'stage.banner': 'Pick the connection target · <kbd>Esc</kbd> cancels',
      'stage.hint': 'Double-click: add · <kbd>⇧</kbd>+click: connect · <kbd>⌘</kbd>+click or <kbd>⇧</kbd>+drag: select many · <kbd>F</kbd> fit · <kbd>P</kbd> flow',
      'zoom.out': 'Zoom out', 'zoom.in': 'Zoom in', 'zoom.reset': 'Reset zoom',

      'model.untitled': 'Untitled diagram', 'model.new': 'New diagram', 'model.group': 'Group',
      'meta.nodes': n => plural(n, 'component', 'components'), 'meta.edges': n => plural(n, 'connection', 'connections'),
      'meta.groups': n => plural(n, 'group', 'groups'),
      'toast.nothingUndo': 'Nothing to undo', 'toast.undone': 'Undone', 'toast.nothingRedo': 'Nothing to redo', 'toast.redone': 'Redone',
      'toast.added': ({ name }) => `${name} added`, 'toast.edgeExists': 'That connection already exists', 'toast.edgeMade': 'Connection created',
      'toast.deleted': 'Deleted', 'toast.relayout': 'Diagram rearranged', 'toast.distMin': 'Pick 3 or more to distribute',
      'toast.aligned': 'Already aligned', 'toast.template': ({ name }) => `Template: ${name}`, 'toast.formatted': 'JSON formatted',
      'toast.animOn': 'Animation on', 'toast.animOff': 'Animation paused', 'toast.newCanvas': 'New canvas · ⌘Z to undo',
      'toast.dark': 'Dark mode', 'toast.light': 'Light mode',
      'toast.svg': 'SVG exported', 'toast.png': 'PNG exported', 'toast.pngFail': 'Could not create the PNG', 'toast.json': 'JSON exported',
      'toast.copied': 'JSON copied', 'toast.copyFail': 'Could not copy', 'toast.imported': 'Diagram imported', 'toast.badJson': 'The file is not valid JSON',
      'copy.suffix': 'copy',
      'prompt.node': 'Component name', 'prompt.group': 'Group name', 'prompt.edge': 'Connection label (empty to remove it)',
      'prompt.newGroup': 'Name of the new group', 'prompt.newGroup.def': 'New group',
      'ed.json.ok': 'Valid JSON · applies as you type', 'ed.text.ok': 'Valid text · applies as you type',
      'ed.line': ({ line, msg, more }) => `Line ${line}: ${msg}${more ? ` (and ${more} more)` : ''}`,

      'align.left': 'Left', 'align.hcenter': 'Horizontal center', 'align.right': 'Right',
      'align.top': 'Top', 'align.vcenter': 'Vertical center', 'align.bottom': 'Bottom',
      'align.hdist': 'Distribute horizontally', 'align.vdist': 'Distribute vertically',
      'cost.hour': 'Hourly', 'cost.month': 'Monthly', 'cost.year': 'Yearly', 'cost.multi': 'Multi-year',
      'cost.h': '/h', 'cost.mo': '/mo', 'cost.yr': '/yr', 'cost.years': n => (n === 1 ? '1 yr' : `${n} yrs`), 'cost.unit': 'yrs',
      'cost.hint': 'Type the price in dollars and pick the period.', 'cost.label': 'Cost', 'cost.period': 'Period', 'cost.yearsAria': 'Years',

      'insp.close': 'Close', 'insp.auto': 'Automatic', 'insp.ownIcon': 'Own (from the type)',
      'insp.selection': 'Selection', 'insp.count': n => plural(n, 'component', 'components'),
      'insp.align': 'Align', 'insp.distribute': 'Distribute with equal spacing', 'insp.horizontal': 'Horizontal', 'insp.vertical': 'Vertical',
      'insp.group': 'Group', 'insp.mixed': 'Mixed', 'insp.none': 'None', 'insp.newGroup': '+ New group…', 'insp.color': 'Color',
      'insp.selCost': 'Selection cost', 'insp.perMonth': '/mo', 'insp.perYear': '/yr',
      'insp.withCost': ({ a, b }) => `${a} of ${b} with a cost`,
      'insp.multiNote': '<kbd>⌘</kbd>+click adds or removes · <kbd>⇧</kbd>+drag on the background selects an area · arrow keys move everything.',
      'insp.duplicate': 'Duplicate', 'insp.delete': 'Delete', 'insp.deleteN': n => `Delete ${n}`,
      'insp.name': 'Name', 'insp.detail': 'Detail', 'insp.detail.ph': 'e.g. t3.medium · Multi-AZ', 'insp.type': 'Type', 'insp.icon': 'Icon',
      'insp.desc': 'Description', 'insp.desc.ph': 'What does this component do?', 'insp.reach': 'Highlight flow',
      'reach.direct': 'Neighbors', 'reach.down': 'Targets', 'reach.up': 'Sources', 'reach.both': 'All',
      'insp.receives': 'Receives from', 'insp.sends': 'Sends to', 'insp.connect': 'Connect',
      'insp.edge': 'Connection', 'insp.label': 'Label', 'insp.label.ph': 'e.g. HTTPS, SQL, events', 'insp.style': 'Style',
      'insp.ends': 'Endpoints', 'insp.source': 'source', 'insp.target': 'target', 'insp.reverse': 'Reverse',
      'insp.groupNote': n => `${plural(n, 'component', 'components')} inside. Drag the group label to move it all.`,
      'insp.parent': 'Inside of', 'insp.deleteGroup': 'Delete group'
    },

    es: {
      'lang.name': 'Español', 'lang.switch': 'Switch to English (L)', 'lang.toast': 'Español',
      'doc.title': 'Diagramon · Diagramas cloud',
      'top.side': 'Mostrar u ocultar panel', 'top.title': 'Título del diagrama', 'top.tools': 'Herramientas',
      'top.undo': 'Deshacer (⌘Z)', 'top.redo': 'Rehacer (⇧⌘Z)',
      'top.layout': 'Ordenar automáticamente', 'top.layout.lbl': 'Ordenar',
      'top.fit': 'Ajustar a la vista (F)', 'top.fit.lbl': 'Ajustar',
      'top.anim': 'Animar conexiones', 'top.anim.lbl': 'Animación',
      'top.play': 'Reproducir el flujo paso a paso (P)', 'top.play.lbl': 'Flujo',
      'top.export': 'Exportar', 'exp.svg': 'Imagen vectorial', 'exp.png': 'Imagen', 'exp.json': 'Diagrama', 'exp.copy': 'Copiar JSON', 'exp.clip': 'portapapeles',
      'top.import': 'Importar JSON', 'top.import.lbl': 'Importar',
      'top.new': 'Lienzo nuevo', 'top.new.lbl': 'Nuevo',
      'top.palette': 'Paleta de colores', 'top.theme': 'Cambiar tema (T)',
      'tab.components': 'Componentes', 'tab.templates': 'Plantillas', 'tab.text': 'Texto', 'tab.json': 'JSON',
      'side.provider': 'Proveedor', 'side.provider.aria': 'Proveedor de componentes',
      'side.search': 'Buscar: lambda, s3, kafka…', 'side.tip': 'Haz clic para añadir al centro o arrastra al lienzo.',
      'side.generic': n => `Genéricos (${n})`, 'side.none': 'Sin resultados.', 'side.none.types': 'Sin resultados. Puedes añadir tipos en config.js.',
      'side.noTemplates': 'No hay plantillas. Añádelas en examples.js.', 'side.resize': 'Arrastra para cambiar el ancho del panel',
      'side.wide': 'Ampliar', 'side.narrow': 'Reducir', 'side.format': 'Formatear',
      'text.help': 'Guía rápida del lenguaje', 'text.aria': 'Diagrama en texto', 'json.aria': 'Diagrama en JSON',
      'text.guide': `título: Tienda online
dirección: LR            (o TB)

grupo aws "AWS" color=melocoton {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 costo=350/mes
}
web: Clientes [user] desc="Navegador"

web -&gt; api : HTTPS       -&gt; petición
api =&gt; db : SQL          =&gt; datos
api ~&gt; cola : eventos    ~&gt; evento
api ..&gt; cache            ..&gt; opcional

[ ]   tipo propio (db, user, cache…)
      o icono oficial (aws/lambda, rds…)
" "   detalle debajo del nombre
costo=0.1/hora · 120/mes · 1400/año · 5000/3años  (USD)
#     comentario`,
      'stage.empty': '<b>Lienzo vacío</b>Arrastra un componente desde la izquierda<br>o haz doble clic aquí.',
      'stage.banner': 'Elige el destino de la conexión · <kbd>Esc</kbd> cancela',
      'stage.hint': 'Doble clic: añadir · <kbd>⇧</kbd>+clic: conectar · <kbd>⌘</kbd>+clic o <kbd>⇧</kbd>+arrastrar: varios · <kbd>F</kbd> ajustar · <kbd>P</kbd> flujo',
      'zoom.out': 'Alejar', 'zoom.in': 'Acercar', 'zoom.reset': 'Restablecer zoom',

      'model.untitled': 'Diagrama sin título', 'model.new': 'Nuevo diagrama', 'model.group': 'Grupo',
      'meta.nodes': n => plural(n, 'componente', 'componentes'), 'meta.edges': n => plural(n, 'conexión', 'conexiones'),
      'meta.groups': n => plural(n, 'grupo', 'grupos'),
      'toast.nothingUndo': 'Nada que deshacer', 'toast.undone': 'Deshecho', 'toast.nothingRedo': 'Nada que rehacer', 'toast.redone': 'Rehecho',
      'toast.added': ({ name }) => `${name} añadido`, 'toast.edgeExists': 'Esa conexión ya existe', 'toast.edgeMade': 'Conexión creada',
      'toast.deleted': 'Eliminado', 'toast.relayout': 'Diagrama reordenado', 'toast.distMin': 'Elige 3 o más para repartir',
      'toast.aligned': 'Ya están alineados', 'toast.template': ({ name }) => `Plantilla: ${name}`, 'toast.formatted': 'JSON formateado',
      'toast.animOn': 'Animación activada', 'toast.animOff': 'Animación en pausa', 'toast.newCanvas': 'Lienzo nuevo · ⌘Z para deshacer',
      'toast.dark': 'Modo oscuro', 'toast.light': 'Modo claro',
      'toast.svg': 'SVG exportado', 'toast.png': 'PNG exportado', 'toast.pngFail': 'No se pudo crear el PNG', 'toast.json': 'JSON exportado',
      'toast.copied': 'JSON copiado', 'toast.copyFail': 'No se pudo copiar', 'toast.imported': 'Diagrama importado', 'toast.badJson': 'El archivo no es un JSON válido',
      'copy.suffix': 'copia',
      'prompt.node': 'Nombre del componente', 'prompt.group': 'Nombre del grupo', 'prompt.edge': 'Etiqueta de la conexión (vacío para quitarla)',
      'prompt.newGroup': 'Nombre del nuevo grupo', 'prompt.newGroup.def': 'Nuevo grupo',
      'ed.json.ok': 'JSON válido · se aplica al escribir', 'ed.text.ok': 'Texto válido · se aplica al escribir',
      'ed.line': ({ line, msg, more }) => `Línea ${line}: ${msg}${more ? ` (y ${more} más)` : ''}`,

      'align.left': 'Izquierda', 'align.hcenter': 'Centro horizontal', 'align.right': 'Derecha',
      'align.top': 'Arriba', 'align.vcenter': 'Centro vertical', 'align.bottom': 'Abajo',
      'align.hdist': 'Repartir en horizontal', 'align.vdist': 'Repartir en vertical',
      'cost.hour': 'Por hora', 'cost.month': 'Mensual', 'cost.year': 'Anual', 'cost.multi': 'Multianual',
      'cost.h': '/h', 'cost.mo': '/mes', 'cost.yr': '/año', 'cost.years': n => (n === 1 ? '1 año' : `${n} años`), 'cost.unit': 'años',
      'cost.hint': 'Escribe el precio en dólares y elige el periodo.', 'cost.label': 'Costo', 'cost.period': 'Periodo', 'cost.yearsAria': 'Años',

      'insp.close': 'Cerrar', 'insp.auto': 'Automático', 'insp.ownIcon': 'Propio (según el tipo)',
      'insp.selection': 'Selección', 'insp.count': n => plural(n, 'componente', 'componentes'),
      'insp.align': 'Alinear', 'insp.distribute': 'Repartir con el mismo espacio', 'insp.horizontal': 'Horizontal', 'insp.vertical': 'Vertical',
      'insp.group': 'Grupo', 'insp.mixed': 'Varios', 'insp.none': 'Ninguno', 'insp.newGroup': '+ Nuevo grupo…', 'insp.color': 'Color',
      'insp.selCost': 'Costo de la selección', 'insp.perMonth': '/mes', 'insp.perYear': '/año',
      'insp.withCost': ({ a, b }) => `${a} de ${b} con costo`,
      'insp.multiNote': '<kbd>⌘</kbd>+clic añade o quita · <kbd>⇧</kbd>+arrastrar en el fondo selecciona un área · las flechas mueven todo.',
      'insp.duplicate': 'Duplicar', 'insp.delete': 'Eliminar', 'insp.deleteN': n => `Eliminar ${n}`,
      'insp.name': 'Nombre', 'insp.detail': 'Detalle', 'insp.detail.ph': 'p. ej. t3.medium · Multi-AZ', 'insp.type': 'Tipo', 'insp.icon': 'Icono',
      'insp.desc': 'Descripción', 'insp.desc.ph': '¿Qué hace este componente?', 'insp.reach': 'Resaltar flujo',
      'reach.direct': 'Vecinos', 'reach.down': 'Destinos', 'reach.up': 'Orígenes', 'reach.both': 'Todo',
      'insp.receives': 'Recibe de', 'insp.sends': 'Envía a', 'insp.connect': 'Conectar',
      'insp.edge': 'Conexión', 'insp.label': 'Etiqueta', 'insp.label.ph': 'p. ej. HTTPS, SQL, eventos', 'insp.style': 'Estilo',
      'insp.ends': 'Extremos', 'insp.source': 'origen', 'insp.target': 'destino', 'insp.reverse': 'Invertir',
      'insp.groupNote': n => `${plural(n, 'componente', 'componentes')} dentro. Arrastra la etiqueta del grupo para moverlo entero.`,
      'insp.parent': 'Dentro de', 'insp.deleteGroup': 'Eliminar grupo'
    }
  };

  // Categorías del panel (config.js y icons/*.js las nombran en español)
  const CATEGORY_EN = {
    'Clientes': 'Clients', 'Red': 'Networking', 'Cómputo': 'Compute', 'Datos': 'Data', 'Integración': 'Integration',
    'Seguridad': 'Security', 'Operaciones': 'Operations', 'IA': 'AI', 'Empresa': 'Enterprise', 'Otros': 'Other',
    'Almacenamiento': 'Storage', 'Analítica': 'Analytics', 'Bases de datos': 'Databases', 'Híbrido': 'Hybrid',
    'Desarrollo': 'Development', 'Cargas de trabajo': 'Workloads', 'Ingeniería de datos': 'Data engineering',
    'Plataforma': 'Platform', 'Tiempo real': 'Real-time', 'Power BI': 'Power BI', 'Servicio SAP BTP': 'SAP BTP service'
  };
  // Nombres de los colores de la paleta (las claves no cambian: se guardan en el JSON)
  const COLOR_NAMES = {
    en: { rosa: 'pink', coral: 'coral', melocoton: 'peach', limon: 'lemon', menta: 'mint', cielo: 'sky', lavanda: 'lavender', lila: 'lilac' },
    es: { rosa: 'rosa', coral: 'coral', melocoton: 'melocotón', limon: 'limón', menta: 'menta', cielo: 'cielo', lavanda: 'lavanda', lila: 'lila' }
  };

  const langs = Object.keys(DICT);
  let lang;
  try { lang = JSON.parse(localStorage.getItem(KEY)); } catch { /* sin almacenamiento disponible */ }
  if (!DICT[lang]) lang = DICT[C.app.defaultLang] ? C.app.defaultLang : 'en';

  function T(key, vars) {
    const v = DICT[lang][key] ?? DICT.en[key] ?? key;
    return typeof v === 'function' ? v(vars) : v;
  }
  // { en: '…', es: '…' } → texto del idioma activo; cualquier otro valor se devuelve igual
  const isLoc = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every(k => langs.includes(k));
  const loc = v => (isLoc(v) ? v[lang] ?? v.en ?? Object.values(v)[0] : v);
  // Recorre un objeto y traduce cada { en, es } que encuentre (plantillas de examples.js)
  const deep = v => (isLoc(v) ? loc(v) : Array.isArray(v) ? v.map(deep) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) : v);
  const category = c => (lang === 'es' ? c : CATEGORY_EN[c] || c);
  const colorName = k => COLOR_NAMES[lang]?.[k] || k;

  // Traduce los textos fijos de la página
  function apply(root = document) {
    document.documentElement.lang = lang;
    for (const [attr, set] of [['i18n', (e, s) => { e.textContent = s; }], ['i18nHtml', (e, s) => { e.innerHTML = s; }],
      ['i18nTitle', (e, s) => { e.title = s; }], ['i18nPlaceholder', (e, s) => { e.placeholder = s; }],
      ['i18nAria', (e, s) => { e.setAttribute('aria-label', s); }]]) {
      const sel = `[data-${attr.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}]`;
      root.querySelectorAll(sel).forEach(e => set(e, T(e.dataset[attr])));
    }
  }

  function set(l) {
    if (!DICT[l]) return;
    lang = l;
    try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* sin almacenamiento disponible */ }
    apply();
  }

  return { get lang() { return lang; }, langs, set, T, loc, deep, category, colorName, apply, COLOR_NAMES };
})();
