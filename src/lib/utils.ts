import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Upgrade Deezer cover URLs to highest available resolution (1000x1000).
 * Handles URLs like .../250x250-... or .../500x500-...
 */
export function hdCover(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/\d+x\d+-/, '/1000x1000-');
}
