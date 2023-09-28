import { defineConfig } from 'vite';

export default ({ mode }) => {
  const isProduction = mode === 'production';

  return defineConfig({
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  });
};
