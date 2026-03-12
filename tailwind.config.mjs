/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#FFFFFF',
          surface: '#F9FAFB',
          border: '#E5E7EB',
          'border-light': '#F3F4F6',
          primary: '#0D9488',
          'primary-light': '#CCFBF1',
          secondary: '#115E59',
          heading: '#1A1A1A',
          text: '#4B5563',
          warning: '#F59E0B',
          success: '#10B981',
          danger: '#EF4444',
        },
      },
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
