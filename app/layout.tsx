import type { Metadata, Viewport } from 'next';
import './globals.css';

const title = 'PROJECT B-SIDE — Touch the spectrum';
const description = 'Touch anywhere in a living spectrum of independent music and uncover a real record on Bandcamp.';

export const metadata: Metadata = {
  metadataBase: new URL('https://project-b-side.raggedya.chatgpt.site'),
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Project B-Side music spectrum' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
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
