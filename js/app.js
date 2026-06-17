/**
 * app.js — WeatherLens
 * Main application controller.
 *
 * Responsibilities:
 *  - Bootstrap (load preferences, restore last city)
 *  - Search with debouncing + live suggestions
 *  - Geolocation support
 *  - Render current weather + forecast + hourly
 *  - Manage favourites
 *  - Theme toggle (dark/light)
 *  - Unit toggle (°C / °F)
 *  - Loading states, skeleton, error display
 */

import {
  fetchCurrentWeather,
  fetchCurrentByCoords,
  fetchForecast,
  fetchForecastByCoords,
  searchCities,
  WeatherError,
} from './api.js';

import {
  loadPreferences,
  updatePreference,
  saveLastCity,
  getLastCity,
  loadFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
} from './storage.js';

// ─── App State ───────────────────────────────────────────────────────────────

const state = {
  currentCity:    null,   // string city name
  currentData:    null,   // CurrentWeather object
  prefs:          loadPreferences(),
  isLoading:      false,
};

// ─── DOM References ───────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const dom = {
  cityInput:      $('cityInput'),
  searchBtn:      $('searchBtn'),
  suggestionsBox: $('suggestionsBox'),
  favoritesBar:   $('favoritesBar'),
  errorBanner:    $('errorBanner'),
  errorMessage:   $('errorMessage'),
  errorClose:     $('errorClose'),
  skeletonLoader: $('skeletonLoader'),
  weatherContent: $('weatherContent'),
  emptyState:     $('emptyState'),
  themeToggleBtn: $('themeToggleBtn'),
  themeIcon:      $('themeIcon'),
  locationBtn:    $('locationBtn'),
  // Current weather
  cityName:       $('cityName'),
  cityMeta:       $('cityMeta'),
  lastUpdated:    $('lastUpdated'),
  weatherIcon:    $('weatherIcon'),
  tempValue:      $('tempValue'),
  weatherDesc:    $('weatherDesc'),
  feelsLike:      $('feelsLike'),
  humidity:       $('humidity'),
  windSpeed:      $('windSpeed'),
  visibility:     $('visibility'),
  pressure:       $('pressure'),
  uvIndex:        $('uvIndex'),
  btnCelsius:     $('btnCelsius'),
  btnFahrenheit:  $('btnFahrenheit'),
  favBtn:         $('favBtn'),
  // Forecast
  forecastGrid:   $('forecastGrid'),
  hourlyScroll:   $('hourlyScroll'),
};

// ─── Utility: Debounce ────────────────────────────────────────────────────────

/**
 * Debounce a function — delays execution until `delay` ms after last call.
 * Used for city search input to avoid spamming the API.
 *
 * @param {Function} fn
 * @param {number}   delay - milliseconds
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timerId;
  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ─── Theme Management ─────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  dom.themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const next = state.prefs.theme === 'dark' ? 'light' : 'dark';
  state.prefs.theme = next;
  updatePreference('theme', next);
  applyTheme(next);
}

// ─── Unit Management ──────────────────────────────────────────────────────────

function applyUnit(units) {
  const isCelsius = units === 'metric';
  dom.btnCelsius.classList.toggle('active', isCelsius);
  dom.btnFahrenheit.classList.toggle('active', !isCelsius);
}

function setUnit(units) {
  if (state.prefs.units === units) return;
  state.prefs.units = units;
  updatePreference('units', units);
  applyUnit(units);
  // Re-fetch with new unit if we have a city
  if (state.currentCity) {
    loadWeather(state.currentCity);
  }
}

// ─── Loading / Error UI ───────────────────────────────────────────────────────

function showSkeleton() {
  dom.skeletonLoader.hidden   = false;
  dom.weatherContent.hidden   = true;
  dom.emptyState.hidden       = true;
  dom.errorBanner.hidden      = true;
  dom.searchBtn.disabled      = true;
  dom.searchBtn.textContent   = '…';
}

function hideSkeleton() {
  dom.skeletonLoader.hidden   = true;
  dom.searchBtn.disabled      = false;
  dom.searchBtn.textContent   = 'Search';
}

function showWeatherContent() {
  dom.weatherContent.hidden   = false;
  dom.emptyState.hidden       = true;
}

function showEmptyState() {
  dom.emptyState.hidden       = false;
  dom.weatherContent.hidden   = true;
}

function showError(message) {
  dom.errorMessage.textContent = message;
  dom.errorBanner.hidden       = false;
}

function hideError() {
  dom.errorBanner.hidden = true;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Render current weather data into the UI.
 * @param {import('./api.js').CurrentWeather} data
 */
