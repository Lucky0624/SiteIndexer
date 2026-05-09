/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          dark: "#0d1117",
          mid: "#161b22",
          card: "#1c2128",
        },
        accent: {
          DEFAULT: "#2563eb",
          hover: "#3b82f6",
          dim: "rgba(37,99,235,0.15)",
        },
        rim: "#30363d",
        muted: "#8b949e",
        danger: "#f85149",
        warn: "#d29922",
        success: "#3fb950",
      },
    },
  },
  plugins: [],
};
