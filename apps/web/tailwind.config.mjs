/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans:    ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        bg:       "#f7f4e9",
        "bg-soft":"#efece1",
        paper:    "#ffffff",
        ink: {
          DEFAULT: "#0a0a08",
          soft:    "#1f2017",
          muted:   "#525249",
          hush:    "#8a8a7e",
        },
        line:     "#e6e3d4",
        "line-2": "#d4d1c0",
        lime: {
          DEFAULT: "#84cc16",
          deep:    "#3f6212",
          soft:    "rgba(132, 204, 22, 0.12)",
        },
        emerald: { DEFAULT: "#065f46" },
        orange:  "#ea580c",
        rose:    "#e11d48",
        azure:   "#0284c7",
        // Brand (для dashboard/admin старых страниц — мостик)
        brand: {
          DEFAULT: "#3f6212",
          fg: "#f7f4e9",
          50:  "#f7faec",
          100: "#ecf3d2",
          500: "#84cc16",
          600: "#65a30d",
          700: "#3f6212",
          900: "#1a2e05",
        },
      },
    },
  },
  plugins: [],
};
