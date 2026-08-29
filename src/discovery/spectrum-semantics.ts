import { clampUnit, unknownRadius } from './spectrum.ts';

export interface SpectrumAnchor {
  name: string;
  x: number;
  y: number;
}

export interface SpectrumReading {
  primary: string;
  secondary: string | null;
  label: string;
  depthLabel: 'unmapped core' | 'deep cross-current' | 'hybrid signal' | 'clear signal';
  certainty: number;
}

export const spectrumAnchors: SpectrumAnchor[] = [
  { name: 'synth', x: .18, y: .14 },
  { name: 'punk', x: .84, y: .23 },
  { name: 'metal', x: .88, y: .61 },
  { name: 'folk', x: .70, y: .85 },
  { name: 'jazz', x: .39, y: .87 },
  { name: 'ambient', x: .14, y: .72 },
  { name: 'electronic', x: .08, y: .43 },
];

export function readSpectrum(x: number, y: number): SpectrumReading {
  const point = { x: clampUnit(x), y: clampUnit(y) };
  const radius = Math.hypot(point.x - .5, point.y - .5);
  const ranked = spectrumAnchors
    .map((anchor) => ({ ...anchor, distance: Math.hypot(anchor.x - point.x, anchor.y - point.y) }))
    .sort((a, b) => a.distance - b.distance);
  const [first, second] = ranked;

  if (radius <= unknownRadius) {
    return {
      primary: 'the unknown',
      secondary: null,
      label: 'THE UNKNOWN',
      depthLabel: 'unmapped core',
      certainty: 0,
    };
  }

  const certainty = Math.min(1, Math.max(0, (radius - unknownRadius) / .48));
  const depthLabel = certainty < .34 ? 'deep cross-current' : certainty < .7 ? 'hybrid signal' : 'clear signal';
  const blended = certainty < .7 || second.distance - first.distance < .075;

  return {
    primary: first.name,
    secondary: blended ? second.name : null,
    label: blended ? `${first.name} × ${second.name}` : first.name,
    depthLabel,
    certainty,
  };
}
