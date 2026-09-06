import type { Metadata, Viewport } from 'next';
import './globals.css';
import './cosmic-aquarium.css';
import './doorway.css';
import './collection-aquarium.css';

const title = 'AGGITS — Melbourne Music Machine';
const description = 'Pull the lever and let Melbourne music find you: 500 independent artists, thousands of real Bandcamp tracks, one mysterious machine.';

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
      alt: 'AGGITS Melbourne Music Machine',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-cosmic-aquarium.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AGGITS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#160b05',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
