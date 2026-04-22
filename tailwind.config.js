/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#0A0A1A',
        },
        brand: {
          50:  '#F0F0FF',
          100: '#E4E4FF',
          200: '#C8C8FF',
          300: '#A8A4FF',
          400: '#8B84FF',
          500: '#6C63FF',
          600: '#5048D6',
          700: '#3D37AE',
          800: '#2D2886',
          900: '#1D1A60',
          950: '#110E3A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans KR', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
