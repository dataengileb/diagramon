# Simple data lake on AWS (sample for Diagramon's IaC import).
# terraform-show.json in this folder is the matching `terraform show -json` output.
#
#   clickstream ─► Kinesis ─► Firehose ─► S3 raw ─► Glue job ─► S3 curated ─► crawler ─► Glue Data Catalog ◄─ Athena
#   orders RDS  ─► Lambda (nightly, inside the VPC) ─► S3 raw ─► quality check Lambda ─► SNS alerts

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

provider "aws" {
  region = "us-east-1"
}

locals {
  name = "acme-datalake"
  tags = { Project = "datalake", Owner = "data-platform" }
}

# ---------- network ----------
resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  tags                 = merge(local.tags, { Name = "${local.name}-vpc" })
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.20.101.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true
  tags                    = merge(local.tags, { Name = "${local.name}-public-a" })
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.1.0/24"
  availability_zone = "us-east-1a"
  tags              = merge(local.tags, { Name = "${local.name}-private-a" })
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.20.2.0/24"
  availability_zone = "us-east-1b"
  tags              = merge(local.tags, { Name = "${local.name}-private-b" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
  tags          = merge(local.tags, { Name = "${local.name}-nat" })
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_b" {
  subnet_id      = aws_subnet.private_b.id
  route_table_id = aws_route_table.private.id
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
  tags              = merge(local.tags, { Name = "${local.name}-s3-endpoint" })
}

resource "aws_security_group" "lambda" {
  name   = "${local.name}-lambda"
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "rds" {
  name   = "${local.name}-rds"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }
}

# ---------- encryption ----------
resource "aws_kms_key" "datalake" {
  description         = "Data lake encryption key"
  enable_key_rotation = true
  tags                = local.tags
}

resource "aws_kms_alias" "datalake" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.datalake.key_id
}

# ---------- storage ----------
resource "aws_s3_bucket" "raw" {
  bucket = "${local.name}-raw"
  tags   = merge(local.tags, { DataClassification = "pii" })
}

resource "aws_s3_bucket" "curated" {
  bucket = "${local.name}-curated"
  tags   = merge(local.tags, { DataClassification = "confidential" })
}

resource "aws_s3_bucket" "athena_results" {
  bucket = "${local.name}-athena-results"
  tags   = merge(local.tags, { DataClassification = "internal" })
}

