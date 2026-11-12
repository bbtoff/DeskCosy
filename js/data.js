/* DeskCosy — données du jeu */
window.DC = window.DC || {};

DC.SAVE_KEY = 'deskcosy.save.v1';

/* Cultures. Indices de tuiles dans assets/img/farm.png (12 colonnes). */
DC.CROPS = [
  { id: 'carotte',   name: 'Carotte',   stages: [4, 5, 6],    item: 8,  seed: 9,  crate: 11, grow: 20,  sell: 4,   energy: 3,  res: null },
  { id: 'navet',     name: 'Navet',     stages: [16, 17, 18], item: 20, seed: 21, crate: 23, grow: 36,  sell: 7,   energy: 3,  res: 'agro1' },
  { id: 'ble',       name: 'Blé',       stages: [64, 65, 66], item: 68, seed: 69, crate: 71, grow: 45,  sell: 6,   energy: 9,  res: 'agro2' },
  { id: 'laitue',    name: 'Laitue',    stages: [52, 53, 54], item: 56, seed: 57, crate: 59, grow: 70,  sell: 18,  energy: 6,  res: 'agro4' },
  { id: 'mais',      name: 'Maïs',      stages: [28, 29, 30], item: 32, seed: 33, crate: 35, grow: 110, sell: 40,  energy: 16, res: 'agro6' },
  { id: 'tomate',    name: 'Tomate',    stages: [40, 41, 42], item: 44, seed: 45, crate: 47, grow: 170, sell: 85,  energy: 14, res: 'agro8' },
  { id: 'tournesol', name: 'Tournesol', stages: [81, 80, 83], item: 83, seed: 81, crate: 96, grow: 260, sell: 210, energy: 45, res: 'agro10' },
];
DC.CROP = {};
DC.CROPS.forEach(c => DC.CROP[c.id] = c);

/* Robots */
DC.BOTS = [
  { id: 'arrose', name: 'Arrosebot', jobs: ['water'],                    cost: 20,   color: ['#5fb4ef', '#2f6fa8', '#a8dcff'], tool: 84, desc: 'Arrose les cultures assoiffées.' },
  { id: 'plante', name: 'Plantobot', jobs: ['plant'],                    cost: 35,   color: ['#7ccf5a', '#3f8a3a', '#c4f0a2'], tool: 9,  desc: 'Sème les parcelles vides.' },
  { id: 'cueille', name: 'Cueillobot', jobs: ['harvest'],                cost: 55,   color: ['#f39a4a', '#b05a26', '#ffd0a0'], tool: 88, desc: 'Récolte ce qui est mûr.' },
  { id: 'poly',   name: 'Polybot',   jobs: ['harvest', 'plant', 'water'], cost: 5000, color: ['#b48ae8', '#6c47a8', '#e3d1ff'], tool: 86, desc: 'Sait tout faire, priorité à la récolte.', res: 'robo8' },
];
DC.BOT = {};
DC.BOTS.forEach(b => DC.BOT[b.id] = b);
DC.BOT_COST_GROWTH = 1.32;
DC.BOT_MAX_LVL = 10;
/* Batteries des robots : 1 unité de batterie = 0,3 ⚡ du réservoir */
DC.BAT_BASE = 10;           // capacité de base
DC.BAT_ACTION = 1;          // coût d'une action
DC.BAT_MOVE = 0.07;         // coût par case parcourue
DC.BAT_LOW = 2.2;           // seuil de retour à la borne
DC.BAT_TO_TANK = 0.3;       // ⚡ du réservoir par unité rechargée
DC.CHARGE_RATE = 1.2;       // unités / seconde
DC.CHARGE_SLOTS = 2;        // bornes de départ

DC.BOT_NAMES = [
  'Boulon', 'Bip', 'Bidule', 'Pixel', 'Turbine', 'Gaston', 'Zinzin', 'Biscotte', 'Grelot', 'Tournevis',
  'Patate', 'Ciboulette', 'Radis', 'Pépin', 'Brindille', 'Noisette', 'Coquelicot', 'Dynamo', 'Ressort',
  'Ampoule', 'Volt', 'Watt', 'Diode', 'Cosinus', 'Babiole', 'Moustique', 'Clafoutis', 'Praline', 'Mirabelle',
  'Trognon', 'Pistache', 'Crumble', 'Galette', 'Chouquette', 'Bigoudi', 'Pétunia', 'Navette', 'Loupiote',
];

