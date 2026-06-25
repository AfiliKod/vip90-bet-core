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
        'gem-pop':     'gemPop 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards',
        'mine-flash':  'mineFlash 0.35s ease-out forwards',
        'win-wave':    'winWave 0.6s ease-in-out',
        'astro-hover':  'astrotremor 0.18s ease-in-out',
        'blast-flash':  'blastFlash 0.8s ease-out forwards',
        'win-flash':    'winFlash 1.2s ease-out forwards',
        'balloon':      'balloon 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards',
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
        gemPop:    { '0%': { transform: 'scale(0.25)', opacity: '0' }, '70%': { transform: 'scale(1.2)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        mineFlash: { '0%': { filter: 'brightness(1)' }, '20%': { filter: 'brightness(3)' }, '50%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)', filter: 'brightness(1)' } },
        winWave:   { '0%,100%': { boxShadow: '0 0 0 rgba(251,191,36,0)' }, '50%': { boxShadow: '0 0 24px rgba(251,191,36,0.8)' } },
        astrotremor: { '0%,100%': { transform: 'scale(1.05)' }, '33%': { transform: 'scale(1.05) rotate(0.6deg)' }, '66%': { transform: 'scale(1.05) rotate(-0.5deg)' } },
        blastFlash: {
          '0%':   { opacity: '1' },
          '40%':  { opacity: '0.85' },
          '100%': { opacity: '0' },
        },
        balloon: {
          '0%':   { transform: 'scale(0.22) translateY(10px)', opacity: '0' },
          '68%':  { transform: 'scale(1.07) translateY(-2px)', opacity: '1' },
          '100%': { transform: 'scale(1)    translateY(0)',    opacity: '1' },
        },
        winFlash: {
          '0%':   { opacity: '0', transform: 'scale(0.85)' },
          '25%':  { opacity: '1', transform: 'scale(1.05)' },
          '60%':  { opacity: '0.7' },
          '100%': { opacity: '0', transform: 'scale(1)' },
        },
      },
    }
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.no-scrollbar::-webkit-scrollbar': { display: 'none' },
        '.no-scrollbar': { '-ms-overflow-style': 'none', 'scrollbar-width': 'none' },
      });
    }
  ]
}

