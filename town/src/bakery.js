/* ============================================================================
 * M45：鲸鱼街东侧的「鲸麦坊」（面包房）
 *
 *   - 白天开门（早七点到晚上七点）。晚上去，门里黑着，门上挂着「打烊」的牌子。
 *   - 进去能做的：买面包（真扣零花钱）、咬一口、揉面团 → 送进炉子 → 出炉、
 *     摇柜台铃、看窗外的街、跟麦师傅（一只胖棕熊）说话。
 *   - 位置：世界坐标 x = 140 ~ 148、z = -3.2 ~ 3.2
 *     （咖啡馆 100~108、采耳馆 120~128，互相离得远，雾和灯都不会串）
 *   - 声音全部是 sfx.js 现场合成的（bell / knead / ovenDing / crunch / puff），
 *     不另外下音频文件。
 * ==========================================================================*/
window.XD = window.XD || {};
XD.Bakery = (function () {
  'use strict';

  const X0 = 140.0, X1 = 148.0;        // 8m 宽
  const Z0 = -3.2, Z1 = 3.2;           // 6.4m 深
  const H = 3.3;

  const DOOR = { x0: 146.2, x1: 147.3, z: Z1 };
  // 后墙（z = -3.2）左边是炉子、右边是柜台
  const OVEN = { x: 141.25, z: -2.88, w: 1.86, h: 1.95, d: 0.72 };
  const COUNTER = { x0: 142.6, x1: 147.6, z0: -3.10, z1: -2.42, h: 1.02 };
  const CASE = { x0: 142.95, x1: 145.62, z0: -3.04, z1: -2.56, y: 1.05, h: 0.44 };
  const TABLE = { x: 144.55, z: 0.30, w: 1.9, d: 0.95, h: 0.92 };
  const WT = { x: 142.15, z: 2.12, r: 0.42 };     // 窗边小圆桌
  const RACK = { x: 145.85, z: -2.72, w: 0.46, d: 0.32 };   // 柜台上的晾面包架
  const BAKER = { x: 142.86, z: -2.02 };          // 麦师傅站的位置（离案子远一点，别贴着）

  // 柜里那四样（x 是横排的位置，case 里从 143.1 排到 145.4）
  const BREADS = [
    { k: 'croissant', name: '可颂', price: 6, x: 143.13, line: '可颂 ¥6 · 一层一层的，咬下去会掉渣' },
    { k: 'bean', name: '红豆包', price: 5, x: 143.83, line: '红豆包 ¥5 · 豆沙是自己熬的，不太甜' },
    { k: 'whale', name: '鲸鱼包', price: 9, x: 144.53, line: '鲸鱼包 ¥9 · 麦师傅专门给我捏的 🐋' },
    { k: 'toast', name: '吐司', price: 12, x: 145.23, line: '吐司 ¥12 · 一整个，回去可以切厚片' }
  ];
  const CROISSANT = 0, BEAN = 1, WHALE = 2, TOAST = 3;

  let root = null, scene = null, interact = null, sfx = null, tip = null;
  let isBakeryNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let walletOf = function () { return 0; };
  let spend = function () { return true; };

  let t = 0;
  const fr = {
    amb: null, hemi: null, warm: null, ovenLight: null, sun: null,
    bulbs: [], ovenMouth: null, ovenInner: null, ovenBreads: [],
    dough: null, doughBall: null, flourBowl: null,
    bear: null, bearArmL: null, bearArmR: null,
    steam: [], breads: [], bite: null, held: null,
    caseGlass: null, tray: [], sign: null
  };

  // 面团流程：idle → kneading(1..5) → ready → baking(10s) → baked
  const dough = { state: 'idle', n: 0, t: 0, squash: 0, flour: 0 };
  let boughtCount = 0;
  let heldKind = null, heldBites = 0, held = null;   // 手上/柜台上的那块面包
  let cool = 0;

  /* M45.1：打包带回家 —— 纸袋里装着的面包（种类），和家里餐桌上那袋 */
  let venueOf = function () { return 'home'; };
  const bag = [];                        // 打包好的面包种类
  let homeBag = null, homeBagHot = null, homeBread = null, homeBites = 0, homeBagCount = -1;
  const HOME = { bag: { x: 6.72, y: 0.756, z: 0.30 }, plate: { x: 6.32, y: 0.756, z: 0.72 } };

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.9 : rough,
      metalness: metal || 0
    });
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function sph(r, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, (seg || 12) - 2), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || root).add(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, parent, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    (parent || root).add(m);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }
  function say(x, y, z, text, sec) {
    if (interact && interact.say) interact.say(new THREE.Vector3(x, y, z), text, sec || 3.6);
  }

  /* ================= 木头贴图 ================= */
  function woodTex() {
    return canvasTex(512, 512, function (g, W, Hh) {
      g.fillStyle = '#8a6746';
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 8; i++) {
        const y = i / 8 * Hh;
        g.fillStyle = 'rgba(' + (110 + Math.random() * 40) + ',' + (74 + Math.random() * 30) + ',' + (44 + Math.random() * 24) + ',.35)';
        g.fillRect(0, y, W, Hh / 8 - 2);
        // 木纹线
        g.strokeStyle = 'rgba(58,36,20,.22)';
        g.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          const yy = y + 8 + k * 14 + Math.random() * 6;
          g.moveTo(0, yy);
          for (let x = 0; x <= W; x += 64) g.lineTo(x, yy + Math.sin(x * 0.02 + i) * 2.2);
          g.stroke();
        }
        // 板缝
        g.strokeStyle = 'rgba(40,24,12,.4)';
        g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      }
    });
  }

  /* ================= 房间 ================= */
  function buildRoom() {
    const wood = woodTex();
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(3, 2.6);
    const floor = box(X1 - X0, 0.08, Z1 - Z0,
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.88 }),
      (X0 + X1) / 2, 0.04, (Z0 + Z1) / 2);
    floor.receiveShadow = true;

    const wallMat = std(0xe6d2b2, 0.95);       // 奶油色的墙（偏暖一点，别一片惨白）
    const trim = std(0x7d5b3f, 0.9);
    const brick = std(0xa9613f, 0.95);

    // 后墙 z = Z0
    box(X1 - X0, H, 0.12, wallMat, (X0 + X1) / 2, H / 2, Z0 - 0.06);
    box(X1 - X0, 0.2, 0.1, brick, (X0 + X1) / 2, 0.1, Z0 + 0.03);
    // 东西墙
    box(0.12, H, Z1 - Z0, wallMat, X0 - 0.06, H / 2, (Z0 + Z1) / 2);
    box(0.12, H, Z1 - Z0, wallMat, X1 + 0.06, H / 2, (Z0 + Z1) / 2);
    // 天花板 + 两根露出来的木梁
    box(X1 - X0, 0.1, Z1 - Z0, std(0xeee0c6, 0.95), (X0 + X1) / 2, H, (Z0 + Z1) / 2);
    [-1.6, 1.6].forEach(function (bz) {
      box(X1 - X0, 0.16, 0.2, std(0x6b4a30, 0.92), (X0 + X1) / 2, H - 0.1, bz);
    });

    /* 前墙 z = Z1：大窗 + 门 */
    const WinX0 = 140.6, WinX1 = 145.6, zf = Z1;
    // 窗左的墙垛 / 窗下墙 / 窗上墙
    box(WinX0 - X0, H, 0.12, wallMat, (X0 + WinX0) / 2, H / 2, zf - 0.06);
    box(WinX1 - WinX0, 1.0, 0.12, wallMat, (WinX0 + WinX1) / 2, 0.5, zf - 0.06);
    box(WinX1 - WinX0, 0.5, 0.12, wallMat, (WinX0 + WinX1) / 2, H - 0.25, zf - 0.06);
    // 窗和门之间 / 门右
    box(DOOR.x0 - WinX1, H, 0.12, wallMat, (WinX1 + DOOR.x0) / 2, H / 2, zf - 0.06);
    box(X1 - DOOR.x1, H, 0.12, wallMat, (DOOR.x1 + X1) / 2, H / 2, zf - 0.06);
    box(DOOR.x1 - DOOR.x0, H - 2.45, 0.12, wallMat, (DOOR.x0 + DOOR.x1) / 2, (H + 2.45) / 2, zf - 0.06);

    // 大窗：玻璃 + 木框 + 窗台 + 外头的天光
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xbfd6dc), transparent: true, opacity: 0.34, roughness: 0.1, metalness: 0.08
    });
    box(WinX1 - WinX0, 2.1, 0.05, glassMat, (WinX0 + WinX1) / 2, 2.05, zf - 0.02).castShadow = false;
    const frame = std(0x7d5b3f, 0.85);
    box(WinX1 - WinX0 + 0.12, 0.1, 0.14, frame, (WinX0 + WinX1) / 2, 1.0, zf - 0.02);
    box(WinX1 - WinX0 + 0.12, 0.1, 0.14, frame, (WinX0 + WinX1) / 2, 3.1, zf - 0.02);
    [WinX0, WinX0 + 1.25, WinX0 + 2.5, WinX0 + 3.75, WinX1].forEach(function (fx) {
      box(0.09, 2.1, 0.13, frame, fx, 2.05, zf - 0.02);
    });
    box(WinX1 - WinX0 + 0.3, 0.1, 0.36, std(0x8b6b4a, 0.88), (WinX0 + WinX1) / 2, 0.95, zf - 0.22).castShadow = true;
    // 窗外那块亮（外面就是街，这里给一块暖白的"天光"，不然窗外是空的）
    const outMat = new THREE.MeshBasicMaterial({ color: 0xdfeaf2, side: THREE.DoubleSide });
    outMat.toneMapped = false;
    plane(WinX1 - WinX0 + 1.2, 3.2, outMat, (WinX0 + WinX1) / 2, 2.4, zf + 0.5).castShadow = false;
    fr.outPane = outMat;

    // 门：木框 + 玻璃门 + 把手 + 里头的小牌子
    box(DOOR.x1 - DOOR.x0 + 0.22, 2.45, 0.12, trim, (DOOR.x0 + DOOR.x1) / 2, 1.22, zf - 0.06);
    box(DOOR.x1 - DOOR.x0 - 0.1, 2.28, 0.05, glassMat, (DOOR.x0 + DOOR.x1) / 2, 1.16, zf - 0.03).castShadow = false;
    box(0.06, 0.46, 0.06, std(0xc9a86a, 0.4, 0.6), DOOR.x1 - 0.13, 1.1, zf - 0.12);
    const doorSign = canvasTex(256, 96, function (g, W, Hh) {
      g.fillStyle = '#f6ecd8';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9a86a'; g.lineWidth = 5; g.strokeRect(6, 6, W - 12, Hh - 12);
      g.fillStyle = '#6b4a30';
      g.font = 'bold 30px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('鲸 麦 坊', W / 2, 44);
      g.font = '17px "Microsoft YaHei", sans-serif';
      g.fillStyle = '#a07a4a';
      g.fillText('每天现烤 · 早七点到晚七点', W / 2, 74);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: doorSign, toneMapped: false });
    plane(1.0, 0.38, signMat, (DOOR.x0 + DOOR.x1) / 2, 2.72, zf - 0.14).castShadow = false;

    // 门口地垫
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), std(0x8a5a3c, 0.95));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set((DOOR.x0 + DOOR.x1) / 2, 0.085, zf - 0.42);
    root.add(mat);

    // 案板前头一块旧地毯（屋里才不空）
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.9), std(0xb98a6a, 0.98));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(144.2, 0.085, 1.05);
    rug.receiveShadow = true;
    root.add(rug);
    const rugEdge = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 1.78), std(0xcaa286, 0.98));
    rugEdge.rotation.x = -Math.PI / 2;
    rugEdge.position.set(144.2, 0.087, 1.05);
    root.add(rugEdge);

    // 后墙上挂的小画：一只抱着面包的鲸鱼（就用几块色块画）
    const art = canvasTex(256, 180, function (g, W, Hh) {
      g.fillStyle = '#f8f1e0';
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#4d6bfe';
      g.beginPath();
      g.ellipse(120, 100, 62, 40, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(58, 96); g.lineTo(26, 70); g.lineTo(36, 98); g.lineTo(26, 126);
      g.closePath(); g.fill();
      g.fillStyle = '#dce7ff';
      g.beginPath();
      g.ellipse(126, 116, 44, 20, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(158, 88, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1d2a55';
      g.beginPath(); g.arc(159, 88, 4, 0, Math.PI * 2); g.fill();
      // 抱着的那条面包（暖黄）
      g.fillStyle = '#d99a4e';
      g.beginPath();
      g.ellipse(120, 132, 34, 15, -0.18, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b57a34'; g.lineWidth = 3;
      [0, 1, 2].forEach(function (i) {
        g.beginPath();
        g.moveTo(108 + i * 12, 122); g.lineTo(114 + i * 12, 140);
        g.stroke();
      });
    });
    const artMat = new THREE.MeshBasicMaterial({ map: art, toneMapped: false });
    plane(1.16, 0.82, artMat, 146.75, 2.12, Z0 + 0.09).castShadow = false;
    box(1.3, 0.95, 0.05, trim, 146.75, 2.12, Z0 + 0.04).castShadow = false;
  }

  /* ================= 炉子 ================= */
  function buildOven() {
    const brick = std(0xa9613f, 0.96);
    const brick2 = std(0x93513a, 0.96);
    const iron = std(0x3c3a38, 0.6, 0.5);
    const g = new THREE.Group();
    g.position.set(OVEN.x, 0, OVEN.z);
    root.add(g);

    // 炉身（砖砌）+ 圆拱顶
    const bw = OVEN.w, bh = 1.5, bd = OVEN.d;
    box(bw, bh, bd, brick, 0, bh / 2, 0, g);
    // 拱顶：半个球拍扁当"桶形拱"
    const dome = new THREE.Mesh(new THREE.SphereGeometry(bw / 2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), brick2);
    dome.position.set(0, bh, 0);
    dome.scale.set(1, 0.42, bd / bw);
    dome.castShadow = true;
    g.add(dome);
    // 砖缝（几条横的，别太密）
    [-0.42, 0.0, 0.42].forEach(function (dy) {
      box(bw + 0.02, 0.028, bd + 0.02, brick2, 0, bh / 2 + dy, 0, g).castShadow = false;
    });
    // 炉口：拱形的黑洞 + 里面烧着的火
    const mouthW = 0.92, mouthH = 0.6, mz = bd / 2 + 0.01;
    const darkMat = new THREE.MeshStandardMaterial({ color: col(0x1d0f08), roughness: 0.95 });
    box(mouthW + 0.14, mouthH, 0.05, darkMat, 0, 0.86, mz - 0.03, g).castShadow = false;
    // 拱顶那块（用一个小半圆把方口压成拱形）
    const archTop = new THREE.Mesh(new THREE.CircleGeometry(mouthW / 2 + 0.07, 16, 0, Math.PI), darkMat);
    archTop.position.set(0, 0.86 + mouthH / 2, mz - 0.02);
    g.add(archTop);
    const glow = new THREE.MeshStandardMaterial({
      color: col(0x2a1206), emissive: col(0xff8a30), emissiveIntensity: 0.55, roughness: 0.9
    });
    fr.ovenMouth = plane(mouthW - 0.05, mouthH - 0.06, glow, 0, 0.85, mz - 0.1, g);
    fr.ovenMouth.castShadow = false;
    // 石头砌的门框（上沿是拱的：几块小方石拼出来）
    const stone = std(0x8a6a55, 0.95);
    box(mouthW + 0.3, 0.1, 0.12, stone, 0, 0.86 - mouthH / 2 - 0.04, mz + 0.02, g);
    [-1, 1].forEach(function (s) {
      box(0.13, mouthH + 0.1, 0.12, stone, s * (mouthW / 2 + 0.1), 0.86, mz + 0.02, g);
    });
    [-1, 0, 1].forEach(function (k) {
      const st = box(0.3, 0.11, 0.12, stone, k * 0.26, 0.86 + mouthH / 2 + 0.12 - Math.abs(k) * 0.06, mz + 0.02, g);
      st.castShadow = false;
    });
    // 膛里的火苗（三个小圆锥，会跳）
    fr.fire = [];
    for (let i = 0; i < 3; i++) {
      const fm = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85 });
      fm.toneMapped = false;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.075 - i * 0.015, 0.2, 7), fm);
      f.position.set((i - 1) * 0.18, 0.7, mz - 0.02);
      g.add(f);
      fr.fire.push({ m: f, ph: i * 2.1 });
    }
    // 膛里那两条面包（烤的时候才露出来）
    const inner = new THREE.Group();
    inner.position.set(0, 0.66, mz - 0.18);
    inner.visible = false;
    g.add(inner);
    fr.ovenInner = inner;
    for (let i = 0; i < 2; i++) {
      const b = makeBreadShape('toast', 1);
      b.position.set((i - 0.5) * 0.3, 0, 0);
      inner.add(b);
      fr.ovenBreads.push(b);
    }
    // 炉前的小铁盘 + 长柄铲
    box(0.9, 0.03, 0.5, iron, 0, 0.04, mz + 0.34, g).castShadow = false;
    const peel = box(0.12, 0.03, 0.9, std(0x9c7a52, 0.9), 0.55, 0.06, mz + 0.42, g);
    peel.rotation.y = 0.3;
    // 炉子底下堆的两块柴
    cyl(0.07, 0.07, 0.7, 7, std(0x6d4a30, 0.95), -0.5, 0.07, mz + 0.5, g).rotation.z = Math.PI / 2;
    cyl(0.06, 0.06, 0.6, 7, std(0x7a5236, 0.95), -0.45, 0.17, mz + 0.45, g).rotation.z = Math.PI / 2;
    // 烟囱（贴着后墙往上）
    box(0.32, H - bh - 0.5, 0.32, brick, 0, bh + 0.5 + (H - bh - 0.5) / 2, -0.12, g);
  }

  /* ================= 柜台 + 玻璃柜 + 收银 ================= */
  function buildCounter() {
    const wood = std(0x7a563a, 0.9);
    const top = std(0xd9cbb2, 0.72);
    const w = COUNTER.x1 - COUNTER.x0;
    const d = COUNTER.z1 - COUNTER.z0;
    const cx = (COUNTER.x0 + COUNTER.x1) / 2;
    const cz = (COUNTER.z0 + COUNTER.z1) / 2;

    // 柜体 + 台面 + 台面前缘
    box(w, COUNTER.h, d - 0.06, wood, cx, COUNTER.h / 2, cz);
    box(w + 0.08, 0.07, d + 0.1, top, cx, COUNTER.h + 0.02, cz);
    box(w + 0.1, 0.06, 0.06, std(0x8b6b4a, 0.85), cx, COUNTER.h - 0.04, cz + d / 2 + 0.04);
    // 柜门（两条缝 + 铜把手）
    [-1, 1].forEach(function (s) {
      box(w / 2 - 0.12, 0.72, 0.04, std(0x6a4a32, 0.92), cx + s * (w / 4 + 0.02), 0.56, cz + d / 2 - 0.02);
      box(0.05, 0.05, 0.05, std(0xc9a86a, 0.4, 0.7), cx + s * 0.1, 0.7, cz + d / 2 + 0.02);
    });

    /* 玻璃柜：底座 + 玻璃罩 + 四格托盘 */
    const cw = CASE.x1 - CASE.x0, cd = CASE.z1 - CASE.z0;
    const ccx = (CASE.x0 + CASE.x1) / 2, ccz = (CASE.z0 + CASE.z1) / 2;
    box(cw, 0.06, cd, std(0xcfc0a6, 0.8), ccx, CASE.y + 0.03, ccz);
    const caseGlass = new THREE.MeshStandardMaterial({
      color: col(0xcfe0e4), transparent: true, opacity: 0.24, roughness: 0.06, metalness: 0.05
    });
    fr.caseGlass = caseGlass;
    const glassH = 0.42;
    const front = box(cw, glassH, 0.02, caseGlass, ccx, CASE.y + 0.06 + glassH / 2, CASE.z1);
    front.castShadow = false;
    box(0.02, glassH, cd, caseGlass, CASE.x0, CASE.y + 0.06 + glassH / 2, ccz).castShadow = false;
    box(0.02, glassH, cd, caseGlass, CASE.x1, CASE.y + 0.06 + glassH / 2, ccz).castShadow = false;
    box(cw, 0.03, cd, caseGlass, ccx, CASE.y + 0.06 + glassH, ccz).castShadow = false;
    // 柜框（黄铜细条）
    const brass = std(0xc9a86a, 0.35, 0.75);
    box(cw + 0.04, 0.03, 0.03, brass, ccx, CASE.y + 0.06, CASE.z1);
    box(cw + 0.04, 0.03, 0.03, brass, ccx, CASE.y + 0.06 + glassH, CASE.z1);
    [CASE.x0, CASE.x1].forEach(function (bx) {
      box(0.03, glassH, 0.03, brass, bx, CASE.y + 0.06 + glassH / 2, CASE.z1);
    });

    // 四格面包（缺了就藏起来）
    BREADS.forEach(function (b, i) {
      // 小木托盘
      box(0.52, 0.02, 0.4, std(0xb98f62, 0.9), b.x, CASE.y + 0.07, ccz);
      const mesh = makeBreadShape(b.k, 1);
      mesh.position.set(b.x, CASE.y + 0.09, ccz);
      mesh.rotation.y = (i % 2 ? -0.25 : 0.18);
      root.add(mesh);
      fr.breads[i] = mesh;
    });
    // 柜里的价签（贴在玻璃柜前沿，小牌子）
    BREADS.forEach(function (b) {
      const tagTex = canvasTex(128, 64, function (g, W, Hh) {
        g.fillStyle = '#f8f1de'; g.fillRect(0, 0, W, Hh);
        g.strokeStyle = '#c9a86a'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, Hh - 4);
        g.fillStyle = '#6b4a30';
        g.font = 'bold 24px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center';
        g.fillText(b.name, W / 2, 29);
        g.fillStyle = '#a0603a';
        g.font = 'bold 20px sans-serif';
        g.fillText('¥' + b.price, W / 2, 53);
      });
      const tm = new THREE.MeshBasicMaterial({ map: tagTex, toneMapped: false, side: THREE.DoubleSide });
      const p = plane(0.17, 0.085, tm, b.x, CASE.y + 0.2, CASE.z1 + 0.045);
      p.rotation.x = -0.12;
      p.castShadow = false;
    });

    /* 收银机（右边的角落） */
    const reg = new THREE.Group();
    reg.position.set(146.95, COUNTER.h + 0.06, -2.8);
    root.add(reg);
    box(0.44, 0.24, 0.36, std(0x4a4f57, 0.5, 0.4), 0, 0.12, 0, reg);
    box(0.4, 0.1, 0.3, std(0x5d636b, 0.45, 0.5), 0, 0.29, -0.02, reg);
    const keyMat = std(0xe8dcc4, 0.7);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        box(0.07, 0.02, 0.06, keyMat, -0.1 + i * 0.1, 0.245, 0.06 + j * 0.08, reg);
      }
    }
    // 小抽屉
    box(0.42, 0.06, 0.32, std(0x8a9098, 0.5, 0.4), 0, 0.03, 0.02, reg);

    /* 柜台铃（铜的，摇一下会响） */
    const bellG = new THREE.Group();
    bellG.position.set(146.25, COUNTER.h + 0.06, -2.72);
    root.add(bellG);
    cyl(0.1, 0.12, 0.02, 14, std(0x2f2a24, 0.8), 0, 0.01, 0, bellG);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      std(0xc9a86a, 0.3, 0.85)
    );
    dome.position.y = 0.02;
    dome.castShadow = true;
    bellG.add(dome);
    sph(0.022, 8, std(0x8a6a3a, 0.4, 0.7), 0, 0.11, 0, bellG);
    fr.bell = bellG;

    /* 柜台上的铁丝晾面包架（刚出炉的放这儿，比直接摆案板好看） */
    const iron = std(0x4a4f57, 0.55, 0.5);
    const rk = new THREE.Group();
    rk.position.set(RACK.x, COUNTER.h + 0.05, RACK.z);
    root.add(rk);
    box(RACK.w, 0.016, 0.022, iron, 0, 0, -RACK.d / 2, rk);
    box(RACK.w, 0.016, 0.022, iron, 0, 0, RACK.d / 2, rk);
    box(0.022, 0.016, RACK.d, iron, -RACK.w / 2, 0, 0, rk);
    box(0.022, 0.016, RACK.d, iron, RACK.w / 2, 0, 0, rk);
    for (let i = 1; i <= 4; i++) {
      box(RACK.w - 0.03, 0.008, 0.008, iron, 0, 0.004, -RACK.d / 2 + i * (RACK.d / 5), rk);
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      box(0.018, 0.05, 0.018, iron, p[0] * (RACK.w / 2 - 0.02), -0.032, p[1] * (RACK.d / 2 - 0.02), rk);
    });
    fr.rack = rk;
  }

  /* ================= 一块面包的形状 ================= */
  function makeBreadShape(kind, s) {
    const sc = s || 1;
    const g = new THREE.Group();
    const crust = std(0xd99a4e, 0.78);
    const crust2 = std(0xc3873f, 0.82);
    const pale = std(0xf0dcb4, 0.85);

    if (kind === 'croissant') {
      // 五团面，中间鼓两头尖
      for (let i = 0; i < 5; i++) {
        const u = i / 4 - 0.5;
        const r = 0.052 - Math.abs(u) * 0.026;
        const b = sph(r * sc, 8, i % 2 ? crust : crust2, u * 0.24 * sc, 0.032 * sc, 0, g);
        b.scale.set(1.5, 0.85, 1.05);
      }
    } else if (kind === 'bean') {
      const b = sph(0.115 * sc, 12, crust, 0, 0.07 * sc, 0, g);
      b.scale.set(1, 0.66, 0.94);
      // 顶上三粒黑芝麻
      [[-0.03, 0.012], [0.02, -0.01], [0.055, 0.02]].forEach(function (p) {
        sph(0.012 * sc, 6, std(0x2e241c, 0.8), p[0] * sc, 0.135 * sc, p[1] * sc, g);
      });
    } else if (kind === 'whale') {
      // 鲸鱼形状的小面包：身子 + 尾巴 + 白肚皮 + 眼睛
      const body = sph(0.13 * sc, 12, crust, 0, 0.075 * sc, 0, g);
      body.scale.set(1.35, 0.72, 0.92);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.075 * sc, 0.14 * sc, 6), crust2);
      tail.position.set(-0.19 * sc, 0.085 * sc, 0);
      tail.rotation.z = Math.PI / 2.3;
      tail.castShadow = true;
      g.add(tail);
      const belly = sph(0.095 * sc, 10, pale, 0.01 * sc, 0.038 * sc, 0.055 * sc, g);
      belly.scale.set(1.5, 0.5, 0.6);
      sph(0.013 * sc, 6, std(0x2e241c, 0.8), 0.075 * sc, 0.1 * sc, 0.09 * sc, g);
    } else {
      // 吐司：方块 + 顶上一个圆鼓
      box(0.28 * sc, 0.16 * sc, 0.2 * sc, crust, 0, 0.08 * sc, 0, g);
      const top2 = sph(0.13 * sc, 10, crust2, 0, 0.16 * sc, 0, g);
      top2.scale.set(1.05, 0.55, 0.75);
      box(0.29 * sc, 0.02 * sc, 0.21 * sc, pale, 0, 0.005 * sc, 0, g).castShadow = false;
    }
    return g;
  }

  /* ================= 揉面的那案子 ================= */
  function buildWorkTable() {
    const wood = std(0x8b6b4a, 0.9);
    const wood2 = std(0x7a563a, 0.92);
    const top = TABLE.h;
    box(TABLE.w, 0.08, TABLE.d, std(0xc9b490, 0.85), TABLE.x, top, TABLE.z);
    // 四条腿 + 下层放面粉袋的横板
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      cyl(0.055, 0.05, top - 0.06, 8, wood2,
        TABLE.x + p[0] * (TABLE.w / 2 - 0.12), (top - 0.06) / 2, TABLE.z + p[1] * (TABLE.d / 2 - 0.1));
    });
    box(TABLE.w - 0.3, 0.05, TABLE.d - 0.2, wood2, TABLE.x, 0.26, TABLE.z).castShadow = false;

    // 案板 + 撒的面粉 + 擀面杖 + 面粉碗
    //   桌子顶面在 y = top + 0.04，案板底面要压在 0.96 上（以前写 top+0.06，矮了 5mm 就嵌进去）
    box(0.78, 0.05, 0.56, std(0xbb9264, 0.88), TABLE.x - 0.28, top + 0.065, TABLE.z);
    const flourMat = new THREE.MeshBasicMaterial({ color: 0xfdf8ec, transparent: true, opacity: 0.3 });
    const flourPatch = plane(0.44, 0.3, flourMat, TABLE.x - 0.28, top + 0.092, TABLE.z, root);
    flourPatch.rotation.x = -Math.PI / 2;
    const pin = cyl(0.035, 0.035, 0.5, 8, std(0x9c7a52, 0.85), TABLE.x + 0.42, top + 0.125, TABLE.z + 0.12);
    pin.rotation.z = Math.PI / 2;
    pin.rotation.y = 0.2;
    cyl(0.028, 0.028, 0.09, 8, std(0xc9a86a, 0.6), TABLE.x + 0.66, top + 0.125, TABLE.z + 0.22).rotation.z = Math.PI / 2;
    // 面粉碗（开口朝上）
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.095, 0.11, 14, 1, true), std(0xe4d6bd, 0.7));
    bowl.position.set(TABLE.x + 0.08, top + 0.1, TABLE.z - 0.24);
    bowl.material.side = THREE.DoubleSide;
    bowl.castShadow = true;
    root.add(bowl);
    const bowlFlour = new THREE.Mesh(new THREE.CircleGeometry(0.122, 14), std(0xfbf5e6, 0.95));
    bowlFlour.rotation.x = -Math.PI / 2;
    bowlFlour.position.set(TABLE.x + 0.08, top + 0.1, TABLE.z - 0.24);
    root.add(bowlFlour);
    fr.flourBowl = bowl;

    // 面团（就摆在案板上，可以揉）
    const pale = std(0xf0dcb4, 0.85);
    const dg = new THREE.Group();
    dg.position.set(TABLE.x - 0.28, top + 0.085, TABLE.z + 0.02);
    root.add(dg);
    const ball = sph(0.13, 14, pale, 0, 0.09, 0, dg);
    ball.scale.set(1.1, 0.82, 1.05);
    sph(0.05, 8, pale, 0.06, 0.16, 0.02, dg).scale.set(1.3, 0.7, 1.2);
    fr.doughBall = dg;

    // 柜子下头堆的面粉袋
    const sackMat = std(0xe8dcc0, 0.95);
    [0, 1, 2].forEach(function (i) {
      const s = box(0.42, 0.24, 0.32, sackMat, 140.75 + (i % 2) * 0.44, 0.13 + Math.floor(i / 2) * 0.25, 1.55 + (i % 2) * 0.06);
      s.rotation.y = i * 0.2;
      // 口袋口
      box(0.16, 0.06, 0.1, std(0xd8c8a8, 0.95), 140.75 + (i % 2) * 0.44, 0.27 + Math.floor(i / 2) * 0.25, 1.55 + (i % 2) * 0.06);
    });
  }

  /* ================= 窗边小桌 ================= */
  function buildWindowTable() {
    const wood = std(0x8b6b4a, 0.9);
    cyl(0.42, 0.42, 0.06, 20, std(0xd8c8a8, 0.8), WT.x, 0.74, WT.z);
    cyl(0.06, 0.07, 0.72, 10, wood, WT.x, 0.37, WT.z);
    cyl(0.24, 0.26, 0.04, 14, wood, WT.x, 0.02, WT.z);
    // 两个圆凳
    [[-1], [1]].forEach(function (p) {
      const sx = WT.x + p[0] * 0.72;
      cyl(0.17, 0.17, 0.05, 14, std(0xb98f62, 0.88), sx, 0.46, WT.z);
      [-1, 1].forEach(function (k) {
        cyl(0.03, 0.03, 0.44, 8, wood, sx + k * 0.1, 0.22, WT.z + k * 0.06);
      });
    });
    // 桌上：一个面包篮 + 两只杯子
    const basket = cyl(0.15, 0.13, 0.08, 14, std(0xb98f62, 0.92), WT.x, 0.81, WT.z);
    basket.castShadow = true;
    const cro = makeBreadShape('croissant', 0.8);
    cro.position.set(WT.x, 0.84, WT.z);
    root.add(cro);
    cyl(0.045, 0.038, 0.09, 10, std(0xfbf6ea, 0.6), WT.x + 0.22, 0.82, WT.z + 0.12);
  }

  /* ================= 东墙上的货架 / 黑板 ================= */
  function buildProps() {
    const wood = std(0x8b6b4a, 0.9);
    // 东墙的置物柜（贴着 x = X1）
    const sx = X1 - 0.30;
    const cabZ0 = -2.62, cabZ1 = -0.12, cabH = 2.05;
    const cabD = 0.36;
    const backPanel = std(0xc9ad88, 0.95);
    // 背板 + 两侧立板 + 四层隔板
    box(0.04, cabH, cabZ1 - cabZ0, backPanel, X1 - 0.05, cabH / 2 + 0.06, (cabZ0 + cabZ1) / 2);
    [cabZ0, cabZ1].forEach(function (cz) {
      box(cabD, cabH, 0.05, wood, sx, cabH / 2 + 0.06, cz);
    });
    [0.06, 0.55, 1.04, 1.53, 2.02].forEach(function (y) {
      box(cabD, 0.05, cabZ1 - cabZ0, wood, sx, y + 0.06, (cabZ0 + cabZ1) / 2);
    });
    // 最底层：两袋面粉 + 一个木箱（都压在隔板顶面 0.085 上）
    box(0.3, 0.3, 0.34, std(0xe8dcc0, 0.95), sx, 0.235, -2.25).rotation.y = 0.2;
    box(0.3, 0.26, 0.3, std(0xe0d0b0, 0.95), sx, 0.215, -1.85).rotation.y = -0.15;
    box(0.3, 0.22, 0.3, std(0x8b6b4a, 0.92), sx, 0.195, -1.35);
    // 第二层：三罐果酱（隔板顶面 0.575）
    [-2.35, -2.05, -1.75].forEach(function (cz, i) {
      cyl(0.072, 0.072, 0.19, 12, std([0xc0563f, 0x7f9a4a, 0xd9a24a][i], 0.7), sx, 0.67, cz);
      cyl(0.062, 0.072, 0.035, 12, std(0x6b4a30, 0.6), sx, 0.782, cz);
    });
    // 第三层：晾着的面包（隔板顶面 1.065）
    ['croissant', 'bean', 'toast'].forEach(function (k, i) {
      const b = makeBreadShape(k, 0.85);
      b.position.set(sx, 1.065, -2.3 + i * 0.42);
      b.rotation.y = 0.4 + i * 0.8;
      root.add(b);
    });
    // 最上层：一筐面包 + 一瓦罐麦穗（隔板顶面 1.555）
    const topBasket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.16, 14, 1, true), std(0xb98f62, 0.92));
    topBasket.position.set(sx, 1.635, -2.15);
    topBasket.material.side = THREE.DoubleSide;
    topBasket.castShadow = true;
    root.add(topBasket);
    ['bean', 'croissant'].forEach(function (k, i) {
      const b = makeBreadShape(k, 0.8);
      b.position.set(sx + (i - 0.5) * 0.1, 1.675, -2.15);
      b.rotation.y = i;
      root.add(b);
    });
    // 瓦罐里的麦穗
    const crock = cyl(0.1, 0.075, 0.22, 12, std(0xb08a5e, 0.9), sx, 1.665, -1.4);
    crock.castShadow = true;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const stalk = cyl(0.007, 0.007, 0.4, 5, std(0xc9a24a, 0.9), sx + Math.cos(a) * 0.028, 1.95, -1.4 + Math.sin(a) * 0.028);
      stalk.rotation.z = Math.cos(a) * 0.16;
      stalk.rotation.x = Math.sin(a) * 0.16;
      const head = sph(0.022, 6, std(0xd9b44e, 0.9), sx + Math.cos(a) * 0.06, 2.15, -1.4 + Math.sin(a) * 0.06);
      head.scale.set(1, 1.9, 1);
    }

    // 门口一侧：一摞牛皮纸袋 + 一盆绿植
    [0, 1, 2].forEach(function (i) {
      const bag = box(0.26, 0.34 - i * 0.02, 0.12, std(0xc9a86a, 0.95), 147.5, 0.18 + i * 0.02, 2.45 + i * 0.03);
      bag.rotation.y = 0.12 * i;
    });
    // 窗边角落的小绿植
    cyl(0.16, 0.12, 0.26, 12, std(0xa9604b, 0.92), 140.72, 0.13, 2.62);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const leaf = sph(0.1, 7, std(0x4f7a4a, 0.95), 140.72 + Math.cos(a) * 0.1, 0.36 + (i % 2) * 0.07, 2.62 + Math.sin(a) * 0.1);
      leaf.scale.set(1, 1.4, 1);
    }

    // 门口的小黑板（写着今天的价）
    const menuTex = canvasTex(320, 380, function (g, W, Hh) {
      g.fillStyle = '#2b241c';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9a86a'; g.lineWidth = 7;
      g.strokeRect(10, 10, W - 20, Hh - 20);
      g.fillStyle = '#f6e7c8';
      g.font = 'bold 34px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('今 日 现 烤', W / 2, 68);
      g.strokeStyle = 'rgba(246,231,200,.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, 84); g.lineTo(W - 40, 84); g.stroke();
      g.textAlign = 'left';
      g.font = '27px "Microsoft YaHei", sans-serif';
      const rows = [['可颂', '6'], ['红豆包', '5'], ['鲸鱼包', '9'], ['吐司', '12']];
      rows.forEach(function (r, i) {
        g.fillStyle = '#f6e7c8';
        g.fillText(r[0], 44, 140 + i * 54);
        g.fillStyle = '#f2c66a';
        g.fillText('¥' + r[1], W - 96, 140 + i * 54);
      });
      g.fillStyle = '#9fb4a8';
      g.font = '20px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('刚出炉的最好吃 🐋', W / 2, Hh - 34);
    });
    const menuMat = new THREE.MeshBasicMaterial({ map: menuTex, toneMapped: false });
    const mg = new THREE.Group();
    mg.position.set(X1 - 0.5, 0, 1.75);
    mg.rotation.y = -Math.PI / 2 - 0.12;
    root.add(mg);
    const board = box(0.9, 1.06, 0.05, std(0x2b241c, 0.95), 0, 1.05, 0, mg);
    plane(0.84, 1.0, menuMat, 0, 1.05, 0.032, mg).castShadow = false;
    [-1, 1].forEach(function (s) {
      const leg = box(0.05, 1.06, 0.05, std(0x6b4a30, 0.9), s * 0.38, 0.55, -0.06, mg);
      leg.rotation.x = 0.16;
    });

    // 案子下层搁两个面包筐（刚出炉晾着的）—— 抬到横板上面，别穿进去
    [[144.2, 0.42], [144.85, 0.34]].forEach(function (p, i) {
      const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.17, 14, 1, true), std(0xb98f62, 0.92));
      bk.position.set(p[0], 0.37, p[1]);
      bk.material.side = THREE.DoubleSide;
      bk.castShadow = true;
      root.add(bk);
      const b = makeBreadShape(i ? 'bean' : 'croissant', 0.9);
      b.position.set(p[0] + 0.02, 0.44, p[1]);
      b.rotation.y = i * 1.1;
      root.add(b);
    });
  }

  /* ================= 麦师傅（胖棕熊） ================= */
  function buildBaker() {
    const fur = std(0xc08a56, 0.95);
    const fur2 = std(0xa9744a, 0.95);
    const cream = std(0xf3e6cf, 0.95);
    const g = new THREE.Group();
    g.position.set(BAKER.x, 0, BAKER.z);
    g.rotation.y = 0.5;                  // 稍微朝门口偏一点
    root.add(g);
    fr.bear = g;

    // 身子（圆滚滚的）+ 白围裙（一块布，不是整只雪人）
    const body = sph(0.32, 14, fur, 0, 0.66, 0, g);
    body.scale.set(0.95, 1.02, 0.85);
    const apron = sph(0.26, 12, cream, 0, 0.62, 0.2, g);
    apron.scale.set(0.9, 1.15, 0.3);
    box(0.36, 0.06, 0.08, cream, 0, 0.86, 0.26, g);           // 围裙上头
    box(0.15, 0.09, 0.02, std(0xe2d3b4, 0.95), 0, 0.55, 0.3, g);   // 口袋

    // 头 + 耳朵 + 口鼻 + 眼睛 + 一点点腮红
    const head = sph(0.215, 16, fur, 0, 1.08, 0.03, g);
    head.scale.set(1, 0.94, 0.96);
    [-1, 1].forEach(function (s) {
      const ear = sph(0.082, 10, fur2, s * 0.16, 1.23, 0, g);
      ear.scale.set(1, 0.95, 0.65);
      sph(0.042, 8, std(0x8b5a3a, 0.95), s * 0.16, 1.23, 0.05, g);
    });
    const muzzle = sph(0.105, 12, cream, 0, 1.02, 0.16, g);
    muzzle.scale.set(1.15, 0.8, 0.9);
    sph(0.032, 8, std(0x3a2a20, 0.7), 0, 1.06, 0.25, g);       // 鼻子
    // 小小的笑嘴（半圈）
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 5, 12, Math.PI), std(0x3a2a20, 0.8));
    smile.position.set(0, 0.985, 0.238);
    smile.rotation.z = Math.PI;
    g.add(smile);
    [-1, 1].forEach(function (s) {
      // M45.1：眼睛往前挪到口鼻上方（以前埋在口鼻球里，看着像没眼睛）
      sph(0.028, 8, std(0x2a1e18, 0.6), s * 0.088, 1.145, 0.205, g);
      sph(0.008, 6, std(0xffffff, 0.4), s * 0.098, 1.155, 0.222, g);   // 眼神光（一点点就活）
      const blush = sph(0.036, 8, std(0xd99a8a, 0.95), s * 0.135, 1.03, 0.145, g);
      blush.scale.set(1, 0.7, 0.4);
    });
    // 厨师帽：一圈帽箍 + 上面一坨
    cyl(0.15, 0.155, 0.07, 14, std(0xf7f2e6, 0.92), 0, 1.27, 0.02, g);
    const hat = sph(0.16, 12, std(0xfdf9ef, 0.95), 0, 1.35, 0.02, g);
    hat.scale.set(1, 0.9, 1);

    // 两条胳膊（后面动画让它动）
    function arm(s) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.28, 0.85, 0.02);
      g.add(pivot);
      cyl(0.07, 0.062, 0.30, 8, fur, 0, -0.13, 0, pivot);
      sph(0.085, 10, fur2, 0, -0.30, 0.02, pivot);
      return pivot;
    }
    fr.bearArmL = arm(-1);
    fr.bearArmR = arm(1);
    // 脚
    [-1, 1].forEach(function (s) {
      const foot = sph(0.11, 10, fur2, s * 0.14, 0.06, 0.06, g);
      foot.scale.set(1, 0.6, 1.5);
    });
  }

  /* ================= 灯 ================= */
  function buildLights() {
    const amb = new THREE.AmbientLight(0xffe9cc, 0.20);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xfff2dd, 0x6b5a48, 0.12);
    root.add(hemi);
    // 窗户外头照进来的天光（开阴影，屋里才有层次）
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.85);
    sun.position.set(143.2, 4.2, 8.2);
    sun.target.position.set(143.6, 0.6, -1.6);
    root.add(sun);
    root.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -5.2; sc.right = 5.2; sc.top = 5.2; sc.bottom = -5.2;
    sc.near = 0.5; sc.far = 22;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;

    // 柜台上方三盏吊灯（位置 + 灯泡 + 一盏主光）
    const shadeMat = std(0xe8d9b8, 0.9);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: col(0xfff2cf), emissive: col(0xffc46a), emissiveIntensity: 1.0, roughness: 0.5
    });
    fr.bulbs.push(bulbMat);
    [143.55, 145.0, 146.45].forEach(function (x) {
      cyl(0.012, 0.012, 0.5, 6, std(0x4a4f57, 0.7), x, 3.05, -2.5);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 16, 1, true), shadeMat);
      shade.position.set(x, 2.76, -2.5);
      shade.rotation.x = Math.PI;
      shade.castShadow = true;
      root.add(shade);
      const b = sph(0.07, 8, bulbMat, x, 2.68, -2.5);
      b.castShadow = false;
    });
    const warm = new THREE.PointLight(0xffc98a, 1.05, 8.5, 2);
    warm.position.set(145.0, 2.5, -2.35);
    root.add(warm);
    fr.warm = warm;

    // 炉膛里的光（一直在呼吸，烤的时候更亮）
    const ovenLight = new THREE.PointLight(0xff8a3a, 0.9, 5.2, 2);
    ovenLight.position.set(OVEN.x, 1.0, OVEN.z + 0.55);
    root.add(ovenLight);
    fr.ovenLight = ovenLight;

    // 窗台上一小串暖灯（夜里最好看，白天也留着）
    for (let i = 0; i < 7; i++) {
      const b = sph(0.028, 6, bulbMat, 141.0 + i * 0.72, 2.72, Z1 - 0.16);
      b.castShadow = false;
    }
    fr.amb = amb; fr.hemi = hemi; fr.sun = sun;
  }

  /* ================= 粒子（面粉 / 热气 / 面包屑） ================= */
  const parts = [];
  function initParts() {
    for (let i = 0; i < 26; i++) {
      const m = new THREE.SpriteMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false
      });
      const s = new THREE.Sprite(m);
      s.scale.set(0.1, 0.1, 1);
      s.visible = false;
      root.add(s);
      parts.push({ s: s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, s0: 0.1 });
    }
  }
  function spawnPart(x, y, z, kind) {
    let p = null;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].life <= 0) { p = parts[i]; break; }
    }
    if (!p) return;
    p.s.position.set(x, y, z);
    p.s.visible = true;
    if (kind === 'flour') {
      p.s.material.color.setHex(0xfdf8ec);
      p.s0 = 0.075 + Math.random() * 0.06;
      p.vy = 0.25 + Math.random() * 0.2;
      p.vx = (Math.random() - 0.5) * 0.3;
      p.vz = (Math.random() - 0.5) * 0.3;
      p.g = -0.2;
      p.max = 0.9; p.life = 0.9;
    } else if (kind === 'steam') {
      p.s.material.color.setHex(0xf2f6f8);
      p.s0 = 0.1 + Math.random() * 0.08;
      p.vy = 0.22 + Math.random() * 0.12;
      p.vx = (Math.random() - 0.5) * 0.08;
      p.vz = (Math.random() - 0.5) * 0.08;
      p.g = 0;
      p.max = 1.8; p.life = 1.8;
    } else {
      p.s.material.color.setHex(0xc98f52);
      p.s0 = 0.022 + Math.random() * 0.02;
      p.vy = 0.5 + Math.random() * 0.4;
      p.vx = (Math.random() - 0.5) * 0.9;
      p.vz = (Math.random() - 0.5) * 0.9;
      p.g = -2.4;
      p.max = 0.8; p.life = 0.8;
    }
    p.s.scale.set(p.s0, p.s0, 1);
  }
  function updateParts(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; p.s.material.opacity = 0; continue; }
      p.vy += p.g * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const k = 1 - p.life / p.max;
      p.s.material.opacity = Math.max(0, (1 - k) * (k < 0.15 ? k / 0.15 : 1) * 0.75);
      const sc = p.s0 * (1 + k * 1.6);
      p.s.scale.set(sc, sc, 1);
    }
  }

  /* ================= 买面包 / 咬一口 ================= */
  function buy(i) {
    const b = BREADS[i];
    if (walletOf() < b.price) {
      if (tip) tip('零花钱不够啦…余额 ¥' + walletOf() + '，' + b.name + ' 要 ¥' + b.price, 3200);
      else say(145.0, 1.4, -2.6, '零花钱不够啦…', 3.0);
      return false;
    }
    spend(b.price);
    boughtCount++;
    if (sfx && sfx.cash) sfx.cash();
    if (sfx && sfx.bag) setTimeout(function () { if (sfx && sfx.bag) sfx.bag(); }, 260);
    // 柜里那格空了
    if (fr.breads[i]) fr.breads[i].visible = false;
    // 面包放到柜台上（能咬 / 能打包）
    putBread(b.k, { x: 146.62, y: COUNTER.h + 0.09, z: -2.56 });
    if (tip) tip('买了一个' + b.name + '（¥' + b.price + '）· 可以咬一口，也可以打包带回家', 3600);
    say(146.62, 1.5, -2.5, '谢谢～' + b.name + '刚出炉的，小心烫 🥐', 3.6);
    return true;
  }

  function putBread(kind, spot) {
    if (held) {
      // 桌上已经有一块了：先自动装进纸袋，别把它弄丢
      bag.push(heldKind || 'whale');
      root.remove(held);
      held = null;
    }
    const g = makeBreadShape(kind, 1);
    g.position.set(spot.x, spot.y, spot.z);
    g.rotation.y = 0.3;
    root.add(g);
    held = g;
    heldKind = kind;
    heldBites = 0;
    if (fr.bite) {
      fr.bite.enabled = true;
      fr.bite.mesh.position.set(spot.x, spot.y + 0.22, spot.z);
      fr.bite.anchor.set(spot.x, spot.y + 0.45, spot.z);
    }
    if (fr.pack) {
      fr.pack.enabled = true;
      fr.pack.mesh.position.set(spot.x, spot.y + 0.22, spot.z + 0.3);
      fr.pack.anchor.set(spot.x, spot.y + 0.42, spot.z + 0.34);
    }
  }

  /* 打包带走：装进纸袋，回家在餐桌上吃 */
  function packBread() {
    if (!held) return false;
    bag.push(heldKind || 'whale');
    root.remove(held);
    held = null;
    heldKind = null;
    if (fr.bite) fr.bite.enabled = false;
    if (fr.pack) fr.pack.enabled = false;
    if (sfx && sfx.bag) sfx.bag();
    if (tip) tip('装进纸袋了 🛍 回家放餐桌上，点纸袋就能拿出来吃', 4200);
    say(146.5, 1.45, -2.45, '给你装好了——回家再吃，还是热的', 3.6);
    return true;
  }

  function bite() {
    if (!held) return false;
    heldBites++;
    if (sfx && sfx.crunch) sfx.crunch();
    // 面包屑 + 一点点热气
    for (let i = 0; i < 5; i++) {
      spawnPart(held.position.x + (Math.random() - 0.5) * 0.12, held.position.y + 0.12,
        held.position.z + (Math.random() - 0.5) * 0.12, 'crumb');
    }
    if (heldBites === 1) {
      held.scale.set(0.85, 0.8, 0.85);
      say(held.position.x, held.position.y + 0.4, held.position.z, '唔…外皮脆的 🥐', 2.8);
    } else if (heldBites === 2) {
      held.scale.set(0.62, 0.6, 0.62);
      say(held.position.x, held.position.y + 0.4, held.position.z, '里面还是热的', 2.6);
    } else {
      if (interact && interact.say) {
        interact.say(new THREE.Vector3(held.position.x, held.position.y + 0.4, held.position.z), '吃完啦，手上都是黄油味 🧈', 3.2);
      }
      root.remove(held);
      held = null;
      heldKind = null;
      if (fr.bite) fr.bite.enabled = false;
      if (fr.pack) fr.pack.enabled = false;
      if (tip) tip('吃完了～ 想吃再去柜里挑一个', 2800);
    }
    return true;
  }

  /* ================= 家里的纸袋（打包回来的面包） ================= */
  function buildHomeBag() {
    if (!scene) return;
    const g = new THREE.Group();
    g.position.set(HOME.bag.x, HOME.bag.y, HOME.bag.z);
    g.rotation.y = -0.35;
    g.visible = false;
    scene.add(g);
    homeBag = g;

    const paper = std(0xb98a5a, 0.95);
    const paperIn = std(0x8d6740, 0.95);
    // 牛皮纸袋：袋身 + 袋口翻边（中间空着，好让面包从里头冒出来）
    box(0.22, 0.26, 0.14, paper, 0, 0.13, 0, g);
    box(0.24, 0.03, 0.16, paperIn, 0, 0.255, 0, g);          // 翻边（一整圈）
    // 袋口的"里面"：四片薄薄的纸壁，围出一个开口
    box(0.006, 0.10, 0.12, paperIn, -0.105, 0.30, 0, g);
    box(0.006, 0.10, 0.12, paperIn, 0.105, 0.30, 0, g);
    box(0.20, 0.10, 0.006, paperIn, 0, 0.30, -0.05, g);
    // 半圆提手（以前两根竖条像筷子）
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.007, 5, 12, Math.PI), std(0x8a6a42, 0.9));
    handle.position.set(0, 0.28, 0);
    handle.rotation.z = 0;
    g.add(handle);
    // 袋口露出面包（表示里面有东西）
    const peek = makeBreadShape('whale', 0.72);
    peek.position.set(0, 0.21, 0.01);
    peek.rotation.y = 0.4;
    g.add(peek);
    homeBag.peeking = peek;
    // 小标签
    const tagTex = canvasTex(128, 64, function (g2, W, Hh) {
      g2.fillStyle = '#f8f1de';
      g2.fillRect(0, 0, W, Hh);
      g2.strokeStyle = '#c9a86a'; g2.lineWidth = 5; g2.strokeRect(3, 3, W - 6, Hh - 6);
      g2.fillStyle = '#6b4a30';
      g2.font = 'bold 26px "Microsoft YaHei", sans-serif';
      g2.textAlign = 'center';
      g2.fillText('鲸麦坊', W / 2, 42);
    });
    const tg = new THREE.MeshBasicMaterial({ map: tagTex, toneMapped: false, side: THREE.DoubleSide });
    const p = plane(0.1, 0.05, tg, 0, 0.14, 0.071, g);
    p.castShadow = false;

    // 袋子上挂一个"×N"的小圆牌（里面还有几个，一眼就看得见）
    const cvs = document.createElement('canvas');
    cvs.width = 128; cvs.height = 128;
    const cg = cvs.getContext('2d');
    const cntTex = new THREE.CanvasTexture(cvs);
    cntTex.anisotropy = 4;
    function drawCount(n) {
      cg.clearRect(0, 0, 128, 128);
      cg.fillStyle = '#f8f1de';
      cg.beginPath(); cg.arc(64, 64, 58, 0, Math.PI * 2); cg.fill();
      cg.lineWidth = 9; cg.strokeStyle = '#c9a86a'; cg.stroke();
      cg.fillStyle = '#6b4a30';
      cg.font = 'bold 60px "Microsoft YaHei", sans-serif';
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillText('×' + n, 64, 70);
      cntTex.needsUpdate = true;
    }
    drawCount(1);
    const cntMat = new THREE.MeshBasicMaterial({ map: cntTex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    const cp = plane(0.075, 0.075, cntMat, 0.075, 0.1, 0.073, g);
    cp.castShadow = false;
    homeBag.drawCount = drawCount;
  }

  // 从纸袋里拿一块出来（已经在吃了就又咬一口）
  function openHomeBag() {
    if (!root) return;
    if (homeBread) { homeBite(); return; }
    if (!bag.length) return;
    const kind = bag.pop();
    homeBread = makeBreadShape(kind, 1);
    homeBread.position.set(HOME.plate.x, HOME.plate.y, HOME.plate.z);
    homeBread.rotation.y = 0.5;
    scene.add(homeBread);
    homeBites = 0;
    if (sfx && sfx.bag) sfx.bag();
    const nm = kind === 'whale' ? '鲸鱼包' : (kind === 'croissant' ? '可颂' : (kind === 'bean' ? '红豆包' : '吐司'));
    say(HOME.plate.x, HOME.plate.y + 0.45, HOME.plate.z, '拿出一个' + nm + '——还温着呢', 3.4);
    if (homeBag && homeBag.peeking) homeBag.peeking.visible = bag.length > 0;
    if (!bag.length && homeBag) {
      // 袋子空了，收起来
      setTimeout(function () {
        if (homeBag && !bag.length && !homeBread) homeBag.visible = false;
      }, 1200);
    }
  }

  function homeBite() {
    if (!homeBread) return false;
    homeBites++;
    if (sfx && sfx.crunch) sfx.crunch();
    if (homeBites >= 3) {
      scene.remove(homeBread);
      homeBread = null;
      say(HOME.plate.x, HOME.plate.y + 0.4, HOME.plate.z,
        bag.length ? '吃完了——袋里还有 ' + bag.length + ' 个' : '吃完啦，袋子空了', 3.4);
    } else {
      const k = 1 - homeBites * 0.17;
      homeBread.scale.set(k, k * 0.9, k);
      say(HOME.plate.x, HOME.plate.y + 0.4, HOME.plate.z, '唔…还是热的', 2.6);
    }
    return true;
  }

  // 每帧（main.js 里一直调）：只管家里那个纸袋的显隐和热区位置
  function homeTick(venue) {
    const home = venue === 'home';
    if (homeBag) {
      homeBag.visible = home && bag.length > 0;
      if (homeBag.drawCount && homeBagCount !== bag.length) {
        homeBagCount = bag.length;
        homeBag.drawCount(bag.length);
      }
    }
    if (homeBagHot) {
      const show = home && (bag.length > 0 || !!homeBread);
      homeBagHot.enabled = show;
      const p = homeBread ? HOME.plate : HOME.bag;
      homeBagHot.mesh.position.set(p.x, 1.02, p.z);
      homeBagHot.anchor.set(p.x, 1.46, p.z);
    }
  }

  /* ================= 揉面 → 烤 ================= */
  function knead() {
    if (dough.state === 'idle') {
      dough.state = 'kneading';
      dough.n = 0;
    }
    if (dough.state === 'ready') {
      say(TABLE.x, 1.25, TABLE.z, '面团发好啦，按一下炉子把它送进去', 3.4);
      return;
    }
    if (dough.state === 'baking') {
      say(OVEN.x, 1.6, OVEN.z + 0.6, '炉子里正烤着呢，再等等…', 3.0);
      return;
    }
    if (dough.state === 'baked') {
      say(OVEN.x, 1.6, OVEN.z + 0.6, '面包已经好啦，先把它拿出来', 3.0);
      return;
    }
    dough.n++;
    dough.squash = 1;
    if (sfx && sfx.knead) sfx.knead();
    for (let i = 0; i < 3; i++) {
      spawnPart(TABLE.x - 0.28 + (Math.random() - 0.5) * 0.2, TABLE.h + 0.14,
        TABLE.z + (Math.random() - 0.5) * 0.2, 'flour');
    }
    if (sfx && sfx.puff && dough.n % 2 === 1) sfx.puff();
    if (dough.n >= 5) {
      dough.state = 'ready';
      if (fr.doughBall) fr.doughBall.scale.set(1.22, 1.22, 1.22);
      say(TABLE.x, 1.3, TABLE.z, '揉好啦——面团鼓起来了 🫧 按一下炉子送进去', 4.0);
      if (tip) tip('揉够了！按一下左边的炉子，把它送进去烤', 3600);
    } else {
      say(TABLE.x, 1.25, TABLE.z, '揉第 ' + dough.n + ' 下…还差 ' + (5 - dough.n) + ' 下', 2.2);
    }
  }

  function ovenClick() {
    if (dough.state === 'baking') {
      say(OVEN.x, 1.7, OVEN.z + 0.7, '还差 ' + Math.ceil(dough.t) + ' 秒…闻着已经香了', 2.6);
      return;
    }
    if (dough.state === 'baked') {
      // 出炉：送到案板上（热的，能咬）
      dough.state = 'idle';
      dough.n = 0;
      if (fr.ovenInner) fr.ovenInner.visible = false;
      if (fr.doughBall) { fr.doughBall.scale.set(1, 1, 1); fr.doughBall.visible = true; }
      if (sfx && sfx.pickup) sfx.pickup();
      // 放到柜台上的晾面包架上（比摊在案板上好看，也像真的面包房）
      putBread('whale', { x: RACK.x, y: COUNTER.h + 0.075, z: RACK.z });
      for (let i = 0; i < 6; i++) {
        spawnPart(RACK.x + (Math.random() - 0.5) * 0.3, COUNTER.h + 0.15, RACK.z + (Math.random() - 0.5) * 0.25, 'steam');
      }
      say(RACK.x, 1.45, RACK.z + 0.2, '出炉——热乎乎的鲸鱼包！放架子上晾一晾 🐋', 4.2);
      if (tip) tip('这是自己烤的，免费 🐋 咬一口，或者打包带回家', 3800);
      return;
    }
    if (dough.state === 'ready') {
      dough.state = 'baking';
      dough.t = 10;
      if (fr.doughBall) fr.doughBall.visible = false;
      if (fr.ovenInner) fr.ovenInner.visible = true;
      if (fr.ovenInner) fr.ovenInner.scale.set(0.7, 0.7, 0.7);
      if (sfx && sfx.ding) sfx.ding();
      say(OVEN.x, 1.7, OVEN.z + 0.7, '送进去啦——十分钟就好，等着闻香味吧', 3.8);
      if (tip) tip('面团进炉子了，等它「叮」一声 🕯', 3000);
      return;
    }
    // 还没面团
    if (sfx && sfx.puff) sfx.puff();
    say(OVEN.x, 1.7, OVEN.z + 0.7, '炉子烧得暖暖的，膛里的面包正鼓起来呢', 3.4);
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) return;
    t += dt;
    const day = getMode() === 'day';

    if (fr.amb) fr.amb.intensity = day ? 0.34 : 0.12;
    if (fr.hemi) fr.hemi.intensity = day ? 0.22 : 0.07;
    if (fr.sun) fr.sun.intensity = day ? 0.55 : 0.06;
    if (fr.warm) fr.warm.intensity = day ? 1.05 : 0.95;
    if (fr.bulbs && fr.bulbs.length) {
      fr.bulbs[0].emissiveIntensity = day ? 0.55 : 1.15;
    }
    // 炉火：一直呼吸；烤的时候更旺
    const baking = dough.state === 'baking';
    const fire = 0.75 + Math.sin(t * 2.1) * 0.08 + Math.sin(t * 5.3) * 0.04 + (baking ? 0.45 : 0);
    if (fr.ovenLight) fr.ovenLight.intensity = fire;
    if (fr.ovenMouth) fr.ovenMouth.material.emissiveIntensity = 0.45 + fire * 0.35;

    // 炉火跳一下
    if (fr.fire) {
      for (let i = 0; i < fr.fire.length; i++) {
        const f = fr.fire[i];
        const k = 0.85 + Math.sin(t * 7 + f.ph) * 0.18 + Math.sin(t * 13 + f.ph * 2) * 0.08;
        f.m.scale.set(1, k, 1);
        f.m.material.opacity = 0.55 + (k - 0.85) * 1.1;
      }
    }
    // 面团被揉的那一下：压扁 → 弹回来
    if (dough.squash > 0) {
      dough.squash = Math.max(0, dough.squash - dt * 3.4);
      const k = dough.squash;
      if (fr.doughBall) {
        fr.doughBall.scale.y = 1 - k * 0.32;
        fr.doughBall.scale.x = 1 + k * 0.16;
        fr.doughBall.scale.z = 1 + k * 0.16;
      }
    }
    // 炉子里的面包慢慢鼓起来
    if (baking) {
      dough.t -= dt;
      if (fr.ovenInner) {
        const k = Math.min(1, (10 - dough.t) / 10);
        const s = 0.7 + k * 0.36;
        fr.ovenInner.scale.set(s, s, s);
      }
      if (dough.t <= 0) {
        dough.state = 'baked';
        dough.t = 0;
        if (sfx && sfx.ovenDing) sfx.ovenDing();
        if (tip) tip('叮——面包烤好啦！按一下炉子拿出来 🥐', 4000);
        say(OVEN.x, 1.7, OVEN.z + 0.7, '叮——好啦！', 2.8);
        for (let i = 0; i < 8; i++) {
          spawnPart(OVEN.x + (Math.random() - 0.5) * 0.7, 1.3, OVEN.z + 0.5 + Math.random() * 0.2, 'steam');
        }
      }
    }
    // 面包冒热气（刚出炉 / 买来的）
    if (held && Math.random() < dt * 1.6) {
      spawnPart(held.position.x + (Math.random() - 0.5) * 0.1, held.position.y + 0.18,
        held.position.z + (Math.random() - 0.5) * 0.1, 'steam');
    }
    updateParts(dt);

    // 麦师傅：站着轻轻晃，胳膊慢慢摆（揉面的样子）
    if (fr.bear) {
      fr.bear.rotation.z = Math.sin(t * 0.9) * 0.018;
      fr.bear.position.y = Math.sin(t * 0.9 + 0.4) * 0.012;
    }
    if (fr.bearArmL) fr.bearArmL.rotation.x = -0.5 + Math.sin(t * 1.6) * 0.22;
    if (fr.bearArmR) fr.bearArmR.rotation.x = -0.5 + Math.sin(t * 1.6 + 1.1) * 0.22;

    // 吊灯的光晕（很轻）
    if (fr.bell) fr.bell.rotation.z = Math.sin(t * 1.2) * 0.02;

    // 走到门口就出去（跟咖啡馆一样，进去/出来都不用手动点门）
    if (cool > 0) cool -= dt;
    if (walking && camPos && cool <= 0) {
      const nearDoor = camPos.z > Z1 - 0.55 && camPos.x > DOOR.x0 - 0.3 && camPos.x < DOOR.x1 + 0.3;
      if (nearDoor) {
        cool = 2.5;
        onDoor('street');
      }
    }
  }

  /* ================= 走动边界 ================= */
  function clamp(x, z) {
    x = Math.max(X0 + 0.38, Math.min(X1 - 0.38, x));
    z = Math.max(Z0 + 1.0, Math.min(Z1 - 0.18, z));
    // 案子：绕过去
    const tdx = x - TABLE.x, tdz = z - TABLE.z;
    const td = Math.sqrt(tdx * tdx + tdz * tdz);
    const tr = 1.02;
    if (td < tr && td > 0.0001) {
      x = TABLE.x + tdx / td * tr;
      z = TABLE.z + tdz / td * tr;
    }
    // 窗边小圆桌
    const wdx = x - WT.x, wdz = z - WT.z;
    const wd = Math.sqrt(wdx * wdx + wdz * wdz);
    if (wd < 0.78 && wd > 0.0001) {
      x = WT.x + wdx / wd * 0.78;
      z = WT.z + wdz / wd * 0.78;
    }
    // 麦师傅（别从他身上穿过去）
    const bdx = x - BAKER.x, bdz = z - BAKER.z;
    const bd = Math.sqrt(bdx * bdx + bdz * bdz);
    if (bd < 0.62 && bd > 0.0001) {
      x = BAKER.x + bdx / bd * 0.62;
      z = BAKER.z + bdz / bd * 0.62;
    }
    // 面粉袋
    if (x < 141.5 && z > 1.1 && z < 2.1) z = Math.max(0.95, Math.min(1.1, z));
    return { x: x, z: z };
  }

  /* ================= 调试 ================= */
  function debug() {
    return {
      wallet: walletOf(),
      bought: boughtCount,
      held: heldKind,
      bites: heldBites,
      dough: dough.state + (dough.state === 'baking' ? '(' + Math.ceil(dough.t) + 's)' : '') + '/' + dough.n,
      bag: bag.length + (bag.length ? ':' + bag.join('/') : ''),
      homeBread: !!homeBread,
      bear: !!fr.bear,
      meshes: root ? root.children.length : 0
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    isBakeryNow = o.isBakery || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    walletOf = o.wallet || function () { return 0; };
    venueOf = o.venue || function () { return 'home'; };
    spend = o.spend || function () { return true; };
    if (!scene) return fallback();

    root = new THREE.Group();
    root.name = 'bakery-m45';
    root.visible = false;
    scene.add(root);

    buildRoom();
    buildOven();
    buildCounter();
    buildWorkTable();
    buildWindowTable();
    buildProps();
    buildBaker();
    buildLights();
    initParts();
    buildHomeBag();

    if (interact) {
      const when = function () { return !!isBakeryNow(); };

      interact.add({
        id: 'bak-door', label: '门',
        box: [(DOOR.x0 + DOOR.x1) / 2, 1.2, Z1 - 0.22, 1.5, 2.4, 0.5],
        anchor: [(DOOR.x0 + DOOR.x1) / 2, 2.5, Z1 - 0.3],
        when: when,
        onClick: function () { onDoor('street'); },
        say: '推门回鲸鱼街'
      });

      // 柜里四样，各点各的
      BREADS.forEach(function (b, i) {
        interact.add({
          id: 'bak-buy' + i, label: b.name,
          box: [b.x, CASE.y + 0.3, (CASE.z0 + CASE.z1) / 2, 0.62, 0.62, 0.54],
          anchor: [b.x, CASE.y + 0.72, (CASE.z0 + CASE.z1) / 2 + 0.2],
          when: when,
          onClick: function () { buy(i); },
          say: b.line
        });
      });

      interact.add({
        id: 'bak-bell', label: '柜台铃',
        box: [146.25, COUNTER.h + 0.2, -2.72, 0.36, 0.34, 0.36],
        anchor: [146.25, COUNTER.h + 0.5, -2.72],
        when: when,
        onClick: function () {
          if (sfx && sfx.bell) sfx.bell();
          if (fr.bell) fr.bell.rotation.z = 0.2;
        },
        say: '叮铃——有人吗？'
      });

      interact.add({
        id: 'bak-register', label: '收银机',
        box: [146.95, COUNTER.h + 0.3, -2.8, 0.6, 0.5, 0.5],
        anchor: [146.95, COUNTER.h + 0.6, -2.8],
        when: when,
        onClick: function () {
          if (sfx && sfx.print) sfx.print();
          say(146.95, 1.5, -2.8, '小票「嗒嗒」地吐出来——今天卖了不少', 3.2);
        },
        say: '收银机（钱箱里哗啦哗啦的）'
      });

      interact.add({
        id: 'bak-dough', label: '面团',
        box: [TABLE.x - 0.28, TABLE.h + 0.05, TABLE.z, 0.8, 0.5, 0.7],
        anchor: [TABLE.x - 0.28, TABLE.h + 0.5, TABLE.z],
        when: when,
        onClick: function () { knead(); },
        say: function () {
          if (dough.state === 'idle') return '案板上有一团面——按一下帮我揉（揉五下）';
          if (dough.state === 'kneading') return '还差 ' + (5 - dough.n) + ' 下，揉到光滑就好了';
          if (dough.state === 'ready') return '发起来了，按一下炉子送进去 🫧';
          return '面团已经进炉子了';
        }
      });

      interact.add({
        id: 'bak-oven', label: '烤炉',
        box: [OVEN.x, 1.0, OVEN.z + 0.42, 1.5, 1.5, 0.8],
        anchor: [OVEN.x, 1.7, OVEN.z + 0.62],
        when: when,
        onClick: function () { ovenClick(); },
        say: function () {
          if (dough.state === 'idle') return '砖砌的老炉子，膛里一直有火';
          if (dough.state === 'kneading') return '先把面团揉好再送进来';
          if (dough.state === 'ready') return '按一下，把面团送进去烤';
          if (dough.state === 'baking') return '还差 ' + Math.ceil(dough.t) + ' 秒…';
          return '叮过了——按一下把面包拿出来';
        }
      });

      interact.add({
        id: 'bak-bear', label: '麦师傅',
        box: [BAKER.x, 1.05, BAKER.z, 0.8, 1.9, 0.8],
        anchor: [BAKER.x, 1.75, BAKER.z + 0.2],
        when: when,
        onClick: function () {
          if (fr.bear) fr.bear.rotation.z = 0.06;
          if (sfx && sfx.pickup) sfx.pickup();
        },
        say: function () {
          const lines = [
            '麦师傅：面团要揉到能拉出膜，急不得',
            '麦师傅：今天的可颂起酥挺好，你尝尝',
            '麦师傅：炉子是我爷爷砌的，火候全靠听',
            '麦师傅：鲸鱼包是给你留的，别人问就没有 🐋',
            '麦师傅：外面那条街啊，早上全是面包味儿'
          ];
          return lines[Math.floor(t / 7 + Math.random() * 0.9) % lines.length];
        }
      });

      interact.add({
        id: 'bak-window', label: '窗边小桌',
        box: [WT.x, 0.9, WT.z, 1.9, 1.0, 1.0],
        anchor: [WT.x, 1.4, WT.z],
        when: when,
        onClick: function () {
          if (sfx && sfx.clink) sfx.clink();
          say(WT.x, 1.3, WT.z, '坐这儿能看见街上的人走来走去', 3.2);
        },
        say: '窗边的小圆桌'
      });

      interact.add({
        id: 'bak-menu', label: '小黑板',
        box: [X1 - 0.5, 1.1, 1.75, 0.5, 1.6, 1.2],
        anchor: [X1 - 0.75, 1.75, 1.75],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '今日现烤：可颂 ¥6 · 红豆包 ¥5 · 鲸鱼包 ¥9 · 吐司 ¥12'
      });

      interact.add({
        id: 'bak-flour', label: '面粉袋',
        box: [140.95, 0.3, 1.6, 1.1, 0.7, 0.7],
        anchor: [140.95, 0.8, 1.6],
        when: when,
        onClick: function () {
          if (sfx && sfx.puff) sfx.puff();
          for (let i = 0; i < 6; i++) {
            spawnPart(140.95 + (Math.random() - 0.5) * 0.5, 0.35, 1.6 + (Math.random() - 0.5) * 0.4, 'flour');
          }
          say(140.95, 0.8, 1.6, '（噗）面粉飞起来了', 2.6);
        },
        say: '三袋面粉，够烤一星期'
      });

      // 「咬一口」的热区：面包出现才亮
      fr.bite = interact.add({
        id: 'bak-bite', label: '咬一口',
        box: [TABLE.x, TABLE.h + 0.2, TABLE.z, 0.5, 0.5, 0.5],
        anchor: [TABLE.x, TABLE.h + 0.5, TABLE.z],
        when: when,
        onClick: function () { bite(); },
        enabled: false,
        say: '咬一口'
      });

      // M45.1：「打包带走」——装在柜台前沿一点，别和"咬一口"叠在一起
      fr.pack = interact.add({
        id: 'bak-pack', label: '打包带回家',
        box: [TABLE.x, TABLE.h + 0.2, TABLE.z + 0.3, 0.45, 0.45, 0.45],
        anchor: [TABLE.x, TABLE.h + 0.55, TABLE.z + 0.3],
        when: when,
        onClick: function () { packBread(); },
        enabled: false,
        say: '装进纸袋带走'
      });

      // 家里餐桌上的纸袋（打包回来的面包在这里吃）
      //   热区盒子要**立得比餐桌高**：餐桌那个 "dining" 热区是一大块（顶面 y 1.06），
      //   盒子矮了就永远先命中"餐桌"（点出来是一碗面），根本点不到纸袋。
      homeBagHot = interact.add({
        id: 'bak-home-bag', label: '面包纸袋',
        box: [HOME.bag.x, 1.02, HOME.bag.z, 0.46, 0.74, 0.46],
        anchor: [HOME.bag.x, 1.46, HOME.bag.z],
        when: function () { return venueOf() === 'home'; },
        onClick: function () { openHomeBag(); },
        enabled: false,
        say: function () {
          if (homeBread) return '咬一口（刚从纸袋里拿出来的）';
          if (!bag.length) return '纸袋空了';
          return '纸袋里还有 ' + bag.length + ' 个面包，拿一个出来吃';
        }
      });
    }

    // 调试参数：?bakery=knead 直接揉好、?bakery=fresh 直接有出炉的面包
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('bakery') === 'knead') {
        setTimeout(function () { for (let i = 0; i < 5; i++) knead(); }, 700);
      } else if (q.get('bakery') === 'fresh') {
        setTimeout(function () { buy(WHALE); }, 700);
      }
    } catch (e) { /* 无所谓 */ }

    return {
      root: root,
      setVisible: function (v) {
        const on = !!v;
        if (root) root.visible = on;
        if (on) {
          // 每天早上都补货：进店就把柜子摆满
          for (let i = 0; i < fr.breads.length; i++) {
            if (fr.breads[i]) fr.breads[i].visible = true;
          }
          // 进门那一下：门上的铃「叮铃」
          setTimeout(function () {
            if (!root || !root.visible) return;
            if (sfx && sfx.bell) sfx.bell();
          }, 420);
        }
      },
      clamp: clamp,
      update: update,
      spawn: { x: 146.2, y: 1.62, z: 2.25, yaw: 0.5 },
      spawnOutside: { x: 70.15, y: 1.62, z: 10.95, yaw: -Math.PI / 2 },
      buy: buy,
      knead: knead,
      oven: ovenClick,
      bite: bite,
      pack: packBread,
      homeTick: homeTick,
      openHome: openHomeBag,
      bagCount: function () { return bag.length; },
      debug: debug
    };
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      update: function () {},
      spawn: { x: 0, y: 1.62, z: 0, yaw: 0 },
      spawnOutside: { x: 70.15, y: 1.62, z: 10.95, yaw: -Math.PI / 2 },
      buy: function () {},
      knead: function () {},
      oven: function () {},
      bite: function () {},
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
