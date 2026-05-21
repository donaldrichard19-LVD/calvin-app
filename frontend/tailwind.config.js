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
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px) rotate(-3deg)' },
          '50%': { transform: 'translateY(-14px) rotate(3deg)' },
        },
        scalePop: {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.55s ease-out both',
        'fade-in': 'fadeIn 0.5s ease-out both',
        'float': 'float 3.2s ease-in-out infinite',
        'float-slow': 'floatSlow 4.5s ease-in-out infinite',
        'scale-pop': 'scalePop 0.45s cubic-bezier(0.34,1.56,0.64,1) both',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
