import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EasyCash Cockpit',
  description: 'Outil de pilotage franchise EasyCash',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
