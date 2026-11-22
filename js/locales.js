export const PRESETS_DONETSK = [
  { name: 'Краматорськ', region: 'Донецька обл.', lat: 48.739, lon: 37.584 },
  { name: 'Покровськ', region: 'Донецька обл.', lat: 48.282, lon: 37.176 },
  { name: "Слов'янськ", region: 'Донецька обл.', lat: 48.853, lon: 37.605 },
  { name: 'Добропілля', region: 'Донецька обл.', lat: 48.469, lon: 37.083 },
  { name: 'Костянтинівка', region: 'Донецька обл.', lat: 48.528, lon: 37.707 },
  { name: 'Дружківка', region: 'Донецька обл.', lat: 48.620, lon: 37.528 },
  { name: 'Лиман', region: 'Донецька обл.', lat: 48.988, lon: 37.804 },
  { name: 'Мирноград', region: 'Донецька обл.', lat: 48.299, lon: 37.269 },
];

export const PRESETS_UKRAINE = [
  { name: 'Павлоград', region: 'Дніпропетровська обл.', lat: 48.534, lon: 35.871 },
  { name: 'Дніпро', region: 'Дніпропетровська обл.', lat: 48.465, lon: 35.046 },
  { name: 'Харків', region: 'Харківська обл.', lat: 49.994, lon: 36.230 },
  { name: 'Запоріжжя', region: 'Запорізька обл.', lat: 47.839, lon: 35.140 },
  { name: 'Суми', region: 'Сумська обл.', lat: 50.908, lon: 34.798 },
  { name: 'Київ', region: 'Київська обл.', lat: 50.450, lon: 30.523 },
  { name: 'Миколаїв', region: 'Миколаївська обл.', lat: 46.975, lon: 31.995 },
  { name: 'Одеса', region: 'Одеська обл.', lat: 46.483, lon: 30.723 },
  { name: 'Львів', region: 'Львівська обл.', lat: 49.840, lon: 24.030 },
];

export const MODELS = [
  {
    id: 'icon',
    apiModel: 'icon_seamless',
    name: 'ICON-EU',
    badge: 'Основна',
    shortDesc: 'Точна на 1–3 доби',
    pros: 'Німецька модель DWD із високою роздільністю (~7 км по Європі). Найкраще ловить пориви, локальний вітер по висотах і низьку хмарність на найближчі 1–3 доби.',
    cons: 'Після 3-ї доби переходить на глобальну сітку ICON Global, де точність поступається ECMWF.',
  },
  {
    id: 'ecmwf',
    apiModel: 'ecmwf_ifs025',
    name: 'ECMWF',
    badge: 'Альт.',
    shortDesc: 'Топ на 2–7 днів',
    pros: 'Європейський «золотий стандарт» для середньострокових прогнозів. Найстабільніше передбачає атмосферні фронти, циклони та загальний тренд на 2–7 днів.',
    cons: 'Сітка грубіша (~25 км у відкритому доступі), має менше проміжних рівнів висот — може згладжувати локальні пориви.',
  },
  {
    id: 'gfs',
    apiModel: 'gfs_seamless',
    name: 'GFS',
    badge: 'США',
    shortDesc: 'Звірка (NOAA)',
    pros: 'Американська модель NOAA. Зручна як третя незалежна точка зору: якщо ICON, ECMWF і GFS сходяться — довіра до прогнозу максимальна.',
    cons: 'Часто переоцінює або недооцінює локальні опади та низьку хмарність у Східній Європі.',
  },
];

export const COMPASS_UK = ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'];

export function degToCompass(deg) {
  if (deg == null || Number.isNaN(deg)) return '—';
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS_UK[idx];
}

