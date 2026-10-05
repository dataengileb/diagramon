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
      'exp.mermaid': 'Mermaid', 'exp.plantuml': 'PlantUML', 'exp.drawio': 'draw.io',
      'toast.exported': ({ name }) => `${name} exported`, 'toast.exportFail': 'Could not export',
      'exp.share': 'Encrypted HTML', 'exp.share.ext': 'view only',
      'share.title': 'Share encrypted (view only)',
      'share.lead': 'Creates one .html file that opens in any browser, with no app and no download. It asks for the password, decrypts on the device and shows the diagram. The title, names and everything else stay encrypted.',
      'share.pw': 'Password (12 characters or more)', 'share.pw2': 'Repeat the password', 'share.show': 'Show', 'share.hide': 'Hide',
      'share.note1': 'Send the password through a different channel than the file (e.g. the file by email, the password by chat).',
      'share.note2': 'There is no way to recover a lost password. Keep it somewhere safe.',
      'share.lvl0': 'Weak', 'share.lvl1': 'Fair', 'share.lvl2': 'Good', 'share.lvl3': 'Strong',
      'share.min': 'Use at least 12 characters', 'share.weak': 'Too easy to guess: make it longer or mix in other kinds of characters', 'share.mismatch': 'The passwords do not match',
      'share.create': 'Create file', 'share.busy': 'Encrypting…', 'share.fail': 'Could not create the file',
      'share.done': 'Encrypted HTML exported · share the password separately', 'share.unsupported': 'This browser cannot encrypt. Use a recent Chrome, Edge, Firefox or Safari',
      'top.import': 'Import a diagram (JSON) or infrastructure as code: terraform show -json, .tfstate, CloudFormation, Kubernetes, docker-compose', 'top.import.lbl': 'Import',
      'top.new': 'New canvas', 'top.new.lbl': 'New',
      'top.palette': 'Color palette', 'top.font': 'Font', 'top.theme': 'Switch theme (T)', 'top.theme.light': 'Switch to light mode (T)', 'top.theme.dark': 'Switch to dark mode (T)', 'top.theme.black': 'Switch to high-contrast black mode (T)',
      'tab.components': 'Components', 'tab.templates': 'Templates', 'tab.text': 'Text', 'tab.json': 'JSON',
      'side.provider': 'Provider', 'side.provider.aria': 'Component provider',
      'side.search': 'Search: lambda, s3, kafka…', 'side.tip': 'Click to add to the center, or drag onto the canvas.',
      'side.generic': n => `Generic (${n})`, 'side.none': 'No results.', 'side.none.types': 'No results. You can add types in config.js.',
      'side.noTemplates': 'No templates. Add them in examples.js.', 'side.resize': 'Drag to change the panel width',
      'side.wide': 'Expand', 'side.narrow': 'Shrink', 'side.format': 'Format',
      'text.help': 'Text syntax quick guide', 'text.aria': 'Diagram as text', 'json.aria': 'Diagram as JSON',
      'text.guide': `title: Online store
direction: LR            (or TB)
lines: elbow             (or curved)
author: Platform team
version: 1.2

group aws "AWS" color=peach {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 cost=350/month data=pii,pci
}
web: Customers [user] desc="Browser"

web -&gt; api : HTTPS       -&gt; request
api =&gt; db : SQL encrypted=yes   =&gt; data
api ~&gt; queue : events    ~&gt; event
api ..&gt; cache            ..&gt; optional

[ ]   own type (db, user, cache…)
      or official icon (aws/lambda, rds…)
" "   detail under the name
cost=0.1/hour · 120/month · 1400/year · 5000/3years  (USD)
data=pii,pci      public internal confidential pii pci phi
encrypted=yes|no  encryption in transit (connections)
line=elbow        one connection with elbows (or curved)
review db: "DB in a public subnet" by=Ana raised=2026-10-01 due=2026-11-15
                  review finding (status=resolved closed=… when fixed)
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
      'toast.dark': 'Dark mode', 'toast.light': 'Light mode', 'toast.black': 'High-contrast black mode',
      'toast.svg': 'SVG exported', 'toast.png': 'PNG exported', 'toast.pngFail': 'Could not create the PNG', 'toast.json': 'JSON exported',
      'toast.copied': 'JSON copied', 'toast.copyFail': 'Could not copy', 'toast.imported': 'Diagram imported', 'toast.badJson': 'The file is not valid JSON',
      'toast.iac': ({ format, nodes, edges, hidden }) => `${format}: ${plural(nodes, 'component', 'components')}, ${plural(edges, 'connection', 'connections')}${hidden ? ` · ${hidden} supporting resources hidden (IAM, rules…)` : ''}`,
      'toast.iacNone': 'Not recognized. Use a Diagramon JSON, terraform show -json, .tfstate, CloudFormation, Kubernetes or docker-compose file',
      'toast.iacEmpty': ({ format }) => `${format}: no components to draw`,
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
      'insp.parent': 'Inside of', 'insp.deleteGroup': 'Delete group',

      'tab.versions': 'Versions',
      'ver.saveAs': 'Save the canvas as', 'ver.versionN': n => `Version ${n}`,
      'ver.saveEnv': ({ name }) => `Save as ${name}`, 'ver.updateEnv': ({ name }) => `Update ${name} with the canvas`,
      'ver.name': 'Version name', 'ver.name.ph': 'e.g. 1.2 or 2026-Q4',
      'ver.note': 'Note', 'ver.note.ph': 'Note (optional): e.g. before the migration',
      'ver.envs': 'Environments', 'ver.versions': 'Versions',
      'ver.empty': 'Nothing saved yet. Save the canvas as a version (a frozen snapshot) or as an environment, then open or compare it any time.',
      'ver.open': 'Open', 'ver.compare': 'Compare', 'ver.stop': 'Stop', 'ver.saveHere': 'Update', 'ver.delete': 'Delete',
      'ver.openTip': 'Load it on the canvas', 'ver.compareTip': 'Compare it with the canvas', 'ver.saveHereTip': 'Replace it with the canvas',
      'ver.current': 'on canvas', 'ver.dirty': 'unsaved changes',
      'ver.saved': ({ name }) => `Saved as ${name}`, 'ver.updated': ({ name }) => `${name} updated`,
      'ver.opened': ({ name }) => `${name} opened · ⌘Z to go back`, 'ver.deleted': ({ name }) => `${name} deleted · ⌘Z to undo`,
      'insp.path': 'Path', 'path.show': ({ a, b }) => `Show path ${a} → ${b}`, 'path.swap': ({ a, b }) => `Show path ${a} → ${b}`,
      'path.summary': ({ name, hops, count }) => `Path <b>${name}</b> · ${hops} ${hops === 1 ? 'hop' : 'hops'} · ${count} ${count === 1 ? 'route' : 'routes'}`,
      'path.none': ({ name }) => `<b>${name}</b> · no path`, 'path.undirected': 'no directed path; showing undirected', 'path.exit': 'Clear the path (Esc)',
      'ver.comparing': ({ name }) => `Comparing the canvas with <b>${name}</b>`, 'ver.exit': 'Exit the comparison (Esc)',
      'ver.summary': ({ a, r, c }) => `+${a} new · −${r} removed · ~${c} changed`, 'ver.same': 'No differences',
      'ver.updatedReset': ({ name }) => `${name} updated · it changed, so it is back in review`,
      'ver.filter': 'Filter by status', 'ver.f.all': 'All', 'ver.f.none': 'No versions with this status.', 'ver.f.clear': 'Show all',
      'ver.st.draft': 'Draft', 'ver.st.review': 'In review', 'ver.st.approved': 'Approved', 'ver.st.rejected': 'Rejected',
      'ver.status': 'Status', 'ver.author': 'Architecture author', 'ver.author.ph': 'Name or team',
      'ver.created': 'Created', 'ver.updatedOn': 'Updated', 'ver.edit': 'Edit status, author and dates', 'ver.editDone': 'Done',
      'ver.createdOn': ({ date }) => `Created ${date}`, 'ver.dates': ({ a, b }) => `Created ${a} · updated ${b}`,
      'ver.statusSet': ({ name, status }) => `${name}: ${status}`, 'leg.status': 'Status',
      'ver.cf.cancel': 'Cancel', 'ver.openFindings': n => `${n} open ${n === 1 ? 'finding' : 'findings'}`,
      'ver.cf.updTitle': ({ name }) => `Update ${name}?`, 'ver.cf.updText': 'It is approved. Updating it with the canvas changes its content, so it goes back to "In review".',
      'ver.cf.delTitle': ({ name }) => `Delete ${name}?`, 'ver.cf.delText': 'It is approved. You can undo the deletion with ⌘Z.',
      'ver.cf.apprTitle': n => `${n} open review ${n === 1 ? 'finding' : 'findings'} in this version. Approve anyway?`, 'ver.cf.apprText': 'These findings are still open in its snapshot:', 'ver.cf.apprOk': 'Approve anyway',
      'ver.approvedBy': 'Approved by', 'ver.rejectedBy': 'Rejected by', 'ver.decidedOn': 'Date', 'ver.reason': 'Reason', 'ver.reason.ph': 'Why it was rejected',
      'ver.reasonWarn': 'Add the reason for the rejection', 'ver.history': 'Status history',
      'ver.edge': 'connection', 'ver.group': 'group', 'field.title': 'Title', 'field.badge': 'Badge', 'field.position': 'position',

      'data.label': 'Data classification', 'data.edge': 'Data in transit', 'data.none': 'Tag the data it stores or handles.', 'data.noneEdge': 'Tag the data this connection carries.',
      'enc.label': 'Encryption in transit', 'enc.unset': 'Not set', 'enc.yes': 'Encrypted', 'enc.no': 'Not encrypted',
      'enc.warn': 'Sensitive data travels here without encryption.',
      'meta.insecure': n => `⚠ ${n} unencrypted sensitive ${n === 1 ? 'flow' : 'flows'}`,
      'meta.review': ({ n, o }) => `⚑ ${n} in review${o ? ` · ${o} overdue` : ''}`,
      'rev.label': 'Review', 'rev.add': 'Raise a review finding',
      'rev.tag.open': 'IN REVIEW', 'rev.tag.overdue': 'OVERDUE', 'rev.tag.resolved': 'RESOLVED',
      'rev.note': 'Finding', 'rev.note.ph': 'What must be fixed? e.g. database in a public subnet',
      'rev.by': 'Raised by', 'rev.by.ph': 'Reviewer name', 'rev.raised': 'Raised on', 'rev.due': 'Due date',
      'rev.resolve': '✓ Mark resolved', 'rev.reopen': 'Reopen', 'rev.remove': 'Remove',
      'rev.hint.noDue': 'No due date yet', 'rev.hint.dueIn': n => (n === 0 ? 'Due today' : `Due in ${n} ${n === 1 ? 'day' : 'days'}`),
      'rev.hint.overdue': n => `Overdue by ${n} ${n === 1 ? 'day' : 'days'}`, 'rev.hint.resolved': ({ date }) => `Resolved on ${date}`,
      'toast.revAdded': 'Review finding raised', 'toast.revResolved': 'Marked resolved', 'toast.revRemoved': 'Review finding removed',
      'leg.review': 'OPEN REVIEW FINDINGS',
      'icon.ph': 'Search icon: lambda, sql, kafka…', 'icon.none': 'No icon matches. Try another name.',

      'top.route': 'Connector lines: curved or elbow (E)', 'top.route.lbl': 'Elbows',
      'toast.elbow': 'Elbow connectors', 'toast.curved': 'Curved connectors',
      'insp.route': 'Line', 'route.default': ({ name }) => `Diagram default (${name})`, 'route.curved': 'Curved', 'route.elbow': 'Elbow',
      'exp.legend': 'Legend and title block', 'exp.author.ph': 'Your name or team', 'exp.legend.note': 'Added at the bottom of SVG and PNG exports.',
      'leg.connections': 'CONNECTIONS', 'leg.components': 'COMPONENTS', 'leg.data': 'DATA', 'leg.document': 'DOCUMENT',
      'leg.encrypted': 'Encrypted in transit', 'leg.unencrypted': 'Not encrypted',
      'leg.author': 'Author', 'leg.version': 'Version', 'leg.date': 'Date', 'leg.cost': 'Estimated cost', 'leg.made': 'Made with Diagramon'
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
      'exp.mermaid': 'Mermaid', 'exp.plantuml': 'PlantUML', 'exp.drawio': 'draw.io',
      'toast.exported': ({ name }) => `${name} exportado`, 'toast.exportFail': 'No se pudo exportar',
      'exp.share': 'HTML cifrado', 'exp.share.ext': 'solo lectura',
      'share.title': 'Compartir cifrado (solo lectura)',
      'share.lead': 'Crea un único archivo .html que se abre en cualquier navegador, sin la app y sin descargar nada. Pide la contraseña, descifra en el equipo y muestra el diagrama. El título, los nombres y todo lo demás quedan cifrados.',
      'share.pw': 'Contraseña (12 caracteres o más)', 'share.pw2': 'Repite la contraseña', 'share.show': 'Ver', 'share.hide': 'Ocultar',
      'share.note1': 'Envía la contraseña por un canal distinto al del archivo (por ejemplo, el archivo por correo y la contraseña por chat).',
      'share.note2': 'Una contraseña perdida no se puede recuperar. Guárdala en un lugar seguro.',
      'share.lvl0': 'Débil', 'share.lvl1': 'Aceptable', 'share.lvl2': 'Buena', 'share.lvl3': 'Fuerte',
      'share.min': 'Usa al menos 12 caracteres', 'share.weak': 'Demasiado fácil de adivinar: alárgala o mezcla otros tipos de caracteres', 'share.mismatch': 'Las contraseñas no coinciden',
      'share.create': 'Crear archivo', 'share.busy': 'Cifrando…', 'share.fail': 'No se pudo crear el archivo',
      'share.done': 'HTML cifrado exportado · comparte la contraseña por separado', 'share.unsupported': 'Este navegador no puede cifrar. Usa un Chrome, Edge, Firefox o Safari reciente',
      'top.import': 'Importar un diagrama (JSON) o infraestructura como código: terraform show -json, .tfstate, CloudFormation, Kubernetes, docker-compose', 'top.import.lbl': 'Importar',
      'top.new': 'Lienzo nuevo', 'top.new.lbl': 'Nuevo',
      'top.palette': 'Paleta de colores', 'top.font': 'Tipografía', 'top.theme': 'Cambiar tema (T)', 'top.theme.light': 'Cambiar a modo claro (T)', 'top.theme.dark': 'Cambiar a modo oscuro (T)', 'top.theme.black': 'Cambiar a modo negro de alto contraste (T)',
      'tab.components': 'Componentes', 'tab.templates': 'Plantillas', 'tab.text': 'Texto', 'tab.json': 'JSON',
      'side.provider': 'Proveedor', 'side.provider.aria': 'Proveedor de componentes',
      'side.search': 'Buscar: lambda, s3, kafka…', 'side.tip': 'Haz clic para añadir al centro o arrastra al lienzo.',
      'side.generic': n => `Genéricos (${n})`, 'side.none': 'Sin resultados.', 'side.none.types': 'Sin resultados. Puedes añadir tipos en config.js.',
      'side.noTemplates': 'No hay plantillas. Añádelas en examples.js.', 'side.resize': 'Arrastra para cambiar el ancho del panel',
      'side.wide': 'Ampliar', 'side.narrow': 'Reducir', 'side.format': 'Formatear',
      'text.help': 'Guía rápida del lenguaje', 'text.aria': 'Diagrama en texto', 'json.aria': 'Diagrama en JSON',
      'text.guide': `título: Tienda online
