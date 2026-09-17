import type { Client } from '../types';

/** Twelve clearly different colours; clients are handed these in turn so neighbours never clash. */
export const PALETTE = [
  '#6366f1', // indigo
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#0ea5e9', // sky
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#14b8a6', // teal
  '#a16207', // brown
  '#64748b', // slate
];

function hashColor(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** The colour to draw a client in. Falls back to a stable hash for clients saved before colours existed. */
export function clientColor(client: Client | undefined, id?: string): string {
  if (client?.color) return client.color;
  return hashColor(client?.id ?? id ?? '');
}

/** The palette colour used by the fewest clients (first unused one wins), so a new client stands out. */
export function pickUnusedColor(clients: Client[]): string {
  const counts = new Map(PALETTE.map((c) => [c, 0]));
  for (const client of clients) {
    if (client.color && counts.has(client.color)) counts.set(client.color, (counts.get(client.color) ?? 0) + 1);
  }
  let best = PALETTE[0];
  let bestCount = Infinity;
  for (const color of PALETTE) {
    const count = counts.get(color) ?? 0;
    if (count < bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

/** Gives every client without a colour a distinct one. Returns null when nothing needed changing. */
export function assignMissingColors(clients: Client[]): Client[] | null {
  if (clients.every((c) => c.color)) return null;
  const result = [...clients];
  for (let i = 0; i < result.length; i++) {
    if (!result[i].color) result[i] = { ...result[i], color: pickUnusedColor(result) };
  }
  return result;
}
