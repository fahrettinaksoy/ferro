import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// Renderer bileşen testleri için ayrı yapılandırma: DOM ortamı (happy-dom) +
// Vue/Vuetify derleme eklentileri gerektirir — main/shared testlerinin
// (vitest.config.ts, environment: 'node') tam tersi. Ayrı dosya tutulur ki
// iki takım testin farklı ortam/eklenti ihtiyacı birbirine karışmasın.
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src')
    }
  },
  test: {
    environment: 'happy-dom',
    include: ['test/component/**/*.spec.ts'],
    setupFiles: ['test/component/setup.ts'],
    // vuetify'ın autoImport'u derlenen bileşenlere .css side-effect import'ları
    // ekler; Vitest bu paketi Vite'ın CSS pipeline'ından geçirsin diye "inline"
    // edilmesi gerekir — aksi halde Node'un ESM yükleyicisi .css uzantısını
    // tanımadığından patlar. @material/material-color-utilities da (tema
    // üretimi, SettingsThemes.vue → lib/theme.ts) uzantısız relative import'lar
    // içerdiğinden aynı sebeple inline edilmesi gerekiyor.
    server: {
      deps: {
        inline: ['vuetify', '@material/material-color-utilities']
      }
    }
  }
})
