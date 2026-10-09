<script setup lang="ts">
import { CircleGauge, Droplets } from 'lucide-vue-next'
import type { MetricValue } from '~/types/api'

const props = defineProps<{ metric: MetricValue; alertId?: string | null; period?: string; disabled?: boolean }>()

const scale = computed(() => props.metric.interpretation || null)
const numericValue = computed(() => {
  if (props.metric.value === null || props.metric.value === '') return null
  const value = Number(props.metric.value)
  return Number.isFinite(value) ? value : null
})
const formattedValue = computed(() => {
  if (numericValue.value == null) return null
  return Number.isInteger(numericValue.value) ? String(numericValue.value) : numericValue.value.toFixed(1)
})
const markerPosition = computed(() => {
  if (!scale.value || numericValue.value == null) return 0
  const span = Math.max(1, scale.value.maximum - scale.value.minimum)
  return Math.max(0, Math.min(100, ((numericValue.value - scale.value.minimum) / span) * 100))
})
const activeRange = computed(() => {
  if (!scale.value || numericValue.value == null) return null
  return scale.value.ranges.find((range, index) => {
    const isLast = index === scale.value!.ranges.length - 1
    return numericValue.value! >= range.from && (isLast ? numericValue.value! <= range.to : numericValue.value! < range.to)
  }) || null
})
const scaleLabels = computed(() => scale.value ? [...new Set([scale.value.minimum, ...scale.value.ranges.map(range => range.to), scale.value.maximum])] : [])

function segmentWidth(from: number, to: number): string {
  if (!scale.value) return '0%'
  return `${((to - from) * 100) / Math.max(1, scale.value.maximum - scale.value.minimum)}%`
}

function scalePosition(value: number): string {
  if (!scale.value) return '0%'
  return `${((value - scale.value.minimum) * 100) / Math.max(1, scale.value.maximum - scale.value.minimum)}%`
}

function originLabel(origin: MetricValue['origin']): string {
  return {
    measured: 'Medido',
    imported: 'Importado',
    estimated: 'Estimado',
    forecast: 'Pronosticado',
    unavailable: 'No disponible',
  }[origin]
}
</script>

<template>
  <article class="metric card" :class="{ 'metric-with-scale': scale }">
    <div class="metric-reading">
      <div class="metric-icon"><Droplets v-if="scale" /><CircleGauge v-else /></div>
      <div class="metric-summary">
        <div class="metric-label">{{ metric.label }}</div>
        <div class="metric-value">
          <template v-if="metric.value !== null">{{ formattedValue }} <small>{{ metric.unit }}</small></template>
          <span v-else class="missing">Sin dato</span>
        </div>
        <div class="origin">{{ originLabel(metric.origin) }}</div>
        <div v-if="activeRange" class="current-reading" :style="{ '--range-color': activeRange.color }">
          <small>Qué indica esta lectura</small>
          <b>{{ activeRange.label }}</b>
          <span>{{ activeRange.description }}</span>
        </div>
      </div>
    </div>

    <WidgetExplanation :alert-id="alertId" :period="period || '72h'" widget="metric" :item-key="metric.key" :disabled="disabled" />

    <details v-if="scale" class="interpretation">
      <summary>Guía para leer este dato (i)</summary>
      <header>
        <div><small>Guía rápida para campo</small><b>{{ scale.title }}</b></div>
        <span>{{ scale.minimum }} a {{ scale.maximum }} {{ scale.unit }}</span>
      </header>
      <div class="scale-wrap">
        <div class="scale-bar">
          <span
            v-for="range in scale.ranges"
            :key="`${range.from}-${range.to}`"
            :style="{ width: segmentWidth(range.from, range.to), backgroundColor: range.color }"
          />
          <i v-if="numericValue !== null" class="marker" :style="{ left: `${markerPosition}%` }"><em>{{ formattedValue }}</em></i>
        </div>
        <div class="scale-labels">
          <span v-for="value in scaleLabels" :key="value" :class="{ first: value === scale.minimum, last: value === scale.maximum }" :style="{ left: scalePosition(value) }">{{ value }}</span>
        </div>
      </div>
      <div class="range-list">
        <article v-for="range in scale.ranges" :key="range.label" :class="{ active: activeRange?.label === range.label }">
          <span class="swatch" :style="{ backgroundColor: range.color }" />
          <div>
            <span class="range-value">{{ range.from }} a {{ range.to }} {{ scale.unit }}</span>
            <b>{{ range.label }}</b>
            <small>{{ range.description }}</small>
          </div>
          <em v-if="activeRange?.label === range.label">Valor actual</em>
        </article>
      </div>
      <footer>
        <small v-if="scale.caution" class="caution">{{ scale.caution }}</small>
        <a v-if="scale.source_url" class="reference" :href="scale.source_url" target="_blank" rel="noopener noreferrer">Consultar referencia técnica</a>
      </footer>
    </details>
  </article>
</template>

