import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        /*
         * Signal palette. Pulled back off neon: these mark a verdict's meaning,
         * and a set of fluorescent hexes on a dark ground is exactly the
         * generated-crypto-dashboard look the redesign is getting rid of. Still
         * unambiguously distinguishable from each other, which is the only job
         * they have.
         */
        coil: '#dc4638',
        trap: '#5b87d6',
        apex: '#25c183',
        warn: '#cf9020',
        hud: '#8aa9a0',
      },
      /*
       * Every corner scale collapses to --radius (0). Overriding xl/2xl as well
       * is what actually flattens the app: components reach for rounded-xl by
       * habit, and leaving Tailwind's built-in 0.75rem in place would keep the
       * soft-card look on the very panels the redesign is meant to square off.
       * `rounded-full` is deliberately untouched — dots and avatars are circles.
       */
      borderRadius: {
        sm: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius)',
        xl: 'var(--radius)',
        '2xl': 'var(--radius)',
        '3xl': 'var(--radius)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        sweep: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(200%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(0,224,138,0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(0,224,138,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(0,224,138,0)' },
        },
        flicker: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        sweep: 'sweep 3.5s linear infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        flicker: 'flicker 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
