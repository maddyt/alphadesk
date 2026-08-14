import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1B2A4A', steel: '#4A6FA5', gold: '#C5A55A',
        pos: '#27AE60', neg: '#C0392B',
        ink: '#22302C', muted: '#6B7A74', rule: '#E1E6E3',
        surface: '#FFFFFF', canvas: '#F7F8F6', accent: '#0E6E5E',
      },
      fontFamily: { serif: ['Georgia', 'Times New Roman', 'serif'], mono: ['Consolas', 'SF Mono', 'monospace'] },
    },
  },
  plugins: [],
} satisfies Config;
