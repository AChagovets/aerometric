import {
  PRESETS_DONETSK,
  PRESETS_UKRAINE,
  MODELS,
  COMPASS_UK,
  degToCompass,
  getCopy,
  formatCityDisplay,
} from './locales.js';
import {
  TARGET_ALTITUDES_AGL,
  buildHourSnapshot,
  evaluateCellSuitability,
  formatWindValue,
  windSeverity,
} from './physics.js';
import { fetchAllModels, fetchKpIndex, searchUkraineCities } from './api.js';

const STORAGE_KEY = 'aerometric_ua_state_v4';

const POKROVSK = PRESETS_DONETSK.find((c) => c.name === 'Покровськ') || {
  name: 'Покровськ',
  region: 'Донецька обл.',
  lat: 48.282,
  lon: 37.176,
};

const DEFAULT_SETTINGS = {
  flightProfile: 'fpv', // 'fpv' | 'wing' (default is FPV)
  theme: 'auto', // 'light' | 'dark' | 'auto' (default is auto)
  extendedMode: false,
  militaryMode: false,
  windUnit: 'ms', // 'ms' | 'kmh'
  altRef: 'agl', // 'agl' | 'msl'
  // FPV (до 70 м) thresholds
  fpvFavBlowToDeg: 135, // 135° = ПдСх (null = disabled)
  maxFpvWind: 10, // m/s headwind / crosswind
  maxFpvWindTailwind: 15, // m/s favorable tailwind
  maxFpvGusts: 14, // m/s
  // Wing (300–1000 м) thresholds
  maxWingWind: 15, // m/s any direction
  minWingCloudBase: 300, // m AGL
  // Common thresholds
  cloudDensityThreshold: 50, // %
  maxRainProb: 65, // %
};

const state = {
  defaultLocation: { ...POKROVSK },
  location: { ...POKROVSK },
  activeTab: 'conditions', // 'conditions' | 'altitudes' | 'week' | 'settings'
  activeModel: 'icon', // 'icon' | 'ecmwf' | 'gfs'
  horizon: '24h', // '24h' | '48h' | '72h' | '7d'
  altHorizon: '24h', // '24h' | '48h' | '72h' (default 24h on Altitudes!)
  hourOffset: 0,
  weekMode: 'overview', // 'overview' | 'daily'
  weekSelectedDay: 0, // 0..6
  matrixLayer: 'overall', // 'overall' | 'wind' | 'icing' | 'temp'
  selectedCell: null, // { hourIdx, agl }
  settings: { ...DEFAULT_SETTINGS },
  modelsData: null,
  kpIndex: null,
  loading: true,
  error: null,
  baseHourIdx: 0,
};

function isSameLocation(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005;
}

function loadState() {
  try {
    const saved =
      JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') ||
      JSON.parse(localStorage.getItem('aerometric_ua_state_v2') || 'null') ||
      JSON.parse(localStorage.getItem('aerometric_ua_state_v1') || 'null');
    if (saved?.defaultLocation) {
      state.defaultLocation = saved.defaultLocation;
      state.location = { ...saved.defaultLocation };
    } else if (saved?.location) {
      state.defaultLocation = saved.location;
      state.location = { ...saved.location };
    }
    if (saved?.settings) state.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
    if (saved?.activeModel) state.activeModel = saved.activeModel;
  } catch {
    // ignore storage errors
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        defaultLocation: state.defaultLocation,
        settings: state.settings,
        activeModel: state.activeModel,
      })
    );
  } catch {
    // ignore
  }
}

function applyTheme() {
  let effective = state.settings.theme;
  if (effective === 'auto') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', effective);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#0B1016' : '#F6F8FA');

  const sun = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (sun && moon) {
    sun.classList.toggle('hidden', effective === 'light');
    moon.classList.toggle('hidden', effective === 'dark');
  }
}

function getActiveRaw() {
  if (!state.modelsData) return null;
  return (
    state.modelsData[state.activeModel] ||
    state.modelsData.icon ||
    state.modelsData.ecmwf ||
    state.modelsData.gfs
  );
}

function findCurrentHourIndex(raw) {
  if (!raw?.hourly?.time?.length) return 0;
  const now = new Date();
  const kyivNow = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  })
    .format(now)
    .replace(' ', 'T');

  const idx = raw.hourly.time.findIndex((t) => t.startsWith(kyivNow));
  return idx >= 0 ? idx : 0;
}

function formatHourShort(iso) {
  if (!iso) return '—';
  return iso.slice(11, 16);
}

const WEEKDAYS_UK = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_UK = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

function formatDayMeta(isoDate) {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    weekday: WEEKDAYS_UK[dt.getDay()],
    dateLabel: `${d} ${MONTHS_UK[m - 1]}`,
  };
}

function formatRealDateTime(iso, baseIso, isNow = false) {
  if (!iso) return '—';
  const meta = formatDayMeta(iso);
  const hr = formatHourShort(iso);
  if (isNow) return `Зараз • ${meta.weekday}, ${meta.dateLabel} • ${hr}`;

  if (baseIso) {
    const dCur = iso.slice(0, 10);
    const dBase = baseIso.slice(0, 10);
    if (dCur === dBase) return `Сьогодні (${meta.weekday}) • ${hr}`;
    const [y, m, d] = dBase.split('-').map(Number);
    const tomorrow = new Date(y, m - 1, d + 1);
    const tomStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
      tomorrow.getDate()
    ).padStart(2, '0')}`;
    if (dCur === tomStr) return `Завтра (${meta.weekday}, ${meta.dateLabel}) • ${hr}`;
  }

  return `${meta.weekday}, ${meta.dateLabel} • ${hr}`;
}

function formatScrubberDateTime(iso, baseIso, isNow = false) {
  if (!iso) return '—';
  const hr = formatHourShort(iso);
  if (isNow) return `Зараз • ${hr}`;

  if (baseIso) {
    const dCur = iso.slice(0, 10);
    const dBase = baseIso.slice(0, 10);
    if (dCur === dBase) return `Сьогодні • ${hr}`;

    const [y, m, d] = dBase.split('-').map(Number);
    const tomorrow = new Date(y, m - 1, d + 1);
    const tomStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
      tomorrow.getDate()
    ).padStart(2, '0')}`;
    if (dCur === tomStr) return `Завтра • ${hr}`;

    const afterTomorrow = new Date(y, m - 1, d + 2);
    const afterTomStr = `${afterTomorrow.getFullYear()}-${String(afterTomorrow.getMonth() + 1).padStart(2, '0')}-${String(
      afterTomorrow.getDate()
    ).padStart(2, '0')}`;
    if (dCur === afterTomStr) return `Післязавтра • ${hr}`;
  }

  const meta = formatDayMeta(iso);
  return `${meta.weekday}, ${meta.dateLabel} • ${hr}`;
}

function buildSliderTicks(raw, baseIdx, maxOffset) {
  const count = 4;
  const ticks = [];
  for (let i = 0; i <= count; i++) {
    const off = Math.round((maxOffset * i) / count);
    const idx = Math.min(raw.hourly.time.length - 1, baseIdx + off);
    const iso = raw.hourly.time[idx];
    const meta = formatDayMeta(iso);
    ticks.push(i === 0 ? `${formatHourShort(iso)}` : `${meta.weekday} ${formatHourShort(iso)}`);
  }
  return ticks.map((t) => `<span>${t}</span>`).join('');
}

function windUnitLabel() {
  return state.settings.windUnit === 'kmh' ? 'км/год' : 'м/с';
}

function windArrowHtml(deg) {
  const rot = Math.round(((deg ?? 0) + 180) % 360);
  return `<span class="dir-arrow" style="transform: rotate(${rot}deg)">↑</span>`;
}

// Data Loading
async function loadWeather(force = false) {
  state.loading = true;
  state.error = null;
  const btnRefresh = document.getElementById('btn-refresh');
  btnRefresh?.classList.add('spinning');
  updateHeader();
  if (!state.modelsData) render();

  try {
    const [modelsData, kp] = await Promise.all([
      fetchAllModels(state.location.lat, state.location.lon, force),
      fetchKpIndex(),
    ]);
    state.modelsData = modelsData;
    state.kpIndex = kp;

    const raw = getActiveRaw();
    state.baseHourIdx = findCurrentHourIndex(raw);
    if (!state.modelsData[state.activeModel]) {
      state.activeModel = state.modelsData.icon ? 'icon' : state.modelsData.ecmwf ? 'ecmwf' : 'gfs';
    }
    state.hourOffset = 0;
    state.selectedCell = null;
  } catch (err) {
    state.error = err.message || 'Помилка завантаження прогнозу';
  } finally {
    state.loading = false;
    btnRefresh?.classList.remove('spinning');
    updateHeader();
    render();
  }
}

function updateHeader() {
  const p = state.settings.flightProfile === 'wing' ? 'wing' : 'fpv';
  document.querySelectorAll('button[data-flight-profile]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.flightProfile === p);
  });
}

// =========================================================
// Shared Components
// =========================================================

function renderProfileSwitcher() {
  const p = state.settings.flightProfile === 'wing' ? 'wing' : 'fpv';
  return `
    <div class="top-profile-wrap">
      <button class="top-profile-btn ${p === 'fpv' ? 'active' : ''}" data-flight-profile="fpv">FPV (до 70 м)</button>
      <button class="top-profile-btn ${p === 'wing' ? 'active' : ''}" data-flight-profile="wing">Крила (300–1000 м)</button>
    </div>
  `;
}

