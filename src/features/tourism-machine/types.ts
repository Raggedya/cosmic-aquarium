export const TOURISM_CATEGORIES = ['SEE','DO','EAT','DRINK','SHOP','NATURE','HISTORY','WEIRD','DAY_TRIP'] as const;
export type TourismCategory = (typeof TOURISM_CATEGORIES)[number];

export interface TourismDiscovery {
  id: string;
  name: string;
  category: TourismCategory;
  shortDescription: string;
  longDescription: string;
  image: string;
  address: string;
  locality: string;
  region: string;
  latitude: number;
  longitude: number;
  websiteUrl: string;
  mapUrl: string;
  distanceKm: number;
  hours?: string;
  tags: string[];
  source: string;
  lastVerified: string | null;
}

export interface TourismDestination {
  name: string;
  region: string;
  state: string;
  country: string;
  radiusKm: number;
  machineTitle: string;
  tagline: string;
  slogan: string;
}

export interface TourismMachineConfig {
  schemaVersion: 1;
  status: 'mock' | 'draft' | 'published';
  destination: TourismDestination;
  tickerFacts: string[];
  discoveries: TourismDiscovery[];
}
