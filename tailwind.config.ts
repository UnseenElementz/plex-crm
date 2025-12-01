import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#00E6FF',
          neon: '#39FF14'
        }
      },
      boxShadow: {
        glow: '0 0 30px rgba(57,255,20,0.3)'
      },
      backdropBlur: {
        xs: '2px'
      },
      animation: {
        fade: 'fade 200ms ease-in-out'
      },
      keyframes: {
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    }
  },
  darkMode: 'class'
} satisfies Config