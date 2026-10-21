import { parcelSessionId, setParcelSessionId } from '~/utils/parcelSession'

interface BrowserSession { browser_id: string; access_token: string; limit: number }
let session: BrowserSession | null = null
let opening: Promise<BrowserSession> | null = null
const accessKey = 'fecoclima-public-parcel-access'

/** Anonymous capability: never uses CMS login, roles or authentication refresh. */
export function usePublicParcelApi() {
  const api = useApi()
  async function ready(): Promise<BrowserSession> {
    if (session) return session
    if (opening) return opening
    async function restore() {
      let token = ''
      try { token = localStorage.getItem(accessKey) || '' } catch { /* Cookie fallback. */ }
      const result = await api.request<BrowserSession>('/public/parcels/browser-session', {
        method: 'POST', headers: { 'X-Parcel-Session': parcelSessionId(), ...(token ? {'X-Parcel-Access': token} : {}) },
      })
      session = result
      setParcelSessionId(result.browser_id)
      try { localStorage.setItem(accessKey, result.access_token) } catch { /* Cookie still restores the session. */ }
      return result
    }
    // Two fresh tabs share one identity rather than racing to create two quotas.
    const task = (async () => navigator.locks ? await navigator.locks.request('fecoclima-public-parcels', restore) : await restore())()
    opening = task.finally(() => { opening = null })
    return await opening
  }
  function publicPath(path: string) { return path.replace(/^\/parcels(?=\/|$)/, '/public/parcels') }
  async function request<T>(path: string, options: Parameters<typeof api.request<T>>[1] = {}): Promise<T> {
    const browser = await ready()
    const headers = new Headers(options.headers as HeadersInit | undefined)
    headers.set('X-Parcel-Access', browser.access_token)
    headers.set('X-Parcel-Session', browser.browser_id)
    return api.request<T>(publicPath(path), { ...options, headers })
  }
  return { ready, request, apiUrl: (path: string) => api.apiUrl(publicPath(path)) }
}
