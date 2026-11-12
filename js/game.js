/* DeskCosy — simulation */
(function () {
  const rnd = Math.random;

  function freshState() {
    const plots = [];
    for (let i = 0; i < DC.PLOT_START; i++) plots.push({ c: 'carotte', st: 0, stage: 0, p: 0, w: false, g: false });
    const st = {
      v: 3,
      farmName: 'Ma petite ferme',
      coins: 10, energy: 20,
      regions: [{ key: 'prairie', plots, bots: [], zones: 1 }], view: 0,
      upg: {}, decor: {}, unlocked: { carotte: true },
      seed: 'carotte', compostShare: 0.4,
      quests: {},
      level: 1, xp: 0,
      research: { done: {}, cur: null },
      stats: { harvests: 0, earned: 0, golden: 0, planted: 0, watered: 0, byCrop: {}, gifts: 0, playTime: 0, charges: 0 },
      seasons: 0, goldenSeeds: 0, seasonEarned: 0,
      nameIdx: Math.floor(rnd() * DC.BOT_NAMES.length),
      weather: { type: 'sun', t: 240 },
      lastSave: Date.now(),
      opts: { music: 0.3, sfx: 0.6, zoom: 0, daynight: true, layout: 'auto', dock: 'bottom', dockSize: 240, onTop: true, reserve: true, textSize: DC.RECHARGE ? 1.4 : 1 },
    };
    defineAcc(st);
    return st;
  }

  /* s.plots / s.bots / s.zones désignent la région « courante » (s.cur, non sauvegardée) */
  function defineAcc(st) {
    Object.defineProperty(st, 'cur', { value: 0, writable: true, enumerable: false, configurable: true });
    ['plots', 'bots', 'zones'].forEach(k => {
      Object.defineProperty(st, k, {
        get() { return st.regions[st.cur][k]; },
        set(v) { st.regions[st.cur][k] = v; },
        enumerable: false, configurable: true,
      });
    });
  }

  const G = DC.game = {
    s: null,
    fast: false,           // simulation accélérée (hors-ligne) : pas d'effets
    gift: null,
    listeners: {},
    incomeBuf: new Array(60).fill(0), incomeIdx: 0, incomeAcc: 0, incomeT: 0,
    nextBotId: 1,
    get stats() { return this.s.stats; },
  };

  G.on = function (ev, fn) { (G.listeners[ev] = G.listeners[ev] || []).push(fn); };
  G.emit = function (ev, data) { (G.listeners[ev] || []).forEach(f => f(data)); };

  /* ---------- Sauvegarde ---------- */
  G.serialize = function () {
    const s = G.s;
    const out = Object.assign({}, s);
    out.regions = s.regions.map(r => ({
      key: r.key, zones: r.zones,
      bots: r.bots.map(b => ({ type: b.type, name: b.name, lvl: b.lvl, x: +b.x.toFixed(2), y: +b.y.toFixed(2), bat: +b.bat.toFixed(2), wear: +(b.wear || 0).toFixed(3), br: b.state === 'broken' ? Math.ceil(b.timer) : 0 })),
      plots: r.plots.map(p => ({ c: p.c, st: p.st, stage: p.stage, p: +p.p.toFixed(3), w: p.w, g: p.g, weed: p.weed || undefined })),
    }));
    out.lastSave = Date.now();
    return JSON.stringify(out);
  };

  function markResearch(s, id) {
    const r = DC.RES[id];
    if (!r || s.research.done[id]) return;
    s.research.done[id] = true;
    r.req.forEach(q => markResearch(s, q));
  }

  /* Ancienne sauvegarde (v1) → paliers, zones et recherches équivalentes */
  function migrate(s, d) {
    if ((d.v || 1) >= 2) return;
    s.v = 2;
    s.research = { done: {}, cur: null };
    s.zones = Math.max(1, Math.min(DC.ZONES.length, Math.ceil(s.plots.length / DC.ZONE_SIZE)));
    for (const c of DC.CROPS) if (s.unlocked[c.id] && c.res) markResearch(s, c.res);
    const old = d.upg || {};
    if (old.paillis) markResearch(s, 'agro5');
    if (old.double) markResearch(s, 'agro9');
    if (old.meteo) markResearch(s, 'com2');
    if (old.or) markResearch(s, 'agro11');
    if (d.polyUnlocked) markResearch(s, 'robo8');
    ['paillis', 'double', 'meteo', 'or'].forEach(k => delete s.upg[k]);
    delete s.polyUnlocked;
    s.level = 1; s.xp = 0;
    let xp = Math.round((s.stats.harvests || 0) * 1.5);
    while (s.level < DC.LVL_MAX && xp >= DC.xpFor(s.level)) { xp -= DC.xpFor(s.level); s.level++; }
    s.xp = xp;
    s.level = Math.max(s.level, ...DC.ZONES.slice(0, s.zones).map(z => z.lvl));
  }

  G.load = function (json) {
    const base = freshState();
    let s = base;
    if (json) {
      try {
        const d = JSON.parse(json);
        s = Object.assign(base, d);
        s.opts = Object.assign(freshState().opts, d.opts || {});
        s.stats = Object.assign(freshState().stats, d.stats || {});
        s.weather = d.weather || base.weather;
        migrate(s, d);
        s.research = Object.assign({ done: {}, cur: null }, s.research);
      } catch (e) { console.warn('Sauvegarde illisible', e); s = freshState(); }
    }
    if (!s.regions || !s.regions.length) s.regions = freshState().regions;
    s.v = 3;
    s.view = Math.max(0, Math.min(s.regions.length - 1, s.view || 0));
    s.cur = s.view;
    G.s = s;
    s.regions.forEach(r => {
      r.zones = r.zones || 1;
      r.plots.forEach(p => { p.res = 0; if (!DC.CROP[p.c]) p.c = 'carotte'; });
      r.bots = (r.bots || []).map(b => { const n = G.makeBot(b.type, b.name, b.lvl, b.x, b.y); n.bat = b.bat == null ? G.batMax() : b.bat; n.wear = b.wear || 0; if (b.br > 0) { n.state = 'broken'; n.timer = b.br; } return n; });
    });
  };

  G.reset = function () { G.s = freshState(); G.gift = null; };

  /* ---------- Régions ---------- */
  G.layouts = [];
  G.regionDef = (i) => DC.REG[G.s.regions[i == null ? G.s.cur : i].key];
  G.inVallee = () => G.s.regions[G.s.cur].key === 'vallee';
  G.useRegion = function (i) {
    G.s.cur = i;
    if (G.layouts[i]) G.L = G.layouts[i];
  };
  G.regionPlots = i => (G.s.regions[i] ? G.s.regions[i].plots.length : 0);
  G.regionBots = i => (G.s.regions[i] ? G.s.regions[i].bots.length : 0);
  G.regionZones = i => (G.s.regions[i] ? G.s.regions[i].zones : 0);
  G.lvlMax = () => (G.s.regions.length > 1 ? DC.LVL_MAX2 : DC.LVL_MAX);
  G.regionReqs = function () {
    return [
      [`Toutes les recherches de la Prairie (${G.researchCount('base')}/${DC.RESEARCH_BASE.length})`, G.researchCount('base') >= DC.RESEARCH_BASE.length],
      [`Palier 25 (${G.s.level})`, G.s.level >= 25],
      [`Les 8 zones de la Prairie (${G.regionZones(0)}/8)`, G.regionZones(0) >= DC.ZONES.length],
    ];
  };
  G.canUnlockRegion = () => G.s.regions.length < DC.REGIONS.length && G.regionReqs().every(r => r[1]);
  G.unlockRegion = function () {
    const def = DC.REGIONS[G.s.regions.length];
    if (!def || !G.canUnlockRegion()) return false;
    if (!G.spend(def.cost)) return false;
    const plots = [];
    for (let i = 0; i < DC.PLOT_START; i++) plots.push({ c: 'carotte', st: 0, stage: 0, p: 0, w: false, g: false, res: 0 });
    G.s.regions.push({ key: def.key, plots, bots: [], zones: 1 });
    G.emit('regionUnlocked', def);
    G.checkQuests();
    return true;
  };
  G.switchRegion = function (i) {
    if (!G.s.regions[i]) return false;
    G.s.view = i;
    G.useRegion(i);
    G.gift = null;
    G.emit('regionSwitch', i);
    return true;
  };

  /* ---------- Recherche ---------- */
  G.rs = id => !!G.s.research.done[id];
  G.researchCount = kind => Object.keys(G.s.research.done).filter(id => {
    const r = DC.RES[id];
    if (!r) return false;
    return kind === 'base' ? r.b !== 'vallee' : kind === 'vallee' ? r.b === 'vallee' : true;
  }).length;
  G.researchState = function (id) {
    const r = DC.RES[id], R = G.s.research;
    if (R.done[id]) return 'done';
    if (R.cur && R.cur.id === id) return 'cur';
    if (r.b === 'vallee' && G.s.regions.length < 2) return 'region';
    if (!r.req.every(q => R.done[q])) return 'req';
    if (G.s.level < DC.TIER_LVL[r.t - 1]) return 'lvl';
    return 'ok';
  };
  G.startResearch = function (id) {
    const r = DC.RES[id];
    if (G.s.research.cur || G.researchState(id) !== 'ok') return false;
    if (!G.spend(r.cost)) return false;
    G.s.research.cur = { id, t: 0 };
    G.emit('researchStart', r);
    return true;
  };
  G.cancelResearch = function () {
    const c = G.s.research.cur;
    if (!c) return false;
    G.earn(DC.RES[c.id].cost * 0.5);   // remboursement partiel
    G.s.stats.earned -= DC.RES[c.id].cost * 0.5; G.s.seasonEarned -= DC.RES[c.id].cost * 0.5;
    G.s.research.cur = null;
    return true;
  };
  function finishResearch(id) {
    const r = DC.RES[id];
    G.s.research.done[id] = true;
    G.s.research.cur = null;
    const crop = DC.CROPS.find(c => c.res === id);
    if (crop) G.s.unlocked[crop.id] = true;
    G.addXp(5 * r.t * r.t);
    G.emit('research', r);
    G.checkQuests();
  }
  function updateResearch(dt) {
    const c = G.s.research.cur;
    if (!c) return;
    c.t += dt * G.researchSpeed();
    if (c.t >= DC.RES[c.id].time) finishResearch(c.id);
  }

  /* ---------- Paliers ---------- */
  G.addXp = function (n) {
    const s = G.s;
    const max = G.lvlMax();
    if (s.level >= max) return;
    s.xp += n;
    while (s.level < max && s.xp >= DC.xpFor(s.level)) {
      s.xp -= DC.xpFor(s.level);
      s.level++;
      G.emit('levelup', s.level);
    }
    if (s.level >= max) s.xp = 0;
  };
  /* Ce qu'apporte un palier (pour l'affichage) */
  G.levelPerks = function (L) {
    const p = [];
    if (L > 1 && DC.maxBotsFor(L) > DC.maxBotsFor(L - 1)) p.push(`${DC.maxBotsFor(L)} robots max`);
    const zi = DC.ZONES.findIndex(z => z.lvl === L);
    if (zi > 0) p.push(`zone ${zi + 1} achetable`);
    const vz = DC.REG.vallee.zones.findIndex(z => z.lvl === L);
    if (vz > 0) p.push(`Vallée : zone ${vz + 1}`);
    const ti = DC.TIER_LVL.indexOf(L);
    if (ti >= 0) p.push(`recherches niveau ${ti + 1}`);
    if (L > 1) p.push(`améliorations niv. ${DC.upgCapFor(L)}`);
    if (L > 1 && DC.botLvlCapFor(L) > DC.botLvlCapFor(L - 1)) p.push(`robots niv. ${DC.botLvlCapFor(L)}`);
    return p;
  };

  /* ---------- Calculs ---------- */
  G.lvl = id => G.s.upg[id] || 0;
  G.energyCap = () => DC.energyCapFor(G.lvl('reservoir')) + (G.rs('ener2') ? 100 : 0) + (G.rs('ener5') ? 300 : 0);
  G.comfort = function () {
    let c = 0;
    for (const id in G.s.decor) if (DC.DEC[id]) c += DC.DEC[id].comfort * G.s.decor[id];
    return c;
  };
  G.decorCount = function () { let n = 0; for (const id in G.s.decor) n += G.s.decor[id]; return n; };
  G.countBots = type => G.s.bots.filter(b => b.type === type).length;
  G.maxBotLevel = () => G.s.bots.reduce((m, b) => Math.max(m, b.lvl), 0);
  G.growthMult = () => (1 + 0.08 * G.lvl('engrais')) * (1 + (G.rs('agro3') ? 0.15 : 0) + (G.rs('agro7') ? 0.25 : 0)) *
    (1 + 0.04 * (G.s.decor.ruche || 0)) * DC.seedGrow(G.s.goldenSeeds);
  G.coinMult = () => (1 + 0.08 * G.lvl('marche')) * (1 + (G.rs('com1') ? 0.15 : 0) + (G.rs('com3') ? 0.3 : 0) + (G.rs('com5') ? 0.5 : 0)) *
    (1 + 0.02 * G.comfort() * (G.rs('com6') ? 2 : 1)) * DC.seedCoin(G.s.goldenSeeds);
  G.researchSpeed = () => DC.seedResearch(G.s.goldenSeeds);
  G.xpMult = () => DC.seedXp(G.s.goldenSeeds);
  G.treeCount = () => G.s.regions.reduce((n, r) => n + r.plots.filter(p => p.st > 0 && DC.CROP[p.c] && DC.CROP[p.c].tree).length, 0);
  G.energyMult = () => (1 + 0.06 * G.lvl('compost')) * (1 + (G.rs('ener1') ? 0.25 : 0) + (G.rs('ener4') ? 0.5 : 0) + (G.rs('ener6') ? 1 : 0));
  G.solarRate = () => 0.04 * (G.rs('ener3') ? 4 : 1) * (G.rs('ener6') ? 2 : 1);
  G.upgCap = id => Math.min(DC.UPG[id].max, DC.upgCapFor(G.s.level));
  G.upgCost = function (id) { const u = DC.UPG[id]; return Math.floor(u.base * Math.pow(u.growth, G.lvl(id))); };
  G.maxBots = () => DC.maxBotsFor(G.s.level);
  G.botAvailable = type => { const t = DC.BOT[type]; return (!t.res || G.rs(t.res)) && (!t.lvl || G.s.level >= t.lvl); };
  G.botCost = function (type) {
    const t = DC.BOT[type];
    return Math.floor(t.cost * Math.pow(DC.BOT_COST_GROWTH, G.countBots(type)));
  };
  G.botLvlCap = () => DC.botLvlCapFor(G.s.level);
  G.botUpCost = b => Math.floor(DC.BOT[b.type].cost * 0.9 * Math.pow(1.75, b.lvl - 1)) + 10;
  G.botSpeed = b => 1.6 * (b.tuned > 0 ? 1.2 : 1) * (1 + 0.12 * (b.lvl - 1)) * (G.rs('robo2') ? 1.15 : 1) * (G.rs('robo9') ? 1.3 : 1);
  G.botWork = function (b, job) {
    let t = 0.9 / (1 + 0.12 * (b.lvl - 1));
    if (job === 'water' && G.s.decor.puits) t *= 0.75;
    if (G.rs('robo9')) t *= 0.7;
    return t;
  };
  G.wearMult = () => (G.rs('atel5') ? 0.65 : 1) * (G.rs('atel8') ? 0.7 : 1);
  G.selfRepair = () => (G.rs('atel8') ? 10 : DC.SELF_REPAIR);
  /* Atelier de réparation */
  G.hasShop = () => G.rs('atel1');
  G.shopSlots = () => (G.hasShop() ? 1 + (G.rs('atel2') ? 1 : 0) + (G.rs('atel6') ? 2 : 0) : 0);
  G.serviceTime = () => DC.SERVICE_TIME * (G.rs('atel3') ? 0.5 : 1);
  G.serviceAt = () => (G.rs('atel4') ? 0.45 : DC.SERVICE_AT);
  G.storm = () => G.s.weather.type === 'storm';
  G.outage = () => G.storm() && !G.rs('ener7');
  G.batMax = () => DC.BAT_BASE * (1 + (G.rs('robo1') ? 0.5 : 0) + (G.rs('robo6') ? 1 : 0));
  G.actionCost = crop => DC.BAT_ACTION * (crop ? DC.cropEffort(crop) : 1) * (G.rs('robo5') ? 0.75 : 1);
  G.chargeRate = () => DC.CHARGE_RATE * (G.rs('robo4') ? 1.6 : 1);
  G.chargeSlots = () => DC.CHARGE_SLOTS + (G.rs('robo3') ? 1 : 0) + (G.rs('robo7') ? 2 : 0);
  G.plotCost = () => DC.plotCost(G.s.plots.length);
  G.zonePlots = () => Math.min(DC.PLOT_MAX, G.s.zones * DC.ZONE_SIZE);
  G.maxPlots = () => Math.min(G.zonePlots(), G.L ? G.L.capacity : DC.PLOT_MAX);
  G.nextZone = () => G.regionDef().zones[G.s.zones] || null;
  G.incomePerMin = function () { return G.incomeBuf.reduce((a, b) => a + b, 0); };

  /* ---------- Économie ---------- */
  G.canAfford = n => G.s.coins >= n;
  G.spend = function (n) { if (G.s.coins < n) return false; G.s.coins -= n; return true; };
  G.earn = function (n) {
    G.s.coins += n; G.s.stats.earned += n; G.s.seasonEarned += n; G.incomeAcc += n;
  };

  /* ---------- Robots ---------- */
  G.makeBot = function (type, name, lvl, x, y) {
    if (!name) { name = DC.BOT_NAMES[G.s ? G.s.nameIdx % DC.BOT_NAMES.length : 0]; if (G.s) G.s.nameIdx++; }
    return {
      id: G.nextBotId++, type, name, lvl: lvl || 1,
      x: x == null ? 0 : x, y: y == null ? 0 : y,
      bat: G.s ? G.batMax() : DC.BAT_BASE, slot: -1, wslot: -1, wear: 0, tuned: 0,
      state: 'idle', job: null, plot: -1, tx: 0, ty: 0, timer: Math.random(), think: 0,
      face: 1, bob: Math.random() * 6, blink: 2 + Math.random() * 3, happy: 0, wanderPause: 0,
    };
  };

  G.buyBot = function (type) {
    if (G.s.bots.length >= G.maxBots() || !G.botAvailable(type)) return null;
    const cost = G.botCost(type);
    if (!G.spend(cost)) return null;
    const st = G.L ? G.L.station : { x: 2, y: 2 };
    const b = G.makeBot(type, null, 1, st.x, st.y);
    G.s.bots.push(b);
    G.emit('botBought', b);
    G.checkQuests();
    return b;
  };

  G.upgradeBot = function (b) {
    if (b.lvl >= G.botLvlCap()) return false;
    if (!G.spend(G.botUpCost(b))) return false;
    b.lvl++; b.happy = 1.5;
    G.checkQuests();
    return true;
  };

  function needs(p, job) {
    if (job === 'weed') return !!p.weed;
    if (job === 'harvest') return p.st === 2;
    if (job === 'plant') return p.st === 0;
    if (job === 'water') return p.st === 1 && !p.w && !G.raining();
    return false;
  }
  G.needs = needs;

  function release(b) {
    if (b.tgt) { const o = G.s.bots.find(x => x.id === b.tgt); if (o && o.fixBy === b.id) o.fixBy = 0; b.tgt = 0; }
    const c = G.crows[G.s.cur];
    if (c && c.chasedBy === b.id) c.chasedBy = 0;
    if (b.job === 'repair' || b.job === 'crow') { b.plot = -1; b.job = null; return; }
    if (b.plot >= 0 && G.s.plots[b.plot] && G.s.plots[b.plot].res === b.id) G.s.plots[b.plot].res = 0;
    b.plot = -1; b.job = null;
  }

  function findRepair(b) {
    let best = null, bd = 1e9;
    for (const o of G.s.bots) {
      if (o.state !== 'broken' || (o.fixBy && o.fixBy !== b.id)) continue;
      const d = (o.x - b.x) ** 2 + (o.y - b.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function findTask(b) {
    const plots = G.s.plots, L = G.L;
    if (b.type === 'repar') {
      const o = findRepair(b);
      if (o) { o.fixBy = b.id; b.tgt = o.id; return ['repair', -1]; }
      const c = G.crows[G.s.cur];
      if (c && !c.chasedBy) { c.chasedBy = b.id; return ['crow', c.plot]; }
      return null;
    }
    const jobs = G.regionDef().weeds ? ['weed'].concat(DC.BOT[b.type].jobs) : DC.BOT[b.type].jobs;
    for (const job of jobs) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < plots.length; i++) {
        const p = plots[i];
        if (p.res || !needs(p, job)) continue;
        const pos = L.plot(i);
        const dx = pos.x + 0.5 - b.x, dy = pos.y + 0.5 - b.y;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return [job, best];
    }
    return null;
  }

  function moveTo(b, tx, ty, speed, dt, drain) {
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    if (b.bat <= 0) speed *= 0.4;                 // à plat : on se traîne jusqu'à la borne
    const step = speed * dt;
    if (Math.abs(dx) > 0.05) b.face = dx > 0 ? 1 : -1;
    const moved = Math.min(step, d);
    if (drain) b.bat = Math.max(0, b.bat - moved * DC.BAT_MOVE * (G.inVallee() && !G.rs('val3') ? G.regionDef().slope : 1));
    if (d <= step || d < 0.01) { b.x = tx; b.y = ty; return true; }
    b.x += dx / d * step; b.y += dy / d * step;
    return false;
  }

  /* bornes de recharge */
  function freeSlot(b) {
    const n = G.chargeSlots();
    const used = new Set(G.s.bots.filter(o => o !== b && o.slot >= 0).map(o => o.slot));
    for (let i = 0; i < n; i++) if (!used.has(i)) return i;
    return -1;
  }
  function goCharge(b) {
    release(b);
    b.slot = freeSlot(b);
    b.state = b.slot >= 0 ? 'tocharge' : 'queue';
  }
  G.goCharge = goCharge;
  function freeShopSlot(b) {
    const n = G.shopSlots();
    const used = new Set(G.s.bots.filter(o => o !== b && o.wslot >= 0).map(o => o.wslot));
    for (let i = 0; i < n; i++) if (!used.has(i)) return i;
    return -1;
  }
  G.shopBusy = () => G.s.bots.filter(b => b.state === 'servicing');

  function updateBot(b, dt) {
    const L = G.L, s = G.s;
    b.bob += dt * 4;
    if (b.happy > 0) b.happy -= dt;
    if (b.tuned > 0) b.tuned -= dt;
    b.blink -= dt; if (b.blink < -0.15) b.blink = 2 + rnd() * 4;
    if (b.slot >= G.chargeSlots()) b.slot = -1;

    switch (b.state) {
      case 'queue': {   // attend une borne libre
        const spot = L.sleepSpot(b.id);
        moveTo(b, spot.x, spot.y, G.botSpeed(b) * 0.6, dt, false);
        b.think -= dt;
        if (b.think <= 0) { b.think = 0.5; b.slot = freeSlot(b); if (b.slot >= 0) b.state = 'tocharge'; }
        break;
      }
      case 'tocharge': {
        if (b.slot < 0) { b.state = 'queue'; break; }
        const p = L.chargeSpot(b.slot);
        if (moveTo(b, p.x, p.y, G.botSpeed(b), dt, false)) b.state = 'charging';
        break;
      }
      case 'charging': {
        const max = G.batMax();
        const need = max - b.bat;
        const out = G.storm() ? (G.rs('ener7') ? 0.5 : 0) : 1;
        if (need > 0.01 && s.energy > 0 && out > 0) {
          const amt = Math.min(G.chargeRate() * out * dt, need, s.energy / DC.BAT_TO_TANK);
          b.bat += amt;
          s.energy -= amt * DC.BAT_TO_TANK;
        }
        if (b.bat >= max - 0.01) {
          b.bat = max; b.slot = -1; b.state = 'idle'; b.think = 0; b.happy = 0.6;
          s.stats.charges++;
        }
        break;
      }
      case 'idle':
      case 'wander': {
        b.think -= dt;
        if (b.think <= 0) {
          b.think = 0.35 + rnd() * 0.3;
          if (b.bat < DC.BAT_LOW) { goCharge(b); break; }
          if (G.hasShop() && (b.wear || 0) >= G.serviceAt()) {
            const ws = freeShopSlot(b);
            if (ws >= 0) { release(b); b.wslot = ws; b.state = 'toshop'; break; }
          }
          const t = findTask(b);
          if (t) {
            b.job = t[0]; b.plot = t[1];
            if (b.job !== 'repair' && b.job !== 'crow') s.plots[b.plot].res = b.id;
            b.state = 'move';
            break;
          }
          // rien à faire : on fait le plein si une borne est libre
          if (b.bat < G.batMax() * 0.6 && s.energy > 2 && !G.outage() && freeSlot(b) >= 0) { goCharge(b); break; }
        }
        // flâner tranquillement
        if (b.state === 'idle') {
          b.wanderPause -= dt;
          if (b.wanderPause <= 0) {
            const p = L.wanderPoint(b);
            b.tx = p.x; b.ty = p.y; b.state = 'wander';
          }
        } else if (moveTo(b, b.tx, b.ty, G.botSpeed(b) * 0.35, dt, false)) {
          b.state = 'idle'; b.wanderPause = 1.5 + rnd() * 4;
        }
        break;
      }
      case 'toshop': {
        if (!G.hasShop() || b.wslot < 0) { b.wslot = -1; b.state = 'idle'; break; }
        const d = L.shopDoor;
        if (moveTo(b, d.x, d.y, G.botSpeed(b), dt, false)) { b.state = 'servicing'; b.timer = G.serviceTime(); }
        break;
      }
      case 'servicing': {
        b.timer -= dt;
        b.wear = Math.max(0, (b.wear || 0) - dt / G.serviceTime());
        if (b.timer <= 0) {
          b.wear = 0; b.breakAt = 0; b.wslot = -1; b.state = 'idle'; b.think = 0; b.happy = 1;
          if (G.rs('atel7')) b.tuned = 300;
          s.stats.services = (s.stats.services || 0) + 1;
          G.emit('serviced', b);
          G.checkQuests();
        }
        break;
      }
      case 'broken': {
        b.timer -= dt;
        if (b.timer <= 0) G.repairBot(b, 'auto');
        break;
      }
      case 'move': {
        if (b.job === 'repair' || b.job === 'crow') {
          let tx, ty;
          if (b.job === 'repair') {
            const o = s.bots.find(x => x.id === b.tgt);
            if (!o || o.state !== 'broken') { release(b); b.state = 'idle'; b.think = 0; break; }
            tx = o.x + 0.7; ty = o.y;
          } else {
            const c = G.crows[s.cur];
            if (!c || c.plot !== b.plot) { release(b); b.state = 'idle'; b.think = 0; break; }
            const pos = L.plot(b.plot); tx = pos.x + 0.5; ty = pos.y + 0.55;
          }
          if (moveTo(b, tx, ty, G.botSpeed(b) * 1.2, dt, true)) { b.state = 'work'; b.timer = b.job === 'repair' ? 2 : 0.4; }
          break;
        }
        const p = s.plots[b.plot];
        if (!p || !needs(p, b.job)) { release(b); b.state = 'idle'; b.think = 0; break; }
        const pos = L.plot(b.plot);
        if (moveTo(b, pos.x + 0.5, pos.y + 0.55, G.botSpeed(b), dt, true)) {
          b.state = 'work'; b.timer = G.botWork(b, b.job);
          G.emit('botWorkStart', b);
        }
        break;
      }
      case 'work': {
        b.timer -= dt;
        if (b.timer <= 0 && (b.job === 'repair' || b.job === 'crow')) {
          b.bat = Math.max(0, b.bat - DC.BAT_ACTION);
          if (b.job === 'repair') { const o = s.bots.find(x => x.id === b.tgt); if (o && o.state === 'broken') G.repairBot(o, b); }
          else G.chaseCrow(b);
          release(b);
          b.state = 'idle'; b.think = 0.1; b.happy = 0.8;
          break;
        }
        if (b.timer <= 0) {
          const i = b.plot, p = s.plots[i];
          if (p && needs(p, b.job)) {
            b.bat = Math.max(0, b.bat - G.actionCost(b.job === 'weed' ? null : DC.CROP[p.c]));
            if (b.job === 'weed') weed(i, b);
            else if (b.job === 'harvest') { harvest(i, b); b.happy = 0.8; }
            else if (b.job === 'plant') plant(i, null, b);
            else if (b.job === 'water') water(i, b);
            wearBot(b, b.job === 'weed' ? null : DC.CROP[p.c]);
          }
          release(b);
          if (b.state === 'broken') break;
          b.state = 'idle'; b.think = 0.1;
        }
        break;
      }
      default: b.state = 'idle';
    }
  }

  /* ---------- Pannes ---------- */
  function wearBot(b, crop) {
    if (G.s.level < DC.WEAR_LVL) return;
    b.wear = Math.min(1.3, (b.wear || 0) + DC.WEAR_ACTION * (crop ? DC.cropEffort(crop) : 1) * G.wearMult());
    // chaque robot a son propre seuil de rupture (tiré à chaque remise à neuf)
    if (!b.breakAt) b.breakAt = DC.BREAK_MIN + rnd() * DC.BREAK_SPAN;
    if (b.wear >= b.breakAt) {
      b.breakAt = 0;
      b.state = 'broken'; b.timer = G.selfRepair(); b.slot = -1; b.fixBy = 0;
      G.s.stats.breakdowns = (G.s.stats.breakdowns || 0) + 1;
      G.emit('breakdown', b);
    }
  }
  /* who : robot réparateur, null = le joueur, 'auto' = réparation spontanée */
  G.repairBot = function (b, who) {
    if (b.state !== 'broken') return false;
    b.state = 'idle'; b.think = 0; b.wear = 0; b.breakAt = 0; b.fixBy = 0; b.happy = 1.2;
    G.s.stats.repairs = (G.s.stats.repairs || 0) + 1;
    G.emit('repair', { b, who });
    G.checkQuests();
    return true;
  };
  G.brokenCount = () => G.s.regions.reduce((n, r) => n + r.bots.filter(b => b.state === 'broken').length, 0);

  /* ---------- Corbeaux (un par région au plus, non sauvegardés) ---------- */
  G.crows = [];
  G.crowTimer = 150;
  function updateCrows(dt) {
    const s = G.s, c = G.crows[s.cur];
    if (c) {
      const p = s.plots[c.plot];
      if (!p || p.st !== 2) { G.crows[s.cur] = null; G.emit('crowGone', { i: c.plot }); return; }
      c.t -= dt;
      if (c.t <= 0) {
        p.st = 0; p.stage = 0; p.p = 0; p.w = false; p.g = false;
        G.crows[s.cur] = null;
        s.stats.eaten = (s.stats.eaten || 0) + 1;
        G.emit('crowAte', { i: c.plot });
      }
      return;
    }
    if (s.level < DC.CROW_LVL || G.fast) return;
    if (s.cur === 0) G.crowTimer -= dt;
    if (G.crowTimer > 0) return;
    const ripe = [];
    for (let i = 0; i < s.plots.length; i++) if (s.plots[i].st === 2 && !s.plots[i].res) ripe.push(i);
    if (!ripe.length) return;
    G.crowTimer = (100 + rnd() * 140) * (1 + 1.5 * (s.decor.cible || 0));
    const i = ripe[Math.floor(rnd() * ripe.length)];
    G.crows[s.cur] = { plot: i, t: DC.CROW_EAT, chasedBy: 0 };
    G.emit('crow', { i });
  }
  G.crowAt = i => { const c = G.crows[G.s.cur]; return c && c.plot === i ? c : null; };
  G.chaseCrow = function (who) {
    const c = G.crows[G.s.cur];
    if (!c) return false;
    G.crows[G.s.cur] = null;
    G.s.stats.crows = (G.s.stats.crows || 0) + 1;
    G.emit('crowChased', { i: c.plot, who });
    G.checkQuests();
    return true;
  };

  /* ---------- Actions sur parcelles ---------- */
  function plant(i, crop, who) {
    const p = G.s.plots[i];
    if (p.st !== 0) return false;
    if (crop) p.c = crop;
    if (!G.s.unlocked[p.c]) p.c = 'carotte';
    p.st = 1; p.stage = 0; p.p = 0; p.w = G.raining(); p.g = false;
    G.s.stats.planted++;
    G.emit('plant', { i, who });
    return true;
  }
  function water(i, who) {
    const p = G.s.plots[i];
    if (p.st !== 1 || p.w) return false;
    p.w = true;
    G.s.stats.watered++;
    G.emit('water', { i, who });
    return true;
  }
  function weed(i, who) {
    const p = G.s.plots[i];
    if (!p.weed) return false;
    p.weed = false;
    G.s.stats.weeds = (G.s.stats.weeds || 0) + 1;
    G.emit('weed', { i, who });
    return true;
  }
  G.weed = weed;

  function harvest(i, who) {
    const p = G.s.plots[i];
    if (p.st !== 2) return false;
    const crop = DC.CROP[p.c];
    let qty = 1;
    if (G.rs('agro9') && rnd() < 0.15) qty = 2;
    const reg = G.regionDef(), val = reg.key === 'vallee';
    if (val && G.rs('val6')) qty *= 2;
    const golden = p.g;
    if (golden) { qty *= 10; G.s.stats.golden++; }
    const share = G.s.compostShare;
    const coins = qty * (1 - share) * crop.sell * G.coinMult() * reg.sell * (val && G.rs('val5') ? 1.5 : 1);
    const energy = qty * share * crop.energy * G.energyMult();
    G.earn(coins);
    G.s.energy = Math.min(G.energyCap(), G.s.energy + energy);
    G.s.stats.harvests += qty;
    G.s.stats.byCrop[p.c] = (G.s.stats.byCrop[p.c] || 0) + qty;
    if (crop.tree) { p.st = 1; p.stage = 1; p.p = 0; p.w = true; p.g = false; }   // l'arbre refait des fruits
    else { p.st = 0; p.stage = 0; p.p = 0; p.w = false; p.g = false; }
    G.emit('harvest', { i, who, crop, qty, coins, energy, golden });
    G.addXp(DC.cropXp(crop) * qty * reg.xp * G.xpMult());
    G.checkQuests();
    return true;
  }
  G.plant = plant; G.water = water; G.harvest = harvest;

  /* clic joueur sur une parcelle */
  G.tapPlot = function (i) {
    const p = G.s.plots[i];
    if (p.weed) return weed(i, null) ? 'weed' : null;
    if (p.st === 2) return harvest(i, null) ? 'harvest' : null;
    if (p.st === 0) return plant(i, G.s.seed, null) ? 'plant' : null;
    if (p.st === 1 && !p.w) return water(i, null) ? 'water' : null;
    if (p.st === 1 && p.c !== G.s.seed && p.stage === 0 && p.p < 0.05) {
      p.c = G.s.seed; return 'swap';
    }
    return 'busy';
  };

  /* Changer la culture préférée d'une parcelle (replantée par les robots) */
  G.assignPlot = function (i, crop) { G.s.plots[i].c = crop; };

  G.buyPlot = function () {
    if (G.s.plots.length >= G.maxPlots()) return false;
    if (!G.spend(G.plotCost())) return false;
    G.s.plots.push({ c: G.s.seed, st: 0, stage: 0, p: 0, w: false, g: false, res: 0 });
    G.emit('plotBought', G.s.plots.length - 1);
    G.checkQuests();
    return true;
  };

  /* 'ok' | 'lvl' | 'max' */
  G.zoneState = function () {
    const z = G.nextZone();
    if (!z) return 'max';
    if (G.s.level < z.lvl) return 'lvl';
    return 'ok';
  };
  G.buyZone = function () {
    const z = G.nextZone();
    if (!z || G.s.level < z.lvl) return false;
    if (!G.spend(z.cost)) return false;
    G.s.zones++;
    G.emit('zoneBought', G.s.zones);
    G.checkQuests();
    return true;
  };

  G.buyUpgrade = function (id) {
    if (G.lvl(id) >= G.upgCap(id)) return false;
    if (!G.spend(G.upgCost(id))) return false;
    G.s.upg[id] = G.lvl(id) + 1;
    if (id === 'reservoir') G.s.energy = Math.min(G.energyCap(), G.s.energy + 20);
    G.checkQuests();
    return true;
  };

  G.buyDecor = function (id) {
    const d = DC.DEC[id], n = G.s.decor[id] || 0;
    if (n >= d.max) return false;
    if (!G.spend(DC.decorCost(d, n))) return false;
    G.s.decor[id] = n + 1;
    G.emit('decorBought', id);
    G.checkQuests();
    return true;
  };

  /* ---------- Météo ---------- */
  G.raining = () => G.s.weather.type === 'rain' || G.s.weather.type === 'storm';
  function updateWeather(dt) {
    const w = G.s.weather;
    w.t -= dt;
    if (w.t > 0) return;
    if (w.type === 'rain' || w.type === 'storm') {
      w.type = rnd() < 0.5 ? 'cloud' : 'sun';
      w.t = (300 + rnd() * 420) * (G.rs('com2') ? 0.6 : 1);
    } else if (w.type === 'cloud') {
      w.type = G.s.level >= DC.STORM_LVL && rnd() < DC.STORM_CHANCE ? 'storm' : 'rain'; w.t = 45 + rnd() * 60;
      G.emit(w.type, true);
    } else {
      w.type = rnd() < 0.6 ? 'cloud' : 'rain'; w.t = w.type === 'rain' ? 45 + rnd() * 50 : 60 + rnd() * 90;
      if (w.type === 'rain') G.emit('rain', true);
    }
  }

  /* ---------- Cadeaux ---------- */
  G.giftTimer = 120 + rnd() * 120;
  function updateGift(dt) {
    if (G.gift) {
      G.gift.t -= dt;
      if (G.gift.t <= 0) G.gift = null;
      return;
    }
    G.giftTimer -= dt;
    if (G.giftTimer <= 0 && !G.fast && G.L && G.L.freeTiles.length) {
      G.giftTimer = (160 + rnd() * 200) * (G.rs('com4') ? 0.5 : 1);
      const tiles = G.L.freeTiles;
      const t = tiles[Math.floor(rnd() * tiles.length)];
      G.gift = { x: t.x, y: t.y, t: 50, kind: rnd() < 0.7 ? 'coins' : 'energy' };
      G.emit('gift', G.gift);
    }
  }
  G.openGift = function () {
    const g = G.gift;
    if (!g) return null;
    G.gift = null;
    G.s.stats.gifts++;
    if (g.kind === 'energy') {
      const e = G.energyCap() - G.s.energy;
      G.s.energy = G.energyCap();
      return { kind: 'energy', amount: e, x: g.x, y: g.y };
    }
    const amount = Math.max(25, G.incomePerMin() * 2.5, G.s.coins * 0.05) * (G.rs('com4') ? 2 : 1);
    G.earn(amount);
    return { kind: 'coins', amount, x: g.x, y: g.y };
  };

  /* ---------- Objectifs ---------- */
  G.activeQuests = function () {
    return DC.QUESTS.filter(q => !G.s.quests[q.id]).slice(0, 3);
  };
  G.checkQuests = function () {
    for (const q of G.activeQuests()) {
      const [v, target] = q.check(G);
      if (v >= target) {
        G.s.quests[q.id] = true;
        G.earn(q.reward);
        G.emit('quest', q);
        return G.checkQuests();
      }
    }
  };

  /* ---------- Saison (prestige) ---------- */
  G.prestigeGain = () => DC.goldenSeedsFor(G.s.seasonEarned);
  G.canPrestige = () => G.s.seasonEarned >= DC.PRESTIGE_MIN;
  G.prestige = function () {
    if (!G.canPrestige()) return false;
    const old = G.s, fresh = freshState();
    fresh.goldenSeeds = old.goldenSeeds + G.prestigeGain();
    fresh.seasons = old.seasons + 1;
    fresh.decor = old.decor;
    fresh.decorOrder = old.decorOrder;
    fresh.quests = old.quests;
    fresh.stats = old.stats;
    fresh.opts = old.opts;
    fresh.tuto = old.tuto;
    fresh.seen = old.seen;
    fresh.farmName = old.farmName;
    fresh.nameIdx = old.nameIdx;
    fresh.coins = 30 + fresh.goldenSeeds * 20;
    G.s = fresh;
    G.gift = null;
    G.checkQuests();
    G.emit('prestige', fresh.goldenSeeds);
    return true;
  };

  /* ---------- Boucle ---------- */
  G.update = function (dt) {
    const s = G.s;
    s.stats.playTime += dt;
    updateWeather(dt);
    updateResearch(dt);
    // panneau solaire de l'atelier : les robots ne restent jamais bloqués
    if (s.energy < G.energyCap()) s.energy = Math.min(G.energyCap(), s.energy + G.solarRate() * dt);
    const rain = G.raining();
    const goldChance = 0.01 + (G.rs('agro11') ? 0.02 : 0);
    const mulch = G.rs('agro5') ? 0.25 : 0;
    for (let r = 0; r < s.regions.length; r++) {
      G.useRegion(r);
      updatePlots(dt, rain, goldChance, mulch);
      for (const b of s.bots) updateBot(b, dt);
      updateCrows(dt);
    }
    G.useRegion(s.view);
    updateGift(dt);

    // revenu par minute (fenêtre glissante de 60 s)
    G.incomeT += dt;
    while (G.incomeT >= 1) {
      G.incomeT -= 1;
      G.incomeIdx = (G.incomeIdx + 1) % 60;
      G.incomeBuf[G.incomeIdx] = G.incomeAcc;
      G.incomeAcc = 0;
    }
  };

  function updatePlots(dt, rain, goldChance, mulch) {
    const s = G.s, reg = G.regionDef(), val = reg.key === 'vallee';
    const gm = G.growthMult() * reg.grow * (val && G.rs('val4') ? 1.5 : 1);
    const weedRate = reg.weeds ? dt / 240 * (G.rs('val2') ? 0.5 : 1) : 0;
    const keepWet = Math.max(mulch, val && G.rs('val1') ? 0.4 : 0);
    for (let i = 0; i < s.plots.length; i++) {
      const p = s.plots[i];
      if (p.st !== 1) continue;
      if (weedRate && !p.weed && rnd() < weedRate) { p.weed = true; G.emit('weedGrow', i); }
      if (p.weed) continue;
      const crop = DC.CROP[p.c];
      if (rain || crop.tree) p.w = true;
      if (!p.w) continue;
      const before = p.p;
      p.p += dt * gm / DC.stageTime(crop, p.stage);
      // Vallée : la terre sèche à mi-croissance
      if (reg.dryMid && !crop.tree && before < 0.5 && p.p >= 0.5 && p.p < 1 && !rain) p.w = rnd() < keepWet;
      if (p.p >= 1) {
        p.p = 0;
        p.stage++;
        if (!rain) p.w = rnd() < keepWet;
        if (p.stage >= 2) {
          p.stage = 2; p.st = 2; p.w = false;
          p.g = rnd() < goldChance;
          G.emit('ripe', i);
        }
      }
    }
  }

  /* Rattrapage après absence */
  G.catchUp = function (seconds) {
    seconds = Math.min(seconds, DC.OFFLINE_MAX || 12 * 3600);
    if (seconds < 5) return null;
    const before = { coins: G.s.coins, harvests: G.s.stats.harvests, earned: G.s.stats.earned, level: G.s.level, res: G.researchCount() };
    G.fast = true;
    const step = seconds > 3600 ? 1 : 0.5;
    let t = 0;
    while (t < seconds) { const d = Math.min(step, seconds - t); G.update(d); t += d; }
    G.fast = false;
    G.incomeBuf.fill(0); G.incomeAcc = 0;
    return {
      seconds,
      coins: G.s.stats.earned - before.earned,
      harvests: G.s.stats.harvests - before.harvests,
      levels: G.s.level - before.level,
      research: G.researchCount() - before.res,
    };
  };
})();
