import type { Geometry, Parcel, ParcelAnalysis } from './plots'

export type ArchivedParcel = Omit<Parcel, 'crop_id' | 'planting_date'> & {
  crop_id: string | null
  planting_date: string | null
  deleted_at: string | null
  created_at: string
  scene_count?: number
}
export type ArchivedScene = NonNullable<ParcelAnalysis['context']['satellite']> & {
  processing_geometry: Geometry | null
  used_in_analyses: string[]
  processing_status?: string
  scene_id?: string
}
export interface HistoryPage<T> { items: T[]; total: number; limit: number; offset: number }
