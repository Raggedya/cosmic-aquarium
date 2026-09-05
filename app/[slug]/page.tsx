import { redirect } from 'next/navigation';

export default async function ArtistAquariumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`https://raggedya.github.io/cosmic-aquarium/?release=${encodeURIComponent(slug)}`);
}
