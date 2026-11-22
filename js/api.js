import { MODELS } from './locales.js';

const BASE_SURFACE_VARS = [
  'temperature_2m',
  'dew_point_2m',
  'relative_humidity_2m',
  'precipitation',
  'precipitation_probability',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'visibility',
  'surface_pressure',
  'weather_code',
];

const EXTRA_WIND_VARS = [
  'wind_speed_80m',
  'wind_direction_80m',
  'wind_speed_120m',
  'wind_direction_120m',
];

function buildPressureVars(levels) {
  const vars = [];
  for (const p of levels) {
    vars.push(
      `temperature_${p}hPa`,
      `relative_humidity_${p}hPa`,
      `wind_speed_${p}hPa`,
      `wind_direction_${p}hPa`,
      `geopotential_height_${p}hPa`
    );
  }
  return vars;
}

const cache = new Map();

async function fetchSingleModel(model, lat, lon) {
  const isEcmwf = model.id === 'ecmwf';
  const pressureLevels = isEcmwf ? [1000, 925, 850] : [1000, 975, 950, 925, 900, 850];
  const hourlyVars = [
    ...BASE_SURFACE_VARS,
    ...(isEcmwf ? [] : EXTRA_WIND_VARS),
    ...buildPressureVars(pressureLevels),
  ];

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: hourlyVars.join(','),
    daily: 'sunrise,sunset',
    models: model.apiModel,
    wind_speed_unit: 'ms',
    timezone: 'Europe/Kyiv',
    forecast_days: '7',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo ${model.name}: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchAllModels(lat, lon, force = false) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.ts < 10 * 60 * 1000) {
    return cached.data;
  }

  const results = await Promise.allSettled(
    MODELS.map((m) => fetchSingleModel(m, lat, lon))
  );

  const data = {};
  results.forEach((r, idx) => {
    const modelId = MODELS[idx].id;
    if (r.status === 'fulfilled') {
      data[modelId] = r.value;
    } else {
      console.warn(`Model ${modelId} failed:`, r.reason);
      data[modelId] = null;
    }
  });

  if (!data.icon && !data.ecmwf && !data.gfs) {
    throw new Error('Не вдалося отримати дані від Open-Meteo. Перевірте інтернет.');
  }

  cache.set(key, { ts: Date.now(), data });
  return data;
}

export async function fetchKpIndex() {
  const endpoints = [
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length < 2) continue;
      const last = rows[rows.length - 1];
      let val = null;
      if (Array.isArray(last)) {
        val = parseFloat(last[1]);
      } else if (last && typeof last === 'object') {
        val = parseFloat(last.kp_index ?? last.Kp ?? last.estimated_kp);
      }
      if (Number.isFinite(val)) return val;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function searchUkraineCities(query) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Check if user entered direct coordinates like "48.74, 37.58"
  const coordMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return [
        {
          name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
          region: 'Введені координати',
          lat,
          lon,
        },
      ];
    }
  }

  const params = new URLSearchParams({
    name: trimmed,
    count: '8',
    language: 'uk',
    format: 'json',
    countryCode: 'UA',
  });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!res.ok) return [];
  const json = await res.json();
  if (!json.results) return [];
  return json.results.map((r) => ({
    name: r.name,
    region: r.admin1 || 'Україна',
    lat: r.latitude,
    lon: r.longitude,
  }));
}
