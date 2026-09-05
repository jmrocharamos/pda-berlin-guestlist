import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PDA Door — Guestlist Control',
  description: 'Private door and guestlist operations for PDA Berlin.',
  openGraph: { title: 'PDA Door — Guestlist Control', description: 'Private door and guestlist operations for PDA Berlin.', images: ['https://i1.sndcdn.com/visuals-001230232354-GC1Lze-t2480x520.jpg'] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
