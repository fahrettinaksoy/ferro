import { defineStore } from 'pinia'
import { setLocale, type Locale } from '@renderer/plugins/i18n'
import { invoke } from '@renderer/lib/ipc'
import type { RuntimeSettings, FileExistsAction } from '@shared/transfer'
export type { FileExistsAction }
import {
  themeName,
  type SchemeKey,
  type ThemeContrast,
  type ThemeFonts,
  type ThemeMode
} from '@renderer/lib/theme'

/** Aktif tema adı (Material Design 3): mode + kontrast birleşimi. */
export type ThemeName =
  | 'light'
  | 'light-medium-contrast'
  | 'light-high-contrast'
  | 'dark'
  | 'dark-medium-contrast'
  | 'dark-high-contrast'
export type { SchemeKey, ThemeContrast, ThemeFonts, ThemeMode }
export type TlsVersion = '1.0' | '1.1' | '1.2' | '1.3'
/** Kullanıcının dil seçimi — 'system' ise OS diline göre çözülür. */
export type LangChoice = 'system' | Locale

/** Bağlantı sayfası tercihleri (Ayarlar → Bağlantı). */
export interface ConnectionPrefs {
  /** Zaman aşımı (saniye). 0 = kapalı. */
  timeoutSec: number
  /** En fazla bağlanma denemesi (0-99). */
  maxRetries: number
  /** Başarısız bağlantılar arası bekleme (0-999 saniye). */
  retryDelaySec: number
  /** Kullanılabilecek en düşük TLS sürümü. */
  tlsMinVersion: TlsVersion
  /** TLS sertifikaları için sistem güvenilirliğini kullan. */
  tlsUseSystemTrust: boolean
}

/** FTP sayfası tercihleri (Ayarlar → Bağlantı → FTP). */
export interface FtpPrefs {
  /** Varsayılan aktarım kipi. */
  transferMode: 'passive' | 'active'
  /** Hata durumunda diğer aktarım kipini dene. */
  fallbackOnFailure: boolean
  /** FTP canlı tutma (keep-alive) komutları gönder. */
  keepAlive: boolean
}

/** Aktif kip tercihleri (Ayarlar → Bağlantı → FTP → Aktif kip). */
export interface FtpActivePrefs {
  /** Yerel bağlantı noktalarını sınırla. */
  limitPorts: boolean
  portMin: number
  portMax: number
  /** Dış IP adresinin nasıl belirleneceği. */
  externalIpMode: 'ask-os' | 'fixed' | 'url'
  fixedIp: string
  ipUrl: string
  /** Yerel bağlantılar için dış IP adresi kullanılmasın. */
  noExternalIpForLocal: boolean
}

/** Pasif kip tercihleri. */
export interface FtpPassivePrefs {
  /** Hatalı sunucu yanıtında davranış. */
  malformedReply: 'use-server-ip' | 'fallback-active'
}

/** FTP vekil sunucu tercihleri. */
export interface FtpProxyPrefs {
  type: 'none' | 'user-host' | 'site' | 'open' | 'custom'
  customFormat: string
  host: string
  user: string
  password: string
}

/** SFTP kişisel anahtarı. */
export interface SftpKey {
  path: string
  comment: string
  type: string
  fingerprint: string
}
/** SFTP tercihleri (açık anahtar kimlik doğrulaması). */
export interface SftpPrefs {
  keys: SftpKey[]
}

/** Genel vekil sunucu tercihleri. */
export interface GenericProxyPrefs {
  type: 'none' | 'http' | 'socks4' | 'socks5'
  host: string
  port: number
  user: string
  password: string
}

