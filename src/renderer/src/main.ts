import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import { i18n } from './plugins/i18n'
import { installFerroBridge } from './lib/tauriBridge'

// window.ferro köprüsü, herhangi bir store/bileşen invoke etmeden ÖNCE kurulur
// (köprüyü renderer'ın kendisi kurar).
installFerroBridge()

// i18n, vuetify'dan önce kurulur (Vuetify locale adapter'ı vue-i18n'e dayanır).
const app = createApp(App)

// Tanı: renderer hatalarını terminale ([renderer]) düşür (DevTools gerekmesin).
app.config.errorHandler = (err, _instance, info): void => {
  console.error('[ferro] Vue error @', info, '\n', err)
}
window.addEventListener('error', (e) => console.error('[ferro] window error:', e.message, e.error))
window.addEventListener('unhandledrejection', (e) =>
  console.error('[ferro] unhandledrejection:', e.reason)
)

app.use(createPinia()).use(i18n).use(vuetify).mount('#app')
