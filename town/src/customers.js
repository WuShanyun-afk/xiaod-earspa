/* 小D的赛博小家 · M30 小镇居民（来便利店买东西的客人）
 *
 * 店不再是空的：镇上的居民自己走过来买东西。
 *   阿兔 —— 周周买软面包；柴叔 —— 下夜班买关东煮／便当；小满 —— 那只三花猫总来拿牛奶
 *   豆豆 —— 小鸭子，替妈妈来买鸡蛋；龟爷爷 —— 每天慢慢走过来拿牛奶
 *
 * 一条路：人行道走过来 → 自动门「叮咚」→ 在货架前挑一会儿 → 到收银台排队
 *        → 点它（或等 8 秒它就自己扫一下）结账 → 装进纸袋 → 拎着慢慢走回去
 * 赚的钱进小D的零花钱（shop.addMoney），收银台侧边挂着「今日营业」小黑板
 *
 * 调试参数：?crowd=2（立刻来 2 位，一位在收银台等你，一位在货架前）
 *          ?townreset=1（把今天的客流清掉）
 */
window.XD = window.XD || {};

XD.Customers = (function () {
  'use strict';

  /* ================= 坐标（跟 store.js 对齐） ================= */
  const DOOR_X = 24.75;          // 自动门中间
  const Z1 = 4.0;                // 门那面墙
  const SIDEWALK_Z = 4.94;       // 人行道中间
  const EDGE_W = 20.72, EDGE_E = 29.08;   // 从这两头走过来／走回去
  const WALK_SPEED = 1.15;
  const MAX_CROWD = 3;
  const PAY_WAIT = 12;           // 客人站着等多久（没人理就自己扫一下）
  const PAY_WAIT_NEAR = 22;      // 小D就在柜台附近站着 → 多等一会儿，留给妈妈点
  const STUCK_SEC = 150;         // 兜底：卡太久就让它消失

  // 从门口进来的三个点
  const IN_PTS = [
    { x: DOOR_X, z: 4.80 },
    { x: DOOR_X, z: 4.02 },
    { x: DOOR_X, z: 3.32 }
  ];
  // 从收银台走出去（先绕到过道，再出门）
  const EXIT_PTS = [
    { x: 25.92, z: 2.52 },
    { x: DOOR_X, z: 2.62 },
    { x: DOOR_X, z: 3.36 },
    { x: DOOR_X, z: 4.02 },
    { x: DOOR_X, z: 4.84 }
  ];
  // 收银台前的排队位（第一个是正在结账的）
  const QUEUE = [
    { x: 26.28, z: 1.95 },
    { x: 25.82, z: 2.62 },
    { x: 25.28, z: 3.08 }
  ];
  const QUEUE_YAW = Math.PI / 2;   // 朝收银台（+x）

  /* 在货架前站的位置：sx/sz 站那儿，lx/lz 看那儿，pts 是从门口走过来的拐点 */
  const BROWSE = [
    { key: 'bread', what: '面包', price: 8, color: 0xd8a86a,
      sx: 24.90, sz: 1.32, lx: 24.90, lz: 0.30,
      pts: [{ x: 24.85, z: 2.35 }] },
    { key: 'egg', what: '鸡蛋', price: 6, color: 0xf3ead6,
      sx: 22.55, sz: 1.32, lx: 22.55, lz: 0.30,
      pts: [{ x: 24.75, z: 2.35 }, { x: 22.55, z: 2.35 }] },
    { key: 'milk', what: '牛奶', price: 7, color: 0xf2f5fa,
      sx: 21.48, sz: -0.70, lx: 20.90, lz: -0.70,
      pts: [{ x: 24.75, z: 2.35 }, { x: 21.48, z: 2.35 }] },
    { key: 'oden', what: '关东煮', price: 5, color: 0xc98a4a,
      sx: 26.22, sz: 0.85, lx: 27.06, lz: 0.85,
      pts: [{ x: 25.95, z: 2.45 }, { x: 25.95, z: 0.88 }] },
    { key: 'bento', what: '便当', price: 12, color: 0xd96a5a,
      sx: 27.45, sz: -1.35, lx: 27.45, lz: -0.62,
      pts: [{ x: 25.95, z: 2.45 }, { x: 25.95, z: -1.35 }, { x: 27.45, z: -1.35 }] }
  ];

  /* ================= 镇上的人 ================= */
  const CAST = [
    {
      id: 'rabbi', name: '阿兔',
      fur: 0xf1ebe2, belly: 0xfffaf3, inner: 0xf0b3bb,
      ear: 'rabbit', tail: 'puff', acc: 'apron', accColor: 0x9db8cb,
      scale: 1.0, speed: 1.02, tips: 0,
      likes: ['bread'],
      greet: '软面包，两个',
      hours: [[6, 11, 1.6]],
      chat: [
        '阿兔挑面包要挑最上面那袋，压扁的不算',
        '它抱着面包的样子，像抱着个暖水袋'
      ]
    },
    {
      id: 'shiba', name: '柴叔',
      fur: 0xd9a76a, belly: 0xf7ead4, inner: 0xc08b52,
      ear: 'dog', tail: 'curl', acc: 'vest', accColor: 0x556b53,
      scale: 1.07, speed: 0.97, tips: 2,
      likes: ['oden', 'bento'],
      greet: '下夜班，来点热的',
      hours: [[19, 24, 1.8], [0, 5, 1.2]],
      chat: [
        '柴叔下夜班就来，关东煮要最入味的那几串',
        '它说我们家关东煮比街对面那家咸得刚好'
      ]
    },
    {
      id: 'cat', name: '小满',
      fur: 0xe8dccd, belly: 0xfdf6ec, inner: 0xe9b0a8,
      ear: 'cat', tail: 'long', acc: 'scarf', accColor: 0xb4626a,
      scale: 0.93, speed: 1.12, tips: 1,
      likes: ['milk'],
      greet: '牛奶牛奶牛奶',
      hours: [[20, 24, 1.8], [0, 3, 1.0]],
      chat: [
        '小满天天来拿牛奶，尾巴在货架之间扫来扫去',
        '它认得我了，会用头蹭一下我的裤腿'
      ]
    },
    {
      id: 'duck', name: '豆豆',
      fur: 0xf7e08a, belly: 0xfff6cf, inner: 0xf0b070, foot: 0xe8a34c,
      ear: 'bill', tail: 'fan', acc: 'cap', accColor: 0x6a9fd4,
      scale: 0.76, speed: 1.24, tips: 0,
      likes: ['egg'],
      greet: '妈妈说买鸡蛋！',
      hours: [[15, 20, 1.8]],
      chat: [
        '豆豆踮着脚够货架，够不到就看着我',
        '它把钱数了三遍，认真的小鸭子'
      ]
    },
    {
      id: 'turtle', name: '龟爷爷',
      fur: 0x9db98a, belly: 0xd8dcb4, inner: 0x7f9469,
      ear: 'none', tail: 'none', acc: 'glasses', accColor: 0x8f9a86,
      scale: 0.98, speed: 0.72, tips: 3,
      likes: ['milk'],
      greet: '牛奶，一盒够我喝两天',
      hours: [[6, 12, 1.6], [14, 18, 1.0]],
      chat: [
        '龟爷爷走一个来回要十分钟，但每天都来',
        '它把牛奶放进篮子，慢慢慢慢地走回家'
      ]
    }
  ];

  /* ================= 小工具 ================= */
  function stdMat(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex).convertSRGBToLinear(),
      roughness: rough === undefined ? 0.86 : rough,
      metalness: metal === undefined ? 0.0 : metal
    });
  }
  function M(geo, mat, x, y, z, parent, name) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    if (name) m.name = name;
    if (parent) parent.add(m);
    return m;
  }
  function boxMesh(w, h, d, x, y, z, mat, parent, name) {
    return M(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent, name);
  }
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, t);
  }
  function yawToward(x0, z0, x1, z1) { return Math.atan2(x1 - x0, z1 - z0); }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function makeTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

  /* ================= 模块状态 ================= */
  const FUR_SHADOW = 0x3a2f28;
  let store = null, interact = null, sfx = null, tip = null, shop = null, rain = null, snow = null;
  let isStoreNow = function () { return false; };
  let camera = null;
  let crowd = null, street = null;
  let slots = [];
  let boardCanvas = null, boardCtx = null, boardTex = null;
  let queue = [];
  let spawnT = 1.9;
  let spawnFlip = 1;
  let lastDefId = '';
  let templates = {};
  let itemGeo = null, itemMats = {}, bagGeo = null;
  let tagCache = {};
  let stats = { d: '', v: 0, r: 0, t: 0 };
  let ready = false;
  let paused = false;      // M31：妈妈来光顾的时候先不招呼别的客人

  const LS_TOWN = 'xd_town';

  /* ================= 记账（今日客流 / 营业额） ================= */
  function dayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function loadStats() {
    try {
      const raw = localStorage.getItem(LS_TOWN);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      const total = parseInt(o.t, 10);
      stats.t = isNaN(total) ? 0 : total;
      if (o.d === dayKey()) {
        stats.d = o.d;
        stats.v = parseInt(o.v, 10) || 0;
        stats.r = parseInt(o.r, 10) || 0;
      } else {
        stats.d = dayKey();
        stats.v = 0;
        stats.r = 0;
      }
    } catch (e) { /* 存坏了就当今天没人来 */ }
  }
  function saveStats() {
    try {
      localStorage.setItem(LS_TOWN, JSON.stringify({
        d: stats.d, v: stats.v, r: stats.r, t: stats.t
      }));
    } catch (e) { /* 存不进去也不影响玩 */ }
  }
  function resetStats() {
    stats = { d: dayKey(), v: 0, r: 0, t: 0 };
    saveStats();
  }

  /* ================= 捏人：一只小动物 ================= */
  function buildPerson(def) {
    const root = new THREE.Group();
    root.name = 'person-' + def.id;
    root.scale.setScalar(def.scale || 1);

    const fur = stdMat(def.fur, 0.9);
    const belly = stdMat(def.belly, 0.92);
    const inner = stdMat(def.inner, 0.95);
    const acc = stdMat(def.accColor, 0.9);
    const dark = stdMat(0x2a221e, 0.45);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x261e1a).convertSRGBToLinear(), roughness: 0.3
    });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blush = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xe08d86).convertSRGBToLinear(),
      roughness: 0.95, transparent: true, opacity: 0.62
    });
    const shoe = stdMat(def.foot || 0x6b5b4c, 0.85);

    const sphere = function (r, seg) {
      return new THREE.SphereGeometry(r, seg || 16, seg ? 12 : 10);
    };

    /* ---------- 腿（脚底 y=0，面朝 +z） ---------- */
    const legs = [];
    [-1, 1].forEach(function (sgn) {
      const g = new THREE.Group();
      g.position.set(sgn * 0.105, 0.44, 0);
      g.name = sgn < 0 ? 'legL' : 'legR';
      root.add(g);
      M(new THREE.CylinderGeometry(0.079, 0.067, 0.40, 12), fur, 0, -0.20, 0, g);
      const foot = M(sphere(0.5, 14), shoe, 0, -0.415, 0.045, g);
      foot.scale.set(0.115, 0.07, 0.17);
      legs.push(g);
    });

    /* ---------- 身子（走路一颠一颠、挑东西往前倾） ---------- */
    const bodyG = new THREE.Group();
    bodyG.name = 'bodyG';
    root.add(bodyG);

    const torso = M(sphere(1, 20), fur, 0, 0.79, 0, bodyG);
    torso.scale.set(0.295, 0.348, 0.245);
    const chest = M(sphere(1, 16), belly, 0, 0.755, 0.118, bodyG);
    chest.scale.set(0.185, 0.238, 0.145);

    /* ---------- 头 ---------- */
    const headG = new THREE.Group();
    headG.name = 'headG';
    headG.position.set(0, 1.155, 0);
    bodyG.add(headG);

    const head = M(sphere(0.265, 20), fur, 0, 0.05, 0, headG);
    head.scale.set(1, 0.96, 0.95);

    // 口鼻那块浅色
    const muzzle = M(sphere(1, 16), belly, 0, 0.005, 0.196, headG);
    muzzle.scale.set(0.104, 0.080, 0.076);

    // 眼睛
    [-1, 1].forEach(function (sgn) {
      const eye = M(sphere(0.05, 12), eyeMat, sgn * 0.103, 0.076, 0.230, headG);
      eye.scale.set(1, 1.14, 0.80);
      const hl = M(sphere(0.017, 8), whiteMat, sgn * 0.085, 0.100, 0.262, headG);
      hl.castShadow = false;
      const bl = M(sphere(1, 12), blush, sgn * 0.168, -0.004, 0.178, headG);
      bl.scale.set(0.052, 0.030, 0.016);
      bl.castShadow = false;
    });

    // 鼻子（鸭子 / 乌龟换成嘴）
    if (def.ear === 'bill') {
      const bill = M(sphere(1, 14), stdMat(0xef9a4a, 0.75), 0, -0.005, 0.262, headG);
      bill.scale.set(0.145, 0.052, 0.115);
      boxMesh(0.20, 0.012, 0.02, 0, -0.028, 0.30, stdMat(0xd07f34, 0.8), headG);
    } else if (def.ear === 'none') {
      const beak = M(new THREE.ConeGeometry(0.052, 0.075, 10), stdMat(0xddb37a, 0.8), 0, -0.01, 0.245, headG);
      beak.rotation.x = Math.PI / 2;
    } else {
      const nose = M(sphere(0.034, 10), dark, 0, 0.012, 0.286, headG);
      nose.scale.set(1.15, 0.85, 0.9);
    }

    /* ---------- 耳朵 ---------- */
    [-1, 1].forEach(function (sgn) {
      if (def.ear === 'rabbit') {
        const g = new THREE.Group();
        g.position.set(sgn * 0.098, 0.245, -0.015);
        g.rotation.z = -sgn * 0.13;
        g.rotation.x = -0.08;
        headG.add(g);
        M(new THREE.CylinderGeometry(0.052, 0.041, 0.30, 10), fur, 0, 0.155, 0, g);
        M(sphere(0.043, 12), fur, 0, 0.305, 0, g);
        const inn = M(new THREE.CylinderGeometry(0.028, 0.022, 0.21, 8), inner, 0, 0.15, 0.026, g);
        inn.castShadow = false;
      } else if (def.ear === 'dog') {
        const g = new THREE.Group();
        g.position.set(sgn * 0.16, 0.205, -0.01);
        g.rotation.z = -sgn * 0.42;
        g.rotation.x = -0.16;
        headG.add(g);
        const e = M(new THREE.ConeGeometry(0.086, 0.20, 4), fur, 0, 0.09, 0, g);
        e.scale.z = 0.62;
        const ein = M(new THREE.ConeGeometry(0.05, 0.13, 4), inner, 0, 0.08, 0.022, g);
        ein.scale.z = 0.6;
      } else if (def.ear === 'cat') {
        const g = new THREE.Group();
        g.position.set(sgn * 0.143, 0.212, -0.005);
        g.rotation.z = -sgn * 0.30;
        g.rotation.y = -sgn * 0.35;
        headG.add(g);
        const e = M(new THREE.ConeGeometry(0.092, 0.185, 4), fur, 0, 0.085, 0, g);
        e.scale.z = 0.58;
        const ein = M(new THREE.ConeGeometry(0.052, 0.12, 4), inner, 0, 0.075, 0.02, g);
        ein.scale.z = 0.55;
        ein.castShadow = false;
      }
    });
    // 三花猫的几块花
    if (def.id === 'cat') {
      const patch = stdMat(0xb98d68, 0.92);
      [[0.13, 0.13, 0.18, 0.075], [-0.16, 0.02, 0.15, 0.06], [0.02, 0.20, 0.13, 0.05]].forEach(function (p) {
        const m = M(sphere(1, 12), patch, p[0], p[1], p[2], headG);
        m.scale.set(p[3], p[3] * 0.7, 0.03);
        m.castShadow = false;
      });
    }

    /* ---------- 乌龟的壳 ---------- */
    if (def.id === 'turtle') {
      const shellMat = stdMat(0x7f8f5c, 0.95);
      const sh = M(sphere(1, 18), shellMat, 0, 0.80, -0.13, bodyG);
      sh.scale.set(0.345, 0.375, 0.30);
      // 壳上的纹路
      const ring = stdMat(0x64734a, 0.95);
      [[0, 0.86, -0.32, 0.13], [0, 0.66, -0.30, 0.10], [0, 0.98, -0.20, 0.075]].forEach(function (p) {
        const r = M(new THREE.TorusGeometry(p[3], 0.012, 6, 14), ring, p[0], p[1], p[2], bodyG);
        r.rotation.x = Math.PI / 2;
        r.castShadow = false;
      });
    }

    /* ---------- 尾巴 ---------- */
    if (def.tail === 'puff') {
      const t = M(sphere(0.095, 12), belly, 0, 0.54, -0.215, bodyG);
      t.castShadow = false;
    } else if (def.tail === 'curl') {
      [[0, 0.50, -0.21, 0.075], [0.02, 0.63, -0.26, 0.062], [0.10, 0.71, -0.23, 0.05]].forEach(function (p) {
        M(sphere(p[3], 10), fur, p[0], p[1], p[2], bodyG);
      });
    } else if (def.tail === 'long') {
      [[0, 0.47, -0.19, 0.045], [0.03, 0.59, -0.26, 0.041], [0.10, 0.71, -0.26, 0.037],
       [0.17, 0.82, -0.20, 0.033], [0.20, 0.91, -0.13, 0.029]].forEach(function (p) {
        M(sphere(p[3], 10), fur, p[0], p[1], p[2], bodyG);
      });
    } else if (def.tail === 'fan') {
      const t = M(sphere(1, 12), fur, 0, 0.55, -0.22, bodyG);
      t.scale.set(0.085, 0.055, 0.11);
    }

    /* ---------- 胳膊 ---------- */
    const arms = [];
    [-1, 1].forEach(function (sgn) {
      const g = new THREE.Group();
      g.position.set(sgn * 0.286, 0.945, 0);
      g.name = sgn < 0 ? 'armL' : 'armR';
      g.rotation.z = sgn * 0.21;
      bodyG.add(g);
      M(new THREE.CylinderGeometry(0.060, 0.050, 0.29, 10), fur, 0, -0.145, 0, g);
      // 手掌用浅色，跟身子分开一点才看得见
      const paw = M(sphere(0.068, 12), belly, 0, -0.30, 0, g);
      paw.scale.set(1, 0.92, 1.1);
      arms.push(g);
    });
    const armL = arms[0], armR = arms[1];

    /* ---------- 穿的东西 ---------- */
    // 绕着腰的一圈布（椭圆，跟身子的截面贴住）
    function bandMesh(hex, y, h, rx, zs) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex).convertSRGBToLinear(),
        roughness: 0.93, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rx, rx + 0.008, h, 22, 1, true), mat);
      m.position.set(0, y, 0);
      m.scale.z = zs || 0.84;
      m.castShadow = true;
      m.receiveShadow = true;
      bodyG.add(m);
      return m;
    }

    if (def.acc === 'apron') {
      // 围裙：前面一片 + 腰里一圈带子 + 背后的小蝴蝶结（要放在胸前那块浅色之前，不然被盖住）
      boxMesh(0.225, 0.26, 0.022, 0, 0.695, 0.258, acc, bodyG);
      boxMesh(0.245, 0.048, 0.028, 0, 0.828, 0.248, acc, bodyG);
      boxMesh(0.098, 0.062, 0.014, 0, 0.638, 0.272, stdMat(0x89a5b7, 0.9), bodyG);
      bandMesh(def.accColor, 0.792, 0.075, 0.303, 0.86);
      boxMesh(0.055, 0.05, 0.05, 0, 0.775, -0.238, acc, bodyG);
      [-1, 1].forEach(function (sgn) {
        const w = boxMesh(0.098, 0.068, 0.04, sgn * 0.072, 0.788, -0.236, acc, bodyG);
        w.rotation.z = sgn * 0.42;
      });
    } else if (def.acc === 'vest') {
      // 敞襟的工作马甲：后背一大片（半个球壳）+ 前面两条边
      const backMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.accColor).convertSRGBToLinear(),
        roughness: 0.93, side: THREE.DoubleSide
      });
      const back = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14, Math.PI, Math.PI, 0.10, 1.30), backMat);
      back.position.set(0, 0.79, 0);
      back.scale.set(0.303, 0.353, 0.253);
      back.castShadow = true;
      bodyG.add(back);
      [-1, 1].forEach(function (sgn) {
        const lip = boxMesh(0.105, 0.40, 0.04, sgn * 0.20, 0.775, 0.165, acc, bodyG);
        lip.rotation.y = sgn * 0.52;
        // 肩头连着后片
        const sh = boxMesh(0.09, 0.15, 0.05, sgn * 0.215, 0.945, 0.115, acc, bodyG);
        sh.rotation.y = sgn * 0.52;
      });
      // 胸前的小口袋
      boxMesh(0.10, 0.075, 0.014, 0.115, 0.70, 0.212, stdMat(0x46583f, 0.92), bodyG);
    } else if (def.acc === 'scarf') {
      const sc = M(new THREE.TorusGeometry(0.172, 0.044, 8, 18), acc, 0, 1.035, 0.01, bodyG);
      sc.rotation.x = Math.PI / 2 - 0.10;
      const tail2 = boxMesh(0.078, 0.21, 0.032, 0.095, 0.912, 0.185, acc, bodyG);
      tail2.rotation.z = 0.22;
    } else if (def.acc === 'cap') {
      const capG = new THREE.Group();
      capG.position.set(0, 0.225, 0.01);
      capG.rotation.x = 0.10;
      headG.add(capG);
      const crown = M(sphere(1, 16), acc, 0, 0.02, 0, capG);
      crown.scale.set(0.245, 0.145, 0.235);
      const brim = boxMesh(0.34, 0.026, 0.17, 0, -0.02, 0.19, acc, capG);
      brim.rotation.x = 0.16;
      const btn = M(sphere(0.032, 8), stdMat(0x4a76a8, 0.8), 0, 0.155, 0.0, capG);
      btn.castShadow = false;
    } else if (def.acc === 'glasses') {
      const gm = stdMat(0x6b6154, 0.45, 0.5);
      [-1, 1].forEach(function (sgn) {
        const r = M(new THREE.TorusGeometry(0.050, 0.0085, 6, 18), gm,
          sgn * 0.092, 0.072, 0.248, headG);
        r.castShadow = false;
        // 镜片：一层很淡的白
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.047, 14),
          new THREE.MeshBasicMaterial({
            color: 0xf4fbff, transparent: true, opacity: 0.22, toneMapped: false
          }));
        lens.position.set(sgn * 0.092, 0.072, 0.244);
        headG.add(lens);
      });
      boxMesh(0.045, 0.008, 0.008, 0, 0.074, 0.252, gm, headG).castShadow = false;
      // 眼镜腿
      [-1, 1].forEach(function (sgn) {
        boxMesh(0.006, 0.006, 0.10, sgn * 0.148, 0.078, 0.19, gm, headG).castShadow = false;
      });
    }

    /* ---------- 手里的篮子（进店才拿出来） ---------- */
    const basket = new THREE.Group();
    basket.name = 'basket';
    basket.position.set(0.335, 0.60, 0.06);
    bodyG.add(basket);
    const bMat = stdMat(0xc9a877, 0.9);
    boxMesh(0.20, 0.13, 0.14, 0, 0, 0, bMat, basket);
    boxMesh(0.22, 0.03, 0.16, 0, 0.075, 0, stdMat(0xb89464, 0.9), basket);
    const handle = M(new THREE.TorusGeometry(0.075, 0.010, 6, 14), bMat, 0, 0.09, 0, basket);
    handle.rotation.x = Math.PI / 2;
    basket.visible = false;

    /* ---------- 纸袋（结完账拎走） ---------- */
    const bag = new THREE.Group();
    bag.name = 'bag';
    bag.position.set(0.335, 0.50, 0.12);
    bodyG.add(bag);
    const paper = stdMat(0xd9c3a0, 0.95);
    boxMesh(0.19, 0.24, 0.11, 0, -0.04, 0, paper, bag);
    boxMesh(0.20, 0.03, 0.12, 0, 0.085, 0, stdMat(0xc4ac88, 0.95), bag);
    [-1, 1].forEach(function (sgn) {
      const h = M(new THREE.TorusGeometry(0.052, 0.007, 5, 10, Math.PI), stdMat(0x8f7a5c, 0.9),
        sgn * 0.045, 0.10, 0, bag);
      h.rotation.y = 0;
      h.castShadow = false;
    });
    bag.visible = false;

    /* ---------- 下雨的伞 / 下雪的帽子（天气才露出来） ---------- */
    const umb = new THREE.Group();
    umb.name = 'umbrella';
    umb.position.set(0.34, 0.92, 0.0);
    bodyG.add(umb);
    M(new THREE.CylinderGeometry(0.012, 0.012, 1.00, 6), stdMat(0x6b5540, 0.85), 0, 0.40, 0, umb);
    const canopy = M(new THREE.ConeGeometry(0.46, 0.22, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.accColor).convertSRGBToLinear(),
        roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.94
      }), 0, 0.88, 0, umb);
    const tip = M(sphere(0.022, 8), stdMat(0x6b5540, 0.85), 0, 1.00, 0, umb);
    tip.castShadow = false;
    umb.visible = false;

    const beanie = new THREE.Group();
    beanie.name = 'beanie';
    beanie.position.set(0, 0.24, 0);
    headG.add(beanie);
    const hatMat = stdMat(def.accColor, 0.95);
    M(new THREE.CylinderGeometry(0.215, 0.245, 0.13, 16), hatMat, 0, 0.02, 0, beanie);
    boxMesh(0.46, 0.05, 0.06, 0, -0.035, 0.0, hatMat, beanie);
    M(sphere(0.055, 10), stdMat(0xf4efe4, 0.95), 0, 0.115, 0, beanie);
    beanie.visible = false;

    return root;
  }

  function templateOf(def) {
    if (!templates[def.id]) {
      const t = buildPerson(def);
      t.visible = false;
      templates[def.id] = t;
    }
    return templates[def.id];
  }

  /* ================= 一个客人 ================= */
  function pickDef() {
    const h = new Date().getHours();
    const pool = [];
    for (let i = 0; i < CAST.length; i++) {
      const d = CAST[i];
      let w = 1;
      if (d.hours) {
        for (let k = 0; k < d.hours.length; k++) {
          const hr = d.hours[k];
          if (h >= hr[0] && h < hr[1]) { w += hr[2]; break; }
        }
      }
      if (d.id === lastDefId) w *= 0.3;
      const n = Math.max(1, Math.round(w * 2));
      for (let k = 0; k < n; k++) pool.push(d);
    }
    const d = pool[Math.floor(Math.random() * pool.length)] || CAST[0];
    lastDefId = d.id;
    return d;
  }

  function pickSpotFor(def, exclude) {
    // 别人正在挑的那几个位置先避开
    const taken = {};
    for (let i = 0; i < crowd.children.length; i++) {
      const c = crowd.children[i].userData.cust;
      if (!c || c === exclude || c.dead || !c.spot) continue;
      if (c.state === 'inside' || c.state === 'browse') taken[c.spot.key] = true;
    }
    const free = [];
    for (let i = 0; i < BROWSE.length; i++) {
      const s = BROWSE[i];
      if (taken[s.key]) continue;
      free.push(s);
    }
    if (!free.length) return BROWSE[0];
    // 先看它爱买的东西有没有空位
    for (let i = 0; i < def.likes.length; i++) {
      for (let k = 0; k < free.length; k++) {
        if (free[k].key === def.likes[i]) return free[k];
      }
    }
    return free[Math.floor(Math.random() * free.length)];
  }
  function busySpotKey(exclude) {
    for (let i = 0; i < crowd.children.length; i++) {
      const c = crowd.children[i].userData.cust;
      if (!c || c === exclude || c.dead || !c.spot) continue;
      if (c.state === 'browse' || c.state === 'inside') return c.spot.key;
    }
    return null;
  }

  function itemMeshFor(spot) {
    if (!itemGeo) itemGeo = new THREE.BoxGeometry(0.105, 0.10, 0.075);
    let mat = itemMats[spot.key];
    if (!mat) {
      mat = stdMat(spot.color, 0.8);
      itemMats[spot.key] = mat;
    }
    return new THREE.Mesh(itemGeo, mat);
  }

  function makeCustomer(def) {
    const root = templateOf(def).clone(true);
    root.visible = true;
    root.position.set(0, 0, 0);
    const c = {
      def: def, root: root,
      legL: root.getObjectByName('legL'),
      legR: root.getObjectByName('legR'),
      armL: root.getObjectByName('armL'),
      armR: root.getObjectByName('armR'),
      bodyG: root.getObjectByName('bodyG'),
      headG: root.getObjectByName('headG'),
      basket: root.getObjectByName('basket'),
      bag: root.getObjectByName('bag'),
      umbrella: root.getObjectByName('umbrella'),
      beanie: root.getObjectByName('beanie'),
      x: 0, z: 0, yaw: 0, yawTarget: 0,
      t: 0, phase: Math.random() * 6, swing: 0,
      pts: [], pi: 0, onDone: null, moving: false, dead: false,
      state: 'idle', wait: 0, payT: 0, thanksT: 0, wave: 0, paid: false,
      side: 1, spot: null, item: { price: 5, count: 1, what: '东西', extra: 0 },
      tag: null
    };
    root.userData.cust = c;
    return c;
  }

  /* ================= 收银台上那块黑板 ================= */
  function drawBoard() {
    if (!boardCtx) return;
    const g = boardCtx, W = 320, H = 220;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#31463a';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8a6540';
    g.lineWidth = 16;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = '#eef4e6';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = 'bold 36px ' + FONT;
    g.fillText('今日营业', W / 2, 66);
    g.font = '26px ' + FONT;
    g.fillText('客人  ' + stats.v + ' 位', W / 2, 118);
    g.fillText('营业额  ¥' + stats.r, W / 2, 160);
    // 粉笔画的小鲸鱼
    g.strokeStyle = '#d9e8db';
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(56, 190, 24, 13, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(79, 184);
    g.lineTo(94, 174);
    g.lineTo(94, 195);
    g.closePath();
    g.stroke();
    g.fillStyle = '#d9e8db';
    g.beginPath();
    g.arc(48, 186, 2.2, 0, Math.PI * 2);
    g.fill();
    if (boardTex) boardTex.needsUpdate = true;
  }

  function buildBoard() {
    boardCanvas = document.createElement('canvas');
    boardCanvas.width = 320;
    boardCanvas.height = 220;
    boardCtx = boardCanvas.getContext('2d');
    boardTex = new THREE.CanvasTexture(boardCanvas);
    boardTex.encoding = THREE.sRGBEncoding;
    drawBoard();

    const g = new THREE.Group();
    g.name = 'town-board-m30';
    store.root.add(g);

    const wood = stdMat(0x8a6540, 0.9);
    boxMesh(0.045, 0.44, 0.56, 26.688, 0.62, 2.52, wood, g);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.315),
      new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
    face.position.set(26.664, 0.62, 2.52);
    face.rotation.y = -Math.PI / 2;
    g.add(face);
    // 粉笔槽
    boxMesh(0.055, 0.028, 0.34, 26.668, 0.408, 2.52, wood, g);

    if (interact && interact.add) {
      interact.add({
        id: 'town-board',
        label: '营业小黑板',
        box: [26.66, 0.62, 2.52, 0.10, 0.50, 0.62],
        anchor: [26.40, 0.92, 2.52],
        when: function () { return !!isStoreNow(); },
        say: function () {
          if (!stats.v) return '今天还没来客人呢，等会儿应该有人';
          return '今天来了 ' + stats.v + ' 位客人，赚了 ¥' + stats.r +
            '。攒着，晚上给你买好吃的';
        }
      });
    }
  }

  /* ================= 店外的小镇（长椅 / 站牌 / A 字招牌） ================= */
  function buildStreet() {
    const g = new THREE.Group();
    g.name = 'town-street-m30';
    store.root.add(g);
    street = g;

    const wood = stdMat(0x8a6f4e, 0.9);
    const iron = stdMat(0x3b4046, 0.62, 0.35);

    /* 长椅：靠着店这边的墙，面朝马路 */
    const bench = new THREE.Group();
    bench.position.set(28.52, 0, 5.44);
    g.add(bench);
    for (let i = 0; i < 3; i++) {
      boxMesh(1.32, 0.045, 0.115, 0, 0.435, -0.13 + i * 0.13, wood, bench);
    }
    for (let i = 0; i < 2; i++) {
      const slat = boxMesh(1.32, 0.10, 0.035, 0, 0.60 + i * 0.13, -0.215, wood, bench);
      slat.rotation.x = -0.14;
    }
    [-0.55, 0.55].forEach(function (dx) {
      boxMesh(0.05, 0.44, 0.05, dx, 0.22, 0.16, iron, bench);
      boxMesh(0.05, 0.44, 0.05, dx, 0.22, -0.16, iron, bench);
      boxMesh(0.05, 0.30, 0.05, dx, 0.60, -0.205, iron, bench).rotation.x = 0.12;
    });

    /* 公交站牌 */
    const poleMat = stdMat(0x4a5058, 0.55, 0.4);
    cylMesh(0.032, 0.036, 2.35, 8, 27.62, 1.175, 5.06, poleMat, g);
    const plateTex = makeTex(128, 96, function (gg, W, H) {
      gg.fillStyle = '#2f7d9e';
      gg.fillRect(0, 0, W, H);
      gg.fillStyle = '#ffffff';
      gg.fillRect(4, 4, W - 8, H - 8);
      gg.fillStyle = '#2f7d9e';
      gg.font = 'bold 34px ' + FONT;
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.fillText('巴士', W / 2, 34);
      gg.fillText('站', W / 2, 70);
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26),
      new THREE.MeshBasicMaterial({ map: plateTex, toneMapped: false }));
    plate.position.set(27.62, 1.92, 5.06);
    plate.rotation.y = Math.PI + 0.10;
    g.add(plate);

    /* A 字小招牌：靠门口，粉笔字 */
    const signTex = makeTex(256, 320, function (gg, W, H) {
      gg.fillStyle = '#31463a';
      gg.fillRect(0, 0, W, H);
      gg.strokeStyle = '#8a6540';
      gg.lineWidth = 14;
      gg.strokeRect(7, 7, W - 14, H - 14);
      gg.fillStyle = '#eef4e6';
      gg.textAlign = 'center';
      gg.font = 'bold 40px ' + FONT;
      gg.fillText('小鲸鱼', W / 2, 92);
      gg.font = 'bold 52px ' + FONT;
      gg.fillText('24H', W / 2, 156);
      gg.font = '24px ' + FONT;
      gg.fillText('关东煮 买二送一', W / 2, 216);
      gg.font = '20px ' + FONT;
      gg.fillText('热的 · 暖的 · 都有', W / 2, 256);
    });
    const aFrame = new THREE.Group();
    aFrame.position.set(22.78, 0, 4.34);
    aFrame.rotation.y = 0.42;
    g.add(aFrame);
    const faceMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
    [-1, 1].forEach(function (sgn) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.62), faceMat);
      p.position.set(0, 0.32, sgn * 0.10);
      p.rotation.x = sgn * 0.22;
      p.castShadow = false;
      aFrame.add(p);
    });
    const hinge = boxMesh(0.52, 0.03, 0.05, 0, 0.63, 0, stdMat(0x8a6540, 0.9), aFrame);
    hinge.castShadow = false;
  }

  function cylMesh(rt, rb, h, seg, x, y, z, mat, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /* ================= 可点区域（跟着人走） ================= */
  function initSlots() {
    if (!interact || !interact.add) return;
    for (let i = 0; i < MAX_CROWD + 1; i++) {
      const slot = { c: null };
      const hot = interact.add({
        id: 'town-guest-' + i,
        label: '客人',
        box: [0, -60, 0, 0.66, 1.45, 0.52],
        anchor: [0, -60, 0],
        when: function () { return false; },
        onClick: function (h) {
          const c = slot.c;
          if (!c || c.dead) return;
          if (c.state === 'pay') {
            h._mute = true;
            pay(c, false);
          }
        },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          const c = slot.c;
          if (!c || c.dead) return null;
          return chatOf(c);
        }
      });
      slot.hot = hot;
      slots.push(slot);
    }
  }

  function syncSlots() {
    if (!slots.length) return;
    const live = [];
    for (let i = 0; i < crowd.children.length; i++) {
      const c = crowd.children[i].userData.cust;
      if (c && !c.dead) live.push(c);
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const c = live[i] || null;
      slot.c = c;
      if (!c) {
        slot.hot.mesh.position.set(0, -60, 0);
        slot.hot.anchor.set(0, -60, 0);
        continue;
      }
      const s = c.def.scale || 1;
      slot.hot.mesh.position.set(c.x, 0.86 * s, c.z);
      slot.hot.anchor.set(c.x, 1.56 * s + 0.12, c.z);
      slot.hot.label = c.def.name + (c.state === 'pay' ? '（等你结账）' : '');
      slot.hot.when = function () { return !!isStoreNow() && !!slot.c && !slot.c.dead; };
    }
  }

  function chatOf(c) {
    const lines = c.def.chat;
    if (!lines || !lines.length) return c.def.name + '冲我笑了一下';
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /* ================= 聊天气泡（结账时说的话） ================= */
  function sayAtPerson(c, text) {
    if (!interact || !interact.say) return;
    const s = c.def.scale || 1;
    const v = new THREE.Vector3(c.x, 1.58 * s + 0.10, c.z);
    interact.say(v, text, 3.2);
  }

  /* ================= 排队 / 结账 ================= */
  function tagTexture(total) {
    if (tagCache[total]) return tagCache[total];
    const t = makeTex(180, 150, function (g, W, H) {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(g, 10, 8, W - 20, H - 52, 26);
      g.fill();
      g.beginPath();
      g.moveTo(W / 2 - 14, H - 46);
      g.lineTo(W / 2 + 14, H - 46);
      g.lineTo(W / 2, H - 12);
      g.closePath();
      g.fill();
      g.fillStyle = '#2f7d67';
      g.font = 'bold 56px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('¥' + total, W / 2, H / 2 - 18);
    });
    tagCache[total] = t;
    return t;
  }

  function totalOf(c) {
    return c.item.price * c.item.count + (c.item.extra || 0);
  }

  function showTag(c) {
    const total = totalOf(c);
    if (c.tag) {
      c.tag.material.map = tagTexture(total);
      c.tag.material.needsUpdate = true;
      c.tag.visible = true;
      return;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tagTexture(total), transparent: true, depthTest: false, depthWrite: false, fog: false
    }));
    sp.renderOrder = 946;
    sp.scale.set(0.40, 0.33, 1);
    sp.position.set(0, 1.72, 0);
    c.root.add(sp);
    c.tag = sp;
  }

  function pay(c, auto) {
    if (!c || c.dead || c.paid) return;
    if (c.state !== 'pay') return;
    c.paid = true;
    const total = totalOf(c);
    if (c.tag) c.tag.visible = false;
    if (c.basket) c.basket.visible = false;
    if (c.bag) c.bag.visible = true;
    c.wave = 1.2;

    if (sfx) {
      if (sfx.beep) sfx.beep();
      setTimeout(function () { if (sfx.cash) sfx.cash(); }, 200);
      setTimeout(function () { if (sfx.print) sfx.print(); }, 560);
      setTimeout(function () { if (sfx.bag) sfx.bag(); }, 980);
    }
    if (shop && shop.addMoney) shop.addMoney(total);

    stats.v += 1;
    stats.r += total;
    stats.t += 1;
    stats.d = dayKey();
    saveStats();
    drawBoard();

    const line = auto
      ? '「' + c.def.name + '」自己扫了一下码，¥' + total + ' 到账'
      : '一共 ¥' + total + '，' + c.def.name + '慢走～';
    sayAtPerson(c, line);
    if (tip) {
      tip((auto ? '客人自己扫码 +¥' : '收银 +¥') + total + ' · 今天第 ' + stats.v + ' 位客人', 3000);
    }

    const qi = queue.indexOf(c);
    if (qi >= 0) queue.splice(qi, 1);
    c.state = 'thanks';
    c.thanksT = 0;
  }

  /* ================= 路径 ================= */
  function goPath(c, pts, done) {
    c.pts = pts.slice();
    c.pi = 0;
    c.onDone = done || null;
    c.moving = true;
  }

  function walkStep(c, dt) {
    if (c.pi >= c.pts.length) { c.moving = false; return; }
    const p = c.pts[c.pi];
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const sp = WALK_SPEED * (c.def.speed || 1);
    if (d < 0.035) {
      c.x = p.x;
      c.z = p.z;
      c.pi++;
      if (c.pi >= c.pts.length) {
        c.moving = false;
        const f = c.onDone;
        c.onDone = null;
        if (f) f(c);
      }
      return;
    }
    const k = Math.min(1, (sp * dt) / d);
    c.x += dx * k;
    c.z += dz * k;
    c.yawTarget = Math.atan2(dx, dz);
    c.moving = true;
  }

  // 小D站得离收银台近就多等一会儿（留给妈妈点"帮TA结账"）
  function payLimit() {
    if (!camera) return PAY_WAIT;
    const dx = camera.position.x - 27.30, dz = camera.position.z - 1.95;
    return (dx * dx + dz * dz < 3.4 * 3.4) ? PAY_WAIT_NEAR : PAY_WAIT;
  }

  /* ================= 状态转移 ================= */
  function startOutside(c) {
    c.state = 'enter';
    goPath(c, IN_PTS, function (cc) { startInside(cc); });
  }

  function startInside(c) {
    const spot = pickSpotFor(c.def, busySpotKey(c));
    c.spot = spot;
    c.state = 'inside';
    const pts = spot.pts.concat([{ x: spot.sx, z: spot.sz }]);
    goPath(c, pts, function (cc) { startBrowse(cc); });
  }

  function startBrowse(c) {
    c.state = 'browse';
    c.wait = 2.4 + Math.random() * 2.4;
    c.yawTarget = yawToward(c.x, c.z, c.spot.lx, c.spot.lz);
    // 挑中的东西：价签和篮子里那只小盒子都按这个来
    if (!c.item || c.item.what !== c.spot.what) {
      c.item = {
        price: c.spot.price,
        what: c.spot.what,
        count: Math.random() < 0.18 ? 2 : 1,
        extra: Math.random() < 0.22 ? 3 : 0
      };
    }
    if (c.basket) c.basket.visible = true;
    if (c.basket) {
      const im = itemMeshFor(c.spot);
      im.name = 'picked';
      im.position.set(0, 0.075, 0);
      c.basket.add(im);
    }
  }

  function startQueue(c) {
    queue.push(c);
    c.state = 'queue';
    const idx = Math.min(queue.length - 1, QUEUE.length - 1);
    const want = QUEUE[idx];
    const pts = c.spot.pts.slice().reverse().concat([{ x: want.x, z: want.z }]);
    goPath(c, pts, null);
  }

  function startExit(c) {
    const edge = c.side < 0 ? EDGE_W : EDGE_E;
    const pts = EXIT_PTS.concat([{ x: edge, z: SIDEWALK_Z }]);
    c.state = 'leave';
    goPath(c, pts, function (cc) { removeCustomer(cc); });
  }

  function removeCustomer(c) {
    if (!c || c.dead) return;
    c.dead = true;
    const qi = queue.indexOf(c);
    if (qi >= 0) queue.splice(qi, 1);
    if (c.tag && c.tag.material) { c.tag.material.dispose(); c.tag = null; }
    if (c.root.parent) c.root.parent.remove(c.root);
    c.pts = [];
    c.onDone = null;
  }

  /* ================= 来人 ================= */
  function spawnNext() {
    if (!crowd) return null;
    const def = pickDef();
    const c = makeCustomer(def);
    spawnFlip = -spawnFlip;
    c.side = spawnFlip;
    c.x = c.side < 0 ? EDGE_W : EDGE_E;
    c.z = SIDEWALK_Z;
    c.yaw = c.yawTarget = c.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    crowd.add(c.root);
    startOutside(c);
    if (tip) tip('叮咚—— ' + def.name + ' 来了', 2400);
    return c;
  }

  function updateSpawn(dt) {
    if (paused) return;
    if (crowd.children.length >= MAX_CROWD) return;
    spawnT -= dt;
    if (spawnT > 0) return;
    spawnNext();
    const h = new Date().getHours();
    const busy = (h >= 7 && h < 10) || (h >= 17 && h < 21);
    spawnT = busy ? (10 + Math.random() * 12) : (16 + Math.random() * 20);
  }

  /* ================= 每帧 ================= */
  function updatePose(c, dt) {
    c.root.position.set(c.x, 0, c.z);
    c.yaw = lerpAngle(c.yaw, c.yawTarget, Math.min(1, dt * 7));
    c.root.rotation.y = c.yaw;

    c.swing += ((c.moving ? 1 : 0) - c.swing) * Math.min(1, dt * 10);
    c.phase += dt * (7.6 + (c.moving ? 3.4 : 0));
    const sw = Math.sin(c.phase) * c.swing;

    if (c.legL) c.legL.rotation.x = sw * 0.62;
    if (c.legR) c.legR.rotation.x = -sw * 0.62;
    if (c.armL) c.armL.rotation.x = -sw * 0.52;

    if (c.armR) {
      if (c.wave > 0) {
        c.wave -= dt * 1.1;
        c.armR.rotation.x = -2.1 + Math.sin(c.t * 13) * 0.26;
        c.armR.rotation.z = -0.30;
      } else {
        c.armR.rotation.x = sw * 0.52;
        c.armR.rotation.z = 0.11;
      }
    }

    if (c.bodyG) {
      c.bodyG.position.y = c.moving
        ? Math.abs(Math.cos(c.phase)) * 0.032 * c.swing
        : Math.sin(c.t * 1.6) * 0.007;
      let lean = 0, look = 0;
      if (c.state === 'browse') { lean = 0.10; look = 0.15; }
      else if (c.state === 'pay') { look = -0.05; }
      c.bodyG.rotation.x += (lean - c.bodyG.rotation.x) * Math.min(1, dt * 5);
      if (c.headG) c.headG.rotation.x += (look - c.headG.rotation.x) * Math.min(1, dt * 5);
    }
  }

  function updateOne(c, dt) {
    c.t += dt;

    if (c.t > STUCK_SEC) {
      removeCustomer(c);
      return;
    }

    // 走路
    if (c.pts.length && c.pi < c.pts.length) walkStep(c, dt);
    else c.moving = false;

    // 状态
    if (c.state === 'browse') {
      c.wait -= dt;
      if (c.wait <= 0) startQueue(c);
    } else if (c.state === 'queue') {
      const idx = queue.indexOf(c);
      if (idx < 0) {
        // 掉出队列了（理论上不会），重新排
        queue.push(c);
      } else if (c.pi >= c.pts.length) {
        // 已经走到队伍里站好了，才往自己的位置挪（前面的人走了就往前一步）
        const want = QUEUE[Math.min(idx, QUEUE.length - 1)];
        const dx = want.x - c.x, dz = want.z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.055) {
          const k = Math.min(1, (WALK_SPEED * 0.85 * dt) / d);
          c.x += dx * k;
          c.z += dz * k;
          c.moving = true;
          c.yawTarget = Math.atan2(dx, dz);
        } else {
          c.x = want.x;
          c.z = want.z;
          c.moving = false;
          c.yawTarget = QUEUE_YAW;
          if (idx === 0) {
            c.state = 'pay';
            c.payT = 0;
            showTag(c);
            if (c.basket) c.basket.visible = true;
            if (sfx && sfx.beep) sfx.beep();
          }
        }
      }
    } else if (c.state === 'pay') {
      c.payT += dt;
      if (c.payT > payLimit()) pay(c, true);
    } else if (c.state === 'thanks') {
      c.thanksT += dt;
      if (c.thanksT > 0.9) startExit(c);
    }

    updatePose(c, dt);
  }

  function update(dt) {
    if (!ready || !crowd) return;

    const inStore = !!isStoreNow();
    // 不在店里的时候：客人原地等着（不然会背着我偷偷赚钱、也白算帧）
    if (!inStore) {
      syncSlots();
      spawnT = Math.max(spawnT, 1.4);
      return;
    }

    let nearest = 99;
    for (let i = crowd.children.length - 1; i >= 0; i--) {
      const c = crowd.children[i].userData.cust;
      if (!c) continue;
      updateOne(c, dt);
      const dx = c.x - DOOR_X, dz = c.z - Z1;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearest) nearest = d;
    }

    // 门铃：客人走到门口也让门滑开（store.js 每帧会把这个数收回去）
    if (inStore && store && store.setDoorProximity) {
      store.setDoorProximity(nearest);
    }

    // 天气配件
    const rainOn = !!(rain && rain.isOn && rain.isOn());
    const snowOn = !!(snow && snow.isOn && snow.isOn());
    for (let i = 0; i < crowd.children.length; i++) {
      const c = crowd.children[i].userData.cust;
      if (!c) continue;
      if (c.umbrella) c.umbrella.visible = rainOn && c.z > 3.62;
      if (c.beanie) c.beanie.visible = snowOn && c.z <= 4.2;
    }

    syncSlots();
    updateSpawn(dt);
  }

  function debug() {
    const list = [];
    if (crowd) {
      for (let i = 0; i < crowd.children.length; i++) {
        const c = crowd.children[i].userData.cust;
        if (!c) continue;
        list.push(c.def.id + ':' + c.state + ':' + c.pi + '/' + c.pts.length +
          '@' + c.x.toFixed(1) + ',' + c.z.toFixed(1) + '/q' + queue.indexOf(c));
      }
    }
    return {
      n: list.length, v: stats.v, r: stats.r, t: Math.round(spawnT * 10) / 10,
      list: list.join(' ')
    };
  }

  /* ================= 调试：立刻来人 ================= */
  function debugSpawn(n) {
    const howMany = Math.max(1, Math.min(MAX_CROWD, n || 1));
    for (let i = 0; i < howMany; i++) {
      const def = CAST[i % CAST.length];
      const c = makeCustomer(def);
      c.side = i % 2 ? 1 : -1;
      crowd.add(c.root);
      if (i === 0) {
        const spot = pickSpotFor(def, null);
        c.spot = spot;
        c.item = { price: spot.price, what: spot.what, count: 1, extra: 0 };
        const q = QUEUE[0];
        c.x = q.x;
        c.z = q.z;
        c.yaw = c.yawTarget = QUEUE_YAW;
        c.state = 'pay';
        c.payT = 0;
        queue.push(c);
        if (c.basket) {
          c.basket.visible = true;
          const im = itemMeshFor(spot);
          im.position.set(0, 0.075, 0);
          c.basket.add(im);
        }
        showTag(c);
      } else if (i === 1) {
        const spot = pickSpotFor(def, 'bread');
        c.spot = spot;
        c.item = { price: spot.price, what: spot.what, count: 1, extra: 0 };
        c.x = spot.sx;
        c.z = spot.sz;
        c.yaw = c.yawTarget = yawToward(spot.sx, spot.sz, spot.lx, spot.lz);
        c.state = 'browse';
        c.wait = 999;
        if (c.basket) {
          c.basket.visible = true;
          const im = itemMeshFor(spot);
          im.position.set(0, 0.075, 0);
          c.basket.add(im);
        }
      } else {
        c.item = { price: 8, what: '面包', count: 1, extra: 0 };
        c.x = c.side < 0 ? EDGE_W : EDGE_E;
        c.z = SIDEWALK_Z;
        c.yaw = c.yawTarget = c.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        startOutside(c);
      }
      updatePose(c, 0);
    }
  }

  /* ================= 调试：五个人排一排（我调比例用；?townline=2 只看第 3 个） ================= */
  function debugLine(only) {
    const list = (typeof only === 'number' && only >= 0 && only < CAST.length)
      ? [CAST[only]] : CAST;
    for (let i = 0; i < list.length; i++) {
      const c = makeCustomer(list[i]);
      c.x = list.length === 1 ? 24.19 : (22.55 + i * 0.82);
      c.z = 1.70;
      c.yaw = c.yawTarget = 0;
      c.state = 'pose';
      crowd.add(c.root);
      updatePose(c, 0);
    }
  }

  /* ================= 总装 ================= */
  function build(opt) {
    opt = opt || {};
    store = opt.store || null;
    interact = opt.interact || null;
    sfx = opt.sfx || null;
    tip = opt.tip || null;
    shop = opt.shop || null;
    rain = opt.rain || null;
    snow = opt.snow || null;
    isStoreNow = opt.isStore || function () { return false; };
    camera = opt.camera || null;

    if (!store || !store.root) return { update: function () {}, debug: function () { return null; } };

    crowd = new THREE.Group();
    crowd.name = 'towns-m30';
    store.root.add(crowd);

    loadStats();
    buildBoard();
    buildStreet();
    initSlots();

    ready = true;

    // 调试参数
    let params = null;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    if (params) {
      if (params.has('townreset')) {
        resetStats();
        drawBoard();
      }
      const crowdParam = params.get('crowd');
      if (crowdParam) {
        const n = parseInt(crowdParam, 10);
        setTimeout(function () { if (ready) debugSpawn(isNaN(n) ? 2 : n); }, 320);
      }
      if (params.has('townline')) {
        const only = parseInt(params.get('townline'), 10);
        setTimeout(function () { if (ready) debugLine(isNaN(only) ? -1 : only); }, 320);
      }
      // ?townff=60 —— 空转 60 秒（截图/自检用，无头模式下画面几乎不动，用它看流程）
      const ff = parseFloat(params.get('townff'));
      if (ff > 0) {
        setTimeout(function () {
          if (!ready) return;
          const steps = Math.min(6000, Math.round(ff * 20));
          for (let i = 0; i < steps; i++) update(0.05);
        }, 600);
      }
    }

    return {
      update: update,
      debug: debug,
      spawnNow: function (n) { debugSpawn(n || 1); },
      setPaused: function (v) { paused = !!v; },
      stats: function () { return { visits: stats.v, revenue: stats.r, total: stats.t }; },
      ground: function () { return street; }
    };
  }

  /* ================= M36：给别的地方复用这套小人（乐园的游客） =================
   * 乐园不想再画一套人，就把这里的"壳"借出去：拿一个走路的小人 + 一个最小的走路姿态。
   * 购物那套状态机不动，乐园自己的流程写在 parkpeople.js 里。
   */
  function castList() { return CAST; }

  function newWalker(def) {
    const root = templateOf(def).clone(true);
    root.visible = true;
    root.position.set(0, 0, 0);
    const w = {
      def: def, root: root,
      legL: root.getObjectByName('legL'),
      legR: root.getObjectByName('legR'),
      armL: root.getObjectByName('armL'),
      armR: root.getObjectByName('armR'),
      bodyG: root.getObjectByName('bodyG'),
      headG: root.getObjectByName('headG'),
      x: 0, y: 0, z: 0, yaw: 0, yawTarget: 0,
      t: 0, phase: Math.random() * 6, swing: 0, moving: false, wave: 0
    };
    root.userData.walker = w;
    return w;
  }

  // 走路 / 站着 / 挥手的姿态（opt: { armUp, lean, lookYaw }）
  function poseWalker(w, dt, opt) {
    const o = opt || {};
    w.root.position.set(w.x, w.y || 0, w.z);
    w.yaw = lerpAngle(w.yaw, w.yawTarget, Math.min(1, dt * 7));
    w.root.rotation.y = w.yaw;
    w.swing += ((w.moving ? 1 : 0) - w.swing) * Math.min(1, dt * 10);
    w.phase += dt * (7.6 + (w.moving ? 3.4 : 0));
    const sw = Math.sin(w.phase) * w.swing;
    if (w.legL) w.legL.rotation.x = sw * 0.62;
    if (w.legR) w.legR.rotation.x = -sw * 0.62;
    if (w.armL) w.armL.rotation.x = -sw * 0.52;
    if (w.armR) {
      if (w.wave > 0) {
        w.wave -= dt * 1.1;
        w.armR.rotation.x = -2.1 + Math.sin(w.t * 13) * 0.26;
        w.armR.rotation.z = -0.30;
      } else if (o.armUp) {
        w.armR.rotation.x = -0.95 + Math.sin(w.t * 6) * 0.18;
        w.armR.rotation.z = -0.22;
      } else {
        w.armR.rotation.x = sw * 0.52;
        w.armR.rotation.z = 0.11;
      }
    }
    if (w.bodyG) {
      w.bodyG.position.y = w.moving
        ? Math.abs(Math.cos(w.phase)) * 0.032 * w.swing
        : Math.sin(w.t * 1.6) * 0.007;
      w.bodyG.rotation.x += ((o.lean || 0) - w.bodyG.rotation.x) * Math.min(1, dt * 5);
    }
    if (w.headG) {
      w.headG.rotation.y += ((o.lookYaw || 0) - w.headG.rotation.y) * Math.min(1, dt * 4);
      w.headG.rotation.x += ((o.lookPitch || 0) - w.headG.rotation.x) * Math.min(1, dt * 4);
    }
  }

  return {
    build: build,
    // M36：乐园游客复用
    cast: castList,
    newWalker: newWalker,
    poseWalker: poseWalker
  };
})();
