/**
 * storage.js — WeatherLens
 * All localStorage read/write operations.
 * Isolated here so the rest of the app never touches localStorage directly.
 *
 * Keys used:
 *   wl_prefs        — user preferences object
 *   wl_lastCity     — last searched city string
 *   wl_favorites    — array of favourite city names
 */

// ─── Storage Keys ────────────────────────────────────────────────────────────

const KEY_PREFS     = 'wl_prefs';
const KEY_LAST_CITY = 'wl_lastCity';
const KEY_FAVORITES = 'wl_favorites';

// ─── Default Values ───────────────────────────────────────────────────────────

/**
 * Default user preferences.
 * Merging approach: stored prefs override these, unknown keys are ignored.
 *
 * @typedef {Object} UserPrefs
 * @property {'metric'|'imperial'} units
 * @property {'dark'|'light'}      theme
 */
const DEFAULT_PREFS = {
  units: 'metric',
  theme: 'dark',
};

// ─── Safe localStorage Wrapper ────────────────────────────────────────────────

/**
 * Try to read & parse a localStorage key.
 * Returns null on any error (private browsing, storage full, parse error, etc.)
 *
 * @param {string} key
 * @returns {any|null}
 */
function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Try to serialise & store a value in localStorage.
 * Silently ignores QuotaExceededError or other failures.
 *
 * @param {string} key
 * @param {any}    value
 * @returns {boolean} true if successful
 */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    console.warn('[WeatherLens] localStorage write failed:', key);
    return false;
  }
}

/**
 * Remove a key from localStorage.
 * @param {string} key
 */
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
}

// ─── User Preferences ─────────────────────────────────────────────────────────

/**
 * Load user preferences from storage, merged with defaults.
 * @returns {UserPrefs}
 */
export function loadPreferences() {
  const stored = lsGet(KEY_PREFS);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFS };

  // Merge stored values over defaults (only known keys)
  return {
    units: ['metric', 'imperial'].includes(stored.units)
      ? stored.units
      : DEFAULT_PREFS.units,
    theme: ['dark', 'light'].includes(stored.theme)
      ? stored.theme
      : DEFAULT_PREFS.theme,
  };
}

/**
 * Save user preferences to storage.
 * @param {Partial<UserPrefs>} prefs
 */
export function savePreferences(prefs) {
  const current = loadPreferences();
  lsSet(KEY_PREFS, { ...current, ...prefs });
}

/**
 * Update a single preference key.
 * @param {'units'|'theme'} key
 * @param {string} value
 */
export function updatePreference(key, value) {
  const current = loadPreferences();
  current[key] = value;
  lsSet(KEY_PREFS, current);
}

// ─── Last City ────────────────────────────────────────────────────────────────

/**
 * Get the last city the user searched.
 * @returns {string|null}
 */
export function getLastCity() {
  const city = lsGet(KEY_LAST_CITY);
  return typeof city === 'string' ? city : null;
}

/**
 * Save the last searched city.
 * @param {string} city
 */
export function saveLastCity(city) {
  lsSet(KEY_LAST_CITY, city);
}

// ─── Favorites ───────────────────────────────────────────────────────────────

/**
 * Load the list of favourite cities.
 * @returns {string[]} Array of city name strings
 */
export function loadFavorites() {
  const stored = lsGet(KEY_FAVORITES);
  if (!Array.isArray(stored)) return [];
  // Sanitise: keep only non-empty strings, deduplicate, max 10
  return [...new Set(stored.filter(c => typeof c === 'string' && c.trim()))]
    .slice(0, 10);
}

/**
 * Add a city to favourites. Silently ignores duplicates.
 * @param {string} city
 * @returns {string[]} Updated list
 */
export function addFavorite(city) {
  const city_clean = city.trim();
  const favorites  = loadFavorites();
  if (!favorites.includes(city_clean)) {
    favorites.unshift(city_clean);            // add to front
    lsSet(KEY_FAVORITES, favorites.slice(0, 10)); // limit to 10
  }
  return loadFavorites();
}

/**
 * Remove a city from favourites.
 * @param {string} city
 * @returns {string[]} Updated list
 */
export function removeFavorite(city) {
  const city_clean = city.trim();
  const filtered   = loadFavorites().filter(c => c !== city_clean);
  lsSet(KEY_FAVORITES, filtered);
  return filtered;
}

/**
 * Check if a city is in favourites.
 * @param {string} city
 * @returns {boolean}
 */
export function isFavorite(city) {
  return loadFavorites().includes(city.trim());
}

/**
 * Clear all user data from storage (for debug/reset).
 */
export function clearAllStorage() {
  lsRemove(KEY_PREFS);
  lsRemove(KEY_LAST_CITY);
  lsRemove(KEY_FAVORITES);
}
