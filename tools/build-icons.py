#!/usr/bin/env python3
"""
Diagramon · empaqueta los iconos oficiales de AWS, Azure, Google Cloud, SAP y Microsoft Fabric.

Lee los paquetes oficiales ya descomprimidos y escribe icons/aws.js,
icons/azure.js, icons/gcp.js, icons/sap.js e icons/fabric.js. Esos archivos funcionan al abrir index.html
con doble clic (sin servidor) y viajan dentro de las exportaciones SVG/PNG.

Uso:
    python3 tools/build-icons.py <carpeta>

<carpeta> debe contener las carpetas descomprimidas:
    aws/       Icon-package_*.zip              (aws.amazon.com/architecture/icons)
    azure/     Azure_Public_Service_Icons_*.zip (learn.microsoft.com/azure/architecture/icons)
    gcp-core/  core-products-icons.zip          (cloud.google.com/icons)
    gcp-cat/   category-icons.zip               (cloud.google.com/icons)
    sap/       assets/shape-libraries-and-editable-presets/svg
               de github.com/SAP/btp-solution-diagrams
    fabric/    package/dist/svg de Icons.zip
               (github.com/microsoft/fabric-samples, carpeta docs-samples)

Si falta la carpeta de una nube, esa nube se salta y su archivo no se toca.

Para añadir un servicio, añade una línea a la lista de su nube y vuelve a
ejecutar el script. Para incluir TODOS los iconos de una nube, pon
ALL = True: se añaden los que no estén en la lista, con su nombre de archivo.

Solo usa la biblioteca estándar de Python.
"""
import base64
import json
import os
import re
import sys

ALL = False  # True = incluir todos los iconos, no solo la selección
SHORT = {'gcp': 'GCP', 'sap': 'SAP', 'fabric': 'Fabric'}  # nombre corto para la pestaña del panel

