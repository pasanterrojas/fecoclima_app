<script setup lang="ts">defineProps<{ title:string; description?:string }>()</script>
<template><div class="admin-page-head"><div><h1>{{title}}</h1><p v-if="description">{{description}}</p></div><slot/></div></template>
<style scoped>.admin-page-head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}.admin-page-head h1{margin:0;color:var(--fc-primary);font-size:1.8rem}.admin-page-head p{margin:5px 0 0;color:var(--fc-text-muted)}@media(max-width:650px){.admin-page-head{align-items:flex-start;flex-direction:column}}</style>