/** Aktarım tercihleri (Ayarlar → Aktarım). */
export interface TransferPrefs {
  /** Eşzamanlı aktarım sayısı (1-10). */
  concurrentTransfers: number
  /** Eşzamanlı indirme (0 = sınırsız). */
  concurrentDownloads: number
  /** Eşzamanlı yükleme (0 = sınırsız). */
  concurrentUploads: number
  /** Hız sınırlaması etkin mi. */
  enableSpeedLimit: boolean
  /** İndirme sınırı (KiB/s). */
  downloadLimitKiB: number
  /** Yükleme sınırı (KiB/s). */
  uploadLimitKiB: number
  /** Hız sınırı hoşgörüsü. */
  tolerance: 'low' | 'normal' | 'high'
  /** Geçersiz karakterleri değiştir. */
  replaceInvalidChars: boolean
  /** Değiştirme karakteri. */
  replacementChar: string
  /** İndirmeden önce yer ayır. */
  preallocate: boolean
}

/** FTP: Dosya türleri tercihleri (Ayarlar → Aktarım → FTP: Dosya türleri). */
export interface TransferTypesPrefs {
  defaultType: 'auto' | 'ascii' | 'binary'
  /** ASCII olarak algılanacak uzantılar (noktasız). */
  asciiExtensions: string[]
  /** Uzantısız dosyaları ASCII say. */
  noExtAsAscii: boolean
  /** Noktalı (dotfile) dosyaları ASCII say. */
  dotfilesAsAscii: boolean
}

/** Dosya var işlemi tercihleri (Ayarlar → Aktarım → Dosya var işlemi). */
export interface FileExistsPrefs {
  download: FileExistsAction
  upload: FileExistsAction
  /** ASCII dosyalarda sürdürmeye izin ver. */
  asciiResume: boolean
}

/** Arayüz tercihleri (Ayarlar → Arayüz). */
export interface InterfacePrefs {
  layout: 'classic' | 'explorer' | 'side-by-side' | 'top-bottom'
  messageLogPos: 'above-panes' | 'as-tab' | 'hidden'
  swapPanes: boolean
  preventSleep: boolean
  onStartup: 'normal' | 'site-manager' | 'restore-tabs'
  newConnWhileConnected: 'ask' | 'new-tab' | 'current-tab'
  forceRefreshOnSubfolderOps: boolean
  showInstantRate: boolean
}

/** Parola tercihleri (Ayarlar → Arayüz → Parolalar). */
export interface PasswordPrefs {
  mode: 'save' | 'dont-save' | 'master'
}

/** Görünüm/tema tercihleri (Ayarlar → Arayüz → Temalar). */
export interface AppearancePrefs {
  scaleFactor: number
}

/** Tarih/saat biçimi tercihleri. */
export interface DateTimePrefs {
  dateMode: 'system' | 'iso' | 'custom'
  dateCustom: string
  timeMode: 'system' | 'iso' | 'custom'
  timeCustom: string
}

/** Dosya boyutu biçimi tercihleri. */
export interface FileSizePrefs {
  format: 'bytes' | 'iec' | 'si-binary' | 'si-decimal'
  thousandsSep: boolean
  decimalPlaces: number
}

/** Dosya listeleri tercihleri. */
export interface FileListsPrefs {
  sortMode: 'dirs-first' | 'files-first' | 'mixed'
  nameSort: 'case-sensitive' | 'case-insensitive' | 'natural'
  compareThresholdMin: number
  dblClickFile: 'transfer' | 'view-edit' | 'none'
  dblClickDir: 'open' | 'none'
}

/** Dosya düzenleme tercihleri (Ayarlar → Dosya düzenleme). */
export interface EditingPrefs {
  defaultEditor: 'none' | 'system' | 'custom'
  customEditorPath: string
  associationMode: 'use-associations' | 'always-default'
  watchChanges: boolean
}

/** Dosya türü ilişkileri (Ayarlar → Dosya düzenleme → Dosya türü ilişkileri). */
export interface FileAssocPrefs {
  /** Her satır: uzantı "komut" parametreler. */
  associations: string
}

/** Güncelleme tercihleri (Ayarlar → Güncelleme). */
export interface UpdatePrefs {
  checkFrequency: 'daily' | 'weekly' | 'never'
  channel: 'stable' | 'beta' | 'nightly'
}

