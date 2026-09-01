import type { Metadata, Viewport } from 'next';
import './globals.css';
import './cosmic-aquarium.css';
import './doorway.css';

const title = 'Cosmic Aquaria — Enter Without Knowing';
const description = 'Choose a water or drift anywhere. Let independent music find you inside the living Cosmic Aquaria universe.';

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
      alt: 'Cosmic Aquaria — realistic flowers flowing through deep space, each carrying an Immigrant Union song',
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
    title: 'Cosmic Aquaria',
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