resource "aws_s3_bucket" "glue_scripts" {
  bucket = "${local.name}-glue-scripts"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw" {
  bucket = aws_s3_bucket.raw.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.datalake.arn
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "curated" {
  bucket = aws_s3_bucket.curated.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.datalake.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "raw" {
  bucket                  = aws_s3_bucket.raw.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "curated" {
  bucket                  = aws_s3_bucket.curated.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------- streaming ingestion ----------
resource "aws_kinesis_stream" "clickstream" {
  name            = "${local.name}-clickstream"
  shard_count     = 2
  encryption_type = "KMS"
  kms_key_id      = aws_kms_key.datalake.arn
  tags            = merge(local.tags, { DataClassification = "pii" })
}

resource "aws_iam_role" "firehose" {
  name               = "${local.name}-firehose"
  assume_role_policy = data.aws_iam_policy_document.firehose_assume.json
}

resource "aws_kinesis_firehose_delivery_stream" "clickstream" {
  name        = "${local.name}-clickstream-to-raw"
  destination = "extended_s3"

  kinesis_source_configuration {
    kinesis_stream_arn = aws_kinesis_stream.clickstream.arn
    role_arn           = aws_iam_role.firehose.arn
  }

  extended_s3_configuration {
    role_arn            = aws_iam_role.firehose.arn
    bucket_arn          = aws_s3_bucket.raw.arn
    prefix              = "clickstream/dt=!{timestamp:yyyy-MM-dd}/"
    error_output_prefix = "errors/clickstream/"
    buffering_size      = 64
    buffering_interval  = 300
    compression_format  = "GZIP"
  }
}

# ---------- batch ingestion from the orders database ----------
resource "aws_db_subnet_group" "orders" {
  name       = "${local.name}-orders"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_db_instance" "orders" {
  identifier             = "${local.name}-orders"
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = "db.t4g.medium"
  allocated_storage      = 100
  db_name                = "orders"
  username               = "etl_reader"
  manage_master_user_password = true
  db_subnet_group_name   = aws_db_subnet_group.orders.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.datalake.arn
  multi_az               = true
  tags                   = merge(local.tags, { DataClassification = "pii" })
}

resource "aws_secretsmanager_secret" "orders_db" {
  name       = "${local.name}/orders-db"
  kms_key_id = aws_kms_key.datalake.arn
}

resource "aws_iam_role" "lambda_extract" {
  name               = "${local.name}-orders-extract"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_extract_vpc" {
  role       = aws_iam_role.lambda_extract.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "orders_extract" {
  function_name = "${local.name}-orders-extract"
  role          = aws_iam_role.lambda_extract.arn
  runtime       = "python3.12"
  handler       = "extract.handler"
  filename      = "build/extract.zip"
  timeout       = 900
  memory_size   = 1024

  vpc_config {
    subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      SOURCE_DB_HOST = aws_db_instance.orders.address
      DB_SECRET_ARN  = aws_secretsmanager_secret.orders_db.arn
      OUTPUT_BUCKET  = aws_s3_bucket.raw.bucket
      OUTPUT_PREFIX  = "orders/"
    }
  }
}

resource "aws_cloudwatch_event_rule" "nightly_extract" {
  name                = "${local.name}-nightly-extract"
  schedule_expression = "cron(0 2 * * ? *)"
}

resource "aws_cloudwatch_event_target" "nightly_extract" {
  rule = aws_cloudwatch_event_rule.nightly_extract.name
  arn  = aws_lambda_function.orders_extract.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.orders_extract.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly_extract.arn
}

# ---------- data quality checks ----------
resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-alerts"
  kms_master_key_id = aws_kms_key.datalake.id
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "data-team@acme.example"
}

resource "aws_iam_role" "lambda_quality" {
  name               = "${local.name}-quality-check"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_lambda_function" "quality_check" {
  function_name = "${local.name}-quality-check"
  role          = aws_iam_role.lambda_quality.arn
  runtime       = "python3.12"
  handler       = "quality.handler"
  filename      = "build/quality.zip"

  environment {
    variables = {
      ALERT_TOPIC_ARN = aws_sns_topic.alerts.arn
    }
  }
}

resource "aws_lambda_permission" "s3" {
  statement_id  = "AllowS3"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.quality_check.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.raw.arn
}

resource "aws_s3_bucket_notification" "raw" {
  bucket = aws_s3_bucket.raw.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.quality_check.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "orders/"
  }
  depends_on = [aws_lambda_permission.s3]
}

# ---------- processing and catalog ----------
resource "aws_glue_catalog_database" "datalake" {
  name = "acme_datalake"
}

resource "aws_iam_role" "glue" {
  name               = "${local.name}-glue"
  assume_role_policy = data.aws_iam_policy_document.glue_assume.json
}

resource "aws_glue_job" "raw_to_curated" {
  name              = "${local.name}-raw-to-curated"
  role_arn          = aws_iam_role.glue.arn
  glue_version      = "4.0"
  worker_type       = "G.1X"
  number_of_workers = 4

  command {
    name            = "glueetl"
    script_location = "s3://${aws_s3_bucket.glue_scripts.bucket}/jobs/raw_to_curated.py"
    python_version  = "3"
  }

  default_arguments = {
    "--source_path"             = "s3://${aws_s3_bucket.raw.bucket}/"
    "--target_path"             = "s3://${aws_s3_bucket.curated.bucket}/"
    "--catalog_database"        = aws_glue_catalog_database.datalake.name
    "--enable-glue-datacatalog" = "true"
    "--job-bookmark-option"     = "job-bookmark-enable"
  }
}

resource "aws_glue_trigger" "nightly" {
  name     = "${local.name}-nightly"
  type     = "SCHEDULED"
  schedule = "cron(0 3 * * ? *)"
  actions {
    job_name = aws_glue_job.raw_to_curated.name
  }
}

resource "aws_glue_crawler" "curated" {
  name          = "${local.name}-curated-crawler"
  role          = aws_iam_role.glue.arn
  database_name = aws_glue_catalog_database.datalake.name
  schedule      = "cron(0 4 * * ? *)"

  s3_target {
    path = "s3://${aws_s3_bucket.curated.bucket}/"
  }
}

resource "aws_lakeformation_resource" "curated" {
  arn = aws_s3_bucket.curated.arn
}

# ---------- query ----------
resource "aws_athena_workgroup" "analysts" {
  name = "${local.name}-analysts"
  configuration {
    enforce_workgroup_configuration = true
    result_configuration {
      output_location = "s3://${aws_s3_bucket.athena_results.bucket}/"
      encryption_configuration {
        encryption_option = "SSE_KMS"
        kms_key_arn       = aws_kms_key.datalake.arn
      }
    }
  }
}

resource "aws_athena_named_query" "daily_orders" {
  name      = "daily-orders"
  workgroup = aws_athena_workgroup.analysts.id
  database  = aws_glue_catalog_database.datalake.name
  query     = "SELECT order_date, count(*) FROM orders GROUP BY 1 ORDER BY 1 DESC"
}

# ---------- trust policies ----------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "glue_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["glue.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "firehose_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}
