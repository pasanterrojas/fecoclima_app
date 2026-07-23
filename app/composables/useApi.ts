export function useApi() {
  const config = useRuntimeConfig()
  const csrf = useCookie<string | null>('csrf_token')

  async function request<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    const headers = new Headers(options.headers as HeadersInit | undefined)
    if (csrf.value && !['GET', 'HEAD', 'OPTIONS'].includes(String(options.method || 'GET').toUpperCase())) {
      headers.set('X-CSRF-Token', csrf.value)
    }
    return await $fetch<T>(path, {
      baseURL: config.public.apiBase,
      credentials: 'include',
      ...options,
      headers
    })
  }
  return { request }
}
