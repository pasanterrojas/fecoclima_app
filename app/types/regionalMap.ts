import type { MapStation } from './plots'
export interface RegionalVariable { id: string; label: string; unit: string; minimum: number; maximum: number; available_stations: number; palette: string[]; absolute_minimum?: number; absolute_maximum?: number; observed_minimum?: number | null; observed_maximum?: number | null; spread?: number | null; small_difference?: boolean }
export interface RegionalStation extends MapStation { values: Record<string, number | null>; statuses: Record<string, string>; coverage_pct: Record<string, number>; latest_at: string | null; stale: boolean; altitude_m?: number | null }
export interface RegionalSnapshot { reference_at: string; from: string; window_hours: number; stations: RegionalStation[]; variables: RegionalVariable[]; method: string; limitations: string[]; source_refresh: {station_id: string; status: string}[] }
export interface RegionalAnalysis { job_id: string; status: string; snapshot?: RegionalSnapshot | null; message?: string }