/* Améliorations globales */
DC.UPGRADES = [
  { id: 'engrais',  name: 'Engrais maison',   icon: ['farm', 74],  max: 15, base: 90,  growth: 2.35, desc: l => `Croissance +${l * 8}% (prochain : +${(l + 1) * 8}%)` },
  { id: 'reservoir', name: 'Grosse batterie', icon: ['farm', 85],  max: 15, base: 60,  growth: 2.2,  desc: l => `Réservoir d’énergie ${DC.energyCapFor(l)} → ${DC.energyCapFor(l + 1)}` },
  { id: 'compost',  name: 'Composteur turbo', icon: ['farm', 112], max: 15, base: 110, growth: 2.3,  desc: l => `Énergie du compost +${l * 6}% (prochain : +${(l + 1) * 6}%)` },
  { id: 'marche',   name: 'Étal du marché',   icon: ['farm', 11],  max: 15, base: 140, growth: 2.35, desc: l => `Prix de vente +${l * 8}% (prochain : +${(l + 1) * 8}%)` },
];
DC.UPG = {};
DC.UPGRADES.forEach(u => DC.UPG[u.id] = u);
DC.energyCapFor = l => 40 + l * 40 + Math.floor(l * l * 6);

DC.PLOT_START = 4;
DC.PLOT_MAX = 64;
DC.plotCost = n => Math.floor(12 * Math.pow(1.27, n - DC.PLOT_START));

/* Zones de terrain : 8 parcelles chacune, à acheter (prix + palier requis) */
DC.ZONE_SIZE = 8;
DC.ZONES = [
  { cost: 0, lvl: 1 }, { cost: 1500, lvl: 3 }, { cost: 15000, lvl: 5 }, { cost: 150000, lvl: 8 },
  { cost: 1200000, lvl: 11 }, { cost: 8000000, lvl: 14 }, { cost: 50000000, lvl: 17 }, { cost: 250000000, lvl: 20 },
];

/* Paliers de la ferme (XP : récoltes et recherches) */
DC.LVL_MAX = 25;          // sans la Vallée
DC.LVL_MAX2 = 40;         // avec la Vallée
DC.xpFor = L => L < 25
  ? Math.round(Math.max(100 * Math.pow(1.5, L - 1), 40 * Math.pow(1.62, L - 1)))
  : Math.round(1.0e6 * Math.pow(1.06, L - 25));   // XP pour passer de L à L+1
DC.maxBotsFor = L => Math.min(30, 3 + L + Math.floor(L / 5));
DC.upgCapFor = L => L + 1;                                  // niveau max des améliorations
DC.botLvlCapFor = L => Math.min(10, L + 1);
DC.TIER_LVL = [1, 3, 6, 10, 14, 25];                             // palier requis par niveau de recherche
DC.cropXp = c => Math.max(1, Math.round(c.grow / 20));
/* effort : les grosses cultures fatiguent davantage les robots (carotte 1 → tournesol 4) */
DC.cropEffort = c => 1 + (c.grow - 20) / 80;

