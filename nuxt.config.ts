export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      titleTemplate: '%s · FECOCLIMA IA',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#004481' },
        { name: 'description', content: 'Monitoreo agrometeorológico, fenología y alertas para productores de Paraguay.' }
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000/api/v1',
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'FECOCLIMA IA'
    }
  },
  nitro: { preset: 'node-server' },
  typescript: { strict: true, typeCheck: false },
  routeRules: {
    '/fecoclim-ai': { redirect: '/fecoclima-ia' },
    '/': { redirect: '/fecoclima-ia' }
  }
})
