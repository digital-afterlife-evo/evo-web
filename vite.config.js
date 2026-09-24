import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { conversationGateway } from './server/gateway.js';

export default defineConfig(({ mode }) => {
  const local = loadEnv(mode, process.cwd(), 'BACKEND_');
  const backend = loadEnv(mode, fileURLToPath(new URL('../evo-backend/', import.meta.url)), 'BACKEND_');
  const token = process.env.BACKEND_WEB_TOKEN || local.BACKEND_WEB_TOKEN || backend.BACKEND_WEB_TOKEN;
  const target = process.env.BACKEND_URL || local.BACKEND_URL || 'http://127.0.0.1:3000';
  return {
    plugins: [react(), conversationGateway({ target, token })],
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: ['wages-habits-memo-standards.trycloudflare.com'],
    },
    preview: { port: 4173, strictPort: true },
  };
});