# Palabras clave de búsqueda por icono ('proveedor/clave'): alias, qué es, motores y equivalentes en otras nubes (es + en)
KEYWORDS = {
    # AWS
    'aws/ec2': 'vm virtual machine maquina virtual servidor server compute instance instancia cpu',
    'aws/autoscaling': 'autoscale scale escalado automatico elasticidad vmss',
    'aws/lambda': 'function funcion serverless faas sin servidor cloud functions azure functions codigo evento',
    'aws/ecs': 'container contenedor docker orchestration orquestacion',
    'aws/eks': 'k8s kubernetes container contenedor aks gke cluster',
    'aws/fargate': 'serverless container contenedor docker sin servidor cloud run',
    'aws/apprunner': 'container contenedor web app serverless cloud run docker',
    'aws/ecr': 'container registry registro contenedores docker imagen image acr artifact registry',
    'aws/beanstalk': 'paas web app aplicacion despliegue deploy app service',
    'aws/lightsail': 'vps hosting servidor simple vm',
    'aws/batch': 'job trabajo lotes batch processing hpc cola',
    'aws/s3': 'bucket object storage almacenamiento objetos blob cloud storage archivos files',
    'aws/glacier': 'archive archivo frio cold storage backup almacenamiento',
    'aws/ebs': 'disk disco block storage bloques volumen volume managed disk persistent disk',
    'aws/efs': 'nfs file system archivos compartido shared filestore almacenamiento',
    'aws/fsx': 'file system archivos windows smb lustre netapp ontap almacenamiento',
    'aws/backup': 'copia de seguridad respaldo restore recuperacion disaster recovery',
    'aws/rds': 'sql postgres postgresql mysql mariadb oracle sqlserver relational database base de datos relacional cloud sql',
    'aws/aurora': 'sql postgres postgresql mysql relational database base de datos relacional alloydb',
    'aws/dynamodb': 'dynamo nosql key value clave valor database base de datos documento cosmos firestore bigtable',
    'aws/elasticache': 'redis memcached cache memoria memory in-memory memorystore',
    'aws/memorydb': 'redis cache memory memoria database base de datos in-memory durable',
    'aws/documentdb': 'mongodb mongo nosql document documento database base de datos json cosmos',
    'aws/neptune': 'graph grafo database base de datos gremlin sparql neo4j',
    'aws/redshift': 'data warehouse almacen de datos analytics analitica sql olap bigquery synapse',
    'aws/athena': 'sql query consulta serverless analytics analitica s3 presto lakehouse',
    'aws/glue': 'etl data integration integracion de datos catalog catalogo spark pipeline data factory',
    'aws/emr': 'hadoop spark big data cluster hive presto dataproc hdinsight',
    'aws/opensearch': 'elasticsearch elastic search busqueda logs kibana lucene',
    'aws/lakeformation': 'data lake lago de datos governance gobierno permisos',
    'aws/kinesis': 'stream streaming flujo tiempo real real-time kafka event hubs data streams',
    'aws/firehose': 'stream streaming delivery ingesta ingestion kinesis etl',
    'aws/msk': 'kafka stream streaming mensajeria messaging broker event hubs',
    'aws/vpc': 'network red virtual private cloud vnet subnet vlan networking',
    'aws/cloudfront': 'cdn content delivery edge cache distribucion contenido front door',
    'aws/route53': 'dns domain dominio nombres resolver name server',
    'aws/elb': 'load balancer balanceador de carga alb nlb gwlb balanceo reverse proxy',
    'aws/apigateway': 'api rest http gateway puerta de enlace endpoint apim apigee',
    'aws/directconnect': 'dedicated connection conexion dedicada hybrid hibrido expressroute interconnect vpn',
    'aws/transitgateway': 'hub routing enrutamiento peering network red vpn',
    'aws/privatelink': 'private endpoint endpoint privado service connect conexion privada',
    'aws/globalaccelerator': 'anycast global network latency latencia acelerador traffic manager',
    'aws/sqs': 'queue cola mensajes message messaging mensajeria fifo service bus',
    'aws/sns': 'pub sub publish subscribe notification notificacion push topic tema email sms',
    'aws/eventbridge': 'event bus eventos events scheduler programador rules reglas event grid eventarc',
    'aws/stepfunctions': 'workflow flujo de trabajo orchestration orquestacion state machine logic apps',
    'aws/mq': 'rabbitmq activemq broker message queue cola mensajeria amqp mqtt',
    'aws/appsync': 'graphql api realtime tiempo real',
    'aws/ses': 'email correo mail smtp send envio',
    'aws/iam': 'identity access identidad acceso permisos roles users usuarios policy politica rbac',
    'aws/cognito': 'auth authentication autenticacion login user pool usuarios oauth oidc sso b2c identity',
    'aws/kms': 'key encryption cifrado claves cmk hsm cryptography criptografia',
    'aws/secretsmanager': 'secret secreto password contrasena credentials credenciales key vault',
    'aws/acm': 'certificate certificado ssl tls https',
    'aws/waf': 'web application firewall firewall cortafuegos seguridad security owasp',
    'aws/shield': 'ddos protection proteccion security seguridad',
    'aws/guardduty': 'threat detection deteccion amenazas security seguridad siem',
    'aws/cloudwatch': 'monitoring monitorizacion metrics metricas logs alarms alarmas observability observabilidad',
    'aws/cloudtrail': 'audit auditoria log registro api calls governance',
    'aws/xray': 'tracing trazas apm distributed observability observabilidad performance',
    'aws/systemsmanager': 'ssm operations operaciones patch parameter store parametros',
    'aws/cloudformation': 'iac infrastructure as code infraestructura como codigo template plantilla terraform bicep',
    'aws/codepipeline': 'cicd ci cd pipeline continuous delivery entrega continua devops deploy',
    'aws/codebuild': 'ci build compilar compilacion devops pipeline cloud build',
    'aws/bedrock': 'ai ia llm genai generative generativa foundation model modelo claude gpt openai',
    'aws/sagemaker': 'ml machine learning aprendizaje automatico training entrenamiento notebook ai ia vertex',
    'aws/q': 'ai ia assistant asistente copilot chatbot genai',
    'aws/rekognition': 'vision image imagen face reconocimiento facial computer vision ai ia',
    'aws/textract': 'ocr document documento extraction extraccion text texto form recognizer ai ia',
    # Azure
    'azure/vm': 'virtual machine maquina virtual servidor server compute instance ec2 compute engine',
    'azure/vmss': 'scale set autoscale escalado automatico virtual machines maquinas virtuales autoscaling',
    'azure/appservice': 'web app webapp paas aplicacion web hosting beanstalk app engine',
    'azure/functions': 'function funcion serverless faas sin servidor lambda cloud functions codigo evento',
    'azure/aks': 'k8s kubernetes container contenedor eks gke cluster',
    'azure/containerapps': 'container contenedor serverless cloud run fargate kubernetes docker',
    'azure/aci': 'container instances contenedor docker serverless fargate',
    'azure/acr': 'container registry registro contenedores docker imagen image ecr artifact registry',
    'azure/batch': 'job trabajo lotes batch processing hpc',
    'azure/staticapps': 'static web estatico frontend spa hosting jamstack',
    'azure/storage': 'storage account cuenta almacenamiento blob bucket s3 files queue table',
    'azure/blob': 'bucket object storage almacenamiento objetos s3 cloud storage archivos files',
    'azure/files': 'file share smb nfs archivos compartido efs filestore almacenamiento',
    'azure/disks': 'disk disco managed disk block storage bloques volumen volume ebs persistent disk',
    'azure/datalake': 'data lake lago de datos adls analytics analitica hadoop',
    'azure/netapp': 'file system archivos nfs smb ontap almacenamiento fsx',
    'azure/recovery': 'backup copia de seguridad respaldo disaster recovery recuperacion site recovery vault',
    'azure/sqldb': 'sql sqlserver sql server relational database base de datos relacional rds cloud sql',
    'azure/sqlmi': 'sql managed instance sqlserver sql server relational base de datos relacional rds',
    'azure/postgresql': 'postgres sql relational database base de datos relacional rds aurora cloud sql',
    'azure/mysql': 'sql mariadb relational database base de datos relacional rds cloud sql',
    'azure/cosmosdb': 'cosmos nosql document documento mongodb database base de datos dynamodb firestore globally distributed',
    'azure/redis': 'cache memoria memory in-memory elasticache memorystore',
    'azure/synapse': 'data warehouse almacen de datos analytics analitica sql spark redshift bigquery',
    'azure/databricks': 'spark lakehouse big data delta ml analytics analitica notebook',
    'azure/datafactory': 'etl data integration integracion de datos pipeline orquestacion glue adf',
    'azure/dataexplorer': 'kusto kql adx analytics analitica logs time series series temporales',
    'azure/streamanalytics': 'stream streaming flujo tiempo real real-time analytics analitica kinesis dataflow',
    'azure/powerbi': 'bi business intelligence dashboard informes reports visualizacion looker',
    'azure/vnet': 'network red virtual network vpc subnet networking',
    'azure/subnet': 'network red subred vnet vpc cidr',
    'azure/loadbalancer': 'load balancer balanceador de carga balanceo elb alb nlb l4',
    'azure/appgateway': 'application gateway load balancer balanceador de carga l7 reverse proxy waf ingress',
    'azure/frontdoor': 'cdn edge global load balancer balanceador cloudfront',
    'azure/cdn': 'content delivery network edge cache distribucion contenido cloudfront',
    'azure/dns': 'domain dominio nombres resolver name server route 53',
    'azure/trafficmanager': 'dns traffic balancer balanceo global routing enrutamiento failover',
    'azure/firewall': 'cortafuegos seguridad security network red filtrado nat',
    'azure/nsg': 'network security group firewall cortafuegos reglas rules security group seguridad acl',
    'azure/vpngateway': 'vpn tunnel tunel site to site hybrid hibrido ipsec',
    'azure/expressroute': 'dedicated connection conexion dedicada hybrid hibrido direct connect interconnect',
    'azure/privateendpoint': 'private link endpoint privado conexion privada privatelink',
    'azure/bastion': 'jump host ssh rdp acceso remoto remote access seguro',
    'azure/apim': 'api management gestion apis gateway puerta de enlace rest apigee',
    'azure/waf': 'web application firewall firewall cortafuegos seguridad security owasp',
    'azure/servicebus': 'queue cola topic message messaging mensajeria broker amqp sqs rabbitmq',
    'azure/eventhubs': 'kafka stream streaming ingesta ingestion tiempo real real-time kinesis msk',
    'azure/eventgrid': 'event eventos pubsub pub sub routing eventbridge eventarc',
    'azure/logicapps': 'workflow flujo de trabajo automation automatizacion low code integration integracion step functions',
    'azure/storagequeue': 'queue cola messaging mensajeria sqs',
    'azure/signalr': 'websocket realtime tiempo real push notificacion chat',
    'azure/communication': 'email sms chat voice voz video acs correo',
    'azure/managedidentity': 'identity identidad service principal rbac iam credentials sin contrasena',
    'azure/b2c': 'auth authentication autenticacion login user usuarios oauth oidc sso customer identity cognito entra',
    'azure/keyvault': 'secret secreto key claves certificate certificado encryption cifrado password kms secrets manager',
    'azure/defender': 'security seguridad threat amenazas cspm cloud posture siem',
    'azure/sentinel': 'siem soar security seguridad threat amenazas log analytics',
    'azure/monitor': 'monitoring monitorizacion metrics metricas alerts alertas observability observabilidad cloudwatch',
    'azure/appinsights': 'apm application insights tracing trazas telemetry telemetria performance observability',
    'azure/loganalytics': 'logs registros kql workspace query consulta observability observabilidad',
    'azure/devops': 'cicd ci cd pipeline repos git boards continuous delivery entrega continua',
    'azure/openai': 'gpt llm genai generative generativa ai ia chatgpt bedrock',
    'azure/foundry': 'ai ia llm genai generative generativa agents agentes studio',
    'azure/ml': 'machine learning aprendizaje automatico training entrenamiento ai ia sagemaker vertex',
    'azure/aiservices': 'cognitive ai ia vision speech voz language lenguaje api',
    'azure/aisearch': 'search busqueda cognitive vector rag elasticsearch opensearch indice index',
    # GCP
    'gcp/computeengine': 'vm virtual machine maquina virtual servidor server gce instance instancia ec2',
    'gcp/gke': 'k8s kubernetes container contenedor eks aks cluster',
    'gcp/cloudrun': 'container contenedor serverless sin servidor docker fargate knative',
    'gcp/aihypercomputer': 'ai ia gpu tpu training entrenamiento hpc supercomputer',
    'gcp/cloudstorage': 'gcs bucket object storage almacenamiento objetos s3 blob archivos files',
    'gcp/hyperdisk': 'disk disco persistent disk block storage bloques volumen volume ebs',
    'gcp/cloudsql': 'sql postgres postgresql mysql sqlserver sql server relational database base de datos relacional rds',
    'gcp/alloydb': 'postgres postgresql sql relational database base de datos relacional aurora',
    'gcp/spanner': 'sql relational database base de datos relacional distributed global distribuida newsql',
    'gcp/bigquery': 'bq sql data warehouse almacen de datos analytics analitica olap redshift synapse',
    'gcp/looker': 'bi business intelligence dashboard informes reports visualizacion semantic',
    'gcp/apigee': 'api management gestion apis gateway puerta de enlace apim',
    'gcp/vertexai': 'ml machine learning aprendizaje automatico ai ia llm genai gemini training entrenamiento sagemaker',
    'gcp/anthos': 'kubernetes k8s hybrid hibrido multicloud multinube container contenedor fleet',
    'gcp/distributedcloud': 'edge hybrid hibrido on premises on-prem local anthos',
    'gcp/secops': 'security seguridad siem soar chronicle threat amenazas',
    'gcp/scc': 'security command center seguridad posture cspm vulnerabilidades',
    'gcp/threatintel': 'security seguridad threat amenazas intelligence inteligencia',
    'gcp/mandiant': 'security seguridad threat amenazas incident response incidentes',
    'gcp/cloudfunctions': 'function funcion serverless faas sin servidor lambda azure functions codigo evento',
    'gcp/appengine': 'paas web app aplicacion web hosting serverless app service beanstalk',
    'gcp/batch': 'job trabajo lotes batch processing hpc',
    'gcp/artifactregistry': 'container registry registro contenedores docker imagen image paquetes packages ecr acr',
    'gcp/cloudbuild': 'ci build compilar compilacion cicd pipeline devops codebuild',
    'gcp/clouddeploy': 'cd continuous delivery entrega continua deploy despliegue release pipeline',
    'gcp/filestore': 'nfs file system archivos compartido shared efs azure files almacenamiento',
    'gcp/firestore': 'nosql document documento database base de datos json mongodb dynamodb cosmos',
    'gcp/bigtable': 'nosql wide column columnar database base de datos hbase cassandra dynamodb',
    'gcp/memorystore': 'redis memcached cache memoria memory in-memory elasticache',
    'gcp/pubsub': 'pub sub publish subscribe messaging mensajeria queue cola topic tema streaming sns sqs kafka',
    'gcp/dataflow': 'beam stream streaming batch etl pipeline procesamiento tiempo real',
    'gcp/dataproc': 'hadoop spark big data cluster hive emr',
    'gcp/composer': 'airflow workflow orquestacion orchestration dag pipeline',
    'gcp/lookerstudio': 'bi dashboard informes reports visualizacion data studio',
    'gcp/eventarc': 'event eventos routing trigger disparador eventbridge event grid',
    'gcp/workflows': 'workflow flujo de trabajo orchestration orquestacion step functions logic apps',
    'gcp/apigateway': 'api rest gateway puerta de enlace endpoint apim',
    'gcp/cloudtasks': 'queue cola task tarea async asincrono job',
    'gcp/loadbalancing': 'load balancer balanceador de carga balanceo elb alb lb',
    'gcp/cloudcdn': 'cdn content delivery edge cache distribucion contenido cloudfront',
    'gcp/clouddns': 'dns domain dominio nombres resolver name server route 53',
    'gcp/cloudarmor': 'waf web application firewall firewall cortafuegos ddos security seguridad',
    'gcp/vpc': 'network red virtual private cloud vnet subnet networking',
    'gcp/cloudnat': 'nat gateway salida internet egress network red',
    'gcp/interconnect': 'dedicated connection conexion dedicada hybrid hibrido direct connect expressroute vpn',
    'gcp/iam': 'identity access identidad acceso permisos roles users usuarios policy politica rbac',
    'gcp/kms': 'key encryption cifrado claves cmk hsm cryptography criptografia',
    'gcp/secretmanager': 'secret secreto password contrasena credentials credenciales key vault',
    'gcp/identityplatform': 'auth authentication autenticacion login user usuarios oauth oidc sso cognito firebase',
    'gcp/logging': 'logs registros observability observabilidad cloudwatch',
    'gcp/monitoring': 'metrics metricas alerts alertas observability observabilidad cloudwatch',
    'gcp/gemini': 'ai ia llm genai generative generativa assistant asistente model modelo',
    'gcp/documentai': 'ocr document documento extraction extraccion text texto form recognizer textract ai ia',
    'gcp/agents': 'ai ia agent agente llm genai chatbot',
    'gcp/workspace': 'gmail docs sheets drive productivity productividad office correo email',
    'gcp/maps': 'geo geospatial geoespacial location ubicacion mapa map gis',
    # SAP BTP
    'sap/cloudfoundry': 'cf runtime paas container contenedor app aplicacion',
    'sap/kyma': 'k8s kubernetes serverless container contenedor function funcion',
    'sap/abap': 'abap cloud steampunk runtime',
    'sap/hanacloud': 'hana database base de datos sql in-memory memory vector analytics',
    'sap/objectstore': 'bucket s3 blob storage almacenamiento objetos archivos',
    'sap/datasphere': 'data warehouse almacen de datos analytics analitica federation',
    'sap/analyticscloud': 'sac bi dashboard informes reports planning planificacion',
    'sap/integrationsuite': 'integration integracion ipaas cpi api esb',
    'sap/cloudintegration': 'cpi ipaas integration integracion esb iflow',
    'sap/apimanagement': 'api gateway puerta de enlace rest apim',
    'sap/eventmesh': 'event eventos messaging mensajeria queue cola broker pubsub',
    'sap/advancedeventmesh': 'aem solace event eventos messaging mensajeria queue cola broker kafka',
    'sap/eventbroker': 'solace event eventos messaging mensajeria queue cola broker',
    'sap/jobscheduling': 'cron scheduler programador batch trabajo tarea',
    'sap/cloudconnector': 'hybrid hibrido on premises on-prem tunnel tunel vpn connectivity conectividad',
    'sap/privatelink': 'private endpoint endpoint privado conexion privada',
    'sap/xsuaa': 'auth authentication autenticacion oauth uaa roles authorization autorizacion',
    'sap/ias': 'sso login identity identidad authentication autenticacion idp',
    'sap/credentialstore': 'secret secreto password contrasena credentials credenciales vault',
    'sap/keystore': 'key certificate certificado claves encryption cifrado',
    'sap/auditlog': 'audit auditoria log registro compliance',
    'sap/aicore': 'ai ia ml machine learning llm genai generative generativa inference',
    'sap/joule': 'ai ia copilot assistant asistente llm agent agente',
    'sap/cloudlogging': 'logs registros observability observabilidad opensearch',
    'sap/applogging': 'logs registros observability observabilidad',
    'sap/cicd': 'ci cd pipeline devops continuous delivery entrega continua',
    # Fabric
    'fabric/onelake': 'data lake lago de datos storage almacenamiento delta parquet adls',
    'fabric/lakehouse': 'data lake lago de datos delta spark sql',
    'fabric/warehouse': 'data warehouse almacen de datos sql synapse analytics analitica',
    'fabric/sqldatabase': 'sql sqlserver sql server relational database base de datos relacional',
    'fabric/databases': 'sql database base de datos relational relacional',
    'fabric/datawarehouse': 'warehouse almacen de datos sql analytics analitica',
    'fabric/pipeline': 'etl data integration integracion de datos orquestacion data factory',
    'fabric/datafactory': 'etl data integration integracion de datos pipeline adf',
    'fabric/dataflow': 'etl power query transformacion transform',
    'fabric/notebook': 'spark python jupyter pyspark',
    'fabric/sparkjob': 'spark big data batch',
    'fabric/eventhouse': 'kusto kql real time tiempo real logs time series series temporales',
    'fabric/eventstream': 'stream streaming flujo kafka event hubs tiempo real real-time',
    'fabric/kqldatabase': 'kusto kql adx real time tiempo real logs',
    'fabric/realtime': 'streaming kusto kql tiempo real real-time eventos events',
    'fabric/powerbi': 'bi business intelligence dashboard informes reports visualizacion',
    'fabric/semanticmodel': 'dataset modelo semantico dax bi',
    'fabric/mlmodel': 'ml machine learning aprendizaje automatico ai ia model modelo',
    'fabric/experiment': 'ml machine learning aprendizaje automatico mlflow ai ia',
    'fabric/datascience': 'ml machine learning aprendizaje automatico ai ia python',
    'fabric/copilot': 'ai ia assistant asistente genai llm',
    'fabric/purview': 'governance gobierno catalog catalogo lineage linaje compliance',
    # Iconos de grupo (esquina del recuadro)
    'aws/group-cloud': 'aws cloud nube group grupo contenedor container boundary limite',
    'aws/group-cloudlogo': 'aws cloud logo nube group grupo contenedor',
    'aws/group-account': 'account cuenta aws account organization organizacion group grupo contenedor',
    'aws/group-region': 'region regiao zona geografica geography location ubicacion group grupo contenedor',
    'aws/group-vpc': 'vpc virtual private cloud red network vnet virtual network red virtual group grupo contenedor',
    'aws/group-publicsubnet': 'public subnet subred publica red network subnet igw internet group grupo contenedor',
    'aws/group-privatesubnet': 'private subnet subred privada red network subnet group grupo contenedor',
    'aws/group-autoscaling': 'auto scaling group asg escalado automatico grupo de escalado vmss group contenedor',
    'aws/group-datacenter': 'corporate data center centro de datos corporativo on premises on-prem local onprem group grupo contenedor',
    'aws/group-servercontents': 'server contents contenido del servidor on premises on-prem host group grupo contenedor',
    'aws/group-ec2contents': 'ec2 instance contents contenido de la instancia vm virtual machine maquina virtual group grupo contenedor',
    'aws/group-spotfleet': 'spot fleet flota spot ec2 compute group grupo contenedor',
    'aws/group-greengrass': 'iot greengrass deployment despliegue edge borde group grupo contenedor',
    'azure/group-managementgroup': 'management group grupo de administracion governance gobierno jerarquia hierarchy group grupo contenedor',
    'azure/group-subscription': 'subscription suscripcion cuenta account group grupo contenedor',
    'azure/group-resourcegroup': 'resource group grupo de recursos rg group grupo contenedor',
}

