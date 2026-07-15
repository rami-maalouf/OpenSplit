import { useColorScheme } from 'react-native';

/* brand colors pulled from the app icon: blue field, orange play button */
export const BRAND_BLUE = '#2E7FE8';
export const BRAND_ORANGE = '#FF8F1F';

export type Palette = {
  scheme: 'light' | 'dark';
  background: string;
  card: string;
  text: string;
  textMuted: string;
  error: string;
  success: string;
  brand: string;
  accent: string;
};

const dark: Palette = {
  scheme: 'dark',
  background: '#0D1424',
  card: '#182238',
  text: '#F4F7FC',
  textMuted: '#93A0B8',
  error: '#FF6B6B',
  success: '#4ADE80',
  brand: BRAND_BLUE,
  accent: BRAND_ORANGE,
};

const light: Palette = {
  scheme: 'light',
  background: '#F4F7FC',
  card: '#FFFFFF',
  text: '#0B1220',
  textMuted: '#5B6575',
  error: '#C62828',
  success: '#15803D',
  brand: BRAND_BLUE,
  accent: BRAND_ORANGE,
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
