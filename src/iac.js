/* ==========================================================================
   Diagramon · importar infraestructura como código
   --------------------------------------------------------------------------
   Convierte, sin salir del navegador, uno o varios archivos en un diagrama:
   - Terraform: `terraform show -json` (estado o plan) y archivos .tfstate
   - CloudFormation / SAM: plantillas JSON o YAML
   - Kubernetes: manifiestos YAML o JSON (varios documentos por archivo)
   - Docker Compose: docker-compose.yml / compose.yaml
   Los recursos de red (VPC, subredes, VNet, namespaces…) se vuelven grupos.
   Los recursos de apoyo (IAM, políticas, reglas, asociaciones…) se ocultan,
   pero se usan para deducir conexiones y ubicaciones.
   API: window.DiagramonIaC.detect(texto, nombre) y .convert([{ name, text }]).
   ========================================================================== */
window.DiagramonIaC = (() => {
  'use strict';

  const C = window.DIAGRAMON_CONFIG || {};
  const I = window.DiagramonI18n;
  const T = (k, v) => (I ? I.T(k, v) : k);
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const str = v => (typeof v === 'string' ? v : '');

  /* ======================================================================
     YAML (el subconjunto que usan estas herramientas)
     Mapas y listas por sangría, estilo flujo [..] {..}, cadenas con comillas,
     bloques | y >, anclas & y alias *, fusión <<, varios documentos (---)
     y etiquetas cortas de CloudFormation (!Ref, !GetAtt, !Sub…).
     ====================================================================== */
  function quoteEnd(s, at) {
    const q = s[at];
    for (let k = at + 1; k < s.length; k++) {
      if (q === '"' && s[k] === '\\') { k++; continue; }
      if (s[k] === q) {
        if (q === "'" && s[k + 1] === "'") { k++; continue; }
        return k;
      }
    }
    return -1;
  }
  function unquote(s) {
    if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
    return s.slice(1, -1).replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, c) => {
      if (c[0] === 'x' || c[0] === 'u') return String.fromCharCode(parseInt(c.slice(1), 16));
      return { n: '\n', t: '\t', r: '\r', 0: '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' ' }[c] ?? c;
    });
  }
  function stripComment(s) {
    let q = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (q) {
        if (q === '"' && c === '\\') k++;
        else if (c === q) { if (q === "'" && s[k + 1] === "'") k++; else q = null; }
        continue;
      }
      if ((c === '"' || c === "'") && (k === 0 || /[\s[{,]/.test(s[k - 1]))) q = c;
      else if (c === '#' && (k === 0 || /\s/.test(s[k - 1]))) return s.slice(0, k);
    }
    return s;
  }
  function scalar(s) {
    if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
    if (/^(true|True|TRUE)$/.test(s)) return true;
    if (/^(false|False|FALSE)$/.test(s)) return false;
    if (/^[-+]?(0|[1-9]\d{0,14})$/.test(s)) return Number(s);
    if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) && !/^[-+]?0\d/.test(s)) return Number(s);
    return s;
  }
  function applyTag(tag, v) {
    if (!tag || tag === '!' ) return v;
    if (tag === '!!str') return v == null ? '' : String(v);
    if (tag === '!!int' || tag === '!!float') return Number(v);
    if (tag === '!!bool') return v === true || /^true$/i.test(String(v));
    if (tag.startsWith('!!')) return v;
    if (tag === '!Ref') return { Ref: v };
    if (tag === '!Condition') return { Condition: v };
    if (tag === '!GetAtt') {
      if (typeof v === 'string') { const k = v.indexOf('.'); return { 'Fn::GetAtt': k < 0 ? [v, ''] : [v.slice(0, k), v.slice(k + 1)] }; }
      return { 'Fn::GetAtt': v };
    }
    if (/^![A-Z]/.test(tag)) return { ['Fn::' + tag.slice(1)]: v };
    return v;
  }

  function parseYAML(src) {
    const docs = [];
    let cur = [];
    String(src).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').forEach(l => {
      if (/^---(\s|$)/.test(l)) {
        docs.push(cur); cur = [];
        const rest = stripComment(l.slice(3)).trim();
        if (rest && !/^!/.test(rest)) cur.push(rest);
      } else if (/^\.\.\.(\s|$)/.test(l)) { docs.push(cur); cur = []; }
      else if (/^%/.test(l) && !cur.some(x => x.trim())) { /* directiva */ }
      else cur.push(l);
    });
    docs.push(cur);
    return docs.map(parseDoc).filter(d => d != null);
  }

  function parseDoc(raw) {
    const anchors = {};
    const lines = raw.map(r => {
      const ind = r.match(/^ */)[0].length;
      return { ind, txt: stripComment(r.slice(ind)).trimEnd(), raw: r };
    });
    const n = lines.length;
    let i = 0;
    const skip = () => { while (i < n && lines[i].txt === '') i++; };
    const isSeq = t => t === '-' || t.startsWith('- ');

    function splitKey(t) {
      let key, j;
      if (t[0] === '"' || t[0] === "'") {
        const e = quoteEnd(t, 0);
        if (e < 0) return null;
        j = e + 1;
        while (t[j] === ' ') j++;
        if (t[j] !== ':' || !(j + 1 === t.length || t[j + 1] === ' ')) return null;
        key = unquote(t.slice(0, e + 1));
      } else {
        if (/^[[{!&*|>]/.test(t) || t.startsWith('? ')) return null;
        const m = t.match(/^(.*?):(?: |$)/);
        if (!m) return null;
        key = m[1].trim();
        j = m[1].length;
      }
      return [key, t.slice(j + 1).trim()];
    }

    function block(minInd) {
      skip();
      if (i >= n || lines[i].ind < minInd) return null;
      const { ind, txt } = lines[i];
      if (isSeq(txt)) return seq(ind);
      if (splitKey(txt)) return map(ind);
      i++;
      return value(txt, ind - 1, false);
    }
    function seq(ind) {
      const arr = [];
      for (;;) {
        skip();
        if (i >= n) break;
        const l = lines[i];
        if (l.ind !== ind || !isSeq(l.txt)) break;
        const rest = l.txt.slice(1), t = rest.replace(/^ +/, '');
        if (!t) { i++; arr.push(block(ind + 1)); continue; }
        lines[i] = { ind: ind + 1 + rest.length - t.length, txt: t, raw: l.raw };
        arr.push(block(lines[i].ind));
      }
      return arr;
    }
    function map(ind) {
      const obj = {};
      for (;;) {
        skip();
        if (i >= n || lines[i].ind !== ind) break;
        const kv = splitKey(lines[i].txt);
        if (!kv) break;
        i++;
        const v = value(kv[1], ind, true);
        if (kv[0] === '<<') {
          (Array.isArray(v) ? v : [v]).forEach(o => isObj(o) && Object.keys(o).forEach(k => { if (!(k in obj)) obj[k] = o[k]; }));
        } else obj[kv[0]] = v;
      }
      return obj;
    }
    function value(rest, ind, inMap) {
      let tag = null, anchor = null, m;
      for (;;) {
        if ((m = rest.match(/^&([^\s,[\]{}]+)\s*/))) { anchor = m[1]; rest = rest.slice(m[0].length); }
        else if ((m = rest.match(/^(![^\s,[\]{}]*)\s*/))) { tag = m[1]; rest = rest.slice(m[0].length); }
        else break;
      }
      let v;
      if (rest === '') {
        skip();
        v = i < n && (lines[i].ind > ind || (inMap && lines[i].ind === ind && isSeq(lines[i].txt))) ? block(lines[i].ind) : null;
      } else if (rest[0] === '*') v = anchors[rest.slice(1).trim()];
      else if (rest[0] === '|' || rest[0] === '>') v = blockScalar(rest, ind);
      else if (rest[0] === '[' || rest[0] === '{') v = flowMulti(rest);
      else v = plain(rest, ind);
      v = applyTag(tag, v);
      if (anchor) anchors[anchor] = v;
      return v;
    }
    function blockScalar(head, ind) {
      const m = head.match(/^([|>])([+-]?)(\d?)([+-]?)/);
      const fold = m[1] === '>', chomp = m[2] || m[4];
      let ci = m[3] ? ind + Number(m[3]) : -1;
      const out = [];
      while (i < n) {
        const r = lines[i].raw;
        if (!r.trim()) { out.push(''); i++; continue; }
        const li = r.match(/^ */)[0].length;
        if (li <= ind) break;
        if (ci < 0) ci = li;
        if (li < ci) break;
        out.push(r.slice(ci)); i++;
      }
      let trail = 0;
      while (out.length && out[out.length - 1] === '') { out.pop(); trail++; }
      let body;
      if (!fold) body = out.join('\n');
      else {
        body = '';
        out.forEach((l, k) => {
          if (k === 0) body = l;
          else if (l === '' || /^\s/.test(l) || out[k - 1] === '' || /^\s/.test(out[k - 1])) body += '\n' + l;
          else body += ' ' + l;
        });
      }
      if (chomp === '-' || !body) return body;
      return body + (chomp === '+' ? '\n'.repeat(trail + 1) : '\n');
    }
    function plain(rest, ind) {
      if (rest[0] === '"' || rest[0] === "'") {
        let s = rest;
        while (quoteEnd(s, 0) < 0 && i < n) s += ' ' + lines[i++].raw.trim();
        const e = quoteEnd(s, 0);
        return e < 0 ? s : unquote(s.slice(0, e + 1));
      }
      let s = rest;
      // Continuación de un escalar sin comillas en las líneas siguientes (más sangradas)
      while (i < n && lines[i].txt && lines[i].ind > ind && !isSeq(lines[i].txt) && !splitKey(lines[i].txt)) s += ' ' + lines[i++].txt;
      return scalar(s.trim());
    }
    function flowMulti(rest) {
      let s = rest;
      const open = t => {
        let d = 0, q = null;
        for (let k = 0; k < t.length; k++) {
          const c = t[k];
          if (q) { if (q === '"' && c === '\\') k++; else if (c === q) q = null; continue; }
          if (c === '"' || c === "'") q = c;
          else if (c === '[' || c === '{') d++;
          else if (c === ']' || c === '}') d--;
        }
        return d > 0;
      };
      while (open(s) && i < n) s += ' ' + lines[i++].txt.trim();
      return flow(s);
    }
    function flow(s) {
      let p = 0;
      const ws = () => { while (p < s.length && /\s/.test(s[p])) p++; };
      const props = () => {
        let tag = null, anchor = null, m;
        for (;;) {
          ws();
          if ((m = s.slice(p).match(/^![^\s,[\]{}]*/))) { tag = m[0]; p += m[0].length; }
          else if ((m = s.slice(p).match(/^&[^\s,[\]{}]+/))) { anchor = m[0].slice(1); p += m[0].length; }
          else break;
        }
        return { tag, anchor };
      };
      function val() {
        const { tag, anchor } = props();
        let v;
        if (s[p] === '[') {
          p++; v = [];
          for (;;) {
            ws();
            if (p >= s.length || s[p] === ']') { p++; break; }
            if (s[p] === ',') { p++; continue; }
            const at = p, k = val();
            ws();
            if (s[p] === ':') { p++; v.push({ [String(k)]: val() }); } else v.push(k);
            if (p === at) p++;
          }
        } else if (s[p] === '{') {
          p++; v = {};
          for (;;) {
            ws();
            if (p >= s.length || s[p] === '}') { p++; break; }
            if (s[p] === ',') { p++; continue; }
            const at = p, k = val();
            ws();
            let vv = null;
            if (s[p] === ':') { p++; vv = val(); }
            if (k === '<<') (Array.isArray(vv) ? vv : [vv]).forEach(o => isObj(o) && Object.keys(o).forEach(x => { if (!(x in v)) v[x] = o[x]; }));
            else v[String(k)] = vv;
            if (p === at) p++;
          }
        } else if (s[p] === '"' || s[p] === "'") {
          const e = quoteEnd(s, p);
          if (e < 0) { v = s.slice(p + 1); p = s.length; } else { v = unquote(s.slice(p, e + 1)); p = e + 1; }
        } else if (s[p] === '*') {
          const m = s.slice(p).match(/^\*([^\s,[\]{}]+)/);
          p += m ? m[0].length : 1;
          v = m ? anchors[m[1]] : null;
        } else {
          const st = p;
          while (p < s.length && !/[,\]}]/.test(s[p]) && !(s[p] === ':' && /[\s,\]}]/.test(s[p + 1] ?? ' '))) p++;
          v = scalar(s.slice(st, p).trim());
        }
        v = applyTag(tag, v);
        if (anchor) anchors[anchor] = v;
        return v;
      }
      return val();
    }

    skip();
    if (i >= n) return null;
    return block(0);
  }

  /* ======================================================================
     Detección del formato
     ====================================================================== */
  function readDocs(text, name) {
    const t = String(text || '').trim();
    if (/^[[{]/.test(t)) {
      try { return [JSON.parse(t)]; } catch { /* puede ser YAML en estilo flujo */ }
    }
    if (/\.json$/i.test(name || '') && !/^[[{]/.test(t)) return [];
    return parseYAML(text);
  }

  const isK8s = d => isObj(d) && typeof d.apiVersion === 'string' && typeof d.kind === 'string';
  function detectDocs(docs) {
    const d = docs.find(isObj);
    if (!d) return null;
    if (Array.isArray(d.nodes) && !d.apiVersion) return 'diagramon';
    if (d.format_version && (d.values || d.planned_values || d.prior_state || d.configuration)) return 'terraform';
    if (Array.isArray(d.resources) && (d.terraform_version || d.lineage || d.version === 4)) return 'terraform';
    if (isObj(d.Resources) && Object.values(d.Resources).some(r => isObj(r) && typeof r.Type === 'string')) return 'cloudformation';
    if (docs.some(isK8s)) return 'kubernetes';
    if (isObj(d.services)) return 'compose';
    return null;
  }
  const detect = (text, name) => { try { return detectDocs(readDocs(text, name)); } catch { return null; } };

  /* ======================================================================
     Catálogo: tipo de recurso → tipo de Diagramon, icono y nombre del servicio
     [terraform, cloudformation, tipo, icono, servicio]
     ====================================================================== */
  const CATALOG = [
    // AWS · cómputo
    ['aws_instance', 'AWS::EC2::Instance', 'compute', 'aws/ec2', 'EC2'],
    ['aws_autoscaling_group', 'AWS::AutoScaling::AutoScalingGroup', 'compute', 'aws/autoscaling', 'Auto Scaling group'],
    ['aws_lambda_function', 'AWS::Lambda::Function', 'function', 'aws/lambda', 'Lambda'],
    [null, 'AWS::Serverless::Function', 'function', 'aws/lambda', 'Lambda (SAM)'],
    ['aws_ecs_cluster', 'AWS::ECS::Cluster', 'container', 'aws/ecs', 'ECS cluster'],
    ['aws_ecs_service', 'AWS::ECS::Service', 'container', 'aws/ecs', 'ECS service'],
    ['aws_eks_cluster', 'AWS::EKS::Cluster', 'k8s', 'aws/eks', 'EKS'],
    ['aws_ecr_repository', 'AWS::ECR::Repository', 'storage', 'aws/ecr', 'ECR'],
    ['aws_apprunner_service', 'AWS::AppRunner::Service', 'container', 'aws/apprunner', 'App Runner'],
    ['aws_elastic_beanstalk_environment', 'AWS::ElasticBeanstalk::Environment', 'compute', 'aws/beanstalk', 'Elastic Beanstalk'],
    ['aws_lightsail_instance', 'AWS::Lightsail::Instance', 'compute', 'aws/lightsail', 'Lightsail'],
    ['aws_batch_job_queue', 'AWS::Batch::JobQueue', 'compute', 'aws/batch', 'Batch'],
    // AWS · almacenamiento y datos
    ['aws_s3_bucket', 'AWS::S3::Bucket', 'storage', 'aws/s3', 'S3'],
    ['aws_glacier_vault', 'AWS::Glacier::Vault', 'storage', 'aws/glacier', 'S3 Glacier'],
    ['aws_efs_file_system', 'AWS::EFS::FileSystem', 'storage', 'aws/efs', 'EFS'],
    ['aws_fsx_lustre_file_system', 'AWS::FSx::FileSystem', 'storage', 'aws/fsx', 'FSx'],
    ['aws_fsx_windows_file_system', null, 'storage', 'aws/fsx', 'FSx'],
    ['aws_backup_vault', 'AWS::Backup::BackupVault', 'storage', 'aws/backup', 'AWS Backup'],
    ['aws_db_instance', 'AWS::RDS::DBInstance', 'db', 'aws/rds', 'RDS'],
    ['aws_rds_cluster', 'AWS::RDS::DBCluster', 'db', 'aws/aurora', 'Aurora'],
    ['aws_dynamodb_table', 'AWS::DynamoDB::Table', 'nosql', 'aws/dynamodb', 'DynamoDB'],
    ['aws_elasticache_cluster', 'AWS::ElastiCache::CacheCluster', 'cache', 'aws/elasticache', 'ElastiCache'],
    ['aws_elasticache_replication_group', 'AWS::ElastiCache::ReplicationGroup', 'cache', 'aws/elasticache', 'ElastiCache'],
    ['aws_elasticache_serverless_cache', 'AWS::ElastiCache::ServerlessCache', 'cache', 'aws/elasticache', 'ElastiCache'],
    ['aws_memorydb_cluster', 'AWS::MemoryDB::Cluster', 'cache', 'aws/memorydb', 'MemoryDB'],
    ['aws_docdb_cluster', 'AWS::DocDB::DBCluster', 'nosql', 'aws/documentdb', 'DocumentDB'],
    ['aws_neptune_cluster', 'AWS::Neptune::DBCluster', 'nosql', 'aws/neptune', 'Neptune'],
    // AWS · analítica
    ['aws_redshift_cluster', 'AWS::Redshift::Cluster', 'analytics', 'aws/redshift', 'Redshift'],
    ['aws_redshiftserverless_workgroup', 'AWS::RedshiftServerless::Workgroup', 'analytics', 'aws/redshift', 'Redshift Serverless'],
    ['aws_athena_workgroup', 'AWS::Athena::WorkGroup', 'analytics', 'aws/athena', 'Athena'],
    ['aws_glue_job', 'AWS::Glue::Job', 'analytics', 'aws/glue', 'Glue job'],
    ['aws_glue_crawler', 'AWS::Glue::Crawler', 'analytics', 'aws/glue', 'Glue crawler'],
    ['aws_glue_catalog_database', 'AWS::Glue::Database', 'analytics', 'aws/glue', 'Glue Data Catalog'],
    ['aws_glue_workflow', 'AWS::Glue::Workflow', 'analytics', 'aws/glue', 'Glue workflow'],
    ['aws_emr_cluster', 'AWS::EMR::Cluster', 'analytics', 'aws/emr', 'EMR'],
    ['aws_emrserverless_application', 'AWS::EMRServerless::Application', 'analytics', 'aws/emr', 'EMR Serverless'],
    ['aws_opensearch_domain', 'AWS::OpenSearchService::Domain', 'analytics', 'aws/opensearch', 'OpenSearch'],
    ['aws_elasticsearch_domain', 'AWS::Elasticsearch::Domain', 'analytics', 'aws/opensearch', 'OpenSearch'],
    ['aws_opensearchserverless_collection', 'AWS::OpenSearchServerless::Collection', 'analytics', 'aws/opensearch', 'OpenSearch Serverless'],
    ['aws_lakeformation_resource', 'AWS::LakeFormation::Resource', 'analytics', 'aws/lakeformation', 'Lake Formation'],
    ['aws_kinesis_stream', 'AWS::Kinesis::Stream', 'stream', 'aws/kinesis', 'Kinesis Data Streams'],
    ['aws_kinesis_firehose_delivery_stream', 'AWS::KinesisFirehose::DeliveryStream', 'stream', 'aws/firehose', 'Data Firehose'],
    ['aws_msk_cluster', 'AWS::MSK::Cluster', 'stream', 'aws/msk', 'MSK'],
    ['aws_msk_serverless_cluster', 'AWS::MSK::ServerlessCluster', 'stream', 'aws/msk', 'MSK Serverless'],
    ['aws_dms_replication_task', 'AWS::DMS::ReplicationTask', 'stream', null, 'DMS task'],
    // AWS · red
    ['aws_cloudfront_distribution', 'AWS::CloudFront::Distribution', 'cdn', 'aws/cloudfront', 'CloudFront'],
    ['aws_route53_zone', 'AWS::Route53::HostedZone', 'dns', 'aws/route53', 'Route 53'],
    ['aws_lb', 'AWS::ElasticLoadBalancingV2::LoadBalancer', 'lb', 'aws/elb', 'Load balancer'],
    ['aws_alb', null, 'lb', 'aws/elb', 'Application LB'],
    ['aws_elb', 'AWS::ElasticLoadBalancing::LoadBalancer', 'lb', 'aws/elb', 'Classic LB'],
    ['aws_api_gateway_rest_api', 'AWS::ApiGateway::RestApi', 'gateway', 'aws/apigateway', 'API Gateway'],
    ['aws_apigatewayv2_api', 'AWS::ApiGatewayV2::Api', 'gateway', 'aws/apigateway', 'API Gateway'],
    [null, 'AWS::Serverless::Api', 'gateway', 'aws/apigateway', 'API Gateway (SAM)'],
    ['aws_appsync_graphql_api', 'AWS::AppSync::GraphQLApi', 'gateway', 'aws/appsync', 'AppSync'],
    ['aws_nat_gateway', 'AWS::EC2::NatGateway', 'firewall', 'aws/vpc', 'NAT gateway'],
    ['aws_vpc_endpoint', 'AWS::EC2::VPCEndpoint', 'firewall', 'aws/privatelink', 'VPC endpoint'],
    ['aws_ec2_transit_gateway', 'AWS::EC2::TransitGateway', 'lb', 'aws/transitgateway', 'Transit Gateway'],
    ['aws_dx_connection', 'AWS::DirectConnect::Connection', 'firewall', 'aws/directconnect', 'Direct Connect'],
    ['aws_globalaccelerator_accelerator', 'AWS::GlobalAccelerator::Accelerator', 'cdn', 'aws/globalaccelerator', 'Global Accelerator'],
    // AWS · integración
    ['aws_sqs_queue', 'AWS::SQS::Queue', 'queue', 'aws/sqs', 'SQS'],
    ['aws_sns_topic', 'AWS::SNS::Topic', 'events', 'aws/sns', 'SNS'],
    ['aws_cloudwatch_event_rule', 'AWS::Events::Rule', 'events', 'aws/eventbridge', 'EventBridge rule'],
    ['aws_cloudwatch_event_bus', 'AWS::Events::EventBus', 'events', 'aws/eventbridge', 'EventBridge bus'],
    ['aws_scheduler_schedule', 'AWS::Scheduler::Schedule', 'events', 'aws/eventbridge', 'EventBridge Scheduler'],
    ['aws_sfn_state_machine', 'AWS::StepFunctions::StateMachine', 'events', 'aws/stepfunctions', 'Step Functions'],
    [null, 'AWS::Serverless::StateMachine', 'events', 'aws/stepfunctions', 'Step Functions (SAM)'],
    ['aws_mq_broker', 'AWS::AmazonMQ::Broker', 'queue', 'aws/mq', 'Amazon MQ'],
    ['aws_ses_domain_identity', 'AWS::SES::EmailIdentity', 'email', 'aws/ses', 'SES'],
    ['aws_sesv2_email_identity', null, 'email', 'aws/ses', 'SES'],
    // AWS · seguridad, operaciones e IA
    ['aws_cognito_user_pool', 'AWS::Cognito::UserPool', 'auth', 'aws/cognito', 'Cognito'],
    ['aws_kms_key', 'AWS::KMS::Key', 'secrets', 'aws/kms', 'KMS'],
    ['aws_secretsmanager_secret', 'AWS::SecretsManager::Secret', 'secrets', 'aws/secretsmanager', 'Secrets Manager'],
    ['aws_acm_certificate', 'AWS::CertificateManager::Certificate', 'secrets', 'aws/acm', 'ACM'],
    ['aws_wafv2_web_acl', 'AWS::WAFv2::WebACL', 'firewall', 'aws/waf', 'WAF'],
    ['aws_guardduty_detector', 'AWS::GuardDuty::Detector', 'auth', 'aws/guardduty', 'GuardDuty'],
    ['aws_cloudtrail', 'AWS::CloudTrail::Trail', 'monitor', 'aws/cloudtrail', 'CloudTrail'],
    ['aws_codepipeline', 'AWS::CodePipeline::Pipeline', 'cicd', 'aws/codepipeline', 'CodePipeline'],
    ['aws_codebuild_project', 'AWS::CodeBuild::Project', 'cicd', 'aws/codebuild', 'CodeBuild'],
    ['aws_sagemaker_endpoint', 'AWS::SageMaker::Endpoint', 'ai', 'aws/sagemaker', 'SageMaker'],
    ['aws_sagemaker_domain', 'AWS::SageMaker::Domain', 'ai', 'aws/sagemaker', 'SageMaker'],
    ['aws_sagemaker_notebook_instance', 'AWS::SageMaker::NotebookInstance', 'ai', 'aws/sagemaker', 'SageMaker'],
    ['aws_bedrockagent_agent', 'AWS::Bedrock::Agent', 'ai', 'aws/bedrock', 'Bedrock agent'],
    ['aws_bedrockagent_knowledge_base', 'AWS::Bedrock::KnowledgeBase', 'ai', 'aws/bedrock', 'Bedrock knowledge base'],
    // Azure
    ['azurerm_linux_virtual_machine', null, 'compute', 'azure/vm', 'Virtual Machine'],
    ['azurerm_windows_virtual_machine', null, 'compute', 'azure/vm', 'Virtual Machine'],
    ['azurerm_virtual_machine', null, 'compute', 'azure/vm', 'Virtual Machine'],
    ['azurerm_linux_virtual_machine_scale_set', null, 'compute', 'azure/vmss', 'VM Scale Set'],
    ['azurerm_windows_virtual_machine_scale_set', null, 'compute', 'azure/vmss', 'VM Scale Set'],
    ['azurerm_linux_web_app', null, 'compute', 'azure/appservice', 'App Service'],
    ['azurerm_windows_web_app', null, 'compute', 'azure/appservice', 'App Service'],
    ['azurerm_app_service', null, 'compute', 'azure/appservice', 'App Service'],
    ['azurerm_linux_function_app', null, 'function', 'azure/functions', 'Functions'],
    ['azurerm_windows_function_app', null, 'function', 'azure/functions', 'Functions'],
    ['azurerm_function_app', null, 'function', 'azure/functions', 'Functions'],
    ['azurerm_kubernetes_cluster', null, 'k8s', 'azure/aks', 'AKS'],
    ['azurerm_container_app', null, 'container', 'azure/containerapps', 'Container Apps'],
    ['azurerm_container_group', null, 'container', 'azure/aci', 'Container Instances'],
    ['azurerm_container_registry', null, 'storage', 'azure/acr', 'Container Registry'],
    ['azurerm_static_web_app', null, 'web', 'azure/staticapps', 'Static Web Apps'],
    ['azurerm_storage_account', null, 'storage', 'azure/storage', 'Storage account'],
    ['azurerm_mssql_server', null, 'db', 'azure/sqldb', 'SQL Server'],
    ['azurerm_mssql_database', null, 'db', 'azure/sqldb', 'SQL Database'],
    ['azurerm_mssql_managed_instance', null, 'db', 'azure/sqlmi', 'SQL Managed Instance'],
    ['azurerm_postgresql_flexible_server', null, 'db', 'azure/postgresql', 'PostgreSQL'],
    ['azurerm_mysql_flexible_server', null, 'db', 'azure/mysql', 'MySQL'],
    ['azurerm_cosmosdb_account', null, 'nosql', 'azure/cosmosdb', 'Cosmos DB'],
    ['azurerm_redis_cache', null, 'cache', 'azure/redis', 'Cache for Redis'],
    ['azurerm_synapse_workspace', null, 'analytics', 'azure/synapse', 'Synapse'],
    ['azurerm_databricks_workspace', null, 'analytics', 'azure/databricks', 'Databricks'],
    ['azurerm_data_factory', null, 'analytics', 'azure/datafactory', 'Data Factory'],
    ['azurerm_kusto_cluster', null, 'analytics', 'azure/dataexplorer', 'Data Explorer'],
    ['azurerm_stream_analytics_job', null, 'stream', 'azure/streamanalytics', 'Stream Analytics'],
    ['azurerm_lb', null, 'lb', 'azure/loadbalancer', 'Load Balancer'],
    ['azurerm_application_gateway', null, 'lb', 'azure/appgateway', 'Application Gateway'],
    ['azurerm_cdn_frontdoor_profile', null, 'cdn', 'azure/frontdoor', 'Front Door'],
    ['azurerm_dns_zone', null, 'dns', 'azure/dns', 'DNS'],
    ['azurerm_firewall', null, 'firewall', 'azure/firewall', 'Firewall'],
    ['azurerm_bastion_host', null, 'firewall', 'azure/bastion', 'Bastion'],
    ['azurerm_private_endpoint', null, 'firewall', 'azure/privateendpoint', 'Private Endpoint'],
    ['azurerm_api_management', null, 'gateway', 'azure/apim', 'API Management'],
    ['azurerm_servicebus_namespace', null, 'queue', 'azure/servicebus', 'Service Bus'],
    ['azurerm_eventhub_namespace', null, 'stream', 'azure/eventhubs', 'Event Hubs'],
    ['azurerm_eventgrid_topic', null, 'events', 'azure/eventgrid', 'Event Grid'],
    ['azurerm_logic_app_workflow', null, 'events', 'azure/logicapps', 'Logic Apps'],
    ['azurerm_key_vault', null, 'secrets', 'azure/keyvault', 'Key Vault'],
    ['azurerm_log_analytics_workspace', null, 'monitor', 'azure/loganalytics', 'Log Analytics'],
    ['azurerm_application_insights', null, 'monitor', 'azure/appinsights', 'Application Insights'],
    ['azurerm_cognitive_account', null, 'ai', 'azure/openai', 'Azure AI'],
    ['azurerm_machine_learning_workspace', null, 'ai', 'azure/ml', 'Machine Learning'],
    ['azurerm_search_service', null, 'ai', 'azure/aisearch', 'AI Search'],
    ['azurerm_postgresql_server', null, 'db', 'azure/postgresql', 'PostgreSQL'],
    ['azurerm_mysql_server', null, 'db', 'azure/mysql', 'MySQL'],
    ['azurerm_cosmosdb_postgresql_cluster', null, 'db', 'azure/cosmosdb', 'Cosmos DB for PostgreSQL'],
    ['azurerm_mssql_elasticpool', null, 'db', 'azure/sqldb', 'SQL elastic pool'],
    ['azurerm_cdn_profile', null, 'cdn', 'azure/cdn', 'CDN'],
    ['azurerm_traffic_manager_profile', null, 'dns', 'azure/trafficmanager', 'Traffic Manager'],
    ['azurerm_web_application_firewall_policy', null, 'firewall', 'azure/waf', 'WAF policy'],
    ['azurerm_cdn_frontdoor_firewall_policy', null, 'firewall', 'azure/waf', 'Front Door WAF'],
    ['azurerm_virtual_network_gateway', null, 'firewall', 'azure/vpngateway', 'VPN / ExpressRoute gateway'],
    ['azurerm_express_route_circuit', null, 'firewall', 'azure/expressroute', 'ExpressRoute'],
    ['azurerm_eventgrid_domain', null, 'events', 'azure/eventgrid', 'Event Grid domain'],
    ['azurerm_eventgrid_system_topic', null, 'events', 'azure/eventgrid', 'Event Grid system topic'],
    ['azurerm_signalr_service', null, 'events', 'azure/signalr', 'SignalR'],
    ['azurerm_communication_service', null, 'email', 'azure/communication', 'Communication Services'],
    ['azurerm_container_app_environment', null, 'container', 'azure/containerapps', 'Container Apps environment'],
    ['azurerm_batch_account', null, 'compute', 'azure/batch', 'Batch'],
    ['azurerm_data_lake_store', null, 'storage', 'azure/datalake', 'Data Lake Storage'],
    ['azurerm_netapp_account', null, 'storage', 'azure/netapp', 'NetApp Files'],
    ['azurerm_recovery_services_vault', null, 'storage', 'azure/recovery', 'Recovery Services vault'],
    ['azurerm_sentinel_log_analytics_workspace_onboarding', null, 'monitor', 'azure/sentinel', 'Sentinel'],
    // Google Cloud
    ['google_compute_instance', null, 'compute', 'gcp/computeengine', 'Compute Engine'],
    ['google_compute_instance_group_manager', null, 'compute', 'gcp/computeengine', 'Managed instance group'],
    ['google_container_cluster', null, 'k8s', 'gcp/gke', 'GKE'],
    ['google_cloud_run_service', null, 'container', 'gcp/cloudrun', 'Cloud Run'],
    ['google_cloud_run_v2_service', null, 'container', 'gcp/cloudrun', 'Cloud Run'],
    ['google_cloud_run_v2_job', null, 'container', 'gcp/cloudrun', 'Cloud Run job'],
    ['google_cloudfunctions_function', null, 'function', 'gcp/cloudfunctions', 'Cloud Functions'],
    ['google_cloudfunctions2_function', null, 'function', 'gcp/cloudfunctions', 'Cloud Functions'],
    ['google_app_engine_application', null, 'compute', 'gcp/appengine', 'App Engine'],
    ['google_storage_bucket', null, 'storage', 'gcp/cloudstorage', 'Cloud Storage'],
    ['google_filestore_instance', null, 'storage', 'gcp/filestore', 'Filestore'],
    ['google_artifact_registry_repository', null, 'storage', 'gcp/artifactregistry', 'Artifact Registry'],
    ['google_sql_database_instance', null, 'db', 'gcp/cloudsql', 'Cloud SQL'],
    ['google_alloydb_cluster', null, 'db', 'gcp/alloydb', 'AlloyDB'],
    ['google_spanner_instance', null, 'db', 'gcp/spanner', 'Spanner'],
    ['google_firestore_database', null, 'nosql', 'gcp/firestore', 'Firestore'],
    ['google_bigtable_instance', null, 'nosql', 'gcp/bigtable', 'Bigtable'],
    ['google_redis_instance', null, 'cache', 'gcp/memorystore', 'Memorystore'],
    ['google_bigquery_dataset', null, 'analytics', 'gcp/bigquery', 'BigQuery'],
    ['google_dataflow_job', null, 'stream', 'gcp/dataflow', 'Dataflow'],
    ['google_dataproc_cluster', null, 'analytics', 'gcp/dataproc', 'Dataproc'],
    ['google_composer_environment', null, 'analytics', 'gcp/composer', 'Composer'],
    ['google_pubsub_topic', null, 'events', 'gcp/pubsub', 'Pub/Sub'],
    ['google_cloud_tasks_queue', null, 'queue', 'gcp/cloudtasks', 'Cloud Tasks'],
    ['google_workflows_workflow', null, 'events', 'gcp/workflows', 'Workflows'],
    ['google_compute_url_map', null, 'lb', 'gcp/loadbalancing', 'Load balancer'],
    ['google_dns_managed_zone', null, 'dns', 'gcp/clouddns', 'Cloud DNS'],
    ['google_compute_security_policy', null, 'firewall', 'gcp/cloudarmor', 'Cloud Armor'],
    ['google_compute_router_nat', null, 'firewall', 'gcp/cloudnat', 'Cloud NAT'],
    ['google_api_gateway_api', null, 'gateway', 'gcp/apigateway', 'API Gateway'],
    ['google_kms_crypto_key', null, 'secrets', 'gcp/kms', 'Cloud KMS'],
    ['google_secret_manager_secret', null, 'secrets', 'gcp/secretmanager', 'Secret Manager'],
    ['google_vertex_ai_endpoint', null, 'ai', 'gcp/vertexai', 'Vertex AI'],
    ['google_cloud_scheduler_job', null, 'events', null, 'Cloud Scheduler'],
    ['google_eventarc_trigger', null, 'events', 'gcp/eventarc', 'Eventarc'],
    ['google_cloudbuild_trigger', null, 'cicd', 'gcp/cloudbuild', 'Cloud Build'],
    ['google_clouddeploy_delivery_pipeline', null, 'cicd', 'gcp/clouddeploy', 'Cloud Deploy'],
    ['google_identity_platform_config', null, 'auth', 'gcp/identityplatform', 'Identity Platform'],
    ['google_compute_ha_vpn_gateway', null, 'firewall', null, 'HA VPN'],
    ['google_compute_interconnect_attachment', null, 'firewall', 'gcp/interconnect', 'Interconnect'],
    ['google_compute_region_instance_group_manager', null, 'compute', 'gcp/computeengine', 'Managed instance group'],
    ['google_compute_backend_bucket', null, 'cdn', 'gcp/cloudcdn', 'Cloud CDN'],
    ['google_notebooks_instance', null, 'ai', 'gcp/vertexai', 'Vertex AI Workbench'],
    ['google_vertex_ai_index', null, 'ai', 'gcp/vertexai', 'Vertex AI index']
  ];
  const BY_TF = new Map(), BY_CFN = new Map();
  CATALOG.forEach(([tf, cfn, type, icon, svc]) => {
    const row = { type, icon, svc };
    if (tf) BY_TF.set(tf, row);
    if (cfn) BY_CFN.set(cfn, row);
  });

  // Recursos que se dibujan como grupos (contenedores de red)
  const GROUPS = {
    aws_vpc: 'vpc', 'AWS::EC2::VPC': 'vpc', aws_subnet: 'subnet', 'AWS::EC2::Subnet': 'subnet',
    azurerm_resource_group: 'rg', azurerm_virtual_network: 'vpc', azurerm_subnet: 'subnet',
    google_compute_network: 'vpc', google_compute_subnetwork: 'subnet', google_project: 'rg'
  };

  /* Puentes: recursos ocultos que solo unen otros dos (notificaciones, suscripciones,
     oyentes de balanceadores…). La conexión los atraviesa.
     flip: qué referencias apuntan hacia el puente (el origen del flujo). */
  const BRIDGES = {
    aws_s3_bucket_notification: { flip: /^bucket$/, style: 'async', label: v => s3Events(v) },
    aws_lambda_event_source_mapping: { flip: /event_source/, style: 'async' },
    'AWS::Lambda::EventSourceMapping': { flip: /EventSource/, style: 'async' },
    aws_sns_topic_subscription: { flip: /topic/, style: 'async', label: v => str(v.protocol) },
    'AWS::SNS::Subscription': { flip: /Topic/, style: 'async', label: v => str(v.Protocol) },
    aws_cloudwatch_event_target: { flip: /^(rule|event_bus_name)$/, style: 'async' },
    aws_pipes_pipe: { flip: /^source/, style: 'async' },
    'AWS::Pipes::Pipe': { flip: /^Source/, style: 'async' },
    aws_lb_listener: { flip: /load_balancer/ }, aws_alb_listener: { flip: /load_balancer/ },
    'AWS::ElasticLoadBalancingV2::Listener': { flip: /LoadBalancer/ },
    aws_lb_listener_rule: { flip: /listener/ }, 'AWS::ElasticLoadBalancingV2::ListenerRule': { flip: /Listener/ },
    aws_lb_target_group: { flip: /^$/ }, aws_alb_target_group: { flip: /^$/ }, 'AWS::ElasticLoadBalancingV2::TargetGroup': { flip: /^$/ },
    aws_lb_target_group_attachment: { flip: /target_group/ }, aws_alb_target_group_attachment: { flip: /target_group/ },
    aws_api_gateway_integration: { flip: /rest_api/ }, aws_apigatewayv2_integration: { flip: /api_id/ },
    'AWS::ApiGatewayV2::Integration': { flip: /ApiId/ }, 'AWS::ApiGateway::Method': { flip: /RestApi|ResourceId/ },
    google_pubsub_subscription: { flip: /topic/, style: 'async' },
    google_compute_backend_service: { flip: /^$/, plain: true }, google_compute_target_https_proxy: { flip: /^$/, plain: true },
    google_compute_global_forwarding_rule: { flip: /^$/, plain: true },
    google_compute_region_backend_service: { flip: /^$/, plain: true }, google_compute_target_http_proxy: { flip: /^$/, plain: true },
    google_compute_target_ssl_proxy: { flip: /^$/, plain: true }, google_compute_target_tcp_proxy: { flip: /^$/, plain: true },
    google_compute_forwarding_rule: { flip: /^$/, plain: true },
    google_compute_region_network_endpoint_group: { flip: /^$/, plain: true }, google_compute_network_endpoint_group: { flip: /^$/, plain: true },
    // Azure: el rol asignado une la identidad (la aplicación) con el recurso del alcance
    azurerm_role_assignment: { flip: /principal/, style: 'optional' }
  };
  const s3Events = v => {
    const ev = [v.lambda_function, v.queue, v.topic].flat().filter(Boolean).flatMap(x => x.events || []);
    const short = [...new Set(ev.map(e => String(e).replace(/^s3:/, '').split(':')[0]))];
    return short.join(', ');
  };

  // Subrecursos que se pliegan en su recurso principal: sus referencias pasan a ser de él
  const FOLDS = [
    { re: /^aws_s3_bucket_(?!policy$|notification$)/, parent: 'aws_s3_bucket' },
    { re: /^aws_athena_named_query$/, parent: 'aws_athena_workgroup' },
    { re: /^aws_kinesis_firehose_/, parent: 'aws_kinesis_firehose_delivery_stream' },
    { re: /^AWS::Athena::NamedQuery$/, parent: 'AWS::Athena::WorkGroup' },
    { re: /^AWS::S3::BucketPolicy$/, parent: null },
    // Azure y Google Cloud: las referencias hacia el subrecurso pasan al principal (redirect)
    { re: /^google_container_node_pool$/, parent: 'google_container_cluster', redirect: true },
    { re: /^google_bigquery_table$/, parent: 'google_bigquery_dataset', redirect: true },
    { re: /^google_spanner_database$/, parent: 'google_spanner_instance', redirect: true },
    { re: /^azurerm_servicebus_(queue|topic|subscription|namespace_authorization_rule|queue_authorization_rule|topic_authorization_rule)$/, parent: 'azurerm_servicebus_namespace', redirect: true },
    { re: /^azurerm_eventhub(_consumer_group|_authorization_rule)?$/, parent: 'azurerm_eventhub_namespace', redirect: true },
    { re: /^azurerm_kubernetes_cluster_node_pool$/, parent: 'azurerm_kubernetes_cluster', redirect: true },
    { re: /^azurerm_cdn_frontdoor_(endpoint|origin_group|origin|route|rule_set|rule|custom_domain|custom_domain_association|secret|security_policy)$/, parent: 'azurerm_cdn_frontdoor_profile', redirect: true },
    { re: /^azurerm_cdn_endpoint$/, parent: 'azurerm_cdn_profile', redirect: true }
  ];

  // Recursos de apoyo que se ocultan (IAM, rutas, reglas, asociaciones, configuraciones…)
  const HIDE_TF = /^(aws_iam_|aws_security_group|aws_vpc_security_group|aws_network_acl|aws_internet_gateway|aws_egress_only_internet_gateway|aws_eip|aws_route|aws_main_route|aws_default_|aws_lakeformation_(permissions|data_lake_settings|lf_)|aws_glue_(catalog_table|connection|security_configuration|trigger|classifier)|aws_cloudwatch_(log_|metric_alarm|dashboard)|aws_lambda_(permission|alias|layer_version|function_url|function_event_invoke_config)|aws_launch_template|aws_launch_configuration|aws_ecs_task_definition|aws_kms_alias|aws_ssm_|aws_db_subnet_group|aws_elasticache_subnet_group|aws_dms_(endpoint|replication_subnet_group)|aws_api_gateway_(resource|method|deployment|stage|method_response|integration_response|account|usage_plan)|aws_apigatewayv2_(route|stage|deployment)|aws_s3_object|aws_vpc_dhcp|aws_flow_log|azurerm_(network_(security|interface|watcher|ddos)|public_ip|role_|user_assigned_identity|subnet_|storage_(container|blob|share|queue|table|account_(network_rules|customer_managed_key))|key_vault_|service_plan|app_service_(plan|virtual_network|slot|certificate|custom_hostname|active_slot|source_control)|(linux|windows)_(web|function)_app_slot|private_dns_|monitor_|virtual_network_(peering|dns_servers)|route|nat_gateway|dns_[a-z_]*record|mssql_(firewall|virtual_network_rule|server_(security|extended|vulnerability|transparent|dns)|outbound|job|managed_database|database_(extended|vulnerability))|postgresql_(flexible_server_(database|configuration|firewall)|database|configuration|firewall)|mysql_(flexible_(database|server_configuration|server_firewall)|database|configuration|firewall)|cosmosdb_(sql|mongo|cassandra|table|gremlin)|application_gateway_|eventgrid_(event_subscription|topic_)|api_management_(api|product|named|logger|backend|subscription|user|group|certificate|custom|policy|diagnostic|gateway)|container_app_(custom|environment_)|redis_(firewall|linked)|log_analytics_(solution|saved|data|linked|workspace_table)|application_insights_(api_key|web_test|smart)|management_lock|policy_|resource_group_(policy|template)|template_deployment|dashboard|portal_)|google_(project_|service_account|service_networking|vpc_access|compute_(firewall|address|global_address|router$|managed_ssl_certificate|ssl_certificate|ssl_policy|region_ssl|health_check|region_health_check|http_health_check|network_peering|route|disk|resource_policy|region_instance_template|instance_template|network_firewall|firewall_policy|image|snapshot|project_metadata|shared_vpc)|bigquery_(table|routine|dataset_iam|dataset_access|job|connection)|storage_(bucket_iam|bucket_object|bucket_acl|bucket_access|default_object|notification|hmac)|pubsub_(topic_iam|subscription_iam|schema)|monitoring_|logging_|kms_(key_ring|crypto_key_iam)|secret_manager_secret_version|dns_record_set|cloud_run(_v2)?_(service|job)_iam|cloudfunctions2?_function_iam|artifact_registry_repository_iam|organization_|folder_|iam_|sql_(database|user|ssl_cert)$|bigtable_(table|gc_policy)|spanner_database_iam)|random_|null_|time_|local_|tls_|archive_|terraform_)|(_policy|_policy_attachment|_attachment|_association|_permission|_versioning|_acl|_iam_binding|_iam_member|_iam_policy)$/;
  const HIDE_CFN = /^(AWS::IAM::|AWS::EC2::(SecurityGroup|Route|SubnetRouteTableAssociation|InternetGateway|VPCGatewayAttachment|EIP|NetworkAcl|SubnetNetworkAcl|NetworkInterface|LaunchTemplate|VPCEndpointService)|AWS::Logs::|AWS::LakeFormation::(Permissions|DataLakeSettings|PrincipalPermissions)|AWS::Glue::(Table|Connection|SecurityConfiguration|Trigger|Classifier)|AWS::Lambda::(Permission|Version|Alias|LayerVersion|Url)|AWS::KMS::Alias|AWS::SSM::|AWS::RDS::DB(SubnetGroup|ParameterGroup|ClusterParameterGroup)|AWS::ElastiCache::SubnetGroup|AWS::ApiGateway::(Resource|Deployment|Stage|Account)|AWS::ApiGatewayV2::(Route|Stage|Deployment)|AWS::CloudWatch::|AWS::ECS::TaskDefinition|AWS::CloudFormation::|AWS::CDK::|Custom::)|Policy$/;

  // Dirección del flujo según el nombre del campo: "source", "input", "s3_target"… apuntan hacia el recurso
  const FLIP = /(^|[^a-zA-Z])(source|input|src|SOURCE|INPUT|SRC|event_trigger)|[a-z](Source|Input)|s3_?targets?|jdbc_?targets?|catalog_?targets?|dynamo_?db_?targets?|delta_?targets?|S3Targets|JdbcTargets|CatalogTargets|DynamoDBTargets|DeltaTargets|target_?groups?|TargetGroup/;
  const DATA = /bucket|s3|stream|path|destination|output|target|source|input|Bucket|S3|Stream|Path|Destination|Output|Target|Source|Input|SOURCE|TARGET|BUCKET|OUTPUT|INPUT/;
  const SIDE_TYPES = new Set(['secrets', 'monitor']);

  /* ---------- etiquetas de clasificación de datos ---------- */
  function dataFromTags(tags) {
    const keys = Object.keys(C.dataClasses || {});
    if (!keys.length || !tags) return [];
    const out = new Set();
    Object.entries(tags).forEach(([k, v]) => {
      if (!/classif|data[_-]?class|sensitivity/i.test(k)) return;
      String(v).split(/[,;/ ]+/).forEach(x => {
        const f = x.toLowerCase().trim();
        if (!f) return;
        const hit = keys.find(c => c === f || String(C.dataClasses[c].short).toLowerCase() === f);
        if (hit) out.add(hit);
        else if (/^(restricted|secret|sensitive)$/.test(f) && C.dataClasses.confidential) out.add('confidential');
      });
    });
    return [...out];
  }
  const cfnTags = t => (Array.isArray(t) ? Object.fromEntries(t.filter(x => isObj(x) && x.Key != null).map(x => [x.Key, plainStr(x.Value)])) : isObj(t) ? t : {});
  // Texto legible de un valor de CloudFormation: usa el valor por defecto de los parámetros
  // y quita ${AWS::StackName} y similares
  let PARAMS = {};
  function plainStr(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (isObj(v) && typeof v.Ref === 'string' && PARAMS[v.Ref] != null) return String(PARAMS[v.Ref]);
    if (isObj(v) && typeof v['Fn::Sub'] === 'string') return v['Fn::Sub'].replace(/\$\{([^}]*)\}/g, (_, k) => (PARAMS[k] != null ? String(PARAMS[k]) : '')).replace(/^[-_.]+|[-_.]+$/g, '').replace(/([-_.])[-_.]+/g, '$1');
    if (isObj(v) && Array.isArray(v['Fn::Sub'])) return plainStr({ 'Fn::Sub': v['Fn::Sub'][0] });
    if (isObj(v) && Array.isArray(v['Fn::Join'])) return (v['Fn::Join'][1] || []).map(plainStr).filter(Boolean).join(v['Fn::Join'][0] || '');
    return '';
  }

  /* ======================================================================
     Modelo intermedio común a Terraform y CloudFormation
     r = { key, type, row, role, name, detail, tags, refs: [{ to, path }], values, region }
     ====================================================================== */
  function classify(r, cfn) {
    if (GROUPS[r.type]) return GROUPS[r.type];
    const row = cfn ? BY_CFN.get(r.type) : BY_TF.get(r.type);
    if (row) { r.row = row; return 'node'; }
    if (BRIDGES[r.type]) return 'bridge';
    if (FOLDS.some(f => f.re.test(r.type))) return 'fold';
    if (cfn ? HIDE_CFN.test(r.type) : HIDE_TF.test(r.type)) return 'hidden';
    if (!cfn && !/^(aws|azurerm|google)_/.test(r.type)) return 'hidden';
    return 'node';
  }

  function assemble(list, fmt) {
    const cfn = fmt === 'cloudformation';
    const byKey = new Map(list.map(r => [r.key, r]));
    list.forEach(r => { r.role = classify(r, cfn); });

    // Plegar subrecursos en su principal (el principal puede estar a varios saltos: origen › grupo de orígenes › perfil)
    const findParent = (r, type, depth) => {
      for (const x of r.refs) {
        const p = byKey.get(x.to);
        if (!p || p === r) continue;
        if (p.type === type) return p;
        if (depth < 4 && FOLDS.some(f => f.re.test(p.type))) { const q = findParent(p, type, depth + 1); if (q) return q; }
      }
      return null;
    };
    list.filter(r => r.role === 'fold').forEach(r => {
      const f = FOLDS.find(x => x.re.test(r.type));
      const parent = f.parent && findParent(r, f.parent, 0);
      if (parent) {
        r.refs.forEach(x => { if (x.to !== parent.key) parent.refs.push({ to: x.to, path: x.path }); });
        if (f.redirect) list.forEach(o => { if (o !== parent && o !== r) o.refs.forEach(x => { if (x.to === r.key) x.to = parent.key; }); });
      }
      r.role = 'hidden';
    });

    const isGroup = r => r && ['vpc', 'subnet', 'rg'].includes(r.role);
    const provOf = t => (/^(aws_|AWS::)/.test(t) ? 'aws' : /^azurerm_/.test(t) ? 'azure' : /^google_/.test(t) ? 'gcp' : 'other');
    const region = list.filter(r => provOf(r.type) === 'aws').map(r => r.region).find(Boolean) || '';
    const rgOf = r => r.refs.map(x => byKey.get(x.to)).find(t => t && t.role === 'rg');

    // Azure: los componentes sin grupo de recursos propio (la base de datos de un servidor SQL…) heredan el del recurso al que apuntan con `*_id`
    // Un servidor SQL con bases de datos se oculta: sus conexiones pasan a las bases
    list.filter(r => r.role === 'node' && r.type === 'azurerm_mssql_server').forEach(srv => {
      const dbs = list.filter(d => d.role === 'node' && d.type === 'azurerm_mssql_database' && d.refs.some(x => x.to === srv.key));
      if (!dbs.length) return;
      list.forEach(o => {
        if (o === srv || dbs.includes(o)) return;
        const hits = o.refs.filter(x => x.to === srv.key);
        hits.forEach(x => dbs.forEach(d => o.refs.push({ to: d.key, path: x.path, dep: x.dep })));
        o.refs = o.refs.filter(x => x.to !== srv.key);
      });
      dbs.forEach(d => { d.detail = [srv.name, d.detail].filter(Boolean).join(' · '); });
      srv.role = 'hidden';
    });
    for (let pass = 0; pass < 2; pass++) list.filter(r => provOf(r.type) === 'azure' && !isGroup(r)).forEach(r => {
      if (!rgOf(r)) {
        const via = r.refs.find(x => /_id$/.test(x.path) && byKey.get(x.to) && provOf(byKey.get(x.to).type) === 'azure' && !isGroup(byKey.get(x.to)) && rgOf(byKey.get(x.to)));
        if (via) { const up = byKey.get(via.to); r.refs.push({ to: rgOf(up).key, path: 'resource_group_name' }); if (!r.region) r.region = up.region; }
      }
      if (!r.region && rgOf(r)) r.region = rgOf(r).region;
    });
    // Región de cada nube (solo si todo está en una): se muestra en la nube y la heredan los demás
    const provRegion = p => {
      const rs = [...new Set(list.filter(r => provOf(r.type) === p && r.region).map(r => r.region))];
      return rs.length === 1 ? rs[0] : '';
    };
    // Icono de grupo (esquina del recuadro) según el papel del recurso y su nube; sin icono oficial no se pone ninguno
    const groupIcon = (role, prov, pub) => ({
      cloud: { aws: 'aws/group-cloud', azure: 'azure/logo', gcp: 'gcp/logo' },
      vpc: { aws: 'aws/group-vpc', azure: 'azure/vnet', gcp: 'gcp/vpc' },
      subnet: { aws: pub ? 'aws/group-publicsubnet' : 'aws/group-privatesubnet', azure: 'azure/subnet' },
      rg: { azure: 'azure/group-resourcegroup' }
    })[role]?.[prov];

    /* ---------- grupos ---------- */
    const groups = [], gid = new Map();
    const provGroup = new Map();
    const providerGroup = p => {
      if (p === 'other') return null;
      if (!provGroup.has(p)) {
        const id = 'cloud-' + p;
        const name = { aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud' }[p];
        const icon = groupIcon('cloud', p);
        const pr = p === 'aws' ? region : provRegion(p);
        groups.push({ id, label: pr ? `${name} · ${pr}` : name, ...(icon ? { icon } : {}), color: 'melocoton', kind: 'physical', ...(pr ? { region: pr } : {}) });
        provGroup.set(p, id);
      }
      return provGroup.get(p);
    };
    const refsTo = (r, pred, pathRe) => r.refs.filter(x => (!pathRe || pathRe.test(x.path)) && pred(byKey.get(x.to))).map(x => byKey.get(x.to));
    const firstRef = (r, role) => refsTo(r, t => t && t.role === role)[0];
    // Azure: la conexión de integración con la red (VNet integration) coloca la aplicación en la subred
    list.filter(r => r.type === 'azurerm_app_service_virtual_network_swift_connection').forEach(h => {
      const sn = firstRef(h, 'subnet');
      if (sn) h.refs.map(x => byKey.get(x.to)).filter(t => t && t.role === 'node').forEach(t => t.refs.push({ to: sn.key, path: 'subnet_id' }));
    });

    const COLORS = { rg: 'lila', vpc: 'cielo', subnet: 'menta' };
    list.filter(isGroup).forEach(r => {
      const id = safeId('g-' + r.key);
      gid.set(r.key, id);
      const label = r.name + (r.cidr ? ` · ${r.cidr}` : '') + (r.type === 'google_project' && r.projectId && r.projectId !== r.name ? ` · ${r.projectId}` : '');
      const icon = groupIcon(r.role, provOf(r.type), r.public === true);
      groups.push({ id, label, ...(icon ? { icon } : {}), color: r.public === true ? 'menta' : r.role === 'subnet' ? 'lavanda' : COLORS[r.role], kind: 'physical', _r: r });
    });
    groups.forEach(g => {
      const r = g._r;
      if (!r) return;
      const parent = r.role === 'subnet' ? firstRef(r, 'vpc') : r.role === 'vpc' ? firstRef(r, 'rg') : null;
      g.parent = parent ? gid.get(parent.key) : providerGroup(provOf(r.type));
    });
    // Región de los grupos de Azure y Google Cloud: solo donde cambia respecto a la que ya heredan (grupo de recursos, subred regional…)
    const gBy = new Map(groups.map(g => [g.id, g])), regDone = new Set();
    const regionAt = id => { let g = gBy.get(id), i = 0; while (g && i++ < 50) { if (g.region) return g.region; g = gBy.get(g.parent); } return ''; };
    const fixRegion = g => {
      if (regDone.has(g.id)) return;
      regDone.add(g.id);
      if (gBy.get(g.parent)) fixRegion(gBy.get(g.parent));
      const r = g._r;
      if (!r || provOf(r.type) === 'aws' || !r.region || r.region === regionAt(g.parent)) return;
      g.region = r.region;
      g.label += ` · ${r.region}`;
    };
    groups.slice().forEach(fixRegion);

    // Ubicación de cada componente: subred(es) › VPC › grupo de recursos › nube
    const hop = (r, test) => {
      const direct = refsTo(r, test, null);
      const via = r.refs.map(x => byKey.get(x.to)).filter(t => t && (t.role === 'hidden' || t.role === 'fold')).flatMap(t => refsTo(t, test, null));
      return [...new Set([...direct, ...via])];
    };
    const multi = new Map();
    function placeOf(r) {
      const subnets = [...new Set([...refsTo(r, t => t && t.role === 'subnet', /subnet|Subnet/), ...r.refs.map(x => byKey.get(x.to)).filter(t => t && t.role === 'hidden').flatMap(t => refsTo(t, u => u && u.role === 'subnet', /subnet|Subnet/))])];
      if (subnets.length === 1) return gid.get(subnets[0].key);
      if (subnets.length > 1) {
        const ids = subnets.map(s => s.key).sort(), k = ids.join('|');
        if (!multi.has(k)) {
          const vpcs = [...new Set(subnets.map(s => firstRef(s, 'vpc')).filter(Boolean))];
          const id = safeId('g-subnets-' + multi.size);
          const label = subnets.map(s => s.name).join(' + ');
          const icon = groupIcon('subnet', provOf(r.type), subnets.every(s => s.public === true));
          const g = { id, label, ...(icon ? { icon } : {}), color: subnets.every(s => s.public === true) ? 'menta' : 'lavanda', kind: 'physical', parent: vpcs.length === 1 ? gid.get(vpcs[0].key) : providerGroup(provOf(r.type)), _subnets: subnets, _r: { type: subnets[0].type, region: subnets.every(s => s.region === subnets[0].region) ? subnets[0].region : '' } };
          groups.push(g); gBy.set(id, g);
          multi.set(k, id);
        }
        return multi.get(k);
      }
      const vpc = hop(r, t => t && t.role === 'vpc')[0];
      if (vpc) return gid.get(vpc.key);
      const rg = refsTo(r, t => t && t.role === 'rg', null)[0];
      if (rg) return gid.get(rg.key);
      return providerGroup(provOf(r.type));
    }

    /* ---------- componentes ---------- */
    const nodes = [], nid = new Map();
    const visible = list.filter(r => r.role === 'node');
    visible.forEach(r => {
      const row = r.row || { type: 'generic', icon: null, svc: prettyType(r.type) };
      // Sin nombre propio: el servicio hace de nombre y el identificador va debajo
      const label = r.named === false && r.row ? row.svc : r.name;
      const sub = r.named === false && r.row ? [r.name, r.detail] : [row.svc, r.detail];
      const n = { id: safeId(r.key, nid), label, type: row.type, sub: sub.filter(Boolean).join(' · '), group: placeOf(r), desc: `${r.key} (${r.type})` };
      if (row.icon) n.icon = row.icon;
      const data = dataFromTags(r.tags);
      if (data.length) n.data = data;
      if (r.badge) n.badge = r.badge;
      nid.set(r.key, n.id);
      nodes.push(n);
    });
    stripPrefix(nodes);
    // Región de cada componente de Azure y Google Cloud: solo si no es la del grupo en que queda
    groups.slice().forEach(fixRegion);
    visible.forEach((r, i) => {
      const n = nodes[i];
      if (provOf(r.type) !== 'aws' && r.region && r.region !== regionAt(n.group)) n.region = r.region;
    });

    /* ---------- conexiones ---------- */
    const out = new Map(list.map(r => [r.key, []]));
    list.forEach(r => {
      const b = BRIDGES[r.type];
      r.refs.forEach(x => {
        if (x.to === r.key || !byKey.has(x.to)) return;
        if (isGroup(r) || isGroup(byKey.get(x.to))) return;
        const flip = b ? b.flip.test(x.path) : FLIP.test(String(x.path).replace(/value_source/g, ''));
        const [a, z] = flip ? [x.to, r.key] : [r.key, x.to];
        out.get(a).push({ to: z, path: x.path, dep: x.dep });
      });
    });
    const edges = [], seen = new Set();
    const addEdge = (a, z, info) => {
      if (a === z) return;
      const k = a + '\0' + z;
      if (seen.has(k)) return;
      if (info.dep && seen.has(z + '\0' + a)) return;
      seen.add(k);
      const ra = byKey.get(a), rz = byKey.get(z);
      const tz = (rz.row || {}).type, ta = (ra.row || {}).type;
      const e = { from: nid.get(a), to: nid.get(z) };
      if (info.style) e.style = info.style;
      else if (info.plain) { /* balanceadores: sin estilo especial */ }
      else if (SIDE_TYPES.has(tz) || SIDE_TYPES.has(ta)) e.style = 'optional';
      else if (/Notification|notification|EventSource|event_source/.test(info.path || '') || ta === 'events' || ta === 'queue') e.style = 'async';
      else if (DATA.test(info.path || '')) e.style = 'data';
      if (info.label) e.label = info.label;
      edges.push(e);
    };
    // Primero las referencias de campos, después las dependencias declaradas (solo si no hay otra)
    [false, true].forEach(depPass => visible.forEach(r => {
      const walk = (k, info, depth, trail) => {
        out.get(k).forEach(x => {
          if (!!x.dep !== depPass && depth === 0) return;
          const t = byKey.get(x.to);
          if (!t || trail.has(t.key)) return;
          if (t.role === 'node') addEdge(r.key, t.key, depth ? info : { path: x.path, dep: x.dep });
          else if (t.role === 'bridge' && depth < 4) {
            const b = BRIDGES[t.type];
            const lbl = b.label ? b.label(t.values || {}) : '';
            walk(t.key, { style: info.style || b.style, plain: info.plain || b.plain, label: info.label || lbl, path: x.path }, depth + 1, new Set([...trail, t.key]));
          }
        });
      };
      walk(r.key, {}, 0, new Set([r.key]));
    }));

    const hidden = list.filter(r => r.role !== 'node' && !isGroup(r)).length;
    // Sin prefijo común, el título puede salir del proyecto de Google Cloud o del primer grupo de recursos de Azure
    const first = list.find(r => r.type === 'google_project') || list.find(r => r.type === 'azurerm_resource_group');
    if (first) nodes.hint = first.projectId || first.name;
    return { groups: pruneGroups(groups, nodes), nodes, edges, hidden, total: list.length };
  }

  // Quita los grupos sin componentes (p. ej. una subred que nadie usa)
  function pruneGroups(groups, nodes) {
    let gs = groups.map(({ _r, _subnets, ...g }) => g);
    for (;;) {
      const used = new Set([...nodes.map(n => n.group), ...gs.map(g => g.parent)].filter(Boolean));
      const keep = gs.filter(g => used.has(g.id));
      if (keep.length === gs.length) return gs;
      gs = keep;
    }
  }

  // Si casi todos los nombres empiezan igual (acme-datalake-…), se quita ese prefijo
  function stripPrefix(nodes) {
    if (nodes.length < 3) return '';
    const count = new Map();
    nodes.forEach(n => {
      const s = n.label;
      for (let k = 3; k < s.length - 1; k++) if (/[-_.]/.test(s[k])) count.set(s.slice(0, k + 1), (count.get(s.slice(0, k + 1)) || 0) + 1);
    });
    const need = Math.max(3, Math.ceil(nodes.length * 0.6));
    const best = [...count].filter(([, c]) => c >= need).sort((a, b) => b[0].length - a[0].length)[0];
    if (!best) return '';
    const p = best[0];
    nodes.forEach(n => { if (n.label.startsWith(p) && n.label.length > p.length) n.label = n.label.slice(p.length); });
    nodes.prefix = p.slice(0, -1);
    return nodes.prefix;
  }

  const prettyType = t => String(t).replace(/^(aws|azurerm|google)_/, '').replace(/^AWS::/, '').replace(/::/g, ' ').replace(/_/g, ' ');
  function safeId(k, used) {
    let id = String(k).replace(/^(module\.)/, 'm.').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'n';
    if (used) {
      const taken = new Set(used.values());
      let base = id, i = 2;
      while (taken.has(id)) id = `${base}_${i++}`;
    }
    return id;
  }

  /* ======================================================================
     Terraform
     ====================================================================== */
  const NAME_KEYS = ['bucket', 'function_name', 'name', 'url', 'invoke_arn', 'qualified_arn', 'bucket_regional_domain_name', 'bucket_domain_name', 'repository_url', 'self_link',
    'project_id', 'dataset_id', 'secret_id', 'connection_name', 'instrumentation_key', 'connection_string', 'vault_uri', 'fully_qualified_domain_name'];
  const HOST_KEYS = ['address', 'endpoint', 'dns_name', 'reader_endpoint', 'fqdn', 'primary_endpoint_address', 'configuration_endpoint_address', 'domain_name',
    'default_hostname', 'fully_qualified_domain_name', 'vault_uri', 'primary_blob_endpoint', 'hostname', 'host', 'private_ip_address'];
  const hostOf = u => str(u).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[:/?#].*$/, '');
  const hostRe = h => new RegExp('(^|[^A-Za-z0-9.-])' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z0-9-])', 'i');
  // Todos los textos de un valor (para buscar qué recurso usa, por ejemplo, una IP pública)
  const eachString = (v, fn) => { if (typeof v === 'string') fn(v); else if (Array.isArray(v)) v.forEach(x => eachString(x, fn)); else if (isObj(v)) Object.values(v).forEach(x => eachString(x, fn)); };

  /* ---------- regiones de Azure y Google Cloud ---------- */
  // Azure: «West Europe» y «westeurope» son la misma región (el código va en minúsculas y sin espacios); «global» no es región
  const azRegion = s => { const t = str(s).toLowerCase().replace(/[\s_-]+/g, ''); return t === 'global' ? '' : t; };
  // Google Cloud: región (europe-west1), zona (europe-west1-b → europe-west1) o multirregión (EU, US, ASIA…; se deja en mayúsculas)
  const gcpRegion = s => {
    const t = str(s).trim().split('/').pop();
    if (!t || /^(global|unspecified)$/i.test(t)) return '';
    if (/^[A-Za-z]+\d*$/.test(t)) return t.toUpperCase();
    return t.toLowerCase().replace(/^([a-z]+-[a-z]+\d+)-[a-z]$/, '$1');
  };
  // Recursos de Google Cloud que son globales: no heredan la región del proveedor
  const GCP_GLOBAL = /^google_(project|service_account|compute_(network$|global_|backend_service|url_map|target_|ssl_|managed_ssl|health_check|security_policy|firewall)|pubsub_|secret_manager|iam_|dns_|kms_key_ring$|api_gateway_api$)/;
  function gcpRegionOf(type, v) {
    const direct = [v.region, v.location, v.zone, v.location_id].map(gcpRegion).find(Boolean);
    if (direct) return direct;
    const m = [v.self_link, v.id].map(str).join(' ').match(/(?:regions|zones|locations)\/([A-Za-z]+(?:-[A-Za-z]+\d+(?:-[a-z])?)?)(?=\/|\s|$)/);
    if (m && gcpRegion(m[1])) return gcpRegion(m[1]);
    const pol = Array.isArray(v.message_storage_policy) ? v.message_storage_policy[0]?.allowed_persistence_regions : null;
    if (Array.isArray(pol) && pol.length === 1) return gcpRegion(pol[0]);
    return '';
  }
  const SKIP_KEYS = new Set(['tags', 'tags_all', 'labels', 'description', 'policy', 'assume_role_policy', 'inline_policy', 'access_policies', 'timeouts', 'id', 'arn']);

  function terraformResources(doc) {
    const list = [];
    const push = (address, type, name, values, deps, mode) => {
      if (mode === 'data') return;
      list.push({ key: address, type, tfName: name, values: values || {}, deps: deps || [], refs: [] });
    };
    if (Array.isArray(doc.resources) && !doc.values && !doc.planned_values) {
      // Archivo .tfstate (versión 4)
      doc.resources.forEach(res => (res.instances || []).forEach(inst => {
        const base = `${res.module ? res.module + '.' : ''}${res.mode === 'data' ? 'data.' : ''}${res.type}.${res.name}`;
        const idx = inst.index_key == null ? '' : `[${JSON.stringify(inst.index_key)}]`;
        push(base + idx, res.type, res.name, inst.attributes, inst.dependencies, res.mode);
      }));
      return list;
    }
    const walk = m => {
      if (!m) return;
      (m.resources || []).forEach(r => push(r.address, r.type, r.name, r.values, r.depends_on, r.mode));
      (m.child_modules || []).forEach(walk);
    };
    walk((doc.values || doc.planned_values || {}).root_module);
    // En un plan, los recursos que ya existían traen sus valores (ARN, id…) en prior_state
    const prior = new Map();
    const walkPrior = m => { if (!m) return; (m.resources || []).forEach(r => prior.set(r.address, r)); (m.child_modules || []).forEach(walkPrior); };
    walkPrior(doc.prior_state?.values?.root_module);
    list.forEach(r => {
      const p = prior.get(r.key);
      if (p) { r.values = { ...p.values, ...r.values }; if (!r.deps.length && p.depends_on) r.deps = p.depends_on; }
    });
    return list;
  }

  // Referencias de la configuración de un plan (sirven aunque los ARN aún no se conozcan)
  function configRefs(doc) {
    const refs = new Map();
    const walkMod = (mod, prefix) => {
      if (!mod) return;
      (mod.resources || []).forEach(res => {
        const own = prefix + res.address;
        const found = [];
        const walkExpr = (e, path) => {
          if (Array.isArray(e)) return e.forEach(x => walkExpr(x, path));
          if (!isObj(e)) return;
          if (Array.isArray(e.references)) {
            e.references.forEach(ref => {
              const parts = String(ref).replace(/\[[^\]]*\]/g, '').split('.');
              if (/^(var|local|each|count|path|terraform|self|module)$/.test(parts[0])) return;
              const base = parts[0] === 'data' ? null : `${parts[0]}.${parts[1]}`;
              if (base) found.push({ to: prefix + base, path });
            });
            return;
          }
          Object.entries(e).forEach(([k, v]) => walkExpr(v, path ? `${path}.${k}` : k));
        };
        walkExpr(res.expressions, '');
        (res.depends_on || []).forEach(d => found.push({ to: prefix + d, path: 'depends_on', dep: true }));
        refs.set(own, found);
      });
      Object.entries(mod.module_calls || {}).forEach(([name, call]) => walkMod(call.module, `${prefix}module.${name}.`));
    };
    walkMod(doc.configuration?.root_module, '');
    return refs;
  }

  function terraform(doc) {
    const list = terraformResources(doc);
    const keys = new Set(list.map(r => r.key));
    const baseOf = k => k.replace(/\[[^\]]*\]$/, '');
    const byBase = new Map();
    list.forEach(r => { const b = baseOf(r.key); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(r.key); });

    // Índice de valores identificadores → recurso
    // Un mismo valor puede ser el id de varios recursos (el bucket y su configuración de cifrado,
    // por ejemplo): gana el recurso principal, el que se dibuja o agrupa.
    const index = new Map(), prio = new Map(), dup = new Set(), hosts = [];
    const put = (v, k, p) => {
      if (typeof v !== 'string' || v.length < 3 || /^(true|false|\d+)$/.test(v)) return;
      if (!index.has(v) || p > prio.get(v)) { index.set(v, k); prio.set(v, p); dup.delete(v); }
      else if (p === prio.get(v) && index.get(v) !== k) dup.add(v);
    };
    list.forEach(r => {
      const v = r.values, main = BY_TF.has(r.type) || GROUPS[r.type] ? 10 : 0;
      put(v.id, r.key, main + 1); put(v.arn, r.key, main + 3);
      NAME_KEYS.forEach(k => put(v[k], r.key, main + 2));
      if (main) HOST_KEYS.forEach(k => { const h = hostOf(v[k]); if (h.includes('.') && h.length > 6) hosts.push([h, r.key, hostRe(h)]); });
      // Azure: la identidad administrada de una aplicación (los roles asignados apuntan a su principal_id)
      [].concat(v.identity || []).forEach(i => isObj(i) && put(i.principal_id, r.key, main + 2));
      // Google Cloud: los grupos de instancias de un clúster GKE y las tablas de BigQuery (proyecto.dataset.tabla)
      if (r.type === 'google_container_cluster') [].concat(v.node_pool || []).forEach(np => [].concat(np.instance_group_urls || [], np.managed_instance_group_urls || []).forEach(u => put(u, r.key, main + 2)));
      if (r.type === 'google_bigquery_table' && v.dataset_id && v.table_id) { const pr = str(v.project) || str(v.id).split('/')[1]; put(`${pr}.${v.dataset_id}.${v.table_id}`, r.key, 2); put(`${pr}:${v.dataset_id}.${v.table_id}`, r.key, 2); }
    });
    // Una IP pública se dice a través del recurso que la usa (la puerta de enlace, el balanceador…): su nombre DNS lleva a ese recurso
    list.filter(r => r.type === 'azurerm_public_ip' && r.values.id).forEach(pip => {
      const hs = [pip.values.fqdn, pip.values.ip_address].map(str).filter(h => h.length > 6);
      list.forEach(o => { if (o !== pip && BY_TF.has(o.type)) { let uses = false; eachString(o.values, t => { if (t === pip.values.id) uses = true; }); if (uses) hs.forEach(h => hosts.push([h, o.key, hostRe(h)])); } });
    });
    dup.forEach(v => index.delete(v));
    const lookup = s => {
      const out = [];
      const add = k => k && out.push(k);
      add(index.get(s));
      const m = s.match(/^(?:s3a?|gs):\/\/([^/]+)/);
      if (m) add(index.get(m[1]));
      if (s.startsWith('arn:')) {
        add(index.get(s.replace(/(\/\*|:\*|\/.*)$/, '')));
        add(index.get(s.replace(/:[^:]*$/, '')));
      }
      if (s.length > 30 && s.includes('arn:')) (s.match(/arn:[\w-]+:[\w-]+:[^\s"',]*/g) || []).forEach(a => add(index.get(a.replace(/(\/\*|:\*)$/, ''))));
      if (s.includes('.')) hosts.forEach(([h, k, re]) => { if (s.includes(h) && re.test(s)) add(k); });
      return [...new Set(out)];
    };

    const cref = configRefs(doc);
    list.forEach(r => {
      const found = [];
      const scan = (v, path) => {
        if (typeof v === 'string') return lookup(v).forEach(k => found.push({ to: k, path }));
        if (Array.isArray(v)) return v.forEach(x => scan(x, path));
        if (isObj(v)) Object.entries(v).forEach(([k, x]) => { if (!(path === '' && SKIP_KEYS.has(k)) && k !== 'tags' && k !== 'tags_all') scan(x, path ? `${path}.${k}` : k); });
      };
      scan(r.values, '');
      (cref.get(baseOf(r.key)) || []).forEach(x => (byBase.get(x.to) || []).forEach(k => found.push({ to: k, path: x.path, dep: x.dep })));
      r.deps.forEach(d => { if (keys.has(d)) found.push({ to: d, path: 'depends_on', dep: true }); else (byBase.get(d) || []).forEach(k => found.push({ to: k, path: 'depends_on', dep: true })); });
      r.refs = found.filter(x => x.to !== r.key);

      const v = r.values, tags = isObj(v.tags) ? v.tags : isObj(v.labels) ? v.labels : {};
      r.tags = tags;
      const own0 = tags.Name || v.name || v.bucket || v.function_name || v.identifier || v.cluster_identifier || v.replication_group_id || v.cluster_id || (r.type.endsWith('_domain') && v.domain_name) || v.dataset_id || v.secret_id || v.account_id;
      const own = typeof own0 === 'string' && /^projects\//.test(own0) ? own0.split('/').pop() : own0; // Google Cloud: «projects/123/secrets/clave» → «clave»
      r.named = !!own;
      r.name = String(own || r.tfName + (r.key.match(/\[[^\]]*\]$/)?.[0] || '').replace(/"/g, ''));
      if (r.type === 'google_project') r.projectId = str(v.project_id);
      r.cidr = str(v.cidr_block) || (Array.isArray(v.address_space) ? v.address_space.join(', ') : '') || (Array.isArray(v.address_prefixes) ? v.address_prefixes.join(', ') : '') || str(v.ip_cidr_range);
      if (r.type === 'aws_subnet') r.public = v.map_public_ip_on_launch === true;
      r.detail = tfDetail(r.type, v);
      const n = +v.desired_capacity || +v.desired_count || +v.number_cache_clusters || +v.num_cache_nodes || +v.instance_count || 0;
      if (n > 1) r.badge = `x${n}`;
      const arnReg = [v.arn, v.invoke_arn].map(str).map(a => a.split(':')[3]).find(Boolean);
      r.region = /^azurerm_/.test(r.type) ? azRegion(v.location) : /^google_/.test(r.type) ? gcpRegionOf(r.type, v) : v.region || arnReg || '';
    });
    const region = doc.configuration?.provider_config?.aws?.expressions?.region?.constant_value;
    if (region) list.forEach(r => { if (/^aws_/.test(r.type)) r.region = region; });
    // Google Cloud: la región del proveedor sirve de respaldo para lo que no la trae (menos lo global)
    const pg = doc.configuration?.provider_config?.google?.expressions;
    const pgVar = e => { const ref = (e?.references || []).find(x => /^var\./.test(x)); const k = ref && ref.slice(4).split('.')[0]; return k ? doc.variables?.[k]?.value ?? doc.configuration?.root_module?.variables?.[k]?.default : null; };
    const gReg = gcpRegion(pg?.region?.constant_value ?? pgVar(pg?.region) ?? pg?.zone?.constant_value);
    if (gReg && !/^[A-Z]+\d*$/.test(gReg)) list.forEach(r => { if (/^google_/.test(r.type) && !r.region && !GCP_GLOBAL.test(r.type)) r.region = gReg; });
    // Azure y Google Cloud: el plan de una aplicación (P1v3, EP1…) acompaña a su pila
    const byId = new Map(list.map(r => [str(r.values.id), r]));
    list.forEach(r => {
      const plan = /^azurerm_(linux|windows)_(web|function)_app$/.test(r.type) && byId.get(str(r.values.service_plan_id));
      if (plan && plan.values.sku_name) r.detail = [r.detail, String(plan.values.sku_name)].filter(Boolean).join(' · ');
    });
    return assemble(list, 'terraform');
  }

  const sqlVersion = d => String(d).replace(/^POSTGRES_(\d+)$/, 'PostgreSQL $1').replace(/^MYSQL_(\d+)_(\d+)$/, 'MySQL $1.$2').replace(/^SQLSERVER_(\d+).*$/, 'SQL Server $1');
  // Pila de una aplicación de Azure: site_config[0].application_stack[0] → «Node 20-lts»
  function azStack(v) {
    const st = Array.isArray(v.site_config) ? v.site_config[0]?.application_stack?.[0] : null;
    const hit = st && Object.entries(st).find(([k, x]) => /_version$/.test(k) && x);
    return hit ? `${{ node: 'Node', python: 'Python', dotnet: '.NET', java: 'Java', php: 'PHP', ruby: 'Ruby', go: 'Go', powershell: 'PowerShell' }[hit[0].replace(/_version$/, '')] || hit[0].replace(/_version$/, '')} ${hit[1]}` : '';
  }
  function tfDetail(type, v) {
    if (v.runtime) return String(v.runtime);
    const bc = Array.isArray(v.build_config) ? v.build_config[0] : null;
    if (bc && bc.runtime) return String(bc.runtime);
    if (type === 'google_sql_database_instance' && v.database_version) return sqlVersion(v.database_version);
    if (type === 'google_redis_instance') return [v.tier, v.memory_size_gb ? `${v.memory_size_gb} GB` : ''].filter(Boolean).join(' · ');
    if (type === 'google_storage_bucket') return v.storage_class && v.storage_class !== 'STANDARD' ? String(v.storage_class) : '';
    if (/^azurerm_(linux|windows)_(web|function)_app$/.test(type)) return azStack(v);
    if (type === 'azurerm_storage_account' && v.account_tier && v.account_replication_type) return `${v.account_tier}_${v.account_replication_type}`;
    if (/^azurerm_/.test(type) && !v.sku_name) { const sk = Array.isArray(v.sku) ? v.sku[0]?.name : v.sku; if (sk && typeof sk === 'string') return sk; }
    if (v.engine) return `${v.engine}${v.engine_version ? ' ' + String(v.engine_version).split('.')[0] : ''}`;
    if (v.schedule_expression) return String(v.schedule_expression);
    if (v.instance_type) return String(v.instance_type);
    if (v.instance_class) return String(v.instance_class);
    if (v.node_type) return String(v.node_type);
    if (type === 'aws_kinesis_firehose_delivery_stream' && v.destination) return `→ ${{ extended_s3: 'S3', s3: 'S3', redshift: 'Redshift', opensearch: 'OpenSearch', elasticsearch: 'OpenSearch', http_endpoint: 'HTTP', splunk: 'Splunk', snowflake: 'Snowflake', iceberg: 'Iceberg' }[v.destination] || v.destination}`;
    if (type === 'aws_vpc_endpoint' && v.service_name) return String(v.service_name).split('.').pop();
    if (type === 'aws_glue_job' && v.glue_version) return `Glue ${v.glue_version}`;
    if (v.sku_name) return String(v.sku_name);
    if (v.location && /^azurerm_/.test(type)) return '';
    return '';
  }

  /* ======================================================================
     CloudFormation / SAM
     ====================================================================== */
  const CFN_NAMES = /^(Name|BucketName|FunctionName|TableName|StreamName|DeliveryStreamName|TopicName|QueueName|ClusterName|StateMachineName|RepositoryName|DomainName|DBInstanceIdentifier|DBClusterIdentifier|ReplicationGroupId|UserPoolName|BrokerName|EventBusName|ApplicationName|EnvironmentName|TrailName|WorkgroupName|CollectionName)$/;
  function cloudformation(doc) {
    const res = doc.Resources || {};
    const ids = new Set(Object.keys(res));
    PARAMS = Object.fromEntries(Object.entries(isObj(doc.Parameters) ? doc.Parameters : {}).filter(([, p]) => isObj(p) && p.Default != null).map(([k, p]) => [k, p.Default]));
    const list = Object.entries(res).filter(([, r]) => isObj(r) && typeof r.Type === 'string').map(([id, r]) => {
      const p = isObj(r.Properties) ? r.Properties : {};
      const refs = [];
      const scan = (v, path) => {
        if (Array.isArray(v)) return v.forEach(x => scan(x, path));
        if (!isObj(v)) return;
        if ('Ref' in v && typeof v.Ref === 'string') { if (ids.has(v.Ref)) refs.push({ to: v.Ref, path }); return; }
        if ('Fn::GetAtt' in v) {
          const g = v['Fn::GetAtt'];
          const target = Array.isArray(g) ? g[0] : String(g).split('.')[0];
          if (ids.has(target)) refs.push({ to: target, path });
          return;
        }
        if ('Fn::Sub' in v) {
          const s = v['Fn::Sub'], text = Array.isArray(s) ? s[0] : s;
          String(text || '').replace(/\$\{([A-Za-z0-9]+)(?:\.[A-Za-z0-9.]+)?\}/g, (_, x) => { if (ids.has(x)) refs.push({ to: x, path }); return ''; });
          if (Array.isArray(s) && isObj(s[1])) scan(s[1], path);
          return;
        }
        Object.entries(v).forEach(([k, x]) => {
          if (/^(Tags|Description|PolicyDocument|Policies|AssumeRolePolicyDocument|KeyPolicy)$/.test(k)) return;
          scan(x, path ? `${path}.${k}` : k);
        });
      };
      scan(p, '');
      // SAM: los eventos de una función apuntan hacia ella
      if (/^AWS::Serverless::Function$/.test(r.Type) && isObj(p.Events)) refs.forEach(x => { if (/^Events\./.test(x.path)) x.path = 'EventSource.' + x.path; });
      [].concat(r.DependsOn || []).forEach(d => { if (ids.has(d)) refs.push({ to: d, path: 'DependsOn', dep: true }); });
      const tags = cfnTags(p.Tags);
      const nameKey = Object.keys(p).find(k => CFN_NAMES.test(k) && plainStr(p[k]));
      const own = tags.Name || (nameKey && plainStr(p[nameKey])) || (isObj(p.DatabaseInput) && plainStr(p.DatabaseInput.Name));
      const name = own || id;
      const detail = plainStr(p.Runtime) || (p.Engine ? `${plainStr(p.Engine)}${p.EngineVersion ? ' ' + String(plainStr(p.EngineVersion)).split('.')[0] : ''}` : '') || plainStr(p.ScheduleExpression) || plainStr(p.InstanceType) || plainStr(p.DBInstanceClass) || plainStr(p.CacheNodeType) || '';
      const o = { key: id, type: r.Type, name, named: !!own, refs, tags, detail, values: p, cidr: plainStr(p.CidrBlock) };
      if (r.Type === 'AWS::EC2::Subnet') o.public = p.MapPublicIpOnLaunch === true || p.MapPublicIpOnLaunch === 'true';
      const n = +p.DesiredCount || +p.DesiredCapacity || +p.NumCacheClusters || 0;
      if (n > 1) o.badge = `x${n}`;
      return o;
    });
    return assemble(list, 'cloudformation');
  }

  /* ======================================================================
     Imagen de un contenedor → tipo de componente
     ====================================================================== */
  const IMAGE_TYPES = [
    [/postgres|postgis|mysql|mariadb|mssql|sqlserver|oracle|cockroach|timescale|yugabyte|percona/, 'db'],
    [/redis|valkey|memcached|keydb|dragonfly/, 'cache'],
    [/mongo|cassandra|couchdb|couchbase|scylla|dynamodb|arangodb|neo4j/, 'nosql'],
    [/rabbitmq|activemq|artemis|nats|elasticmq|localstack\/sqs|zeromq/, 'queue'],
    [/kafka|redpanda|pulsar|zookeeper|debezium|kinesis/, 'stream'],
    [/minio|seaweedfs|ceph|azurite|fake-gcs/, 'storage'],
    [/elasticsearch|opensearch|clickhouse|spark|trino|presto|airflow|superset|metabase|druid|pinot|dbt|jupyter|kibana|duckdb|hive|flink/, 'analytics'],
    [/traefik|haproxy|envoy|ingress-nginx|kong|apisix|tyk/, 'gateway'],
    [/nginx|httpd|apache|caddy|frontend|web|ui$/, 'web'],
    [/prometheus|grafana|loki|jaeger|tempo|otel|opentelemetry|datadog|fluent|zipkin|alertmanager|victoria/, 'monitor'],
    [/keycloak|authelia|dex|oauth2-proxy|hydra|zitadel/, 'auth'],
    [/vault|sops|sealed-secrets/, 'secrets'],
    [/ollama|vllm|triton|tensorflow|pytorch|text-generation|tgi|llama|mlflow|qdrant|weaviate|milvus|chroma/, 'ai'],
    [/jenkins|argocd|gitlab-runner|tekton|drone|woodpecker/, 'cicd'],
    [/mailhog|mailpit|postfix|smtp/, 'email']
  ];
  const imageType = (img, fallback) => {
    const s = String(img || '').toLowerCase().split('@')[0];
    const nameOnly = s.split(':')[0].split('/').pop();
    const hit = IMAGE_TYPES.find(([re]) => re.test(nameOnly)) || IMAGE_TYPES.find(([re]) => re.test(s));
    return hit ? hit[1] : fallback;
  };
  const shortImage = img => String(img || '').split('@')[0].split('/').pop();
  // ¿Aparece `name` como nombre de host en este texto? (db:5432, http://api/, @db/…)
  const mentions = (text, name) => new RegExp(`(^|[^A-Za-z0-9_.-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.[a-z0-9-]+)*(?=$|[:/?\\s,;"'@)]|\\.svc)`, 'i').test(String(text));

  /* ======================================================================
     Kubernetes
     ====================================================================== */
  const WORKLOADS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Pod', 'DeploymentConfig', 'Rollout']);
  function kubernetes(docs) {
    const objs = [];
    const add = d => {
      if (!isObj(d)) return;
      if (/List$/.test(d.kind || '') && Array.isArray(d.items)) return d.items.forEach(add);
      if (isK8s(d) && isObj(d.metadata) && d.metadata.name) objs.push(d);
    };
    docs.forEach(add);
    const ns = o => (o.metadata.namespace || 'default');
    const groups = [{ id: 'k8s', label: 'Kubernetes', color: 'cielo' }];
    const nsGroup = new Map();
    const groupFor = o => {
      const n = ns(o);
      if (!nsGroup.has(n)) { const id = safeId('ns-' + n); groups.push({ id, label: `namespace: ${n}`, color: 'lavanda', parent: 'k8s' }); nsGroup.set(n, id); }
      return nsGroup.get(n);
    };
    const nodes = [], edges = [], nid = new Map(), seen = new Set();
    const keyOf = o => `${o.kind}/${ns(o)}/${o.metadata.name}`;
    const node = (o, n) => {
      n.id = safeId(`${ns(o)}.${o.metadata.name}${o.kind === 'Deployment' ? '' : '.' + o.kind.toLowerCase()}`, nid);
      n.group = groupFor(o);
      n.desc = `${o.kind} ${ns(o)}/${o.metadata.name}`;
      nid.set(keyOf(o), n.id);
      nodes.push(n);
      return n.id;
    };
    const edge = (a, b, extra = {}) => {
      if (!a || !b || a === b || seen.has(a + '\0' + b)) return;
      seen.add(a + '\0' + b);
      edges.push({ from: a, to: b, ...extra });
    };
    const podSpec = o => (o.kind === 'Pod' ? o.spec : o.kind === 'CronJob' ? o.spec?.jobTemplate?.spec?.template?.spec : o.spec?.template?.spec) || {};
    const podLabels = o => (o.kind === 'Pod' ? o.metadata.labels : o.kind === 'CronJob' ? o.spec?.jobTemplate?.spec?.template?.metadata?.labels : o.spec?.template?.metadata?.labels) || {};
    const containers = o => [...(podSpec(o).containers || []), ...(podSpec(o).initContainers || [])].filter(isObj);

    let hidden = 0;
    const workloads = objs.filter(o => WORKLOADS.has(o.kind));
    // Un Pod o ReplicaSet creado por otro recurso no se dibuja dos veces
    const owned = o => Array.isArray(o.metadata.ownerReferences) && o.metadata.ownerReferences.length;
    workloads.filter(o => !owned(o)).forEach(o => {
      const main = containers(o)[0] || {};
      const fallback = /Job/.test(o.kind) ? 'function' : 'container';
      const replicas = +o.spec?.replicas;
      const n = { label: o.metadata.name, type: imageType(main.image, fallback), sub: [o.kind, o.kind === 'CronJob' ? o.spec?.schedule : shortImage(main.image)].filter(Boolean).join(' · ') };
      if (replicas > 1) n.badge = `x${replicas}`;
      node(o, n);
    });
    const services = objs.filter(o => o.kind === 'Service');
    const selects = (svc, w) => {
      const sel = svc.spec?.selector;
      if (!isObj(sel) || !Object.keys(sel).length || ns(svc) !== ns(w)) return false;
      const labels = podLabels(w);
      return Object.entries(sel).every(([k, v]) => String(labels[k]) === String(v));
    };
    const svcTargets = new Map();
    services.forEach(s => {
      const targets = workloads.filter(w => nid.has(keyOf(w)) && selects(s, w)).map(w => nid.get(keyOf(w)));
      const type = s.spec?.type || 'ClusterIP';
      const ports = (s.spec?.ports || []).map(p => p.port).filter(Boolean).join(', ');
      if (type === 'LoadBalancer' || type === 'NodePort') {
        const id = node(s, { label: s.metadata.name, type: 'lb', sub: `Service · ${type}${ports ? ' :' + ports : ''}` });
        targets.forEach(t => edge(id, t, ports ? { label: ':' + String(ports).split(',')[0] } : {}));
        svcTargets.set(keyOf(s), [id]);
      } else if (type === 'ExternalName') {
        const id = node(s, { label: s.spec.externalName || s.metadata.name, type: 'external', sub: 'ExternalName' });
        svcTargets.set(keyOf(s), [id]);
      } else {
        svcTargets.set(keyOf(s), targets);
        hidden++;
      }
    });
    const svcByName = (name, namespace) => {
      const s = services.find(x => x.metadata.name === name && ns(x) === namespace);
      return s ? svcTargets.get(keyOf(s)) || [] : [];
    };
    // Ingress → servicios
    objs.filter(o => o.kind === 'Ingress').forEach(o => {
      const hosts = (o.spec?.rules || []).map(r => r.host).filter(Boolean);
      const id = node(o, { label: o.metadata.name, type: 'gateway', sub: ['Ingress', hosts[0]].filter(Boolean).join(' · ') });
      const backends = [];
      const be = (b, path) => { const name = b?.service?.name || b?.serviceName; if (name) backends.push([name, path]); };
      be(o.spec?.defaultBackend || o.spec?.backend, '/');
      (o.spec?.rules || []).forEach(r => (r.http?.paths || []).forEach(p => be(p.backend, p.path)));
      backends.forEach(([name, path]) => svcByName(name, ns(o)).forEach(t => edge(id, t, path && path !== '/' ? { label: path } : {})));
    });
    // HTTPRoute (Gateway API) → servicios
    objs.filter(o => o.kind === 'HTTPRoute').forEach(o => {
      const id = node(o, { label: o.metadata.name, type: 'gateway', sub: ['HTTPRoute', (o.spec?.hostnames || [])[0]].filter(Boolean).join(' · ') });
      (o.spec?.rules || []).forEach(r => (r.backendRefs || []).forEach(b => svcByName(b.name, b.namespace || ns(o)).forEach(t => edge(id, t))));
    });
    // Volúmenes persistentes y secretos
    const pvcs = objs.filter(o => o.kind === 'PersistentVolumeClaim');
    pvcs.forEach(o => node(o, { label: o.metadata.name, type: 'storage', sub: ['PVC', o.spec?.resources?.requests?.storage].filter(Boolean).join(' · ') }));
    const secrets = objs.filter(o => o.kind === 'Secret' && o.type !== 'kubernetes.io/service-account-token');
    secrets.forEach(o => node(o, { label: o.metadata.name, type: 'secrets', sub: 'Secret' }));
    const configMaps = objs.filter(o => o.kind === 'ConfigMap');
    hidden += objs.length - workloads.length - services.length - pvcs.length - secrets.length - objs.filter(o => o.kind === 'Ingress' || o.kind === 'HTTPRoute').length;

    workloads.filter(w => nid.has(keyOf(w))).forEach(w => {
      const id = nid.get(keyOf(w)), n = ns(w), spec = podSpec(w);
      const find = (kind, name) => nid.get(`${kind}/${n}/${name}`);
      (spec.volumes || []).forEach(v => {
        if (v.persistentVolumeClaim) edge(id, find('PersistentVolumeClaim', v.persistentVolumeClaim.claimName), { style: 'data' });
        if (v.secret) edge(id, find('Secret', v.secret.secretName), { style: 'optional' });
      });
      (w.spec?.volumeClaimTemplates || []).forEach(t => {
        const vid = node({ kind: 'PersistentVolumeClaim', metadata: { name: `${w.metadata.name}-${t.metadata?.name || 'data'}`, namespace: n } }, { label: `${w.metadata.name}-${t.metadata?.name || 'data'}`, type: 'storage', sub: ['PVC', t.spec?.resources?.requests?.storage].filter(Boolean).join(' · ') });
        edge(id, vid, { style: 'data' });
      });
      // Variables de entorno: secretos usados y otros servicios mencionados por nombre
      const texts = [];
      containers(w).forEach(c => {
        (c.env || []).forEach(e => {
          if (e.value != null) texts.push(String(e.value));
          const sk = e.valueFrom?.secretKeyRef?.name;
          if (sk) edge(id, find('Secret', sk), { style: 'optional' });
        });
        (c.envFrom || []).forEach(e => {
          if (e.secretRef?.name) edge(id, find('Secret', e.secretRef.name), { style: 'optional' });
          const cm = e.configMapRef?.name && configMaps.find(x => x.metadata.name === e.configMapRef.name && ns(x) === n);
          if (cm && isObj(cm.data)) texts.push(...Object.values(cm.data).map(String));
        });
        [...(c.args || []), ...(c.command || [])].forEach(a => texts.push(String(a)));
      });
      services.forEach(s => {
        const name = s.metadata.name;
        if (!texts.some(t => mentions(t, name) || mentions(t, `${name}.${ns(s)}`))) return;
        if (ns(s) !== n && !texts.some(t => t.includes(`${name}.${ns(s)}`))) return;
        (svcTargets.get(keyOf(s)) || []).forEach(t => edge(id, t));
      });
    });

    if (nsGroup.size === 1 && nsGroup.has('default')) {
      groups.splice(1, 1);
      nodes.forEach(n => { n.group = 'k8s'; });
    }
    return { groups, nodes, edges, hidden, total: objs.length };
  }

  /* ======================================================================
     Docker Compose
     ====================================================================== */
  function compose(doc) {
    const svcs = Object.entries(doc.services || {}).filter(([k, s]) => isObj(s) && !k.startsWith('x-'));
    const root = { id: 'compose', label: doc.name ? `Docker Compose · ${doc.name}` : 'Docker Compose', color: 'cielo' };
    const groups = [root], nodes = [], edges = [], nid = new Map(), seen = new Set();
    const nets = new Map();
    const netsOf = s => (Array.isArray(s.networks) ? s.networks : isObj(s.networks) ? Object.keys(s.networks) : []).map(String);
    const allNets = [...new Set(svcs.flatMap(([, s]) => netsOf(s)))];
    if (allNets.length > 1) allNets.forEach(n => { const id = safeId('net-' + n); nets.set(n, id); groups.push({ id, label: `network: ${n}`, color: 'lavanda', kind: 'physical', parent: 'compose' }); });
    const edge = (a, b, extra = {}) => {
      if (!a || !b || a === b || seen.has(a + '\0' + b)) return;
      seen.add(a + '\0' + b);
      edges.push({ from: a, to: b, ...extra });
    };
    svcs.forEach(([name, s]) => {
      const ports = (Array.isArray(s.ports) ? s.ports : []).map(p => (isObj(p) ? `${p.published || p.target}` : String(p).split(':').slice(-2)[0])).filter(Boolean);
      const what = s.image ? shortImage(s.image) : s.build ? `build: ${isObj(s.build) ? s.build.context || '.' : s.build}` : '';
      const n = { id: safeId(name, nid), label: s.container_name || name, type: imageType(s.image || name, 'container'), sub: [what, ports.length ? ':' + ports.join(', :') : ''].filter(Boolean).join(' · '), group: nets.get(netsOf(s)[0]) || 'compose', desc: `service ${name}` };
      const rep = +s.deploy?.replicas || +s.scale;
      if (rep > 1) n.badge = `x${rep}`;
      nid.set(name, n.id);
      nodes.push(n);
    });
    const vols = new Map();
    const volNames = new Set(Object.keys(isObj(doc.volumes) ? doc.volumes : {}));
    svcs.forEach(([name, s]) => {
      const id = nid.get(name);
      const deps = Array.isArray(s.depends_on) ? s.depends_on : isObj(s.depends_on) ? Object.keys(s.depends_on) : [];
      deps.forEach(d => edge(id, nid.get(String(d))));
      (s.links || []).forEach(l => edge(id, nid.get(String(l).split(':')[0])));
      const env = Array.isArray(s.environment) ? s.environment.map(String) : isObj(s.environment) ? Object.entries(s.environment).map(([k, v]) => `${k}=${v ?? ''}`) : [];
      const texts = [...env.map(e => e.slice(e.indexOf('=') + 1)), ...[].concat(s.command || []).map(String)];
      svcs.forEach(([other]) => { if (other !== name && texts.some(t => mentions(t, other))) edge(id, nid.get(other)); });
      (s.volumes || []).forEach(v => {
        const src = isObj(v) ? (v.type === 'volume' || !v.type ? v.source : null) : String(v).split(':')[0];
        if (!src || !volNames.has(src)) return;
        if (!vols.has(src)) { const vid = safeId('vol-' + src, nid); nid.set('vol:' + src, vid); vols.set(src, vid); nodes.push({ id: vid, label: src, type: 'storage', sub: 'volume', group: 'compose', desc: `volume ${src}` }); }
        edge(id, vols.get(src), { style: 'data' });
      });
    });
    if (doc.name) nodes.prefix = String(doc.name);
    return { groups, nodes, edges, hidden: 0, total: svcs.length + vols.size };
  }

  /* ======================================================================
     Conversión de uno o varios archivos
     ====================================================================== */
  const FORMAT_NAMES = { terraform: 'Terraform', cloudformation: 'CloudFormation', kubernetes: 'Kubernetes', compose: 'Docker Compose' };

  function convert(files) {
    const parts = { terraform: [], cloudformation: [], kubernetes: [], compose: [] };
    const errors = [];
    files.forEach(f => {
      let docs;
      try { docs = readDocs(f.text, f.name); } catch (e) { errors.push(`${f.name}: ${e.message}`); return; }
      const fmt = detectDocs(docs);
      if (!fmt || fmt === 'diagramon') { errors.push(f.name); return; }
      if (fmt === 'kubernetes') parts.kubernetes.push(...docs);
      else parts[fmt].push({ doc: docs.find(isObj), name: f.name });
    });
    const built = [];
    parts.terraform.forEach(p => built.push(['terraform', terraform(p.doc), p.name]));
    parts.cloudformation.forEach(p => built.push(['cloudformation', cloudformation(p.doc), p.name]));
    if (parts.kubernetes.length) built.push(['kubernetes', kubernetes(parts.kubernetes), files[0].name]);
    parts.compose.forEach(p => built.push(['compose', compose(p.doc), p.name]));
    if (!built.length) { const err = new Error('unrecognized'); err.files = errors; throw err; }

    const diagram = { title: '', groups: [], nodes: [], edges: [] };
    const formats = [...new Set(built.map(b => b[0]))];
    const prefixed = built.length > 1;
    let hidden = 0, total = 0;
    built.forEach(([fmt, d], k) => {
      const pre = prefixed ? `${k + 1}-` : '';
      const map = id => (id ? pre + id : id);
      d.groups.forEach(g => diagram.groups.push({ ...g, id: map(g.id), parent: map(g.parent) }));
      d.nodes.forEach(n => diagram.nodes.push({ ...n, id: map(n.id), group: map(n.group) }));
      d.edges.forEach(e => diagram.edges.push({ ...e, from: map(e.from), to: map(e.to) }));
      hidden += d.hidden; total += d.total;
    });
    diagram.groups.forEach(g => { if (!g.parent) delete g.parent; });
    const base = String(built[0][2] || '').replace(/\.[^.]+$/, '').replace(/[-_.]?(show|plan|state|tfstate|template|manifests?)$/i, '');
    const prefix = built.map(b => b[1].nodes.prefix).find(Boolean);
    const hint = built.map(b => b[1].nodes.hint).find(Boolean);
    diagram.title = `${prefix || (/^(terraform|tf|main|state|tfstate|plan|show|)$/i.test(base) && hint) || base || T('model.untitled')} · ${formats.map(f => FORMAT_NAMES[f]).join(' + ')}`;
    return { diagram, formats, format: formats.map(f => FORMAT_NAMES[f]).join(' + '), nodes: diagram.nodes.length, edges: diagram.edges.length, groups: diagram.groups.length, hidden, total, skipped: errors };
  }

  return { detect, convert, parseYAML, formats: FORMAT_NAMES };
})();
