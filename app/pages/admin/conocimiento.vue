<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
await navigateTo('/admin/agentes', { replace: true })
</script>

<template><div /></template>
