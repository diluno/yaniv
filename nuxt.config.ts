export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  routeRules: {
    '/room/**': { ssr: false },
  },
  nitro: {
    experimental: {
      websocket: true,
    },
  },
  app: {
    head: {
      title: 'Yaniv',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Play Yaniv online with friends in a private room.' },
      ],
    },
  },
})
