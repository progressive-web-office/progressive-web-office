/**
 * FILE-028: the network places used — repositories, WebDAV / Nextcloud
 * folders — remembered to open them again; FILE-029: whether documents keep
 * their origin. Both can be turned off.
 */

export type PlaceKind = 'git' | 'dav';

export interface Place {
  id: string;
  kind: PlaceKind;
  /** Where it is: the web address of the repository (maybe of a branch and folder), or the WebDAV folder. */
  url: string;
  /** Shown name: `owner/name`, `user@host/folder`. */
  label: string;
  /** The account used there, when it is still known. */
  accountId?: string;
  /** A folder inside the place (WebDAV). */
  folder?: string;
  lastUsed: number;
}

const KEY = 'pwo.places';
const PLACES_OFF = 'pwo.places.off';
const ORIGINS_OFF = 'pwo.origins.off';
export const MAX_PLACES = 12;

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: nothing remembered */
  }
};

export function placesEnabled(): boolean {
  return read(PLACES_OFF) !== '1';
}

/** Turning remembering off forgets the places. */
export function setPlacesEnabled(on: boolean): void {
  write(PLACES_OFF, on ? null : '1');
  if (!on) forgetPlaces();
}

export function originsEnabled(): boolean {
  return read(ORIGINS_OFF) !== '1';
}

export function setOriginsEnabled(on: boolean): void {
  write(ORIGINS_OFF, on ? null : '1');
}

export function loadPlaces(): Place[] {
  try {
    const raw = JSON.parse(read(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return (raw as Place[]).filter((p) => p && (p.kind === 'git' || p.kind === 'dav') && typeof p.url === 'string' && typeof p.label === 'string').sort((a, b) => b.lastUsed - a.lastUsed);
  } catch {
    return [];
  }
}

const save = (places: Place[]): void => write(KEY, places.length ? JSON.stringify(places) : null);

/** Remembers a place (or brings it first); nothing when remembering is off. */
export function rememberPlace(place: Omit<Place, 'id' | 'lastUsed'>, now = Date.now()): Place | undefined {
  if (!placesEnabled()) return undefined;
  const id = `${place.kind}:${place.url}`;
  const entry: Place = { ...place, id, lastUsed: now };
  save([entry, ...loadPlaces().filter((p) => p.id !== id)].slice(0, MAX_PLACES));
  return entry;
}

export function forgetPlace(id: string): void {
  save(loadPlaces().filter((p) => p.id !== id));
}

export function forgetPlaces(): void {
  write(KEY, null);
}

/** The places remembered with an account, when the account is forgotten. */
export function forgetPlacesOfAccount(accountId: string): void {
  save(loadPlaces().map((p) => (p.accountId === accountId ? (({ accountId: _a, ...rest }) => rest)(p) : p)));
}
