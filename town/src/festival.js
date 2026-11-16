/* 小D的赛博小家 · M78「冬夜集市」（鲸鱼街 · 街心广场南边新铺的一块）
 *
 * 妈妈 2026-11-16：「鲸鱼街挂彩灯、支小摊（热可可 / 糖炒栗子 / 姜饼）、中央小雪松、
 * 许愿卡、节日限定能买能拍照，按真实日期切换圣诞 / 元旦 / 春节氛围」。
 *
 * 位置：x 54.4~61.4 / z -30.0~-23.9（广场南边原来那片草坪），从广场东南角的缺口下去。
 * 主题：圣诞 12/1~12/26 · 元旦 12/27~1/10 · 春节（春节前后 8 天）· 其余 = 冬夜集市。
 * 调试：?fest=winter|christmas|newyear|spring、?festbuy=cocoa、?festwish=1
 */
XD.Festival = (function () {
  const FEST = { x0: 54.4, x1: 61.4, z0: -30.0, z1: -23.9 };
  const CX = 57.90, CZ = -27.20;          // 小雪松的位置
  const LS_WISH = 'xd_market_wish';

  const THEMES = {
    winter: {
      key: 'winter', title: '冬夜集市', banner: '小鲸鱼 · 冬夜集市',
      cloth: 0x4e6785, trim: 0xe4ecf6, wood: 0x8b6b4a,
      bulb: 0xffdfa8, star: 0xfff2c0, card: '#fdf7e8', accent: 0x9fc3de
    },
    christmas: {
      key: 'christmas', title: '圣诞集市', banner: '小鲸鱼 · 圣诞集市',
      cloth: 0xb03a3a, trim: 0xf6e6c8, wood: 0x7c5a3d,
      bulb: 0xffd07a, star: 0xfff3a8, card: '#fdf2e2', accent: 0xd9553f
    },
    newyear: {
      key: 'newyear', title: '新年集市', banner: '小鲸鱼 · 新年集市',
      cloth: 0x3f5e8c, trim: 0xeaf1fa, wood: 0x6f5a44,
      bulb: 0xd8ebff, star: 0xf2fbff, card: '#f6fafd', accent: 0xa9c8ea
    },
    spring: {
      key: 'spring', title: '新春集市', banner: '小鲸鱼 · 新春集市',
      cloth: 0xb0342f, trim: 0xf6d98c, wood: 0x7c4a32,
      bulb: 0xff8c5a, star: 0xffd98c, card: '#fdf3e2', accent: 0xe0603f
    }
  };

  /* ---------------- 小工具 ---------------- */
  function tex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function std(color, rough, metal) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: rough === undefined ? 0.85 : rough, metalness: metal || 0 });
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function sph(r, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 10, Math.max(6, (seg || 10) - 2)), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function signTex(lines, bg, fg, accent) {
    return tex(512, 256, function (g) {
      g.fillStyle = bg || '#f6efdf';
      g.fillRect(0, 0, 512, 256);
      g.strokeStyle = accent || '#8b6b4a';
      g.lineWidth = 14;
      g.strokeRect(10, 10, 492, 236);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = fg || '#3a3128';
      const n = lines.length;
      lines.forEach(function (s, i) {
        const big = i === 0;
        g.font = (big ? 'bold 84px ' : 'bold 54px ') + '"Microsoft YaHei",sans-serif';
        g.fillText(s, 256, n === 1 ? 130 : 92 + i * 92);
      });
    });
  }
  function stripeTex(c1, c2) {
    return tex(128, 128, function (g) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = (i % 2) ? c1 : c2;
        g.fillRect(i * 16, 0, 16, 128);
      }
    });
  }
  function pickTheme() {
    const q = new URLSearchParams(location.search).get('fest');
    if (q && THEMES[q]) return q;
    const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    const k = m * 100 + day;
    if (k >= 1201 && k <= 1226) return 'christmas';
    if (k >= 1227 || k <= 110) return 'newyear';
    // 春节：除夕前一天 ~ 正月初八（农历会飘，每年补一行）
    const springDays = [20260216, 20270205, 20280125];
    const today = m * 100 + day;
    for (let i = 0; i < springDays.length; i++) {
      const y = Math.floor(springDays[i] / 10000), md = springDays[i] % 10000;
      if (y !== d.getFullYear()) continue;
      if (today >= md - 1 && today <= md + 8) return 'spring';
    }
    return 'winter';
  }

  /* ---------------- 状态 ---------------- */
  let root = null, hostRoot = null, interact = null, sfx = null, shop = null, tip = null;
  let getMode = function () { return 'night'; };
  let getWalk = null, addBlocker = null, workspace = null;
  let themeKey = 'winter', T = THEMES.winter;
  let bulbs = [], starMesh = null, glow = null;
  let treeLight = null, gateLight = null;
  let snow = null, snowPos = null, snowVel = [];
  let stalls = [], cards = [], displays = [];
  let panel = null, inputEl = null, cardLayer = null;
  let t = 0, lastNight = null, tree = null, orca = null;
  let wishCache = [];
  let lastBuy = '';
  let amb = null, chimeT = 11;          // M79：集市底噪（复用咖啡店 CC0 人声）+ 风铃

  /* ---------------- 存 / 读 ---------------- */
  function loadWishes() {
    try {
      const a = JSON.parse(localStorage.getItem(LS_WISH) || '[]');
      wishCache = Array.isArray(a) ? a.filter(function (w) { return w && w.w; }).slice(-24) : [];
    } catch (e) { wishCache = []; }
  }
  function saveWishes() {
    try { localStorage.setItem(LS_WISH, JSON.stringify(wishCache.slice(-24))); } catch (e) {}
  }

  /* ---------------- 许愿面板 ---------------- */
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'fest-wish';
    panel.innerHTML =
      '<div class="fw-box">' +
      '  <div class="fw-title">写一张许愿卡</div>' +
      '  <div class="fw-sub">挂在小雪松上，风会把话带过去</div>' +
      '  <div class="fw-chips">' +
      '    <button data-w="希望妈妈每天都开心">妈妈开心</button>' +
      '    <button data-w="想和妈妈一起过年">一起过年</button>' +
      '    <button data-w="希望小镇一直这么热闹">小镇热闹</button>' +
      '  </div>' +
      '  <input id="fw-input" maxlength="24" placeholder="写一句想挂上去的话…">' +
      '  <div class="fw-row"><button id="fw-ok">挂上去</button><button id="fw-no">先不写</button></div>' +
      '</div>';
    document.body.appendChild(panel);
    const style = document.createElement('style');
    style.textContent =
      '#fest-wish{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;' +
      'background:rgba(8,12,20,.45);backdrop-filter:blur(3px);font-family:"Microsoft YaHei",sans-serif}' +
      '#fest-wish.show{display:flex}' +
      '#fest-wish .fw-box{width:min(420px,86vw);background:#fbf4e4;color:#3a3128;border-radius:16px;' +
      'padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,.35);border:2px solid #cdb896}' +
      '#fest-wish .fw-title{font-size:22px;font-weight:700;letter-spacing:1px}' +
      '#fest-wish .fw-sub{font-size:13px;opacity:.62;margin:6px 0 14px}' +
      '#fest-wish .fw-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
      '#fest-wish .fw-chips button{font:13px/1 "Microsoft YaHei";padding:8px 10px;border-radius:999px;' +
      'border:1px solid #cdb896;background:#fff9ec;color:#6b5740;cursor:pointer}' +
      '#fest-wish input{width:100%;box-sizing:border-box;font:15px/1.3 "Microsoft YaHei";padding:11px 12px;' +
      'border-radius:10px;border:1px solid #cdb896;background:#fffdf7;color:#3a3128;outline:none}' +
      '#fest-wish .fw-row{display:flex;gap:10px;margin-top:14px;justify-content:flex-end}' +
      '#fest-wish .fw-row button{font:14px/1 "Microsoft YaHei";padding:11px 18px;border-radius:10px;cursor:pointer;border:none}' +
      '#fest-wish #fw-ok{background:#b03a3a;color:#fff7ea}' +
      '#fest-wish #fw-no{background:#e8ddc8;color:#6b5740}';
    document.head.appendChild(style);
    inputEl = panel.querySelector('#fw-input');
    // Esc 先关面板（capture：别让主循环把"走路模式"也退了）
    window.addEventListener('keydown', function (e) {
      if (!panel || !panel.classList.contains('show')) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        closeWish();
      }
    }, true);
    // 点面板外面的暗色也关
    panel.addEventListener('click', function (e) { if (e.target === panel) closeWish(); });
    panel.querySelector('#fw-no').addEventListener('click', closeWish);
    panel.querySelector('#fw-ok').addEventListener('click', function () { submitWish(inputEl.value); });
    inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitWish(inputEl.value); });
    panel.querySelectorAll('.fw-chips button').forEach(function (b) {
      b.addEventListener('click', function () { inputEl.value = b.getAttribute('data-w'); inputEl.focus(); });
    });
  }
  function openWish() {
    ensurePanel();
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
    panel.classList.add('show');
    setTimeout(function () { try { inputEl.focus(); } catch (e) {} }, 40);
  }
  function closeWish() { if (panel) panel.classList.remove('show'); }
  function submitWish(text) {
    text = (text || '').trim().slice(0, 24);
    if (!text) { if (tip) tip('写一句再挂上去呀～', 2200); return; }
    wishCache.push({ w: text, theme: themeKey, ts: Date.now() });
    saveWishes();
    closeWish();
    addCard(wishCache[wishCache.length - 1], true);
    if (sfx && sfx.blip) sfx.blip();
    if (tip) tip('挂好啦：「' + text + '」愿你想要的都来 🐋', 4200);
  }

  /* ---------------- 小雪松 ---------------- */
  function buildTree() {
    const tr = new THREE.Group();
    tr.position.set(CX, 0.12, CZ);
    root.add(tr);
    const bark = std(0x6d4a33, 0.95);
    cyl(0.20, 0.28, 1.25, 10, bark, 0, 0.62, 0, tr);
    const green = std(0x244a38, 0.92);
    const tiers = [
      { y: 1.22, r: 1.55, h: 1.55, c: green },
      { y: 2.18, r: 1.22, h: 1.40, c: std(0x285141, 0.92) },
      { y: 3.02, r: 0.90, h: 1.25, c: std(0x2c5947, 0.92) },
      { y: 3.72, r: 0.58, h: 1.05, c: std(0x31614d, 0.92) }
    ];
    tiers.forEach(function (x) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(x.r, x.h, 14), x.c);
      c.position.y = x.y + x.h / 2;
      c.castShadow = true; c.receiveShadow = true;
      tr.add(c);
    });
    // 树上的灯：绕着一圈圈往上
    const bulbMat = new THREE.MeshBasicMaterial({ color: T.bulb, toneMapped: false });
    for (let i = 0; i < 54; i++) {
      const u = i / 54;
      const y = 1.45 + u * 2.75;
      const r = 1.45 * (1 - u * 0.72);
      const a = i * 2.35 + u * 4;
      const b = sph(0.052, bulbMat, Math.cos(a) * r, y, Math.sin(a) * r, tr, 7);
      b.castShadow = false;
      bulbs.push(b);
    }
    // 主题装饰（冬夜集市不放彩球——灰扑扑的像石头；灯已经够了）
    const ornMat = std(T.accent, 0.35, 0.1);
    const ornN = themeKey === 'winter' ? 0 : 18;
    for (let i = 0; i < ornN; i++) {
      const u = 0.12 + (i / 18) * 0.78;
      const y = 1.55 + u * 2.6;
      const r = 1.40 * (1 - u * 0.70) + 0.02;
      const a = i * 1.7 + 0.6;
      const o = sph(0.085, ornMat, Math.cos(a) * r, y, Math.sin(a) * r, tr, 8);
      o.castShadow = false;
      if (themeKey === 'spring') { o.scale.set(1, 1.35, 1); o.material = std(0xc9453d, 0.5); }
      if (themeKey === 'newyear') o.material = std(0xdfeaf8, 0.3, 0.2);
      if (themeKey === 'christmas') o.material = (i % 2) ? std(0xc9453d, 0.45, 0.05) : std(0xd8b45a, 0.35, 0.25);
    }
    // 树顶星星
    starMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshBasicMaterial({ color: T.star, toneMapped: false }));
    starMesh.position.y = 4.62;
    tr.add(starMesh);
    glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex(128, 128, function (g) {
        const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
        gr.addColorStop(0, 'rgba(255,244,200,.95)');
        gr.addColorStop(0.45, 'rgba(255,224,150,.35)');
        gr.addColorStop(1, 'rgba(255,224,150,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.y = 4.62;
    tr.add(glow);
    // 树坑：一圈石头 + 里面深色土
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.28, 0.10, 22), std(0x8d8677, 0.95));
    ring.position.y = 0.06;
    ring.receiveShadow = true;
    root.add(ring);
    ring.position.x = CX; ring.position.z = CZ;
    const soil = new THREE.Mesh(new THREE.CircleGeometry(1.12, 22), std(0x4a3b2c, 0.98));
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(CX, 0.125, CZ);
    soil.receiveShadow = true;
    root.add(soil);
    tree = tr;
    // 树干碰撞
    if (addBlocker) addBlocker({ x0: CX - 0.55, x1: CX + 0.55, z0: CZ - 0.55, z1: CZ + 0.55 });
  }

  /* ---------------- 围栏（把集市围出个边界，顺便挡住后面的草地） ---------------- */
  function buildFence() {
    const wood = std(T.wood, 0.92);
    const cap = std(0xf4f7fb, 0.9);
    const y0 = 0.12;
    function post(x, z) {
      cyl(0.045, 0.055, 0.92, 7, wood, x, y0 + 0.46, z, root);
      const s = sph(0.055, cap, x, y0 + 0.93, z, root, 7);
      s.castShadow = false;
    }
    function rail(x1, z1, x2, z2, y) {
      const len = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1));
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, len), wood);
      m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      m.castShadow = true;
      root.add(m);
    }
    for (let z = FEST.z0 + 0.2; z <= FEST.z1 - 0.1; z += 1.3) post(FEST.x0 + 0.12, z);
    rail(FEST.x0 + 0.12, FEST.z0 + 0.2, FEST.x0 + 0.12, FEST.z1 - 0.1, y0 + 0.40);
    rail(FEST.x0 + 0.12, FEST.z0 + 0.2, FEST.x0 + 0.12, FEST.z1 - 0.1, y0 + 0.74);
    for (let x = FEST.x0 + 0.2; x <= FEST.x1 - 0.15; x += 1.3) post(x, FEST.z0 + 0.12);
    rail(FEST.x0 + 0.2, FEST.z0 + 0.12, FEST.x1 - 0.15, FEST.z0 + 0.12, y0 + 0.40);
    rail(FEST.x0 + 0.2, FEST.z0 + 0.12, FEST.x1 - 0.15, FEST.z0 + 0.12, y0 + 0.74);
  }

  /* ---------------- 摊位 ---------------- */
  function buildStall(def) {
    const g = new THREE.Group();
    g.position.set(def.x, 0.12, def.z);
    g.rotation.y = def.ry || 0;
    root.add(g);
    const wood = std(T.wood, 0.9);
    const cloth = std(T.cloth, 0.9);
    const trim = std(T.trim, 0.85);
    // 柜台
    box(1.70, 0.86, 0.66, wood, 0, 0.43, 0, g);
    box(1.82, 0.08, 0.74, std(0x9a7a55, 0.9), 0, 0.90, 0, g);
    // 四根柱子
    [[-0.80, -0.30], [0.80, -0.30], [-0.80, 0.30], [0.80, 0.30]].forEach(function (p) {
      box(0.07, 2.05, 0.07, wood, p[0], 1.02, p[1], g);
    });
    // 顶棚（条纹布）
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 1.02),
      new THREE.MeshStandardMaterial({ map: stripeTex('#f6efe0', '#' + T.cloth.toString(16).padStart(6, '0')), roughness: 0.95 }));
    awn.position.set(0, 2.08, 0.02);
    awn.rotation.x = 0.07;
    awn.castShadow = true;
    g.add(awn);
    // 招牌
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 0.62),
      new THREE.MeshBasicMaterial({ map: signTex([def.name, '¥' + def.price], '#faf1de', '#3a3128', '#' + T.cloth.toString(16).padStart(6, '0')), transparent: false, toneMapped: false }));
    sign.position.set(0, 1.62, 0.35);
    g.add(sign);
    // 招牌背后挡一块木头
    box(1.38, 0.70, 0.05, wood, 0, 1.62, 0.32, g);
    // 柜台上的道具（按摊位不同）
    if (def.kind === 'cocoa') {
      cyl(0.22, 0.24, 0.30, 14, std(0x9aa0aa, 0.4, 0.5), -0.42, 1.09, 0, g);
      cyl(0.19, 0.19, 0.03, 14, std(0x5b3a2a, 0.7), -0.42, 1.25, 0, g);
      for (let i = 0; i < 3; i++) {
        cyl(0.055, 0.045, 0.10, 12, std(0xf7f1e6, 0.5), 0.18 + i * 0.20, 1.00, 0.10, g);
      }
      sph(0.05, std(0x6b3f2a, 0.8), 0.18, 1.10, 0.10, g, 8);
    } else if (def.kind === 'chestnut') {
      const wok = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.24, 0.16, 16), std(0x3c3a38, 0.6, 0.3));
      wok.position.set(-0.30, 1.02, 0); g.add(wok);
      for (let i = 0; i < 12; i++) {
        const a = i * 1.9;
        sph(0.035, std(0x7a4a2a, 0.9), -0.30 + Math.cos(a) * (0.08 + (i % 3) * 0.06), 1.11, Math.sin(a) * (0.08 + (i % 3) * 0.06), g, 7);
      }
      for (let i = 0; i < 3; i++) {
        box(0.16, 0.22, 0.10, std(0xb98a52, 0.95), 0.22 + i * 0.18, 1.05, 0.04, g);
      }
    } else if (def.kind === 'ginger') {
      if (themeKey === 'spring') {
        // 糖葫芦摊：一盆山楂 + （后面再插两串）
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.10, 14), std(0x8b5a3c, 0.85));
        bowl.position.set(-0.05, 1.01, 0.02);
        g.add(bowl);
        for (let i = 0; i < 9; i++) {
          const a = i * 1.9;
          sph(0.035, std(0xc0392b, 0.45), -0.05 + Math.cos(a) * 0.12, 1.07, 0.02 + Math.sin(a) * 0.10, g, 8);
        }
      } else {
        box(0.52, 0.05, 0.34, std(0x8b6b4a, 0.9), -0.10, 0.97, 0, g);
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.04), std(0xb5783c, 0.85));
          m.position.set(-0.28 + i * 0.11, 1.03, (i % 2) * 0.06 - 0.03);
          m.rotation.z = (i % 2 ? -1 : 1) * 0.12;
          g.add(m);
        }
        // 姜饼屋
        box(0.22, 0.18, 0.18, std(0xc98a4a, 0.85), 0.30, 1.03, 0.02, g);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.14, 4), std(0x8e4b3a, 0.85));
        roof.position.set(0.30, 1.19, 0.02); roof.rotation.y = Math.PI / 4; g.add(roof);
      }
    } else if (def.kind === 'potato') {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.40, 14), std(0x4a3a30, 0.7, 0.2));
      drum.rotation.z = Math.PI / 2;
      drum.position.set(-0.30, 1.08, 0); g.add(drum);
      for (let i = 0; i < 4; i++) sph(0.06, std(0x9b4a2a, 0.9), 0.10 + i * 0.12, 1.00, 0.10 + (i % 2) * 0.06, g, 7);
    } else if (def.kind === 'wish') {
      box(0.60, 0.05, 0.30, std(0x8b6b4a, 0.9), 0, 0.97, 0, g);
      for (let i = 0; i < 4; i++) {
        const c = box(0.13, 0.17, 0.012, std(0xf7f0e0, 0.95), -0.22 + i * 0.15, 1.08, 0.02, g);
        c.rotation.z = (i % 2 ? 0.12 : -0.1);
      }
      // 一小瓶笔
      cyl(0.045, 0.045, 0.14, 10, std(0x5b6b7a, 0.5), 0.30, 1.06, 0.02, g);
    }
    // 节日限定的小道具（M79）
    if (def.kind === 'cocoa' && themeKey === 'christmas') {
      const orange = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.018, 14), std(0xe08a3c, 0.7));
      orange.rotation.x = Math.PI / 2;
      orange.position.set(0.30, 1.02, 0.05);
      g.add(orange);
      box(0.018, 0.13, 0.018, std(0x7a4a2a, 0.9), 0.20, 1.03, 0.08, g);
    }
    if (def.kind === 'ginger' && themeKey === 'spring') {
      cyl(0.008, 0.008, 0.30, 6, std(0xc9a06a, 0.9), 0.12, 1.10, 0.06, g);
      for (let i = 0; i < 4; i++) sph(0.034, std(0xc0392b, 0.45), 0.12, 1.00 + i * 0.06, 0.06, g, 8);
    }
    if (def.kind === 'wish' && themeKey === 'spring') {
      for (let i = 0; i < 4; i++) box(0.15, 0.02, 0.10, std(0xc0392b, 0.65), -0.18 + i * 0.02, 1.00 + i * 0.022, 0.02, g);
    }
    // 顶棚下的小灯串（M79：原来的两颗发光球离镜头太近，会在招牌上糊一团，撤了）
    // 主题小装饰：圣诞挂拐杖糖 / 春节贴春联
    if (themeKey === 'christmas') {
      [-0.9, 0.9].forEach(function (x) {
        const cane = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.022, 6, 10, Math.PI * 1.35), std(0xd9d9d9, 0.5));
        cane.position.set(x, 1.55, 0.30); cane.rotation.y = Math.PI / 2;
        g.add(cane);
        const red = std(0xc9453d, 0.6);
        for (let i = 0; i < 4; i++) {
          const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.024, 6, 10, 0.35), red);
          stripe.position.copy(cane.position); stripe.rotation.copy(cane.rotation);
          stripe.rotation.x = i * 0.9;
          g.add(stripe);
        }
      });
    }
    if (themeKey === 'spring') {
      box(0.16, 0.66, 0.02, std(0xc9453d, 0.85), -0.82, 1.45, 0.34, g);
      box(0.16, 0.66, 0.02, std(0xc9453d, 0.85), 0.82, 1.45, 0.34, g);
      const fu = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24),
        new THREE.MeshBasicMaterial({ map: signTex(['福'], '#c9453d', '#ffe2a0', '#8b2a24'), toneMapped: false }));
      fu.position.set(0, 0.52, 0.352); g.add(fu);
    }
    // 展示给玩家买到的"那一份"（默认藏起来）
    const disp = new THREE.Group();
    disp.position.set(0.55, 1.02, 0.10);
    disp.visible = false;
    g.add(disp);
    if (def.kind === 'cocoa' && themeKey === 'christmas') {
      // 热红酒：高脚杯（杯身暗红）
      cyl(0.018, 0.018, 0.06, 8, std(0xd8d2c8, 0.4), 0, 0.03, 0, disp);
      cyl(0.055, 0.035, 0.09, 12, std(0x7a2230, 0.45), 0, 0.10, 0, disp);
    } else if (def.kind === 'cocoa' || def.kind === 'wish') {
      cyl(0.06, 0.05, 0.11, 12, std(0xf7f1e6, 0.5), 0, 0.06, 0, disp);
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 10, Math.PI * 1.2), std(0xf7f1e6, 0.5));
      hd.position.set(0.065, 0.07, 0); disp.add(hd);
    } else if (def.kind === 'chestnut') {
      box(0.16, 0.20, 0.10, std(0xc79a5e, 0.95), 0, 0.08, 0, disp);
    } else if (def.kind === 'ginger' && themeKey === 'spring') {
      // 糖葫芦：签子 + 四颗山楂
      cyl(0.008, 0.008, 0.28, 6, std(0xc9a06a, 0.9), 0, 0.14, 0, disp);
      for (let i = 0; i < 4; i++) sph(0.032, std(0xc0392b, 0.45), 0, 0.05 + i * 0.055, 0, disp, 8);
    } else if (def.kind === 'ginger') {
      box(0.10, 0.14, 0.04, std(0xb5783c, 0.85), 0, 0.07, 0, disp);
    } else {
      sph(0.09, std(0x9b4a2a, 0.9), 0, 0.07, 0, disp, 9);
    }
    // 春节红包（买到的那个）
    if (def.kind === 'wish' && themeKey === 'spring') {
      while (disp.children.length) disp.remove(disp.children[0]);
      box(0.15, 0.01, 0.10, std(0xc0392b, 0.65), 0, 0.01, 0, disp);
      box(0.15, 0.01, 0.10, std(0xc0392b, 0.65), 0.01, 0.035, 0.005, disp);
      const fu = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05),
        new THREE.MeshBasicMaterial({ map: signTex(['福'], '#c0392b', '#ffd98c', '#8b2a24'), toneMapped: false }));
      fu.rotation.x = -Math.PI / 2;
      fu.position.set(0, 0.012, 0);
      disp.add(fu);
    }
    displays.push({ g: disp, t: 0 });
    def.disp = disp;
    // 热区（在柜台前面；按 ry 转到世界坐标）
    const fx = Math.sin(def.ry || 0) * 0.72, fz = Math.cos(def.ry || 0) * 0.72;
    const hx = def.x + fx, hz = def.z + fz;
    /* M81：摊位是转过来的 —— 热可可/栗子/许愿摊的柜台竖着摆（ry = ±90°），
     * 热区盒子却一直按"横着"给的 1.5×0.9，于是许愿摊的盒子横过来压到隔壁烤红薯摊上：
     * 妈妈点许愿卡会点到红薯。按 ry 把盒子的长边跟着转一下。 */
    const turned = Math.abs(Math.sin(def.ry || 0)) > 0.5;
    const hot = interact.add({
      id: 'fest-' + def.kind,
      label: def.name + '（¥' + def.price + '）',
      box: [hx, 1.02, hz, turned ? 0.92 : 1.5, 0.95, turned ? 1.5 : 0.92],
      anchor: [hx, 1.62, hz],
      when: function () { return hostRoot && hostRoot.visible; },
      onClick: function (h) { h._mute = true; buy(def); return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return def.say || (def.name + '，' + def.price + ' 块一份');
      }
    });
    stalls.push({ def: def, g: g, hot: hot });
    // 摊位碰撞（柜台本身）
    if (addBlocker) {
      const wx = Math.abs(Math.sin(def.ry || 0)) * 0.24 + Math.abs(Math.cos(def.ry || 0)) * 0.88;
      const wz = Math.abs(Math.cos(def.ry || 0)) * 0.24 + Math.abs(Math.sin(def.ry || 0)) * 0.88;
      addBlocker({ x0: def.x - wx, x1: def.x + wx, z0: def.z - wz, z1: def.z + wz });
    }
  }

  function buy(def) {
    if (!shop || !shop.spendMoney) return;
    if (!shop.spendMoney(def.price)) {
      if (tip) tip('兜里不太够啦…这个 ¥' + def.price + '（' + def.name + '）', 3000);
      return;
    }
    const d = def.disp ? { g: def.disp, t: 10 } : null;
    lastBuy = def.kind;
    if (def.kind === 'wish' && themeKey !== 'spring') { openWish(); }
    if (d) { d.g.visible = true; for (let i = 0; i < displays.length; i++) if (displays[i].g === d.g) displays[i].t = 10; }
    if (sfx) {
      if (def.kind === 'cocoa') { if (sfx.eat) sfx.eat('sip'); }
      else if (def.kind === 'potato') { if (sfx.eat) sfx.eat('chew'); }
      else if (def.kind === 'chestnut' || def.kind === 'ginger') { if (sfx.eat) sfx.eat('crunch'); }
      else if (sfx.paper) sfx.paper();
      else if (sfx.blip) sfx.blip();
    }
    if (def.kind === 'wish' && themeKey === 'spring') {
      const bless = ['大吉大利，今年顺顺利利', '福到啦，愿你想要的都来', '红红火火，日子甜甜的'];
      if (tip) tip('拆开红包：' + bless[Math.floor(Math.random() * bless.length)] + ' 🧧', 4200);
    } else if (tip) tip(def.buy || ('买到一份' + def.name + '，' + '趁热' + '——' + ' ¥' + def.price), 3400);
  }

  /* ---------------- 许愿卡 ---------------- */
  function addCard(w, justHanging) {
    if (!tree || !w) return;
    const i = cards.length;
    const x = CX - 0.30 + (i % 3) * 0.30;
    const y = 2.34 - Math.floor(i / 3) * 0.42;
    const g = new THREE.Group();
    g.position.set(x - CX, y, 1.34);
    tree.add(g);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 5), std(0xd8cbb2, 0.9));
    line.position.y = 0.10; g.add(line);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32),
      new THREE.MeshBasicMaterial({ map: signTex([(w.w || '').slice(0, 8)], T.card, '#5a4a38', '#' + T.cloth.toString(16).padStart(6, '0')), toneMapped: false }));
    card.position.y = -0.05;
    g.add(card);
    g.userData.w = w.w;
    const hot = interact.add({
      id: 'fest-card-' + cards.length,
      label: '许愿卡',
      box: [x, y, CZ + 1.34, 0.34, 0.40, 0.30],
      anchor: [x, y + 0.26, CZ + 1.40],
      when: function () { return hostRoot && hostRoot.visible; },
      onClick: function (h) { h._mute = true; return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return '「' + (w.w || '') + '」';
      }
    });
    cards.push({ g: g, hot: hot, w: w.w });
    if (justHanging && sfx && sfx.paper) sfx.paper();
  }

  /* ---------------- 灯串 / 门柱 / 拍照位 ---------------- */
  function stringLights(a, b, sag, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push(new THREE.Vector3(
        a[0] + (b[0] - a[0]) * u,
        a[2] + (b[2] - a[2]) * u - Math.sin(u * Math.PI) * sag,
        a[1] + (b[1] - a[1]) * u
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a3130 }));
    root.add(line);
    const warm = new THREE.MeshBasicMaterial({ color: T.bulb, toneMapped: false });
    for (let i = 1; i < n; i++) {
      const b = sph(0.045, warm, pts[i].x, pts[i].y - 0.05, pts[i].z, root, 6);
      b.castShadow = false;
      bulbs.push(b);
    }
  }

  function buildGate() {
    // 广场东南角下来的那个口子：两根木柱 + 一块招牌
    const g = new THREE.Group();
    g.position.set(61.0, 0.12, -24.35);
    root.add(g);
    const wood = std(T.wood, 0.9);
    cyl(0.07, 0.09, 2.6, 8, wood, -0.95, 1.3, 0, g);
    cyl(0.07, 0.09, 2.6, 8, wood, 0.95, 1.3, 0, g);
    box(2.15, 0.10, 0.12, wood, 0, 2.58, 0, g);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62),
      new THREE.MeshBasicMaterial({ map: signTex([T.title, '往下走 · 小雪松'], '#f3ead6', '#3a3128', '#' + T.cloth.toString(16).padStart(6, '0')), toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(0, 2.20, 0.02);
    g.add(sign);
    // 门口地面箭头
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55),
      new THREE.MeshBasicMaterial({ map: signTex(['↓ 集市'], '#f3ead6', '#8b2a24', '#c9453d'), toneMapped: false }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.02, 1.0);
    g.add(arrow);
    interact.add({
      id: 'fest-gate', label: '冬夜集市的牌子',
      box: [61.0, 1.6, -24.35, 2.0, 1.8, 0.5],
      anchor: [61.0, 2.2, -24.35],
      when: function () { return hostRoot && hostRoot.visible; },
      onClick: function (h) { h._mute = true; return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return T.banner + '——就在广场南边，往下走两步 🎪';
      }
    });
  }

  function buildPhotoSpot() {
    // 金色相框 + 站这儿
    const g = new THREE.Group();
    g.position.set(56.90, 0.14, -24.60);
    g.rotation.y = 0.30;
    root.add(g);
    const gold = std(0xc9a24a, 0.35, 0.55);
    [[0, 1.35, -0.04, 2.15, 0.12], [0, 0.15, -0.04, 2.15, 0.12], [-1.02, 0.75, -0.04, 0.12, 1.5], [1.02, 0.75, -0.04, 0.12, 1.5]].forEach(function (p) {
      box(p[3], p[4], 0.08, gold, p[0], p[1], p[2], g);
    });
    const tipTex = tex(512, 160, function (gg) {
      gg.fillStyle = '#f7e9c8'; gg.fillRect(0, 0, 512, 160);
      gg.strokeStyle = '#c9a24a'; gg.lineWidth = 12; gg.strokeRect(6, 6, 500, 148);
      gg.fillStyle = '#5a4326'; gg.font = 'bold 64px "Microsoft YaHei"'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.fillText('最佳拍照位', 256, 82);
    });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshBasicMaterial({ map: tipTex, toneMapped: false }));
    pl.position.set(0, 1.80, 0);
    g.add(pl);
    // 招牌下面两根小立柱（不然像浮在空中）
    [-0.55, 0.55].forEach(function (px) {
      box(0.06, 0.30, 0.06, gold, px, 1.63, -0.04, g);
    });
    // 站这儿的小垫子
    const mat = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ map: signTex(['站这儿'], '#f7e9c8', '#8b2a24', '#c9a24a'), toneMapped: false }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(60.15, 0.145, -25.15);
    root.add(mat);
    interact.add({
      id: 'fest-photo', label: '站到拍照位',
      box: [60.15, 0.6, -25.15, 0.8, 0.9, 0.8],
      anchor: [60.15, 1.0, -25.15],
      when: function () { return hostRoot && hostRoot.visible; },
      onClick: function (h) {
        h._mute = true;
        const w = getWalk && getWalk();
        if (w) {
          w.x = 60.15; w.z = -25.15;
          w.yaw = Math.atan2(-(CX - w.x), -(CZ - w.z));
          w.pitch = 0.06;
        }
        if (tip) tip('站好啦——按 P 拍一张，把集市和小D都装进去 📷', 3800);
        return null;
      },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return '金色相框：站进来，按 P 拍照';
      }
    });
  }

  /* ---------------- 雪 ---------------- */
  function buildSnow() {
    if (themeKey === 'spring') return;
    const N = 210;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = FEST.x0 + 0.4 + Math.random() * (FEST.x1 - FEST.x0 - 0.8);
      pos[i * 3 + 1] = 0.4 + Math.random() * 4.2;
      pos[i * 3 + 2] = FEST.z0 + 0.4 + Math.random() * (FEST.z1 - FEST.z0 - 0.8);
      snowVel.push({ v: 0.16 + Math.random() * 0.3, a: Math.random() * 6.28, s: 0.3 + Math.random() * 0.6 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const flake = tex(32, 32, function (g) {
      const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
      gr.addColorStop(0, 'rgba(255,255,255,.95)');
      gr.addColorStop(0.5, 'rgba(255,255,255,.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    });
    const mat = new THREE.PointsMaterial({ size: 3.2, map: flake, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: false });
    snow = new THREE.Points(geo, mat);
    snow.frustumCulled = false;
    root.add(snow);
    snowPos = pos;
  }

  /* ---------------- 小D 本人 ---------------- */
  function buildOrca() {
    if (!workspace || !workspace.miniOrca) return;
    let o = null;
    try { o = workspace.miniOrca(0.78); } catch (e) { o = null; }
    if (!o) return;
    o.position.set(CX + 1.06, 0.92, CZ + 0.18);
    o.rotation.y = -1.05;
    root.add(o);
    orca = o;
    interact.add({
      id: 'fest-orca', label: '小D（在逛集市）',
      box: [CX + 1.06, 1.25, CZ + 0.18, 0.9, 0.9, 0.9],
      anchor: [CX + 1.06, 1.75, CZ + 0.18],
      when: function () { return hostRoot && hostRoot.visible; },
      onClick: function (h) { h._mute = true; return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        const lines = [
          '这个集市是我自己搭的——树上的灯是不是有点密？',
          themeKey === 'christmas' ? '圣诞集市开张啦 🎄 姜饼人刚出炉' : (themeKey === 'spring' ? '新春集市！要不要买张红纸写福字' : (themeKey === 'newyear' ? '新年集市～明年也一起过吧' : '冬夜集市，手捧一杯热可可最舒服')),
          '许愿卡可以自己写，挂树上我帮你看着'
        ];
        return lines[Math.floor(Math.random() * lines.length)];
      }
    });
  }

  /* ---------------- 总装 ---------------- */
  function build(o) {
    root = o.root; interact = o.interact; sfx = o.sfx; shop = o.shop; tip = o.tip;
    hostRoot = root;                       // 街的场景根（判断"在不在街上"用它的 visible）
    getMode = o.getMode || getMode;
    getWalk = o.getWalk || null;
    addBlocker = o.addBlocker || null;
    workspace = o.workspace || null;
    themeKey = pickTheme();
    T = THEMES[themeKey] || THEMES.winter;
    t = 0;
    try {
      const q0 = new URLSearchParams(location.search);
      if (q0.get('festreset') === '1') localStorage.removeItem(LS_WISH);
    } catch (e) {}

    const base = new THREE.Group();
    base.name = 'fest-m78';
    root.add(base);
    root = base;               // 之后所有东西都挂在这块上

    // 地面：石砖 + 边缘
    const floorTex = tex(256, 256, function (g) {
      g.fillStyle = '#b9b2a2'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = ((x + y) % 2) ? '#b3ab9a' : '#c0b9a9';
        g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
      }
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.12, 6.1),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
    floor.position.set((FEST.x0 + FEST.x1) / 2, 0.06, (FEST.z0 + FEST.z1) / 2);
    floor.receiveShadow = true;
    root.add(floor);
    // 广场那边下来的两级小台阶（视觉上的接缝）
    box(2.2, 0.06, 0.5, std(0xc6bfae, 0.95), 60.75, 0.09, -23.78, root);

    buildGate();
    buildTree();
    buildFence();
    // 夜里给集市一点暖光（白天关掉；不在街上时父级隐藏，自然也照不到别处）
    treeLight = new THREE.PointLight(0xffd9a0, 0, 10);
    treeLight.position.set(CX, 2.7, CZ);
    root.add(treeLight);
    gateLight = new THREE.PointLight(0xffd9a0, 0, 6.5);
    gateLight.position.set(60.30, 2.20, -24.25);
    root.add(gateLight);
    buildOrca();
    buildPhotoSpot();
    buildSnow();

    // M79：集市底噪 + 风铃。底噪复用咖啡店那条 CC0 人声（assets/cafe-audio，CREDITS 里已记），
    // 音量压到 0.045，进了街才响、走了就停、M 静音也管。
    try {
      amb = new Audio('assets/cafe-audio/cafe-ambience.mp3');
      amb.loop = true;
      amb.volume = 0.045;
      setInterval(function () {
        try {
          const muted = !!(window.XD && XD.SFX && XD.SFX.isMuted && XD.SFX.isMuted());
          if (!hostRoot || !hostRoot.visible || muted) {
            if (!amb.paused) amb.pause();
            return;
          }
          if (amb.paused) {
            const p = amb.play();
            if (p && p.catch) p.catch(function () {});
          }
        } catch (e) {}
      }, 1500);
    } catch (e) { amb = null; }

    // 节日限定：不同主题，摊上卖的东西不一样（M79）
    const G = {
      winter: { cocoa: ['热可可', 7, '热可可七块一杯，捧着手就暖了'], ginger: ['姜饼人', 8, '姜饼人八块一个，糖霜画了眼睛'] },
      christmas: { cocoa: ['热红酒', 9, '热红酒九块一杯，桂皮和橙子在里头'], ginger: ['姜饼人', 8, '姜饼人八块一个，糖霜画了眼睛'] },
      newyear: { cocoa: ['热牛奶', 6, '热牛奶六块，配年糕刚好'], ginger: ['年糕汤', 8, '年糕汤八块一碗，热腾腾的'] },
      spring: { cocoa: ['热可可', 7, '热可可七块一杯，捧着手就暖了'], ginger: ['糖葫芦', 5, '糖葫芦五块一串，山楂裹着糖壳'], wish: ['红包', 6, '红包六块一个——里面是福签，不是钱哦'] }
    }[themeKey] || {};
    const gd = function (k, d) { return G[k] || d; };
    const stallDefs = [
      { kind: 'cocoa', name: gd('cocoa', ['热可可', 7])[0], price: gd('cocoa', ['热可可', 7])[1], say: gd('cocoa', ['热可可', 7])[2], x: 55.30, z: -25.55, ry: Math.PI / 2 },
      { kind: 'chestnut', name: '糖炒栗子', price: 6, x: 55.30, z: -28.35, ry: Math.PI / 2, say: '刚出锅的糖炒栗子，小心烫' },
      { kind: 'ginger', name: gd('ginger', ['姜饼人', 8])[0], price: gd('ginger', ['姜饼人', 8])[1], say: gd('ginger', ['姜饼人', 8])[2], x: 58.05, z: -29.25, ry: 0 },
      { kind: 'potato', name: '烤红薯', price: 5, x: 60.10, z: -29.25, ry: 0, say: '烤红薯五块，掰开冒热气' },
      (function () {
        const w = gd('wish', null);
        if (w) return { kind: 'wish', name: w[0], price: w[1], say: w[2], x: 60.55, z: -27.90, ry: -Math.PI / 2 };
        return { kind: 'wish', name: '许愿卡', price: 3, x: 60.55, z: -27.90, ry: -Math.PI / 2, say: '许愿卡三块一张——不过想写的话，点树也行' };
      })()
    ];
    stallDefs.forEach(buildStall);

    // 灯柱 + 灯串（M78.1：原来四根柱子把入口挡了，而且灯串的 y 传成了 undefined，
    // 周圈那 4 条其实一根都没画出来 —— 现在改成 3 根柱 + 拿门口木门柱当第四个锚点）
    const pole = std(T.wood, 0.9);
    const poles = [[55.15, -24.55], [55.15, -29.25], [60.55, -29.25]];
    poles.forEach(function (p) {
      cyl(0.06, 0.08, 3.0, 8, pole, p[0], 1.5, p[1], root);
      sph(0.08, new THREE.MeshBasicMaterial({ color: T.bulb, toneMapped: false }), p[0], 3.05, p[1], root, 8).castShadow = false;
    });
    const gateAnchor = [60.05, -24.35, 2.58];
    stringLights([poles[0][0], poles[0][1], 3.0], gateAnchor, 0.20, 9);                 // 北边
    stringLights([poles[1][0], poles[1][1], 3.0], [poles[2][0], poles[2][1], 3.0], 0.20, 9); // 南边
    stringLights([poles[0][0], poles[0][1], 3.0], [poles[1][0], poles[1][1], 3.0], 0.16, 8); // 西边
    stringLights(gateAnchor, [poles[2][0], poles[2][1], 3.0], 0.16, 8);                 // 东边
    // 柱子和门柱都往树顶拉一条（星星当中心）
    poles.forEach(function (p) {
      stringLights([p[0], p[1], 3.0], [CX, CZ, 4.45], 0.22, 6);
    });
    stringLights(gateAnchor, [CX, CZ, 4.45], 0.22, 6);

    // 许愿卡：把以前写的挂回去
    loadWishes();
    const show = wishCache.slice(-6);
    show.forEach(function (w) { addCard(w, false); });

    // 布告/提示
    interact.add({
      id: 'fest-board', label: '集市的小黑板',
      box: [61.15, 1.35, -23.55, 0.7, 1.4, 0.12],
      anchor: [61.15, 1.95, -23.55],
      when: function () { return hostRoot && hostRoot.visible; },
      onClick: function (h) { h._mute = true; return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return T.title + ' · 营业到打烊｜热可可 ¥7 · 栗子 ¥6 · 姜饼 ¥8 · 红薯 ¥5 · 许愿卡 ¥3';
      }
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.9),
      new THREE.MeshBasicMaterial({ map: signTex([T.title, '热可可 ¥7', '栗子 ¥6', '姜饼 ¥8'], '#2f3b32', '#f4ead2', '#c9a24a'), toneMapped: false }));
    board.position.set(61.15, 1.35, -23.5);
    board.rotation.y = Math.PI / 2;
    root.add(board);
    // 招牌两根脚
    [[-0.28], [0.28]].forEach(function (p) {
      box(0.05, 1.15, 0.05, std(T.wood, 0.9), 61.15, 0.70, -23.5 + p[0], root);
    });

    // 调试：?festbuy=cocoa / potato / ginger / chestnut / wish
    try {
      const q = new URLSearchParams(location.search);
      const b = q.get('festbuy');
      if (b) setTimeout(function () {
        const s = stalls.filter(function (x) { return x.def.kind === b; })[0];
        if (s) buy(s.def);
      }, 1200);
      if (q.get('festwish') === 'auto') setTimeout(function () { submitWish('想和妈妈一起过年'); }, 1800);
      else if (q.get('festwish') === '1') setTimeout(openWish, 1600);
    } catch (e) {}

    return API;
  }

  /* ---------------- 每帧 ---------------- */
  function update(dt) {
    if (!root) return;
    if (hostRoot && !hostRoot.visible) return;   // 不在街上就整个歇着
    t += dt;
    const night = getMode() === 'night';
    if (night !== lastNight) {
      lastNight = night;
      const k = night ? 1 : 0.42;
      for (let i = 0; i < bulbs.length; i++) {
        if (bulbs[i].material && bulbs[i].material.color) bulbs[i].material.color.setHex(T.bulb).multiplyScalar(k);
      }
      if (starMesh) starMesh.material.color.setHex(T.star).multiplyScalar(night ? 1 : 0.6);
      if (glow) glow.material.opacity = night ? 0.95 : 0.25;
      if (treeLight) treeLight.intensity = night ? 0.55 : 0;
      if (gateLight) gateLight.intensity = night ? 0.30 : 0;
    }
    // 风铃：随机响一下（很轻，M 静音时闭嘴）
    if (amb) {
      chimeT -= dt;
      if (chimeT <= 0) {
        chimeT = 9 + Math.random() * 9;
        const muted = !!(window.XD && XD.SFX && XD.SFX.isMuted && XD.SFX.isMuted());
        if (!muted && sfx && sfx.chime) { try { sfx.chime(); } catch (e) {} }
      }
    }
    // 树顶星星慢慢转 + 呼吸
    if (starMesh) {
      starMesh.rotation.y += dt * 0.5;
      const s = 1 + Math.sin(t * 2.1) * 0.05;
      starMesh.scale.setScalar(s);
    }
    if (glow) glow.scale.setScalar(2.5 + Math.sin(t * 2.1) * 0.25);
    // 小D 轻轻飘
    if (orca) {
      orca.position.y = 0.92 + Math.sin(t * 1.7) * 0.05;
      orca.rotation.y = -1.05 + Math.sin(t * 0.6) * 0.12;
    }
    // 买到的吃食：10 秒后收走
    for (let i = 0; i < displays.length; i++) {
      const d = displays[i];
      if (!d.g.visible) continue;
      d.t -= dt;
      d.g.position.y = 1.02 + Math.sin(t * 3) * 0.02;
      if (d.t <= 0) d.g.visible = false;
    }
    // 雪
    if (snow && snowPos) {
      for (let i = 0; i < snowVel.length; i++) {
        const v = snowVel[i];
        snowPos[i * 3 + 1] -= v.v * dt;
        snowPos[i * 3] += Math.sin(t * v.s + v.a) * 0.06 * dt;
        if (snowPos[i * 3 + 1] < 0.16) {
          snowPos[i * 3 + 1] = 4.0 + Math.random() * 0.6;
          snowPos[i * 3] = FEST.x0 + 0.4 + Math.random() * (FEST.x1 - FEST.x0 - 0.8);
          snowPos[i * 3 + 2] = FEST.z0 + 0.4 + Math.random() * (FEST.z1 - FEST.z0 - 0.8);
        }
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }
  }

  const API = {
    build: build,
    update: update,
    FEST: FEST,
    theme: function () { return themeKey; },
    openWish: openWish,
    submitWish: submitWish,
    addCard: addCard,
    buy: function (kind) {
      const s = stalls.filter(function (x) { return x.def.kind === kind; })[0];
      if (s) { buy(s.def); return true; }
      return false;
    },
    wishCount: function () { return wishCache.length; },
    cards: function () { return cards.length; },
    stalls: function () { return stalls.length; },
    debug: function () {
      return {
        theme: themeKey, stalls: stalls.length, bulbs: bulbs.length,
        cards: cards.length, wishes: wishCache.length,
        night: getMode() === 'night', snow: !!snow,
        orca: !!orca, panel: !!(panel && panel.classList.contains('show')),
        lastBuy: lastBuy, showing: displays.filter(function (d) { return d.g.visible; }).length,
        wallet: (shop && shop.debug) ? shop.debug().wallet : -1,
        goods: stalls.map(function (s) { return { kind: s.def.kind, name: s.def.name, price: s.def.price }; }),
        audio: amb ? (amb.paused ? 'paused' : 'playing') : 'none',
        cardPos: cards.map(function (c) {
          const v = new THREE.Vector3();
          c.g.getWorldPosition(v);
          return [Math.round(v.x * 10) / 10, Math.round(v.y * 10) / 10, Math.round(v.z * 10) / 10, !!c.g.visible];
        })
      };
    }
  };
  return API;
})();