dirección: LR            (o TB)
líneas: codos            (o curvas)
autor: Equipo de plataforma
versión: 1.2

grupo aws "AWS" color=melocoton {
  api: API Gateway [aws/apigateway] "REST"
  db: RDS Postgres [rds] "Multi-AZ" badge=x2 costo=350/mes datos=pii,pci
}
web: Clientes [user] desc="Navegador"

web -&gt; api : HTTPS       -&gt; petición
api =&gt; db : SQL cifrado=sí     =&gt; datos
api ~&gt; cola : eventos    ~&gt; evento
api ..&gt; cache            ..&gt; opcional

[ ]   tipo propio (db, user, cache…)
      o icono oficial (aws/lambda, rds…)
" "   detalle debajo del nombre
costo=0.1/hora · 120/mes · 1400/año · 5000/3años  (USD)
datos=pii,pci     public internal confidential pii pci phi
cifrado=sí|no     cifrado en tránsito (conexiones)
línea=codo        una conexión en ángulo recto (o curva)
revisión db: "BD en subred pública" por=Ana levantada=2026-10-01 compromiso=2026-11-15
                  observación (estado=resuelta cerrada=… al corregirla)
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
      'toast.dark': 'Modo oscuro', 'toast.light': 'Modo claro', 'toast.black': 'Modo negro de alto contraste',
      'toast.svg': 'SVG exportado', 'toast.png': 'PNG exportado', 'toast.pngFail': 'No se pudo crear el PNG', 'toast.json': 'JSON exportado',
      'toast.copied': 'JSON copiado', 'toast.copyFail': 'No se pudo copiar', 'toast.imported': 'Diagrama importado', 'toast.badJson': 'El archivo no es un JSON válido',
      'toast.iac': ({ format, nodes, edges, hidden }) => `${format}: ${plural(nodes, 'componente', 'componentes')}, ${plural(edges, 'conexión', 'conexiones')}${hidden ? ` · ${hidden} recursos de apoyo ocultos (IAM, reglas…)` : ''}`,
      'toast.iacNone': 'Formato no reconocido. Usa un JSON de Diagramon, terraform show -json, .tfstate, CloudFormation, Kubernetes o docker-compose',
      'toast.iacEmpty': ({ format }) => `${format}: no hay componentes que dibujar`,
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
      'insp.parent': 'Dentro de', 'insp.deleteGroup': 'Eliminar grupo',

      'tab.versions': 'Versiones',
      'ver.saveAs': 'Guardar el lienzo como', 'ver.versionN': n => `Versión ${n}`,
      'ver.saveEnv': ({ name }) => `Guardar como ${name}`, 'ver.updateEnv': ({ name }) => `Actualizar ${name} con el lienzo`,
      'ver.name': 'Nombre de la versión', 'ver.name.ph': 'p. ej. 1.2 o 2026-T4',
      'ver.note': 'Nota', 'ver.note.ph': 'Nota (opcional): p. ej. antes de la migración',
      'ver.envs': 'Ambientes', 'ver.versions': 'Versiones',
      'ver.empty': 'Aún no hay nada guardado. Guarda el lienzo como versión (una foto fija) o como ambiente, y luego ábrelo o compáralo cuando quieras.',
      'ver.open': 'Abrir', 'ver.compare': 'Comparar', 'ver.stop': 'Parar', 'ver.saveHere': 'Actualizar', 'ver.delete': 'Eliminar',
      'ver.openTip': 'Cargarlo en el lienzo', 'ver.compareTip': 'Compararlo con el lienzo', 'ver.saveHereTip': 'Reemplazarlo por el lienzo',
      'ver.current': 'en el lienzo', 'ver.dirty': 'cambios sin guardar',
      'ver.saved': ({ name }) => `Guardado como ${name}`, 'ver.updated': ({ name }) => `${name} actualizado`,
      'ver.opened': ({ name }) => `${name} abierto · ⌘Z para volver`, 'ver.deleted': ({ name }) => `${name} eliminado · ⌘Z para deshacer`,
      'insp.path': 'Camino', 'path.show': ({ a, b }) => `Ver camino ${a} → ${b}`, 'path.swap': ({ a, b }) => `Ver camino ${a} → ${b}`,
      'path.summary': ({ name, hops, count }) => `Camino <b>${name}</b> · ${hops} ${hops === 1 ? 'salto' : 'saltos'} · ${count} ${count === 1 ? 'ruta' : 'rutas'}`,
      'path.none': ({ name }) => `<b>${name}</b> · sin camino`, 'path.undirected': 'sin camino dirigido; se muestra sin dirección', 'path.exit': 'Quitar el camino (Esc)',
      'ver.comparing': ({ name }) => `Comparando el lienzo con <b>${name}</b>`, 'ver.exit': 'Salir de la comparación (Esc)',
      'ver.summary': ({ a, r, c }) => `+${a} nuevos · −${r} eliminados · ~${c} cambiados`, 'ver.same': 'Sin diferencias',
      'ver.updatedReset': ({ name }) => `${name} actualizado · cambió, así que vuelve a revisión`,
      'ver.filter': 'Filtrar por estado', 'ver.f.all': 'Todos', 'ver.f.none': 'No hay versiones con este estado.', 'ver.f.clear': 'Ver todas',
      'ver.st.draft': 'Borrador', 'ver.st.review': 'En revisión', 'ver.st.approved': 'Aprobado', 'ver.st.rejected': 'Rechazado',
      'ver.status': 'Estado', 'ver.author': 'Autor de la arquitectura', 'ver.author.ph': 'Nombre o equipo',
      'ver.created': 'Creación', 'ver.updatedOn': 'Actualización', 'ver.edit': 'Editar estado, autor y fechas', 'ver.editDone': 'Listo',
      'ver.createdOn': ({ date }) => `Creado ${date}`, 'ver.dates': ({ a, b }) => `Creado ${a} · actualizado ${b}`,
      'ver.statusSet': ({ name, status }) => `${name}: ${status}`, 'leg.status': 'Estado',
      'ver.cf.cancel': 'Cancelar', 'ver.openFindings': n => `${n} ${n === 1 ? 'observación abierta' : 'observaciones abiertas'}`,
      'ver.cf.updTitle': ({ name }) => `¿Actualizar ${name}?`, 'ver.cf.updText': 'Su estado es Aprobado. Al actualizar con el lienzo cambia su contenido, así que vuelve a "En revisión".',
      'ver.cf.delTitle': ({ name }) => `¿Eliminar ${name}?`, 'ver.cf.delText': 'Su estado es Aprobado. Puedes deshacer la eliminación con ⌘Z.',
      'ver.cf.apprTitle': n => `${n} ${n === 1 ? 'observación de revisión abierta' : 'observaciones de revisión abiertas'} en esta versión. ¿Aprobar de todos modos?`, 'ver.cf.apprText': 'Estas observaciones siguen abiertas en su foto:', 'ver.cf.apprOk': 'Aprobar igualmente',
      'ver.approvedBy': 'Aprobado por', 'ver.rejectedBy': 'Rechazado por', 'ver.decidedOn': 'Fecha', 'ver.reason': 'Motivo', 'ver.reason.ph': 'Por qué se rechazó',
      'ver.reasonWarn': 'Añade el motivo del rechazo', 'ver.history': 'Historial de estados',
      'ver.edge': 'conexión', 'ver.group': 'grupo', 'field.title': 'Título', 'field.badge': 'Insignia', 'field.position': 'posición',

      'data.label': 'Clasificación de datos', 'data.edge': 'Datos en tránsito', 'data.none': 'Marca los datos que guarda o maneja.', 'data.noneEdge': 'Marca los datos que viajan por esta conexión.',
      'enc.label': 'Cifrado en tránsito', 'enc.unset': 'Sin indicar', 'enc.yes': 'Cifrado', 'enc.no': 'Sin cifrar',
      'enc.warn': 'Por aquí viajan datos sensibles sin cifrar.',
      'meta.insecure': n => `⚠ ${n} ${n === 1 ? 'flujo sensible' : 'flujos sensibles'} sin cifrar`,
      'meta.review': ({ n, o }) => `⚑ ${n} en revisión${o ? ` · ${o} ${o === 1 ? 'vencida' : 'vencidas'}` : ''}`,
      'rev.label': 'Revisión', 'rev.add': 'Levantar una observación',
      'rev.tag.open': 'EN REVISIÓN', 'rev.tag.overdue': 'VENCIDA', 'rev.tag.resolved': 'RESUELTA',
      'rev.note': 'Observación', 'rev.note.ph': '¿Qué hay que corregir? p. ej. base de datos en una subred pública',
      'rev.by': 'Levantada por', 'rev.by.ph': 'Nombre de quien revisa', 'rev.raised': 'Fecha de levantamiento', 'rev.due': 'Fecha compromiso',
      'rev.resolve': '✓ Marcar resuelta', 'rev.reopen': 'Reabrir', 'rev.remove': 'Quitar',
      'rev.hint.noDue': 'Sin fecha compromiso', 'rev.hint.dueIn': n => (n === 0 ? 'Vence hoy' : `Vence en ${n} ${n === 1 ? 'día' : 'días'}`),
      'rev.hint.overdue': n => `Vencida hace ${n} ${n === 1 ? 'día' : 'días'}`, 'rev.hint.resolved': ({ date }) => `Resuelta el ${date}`,
      'toast.revAdded': 'Observación levantada', 'toast.revResolved': 'Marcada como resuelta', 'toast.revRemoved': 'Observación quitada',
      'leg.review': 'OBSERVACIONES ABIERTAS',
      'icon.ph': 'Buscar icono: lambda, sql, kafka…', 'icon.none': 'Ningún icono coincide. Prueba otro nombre.',

      'top.route': 'Líneas de conexión: curvas o en ángulo recto (E)', 'top.route.lbl': 'Ángulos',
      'toast.elbow': 'Conectores en ángulo recto', 'toast.curved': 'Conectores curvos',
      'insp.route': 'Línea', 'route.default': ({ name }) => `La del diagrama (${name})`, 'route.curved': 'Curva', 'route.elbow': 'En ángulo recto',
      'exp.legend': 'Leyenda y cajetín', 'exp.author.ph': 'Tu nombre o equipo', 'exp.legend.note': 'Se añade abajo en las exportaciones SVG y PNG.',
      'leg.connections': 'CONEXIONES', 'leg.components': 'COMPONENTES', 'leg.data': 'DATOS', 'leg.document': 'DOCUMENTO',
      'leg.encrypted': 'Cifrado en tránsito', 'leg.unencrypted': 'Sin cifrar',
      'leg.author': 'Autor', 'leg.version': 'Versión', 'leg.date': 'Fecha', 'leg.cost': 'Costo estimado', 'leg.made': 'Hecho con Diagramon'
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