export const TEXTS = {
  standard: {
    verdictGood: 'Сприятливі умови для БПЛА',
    verdictWarn: 'Помірно-складні умови',
    verdictDanger: 'Складні погодні умови',
    reasonClear: 'Вітер по ешелонах у нормі, без опадів, низької щільної хмарності й обмерзання.',
    reasonFpvWind: (v, u) => `Сильний вітер на нижньому ешелоні FPV (${v} ${u})`,
    reasonFpvGusts: (v, u) => `Різкі пориви біля землі (${v} ${u})`,
    reasonWingWind: (v, u) => `Сильний вітер на ешелоні Крил (${v} ${u})`,
    reasonIcingHigh: (z, safe) =>
      safe ? `Високий ризик обмерзання (${z}); безпечно: ${safe}` : `Високий ризик обмерзання (${z})`,
    reasonIcingMod: (z, safe) =>
      safe ? `Помірний ризик обмерзання (${z}); безпечно: ${safe}` : `Помірний ризик обмерзання (${z})`,
    reasonRain: (p) => `Очікуються опади (${p}%)`,
    reasonCloudCritical: (h, c) => `Нижня кромка хмар ~${h} м (${c}%) — недопустимо для Крил`,
    reasonCloudLow: (h, c) => `Щільна хмарність від ~${h} м (${c}%)`,
    cloudNoteDenseWing: 'Щільна хмарність у зоні Крил',
    fogDense: 'Густий туман',
    fogRisk: 'Димка / ризик туману',
    icingNone: 'Чисто',
    icingMod: 'Помірний',
    icingHigh: 'Високий',
    icingSubNone: 'Ризику обмерзання немає',
    icingSubMod: (z) => `Увага: ${z}`,
    icingSubHigh: (z) => `Небезпечно: ${z}`,
    safeCorridor: (z) => `Безпечний ешелон: ${z}`,
    fpvLabel: 'Вітер • FPV',
    wingLabel: 'Вітер • Крила',
    cloudBaseLabel: 'Нижня кромка хмар',
    precipLabel: 'Опади',
    icingLabel: 'Ризик обмерзання',
    tempLabel: 'Температура',
    dayGood: 'Сприятливий',
    dayWarn: 'Помірний',
    dayDanger: 'Складний',
  },
  military: {
    verdictGood: 'Заєбісь — можна піднімати',
    verdictWarn: '«Діла йшли не те шо хуйово, но і ніззя сказать, шо харашо»',
    verdictDanger: 'Йобана срака, а не погода',
    reasonClear: 'Небо чисте, вітер не заїбе, крига не липне. Працюємо.',
    reasonFpvWind: (v, u) => `Внизу вітер — залупа (${v} ${u}), FPV здуває`,
    reasonFpvGusts: (v, u) => `Пориви їбашать (${v} ${u})`,
    reasonWingWind: (v, u) => `На висоті дує пиздець (${v} ${u}), Крилу буде важко`,
    reasonIcingHigh: (z, safe) =>
      safe
        ? `Жопа обмерзне. І камера. (${z}) — тримайся ${safe}`
        : `Жопа обмерзне. І камера. (${z})`,
    reasonIcingMod: (z, safe) =>
      safe ? `Може підморозити на ${z}; чисто: ${safe}` : `Може підморозити борт на ${z}`,
    reasonRain: (p) => `Буде поливати зверху (${p}%)`,
    reasonCloudCritical: (h, c) => `Хмари на голові (~${h} м, ${c}%) — для Крил ніхуя не варіант`,
    reasonCloudLow: (h, c) => `Хмарність єбєйша з ~${h} м (${c}%)`,
    cloudNoteDenseWing: 'Хмарність єбєйша',
    fogDense: 'Туман як молоко',
    fogRisk: 'Димка / можливий туман',
    icingNone: 'Охуєнно',
    icingMod: 'Стрьомно',
    icingHigh: 'Пиздець ❄',
    icingSubNone: 'Борт не обмерзне',
    icingSubMod: (z) => `Може хапнути льоду: ${z}`,
    icingSubHigh: (z) => `Не лізь у ${z} — замерзне`,
    safeCorridor: (z) => `Чистий ешелон: ${z}`,
    fpvLabel: 'Вітер • FPV (низ)',
    wingLabel: 'Вітер • Крила (верх)',
    cloudBaseLabel: 'Кромка хмар (стеля)',
    precipLabel: 'Чи намочить',
    icingLabel: 'Обмерзання',
    tempLabel: 'Дубак / тепло',
    dayGood: 'Заєбісь',
    dayWarn: '50/50',
    dayDanger: 'Хуйово',
  },
};

export function formatCityDisplay(name, militaryMode) {
  if (!militaryMode || !name) return name;
  const lower = name.toLowerCase();
  if (lower.includes('мирноград')) return `${name}, блядь`;
  if (lower.includes('покровськ')) return `${name}, сука`;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const suffix = Math.abs(hash) % 2 === 0 ? ', блядь' : ', сука';
  return `${name}${suffix}`;
}

export function getCopy(militaryMode) {
  return militaryMode ? TEXTS.military : TEXTS.standard;
}
