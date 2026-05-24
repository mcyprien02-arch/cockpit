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
        // Easycash brand
        ec: {
          red:    "#E30613",
          hover:  "#B8050F",
          dark:   "#1A0A0C",
          light:  "#FFF5F5",
          border: "#FFCDD1",
        },
        // Light theme tokens
        bg: "#FFFFFF",
        surface: "#F5F5F5",
        surfaceAlt: "#F0F0F0",
        border: "#E0E0E0",
        accent: "#E30613",
        danger: "#DC2626",
        warn: "#F59E0B",
        blue: "#3B82F6",
        purple: "#7C3AED",
        textMuted: "#6B7280",
        textDim: "#9CA3AF",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
