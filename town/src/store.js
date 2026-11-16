/* 小D的赛博小家 · M16 便利店（新场景：楼下街角那家 24h 小店）
 * 整间店搭在 x≈20 那边，平时整个 group 隐藏 —— 家里和店里永远不同框。
 * 从家里「🏪 出门」淡出一下就到店门口，店里有「🏠 回家」。
 * 参考：参考-便利店灵感.md（小红书实拍，只取真实照片里的东西）
 */
window.XD = window.XD || {};

XD.Store = (function () {
  'use strict';

  // 店的范围：x 20.0~29.6，z -4.0~4.0，高 3.3（比之前宽一圈：主过道 1.4m，两个人能错身）
  const X0 = 20.0, X1 = 29.6, Z0 = -4.0, Z1 = 4.0, H = 3.3;
  const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  const DOOR = { x0: 23.95, x1: 25.55, z: Z1 };   // 自动门开口（1.6m 宽）
  const OUT = { x0: 20.45, x1: 29.15, z0: -3.5, z1: 9.6 };

  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  let scene = null, root = null, inside = null, outside = null, refs = null;
  let doorL = null, doorR = null, doorOpen = 0, doorWasOpen = false, doorCall = 99;
  let steamSprites = [];
  let t = 0;

  /* ================= 小工具 ================= */
  function box(w, h, d, x, y, z, mat, parent, noShadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (!noShadow) { m.castShadow = true; m.receiveShadow = true; }
    (parent || root).add(m);
    return m;
  }
  function plane(w, h, x, y, z, mat, parent, rotY) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (rotY) m.rotation.y = rotY;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.7 : rough,
      metalness: metal === undefined ? 0.0 : metal
    });
  }

  /* ================= M18：真商品（Kenney Food Kit，CC0 公共领域） =================
   * 模型在 assets/food-kit/*.glb，由 src/goods.js 异步加载。
   * 这里的 SIZE 是"最大边长（米）"，按货架/冷柜/柜台的格子调过，别再乱改。
   */
  const SIZE = {
    can: 0.16, sodaCan: 0.15, sodaBottle: 0.22, glass: 0.13, carton: 0.24,
    cartonSmall: 0.20, candyBar: 0.13, cookie: 0.12, cookieChocolate: 0.13,
    cupcake: 0.15, muffin: 0.14, donut: 0.14, donutSprinkles: 0.15,
    pudding: 0.13, egg: 0.085, tomato: 0.09, bread: 0.24, loaf: 0.26,
    loafRound: 0.26, croissant: 0.18, sandwich: 0.20, sub: 0.26,
    riceBall: 0.155, styrofoamDinner: 0.22, bowlSoup: 0.20, dimSum: 0.15,
    iceCream: 0.17, iceCreamCone: 0.17, iceCreamCup: 0.16, sundae: 0.16,
    popsicle: 0.15, popsicleChocolate: 0.15, iceCreamScoop: 0.11,
    mug: 0.14, cup: 0.12, apple: 0.10, banana: 0.15, orange: 0.10,
    strawberry: 0.07, grapes: 0.12, mushroom: 0.09, carrot: 0.13,
    corn: 0.17, cheese: 0.17, meatSausage: 0.20, chinese: 0.22,
    plate: 0.16, watermelon: 0.30, bag: 0.18
  };

  // 货架上的七个格子（相对货架中心的 z）—— 第 3 格 / 第 5 格是可点的那两件
  const SLOTS = [-1.15, -0.7667, -0.3833, 0, 0.3833, 0.7667, 1.15];
  // [层(0=最矮)][边(0=外侧 -x, 1=内侧 +x)][七个格子的货]
  const PLAN_A = [
    [['can', 'can', 'can', 'sodaCan', 'sodaCan', 'glass', 'glass'],
     ['sodaBottle', 'sodaBottle', 'can', 'can', 'sodaCan', 'sodaCan', 'can']],
    [['sodaCan', 'sodaCan', 'candyBar', 'candyBar', 'tomato', 'tomato', 'cookie'],
     ['cookie', 'cookie', 'cookie', 'cupcake', 'cupcake', 'muffin', 'muffin']],
    [['can', 'can', 'egg', 'candyBar', 'candyBar', 'cookie', 'cookie'],
     ['donut', 'donut', 'muffin', 'muffin', 'cupcake', 'cupcake', 'donut']],
    [['cookie', 'cookie', 'candyBar', 'muffin', 'muffin', 'donut', 'donut'],
     ['donutSprinkles', 'donutSprinkles', 'pudding', 'pudding', 'cupcake', 'cupcake', 'muffin']]
  ];
  const PLAN_B = [
    [['sodaCan', 'sodaCan', 'can', 'can', 'sodaBottle', 'sodaBottle', 'can'],
     ['can', 'can', 'sodaCan', 'sodaCan', 'can', 'can', 'sodaBottle']],
    [['cookie', 'cookie', 'bread', 'candyBar', 'candyBar', 'muffin', 'muffin'],
     ['candyBar', 'candyBar', 'cookie', 'cookie', 'cookieChocolate', 'cookieChocolate', 'candyBar']],
    [['styrofoamDinner', 'styrofoamDinner', 'riceBall', 'riceBall', 'bowlSoup', 'bowlSoup', 'riceBall'],
     ['candyBar', 'can', 'can', 'cookie', 'muffin', 'muffin', 'cookie']],
    [['croissant', 'croissant', 'loafRound', 'loafRound', 'croissant', 'croissant', 'loaf'],
     ['croissant', 'croissant', 'sub', 'sub', 'loafRound', 'loafRound', 'sandwich']]
  ];

  // 摆一件真商品（异步；加载失败就当没这回事，不影响别的）
  function food(parent, name, x, y, z, size, rotY) {
    if (!window.GOODS || !window.GOODS.place || !name) return;
    window.GOODS.place(parent, name, x, y, z,
      size || SIZE[name] || 0.18,
      rotY ? { rotY: rotY } : null);
  }

  /* ================= 贴图 ================= */
  function tileTex() {
    return XD.Mat.tex(512, 512, function (g, W, H2) {
      g.fillStyle = '#e6e2da';
      g.fillRect(0, 0, W, H2);
      const n = 4, s = W / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const v = 0.94 + Math.random() * 0.07;
          g.fillStyle = 'rgba(' + Math.round(232 * v) + ',' + Math.round(228 * v) + ',' + Math.round(219 * v) + ',1)';
          g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
          // 一点点脏/磨痕，别太新
          g.fillStyle = 'rgba(150,145,135,' + (0.02 + Math.random() * 0.04).toFixed(3) + ')';
          g.beginPath();
          g.arc(i * s + Math.random() * s, j * s + Math.random() * s, 6 + Math.random() * 22, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = 'rgba(190,186,176,0.9)';
      g.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, H2); g.stroke();
        g.beginPath(); g.moveTo(0, i * s); g.lineTo(W, i * s); g.stroke();
      }
    }, [4, 3]);
  }

  function signTex() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f8fa';
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#e8eef6';
    g.fillRect(0, 232, 1024, 24);
    // 小鲸鱼标
    g.fillStyle = '#2f5bd0';
    g.beginPath();
    g.ellipse(120, 132, 52, 38, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(150, 106); g.lineTo(196, 74); g.lineTo(196, 140); g.closePath();
    g.fill();
    g.fillStyle = '#f7f8fa';
    g.beginPath(); g.arc(100, 122, 6, 0, Math.PI * 2); g.fill();
    // 店名
    g.fillStyle = '#20304d';
    g.font = 'bold 108px "Microsoft YaHei"';
    g.fillText('小D便利店', 220, 176);
    // 24H
    g.fillStyle = '#d8443c';
    g.beginPath();
    g.roundRect && g.roundRect(790, 60, 190, 130, 18);
    if (!(g.roundRect)) g.rect(790, 60, 190, 130);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 92px "Arial Black", "Microsoft YaHei"';
    g.fillText('24H', 812, 164);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function windowWallTex() {
    // 对面的楼：暗色墙上一些亮着的窗
    return XD.Mat.tex(512, 512, function (g, W, H2) {
      g.fillStyle = '#141822';
      g.fillRect(0, 0, W, H2);
      for (let y = 26; y < H2 - 20; y += 74) {
        for (let x = 24; x < W - 20; x += 62) {
          const lit = Math.random() < 0.45;
          g.fillStyle = lit
            ? 'rgba(' + (210 + Math.random() * 40) + ',' + (180 + Math.random() * 40) + ',120,' + (0.5 + Math.random() * 0.45).toFixed(2) + ')'
            : 'rgba(40,48,62,0.85)';
          g.fillRect(x, y, 34, 44);
          if (lit) {
            g.fillStyle = 'rgba(255,236,190,0.16)';
            g.fillRect(x - 6, y - 6, 46, 56);
          }
        }
      }
    }, [2, 2]);
  }

  function priceTex(color, text) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px "Microsoft YaHei"';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ================= 地面 / 墙 / 天花 ================= */
  function shell() {
    // 地砖
    const floorMat = new THREE.MeshStandardMaterial({
      map: tileTex(), roughness: 0.42, metalness: 0.05
    });
    const f = plane(X1 - X0, Z1 - Z0, CX, 0, CZ, floorMat, inside);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;

    // 天花（白色，藏灯管）—— M25：西南角留个洞，让二楼的铁爬梯能爬上去
    const ceilMat = std(0xdfe3e8, 0.95);
    const HLOB = { x0: 20.0, x1: 21.45, z0: 2.65, z1: 3.85 };
    [
      [X1 - X0, HLOB.z0 - Z0, CX, (Z0 + HLOB.z0) / 2],
      [X1 - X0, Z1 - HLOB.z1, CX, (HLOB.z1 + Z1) / 2],
      [X1 - HLOB.x1, HLOB.z1 - HLOB.z0, (HLOB.x1 + X1) / 2, (HLOB.z0 + HLOB.z1) / 2]
    ].forEach(function (s) {
      const cl2 = plane(s[0], s[1], s[2], H, s[3], ceilMat, inside);
      cl2.rotation.x = Math.PI / 2;
    });

    // 墙面：奶白带一点灰（店里是那种便宜的白墙）
    const wallMat = std(0xe9e7e1, 0.9);
    // 后墙
    box(X1 - X0, H, 0.12, CX, H / 2, Z0 - 0.06, wallMat, inside);
    // 左墙（冷柜靠着它）
    box(0.12, H, Z1 - Z0, X0 - 0.06, H / 2, CZ, wallMat, inside);
    // 右墙
    box(0.12, H, Z1 - Z0, X1 + 0.06, H / 2, CZ, wallMat, inside);
    // 踢脚线
    const skirt = std(0xb9b4a8, 0.85);
    box(X1 - X0, 0.10, 0.03, CX, 0.05, Z0 + 0.015, skirt, inside);
    box(0.03, 0.10, Z1 - Z0, X0 + 0.015, 0.05, CZ, skirt, inside);
    box(0.03, 0.10, Z1 - Z0, X1 - 0.015, 0.05, CZ, skirt, inside);

    // 两根冷白灯管
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
    [CX - 1.85, CX + 1.85].forEach(function (x) {
      const t1 = box(0.12, 0.06, 5.6, x, H - 0.10, CZ - 0.2, tubeMat, inside, true);
      t1.castShadow = false;
      // 灯管两侧的铝槽
      box(0.18, 0.04, 5.7, x, H - 0.055, CZ - 0.2, std(0xc9ced6, 0.4, 0.5), inside);
      const l = new THREE.PointLight(0xf6f9ff, 0.92, 11, 2);
      l.position.set(x, H - 0.25, CZ - 0.2);
      inside.add(l);
    });
  }

  /* ================= 货架（两排双面） ================= */
  const PRODUCT_COLORS = [0xd8443c, 0xe8b23a, 0x2f6bd0, 0x3f9a5a, 0xc9557f,
    0xe07b2c, 0x545a66, 0xf0e6d2, 0x7f4fbf, 0x2a9aa8];

  function shelfRun(x, z0, z1, label) {
    const g = new THREE.Group();
    g.position.set(x, 0, (z0 + z1) / 2);
    g.name = 'shelf-' + label;
    inside.add(g);

    const W = 0.9;                     // 宽（x）
    const L = z1 - z0;                 // 长（z）
    const HGT = 1.62;
    const metal = std(0xd6d9de, 0.45, 0.35);
    const board = std(0xf0f1f3, 0.8);

    // 中背板
    box(0.05, HGT, L, 0, HGT / 2, 0, metal, g);
    // 两侧封板
    box(W, HGT, 0.04, 0, HGT / 2, -L / 2, metal, g);
    box(W, HGT, 0.04, 0, HGT / 2, L / 2, metal, g);
    // 四条腿
    [[-W / 2 + 0.05, -L / 2 + 0.05], [W / 2 - 0.05, -L / 2 + 0.05],
     [-W / 2 + 0.05, L / 2 - 0.05], [W / 2 - 0.05, L / 2 - 0.05]].forEach(function (p) {
      cyl(0.02, 0.02, 0.10, 6, p[0], 0.05, p[1], metal, g);
    });

    // 4 层层板（两侧都摆货）
    const levels = [0.16, 0.58, 1.00, 1.40];
    const tagTexRed = priceTex('#d8443c', '¥');
    const tagTexYellow = priceTex('#e8b23a', '¥');
    levels.forEach(function (y, li) {
      [-1, 1].forEach(function (side) {
        const bx = side * W / 4;
        box(W / 2 - 0.02, 0.035, L - 0.06, bx, y, 0, board, g);
        // 层板前沿的价签（红黄小牌）
        const tagMat = new THREE.MeshBasicMaterial({
          map: (li + (side > 0 ? 1 : 0)) % 2 ? tagTexRed : tagTexYellow,
          toneMapped: false
        });
        for (let k = 0; k < 5; k++) {
          const p = plane(0.11, 0.055, bx + side * (W / 4 - 0.03), y - 0.02,
            -L / 2 + 0.25 + k * ((L - 0.5) / 4), tagMat, g, side > 0 ? Math.PI / 2 : -Math.PI / 2);
          p.castShadow = false;
        }
        // 商品：真模型（Kenney Food Kit，CC0），每层七个格子；
        // 往层板前沿挪一点（bxg），看起来是摆出来卖的，不是藏在板中间
        const plan = (label === 'a' ? PLAN_A : PLAN_B)[li][side > 0 ? 1 : 0];
        const bxg = side * 0.30;
        for (let k = 0; k < SLOTS.length; k++) {
          const nm = plan[k];
          if (!nm) continue;
          food(g, nm, bxg, y + 0.0175, SLOTS[k], SIZE[nm],
            side > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      });
    });

    // 两侧端板挂个"端架促销牌"，不然从门口看就是一堵白板
    [-1, 1].forEach(function (side, idx) {
      const zEdge = side * (L / 2 + 0.025);
      const p = plane(0.72, 0.34, 0, 1.18, zEdge,
        new THREE.MeshBasicMaterial({
          map: priceTex(idx ? '#2f6bd0' : '#d8443c', idx ? '新品' : '特价'),
          toneMapped: false
        }), g, side > 0 ? 0 : Math.PI);
      p.castShadow = false;
      const p2 = plane(0.72, 0.34, 0, 0.72, zEdge,
        new THREE.MeshBasicMaterial({
          map: priceTex(idx ? '#e8952f' : '#3f9a5a', idx ? '买二送一' : '冷饮'),
          toneMapped: false
        }), g, side > 0 ? 0 : Math.PI);
      p2.castShadow = false;
    });
    return g;
  }

  /* ================= 冷柜墙（左墙一整面） ================= */
  function fridgeWall() {
    const g = new THREE.Group();
    g.position.set(X0 + 0.48, 0, -0.4);
    g.name = 'fridge-wall';
    inside.add(g);

    const W = 0.95, L = 5.6, HGT = 2.30;
    const body = std(0xd9dde3, 0.5, 0.2);
    // 柜体做成"空心"的：只留背板 / 顶底 / 两侧，前面敞开装玻璃门。
    // （以前是一整块实心，里面摆的饮料其实全被埋在柜体里，只能看到一堵白墙）
    box(0.07, HGT, L, -W / 2 + 0.035, HGT / 2, 0, body, g);            // 背板
    box(W, 0.07, L, 0, HGT - 0.035, 0, body, g);                        // 顶
    box(W, 0.07, L, 0, 0.035, 0, body, g);                              // 底
    box(W, HGT, 0.07, 0, HGT / 2, -L / 2 + 0.035, body, g);             // 侧
    box(W, HGT, 0.07, 0, HGT / 2, L / 2 - 0.035, body, g);
    // 内胆背板（浅蓝白，透冷光）
    const innerMat = new THREE.MeshStandardMaterial({
      color: col(0xe8f4ff), roughness: 0.55,
      emissive: new THREE.Color(0x9cc8e8).convertSRGBToLinear(), emissiveIntensity: 0.26
    });
    box(0.03, HGT - 0.16, L - 0.16, -W / 2 + 0.10, HGT / 2, 0, innerMat, g);
    // 柜里三层层板
    const shelfMat = std(0xeef2f5, 0.5, 0.1);
    [0.24, 0.84, 1.44].forEach(function (y) {
      box(W - 0.16, 0.02, L - 0.16, -0.01, y, 0, shelfMat, g);
    });

    // 每扇门中间那个格子摆一件真模型（牛奶纸盒 / 可乐 / 汽水）
    const doorZ = [];
    for (let i = 0; i < 4; i++) doorZ.push(-L / 2 + 0.575 + i * (L / 4));
    const fridgeGoods = [
      [0, 0.84, 'sodaBottle'], [0, 1.44, 'cartonSmall'],
      [1, 0.84, 'carton'], [1, 1.44, 'sodaBottle'],
      [2, 0.84, 'carton'], [2, 1.44, 'cartonSmall'],
      [3, 0.84, 'sodaCan'], [3, 1.44, 'sodaBottle']
    ];
    fridgeGoods.forEach(function (it) {
      food(g, it[2], 0.26, it[1], doorZ[it[0]], SIZE[it[2]], Math.PI / 2);
    });

    // 四扇玻璃门
    const frameMat = std(0xc4c9d1, 0.35, 0.55);
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xcfe6f2), roughness: 0.08, metalness: 0.0,
      transparent: true, opacity: 0.13, depthWrite: false
    });
    for (let i = 0; i < 4; i++) {
      const z = -L / 2 + 0.575 + i * (L / 4);
      // 门框
      // 门框（M73：四扇门的"右立柱"和下一扇的"左立柱"是同一根，
      // 以前每扇都画两根 → 中间三根被画了两遍、z 完全重合；这里只在第一扇补一根左立柱）
      if (i === 0) box(0.05, HGT - 0.16, 0.06, W / 2 + 0.02, HGT / 2, z - L / 8, frameMat, g);
      box(0.05, HGT - 0.16, 0.06, W / 2 + 0.02, HGT / 2, z + L / 8, frameMat, g);
      box(0.05, 0.06, L / 4, W / 2 + 0.02, HGT - 0.10, z, frameMat, g);
      box(0.05, 0.06, L / 4, W / 2 + 0.02, 0.10, z, frameMat, g);
      const gm = box(0.02, HGT - 0.22, L / 4 - 0.06, W / 2 + 0.02, HGT / 2, z, glassMat, g, true);
      gm.castShadow = false;
      // 把手
      box(0.03, 0.5, 0.035, W / 2 + 0.07, 1.25, z + L / 8 - 0.16, std(0x9aa0aa, 0.3, 0.7), g);
      // 门里的饮料：三排，一排一个颜色（占了真模型的格子就不摆罐子了）
      const rows = [0.35, 0.95, 1.55];
      rows.forEach(function (y, ri) {
        const taken = fridgeGoods.some(function (f) {
          return f[0] === i && Math.abs(f[1] - (y - 0.11)) < 0.03;
        });
        const n = 5;
        for (let k = 0; k < n; k++) {
          if (taken && k === 2) continue;
          const zz = z - L / 8 + 0.10 + k * ((L / 4 - 0.2) / (n - 1));
          const hh = 0.22 + (ri === 1 ? 0.06 : 0);
          const mat = std(PRODUCT_COLORS[(i * 2 + ri * 3) % PRODUCT_COLORS.length], 0.5);
          cyl(0.048, 0.052, hh, 10, W / 2 - 0.20, y, zz, mat, g);
        }
      });
    }
    // 冷柜的冷光
    const l = new THREE.PointLight(0xbfe0ff, 0.42, 4.5, 2);
    l.position.set(W / 2 - 0.3, 1.4, 0);
    g.add(l);
    // 柜顶的价签条
    const strip = plane(0.02, 0.16, W / 2 + 0.05, 2.12, 0,
      new THREE.MeshBasicMaterial({ map: priceTex('#2f6bd0', '冷饮'), toneMapped: false }), g, Math.PI / 2);
    strip.castShadow = false;
    return g;
  }

  /* ================= 收银台 + 关东煮 + 保温柜 ================= */
  function counterArea() {
    const g = new THREE.Group();
    g.name = 'counter';
    g.position.set(27.3, 0, 1.3);
    inside.add(g);

    const CW = 1.25;     // 深（x）
    const CL = 2.80;     // 长（z）
    const CH = 0.98;
    const topMat = std(0xece7dc, 0.5);
    const bodyMat = std(0x3d4650, 0.75);

    // 台体（朝店里那一面是台面）
    box(CW, CH, CL, 0, CH / 2, 0, bodyMat, g);
    box(CW + 0.06, 0.06, CL + 0.06, 0, CH + 0.03, 0, topMat, g);
    // 台面靠过道那侧一条品牌色（不做高挡板，不然关东煮被挡住看不见）
    box(0.03, 0.055, CL + 0.06, -CW / 2 - 0.02, CH + 0.065, 0, std(0x2f7d67, 0.8), g);

    // 收银机
    const regMat = std(0x3b4148, 0.5, 0.25);
    box(0.34, 0.16, 0.34, 0.10, CH + 0.12, 0.62, regMat, g);
    const screen = plane(0.28, 0.20, 0.10, CH + 0.26, 0.62,
      new THREE.MeshBasicMaterial({ color: 0x2b6f8f, toneMapped: false }), g);
    screen.rotation.x = -0.22;
    box(0.12, 0.06, 0.10, 0.10, CH + 0.02, 0.86, std(0x22262b, 0.6), g);
    // 扫码枪
    const gun = cyl(0.03, 0.035, 0.16, 8, 0.10, CH + 0.10, 0.30, std(0x22262b, 0.6), g);
    gun.rotation.z = 0.35;
    // 小票机
    box(0.20, 0.09, 0.16, 0.10, CH + 0.07, -0.02, std(0xe4e6ea, 0.7), g);
    // 小货架（台前挂的糖果）


    // 关东煮锅（台上靠过道那头，站在过道就能看见）
    const potX = -0.24, potZ = -0.45;
    const steel = std(0xb9bec7, 0.35, 0.75);
    // 锅体：外框 + 四个格
    box(0.56, 0.20, 0.86, potX, CH + 0.14, potZ, steel, g);
    box(0.52, 0.04, 0.82, potX, CH + 0.245, potZ, std(0xa8adb6, 0.3, 0.7), g);
    // 汤面（比锅口低一点，汤色是关东煮那种浅褐）
    const broth = new THREE.MeshStandardMaterial({
      color: col(0x9a6f3c), roughness: 0.18, metalness: 0.08
    });
    const soup = plane(0.52, 0.82, potX, CH + 0.215, potZ, broth, g);
    soup.rotation.x = -Math.PI / 2;
    // 分格隔片
    [potZ - 0.14, potZ + 0.14].forEach(function (pz) {
      box(0.52, 0.10, 0.012, potX, CH + 0.17, pz, steel, g);
    });
    box(0.012, 0.10, 0.82, potX, CH + 0.17, potZ, steel, g);
    // 串串：签子 + 上面的东西（比刚才粗一点才看得见）
    const stickMat = std(0xd7bb8a, 0.9);
    const stuffColors = [0xf0e6cf, 0xe8b45f, 0xd07f3f, 0xf5efdc, 0x9dc47e,
      0xe8dcc0, 0xc96b4a, 0xf2e2b8];
    for (let i = 0; i < 20; i++) {
      const col2 = i % 5;
      const row = Math.floor(i / 5);
      const zz = potZ - 0.30 + row * 0.15;
      const xx = potX - 0.17 + col2 * 0.085;
      const hh = 0.30 + Math.random() * 0.08;
      const stick = cyl(0.008, 0.008, hh, 5, xx, CH + 0.195 + hh / 2, zz, stickMat, g);
      stick.rotation.z = (Math.random() - 0.5) * 0.10;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8),
        std(stuffColors[i % stuffColors.length], 0.72));
      ball.position.set(xx, CH + 0.195 + hh - 0.05, zz);
      ball.scale.set(1, 0.85, 1);
      ball.castShadow = true;
      g.add(ball);
    }
    // 价目小牌（贴在锅沿）
    [['#d8443c', '萝卜 ¥2'], ['#2f6bd0', '鱼丸 ¥2']].forEach(function (p, i) {
      const tg = plane(0.12, 0.06, potX + 0.30, CH + 0.26, potZ - 0.18 + i * 0.36,
        new THREE.MeshBasicMaterial({ map: priceTex(p[0], p[1]), toneMapped: false }), g);
      tg.castShadow = false;
    });
    // 热气
    const steamTex = XD.Mat.tex(64, 64, function (gg, W2, H2) {
      const grd = gg.createRadialGradient(32, 32, 2, 32, 32, 30);
      grd.addColorStop(0, 'rgba(255,255,255,0.65)');
      grd.addColorStop(0.5, 'rgba(245,250,255,0.26)');
      grd.addColorStop(1, 'rgba(240,248,255,0)');
      gg.fillStyle = grd;
      gg.fillRect(0, 0, W2, H2);
    });
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: steamTex, color: 0xf2f8ff, transparent: true, opacity: 0.0,
        depthWrite: false, fog: false
      }));
      sp.position.set(potX + (Math.random() - 0.5) * 0.2, CH + 0.2, potZ + (Math.random() - 0.5) * 0.3);
      sp.scale.set(0.09, 0.09, 1);
      sp.userData = { t: i * 1.1, life: 4.2, x0: sp.position.x, z0: sp.position.z, base: CH + 0.2 };
      g.add(sp);
      steamSprites.push(sp);
    }
    // 关东煮的暖光
    const warm = new THREE.PointLight(0xffc98a, 0.34, 2.6, 2);
    warm.position.set(potX, CH + 0.45, potZ);
    g.add(warm);

    // 保温柜（热食柜：台后靠墙）
    const hc = new THREE.Group();
    hc.position.set(0.18, 0, -1.72);
    g.add(hc);
    box(0.5, 0.78, 0.62, 0, 0.39, 0, std(0xcfd3da, 0.5, 0.2), hc);
    const hcGlass = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.56),
      new THREE.MeshStandardMaterial({
        color: col(0xdfeaf2), roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false
      }));
    hcGlass.position.set(0, 0.52, 0);
    hc.add(hcGlass);
    // 热食柜里：便当 / 饭团 / 点心（真模型，妈妈能看见）
    const hcFoods = [
      [-0.07, 0.31, -0.13, 'styrofoamDinner'],
      [0.08, 0.31, -0.12, 'riceBall'],
      [-0.07, 0.31, 0.14, 'dimSum'],
      [0.08, 0.31, 0.13, 'styrofoamDinner']
    ];
    hcFoods.forEach(function (it) {
      food(hc, it[3], it[0], it[1], it[2], SIZE[it[3]], Math.PI / 2);
    });
    const hcLight = new THREE.PointLight(0xffd9a0, 0.32, 1.6, 2);
    hcLight.position.set(0, 0.62, 0);
    hc.add(hcLight);

    return g;
  }

  /* ================= 后墙的柜子 / 海报 ================= */
  function backWallStuff() {
    const g = new THREE.Group();
    g.name = 'back-wall';
    inside.add(g);

    // 一排货柜（微波炉、面巾纸、成箱的水）
    const cabMat = std(0xd0cdc6, 0.8);
    box(6.8, 1.5, 0.42, CX, 0.75, Z0 + 0.24, cabMat, g);
    box(6.9, 0.05, 0.46, CX, 1.52, Z0 + 0.24, std(0xbfbcb4, 0.75), g);
    // 微波炉
    const mw = std(0xe6e8ec, 0.6);
    box(0.5, 0.30, 0.34, CX - 2.4, 1.70, Z0 + 0.26, mw, g);
    plane(0.30, 0.16, CX - 2.38, 1.72, Z0 + 0.435,
      new THREE.MeshBasicMaterial({ color: 0x11151c, toneMapped: false }), g).castShadow = false;
    // 成箱的水
    for (let i = 0; i < 3; i++) {
      box(0.42, 0.26, 0.34, X1 - 1.2 - i * 0.46, 0.13, Z0 + 0.30, std(0x8fb8d8, 0.8), g);
    }
    // 墙上的促销海报
    const poster = XD.Mat.tex(256, 340, function (gg, W, H2) {
      gg.fillStyle = '#e8452f';
      gg.fillRect(0, 0, W, H2);
      gg.fillStyle = '#ffe9b8';
      gg.fillRect(18, 18, W - 36, H2 - 36);
      gg.fillStyle = '#e8452f';
      gg.font = 'bold 44px "Microsoft YaHei"';
      gg.textAlign = 'center';
      gg.fillText('今日特价', W / 2, 92);
      gg.font = 'bold 34px "Microsoft YaHei"';
      gg.fillText('关东煮 ¥5', W / 2, 160);
      gg.fillText('热咖啡 ¥6', W / 2, 210);
      gg.fillStyle = '#3a3a3a';
      gg.font = '22px "Microsoft YaHei"';
      gg.fillText('凌晨也开着', W / 2, 268);
    });
    const p = plane(0.72, 0.95, X0 + 1.7, 1.75, Z0 + 0.08, new THREE.MeshBasicMaterial({ map: poster, toneMapped: false }), g);
    p.castShadow = false;

    // 排队线（地上一条黄线）
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8c94a, toneMapped: false });
    const ln = plane(1.8, 0.06, 26.3, 0.005, 2.5, lineMat, g);
    ln.rotation.x = -Math.PI / 2;
    ln.castShadow = false;
    return g;
  }

  /* ================= 门面（玻璃 + 自动门 + 招牌 + 贴纸） ================= */
  function storefront() {
    const g = new THREE.Group();
    g.name = 'storefront';
    inside.add(g);

    const frameMat = std(0x8f949c, 0.45, 0.5);
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xd6e8f2), roughness: 0.06, metalness: 0.0,
      transparent: true, opacity: 0.24, depthWrite: false
    });

    // 门两侧的固定玻璃 + 框
    [[X0 + 0.02, DOOR.x0], [DOOR.x1, X1 - 0.02]].forEach(function (seg) {
      const w = seg[1] - seg[0];
      plane(w - 0.06, H - 0.5, (seg[0] + seg[1]) / 2, (H - 0.5) / 2 + 0.12, Z1,
        glassMat, g).castShadow = false;
      box(0.06, H - 0.4, 0.08, seg[0] + 0.03, (H - 0.4) / 2 + 0.1, Z1, frameMat, g);
      box(0.06, H - 0.4, 0.08, seg[1] - 0.03, (H - 0.4) / 2 + 0.1, Z1, frameMat, g);
    });
    // 下沿踢脚 + 上沿横梁
    box(X1 - X0, 0.12, 0.14, CX, 0.06, Z1, frameMat, g);
    box(X1 - X0, 0.5, 0.16, CX, H - 0.25, Z1, frameMat, g);

    // 自动门：两扇玻璃，向两边滑
    const mkDoor = function () {
      const d = new THREE.Group();
      plane(0.66, 2.30, 0, 1.25, 0, glassMat, d).castShadow = false;
      box(0.05, 2.34, 0.06, -0.33, 1.25, 0, frameMat, d);
      box(0.05, 2.34, 0.06, 0.33, 1.25, 0, frameMat, d);
      box(0.70, 0.06, 0.07, 0, 2.40, 0, frameMat, d);
      box(0.70, 0.06, 0.07, 0, 0.10, 0, frameMat, d);
      // 门上贴纸
      const st = plane(0.26, 0.12, 0.02, 1.72, 0.045,
        new THREE.MeshBasicMaterial({ map: priceTex('#2f6bd0', '自动门'), toneMapped: false }), d);
      st.castShadow = false;
      return d;
    };
    doorL = mkDoor();
    doorL.position.set((DOOR.x0 + DOOR.x1) / 2 - 0.335, 0, Z1);
    g.add(doorL);
    doorR = mkDoor();
    doorR.position.set((DOOR.x0 + DOOR.x1) / 2 + 0.335, 0, Z1);
    g.add(doorR);
    // 门框
    box(0.08, 2.5, 0.12, DOOR.x0, 1.25, Z1, frameMat, g);
    box(0.08, 2.5, 0.12, DOOR.x1, 1.25, Z1, frameMat, g);
    box(DOOR.x1 - DOOR.x0, 0.10, 0.12, (DOOR.x0 + DOOR.x1) / 2, 2.52, Z1, frameMat, g);

    // 门口地垫
    const mat = plane(1.2, 0.55, (DOOR.x0 + DOOR.x1) / 2, 0.012, Z1 + 0.42,
      new THREE.MeshStandardMaterial({ color: col(0x3d4552), roughness: 1.0 }), g);
    mat.rotation.x = -Math.PI / 2;
    mat.receiveShadow = true;

    // 招牌（门头上方，发光）
    const sign = plane(3.15, 0.78, CX, H + 0.30, Z1 + 0.06,
      new THREE.MeshBasicMaterial({ map: signTex(), toneMapped: false }), g);
    sign.castShadow = false;
    box(3.25, 0.88, 0.08, CX, H + 0.30, Z1 - 0.02, std(0x2a2f38, 0.7), g);
    // 招牌小灯
    const sl = new THREE.PointLight(0xdfeaff, 0.5, 4.0, 2);
    sl.position.set(CX, H + 0.1, Z1 + 0.5);
    g.add(sl);
    return g;
  }

  /* ================= 店外：人行道、路灯、电线杆、自行车、对面的楼 ================= */
  function outsideArea() {
    // 人行道（店门口这块，水泥灰）
    const pave = plane(14.5, 1.9, CX, 0.0, Z1 + 0.95,
      std(0x8f9298, 0.92), outside);
    pave.rotation.x = -Math.PI / 2;
    pave.receiveShadow = true;
    // 路（深色柏油，带一点反光）
    const road = plane(14.5, 6.0, CX, -0.02, Z1 + 4.8,
      new THREE.MeshStandardMaterial({ color: col(0x2b2f36), roughness: 0.28, metalness: 0.15 }),
      outside);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    // 马路牙子
    box(14.5, 0.10, 0.18, CX, 0.05, Z1 + 1.92, std(0x6d7076, 0.9), outside);
    // 路上的白线
    for (let i = 0; i < 8; i++) {
      const l = plane(0.9, 0.12, X0 + 0.8 + i * 1.8, 0.004, Z1 + 4.9,
        new THREE.MeshBasicMaterial({ color: 0xcfd4da, toneMapped: false }), outside);
      l.rotation.x = -Math.PI / 2;
      l.castShadow = false;
    }

    // 路灯
    const poleMat = std(0x3c4048, 0.5, 0.5);
    const px = X0 + 0.4, pz = Z1 + 1.6;
    cyl(0.05, 0.06, 4.2, 8, px, 2.1, pz, poleMat, outside);
    const arm = box(0.06, 0.06, 1.1, px, 4.1, pz - 0.55, poleMat, outside);
    arm.rotation.x = 0.12;
    box(0.22, 0.10, 0.32, px, 4.06, pz - 1.05, std(0x2f333a, 0.7), outside);
    const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    lampBulb.position.set(px, 3.99, pz - 1.05);
    outside.add(lampBulb);
    const streetLight = new THREE.PointLight(0xffca8a, 0.75, 9, 2);
    streetLight.position.set(px, 3.85, pz - 1.05);
    outside.add(streetLight);

    // 电线杆 + 电线
    const tpx = X1 - 0.3, tpz = Z1 + 1.3;
    cyl(0.09, 0.11, 5.2, 8, tpx, 2.6, tpz, std(0x4a4640, 0.95), outside);
    box(1.0, 0.06, 0.06, tpx - 0.4, 4.7, tpz, std(0x4a4640, 0.95), outside);
    // 简化的电线（几根细圆柱拉过去）
    for (let i = 0; i < 3; i++) {
      const w = cyl(0.006, 0.006, 9, 4, CX + 0.4, 4.55 - i * 0.14, tpz + 0.4 + i * 0.05, std(0x2b2b2b, 0.9), outside);
      w.rotation.z = Math.PI / 2;
      w.rotation.y = 0.05;
    }

    // 停着的自行车（简化：两个轮 + 车架）
    const bike = new THREE.Group();
    bike.position.set(X0 + 1.05, 0, Z1 + 2.35);
    bike.rotation.y = 1.55;
    outside.add(bike);
    const tire = std(0x24262a, 0.85);
    [-0.55, 0.55].forEach(function (dz) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 20), tire);
      wheel.position.set(0, 0.34, dz);
      bike.add(wheel);
      const spokes = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.006, 6, 16), std(0x9aa0aa, 0.4, 0.6));
      spokes.position.set(0, 0.34, dz);
      bike.add(spokes);
    });
    const frameMat2 = std(0x4a6fa8, 0.5, 0.4);
    const bar = cyl(0.022, 0.022, 1.05, 6, 0, 0.55, 0, frameMat2, bike);
    bar.rotation.x = Math.PI / 2;
    const bar2 = cyl(0.022, 0.022, 0.6, 6, 0, 0.55, 0.28, frameMat2, bike);
    bar2.rotation.z = 0.7;
    const seat = box(0.12, 0.05, 0.22, 0, 0.78, -0.32, std(0x2c2f36, 0.8), bike);
    const handle = cyl(0.018, 0.018, 0.42, 6, 0, 0.82, 0.52, std(0x2c2f36, 0.7), bike);
    handle.rotation.z = Math.PI / 2;

    // 对面的楼（挡住"家"那个方向，也把街道收起来）
    const wallMat = new THREE.MeshStandardMaterial({
      map: windowWallTex(), roughness: 0.9,
      color: col(0xdfe3ea)
    });
    const wall = plane(32, 10, 19.2, 4.6, Z1 + 2.0, wallMat, outside, Math.PI / 2);
    wall.castShadow = false;
    // 街尾的楼（背面）
    const far = plane(44, 15, CX + 2, 4.6, Z1 + 17.0, wallMat, outside);
    far.rotation.y = Math.PI;
    far.castShadow = false;

    // 地上的水洼（湿漉漉那点反光）
    for (let i = 0; i < 5; i++) {
      const puddle = plane(0.9 + Math.random() * 1.2, 0.5 + Math.random() * 0.6,
        X0 + 1.5 + Math.random() * 6, 0.006, Z1 + 2.3 + Math.random() * 2.6,
        new THREE.MeshStandardMaterial({
          color: col(0x5c6a7a), roughness: 0.06, metalness: 0.35,
          transparent: true, opacity: 0.65
        }), outside);
      puddle.rotation.x = -Math.PI / 2;
      puddle.rotation.z = Math.random() * 3;
      puddle.castShadow = false;
    }
    return bike;
  }

  /* ================= 店里的小装饰：吊旗 / 色带 / 挂钟 / 柜上的货 ================= */
  function bannerTex(bg, text, sub) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 340;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 340);
    g.fillStyle = '#ffffff';
    g.font = 'bold 62px "Microsoft YaHei"';
    g.textAlign = 'center';
    g.fillText(text, 128, 150);
    if (sub) {
      g.font = 'bold 46px "Microsoft YaHei"';
      g.fillStyle = '#ffe9a8';
      g.fillText(sub, 128, 232);
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 236, 320);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function decor() {
    const g = new THREE.Group();
    g.name = 'store-decor';
    inside.add(g);

    // 吊旗：从天花板上垂下来的一排促销牌
    const banners = [
      ['#d8443c', '特价', '关东煮 ¥5'],
      ['#2f6bd0', '冷饮', '第二件半价'],
      ['#e8952f', '零食', '买二送一'],
      ['#3f9a5a', '热食', '现蒸包子']
    ];
    for (let i = 0; i < 4; i++) {
      const x = 21.9 + i * 2.1;
      const mat = new THREE.MeshBasicMaterial({
        map: bannerTex(banners[i][0], banners[i][1], banners[i][2]),
        toneMapped: false, side: THREE.DoubleSide
      });
      const p = plane(0.46, 0.26, x, 2.42, 0.05, mat, g);
      p.castShadow = false;
      // 挂的细线
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x8f949c });
      [x - 0.18, x + 0.18].forEach(function (wx) {
        const w = plane(0.006, 0.34, wx, 2.72, 0.05, wireMat, g);
        w.castShadow = false;
      });
    }

    // 墙上的色带（便利店那种一条品牌色）
    const bandMat = std(0x2f7d67, 0.85);
    box(X1 - X0 - 0.2, 0.14, 0.03, CX, 2.24, Z0 + 0.075, bandMat, g);
    box(0.03, 0.14, Z1 - Z0 - 0.2, X0 + 0.075, 2.24, CZ, bandMat, g);
    box(0.03, 0.14, Z1 - Z0 - 0.2, X1 - 0.075, 2.24, CZ, bandMat, g);

    // 后柜上的货（一排排小盒子，把白墙填满一点）
    const pal = [0xd8443c, 0xe8b23a, 0x2f6bd0, 0x3f9a5a, 0xc9557f, 0xf0e6d2];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 12; i++) {
        const x = CX - 1.3 + i * 0.22;
        const hh = 0.13 + Math.random() * 0.06;
        box(0.16, hh, 0.16, x, 1.57 + r * 0.22 + hh / 2, Z0 + 0.16,
          std(pal[(i + r * 3) % pal.length], 0.7), g);
      }
    }

    // 挂钟（右墙）
    const clockTex = XD.Mat.tex(256, 256, function (gg, W, H2) {
      gg.clearRect(0, 0, W, H2);
      gg.fillStyle = '#fbfaf6';
      gg.beginPath(); gg.arc(128, 128, 116, 0, Math.PI * 2); gg.fill();
      gg.strokeStyle = '#3a3f48'; gg.lineWidth = 8;
      gg.beginPath(); gg.arc(128, 128, 112, 0, Math.PI * 2); gg.stroke();
      gg.fillStyle = '#3a3f48';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        gg.fillRect(128 + Math.cos(a) * 92 - 3, 128 + Math.sin(a) * 92 - 3, 6, 6);
      }
      gg.strokeStyle = '#22262b'; gg.lineWidth = 7;
      gg.beginPath(); gg.moveTo(128, 128); gg.lineTo(128 + 46, 128 - 30); gg.stroke();
      gg.lineWidth = 4;
      gg.beginPath(); gg.moveTo(128, 128); gg.lineTo(128 - 14, 128 - 74); gg.stroke();
    });
    const clock = plane(0.42, 0.42, X1 - 0.09, 2.28, 1.9,
      new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false, transparent: true }), g, -Math.PI / 2);
    clock.castShadow = false;

    // 门口玻璃上的彩色促销贴纸
    const stickerMat = new THREE.MeshBasicMaterial({ map: priceTex('#d8443c', '欢迎光临'), toneMapped: false });
    const st = plane(0.52, 0.26, 22.60, 1.55, Z1 - 0.02, stickerMat, g);
    st.castShadow = false;
    return g;
  }

  /* ================= M17：店里能玩的小东西（猫/咖啡机/冰淇淋柜/信箱） ================= */
  function shopProps() {
    const spots = {};

    // 1) 看店的猫：趴在收银台上（低模，但形状要认得出是猫）
    const catG = new THREE.Group();
    catG.position.set(27.05, 1.04, 2.30);
    catG.rotation.y = -0.9;
    catG.scale.set(0.72, 0.72, 0.72);
    inside.add(catG);
    const furMat = std(0xdbaa6c, 0.95);
    const furDark = std(0xb9854c, 0.95);
    const furLight = std(0xf1e2cb, 0.95);

    // 身子：趴着的一个扁椭圆
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), furMat);
    body.scale.set(0.36, 0.26, 0.50);
    body.position.set(0, 0.13, -0.02);
    body.castShadow = true;
    catG.add(body);
    // 背上两块深色花斑（虎斑感）
    [-0.10, 0.10].forEach(function (z, i) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), furDark);
      patch.scale.set(0.20, 0.06, 0.16);
      patch.position.set(0, 0.245, z - 0.02);
      catG.add(patch);
    });
    // 头：比身子略小，往前探一点
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), furMat);
    head.scale.set(0.32, 0.30, 0.30);
    head.position.set(0, 0.28, 0.26);
    head.castShadow = true;
    catG.add(head);
    // 耳朵：往中间收（妈妈说往里挪一点），稍微外八
    [-1, 1].forEach(function (s) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.13, 10), furMat);
      ear.position.set(s * 0.055, 0.452, 0.255);
      ear.rotation.z = -s * 0.10;
      ear.rotation.x = -0.12;
      ear.castShadow = true;
      catG.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.085, 8), std(0xe0a6a0, 0.9));
      inner.position.set(s * 0.052, 0.442, 0.278);
      inner.rotation.z = -s * 0.10;
      inner.rotation.x = -0.12;
      catG.add(inner);
    });
    // 口鼻那一块（浅色）+ 小鼻子
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), furLight);
    muzzle.scale.set(0.14, 0.10, 0.10);
    muzzle.position.set(0, 0.235, 0.375);
    catG.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), std(0xe0948c, 0.8));
    nose.scale.set(0.05, 0.035, 0.035);
    nose.position.set(0, 0.255, 0.425);
    catG.add(nose);
    // 眼睛：两颗小圆眼（眯着更可爱，用两个小圆片）
    [-1, 1].forEach(function (s) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), std(0x37302a, 0.5));
      eye.scale.set(0.038, 0.030, 0.022);
      eye.position.set(s * 0.082, 0.305, 0.395);
      catG.add(eye);
    });
    // 胡须：两边各三根细线
    const whiskerMat = new THREE.MeshStandardMaterial({ color: col(0xf7f2e6), roughness: 0.9 });
    [-1, 1].forEach(function (s) {
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.14, 4), whiskerMat);
        w.position.set(s * 0.13, 0.225 + i * 0.022, 0.40);
        w.rotation.z = Math.PI / 2 + s * 0.18;
        w.rotation.y = s * 0.35;
        catG.add(w);
      }
    });
    // 前爪：两只踏在前面
    [-1, 1].forEach(function (s) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), furLight);
      paw.scale.set(0.085, 0.062, 0.135);
      paw.position.set(s * 0.082, 0.042, 0.245);
      paw.castShadow = true;
      catG.add(paw);
    });
    // 尾巴：绕过来搭在身前
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 18, Math.PI * 1.25), furDark);
    tail.position.set(0.02, 0.12, -0.20);
    tail.rotation.x = Math.PI / 2;
    tail.rotation.z = 0.4;
    catG.add(tail);
    spots.cat = { x: 27.05, y: 1.26, z: 2.30 };

    // 2) 热咖啡机（后柜上）
    const cmX = 22.30, cmY = 1.55, cmZ = -3.66;
    const cmBody = std(0x2f343c, 0.55, 0.3);
    box(0.36, 0.44, 0.34, cmX, cmY + 0.22, cmZ, cmBody, inside);
    box(0.30, 0.06, 0.30, cmX, cmY + 0.06, cmZ, std(0x1f2329, 0.8), inside);
    // 出咖啡的口 + 一杯咖啡
    box(0.10, 0.10, 0.02, cmX, cmY + 0.20, cmZ + 0.18, std(0xb9bec7, 0.4, 0.6), inside);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.10, 14),
      std(0xf4f2ec, 0.6));
    cup.position.set(cmX, cmY + 0.09, cmZ + 0.20);
    cup.castShadow = true;
    inside.add(cup);
    const coffeeSurf = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.008, 14),
      std(0x4a2c1c, 0.3));
    coffeeSurf.position.set(cmX, cmY + 0.14, cmZ + 0.20);
    inside.add(coffeeSurf);
    // 机器的红色小灯
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
    led.position.set(cmX + 0.12, cmY + 0.36, cmZ + 0.18);
    inside.add(led);
    spots.coffee = { x: cmX, y: cmY + 0.24, z: cmZ };

    // 3) 冰淇淋卧柜（靠门右边）—— 柜体压矮一点，里面的真模型才露得出来
    const fzX = 29.00, fzZ = 2.82;
    box(0.92, 0.72, 0.86, fzX, 0.36, fzZ, std(0xe8ecf0, 0.5, 0.1), inside);
    // 薄荷绿腰线 + 柜口边条（不然纯白一片，看不出是个冰柜）
    box(0.94, 0.08, 0.88, fzX, 0.29, fzZ, std(0x5fbfa8, 0.6), inside);
    box(0.94, 0.035, 0.88, fzX, 0.705, fzZ, std(0x5fbfa8, 0.6), inside);
    // 抬起来的玻璃盖（只压一点点，冰棍看得见）
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.88),
      new THREE.MeshStandardMaterial({
        color: col(0xd6e8f2), roughness: 0.05, transparent: true, opacity: 0.17, depthWrite: false
      }));
    lid.position.set(fzX, 0.90, fzZ);
    lid.rotation.x = -0.10;
    inside.add(lid);
    // 玻璃盖的边条（四根细铝条，看着像有盖子）
    const lidFrame = std(0x9fb3c2, 0.4, 0.5);
    box(0.94, 0.03, 0.035, fzX, 0.90, fzZ - 0.45, lidFrame, inside);
    box(0.94, 0.03, 0.035, fzX, 0.90, fzZ + 0.45, lidFrame, inside);
    box(0.035, 0.03, 0.90, fzX - 0.46, 0.90, fzZ, lidFrame, inside);
    box(0.035, 0.03, 0.90, fzX + 0.46, 0.90, fzZ, lidFrame, inside);
    // 柜里的冰淇淋：甜筒 / 冰棍 / 圣代（真模型）
    const iceGoods = [
      [-0.30, -0.16, 'iceCream'], [-0.08, -0.17, 'popsicle'],
      [0.14, -0.16, 'popsicleChocolate'], [0.30, -0.17, 'iceCream'],
      [-0.30, 0.15, 'iceCreamCup'], [-0.06, 0.16, 'iceCream'],
      [0.18, 0.15, 'popsicle'], [0.32, 0.16, 'sundae']
    ];
    iceGoods.forEach(function (it) {
      food(inside, it[2], fzX + it[0], 0.72, fzZ + it[1], SIZE[it[2]]);
    });
    // 柜子的冷光
    const fzl = new THREE.PointLight(0xbfe4ff, 0.3, 1.6, 2);
    fzl.position.set(fzX, 1.05, fzZ);
    inside.add(fzl);
    spots.icecream = { x: fzX, y: 0.82, z: fzZ };

    // 4) 门口的信箱（挂在外墙上）
    const mb = new THREE.Group();
    mb.position.set(26.65, 1.40, Z1 + 0.10);
    inside.add(mb);
    const mbMat = std(0xc0392b, 0.6);
    const mbBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 0.16), mbMat);
    mbBox.castShadow = true;
    mb.add(mbBox);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.02), std(0x2b2b2b, 0.8));
    slot.position.set(0, 0.06, 0.09);
    mb.add(slot);
    spots.mailbox = { x: 26.65, y: 1.40, z: Z1 + 0.10 };

    // 5) 商品常驻的几个位置（点它们拿东西）—— 全部对齐到货架上真模型的位置
    // 货架 A 中心 x 22.5，外侧那一面在 x 22.275；货架 B 中心 24.9，外侧 24.675
    // 层板高度 0.16 / 0.58 / 1.00 / 1.40，z 格子 = -0.9(中心) + [-1.15,-0.38,0.38,1.15]
    spots.shelfA = { x: 22.20, y: 1.11, z: -1.283 };    // 层 1.00 的第二格：鸡蛋
    spots.shelfA2 = { x: 22.20, y: 0.72, z: -0.517 };   // 层 0.58 的第三格：番茄
    spots.shelfB = { x: 24.60, y: 0.72, z: -1.283 };    // 层 0.58 的第二格：面包
    spots.shelfB2 = { x: 24.60, y: 1.12, z: -0.517 };   // 层 1.00 的第三格：泡面
    spots.fridge = { x: 20.88, y: 0.96, z: -1.225 };    // 冷柜 2 号门：牛奶
    spots.fridge2 = { x: 20.88, y: 0.96, z: 1.575 };    // 冷柜 4 号门：可乐
    spots.oden = { x: 27.06, y: 1.22, z: 0.85 };
    spots.hotcase = { x: 27.48, y: 0.42, z: -0.42 };    // 热食柜（之前 y 写高了，点不着）
    spots.counter = { x: 27.35, y: 1.25, z: 1.95 };

    // 再补几件"看得见的"（同一格多摆一点，让它像真的货）
    function featured() {
      // 鸡蛋旁边再放两颗（一盒鸡蛋不会只有一颗）
      food(inside, 'egg', 22.20, 1.0175, -1.36, SIZE.egg, -Math.PI / 2);
      food(inside, 'egg', 22.20, 1.0175, -1.20, SIZE.egg, -Math.PI / 2);
      // 番茄三颗
      food(inside, 'tomato', 22.20, 0.5975, -0.60, SIZE.tomato, -Math.PI / 2);
      food(inside, 'tomato', 22.20, 0.5975, -0.44, SIZE.tomato, -Math.PI / 2);
      // 面包旁边再来一根法棍
      food(inside, 'loafRound', 24.60, 0.5975, -1.15, SIZE.loafRound, Math.PI / 2);
      // 泡面旁边一个饭团
      food(inside, 'riceBall', 24.60, 1.0175, -0.74, SIZE.riceBall, Math.PI / 2);
      // 收银台上：一杯还冒热气的咖啡
      food(inside, 'mug', 27.10, 1.04, 1.72, SIZE.mug);
      // 后柜上摆一排关东煮的碗和盘子（微波炉旁边）
      food(inside, 'plate', 23.10, 1.545, -3.70, SIZE.plate);
      food(inside, 'cup', 23.34, 1.545, -3.66, SIZE.cup);
      food(inside, 'riceBall', 22.80, 1.545, -3.66, SIZE.riceBall);
    }
    featured();

    return spots;
  }

  /* ================= 走路碰撞 ================= */
  const OBST = [
    { x0: 20.0, x1: 21.00, z0: -3.40, z1: 2.20 },   // 冷柜墙
    { x0: 22.02, x1: 22.98, z0: -2.60, z1: 0.85 },  // 货架 A
    { x0: 24.42, x1: 25.38, z0: -2.60, z1: 0.85 },  // 货架 B
    { x0: 26.60, x1: 27.95, z0: -0.10, z1: 2.70 },  // 收银台
    { x0: 28.45, x1: 29.60, z0: 2.35, z1: 3.30 },   // 冰淇淋卧柜
    { x0: 20.0, x1: 29.60, z0: -4.00, z1: -3.20 }   // 后墙柜
  ];

  function insideObstacle(x, z, r) {
    return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  }

  function clamp(x, z, oldX, oldZ) {
    if (oldX === undefined) oldX = x;
    if (oldZ === undefined) oldZ = z;
    // 先收到店 + 门口的范围内
    x = Math.max(OUT.x0, Math.min(OUT.x1, x));
    z = Math.max(OUT.z0, Math.min(OUT.z1, z));

    // 门面：只在门洞那一段能穿过去
    const a = oldZ - Z1, b = z - Z1;
    if (a * b < 0) {
      const t2 = (Z1 - oldZ) / (z - oldZ);
      const xi = oldX + (x - oldX) * t2;
      if (!(xi > DOOR.x0 + 0.12 && xi < DOOR.x1 - 0.12)) z = oldZ;
    }

    // 挡住货架 / 收银台 / 冷柜
    for (let i = 0; i < OBST.length; i++) {
      const r = OBST[i];
      if (!insideObstacle(x, z, r)) continue;
      if (oldX <= r.x0) { x = r.x0 - 0.03; continue; }
      if (oldX >= r.x1) { x = r.x1 + 0.03; continue; }
      if (oldZ <= r.z0) { z = r.z0 - 0.03; continue; }
      if (oldZ >= r.z1) { z = r.z1 + 0.03; continue; }
      // 兜底：往最近的一边推
      const d = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
      const m = Math.min(d[0], d[1], d[2], d[3]);
      if (m === d[0]) x = r.x0 - 0.03;
      else if (m === d[1]) x = r.x1 + 0.03;
      else if (m === d[2]) z = r.z0 - 0.03;
      else z = r.z1 + 0.03;
    }
    return { x: x, z: z };
  }

  /* ================= 每帧：自动门 + 热气 ================= */
  /* M30：客人走到门口也要开门 —— 客人模块每帧把最近距离塞进来，这里用完就收回 */
  function setDoorProximity(d) {
    const v = (typeof d === 'number' && d >= 0) ? d : 99;
    if (v < doorCall) doorCall = v;
  }

  function update(dt, camPos) {
    t += dt;
    // 自动门：人走近就滑开
    if (doorL && doorR) {
      let near = 99;
      if (camPos) {
        const dx = camPos.x - (DOOR.x0 + DOOR.x1) / 2;
        const dz = camPos.z - Z1;
        near = Math.sqrt(dx * dx + dz * dz);
      }
      if (doorCall < near) near = doorCall;
      doorCall = 99;
      const wantOpen = near > 0 && near < 2.4;
      const target = wantOpen ? 1 : 0;
      doorOpen += (target - doorOpen) * Math.min(1, dt * 7);
      const slide = doorOpen * 0.60;
      doorL.position.x = (DOOR.x0 + DOOR.x1) / 2 - 0.335 - slide;
      doorR.position.x = (DOOR.x0 + DOOR.x1) / 2 + 0.335 + slide;
      if (wantOpen && !doorWasOpen) {
        doorWasOpen = true;
        if (refs && refs.sfx) {
          if (refs.sfx.chime) { try { refs.sfx.chime(); } catch (e) {} }
          if (refs.sfx.slide) { try { refs.sfx.slide(); } catch (e) {} }
        }
      } else if (!wantOpen && doorWasOpen && near > 2.8) {
        doorWasOpen = false;
      }
    }
    // 关东煮的热气
    for (let i = 0; i < steamSprites.length; i++) {
      const s = steamSprites[i];
      const u = s.userData;
      u.t += dt;
      if (u.t > u.life) u.t = 0;
      const k = u.t / u.life;
      s.position.y = u.base + 0.05 + k * 0.42;
      s.position.x = u.x0 + Math.sin(k * 5 + i) * 0.02;
      s.position.z = u.z0 + Math.cos(k * 4 + i) * 0.02;
      const sc = 0.08 + k * 0.14;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(k * Math.PI) * 0.30;
    }
  }

  /* ================= 总装 ================= */
  function build(sc, sfxModule) {
    scene = sc;
    root = new THREE.Group();
    root.name = 'store-m16';
    root.position.set(0, 0, 0);
    root.visible = false;

    inside = new THREE.Group();
    inside.name = 'store-inside';
    root.add(inside);
    outside = new THREE.Group();
    outside.name = 'store-outside';
    root.add(outside);

    shell();
    shelfRun(22.5, -2.6, 0.8, 'a');
    shelfRun(24.9, -2.6, 0.8, 'b');
    fridgeWall();
    counterArea();
    backWallStuff();
    storefront();
    outsideArea();
    decor();
    const spots = shopProps();

    // 店里的环境光（冷白，一点点）
    const amb = new THREE.AmbientLight(0xdfe8f4, 0.42);
    inside.add(amb);

    scene.add(root);

    refs = {
      sfx: sfxModule || null,
      spawnOutside: { x: (DOOR.x0 + DOOR.x1) / 2, y: 1.62, z: Z1 + 4.60, yaw: 0 },
      spawnInside: { x: (DOOR.x0 + DOOR.x1) / 2, y: 1.62, z: Z1 - 1.10, yaw: Math.PI },
      door: { x: (DOOR.x0 + DOOR.x1) / 2, z: Z1 }
    };

    return {
      root: root,
      setVisible: function (v) { root.visible = !!v; },
      isVisible: function () { return root.visible; },
      clamp: clamp,
      // M76：别的模块（打工的理货台）要往店里加一块实体时用这个，别直接改 OBST
      addObstacle: function (r) { if (r) OBST.push(r); },
      update: update,
      setDoorProximity: setDoorProximity,
      spawnOutside: refs.spawnOutside,
      spawnInside: refs.spawnInside,
      door: refs.door,
      spots: spots,
      BOUNDS: { X0: X0, X1: X1, Z0: Z0, Z1: Z1 },
      debug: function () {
        return { visible: root.visible, door: Math.round(doorOpen * 100) / 100 };
      }
    };
  }

  return { build: build };
})();
