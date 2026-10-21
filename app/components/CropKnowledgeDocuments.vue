<script setup lang="ts">
import { BookOpen, FileText, RefreshCw, UploadCloud } from 'lucide-vue-next'
interface CropDocument { id:string; title:string; filename?:string; index_status:string; index_error?:string; chunks_count?:number }
const props = defineProps<{ cropId?: string }>()
const { request } = useApi()
const documents = ref<CropDocument[]>([])
const pending = ref<File[]>([])
const busy = ref(false), error = ref(''), notice = ref('')
const removing = ref<CropDocument>()
const indexedCount = computed(() => documents.value.filter(document => document.index_status === 'INDEXED').length)
async function load() {
  if (!props.cropId) return
  try { documents.value = (await request<{items:CropDocument[]}>('/knowledge/documents',{query:{crop_id:props.cropId,limit:250}})).items }
  catch { error.value = 'No se pudieron consultar los documentos.' }
}
async function uploadPending(crop: {id:string}) {
  busy.value = true; error.value = ''
  try {
    while (pending.value.length) {
      const file = pending.value[0]!
      const body = new FormData()
      body.append('file', file); body.append('crop_id',crop.id); body.append('title',file.name.replace(/\.[^.]+$/,''))
      await request('/knowledge/upload',{method:'POST',body})
      pending.value = pending.value.slice(1)
    }
    notice.value = 'Documentos guardados y sincronizados con los agentes. La indexación continúa en segundo plano.'
    if (props.cropId) await load()
  } catch (exception:any) { error.value = exception?.data?.detail || 'No se pudo subir el documento.'; throw exception }
  finally { busy.value = false }
}
async function upload() { if(props.cropId) { try { await uploadPending({id:props.cropId}) } catch { /* inline error */ } } }
async function sync() {
  busy.value = true; error.value = ''; notice.value = ''
  try { await request(`/knowledge/crops/${props.cropId}/sync`,{method:'POST'});await load();notice.value='Base de conocimiento sincronizada con los agentes del cultivo.' }
  catch { error.value='No se pudo sincronizar.' } finally {busy.value=false}
}
async function reindex(document:CropDocument) {
  busy.value = true; error.value = ''
  try {await request(`/knowledge/documents/${document.id}/reindex`,{method:'POST'});await load()}
  catch {error.value='No se pudo solicitar la indexación.'}
  finally {busy.value=false}
}
async function remove() {
  if(!removing.value)return
  busy.value=true; error.value=''
  try {await request(`/knowledge/documents/${removing.value.id}`,{method:'DELETE'});removing.value=undefined;await load()}
  catch {error.value='No se pudo eliminar el documento.'}
  finally {busy.value=false}
}
defineExpose({uploadPending})
watch(()=>props.cropId,load,{immediate:true})
</script>
<template>
  <section class="crop-documents" :aria-busy="busy">
    <div class="row-between"><div class="knowledge-heading"><span class="knowledge-icon"><BookOpen /></span><div><span class="knowledge-eyebrow">3. CONOCIMIENTO COMPARTIDO</span><h2 class="section-title">Documentos técnicos del cultivo</h2></div></div><button v-if="cropId" class="btn btn-light" type="button" :disabled="busy" @click="sync"><RefreshCw />Sincronizar agentes</button></div>
    <p class="form-help knowledge-intro">Suba los manuales una sola vez. Todos los agentes asociados a este cultivo los reciben como base de conocimiento.</p>
    <p v-if="error" class="notice notice-danger" role="alert">{{ error }}</p><p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
    <label class="document-upload"><UploadCloud /><span class="upload-description"><span class="label">Agregar documentos</span><small>PDF, Word (.docx), TXT o Markdown</small><input type="file" multiple :disabled="busy" accept=".pdf,.docx,.txt,.md" @change="pending=Array.from(($event.target as HTMLInputElement).files || [])" /></span></label>
    <div v-if="pending.length" class="pending-files"><span v-for="file in pending" :key="`${file.name}-${file.lastModified}`"><FileText />{{ file.name }}</span><small v-if="!cropId">Se subirán al guardar el cultivo.</small></div>
    <button v-if="cropId && pending.length" type="button" class="btn btn-primary" :disabled="busy" @click="upload">{{ busy ? 'Subiendo…' : 'Subir documentos' }}</button>
    <p v-if="documents.length" class="knowledge-count"><span>{{ documents.length }} {{ documents.length === 1 ? 'documento' : 'documentos' }}</span><span>{{ indexedCount }} listos para consultar</span></p>
    <div v-if="documents.length" class="table-wrap"><table><thead><tr><th>Documento</th><th>Estado</th><th>Acciones</th></tr></thead><tbody><tr v-for="document in documents" :key="document.id"><td><span class="document-title"><FileText />{{ document.title }}</span><small v-if="document.index_error" class="form-help">{{ document.index_error }}</small></td><td><span class="badge" :class="document.index_status==='INDEXED' ? 'badge-success' : document.index_status==='FAILED' ? 'badge-danger' : 'badge-info'">{{ ({INDEXED:'Listo para consultar',PENDING:'En cola',PROCESSING:'Procesando',FAILED:'Revisar archivo'} as Record<string,string>)[document.index_status] || document.index_status }}</span><small class="form-help">{{ document.chunks_count || 0 }} fragmentos</small></td><td><div class="row"><button type="button" class="btn btn-light" :disabled="busy" @click="reindex(document)">Reindexar</button><button type="button" class="btn btn-danger" :disabled="busy" @click="removing=document">Eliminar</button></div></td></tr></tbody></table></div>
    <div v-else class="knowledge-empty"><FileText /><div><b>Su biblioteca empieza aquí</b><p>Agregue el primer manual para respaldar las respuestas de los agentes.</p></div></div>
    <ConfirmationModal :open="!!removing" title="Eliminar documento" message="Este documento dejará de utilizarse como evidencia en todos los agentes del cultivo." @confirm="remove" @cancel="removing=undefined" />
  </section>
