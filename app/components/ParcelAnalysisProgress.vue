<script setup lang="ts">
import { Bot, Check, CloudSun, Layers3, Sparkles, Sprout } from 'lucide-vue-next'

const props = defineProps<{ stage: number; hours: string; detail?: string }>()
const steps = [
  { label: 'Sincronizar estaciones', icon: CloudSun, detail: 'Buscando las lecturas disponibles de las estaciones que cubren su parcela.' },
  { label: 'Evaluar los datos', icon: Layers3, detail: 'Revisando las condiciones del período elegido, el cultivo y las imágenes disponibles.' },
  { label: 'Consultar especialistas', icon: Bot, detail: 'Relacionando clima, etapa del cultivo y evidencia satelital.' },
  { label: 'Preparar recomendaciones', icon: Sparkles, detail: 'Organizando los resultados nuevos para su parcela.' },
]
const current = computed(() => steps[props.stage] || steps[0]!)
</script>

<template>
  <section class="analysis-progress" role="status" aria-live="polite" aria-atomic="true" aria-label="Progreso del análisis de parcela">
    <div class="progress-heading">
      <span class="analysis-orbit" aria-hidden="true"><Bot v-if="stage === 2" /><Sprout v-else /></span>
      <div><span class="progress-kicker">UNA NUEVA MIRADA A SU PARCELA</span><h2>{{ current.label }}</h2><p>{{ detail || current.detail }}</p></div>
      <span class="progress-period">{{ hours }} h observadas <span>Próximos 3 días de pronóstico</span></span>
    </div>
    <ol class="analysis-stages" aria-label="Etapas de la consulta">
      <li v-for="(step, index) in steps" :key="step.label" :class="{done:index < stage, current:index === stage}" :aria-current="index === stage ? 'step' : undefined">
        <span class="stage-icon"><Check v-if="index < stage" /><component :is="step.icon" v-else /></span><span>{{ step.label }}</span>
      </li>
    </ol>
    <div class="preview-skeletons" aria-hidden="true"><div v-for="index in 3" :key="index"><i /><i /><i /></div></div>
    <small>Los resultados anteriores se limpiaron. Las imágenes pendientes pueden incorporarse después; no es necesario volver a dibujar.</small>
  </section>
</template>

<style scoped>
.analysis-progress{padding:25px;border:1px solid #c9dfed;border-radius:22px;margin:20px 0;background:linear-gradient(120deg,#f7fcff,#edf5fb);box-shadow:0 9px 28px #0044810a;color:var(--fc-text)}
.progress-heading{display:flex;align-items:center;gap:18px}.progress-heading>div{flex:1}.progress-kicker{font-size:.65rem;font-weight:800;letter-spacing:.09em;color:#397eaa}.progress-heading h2{margin:5px 0;font-size:1.2rem;color:var(--fc-primary)}.progress-heading p{margin:0;font-size:.84rem;color:var(--fc-text-muted);line-height:1.5}.analysis-orbit{position:relative;display:grid;place-items:center;flex:0 0 62px;height:62px;border-radius:50%;background:#e0f0fa;color:var(--fc-primary)}.analysis-orbit::after{content:'';position:absolute;inset:-5px;border:2px solid transparent;border-top-color:#388cc0;border-right-color:#b5d7eb;border-radius:50%;animation:orbit 1.8s linear infinite}.analysis-orbit svg{width:28px;height:28px}.progress-period{font-size:.8rem;font-weight:750;color:var(--fc-primary);text-align:right}.progress-period span{display:block;font-size:.7rem;font-weight:500;color:var(--fc-text-muted);margin-top:4px}.analysis-stages{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:0;margin:26px 0;list-style:none}.analysis-stages li{display:flex;align-items:center;gap:9px;font-size:.76rem;color:#738a9a;line-height:1.4}.stage-icon{display:grid;place-items:center;flex:0 0 34px;height:34px;border:1px solid #d4e2eb;border-radius:11px;background:#fff}.stage-icon svg{width:17px;height:17px}.analysis-stages .current{color:var(--fc-primary);font-weight:800}.current .stage-icon{background:var(--fc-primary);border-color:var(--fc-primary);color:#fff}.done{color:#2d7b63!important}.done .stage-icon{background:#e2f3ea;border-color:#c6e4d7}.preview-skeletons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:15px}.preview-skeletons>div{display:grid;gap:9px;padding:16px;background:#ffffffa3;border:1px solid #dbe8f1;border-radius:13px}.preview-skeletons i{height:8px;border-radius:5px;background:linear-gradient(90deg,#e5edf3,#f7fafc,#e5edf3);background-size:200% 100%;animation:shimmer 2s ease-in-out infinite}.preview-skeletons i:first-child{width:45%;height:11px}.preview-skeletons i:last-child{width:70%}.analysis-progress>small{font-size:.73rem;color:var(--fc-text-muted)}@keyframes orbit{to{transform:rotate(360deg)}}@keyframes shimmer{to{background-position:-200% 0}}@media(max-width:700px){.analysis-progress{padding:20px 16px}.progress-heading{flex-wrap:wrap;gap:14px}.progress-heading>div{min-width:180px}.progress-period{text-align:left;margin-left:76px}.analysis-stages{grid-template-columns:1fr 1fr;gap:16px 10px}.preview-skeletons{grid-template-columns:1fr}.preview-skeletons>div:not(:first-child){display:none}}@media(prefers-reduced-motion:reduce){.analysis-orbit::after,.preview-skeletons i{animation:none}}
</style>
