import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'recharts': ['recharts'],
        },
      },
    },
  },
  server: {
    /**
     * 개발 환경 프록시
     *
     * `vercel dev` (포트 3000) 를 함께 실행하면 /api/* 요청이 자동으로
     * Vercel 서버리스 함수로 전달됩니다.
     *
     * 실행 순서:
     *   1. 터미널 A: vercel dev        (서버리스 함수 + 내장 Vite 서버)
     *   2. 터미널 B: npm run dev       (Vite HMR 개발 서버, 포트 5173)
     *
     * 또는 `vercel dev` 만 실행하면 두 역할을 동시에 처리합니다.
     */
    proxy: {
      '/api': {
        target:       'http://localhost:3000',
        changeOrigin: true,
        rewrite:      (path) => path,
      },
    },
  },
})
