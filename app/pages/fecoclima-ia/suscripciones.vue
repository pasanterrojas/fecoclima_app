<script setup lang="ts">
import { BellRing, CheckCircle2, Mail, MapPin, ShieldCheck, XCircle } from 'lucide-vue-next'
useSeoMeta({ title: 'Suscribirse a alertas · FECOCLIMA IA' })
const {request}=useApi()
const route=useRoute()
const loading=ref(false), message=ref(''), error=ref(''), options=ref<any>({crops:[],stations:[]})
const email=ref(''), crop=ref(''), station=ref(''), consent=ref(false), website=ref('')
const confirmation=ref(''), cancellation=ref(''), telegramLink=ref('')
const token= computed(() => String(route.query.confirmar || ''))
const unsubscribe= computed(() => String(route.query.baja || ''))
const preview=ref<any>(null)
const geoState=ref('')

onMounted(async () => {
  try {
    options.value=await request('/notifications/subscriptions/options')
    crop.value=options.value.crops?.[0]?.id || ''
    station.value=options.value.stations?.[0]?.id || ''
    if (unsubscribe.value) preview.value=await request('/notifications/subscriptions/manage',{query:{token:unsubscribe.value}})
  } catch (e:any) { error.value=e?.data?.detail || 'No pudimos cargar la información. Intente de nuevo.' }
})
function locate() {
  if (!navigator.geolocation) { geoState.value='El dispositivo no permite acceder a la ubicación.';return }
  geoState.value='Buscando estación cercana…'
  navigator.geolocation.getCurrentPosition((pos)=>{
    const latitude=pos.coords.latitude*Math.PI/180, longitude=pos.coords.longitude*Math.PI/180
    const stations=(options.value.stations || []).filter((s:any)=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))&&s.latitude!=null&&s.longitude!=null)
    if (!stations.length) { geoState.value='No hay estaciones con coordenadas disponibles.';return }
    const dist=(s:any)=>{const lat=Number(s.latitude)*Math.PI/180, lon=Number(s.longitude)*Math.PI/180;return Math.acos(Math.min(1,Math.max(-1,Math.sin(latitude)*Math.sin(lat)+Math.cos(latitude)*Math.cos(lat)*Math.cos(longitude-lon))))}
    stations.sort((a:any,b:any)=>dist(a)-dist(b))
    station.value=stations[0].id
    geoState.value=`Estación más cercana: ${stations[0].name}. Verifique si corresponde a su área de influencia.`
  },()=>{geoState.value='No se pudo obtener su ubicación; puede seleccionar la estación manualmente.'},{timeout:12000})
}
async function submit(){
  loading.value=true;error.value='';message.value=''
  try{const r:any=await request('/notifications/subscriptions/request',{method:'POST',body:{email:email.value,crop_id:crop.value,station_id:station.value,consent:consent.value,website:website.value}});message.value=r.message;email.value='';consent.value=false}
  catch(e:any){error.value=e?.data?.detail || 'No se pudo completar la solicitud.'}
  finally{loading.value=false}
}
async function confirm(){loading.value=true;error.value='';try{const r:any=await request('/notifications/subscriptions/confirm',{method:'POST',body:{token:token.value}});confirmation.value=r.message;telegramLink.value=r.telegram_url||''}catch(e:any){error.value=e?.data?.detail||'No fue posible validar el enlace.'}finally{loading.value=false}}
async function cancel(){loading.value=true;error.value='';try{const r:any=await request('/notifications/subscriptions/unsubscribe',{method:'POST',body:{token:unsubscribe.value}});cancellation.value=r.message;preview.value=null}catch(e:any){error.value=e?.data?.detail||'No fue posible procesar la baja.'}finally{loading.value=false}}
</script>
<template>
  <main class="page"><div class="container subscribe-wrap">
    <div class="subscription-head"><div class="subscription-icon"><BellRing :size="27"/></div><div><span class="eyebrow">FECOCLIMA IA · Avisos a productores</span><h1 class="page-title">Suscríbase a las alertas de su cultivo</h1><p class="page-subtitle">Reciba un correo cuando las estaciones meteorológicas detecten condiciones que requieren atención. Usted decide qué cultivo y estación seguir.</p></div></div>
    <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
    <div v-if="token" class="card card-body subscription-card"><ShieldCheck :size="32"/><h2>Confirme su correo</h2><p>La confirmación evita que otras personas lo inscriban sin su autorización.</p><p v-if="confirmation" class="notice badge-success">{{confirmation}}</p><a v-if="telegramLink" :href="telegramLink" target="_blank" rel="noopener noreferrer" class="btn btn-light">Vincular también mi Telegram (opcional)</a><button v-else class="btn btn-primary" :disabled="loading" @click="confirm">Confirmar mi suscripción</button></div>
    <div v-else-if="unsubscribe" class="card card-body subscription-card"><XCircle :size="32"/><h2>Cancelar notificaciones</h2><p v-if="preview">¿Desea dar de baja <b>{{preview.email}}</b> para <b>{{preview.crop}}</b>, estación <b>{{preview.station}}</b>?</p><p v-if="cancellation" class="notice badge-success">{{cancellation}}</p><button v-else class="btn btn-danger" :disabled="loading || !preview" @click="cancel">Confirmar baja</button></div>
    <div v-else class="grid grid-2 subscribe-columns">
      <form class="card card-body subscription-card" @submit.prevent="submit"><h2><Mail :size="23"/> Crear suscripción</h2><p v-if="message" class="notice badge-success" role="status">{{message}}</p>
        <label class="label" for="sub-email">Correo electrónico</label><input id="sub-email" v-model="email" class="input" type="email" maxlength="255" autocomplete="email" placeholder="correo@ejemplo.com" required>
        <label class="label" for="sub-crop">Cultivo de interés</label><select id="sub-crop" v-model="crop" class="select" required><option disabled value="">Seleccione un cultivo</option><option v-for="item in options.crops" :key="item.id" :value="item.id">{{item.name}}</option></select>
        <label class="label" for="sub-station">Estación meteorológica</label><select id="sub-station" v-model="station" class="select" required><option disabled value="">Seleccione una estación</option><option v-for="item in options.stations" :key="item.id" :value="item.id">{{item.name}}{{item.locality ? ' · '+item.locality:''}}</option></select>
        <button type="button" class="btn btn-light map-button" @click="locate"><MapPin :size="17"/> Sugerir estación más cercana</button><p v-if="geoState" class="small muted">{{geoState}}</p>
        <div class="hidden-hp" aria-hidden="true"><label>Website <input v-model="website" tabindex="-1" autocomplete="off"></label></div>
        <label class="consent"><input v-model="consent" type="checkbox" required><span>Autorizo recibir por correo alertas de FECOCLIMA IA para el cultivo y la estación seleccionados. Podré darme de baja desde cualquier mensaje.</span></label>
        <button class="btn btn-primary" type="submit" :disabled="loading || !crop || !station || !consent">{{loading?'Enviando…':'Enviar confirmación a mi correo'}}</button>
      </form>
      <article class="card card-body explanation"><ShieldCheck :size="30"/><h2>Suscripción segura y gratuita</h2><div class="feature"><CheckCircle2/><p><b>Confirma tu dirección</b><span>Primero recibirás un correo para verificar que eres el propietario.</span></p></div><div class="feature"><CheckCircle2/><p><b>Avisos útiles, no mensajes constantes</b><span>Se avisará cuando una condición configurada se verifique con datos reales.</span></p></div><div class="feature"><CheckCircle2/><p><b>Control de tus datos</b><span>La baja estará disponible en cada notificación. No necesitas crear una cuenta.</span></p></div><p class="notice notice-warning small">La estación más cercana no siempre cubre tu parcela. Comprueba su área de influencia en el mapa de FECOCLIMA IA.</p></article>
    </div>
  </div></main>
