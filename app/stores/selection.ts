import { defineStore } from 'pinia'

function defaultPlantingDate(): string {
  return new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
}

export const useSelectionStore = defineStore('selection', () => {
  const stationId = ref<string>('')
  const cropCode = ref<string>('SOJA')
  const plantingDate = ref<string>(defaultPlantingDate())
  const period = ref<string>('72h')
  return { stationId, cropCode, plantingDate, period }
}, { persist: false })
