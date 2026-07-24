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
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&display=swap',
        },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Play Yaniv online with friends in a private room.' },
      ],
    },
  },
})
