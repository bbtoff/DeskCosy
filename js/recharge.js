/* DeskCosy — « Mode recharge » : version tactile et accélérée,
   pensée pour jouer sur l'écran d'une voiture pendant une recharge (20 à 45 min).
   Sauvegarde séparée, prix / XP / recherches compressés (~80× plus rapide en fin de jeu),
   absence plafonnée à 30 min. Activation : ?recharge=1, dossier /recharge/, navigateur Tesla,
   ou bouton dans les Options. Chargé après game.js. */
(function () {
  const G = DC.game;
  const q = location.search;
  const KEY = 'deskcosy.mode';
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };

  DC.isTesla = /Tesla\//.test(navigator.userAgent);
  DC.isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  const desktop = /[?&]desktop=1/.test(q);
  let on;
  if (/[?&]recharge=1/.test(q)) on = true;
  else if (/[?&]recharge=0/.test(q)) on = false;
  else if (store(KEY)) on = store(KEY) === 'recharge';
  else on = DC.isTesla;
  if (desktop) on = false;
  DC.RECHARGE = on;

  /* Changer de mode : chaque mode a sa propre partie */
  DC.setMode = function (recharge) {
    if (DC.main && DC.main.save) DC.main.save();
    store(KEY, recharge ? 'recharge' : 'normal');
    location.href = location.pathname.replace(/recharge\/?$/, '') + (recharge ? '?recharge=1' : '?recharge=0');
  };

  if (!on) return;
  if (/[?&]recharge=1/.test(q) && !/[?&]demo=/.test(q)) store(KEY, 'recharge');
  document.documentElement.classList.add('recharge');
  const bs = document.querySelector('.boot-sub'); if (bs) bs.textContent = '🔌 Mode recharge';

  DC.SAVE_KEY = 'deskcosy.recharge.v1';
  DC.OFFLINE_MAX = 30 * 60;               // absence prise en compte : 30 min
  const K = DC.RECHARGE_K = 80;           // facteur d'accélération en fin de partie

  /* Compression douce des montants : quasi inchangés en dessous de ~100,
     divisés par ~K pour les gros montants (monotone, jamais < 1). */
  const C1 = 50 * K;
  const sq = c => (c <= 0 ? c : Math.max(1, Math.floor(c * (c + C1) / (K * c + C1))));
  DC.squash = sq;

  DC.RESEARCH.forEach(r => { r.cost = sq(r.cost); r.time = Math.max(10, Math.round(r.time / K)); });
  DC.REGIONS.forEach(reg => { if (reg.cost) reg.cost = sq(reg.cost); reg.zones = reg.zones.map(z => ({ cost: sq(z.cost), lvl: z.lvl })); });
  DC.ZONES = DC.REGIONS[0].zones;
  DC.QUESTS.forEach(qq => { qq.reward = sq(qq.reward); });
  DC.PRESTIGE_MIN = sq(DC.PRESTIGE_MIN);

  const wrap = (obj, name) => { const f = obj[name]; obj[name] = (...a) => sq(f(...a)); };
  wrap(DC, 'plotCost');
  wrap(DC, 'decorCost');
  wrap(DC, 'xpFor');
  wrap(G, 'upgCost');
  wrap(G, 'botCost');
  wrap(G, 'botUpCost');
  const gs = DC.goldenSeedsFor;
  DC.goldenSeedsFor = e => gs(e * K);

  /* Durée de la session de recharge en cours */
  DC.sessionStart = Date.now();
})();
