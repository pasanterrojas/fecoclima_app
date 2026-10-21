import type { LayerSpecification } from 'maplibre-gl'

export const detailSource = 'navigation-details'
export const detailGlyphs = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
const name = ['coalesce', ['get', 'name:es'], ['get', 'name'], ['get', 'ref'], '']

export function detailedNavigationLayers(): LayerSpecification[] {
  const text = { 'text-color': '#fffef8', 'text-halo-color': '#234050', 'text-halo-width': 1.3 }
  const layout = { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-padding': 2 }
  return [
    { id: `${detailSource}-roads`, type: 'line', source: detailSource, 'source-layer': 'transportation', minzoom: 11,
      paint: { 'line-color': '#f4edc7', 'line-opacity': 0.65, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 18, 2] } },
    { id: `${detailSource}-places`, type: 'symbol', source: detailSource, 'source-layer': 'place', minzoom: 3,
      layout: { ...layout, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 14, 16], 'text-variable-anchor': ['center', 'top', 'bottom'] }, paint: text },
    { id: `${detailSource}-streets`, type: 'symbol', source: detailSource, 'source-layer': 'transportation_name', minzoom: 11,
      layout: { ...layout, 'symbol-placement': 'line', 'text-size': 12, 'symbol-spacing': 200 }, paint: text },
    { id: `${detailSource}-poi`, type: 'symbol', source: detailSource, 'source-layer': 'poi', minzoom: 14,
      layout: { ...layout, 'text-size': 11, 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.4 }, paint: text },
    { id: `${detailSource}-addresses`, type: 'symbol', source: detailSource, 'source-layer': 'housenumber', minzoom: 17,
      layout: { ...layout, 'text-field': ['get', 'housenumber'], 'text-size': 10 }, paint: text },
  ] as LayerSpecification[]
}
