import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        eti: {
          navy: '#0A192F',
          navyLight: '#112240',
          orange: '#FF6B00',
          yellow: '#FFB800',
        },
      },
    },
  },
  plugins: [],
};

export default config;