# Elementos que sirven de icono de grupo ('proveedor/clave'): se marcan con "group": true.
# Los de la categoría «Grupos» son iconos de ámbito del paquete oficial; el resto son iconos de servicio
# que las guías de la nube usan también como icono de recuadro (red virtual, subred, VPC, entornos de SAP).
GROUP_REFS = {
    'aws/group-cloud', 'aws/group-cloudlogo', 'aws/group-account', 'aws/group-region', 'aws/group-vpc',
    'aws/group-publicsubnet', 'aws/group-privatesubnet', 'aws/group-autoscaling', 'aws/group-datacenter',
    'aws/group-servercontents', 'aws/group-ec2contents', 'aws/group-spotfleet', 'aws/group-greengrass',
    'azure/group-managementgroup', 'azure/group-subscription', 'azure/group-resourcegroup',
    'azure/vnet', 'azure/subnet', 'gcp/vpc', 'sap/cloudfoundry', 'sap/kyma',
}

# Cada entrada: (clave, archivo a buscar, nombre visible, tipo de Diagramon, categoría)
# El tipo de Diagramon da el color pastel del borde; la categoría agrupa en el panel.
AWS = [
    ('ec2', 'Amazon-EC2', 'EC2', 'compute', 'Cómputo'),
    ('autoscaling', 'Amazon-EC2-Auto-Scaling', 'EC2 Auto Scaling', 'compute', 'Cómputo'),
    ('lambda', 'AWS-Lambda', 'Lambda', 'function', 'Cómputo'),
    ('ecs', 'Amazon-Elastic-Container-Service', 'ECS', 'container', 'Cómputo'),
    ('eks', 'Amazon-Elastic-Kubernetes-Service', 'EKS', 'k8s', 'Cómputo'),
    ('fargate', 'AWS-Fargate', 'Fargate', 'container', 'Cómputo'),
    ('apprunner', 'AWS-App-Runner', 'App Runner', 'container', 'Cómputo'),
    ('ecr', 'Amazon-Elastic-Container-Registry', 'ECR', 'storage', 'Cómputo'),
    ('beanstalk', 'AWS-Elastic-Beanstalk', 'Elastic Beanstalk', 'compute', 'Cómputo'),
    ('lightsail', 'Amazon-Lightsail', 'Lightsail', 'compute', 'Cómputo'),
    ('batch', 'AWS-Batch', 'Batch', 'compute', 'Cómputo'),
    ('s3', 'Amazon-Simple-Storage-Service', 'S3', 'storage', 'Almacenamiento'),
    ('glacier', 'Amazon-Simple-Storage-Service-Glacier', 'S3 Glacier', 'storage', 'Almacenamiento'),
    ('ebs', 'Amazon-Elastic-Block-Store', 'EBS', 'storage', 'Almacenamiento'),
    ('efs', 'Amazon-EFS', 'EFS', 'storage', 'Almacenamiento'),
    ('fsx', 'Amazon-FSx', 'FSx', 'storage', 'Almacenamiento'),
    ('backup', 'AWS-Backup', 'AWS Backup', 'storage', 'Almacenamiento'),
    ('rds', 'Amazon-RDS', 'RDS', 'db', 'Bases de datos'),
    ('aurora', 'Amazon-Aurora', 'Aurora', 'db', 'Bases de datos'),
    ('dynamodb', 'Amazon-DynamoDB', 'DynamoDB', 'nosql', 'Bases de datos'),
    ('elasticache', 'Amazon-ElastiCache', 'ElastiCache', 'cache', 'Bases de datos'),
    ('memorydb', 'Amazon-MemoryDB', 'MemoryDB', 'cache', 'Bases de datos'),
    ('documentdb', 'Amazon-DocumentDB', 'DocumentDB', 'nosql', 'Bases de datos'),
    ('neptune', 'Amazon-Neptune', 'Neptune', 'nosql', 'Bases de datos'),
    ('redshift', 'Amazon-Redshift', 'Redshift', 'analytics', 'Analítica'),
    ('athena', 'Amazon-Athena', 'Athena', 'analytics', 'Analítica'),
    ('glue', 'AWS-Glue', 'Glue', 'analytics', 'Analítica'),
    ('emr', 'Amazon-EMR', 'EMR', 'analytics', 'Analítica'),
    ('opensearch', 'Amazon-OpenSearch-Service', 'OpenSearch', 'analytics', 'Analítica'),
    ('lakeformation', 'AWS-Lake-Formation', 'Lake Formation', 'analytics', 'Analítica'),
    ('kinesis', 'Amazon-Kinesis-Data-Streams', 'Kinesis Data Streams', 'stream', 'Analítica'),
    ('firehose', 'Amazon-Data-Firehose', 'Data Firehose', 'stream', 'Analítica'),
    ('msk', 'Amazon-Managed-Streaming-for-Apache-Kafka', 'MSK (Kafka)', 'stream', 'Analítica'),
    ('vpc', 'Amazon-Virtual-Private-Cloud', 'VPC', 'firewall', 'Red'),
    ('cloudfront', 'Amazon-CloudFront', 'CloudFront', 'cdn', 'Red'),
    ('route53', 'Amazon-Route-53', 'Route 53', 'dns', 'Red'),
    ('elb', 'Elastic-Load-Balancing', 'Elastic Load Balancing', 'lb', 'Red'),
    ('apigateway', 'Amazon-API-Gateway', 'API Gateway', 'gateway', 'Red'),
    ('directconnect', 'AWS-Direct-Connect', 'Direct Connect', 'firewall', 'Red'),
    ('transitgateway', 'AWS-Transit-Gateway', 'Transit Gateway', 'lb', 'Red'),
    ('privatelink', 'AWS-PrivateLink', 'PrivateLink', 'firewall', 'Red'),
    ('globalaccelerator', 'AWS-Global-Accelerator', 'Global Accelerator', 'cdn', 'Red'),
    ('sqs', 'Amazon-Simple-Queue-Service', 'SQS', 'queue', 'Integración'),
    ('sns', 'Amazon-Simple-Notification-Service', 'SNS', 'events', 'Integración'),
    ('eventbridge', 'Amazon-EventBridge', 'EventBridge', 'events', 'Integración'),
    ('stepfunctions', 'AWS-Step-Functions', 'Step Functions', 'events', 'Integración'),
    ('mq', 'Amazon-MQ', 'Amazon MQ', 'queue', 'Integración'),
    ('appsync', 'AWS-AppSync', 'AppSync', 'gateway', 'Integración'),
    ('ses', 'Amazon-Simple-Email-Service', 'SES', 'email', 'Integración'),
    ('iam', 'AWS-Identity-and-Access-Management', 'IAM', 'auth', 'Seguridad'),
    ('cognito', 'Amazon-Cognito', 'Cognito', 'auth', 'Seguridad'),
    ('kms', 'AWS-Key-Management-Service', 'KMS', 'secrets', 'Seguridad'),
    ('secretsmanager', 'AWS-Secrets-Manager', 'Secrets Manager', 'secrets', 'Seguridad'),
    ('acm', 'AWS-Certificate-Manager', 'Certificate Manager', 'secrets', 'Seguridad'),
    ('waf', 'AWS-WAF', 'WAF', 'firewall', 'Seguridad'),
    ('shield', 'AWS-Shield', 'Shield', 'firewall', 'Seguridad'),
    ('guardduty', 'Amazon-GuardDuty', 'GuardDuty', 'auth', 'Seguridad'),
    ('cloudwatch', 'Amazon-CloudWatch', 'CloudWatch', 'monitor', 'Operaciones'),
    ('cloudtrail', 'AWS-CloudTrail', 'CloudTrail', 'monitor', 'Operaciones'),
    ('xray', 'AWS-X-Ray', 'X-Ray', 'monitor', 'Operaciones'),
    ('systemsmanager', 'AWS-Systems-Manager', 'Systems Manager', 'monitor', 'Operaciones'),
    ('cloudformation', 'AWS-CloudFormation', 'CloudFormation', 'cicd', 'Operaciones'),
    ('codepipeline', 'AWS-CodePipeline', 'CodePipeline', 'cicd', 'Operaciones'),
    ('codebuild', 'AWS-CodeBuild', 'CodeBuild', 'cicd', 'Operaciones'),
    ('bedrock', 'Amazon-Bedrock', 'Bedrock', 'ai', 'IA'),
    ('sagemaker', 'Amazon-SageMaker-AI', 'SageMaker AI', 'ai', 'IA'),
    ('q', 'Amazon-Q', 'Amazon Q', 'ai', 'IA'),
    ('rekognition', 'Amazon-Rekognition', 'Rekognition', 'ai', 'IA'),
    ('textract', 'Amazon-Textract', 'Textract', 'ai', 'IA'),
    # Iconos de grupo: Architecture-Group-Icons del paquete (nombre de archivo «Nombre_32.svg», se indexa como «Group-Nombre»)
    ('group-cloud', 'Group-AWS-Cloud', 'AWS Cloud', 'generic', 'Grupos'),
    ('group-cloudlogo', 'Group-AWS-Cloud-logo', 'AWS Cloud (logo)', 'generic', 'Grupos'),
    ('group-account', 'Group-AWS-Account', 'AWS Account', 'generic', 'Grupos'),
    ('group-region', 'Group-Region', 'Region', 'generic', 'Grupos'),
    ('group-vpc', 'Group-Virtual-private-cloud-VPC', 'Virtual private cloud (VPC)', 'firewall', 'Grupos'),
    ('group-publicsubnet', 'Group-Public-subnet', 'Public subnet', 'firewall', 'Grupos'),
    ('group-privatesubnet', 'Group-Private-subnet', 'Private subnet', 'firewall', 'Grupos'),
    ('group-autoscaling', 'Group-Auto-Scaling-group', 'Auto Scaling group', 'compute', 'Grupos'),
    ('group-datacenter', 'Group-Corporate-data-center', 'Corporate data center', 'external', 'Grupos'),
    ('group-servercontents', 'Group-Server-contents', 'Server contents', 'compute', 'Grupos'),
    ('group-ec2contents', 'Group-EC2-instance-contents', 'EC2 instance contents', 'compute', 'Grupos'),
    ('group-spotfleet', 'Group-Spot-Fleet', 'Spot Fleet', 'compute', 'Grupos'),
    ('group-greengrass', 'Group-AWS-IoT-Greengrass-Deployment', 'IoT Greengrass Deployment', 'compute', 'Grupos'),
]

