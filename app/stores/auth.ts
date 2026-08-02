import { defineStore } from 'pinia'

interface User { id: string; email: string; name: string; role: string }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const { request } = useApi()

  async function load() {
    loading.value = true
    try { user.value = await request<User>('/auth/me') } catch { user.value = null }
    finally { loading.value = false }
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
