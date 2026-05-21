// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-05-21",
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4,
  },

  modules: [
    "@nuxtjs/tailwindcss",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@nuxt/icon",
    "shadcn-nuxt",
    "@nuxtjs/i18n",
    "@nuxt/eslint",
  ],

  css: ["~/assets/css/main.css"],

  shadcn: {
    prefix: "",
    componentDir: "./app/components/ui",
  },

  i18n: {
    locales: [
      { code: "ko", name: "한국어", file: "ko.json" },
      { code: "en", name: "English", file: "en.json" },
    ],
    defaultLocale: "ko",
    strategy: "no_prefix",
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_locale",
      redirectOn: "root",
    },
  },

  runtimeConfig: {
    // server-only — used by /server/api proxies
    apiBase: process.env.NUXT_API_BASE || "http://localhost:8080",
    cookieSecure: process.env.NUXT_COOKIE_SECURE !== "false",

    public: {
      // exposed to the client (do not put secrets here)
      appName: "케어닥",
      appNameEn: "Care Doc",
    },
  },

  app: {
    head: {
      title: "케어닥 HQ",
      htmlAttrs: { lang: "ko" },
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: "케어닥 — 요양원 본부 통합관리 시스템" },
      ],
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    },
  },

  nitro: {
    preset: "cloudflare-pages",
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
});