AZURE = [
    ('vm', 'Virtual-Machine', 'Virtual Machine', 'compute', 'Cómputo'),
    ('vmss', 'VM-Scale-Sets', 'VM Scale Sets', 'compute', 'Cómputo'),
    ('appservice', 'App-Services', 'App Service', 'compute', 'Cómputo'),
    ('functions', 'Function-Apps', 'Functions', 'function', 'Cómputo'),
    ('aks', 'Kubernetes-Services', 'AKS', 'k8s', 'Cómputo'),
    ('containerapps', 'Container-Apps-Environments', 'Container Apps', 'container', 'Cómputo'),
    ('aci', 'Container-Instances', 'Container Instances', 'container', 'Cómputo'),
    ('acr', 'Container-Registries', 'Container Registry', 'storage', 'Cómputo'),
    ('batch', 'Batch-Accounts', 'Batch', 'compute', 'Cómputo'),
    ('staticapps', 'Static-Apps', 'Static Web Apps', 'web', 'Cómputo'),
    ('storage', 'Storage-Accounts', 'Storage Account', 'storage', 'Almacenamiento'),
    ('blob', 'Blob-Block', 'Blob Storage', 'storage', 'Almacenamiento'),
    ('files', 'Storage-Azure-Files', 'Azure Files', 'storage', 'Almacenamiento'),
    ('disks', 'Disks', 'Managed Disks', 'storage', 'Almacenamiento'),
    ('datalake', 'Data-Lake-Storage-Gen1', 'Data Lake Storage', 'storage', 'Almacenamiento'),
    ('netapp', 'Azure-NetApp-Files', 'NetApp Files', 'storage', 'Almacenamiento'),
    ('recovery', 'Recovery-Services-Vaults', 'Recovery Services', 'storage', 'Almacenamiento'),
    ('sqldb', 'SQL-Database', 'SQL Database', 'db', 'Bases de datos'),
    ('sqlmi', 'SQL-Managed-Instance', 'SQL Managed Instance', 'db', 'Bases de datos'),
    ('postgresql', 'Azure-Database-PostgreSQL-Server', 'PostgreSQL', 'db', 'Bases de datos'),
    ('mysql', 'Azure-Database-MySQL-Server', 'MySQL', 'db', 'Bases de datos'),
    ('cosmosdb', 'Azure-Cosmos-DB', 'Cosmos DB', 'nosql', 'Bases de datos'),
    ('redis', 'Cache-Redis', 'Cache for Redis', 'cache', 'Bases de datos'),
    ('synapse', 'Azure-Synapse-Analytics', 'Synapse Analytics', 'analytics', 'Analítica'),
    ('databricks', 'Azure-Databricks', 'Databricks', 'analytics', 'Analítica'),
    ('datafactory', 'Data-Factories', 'Data Factory', 'analytics', 'Analítica'),
    ('dataexplorer', 'Azure-Data-Explorer-Clusters', 'Data Explorer', 'analytics', 'Analítica'),
    ('streamanalytics', 'Stream-Analytics-Jobs', 'Stream Analytics', 'stream', 'Analítica'),
    ('powerbi', 'Power-BI-Embedded', 'Power BI Embedded', 'analytics', 'Analítica'),
    ('vnet', 'Virtual-Networks', 'Virtual Network', 'firewall', 'Red'),
    ('subnet', 'Subnet', 'Subnet', 'firewall', 'Red'),
    ('loadbalancer', 'Load-Balancers', 'Load Balancer', 'lb', 'Red'),
    ('appgateway', 'Application-Gateways', 'Application Gateway', 'lb', 'Red'),
    ('frontdoor', 'Front-Door-and-CDN-Profiles', 'Front Door', 'cdn', 'Red'),
    ('cdn', 'CDN-Profiles', 'CDN', 'cdn', 'Red'),
    ('dns', 'DNS-Zones', 'DNS Zones', 'dns', 'Red'),
    ('trafficmanager', 'Traffic-Manager-Profiles', 'Traffic Manager', 'dns', 'Red'),
    ('firewall', 'Firewalls', 'Firewall', 'firewall', 'Red'),
    ('nsg', 'Network-Security-Groups', 'Network Security Group', 'firewall', 'Red'),
    ('vpngateway', 'Virtual-Network-Gateways', 'VPN Gateway', 'firewall', 'Red'),
    ('expressroute', 'ExpressRoute-Circuits', 'ExpressRoute', 'firewall', 'Red'),
    ('privateendpoint', 'Private-Endpoints', 'Private Endpoint', 'firewall', 'Red'),
    ('bastion', 'Bastions', 'Bastion', 'firewall', 'Red'),
    ('apim', 'API-Management-Services', 'API Management', 'gateway', 'Red'),
    ('waf', 'Web-Application-Firewall-Policies(WAF)', 'WAF', 'firewall', 'Red'),
    ('servicebus', 'Azure-Service-Bus', 'Service Bus', 'queue', 'Integración'),
    ('eventhubs', 'Event-Hubs', 'Event Hubs', 'stream', 'Integración'),
    ('eventgrid', 'Event-Grid-Topics', 'Event Grid', 'events', 'Integración'),
    ('logicapps', 'Logic-Apps', 'Logic Apps', 'events', 'Integración'),
    ('storagequeue', 'Storage-Queue', 'Queue Storage', 'queue', 'Integración'),
    ('signalr', 'SignalR', 'SignalR', 'events', 'Integración'),
    ('communication', 'Azure-Communication-Services', 'Communication Services', 'email', 'Integración'),
    ('managedidentity', 'Entra-Managed-Identities', 'Managed Identity', 'auth', 'Seguridad'),
    ('b2c', 'Azure-AD-B2C', 'Entra External ID (B2C)', 'auth', 'Seguridad'),
    ('keyvault', 'Key-Vaults', 'Key Vault', 'secrets', 'Seguridad'),
    ('defender', 'Microsoft-Defender-for-Cloud', 'Defender for Cloud', 'auth', 'Seguridad'),
    ('sentinel', 'Azure-Sentinel', 'Sentinel', 'monitor', 'Seguridad'),
    ('monitor', 'Monitor', 'Monitor', 'monitor', 'Operaciones'),
    ('appinsights', 'Application-Insights', 'Application Insights', 'monitor', 'Operaciones'),
    ('loganalytics', 'Log-Analytics-Workspaces', 'Log Analytics', 'monitor', 'Operaciones'),
    ('devops', 'Azure-DevOps', 'Azure DevOps', 'cicd', 'Operaciones'),
    ('openai', 'Azure-OpenAI', 'Azure OpenAI', 'ai', 'IA'),
    ('foundry', 'AI-Foundry', 'AI Foundry', 'ai', 'IA'),
    ('ml', 'Azure-Machine-Learning', 'Machine Learning', 'ai', 'IA'),
    ('aiservices', 'Cognitive-Services', 'AI Services', 'ai', 'IA'),
    ('aisearch', 'Cognitive-Search', 'AI Search', 'ai', 'IA'),
    # Iconos de grupo (carpeta general del paquete)
    ('group-managementgroup', 'Management-Groups', 'Management group', 'generic', 'Grupos'),
    ('group-subscription', 'Subscriptions', 'Subscription', 'generic', 'Grupos'),
    ('group-resourcegroup', 'Resource-Groups', 'Resource group', 'generic', 'Grupos'),
]

