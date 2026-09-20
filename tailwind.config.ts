import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Verde-água — cor de destaque principal (links, foco, ícones, estado ativo)
        brand: {
          50: "#eefcfa",
          100: "#d1f7ef",
          200: "#a4eee1",
          300: "#6fe0cf",
          400: "#3fcab5",
          500: "#20ab98",
          600: "#178a7b",
          700: "#146e64",
        },
        // Navy — superfícies escuras (sidebar, cabeçalhos, seções de destaque)
        ink: {
          900: "#0e1330",
          800: "#161c44",
          700: "#202856",
          600: "#2c3568",
          500: "#3c4680",
        },
        // Dourado — reservado para a ação de maior destaque de cada tela
        gold: {
          300: "#f7d476",
          400: "#f3c34c",
          500: "#ecac1f",
          600: "#c98f13",
        },
      },
      fontFamily: {
        display: ["'Baloo 2'", "ui-rounded", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12)",
        "card-hover": "0 4px 10px rgba(15, 23, 42, 0.06), 0 16px 32px -12px rgba(15, 23, 42, 0.16)",
      },
    },
  },
  plugins: [],
};
export default config;
