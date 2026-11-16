/* ============================================================================
 * M49：鲸鱼街南头的「鲸鱼码头」（WHALE PIER）
 *
 *   妈妈小时候最想玩的那种小镇里，一定有一个地方能坐着发呆、能钓上点什么。
 *   所以这一次不做店，做一条伸进湖里的木栈道。
 *
 *   能玩的：
 *     ① 走到栈道尽头，点水面 → 抛竿（浮标「咚」一下落水）
 *     ② 等 1.6~4.2 秒（夜里要久一点）→ 浮标猛沉 + 头顶冒「！」
 *     ③ 0.85 秒内再点一下（或按空格）→ 收杆
 *     ④ 钓上来 6 种东西：小银鱼 / 小河豚 / 彩虹鳟 / 小鲸鱼（稀有，只能放生）
 *        还有旧靴子和空罐子（垃圾，顺手扔桶里）
 *     ⑤ 鱼簍最多 8 条，点鱼簍一起卖给收鱼的船（真加零花钱）
 *     ⑥ 也可以「留一条带回家」—— 家里餐桌的盘子上就多一条鱼
 *     ⑦ 渔获图鉴存在 localStorage（xd_fishing_v1），挂在屋墙的小黑板上
 *
 *   位置：世界坐标 x = 200 ~ 216、z = -3.2 ~ 3.2（邮局 160~168、花店 180~188）
 *   声音：sfx 的 splash / pop / blip / ding / cash / pickup / bell / cat
 * ==========================================================================*/
