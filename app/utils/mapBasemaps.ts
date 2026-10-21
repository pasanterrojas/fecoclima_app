import type { StyleSpecification } from 'maplibre-gl'

export interface RasterBasemap {
  id: string
  tiles: string
  maxZoom: number
  credit: string
  creditUrl: string
  attribution: string
}

// EOX's 2016 mosaic is CC BY 4.0. Later editions have different licenses.
// This is a historical navigation background, not the parcel's current scene.
export const openSatelliteBasemap: RasterBasemap = {
  id: 'eox-sentinel-2016',
  tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
  maxZoom: 14,
  credit: 'EOxCloudless · Copernicus 2016/2017 · CC BY 4.0',
  creditUrl: 'https://cloudless.eox.at/license-non-commercial',
  attribution: '<a href="https://maps.eox.at/">EOX</a> · Copernicus 2016/2017 · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
}

export const streetBasemap: RasterBasemap = {
  id: 'openstreetmap', tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19,
  credit: '© OpenStreetMap', creditUrl: 'https://www.openstreetmap.org/copyright',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
}

// Transparent labels and roads; independent of satellite-scene/index imagery.
export const navigationOverlay: RasterBasemap = {
  id: 'navigation-labels',
  tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png',
  maxZoom: 17,
  credit: 'Calles © OpenStreetMap · EOX / MapServer',
  creditUrl: 'https://maps.eox.at/',
  attribution: 'Calles © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Rendering © <a href="https://maps.eox.at/">EOX</a> / MapServer',
}

export function rasterBasemapStyle(source: RasterBasemap): StyleSpecification {
  return {
    version: 8, name: source.id,
    sources: { basemap: { type: 'raster', tiles: [source.tiles], tileSize: 256, maxzoom: source.maxZoom, attribution: source.attribution } },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-fade-duration': 0 } }],
  }
}
