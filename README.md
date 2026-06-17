# WeatherLens — Weather Dashboard Application

> **Week 6 Assignment** · Advanced JavaScript & APIs  
> Sharda University · B.Tech CSE · Batch 2023–2027

---

## 📌 Project Overview

**WeatherLens** is a fully client-side weather dashboard that fetches real-time data from the OpenWeatherMap API. It displays current weather conditions and a 5-day forecast, supports city search with live autocomplete, saves user preferences with Local Storage, and includes dark/light theme switching and geolocation support.

**Live Features:**
- Real-time weather data via async/await API calls
- 5-day daily forecast + 24-hour hourly view
- City search with debounced autocomplete (Geocoding API)
- Browser geolocation support
- Favourite cities persisted in Local Storage
- Dark/Light theme toggle persisted in Local Storage
- °C / °F unit toggle with data re-fetch
- Responsive design (mobile → desktop)
- Accessible: ARIA labels, keyboard navigation, reduced-motion support
- Error handling with user-friendly messages
- Loading skeleton animation

---

## ⚙️ Setup Instructions

### 1. Get a Free API Key

1. Sign up at [openweathermap.org](https://openweathermap.org/api)
2. Go to **API Keys** tab in your account dashboard
3. Copy your default key (or create a new one)
4. Note: New keys take ~10 minutes to activate

### 2. Add Your API Key

Open `js/api.js` and replace line 17:
```javascript
// Before
const API_KEY = 'YOUR_API_KEY_HERE';

// After
const API_KEY = 'abc123youractualkey456';
```

### 3. Open the Project

**Option A — Direct (simplest):**  
Just open `index.html` in your browser.

> ⚠️ Some browsers block ES modules (`type="module"`) when opened as `file://`.  
> If you see a CORS error in the console, use Option B.

**Option B — Local Server (recommended):**
```bash
# Using VS Code Live Server extension → click "Go Live"
# OR using Python
python -m http.server 5500
# Then open: http://localhost:5500
```

---

## 📁 Code Structure

```
weather-dashboard/
├── index.html              ← Semantic HTML, single-page app shell
├── css/
│   └── styles.css          ← All styles: CSS variables, dark/light themes, responsive
├── js/
│   ├── api.js              ← OpenWeatherMap API calls, data transformation
│   ├── storage.js          ← All localStorage read/write operations
│   └── app.js              ← Main controller: UI logic, event listeners, rendering
├── screenshots/            ← Add screenshots here for submission
└── README.md               ← This file
```

### Module Responsibilities

| File | Purpose |
|------|---------|
| `api.js` | API endpoints, fetch wrapper, error classification, data transformers |
| `storage.js` | localStorage abstraction — preferences, last city, favourites |
| `app.js` | Connects API + storage, renders DOM, handles all user events |
| `styles.css` | Design system via CSS custom properties, responsive layout |

---

## 🖼️ Screenshots

> Add screenshots to the `screenshots/` folder:
> - `screenshots/dark-theme.png` — Dashboard in dark mode
> - `screenshots/light-theme.png` — Dashboard in light mode
> - `screenshots/forecast.png` — 5-day forecast section
> - `screenshots/mobile.png` — Mobile responsive view
> - `screenshots/search.png` — City autocomplete in action

---

## 🔧 Technical Details

### Asynchronous JavaScript

All API calls use `async/await` with `Promise.all()` for parallel requests:

```javascript
// api.js — fires both API calls simultaneously (faster than sequential)
const [current, forecast] = await Promise.all([
  fetchCurrentWeather(city, units),
  fetchForecast(city, units),
]);
```

### Error Handling Architecture

Custom `WeatherError` class for typed error handling:

```javascript
// api.js
export class WeatherError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name   = 'WeatherError';
    this.status = status;   // HTTP status code
  }
}

// HTTP status codes → user messages
switch (response.status) {
  case 401: throw new WeatherError('Invalid API key.');
  case 404: throw new WeatherError('City not found.');
  case 429: throw new WeatherError('Too many requests. Please wait.');
  default:  throw new WeatherError(`API error: ${msg}`, response.status);
}
```

### Debouncing

Search input fires API calls only after user stops typing (300ms gap):

```javascript
// app.js
function debounce(fn, delay) {
  let timerId;
  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedSearch = debounce(async (query) => {
  const results = await searchCities(query);
  showSuggestions(results);
}, 300);
```

**Why debounce matters:** Without it, typing "Delhi" would fire 5 API calls (D, De, Del, Delh, Delhi). With 300ms debounce, only 1 call fires (after user pauses).

### Local Storage Architecture

Three separate storage keys with safe wrappers:

| Key | Type | Content |
|-----|------|---------|
| `wl_prefs` | Object | `{ units: "metric", theme: "dark" }` |
| `wl_lastCity` | String | `"Delhi"` |
| `wl_favorites` | Array | `["Delhi", "Mumbai", "London"]` |

```javascript
// storage.js — safe wrapper prevents app crash if storage is full/blocked
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    console.warn('[WeatherLens] localStorage write failed:', key);
    return false;
  }
}
```

### Data Transformation

Raw API response → clean app data objects:

```javascript
// Raw OWM response has messy nested structure
// Transformer creates a flat, typed, consistent object

function transformCurrent(raw, units) {
  return {
    temp:        Math.round(raw.main.temp),
    feelsLike:   Math.round(raw.main.feels_like),
    description: raw.weather[0].description,
    windSpeed:   raw.wind?.speed ?? 0,   // optional chaining + nullish fallback
    visibility:  raw.visibility ? (raw.visibility / 1000).toFixed(1) : 'N/A',
    // ... etc
  };
}
```

### ES Modules

Files are organised as ES modules (`type="module"` in HTML):

```javascript
// api.js — named exports
export async function fetchCurrentWeather(city, units) { ... }
export class WeatherError extends Error { ... }

// app.js — imports only what it needs
import { fetchCurrentWeather, WeatherError } from './api.js';
import { loadPreferences, saveLastCity }     from './storage.js';
```

---

## 🌐 API Documentation

### OpenWeatherMap APIs Used

#### 1. Current Weather
```
GET https://api.openweathermap.org/data/2.5/weather
  ?q={city_name}
  &appid={API_KEY}
  &units=metric
```
**Response fields used:** `main.temp`, `main.feels_like`, `main.humidity`, `main.pressure`, `weather[0].description`, `weather[0].icon`, `wind.speed`, `visibility`, `coord.lat`, `coord.lon`, `sys.country`, `dt`

#### 2. 5-Day / 3-Hour Forecast
```
GET https://api.openweathermap.org/data/2.5/forecast
  ?q={city_name}
  &appid={API_KEY}
  &units=metric
  &cnt=40
```
Returns 40 entries × 3 hours = 5 days of data. Grouped by calendar day in `transformForecast()`.

#### 3. Geocoding (City Search)
```
GET https://api.openweathermap.org/geo/1.0/direct
  ?q={search_query}
  &limit=5
  &appid={API_KEY}
```
Returns up to 5 matching cities with coordinates. Used for the autocomplete suggestions dropdown.

#### 4. Weather Icons
```
https://openweathermap.org/img/wn/{icon_code}@2x.png
```
Example: `https://openweathermap.org/img/wn/01d@2x.png` = clear sky, day

---

## ✅ Testing Evidence

### Manual Test Cases

| Test | Input | Expected Result |
|------|-------|----------------|
| Valid city search | "Delhi" | Weather data displayed |
| Invalid city | "xyzabc123" | Error: "City not found" |
| Empty search | (empty input) | No API call made |
| Unit toggle °C→°F | Click °F button | Data re-fetched in imperial |
| Save favourite | Click "☆ Save City" | City appears in favourites bar |
| Remove favourite | Click ✕ on chip | City removed from bar |
| Theme toggle | Click 🌙 button | Theme switches, preference saved |
| Page refresh | — | Last city & preferences restored |
| Geolocation | Click 📍 button | Weather for current location |
| Offline | Disconnect internet | Error: "Network error. Check connection" |
| API key invalid | Wrong key | Error: "Invalid API key" |

### Browser DevTools Verification

**Network tab:**
- Observe 2 parallel GET requests on city search (current + forecast)
- Debounce: search suggestions fire only after 300ms pause
- All requests show `200 OK` for valid cities

**Application → Local Storage tab:**
- `wl_prefs` updates when theme/unit changes
- `wl_lastCity` updates on every successful search
- `wl_favorites` updates when adding/removing cities

---

## 💡 Key Concepts Demonstrated

| Concept | Where |
|---------|-------|
| `async/await` | `api.js` — all fetch functions |
| `Promise.all()` | `app.js` — parallel current + forecast fetch |
| `try/catch` error handling | `api.js` `apiFetch()`, `app.js` `loadWeather()` |
| Debouncing | `app.js` `debounce()` + `debouncedSearch` |
| Custom Error class | `api.js` `WeatherError` |
| ES Modules (import/export) | All 3 JS files |
| localStorage CRUD | `storage.js` — all 4 operations |
| DOM manipulation | `app.js` — all render functions |
| Event delegation | `app.js` — favourites bar click handler |
| Optional chaining (`?.`) | `api.js` — `raw.wind?.speed ?? 0` |
| Nullish coalescing (`??`) | `api.js` — fallback values |
| XSS prevention | `app.js` — `escapeHtml()` on user input |
| Accessibility | `index.html` — ARIA attributes, keyboard nav |
| Responsive CSS | `styles.css` — media queries, CSS Grid |
| CSS Custom Properties | `styles.css` — full design token system |

---

*Built by [Your Name] · Week 6 · June 2026*