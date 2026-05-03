/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Mono'", "monospace"],
        body: ["'Inter'", "sans-serif"],
      },
      colors: {
        ink: "#0D0D0D",
        paper: "#F0F0F0",
        accent: "#E8401C",
        muted: "#555555",
        grid: "#1A1A1A",
        border: "#2A2A2A",
        "stat-e": "#3b82f6",
        "stat-c": "#22c55e",
        "stat-a": "#f59e0b",
      },
      animation: {
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        countdown: "countdown 1s linear",
      },
    },
  },
  plugins: [],
};
