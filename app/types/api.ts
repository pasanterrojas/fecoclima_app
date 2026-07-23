export type AlertLevel = 'NINGUNA' | 'MODERADA' | 'GRAVE' | 'DATOS_INSUFICIENTES'

export interface Station {
  id: string
  name: string
  code: string
  locality?: string | null
  department?: string | null
  latitude?: number | null
  longitude?: number | null
  source_type: string
  last_synced_at?: string | null
  active: boolean
}

export interface Crop { id: string; code: string; name: string; rules_status: string }
export interface CropCycle { id: string; name: string; crop_id: string; station_id: string; planting_date: string; current_stage?: string | null }

export interface MetricValue {
  key: string
  label: string
  value: number | string | null
  unit?: string
  origin: 'measured' | 'imported' | 'estimated' | 'forecast' | 'unavailable'
}

export interface AlertCondition {
  key: string
  label: string
  status: 'met' | 'not_met' | 'missing'
  value?: number | null
  unit?: string | null
  explanation?: string
}

export interface AlertSummary {
  current_level: AlertLevel
  maximum_level_72h: AlertLevel
  conditions_met: number
  completion_percentage: number
  confidence: number
  evaluated_at?: string | null
  conditions: AlertCondition[]
  diseases: Array<{ name: string; risk: string; reason: string }>
  simple_explanation: string
}

export interface Recommendation {
  resumen: string
  explicacion_alerta: string
  enfermedades: Array<{ nombre: string; nivel_riesgo: 'bajo' | 'moderado' | 'alto'; justificacion: string }>
  acciones_recomendadas: string[]
  variables_a_vigilar: string[]
  limitaciones: string[]
  fuentes: Array<{ documento: string; pagina_o_seccion: string }>
}

export interface SatelliteObservation {
  captured_at?: string | null
  cloud_percentage?: number | null
  ndvi?: number | null
  ndwi?: number | null
  ndmi?: number | null
  lai?: number | null
  provider?: string | null
  resolution_m?: number | null
  source_url?: string | null
}

export interface DashboardResponse {
  station: Station
  latest_reading_at?: string | null
  reading_age_minutes?: number | null
  connection_status: 'online' | 'delayed' | 'offline' | 'no_data'
  metrics: MetricValue[]
  alert: AlertSummary
  series: Array<Record<string, string | number | null>>
  forecast: Array<Record<string, string | number | null>>
  satellite?: SatelliteObservation | null
  recommendation?: Recommendation | null
  data_quality: { completion_percentage: number; missing_variables: string[]; outliers: number }
}