# Google Cloud: desde 2025 los productos principales tienen icono propio y el
# resto usa el icono de su categoría (guía oficial, mayo de 2026).
GCP_CORE = [
    ('computeengine', 'Compute Engine', 'Compute Engine', 'compute', 'Cómputo'),
    ('gke', 'GKE', 'GKE', 'k8s', 'Cómputo'),
    ('cloudrun', 'Cloud Run', 'Cloud Run', 'container', 'Cómputo'),
    ('aihypercomputer', 'AI Hypercomputer', 'AI Hypercomputer', 'ai', 'IA'),
    ('cloudstorage', 'Cloud Storage', 'Cloud Storage', 'storage', 'Almacenamiento'),
    ('hyperdisk', 'Hyperdisk', 'Hyperdisk', 'storage', 'Almacenamiento'),
    ('cloudsql', 'Cloud SQL', 'Cloud SQL', 'db', 'Bases de datos'),
    ('alloydb', 'AlloyDB', 'AlloyDB', 'db', 'Bases de datos'),
    ('spanner', 'Cloud Spanner', 'Spanner', 'db', 'Bases de datos'),
    ('bigquery', 'BigQuery', 'BigQuery', 'analytics', 'Analítica'),
    ('looker', 'Looker', 'Looker', 'analytics', 'Analítica'),
    ('apigee', 'Apigee', 'Apigee', 'gateway', 'Integración'),
    ('vertexai', 'Vertex AI', 'Vertex AI', 'ai', 'IA'),
    ('anthos', 'Anthos', 'Anthos', 'k8s', 'Híbrido'),
    ('distributedcloud', 'Distributed Cloud', 'Distributed Cloud', 'compute', 'Híbrido'),
    ('secops', 'Security Operations', 'Security Operations', 'monitor', 'Seguridad'),
    ('scc', 'Security Command Center', 'Security Command Center', 'auth', 'Seguridad'),
    ('threatintel', 'Threat Intelligence', 'Threat Intelligence', 'auth', 'Seguridad'),
    ('mandiant', 'Mandiant', 'Mandiant', 'auth', 'Seguridad'),
]
GCP_CATEGORY = [
    ('cloudfunctions', 'Serverless Computing', 'Cloud Functions', 'function', 'Cómputo'),
    ('appengine', 'Serverless Computing', 'App Engine', 'compute', 'Cómputo'),
    ('batch', 'Compute', 'Batch', 'compute', 'Cómputo'),
    ('artifactregistry', 'DevOps', 'Artifact Registry', 'storage', 'Operaciones'),
    ('cloudbuild', 'DevOps', 'Cloud Build', 'cicd', 'Operaciones'),
    ('clouddeploy', 'DevOps', 'Cloud Deploy', 'cicd', 'Operaciones'),
    ('filestore', 'Storage', 'Filestore', 'storage', 'Almacenamiento'),
    ('firestore', 'Databases', 'Firestore', 'nosql', 'Bases de datos'),
    ('bigtable', 'Databases', 'Bigtable', 'nosql', 'Bases de datos'),
    ('memorystore', 'Databases', 'Memorystore', 'cache', 'Bases de datos'),
    ('pubsub', 'Data Analytics', 'Pub/Sub', 'events', 'Integración'),
    ('dataflow', 'Data Analytics', 'Dataflow', 'stream', 'Analítica'),
    ('dataproc', 'Data Analytics', 'Dataproc', 'analytics', 'Analítica'),
    ('composer', 'Data Analytics', 'Cloud Composer', 'analytics', 'Analítica'),
    ('lookerstudio', 'Business Intelligence', 'Looker Studio', 'analytics', 'Analítica'),
    ('eventarc', 'Integration Services', 'Eventarc', 'events', 'Integración'),
    ('workflows', 'Integration Services', 'Workflows', 'events', 'Integración'),
    ('apigateway', 'Integration Services', 'API Gateway', 'gateway', 'Integración'),
    ('cloudtasks', 'Developer Tools', 'Cloud Tasks', 'queue', 'Integración'),
    ('loadbalancing', 'Networking', 'Cloud Load Balancing', 'lb', 'Red'),
    ('cloudcdn', 'Networking', 'Cloud CDN', 'cdn', 'Red'),
    ('clouddns', 'Networking', 'Cloud DNS', 'dns', 'Red'),
    ('cloudarmor', 'Networking', 'Cloud Armor', 'firewall', 'Red'),
    ('vpc', 'Networking', 'VPC', 'firewall', 'Red'),
    ('cloudnat', 'Networking', 'Cloud NAT', 'firewall', 'Red'),
    ('interconnect', 'Networking', 'Cloud Interconnect', 'firewall', 'Red'),
    ('iam', 'Security Identity', 'IAM', 'auth', 'Seguridad'),
    ('kms', 'Security Identity', 'Cloud KMS', 'secrets', 'Seguridad'),
    ('secretmanager', 'Security Identity', 'Secret Manager', 'secrets', 'Seguridad'),
    ('identityplatform', 'Security Identity', 'Identity Platform', 'auth', 'Seguridad'),
    ('logging', 'Observability', 'Cloud Logging', 'monitor', 'Operaciones'),
    ('monitoring', 'Observability', 'Cloud Monitoring', 'monitor', 'Operaciones'),
    ('gemini', 'AI _ Machine Learning', 'Gemini', 'ai', 'IA'),
    ('documentai', 'AI _ Machine Learning', 'Document AI', 'ai', 'IA'),
    ('agents', 'Agents', 'AI Applications & Agents', 'ai', 'IA'),
    ('workspace', 'Collaboration', 'Google Workspace', 'external', 'Otros'),
    ('maps', 'Maps & Geospatial', 'Google Maps Platform', 'external', 'Otros'),
]

