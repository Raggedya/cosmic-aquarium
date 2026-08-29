const permittedRoot = 'bandcamp.com';

export function validateBandcampUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isBandcamp = host === permittedRoot || host.endsWith(`.${permittedRoot}`);
    if (url.protocol !== 'https:' || !isBandcamp || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
