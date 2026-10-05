/* ==========================================================================
   Diagramon · plantillas de ejemplo
   Cada plantilla usa el mismo formato JSON que el editor.
   Los nodos sin x/y se colocan solos (orden automático).
   ========================================================================== */
window.DIAGRAMON_EXAMPLES = [
  {
    name: 'Web app en AWS (3 capas)',
    desc: 'CDN, balanceador, instancias, caché, base de datos y tareas en una VPC.',
    diagram: {
      title: 'Web app en AWS · 3 capas',
      groups: [
        { id: 'aws',  label: 'AWS · eu-west-1', color: 'melocoton' },
        { id: 'vpc',  label: 'VPC 10.0.0.0/16', color: 'cielo', parent: 'aws' },
        { id: 'pub',  label: 'Subred pública',  color: 'menta', parent: 'vpc' },
        { id: 'priv', label: 'Subred privada',  color: 'lavanda', parent: 'vpc' }
      ],
      nodes: [
        { id: 'users',  label: 'Usuarios',       type: 'user',     sub: 'Web y móvil',          x: 0,    y: 200, desc: 'Clientes que acceden por navegador o app.' },
        { id: 'dns',    label: 'Route 53',       type: 'dns', icon: 'aws/route53',      sub: 'DNS',                  group: 'aws', x: 280, y: 56,  desc: 'Resuelve el dominio hacia CloudFront.' },
        { id: 'cdn',    label: 'CloudFront',     type: 'cdn', icon: 'aws/cloudfront',      sub: 'CDN global',           group: 'aws', x: 280, y: 200, desc: 'Sirve contenido estático y enruta /api al balanceador.' },
        { id: 's3',     label: 'S3',             type: 'storage', icon: 'aws/s3',  sub: 'Activos estáticos',    group: 'aws', x: 280, y: 344, desc: 'HTML, JS, CSS e imágenes.' },
        { id: 'cw',     label: 'CloudWatch',     type: 'monitor', icon: 'aws/cloudwatch',  sub: 'Métricas y logs',      group: 'aws', x: 280, y: 520, desc: 'Alarmas, paneles y registros.' },
        { id: 'alb',    label: 'Application LB', type: 'lb', icon: 'aws/elb',       sub: 'HTTPS :443',           group: 'pub', x: 584, y: 200, desc: 'Reparte el tráfico entre zonas de disponibilidad.' },
        { id: 'app1',   label: 'EC2 · App',      type: 'compute', icon: 'aws/ec2',  sub: 'Auto Scaling · AZ a',  group: 'priv', badge: 'x2', x: 880, y: 120, desc: 'Servidores de aplicación en la zona a.' },
        { id: 'app2',   label: 'EC2 · App',      type: 'compute', icon: 'aws/ec2',  sub: 'Auto Scaling · AZ b',  group: 'priv', badge: 'x2', x: 880, y: 280, desc: 'Servidores de aplicación en la zona b.' },
        { id: 'cache',  label: 'ElastiCache',    type: 'cache', icon: 'aws/elasticache',    sub: 'Redis',                group: 'priv', x: 1184, y: 40,  desc: 'Sesiones y lecturas frecuentes.' },
        { id: 'rds',    label: 'RDS PostgreSQL', type: 'db', icon: 'aws/rds',       sub: 'Multi-AZ',             group: 'priv', x: 1184, y: 200, desc: 'Base de datos principal con réplica en espera.' },
        { id: 'sqs',    label: 'SQS',            type: 'queue', icon: 'aws/sqs',    sub: 'Cola de tareas',       group: 'priv', x: 1184, y: 360, desc: 'Desacopla el trabajo pesado.' },
        { id: 'worker', label: 'Lambda Worker',  type: 'function', icon: 'aws/lambda', sub: 'Procesa tareas',       group: 'priv', x: 1488, y: 360, desc: 'Consume la cola y envía correos.' },
        { id: 'ses',    label: 'SES',            type: 'email', icon: 'aws/ses',    sub: 'Correo transaccional', group: 'aws', x: 1488, y: 520, desc: 'Confirmaciones y avisos por email.' }
      ],
      edges: [
        { from: 'users', to: 'dns', label: 'DNS' },
        { from: 'users', to: 'cdn', label: 'HTTPS' },
        { from: 'cdn', to: 's3', label: 'estáticos' },
        { from: 'cdn', to: 'alb', label: '/api' },
        { from: 'alb', to: 'app1' },
        { from: 'alb', to: 'app2' },
        { from: 'app1', to: 'cache' },
        { from: 'app1', to: 'rds', label: 'SQL' },
        { from: 'app2', to: 'rds', label: 'SQL' },
        { from: 'app2', to: 'sqs', label: 'tareas', style: 'async' },
        { from: 'sqs', to: 'worker', style: 'async' },
        { from: 'worker', to: 'ses', label: 'email' },
        { from: 'alb', to: 'cw', label: 'métricas', style: 'optional' }
      ]
    }
  },
  {
    name: 'Serverless por eventos',
    desc: 'API, funciones, DynamoDB, EventBridge e IA. Colocado con orden automático.',
    diagram: {
      title: 'Plataforma serverless orientada a eventos',
      groups: [],
      nodes: [
        { id: 'web',     label: 'App web',          type: 'web',       sub: 'React SPA' },
        { id: 'mobile',  label: 'App móvil',        type: 'mobile',    sub: 'iOS / Android' },
        { id: 'apigw',   label: 'API Gateway',      type: 'gateway',   sub: 'REST + WebSocket' },
        { id: 'cognito', label: 'Cognito',          type: 'auth',      sub: 'Valida JWT' },
        { id: 'fnapi',   label: 'Lambda API',       type: 'function',  sub: 'Node.js' },
        { id: 'ddb',     label: 'DynamoDB',         type: 'nosql',     sub: 'Tabla única' },
        { id: 'llm',     label: 'Bedrock',          type: 'ai',        sub: 'Resúmenes con IA' },
        { id: 'fnproc',  label: 'Lambda procesador',type: 'function',  sub: 'DynamoDB Streams' },
        { id: 'bus',     label: 'EventBridge',      type: 'events',    sub: 'Bus de dominio' },
        { id: 'fnmail',  label: 'Lambda avisos',    type: 'function' },
        { id: 'ses',     label: 'SES',              type: 'email',     sub: 'Emails' },
        { id: 'lake',    label: 'Data lake S3',     type: 'storage',   sub: 'Parquet' },
        { id: 'athena',  label: 'Athena',           type: 'analytics', sub: 'SQL ad hoc' }
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
        { from: 'bus', to: 'lake', label: 'archivo', style: 'async' },
        { from: 'fnmail', to: 'ses' },
        { from: 'lake', to: 'athena', style: 'data' }
      ]
    }
  },
  {
    name: 'Microservicios en GKE',
    desc: 'Kubernetes en Google Cloud con datos gestionados y pagos externos.',
    diagram: {
      title: 'Tienda online · microservicios en GKE',
      groups: [
        { id: 'gcp', label: 'Google Cloud', color: 'cielo' },
        { id: 'gke', label: 'Clúster GKE', color: 'menta', parent: 'gcp' },
        { id: 'ns',  label: 'namespace: tienda', color: 'lavanda', parent: 'gke' }
      ],
      nodes: [
        { id: 'client',   label: 'Clientes',        type: 'web',       sub: 'Navegador',        x: 0,    y: 200 },
        { id: 'armor',    label: 'Cloud Armor',     type: 'firewall', icon: 'gcp/cloudarmor',  sub: 'WAF + LB global',  group: 'gcp', x: 280,  y: 200 },
        { id: 'ingress',  label: 'Ingress NGINX',   type: 'gateway',   sub: 'TLS',              group: 'gke', x: 568,  y: 200 },
        { id: 'front',    label: 'frontend',        type: 'container', sub: 'Next.js',          group: 'ns', badge: 'x3', x: 864, y: 56 },
        { id: 'catalog',  label: 'catálogo',        type: 'container', sub: 'Go',               group: 'ns', badge: 'x2', x: 864, y: 200 },
        { id: 'orders',   label: 'pedidos',         type: 'container', sub: 'Java',             group: 'ns', badge: 'x2', x: 864, y: 344 },
        { id: 'payments', label: 'pagos',           type: 'container', sub: 'Python',           group: 'ns', x: 1160, y: 344 },
        { id: 'sql',      label: 'Cloud SQL',       type: 'db', icon: 'gcp/cloudsql',        sub: 'PostgreSQL HA',    group: 'gcp', x: 1464, y: 40 },
        { id: 'redis',    label: 'Memorystore',     type: 'cache', icon: 'gcp/memorystore',     sub: 'Redis',            group: 'gcp', x: 1464, y: 200 },
        { id: 'pubsub',   label: 'Pub/Sub',         type: 'events', icon: 'gcp/pubsub',    sub: 'pedido.creado',    group: 'gcp', x: 1160, y: 520 },
        { id: 'bq',       label: 'BigQuery',        type: 'analytics', icon: 'gcp/bigquery', sub: 'Ventas',           group: 'gcp', x: 1464, y: 520 },
        { id: 'stripe',   label: 'Stripe',          type: 'external',  sub: 'Pasarela de pago', x: 1768, y: 344 }
      ],
      edges: [
        { from: 'client', to: 'armor', label: 'HTTPS' },
        { from: 'armor', to: 'ingress' },
        { from: 'ingress', to: 'front', label: '/' },
        { from: 'ingress', to: 'catalog', label: '/api/catalogo' },
        { from: 'ingress', to: 'orders', label: '/api/pedidos' },
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
