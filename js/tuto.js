/* DeskCosy — tutoriel interactif */
(function () {
  const G = DC.game, R = DC.render, A = DC.audio;
  const $ = id => document.getElementById(id);
  const T = DC.tuto = {};
  let root, ring, bubble, shownStep = -1;

  const st = () => G.s.stats;
  const isDesk = () => document.body.classList.contains('desktop');

  /* cible = parcelle répondant au critère (rectangle écran) */
  function plotRect(pred) {
    if (!G.L) return null;
    const i = G.s.plots.findIndex(pred);
    if (i < 0) return null;
    return tileRect(G.L.plot(i));
  }
  function tileRect(p) {
    const t = 16 * R.zoom;
    return { left: p.x * t - 3, top: p.y * t - 5, width: t + 6, height: t + 8 };
  }
  function el(sel) {
    for (const s of [].concat(sel)) {
      const e = document.querySelector(s);
      if (e && e.offsetParent !== null) { const r = e.getBoundingClientRect(); if (r.width) return r; }
    }
    return null;
  }
  function union(sels) {
    const rs = sels.map(s => el(s)).filter(Boolean);
    if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
    const r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { left: l, top: t, width: r - l, height: b - t };
  }

  const STEPS = [
    {
      title: 'Bienvenue dans DeskCosy !',
      text: () => DC.RECHARGE
        ? '🔌 <b>Mode recharge</b> : une version tactile et accélérée, à jouer à l’arrêt pendant que la voiture charge. Un petit potager entretenu par des robots : je vous montre l’essentiel en une minute.'
        : 'Un petit potager qui pousse au bord de votre écran, entretenu par des robots. Je vous montre l’essentiel en une minute.',
      next: 'C’est parti !',
    },
    {
      title: 'Semer',
      text: 'Touchez une parcelle de terre <b>vide</b> pour y semer une carotte.',
      target: () => plotRect(p => p.st === 0),
      done: () => st().planted >= 1,
    },
    {
      title: 'Arroser',
      text: 'La <b style="color:#3b8fd0">goutte bleue</b> veut dire que la plante a soif. Touchez la parcelle pour l’arroser.',
      target: () => plotRect(p => p.st === 1 && !p.w) || plotRect(p => p.st === 1),
      done: () => st().watered >= 1 || st().harvests >= 1 || G.raining(),
    },
    {
      title: 'Ça pousse !',
      text: 'La barre verte montre la pousse. Arrosez à chaque nouvelle goutte, puis touchez la carotte <b>mûre</b> pour la récolter.',
      target: () => plotRect(p => p.st === 2) || plotRect(p => p.st === 1 && !p.w) || plotRect(p => p.st === 1),
      done: () => st().harvests >= 1,
    },
    {
      title: 'Pièces et énergie',
      text: 'Chaque récolte est en partie <b>vendue</b> (pièces) et en partie <b>compostée</b> (⚡ énergie des robots). Tenez, 20 pièces pour bien démarrer !',
      target: () => union(['#resCoins', '#resEnergy']),
      enter: () => { if (!G.s.tuto.gift) { G.s.tuto.gift = true; G.earn(20); A.play('coins2', 0.6); } },
      next: 'Suivant',
    },
    {
      title: 'Votre premier robot',
      text: 'Ouvrez le menu <b>Robots</b>.',
      target: () => el('#btnBots'),
      done: () => DC.ui.panel === 'bots' || G.s.bots.length > 0,
    },
    {
      title: 'Recrutez un Arrosebot',
      text: 'Achetez un <b>Arrosebot</b> : il arrosera à votre place, même quand vous n’êtes pas là.',
      target: () => (DC.ui.panel === 'bots' ? el('#modalBody .buy') : el('#btnBots')),
      wait: () => (G.s.coins < G.botCost('arrose') ? `Il vous faut ${G.botCost('arrose')} pièces : récoltez encore un peu !` : ''),
      done: () => G.s.bots.length >= 1,
    },
    {
      title: 'Toute une équipe',
      text: 'Le <b>Plantobot</b> sème et le <b>Cueillobot</b> récolte. Avec les trois, la ferme tourne toute seule ! Fermez ce menu.',
      target: () => (DC.ui.panel ? el('#modalClose') : null),
      done: () => !DC.ui.panel,
    },
    {
      title: 'Les robots se fatiguent',
      text: 'Chaque action vide leur 🔋 <b>batterie</b>. Quand elle est faible, ils vont se recharger sur les <b>bornes</b> devant l’atelier, avec l’⚡ du compost. Pas d’énergie = pas de recharge : gardez le compost en marche !',
      target: () => {
        if (!G.L) return null;
        const t = 16 * R.zoom, n = Math.min(3, G.chargeSlots());
        const a = G.L.chargeSpot(0), b = G.L.chargeSpot(n - 1);
        return { left: (a.x - 0.5) * t, top: (a.y - 1.2) * t, width: (b.x - a.x + 1) * t, height: 1.6 * t };
      },
      next: 'Compris',
    },
    {
      title: 'La recherche',
      text: 'Le <b>labo</b> débloque de nouvelles cultures, de meilleures batteries, plus de bornes… Chaque recherche coûte des pièces et prend du <b>temps réel</b>. Lancez « Navets » !',
      target: () => (DC.ui.panel === 'lab' ? el('#modalBody .rnode.ok .buy') || el('#btnLab') : el('#btnLab')),
      wait: () => (G.s.coins < DC.RES.agro1.cost && !G.s.research.cur ? `Il vous faut ${DC.RES.agro1.cost} pièces : récoltez encore un peu !` : ''),
      done: () => !!G.s.research.cur || G.researchCount() > 0,
    },
    {
      title: 'Paliers et zones',
      text: 'Les récoltes donnent de l’<b>XP</b>. Chaque <b>palier</b> permet plus de robots, de meilleures améliorations et l’achat de nouvelles <b>zones</b> de terrain (le panneau 🔒 au bout du champ).',
      enter: () => DC.ui.close(),
      target: () => el('#resLevel'),
      next: 'Suivant',
    },
    {
      title: 'Choisir la graine',
      text: () => 'Ce bouton choisit ce que vous plantez. ' + (DC.RECHARGE ? '<b>Appui long</b>' : '<b>Clic droit</b> (ou appui long)') + ' sur une parcelle pour lui attribuer cette graine : les robots la replanteront.',
      target: () => el('#btnSeed'),
      next: 'Suivant',
    },
    {
      title: 'Agrandir le champ',
      text: 'Le <b>+</b> dans le champ achète une nouvelle parcelle. Une zone contient 8 parcelles : ensuite, il faudra acheter la zone suivante.',
      target: () => (G.L && G.s.plots.length < G.maxPlots() ? tileRect(G.L.plot(G.s.plots.length)) : null),
      next: 'Suivant',
    },
    {
      title: 'Boutique et Ferme',
      text: '<b>Boutique</b> : nouvelles cultures, améliorations et décorations (le confort augmente les gains).<br><b>Ferme</b> : objectifs, statistiques et réglage vente / compost.',
      target: () => union(['#btnShop', '#btnFarm']),
      next: 'Suivant',
    },
    {
      title: 'À vous de jouer !',
      text: () => (DC.RECHARGE ? '<b>Pincez</b> l’écran pour zoomer.' : '<b>Molette</b> de la souris : zoom.') + ' Dans <b>⚙ Options</b> : taille du texte, disposition' +
        (isDesk() ? ', position de la bande et premier plan.' : '.') +
        (DC.RECHARGE ? ' Entre deux recharges, vos robots travaillent encore 30 minutes. Bonne recharge !' : ' Vos robots continuent de travailler pendant votre absence. Bonne récolte !'),
      target: () => el('#btnOpts'),
      next: 'Terminer',
    },
  ];

  function ensureDom() {
    if (root) return;
    root = $('tuto');
    ring = document.createElement('div'); ring.className = 'ring';
    bubble = document.createElement('div'); bubble.className = 'bubble';
    root.append(ring, bubble);
  }

  T.active = () => G.s && G.s.tuto && !G.s.tuto.done;

  T.start = function () {
    G.s.tuto = { step: 0, done: false, gift: (G.s.tuto && G.s.tuto.gift) || false };
    shownStep = -1;
    T.update();
  };
  T.finish = function () {
    G.s.tuto.done = true;
    root.classList.add('hidden');
    shownStep = -1;
  };
  function go(i) {
    if (i >= STEPS.length) { T.finish(); A.play('quest', 0.6); return; }
    G.s.tuto.step = i;
    A.play('select', 0.5);
    T.update();
  }

  function renderBubble(s, i) {
    const text = typeof s.text === 'function' ? s.text() : s.text;
    bubble.innerHTML = `<div class="bubble-in"><div class="t-step">Tutoriel · ${i + 1}/${STEPS.length}</div>
      <div class="t-title">${s.title}</div><div>${text}</div><div class="wait"></div>
      <div class="t-row"><button class="skip">Passer le tutoriel</button>${s.next ? `<button class="buy small">${s.next}</button>` : ''}</div></div>`;
    bubble.querySelector('.skip').onclick = () => T.finish();
    const nb = bubble.querySelector('.buy');
    if (nb) nb.onclick = () => go(i + 1);
  }

  T.update = function () {
    if (!G.s) return;
    ensureDom();
    if (!T.active()) { root.classList.add('hidden'); return; }
    let i = G.s.tuto.step;
    let s = STEPS[i];
    if (!s) { T.finish(); return; }
    if (s.done && s.done()) { go(i + 1); return; }
    root.classList.remove('hidden');
    if (shownStep !== i) {
      shownStep = i;
      if (s.enter) s.enter();
      renderBubble(s, i);
    }
    const w = bubble.querySelector('.wait');
    if (w) w.textContent = s.wait ? s.wait() : '';

    // anneau de mise en évidence
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = s.target ? s.target() : null;
    if (r) {
      ring.className = 'ring';
      Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    } else {
      ring.className = 'ring none';
      Object.assign(ring.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' });
    }

    // bulle : sous la cible, sinon au-dessus, sinon à côté ; toujours dans l'écran
    const ui = (G.s.opts.textSize || 1);
    bubble.style.width = Math.min(300 * ui, vw - 16) + 'px';
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    let x, y;
    if (!r) { x = (vw - bw) / 2; y = (vh - bh) / 2; }
    else {
      const cx = r.left + r.width / 2;
      x = cx - bw / 2;
      if (r.top + r.height + 12 + bh <= vh) y = r.top + r.height + 12;
      else if (r.top - 12 - bh >= 0) y = r.top - 12 - bh;
      else {
        y = Math.max(4, Math.min(vh - bh - 4, r.top + r.height / 2 - bh / 2));
        x = r.left + r.width + 12 + bw <= vw ? r.left + r.width + 12 : r.left - 12 - bw;
      }
    }
    bubble.style.left = Math.round(Math.max(6, Math.min(vw - bw - 6, x))) + 'px';
    bubble.style.top = Math.round(Math.max(4, Math.min(vh - bh - 4, y))) + 'px';
  };
})();
