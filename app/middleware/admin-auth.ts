export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()
  if (!auth.user) await auth.load()
  if (!auth.user || !['superadmin', 'administrador'].includes(auth.user.role)) {
    return navigateTo('/fecoclima-ia/admin/login')
  }
})
