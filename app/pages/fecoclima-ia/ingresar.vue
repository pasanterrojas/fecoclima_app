<script setup lang="ts">
import { LockKeyhole } from 'lucide-vue-next'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Ingreso al portal público' })
const auth = useAuthStore()
const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(form.email, form.password)
    await navigateTo('/fecoclima-ia')
  } catch (e: unknown) {
    const detail = (e as { data?: { detail?: unknown } }).data?.detail
    error.value = typeof detail === 'string' ? detail : 'No se pudo iniciar sesión. Revise sus credenciales.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="portal-login-page">
    <section class="portal-login-card card">
      <div class="portal-login-brand">
        <LockKeyhole />
        <h1>FECOCLIMA IA</h1>
        <p>Acceso para productores y técnicos</p>
      </div>
      <form @submit.prevent="submit">
        <label><span class="label">Correo electrónico</span><input v-model.trim="form.email" class="input" type="email" autocomplete="username" required /></label>
        <label><span class="label">Contraseña</span><input v-model="form.password" class="input" type="password" autocomplete="current-password" required /></label>
        <p v-if="error" class="notice notice-danger">{{ error }}</p>
        <button class="btn btn-primary" :disabled="loading">{{ loading ? 'Ingresando…' : 'Ingresar al portal' }}</button>
        <NuxtLink to="/fecoclima-ia">Volver al mapa</NuxtLink>
      </form>
    </section>
  </main>
</template>

<style scoped>
.portal-login-page{min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at top,#4d9aca 0,#004481 65%,#003663 100%)}
.portal-login-card{width:min(100%,440px);padding:30px}
.portal-login-brand{text-align:center;margin-bottom:24px}
.portal-login-brand svg{width:48px;height:48px;color:var(--fc-primary)}
.portal-login-brand h1{margin:8px 0 3px;color:var(--fc-primary)}
.portal-login-brand p{margin:0;color:var(--fc-text-muted)}
form{display:grid;gap:16px}
form>a{text-align:center;color:var(--fc-primary);font-weight:700}
</style>
