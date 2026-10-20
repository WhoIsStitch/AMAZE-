// Static game content: ball skins, board themes, achievements.

export const RARITIES = [
  { id: 'common', name: 'COMMON', color: '#22c55e' },
  { id: 'rare', name: 'RARE', color: '#3b82f6' },
  { id: 'epic', name: 'EPIC', color: '#8b5cf6' },
  { id: 'legendary', name: 'LEGENDARY', color: '#f59e0b' },
];

// look.kind picks a procedural material in textures.js. paint = tile colour left behind.
export const BALLS = [
  // ---- common
  { id: 'gold', name: 'Gold', rarity: 'common', price: 0, paint: '#ffe066', trail: '#ffd24a', look: { kind: 'metal', color: '#ffc21f', rough: 0.22 } },
  { id: 'steel', name: 'Steel', rarity: 'common', price: 200, paint: '#9ccfff', trail: '#cfe8ff', look: { kind: 'metal', color: '#d3dae6', rough: 0.2 } },
  { id: 'copper', name: 'Copper', rarity: 'common', price: 200, paint: '#ff9d6a', trail: '#ffb48c', look: { kind: 'metal', color: '#e0793c', rough: 0.28 } },
  { id: 'cherry', name: 'Cherry', rarity: 'common', price: 350, paint: '#ff6b86', trail: '#ff9bb0', look: { kind: 'plain', color: '#e8203f', rough: 0.18 } },
  { id: 'mint', name: 'Mint', rarity: 'common', price: 350, paint: '#5eead4', trail: '#a7fff0', look: { kind: 'plain', color: '#16c9a6', rough: 0.18 } },
  { id: 'grape', name: 'Grape', rarity: 'common', price: 350, paint: '#c39bff', trail: '#dcc4ff', look: { kind: 'plain', color: '#8a4bff', rough: 0.18 } },
  { id: 'tennis', name: 'Tennis', rarity: 'common', price: 500, paint: '#d9f24a', trail: '#eaff7a', look: { kind: 'tennis' } },
  { id: 'beach', name: 'Beach', rarity: 'common', price: 500, paint: '#ff7a7a', trail: '#ffd166', look: { kind: 'stripes' } },
  { id: 'bubblegum', name: 'Bubblegum', rarity: 'common', price: 650, paint: '#ff9bdc', trail: '#ffc2ea', look: { kind: 'plain', color: '#ff5fc0', rough: 0.08, clearcoat: true } },
  // ---- rare
  { id: 'moon', name: 'Moon', rarity: 'rare', price: 900, paint: '#d5dae3', trail: '#ffffff', look: { kind: 'crater' } },
  { id: 'eyeball', name: 'Eyeball', rarity: 'rare', price: 1000, paint: '#ff8fa3', trail: '#ff4d6d', look: { kind: 'eye' } },
  { id: 'smiley', name: 'Smiley', rarity: 'rare', price: 1100, paint: '#ffe066', trail: '#fff2a8', look: { kind: 'face' } },
  { id: 'hoops', name: 'Hoops', rarity: 'rare', price: 1100, paint: '#ffa552', trail: '#ffc48a', look: { kind: 'basket' } },
  { id: 'glacier', name: 'Glacier', rarity: 'rare', price: 1300, paint: '#9be7ff', trail: '#d6f6ff', look: { kind: 'ice' } },
  { id: 'candy', name: 'Candy Swirl', rarity: 'rare', price: 1400, paint: '#ff7eb6', trail: '#ffd1e6', look: { kind: 'swirl' } },
  // ---- epic
  { id: 'galaxy', name: 'Galaxy', rarity: 'epic', price: 2400, paint: '#8f7dff', trail: '#c7b8ff', look: { kind: 'galaxy' } },
  { id: 'earth', name: 'Earth', rarity: 'epic', price: 2400, paint: '#6fd08c', trail: '#8fe3ff', look: { kind: 'earth' } },
  { id: 'neongrid', name: 'Neon Grid', rarity: 'epic', price: 2800, paint: '#38f2ff', trail: '#ff3df2', look: { kind: 'grid' } },
  { id: 'disco', name: 'Disco', rarity: 'epic', price: 3000, paint: '#ff9be8', trail: '#9bf1ff', look: { kind: 'disco' } },
  { id: 'melon', name: 'Melon', rarity: 'epic', price: 3000, paint: '#ff7b88', trail: '#9be88a', look: { kind: 'melon' } },
  { id: 'circuit', name: 'Circuit', rarity: 'epic', price: 3400, paint: '#4dffb0', trail: '#4dffb0', look: { kind: 'circuit' } },
  // ---- legendary
  { id: 'prism', name: 'Prism', rarity: 'legendary', price: 5500, paint: 'rainbow', trail: 'rainbow', look: { kind: 'hue' } },
  { id: 'diamond', name: 'Diamond', rarity: 'legendary', price: 6500, paint: '#aef0ff', trail: '#ffffff', look: { kind: 'diamond' } },
  { id: 'inferno', name: 'Inferno', rarity: 'legendary', price: 7500, paint: '#ff8a2b', trail: '#ff5a1f', look: { kind: 'fire' } },
  { id: 'phantom', name: 'Phantom', rarity: 'legendary', price: 8000, paint: '#d9f6ff', trail: '#aee6ff', look: { kind: 'ghost' } },
  { id: 'void', name: 'Event Horizon', rarity: 'legendary', price: 10000, paint: '#b45cff', trail: '#7a3cff', look: { kind: 'void' } },
];

