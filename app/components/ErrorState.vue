<script setup lang="ts">import { CircleAlert } from 'lucide-vue-next'; defineProps<{ message?:string }>(); defineEmits<{ retry:[] }>()</script>
<template><div class="error card"><CircleAlert/><h3>No fue posible cargar la información</h3><p>{{ message || 'Revise la conexión con el API e intente nuevamente.' }}</p><button class="btn btn-primary" @click="$emit('retry')">Reintentar</button></div></template>
<style scoped>.error{padding:32px;text-align:center}.error svg{width:45px;height:45px;color:var(--fc-danger)}h3{color:var(--fc-primary)}p{color:var(--fc-text-muted)}</style>
