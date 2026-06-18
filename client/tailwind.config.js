/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { deep:'#060d1a', base:'#0d1526', card:'#111d30', hover:'#162038' },
        primary: { DEFAULT: 'var(--color-primary)', dark: 'var(--color-primary-dark)' },
        accent: '#7c3aed',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        live: '#ef4444',
        text: { 1:'#f0f4ff', 2:'#8a9bc0', 3:'#4a5a78' },
      },
      animation: {
        'marquee': 'marquee 30s linear infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        fadeIn: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shrink: { '0%': { width: '100%' }, '100%': { width: '0%' } },
      },
    }
  },
  plugins: []
}

