/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.BASE || '/',
  server: {
    watch: {
      ignored: ['**/.playwright-cli/**', '**/output/playwright/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 3_000_000,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
      },
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'LifeOS',
        short_name: 'LifeOS',
        description: '让清醒时的决定，对软弱时的自己保有结构化约束力',
        theme_color: '#ece9e2',
        background_color: '#ece9e2',
        display: 'standalone',
        lang: 'zh-CN',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
