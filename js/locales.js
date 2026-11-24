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

let militarySeed = Math.floor(Math.random() * 1_000_000);

export function rerollMilitarySeed() {
  const prevMod = (militarySeed * 31) % 12;
  let next = militarySeed;
  do {
    next = Math.floor(Math.random() * 1_000_000);
  } while ((next * 31) % 12 === prevMod);
  militarySeed = next;
}

function pick(arr, salt = 0) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  const idx = Math.abs(militarySeed * 31 + salt * 17) % arr.length;
  return arr[idx];
}

const MILITARY_POOLS = {
  verdictGood: [
    'Заєбісь — можна піднімати',
    'Погода — пісня, пташку в небо!',
    'Їбаш у небо, вітер лагідний',
    'Чистий кайф — піднімай борт',
    'Погода як під замовлення, працюємо',
    'Ідеально, блядь! Навіть РЕБ заздрить',
    'Льотна на всі сто — газ у пол',
    'Сьогодні небо наше, погнали',
    'Штиль і благодать — час робити вітер',
    'Бомба-ракета, умови топ',
    'Небо чисте, як сльоза комбата',
    'Охуєнно — запускай птаху',
  ],
  verdictWarn: [
    '«Діла йшли не те шо хуйово, но і ніззя сказать, шо харашо»',
    'Та хуй його знає, яка взагалі ця погода!',
    '50 на 50 — або долетить, або ні',
    'Трохи стрьомно, але жити можна',
    'Не ідеал, але й не повна срака',
    'Дує, зараза — тримай стіки міцніше',
    'На свій страх і ризик, бро',
    'Погода каламутна — дивись по ситуації',
    'Пташка покряхтить, але витягне',
    'Таке собі... піднімай обережно',
    'Комбат каже «треба», погода каже «ну хз»',
    'Слизька тема — перевір ешелони',
  ],
  verdictDanger: [
    'Йобана срака, а не погода',
    'Навіть полковнік плаче',
    'Я єбу який пиздець!',
    'Пташка скаже «пішов ти нахуй»',
    'Сиди в бліндажі й пий каву',
    'Хто підніме — подарує дрон вітру',
    'Повний піздєц, зливай воду',
    'Сьогодні літають лише бляшанки з даху',
    'Срака-мотика, борт знесе нахуй',
    'Небо закрито, йди спати',
    'Навіть птахи пішки ходять',
    'Їбанеться на старті — гарантую',
  ],
  reasonClear: [
    'Небо чисте, вітер не заїбе, крига не липне. Працюємо.',
    'Умови вогонь: вітер спокійний, опадів нуль — давай жару.',
    'Ні дощу, ні шторму, ні туману. Ідеальний момент для вильоту.',
    'По ешелонах рівно, без сранні з неба. Борт скаже дякую.',
    'Атмосфера на нашому боці — спокійно піднімай і працюй.',
    'Жодної залупи в повітрі: сухо, видно далеко, вітер в нормі.',
    'Вітер не здуває, плати не мокнуть — гріх не полетіти.',
    'Погода шепче: бери батареї й роби свою справу.',
    'Все зелене, як форма на складі. Можна впевнено працювати.',
    'Тиша, благодать і робочий вітер. Вдалого польоту!',
  ],
  reasonFpvWind: [
    (v, u) => `Внизу вітер — залупа (${v} ${u}), FPV здуває`,
    (v, u) => `На низах хуярить ${v} ${u} — FPV буде ковбасити`,
    (v, u) => `Вітрюган біля землі (${v} ${u}), батарею зжере миттєво`,
    (v, u) => `Внизу дує пиздець (${v} ${u}), дрон зносить з курсу`,
    (v, u) => `Штормить на 10–70 м (${v} ${u}) — FPV тяжко`,
    (v, u) => `На нижньому ешелоні лютий вітер (${v} ${u})`,
  ],
  reasonFpvGusts: [
    (v, u) => `Пориви їбашать (${v} ${u})`,
    (v, u) => `Шквали луплять до ${v} ${u} — на старті переверне`,
    (v, u) => `Пориви біля землі — жесть (${v} ${u})`,
    (v, u) => `Смикає поривами до ${v} ${u}, тримай борт`,
    (v, u) => `Дикі пориви (${v} ${u}) — посадка буде весела`,
  ],
  reasonWingWind: [
    (v, u) => `На висоті дує пиздець (${v} ${u}), Крилу буде важко`,
    (v, u) => `На ешелоні Крил вітер ${v} ${u} — може не повернутись`,
    (v, u) => `Нагорі штормить (${v} ${u}), Крило здує нахуй`,
    (v, u) => `Верхній вітер лютий (${v} ${u}) — проти вітру не витягне`,
    (v, u) => `На 300–1000 м хуярить ${v} ${u}, бережи Крило`,
  ],
  reasonIcingHigh: [
    (z, safe) => (safe ? `Жопа обмерзне. І камера. (${z}) — тримайся ${safe}` : `Жопа обмерзне. І камера. (${z})`),
    (z, safe) => (safe ? `Люта крига на ${z}; чисто: ${safe}` : `Люта крига на ${z} — лопаті стануть колом`),
    (z, safe) => (safe ? `Намерзне пиздець (${z}), літай ${safe}` : `Намерзне пиздець на ${z}`),
    (z, safe) => (safe ? `Морозилка в небі (${z}); безпечно: ${safe}` : `Морозилка в небі (${z})`),
  ],
  reasonIcingMod: [
    (z, safe) => (safe ? `Може підморозити на ${z}; чисто: ${safe}` : `Може підморозити борт на ${z}`),
    (z, safe) => (safe ? `Є шанс хапнути льоду (${z}), краще ${safe}` : `Є шанс хапнути льоду на ${z}`),
    (z, safe) => (safe ? `Трохи підмерзає на ${z}; чисто: ${safe}` : `Трохи підмерзає на ${z}`),
    (z, safe) => (safe ? `Стрьомна волога крига (${z}); тримайся ${safe}` : `Стрьомна волога крига на ${z}`),
  ],
  rainHeavyNow: [
    'Хуярить дощ',
    'Піздячить злива',
    'Ллє як з відра, блядь',
    'Потоп нахуй — заливає все',
    'Злива єбашить стіною',
  ],
  rainHeavyFuture: [
    'Нухуя собі литиме...',
    'Буде піздячити злива',
    'Заливатиме конкретно',
    'Насувається потоп, готуй човен',
    'Влупить злива — ховай борт',
  ],
  rainModNow: [
    'Помірно поливає',
    'Дощить, зараза',
    'Мочить плати потихеньку',
    'Сипле зверху, не кайф',
    'Йде дощ — лінза буде в краплях',
  ],
  rainModFuture: [
    'Буде поливати зверху',
    'Підмочить і репутацію, і дрон',
    'Нормально так покапає',
    'Очікується мокра хуйня',
    'Прилетить дощик, врахуй',
  ],
  rainLightNow: [
    'Накрапає',
    'Підливає трохи',
    'Мрячить, падло',
    'Легкий дощик сипле',
    'Трохи бризкає зверху',
  ],
  rainLightFuture: [
    'Може трохи накрапати',
    'Ймовірно підливатиме',
    'Легка мряка на підході',
    'Може покапати — перевір лак',
    'Шанс на дрібний дощ',
  ],
  rainDry: [
    'Сухо, як у Сахарі',
    'Ні краплі — працюй',
    'Без дощу, плати сухі',
    'З неба нічого не капає',
    'Сухо й комфортно',
  ],
  reasonCloudCritical: [
    (h, c) => `Хмари на голові (~${h} м, ${c}%) — для Крил ніхуя не варіант`,
    (h, c) => `Суцільне молоко від ~${h} м (${c}%) — Крило сліпне`,
    (h, c) => `Низька хмарність ~${h} м (${c}%), Крилам там робити ніхуя`,
    (h, c) => `Хмари притиснули до ~${h} м (${c}%) — оптика в нуль`,
    (h, c) => `Стеля впала на ~${h} м (${c}%), в хмарах загубиш борт`,
  ],
  reasonCloudLow: [
    (h, c) => `Хмарність єбєйша з ~${h} м (${c}%)`,
    (h, c) => `Густе молоко висить від ~${h} м (${c}%)`,
    (h, c) => `Щільні хмари з ~${h} м (${c}%) — високо не лізь`,
    (h, c) => `Хмари низько (~${h} м, ${c}%), видимість так собі`,
    (h, c) => `Небо затягнуло з ~${h} м (${c}%)`,
  ],
  cloudNoteDenseWing: [
    'Хмарність єбєйша',
    'Суцільне молоко нагорі',
    'Хмари щільні — ніхуя не видно',
    'Небо забите хмарами',
  ],
  fogDense: ['Туман як молоко', 'Туман — хоч око виколи', 'Ніхуя не видно (туман)'],
  fogRisk: ['Димка / можливий туман', 'Трохи затягує туманом', 'Може підкинути туману'],
  icingNone: ['Охуєнно', 'Чисто', 'Льоду нуль', 'Без криги'],
  icingMod: ['Стрьомно', 'Може підмерзти', 'На межі', 'Слизько'],
  icingHigh: ['Пиздець ❄', 'Люта крига ❄', 'Дубак-лід ❄', 'Замерзне ❄'],
  icingSubNone: ['Борт не обмерзне', 'Пропелери в безпеці', 'Криги немає, літай'],
  icingSubMod: [
    (z) => `Може хапнути льоду: ${z}`,
    (z) => `Підмерзає в зоні ${z}`,
    (z) => `Обережно з льодом: ${z}`,
  ],
  icingSubHigh: [
    (z) => `Не лізь у ${z} — замерзне`,
    (z) => `У ${z} моментально обмерзне`,
    (z) => `Крига на ${z} — обходь`,
  ],
  fpvLabel: ['Вітер • FPV (низ)', 'Здуває FPV (низ)', 'Вітрюган внизу', 'Що там біля землі'],
  gustsLabel: ['Пориви біля землі', 'Як штормить внизу', 'Пориви (лупить?)', 'Шквали на старті'],
  wingLabel: ['Вітер • Крила (верх)', 'Що дує нагорі', 'Вітер на ешелоні', 'Тяга для Крил'],
  takeoffLabel: ['Зліт / Посадка', 'Старт біля землі', 'Чи здує на старті'],
  cloudBaseLabel: ['Кромка хмар (стеля)', 'Де починається молоко', 'Стеля хмарності', 'Висота хмар'],
  precipLabel: ['Чи намочить', 'Дощ / срань з неба', 'Чи заллє плату', 'Мокрота зверху', 'Водні процедури'],
  icingLabel: ['Обмерзання', 'Крига на лопатях', 'Чи намерзне лід', 'Льодовиковий період'],
  tempLabel: ['Дубак / тепло', 'Спека / колотун', 'Градус за бортом', 'Чи мерзнуть АКБ', 'Мороз чи баня'],
  dayGood: ['Заєбісь', 'Топ', 'Можна!', 'Вогень'],
  dayWarn: ['50/50', 'Хз...', 'Стрьомно', 'Таке собі'],
  dayDanger: ['Хуйово', 'Срака', 'Пиздець', 'Сиди дома'],
};

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
    precipSub: (p) => `Вірогідність: <strong class="mono">${p}%</strong>`,
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
    gustsLabel: 'Пориви біля землі',
    wingLabel: 'Вітер • Крила',
    takeoffLabel: 'Зліт / Посадка',
    cloudBaseLabel: 'Нижня кромка хмар',
    precipLabel: 'Опади',
    icingLabel: 'Ризик обмерзання',
    tempLabel: 'Температура',
    dayGood: 'Сприятливий',
    dayWarn: 'Помірний',
    dayDanger: 'Складний',
  },
};