/** Günlük tercihleri (Ayarlar → Günlük). */
export interface LoggingPrefs {
  timestamps: boolean
  logToFile: boolean
  fileName: string
  limitSize: boolean
  maxSizeMiB: number
}

/** Hata ayıklama tercihleri (Ayarlar → Hata ayıklama). */
export interface DebugPrefs {
  showDebugMenu: boolean
  /** 0-4 (0=Yok ... 4=Hata ayıklama). */
  debugLevel: number
  showRawListing: boolean
}

/** Ayarlar penceresindeki tüm sayfa tercihleri. Yeni sayfalar buraya eklenir. */
export interface AppPrefs {
  connection: ConnectionPrefs
  ftp: FtpPrefs
  transfer: TransferPrefs
  transferTypes: TransferTypesPrefs
  fileExists: FileExistsPrefs
  iface: InterfacePrefs
  passwords: PasswordPrefs
  appearance: AppearancePrefs
  dateTime: DateTimePrefs
  fileSize: FileSizePrefs
  fileLists: FileListsPrefs
  editing: EditingPrefs
  fileAssoc: FileAssocPrefs
  updates: UpdatePrefs
  logging: LoggingPrefs
  debug: DebugPrefs
  ftpActive: FtpActivePrefs
  ftpPassive: FtpPassivePrefs
  ftpProxy: FtpProxyPrefs
  sftp: SftpPrefs
  genericProxy: GenericProxyPrefs
}

interface UiState {
  /** Aktif tema adı (mode + kontrast'tan türetilir). */
  theme: ThemeName
  /** Açık/koyu varyant. */
  themeMode: ThemeMode
  /** Kontrast düzeyi. */
  themeContrast: ThemeContrast
  /** Kaynak (primary) renk — tüm palet bundan üretilir. */
  themeSeed: string
  /** Renk şeması (Material/Content/Vibrant …). */
  themeScheme: SchemeKey
  /** Yazı tipleri (başlık/gövde/kök boyut). */
  fonts: ThemeFonts
  language: Locale
  languageChoice: LangChoice
  /** Bant genişliği sınırı (KB/s). 0 = sınırsız. */
  bandwidthKBs: number
  prefs: AppPrefs
  /** Sağdan açılan genel panel (AppDrawer). null = kapalı. Örn. 'settings'. */
  openPanel: string | null
}

