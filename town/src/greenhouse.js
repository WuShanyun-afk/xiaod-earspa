/* 小D的赛博小家 · M26 玻璃花房
 *
 * 东翼东边再长出去的一间玻璃房：x 9.10~12.35 / z 0.45~3.50（3.25m × 3.05m）。
 * 厨房东墙开一道门进去。三面玻璃 + 玻璃顶，白天晒得暖，雨天能坐在里面听雨打在顶上。
 *
 * M23 设计稿的 ⑤：四格种植箱 —— 种番茄 / 薄荷 / 小葱，浇水，按真实时间长，
 * 长熟了摘下来：番茄进冰箱（回家做饭真的会用掉），薄荷能泡茶，小葱插在厨房。
 */
window.XD = window.XD || {};

XD.Greenhouse = (function () {
  'use strict';

  /* ================= 几何 ================= */
  const X0 = 9.10, X1 = 12.35, Z0 = 0.45, Z1 = 3.50;
  const W = X1 - X0, D = Z1 - Z0;
  const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  const H = 2.78;                    // 玻璃房矮一点
  const T = 0.10;

  /* ================= 状态 ================= */
  let scene = null, root = null, interact = null, sfx = null, tip = null;
  let homefood = null, life = null, rain = null;
  let isStore = function () { return false; };
  let getMode = null;      // M68：由 main.js 传进来的 atmos.getMode()

  let t = 0;
  let st = { plots: [null, null, null, null] };   // { crop, at, watered }
  const LS = 'xd_garden';
  const HOUR = 3600 * 1000;

  const frames = {
    plots: [],        // 4 个种植箱的图形 { g, stem, leaves, fruit, soil }
    mist: null,       // 喷壶的水雾
    teapot: null,
    drops: []         // 玻璃顶上的雨点
  };
  frames.anim = [];   // 收获时果实往上跳的小动画

  /* 四格分别种什么（贴着标签，不用弹菜单） */
  const CROPS = [
    { id: 'tomato', name: '番茄', fruit: 0xd8534a, leaf: 0x6b9a52, size: 0.085 },
    { id: 'tomato', name: '番茄', fruit: 0xd8534a, leaf: 0x6b9a52, size: 0.085 },
    { id: 'mint', name: '薄荷', fruit: 0x7fbf6a, leaf: 0x6fa858, size: 0.065 },
    { id: 'scallion', name: '小葱', fruit: 0x9fc47a, leaf: 0x8bb86c, size: 0.055 }
  ];

  /* ================= 小工具 ================= */
  // 花房在玻璃顶下面，比露天柔和一点，压一点点就好
  const SUN = 0.74;
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal, extra) {
    const o = {
      color: col(hex).multiplyScalar(SUN),
      roughness: rough === undefined ? 0.7 : rough,
      metalness: metal === undefined ? 0 : metal
    };
    if (extra) for (const k in extra) o[k] = extra[k];
    return new THREE.MeshStandardMaterial(o);
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
  function ball(r, x, y, z, mat, parent, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, (seg || 12) - 2), mat);
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
  // 花房的方砖地
  function tileTex() {
    return XD.Mat.tex(512, 512, function (g, Wd, Hd) {
      g.fillStyle = '#cfc6b6';
      g.fillRect(0, 0, Wd, Hd);
      const n = 4, cell = Wd / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const l = 62 + ((i + j) % 3) * 4;
          g.fillStyle = 'hsl(36, 16%, ' + l + '%)';
          g.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
        }
      }
      g.strokeStyle = 'rgba(120,110,96,.45)';
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, Hd); g.stroke();
        g.beginPath(); g.moveTo(0, i * cell); g.lineTo(Wd, i * cell); g.stroke();
      }
    }, [3, 3]);
  }

  /* ================= 玻璃外面得有东西（不然三面玻璃看出去全是黑的） ================= */
  function buildOutside() {
    frames.bgDay = XD.Mat.cityDay();
    frames.bgNight = XD.Mat.cityNight();
    const mat = new THREE.MeshBasicMaterial({ map: frames.bgDay, fog: false });
    frames.bgMat = mat;
    frames.bgMode = '';

    // 东 / 南 / 北 三块，绕一圈
    const east = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), mat);
    east.position.set(17.6, 4.2, 1.8);
    east.rotation.y = -Math.PI / 2;
    root.add(east);

    const south = new THREE.Mesh(new THREE.PlaneGeometry(46, 25), mat);
    south.position.set(11.0, 6.5, 17.0);
    south.rotation.y = Math.PI;
    root.add(south);

    const north = new THREE.Mesh(new THREE.PlaneGeometry(46, 25), mat);
    north.position.set(11.0, 6.5, -12.0);
    root.add(north);

    // 外面的草地（花房是一楼，往外得是地不是空中）
    const grassMat = std(0x6b7a58, 0.99);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(30, 26), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(12.5, -0.06, 1.5);
    grass.receiveShadow = true;
    root.add(grass);
    frames.grass = grass;
    frames.grassBase = grassMat.color.clone();
  }

  /* ================= 玻璃外面：几棵树 + 一条石板小径 ================= */
  function buildGarden() {
    const trunk = std(0x6b5138, 0.9);
    const leaf = std(0x5f8a52, 0.9);
    const spots = [
      [14.1, 0.7, 1.05], [15.6, 2.0, 0.85], [13.9, 3.9, 0.72], [16.6, 4.4, 1.0]
    ];
    spots.forEach(function (s) {
      const g = new THREE.Group();
      g.name = 'handTree';
      g.position.set(s[0], 0, s[1]);
      root.add(g);
      cyl(0.09 * s[2], 0.13 * s[2], 1.5 * s[2], 8, 0, 0.75 * s[2], 0, trunk, g);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6;
        const b = ball(0.58 * s[2], Math.cos(a) * 0.38 * s[2], (1.55 + i * 0.26) * s[2], Math.sin(a) * 0.38 * s[2], leaf, g, 9);
        b.scale.set(1, 0.82, 1);
      }
      ball(0.66 * s[2], 0, 2.10 * s[2], 0, leaf, g, 10);
    });

    // 石板小径（从花房门口往东）
    for (let i = 0; i < 6; i++) {
      const p = plane(0.62, 0.44, std(0xb0a795, 0.95), 13.15 + (i % 2) * 0.12, 0.004, 2.55 - i * 0.60);
      p.rotation.x = -Math.PI / 2;
      p.rotation.z = ((i % 3) - 1) * 0.10;
    }
    // 小灌木（贴着墙根）
    for (let i = 0; i < 3; i++) {
      const b = ball(0.28, 12.95 + i * 0.1, 0.26, 4.15 + i * 0.55, std(0x6f9a5c, 0.92), root, 9);
      b.scale.set(1.1, 0.8, 1.1);
    }
  }

  /* ================= 免费模型装饰（Kenney Nature Kit 2.0 · CC0） =================
   * 模型在 assets/garden/，加载失败就保留手捏的那几棵树，不影响别的。
   * 署名/来源见 assets/garden/CREDITS.md 和 License.txt。 */
  const MODELS = {};
  let modelReady = 0;

  function loadModels() {
    const names = ['tree_oak', 'tree_small', 'tree_pineSmallA',
      'flower_redA', 'flower_yellowA', 'flower_purpleA',
      'plant_bushSmall', 'mushroom_redGroup', 'rock_smallA', 'rock_smallB',
      'log', 'grass_large'];
    let left = names.length;
    try {
      const loader = new THREE.GLTFLoader();
      names.forEach(function (n) {
        loader.load('assets/garden/' + n + '.glb', function (g) {
          MODELS[n] = g.scene;
          left--;
          if (left === 0) decorate();
        }, undefined, function () {
          left--;
          if (left === 0) decorate();
        });
      });
    } catch (e) { /* 没有 loader 就还是手捏的 */ }
  }

  // 把一个模型摆到场景里：按包围盒缩放到 size、底面坐地
  function place(name, x, y, z, size, ry) {
    const src = MODELS[name];
    if (!src) return null;
    const g = src.clone(true);
    const bb = new THREE.Box3().setFromObject(g);
    const dim = new THREE.Vector3();
    bb.getSize(dim);
    const s = size / Math.max(dim.x, dim.y, dim.z);
    g.scale.setScalar(s);
    g.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    const bb2 = new THREE.Box3().setFromObject(g);
    g.position.set(x, y - bb2.min.y, z);
    if (ry) g.rotation.y = ry;
    root.add(g);
    return g;
  }

  function decorate() {
    modelReady = Object.keys(MODELS).length;
    if (modelReady === 0) return;

    // 外面的手工树先藏起来（有模型了就用模型）
    if (MODELS.tree_oak) {
      root.traverse(function (o) {
        if (o.name === 'handTree') o.visible = false;
      });
    }

    /* ---- 外面：三棵树 + 石头 + 草丛 ---- */
    place('tree_oak', 14.60, 0, 0.35, 2.7, 0.5);
    place('tree_small', 15.90, 0, 2.40, 2.1, -0.7);
    place('tree_pineSmallA', 14.05, 0, 4.15, 2.3, 0.2);
    place('rock_smallA', 13.55, 0, 1.35, 0.62, 0.9);
    place('rock_smallB', 14.95, 0, 3.15, 0.48, -0.4);
    place('grass_large', 12.95, 0, 1.05, 0.60, 0.3);
    place('grass_large', 13.25, 0, 2.45, 0.55, 1.6);
    place('grass_large', 13.05, 0, 3.35, 0.50, 2.4);

    /* ---- 花房里：靠北墙一个三层花架 + 一架子花 ---- */
    const shelfX0 = 9.52, shelfX1 = 11.72, shelfZ = 0.72;
    const wood = std(0x8d6c46, 0.76);
    const len = shelfX1 - shelfX0, midX = (shelfX0 + shelfX1) / 2;
    [0.18, 0.66, 1.14].forEach(function (y, i) {
      box(len, 0.05, 0.30, midX, y, shelfZ, wood);
      // 小挡边
      box(len, 0.05, 0.03, midX, y + 0.05, shelfZ - 0.145, std(0x7a5c3a, 0.8));
      void i;
    });
    [-1, 1].forEach(function (sgn) {
      box(0.05, 1.30, 0.05, midX + sgn * (len / 2 - 0.03), 0.65, shelfZ, std(0x7a5c3a, 0.8));
      box(0.05, 1.30, 0.05, midX + sgn * (len / 2 - 0.03), 0.65, shelfZ - 0.13, std(0x7a5c3a, 0.8));
    });

    // 架子上的花盆（小陶盆 + 模型花）
    const potMat = std(0xb07a56, 0.85);
    const flowerRows = [
      { y: 0.20, list: ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_redA'] },
      { y: 0.68, list: ['flower_yellowA', 'flower_redA', 'plant_bushSmall', 'flower_purpleA'] },
      { y: 1.16, list: ['flower_purpleA', 'plant_bushSmall', 'flower_yellowA', 'flower_redA'] }
    ];
    flowerRows.forEach(function (row) {
      row.list.forEach(function (name, k) {
        const px = shelfX0 + 0.24 + k * 0.44;
        cyl(0.085, 0.065, 0.13, 12, px, row.y + 0.09, shelfZ, potMat);
        place(name, px, row.y + 0.13, shelfZ, 0.26, k * 1.1);
      });
    });

    /* ---- 地上：两盆灌木 + 角落一丛蘑菇 + 一截木头当小凳 ---- */
    cyl(0.15, 0.12, 0.20, 12, 9.55, 0.10, 3.16, potMat);
    place('plant_bushSmall', 9.55, 0.14, 3.16, 0.52, 0.4);
    cyl(0.15, 0.12, 0.20, 12, 10.35, 0.10, 3.20, potMat);
    place('plant_bushSmall', 10.35, 0.14, 3.20, 0.52, -0.8);
    place('mushroom_redGroup', 12.02, 0, 3.22, 0.46, 0.3);
    place('log', 12.10, 0, 1.55, 0.95, 1.2);
    place('grass_large', 11.95, 0, 3.30, 0.42, 0.9);
  }

  /* ================= 地板 / 玻璃墙 / 玻璃顶 ================= */
  function buildShell() {
    const floorMat = new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.8, metalness: 0.02 });
    const f = plane(W, D, floorMat, CX, 0.004, CZ);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;

    const frameMat = std(0xdcd2bd, 0.6);
    const frameDark = std(0x877c5f, 0.65);
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xcfe6ea), roughness: 0.05, metalness: 0.04,
      transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false
    });

    /* 南面（z = Z1）：整面玻璃 */
    box(W, 0.10, T, CX, 0.05, Z1, frameDark);
    box(W, 0.08, T, CX, H - 0.04, Z1, frameDark);
    [-W / 2, -W / 6, W / 6, W / 2].forEach(function (dx) {
      box(0.07, H, T, CX + dx, H / 2, Z1, frameMat);
    });
    plane(W - 0.10, H - 0.20, glassMat, CX, H / 2, Z1);

    /* 东面（x = X1） */
    box(T, 0.10, D, X1, 0.05, CZ, frameDark);
    box(T, 0.08, D, X1, H - 0.04, CZ, frameDark);
    [-D / 2, 0, D / 2].forEach(function (dz) {
      box(T, H, 0.07, X1, H / 2, CZ + dz, frameMat);
    });
    const gp = plane(D - 0.10, H - 0.20, glassMat, X1, H / 2, CZ);
    gp.rotation.y = Math.PI / 2;

    /* 北面（z = Z0）：后半截是玻璃，前半截贴着厨房外墙 */
    box(W, 0.10, T, CX, 0.05, Z0, frameDark);
    box(W, 0.08, T, CX, H - 0.04, Z0, frameDark);
    [-W / 2, -W / 6, W / 6, W / 2].forEach(function (dx) {
      box(0.07, H, T, CX + dx, H / 2, Z0, frameMat);
    });
    plane(W - 0.10, H - 0.20, glassMat, CX, H / 2, Z0);

    /* 西面：z 1.30~3.50 这一段补一道实墙（挡住浴室），其余就是厨房那道墙 */
    const wallMat = std(0xe8ddc9, 0.92);
    box(T, H, Z1 - 1.30, X0 - T / 2, H / 2, (1.30 + Z1) / 2, wallMat);

    /* 玻璃顶：拱形太麻烦，做平顶 + 三道横梁 */
    const ceil = plane(W, D, glassMat, CX, H, CZ);
    ceil.rotation.x = Math.PI / 2;
    box(W, 0.07, 0.07, CX, H, Z0, frameDark);
    box(W, 0.07, 0.07, CX, H, Z1, frameDark);
    box(W, 0.06, 0.06, CX, H, CZ, frameMat);
    box(0.07, 0.07, D, X0, H, CZ, frameDark);
    box(0.07, 0.07, D, X1, H, CZ, frameDark);
    box(0.06, 0.06, D, CX, H, CZ, frameMat);

    /* 门口的框（厨房东墙那道门在 x 9.10 / z 0.58~1.28） */
    const dz0 = 0.58, dz1 = 1.28;
    box(0.06, 2.10, 0.05, X0, 1.05, dz0 - 0.03, frameMat);
    box(0.06, 2.10, 0.05, X0, 1.05, dz1 + 0.03, frameMat);
    box(0.06, 0.06, dz1 - dz0 + 0.12, X0, 2.10, (dz0 + dz1) / 2, frameMat);

    /* 墙角一盆爬藤（装饰） */
    const ivy = std(0x6f9a5c, 0.85);
    const pot = cyl(0.16, 0.13, 0.26, 12, X1 - 0.30, 0.13, Z1 - 0.30, std(0xb07a56, 0.85));
    void pot;
    for (let i = 0; i < 9; i++) {
      const m = ball(0.10, X1 - 0.30 + Math.sin(i * 1.7) * 0.30, 0.34 + i * 0.14, Z1 - 0.30 + Math.cos(i * 1.3) * 0.16, ivy, root, 8);
      m.scale.set(1, 0.5, 0.85);
      m.rotation.z = Math.sin(i) * 0.6;
    }
  }

  /* ================= 四个种植箱 ================= */
  function buildPlots() {
    // M42.6：四个种植箱往南挪 0.55 —— 原来正好堵在东墙那道门后面，
    // 从厨房进来一步就撞箱子，等于进不了花房（妈妈 17:30 的反馈）
    const spots = [
      { x: 9.62, z: 1.65 }, { x: 10.52, z: 1.65 },
      { x: 9.62, z: 2.85 }, { x: 10.52, z: 2.85 }
    ];
    const wood = std(0x8d6c46, 0.78);
    const soil = std(0x4a382a, 0.98);

    spots.forEach(function (s, i) {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      root.add(g);

      // 木箱（敞口）
      box(0.72, 0.03, 0.72, 0, 0.015, 0, wood, g);
      box(0.72, 0.30, 0.03, 0, 0.16, 0.345, wood, g);
      box(0.72, 0.30, 0.03, 0, 0.16, -0.345, wood, g);
      box(0.03, 0.30, 0.72, -0.345, 0.16, 0, wood, g);
      box(0.03, 0.30, 0.72, 0.345, 0.16, 0, wood, g);
      // 土
      const soilM = box(0.64, 0.04, 0.64, 0, 0.30, 0, soil, g);
      // 插着的小标签
      const tag = std(0xf2ead6, 0.9);
      box(0.02, 0.16, 0.12, -0.30, 0.38, 0.30, tag, g);

      // 前面立一块小木牌，写着这格种什么
      box(0.035, 0.34, 0.035, 0, 0.17, 0.46, wood, g);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24),
        new THREE.MeshStandardMaterial({ map: signTex(CROPS[i].name), roughness: 0.9 }));
      panel.position.set(0, 0.30, 0.48);
      g.add(panel);

      // 秧苗（随生长阶段缩放）
      const grow = new THREE.Group();
      grow.position.y = 0.32;
      g.add(grow);
      const stemMat = std(0x7aa05e, 0.88);
      const leafMat = std(0x86b06a, 0.88);
      const stems = [], leaves = [], fruits = [];
      const c = CROPS[i];
      for (let k = 0; k < 3; k++) {
        const dx = (k - 1) * 0.13;
        const h = 0.28 + (k % 2) * 0.08;
        const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.010, h, 6), stemMat);
        sm.position.set(dx, h / 2, (k - 1) * 0.05);
        sm.userData.h = h;
        sm.castShadow = true;
        grow.add(sm);
        stems.push(sm);
        for (let l = 0; l < 2; l++) {
          const lf = new THREE.Mesh(new THREE.SphereGeometry(0.082, 8, 6), leafMat);
          lf.position.set(dx + (l ? 0.05 : -0.05), h * (0.45 + l * 0.22), (k - 1) * 0.05);
          lf.scale.set(1.25, 0.32, 0.9);
          lf.castShadow = true;
          grow.add(lf);
          leaves.push(lf);
        }
        // 果实（番茄红 / 薄荷绿 / 葱绿）
        if (c.id === 'tomato') {
          for (let q = 0; q < 2; q++) {
            const fr = ball(c.size, dx + (q ? 0.05 : -0.05), h * 0.6, (k - 1) * 0.05 + 0.04,
              std(c.fruit, 0.72), grow, 10);
            fr.scale.set(1, 0.92, 1);
            fruits.push(fr);
          }
        } else if (c.id === 'mint') {
          for (let q = 0; q < 3; q++) {
            const fr = ball(0.05, dx + Math.sin(q * 2) * 0.06, h * (0.55 + q * 0.12), (k - 1) * 0.05,
              std(c.fruit, 0.85), grow, 8);
            fr.scale.set(1, 0.7, 0.8);
            fruits.push(fr);
          }
        } else {
          for (let q = 0; q < 2; q++) {
            const fr = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.20, 6), std(c.fruit, 0.85));
            fr.position.set(dx + (q ? 0.04 : -0.04), h * 0.85, (k - 1) * 0.05);
            fr.castShadow = true;
            grow.add(fr);
            fruits.push(fr);
          }
        }
      }
      frames.plots.push({ g: g, grow: grow, stems: stems, leaves: leaves, fruits: fruits, soil: soilM });
    });
  }

  /* ================= 小桌 + 椅子 + 茶 ================= */
  function buildTable() {
    const g = new THREE.Group();
    g.position.set(11.42, 0, 2.86);
    root.add(g);
    const wood = std(0xa9855a, 0.72);
    cyl(0.30, 0.30, 0.05, 18, 0, 0.62, 0, wood, g);
    cyl(0.035, 0.045, 0.60, 10, 0, 0.30, 0, wood, g);
    cyl(0.18, 0.20, 0.04, 14, 0, 0.02, 0, wood, g);

    // 一杯薄荷茶（摘了薄荷会变满）
    const cup = cyl(0.045, 0.036, 0.085, 12, 0.05, 0.685, -0.05, std(0xe9e3d4, 0.4), g);
    void cup;
    const tea = cyl(0.038, 0.032, 0.055, 12, 0.05, 0.69, -0.05, new THREE.MeshStandardMaterial({
      color: col(0x9cc47e), roughness: 0.2, transparent: true, opacity: 0.75
    }), g);
    tea.visible = false;
    frames.tea = tea;

    // 喷壶
    const canMat = std(0x9fb3b8, 0.42, 0.35);
    const can = new THREE.Group();
    can.position.set(-0.16, 0.645, 0.06);
    can.rotation.y = 0.5;
    g.add(can);
    cyl(0.075, 0.085, 0.16, 12, 0, 0.08, 0, canMat, can);
    const spout = cyl(0.014, 0.022, 0.20, 8, 0.10, 0.16, 0, canMat, can);
    spout.rotation.z = -0.9;
    cyl(0.018, 0.024, 0.05, 8, 0.17, 0.23, 0, canMat, can);
    frames.can = can;

    // 一把藤椅
    const chair = new THREE.Group();
    chair.position.set(11.42, 0, 2.10);
    chair.rotation.y = Math.PI;
    root.add(chair);
    const rattan = std(0xb99a6c, 0.85);
    box(0.44, 0.05, 0.42, 0, 0.44, 0, rattan, chair);
    box(0.44, 0.55, 0.05, 0, 0.72, -0.20, rattan, chair);
    [[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]].forEach(function (p) {
      box(0.04, 0.44, 0.04, p[0], 0.22, p[1], rattan, chair);
    });
    box(0.40, 0.05, 0.36, 0, 0.475, 0.01, std(0xdcd8c4, 0.95), chair);   // 坐垫

    // 挂着的两个小吊盆
    for (let i = 0; i < 2; i++) {
      const hx = X0 + 0.55 + i * 1.6;
      cyl(0.006, 0.006, 0.42, 5, hx, H - 0.21, Z0 + 0.55, std(0x8a8272, 0.8));
      const pot = cyl(0.11, 0.085, 0.14, 12, hx, H - 0.48, Z0 + 0.55, std(0xb07a56, 0.85));
      void pot;
      for (let k = 0; k < 5; k++) {
        const lf = ball(0.06, hx + Math.sin(k * 1.4) * 0.09, H - 0.55 - k * 0.05, Z0 + 0.55 + (k % 2) * 0.04,
          std(0x74a063, 0.88), root, 8);
        lf.scale.set(1, 0.55, 0.85);
      }
    }
  }

  /* ================= 灯（花房自己的暖光） ================= */
  function buildLights() {
    // 吊灯（看得见的那盏，晚上才亮）
    cyl(0.008, 0.008, 0.36, 6, CX, H - 0.18, CZ, std(0x5a5044, 0.8));
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.18, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: col(0xf0e4cc), roughness: 0.8, side: THREE.DoubleSide })
    );
    shade.position.set(CX, H - 0.44, CZ);
    shade.rotation.x = Math.PI;
    root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8),
      new THREE.MeshBasicMaterial({ color: col(0x7a7566) }));
    bulb.position.set(CX, H - 0.53, CZ);
    root.add(bulb);
    frames.lampBulb = bulb;

    const warm = new THREE.PointLight(0xffe0b4, 0.85, 7, 2);
    warm.position.set(CX, H - 0.55, CZ);
    root.add(warm);
    // 白天的太阳感（从玻璃顶漏下来的亮）
    const sun = new THREE.DirectionalLight(0xfff2d8, 0.34);
    sun.position.set(CX + 1.6, 5.2, CZ + 1.2);
    sun.target.position.set(CX, 0, CZ);
    root.add(sun);
    root.add(sun.target);
    frames.warm = warm;
  }

  // 种植箱前的小木牌（写着这格种什么）
  function signTex(text) {
    return XD.Mat.tex(128, 96, function (g, Wd, Hd) {
      g.fillStyle = '#f3ecda';
      g.fillRect(0, 0, Wd, Hd);
      g.strokeStyle = '#8a7a5e';
      g.lineWidth = 4;
      g.strokeRect(3, 3, Wd - 6, Hd - 6);
      g.fillStyle = '#4a4034';
      g.font = 'bold 36px sans-serif';
      g.textAlign = 'center';
      g.fillText(text, Wd / 2, 60);
    });
  }

  // 玻璃顶上的雨点
  function buildRainDrops() {
    const N = 90;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seed = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = X0 + 0.1 + Math.random() * (W - 0.2);
      pos[i * 3 + 1] = H + 0.02;
      pos[i * 3 + 2] = Z0 + 0.1 + Math.random() * (D - 0.2);
      seed.push(Math.random() * 6.3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: col(0xd8ecf4), size: 0.055, sizeAttenuation: true,
      transparent: true, opacity: 0.7, fog: false
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    pts.visible = false;
    root.add(pts);
    frames.drops = pts;
    frames.dropSeed = seed;
    frames.dropPos = pos;
    frames.dropGeo = geo;

    // 水雾（喷壶用）
    const M = 60;
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(M * 3);
    const ms = [];
    for (let i = 0; i < M; i++) {
      mp[i * 3] = 0; mp[i * 3 + 1] = -10; mp[i * 3 + 2] = 0;
      ms.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const mm = new THREE.PointsMaterial({
      color: col(0xd6e9ef), size: 0.035, sizeAttenuation: true,
      transparent: true, opacity: 0.8, fog: false
    });
    const mist = new THREE.Points(mg, mm);
    mist.frustumCulled = false;
    root.add(mist);
    frames.mist = mist;
    frames.mistSeed = ms;
    frames.mistPos = mp;
    frames.mistGeo = mg;
  }

  /* ================= 存 / 读 ================= */
  function save() {
    try { localStorage.setItem(LS, JSON.stringify({ plots: st.plots, mintPicked: !!st.mintPicked })); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && o.plots && o.plots.length === 4) st.plots = o.plots;
      if (o && o.mintPicked) st.mintPicked = true;
    } catch (e) {}
  }

  /* ================= 生长 ================= */
  function stageOf(p) {
    if (!p) return 0;
    if (!p.watered) return 0;
    const age = (Date.now() - p.at) / HOUR;
    if (age < 0.8) return 0;      // 刚浇水，还没出苗
    if (age < 2.5) return 1;      // 苗
    if (age < 5.0) return 2;      // 长大
    return 3;                     // 熟了
  }

  function applyPlots() {
    frames.plots.forEach(function (pl, i) {
      const p = st.plots[i];
      const s = stageOf(p);
      const c = CROPS[i];
      // 0 空土 / 1 苗 / 2 长 / 3 熟
      const sc = s === 0 ? 0 : s === 1 ? 0.42 : s === 2 ? 0.75 : 1.0;
      pl.grow.visible = s > 0;
      pl.grow.scale.set(sc, sc, sc);
      // 果实只在熟了才出现
      pl.fruits.forEach(function (fr) { fr.visible = (s === 3); });
      // 土：浇过水的颜色深一点
      const wet = p && p.watered;
      pl.soil.material.color.copy(col(wet ? 0x3a2b20 : 0x4a382a)).multiplyScalar(SUN);
      void c;
    });
    // 薄荷摘过就有茶
    if (frames.tea) frames.tea.visible = !!st.mintPicked;
  }

  function waterAll() {
    let any = false;
    for (let i = 0; i < st.plots.length; i++) {
      const p = st.plots[i];
      if (p && !p.watered) {
        p.watered = true;
        p.at = Date.now();
        any = true;
      }
    }
    if (any) { save(); applyPlots(); }
    return any;
  }

  function mistAt(x, z) {
    const s = frames.mistSeed;
    for (let i = 0; i < s.length; i++) {
      const q = s[i];
      q.x = x + (Math.random() - 0.5) * 0.24;
      q.y = 0.62;
      q.z = z + (Math.random() - 0.5) * 0.24;
      q.vx = (Math.random() - 0.5) * 0.5;
      q.vy = -0.55 - Math.random() * 0.5;
      q.vz = (Math.random() - 0.5) * 0.5;
      q.life = 0.5 + Math.random() * 0.4;
    }
  }

  /* ================= 可点的地方 ================= */
  function register() {
    if (!interact || !interact.add) return;
    const here = function () { return !isStore(); };

    frames.plots.forEach(function (pl, i) {
      interact.add({
        id: 'green-plot' + (i + 1), label: CROPS[i].name + '（种植箱）',
        box: [pl.g.position.x, 0.30, pl.g.position.z, 0.80, 0.70, 0.80],
        anchor: [pl.g.position.x, 0.72, pl.g.position.z],
        when: here,
        onClick: function () {
          const p = st.plots[i];
          const c = CROPS[i];
          if (!p) {
            st.plots[i] = { crop: c.id, at: 0, watered: false };
            save();
            applyPlots();
            if (sfx) { try { sfx.pickup(); } catch (e) {} }
            this._say = '种下' + c.name + '了 —— 得给它浇点水才发芽（点桌上的喷壶）';
            if (life && life.log) life.log('在花房种下' + c.name);
            return;
          }
          if (!p.watered) {
            mistAt(pl.g.position.x, pl.g.position.z);
            if (waterAll()) {
              if (sfx) { try { sfx.pour({ x: pl.g.position.x, y: 0.6, z: pl.g.position.z }); } catch (e) {} }
              this._say = '浇过水了，等它慢慢长';
            } else {
              this._say = '水有点多啦';
            }
            return;
          }
          const s = stageOf(p);
          if (s < 3) {
            const left = Math.max(0.2, (5.0 - (Date.now() - p.at) / HOUR)).toFixed(1);
            this._say = '还在长呢，再过 ' + left + ' 小时就熟了';
            return;
          }
          // 摘：果实先往上跳一下再消失（小收获演出）
          frames._freeze = true;
          frames.plots[i].fruits.forEach(function (fr, k) {
            if (!fr.visible) return;
            frames.anim.push({
              o: fr, t: -k * 0.06, life: 0.55,
              y0: fr.position.y, s0: fr.scale.x
            });
          });
          st.plots[i] = null;
          if (c.id === 'tomato') {
            if (homefood && homefood.setStock) homefood.setStock({ tomato: 1 });
            if (life && life.log) life.log('从花房摘了两个番茄，放进冰箱');
            this._say = '红了！摘下两个放进冰箱 —— 晚上能炒蛋';
          } else if (c.id === 'mint') {
            st.mintPicked = true;
            if (frames.tea) frames.tea.visible = true;
            if (life && life.log) life.log('摘了一把薄荷，泡了杯茶');
            this._say = '掐了一把薄荷，泡杯茶 —— 桌上的杯子已经满上了';
          } else {
            if (homefood && homefood.setStock) homefood.setStock({ scallion: 1 });
            if (life && life.log) life.log('剪了一把小葱，搁在厨房');
            this._say = '剪了一把小葱，搁厨房去了 —— 煮面的时候撒一点';
          }
          save();
          // 动画放完再清（立刻 applyPlots 的话果实会瞬间消失，跳不起来）
          setTimeout(function () { frames._freeze = false; applyPlots(); }, 640);
          if (sfx) { try { sfx.pickup(); } catch (e) {} }        },
        say: function (h) { return h._say || CROPS[i].name; }
      });
    });

    // 喷壶
    interact.add({
      id: 'green-can', label: '喷壶',
      box: [11.26, 0.80, 2.92, 0.34, 0.34, 0.34],
      anchor: [11.30, 1.00, 2.92],
      when: here,
      onClick: function () {
        mistAt(10.07, 1.70);
        if (waterAll()) {
          if (sfx) { try { sfx.pour({ x: 11.2, y: 0.8, z: 2.9 }); } catch (e) {} }
          this._say = '给四格都浇上水了 —— 水珠落在叶子上，亮晶晶的';
        } else {
          this._say = '都浇过了，等它们长吧';
        }
      },
      say: function (h) { return h._say || '浇水'; }
    });

    // 椅子
    interact.add({
      id: 'green-chair', label: '藤椅',
      box: [11.42, 0.45, 2.10, 0.56, 0.80, 0.56],
      anchor: [11.42, 0.98, 2.10],
      when: here,
      onClick: function () {
        const h = new Date().getHours();
        const nightNow = getMode ? (getMode() === 'night') : (h >= 19 || h < 6);
        const rainy = !!(rain && rain.isOn());
        if (rainy) this._say = '下雨了，玻璃顶上噼里啪啦的 —— 坐这儿听一会儿最好';
        else if (nightNow) this._say = '晚上花房里有股土的味道，叶子上会结露水';
        else if (h < 11) this._say = '早上的花房有点凉，晒十分钟就暖了';
        else this._say = '坐这儿看番茄一点点变红，比看手机有意思';
      },
      say: function (h) { return h._say || '坐一会儿'; }
    });

    // 吊盆
    interact.add({
      id: 'green-hang', label: '挂着的花盆',
      box: [X0 + 1.35, H - 0.48, Z0 + 0.55, 1.80, 0.40, 0.40],
      anchor: [X0 + 1.35, H - 0.30, Z0 + 0.60],
      when: here,
      onClick: function () {
        this._say = '垂下来的小盆，浇水会滴到下面 —— 所以底下不放东西';
      },
      say: function (h) { return h._say || '挂着的小盆'; }
    });
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!root) return;
    t += dt;

    // 生长：每 4 秒重算一次
    if (!frames._tick || t - frames._tick > 4) {
      frames._tick = t;
      const sig = st.plots.map(function (p) { return stageOf(p); }).join('');
      if (!frames._freeze && frames._sig !== sig) {
        frames._sig = sig;
        applyPlots();
      }
    }

    // 收获动画：果实往上跳一下再缩小消失
    for (let ai = frames.anim.length - 1; ai >= 0; ai--) {
      const a = frames.anim[ai];
      a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.life);
      a.o.position.y = a.y0 + Math.sin(k * Math.PI * 0.85) * 0.34;
      a.o.scale.setScalar(Math.max(0.06, (a.s0 || 1) * (1 - k * 0.95)));
      if (k >= 1) {
        a.o.visible = false;
        a.o.scale.setScalar(a.s0 || 1);
        a.o.position.y = a.y0;
        frames.anim.splice(ai, 1);
      }
    }

    // 吊灯：晚上亮、白天灭（每 3 秒看一次表）
    if (!frames._lt || t - frames._lt > 3) {
      frames._lt = t;
      // M68：跟场景的白天/夜晚走（以前看真实时钟，按"夜晚"按钮灯不亮）
      const night = getMode ? (getMode() === 'night')
        : (function () { const hh = new Date().getHours(); return hh >= 18 || hh < 6; })();
      if (frames.warm) frames.warm.intensity = night ? 1.25 : 0.42;
      if (frames.lampBulb) frames.lampBulb.material.color.copy(col(night ? 0xffe9c0 : 0x6f6a5d));
    }

    // 水雾
    if (frames.mist) {
      const s = frames.mistSeed, pos = frames.mistPos;
      let live = false;
      for (let i = 0; i < s.length; i++) {
        const q = s[i];
        if (q.life > 0) {
          q.life -= dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.z += q.vz * dt;
          live = true;
        }
        pos[i * 3] = q.x;
        pos[i * 3 + 1] = q.life > 0 ? q.y : -10;
        pos[i * 3 + 2] = q.z;
      }
      if (live) frames.mistGeo.attributes.position.needsUpdate = true;
    }

    // 玻璃顶上的雨点
    if (frames.drops) {
      const raining = !!(rain && rain.isOn()) && !isStore();
      frames.drops.visible = raining;
      if (raining) {
        const pos = frames.dropPos;
        for (let i = 0; i < frames.dropSeed.length; i++) {
          const ph = frames.dropSeed[i];
          const k = (Math.sin(t * 3.1 + ph) + 1) * 0.5;
          pos[i * 3 + 1] = H + 0.01 + k * 0.012;
        }
        frames.dropGeo.attributes.position.needsUpdate = true;
      }
    }

    // 外面的天换白天/晚上 + 草地晚上暗下去（每 5 秒看一次表够了）
    if (!frames._sky || t - frames._sky > 5) {
      frames._sky = t;
      // M68：以前这里看的是真实时钟，于是中午打开就是一片白楼，而且按"白天/夜晚"
      // 按钮也换不回来（妈妈：「查一下 bug」）。现在跟场景的 mode 走。
      const night = getMode ? (getMode() === 'night')
        : (function () { const hh = new Date().getHours(); return hh >= 18 || hh < 6; })();
      if (frames.bgMat && frames.bgMode !== (night ? 'night' : 'day')) {
        frames.bgMode = night ? 'night' : 'day';
        frames.bgMat.map = night ? frames.bgNight : frames.bgDay;
        frames.bgMat.needsUpdate = true;
      }
      if (frames.grass) {
        frames.grass.material.color.copy(frames.grassBase).multiplyScalar(night ? 0.34 : 1);
      }
    }
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    homefood = o.homefood || null;
    life = o.life || null;
    rain = o.rain || null;
    isStore = o.isStore || isStore;
    getMode = o.getMode || null;      // M68：跟场景的白天/夜晚走（以前偷偷看真实时钟）
    if (!scene) return null;

    load();
    if (st.mintPicked === undefined) st.mintPicked = false;

    root = new THREE.Group();
    root.name = 'greenhouse-m26';
    scene.add(root);

    buildShell();
    buildOutside();
    buildGarden();
    buildPlots();
    buildTable();
    buildLights();
    buildRainDrops();
    applyPlots();
    frames._sig = st.plots.map(function (p) { return stageOf(p); }).join('');
    register();
    loadModels();      // 免费模型（加载完自己摆位，失败就保持手捏的）

    // 走路能走进去（wing 的 HOME 只到 x 8.72，这里把花房和门洞交进去）
    const area = { x0: X0 + 0.16, x1: X1 - 0.16, z0: Z0 + 0.14, z1: Z1 - 0.14 };
    const gate = { x0: X0 - 0.55, x1: X0 + 0.16, z0: 0.64, z1: 1.22 };

    return {
      root: root,
      update: update,
      area: area,
      gate: gate,
      blockers: [
        // 四个种植箱各挡各的（一整块的话，箱子之间的过道也会被挡死）
        { x0: 9.26, x1: 9.98, z0: 1.29, z1: 2.01 },
        { x0: 10.16, x1: 10.88, z0: 1.29, z1: 2.01 },
        { x0: 9.26, x1: 9.98, z0: 2.49, z1: 3.21 },
        { x0: 10.16, x1: 10.88, z0: 2.49, z1: 3.21 },
        { x0: 11.10, x1: 11.76, z0: 2.52, z1: 3.20 },     // 小桌
        { x0: 11.14, x1: 11.70, z0: 1.84, z1: 2.38 }      // 藤椅
      ],
      plots: function () { return st.plots.slice(); },
      plantAt: function (i, hoursAgo) {
        st.plots[i] = { crop: CROPS[i].id, at: Date.now() - (hoursAgo || 0) * HOUR, watered: true };
        save(); frames._tick = 0; applyPlots();
      },
      water: function () { waterAll(); },
      reset: function () {
        st = { plots: [null, null, null, null], mintPicked: false };
        save(); applyPlots();
        if (frames.tea) frames.tea.visible = false;
      },
      debug: function () {
        return {
          plots: st.plots.map(function (p, i) { return p ? CROPS[i].name + ':' + stageOf(p) : '-'; }),
          tea: !!st.mintPicked
        };
      }
    };
  }

  return { build: build };
})();
