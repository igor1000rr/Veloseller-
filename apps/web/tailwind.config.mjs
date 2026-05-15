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
        // Spotlight — lime accent
        lime: {
          DEFAULT: "#84cc16",
          bright:  "#a3e635",
          deep:    "#4d7c0f",
          soft:    "rgba(132, 204, 22, 0.10)",
        },
        // Light surfaces
        paper:  "#ffffff",
        bg:     "#fafaf6",
        "bg-soft": "#f3f4ed",
        ink: {
          DEFAULT: "#0a0d0a",
          soft:    "#1f2a23",
          muted:   "#525a4e",
          hush:    "#8a948a",
        },
        line:   "#e6e9de",
        "line-2": "#d4d8cd",
        // Сигнальные
        orange: "#f97316",
        rose:   "#e11d48",
        azure:  "#0ea5e9",
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
    },
  },
  plugins: [],
};
