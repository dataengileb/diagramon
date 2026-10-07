[← Diagramon](../README.es.md) · [English](iac-import.md) · **Español**

# 🏗️ De infraestructura como código a diagrama

Arrastra tus archivos de IaC al lienzo, o usa **Importar**. Diagramon dibuja la arquitectura real en segundos, sin subir nada a ningún sitio: todo se procesa en tu navegador.

| Origen | Cómo obtener el archivo |
|---|---|
| **Terraform** | `terraform show -json > infra.json` (estado), `terraform show -json plan.out` (plan) o el propio `.tfstate` |
| **CloudFormation / SAM** | La plantilla, en YAML o JSON |
| **Kubernetes** | Tus manifiestos (varios documentos por archivo, varios archivos a la vez), o `kubectl get all,ingress,pvc,secret -o yaml` |
| **Docker Compose** | `docker-compose.yml` / `compose.yaml` |

Qué obtienes:

- **Grupos**: región de AWS › VPC › subredes, grupo de recursos de Azure › VNet › subred, proyecto de Google Cloud › red VPC › subred, namespaces de Kubernetes y redes de Compose.
- **Regiones** en grupos y componentes: `region` y ARN de AWS, `location` de Azure (`West Europe` y `westeurope` son lo mismo; un recurso sin ella toma la de su grupo de recursos), `region` y `location` de Google Cloud (regiones, multirregiones como `EU` y zonas como `europe-west1-b`, que pasan a `europe-west1`) y la región del proveedor. Así funcionan las etiquetas de región y el aviso de transferencia entre fronteras en los diagramas importados.
- **Conexiones** deducidas de las referencias: ARN, ids, nombres de buckets, rutas `s3://`, nombres de host en variables de entorno, selectores e Ingress de Kubernetes, `depends_on`. La dirección sigue a los datos: el stream *origen* de un Firehose apunta al Firehose, y una notificación de S3 apunta a la Lambda que dispara.
- **Iconos oficiales** y detalles: runtime, motor, horario, réplicas.
- **Clasificación de datos** desde etiquetas como `DataClassification = pii`.
- **Menos ruido**: los recursos de apoyo (IAM, políticas, rutas, grupos de seguridad, asociaciones…) se ocultan, pero se usan para ubicar y conectar el resto.

![Data lake de AWS importado desde terraform show -json](iac-data-lake.png)

Pruébalo con los archivos de [`samples/`](../samples): un data lake simple en AWS (en Terraform y en CloudFormation), una tienda web en Azure (`azure-web-shop`, `terraform show -json`), una plataforma de datos en Google Cloud (`gcp-data-platform`, `terraform show -json`), una tienda en Kubernetes y un stack de Docker Compose.
