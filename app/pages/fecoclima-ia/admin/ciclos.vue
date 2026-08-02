<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
useSeoMeta({ title: 'Flujo simplificado' })
</script>
<template>
  <section>
    <AdminPageHeader title="Ciclos productivos retirados" description="La plataforma ya no exige crear ni mantener ciclos. El contexto se calcula con estación, cultivo y fecha de siembra."/>
    <article class="card"><div class="card-body"><h2 class="section-title">Nuevo flujo operativo</h2><p>En el portal público el usuario selecciona una estación meteorológica, un cultivo y una fecha de siembra. FECOCLIMA IA calcula automáticamente la edad y etapa fenológica esperada.</p><NuxtLink class="btn btn-primary" to="/fecoclima-ia">Abrir tablero público</NuxtLink></div></article>
  </section>
</template>
