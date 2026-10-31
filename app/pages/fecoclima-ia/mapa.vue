<script setup lang="ts">
useSeoMeta({title:'Mapa · Estaciones y territorio'})
</script>
<template><div class="page"><div class="container"><ClientOnly><RegionalMap/><template #fallback><LoadingState/></template></ClientOnly></div></div></template>
