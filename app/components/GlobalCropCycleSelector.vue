<script setup lang="ts">
import type { CropCycle } from '~/types/api'

defineProps<{ modelValue: string; cycles: CropCycle[] }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label>
    <span class="label">Ciclo productivo</span>
    <select class="select" :value="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <option value="">Sin ciclo específico</option>
      <option v-if="!cycles.length" disabled>No hay ciclos activos para esta estación y cultivo</option>
      <option v-for="cycle in cycles" :key="cycle.id" :value="cycle.id">{{ cycle.name }} · {{ cycle.planting_date }}</option>
    </select>
  </label>
</template>
