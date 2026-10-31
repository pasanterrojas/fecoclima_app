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
  id: 'open-eox-cloudless',
  tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
  maxZoom: 14,
  credit: 'EOxCloudless · Copernicus 2016/2017 · CC BY 4.0',
  creditUrl: 'https://cloudless.eox.at/license-non-commercial',
  attribution: '<a href="https://maps.eox.at/">EOxCloudless by EOX</a> · Contains modified Copernicus Sentinel data 2016 &amp; 2017 · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
}

// Public online tile endpoint; usage is subject to the applicable Esri license.
// Native detail varies by location. Do not export or persist these tiles offline.
export const esriWorldImageryBasemap: RasterBasemap = {
  id: 'esri-world-imagery',
  tiles: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  maxZoom: 19,
  credit: 'Esri · Vantor · Earthstar Geographics · GIS User Community',
  creditUrl: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
  attribution: 'Source: <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri, Vantor, Earthstar Geographics, and the GIS User Community</a> · <a href="https://goto.arcgis.com/termsofuse/viewsummary">Terms of use</a>',
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
