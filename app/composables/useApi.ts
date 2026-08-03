export function useApi() {
  const config = useRuntimeConfig()
  const csrf = useCookie<string | null>(config.public.csrfCookieName)
  const incomingCookie = import.meta.server ? useRequestHeaders(['cookie']).cookie : undefined
  const requestOrigin = import.meta.server ? useRequestURL().origin : ''

  function apiBaseURL(): string {
    const configured = String(config.public.apiBase || '/api/v1')
    if (!import.meta.server || /^https?:\/\//i.test(configured)) return configured
    return new URL(configured, requestOrigin).toString().replace(/\/$/, '')
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

    if (csrf.value && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('X-CSRF-Token', csrf.value)
    }

    return await $fetch<T>(path, {
      baseURL: apiBaseURL(),
      credentials: 'include',
      ...options,
      headers,
    })
  }

  return { request }
}
