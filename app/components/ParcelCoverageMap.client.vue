<script setup lang="ts">
import type { Geometry, Influence } from '~/types/plots'
const props = defineProps<{ geometry: Geometry; influences: Influence[] }>()
function rings(geometry?: Geometry): number[][][] {
  // Older saved analyses can contain station metadata without its polygon.
  if (!geometry || !Array.isArray(geometry.coordinates)) return []
  return geometry.type === 'Polygon'
    ? (geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).flat()
}
const bounds = computed(() => {
  const points = rings(props.geometry).flat()
  if (!points.length) return [-63, -28, -54, -19]
  const xs = points.map((p) => p[0]!),
    ys = points.map((p) => p[1]!)
  const west = Math.min(...xs),
    east = Math.max(...xs),
    south = Math.min(...ys),
    north = Math.max(...ys)
  const padX = Math.max((east - west) * 0.25, 0.001),
    padY = Math.max((north - south) * 0.25, 0.001)
  return [west - padX, south - padY, east + padX, north + padY]
})
function path(geometry: Geometry) {
  const [west, south, east, north] = bounds.value as [number, number, number, number]
  return rings(geometry)
    .map(
      (ring) =>
        ring
          .map(
            (p, i) =>
              `${i ? 'L' : 'M'}${((p[0]! - west) * 600) / (east - west)},${((north - p[1]!) * 300) / (north - south)}`
          )
          .join(' ') + ' Z'
    )
    .join(' ')
}
</script>
<template>
  <figure class="coverage">
    <svg
      viewBox="0 0 600 300"
      role="img"
      aria-label="Polígono de parcela y áreas de influencia de estaciones"
    >
      <defs>
        <pattern id="coverage-grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="#dce5e8" />
        </pattern>
        <clipPath id="coverage-clip"><rect width="600" height="300" /></clipPath>
      </defs>
      <rect width="600" height="300" fill="url(#coverage-grid)" />
      <g clip-path="url(#coverage-clip)">
        <path
          v-for="station in influences"
          :key="station.station_id"
          :d="path(station.influence_geojson)"
          fill="#78b4cf33"
          stroke="#3485ad"
          stroke-width="2"
          fill-rule="evenodd"
        >
          <title>{{ station.name }} · {{ station.coverage_pct }}%</title>
        </path>
        <path :d="path(geometry)" fill="#3c985466" stroke="#23783d" stroke-width="3" fill-rule="evenodd" />
      </g>
      <text x="565" y="22" fill="#15334a">N ↑</text>
    </svg>
    <figcaption>Verde: parcela · Azul: influencia de estaciones. Esquema geográfico de cobertura.</figcaption>
  </figure>
</template>
<style scoped>
.coverage {
  margin: 0;
}
.coverage svg {
  width: 100%;
  max-height: 300px;
  border: 1px solid var(--fc-border);
  border-radius: 12px;
  background: #f7faf8;
}
.coverage figcaption {
  font-size: 0.75rem;
  color: var(--fc-text-muted);
  margin-top: 7px;
}
</style>
