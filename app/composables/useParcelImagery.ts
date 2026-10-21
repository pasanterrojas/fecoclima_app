import type { Geometry, ParcelAnalysis } from '~/types/plots'

type Scene = NonNullable<ParcelAnalysis['context']['satellite']>
export interface ParcelImageryPreview { id:string; status:string; satellite:Scene|null; history:Scene[]; message:string; area_ha:number; radar?:{captured_at:string;vv_mean:number;vh_mean:number}|null }
/** Drawing starts satellite work independently of coverage, crop and AI. */
export function useParcelImagery(geometry:Ref<Geometry|null>, enabled:Ref<boolean>) {
  const {request}=usePublicParcelApi()
  const state=ref<ParcelImageryPreview|null>(null), selected=ref(''), loading=ref(false), error=ref('')
  const pollingPaused=ref(false)
  const scene=computed(()=>state.value?.history?.find(item=>item.id===selected.value) || state.value?.satellite || null)
  let generation=0, timer:ReturnType<typeof setTimeout>|undefined, poll:ReturnType<typeof setTimeout>|undefined
  async function load(){
    if(!geometry.value || !enabled.value)return
    const ticket=++generation
    loading.value=true;error.value='';pollingPaused.value=false
    if(poll)clearTimeout(poll)
    try{
      const result=await request<ParcelImageryPreview>('/public/parcel-imagery',{method:'POST',body:{geojson:geometry.value}})
      if(ticket!==generation)return
      state.value=result
      selected.value=result.satellite?.id || ''
      if(result.status==='PROCESSING' && result.id) schedule(result.id,ticket,0)
    }catch(exception:any){if(ticket===generation)error.value=exception?.response?.status===404
        ? 'El servidor API activo no reconoce la vista de imágenes. Verifique que esté ejecutando la última versión del backend y la ruta /api/v1/public/parcel-imagery.'
        : exception?.response?.status===0
          ? 'No se pudo conectar al backend. Revise su dirección y los permisos de acceso (CORS).'
          : exception?.data?.detail || 'No se pudo iniciar la consulta satelital. Puede volver a intentar.'}
    finally{if(ticket===generation)loading.value=false}
  }
  function schedule(id:string,ticket:number,attempt:number){
    if(ticket!==generation)return
    if(attempt>=120){pollingPaused.value=true;if(error.value)error.value='No se pudo confirmar el estado de las imágenes. Pulse Actualizar imágenes para volver a consultar.';return}
    poll=setTimeout(async()=>{
      try{
        const result=await request<ParcelImageryPreview>(`/public/parcel-imagery/${id}`)
        if(ticket!==generation)return
        state.value=result
        error.value=''
        if(!selected.value)selected.value=result.satellite?.id || ''
        if(result.status==='PROCESSING')schedule(id,ticket,attempt+1)
      }catch{if(ticket===generation){error.value='No se pudo comprobar el estado de las imágenes. Reintentaremos automáticamente.';schedule(id,ticket,attempt+1)}}
    },attempt<40?3000:15000)
  }
  function stop(clearState = false) {
    generation++
    pollingPaused.value=false
    if (timer) clearTimeout(timer)
    if (poll) clearTimeout(poll)
    loading.value = false
    if (clearState) { state.value = null; selected.value = ""; error.value = "" }
  }
  watch([geometry, enabled],()=>{
    generation++;state.value=null;selected.value='';error.value='';pollingPaused.value=false
    // Include the debounce in the visible loading state after finishing a polygon.
    loading.value=!!geometry.value && enabled.value
    if(timer)clearTimeout(timer)
    if(poll)clearTimeout(poll)
    if(geometry.value && enabled.value)timer=setTimeout(()=>void load(),800)
  },{deep:true})
  onBeforeUnmount(()=>{generation++;if(timer)clearTimeout(timer);if(poll)clearTimeout(poll)})
  return {state,scene,selected,loading,error,pollingPaused,load,stop}
}
