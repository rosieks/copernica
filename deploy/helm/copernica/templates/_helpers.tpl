{{/* Chart name, overridable. */}}
{{- define "copernica.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Release-qualified name used for every resource. */}}
{{- define "copernica.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "copernica.selectorLabels" -}}
app.kubernetes.io/name: {{ include "copernica.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "copernica.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "copernica.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Chart labels plus resource-specific labels. Usage: include "copernica.labelsWith" (list . .Values.service.labels) */}}
{{- define "copernica.labelsWith" -}}
{{- $root := index . 0 -}}
{{- include "copernica.labels" $root }}
{{- with index . 1 }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "copernica.image" -}}
{{- $image := .Values.image -}}
{{- $name := $image.repository -}}
{{- if $image.registry -}}
{{- $name = printf "%s/%s" (trimSuffix "/" $image.registry) $image.repository -}}
{{- end -}}
{{- if $image.digest -}}
{{- printf "%s@%s" $name $image.digest -}}
{{- else -}}
{{- printf "%s:%s" $name (default .Chart.AppVersion $image.tag) -}}
{{- end -}}
{{- end -}}

{{- define "copernica.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "copernica.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "copernica.claimName" -}}
{{- default (printf "%s-data" (include "copernica.fullname" .)) .Values.persistence.existingClaim -}}
{{- end -}}

{{- define "copernica.initialUserSecretName" -}}
{{- printf "%s-initial-user" (include "copernica.fullname" .) -}}
{{- end -}}

{{/* True ("true") when the chart generates the initial local account. */}}
{{- define "copernica.generatesInitialUser" -}}
{{- if and (eq .Values.wiki.auth.mode "local") (empty .Values.wiki.auth.local.users) -}}true{{- end -}}
{{- end -}}

{{/* Public address: explicit, otherwise derived from the first ingress host. */}}
{{- define "copernica.publicBaseUrl" -}}
{{- if .Values.wiki.publicBaseUrl -}}
{{- .Values.wiki.publicBaseUrl -}}
{{- else if and .Values.ingress.enabled .Values.ingress.hosts -}}
{{- $host := (first .Values.ingress.hosts).host -}}
{{- printf "%s://%s" (ternary "https" "http" (not (empty .Values.ingress.tls))) $host -}}
{{- end -}}
{{- end -}}
