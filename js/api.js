/**
 * api.js — WeatherLens
 * All OpenWeatherMap API interactions.
 * Uses async/await + proper error handling.
 *
 * API docs: https://openweathermap.org/api
 *
 * Replace API_KEY with your own from: https://home.openweathermap.org/api_keys
 * Free tier gives: Current Weather + 5-Day/3-Hour Forecast + Geocoding
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const API_KEY  = '82d86b0436585e269f3f4217ae260a36';   
const BASE_URL = 'https://api.openweathermap.org';

/**
 * All API endpoints we use
 */
const ENDPOINTS = {
  current:  (city, units) =>
    `${BASE_URL}/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${units}`,

  forecast: (city, units) =>
    `${BASE_URL}/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${units}&cnt=40`,

  geoSearch: (query) =>
    `${BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${API_KEY}`,

  currentByCoords: (lat, lon, units) =>
    `${BASE_URL}/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}`,

  forecastByCoords: (lat, lon, units) =>
    `${BASE_URL}/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}&cnt=40`,

  iconUrl: (iconCode) =>
    `https://openweathermap.org/img/wn/${iconCode}@2x.png`,
};

// ─── Custom Error Class ──────────────────────────────────────────────────────

export class WeatherError extends Error {
  /**
   * @param {string} message  - Human-readable message
   * @param {number} status   - HTTP status code (0 = network failure)
   */
  constructor(message, status = 0) {
    super(message);
    this.name    = 'WeatherError';
    this.status  = status;
  }
}

// ─── Core Fetch Helper ───────────────────────────────────────────────────────

/**
 * Generic fetch wrapper with error classification.
 * @param {string} url
 * @returns {Promise<Object>} Parsed JSON data
 * @throws {WeatherError}
 */
async function apiFetch(url) {
  let response;

  try {
    response = await fetch(url);
  } catch (_networkErr) {
    // fetch() itself threw — user is offline or DNS failed
    throw new WeatherError('Network error. Please check your internet connection.', 0);
  }

  if (!response.ok) {
    let errorBody = {};
    try { errorBody = await response.json(); } catch (_) { /* ignore */ }

    const msg = errorBody.message || response.statusText || 'API error';

    switch (response.status) {
      case 401: throw new WeatherError('Invalid API key. Update API_KEY in js/api.js.', 401);
      case 404: throw new WeatherError(`City not found. Try a different spelling.`, 404);
      case 429: throw new WeatherError('Too many requests. Please wait a moment.', 429);
      default:  throw new WeatherError(`Weather API error: ${msg}`, response.status);
    }
  }

  try {
    return await response.json();
  } catch (_) {
    throw new WeatherError('Failed to parse API response.', response.status);
  }
}

// ─── Public API Functions ────────────────────────────────────────────────────

/**
 * Fetch current weather for a city name.
 *
 * @param {string} city   - City name (e.g. "Delhi")
 * @param {string} units  - "metric" | "imperial"
 * @returns {Promise<CurrentWeather>}
 */
export async function fetchCurrentWeather(city, units = 'metric') {
  const raw = await apiFetch(ENDPOINTS.current(city, units));
  return transformCurrent(raw, units);
}

/**
 * Fetch current weather using lat/lon (for geolocation).
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} units
 * @returns {Promise<CurrentWeather>}
 */
export async function fetchCurrentByCoords(lat, lon, units = 'metric') {
  const raw = await apiFetch(ENDPOINTS.currentByCoords(lat, lon, units));
  return transformCurrent(raw, units);
}

/**
 * Fetch 5-day / 3-hour forecast for a city name.
 *
 * @param {string} city
 * @param {string} units
 * @returns {Promise<ForecastData>}
 */
export async function fetchForecast(city, units = 'metric') {
  const raw = await apiFetch(ENDPOINTS.forecast(city, units));
  return transformForecast(raw, units);
}

/**
 * Fetch forecast using lat/lon.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} units
 * @returns {Promise<ForecastData>}
 */
export async function fetchForecastByCoords(lat, lon, units = 'metric') {
  const raw = await apiFetch(ENDPOINTS.forecastByCoords(lat, lon, units));
  return transformForecast(raw, units);
}

/**
 * Search for city suggestions using Geocoding API.
 *
 * @param {string} query
 * @returns {Promise<Array<{name: string, country: string, state?: string}>>}
 */
export async function searchCities(query) {
  if (!query || query.length < 2) return [];
  const raw = await apiFetch(ENDPOINTS.geoSearch(query));
  return raw.map(item => ({
    name:    item.name,
    country: item.country,
    state:   item.state || '',
    lat:     item.lat,
    lon:     item.lon,
    display: item.state
      ? `${item.name}, ${item.state}, ${item.country}`
      : `${item.name}, ${item.country}`,
  }));
}

/**
 * Get icon URL for a weather icon code.
 * @param {string} iconCode
 * @returns {string}
 */
export function getIconUrl(iconCode) {
  return ENDPOINTS.iconUrl(iconCode);
}

// ─── Data Transformers ───────────────────────────────────────────────────────

