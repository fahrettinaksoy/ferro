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
    // Entegrasyon testleri Docker sunucuları gerektirir; varsayılan olarak çalıştırılır.
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
})