</template>
<style scoped>
.subscribe-wrap{max-width:1130px}.subscription-head{display:flex;gap:20px;align-items:flex-start;margin:10px 0 30px}.subscription-icon{width:60px;height:60px;flex:0 0 60px;border-radius:20px;background:var(--fc-primary);color:white;display:grid;place-items:center}.eyebrow{display:block;font-size:.72rem;letter-spacing:.14em;font-weight:800;color:var(--fc-secondary);text-transform:uppercase;margin-bottom:10px}.subscribe-columns{align-items:start}.subscription-card{padding:28px;display:flex;flex-direction:column;gap:12px}.subscription-card h2,.explanation h2{font-size:1.36rem;color:var(--fc-primary);display:flex;align-items:center;gap:10px;margin:0 0 14px}.subscription-card .label{margin-top:8px;margin-bottom:0}.subscription-card .map-button{justify-self:start;width:fit-content}.consent{display:flex;align-items:flex-start;gap:10px;line-height:1.5;font-size:.9rem;margin:8px 0}.consent input{width:20px;height:20px;flex:none;margin-top:3px}.explanation{padding:30px}.explanation>svg{color:var(--fc-success)}.feature{display:flex;gap:14px;align-items:flex-start;margin:20px 0}.feature>svg{color:var(--fc-success);width:24px;flex:none}.feature p{margin:0}.feature b,.feature span{display:block}.feature span{font-size:.9rem;color:var(--fc-text-muted);margin-top:4px}.hidden-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}@media(max-width:650px){.subscription-head{gap:12px}.subscription-icon{width:43px;height:43px;flex-basis:43px;border-radius:13px}.subscription-card,.explanation{padding:18px}}
</style>