/* Arbre de recherche : coût en pièces + durée réelle (secondes), une à la fois */
DC.BRANCHES = [
  { id: 'agro', name: 'Agronomie', icon: '🌱' },
  { id: 'robo', name: 'Robotique', icon: '🤖' },
  { id: 'ener', name: 'Énergie',   icon: '⚡' },
  { id: 'com',  name: 'Commerce',  icon: '🪙' },
];
DC.RESEARCH = [
  { id: 'agro1',  b: 'agro', t: 1, name: 'Navets',            cost: 60,     time: 60,   req: [],                 desc: 'Débloque le navet.' },
  { id: 'agro2',  b: 'agro', t: 1, name: 'Blé',               cost: 300,    time: 240,   req: ['agro1'],          desc: 'Débloque le blé (riche en énergie).' },
  { id: 'agro3',  b: 'agro', t: 2, name: 'Engrais I',         cost: 2500,    time: 1800,  req: ['agro1'],          desc: 'Croissance +15%.' },
  { id: 'agro4',  b: 'agro', t: 2, name: 'Laitue',            cost: 4000,   time: 2700,  req: ['agro2'],          desc: 'Débloque la laitue.' },
  { id: 'agro5',  b: 'agro', t: 2, name: 'Paillage',          cost: 6000,   time: 3000,  req: ['agro3'],          desc: '25% de chance que la terre reste humide.' },
  { id: 'agro6',  b: 'agro', t: 3, name: 'Maïs',              cost: 40000,   time: 10800,  req: ['agro4'],          desc: 'Débloque le maïs.' },
  { id: 'agro7',  b: 'agro', t: 3, name: 'Engrais II',        cost: 60000,   time: 14400,  req: ['agro5'],          desc: 'Croissance +25%.' },
  { id: 'agro8',  b: 'agro', t: 4, name: 'Tomate',            cost: 800000,  time: 32400, req: ['agro6'],          desc: 'Débloque la tomate.' },
  { id: 'agro9',  b: 'agro', t: 4, name: 'Main verte',        cost: 1200000,  time: 36000, req: ['agro7'],          desc: '15% de récoltes doubles.' },
  { id: 'agro10', b: 'agro', t: 5, name: 'Tournesol',         cost: 20000000, time: 93600, req: ['agro8'],          desc: 'Débloque le tournesol.' },
  { id: 'agro11', b: 'agro', t: 5, name: 'Pousses dorées',    cost: 40000000, time: 108000, req: ['agro9'],          desc: 'Cultures dorées (×10) : 1% → 3%.' },

  { id: 'robo1',  b: 'robo', t: 1, name: 'Batteries II',      cost: 200,    time: 180,   req: [],                 desc: 'Batterie des robots +50%.' },
  { id: 'robo2',  b: 'robo', t: 1, name: 'Moteurs',           cost: 250,    time: 180,   req: [],                 desc: 'Robots 15% plus rapides.' },
  { id: 'robo3',  b: 'robo', t: 2, name: 'Borne double',      cost: 3500,    time: 2400,  req: ['robo1'],          desc: '+1 borne de recharge.' },
  { id: 'robo4',  b: 'robo', t: 2, name: 'Charge rapide',     cost: 5000,    time: 3000,  req: ['robo1'],          desc: 'Recharge 60% plus rapide.' },
  { id: 'robo5',  b: 'robo', t: 3, name: 'Servos légers',     cost: 60000,   time: 14400,  req: ['robo2'],          desc: 'Actions : −25% de batterie.' },
  { id: 'robo6',  b: 'robo', t: 3, name: 'Batteries III',     cost: 80000,   time: 14400,  req: ['robo3'],          desc: 'Batterie des robots +100%.' },
  { id: 'robo7',  b: 'robo', t: 4, name: 'Station de charge', cost: 1500000,  time: 36000, req: ['robo6', 'robo4'], desc: '+2 bornes de recharge.' },
  { id: 'robo8',  b: 'robo', t: 4, name: 'Polybot',           cost: 1000000,  time: 28800, req: ['robo5'],          desc: 'Débloque le Polybot, qui sait tout faire.' },
  { id: 'robo9',  b: 'robo', t: 5, name: 'IA d’essaim',       cost: 60000000, time: 108000, req: ['robo7', 'robo8'], desc: 'Robots +30% vitesse, travail 30% plus court.' },

  { id: 'ener1',  b: 'ener', t: 1, name: 'Composteur II',     cost: 150,    time: 120,   req: [],                 desc: 'Énergie du compost +25%.' },
  { id: 'ener2',  b: 'ener', t: 2, name: 'Cuve',              cost: 3000,    time: 2100,  req: ['ener1'],          desc: 'Réservoir d’énergie +100.' },
  { id: 'ener3',  b: 'ener', t: 2, name: 'Panneaux solaires', cost: 4500,    time: 2700,  req: ['ener1'],          desc: 'Production d’énergie passive ×4.' },
  { id: 'ener4',  b: 'ener', t: 3, name: 'Méthaniseur',       cost: 45000,   time: 10800,  req: ['ener2'],          desc: 'Énergie du compost +50%.' },
  { id: 'ener5',  b: 'ener', t: 4, name: 'Super-batterie',    cost: 900000,  time: 28800, req: ['ener4'],          desc: 'Réservoir d’énergie +300.' },
  { id: 'ener6',  b: 'ener', t: 5, name: 'Fusion de navets',  cost: 30000000,  time: 93600, req: ['ener5', 'ener3'], desc: 'Compost +100%, énergie passive ×2.' },

  { id: 'com1',   b: 'com',  t: 1, name: 'Étal en bois',      cost: 150,    time: 120,   req: [],                 desc: 'Prix de vente +15%.' },
  { id: 'com2',   b: 'com',  t: 2, name: 'Station météo',     cost: 5000,    time: 3600,  req: ['com1'],           desc: 'Pluies plus fréquentes.' },
  { id: 'com3',   b: 'com',  t: 3, name: 'Marché du village', cost: 50000,   time: 10800,  req: ['com1'],           desc: 'Prix de vente +30%.' },
  { id: 'com4',   b: 'com',  t: 3, name: 'Facteur',           cost: 70000,   time: 14400,  req: ['com2'],           desc: 'Cadeaux deux fois plus fréquents et généreux.' },
  { id: 'com5',   b: 'com',  t: 4, name: 'Export',            cost: 1500000,  time: 36000, req: ['com3'],           desc: 'Prix de vente +50%.' },
  { id: 'com6',   b: 'com',  t: 5, name: 'Coopérative',       cost: 60000000, time: 108000, req: ['com5'],           desc: 'Le bonus de confort est doublé.' },
];
/* Branche de la Vallée d'automne (niveau 6) */
DC.RESEARCH.push(
  { id: 'val1', b: 'vallee', t: 6, name: 'Irrigation',          cost: 6e8,   time: 36 * 3600, req: [],               desc: 'Vallée : 40% de chance que la terre reste humide.' },
  { id: 'val2', b: 'vallee', t: 6, name: 'Désherbage bio',      cost: 1e9,   time: 36 * 3600, req: [],               desc: 'Vallée : deux fois moins de mauvaises herbes.' },
  { id: 'val3', b: 'vallee', t: 6, name: 'Chenilles tout-terrain', cost: 6e9, time: 40 * 3600, req: ['val1'],    desc: 'Vallée : les pentes ne fatiguent plus les robots.' },
  { id: 'val4', b: 'vallee', t: 6, name: 'Serres',              cost: 1e10,  time: 48 * 3600, req: ['val2'],         desc: 'Vallée : croissance ×1,5.' },
  { id: 'val5', b: 'vallee', t: 6, name: 'Grand marché',        cost: 2e10, time: 48 * 3600, req: ['val3', 'val4'], desc: 'Vallée : prix de vente ×1,5.' },
  { id: 'val6', b: 'vallee', t: 6, name: 'Racines profondes',   cost: 4e10,  time: 60 * 3600, req: ['val5'],         desc: 'Vallée : récoltes doublées.' },
);
DC.BRANCHES.push({ id: 'vallee', name: 'Vallée d’automne', icon: '🍂' });
DC.RES = {};
DC.RESEARCH.forEach(r => DC.RES[r.id] = r);
DC.RESEARCH_BASE = DC.RESEARCH.filter(r => r.b !== 'vallee');

