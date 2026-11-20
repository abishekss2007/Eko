import defaultColors from "tailwindcss/colors";

// Colours resolve to CSS variables (see index.css) so the whole palette flips for dark mode.
const FAMILIES = ["slate", "red", "emerald", "sky", "blue", "orange", "amber", "green", "yellow", "teal", "rose"];
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const themed = Object.fromEntries(
  FAMILIES.map((family) => [
    family,
    Object.fromEntries(STEPS.map((step) => [step, `rgb(var(--${family}-${step}) / <alpha-value>)`])),
  ]),
);

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      black: "#000000",
      white: "rgb(var(--white) / <alpha-value>)",
      // Fixed colours that do not flip with the theme.
      snow: "#ffffff",
      sun: "#fcd34d",
      ink: defaultColors.slate,
      ...themed,
      // CPCB NAQI band colours (assumptions.json). Text colour is chosen per band for 4.5:1 contrast.
      naqi: {
        good: "#00b050",
        satisfactory: "#92d050",
        moderate: "#ffff00",
        poor: "#ff9900",
        verypoor: "#ff0000",
        severe: "#c00000",
      },
    },
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgb(255 255 255 / 0.06), 0 20px 60px -20px rgb(0 0 0 / 0.6)",
      },
    },
  },
  plugins: [],
};
