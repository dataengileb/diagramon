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
