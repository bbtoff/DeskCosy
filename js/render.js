/* DeskCosy — mise en page adaptative (paysage / portrait) et rendu */
(function () {
  const G = DC.game;
  const R = DC.render = { zoom: 2, dpr: 1, fx: [], floats: [], rain: [], animals: [], hover: null, time: 0 };
  let canvas, ctx;

  const BARN = [[93, 94, 95], [105, 106, 107], [126, 127, 128]];

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* taille du texte dessiné dans le monde (en pixels du monde) */
  R.fontSize = function () {
    const ts = (G.s && G.s.opts.textSize) || 1;
    return Math.round(Math.max(8, 13 / R.zoom) * ts * 2) / 2;
  };

  R.init = function (cv) {
    canvas = cv; ctx = cv.getContext('2d');
  };

  /* ---------------- Mise en page ---------------- */
  function buildLayout(cssW, cssH, zoom, hudPx, nSlots, mode) {
    const tp = 16 * zoom;
    const fw = Math.floor(cssW / tp), fh = Math.floor(cssH / tp);
    const Tw = Math.ceil(cssW / tp), Th = Math.ceil(cssH / tp);
    const top = Math.max(1, Math.round((hudPx - 6) / tp));
    const landscape = mode === 'landscape' || (mode === 'auto' && cssW >= cssH * 1.15);
    const L = { zoom, tp, fw, fh, Tw, Th, top, landscape, buildings: [] };
    const occ = new Set();
    const mark = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) occ.add(i + ',' + j); };

    if (landscape) {
      const bottom = fh - top >= 8 ? 1 : 0;
      const R0 = fh - top - bottom;                   // rangées utilisables
      const by = top + Math.max(0, Math.floor((R0 - 5) / 2) * (R0 >= 7 ? 1 : 0));
      L.buildings.push({ kind: 'barn', x: 1, y: by, w: 3, h: 3 });
      L.buildings.push({ kind: 'compost', x: 4, y: by + 1, w: 2, h: 1 });
      L.buildings.push({ kind: 'market', x: 4, y: by + 2, w: 2, h: 1 });
      const bx = 6;
      L.station = { x: 2.5, y: by + 3.4 };
      const b = R0 >= 5 ? 1 : 0;
      const fr = Math.max(1, Math.min(R0 - 2 * b, 8));
      const fx = bx + 1;
      const fc = Math.max(1, Math.ceil(nSlots / fr));
      const fy = top + Math.floor((R0 - fr - 2 * b) / 2);
      L.field = { x: fx, y: fy, w: fc + 2 * b, h: fr + 2 * b, b };
      L.capacity = Math.max(0, (fw - fx - 2 * b - 1)) * fr;
      L.plot = i => ({ x: fx + b + Math.floor(i / fr), y: fy + b + (i % fr) });
    } else {
      const bottom = 1;
      const by = top;
      L.buildings.push({ kind: 'barn', x: 1, y: by, w: 3, h: 3 });
      let blockH = 3;
      if (fw >= 8) {
        L.buildings.push({ kind: 'compost', x: fw - 3, y: by + 1, w: 2, h: 1 });
        L.buildings.push({ kind: 'market', x: fw - 3, y: by + 2, w: 2, h: 1 });
      } else {
        L.buildings.push({ kind: 'compost', x: 4, y: by + 1, w: 2, h: 1 });
        L.buildings.push({ kind: 'market', x: 4, y: by + 2, w: 2, h: 1 });
      }
      L.station = { x: 2.5, y: by + 3.4 };
      const b = fw >= 6 ? 1 : 0;
      const fc = Math.max(1, Math.min(fw - 2 - 2 * b, 8));
      const fr = Math.max(1, Math.ceil(nSlots / fc));
      const fy = by + blockH + 2;
      const fx = Math.floor((fw - fc - 2 * b) / 2);
      L.field = { x: fx, y: fy, w: fc + 2 * b, h: fr + 2 * b, b };
      L.capacity = Math.max(0, fh - bottom - fy - 2 * b) * fc;
      L.plot = i => ({ x: fx + b + (i % fc), y: fy + b + Math.floor(i / fc) });
    }

    const cp = L.buildings.find(bd => bd.kind === 'compost');
    L.buildings.push({ kind: 'atelier', x: cp.x, y: cp.y - 1, w: 2, h: 1 });
    L.shopDoor = { x: cp.x + 1, y: cp.y - 0.25 };
    L.buildings.forEach(bd => mark(bd.x, bd.y, bd.w, bd.h));
    mark(1, L.buildings[0].y + 3, 3, 1); // devant l'atelier
    const pads = Math.min(6, G.chargeSlots());
    if (pads > 3) mark(1, L.buildings[0].y + 4, 3, 1);
    L.chargeSpot = i => ({ x: 1.5 + (i % 3), y: L.buildings[0].y + 3.62 + Math.floor(i / 3) });
    L.padCount = pads;
    mark(L.field.x, L.field.y, L.field.w, L.field.h);

    L.bounds = { x0: 0.5, y0: top + 0.6, x1: fw - 0.5, y1: fh - 0.2 };
    L.freeTiles = [];
    for (let y = top; y < fh; y++) for (let x = 0; x < fw; x++) if (!occ.has(x + ',' + y)) L.freeTiles.push({ x, y });
    // ordre stable et "naturel" pour placer la déco
    // la déco pousse autour de la ferme, de façon un peu irrégulière
    const cx = L.field.x + L.field.w / 2, cy = L.field.y + L.field.h / 2;
    const score = t => {
      const dx = Math.max(0, Math.abs(t.x + 0.5 - cx) - L.field.w / 2), dy = Math.max(0, Math.abs(t.y + 0.5 - cy) - L.field.h / 2);
      return Math.hypot(dx, dy * 1.3) + hash(t.x, t.y) * 3.5 + ((t.x + t.y) % 2 ? 0.6 : 0);
    };
    L.decorTiles = L.freeTiles.filter(t => t.y > top).map(t => ({ x: t.x, y: t.y, s: score(t) })).sort((a, b) => a.s - b.s);
    L.occ = occ;

    L.sleepSpot = id => ({ x: 4.2 + ((id * 0.77) % 1.6), y: L.buildings[0].y + 3.5 + ((id * 0.37) % 0.9) });
    L.wanderPoint = function (bot) {
      const near = Math.random() < 0.6;
      let x, y;
      if (near) { x = bot.x + (Math.random() - 0.5) * 4; y = bot.y + (Math.random() - 0.5) * 2.5; }
      else { const t = L.freeTiles[Math.floor(Math.random() * L.freeTiles.length)] || { x: 2, y: top + 2 }; x = t.x + 0.5; y = t.y + 0.6; }
      return { x: Math.max(L.bounds.x0, Math.min(L.bounds.x1, x)), y: Math.max(L.bounds.y0, Math.min(L.bounds.y1, y)) };
    };
    return L;
  }

  R.layout = function (cssW, cssH, hudPx) {
    const s = G.s;
    G.layouts = [];
    let fb = false;
    for (let i = 0; i < s.regions.length; i++) {
      s.cur = i;
      G.layouts[i] = layoutRegion(cssW, cssH, hudPx);
      if (i === s.view) fb = R.layoutFallback;
    }
    R.layoutFallback = fb;
    G.useRegion(s.view);
    R.zoom = G.L.zoom;
    R.placeAnimals();
    return G.L;
  };

  function layoutRegion(cssW, cssH, hudPx) {
    const s = G.s;
    const zonesDef = G.regionDef().zones;
    const owned = Math.min(DC.PLOT_MAX, s.zones * DC.ZONE_SIZE);
    const nSlots = Math.max(s.plots.length + 1, Math.min(DC.PLOT_MAX, owned + (s.zones < zonesDef.length ? DC.ZONE_SIZE : 0)));
    const minDim = Math.min(cssW, cssH);
    let auto = Math.max(1, Math.floor(minDim / (16 * (cssW >= cssH ? 5.5 : 8))));
    auto = Math.min(auto, 5);
    const startZoom = Math.max(1, Math.min(8, auto + (s.opts.zoom || 0)));
    const need = Math.min(nSlots, DC.PLOT_MAX);
    // disposition demandée d'abord ; si le champ ne tient pas (ex. portrait forcé
    // dans une bande horizontale), on bascule sur l'autre disposition.
    const wanted = s.opts.layout || 'auto';
    const auto2 = cssW >= cssH * 1.15 ? 'landscape' : 'portrait';
    const modes = wanted === 'auto' ? ['auto'] : [wanted, wanted === 'landscape' ? 'portrait' : 'landscape'];
    if (wanted !== 'auto' && modes[1] !== auto2) modes.push(auto2);
    let L, zoom;
    R.layoutFallback = false;
    outer: for (let m = 0; m < modes.length; m++) {
      for (zoom = startZoom; zoom >= 1; zoom--) {
        L = buildLayout(cssW, cssH, zoom, hudPx, nSlots, modes[m]);
        if (L.capacity >= need) { R.layoutFallback = m > 0; break outer; }
      }
    }
    if (!L || L.capacity < need) { zoom = 1; L = buildLayout(cssW, cssH, 1, hudPx, nSlots, 'auto'); R.layoutFallback = wanted !== 'auto'; }
    L.zoom = zoom;
    // garder les robots dans la zone
    s.bots.forEach(b => {
      if (b.x < L.bounds.x0 || b.x > L.bounds.x1 || b.y < L.bounds.y0 || b.y > L.bounds.y1) {
        b.x = L.station.x + Math.random() - 0.5; b.y = L.station.y;
      }
    });
    return L;
  }

  /* Liste ordonnée des déco achetées */
  R.decorList = function () {
    const s = G.s;
    if (!s.decorOrder) s.decorOrder = [];
    // complète l'ordre si l'état a des déco non listées (anciennes sauvegardes / prestige)
    const counts = {};
    s.decorOrder.forEach(id => counts[id] = (counts[id] || 0) + 1);
    for (const id in s.decor) for (let k = counts[id] || 0; k < s.decor[id]; k++) s.decorOrder.push(id);
    return s.decorOrder;
  };

  R.placeAnimals = function () {
    const L = G.L, list = R.decorList();
    const old = R.animals;
    R.animals = [];
    list.forEach((id, k) => {
      const d = DC.DEC[id];
      if (!d || !d.animal) return;
      const t = L.decorTiles[k % Math.max(1, L.decorTiles.length)] || { x: 2, y: L.top + 2 };
      const prev = old.find(a => a.k === k);
      R.animals.push(prev && prev.x <= L.bounds.x1 && prev.y <= L.bounds.y1 ? prev :
        { k, id, x: t.x + 0.5, y: t.y + 0.8, tx: t.x + 0.5, ty: t.y + 0.8, face: 1, pause: Math.random() * 3, hop: 0, heart: 0 });
    });
  };

  /* ---------------- Effets ---------------- */
  R.float = function (x, y, text, color, icon) {
    R.floats.push({ x, y, text, color: color || '#fff', icon, t: 0 });
    if (R.floats.length > 40) R.floats.shift();
  };
  R.burst = function (x, y, color, n, kind) {
    for (let i = 0; i < (n || 6); i++) {
      R.fx.push({ x, y, vx: (Math.random() - 0.5) * 2.2, vy: -Math.random() * 2.5 - 0.5, t: 0, life: 0.5 + Math.random() * 0.4, color, kind });
    }
    if (R.fx.length > 300) R.fx.splice(0, R.fx.length - 300);
  };

  /* ---------------- Rendu ---------------- */
  function px(v) { return Math.round(v * 16); }

  function drawGround(L) {
    for (let y = 0; y < L.Th; y++) for (let x = 0; x < L.Tw; x++) {
      const h = hash(x, y);
      DC.drawTile(ctx, 'town', h < 0.14 ? 1 : 0, x * 16, y * 16);
    }
    // champ en terre (9-slice)
    const f = L.field;
    if (f.b) {
      for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
        const col = i === 0 ? 0 : (i === f.w - 1 ? 2 : 1);
        const row = j === 0 ? 0 : (j === f.h - 1 ? 2 : 1);
        DC.drawTile(ctx, 'town', 12 + row * 12 + col, (f.x + i) * 16, (f.y + j) * 16);
      }
    }
    // chemin devant l'atelier
    const barn = L.buildings[0];
    DC.drawTile(ctx, 'town', 39, (barn.x + 1) * 16, (barn.y + 3) * 16);
  }

  /* arbres d'automne décoratifs dans la Vallée (au loin, sans gêner la déco) */
  function drawAutumn(L, list) {
    if (!G.inVallee()) return;
    const tiles = L.decorTiles;
    const n = Math.min(16, Math.floor(tiles.length / 4));
    for (let k = 0; k < n; k++) {
      const t = tiles[tiles.length - 1 - k * 3];
      if (!t) break;
      const kinds = [3, 15, 27, 3, 29];
      const tile = kinds[Math.floor(hash(t.x, t.y) * kinds.length)];
      list.push({ y: t.y + 1, draw: () => DC.drawTile(ctx, 'town', tile, t.x * 16, t.y * 16) });
    }
  }
  function drawLeaves(L, dt) {
    if (!G.inVallee()) { R.leaves = []; return; }
    const W = L.Tw * 16, H = L.Th * 16;
    R.leaves = R.leaves || [];
    while (R.leaves.length < Math.min(40, W * H / 3000)) R.leaves.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 8, ph: Math.random() * 6, c: Math.random() < 0.5 ? '#e8892f' : '#c9502a' });
    for (const f of R.leaves) {
      f.y += f.v * dt; f.x += Math.sin(R.time * 1.5 + f.ph) * 8 * dt;
      if (f.y > H) { f.y = -2; f.x = Math.random() * W; }
      ctx.fillStyle = f.c;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 1);
    }
  }

  function drawBuildings(L) {
    const s = G.s;
    for (const b of L.buildings) {
      if (b.kind === 'barn') {
        BARN.forEach((row, j) => row.forEach((t, i) => DC.drawTile(ctx, 'farm', t, (b.x + i) * 16, (b.y + j) * 16)));
        // lumière à la fenêtre la nuit
        if (R.night > 0.2) {
          ctx.fillStyle = `rgba(255,214,120,${R.night * 0.9})`;
          ctx.fillRect((b.x + 2) * 16 + 5, (b.y + 2) * 16 + 5, 7, 5);
        }
      } else if (b.kind === 'compost') {
        DC.drawTile(ctx, 'farm', 112, b.x * 16, b.y * 16);
        DC.drawTile(ctx, 'farm', 113, (b.x + 1) * 16, b.y * 16);
        // jauge d'énergie
        const r = s.energy / G.energyCap();
        ctx.fillStyle = '#2e2230'; ctx.fillRect(b.x * 16 + 3, b.y * 16 - 3, 26, 4);
        ctx.fillStyle = r < 0.15 ? '#e0602e' : '#8fe04f'; ctx.fillRect(b.x * 16 + 4, b.y * 16 - 2, Math.round(24 * r), 2);
      } else if (b.kind === 'atelier') {
        if (!G.hasShop()) continue;
        DC.drawTile(ctx, 'farm', 98, b.x * 16, b.y * 16);
        DC.drawTile(ctx, 'farm', 99, (b.x + 1) * 16, b.y * 16);
        DC.drawTile(ctx, 'farm', 86, b.x * 16 + 1, b.y * 16 - 5);
        DC.drawTile(ctx, 'farm', 87, b.x * 16 + 15, b.y * 16 - 5);
        // postes : une jauge par robot en révision
        const n = G.shopSlots(), busy = G.shopBusy();
        for (let k = 0; k < n; k++) {
          const x = b.x * 16 + 2 + k * 7, y = b.y * 16 - 8;
          const bot = busy.find(o => o.wslot === k);
          ctx.fillStyle = '#2e2230'; ctx.fillRect(x, y, 6, 4);
          ctx.fillStyle = bot ? '#4a525c' : '#7d8794'; ctx.fillRect(x + 1, y + 1, 4, 2);
          if (bot) { ctx.fillStyle = '#ffd34d'; ctx.fillRect(x + 1, y + 1, Math.max(1, Math.round(4 * (1 - bot.timer / G.serviceTime()))), 2); }
        }
        if (busy.length && Math.random() < 0.15) R.burst(b.x + 1 + (Math.random() - 0.5), b.y + 0.3, Math.random() < 0.5 ? '#ffd34d' : '#ffffff', 1);
      } else if (b.kind === 'market') {
        const unlocked = DC.CROPS.filter(c => s.unlocked[c.id]);
        const show = unlocked.slice(-2);
        if (show.length < 2) show.unshift(null);
        show.forEach((c, i) => DC.drawTile(ctx, 'farm', c ? c.crate : 76, (b.x + i) * 16, b.y * 16));
      }
    }
  }

  const FRUITS = [[3, 4], [10, 3], [7, 7], [12, 8], [4, 9], [9, 10]];
  function drawTree(crop, p, i, x, y) {
    const t = R.time;
    if (p.stage === 0 && p.st === 1) {
      DC.drawTile(ctx, 'farm', 81, x, y - 2);
    } else {
      const sway = Math.round(Math.sin(t * 1.2 + i) * 0.5);
      DC.drawTile(ctx, 'town', crop.tile, x + sway, y - 5);
      // fruits : ils grossissent pendant la repousse, puis brillent quand c'est mûr
      const n = p.st === 2 ? FRUITS.length : Math.floor(p.p * FRUITS.length);
      ctx.fillStyle = p.st === 2 && p.g ? '#ffd34d' : crop.fruit;
      for (let k = 0; k < n; k++) {
        const [fx, fy] = FRUITS[k];
        const sz = p.st === 2 ? 2 : 1;
        ctx.fillRect(x + sway + fx, y - 5 + fy + (p.st === 2 ? Math.round(Math.sin(t * 3 + k + i) * 0.4) : 0), sz, sz);
      }
      if (p.st === 2) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let k = 0; k < n; k += 2) { const [fx, fy] = FRUITS[k]; ctx.fillRect(x + sway + fx, y - 5 + fy, 1, 1); } }
    }
    if (p.st === 1) {
      const prog = (p.stage + p.p) / 2;
      ctx.fillStyle = 'rgba(46,34,48,.55)'; ctx.fillRect(x + 2, y + 14, 12, 2);
      ctx.fillStyle = p.stage ? '#ffb03a' : '#9fe36a'; ctx.fillRect(x + 2, y + 14, Math.max(1, Math.round(12 * (p.stage ? p.p : prog))), 2);
    }
    if (p.st === 2 && p.g) { ctx.strokeStyle = 'rgba(255,211,77,0.9)'; ctx.strokeRect(x + 0.5, y + 0.5, 15, 15); }
  }

  function drawPlots(L) {
    const s = G.s, t = R.time;
    for (let i = 0; i < s.plots.length; i++) {
      const p = s.plots[i], pos = L.plot(i);
      const x = pos.x * 16, y = pos.y * 16;
      DC.drawTile(ctx, 'farm', p.w ? 1 : 0, x, y);
      if (p.st === 0) continue;
      const crop = DC.CROP[p.c];
      const tile = crop.stages[p.st === 2 ? 2 : p.stage];
      if (crop.tree && !p.weed) { drawTree(crop, p, i, x, y); continue; }
      if (p.weed) {
        DC.drawTile(ctx, 'farm', tile, x, y - 2);
        DC.drawTile(ctx, 'town', 17, x + Math.round(Math.sin(t * 2 + i)), y + 1);
        ctx.fillStyle = '#d9534f';
        ctx.fillRect(x + 12, y - 3 + Math.round(Math.sin(t * 4 + i)), 3, 3);
        continue;
      }
      let dy = 0;
      if (p.st === 2) dy = Math.round(Math.sin(t * 3 + i) * 0.6);
      DC.drawTile(ctx, 'farm', tile, x, y - 2 + dy);
      if (p.st === 2 && p.g) {
        // éclats dorés
        const k = (t * 2 + i * 0.37) % 1;
        ctx.fillStyle = '#fff6a8';
        ctx.fillRect(x + 3 + Math.round(k * 10), y + 1 + Math.round((1 - k) * 8), 1, 1);
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(x + 12 - Math.round(k * 8), y + 4 + Math.round(k * 6), 2, 2);
        ctx.strokeStyle = 'rgba(255,211,77,0.9)';
        ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
      }
      // indicateurs : soif / prêt
      if (p.st === 1 && !p.w) {
        ctx.fillStyle = '#4fa4e0';
        const by = y - 3 + Math.round(Math.sin(t * 4 + i));
        ctx.fillRect(x + 12, by, 3, 3); ctx.fillRect(x + 13, by - 1, 1, 1);
      }
      if (p.st === 1 && p.w) {
        // barre de progression fine
        const prog = (p.stage + p.p) / 2;
        ctx.fillStyle = 'rgba(46,34,48,.55)'; ctx.fillRect(x + 2, y + 14, 12, 2);
        ctx.fillStyle = '#9fe36a'; ctx.fillRect(x + 2, y + 14, Math.max(1, Math.round(12 * prog)), 2);
      }
    }
    // zone suivante : terrain en friche
    const owned = G.zonePlots();
    const zEnd = Math.min(DC.PLOT_MAX, owned + DC.ZONE_SIZE);
    if (G.nextZone()) {
      for (let i = Math.max(owned, s.plots.length); i < zEnd; i++) {
        const pos = L.plot(i);
        const x = pos.x * 16, y = pos.y * 16;
        DC.drawTile(ctx, 'town', hash(pos.x, pos.y) < 0.5 ? 0 : 1, x, y);
        const h = hash(pos.x * 3, pos.y * 7);
        if (h < 0.3) DC.drawTile(ctx, 'farm', 89, x, y);
        else if (h < 0.55) DC.drawTile(ctx, 'farm', 77, x, y);
        else if (h < 0.75) DC.drawTile(ctx, 'farm', 26, x, y);
        else if (h < 0.85) DC.drawTile(ctx, 'farm', 52, x, y);
      }
      // panneau "à vendre"
      const pos = L.plot(Math.max(owned, s.plots.length));
      const ok = G.zoneState() === 'ok';
      DC.drawTile(ctx, 'town', 83, pos.x * 16, pos.y * 16 - 3 + (ok ? Math.round(Math.sin(t * 3)) : 0));
      ctx.fillStyle = ok ? (G.canAfford(G.nextZone().cost) ? '#8fe04f' : '#ffd34d') : '#d9534f';
      ctx.fillRect(pos.x * 16 + 11, pos.y * 16 - 4, 4, 4);
      ctx.fillStyle = '#2e2230';
      ctx.fillRect(pos.x * 16 + 12, pos.y * 16 - 3, 2, 2);
    }
    // parcelle à acheter
    if (s.plots.length < G.maxPlots()) {
      const pos = L.plot(s.plots.length);
      const x = pos.x * 16, y = pos.y * 16;
      const afford = G.canAfford(G.plotCost());
      ctx.globalAlpha = afford ? 0.55 + 0.25 * Math.sin(t * 3) : 0.35;
      DC.drawTile(ctx, 'farm', 0, x, y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = afford ? '#fff' : '#d8c7b0';
      ctx.fillRect(x + 7, y + 4, 2, 8); ctx.fillRect(x + 4, y + 7, 8, 2);
    }
  }

  function drawPads(L) {
    const n = G.chargeSlots();
    for (let i = 0; i < Math.min(n, 6); i++) {
      const p = L.chargeSpot(i);
      const x = Math.round(p.x * 16) - 6, y = Math.round(p.y * 16) - 3;
      const busy = G.s.bots.some(b => b.slot === i && b.state === 'charging');
      ctx.fillStyle = '#2e2230'; ctx.fillRect(x - 1, y - 1, 14, 7);
      ctx.fillStyle = '#7d8794'; ctx.fillRect(x, y, 12, 5);
      ctx.fillStyle = '#a9b3bf'; ctx.fillRect(x, y, 12, 1);
      const on = busy && Math.floor(R.time * 3) % 2;
      const cut = G.outage();
      ctx.fillStyle = cut ? (Math.floor(R.time * 2) % 2 ? '#e0602e' : '#4a525c') : busy ? (on ? '#fff38a' : '#ffd34d') : '#4a525c';
      ctx.fillRect(x + 5, y + 1, 2, 1); ctx.fillRect(x + 4, y + 2, 3, 1); ctx.fillRect(x + 5, y + 3, 2, 1);
    }
  }

  function drawBattery(x, y, r, charging) {
    ctx.fillStyle = '#2e2230'; ctx.fillRect(x - 1, y - 1, 10, 4);
    ctx.fillRect(x + 9, y, 1, 2);
    ctx.fillStyle = '#3c3a33'; ctx.fillRect(x, y, 8, 2);
    ctx.fillStyle = charging ? '#8fe04f' : r < 0.25 ? '#e0602e' : r < 0.5 ? '#ffd34d' : '#8fe04f';
    ctx.fillRect(x, y, Math.max(1, Math.round(8 * r)), 2);
  }

  function drawShadow(x, y, w) {
    ctx.fillStyle = 'rgba(30,40,20,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawBroken(b) {
    const spr = DC.BOT_SPRITES[b.type];
    const gx = px(b.x), gy = px(b.y);
    drawShadow(gx, gy, 6);
    const shake = Math.floor(R.time * 10 + b.id) % 7 === 0 ? 1 : 0;
    ctx.save();
    ctx.translate(gx + shake, gy - 1);
    ctx.rotate(0.35 * (b.face || 1));
    ctx.drawImage(spr.sleep, -8, -16);
    ctx.restore();
    // fumée
    for (let k = 0; k < 3; k++) {
      const t = (R.time * 0.7 + k / 3 + b.id * 0.17) % 1;
      ctx.fillStyle = `rgba(90,90,100,${0.55 * (1 - t)})`;
      const sz = 2 + Math.round(t * 3);
      ctx.fillRect(gx + 2 + Math.round(Math.sin(t * 6 + k) * 2 + t * 4), gy - 16 - Math.round(t * 12), sz, sz);
    }
    // clé à molette clignotante
    const y = gy - 30 + Math.round(Math.sin(R.time * 4) * 1.5);
    ctx.fillStyle = '#2e2230'; ctx.fillRect(gx - 6, y - 1, 12, 12);
    ctx.fillStyle = Math.floor(R.time * 3) % 2 ? '#ffd34d' : '#ffb03a'; ctx.fillRect(gx - 5, y, 10, 10);
    ctx.fillStyle = '#2e2230';
    ctx.fillRect(gx - 1, y + 2, 2, 4); ctx.fillRect(gx - 1, y + 7, 2, 2);
    // retour automatique
    const r = 1 - b.timer / G.selfRepair();
    ctx.fillStyle = '#2e2230'; ctx.fillRect(gx - 6, y + 12, 12, 3);
    ctx.fillStyle = '#9be26a'; ctx.fillRect(gx - 5, y + 13, Math.max(1, Math.round(10 * r)), 1);
    if (R.hover && R.hover.bot === b) label(gx, y - 2, b.name + ' est en panne · touchez pour réparer');
  }

  function drawCrow(c) {
    const pos = G.L.plot(c.plot);
    const gx = pos.x * 16 + 8, gy = pos.y * 16 + 9;
    const peck = Math.floor(R.time * 3 + c.plot) % 3 === 0 ? 2 : 0;
    const f = (R.time * 2 + c.plot) % 4 < 2 ? 1 : -1;
    ctx.save(); ctx.translate(gx, gy); ctx.scale(f, 1);
    ctx.fillStyle = 'rgba(30,40,20,0.3)'; ctx.fillRect(-4, 4, 9, 2);
    ctx.fillStyle = '#1f1c26';
    ctx.fillRect(-4, -3, 7, 5);           // corps
    ctx.fillRect(-6, -2, 3, 2);           // queue
    ctx.fillRect(2, -6 + peck, 4, 4);     // tête
    ctx.fillStyle = '#3a3550'; ctx.fillRect(-2, -2, 4, 2);
    ctx.fillStyle = '#ffb03a'; ctx.fillRect(6, -4 + peck, 2, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(4, -5 + peck, 1, 1);
    ctx.fillStyle = '#e8892f'; ctx.fillRect(-2, 2, 1, 2); ctx.fillRect(1, 2, 1, 2);
    ctx.restore();
    // temps restant avant que la culture soit mangée
    const r = Math.max(0, c.t / DC.CROW_EAT);
    ctx.fillStyle = '#2e2230'; ctx.fillRect(pos.x * 16 + 2, pos.y * 16 - 3, 12, 3);
    ctx.fillStyle = r < 0.35 ? '#e0602e' : '#ffd34d'; ctx.fillRect(pos.x * 16 + 3, pos.y * 16 - 2, Math.max(1, Math.round(10 * r)), 1);
    if (R.hover && R.hover.crow) label(gx, pos.y * 16 - 4, 'Un corbeau ! Touchez-le pour le chasser');
  }

  function drawBot(b) {
    if (b.state === 'servicing') return;
    if (b.state === 'broken') return drawBroken(b);
    const spr = DC.BOT_SPRITES[b.type];
    const resting = b.state === 'queue' || b.state === 'charging' || b.bat <= 0;
    const stalled = (b.state === 'charging' && (G.s.energy <= 0.01 || G.outage())) || b.state === 'queue' || b.bat <= 0;
    const hover = resting ? 1 : 3 + Math.sin(b.bob) * 1.2;
    const gx = px(b.x), gy = px(b.y);
    drawShadow(gx, gy, resting ? 6 : 5);
    let img = spr.idle;
    if (stalled) img = spr.sleep;
    else if (b.happy > 0) img = spr.happy;
    else if (b.blink < 0) img = spr.blink;
    const x = gx - 8, y = Math.round(gy - 18 - hover);
    // flamme du réacteur
    if (!resting) {
      const f = (R.time * 12 + b.id) % 2 < 1;
      ctx.fillStyle = f ? '#ffd36b' : '#ff9a3c';
      ctx.fillRect(gx - 2, y + 16, 4, f ? 2 : 1);
    }
    if (b.face < 0) { ctx.save(); ctx.translate(x + 16, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
    else ctx.drawImage(img, x, y);
    if (b.tuned > 0 && Math.random() < 0.08) R.burst(b.x - b.face * 0.4, b.y - 0.4, '#ffd34d', 1);
    // outil pendant le travail
    if (b.state === 'work') {
      const t = DC.BOT[b.type].jobs.length > 1 || b.type === 'repar' ? ({ water: 84, plant: 9, harvest: 88, repair: 86, crow: 87 })[b.job] : DC.BOT[b.type].tool;
      const wob = Math.sin(R.time * 14) * 1.5;
      ctx.save();
      ctx.translate(gx + b.face * 9, y + 8);
      ctx.rotate((b.job === 'water' ? 0.5 : 0.2 * wob) * b.face);
      DC.drawTile(ctx, 'farm', t, -8, -8, b.face < 0);
      ctx.restore();
      if (b.job === 'water' && Math.random() < 0.3) R.burst(b.x + b.face * 0.7, b.y - 0.3, '#7cc6ff', 1, 'drop');
    }
    // batterie : visible quand elle baisse ou pendant la charge
    const r = b.bat / G.batMax();
    if (b.state === 'charging' || r < 0.5 || (R.hover && R.hover.bot === b)) {
      drawBattery(gx - 4, y - 4, r, b.state === 'charging' && !stalled);
      if (b.state === 'charging' && !stalled && Math.floor(R.time * 4) % 2) {
        ctx.fillStyle = '#fff38a'; ctx.fillRect(gx + 7, y - 5, 1, 3); ctx.fillRect(gx + 6, y - 3, 2, 1);
      }
    }
    if (stalled) {
      const k = (R.time * 0.8 + b.id * 0.3) % 1;
      ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
      ctx.font = '800 7px Nunito, sans-serif';
      ctx.fillText('z', gx + 5 + k * 4, y - k * 8);
    }
    if (R.hover && R.hover.bot === b) {
      label(gx, y - 7, b.name + ' · niv. ' + b.lvl + ' · 🔋' + Math.round(r * 100) + '%');
    }
  }

  function drawAnimal(a) {
    const d = DC.DEC[a.id];
    const gx = px(a.x), gy = px(a.y);
    drawShadow(gx, gy, 5);
    const hop = a.hop > 0 ? Math.round(Math.abs(Math.sin(a.hop * 10)) * 2) : 0;
    DC.drawTile(ctx, d.sheet, d.tile, gx - 8, gy - 15 - hop, a.face < 0);
    if (a.heart > 0) {
      ctx.fillStyle = '#ff6b8a';
      const hy = gy - 20 - (1 - a.heart) * 8;
      ctx.fillRect(gx - 2, hy, 2, 2); ctx.fillRect(gx + 1, hy, 2, 2); ctx.fillRect(gx - 2, hy + 1, 5, 2); ctx.fillRect(gx - 1, hy + 3, 3, 1); ctx.fillRect(gx, hy + 4, 1, 1);
    }
  }

  function label(cx, by, text) {
    const fs = R.fontSize();
    ctx.font = '700 ' + fs + 'px Nunito, sans-serif';
    const w = Math.ceil(ctx.measureText(text).width) + 6;
    const bh = Math.ceil(fs * 1.35);
    const x = Math.round(Math.max(1, Math.min(G.L.Tw * 16 - w - 1, cx - w / 2))), y = Math.round(Math.max(1, by - bh));
    ctx.fillStyle = 'rgba(46,34,48,.88)'; ctx.fillRect(x, y, w, bh);
    ctx.fillStyle = '#fff3dc'; ctx.fillText(text, x + 3, y + fs * 1.05);
  }

  function updateAnimals(dt, L) {
    for (const a of R.animals) {
      if (a.heart > 0) a.heart -= dt;
      if (a.hop > 0) a.hop -= dt;
      a.pause -= dt;
      if (a.pause > 0) continue;
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d < 0.05) {
        a.pause = 2 + Math.random() * 6;
        const r = 1.8;
        let tx = a.x + (Math.random() - 0.5) * r * 2, ty = a.y + (Math.random() - 0.5) * r;
        tx = Math.max(L.bounds.x0, Math.min(L.bounds.x1, tx));
        ty = Math.max(L.bounds.y0 + 0.3, Math.min(L.bounds.y1, ty));
        if (!L.occ.has(Math.floor(tx) + ',' + Math.floor(ty))) { a.tx = tx; a.ty = ty; }
      } else {
        const sp = 0.6 * dt;
        if (Math.abs(dx) > 0.02) a.face = dx > 0 ? -1 : 1;
        a.x += dx / d * Math.min(sp, d); a.y += dy / d * Math.min(sp, d);
      }
    }
  }

  function drawWeatherAndNight(L, dt) {
    const W = L.Tw * 16, H = L.Th * 16;
    // Vallée : lumière d'automne sur toute la scène
    if (G.inVallee()) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#f5d2a0';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // nuages
    if (G.s.weather.type !== 'sun') {
      ctx.fillStyle = G.storm() ? 'rgba(30,30,60,0.38)' : G.raining() ? 'rgba(40,50,80,0.22)' : 'rgba(40,50,80,0.08)';
      ctx.fillRect(0, 0, W, H);
    }
    // éclairs
    if (G.storm()) {
      R.flash = (R.flash || 0) - dt;
      if (R.flash < -2 && Math.random() < dt * 0.4) { R.flash = 0.25; if (DC.audio && !G.fast) DC.audio.play('chop', 0.25); }
      if (R.flash > 0) { ctx.fillStyle = `rgba(255,255,240,${0.5 * R.flash / 0.25})`; ctx.fillRect(0, 0, W, H); }
    }
    // nuit (heure réelle)
    if (R.night > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(${Math.round(255 - 170 * R.night)},${Math.round(255 - 150 * R.night)},${Math.round(255 - 60 * R.night)},1)`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // lueurs des robots
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of G.s.bots) {
        if (b.state === 'queue' || b.state === 'charging' || b.state === 'servicing') continue;
        const gx = px(b.x), gy = px(b.y) - 12;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 14);
        g.addColorStop(0, `rgba(140,230,255,${0.22 * R.night})`); g.addColorStop(1, 'rgba(140,230,255,0)');
        ctx.fillStyle = g; ctx.fillRect(gx - 14, gy - 14, 28, 28);
      }
      // lucioles
      for (let i = 0; i < 10; i++) {
        const fx = (hash(i, 7) * W + Math.sin(R.time * 0.4 + i) * 20) % W;
        const fy = (L.top * 16 + hash(i, 3) * (H - L.top * 16) + Math.cos(R.time * 0.5 + i * 2) * 10);
        const a = (Math.sin(R.time * 2 + i * 1.7) + 1) / 2 * R.night;
        ctx.fillStyle = `rgba(230,255,140,${a})`; ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
      }
      ctx.restore();
    }
    // pluie
    if (G.raining()) {
      const target = Math.floor(W * H / 900);
      while (R.rain.length < target) R.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 90 + Math.random() * 60 });
      ctx.fillStyle = 'rgba(180,210,255,0.55)';
      for (const d of R.rain) {
        d.y += d.s * dt; d.x -= d.s * 0.25 * dt;
        if (d.y > H) { d.y = -4; d.x = Math.random() * W * 1.2; }
        ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 4);
      }
    } else if (R.rain.length) R.rain.length = 0;
  }

  function computeNight() {
    if (!G.s.opts.daynight) return 0;
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    // 0 en journée, 1 en pleine nuit ; transitions 19h-21h30 et 5h30-7h30
    if (h >= 21.5 || h < 5.5) return 1;
    if (h >= 19) return (h - 19) / 2.5;
    if (h < 7.5) return 1 - (h - 5.5) / 2;
    return 0;
  }

  R.draw = function (dt) {
    const L = G.L;
    if (!L) return;
    R.time += dt;
    if (Math.floor(R.time * 2) !== Math.floor((R.time - dt) * 2)) R.night = computeNight() * 0.85;
    if (R.night == null) R.night = computeNight() * 0.85;

    const scale = R.zoom * R.dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    drawGround(L);
    drawBuildings(L);
    drawPads(L);
    drawPlots(L);

    // entités triées par profondeur
    updateAnimals(dt, L);
    const list = [];
    const decor = R.decorList();
    decor.forEach((id, k) => {
      const d = DC.DEC[id];
      if (!d || d.animal) return;
      const t = L.decorTiles[k % Math.max(1, L.decorTiles.length)];
      if (!t) return;
      const tile = Array.isArray(d.tile) ? d.tile[k % d.tile.length] : d.tile;
      list.push({ y: t.y + 1, draw: () => DC.drawTile(ctx, d.sheet, tile, t.x * 16, t.y * 16) });
    });
    for (const a of R.animals) list.push({ y: a.y, draw: () => drawAnimal(a) });
    for (const b of G.s.bots) list.push({ y: b.y, draw: () => drawBot(b) });
    const crow = G.crows[G.s.cur];
    if (crow && G.s.plots[crow.plot]) list.push({ y: L.plot(crow.plot).y + 0.7, draw: () => drawCrow(crow) });
    if (G.gift) {
      const g = G.gift;
      list.push({
        y: g.y + 1, draw: () => {
          const bounce = Math.round(Math.abs(Math.sin(R.time * 4)) * 3);
          drawShadow(g.x * 16 + 8, g.y * 16 + 15, 6);
          DC.drawTile(ctx, 'farm', g.kind === 'energy' ? 85 : 74, g.x * 16, g.y * 16 - bounce, false);
          ctx.fillStyle = g.kind === 'energy' ? '#8fe04f' : '#ffd34d';
          ctx.fillRect(g.x * 16 + 7, g.y * 16 - 6 - bounce, 2, 3);
          ctx.fillRect(g.x * 16 + 7, g.y * 16 - 2 - bounce, 2, 1);
          if (g.t < 10 && Math.floor(R.time * 4) % 2) { ctx.globalAlpha = 0.4; DC.drawTile(ctx, 'farm', 74, g.x * 16, g.y * 16 - bounce); ctx.globalAlpha = 1; }
        },
      });
    }
    drawAutumn(L, list);
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.draw();
    drawLeaves(L, dt);

    // particules
    for (let i = R.fx.length - 1; i >= 0; i--) {
      const f = R.fx[i];
      f.t += dt;
      if (f.t > f.life) { R.fx.splice(i, 1); continue; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 6 * dt;
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.fillStyle = f.color;
      ctx.fillRect(px(f.x), px(f.y) - 6, f.kind === 'drop' ? 1 : 2, f.kind === 'drop' ? 2 : 2);
    }
    ctx.globalAlpha = 1;

    drawWeatherAndNight(L, dt);

    // survol d'une parcelle
    if (R.hover && R.hover.plot != null) {
      const p = G.s.plots[R.hover.plot], pos = L.plot(R.hover.plot);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
      ctx.strokeRect(pos.x * 16 + 0.5, pos.y * 16 + 0.5, 15, 15);
      const c = DC.CROP[p.c];
      let txt = c.name;
      if (p.weed) txt += ' · mauvaises herbes !';
      else if (p.st === 1 && c.tree && p.stage === 1) txt += ' · fruits ' + Math.floor(p.p * 100) + '%';
      else if (p.st === 1) txt += ' ' + Math.floor((p.stage + p.p) / 2 * 100) + '%' + (p.w ? '' : ' · soif');
      else if (p.st === 2) txt += ' · prêt' + (p.g ? ' ★' : '');
      else txt += ' · à semer';
      label(pos.x * 16 + 8, pos.y * 16 - 1, txt);
    } else if (R.hover && R.hover.zone) {
      const z = G.nextZone();
      const pos = L.plot(Math.max(G.zonePlots(), G.s.plots.length));
      const txt = G.zoneState() === 'lvl' ? `Zone ${G.s.zones + 1} · palier ${z.lvl} requis` : `Zone ${G.s.zones + 1} : ${DC.fmt(z.cost)} pièces`;
      label(pos.x * 16 + 8, pos.y * 16 - 3, txt);
    } else if (R.hover && R.hover.ghost) {
      const pos = L.plot(G.s.plots.length);
      label(pos.x * 16 + 8, pos.y * 16 - 1, 'Parcelle : ' + DC.fmt(G.plotCost()) + ' pièces');
    }

    // textes flottants
    ctx.font = '800 ' + R.fontSize() + 'px Nunito, sans-serif';
    for (let i = R.floats.length - 1; i >= 0; i--) {
      const f = R.floats[i];
      f.t += dt;
      if (f.t > 1.4) { R.floats.splice(i, 1); continue; }
      const x = px(f.x), y = px(f.y) - 10 - f.t * 14;
      ctx.globalAlpha = f.t > 1 ? (1.4 - f.t) / 0.4 : 1;
      const w = ctx.measureText(f.text).width;
      ctx.fillStyle = '#2e2230';
      ctx.fillText(f.text, Math.round(x - w / 2) + 1, Math.round(y) + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, Math.round(x - w / 2), Math.round(y));
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------- Interaction ---------------- */
  R.pick = function (cssX, cssY) {
    const L = G.L;
    if (!L) return null;
    const wx = cssX / (16 * R.zoom), wy = cssY / (16 * R.zoom);
    const tx = Math.floor(wx), ty = Math.floor(wy);
    if (G.gift && tx === G.gift.x && (ty === G.gift.y || ty === G.gift.y - 1)) return { gift: true };
    const crow = G.crows[G.s.cur];
    if (crow) { const p = L.plot(crow.plot); if (Math.abs(p.x + 0.5 - wx) < 0.9 && Math.abs(p.y + 0.5 - wy) < 0.9) return { crow: true }; }
    for (const b of G.s.bots) if (b.state === 'broken' && Math.abs(b.x - wx) < 0.8 && wy > b.y - 2.2 && wy < b.y + 0.4) return { bot: b };
    for (let i = 0; i < G.s.plots.length; i++) {
      const p = L.plot(i);
      if (p.x === tx && p.y === ty) return { plot: i };
    }
    if (G.s.plots.length < G.maxPlots()) {
      const p = L.plot(G.s.plots.length);
      if (p.x === tx && p.y === ty) return { ghost: true };
    }
    if (G.nextZone()) {
      const zEnd = Math.min(DC.PLOT_MAX, G.zonePlots() + DC.ZONE_SIZE);
      for (let i = Math.max(G.zonePlots(), G.s.plots.length); i < zEnd; i++) {
        const p = L.plot(i);
        if (p.x === tx && p.y === ty) return { zone: true };
      }
    }
    let best = null, bd = 0.7;
    for (const b of G.s.bots) {
      if (b.state === 'servicing') continue;
      const d = Math.hypot(b.x - wx, b.y - 0.7 - wy);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return { bot: best };
    for (const a of R.animals) {
      if (Math.hypot(a.x - wx, a.y - 0.5 - wy) < 0.7) return { animal: a };
    }
    for (const b of L.buildings) {
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return { building: b.kind };
    }
    return null;
  };
})();