# SAP BTP: iconos de github.com/SAP/btp-solution-diagrams (Apache-2.0),
# carpeta assets/shape-libraries-and-editable-presets/svg.
SAP = [
    ('cloudfoundry', 'sap-btp_cloud-foundry-runtime', 'Cloud Foundry Runtime', 'container', 'Cómputo'),
    ('kyma', 'sap-btp_kyma-runtime', 'Kyma Runtime', 'k8s', 'Cómputo'),
    ('abap', 'sap-btp_abap-environment', 'ABAP Environment', 'compute', 'Cómputo'),
    ('autoscaler', 'application-autoscaler', 'Application Autoscaler', 'compute', 'Cómputo'),
    ('frontend', 'application-frontend-service', 'Application Frontend', 'web', 'Cómputo'),
    ('html5repo', 'sap-html5-application-repository-service-for-sap-btp', 'HTML5 App Repository', 'storage', 'Cómputo'),
    ('cap', 'sap-cloud-application-programming-model', 'CAP', 'function', 'Desarrollo'),
    ('bas', 'sap-business-application-studio', 'Business Application Studio', 'cicd', 'Desarrollo'),
    ('build', 'sap-build', 'SAP Build', 'web', 'Desarrollo'),
    ('buildapps', 'sap-build-apps', 'SAP Build Apps', 'mobile', 'Desarrollo'),
    ('buildcode', 'sap-build-code', 'SAP Build Code', 'cicd', 'Desarrollo'),
    ('processautomation', 'sap-build-process-automation', 'Build Process Automation', 'events', 'Desarrollo'),
    ('workzone', 'sap-build-work-zone', 'Build Work Zone', 'web', 'Desarrollo'),
    ('mobileservices', 'sap-mobile-services', 'Mobile Services', 'mobile', 'Desarrollo'),
    ('hanacloud', 'sap-hana-cloud', 'HANA Cloud', 'db', 'Bases de datos'),
    ('objectstore', 'object-store-on-sap-btp', 'Object Store', 'storage', 'Bases de datos'),
    ('documentmanagement', 'sap-document-management-service', 'Document Management', 'storage', 'Bases de datos'),
    ('mdg', 'sap-master-data-governance', 'Master Data Governance', 'db', 'Bases de datos'),
    ('mdi', 'sap-master-data-integration', 'Master Data Integration', 'db', 'Bases de datos'),
    ('datasphere', 'sap-datasphere', 'Datasphere', 'analytics', 'Analítica'),
    ('analyticscloud', 'sap-analytics-cloud', 'Analytics Cloud', 'analytics', 'Analítica'),
    ('businessdatacloud', 'sap-business-data-cloud', 'Business Data Cloud', 'analytics', 'Analítica'),
    ('integrationsuite', 'sap-integration-suite', 'Integration Suite', 'gateway', 'Integración'),
    ('cloudintegration', 'sap-integration-suite_cloud-integration', 'Cloud Integration', 'events', 'Integración'),
    ('apimanagement', 'sap-integration-suite_api-management', 'API Management', 'gateway', 'Integración'),
    ('eventmesh', 'sap-integration-suite_event-mesh', 'Event Mesh', 'events', 'Integración'),
    ('advancedeventmesh', 'sap-integration-suite_advanced-event-mesh', 'Advanced Event Mesh', 'stream', 'Integración'),
    ('eventbroker', 'sap-event-broker-for-sap-cloud-applications', 'Event Broker', 'events', 'Integración'),
    ('openconnectors', 'sap-integration-suite_open-connectors', 'Open Connectors', 'external', 'Integración'),
    ('edgecell', 'edge-integration-cell', 'Edge Integration Cell', 'container', 'Integración'),
    ('graph', 'sap-integration-suite_graph', 'Graph', 'gateway', 'Integración'),
    ('jobscheduling', 'sap-job-scheduling-service', 'Job Scheduling', 'queue', 'Integración'),
    ('alertnotification', 'sap-alert-notification-service-for-sap-btp', 'Alert Notification', 'email', 'Integración'),
    ('connectivity', 'sap-connectivity-service', 'Connectivity Service', 'lb', 'Red'),
    ('destination', 'sap-destination-service', 'Destination Service', 'gateway', 'Red'),
    ('cloudconnector', 'cloud-connector', 'Cloud Connector', 'firewall', 'Red'),
    ('privatelink', 'sap-private-link-service', 'Private Link', 'firewall', 'Red'),
    ('customdomain', 'sap-custom-domain-service', 'Custom Domain', 'dns', 'Red'),
    ('xsuaa', 'sap-authorization-and-trust-management-service', 'Authorization & Trust (XSUAA)', 'auth', 'Seguridad'),
    ('identityservices', 'sap-cloud-identity-services', 'Cloud Identity Services', 'auth', 'Seguridad'),
    ('ias', 'identity-authentication', 'Identity Authentication', 'auth', 'Seguridad'),
    ('ips', 'identity-provisioning', 'Identity Provisioning', 'auth', 'Seguridad'),
    ('credentialstore', 'sap-credential-store', 'Credential Store', 'secrets', 'Seguridad'),
    ('keystore', 'sap-keystore-service', 'Keystore', 'secrets', 'Seguridad'),
    ('auditlog', 'sap-audit-log-service', 'Audit Log', 'monitor', 'Seguridad'),
    ('malwarescanning', 'sap-malware-scanning-service', 'Malware Scanning', 'firewall', 'Seguridad'),
    ('aicore', 'sap-ai-core', 'AI Core', 'ai', 'IA'),
    ('ailaunchpad', 'sap-ai-launchpad', 'AI Launchpad', 'ai', 'IA'),
    ('joule', 'joule studio', 'Joule Studio', 'ai', 'IA'),
    ('documentgrounding', 'document-grounding', 'Document Grounding', 'ai', 'IA'),
    ('documentextraction', 'document-information-extraction', 'Document Information Extraction', 'ai', 'IA'),
    ('cloudlogging', 'cloud-logging', 'Cloud Logging', 'monitor', 'Operaciones'),
    ('applogging', 'sap-application-logging-service-for-sap-btp', 'Application Logging', 'monitor', 'Operaciones'),
    ('cloudalm', 'sap-cloud-alm', 'Cloud ALM', 'monitor', 'Operaciones'),
    ('cicd', 'sap-continuous-integration-and-delivery', 'Continuous Integration & Delivery', 'cicd', 'Operaciones'),
    ('transportmanagement', 'sap-cloud-transport-management', 'Cloud Transport Management', 'cicd', 'Operaciones'),
    ('automationpilot', 'sap-automation-pilot', 'Automation Pilot', 'cicd', 'Operaciones'),
    ('btpservice', 'placeholder-icon-for-sap-btp-services', 'Servicio SAP BTP', 'generic', 'Otros'),
]

