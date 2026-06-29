import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

// Ferro tema paleti — light/dark. Tema state'i ileride ayarlar store'una bağlanacak (G3.10).
export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'ferroDark',
    themes: {
      ferroLight: {
        dark: false,
        colors: {
          primary: '#1565C0',
          secondary: '#37474F',
          surface: '#FFFFFF',
          background: '#F5F5F5'
        }
      },
      ferroDark: {
        dark: true,
        colors: {
          primary: '#42A5F5',
          secondary: '#90A4AE',
          surface: '#1E1E1E',
          background: '#121212'
        }
      }
    }
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi }
  },
  defaults: {
    VBtn: { variant: 'flat' }
  }
})
