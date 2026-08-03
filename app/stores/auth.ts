import { defineStore } from 'pinia'

interface User { id: string; email: string; name: string; role: string }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const { request } = useApi()
  let pendingLoad: Promise<void> | null = null

  async function load() {
    if (pendingLoad) return await pendingLoad

    pendingLoad = (async () => {
      loading.value = true
      try {
        user.value = await request<User>('/auth/me')
      } catch (exception: any) {
        const status = Number(exception?.statusCode || exception?.status || exception?.response?.status || 0)
        if (import.meta.client && status === 401) {
          try {
            user.value = await request<User>('/auth/refresh', { method: 'POST' })
            return
          } catch {
            // La sesión realmente expiró o fue revocada.
          }
        }
        user.value = null
      } finally {
        loading.value = false
        pendingLoad = null
      }
    })()

    return await pendingLoad
  }

  async function login(email: string, password: string) {
    user.value = await request<User>('/auth/login', { method: 'POST', body: { email, password } })
  }

  async function logout() {
    await request('/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/fecoclima-ia/admin/login')
  }

  return { user, loading, load, login, logout }
})
