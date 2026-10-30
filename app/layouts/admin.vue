<script setup lang="ts">
import '~/assets/css/admin.css'
const open = ref(false)
const mobileMode = useState<boolean>('fecoclima-admin-mobile-mode', () => false)
const smallScreen = ref(false)
const route = useRoute()
let mediaQuery: MediaQueryList | undefined
const updateScreen = () => { smallScreen.value = mediaQuery?.matches || false }
onMounted(() => {
  try { mobileMode.value = localStorage.getItem('fecoclima_admin_mobile_v1') === 'true' } catch { /* Optional preference. */ }
  mediaQuery = window.matchMedia('(max-width: 900px)')
  updateScreen()
  mediaQuery.addEventListener('change', updateScreen)
})
onBeforeUnmount(() => { mediaQuery?.removeEventListener('change', updateScreen) })
watch(mobileMode, value => {
  open.value = false
  try { localStorage.setItem('fecoclima_admin_mobile_v1', String(value)) } catch { /* Optional preference. */ }
})
watch(() => route.path, () => { open.value = false })
</script>
<template>
  <div class="admin-layout" :class="{ 'admin-mobile-mode': mobileMode }" @keydown.esc="open = false">
    <a class="admin-skip-link" href="#admin-main-content">Ir al contenido</a>
    <AdminToasts />
    <AdminSidebar :open="open" :mobile-mode="mobileMode || smallScreen" @close="open = false" />
    <div class="admin-main">
      <AdminHeader :mobile-mode="mobileMode" :menu-open="open" @menu="open = !open" @toggle-mobile="mobileMode = !mobileMode" />
      <main id="admin-main-content" class="admin-content"><slot /></main>
    </div>
    <button v-if="open" type="button" class="side-overlay" aria-label="Cerrar menú administrativo" @click="open = false" @keydown.esc="open = false" />
  </div>
</template>
<style scoped>
.admin-layout{min-width:0;min-height:100dvh;background:#edf4f8}.admin-main{min-width:0;margin-left:250px;min-height:100dvh}.admin-content{min-width:0;padding:30px 34px 42px;width:min(100%,1500px);margin:0 auto}.side-overlay{display:none}.admin-skip-link{position:fixed;top:10px;left:10px;z-index:100;padding:12px 18px;border-radius:12px;background:#004481;color:#fff;transform:translateY(-160%)}.admin-skip-link:focus{transform:translateY(0)}.admin-mobile-mode .admin-main{margin-left:0}.admin-mobile-mode .admin-content{max-width:780px;padding:24px 18px 42px}.admin-mobile-mode .side-overlay{display:block;position:fixed;inset:0;z-index:40;border:0;background:#0a294875;backdrop-filter:blur(3px)}
@media(max-width:900px){.admin-main{margin-left:0}.admin-content{padding:22px 16px 36px}.side-overlay{display:block;position:fixed;inset:0;z-index:40;border:0;background:#0a294875;backdrop-filter:blur(3px)}}@media(max-width:480px){.admin-content,.admin-mobile-mode .admin-content{padding:18px 12px 32px}}
</style>
