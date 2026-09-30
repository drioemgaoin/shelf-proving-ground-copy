import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal Vite setup: serves the React shell for `npm run dev`.
export default defineConfig({
  plugins: [react()],
});
