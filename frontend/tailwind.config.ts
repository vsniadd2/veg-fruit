import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2e7d32",
        "background-light": "#f8fdf8",
        "background-dark": "#121a12",
        "forest-green": "#0a4a34",
        "vibrant-orange": "#f37335",
        "leaf-green": "#22c55e",
        "soft-gray": "#f3f4f6",
      },
      fontFamily: {
        display: ["Public Sans", "Inter", "system-ui", "sans-serif"],
        serif: ["Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [forms, containerQueries],
} satisfies Config;

