/* ==========================================================================
   Diagramon · plantillas de ejemplo
   Cada plantilla usa el mismo formato JSON que el editor.
   Los nodos sin x/y se colocan solos (orden automático).
   Cualquier texto puede ser { en: '…', es: '…' }: se usa el del idioma activo.
   ========================================================================== */
window.DIAGRAMON_EXAMPLES = [
  {
    name: { en: 'Web app on AWS (3 tiers)', es: 'Web app en AWS (3 capas)' },
    desc: { en: 'CDN, load balancer, instances, cache, database and jobs inside a VPC.', es: 'CDN, balanceador, instancias, caché, base de datos y tareas en una VPC.' },
    diagram: {
      title: { en: 'Web app on AWS · 3 tiers', es: 'Web app en AWS · 3 capas' },
      groups: [
        { id: 'aws',  label: 'AWS · eu-west-1', color: 'melocoton' },
        { id: 'vpc',  label: 'VPC 10.0.0.0/16', color: 'cielo', parent: 'aws' },
        { id: 'pub',  label: { en: 'Public subnet', es: 'Subred pública' },  color: 'menta', parent: 'vpc' },
        { id: 'priv', label: { en: 'Private subnet', es: 'Subred privada' }, color: 'lavanda', parent: 'vpc' }
      ],
      nodes: [
        { id: 'users',  label: { en: 'Users', es: 'Usuarios' }, type: 'user', sub: { en: 'Web and mobile', es: 'Web y móvil' }, x: 0, y: 200, desc: { en: 'Customers using a browser or the app.', es: 'Clientes que acceden por navegador o app.' } },
        { id: 'dns',    label: 'Route 53',       type: 'dns', icon: 'aws/route53',        sub: 'DNS', group: 'aws', x: 336, y: 56,  desc: { en: 'Resolves the domain to CloudFront.', es: 'Resuelve el dominio hacia CloudFront.' } },
        { id: 'cdn',    label: 'CloudFront',     type: 'cdn', icon: 'aws/cloudfront',     sub: { en: 'Global CDN', es: 'CDN global' }, group: 'aws', x: 336, y: 200, desc: { en: 'Serves static content and routes /api to the load balancer.', es: 'Sirve contenido estático y enruta /api al balanceador.' } },
        { id: 's3',     label: 'S3',             type: 'storage', icon: 'aws/s3',         sub: { en: 'Static assets', es: 'Activos estáticos' }, group: 'aws', x: 336, y: 344, desc: { en: 'HTML, JS, CSS and images.', es: 'HTML, JS, CSS e imágenes.' } },
        { id: 'cw',     label: 'CloudWatch',     type: 'monitor', icon: 'aws/cloudwatch', sub: { en: 'Metrics and logs', es: 'Métricas y logs' }, group: 'aws', x: 336, y: 520, desc: { en: 'Alarms, dashboards and logs.', es: 'Alarmas, paneles y registros.' } },
        { id: 'alb',    label: 'Application LB', type: 'lb', icon: 'aws/elb',             sub: 'HTTPS :443', group: 'pub', x: 696, y: 200, desc: { en: 'Spreads traffic across availability zones.', es: 'Reparte el tráfico entre zonas de disponibilidad.' } },
        { id: 'app1',   label: 'EC2 · App',      type: 'compute', icon: 'aws/ec2',        sub: 'Auto Scaling · AZ a', group: 'priv', badge: 'x2', x: 1048, y: 120, desc: { en: 'Application servers in zone a.', es: 'Servidores de aplicación en la zona a.' } },
        { id: 'app2',   label: 'EC2 · App',      type: 'compute', icon: 'aws/ec2',        sub: 'Auto Scaling · AZ b', group: 'priv', badge: 'x2', x: 1048, y: 280, desc: { en: 'Application servers in zone b.', es: 'Servidores de aplicación en la zona b.' } },
        { id: 'cache',  label: 'ElastiCache',    type: 'cache', icon: 'aws/elasticache',  sub: 'Redis', group: 'priv', x: 1408, y: 40,  desc: { en: 'Sessions and hot reads.', es: 'Sesiones y lecturas frecuentes.' } },
        { id: 'rds',    label: 'RDS PostgreSQL', type: 'db', icon: 'aws/rds',             sub: 'Multi-AZ', group: 'priv', x: 1408, y: 200, desc: { en: 'Main database with a standby replica.', es: 'Base de datos principal con réplica en espera.' } },
        { id: 'sqs',    label: 'SQS',            type: 'queue', icon: 'aws/sqs',          sub: { en: 'Job queue', es: 'Cola de tareas' }, group: 'priv', x: 1408, y: 360, desc: { en: 'Decouples heavy work.', es: 'Desacopla el trabajo pesado.' } },
        { id: 'worker', label: 'Lambda Worker',  type: 'function', icon: 'aws/lambda',    sub: { en: 'Runs jobs', es: 'Procesa tareas' }, group: 'priv', x: 1768, y: 360, desc: { en: 'Reads the queue and sends emails.', es: 'Consume la cola y envía correos.' } },
        { id: 'ses',    label: 'SES',            type: 'email', icon: 'aws/ses',          sub: { en: 'Transactional email', es: 'Correo transaccional' }, group: 'aws', x: 1768, y: 520, desc: { en: 'Confirmations and email alerts.', es: 'Confirmaciones y avisos por email.' } }
      ],
      edges: [
        { from: 'users', to: 'dns', label: 'DNS' },
        { from: 'users', to: 'cdn', label: 'HTTPS' },
        { from: 'cdn', to: 's3', label: { en: 'static', es: 'estáticos' } },
        { from: 'cdn', to: 'alb', label: '/api' },
        { from: 'alb', to: 'app1' },
        { from: 'alb', to: 'app2' },
        { from: 'app1', to: 'cache' },
        { from: 'app1', to: 'rds', label: 'SQL' },
        { from: 'app2', to: 'rds', label: 'SQL' },
        { from: 'app2', to: 'sqs', label: { en: 'jobs', es: 'tareas' }, style: 'async' },
        { from: 'sqs', to: 'worker', style: 'async' },
        { from: 'worker', to: 'ses', label: 'email' },
        { from: 'alb', to: 'cw', label: { en: 'metrics', es: 'métricas' }, style: 'optional' }
      ]
    }
  },
  {
    name: { en: 'Event-driven serverless', es: 'Serverless por eventos' },
    desc: { en: 'API, functions, DynamoDB, EventBridge and AI. Placed by auto-arrange.', es: 'API, funciones, DynamoDB, EventBridge e IA. Colocado con orden automático.' },
    diagram: {
      title: { en: 'Event-driven serverless platform', es: 'Plataforma serverless orientada a eventos' },
      groups: [],
      nodes: [
        { id: 'web',     label: { en: 'Web app', es: 'App web' },          type: 'web',       sub: 'React SPA' },
        { id: 'mobile',  label: { en: 'Mobile app', es: 'App móvil' },     type: 'mobile',    sub: 'iOS / Android' },
        { id: 'apigw',   label: 'API Gateway',                             type: 'gateway',   sub: 'REST + WebSocket' },
        { id: 'cognito', label: 'Cognito',                                 type: 'auth',      sub: { en: 'Validates JWT', es: 'Valida JWT' } },
        { id: 'fnapi',   label: 'Lambda API',                              type: 'function',  sub: 'Node.js' },
        { id: 'ddb',     label: 'DynamoDB',                                type: 'nosql',     sub: { en: 'Single table', es: 'Tabla única' } },
        { id: 'llm',     label: 'Bedrock',                                 type: 'ai',        sub: { en: 'AI summaries', es: 'Resúmenes con IA' } },
        { id: 'fnproc',  label: { en: 'Lambda processor', es: 'Lambda procesador' }, type: 'function', sub: 'DynamoDB Streams' },
        { id: 'bus',     label: 'EventBridge',                             type: 'events',    sub: { en: 'Domain bus', es: 'Bus de dominio' } },
        { id: 'fnmail',  label: { en: 'Lambda notifier', es: 'Lambda avisos' }, type: 'function' },
        { id: 'ses',     label: 'SES',                                     type: 'email',     sub: 'Emails' },
        { id: 'lake',    label: { en: 'S3 data lake', es: 'Data lake S3' }, type: 'storage',  sub: 'Parquet' },
        { id: 'athena',  label: 'Athena',                                  type: 'analytics', sub: { en: 'Ad hoc SQL', es: 'SQL ad hoc' } }
      ],
      edges: [
        { from: 'web', to: 'apigw', label: 'HTTPS' },
        { from: 'mobile', to: 'apigw', label: 'HTTPS' },
        { from: 'apigw', to: 'cognito', label: 'token', style: 'optional' },
        { from: 'apigw', to: 'fnapi' },
        { from: 'fnapi', to: 'ddb', style: 'data' },
        { from: 'fnapi', to: 'llm', label: 'prompt' },
        { from: 'ddb', to: 'fnproc', label: 'stream', style: 'async' },
        { from: 'fnproc', to: 'bus', style: 'async' },
        { from: 'bus', to: 'fnmail', style: 'async' },
        { from: 'bus', to: 'lake', label: { en: 'archive', es: 'archivo' }, style: 'async' },
        { from: 'fnmail', to: 'ses' },
        { from: 'lake', to: 'athena', style: 'data' }
      ]
    }
  },
  {
    name: { en: 'Microservices on GKE', es: 'Microservicios en GKE' },
    desc: { en: 'Kubernetes on Google Cloud with managed data and external payments.', es: 'Kubernetes en Google Cloud con datos gestionados y pagos externos.' },
    diagram: {
      title: { en: 'Online store · microservices on GKE', es: 'Tienda online · microservicios en GKE' },
      groups: [
        { id: 'gcp', label: 'Google Cloud', color: 'cielo' },
        { id: 'gke', label: { en: 'GKE cluster', es: 'Clúster GKE' }, color: 'menta', parent: 'gcp' },
        { id: 'ns',  label: { en: 'namespace: store', es: 'namespace: tienda' }, color: 'lavanda', parent: 'gke' }
      ],
      nodes: [
        { id: 'client',   label: { en: 'Customers', es: 'Clientes' }, type: 'web', sub: { en: 'Browser', es: 'Navegador' }, x: 0, y: 200 },
        { id: 'armor',    label: 'Cloud Armor',   type: 'firewall', icon: 'gcp/cloudarmor',  sub: { en: 'WAF + global LB', es: 'WAF + LB global' }, group: 'gcp', x: 336, y: 200 },
        { id: 'ingress',  label: 'Ingress NGINX', type: 'gateway',   sub: 'TLS',     group: 'gke', x: 680,  y: 200 },
        { id: 'front',    label: 'frontend',      type: 'container', sub: 'Next.js', group: 'ns', badge: 'x3', x: 1032, y: 56 },
        { id: 'catalog',  label: { en: 'catalog', es: 'catálogo' }, type: 'container', sub: 'Go', group: 'ns', badge: 'x2', x: 1032, y: 200 },
        { id: 'orders',   label: { en: 'orders', es: 'pedidos' },   type: 'container', sub: 'Java', group: 'ns', badge: 'x2', x: 1032, y: 344 },
        { id: 'payments', label: { en: 'payments', es: 'pagos' },   type: 'container', sub: 'Python', group: 'ns', x: 1384, y: 344 },
        { id: 'sql',      label: 'Cloud SQL',     type: 'db', icon: 'gcp/cloudsql',          sub: 'PostgreSQL HA', group: 'gcp', x: 1744, y: 40 },
        { id: 'redis',    label: 'Memorystore',   type: 'cache', icon: 'gcp/memorystore',    sub: 'Redis', group: 'gcp', x: 1744, y: 200 },
        { id: 'pubsub',   label: 'Pub/Sub',       type: 'events', icon: 'gcp/pubsub',        sub: { en: 'order.created', es: 'pedido.creado' }, group: 'gcp', x: 1384, y: 520 },
        { id: 'bq',       label: 'BigQuery',      type: 'analytics', icon: 'gcp/bigquery',   sub: { en: 'Sales', es: 'Ventas' }, group: 'gcp', x: 1744, y: 520 },
        { id: 'stripe',   label: 'Stripe',        type: 'external',  sub: { en: 'Payment gateway', es: 'Pasarela de pago' }, x: 2104, y: 344 }
      ],
      edges: [
        { from: 'client', to: 'armor', label: 'HTTPS' },
        { from: 'armor', to: 'ingress' },
        { from: 'ingress', to: 'front', label: '/' },
        { from: 'ingress', to: 'catalog', label: { en: '/api/catalog', es: '/api/catalogo' } },
        { from: 'ingress', to: 'orders', label: { en: '/api/orders', es: '/api/pedidos' } },
        { from: 'front', to: 'catalog' },
        { from: 'catalog', to: 'redis' },
        { from: 'catalog', to: 'sql', label: 'SQL' },
        { from: 'orders', to: 'sql', label: 'SQL' },
        { from: 'orders', to: 'payments', label: 'gRPC' },
        { from: 'orders', to: 'pubsub', style: 'async' },
        { from: 'pubsub', to: 'bq', style: 'data' },
        { from: 'payments', to: 'stripe', label: 'API' }
      ]
    }
  }
];
