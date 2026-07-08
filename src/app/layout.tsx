import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'StellarWhisper | Decentralized Anonymous Group Chat',
  description:
    'A privacy-first, decentralized anonymous communication platform built on the Stellar network. Securely authenticate with Web3 wallets and message freely without compromising identity.',
  keywords: [
    'Stellar',
    'Stellar Network',
    'Cryptography',
    'Anonymous Chat',
    'Web3 Wallet Auth',
    'E2E Encryption',
    'Decentralized Messaging',
  ],
  authors: [{ name: 'StellarWhisper Team' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="antialiased min-h-screen flex flex-col">
        <main className="flex-grow flex flex-col relative z-10">{children}</main>
      </body>
    </html>
  );
}
