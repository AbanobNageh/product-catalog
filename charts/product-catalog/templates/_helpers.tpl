{{/*
Named templates, shared by every file in templates/. A file starting with `_` renders
nothing by itself; `include "<name>" <arg>` pulls a definition in.

Each workload builds one argument dict at the top of its files and passes it to these:
  root       the top-level context ($), for .Release and .Chart
  name       the software: catalog-api, search-service, postgres, redis
  component  its role: api, migration, seed, database, cache
  version    optional: the image tag
*/}}

{{/*
Selector labels: the labels a Deployment, StatefulSet, Service or PDB selects pods by.
Selectors are immutable, so nothing here may change over the release's life (ADR-0012).
`component` keeps the migration and seed Job pods (name catalog-api) out of the
catalog-api Service, which would otherwise send them traffic.
*/}}
{{- define "product-catalog.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Labels that never change, for places that are immutable too: a StatefulSet's
volumeClaimTemplates. A changing value there (the chart version below) would make every
`helm upgrade` fail with "updates to statefulset spec ... are forbidden".
*/}}
{{- define "product-catalog.stableLabels" -}}
{{ include "product-catalog.selectorLabels" . }}
app.kubernetes.io/part-of: product-catalog
{{- end }}

{{/*
Full labels for every object's metadata and every pod template.
managed-by is "Helm"; helm.sh/chart says which chart version created the object.
*/}}
{{- define "product-catalog.labels" -}}
{{ include "product-catalog.stableLabels" . }}
{{- with .version }}
app.kubernetes.io/version: {{ . | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end }}

{{/*
The env vars every catalog-api container needs to reach Postgres: the API, the migration
and the seed. Kubernetes expands $(VAR) from the variables listed before it.
*/}}
{{- define "product-catalog.databaseEnv" -}}
- name: POSTGRES_DB
  valueFrom:
    configMapKeyRef:
      name: catalog-api-postgres
      key: POSTGRES_DB
- name: POSTGRES_USER
  valueFrom:
    secretKeyRef:
      name: catalog-api-postgres
      key: POSTGRES_USER
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: catalog-api-postgres
      key: POSTGRES_PASSWORD
- name: DATABASE_URL
  value: "postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@catalog-api-postgres:5432/$(POSTGRES_DB)"
{{- end }}