export const BALL_BY_ID = Object.fromEntries(BALLS.map((b) => [b.id, b]));

// unlock = highest level reached (any mode)
export const THEMES = [
  {
    id: 'wood', name: 'Wood Theme', unlock: 1,
    bg: ['#ffc58a', '#e8864a'], tex: 'wood',
    wall: '#e08a4a', floor: '#4a2616', base: '#b8672f', edge: null,
    sun: '#fff1dc', sky: '#ffe9d2', ground: '#7a4426', rough: 0.7, metal: 0,
  },
  {
    id: 'bricks', name: 'Bricks Theme', unlock: 10,
    bg: ['#bfe9ff', '#6cb8f2'], tex: 'bricks', studs: true,
    wall: '#ffffff', floor: '#cfd5de', base: '#2a86d6', palette: ['#ff5a4f', '#ffd23f', '#3fa7ff', '#55d96b', '#ff9a3c', '#9b6bff'],
    sun: '#ffffff', sky: '#dff3ff', ground: '#8aa4c0', rough: 0.35, metal: 0,
  },
  {
    id: 'neon', name: 'Neon Theme', unlock: 25,
    bg: ['#32127a', '#090520'], tex: 'neon', glow: true,
    wall: '#2b1f66', floor: '#120d2e', base: '#0b0720', edge: ['#00f0ff', '#ff3df2'],
    sun: '#b8a6ff', sky: '#6b4dff', ground: '#1a0f4d', rough: 0.35, metal: 0.4,
  },
  {
    id: 'plastic', name: 'Plastic Theme', unlock: 45,
    bg: ['#ffd3ee', '#a99bff'], tex: 'plastic',
    wall: '#ffffff', floor: '#fff6fb', base: '#7b5cf0', palette: ['#ff8ad0', '#7ad7ff', '#ffe36b', '#9dffb0', '#c4a3ff'],
    sun: '#fff', sky: '#ffeaf8', ground: '#b9a6f5', rough: 0.22, metal: 0,
  },
  {
    id: 'golf', name: 'Golf Theme', unlock: 70,
    bg: ['#c6f2ff', '#7fd68e'], tex: 'golf',
    wall: '#e6d3a0', floor: '#2f9d49', base: '#1e7a35',
    sun: '#fffbe8', sky: '#e6fbff', ground: '#4f9a4b', rough: 0.9, metal: 0,
  },
  {
    id: 'volcanic', name: 'Volcanic Theme', unlock: 100,
    bg: ['#4a1010', '#120303'], tex: 'volcanic', embers: true,
    wall: '#4a3c42', floor: '#1b1013', base: '#150b0d', edge: ['#ff7a1a', '#ffb347'],
    sun: '#ffb27a', sky: '#ff6a2b', ground: '#3a0f0a', rough: 0.85, metal: 0,
  },
];
export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const TILE_INFO = {
  portal: { title: 'PORTALS', text: 'Roll into one and pop out of its twin, still rolling the same way.', color: '#ff4fd8' },
  arrow: { title: 'ARROW PADS', text: 'Hit one and the ball is steered in the direction it points.', color: '#2de2e6' },
  sticky: { title: 'STICKY PADS', text: 'Gooey! The ball stops dead the moment it touches one.', color: '#ff7ac6' },
  seal: { title: 'SEAL TILES', text: 'Cracked stone. Once you roll off one, it seals shut as a wall. Plan ahead!', color: '#c9a36a' },
};

