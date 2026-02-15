/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        "fg-sand": "#f7f2e8",
        "fg-ink": "#1a1a1a",
        "fg-olive": "#2f4f3b",
        "fg-rust": "#d76a3b",
        "fg-sky": "#88b7c4"
      },
      boxShadow: {
        "soft": "0 20px 60px -30px rgba(0, 0, 0, 0.35)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-serif)", "Georgia", "serif"],
      },
    }
  },
  plugins: []
};
