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
and the seed. Takes the root context ($).
- External database (catalogApi.database.existingSecret): DATABASE_URL straight from that
  Secret. The URL is built outside the chart, because the password may need URL-encoding,
  which $(VAR) expansion can't do.
- In-chart Postgres: built from the parts. Kubernetes expands $(VAR) from the variables
  listed before it.
Plus NODE_EXTRA_CA_CERTS when catalogApi.extraCaCerts is set: Node then trusts those CAs
on top of its built-in list (the file is mounted by the extraCa* helpers below).
*/}}
{{- define "product-catalog.databaseEnv" -}}
{{- /* `-}}` here trims the line break after the tag, so the output starts with "- name". */ -}}
{{- with .Values.catalogApi.database.existingSecret -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ . }}
      key: DATABASE_URL
{{- else -}}
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
{{- with .Values.catalogApi.extraCaCerts.configMap }}
- name: NODE_EXTRA_CA_CERTS
  value: "/etc/ssl/extra-ca/{{ required "catalogApi.extraCaCerts.key is required with extraCaCerts.configMap" $.Values.catalogApi.extraCaCerts.key }}"
{{- end }}
{{- end }}

{{/*
catalog-api's three API keys (ADR-0020), from the Secret named by catalogApi.apiKeysSecret.
Takes the root context ($).
*/}}
{{- define "product-catalog.apiKeysEnv" -}}
{{- $env := list }}
{{- range list "READ_API_KEY" "WRITE_API_KEY" "ADMIN_API_KEY" }}
{{- $ref := dict "name" $.Values.catalogApi.apiKeysSecret "key" . }}
{{- $env = append $env (dict "name" . "valueFrom" (dict "secretKeyRef" $ref)) }}
{{- end }}
{{- toYaml $env }}
{{- end }}

{{/*
The extra CA certificates' volume (pod level) and mount (container level), for the
catalog-api pods. Both render nothing when catalogApi.extraCaCerts.configMap is empty, so
the templates include them with `with`, which skips an empty result.
*/}}
{{- define "product-catalog.extraCaVolumes" -}}
{{- with .Values.catalogApi.extraCaCerts.configMap }}
volumes:
- name: extra-ca-certs
  configMap:
    name: {{ . }}
{{- end }}
{{- end }}

{{- define "product-catalog.extraCaVolumeMounts" -}}
{{- with .Values.catalogApi.extraCaCerts.configMap }}
volumeMounts:
- name: extra-ca-certs
  mountPath: /etc/ssl/extra-ca
  readOnly: true
{{- end }}
{{- end }}
