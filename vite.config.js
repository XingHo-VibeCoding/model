import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 技术路线见 TECH_DESIGN.md §3.1：
// React + Vite 打包成纯静态文件 → 无后端 → 数据存浏览器 localStorage → 部署到静态托管
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
