import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    // *.unit.test.ts altyapısız koşar; *.integration.test.ts Docker sunucuları ister
    // (npm run test:unit / test:integration ayrımı package.json'da).
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // Kapsam ana süreç motoru + paylaşılan sözleşme üzerinden ölçülür;
      // Electron kabuğu (index.ts, updater) ve renderer UI hariçtir.
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/main/index.ts', 'src/main/core/updater.ts'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage'
    }
  }
})
