/** Presentation only: UTC instants remain unchanged for age, windows and alerts. */
const calendarPattern = /^\d{4}-\d{2}-\d{2}$/
const instantPattern = /T.*(?:Z|[+-]\d{2}:\d{2})$/i
export function timestampInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || !instantPattern.test(value)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
function calendarDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed
}
export function viewerZoneName(zone: string): string { return zone.split('/').at(-1)?.replaceAll('_', ' ') || zone }
export function formatViewerDate(value: unknown, zone: string): string {
  if (typeof value !== 'string' || !value) return 'Sin fecha'
  const isCalendar = calendarPattern.test(value)
  const date = isCalendar ? calendarDate(value) : timestampInstant(value)
  if (!date) return 'Fecha sin zona o no válida'
  return new Intl.DateTimeFormat('es-PY', {timeZone:isCalendar ? 'UTC' : zone,dateStyle:'medium'}).format(date)
}
export function formatViewerDateTime(value: unknown, zone: string): string {
  if (typeof value === 'string' && calendarPattern.test(value)) return formatViewerDate(value, zone)
  const date = timestampInstant(value)
  if (!date) return value ? 'Fecha sin zona o no válida' : 'Sin fecha'
  // Explicit offset disambiguates repeated hours when a country changes clocks.
  return new Intl.DateTimeFormat('es-PY', {timeZone:zone,year:'numeric',month:'short',day:'numeric',
    hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'shortOffset'}).format(date).replace('GMT','UTC')
}
