/* ============================================================================
 * M47：鲸鱼街西侧的「鲸花屿」（FLOWER SHOP）
 *
 *   - 一进门是一排铁皮桶，四种花：玫瑰 / 向日葵 / 小雏菊 / 满天星（真扣零花钱）
 *   - 挑几枝 → 放到中间的花艺台上 → 「包起来」用牛皮纸 + 麻绳包成一束
 *   - 抱回家：餐桌上那个小花瓶里就有了花；点花瓶能换水，花会一直开到蔫
 *   - 花跟着天光走：白天张开、夜里合起来（像在睡觉）
 *   - 另外能点的：兔老板娘白露、窗台上打呼的猫、保鲜柜、吊着的干花、包装台上的剪刀和铜铃
 *   - 位置：世界坐标 x = 180 ~ 188、z = -3.2 ~ 3.2
 *     （咖啡馆 100~108、采耳馆 120~128、面包房 140~148、邮局 160~168，互相隔开）
 *   - 声音：sfx 的 snip / rustle / paper / bell / cash / splash / blip / cat
 * ==========================================================================*/
window.XD = window.XD || {};
XD.Flower = (function () {
  'use strict';

  const X0 = 180.0, X1 = 188.0;
  const Z0 = -3.2, Z1 = 3.2;
  const H = 3.05;

  const DOOR = { x0: 186.05, x1: 187.15, z: Z1 };
  const COUNTER = { x0: 181.0, x1: 186.3, z0: -3.08, z1: -2.46, h: 1.0 };
  const FRIDGE = { x0: 180.06, x1: 180.68, z0: -2.12, z1: -0.28, h: 2.28 };
  const TABLE = { x: 183.2, z: -0.2, w: 1.9, d: 1.2, h: 0.90 };
  const WIN = { x0: 180.7, x1: 185.7, y0: 0.94, y1: 3.0 };
  const BUCKET_X = 187.40;
  const BUCKET_Z = [-2.15, -1.30, -0.45, 0.40];
  const BUNNY = { x: 184.85, z: -1.55 };
  const CAT = { x: 182.35, z: 2.80 };
  const HOME = { x: 6.38, y: 0.865, z: 0.45 };   // 家里餐桌上小花瓶的瓶口

  const MAX_PICK = 5;

  /* 四种花：价格 / 花瓣色 / 花语 */
  const KINDS = [
    { k: 'rose', name: '玫瑰', price: 5, shape: 'rose',
      petal: 0xd9556b, petal2: 0xe98a97, center: 0xf3dcc0, leaf: 0x4f7a4a,
      lang: '「玫瑰」—— 有话想好好说的时候' },
    { k: 'sun', name: '向日葵', price: 6, shape: 'sun',
      petal: 0xf2b53c, petal2: 0xf7cf6a, center: 0x6f4a2c, leaf: 0x5b8a4a,
      lang: '「向日葵」—— 一直朝着有光的那一面' },
    { k: 'daisy', name: '小雏菊', price: 3, shape: 'daisy',
      petal: 0xfbf7ec, petal2: 0xe9e3d3, center: 0xf0c14e, leaf: 0x6d9a5a,
      lang: '「小雏菊」—— 小小的，开在路边也不太在乎' },
    { k: 'baby', name: '满天星', price: 4, shape: 'baby',
      petal: 0xf6f4ea, petal2: 0xdfe6ea, center: 0xf8f5ea, leaf: 0x7aa06a,
      lang: '「满天星」—— 一小把星星，撒在别的花中间' }
  ];
  function kindOf(k) {
    for (let i = 0; i < KINDS.length; i++) if (KINDS[i].k === k) return KINDS[i];
    return KINDS[0];
  }

  let root = null, homeG = null, scene = null, interact = null, sfx = null, tip = null;
  let isFlowerNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let walletOf = function () { return 0; };
  let spend = function () { return true; };
  let venueOf = function () { return 'home'; };

  let t = 0, cool = 0;
  const texList = [];      // M47.1：所有 canvas 贴图，建完就预热上传（不然第一次进门要卡一下）

  const fr = {
    amb: null, hemi: null, sun: null, warm: null, coolLight: null,
    bulbs: [], blooms: [], sway: [], petalsHome: [],
    shopBouquet: null, homeBouquet: null, paper: null, twine: null,
    bunny: null, bunnyEarL: null, bunnyEarR: null, bunnyEyes: [], bunnyBody: null,
    cat: null, catBody: null, catTail: null, catEyes: [],
    fridgeGlow: null, mist: null
  };

  const st = {
    picked: [],      // 花艺台上挑好的花（kind 数组）
    wrapped: false,  // 已经包好（还抱在手上）
    kinds: [],       // 家里花瓶里的花
    fresh: 0,        // 花期 1 → 0
    hasHome: false,  // 家里花瓶里已经有花了
    waterAt: 0,      // 上次换水的时间（秒）
    total: 0,        // 这一束花了多少钱
    bought: 0,
    lastKind: null
  };

  const SKEY = 'xd_flower_v1';

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  /* M47.1：材质按颜色缓存 —— 以前每一片花瓣、每一根茎都是**新材质**，
   * 于是既不能合并、又让每帧的材质切换翻好几倍。同色同参数的就该是一个材质。 */
  const matCache = {};
  function std(hex, rough, metal) {
    const key = hex + '|' + (rough === undefined ? 0.9 : rough) + '|' + (metal || 0);
    let m = matCache[key];
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: col(hex),
        roughness: rough === undefined ? 0.9 : rough,
        metalness: metal || 0
      });
      matCache[key] = m;
    }
    return m;
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
    texList.push(tex);
    return tex;
  }
  function say(x, y, z, text, sec) {
    if (interact && interact.say) interact.say(new THREE.Vector3(x, y, z), text, sec || 3.6);
  }
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ================= 一朵花 =================
   * M47.1：花瓣数砍了一半 —— 一站远根本看不出区别，但花店原来 818 个物件/帧，
   * 砍完掉到 300 多，帧率才回得来（妈妈：进花店一闪一闪还卡）。
   */
  function makeBloom(kind, scale, parent) {
    const K = kindOf(kind);
    const g = new THREE.Group();
    const s = scale || 1;
    const p1 = std(K.petal, 0.86);
    const p2 = std(K.petal2, 0.9);
    const cm = std(K.center, 0.8);

    if (K.shape === 'rose') {
      for (let ring = 0; ring < 2; ring++) {
        const n = ring ? 5 : 4;
        const rad = ring ? 0.040 : 0.024;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.42;
          const pet = sph(0.032 * s, 8, ring ? p1 : p2, Math.cos(a) * rad * s, Math.sin(a) * rad * s, ring * 0.008 * s, g);
          pet.scale.set(1.0, 0.72, 0.52);
          pet.rotation.z = a;
          pet.castShadow = false;
        }
      }
      sph(0.018 * s, 8, cm, 0, 0, 0.016 * s, g).castShadow = false;
    } else if (K.shape === 'sun') {
      sph(0.034 * s, 10, cm, 0, 0, 0.006 * s, g).scale.set(1, 1, 0.6);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const pet = sph(0.028 * s, 8, i % 2 ? p1 : p2, Math.cos(a) * 0.052 * s, Math.sin(a) * 0.052 * s, 0, g);
        pet.scale.set(1.5, 0.34, 0.5);
        pet.rotation.z = a;
        pet.castShadow = false;
      }
    } else if (K.shape === 'daisy') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pet = sph(0.026 * s, 8, p1, Math.cos(a) * 0.036 * s, Math.sin(a) * 0.036 * s, 0, g);
        pet.scale.set(1.7, 0.32, 0.5);
        pet.rotation.z = a;
        pet.castShadow = false;
      }
      sph(0.016 * s, 8, cm, 0, 0, 0.01 * s, g).scale.set(1, 1, 0.6);
    } else {
      // 满天星：一小簇碎碎的白
      for (let i = 0; i < 6; i++) {
        const a = i * 2.4, r = 0.012 + (i % 3) * 0.014;
        const b = sph(0.013 * s, 6, i % 2 ? p1 : p2,
          Math.cos(a) * r * s, Math.sin(a) * r * s, (i % 4) * 0.009 * s, g);
        b.castShadow = false;
      }
    }
    (parent || root).add(g);
    return g;
  }

  /* 一小段茎 + 两片叶子 */
  function makeStem(len, mat, leafMat, parent) {
    const g = new THREE.Group();
    cyl(0.0055, 0.0065, len, 6, mat, 0, len / 2, 0, g);
    for (let i = 0; i < 2; i++) {
      const a = i ? 2.1 : -0.8;
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5), leafMat);
      lf.position.set(Math.cos(a) * 0.035, len * (i ? 0.52 : 0.34), Math.sin(a) * 0.03);
      lf.scale.set(1.7, 0.22, 0.6);
      lf.rotation.z = a * 0.6;
      lf.castShadow = false;
      g.add(lf);
    }
    (parent || root).add(g);
    return g;
  }

  /* ================= 一束花 =================
   * baseY：花茎从哪起（桌面上 / 瓶口里）
   * len：茎长
   * 返回 { g, blooms } —— blooms 用来做白天张 / 夜里合
   */
  function makeBouquet(kinds, opt) {
    const o = opt || {};
    const baseY = o.baseY || 0;
    const len = o.len || 0.34;
    const scale = o.scale || 1;
    const g = new THREE.Group();
    g.position.set(o.x || 0, baseY, o.z || 0);
    const blooms = [];
    const stemMat = std(0x6f9a5a, 0.85);
    const leafMat = std(0x54804a, 0.9);
    const n = kinds.length;

    for (let i = 0; i < n; i++) {
      const K = kindOf(kinds[i]);
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.7;
      const tilt = 0.13 + (i % 3) * 0.05;
      const hg = new THREE.Group();
      hg.rotation.z = Math.cos(a) * tilt;
      hg.rotation.x = Math.sin(a) * tilt;
      g.add(hg);
      makeStem(len * (0.9 + (i % 2) * 0.16), stemMat, leafMat, hg);
      const bl = makeBloom(K.k, scale, hg);
      bl.position.set(0, len * (0.9 + (i % 2) * 0.16) + 0.012, 0);
      blooms.push(bl);
    }
    (o.parent || root).add(g);
    return { g: g, blooms: blooms };
  }

  /* 牛皮纸包 + 麻绳 + 小卡片（包好之后加在花束上） */
  function makeWrap(parent) {
    const g = new THREE.Group();
    const kraft = std(0xbf9a68, 0.95);
    kraft.side = THREE.DoubleSide;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.14, 0.28, 12, 1, true), kraft);
    cone.position.y = 0.14;
    cone.castShadow = true;
    g.add(cone);
    // 纸口剪出的两个尖角（低模，两片三角用薄盒子代替）
    const tipMat = std(0xcdaa78, 0.95);
    [-0.05, 0.05].forEach(function (dx) {
      const tp = box(0.035, 0.09, 0.01, tipMat, dx, 0.32, 0.05, g);
      tp.rotation.z = dx > 0 ? -0.26 : 0.26;
      tp.rotation.x = -0.14;
    });
    // 麻绳两道 + 一个小蝴蝶结
    const twine = std(0xa88c62, 0.95);
    [0.12, 0.19].forEach(function (y) {
      const r = 0.14 - (y - 0.02) * 0.2;
      const tor = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 6, 16), twine);
      tor.position.y = y;
      tor.rotation.x = Math.PI / 2;
      tor.castShadow = false;
      g.add(tor);
    });
    const knot = sph(0.016, 6, twine, 0, 0.12, 0.142, g);
    knot.castShadow = false;
    [-1, 1].forEach(function (s) {
      const bow = sph(0.024, 6, twine, s * 0.03, 0.134, 0.138, g);
      bow.scale.set(1.2, 0.8, 0.4);
      bow.castShadow = false;
    });
    // 小卡片：写着「给妈妈」
    const cardTex = canvasTex(160, 110, function (c, W, Hh) {
      c.fillStyle = '#fbf5e6'; c.fillRect(0, 0, W, Hh);
      c.strokeStyle = '#d9c9a8'; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, Hh - 8);
      c.fillStyle = '#7a5f43';
      c.font = 'bold 30px "Microsoft YaHei", sans-serif';
      c.textAlign = 'center';
      c.fillText('给妈妈', W / 2, 48);
      c.fillStyle = '#c9748a';
      c.font = '18px "Microsoft YaHei", sans-serif';
      c.fillText('小D', W / 2, 78);
    });
    const cm = new THREE.MeshBasicMaterial({ map: cardTex, toneMapped: false, side: THREE.DoubleSide });
    const card = plane(0.085, 0.058, cm, 0.02, 0.155, 0.145, g);
    card.rotation.y = 0.12;
    card.castShadow = false;
    (parent || root).add(g);
    return g;
  }

  /* ================= 房间 ================= */
  function buildRoom() {
    const wallMat = std(0xf0e7d6, 0.95);
    const trim = std(0x7a8f6a, 0.9);          // 豆绿
    const wood = std(0xb99a72, 0.92);

    // 地板：深一点的暖木条
    const floorTex = canvasTex(512, 512, function (g, W, Hh) {
      g.fillStyle = '#a8845c';
      g.fillRect(0, 0, W, Hh);
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const y = r * Hh / rows;
        const v = 112 + ((r * 27) % 16);
        g.fillStyle = 'rgb(' + v + ',' + (v - 30) + ',' + (v - 56) + ')';
        g.fillRect(0, y + 1, W, Hh / rows - 2);
        for (let i = 0; i < 110; i++) {
          g.fillStyle = 'rgba(52,34,18,' + (0.04 + Math.random() * 0.08) + ')';
          g.fillRect(Math.random() * W, y + Math.random() * (Hh / rows), 20 + Math.random() * 60, 1);
        }
        g.fillStyle = 'rgba(44,28,14,.6)';
        g.fillRect(0, y, W, 2);
        // 板缝错开
        const off = (r % 2) * W / 3;
        for (let k = 0; k < 3; k++) {
          g.fillRect((off + k * W / 2 + 40) % W, y, 2, Hh / rows);
        }
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3.4, 2.8);
    const floor = box(X1 - X0, 0.08, Z1 - Z0,
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.88 }),
      (X0 + X1) / 2, 0.04, (Z0 + Z1) / 2);
    floor.receiveShadow = true;

    // 三面墙 + 天花板
    box(X1 - X0, H, 0.12, wallMat, (X0 + X1) / 2, H / 2, Z0 - 0.06);
    box(0.12, H, Z1 - Z0, wallMat, X0 - 0.06, H / 2, (Z0 + Z1) / 2);
    box(0.12, H, Z1 - Z0, wallMat, X1 + 0.06, H / 2, (Z0 + Z1) / 2);
    box(X1 - X0, 0.1, Z1 - Z0, std(0xf7f0e2, 0.95), (X0 + X1) / 2, H, (Z0 + Z1) / 2);
    // 踢脚线
    box(X1 - X0, 0.14, 0.06, trim, (X0 + X1) / 2, 0.07, Z0 + 0.03);
    box(0.06, 0.14, Z1 - Z0, trim, X0 + 0.03, 0.07, (Z0 + Z1) / 2);
    box(0.06, 0.14, Z1 - Z0, trim, X1 - 0.03, 0.07, (Z0 + Z1) / 2);

    // 墙裙：下半截刷一层浅豆绿 + 一道木压条（花店的老做法）
    const wains = std(0xd6ddc6, 0.95);
    box(X1 - X0, 1.08, 0.02, wains, (X0 + X1) / 2, 0.56, Z0 + 0.02);
    box(0.02, 1.08, Z1 - Z0, wains, X0 + 0.02, 0.56, (Z0 + Z1) / 2);
    box(0.02, 1.08, Z1 - Z0, wains, X1 - 0.02, 0.56, (Z0 + Z1) / 2);
    box(X1 - X0, 0.05, 0.05, wood, (X0 + X1) / 2, 1.1, Z0 + 0.04);
    box(0.05, 0.05, Z1 - Z0, wood, X0 + 0.04, 1.1, (Z0 + Z1) / 2);
    box(0.05, 0.05, Z1 - Z0, wood, X1 - 0.04, 1.1, (Z0 + Z1) / 2);

    /* 前墙：大橱窗 + 门 */
    const zf = Z1;
    box(WIN.x0 - X0, H, 0.12, wallMat, (X0 + WIN.x0) / 2, H / 2, zf - 0.06);
    box(WIN.x1 - WIN.x0, WIN.y0, 0.12, wallMat, (WIN.x0 + WIN.x1) / 2, WIN.y0 / 2, zf - 0.06);
    box(WIN.x1 - WIN.x0, H - WIN.y1, 0.12, wallMat, (WIN.x0 + WIN.x1) / 2, (H + WIN.y1) / 2, zf - 0.06);
    box(DOOR.x0 - WIN.x1, H, 0.12, wallMat, (WIN.x1 + DOOR.x0) / 2, H / 2, zf - 0.06);
    box(X1 - DOOR.x1, H, 0.12, wallMat, (DOOR.x1 + X1) / 2, H / 2, zf - 0.06);
    box(DOOR.x1 - DOOR.x0, H - 2.4, 0.12, wallMat, (DOOR.x0 + DOOR.x1) / 2, (H + 2.4) / 2, zf - 0.06);

    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xcfe2d8), transparent: true, opacity: 0.26, roughness: 0.08, metalness: 0.06
    });
    box(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, 0.05, glassMat,
      (WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, zf - 0.02).castShadow = false;
    // 窗框
    box(WIN.x1 - WIN.x0 + 0.12, 0.09, 0.14, wood, (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.02, zf - 0.02);
    box(WIN.x1 - WIN.x0 + 0.12, 0.09, 0.14, wood, (WIN.x0 + WIN.x1) / 2, WIN.y1 + 0.02, zf - 0.02);
    [WIN.x0, WIN.x0 + 1.25, WIN.x0 + 2.5, WIN.x0 + 3.75, WIN.x1].forEach(function (fx) {
      box(0.08, WIN.y1 - WIN.y0, 0.13, wood, fx, (WIN.y0 + WIN.y1) / 2, zf - 0.02);
    });
    // 窗台（猫就睡在这上面）
    box(WIN.x1 - WIN.x0 + 0.3, 0.09, 0.34, std(0xe3d7c0, 0.9), (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.05, zf - 0.22);
    // 窗外的亮片（M47：必须是双面 + 跟昼夜换色，不然从屋里看是一片夜空的黑）
    const outMat = new THREE.MeshBasicMaterial({ color: 0xe6f0e4, side: THREE.DoubleSide });
    outMat.toneMapped = false;
    plane(WIN.x1 - WIN.x0 + 1.4, 2.9, outMat, (WIN.x0 + WIN.x1) / 2, 2.05, zf + 0.55).castShadow = false;
    fr.outMat = outMat;
    // 窗外远处一条街的暖灯（夜里有点人气）
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    lampMat.toneMapped = false;
    [-1.4, 0.6, 2.0].forEach(function (dx) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lampMat);
      d.position.set((WIN.x0 + WIN.x1) / 2 + dx, 1.9, zf + 0.5);
      root.add(d);
    });
    fr.outLamps = lampMat;

    /* 门：木框 + 玻璃 + 黄铜把手 */
    const dfr = std(0x8a6a48, 0.85);
    const dz = zf - 0.08;
    box(DOOR.x1 - DOOR.x0 + 0.2, 0.12, 0.14, dfr, (DOOR.x0 + DOOR.x1) / 2, 2.4, dz);
    box(DOOR.x1 - DOOR.x0 + 0.2, 0.1, 0.14, dfr, (DOOR.x0 + DOOR.x1) / 2, 0.06, dz);
    box(0.1, 2.36, 0.14, dfr, DOOR.x0 - 0.05, 1.2, dz);
    box(0.1, 2.36, 0.14, dfr, DOOR.x1 + 0.05, 1.2, dz);
    const doorGlass = new THREE.MeshStandardMaterial({
      color: col(0xe8dfc8), transparent: true, opacity: 0.55, roughness: 0.5,
      emissive: col(0xffe2b0), emissiveIntensity: 0.12, side: THREE.DoubleSide
    });
    box(DOOR.x1 - DOOR.x0 - 0.08, 2.22, 0.05, doorGlass, (DOOR.x0 + DOOR.x1) / 2, 1.16, zf - 0.03).castShadow = false;
    fr.doorGlass = doorGlass;
    // 门玻璃上的两道横档（不然整块奶油色像一块板）
    const muntin = std(0x8a6a48, 0.85);
    [0.72, 1.62].forEach(function (y) {
      box(DOOR.x1 - DOOR.x0 - 0.08, 0.035, 0.05, muntin, (DOOR.x0 + DOOR.x1) / 2, y, zf - 0.055).castShadow = false;
    });
    box(0.055, 0.4, 0.055, std(0xc9a86a, 0.35, 0.7), DOOR.x1 - 0.13, 1.1, zf - 0.14);

    // 门上的招贴：「现剪 · 现包」
    const doorSign = canvasTex(256, 110, function (g, W, Hh) {
      g.fillStyle = '#fbf3e2';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#7a8f6a'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, Hh - 12);
      g.fillStyle = '#5c7a52';
      g.font = 'bold 34px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('鲸 花 屿', W / 2, 46);
      g.font = '16px "Microsoft YaHei", sans-serif';
      g.fillStyle = '#9a8a70';
      g.fillText('现剪 · 现包 · 带回家插瓶', W / 2, 78);
      g.fillStyle = '#d98a9a';
      g.fillRect(46, 88, W - 92, 4);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: doorSign, toneMapped: false });
    plane(1.0, 0.44, signMat, (DOOR.x0 + DOOR.x1) / 2, 2.72, zf - 0.14).castShadow = false;

    // 门玻璃上挂一块「营业中」的小吊牌
    const openTex = canvasTex(160, 110, function (g, W, Hh) {
      g.fillStyle = '#fbf7ee'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9a86a'; g.lineWidth = 5; g.strokeRect(5, 5, W - 10, Hh - 10);
      g.fillStyle = '#5c7a52';
      g.font = 'bold 28px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('营 业 中', W / 2, 52);
      g.fillStyle = '#9a8a70';
      g.font = '16px "Microsoft YaHei", sans-serif';
      g.fillText('OPEN', W / 2, 80);
      g.fillStyle = '#b3766a';
      g.fillRect(24, 60, W - 48, 3);
    });
    const om = new THREE.MeshBasicMaterial({ map: openTex, toneMapped: false, side: THREE.DoubleSide });
    cyl(0.002, 0.002, 0.14, 4, std(0x9a8a70, 0.9), (DOOR.x0 + DOOR.x1) / 2, 1.68, zf - 0.09).castShadow = false;
    const hang = plane(0.2, 0.14, om, (DOOR.x0 + DOOR.x1) / 2, 1.55, zf - 0.09).castShadow = false;
    fr.openSign = hang;

    // 门口地垫
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), std(0x8f7a62, 0.95));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set((DOOR.x0 + DOOR.x1) / 2, 0.085, zf - 0.45);
    root.add(mat);

    // 圆地毯（花艺台下面）
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), std(0xd8c6a8, 0.98));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(TABLE.x, 0.086, TABLE.z);
    rug.receiveShadow = true;
    root.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.14, 32), std(0xe2d3b8, 0.98));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(TABLE.x, 0.088, TABLE.z);
    rug2.receiveShadow = true;
    root.add(rug2);
  }

  /* ================= 后面的包装台 ================= */
  function buildCounter() {
    const wood = std(0xa5814f, 0.9);
    const top = std(0xc9a877, 0.82);
    const w = COUNTER.x1 - COUNTER.x0, d = COUNTER.z1 - COUNTER.z0;
    const cx = (COUNTER.x0 + COUNTER.x1) / 2, cz = (COUNTER.z0 + COUNTER.z1) / 2;

    box(w, COUNTER.h - 0.06, d, wood, cx, (COUNTER.h - 0.06) / 2, cz);
    box(w + 0.08, 0.07, d + 0.1, top, cx, COUNTER.h - 0.02, cz);
    // 台前的竖木条（像老花店那种）
    for (let i = 0; i < 9; i++) {
      box(0.05, 0.74, 0.03, std(0x8d6b42, 0.9), COUNTER.x0 + 0.35 + i * 0.62, 0.47, cz + d / 2 + 0.01).castShadow = false;
    }
    // 台下两个抽屉 + 铜拉手
    [-1, 1].forEach(function (s) {
      const dx = cx + s * 1.35;
      box(1.0, 0.2, 0.04, std(0x9a7749, 0.9), dx, 0.78, cz + d / 2 + 0.03).castShadow = false;
      box(0.14, 0.02, 0.03, std(0xc9a86a, 0.4, 0.7), dx, 0.78, cz + d / 2 + 0.06).castShadow = false;
    });

    const ty = COUNTER.h + 0.03;   // 台面上表面 ~1.03

    // ① 牛皮纸卷（横着躺）
    const kraft = std(0xc7a374, 0.95);
    const roll = cyl(0.085, 0.085, 0.72, 14, kraft, 181.85, ty + 0.085, -2.78);
    roll.rotation.z = Math.PI / 2;
    box(0.04, 0.17, 0.17, std(0xb08f5e, 0.95), 181.49, ty + 0.085, -2.78).castShadow = false;
    box(0.04, 0.17, 0.17, std(0xb08f5e, 0.95), 182.21, ty + 0.085, -2.78).castShadow = false;
    // ② 麻绳球
    const tw = sph(0.062, 12, std(0xb59a6c, 0.95), 182.95, ty + 0.062, -2.80);
    tw.scale.set(1, 0.9, 1);
    // ③ 剪刀（两片交叉 + 两个环）
    const metal = std(0xd4d8dc, 0.22, 0.88);
    const sc = new THREE.Group();
    sc.position.set(183.62, ty + 0.022, -2.74);
    sc.rotation.y = 0.5;
    root.add(sc);
    [-1, 1].forEach(function (s) {
      const bl = box(0.24, 0.008, 0.03, metal, s * 0.09, 0.008, s * 0.010, sc);
      bl.rotation.y = s * 0.055;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.009, 6, 14), std(0xa9604b, 0.7));
      ring.position.set(-s * 0.10, 0.006, s * 0.046);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
      sc.add(ring);
    });
    sph(0.011, 8, metal, 0, 0.012, 0, sc).castShadow = false;
    // ④ 一叠小卡片
    for (let i = 0; i < 5; i++) {
      const c = box(0.13, 0.006, 0.09, std(0xfbf5e6, 0.9), 184.35, ty + 0.006 + i * 0.007, -2.80);
      c.rotation.y = 0.04 * i;
      c.castShadow = false;
    }
    // ⑤ 柜台铜铃
    const bellMat = std(0xc9a86a, 0.3, 0.75);
    cyl(0.052, 0.056, 0.02, 14, bellMat, 185.55, ty + 0.01, -2.72);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
    dome.position.set(185.55, ty + 0.02, -2.72);
    dome.castShadow = true;
    root.add(dome);
    sph(0.013, 8, bellMat, 185.55, ty + 0.085, -2.72);
    // ⑥ 一盆小绿植（台上角）
    cyl(0.075, 0.06, 0.11, 12, std(0xc08a6a, 0.9), 180.72 + 0.9, ty + 0.055, -2.78);
    for (let i = 0; i < 4; i++) {
      const lf = sph(0.06, 7, std(0x5f8a52, 0.9), 181.62 + Math.cos(i * 1.7) * 0.05, ty + 0.14, -2.78 + Math.sin(i * 1.7) * 0.05);
      lf.scale.set(1.3, 0.5, 0.8);
      lf.castShadow = false;
    }
  }

  /* ================= 保鲜柜（左墙） ================= */
  /* M47.1：第一版是个实心白箱子 —— 玻璃后面全是壳，一朵花也看不见。
   * 现在只做"框"（背板 + 两块侧板 + 顶 + 底），前面留空，花才看得见。 */
  function buildFridge() {
    const shell = std(0xe9eeea, 0.62, 0.12);
    const inner = std(0xdfe8e4, 0.9);
    const w = FRIDGE.x1 - FRIDGE.x0, d = FRIDGE.z1 - FRIDGE.z0;
    const cx = (FRIDGE.x0 + FRIDGE.x1) / 2, cz = (FRIDGE.z0 + FRIDGE.z1) / 2;
    const h = FRIDGE.h;
    const t = 0.06;

    // 背板（贴墙）
    box(t, h, d, shell, FRIDGE.x0 + t / 2, h / 2, cz);
    // 两块侧板
    box(w, h, t, shell, cx, h / 2, FRIDGE.z0 + t / 2);
    box(w, h, t, shell, cx, h / 2, FRIDGE.z1 - t / 2);
    // 顶 / 底
    box(w, t, d, shell, cx, h - t / 2, cz);
    box(w, t, d, shell, cx, t / 2, cz);
    // 内胆侧壁（白一点，显得里面是冷的）
    box(0.01, h - 0.24, d - 0.2, inner, FRIDGE.x0 + t + 0.005, h / 2, cz).castShadow = false;

    // 玻璃门（往前挪一点，别跟框打架）
    const glass = new THREE.MeshStandardMaterial({
      color: col(0xdff1f2), transparent: true, opacity: 0.16,
      roughness: 0.04, metalness: 0.12, side: THREE.DoubleSide
    });
    box(0.02, h - 0.16, d - 0.08, glass, FRIDGE.x1 - 0.03, h / 2, cz).castShadow = false;
    // 门框四边
    const frame = std(0xb9c4bd, 0.45, 0.5);
    box(0.05, 0.05, d - 0.04, frame, FRIDGE.x1 - 0.02, 0.12, cz);
    box(0.05, 0.05, d - 0.04, frame, FRIDGE.x1 - 0.02, h - 0.1, cz);
    box(0.05, h - 0.18, 0.05, frame, FRIDGE.x1 - 0.02, h / 2, FRIDGE.z0 + 0.06);
    box(0.05, h - 0.18, 0.05, frame, FRIDGE.x1 - 0.02, h / 2, FRIDGE.z1 - 0.06);
    // 竖把手
    const hb = cyl(0.013, 0.013, 0.62, 8, std(0x9aa5a0, 0.32, 0.75), FRIDGE.x1 + 0.05, 1.25, cz + d / 2 - 0.14);
    [-1, 1].forEach(function (s) {
      box(0.05, 0.02, 0.09, std(0x9aa5a0, 0.32, 0.75), FRIDGE.x1 + 0.025, 1.25 + s * 0.28, cz + d / 2 - 0.14).castShadow = false;
    });

    // 里面的三层玻璃架 + 一小把一小把的花
    const shelfMat = new THREE.MeshStandardMaterial({
      color: col(0xe9f4f4), roughness: 0.2, metalness: 0.25,
      transparent: true, opacity: 0.5
    });
    [0.60, 1.22, 1.84].forEach(function (y, si) {
      box(w - 0.16, 0.02, d - 0.2, shelfMat, cx + 0.03, y, cz).castShadow = false;
      for (let i = 0; i < 3; i++) {
        const z = FRIDGE.z0 + 0.36 + i * 0.58;
        const kk = KINDS[(si + i) % KINDS.length].k;
        // 玻璃瓶 + 一枝花（M47.1：原来两枝，砍成一枝，远看一样）
        cyl(0.05, 0.045, 0.16, 10, shelfMat, cx + 0.02, y + 0.09, z, root).castShadow = false;
        const bg = makeBloom(kk, 0.9, root);
        bg.position.set(cx + 0.02, y + 0.22, z);
        bg.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
        cyl(0.0045, 0.005, 0.12, 5, std(0x6f9a5a, 0.85), cx + 0.02, y + 0.15, z, root).castShadow = false;
      }
    });
    // 柜子里的冷光条（顶上一根 + 每层背面一根）
    const stripMat = new THREE.MeshStandardMaterial({
      color: col(0xdff6ff), emissive: col(0xa8e0f0), emissiveIntensity: 0.9, roughness: 0.6
    });
    box(0.04, 0.025, d - 0.24, stripMat, FRIDGE.x0 + 0.1, h - 0.13, cz).castShadow = false;
    [0.60, 1.22].forEach(function (y) {
      box(0.03, 0.02, d - 0.24, stripMat, FRIDGE.x0 + 0.1, y + 0.02, cz).castShadow = false;
    });
    fr.fridgeGlow = stripMat;
    // 柜子里的冷光（夜里才开着）
    const cl = new THREE.PointLight(0xbfe6f2, 0.5, 2.6, 2);
    cl.position.set(FRIDGE.x1 - 0.2, 1.5, cz);
    root.add(cl);
    fr.coolLight = cl;

    // 柜顶挂牌「保鲜柜 · 4℃」
    const lb = canvasTex(256, 80, function (g, W, Hh) {
      g.fillStyle = '#eef4f2'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#9fb3ac'; g.lineWidth = 4; g.strokeRect(4, 4, W - 8, Hh - 8);
      g.fillStyle = '#5c7a70';
      g.font = 'bold 26px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('保鲜柜 · 4℃', W / 2, 36);
      g.font = '14px "Microsoft YaHei", sans-serif';
      g.fillStyle = '#8fa39c';
      g.fillText('花也怕热', W / 2, 62);
    });
    const lm = new THREE.MeshBasicMaterial({ map: lb, toneMapped: false, side: THREE.DoubleSide });
    // 挂在柜子正面上沿（朝着屋里）
    plane(0.66, 0.21, lm, FRIDGE.x1 + 0.04, h - 0.02, cz, root, Math.PI / 2).castShadow = false;

    // 柜脚
    [-1, 1].forEach(function (s) {
      box(0.06, 0.1, 0.06, std(0x8d948f, 0.7, 0.3), FRIDGE.x1 - 0.12, 0.05, cz + s * (d / 2 - 0.14));
    });
    // 柜边地上的一个水桶（花店到处是桶）
    const bkt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.36, 14, 1, true), std(0xb9bcc0, 0.45, 0.5));
    bkt.position.set(FRIDGE.x1 + 0.36, 0.18, FRIDGE.z1 + 0.42);
    bkt.material.side = THREE.DoubleSide;
    bkt.castShadow = true;
    root.add(bkt);
  }

  /* ================= 四个铁皮桶 + 桶里的花 ================= */
  function buildBuckets() {
    const steel = std(0xb9bcc0, 0.42, 0.55);
    const steelIn = std(0x8f948f, 0.55, 0.4);
    const waterMat = new THREE.MeshStandardMaterial({
      color: col(0x8fb3a8), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75
    });

    KINDS.forEach(function (K, i) {
      const z = BUCKET_Z[i];
      const bg = new THREE.Group();
      bg.position.set(BUCKET_X, 0, z);
      root.add(bg);

      // 桶身（上大下小的开口圆柱）
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.50, 16, 1, true), steel);
      body.position.y = 0.25;
      body.material.side = THREE.DoubleSide;
      body.castShadow = true;
      body.receiveShadow = true;
      bg.add(body);
      // 桶底 + 桶口卷边
      cyl(0.16, 0.16, 0.02, 16, steelIn, 0, 0.01, 0, bg);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.012, 6, 20), steel);
      rim.position.y = 0.50;
      rim.rotation.x = Math.PI / 2;
      rim.castShadow = false;
      bg.add(rim);
      // 两道箍
      [0.17, 0.37].forEach(function (y) {
        const r = 0.16 + (y / 0.50) * 0.05;
        const hb = new THREE.Mesh(new THREE.TorusGeometry(r + 0.002, 0.008, 5, 20), std(0xa7abb0, 0.5, 0.5));
        hb.position.y = y;
        hb.rotation.x = Math.PI / 2;
        hb.castShadow = false;
        bg.add(hb);
      });
      // 水面
      cyl(0.20, 0.20, 0.01, 16, waterMat, 0, 0.455, 0, bg).castShadow = false;

      // 桶里插着一大把（6 枝，长短错开，看着才像卖花的那一桶）
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + i * 0.7;
        const rr = 0.045 + (j % 3) * 0.026;
        const tilt = 0.12 + (j % 4) * 0.055;
        const hg = new THREE.Group();
        hg.position.set(Math.cos(a) * rr, 0.44, Math.sin(a) * rr);
        hg.rotation.z = Math.cos(a) * tilt;
        hg.rotation.x = Math.sin(a) * tilt;
        bg.add(hg);
        const len = 0.30 + (j % 5) * 0.05;
        cyl(0.0045, 0.0055, len, 6, std(0x6f9a5a, 0.85), 0, len / 2, 0, hg);
        const bl = makeBloom(K.k, 1.0, hg);
        bl.position.set(0, len + 0.01, 0);
        bl.rotation.y = j * 0.9;
        fr.sway.push({ o: hg, x0: hg.rotation.x, z0: hg.rotation.z, ph: i * 1.3 + j * 0.7 });
      }
      // 桶里再插两枝绿叶（撑一撑）
      [0.8, 3.6].forEach(function (a) {
        const hg = new THREE.Group();
        hg.position.set(Math.cos(a) * 0.06, 0.44, Math.sin(a) * 0.06);
        hg.rotation.z = Math.cos(a) * 0.22;
        bg.add(hg);
        cyl(0.004, 0.005, 0.40, 5, std(0x54804a, 0.9), 0, 0.20, 0, hg);
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), std(0x54804a, 0.92));
        lf.position.set(0, 0.40, 0);
        lf.scale.set(1.6, 0.26, 0.7);
        lf.castShadow = false;
        hg.add(lf);
      });
    });

    // 靠墙再放两个空桶（叠着的）
    [1.15, 1.55].forEach(function (z) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.15, 0.42, 14, 1, true), steel);
      b.position.set(BUCKET_X - 0.02, 0.21, z);
      b.material.side = THREE.DoubleSide;
      b.castShadow = true;
      root.add(b);
    });
  }

  /* ================= 中间的花艺台 + 台上那束花 ================= */
  function buildTable() {
    const wood = std(0xa5814f, 0.9);
    const topMat = std(0xd3b184, 0.8);
    const w = TABLE.w, d = TABLE.d, h = TABLE.h;

    box(w, 0.07, d, topMat, TABLE.x, h - 0.035, TABLE.z);
    // 台面一圈木边
    box(w + 0.06, 0.03, d + 0.06, wood, TABLE.x, h - 0.075, TABLE.z);
    // 四条腿
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      box(0.07, h - 0.08, 0.07, wood, TABLE.x + p[0] * (w / 2 - 0.1), (h - 0.08) / 2, TABLE.z + p[1] * (d / 2 - 0.1));
    });
    // 下层搁板（放花肥 / 水瓶）
    box(w - 0.24, 0.04, d - 0.24, std(0x9a7749, 0.9), TABLE.x, 0.24, TABLE.z);
    cyl(0.05, 0.05, 0.24, 10, std(0xcfa07a, 0.85), TABLE.x - 0.55, 0.38, TABLE.z - 0.1);
    box(0.16, 0.18, 0.1, std(0xe8dcc0, 0.9), TABLE.x + 0.5, 0.35, TABLE.z + 0.15);
    box(0.18, 0.14, 0.12, std(0x9fb79a, 0.9), TABLE.x + 0.72, 0.33, TABLE.z - 0.18);

    // 台面上：一块小垫布（亚麻色，边上缝一道）
    const cloth = box(0.9, 0.006, 0.62, std(0xe4d7bd, 0.98), TABLE.x, h + 0.004, TABLE.z);
    cloth.castShadow = false;
    const hem = box(0.9, 0.008, 0.05, std(0xd2c2a4, 0.98), TABLE.x, h + 0.005, TABLE.z + 0.285);
    hem.castShadow = false;
    const hem2 = box(0.9, 0.008, 0.05, std(0xd2c2a4, 0.98), TABLE.x, h + 0.005, TABLE.z - 0.285);
    hem2.castShadow = false;

    // 台上那束花（还没包）—— 等妈妈挑花，一枝一枝多起来
    fr.shopBouquet = new THREE.Group();
    fr.shopBouquet.position.set(TABLE.x, h, TABLE.z);
    root.add(fr.shopBouquet);

    // 台角一个小铜牌「花艺台 · 挑好了就包起来」
    const lb = canvasTex(256, 128, function (g, W, Hh) {
      g.fillStyle = '#fbf6e9'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9a86a'; g.lineWidth = 5; g.strokeRect(5, 5, W - 10, Hh - 10);
      g.fillStyle = '#7a6446';
      g.font = 'bold 28px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('花 艺 台', W / 2, 46);
      g.font = '16px "Microsoft YaHei", sans-serif';
      g.fillStyle = '#a08a68';
      g.fillText('挑好了就包起来', W / 2, 76);
      g.fillText('（包好抱回家插瓶）', W / 2, 100);
    });
    const lm = new THREE.MeshBasicMaterial({ map: lb, toneMapped: false, side: THREE.DoubleSide });
    const sg = plane(0.3, 0.15, lm, TABLE.x + 0.72, h + 0.08, TABLE.z + 0.44);
    sg.rotation.x = -0.5;
    sg.castShadow = false;
    // 牌子的两个小支架
    box(0.01, 0.08, 0.01, std(0xb08f5e, 0.9), TABLE.x + 0.60, h + 0.04, TABLE.z + 0.46).castShadow = false;
    box(0.01, 0.08, 0.01, std(0xb08f5e, 0.9), TABLE.x + 0.84, h + 0.04, TABLE.z + 0.46).castShadow = false;
  }

  /* 重画台上那束花 */
  function refreshShopBouquet() {
    if (!fr.shopBouquet) return;
    while (fr.shopBouquet.children.length) {
      const c = fr.shopBouquet.children[fr.shopBouquet.children.length - 1];
      fr.shopBouquet.remove(c);
    }
    fr.paper = null;
    if (!st.picked.length) return;
    const b = makeBouquet(st.picked, {
      parent: fr.shopBouquet, baseY: 0.0, len: 0.38, scale: 1.0,
      x: 0, z: 0
    });
    if (st.wrapped) {
      fr.paper = makeWrap(fr.shopBouquet);
    }
    // 花束换了 → 让阴影重算一帧（平时阴影图是冻住的）
    if (fr.sun) fr.sun.shadow.needsUpdate = true;
  }

  /* ================= 兔子老板娘「白露」 ================= */
  function buildBunny() {
    const fur = std(0xf6f1e6, 0.95);
    const fur2 = std(0xe8dfd0, 0.95);
    const pink = std(0xe9a9b4, 0.9);
    const apron = std(0x9fb79a, 0.9);
    const g = new THREE.Group();
    g.position.set(BUNNY.x, 0, BUNNY.z);
    g.rotation.y = 0.38;                 // 侧身朝着门口
    root.add(g);
    fr.bunny = g;

    // 身体（围裙罩着）
    const body = sph(0.30, 16, fur, 0, 0.58, 0, g);
    body.scale.set(0.92, 1.12, 0.82);
    fr.bunnyBody = body;
    // 围裙
    const ap = sph(0.26, 14, apron, 0, 0.52, 0.15, g);
    ap.scale.set(0.86, 1.0, 0.5);
    box(0.24, 0.1, 0.02, apron, 0, 0.44, 0.32, g).castShadow = false;
    // 围裙口袋
    box(0.15, 0.09, 0.02, std(0x8fa88a, 0.9), 0, 0.42, 0.335, g).castShadow = false;
    // 肩带
    [-1, 1].forEach(function (s) {
      const st2 = box(0.035, 0.22, 0.02, apron, s * 0.10, 0.74, 0.255, g);
      st2.rotation.z = s * 0.16;
      st2.castShadow = false;
    });
    // 头
    const head = sph(0.205, 16, fur, 0, 1.00, 0.01, g);
    head.scale.set(1, 0.96, 0.94);
    // 吻部
    const muz = sph(0.095, 12, fur2, 0, 0.955, 0.175, g);
    muz.scale.set(1.05, 0.82, 0.7);
    // 鼻子 + 嘴
    sph(0.022, 8, pink, 0, 0.995, 0.245, g);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 5, 10, Math.PI), std(0xc08b84, 0.9));
    mouth.position.set(0, 0.955, 0.245);
    mouth.rotation.x = Math.PI;
    mouth.castShadow = false;
    g.add(mouth);
    // 眼睛（会眨）
    [-1, 1].forEach(function (s) {
      const eye = sph(0.028, 10, std(0x3a2f2a, 0.35), s * 0.078, 1.045, 0.172, g);
      eye.scale.set(0.9, 1.05, 0.6);
      fr.bunnyEyes.push(eye);
      const hl = sph(0.009, 6, new THREE.MeshBasicMaterial({ color: 0xffffff }), s * 0.072, 1.055, 0.196, g);
      hl.castShadow = false;
    });
    // 腮红
    [-1, 1].forEach(function (s) {
      const bl = sph(0.04, 8, std(0xeec0c4, 0.9), s * 0.125, 0.995, 0.145, g);
      bl.scale.set(1, 0.7, 0.3);
      bl.castShadow = false;
    });
    // 耳朵（两根长耳朵，会轻轻晃）
    [-1, 1].forEach(function (s) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.075, 1.16, 0);
      ear.rotation.z = s * 0.16;
      g.add(ear);
      const e1 = sph(0.062, 10, fur, 0, 0.13, 0, ear);
      e1.scale.set(0.62, 2.3, 0.45);
      const e2 = sph(0.045, 8, pink, 0, 0.13, 0.028, ear);
      e2.scale.set(0.55, 2.0, 0.22);
      e2.castShadow = false;
      if (s < 0) fr.bunnyEarL = ear; else fr.bunnyEarR = ear;
    });
    // 手臂（一只搭在台子上）
    const armL = sph(0.085, 10, fur, -0.27, 0.60, 0.06, g);
    armL.scale.set(0.7, 1.5, 0.7);
    armL.rotation.z = -0.35;
    const armR = sph(0.085, 10, fur, 0.27, 0.62, 0.10, g);
    armR.scale.set(0.7, 1.45, 0.7);
    armR.rotation.z = 0.42;
    // 脚
    [-1, 1].forEach(function (s) {
      const ft = sph(0.09, 10, fur2, s * 0.10, 0.07, 0.16, g);
      ft.scale.set(0.85, 0.5, 1.5);
    });
    // 尾巴
    sph(0.075, 8, fur2, 0, 0.45, -0.22, g).castShadow = false;
    // 手里拿一枝（随机一种）
    const held = makeBloom('daisy', 0.85, g);
    held.position.set(0.30, 0.86, 0.20);
    held.rotation.z = -0.5;
    cyl(0.004, 0.005, 0.22, 5, std(0x6f9a5a, 0.9), 0.335, 0.75, 0.19, g).castShadow = false;
  }

  /* ================= 窗台上打呼的猫 ================= */
  function buildCat() {
    const g = new THREE.Group();
    g.position.set(CAT.x, 0.995, CAT.z);
    g.rotation.y = 3.42;                 // M47.1：转过来朝着屋里（第一版屁股朝人）
    g.scale.setScalar(1.18);
    root.add(g);
    fr.cat = g;

    const furC = std(0xe2dccf, 0.95);
    const furD = std(0xc0b6a2, 0.95);
    const cushion = std(0xc9a2a6, 0.98);

    // 底下的小垫子
    const cus = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.05, 18), cushion);
    cus.position.set(0, -0.02, 0);
    cus.castShadow = false;
    cus.receiveShadow = true;
    g.add(cus);
    const cusRim = new THREE.Mesh(new THREE.TorusGeometry(0.198, 0.014, 5, 20), std(0xb08b90, 0.98));
    cusRim.position.y = 0.005;
    cusRim.rotation.x = Math.PI / 2;
    cusRim.castShadow = false;
    g.add(cusRim);

    // 身子（侧躺的团子）
    const body = sph(0.17, 14, furC, 0, 0.09, -0.02, g);
    body.scale.set(1.0, 0.66, 1.3);
    fr.catBody = body;
    // 背上的斑
    const patch = sph(0.095, 10, furD, 0.0, 0.115, -0.06, g);
    patch.scale.set(0.85, 0.32, 1.25);
    patch.castShadow = false;
    // 头
    const head = sph(0.095, 14, furC, 0, 0.13, 0.175, g);
    head.scale.set(1, 0.92, 0.95);
    // 耳朵（圆锥 + 里面一点粉）
    [-1, 1].forEach(function (s) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.07, 6), furC);
      ear.position.set(s * 0.062, 0.215, 0.155);
      ear.rotation.z = s * 0.24;
      ear.castShadow = false;
      g.add(ear);
      const ine = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.045, 5), std(0xd8a8ac, 0.95));
      ine.position.set(s * 0.062, 0.213, 0.168);
      ine.rotation.z = s * 0.24;
      ine.castShadow = false;
      g.add(ine);
    });
    // 闭着的眼睛（两道下弯的小弧）
    [-1, 1].forEach(function (s) {
      const e = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0045, 5, 10, Math.PI), std(0x5a5048, 0.8));
      e.position.set(s * 0.038, 0.135, 0.252);
      e.rotation.x = Math.PI;
      e.castShadow = false;
      g.add(e);
      fr.catEyes.push(e);
    });
    // 鼻头 + 嘴
    sph(0.012, 6, std(0xd79a96, 0.9), 0, 0.118, 0.262, g).castShadow = false;
    [-1, 1].forEach(function (s) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 4, 8, Math.PI), std(0xb08b84, 0.9));
      m.position.set(s * 0.014, 0.105, 0.262);
      m.rotation.x = Math.PI;
      m.rotation.z = s * 0.5;
      m.castShadow = false;
      g.add(m);
    });
    // 前爪
    [[-0.085, 0.20], [0.09, 0.20]].forEach(function (p) {
      const p1 = sph(0.05, 8, std(0xf2ece0, 0.95), p[0], 0.055, p[1], g);
      p1.scale.set(1.1, 0.55, 1.3);
      p1.castShadow = false;
    });
    // 尾巴（慢慢摆）
    const tail = new THREE.Group();
    tail.position.set(0.02, 0.06, -0.19);
    g.add(tail);
    let prev = tail;
    for (let i = 0; i < 3; i++) {
      const seg = sph(0.032, 8, i % 2 ? furD : furC, 0, 0, 0, prev);
      seg.scale.set(1, 0.9, 2.0);
      seg.castShadow = false;
      const nx = new THREE.Group();
      nx.position.set(0, 0.012, -0.078);
      prev.add(nx);
      prev = nx;
    }
    fr.catTail = tail;
  }

  /* ================= 墙上 / 货架（第一版四面白墙太素了） ================= */
  function buildWalls() {
    const wood = std(0xa5814f, 0.9);
    const dark = std(0x8a6a44, 0.9);
    const jarMat = new THREE.MeshStandardMaterial({
      color: col(0xdcece8), roughness: 0.12, metalness: 0.05,
      transparent: true, opacity: 0.42, side: THREE.DoubleSide
    });

    /* ---- 后墙：两层木架 ---- */
    [1.64, 2.26].forEach(function (y, si) {
      box(5.1, 0.05, 0.26, wood, 183.75, y, Z0 + 0.16);
      [181.35, 183.75, 186.15].forEach(function (x) {
        box(0.05, 0.24, 0.24, dark, x, y - 0.14, Z0 + 0.14).castShadow = false;
      });
      const yy = y + 0.03;
      if (si === 0) {
        // 下层：玻璃罐 / 陶瓶 / 小木箱 / 花盆
        [181.55, 182.05].forEach(function (x, k) {
          cyl(0.075, 0.075, 0.22, 12, jarMat, x, yy + 0.11, Z0 + 0.17);
          cyl(0.078, 0.078, 0.02, 12, dark, x, yy + 0.225, Z0 + 0.17).castShadow = false;
          for (let i = 0; i < 5; i++) {
            sph(0.016, 6, std(k ? 0xc2a46a : 0xb4909a, 0.95), x + (i - 2) * 0.018, yy + 0.09 + (i % 2) * 0.02, Z0 + 0.17).castShadow = false;
          }
        });
        // 陶瓶插一枝
        cyl(0.055, 0.04, 0.17, 12, std(0xc08a6a, 0.9), 182.75, yy + 0.085, Z0 + 0.17);
        cyl(0.004, 0.005, 0.2, 5, std(0x6f9a5a, 0.9), 182.75, yy + 0.25, Z0 + 0.17).castShadow = false;
        makeBloom('daisy', 0.8, root).position.set(182.75, yy + 0.35, Z0 + 0.17);
        // 小木箱
        const crate = box(0.26, 0.16, 0.2, std(0x9a7749, 0.92), 183.45, yy + 0.08, Z0 + 0.16);
        box(0.28, 0.03, 0.22, dark, 183.45, yy + 0.17, Z0 + 0.16).castShadow = false;
        // 一摞花盆
        [0, 1, 2].forEach(function (i) {
          cyl(0.065, 0.052, 0.07, 10, std(0xb56b52, 0.9), 184.15, yy + 0.035 + i * 0.072, Z0 + 0.17);
        });
        // 洒水壶
        const can = box(0.16, 0.14, 0.12, std(0xa8bfae, 0.6, 0.25), 185.55, yy + 0.07, Z0 + 0.17);
        const spout = cyl(0.008, 0.014, 0.16, 6, std(0xa8bfae, 0.6, 0.25), 185.66, yy + 0.12, Z0 + 0.10);
        spout.rotation.z = 0.7;
        spout.rotation.x = -0.4;
        const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 5, 12, Math.PI), std(0xa8bfae, 0.6, 0.25));
        hdl.position.set(185.55, yy + 0.15, Z0 + 0.17);
        hdl.castShadow = false;
        root.add(hdl);
        // 纸袋叠
        [0, 1].forEach(function (i) {
          box(0.2, 0.24 - i * 0.02, 0.1, std(0xd9c6a4, 0.95), 186.0 + i * 0.01, yy + 0.12, Z0 + 0.16).castShadow = false;
        });
      } else {
        // 上层：一排干花 + 一个相框
        [181.5, 181.95, 182.4].forEach(function (x, k) {
          const hue = [0xc2a46a, 0xb4909a, 0xd0b48a][k];
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2;
            cyl(0.0035, 0.004, 0.2, 4, std(0x8a8a62, 0.9), x + Math.cos(a) * 0.025, yy + 0.1, Z0 + 0.16 + Math.sin(a) * 0.02).castShadow = false;
            const b = sph(0.026, 6, std(hue, 0.95), x + Math.cos(a) * 0.035, yy + 0.21, Z0 + 0.16 + Math.sin(a) * 0.03);
            b.scale.set(0.8, 1.5, 0.8);
            b.castShadow = false;
          }
        });
        // 相框（画的是妈妈和我）
        const frTex = canvasTex(180, 140, function (g, W, Hh) {
          g.fillStyle = '#f6efe0'; g.fillRect(0, 0, W, Hh);
          g.fillStyle = '#cfe3e8'; g.fillRect(8, 8, W - 16, Hh - 24);
          g.fillStyle = '#7fb3c4';
          g.beginPath(); g.ellipse(W / 2, Hh - 40, 34, 20, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#f2f2ee';
          g.beginPath(); g.ellipse(W / 2 + 20, Hh - 46, 12, 9, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#6b5a42';
          g.font = '14px "Microsoft YaHei", sans-serif';
          g.textAlign = 'center';
          g.fillText('海和妈妈', W / 2, Hh - 6);
        });
        const fm = new THREE.MeshBasicMaterial({ map: frTex, toneMapped: false });
        const pf = plane(0.22, 0.17, fm, 183.75, yy + 0.11, Z0 + 0.13).castShadow = false;
        box(0.25, 0.2, 0.02, dark, 183.75, yy + 0.11, Z0 + 0.11).castShadow = false;
        // 小香炉 / 蜡烛
        cyl(0.045, 0.04, 0.1, 10, std(0xe8dcc0, 0.9), 184.6, yy + 0.05, Z0 + 0.17);
        sph(0.02, 6, new THREE.MeshBasicMaterial({ color: 0xffd27a }), 184.6, yy + 0.115, Z0 + 0.17).castShadow = false;
        // 挂着的干花花环（靠在墙角）
        const wr = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 20), std(0x8a8a62, 0.95));
        wr.position.set(185.75, yy + 0.17, Z0 + 0.13);
        wr.castShadow = false;
        root.add(wr);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const f = sph(0.022, 6, std(i % 2 ? 0xc2a46a : 0xb4909a, 0.95),
            185.75 + Math.cos(a) * 0.14, yy + 0.17 + Math.sin(a) * 0.14, Z0 + 0.15);
          f.castShadow = false;
        }
      }
    });

    /* ---- 后墙顶上：一条横幅 ---- */
    const bannerTex = canvasTex(640, 110, function (g, W, Hh) {
      g.fillStyle = '#f6efe0'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9b48e'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, Hh - 16);
      g.fillStyle = '#6b7a5a';
      g.font = 'bold 44px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('花 是 慢 慢 开 的', W / 2, 68);
      g.fillStyle = '#b3766a';
      g.font = '18px "Microsoft YaHei", sans-serif';
      g.fillText('鲸花屿 · 鲸鱼街西 39 号旁', W / 2, 96);
    });
    const bm = new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false });
    plane(2.4, 0.42, bm, 183.75, H - 0.36, Z0 + 0.1).castShadow = false;

    /* ---- 东墙（那排花桶上面）：今日花价 ---- */
    const priceTex = canvasTex(320, 430, function (g, W, Hh) {
      g.fillStyle = '#2f3a30'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#8a6a44'; g.lineWidth = 10; g.strokeRect(6, 6, W - 12, Hh - 12);
      g.fillStyle = '#f3e6c8';
      g.font = 'bold 34px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('今 日 花 价', W / 2, 58);
      g.strokeStyle = 'rgba(243,230,200,.4)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(46, 76); g.lineTo(W - 46, 76); g.stroke();
      g.font = '24px "Microsoft YaHei", sans-serif';
      const rows = [['玫瑰', '¥5 / 枝'], ['向日葵', '¥6 / 枝'], ['小雏菊', '¥3 / 枝'], ['满天星', '¥4 / 枝']];
      rows.forEach(function (r, i) {
        const y = 122 + i * 52;
        g.textAlign = 'left'; g.fillStyle = '#f3e6c8';
        g.fillText(r[0], 52, y);
        g.textAlign = 'right'; g.fillStyle = '#e8c98a';
        g.fillText(r[1], W - 52, y);
      });
      g.strokeStyle = 'rgba(243,230,200,.35)';
      g.beginPath(); g.moveTo(46, 350); g.lineTo(W - 46, 350); g.stroke();
      g.textAlign = 'center';
      g.fillStyle = '#c9b48e';
      g.font = '19px "Microsoft YaHei", sans-serif';
      g.fillText('三枝起包 · 牛皮纸 + 麻绳', W / 2, 382);
      g.fillStyle = '#d98a9a';
      g.fillText('包好抱回家插瓶', W / 2, 408);
    });
    const pm = new THREE.MeshBasicMaterial({ map: priceTex, toneMapped: false });
    plane(0.72, 0.96, pm, X1 - 0.07, 1.72, -0.9, root, -Math.PI / 2).castShadow = false;
    // 牌子的木框
    box(0.04, 1.02, 0.78, dark, X1 - 0.03, 1.72, -0.9);

    /* ---- 东墙靠门那边：一个小搁板（放麻绳 / 剪刀 / 卡片） ---- */
    box(0.2, 0.04, 0.75, wood, X1 - 0.13, 1.42, 1.85);
    box(0.05, 0.14, 0.05, dark, X1 - 0.06, 1.32, 1.55).castShadow = false;
    box(0.05, 0.14, 0.05, dark, X1 - 0.06, 1.32, 2.15).castShadow = false;
    const rollMat = std(0xc7a374, 0.95);
    // 一卷牛皮纸（横躺着）+ 一叠卡片 + 一小瓶花
    const r2 = cyl(0.055, 0.055, 0.34, 12, rollMat, X1 - 0.14, 1.51, 1.88);
    r2.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      box(0.12, 0.008, 0.09, std(0xfbf5e6, 0.9), X1 - 0.14, 1.445 + i * 0.009, 2.12).castShadow = false;
    }
    cyl(0.035, 0.03, 0.1, 10, std(0xc08a6a, 0.9), X1 - 0.14, 1.49, 2.4);
    const sx = makeBloom('baby', 0.7, root);
    sx.position.set(X1 - 0.14, 1.58, 2.4);
    // 旁边挂一把小扫帚
    cyl(0.008, 0.008, 0.5, 5, std(0x8a6a44, 0.9), X1 - 0.09, 1.75, 2.55);
    const broom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.16, 8), std(0xc2a46a, 0.95));
    broom.position.set(X1 - 0.09, 1.46, 2.55);
    root.add(broom);

    /* ---- 西墙：一个钟 + 墙角一盆绿植 ---- */
    const clockMat = new THREE.MeshBasicMaterial({ map: canvasTex(160, 160, function (g, W, Hh) {
      g.fillStyle = '#f6efe0'; g.beginPath(); g.arc(W / 2, Hh / 2, W / 2 - 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8a6a44'; g.lineWidth = 8; g.stroke();
      g.strokeStyle = '#6b5a42'; g.lineWidth = 5;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * 56, Hh / 2 + Math.sin(a) * 56);
        g.lineTo(W / 2 + Math.cos(a) * 66, Hh / 2 + Math.sin(a) * 66);
        g.stroke();
      }
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(W / 2, Hh / 2); g.lineTo(W / 2 + 30, Hh / 2 - 22); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(W / 2, Hh / 2); g.lineTo(W / 2 - 10, Hh / 2 - 50); g.stroke();
    }), toneMapped: false });
    const clk = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), clockMat);
    clk.position.set(X0 + 0.03, 2.35, 1.35);
    clk.rotation.y = Math.PI / 2;
    root.add(clk);

    // 大绿植（前墙西角）
    const pot = cyl(0.16, 0.13, 0.3, 14, std(0xb56b52, 0.9), X0 + 0.55, 0.15, 2.75);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), std(i % 2 ? 0x4f7a4a : 0x6f9a5a, 0.92));
      leaf.position.set(X0 + 0.55 + Math.cos(a) * 0.16, 0.5 + Math.sin(i) * 0.12, 2.75 + Math.sin(a) * 0.16);
      leaf.scale.set(0.55, 1.5, 0.35);
      leaf.rotation.z = Math.cos(a) * 0.5;
      leaf.rotation.x = Math.sin(a) * 0.5;
      leaf.castShadow = true;
      root.add(leaf);
    }

    /* ---- 门里的风铃（进门「叮」一下） ---- */
    const chime = new THREE.Group();
    chime.position.set((DOOR.x0 + DOOR.x1) / 2, H - 0.02, Z1 - 0.35);
    root.add(chime);
    cyl(0.004, 0.004, 0.22, 5, std(0x9a8a70, 0.9), 0, -0.11, 0, chime).castShadow = false;
    const brass = std(0xc9a86a, 0.3, 0.7);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 5, 14), brass);
    ring.position.y = -0.24;
    ring.rotation.x = Math.PI / 2;
    chime.add(ring);
    [0, 1, 2, 3].forEach(function (i) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      cyl(0.003, 0.003, 0.1, 4, std(0x9a8a70, 0.9), Math.cos(a) * 0.055, -0.30, Math.sin(a) * 0.055, chime).castShadow = false;
      const rod = cyl(0.008, 0.008, 0.16, 6, brass, Math.cos(a) * 0.055, -0.42, Math.sin(a) * 0.055, chime);
      rod.castShadow = false;
    });
    fr.chime = chime;
  }

  /* ================= 吊着的干花 ================= */
  function buildHang() {
    // 倒挂晾着的薰衣草 / 满天星：一根根细茎 + 顶上小小的花穗
    const kinds = [
      { bud: 0xa98ac2, stem: 0x8a8a62 },
      { bud: 0xd8c08a, stem: 0x9a9068 },
      { bud: 0xc98a9a, stem: 0x8a8a62 }
    ];
    [181.35, 183.35, 185.35].forEach(function (x, i) {
      const g = new THREE.Group();
      g.position.set(x, H - 0.05, 1.0);
      root.add(g);
      // 吊绳
      cyl(0.004, 0.004, 0.24, 5, std(0x9a8a70, 0.9), 0, -0.12, 0, g).castShadow = false;
      const K = kinds[i];
      // 9 根细茎从捆扎点散下去（M47.1：14 根砍到 9 根，花穗 3 颗减到 2 颗）
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2;
        const rr = 0.012 + (j % 3) * 0.016;
        const len = 0.24 + (j % 4) * 0.035;
        const hg = new THREE.Group();
        hg.position.set(Math.cos(a) * rr, -0.34, Math.sin(a) * rr);
        hg.rotation.z = Math.cos(a) * 0.34;
        hg.rotation.x = Math.sin(a) * 0.34;
        g.add(hg);
        // 茎朝下（整束是倒挂的）
        cyl(0.0028, 0.0035, len, 4, std(K.stem, 0.9), 0, -len / 2, 0, hg).castShadow = false;
        // 花穗：两颗小鼓包
        for (let k = 0; k < 2; k++) {
          const bud = sph(0.015, 6, std(K.bud, 0.95), 0, -len - 0.008 - k * 0.02, 0, hg);
          bud.scale.set(0.9, 1.5, 0.9);
          bud.castShadow = false;
        }
      }
      // 麻绳捆扎
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 5, 12), std(0xb59a6c, 0.95));
      tor.position.y = -0.34;
      tor.rotation.x = Math.PI / 2;
      tor.castShadow = false;
      g.add(tor);
      fr.sway.push({ o: g, x0: 0, z0: 0, ph: i * 2.0, hang: 0.016 });
    });
  }

  /* ================= 灯 ================= */
  function buildLights() {
    const amb = new THREE.AmbientLight(0xfff4e2, 0.42);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xf8f4e8, 0x6a6a58, 0.2);
    root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
    sun.position.set(184.0, 4.2, 9.0);
    sun.target.position.set(184.0, 0.8, -1.2);
    root.add(sun);
    root.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -5.2; sc.right = 5.2; sc.top = 5.2; sc.bottom = -5.2;
    sc.near = 0.5; sc.far = 22;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;
    const warm = new THREE.PointLight(0xffd9a8, 0.85, 9.0, 2);
    warm.position.set(183.4, 2.45, -1.5);
    root.add(warm);
    fr.amb = amb; fr.hemi = hemi; fr.sun = sun; fr.warm = warm;

    /* M47.1：屋里的东西都是不动的，阴影只算一次就够 ——
     * 原来每帧都要重画一遍 1024 的阴影图（几百个物件又画一遍），帧率就是这么掉下去的。 */
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;

    // 两盏吊灯（柜台上面 + 花艺台上面）
    [{ x: 183.6, z: -2.2 }, { x: 183.2, z: 0.9 }].forEach(function (p, i) {
      cyl(0.006, 0.006, 0.5, 5, std(0x5a4a3a, 0.8), p.x, H - 0.28, p.z);
      const shadeMat = new THREE.MeshStandardMaterial({
        color: col(0xfaf0da), roughness: 0.85, side: THREE.DoubleSide,
        emissive: col(0xffe3b4), emissiveIntensity: 0.25
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shadeMat);
      dome.position.set(p.x, H - 0.5, p.z);
      dome.castShadow = true;
      root.add(dome);
      const bulbMat = new THREE.MeshStandardMaterial({
        color: col(0xfff4d8), emissive: col(0xffd27a), emissiveIntensity: 0.9, roughness: 0.6
      });
      const b = sph(0.055, 8, bulbMat, p.x, H - 0.54, p.z);
      b.castShadow = false;
      fr.bulbs.push(bulbMat);
      if (i === 1) {
        const pl = new THREE.PointLight(0xffe0b0, 0.5, 5.5, 2);
        pl.position.set(p.x, H - 0.62, p.z);
        root.add(pl);
      }
    });
  }

  /* ================= 流程：挑花 / 包起来 ================= */
  function pickFlower(K) {
    if (st.wrapped) {
      if (tip) tip('已经包好啦 🌷 抱回家插瓶就行（餐桌上那个小花瓶）', 3400);
      say(TABLE.x, 1.35, TABLE.z, '这束包好了，先抱回家吧', 2.8);
      return false;
    }
    if (st.picked.length >= MAX_PICK) {
      if (tip) tip('手上拿不下更多了 —— 点花艺台「包起来」', 3200);
      return false;
    }
    if (walletOf() < K.price) {
      if (tip) tip('零花钱不够啦…「' + K.name + '」一枝 ¥' + K.price + '，余额 ¥' + walletOf(), 3600);
      say(BUCKET_X - 0.3, 1.0, BUCKET_Z[0], '（口袋里不够了）', 2.6);
      return false;
    }
    spend(K.price);
    st.picked.push(K.k);
    st.total += K.price;
    st.lastKind = K.k;
    st.bought++;
    if (sfx && sfx.snip) sfx.snip();
    refreshShopBouquet();
    if (tip) {
      tip('挑了一枝「' + K.name + '」 ¥' + K.price +
        ' · 手上 ' + st.picked.length + ' 枝（¥' + st.total + '）→ 点花艺台包起来', 4200);
    }
    const lines = {
      rose: '玫瑰带刺，小心手——我给你剪掉了',
      sun: '向日葵今天特别精神，早上刚抬过头',
      daisy: '小雏菊最耐放，放一周都还开着',
      baby: '满天星抓一小撮，配什么都好看'
    };
    say(BUNNY.x, 1.5, BUNNY.z + 0.2, '白露：' + lines[K.k], 3.6);
    return true;
  }

  function wrapBouquet() {
    if (!st.picked.length) {
      if (tip) tip('花艺台上还是空的 —— 先去右边铁皮桶里挑几枝', 3600);
      say(TABLE.x, 1.35, TABLE.z, '空着呢，先挑花', 2.6);
      return false;
    }
    if (st.wrapped) {
      if (tip) tip('已经包好了 · 抱回家插在餐桌上那个小花瓶里', 3400);
      return false;
    }
    const hadFlowers = !!(st.hasHome && st.kinds.length);
    st.wrapped = true;
    st.kinds = st.picked.slice();
    st.fresh = 1;
    st.hasHome = true;
    refreshShopBouquet();
    placeHome();         // 家里的花瓶立刻换上这束（人还站在店里，看不见而已）
    saveFlowers();
    if (sfx && sfx.rustle) sfx.rustle();
    if (sfx && sfx.paper) sfx.paper();
    if (tip) {
      tip('包好啦 🌷 ¥' + st.total + ' · ' + st.kinds.length + ' 枝 · ' +
        (hadFlowers ? '回家花瓶里就换成这束了' : '带回家插瓶（餐桌上那个小花瓶）'), 5000);
    }
    say(TABLE.x, 1.42, TABLE.z, '牛皮纸一裹，麻绳一系——拿去送人也不丢人', 3.4);
    return true;
  }

  /* 家里：把抱回来的花插进花瓶 */
  function placeHome() {
    if (!homeG) return;
    while (homeG.children.length) homeG.remove(homeG.children[homeG.children.length - 1]);
    fr.homeBouquet = null;
    fr.blooms = [];
    if (!st.kinds.length) {
      homeG.visible = false;
      return;
    }
    // 花茎从瓶口里冒出来
    const b = makeBouquet(st.kinds, {
      parent: homeG, baseY: 0, len: 0.30, scale: 0.92, x: 0, z: 0
    });
    fr.homeBouquet = b;
    fr.blooms = b.blooms;
    // 家里这束要单独上色（花期会发黄、低头）—— 材质克隆一份，别跟店里共用的混在一起
    b.g.traverse(function (o) { if (o.isMesh && o.material) o.material = o.material.clone(); });
    homeG.visible = true;
    applyFreshLook();
  }

  /* 花期：颜色按新鲜度从鲜亮往枯黄偏，蔫了就垂头 */
  function applyFreshLook() {
    if (!fr.homeBouquet) return;
    const f = Math.max(0, Math.min(1, st.fresh));
    const droop = f < 0.45 ? (0.45 - f) * 1.1 : 0;
    fr.homeBouquet.g.rotation.x = droop * 0.5;
    for (let i = 0; i < fr.blooms.length; i++) {
      const bl = fr.blooms[i];
      bl.scale.setScalar(0.82 + f * 0.18);
      bl.traverse(function (o) {
        if (!o.isMesh || !o.material || !o.material.color) return;
        const m = o.material;
        if (!m.userData.freshBase) {
          m.userData.freshBase = m.color.clone();
        }
        const base = m.userData.freshBase;
        // 蔫了：往土黄色偏一点，也压暗
        m.color.copy(base).lerp(new THREE.Color().setRGB(0.42, 0.33, 0.20), (1 - f) * 0.55);
      });
    }
  }

  function waterHome() {
    if (!st.kinds.length) {
      if (tip) tip('花瓶是空的 —— 去鲸花屿挑一束（街上西边，门口摆着花桶）', 4200);
      return false;
    }
    st.waterAt = t;
    if (st.fresh < 0.999) st.fresh = Math.min(1, st.fresh + 0.06);
    st.fresh = Math.min(1, st.fresh + 0.02);
    applyFreshLook();
    saveFlowers();
    if (sfx && sfx.splash) sfx.splash();
    const msgs = [
      '换了水，花枝「咔」地吸了一口 🌷',
      '水是凉的，瓶子外面起了一层雾',
      '剪了一小截茎再插回去，能多开两天',
      '花在水里站直了一点'
    ];
    if (tip) tip(pickOne(msgs), 3400);
    return true;
  }

  function talkAboutFlower() {
    if (!st.kinds.length) {
      if (tip) tip('餐桌上这个花瓶还空着 —— 街西头的鲸花屿能买花', 3800);
      return false;
    }
    const K = kindOf(st.kinds[0]);
    const names = st.kinds.map(function (k) { return kindOf(k).name; });
    const left = Math.round(st.fresh * 100);
    const mood = st.fresh > 0.7 ? '开得正好' : (st.fresh > 0.35 ? '还开着，就是有点累了' : '蔫了，该换了');
    if (tip) tip('「' + names.join(' + ') + '」 · ' + mood + '（花期 ' + left + '%）', 4200);
    say(HOME.x, 1.45, HOME.z, K.lang + '　·　' + mood, 4.6);
    return true;
  }

  /* ================= 存档（下次打开还有花） ================= */
  function saveFlowers() {
    try {
      if (!st.kinds.length) { localStorage.removeItem(SKEY); return; }
      localStorage.setItem(SKEY, JSON.stringify({
        kinds: st.kinds, fresh: st.fresh, at: Date.now()
      }));
    } catch (e) { /* 无痕模式之类就算了 */ }
  }
  function loadFlowers() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || !s.kinds || !s.kinds.length) return;
      const hrs = Math.max(0, (Date.now() - (s.at || Date.now())) / 3600000);
      st.kinds = s.kinds.slice(0, MAX_PICK);
      // 大概 3 天半开败（1 / 84 每小时）
      st.fresh = Math.max(0, Math.min(1, (s.fresh === undefined ? 1 : s.fresh) - hrs / 84));
      st.hasHome = true;
    } catch (e) { /* 存档坏了就当没花 */ }
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) return;
    t += dt;
    const day = getMode() === 'day';
    if (fr.amb) fr.amb.intensity = day ? 0.42 : 0.16;
    if (fr.hemi) fr.hemi.intensity = day ? 0.2 : 0.07;
    if (fr.sun) fr.sun.intensity = day ? 1.05 : 0.08;
    if (fr.warm) fr.warm.intensity = day ? 0.85 : 1.15;
    if (fr.fridgeGlow) fr.fridgeGlow.emissiveIntensity = day ? 0.75 : 1.15;
    if (fr.coolLight) fr.coolLight.intensity = day ? 0.3 : 0.6;
    if (fr.outMat) fr.outMat.color.setHex(day ? 0xdfeade : 0x2f3a4e);
    if (fr.doorGlass) fr.doorGlass.emissiveIntensity = day ? 0.08 : 0.3;
    if (fr.chime) fr.chime.rotation.z = Math.sin(t * 1.4) * 0.045;
    for (let i = 0; i < fr.bulbs.length; i++) {
      fr.bulbs[i].emissiveIntensity = day ? 0.35 : 1.25;
    }

    // 桶里 / 吊着的花：轻轻晃
    for (let i = 0; i < fr.sway.length; i++) {
      const s = fr.sway[i];
      const amp = s.hang ? s.hang : 0.012;
      s.o.rotation.x = s.x0 + Math.sin(t * 0.9 + s.ph) * amp;
      s.o.rotation.z = s.z0 + Math.cos(t * 1.1 + s.ph) * amp;
    }

    // 台上那束花：夜里合起来一点（像在睡觉）
    if (fr.shopBouquet && fr.shopBouquet.children.length) {
      const k = day ? 1 : 0.9;
      fr.shopBouquet.scale.setScalar(k);
    }

    // 兔子：呼吸 + 耳朵晃 + 偶尔眨眼
    if (fr.bunnyBody) {
      fr.bunnyBody.position.y = 0.58 + Math.sin(t * 1.6) * 0.007;
    }
    if (fr.bunnyEarL) fr.bunnyEarL.rotation.z = -0.16 + Math.sin(t * 1.3) * 0.05;
    if (fr.bunnyEarR) fr.bunnyEarR.rotation.z = 0.16 + Math.sin(t * 1.3 + 1.4) * 0.05;
    for (let i = 0; i < fr.bunnyEyes.length; i++) {
      const blink = (t % 4.2) > 4.05 ? 0.1 : 1;
      fr.bunnyEyes[i].scale.y = 1.05 * blink;
    }

    // 猫：睡着了在打呼（身子一起一伏），尾巴尖慢慢摆
    if (fr.catBody) {
      fr.catBody.scale.y = 0.62 + Math.sin(t * 1.5) * 0.03;
    }
    if (fr.catTail) {
      fr.catTail.rotation.y = Math.sin(t * 0.7) * 0.22;
      fr.catTail.rotation.x = Math.sin(t * 0.5 + 1) * 0.08;
    }

    // 门口自动回街（跟别的店一样）
    if (cool > 0) cool -= dt;
    if (walking && camPos && cool <= 0) {
      const nearDoor = camPos.z > Z1 - 0.55 && camPos.x > DOOR.x0 - 0.3 && camPos.x < DOOR.x1 + 0.3;
      if (nearDoor) {
        cool = 2.5;
        onDoor('street');
      }
    }
  }

  /* 家里那一部分：每帧被 main 叫一声（很轻） */
  function homeTick(venue) {
    const home = (venue === 'home');
    if (homeG) {
      homeG.visible = home && st.kinds.length > 0 && st.hasHome;
      if (homeG.visible) {
        // 花随天光：白天张开、夜里收一点
        const day = getMode() === 'day';
        const open = day ? 1 : 0.9;
        if (fr.homeBouquet) {
          fr.homeBouquet.g.scale.setScalar(open);
          fr.homeBouquet.g.rotation.z = Math.sin(t * 0.8) * 0.012;
        }
      }
    }
  }

  /* ================= 走动边界 ================= */
  function clamp(x, z) {
    x = Math.max(X0 + 0.4, Math.min(X1 - 0.4, x));
    z = Math.max(Z0 + 1.0, Math.min(Z1 - 0.18, z));
    // 花艺台（长方形，外扩一圈）
    const tx = TABLE.w / 2 + 0.38, tz = TABLE.d / 2 + 0.38;
    if (x > TABLE.x - tx && x < TABLE.x + tx && z > TABLE.z - tz && z < TABLE.z + tz) {
      // 推到最近的一条边外面
      const dx = Math.min(x - (TABLE.x - tx), (TABLE.x + tx) - x);
      const dz = Math.min(z - (TABLE.z - tz), (TABLE.z + tz) - z);
      if (dx < dz) x = (x < TABLE.x) ? TABLE.x - tx : TABLE.x + tx;
      else z = (z < TABLE.z) ? TABLE.z - tz : TABLE.z + tz;
    }
    // 白露
    let dx = x - BUNNY.x, dz = z - BUNNY.z;
    let d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.46 && d > 0.0001) {
      x = BUNNY.x + dx / d * 0.46;
      z = BUNNY.z + dz / d * 0.46;
    }
    // 铁皮桶那一排（贴着东墙，整排一起挡）
    if (z > BUCKET_Z[0] - 0.42 && z < BUCKET_Z[3] + 0.42 && x > BUCKET_X - 0.44) {
      x = BUCKET_X - 0.44;
    }
    // 保鲜柜
    if (x < FRIDGE.x1 + 0.45 && z > FRIDGE.z0 - 0.2 && z < FRIDGE.z1 + 0.2) {
      x = FRIDGE.x1 + 0.45;
    }
    return { x: x, z: z };
  }

  /* ================= 调试 ================= */
  function debug() {
    return {
      wallet: walletOf(), picked: st.picked.length, wrapped: st.wrapped,
      total: st.total, home: st.kinds.length, fresh: Math.round(st.fresh * 100),
      bought: st.bought
    };
  }

  /* ================= M47.1：静态物件合并 =================
   * 花店原来一进门要画 762 个 mesh、556 次 draw call（面包房才 204），
   * 帧时间在 30~60ms 之间跳 —— 妈妈看到的就是"卡顿 + 一闪"。
   * 屋里除了白露、猫、台上那束花、风铃，其它都不会动：按"材质 + 是否投影"合成大 mesh，
   * 762 → 100 出头。
   */
  function mergeStatic(keepList) {
    const keep = keepList || [];
    const meshes = [];
    root.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      for (let i = 0; i < keep.length; i++) {
        let p = o;
        while (p) { if (p === keep[i]) return; p = p.parent; }
      }
      if (o.geometry.attributes && o.geometry.attributes.position) meshes.push(o);
    });
    if (meshes.length < 2) return 0;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const byKey = {};
    const order = [];

    meshes.forEach(function (m) {
      let g;
      try {
        g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      } catch (e) { return; }
      const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(mw);
      if (!g.attributes.normal) g.computeVertexNormals();
      const key = m.material.uuid + (m.castShadow ? '|s' : '|n');
      if (!byKey[key]) {
        byKey[key] = { mat: m.material, cast: !!m.castShadow, list: [] };
        order.push(key);
      }
      byKey[key].list.push(g);
    });

    // 原件摘掉（group 壳留着，别的地方可能还引用着）
    meshes.forEach(function (m) { if (m.parent) m.parent.remove(m); });

    let made = 0;
    order.forEach(function (k) {
      const b = byKey[k];
      let vc = 0;
      b.list.forEach(function (g) { vc += g.attributes.position.count; });
      if (!vc) return;
      const pos = new Float32Array(vc * 3);
      const nor = new Float32Array(vc * 3);
      const uv = new Float32Array(vc * 2);
      let off = 0;
      b.list.forEach(function (g) {
        pos.set(g.attributes.position.array, off * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
        off += g.attributes.position.count;
        g.dispose();
      });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      bg.computeBoundingSphere();
      const mesh = new THREE.Mesh(bg, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'fused';
      root.add(mesh);
      made++;
    });
    return made;
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    isFlowerNow = o.isFlower || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    walletOf = o.wallet || function () { return 0; };
    spend = o.spend || function () { return true; };
    venueOf = o.venue || function () { return 'home'; };
    const rd = o.renderer || null;
    const cam = o.camera || null;
    if (!scene) return fallback();

    root = new THREE.Group();
    root.name = 'flower-m47';
    root.visible = false;
    scene.add(root);

    buildRoom();
    buildFridge();
    buildCounter();
    buildWalls();
    buildTable();
    buildBuckets();
    buildHang();
    buildBunny();
    buildCat();
    buildLights();
    refreshShopBouquet();
    // 会动的：风铃 / 白露 / 猫 / 台上那束花 —— 其余全合掉
    mergeStatic([fr.chime, fr.bunny, fr.cat, fr.shopBouquet]);

    /* ---------- 家里那束花（餐桌上小花瓶） ---------- */
    homeG = new THREE.Group();
    homeG.name = 'home-flowers-m47';
    homeG.position.set(HOME.x, HOME.y, HOME.z);
    homeG.visible = false;
    scene.add(homeG);

    loadFlowers();
    placeHome();
    if (st.kinds.length) st.hasHome = true;

    /* M47.1：贴图现在就先传上显存（建的时候贴图还没被画过，第一次进门要现传，
     * 那就是妈妈说的"进门卡一下"）。 */
    if (rd && rd.initTexture) {
      for (let i = 0; i < texList.length; i++) {
        try { rd.initTexture(texList[i]); } catch (e) { /* 无所谓 */ }
      }
    }
    /* M47.1：合并后的大 mesh 第一次画要传显存（一次小两百毫秒）。
     * 趁 loading 遮罩还在，先偷偷画一帧（连阴影图一起算好），进门就不会卡那一下。 */
    if (rd && rd.render && cam) {
      const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
      try {
        root.visible = true;
        cam.position.set(184.0, 1.62, 2.6);
        cam.quaternion.setFromEuler(new THREE.Euler(0, 0.2, 0, 'YXZ'));
        cam.updateMatrixWorld(true);
        rd.render(scene, cam);
      } catch (e) { /* 预热失败就算了 */ }
      root.visible = false;
      cam.position.copy(p0);
      cam.quaternion.copy(q0);
      cam.updateMatrixWorld(true);
    }

    /* ---------- 交互 ---------- */
    if (interact) {
      const when = function () { return !!isFlowerNow(); };

      interact.add({
        id: 'flower-door', label: '门',
        box: [(DOOR.x0 + DOOR.x1) / 2, 1.2, Z1 - 0.22, 1.5, 2.4, 0.5],
        anchor: [(DOOR.x0 + DOOR.x1) / 2, 2.5, Z1 - 0.3],
        when: when,
        onClick: function () { onDoor('street'); },
        say: '推门回鲸鱼街'
      });

      // 四个铁皮桶
      KINDS.forEach(function (K, i) {
        const z = BUCKET_Z[i];
        interact.add({
          id: 'flower-bucket' + i, label: K.name,
          box: [BUCKET_X, 0.62, z, 0.52, 1.1, 0.52],
          anchor: [BUCKET_X - 0.3, 1.2, z],
          when: when,
          onClick: function () { pickFlower(K); },
          say: function () {
            return K.name + ' ¥' + K.price + ' / 枝　·　' + K.lang;
          }
        });
      });

      // 花艺台：包起来
      interact.add({
        id: 'flower-wrap', label: '花艺台',
        box: [TABLE.x, TABLE.h + 0.22, TABLE.z, TABLE.w + 0.3, 0.5, TABLE.d + 0.3],
        anchor: [TABLE.x, TABLE.h + 0.62, TABLE.z],
        when: when,
        onClick: function () { wrapBouquet(); },
        say: function () {
          if (st.wrapped) return '包好了 🌷 抱回家插瓶';
          const n = st.picked.length;
          if (!n) return '花艺台 · 先去右边铁皮桶里挑几枝';
          return '手上 ' + n + ' 枝（¥' + st.total + '）· 点一下包起来';
        }
      });

      // 白露
      interact.add({
        id: 'flower-bunny', label: '白露',
        box: [BUNNY.x, 1.0, BUNNY.z, 0.8, 2.0, 0.8],
        anchor: [BUNNY.x, 1.95, BUNNY.z + 0.2],
        when: when,
        onClick: function () {
          if (sfx && sfx.blip) sfx.blip();
          const n = st.picked.length;
          const L = n
            ? ['挑得不错——玫瑰配满天星，最不会出错。',
              '要不要我再给你剪一枝向日葵？今天早上刚开的。',
              '包的时候纸别压太紧，花会闷。']
            : ['来啦。今天的玫瑰开得最好，要不要挑一枝？',
              '花放三天就蔫，可人看花那一下是记得住的。',
              '门口的桶里有新到的满天星，便宜又好看。',
              '拿回家插瓶，水别太满，一半就行。'];
          say(BUNNY.x, 1.9, BUNNY.z + 0.25, '白露：' + pickOne(L), 4.4);
        },
        say: '白露 · 鲸花屿老板娘'
      });

      // 猫
      interact.add({
        id: 'flower-cat', label: '窗台上的猫',
        box: [CAT.x, 1.06, CAT.z, 0.5, 0.4, 0.5],
        anchor: [CAT.x, 1.45, CAT.z],
        when: when,
        onClick: function () {
          if (sfx && sfx.cat) sfx.cat();
          const L = ['呼噜呼噜……（尾巴尖动了一下）',
            '它睁了半只眼，又闭上了',
            '猫：喵。（意思大概是"别摸，我在睡"）',
            '暖气从窗缝里进来，它的毛被吹得一抖'];
          say(CAT.x, 1.42, CAT.z + 0.1, pickOne(L), 3.6);
        },
        say: '一只睡在窗台上的猫'
      });

      // 保鲜柜
      interact.add({
        id: 'flower-fridge', label: '保鲜柜',
        box: [(FRIDGE.x0 + FRIDGE.x1) / 2 + 0.1, 1.3, (FRIDGE.z0 + FRIDGE.z1) / 2, 0.8, 2.3, 1.9],
        anchor: [FRIDGE.x1 + 0.2, 2.2, (FRIDGE.z0 + FRIDGE.z1) / 2],
        when: when,
        onClick: function () {
          if (sfx && sfx.freezer) sfx.freezer();
          const L = ['柜里 4℃，花在里面能多放两天。',
            '玻璃上有水汽——一开门就一层白雾。',
            '最上层那束是昨天给婚礼包的，可惜不是你的。'];
          say(FRIDGE.x1 + 0.3, 1.9, (FRIDGE.z0 + FRIDGE.z1) / 2, pickOne(L), 4.0);
        },
        say: '保鲜柜 · 4℃'
      });

      // 吊着的干花
      interact.add({
        id: 'flower-hang', label: '干花',
        box: [183.5, 2.28, 0.95, 4.2, 0.9, 0.5],
        anchor: [183.5, 2.85, 0.95],
        when: when,
        onClick: function () {
          if (sfx && sfx.rustle) sfx.rustle();
          say(183.5, 2.4, 0.95, '倒着挂的干花——倒挂是为了茎还是直的，干了也不歪', 4.2);
        },
        say: '倒挂着的干花'
      });

      // 包装台上的剪刀 / 铜铃 / 纸卷（一起一个小热区）
      interact.add({
        id: 'flower-tools', label: '包装台',
        box: [(COUNTER.x0 + COUNTER.x1) / 2, COUNTER.h + 0.24, (COUNTER.z0 + COUNTER.z1) / 2,
          COUNTER.x1 - COUNTER.x0, 0.42, COUNTER.z1 - COUNTER.z0 + 0.1],
        anchor: [(COUNTER.x0 + COUNTER.x1) / 2, COUNTER.h + 0.7, (COUNTER.z0 + COUNTER.z1) / 2],
        when: when,
        onClick: function () {
          if (sfx && sfx.bell) sfx.bell();
          const L = ['铜铃「叮」了一声——欢迎光临。',
            '剪刀很利，白露说客人别碰。',
            '牛皮纸卷还剩很多，够包好多束。',
            '麻绳绕成球，用手指一勾就出来一段。'];
          say((COUNTER.x0 + COUNTER.x1) / 2, COUNTER.h + 0.6, (COUNTER.z0 + COUNTER.z1) / 2, pickOne(L), 3.8);
        },
        say: '包装台 · 剪刀 / 麻绳 / 铜铃'
      });

      // 家里：花瓶里那束花
      interact.add({
        id: 'flower-home', label: '花瓶里的花',
        box: [HOME.x, HOME.y + 0.26, HOME.z, 0.46, 0.52, 0.46],
        anchor: [HOME.x, HOME.y + 0.8, HOME.z],
        when: function () { return !isFlowerNow() && venueOf() === 'home'; },
        onClick: function () {
          // 点一下：没花就说去花店；有花就换水 + 说花语
          if (!st.kinds.length) {
            talkAboutFlower();
            return;
          }
          waterHome();
        },
        say: function () {
          if (!st.kinds.length) return '餐桌上的小花瓶（还空着）';
          const mood = st.fresh > 0.7 ? '开得正好' : (st.fresh > 0.35 ? '还开着' : '有点蔫了');
          return st.kinds.length + ' 枝花 · ' + mood + ' · 点一下换水';
        }
      });
    }

    // 调试：?flower=fresh 直接抱一束回家；?flower=full 手上先挑好三枝
    try {
      const q = new URLSearchParams(location.search);
      const v = q.get('flower');
      if (v === 'full') {
        setTimeout(function () {
          st.picked = ['rose', 'baby', 'sun'];
          st.total = 15;
          refreshShopBouquet();
        }, 700);
      } else if (v === 'wrapped') {
        setTimeout(function () {
          st.picked = ['rose', 'baby', 'daisy'];
          st.total = 12;
          st.kinds = ['rose', 'baby', 'daisy'];
          st.fresh = 1;
          st.wrapped = true;
          st.hasHome = true;
          refreshShopBouquet();
          placeHome();
        }, 700);
      } else if (v === 'home') {
        setTimeout(function () {
          st.kinds = ['rose', 'sun', 'daisy', 'baby'];
          st.fresh = 0.86;
          st.hasHome = true;
          placeHome();
        }, 600);
      } else if (v === 'old') {
        setTimeout(function () {
          st.kinds = ['rose', 'sun', 'daisy'];
          st.fresh = 0.22;
          st.hasHome = true;
          placeHome();
        }, 600);
      }
    } catch (e) { /* 无所谓 */ }

    return {
      root: root,
      setVisible: function (v) {
        const on = !!v;
        if (root) root.visible = on;
        if (on) {
          // 每次进店，台上重新空着（家里那束不算）
          st.picked = [];
          st.wrapped = false;
          st.total = 0;
          refreshShopBouquet();
          if (fr.sun) fr.sun.shadow.needsUpdate = true;
        }
      },
      clamp: clamp,
      update: update,
      homeTick: homeTick,
      spawn: { x: 186.6, y: 1.62, z: 2.5, yaw: 0.22 },
      spawnOutside: { x: 61.9, y: 1.62, z: 16.52, yaw: -Math.PI / 2 },
      pickFlower: pickFlower,
      pick: function (k) { return pickFlower(kindOf(k)); },
      wrap: wrapBouquet,
      water: waterHome,
      flowerLang: talkAboutFlower,
      save: saveFlowers,
      debug: debug
    };
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      update: function () {},
      homeTick: function () {},
      spawn: { x: 0, y: 1.62, z: 0, yaw: 0 },
      spawnOutside: { x: 61.9, y: 1.62, z: 16.52, yaw: -Math.PI / 2 },
      pickFlower: function () {}, pick: function () {}, wrap: function () {}, water: function () {},
      flowerLang: function () {}, save: function () {},
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
