/* DeskCosy — interface (HUD, panneaux, boutique) */
(function () {
  const G = DC.game, A = DC.audio;
  const $ = id => document.getElementById(id);
  const UI = DC.ui = { panel: null, tab: null, updaters: [] };

  const coinIc = '<span class="ic-coin"></span>';

  /* ---------- Pont bureau (pywebview) ---------- */
  DC.desk = {
    get ok() { return !!(window.pywebview && window.pywebview.api && typeof window.pywebview.api.save === 'function'); },
    call(name, ...args) {
      if (!this.ok || !window.pywebview.api[name]) return Promise.resolve(null);
      return window.pywebview.api[name](...args).catch(e => { console.warn(e); return null; });
    },
  };

  /* ---------- Toasts ---------- */
  UI.toast = function (html, cls) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.innerHTML = html;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3500);
    const all = $('toasts').children;
    if (all.length > 4) all[0].remove();
  };

  /* ---------- HUD ---------- */
  let lastCoins = -1;
  UI.updateHUD = function () {
    const s = G.s;
    const c = Math.floor(s.coins);
    if (c !== lastCoins) { $('coins').textContent = DC.fmt(c); lastCoins = c; }
    const ipm = G.incomePerMin();
    $('cps').textContent = ipm > 0 ? '+' + DC.fmt(ipm) + '/min' : '';
    const cap = G.energyCap();
    const r = Math.max(0, Math.min(1, s.energy / cap));
    $('energyFill').style.width = (r * 100).toFixed(1) + '%';
    $('energyTxt').textContent = Math.floor(s.energy) + '/' + cap;
    $('energyFill').parentElement.classList.toggle('low', r < 0.15);
    const seed = DC.CROP[s.seed];
    const si = $('seedIcon');
    if (si.dataset.k !== seed.id) { si.innerHTML = DC.icon('farm', seed.item, 24); si.dataset.k = seed.id; }
    // palier
    $('lvlNum').textContent = s.level;
    const lmax = G.lvlMax();
    $('lvlFill').style.width = (s.level >= lmax ? 100 : Math.min(100, s.xp / DC.xpFor(s.level) * 100)).toFixed(1) + '%';
    $('resLevel').title = s.level >= lmax ? (lmax < DC.LVL_MAX2 ? 'Palier 25 : débloquez la Vallée d’automne pour continuer' : 'Palier maximum') : `Palier ${s.level} · ${Math.floor(s.xp)}/${DC.xpFor(s.level)} XP`;
    // régions
    const multi = s.regions.length > 1;
    document.body.classList.toggle('regions', multi);
    document.body.classList.toggle('in-vallee', G.s.regions[s.view].key === 'vallee');
    if (multi) {
      const other = DC.REG[s.regions[(s.view + 1) % s.regions.length].key];
      $('regionIc').textContent = other.icon;
      $('regionLbl').textContent = other.key === 'vallee' ? 'Vallée' : other.name;
      $('btnRegion').title = 'Aller à : ' + other.name;
    }
    // recherche en cours
    const cur = s.research.cur;
    const lf = $('labFill');
    if (cur) {
      const r = DC.RES[cur.id];
      lf.style.width = Math.min(100, cur.t / r.time * 100).toFixed(1) + '%';
      $('btnLab').title = `${r.name} · ${DC.fmtTime(r.time - cur.t)}`;
      $('btnLab').classList.remove('idle');
    } else {
      lf.style.width = '0%';
      $('btnLab').title = 'Recherche (aucune en cours)';
      $('btnLab').classList.toggle('idle', DC.RESEARCH.some(r => G.researchState(r.id) === 'ok' && G.canAfford(r.cost)));
    }
    for (const u of UI.updaters) u();
  };

  UI.layoutHUD = function () {
    const ui = G.s ? (G.s.opts.textSize || 1) : 1;
    document.documentElement.style.setProperty('--ui', ui);
    const w = window.innerWidth / ui;
    const b = document.body.classList;
    b.toggle('compact', w < 760);
    b.toggle('tiny', w < 420);
    // deux lignes si la barre déborde
    b.remove('stack');
    // largeur naturelle de chaque groupe (somme des éléments, sans rétrécissement)
    const natural = sel => [...document.querySelector(sel).children]
      .filter(e => e.offsetParent !== null)
      .reduce((s, e) => s + Math.max(e.scrollWidth, parseFloat(getComputedStyle(e).minWidth) || 0) + 6, 0) * ui;
    if (natural('.hud-left') + natural('.hud-right') + 16 > window.innerWidth) b.add('stack');
  };

  /* ---------- Modal ---------- */
  const PANELS = {
    shop: { tabs: [['cultures', 'Cultures'], ['upg', 'Améliorations'], ['decor', 'Décor']] },
    bots: { tabs: [['bots', 'Robots']] },
    lab: { tabs: [['research', 'Recherche']] },
    farm: { tabs: [['quests', 'Objectifs'], ['levels', 'Paliers'], ['farm', 'Ferme'], ['season', 'Saison']] },
    opts: { tabs: [['opts', 'Options'], ['credits', 'Crédits']] },
  };

  UI.open = function (panel, tab) {
    UI.panel = panel;
    UI.tab = tab || PANELS[panel].tabs[0][0];
    $('modal').classList.remove('hidden');
    hideSeedPicker();
    UI.renderPanel();
    A.play('open', 0.6);
    if (panel === 'farm') $('questDot').classList.remove('on');
  };
  UI.close = function () {
    if (!UI.panel) return;
    UI.panel = null; UI.updaters = [];
    $('modal').classList.add('hidden');
    A.play('close', 0.5);
  };

  UI.renderPanel = function () {
    const p = PANELS[UI.panel];
    if (!p) return;
    $('tabs').innerHTML = p.tabs.map(([id, n]) => `<button class="tab ${id === UI.tab ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('');
    const body = $('modalBody');
    const scroll = body.scrollTop;
    UI.updaters = [];
    body.innerHTML = '';
    RENDER[UI.tab](body);
    body.scrollTop = scroll;
    UI.updateHUD();
  };

  /* bouton d'achat avec mise à jour automatique */
  function buyBtn(label, costFn, onBuy, opts) {
    opts = opts || {};
    const b = document.createElement('button');
    b.className = 'buy ' + (opts.cls || '');
    const upd = () => {
      const cost = costFn();
      if (cost == null) { b.disabled = true; b.innerHTML = opts.maxLabel || 'MAX'; return; }
      b.innerHTML = cost === 0 ? label : `${coinIc}${DC.fmt(cost)}`;
      b.disabled = !G.canAfford(cost);
    };
    upd();
    UI.updaters.push(upd);
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (onBuy()) { A.play('buy', 0.7); UI.renderPanel(); }
      else A.play('error', 0.5);
    });
    return b;
  }

  function card(iconHTML, name, desc, extra) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `${iconHTML || ''}<div class="info"><div class="name">${name}</div>${desc ? `<div class="desc">${desc}</div>` : ''}</div>`;
    if (extra) c.appendChild(extra);
    return c;
  }
  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function pips(l, max) { let s = '<span class="pips">'; for (let i = 0; i < max; i++) s += `<i class="${i < l ? 'on' : ''}"></i>`; return s + '</span>'; }

  const RENDER = {
    cultures(body) {
      body.appendChild(h('div', 'hint', 'Chaque culture se vend au marché ou part au compost pour recharger les robots (réglage dans Ferme). Touchez la graine en haut pour choisir quoi planter.'));
      for (const c of DC.CROPS) {
        const un = G.s.unlocked[c.id];
        const desc = `⏱ ${DC.fmtTime(c.grow)} · <span class="ic-coin sm"></span> ${c.sell} · ⚡ ${c.energy}`;
        let btn;
        if (un) {
          btn = h('button', 'buy alt small', G.s.seed === c.id ? '✓ Choisie' : 'Choisir');
          btn.onclick = () => { G.s.seed = c.id; A.play('select'); UI.renderPanel(); };
        } else {
          btn = h('button', 'buy alt small', '🔬 Recherche');
          btn.onclick = () => UI.open('lab');
        }
        const cd = card(DC.icon('farm', un ? c.item : c.seed, 32), c.name,
          desc + (un ? '' : `<br>🔒 Recherche « ${DC.RES[c.res].name} »`), btn);
        if (!un) cd.classList.add('locked');
        body.appendChild(cd);
      }
    },

    upg(body) {
      // zones et parcelles
      const max = G.maxPlots();
      body.appendChild(h('div', 'section-title', 'Terrain'));
      const z = G.nextZone(), zs = G.zoneState();
      body.appendChild(card(DC.icon('town', 83, 32), `Zone ${G.s.zones + (z ? 1 : 0)} <span class="lvl">${G.s.zones}/${G.regionDef().zones.length}</span>`,
        z ? `+${DC.ZONE_SIZE} emplacements de parcelles.${zs === 'lvl' ? ` <b>Palier ${z.lvl} requis.</b>` : ''}` : 'Tout le terrain est à vous !',
        buyBtn('', () => (!z || zs !== 'ok') ? null : z.cost, () => {
          if (!G.buyZone()) return false;
          UI.toast(`🗺 Zone ${G.s.zones} achetée !`, 'gold');
          return true;
        }, { maxLabel: !z ? 'MAX' : `🔒 Palier ${z.lvl}` })));
      const nextReg = DC.REGIONS[G.s.regions.length];
      if (nextReg && G.regionZones(0) >= DC.ZONES.length - 1) {
        const reqs = G.regionReqs().map(([t, ok]) => `<span class="${ok ? 'req-ok' : 'req-no'}">${ok ? '✓' : '✗'} ${t}</span>`).join('<br>');
        const c = card(`<span style="font-size:26px">${nextReg.icon}</span>`, `Nouvelle région : ${nextReg.name}`, `${nextReg.desc}<br>${reqs}`,
          buyBtn('', () => G.canUnlockRegion() ? nextReg.cost : null, () => G.unlockRegion(), { maxLabel: `🔒 ${DC.fmt(nextReg.cost)}` }));
        c.style.background = '#fbe3c4';
        body.appendChild(c);
      }
      body.appendChild(card(DC.icon('farm', 1, 32), `Nouvelle parcelle <span class="lvl">${G.s.plots.length}/${max}</span>`,
        G.s.plots.length >= G.zonePlots() ? 'Zone pleine : achetez la zone suivante.' : 'Astuce : touchez le « + » dans le champ.',
        buyBtn('', () => G.s.plots.length >= max ? null : G.plotCost(), () => G.buyPlot(), { maxLabel: 'Zone pleine' })));
      body.appendChild(h('div', 'section-title', 'Améliorations'));
      body.appendChild(h('div', 'hint', `Niveau maximum au palier ${G.s.level} : ${DC.upgCapFor(G.s.level)}. Montez de palier pour aller plus loin.`));
      for (const u of DC.UPGRADES) {
        const l = G.lvl(u.id), cap = G.upgCap(u.id);
        body.appendChild(card(DC.icon(u.icon[0], u.icon[1], 32), `${u.name} ${pips(l, u.max)}`, u.desc(l),
          buyBtn('', () => G.lvl(u.id) >= cap ? null : G.upgCost(u.id), () => G.buyUpgrade(u.id),
            { maxLabel: l >= u.max ? 'MAX' : '🔒 Palier ' + (G.s.level + 1) })));
      }
    },

    decor(body) {
      body.appendChild(h('div', 'hint', `Confort actuel : <b>${G.comfort()}</b> → +${G.comfort() * 2}% de pièces. Les décorations s’installent toutes seules dans la ferme.`));
      for (const d of DC.DECOR) {
        const n = G.s.decor[d.id] || 0;
        const tile = Array.isArray(d.tile) ? d.tile[0] : d.tile;
        body.appendChild(card(DC.icon(d.sheet, tile, 32), `${d.name} <span class="lvl">${n}/${d.max}</span>`,
          `+${d.comfort} confort${d.desc ? ' · ' + d.desc : ''}`,
          buyBtn('', () => n >= d.max ? null : DC.decorCost(d, n), () => {
            if (!G.buyDecor(d.id)) return false;
            UI.toast(`${DC.icon(d.sheet, tile, 20)} ${d.name} installé·e !`);
            return true;
          })));
      }
    },

    bots(body) {
      const s = G.s;
      const full = s.bots.length >= G.maxBots();
      body.appendChild(h('div', 'section-title', `Recruter <span class="lvl">${s.bots.length}/${G.maxBots()}</span>`));
      body.appendChild(h('div', 'hint',
        `Chaque robot a une 🔋 batterie (${Math.round(G.batMax())} unités) : une action en coûte de ${+G.actionCost(DC.CROPS[0]).toFixed(2)} (carotte) à ${+G.actionCost(DC.CROPS[DC.CROPS.length - 1]).toFixed(1)} (tournesol), les trajets aussi. ` +
        `Batterie faible → il file à une des <b>${G.chargeSlots()} bornes</b> de l’atelier et se recharge avec l’⚡ du compost. ` +
        `S’il n’y a pas de borne libre, il fait la queue.` + (full ? ` <b>Équipe complète au palier ${s.level}.</b>` : '')));
      for (const t of DC.BOTS) {
        if (!G.botAvailable(t.id)) {
          const cd = card(DC.botIcon(t.id, 28), t.name, `${t.desc}<br>🔒 Recherche « ${DC.RES[t.res].name} »`);
          cd.classList.add('locked');
          body.appendChild(cd);
          continue;
        }
        body.appendChild(card(DC.botIcon(t.id, 28), `${t.name} <span class="lvl">×${G.countBots(t.id)}</span>`, t.desc,
          buyBtn('', () => s.bots.length >= G.maxBots() ? null : G.botCost(t.id), () => {
            const b = G.buyBot(t.id);
            if (!b) return false;
            UI.toast(`${DC.botIcon(t.id, 18)} ${b.name} rejoint la ferme !`);
            return true;
          }, { maxLabel: `🔒 Palier ${G.s.level + 1}` })));
      }
      if (s.bots.length) {
        body.appendChild(h('div', 'section-title', `Équipe (${s.bots.length})`));
        const STATE = { idle: 'flâne', wander: 'flâne', move: 'en route', work: 'au travail', tocharge: 'va se recharger', queue: 'attend une borne', charging: 'en charge' };
        for (const b of s.bots) {
          const t = DC.BOT[b.type];
          const stEl = h('span', 'bot-state');
          const upd = () => {
            const pct = Math.round(b.bat / G.batMax() * 100);
            const stalled = b.state === 'charging' && G.s.energy <= 0.01;
            stEl.textContent = `🔋${pct}% · ` + (stalled ? 'plus d’énergie !' : (STATE[b.state] || b.state));
            stEl.className = 'bot-state ' + (b.state === 'queue' || stalled || pct < 20 ? 'sleep' : b.state === 'work' ? 'work' : '');
          };
          upd(); UI.updaters.push(upd);
          const btn = buyBtn('', () => b.lvl >= G.botLvlCap() ? null : G.botUpCost(b), () => {
            if (!G.upgradeBot(b)) return false;
            A.play('levelup', 0.6);
            return true;
          }, { maxLabel: b.lvl >= DC.BOT_MAX_LVL ? 'MAX' : '🔒 Palier ' + (G.s.level + 1) });
          const cd = card(DC.botIcon(b.type, 24), `${escapeHTML(b.name)} <button class="rename" title="Renommer">✎</button> ${pips(b.lvl, DC.BOT_MAX_LVL)}`,
            `${t.name} · vitesse ×${(1 + 0.12 * (b.lvl - 1)).toFixed(2)} `, btn);
          cd.querySelector('.desc').appendChild(stEl);
          cd.querySelector('.rename').onclick = () => {
            const n = window.prompt('Nouveau nom pour ' + b.name + ' :', b.name);
            if (n && n.trim()) { b.name = n.trim().slice(0, 16); UI.renderPanel(); }
          };
          body.appendChild(cd);
        }
      }
    },

    research(body) {
      const R = G.s.research;
      if (R.cur) {
        const r = DC.RES[R.cur.id];
        const c = h('div', 'card');
        c.innerHTML = `<span style="font-size:24px">🔬</span><div class="info"><div class="name">${r.name} <span class="lvl">en cours</span></div>
          <div class="bar" style="height:14px;margin:4px 0"><div class="fill" id="resFill"></div><span id="resTxt"></span></div>
          <div class="desc">${r.desc}</div></div>`;
        const cancel = h('button', 'buy warn small', 'Annuler');
        cancel.title = 'Rembourse la moitié du prix';
        cancel.onclick = () => { if (confirm('Annuler cette recherche ? La moitié du prix est remboursée.') && G.cancelResearch()) UI.renderPanel(); };
        c.appendChild(cancel);
        body.appendChild(c);
        const f = c.querySelector('#resFill'), tx = c.querySelector('#resTxt');
        const upd = () => {
          if (!G.s.research.cur) { UI.renderPanel(); return; }
          f.style.width = Math.min(100, R.cur.t / r.time * 100) + '%';
          tx.textContent = 'reste ' + DC.fmtTime(r.time - R.cur.t);
        };
        upd(); UI.updaters.push(upd);
      } else {
        body.appendChild(h('div', 'hint', 'Une seule recherche à la fois. Elle avance en temps réel, même pendant votre absence. Les niveaux de recherche se débloquent avec les paliers.'));
      }
      for (const br of DC.BRANCHES) {
        body.appendChild(h('div', 'section-title', `${br.icon} ${br.name}`));
        const tree = h('div', 'rtree');
        for (const r of DC.RESEARCH.filter(x => x.b === br.id)) {
          const st = G.researchState(r.id);
          const node = h('div', 'rnode ' + st);
          node.style.setProperty('--t', r.t - 1);
          const reqTxt = r.req.length ? 'Après : ' + r.req.map(q => DC.RES[q].name).join(', ') : '';
          const lockTxt = st === 'region' ? '🔒 Débloquez la Vallée d’automne' : st === 'lvl' ? `🔒 Palier ${DC.TIER_LVL[r.t - 1]} requis` : st === 'req' ? '🔒 ' + reqTxt : (reqTxt && st !== 'done' ? reqTxt : '');
          node.innerHTML = `<span class="tier">N${r.t}</span><div class="info"><div class="name">${r.name}</div>
            <div class="desc">${r.desc}${st === 'done' ? '' : ` · ⏱ ${DC.fmtTime(r.time)}`}${lockTxt ? '<br>' + lockTxt : ''}</div></div>`;
          if (st === 'done') node.appendChild(h('span', 'rdone', '✓'));
          else if (st === 'cur') node.appendChild(h('span', 'rdone', '⏳'));
          else if (st === 'ok') {
            node.appendChild(buyBtn('', () => G.s.research.cur ? null : r.cost, () => {
              if (!G.startResearch(r.id)) return false;
              UI.toast(`🔬 Recherche lancée : ${r.name}`);
              return true;
            }, { maxLabel: 'Labo occupé' }));
          }
          tree.appendChild(node);
        }
        body.appendChild(tree);
      }
    },

    levels(body) {
      const s = G.s;
      const nxt = s.level >= G.lvlMax() ? null : DC.xpFor(s.level);
      body.appendChild(h('div', 'card', `<span style="font-size:24px">⭐</span><div class="info"><div class="name">Palier ${s.level}</div>
        <div class="bar" style="height:14px;margin:4px 0"><div class="fill" style="width:${nxt ? Math.min(100, s.xp / nxt * 100) : 100}%"></div><span>${nxt ? Math.floor(s.xp) + ' / ' + nxt + ' XP' : 'MAX'}</span></div>
        <div class="desc">L’XP vient des récoltes (plus la culture est longue, plus elle rapporte) et des recherches terminées.</div></div>`));
      body.appendChild(h('div', 'grid2', [
        ['Robots max', G.maxBots()], ['Niveau robots max', G.botLvlCap()], ['Améliorations max', 'niv. ' + DC.upgCapFor(s.level)],
        ['Bornes de recharge', G.chargeSlots()],
      ].map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join('')));
      body.appendChild(h('div', 'section-title', 'Prochains paliers'));
      if (G.lvlMax() < DC.LVL_MAX2 && s.level >= DC.LVL_MAX) body.appendChild(h('div', 'hint', '🍂 Les paliers 26 à 40 se débloquent avec la Vallée d’automne (Boutique → Améliorations → Terrain).'));
      for (let L = s.level + 1; L <= Math.min(G.lvlMax(), s.level + 8); L++) {
        const perks = G.levelPerks(L);
        body.appendChild(card(`<span class="tier">${L}</span>`, `Palier ${L}`, perks.join(' · ') || '—'));
      }
    },

    quests(body) {
      const act = G.activeQuests();
      body.appendChild(h('div', 'hint', 'Les objectifs se valident tout seuls et rapportent des pièces.'));
      if (!act.length) body.appendChild(h('div', 'card done', '🎉 Tous les objectifs sont accomplis ! Bravo.'));
      for (const q of act) {
        const [v, t] = q.check(G);
        const pct = Math.min(100, v / t * 100);
        const cd = card('<span style="font-size:22px">🎯</span>', q.text,
          `<div class="bar" style="height:12px;margin:3px 0"><div class="fill" style="width:${pct}%"></div></div>${DC.fmt(Math.min(v, t))} / ${DC.fmt(t)} · récompense ${DC.fmt(q.reward)} pièces`);
        body.appendChild(cd);
      }
      const done = DC.QUESTS.filter(q => G.s.quests[q.id]);
      if (done.length) {
        body.appendChild(h('div', 'section-title', `Accomplis (${done.length}/${DC.QUESTS.length})`));
        const d = h('div', 'hint', done.map(q => '✓ ' + q.text).reverse().join('<br>'));
        body.appendChild(d);
      }
    },

    farm(body) {
      const s = G.s;
      const name = h('div', 'card', `<span style="font-size:22px">🏡</span><div class="info"><div class="name">${escapeHTML(s.farmName)}</div><div class="desc">Saison ${s.seasons + 1}${s.goldenSeeds ? ` · ${s.goldenSeeds} graines dorées` : ''}</div></div>`);
      const rn = h('button', 'buy alt small', 'Renommer');
      rn.onclick = () => { const n = prompt('Nom de la ferme :', s.farmName); if (n && n.trim()) { s.farmName = n.trim().slice(0, 28); UI.renderPanel(); } };
      name.appendChild(rn);
      body.appendChild(name);

      body.appendChild(h('div', 'section-title', 'Répartition des récoltes'));
      const sl = h('div', 'card');
      sl.innerHTML = `<div class="info"><div class="slider-row"><span>🪙 Marché</span><input type="range" min="0" max="100" step="5" id="shareRange"><span>⚡ Compost</span></div><div class="desc" id="shareTxt"></div></div>`;
      body.appendChild(sl);
      const rg = sl.querySelector('#shareRange'), tx = sl.querySelector('#shareTxt');
      const setTxt = () => { tx.textContent = `${Math.round((1 - s.compostShare) * 100)}% vendu · ${Math.round(s.compostShare * 100)}% composté pour l’énergie des robots`; };
      rg.value = Math.round(s.compostShare * 100); setTxt();
      rg.oninput = () => { s.compostShare = rg.value / 100; setTxt(); };

      body.appendChild(h('div', 'section-title', 'Bonus'));
      const g2 = h('div', 'grid2');
      g2.innerHTML = [
        ['Pièces', '×' + G.coinMult().toFixed(2)], ['Croissance', '×' + G.growthMult().toFixed(2)],
        ['Compost', '×' + G.energyMult().toFixed(2)], ['Confort', G.comfort()],
      ].map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join('');
      body.appendChild(g2);

      body.appendChild(h('div', 'section-title', 'Statistiques'));
      const st = s.stats;
      const g = h('div', 'grid2');
      const rows = [
        ['Pièces gagnées', DC.fmt(st.earned)], ['Récoltes', DC.fmt(st.harvests)], ['Semis', DC.fmt(st.planted)],
        ['Arrosages', DC.fmt(st.watered)], ['Cultures dorées', st.golden], ['Cadeaux ouverts', st.gifts],
        ['Temps de jeu', DC.fmtTime(st.playTime)], ['Robots', s.bots.length],
      ];
      g.innerHTML = rows.map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join('');
      body.appendChild(g);
      const by = DC.CROPS.filter(c => st.byCrop[c.id]).map(c => `${DC.icon('farm', c.item, 20)} ${DC.fmt(st.byCrop[c.id])}`).join(' &nbsp; ');
      if (by) body.appendChild(h('div', 'hint', by));
    },

    season(body) {
      const s = G.s;
      const gain = G.prestigeGain();
      body.appendChild(h('div', 'hint',
        `Une <b>nouvelle saison</b> remet la ferme à zéro (pièces, parcelles, robots, améliorations, cultures) mais vous gardez vos décorations, vos objectifs et vous gagnez des <b>graines dorées</b> : +10% de pièces et +2% de croissance chacune, pour toujours.`));
      body.appendChild(h('div', 'grid2', `<div class="stat">Graines dorées<b>${s.goldenSeeds}</b></div><div class="stat">Gagné cette saison<b>${DC.fmt(s.seasonEarned)}</b></div>`));
      const can = G.canPrestige();
      const btn = h('button', 'buy warn', can ? `Nouvelle saison (+${gain} 🌟)` : `Disponible à ${DC.fmt(DC.PRESTIGE_MIN)} pièces gagnées`);
      btn.style.width = '100%';
      btn.disabled = !can;
      btn.onclick = () => {
        if (!confirm(`Commencer une nouvelle saison et gagner ${gain} graines dorées ?`)) return;
        if (G.prestige()) { A.play('levelup'); UI.close(); DC.main.relayout(); UI.toast(`🌟 Nouvelle saison ! ${G.s.goldenSeeds} graines dorées.`, 'gold'); }
      };
      body.appendChild(btn);
    },

    opts(body) {
      const o = G.s.opts;
      const sec = t => body.appendChild(h('div', 'section-title', t));
      const row = (label, el) => { const r = h('div', 'card'); r.innerHTML = `<div class="info"><div class="name" style="font-size:14px">${label}</div></div>`; r.appendChild(el); body.appendChild(r); return r; };
      const range = (val, fn) => { const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 100; i.value = Math.round(val * 100); i.style.width = '140px'; i.oninput = () => fn(i.value / 100); return i; };
      const seg = (opts, cur, fn) => {
        const s = h('div', 'seg');
        opts.forEach(([v, l]) => { const b = h('button', v === cur ? 'on' : '', l); b.onclick = () => { fn(v); A.play('toggle', 0.5); UI.renderPanel(); }; s.appendChild(b); });
        return s;
      };

      sec('Son');
      row('🎵 Musique', range(o.music, v => { o.music = v; A.setMusic(v); }));
      row('🔊 Effets', range(o.sfx, v => { o.sfx = v; A.setSfx(v); }));

      sec('Affichage');
      const zc = h('div', 'zoomctl');
      const zl = () => (o.zoom > 0 ? '+' : '') + (o.zoom || 'Auto');
      zc.innerHTML = `<button class="buy alt small">−</button><b>${zl()}</b><button class="buy alt small">+</button>`;
      const [zm, zp] = zc.querySelectorAll('button');
      zm.onclick = () => { DC.main.zoomBy(-1); zc.querySelector('b').textContent = zl(); };
      zp.onclick = () => { DC.main.zoomBy(1); zc.querySelector('b').textContent = zl(); };
      row(`🔍 Zoom <div class="desc">${DC.isTouch ? 'Aussi en pinçant l’écran' : 'Aussi à la molette de la souris'}</div>`, zc);
      row('🔠 Taille du texte', seg([[1, 'Normal'], [1.2, 'Grand'], [1.4, 'Très grand']], o.textSize || 1, v => { o.textSize = v; DC.main.relayout(); }));
      const tb = h('button', 'buy alt small', '🎓 Revoir le tutoriel');
      tb.onclick = () => { UI.close(); DC.tuto.start(); };
      row('Tutoriel', tb);
      row('📐 Disposition', seg([['auto', 'Auto'], ['landscape', 'Paysage'], ['portrait', 'Portrait']], o.layout, v => {
        o.layout = v; DC.main.relayout();
        if (DC.render.layoutFallback) UI.toast(`Pas assez de place pour cette disposition dans cette fenêtre${DC.desk.ok ? ' — essayez Position : Gauche ou Droite' : ''}.`);
      }));
      row('🌙 Jour / nuit (heure réelle)', seg([[true, 'Oui'], [false, 'Non']], o.daynight, v => { o.daynight = v; DC.render.night = null; }));

      if (DC.desk.ok) {
        sec('Bureau');
        row('📌 Position<div class="desc">Glissez la poignée ⠿ pour déplacer la fenêtre (elle passe en Libre) ; en Libre, le coin ↘ la redimensionne.</div>', seg([['bottom', 'Bas'], ['top', 'Haut'], ['left', 'Gauche'], ['right', 'Droite'], ['free', 'Libre']], o.dock, v => { o.dock = v; DC.main.applyDesk(); }));
        const sz = document.createElement('input');
        sz.type = 'range'; sz.min = 140; sz.max = 600; sz.step = 10; sz.value = o.dockSize; sz.style.width = '140px';
        sz.onchange = () => { o.dockSize = +sz.value; DC.main.applyDesk(); };
        row('↕ Épaisseur de la bande', sz);
        row('🔝 Toujours au premier plan', seg([[true, 'Oui'], [false, 'Non']], o.onTop, v => { o.onTop = v; DC.main.applyDesk(); }));
        row('↔ Décaler les autres fenêtres<div class="desc">Réserve le bord de l’écran comme la barre des tâches (si premier plan et bande ancrée).</div>', seg([[true, 'Oui'], [false, 'Non']], o.reserve, v => { o.reserve = v; DC.main.applyDesk(); }));
        const r = h('div', 'row');
        const mn = h('button', 'buy alt small', '— Réduire'); mn.onclick = () => DC.desk.call('minimize');
        const qt = h('button', 'buy warn small', '✕ Quitter'); qt.onclick = () => { DC.main.save(); setTimeout(() => DC.desk.call('quit'), 150); };
        r.appendChild(mn); r.appendChild(qt);
        body.appendChild(r);
      }

      if (!DC.desk.ok) {
        sec('🔌 Mode recharge');
        const mb = h('button', 'buy small' + (DC.RECHARGE ? ' alt' : ''), DC.RECHARGE ? '🏡 Revenir au mode normal' : '🔌 Passer en mode recharge');
        mb.onclick = () => DC.setMode(!DC.RECHARGE);
        const mr = row(DC.RECHARGE
          ? 'Vous jouez en mode recharge<div class="desc">Version tactile et accélérée : la Prairie se termine en quelques heures. Elle a sa propre partie, distincte du mode normal (retrouvée en revenant ici).</div>'
          : 'Mode recharge<div class="desc">Pour l’écran tactile d’une voiture (Tesla…) pendant une recharge : gros boutons, progression environ 80 fois plus rapide, partie séparée. Adresse directe : <b>…/DeskCosy/recharge</b></div>', mb);
        mr.classList.add('mode-card');
      }

      sec('Sauvegarde');
      const r2 = h('div', 'row');
      const ex = h('button', 'buy alt small', '📤 Exporter');
      ex.onclick = () => {
        const data = btoa(unescape(encodeURIComponent(G.serialize())));
        if (navigator.clipboard) navigator.clipboard.writeText(data).then(() => UI.toast('Sauvegarde copiée dans le presse-papiers'), () => prompt('Copiez ce code :', data));
        else prompt('Copiez ce code :', data);
      };
      const im = h('button', 'buy alt small', '📥 Importer');
      im.onclick = () => {
        const d = prompt('Collez votre code de sauvegarde :');
        if (!d) return;
        try { const json = decodeURIComponent(escape(atob(d.trim()))); JSON.parse(json); G.load(json); DC.main.relayout(); DC.main.save(); UI.close(); UI.toast('Sauvegarde importée !'); }
        catch (e) { UI.toast('Code invalide'); A.play('error'); }
      };
      const rs = h('button', 'buy warn small', '🗑 Recommencer');
      rs.onclick = () => {
        if (!confirm('Effacer définitivement la partie et recommencer ?')) return;
        G.reset(); DC.main.relayout(); UI.close(); DC.tuto.start(); DC.main.save();
      };
      r2.append(ex, im, rs);
      body.appendChild(r2);
      body.appendChild(h('div', 'hint', 'La partie est sauvegardée automatiquement. Vos robots continuent de travailler pendant votre absence (jusqu’à 12 h).'));
    },

    credits(body) {
      body.appendChild(h('div', 'card', `<div class="info"><div class="name">DeskCosy</div><div class="desc">Un petit jeu de ferme « idle » qui vit au bord de votre écran. Code et robots en pixel art originaux.</div></div>`));
      const list = [
        ['Graphismes', 'Tiny Farm & Tiny Town — Kenney (kenney.nl), CC0'],
        ['Sons', 'Interface Sounds & RPG Audio — Kenney, CC0'],
        ['Musique', '« Happy Adventure » — TinyWorlds (OpenGameArt), CC0'],
        ['Police', 'Pixelify Sans — Stefie Justprince, SIL OFL 1.1'],
      ];
      list.forEach(([a, b]) => body.appendChild(card('', a, b)));
      body.appendChild(h('div', 'hint', 'Licences complètes dans assets/licenses/.'));
    },
  };

  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  UI.escapeHTML = escapeHTML;

  /* ---------- Sélecteur de graine ---------- */
  function showSeedPicker() {
    const sp = $('seedPicker');
    const s = G.s;
    sp.innerHTML = '<div class="sp-title">Graine à planter (touchez une parcelle vide)</div>';
    for (const c of DC.CROPS) {
      const un = s.unlocked[c.id];
      const b = h('button', 'seedopt' + (s.seed === c.id ? ' on' : ''), `${DC.icon('farm', un ? c.item : c.seed, 32)}${c.name}<small>${un ? DC.fmtTime(c.grow) : '🔒 recherche'}</small>`);
      b.onclick = () => {
        if (!un) { UI.open('lab'); return; }
        s.seed = c.id; A.play('select', 0.6); hideSeedPicker(); UI.updateHUD();
      };
      sp.appendChild(b);
    }
    const all = h('button', 'buy alt small', `Tout passer en ${DC.CROP[s.seed].name}`);
    all.style.width = '100%';
    all.onclick = () => { s.plots.forEach((p, i) => G.assignPlot(i, s.seed)); A.play('buy', 0.5); UI.toast('Toutes les parcelles seront replantées en ' + DC.CROP[s.seed].name); hideSeedPicker(); };
    sp.appendChild(all);
    sp.appendChild(h('div', 'sp-title', 'Astuce : clic droit / appui long sur une parcelle pour lui attribuer cette graine.'));
    sp.classList.remove('hidden');
  }
  function hideSeedPicker() { $('seedPicker').classList.add('hidden'); }
  UI.hideSeedPicker = hideSeedPicker;

  /* ---------- Modal d'information ---------- */
  UI.info = function (title, html) {
    UI.panel = 'info'; UI.updaters = [];
    $('tabs').innerHTML = `<span class="tab on">${title}</span>`;
    $('modalBody').innerHTML = html;
    const ok = h('button', 'buy', 'Super !');
    ok.style.alignSelf = 'center';
    ok.onclick = () => UI.close();
    $('modalBody').appendChild(ok);
    $('modal').classList.remove('hidden');
  };

  UI.init = function () {
    $('btnShop').onclick = () => UI.open('shop');
    $('btnLab').onclick = () => UI.open('lab');
    $('btnRegion').onclick = () => {
      const n = G.s.regions.length;
      if (n < 2) return;
      G.switchRegion((G.s.view + 1) % n);
      A.play('open', 0.6);
      UI.toast(`${G.regionDef().icon} ${G.regionDef().name}`);
    };
    $('resLevel').onclick = () => UI.open('farm', 'levels');
    $('btnBots').onclick = () => UI.open('bots');
    $('btnFarm').onclick = () => UI.open('farm');
    $('btnOpts').onclick = () => UI.open('opts');
    $('btnSeed').onclick = e => { e.stopPropagation(); if ($('seedPicker').classList.contains('hidden')) { showSeedPicker(); A.play('click', 0.5); } else hideSeedPicker(); };
    $('btnMin').onclick = () => { DC.main.save(); DC.desk.call('minimize'); };
    $('btnQuit').onclick = () => { DC.main.save(); setTimeout(() => DC.desk.call('quit'), 150); };
    $('modalClose').onclick = () => UI.close();
    $('modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') UI.close(); });
    $('tabs').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (t) { UI.tab = t.dataset.tab; A.play('click', 0.5); $('modalBody').scrollTop = 0; UI.renderPanel(); }
    });
    $('resEnergy').onclick = () => UI.open('farm', 'farm');
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (UI.panel) UI.close(); else hideSeedPicker(); }
    });
    UI.layoutHUD();
  };
})();