</template>
<style scoped>
.crop-documents{display:grid;gap:17px}.crop-documents h2{margin:0}.knowledge-heading{display:flex;align-items:center;gap:12px}.knowledge-icon{width:43px;height:43px;flex:0 0 43px;display:grid;place-items:center;border-radius:14px;background:#e5f2fb;color:#176ba0}.knowledge-icon svg{width:22px;height:22px}.knowledge-eyebrow{display:block;margin-bottom:4px;color:#7295ae;font-size:.57rem;font-weight:800;letter-spacing:.11em}.knowledge-intro{margin:0;max-width:700px}.document-upload{display:flex;align-items:flex-start;gap:15px;padding:21px;border:1px dashed #a5c6de;border-radius:16px;background:#f4f9fd;cursor:pointer}.document-upload>svg{width:29px;height:29px;flex:0 0 29px;margin-top:3px;color:#4e8cb6}.upload-description{min-width:0;width:100%}.document-upload .label{margin:0 0 4px}.document-upload small{color:#6e91a9;font-size:.75rem}.document-upload input{display:block;width:100%;max-width:100%;margin-top:14px;color:#63829b;font-size:.75rem}.document-upload input::file-selector-button{margin-right:10px;padding:9px 13px;border:1px solid #c5dceb;border-radius:9px;background:#fff;color:#1a628f;font-weight:700;cursor:pointer}.crop-documents td small{display:block;margin-top:5px}.row{flex-wrap:wrap;gap:8px}.row .btn{padding:8px 11px;min-height:36px;font-size:.72rem}.pending-files{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pending-files>span{display:flex;align-items:center;gap:7px;max-width:100%;overflow-wrap:anywhere;padding:8px 10px;border-radius:9px;background:#eef6fc;color:#33759f;font-size:.75rem}.pending-files svg,.document-title svg{width:16px;height:16px;flex:0 0 16px}.pending-files>small{width:100%;font-size:.74rem;color:#69869b}.knowledge-count{display:flex;justify-content:space-between;gap:10px;margin:3px 0 -7px;color:#698aa1;font-size:.75rem}.knowledge-count>span:first-child{font-weight:750;color:#396986}.document-title{display:flex;align-items:center;gap:8px;color:#2a6286;font-weight:700}.knowledge-empty{display:flex;align-items:center;gap:12px;padding:18px;border-radius:13px;background:#f8fbfd;color:#7d98ad}.knowledge-empty>svg{width:25px;height:25px;flex:0 0 25px}.knowledge-empty b{color:#567d98;font-size:.79rem}.knowledge-empty p{margin:4px 0 0;font-size:.76rem;line-height:1.6}@media(max-width:600px){.document-upload{padding:17px;gap:10px}.document-upload>svg{width:22px;height:22px;flex-basis:22px}.knowledge-count{font-size:.7rem}}
</style>
