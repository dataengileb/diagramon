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
    defaultTheme: 'dark',        // 'dark' | 'light'
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
    }
  },

  /* Paletas. Todas deben tener las mismas claves de color.
     `dark` se usa en modo oscuro y `light` (tonos algo más intensos) en modo claro.
     Cada color se expone como variable CSS --p-<clave>. */
  palettes: {
    pastel: {
      label: 'Pastel', accent: 'lavanda',
      dark:  { rosa: '#F5A9C6', coral: '#F6B0A4', melocoton: '#F8C99E', limon: '#EFE0A0', menta: '#A6E3C8', cielo: '#A9D2F3', lavanda: '#C2B6F6', lila: '#E0B5EE' },
      light: { rosa: '#E27AA3', coral: '#E2806F', melocoton: '#E0965A', limon: '#C4A63A', menta: '#3FAE85', cielo: '#4E9AD8', lavanda: '#8573DB', lila: '#B472CF' }
    },
    sorbete: {
      label: { en: 'Sherbet', es: 'Sorbete' }, accent: 'rosa',
      dark:  { rosa: '#FF9EC7', coral: '#FFAB98', melocoton: '#FFC48A', limon: '#FCEB8F', menta: '#8EEBC4', cielo: '#8FD3FF', lavanda: '#B9A6FF', lila: '#E6A3FF' },
      light: { rosa: '#EC5F9C', coral: '#EE6E55', melocoton: '#EB8E3A', limon: '#C9A51E', menta: '#22B37F', cielo: '#2D93DB', lavanda: '#7A5CEB', lila: '#B455DB' }
    },
    nordico: {
      label: { en: 'Nordic', es: 'Nórdico' }, accent: 'cielo',
      dark:  { rosa: '#D8A7B1', coral: '#D9A89A', melocoton: '#DDBB98', limon: '#D9CF9E', menta: '#9FCBB8', cielo: '#9DBCD8', lavanda: '#AFA9D6', lila: '#C3A8CF' },
      light: { rosa: '#B97585', coral: '#B9786A', melocoton: '#B98A5C', limon: '#A39340', menta: '#4F9478', cielo: '#4F82AE', lavanda: '#7268B0', lila: '#93699F' }
    }
  },

  /* Iconos oficiales de AWS, Azure, Google Cloud, SAP BTP y Microsoft Fabric (carpeta icons/).
     Se regeneran con: python3 tools/build-icons.py <carpeta con los paquetes>.
     enabled: false = usar solo los iconos propios de abajo. */
  icons: { enabled: true },

  /* Atajos sin icono oficial. Salen arriba de la pestaña de su nube.
     SAP solo publica iconos para sus servicios BTP. Sus aplicaciones de negocio
     (S/4HANA, ECC, TM, EWM…) se dibujan como cajas con nombre, sin icono propio. */
  presets: {
    sap: {
      title: { en: 'SAP systems (no official icon)', es: 'Sistemas SAP (sin icono oficial)' },
      items: [
        { label: 'SAP S/4HANA', sub: 'ERP', type: 'erp', keywords: 's4 s4hana' },
        { label: 'SAP S/4HANA Cloud', sub: { en: 'Cloud ERP', es: 'ERP en la nube' }, type: 'erp', keywords: 's4 s4hana rise' },
        { label: 'SAP ECC', sub: 'ERP · ECC 6.0', type: 'erp', keywords: 'r3 erp central component' },
        { label: 'SAP TM', sub: 'Transportation Management', type: 'erp', keywords: 'transporte logistica transport logistics' },
        { label: 'SAP EWM', sub: 'Extended Warehouse Mgmt.', type: 'erp', keywords: 'almacen bodega warehouse' },
        { label: 'SAP BW/4HANA', sub: 'Data warehouse', type: 'analytics', keywords: 'bw bi' },
        { label: 'SAP PI/PO', sub: { en: 'On-premise integration', es: 'Integración on-premise' }, type: 'queue', keywords: 'pi po process integration orchestration' },
        { label: 'SAP SuccessFactors', sub: { en: 'HR', es: 'RR. HH.' }, type: 'erp', keywords: 'hcm recursos humanos hr human resources' },
        { label: 'SAP Ariba', sub: { en: 'Procurement', es: 'Compras' }, type: 'erp', keywords: 'procurement compras purchasing' },
        { label: 'SAP Concur', sub: { en: 'Travel & expenses', es: 'Viajes y gastos' }, type: 'erp', keywords: 'gastos viajes travel expenses' },
        { label: 'SAP Commerce Cloud', sub: { en: 'Commerce', es: 'Comercio' }, type: 'web', keywords: 'hybris cx ecommerce' },
        { label: 'SAP Business One', sub: { en: 'SME ERP', es: 'ERP para pymes' }, type: 'erp', keywords: 'b1 pyme' },
        { label: 'SAP GUI', sub: { en: 'Desktop client', es: 'Cliente de escritorio' }, type: 'user', keywords: 'gui cliente' }
      ]
    }
  },

  /* Ambientes de la pestaña "Versiones". Cada uno guarda su propia copia del diagrama.
     short: texto del botón · color: clave de la paleta. Añade o quita los que quieras. */
  environments: {
    dev:  { label: { en: 'Development', es: 'Desarrollo' }, short: 'DEV', color: 'cielo' },
    qa:   { label: { en: 'Quality (QA)', es: 'Calidad (QA)' }, short: 'QA', color: 'limon' },
    prod: { label: { en: 'Production', es: 'Producción' }, short: 'PROD', color: 'coral' }
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
