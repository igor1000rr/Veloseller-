/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tinted фон, спокойная палитра для b2b-дашборда
        brand: {
          DEFAULT: "#0F766E",   // teal-700
          fg: "#F0FDFA",
          50:  "#F0FDFA",
          100: "#CCFBF1",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          900: "#134E4A",
        },
      },
    },
  },
  plugins: [],
};