<style scoped>
.metric{display:flex;flex-direction:column;gap:4px;min-height:126px;padding:17px;box-shadow:none}.metric-reading{display:flex;gap:13px;min-width:0}.metric-summary{min-width:0}.metric-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#e6f2f9;color:var(--fc-primary);flex:0 0 auto}.metric-icon svg{width:23px}.metric-label{font-size:.9rem;line-height:1.25;color:var(--fc-text-muted)}.metric-value{margin-top:4px;font-size:1.55rem;font-weight:900;line-height:1.1;color:var(--fc-primary)}.metric-value small{font-size:.8rem;font-weight:800}.origin{margin-top:6px;font-size:.76rem;color:var(--fc-text-muted)}.missing{font-size:1rem;color:var(--fc-text-muted)}
.metric-with-scale{grid-column:1/-1;align-items:stretch;gap:14px;min-height:0;padding:22px}.metric-with-scale .metric-reading{padding:4px 0}.current-reading{--range-color:var(--fc-secondary);display:flex;flex-direction:column;gap:3px;margin-top:15px;padding:12px 13px;border-left:5px solid var(--range-color);border-radius:9px;background:var(--fc-surface-muted)}.current-reading small{color:var(--fc-text-muted);font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.current-reading b{color:var(--fc-primary);font-size:.95rem}.current-reading span{color:var(--fc-text-muted);font-size:.78rem;line-height:1.4}
.interpretation{min-width:0;padding:15px;border:1px solid var(--fc-border);border-radius:10px}.interpretation>summary{color:var(--fc-primary);font-weight:800;cursor:pointer}.interpretation header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-top:16px}.interpretation header div{display:flex;flex-direction:column;gap:2px}.interpretation header small{color:var(--fc-secondary);font-size:.7rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.interpretation header b{color:var(--fc-primary);font-size:1rem}.interpretation header>span{flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#eaf4f9;color:var(--fc-primary);font-size:.73rem;font-weight:800}.scale-wrap{margin:27px 5px 13px}.scale-bar{position:relative;display:flex;height:15px;overflow:visible;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(20,50,70,.16)}.scale-bar>span:first-child{border-radius:999px 0 0 999px}.scale-bar>span:nth-last-of-type(1){border-radius:0 999px 999px 0}.marker{position:absolute;top:50%;width:3px;height:31px;transform:translate(-50%,-50%);border-radius:2px;background:#17384f;box-shadow:0 0 0 2px #fff}.marker:after{content:'';position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #17384f}.marker em{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);padding:3px 6px;border-radius:6px;background:#17384f;color:#fff;font-size:.7rem;font-style:normal;font-weight:900;white-space:nowrap}.scale-labels{position:relative;height:17px;margin-top:8px;color:var(--fc-text-muted);font-size:.67rem}.scale-labels span{position:absolute;transform:translateX(-50%)}.scale-labels span.first{transform:none}.scale-labels span.last{transform:translateX(-100%)}
.range-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:9px;margin-top:15px}.range-list article{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;min-width:0;padding:11px;border:1px solid var(--fc-border);border-radius:10px;background:#fff}.range-list article.active{border-color:var(--fc-primary);box-shadow:0 0 0 2px rgba(0,68,129,.1);background:#f8fcfe}.range-list article>div{display:flex;min-width:0;flex-direction:column}.swatch{width:8px;min-height:64px;border-radius:5px}.range-value{color:var(--fc-primary);font-size:.7rem;font-weight:900}.range-list b{margin-top:2px;color:var(--fc-primary);font-size:.78rem}.range-list small{margin-top:3px;color:var(--fc-text-muted);font-size:.68rem;line-height:1.32}.range-list em{position:absolute;right:7px;top:7px;padding:3px 6px;border-radius:999px;background:var(--fc-primary);color:#fff;font-size:.59rem;font-style:normal;font-weight:900}.interpretation footer{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-top:12px}.caution{color:var(--fc-text-muted);font-size:.7rem;line-height:1.4}.reference{flex:0 0 auto;color:var(--fc-secondary);font-size:.7rem;font-weight:800;text-decoration:underline}
@media(max-width:900px){.metric-with-scale{grid-template-columns:1fr}.interpretation{padding:20px 0 0;border-top:1px solid var(--fc-border);border-left:0}.metric-with-scale .metric-reading{align-items:flex-start}.current-reading{max-width:520px}.range-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.metric{min-height:0}.metric-with-scale{gap:18px;padding:18px}.interpretation header,.interpretation footer{align-items:stretch;flex-direction:column}.interpretation header>span{align-self:flex-start}.range-list{grid-template-columns:1fr}.scale-labels span:not(.first):not(.last){display:none}.reference{align-self:flex-start}.swatch{min-height:58px}}
@media(max-width:380px){.metric-reading{gap:10px}.metric-icon{width:40px;height:40px}.metric-with-scale{padding:15px}.range-list article{padding:10px}}
</style>
