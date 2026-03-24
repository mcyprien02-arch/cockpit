import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EasyCash Cockpit",
  description: "Pilotage des magasins franchisés EasyCash",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-bg text-[#e8eaed] antialiased">{children}</body>
    </html>
  );
}
