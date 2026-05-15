/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        lime: {
          DEFAULT: "#84cc16",
          bright:  "#a3e635",
          deep:    "#4d7c0f",
          soft:    "rgba(77, 124, 15, 0.08)",
        },
        forest:  "#365f3e",
        paper:   "#ffffff",
        bg:      "#f5f3eb",
        "bg-soft": "#ebe8db",
        ink: {
          DEFAULT: "#0a1410",
          soft:    "#1f2d24",
          muted:   "#5a6b5f",
          hush:    "#8a958a",
        },
        line:    "#e1ddd0",
        "line-2":"#cdc8b8",
        orange:  "#c2410c",
        rose:    "#9f1239",
        azure:   "#0369a1",
        brand: {
          DEFAULT: "#4d7c0f",
          fg:  "#ffffff",
          50:  "#f7fee7",
          100: "#ecfccb",
          500: "#84cc16",
          600: "#65a30d",
          700: "#4d7c0f",
          900: "#1a2e05",
        },
      },
    },
  },
  plugins: [],
};
