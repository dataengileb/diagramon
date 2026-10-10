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

- **Cada componente recuerda su recurso**: la importación guarda la dirección del recurso en el campo `iac` del componente (`aws_db_instance.orders`, un id lógico de CloudFormation, `Deployment shop/web`, `service api`). Es opcional, viaja en el JSON y sobrevive a las ediciones de texto, y es lo que permite que una comparación posterior con la infraestructura desplegada una cada componente con su recurso en lugar de adivinar por el nombre.

![Data lake de AWS importado desde terraform show -json](iac-data-lake.png)

Pruébalo con los archivos de [`samples/`](../samples): un data lake simple en AWS (en Terraform y en CloudFormation), una tienda web en Azure (`azure-web-shop`, `terraform show -json`), una plataforma de datos en Google Cloud (`gcp-data-platform`, `terraform show -json`), una tienda en Kubernetes y un stack de Docker Compose.

## Comparar el diagrama con lo desplegado

El botón **Desplegado** de la barra compara el diagrama en pantalla con los archivos de infraestructura de lo que realmente está en marcha (los mismos que puedes importar arriba). De esos archivos no se guarda nada: solo viven mientras la ventana está abierta.

Los componentes se unen por su enlace `iac` (ver arriba). La ventana muestra, en este orden:

- **Diferencias**: región, réplicas, exposición pública y copia de seguridad, solo cuando el diagrama y el recurso desplegado afirman un valor y no coinciden. La exposición y la copia de seguridad cuentan solo si están escritas de forma explícita en el componente, nunca si Diagramon las deduce. Cada fila tiene **Usar el valor desplegado** (actualiza el diagrama) o **Aceptar** con un motivo (obligatorio). Una diferencia aceptada queda guardada en el diagrama con su motivo, la fecha y el valor desplegado para el que se aceptó; si ese valor cambia más adelante, vuelve como diferencia abierta.
- **Enlaces sugeridos**: componentes sin enlace que se parecen a un recurso desplegado (mismo tipo o icono y nombre parecido). No se enlaza nada solo; pulsa **Enlazar** en cada uno con el que estés de acuerdo.
- **Enlazados, pero no encontrados**: el recurso ya no existe o cambió de nombre. Quita el enlace o apúntalo a otro.
- **Componentes sin enlace** (elige un recurso de la lista para enlazar a mano) y **Desplegados, pero no están en el diagrama**.

Mientras haya archivos cargados, Revisión muestra un hallazgo por cada diferencia abierta y por cada enlace que ya no existe (fuente *Diseño frente a desplegado*), y el informe tiene una sección con las diferencias aceptadas. Los hallazgos desaparecen con los archivos cargados; la sección del informe sale de lo aceptado.

El cifrado no se compara: los componentes no tienen un campo de cifrado (solo las conexiones).
