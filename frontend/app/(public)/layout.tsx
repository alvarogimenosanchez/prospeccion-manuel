import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Manuel García · Asesor Financiero",
  description: "Descubre qué producto financiero se adapta a ti. Sin compromiso, gratis.",
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen bg-white">
        {children}
      </body>
    </html>
  );
}
