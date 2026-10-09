import { defineStore } from 'pinia'

export const useSelectionStore = defineStore('selection', () => {
  const stationId = ref<string>('')
  const cropCode = ref<string>('TRIGO')
  // Nunca inferir la fecha real de siembra a partir del reloj del navegador.
  const plantingDate = ref<string>('')
  const period = ref<string>('72h')
  return { stationId, cropCode, plantingDate, period }
}, { persist: false })