const DEFAULT_PREFS: AppPrefs = {
  connection: {
    timeoutSec: 20,
    maxRetries: 2,
    retryDelaySec: 5,
    tlsMinVersion: '1.2',
    tlsUseSystemTrust: false
  },
  ftp: {
    transferMode: 'passive',
    fallbackOnFailure: true,
    keepAlive: false
  },
  transfer: {
    concurrentTransfers: 2,
    concurrentDownloads: 0,
    concurrentUploads: 0,
    enableSpeedLimit: false,
    downloadLimitKiB: 1000,
    uploadLimitKiB: 100,
    tolerance: 'normal',
    replaceInvalidChars: false,
    replacementChar: '_',
    preallocate: false
  },
  transferTypes: {
    defaultType: 'auto',
    asciiExtensions: [
      'ac',
      'am',
      'asp',
      'bat',
      'c',
      'cfm',
      'cgi',
      'conf',
      'cpp',
      'css',
      'dhtml',
      'diz',
      'h',
      'hpp',
      'htm',
      'html',
      'in',
      'inc',
      'js',
      'jsp',
      'lua',
      'm4',
      'mak',
      'md5',
      'nfo',
      'nsi',
      'pas',
      'patch',
      'php',
      'phtml',
      'pl',
      'po',
      'py',
      'qmail',
      'sh',
      'shtml',
      'sql',
      'svg',
      'tcl',
      'tpl',
      'txt',
      'vbs',
      'xhtml',
      'xml',
      'xrc'
    ],
    noExtAsAscii: true,
    dotfilesAsAscii: true
  },
  fileExists: {
    download: 'ask',
    upload: 'ask',
    asciiResume: false
  },
  iface: {
    layout: 'classic',
    messageLogPos: 'above-panes',
    swapPanes: false,
    preventSleep: true,
    onStartup: 'normal',
    newConnWhileConnected: 'ask',
    forceRefreshOnSubfolderOps: false,
    showInstantRate: false
  },
  passwords: {
    mode: 'dont-save'
  },
  appearance: {
    scaleFactor: 1
  },
  dateTime: {
    dateMode: 'system',
    dateCustom: '',
    timeMode: 'system',
    timeCustom: ''
  },
  fileSize: {
    format: 'bytes',
    thousandsSep: true,
    decimalPlaces: 1
  },
  fileLists: {
    sortMode: 'dirs-first',
    nameSort: 'case-sensitive',
    compareThresholdMin: 1,
    dblClickFile: 'transfer',
    dblClickDir: 'open'
  },
  editing: {
    defaultEditor: 'none',
    customEditorPath: '',
    associationMode: 'use-associations',
    watchChanges: true
  },
  fileAssoc: {
    associations: ''
  },
  updates: {
    checkFrequency: 'weekly',
    channel: 'stable'
  },
  logging: {
    timestamps: false,
    logToFile: false,
    fileName: '',
    limitSize: true,
    maxSizeMiB: 10
  },
  debug: {
    showDebugMenu: false,
    debugLevel: 0,
    showRawListing: false
  },
  ftpActive: {
    limitPorts: false,
    portMin: 6000,
    portMax: 7000,
    externalIpMode: 'ask-os',
    fixedIp: '',
    ipUrl: '',
    noExternalIpForLocal: true
  },
  ftpPassive: {
    malformedReply: 'use-server-ip'
  },
  ftpProxy: {
    type: 'none',
    customFormat: '',
    host: '',
    user: '',
    password: ''
  },
  sftp: {
    keys: []
  },
  genericProxy: {
    type: 'none',
    host: '',
    port: 0,
    user: '',
    password: ''
  }
}

