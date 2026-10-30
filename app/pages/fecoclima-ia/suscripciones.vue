<script setup lang="ts">
import { BellRing, CheckCircle2, Mail, ShieldCheck, XCircle } from 'lucide-vue-next'
useSeoMeta({ title: 'Suscribirse a alertas · FECOCLIMA IA' })
const {request}=useApi()
const parcelApi=usePublicParcelApi()
const parcels=ref<any[]>([]), selectedPlots=ref<string[]>([])
const route=useRoute()
const loading=ref(false), message=ref(''), error=ref('')
const email=ref(''), consent=ref(false), website=ref(''), telegramUsername=ref(''), emailEnabled=ref(true), telegramEnabled=ref(false)
const confirmation=ref(''), cancellation=ref(''), telegramLink=ref('')
const token= computed(() => String(route.query.confirmar || ''))
const unsubscribe= computed(() => String(route.query.baja || ''))
const preview=ref<any>(null)
onMounted(async () => {
  if(!token.value&&!unsubscribe.value){try{const r:any=await parcelApi.request('/notifications/subscriptions/parcel-options');parcels.value=r.items||[];const chosen=String(route.query.parcela||'');if(parcels.value.some(p=>p.id===chosen))selectedPlots.value=[chosen]}catch{parcels.value=[]}}
  if (unsubscribe.value) {
    try { preview.value=await request('/notifications/subscriptions/manage',{query:{token:unsubscribe.value}}) }
    catch(e:any) { error.value=e?.data?.detail || 'Enlace no válido.' }
  }
})
async function submit(){
  loading.value=true;error.value='';message.value=''
  try{const r:any=await parcelApi.request('/notifications/subscriptions/request',{method:'POST',body:{email:email.value,plot_ids:selectedPlots.value,telegram_username:telegramUsername.value||null,email_enabled:emailEnabled.value,telegram_enabled:telegramEnabled.value,consent:consent.value,website:website.value}});message.value=r.message;email.value='';consent.value=false}
  catch(e:any){error.value=e?.data?.detail || 'No se pudo completar la solicitud.'}
  finally{loading.value=false}
}
async function confirm(){loading.value=true;error.value='';try{const r:any=await request('/notifications/subscriptions/confirm',{method:'POST',body:{token:token.value}});confirmation.value=r.message;telegramLink.value=r.telegram_url||''}catch(e:any){error.value=e?.data?.detail||'No fue posible validar el enlace.'}finally{loading.value=false}}
async function cancel(){loading.value=true;error.value='';try{const r:any=await request('/notifications/subscriptions/unsubscribe',{method:'POST',body:{token:unsubscribe.value}});cancellation.value=r.message;preview.value=null}catch(e:any){error.value=e?.data?.detail||'No fue posible procesar la baja.'}finally{loading.value=false}}
</script>
<template>
  <main class="page"><div class="container subscribe-wrap">
    <div class="subscription-head"><div class="subscription-icon"><BellRing :size="27"/></div><div><span class="eyebrow">FECOCLIMA IA · Avisos a productores</span><h1 class="page-title">Suscríbase a avisos y alertas</h1><p class="page-subtitle">Inscríbase en la libreta de direcciones y elija si desea recibir información por correo, Telegram o ambos.</p></div></div>
    <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p>
    <div v-if="token" class="card card-body subscription-card"><ShieldCheck :size="32"/><h2>Confirme su correo</h2><p>La confirmación evita que otras personas lo inscriban sin su autorización.</p><p v-if="confirmation" class="notice badge-success">{{confirmation}}</p><a v-if="telegramLink" :href="telegramLink" target="_blank" rel="noopener noreferrer" class="btn btn-light">Vincular mi Telegram · abrir y pulsar Iniciar</a><button v-if="!confirmation" class="btn btn-primary" :disabled="loading" @click="confirm">Confirmar mi suscripción</button></div>
    <div v-else-if="unsubscribe" class="card card-body subscription-card"><XCircle :size="32"/><h2>Cancelar notificaciones</h2><p v-if="preview">¿Desea dar de baja <b>{{preview.email}}</b> de avisos y alertas de FECOCLIMA IA?</p><p v-if="cancellation" class="notice badge-success">{{cancellation}}</p><button v-else class="btn btn-danger" :disabled="loading || !preview" @click="cancel">Confirmar baja</button></div>
    <div v-else class="grid grid-2 subscribe-columns">
      <form class="card card-body subscription-card" @submit.prevent="submit"><h2><Mail :size="23"/> Crear suscripción</h2><p v-if="message" class="notice badge-success" role="status">{{message}}</p>
        <label class="label" for="sub-email">Correo electrónico</label><input id="sub-email" v-model="email" class="input" type="email" maxlength="255" autocomplete="email" placeholder="correo@ejemplo.com" required>
        <label class="label" for="sub-telegram">Usuario de Telegram (opcional)</label><input id="sub-telegram" v-model="telegramUsername" class="input" maxlength="33" pattern="@?[A-Za-z][A-Za-z0-9_]{4,31}" autocomplete="off" placeholder="@usuario">
        <fieldset class="channels parcels"><legend>Parcelas para vincular</legend><label v-for="parcel in parcels" :key="parcel.id"><input v-model="selectedPlots" type="checkbox" :value="parcel.id">{{parcel.name}}</label><p v-if="!parcels.length" class="small muted">No hay parcelas guardadas en este navegador. <NuxtLink to="/fecoclima-ia">Cree su parcela</NuxtLink> o solicite al administrador que la vincule después de confirmar su correo.</p></fieldset><p class="small muted">Solo recibirá alertas de estaciones cuya área cubra sus parcelas vinculadas. Puede inscribirse ahora y vincularlas después.</p>
