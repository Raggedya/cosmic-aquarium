import type { SpectrumRelease } from '@/src/types/spectrum';

export interface ImmigrantUnionAlbum {
  key: 'winter-ep' | 'immigrant-union' | 'anyway' | 'judas';
  name: string;
  year: number;
  x: number;
  y: number;
  color: string;
  sourcePage: string;
}

export const immigrantUnionAlbums: ImmigrantUnionAlbum[] = [
  { key: 'winter-ep', name: 'The Winter EP', year: 2010, x: .23, y: .28, color: '#8bdcff', sourcePage: 'https://immigrantunionmusic.bandcamp.com/album/immigrant-union-the-winter-ep' },
  { key: 'immigrant-union', name: 'Immigrant Union', year: 2012, x: .77, y: .27, color: '#dfff70', sourcePage: 'https://immigrantunionmusic.bandcamp.com/album/immigrant-union' },
  { key: 'anyway', name: 'Anyway', year: 2014, x: .75, y: .75, color: '#ffb454', sourcePage: 'https://immigrantunionmusic.bandcamp.com/album/anyway' },
  { key: 'judas', name: 'Judas', year: 2020, x: .24, y: .76, color: '#ff5a96', sourcePage: 'https://cheersquadrecordstapes.bandcamp.com/album/judas' },
];

type SongTuple = [albumKey: ImmigrantUnionAlbum['key'], trackNumber: number, title: string, duration: string, bandcampUrl: string, bandcampEmbedTrackId: string];

const songs: SongTuple[] = [
  ['winter-ep', 1, 'Winter', 'P00H04M09S', 'https://immigrantunionmusic.bandcamp.com/track/winter-2', '3891773487'],
  ['winter-ep', 2, 'The Rope (Kerr St Overdub)', 'P00H03M22S', 'https://immigrantunionmusic.bandcamp.com/track/the-rope-kerr-st-overdub', '3721185349'],
  ['winter-ep', 3, "My Heart's a Joke (home recording)", 'P00H04M07S', 'https://immigrantunionmusic.bandcamp.com/track/my-hearts-a-joke-home-recording', '194933144'],
  ['winter-ep', 4, 'The Shine (home recording)', 'P00H04M22S', 'https://immigrantunionmusic.bandcamp.com/track/the-shine-home-recording', '3575459263'],
  ['winter-ep', 5, 'Immigrant Union Movie Soundtrack', 'P00H03M45S', 'https://immigrantunionmusic.bandcamp.com/track/immigrant-union-movie-soundtrack', '352636607'],
  ['immigrant-union', 1, 'Saturday', 'P00H04M17S', 'https://immigrantunionmusic.bandcamp.com/track/saturday', '409448520'],
  ['immigrant-union', 2, "My Heart's a Joke", 'P00H03M55S', 'https://immigrantunionmusic.bandcamp.com/track/my-hearts-a-joke', '1231525750'],
  ['immigrant-union', 3, 'Winter', 'P00H04M07S', 'https://immigrantunionmusic.bandcamp.com/track/winter', '3601930754'],
  ['immigrant-union', 4, 'Dignity', 'P00H03M02S', 'https://immigrantunionmusic.bandcamp.com/track/dignity', '1953235953'],
  ['immigrant-union', 5, 'Oregon', 'P00H02M49S', 'https://immigrantunionmusic.bandcamp.com/track/oregon', '3834535133'],
  ['immigrant-union', 6, 'The Rope', 'P00H03M17S', 'https://immigrantunionmusic.bandcamp.com/track/the-rope', '1617225551'],
  ['immigrant-union', 7, 'Up in Smoke', 'P00H02M31S', 'https://immigrantunionmusic.bandcamp.com/track/up-in-smoke', '2592827198'],
  ['immigrant-union', 8, 'The Story of My Life', 'P00H02M57S', 'https://immigrantunionmusic.bandcamp.com/track/the-story-of-my-life', '1293849752'],
  ['immigrant-union', 9, 'The Ballard of Jim Jones', 'P00H02M13S', 'https://immigrantunionmusic.bandcamp.com/track/the-ballard-of-jim-jones', '2635662230'],
  ['immigrant-union', 10, 'Back in the Fall', 'P00H02M59S', 'https://immigrantunionmusic.bandcamp.com/track/back-in-the-fall', '3723118414'],
  ['immigrant-union', 11, 'I Remember Yesterday', 'P00H02M24S', 'https://immigrantunionmusic.bandcamp.com/track/i-remember-yesterday', '36470000'],
  ['immigrant-union', 12, 'Wrong', 'P00H02M08S', 'https://immigrantunionmusic.bandcamp.com/track/wrong', '2971027205'],
  ['immigrant-union', 13, 'Again', 'P00H04M22S', 'https://immigrantunionmusic.bandcamp.com/track/again', '4176861501'],
  ['immigrant-union', 14, 'Loraine', 'P00H05M49S', 'https://immigrantunionmusic.bandcamp.com/track/loraine', '838525021'],
  ['anyway', 1, 'Shameless', 'P00H04M19S', 'https://immigrantunionmusic.bandcamp.com/track/shameless', '1952561988'],
  ['anyway', 2, 'Alison', 'P00H03M44S', 'https://immigrantunionmusic.bandcamp.com/track/alison-3', '2619810679'],
  ['anyway', 3, "I Can't Return", 'P00H04M49S', 'https://immigrantunionmusic.bandcamp.com/track/i-cant-return-2', '341134205'],
  ['anyway', 4, 'Wake Up and Cry', 'P00H04M55S', 'https://immigrantunionmusic.bandcamp.com/track/wake-up-and-cry', '3764380951'],
  ['anyway', 5, 'Anyway', 'P00H07M20S', 'https://immigrantunionmusic.bandcamp.com/track/anyway', '2261430473'],
  ['anyway', 6, 'In Time', 'P00H05M17S', 'https://immigrantunionmusic.bandcamp.com/track/in-time', '892040317'],
  ['anyway', 7, 'Lake Mokoan', 'P00H04M35S', 'https://immigrantunionmusic.bandcamp.com/track/lake-mokoan', '2730071582'],
  ['anyway', 8, "The Trip Ain't Over", 'P00H05M30S', 'https://immigrantunionmusic.bandcamp.com/track/the-trip-aint-over', '3666202310'],
  ['anyway', 9, 'War is Peace', 'P00H04M01S', 'https://immigrantunionmusic.bandcamp.com/track/war-is-peace', '374644233'],
  ['anyway', 10, 'The End Has Come', 'P00H05M12S', 'https://immigrantunionmusic.bandcamp.com/track/the-end-has-come', '1271262846'],
  ['judas', 1, 'The Ballad Of Bill Hicks', 'P00H07M08S', 'https://cheersquadrecordstapes.bandcamp.com/track/the-ballad-of-bill-hicks', '64477930'],
  ['judas', 2, 'Ahmed', 'P00H04M49S', 'https://cheersquadrecordstapes.bandcamp.com/track/ahmed', '1455980542'],
  ['judas', 3, 'New Win', 'P00H05M13S', 'https://cheersquadrecordstapes.bandcamp.com/track/new-win-2', '1971935889'],
  ['judas', 4, 'Asbury Park', 'P00H04M27S', 'https://cheersquadrecordstapes.bandcamp.com/track/asbury-park', '3328647321'],
  ['judas', 5, 'Not To Smart', 'P00H02M17S', 'https://cheersquadrecordstapes.bandcamp.com/track/not-to-smart', '937048397'],
  ['judas', 6, 'Watch My Mouth', 'P00H03M48S', 'https://cheersquadrecordstapes.bandcamp.com/track/watch-my-mouth', '2070184608'],
  ['judas', 7, 'Jewels In The Sky', 'P00H04M04S', 'https://cheersquadrecordstapes.bandcamp.com/track/jewels-in-the-sky-2', '3410329485'],
  ['judas', 8, 'Soldier Field', 'P00H04M56S', 'https://cheersquadrecordstapes.bandcamp.com/track/soldier-field', '3218071529'],
  ['judas', 9, "You Don't Need It", 'P00H05M25S', 'https://cheersquadrecordstapes.bandcamp.com/track/you-dont-need-it', '3184390797'],
  ['judas', 10, 'English Paradise', 'P00H03M32S', 'https://cheersquadrecordstapes.bandcamp.com/track/english-paradise', '2227694004'],
  ['judas', 11, 'Awake', 'P00H04M33S', 'https://cheersquadrecordstapes.bandcamp.com/track/awake', '800401793'],
];

