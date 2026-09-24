{{- define "worldmonitor.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "worldmonitor.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "worldmonitor.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Per-component resource name, e.g. "myrelease-worldmonitor-app". Called as:
  include "worldmonitor.componentFullname" (list . "app")
*/}}
{{- define "worldmonitor.componentFullname" -}}
{{- $ctx := index . 0 -}}
{{- $component := index . 1 -}}
{{- printf "%s-%s" (include "worldmonitor.fullname" $ctx) $component | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "worldmonitor.labels" -}}
helm.sh/chart: {{ include "worldmonitor.chart" . }}
{{ include "worldmonitor.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "worldmonitor.selectorLabels" -}}
app.kubernetes.io/name: {{ include "worldmonitor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Per-component labels (includes the shared labels plus app.kubernetes.io/component).
Called as: include "worldmonitor.componentLabels" (list . "app")
*/}}
{{- define "worldmonitor.componentLabels" -}}
{{- $ctx := index . 0 -}}
{{- $component := index . 1 -}}
{{ include "worldmonitor.labels" $ctx }}
app.kubernetes.io/component: {{ $component }}
{{- end -}}

{{/*
Per-component selector labels only (no chart/version churn) - used in both the
Deployment's spec.selector and its pod template labels, which must match
exactly and stay stable across upgrades.
Called as: include "worldmonitor.componentSelectorLabels" (list . "app")
*/}}
{{- define "worldmonitor.componentSelectorLabels" -}}
{{- $ctx := index . 0 -}}
{{- $component := index . 1 -}}
{{ include "worldmonitor.selectorLabels" $ctx }}
app.kubernetes.io/component: {{ $component }}
{{- end -}}

{{- define "worldmonitor.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "worldmonitor.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "worldmonitor.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "worldmonitor.fullname" .) -}}
{{- end -}}
{{- end -}}

