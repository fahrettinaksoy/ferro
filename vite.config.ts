import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// Tauri renderer'ı standart Vite ile derlenir.
// Kök src/renderer; çıktı proje kökündeki dist/ (tauri.conf.json frontendDist).
// Alias'lar renderer kaynağının değişmeden derlenmesi için tutulur.
// değişmeden derlensin.
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
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
