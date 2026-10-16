// Встроенный каталог бесплатных публичных плейлистов (M3U).
// Приложение не содержит каналов: это ссылки на открытые списки сообщества iptv-org и Free-TV.
// Что в них играет и доступно ли в вашей стране — зависит от самих вещателей.
// id стабильны: по ним хранятся кэш и пометки пользователя.
const IO = 'https://iptv-org.github.io/iptv/';

const src = (id, type, emoji, url, ru, en, dru, den) => ({
  id,
  type,
  emoji,
  url,
  name: { ru, en },
  desc: { ru: dru, en: den },
  builtin: true,
});

const cat = (type, slug, emoji, ru, en, dru, den) =>
  src(`io-${slug}`, type, emoji, `${IO}categories/${slug}.m3u`, ru, en, dru, den);

// Флаг по коду страны (iptv-org использует «uk», а Юникод — «gb»).
export const flag = (code) =>
  String.fromCodePoint(...[...(code === 'uk' ? 'gb' : code).toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));

const country = (code, ru, en) =>
  src(`io-c-${code}`, 'world', flag(code), `${IO}countries/${code}.m3u`, ru, en, `Эфирные и онлайн-каналы: ${ru}`, `TV channels: ${en}`);

const language = (code, ru, en) =>
  src(`io-l-${code}`, 'world', '🗣️', `${IO}languages/${code}.m3u`, `Язык: ${ru}`, `Language: ${en}`, `Каналы на языке «${ru}» со всего мира`, `Channels in ${en} from all over the world`);

