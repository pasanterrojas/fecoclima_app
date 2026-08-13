<script setup lang="ts">
import { Menu, X } from 'lucide-vue-next'
const open = ref(false)
</script>
<template>
  <header class="app-header">
    <div class="brand-strip"><div class="container brand-row"><NuxtLink to="/fecoclima-ia" class="brand"><span class="brand-mark">✦</span>FECOCLIMA <b>IA</b></NuxtLink><button class="mobile-toggle" :aria-label="open ? 'Cerrar navegación' : 'Abrir navegación'" :aria-expanded="open" aria-controls="public-navigation" @click="open = !open"><X v-if="open"/><Menu v-else/></button></div></div>
    <PublicNavigation :open="open" @navigate="open = false" />
  </header>
</template>
<style scoped>
.brand-strip{background:var(--fc-secondary);border-top:8px solid #0b5f56}.brand-row{height:50px;display:flex;align-items:center;justify-content:space-between}.brand{display:inline-flex;align-items:center;color:#fff;font-weight:900;font-size:1.25rem;letter-spacing:-.02em}.brand b{margin-left:5px;color:#dff4ff}.brand-mark{margin-right:4px}.mobile-toggle{display:none;align-items:center;justify-content:center;width:46px;height:46px;color:#fff;background:transparent;border:0;border-radius:10px}.mobile-toggle svg{width:27px;height:27px}@media(max-width:820px){.app-header{position:sticky;top:0;z-index:90;box-shadow:0 5px 18px rgba(0,68,129,.16)}.mobile-toggle{display:inline-flex}.brand-strip{border-top-width:5px}.brand-row{height:54px}}
</style>