window.XD = window.XD || {};
XD.Fishing = (function () {
  'use strict';

  const X0 = 200.0, X1 = 216.0;
  const DECK = { x0: 200.26, x1: 204.66, z0: -2.72, z1: 2.72 };
  const HUT = { x0: 198.46, x1: 200.26, z0: -2.50, z1: 0.70, h: 2.50 };
  const WATER_Y = -0.46;
  const BOB = { x: 206.90, z: 0.25 };          // 浮标默认落点（要够远，不然被栈道沿挡住）
  const RACK = { x: 200.86, z: 2.24 };         // 竿架
  const BUCKET = { x: 200.80, z: 1.16 };       // 鱼簍
  const CAT = { x: 201.92, z: -2.08 };         // 睡在木箱上的猫
  const BOARD = { x: 200.40, y: 1.52, z: -2.00 };  // M49 渔获黑板（挂在屋墙上）
  const BOAT = { x: 206.86, z: 2.28 };
  const RODTIP = { x: 204.40, y: 0.86, z: 0.92 };
  const MAX_FISH = 8;

  const LS = 'xd_fishing_v1';

  /* 六种渔获：w = 权重（夜里有加成），len = 身长范围（米） */
  const FISH = [
    { k: 'silver', name: '小银鱼', price: 4, w: 40, len: [0.20, 0.30],
      body: 0xcfe0e8, fin: 0xa9c4d0, belly: 0xf2f7f8,
      line: '银亮亮的一条，放进簍里还在蹦' },
    { k: 'puffer', name: '小河豚', price: 8, w: 24, len: [0.18, 0.26],
      body: 0xe8d6a2, fin: 0xcbb27a, belly: 0xf6eccb,
      line: '一上岸就鼓成一个球，圆滚滚地瞪着我' },
    { k: 'trout', name: '彩虹鳟', price: 12, w: 14, len: [0.30, 0.42],
      body: 0xd98fa0, fin: 0xf0c0c8, belly: 0xf7dde2,
      line: '背上有彩虹一样的纹 —— 这条有点舍不得卖' },
    { k: 'whale', name: '小鲸鱼', price: 0, w: 3, len: [0.32, 0.40],
      body: 0x4f7f9e, fin: 0x3a5f7d, belly: 0xd8e6ec, rare: true,
      line: '……是一条小鲸鱼。它眨眨眼，尾巴轻轻拍了一下水' },
    { k: 'boot', name: '旧靴子', price: 0, w: 11, len: [0.30, 0.34],
      body: 0x6b5a4a, fin: 0x4f4234, belly: 0x7d6b58, junk: true,
      line: '一只旧靴子……里面还存着半靴子湖水' },
    { k: 'can', name: '空罐子', price: 0, w: 8, len: [0.14, 0.18],
      body: 0xb9c2c8, fin: 0x8d979c, belly: 0xd6dde1, junk: true,
      line: '一个空罐子。顺手扔进旁边的垃圾桶了' }
  ];

  let root = null, scene = null, interact = null, sfx = null, tip = null, camera = null;
  let isFishNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let walletOf = function () { return 0; };
  let earn = function () { return 0; };
  let venueOf = function () { return 'home'; };

  let t = 0;
  const matCache = {};
  const fr = {
    sky: null, skyTex: null, skyDay: null, skyNight: null,
    water: null, waterTex: null, shine: null,
    amb: null, hemi: null, sun: null, moon: null,
    lanterns: [], lampLights: [], bulbMats: [],
    bobber: null, bang: null, line: null, lineGeo: null,
    rod: null, shadowFish: [], rings: [], pads: [],
    catTail: null, catBody: null, reelGlow: null,
    boardTex: null, boardCanvas: null, boardCtx: null,
    caught: null, homeFish: null, homePlate: null
  };

  const st = {
    phase: 'idle',        // idle | fly | wait | bite | land | hold
    pt: 0,                // 当前阶段计时
    biteIn: 0,            // 还有多久咬钩
    win: 0,               // 咬钩窗口还剩多久
    kind: null,           // 咬上的鱼
    size: 0,              // 这鱼多大（米）
    basket: [],           // 鱼簍 [{k, price, size}]
    total: 0,             // 一共钓到几条
    kinds: {},            // 图鉴
    best: 0,              // 最大的一条
    junk: 0,              // 捡了几次垃圾
    whales: 0,            // 放生过几条小鲸鱼
    home: 0               // 家里盘子上有没有鱼（1 = 有）
  };

  /* ============================ 小工具 ============================ */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  function std(hex, rough, metal) {
    const r = (rough === undefined) ? 0.9 : rough;
    const m = metal || 0;
    const key = hex + '|' + r + '|' + m;
    if (matCache[key]) return matCache[key];
    const mat = new THREE.MeshStandardMaterial({ color: col(hex), roughness: r, metalness: m });
    matCache[key] = mat;
    return mat;
  }

  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }

  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }

  function plane(w, h, mat, x, y, z, parent, rx, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }

  function sph(r, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, seg ? Math.round(seg * 0.7) : 8), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || root).add(m);
    return m;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function font(size, bold) {
    return (bold ? '700 ' : '400 ') + size + 'px "Microsoft YaHei","PingFang SC","Heiti SC",sans-serif';
  }

  /* ============================ 存档 ============================ */
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || 'null');
      if (!s) return;
      st.total = s.total | 0;
      st.junk = s.junk | 0;
      st.whales = s.whales | 0;
      st.best = +s.best || 0;
      st.kinds = (s.kinds && typeof s.kinds === 'object') ? s.kinds : {};
      st.home = s.home | 0;
    } catch (e) { /* 无所谓 */ }
  }

  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        total: st.total, junk: st.junk, whales: st.whales,
        best: st.best, kinds: st.kinds, home: st.home
      }));
    } catch (e) { /* 无所谓 */ }
  }

  /* ============================ 建模：水面 ============================ */
  function makeSky() {
    const day = canvasTex(64, 256, function (g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#7db9d6');
      gr.addColorStop(0.45, '#a8d3e2');
      gr.addColorStop(0.78, '#dceef0');
      gr.addColorStop(1, '#f6efe0');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // 一层很淡的噪点：不然这么大的天顶会有色带
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
    });
    const night = canvasTex(128, 256, function (g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#080f1e');
      gr.addColorStop(0.40, '#16263f');
      gr.addColorStop(0.72, '#2a3f5c');
      gr.addColorStop(1, '#3d5470');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = 'rgba(150,180,220,.06)';
        g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
      // 星星：上半部分多一些
      for (let i = 0; i < 150; i++) {
        const a = 0.18 + Math.random() * 0.72;
        const r = Math.random() < 0.86 ? 1 : 2;
        g.fillStyle = 'rgba(255,246,220,' + a.toFixed(2) + ')';
        g.fillRect(Math.random() * w, Math.random() * h * 0.62, r, r);
      }
      // 一条很淡的银河
      g.globalAlpha = 0.10;
      g.fillStyle = '#cfd8ee';
      for (let i = 0; i < 220; i++) {
        g.fillRect(Math.random() * w, h * (0.12 + Math.random() * 0.22), 2, 1);
      }
      g.globalAlpha = 1;
    });
    fr.skyDay = day;
    fr.skyNight = night;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(70, 20, 14),
      new THREE.MeshBasicMaterial({ map: day, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.position.set(206, 0, 0);
    dome.name = 'pier-sky';
    root.add(dome);
    fr.sky = dome;
    fr.skyTex = day;

    // 月亮（夜里才露出来）
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbf3d8, fog: false })
    );
    moon.position.set(214, 11.5, -13);
    moon.visible = false;
    root.add(moon);
    fr.moon = moon;
    // 月亮外面一圈淡淡的光
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: canvasTex(128, 128, function (g, w, h) {
        const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,248,220,.55)');
        gr.addColorStop(0.45, 'rgba(210,225,255,.16)');
        gr.addColorStop(1, 'rgba(180,200,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }),
      transparent: true, depthWrite: false, fog: false
    }));
    halo.scale.set(9, 9, 1);
    halo.position.set(214, 11.5, -13);
    halo.visible = false;
    root.add(halo);
    fr.moonHalo = halo;
  }

  function makeWater() {
    const tex = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#4c8ba3'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const rx = 8 + Math.random() * 26, ry = 2 + Math.random() * 5;
        const a = 0.04 + Math.random() * 0.1;
        g.fillStyle = 'rgba(214,240,246,' + a.toFixed(3) + ')';
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(30,72,92,.16)';
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 20, 2 + Math.random() * 4, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 18);
    fr.waterTex = tex;

    const wMat = new THREE.MeshStandardMaterial({
      map: tex, color: col(0xa9d2de), roughness: 0.18, metalness: 0.28,
      transparent: true, opacity: 0.94
    });
    const water = plane(11.8, 44, wMat, 210.4, WATER_Y, 0, root, -Math.PI / 2);
    water.name = 'pier-water';
    fr.water = water;

    // 水面上一层薄薄的高光条（会慢慢漂，看起来水是活的）
    const shineTex = canvasTex(128, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const y = Math.random() * h;
        const grd = g.createLinearGradient(0, y, w, y);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, 'rgba(255,255,255,' + (0.1 + Math.random() * 0.25).toFixed(2) + ')');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, y, w, 1 + Math.random() * 2);
      }
    });
    shineTex.wrapS = shineTex.wrapT = THREE.RepeatWrapping;
    shineTex.repeat.set(3, 10);
    const shine = plane(11.4, 43, new THREE.MeshBasicMaterial({
      map: shineTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false
    }), 210.4, WATER_Y + 0.012, 0, root, -Math.PI / 2);
    fr.shine = shine;

    // 对岸：草地 + 一条浅色沙滩，别做成一道黑墙
    box(2.6, 0.5, 44, std(0x7f9a62, 0.97), 217.2, WATER_Y + 0.24, 0, root);
    box(0.55, 0.34, 44, std(0xdccfa8, 0.96), 215.9, WATER_Y + 0.16, 0, root);
    // 草丛里几块石头
    [[216.4, -6.2, 0.5], [216.1, 3.4, 0.36], [216.6, 9.8, 0.44]].forEach(function (p) {
      const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(p[2], 0), std(0x9aa08e, 0.95));
      rk.position.set(p[0], WATER_Y + 0.3, p[1]);
      rk.rotation.set(Math.random(), Math.random(), Math.random());
      rk.scale.set(1, 0.7, 1.2);
      root.add(rk);
    });
    [0x2f4038, 0x35463c, 0x2b3a33].forEach(function (c, i) {
      const tr = new THREE.Group();
      tr.position.set(216.2, WATER_Y + 0.45, -9 + i * 8.5);
      root.add(tr);
      cyl(0.16, 0.22, 1.3, 6, std(0x2e3a30, 0.98), 0, 0.65, 0, tr);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.0 + i * 0.12, 2.6 + i * 0.3, 7), std(c, 0.98));
      leaf.position.y = 2.5;
      tr.add(leaf);
    });
    // 远处的灯塔（夜里顶端会亮）
    const lh = new THREE.Group();
    lh.position.set(216.0, WATER_Y + 0.6, 13.5);
    root.add(lh);
    cyl(0.32, 0.46, 3.4, 8, std(0xe4ddd0, 0.95), 0, 1.7, 0, lh);
    cyl(0.36, 0.36, 0.22, 8, std(0xc0554e, 0.9), 0, 2.5, 0, lh);
    cyl(0.24, 0.30, 0.7, 8, std(0x3a3f46, 0.85), 0, 3.5, 0, lh);
    const lhLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({
        color: col(0xfff0c0), emissive: col(0xffd070), emissiveIntensity: 1.2, roughness: 0.4
      }));
    lhLight.position.y = 3.62;
    lh.add(lhLight);
    fr.lighthouse = lhLight;
  }

  /* ============================ 建模：木栈道 ============================ */
  function makeDeck() {
    const plankTex = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#9b7a54'; g.fillRect(0, 0, w, h);
      const cols = 8;
      for (let i = 0; i < cols; i++) {
        const x = i * (w / cols);
        const v = 118 + Math.floor(Math.random() * 40);
        g.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.78) + ',' + Math.floor(v * 0.52) + ')';
        g.fillRect(x + 1, 0, w / cols - 2, h);
        // 木纹
        g.strokeStyle = 'rgba(70,48,30,.18)';
        g.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const yy = Math.random() * h;
          g.beginPath();
          g.moveTo(x + 2, yy);
          g.bezierCurveTo(x + w / cols * 0.4, yy + 4, x + w / cols * 0.7, yy - 4, x + w / cols - 2, yy + 2);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,26,16,.35)';
        g.fillRect(x, 0, 1.2, h);
      }
    });
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
    plankTex.repeat.set(2.6, 6);
    const deckMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.92, metalness: 0.02 });
    const dw = DECK.x1 - DECK.x0, dd = DECK.z1 - DECK.z0;
    const deck = box(dw, 0.16, dd, deckMat, (DECK.x0 + DECK.x1) / 2, 0.0, (DECK.z0 + DECK.z1) / 2, root);
    deck.receiveShadow = true;
    deck.name = 'pier-deck';

    // 栈道下面的木桩 + 横撑（从侧面看是一条真栈道）
    const pileMat = std(0x6d563f, 0.95);
    [-2.5, -0.85, 0.85, 2.5].forEach(function (z) {
      cyl(0.11, 0.13, 1.5, 7, pileMat, DECK.x1 - 0.12, -0.85, z, root);
    });
    [DECK.x0 + 0.3, DECK.x1 - 0.12].forEach(function (x) {
      box(0.14, 0.1, dd, pileMat, x, -0.32, (DECK.z0 + DECK.z1) / 2, root);
    });

    // 两边低栏杆（南、北），临水那侧敞开好甩竿
    const railMat = std(0x8a6c4a, 0.9);
    [-1, 1].forEach(function (s) {
      const z = s > 0 ? DECK.z1 - 0.10 : DECK.z0 + 0.10;
      const n = 4;
      for (let i = 0; i <= n; i++) {
        const x = DECK.x0 + 0.12 + i * ((dw - 0.24) / n);
        box(0.10, 0.62, 0.10, railMat, x, 0.39, z, root);
      }
      box(dw - 0.16, 0.075, 0.09, railMat, (DECK.x0 + DECK.x1) / 2, 0.68, z, root);
      box(dw - 0.16, 0.06, 0.07, railMat, (DECK.x0 + DECK.x1) / 2, 0.30, z, root);
    });
    // 临水那侧：两根系缆桩 + 一根绳子
    cyl(0.09, 0.11, 0.5, 8, railMat, DECK.x1 - 0.22, 0.32, DECK.z0 + 0.34, root);
    cyl(0.09, 0.11, 0.5, 8, railMat, DECK.x1 - 0.22, 0.32, DECK.z1 - 0.34, root);

    // 湿脚印 / 水渍（几块深色圆片）
    for (let i = 0; i < 7; i++) {
      const s = 0.16 + Math.random() * 0.2;
      const p = new THREE.Mesh(new THREE.CircleGeometry(s, 12),
        new THREE.MeshStandardMaterial({ color: col(0x7d6650), roughness: 0.35, transparent: true, opacity: 0.28 }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(rnd(201.2, 204.2), 0.086, rnd(-2.2, 2.2));
      root.add(p);
    }
  }

  /* ============================ 建模：小屋 ============================ */
  function makeHut() {
    const w = HUT.x1 - HUT.x0, d = HUT.z1 - HUT.z0;
    const cx = (HUT.x0 + HUT.x1) / 2, cz = (HUT.z0 + HUT.z1) / 2;
    const bodyMat = std(0xdcc9a8, 0.95);
    const trimMat = std(0x7d5f42, 0.9);
    const roofMat = std(0x5b6f74, 0.85);

    box(w, HUT.h, d, bodyMat, cx, HUT.h / 2, cz, root);
    // 屋顶：两面坡（屋脊沿 z 方向），加两块山墙把三角补上
    const eaveX = w / 2 + 0.23, ridgeY = HUT.h + 0.64, eaveY = HUT.h + 0.06;
    const ang = Math.atan2(ridgeY - eaveY, eaveX);
    const slabL = Math.sqrt(eaveX * eaveX + (ridgeY - eaveY) * (ridgeY - eaveY));
    const rMat = roofMat;
    [-1, 1].forEach(function (s) {
      const slab = box(slabL, 0.09, d + 0.42, rMat, cx + s * eaveX * 0.5, (ridgeY + eaveY) / 2, cz, root);
      slab.rotation.z = -s * ang;
    });
    box(0.15, 0.12, d + 0.5, trimMat, cx, ridgeY + 0.03, cz, root);
    // 檐口 + 檐下那根横梁（不然从栈道上看，屋顶就是一块悬空的板）
    box(0.10, 0.13, d + 0.44, trimMat, cx + eaveX, eaveY + 0.02, cz, root);
    box(0.10, 0.13, d + 0.44, trimMat, cx - eaveX, eaveY + 0.02, cz, root);
    box(w + 0.46, 0.10, 0.10, trimMat, cx, eaveY - 0.02, cz + d / 2 + 0.20, root);
    box(w + 0.46, 0.10, 0.10, trimMat, cx, eaveY - 0.02, cz - d / 2 - 0.20, root);
    [-1, 1].forEach(function (s) {
      const shape = new THREE.Shape();
      shape.moveTo(-eaveX + 0.12, 0);
      shape.lineTo(eaveX - 0.12, 0);
      shape.lineTo(0, ridgeY - eaveY - 0.06);
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(shape), bodyMat);
      gm.position.set(cx, eaveY, cz + s * (d / 2 + 0.02));
      if (s < 0) gm.rotation.y = Math.PI;
      root.add(gm);
    });

    // 正面（朝 +x）：门 + 租竿窗口 + 黑板墙（三段错开，别叠在一起）
    const faceX = HUT.x1 + 0.02;
    box(0.06, 2.0, 0.86, trimMat, faceX, 1.0, 0.48, root);              // 门框
    box(0.04, 1.86, 0.74, std(0x9c7a52, 0.9), faceX + 0.03, 0.96, 0.48, root);  // 门
    sph(0.045, std(0xc9a25e, 0.5, 0.4), faceX + 0.07, 0.98, 0.78, root, 8);
    // 窗口（夜里有暖光）
    box(0.06, 0.92, 0.92, trimMat, faceX, 1.62, -1.00, root);
    const winMat = new THREE.MeshStandardMaterial({
      color: col(0x8fb4c2), roughness: 0.25, metalness: 0.1,
      emissive: col(0xffc070), emissiveIntensity: 0.0
    });
    box(0.03, 0.80, 0.80, winMat, faceX + 0.035, 1.62, -1.00, root);
    fr.winMat = winMat;
    // 窗台 + 一盆小小的草
    box(0.16, 0.08, 1.0, trimMat, faceX + 0.06, 1.12, -1.00, root);
    cyl(0.11, 0.09, 0.16, 8, std(0xb1613f, 0.9), faceX + 0.06, 1.24, -0.70, root);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), std(0x5f8a52, 0.9));
      b.position.set(faceX + 0.06 + rnd(-0.05, 0.05), 1.42, -0.70 + rnd(-0.07, 0.07));
      b.rotation.z = rnd(-0.4, 0.4);
      root.add(b);
    }

    // 招牌（悬在门外上方，两面都能看）
    const signTex = canvasTex(512, 160, function (g, ww, hh) {
      g.fillStyle = '#eef3f0'; g.fillRect(0, 0, ww, hh);
      g.fillStyle = '#2f5f74'; g.fillRect(0, 0, ww, 12); g.fillRect(0, hh - 12, ww, 12);
      g.fillStyle = '#2f5f74';
      g.font = font(58, true); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('鲸鱼码头', ww / 2, hh * 0.42);
      g.fillStyle = '#6a8794';
      g.font = font(24, false);
      g.fillText('W H A L E   P I E R  ·  钓鱼 · 现钓现卖', ww / 2, hh * 0.74);
    });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 });
    const sign = box(0.07, 0.46, 1.24, signMat, faceX + 0.16, 2.28, 0.30, root);
    sign.castShadow = false;
    box(0.06, 0.26, 0.06, trimMat, faceX + 0.16, 2.60, -0.26, root);
    box(0.06, 0.26, 0.06, trimMat, faceX + 0.16, 2.60, 0.86, root);

    // 檐下一盏灯
    const lampArm = box(0.4, 0.05, 0.05, trimMat, faceX + 0.2, 2.08, -1.62, root);
    lampArm.castShadow = false;
    const bulbMat = new THREE.MeshStandardMaterial({
      color: col(0xfff2d0), emissive: col(0xffc978), emissiveIntensity: 0.9, roughness: 0.4
    });
    const bulb = sph(0.09, bulbMat, faceX + 0.36, 1.94, -1.62, root, 8);
    bulb.castShadow = false;
    fr.bulbMats.push(bulbMat);
    const hl = new THREE.PointLight(0xffcb86, 0.9, 6, 2);
    hl.position.set(faceX + 0.5, 1.9, -1.58);
    root.add(hl);
    fr.lampLights.push({ l: hl, base: 0.9 });

    // 门口堆的东西：木箱 + 鱼饵桶 + 旧轮胎
    box(0.52, 0.42, 0.52, std(0xa8845c, 0.92), 200.58, 0.21, -0.55, root);
    box(0.44, 0.36, 0.44, std(0xbd9868, 0.92), 200.56, 0.62, -0.62, root);
    cyl(0.17, 0.14, 0.30, 10, std(0x6f8a7a, 0.9), 200.62, 0.15, 0.08, root);
    for (let i = 0; i < 4; i++) {
      sph(0.05, std(0xc76a52, 0.85), 200.62 + rnd(-0.06, 0.06), 0.30, 0.08 + rnd(-0.06, 0.06), root, 6);
    }
  }

  /* ============================ 建模：道具 ============================ */
  function makeProps() {
    // 竿架：两根木头 + 一根斜靠的竹竿
    const woodMat = std(0x8a6c4a, 0.9);
    box(0.1, 0.9, 0.1, woodMat, RACK.x, 0.45, RACK.z - 0.35, root);
    box(0.1, 0.9, 0.1, woodMat, RACK.x, 0.45, RACK.z + 0.35, root);
    box(0.12, 0.08, 0.86, woodMat, RACK.x, 0.9, RACK.z, root);
    const rodMat = std(0xc9b48a, 0.7);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 2.3, 6), rodMat);
    rod.position.set(RACK.x + 0.06, 1.28, RACK.z - 0.12);
    rod.rotation.z = -0.16; rod.rotation.x = 0.18;
    rod.castShadow = true;
    root.add(rod);
    cyl(0.055, 0.055, 0.05, 8, std(0x9aa2a8, 0.5, 0.5), RACK.x + 0.14, 0.72, RACK.z - 0.04, root);
    fr.rod = rod;

    // 鱼簍（藤编桶，钓上来的鱼会飞进去）
    const basketMat = std(0xa9855a, 0.92);
    cyl(0.24, 0.20, 0.44, 12, basketMat, BUCKET.x, 0.22, BUCKET.z, root);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.035, 6, 14), std(0x8d6b45, 0.9));
    rim.position.set(BUCKET.x, 0.44, BUCKET.z);
    rim.rotation.x = Math.PI / 2;
    root.add(rim);
    // 簍口的水
    const bWater = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14),
      new THREE.MeshStandardMaterial({ color: col(0x6fa8bd), roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.8 }));
    bWater.rotation.x = -Math.PI / 2;
    bWater.position.set(BUCKET.x, 0.42, BUCKET.z);
    root.add(bWater);
    fr.bucketWater = bWater;

    // 木箱上睡觉的猫
    box(0.6, 0.5, 0.66, std(0x9c7c56, 0.92), CAT.x, 0.25, CAT.z, root);
    const cat = new THREE.Group();
    cat.position.set(CAT.x, 0.5, CAT.z);
    root.add(cat);
    const furMat = std(0x5b5148, 0.95);
    const cb = sph(0.19, furMat, 0, 0.16, 0, cat, 12);
    cb.scale.set(1.25, 0.85, 1.0);
    const head = sph(0.13, furMat, 0.17, 0.24, 0.02, cat, 12);
    head.scale.set(1.0, 0.95, 1.0);
    [-1, 1].forEach(function (s) {
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 4), furMat);
      e.position.set(0.16, 0.35, s * 0.06);
      e.rotation.z = 0.2;
      cat.add(e);
    });
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.42, 6), furMat);
    tail.position.set(-0.2, 0.14, 0.14);
    tail.rotation.z = Math.PI / 2.4;
    cat.add(tail);
    fr.catTail = tail;
    fr.catBody = cat;

    // 小船（系在桩上）—— 盒子拼的平底小船，两头收成尖的
    const boat = new THREE.Group();
    boat.position.set(BOAT.x, WATER_Y + 0.06, BOAT.z);
    boat.rotation.y = -0.34;
    root.add(boat);
    fr.boat = boat;
    const hullMat = std(0x5d8490, 0.88);
    const hullDark = std(0x3f5f6a, 0.9);
    const gunwale = std(0xa8845c, 0.9);
    box(1.24, 0.30, 0.56, hullMat, 0, 0.15, 0, boat);
    box(1.10, 0.05, 0.44, hullDark, 0, 0.30, 0, boat);        // 船舱（深色 = 是空的）
    // 船头（转 45° 成一个尖）
    const bow = box(0.34, 0.30, 0.34, hullMat, 0.76, 0.15, 0, boat);
    bow.rotation.y = Math.PI / 4;
    const bowIn = box(0.24, 0.05, 0.24, hullDark, 0.76, 0.30, 0, boat);
    bowIn.rotation.y = Math.PI / 4;
    // 船尾
    const stern = box(0.26, 0.28, 0.26, hullMat, -0.68, 0.15, 0, boat);
    stern.rotation.y = Math.PI / 4;
    // 船沿
    box(1.28, 0.06, 0.07, gunwale, 0, 0.31, 0.27, boat);
    box(1.28, 0.06, 0.07, gunwale, 0, 0.31, -0.27, boat);
    box(0.07, 0.06, 0.56, gunwale, -0.6, 0.31, 0, boat);
    // 横坐板
    box(0.12, 0.04, 0.5, gunwale, 0.1, 0.28, 0, boat);
    box(0.12, 0.04, 0.5, gunwale, -0.38, 0.28, 0, boat);
    // 一支桨斜靠在船上
    const oar = box(0.045, 0.045, 1.15, std(0xc9b48a, 0.85), 0.1, 0.34, 0.06, boat);
    oar.rotation.y = 0.5; oar.rotation.x = 0.06;
    // 系船绳
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 4), std(0xd8c9a8, 0.9));
    rope.position.set(-0.72, 0.34, -0.42);
    rope.rotation.z = 0.9; rope.rotation.y = 0.5;
    boat.add(rope);

    // 芦苇（水边，会轻轻摇）
    const reedMat = std(0x6f8a52, 0.95);
    const reeds = [];
    [[205.06, -2.34], [205.24, -2.05], [205.02, 2.32], [205.3, 2.5], [205.6, -1.6]].forEach(function (p, i) {
      const g = new THREE.Group();
      g.position.set(p[0], WATER_Y, p[1]);
      root.add(g);
      for (let k = 0; k < 4; k++) {
        const h = 0.9 + Math.random() * 0.7;
        const st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, h, 4), reedMat);
        st2.position.set(rnd(-0.1, 0.1), h / 2, rnd(-0.1, 0.1));
        st2.rotation.z = rnd(-0.16, 0.16);
        g.add(st2);
        const tip2 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), std(0x8d7a52, 0.9));
        tip2.position.set(st2.position.x + rnd(-0.02, 0.02), h + 0.06, st2.position.z);
        g.add(tip2);
      }
      reeds.push({ g: g, ph: i * 1.3, z0: p[1] });
    });
    fr.reeds = reeds;

    // 荷叶
    for (let i = 0; i < 7; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.16, 0.30), 12),
        new THREE.MeshStandardMaterial({ color: col(0x4f7d5a), roughness: 0.8, transparent: true, opacity: 0.95 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(rnd(206.1, 210.0), WATER_Y + 0.02, rnd(-3.4, 3.4));
      root.add(pad);
      fr.pads.push({ m: pad, ph: Math.random() * 6, x0: pad.position.x, z0: pad.position.z });
    }

    // 水下的鱼影（三条，慢慢绕圈 —— 说明水里真有鱼）
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.15),
        new THREE.MeshBasicMaterial({ color: 0x24525f, transparent: true, opacity: 0.28, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(206.6 + i * 0.5, WATER_Y + 0.035, -1.2 + i * 1.0);
      root.add(sh);
      fr.shadowFish.push({ m: sh, cx: 206.9 + i * 0.55, cz: -1.0 + i * 1.1, r: 0.5 + i * 0.22, ph: i * 2.1, sp: 0.18 + i * 0.05 });
    }

    // 两盏挂在木杆上的灯笼（晚上亮）
    [[200.42, -2.56], [204.30, -2.52]].forEach(function (p, i) {
      const pole = cyl(0.05, 0.06, 2.0, 6, std(0x6d563f, 0.9), p[0], 1.0, p[1], root);
      pole.castShadow = true;
      box(0.5, 0.05, 0.05, std(0x6d563f, 0.9), p[0] + 0.22, 1.98, p[1], root);
      const lanMat = new THREE.MeshStandardMaterial({
        color: col(0xf6d9a8), emissive: col(0xffb35e), emissiveIntensity: 0.25,
        roughness: 0.6, transparent: true, opacity: 0.92
      });
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 10), lanMat);
      lan.position.set(p[0] + 0.42, 1.76, p[1]);
      root.add(lan);
      cyl(0.15, 0.15, 0.04, 10, std(0x8d6b45, 0.9), p[0] + 0.42, 1.92, p[1], root);
      cyl(0.15, 0.15, 0.04, 10, std(0x8d6b45, 0.9), p[0] + 0.42, 1.60, p[1], root);
      const pl = new THREE.PointLight(0xffb570, 0, 7.5, 2);
      pl.position.set(p[0] + 0.42, 1.74, p[1]);
      root.add(pl);
      fr.lampLights.push({ l: pl, base: 1.65 });
      fr.lanterns.push(lanMat);
    });

    // 一只站在船头的白鹭（跟着船一起晃）
    const egret = new THREE.Group();
    egret.position.set(0.60, 0.34, 0.02);
    egret.rotation.y = 0.25;
    egret.scale.setScalar(0.9);
    boat.add(egret);
    const whiteMat = std(0xf2f0e6, 0.9);
    const bodyE = sph(0.085, whiteMat, 0, 0.42, 0, egret, 10);
    bodyE.scale.set(1.35, 0.92, 0.85);
    // 脖子
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.30, 6), whiteMat);
    neck.position.set(0.05, 0.62, 0);
    neck.rotation.z = -0.18;
    egret.add(neck);
    const headE = sph(0.052, whiteMat, 0.09, 0.77, 0, egret, 8);
    headE.scale.set(1.15, 1, 1);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.15, 5), std(0xd8a24a, 0.7));
    beak.position.set(0.19, 0.765, 0);
    beak.rotation.z = -Math.PI / 2;
    egret.add(beak);
    // 两条细腿（站到水里）
    [-0.04, 0.04].forEach(function (z) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.34, 4), std(0x8a7350, 0.9));
      leg.position.set(0, 0.15, z);
      egret.add(leg);
    });
    // 翅膀（一片薄薄的白）
    [-1, 1].forEach(function (s) {
      const w2 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), whiteMat);
      w2.position.set(-0.04, 0.44, s * 0.07);
      w2.scale.set(1.5, 0.6, 0.35);
      egret.add(w2);
    });
    fr.egret = egret;
  }

  /* ============================ 渔获黑板 ============================ */
  function drawBoard() {
    const c = fr.boardCanvas, g = fr.boardCtx;
    if (!c || !g) return;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#2b3a33';
    g.fillRect(0, 0, W, H);
    // 木框
    g.strokeStyle = '#7a5c3c'; g.lineWidth = 14;
    g.strokeRect(7, 7, W - 14, H - 14);
    // 粉笔字
    g.fillStyle = '#eaf2ea';
    g.font = font(30, true);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('渔 获 记 录', W / 2, 46);
    g.strokeStyle = 'rgba(234,242,234,.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(44, 68); g.lineTo(W - 44, 68); g.stroke();

    const rows = [
      { k: 'silver', name: '小银鱼' },
      { k: 'puffer', name: '小河豚' },
      { k: 'trout', name: '彩虹鳟' },
      { k: 'whale', name: '小鲸鱼' }
    ];
    g.font = font(23, false);
    g.textAlign = 'left';
    rows.forEach(function (r, i) {
      const y = 96 + i * 27;
      g.fillStyle = 'rgba(234,242,234,.88)';
      g.fillText(r.name, 46, y);
      const n = (st.kinds[r.k] || 0);
      g.fillStyle = n > 0 ? '#ffe6a8' : 'rgba(234,242,234,.42)';
      g.fillText('× ' + n, W - 100, y);
    });

    g.font = font(18, false);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(234,242,234,.7)';
    g.fillText('一共 ' + st.total + ' 条 · 最长 ' + (st.best > 0 ? Math.round(st.best * 100) + ' cm' : '—'), W / 2, H - 26);
    if (fr.boardTex) fr.boardTex.needsUpdate = true;
  }

  function makeBoard() {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 224;
    fr.boardCanvas = canvas;
    fr.boardCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    fr.boardTex = tex;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    // 挂在屋墙正面（朝 +x），稍微偏一点角度好读
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.90, 0.63), mat);
    b.position.set(HUT.x1 + 0.03, 1.52, -2.00);
    b.rotation.y = Math.PI / 2;
    root.add(b);
    drawBoard();
  }

  /* ============================ 钓竿 / 浮标 / 鱼线 ============================ */
  function makeTackle() {
    // 浮标：上红下白的细杆 + 一个小球
    const bg = new THREE.Group();
    bg.position.set(BOB.x, WATER_Y + 0.05, BOB.z);
    root.add(bg);
    const fl1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 6), std(0xe0503c, 0.6));
    fl1.position.y = 0.12; bg.add(fl1);
    const fl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.14, 6), std(0xf2f0e6, 0.6));
    fl2.position.y = -0.05; bg.add(fl2);
    const knob = sph(0.036, std(0xe0503c, 0.5), 0, 0.245, 0, bg, 8);
    knob.castShadow = false;
    // 入水的那一圈小水花（浮标落在水面上时看得到）
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 5, 12),
      new THREE.MeshBasicMaterial({ color: 0xeaf6f8, transparent: true, opacity: 0.8 }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.10;
    bg.add(collar);
    bg.visible = false;
    fr.bobber = bg;

    // 「！」提示（Sprite，永远面向镜头）
    const bangTex = canvasTex(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.beginPath();
      g.arc(w / 2, h / 2, 52, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,247,232,.96)';
      g.fill();
      g.lineWidth = 7; g.strokeStyle = '#e0503c'; g.stroke();
      g.fillStyle = '#e0503c';
      g.font = '900 78px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('!', w / 2, h / 2 + 4);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bangTex, transparent: true, depthTest: false, depthWrite: false
    }));
    sp.scale.set(0.42, 0.42, 1);
    sp.visible = false;
    root.add(sp);
    fr.bang = sp;

    // 鱼线（两段线：竿尖 → 浮标）
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    fr.lineGeo = geo;
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xf2ead6, transparent: true, opacity: 0.8, fog: false
    }));
    line.frustumCulled = false;
    line.visible = false;
    root.add(line);
    fr.line = line;

    // 水面涟漪（抛竿 / 咬钩 / 收杆时放一圈）
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 24),
        new THREE.MeshBasicMaterial({ color: 0xdff2f7, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      root.add(ring);
      fr.rings.push({ m: ring, life: 0 });
    }

    // 手上那根竿（跟着镜头，看起来是我在钓）
    const rod = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 1.7, 6), std(0xc9b48a, 0.7));
    shaft.position.y = 0.85;
    rod.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.26, 8), std(0x4f3c2c, 0.9));
    grip.position.y = 0.16;
    rod.add(grip);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), std(0x9aa2a8, 0.4, 0.55));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 0.62, 0.03);
    rod.add(reel);
    rod.visible = false;
    rod.traverse(function (o) { o.castShadow = false; });
    root.add(rod);
    fr.handRod = rod;
  }

  /* ============================ 建模：一条鱼 ============================ */
  function makeFish(f, len) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: col(f.body), roughness: 0.45, metalness: 0.18
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: col(f.belly || f.body), roughness: 0.5, metalness: 0.1
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: col(f.fin), roughness: 0.6, metalness: 0.08,
      transparent: true, opacity: 0.92
    });
    const L = len;
    const body = new THREE.Mesh(new THREE.SphereGeometry(L * 0.5, 12, 8), bodyMat);
    body.scale.set(1.95, 0.80, 0.62);
    body.castShadow = true;
    g.add(body);
    // 肚皮
    const belly = new THREE.Mesh(new THREE.SphereGeometry(L * 0.42, 10, 7), bellyMat);
    belly.scale.set(1.7, 0.42, 0.55);
    belly.position.y = -L * 0.12;
    g.add(belly);
    // 尾巴
    const tail = new THREE.Mesh(new THREE.ConeGeometry(L * 0.30, L * 0.34, 3), finMat);
    tail.rotation.z = Math.PI / 2;
    tail.scale.set(1, 1, 0.3);
    tail.position.x = -L * 0.98;
    g.add(tail);
    // 背鳍
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(L * 0.15, L * 0.26, 3), finMat);
    dorsal.position.set(-L * 0.05, L * 0.28, 0);
    dorsal.scale.set(1, 1, 0.28);
    g.add(dorsal);
    // 眼睛
    [-1, 1].forEach(function (s) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(L * 0.058, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.35 }));
      e.position.set(L * 0.32, L * 0.06, s * L * 0.135);
      g.add(e);
    });
    if (f.rare) {
      // 小鲸鱼：尾巴换成两片鲸尾 + 背上的小喷气孔
      tail.visible = false;
      [-1, 1].forEach(function (s) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(L * 0.2, L * 0.3, 3), finMat);
        fl.rotation.z = Math.PI / 2;
        fl.rotation.y = s * 0.5;
        fl.scale.set(1, 1, 0.22);
        fl.position.set(-L * 0.92, 0, s * L * 0.1);
        g.add(fl);
      });
      const hole = sph(L * 0.05, std(0x2c4a5c, 0.9), L * 0.06, L * 0.26, 0, g, 6);
      hole.castShadow = false;
    }
    return g;
  }

  /* ============================ 玩法逻辑 ============================ */
  function fishOf(k) {
    for (let i = 0; i < FISH.length; i++) if (FISH[i].k === k) return FISH[i];
    return FISH[0];
  }

  function night() { return getMode() === 'night'; }

  function pickFishKind() {
    const n = night();
    let total = 0;
    const ws = FISH.map(function (f) {
      let x = f.w;
      if (n && f.k === 'whale') x *= 2.2;
      if (n && f.k === 'trout') x *= 1.6;
      if (n && f.junk) x *= 0.62;
      total += x;
      return x;
    });
    let r = Math.random() * total;
    for (let i = 0; i < FISH.length; i++) {
      r -= ws[i];
      if (r <= 0) return FISH[i];
    }
    return FISH[0];
  }

  function say(text, sec) {
    if (tip) tip(text, sec || 3400);
  }

  function boom(where) {
    // 放一圈涟漪
    for (let i = 0; i < fr.rings.length; i++) {
      const r = fr.rings[i];
      if (!r.m.visible) {
        r.m.position.set(where.x, WATER_Y + 0.03, where.z);
        r.m.visible = true;
        r.life = 0;
        return;
      }
    }
  }

  function beginCast() {
    if (st.phase !== 'idle') return;
    if (st.basket.length >= MAX_FISH) {
      if (sfx && sfx.blip) sfx.blip();
      say('鱼簍满了（' + MAX_FISH + '/' + MAX_FISH + '）—— 先点鱼簍卖给收鱼的船吧 🐟', 4200);
      return;
    }
    st.phase = 'fly';
    st.pt = 0;
    st.kind = null;
    st.size = 0;
    // 落点：栈道正前方一小片水里
    st.bx = BOB.x + rnd(-0.55, 0.75);
    st.bz = BOB.z + rnd(-1.05, 1.05);
    if (fr.bobber) {
      fr.bobber.position.set(st.bx, WATER_Y + 0.05, st.bz);
      fr.bobber.visible = true;
    }
    if (fr.line) fr.line.visible = true;
    if (sfx && sfx.blip) sfx.blip();
    say('抛竿 —— 浮标「咚」地落进水里，等一会儿…', 2200);
  }

  function beginWait() {
    st.phase = 'wait';
    st.pt = 0;
    // 夜里鱼要多等一会儿；白天快
    st.biteIn = night() ? rnd(2.2, 5.0) : rnd(1.6, 4.2);
  }

  function bite() {
    const f = pickFishKind();
    st.kind = f;
    st.size = rnd(f.len[0], f.len[1]);
    st.shifty = (f.k === 'trout') || (f.k === 'whale');   // 好鱼更滑，窗口短
    st.win = st.shifty ? 0.62 : 0.90;
    st.phase = 'bite';
    st.pt = 0;
    if (fr.bang) {
      fr.bang.visible = true;
      fr.bang.position.set(st.bx, WATER_Y + 0.62, st.bz);
    }
    boom({ x: st.bx, z: st.bz });
    if (sfx && sfx.ding) sfx.ding();
    say('！咬钩了 —— 快收杆！（点水面 / 按空格）', 1400);
  }

  function missBite() {
    st.phase = 'idle';
    st.kind = null;
    if (fr.bang) fr.bang.visible = false;
    if (fr.bobber) fr.bobber.visible = false;
    if (fr.line) fr.line.visible = false;
    if (sfx && sfx.blip) sfx.blip();
    say('跑掉了…… 下次看到「！」要更快一点 🙈', 3200);
  }

  function earlyReel() {
    st.phase = 'idle';
    if (fr.bobber) fr.bobber.visible = false;
    if (fr.line) fr.line.visible = false;
    boom({ x: st.bx, z: st.bz });
    if (sfx && sfx.splash) sfx.splash();
    say('太早了 —— 鱼还没咬呢，再抛一次吧', 2600);
  }

  function landCatch() {
    const f = st.kind;
    const size = st.size;
    st.phase = 'land';
    st.pt = 0;
    if (fr.bang) fr.bang.visible = false;
    if (sfx && sfx.splash) sfx.splash();

    // 鱼模型：从水里飞上栈道
    if (fr.caught) { root.remove(fr.caught); fr.caught = null; }
    const m = makeFish(f, size);
    m.position.set(st.bx, WATER_Y + 0.1, st.bz);
    root.add(m);
    fr.caught = m;
    fr.caughtFrom = { x: st.bx, y: WATER_Y + 0.1, z: st.bz };
    fr.caughtTo = { x: 203.35, y: 0.24, z: 0.62 + rnd(-0.35, 0.35) };

    // 记录
    st.kinds[f.k] = (st.kinds[f.k] || 0) + 1;
    if (!f.junk && size > st.best) st.best = size;

    if (f.rare) {
      st.whales++;
      say('……是小鲸鱼。它只有巴掌大，尾巴还在轻轻拍水 —— 放它回去吧 🐋', 5200);
      if (sfx && sfx.chime) sfx.chime();
    } else if (f.junk) {
      st.junk++;
      say(f.line + '（垃圾不算渔获，扔进桶里了）', 3600);
    } else {
      st.total++;
      st.basket.push({ k: f.k, price: f.price, size: size });
      if (sfx && sfx.pickup) sfx.pickup();
      say('钓到' + f.name + '！¥' + f.price + ' · ' + Math.round(size * 100) + 'cm —— 鱼簍 ' + st.basket.length + '/' + MAX_FISH, 4000);
    }
    save();
    drawBoard();
  }

  function onReel() {
    if (st.phase === 'bite') { landCatch(); return; }
    if (st.phase === 'wait') { earlyReel(); return; }
    if (st.phase === 'fly') return;
    if (st.phase === 'idle') beginCast();
  }

  /* 点水面 / 按空格都走这里 */
  function tap() {
    if (!isFishNow()) return;
    onReel();
  }

  function sellBasket() {
    if (!st.basket.length) {
      if (sfx && sfx.blip) sfx.blip();
      say('鱼簍还是空的 —— 点水面抛竿吧 🎣', 3000);
      return 0;
    }
    let sum = 0, names = {};
    st.basket.forEach(function (b) {
      sum += b.price;
      names[b.k] = (names[b.k] || 0) + 1;
    });
    const n = st.basket.length;
    st.basket.length = 0;
    if (earn) earn(sum);
    if (sfx && sfx.cash) sfx.cash();
    const parts = [];
    Object.keys(names).forEach(function (k) {
      parts.push(fishOf(k).name + '×' + names[k]);
    });
    save();
    if (fr.bucketWater) fr.bucketWater.visible = true;
    say('卖了 ' + n + ' 条（' + parts.join('、') + '）+¥' + sum + ' —— 现在有 ¥' + walletOf(), 5000);
    return sum;
  }

  function takeHome() {
    if (!st.basket.length) {
      if (sfx && sfx.blip) sfx.blip();
      say('鱼簍是空的。钓到一条再带回家吧', 2800);
      return false;
    }
    if (st.home) {
      say('餐桌上那条还没吃呢，先吃完了再带 🍽️', 3000);
      return false;
    }
    // 挑一条最好看的（最贵的那条）
    let idx = 0;
    for (let i = 1; i < st.basket.length; i++) {
      if (st.basket[i].price > st.basket[idx].price) idx = i;
    }
    const b = st.basket.splice(idx, 1)[0];
    st.home = 1;
    st.homeKind = b.k;
    st.homeSize = b.size;
    save();
    placeHome();
    if (sfx && sfx.bag) sfx.bag(); else if (sfx && sfx.rustle) sfx.rustle();
    say('把' + fishOf(b.k).name + '放进袋子里带回家了 —— 现在就摆在餐桌的盘子上 🐟', 5000);
    return true;
  }

  /* 家里餐桌上的那盘鱼（桌面上还有花瓶 6.38/0.45、面包纸袋 6.72/0.30、面包盘 6.32/0.72，
   * 所以盘子挑右后这块空地，热区盒子还要立得比"餐桌"那个大热区（顶面 1.06）高） */
  const HOME_PLATE = { x: 6.52, y: 0.772, z: 0.88 };

  /* 盘子里那条鱼：专门做的"扁平鱼" —— 从上往下看要一眼认得出是鱼（鱼尾是平的扇形 + 头顶两只眼睛）。
   * 用 3D 的 makeFish() 躺上去只会看到一个白蛋（妈妈截图：「这个是什么建模」）。 */
  function makeFlatFish(f, L) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: col(f.body).multiplyScalar(0.72), roughness: 0.45, metalness: 0.18
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: col(f.fin).multiplyScalar(0.9), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide
    });
    const darkMat = std(0x26262c, 0.45);
    // 身体：压得很扁的纺锤
    const body = new THREE.Mesh(new THREE.SphereGeometry(L * 0.5, 14, 10), bodyMat);
    body.scale.set(1.95, 0.26, 0.70);
    body.castShadow = true;
    g.add(body);
    // 尾巴：躺平的三角扇形，**伸出身体外面**（不然被鱼身盖住，看着就是根白肠子）
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-L * 0.46, L * 0.40);
    shape.lineTo(-L * 0.46, -L * 0.40);
    shape.closePath();
    const tail = new THREE.Mesh(new THREE.ShapeGeometry(shape), finMat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(-L * 0.92, 0.002, 0);
    g.add(tail);
    // 背上一道深色（鱼的脊背），从上往下看更像鱼
    const spine = new THREE.Mesh(new THREE.BoxGeometry(L * 1.35, L * 0.035, L * 0.10),
      new THREE.MeshStandardMaterial({ color: col(f.fin).multiplyScalar(0.72), roughness: 0.7 }));
    spine.position.set(L * 0.02, L * 0.125, 0);
    g.add(spine);
    // 胸鳍：身体两侧的小三角
    [-1, 1].forEach(function (s) {
      const fs = new THREE.Shape();
      fs.moveTo(0, 0);
      fs.lineTo(-L * 0.20, s * L * 0.26);
      fs.lineTo(-L * 0.02, s * L * 0.12);
      fs.closePath();
      const fin = new THREE.Mesh(new THREE.ShapeGeometry(fs), finMat);
      fin.rotation.x = -Math.PI / 2;
      fin.position.set(L * 0.10, 0.001, 0);
      g.add(fin);
    });
    // 两只眼睛（在背上，从上面看得见）
    [-1, 1].forEach(function (s) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(L * 0.06, 8, 6), darkMat);
      e.position.set(L * 0.34, L * 0.10, s * L * 0.12);
      g.add(e);
    });
    // 嘴：鼻尖一小条深色
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(L * 0.035, L * 0.025, L * 0.11), darkMat);
    mouth.position.set(L * 0.47, L * 0.02, 0);
    g.add(mouth);
    return g;
  }

  function placeHome() {
    if (!root) return;
    if (fr.homeFish) {
      if (fr.homeFish.parent) fr.homeFish.parent.remove(fr.homeFish);
      fr.homeFish = null;
    }
    if (!st.home) return;
    const f = fishOf(st.homeKind || 'silver');
    const g = new THREE.Group();
    g.position.set(HOME_PLATE.x, HOME_PLATE.y, HOME_PLATE.z);
    // 盘子：换成一块浅木色的小鱼板，白盘子 + 白鱼肉在白餐桌上太糊了
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.172, 0.022, 18), std(0x8a6a46, 0.82));
    plate.receiveShadow = true;
    g.add(plate);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.154, 0.012, 18), std(0x7a5c3c, 0.78));
    inner.position.y = 0.016;
    g.add(inner);
    // 鱼：专门做的扁平鱼，侧躺在小鱼板上（尾巴、胸鳍、眼睛都在水平面上，从上往下看就认得出）
    const fish = makeFlatFish(f, 0.165);
    fish.rotation.y = -0.85;          // 尾巴朝左前方，从上往下看能看见扇形尾
    fish.position.y = 0.046;
    g.add(fish);
    // 一片柠檬 + 一片叶子 + 一点红（摆盘，也让人一眼看出"这是条鱼"）
    const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 10), std(0xf2d75a, 0.6));
    lemon.position.set(0.115, 0.034, -0.085);
    g.add(lemon);
    const chili = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), std(0xd0452f, 0.7));
    chili.position.set(-0.115, 0.032, -0.055);
    chili.scale.set(1.7, 0.55, 0.6);
    g.add(chili);
    const leafG = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), std(0x5f8a52, 0.9));
    leafG.position.set(-0.03, 0.036, 0.105);
    leafG.scale.set(1.7, 0.18, 0.75);
    leafG.rotation.y = 0.7;
    g.add(leafG);
    g.visible = venueOf() === 'home';
    // 注意：要加在 scene 上，不能加在码头的 root 上 ——
    // 一回家 root 就是 visible=false，盘子会跟着一起被藏掉（花店踩过同一个坑）
    scene.add(g);
    fr.homeFish = g;
    homeSay = true;
  }

  let homeSay = false;

  function eatHome() {
    if (!st.home) return;
    st.home = 0;
    save();
    if (fr.homeFish) { if (fr.homeFish.parent) fr.homeFish.parent.remove(fr.homeFish); fr.homeFish = null; }
    if (sfx && sfx.pickup) sfx.pickup();
    say('把这条鱼煎了，配一碗白饭 —— 自己钓的格外香 🍚', 4200);
  }

  function homeTick(venue) {
    if (fr.homeFish) fr.homeFish.visible = (venue === 'home');
    if (venue === 'home' && st.home && homeSay) {
      homeSay = false;
      if (tip) tip('餐桌上多了一盘鱼 🐟 点它能煎来吃', 3800);
    }
  }

  /* ============================ 贴图 / 镜头 ============================ */
  function boardTexTalk() {
    const rows = [
      { k: 'silver', name: '小银鱼' }, { k: 'puffer', name: '小河豚' },
      { k: 'trout', name: '彩虹鳟' }, { k: 'whale', name: '小鲸鱼' }
    ];
    const parts = [];
    rows.forEach(function (r) {
      const n = st.kinds[r.k] || 0;
      if (n > 0) parts.push(r.name + '×' + n);
    });
    return parts.length ? parts.join('、') : '还一条都没钓到呢';
  }

  function talkBoard() {
    if (sfx && sfx.blip) sfx.blip();
    const maxLine = st.best > 0 ? '；最长的一条 ' + Math.round(st.best * 100) + ' cm' : '';
    if (interact && interact.say) {
      interact.say(new THREE.Vector3(BOARD.x + 0.1, BOARD.y + 0.16, BOARD.z),
        '渔获记录：' + boardTexTalk() + '。一共 ' + st.total + ' 条' + maxLine +
        (st.whales ? '；放生过 ' + st.whales + ' 条小鲸鱼' : '') +
        (st.junk ? '；还捞了 ' + st.junk + ' 件垃圾' : ''), 6.5);
    }
  }

  /* ============================ 每帧 ============================ */
  function applyLook(day) {
    if (fr.amb) fr.amb.intensity = day ? 0.30 : 0.10;
    if (fr.hemi) fr.hemi.intensity = day ? 0.42 : 0.14;
    if (fr.sun) {
      fr.sun.intensity = day ? 1.15 : 0.10;
      fr.sun.color.setHex(day ? 0xfff0d2 : 0x9fb6e0);
    }
    if (fr.moon) fr.moon.visible = !day;
    if (fr.moonHalo) fr.moonHalo.visible = !day;
    if (fr.skyTex !== (day ? fr.skyDay : fr.skyNight) && fr.sky) {
      fr.skyTex = day ? fr.skyDay : fr.skyNight;
      fr.sky.material.map = fr.skyTex;
      fr.sky.material.needsUpdate = true;
    }
    // 水色跟着天光走
    if (fr.water) {
      fr.water.material.color.setHex(day ? 0xa9d2de : 0x5f8fa4);
      fr.water.material.emissive.setHex(day ? 0x000000 : 0x0d1826);
      fr.water.material.emissiveIntensity = day ? 0 : 0.5;
    }
    if (fr.shine) fr.shine.material.opacity = day ? 0.5 : 0.30;
    // 灯
    for (let i = 0; i < fr.lampLights.length; i++) {
      const L = fr.lampLights[i];
      L.l.intensity = day ? 0 : L.base;
    }
    for (let i = 0; i < fr.lanterns.length; i++) {
      fr.lanterns[i].emissiveIntensity = day ? 0.16 : 1.1;
    }
    for (let i = 0; i < fr.bulbMats.length; i++) {
      fr.bulbMats[i].emissiveIntensity = day ? 0.32 : 1.25;
    }
    if (fr.winMat) fr.winMat.emissiveIntensity = day ? 0.06 : 0.85;
    if (fr.lighthouse) fr.lighthouse.material.emissiveIntensity = day ? 0.25 : 1.6;
    if (fr.sun && fr.sun.shadow) fr.sun.shadow.needsUpdate = true;
  }

  function update(dt, camPos) {
    if (!root || !root.visible) return;
    t += dt;
    const day = getMode() === 'day';

    if (framesDay !== day) {
      framesDay = day;
      applyLook(day);
    }
    // M74：天球跟着玩家走 —— 码头有 40 米长，原来球钉在 (206,0,0)，
    // 走到尽头天上只剩 30 米，远处的湖面和山会被"切"掉
    if (fr.sky && camPos) {
      fr.sky.position.x = camPos.x;
      fr.sky.position.z = camPos.z;
    }

    // 水面漂 + 高光漂
    if (fr.waterTex) {
      fr.waterTex.offset.x += dt * 0.010;
      fr.waterTex.offset.y += dt * 0.006;
    }
    if (fr.shine) {
      fr.shine.material.map.offset.x -= dt * 0.022;
      fr.shine.material.map.offset.y += dt * 0.010;
    }
    // 荷叶轻轻转
    for (let i = 0; i < fr.pads.length; i++) {
      const p = fr.pads[i];
      p.m.rotation.z += dt * 0.05;
      p.m.position.x = p.x0 + Math.sin(t * 0.5 + p.ph) * 0.05;
      p.m.position.z = p.z0 + Math.cos(t * 0.42 + p.ph) * 0.05;
    }
    // 芦苇摇
    if (fr.reeds) {
      for (let i = 0; i < fr.reeds.length; i++) {
        const r = fr.reeds[i];
        r.g.rotation.z = Math.sin(t * 1.1 + r.ph) * 0.045;
        r.g.rotation.x = Math.cos(t * 0.9 + r.ph) * 0.035;
      }
    }
    // 猫尾巴 + 白鹭点头
    if (fr.catTail) fr.catTail.rotation.x = Math.sin(t * 1.4) * 0.22;
    if (fr.catBody) fr.catBody.rotation.y = Math.sin(t * 0.24) * 0.06;
    if (fr.egret) fr.egret.rotation.y = Math.sin(t * 0.33) * 0.22;
    // 小船随着水轻轻起伏
    if (fr.boat) {
      fr.boat.position.y = WATER_Y + 0.06 + Math.sin(t * 0.85) * 0.035;
      fr.boat.rotation.z = Math.sin(t * 0.62 + 0.8) * 0.022;
      fr.boat.rotation.x = Math.cos(t * 0.5 + 0.3) * 0.016;
    }

    // 水下的鱼影绕圈
    for (let i = 0; i < fr.shadowFish.length; i++) {
      const s = fr.shadowFish[i];
      const a = t * s.sp + s.ph;
      s.m.position.x = s.cx + Math.cos(a) * s.r;
      s.m.position.z = s.cz + Math.sin(a) * s.r * 1.4;
      s.m.rotation.z = -a + Math.PI / 2;
    }

    // 涟漪
    for (let i = 0; i < fr.rings.length; i++) {
      const r = fr.rings[i];
      if (!r.m.visible) continue;
      r.life += dt;
      const u = r.life / 0.9;
      if (u >= 1) { r.m.visible = false; r.m.material.opacity = 0; continue; }
      const sc = 1 + u * 4.2;
      r.m.scale.set(sc, sc, 1);
      r.m.material.opacity = (1 - u) * 0.7;
    }

    // ---- 钓鱼状态机 ----
    st.pt += dt;
    if (st.phase === 'fly') {
      const u = clamp01(st.pt / 0.42);
      if (fr.bobber) {
        const y = WATER_Y + 0.05 + Math.sin(u * Math.PI) * 1.5;
        fr.bobber.position.y = y;
      }
      if (u >= 1) { beginWait(); boom({ x: st.bx, z: st.bz }); if (sfx && sfx.splash) sfx.splash(); }
    } else if (st.phase === 'wait') {
      if (fr.bobber) fr.bobber.position.y = WATER_Y + 0.05 + Math.sin(t * 2.2) * 0.012;
      if (st.pt >= st.biteIn) bite();
    } else if (st.phase === 'bite') {
      st.win -= dt;
      if (fr.bobber) {
        fr.bobber.position.y = WATER_Y - 0.11 + Math.sin(t * 26) * 0.02;
      }
      if (fr.bang) {
        const s = 0.42 + Math.sin(t * 18) * 0.05;
        fr.bang.scale.set(s, s, 1);
        fr.bang.position.y = WATER_Y + 0.62 + Math.sin(t * 6) * 0.05;
      }
      if (st.win <= 0) missBite();
    } else if (st.phase === 'land') {
      const u = clamp01(st.pt / 0.55);
      if (fr.caught && fr.caughtFrom && fr.caughtTo) {
        const a = fr.caughtFrom, b2 = fr.caughtTo;
        fr.caught.position.x = a.x + (b2.x - a.x) * u;
        fr.caught.position.z = a.z + (b2.z - a.z) * u;
        fr.caught.position.y = a.y + (b2.y - a.y) * u + Math.sin(u * Math.PI) * 1.25;
        fr.caught.rotation.z = -u * 5.2;
        fr.caught.rotation.y = u * 2.0;
      }
      if (u >= 1) {
        st.phase = 'hold';
        st.pt = 0;
        if (fr.caught) { fr.caught.rotation.z = -0.15; fr.caught.position.y = 0.10; }
        boom({ x: st.bx, z: st.bz });
      }
    } else if (st.phase === 'hold') {
      // 鱼在栈道上蹦两下，然后飞进簍里
      if (fr.caught) {
        fr.caught.position.y = 0.10 + Math.abs(Math.sin(st.pt * 9)) * 0.09;
        fr.caught.rotation.y += dt * 1.2;
      }
      if (st.pt > 0.95) {
        st.phase = 'idle';
        st.pt = 0;
        const f = st.kind;
        if (fr.caught) {
          if (f && f.junk) {
            // 垃圾直接消失（扔桶里了）
            if (fr.caught.parent) fr.caught.parent.remove(fr.caught);
          } else {
            // 飞进鱼簍
            fr.caught.position.set(BUCKET.x, 0.52, BUCKET.z);
            fr.caught.scale.setScalar(0.6);
            fr.caught.visible = false;
            if (fr.bucketWater) {
              fr.bucketWater.visible = true;
              fr.bucketWater.scale.setScalar(1.0 + Math.min(0.3, st.basket.length * 0.03));
            }
          }
          if (fr.caught && fr.caught.visible === false) fr.caught = fr.caught;   // 留着下次重建
        }
        st.kind = null;
        if (fr.bobber) fr.bobber.visible = false;
        if (fr.line) fr.line.visible = false;
      }
    }

    // 鱼线：从手上到浮标
    if (fr.line && fr.line.visible && fr.lineGeo && fr.bobber) {
      let sx = RODTIP.x, sy = RODTIP.y, sz = RODTIP.z;
      if (camera) {
        // 用镜头的右手偏下一点当竿尖，看哪儿都自然
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        sx = camera.position.x + fwd.x * 0.55 + right.x * 0.32;
        sy = camera.position.y + fwd.y * 0.55 + right.y * 0.32 - 0.34;
        sz = camera.position.z + fwd.z * 0.55 + right.z * 0.32;
      }
      const arr = fr.lineGeo.attributes.position.array;
      arr[0] = sx; arr[1] = sy; arr[2] = sz;
      arr[3] = fr.bobber.position.x; arr[4] = fr.bobber.position.y + 0.20; arr[5] = fr.bobber.position.z;
      fr.lineGeo.attributes.position.needsUpdate = true;
      fr.lineGeo.computeBoundingSphere();
    }
    if (fr.bang) fr.bang.visible = (st.phase === 'bite');

    // 手上的竿
    if (fr.handRod) {
      const show = (st.phase === 'fly' || st.phase === 'wait' || st.phase === 'bite');
      fr.handRod.visible = show;
      if (show && camera) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        fr.handRod.position.set(
          camera.position.x + fwd.x * 0.42 + right.x * 0.30,
          camera.position.y + fwd.y * 0.42 + right.y * 0.30 - 0.5,
          camera.position.z + fwd.z * 0.42 + right.z * 0.30
        );
        fr.handRod.quaternion.copy(camera.quaternion);
        fr.handRod.rotateX(0.62);
        fr.handRod.rotateZ(-0.24);
      }
    }

    // 灯笼轻微明暗（像被风吹）
    for (let i = 0; i < fr.lampLights.length; i++) {
      const L = fr.lampLights[i];
      if (L.l.intensity > 0.01) {
        L.l.intensity = L.base * (0.9 + Math.sin(t * 3.1 + i * 2.2) * 0.1);
      }
    }
  }

  let framesDay = null;

  /* ============================ 接线 ============================ */
  function clamp(x, z, oldX, oldZ) {
    let nx = x, nz = z;
    if (nx < DECK.x0 + 0.34) nx = DECK.x0 + 0.34;
    if (nx > DECK.x1 - 0.34) nx = DECK.x1 - 0.34;
    if (nz < DECK.z0 + 0.30) nz = DECK.z0 + 0.30;
    if (nz > DECK.z1 - 0.30) nz = DECK.z1 - 0.30;
    return { x: nx, z: nz };
  }

  function debug() {
    return {
      phase: st.phase,
      basket: st.basket.length,
      total: st.total,
      kinds: st.kinds,
      best: +(st.best.toFixed(3)),
      whales: st.whales,
      junk: st.junk,
      home: st.home,
      money: walletOf()
    };
  }

  /* ============================ build ============================ */
  function build(o) {
    try {
      scene = o.scene;
      interact = o.interact;
      sfx = o.sfx;
      tip = o.tip;
      camera = o.camera || null;
      if (o.isFishNow) isFishNow = o.isFishNow;
      if (o.isFishing) isFishNow = o.isFishing;
      if (o.getMode) getMode = o.getMode;
      if (o.onDoor) onDoor = o.onDoor;
      if (o.wallet) walletOf = o.wallet;
      if (o.earn) earn = o.earn;
      if (o.venue) venueOf = o.venue;

      root = new THREE.Group();
      root.name = 'fishing-venue';
      root.visible = false;
      scene.add(root);

      load();

      // ---------- 灯 ----------
      const amb = new THREE.AmbientLight(0x9fb4c8, 0.30);
      root.add(amb);
      fr.amb = amb;
      const hemi = new THREE.HemisphereLight(0xd8ecf4, 0x4f5e50, 0.42);
      root.add(hemi);
      fr.hemi = hemi;
      const sun = new THREE.DirectionalLight(0xfff0d2, 1.15);
      sun.position.set(206, 14, 8);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 1024;
      sun.shadow.mapSize.height = 1024;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 40;
      sun.shadow.camera.left = -9;
      sun.shadow.camera.right = 9;
      sun.shadow.camera.top = 9;
      sun.shadow.camera.bottom = -9;
      sun.shadow.bias = -0.0012;
      sun.target.position.set(202.6, 0, 0);
      root.add(sun);
      root.add(sun.target);
      fr.sun = sun;

      makeSky();
      makeWater();
      makeDeck();
      makeHut();
      makeProps();
      makeBoard();
      makeTackle();

      // ---------- 能点的地方 ----------
      if (interact) {
        // 水面：抛竿 / 收杆
        interact.add({
          id: 'fish-water', label: '水面',
          // M81：以前这块水面热区有 1.1m 厚（-0.45~0.65），整个盖在小船上面 ——
          // 妈妈点小船永远点到"水面"。改成贴着水面的一层薄板，小船就能露出来了。
          box: [207.0, WATER_Y + 0.02, 0.2, 5.6, 0.18, 5.4],
          anchor: [206.2, 0.5, 0.3],
          when: function () { return !!isFishNow(); },
          onClick: function () { tap(); },
          say: function () {
            if (st.phase === 'bite') return '！快收杆！';
            if (st.phase === 'wait') return '等浮标沉下去…';
            if (st.phase === 'fly') return '抛竿中…';
            return st.basket.length >= MAX_FISH ? '鱼簍满了，先卖给收鱼的船' : '点这里抛竿 🎣';
          }
        });

        // 鱼簍：卖鱼 / 带一条回家
        interact.add({
          id: 'fish-basket', label: '鱼簍',
          box: [BUCKET.x, 0.30, BUCKET.z, 0.62, 0.72, 0.62],
          anchor: [BUCKET.x, 0.62, BUCKET.z],
          when: function () { return !!isFishNow(); },
          onClick: function () {
            if (sfx && sfx.blip) sfx.blip();
            if (!st.basket.length) {
              say('鱼簍还是空的 —— 点水面抛竿吧 🎣（钓到了再点我就是卖）', 3400);
              return;
            }
            sellBasket();
          },
          say: function () {
            return st.basket.length ? '鱼簍 ' + st.basket.length + '/' + MAX_FISH + '（点一下卖鱼）' : '空的鱼簍';
          }
        });

        // 渔获黑板
        interact.add({
          id: 'fish-board', label: '渔获记录',
          box: [HUT.x1 + 0.14, 1.52, -2.00, 0.24, 0.76, 1.02],
          anchor: [HUT.x1 + 0.24, 1.72, -2.00],
          when: function () { return !!isFishNow(); },
          onClick: talkBoard,
          say: function () { return '渔获记录 · 点一下看看钓到过什么'; }
        });

        // 小屋窗口：长袋子 / 带鱼回家
        interact.add({
          id: 'fish-hut', label: '小屋窗口',
          box: [HUT.x1 + 0.14, 1.60, -1.00, 0.24, 0.94, 0.98],
          anchor: [HUT.x1 + 0.26, 1.74, -1.00],
          when: function () { return !!isFishNow(); },
          onClick: function () {
            if (sfx && sfx.blip) sfx.blip();
            if (st.home) { say('桌上那盘还没吃呢。吃完了再带 🍽️', 3000); return; }
            if (!st.basket.length) { say('窗口后面没人。一个小牌子写着：「租竿免费，鱼簍自备」', 3600); return; }
            takeHome();
          },
          say: function () { return '小屋窗口 · 拿个袋子带鱼回家'; }
        });

        // 猫
        interact.add({
          id: 'fish-cat', label: '木箱上的猫',
          box: [CAT.x, 0.62, CAT.z, 0.72, 0.7, 0.78],
          anchor: [CAT.x, 0.9, CAT.z],
          when: function () { return !!isFishNow(); },
          onClick: function () {
            if (sfx && sfx.cat) sfx.cat();
            const lines = [
              '猫看了我一眼，又把头埋回尾巴里 —— 它在等谁钓上小鱼',
              '它打了个哈欠，尾巴尖轻轻摆了一下',
              '猫蹭了蹭我的手腕，然后继续睡（在木箱上睡了一下午）'
            ];
            if (interact && interact.say) {
              interact.say(new THREE.Vector3(CAT.x, 0.95, CAT.z), lines[Math.floor(Math.random() * lines.length)], 4);
            }
          },
          say: function () { return '睡在木箱上的猫'; }
        });

        // 小船
        interact.add({
          id: 'fish-boat', label: '小船',
          box: [BOAT.x, WATER_Y + 0.2, BOAT.z, 1.5, 0.7, 1.1],
          anchor: [BOAT.x, WATER_Y + 0.6, BOAT.z],
          // M81：小船浮在水面里，水面那个大盒子会先挡到 → 小船优先
          prio: 2,
          when: function () { return !!isFishNow(); },
          onClick: function () {
            if (sfx && sfx.blip) sfx.blip();
            if (interact && interact.say) {
              interact.say(new THREE.Vector3(BOAT.x, WATER_Y + 0.6, BOAT.z),
                st.basket.length ? '船上没人。船板上放着一杆秤 —— 收鱼的船傍晚来' : '船上没人。船板上放着一杆秤，还有半桶水', 4.2);
            }
          },
          say: function () { return '系在木桩上的小船'; }
        });

        // 家里餐桌上那盘鱼
        interact.add({
          id: 'fish-home', label: '盘子里的鱼',
          // 盒子要从上面罩下来（y 0.93~1.68）：妈妈是从桌边俯视点它的，
          // 盒子只要"高过餐桌那个大热区"就一定先被射线撞到（以前只到 1.08，斜着看就漏过去了）
          box: [HOME_PLATE.x, 1.30, HOME_PLATE.z, 0.56, 0.75, 0.56],
          anchor: [HOME_PLATE.x, HOME_PLATE.y + 0.30, HOME_PLATE.z],
          when: function () { return venueOf() === 'home' && !!st.home; },
          onClick: eatHome,
          say: function () { return '今天钓的鱼 · 煎来吃'; }
        });
      }

      placeHome();
      applyLook(getMode() === 'day');
      framesDay = (getMode() === 'day');

      return {
        root: root,
        setVisible: function (v) {
          const on = !!v;
          if (root) root.visible = on;
          if (on) {
            applyLook(getMode() === 'day');
            if (fr.sun && fr.sun.shadow) fr.sun.shadow.needsUpdate = true;
            if (st.phase !== 'idle') {
              // 重新进来时把半截动作收干净
              st.phase = 'idle';
              if (fr.bobber) fr.bobber.visible = false;
              if (fr.line) fr.line.visible = false;
              if (fr.bang) fr.bang.visible = false;
            }
          }
        },
        clamp: clamp,
        update: update,
        homeTick: homeTick,
        tap: tap,
        cast: beginCast,
        reel: onReel,
        sell: sellBasket,
        takeHome: takeHome,
        eatHome: eatHome,
        spawn: { x: 200.56, y: 1.62, z: -0.20, yaw: -Math.PI / 2 + 0.06 },
        spawnOutside: { x: 70.15, y: 1.62, z: 27.66, yaw: Math.PI / 2 },
        debug: debug,
        // 测试用：直接跳到「咬钩」那一下，不用等
        _forceBite: function () {
          if (st.phase === 'idle') { beginCast(); st.phase = 'wait'; st.biteIn = 0; }
          if (st.phase === 'wait') { st.biteIn = 0; bite(); }
          return st.phase;
        },
        // 测试用：一次把「抛竿 → 咬钩 → 收杆」跑完（中间不等，免得踩到咬钩窗口的时间）
        _catchNow: function () {
          if (st.phase === 'idle') beginCast();
          if (st.phase === 'fly' || st.phase === 'wait') { st.phase = 'wait'; st.biteIn = 0; bite(); }
          if (st.phase === 'bite') onReel();
          return st.kind ? st.kind.k : null;
        },
        // 测试用：连钓 n 条（把动画直接收掉，免得等 hold）
        _fastCatch: function (n) {
          const out = [];
          const clearFx = function () {
            if (fr.caught) { if (fr.caught.parent) fr.caught.parent.remove(fr.caught); fr.caught = null; }
            if (fr.bobber) fr.bobber.visible = false;
            if (fr.line) fr.line.visible = false;
            if (fr.bang) fr.bang.visible = false;
          };
          for (let i = 0; i < (n || 1); i++) {
            st.phase = 'idle';
            clearFx();
            beginCast();
            st.phase = 'wait'; st.biteIn = 0;
            bite();
            onReel();
            out.push(st.kind ? st.kind.k : null);
          }
          st.phase = 'idle';
          clearFx();
          return out;
        },
        // 截图用：直接塞满鱼簍（不经过动画）
        _fillBasket: function (n) {
          const pool = ['silver', 'puffer', 'trout'];
          const cnt = (n === undefined || n === null) ? 4 : n;
          for (let i = 0; i < cnt; i++) {
            const f = fishOf(pool[i % pool.length]);
            st.basket.push({ k: f.k, price: f.price, size: rnd(f.len[0], f.len[1]) });
            st.kinds[f.k] = (st.kinds[f.k] || 0) + 1;
            st.total++;
          }
          save();
          drawBoard();
          if (fr.bucketWater) fr.bucketWater.scale.setScalar(1.16);
          return st.basket.length;
        }
      };
    } catch (e) {
      if (window.console) console.warn('[小D] 码头建失败：', e);
      return fallback();
    }
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      update: function () {},
      homeTick: function () {},
      tap: function () {}, cast: function () {}, reel: function () {},
      sell: function () { return 0; }, takeHome: function () { return false; }, eatHome: function () {},
      spawn: { x: 200.56, y: 1.62, z: -0.20, yaw: -Math.PI / 2 + 0.06 },
      spawnOutside: { x: 70.15, y: 1.62, z: 27.66, yaw: Math.PI / 2 },
      debug: function () { return null; },
      _forceBite: function () { return 'idle'; }
    };
  }

  return { build: build };
})();
