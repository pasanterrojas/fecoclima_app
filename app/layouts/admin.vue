<script setup lang="ts">const open=ref(false)</script>
<template><div class="admin-layout"><AdminSidebar :open="open" @close="open=false"/><div class="admin-main"><AdminHeader @menu="open=true"/><main class="admin-content"><slot/></main></div><div v-if="open" class="side-overlay" @click="open=false"/></div></template>
<style scoped>.admin-layout{min-height:100vh;background:#f1f6f9}.admin-main{margin-left:270px;min-height:100vh}.admin-content{padding:24px;width:min(100%,1500px);margin:0 auto}.side-overlay{display:none}@media(max-width:900px){.admin-main{margin-left:0}.side-overlay{display:block;position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.35)}}
</style>