function buildMilitaryCopy(salt = 0) {
  const pickRainPhrase = (prob, mm, isNow) => {
    const heavy = mm >= 2.5 || (mm >= 1.2 && prob >= 75);
    const mod = mm >= 0.5 || prob >= 55;
    const light = mm > 0 || prob >= 25;
    if (heavy) return pick(isNow ? MILITARY_POOLS.rainHeavyNow : MILITARY_POOLS.rainHeavyFuture, salt + 11);
    if (mod) return pick(isNow ? MILITARY_POOLS.rainModNow : MILITARY_POOLS.rainModFuture, salt + 12);
    if (light) return pick(isNow ? MILITARY_POOLS.rainLightNow : MILITARY_POOLS.rainLightFuture, salt + 13);
    return pick(MILITARY_POOLS.rainDry, salt + 14);
  };

  return {
    verdictGood: pick(MILITARY_POOLS.verdictGood, salt + 1),
    verdictWarn: pick(MILITARY_POOLS.verdictWarn, salt + 2),
    verdictDanger: pick(MILITARY_POOLS.verdictDanger, salt + 3),
    reasonClear: pick(MILITARY_POOLS.reasonClear, salt + 4),
    reasonFpvWind: (v, u) => pick(MILITARY_POOLS.reasonFpvWind, salt + 5)(v, u),
    reasonFpvGusts: (v, u) => pick(MILITARY_POOLS.reasonFpvGusts, salt + 6)(v, u),
    reasonWingWind: (v, u) => pick(MILITARY_POOLS.reasonWingWind, salt + 7)(v, u),
    reasonIcingHigh: (z, safe) => pick(MILITARY_POOLS.reasonIcingHigh, salt + 8)(z, safe),
    reasonIcingMod: (z, safe) => pick(MILITARY_POOLS.reasonIcingMod, salt + 9)(z, safe),
    reasonRain: (p, mm = 0, isNow = false) => `${pickRainPhrase(p, mm, isNow)} (${p}%)`,
    precipSub: (p, mm = 0, isNow = false) =>
      `${pickRainPhrase(p, mm, isNow)} • <strong class="mono">${p}%</strong>`,
    reasonCloudCritical: (h, c) => pick(MILITARY_POOLS.reasonCloudCritical, salt + 15)(h, c),
    reasonCloudLow: (h, c) => pick(MILITARY_POOLS.reasonCloudLow, salt + 16)(h, c),
    cloudNoteDenseWing: pick(MILITARY_POOLS.cloudNoteDenseWing, salt + 17),
    fogDense: pick(MILITARY_POOLS.fogDense, salt + 18),
    fogRisk: pick(MILITARY_POOLS.fogRisk, salt + 19),
    icingNone: pick(MILITARY_POOLS.icingNone, salt + 20),
    icingMod: pick(MILITARY_POOLS.icingMod, salt + 21),
    icingHigh: pick(MILITARY_POOLS.icingHigh, salt + 22),
    icingSubNone: pick(MILITARY_POOLS.icingSubNone, salt + 23),
    icingSubMod: (z) => pick(MILITARY_POOLS.icingSubMod, salt + 24)(z),
    icingSubHigh: (z) => pick(MILITARY_POOLS.icingSubHigh, salt + 25)(z),
    safeCorridor: (z) => `Чистий ешелон: ${z}`,
    // Card labels stay consistent across hours during a session, and re-roll on refresh!
    fpvLabel: pick(MILITARY_POOLS.fpvLabel, 1),
    gustsLabel: pick(MILITARY_POOLS.gustsLabel, 2),
    wingLabel: pick(MILITARY_POOLS.wingLabel, 3),
    takeoffLabel: pick(MILITARY_POOLS.takeoffLabel, 4),
    cloudBaseLabel: pick(MILITARY_POOLS.cloudBaseLabel, 5),
    precipLabel: pick(MILITARY_POOLS.precipLabel, 6),
    icingLabel: pick(MILITARY_POOLS.icingLabel, 7),
    tempLabel: pick(MILITARY_POOLS.tempLabel, 8),
    dayGood: pick(MILITARY_POOLS.dayGood, salt + 26),
    dayWarn: pick(MILITARY_POOLS.dayWarn, salt + 27),
    dayDanger: pick(MILITARY_POOLS.dayDanger, salt + 28),
  };
}

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

export function getCopy(militaryMode, salt = 0) {
  return militaryMode ? buildMilitaryCopy(salt) : TEXTS.standard;
}
