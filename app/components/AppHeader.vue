<script setup lang="ts">
import { Menu, X } from 'lucide-vue-next'
const open = ref(false)
</script>
<template>
  <header class="app-header">
    <div class="brand-strip"><div class="container brand-row"><NuxtLink to="/fecoclima-ia" class="brand"><span class="brand-mark">✦</span>FECOCLIMA <b>IA</b></NuxtLink><button class="mobile-toggle" aria-label="Abrir navegación" @click="open = !open"><X v-if="open"/><Menu v-else/></button></div></div>
    <PublicNavigation :open="open" @navigate="open = false" />
  </header>
</template>
<style scoped>
.brand-strip{background:var(--fc-secondary);border-top:8px solid #0b5f56}.brand-row{height:46px;display:flex;align-items:center;justify-content:space-between}.brand{display:inline-flex;align-items:center;color:#fff;font-weight:900;font-size:1.25rem;letter-spacing:-.02em}.brand b{margin-left:5px;color:#dff4ff}.brand-mark{margin-right:4px}.mobile-toggle{display:none;color:#fff;background:transparent;border:0}.mobile-toggle svg{width:27px;height:27px}@media(max-width:820px){.mobile-toggle{display:inline-flex}}
</style>
