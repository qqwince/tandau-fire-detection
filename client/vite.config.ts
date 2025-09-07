import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'


export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': '/src' } },
  server: { port: 3000 },
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://127.0.0.1:8000'),
  },
})