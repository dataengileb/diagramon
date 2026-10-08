/* ==========================================================================
   Diagramon · plantillas de ejemplo
   Cada plantilla usa el mismo formato JSON que el editor.
   Los nodos sin x/y se colocan solos (orden automático).
   Cualquier texto puede ser { en: '…', es: '…' }: se usa el del idioma activo.
   Las plantillas llevan datos para todas las vistas: grupos físicos y lógicos (`kind`),
   costos (USD/mes), clasificación de datos, cifrado en tránsito, zonas de riesgo y observaciones.
   ========================================================================== */
window.DIAGRAMON_EXAMPLES = [
  {
    name: { en: 'Web app on AWS (3 tiers)', es: 'Web app en AWS (3 capas)' },
    desc: { en: 'CDN, load balancer, instances, cache, database and jobs inside a VPC.', es: 'CDN, balanceador, instancias, caché, base de datos y tareas en una VPC.' },
    diagram: {
      title: { en: 'Web app on AWS · 3 tiers', es: 'Web app en AWS · 3 capas' },
      meta: { author: { en: 'Architecture team', es: 'Equipo de arquitectura' }, version: '1.0' },
      groups: [
        { id: 'aws',  label: 'AWS · eu-west-1', color: 'melocoton', icon: 'aws/group-cloud', kind: 'physical' },
        { id: 'vpc',  label: 'VPC 10.0.0.0/16', color: 'cielo', icon: 'aws/group-vpc', kind: 'physical', parent: 'aws' },
        { id: 'pub',  label: { en: 'Public subnet', es: 'Subred pública' },  color: 'menta', icon: 'aws/group-publicsubnet', kind: 'physical', parent: 'vpc' },
        { id: 'priv', label: { en: 'Private subnet', es: 'Subred privada' }, color: 'lavanda', icon: 'aws/group-privatesubnet', kind: 'physical', parent: 'vpc' },
        { id: 'edge', label: { en: 'Content delivery', es: 'Entrega de contenido' }, color: 'cielo', kind: 'logical', parent: 'aws' },
        { id: 'appl', label: { en: 'Application layer', es: 'Capa de aplicación' }, color: 'menta', kind: 'logical', parent: 'priv' },
        { id: 'datal', label: { en: 'Data layer', es: 'Capa de datos' }, color: 'limon', kind: 'logical', parent: 'priv' }
      ],
      nodes: [
        { id: 'users',  label: { en: 'Users', es: 'Usuarios' }, type: 'user', sub: { en: 'Web and mobile', es: 'Web y móvil' }, x: 0, y: 200, desc: { en: 'Customers using a browser or the app.', es: 'Clientes que acceden por navegador o app.' } },
        { id: 'dns',    label: 'Route 53',       type: 'dns', icon: 'aws/route53',        sub: 'DNS', group: 'edge', cost: 5, x: 336, y: 56,  desc: { en: 'Resolves the domain to CloudFront.', es: 'Resuelve el dominio hacia CloudFront.' } },
        { id: 'cdn',    label: 'CloudFront',     type: 'cdn', icon: 'aws/cloudfront',     sub: { en: 'Global CDN', es: 'CDN global' }, group: 'edge', cost: 85, data: ['public'], x: 336, y: 200, desc: { en: 'Serves static content and routes /api to the load balancer.', es: 'Sirve contenido estático y enruta /api al balanceador.' } },
        { id: 's3',     label: 'S3',             type: 'storage', icon: 'aws/s3',         sub: { en: 'Static assets', es: 'Activos estáticos' }, group: 'edge', cost: 12, data: ['public'], x: 336, y: 344, desc: { en: 'HTML, JS, CSS and images.', es: 'HTML, JS, CSS e imágenes.' } },
        { id: 'cw',     label: 'CloudWatch',     type: 'monitor', icon: 'aws/cloudwatch', sub: { en: 'Metrics and logs', es: 'Métricas y logs' }, group: 'aws', cost: 40, data: ['internal'], x: 336, y: 520, desc: { en: 'Alarms, dashboards and logs.', es: 'Alarmas, paneles y registros.' } },
        { id: 'alb',    label: 'Application LB', type: 'lb', icon: 'aws/elb',             sub: 'HTTPS :443', group: 'pub', cost: 28, x: 696, y: 200, desc: { en: 'Spreads traffic across availability zones.', es: 'Reparte el tráfico entre zonas de disponibilidad.' } },
        { id: 'app1',   label: 'EC2 · App',      type: 'compute', icon: 'aws/ec2',        sub: 'Auto Scaling · AZ a', group: 'appl', badge: 'x2', cost: 140, data: ['pii'], x: 1048, y: 120, desc: { en: 'Application servers in zone a.', es: 'Servidores de aplicación en la zona a.' } },
        { id: 'app2',   label: 'EC2 · App',      type: 'compute', icon: 'aws/ec2',        sub: 'Auto Scaling · AZ b', group: 'appl', badge: 'x2', cost: 140, data: ['pii'], x: 1048, y: 280, desc: { en: 'Application servers in zone b.', es: 'Servidores de aplicación en la zona b.' } },
        { id: 'cache',  label: 'ElastiCache',    type: 'cache', icon: 'aws/elasticache',  sub: 'Redis', group: 'datal', cost: 100, data: ['pii'], x: 1408, y: 40,
          review: { status: 'open', note: { en: 'Redis holds sessions with PII: enable in-transit encryption (TLS)', es: 'Redis guarda sesiones con PII: activar cifrado en tránsito (TLS)' }, by: 'Security', raised: '2026-09-15', due: '2026-11-30' },
          desc: { en: 'Sessions and hot reads. In-transit encryption is not enabled yet.', es: 'Sesiones y lecturas frecuentes. El cifrado en tránsito aún no está activo.' } },
        { id: 'rds',    label: 'RDS PostgreSQL', type: 'db', icon: 'aws/rds',             sub: 'Multi-AZ', group: 'datal', cost: 280, data: ['pii', 'confidential'], x: 1408, y: 200, desc: { en: 'Main database with a standby replica. Customer personal data.', es: 'Base de datos principal con réplica en espera. Datos personales de clientes.' } },
        { id: 'sqs',    label: 'SQS',            type: 'queue', icon: 'aws/sqs',          sub: { en: 'Job queue', es: 'Cola de tareas' }, group: 'datal', cost: 3, data: ['pii'], x: 1408, y: 360, desc: { en: 'Decouples heavy work.', es: 'Desacopla el trabajo pesado.' } },
        { id: 'worker', label: 'Lambda Worker',  type: 'function', icon: 'aws/lambda',    sub: { en: 'Runs jobs', es: 'Procesa tareas' }, group: 'priv', cost: 8, data: ['pii'], x: 1768, y: 360, desc: { en: 'Reads the queue and sends emails.', es: 'Consume la cola y envía correos.' } },
        { id: 'ses',    label: 'SES',            type: 'email', icon: 'aws/ses',          sub: { en: 'Transactional email', es: 'Correo transaccional' }, group: 'aws', cost: 10, data: ['pii'], x: 1768, y: 600, desc: { en: 'Confirmations and email alerts.', es: 'Confirmaciones y avisos por email.' } },
        { id: 'crm',    label: { en: 'Legacy CRM', es: 'CRM legado' }, type: 'external', sub: { en: 'On-premise · SOAP', es: 'On-premise · SOAP' }, data: ['pii'], x: 2104, y: 200,
          review: { status: 'open', note: { en: 'Legacy CRM only speaks plain HTTP: tunnel it through VPN or migrate to HTTPS', es: 'El CRM legado solo habla HTTP: pasarlo por VPN o migrarlo a HTTPS' }, by: 'Security', raised: '2026-09-22', due: '2026-12-15' },
          desc: { en: 'Customer system of record kept on-premise.', es: 'Sistema de clientes que sigue on-premise.' } }
      ],
      edges: [
        { from: 'users', to: 'dns', label: 'DNS' },
        { from: 'users', to: 'cdn', label: 'HTTPS', encrypted: true },
        { from: 'cdn', to: 's3', label: { en: 'static', es: 'estáticos' }, encrypted: true, data: ['public'] },
        { from: 'cdn', to: 'alb', label: '/api', encrypted: true, data: ['pii'] },
        { from: 'alb', to: 'app1', encrypted: true, data: ['pii'] },
        { from: 'alb', to: 'app2', encrypted: true, data: ['pii'] },
        { from: 'app1', to: 'cache', label: 'Redis', encrypted: false, data: ['pii'] },
        { from: 'app1', to: 'rds', label: 'SQL', style: 'data', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'app2', to: 'rds', label: 'SQL', style: 'data', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'app2', to: 'sqs', label: { en: 'jobs', es: 'tareas' }, style: 'async', encrypted: true, data: ['pii'] },
        { from: 'sqs', to: 'worker', style: 'async', encrypted: true, data: ['pii'] },
        { from: 'worker', to: 'ses', label: 'email', encrypted: true, data: ['pii'] },
        { from: 'app2', to: 'crm', label: 'SOAP\nHTTP', encrypted: false, data: ['pii'] },
        { from: 'alb', to: 'cw', label: { en: 'metrics', es: 'métricas' }, style: 'optional' }
      ],
      zones: [
        { id: 'z-cache', x: 1384, y: 10, w: 280, h: 150, label: { en: 'Cache without TLS', es: 'Caché sin TLS' }, severity: 'high', desc: { en: 'Session data with PII travels in clear text between the app and Redis.', es: 'Las sesiones con PII viajan en texto plano entre la app y Redis.' } },
        { id: 'z-crm', x: 2080, y: 160, w: 280, h: 170, label: { en: 'Legacy integration', es: 'Integración legada' }, severity: 'critical', desc: { en: 'Personal data sent over HTTP to the on-premise CRM.', es: 'Datos personales enviados por HTTP al CRM on-premise.' } }
      ]
    }
  },
  {
    name: { en: 'Event-driven serverless', es: 'Serverless por eventos' },
    desc: { en: 'API, functions, DynamoDB, EventBridge and AI, grouped by domain.', es: 'API, funciones, DynamoDB, EventBridge e IA, agrupados por dominio.' },
    diagram: {
      title: { en: 'Event-driven serverless platform', es: 'Plataforma serverless orientada a eventos' },
      meta: { author: { en: 'Architecture team', es: 'Equipo de arquitectura' }, version: '1.0' },
      groups: [
        { id: 'aws',    label: 'AWS', color: 'melocoton', icon: 'aws/group-cloud', kind: 'physical' },
        { id: 'region', label: 'us-east-1', color: 'cielo', icon: 'aws/group-region', kind: 'physical', parent: 'aws' },
        { id: 'api',    label: { en: 'API and data domain', es: 'Dominio API y datos' }, color: 'menta', kind: 'logical', parent: 'region' },
        { id: 'events', label: { en: 'Events and notifications domain', es: 'Dominio de eventos y avisos' }, color: 'lila', kind: 'logical', parent: 'region' },
        { id: 'data',   label: { en: 'Analytics platform', es: 'Plataforma de analítica' }, color: 'limon', kind: 'logical', parent: 'region' }
      ],
      nodes: [
        { id: 'web',     label: { en: 'Web app', es: 'App web' },          type: 'web',       sub: 'React SPA', x: 0, y: 100 },
        { id: 'mobile',  label: { en: 'Mobile app', es: 'App móvil' },     type: 'mobile',    sub: 'iOS / Android', x: 0, y: 300 },
        { id: 'apigw',   label: 'API Gateway',  type: 'gateway', icon: 'aws/apigateway', sub: 'REST + WebSocket', group: 'api', cost: 35, x: 336, y: 200 },
        { id: 'cognito', label: 'Cognito',      type: 'auth', icon: 'aws/cognito', sub: { en: 'Validates JWT', es: 'Valida JWT' }, group: 'api', cost: 25, data: ['pii'], x: 680, y: 40 },
        { id: 'fnapi',   label: 'Lambda API',   type: 'function', icon: 'aws/lambda', sub: 'Node.js', group: 'api', cost: 18, data: ['pii'], x: 680, y: 200 },
        { id: 'ddb',     label: 'DynamoDB',     type: 'nosql', icon: 'aws/dynamodb', sub: { en: 'Single table', es: 'Tabla única' }, group: 'api', cost: 45, data: ['pii'], x: 1024, y: 200,
          review: { status: 'open', note: { en: 'Enable point-in-time recovery and a customer-managed KMS key', es: 'Activar recuperación a un punto en el tiempo y clave KMS propia' }, by: 'Security', raised: '2026-09-18', due: '2026-11-20' },
          desc: { en: 'Orders and customer profiles.', es: 'Pedidos y perfiles de clientes.' } },
        { id: 'llm',     label: 'Bedrock',      type: 'ai', icon: 'aws/bedrock', sub: { en: 'AI summaries', es: 'Resúmenes con IA' }, group: 'region', cost: 120, data: ['confidential'], x: 680, y: 400, desc: { en: 'Summarises customer conversations. Prompts may contain personal data.', es: 'Resume conversaciones con clientes. Los prompts pueden contener datos personales.' } },
        { id: 'fnproc',  label: { en: 'Lambda processor', es: 'Lambda procesador' }, type: 'function', icon: 'aws/lambda', sub: 'DynamoDB Streams', group: 'events', cost: 6, data: ['pii'], x: 1368, y: 200 },
        { id: 'bus',     label: 'EventBridge',  type: 'events', icon: 'aws/eventbridge', sub: { en: 'Domain bus', es: 'Bus de dominio' }, group: 'events', cost: 5, data: ['pii'], x: 1712, y: 200 },
        { id: 'fnmail',  label: { en: 'Lambda notifier', es: 'Lambda avisos' }, type: 'function', icon: 'aws/lambda', group: 'events', cost: 3, data: ['pii'], x: 2056, y: 80 },
        { id: 'ses',     label: 'SES',          type: 'email', icon: 'aws/ses', sub: 'Emails', group: 'events', cost: 8, data: ['pii'], x: 2400, y: 80 },
        { id: 'lake',    label: { en: 'S3 data lake', es: 'Data lake S3' }, type: 'storage', icon: 'aws/s3', sub: 'Parquet', group: 'data', cost: 30, data: ['internal'], x: 2056, y: 400 },
        { id: 'athena',  label: 'Athena',       type: 'analytics', icon: 'aws/athena', sub: { en: 'Ad hoc SQL', es: 'SQL ad hoc' }, group: 'data', cost: 25, data: ['internal'], x: 2400, y: 400 }
      ],
      edges: [
        { from: 'web', to: 'apigw', label: 'HTTPS', encrypted: true },
        { from: 'mobile', to: 'apigw', label: 'HTTPS', encrypted: true },
        { from: 'apigw', to: 'cognito', label: 'token', style: 'optional', encrypted: true, data: ['pii'] },
        { from: 'apigw', to: 'fnapi', encrypted: true, data: ['pii'] },
        { from: 'fnapi', to: 'ddb', style: 'data', encrypted: true, data: ['pii'] },
        { from: 'fnapi', to: 'llm', label: 'prompt', encrypted: true, data: ['confidential'] },
        { from: 'ddb', to: 'fnproc', label: 'stream', style: 'async', encrypted: true, data: ['pii'] },
        { from: 'fnproc', to: 'bus', style: 'async', encrypted: true, data: ['pii'] },
        { from: 'bus', to: 'fnmail', style: 'async', encrypted: true, data: ['pii'] },
        { from: 'bus', to: 'lake', label: { en: 'archive', es: 'archivo' }, style: 'async', encrypted: true, data: ['internal'] },
        { from: 'fnmail', to: 'ses', label: 'SMTP', encrypted: false, data: ['pii'] },
        { from: 'lake', to: 'athena', style: 'data', encrypted: true, data: ['internal'] }
      ],
      zones: [
        { id: 'z-mail', x: 2030, y: 30, w: 640, h: 190, label: { en: 'Email without TLS', es: 'Correo sin TLS' }, severity: 'high', desc: { en: 'The notifier talks plain SMTP to SES with personal data in the message.', es: 'El notificador usa SMTP sin cifrar hacia SES con datos personales en el mensaje.' } },
        { id: 'z-ai', x: 656, y: 372, w: 288, h: 150, label: { en: 'PII sent to the model', es: 'PII hacia el modelo' }, severity: 'medium', desc: { en: 'Prompts should be masked before reaching the LLM.', es: 'Los prompts deberían enmascararse antes de llegar al LLM.' } }
      ]
    }
  },
  {
    name: { en: 'Microservices on GKE', es: 'Microservicios en GKE' },
    desc: { en: 'Kubernetes on Google Cloud with managed data and external payments.', es: 'Kubernetes en Google Cloud con datos gestionados y pagos externos.' },
    diagram: {
      title: { en: 'Online store · microservices on GKE', es: 'Tienda online · microservicios en GKE' },
      meta: { author: { en: 'Architecture team', es: 'Equipo de arquitectura' }, version: '1.0' },
      groups: [
        { id: 'gcp', label: 'Google Cloud', color: 'cielo', icon: 'gcp/logo', kind: 'physical' },
        { id: 'vpc', label: 'VPC store-vpc', color: 'lavanda', icon: 'gcp/vpc', kind: 'physical', parent: 'gcp' },
        { id: 'gke', label: { en: 'GKE cluster', es: 'Clúster GKE' }, color: 'menta', icon: 'gcp/gke', kind: 'physical', parent: 'vpc' },
        { id: 'ns',  label: { en: 'namespace: store', es: 'namespace: tienda' }, color: 'lavanda', kind: 'logical', parent: 'gke' },
        { id: 'stores', label: { en: 'Operational data', es: 'Datos operacionales' }, color: 'melocoton', kind: 'logical', parent: 'gcp' },
        { id: 'analytics', label: { en: 'Events and analytics', es: 'Eventos y analítica' }, color: 'limon', kind: 'logical', parent: 'gcp' }
      ],
      nodes: [
        { id: 'client',   label: { en: 'Customers', es: 'Clientes' }, type: 'web', sub: { en: 'Browser', es: 'Navegador' }, x: 0, y: 200 },
        { id: 'armor',    label: 'Cloud Armor',   type: 'firewall', icon: 'gcp/cloudarmor',  sub: { en: 'WAF + global LB', es: 'WAF + LB global' }, group: 'gcp', cost: 78, x: 336, y: 200 },
        { id: 'ingress',  label: 'Ingress NGINX', type: 'gateway',   sub: 'TLS',     group: 'gke', cost: 20, x: 680,  y: 200 },
        { id: 'front',    label: 'frontend',      type: 'container', sub: 'Next.js', group: 'ns', badge: 'x3', cost: 90, x: 1032, y: 56 },
        { id: 'catalog',  label: { en: 'catalog', es: 'catálogo' }, type: 'container', sub: 'Go', group: 'ns', badge: 'x2', cost: 60, x: 1032, y: 200 },
        { id: 'orders',   label: { en: 'orders', es: 'pedidos' },   type: 'container', sub: 'Java', group: 'ns', badge: 'x2', cost: 60, data: ['pii'], x: 1032, y: 344 },
        { id: 'payments', label: { en: 'payments', es: 'pagos' },   type: 'container', sub: 'Python', group: 'ns', cost: 30, data: ['pci', 'pii'], x: 1384, y: 344,
          review: { status: 'open', note: { en: 'Enforce mTLS between orders and payments (PCI scope)', es: 'Exigir mTLS entre pedidos y pagos (alcance PCI)' }, by: 'Security', raised: '2026-09-10', due: '2026-11-15' },
          desc: { en: 'Tokenises cards and calls the payment gateway. In PCI scope.', es: 'Tokeniza tarjetas y llama a la pasarela. Dentro del alcance PCI.' } },
        { id: 'sql',      label: 'Cloud SQL',     type: 'db', icon: 'gcp/cloudsql',          sub: 'PostgreSQL HA', group: 'stores', cost: 310, data: ['pii'], x: 1744, y: 40, desc: { en: 'Customers and orders.', es: 'Clientes y pedidos.' } },
        { id: 'redis',    label: 'Memorystore',   type: 'cache', icon: 'gcp/memorystore',    sub: 'Redis', group: 'stores', cost: 70, data: ['internal'], x: 1744, y: 200, desc: { en: 'Product catalog cache.', es: 'Caché del catálogo de productos.' } },
        { id: 'pubsub',   label: 'Pub/Sub',       type: 'events', icon: 'gcp/pubsub',        sub: { en: 'order.created', es: 'pedido.creado' }, group: 'analytics', cost: 15, data: ['pii'], x: 1384, y: 580 },
        { id: 'bq',       label: 'BigQuery',      type: 'analytics', icon: 'gcp/bigquery',   sub: { en: 'Sales', es: 'Ventas' }, group: 'analytics', cost: 120, data: ['internal'], x: 1744, y: 580 },
        { id: 'stripe',   label: 'Stripe',        type: 'external',  sub: { en: 'Payment gateway', es: 'Pasarela de pago' }, data: ['pci'], x: 2104, y: 344 }
      ],
      edges: [
        { from: 'client', to: 'armor', label: 'HTTPS', encrypted: true },
        { from: 'armor', to: 'ingress', encrypted: true },
        { from: 'ingress', to: 'front', label: '/', encrypted: true },
        { from: 'ingress', to: 'catalog', label: { en: '/api/catalog', es: '/api/catalogo' }, encrypted: true },
        { from: 'ingress', to: 'orders', label: { en: '/api/orders', es: '/api/pedidos' }, encrypted: true, data: ['pii'] },
        { from: 'front', to: 'catalog' },
        { from: 'catalog', to: 'redis', label: 'Redis', encrypted: false, data: ['internal'] },
        { from: 'catalog', to: 'sql', label: 'SQL', style: 'data', encrypted: true },
        { from: 'orders', to: 'sql', label: 'SQL', style: 'data', encrypted: true, data: ['pii'] },
        { from: 'orders', to: 'payments', label: 'gRPC', encrypted: false, data: ['pci', 'pii'] },
        { from: 'orders', to: 'pubsub', style: 'async', encrypted: true, data: ['pii'] },
        { from: 'pubsub', to: 'bq', style: 'data', encrypted: true, data: ['internal'] },
        { from: 'payments', to: 'stripe', label: 'API', encrypted: true, data: ['pci'] }
      ],
      zones: [
        { id: 'z-pci', x: 1360, y: 310, w: 280, h: 170, label: { en: 'PCI scope', es: 'Alcance PCI' }, severity: 'high', desc: { en: 'Card data is handled here; the gRPC hop from orders is not encrypted.', es: 'Aquí se manejan datos de tarjeta; el salto gRPC desde pedidos no va cifrado.' } },
        { id: 'z-redis', x: 1720, y: 170, w: 280, h: 160, label: { en: 'Cache without TLS', es: 'Caché sin TLS' }, severity: 'low', desc: { en: 'Only catalog data, but in-transit encryption should be enabled.', es: 'Solo datos de catálogo, pero conviene activar el cifrado en tránsito.' } }
      ]
    }
  },
  {
    name: { en: 'Lakehouse on AWS with DR', es: 'Lakehouse en AWS con DRP' },
    desc: { en: 'S3 medallion layers, Glue and Redshift across two regions, with four disaster recovery levels.', es: 'Capas medallón en S3, Glue y Redshift en dos regiones, con cuatro niveles de recuperación ante desastres.' },
    diagram: {
      title: { en: 'Lakehouse on AWS · multi-AZ, multi-region and backup account', es: 'Lakehouse en AWS · multi-AZ, multi-región y cuenta de respaldo' },
      meta: { author: { en: 'Architecture team', es: 'Equipo de arquitectura' }, version: '1.0' },
      groups: [
        { id: 'acct',  label: { en: 'Production account', es: 'Cuenta de producción' }, color: 'melocoton', icon: 'aws/group-account', kind: 'physical', team: { en: 'Cloud platform', es: 'Plataforma cloud' }, owner: 'Jorge Vidal', costCenter: 'CC-1000' },
        { id: 'rp',    label: { en: 'Primary region · us-east-1', es: 'Región primaria · us-east-1' }, color: 'cielo', icon: 'aws/group-region', kind: 'physical', parent: 'acct', region: 'us-east-1' },
        { id: 'lIng',  label: { en: 'Ingestion', es: 'Ingesta' }, color: 'lila', kind: 'logical', parent: 'rp', team: { en: 'Data engineering', es: 'Ingeniería de datos' }, owner: 'Laura Gómez', steward: 'Pedro Ruiz', costCenter: 'CC-4100' },
        { id: 'lBr',   label: { en: 'Bronze layer', es: 'Capa Bronce' }, color: 'melocoton', kind: 'logical', parent: 'rp', layer: 'bronze', team: { en: 'Data engineering', es: 'Ingeniería de datos' }, owner: 'Laura Gómez', steward: 'Pedro Ruiz', costCenter: 'CC-4100' },
        { id: 'lPr',   label: { en: 'Silver layer', es: 'Capa Plata' }, color: 'lavanda', kind: 'logical', parent: 'rp', layer: 'silver', team: { en: 'Data engineering', es: 'Ingeniería de datos' }, owner: 'Laura Gómez', steward: 'Pedro Ruiz', costCenter: 'CC-4100' },
        { id: 'lOr',   label: { en: 'Gold layer', es: 'Capa Oro' }, color: 'limon', kind: 'logical', parent: 'rp', layer: 'gold', team: { en: 'Data engineering', es: 'Ingeniería de datos' }, owner: 'Laura Gómez', steward: 'Pedro Ruiz', costCenter: 'CC-4100' },
        { id: 'vp',    label: 'VPC 10.10.0.0/16', color: 'lavanda', icon: 'aws/group-vpc', kind: 'physical', parent: 'rp' },
        { id: 'sa',    label: { en: 'Private subnet · AZ a', es: 'Subred privada · AZ a' }, color: 'menta', icon: 'aws/group-privatesubnet', kind: 'physical', parent: 'vp' },
        { id: 'sb',    label: { en: 'Private subnet · AZ b', es: 'Subred privada · AZ b' }, color: 'menta', icon: 'aws/group-privatesubnet', kind: 'physical', parent: 'vp' },
        { id: 'lSvA', label: { en: 'Serving', es: 'Capa de consumo' }, color: 'limon', kind: 'logical', parent: 'sa', layer: 'gold', team: { en: 'Analytics', es: 'Analítica' }, owner: 'Marta Díaz', steward: 'Pedro Ruiz', costCenter: 'CC-4200' },
        { id: 'lSvB', label: { en: 'Serving', es: 'Capa de consumo' }, color: 'limon', kind: 'logical', parent: 'sb', layer: 'gold', team: { en: 'Analytics', es: 'Analítica' }, owner: 'Marta Díaz', steward: 'Pedro Ruiz', costCenter: 'CC-4200' },
        { id: 'rd',    label: { en: 'DR region · us-west-2', es: 'Región DR · us-west-2' }, color: 'cielo', icon: 'aws/group-region', kind: 'physical', parent: 'acct', region: 'us-west-2' },
        { id: 'lDr',   label: { en: 'DR data platform (pilot light)', es: 'Plataforma de datos DR (pilot light)' }, color: 'rosa', kind: 'logical', parent: 'rd', team: { en: 'Data engineering', es: 'Ingeniería de datos' }, owner: 'Laura Gómez', steward: 'Pedro Ruiz', costCenter: 'CC-4100' },
        { id: 'vd',    label: 'VPC 10.20.0.0/16', color: 'lavanda', icon: 'aws/group-vpc', kind: 'physical', parent: 'rd' },
        { id: 'sd',    label: { en: 'Private subnet · AZ a', es: 'Subred privada · AZ a' }, color: 'menta', icon: 'aws/group-privatesubnet', kind: 'physical', parent: 'vd' },
        { id: 'lSvD', label: { en: 'Serving', es: 'Capa de consumo' }, color: 'limon', kind: 'logical', parent: 'sd', layer: 'gold', team: { en: 'Analytics', es: 'Analítica' }, owner: 'Marta Díaz', steward: 'Pedro Ruiz', costCenter: 'CC-4200' },
        { id: 'bkacct', label: { en: 'Backup account (isolated)', es: 'Cuenta de respaldo (aislada)' }, color: 'coral', icon: 'aws/group-account', kind: 'physical', region: 'us-east-2', team: { en: 'Security', es: 'Seguridad' }, owner: 'Elena Soto', costCenter: 'CC-1100' }
      ],
      nodes: [
        { id: 'erp', sla: 99.5, label: { en: 'ERP / source systems', es: 'ERP / sistemas origen' }, type: 'erp', sub: { en: 'On-premise · Madrid', es: 'On-premise · Madrid' }, region: 'ES', team: { en: 'Finance IT', es: 'TI de Finanzas' }, owner: 'Carlos Ruiz', steward: 'Ana Torres', costCenter: 'CC-2300', data: ['pii', 'confidential'], x: 0, y: 200, desc: { en: 'Customers, orders and finance. Source of truth.', es: 'Clientes, pedidos y finanzas. Fuente de verdad.' } },
        { id: 'ing', sla: 99.95, replicas: 3, rpo: '0', rto: '5m', label: { en: 'Lambda · ingestion', es: 'Lambda · ingesta' }, type: 'function', icon: 'aws/lambda', sub: { en: 'Multi-AZ (managed)', es: 'Multi-AZ (gestionado)' }, group: 'lIng', cost: 25, data: ['pii', 'confidential'], x: 440, y: 200,
          desc: { en: 'DR level 1: Lambda runs in every AZ of the region by design (RTO minutes, RPO 0).', es: 'Nivel DR 1: Lambda corre en todas las AZ de la región por diseño (RTO minutos, RPO 0).' } },
        { id: 'raw', sla: 99.99, replicas: 3, rpo: '0', rto: '24h', label: { en: 'S3 · raw / bronze', es: 'S3 · raw / bronce' }, type: 'storage', icon: 'aws/s3', sub: { en: 'Raw files, versioned', es: 'Archivos crudos, versionado' }, group: 'lBr', cost: 115, data: ['pii', 'confidential'], x: 820, y: 200,
          desc: { en: 'Level 1: S3 replicates across 3 AZ (RPO 0). Not replicated to DR: it can be rebuilt from the source; protected by the backup account (level 4).', es: 'Nivel 1: S3 replica en 3 AZ (RPO 0). No se replica a DR: se reconstruye desde el origen; protegido por la cuenta de respaldo (nivel 4).' } },
        { id: 'etl1', sla: 99.9, rto: '4h', label: { en: 'Glue · bronze to silver', es: 'Glue · bronce a plata' }, type: 'analytics', icon: 'aws/glue', sub: { en: 'ETL + Data Catalog', es: 'ETL + Data Catalog' }, group: 'lPr', cost: 140, data: ['pii', 'confidential'], x: 1200, y: 200, desc: { en: 'Cleans, masks PII and writes Parquet.', es: 'Limpia, enmascara PII y escribe Parquet.' } },
        { id: 'silver', sla: 99.99, replicas: 3, rpo: '15m', rto: '2h', label: { en: 'S3 · curated / silver', es: 'S3 · curated / plata' }, type: 'storage', icon: 'aws/s3', sub: { en: 'Parquet, PII masked', es: 'Parquet, PII enmascarada' }, group: 'lPr', cost: 95, data: ['confidential'], x: 1560, y: 200, desc: { en: 'Level 2: cross-region replication (CRR) to us-west-2, RPO about 15 min.', es: 'Nivel 2: replicación entre regiones (CRR) a us-west-2, RPO unos 15 min.' } },
        { id: 'etl2', sla: 99.9, rto: '4h', label: { en: 'Glue · silver to gold', es: 'Glue · plata a oro' }, type: 'analytics', icon: 'aws/glue', sub: { en: 'Aggregations', es: 'Agregaciones' }, group: 'lOr', cost: 90, data: ['confidential'], x: 1940, y: 200, desc: { en: 'Builds aggregated business models.', es: 'Construye modelos de negocio agregados.' } },
        { id: 'gold', sla: 99.99, replicas: 3, rpo: '15m', rto: '2h', label: { en: 'S3 · gold', es: 'S3 · oro' }, type: 'storage', icon: 'aws/s3', sub: { en: 'Aggregated, internal', es: 'Agregado, interno' }, group: 'lOr', cost: 40, data: ['internal'], x: 2300, y: 200, desc: { en: 'Levels 2 and 4: replicated to DR and copied to the backup account.', es: 'Niveles 2 y 4: replicado a DR y copiado a la cuenta de respaldo.' } },
        { id: 'rsb', sla: 99.9, rpo: '0', rto: '15m', label: { en: 'Redshift · AZ b', es: 'Redshift · AZ b' }, type: 'analytics', icon: 'aws/redshift', sub: 'RA3 · AZ b', group: 'lSvB', badge: 'standby', cost: 793, data: ['internal'], x: 2760, y: 100,
          desc: { en: 'Level 1: Multi-AZ deployment. If AZ a fails the cluster keeps serving from AZ b (RTO minutes, RPO 0).', es: 'Nivel 1: despliegue Multi-AZ. Si cae la AZ a el clúster sigue sirviendo desde la AZ b (RTO minutos, RPO 0).' } },
        { id: 'rsa', sla: 99.9, replicas: 2, rpo: '0', rto: '15m', label: { en: 'Redshift · AZ a', es: 'Redshift · AZ a' }, type: 'analytics', icon: 'aws/redshift', sub: { en: 'RA3 · primary', es: 'RA3 · primario' }, group: 'lSvA', badge: 'AZ a', cost: 793, data: ['internal'], x: 2760, y: 380,
          review: { status: 'open', note: { en: 'Enforce require_ssl so BI tools cannot connect without TLS', es: 'Forzar require_ssl para que las herramientas BI no conecten sin TLS' }, by: 'Security', raised: '2026-09-25', due: '2026-11-10' },
          desc: { en: 'Serving warehouse. Level 3: automated snapshots copied to us-west-2 every 8 hours.', es: 'Almacén de serving. Nivel 3: snapshots automáticos copiados a us-west-2 cada 8 horas.' } },
        { id: 'kms', sla: 99.999, label: 'KMS', type: 'secrets', icon: 'aws/kms', sub: { en: 'Customer-managed keys', es: 'Claves propias' }, group: 'rp', cost: 60, costPeriod: 'year', x: 1940, y: 520, desc: { en: 'Encrypts S3, Redshift and backups. Multi-region keys let DR decrypt replicas.', es: 'Cifra S3, Redshift y respaldos. Las claves multi-región permiten descifrar réplicas en DR.' } },
        { id: 'bk', sla: 99.9, label: 'AWS Backup', type: 'storage', icon: 'aws/backup', sub: { en: 'Daily plan', es: 'Plan diario' }, group: 'rp', cost: 60, data: ['pii', 'confidential'], x: 1200, y: 560, desc: { en: 'Level 4: daily plan that copies raw and gold to the backup account.', es: 'Nivel 4: plan diario que copia raw y oro a la cuenta de respaldo.' } },
        { id: 's3dr', sla: 99.99, replicas: 3, rpo: '15m', rto: '2h', label: { en: 'S3 · DR replica', es: 'S3 · réplica DR' }, type: 'storage', icon: 'aws/s3', sub: { en: 'Silver + gold (CRR)', es: 'Plata + oro (CRR)' }, group: 'lDr', cost: 100, data: ['confidential'], x: 1940, y: 1000, desc: { en: 'Level 2 target. RTO 1 to 2 hours (repoint jobs), RPO about 15 min.', es: 'Destino del nivel 2. RTO 1 a 2 horas (reapuntar jobs), RPO unos 15 min.' } },
        { id: 'gluedr', sla: 99.9, rto: '8h', label: { en: 'Glue · DR jobs', es: 'Glue · jobs DR' }, type: 'analytics', icon: 'aws/glue', sub: { en: 'Deployed, switched off', es: 'Desplegados, apagados' }, group: 'lDr', cost: 2, data: ['confidential'], x: 2300, y: 1000, desc: { en: 'Level 3, pilot light: same jobs deployed by IaC but not scheduled. Turned on during failover.', es: 'Nivel 3, pilot light: los mismos jobs desplegados con IaC pero sin agenda. Se encienden en el failover.' } },
        { id: 'rsdr', sla: 99.9, rpo: '8h', rto: '8h', label: { en: 'Redshift · DR', es: 'Redshift · DR' }, type: 'analytics', icon: 'aws/redshift', sub: { en: 'Restore from snapshot', es: 'Restaurar desde snapshot' }, group: 'lSvD', badge: 'pilot light', cost: 40, data: ['internal'], x: 2760, y: 1000, desc: { en: 'Level 3: no cluster running, only snapshot storage. Restore takes hours: RTO 4 to 8 h, RPO up to 8 h.', es: 'Nivel 3: sin clúster en marcha, solo almacenamiento de snapshots. Restaurar toma horas: RTO 4 a 8 h, RPO hasta 8 h.' } },
        { id: 'vault', sla: 99.99, replicas: 3, rpo: '24h', rto: '24h', label: { en: 'Immutable vault', es: 'Bóveda inmutable' }, type: 'storage', icon: 'aws/s3', sub: 'Vault Lock', group: 'bkacct', cost: 540, costPeriod: 'year', data: ['pii', 'confidential'], x: 1200, y: 1370,
          review: { status: 'open', note: { en: 'Move Vault Lock from governance to compliance mode', es: 'Pasar Vault Lock de modo governance a compliance' }, by: 'Security', raised: '2026-09-28', due: '2026-12-01' },
          desc: { en: 'Level 4: last resort against ransomware or account compromise. RTO 24 h or more, RPO 24 h.', es: 'Nivel 4: último recurso ante ransomware o compromiso de la cuenta. RTO 24 h o más, RPO 24 h.' } },
        { id: 'bi',     label: { en: 'Analysts / BI', es: 'Analistas / BI' }, type: 'user', sub: 'Tableau · QuickSight', team: { en: 'Analytics', es: 'Analítica' }, owner: 'Marta Díaz', steward: 'Pedro Ruiz', costCenter: 'CC-4200', x: 3700, y: 340, desc: { en: 'Business users and dashboards reading the gold layer through Redshift.', es: 'Usuarios de negocio y tableros que leen la capa oro vía Redshift.' } }
      ],
      edges: [
        { from: 'erp', to: 'ing', label: 'SFTP\nTLS', style: 'data', encrypted: true, data: ['pii', 'confidential'], datasets: ['customers', 'orders', 'invoices'] },
        { from: 'ing', to: 'raw', label: 'CSV / JSON', style: 'data', encrypted: true, data: ['pii', 'confidential'], datasets: ['customers', 'orders', 'invoices'] },
        { from: 'raw', to: 'etl1', style: 'data', encrypted: true, data: ['pii', 'confidential'], datasets: ['customers', 'orders', 'invoices'] },
        { from: 'etl1', to: 'silver', label: 'Parquet', style: 'data', encrypted: true, data: ['confidential'], datasets: ['customers', 'orders', 'invoices'] },
        { from: 'silver', to: 'etl2', style: 'data', encrypted: true, data: ['confidential'], datasets: ['customers', 'orders', 'invoices'] },
        { from: 'etl2', to: 'gold', label: 'Parquet', style: 'data', encrypted: true, data: ['internal'], datasets: ['sales_daily', 'customer_360'] },
        { from: 'gold', to: 'rsa', label: 'COPY\nTLS', style: 'data', encrypted: true, data: ['internal'], datasets: ['sales_daily', 'customer_360'] },
        { from: 'rsa', to: 'rsb', label: 'Multi-AZ', both: true, encrypted: true, data: ['internal'] },
        { from: 'rsa', to: 'bi', label: 'JDBC\nno SSL', encrypted: false, data: ['confidential'], datasets: ['sales_daily', 'customer_360'] },
        { from: 'silver', to: 's3dr', label: 'CRR\nKMS', style: 'async', encrypted: true, data: ['confidential'], datasets: ['customers', 'orders', 'invoices'] },
        { from: 'gold', to: 's3dr', label: 'CRR\nKMS', style: 'async', encrypted: true, data: ['internal'], datasets: ['sales_daily', 'customer_360'] },
        { from: 'rsa', to: 'rsdr', label: 'Snapshot\ncross-region', style: 'async', encrypted: true, data: ['internal'] },
        { from: 's3dr', to: 'gluedr', label: { en: 'on failover', es: 'en failover' }, style: 'optional' },
        { from: 'gluedr', to: 'rsdr', label: { en: 'on failover', es: 'en failover' }, style: 'optional' },
        { from: 'raw', to: 'bk', label: 'Backup', style: 'async', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'gold', to: 'bk', label: 'Backup', style: 'async', encrypted: true, data: ['internal'] },
        { from: 'bk', to: 'vault', label: 'Copy\ncross-account\nKMS', style: 'async', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'kms', to: 'gold', label: 'KMS', style: 'optional' },
        { from: 'kms', to: 'rsa', label: 'KMS', style: 'optional' }
      ],
      notes: [
        { id: 'n1', x: 0, y: 330, w: 280, h: 190, color: 'menta', text: { en: 'LEVEL 1 · Multi-AZ\nRedshift AZ a/b, S3 across 3 AZ, Lambda in all AZ.\nRTO: minutes · RPO: ~0', es: 'NIVEL 1 · Multi-AZ\nRedshift AZ a/b, S3 en 3 AZ, Lambda en todas las AZ.\nRTO: minutos · RPO: ~0' } },
        { id: 'n2', x: 0, y: 540, w: 280, h: 190, color: 'cielo', text: { en: 'LEVEL 2 · S3 cross-region replication\nSilver and gold to us-west-2, encrypted with KMS.\nRTO: 1-2 h · RPO: ~15 min', es: 'NIVEL 2 · Replicación S3 entre regiones\nPlata y oro a us-west-2, cifrado con KMS.\nRTO: 1-2 h · RPO: ~15 min' } },
        { id: 'n3', x: 0, y: 750, w: 280, h: 190, color: 'melocoton', text: { en: 'LEVEL 3 · Pilot light in us-west-2\nGlue jobs off, Redshift restored from snapshot.\nRTO: 4-8 h · RPO: up to 8 h (snapshot frequency)', es: 'NIVEL 3 · Pilot light en us-west-2\nJobs de Glue apagados, Redshift restaurado desde snapshot.\nRTO: 4-8 h · RPO: hasta 8 h (frecuencia de snapshot)' } },
        { id: 'n4', x: 0, y: 960, w: 280, h: 190, color: 'coral', text: { en: 'LEVEL 4 · Separate backup account\nAWS Backup to an immutable vault (Vault Lock).\nRTO: 24 h+ · RPO: 24 h', es: 'NIVEL 4 · Cuenta de respaldo separada\nAWS Backup a una bóveda inmutable (Vault Lock).\nRTO: 24 h+ · RPO: 24 h' } }
      ],
      zones: [
        { id: 'z-bi', x: 3010, y: 290, w: 700, h: 190, label: { en: 'BI export without SSL', es: 'Exportación a BI sin SSL' }, severity: 'high', desc: { en: 'Analysts connect to Redshift over JDBC without enforced SSL and can export confidential data.', es: 'Los analistas conectan a Redshift por JDBC sin SSL obligatorio y pueden exportar datos confidenciales.' } },
        { id: 'z-dr', x: 1900, y: 950, w: 1130, h: 200, label: { en: 'DR failover not tested', es: 'Failover de DR sin probar' }, severity: 'low', desc: { en: 'The pilot light runbook has not been rehearsed in the last 12 months.', es: 'El runbook del pilot light no se ha ensayado en los últimos 12 meses.' } }
      ]
    }
  },
  {
    name: { en: 'Online shop · C4 levels', es: 'Tienda online · niveles C4' },
    desc: { en: 'System context, containers and components in one file, with architecture decisions (ADR).', es: 'Contexto del sistema, contenedores y componentes en un solo archivo, con decisiones de arquitectura (ADR).' },
    diagram: {
      title: { en: 'Online shop · C4 model', es: 'Tienda online · modelo C4' },
      meta: { author: { en: 'Architecture team', es: 'Equipo de arquitectura' }, version: '1.0' },
      groups: [
        { id: 'gData', label: { en: 'Data', es: 'Datos' }, kind: 'logical', in: 'shop' }
      ],
      nodes: [
        { id: 'cust', label: { en: 'Customer', es: 'Cliente' }, type: 'user', c4: 'person', desc: { en: 'Buys products on the web or the mobile app.', es: 'Compra productos en la web o en la app móvil.' } },
        { id: 'shop', label: { en: 'Shop system', es: 'Sistema de tienda' }, type: 'web', c4: 'system', sub: 'E-commerce', desc: { en: 'Double-click (or Enter) to see its containers.', es: 'Doble clic (o Intro) para ver sus contenedores.' } },
        { id: 'pay', label: { en: 'Payment provider', es: 'Proveedor de pagos' }, type: 'external', c4: 'external', sub: 'Stripe' },
        { id: 'mail', label: { en: 'Email service', es: 'Servicio de correo' }, type: 'email', c4: 'external', sub: 'SES' },
        { id: 'erp', label: 'ERP', type: 'erp', c4: 'external', sub: { en: 'Stock and invoicing', es: 'Stock y facturación' } },

        { id: 'web', label: { en: 'Web front end', es: 'Front end web' }, type: 'web', c4: 'container', sub: 'React · CloudFront', in: 'shop' },
        { id: 'api', label: 'API', type: 'gateway', c4: 'container', sub: 'Node.js · ECS', in: 'shop', cost: 180, desc: { en: 'Double-click to see its components.', es: 'Doble clic para ver sus componentes.' } },
        { id: 'db', label: { en: 'Orders DB', es: 'BD de pedidos' }, type: 'db', c4: 'container', sub: 'PostgreSQL · RDS', in: 'shop', group: 'gData', data: ['pii'], cost: 240, backup: true, team: { en: 'Checkout', es: 'Checkout' }, owner: 'Lucía Méndez' },
        { id: 'queue', label: { en: 'Order events', es: 'Eventos de pedidos' }, type: 'queue', c4: 'container', sub: 'SQS', in: 'shop', group: 'gData', cost: 5 },
        { id: 'worker', label: { en: 'Fulfilment worker', es: 'Worker de despacho' }, type: 'function', c4: 'container', sub: 'Lambda', in: 'shop', cost: 20 },

        { id: 'ctl', label: { en: 'Orders controller', es: 'Controlador de pedidos' }, type: 'function', c4: 'component', sub: 'REST', in: 'api' },
        { id: 'svc', label: { en: 'Order service', es: 'Servicio de pedidos' }, type: 'compute', c4: 'component', in: 'api' },
        { id: 'repo', label: { en: 'Order repository', es: 'Repositorio de pedidos' }, type: 'compute', c4: 'component', in: 'api' },
        { id: 'payc', label: { en: 'Payment client', es: 'Cliente de pagos' }, type: 'external', c4: 'component', in: 'api' }
      ],
      edges: [
        { from: 'cust', to: 'shop', label: { en: 'Browses and buys', es: 'Navega y compra' } },
        { from: 'shop', to: 'pay', label: { en: 'Charges cards', es: 'Cobra con tarjeta' }, encrypted: true, data: ['pci'] },
        { from: 'shop', to: 'mail', label: { en: 'Sends emails', es: 'Envía correos' }, style: 'async' },
        { from: 'shop', to: 'erp', label: { en: 'Syncs stock', es: 'Sincroniza stock' }, style: 'async' },

        { from: 'cust', to: 'web', label: 'HTTPS', encrypted: true },
        { from: 'web', to: 'api', label: 'JSON / HTTPS', encrypted: true },
        { from: 'api', to: 'db', label: 'SQL', encrypted: true, data: ['pii'] },
        { from: 'api', to: 'queue', label: { en: 'OrderPlaced', es: 'PedidoCreado' }, style: 'async' },
        { from: 'queue', to: 'worker', style: 'async' },
        { from: 'api', to: 'pay', label: 'REST', encrypted: true, data: ['pci'] },
        { from: 'worker', to: 'mail', label: 'SMTP', style: 'async' },
        { from: 'worker', to: 'erp', label: 'SOAP', style: 'async' },

        { from: 'ctl', to: 'svc' },
        { from: 'svc', to: 'repo' },
        { from: 'svc', to: 'payc' }
      ],
      decisions: [
        { id: 'ADR-001', title: { en: 'Split the shop into a web front end and an API', es: 'Separar la tienda en front end web y API' }, status: 'accepted', date: '2026-06-02', deciders: { en: 'Architecture board', es: 'Comité de arquitectura' },
          context: { en: 'The monolith couples UI releases to backend releases and cannot scale them separately.', es: 'El monolito ata las versiones de la interfaz a las del backend y no permite escalarlas por separado.' },
          decision: { en: 'Serve the React front end from CloudFront and expose a stateless API on ECS.', es: 'Servir el front end React desde CloudFront y exponer una API sin estado en ECS.' },
          consequences: { en: 'Independent deploys and scaling; we now need API versioning and CORS rules.', es: 'Despliegues y escalado independientes; ahora hace falta versionar la API y reglas CORS.' },
          links: { nodes: ['web', 'api'] } },
        { id: 'ADR-002', title: { en: 'Process fulfilment asynchronously with a queue', es: 'Procesar el despacho de forma asíncrona con una cola' }, status: 'proposed', date: '2026-09-20',
          context: { en: 'Email and ERP calls slow down checkout and fail when those systems are down.', es: 'Las llamadas al correo y al ERP ralentizan el pago y fallan cuando esos sistemas no responden.' },
          decision: { en: 'Publish an OrderPlaced event to SQS and handle email and ERP sync in a Lambda worker.', es: 'Publicar un evento PedidoCreado en SQS y resolver el correo y el ERP en un worker Lambda.' },
          consequences: { en: 'Faster checkout; eventual consistency and a dead-letter queue to monitor.', es: 'Pago más rápido; consistencia eventual y una cola de mensajes fallidos que vigilar.' },
          links: { nodes: ['queue', 'worker'] } }
      ]
    }
  },
  {
    name: { en: 'Lakehouse greenfield · decision kit', es: 'Lakehouse greenfield · kit de decisiones' },
    desc: { en: 'Cloud-agnostic starting point for a new data lakehouse, with the backlog of decisions (ADR) to take with the client.', es: 'Punto de partida sin nube definida para un lakehouse nuevo, con el backlog de decisiones (ADR) a tomar con el cliente.' },
    diagram: {
      title: { en: 'Lakehouse greenfield · starter architecture', es: 'Lakehouse greenfield · arquitectura inicial' },
      meta: { author: { en: 'Architecture team', es: 'Equipo de arquitectura' }, version: '0.1' },
      groups: [
        { id: 'gSrc',  label: { en: 'Sources', es: 'Fuentes' }, color: 'cielo', kind: 'logical', team: { en: 'Business IT', es: 'TI de negocio' } },
        { id: 'gIng',  label: { en: 'Ingestion', es: 'Ingesta' }, color: 'lila', kind: 'logical', team: { en: 'Data engineering', es: 'Ingeniería de datos' }, owner: { en: 'To be assigned', es: 'Por asignar' } },
        { id: 'gLake', label: { en: 'Lakehouse storage', es: 'Almacenamiento lakehouse' }, color: 'limon', kind: 'logical', team: { en: 'Data platform', es: 'Plataforma de datos' }, owner: { en: 'To be assigned', es: 'Por asignar' } },
        { id: 'lBr',   label: { en: 'Bronze · raw', es: 'Bronce · crudo' }, color: 'melocoton', kind: 'logical', parent: 'gLake', layer: 'bronze' },
        { id: 'lSi',   label: { en: 'Silver · curated', es: 'Plata · curado' }, color: 'lavanda', kind: 'logical', parent: 'gLake', layer: 'silver' },
        { id: 'lGo',   label: { en: 'Gold · serving', es: 'Oro · consumo' }, color: 'limon', kind: 'logical', parent: 'gLake', layer: 'gold' },
        { id: 'gProc', label: { en: 'Transformation and orchestration', es: 'Transformación y orquestación' }, color: 'menta', kind: 'logical', team: { en: 'Data engineering', es: 'Ingeniería de datos' } },
        { id: 'gServ', label: { en: 'Serving', es: 'Consumo' }, color: 'coral', kind: 'logical', team: { en: 'Analytics', es: 'Analítica' } },
        { id: 'gGov',  label: { en: 'Governance, security and operations', es: 'Gobierno, seguridad y operaciones' }, color: 'rosa', kind: 'logical', team: { en: 'Data governance', es: 'Gobierno de datos' } }
      ],
      nodes: [
        { id: 'erp',   label: 'ERP', type: 'erp', group: 'gSrc', sub: { en: 'Finance, orders', es: 'Finanzas, pedidos' }, data: ['confidential'], owner: { en: 'To be assigned', es: 'Por asignar' }, x: 0, y: 40, desc: { en: 'Core business system. Confirm vendor, version and export options with the client.', es: 'Sistema central del negocio. Confirmar con el cliente proveedor, versión y opciones de exportación.' } },
        { id: 'crm',   label: 'CRM', type: 'erp', group: 'gSrc', sub: { en: 'Customers', es: 'Clientes' }, data: ['pii'], owner: { en: 'To be assigned', es: 'Por asignar' }, x: 0, y: 190, desc: { en: 'Customer records: personal data from the first load.', es: 'Registros de clientes: datos personales desde la primera carga.' } },
        { id: 'opdb',  label: { en: 'Operational database', es: 'Base operacional' }, type: 'db', group: 'gSrc', sub: { en: 'Transactional', es: 'Transaccional' }, data: ['pii', 'confidential'], owner: { en: 'To be assigned', es: 'Por asignar' }, x: 0, y: 340, desc: { en: 'Application database; candidate for change data capture.', es: 'Base de datos de una aplicación; candidata para captura de cambios.' } },
        { id: 'files', label: { en: 'Files and exports', es: 'Archivos y exportaciones' }, type: 'storage', group: 'gSrc', sub: 'CSV · JSON · Excel', data: ['internal'], x: 0, y: 490, desc: { en: 'Partner files, spreadsheets and SaaS exports.', es: 'Archivos de socios, hojas de cálculo y exportaciones de SaaS.' } },
        { id: 'evt',   label: { en: 'Apps and IoT events', es: 'Eventos de apps e IoT' }, type: 'external', group: 'gSrc', sub: { en: 'Event producers', es: 'Productores de eventos' }, data: ['internal'], x: 0, y: 640, desc: { en: 'Only needed if streaming is confirmed.', es: 'Solo hace falta si se confirma el streaming.' } },

        { id: 'ingb',  label: { en: 'Batch ingestion', es: 'Ingesta batch' }, type: 'compute', group: 'gIng', sub: { en: 'Scheduled loads', es: 'Cargas programadas' }, data: ['pii', 'confidential'], x: 380, y: 100, desc: { en: 'Loads ERP, CRM and files into the raw layer.', es: 'Carga ERP, CRM y archivos en la capa cruda.' } },
        { id: 'ingc',  label: { en: 'CDC ingestion', es: 'Ingesta CDC' }, type: 'compute', group: 'gIng', sub: { en: 'Change data capture', es: 'Captura de cambios' }, data: ['pii', 'confidential'], x: 380, y: 340, desc: { en: 'Captures inserts, updates and deletes from operational databases.', es: 'Captura inserciones, actualizaciones y borrados de las bases operacionales.' } },
        { id: 'ings',  label: { en: 'Streaming ingestion', es: 'Ingesta streaming' }, type: 'stream', group: 'gIng', sub: { en: 'Optional', es: 'Opcional' }, data: ['internal'], x: 380, y: 640, desc: { en: 'Event backbone. May be left out of phase 1.', es: 'Columna vertebral de eventos. Puede quedar fuera de la fase 1.' } },

        { id: 'bronze', label: { en: 'Raw tables', es: 'Tablas crudas' }, type: 'storage', group: 'lBr', sub: { en: 'Open table format', es: 'Formato de tabla abierto' }, data: ['pii', 'confidential'], x: 760, y: 150, desc: { en: 'Immutable copy of what was received, kept for reprocessing and audit.', es: 'Copia inmutable de lo recibido, para reprocesar y auditar.' } },
        { id: 'silver', label: { en: 'Curated tables', es: 'Tablas curadas' }, type: 'storage', group: 'lSi', sub: { en: 'Cleaned, conformed', es: 'Limpias, conformadas' }, data: ['pii', 'confidential'], x: 760, y: 350, desc: { en: 'Deduplicated, typed and conformed data. Decide where personal data is masked.', es: 'Datos deduplicados, tipados y conformados. Decidir dónde se enmascaran los datos personales.' } },
        { id: 'gold',   label: { en: 'Business models', es: 'Modelos de negocio' }, type: 'storage', group: 'lGo', sub: { en: 'Marts and metrics', es: 'Data marts y métricas' }, data: ['internal'], x: 760, y: 550, desc: { en: 'Aggregated, business-ready tables.', es: 'Tablas agregadas, listas para el negocio.' } },

        { id: 'transf', label: { en: 'Transformation', es: 'Transformación' }, type: 'analytics', group: 'gProc', sub: { en: 'SQL / Spark / declarative', es: 'SQL / Spark / declarativo' }, data: ['pii', 'confidential'], x: 1140, y: 350, desc: { en: 'Builds silver and gold from the layer below.', es: 'Construye plata y oro a partir de la capa anterior.' } },
        { id: 'orch',   label: { en: 'Orchestration', es: 'Orquestación' }, type: 'compute', group: 'gProc', sub: { en: 'Schedules and monitors', es: 'Programa y monitorea' }, x: 1140, y: 100, desc: { en: 'Runs, retries and monitors every pipeline.', es: 'Ejecuta, reintenta y monitorea cada pipeline.' } },

        { id: 'sqlwh', label: { en: 'SQL warehouse', es: 'Almacén SQL' }, type: 'analytics', group: 'gServ', sub: { en: 'Query engine for BI', es: 'Motor de consultas para BI' }, data: ['internal'], x: 1520, y: 400, desc: { en: 'Serves gold tables to analysts and tools.', es: 'Sirve las tablas oro a analistas y herramientas.' } },
        { id: 'sem',   label: { en: 'Semantic layer', es: 'Capa semántica' }, type: 'analytics', group: 'gServ', sub: { en: 'Shared metrics', es: 'Métricas compartidas' }, data: ['internal'], x: 1520, y: 550, desc: { en: 'One definition per business metric.', es: 'Una definición por métrica de negocio.' } },

        { id: 'bi',   label: { en: 'BI and reporting', es: 'BI y reportes' }, type: 'user', sub: { en: 'Business users', es: 'Usuarios de negocio' }, x: 1900, y: 400, desc: { en: 'Dashboards and self-service analysis.', es: 'Tableros y análisis de autoservicio.' } },
        { id: 'ds',   label: { en: 'Data science and ML', es: 'Ciencia de datos y ML' }, type: 'ai', sub: { en: 'Notebooks, models', es: 'Notebooks, modelos' }, data: ['internal'], x: 1900, y: 550, desc: { en: 'Reads curated and gold data.', es: 'Lee datos curados y oro.' } },
        { id: 'apps', label: { en: 'Applications and APIs', es: 'Aplicaciones y APIs' }, type: 'web', sub: { en: 'Data products', es: 'Productos de datos' }, x: 1900, y: 700, desc: { en: 'Operational apps that consume data products.', es: 'Aplicaciones operacionales que consumen productos de datos.' } },

        { id: 'catalog', label: { en: 'Catalog and governance', es: 'Catálogo y gobierno' }, type: 'generic', group: 'gGov', sub: { en: 'Lineage, ownership, permissions', es: 'Linaje, responsables, permisos' }, x: 760, y: 800, desc: { en: 'Where tables, owners, lineage and permissions are managed.', es: 'Donde se gestionan tablas, responsables, linaje y permisos.' } },
        { id: 'dq',      label: { en: 'Data quality', es: 'Calidad de datos' }, type: 'monitor', group: 'gGov', sub: { en: 'Checks and alerts', es: 'Controles y alertas' }, x: 1140, y: 800, desc: { en: 'Automated checks on critical datasets.', es: 'Controles automáticos sobre los datasets críticos.' } },
        { id: 'iam',     label: { en: 'Identity and access', es: 'Identidad y acceso' }, type: 'auth', group: 'gGov', sub: { en: 'SSO, roles, masking', es: 'SSO, roles, enmascaramiento' }, x: 760, y: 950, desc: { en: 'Corporate identity provider and access policies.', es: 'Proveedor de identidad corporativo y políticas de acceso.' } },
        { id: 'kms',     label: { en: 'Keys and secrets', es: 'Claves y secretos' }, type: 'secrets', group: 'gGov', sub: { en: 'Encryption', es: 'Cifrado' }, x: 1140, y: 950, desc: { en: 'Encryption keys and credentials for pipelines.', es: 'Claves de cifrado y credenciales de los pipelines.' } },
        { id: 'cicd',    label: 'CI/CD · IaC', type: 'cicd', group: 'gGov', sub: { en: 'Environments, releases', es: 'Ambientes, despliegues' }, x: 1520, y: 950, desc: { en: 'Infrastructure as code and release pipelines.', es: 'Infraestructura como código y pipelines de despliegue.' } },
        { id: 'obs',     label: { en: 'Monitoring and cost', es: 'Monitoreo y costos' }, type: 'monitor', group: 'gGov', sub: { en: 'Operations, FinOps', es: 'Operación, FinOps' }, x: 1900, y: 950, desc: { en: 'Platform health, usage and cost visibility.', es: 'Salud de la plataforma, uso y visibilidad de costos.' } }
      ],
      edges: [
        { from: 'erp', to: 'ingb', label: 'Batch', style: 'batch', encrypted: true, data: ['confidential'] },
        { from: 'crm', to: 'ingb', label: 'Batch', style: 'batch', encrypted: true, data: ['pii'] },
        { from: 'files', to: 'ingb', label: { en: 'Files', es: 'Archivos' }, style: 'batch', encrypted: true, data: ['internal'] },
        { from: 'opdb', to: 'ingc', label: 'CDC', style: 'stream', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'evt', to: 'ings', label: { en: 'Events', es: 'Eventos' }, style: 'stream', encrypted: true, data: ['internal'] },
        { from: 'ingb', to: 'bronze', style: 'data', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'ingc', to: 'bronze', style: 'data', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'ings', to: 'bronze', style: 'stream', encrypted: true, data: ['internal'] },
        { from: 'bronze', to: 'silver', label: { en: 'clean · conform', es: 'limpiar · conformar' }, style: 'data', encrypted: true, data: ['pii', 'confidential'] },
        { from: 'silver', to: 'gold', label: { en: 'model', es: 'modelar' }, style: 'data', encrypted: true, data: ['internal'] },
        { from: 'transf', to: 'silver', label: { en: 'builds', es: 'construye' }, style: 'control' },
        { from: 'transf', to: 'gold', label: { en: 'builds', es: 'construye' }, style: 'control' },
        { from: 'orch', to: 'ingb', label: { en: 'schedules', es: 'programa' }, style: 'control' },
        { from: 'orch', to: 'transf', label: { en: 'schedules', es: 'programa' }, style: 'control' },
        { from: 'gold', to: 'sqlwh', style: 'data', encrypted: true, data: ['internal'] },
        { from: 'sqlwh', to: 'sem', style: 'data', encrypted: true, data: ['internal'] },
        { from: 'sem', to: 'bi', label: 'SQL', encrypted: true, data: ['internal'] },
        { from: 'gold', to: 'ds', style: 'data', encrypted: true, data: ['internal'] },
        { from: 'sqlwh', to: 'apps', label: 'API', encrypted: true, data: ['internal'] },
        { from: 'catalog', to: 'silver', label: { en: 'governs', es: 'gobierna' }, style: 'optional' },
        { from: 'dq', to: 'silver', label: { en: 'checks', es: 'verifica' }, style: 'optional' },
        { from: 'iam', to: 'catalog', label: { en: 'access', es: 'acceso' }, style: 'optional' },
        { from: 'kms', to: 'bronze', label: { en: 'encrypts', es: 'cifra' }, style: 'optional' },
        { from: 'cicd', to: 'orch', label: { en: 'deploys', es: 'despliega' }, style: 'optional' },
        { from: 'obs', to: 'orch', label: { en: 'monitors', es: 'monitorea' }, style: 'optional' }
      ],
      notes: [
        { id: 'n1', x: 0, y: -190, w: 340, h: 130, color: 'limon', text: { en: 'Undecided: cloud and platform.\nSee ADR-001 and ADR-002. Icons stay generic until they are decided.', es: 'Sin decidir: nube y plataforma.\nVer ADR-001 y ADR-002. Los iconos son genéricos hasta decidirlos.' } },
        { id: 'n2', x: 380, y: -190, w: 340, h: 130, color: 'limon', text: { en: 'Undecided: how data is ingested.\nSee ADR-006 (batch), ADR-007 (CDC) and ADR-008 (streaming, maybe not in phase 1).', es: 'Sin decidir: cómo se ingieren los datos.\nVer ADR-006 (batch), ADR-007 (CDC) y ADR-008 (streaming, quizá no en la fase 1).' } },
        { id: 'n3', x: 760, y: -190, w: 340, h: 130, color: 'limon', text: { en: 'Undecided: table format and layers.\nSee ADR-003 and ADR-004. PII is expected in raw and curated.', es: 'Sin decidir: formato de tabla y capas.\nVer ADR-003 y ADR-004. Se espera PII en las capas cruda y curada.' } },
        { id: 'n4', x: 1140, y: -190, w: 340, h: 130, color: 'limon', text: { en: 'Undecided: transformation and orchestration.\nSee ADR-009 and ADR-010.', es: 'Sin decidir: transformación y orquestación.\nVer ADR-009 y ADR-010.' } },
        { id: 'n5', x: 1520, y: -190, w: 340, h: 130, color: 'limon', text: { en: 'Undecided: serving and semantic layer.\nSee ADR-012.', es: 'Sin decidir: consumo y capa semántica.\nVer ADR-012.' } },
        { id: 'n6', x: 760, y: 1100, w: 700, h: 110, color: 'rosa', text: { en: 'Undecided: governance and operations.\nCatalog ADR-005 · quality ADR-011 · access ADR-013 · network and keys ADR-014 · IaC and CI/CD ADR-015 · operating model ADR-016 · FinOps ADR-017.', es: 'Sin decidir: gobierno y operaciones.\nCatálogo ADR-005 · calidad ADR-011 · acceso ADR-013 · red y claves ADR-014 · IaC y CI/CD ADR-015 · modelo operativo ADR-016 · FinOps ADR-017.' } }
      ],
      decisions: (() => { const kit = (window.DIAGRAMON_ADR_KITS || []).find(k => k.id === 'lakehouse'); return kit ? kit.decisions.map((d, i) => ({ id: 'ADR-' + String(i + 1).padStart(3, '0'), status: 'proposed', date: '2026-10-07', criteria: d.criteria || kit.criteria, ...d })) : []; })(),
      // Lo que saldría de un descubrimiento real (todos en borrador: se acuerdan con el cliente). Los controles (check) se evalúan al pasar a «acordado» y
      // cuando el diagrama tiene los datos (SLA, regiones, costos): ahora cifrado de PII ya se puede comprobar.
      requirements: [
        { id: 'REQ-001', title: { en: 'BI dashboards refresh at least every hour', es: 'Los tableros de BI se actualizan al menos cada hora' }, kind: 'nfr', priority: 'must', status: 'draft', source: { en: 'Head of BI', es: 'Jefe de BI' },
          detail: { en: 'Data freshness for business users: a source change is visible in the dashboards within one hour. Confirm which dashboards are in scope.', es: 'Frescura de datos para el negocio: un cambio en el origen se ve en los tableros en menos de una hora. Confirmar qué tableros entran en el alcance.' },
          links: { decisions: ['ADR-006', 'ADR-007', 'ADR-012'], nodes: ['ingb', 'ingc', 'sqlwh', 'bi'] } },
        { id: 'REQ-002', title: { en: 'Personal data stays in the EU', es: 'Los datos personales se quedan en la UE' }, kind: 'constraint', priority: 'must', status: 'draft', source: 'CISO',
          detail: { en: 'No copy of personal data (customers, CRM) may be stored or processed outside the EU. Set a region on the components once the cloud is chosen.', es: 'Ninguna copia de datos personales (clientes, CRM) puede almacenarse ni procesarse fuera de la UE. Define la región de los componentes cuando se elija la nube.' },
          check: { metric: 'residency', cls: 'pii', jur: 'eu' }, links: { decisions: ['ADR-001', 'ADR-014'], nodes: ['bronze', 'silver'] } },
        { id: 'REQ-003', title: { en: 'Personal data is encrypted in transit', es: 'Los datos personales viajan cifrados' }, kind: 'constraint', priority: 'must', status: 'draft', source: { en: 'CISO', es: 'CISO' },
          check: { metric: 'encryption', cls: 'pii' }, links: { decisions: ['ADR-014'], nodes: ['kms'] } },
        { id: 'REQ-004', title: { en: 'Serving layer available 99.9% of the time', es: 'La capa de consumo disponible el 99,9 % del tiempo' }, kind: 'nfr', priority: 'should', status: 'draft', source: { en: 'Head of BI', es: 'Jefe de BI' },
          detail: { en: 'From the gold tables to the BI tools. Fill in component SLAs to let the check compute it.', es: 'Desde las tablas oro hasta las herramientas de BI. Completa los SLA de los componentes para que el control lo calcule.' },
          check: { metric: 'availability', from: 'gold', to: 'bi', target: 99.9 }, links: { decisions: ['ADR-012'], nodes: ['sqlwh', 'sem'] } },
        { id: 'REQ-005', title: { en: 'The lake loses at most 4 hours of data on a failure', es: 'El lake pierde como máximo 4 horas de datos ante una falla' }, kind: 'nfr', priority: 'should', status: 'draft', source: { en: 'Data owner', es: 'Dueño de los datos' },
          check: { metric: 'rpo', from: 'ingb', to: 'bronze', target: 4 }, links: { decisions: ['ADR-004'], nodes: ['bronze'] } },
        { id: 'REQ-006', title: { en: 'Platform run cost under the agreed ceiling', es: 'El costo de operar la plataforma queda bajo el tope acordado' }, kind: 'constraint', priority: 'must', status: 'draft', source: 'CFO',
          detail: { en: 'Monthly ceiling to be agreed. Add component costs and set the target in the check.', es: 'Tope mensual por acordar. Agrega los costos de los componentes y fija el objetivo en el control.' },
          check: { metric: 'cost' }, links: { decisions: ['ADR-017'], nodes: ['obs'] } },
        { id: 'REQ-007', title: { en: 'Open formats, no lock-in to a single vendor', es: 'Formatos abiertos, sin dependencia de un solo proveedor' }, kind: 'principle', priority: 'should', status: 'draft', source: { en: 'Architecture board', es: 'Comité de arquitectura' },
          links: { decisions: ['ADR-002', 'ADR-003'], nodes: ['bronze', 'silver', 'gold'] } },
        { id: 'REQ-008', title: { en: 'Built for a team that works in SQL and Python', es: 'Pensado para un equipo que trabaja en SQL y Python' }, kind: 'principle', priority: 'could', status: 'draft', source: { en: 'Head of data engineering', es: 'Jefe de ingeniería de datos' },
          links: { decisions: ['ADR-009', 'ADR-016'] } }
      ]
    }
  }
];
