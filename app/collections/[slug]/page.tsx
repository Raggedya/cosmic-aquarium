import { CollectionAquarium } from '@/src/features/collection-aquarium/CollectionAquarium';

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CollectionAquarium collectionSlug={slug} />;
}
