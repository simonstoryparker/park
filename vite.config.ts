import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  const base = pages ? process.env.PAGES_BASE_PATH || '/park/' : '/';
  return {
    base,
    define: { 'import.meta.env.VITE_LOCAL_ONLY': JSON.stringify(pages ? 'true' : 'false') },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Park',
          short_name: 'Park',
          description: 'A place to leave ideas',
          theme_color: '#346d83',
          background_color: '#e9eee5',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
      }),
    ],
    server: { proxy: { '/api': 'http://localhost:8787' } },
  };
});