function durationSeconds(duration: string) {
  const match = duration.match(/P(?:\d+H)?(\d+)M(\d+)S/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function durationLabel(duration: string) {
  const seconds = durationSeconds(duration);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function halton(index: number, base: number) {
  let result = 0;
  let fraction = 1;
  let remaining = index;
  while (remaining > 0) {
    fraction /= base;
    result += fraction * (remaining % base);
    remaining = Math.floor(remaining / base);
  }
  return result;
}

export const immigrantUnionSongs: SpectrumRelease[] = songs.map(([albumKey, trackNumber, title, duration, bandcampUrl, bandcampEmbedTrackId], index) => {
  const album = immigrantUnionAlbums.find((candidate) => candidate.key === albumKey);
  if (!album) throw new Error(`Unknown Immigrant Union album: ${albumKey}`);
  const albumLength = songs.filter(([candidateKey]) => candidateKey === albumKey).length;

  return {
    id: `${albumKey}-${trackNumber}`,
    title,
    artist: 'Immigrant Union',
    albumTitle: album.name,
    albumKey,
    year: album.year,
    trackNumber,
    duration: durationLabel(duration),
    x: .075 + halton(index + 1, 2) * .85,
    y: .075 + halton(index + 1, 3) * .85,
    zone: 'Uncharted song field',
    note: `Track ${trackNumber} of ${albumLength} · ${durationLabel(duration)}`,
    bandcampUrl,
    bandcampEmbedTrackId,
    sourcePage: album.sourcePage,
  };
});
