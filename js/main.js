/* DeskCosy — démarrage, boucle, entrées, sauvegarde */
(function () {
  const G = DC.game, R = DC.render, UI = DC.ui, A = DC.audio;
  const $ = id => document.getElementById(id);
  const M = DC.main = {};
  const canvas = $('world');
  const isDesktop = /[?&]desktop=1/.test(location.search);
  if (isDesktop) document.body.classList.add('desktop');

  /* ---------- Sauvegarde ---------- */
  /* Ferme de démonstration (?demo=1) — non sauvegardée */
  function demoState() {
    const s = G.s;
    s.coins = 4321; s.energy = 140;
    s.upg = { reservoir: 3, engrais: 2, marche: 2 };
    ['navet', 'ble', 'laitue', 'mais', 'tomate'].forEach(c => s.unlocked[c] = true);
    ['agro1', 'agro2', 'agro3', 'agro4', 'agro6', 'agro8', 'robo1', 'robo2', 'robo3', 'robo5', 'robo8', 'ener1', 'com1'].forEach(id => s.research.done[id] = true);
    s.research.cur = { id: 'agro5', t: 120 };
    s.level = 8; s.xp = 200; s.zones = 4;
    const crops = ['carotte', 'navet', 'ble', 'laitue', 'mais', 'tomate'];
    s.plots = [];
    for (let i = 0; i < 26; i++) {
      const st = i % 5 === 0 ? 2 : (i % 7 === 0 ? 0 : 1);
      s.plots.push({ c: crops[Math.floor(i / 5) % crops.length], st, stage: st === 2 ? 2 : i % 2, p: Math.random(), w: i % 3 !== 0, g: i === 10, res: 0 });
    }
    ['arrose', 'arrose', 'plante', 'cueille', 'cueille', 'arrose', 'plante', 'poly'].forEach((t, k) => s.bots.push(G.makeBot(t, null, 1 + k % 4, 3 + k, 6)));
    s.decor = { panneau: 1, fleurs: 4, arbre: 4, automne: 2, poule: 2, mouton: 1, ruche: 1, buisson: 2, foin: 1, champi: 2 };
    s.quests = { q1: true, q2: true, q3: true, q4: true };
    if (/[?&]demo=2/.test(location.search)) {      // Vallée d'automne
      const vp = [];
      for (let i = 0; i < 20; i++) vp.push({ c: crops[i % 6], st: i % 4 === 0 ? 2 : 1, stage: i % 2, p: Math.random(), w: i % 3 === 0, g: false, weed: i % 5 === 1, res: 0 });
      s.regions.push({ key: 'vallee', plots: vp, bots: [], zones: 3 });
      s.view = 1; s.cur = 1;
      ['arrose', 'plante', 'cueille', 'poly', 'arrose'].forEach((t, k) => s.bots.push(G.makeBot(t, null, 2, 3 + k, 6)));
      s.bots[0].bat = 2; s.bots[1].bat = 5;
      s.cur = 0;
      s.level = 27; s.xp = 0;
    }
  }

  M.save = function () {
    if (!G.s || M.noSave) return;
    const json = G.serialize();
    try { localStorage.setItem(DC.SAVE_KEY, json); } catch (e) { /* stockage indisponible */ }
    if (DC.desk.ok) DC.desk.call('save', json);
  };

  function waitDesk(ms) {
    return new Promise(res => {
      const t0 = Date.now();
      (function poll() {
        if (DC.desk.ok) return res(true);
        if (Date.now() - t0 > ms) return res(false);
        setTimeout(poll, 100);
      })();
    });
  }

  async function loadSave() {
    let json = null;
    if (isDesktop && await waitDesk(4000)) json = await DC.desk.call('load');
    if (!json) { try { json = localStorage.getItem(DC.SAVE_KEY); } catch (e) { /* rien */ } }
    if (/[?&]demo=[12]/.test(location.search)) { json = null; M.noSave = true; }
    G.load(json);
    if (M.noSave) demoState();
    return !!json || M.noSave;
  }

  /* ---------- Mise en page ---------- */
  /* Fenêtre de bureau : position, premier plan, espace réservé */
  M.applyDesk = function () {
    const o = G.s.opts;
    document.body.classList.toggle('free', o.dock === 'free');
    if (DC.desk.ok) DC.desk.call('apply', o.dock, o.dockSize, o.onTop, o.reserve, o.dock === 'free' ? (o.freeRect || null) : null);
  };

  /* Déplacer / redimensionner la fenêtre de bureau à la souris */
  function windowDrag(el, kind) {
    let d = null, pending = null, raf = 0;
    const send = () => { raf = 0; if (pending) { DC.desk.call('set_rect', ...pending); d.last = pending; pending = null; } };
    el.addEventListener('pointerdown', async e => {
      if (!DC.desk.ok || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointeur synthétique */ }
      const o = G.s.opts;
      d = { sx: e.screenX, sy: e.screenY, r: null };
      const k = window.devicePixelRatio || 1;
      if (o.dock !== 'free') {          // décrocher la bande : elle devient une fenêtre libre
        o.dock = 'free';
        document.body.classList.add('free');
        await DC.desk.call('undock');
        const cur = await DC.desk.call('win_rect');
        const fw = o.freeRect ? o.freeRect[2] : Math.min(cur[2] - cur[0], Math.round(1000 * k));
        const fh = o.freeRect ? o.freeRect[3] : Math.max(Math.min(cur[3] - cur[1], Math.round(620 * k)), Math.round(320 * k));
        // la poignée reste sous le curseur
        const nx = Math.round(e.screenX * k - e.clientX * k), ny = Math.round(e.screenY * k - e.clientY * k);
        await DC.desk.call('set_rect', nx, ny, fw, fh);
        if (d) d.r = [nx, ny, nx + fw, ny + fh];
        return;
      }
      const r = await DC.desk.call('win_rect');
      if (d && r) d.r = r;
    });
    el.addEventListener('pointermove', e => {
      if (!d || !d.r) return;
      const k = window.devicePixelRatio || 1;
      const dx = (e.screenX - d.sx) * k, dy = (e.screenY - d.sy) * k;
      const [l, t, r, b] = d.r;
      pending = kind === 'move' ? [l + dx, t + dy, r - l, b - t] : [l, t, Math.max(240, r - l + dx), Math.max(140, b - t + dy)];
      if (!raf) raf = requestAnimationFrame(send);
    });
    const end = () => {
      if (!d) return;
      if (pending) send();
      if (d.last) { G.s.opts.freeRect = d.last.map(Math.round); M.save(); }
      d = null;
      if (UI.panel === 'opts') UI.renderPanel();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  windowDrag($('dragHandle'), 'move');
  windowDrag($('resizeGrip'), 'size');

  M.relayout = function () {
    const w = window.innerWidth, h = window.innerHeight;
    R.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * R.dpr);
    canvas.height = Math.round(h * R.dpr);
    UI.layoutHUD();
    const hud = Math.ceil($('hud').getBoundingClientRect().height) || 38;
    R.layout(w, h, hud);
    if (DC.tuto && G.s) DC.tuto.update();
  };
  M.zoomBy = function (d) {
    const o = G.s.opts;
    const z = Math.max(-3, Math.min(4, (o.zoom || 0) + d));
    if (z === o.zoom) return false;
    o.zoom = z;
    M.relayout();
    return true;
  };
  let wheelT = 0;
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const now = performance.now();
    if (now - wheelT < 120) return;
    wheelT = now;
    if (M.zoomBy(e.deltaY < 0 ? 1 : -1)) A.play('click', 0.3);
  }, { passive: false });

  let rsT = 0;
  window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(M.relayout, 80); });

  /* ---------- Événements de jeu → effets ---------- */
  function plotCenter(i) { const p = G.L.plot(i); return { x: p.x + 0.5, y: p.y + 0.6 }; }

  G.on('harvest', e => {
    if (G.fast) return;
    const c = plotCenter(e.i);
    if (e.coins >= 0.5) R.float(c.x, c.y, '+' + DC.fmt(Math.max(1, e.coins)), '#ffd34d');
    if (e.energy >= 0.5) R.float(c.x + 0.45, c.y + 0.35, '+' + Math.round(e.energy) + '⚡', '#b6f57c');
    R.burst(c.x, c.y, e.golden ? '#ffd34d' : '#9be26a', e.golden ? 16 : 5);
    A.play('harvest', e.who ? 0.35 : 0.8, 70);
    if (e.coins >= 0.5) A.play(e.golden ? 'coins2' : 'coins', e.who ? 0.18 : 0.4, 140);
    if (e.golden) UI.toast(`★ Récolte dorée ! ${DC.icon('farm', e.crop.item, 20)} ×${e.qty}`, 'gold');
  });
  G.on('plant', e => {
    if (G.fast) return;
    const c = plotCenter(e.i);
    R.burst(c.x, c.y, '#a8774a', 4);
    A.play('plant', e.who ? 0.3 : 0.7, 80);
  });
  G.on('water', e => {
    if (G.fast) return;
    const c = plotCenter(e.i);
    R.burst(c.x, c.y - 0.2, '#7cc6ff', 6, 'drop');
    A.play('water', e.who ? 0.18 : 0.5, 120);
  });
  G.on('quest', q => {
    if (G.fast) return;
    UI.toast(`🎯 Objectif accompli : ${q.text} <b>+${DC.fmt(q.reward)}</b>`, 'gold');
    A.play('quest', 0.7);
    if (UI.panel !== 'farm') $('questDot').classList.add('on');
    if (q.unlocks === 'poly') UI.toast(`${DC.botIcon('poly', 18)} Le Polybot est disponible !`, 'gold');
  });
  G.on('botBought', b => {
    if (G.fast) return;
    R.burst(b.x, b.y - 0.5, '#ffffff', 10);
    A.play('bot', 0.7);
  });
  G.on('plotBought', () => { M.relayout(); });
  G.on('regionSwitch', () => { M.relayout(); if (UI.panel) UI.renderPanel(); });
  G.on('regionUnlocked', def => {
    M.relayout();
    if (G.fast) return;
    A.play('levelup', 0.9);
    UI.close();
    UI.info(`${def.icon} ${def.name}`, `<div class="hint" style="font-size:14px">Une nouvelle ferme s’ouvre ! Elle tourne en même temps que la Prairie : passez de l’une à l’autre avec le bouton ${def.icon} en haut.</div>
      <div class="card"><div class="info"><div class="desc">${def.desc}</div></div></div>
      <div class="card"><div class="info"><div class="desc">Les <b>paliers 26 à 40</b> et la branche de recherche <b>Vallée d’automne</b> sont débloqués. Les robots de chaque région sont séparés : recrutez une nouvelle équipe !</div></div></div>`);
  });
  G.on('weed', e => { if (!G.fast && !e.who) { const c = plotCenter(e.i); R.burst(c.x, c.y, '#6aa84f', 6); A.play('chop', 0.5); } });
  G.on('zoneBought', () => { M.relayout(); if (!G.fast) A.play('levelup', 0.6); });
  G.on('levelup', L => {
    if (G.fast) return;
    const perks = G.levelPerks(L);
    UI.toast(`⭐ Palier ${L} atteint !${perks.length ? ' ' + perks.join(' · ') : ''}`, 'gold');
    A.play('levelup', 0.8);
    if (UI.panel) UI.renderPanel();
  });
  G.on('research', r => {
    if (['robo3', 'robo7'].includes(r.id)) M.relayout();
    if (G.fast) return;
    UI.toast(`🔬 Recherche terminée : <b>${r.name}</b> — ${r.desc}`, 'gold');
    A.play('quest', 0.7);
    if (UI.panel) UI.renderPanel();
  });
  G.on('decorBought', () => { R.placeAnimals(); });
  G.on('rain', () => { if (!G.fast) UI.toast('🌧 Il pleut : tout s’arrose tout seul !'); });
  G.on('gift', g => { if (!G.fast) { A.play('latch', 0.5); } });

  /* ---------- Entrées ---------- */
  let down = null, longT = 0;
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  function assignAt(p) {
    const hit = R.pick(p.x, p.y);
    if (!hit || hit.plot == null) return false;
    const crop = DC.CROP[G.s.seed];
    G.assignPlot(hit.plot, crop.id);
    if (G.s.plots[hit.plot].st === 0) G.plant(hit.plot, crop.id, null);
    const c = plotCenter(hit.plot);
    R.float(c.x, c.y, '→ ' + crop.name, '#ffffff');
    A.play('select', 0.6);
    return true;
  }

  function tap(p) {
    const hit = R.pick(p.x, p.y);
    UI.hideSeedPicker();
    if (!hit) return;
    if (hit.gift) {
      const r = G.openGift();
      if (r) {
        R.burst(r.x + 0.5, r.y + 0.6, r.kind === 'energy' ? '#b6f57c' : '#ffd34d', 18);
        R.float(r.x + 0.5, r.y + 0.4, r.kind === 'energy' ? 'Énergie pleine !' : '+' + DC.fmt(r.amount), r.kind === 'energy' ? '#b6f57c' : '#ffd34d');
        A.play('coins2', 0.8);
        UI.toast(r.kind === 'energy' ? '🎁 Cadeau : batterie pleine !' : `🎁 Cadeau : +${DC.fmt(r.amount)} pièces`, 'gold');
      }
    } else if (hit.plot != null) {
      const res = G.tapPlot(hit.plot);
      if (res === 'busy') {
        const p2 = G.s.plots[hit.plot];
        A.play('click', 0.25, 100);
        if (p2.st === 1) { const c = plotCenter(hit.plot); R.float(c.x, c.y, Math.floor((p2.stage + p2.p) / 2 * 100) + '%', '#ffffff'); }
      } else if (res === 'swap') A.play('select', 0.5);
    } else if (hit.ghost) {
      if (G.buyPlot()) { A.play('buy', 0.7); }
      else { A.play('error', 0.5); UI.toast(`Il faut ${DC.fmt(G.plotCost())} pièces pour cette parcelle`); }
    } else if (hit.bot) {
      const b = hit.bot;
      b.happy = 1.2;
      R.float(b.x, b.y - 1.2, b.name + ' ♥', '#ffffff');
      A.play('bot', 0.5);
    } else if (hit.animal) {
      hit.animal.heart = 1; hit.animal.hop = 0.6;
      A.play('step', 0.6);
    } else if (hit.building) {
      A.play('click', 0.5);
      if (hit.building === 'barn') UI.open('bots');
      else if (hit.building === 'compost') UI.open('farm', 'farm');
      else UI.open('shop', 'cultures');
    }
  }

  canvas.addEventListener('pointerdown', e => {
    A.unlock();
    if (e.button === 2) return;
    down = { ...pos(e), id: e.pointerId, moved: false, long: false };
    clearTimeout(longT);
    longT = setTimeout(() => { if (down && !down.moved) { down.long = assignAt(down); } }, 520);
  });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e);
    if (down && Math.hypot(p.x - down.x, p.y - down.y) > 10) down.moved = true;
    if (e.pointerType === 'mouse') R.hover = R.pick(p.x, p.y);
    canvas.style.cursor = R.hover ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { R.hover = null; });
  canvas.addEventListener('pointerup', e => {
    clearTimeout(longT);
    if (down && !down.moved && !down.long && e.button !== 2) tap(pos(e));
    down = null;
  });
  canvas.addEventListener('pointercancel', () => { clearTimeout(longT); down = null; });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); assignAt(pos(e)); });
  document.addEventListener('pointerdown', () => A.unlock(), { once: false });

  /* ---------- Boucle ---------- */
  let last = performance.now(), hudT = 0, saveT = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 2) {
      const r = G.catchUp(dt);
      if (r && r.harvests > 0 && dt > 30) UI.toast(`⏳ Pendant ce temps : ${DC.fmt(r.harvests)} récoltes, +${DC.fmt(r.coins)} pièces`);
      dt = 0.016;
    }
    dt = Math.max(0, Math.min(dt, 0.25));
    let rem = dt;
    while (rem > 0) { const d = Math.min(rem, 0.05); G.update(d); rem -= d; }
    R.draw(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.2; UI.updateHUD(); DC.tuto.update(); }
    saveT += dt;
    if (saveT > 15) { saveT = 0; M.save(); }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) M.save(); });
  window.addEventListener('pagehide', M.save);
  window.addEventListener('beforeunload', M.save);

  /* ---------- Démarrage ---------- */
  window.addEventListener('error', e => {
    const m = $('bootMsg'); if (m) m.textContent = 'Erreur : ' + e.message;
    document.body.dataset.error = e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno;
  });

  async function boot() {
    try {
      await DC.loadImages();
    } catch (e) { $('bootMsg').textContent = e.message; return; }
    DC.buildBotSprites();
    R.init(canvas);
    const had = await loadSave();
    A.init(G.s.opts);
    UI.init();
    M.relayout();

    const away = (Date.now() - (G.s.lastSave || Date.now())) / 1000;
    let summary = null;
    if (had && away > 60) summary = G.catchUp(away);
    G.checkQuests();

    M.applyDesk();

    $('boot').classList.add('gone');
    setTimeout(() => $('boot').remove(), 600);

    // tutoriel : nouveaux joueurs uniquement (les anciennes parties le passent)
    if (!G.s.tuto) G.s.tuto = { step: 0, done: had && (G.s.stats.harvests > 0 || M.noSave) };
    const ts = /[?&]tuto=(\d+)/.exec(location.search);
    if (ts) G.s.tuto = { step: +ts[1], done: false, gift: true };
    const tz = /[?&]text=([\d.]+)/.exec(location.search);
    if (tz) { G.s.opts.textSize = +tz[1]; M.relayout(); }
    if (summary && (summary.harvests > 0 || summary.research > 0)) {
      UI.info('Bon retour !', `<div class="hint" style="font-size:14px">Pendant votre absence (${DC.fmtTime(summary.seconds)}), vos robots ont récolté <b>${DC.fmt(summary.harvests)}</b> cultures et gagné <b>${DC.fmt(summary.coins)}</b> pièces.` +
        (summary.levels > 0 ? ` La ferme a gagné <b>${summary.levels}</b> palier(s).` : '') +
        (summary.research > 0 ? ` <b>${summary.research}</b> recherche(s) terminée(s).` : '') + `</div>`);
    }
    const op = /[?&]open=(\w+)(?:\.(\w+))?/.exec(location.search);
    if (op) UI.open(op[1], op[2]);
    M.save();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  boot();
})();
