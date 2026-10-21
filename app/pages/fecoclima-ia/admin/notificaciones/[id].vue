<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const route = useRoute()
</script>
<template><AdminNotificationsView :detail-id="String(route.params.id)" :key="String(route.params.id)" /></template>
