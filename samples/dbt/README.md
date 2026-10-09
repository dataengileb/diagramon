# dbt manifest sample

`manifest.json` is a small, hand-written dbt manifest (schema v12) for a project called `shop_analytics`. It is not produced by a real dbt run; it only has the fields Diagramon reads.

| Part | What it has |
|---|---|
| Sources | `shop` (`orders`, `customers`) and `payments_api` (`payments`, `refunds`), with freshness (`warn_after` / `error_after`) |
| Staging | `stg_orders`, `stg_customers`, `stg_payments`, `stg_refunds` (silver) |
| Intermediate | `int_orders_payments` (silver) and `int_dedupe_payments` (ephemeral, skipped) |
| Marts | `fct_orders` and `dim_customers`: public, contract enforced, `dim_customers` has a PII column; `dim_customers` also has an older version that is skipped |
| Seed | `country_codes` |
| Tests | `not_null`, `unique`, `accepted_values`, `relationships`, a `dbt_utils` test and a singular test, with `error` and `warn` severities |
| Group | `finance_analytics`, owned by the *Data Platform Team* |
| Exposures | *Sales dashboard* and *Churn model* |

To try it: **Import** and choose `manifest.json` (or drop it on the canvas). Pick *New diagram with lineage* to draw sources, bronze/silver/gold stores, dbt and the exposures, or *Merge into this diagram's catalog* to only fill the catalog of the diagram you have open.

With your own project, run `dbt compile` (or `dbt build`) and import `target/manifest.json`. The file is read in the browser and never leaves it.