function renderCurrentWeather(data) {
  const unitSymbol = data.units === 'metric' ? '°C' : '°F';
  const speedUnit  = data.units === 'metric' ? 'km/h' : 'mph';
  const windKmh    = data.units === 'metric'
    ? (data.windSpeed * 3.6).toFixed(1)  // m/s → km/h
    : data.windSpeed.toFixed(1);

  dom.cityName.textContent    = data.cityName;
  dom.cityMeta.textContent    = `${data.country} · ${data.lat?.toFixed(2)}°N, ${data.lon?.toFixed(2)}°E`;
  dom.lastUpdated.textContent = `Updated ${formatTime(data.timestamp)}`;
  dom.weatherIcon.src         = data.iconUrl;
  dom.weatherIcon.alt         = data.description;
  dom.tempValue.textContent   = `${data.temp}${unitSymbol}`;
  dom.weatherDesc.textContent = data.description;
  dom.feelsLike.textContent   = `${data.feelsLike}${unitSymbol}`;
  dom.humidity.textContent    = `${data.humidity}%`;
  dom.windSpeed.textContent   = `${windKmh} ${speedUnit}`;
  dom.visibility.textContent  = data.visibility !== 'N/A' ? `${data.visibility} km` : 'N/A';
  dom.pressure.textContent    = `${data.pressure} hPa`;
  dom.uvIndex.textContent     = 'N/A'; // Not in free OWM tier — can be fetched separately

  // Favourite button state
  updateFavBtn(data.cityName);
}

/**
 * Render 5-day forecast cards.
 * @param {import('./api.js').DailyForecast[]} daily
 */
function renderForecast(daily) {
  dom.forecastGrid.innerHTML = daily.map(day => `
    <div class="forecast-card" tabindex="0" aria-label="${day.date}: ${day.description}, high ${day.high}°, low ${day.low}°">
      <p class="forecast-day">${day.date}</p>
      <p class="forecast-date-small" style="font-size:0.65rem;color:var(--clr-text-dim);margin-bottom:6px">${day.fullDate}</p>
      <img class="forecast-icon" src="${day.iconUrl}" alt="${day.description}" width="48" height="48" />
      <p class="forecast-desc">${day.description}</p>
      <div class="forecast-temps">
        <span class="temp-high">${day.high}°</span>
        <span class="temp-low">${day.low}°</span>
      </div>
      ${day.rainChance > 0
        ? `<p class="forecast-rain">💧 ${day.rainChance}%</p>`
        : ''}
    </div>
  `).join('');
}

/**
 * Render hourly scroll cards.
 * @param {import('./api.js').HourlyItem[]} hourly
 */
function renderHourly(hourly) {
  dom.hourlyScroll.innerHTML = hourly.map((item, idx) => `
    <div class="hourly-card ${idx === 0 ? 'current-hour' : ''}" aria-label="${item.time}: ${item.temp}°">
      <p class="hourly-time">${idx === 0 ? 'Now' : item.time}</p>
      <img class="hourly-icon" src="${item.iconUrl}" alt="" width="36" height="36" />
      <p class="hourly-temp">${item.temp}°</p>
      ${item.pop > 0 ? `<p style="font-size:0.65rem;color:var(--clr-accent);margin-top:2px">💧${item.pop}%</p>` : ''}
    </div>
  `).join('');
}

// ─── Favourites UI ────────────────────────────────────────────────────────────

/**
 * Rebuild the favourites bar from localStorage.
 */
