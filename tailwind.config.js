/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0A0C12',
          card: '#12151F',
          panel: '#171B26',
          border: '#252A38',
          text: '#E6E8EE',
          muted: '#8B92A3',
        },
        accent: {
          green: '#22C55E',
          blue: '#3B82F6',
          amber: '#F59E0B',
          red: '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