function renderModelStrip(hourIdx) {
  const unit = windUnitLabel();
  const profile = state.settings.flightProfile || 'all';
  const cardsHtml = MODELS.map((m) => {
    const rawM = state.modelsData?.[m.id];
    const isActive = state.activeModel === m.id;
    let quickStat = 'немає даних';
    if (rawM && rawM.hourly?.time?.[hourIdx]) {
      const snap = buildHourSnapshot(rawM, hourIdx, state.settings, state.kpIndex);
      if (profile === 'fpv') {
        quickStat = `${formatWindValue(snap.fpv.max, state.settings.windUnit)} (пор. ${formatWindValue(
          snap.fpv.gusts,
          state.settings.windUnit
        )}) ${unit}`;
      } else if (profile === 'wing') {
        quickStat = `${formatWindValue(snap.wing.min, state.settings.windUnit)}–${formatWindValue(
          snap.wing.max,
          state.settings.windUnit
        )} ${unit}`;
      } else {
        quickStat = `${formatWindValue(snap.fpv.wind10, state.settings.windUnit)} / ${formatWindValue(
          snap.wing.max,
          state.settings.windUnit
        )} ${unit}`;
      }
    }
    return `
      <button class="model-card ${isActive ? 'active' : ''}" data-model="${m.id}" ${!rawM ? 'disabled' : ''}>
        <div class="model-top">
          <span class="model-name">${m.name}</span>
          <span class="model-badge">${m.badge}</span>
        </div>
        <div class="model-meta">${m.shortDesc}</div>
        <div class="model-quick-stat">${quickStat}</div>
      </button>
    `;
  }).join('');

  return `
    <section>
      <div class="section-head" style="margin-bottom:8px;">
        <span class="section-label">Погодні моделі (тапай для порівняння)</span>
        <button class="info-link" id="btn-models-info">? Про моделі</button>
      </div>
      <div class="model-strip">${cardsHtml}</div>
    </section>
  `;
}

function buildDailySummaries(raw) {
  const copy = getCopy(state.settings.militaryMode);
  const daysMap = new Map();
  const times = raw.hourly.time;

  for (let i = 0; i < times.length; i++) {
    const dKey = times[i].slice(0, 10);
    if (!daysMap.has(dKey)) daysMap.set(dKey, []);
    daysMap.get(dKey).push(i);
  }

  const summaries = [];
  for (const [dateStr, indices] of daysMap.entries()) {
    const relevant = indices.filter((i) => {
      const hr = parseInt(times[i].slice(11, 13), 10);
      return hr >= 6 && hr <= 21;
    });
    const useIdx = relevant.length ? relevant : indices;
    const snaps = useIdx.map((i) => buildHourSnapshot(raw, i, state.settings, state.kpIndex));

    const fpvMax = Math.max(...snaps.map((s) => s.fpv.max));
    const wingMax = Math.max(...snaps.map((s) => s.wing.max));
    const tempMin = Math.min(...snaps.map((s) => s.temp2m));
    const tempMax = Math.max(...snaps.map((s) => s.temp2m));
    const rainProb = Math.max(...snaps.map((s) => s.precipProb));
    const hasHighIce = snaps.some((s) => s.icingLevel === 'high');
    const hasModIce = snaps.some((s) => s.icingLevel === 'mod');
    const hasLowCloudCrit = snaps.some((s) => s.cloudBase.severity === 'danger');

    const dangerCount = snaps.filter((s) => s.status === 'danger').length;
    const warnCount = snaps.filter((s) => s.status === 'warn').length;
    let dayStatus = 'good';
    let dayLabel = copy.dayGood;
    if (dangerCount >= Math.ceil(snaps.length * 0.45)) {
      dayStatus = 'danger';
      dayLabel = copy.dayDanger;
    } else if (dangerCount > 0 || warnCount >= Math.ceil(snaps.length * 0.4)) {
      dayStatus = 'warn';
      dayLabel = copy.dayWarn;
    }

    summaries.push({
      dateStr,
      ...formatDayMeta(dateStr),
      indices,
      fpvMax,
      wingMax,
      tempMin,
      tempMax,
      rainProb,
      icing: hasHighIce ? 'high' : hasModIce ? 'mod' : 'none',
      hasLowCloudCrit,
      dayStatus,
      dayLabel,
    });
  }
  return summaries.slice(0, 7);
}

// =========================================================
// Tab 1: Conditions ("Умови")
// =========================================================

function renderConditionsCore(raw, hourIdx) {
  const snap = buildHourSnapshot(raw, hourIdx, state.settings, state.kpIndex);
  const copy = getCopy(state.settings.militaryMode);
  const unit = windUnitLabel();
  const fmtW = (v) => formatWindValue(v, state.settings.windUnit);
  const baseIso = raw.hourly.time[state.baseHourIdx];

  const timeBadge = formatRealDateTime(snap.isoTime, baseIso, hourIdx === state.baseHourIdx);

  const fpvSev = snap.fpv.severity;
  const maxGusts = state.settings.maxFpvGusts ?? state.settings.maxFpvWind * 1.4;
  const gustSev =
    snap.fpv.gusts >= maxGusts
      ? 'danger'
      : snap.fpv.gusts >= maxGusts * 0.82
      ? 'warn'
      : 'good';
  const fpvCardSev =
    fpvSev === 'danger' || gustSev === 'danger'
      ? 'danger'
      : fpvSev === 'warn' || gustSev === 'warn'
      ? 'warn'
      : 'good';

  const align = snap.fpv.align;
  const alignHtml =
    align.type !== 'neutral'
      ? `<span class="wind-align-tag ${align.type}">${align.type === 'tailwind' ? '✓ ' : align.type === 'headwind' ? '⚠ ' : ''}${align.label} (на ${degToCompass(align.blowsToDeg)})</span>`
      : '';

  const wingSev = snap.wing.severity;
  const cbSev = snap.cloudBase.severity;

  const icingTitle =
    snap.icingLevel === 'high'
      ? copy.icingHigh
      : snap.icingLevel === 'mod'
      ? copy.icingMod
      : copy.icingNone;
  const icingSub =
    snap.icingLevel === 'high'
      ? copy.icingSubHigh(snap.icingZoneText)
      : snap.icingLevel === 'mod'
      ? copy.icingSubMod(snap.icingZoneText)
      : copy.icingSubNone;

  const safePillHtml =
    snap.icingLevel !== 'none' && snap.safeIcingZoneText
      ? `<span class="safe-corridor-pill">${copy.safeCorridor(snap.safeIcingZoneText)}</span>`
      : '';

  const maxRain = state.settings.maxRainProb ?? 65;
  const precipSev =
    snap.precipMm >= 1 || snap.precipProb >= maxRain
      ? 'danger'
      : snap.precipMm >= 0.2 || snap.precipProb >= Math.max(20, maxRain * 0.55)
      ? 'warn'
      : 'good';

  const extendedHtml = state.settings.extendedMode
    ? `
      <div class="extended-card">
        <div class="section-label">Розширений набір показників</div>
        <div class="extended-grid">
          <div class="ext-item">
            <span class="ext-label">Kp-індекс</span>
            <span class="ext-val">${snap.kp != null ? snap.kp.toFixed(1) : 'н/д'}</span>
          </div>
          <div class="ext-item">
            <span class="ext-label">Видимість</span>
            <span class="ext-val">${snap.visibilityKm != null ? snap.visibilityKm.toFixed(1) + ' км' : '—'}</span>
          </div>
          <div class="ext-item">
            <span class="ext-label">Тиск</span>
            <span class="ext-val">${snap.pressure != null ? Math.round(snap.pressure) + ' гПа' : '—'}</span>
          </div>
          <div class="ext-item">
            <span class="ext-label">Схід / Захід</span>
            <span class="ext-val">${snap.sunrise} / ${snap.sunset}</span>
          </div>
          <div class="ext-item">
            <span class="ext-label">Низькі хмари</span>
            <span class="ext-val">${Math.round(snap.cloudLow)}%</span>
          </div>
          <div class="ext-item">
            <span class="ext-label">Середні / Високі</span>
            <span class="ext-val">${Math.round(snap.cloudMid)}% / ${Math.round(snap.cloudHigh)}%</span>
          </div>
        </div>
      </div>
    `
    : '';

  const profile = state.settings.flightProfile === 'wing' ? 'wing' : 'fpv';

  let windCardsHtml = '';
  if (profile === 'fpv') {
    windCardsHtml = `
      <div class="metric-card fpv-card status-${fpvSev}" data-metric="wind">
        <div class="metric-header">
          <span class="metric-label">${copy.fpvLabel}</span>
          <span class="corridor-tag fpv">10–70 м</span>
        </div>
        <div class="metric-main">
          <span class="metric-value ${fpvSev}" style="font-size:20px">${fmtW(snap.fpv.wind10)}–${fmtW(snap.fpv.wind70)} <small style="font-size:12px">${unit}</small></span>
          <span class="wind-dir-badge">${windArrowHtml(snap.fpv.dir)} ${degToCompass(snap.fpv.dir)}</span>
        </div>
        <div class="metric-sub">${alignHtml || `Стабільний вітер (10–70 м)`}</div>
      </div>

      <div class="metric-card fpv-card status-${gustSev}" data-metric="gusts">
        <div class="metric-header">
          <span class="metric-label">Пориви біля землі</span>
          <span class="corridor-tag fpv">10 м</span>
        </div>
        <div class="metric-main">
          <span class="metric-value ${gustSev}" style="font-size:22px">${fmtW(snap.fpv.gusts)} <small style="font-size:13px">${unit}</small></span>
        </div>
        <div class="metric-sub">Ліміт поривів: <strong class="mono">${fmtW(maxGusts)}&nbsp;${unit}</strong></div>
      </div>
    `;
  } else {
    windCardsHtml = `
      <div class="metric-card wing-card status-${wingSev}" data-metric="wind">
        <div class="metric-header">
          <span class="metric-label">${copy.wingLabel}</span>
          <span class="corridor-tag wing">300–1000 м</span>
        </div>
        <div class="metric-main">
          <span class="metric-value ${wingSev}" style="font-size:20px">${fmtW(snap.wing.min)}–${fmtW(snap.wing.max)} <small style="font-size:12px">${unit}</small></span>
          <span class="wind-dir-badge">${windArrowHtml(snap.wing.dir)} ${degToCompass(snap.wing.dir)}</span>
        </div>
        <div class="metric-sub">Робочий ешелон Крил (ліміт ${fmtW(state.settings.maxWingWind)}&nbsp;${unit})</div>
      </div>

      <div class="metric-card status-${fpvCardSev}" data-metric="gusts">
        <div class="metric-header">
          <span class="metric-label">Зліт / Посадка</span>
          <span class="corridor-tag wing">10 м</span>
        </div>
        <div class="wind-split-row">
          <div>
            <div class="metric-value" style="font-size:20px">${fmtW(snap.fpv.wind10)} <small style="font-size:12px">${unit}</small></div>
            <div class="wind-dir-badge" style="margin-top:2px">${windArrowHtml(snap.fpv.dir)} ${degToCompass(snap.fpv.dir)}</div>
          </div>
          <div class="gust-box status-${gustSev}">
            <span class="gust-label">Пориви</span>
            <span class="gust-val">${fmtW(snap.fpv.gusts)}&nbsp;${unit}</span>
          </div>
        </div>
      </div>
    `;
  }

  const isLongVerdict = snap.verdictTitle.length > 34;
  const fogPillHtml =
    snap.fog?.level && snap.fog.level !== 'none'
      ? `<span class="fog-info-pill">${snap.fog.label}</span>`
      : '';

  const tryzub = isSameLocation(state.location, state.defaultLocation) ? ' 🔱' : '';

  return `
    <section class="verdict-card ${snap.status} expanded-verdict">
      <div class="verdict-header-row">
        <div class="verdict-loc-pill">
          <span class="loc-pin-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </span>
          <span>${formatCityDisplay(state.location.name, state.settings.militaryMode)}${tryzub}</span>
          <span class="loc-elev">${raw.elevation != null ? '• ' + Math.round(raw.elevation) + ' м MSL' : ''}</span>
        </div>
        <span class="verdict-time-pill">${timeBadge}</span>
      </div>
      <div class="verdict-title ${isLongVerdict ? 'long-quote' : ''}">${snap.verdictTitle}</div>
      <div class="verdict-reason">${snap.verdictReason}</div>
    </section>

    <section class="metrics-grid">
      ${windCardsHtml}

      <div class="metric-card status-${cbSev}" data-metric="cloud-base">
        <div class="metric-header">
          <span class="metric-label">${copy.cloudBaseLabel}</span>
          <span class="mono" style="font-size:11px;font-weight:700;color:var(--text-muted)">${snap.cloudBase.density}%</span>
        </div>
        <div class="metric-main">
          <span class="metric-value ${cbSev}">${snap.cloudBase.label}</span>
        </div>
        <div class="cloud-density-wrap">
          <div class="cloud-density-bar">
            <div class="cloud-density-fill ${cbSev}" style="width:${Math.min(100, snap.cloudBase.density)}%"></div>
          </div>
          <div class="metric-sub">${snap.cloudBase.note}</div>
        </div>
      </div>

      <div class="metric-card status-${precipSev}" data-metric="rain">
        <div class="metric-header">
          <span class="metric-label">${copy.precipLabel}</span>
        </div>
        <div class="metric-main">
          <span class="metric-value ${precipSev}">${snap.precipMm.toFixed(1)} <small style="font-size:12px">мм</small></span>
        </div>
        <div class="metric-sub">Вірогідність: <strong class="mono">${Math.round(snap.precipProb)}%</strong></div>
      </div>

      <div class="metric-card ${snap.icingLevel === 'high' ? 'status-ice' : snap.icingLevel === 'mod' ? 'status-warn' : 'status-good'}" data-metric="icing">
        <div class="metric-header">
          <span class="metric-label">${copy.icingLabel}</span>
        </div>
        <div class="metric-main">
          <span class="metric-value ${snap.icingLevel === 'high' ? 'ice' : snap.icingLevel === 'mod' ? 'warn' : 'good'}">${icingTitle}</span>
        </div>
        <div class="metric-sub">Безпечно: <strong class="mono">${snap.safeIcingZoneText || 'всі ешелони'}</strong></div>
      </div>

      <div class="metric-card ${snap.temp2m < -3 ? 'status-ice' : snap.temp2m > 32 ? 'status-warn' : 'status-good'}" data-metric="temp">
        <div class="metric-header">
          <span class="metric-label">${copy.tempLabel}</span>
        </div>
        <div class="metric-main">
          <span class="metric-value">${snap.temp2m >= 0 ? '+' : ''}${snap.temp2m.toFixed(1)}°C</span>
        </div>
        <div class="metric-sub">Точка роси: <strong class="mono">${snap.dew2m >= 0 ? '+' : ''}${snap.dew2m.toFixed(1)}°C</strong></div>
      </div>
    </section>

    ${extendedHtml}
  `;
}

