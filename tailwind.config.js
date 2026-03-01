/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#b9defe',
          300: '#7cc2fd',
          400: '#36a2f8',
          500: '#40a7e3', // Secondary blue
          600: '#3390ec', // MAIN Telegram Desktop Blue
          700: '#2883d7',
          800: '#1d6bb3',
          900: '#185a94',
          950: '#144c7c',
        },
        green: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ccb62', // Modern Telegram Online/Success Green
          500: '#33cc44', // Classic Telegram Success Green
          600: '#22a633',
          700: '#1a8229',
          800: '#166521',
          900: '#14531d',
          950: '#052e10',
        },
        telegram: {
          bg: {
            light: '#d4e4d5',
            dark: '#0e1118',
          },
          side: {
            nav: '#1c2025', // Far left narrow sidebar
            list: {
              light: '#ffffff',
              dark: '#0e1621', // Main chat list background
            },
          },
          hover: {
            light: '#f1f1f1',
            dark: '#232e3c',
          },
          bubble: {
            out: {
              light: '#effdde',
              dark: '#2b5278',
            },
            in: {
              light: '#ffffff',
              dark: '#182533',
            },
          },
        },
      },
    },
  },
  plugins: [],
};
