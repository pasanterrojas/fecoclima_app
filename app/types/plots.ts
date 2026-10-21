export interface SpectralLegend {
  version: string
  classes: { lower_exclusive: number | null; upper_inclusive: number | null; color: string; label: string }[]
  formula?: string | null
  formula_source?: string | null
  source: string
}
export interface SpectralVisualization {
  index_legends?: Record<string, SpectralLegend>
  index_visual_versions?: Record<string, string>
  classification_warning?: string | null
  visual_grid?: { target_resolution_m: number; output_resolution_m: number; native_resolution_m: number[]; note: string } | null
}

export interface Geometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}
export interface Parcel {
  id: string
  name: string
  map_color?: string
  producer_name?: string | null
  producer_document?: string | null
  crop_id: string
  planting_date: string
  geojson: Geometry
  area_ha: number
  latitude: number
  longitude: number
  active: boolean
  browser_session_id?: string | null
}
export type ParcelDraft = Pick<Parcel, 'name' | 'map_color' | 'producer_name' | 'producer_document' | 'crop_id' | 'planting_date' | 'geojson' | 'active'>
export type MapParcel = Pick<Parcel, 'id' | 'name' | 'geojson' | 'map_color'>
export interface Influence {
  station_id: string
  name: string
  coverage_pct: number
  distance_m: number
  influence_geojson: Geometry
}
export interface MapStation {
  id: string
  name: string
  map_color?: string
  integration_config?: Record<string, unknown>
  latitude?: number | null
  longitude?: number | null
  influence_radius_m?: number | null
  influence_geojson?: Geometry | null
  active?: boolean
}
export interface ParcelAlert {
  conditions_met?: number
  conditions_total?: number
  confidence_pct?: number
  completion_percentage?: number
  level: string
  conditions?: {
    key: string
    label: string
    value: number | null
    unit: string
    status: string
    explanation: string
  }[]
  diseases?: { name: string; risk: string; reason: string; source?: string }[]
  simple_explanation?: string
  missing_reasons?: string[]
}
export interface StationWindow {
  station_id: string
  hours: number
  samples: number
  expected_samples: number
  completeness_pct: number
  stale: boolean
  data_issues?: { code: string; variable?: string; message: string; action: string }[]
  condition_adaptations?: { condition: string; method: string; sensor_unit: string; original_unit: string; threshold_cb: number; message: string }[]
  values: Record<string, number | null>
  rule_values: Record<string, number | null>
  alert: ParcelAlert
  quality?: { completion_percentage: number; record_completeness_percentage: number; variable_completeness_percentage: number; missing_variables: string[]; outliers: number; notes?: string[] }
}
export interface Interpretation {
  allowed_widgets?: string[]
  sources?: { document: string; page_or_section?: string }[]
  markdown: string
  status: string
  purpose: string
  fallback_reason?: string
  images_processed?: boolean
  window_hours?: number
  view_mode?: 'producer' | 'technical'
}
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  status?: string
  images?: { filename: string; url?: string; content_type?: string }[]
  attachments?: { filename: string; url?: string; content_type?: string; size?: number }[]
}
export interface ParcelAnalysis {
  id: string
  plot_id: string
  reference_at: string
  created_at: string
  agent_results: Record<string, Interpretation>
  context: {
    alert_scale?: string
    selected_window_hours?: number
    plot: Parcel
    crop: { id: string; code: string; name: string }
    station_influences: Influence[]
    spatial_coverage_pct: number
    raw_readings: {
      station_id: string
      name: string
      soil_tension?: SoilTension | null
      sensor_units?: Record<string, string>
      reading: Record<string, string | number | null> | null
    }[]
    windows: Record<
      string,
      { hours: number; stations: StationWindow[]; level: string; usable_coverage_pct?: number; representative_alert?: ParcelAlert }
    >
    phenology: {
      stage_name: string
      description?: string
      days_after_planting: number
      stage_progress_pct?: number
      timeline: { code: string; name: string; estimated_start_date: string; estimated_end_date: string }[]
    }
    satellite: SpectralVisualization & {
      id: string
      source_url?: string
      captured_at: string
      ndvi?: number
      ndmi?: number
      ndwi?: number
      quality?: Record<string, unknown>
      image_available?: boolean
      index_images?: Record<string, string | null>
      data_warning?: string
      indices?: Record<string, number | null>
    } | null
    radar?: { captured_at: string; vv_mean: number; vh_mean: number; valid_pixels: number } | null
    inspection_point: {
      latitude: number
      longitude: number
      method: string
      maps_url: string
      reason?: string
    }
    forecast: {
      status: string
      generated_at?: string
      days: {
        date: string
        temperature_min_c: number | null
        temperature_max_c: number | null
        precipitation_mm: number | null
        humidity_pct: number | null
      }[]
    }
    historical_regression: {
      station_id: string
      name: string
      status: string
      days: { date: string; values: Record<string, number> }[]
    }[]
    limitations: string[]
  }
}
export interface ParcelAlertRule {
  id: string
  natural_language: string
  channel: string
  recipient: string
  active: boolean
  expression: Record<string, unknown>
}

export interface SoilTension { value: number; unit: string; position_pct: number; band_index: number; label: string; description: string; bands: { min: number; max: number; label: string; description: string; color: string }[] }
