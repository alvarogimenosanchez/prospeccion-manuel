import type { Metadata } from "next";
import "./globals.css";
import { Lato } from "next/font/google";
import { AppShell } from "@/components/AppShell";

// Lato is the official Google Fonts fallback for NNNittiGrotesk
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manuel · Prospección Comercial",
  description: "Sistema de gestión de leads y prospección automatizada",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={lato.variable}>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