function renderConditionsTab(raw) {
  const maxAvailable = raw.hourly.time.length - 1 - state.baseHourIdx;
  const horizonHours =
    state.horizon === '24h' ? 24 : state.horizon === '48h' ? 48 : 72;
  const sliderMax = Math.min(horizonHours, Math.max(0, maxAvailable));
  if (state.hourOffset > sliderMax) state.hourOffset = sliderMax;

  const baseIso = raw.hourly.time[state.baseHourIdx];
  const currentIdx = Math.min(raw.hourly.time.length - 1, state.baseHourIdx + state.hourOffset);
  const currentIso = raw.hourly.time[currentIdx];

  const segCount = Math.min(sliderMax + 1, 36);
  const step = Math.max(1, Math.floor((sliderMax + 1) / segCount));
  let stripHtml = '';
  for (let off = 0; off <= sliderMax; off += step) {
    const idx = Math.min(raw.hourly.time.length - 1, state.baseHourIdx + off);
    const st = buildHourSnapshot(raw, idx, state.settings, state.kpIndex).status;
    stripHtml += `<span class="status-seg ${st}"></span>`;
  }

  return `
    <div id="conditions-dynamic" class="conditions-content">
      ${renderConditionsCore(raw, currentIdx)}
    </div>

    <section class="scrubber-card sticky-scrubber">
      <div class="scrubber-top-row">
        <div class="horizon-pills">
          <button class="pill-btn ${state.horizon === '24h' ? 'active' : ''}" data-horizon="24h">24г</button>
          <button class="pill-btn ${state.horizon === '48h' ? 'active' : ''}" data-horizon="48h">48г</button>
          <button class="pill-btn ${state.horizon === '72h' ? 'active' : ''}" data-horizon="72h">72г</button>
        </div>
        <span id="scrubber-time-label" class="scrubber-time">
          ${formatScrubberDateTime(currentIso, baseIso, state.hourOffset === 0)}
        </span>
      </div>
      <div class="scrubber-bar-wrap">
        <div class="status-strip">${stripHtml}</div>
        <input id="time-slider" class="time-slider" type="range" min="0" max="${sliderMax}" value="${state.hourOffset}" step="1" />
        <div class="scrubber-ticks">${buildSliderTicks(raw, state.baseHourIdx, sliderMax)}</div>
      </div>
    </section>
  `;
}

// =========================================================
// Tab 2: Altitudes ("Ешелони висот" — ascending 10м → 1500м!)
// =========================================================

