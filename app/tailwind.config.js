/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#09090B",
        panel: "#111113",
        panel2: "#18181B",
        border: "rgba(255,255,255,0.08)",
        muted: "#A1A1AA",
        text: "#FAFAFA",
        accent: "#FF6600",
        accent2: "#FF8533",
        brand: "#FF6600",
        success: "#3DDC97",
        warn: "#F5A524",
      },
      boxShadow: {
        glow: "0 0 40px rgba(255, 102, 0, 0.18)",
        soft: "0 1px 0 rgba(255,255,255,0.04) inset",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        label: "0.08em",
      },
    },
  },
  plugins: [],
};
