/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans:    ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Spotlight — lime-зелёный, акцент landing'а
        lime: {
          DEFAULT: "#a3e635",
          soft:    "rgba(163, 230, 53, 0.12)",
          bright:  "#d4ff5c",
        },
        ink: {
          900: "#0a0d0a",
          800: "#0f1310",
          700: "#161c18",
          600: "#1f2a23",
          500: "#2a3830",
        },
        mist: {
          50:  "#f4f7f3",
          200: "#d4dcd6",
          400: "#7a8b80",
          600: "#4b5a52",
        },
        // Brand teal сохраняем для dashboard/admin
        brand: {
          DEFAULT: "#0F766E",
          fg: "#F0FDFA",
          50:  "#F0FDFA",
          100: "#CCFBF1",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          900: "#134E4A",
        },
      },
      animation: {
        "fade-up": "fade-up 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};
