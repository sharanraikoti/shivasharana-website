/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Jost", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        kannada: ['"Baloo Tamma 2"', "Jost", "sans-serif"],
      },
      colors: {
        // Same blues as the visiting card
        brand: {
          50: "#eef5fc", 100: "#d9e8f8", 200: "#b3d0f0", 300: "#84b3e6", 400: "#5596db",
          500: "#2f80cc", 600: "#1d6bb8", 700: "#1d5fa3", 800: "#164a80", 900: "#0f3566", 950: "#0b2545",
        },
        aqua: { 50: "#e6f8fa", 100: "#c2eef3", 200: "#8fe0ea", 300: "#5ee3f2", 400: "#3ec6d8", 500: "#19b5c9", 600: "#0e9aad", 700: "#0e7c8c" },
        ink: { DEFAULT: "#13243a", soft: "#3b4a5e", mute: "#5d6b7d" },
        line: "#dde5ee",
        paper: "#f4f8fc",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,53,102,.06), 0 8px 24px -12px rgba(15,53,102,.18)",
        lift: "0 2px 4px rgba(15,53,102,.08), 0 18px 40px -16px rgba(15,53,102,.35)",
      },
    },
  },
  plugins: [],
};