# Microsoft Fabric: paquete @fabric-msft/svg-icons (Icons.zip de
# github.com/microsoft/fabric-samples/docs-samples), carpeta package/dist/svg.
# Se usan los iconos de 48 px: «_color» = producto o carga de trabajo, «_item» = elemento.
FABRIC = [
    ('fabric', 'fabric_color', 'Microsoft Fabric', 'generic', 'Plataforma'),
    ('onelake', 'one_lake_color', 'OneLake', 'storage', 'Plataforma'),
    ('copilot', 'copilot_color', 'Copilot', 'ai', 'Plataforma'),
    ('purview', 'purview_color', 'Purview', 'auth', 'Plataforma'),
    ('dataengineering', 'data_engineering_color', 'Data Engineering', 'analytics', 'Cargas de trabajo'),
    ('datafactory', 'data_factory_color', 'Data Factory', 'events', 'Cargas de trabajo'),
    ('datascience', 'data_science_color', 'Data Science', 'ai', 'Cargas de trabajo'),
    ('datawarehouse', 'data_warehouse_color', 'Data Warehouse', 'analytics', 'Cargas de trabajo'),
    ('databases', 'databases_color', 'Databases', 'db', 'Cargas de trabajo'),
    ('realtime', 'real_time_intelligence_color', 'Real-Time Intelligence', 'stream', 'Cargas de trabajo'),
    ('powerbi', 'power_bi_color', 'Power BI', 'analytics', 'Cargas de trabajo'),
    ('graph', 'graph_intelligence_color', 'Graph Intelligence', 'analytics', 'Cargas de trabajo'),
    ('industry', 'industry_solutions_color', 'Industry Solutions', 'external', 'Cargas de trabajo'),
    ('lakehouse', 'lakehouse_item', 'Lakehouse', 'storage', 'Almacenamiento'),
    ('warehouse', 'data_warehouse_item', 'Warehouse', 'analytics', 'Almacenamiento'),
    ('sqldatabase', 'sql_database_item', 'SQL Database', 'db', 'Almacenamiento'),
    ('mirroreddb', 'mirrored_generic_database_item', 'Mirrored Database', 'db', 'Almacenamiento'),
    ('datamart', 'datamart_item', 'Datamart', 'db', 'Almacenamiento'),
    ('pipeline', 'pipeline_item', 'Data Pipeline', 'events', 'Integración'),
    ('dataflow', 'dataflow_gen2_item', 'Dataflow Gen2', 'stream', 'Integración'),
    ('copyjob', 'copy_job_item', 'Copy Job', 'events', 'Integración'),
    ('notebook', 'notebook_item', 'Notebook', 'compute', 'Ingeniería de datos'),
    ('sparkjob', 'spark_job_direction_item', 'Spark Job Definition', 'compute', 'Ingeniería de datos'),
    ('environment', 'environment_item', 'Environment', 'compute', 'Ingeniería de datos'),
    ('udf', 'user_data_function_item', 'User Data Functions', 'function', 'Ingeniería de datos'),
    ('eventhouse', 'event_house_item', 'Eventhouse', 'stream', 'Tiempo real'),
    ('eventstream', 'eventstream_item', 'Eventstream', 'stream', 'Tiempo real'),
    ('kqldatabase', 'kql_database_item', 'KQL Database', 'db', 'Tiempo real'),
    ('kqlqueryset', 'kql_queryset_item', 'KQL Queryset', 'analytics', 'Tiempo real'),
    ('rtdashboard', 'real_time_dashboard_item', 'Real-Time Dashboard', 'monitor', 'Tiempo real'),
    ('experiment', 'experiments_item', 'ML Experiment', 'ai', 'IA'),
    ('mlmodel', 'model_item', 'ML Model', 'ai', 'IA'),
    ('dataagent', 'data_agent_item', 'Data Agent', 'ai', 'IA'),
    ('opsagent', 'operations_agent_item', 'Operations Agent', 'ai', 'IA'),
    ('semanticmodel', 'semantic_model_item', 'Semantic Model', 'analytics', 'Power BI'),
    ('report', 'report_item', 'Report', 'analytics', 'Power BI'),
    ('dashboard', 'dashboard_item', 'Dashboard', 'monitor', 'Power BI'),
    ('paginated', 'paginated_report_item', 'Paginated Report', 'analytics', 'Power BI'),
    ('scorecard', 'scorecard_item', 'Scorecard', 'analytics', 'Power BI'),
    ('orgapp', 'apps_item', 'Org App', 'web', 'Power BI'),
    ('variables', 'variable_library_item', 'Variable Library', 'secrets', 'Operaciones'),
]


