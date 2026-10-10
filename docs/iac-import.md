[← Diagramon](../README.md) · **English** · [Español](iac-import.es.md)

# 🏗️ From infrastructure as code to diagram

Drop your IaC files on the canvas, or use **Import**. Diagramon draws the real architecture in seconds, and nothing is uploaded anywhere: parsing runs in your browser.

| Source | How to get the file |
|---|---|
| **Terraform** | `terraform show -json > infra.json` (state), `terraform show -json plan.out` (plan) or the `.tfstate` file itself |
| **CloudFormation / SAM** | The template, in YAML or JSON |
| **Kubernetes** | Your manifests (several documents per file, several files at once), or `kubectl get all,ingress,pvc,secret -o yaml` |
| **Docker Compose** | `docker-compose.yml` / `compose.yaml` |

What you get:

- **Groups**: AWS region › VPC › subnets, Azure resource group › VNet › subnet, Google Cloud project › VPC network › subnetwork, Kubernetes namespaces and Compose networks.
- **Regions** on groups and components: AWS `region` and ARNs, Azure `location` (`West Europe` and `westeurope` are the same; a resource without one takes its resource group's), Google Cloud `region`, `location` (regions, multi-regions such as `EU`, and zones such as `europe-west1-b`, which become `europe-west1`) and the provider's `region`. So the region pills and the cross-border warning work on imported diagrams.
- **Connections** deduced from references: ARNs, ids, bucket names, `s3://` paths, hostnames in environment variables, Kubernetes selectors and Ingress rules, `depends_on`. The direction follows the data: a Firehose *source* stream points to the Firehose, and an S3 notification points to the Lambda it triggers.
- **Official icons** and details: runtime, engine, schedule, replicas.
- **Data classification** from tags such as `DataClassification = pii`.
- **Less noise**: supporting resources (IAM, policies, routes, security groups, attachments…) are hidden, but still used to place and connect the rest.

- **Each component remembers its resource**: the import stores the resource address in the component's `iac` field (`aws_db_instance.orders`, a CloudFormation logical id, `Deployment shop/web`, `service api`). It is optional, travels in the JSON and survives text edits, and it is what lets a later comparison with the deployed infrastructure match a component to its resource instead of guessing by name.

![AWS data lake imported from terraform show -json](iac-data-lake.png)

Try it with the files in [`samples/`](../samples): a simple AWS data lake (as Terraform and as CloudFormation), an Azure web shop (`azure-web-shop`, `terraform show -json`), a Google Cloud data platform (`gcp-data-platform`, `terraform show -json`), a Kubernetes shop and a Docker Compose stack.

## Compare the diagram with what is deployed

The **Deployed** button of the toolbar compares the diagram on screen with the infrastructure files of what is actually running (the same files you can import above). Nothing is stored from those files; they only live while the window is open.

Components are matched by their `iac` link (see above). The window then shows, in this order:

- **Differences**: region, replicas, public exposure and backup, only where both the diagram and the deployed resource state a value and they disagree. Exposure and backup count only when written explicitly on the component, never when Diagramon deduces them. Each row has **Use deployed value** (updates the diagram) or **Accept** with a reason (required). An accepted difference is saved in the diagram with its reason, the date and the deployed value it was accepted for; if the deployed value changes later it comes back as an open difference.
- **Suggested links**: components without a link that look like a deployed resource (same type or icon and a similar name). Nothing is linked for you; press **Link** on each one you agree with.
- **Linked, but not found**: the resource is gone or renamed. Unlink it or point it elsewhere.
- **Components without a link** (pick a resource from the list to link by hand) and **Deployed, but not in the diagram**.

While files are loaded, Review shows one finding per open difference and per link that no longer exists (source *Design vs deployed*), and the report has a section listing the accepted differences. Both go away with the loaded files, except the report section, which comes from what was accepted.

Encryption is not compared: components have no encryption field (only connections do).
