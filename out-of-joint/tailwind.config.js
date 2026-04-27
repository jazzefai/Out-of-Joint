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
        body: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        ink: "#0a0a0f",
        paper: "#f0ede8",
        accent: "#e8401c",
        muted: "#6b6b7b",
        grid: "#1e1e2e",
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
