/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0B0F",
        panel: "#12121A",
        panel2: "#181822",
        border: "#2A2A36",
        muted: "#9A9AAB",
        text: "#F4F4F7",
        accent: "#A855F7",
        accent2: "#D946EF",
        brand: "#FF6600",
        success: "#22C55E",
        warn: "#F59E0B",
      },
      boxShadow: {
        glow: "0 0 40px rgba(168, 85, 247, 0.25)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
