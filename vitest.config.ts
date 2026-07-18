import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src')
    }
  },
  test: {
    environment: 'node',
    // Paylaşılan (protokol-agnostik) TS sözleşmesi testleri. Yerel çekirdek artık
    // Rust'ta olduğundan protokol/kripto testleri `cargo test` tarafına taşındı;
    // Vue bileşen testleri vitest.config.component.ts ile koşar.
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage'
    }
  }
})
