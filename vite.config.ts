import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// Standart Tauri + Vue + Vite düzeni: kök index.html, kaynak src/, çıktı dist/.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [vue({ template: { transformAssetUrls } }), vuetify({ autoImport: true })],
  // Tauri: konsolu temizleme (Rust log'larını gizlememek için) + env öneki.
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    outDir: resolve('dist'),
    emptyOutDir: true,
    // Tauri webview'i modern; esnext hedefi güvenli ve daha küçük çıktı verir.
    target: 'esnext',
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  },
  server: {
    // Tauri konvansiyonel dev portu.
    port: 1420,
    strictPort: true,
    host: '127.0.0.1'
  }
})
