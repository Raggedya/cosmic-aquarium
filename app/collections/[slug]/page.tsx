import { redirect } from 'next/navigation';

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = slug.startsWith('style-') ? slug.slice(6) : '';
  redirect(`https://raggedya.github.io/cosmic-aquarium/${category ? `?categories=${encodeURIComponent(category)}` : ''}`);
}
