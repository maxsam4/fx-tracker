import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0d10',
        surface: '#13171c',
        edge: '#1f242b',
        text: '#e7ebf0',
        muted: '#7a8693',
        accent: '#7cd4b6',
        warn: '#e3b341',
        bad: '#f97373',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'Arial'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo'],
      },
    },
  },
  plugins: [],
} satisfies Config;
