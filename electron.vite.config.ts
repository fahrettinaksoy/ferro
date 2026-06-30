import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    // sandbox: true ile preload harici node_modules require edemez; @electron-toolkit/preload
    // bundle'a gömülmeli. electron yine harici (sandbox'ta özel erişimli).
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      // transformAssetUrls: Vuetify bileşenlerindeki asset URL'lerini Vite'ın
      // çözebilmesi için (Vuetify+Vite kanonik kurulumu).
      vue({ template: { transformAssetUrls } }),
      // Treeshaking (best practice): autoImport yalnızca şablonlarda KULLANILAN
      // bileşen/direktifleri bundle'a alır; kullanılmayanlar dışarıda kalır.
      // NOT: styles.configFile (SASS variables) kullanılmıyor — vite-plugin-vuetify
      // 2.1.3 ile Vuetify 4'te configFile, dev'de bileşen SASS sanal modüllerini
      // 404 veriyordu (beyaz ekran). Precompiled stiller (vuetify/styles) kullanılır.
      vuetify({ autoImport: true })
    ]
  }
})
