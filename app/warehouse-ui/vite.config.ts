import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolveApiProxy } from './src/shared/config/api-proxy.ts'

export default defineConfig(({ mode, command }) => {
  // loadEnv đọc cả .env lẫn biến môi trường của process (process thắng).
  const proxy = resolveApiProxy(loadEnv(mode, process.cwd(), 'VITE_'), { mode, command })

  return {
    plugins: [react(), tailwindcss()],
    resolve: { tsconfigPaths: true },
    server: { port: 5175, strictPort: true, proxy },
    preview: { proxy },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
                priority: 40,
              },
              { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/, priority: 30 },
              {
                name: 'ui',
                test: /node_modules[\\/](radix-ui|@radix-ui|lucide-react|cmdk)[\\/]/,
                priority: 20,
              },
              {
                name: 'date',
                test: /node_modules[\\/](react-day-picker|date-fns)[\\/]/,
                priority: 20,
              },
              {
                name: 'i18n',
                test: /node_modules[\\/](i18next|i18next-browser-languagedetector|react-i18next)[\\/]/,
                priority: 20,
              },
              { name: 'vendor', test: /node_modules/, priority: 10 },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/shared/test/setup.ts', './src/app/test-setup.ts'],
      css: false,
      env: {
        VITE_API_BASE_URL: 'http://localhost:8085/api/v1',
      },
      coverage: {
        provider: 'v8',
        reporter: ['text-summary'],
        // Ngưỡng = mức đo lại sau giai đoạn 2 (2026-09-17), làm tròn xuống. Chỉ để chặn tụt lùi,
        // không phải mục tiêu — đừng hạ ngưỡng để cho qua.
        thresholds: {
          statements: 86,
          branches: 78,
          functions: 71,
          lines: 87,
        },
      },
    },
  }
})