/* Régions : la Prairie de départ, puis la Vallée d'automne (fin de partie) */
DC.REGIONS = [
  { key: 'prairie', name: 'Prairie', icon: '🌿', zones: DC.ZONES, grow: 1, sell: 1, xp: 1 },
  {
    key: 'vallee', name: 'Vallée d’automne', icon: '🍂', grow: 0.5, sell: 10, xp: 4,
    weeds: true, dryMid: true, slope: 1.5, cost: 4e8,
    zones: [
      { cost: 0, lvl: 25 }, { cost: 1.5e9, lvl: 27 }, { cost: 3e9, lvl: 29 }, { cost: 5e9, lvl: 31 },
      { cost: 8e9, lvl: 33 }, { cost: 1.2e10, lvl: 35 }, { cost: 1.8e10, lvl: 37 }, { cost: 2.5e10, lvl: 39 },
    ],
    desc: 'Terre fertile mais exigeante : pousse lente, sol qui sèche à mi-croissance, mauvaises herbes, pentes fatigantes. En échange : ventes ×10 et XP ×4.',
  },
];
DC.REG = {};
DC.REGIONS.forEach((r, i) => { r.i = i; DC.REG[r.key] = r; });

/* Décorations : confort = bonus de pièces. */
DC.DECOR = [
  { id: 'panneau',  name: 'Panneau',          sheet: 'town', tile: 83,  comfort: 1, cost: 15,   max: 1,  desc: 'Un joli panneau pour la ferme.' },
  { id: 'fleurs',   name: 'Fleurs sauvages',  sheet: 'town', tile: 2,   comfort: 1, cost: 25,   max: 12, desc: 'Ça sent bon le printemps.' },
  { id: 'foin',     name: 'Botte de foin',    sheet: 'farm', tile: 96,  comfort: 1, cost: 60,   max: 6 },
  { id: 'tonneau',  name: 'Tonneau',          sheet: 'farm', tile: 85,  comfort: 1, cost: 70,   max: 6 },
  { id: 'champi',   name: 'Champignons',      sheet: 'town', tile: 29,  comfort: 2, cost: 110,  max: 6 },
  { id: 'buisson',  name: 'Buisson à baies',  sheet: 'farm', tile: 78,  comfort: 2, cost: 160,  max: 8 },
  { id: 'arbre',    name: 'Arbre',            sheet: 'town', tile: [16, 28, 5], comfort: 3, cost: 220, max: 12 },
  { id: 'automne',  name: 'Arbre d’automne',  sheet: 'town', tile: [3, 15, 27], comfort: 3, cost: 260, max: 8 },
  { id: 'poule',    name: 'Poule',            sheet: 'farm', tile: 122, comfort: 5, cost: 450,  max: 6,  animal: true, desc: 'Elle se promène et picore.' },
  { id: 'ruche',    name: 'Ruche',            sheet: 'town', tile: 94,  comfort: 6, cost: 1800, max: 3,  desc: 'Les abeilles pollinisent : croissance +4% chacune.' },
  { id: 'mouton',   name: 'Mouton',           sheet: 'farm', tile: 120, comfort: 8, cost: 1400, max: 4,  animal: true },
  { id: 'vache',    name: 'Vache',            sheet: 'farm', tile: 121, comfort: 12, cost: 4200, max: 3, animal: true },
  { id: 'puits',    name: 'Puits',            sheet: 'town', tile: 104, comfort: 15, cost: 7500, max: 1, desc: 'Les arroseurs travaillent 25% plus vite.' },
  { id: 'cible',    name: 'Épouvantail-cible', sheet: 'town', tile: 95, comfort: 10, cost: 12000, max: 2, desc: 'Fait fuir les corbeaux. Cosy.' },
];
DC.DEC = {};
DC.DECOR.forEach(d => DC.DEC[d.id] = d);
DC.decorCost = (d, n) => Math.floor(d.cost * Math.pow(1.45, n));