function loadThemeMode(): ThemeMode {
  const saved = localStorage.getItem('ferro.themeMode')
  if (saved === 'light' || saved === 'dark') return saved
  // Kayıt yoksa OS tercihini izle (best practice: prefers-color-scheme).
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  return prefersDark ? 'dark' : 'light'
}
function loadThemeContrast(): ThemeContrast {
  const v = localStorage.getItem('ferro.themeContrast')
  return v === 'medium' || v === 'high' ? v : 'standard'
}
function loadThemeSeed(): string {
  return localStorage.getItem('ferro.themeSeed') || '#40692c'
}
function loadThemeScheme(): SchemeKey {
  return (localStorage.getItem('ferro.themeScheme') as SchemeKey | null) || 'tonalSpot'
}
function loadFonts(): ThemeFonts {
  try {
    const raw = JSON.parse(localStorage.getItem('ferro.fonts') ?? '{}')
    return {
      heading: typeof raw.heading === 'string' ? raw.heading : 'system',
      body: typeof raw.body === 'string' ? raw.body : 'system',
      rootSize: Number(raw.rootSize) || 16
    }
  } catch {
    return { heading: 'system', body: 'system', rootSize: 16 }
  }
}
function loadLang(): Locale {
  return (localStorage.getItem('ferro.lang') as Locale | null) ?? 'tr'
}
function loadLangChoice(): LangChoice {
  const v = localStorage.getItem('ferro.langChoice')
  if (v === 'system' || v === 'tr' || v === 'en') return v
  return loadLang()
}
function resolveLocale(choice: LangChoice): Locale {
  if (choice === 'system') {
    return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
  }
  return choice
}
function loadBandwidth(): number {
  return Number(localStorage.getItem('ferro.bandwidth') ?? '0') || 0
}
function loadPrefs(): AppPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem('ferro.prefs') ?? '{}')
    // Varsayılanlarla derin birleştir (ileri uyumluluk).
    return {
      connection: { ...DEFAULT_PREFS.connection, ...(raw.connection ?? {}) },
      ftp: { ...DEFAULT_PREFS.ftp, ...(raw.ftp ?? {}) },
      transfer: { ...DEFAULT_PREFS.transfer, ...(raw.transfer ?? {}) },
      transferTypes: { ...DEFAULT_PREFS.transferTypes, ...(raw.transferTypes ?? {}) },
      fileExists: { ...DEFAULT_PREFS.fileExists, ...(raw.fileExists ?? {}) },
      iface: { ...DEFAULT_PREFS.iface, ...(raw.iface ?? {}) },
      passwords: { ...DEFAULT_PREFS.passwords, ...(raw.passwords ?? {}) },
      appearance: { ...DEFAULT_PREFS.appearance, ...(raw.appearance ?? {}) },
      dateTime: { ...DEFAULT_PREFS.dateTime, ...(raw.dateTime ?? {}) },
      fileSize: { ...DEFAULT_PREFS.fileSize, ...(raw.fileSize ?? {}) },
      fileLists: { ...DEFAULT_PREFS.fileLists, ...(raw.fileLists ?? {}) },
      editing: { ...DEFAULT_PREFS.editing, ...(raw.editing ?? {}) },
      fileAssoc: { ...DEFAULT_PREFS.fileAssoc, ...(raw.fileAssoc ?? {}) },
      updates: { ...DEFAULT_PREFS.updates, ...(raw.updates ?? {}) },
      logging: { ...DEFAULT_PREFS.logging, ...(raw.logging ?? {}) },
      debug: { ...DEFAULT_PREFS.debug, ...(raw.debug ?? {}) },
      ftpActive: { ...DEFAULT_PREFS.ftpActive, ...(raw.ftpActive ?? {}) },
      ftpPassive: { ...DEFAULT_PREFS.ftpPassive, ...(raw.ftpPassive ?? {}) },
      ftpProxy: { ...DEFAULT_PREFS.ftpProxy, ...(raw.ftpProxy ?? {}) },
      sftp: { ...DEFAULT_PREFS.sftp, ...(raw.sftp ?? {}) },
      genericProxy: { ...DEFAULT_PREFS.genericProxy, ...(raw.genericProxy ?? {}) }
    }
  } catch {
    return structuredClone(DEFAULT_PREFS)
  }
}

