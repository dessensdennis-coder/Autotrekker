import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autotrekker — Tesla occasions",
  description: "Volg Tesla occasions in NL: nieuw, prijs t.o.v. de markt, en trend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
