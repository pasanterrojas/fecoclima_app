import { parcelSessionId, registerSessionParcel } from '~/utils/parcelSession'
import { chatBrowserId } from '~/utils/chatBrowser'
// One refresh per browser, shared by concurrent widget/admin requests.
let browserRefresh: Promise<unknown> | null = null
let browserAuthGeneration = 0

export function useApi() {
  const config = useRuntimeConfig()
  const csrfCookieName = String(config.public.csrfCookieName || 'csrf_token')
  const csrf = useCookie<string | null>(csrfCookieName, { readonly: true })
  const responseCookies = import.meta.server ? useResponseHeader('set-cookie') : null
  const incomingCookie = import.meta.server ? useRequestHeaders(['cookie']).cookie : undefined
  const requestOrigin = import.meta.server ? useRequestURL().origin : ''

  function apiBaseURL(): string {
    const configured = String(config.public.apiBase || '/api/v1')
    if (!import.meta.server || /^https?:\/\//i.test(configured)) return configured
    return new URL(configured, requestOrigin).toString().replace(/\/$/, '')
  }

  function apiUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path
    const configured = String(config.public.apiBase || '/api/v1').replace(/\/$/, '')
    // Satellite payloads from older backend versions contain /api/v1 in the
    // returned path. Strip only that known API prefix, then append the route to
    // the configured public base. This preserves production proxy prefixes
    // such as /fecoclima-ia-api/api/v1 instead of accidentally resolving the
    // image at the domain root.
    const route = `/${String(path || '').replace(/^\/+/, '').replace(/^api\/v1(?:\/|$)/, '')}`
    if (/^https?:\/\//i.test(configured)) return `${configured}${route}`
    return `${configured.startsWith('/') ? '' : '/'}${configured}${route}`.replace(/\/{2,}/g, '/')
  }

  function currentCsrfToken(): string | null {
    // Login/refresh responses set this cookie from the API. Nuxt's useCookie
    // ref may still hold the value from before that response, so read the live
    // browser cookie before each mutation instead of sending a stale token.
    if (import.meta.client) {
      const prefix = `${encodeURIComponent(csrfCookieName)}=`
      const entry = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix))
      if (entry) {
        const rawToken = entry.slice(prefix.length)
        try {
          const token = decodeURIComponent(rawToken)
          return token
        } catch {
          return rawToken
        }
      }
      return null
    }
    return csrf.value
  }

  async function request<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    const headers = new Headers(options.headers as HeadersInit | undefined)
    const method = String(options.method || 'GET').toUpperCase()

    // En una recarga completa, el middleware administrativo se ejecuta en SSR.
    // $fetch no reenvía por sí solo las cookies del navegador al API externo,
    // por lo que /auth/me respondía 401 y Nuxt enviaba al login. Reenviar solo
    // Cookie mantiene la sesión sin copiar encabezados innecesarios.
    if (import.meta.server && incomingCookie && !headers.has('cookie')) {
      headers.set('cookie', incomingCookie)
    }

    const csrfToken = currentCsrfToken()
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('X-CSRF-Token', csrfToken)
    }

    if (import.meta.client && (path === '/parcels' || /^\/public\/parcel-imagery(?:\/[^/]+)?(?:\?|$)/.test(path))) {
      headers.set('X-Parcel-Session', parcelSessionId())
    }
    if (import.meta.client && /^\/(?:public\/)?parcels\/analyses\/[^/]+\/chat(?:\?|$)/.test(path)) {
      headers.set('X-Chat-Browser', chatBrowserId())
    }
    const remember = (result: T): T => {
      if (import.meta.client && path === '/parcels' && method === 'POST' && (result as any)?.id
          && (!(result as any).browser_session_id || (result as any).browser_session_id===parcelSessionId())) registerSessionParcel((result as any).id)
      return result
    }
    const generation = browserAuthGeneration
    const execute = () => {
      const latest = currentCsrfToken()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        if (latest) headers.set('X-CSRF-Token', latest)
        else headers.delete('X-CSRF-Token')
      }
      const fetchOptions = { baseURL: apiBaseURL(), credentials: 'include' as const, ...options, headers, retry: 0 }
      if (import.meta.server) {
        const rawRequest = $fetch.raw as unknown as (url: string, options: unknown) => Promise<{ headers: Headers; _data: T }>
        return rawRequest(path, fetchOptions).then(response => {
          const cookies = response.headers.getSetCookie()
          if (cookies.length && responseCookies) {
            const previous = responseCookies.value
            responseCookies.value = [...(Array.isArray(previous) ? previous : typeof previous === 'string' ? [previous] : []), ...cookies]
          }
          return response._data as T
        })
      }
      return $fetch<T>(path, fetchOptions)
    }
    try { return remember(await execute()) }
    catch (exception: any) {
      if (!import.meta.client || exception?.response?.status !== 401 || path.startsWith('/auth/') || path.startsWith('/public/')) throw exception
      if (generation === browserAuthGeneration) {
        if (!browserRefresh) {
          browserRefresh = $fetch('/auth/refresh', { baseURL: apiBaseURL(), method: 'POST', credentials: 'include', retry: 0 })
            .then(result => { browserAuthGeneration++; return result })
            .finally(() => { browserRefresh = null })
        }
        await browserRefresh
      }
      return remember(await execute())
    }
  }

  return { request, apiUrl }
}