<fieldset class="channels"><legend>¿Por dónde desea recibir los avisos?</legend><label><input id="sub-channel-email" v-model="emailEnabled" type="checkbox"> Correo electrónico</label><label><input id="sub-channel-telegram" v-model="telegramEnabled" type="checkbox"> Telegram</label></fieldset>
        <p v-if="telegramEnabled" class="notice small">Después de confirmar su correo, abra el enlace de Telegram y pulse Iniciar para vincular su cuenta. Escribir el usuario por sí solo no activa los envíos.</p>
        <div class="hidden-hp" aria-hidden="true"><label>Website <input v-model="website" tabindex="-1" autocomplete="off"></label></div>
        <label class="consent"><input v-model="consent" type="checkbox" required><span>Autorizo a FECOCLIMA IA a guardar y utilizar mi correo y mi usuario de Telegram para inscribirme en la libreta de direcciones y vincular las parcelas seleccionadas y enviarme avisos, alertas e informaciones por los canales que seleccioné. Puedo retirar mi consentimiento y darme de baja desde cualquier mensaje.</span></label>
        <button class="btn btn-primary" type="submit" :disabled="loading || !consent || (!emailEnabled && !telegramEnabled)">{{loading?'Enviando…':'Enviar confirmación a mi correo'}}</button>
      </form>
      <article class="card card-body explanation"><ShieldCheck :size="30"/><h2>Suscripción segura y gratuita</h2><div class="feature"><CheckCircle2/><p><b>Confirma tu dirección</b><span>Primero recibirás un correo para verificar que eres el propietario.</span></p></div><div class="feature"><CheckCircle2/><p><b>Avisos útiles, no mensajes constantes</b><span>Se avisará cuando una condición configurada se verifique con datos reales.</span></p></div><div class="feature"><CheckCircle2/><p><b>Control de tus datos</b><span>La baja estará disponible en cada notificación. No necesitas crear una cuenta.</span></p></div><p class="notice small">Cada aviso identifica la estación donde se observaron las condiciones. Comprueba si corresponde a tu zona antes de tomar decisiones.</p></article>
    </div>
  </div></main>
</template>
<style scoped>
.channels{display:flex;flex-wrap:wrap;gap:16px;border:1px solid var(--fc-border);border-radius:10px;padding:15px}.channels legend{font-weight:650;padding:0 5px}.channels label{display:flex;gap:7px;align-items:center}.channels input{width:18px;height:18px}.subscribe-wrap{max-width:1130px}.subscription-head{display:flex;gap:20px;align-items:flex-start;margin:10px 0 30px}.subscription-icon{width:60px;height:60px;flex:0 0 60px;border-radius:20px;background:var(--fc-primary);color:white;display:grid;place-items:center}.eyebrow{display:block;font-size:.72rem;letter-spacing:.14em;font-weight:800;color:var(--fc-secondary);text-transform:uppercase;margin-bottom:10px}.subscribe-columns{align-items:start}.subscription-card{padding:28px;display:flex;flex-direction:column;gap:12px}.subscription-card h2,.explanation h2{font-size:1.36rem;color:var(--fc-primary);display:flex;align-items:center;gap:10px;margin:0 0 14px}.subscription-card .label{margin-top:8px;margin-bottom:0}.subscription-card .map-button{justify-self:start;width:fit-content}.consent{display:flex;align-items:flex-start;gap:10px;line-height:1.5;font-size:.9rem;margin:8px 0}.consent input{width:20px;height:20px;flex:none;margin-top:3px}.explanation{padding:30px}.explanation>svg{color:var(--fc-success)}.feature{display:flex;gap:14px;align-items:flex-start;margin:20px 0}.feature>svg{color:var(--fc-success);width:24px;flex:none}.feature p{margin:0}.feature b,.feature span{display:block}.feature span{font-size:.9rem;color:var(--fc-text-muted);margin-top:4px}.hidden-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}@media(max-width:650px){.subscription-head{gap:12px}.subscription-icon{width:43px;height:43px;flex-basis:43px;border-radius:13px}.subscription-card,.explanation{padding:18px}}
</style>
