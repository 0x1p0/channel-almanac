// Real screenshots of the extension (public/shots/), captured on NASA's public YouTube channel.
// A shot that hasn't been captured yet is simply left out of the page.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export type Shot = { src: string; width: number; height: number };

export async function shot(name: string): Promise<Shot | null> {
  const file = path.join(process.cwd(), 'public', 'shots', name);
  if (!fs.existsSync(file)) return null;
  const m = await sharp(file).metadata();
  return { src: `/shots/${name}`, width: m.width ?? 0, height: m.height ?? 0 };
}

export const media = (name: string) => (fs.existsSync(path.join(process.cwd(), 'public', 'media', name)) ? `/media/${name}` : null);
