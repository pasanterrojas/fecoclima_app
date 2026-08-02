export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()
  if (!auth.user && !auth.loading) await auth.load()
  if (!auth.user) return navigateTo('/fecoclima-ia/admin/login')
})