function renderFavoritesBar() {
  const favorites = loadFavorites();
  if (favorites.length === 0) {
    dom.favoritesBar.innerHTML = '';
    return;
  }

  dom.favoritesBar.innerHTML = favorites.map(city => `
    <div class="fav-chip" role="button" tabindex="0" aria-label="Load weather for ${city}"
         data-city="${escapeHtml(city)}">
      ${escapeHtml(city)}
      <button class="fav-chip-remove" aria-label="Remove ${city} from favourites"
              data-remove="${escapeHtml(city)}">✕</button>
    </div>
  `).join('');
}

/**
 * Update the "Save City" button style based on whether city is saved.
 * @param {string} city
 */
function updateFavBtn(city) {
  const saved = isFavorite(city);
  dom.favBtn.textContent = saved ? '★ Saved' : '☆ Save City';
  dom.favBtn.classList.toggle('saved', saved);
  dom.favBtn.setAttribute('aria-pressed', saved);
}

// ─── Main Data Load ───────────────────────────────────────────────────────────

/**
 * Load weather + forecast for a city name, then render everything.
 * @param {string} city
 */
async function loadWeather(city) {
  if (state.isLoading) return;
  state.isLoading = true;

  hideError();
  showSkeleton();

  try {
    // Fire both requests in parallel for speed
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(city, state.prefs.units),
      fetchForecast(city, state.prefs.units),
    ]);

    state.currentCity = city;
    state.currentData = current;

    renderCurrentWeather(current);
    renderForecast(forecast.daily);
    renderHourly(forecast.hourly);

    saveLastCity(city);
    hideSkeleton();
    showWeatherContent();

  } catch (err) {
    hideSkeleton();
    showEmptyState();

    if (err instanceof WeatherError) {
      showError(err.message);
    } else {
      showError('An unexpected error occurred. Please try again.');
      console.error('[WeatherLens] Unexpected error:', err);
    }
  } finally {
    state.isLoading = false;
  }
}

/**
 * Load weather using browser Geolocation API.
 */
async function loadWeatherByLocation() {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }

  if (state.isLoading) return;
  state.isLoading = true;
  hideError();
  showSkeleton();

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude: lat, longitude: lon } = position.coords;
      try {
        const [current, forecast] = await Promise.all([
          fetchCurrentByCoords(lat, lon, state.prefs.units),
          fetchForecastByCoords(lat, lon, state.prefs.units),
        ]);

        state.currentCity = current.cityName;
        state.currentData = current;
        dom.cityInput.value = current.cityName;

        renderCurrentWeather(current);
        renderForecast(forecast.daily);
        renderHourly(forecast.hourly);

        saveLastCity(current.cityName);
        hideSkeleton();
        showWeatherContent();

      } catch (err) {
        hideSkeleton();
        showEmptyState();
        showError(err instanceof WeatherError ? err.message : 'Failed to load weather for your location.');
      } finally {
        state.isLoading = false;
      }
    },
    (geoErr) => {
      state.isLoading = false;
      hideSkeleton();
      showEmptyState();
      showError('Location access denied. Please allow location access or search manually.');
      console.warn('[WeatherLens] Geolocation error:', geoErr.message);
    },
    { timeout: 10_000 }
  );
}

// ─── City Search + Suggestions ───────────────────────────────────────────────

/**
 * Show the suggestions dropdown.
 * @param {Array<{display:string, name:string}>} suggestions
 */
function showSuggestions(suggestions) {
  if (!suggestions.length) {
    hideSuggestions();
    return;
  }

  dom.suggestionsBox.innerHTML = suggestions.map((s, i) => `
    <li class="suggestion-item" role="option" aria-selected="false"
        tabindex="-1" data-index="${i}" data-city="${escapeHtml(s.name)}">
      ${escapeHtml(s.display)}
    </li>
  `).join('');

  dom.suggestionsBox.hidden = false;
}

function hideSuggestions() {
  dom.suggestionsBox.hidden = true;
  dom.suggestionsBox.innerHTML = '';
}

// Debounced version of city search for input events (300ms delay)
const debouncedSearch = debounce(async (query) => {
  if (query.length < 2) { hideSuggestions(); return; }
  try {
    const results = await searchCities(query);
    showSuggestions(results);
  } catch (_) {
    hideSuggestions();
  }
}, 300);

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Search input: debounced suggestions
dom.cityInput.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  debouncedSearch(q);
});

