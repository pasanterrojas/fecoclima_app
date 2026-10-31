import { esriWorldImageryBasemap, openSatelliteBasemap } from '~/utils/mapBasemaps'

/** A single provider for public maps, station editors and parcel navigation. */
export function useSatelliteBasemap() {
  const config = useRuntimeConfig()
  return config.public.satelliteBasemap === 'esri' ? esriWorldImageryBasemap : openSatelliteBasemap
}
