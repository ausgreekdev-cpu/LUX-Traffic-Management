/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        lux: {
          50: '#fef3e2',
          100: '#fde4b9',
          200: '#fcd48c',
          300: '#fbc35f',
          400: '#f9a825',
          500: '#f57f17',
          600: '#e65100',
          700: '#bf360c',
          800: '#8b2500',
          900: '#4e1600'
        }
      }
    }
  },
  plugins: []
};
