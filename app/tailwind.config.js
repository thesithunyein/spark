/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        panel: "#0C0C0E",
        panel2: "#141417",
        border: "rgba(255,255,255,0.14)",
        muted: "rgba(255,255,255,0.62)",
        text: "#FFFFFF",
        accent: "#8B5CF6",
        accent2: "#A78BFA",
        accent3: "#C4B5FD",
        accentDeep: "#7C3AED",
        accentSoft: "rgba(139, 92, 246, 0.12)",
        brand: "#FFFFFF",
        success: "#3DDC97",
        warn: "#F5A524",
      },
      boxShadow: {
        glow: "0 0 40px rgba(255,255,255,0.12)",
        soft: "0 1px 0 rgba(255,255,255,0.04) inset",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Sora", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        label: "0.08em",
        wide2: "0.14em",
        wide3: "0.22em",
      },
    },
  },
  plugins: [],
};