function renderAltitudesList(raw, currentIdx) {
  const snap = buildHourSnapshot(raw, currentIdx, state.settings, state.kpIndex);
  const copy = getCopy(state.settings.militaryMode);
  const unit = windUnitLabel();
  const fmtW = (v) => formatWindValue(v, state.settings.windUnit);
  const activeProfile = state.settings.flightProfile || 'fpv';

  const cb = snap.cloudBase;
  const densityThresh = state.settings.cloudDensityThreshold ?? 50;
  const showCloudLine = cb.meters != null && cb.density >= densityThresh && cb.meters <= 1500;
  let insertedCloudLine = false;
  let rowsHtml = '';

  const cloudLineHtml = () => `
    <div class="alt-cloud-line">
      <span>☁ Нижня кромка хмар (~${cb.meters} м)</span>
      <span>Щільність ${cb.density}%</span>
    </div>
  `;

  // Levels: 10m, 70m, 120m, 300m, 500m, 750m, 1000m, 1500m
  for (let i = 0; i < snap.levels.length; i++) {
    const lvl = snap.levels[i];

    if (showCloudLine && !insertedCloudLine && lvl.agl >= cb.meters) {
      insertedCloudLine = true;
      rowsHtml += cloudLineHtml();
    }

    const effAgl = activeProfile === 'fpv' ? Math.min(lvl.agl, 70) : activeProfile === 'wing' ? Math.max(lvl.agl, 300) : lvl.agl;
    const sev = windSeverity(lvl.wind, effAgl, state.settings, lvl.dir);

    const inCloud = showCloudLine && lvl.agl >= cb.meters;
    const statusClass = inCloud ? 'danger' : sev;
    const statusText = inCloud ? '☁ Хмари' : sev === 'danger' ? 'Вітер!' : sev === 'warn' ? 'Увага' : 'Норма';

    const isFpvActive = activeProfile === 'fpv' && lvl.agl <= 70;
    const isWingActive = activeProfile === 'wing' && lvl.agl >= 300 && lvl.agl <= 1000;
    const activeClass = isFpvActive ? 'zone-fpv-active' : isWingActive ? 'zone-wing-active' : '';

    rowsHtml += `
      <div class="alt-row ${activeClass}">
        <div class="alt-height">${lvl.agl}м</div>
        <div class="alt-wind">
          <span class="metric-value ${sev}">${fmtW(lvl.wind)} ${unit}</span>
          ${windArrowHtml(lvl.dir)}
          <span class="wind-comp">${degToCompass(lvl.dir)}</span>
        </div>
        <div class="alt-temp ${lvl.temp <= 0 ? 'ice' : ''}">
          ${lvl.temp >= 0 ? '+' : ''}${lvl.temp.toFixed(1)}° <span class="dew-val">/ ${lvl.dew >= 0 ? '+' : ''}${lvl.dew.toFixed(1)}°</span>
        </div>
        <div style="text-align:right">
          <span class="status-dot-pill ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="alt-head">
      <span style="text-align:center">Висота</span>
      <span>Вітер</span>
      <span>Темп / Роса</span>
      <span style="text-align:right">Статус</span>
    </div>
    ${rowsHtml}
  `;
}

function renderAltitudesTab(raw) {
  const maxAvailable = raw.hourly.time.length - 1 - state.baseHourIdx;
  const altHours = state.altHorizon === '24h' ? 24 : state.altHorizon === '48h' ? 48 : 72;
  const maxOffset = Math.min(altHours, Math.max(0, maxAvailable));
  const clampedOff = Math.min(state.hourOffset, maxOffset);
  state.hourOffset = clampedOff;

  const currentIdx = Math.min(raw.hourly.time.length - 1, state.baseHourIdx + clampedOff);
  const baseIso = raw.hourly.time[state.baseHourIdx];
  const currentIso = raw.hourly.time[currentIdx];

  return `
    <section id="alt-list-box" class="alt-list">
      ${renderAltitudesList(raw, currentIdx)}
    </section>

    <section class="scrubber-card sticky-scrubber">
      <div class="scrubber-top-row">
        <div class="horizon-pills">
          <button class="pill-btn ${state.altHorizon === '24h' ? 'active' : ''}" data-althorizon="24h">24г</button>
          <button class="pill-btn ${state.altHorizon === '48h' ? 'active' : ''}" data-althorizon="48h">48г</button>
          <button class="pill-btn ${state.altHorizon === '72h' ? 'active' : ''}" data-althorizon="72h">72г</button>
        </div>
        <span id="alt-scrubber-label" class="scrubber-time">
          ${formatScrubberDateTime(currentIso, baseIso, clampedOff === 0)}
        </span>
      </div>
      <div class="scrubber-bar-wrap">
        <input id="alt-time-slider" class="time-slider" type="range" min="0" max="${maxOffset}" value="${clampedOff}" step="1" />
        <div class="scrubber-ticks">${buildSliderTicks(raw, state.baseHourIdx, maxOffset)}</div>
      </div>
    </section>
  `;
}

// =========================================================
// Tab 3: Week & Altitude × Time Matrix ("Тиждень" with FPV / Крила / Усі!)
// =========================================================

function renderCellDetailBar(raw, hourIdx, agl) {
  const snap = buildHourSnapshot(raw, hourIdx, state.settings, state.kpIndex);
  const lvl = snap.levels.find((l) => l.agl === agl) || snap.levels[0];
  const day = formatDayMeta(snap.isoTime);
  const copy = getCopy(state.settings.militaryMode);
  const unit = windUnitLabel();
  const fmtW = (v) => formatWindValue(v, state.settings.windUnit);
  const activeProfile = state.settings.flightProfile || 'fpv';

  // Wind severity
  const effAgl = activeProfile === 'fpv' ? Math.min(lvl.agl, 70) : activeProfile === 'wing' ? Math.max(lvl.agl, 300) : lvl.agl;
  const windSev = windSeverity(lvl.wind, effAgl, state.settings, lvl.dir);

  // Gusts severity (physically consistent: gusts >= wind)
  const targetGusts = lvl.gusts ?? (lvl.agl <= 10 ? snap.fpv.gusts : Math.max(Math.round(lvl.wind * 1.25 * 10) / 10, snap.fpv.gusts, lvl.wind));
  const maxG = activeProfile === 'wing' ? (state.settings.maxWingGusts ?? state.settings.maxWingWind * 1.4) : (state.settings.maxFpvGusts ?? 17);
  const gustSev = targetGusts >= maxG ? 'danger' : targetGusts >= maxG * 0.8 ? 'warn' : 'good';

  // Icing severity (advisory)
  const iceSev = lvl.icing === 'high' ? 'ice' : lvl.icing === 'mod' ? 'warn' : 'good';
  const iceText = lvl.icing === 'high' ? copy.icingHigh : lvl.icing === 'mod' ? copy.icingMod : 'Немає';

  // Cloud severity
  const densityThresh = state.settings.cloudDensityThreshold ?? 50;
  const inCloud = snap.cloudBase.meters != null && snap.cloudBase.density >= densityThresh && lvl.agl >= snap.cloudBase.meters;
  const cloudSev = inCloud ? 'danger' : snap.cloudBase.severity || 'good';
  const cloudText = inCloud ? `☁ У хмарах (~${snap.cloudBase.meters}м)` : `${snap.cloudBase.label} (${snap.cloudBase.density}%)`;

  // Precip severity
  const maxRain = state.settings.maxRainProb ?? 65;
  const precipSev = snap.precipProb >= maxRain || snap.precipMm >= 1 ? 'danger' : snap.precipProb >= 30 ? 'warn' : 'good';

  // Temp severity
  const tempSev = lvl.temp <= 0 ? 'ice' : lvl.temp <= 3 ? 'warn' : 'good';

  const corridor = lvl.agl <= 70 ? 'FPV (до 70 м)' : lvl.agl >= 300 && lvl.agl <= 1000 ? 'Крила (300–1000 м)' : 'Ешелон';

  return `
    <div class="cell-detail-bar">
      <div class="cell-detail-title">
        ${day.weekday}, ${day.dateLabel} • ${formatHourShort(snap.isoTime)} • ${lvl.agl} м (${corridor})
      </div>
      <div class="cell-detail-grid">
        <div class="detail-pill status-${windSev}">
          <span>Вітер:</span>
          <strong>${fmtW(lvl.wind)} ${unit} ${windArrowHtml(lvl.dir)} ${degToCompass(lvl.dir)}</strong>
        </div>
        <div class="detail-pill status-${gustSev}">
          <span>Пориви:</span>
          <strong>${fmtW(targetGusts)} ${unit}</strong>
        </div>
        <div class="detail-pill status-${cloudSev}">
          <span>Хмари:</span>
          <strong>${cloudText}</strong>
        </div>
        <div class="detail-pill status-${iceSev}">
          <span>Лід:</span>
          <strong>${iceText}</strong>
        </div>
        <div class="detail-pill status-${precipSev}">
          <span>Опади:</span>
          <strong>${Math.round(snap.precipProb)}% (${snap.precipMm} мм)</strong>
        </div>
        <div class="detail-pill status-${tempSev}">
          <span>Темп:</span>
          <strong>${lvl.temp >= 0 ? '+' : ''}${lvl.temp.toFixed(1)}°C <small>(Td ${lvl.dew >= 0 ? '+' : ''}${lvl.dew.toFixed(1)}°)</small></strong>
        </div>
      </div>
    </div>
  `;
}

function getVisibleMatrixAltitudes(vehicle) {
  if (vehicle === 'fpv') return [10, 70, 120];
  if (vehicle === 'wing') return [300, 500, 750, 1000, 1500];
  return TARGET_ALTITUDES_AGL; // ascending 10..1500
}

function renderWeekTab(raw) {
  const days = buildDailySummaries(raw);
  const copy = getCopy(state.settings.militaryMode);
  const unit = windUnitLabel();
  const fmtW = (v) => formatWindValue(v, state.settings.windUnit);

  if (state.weekSelectedDay >= days.length) state.weekSelectedDay = 0;

  let columns = [];
  if (state.weekMode === 'overview') {
    for (const d of days) {
      const noonIdx =
        d.indices.find((i) => raw.hourly.time[i].endsWith('T12:00')) ??
        d.indices[Math.floor(d.indices.length / 2)];
      const eveIdx = d.indices.find((i) => raw.hourly.time[i].endsWith('T18:00'));
      columns.push({ label: `${d.weekday}<br>12:00`, hourIdx: noonIdx });
      if (eveIdx != null && eveIdx !== noonIdx) {
        columns.push({ label: `${d.weekday}<br>18:00`, hourIdx: eveIdx });
      }
    }
  } else {
    const dayObj = days[state.weekSelectedDay];
    for (const idx of dayObj.indices) {
      const hr = parseInt(raw.hourly.time[idx].slice(11, 13), 10);
      if (hr % 2 === 0) {
        columns.push({ label: `${String(hr).padStart(2, '0')}:00`, hourIdx: idx });
      }
    }
  }

  const colSnaps = columns.map((c) => ({
    ...c,
    snap: buildHourSnapshot(raw, c.hourIdx, state.settings, state.kpIndex),
  }));

  const activeProfile = state.settings.flightProfile || 'fpv';
  const visibleAlts = getVisibleMatrixAltitudes('all');

  if (
    !state.selectedCell ||
    !colSnaps.some((c) => c.hourIdx === state.selectedCell.hourIdx) ||
    !visibleAlts.includes(state.selectedCell.agl)
  ) {
    state.selectedCell = {
      hourIdx: colSnaps[0]?.hourIdx ?? state.baseHourIdx,
      agl: visibleAlts[0],
    };
  }

  const matrixRows = visibleAlts
    .map((agl) => {
      const cells = colSnaps
        .map((col) => {
          const lvl = col.snap.levels.find((l) => l.agl === agl);
          const isSel =
            state.selectedCell.hourIdx === col.hourIdx && state.selectedCell.agl === agl;

          let cellClass = 'good';
          let content = '';
          let badges = '';

          if (state.matrixLayer === 'overall') {
            const evalRes = evaluateCellSuitability(col.snap, lvl, state.settings, activeProfile);
            cellClass = evalRes.severity;
            content = `${fmtW(lvl.wind)}${windArrowHtml(lvl.dir)}`;
            if (lvl.icing !== 'none') badges += `<span class="ice-dot" title="Обмерзання">❄</span>`;
            if (evalRes.inCloud) badges += `<span class="cloud-dot" title="У щільних хмарах">☁</span>`;
          } else if (state.matrixLayer === 'wind') {
            const effAgl = activeProfile === 'fpv' ? Math.min(agl, 70) : activeProfile === 'wing' ? Math.max(agl, 300) : agl;
            cellClass = windSeverity(lvl.wind, effAgl, state.settings, lvl.dir);
            content = `${fmtW(lvl.wind)}${windArrowHtml(lvl.dir)}`;
            if (lvl.icing !== 'none') badges += `<span class="ice-dot" title="Обмерзання">❄</span>`;
          } else if (state.matrixLayer === 'icing') {
            cellClass =
              lvl.icing === 'high' ? 'ice-high' : lvl.icing === 'mod' ? 'ice-mod' : 'ice-none';
            content = lvl.icing === 'high' ? '❄ Вис' : lvl.icing === 'mod' ? 'Помір' : '—';
          } else {
            cellClass = lvl.temp <= 0 ? 'ice-high' : lvl.temp <= 5 ? 'ice-mod' : 'good';
            content = `${Math.round(lvl.temp)}°`;
          }

          return `
            <td>
              <button class="matrix-cell ${cellClass} ${isSel ? 'selected' : ''}" data-cell-hour="${col.hourIdx}" data-cell-agl="${agl}">
                ${content}${badges}
              </button>
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td class="sticky-col">${agl}м</td>
          ${cells}
        </tr>
      `;
    })
    .join('');

  const unitHeader =
    state.matrixLayer === 'temp'
      ? '°C'
      : state.matrixLayer === 'icing'
      ? 'Ризик'
      : unit;

  return `
    <div class="toolbar-row">
      <div class="segmented-sm">
        <button class="${state.weekMode === 'overview' ? 'active' : ''}" data-weekmode="overview">Весь тиждень</button>
        <button class="${state.weekMode === 'daily' ? 'active' : ''}" data-weekmode="daily">По днях</button>
      </div>
      <div class="segmented-sm">
        <button class="${state.matrixLayer === 'overall' ? 'active' : ''}" data-layer="overall">Загалом</button>
        <button class="${state.matrixLayer === 'wind' ? 'active' : ''}" data-layer="wind">Вітер</button>
        <button class="${state.matrixLayer === 'icing' ? 'active' : ''}" data-layer="icing">Лід</button>
        <button class="${state.matrixLayer === 'temp' ? 'active' : ''}" data-layer="temp">Темп</button>
      </div>
    </div>

    ${
      state.weekMode === 'daily'
        ? `
      <div class="day-pills-scroll">
        ${days
          .map(
            (d, i) => `
          <button class="day-pill ${state.weekSelectedDay === i ? 'active' : ''}" data-select-day="${i}">
            <span class="day-pill-name">${d.weekday}</span>
            <span class="day-pill-date">${d.dateLabel}</span>
            <span class="day-pill-dot" style="background:var(--${d.dayStatus}-pill)"></span>
          </button>
        `
          )
          .join('')}
      </div>
    `
        : ''
    }

    <section class="matrix-card">
      <div class="section-head">
        <span class="section-label">Матриця висот (тапай клітинку)</span>
        <span class="mono" style="font-size:11px;color:var(--text-muted)">${unitHeader}</span>
      </div>
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="sticky-col">Висота</th>
              ${colSnaps.map((c) => `<th>${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${matrixRows}
          </tbody>
        </table>
      </div>

      <div id="cell-detail-container">
        ${renderCellDetailBar(raw, state.selectedCell.hourIdx, state.selectedCell.agl)}
      </div>
    </section>
  `;
}

// =========================================================
// Tab 4: Settings ("Налаштування" — full FPV & Wing thresholds!)
// =========================================================

function renderSettingsTab() {
  const s = state.settings;
  const unit = windUnitLabel();
  const fmtW = (v) => formatWindValue(v, s.windUnit);
  const viewingDifferent = !isSameLocation(state.location, state.defaultLocation);

  const dirOptions = [
    { label: 'Вимкнено', deg: null },
    ...COMPASS_UK.map((name, i) => ({ label: name, deg: i * 45 })),
  ];

  return `
    <div class="section-label">Локація польотів</div>
    <section class="settings-group">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">${formatCityDisplay(state.location.name, state.settings.militaryMode)}${isSameLocation(state.location, state.defaultLocation) ? ' 🔱' : ''}</div>
          <div class="setting-desc">${state.location.region || ''} • ${state.modelsData?.icon?.elevation != null ? Math.round(state.modelsData.icon.elevation) + ' м MSL' : ''} • За замовчуванням: <strong>${state.defaultLocation.name}</strong> 🔱</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${
            viewingDifferent
              ? `<button class="btn-default-loc" id="btn-set-cur-default">🔱 Закріпити</button>`
              : ''
          }
          <button class="btn-secondary" id="btn-open-loc-settings" style="padding:7px 12px;font-size:12px;">Змінити місто</button>
        </div>
      </div>
    </section>

    <div class="section-label">Погодна модель</div>
    <section class="settings-group" style="padding:12px;display:flex;flex-direction:column;gap:10px;">
      <div class="section-head" style="margin-bottom:2px;">
        <span class="setting-title" style="font-size:13px">Активна модель для аналізу</span>
        <button class="info-link" id="btn-models-info">? Про моделі</button>
      </div>
      <div class="model-strip">
        ${MODELS.map((m) => {
          const isActive = state.activeModel === m.id;
          return `
            <button class="model-card ${isActive ? 'active' : ''}" data-model="${m.id}">
              <div class="model-top">
                <span class="model-name">${m.name}</span>
                <span class="model-badge">${m.badge}</span>
              </div>
              <div class="model-meta">${m.shortDesc}</div>
            </button>
          `;
        }).join('')}
      </div>
    </section>

    <div class="section-label">Пороги критичності — FPV (до 70 м)</div>
    <section class="settings-group">
      <div class="setting-row slider-setting">
        <div class="setting-info">
          <div class="setting-title">Сприятливий напрямок вітру (куди дме)</div>
          <div class="setting-desc">Наприклад, на <strong>ПдСх</strong> — попутний вітер збільшує дальність FPV; протилежний стає зустрічним і критичним раніше.</div>
        </div>
        <div class="dir-pills">
          ${dirOptions
            .map(
              (o) => `
            <button class="dir-pill-btn ${s.fpvFavBlowToDeg === o.deg ? 'active' : ''}" data-fav-dir="${o.deg === null ? 'none' : o.deg}">
              ${o.label}
            </button>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="setting-row slider-setting">
        <div class="slider-top">
          <span class="setting-title">Макс. вітер FPV (зустрічний / боковий)</span>
          <span id="val-max-fpv" class="mono slider-val">${fmtW(s.maxFpvWind)}&nbsp;${unit}</span>
        </div>
        <input type="range" id="slider-max-fpv" class="time-slider" min="5" max="20" step="1" value="${s.maxFpvWind}" />
      </div>

      ${
        s.fpvFavBlowToDeg !== null
          ? `
        <div class="setting-row slider-setting">
          <div class="slider-top">
            <span class="setting-title">Макс. вітер FPV (попутний на ${degToCompass(s.fpvFavBlowToDeg)})</span>
            <span id="val-max-fpv-tail" class="mono slider-val">${fmtW(s.maxFpvWindTailwind)}&nbsp;${unit}</span>
          </div>
          <input type="range" id="slider-max-fpv-tail" class="time-slider" min="8" max="25" step="1" value="${s.maxFpvWindTailwind}" />
        </div>
      `
          : ''
      }

      <div class="setting-row slider-setting">
        <div class="slider-top">
          <span class="setting-title">Макс. пориви FPV (біля землі)</span>
          <span id="val-max-fpv-gusts" class="mono slider-val">${fmtW(s.maxFpvGusts)}&nbsp;${unit}</span>
        </div>
        <input type="range" id="slider-max-fpv-gusts" class="time-slider" min="8" max="28" step="1" value="${s.maxFpvGusts}" />
      </div>
    </section>

    <div class="section-label">Пороги критичності — Крила (300–1000 м)</div>
    <section class="settings-group">
      <div class="setting-row slider-setting">
        <div class="slider-top">
          <span class="setting-title">Макс. вітер Крила (будь-який напрямок)</span>
          <span id="val-max-wing" class="mono slider-val">${fmtW(s.maxWingWind)}&nbsp;${unit}</span>
        </div>
        <input type="range" id="slider-max-wing" class="time-slider" min="8" max="28" step="1" value="${s.maxWingWind}" />
      </div>

      <div class="setting-row slider-setting">
        <div class="slider-top">
          <span class="setting-title">Мін. нижня кромка хмар (ВНМХ)</span>
          <span id="val-min-cb" class="mono slider-val">${s.minWingCloudBase}&nbsp;м</span>
        </div>
        <input type="range" id="slider-min-cb" class="time-slider" min="150" max="600" step="50" value="${s.minWingCloudBase}" />
      </div>
    </section>

    <div class="section-label">Загальні пороги та одиниці</div>
    <section class="settings-group">
      <div class="setting-row slider-setting">
        <div class="slider-top">
          <span class="setting-title">Критична щільність хмарності</span>
          <span id="val-cloud-dens" class="mono" style="font-weight:700">${s.cloudDensityThreshold}%</span>
        </div>
        <input type="range" id="slider-cloud-dens" class="time-slider" min="30" max="90" step="5" value="${s.cloudDensityThreshold}" />
      </div>

      <div class="setting-row slider-setting">
        <div class="slider-top">
          <span class="setting-title">Макс. ймовірність опадів</span>
          <span id="val-max-rain" class="mono" style="font-weight:700">${s.maxRainProb}%</span>
        </div>
        <input type="range" id="slider-max-rain" class="time-slider" min="20" max="90" step="5" value="${s.maxRainProb}" />
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Одиниці швидкості вітру</div>
        </div>
        <div class="segmented-sm">
          <button class="${s.windUnit === 'ms' ? 'active' : ''}" data-set-unit="ms">м/с</button>
          <button class="${s.windUnit === 'kmh' ? 'active' : ''}" data-set-unit="kmh">км/год</button>
        </div>
      </div>
    </section>

    <div class="section-label">Зовнішній вигляд та режими</div>
    <section class="settings-group">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Тема інтерфейсу</div>
          <div class="setting-desc">Світла — для яскравого сонця, темна — для сутінків</div>
        </div>
        <div class="segmented-sm">
          <button class="${s.theme === 'light' ? 'active' : ''}" data-set-theme="light">Світла</button>
          <button class="${s.theme === 'dark' ? 'active' : ''}" data-set-theme="dark">Темна</button>
          <button class="${s.theme === 'auto' ? 'active' : ''}" data-set-theme="auto">Авто</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Розширений набір показників</div>
          <div class="setting-desc">Kp-індекс (NOAA), видимість, тиск, яруси хмар та схід/захід сонця.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggle-extended" ${s.extendedMode ? 'checked' : ''} />
          <span class="switch-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Військовий режим (18+) <span class="badge-fun">Сленг</span></div>
          <div class="setting-desc">Той самий дизайн, але з неформальними бойовими вердиктами та коментарями.</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="toggle-military" ${s.militaryMode ? 'checked' : ''} />
          <span class="switch-slider"></span>
        </label>
      </div>
    </section>

    <div class="section-label">Про погодні моделі</div>
    <section class="settings-group">
      ${MODELS.map(
        (m) => `
        <div class="model-guide-item">
          <div class="setting-title">${m.name} <span class="model-badge">${m.badge}</span></div>
          <div class="model-guide-pros">✓ ${m.pros}</div>
          <div class="model-guide-cons">• ${m.cons}</div>
        </div>
      `
      ).join('')}
    </section>
  `;
}

// =========================================================
// Main Render & Event Wiring
// =========================================================

function render() {
  const main = document.getElementById('main-content');
  if (!main) return;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });

  if (state.activeTab === 'settings') {
    main.innerHTML = renderSettingsTab();
    bindMainEvents();
    return;
  }

  if (state.loading && !state.modelsData) {
    main.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Завантажую моделі ICON-EU, ECMWF та GFS для ${state.location.name}...</p>
      </div>
    `;
    return;
  }

  if (state.error && !state.modelsData) {
    main.innerHTML = `
      <div class="error-card">
        <p style="color:var(--danger);font-weight:600">${state.error}</p>
        <button class="btn-secondary" id="btn-retry" style="padding:10px 18px;">Спробувати ще раз</button>
      </div>
    `;
    document.getElementById('btn-retry')?.addEventListener('click', () => loadWeather(true));
    return;
  }

  const raw = getActiveRaw();
  if (!raw) return;

  if (state.activeTab === 'conditions') {
    main.innerHTML = renderConditionsTab(raw);
  } else if (state.activeTab === 'altitudes') {
    main.innerHTML = renderAltitudesTab(raw);
  } else if (state.activeTab === 'week') {
    main.innerHTML = renderWeekTab(raw);
  }

  bindMainEvents();
}

function bindModelButtons(container = document) {
  container.querySelectorAll('.model-card[data-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeModel = btn.dataset.model;
      saveState();
      render();
    });
  });
  container.querySelectorAll('.pill-btn[data-flight-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.flightProfile = btn.dataset.flightProfile;
      state.selectedCell = null;
      saveState();
      render();
    });
  });
  container.querySelector('#btn-models-info')?.addEventListener('click', openModelsModal);
}

function bindMainEvents() {
  bindModelButtons(document);

  document.querySelectorAll('.pill-btn[data-horizon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.horizon = btn.dataset.horizon;
      state.hourOffset = 0;
      render();
    });
  });

  // Smooth real-time scrubber on Conditions tab
  const timeSlider = document.getElementById('time-slider');
  if (timeSlider) {
    timeSlider.addEventListener('input', (e) => {
      state.hourOffset = parseInt(e.target.value, 10) || 0;
      const raw = getActiveRaw();
      if (!raw) return;
      const baseIso = raw.hourly.time[state.baseHourIdx];
      const currentIdx = Math.min(raw.hourly.time.length - 1, state.baseHourIdx + state.hourOffset);
      const currentIso = raw.hourly.time[currentIdx];

      const dyn = document.getElementById('conditions-dynamic');
      if (dyn) {
        dyn.innerHTML = renderConditionsCore(raw, currentIdx);
        bindModelButtons(dyn);
      }
      const lbl = document.getElementById('scrubber-time-label');
      if (lbl) {
        lbl.textContent = formatScrubberDateTime(currentIso, baseIso, state.hourOffset === 0);
      }
    });
  }

  document.getElementById('btn-goto-matrix')?.addEventListener('click', () => {
    state.activeTab = 'week';
    state.weekMode = 'overview';
    render();
  });

  document.querySelectorAll('.week-day-row[data-open-day]').forEach((row) => {
    row.addEventListener('click', () => {
      state.weekSelectedDay = parseInt(row.dataset.openDay, 10) || 0;
      state.weekMode = 'daily';
      state.activeTab = 'week';
      render();
    });
  });

  // Altitudes tab controls
  document.querySelectorAll('button[data-altref]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.altRef = btn.dataset.altref;
      saveState();
      render();
    });
  });

  document.querySelectorAll('.pill-btn[data-althorizon]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.altHorizon = btn.dataset.althorizon;
      state.hourOffset = 0;
      render();
    });
  });

  const altSlider = document.getElementById('alt-time-slider');
  if (altSlider) {
    altSlider.addEventListener('input', (e) => {
      state.hourOffset = parseInt(e.target.value, 10) || 0;
      const raw = getActiveRaw();
      if (!raw) return;
      const baseIso = raw.hourly.time[state.baseHourIdx];
      const currentIdx = Math.min(raw.hourly.time.length - 1, state.baseHourIdx + state.hourOffset);
      const currentIso = raw.hourly.time[currentIdx];
      const realLabel = formatScrubberDateTime(currentIso, baseIso, state.hourOffset === 0);

      const lbl = document.getElementById('alt-scrubber-label');
      const listBox = document.getElementById('alt-list-box');
      if (lbl) lbl.textContent = realLabel;
      if (listBox) listBox.innerHTML = renderAltitudesList(raw, currentIdx);
    });
  }

  // Week tab controls
  document.querySelectorAll('button[data-weekmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.weekMode = btn.dataset.weekmode;
      state.selectedCell = null;
      render();
    });
  });

  document.querySelectorAll('button[data-layer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.matrixLayer = btn.dataset.layer;
      render();
    });
  });

  document.querySelectorAll('button[data-select-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.weekSelectedDay = parseInt(btn.dataset.selectDay, 10) || 0;
      state.selectedCell = null;
      render();
    });
  });

  document.querySelectorAll('.matrix-cell[data-cell-hour]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hourIdx = parseInt(btn.dataset.cellHour, 10);
      const agl = parseInt(btn.dataset.cellAgl, 10);
      state.selectedCell = { hourIdx, agl };
      document.querySelectorAll('.matrix-cell.selected').forEach((c) => c.classList.remove('selected'));
      btn.classList.add('selected');
      const detailContainer = document.getElementById('cell-detail-container');
      const raw = getActiveRaw();
      if (detailContainer && raw) {
        detailContainer.innerHTML = renderCellDetailBar(raw, hourIdx, agl);
      }
    });
  });

  // Settings tab controls
  document.getElementById('btn-set-cur-default')?.addEventListener('click', () => {
    state.defaultLocation = { ...state.location };
    saveState();
    updateHeader();
    render();
  });

  document.getElementById('btn-open-loc-settings')?.addEventListener('click', openLocationModal);

  document.querySelectorAll('section button[data-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeModel = btn.dataset.model;
      saveState();
      render();
    });
  });

  document.getElementById('btn-models-info')?.addEventListener('click', () => {
    document.getElementById('modal-models-guide')?.classList.remove('hidden');
  });

  document.querySelectorAll('.dir-pill-btn[data-fav-dir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.favDir;
      state.settings.fpvFavBlowToDeg = val === 'none' ? null : parseInt(val, 10);
      saveState();
      render();
    });
  });

  document.querySelectorAll('button[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.theme = btn.dataset.setTheme;
      applyTheme();
      saveState();
      render();
    });
  });

  document.getElementById('toggle-extended')?.addEventListener('change', (e) => {
    state.settings.extendedMode = e.target.checked;
    saveState();
  });

  document.getElementById('toggle-military')?.addEventListener('change', (e) => {
    state.settings.militaryMode = e.target.checked;
    saveState();
    updateHeader();
  });

  document.querySelectorAll('button[data-set-unit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.windUnit = btn.dataset.setUnit;
      saveState();
      render();
    });
  });

  document.getElementById('slider-max-fpv')?.addEventListener('input', (e) => {
    state.settings.maxFpvWind = parseInt(e.target.value, 10);
    const el = document.getElementById('val-max-fpv');
    if (el) el.textContent = `${formatWindValue(state.settings.maxFpvWind, state.settings.windUnit)} ${windUnitLabel()}`;
    saveState();
  });

  document.getElementById('slider-max-fpv-tail')?.addEventListener('input', (e) => {
    state.settings.maxFpvWindTailwind = parseInt(e.target.value, 10);
    const el = document.getElementById('val-max-fpv-tail');
    if (el) el.textContent = `${formatWindValue(state.settings.maxFpvWindTailwind, state.settings.windUnit)} ${windUnitLabel()}`;
    saveState();
  });

  document.getElementById('slider-max-fpv-gusts')?.addEventListener('input', (e) => {
    state.settings.maxFpvGusts = parseInt(e.target.value, 10);
    const el = document.getElementById('val-max-fpv-gusts');
    if (el) el.textContent = `${formatWindValue(state.settings.maxFpvGusts, state.settings.windUnit)} ${windUnitLabel()}`;
    saveState();
  });

  document.getElementById('slider-max-wing')?.addEventListener('input', (e) => {
    state.settings.maxWingWind = parseInt(e.target.value, 10);
    const el = document.getElementById('val-max-wing');
    if (el) el.textContent = `${formatWindValue(state.settings.maxWingWind, state.settings.windUnit)} ${windUnitLabel()}`;
    saveState();
  });

  document.getElementById('slider-min-cb')?.addEventListener('input', (e) => {
    state.settings.minWingCloudBase = parseInt(e.target.value, 10);
    const el = document.getElementById('val-min-cb');
    if (el) el.textContent = `${state.settings.minWingCloudBase} м`;
    saveState();
  });

  document.getElementById('slider-cloud-dens')?.addEventListener('input', (e) => {
    state.settings.cloudDensityThreshold = parseInt(e.target.value, 10);
    const el = document.getElementById('val-cloud-dens');
    if (el) el.textContent = `${state.settings.cloudDensityThreshold}%`;
    saveState();
  });

  document.getElementById('slider-max-rain')?.addEventListener('input', (e) => {
    state.settings.maxRainProb = parseInt(e.target.value, 10);
    const el = document.getElementById('val-max-rain');
    if (el) el.textContent = `${state.settings.maxRainProb}%`;
    saveState();
  });
}

// =========================================================
// Modals (Location Picker & Models Guide)
// =========================================================

function openModelsModal() {
  const modal = document.getElementById('modal-models');
  const body = document.getElementById('modal-models-body');
  if (!modal || !body) return;
  body.innerHTML = MODELS.map(
    (m) => `
    <div class="model-guide-item" style="padding:0 0 12px 0;">
      <div class="setting-title">${m.name} <span class="model-badge">${m.badge}</span></div>
      <div class="model-guide-pros">✓ ${m.pros}</div>
      <div class="model-guide-cons">• ${m.cons}</div>
    </div>
  `
  ).join('');
  modal.classList.remove('hidden');
}

function openLocationModal() {
  renderLocationPresets();
  document.getElementById('modal-location')?.classList.remove('hidden');
  document.getElementById('input-search-city')?.focus();
}

function renderLocationPresets() {
  const modalBody = document.querySelector('#modal-location .modal-body');
  if (modalBody) {
    let banner = document.getElementById('default-loc-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'default-loc-banner';
      banner.className = 'default-loc-banner';
      modalBody.insertBefore(banner, modalBody.children[1]);
    }
    const isDef = isSameLocation(state.location, state.defaultLocation);
    banner.innerHTML = `
      <div>
        <div style="font-weight:600">Поточна: ${state.location.name}</div>
        <div style="color:var(--text-muted);font-size:11px">За замовчуванням: 🔱 ${state.defaultLocation.name}</div>
      </div>
      <button id="btn-make-default" class="btn-default-loc ${isDef ? 'is-default' : ''}" ${isDef ? 'disabled' : ''}>
        ${isDef ? '🔱 За замовчуванням' : '🔱 Зробити за замовч.'}
      </button>
    `;
    document.getElementById('btn-make-default')?.addEventListener('click', () => {
      state.defaultLocation = { ...state.location };
      saveState();
      updateHeader();
      renderLocationPresets();
      if (state.activeTab === 'settings') render();
    });
  }

  const donetskEl = document.getElementById('presets-donetsk');
  const uaEl = document.getElementById('presets-ukraine');
  const renderChips = (list) =>
    list
      .map((c) => {
        const isDef = isSameLocation(c, state.defaultLocation);
        const isCur = isSameLocation(c, state.location);
        return `<button class="chip-btn ${isCur ? 'active' : ''}" data-lat="${c.lat}" data-lon="${c.lon}" data-name="${c.name}" data-region="${c.region}">${isDef ? '🔱 ' : ''}${c.name}</button>`;
      })
      .join('');

  if (donetskEl) donetskEl.innerHTML = renderChips(PRESETS_DONETSK);
  if (uaEl) uaEl.innerHTML = renderChips(PRESETS_UKRAINE);

  document.querySelectorAll('#modal-location .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectLocation({
        name: btn.dataset.name,
        region: btn.dataset.region,
        lat: parseFloat(btn.dataset.lat),
        lon: parseFloat(btn.dataset.lon),
      });
    });
  });
}

function selectLocation(loc) {
  state.location = loc;
  document.getElementById('modal-location')?.classList.add('hidden');
  state.modelsData = null;
  loadWeather(false);
}

function openMetricModal(metricKey) {
  const raw = getActiveRaw();
  if (!raw) return;
  const currentIdx = Math.min(raw.hourly.time.length - 1, state.baseHourIdx + state.hourOffset);
  const snap = buildHourSnapshot(raw, currentIdx, state.settings, state.kpIndex);
  const unit = windUnitLabel();
  const fmtW = (v) => formatWindValue(v, state.settings.windUnit);
  const modal = document.getElementById('modal-metric-detail');
  const titleEl = document.getElementById('modal-metric-title');
  const bodyEl = document.getElementById('modal-metric-body');
  if (!modal || !titleEl || !bodyEl) return;

  const profile = state.settings.flightProfile === 'wing' ? 'wing' : 'fpv';

  let title = '';
  let html = '';

  switch (metricKey) {
    case 'wind': {
      title = profile === 'fpv' ? '💨 Вітер для FPV (10–70 м)' : '💨 Вітер для Крил (300–1000 м)';
      const windVal = profile === 'fpv'
        ? `${fmtW(snap.fpv.wind10)}–${fmtW(snap.fpv.wind70)} ${unit}`
        : `${fmtW(snap.wing.min)}–${fmtW(snap.wing.max)} ${unit}`;
      const windLimit = profile === 'fpv' ? state.settings.maxFpvWind : state.settings.maxWingWind;
      const windDir = profile === 'fpv' ? snap.fpv.dir : snap.wing.dir;
      const windStatus = profile === 'fpv' ? snap.fpv.severity : snap.wing.severity;
      const windStatusText = windStatus === 'danger' ? 'Критичний вітер' : windStatus === 'warn' ? 'Підвищений вітер' : 'Сприятливий вітер';

      html = `
        <div class="modal-metric-stat ${windStatus}">
          <div class="stat-main">
            <span class="stat-val">${windVal}</span>
            <span class="wind-dir-badge">${windArrowHtml(windDir)} ${degToCompass(windDir)} (${Math.round(windDir)}°)</span>
          </div>
          <span class="status-dot-pill ${windStatus}">${windStatusText}</span>
        </div>
        <div class="modal-metric-info-block">
          <div class="info-row"><span>Встановлений ліміт:</span><strong>${fmtW(windLimit)} ${unit}</strong></div>
          <div class="info-row"><span>Основний ризик:</span><strong>Знесення з курсу, перевитрата батареї</strong></div>
        </div>
        <p class="modal-metric-desc">
          ${profile === 'fpv'
            ? 'Для FPV дронів-камікадзе та скидів на висотах 10–70 м зустрічний або боковий вітер понад 8 м/с різко збільшує споживання струму й ускладнює прицільний пікіруючий захід на ціль. Розраховуйте ємність АКБ із запасом.'
            : 'Для крил (розвідників) на висотах 300–1000 м швидкість вітру зазвичай у 1.5–2 рази вища, ніж біля поверхні землі. Завжди враховуйте точку неповернення під час польоту проти вітру.'}
        </p>
      `;
      break;
    }

    case 'gusts': {
      title = '🌪 Пориви біля землі (10 м)';
      const maxGusts = state.settings.maxFpvGusts ?? (state.settings.maxFpvWind * 1.4);
      const gustVal = `${fmtW(snap.fpv.gusts)} ${unit}`;
      const gustSev = snap.fpv.gusts >= maxGusts ? 'danger' : snap.fpv.gusts >= maxGusts * 0.82 ? 'warn' : 'good';
      const gustStatusText = gustSev === 'danger' ? 'Небезпечні пориви' : gustSev === 'warn' ? 'Помірні пориви' : 'Спокійно';

      html = `
        <div class="modal-metric-stat ${gustSev}">
          <div class="stat-main">
            <span class="stat-val">${gustVal}</span>
          </div>
          <span class="status-dot-pill ${gustSev}">${gustStatusText}</span>
        </div>
        <div class="modal-metric-info-block">
          <div class="info-row"><span>Ліміт поривів:</span><strong>${fmtW(maxGusts)} ${unit}</strong></div>
          <div class="info-row"><span>Зона впливу:</span><strong>Зліт, посадка та низькі маневри</strong></div>
        </div>
        <p class="modal-metric-desc">
          Різкі пориви вітру біля землі несуть пряму загрозу перекидання дрона на старті та посадці. Вони спричиняють короткочасний зрив потоку з пропелерів, перевантаження гіроскопів польотного контролера та різкі стрибки амперажу.
        </p>
      `;
      break;
    }

    case 'cloud-base': {
      title = '☁ Нижня кромка хмар';
      const cb = snap.cloudBase;
      const cbSev = cb.severity;
      const cbStatusText = cbSev === 'danger' ? 'Хмари надто низько' : cbSev === 'warn' ? 'Хмари в робочій зоні' : 'Висока хмарність';

      html = `
        <div class="modal-metric-stat ${cbSev}">
          <div class="stat-main">
            <span class="stat-val">${cb.meters != null ? '~' + cb.meters + ' м' : 'Вище 2000 м'}</span>
            <span class="mono" style="font-size:14px;color:var(--text-muted)">(${cb.density}% щільність)</span>
          </div>
          <span class="status-dot-pill ${cbSev}">${cbStatusText}</span>
        </div>
        <div class="modal-metric-info-block">
          <div class="info-row"><span>Характер хмарності:</span><strong>${cb.note || cb.label}</strong></div>
          <div class="info-row"><span>Мін. допустима висота:</span><strong>${state.settings.minCloudBase ?? 250} м</strong></div>
        </div>
        <p class="modal-metric-desc">
          Вхід у хмари призводить до миттєвої втрати візуального контакту та конденсації вологи на об’єктиві камери. При мінусовій температурі всередині хмари пропелери та крила обмерзають протягом кількох десятків секунд.
        </p>
      `;
      break;
    }

    case 'rain': {
      title = '🌧 Опади та дощ';
      const maxRain = state.settings.maxRainProb ?? 65;
      const precipSev = snap.precipMm >= 1 || snap.precipProb >= maxRain ? 'danger' : snap.precipMm >= 0.2 || snap.precipProb >= Math.max(20, maxRain * 0.55) ? 'warn' : 'good';
      const precipStatusText = precipSev === 'danger' ? 'Інтенсивні опади' : precipSev === 'warn' ? 'Ймовірний дощ/мряка' : 'Без опадів';

      html = `
        <div class="modal-metric-stat ${precipSev}">
          <div class="stat-main">
            <span class="stat-val">${snap.precipMm.toFixed(1)} мм</span>
            <span class="mono" style="font-size:14px;color:var(--text-muted)">(${Math.round(snap.precipProb)}% ймовірність)</span>
          </div>
          <span class="status-dot-pill ${precipSev}">${precipStatusText}</span>
        </div>
        <div class="modal-metric-info-block">
          <div class="info-row"><span>Кількість опадів:</span><strong>${snap.precipMm > 0 ? snap.precipMm + ' мм/год' : '0.0 мм'}</strong></div>
          <div class="info-row"><span>Ліміт ймовірності:</span><strong>${maxRain}%</strong></div>
        </div>
        <p class="modal-metric-desc">
          Волога може спричинити коротке замикання негерметизованих плат контролера (FC), відеопередавача (VTX) та регуляторів швидкості (ESC). Дощ також послаблює радіосигнал керування та відеолінку.
        </p>
      `;
      break;
    }

    case 'icing': {
      title = '❄ Ризик обмерзання (факультативно)';
      const iceTitle = snap.icingLevel === 'high' ? 'Високий ризик' : snap.icingLevel === 'mod' ? 'Помірний ризик' : 'Немає ризику';
      const iceClass = snap.icingLevel === 'high' ? 'ice' : snap.icingLevel === 'mod' ? 'warn' : 'good';

      html = `
        <div class="modal-metric-stat ${iceClass}">
          <div class="stat-main">
            <span class="stat-val">${iceTitle}</span>
          </div>
          <span class="status-dot-pill ${iceClass}">${snap.icingLevel !== 'none' ? 'Зона уваги' : 'Безпечно'}</span>
        </div>
        <div class="modal-metric-info-block">
          <div class="info-row"><span>Безпечний коридор:</span><strong class="mono" style="color:var(--good)">${snap.safeIcingZoneText || 'всі ешелони'}</strong></div>
          ${snap.icingZoneText ? `<div class="info-row"><span>Зона ризику:</span><strong class="mono" style="color:var(--ice)">${snap.icingZoneText}</strong></div>` : ''}
          <div class="info-row"><span>Вплив на дозвіл:</span><strong>Факультативний (не блокує загальний статус)</strong></div>
        </div>
        <p class="modal-metric-desc">
          Обмерзання є факультативною характеристикою атмосфери. Якщо місія виконується у безпечному ешелоні (${snap.safeIcingZoneText || 'низькі висоти'}), політ залишається цілком можливим. Ризик виникає у переохолодженому повітрі (&le; 0°C) при вході в хмари чи туман.
        </p>
      `;
      break;
    }

    case 'temp': {
      title = '🌡 Температура повітря та точка роси';
      const tempVal = `${snap.temp2m >= 0 ? '+' : ''}${snap.temp2m.toFixed(1)}°C`;
      const dewVal = `${snap.dew2m >= 0 ? '+' : ''}${snap.dew2m.toFixed(1)}°C`;
      const tempClass = snap.temp2m < -3 ? 'ice' : snap.temp2m > 32 ? 'warn' : 'good';
      const tempStatusText = snap.temp2m < -3 ? 'Мороз' : snap.temp2m > 32 ? 'Спека' : 'Норма';

      html = `
        <div class="modal-metric-stat ${tempClass}">
          <div class="stat-main">
            <span class="stat-val">${tempVal}</span>
            <span class="mono" style="font-size:14px;color:var(--text-muted)">(Роса: ${dewVal})</span>
          </div>
          <span class="status-dot-pill ${tempClass}">${tempStatusText}</span>
        </div>
        <div class="modal-metric-info-block">
          <div class="info-row"><span>Точка роси (конденсація):</span><strong>${dewVal}</strong></div>
          <div class="info-row"><span>Різниця Temp - Dew:</span><strong>${Math.abs(snap.temp2m - snap.dew2m).toFixed(1)}°C (${Math.abs(snap.temp2m - snap.dew2m) < 2.5 ? 'Високий ризик туману' : 'Низький'})</strong></div>
        </div>
        <p class="modal-metric-desc">
          При температурі нижче 0°C різко падає ефективна ємність акумуляторів LiPo/Li-Ion (до 30% просідання ємності) та зростає ризик різкого падіння напруги при подачі повного газу. Завжди тримайте акумулятори в теплі перед зльотом.
        </p>
      `;
      break;
    }

    default:
      return;
  }

  titleEl.textContent = title;
  bodyEl.innerHTML = html;
  modal.classList.remove('hidden');
}

let searchTimer = null;
function initGlobalEvents() {
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.metric-card[data-metric]');
    if (card && card.dataset.metric) {
      openMetricModal(card.dataset.metric);
    }
  });
  document.querySelectorAll('button[data-flight-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.settings.flightProfile = btn.dataset.flightProfile;
      saveState();
      updateHeader();
      render();
    });
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.getElementById('btn-theme')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    state.settings.theme = cur === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveState();
    if (state.activeTab === 'settings') render();
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => loadWeather(true));
  document.getElementById('btn-location')?.addEventListener('click', openLocationModal);

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));
  });

  const searchInput = document.getElementById('input-search-city');
  const resultsBox = document.getElementById('search-results');
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      resultsBox?.classList.add('hidden');
      return;
    }
    searchTimer = setTimeout(async () => {
      const items = await searchUkraineCities(q);
      if (!resultsBox) return;
      if (!items.length) {
        resultsBox.innerHTML = `<div class="search-result-item" style="color:var(--text-muted)">Нічого не знайдено</div>`;
      } else {
        resultsBox.innerHTML = items
          .map(
            (it, idx) => `
          <button class="search-result-item" data-res-idx="${idx}">
            <span><strong>${it.name}</strong> <small style="color:var(--text-muted)">${it.region}</small></span>
            <span class="mono" style="font-size:11px;color:var(--text-muted)">${it.lat.toFixed(2)}, ${it.lon.toFixed(2)}</span>
          </button>
        `
          )
          .join('');
        resultsBox.querySelectorAll('button[data-res-idx]').forEach((b) => {
          b.addEventListener('click', () => {
            const chosen = items[parseInt(b.dataset.resIdx, 10)];
            searchInput.value = '';
            resultsBox.classList.add('hidden');
            selectLocation(chosen);
          });
        });
      }
      resultsBox.classList.remove('hidden');
    }, 300);
  });

  document.getElementById('btn-gps')?.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        selectLocation({
          name: 'Мої координати',
          region: `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      () => alert('Не вдалося отримати геолокацію.')
    );
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Auto-shutdown heartbeat for local server: pings server every 4s
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.');
  if (isLocal) {
    setInterval(() => {
      fetch('/api/ping', { method: 'POST' }).catch(() => {});
    }, 4000);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
      window.addEventListener('pagehide', () => {
        try {
          navigator.sendBeacon('/api/shutdown');
        } catch {}
      });
    }
  }
}

loadState();
applyTheme();
initGlobalEvents();
loadWeather(false);
