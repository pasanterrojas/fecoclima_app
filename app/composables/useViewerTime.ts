import { formatViewerDate, formatViewerDateTime, viewerZoneName } from '~/utils/viewerTime'

/** Detect the device zone after hydration; no location permission is necessary. */
export function useViewerTime() {
  const zone = useState('viewer-time-zone', () => 'UTC')
  function detect() {
    try { zone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { zone.value = 'UTC' }
  }
  onMounted(() => {
    detect()
    globalThis.addEventListener('focus', detect)
    document.addEventListener('visibilitychange', detect)
  })
  onBeforeUnmount(() => {
    globalThis.removeEventListener('focus', detect)
    if (import.meta.client) document.removeEventListener('visibilitychange', detect)
  })
  const zoneLabel = computed(() => `Hora de su dispositivo · ${viewerZoneName(zone.value)}`)
  return { zone, zoneLabel,
    dateTime: (value: unknown) => formatViewerDateTime(value, zone.value),
    dateOnly: (value: unknown) => formatViewerDate(value, zone.value) }
}
