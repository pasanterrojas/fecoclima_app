<script setup lang="ts">import { Inbox } from 'lucide-vue-next'; defineProps<{ title?:string; message?:string }>()</script>
<template><div class="empty"><Inbox/><h3>{{ title || 'Sin información' }}</h3><p>{{ message || 'No hay datos para los filtros seleccionados.' }}</p><slot/></div></template>
<style scoped>.empty{padding:42px 20px;text-align:center;color:var(--fc-text-muted)}svg{width:44px;height:44px;color:var(--fc-secondary)}h3{color:var(--fc-primary);margin:12px 0 6px}p{margin:0}</style>
