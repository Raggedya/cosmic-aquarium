import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

const DESTINATIONS={
  ballarat:'Ballarat',
  geelong:'Geelong',
  warrnambool:'Warrnambool',
  mildura:'Mildura',
  shepparton:'Shepparton',
  wangaratta:'Wangaratta',
  wodonga:'Wodonga',
  horsham:'Horsham',
  sale:'Sale',
  traralgon:'Traralgon',
} as const;

type DestinationSlug=keyof typeof DESTINATIONS;
type PageProps={params:Promise<{destination:string}>};

function destinationFor(value:string){return DESTINATIONS[value as DestinationSlug]||null}

export function generateStaticParams(){return Object.keys(DESTINATIONS).map(destination=>({destination}))}

export async function generateMetadata({params}:PageProps):Promise<Metadata>{
  const {destination:slug}=await params,name=destinationFor(slug);
  if(!name)return {};
  return {title:`Things To Do In ${name}`,description:`Pull the lever and discover a ${name} attraction, place or experience.`};
}

export default async function RegionalTourismMachinePage({params}:PageProps){
  const {destination:slug}=await params,name=destinationFor(slug);
  if(!name)notFound();
  return (
    <main aria-label={`Things To Do In ${name} Machine`} style={{position:'fixed',inset:0,background:'#120704'}}>
      <iframe
        src={`/tourism-editions/${slug}/index.html`}
        title={`Things To Do In ${name} tourism discovery machine`}
        style={{display:'block',width:'100%',height:'100%',border:0}}
        allow="autoplay"
      />
    </main>
  );
}
