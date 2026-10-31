import stationMarkerAsset from '~/assets/icons/weather-station-marker.svg?url&no-inline'
import type { Geometry, MapStation } from '~/types/plots'

const stationPalette = ['#f94144', '#277da1', '#f9c74f', '#90be6d', '#9b5de5', '#f3722c', '#00b4d8', '#f15bb5']
export function stationDisplayColor(station: MapStation, index = 0): string {
  if (station.active === false) return '#94a3b8'
  const color = station.map_color || station.integration_config?.map_color
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : stationPalette[index % stationPalette.length]!
}

// Build under the application asset prefix so reverse proxies can serve it.
export const weatherStationIconUrl = stationMarkerAsset

export interface AdminStation extends MapStation {
  code: string
  external_guid: string | null
  effective_endpoint_url?: string | null
  endpoint_url: string | null
  description: string | null
  altitude_m: number | null
  country: string | null
  department: string | null
  district: string | null
  locality: string | null
  active: boolean
  influence_area?: Geometry | null
  expected_interval_minutes?: number
  timezone?: string
  import_config?: Record<string, unknown>
  integration_config?: Record<string, unknown>
  available_variables?: string[]
  leaf_sensor_config?: { mode?: string; wet_threshold?: number; [key: string]: unknown }
}

/** Spherical preview only; saved influence areas use the Python WGS84 pipeline. */
export function stationRadiusPreview(latitude: number, longitude: number, radius: number): Geometry {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180, distance = radius / 6371008.8
  const ring: number[][] = []
  for (let i = 0; i <= 72; i++) {
    const bearing = i / 72 * Math.PI * 2
    const pointLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing))
    const pointLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(pointLat))
    ring.push([pointLon * 180 / Math.PI, pointLat * 180 / Math.PI])
  }
  ring[ring.length - 1] = [...ring[0]!]
  return { type: 'Polygon', coordinates: [ring] }
}

export function stationError(error: unknown): string {
  const detail = (error as { data?: { detail?: unknown } }).data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => (item as { msg?: string }).msg || 'Dato inválido').join(' · ')
  return 'No se pudo completar la operación. Intente nuevamente.'
}

/** Bounds include the coverage rings so even a single station fits its radius. */
export function stationMapCoordinates(stations: MapStation[]): [number, number][] {
  return stations.flatMap(station => {
    const points: number[][] = []
    if (station.longitude != null && station.latitude != null) points.push([station.longitude, station.latitude])
    const geometry = station.influence_geojson
    if (geometry) points.push(...geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2) as number[][])
    return points.filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1])).map(point => [point[0]!, point[1]!] as [number, number])
  })
}
