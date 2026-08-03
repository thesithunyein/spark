/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0C0B0A",
        panel: "#161311",
        panel2: "#1E1A17",
        border: "#2F2924",
        muted: "#A39A92",
        text: "#FFF8F3",
        accent: "#FF6600",
        accent2: "#FF8533",
        brand: "#FF6600",
        success: "#22C55E",
        warn: "#F59E0B",
      },
      boxShadow: {
        glow: "0 0 48px rgba(255, 102, 0, 0.28)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