export const CATALOG = [
  // ---- Подборки
  src('io-all', 'mix', '🌐', `${IO}index.m3u`, 'Все каналы мира', 'All channels', 'Полный список iptv-org: тысячи каналов (загрузка дольше)', 'The full iptv-org list: thousands of channels (slower to load)'),
  src('io-by-category', 'mix', '🗂️', `${IO}index.category.m3u`, 'Все по категориям', 'All by category', 'Те же каналы, сгруппированные по тематике', 'The same channels grouped by topic'),
  src('freetv', 'mix', '🆓', 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8', 'Free-TV', 'Free-TV', 'Проверяемый список бесплатных ТВ-каналов по странам', 'A curated list of free TV channels by country'),
  src('io-public', 'mix', '🏛️', `${IO}categories/public.m3u`, 'Общественное ТВ', 'Public broadcasters', 'Общественные вещатели', 'Public service broadcasters'),

  // ---- Спорт
  cat('sport', 'sports', '🏆', 'Спорт', 'Sports', 'Футбол, хоккей, теннис, единоборства: спортивные каналы мира', 'Football, hockey, tennis, combat sports: sports channels worldwide'),
  cat('sport', 'outdoor', '🏔️', 'Экстрим и природа', 'Outdoor & adventure', 'Экстремальный спорт, охота, рыбалка, походы', 'Extreme sports, hunting, fishing, hiking'),

  // ---- Новости
  cat('news', 'news', '📰', 'Новости', 'News', 'Мировые и местные новостные каналы', 'World and local news channels'),
  cat('news', 'weather', '⛅', 'Погода', 'Weather', 'Прогнозы и метеоканалы', 'Forecasts and weather channels'),
  cat('news', 'business', '💼', 'Бизнес и финансы', 'Business & finance', 'Экономика, рынки, финансы', 'Economy, markets, finance'),
  cat('news', 'legislative', '🏛️', 'Парламенты', 'Parliaments', 'Трансляции заседаний и политика', 'Parliament sessions and politics'),

  // ---- Кино и сериалы
  cat('movies', 'movies', '🎬', 'Кино', 'Movies', 'Каналы с фильмами', 'Movie channels'),
  cat('movies', 'series', '📺', 'Сериалы', 'Series', 'Сериалы и шоу', 'TV series and shows'),
  cat('movies', 'classic', '🎞️', 'Классика', 'Classics', 'Старое кино и ретро-каналы', 'Old films and retro channels'),

  // ---- Детям
  cat('kids', 'kids', '🧸', 'Детские', 'Kids', 'Мультфильмы и детские передачи', 'Cartoons and children’s shows'),
  cat('kids', 'animation', '🎨', 'Анимация', 'Animation', 'Мультики и аниме', 'Cartoons and anime'),
  cat('kids', 'family', '👨‍👩‍👧', 'Семейные', 'Family', 'Каналы для всей семьи', 'Channels for the whole family'),

  // ---- Музыка
  cat('music', 'music', '🎵', 'Музыка', 'Music', 'Клипы, концерты, радио с картинкой', 'Music videos, concerts, radio with picture'),
  cat('music', 'relax', '🌅', 'Релакс', 'Relax', 'Спокойные пейзажи и музыка для фона', 'Calm scenery and background music'),

  // ---- Познание
  cat('docs', 'documentary', '🎥', 'Документальные', 'Documentary', 'Природа, история, расследования', 'Nature, history, investigations'),
  cat('docs', 'science', '🔬', 'Наука', 'Science', 'Наука и технологии', 'Science and technology'),
  cat('docs', 'education', '🎓', 'Образование', 'Education', 'Обучающие и университетские каналы', 'Educational and university channels'),
  cat('docs', 'culture', '🎻', 'Культура', 'Culture', 'Искусство, театр, культура', 'Art, theatre, culture'),

  // ---- Развлечения
  cat('fun', 'entertainment', '🎭', 'Развлекательные', 'Entertainment', 'Шоу, реалити, развлечения', 'Shows, reality, entertainment'),
  cat('fun', 'comedy', '😂', 'Комедии', 'Comedy', 'Юмор и комедийные каналы', 'Humour and comedy channels'),
  cat('fun', 'general', '📡', 'Общие (эфирные)', 'General', 'Универсальные каналы: фильмы, новости, шоу', 'Generalist channels: movies, news, shows'),
  cat('fun', 'shop', '🛍️', 'Магазин на диване', 'Shopping', 'Телемагазины', 'Teleshopping'),

  // ---- Лайфстайл
  cat('life', 'lifestyle', '✨', 'Лайфстайл', 'Lifestyle', 'Мода, дом, здоровье', 'Fashion, home, health'),
  cat('life', 'cooking', '🍳', 'Кулинария', 'Cooking', 'Рецепты и кулинарные шоу', 'Recipes and cooking shows'),
  cat('life', 'travel', '✈️', 'Путешествия', 'Travel', 'Страны, города, маршруты', 'Countries, cities, routes'),
  cat('life', 'auto', '🚗', 'Авто', 'Auto', 'Автомобили и мотоспорт', 'Cars and motorsport'),
  cat('life', 'religious', '🕊️', 'Религия', 'Religious', 'Религиозные каналы', 'Religious channels'),

  // ---- Страны
  country('ru', 'Россия', 'Russia'),
  country('ua', 'Украина', 'Ukraine'),
  country('by', 'Беларусь', 'Belarus'),
  country('kz', 'Казахстан', 'Kazakhstan'),
  country('md', 'Молдова', 'Moldova'),
  country('am', 'Армения', 'Armenia'),
  country('ge', 'Грузия', 'Georgia'),
  country('az', 'Азербайджан', 'Azerbaijan'),
  country('rs', 'Сербия', 'Serbia'),
  country('bg', 'Болгария', 'Bulgaria'),
  country('pl', 'Польша', 'Poland'),
  country('cz', 'Чехия', 'Czechia'),
  country('ro', 'Румыния', 'Romania'),
  country('gr', 'Греция', 'Greece'),
  country('tr', 'Турция', 'Türkiye'),
  country('de', 'Германия', 'Germany'),
  country('fr', 'Франция', 'France'),
  country('es', 'Испания', 'Spain'),
  country('it', 'Италия', 'Italy'),
  country('pt', 'Португалия', 'Portugal'),
  country('nl', 'Нидерланды', 'Netherlands'),
  country('uk', 'Великобритания', 'United Kingdom'),
  country('us', 'США', 'United States'),
  country('ca', 'Канада', 'Canada'),
  country('br', 'Бразилия', 'Brazil'),
  country('in', 'Индия', 'India'),
  country('jp', 'Япония', 'Japan'),
  country('kr', 'Южная Корея', 'South Korea'),
  country('au', 'Австралия', 'Australia'),
  country('il', 'Израиль', 'Israel'),
  country('ae', 'ОАЭ', 'UAE'),
  country('eg', 'Египет', 'Egypt'),

  // ---- Языки
  language('rus', 'русский', 'Russian'),
  language('eng', 'английский', 'English'),
  language('ukr', 'украинский', 'Ukrainian'),
  language('srp', 'сербский', 'Serbian'),
  language('deu', 'немецкий', 'German'),
  language('fra', 'французский', 'French'),
  language('spa', 'испанский', 'Spanish'),
  language('ita', 'итальянский', 'Italian'),
  language('por', 'португальский', 'Portuguese'),
  language('pol', 'польский', 'Polish'),
  language('tur', 'турецкий', 'Turkish'),
  language('ara', 'арабский', 'Arabic'),
];
