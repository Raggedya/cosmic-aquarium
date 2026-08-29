import type { Metadata, Viewport } from 'next';
import './globals.css';
import './spectrum-luxe.css';
import './artist-spectrum.css';
import './mystery-spectrum.css';
import './persistent-title.css';
import './flower-stream.css';
import './flower-instruction.css';

const title = 'Immigrant Union Song Spectrum — PROJECT B-SIDE';
const description = 'A deep-blue stream of forty Immigrant Union songs. Catch a drifting flower to discover a song, then listen and support on Bandcamp.';

export const metadata: Metadata = {
  metadataBase: new URL('https://project-b-side.raggedya.chatgpt.site'),
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    images: [{ url: '/og-immigrant-union.png', width: 1200, height: 630, alt: 'Immigrant Union song spectrum by Project B-Side' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-immigrant-union.png'],
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
