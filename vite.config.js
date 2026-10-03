import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 技术路线见 TECH_DESIGN.md §3.1：
// React + Vite 打包成纯静态文件 → 无后端 → 数据存浏览器 localStorage → 部署到静态托管
export default defineConfig({
  plugins: [react()],

  /* 资源用**相对路径**（./assets/...），不用默认的绝对路径（/assets/...）。
     为什么：CloudBase 静态托管把站点放在**子路径**下（我们的地址是 .../chisha/），
     绝对路径会让浏览器去域名根目录找 /assets/... → 404 → 白屏。
     相对路径相对于当前页面解析，放根目录、放子路径都对。
     （Day 15 实测踩到：部署后页面 200 但 JS 404，就是这一条。） */
  base: './',

  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
