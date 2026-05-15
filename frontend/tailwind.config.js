/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        coral: '#E8352A',
        coralLight: '#FEF0EF',
        blurple: '#5865F2',
        blurpleLight: '#EEF0FE',
        blurpleHover: '#4752C4',
        amber: '#F59E0B',
        amberLight: '#FFFBEB',
        blue: '#3B82F6',
        blueLight: '#EFF6FF',
        partnerB: '#222222',
        green: '#10B981',
        dark: '#222222',
        mid: '#717171',
        light: '#B0B0B0',
        border: '#DDDDDD',
        bg: '#F7F7F7',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
        'card-hover': '0 2px 4px rgba(0,0,0,0.18), 0 8px 28px rgba(0,0,0,0.12)',
        drawer: '-4px 0 24px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
