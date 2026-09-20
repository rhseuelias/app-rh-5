import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AppliQ RH",
  description: "Gestão de pessoas que gera resultados",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
