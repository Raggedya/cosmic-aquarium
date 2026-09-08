import type {Metadata} from 'next';

export const metadata:Metadata={
  title:'Things To Do In Bendigo',
  description:'Pull the lever and discover a Bendigo attraction, place or experience.',
};

export default function TourismMachinePage(){
  return (
    <main aria-label="Things To Do Machine" style={{position:'fixed',inset:0,background:'#120704'}}>
      <iframe
        src="/tourism/index.html"
        title="Things To Do In Bendigo tourism discovery machine"
        style={{display:'block',width:'100%',height:'100%',border:0}}
        allow="autoplay"
      />
    </main>
  );
}
