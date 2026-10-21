import type { MapParcel } from '~/types/plots'

export const parcelColors = ['#22a680', '#6366f1', '#f59e0b', '#0284c7', '#e15a86']
export function parcelDisplayColor(parcel?: Pick<MapParcel, 'map_color'> | null, index = 0): string {
  return /^#[0-9a-f]{6}$/i.test(parcel?.map_color || '') ? parcel!.map_color! : parcelColors[index % parcelColors.length]!
}

export function parcelMapCoordinates(parcels: MapParcel[]): [number, number][] {
  return parcels.filter(parcel=>parcel.geojson?.coordinates).flatMap(parcel => parcel.geojson.coordinates.flat(parcel.geojson.type === 'Polygon' ? 1 : 2) as number[][])
    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(point => [point[0]!, point[1]!] as [number, number])
}
