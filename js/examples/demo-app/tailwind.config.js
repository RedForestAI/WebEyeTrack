
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'pulse-ring': {
          '0%, 100%': {
            opacity: '0.3',
            transform: 'translate(-50%, -50%) scale(1)'
          },
          '50%': {
            opacity: '0.6',
            transform: 'translate(-50%, -50%) scale(1.05)'
          }
        }
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    },
  },
  plugins: [
  ],
}