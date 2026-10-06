/* ==========================================================================
   Diagramon · configuración
   --------------------------------------------------------------------------
   Este es el único archivo que necesitas tocar para personalizar Diagramon:
   temas, paletas, tipos de componente, estilos de conexión y animación.
   Guarda y recarga index.html para ver los cambios.
   ========================================================================== */
window.DIAGRAMON_CONFIG = {

  app: {
    name: 'Diagramon',
    defaultTheme: 'dark',        // 'dark' | 'light' | 'black'
    defaultLang: 'en',           // 'en' | 'es' (botón de idioma en la barra superior)
    defaultPalette: 'pastel',    // clave de `palettes`
    storageKey: 'diagramon'          // prefijo para guardar en el navegador
  },

  /* Tipografías. Las incluidas viven en fonts/ (fonts/fonts.js, ver tools/build-fonts.py);
     aquí solo las alternativas. `system` funciona aunque falte fonts.js. */
  fonts: {
    default: 'inter',            // clave de `families`
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    families: {
      system: { label: { en: 'System', es: 'Sistema' }, css: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
      inter: { label: 'Inter', css: '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
      plex: { label: 'IBM Plex Sans', css: '"IBM Plex Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
      fira: { label: 'Fira Code', css: '"Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, monospace' }
    }
  },

  /* Colores de interfaz. Cada clave se convierte en la variable CSS --clave. */
  themes: {
    dark: {
      bg: '#111219', panel: '#171822', surface: '#1c1e2a', surface2: '#262838',
      border: '#2e3144', text: '#ecebf5', muted: '#9b9db4', grid: '#2b2d3e',
      shadow: 'rgba(0, 0, 0, 0.45)',
      iconTile: '#F3F1F8'          // fondo claro de los iconos oficiales
    },
    light: {
      bg: '#f6f4f1', panel: '#fdfcfa', surface: '#ffffff', surface2: '#f1edf1',
      border: '#e5e0e8', text: '#28242f', muted: '#776f84', grid: '#dcd5e0',
      shadow: 'rgba(70, 50, 90, 0.12)',
      iconTile: '#FFFFFF'
    },
    black: {                       // alto contraste sobre negro puro
      bg: '#000000', panel: '#0a0a0a', surface: '#111111', surface2: '#1c1c1c',
      border: '#5c5c5c', text: '#ffffff', muted: '#a8a8a8', grid: '#383838',
      shadow: 'rgba(0, 0, 0, 0.8)',
      iconTile: '#F3F1F8'
    }
  },

  /* Paletas. Todas deben tener las mismas claves de color.
     `dark` se usa en modo oscuro, `light` (tonos algo más intensos) en modo claro y `black` en alto contraste.
     Cada color se expone como variable CSS --p-<clave>. */
  palettes: {
    pastel: {
      label: 'Pastel', accent: 'lavanda',
      dark:  { rosa: '#F5A9C6', coral: '#F6B0A4', melocoton: '#F8C99E', limon: '#EFE0A0', menta: '#A6E3C8', cielo: '#A9D2F3', lavanda: '#C2B6F6', lila: '#E0B5EE' },
      light: { rosa: '#E27AA3', coral: '#E2806F', melocoton: '#E0965A', limon: '#C4A63A', menta: '#3FAE85', cielo: '#4E9AD8', lavanda: '#8573DB', lila: '#B472CF' },
      black: { rosa: '#FAB4CE', coral: '#FBBAB0', melocoton: '#FCD3AC', limon: '#F5E8AE', menta: '#B4EBD3', cielo: '#B8DBF7', lavanda: '#CEC4F9', lila: '#E8C4F3' }
    },
    neon: {
      label: { en: 'Neon', es: 'Neón' }, accent: 'lavanda',
      dark:  { rosa: '#FF5FAE', coral: '#FF7563', melocoton: '#FFA63D', limon: '#F5FF55', menta: '#3DFFB5', cielo: '#44CBFF', lavanda: '#A898FF', lila: '#E673FF' },
      light: { rosa: '#D6196E', coral: '#D03419', melocoton: '#B85F00', limon: '#867800', menta: '#00875A', cielo: '#0B74B8', lavanda: '#6247E0', lila: '#A21FCC' },
      black: { rosa: '#FF4FA3', coral: '#FF6B57', melocoton: '#FF9F2E', limon: '#F2FF3D', menta: '#2BFFAE', cielo: '#33C4FF', lavanda: '#9E8CFF', lila: '#E361FF' }
    }
  },

  /* Iconos oficiales de AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric (carpeta icons/).
     Se regeneran con: python3 tools/build-icons.py <carpeta con los paquetes>.
     enabled: false = usar solo los iconos propios de abajo. */
  icons: { enabled: true },

  /* Atajos sin icono oficial. Salen arriba de la pestaña de su nube.
     SAP solo publica iconos para sus servicios BTP. Sus aplicaciones de negocio
     (S/4HANA, ECC, TM, EWM…) llevan el logotipo de SAP (`icon`, de icons/logos.js). */
  presets: {
    sap: {
      title: { en: 'SAP business systems', es: 'Sistemas de negocio SAP' },
      items: [
        { label: 'SAP S/4HANA', sub: 'ERP', icon: 'sap/logo', type: 'erp', keywords: 's4 s4hana' },
        { label: 'SAP S/4HANA Cloud', sub: { en: 'Cloud ERP', es: 'ERP en la nube' }, icon: 'sap/logo', type: 'erp', keywords: 's4 s4hana rise' },
        { label: 'SAP ECC', sub: 'ERP · ECC 6.0', icon: 'sap/logo', type: 'erp', keywords: 'r3 erp central component' },
        { label: 'SAP TM', sub: 'Transportation Management', icon: 'sap/logo', type: 'erp', keywords: 'transporte logistica transport logistics' },
        { label: 'SAP EWM', sub: 'Extended Warehouse Mgmt.', icon: 'sap/logo', type: 'erp', keywords: 'almacen bodega warehouse' },
        { label: 'SAP BW/4HANA', sub: 'Data warehouse', icon: 'sap/logo', type: 'analytics', keywords: 'bw bi' },
        { label: 'SAP PI/PO', sub: { en: 'On-premise integration', es: 'Integración on-premise' }, icon: 'sap/logo', type: 'queue', keywords: 'pi po process integration orchestration' },
        { label: 'SAP SuccessFactors', sub: { en: 'HR', es: 'RR. HH.' }, icon: 'sap/logo', type: 'erp', keywords: 'hcm recursos humanos hr human resources' },
        { label: 'SAP Ariba', sub: { en: 'Procurement', es: 'Compras' }, icon: 'sap/logo', type: 'erp', keywords: 'procurement compras purchasing' },
        { label: 'SAP Concur', sub: { en: 'Travel & expenses', es: 'Viajes y gastos' }, icon: 'sap/logo', type: 'erp', keywords: 'gastos viajes travel expenses' },
        { label: 'SAP Commerce Cloud', sub: { en: 'Commerce', es: 'Comercio' }, icon: 'sap/logo', type: 'web', keywords: 'hybris cx ecommerce' },
        { label: 'SAP Business One', sub: { en: 'SME ERP', es: 'ERP para pymes' }, icon: 'sap/logo', type: 'erp', keywords: 'b1 pyme' },
        { label: 'SAP GUI', sub: { en: 'Desktop client', es: 'Cliente de escritorio' }, icon: 'sap/logo', type: 'user', keywords: 'gui cliente' }
      ]
    }
  },

  /* Ambientes de la pestaña "Versiones". Cada uno guarda su propia copia del diagrama.
     short: texto del botón · color: clave de la paleta. Añade o quita los que quieras. */
  environments: {
    dev:  { label: { en: 'Development', es: 'Desarrollo' }, short: 'DEV', color: 'cielo' },
    qa:   { label: { en: 'Quality (QA)', es: 'Calidad (QA)' }, short: 'QA', color: 'limon' },
    prod: { label: { en: 'Production', es: 'Producción' }, short: 'PROD', color: 'menta' }
  },

  /* Clasificación de datos: etiquetas de color arriba de cada nodo y en las conexiones.
     sensitive: true = si viaja por una conexión marcada "sin cifrar", se avisa en rojo. */
  dataClasses: {
    public:       { label: { en: 'Public', es: 'Público' }, short: 'PUB', color: 'menta' },
    internal:     { label: { en: 'Internal', es: 'Interno' }, short: 'INT', color: 'cielo' },
    confidential: { label: { en: 'Confidential', es: 'Confidencial' }, short: 'CONF', color: 'melocoton', sensitive: true },
    pii:          { label: { en: 'Personal data (PII)', es: 'Datos personales (PII)' }, short: 'PII', color: 'rosa', sensitive: true },
    pci:          { label: { en: 'Payment card data (PCI)', es: 'Datos de tarjetas (PCI)' }, short: 'PCI', color: 'coral', sensitive: true },
    phi:          { label: { en: 'Health data (PHI)', es: 'Datos de salud (PHI)' }, short: 'PHI', color: 'lila', sensitive: true }
  },

  /* Residencia y soberanía de datos: región (o país) de cada componente y aviso cuando datos sensibles cruzan jurisdicciones.
     jurisdictions: mapa ORDENADO clave → { label: {en, es}, short, match, of? }. El texto de la región (p. ej. `eu-west-1`,
     `westeurope`, `europe-west1`, `ES`, `US`) se prueba contra `match` (RegExp, sin distinguir mayúsculas); gana la primera
     jurisdicción que coincide, así que pon las más específicas antes (uk y ch antes que eu). Sin coincidencia = región
     desconocida (no se avisa). Para añadir una: copia una línea, cambia clave, etiquetas y `match`. Para ajustar una, edita su
     `match` (usa ^…$ para que `IT` no coincida con otras palabras). `of` (opcional) es el texto tras «salen de/leaves» («la UE»).
     warnSameJurisdiction: true = avisa también cuando las regiones difieren dentro de una misma jurisdicción. */
  residency: {
    warnSameJurisdiction: false,
    jurisdictions: {
      uk:    { label: { en: 'UK', es: 'Reino Unido' }, short: 'UK', match: /^(uk|gb|uk(south|west)|eu-west-2|europe-west2)$/i },
      ch:    { label: { en: 'Switzerland', es: 'Suiza' }, short: 'CH', match: /^(ch|switzerland(north|west)|eu-central-2|europe-west6)$/i },
      eu:    { label: { en: 'EU', es: 'UE' }, of: { en: 'the EU', es: 'la UE' }, short: 'EU',
               match: /^(eu|eusc-[a-z]+-[a-z]+-\d|eu-(central|north|south|west)-\d|europe-[a-z]+\d+|(west|north)europe|france(central|south)|germany(westcentral|north)|swedencentral|italynorth|spaincentral|polandcentral|austriaeast|denmarkeast|belgiumcentral|at|be|bg|hr|cy|cz|dk|ee|fi|fr|de|gr|hu|ie|it|lv|lt|lu|mt|nl|pl|pt|ro|sk|si|es|se)$/i },
      us:    { label: { en: 'US', es: 'EE. UU.' }, short: 'US', match: /^(us|us-[a-z-]+\d|(east|west|central|northcentral|southcentral|westcentral)us\d?|usgov[a-z]*|usdod[a-z]*)$/i },
      ca:    { label: { en: 'Canada', es: 'Canadá' }, short: 'CA', match: /^(ca|ca-[a-z]+-\d|canada(central|east)|northamerica-northeast\d)$/i },
      br:    { label: { en: 'Brazil', es: 'Brasil' }, short: 'BR', match: /^(br|brazil(south|southeast)|sa-east-1|southamerica-east\d)$/i },
      latam: { label: { en: 'Latin America', es: 'Latinoamérica' }, short: 'LATAM', match: /^(mx|ar|cl|co|pe|uy|ec|bo|py|ve|cr|pa|mexico[a-z-]*\d?|chile[a-z]*|southamerica-west\d|northamerica-south\d)$/i },
      apac:  { label: { en: 'Asia-Pacific', es: 'Asia-Pacífico' }, short: 'APAC', match: /^(ap-[a-z]+-\d|asia-[a-z]+\d|australia[a-z-]*\d?|japan[a-z]*|korea[a-z]*|india[a-z]*|(central|south|west)india|jioindia[a-z]*|southeastasia|eastasia|newzealand[a-z]*|cn-[a-z]+-\d|china[a-z]*|cn|jp|kr|in|sg|au|nz|hk|tw|id|my|th|vn|ph)$/i },
      me:    { label: { en: 'Middle East', es: 'Medio Oriente' }, short: 'ME', match: /^(me-[a-z]+-?\d|il-central-1|uae[a-z]*|qatar[a-z]*|israel[a-z]*|saudi[a-z]*|ae|sa|il|qa|bh|kw|om|jo)$/i },
      af:    { label: { en: 'Africa', es: 'África' }, short: 'AF', match: /^(af-south-1|southafrica(north|west)|africa-south\d|za|eg|ng|ke|ma)$/i }
    }
  },
  /* Capas del data lake (medallion): etiqueta de color en la esquina inferior izquierda de cada nodo, franja en su borde
     izquierdo y borde de color en los grupos. Los nodos heredan la capa de su grupo.
     label: nombre «Medallion» · alt: nombre «Zonas» (el diagrama elige cuál ver, ver `layerNames` en el JSON) · short: letra corta
     color: cualquier color CSS. Por defecto usan variables --layer-<clave> definidas por tema en index.html (#diagram-css),
     para que se lean bien en oscuro, claro y negro; cámbialas ahí o pon aquí un color fijo (p. ej. '#c27c3e').
     El orden de las claves es el de la leyenda. layerAliases (abajo): otros nombres aceptados al leer JSON y texto (se comparan en minúsculas, sin tildes). */
  dataLayers: {
    bronze: { label: { en: 'Bronze', es: 'Bronce' }, alt: { en: 'Raw', es: 'Crudo' }, short: 'B', altShort: 'R', color: 'var(--layer-bronze, #c27c3e)' },
    silver: { label: { en: 'Silver', es: 'Plata' }, alt: { en: 'Curated', es: 'Curado' }, short: 'S', altShort: 'C', color: 'var(--layer-silver, #9aa7b4)' },
    gold:   { label: { en: 'Gold', es: 'Oro' }, alt: { en: 'Serving', es: 'Consumo' }, short: 'G', altShort: 'S', color: 'var(--layer-gold, #d4a72c)' }
  },
  layerAliases: {
    raw: 'bronze', bronce: 'bronze', crudo: 'bronze',
    curated: 'silver', plata: 'silver', curado: 'silver', refined: 'silver',
    serving: 'gold', oro: 'gold', consumo: 'gold'
  },

  /* Costos escritos a mano en cada componente (recuadro bajo el nodo).
     hoursPerMonth: horas usadas para pasar un precio por hora a mensual.
     defaultYears: años por defecto del periodo "Multianual". */
  cost: { currency: 'USD', locale: 'en-US', hoursPerMonth: 730, defaultYears: 3 },

  /* Nodos. sameSize: true = todos miden `width` y los nombres largos usan 2 líneas.
     sameSize: false = cada nodo crece con su texto, entre `width` y `maxWidth`. */
  node:  { width: 232, sameSize: true, maxWidth: 300, height: 64, radius: 14 },
  grid:  { size: 24, snap: 8 },
  group: { padding: 24, labelSpace: 22, radius: 18 },
  view:  { minZoom: 0.2, maxZoom: 2.5 },

  /* Vistas: filtros de presentación del MISMO modelo (no cambian datos ni posiciones).
     Clave = nombre de la vista (atajos 1…8 en este orden). Cada regla es opcional; lo que falte vale como en `full`.
     - groups: 'all' (todos) · 'logical' (oculta los grupos físicos) · 'collapse-top' (cajas cerradas de primer nivel)
     - nodeDetail: 'full' | 'min' (sin detalle `sub`) · edgeLabels / dataTags / locks / cost / zones / notes / review: true | false
     - emphasis: null | 'security' | 'data' | 'cost' | 'owner' (resalta lo relevante y atenúa el resto)
     - layers: true | false (capas del data lake: franja, etiqueta y borde de grupo)
     - legendGroups: true añade a la leyenda una fila que indica qué grupos se ven (ya sale sola si `groups` no es 'all')
     - icon: contenido SVG de 24×24 a trazo para el selector de vistas de la barra superior (su descripción está en i18n.js › view.desc.<clave>) */
  views: {
    full:     { label: { en: 'Full', es: 'Completa' }, icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', groups: 'all', nodeDetail: 'full', edgeLabels: true, dataTags: true, locks: true, cost: true, zones: true, notes: true, review: true, emphasis: null, layers: true },
    context:  { label: { en: 'Context', es: 'Contexto' }, icon: '<rect x="3" y="8" width="7" height="8" rx="2"/><rect x="14" y="8" width="7" height="8" rx="2"/><path d="M10 12h4"/>', groups: 'collapse-top', nodeDetail: 'min', edgeLabels: false, dataTags: false, locks: false, cost: false, zones: false, notes: false, review: false, emphasis: null, layers: false },
    logical:  { label: { en: 'Logical', es: 'Lógica' }, icon: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', groups: 'logical', nodeDetail: 'full', edgeLabels: true, dataTags: false, locks: false, cost: false, zones: false, notes: true, review: true, emphasis: null, layers: true },
    physical: { label: { en: 'Physical', es: 'Física' }, legendGroups: true, icon: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>', groups: 'all', nodeDetail: 'full', edgeLabels: false, dataTags: false, locks: true, cost: false, zones: true, notes: true, review: true, emphasis: null, layers: true },
    security: { label: { en: 'Security', es: 'Seguridad' }, icon: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>', groups: 'all', nodeDetail: 'full', edgeLabels: true, dataTags: true, locks: true, cost: false, zones: true, notes: true, review: true, emphasis: 'security', layers: true },
    data:     { label: { en: 'Data', es: 'Datos' }, icon: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', groups: 'all', nodeDetail: 'full', edgeLabels: true, dataTags: true, locks: false, cost: false, zones: true, notes: true, review: true, emphasis: 'data', layers: true },
    cost:     { label: { en: 'Cost', es: 'Costo' }, icon: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.4-1-1.4-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2s1 1.7 2.8 2.1 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.4 0-2.4-.6-2.8-1.6M12 6v1.6M12 16.4V18"/>', groups: 'all', nodeDetail: 'full', edgeLabels: true, dataTags: false, locks: false, cost: true, zones: false, notes: true, review: true, emphasis: 'cost', layers: false },
    governance: { label: { en: 'Governance', es: 'Gobierno' }, icon: '<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6"/><rect x="15" y="12" width="7" height="8.5" rx="1.5"/><path d="M17 15.5h3M17 18h3"/>', groups: 'all', nodeDetail: 'full', edgeLabels: true, dataTags: true, locks: false, cost: false, zones: false, notes: true, review: true, emphasis: 'owner', layers: true }
  },
  /* Vista por defecto al abrir si el navegador no recuerda otra (el diagrama puede traer `meta.view`). */
  defaultView: 'full',

  /* Datos que usan las vistas. */
  viewRules: {
    /* Nodos de datos (vista Datos): por tipo propio o por la categoría de su icono oficial */
    dataTypes: ['db', 'nosql', 'cache', 'storage', 'analytics', 'queue', 'stream'],
    dataIconCategories: ['Bases de datos', 'Almacenamiento', 'Analítica', 'Tiempo real', 'Ingeniería de datos', 'Power BI'],
    /* Mapa de calor de la vista Costo: de menos a más costo mensual (variables de severidad) */
    costHeat: ['var(--sev-low)', 'var(--sev-medium)', 'var(--sev-high)', 'var(--sev-critical)'],
    /* Tipo de grupo cuando no se indica `kind`: físico si su icono o su nombre coinciden; si no, lógico */
    physicalGroupIcons: ['aws/group-account', 'aws/group-region', 'aws/group-vpc', 'aws/group-publicsubnet', 'aws/group-privatesubnet', 'aws/group-cloud', 'aws/group-datacenter', 'aws/group-autoscaling',
      'azure/group-subscription', 'azure/group-resourcegroup', 'azure/group-managementgroup', 'azure/vnet', 'azure/subnet', 'gcp/vpc', 'azure/logo', 'gcp/logo', 'sap/logo'],
    physicalGroupName: /vpc|vnet|subnet|subred|regi[oó]n|region|\baz\b|availability zone|zona de disponibilidad|account|cuenta|subscription|suscripci[oó]n|resource group|grupo de recursos|tenant|datacenter|centro de datos/i
  },

  /* Modelado de amenazas STRIDE: cada conexión que cruza una frontera de confianza (zona `kind: 'trust'`) recibe amenazas sugeridas.
     Reglas (app.js › strideFor), por conexión que cruza:
       S Suplantación: siempre; severidad inboundSeverity si es «entrante» (el origen no está en la zona de destino), si no medium
       T Manipulación: sin cifrar → high (false) o medium (sin dato); cifrada → low
       I Divulgación: datos sensibles y sin cifrar → high (critical si encrypted=false y datos de criticalClasses); cifrada → low (sin datos sensibles no aplica)
       R Repudio: medium si viajan datos sensibles, si no low
       D Denegación: entrante y de estilo síncrono → medium, si no low
       E Elevación: entrante hacia un almacén de datos / secretos / identidad (storeTypes, storeIconCategories) → high; otra entrante → medium; saliente → se omite
     categories: etiqueta, descripción y mitigación sugerida por categoría (editables). */
  stride: {
    inboundSeverity: 'high',
    criticalClasses: ['pii', 'pci', 'phi'],
    storeTypes: ['db', 'nosql', 'storage', 'analytics', 'secrets', 'auth'],
    storeIconCategories: ['Bases de datos', 'Almacenamiento', 'Analítica', 'Seguridad'],
    categories: {
      S: { label: { en: 'Spoofing', es: 'Suplantación' },
           desc: { en: 'The caller could pretend to be someone else when crossing the boundary.', es: 'Quien llama podría hacerse pasar por otro al cruzar la frontera.' },
           mitigation: { en: 'Authenticate every caller at the boundary (mutual TLS, signed tokens, workload identity).', es: 'Autenticar a cada llamante en la frontera (TLS mutuo, tokens firmados, identidad de carga de trabajo).' } },
      T: { label: { en: 'Tampering', es: 'Manipulación' },
           desc: { en: 'Data could be altered in transit between the two zones.', es: 'Los datos podrían alterarse en tránsito entre las dos zonas.' },
           mitigation: { en: 'Encrypt the channel (TLS) and validate integrity (signatures, checksums) and input.', es: 'Cifrar el canal (TLS) y validar integridad (firmas, sumas de control) y entradas.' } },
      R: { label: { en: 'Repudiation', es: 'Repudio' },
           desc: { en: 'Without a trail, a party could deny having sent or done something across the boundary.', es: 'Sin rastro, una parte podría negar haber enviado o hecho algo a través de la frontera.' },
           mitigation: { en: 'Log and audit every crossing with caller identity and timestamps, in tamper-evident storage.', es: 'Registrar y auditar cada cruce con identidad y hora, en un almacén a prueba de alteraciones.' } },
      I: { label: { en: 'Information disclosure', es: 'Divulgación de información' },
           desc: { en: 'Sensitive data could be read by someone who should not see it.', es: 'Datos sensibles podrían ser leídos por quien no debería verlos.' },
           mitigation: { en: 'Encrypt in transit, minimise the data sent and mask or tokenise sensitive fields.', es: 'Cifrar en tránsito, enviar solo lo necesario y enmascarar o tokenizar los campos sensibles.' } },
      D: { label: { en: 'Denial of service', es: 'Denegación de servicio' },
           desc: { en: 'The entry point could be flooded or exhausted from the less trusted side.', es: 'El punto de entrada podría saturarse o agotarse desde el lado menos confiable.' },
           mitigation: { en: 'Apply rate limits, quotas, timeouts and a WAF or load shedding in front of the boundary.', es: 'Aplicar límites de tasa, cuotas, tiempos de espera y un WAF o descarte de carga antes de la frontera.' } },
      E: { label: { en: 'Elevation of privilege', es: 'Elevación de privilegios' },
           desc: { en: 'A caller could gain access or rights beyond what it was granted in the inner zone.', es: 'Quien llama podría obtener accesos o permisos más allá de los concedidos en la zona interior.' },
           mitigation: { en: 'Enforce least privilege and authorise each request server-side; separate duties and scope credentials.', es: 'Aplicar mínimo privilegio y autorizar cada petición en el servidor; separar funciones y acotar credenciales.' } }
    }
  },

  /* Orden automático. direction: 'LR' (izquierda→derecha) o 'TB' (arriba→abajo). */
  layout: { direction: 'LR', colGap: 110, rowGap: 40, groupGap: 70, rankGapTB: 90 },

  animation: {
    enabled: true,         // flujo animado en las conexiones
    particleSpeed: 70,     // píxeles por segundo de las partículas
    enterStagger: 45,      // ms entre la aparición de cada nodo
    playStepMs: 1100,      // ms por paso en "Reproducir flujo"
    viewTween: 450         // ms de las transiciones de cámara
  },

  /* Modo de resaltado al seleccionar: 'direct' | 'down' | 'up' | 'both' */
  focus: { defaultMode: 'direct' },

  /* Estilos de conexión. `dash` vacío = línea continua. `particles` = puntos en movimiento. */
  edgeStyles: {
    sync:     { label: { en: 'Synchronous (request)', es: 'Síncrona (petición)' }, dash: '',    particles: 1, width: 1.8 },
    async:    { label: { en: 'Asynchronous (event)', es: 'Asíncrona (evento)' }, dash: '6 6', particles: 1, width: 1.8 },
    data:     { label: { en: 'Data flow', es: 'Flujo de datos' }, dash: '',    particles: 3, width: 2.4 },
    optional: { label: { en: 'Optional / fallback', es: 'Opcional / respaldo' }, dash: '2 6', particles: 0, width: 1.5 }
  },

  /* Categorías del panel. Los nombres en inglés están en i18n.js. */
  categories: ['Clientes', 'Red', 'Cómputo', 'Datos', 'Integración', 'Seguridad', 'Operaciones', 'IA', 'Empresa', 'Otros'],

  /* Tipos de componente. Para añadir uno nuevo copia una entrada:
     - label: texto o { en: '…', es: '…' }
     - color: clave de la paleta (o un color CSS como '#ffcc00')
     - legendGroups: true añade a la leyenda una fila que indica qué grupos se ven (ya sale sola si `groups` no es 'all')
     - icon: contenido SVG de 24×24 a trazo (sin relleno)
     - keywords: palabras para el buscador */
  types: {
    user:      { label: { en: 'Users', es: 'Usuarios' }, category: 'Clientes', color: 'lavanda', keywords: 'cliente persona usuario user customer person',
                 icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>' },
    web:       { label: { en: 'Web app', es: 'App web' }, category: 'Clientes', color: 'lavanda', keywords: 'navegador browser frontend spa',
                 icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/>' },
    mobile:    { label: { en: 'Mobile app', es: 'App móvil' }, category: 'Clientes', color: 'lavanda', keywords: 'ios android movil mobile phone',
                 icon: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>' },

    dns:       { label: 'DNS', category: 'Red', color: 'cielo', keywords: 'route53 cloud dns dominio domain',
                 icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>' },
    cdn:       { label: 'CDN', category: 'Red', color: 'cielo', keywords: 'cloudfront cloudflare front door akamai edge',
                 icon: '<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="5.5" r="1.8"/><circle cx="19.5" cy="5.5" r="1.8"/><circle cx="4.5" cy="18.5" r="1.8"/><circle cx="19.5" cy="18.5" r="1.8"/><path d="M6 7l4 3.5M18 7l-4 3.5M6 17l4-3.5M18 17l-4-3.5"/>' },
    lb:        { label: { en: 'Load balancer', es: 'Balanceador' }, category: 'Red', color: 'cielo', keywords: 'alb elb nlb load balancer balanceo',
                 icon: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5 5.8 16.8M12 11.5l6.2 5.3"/>' },
    gateway:   { label: 'API Gateway', category: 'Red', color: 'cielo', keywords: 'apigee apim ingress kong api',
                 icon: '<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-6h6v6"/>' },
    firewall:  { label: 'Firewall / WAF', category: 'Red', color: 'cielo', keywords: 'waf armor seguridad vpn security',
                 icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v6M15 10v5M9 15v5"/>' },

    compute:   { label: { en: 'Server / VM', es: 'Servidor / VM' }, category: 'Cómputo', color: 'menta', keywords: 'ec2 vm compute engine instancia servidor server instance',
                 icon: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>' },
    container: { label: { en: 'Container', es: 'Contenedor' }, category: 'Cómputo', color: 'menta', keywords: 'docker ecs fargate cloud run pod microservicio microservice',
                 icon: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>' },
    k8s:       { label: 'Kubernetes', category: 'Cómputo', color: 'menta', keywords: 'eks gke aks cluster k8s',
                 icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.3 4.3M14.1 14.1l4.3 4.3M18.4 5.6l-4.3 4.3M9.9 14.1l-4.3 4.3"/>' },
    function:  { label: { en: 'Function', es: 'Función' }, category: 'Cómputo', color: 'menta', keywords: 'lambda serverless cloud functions azure functions',
                 icon: '<path d="M5 20 11.5 9 9 4H6M11.5 9 16 20h3"/>' },

    db:        { label: { en: 'Database', es: 'Base de datos' }, category: 'Datos', color: 'melocoton', keywords: 'rds sql postgres mysql aurora cloud sql',
                 icon: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>' },
    nosql:     { label: 'NoSQL', category: 'Datos', color: 'melocoton', keywords: 'dynamodb mongo cosmos firestore documentos documents',
                 icon: '<path d="M12 3 4 7l8 4 8-4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>' },
    cache:     { label: { en: 'Cache', es: 'Caché' }, category: 'Datos', color: 'coral', keywords: 'redis memcached elasticache memorystore',
                 icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
    storage:   { label: { en: 'Storage', es: 'Almacenamiento' }, category: 'Datos', color: 'limon', keywords: 's3 bucket blob gcs objetos ficheros objects files',
                 icon: '<path d="M4 6h16l-2 14H6z"/><ellipse cx="12" cy="6" rx="8" ry="2.5"/>' },
    analytics: { label: { en: 'Analytics', es: 'Analítica' }, category: 'Datos', color: 'limon', keywords: 'bigquery redshift athena snowflake data warehouse',
                 icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },

    queue:     { label: { en: 'Queue', es: 'Cola' }, category: 'Integración', color: 'lila', keywords: 'sqs rabbitmq service bus mensajes messages',
                 icon: '<rect x="2" y="8" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="8" rx="1"/><rect x="17" y="8" width="5" height="8" rx="1"/>' },
    stream:    { label: 'Streaming', category: 'Integración', color: 'lila', keywords: 'kafka kinesis event hubs streams',
                 icon: '<path d="M2 8c3-3 5 3 8 0s5 3 8 0 3-1 4 0M2 16c3-3 5 3 8 0s5 3 8 0 3-1 4 0"/>' },
    events:    { label: { en: 'Event bus', es: 'Bus de eventos' }, category: 'Integración', color: 'lila', keywords: 'eventbridge pubsub sns event grid eventos events',
                 icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5 19 19M19 5l-2.5 2.5M7.5 16.5 5 19"/>' },
    email:     { label: { en: 'Email / Notifications', es: 'Email / Avisos' }, category: 'Integración', color: 'lila', keywords: 'ses sendgrid notificaciones correo notifications mail',
                 icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>' },

    auth:      { label: { en: 'Identity', es: 'Identidad' }, category: 'Seguridad', color: 'rosa', keywords: 'cognito auth0 entra iam oauth login sso',
                 icon: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>' },
    secrets:   { label: { en: 'Secrets / KMS', es: 'Secretos / KMS' }, category: 'Seguridad', color: 'rosa', keywords: 'vault kms key secrets manager claves keys',
                 icon: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>' },

    monitor:   { label: { en: 'Monitoring', es: 'Monitorización' }, category: 'Operaciones', color: 'limon', keywords: 'cloudwatch datadog grafana prometheus logs métricas metrics observability',
                 icon: '<path d="M3 12h4l3-7 4 14 3-7h4"/>' },
    cicd:      { label: 'CI/CD', category: 'Operaciones', color: 'lavanda', keywords: 'github actions jenkins cloud build pipeline despliegue deploy',
                 icon: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-10.2 5.2"/>' },

    ai:        { label: { en: 'AI / ML', es: 'IA / ML' }, category: 'IA', color: 'rosa', keywords: 'bedrock vertex openai sagemaker llm modelo inteligencia model ml',
                 icon: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>' },

    erp:       { label: { en: 'ERP / Business system', es: 'ERP / Sistema de negocio' }, category: 'Empresa', color: 'cielo', keywords: 'sap s4hana s/4hana ecc erp tm ewm bw oracle dynamics negocio business',
                 icon: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-5h6v5M9 11h.01M12 11h.01M15 11h.01"/>' },

    external:  { label: { en: 'External service', es: 'Servicio externo' }, category: 'Otros', color: 'coral', keywords: 'saas tercero api externa stripe third party external',
                 icon: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>' },
    generic:   { label: { en: 'Component', es: 'Componente' }, category: 'Otros', color: 'lavanda', keywords: 'genérico caja generic box',
                 icon: '<rect x="4" y="4" width="16" height="16" rx="4"/>' }
  }
};
