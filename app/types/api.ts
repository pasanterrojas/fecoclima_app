export type AlertLevel = 'NINGUNA' | 'MODERADA' | 'GRAVE' | 'DATOS_INSUFICIENTES'

export interface Station {
  id: string
  name: string
  code: string
  locality?: string | null
  department?: string | null
  latitude?: number | null
  longitude?: number | null
  influence_geojson?: Record<string, any> | null
  influence_radius_m?: number | null
  source_type: string
  last_synced_at?: string | null
  active: boolean
}

export interface Crop { id: string; code: string; name: string; rules_status: string }

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

export interface DiseaseRisk {
  name: string
  risk: string
  reason: string
  source?: string | null
}

export interface AlertSummary {
  evaluation_id?: string | null
  rule_version_id?: string | null
  rule_version?: string | null
  level_label?: string
  level_color?: string
  maximum_level_color?: string
  maximum_level_label?: string
  current_level: AlertLevel
  maximum_level_72h: AlertLevel
  conditions_met: number
  conditions_total: number
  completion_percentage: number
  confidence: number
  evaluated_at?: string | null
  conditions: AlertCondition[]
  diseases: DiseaseRisk[]
  simple_explanation: string
}

export interface PhenologyStageStatus {
  planting_date?: string
  analysis_date?: string
  days_after_planting: number
  stage_code?: string | null
  stage_name?: string | null
  description?: string | null
  stage_progress_pct?: number
  cycle_finished?: boolean
  message?: string
  timeline?: Array<{
    code: string
    name: string
    start_day: number
    end_day: number
    estimated_start_date?: string
    estimated_end_date?: string
  }>
}

export interface ForecastDisease {
  name: string
  risk: 'bajo' | 'moderado' | 'alto'
  dates: string[]
  reason?: string
  reasons?: string[]
  source?: string | null
}

export interface ForecastUnresolvedDisease {
  name: string
  missing_variables: string[]
  source?: string | null
}

export interface ForecastRiskDay {
  date: string
  potential_color?: string
  potential_label?: string
  stage_code?: string | null
  stage_name?: string | null
  potential_level: AlertLevel
  official_alert: boolean
  conditions_met: number
  conditions_total: number
  available_conditions: number
  missing_conditions: number
  coverage_pct: number
  confidence: number
  diseases: Array<Record<string, any>>
  unresolved_diseases?: ForecastUnresolvedDisease[]
  explanation: string
}

export interface ForecastRisk {
  days: ForecastRiskDay[]
  diseases: ForecastDisease[]
  unresolved_diseases?: ForecastUnresolvedDisease[]
  methodology?: string
}

export interface Recommendation {
  _agent_status?: string
  _run_id?: string
  _agent_name?: string
  _agent_purpose?: string
  _model?: string | null
  _cached?: boolean
  markdown?: string
  sources?: Array<{ documento?: string; document?: string; pagina_o_seccion?: string }>
  has_satellite_image?: boolean
  // Compatibilidad con respuestas estructuradas de versiones anteriores.
  resumen?: string
  explicacion_alerta?: string
  enfermedades?: Array<{ nombre: string; nivel_riesgo: 'bajo' | 'moderado' | 'alto'; justificacion: string }>
  acciones_recomendadas?: string[]
  variables_a_vigilar?: string[]
  evidencia_satelital?: {
    disponible: boolean
    resumen: string
    senales_utilizadas: string[]
    confiabilidad: 'alta' | 'media' | 'limitada' | 'no_disponible' | string
    limitaciones: string[]
  }
  limitaciones?: string[]
  fuentes?: Array<{ documento: string; pagina_o_seccion: string }>
}


export interface SatelliteObservation {
  id?: string
  captured_at?: string | null
  cloud_percentage?: number | null
  ndvi?: number | null
  ndwi?: number | null
  ndmi?: number | null
  lai?: number | null
  provider?: string | null
  resolution_m?: number | null
  source_url?: string | null
  plot_name?: string | null
  processing_status?: 'PROCESSED' | 'CATALOG_ONLY' | string | null
  scene_id?: string | null
  geometry_mode?: string | null
  processing_error?: string | null
  image_available?: boolean
  index_images?: Record<string, string | null>
  visual_layers_available?: number
  indices?: Record<string, number | null>
  statistics?: Record<string, {
    min?: number | null
    max?: number | null
    mean?: number | null
    stdev?: number | null
    sample_count?: number | null
    no_data_count?: number | null
    percentiles?: Record<string, number>
  }>
  scene_metadata?: Record<string, any>
  previous_comparison?: { ndvi_delta?: number; ndmi_delta?: number; ndwi_delta?: number }
  plot_id?: string | null
  plot_crop_id?: string | null
  plot_area_ha?: number | null
  analysis?: SatelliteAnalysis | null
}

export interface SatelliteSignal {
  code: string
  label: string
  level: 'positive' | 'info' | 'attention' | string
  value?: number | null
  message: string
}

export interface SatelliteAnalysis {
  summary: string
  quality_score: number
  reliability: 'alta' | 'media' | 'limitada' | string
  age_days: number
  geometry_mode: string
  geometry_label: string
  indices_available: number
  signals: SatelliteSignal[]
  evidence_for_agent: string[]
  limitations: string[]
  statistics?: Record<string, any>
  thresholds?: Record<string, number>
  agent_policy?: Record<string, any>
}

