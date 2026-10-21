const cookieName = 'fecoclima_parcel_session'
const sessionKey = 'fecoclima-parcel-browser'
let currentId: string | undefined
const validId = (value?: string | null) => !!value && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)

/** Browser-local persistence; private windows discard it when their storage closes. */
export function setParcelSessionId(id: string) {
  currentId = id
  document.cookie = `${cookieName}=${id}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  try { localStorage.setItem(sessionKey, id) } catch { /* Memory/cookie fallback. */ }
}
export function parcelSessionId(): string {
  if (currentId) return currentId
  const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  let saved: string | null = null
  try { saved = localStorage.getItem(sessionKey) } catch { /* Cookies can still work. */ }
  const id = validId(cookie) ? cookie! : validId(saved) ? saved! : crypto.randomUUID()
  setParcelSessionId(id)
  return id
}
function storageKey() { return `fecoclima-session-parcels:${parcelSessionId()}` }
export function sessionParcelIds(): string[] {
  try { const ids = JSON.parse(localStorage.getItem(storageKey()) || '[]'); return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [] } catch { return [] }
}
export function registerSessionParcel(id: string) { syncSessionParcels([...sessionParcelIds(), id]) }
export function syncSessionParcels(ids: string[]) {
  try { localStorage.setItem(storageKey(), JSON.stringify([...new Set(ids)])) } catch { /* Quota is authoritative on the API. */ }
}
