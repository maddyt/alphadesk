import type { Config } from 'tailwindcss';

// Institutional dark theme (Bloomberg / FactSet feel). Colours are CSS variables so
// the light tear-sheet theme can swap them without touching component classes.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        sub: 'rgb(var(--sub) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        mark: 'rgb(var(--mark) / <alpha-value>)',
        up: 'rgb(var(--up) / <alpha-value>)',
        down: 'rgb(var(--down) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        grow: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        fadeup: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        pulseline: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        scan: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
      },
      animation: {
        grow: 'grow 900ms cubic-bezier(.2,.8,.2,1) both',
        fadeup: 'fadeup 500ms ease-out both',
        pulseline: 'pulseline 2.4s ease-in-out infinite',
        scan: 'scan 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
