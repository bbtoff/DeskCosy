/* DeskCosy — sons (Kenney CC0) et musique (TinyWorlds CC0) */
(function () {
  const SFX = {
    click: 'click_002', select: 'select_001', buy: 'confirmation_002', error: 'error_004',
    levelup: 'maximize_006', plant: 'drop_002', harvest: 'pluck_001', open: 'open_003', close: 'close_002',
    water: 'glass_002', quest: 'bong_001', toggle: 'switch_002', coins: 'handleCoins', coins2: 'handleCoins2',
    bot: 'metalClick', chop: 'chop', step: 'footstep02', latch: 'metalLatch',
  };
  const pools = {};
  let music = null;
  const A = DC.audio = {
    sfxVol: 0.6, musicVol: 0.35, unlocked: false, lastPlay: {},
  };

  A.init = function (opts) {
    A.sfxVol = opts.sfx; A.musicVol = opts.music;
    Object.entries(SFX).forEach(([k, f]) => {
      pools[k] = { list: [], i: 0, src: 'assets/sfx/' + f + '.ogg' };
    });
    music = new Audio('assets/music/happy_adventure.mp3');
    music.loop = true;
    music.volume = A.musicVol;
  };

  A.unlock = function () {
    if (A.unlocked) return;
    A.unlocked = true;
    if (A.musicVol > 0) music.play().catch(() => { A.unlocked = false; });
  };

  A.play = function (name, vol, minGap) {
    if (!A.unlocked || A.sfxVol <= 0) return;
    const p = pools[name];
    if (!p) return;
    const now = performance.now();
    if (minGap && A.lastPlay[name] && now - A.lastPlay[name] < minGap) return;
    A.lastPlay[name] = now;
    let a = p.list[p.i];
    if (!a) { a = new Audio(p.src); p.list[p.i] = a; }
    p.i = (p.i + 1) % 4;
    try {
      a.currentTime = 0;
      a.volume = Math.max(0, Math.min(1, A.sfxVol * (vol == null ? 1 : vol)));
      a.play().catch(() => {});
    } catch (e) { /* ignore */ }
  };

  A.setMusic = function (v) {
    A.musicVol = v;
    if (!music) return;
    music.volume = v;
    if (v > 0 && A.unlocked && music.paused) music.play().catch(() => {});
    if (v <= 0) music.pause();
  };
  A.setSfx = function (v) { A.sfxVol = v; };
})();