// Search button click
dom.searchBtn.addEventListener('click', () => {
  const city = dom.cityInput.value.trim();
  if (!city) return;
  hideSuggestions();
  loadWeather(city);
});

// Enter key in search box
dom.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const city = dom.cityInput.value.trim();
    if (!city) return;
    hideSuggestions();
    loadWeather(city);
  }

  // Arrow key navigation through suggestions
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const first = dom.suggestionsBox.querySelector('.suggestion-item');
    first?.focus();
  }
});

// Click on a suggestion
dom.suggestionsBox.addEventListener('click', (e) => {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  const city = item.dataset.city;
  dom.cityInput.value = item.textContent.trim();
  hideSuggestions();
  loadWeather(city);
});

// Keyboard navigation inside suggestions list
dom.suggestionsBox.addEventListener('keydown', (e) => {
  const items = [...dom.suggestionsBox.querySelectorAll('.suggestion-item')];
  const idx   = items.indexOf(document.activeElement);

  if (e.key === 'Enter' && idx >= 0) {
    const city = items[idx].dataset.city;
    dom.cityInput.value = items[idx].textContent.trim();
    hideSuggestions();
    loadWeather(city);
  } else if (e.key === 'ArrowDown' && idx < items.length - 1) {
    e.preventDefault();
    items[idx + 1].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (idx > 0) items[idx - 1].focus();
    else dom.cityInput.focus();
  } else if (e.key === 'Escape') {
    hideSuggestions();
    dom.cityInput.focus();
  }
});

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!dom.cityInput.contains(e.target) && !dom.suggestionsBox.contains(e.target)) {
    hideSuggestions();
  }
});

// Theme toggle
dom.themeToggleBtn.addEventListener('click', toggleTheme);

// Geolocation button
dom.locationBtn.addEventListener('click', loadWeatherByLocation);

// Error dismiss
dom.errorClose.addEventListener('click', hideError);

// Unit toggle buttons
dom.btnCelsius.addEventListener('click',    () => setUnit('metric'));
dom.btnFahrenheit.addEventListener('click', () => setUnit('imperial'));

// Favourites: add current city
dom.favBtn.addEventListener('click', () => {
  if (!state.currentCity) return;

  if (isFavorite(state.currentCity)) {
    removeFavorite(state.currentCity);
  } else {
    addFavorite(state.currentCity);
  }

  updateFavBtn(state.currentCity);
  renderFavoritesBar();
});

// Favourites bar: click chip → load city, click ✕ → remove
dom.favoritesBar.addEventListener('click', (e) => {
  // Remove button
  const removeBtn = e.target.closest('.fav-chip-remove');
  if (removeBtn) {
    e.stopPropagation();
    removeFavorite(removeBtn.dataset.remove);
    renderFavoritesBar();
    if (state.currentCity) updateFavBtn(state.currentCity);
    return;
  }

  // Load chip city
  const chip = e.target.closest('.fav-chip');
  if (chip) {
    const city = chip.dataset.city;
    dom.cityInput.value = city;
    loadWeather(city);
  }
});

// Favourites bar: keyboard
dom.favoritesBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const chip = e.target.closest('.fav-chip');
    if (chip) {
      e.preventDefault();
      const city = chip.dataset.city;
      dom.cityInput.value = city;
      loadWeather(city);
    }
  }
});

// ─── Utility Helpers ──────────────────────────────────────────────────────────

/**
 * Format Unix timestamp as a short time string.
 * @param {number} unixTs
 * @returns {string} e.g. "3:45 PM"
 */
function formatTime(unixTs) {
  return new Date(unixTs * 1000).toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── App Bootstrap ────────────────────────────────────────────────────────────

function init() {
  // Apply saved preferences
  applyTheme(state.prefs.theme);
  applyUnit(state.prefs.units);

  // Render saved favourites
  renderFavoritesBar();

  // Restore last searched city
  const lastCity = getLastCity();
  if (lastCity) {
    dom.cityInput.value = lastCity;
    loadWeather(lastCity);
  } else {
    showEmptyState();
  }
}

// Run when DOM is ready (script is type="module" so it's always deferred)
init();