// ---- Achievements -------------------------------------------------------------------------
// stat keys live in save.stats; 'lvl_<mode>' is derived from progress.
const ACH = [];
function add(cat, color, icon, statKey, list, title, sub, rewardFn) {
  for (const target of list) {
    ACH.push({
      id: `${statKey}_${target}`, cat, color, icon, stat: statKey, target,
      title: title(target), sub, reward: rewardFn(target),
    });
  }
}
const r = (k, cap = 3000) => (t) => Math.min(cap, Math.round((40 + t * k) / 10) * 10);
add('classic', '#8b7bd8', 'ball', 'lvl_classic', [5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500], (t) => `REACH LEVEL ${t}`, 'IN CLASSIC MODE', r(3));
add('moves', '#4d8bdc', 'moves', 'lvl_moves', [3, 5, 10, 20, 30, 50, 75, 100, 150], (t) => `REACH LEVEL ${t}`, 'IN LIMITED MOVES MODE', r(4));
add('time', '#c0709e', 'clock', 'lvl_time', [3, 5, 10, 20, 30, 50, 75, 100, 150], (t) => `REACH LEVEL ${t}`, 'IN TIME RUSH MODE', r(4));
add('streak', '#6fcf8d', 'calendar', 'bestStreak', [2, 3, 5, 7, 14, 30], (t) => `PLAY ${t} DAYS`, 'IN A ROW', (t) => 50 + t * 15);
add('day', '#d6bc5c', 'sun', 'bestDay', [10, 25, 50, 100], (t) => `PLAY ${t} LEVELS`, 'IN ONE DAY', (t) => 50 + t * 4);
add('stars', '#e0a24a', 'star', 'threeStars', [5, 20, 50, 100, 250], (t) => `EARN ${t} PERFECT LEVELS`, 'THREE STARS EACH', (t) => 80 + t * 5);
add('coins', '#e8b730', 'coin', 'coinsCollected', [500, 2500, 10000, 50000], (t) => `COLLECT ${t.toLocaleString('en-US')} COINS`, 'ROLL OVER THEM ALL', (t) => Math.round(t / 10));
add('balls', '#58b8d0', 'ball', 'ballsOwned', [3, 6, 10, 15, 20, 25], (t) => `OWN ${t} BALLS`, 'VISIT THE BALL SHOP', (t) => t * 40);
add('hint', '#7f9fe0', 'bulb', 'hintsUsed', [1, 10, 50], (t) => `USE ${t} HINT${t > 1 ? 'S' : ''}`, 'NO SHAME IN IT', (t) => 30 + t * 2);
add('portal', '#e66fd0', 'portal', 'portalsUsed', [10, 100, 500], (t) => `USE PORTALS ${t} TIMES`, 'WARP SPEED', (t) => 60 + t);
add('seal', '#b79356', 'seal', 'sealsClosed', [10, 50, 250], (t) => `SEAL ${t} TILES`, 'NO TURNING BACK', (t) => 60 + t);
add('sticky', '#f07fb4', 'sticky', 'stickyStops', [10, 100], (t) => `STICK ${t} LANDINGS`, 'ON STICKY PADS', (t) => 60 + t * 2);
add('moves', '#5f8fd0', 'moves', 'totalMoves', [100, 1000, 10000], (t) => `MAKE ${t.toLocaleString('en-US')} MOVES`, 'KEEP ROLLING', (t) => 50 + Math.round(t / 20));
add('chest', '#d98c3c', 'chest', 'chests', [1, 5, 20], (t) => `OPEN ${t} CHEST${t > 1 ? 'S' : ''}`, 'EVERY 5 LEVELS', (t) => 60 + t * 10);
add('daily', '#7bcf6f', 'gift', 'dailyClaims', [1, 7, 30], (t) => `CLAIM ${t} DAILY REWARD${t > 1 ? 'S' : ''}`, 'COME BACK OFTEN', (t) => 60 + t * 8);

export const ACHIEVEMENTS = ACH;

export const DAILY_REWARDS = [
  { day: 1, coins: 100 },
  { day: 2, coins: 150 },
  { day: 3, coins: 200 },
  { day: 4, coins: 300 },
  { day: 5, coins: 400 },
  { day: 6, coins: 600 },
  { day: 7, coins: 1000, gift: true },
];
