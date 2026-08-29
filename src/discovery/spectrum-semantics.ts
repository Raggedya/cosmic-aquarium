import { immigrantUnionAlbums } from '../data/immigrant-union-catalogue.ts';
import { clampUnit, unknownRadius } from './spectrum.ts';

export interface SpectrumAnchor {
  name: string;
  year: number;
  color: string;
  x: number;
  y: number;
}

export interface SpectrumReading {
  primary: string;
  secondary: string | null;
  label: string;
  depthLabel: 'catalogue wildcard' | 'between eras' | 'album current';
  certainty: number;
}

export const spectrumAnchors: SpectrumAnchor[] = immigrantUnionAlbums.map((album) => ({
  name: album.name,
  year: album.year,
  color: album.color,
  x: album.x,
  y: album.y,
}));

export function readSpectrum(x: number, y: number): SpectrumReading {
  const point = { x: clampUnit(x), y: clampUnit(y) };
  const radius = Math.hypot(point.x - .5, point.y - .5);
  const ranked = spectrumAnchors
    .map((anchor) => ({ ...anchor, distance: Math.hypot(anchor.x - point.x, anchor.y - point.y) }))
    .sort((a, b) => a.distance - b.distance);
  const [first, second] = ranked;

  if (radius <= unknownRadius) {
    return {
      primary: 'any song',
      secondary: null,
      label: 'ANY SONG',
      depthLabel: 'catalogue wildcard',
      certainty: 0,
    };
  }

  const separation = second.distance - first.distance;
  const blended = separation < .095;
  const certainty = Math.min(1, Math.max(0, separation / .28));

  return {
    primary: first.name,
    secondary: blended ? second.name : null,
    label: blended ? first.name + ' × ' + second.name : first.name,
    depthLabel: blended ? 'between eras' : 'album current',
    certainty,
  };
}
