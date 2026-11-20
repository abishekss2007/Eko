/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
    },
  },
  plugins: [],
};
