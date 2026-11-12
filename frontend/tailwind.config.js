/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14231f',
        muted: '#64746f',
        canvas: '#f4f6f3',
        forest: { 50: '#edf7f2', 100: '#dcece4', 500: '#16745f', 600: '#0f5c4d', 700: '#0a493e', 900: '#082e28' },
        saffron: { 50: '#fff8e8', 100: '#ffefc4', 400: '#f6b73c', 500: '#f2a516', 600: '#d78a06' },
      },
      fontFamily: { sans: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(13, 42, 34, .03), 0 8px 30px rgba(13, 42, 34, .035)',
        float: '0 18px 50px rgba(8, 46, 40, .18)',
      },
      animation: {
        'soft-pulse': 'softPulse 2.4s ease-in-out infinite',
        'slide-up': 'slideUp .25s ease-out',
        scan: 'scan 2s ease-in-out infinite',
      },
      keyframes: {
        softPulse: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(242,165,22,.25)' }, '50%': { boxShadow: '0 0 0 9px rgba(242,165,22,0)' } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scan: { '0%, 100%': { top: '8%' }, '50%': { top: '88%' } },
      },
    },
  },
  plugins: [],
};
