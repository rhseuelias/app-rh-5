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
          50: "#fdf6ee",
          100: "#f9e8d2",
          200: "#f0d0ac",
          300: "#e0a874",
          400: "#c9763a",
          500: "#a85822",
          600: "#8f4a1b",
          700: "#703914",
        },
        // Grafite — superfícies escuras (sidebar, cabeçalhos, seções de destaque)
        ink: {
          900: "#2b2118",
          800: "#3d3027",
          700: "#4f4237",
          600: "#5f5246",
          500: "#7a6c5f",
        },
        // Pêssego vivo — reservado para a ação de maior destaque de cada tela
        gold: {
          300: "#e0a874",
          400: "#a85822",
          500: "#8f4a1b",
          600: "#703914",
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
