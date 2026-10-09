import type { Metadata } from "next";
import "./globals.css";
import MaiusculaAutomatica from "@/components/MaiusculaAutomatica";

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
      <body>
        <MaiusculaAutomatica />
        {children}
      </body>
    </html>
  );
}
