import type { SpectrumRelease } from '@/src/types/spectrum';

export const unknownRadius = .135;

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function isUnknownZone(x: number, y: number): boolean {
  return Math.hypot(clampUnit(x) - .5, clampUnit(y) - .5) <= unknownRadius;
}

export function nearestSpectrumRelease(releases: SpectrumRelease[], x: number, y: number): SpectrumRelease {
  if (!releases.length) throw new Error('A spectrum needs at least one release.');
  const px = clampUnit(x);
  const py = clampUnit(y);
  return releases.reduce((nearest, candidate) => {
    const candidateDistance = Math.hypot(candidate.x - px, candidate.y - py);
    const nearestDistance = Math.hypot(nearest.x - px, nearest.y - py);
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

export function surpriseSpectrumRelease(releases: SpectrumRelease[], seed: number): SpectrumRelease {
  if (!releases.length) throw new Error('A spectrum needs at least one release.');
  return releases[Math.abs(Math.floor(seed)) % releases.length];
}
