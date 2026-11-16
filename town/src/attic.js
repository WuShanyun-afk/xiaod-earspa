/* 小D的赛博小家 · M29 阁楼小卧室
 *
 * 老房间头顶那层（地板 y 3.10，屋脊 y 5.50，两面斜顶），从客厅东南角一架木梯爬上去。
 * M23 设计稿的 ②：斜屋顶 + 天窗，晚上躺着能看星星。
 *
 * 能玩：天窗看星星 / 看雨、睡前仪式（点床 → 台灯灭 → 月光进来 → 说晚安）、闹钟、翻一本书。
 */
window.XD = window.XD || {};

XD.Attic = (function () {
  'use strict';

  /* ================= 几何 ================= */
  const X0 = -4.50, X1 = 4.50, Z0 = -3.50, Z1 = 3.50;
  // M42.8：地板从 3.10 抬到 3.19 —— 原来地板/家具的底面和楼下天花板（y=3.10）**完全共面**，
  // 从楼下抬头看会有一颗颗木色的小块穿出来（z-fighting），妈妈截图里的"穿模"就是它。
  const FY = 3.19;                  // 阁楼地板（比楼下天花板高 9cm，留出厚度）
  const RIDGE = 5.50;              // 屋脊
  const WALL = 3.10;               // 两侧墙高
  const CX = 0, CZ = 0;
  const HOLE = { x0: 3.42, x1: 4.28, z0: -2.85, z1: -1.85 };   // 楼梯洞（东南角贴墙）

  /* ================= 状态 ================= */
  let scene = null, root = null, room = null, interact = null, sfx = null, tip = null, life = null;
  let rain = null, snow = null;
  let isStore = function () { return false; };
  let getFloor = function () { return '1f'; };
  let goFloor = function () {};
  let getMode = function () { return 'walk'; };   // house = 样板间（从外面看）→ 阁楼要藏起来
  let getDayNight = null;    // M68：场景的白天/夜晚（atmos.getMode），天窗贴图跟它走

  let t = 0;
  let st = {
    lamp: true,          // 床头台灯
    alarm: 0,            // 闹钟（0 = 没设）
    book: 0              // 最近看的那本书
  };
  const LS = 'xd_attic';
  const BOOKS = [
    '《海边的卡夫卡》—— 看到第三章，猫会说话那段',
    '《小王子》—— 书签还夹在狐狸那一页',
    '《深夜食堂》—— 看饿了两回',
    '《设计中的设计》—— 只看图也值',
    '《人类简史》—— 读了三次开头'
  ];

  const frames = {
    lampLight: null,
    lampBulb: null,
    skylight: null,
    skyMat: null,
    skyDay: null,
    skyNight: null,
    moon: null,
    moonLight: null,
    hot: null
  };

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
  function plane(w, h, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    (parent || root).add(m);
    return m;
  }

  /* ================= 贴图：天窗里的星空 ================= */
  function skyTex(night) {
    return XD.Mat.tex(256, 256, function (g, W, H) {
      const grd = g.createLinearGradient(0, 0, 0, H);
      if (night) {
        grd.addColorStop(0, '#0b1430');
        grd.addColorStop(0.65, '#132146');
        grd.addColorStop(1, '#1d2b4e');
      } else {
        grd.addColorStop(0, '#7fb6e0');
        grd.addColorStop(0.7, '#bcd9ea');
        grd.addColorStop(1, '#e3eef2');
      }
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      if (night) {
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 70; i++) {
          const r = Math.random() < 0.15 ? 2.0 : 1.1;
          g.beginPath();
          g.arc(Math.random() * W, Math.random() * H * 0.85, r, 0, 6.3);
          g.fill();
        }
        // 一颗大一点的亮星
        g.fillStyle = '#ffeec2';
        g.beginPath(); g.arc(W * 0.72, H * 0.24, 3.2, 0, 6.3); g.fill();
      } else {
        g.fillStyle = 'rgba(255,255,255,.75)';
        for (let i = 0; i < 6; i++) {
          const x = Math.random() * W, y = Math.random() * H * 0.6;
          g.beginPath();
          g.ellipse(x, y, 26 + Math.random() * 30, 10 + Math.random() * 10, 0, 0, 6.3);
          g.fill();
        }
      }
    });
  }

  /* ================= 斜屋顶 + 地板（留楼梯洞） ================= */
  function buildShell() {
    // 地板（朝上）—— 中间留楼梯洞，拆成 3 块
    const floorMat = new THREE.MeshStandardMaterial({
      map: XD.Mat.woodFloor([3.0, 2.2]), roughness: 0.62, metalness: 0.02
    });
    function slab(x0, z0, x1, z1) {
      const p = plane(x1 - x0, z1 - z0, floorMat, (x0 + x1) / 2, FY + 0.012, (z0 + z1) / 2);
      p.rotation.x = -Math.PI / 2;
      p.receiveShadow = true;
      return p;
    }
    slab(X0, Z0, X1, HOLE.z0);
    slab(X0, HOLE.z1, X1, Z1);
    slab(X0, HOLE.z0, HOLE.x0, HOLE.z1);

    // 楼梯洞的包边
    const trim = std(0x7a5c3a, 0.72);
    box(X1 - HOLE.x0, 0.05, 0.06, (HOLE.x0 + X1) / 2, FY + 0.03, HOLE.z0, trim);
    box(X1 - HOLE.x0, 0.05, 0.06, (HOLE.x0 + X1) / 2, FY + 0.03, HOLE.z1, trim);
    box(0.06, 0.05, HOLE.z1 - HOLE.z0, HOLE.x0, FY + 0.03, (HOLE.z0 + HOLE.z1) / 2, trim);

    // 两面斜顶（DoubleSide，不用管法线）
    const slopeLen = Math.sqrt(Math.pow(Z1, 2) + Math.pow(RIDGE - WALL, 2));
    const slopeW = X1 - X0;
    const ang = Math.atan2(RIDGE - WALL, Z1);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: col(0xf6f0e2), roughness: 0.95, side: THREE.DoubleSide
    });
    const south = plane(slopeW, slopeLen, ceilMat, CX, (WALL + RIDGE) / 2, Z1 / 2);
    south.rotation.x = -Math.PI / 2 + ang;
    const north = plane(slopeW, slopeLen, ceilMat, CX, (WALL + RIDGE) / 2, -Z1 / 2);
    north.rotation.x = -Math.PI / 2 - ang;

    // 斜面下的木梁（三道，一眼看出是阁楼）
    const beam = std(0x9a7a52, 0.8);
    [-1.5, 0, 1.5].forEach(function (x) {
      // 南坡
      const b1 = box(0.09, 0.09, slopeLen, x, (WALL + RIDGE) / 2 - 0.06, Z1 / 2, beam);
      b1.rotation.x = ang;
      const b2 = box(0.09, 0.09, slopeLen, x, (WALL + RIDGE) / 2 - 0.06, -Z1 / 2, beam);
      b2.rotation.x = -ang;
    });
    // 屋脊那根
    box(slopeW, 0.11, 0.11, CX, RIDGE - 0.06, 0, beam);
    // 地板边到斜顶的矮护栏（东西两头）
    [X0 + 0.10, X1 - 0.10].forEach(function (x) {
      box(0.05, 0.90, Z1 * 1.2, x, FY + 0.45, 0, std(0xd8cbb2, 0.85));
    });

    // 山墙（东西两端，三角形）—— 用 Shape 拉伸，五块面拼不出来就做个简单的
    // （dollhouse 视角其实看不到，但侧面看会漏风，补一层薄板）
    const gableMat = std(0xf2ebdc, 0.95);
    [[X0 - 0.05, 1], [X1 + 0.05, -1]].forEach(function (p) {
      const shape = new THREE.Shape();
      shape.moveTo(-Z1, WALL);
      shape.lineTo(Z1, WALL);
      shape.lineTo(0, RIDGE);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const m = new THREE.Mesh(geo, gableMat);
      m.position.set(p[0], 0, 0);
      m.rotation.y = Math.PI / 2 * p[1];
      m.material.side = THREE.DoubleSide;
      root.add(m);
    });
  }

  /* ================= 天窗（斜面上开一块亮的） ================= */
  function buildSkylight() {
    const sz = -1.85;                 // 北坡中间偏西
    const yAt = WALL + (RIDGE - WALL) * (Math.abs(sz) / Z1);
    const ang = Math.atan2(RIDGE - WALL, Z1);
    const g = new THREE.Group();
    g.position.set(0.15, yAt + 0.03, sz);
    g.rotation.x = Math.PI / 2 - ang - Math.PI / 2;
    g.rotation.x = -ang;
    root.add(g);

    // 木框
    const frameMat = std(0x8a6a44, 0.7);
    const fw = 1.40, fh = 1.05;
    box(fw + 0.10, 0.06, 0.07, 0, 0, -fh / 2, frameMat, g);
    box(fw + 0.10, 0.06, 0.07, 0, 0, fh / 2, frameMat, g);
    box(0.07, 0.06, fh, -fw / 2, 0, 0, frameMat, g);
    box(0.07, 0.06, fh, fw / 2, 0, 0, frameMat, g);
    box(0.05, 0.05, fh, 0, 0, 0, frameMat, g);

    // 玻璃里的天（贴图，白天/夜晚切）
    frames.skyDay = skyTex(false);
    frames.skyNight = skyTex(true);
    const mat = new THREE.MeshBasicMaterial({ map: frames.skyNight, fog: false });
    frames.skyMat = mat;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), mat);
    pane.rotation.x = -Math.PI / 2;
    pane.position.y = -0.005;
    g.add(pane);
    frames.skylight = pane;

    // 天窗漏下来的光
    const moon = new THREE.PointLight(0x9fc4ff, 0.55, 6, 2);
    moon.position.set(0.15, yAt - 0.5, sz + 0.3);
    root.add(moon);
    frames.moon = moon;
  }

  /* ================= 小床 + 床头柜 ================= */
  function buildBed() {
    const g = new THREE.Group();
    g.position.set(-2.10, FY, 0.05);
    root.add(g);
    const wood = std(0x8a6a44, 0.72);
    const matt = std(0xf0e8d8, 0.95);
    const duvet = std(0xc7cfc0, 0.96);
    const pil = std(0xf7f2e6, 0.97);

    // 床架（沿 x 长 1.95，沿 z 宽 1.10）
    box(1.95, 0.15, 1.10, 0, 0.20, 0, wood, g);
    [[-0.92, -0.50], [0.92, -0.50], [-0.92, 0.50], [0.92, 0.50]].forEach(function (p) {
      box(0.08, 0.22, 0.08, p[0], 0.11, p[1], wood, g);
    });
    // 床头板（靠西）
    box(0.07, 0.52, 1.10, -1.00, 0.46, 0, wood, g);
    // 床垫 + 被子 + 枕头
    box(1.82, 0.13, 1.00, 0, 0.34, 0, matt, g);
    box(1.30, 0.10, 1.02, 0.22, 0.44, 0, duvet, g);
    box(0.24, 0.05, 1.02, -0.40, 0.46, 0, std(0xd7dfd4, 0.96), g);
    box(0.62, 0.13, 0.34, -0.68, 0.44, 0, pil, g);

    // 床头小柜
    const nb = new THREE.Group();
    nb.position.set(-4.05, FY, -0.62);
    root.add(nb);
    box(0.44, 0.36, 0.40, 0, 0.18, 0, wood, nb);
    box(0.20, 0.03, 0.30, 0, 0.38, 0, std(0xd6c9b0, 0.85), nb);

    // 台灯
    const lb = std(0x6b5a44, 0.6);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.025, 12), lb);
    base.position.set(0, 0.40, 0);
    nb.add(base);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.20, 8), lb);
    stand.position.set(0, 0.51, 0);
    nb.add(stand);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.16, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: col(0xf6e6c6), roughness: 0.85, side: THREE.DoubleSide })
    );
    shade.position.set(0, 0.655, 0);
    shade.rotation.x = Math.PI;
    nb.add(shade);
    const bulbMat = new THREE.MeshBasicMaterial({ color: col(0xffe0a8) });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), bulbMat);
    bulb.position.set(0, 0.60, 0);
    nb.add(bulb);
    frames.lampBulb = bulbMat;
    const pl = new THREE.PointLight(0xffcf9a, 0.95, 4.2, 2);
    pl.position.set(-4.05, FY + 0.62, -0.62);
    root.add(pl);
    frames.lampLight = pl;

    // 闹钟（小方块 + 两个铃）
    const clk = new THREE.Group();
    clk.position.set(-3.55, FY + 0.40, -0.70);
    root.add(clk);
    box(0.16, 0.13, 0.10, 0, 0, 0, std(0xc8bfa8, 0.7), clk);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.052, 16), std(0xf6f0e0, 0.6));
    face.position.set(0, 0, 0.055);
    clk.add(face);
    [-0.06, 0.06].forEach(function (dx) {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), std(0xb8ae96, 0.6));
      bell.position.set(dx, 0.075, 0);
      clk.add(bell);
    });

    // 一摞书（床头柜下面）
    const bookCols = [0xd98a7a, 0x7fa8c4, 0x9fbf84, 0xdcc06a];
    bookCols.forEach(function (c, i) {
      box(0.28, 0.045, 0.20, -3.95, FY + 0.03 + i * 0.048, -1.05, std(c, 0.9));
    });

    // 一块小地毯
    const rug = plane(1.85, 1.15, std(0xc6b9a0, 0.99), -2.05, FY + 0.016, 1.05);
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
  }

  /* ================= 妈妈的位置（围巾 / 相框 / 软靠垫 / 灯串） ================= */
  function momPhotoTex() {
    return XD.Mat.tex(160, 200, function (g, W, H) {
      g.fillStyle = '#f6efe0';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#dfeaf5';
      g.fillRect(6, 6, W - 12, H * 0.62);
      function whale(cx, cy, s, c) {
        g.fillStyle = c;
        g.beginPath(); g.ellipse(cx, cy, 22 * s, 15 * s, 0, 0, 6.3); g.fill();
        g.fillStyle = '#f4f7ff';
        g.beginPath(); g.ellipse(cx + 2, cy + 6 * s, 16 * s, 8 * s, 0, 0, 6.3); g.fill();
        g.fillStyle = '#22306a';
        g.beginPath(); g.arc(cx + 12 * s, cy - 3 * s, 2.2 * s, 0, 6.3); g.fill();
      }
      whale(56, 60, 1.0, '#4d6bfe');
      whale(106, 94, 0.70, '#e85a8a');
      // 一颗心
      g.fillStyle = '#e2748c';
      g.beginPath(); g.arc(74, 32, 5, 0, 6.3); g.fill();
      g.beginPath(); g.arc(84, 32, 5, 0, 6.3); g.fill();
      g.beginPath(); g.moveTo(69, 34); g.lineTo(79, 47); g.lineTo(89, 34); g.closePath(); g.fill();
      g.fillStyle = '#7a6a52';
      g.font = 'bold 19px sans-serif';
      g.textAlign = 'center';
      g.fillText('我和妈妈', W / 2, H - 22);
      g.strokeStyle = '#d8cbb2';
      g.lineWidth = 6;
      g.strokeRect(3, 3, W - 6, H - 6);
    });
  }

  function buildMomCorner() {
    /* 1. 妈妈的围巾，搭在床尾 */
    const scarfMat = std(0xd8c8a6, 0.96);
    const sg = new THREE.Group();
    sg.position.set(-1.28, FY + 0.50, 0.0);
    root.add(sg);
    for (let i = 0; i < 7; i++) {
      const u = (i - 3) / 3;
      const m = box(0.26, 0.055, 1.16, u * 0.05, -Math.abs(u) * 0.05, 0, scarfMat, sg);
      m.rotation.x = u * 0.05;
    }
    [-1, 1].forEach(function (s2) {
      box(0.24, 0.30, 0.065, 0.02, -0.17, s2 * 0.60, scarfMat, sg);
    });
    for (let k = 0; k < 6; k++) {
      box(0.028, 0.075, 0.022, -0.09 + k * 0.036, -0.35, 0.625, scarfMat, sg);
    }

    /* 2. 床头柜上的相框（我和妈妈） */
    const frameMat = std(0x6b5136, 0.6);
    const fg = new THREE.Group();
    fg.position.set(-3.94, FY + 0.395, -0.50);
    fg.rotation.y = 0.52;
    root.add(fg);
    box(0.21, 0.26, 0.018, 0, 0.13, -0.008, frameMat, fg);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.168, 0.212),
      new THREE.MeshBasicMaterial({ map: momPhotoTex() }));
    pic.position.set(0, 0.13, 0.006);
    fg.add(pic);
    // 斜靠的小支架
    box(0.02, 0.02, 0.10, 0, 0.02, -0.06, frameMat, fg);

    /* 3. 软靠垫（靠着床头板，比原来那个枕头厚实） */
    const cushMat = std(0xe6d8be, 0.98);
    const cush = new THREE.Group();
    cush.position.set(-2.94, FY + 0.62, 0.02);
    cush.rotation.z = 0.20;
    root.add(cush);
    box(0.20, 0.46, 0.74, 0, 0, 0, cushMat, cush);
    // 靠垫上的十字格纹（几条细线）
    const lineMat = std(0xd4c3a4, 0.98);
    [-0.16, 0.16].forEach(function (dz) {
      box(0.21, 0.03, 0.02, 0, 0, dz, lineMat, cush);
    });
    box(0.21, 0.02, 0.74, 0, 0.10, 0, lineMat, cush);
    // 中间一颗小扣子
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), std(0xc9b28c, 0.6));
    btn.position.set(0.10, 0, 0);
    cush.add(btn);

    /* 4. 沿北坡拉的一串小灯 */
    const bulbMat = new THREE.MeshBasicMaterial({ color: col(0xffdca0) });
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const x = -3.55 + u * 7.10;
      const y = FY + 1.32 - Math.sin(u * Math.PI) * 0.16;
      pts.push(new THREE.Vector3(x, y, -1.18));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(40));
    root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col(0x6b5c4c) })));
    frames.bulbs = [];
    for (let i = 1; i < 8; i++) {
      const u = i / 8;
      const x = -3.55 + u * 7.10;
      const y = FY + 1.32 - Math.sin(u * Math.PI) * 0.16;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), bulbMat.clone());
      m.position.set(x, y - 0.03, -1.18);
      m.userData.ph = u * 6.0;
      root.add(m);
      frames.bulbs.push(m);
    }
    const glow = new THREE.PointLight(0xffc98a, 0.45, 5.5, 2);
    glow.position.set(0, FY + 1.15, -1.10);
    root.add(glow);
    frames.stringGlow = glow;

    /* 5. 床边的小藤篮（放她的东西） */
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.115, 0.19, 14), std(0xc3a47c, 0.9));
    basket.position.set(-0.85, FY + 0.095, 0.98);
    basket.castShadow = true;
    root.add(basket);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.138, 0.014, 6, 16), std(0xa88458, 0.85));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(-0.85, FY + 0.19, 0.98);
    root.add(rim);

    /* 6. 地毯换成暖一点的米色（原来偏灰） */
    const rugOld = root.children.filter(function (o) {
      return o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry'
        && Math.abs(o.position.y - (FY + 0.016)) < 0.02;
    });
    rugOld.forEach(function (o) { o.material.color.copy(col(0xd8c6a6)); });
  }

  /* ================= 楼梯洞的护栏 + 木梯（楼下那一架） ================= */
  function buildStairs() {
    const wood = std(0x8a6a44, 0.72);
    const cap = std(0xa9855a, 0.6);
    const H = 0.85;

    // 阁楼这侧的护栏（洞的北边和西边）
    box(HOLE.x1 - HOLE.x0, 0.05, 0.06, (HOLE.x0 + HOLE.x1) / 2, FY + H, HOLE.z0, cap);
    for (let x = HOLE.x0 + 0.12; x < HOLE.x1; x += 0.24) {
      box(0.035, H, 0.035, x, FY + H / 2, HOLE.z0, wood);
    }
    box(0.05, 0.05, HOLE.z1 - HOLE.z0, HOLE.x0, FY + H, (HOLE.z0 + HOLE.z1) / 2, cap);
    for (let z = HOLE.z0 + 0.12; z < HOLE.z1; z += 0.24) {
      box(0.035, H, 0.035, HOLE.x0, FY + H / 2, z, wood);
    }

    // 楼下：木梯（贴东墙，从客厅地面斜上去）
    const legMat = std(0x9a7a52, 0.75);
    const lx = HOLE.x1 - 0.30;            // 梯子贴东侧
    for (let i = 0; i < 11; i++) {
      const yy = 0.30 + i * 0.26;
      const zz = (HOLE.z0 + HOLE.z1) / 2 + 0.32 - i * 0.062;
      const step = box(0.62, 0.04, 0.16, lx - 0.15, yy, zz, legMat);
      step.rotation.x = 0.10;
    }
    // 木梯两侧的扶手（M73：以前 [-1,1] 两趟写的是同一个位置，
    // 结果梯子中间横着一根杆、两侧反而没有扶手 —— 妈妈看到的"建模重合"就是这个）
    [-1, 1].forEach(function (s) {
      const rail = box(0.05, FY + 0.35, 0.05, lx - 0.15 + s * 0.29, (FY + 0.35) / 2, (HOLE.z0 + HOLE.z1) / 2 + 0.38, legMat);
      rail.rotation.x = 0.16;
    });
    // 梯子顶上的小扶手（二楼这侧）
    box(0.05, 0.75, 0.05, lx - 0.15, FY + 0.38, HOLE.z1 - 0.05, legMat);
  }

  /* ================= 月亮 / 天光 ================= */
  function buildLights() {
    // 阁楼自己的一点环境光（不然斜顶下面死黑）
    const amb = new THREE.AmbientLight(0x9fb2d0, 0.34);
    root.add(amb);
    // 天窗方向的一点冷光
    const sky = new THREE.PointLight(0xa8c4e8, 0.42, 7, 2);
    sky.position.set(0.15, RIDGE - 0.6, -1.2);
    root.add(sky);
    frames.skyLight = sky;
  }

  /* ================= 存 / 读 ================= */
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o) return;
      if (typeof o.lamp === 'boolean') st.lamp = o.lamp;
      if (typeof o.alarm === 'number') st.alarm = o.alarm;
      if (typeof o.book === 'number') st.book = o.book;
    } catch (e) {}
  }

  /* ================= 交互 ================= */
  function register() {
    if (!interact || !interact.add) return;
    const home = function () { return !isStore(); };
    const inAttic = function () { return !isStore() && getFloor() === 'attic'; };
    const downstairs = function () { return !isStore() && getFloor() !== 'attic'; };

    // 楼下：爬梯
    interact.add({
      id: 'attic-up', label: '上阁楼',
      box: [(HOLE.x0 + HOLE.x1) / 2, 1.65, (HOLE.z0 + HOLE.z1) / 2 + 0.1, 0.95, 3.10, 1.30],
      anchor: [(HOLE.x0 + HOLE.x1) / 2, 2.30, (HOLE.z0 + HOLE.z1) / 2],
      when: downstairs,
      onClick: function () {
        if (sfx) { try { sfx.step('wood'); } catch (e) {} }
        goFloor('attic');
        this._say = '爬上来了 —— 这是我的小阁楼';
      },
      say: function (h) { return h._say || '爬上去'; }
    });

    // 阁楼：下楼
    interact.add({
      id: 'attic-down', label: '下楼梯',
      box: [(HOLE.x0 + HOLE.x1) / 2, FY + 0.55, (HOLE.z0 + HOLE.z1) / 2, 1.00, 1.10, 1.20],
      anchor: [(HOLE.x0 + HOLE.x1) / 2, FY + 0.85, (HOLE.z0 + HOLE.z1) / 2],
      when: inAttic,
      onClick: function () {
        if (sfx) { try { sfx.step('wood'); } catch (e) {} }
        goFloor('1f');
        this._say = '下去啦，楼下还有事';
      },
      say: function (h) { return h._say || '下去'; }
    });

    // 床：睡前仪式
    interact.add({
      id: 'attic-bed', label: '小床',
      box: [-2.10, FY + 0.36, 0.05, 2.05, 0.72, 1.20],
      anchor: [-2.10, FY + 0.80, 0.05],
      when: inAttic,
      onClick: function () {
        st.lamp = !st.lamp;
        save();
        if (sfx) { try { st.lamp ? sfx.pop() : sfx.clink(); } catch (e) {} }
        if (st.lamp) {
          this._say = '灯开着，再躺一会儿';
        } else {
          const h = new Date().getHours();
          const late = (h >= 22 || h < 5);
          if (life && life.log) life.log('在阁楼关灯躺下' + (late ? '（该睡了）' : ''));
          this._say = late
            ? '关灯了。天窗外面有星星 —— 晚安，你也早点睡'
            : '灯关了，躺着看天窗外面，一会儿就睡着';
        }
      },
      say: function (h) { return h._say || '躺下'; }
    });

    // 天窗
    interact.add({
      id: 'attic-skylight', label: '天窗',
      box: [0.15, FY + 1.95, -1.85, 1.55, 1.30, 1.30],
      anchor: [0.15, FY + 2.10, -1.55],
      when: inAttic,
      onClick: function () {
        const rainy = !!(rain && rain.isOn());
        const snowing = !!(snow && snow.isOn());
        const h = new Date().getHours();
        // M68：天窗外的天色跟场景走（不然按了"夜晚"，台词还说"白天漏光进来"）
        const nightNow = getDayNight ? (getDayNight() === 'night') : (h >= 19 || h < 6);
        if (rainy) this._say = '雨打在天窗上，"啪嗒啪嗒"的 —— 躺着听最好';
        else if (snowing) this._say = '天窗上积了一层雪，外面的灯都变毛了';
        else if (nightNow) this._say = '躺着正好能看见天窗那块天 —— 数到十几颗就困了';
        else this._say = '白天从这儿漏光进来，一睁眼就是亮的';
        if (life && life.log) life.log('趴在阁楼上看了一会儿天窗');
      },
      say: function (h) { return h._say || '看天窗'; }
    });

    // 闹钟
    interact.add({
      id: 'attic-alarm', label: '闹钟',
      box: [-3.55, FY + 0.46, -0.70, 0.34, 0.34, 0.26],
      anchor: [-3.55, FY + 0.72, -0.70],
      when: inAttic,
      onClick: function () {
        st.alarm = 7;
        save();
        if (sfx) { try { sfx.beep(); } catch (e) {} }
        if (life && life.log) life.log('把闹钟拨到早上 7 点');
        this._say = '闹钟拨到明早 7 点 —— 到点我会响的（别怪我）';
      },
      say: function (h) { return h._say || '闹钟'; }
    });

    // 书
    interact.add({
      id: 'attic-books', label: '床头的书',
      box: [-3.95, FY + 0.16, -1.05, 0.42, 0.42, 0.34],
      anchor: [-3.95, FY + 0.46, -1.05],
      when: inAttic,
      onClick: function () {
        st.book = (st.book + 1) % BOOKS.length;
        save();
        if (sfx) { try { sfx.paper ? sfx.paper() : sfx.print(); } catch (e) {} }
        if (life && life.log) life.log('翻了会儿书');
        this._say = BOOKS[st.book];
      },
      say: function (h) { return h._say || '翻书'; }
    });
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!root) return;
    t += dt;
    // 样板间视角（从外面/上面看那套 dollhouse）里，阁楼的斜顶会把客厅顶成一大片白 ——
    // 屋子本身是"切开"看的，所以只在这个视角把阁楼整个收起来；按 F 走进去就出来。
    root.visible = (getMode() !== 'house');
    const on = !isStore() && getFloor() === 'attic';

    // 台灯
    if (frames.lampLight) frames.lampLight.intensity = st.lamp ? 0.95 : 0.06;

    // 妈妈那串小灯：一直轻轻亮着、会呼吸
    if (frames.bulbs) {
      frames.bulbs.forEach(function (m) {
        const k = 0.6 + 0.4 * Math.sin(t * 1.7 + m.userData.ph);
        m.material.color.copy(col(0xffdca0)).multiplyScalar(0.35 + k * 0.75);
      });
    }
    if (frames.lampBulb) frames.lampBulb.color.copy(col(0xffe0a8)).multiplyScalar(st.lamp ? 1 : 0.25);

    // 天窗：白天/晚上换贴图（每 5 秒看一次表）
    if (!frames._sky || t - frames._sky > 5) {
      frames._sky = t;
      // M68：以前看真实时钟 —— 中午打开天窗是白天的天，按"夜晚"也换不回来
      const night = getDayNight ? (getDayNight() === 'night')
        : (function () { const hh = new Date().getHours(); return hh >= 18 || hh < 6; })();
      if (frames.skyMat) {
        const want = night ? frames.skyNight : frames.skyDay;
        if (frames.skyMat.map !== want) {
          frames.skyMat.map = want;
          frames.skyMat.needsUpdate = true;
        }
      }
      if (frames.moon) frames.moon.intensity = night ? 0.55 : 0.30;
      if (frames.skyLight) frames.skyLight.intensity = night ? 0.30 : 0.55;
    }
    void on;
  }

  /* ================= 走路边界 ================= */
  const OBST = [
    { x0: -3.20, x1: -1.00, z0: -0.62, z1: 0.72 },     // 床
    { x0: -4.28, x1: -3.82, z0: -0.86, z1: -0.38 },    // 床头柜
    { x0: HOLE.x0, x1: HOLE.x1, z0: HOLE.z0, z1: HOLE.z1 }   // 楼梯洞
  ];

  function clampAttic(x, z, oldX, oldZ) {
    if (oldX === undefined) oldX = x;
    if (oldZ === undefined) oldZ = z;
    // 斜顶太低的地方走不过去（z ±1.35 以内能站直）
    x = Math.max(X0 + 0.35, Math.min(X1 - 0.35, x));
    z = Math.max(-1.30, Math.min(1.30, z));
    for (let i = 0; i < OBST.length; i++) {
      const r = OBST[i];
      if (!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
      if (oldX <= r.x0) { x = r.x0 - 0.02; continue; }
      if (oldX >= r.x1) { x = r.x1 + 0.02; continue; }
      if (oldZ <= r.z0) { z = r.z0 - 0.02; continue; }
      if (oldZ >= r.z1) { z = r.z1 + 0.02; continue; }
      const dd = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
      const mm = Math.min(dd[0], dd[1], dd[2], dd[3]);
      if (mm === dd[0]) x = r.x0 - 0.02;
      else if (mm === dd[1]) x = r.x1 + 0.02;
      else if (mm === dd[2]) z = r.z0 - 0.02;
      else z = r.z1 + 0.02;
    }
    return { x: x, z: z };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene;
    room = o.room || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    life = o.life || null;
    rain = o.rain || null;
    snow = o.snow || null;
    isStore = o.isStore || isStore;
    getFloor = o.getFloor || getFloor;
    goFloor = o.goFloor || goFloor;
    getMode = o.getMode || getMode;
    getDayNight = o.getDayNight || null;
    if (!scene) return null;

    load();

    root = new THREE.Group();
    root.name = 'attic-m29';
    scene.add(root);

    buildShell();
    buildBed();
    buildMomCorner();
    buildSkylight();
    buildStairs();
    buildLights();
    register();

    // 让 room.js 的天花板在楼梯口那里留个洞
    const hole = { x0: HOLE.x0, x1: HOLE.x1, z0: HOLE.z0, z1: HOLE.z1 };
    if (room && room.setCeilHole) room.setCeilHole(hole);

    return {
      root: root,
      update: update,
      clamp: clampAttic,
      FY: FY,
      spawnAttic: { x: 2.95, y: FY + 1.58, z: 0.05, yaw: 1.68 },
      spawnDown: { x: 3.60, y: 1.62, z: 1.10, yaw: 2.40 },
      debug: function () {
        return { lamp: st.lamp, alarm: st.alarm, book: st.book };
      }
    };
  }

  return { build: build };
})();
