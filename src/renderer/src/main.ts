import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vuetify } from './plugins/vuetify'
import { i18n } from './plugins/i18n'

// i18n, vuetify'dan önce kurulur (Vuetify locale adapter'ı vue-i18n'e dayanır).
const app = createApp(App)

// Tanı: renderer hatalarını terminale ([renderer]) düşür (DevTools gerekmesin).
app.config.errorHandler = (err, _instance, info): void => {
  // eslint-disable-next-line no-console
  console.error('[ferro] Vue error @', info, '\n', err)
}
window.addEventListener('error', (e) => console.error('[ferro] window error:', e.message, e.error))
window.addEventListener('unhandledrejection', (e) =>
  console.error('[ferro] unhandledrejection:', e.reason)
)

app.use(createPinia()).use(router).use(i18n).use(vuetify).mount('#app')
