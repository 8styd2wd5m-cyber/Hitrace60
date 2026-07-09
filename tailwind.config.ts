import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hitrace: {
          black: '#101114',
          red: '#e23d3d',
          lime: '#b7f34a',
          steel: '#e8ecef',
        },
      },
    },
  },
  plugins: [],
};

export default config;
