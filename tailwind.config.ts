import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        luna: {
          bg: '#f0f7ff',
          accent: '#3b82f6',
          accentDark: '#2563eb',
          green: '#22c55e',
          greenDark: '#16a34a',
          red: '#ef4444',
          gray: '#cbd5e1',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
