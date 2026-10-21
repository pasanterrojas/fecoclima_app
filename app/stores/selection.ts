import { defineStore } from 'pinia'

export const useSelectionStore = defineStore('selection', () => {
  const plotId = ref<string>('')
  const stationId = ref<string>('')
  const cropCode = ref<string>('TRIGO')
  // Nunca inferir la fecha real de siembra a partir del reloj del navegador.
  const plantingDate = ref<string>('')
  const period = ref<string>('72h')
  return { plotId, stationId, cropCode, plantingDate, period }
})
