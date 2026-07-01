// Material Design 3 tema üretimi (Vuetify Theme Studio yaklaşımı).
// Bir kaynak (seed) renginden + şema (scheme) türünden, Vuetify'ın kullandığı
// 6 tema (light/dark × standard/medium/high kontrast) dinamik olarak üretilir.
import {
  Hct,
  argbFromHex,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeTonalSpot,
  SchemeContent,
  SchemeExpressive,
  SchemeFidelity,
  SchemeVibrant,
  SchemeNeutral,
  SchemeMonochrome,
  SchemeFruitSalad,
  SchemeRainbow,
  type DynamicScheme
} from '@material/material-color-utilities'
import type { ThemeDefinition } from 'vuetify'

export type SchemeKey =
  | 'tonalSpot'
  | 'content'
  | 'expressive'
  | 'fidelity'
  | 'vibrant'
  | 'neutral'
  | 'monochrome'
  | 'fruitSalad'
  | 'rainbow'

export type ThemeContrast = 'standard' | 'medium' | 'high'
export type ThemeMode = 'light' | 'dark'

/** Seçilebilir şemalar (Ayarlar → Temalar → Scheme). */
export const SCHEME_OPTIONS: { value: SchemeKey; title: string }[] = [
  { value: 'tonalSpot', title: 'Material (Tonal Spot)' },
  { value: 'content', title: 'İçerik (Content)' },
  { value: 'expressive', title: 'Etkileyici (Expressive)' },
  { value: 'fidelity', title: 'Sadık (Fidelity)' },
  { value: 'vibrant', title: 'Canlı (Vibrant)' },
  { value: 'neutral', title: 'Nötr (Neutral)' },
  { value: 'monochrome', title: 'Monokrom (Monochrome)' },
  { value: 'fruitSalad', title: 'Meyve Salatası (Fruit Salad)' },
  { value: 'rainbow', title: 'Gökkuşağı (Rainbow)' }
]

type SchemeCtor = new (src: Hct, isDark: boolean, contrast: number) => DynamicScheme
const SCHEMES: Record<SchemeKey, SchemeCtor> = {
  tonalSpot: SchemeTonalSpot,
  content: SchemeContent,
  expressive: SchemeExpressive,
  fidelity: SchemeFidelity,
  vibrant: SchemeVibrant,
  neutral: SchemeNeutral,
  monochrome: SchemeMonochrome,
  fruitSalad: SchemeFruitSalad,
  rainbow: SchemeRainbow
}
const CONTRAST_LEVEL: Record<ThemeContrast, number> = { standard: 0, medium: 0.5, high: 1 }

// Vuetify renk anahtarı → MaterialDynamicColors rol adı.
const TOKENS: [string, keyof typeof MaterialDynamicColors][] = [
  ['background', 'background'],
  ['on-background', 'onBackground'],
  ['surface', 'surface'],
  ['surface-dim', 'surfaceDim'],
  ['surface-bright', 'surfaceBright'],
  ['surface-light', 'surfaceBright'],
  ['surface-container-lowest', 'surfaceContainerLowest'],
  ['surface-container-low', 'surfaceContainerLow'],
  ['surface-container', 'surfaceContainer'],
  ['surface-container-high', 'surfaceContainerHigh'],
  ['surface-container-highest', 'surfaceContainerHighest'],
  ['on-surface', 'onSurface'],
  ['on-surface-variant', 'onSurfaceVariant'],
  ['inverse-surface', 'inverseSurface'],
  ['inverse-on-surface', 'inverseOnSurface'],
  ['outline', 'outline'],
  ['outline-variant', 'outlineVariant'],
  ['primary', 'primary'],
  ['on-primary', 'onPrimary'],
  ['primary-container', 'primaryContainer'],
  ['on-primary-container', 'onPrimaryContainer'],
  ['inverse-primary', 'inversePrimary'],
  ['secondary', 'secondary'],
  ['on-secondary', 'onSecondary'],
  ['secondary-container', 'secondaryContainer'],
  ['on-secondary-container', 'onSecondaryContainer'],
  ['tertiary', 'tertiary'],
  ['on-tertiary', 'onTertiary'],
  ['tertiary-container', 'tertiaryContainer'],
  ['on-tertiary-container', 'onTertiaryContainer'],
  ['error', 'error'],
  ['on-error', 'onError'],
  ['error-container', 'errorContainer'],
  ['on-error-container', 'onErrorContainer'],
  ['primary-fixed', 'primaryFixed'],
  ['primary-fixed-dim', 'primaryFixedDim'],
  ['on-primary-fixed', 'onPrimaryFixed'],
  ['on-primary-fixed-variant', 'onPrimaryFixedVariant'],
  ['secondary-fixed', 'secondaryFixed'],
  ['secondary-fixed-dim', 'secondaryFixedDim'],
  ['on-secondary-fixed', 'onSecondaryFixed'],
  ['on-secondary-fixed-variant', 'onSecondaryFixedVariant'],
  ['tertiary-fixed', 'tertiaryFixed'],
  ['tertiary-fixed-dim', 'tertiaryFixedDim'],
  ['on-tertiary-fixed', 'onTertiaryFixed'],
  ['on-tertiary-fixed-variant', 'onTertiaryFixedVariant']
]

