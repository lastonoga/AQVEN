import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const WF_DEV_SERVER = "http://127.0.0.1:5180"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      "/api": { target: WF_DEV_SERVER, changeOrigin: false },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
})
