import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'
import { i18n } from '@renderer/plugins/i18n'

// İkon-fonts best practice: uygulamaya özgü ANLAMSAL ikon sözlüğü.
// Vuetify'ın yerleşik bileşen alias'larının ($close, $edit, $next ...) YANINA
// eklenir (üzerine değil) — adlar onlarla çakışmaz. Avantaj: ikon seçimi tek
// yerden yönetilir; şablonlarda `$server`, `$upload` gibi anlamsal adlar kullanılır.
// Yeni bir ikonu değiştirmek için yalnızca bu tabloyu düzenlemek yeterli.
const appAliases = {
  ferroLogo: 'mdi-folder-network',
  settings: 'mdi-cog',
  keyboard: 'mdi-keyboard-outline',
  themeDark: 'mdi-weather-night',
  themeLight: 'mdi-weather-sunny',
  sync: 'mdi-sync',
  refresh: 'mdi-refresh',
  save: 'mdi-content-save',
  remove: 'mdi-delete-outline',
  folderAdd: 'mdi-folder-plus-outline',
  navUp: 'mdi-arrow-up',
  localPc: 'mdi-laptop',
  logPanel: 'mdi-text-box-outline',
  queuePanel: 'mdi-tray-full',
  server: 'mdi-server',
  serverNetwork: 'mdi-server-network',
  sftp: 'mdi-shield-lock',
  connect: 'mdi-lan-connect',
  transferOut: 'mdi-arrow-right-bold',
  transferIn: 'mdi-arrow-left-bold',
  folder: 'mdi-folder',
  fileEntry: 'mdi-file-outline',
  symlink: 'mdi-link-variant'
}

// Ferro tema paleti — light/dark. Tema state'i ileride ayarlar store'una bağlanacak (G3.10).
export const vuetify = createVuetify({
  // i18n (best practice): Vuetify bileşen metinleri uygulamanın vue-i18n örneğine
  // bağlanır. Dil değişince ($vuetify.* dahil) her şey tek kaynaktan güncellenir.
  locale: {
    // i18n katı mesaj şemasıyla tiplendiği için adapter sınırında genişletilir
    // (adapter `I18n<any, ...>` bekler). Yalnız bu argümanı etkiler.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: createVueI18nAdapter({ i18n: i18n as any, useI18n })
  },
  // Tema (best practices): her iki tema da TAM semantik paleti tanımlar
  // (primary, secondary, success, warning, error, info, surface, background).
  // Böylece color="success" / type="error" gibi kullanımlar Vuetify varsayılanına
  // düşmez, uygulama paletiyle tutarlı olur. Başlangıç teması ui store'da OS
  // tercihine (prefers-color-scheme) göre seçilir; kullanıcı seçimi kalıcıdır.
  theme: {
    defaultTheme: 'ferroDark',
    themes: {
      ferroLight: {
        dark: false,
        colors: {
          primary: '#1565C0',
          secondary: '#37474F',
          success: '#2E7D32',
          warning: '#ED6C02',
          error: '#C62828',
          info: '#0277BD',
          surface: '#FFFFFF',
          background: '#F5F5F5'
        },
        variables: {
          'border-color': '#000000',
          'border-opacity': 0.12
        }
      },
      ferroDark: {
        dark: true,
        colors: {
          primary: '#42A5F5',
          secondary: '#90A4AE',
          success: '#66BB6A',
          warning: '#FFA726',
          error: '#EF5350',
          info: '#29B6F6',
          surface: '#1E1E1E',
          background: '#121212'
        },
        variables: {
          'border-color': '#FFFFFF',
          'border-opacity': 0.16
        }
      }
    }
  },
  icons: {
    defaultSet: 'mdi',
    // Yerleşik alias'lar korunur + uygulama sözlüğü eklenir.
    aliases: { ...aliases, ...appAliases },
    sets: { mdi }
  },
  // Global yapılandırma (best practices): uygulamanın tasarım dili burada
  // merkezîleştirilir. Bileşenlerde tekrar eden prop'lar varsayılan olarak
  // buradan verilir. Yalnızca %100 tek tip kullanılan bileşenlere varsayılan
  // konur; kısmi kullanılanlar (VList/VToolbar density, VBtn variant) bileşende
  // açıkça belirtilmeye devam eder.
  defaults: {
    // — Genel —
    VBtn: { variant: 'flat' },

    // — Form alanları: kompakt + outlined + detay gizli —
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: true },
    VSelect: { variant: 'outlined', density: 'compact', hideDetails: true },
    VTextarea: { variant: 'outlined', density: 'compact', hideDetails: true },

    // — Seçim kontrolleri: kompakt + detay gizli —
    VCheckbox: { density: 'compact', hideDetails: true },
    VRadioGroup: { density: 'compact', hideDetails: true },

    // — Veri / ağaç: kompakt —
    VTable: { density: 'compact' },
    VTreeview: { density: 'compact' }
  }
})
