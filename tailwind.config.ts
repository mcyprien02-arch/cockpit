import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0f1117",
        surface: "#1a1d27",
        surfaceAlt: "#222632",
        border: "#2a2e3a",
        accent: "#00d4aa",
        danger: "#ff4d6a",
        warn: "#ffb347",
        blue: "#4da6ff",
        purple: "#a78bfa",
        textMuted: "#8b8fa3",
        textDim: "#555a6e",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
