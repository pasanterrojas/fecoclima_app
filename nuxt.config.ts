export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',

  devtools: {
    enabled: false
  },

  modules: ['@pinia/nuxt'],

  hooks: {
    'pages:extend'(pages) {
      const addAdminAliases = (entries: typeof pages) => {
        for (const page of entries) {
          if (page.path.startsWith('/fecoclima-ia/admin')) {
            const shortPath = page.path.replace('/fecoclima-ia/admin', '/admin')
            page.alias = [...new Set([
              ...(Array.isArray(page.alias) ? page.alias : page.alias ? [page.alias] : []),
              shortPath,
              ...(shortPath.startsWith('/admin/estaciones')
                ? [shortPath.replace('/admin/estaciones', '/admin/estacionesmeteorologicas')]
                : [])
            ])]
          }
          if (page.children) addAdminAliases(page.children)
        }
      }
      addAdminAliases(pages)
    }
  },

  css: ['~/assets/css/main.css'],

  app: {
    // La aplicación conserva sus rutas reales:
    // /fecoclima-ia
    // /fecoclima-ia/admin
    // etc.
    baseURL: '/',

    // Evita que sus archivos JS y CSS choquen con los del
    // Centro de Competencias, que también usa Nuxt.
    buildAssetsDir: '/fecoclima-ia/_nuxt/',

    head: {
      titleTemplate: '%s · FECOCLIMA IA',

      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1'
        },
        {
          name: 'theme-color',
          content: '#004481'
        },
        {
          name: 'description',
          content:
            'Monitoreo agrometeorológico, fenología y alertas para productores de Paraguay.'
        }
      ],

      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/favicon.svg'
        }
      ]
    }
  },

  runtimeConfig: {
    public: {
      apiBase:
        process.env.NUXT_PUBLIC_API_BASE ||
        'http://localhost:8000/api/v1',

      appName:
        process.env.NUXT_PUBLIC_APP_NAME ||
        'FECOCLIMA IA',

      csrfCookieName:
        process.env.NUXT_PUBLIC_CSRF_COOKIE_NAME ||
        'csrf_token',

      mapTilerKey: process.env.NUXT_PUBLIC_MAPTILER_KEY || ''
    }
  },

  nitro: {
    preset: 'node-server'
  },

  typescript: {
    strict: true,
    typeCheck: false
  },

  routeRules: {
    '/fecoclim-ai': {
      redirect: '/fecoclima-ia'
    },

    '/': {
      redirect: '/fecoclima-ia'
    }
  }
})
