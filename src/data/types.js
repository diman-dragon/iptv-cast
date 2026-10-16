// Типы источников. Порядок = порядок чипов в каталоге. color — акцент карточки.
export const TYPES = [
  { id: 'mix', emoji: '🌍', color: '#3b82f6', key: 'type.mix' },
  { id: 'sport', emoji: '⚽', color: '#22c55e', key: 'type.sport' },
  { id: 'news', emoji: '📰', color: '#ef4444', key: 'type.news' },
  { id: 'movies', emoji: '🎬', color: '#a855f7', key: 'type.movies' },
  { id: 'kids', emoji: '🧸', color: '#f59e0b', key: 'type.kids' },
  { id: 'music', emoji: '🎵', color: '#ec4899', key: 'type.music' },
  { id: 'docs', emoji: '🔭', color: '#14b8a6', key: 'type.docs' },
  { id: 'fun', emoji: '🎭', color: '#f97316', key: 'type.fun' },
  { id: 'life', emoji: '🌿', color: '#84cc16', key: 'type.life' },
  { id: 'world', emoji: '🗺️', color: '#06b6d4', key: 'type.world' },
  { id: 'mine', emoji: '⭐', color: '#eab308', key: 'type.mine' },
];

export const findType = (id) => TYPES.find((t) => t.id === id) ?? TYPES[0];
