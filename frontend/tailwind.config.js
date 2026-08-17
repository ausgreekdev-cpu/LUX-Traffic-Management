/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // The lux ramp is driven by CSS custom properties injected at runtime by
        // the Branding engine (backend GET /api/branding -> BrandingProvider).
        // Defaults live in :root in index.css and match the original palette, so
        // an unconfigured deployment is byte-for-byte identical to before.
        lux: {
          50: 'rgb(var(--lux-50) / <alpha-value>)',
          100: 'rgb(var(--lux-100) / <alpha-value>)',
          200: 'rgb(var(--lux-200) / <alpha-value>)',
          300: 'rgb(var(--lux-300) / <alpha-value>)',
          400: 'rgb(var(--lux-400) / <alpha-value>)',
          500: 'rgb(var(--lux-500) / <alpha-value>)',
          600: 'rgb(var(--lux-600) / <alpha-value>)',
          700: 'rgb(var(--lux-700) / <alpha-value>)',
          800: 'rgb(var(--lux-800) / <alpha-value>)',
          900: 'rgb(var(--lux-900) / <alpha-value>)'
        }
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        map: ['var(--font-map)']
      }
    }
  },
  plugins: []
};
