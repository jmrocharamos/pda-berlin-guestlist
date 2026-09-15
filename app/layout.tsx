import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './themes.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  icons: { icon: '/pda-logo.jpg', apple: '/pda-logo.jpg' },
  title: 'PDA Berlin — Guestlist',
  description: 'A simple, private space for guestlist and door management at PDA events.',
  openGraph: { title: 'PDA Berlin — Guestlist', description: 'A simple, private space for guestlist and door management at PDA events.', images: ['https://i1.sndcdn.com/visuals-001230232354-GC1Lze-t2480x520.jpg'] },
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
