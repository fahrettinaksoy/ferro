import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import pluginVuetify from 'eslint-plugin-vuetify'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      '**/*.timestamp-*',
      '.vite/**'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // .vue dosyalarında <script lang="ts"> için TS parser
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser }
    }
  },

  // Node ortamı (yardımcı script'ler + testler). Yerel çekirdek artık Rust'ta.
  {
    files: ['scripts/**/*.mjs', 'test/**/*.ts', '*.config.{ts,mjs}', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node } }
  },

  // Renderer: tarayıcı ortamı
  {
    files: ['src/renderer/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser } }
  },

  // Vuetify 4: deprecated prop/component/slot kullanımını yakalar (yalnızca renderer .vue).
  ...pluginVuetify.configs['flat/recommended-v4'].map((c) => ({
    ...c,
    files: ['src/renderer/**/*.vue']
  })),

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true }
      ],
      // App.vue, MainView.vue gibi yerleşik adlandırmalara izin ver
      'vue/multi-word-component-names': 'off'
    }
  },

  // Düz JS dosyalarında TS'e özgü kurallar uygulanmaz
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },

  // Prettier ile çakışan tüm biçimlendirme kurallarını kapat (en sonda olmalı)
  prettier
)