// Uygulama geneli UI durumu (tema + dil + tercihler), localStorage'da kalıcı.
export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    themeMode: loadThemeMode(),
    themeContrast: loadThemeContrast(),
    themeSeed: loadThemeSeed(),
    themeScheme: loadThemeScheme(),
    fonts: loadFonts(),
    theme: themeName(loadThemeMode(), loadThemeContrast()) as ThemeName,
    language: loadLang(),
    languageChoice: loadLangChoice(),
    bandwidthKBs: loadBandwidth(),
    prefs: loadPrefs(),
    openPanel: null
  }),
  actions: {
    /** Sağdan açılan paneli (AppDrawer) açar. */
    openDrawer(name: string): void {
      this.openPanel = name
    },
    /** Açık paneli kapatır. */
    closeDrawer(): void {
      this.openPanel = null
    },
    /** Aktif tema adını mode + kontrast'tan yeniden hesaplar. */
    syncThemeName(): void {
      this.theme = themeName(this.themeMode, this.themeContrast) as ThemeName
    },
    toggleTheme(): void {
      this.setThemeMode(this.themeMode === 'dark' ? 'light' : 'dark')
    },
    setThemeMode(mode: ThemeMode): void {
      this.themeMode = mode
      localStorage.setItem('ferro.themeMode', mode)
      this.syncThemeName()
    },
    setThemeContrast(contrast: ThemeContrast): void {
      this.themeContrast = contrast
      localStorage.setItem('ferro.themeContrast', contrast)
      this.syncThemeName()
    },
    /** Kaynak rengi değiştirir (palet App.vue'da yeniden üretilir). */
    setThemeSeed(seed: string): void {
      this.themeSeed = seed
      localStorage.setItem('ferro.themeSeed', seed)
    },
    setThemeScheme(scheme: SchemeKey): void {
      this.themeScheme = scheme
      localStorage.setItem('ferro.themeScheme', scheme)
    },
    setFonts(fonts: ThemeFonts): void {
      this.fonts = { ...fonts }
      localStorage.setItem('ferro.fonts', JSON.stringify(this.fonts))
    },
    setLanguage(lang: Locale): void {
      this.language = lang
      localStorage.setItem('ferro.lang', lang)
      setLocale(lang)
    },
    /** Dil seçimini ('system'/'tr'/'en') uygular ve çözülen locale'i etkinleştirir. */
    setLanguageChoice(choice: LangChoice): void {
      this.languageChoice = choice
      localStorage.setItem('ferro.langChoice', choice)
      this.setLanguage(resolveLocale(choice))
    },
    /** Çalışma zamanı ayarlarını (Ayarlar) tek nesnede toplar (main'e gönderilir). */
    buildRuntimeSettings(): RuntimeSettings {
      const p = this.prefs
      return {
        bandwidthBytesPerSec: this.bandwidthKBs * 1024,
        maxConnections: Math.min(10, Math.max(1, p.transfer.concurrentTransfers)),
        connectTimeoutMs: Math.max(0, p.connection.timeoutSec) * 1000,
        keepAlive: p.ftp.keepAlive,
        // maxRetries = "yeniden deneme sayısı" → toplam deneme = +1.
        retryMaxAttempts: Math.min(10, Math.max(0, p.connection.maxRetries) + 1),
        retryDelayMs: Math.max(0, p.connection.retryDelaySec) * 1000,
        fileExistsDownload: p.fileExists.download,
        fileExistsUpload: p.fileExists.upload,
        transferType: {
          mode: p.transferTypes.defaultType,
          asciiExtensions: p.transferTypes.asciiExtensions.map((e) => e.toLowerCase()),
          noExtAsAscii: p.transferTypes.noExtAsAscii,
          dotfilesAsAscii: p.transferTypes.dotfilesAsAscii
        },
        editor: {
          mode: p.editing.defaultEditor,
          customPath: p.editing.customEditorPath
        },
        proxy: {
          type: p.genericProxy.type,
          host: p.genericProxy.host,
          port: p.genericProxy.port,
          user: p.genericProxy.user,
          password: p.genericProxy.password
        },
        logging: { toFile: p.logging.logToFile, maxSizeMiB: p.logging.maxSizeMiB },
        updates: { frequency: p.updates.checkFrequency, channel: p.updates.channel }
      }
    },

    /** Çalışma zamanı ayarlarını main sürece uygular (açılışta + her kaydetmede). */
    async applyRuntimeSettings(): Promise<void> {
      await invoke('settings:apply', this.buildRuntimeSettings())
    },

    /** Bant genişliği sınırını uygular (KB/s; 0 = sınırsız) ve kalıcılaştırır. */
    async setBandwidth(kbs: number): Promise<void> {
      const v = Math.max(0, Math.floor(kbs || 0))
      this.bandwidthKBs = v
      localStorage.setItem('ferro.bandwidth', String(v))
      await this.applyRuntimeSettings()
    },

    /** Ayarlar penceresinden gelen tercihleri kaydeder (Tamam) ve motora uygular. */
    savePrefs(next: AppPrefs): void {
      this.prefs = next
      localStorage.setItem('ferro.prefs', JSON.stringify(next))
      void this.applyRuntimeSettings().catch(() => undefined)
    }
  }
})