/* Objectifs (dans l'ordre). check(g) renvoie [valeur, cible]. */
DC.QUESTS = [
  { id: 'q1',  text: 'Récolter 5 cultures',            check: g => [g.stats.harvests, 5],      reward: 15 },
  { id: 'q2',  text: 'Acheter un Arrosebot',           check: g => [g.countBots('arrose'), 1], reward: 15 },
  { id: 'q3',  text: 'Acheter un Plantobot',           check: g => [g.countBots('plante'), 1], reward: 25 },
  { id: 'q4',  text: 'Acheter un Cueillobot',          check: g => [g.countBots('cueille'), 1], reward: 40 },
  { id: 'q5',  text: 'Posséder 8 parcelles',           check: g => [g.regionPlots(0), 8],      reward: 60 },
  { id: 'q5b', text: 'Terminer une recherche',         check: g => [g.researchCount(), 1],     reward: 40 },
  { id: 'q6',  text: 'Débloquer le navet',             check: g => [g.s.unlocked.navet ? 1 : 0, 1], reward: 60 },
  { id: 'q6b', text: 'Atteindre le palier 2',          check: g => [g.s.level, 2],             reward: 80 },
  { id: 'q6c', text: 'Acheter la zone 2',              check: g => [g.regionZones(0), 2],             reward: 150 },
  { id: 'q7',  text: 'Récolter 100 cultures',          check: g => [g.stats.harvests, 100],    reward: 120 },
  { id: 'q8',  text: 'Acheter une décoration',         check: g => [g.decorCount(), 1],        reward: 50 },
  { id: 'q9',  text: 'Atteindre 10 de confort',        check: g => [g.comfort(), 10],          reward: 250 },
  { id: 'q10', text: 'Avoir 6 robots',                 check: g => [g.regionBots(0), 6],       reward: 300 },
  { id: 'q11', text: 'Débloquer le blé',               check: g => [g.s.unlocked.ble ? 1 : 0, 1], reward: 200 },
  { id: 'q12', text: 'Un robot niveau 3',              check: g => [g.maxBotLevel(), 3],       reward: 300 },
  { id: 'q13', text: 'Posséder 16 parcelles',          check: g => [g.regionPlots(0), 16],     reward: 500 },
  { id: 'q14', text: 'Débloquer la laitue',            check: g => [g.s.unlocked.laitue ? 1 : 0, 1], reward: 500 },
  { id: 'q15', text: 'Récolter une culture dorée',     check: g => [g.stats.golden, 1],        reward: 800 },
  { id: 'q16', text: 'Gagner 10 000 pièces',           check: g => [g.stats.earned, 10000],    reward: 1200 },
  { id: 'q17', text: 'Débloquer le maïs',              check: g => [g.s.unlocked.mais ? 1 : 0, 1], reward: 1500 },
  { id: 'q18', text: 'Avoir 12 robots',                check: g => [g.regionBots(0), 12],      reward: 2500 },
  { id: 'q18b', text: 'Terminer 10 recherches',        check: g => [g.researchCount(), 10],    reward: 3000 },
  { id: 'q18c', text: 'Atteindre le palier 10',        check: g => [g.s.level, 10],            reward: 5000 },
  { id: 'q19', text: 'Atteindre 40 de confort',        check: g => [g.comfort(), 40],          reward: 4000 },
  { id: 'q20', text: 'Débloquer la tomate',            check: g => [g.s.unlocked.tomate ? 1 : 0, 1], reward: 6000 },
  { id: 'q21', text: 'Posséder 32 parcelles',          check: g => [g.regionPlots(0), 32],     reward: 10000 },
  { id: 'q22', text: 'Acheter un Polybot',             check: g => [g.countBots('poly'), 1],   reward: 12000 },
  { id: 'q23', text: 'Débloquer le tournesol',         check: g => [g.s.unlocked.tournesol ? 1 : 0, 1], reward: 30000 },
  { id: 'q24', text: 'Gagner 1 000 000 pièces',        check: g => [g.stats.earned, 1e6],      reward: 100000 },
  { id: 'q25', text: 'Commencer une nouvelle saison',  check: g => [g.s.seasons, 1],           reward: 5000 },
  { id: 'q25b', text: 'Terminer toutes les recherches', check: g => [g.researchCount('base'), DC.RESEARCH_BASE.length], reward: 200000 },
  { id: 'q26', text: 'Posséder 64 parcelles',          check: g => [g.regionPlots(0), 64],     reward: 250000 },
  { id: 'q27', text: 'Avoir 30 robots',                check: g => [g.regionBots(0), 30],      reward: 500000 },
  { id: 'v1', text: 'Découvrir la Vallée d’automne',     check: g => [g.s.regions.length, 2],    reward: 5e8 },
  { id: 'v2', text: 'Vallée : 16 parcelles',             check: g => [g.regionPlots(1), 16],     reward: 2e9 },
  { id: 'v3', text: 'Atteindre le palier 30',            check: g => [g.s.level, 30],            reward: 1e10 },
  { id: 'v4', text: 'Vallée : 20 robots',                check: g => [g.regionBots(1), 20],      reward: 3e10 },
  { id: 'v5', text: 'Vallée : 64 parcelles',             check: g => [g.regionPlots(1), 64],     reward: 1e12 },
  { id: 'v6', text: 'Terminer les recherches de la Vallée', check: g => [g.researchCount('vallee'), 6], reward: 2e12 },
  { id: 'v7', text: 'Atteindre le palier 40',            check: g => [g.s.level, 40],            reward: 5e12 },
];

DC.PRESTIGE_MIN = 250000;
DC.goldenSeedsFor = earned => Math.floor(Math.sqrt(earned / 25000));

/* Formatage des nombres à la française */
DC.fmt = function (n) {
  if (!isFinite(n)) return '∞';
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('fr-FR');
  const u = [['', 1], ['k', 1e3], ['M', 1e6], ['Md', 1e9], ['T', 1e12], ['Qa', 1e15]];
  let i = u.length - 1;
  while (i > 0 && n < u[i][1]) i--;
  const v = n / u[i][1];
  return (v < 100 ? v.toFixed(1).replace('.', ',') : Math.floor(v)) + ' ' + u[i][0];
};
DC.fmtTime = function (s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '');
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h + ' h' + (m ? ' ' + m + ' min' : '');
};
