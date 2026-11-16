/* 小D的赛博小家 · M25 便利店二楼（员工休息室 + 理货小游戏）
 *
 * 楼下是冷白灯的 24h 小店，楼上是暖黄的小房间 —— 一层楼两种心情。
 * 从店里西南角那架铁爬梯上去（点一下爬梯，镜头黑场切到二楼）。
 *
 * 能玩的东西（M23 设计稿的 ④）：
 *   理货小游戏   把楼下散着的 3 个纸箱搬回仓库 → 老板给 ¥5（真的加到零花钱）
 *   微波炉       A 计时：转 10 秒 + 叮，热好的便当回家吃会说"热乎的"
 *   漫画堆       C 选择：真的三格分镜，点一下翻页（HTML 面板）
 *   电风扇       摇头 + 吹得纸片满地跑
 *   打卡机       上班/下班，日记里记「今天值了夜班」
 *   小床         点一下胖虎鲸自己躺上去
 */
window.XD = window.XD || {};

XD.Loft = (function () {
  'use strict';

  /* ================= 几何 ================= */
  const X0 = 20.0, X1 = 29.6, Z0 = -4.0, Z1 = 4.0;
  const FY = 3.48;                 // 二楼地面
  const CH = 2.72;                 // 二楼净高
  const CY = FY + CH;              // 6.20
  const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  const HOLE = { x0: 20.0, x1: 21.45, z0: 2.65, z1: 3.85 };   // 楼梯洞（西南角）
  const NUK = 9;                   // 微波炉要转几秒
  const SHIFT_SEC = 70;            // 理货一轮之后多久补新货

  /* ================= 状态 ================= */
  let scene = null, root = null, store = null, interact = null, sfx = null;
  let tip = null, shop = null, life = null;
  let isStore = function () { return false; };
  let getFloor = function () { return '1f'; };
  let goFloor = function () {};

  let t = 0;
  let st = {
    crates: 0,          // 已经搬走几个
    crateAt: 0,         // 上一轮结束的时间戳
    nuk: 'idle',        // idle | heating | hot
    nukT: 0,
    fan: false,
    sit: false
  };
  const LS = 'xd_loft';

  const frames = {
    crates: [],         // 楼下那三个纸箱
    nuk: null,          // 微波炉里转的盘子
    nukLamp: null,
    fanBlade: null,
    fanHead: null,
    papers: [],
    orca: null,
    orcaBase: 0
  };

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.7 : rough,
      metalness: metal === undefined ? 0 : metal
    });
  }
  function box(w, h, d, x, y, z, mat, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function ball(r, x, y, z, mat, parent) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || root).add(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    (parent || root).add(m);
    return m;
  }

  /* ================= 贴图 ================= */
  // 纸箱：牛皮纸 + 胶带 + 一个手写标记
  function crateTex() {
    return XD.Mat.tex(256, 256, function (g, W, H) {
      g.fillStyle = '#b98c5a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(90,62,36,.22)';
      for (let i = 0; i < 26; i++) g.fillRect(0, i * 10, W, 1.5);
      // 胶带
      g.fillStyle = 'rgba(226,214,190,.85)';
      g.fillRect(W * 0.42, 0, W * 0.16, H);
      // 标记
      g.strokeStyle = 'rgba(60,44,28,.55)';
      g.lineWidth = 3;
      g.strokeRect(18, H * 0.58, W * 0.44, H * 0.26);
      g.fillStyle = 'rgba(60,44,28,.6)';
      g.font = 'bold 26px sans-serif';
      g.fillText('小D', 26, H * 0.76);
    });
  }

  // 员工守则的小海报
  function posterTex() {
    return XD.Mat.tex(256, 340, function (g, W, H) {
      g.fillStyle = '#f3ecdd';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#3f4a5c';
      g.fillRect(0, 0, W, 54);
      g.fillStyle = '#f3ecdd';
      g.font = 'bold 24px sans-serif';
      g.fillText('员工守则', 22, 36);
      g.fillStyle = '#5b6478';
      g.font = '17px sans-serif';
      const lines = ['1. 货架空了要补', '2. 关东煮要换汤', '3. 凌晨三点可以', '   眯十分钟', '4. 想吃就自己拿', '   （记我账上）', '', '—— 老板'];
      lines.forEach(function (s, i) { g.fillText(s, 22, 96 + i * 30); });
    });
  }

  // 漫画：每页一大格分镜，一共三页
  function comicCanvas(page) {
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 470;
    const g = c.getContext('2d');
    // 纸
    g.fillStyle = '#f6f1e6';
    g.fillRect(0, 0, 360, 470);
    // 一大格
    const BIG = [14, 12, 332, 424];
    g.strokeStyle = '#3a3a44';
    g.lineWidth = 3;
    g.strokeRect(BIG[0], BIG[1], BIG[2], BIG[3]);
    g.fillStyle = '#fdfbf6';
    g.fillRect(BIG[0] + 2, BIG[1] + 2, BIG[2] - 4, BIG[3] - 4);

    function whale(cx, cy, s) {
      g.save();
      g.translate(cx, cy);
      g.scale(s, s);
      g.fillStyle = '#4d6bfe';
      g.beginPath(); g.ellipse(0, 0, 34, 26, 0, 0, 6.3); g.fill();
      g.fillStyle = '#f4f7ff';
      g.beginPath(); g.ellipse(2, 10, 26, 13, 0, 0, 6.3); g.fill();
      g.fillStyle = '#3a54cc';
      g.beginPath(); g.moveTo(-4, -24); g.lineTo(6, -36); g.lineTo(14, -22); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-32, 2); g.lineTo(-50, -12); g.lineTo(-48, 14); g.closePath(); g.fill();
      g.fillStyle = '#22306a';
      g.beginPath(); g.arc(18, -6, 3.2, 0, 6.3); g.fill();
      g.fillStyle = 'rgba(244,158,178,.6)';
      g.beginPath(); g.arc(22, 2, 5, 0, 6.3); g.fill();
      g.restore();
    }
    function bubble(x, y, text) {
      g.fillStyle = '#fffdf7';
      g.strokeStyle = '#3a3a44';
      g.lineWidth = 2.5;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, 168, 44, 12); else g.rect(x, y, 168, 44);
      g.fill(); g.stroke();
      g.fillStyle = '#2f3446';
      g.font = '18px sans-serif';
      g.fillText(text, x + 15, y + 29);
    }
    g.fillStyle = '#8a8578';
    g.font = '13px sans-serif';
    g.fillText('便利店夜班日记 · 第 ' + (page + 1) + ' 页', 20, 458);

    if (page === 0) {
      // 柜台 + 鲸鱼 + 欢迎光临
      g.fillStyle = '#dfe4ea'; g.fillRect(16, 300, 328, 134);
      g.fillStyle = '#c3ccd6'; g.fillRect(16, 300, 328, 10);
      whale(150, 285, 1.9);
      g.fillStyle = '#b9a37a'; g.fillRect(240, 210, 80, 46);
      g.fillStyle = '#7d8a99'; g.fillRect(250, 218, 60, 10);
      g.fillStyle = '#8b7a5e'; g.font = '15px sans-serif';
      g.fillText('（叮咚——）', 216, 190);
      bubble(30, 44, '欢迎光临～');
    } else if (page === 1) {
      // 二楼床上吃泡面
      g.fillStyle = '#e9dcc6'; g.fillRect(20, 310, 220, 120);
      g.fillStyle = '#cfc0a6'; g.fillRect(20, 310, 220, 12);
      whale(128, 296, 1.5);
      // 泡面碗
      g.fillStyle = '#f2f0e8';
      g.beginPath(); g.moveTo(250, 250); g.lineTo(322, 250); g.lineTo(312, 300); g.lineTo(260, 300); g.closePath(); g.fill();
      g.strokeStyle = '#d9c25a'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(254, 272); g.lineTo(318, 272); g.stroke();
      // 热气
      g.strokeStyle = 'rgba(120,130,150,.65)'; g.lineWidth = 2.5;
      [0, 1, 2].forEach(function (i) {
        g.beginPath();
        g.moveTo(266 + i * 20, 244);
        g.quadraticCurveTo(274 + i * 20, 218, 264 + i * 20, 196);
        g.stroke();
      });
      bubble(30, 44, '呼——好烫');
      g.fillStyle = '#8a8578'; g.font = '15px sans-serif';
      g.fillText('（凌晨三点，偷偷吃一盒）', 78, 408);
    } else {
      // 窗边看星星
      g.fillStyle = '#2b3358'; g.fillRect(16, 14, 328, 420);
      g.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) {
        const sx = 26 + (i * 71) % 310, sy = 26 + (i * 43) % 340;
        g.beginPath(); g.arc(sx, sy, (i % 4 === 0) ? 2.0 : 1.2, 0, 6.3); g.fill();
      }
      g.fillStyle = '#f7e6b0'; g.beginPath(); g.arc(292, 70, 22, 0, 6.3); g.fill();
      g.fillStyle = '#2b3358'; g.beginPath(); g.arc(280, 62, 20, 0, 6.3); g.fill();
      whale(140, 330, 1.1);
      bubble(30, 380, '明天也加油');
      g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '15px sans-serif';
      g.fillText('（关灯之前看两分钟）', 90, 440);
    }
    return c.toDataURL('image/png');
  }

  /* ================= 楼板（中间留楼梯洞） ================= */
  function buildFloor() {
    const woodMat = new THREE.MeshStandardMaterial({
      map: XD.Mat.woodFloor([4.2, 3.4]), roughness: 0.62, metalness: 0.02
    });
    const slab = std(0x9a8f7e, 0.95);

    function slabAt(x0, z0, x1, z1) {
      const w = x1 - x0, d = z1 - z0;
      const m = box(w, 0.16, d, (x0 + x1) / 2, FY - 0.08, (z0 + z1) / 2, slab);
      const f = plane(w, d, woodMat, (x0 + x1) / 2, FY + 0.002, (z0 + z1) / 2);
      f.rotation.x = -Math.PI / 2;
      f.receiveShadow = true;
      return m;
    }
    // 北块 / 南条 / 东块（西侧留给楼梯洞）
    slabAt(X0, Z0, X1, HOLE.z0);
    slabAt(X0, HOLE.z1, X1, Z1);
    slabAt(HOLE.x1, HOLE.z0, X1, HOLE.z1);

    // 洞口包边（木条）
    const trim = std(0x7a5c3a, 0.7);
    box(X1 - HOLE.x1 + 0.06, 0.05, 0.06, (HOLE.x1 + X1) / 2, FY + 0.01, HOLE.z0, trim);
    box(X1 - HOLE.x1 + 0.06, 0.05, 0.06, (HOLE.x1 + X1) / 2, FY + 0.01, HOLE.z1, trim);
    box(0.06, 0.05, HOLE.z1 - HOLE.z0, HOLE.x1, FY + 0.01, (HOLE.z0 + HOLE.z1) / 2, trim);
  }

  /* ================= 墙 / 顶 / 窗 ================= */
  function buildShell() {
    const baseTex = XD.Mat.wall();
    function wallMat(w, h) {
      const tex = baseTex.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1, w * 0.45), Math.max(1, h * 0.45));
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0, color: 0xfdf6ea });
    }
    const W = X1 - X0, D = Z1 - Z0;

    // 四面墙（南墙开窗）
    box(W, CH, 0.14, CX, FY + CH / 2, Z0 + 0.07, wallMat(W, CH));       // 北
    box(0.14, CH, D, X0 + 0.07, FY + CH / 2, CZ, wallMat(D, CH));       // 西
    box(0.14, CH, D, X1 - 0.07, FY + CH / 2, CZ, wallMat(D, CH));       // 东
    // 南墙：窗洞 x 25.6~28.4，y 4.5~5.62
    const wx0 = 25.6, wx1 = 28.4, wy0 = 4.50, wy1 = 5.62;
    box(wx0 - X0, CH, 0.14, (X0 + wx0) / 2, FY + CH / 2, Z1 - 0.07, wallMat(wx0 - X0, CH));
    box(X1 - wx1, CH, 0.14, (wx1 + X1) / 2, FY + CH / 2, Z1 - 0.07, wallMat(X1 - wx1, CH));
    box(wx1 - wx0, wy0 - FY, 0.14, (wx0 + wx1) / 2, (FY + wy0) / 2, Z1 - 0.07, wallMat(wx1 - wx0, wy0 - FY));
    box(wx1 - wx0, CY - wy1, 0.14, (wx0 + wx1) / 2, (wy1 + CY) / 2, Z1 - 0.07, wallMat(wx1 - wx0, CY - wy1));

    // 窗框 + 玻璃
    const frameMat = std(0x6b5138, 0.62);
    box(wx1 - wx0, 0.06, 0.10, (wx0 + wx1) / 2, wy1, Z1 - 0.08, frameMat);
    box(wx1 - wx0, 0.06, 0.10, (wx0 + wx1) / 2, wy0, Z1 - 0.08, frameMat);
    box(0.06, wy1 - wy0, 0.10, wx0, (wy0 + wy1) / 2, Z1 - 0.08, frameMat);
    box(0.06, wy1 - wy0, 0.10, wx1, (wy0 + wy1) / 2, Z1 - 0.08, frameMat);
    box(0.05, wy1 - wy0, 0.08, (wx0 + wx1) / 2, (wy0 + wy1) / 2, Z1 - 0.08, frameMat);
    const glass = new THREE.MeshStandardMaterial({
      color: col(0xcfe4ef), roughness: 0.05, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false
    });
    plane(wx1 - wx0 - 0.1, wy1 - wy0 - 0.1, glass, (wx0 + wx1) / 2, (wy0 + wy1) / 2, Z1 - 0.10);

    // 天花板
    const ceilMat = std(0xf5efe2, 0.96);
    const ceil = plane(W, D, ceilMat, CX, CY, CZ);
    ceil.rotation.x = Math.PI / 2;

    // 踢脚线
    const trim = std(0xc9b39a, 0.7);
    box(W, 0.09, 0.03, CX, FY + 0.045, Z0 + 0.155, trim);
  }

  /* ================= 楼梯洞的护栏 ================= */
  function buildHoleRail() {
    const wood = std(0x8a6a44, 0.72);
    const cap = std(0xa9855a, 0.6);
    const H = 0.92;
    // 东侧一段
    box(0.06, 0.05, HOLE.z1 - HOLE.z0, HOLE.x1, FY + H, (HOLE.z0 + HOLE.z1) / 2, cap);
    [-1, 1].forEach(function (s) {
      box(0.05, H, 0.05, HOLE.x1, FY + H / 2, (HOLE.z0 + HOLE.z1) / 2 + s * (HOLE.z1 - HOLE.z0) / 2, wood);
    });
    box(0.04, 0.04, HOLE.z1 - HOLE.z0, HOLE.x1, FY + H * 0.45, (HOLE.z0 + HOLE.z1) / 2, wood);
    // 北侧一段（从 x0 到 x1）
    box(HOLE.x1 - X0, 0.05, 0.06, (X0 + HOLE.x1) / 2, FY + H, HOLE.z0, cap);
    box(0.05, H, 0.05, X0 + 0.08, FY + H / 2, HOLE.z0, wood);
    box(0.04, 0.04, HOLE.z1 - HOLE.z0 + 0.1, HOLE.x1, FY + 0.14, (HOLE.z0 + HOLE.z1) / 2, wood);
    // 竖栏杆
    for (let x = X0 + 0.30; x < HOLE.x1 - 0.05; x += 0.24) {
      box(0.03, H - 0.08, 0.03, x, FY + (H - 0.08) / 2, HOLE.z0, wood);
    }
    for (let z = HOLE.z0 + 0.22; z < HOLE.z1 - 0.05; z += 0.24) {
      box(0.03, H - 0.08, 0.03, HOLE.x1, FY + (H - 0.08) / 2, z, wood);
    }
  }

  /* ================= 铁爬梯（楼下那一架） ================= */
  function buildLadder() {
    const steel = std(0x7c848c, 0.42, 0.55);
    const z = 3.20;
    const x = X0 + 0.20;
    [-0.28, 0.28].forEach(function (dz) {
      cyl(0.035, 0.035, FY + 0.55, 10, x, (FY + 0.55) / 2, z + dz, steel);
    });
    for (let y = 0.30; y < FY + 0.35; y += 0.30) {
      box(0.06, 0.03, 0.56, x, y, z, steel);      // 横档沿 z 连接两根竖杆
    }
    // 顶部的平台段（通进洞口）
    box(1.30, 0.05, 0.70, X0 + 0.72, FY - 0.02, z, steel);
    // 墙上的把手
    box(0.03, 0.30, 0.03, X0 + 0.16, FY + 0.9, z - 0.34, steel);
  }

  /* ================= 休息室：床 / 桌 / 微波炉 / 电扇 ================= */
  function buildBed() {
    const g = new THREE.Group();
    g.position.set(X0 + 2.85, FY, Z0 + 1.35);
    root.add(g);
    const wood = std(0x8a6a44, 0.7);
    const matt = std(0xf0e8d8, 0.95);
    const duvet = std(0xb9c6bb, 0.96);
    const pil = std(0xf7f2e6, 0.97);

    // 床架
    box(1.55, 0.16, 2.00, 0, 0.24, 0, wood, g);
    [[-0.70, 0.92], [0.70, 0.92], [-0.70, -0.92], [0.70, -0.92]].forEach(function (p) {
      box(0.08, 0.26, 0.08, p[0], 0.13, p[1], wood, g);
    });
    // 床头板
    box(1.55, 0.55, 0.07, 0, 0.56, -1.00, wood, g);
    // 床垫
    box(1.44, 0.14, 1.86, 0, 0.40, 0.02, matt, g);
    // 被子
    box(1.46, 0.10, 1.15, 0, 0.50, 0.35, duvet, g);
    box(1.46, 0.05, 0.20, 0, 0.52, -0.22, std(0xd7dfd4, 0.96), g);   // 被角翻边
    // 枕头
    box(0.62, 0.13, 0.34, 0, 0.51, -0.75, pil, g);
    // 床下的收纳箱
    box(0.60, 0.20, 0.40, -0.42, 0.10, 0.55, std(0x6f7f8c, 0.85), g);

    frames.bedPos = { x: X0 + 2.85, y: FY, z: Z0 + 1.35 };
  }

  function buildNuker() {
    const g = new THREE.Group();
    g.position.set(X0 + 4.75, FY, Z0 + 1.20);
    root.add(g);
    const wood = std(0x9a7a52, 0.7);
    const shellMat = std(0xdcd8d0, 0.5);
    const darkMat = std(0x2b2f36, 0.4);

    // 小桌子
    box(0.86, 0.06, 0.56, 0, 0.74, 0, wood, g);
    [[-0.38, 0.24], [0.38, 0.24], [-0.38, -0.24], [0.38, -0.24]].forEach(function (p) {
      box(0.05, 0.72, 0.05, p[0], 0.36, p[1], wood, g);
    });
    // 微波炉
    const mw = new THREE.Group();
    mw.position.set(0, 0.77, 0);
    mw.rotation.y = -0.34;
    g.add(mw);
    box(0.50, 0.30, 0.36, 0, 0.15, 0, shellMat, mw);
    // 门（朝 -x 侧开个窗）
    box(0.34, 0.24, 0.02, -0.06, 0.15, 0.185, darkMat, mw);
    const winMat = new THREE.MeshStandardMaterial({
      color: col(0x3b4650), roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.75
    });
    box(0.26, 0.17, 0.012, -0.06, 0.15, 0.197, winMat, mw);
    // 右侧控制面板
    box(0.12, 0.26, 0.02, 0.20, 0.15, 0.186, std(0xb9b3a8, 0.6), mw);
    box(0.045, 0.045, 0.02, 0.20, 0.24, 0.20, std(0x7f8b96, 0.6), mw);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: col(0x4a5348) }));
    lamp.position.set(0.20, 0.07, 0.20);
    mw.add(lamp);
    frames.nukLamp = lamp.material;
    // 里面转的盘子
    const plate = new THREE.Group();
    plate.position.set(-0.06, 0.05, 0.06);
    mw.add(plate);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.012, 16), std(0xe6e2d8, 0.6));
    plate.add(disc);
    const food = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std(0xd8b071, 0.9));
    food.position.y = 0.03;
    food.scale.set(1.3, 0.7, 1.1);
    plate.add(food);
    frames.nuk = plate;

    // 桌上：一摞便当盒 + 筷子
    box(0.20, 0.05, 0.20, 0.30, 0.795, -0.18, std(0xf2efe6, 0.8), g);
    box(0.20, 0.05, 0.20, 0.30, 0.845, -0.18, std(0xe8e4d8, 0.8), g);
  }

  function buildFan() {
    const g = new THREE.Group();
    g.position.set(X1 - 1.35, FY, Z0 + 2.10);
    root.add(g);
    const metal = std(0x8f969e, 0.42, 0.5);
    const dark = std(0x54595f, 0.5);
    // 底座 + 杆
    cyl(0.22, 0.24, 0.05, 16, 0, 0.025, 0, dark, g);
    cyl(0.035, 0.035, 1.05, 10, 0, 0.55, 0, metal, g);
    // 能摇头的头
    const head = new THREE.Group();
    head.position.set(0, 1.08, 0);
    g.add(head);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 24), metal);
    cage.rotation.y = Math.PI / 2;
    head.add(cage);
    const blade = new THREE.Group();
    blade.position.set(0.02, 0, 0);
    head.add(blade);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.19, 0.075), std(0xc8d2d8, 0.8));
      b.position.set(0, Math.cos(i * 2.094) * 0.10, Math.sin(i * 2.094) * 0.10);
      b.rotation.x = i * 2.094;
      blade.add(b);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), dark);
    head.add(hub);
    frames.fanBlade = blade;
    frames.fanHead = head;

    // 地上一张会飞的纸
    const paper = plane(0.21, 0.29, std(0xf6f3ea, 0.95), 0, 0.01, 0);
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(X1 - 2.1, FY + 0.012, Z0 + 2.9);
    root.add(paper);
    frames.papers.push({ m: paper, ph: Math.random() * 6.3 });
  }

  /* ================= 漫画堆 / 打卡机 / 仓储 ================= */
  function buildComic() {
    const g = new THREE.Group();
    g.position.set(X0 + 6.30, FY, Z0 + 1.00);
    root.add(g);
    // 一摞漫画（不同颜色）
    const cols = [0xd98a7a, 0x7fa8c4, 0x9fbf84, 0xdcc06a, 0xa88fc4];
    cols.forEach(function (c, i) {
      const m = box(0.30, 0.045, 0.42, (i % 2) * 0.05 - 0.02, 0.023 + i * 0.047, (i % 3) * 0.03, std(c, 0.9), g);
      m.rotation.y = (i - 2) * 0.04;
    });
    // 最上面那本翻开一点
    const open = new THREE.Group();
    open.position.set(-0.03, 0.256, 0);
    open.rotation.y = 0.3;
    g.add(open);
    box(0.30, 0.02, 0.20, 0, 0, -0.10, std(0xe9dfc8, 0.92), open);
    box(0.30, 0.02, 0.20, 0, 0.012, 0.10, std(0xf2e9d4, 0.92), open).rotation.x = -0.16;
    // 纸箱当书架
    box(0.62, 0.34, 0.44, 0.34, 0.17, -0.06, new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.9 }), g);
  }

  function buildClock() {
    // 墙上的打卡机
    const g = new THREE.Group();
    g.position.set(X0 + 7.60, FY + 1.05, Z0 + 0.20);
    root.add(g);
    box(0.30, 0.38, 0.12, 0, 0, 0, std(0x4a5560, 0.5, 0.15), g);
    box(0.22, 0.12, 0.02, 0, 0.08, 0.07, std(0x2c333a, 0.4), g);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.09), new THREE.MeshBasicMaterial({ color: col(0x9fe0b4) }));
    scr.position.set(0, 0.08, 0.082);
    g.add(scr);
    frames.clockScr = scr.material;
    // 下面插卡口 + 一张卡
    box(0.16, 0.02, 0.03, 0, -0.10, 0.06, std(0x1f2429, 0.6), g);
    const card = box(0.10, 0.012, 0.14, 0, -0.055, 0.14, std(0xf2e6c8, 0.8), g);
    card.rotation.x = -0.25;
    // 旁边的员工守则海报
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), new THREE.MeshStandardMaterial({ map: posterTex(), roughness: 0.95 }));
    p.position.set(X0 + 6.55, FY + 1.30, Z0 + 0.09);
    root.add(p);
  }

  function buildStorage() {
    // 仓储区：几个货箱堆在南边
    const g = new THREE.Group();
    g.position.set(X0 + 3.15, FY, Z1 - 1.55);
    root.add(g);
    const tex = crateTex();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const spots = [
      [0, 0.22, 0, 0.62, 0.44, 0.5, 0.10],
      [0.72, 0.22, 0.10, 0.56, 0.44, 0.46, -0.22],
      [0.05, 0.66, 0.02, 0.54, 0.42, 0.46, -0.06],
      [-0.70, 0.22, -0.14, 0.58, 0.44, 0.44, 0.26]
    ];
    spots.forEach(function (s) {
      const m = box(s[3], s[4], s[5], s[0], s[1], s[2], mat, g);
      m.rotation.y = s[6];
    });
    // 挂着的员工外套
    box(0.44, 0.62, 0.10, X0 + 1.60, FY + 1.30, Z1 - 0.16, std(0x6b7f8f, 0.94), root);
  }

  /* ================= 地毯 + 小茶几（房间里别太空） ================= */
  function buildRug() {
    const rugMat = std(0xb4c0ac, 0.99);
    const rug = plane(2.9, 2.1, rugMat, X0 + 4.55, FY + 0.010, CZ + 0.15);
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    const edge = plane(3.0, 2.2, std(0x9dab96, 0.99), X0 + 4.55, FY + 0.006, CZ + 0.15);
    edge.rotation.x = -Math.PI / 2;
    edge.receiveShadow = true;

    // 矮圆几
    const g = new THREE.Group();
    g.position.set(X0 + 4.55, FY, CZ + 0.10);
    root.add(g);
    const wood = std(0x8a6a44, 0.7);
    cyl(0.34, 0.34, 0.05, 20, 0, 0.42, 0, wood, g);
    cyl(0.04, 0.05, 0.40, 10, 0, 0.21, 0, wood, g);
    cyl(0.20, 0.22, 0.03, 16, 0, 0.015, 0, wood, g);
    // 桌上：一盒泡面 + 一杯水
    box(0.13, 0.11, 0.13, -0.10, 0.485, 0.02, std(0xf2e9d0, 0.85), g);
    cyl(0.045, 0.038, 0.10, 12, 0.12, 0.48, -0.04, std(0xd6e6ea, 0.3), g);
    // 一把小凳子
    const st = new THREE.Group();
    st.position.set(X0 + 5.55, FY, CZ + 0.10);
    st.rotation.y = -0.4;
    root.add(st);
    cyl(0.20, 0.20, 0.05, 16, 0, 0.44, 0, std(0xa98a5e, 0.75), st);
    [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]].forEach(function (p) {
      cyl(0.018, 0.018, 0.42, 8, p[0], 0.21, p[1], std(0x6b5138, 0.7), st);
    });
  }

  /* ================= 墙上的小东西 + 一盆绿植 ================= */
  function buildDecor() {
    // 两张小海报
    function poster(hexA, hexB, text, x, z, ry) {
      const t = XD.Mat.tex(200, 260, function (g, W, H) {
        g.fillStyle = hexA; g.fillRect(0, 0, W, H);
        g.fillStyle = hexB;
        g.font = 'bold 40px sans-serif';
        g.fillText(text, 20, 90);
        g.font = '18px sans-serif';
        g.fillText('小D的夜班', 20, 140);
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 4;
        g.strokeRect(12, 12, W - 24, H - 24);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.57),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      m.position.set(x, FY + 1.55, z);
      m.rotation.y = ry;
      root.add(m);
    }
    poster('#4d6bfe', '#ffffff', '24H', X0 + 1.35, Z0 + 0.10, 0);
    poster('#c2553f', '#ffe6c4', '补货', X0 + 5.85, Z0 + 0.10, 0);

    // 南墙边一盆绿植
    const g = new THREE.Group();
    g.position.set(X1 - 1.05, FY, Z1 - 1.15);
    root.add(g);
    const pot = cyl(0.20, 0.16, 0.30, 14, 0, 0.15, 0, std(0xb07a56, 0.85), g);
    void pot;
    cyl(0.19, 0.19, 0.02, 14, 0, 0.30, 0, std(0x4a382a, 0.98), g);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std(i % 2 ? 0x6c9a5e : 0x82ab6e, 0.9));
      lf.position.set(Math.cos(a) * 0.14, 0.42 + (i % 3) * 0.11, Math.sin(a) * 0.14);
      lf.scale.set(1, 0.42, 0.8);
      lf.rotation.z = Math.sin(a) * 0.5;
      lf.castShadow = true;
      g.add(lf);
    }

    // 南边再堆两个纸箱（仓储的感觉）
    const mat = new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.9 });
    [[23.9, 0.22, 3.05, 0.12], [24.5, 0.22, 3.30, -0.35], [24.2, 0.64, 3.18, 0.5]].forEach(function (s) {
      const m = box(0.58, 0.42, 0.44, s[0], s[1], s[2], mat);
      m.rotation.y = s[3];
    });
  }

  /* ================= 灯 ================= */
  function buildLights() {
    const warm = std(0xf0e2c8, 0.75);
    // 吸顶小吊灯
    const cord = cyl(0.008, 0.008, 0.42, 6, X0 + 4.8, CY - 0.21, CZ, std(0x4a4038, 0.8));
    void cord;
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.22, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: col(0xf4e8d0), roughness: 0.8, side: THREE.DoubleSide })
    );
    shade.position.set(X0 + 4.8, CY - 0.40, CZ);
    shade.rotation.x = Math.PI;
    root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10),
      new THREE.MeshBasicMaterial({ color: col(0xffe9c0) }));
    bulb.position.set(X0 + 4.8, CY - 0.50, CZ);
    root.add(bulb);
    const main = new THREE.PointLight(0xffd9a4, 1.85, 12, 2);
    main.position.set(X0 + 4.8, CY - 0.55, CZ);
    root.add(main);
    // 一点点暖环境光（不然二楼只有几个点光源，角落是死的）
    const amb = new THREE.AmbientLight(0xffe6c4, 0.30);
    root.add(amb);

    // 床头小台灯
    const lampBase = cyl(0.06, 0.07, 0.02, 12, X0 + 2.85, FY + 0.10, Z0 + 0.30, std(0x6b5a44, 0.6));
    void lampBase;
    cyl(0.014, 0.014, 0.22, 8, X0 + 2.85, FY + 0.21, Z0 + 0.30, std(0x8a7a62, 0.6));
    const ls = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.16, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: col(0xf6e6c6), roughness: 0.85, side: THREE.DoubleSide })
    );
    ls.position.set(X0 + 2.85, FY + 0.40, Z0 + 0.30);
    ls.rotation.x = Math.PI;
    root.add(ls);
    const lb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8),
      new THREE.MeshBasicMaterial({ color: col(0xffe0a8) }));
    lb.position.set(X0 + 2.85, FY + 0.33, Z0 + 0.30);
    root.add(lb);
    const bedLight = new THREE.PointLight(0xffcf9a, 0.75, 4.6, 2);
    bedLight.position.set(X0 + 2.85, FY + 0.34, Z0 + 0.34);
    bedLight.userData.base = 0.75;
    root.add(bedLight);
    frames.bedLight = bedLight;

    // 一点点冷白从楼下/窗户漏上来（跟暖光撞一下才像"二楼"）
    const cool = new THREE.PointLight(0xbcd4ff, 0.35, 9, 2);
    cool.position.set(X1 - 1.2, FY + 1.9, Z1 - 0.8);
    root.add(cool);
  }

  /* ================= 楼下散落的三个纸箱 ================= */
  function buildCrates() {
    const tex = crateTex();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const spots = [
      { x: 21.65, z: 1.45, ry: 0.4 },
      { x: 23.70, z: 1.30, ry: -0.7 },
      { x: 25.95, z: 3.35, ry: 1.1 }
    ];
    const oldRoot = root;
    spots.forEach(function (s, i) {
      const g = new THREE.Group();
      g.position.set(s.x, 0.22, s.z);
      g.rotation.y = s.ry;
      oldRoot.add(g);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.40), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      // 盖子翘起来一点
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.20), mat);
      lid.position.set(0, 0.22, -0.14);
      lid.rotation.x = 0.5;
      g.add(lid);
      g.userData.taken = false;
      frames.crates.push({ g: g, home: { x: s.x, y: 0.22, z: s.z, ry: s.ry }, anim: -1 });
    });
  }

  /* ================= 存 / 读 ================= */
  function save() {
    try { localStorage.setItem(LS, JSON.stringify({ crates: st.crates, crateAt: st.crateAt, nuk: st.nuk })); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o) return;
      st.crates = Math.max(0, Math.min(3, o.crates || 0));
      st.crateAt = o.crateAt || 0;
      st.nuk = (o.nuk === 'hot') ? 'hot' : 'idle';
    } catch (e) {}
  }

  /* ================= 理货（赚钱） ================= */
  function refreshCrates() {
    const now = Date.now();
    if (st.crates >= 3 && st.crateAt && (now - st.crateAt) > SHIFT_SEC * 1000) {
      st.crates = 0;
      st.crateAt = 0;
      save();
    }
    frames.crates.forEach(function (c, i) {
      const gone = i < st.crates;
      c.g.visible = !gone;
      if (!gone) {
        c.g.position.set(c.home.x, c.home.y, c.home.z);
        c.g.rotation.y = c.home.ry;
        c.g.scale.set(1, 1, 1);
      }
      c.anim = -1;
    });
  }

  function takeCrate(i) {
    const c = frames.crates[i];
    if (!c || !c.g.visible || c.anim >= 0) return false;
    c.anim = 0;
    st.crates = Math.min(3, st.crates + 1);
    save();
    if (sfx) { try { sfx.pickup(); } catch (e) {} }

    const left = 3 - st.crates;
    if (left === 0) {
      st.crateAt = Date.now();
      save();
      if (shop && shop.addMoney) shop.addMoney(5);
      if (sfx) { try { setTimeout(function () { try { sfx.cash(); } catch (e) {} }, 420); } catch (e) {} }
      if (life && life.log) life.log('在便利店理货，老板给了 ¥5');
      if (tip) tip('理完啦！老板塞给你 ¥5 —— 攒着能买好吃的 🥤', 4600);
    } else if (tip) {
      tip('搬上去一箱，还剩 ' + left + ' 箱', 2200);
    }
    return true;
  }

  /* ================= 可点的地方 ================= */
  function register() {
    if (!interact || !interact.add) return;
    const atStore1 = function () { return isStore() && getFloor() === '1f'; };
    const atStore2 = function () { return isStore() && getFloor() === '2f'; };

    // 楼下：铁爬梯 → 上楼
    interact.add({
      id: 'loft-up', label: '上二楼',
      box: [20.42, 1.75, 3.20, 0.62, 3.30, 0.95],
      anchor: [20.75, 2.30, 3.20],
      when: atStore1,
      onClick: function () {
        if (sfx) { try { sfx.step('tile'); } catch (e) {} }
        goFloor('2f');
        this._say = '爬上来了 —— 楼上是我值班时待的地方';
      },
      say: function (h) { return h._say || '爬上去'; }
    });

    // 楼下：三个纸箱
    frames.crates.forEach(function (c, i) {
      interact.add({
        id: 'loft-crate' + (i + 1), label: '要补的货',
        box: [c.home.x, 0.24, c.home.z, 0.56, 0.60, 0.52],
        anchor: [c.home.x, 0.62, c.home.z],
        when: function () { return atStore1() && c.g.visible; },
        onClick: function () {
          if (takeCrate(i)) {
            this._say = st.crates >= 3
              ? '最后一箱！搬上去就理完了'
              : '这箱搬上去放好（' + st.crates + '/3）';
          } else {
            this._say = '哎，这箱已经搬走了';
          }
        },
        say: function (h) { return h._say || '搬上去'; }
      });
    });

    // 二楼：下楼（洞口）
    interact.add({
      id: 'loft-down', label: '下楼',
      box: [21.05, FY + 0.55, 3.25, 1.10, 1.20, 1.10],
      anchor: [21.15, FY + 0.80, 3.25],
      when: atStore2,
      onClick: function () {
        if (sfx) { try { sfx.step('tile'); } catch (e) {} }
        goFloor('1f');
        this._say = '下去啦，楼下还有客人呢';
      },
      say: function (h) { return h._say || '下去'; }
    });

    // 上天台（M28）：东北角那架铁梯
    interact.add({
      id: 'loft-roof', label: '上天台',
      box: [28.75, FY + 1.35, -3.17, 0.80, 2.50, 1.00],
      anchor: [28.75, FY + 1.95, -3.17],
      when: atStore2,
      onClick: function () {
        if (sfx) { try { sfx.step('tile'); } catch (e) {} }
        goFloor('3f');
        this._say = '上天台 —— 我把桌子和椅子都搬上去了';
      },
      say: function (h) { return h._say || '上天台'; }
    });

    // 微波炉
    interact.add({
      id: 'loft-nuke', label: '微波炉',
      box: [X0 + 4.75, FY + 0.92, Z0 + 1.20, 0.62, 0.52, 0.50],
      anchor: [X0 + 4.75, FY + 1.22, Z0 + 1.20],
      when: atStore2,
      onClick: function () {
        if (st.nuk === 'heating') {
          this._say = '还在转呢，还有 ' + Math.max(0, Math.ceil(NUK - st.nukT)) + ' 秒';
          return;
        }
        if (st.nuk === 'hot') {
          this._say = '便当已经热好了，趁热吃吧';
          return;
        }
        st.nuk = 'heating';
        st.nukT = 0;
        save();
        if (sfx) { try { sfx.humOn ? sfx.humOn(0.3) : sfx.beep(); } catch (e) {} }
        this._say = '把便当放进去转 ' + NUK + ' 秒 —— 等一下就好';
      },
      say: function (h) { return h._say || '热东西'; }
    });

    // 漫画堆
    interact.add({
      id: 'loft-comic', label: '漫画堆',
      box: [X0 + 6.30, FY + 0.18, Z0 + 1.00, 0.72, 0.52, 0.62],
      anchor: [X0 + 6.30, FY + 0.52, Z0 + 1.00],
      when: atStore2,
      onClick: function () {
        if (sfx) { try { sfx.print(); } catch (e) {} }
        showComic();
        this._say = '值班的时候偷偷看两页（点面板右下角翻页）';
      },
      say: function (h) { return h._say || '看漫画'; }
    });

    // 电风扇
    interact.add({
      id: 'loft-fan', label: '电风扇',
      box: [X1 - 1.35, FY + 1.05, Z0 + 2.10, 0.60, 0.80, 0.50],
      anchor: [X1 - 1.35, FY + 1.45, Z0 + 2.10],
      when: atStore2,
      onClick: function () {
        st.fan = !st.fan;
        if (sfx) { try { st.fan ? sfx.beep() : sfx.pop(); } catch (e) {} }
        this._say = st.fan ? '风扇开啦 —— 纸片都被吹起来了' : '关掉了，安静多了';
      },
      say: function (h) { return h._say || '开风扇'; }
    });

    // 打卡机
    interact.add({
      id: 'loft-clock', label: '打卡机',
      box: [X0 + 7.60, FY + 1.05, Z0 + 0.22, 0.40, 0.50, 0.24],
      anchor: [X0 + 7.60, FY + 1.42, Z0 + 0.22],
      when: atStore2,
      onClick: function () {
        const d = new Date();
        const hh = d.getHours(), mm = d.getMinutes();
        const near = (hh >= 20 || hh < 6);
        const ts = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
        if (sfx) { try { sfx.beep(); } catch (e) {} }
        if (life && life.log) life.log((near ? '值了夜班，打卡 ' : '来上班，打卡 ') + ts);
        this._say = near ? '打卡成功 ' + ts + ' —— 今天值夜班' : '打卡成功 ' + ts + ' —— 今天是我看店';
      },
      say: function (h) { return h._say || '打卡'; }
    });

    // 小床
    interact.add({
      id: 'loft-bed', label: '小床',
      box: [X0 + 2.85, FY + 0.40, Z0 + 1.35, 1.60, 0.70, 2.05],
      anchor: [X0 + 2.85, FY + 0.90, Z0 + 1.35],
      when: atStore2,
      onClick: function () {
        st.sit = !st.sit;
        if (frames.orca) frames.orca.visible = st.sit;
        if (sfx) { try { sfx.pop(); } catch (e) {} }
        this._say = st.sit
          ? '躺十分钟就起来（值班最舒服的就是这十分钟）'
          : '起来啦，货架还得看着呢';
      },
      say: function (h) { return h._say || '躺一会儿'; }
    });
  }

  /* ================= 漫画面板 ================= */
  let comicPage = 0;
  let comicImgs = null;
  function showComic() {
    const el = document.getElementById('comic');
    if (!el) return;
    if (!comicImgs) comicImgs = [comicCanvas(0), comicCanvas(1), comicCanvas(2)];
    comicPage = 0;
    renderComic();
    el.classList.add('show');
  }
  function renderComic() {
    const el = document.getElementById('comic');
    if (!el) return;
    const img = document.getElementById('comicImg');
    const no = document.getElementById('comicNo');
    if (img) img.src = comicImgs[comicPage];
    if (no) no.textContent = (comicPage + 1) + ' / 3';
  }
  function nextComic() {
    if (!comicImgs) return;
    comicPage = (comicPage + 1) % 3;
    renderComic();
    if (sfx) { try { sfx.print(); } catch (e) {} }
  }
  function hideComic() {
    const el = document.getElementById('comic');
    if (el) el.classList.remove('show');
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!root) return;
    t += dt;

    // 纸箱被搬走：往上飘 + 缩小
    frames.crates.forEach(function (c) {
      if (c.anim < 0) return;
      c.anim += dt;
      const k = Math.min(1, c.anim / 0.62);
      c.g.position.y = c.home.y + k * 1.7;
      c.g.rotation.y = c.home.ry + k * 3.4;
      const s = 1 - k * 0.85;
      c.g.scale.set(s, s, s);
      if (k >= 1) { c.g.visible = false; c.anim = -1; }
    });

    // 补货：理完之后过一阵子重新出现
    if (st.crates >= 3 && st.crateAt && (Date.now() - st.crateAt) > SHIFT_SEC * 1000) {
      refreshCrates();
    }

    // 微波炉
    if (st.nuk === 'heating') {
      st.nukT += dt;
      if (frames.nuk) frames.nuk.rotation.y += dt * 2.4;
      if (frames.nukLamp) frames.nukLamp.color.copy(col((Math.floor(st.nukT * 3) % 2) ? 0xffb060 : 0x4a5348));
      if (st.nukT >= NUK) {
        st.nuk = 'hot';
        save();
        if (sfx) { try { sfx.ding({ x: X0 + 4.75, y: FY + 1.0, z: Z0 + 1.2 }); } catch (e) {} }
        if (frames.nukLamp) frames.nukLamp.color.copy(col(0x9fe0b4));
        if (tip) tip('叮 —— 便当热好啦，趁热吃 🍱', 3600);
        if (life && life.log) life.log('热了一个便当');
      }
    }

    // 电风扇
    const on2f = isStore() && getFloor() === '2f';
    if (frames.fanBlade) {
      const spinning = on2f && st.fan;
      if (spinning) frames.fanBlade.rotation.x += dt * 22;
      if (frames.fanHead) {
        frames.fanHead.rotation.y = st.fan ? Math.sin(t * 0.9) * 0.62 : 0;
      }
    }
    // 纸片被吹起来
    frames.papers.forEach(function (p) {
      const blow = on2f && st.fan;
      const base = { x: X1 - 2.1, y: FY + 0.012, z: Z0 + 2.9 };
      if (blow) {
        p.m.position.x = base.x + Math.sin(t * 2.2 + p.ph) * 0.30;
        p.m.position.z = base.z + Math.cos(t * 1.7 + p.ph) * 0.22;
        p.m.position.y = base.y + Math.abs(Math.sin(t * 3.1)) * 0.10;
        p.m.rotation.z = Math.sin(t * 3.4) * 0.9;
      } else {
        p.m.position.set(base.x, base.y, base.z);
        p.m.rotation.z = 0;
      }
    });

    // 床上的小D 呼吸
    if (frames.orca && frames.orca.visible) {
      frames.orca.position.y = frames.orcaBase + Math.sin(t * 1.3) * 0.012;
    }

    // 打卡机的屏幕（绿光呼吸）
    if (frames.clockScr) {
      const k = 0.7 + 0.3 * Math.sin(t * 1.6);
      frames.clockScr.color.copy(col(0x9fe0b4)).multiplyScalar(k);
    }

    // 床头台灯跟昼夜：白天收暗
    if (frames.bedLight) {
      const day = (XD.Atmos && false) ? false : true;
      void day;
      frames.bedLight.intensity = 0.75;
    }
  }

  /* ================= 上下楼边界 ================= */
  const OBST2 = [
    { x0: X0 + 2.02, x1: X0 + 3.68, z0: Z0 + 0.30, z1: Z0 + 2.40 },   // 床
    { x0: X0 + 4.28, x1: X0 + 5.22, z0: Z0 + 0.88, z1: Z0 + 1.52 },   // 微波炉桌
    { x0: X0 + 5.66, x1: X0 + 6.94, z0: Z0 + 0.66, z1: Z0 + 1.34 },   // 漫画堆
    { x0: X1 - 1.66, x1: X1 - 1.04, z0: Z0 + 1.80, z1: Z0 + 2.40 },   // 电扇
    { x0: X0 + 2.40, x1: X0 + 4.10, z0: Z1 - 1.95, z1: Z1 - 1.15 },   // 货箱堆
    { x0: HOLE.x0, x1: HOLE.x1 + 0.10, z0: HOLE.z0 - 0.10, z1: HOLE.z1 + 0.10 }   // 楼梯洞（别掉下去）
  ];

  function clamp2f(x, z, oldX, oldZ) {
    if (oldX === undefined) oldX = x;
    if (oldZ === undefined) oldZ = z;
    x = Math.max(X0 + 0.42, Math.min(X1 - 0.42, x));
    z = Math.max(Z0 + 0.42, Math.min(Z1 - 0.42, z));
    for (let i = 0; i < OBST2.length; i++) {
      const r = OBST2[i];
      if (!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
      if (oldX <= r.x0) { x = r.x0 - 0.02; continue; }
      if (oldX >= r.x1) { x = r.x1 + 0.02; continue; }
      if (oldZ <= r.z0) { z = r.z0 - 0.02; continue; }
      if (oldZ >= r.z1) { z = r.z1 + 0.02; continue; }
      const d = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
      const m = Math.min(d[0], d[1], d[2], d[3]);
      if (m === d[0]) x = r.x0 - 0.02;
      else if (m === d[1]) x = r.x1 + 0.02;
      else if (m === d[2]) z = r.z0 - 0.02;
      else z = r.z1 + 0.02;
    }
    return { x: x, z: z };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene;
    store = o.store || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    shop = o.shop || null;
    life = o.life || null;
    isStore = o.isStore || isStore;
    getFloor = o.getFloor || getFloor;
    goFloor = o.goFloor || goFloor;
    if (!scene) return null;

    load();

    root = new THREE.Group();
    root.name = 'loft-m25';
    if (store && store.root) store.root.add(root);
    else scene.add(root);

    buildFloor();
    buildShell();
    buildHoleRail();
    buildLadder();
    buildBed();
    buildNuker();
    buildFan();
    buildComic();
    buildClock();
    buildStorage();
    buildRug();
    buildDecor();
    buildLights();
    buildCrates();

    // 床上的小D
    try {
      if (XD.Workspace && XD.Workspace.miniOrca) {
        const m = XD.Workspace.miniOrca(0.34);
        m.position.set(X0 + 2.85, FY + 0.60, Z0 + 1.30);
        m.rotation.y = Math.PI * 0.5;
        m.rotation.z = 0.12;
        m.visible = false;
        root.add(m);
        frames.orca = m;
        frames.orcaBase = FY + 0.60;
      }
    } catch (e) { /* 没 miniOrca 也不影响二楼 */ }

    refreshCrates();
    if (st.nuk === 'hot' && frames.nukLamp) frames.nukLamp.color.copy(col(0x9fe0b4));

    // 漫画面板的事件
    const comicEl = document.getElementById('comic');
    if (comicEl) {
      comicEl.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'comicClose') { hideComic(); return; }
        nextComic();
      });
    }

    register();

    return {
      root: root,
      update: update,
      clamp: clamp2f,
      FY: FY,
      spawn2f: { x: X0 + 2.35, y: FY + 1.62, z: 3.10, yaw: 0 },
      spawn1f: { x: X0 + 2.05, y: 1.62, z: 3.10, yaw: 0 },
      showComic: showComic,
      hideComic: hideComic,
      nextComic: nextComic,
      takeCrate: takeCrate,
      reset: function () {
        st = { crates: 0, crateAt: 0, nuk: 'idle', nukT: 0, fan: false, sit: false };
        save();
        refreshCrates();
        if (frames.orca) frames.orca.visible = false;
      },
      debug: function () {
        return {
          crates: st.crates, nuk: st.nuk,
          left: st.nuk === 'heating' ? Math.max(0, Math.round(NUK - st.nukT)) : 0,
          fan: st.fan, sit: st.sit, comic: !!(comicEl && comicEl.classList.contains('show'))
        };
      }
    };
  }

  return { build: build };
})();
