import { CosmicAquarium } from '@/src/features/cosmic-aquarium/CosmicAquarium';

export default async function ArtistAquariumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CosmicAquarium manifestSlug={slug} />;
}
