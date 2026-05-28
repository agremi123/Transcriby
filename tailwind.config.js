/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#F6F1E8',
        ivory2: '#EFE8DA',
        paper: '#FBF8F2',
        navy: '#1A2340',
        navy2: '#0F1733',
        ink: '#10162C',
        wine: '#8B1E2D',
        wine2: '#6E1623',
        rose: '#C9A0A8',
        mist: '#D9D2C2',
        line: '#E4DCC9',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Manrope', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        editorial: '0.18em',
      },
    },
  },
  plugins: [],
};
