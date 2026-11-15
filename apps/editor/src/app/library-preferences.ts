import { symbolCategories } from './symbol-catalog';

export type LibraryTab = 'screens' | 'symbols' | 'faceplates';
export interface LibraryPreferences {
  version: 1;
  search: string;
  expanded: string[];
  activeTab: LibraryTab;
}
const defaults = (): LibraryPreferences => ({
  version: 1,
  search: '',
  expanded: ['dashboard'],
  activeTab: 'screens',
});
const categoryIds = new Set(symbolCategories.map((category) => category.id));

/** Review workspaces keep their preferences separate from the user's main editor. */
export function libraryPreferencesKey(href: string): string {
  const base = 'twynix.symbol-library.v1';
  const workspace = new URL(href).searchParams.get('workspace');
  return workspace && /^[a-z0-9-]{1,40}$/i.test(workspace) ? `${base}:${workspace}` : base;
}
export function parseLibraryPreferences(serialized: string | null): LibraryPreferences {
  try {
    const value: unknown = JSON.parse(serialized ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults();
    const saved = value as Record<string, unknown>;
    if (saved['version'] !== 1) return defaults();
    return {
      version: 1,
      search: typeof saved['search'] === 'string' ? saved['search'].slice(0, 500) : '',
      expanded: Array.isArray(saved['expanded'])
        ? [
            ...new Set(
              saved['expanded'].filter(
                (id): id is string => typeof id === 'string' && categoryIds.has(id),
              ),
            ),
          ]
        : ['dashboard'],
      activeTab: ['screens', 'symbols', 'faceplates'].includes(String(saved['activeTab']))
        ? (saved['activeTab'] as LibraryTab)
        : 'screens',
    };
  } catch {
    return defaults();
  }
}
export function loadLibraryPreferences(): LibraryPreferences {
  try {
    return parseLibraryPreferences(localStorage.getItem(libraryPreferencesKey(location.href)));
  } catch {
    return defaults();
  }
}
export function saveLibraryPreferences(preferences: LibraryPreferences): void {
  try {
    localStorage.setItem(libraryPreferencesKey(location.href), JSON.stringify(preferences));
  } catch {
    /* Storage can be unavailable or full; in-session navigation still works. */
  }
}
