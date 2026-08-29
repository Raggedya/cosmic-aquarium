import type { Metadata, Viewport } from 'next';
import './globals.css';
import './spectrum-luxe.css';
import './artist-spectrum.css';

const title = 'Immigrant Union Song Spectrum — PROJECT B-SIDE';
const description = 'Explore forty Immigrant Union songs across four releases in one living, unofficial Bandcamp spectrum.';

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
  themeColor: '#09090b',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