export interface SatelliteMapScene {
  scene_id: string
  captured_at: string
  cloud_percentage?: number | null
  preview_url?: string | null
  processed: boolean
  observation_id?: string | null
  processing_status?: string | null
  image_available: boolean
  indices_available: number
}

export interface SatelliteMapInterpretation {
  level: 'ATTENTION' | 'WATCH' | 'LIMITED' | 'NO_DATA' | string
  headline: string
  summary: string
  actions: string[]
  what_to_watch: string[]
  limitations: string[]
  deltas?: { ndvi?: number | null; ndmi?: number | null }
}

export interface SatelliteMapContext {
  station: Pick<Station, 'id' | 'name' | 'code' | 'locality' | 'latitude' | 'longitude'> & { timezone?: string | null }
  crop: Pick<Crop, 'id' | 'code' | 'name'>
  geometry: Record<string, any>
  geometry_source: 'POLYGON' | 'POINT_RADIUS' | string
  geometry_bounds: { west: number; south: number; east: number; north: number }
  area_ha?: number | null
  observation?: SatelliteObservation | null
  previous_observation?: SatelliteObservation | null
  processed_observations: Array<Record<string, any>>
  catalog_scenes: SatelliteMapScene[]
  catalog_status?: 'CURRENT' | 'STALE_CACHE' | 'DEGRADED' | 'FAILED' | string
  catalog_warning?: string | null
  catalog_error?: string | null
  weather_on_capture?: Record<string, any> | null
  latest_station_reading?: Record<string, any> | null
  forecast: Array<Record<string, any>>
  interpretation: SatelliteMapInterpretation
  runtime_config: {
    max_cloud_percentage: number
    lookback_days: number
    history_days: number
    history_limit: number
    refresh_hours: number
    catalog_limit: number
    minimum_valid_pixels: number
    default_map_opacity: number
  }
  context_date?: string | null
  generated_at: string
}

export interface SatelliteMapAgentResult {
  markdown: string
  sources?: Array<{ documento?: string; pagina_o_seccion?: string }>
  model?: string | null
  fallback?: boolean
  reason?: string
  run_id?: string
}

export interface SourceSyncStatus {
  provider: string
  supported: boolean
  requested: boolean
  attempted: boolean
  status: 'NOT_REQUESTED' | 'SKIPPED' | 'MISCONFIGURED' | 'CURRENT' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string
  reason?: string | null
  error?: string | null
  last_synced_at?: string | null
  latest_before?: string | null
  latest_after?: string | null
  received: number
  created: number
  updated: number
}

export interface ForecastStatus {
  configured: boolean
  provider: string
  refreshed: boolean
  error?: string | null
  coordinate_source?: string | null
}

export interface SatelliteStatus {
  configured: boolean
  catalog: string
  processing_credentials: boolean
  refresh_result?: Record<string, any> | null
  error?: string | null
}


export interface YearComparisonSummaryValue {
  min?: number | null
  max?: number | null
  mean?: number | null
  last?: number | null
  sum?: number | null
  available_samples?: number
}

export interface YearComparisonPeriod {
  from: string
  to: string
  samples: number
  expected_samples: number
  coverage_pct: number
  summary: Record<string, YearComparisonSummaryValue>
  series: Array<Record<string, string | number | null>>
}

export interface YearComparison {
  period: string
  anchor: string
  current: YearComparisonPeriod
  previous_year: YearComparisonPeriod
  deltas: {
    temperature_mean_c?: number | null
    humidity_mean_pct?: number | null
    rain_sum_mm?: number | null
    soil_moisture_mean_pct?: number | null
    evapotranspiration_sum_mm?: number | null
  }
  comparability: {
    status: 'comparable' | 'insufficient' | string
    minimum_coverage_pct: number
    notes: string[]
  }
  historical_sync?: Record<string, any> | null
  generated_at?: string
}

export interface DashboardResponse {
  station: Station
  crop: Crop
  planting_date: string
  observation_date?: string
  phenology: PhenologyStageStatus
  latest_reading_at?: string | null
  reading_age_minutes?: number | null
  connection_status: 'online' | 'delayed' | 'offline' | 'no_data'
  source_sync?: SourceSyncStatus
  metrics: MetricValue[]
  alert: AlertSummary
  series: Array<Record<string, string | number | null>>
  year_comparison?: YearComparison | null
  forecast: Array<Record<string, any>>
  forecast_status?: ForecastStatus
  forecast_risk: ForecastRisk
  satellite?: SatelliteObservation | null
  satellite_status?: SatelliteStatus
  recommendation?: Recommendation | null
  satellite_recommendation?: Recommendation | null
  year_comparison_recommendation?: Recommendation | null
  data_quality: {
    completion_percentage: number
    record_completeness_percentage?: number
    variable_completeness_percentage?: number
    missing_variables: string[]
    outliers: number
    notes?: string[]
  }
  analysis_engine?: { aggregation: string; numerical_processing: string; alert_method: string; agent_role: string; agent_trigger?: string }
  analysis_generated_at?: string
}
