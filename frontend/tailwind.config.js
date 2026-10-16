/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#effaf8", 100: "#d7f1ec", 200: "#a9e0d6", 500: "#14897a",
          600: "#0f766e", 700: "#0d5f59", 800: "#0c4b47", 900: "#0a3633",
        },
        ink: { DEFAULT: "#16232e", soft: "#3d4d5a", mute: "#5f6f7c" },
        line: "#dfe5ea",
        paper: "#f6f8f9",
      },
    },
  },
  plugins: [],
};
