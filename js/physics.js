import { getCopy } from './locales.js';

export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850];
// Ascending order: lowest (most demanded for FPV) at top -> highest (1500m) at bottom
export const TARGET_ALTITUDES_AGL = [10, 70, 120, 300, 500, 750, 1000, 1500];

export function cleanZero(n) {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.abs(n) < 0.05 ? 0 : n;
}

export function calcDewPoint(tempC, rh) {
  if (tempC == null || rh == null || rh <= 0) return null;
  const a = 17.625;
  const b = 243.04;
  const clampedRh = Math.max(1, Math.min(100, rh));
  const gamma = Math.log(clampedRh / 100) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}

/**
 * Angular distance in degrees [0..180]
 */
function angleDiff(a, b) {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

/**
 * Classify FPV wind alignment relative to user's favorable "blows TO" direction (e.g. 135° = ПдСх).
 * Note: meteorological windFromDeg is where wind comes FROM, so blowsToDeg = (windFromDeg + 180) % 360.
 */
export function classifyFpvWindDirection(windFromDeg, favBlowToDeg) {
  if (favBlowToDeg == null || windFromDeg == null) {
    return { type: 'neutral', label: '', blowsToDeg: ((windFromDeg ?? 0) + 180) % 360 };
  }
  const blowsToDeg = ((windFromDeg % 360) + 540) % 360;
  const diff = angleDiff(blowsToDeg, favBlowToDeg);
  if (diff <= 50) {
    return { type: 'tailwind', label: 'Попутний', blowsToDeg };
  }
  if (diff >= 130) {
    return { type: 'headwind', label: 'Зустрічний', blowsToDeg };
  }
  return { type: 'crosswind', label: 'Боковий', blowsToDeg };
}

/**
 * Estimate cloud base (LCL) in meters AGL: ~125 * (T - Td)
 */
export function calcCloudBaseAgl(temp2m, dew2m, cloudCover, cloudLow, settings) {
  const cover = Math.round(cloudCover ?? 0);
  const effectiveDensity = Math.max(cover, Math.round(cloudLow ?? 0));
  const densityThreshold = settings?.cloudDensityThreshold ?? 50;
  const minWingCb = settings?.minWingCloudBase ?? 300;

  if (temp2m == null || dew2m == null) {
    return { meters: null, density: cover, severity: 'good', label: '—', note: '' };
  }

  if (effectiveDensity < 15) {
    return {
      meters: null,
      density: cover,
      severity: 'good',
      label: 'Ясно',
      note: 'Небо чисте',
    };
  }

  const spread = Math.max(0, temp2m - dew2m);
  const lcl = Math.max(50, Math.min(3500, Math.round((125 * spread) / 50) * 50));

  if (effectiveDensity < densityThreshold) {
    return {
      meters: lcl,
      density: cover,
      severity: 'good',
      label: `~${lcl} м`,
      note: `Розріджена (<${densityThreshold}%) — не критично`,
    };
  }

  if (lcl < minWingCb) {
    return {
      meters: lcl,
      density: cover,
      severity: 'danger',
      label: `~${lcl} м`,
      note: `Нижче ${minWingCb} м — недопустимо для Крил`,
    };
  }

  if (lcl <= Math.max(600, minWingCb + 250) && effectiveDensity >= 75) {
    const copy = getCopy(settings?.militaryMode);
    return {
      meters: lcl,
      density: cover,
      severity: 'warn',
      label: `~${lcl} м`,
      note: copy.cloudNoteDenseWing,
    };
  }

  return {
    meters: lcl,
    density: cover,
    severity: 'good',
    label: `~${lcl} м`,
    note: effectiveDensity >= 75 ? 'Щільна, але вище робочої зони' : 'Помірна хмарність',
  };
}

/**
 * Informational-only fog indicator (does NOT affect verdict criticality!)
 */
export function calcFogInfo(weatherCode, visibilityKm, temp2m, dew2m, rh2m, wind10, militaryMode) {
  const copy = getCopy(militaryMode);
  const spread = temp2m != null && dew2m != null ? Math.max(0, temp2m - dew2m) : null;
  const isWmoFog = weatherCode === 45 || weatherCode === 48;

  if (
    isWmoFog ||
    (visibilityKm != null && visibilityKm <= 1.0) ||
    (spread != null && spread <= 1.0 && (rh2m ?? 0) >= 93 && (wind10 ?? 0) <= 4)
  ) {
    const visText = visibilityKm != null ? ` • вид. ${visibilityKm.toFixed(1)} км` : '';
    return { level: 'dense', label: `🌫 ${copy.fogDense}${visText}` };
  }

  if (
    (visibilityKm != null && visibilityKm <= 3.0) ||
    (spread != null && spread <= 2.0 && (rh2m ?? 0) >= 88 && (wind10 ?? 0) <= 5)
  ) {
    const visText = visibilityKm != null ? ` • вид. ${visibilityKm.toFixed(1)} км` : '';
    return { level: 'risk', label: `🌫 ${copy.fogRisk}${visText}` };
  }

  return { level: 'none', label: '' };
}

export function calcIcingRisk(tempC, dewC, rh) {
  if (tempC == null) return { level: 'none', spread: null };
  const spread = dewC != null ? cleanZero(Math.max(0, tempC - dewC)) : null;
  const humid = rh ?? (spread != null ? Math.max(0, 100 - spread * 5) : 50);

  if (tempC >= -12 && tempC <= 2 && ((spread != null && spread <= 2.2) || humid >= 85)) {
    return { level: 'high', spread };
  }
  if (tempC >= -15 && tempC <= 3 && ((spread != null && spread <= 4.0) || humid >= 75)) {
    return { level: 'mod', spread };
  }
  return { level: 'none', spread };
}

function interpAngle(a1, a2, t) {
  if (a1 == null) return a2 ?? 0;
  if (a2 == null) return a1;
  let diff = ((a2 - a1 + 540) % 360) - 180;
  return (a1 + diff * t + 360) % 360;
}

function interpNum(v1, v2, t) {
  if (v1 == null) return v2;
  if (v2 == null) return v1;
  return v1 + (v2 - v1) * t;
}

function formatAltRange(alts) {
  if (!alts.length) return '';
  const sorted = [...alts].sort((a, b) => a - b);
  const minA = sorted[0];
  const maxA = sorted[sorted.length - 1];
  return minA === maxA ? `${minA} м` : `${minA}–${maxA} м`;
}

export function buildHourlyProfile(raw, idx) {
  const h = raw.hourly;
  const elev = raw.elevation ?? 150;
  const samples = [];

  const t2 = h.temperature_2m?.[idx];
  const d2 = h.dew_point_2m?.[idx];
  const rh2 = h.relative_humidity_2m?.[idx];
  const w10 = h.wind_speed_10m?.[idx];
  const wd10 = h.wind_direction_10m?.[idx];

  samples.push({
    agl: 10,
    msl: Math.round(elev + 10),
    wind: w10 ?? 0,
    dir: wd10 ?? 0,
    temp: t2 ?? 0,
    dew: d2 ?? calcDewPoint(t2, rh2) ?? 0,
    rh: rh2 ?? 60,
  });

  if (h.wind_speed_80m?.[idx] != null) {
    const t80 = t2 != null ? t2 - 0.5 : 0;
    const rh80 = rh2 ?? 60;
    samples.push({
      agl: 80,
      msl: Math.round(elev + 80),
      wind: h.wind_speed_80m[idx],
      dir: h.wind_direction_80m?.[idx] ?? wd10 ?? 0,
      temp: t80,
      dew: calcDewPoint(t80, rh80) ?? (d2 != null ? d2 - 0.3 : 0),
      rh: rh80,
    });
  }

  if (h.wind_speed_120m?.[idx] != null) {
    const t120 = t2 != null ? t2 - 0.8 : 0;
    const rh120 = rh2 ?? 60;
    samples.push({
      agl: 120,
      msl: Math.round(elev + 120),
      wind: h.wind_speed_120m[idx],
      dir: h.wind_direction_120m?.[idx] ?? wd10 ?? 0,
      temp: t120,
      dew: calcDewPoint(t120, rh120) ?? (d2 != null ? d2 - 0.5 : 0),
      rh: rh120,
    });
  }

  for (const p of PRESSURE_LEVELS) {
    const gph = h[`geopotential_height_${p}hPa`]?.[idx];
    const ws = h[`wind_speed_${p}hPa`]?.[idx];
    const wd = h[`wind_direction_${p}hPa`]?.[idx];
    const tp = h[`temperature_${p}hPa`]?.[idx];
    const rhp = h[`relative_humidity_${p}hPa`]?.[idx];
    if (gph == null || ws == null || tp == null) continue;
    const agl = Math.round(gph - elev);
    if (agl < 40) continue;
    const dew = calcDewPoint(tp, rhp ?? rh2 ?? 60);
    samples.push({
      agl,
      msl: Math.round(gph),
      wind: ws,
      dir: wd ?? wd10 ?? 0,
      temp: tp,
      dew: dew ?? tp - 3,
      rh: rhp ?? 60,
    });
  }

  samples.sort((a, b) => a.agl - b.agl);

  return TARGET_ALTITUDES_AGL.map((targetAgl) => {
    let lower = samples[0];
    let upper = samples[samples.length - 1];

    for (let i = 0; i < samples.length; i++) {
      if (samples[i].agl <= targetAgl) lower = samples[i];
      if (samples[i].agl >= targetAgl) {
        upper = samples[i];
        break;
      }
    }

    const span = upper.agl - lower.agl;
    const t = span > 0 ? Math.max(0, Math.min(1, (targetAgl - lower.agl) / span)) : 0;

    const wind = interpNum(lower.wind, upper.wind, t);
    const dir = interpAngle(lower.dir, upper.dir, t);
    const temp = cleanZero(interpNum(lower.temp, upper.temp, t));
    const rh = interpNum(lower.rh, upper.rh, t);
    const dew = cleanZero(calcDewPoint(temp, rh) ?? interpNum(lower.dew, upper.dew, t));
    const icing = calcIcingRisk(temp, dew, rh);

    let zone = 'other';
    if (targetAgl <= 70) zone = 'fpv';
    else if (targetAgl >= 300 && targetAgl <= 1000) zone = 'wing';

    // Variant 2: Aerodynamic gusts calculation at altitude (never lower than sustained wind!)
    const groundGusts = cleanZero(h.wind_gusts_10m?.[idx] ?? (w10 ?? 0) * 1.3);
    const gusts = cleanZero(
      targetAgl <= 10
        ? groundGusts
        : Math.max(Math.round(wind * 1.25 * 10) / 10, groundGusts, wind)
    );

    return {
      agl: targetAgl,
      msl: Math.round(elev + targetAgl),
      wind,
      gusts,
      dir,
      temp,
      dew,
      rh,
      icing: icing.level,
      spread: icing.spread,
      zone,
    };
  });
}

/**
 * Evaluate wind severity accounting for altitude zone AND FPV wind direction preference!
 */
export function windSeverity(ms, agl, settings, windFromDeg = null) {
  let limit = agl <= 70 ? settings.maxFpvWind : settings.maxWingWind;

  if (agl <= 70 && settings.fpvFavBlowToDeg != null && windFromDeg != null) {
    const align = classifyFpvWindDirection(windFromDeg, settings.fpvFavBlowToDeg);
    if (align.type === 'tailwind') {
      limit = settings.maxFpvWindTailwind ?? Math.max(limit + 4, 14);
    }
  }

  if (ms >= limit) return 'danger';
  if (ms >= limit * 0.74) return 'warn';
  return 'good';
}

/**
 * Evaluate combined flight suitability for a specific altitude cell in the Week matrix
 * vehicleFilter: 'all' | 'fpv' | 'wing'
 */
export function evaluateCellSuitability(snap, lvl, settings, vehicleFilter = 'all') {
  const effectiveAgl = vehicleFilter === 'fpv' ? Math.min(lvl.agl, 70) : vehicleFilter === 'wing' ? Math.max(lvl.agl, 300) : lvl.agl;
  let severity = windSeverity(lvl.wind, effectiveAgl, settings, lvl.dir);

  const escalate = (s) => {
    if (s === 'danger') severity = 'danger';
    else if (s === 'warn' && severity !== 'danger') severity = 'warn';
  };

  // Gusts check for FPV altitudes
  if (effectiveAgl <= 70) {
    const maxGusts = settings.maxFpvGusts ?? settings.maxFpvWind * 1.4;
    if (snap.fpv.gusts >= maxGusts) escalate('danger');
    else if (snap.fpv.gusts >= maxGusts * 0.82) escalate('warn');
  }

  // Precipitation
  const maxRain = settings.maxRainProb ?? 65;
  if (snap.precipMm >= 1.0 || snap.precipProb >= maxRain) escalate('danger');
  else if (snap.precipMm >= 0.2 || snap.precipProb >= Math.max(20, maxRain * 0.55)) escalate('warn');

  // Cloud Base & Density
  const cb = snap.cloudBase;
  const densityThresh = settings.cloudDensityThreshold ?? 50;
  const inCloud = cb?.meters != null && cb.density >= densityThresh && lvl.agl >= cb.meters;

  if (inCloud) {
    if (cb.density >= 75) escalate('danger');
    else escalate('warn');
  }

  // Wing-specific critical cloud base (< minWingCloudBase)
  if (vehicleFilter !== 'fpv' && cb?.severity === 'danger' && lvl.agl >= 300) {
    escalate('danger');
  }

  return { severity, inCloud };
}

export function buildHourSnapshot(raw, idx, settings, kpValue, isNow = false) {
  const h = raw.hourly;
  const levels = buildHourlyProfile(raw, idx);
  const profile = settings.flightProfile || 'all'; // 'fpv' | 'wing' | 'all'

  const byAgl = Object.fromEntries(levels.map((l) => [l.agl, l]));
  const fpv10 = byAgl[10];
  const fpv70 = byAgl[70];
  const fpvWindMax = Math.max(fpv10.wind, fpv70.wind);
  const fpvWindMin = Math.min(fpv10.wind, fpv70.wind);
  const gusts10 = h.wind_gusts_10m?.[idx] ?? fpv10.wind * 1.3;
  const fpvAlign = classifyFpvWindDirection(fpv10.dir, settings.fpvFavBlowToDeg);

  const wingLevels = levels.filter((l) => l.agl >= 300 && l.agl <= 1000);
  const wingWindMin = Math.min(...wingLevels.map((l) => l.wind));
  const wingWindMax = Math.max(...wingLevels.map((l) => l.wind));
  const wingDir = byAgl[500]?.dir ?? wingLevels[0]?.dir ?? 0;

  // Scope icing evaluation to the active flight profile's working altitudes!
  const icingScopeLevels =
    profile === 'fpv'
      ? levels.filter((l) => l.agl <= 70)
      : profile === 'wing'
      ? wingLevels
      : levels;

  const highIceAlts = icingScopeLevels.filter((l) => l.icing === 'high').map((l) => l.agl);
  const modIceAlts = icingScopeLevels.filter((l) => l.icing === 'mod').map((l) => l.agl);

  let icingLevel = 'none';
  let icingZoneText = '';
  if (highIceAlts.length > 0) {
    icingLevel = 'high';
    icingZoneText = formatAltRange(highIceAlts);
  } else if (modIceAlts.length > 0) {
    icingLevel = 'mod';
    icingZoneText = formatAltRange(modIceAlts);
  }

  // Safe icing corridor across working altitudes (or all levels)
  const safeLevels = levels.filter((l) => l.icing === 'none').map((l) => l.agl);
  let safeIcingZoneText = '';
  if (safeLevels.length === levels.length) {
    safeIcingZoneText = 'всі ешелони (до 1500 м)';
  } else if (safeLevels.length === 0) {
    safeIcingZoneText = 'немає (обмерзання 10–1500 м)';
  } else {
    const minSafe = Math.min(...safeLevels);
    if (minSafe === 10) {
      const firstIceLvl = levels.find((l) => l.icing !== 'none');
      const maxGroundSafe = firstIceLvl ? firstIceLvl.agl : Math.max(...safeLevels);
      safeIcingZoneText = `до ${maxGroundSafe} м`;
    } else {
      safeIcingZoneText = formatAltRange(safeLevels);
    }
  }

  const temp2m = cleanZero(h.temperature_2m?.[idx] ?? 0);
  const dew2m = cleanZero(h.dew_point_2m?.[idx] ?? calcDewPoint(temp2m, h.relative_humidity_2m?.[idx]) ?? 0);
  const cloudCover = h.cloud_cover?.[idx] ?? 0;
  const cloudLow = h.cloud_cover_low?.[idx] ?? 0;
  const cloudMid = h.cloud_cover_mid?.[idx] ?? 0;
  const cloudHigh = h.cloud_cover_high?.[idx] ?? 0;
  const precipMm = h.precipitation?.[idx] ?? 0;
  const precipProb = h.precipitation_probability?.[idx] ?? (precipMm > 0.1 ? 70 : 0);
  const visibilityKm = h.visibility?.[idx] != null ? h.visibility[idx] / 1000 : null;
  const pressure = h.surface_pressure?.[idx] ?? null;
  const weatherCode = h.weather_code?.[idx] ?? null;
  const rh2m = h.relative_humidity_2m?.[idx] ?? null;
  const fog = calcFogInfo(weatherCode, visibilityKm, temp2m, dew2m, rh2m, fpv10.wind, settings.militaryMode);

  let cloudBase = calcCloudBaseAgl(temp2m, dew2m, cloudCover, cloudLow, settings);
  // In FPV mode (<70m), cloud base is only critical if it's basically fog on the ground (<=100m)
  if (profile === 'fpv' && cloudBase.meters != null) {
    const densityThresh = settings.cloudDensityThreshold ?? 50;
    if (cloudBase.density >= densityThresh && cloudBase.meters <= 100) {
      cloudBase = { ...cloudBase, severity: 'danger', note: 'Туман / хмари на рівні землі (≤100 м)' };
    } else if (cloudBase.density >= densityThresh && cloudBase.meters <= 150) {
      cloudBase = { ...cloudBase, severity: 'warn', note: 'Низька димка / хмарність (~150 м)' };
    } else {
      cloudBase = {
        ...cloudBase,
        severity: 'good',
        note: cloudBase.density < densityThresh ? `Розріджена (<${densityThresh}%)` : 'Вище робочої зони FPV',
      };
    }
  }

  // Verdict calculation tailored to active flightProfile ('fpv' | 'wing' | 'all')
  const copy = getCopy(settings.militaryMode, idx);
  const unitLabel = settings.windUnit === 'kmh' ? 'км/год' : 'м/с';
  const fmtW = (ms) => formatWindValue(ms, settings.windUnit);

  const reasons = [];
  let status = 'good';

  const setLevel = (lvl) => {
    if (lvl === 'danger') status = 'danger';
    else if (lvl === 'warn' && status !== 'danger') status = 'warn';
  };

  const fpvSev = windSeverity(fpvWindMax, 70, settings, fpv10.dir);
  const maxGusts = settings.maxFpvGusts ?? settings.maxFpvWind * 1.4;
  const wingSev = windSeverity(wingWindMax, 500, settings);

  if (profile === 'fpv' || profile === 'all') {
    if (fpvSev === 'danger') {
      setLevel('danger');
      reasons.push(copy.reasonFpvWind(fmtW(fpvWindMax), unitLabel));
    } else if (fpvSev === 'warn') {
      setLevel('warn');
      reasons.push(copy.reasonFpvWind(fmtW(fpvWindMax), unitLabel));
    }

    if (gusts10 >= maxGusts) {
      setLevel('danger');
      reasons.push(copy.reasonFpvGusts(fmtW(gusts10), unitLabel));
    } else if (gusts10 >= maxGusts * 0.82) {
      setLevel('warn');
      reasons.push(copy.reasonFpvGusts(fmtW(gusts10), unitLabel));
    }
  }

  if (profile === 'wing' || profile === 'all') {
    if (wingSev === 'danger') {
      setLevel('danger');
      reasons.push(copy.reasonWingWind(fmtW(wingWindMax), unitLabel));
    } else if (wingSev === 'warn') {
      setLevel('warn');
      reasons.push(copy.reasonWingWind(fmtW(wingWindMax), unitLabel));
    }
  }

  if (cloudBase.severity === 'danger') {
    setLevel('danger');
    reasons.push(
      profile === 'fpv'
        ? copy.reasonCloudLow(cloudBase.meters, cloudBase.density)
        : copy.reasonCloudCritical(cloudBase.meters, cloudBase.density)
    );
  } else if (cloudBase.severity === 'warn') {
    setLevel('warn');
    reasons.push(copy.reasonCloudLow(cloudBase.meters, cloudBase.density));
  }

  // Note: Icing is an atmospheric advisory (facultative) and does NOT degrade overall flight verdict!
  if (icingLevel === 'high') {
    if (status !== 'good') reasons.push(copy.reasonIcingHigh(icingZoneText, safeIcingZoneText));
  } else if (icingLevel === 'mod') {
    if (status !== 'good') reasons.push(copy.reasonIcingMod(icingZoneText, safeIcingZoneText));
  }

  const maxRain = settings.maxRainProb ?? 65;
  if (precipMm >= 1.0 || precipProb >= maxRain) {
    setLevel('danger');
    reasons.push(copy.reasonRain(Math.round(precipProb), precipMm, isNow));
  } else if (precipMm >= 0.2 || precipProb >= Math.max(20, maxRain * 0.55)) {
    setLevel('warn');
    reasons.push(copy.reasonRain(Math.round(precipProb), precipMm, isNow));
  }

  const verdictTitle =
    status === 'danger' ? copy.verdictDanger : status === 'warn' ? copy.verdictWarn : copy.verdictGood;
  const verdictReason = reasons.length > 0 ? reasons.slice(0, 2).join(' • ') : copy.reasonClear;

  const isoTime = h.time[idx];
  const dateStr = isoTime.slice(0, 10);
  const dIdx = raw.daily?.time?.indexOf(dateStr) ?? -1;
  const sunrise = dIdx >= 0 ? raw.daily.sunrise[dIdx]?.slice(11, 16) : '—';
  const sunset = dIdx >= 0 ? raw.daily.sunset[dIdx]?.slice(11, 16) : '—';

  return {
    idx,
    isoTime,
    profile,
    elevation: Math.round(raw.elevation ?? 0),
    levels,
    fpv: {
      wind10: fpv10.wind,
      wind70: fpv70.wind,
      min: fpvWindMin,
      max: fpvWindMax,
      gusts: gusts10,
      dir: fpv10.dir,
      align: fpvAlign,
      severity: fpvSev,
    },
    wing: {
      min: wingWindMin,
      max: wingWindMax,
      dir: wingDir,
      severity: wingSev,
    },
    cloudBase,
    cloudCover,
    cloudLow,
    cloudMid,
    cloudHigh,
    precipMm,
    precipProb,
    icingLevel,
    icingZoneText,
    safeIcingZoneText,
    temp2m,
    dew2m,
    visibilityKm,
    pressure,
    fog,
    sunrise,
    sunset,
    kp: kpValue,
    status,
    verdictTitle,
    verdictReason,
  };
}

export function formatWindValue(ms, unit) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const val = unit === 'kmh' ? ms * 3.6 : ms;
  return cleanZero(val).toFixed(1).replace(/\.0$/, '');
}