// M3'te bulunmayan ama Vuetify/uygulamanın kullandığı ek semantik renkler.
const EXTRA: Record<ThemeMode, Record<string, string>> = {
  light: { success: '#2E7D32', warning: '#ED6C02', info: '#0277BD' },
  dark: { success: '#66BB6A', warning: '#FFB74D', info: '#4FC3F7' }
}

function genColors(seedHex: string, scheme: SchemeKey, isDark: boolean, contrast: ThemeContrast): Record<string, string> {
  const Ctor = SCHEMES[scheme]
  const s = new Ctor(Hct.fromInt(argbFromHex(seedHex)), isDark, CONTRAST_LEVEL[contrast])
  const colors: Record<string, string> = {}
  for (const [key, role] of TOKENS) {
    const dyn = MaterialDynamicColors[role] as { getArgb(scheme: DynamicScheme): number }
    colors[key] = hexFromArgb(dyn.getArgb(s))
  }
  Object.assign(colors, EXTRA[isDark ? 'dark' : 'light'])
  return colors
}

function def(seedHex: string, scheme: SchemeKey, isDark: boolean, contrast: ThemeContrast): ThemeDefinition {
  return {
    dark: isDark,
    colors: genColors(seedHex, scheme, isDark, contrast),
    variables: {
      'border-color': isDark ? '#FFFFFF' : '#000000',
      'border-opacity': isDark ? 0.16 : 0.12,
      'overlay-background': '#181d14'
    }
  }
}

/** 6 tema adı → tanımı üretir (Vuetify theme.themes yapısına uygun). */
export function buildThemes(seedHex: string, scheme: SchemeKey): Record<string, ThemeDefinition> {
  return {
    light: def(seedHex, scheme, false, 'standard'),
    'light-medium-contrast': def(seedHex, scheme, false, 'medium'),
    'light-high-contrast': def(seedHex, scheme, false, 'high'),
    dark: def(seedHex, scheme, true, 'standard'),
    'dark-medium-contrast': def(seedHex, scheme, true, 'medium'),
    'dark-high-contrast': def(seedHex, scheme, true, 'high')
  }
}

/** Mode + kontrast → aktif tema adı. */
export function themeName(mode: ThemeMode, contrast: ThemeContrast): string {
  const suffix = contrast === 'medium' ? '-medium-contrast' : contrast === 'high' ? '-high-contrast' : ''
  return mode + suffix
}

/** Üretilen 6 temayı, çalışan Vuetify örneğinin temalarına canlı olarak uygular. */
export function applyThemes(
  vuetifyThemes: Record<string, ThemeDefinition>,
  seedHex: string,
  scheme: SchemeKey
): void {
  const built = buildThemes(seedHex, scheme)
  for (const [name, d] of Object.entries(built)) {
    const target = vuetifyThemes[name]
    if (target) {
      target.dark = d.dark
      target.colors = { ...target.colors, ...d.colors }
      target.variables = { ...target.variables, ...d.variables }
    } else {
      vuetifyThemes[name] = d
    }
  }
}

export interface ThemeFonts {
  heading: string
  body: string
  rootSize: number
}

const SYSTEM_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Yazı tipi seçenekleri (Ayarlar → Temalar → Yazı tipleri). */
export const FONT_OPTIONS: { value: string; title: string }[] = [
  { value: 'system', title: 'Sistem' },
  { value: 'Roboto', title: 'Roboto' },
  { value: 'Arial', title: 'Arial' },
  { value: 'Georgia', title: 'Georgia' },
  { value: 'Times New Roman', title: 'Times New Roman' },
  { value: 'Courier New', title: 'Courier New (monospace)' }
]

function fontStack(value: string): string {
  if (value === 'system') return SYSTEM_STACK
  const generic = value === 'Courier New' ? 'monospace' : value === 'Georgia' || value === 'Times New Roman' ? 'serif' : 'sans-serif'
  return `'${value}', ${generic}`
}

/** Yazı tiplerini CSS değişkenleri + kök yazı boyutu ile uygular. */
export function applyFonts(fonts: ThemeFonts): void {
  const root = document.documentElement
  root.style.setProperty('--ferro-font-body', fontStack(fonts.body))
  root.style.setProperty('--ferro-font-heading', fontStack(fonts.heading))
  root.style.fontSize = `${fonts.rootSize}px`
}