/**
 * Transform raw OWM current weather into a clean object.
 * @param {Object} raw
 * @param {string} units
 * @returns {CurrentWeather}
 *
 * @typedef {Object} CurrentWeather
 * @property {string}  cityName
 * @property {string}  country
 * @property {number}  lat
 * @property {number}  lon
 * @property {number}  temp
 * @property {number}  feelsLike
 * @property {number}  tempMin
 * @property {number}  tempMax
 * @property {string}  description
 * @property {string}  iconCode
 * @property {string}  iconUrl
 * @property {number}  humidity
 * @property {number}  windSpeed
 * @property {number}  windDeg
 * @property {number}  visibility   - in km
 * @property {number}  pressure     - hPa
 * @property {number}  cloudiness   - %
 * @property {number}  sunrise      - Unix timestamp
 * @property {number}  sunset       - Unix timestamp
 * @property {number}  timestamp    - Unix timestamp of observation
 * @property {string}  units
 */
function transformCurrent(raw, units) {
  return {
    cityName:    raw.name,
    country:     raw.sys?.country ?? '',
    lat:         raw.coord?.lat,
    lon:         raw.coord?.lon,
    temp:        Math.round(raw.main.temp),
    feelsLike:   Math.round(raw.main.feels_like),
    tempMin:     Math.round(raw.main.temp_min),
    tempMax:     Math.round(raw.main.temp_max),
    description: raw.weather[0].description,
    iconCode:    raw.weather[0].icon,
    iconUrl:     ENDPOINTS.iconUrl(raw.weather[0].icon),
    humidity:    raw.main.humidity,
    windSpeed:   raw.wind?.speed ?? 0,
    windDeg:     raw.wind?.deg ?? 0,
    visibility:  raw.visibility ? (raw.visibility / 1000).toFixed(1) : 'N/A',
    pressure:    raw.main.pressure,
    cloudiness:  raw.clouds?.all ?? 0,
    sunrise:     raw.sys?.sunrise,
    sunset:      raw.sys?.sunset,
    timestamp:   raw.dt,
    units,
  };
}

/**
 * Transform raw OWM 5-day forecast into daily + hourly data.
 * @param {Object} raw
 * @param {string} units
 * @returns {ForecastData}
 *
 * @typedef {Object} ForecastData
 * @property {DailyForecast[]} daily  - 5 days, one entry per day
 * @property {HourlyItem[]}    hourly - next 8 items (24 hours, 3-hr steps)
 *
 * @typedef {Object} DailyForecast
 * @property {string} date       - "Mon", "Tue" etc.
 * @property {string} fullDate   - "June 17"
 * @property {number} high
 * @property {number} low
 * @property {string} description
 * @property {string} iconCode
 * @property {string} iconUrl
 * @property {number} humidity
 * @property {number} rainChance  - 0-100
 *
 * @typedef {Object} HourlyItem
 * @property {string} time       - "3 PM", "6 PM" etc.
 * @property {number} temp
 * @property {string} iconCode
 * @property {string} iconUrl
 */
function transformForecast(raw, units) {
  const list = raw.list; // 3-hour intervals

  // ── Hourly: first 8 items = next 24 hours ──
  const hourly = list.slice(0, 8).map(item => ({
    time:      formatHour(item.dt),
    temp:      Math.round(item.main.temp),
    iconCode:  item.weather[0].icon,
    iconUrl:   ENDPOINTS.iconUrl(item.weather[0].icon),
    pop:       Math.round((item.pop ?? 0) * 100), // probability of precipitation
  }));

  // ── Daily: group by calendar day, pick representative entry ──
  const dayMap = new Map();

  list.forEach(item => {
    const dateKey = new Date(item.dt * 1000).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, {
        temps: [],
        pops:  [],
        entries: [],
      });
    }

    const day = dayMap.get(dateKey);
    day.temps.push(item.main.temp);
    day.pops.push(item.pop ?? 0);
    day.entries.push(item);
  });

  // Convert map to sorted array, skip today if we already have current data
  const daily = [];
  for (const [dateKey, data] of dayMap) {
    if (daily.length >= 5) break;

    // Pick noon-ish entry as representative weather icon/description
    const midEntry = data.entries[Math.floor(data.entries.length / 2)];
    const [weekday, ...rest] = dateKey.split(',');

    daily.push({
      date:        weekday.trim(),
      fullDate:    rest.join(',').trim(),
      high:        Math.round(Math.max(...data.temps)),
      low:         Math.round(Math.min(...data.temps)),
      description: midEntry.weather[0].description,
      iconCode:    midEntry.weather[0].icon,
      iconUrl:     ENDPOINTS.iconUrl(midEntry.weather[0].icon),
      humidity:    midEntry.main.humidity,
      rainChance:  Math.round(Math.max(...data.pops) * 100),
    });
  }

  return { daily, hourly };
}

// ─── Date/Time Helpers ───────────────────────────────────────────────────────

/**
 * Format Unix timestamp as "3 PM" etc.
 * @param {number} unixTs
 * @returns {string}
 */
function formatHour(unixTs) {
  return new Date(unixTs * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: true,
  });
}