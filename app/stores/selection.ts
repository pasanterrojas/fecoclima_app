import { defineStore } from 'pinia'

export const useSelectionStore = defineStore('selection', () => {
  const stationId = ref<string>('')
  const cropCode = ref<string>('SOJA')
  const cycleId = ref<string>('')
  const period = ref<string>('72h')
  return { stationId, cropCode, cycleId, period }
}, { persist: false })