def clean_svg(text):
    """Quita prólogo, comentarios, metadatos y espacios sobrantes."""
    text = re.sub(r'<\?xml.*?\?>', '', text, flags=re.S)
    text = re.sub(r'<!DOCTYPE.*?>', '', text, flags=re.S)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'<metadata.*?</metadata>', '', text, flags=re.S)
    text = re.sub(r'>\s+<', '><', text)
    return re.sub(r'\s+', ' ', text).strip()


def data_uri(path):
    with open(path, encoding='utf-8') as f:
        svg = clean_svg(f.read())
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode('utf-8')).decode('ascii')


def index_files(root, pattern):
    """Mapa nombre-clave -> ruta del primer SVG que encaja."""
    found = {}
    for dirpath, _, files in os.walk(root):
        for f in sorted(files):
            m = pattern.match(f) if f.endswith('.svg') else None
            if m and m.group(1) not in found:
                found[m.group(1)] = os.path.join(dirpath, f)
    return found


def slug(name):
    return re.sub(r'[^a-z0-9]+', '', name.lower())


def build(provider, label, entries, files, licence):
    out = {'label': label, 'short': SHORT.get(provider, label), 'licence': licence, 'files': {}, 'items': {}}
    missing = []
    for key, name, title, ntype, cat in entries:
        path = files.get(name)
        if not path:
            missing.append(name)
            continue
        fkey = slug(name)
        if fkey not in out['files']:
            out['files'][fkey] = data_uri(path)
        out['items'][key] = {'label': title, 'type': ntype, 'category': cat, 'file': fkey}
        if f'{provider}/{key}' in KEYWORDS:
            out['items'][key]['keywords'] = KEYWORDS[f'{provider}/{key}']
        if f'{provider}/{key}' in GROUP_REFS:
            out['items'][key]['group'] = True  # sirve como icono de grupo (recuadro)
    if ALL:
        used = {e[1] for e in entries}
        for name, path in sorted(files.items()):
            if name in used:
                continue
            fkey = slug(name)
            out['files'].setdefault(fkey, data_uri(path))
            out['items'].setdefault(fkey, {'label': name.replace('-', ' '), 'type': 'generic', 'category': 'Otros', 'file': fkey})
    return out, missing


def write(dest, provider, data):
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(f'/* Diagramon · iconos oficiales de {data["label"]}. Generado por tools/build-icons.py.\n'
                f'   {data["licence"]} */\n')
        f.write('window.DIAGRAMON_ICONS = window.DIAGRAMON_ICONS || {};\n')
        f.write(f'window.DIAGRAMON_ICONS[{json.dumps(provider)}] = {body};\n')
    return os.path.getsize(dest)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out_dir, exist_ok=True)

    aws_files = index_files(os.path.join(src, 'aws'), re.compile(r'^Arch_(.+)_48\.svg$'))
    # Iconos de grupo de AWS: «Nombre_32.svg» (sin las variantes _Dark), se indexan como «Group-Nombre»
    for d, _, _ in os.walk(os.path.join(src, 'aws')):
        if os.path.basename(d).startswith('Architecture-Group-Icons') and '__MACOSX' not in d:
            for name, path in index_files(d, re.compile(r'^(.+)_32\.svg$')).items():
                aws_files.setdefault(f'Group-{name}', path)
    azure_files = index_files(os.path.join(src, 'azure'), re.compile(r'^\d+\s*-icon-service-(.+?)\s*\.svg$'))
    gcp_files = {}
    for sub in ('gcp-core', 'gcp-cat'):
        for dirpath, _, files in os.walk(os.path.join(src, sub)):
            svgs = [f for f in sorted(files) if f.endswith('.svg')]
            if svgs and os.path.basename(dirpath) == 'SVG':
                gcp_files.setdefault(os.path.basename(os.path.dirname(dirpath)), os.path.join(dirpath, svgs[0]))
    fabric_files = {f'{m.group(1)}_{m.group(2)}': p for p, m in
                    ((os.path.join(d, f), re.match(r'^(.+)_48_(item|color)\.svg$', f))
                     for d, _, fs in os.walk(os.path.join(src, 'fabric')) for f in fs) if m}
    sap_files = index_files(os.path.join(src, 'sap'), re.compile(r'^\d+-(.+?)(?:_sd)?\.svg$'))

    jobs = [
        ('aws', 'AWS', AWS, aws_files,
         'AWS Architecture Icons: AWS permite usarlos para crear diagramas de arquitectura.'),
        ('azure', 'Azure', AZURE, azure_files,
         'Azure icons: Microsoft permite usarlos en diagramas, formación y documentación; no recortar, girar ni deformar.'),
        ('gcp', 'Google Cloud', GCP_CORE + GCP_CATEGORY, gcp_files,
         'Google Cloud icons: iconos oficiales para diagramas y documentación técnica.'),
        ('sap', 'SAP BTP', SAP, sap_files,
         'SAP BTP service icons: (c) SAP SE or an SAP affiliate company and btp-solution-diagrams contributors. '
         'Apache License 2.0 (icons/LICENSE-SAP.txt). Origen: github.com/SAP/btp-solution-diagrams.'),
        ('fabric', 'Microsoft Fabric', FABRIC, fabric_files,
         'Microsoft Fabric icons (@fabric-msft/svg-icons): (c) Microsoft Corporation, MIT (icons/LICENSE-FABRIC.txt). '
         'Microsoft permite usarlos en diagramas de arquitectura; no recortar, girar ni deformar.'),
    ]
    for provider, label, entries, files, licence in jobs:
        if not files:
            print(f'{provider}: carpeta no encontrada, se salta')
            continue
        data, missing = build(provider, label, entries, files, licence)
        size = write(os.path.join(out_dir, f'{provider}.js'), provider, data)
        print(f'{provider}: {len(data["items"])} servicios, {len(data["files"])} iconos, {size / 1024:.0f} KB')
        for name in missing:
            print(f'  ! no encontrado: {name}')


if __name__ == '__main__':
    main()
