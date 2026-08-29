import type { SpectrumRelease } from '@/src/types/spectrum';

/**
 * A deliberately small, hand-checked MVP manifest. Coordinates are curatorial
 * placement, while titles, artists, dates, descriptions and destinations come
 * from the linked Bandcamp pages (checked 29 August 2026).
 */
export const spectrumReleases: SpectrumRelease[] = [
  { id: 'imaginal-disk', title: 'Imaginal Disk', artist: 'Magdalena Bay', year: 2024, x: .22, y: .18, zone: 'synth-pop · psychedelic pop', note: 'Glossy pop architecture at the violet edge of the electronic field.', bandcampUrl: 'https://magdalenabay.bandcamp.com/album/imaginal-disk' },
  { id: 'endure', title: 'Endure', artist: 'SPECIAL INTEREST', year: 2022, x: .58, y: .20, zone: 'synth-punk · no wave', note: 'Placed where punk abrasion meets drum machines, synths and the dancefloor.', bandcampUrl: 'https://specialinterestno.bandcamp.com/album/endure' },
  { id: 'diaspora-problems', title: 'Diaspora Problems', artist: 'SOUL GLO', year: 2022, x: .84, y: .29, zone: 'hardcore punk · noise-rap', note: 'A high-pressure red zone where hardcore collides with experimental rap.', bandcampUrl: 'https://soulglophl.bandcamp.com/album/diaspora-problems' },
  { id: 'absolute-elsewhere', title: 'Absolute Elsewhere', artist: 'Blood Incantation', year: 2024, x: .87, y: .62, zone: 'death metal · ambient prog', note: 'Metal pulled toward the strange centre by ambient electronics and progressive forms.', bandcampUrl: 'https://bloodincantation.bandcamp.com/album/absolute-elsewhere' },
  { id: 'false-lankum', title: 'False Lankum', artist: 'Lankum', year: 2023, x: .68, y: .84, zone: 'drone folk · traditional', note: 'Folk at its darkest edge: traditional song stretched into dense soundscape.', bandcampUrl: 'https://lankum.bandcamp.com/album/false-lankum' },
  { id: 'universal-beings', title: 'Universal Beings', artist: 'Makaya McCraven', year: 2018, x: .42, y: .84, zone: 'jazz · organic beat music', note: 'Improvised jazz cut and recomposed with the instincts of a beat-maker.', bandcampUrl: 'https://intlanthem.bandcamp.com/album/universal-beings' },
  { id: 'promises', title: 'Promises', artist: 'Floating Points, Pharoah Sanders & LSO', year: 2021, x: .20, y: .70, zone: 'ambient · spiritual jazz', note: 'A quiet blue-green borderland between electronics, jazz and modern classical music.', bandcampUrl: 'https://floatingpoints.bandcamp.com/album/promises' },
  { id: 'dreamstate', title: 'Dreamstate', artist: 'Kelly Lee Owens', year: 2024, x: .12, y: .45, zone: 'electronic · vocal trance', note: 'Luminous club music between electronic hypnosis and direct pop feeling.', bandcampUrl: 'https://kellyleeowens.bandcamp.com/album/dreamstate' },
];
