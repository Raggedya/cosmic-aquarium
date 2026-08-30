import type { Metadata, Viewport } from 'next';
import './globals.css';
import './spectrum-luxe.css';
import './artist-spectrum.css';
import './mystery-spectrum.css';
import './flower-stream.css';
import './flower-instruction.css';
import './depth-magnet-reveal.css';
import './ornate-frame.css';
import './jukebox-dimensional.css';
import './jukebox.css';

const title = 'Immigrant Union Song Spectrum — PROJECT B-SIDE';
const description = 'A living Immigrant Union jukebox. Touch a falling flower to open its song in the cabinet, then listen and support on Bandcamp.';

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
