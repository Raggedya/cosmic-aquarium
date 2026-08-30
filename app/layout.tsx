import type { Metadata, Viewport } from 'next';
import './globals.css';
import './cosmic-aquarium.css';

const title = 'Cosmic Aquarium — Immigrant Union';
const description = 'Catch a luminous creature, reveal an Immigrant Union song, and listen through Bandcamp in a living cosmic aquarium.';

export const metadata: Metadata = {
  metadataBase: new URL('https://project-b-side.raggedya.chatgpt.site'),
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    images: [{
      url: '/og-cosmic-aquarium.png',
      width: 1200,
      height: 630,
      alt: 'Cosmic Aquarium — luminous deep-space organisms carrying Immigrant Union songs',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-cosmic-aquarium.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#01040d',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
