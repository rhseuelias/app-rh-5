import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pêssego — cor de destaque principal (links, foco, ícones, estado ativo)
        // Tons 50–400 são o pêssego claro; 500–700 são laranja escuro, bons para texto sobre fundo branco
        brand: {
          50: "#fff3e6",
          100: "#ffe9d2",
          200: "#ffd5aa",
          300: "#fdc48a",
          400: "#fbb26e",
          500: "#f0913f",
          600: "#b85c12",
          700: "#93440c",
        },
        // Grafite — superfícies escuras (sidebar, cabeçalhos, seções de destaque)
        ink: {
          900: "#262626",
          800: "#3d3d3d",
          700: "#4a4a4a",
          600: "#5c5c5c",
          500: "#737373",
        },
        // Pêssego vivo — reservado para a ação de maior destaque de cada tela
        gold: {
          300: "#fdcb9a",
          400: "#fbb26e",
          500: "#f59e4a",
          600: "#d97f27",
        },
      },
      fontFamily: {
        display: ["Oswald", "'Arial Narrow'", "Impact", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(61, 40, 20, 0.05), 0 8px 24px -12px rgba(61, 40, 20, 0.14)",
        "card-hover": "0 4px 10px rgba(61, 40, 20, 0.07), 0 16px 32px -12px rgba(61, 40, 20, 0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
