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
        'marquee':       'marquee 30s linear infinite',
        'fade-in':       'fadeIn 0.2s ease-out',
        'slide-up':      'slideUp 0.15s ease-out',
        'crash-shake':   'crashShake 0.55s ease-in-out',
        'mult-tick':     'multTick 0.22s ease-out',
        'pulse-glow':    'pulseGlow 1.4s ease-in-out infinite',
        'float':         'float 3.2s ease-in-out infinite',
        'fade-up':       'fadeUp 0.3s ease-out',
        'countdown-ring':'countdownRing 1s linear',
      },
      keyframes: {
        marquee:     { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        fadeIn:      { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shrink:      { '0%': { width: '100%' }, '100%': { width: '0%' } },
        slideUp:     { from: { opacity: '0', transform: 'translateY(6px) scale(0.97)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        crashShake:  {
          '0%,100%': { transform: 'translate(0,0) rotate(0deg)' },
          '15%':     { transform: 'translate(-5px,-2px) rotate(-0.5deg)' },
          '30%':     { transform: 'translate(5px, 2px) rotate( 0.5deg)' },
          '45%':     { transform: 'translate(-4px,-1px) rotate(-0.3deg)' },
          '60%':     { transform: 'translate(4px, 1px) rotate( 0.3deg)' },
          '75%':     { transform: 'translate(-2px, 0px)' },
        },
        multTick:    { '0%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)' } },
        pulseGlow:   {
          '0%,100%': { boxShadow: '0 0 16px rgba(34,197,94,0.35)' },
          '50%':     { boxShadow: '0 0 42px rgba(34,197,94,0.75), 0 0 80px rgba(34,197,94,0.2)' },
        },
        float:       { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-5px)' } },
        fadeUp:      { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        countdownRing: { from: { strokeDashoffset: '0' }, to: { strokeDashoffset: '100' } },
      },
    }
  },
  plugins: []
}

