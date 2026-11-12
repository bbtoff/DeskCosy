/* DeskCosy — chargement des images et sprites des robots (pixel art fait main) */
(function () {
  const IMG = {};
  DC.IMG = IMG;
  const SHEETS = { farm: 'assets/img/farm.png', town: 'assets/img/town.png' };
  const COLS = 12;

  DC.loadImages = function () {
    return Promise.all(Object.entries(SHEETS).map(([k, src]) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { IMG[k] = im; res(); };
      im.onerror = () => rej(new Error('Image introuvable : ' + src));
      im.src = src;
    })));
  };

  DC.drawTile = function (ctx, sheet, idx, x, y, flip) {
    const im = IMG[sheet];
    const sx = (idx % COLS) * 16, sy = Math.floor(idx / COLS) * 16;
    if (flip) {
      ctx.save(); ctx.translate(x + 16, y); ctx.scale(-1, 1);
      ctx.drawImage(im, sx, sy, 16, 16, 0, 0, 16, 16);
      ctx.restore();
    } else {
      ctx.drawImage(im, sx, sy, 16, 16, x, y, 16, 16);
    }
  };

  /* Icône HTML (sprite CSS) — fonctionne même en file:// */
  /* icône d'une culture (les arbres : arbre + fruits) */
  DC.cropIcon = function (c, size, locked) {
    size = size || 32;
    if (!c.tree) return DC.icon('farm', locked ? c.seed : c.item, size);
    const k = size / 16;
    const dots = locked ? '' : [[3, 4], [10, 3], [7, 7], [12, 8], [4, 9]].map(([x, y]) =>
      `<i style="position:absolute;left:${x * k}px;top:${y * k}px;width:${2 * k}px;height:${2 * k}px;background:${c.fruit}"></i>`).join('');
    return `<span style="position:relative;display:inline-block;vertical-align:middle;width:${size}px;height:${size}px;${locked ? 'filter:grayscale(.6) opacity(.7)' : ''}">${DC.icon('town', c.tile, size)}${dots}</span>`;
  };
  DC.icon = function (sheet, idx, size) {
    size = size || 32;
    const k = size / 16;
    const c = idx % COLS, r = Math.floor(idx / COLS);
    return `<span class="ic" style="width:${size}px;height:${size}px;background-image:url(${SHEETS[sheet]});` +
      `background-size:${192 * k}px ${176 * k}px;background-position:-${c * size}px -${r * size}px"></span>`;
  };

  /* ---------- Robots ---------- */
  const ROWS = [
    '.oo.',
    'oaao',
    '.gg.',
    'oooooooooooo',
    'ollllllllllo',
    'olmmmmmmmmdo',
    'omssssssssdo',
    'omseesseesdo',
    'omseesseesdo',
    'omssssssssdo',
    'odmmmmmmmmdo',
    'oooooooooooo',
    '.ommmmmmmmo.',
    '.omdmaamdmo.',
    '..oddddddo..',
    '...oooooo...',
  ];
  const W = 16, H = 18;

  function buildBot(colors, variant) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const pal = {
      o: '#2e2230', l: colors[2], m: colors[0], d: colors[1],
      s: '#1c2a35', e: '#8ff7ff', a: variant === 'sleep' ? '#5a4a50' : '#ff6b6b', g: '#9aa3ad',
    };
    ROWS.forEach((row, y) => {
      const ox = Math.floor((W - row.length) / 2);
      for (let x = 0; x < row.length; x++) {
        let ch = row[x];
        if (ch === '.') continue;
        if (ch === 'e') {
          if (variant === 'sleep') ch = y === 8 ? 'z' : 's';
          else if (variant === 'blink') ch = y === 7 ? 's' : 'e';
          else if (variant === 'happy') ch = y === 7 ? 'e' : ((x === 4 || x === 7) ? 'e' : 's');
        }
        ctx.fillStyle = ch === 'z' ? '#3f6a78' : pal[ch];
        ctx.fillRect(ox + x, y, 1, 1);
      }
    });
    return cv;
  }

  DC.BOT_SPRITES = {};
  DC.buildBotSprites = function () {
    DC.BOTS.forEach(b => {
      DC.BOT_SPRITES[b.id] = {
        idle: buildBot(b.color, 'idle'),
        blink: buildBot(b.color, 'blink'),
        sleep: buildBot(b.color, 'sleep'),
        happy: buildBot(b.color, 'happy'),
      };
    });
  };

  /* Icône HTML d’un robot (canvas généré par nous → toDataURL autorisé) */
  const botUrlCache = {};
  DC.botIcon = function (type, size) {
    size = size || 32;
    if (!botUrlCache[type]) botUrlCache[type] = DC.BOT_SPRITES[type].idle.toDataURL();
    return `<img class="bot-ic" src="${botUrlCache[type]}" width="${size * W / 16}" height="${size * H / 16}" alt="">`;
  };
})();
