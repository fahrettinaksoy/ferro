<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@renderer/stores/ui'
import {
  SCHEME_OPTIONS,
  FONT_OPTIONS,
  type ThemeContrast,
  type ThemeFonts
} from '@renderer/lib/theme'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()
const ui = useUiStore()

// Seçenek başlıkları i18n anahtarından çözülür (lib katmanı sabit metin tutmaz).
const schemeItems = computed(() =>
  SCHEME_OPTIONS.map((o) => ({ value: o.value, title: t(o.titleKey) }))
)
const fontItems = computed(() =>
  FONT_OPTIONS.map((o) =>
    o.value === 'system' ? { value: o.value, title: t('themeOptions.fontSystem') } : o
  )
)

// ── Tema Studio (Ayarlar → Arayüz → Temalar) — canlı uygular ──
const contrastOptions = computed<{ value: ThemeContrast; icon: string; title: string }[]>(() => [
  { value: 'standard', icon: 'mdi-brightness-7', title: t('settings.themesPage.contrastStandard') },
  { value: 'medium', icon: 'mdi-brightness-6', title: t('settings.themesPage.contrastMedium') },
  { value: 'high', icon: 'mdi-brightness-5', title: t('settings.themesPage.contrastHigh') }
])
function setFontField(field: keyof ThemeFonts, value: string | number): void {
  ui.setFonts({ ...ui.fonts, [field]: value })
}
function onSeedInput(v: string): void {
  const hex = (v ?? '').trim()
  if (/^#?[0-9a-fA-F]{6}$/.test(hex)) ui.setThemeSeed(hex.startsWith('#') ? hex : '#' + hex)
}
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz → Temalar (Material Design 3 Theme Studio — canlı) -->
  <!-- COLORS -->
  <fieldset class="section">
    <legend>{{ $t('settings.themesPage.colorsTitle') }}</legend>
    <div class="d-flex align-center ga-3">
      <v-menu :close-on-content-click="false">
        <template #activator="{ props: menuProps }">
          <div v-bind="menuProps" class="color-swatch" :style="{ background: ui.themeSeed }" />
        </template>
        <v-color-picker
          :model-value="ui.themeSeed"
          mode="hex"
          :modes="['hex']"
          @update:model-value="ui.setThemeSeed($event as unknown as string)"
        />
      </v-menu>
      <v-text-field
        :model-value="ui.themeSeed"
        :label="$t('settings.themesPage.primaryLabel')"
        style="max-width: 180px"
        @update:model-value="onSeedInput($event)"
      />
    </div>
  </fieldset>

  <!-- SCHEME -->
  <fieldset class="section">
    <legend>{{ $t('settings.themesPage.schemeTitle') }}</legend>
    <v-select
      :model-value="ui.themeScheme"
      :items="schemeItems"
      :label="$t('settings.themesPage.schemeLabel')"
      prepend-inner-icon="mdi-palette-swatch"
      @update:model-value="ui.setThemeScheme($event)"
    />
  </fieldset>

  <!-- VARIANT & CONTRAST -->
  <fieldset class="section">
    <legend>{{ $t('settings.themesPage.variantTitle') }}</legend>
    <div class="d-flex ga-6 flex-wrap">
      <div>
        <div class="text-caption text-medium-emphasis mb-1">{{ $t('settings.theme') }}</div>
        <v-btn-toggle
          :model-value="ui.themeMode"
          mandatory
          density="comfortable"
          variant="outlined"
          divided
          @update:model-value="ui.setThemeMode($event)"
        >
          <v-btn value="light" prepend-icon="$themeLight">{{ $t('settings.light') }}</v-btn>
          <v-btn value="dark" prepend-icon="$themeDark">{{ $t('settings.dark') }}</v-btn>
        </v-btn-toggle>
      </div>
      <div>
        <div class="text-caption text-medium-emphasis mb-1">
          {{ $t('settings.themesPage.contrastLabel') }}
        </div>
        <v-btn-toggle
          :model-value="ui.themeContrast"
          mandatory
          density="comfortable"
          variant="outlined"
          divided
          @update:model-value="ui.setThemeContrast($event)"
        >
          <v-btn
            v-for="c in contrastOptions"
            :key="c.value"
            :value="c.value"
            :prepend-icon="c.icon"
          >
            {{ c.title }}
          </v-btn>
        </v-btn-toggle>
      </div>
    </div>
  </fieldset>

  <!-- FONTS -->
  <fieldset class="section">
    <legend>{{ $t('settings.themesPage.fontsTitle') }}</legend>
    <div class="d-flex ga-2 flex-wrap">
      <v-select
        :model-value="ui.fonts.heading"
        :items="fontItems"
        :label="$t('settings.themesPage.headingFont')"
        style="min-width: 200px"
        @update:model-value="setFontField('heading', $event)"
      />
      <v-select
        :model-value="ui.fonts.body"
        :items="fontItems"
        :label="$t('settings.themesPage.bodyFont')"
        style="min-width: 200px"
        @update:model-value="setFontField('body', $event)"
      />
      <v-text-field
        :model-value="ui.fonts.rootSize"
        :label="$t('settings.themesPage.fontSizeRoot')"
        type="number"
        min="10"
        max="24"
        style="max-width: 130px"
        @update:model-value="setFontField('rootSize', Number($event) || 16)"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-3">
      <span class="field-label">{{ $t('settings.themesPage.scaleLabel') }}</span>
      <v-text-field
        v-model.number="draft.appearance.scaleFactor"
        type="number"
        min="0.5"
        max="3"
        step="0.25"
        style="max-width: 110px"
      />
    </div>
  </fieldset>

  <!-- Önizleme (aktif tema) -->
  <fieldset class="section">
    <legend>{{ $t('settings.themesPage.previewLabel') }}</legend>
    <div class="theme-preview pa-3">
      <div class="text-h6 mb-1">{{ $t('settings.themesPage.previewSample') }}</div>
      <div class="text-body-2 mb-2 text-medium-emphasis">
        {{ ui.themeSeed }} · {{ ui.themeMode }} · {{ ui.themeContrast }}
      </div>
      <div class="d-flex ga-2 flex-wrap">
        <v-chip color="primary" size="small" label>primary</v-chip>
        <v-chip color="secondary" size="small" label>secondary</v-chip>
        <v-chip color="tertiary" size="small" label>tertiary</v-chip>
        <v-chip color="success" size="small" label>success</v-chip>
        <v-chip color="warning" size="small" label>warning</v-chip>
        <v-chip color="error" size="small" label>error</v-chip>
      </div>
    </div>
  </fieldset>
</template>
