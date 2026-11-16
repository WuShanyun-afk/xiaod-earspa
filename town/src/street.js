/* 小D的赛博小家 · M39 鲸鱼街（小镇的主街）
 *
 * 妈妈 2026-11-14 14:29：「好啦，你继续想想怎么建设你的小镇吧」→ 挑的第 ① 块：先把街修起来。
 *
 * 为什么先修街：家 / 便利店 / 水上乐园本来在同一个 scene 里，但隔了几十米、平时互相看不见，
 * 全靠黑场「嗖」一下瞬移 —— 那是三张明信片。这条街把三张明信片串成一个小镇：
 *   北端是我们家的楼门 → 往南走是街，街角是便利店 → 再往南出「南门」就是水上乐园。
 *
 * 这条街上有：
 *   - 60m 长的柏油街 + 两侧人行道（有路牙、斑马线、中间虚线）
 *   - 四间有门面的小房子：咖啡馆 / 书店 / 面包房 / 邮局（先只做外观，点门我会说「还没开门」）
 *   - 路灯（夜里一盏盏亮）、长椅、行道树、公交站、街口路牌、红色邮筒、消防栓
 *   - 街上的居民（借用 M30 便利店那套小人，自己走来走去，点一下会打招呼）
 *   - 三扇门：回家 / 进便利店 / 南门去乐园 —— **走到门口就会触发**（不用找按钮）
 *
 * 调试：?venue=street 直接站街上；可叠 ?pos=x,z&yaw=&pitch= 调构图；
 *       ?streetff=N 空转 N 秒（截图用）；?streetspawn=N 立刻召唤 N 个居民；?diag=1 里 street=
 */
window.XD = window.XD || {};

XD.Street = (function () {
  'use strict';

  /* ================= 场地 ================= */
  const CX = 66;                    // 街中心线
  const X0 = 62.2, X1 = 69.8;       // 柏油 7.6m
  const SW = 1.2;                   // 人行道宽
  const WX0 = X0 - SW, WX1 = X1 + SW;   // 61.0 ~ 71.0
  const Z0 = -30, Z1 = 30;          // 街长 60m
  const SW_Y = 0.14;                // 人行道比路面口 14cm
  const DEPTH = 6.5;                // 两边房子的进口
  const H = 6.4;                    // 两层门面口
  const WEST_FACE = WX0;            // 西侧门面口 x = 61.0
  const EAST_FACE = WX1;            // 东侧门面口 x = 71.0

  // 三扇口 / 触发口
  const HOME_Z = 30.6;              // 家门口那栋楼的门口 z
  const DOOR_HOME = { x: 66.4, z: HOME_Z };
  const DOOR_STORE = { x: EAST_FACE, z: -3.0 };
  const GATE_Z = -30.2;

  // M40：街心广场（在街西侧那块草坪上，东边开口通人行道口
  const PLZ = { x0: 54.0, x1: 61.25, z0: -24.0, z1: -10.0 };
  // M78：广场南边新铺的「冬夜集市」（festival.js 在那块地上盖东西，坐标要对上）
  const FEST = { x0: 54.4, x1: 61.4, z0: -30.0, z1: -23.9 };
  const PLZ_CX = (PLZ.x0 + PLZ.x1) / 2;
  const PLZ_CZ = (PLZ.z0 + PLZ.z1) / 2;
  const FOUNT_R = 1.75;
  const CLOCK = { x: 55.0, z: -12.9 };
  const BOARD = { x: PLZ.x0 + 0.55, z: -21.2 };

  const WALK_SPEED = 1.55;

  /* ================= 状口 ================= */
  let scene = null, root = null, interact = null, sfx = null, renderer = null;
  let isStreetNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let frames = null;
  let residents = [], hots = [];
  let cool = 0;
  let t = 0;
  let wasIn = false;
  let plaza = null;                 // M40：广场的动效零件（水口 / 气球 / 钟面 / 灯）
  let busHot = null, postHot = null; // M42：公口 / 邮差 的可点热口
  let maxAniso = 4;                 // 显卡支持的各向异性（路口抖不抖靠它）

  /* ================= 小工口 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex), roughness: rough === undefined ? 0.9 : rough, metalness: metal || 0
    });
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---------- 画布贴图 ---------- */
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  // 招牌：一块浅色底 + 口
  function signTex(main, sub, bg, fg, accent) {
    return canvasTex(512, 192, function (g, W, Hh) {
      g.fillStyle = bg || '#fbf6ea';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = accent || '#b98f5e';
      g.lineWidth = 10;
      g.strokeRect(7, 7, W - 14, Hh - 14);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = fg || '#2f3442';
      g.font = 'bold ' + (sub ? 64 : 78) + 'px "Microsoft YaHei", sans-serif';
      g.fillText(main, W / 2, sub ? 78 : 96);
      if (sub) {
        g.fillStyle = accent || '#b98f5e';
        g.font = '30px "Microsoft YaHei", sans-serif';
        g.fillText(sub, W / 2, 140);
      }
    });
  }

  // 墙面的灰泥质感（灰阶贴图，乘在墙的颜色上口
  let plasterTex = null;
  function makePlaster() {
    plasterTex = canvasTex(256, 256, function (g, W, Hh) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 5200; i++) {
        const v = 226 + Math.random() * 29;
        g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.5)';
        g.fillRect(Math.random() * W, Math.random() * Hh, 2, 2);
      }
      g.strokeStyle = 'rgba(120,110,96,.16)';
      g.lineWidth = 1;
      for (let y = 0; y < Hh; y += 42) {
        g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      }
      for (let x = 0; x < W; x += 84) {
        g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, Hh); g.stroke();
      }
    });
    plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
    plasterTex.repeat.set(2, 2);
  }
  function wallMat(hex) {
    return new THREE.MeshStandardMaterial({
      color: col(hex), map: plasterTex || null, roughness: 0.94
    });
  }
  function stripeTex(a, b) {
    return canvasTex(256, 64, function (g, W, Hh) {
      const n = 8, sw = W / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = i % 2 ? (b || '#fbf3e2') : a;
        g.fillRect(i * sw, 0, sw + 1, Hh);
      }
      g.fillStyle = 'rgba(0,0,0,.06)';
      g.fillRect(0, Hh - 10, W, 10);
    });
  }

  // 背光楼的窗格（夜里亮口
  /* M74：远处的楼"白天是一块灰板" —— 以前窗格只画在 emissiveMap 里（白天强度 0，看不见），
   * 于是背景楼就是一整面纯灰。现在再画一张"白天的立面"当 map：
   * 浅墙 + 一格格窗玻璃 + 楼层线，夜里的发光窗还是走 emissiveMap。 */
  function facadeTex(cols, rows) {
    return canvasTex(256, 256, function (g, W, Hh) {
      g.fillStyle = '#e9edf1';
      g.fillRect(0, 0, W, Hh);
      const cw = W / cols, ch = Hh / rows;
      for (let k = 0; k < rows; k++) {
        // 楼层分隔线
        g.fillStyle = 'rgba(150,160,172,.55)';
        g.fillRect(0, k * ch, W, 1.5);
        for (let i = 0; i < cols; i++) {
          // 窗：玻璃偏冷，偶尔一块反光更亮
          const light = Math.random() < 0.22;
          g.fillStyle = light ? '#cfdde8' : (Math.random() < 0.5 ? '#a9b8c6' : '#b6c4d1');
          g.fillRect(i * cw + cw * 0.20, k * ch + ch * 0.26, cw * 0.60, ch * 0.46);
          // 窗框
          g.strokeStyle = 'rgba(120,132,146,.5)';
          g.lineWidth = 1;
          g.strokeRect(i * cw + cw * 0.20, k * ch + ch * 0.26, cw * 0.60, ch * 0.46);
        }
      }
    });
  }

  function windowGridTex(cols, rows) {
    return canvasTex(256, 256, function (g, W, Hh) {
      g.fillStyle = '#11161f';
      g.fillRect(0, 0, W, Hh);
      const cw = W / cols, ch = Hh / rows;
      for (let i = 0; i < cols; i++) {
        for (let k = 0; k < rows; k++) {
          const lit = Math.random() < 0.45;
          g.fillStyle = lit
            ? ['#ffd89a', '#ffe9bf', '#ffcf87', '#cfe0ff'][Math.floor(Math.random() * 4)]
            : '#242c38';
          g.fillRect(i * cw + cw * 0.22, k * ch + ch * 0.24, cw * 0.56, ch * 0.46);
        }
      }
    });
  }

  /* ================= 地：草地 / 柏油 / 人行口 ================= */
  function buildGround() {
    // 远处草地（整块大板，别让人看口 世界的边"口
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), std(0x6f8a5e, 0.98));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(CX, -0.04, 0);
    grass.receiveShadow = true;
    root.add(grass);

    // 柏油：颗粒要"口 ，不然走动的时候会一闪一闪（高频噪点 + 斜着口 = 摩尔纹）
    const asphaltTex = canvasTex(512, 512, function (g, W, Hh) {
      g.fillStyle = '#3a3f48';
      g.fillRect(0, 0, W, Hh);
      // 小块深浅（低频）：九个方向各画一遍，贴图接缝才看不出来（不然走路时一条条格子在闪口
      for (let i = 0; i < 26; i++) {
        const r = 14 + Math.random() * 34;
        const cx2 = Math.random() * W, cy2 = Math.random() * Hh;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const px = cx2 + dx * W, py = cy2 + dy * Hh;
            const grd = g.createRadialGradient(px, py, 0, px, py, r);
            grd.addColorStop(0, 'rgba(255,255,255,.03)');
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(px - r, py - r, r * 2, r * 2);
          }
        }
      }
      // 细小颗粒（低对比，圆点，口 2px 硬点；边缘的也补一份，接缝才连续）
      for (let i = 0; i < 1600; i++) {
        const v = 52 + Math.random() * 24;
        const dx0 = Math.random() * W, dy0 = Math.random() * Hh;
        const rr = 0.8 + Math.random() * 1.1;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            g.fillStyle = 'rgba(' + v + ',' + (v + 4) + ',' + (v + 10) + ',.2)';
            g.beginPath();
            g.arc(dx0 + dx * W, dy0 + dy * Hh, rr, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    });
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(4, 28);
    if (maxAniso > 4) asphaltTex.anisotropy = maxAniso;   // 斜着看也清楚，不口
    const asphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex, color: 0xffffff, roughness: 0.96, metalness: 0
    });
    const road = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.12, Z1 - Z0), asphaltMat);
    road.position.set(CX, -0.06, 0);
    road.receiveShadow = true;
    root.add(road);

    // 人行口 + 路牙（铺装方砖，别是一块灰板）
    const walkTex = canvasTex(512, 512, function (g, W, Hh) {
      g.fillStyle = '#b6ab98';
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 1800; i++) {
        const v = 160 + Math.random() * 44;
        g.fillStyle = 'rgba(' + v + ',' + (v - 6) + ',' + (v - 18) + ',.16)';
        g.beginPath();
        g.arc(Math.random() * W, Math.random() * Hh, 1 + Math.random() * 1.4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(120,110,94,.32)';
      g.lineWidth = 2;
      for (let y = 0; y <= Hh; y += 64) {
        g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      }
      for (let x = 0; x <= W; x += 64) {
        g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, Hh); g.stroke();
      }
    });
    walkTex.wrapS = walkTex.wrapT = THREE.RepeatWrapping;
    walkTex.repeat.set(1, 15);
    if (maxAniso > 4) walkTex.anisotropy = maxAniso;
    const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, color: 0xffffff, roughness: 0.95 });
    const curbMat = std(0x8d8578, 0.92);
    [-1, 1].forEach(function (s) {
      const wx = s < 0 ? WX0 + SW / 2 : WX1 - SW / 2;
      const w = box(SW, SW_Y, Z1 - Z0, walkMat, wx, SW_Y / 2, 0);
      w.receiveShadow = true;
      // 路牙（靠马路那侧的一条亮边）
      const cx2 = s < 0 ? WX0 + SW - 0.07 : WX1 - SW + 0.07;
      box(0.14, SW_Y + 0.02, Z1 - Z0, curbMat, cx2, (SW_Y + 0.02) / 2, 0);
    });

    // 中间虚线（离路面口 1.5cm，别跟路面贴在一起打架）
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.8 });
    for (let z = Z0 + 3; z < Z1 - 2; z += 4.4) {
      const m = box(0.16, 0.012, 2.2, lineMat, CX, 0.021, z);
      m.castShadow = false;
    }
    // 斑马线（南门 / 家门口各一条）
    [-27.2, 27.2].forEach(function (zz) {
      for (let i = 0; i < 5; i++) {
        box(0.62, 0.012, 2.4, lineMat, CX - 2.8 + i * 1.4, 0.021, zz).castShadow = false;
      }
    });
    // 井盖
    const mhMat = std(0x4a4f57, 0.85, 0.2);
    [-9, 12].forEach(function (zz) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 18), mhMat);
      m.position.set(CX + (zz > 0 ? 1.6 : -1.9), 0.032, zz);
      m.receiveShadow = true;
      root.add(m);
    });
  }

  /* ================= 一间门面 =================
   * local 坐标：宽 w、高 h、进深 d，门面朝 +z（z = d/2）。
   * side: 'west' 放在街西侧（门面朝 +x，转 90°）、'east' 放在东侧（朝 -x，转 -90°）
   */
  function shopFront(o) {
    const g = new THREE.Group();
    const w = o.w || 8, h = o.h || H, d = o.d || DEPTH;
    const wall = wallMat(o.wall || 0xe0cfb4);
    const trim = std(o.trim || 0x8f7a60, 0.9);
    const glass = new THREE.MeshStandardMaterial({
      color: col(o.glass || 0x46545e), roughness: 0.16, metalness: 0.12,
      transparent: true, opacity: 0.62,
      emissive: col(o.lit || 0xffc97a), emissiveIntensity: 0
    });
    frames = frames || {};

    // 楼体
    box(w, h, d, wall, 0, h / 2, 0, g);
    // 勒脚
    box(w + 0.06, 0.5, d + 0.06, std(0x9c9284, 0.95), 0, 0.25, 0, g);
    // 檐口
    box(w + 0.5, 0.26, d + 0.5, trim, 0, h - 0.14, 0, g);
    // 屋顶压边
    box(w + 0.34, 0.18, d + 0.34, std(0x7d6e5a, 0.9), 0, h + 0.06, 0, g);
    // 侧面：一条落水管 + 两块小窗（不然从街上看是一整面白墙口
    cyl(0.06, 0.06, h - 0.5, 8, std(0x8a8175, 0.9), w / 2 + 0.02, (h - 0.5) / 2, -d / 2 + 0.3, g);
    [-1, 1].forEach(function (s) {
      const sideWin = new THREE.MeshStandardMaterial({
        color: col(0x2f3b44), roughness: 0.35, metalness: 0.1,
        emissive: col(0xffc07a), emissiveIntensity: 0
      });
      (frames.glass || (frames.glass = [])).push(sideWin);
      const sw = box(0.1, 1.0, 0.85, sideWin, s * (w / 2 + 0.01), 4.4, -0.5, g);
      sw.castShadow = false;
    });

    // 一层店面：室内背墙 + 橱窗 + 门框（不是一块黑洞洞的玻璃）
    const shopW = w * 0.74;
    const insideMat = new THREE.MeshStandardMaterial({
      color: col(o.inside || 0xb9a486), roughness: 0.95,
      emissive: col(0xffdfa8), emissiveIntensity: 0.18
    });
    box(shopW - 0.2, 2.2, 0.1, insideMat, 0, 1.5, -d / 2 + 0.35, g).castShadow = false;
    const shelfMat = std(0x8f7452, 0.92);
    for (let i = 0; i < 2; i++) {
      box(shopW - 0.6, 0.06, 0.34, shelfMat, 0, 0.95 + i * 0.62, -d / 2 + 1.1, g).castShadow = false;
    }
    const win = box(shopW, 2.0, 0.10, glass, 0, 1.55, d / 2 + 0.03, g);
    win.castShadow = false;
    (frames.glass || (frames.glass = [])).push(glass);
    // 橱窗木框 + 竖挺
    box(shopW + 0.16, 0.1, 0.14, trim, 0, 0.55, d / 2 + 0.04, g);
    box(shopW + 0.16, 0.1, 0.14, trim, 0, 2.56, d / 2 + 0.04, g);
    [-1, 1].forEach(function (s) {
      box(0.1, 2.1, 0.14, trim, s * (shopW / 2 + 0.05), 1.55, d / 2 + 0.04, g);
    });
    [-0.5, 0, 0.5].forEach(function (k) {
      box(0.06, 2.0, 0.12, trim, k * shopW * 0.8, 1.55, d / 2 + 0.05, g).castShadow = false;
    });
    // 口
    const doorX = w * 0.26;
    // M55：门板往前挪 9cm（0.04 → 0.13），把底框 / 竖挺 / 橱窗压条全挡在门板后面，
    // 不然从街上看门中间会横一道杠、竖一根条（四个门面都走这里）。
    box(1.05, 2.2, 0.1, std(o.doorColor || 0x6b503a, 0.85), doorX, 1.1, d / 2 + 0.13, g);
    box(0.08, 0.5, 0.06, std(0xc9a86a, 0.4, 0.6), doorX + 0.36, 1.12, d / 2 + 0.19, g);
    box(1.3, 0.1, 0.4, std(0x9c9284, 0.9), doorX, 0.05, d / 2 + 0.2, g);

    // 招牌（发光字，夜里会亮）
    const signMat = new THREE.MeshBasicMaterial({ map: signTex(o.sign, o.sub, o.signBg, o.signFg, o.accent) });
    signMat.toneMapped = false;
    const sign = plane(w * 0.46, 0.8, signMat, 0, 3.42, d / 2 + 0.09, g);
    sign.castShadow = false;
    (frames.signs || (frames.signs = [])).push(signMat);

    // 遮阳口
    if (o.awning !== false) {
      const awnTex = stripeTex(o.accent || '#c98a5a', '#fbf3e2');
      awnTex.wrapS = awnTex.wrapT = THREE.RepeatWrapping;
      awnTex.repeat.set(w / 2.2, 1);
      const awnMat = new THREE.MeshStandardMaterial({ map: awnTex, roughness: 0.9, side: THREE.DoubleSide });
      const aw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, 1.15), awnMat);
      aw.position.set(0, 2.86, d / 2 + 0.52);
      aw.rotation.x = -1.22;
      aw.castShadow = true;
      g.add(aw);
      // 棚边垂布
      box(w * 0.86, 0.2, 0.03, awnMat, 0, 2.6, d / 2 + 1.06, g).castShadow = false;
    }

    // 二层：窗 + 窗台 + 小阳口
    const winMat = new THREE.MeshStandardMaterial({
      color: col(0x6f818c), roughness: 0.22, metalness: 0.15,
      emissive: col(0xffc07a), emissiveIntensity: 0
    });
    (frames.glass || (frames.glass = [])).push(winMat);
    [-1, 1].forEach(function (s) {
      const wx = s * w * 0.31;
      const pane = box(1.5, 1.35, 0.1, winMat, wx, 4.62, d / 2 + 0.03, g);
      pane.castShadow = false;
      box(1.7, 0.1, 0.11, trim, wx, 3.9, d / 2 + 0.06, g);       // 窗台
      box(1.65, 0.06, 0.05, trim, wx, 5.32, d / 2 + 0.07, g);     // 窗楣
      box(0.06, 1.4, 0.05, trim, wx, 4.62, d / 2 + 0.07, g);      // 中挺
      // 花盆
      const pot = box(0.42, 0.28, 0.3, std(0xb56b52, 0.9), wx, 3.78, d / 2 + 0.16, g);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
          std(i === 1 ? 0xe8b44a : 0xd76b6b, 0.9));
        f.position.set(wx + (i - 1) * 0.11, 4.0, d / 2 + 0.16);
        f.castShadow = false;
        g.add(f);
      }
      pot.castShadow = true;
    });

    // 壁灯（门上方口
    const lampMat = new THREE.MeshStandardMaterial({
      color: col(0xffe3b0), emissive: col(0xffc46a), emissiveIntensity: 1.0, roughness: 0.6
    });
    box(0.16, 0.1, 0.34, trim, doorX, 2.72, d / 2 + 0.18, g);
    const bulb = box(0.22, 0.16, 0.22, lampMat, doorX, 2.62, d / 2 + 0.34, g);
    bulb.castShadow = false;
    (frames.bulbs || (frames.bulbs = [])).push(lampMat);

    // 垂出来的小招牌（挂着的那块，从街上一眼能看到口
    if (o.hang !== false) {
      const hangMat = new THREE.MeshBasicMaterial({
        map: signTex(o.sign.length > 4 ? o.sign.slice(0, 4) : o.sign, null, o.signBg, o.signFg, o.accent),
        side: THREE.DoubleSide
      });
      hangMat.toneMapped = false;
      const board = plane(1.15, 0.5, hangMat, -w * 0.3, 3.58, d / 2 + 0.62, g, 0, Math.PI / 2);
      board.castShadow = true;
      box(0.05, 0.05, 0.55, trim, -w * 0.3, 3.88, d / 2 + 0.3, g).castShadow = false;
    }

    // 门口地垫 + 小盆口
    box(1.1, 0.02, 0.5, std(0x7c6a58, 0.95), doorX, 0.02, d / 2 + 0.55, g).castShadow = false;
    plant(0, 0, d / 2 + 0.55, g, o.accent || '#c98a5a');

    // 放到街上（注意：门面口 x = WEST_FACE / EAST_FACE，楼体往后退半个进深口
    const isWest = o.side === 'west';
    g.position.set(isWest ? WEST_FACE - d / 2 : EAST_FACE + d / 2, 0, o.z);
    g.rotation.y = isWest ? Math.PI / 2 : -Math.PI / 2;
    root.add(g);
    return g;
  }

  // 一盆植物（放门口）
  function plant(x, y, z, parent, accent) {
    const potMat = std(0xa9604b, 0.92);
    cyl(0.19, 0.15, 0.3, 10, potMat, x, 0.15, z, parent);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), std(0x4f7a4a, 0.95));
      leaf.position.set(x + Math.cos(a) * 0.12, 0.4 + (i % 2) * 0.08, z + Math.sin(a) * 0.12);
      leaf.scale.set(1, 1.35, 1);
      leaf.castShadow = true;
      (parent || root).add(leaf);
    }
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), std(accent || 0xd76b6b, 0.85));
    flower.position.set(x, 0.54, z);
    flower.castShadow = false;
    (parent || root).add(flower);
  }

  /* ================= 过街的串灯（晚上最好看的那条） ================= */
  function stringLights(z) {
    const g = new THREE.Group();
    const y0 = 4.9, sag = 0.55;
    const N = 21;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = WX0 + (WX1 - WX0) * u;
      const y = y0 - Math.sin(u * Math.PI) * sag;
      pts.push(new THREE.Vector3(x, y, z));
      if (i % 2 === 0 && i > 0 && i < N - 1) {
        const mat = new THREE.MeshStandardMaterial({
          color: col(0xfff2cf), emissive: col(0xffc978), emissiveIntensity: 1.1, roughness: 0.4
        });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), mat);
        b.position.copy(pts[pts.length - 1]);
        b.position.y -= 0.07;
        g.add(b);
        (frames.bulbs || (frames.bulbs = [])).push(mat);
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const wire = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2b2620 }));
    g.add(wire);
    root.add(g);
  }

  /* ================= 靠墙的自行车 ================= */
  function bicycle(x, z, ry, baseY) {
    const g = new THREE.Group();
    const frameMat = std(0x3f6b58, 0.6, 0.3);
    const tireMat = std(0x2a2d33, 0.9);
    [-0.42, 0.42].forEach(function (dz) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 18), tireMat);
      wheel.position.set(0, 0.33, dz);
      wheel.rotation.y = Math.PI / 2;
      wheel.castShadow = true;
      g.add(wheel);
    });
    const bar = box(0.05, 0.05, 0.84, frameMat, 0, 0.52, 0, g);
    bar.rotation.x = 0.16;
    box(0.05, 0.05, 0.5, frameMat, 0, 0.4, -0.18, g).rotation.x = -0.5;
    box(0.05, 0.42, 0.05, frameMat, 0, 0.55, -0.42, g);
    box(0.4, 0.04, 0.04, frameMat, 0, 0.78, -0.44, g);          // 车把
    box(0.22, 0.05, 0.3, std(0x3a2f28, 0.9), 0, 0.72, 0.34, g); // 车座
    g.position.set(x, baseY === undefined ? SW_Y : baseY, z);
    g.rotation.y = ry || 0;
    g.rotation.z = 0.09;
    root.add(g);
  }

  /* ================= 路边的花口 / 小鸽口 ================= */
  function flowerBox(x, z, baseY, ry) {
    const g = new THREE.Group();
    box(1.5, 0.34, 0.5, std(0x7d5b3f, 0.92), 0, 0.17, 0, g);
    box(1.42, 0.06, 0.42, std(0x4a3c2e, 0.98), 0, 0.35, 0, g);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), std(0x4f7a4a, 0.95));
      leaf.position.set(-0.62 + i * 0.2, 0.46, (i % 2 ? 0.1 : -0.1));
      leaf.scale.set(1, 1.3, 1);
      g.add(leaf);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 5),
        std(i % 3 === 0 ? 0xe8b44a : (i % 3 === 1 ? 0xd76b6b : 0xdfe4ea), 0.85));
      f.position.set(-0.62 + i * 0.2, 0.6, (i % 2 ? 0.1 : -0.1));
      g.add(f);
    }
    g.position.set(x, baseY || 0, z);
    g.rotation.y = ry || 0;
    root.add(g);
  }

  function pigeon(x, z, ry, baseY) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), std(0x7e8794, 0.85));
    body.scale.set(1, 0.9, 1.25);
    body.position.y = 0.09;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0x8a93a1, 0.85));
    head.position.set(0, 0.17, 0.08);
    g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), std(0xc9955a, 0.9));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.165, 0.14);
    g.add(beak);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, 0.11), std(0x6b7380, 0.9));
    tail.position.set(0, 0.1, -0.13);
    g.add(tail);
    // M55：地面不是一个高度 —— 广场台面 0.12、人行道 0.14。以前一律放 y=0，
    // 半个身子埋在地里（妈妈截图里"鸽子钻到地下"），点一下扑腾也还是在土里。
    g.position.set(x, baseY || 0, z);
    g.rotation.y = ry || 0;
    root.add(g);
    (frames.pigeons || (frames.pigeons = [])).push({
      g: g, x: x, z: z, baseY: baseY || 0, hop: 0, ph: Math.random() * 6
    });
    return g;
  }

  /* ================= 北端：我们家楼门 ================= */
  function buildHomeEntrance() {
    const g = new THREE.Group();
    const w = 13.5, h = 8.2, d = 6.4;
    const wall = wallMat(0xd9cbb2);
    const trim = std(0x8f7a60, 0.9);

    box(w, h, d, wall, 0, h / 2, 0, g);
    box(w + 0.4, 0.4, d + 0.4, trim, 0, 1.9, 0, g);        // 一层腰口
    box(w + 0.6, 0.3, d + 0.6, trim, 0, h - 0.16, 0, g);   // 檐口
    box(w + 0.34, 0.3, d + 0.34, std(0x7d6e5a, 0.9), 0, h + 0.1, 0, g);

    // 门洞（凹进去一点）
    const doorMat = std(0x8a6647, 0.8);
    box(2.2, 2.7, 0.5, std(0x4f4034, 0.9), 0.4, 1.35, d / 2 + 0.12, g);
    box(2.0, 2.5, 0.12, doorMat, 0.4, 1.25, d / 2 + 0.3, g);
    box(0.09, 0.55, 0.08, std(0xc9a86a, 0.4, 0.6), 1.15, 1.3, d / 2 + 0.37, g);
    // 门牌 39
    const noMat = new THREE.MeshBasicMaterial({ map: signTex('39', null, '#fbf6ea', '#3a3128', '#c98a5a') });
    noMat.toneMapped = false;
    plane(0.52, 0.36, noMat, -1.42, 2.15, d / 2 + 0.06, g);
    // 台阶
    box(3.0, 0.14, 0.7, std(0xa79c8a, 0.92), 0.4, 0.07, d / 2 + 0.75, g);
    box(2.6, 0.14, 0.5, std(0xa79c8a, 0.92), 0.4, 0.21, d / 2 + 0.5, g);
    // 门廊口 + 门牌
    const porchMat = new THREE.MeshStandardMaterial({
      color: col(0xffe9c2), emissive: col(0xffc46a), emissiveIntensity: 1.4, roughness: 0.5
    });
    box(0.3, 0.2, 0.3, porchMat, 0.4, 2.95, d / 2 + 0.45, g);
    (frames.porch || (frames.porch = [])).push(porchMat);

    // 门上方的楼名口
    const sm = new THREE.MeshBasicMaterial({ map: signTex('小D家', 'NO.39 鲸鱼街', '#fbf6ea', '#2f3442', '#c98a5a') });
    sm.toneMapped = false;
    plane(2.9, 1.09, sm, 0.4, 3.85, d / 2 + 0.1, g);
    // 左右各一扇亮着的窗（回家的人抬头就能看见）
    const winMat = new THREE.MeshStandardMaterial({
      color: col(0x2a3540), roughness: 0.3, metalness: 0.1, emissive: col(0xffc07a), emissiveIntensity: 0
    });
    (frames.glass || (frames.glass = [])).push(winMat);
    [-4.3, 4.6].forEach(function (wx) {
      box(1.9, 1.5, 0.1, winMat, wx, 5.0, d / 2 + 0.03, g).castShadow = false;
      box(2.1, 0.12, 0.13, trim, wx, 4.2, d / 2 + 0.06, g);
    });
    // 雨棚
    const awnMat = new THREE.MeshStandardMaterial({
      map: stripeTex('#c98a5a', '#fbf3e2'), roughness: 0.9, side: THREE.DoubleSide
    });
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.2), awnMat);
    awn.position.set(0.4, 3.42, d / 2 + 0.55);
    awn.rotation.x = -1.22;
    g.add(awn);
    // 门口的小东西：信箱、两块绿植、一把伞
    const mb = box(0.36, 0.5, 0.24, std(0x9c4438, 0.85), 2.35, 0.95, d / 2 + 0.5, g);
    box(0.4, 0.06, 0.28, std(0x6d3028, 0.85), 2.35, 1.22, d / 2 + 0.5, g);
    box(0.05, 0.75, 0.05, std(0x6b5a48, 0.9), 2.35, 0.38, d / 2 + 0.5, g);
    plant(-2.0, 0, d / 2 + 0.5, g, '#d76b6b');
    plant(3.6, 0, d / 2 + 0.5, g, '#e8b44a');
    // 伞桶
    cyl(0.2, 0.18, 0.6, 10, std(0x6b7a86, 0.9), -1.1, 0.3, d / 2 + 0.5, g);
    cyl(0.06, 0.06, 1.0, 6, std(0x9c4438, 0.9), -1.05, 0.95, d / 2 + 0.5, g);

    g.position.set(66, 0, HOME_Z + d / 2);
    g.rotation.y = Math.PI;      // 门面口 -z（朝街里口
    root.add(g);
  }

  /* ================= 东侧：便利店口 2~18 号那栋？不，是街角那家） ================= */
  function buildStore() {
    const g = new THREE.Group();
    const w = 10, h = H + 0.6, d = DEPTH;
    const wall = wallMat(0xdfe3d8);
    box(w, h, d, wall, 0, h / 2, 0, g);
    box(w + 0.4, 0.28, d + 0.4, std(0x7f8b7c, 0.9), 0, h - 0.14, 0, g);
    // 绿色腰线（便利店招牌色）
    box(w + 0.2, 0.34, d + 0.2, std(0x2f7d63, 0.85), 0, 3.02, 0, g);
    box(w + 0.2, 0.2, d + 0.2, std(0xe9f2ea, 0.85), 0, 3.3, 0, g);

    // 一层整面玻璃（亮着，像 24h 店）
    const glass = new THREE.MeshStandardMaterial({
      color: col(0x46545e), roughness: 0.14, metalness: 0.12,
      transparent: true, opacity: 0.5,
      emissive: col(0xfff0c8), emissiveIntensity: 0
    });
    (frames.glass || (frames.glass = [])).push(glass);
    box(w * 0.82, 2.3, 0.1, glass, 0, 1.5, d / 2 + 0.03, g).castShadow = false;
    // 里面的货架影子（让玻璃不是一块死板）
    for (let i = 0; i < 3; i++) {
      const shelf = box(0.9, 1.5, 0.3, std(0x9aa4a0, 0.9), -2.6 + i * 1.3, 0.95, d / 2 - 0.6, g);
      shelf.material.transparent = true;
      shelf.material.opacity = 0.9;
    }
    // 门（开着口
    box(1.5, 2.35, 0.14, std(0x30463e, 0.75, 0.15), 2.2, 1.2, d / 2 + 0.1, g);
    box(1.3, 2.2, 0.04, glass, 2.2, 1.2, d / 2 + 0.19, g).castShadow = false;
    // 招牌：绿底白口 + 一点灯管光
    const sm = new THREE.MeshBasicMaterial({ map: signTex('便利店 24H', '生鲜 · 便当 · 关东煮', '#2f7d63', '#f6fbf2', '#cfe8d2') });
    sm.toneMapped = false;
    plane(w * 0.56, w * 0.56 * 0.375, sm, 0, 4.05, d / 2 + 0.12, g);
    // 二层：员工室的小窗（暖黄、半拉着窗帘口
    const winMat = new THREE.MeshStandardMaterial({
      color: col(0x2a3540), roughness: 0.3, emissive: col(0xffb85e), emissiveIntensity: 0
    });
    (frames.glass || (frames.glass = [])).push(winMat);
    [-2.4, 0.6, 3.0].forEach(function (wx) {
      box(1.35, 1.1, 0.1, winMat, wx, 5.0, d / 2 + 0.03, g).castShadow = false;
    });
    // 门口的垃圾桶 + 箱子
    box(0.55, 0.85, 0.55, std(0x3f6b58, 0.9), -3.6, 0.42, d / 2 + 0.6, g);
    box(0.6, 0.5, 0.45, std(0xb08a5c, 0.9), -2.8, 0.25, d / 2 + 0.7, g);

    g.position.set(EAST_FACE + d / 2, 0, -4);
    g.rotation.y = -Math.PI / 2;
    root.add(g);
  }

  /* ================= 屋顶小招牌（街口路牌 / 公交站牌口 ================= */
  function streetSign(x, z) {
    const g = new THREE.Group();
    const post = std(0x6b7078, 0.7, 0.4);
    cyl(0.05, 0.05, 2.9, 8, post, 0, 1.45, 0, g);
    const m = new THREE.MeshBasicMaterial({ map: signTex('鲸鱼街', 'WHALE STREET', '#3f6b58', '#f6fbf2', '#8fc7a8') });
    m.toneMapped = false;
    const p = plane(1.5, 0.56, m, 0, 2.55, 0.03, g);
    p.castShadow = false;
    g.position.set(x, SW_Y, z);
    g.rotation.y = -0.35;
    root.add(g);
  }

  /* ================= 路灯 ================= */
  function lamp(x, z, side, baseY) {
    const g = new THREE.Group();
    const postMat = std(0x3c414a, 0.6, 0.5);
    cyl(0.075, 0.105, 3.9, 10, postMat, 0, 1.95, 0, g);
    cyl(0.17, 0.22, 0.22, 12, std(0x3c414a, 0.8), 0, 0.11, 0, g);
    const armLen = 0.75;
    const arm = box(armLen, 0.07, 0.07, postMat, side * armLen / 2, 3.86, 0, g);
    arm.castShadow = false;
    // 弯臂（斜的）
    const arm2 = box(0.5, 0.06, 0.06, postMat, side * (armLen + 0.2), 3.96, 0, g);
    arm2.rotation.z = side * 0.5;
    // 灯笼一样的灯罩
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.26, 0.32, 8),
      std(0x2f3540, 0.7, 0.3));
    shade.position.set(side * (armLen + 0.42), 4.02, 0);
    g.add(shade);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: col(0xfff0c8), emissive: col(0xffc46a), emissiveIntensity: 1.2, roughness: 0.4
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), bulbMat);
    bulb.position.set(side * (armLen + 0.42), 3.9, 0);
    bulb.castShadow = false;
    g.add(bulb);
    (frames.bulbs || (frames.bulbs = [])).push(bulbMat);

    g.position.set(x, baseY || 0, z);
    root.add(g);
    return g;
  }

  /* ================= 行道口 ================= */
  function tree(x, z, s, baseY) {
    s = s || 1;
    const g = new THREE.Group();
    const trunk = cyl(0.1 * s, 0.14 * s, 2.6 * s, 8, std(0x7a5c42, 0.95), 0, 1.3 * s, 0, g);
    trunk.castShadow = true;
    const leaves = [];
    const cols = [0x4e7a48, 0x5f8a52, 0x6d9a5c];
    for (let i = 0; i < 5; i++) {
      const r = (0.62 + (i === 0 ? 0.3 : 0)) * s;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), std(cols[i % 3], 0.95));
      const a = i * 1.27;
      m.position.set(Math.cos(a) * 0.34 * s, (3.0 + (i % 3) * 0.42) * s, Math.sin(a) * 0.34 * s);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      leaves.push({ m: m, ph: Math.random() * 6, x0: m.position.x });
    }
    // 树池
    box(1.1 * s, 0.22, 1.1 * s, std(0x8d8578, 0.92), 0, 0.11, 0, g);
    box(0.95 * s, 0.06, 0.95 * s, std(0x4a3c2e, 0.98), 0, 0.23, 0, g);
    g.position.set(x, baseY || 0, z);
    root.add(g);
    (frames.trees || (frames.trees = [])).push(leaves);
    return g;
  }

  /* ================= 长椅 / 垃圾口 / 邮筒 / 消防口 ================= */
  function bench(x, z, ry, baseY) {
    const g = new THREE.Group();
    const wood = std(0xa97f52, 0.9);
    const iron = std(0x3f444c, 0.6, 0.3);
    for (let i = 0; i < 3; i++) box(1.9, 0.07, 0.13, wood, 0, 0.46, -0.16 + i * 0.16, g);
    for (let i = 0; i < 2; i++) {
      const b = box(1.9, 0.13, 0.06, wood, 0, 0.74 + i * 0.18, -0.3, g);
      b.rotation.x = -0.16;
    }
    [-0.82, 0.82].forEach(function (dx) {
      box(0.08, 0.5, 0.5, iron, dx, 0.25, 0, g);
      box(0.06, 0.9, 0.06, iron, dx, 0.72, -0.3, g);
    });
    g.position.set(x, baseY || 0, z);
    g.rotation.y = ry || 0;
    root.add(g);
  }

  function bin(x, z, baseY) {
    const y0 = baseY || 0;
    cyl(0.24, 0.2, 0.78, 10, std(0x4a5550, 0.85, 0.1), x, y0 + 0.39, z);
    cyl(0.26, 0.26, 0.08, 10, std(0x37413c, 0.8), x, y0 + 0.82, z).castShadow = false;
  }

  function mailbox(x, z, ry, baseY) {
    const g = new THREE.Group();
    const red = std(0xa8402f, 0.75, 0.1);
    cyl(0.06, 0.06, 0.55, 8, std(0x5b4a3a, 0.9), 0, 0.28, 0, g);
    box(0.44, 0.5, 0.34, red, 0, 0.82, 0, g);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.44, 12, 1, false, 0, Math.PI), red);
    top.rotation.z = Math.PI / 2;
    top.position.set(0, 1.07, 0);
    g.add(top);
    box(0.18, 0.05, 0.02, std(0x2e2620, 0.9), 0, 0.9, 0.18, g);
    g.position.set(x, baseY === undefined ? SW_Y : baseY, z);
    g.rotation.y = ry || 0;
    root.add(g);
  }

  function hydrant(x, z, baseY) {
    const g = new THREE.Group();
    const red = std(0xb4432f, 0.75, 0.15);
    cyl(0.13, 0.16, 0.62, 10, red, 0, 0.31, 0, g);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), red);
    cap.position.y = 0.63;
    g.add(cap);
    box(0.36, 0.1, 0.12, red, 0, 0.44, 0, g);
    g.position.set(x, baseY === undefined ? SW_Y : baseY, z);
    root.add(g);
  }

  /* ==========================================================================
   * M48：街上的装修 —— 五间门面各自的"门口"，加上街道本身的细节
   *   · 咖啡馆：露台（小圆桌 + 两把椅子 + 遮阳伞）+ 菜单黑板 + 报箱
   *   · 采耳馆：门口两盏红灯笼（夜里亮）+ 门帘
   *   · 面包房：立式招牌（「刚出炉」）+ 蹲在门口的小黑猫
   *   · 邮局：邮袋 + 「信箱 24 小时」牌子 + 门口一辆旧自行车
   *   · 花店：门口的洒水壶 + 墙角爬山虎
   *   · 街上：井盖、墙上的小广告、二楼晾衣绳、窗台小物
   * 材质统一共用（std 在 street.js 里不缓存，小物件多，别一物一材质）
   * ========================================================================== */
  function streetDressing() {
    const M = {
      wood: std(0xa97f52, 0.9),
      darkWood: std(0x6b4a30, 0.9),
      iron: std(0x3f444c, 0.6, 0.3),
      cream: std(0xf2ead8, 0.9),
      red: std(0xb4432f, 0.8),
      green: std(0x4e7a48, 0.95),
      leaf: std(0x5f8a52, 0.95),
      paper: std(0xf6efdd, 0.95),
      metal: std(0xb9bcc0, 0.45, 0.5),
      stone: std(0x6e6a63, 0.95),
      cloths: [std(0xcfd9e8, 0.95), std(0xe8c8c0, 0.95), std(0xd8e0c8, 0.95)]
    };

    /* ---------- 小圆桌 + 藤椅（咖啡馆露台） ---------- */
    function cafeSet(x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      root.add(g);
      // 桌
      cyl(0.34, 0.34, 0.045, 20, M.cream, 0, 0.71, 0, g);
      cyl(0.035, 0.045, 0.7, 10, M.iron, 0, 0.35, 0, g);
      cyl(0.24, 0.26, 0.03, 16, M.iron, 0, 0.015, 0, g);
      // 桌上：两只杯子 + 一小瓶花
      [-0.12, 0.12].forEach(function (dx) {
        cyl(0.045, 0.038, 0.07, 10, M.cream, dx, 0.765, dx > 0 ? 0.08 : -0.09, g).castShadow = false;
        cyl(0.047, 0.047, 0.008, 10, std(0x6b4a30, 0.9), dx, 0.803, dx > 0 ? 0.08 : -0.09, g).castShadow = false;
      });
      cyl(0.04, 0.033, 0.1, 10, std(0xd8c9a8, 0.9), 0, 0.79, 0.2, g).castShadow = false;
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1;
        cyl(0.004, 0.005, 0.14, 4, M.green, Math.cos(a) * 0.02, 0.9, 0.2 + Math.sin(a) * 0.02, g).castShadow = false;
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 5), std(0xe8b44a, 0.9));
        f.position.set(Math.cos(a) * 0.03, 0.975, 0.2 + Math.sin(a) * 0.03);
        f.castShadow = false;
        g.add(f);
      }
      // 两把椅子（面对面）
      [-1, 1].forEach(function (s) {
        const c = new THREE.Group();
        c.position.set(0, 0, s * 0.72);
        c.rotation.y = s > 0 ? Math.PI : 0;
        g.add(c);
        box(0.4, 0.035, 0.38, M.wood, 0, 0.45, 0, c);
        [-1, 1].forEach(function (sx) {
          [-1, 1].forEach(function (sz) {
            box(0.035, 0.44, 0.035, M.iron, sx * 0.16, 0.22, sz * 0.15, c);
          });
        });
        const back = box(0.38, 0.34, 0.035, M.wood, 0, 0.64, -0.18, c);
        back.rotation.x = -0.12;
      });
      // 遮阳伞
      cyl(0.028, 0.034, 2.3, 8, M.iron, 0, 1.15, 0, g);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.3, 10), M.cream);
      canopy.position.set(0, 2.38, 0);
      canopy.castShadow = true;
      g.add(canopy);
      // 伞骨（细条，远看就是一把伞）
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const rib = box(0.9, 0.012, 0.012, M.cream, Math.cos(a) * 0.45, 2.25, Math.sin(a) * 0.45);
        rib.rotation.y = -a;
        rib.rotation.z = 0.16;
        rib.castShadow = false;
        g.add(rib);
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.iron);
      tip.position.y = 2.55;
      g.add(tip);
      return g;
    }

    /* ---------- 立式黑板（A 字架） ---------- */
    // M55：整块抬到人行道台面 SW_Y（以前 group y=0，板腿埋进 14cm 厚的人行道里）
    function aBoard(x, z, ry, title, lines, accent, baseY) {
      const g = new THREE.Group();
      g.position.set(x, baseY === undefined ? SW_Y : baseY, z);
      g.rotation.y = ry || 0;
      root.add(g);
      const tex = canvasTex(240, 300, function (c, W, H) {
        c.fillStyle = '#2b241c'; c.fillRect(0, 0, W, H);
        c.strokeStyle = '#8b6b4a'; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10);
        c.fillStyle = '#f3e6c8';
        c.font = 'bold 34px "Microsoft YaHei", sans-serif';
        c.textAlign = 'center';
        c.fillText(title, W / 2, 66);
        c.strokeStyle = 'rgba(243,230,200,.4)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(40, 88); c.lineTo(W - 40, 88); c.stroke();
        c.font = '22px "Microsoft YaHei", sans-serif';
        c.fillStyle = accent || '#e8c98a';
        lines.forEach(function (l, i) { c.fillText(l, W / 2, 132 + i * 40); });
      });
      const bm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), bm);
      bp.position.set(0, 0.42, 0.06);
      bp.rotation.x = 0.14;
      g.add(bp);
      [-1, 1].forEach(function (s) {
        const leg = box(0.035, 0.86, 0.035, M.darkWood, s * 0.19, 0.43, -0.04, g);
        leg.rotation.x = s > 0 ? -0.16 : 0.16;
      });
      box(0.42, 0.04, 0.2, M.darkWood, 0, 0.03, 0, g).castShadow = false;
      return g;
    }

    /* ---------- 红灯笼（挂在门框边） ---------- */
    function lantern(x, y, z, side) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      root.add(g);
      // 从墙上伸出来的小托架
      const arm = box(0.26, 0.035, 0.035, M.darkWood, side * 0.13, 0.24, 0, g);
      arm.castShadow = false;
      box(0.03, 0.14, 0.03, M.darkWood, 0, 0.17, 0, g).castShadow = false;
      // 灯笼：椭圆球 + 上下金口 + 穗子
      const lampMat = new THREE.MeshStandardMaterial({
        color: col(0xd94b3a), emissive: col(0xff6a4a), emissiveIntensity: 0.6, roughness: 0.8
      });
      (frames.bulbs || (frames.bulbs = [])).push(lampMat);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), lampMat);
      body.scale.set(1, 0.82, 1);
      body.position.set(side * 0.24, -0.02, 0);
      body.castShadow = false;
      g.add(body);
      const gold = std(0xc9a86a, 0.4, 0.6);
      [-1, 1].forEach(function (s) {
        cyl(0.055, 0.055, 0.03, 10, gold, side * 0.24, -0.02 + s * 0.135, 0, g).castShadow = false;
      });
      cyl(0.006, 0.006, 0.12, 4, gold, side * 0.24, -0.2, 0, g).castShadow = false;
      return g;
    }

    /* ---------- 门口的小猫（蹲着） ---------- */
    function doorCat(x, z, ry, hex, baseY) {
      const g = new THREE.Group();
      g.position.set(x, baseY === undefined ? SW_Y : baseY, z);
      g.rotation.y = ry || 0;
      g.scale.setScalar(0.9);
      root.add(g);
      const fur = std(hex || 0x4a4640, 0.95);
      const fur2 = std(0x6a655c, 0.95);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9), fur);
      body.position.y = 0.2;
      body.scale.set(0.85, 1.15, 0.8);
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), fur);
      head.position.set(0, 0.38, 0.03);
      g.add(head);
      [-1, 1].forEach(function (s) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.06, 5), fur);
        ear.position.set(s * 0.06, 0.47, 0.02);
        ear.rotation.z = s * 0.2;
        ear.castShadow = false;
        g.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), std(0xd8d27a, 0.4));
        eye.position.set(s * 0.038, 0.395, 0.105);
        eye.castShadow = false;
        g.add(eye);
      });
      // 盘起来的前爪 + 尾巴
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), fur2);
      paw.position.set(0, 0.06, 0.12);
      paw.scale.set(1.4, 0.6, 1);
      paw.castShadow = false;
      g.add(paw);
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 14, Math.PI * 1.3), fur2);
      tail.position.set(0.1, 0.09, -0.06);
      tail.rotation.x = -0.5;
      tail.castShadow = false;
      g.add(tail);
      return g;
    }

    /* ---------- 报箱 ---------- */
    function newsBox(x, z, baseY) {
      const g = new THREE.Group();
      g.position.set(x, baseY === undefined ? SW_Y : baseY, z);
      root.add(g);
      box(0.06, 0.5, 0.06, M.iron, -0.1, 0.25, 0, g);
      box(0.06, 0.5, 0.06, M.iron, 0.1, 0.25, 0, g);
      box(0.34, 0.4, 0.26, std(0x3f6b8a, 0.75), 0, 0.66, 0, g);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.26),
        new THREE.MeshBasicMaterial({ color: 0xdfefff, toneMapped: false }));
      win.position.set(0, 0.68, 0.135);
      g.add(win);
      box(0.3, 0.05, 0.22, std(0x2f5268, 0.8), 0, 0.87, 0, g).castShadow = false;
      return g;
    }

    /* ---------- 井盖 ---------- */
    function manhole(x, z) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), M.stone);
      m.position.set(x, 0.016, z);
      m.receiveShadow = true;
      root.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 5, 20), std(0x555149, 0.9));
      ring.position.set(x, 0.03, z);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
      root.add(ring);
    }

    /* ---------- 墙上的小广告 ---------- */
    function wallPoster(x, y, z, ry, kind) {
      const tex = canvasTex(180, 240, function (c, W, H) {
        const bgs = ['#f4ecd8', '#e8d8c4', '#dfe6e8'];
        c.fillStyle = bgs[kind % 3];
        c.fillRect(0, 0, W, H);
        c.strokeStyle = 'rgba(120,100,80,.35)'; c.lineWidth = 3;
        c.strokeRect(4, 4, W - 8, H - 8);
        c.textAlign = 'center';
        if (kind === 0) {
          c.fillStyle = '#3f6b58';
          c.font = 'bold 30px "Microsoft YaHei", sans-serif';
          c.fillText('鲸耳堂', W / 2, 62);
          c.fillStyle = '#7a6a52';
          c.font = '18px "Microsoft YaHei", sans-serif';
          c.fillText('夜里开到十一点', W / 2, 104);
          c.fillText('采耳 · ¥45', W / 2, 138);
          c.fillStyle = '#c9784a';
          c.fillRect(30, 168, W - 60, 3);
          c.font = '15px "Microsoft YaHei", sans-serif';
          c.fillText('街西 · 门口挂红灯', W / 2, 200);
        } else if (kind === 1) {
          c.fillStyle = '#8a5a3a';
          c.font = 'bold 28px "Microsoft YaHei", sans-serif';
          c.fillText('搬家 / 修伞', W / 2, 60);
          c.fillStyle = '#7a6a52';
          c.font = '17px "Microsoft YaHei", sans-serif';
          c.fillText('找街尾的獾叔', W / 2, 102);
          c.fillText('价钱好商量', W / 2, 130);
          c.fillStyle = '#3f6b58';
          c.beginPath(); c.arc(W / 2, 180, 26, 0, Math.PI * 2); c.fill();
        } else {
          c.fillStyle = '#3f4b6b';
          c.font = 'bold 26px "Microsoft YaHei", sans-serif';
          c.fillText('球赛', W / 2, 56);
          c.fillStyle = '#7a6a52';
          c.font = '17px "Microsoft YaHei", sans-serif';
          c.fillText('周六 · 河边空地', W / 2, 96);
          c.fillText('缺两个守门员', W / 2, 124);
          c.fillStyle = '#d98a5a';
          c.fillRect(36, 152, W - 72, 2);
          c.font = '15px "Microsoft YaHei", sans-serif';
          c.fillText('带水来', W / 2, 186);
        }
      });
      const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), m);
      p.position.set(x, y, z);
      p.rotation.y = ry;
      root.add(p);
      return p;
    }

    /* ---------- 二楼晾衣绳 ---------- */
    function laundry(x, y, z, len) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      root.add(g);
      box(0.012, 0.012, len, std(0xd8d2c4, 0.9), 0, 0, 0, g).castShadow = false;
      [-1, 1].forEach(function (s) {
        cyl(0.012, 0.012, 0.5, 5, M.iron, 0, -0.24, s * len / 2, g).castShadow = false;
      });
      for (let i = 0; i < 4; i++) {
        const w = 0.26 + (i % 2) * 0.08;
        const h = 0.3 + (i % 3) * 0.07;
        const dz = -len / 2 + 0.36 + i * (len - 0.6) / 3;
        // 用薄盒子而不是平面：平面单面，从侧面看就"没有衣服"了
        const cl = box(0.012, h, w, M.cloths[i % 3], 0.05, -h / 2 - 0.02, dz, g);
        cl.castShadow = false;
        // 两个夹子
        [-1, 1].forEach(function (s) {
          box(0.02, 0.04, 0.02, std(0xd9a24a, 0.8), 0.03, -0.02, dz + s * w / 2 * 0.8, g).castShadow = false;
        });
      }
      return g;
    }

    /* ---------- 墙角的爬山虎 ---------- */
    function vines(x, z, h) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      root.add(g);
      let yy = 0.3;
      for (let i = 0; i < 14; i++) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.14 + (i % 3) * 0.03, 7, 5), i % 2 ? M.leaf : M.green);
        lf.position.set(0.03 * ((i % 2) ? 1 : -1), yy, Math.sin(i * 1.7) * 0.16);
        lf.scale.set(0.25, 0.7, 0.9);
        lf.rotation.z = 0.3;
        lf.castShadow = false;
        g.add(lf);
        yy += 0.2;
      }
      box(0.02, h, 0.02, std(0x6b5a42, 0.9), 0, h / 2, 0, g).castShadow = false;
      return g;
    }

    /* ---------- 洒水壶 ---------- */
    function wateringCan(x, z) {
      const g = new THREE.Group();
      g.position.set(x, SW_Y, z);
      root.add(g);
      cyl(0.1, 0.085, 0.19, 12, std(0x8fa88a, 0.6, 0.25), 0, 0.095, 0, g);
      const sp = cyl(0.012, 0.02, 0.17, 6, std(0x8fa88a, 0.6, 0.25), 0.1, 0.15, 0, g);
      sp.rotation.z = 0.9;
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 5, 12, Math.PI), std(0x8fa88a, 0.6, 0.25));
      hd.position.set(-0.06, 0.16, 0);
      hd.rotation.y = Math.PI / 2;
      hd.castShadow = false;
      g.add(hd);
      return g;
    }

    /* ---------- 邮袋 ---------- */
    function postBag(x, z) {
      const g = new THREE.Group();
      g.position.set(x, SW_Y, z);
      g.rotation.y = 0.3;
      root.add(g);
      const bagMat = std(0x8a7a5a, 0.95);
      box(0.4, 0.34, 0.26, bagMat, 0, 0.17, 0, g);
      box(0.42, 0.06, 0.28, std(0x6b5a40, 0.95), 0, 0.35, 0, g).castShadow = false;
      // 露出来的信
      for (let i = 0; i < 3; i++) {
        const l = box(0.14, 0.02, 0.1, M.paper, -0.08 + i * 0.08, 0.375, 0.03, g);
        l.rotation.y = 0.2 * i;
        l.castShadow = false;
      }
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 14), std(0x5b4a3a, 0.9));
      strap.position.set(0, 0.28, 0);
      strap.rotation.x = 0.4;
      strap.castShadow = false;
      g.add(strap);
      return g;
    }

    /* ================= 摆位置 ================= */
    /* 西侧门面 x = 61.0（人行道 61.0~62.2），东侧 x = 71.0 */
    // ① 咖啡馆（z 3~11，门在 4.92）：露台在门北边，菜单板在门南边
    cafeSet(61.8, 7.95);
    aBoard(61.42, 3.55, Math.PI / 2 - 0.22, '今 日 手 冲', ['莓果 · 坚果 · 可可', '窗边位随便坐', '续杯 ¥5'], '#e8c98a');
    newsBox(61.42, 10.7);
    laundry(61.32, 5.3, 7.2, 2.6);

    // ② 采耳馆（z -8~0，门在 -6.08）：门口两盏红灯笼 + 墙上的小广告
    lantern(61.16, 2.3, -5.3, 1);
    lantern(61.16, 2.3, -6.9, 1);
    // M55：小广告以前落在两栋楼之间的空档里（悬空）。挪到真实墙面上：
    //   采耳馆北端实墙 -1.04~0（橱窗只到 -1.04）、咖啡馆南端实墙 3~4.04
    wallPoster(61.03, 1.95, -0.55, Math.PI / 2, 0);
    wallPoster(61.03, 1.85, 3.5, Math.PI / 2, 1);

    // ③ 面包房（东侧 z 5.25~12.75，门在 10.95）：立式招牌 + 门口的小黑猫
    aBoard(70.5, 12.35, -Math.PI / 2 + 0.24, '刚 出 炉', ['鲸鱼包 ¥9', '可颂 ¥6', '早七点开门'], '#f0c98a');
    doorCat(70.85, 9.85, -1.9, 0x453f38);
    laundry(70.68, 5.3, 9.0, 2.4);

    // ④ 邮局（东侧 z 15.25~22.75，门在 20.95）：邮袋 + 牌子 + 一辆旧自行车
    postBag(70.78, 22.75);     // M55：往墙外让 4cm（原来袋身扎进墙里 2cm），并抬到台面
    aBoard(70.5, 19.5, -Math.PI / 2 - 0.2, '信 箱 24 小 时', ['邮票 ¥2', '寄包裹请进店', '晚上也开着'], '#cfe0f0');
    // M55：旧自行车原来在 23.5，后轮插进码头那棵树的花池；挪到便利店北墙外（不挡门、不压树）
    bicycle(70.62, -0.2, -0.42);

    // ⑤ 花店（西侧 z 14.7~22.3，门在 16.52）：洒水壶 + 墙角爬山虎
    wateringCan(61.3, 19.55);
    vines(61.06, 22.35, 2.6);

    // ⑥ 街上：井盖 / 车辙旁的小广告 / 第二块晾衣绳
    manhole(66.1, 6.4);
    manhole(65.5, -13.6);
    // M55：这两块以前也在楼与楼之间的空档（悬空）。挪到咖啡馆北端实墙 9.96~11、面包房南端实墙 5.25~6.225
    wallPoster(61.03, 2.05, 10.5, Math.PI / 2, 2);
    wallPoster(70.97, 2.0, 5.85, -Math.PI / 2, 1);
    laundry(70.68, 5.35, 17.8, 2.2);
  }

  /* ================= 公交站 ================= */
  // M55：整个站台收进人行道（x 61.4~62.25），不再伸进车道；背板玻璃改成半高 0.95m ——
  // 又高又薄的玻璃会被 interact.collectOccluders 收成遮挡体，站在人行道上永远点不到公交。
  function busStop(x, z) {
    const g = new THREE.Group();
    const metal = std(0x4d555f, 0.6, 0.4);
    const glass = new THREE.MeshStandardMaterial({
      color: col(0x9fc0cf), transparent: true, opacity: 0.32, roughness: 0.2, metalness: 0.1
    });
    // M55.1：玻璃背板原来立在靠马路那一侧（local +0.52），等车的人在外面、长椅被玻璃挡在里面，
    // 从街上看着就是"隔板错乱"。现在立到靠墙那一侧（local -0.32），人站在玻璃前面、背靠玻璃等车。
    const BACK_X = -0.32;
    [-1.35, 1.35].forEach(function (dz) {
      box(0.08, 2.35, 0.08, metal, BACK_X, 1.17, dz, g);
    });
    box(0.1, 0.1, 3.0, metal, BACK_X, 2.36, 0, g);
    // 顶棚（从背板往马路方向探出去）
    box(1.70, 0.1, 3.1, std(0x8f9aa3, 0.7, 0.3), 0.30, 2.44, 0, g).rotation.z = -0.06;
    // 半高玻璃背板（0.95m，落在人行道台面上；上面留空才不会挡住点公交的准星）
    box(0.05, 0.95, 2.7, glass, BACK_X, 0.475, 0, g).castShadow = false;
    box(0.09, 0.07, 2.7, metal, BACK_X, 0.99, 0, g).castShadow = false;   // 玻璃上沿压条
    // 长椅
    box(0.42, 0.08, 2.2, std(0xa97f52, 0.9), 0.27, 0.5, 0, g);
    [-0.9, 0.9].forEach(function (dz) {
      box(0.4, 0.42, 0.08, metal, 0.27, 0.25, dz, g);
    });
    // 站牌：立在人行道靠路牙这头，别再把杆子插进车道（以前在 61.75+1.55=63.3，正好戳在停着的车身里）
    const sm = new THREE.MeshBasicMaterial({ map: signTex('公交站', 'BUS · 小鲸鱼镇', '#4d6fa0', '#f4f8ff', '#a8c4e8') });
    sm.toneMapped = false;
    // 正反两块，站在人行道上和站在马路上都能看到正着写的字（单面平面背面是反字）
    const plate = plane(0.9, 0.34, sm, 0.445, 2.2, 1.85, g);
    plate.rotation.y = -Math.PI / 2;
    plate.castShadow = false;
    const plate2 = plane(0.9, 0.34, sm, 0.455, 2.2, 1.85, g);
    plate2.rotation.y = Math.PI / 2;
    plate2.castShadow = false;
    cyl(0.05, 0.05, 2.4, 8, metal, 0.45, 1.2, 1.85, g);
    g.position.set(x, SW_Y, z);
    root.add(g);
  }

  /* ================= 南门（出去就是水上乐园） ================= */
  function buildGate() {
    const g = new THREE.Group();
    const stone = std(0xb9ad97, 0.92);
    const dark = std(0x7c7365, 0.9);
    [-4.1, 4.1].forEach(function (dx) {
      box(0.9, 4.0, 0.9, stone, dx, 2.0, 0, g);
      box(1.15, 0.3, 1.15, dark, dx, 4.05, 0, g);
      box(1.15, 0.28, 1.15, dark, dx, 0.16, 0, g);
      // 门柱上的小灯
      const bm = new THREE.MeshStandardMaterial({
        color: col(0xffe9c2), emissive: col(0xffc46a), emissiveIntensity: 1.3, roughness: 0.5
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bm);
      bulb.position.set(dx, 3.5, 0);
      g.add(bulb);
      (frames.bulbs || (frames.bulbs = [])).push(bm);
    });
    // 横梁 + 牌匾
    box(9.2, 0.42, 0.5, dark, 0, 3.92, 0, g);
    const sm = new THREE.MeshBasicMaterial({ map: signTex('南门', '往南 · 小鲸鱼水上乐园', '#f6efdd', '#3a3128', '#a07c4e') });
    sm.toneMapped = false;
    const p = plane(3.2, 0.9, sm, 0, 4.5, 0.3, g);
    p.castShadow = false;
    box(3.4, 0.12, 0.16, dark, 0, 5.0, 0.26, g);
    g.position.set(CX, 0, GATE_Z);
    root.add(g);
  }

  /* ================= M40：街心广场（先搭框架） =================
   * 妈妈 15:12「下一步吧，先建框架，再慢慢完善内部」
   * 西侧那块草坪改成小广场：铺装 + 三圈石环 + 喷泉 + 钟楼 + 公告牌 + 气球摊 + 长椅 + 串灯
   * 这一版先"能看、能点、能走"；喷泉的灯、公告牌的翻页、气球能买这些以后再加
   */
  function wireLights(x0, y0, z0, x1, y1, z1, sag) {
    const g = new THREE.Group();
    const N = 17;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * u;
      const y = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * (sag || 0.5);
      pts.push(new THREE.Vector3(x, y, z));
      if (i % 2 === 0 && i > 0 && i < N - 1) {
        const mat = new THREE.MeshStandardMaterial({
          color: col(0xfff2cf), emissive: col(0xffc978), emissiveIntensity: 1.1, roughness: 0.4
        });
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat);
        b.position.set(x, y - 0.07, z);
        g.add(b);
        (frames.bulbs || (frames.bulbs = [])).push(mat);
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2b2620 })));
    root.add(g);
    return g;
  }

  function drawClockFace() {
    if (!plaza || !plaza.clockCtx) return;
    const g = plaza.clockCtx, W = 256, C = 128;
    const now = new Date();
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#fbf6ea';
    g.beginPath(); g.arc(C, C, 120, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a7350'; g.lineWidth = 9;
    g.beginPath(); g.arc(C, C, 115, 0, Math.PI * 2); g.stroke();
    // 12 个刻口
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const r0 = i % 3 === 0 ? 88 : 98, r1 = 106;
      g.strokeStyle = '#6d5b40'; g.lineWidth = i % 3 === 0 ? 6 : 3;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      g.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
      g.stroke();
    }
    const hh = (now.getHours() % 12) + now.getMinutes() / 60;
    const mm = now.getMinutes();
    const ha = hh / 12 * Math.PI * 2 - Math.PI / 2;
    const ma = mm / 60 * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#3a3128'; g.lineCap = 'round';
    g.lineWidth = 11;
    g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(ha) * 58, C + Math.sin(ha) * 58); g.stroke();
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(ma) * 88, C + Math.sin(ma) * 88); g.stroke();
    g.fillStyle = '#8a7350';
    g.beginPath(); g.arc(C, C, 8, 0, Math.PI * 2); g.fill();
    if (plaza.clockTex) plaza.clockTex.needsUpdate = true;
  }

  function drawBoard() {
    if (!plaza || !plaza.boardCtx) return;
    const g = plaza.boardCtx, W = 512, Hh = 330;
    g.fillStyle = '#6b5540';
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#7d6449';
    g.fillRect(8, 8, W - 16, Hh - 16);
    g.fillStyle = '#f6efdd';
    g.fillRect(24, 24, W - 48, Hh - 48);
    g.fillStyle = '#3a3128';
    g.textAlign = 'center';
    g.font = 'bold 30px "Microsoft YaHei", sans-serif';
    g.fillText('小D的公告牌 · 鲸鱼街', W / 2, 58);
    const slots = [
      { x: 42, y: 78 }, { x: 274, y: 78 }, { x: 42, y: 206 }, { x: 274, y: 206 }
    ];
    plaza.photoSlots = slots;
    plaza.photoCount = 0;
    slots.forEach(function (s, i) {
      g.fillStyle = '#e6dcc6';
      g.fillRect(s.x, s.y, 196, 108);
      g.strokeStyle = '#b8a789'; g.lineWidth = 3;
      g.strokeRect(s.x, s.y, 196, 108);
      g.fillStyle = '#a8997d';
      g.font = '20px "Microsoft YaHei", sans-serif';
      g.fillText(i === 0 ? '还没挂照片' : '', s.x + 98, s.y + 58);
    });
    // 有拍过的照片就真的挂上去（跟家里图墙一口 localStorage口
    let photos = [];
    try { photos = JSON.parse(localStorage.getItem('xd_home_photos') || '[]') || []; } catch (e) { photos = []; }
    photos.slice(0, 4).forEach(function (src, i) {
      const s = slots[i];
      const im = new Image();
      im.onload = function () {
        try {
          const r = Math.max(196 / im.width, 108 / im.height);
          const w = im.width * r, h = im.height * r;
          g.save();
          g.beginPath(); g.rect(s.x, s.y, 196, 108); g.clip();
          g.drawImage(im, s.x + (196 - w) / 2, s.y + (108 - h) / 2, w, h);
          g.restore();
          plaza.photoCount++;
          if (plaza.boardTex) plaza.boardTex.needsUpdate = true;
        } catch (e2) { /* 画不上就算了 */ }
      };
      im.src = src;
    });
    if (plaza.boardTex) plaza.boardTex.needsUpdate = true;
  }

  function buildPlaza() {
    const g = new THREE.Group();
    g.name = 'plaza-m40';
    root.add(g);
    const stone = std(0xcfc4ae, 0.95);
    const darkStone = std(0x9d927e, 0.95);
    const warmStone = std(0xbfa98c, 0.95);
    const w = PLZ.x1 - PLZ.x0, d = PLZ.z1 - PLZ.z0;

    // 铺装（方砖贴图）
    const floorTex = canvasTex(256, 256, function (gg, W, Hh) {
      gg.fillStyle = '#cfc4ae';
      gg.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 1800; i++) {
        const v = 178 + Math.random() * 46;
        gg.fillStyle = 'rgba(' + v + ',' + (v - 8) + ',' + (v - 24) + ',.35)';
        gg.fillRect(Math.random() * W, Math.random() * Hh, 2, 2);
      }
      gg.strokeStyle = 'rgba(120,110,94,.4)';
      gg.lineWidth = 2;
      for (let y = 0; y <= Hh; y += 64) {
        gg.beginPath(); gg.moveTo(0, y + 0.5); gg.lineTo(W, y + 0.5); gg.stroke();
      }
      for (let x = 0; x <= W; x += 64) {
        gg.beginPath(); gg.moveTo(x + 0.5, 0); gg.lineTo(x + 0.5, Hh); gg.stroke();
      }
      // 几块深一点的口
      gg.fillStyle = 'rgba(150,136,114,.5)';
      for (let i = 0; i < 10; i++) {
        gg.fillRect(Math.floor(Math.random() * 4) * 64, Math.floor(Math.random() * 4) * 64, 64, 64);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(2, 4);
    const floor = box(w, 0.12, d, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }),
      PLZ_CX, 0.06, PLZ_CZ, g);
    floor.receiveShadow = true;

    // 绕着喷泉的三圈石环（半径都要留在广场里：广场半宽 3.62口
[[2.18, 2.38, darkStone], [2.62, 2.82, warmStone], [3.02, 3.22, darkStone]].forEach(function (r) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r[0], r[1], 48), r[2]);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(PLZ_CX, 0.128, PLZ_CZ);
      ring.receiveShadow = true;
      g.add(ring);
    });

    // 边沿：北/口 西三面矮石沿 + 绿篱（看得见的边界，别用看不见的墙）
    const hedge = std(0x4f7346, 0.96);
    box(w - 1.6, 0.26, 0.3, darkStone, PLZ_CX, 0.25, PLZ.z0 + 0.24, g);
    box(w - 1.6, 0.38, 0.5, hedge, PLZ_CX, 0.5, PLZ.z0 + 0.24, g);
    box(w - 1.6, 0.26, 0.3, darkStone, PLZ_CX, 0.25, PLZ.z1 - 0.24, g);
    box(w - 1.6, 0.38, 0.5, hedge, PLZ_CX, 0.5, PLZ.z1 - 0.24, g);
    box(0.3, 0.26, d - 1.6, darkStone, PLZ.x0 + 0.24, 0.25, PLZ_CZ, g);
    box(0.5, 0.38, d - 1.6, hedge, PLZ.x0 + 0.24, 0.5, PLZ_CZ, g);

    // ---------- 喷泉 ----------
    const fg = new THREE.Group();
    fg.position.set(PLZ_CX, 0.12, PLZ_CZ);
    g.add(fg);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      const seg = box(1.42, 0.52, 0.26, stone, Math.cos(a) * FOUNT_R, 0.26, Math.sin(a) * FOUNT_R, fg);
      seg.rotation.y = -a + Math.PI / 2;
    }
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(FOUNT_R - 0.08, FOUNT_R - 0.08, 0.1, 24), darkStone);
    basin.position.y = 0.1;
    fg.add(basin);
    const waterMat = new THREE.MeshStandardMaterial({
      color: col(0x8fc6d8), transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1,
      emissive: col(0x4f93a8), emissiveIntensity: 0.22
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(FOUNT_R - 0.2, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.34;
    fg.add(water);
    cyl(0.28, 0.38, 0.9, 12, stone, 0, 0.45, 0, fg);
    cyl(0.56, 0.44, 0.16, 12, stone, 0, 0.95, 0, fg);
    cyl(0.16, 0.22, 0.26, 10, stone, 0, 1.08, 0, fg);
    const jets = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const jetMat = new THREE.MeshStandardMaterial({
        color: col(0xc6e8f2), transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.05
      });
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.055, 1, 6), jetMat);
      jet.position.set(Math.cos(a) * 0.46, 1.55, Math.sin(a) * 0.46);
      jet.scale.y = 0.02;
      fg.add(jet);
      jets.push({ m: jet, bx: Math.cos(a) * 0.46, bz: Math.sin(a) * 0.46, ph: i * 0.8 });
    }
    // 池边小灯（夜里亮，暖口
    const rimLights = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const lm = new THREE.MeshStandardMaterial({
        color: col(0xfff0c8), emissive: col(0xffc46a), emissiveIntensity: 1.0, roughness: 0.4
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lm);
      bulb.position.set(Math.cos(a) * (FOUNT_R + 0.35), 0.55, Math.sin(a) * (FOUNT_R + 0.35));
      bulb.castShadow = false;
      g.add(bulb);
      (frames.bulbs || (frames.bulbs = [])).push(lm);
      rimLights.push(bulb);
    }
    const glow = new THREE.PointLight(0xffd9a0, 0, 7, 2);
    glow.position.set(PLZ_CX, 1.3, PLZ_CZ);
    g.add(glow);

    // ---------- 钟楼 ----------
    const cg = new THREE.Group();
    cg.position.set(CLOCK.x, 0, CLOCK.z);
    g.add(cg);
    box(1.55, 0.5, 1.55, darkStone, 0, 0.25, 0, cg);
    box(1.18, 3.2, 1.18, warmStone, 0, 1.9, 0, cg);
    box(1.5, 0.22, 1.5, darkStone, 0, 3.56, 0, cg);
    box(1.06, 1.0, 1.06, warmStone, 0, 4.1, 0, cg);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.0, 4), std(0x7c6e5a, 0.9));
    roof.position.y = 5.0;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    cg.add(roof);
    cyl(0.02, 0.02, 0.5, 6, std(0x6b5a48, 0.8), 0, 5.55, 0, cg);
    // 钟面：东（朝街）+ 北（朝街口）两块
    plaza = plaza || {};
    const clockCanvas = document.createElement('canvas');
    clockCanvas.width = 256; clockCanvas.height = 256;
    plaza.clockCtx = clockCanvas.getContext('2d');
    plaza.clockTex = new THREE.CanvasTexture(clockCanvas);
    plaza.clockTex.encoding = THREE.sRGBEncoding;
    plaza.clockTex.anisotropy = 4;
    const faceMat = new THREE.MeshBasicMaterial({ map: plaza.clockTex, toneMapped: false, transparent: true });
    const faceE = plane(0.92, 0.92, faceMat, 0.55, 4.1, 0, cg, 0, Math.PI / 2);
    const faceN = plane(0.92, 0.92, faceMat, 0, 4.1, 0.55, cg, 0, 0);
    faceE.castShadow = faceN.castShadow = false;
    // 钟楼底下的暖口
    const clockLamp = new THREE.PointLight(0xffd9a0, 0, 8, 2);
    clockLamp.position.set(CLOCK.x, 3.4, CLOCK.z);
    g.add(clockLamp);
    drawClockFace();

    // ---------- 公告口 ----------
    const bg = new THREE.Group();
    bg.position.set(BOARD.x, 0, BOARD.z);
    bg.rotation.y = Math.PI / 2;      // 面朝 +x（广口 / 街那边）
    g.add(bg);
    const wood = std(0x7d5b3f, 0.92);
    [-1.25, 1.25].forEach(function (dx) {
      box(0.14, 2.2, 0.14, wood, dx, 1.1, 0, bg);
    });
    box(2.8, 0.1, 0.12, wood, 0, 2.18, 0, bg);
    box(2.8, 0.1, 0.12, wood, 0, 0.6, 0, bg);
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 512; boardCanvas.height = 330;
    plaza.boardCtx = boardCanvas.getContext('2d');
    plaza.boardTex = new THREE.CanvasTexture(boardCanvas);
    plaza.boardTex.encoding = THREE.sRGBEncoding;
    plaza.boardTex.anisotropy = 4;
    const boardMat = new THREE.MeshBasicMaterial({ map: plaza.boardTex, toneMapped: false });
    const boardPlane = plane(2.6, 1.68, boardMat, 0, 1.4, 0.09, bg);
    boardPlane.castShadow = false;
    drawBoard();

    // ---------- 气球口 ----------
    const bs = new THREE.Group();
    bs.position.set(60.45, 0, -11.95);
    g.add(bs);
    cyl(0.032, 0.032, 2.1, 6, wood, 0, 1.05, 0, bs);
    box(0.5, 0.07, 0.5, wood, 0, 0.035, 0, bs);
    const balloons = [];
    const bcols = [0xd76b6b, 0xe8b44a, 0x6f9bd8, 0x8fbf7a, 0xd58fc0];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), std(bcols[i], 0.35));
      b.scale.y = 1.16;
      b.position.set((i - 2) * 0.1, 2.12 + Math.sin(i * 2.1) * 0.14, (i % 2 ? 0.09 : -0.09));
      b.castShadow = true;
      bs.add(b);
      balloons.push({ m: b, y0: b.position.y, ph: i * 1.3, bob: 0 });
      // 口
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3((i - 2) * 0.1, 1.96, (i % 2 ? 0.09 : -0.09)),
          new THREE.Vector3(0, 2.05, 0)
        ]),
        new THREE.LineBasicMaterial({ color: 0x8a7a66 })
      );
      bs.add(line);
    }
    // 气球摊的小牌口
    const bSign = new THREE.MeshBasicMaterial({ map: signTex('气球', '¥5', '#fbf3e4', '#3a3128', '#c98a5a') });
    bSign.toneMapped = false;
    plane(0.6, 0.45, bSign, 0, 1.6, 0.02, bs).castShadow = false;

    // ---------- 长椅 / 口 / 口 / 鸽子 ----------
    bench(PLZ_CX, PLZ_CZ - 3.7, 0);
    bench(PLZ_CX, PLZ_CZ + 3.7, Math.PI);
    bench(PLZ_CX - 2.6, PLZ_CZ, Math.PI / 2);
    flowerBox(PLZ_CX - 1.2, PLZ.z0 + 2.0, 0.12);  // M55：抬到广场台面；往广场里让 1.15m，避开树池和路灯
    flowerBox(PLZ_CX + 1.4, PLZ.z1 - 0.93, 0.12);
    lamp(57.3, PLZ.z0 + 1.15, 1);
    lamp(57.3, PLZ.z1 - 1.15, 1);
    tree(56.2, PLZ.z0 + 1.1, 0.9);
    tree(59.6, PLZ.z0 + 1.1, 0.9);
    pigeon(PLZ_CX + 1.6, PLZ_CZ - 1.4, 0.8, 0.12);
    pigeon(PLZ_CX + 2.2, PLZ_CZ - 1.0, -0.5, 0.12);
    pigeon(PLZ_CX + 1.2, PLZ_CZ - 0.6, 2.2, 0.12);

    // ---------- 过广场的串灯 ----------
    wireLights(55.0, 4.3, -12.9, 60.6, 4.0, -20.6, 0.65);
    cyl(0.06, 0.06, 3.9, 8, std(0x3c414a, 0.7, 0.4), 60.6, 1.95, -20.6, g);   // 另一头的小杆
    wireLights(54.8, 4.1, -20.4, 60.6, 4.0, -13.5, 0.6);

    /* ---------- 内里（M40.1）：地纹 / 露天座位 / 花摊 / 长椅上的口 / 花瓣 ---------- */
    // 鲸鱼马赛克地纹
    (function whaleMosaic() {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 300;
      const gg = c.getContext('2d');
      gg.fillStyle = '#c8bda7';
      gg.fillRect(0, 0, 512, 300);
      gg.strokeStyle = '#9a8f7b'; gg.lineWidth = 9;
      gg.strokeRect(5, 5, 502, 290);
      // 鲸鱼：身口 + 尾巴 + 肚皮 + 眼睛（面朝街口
      gg.fillStyle = '#4d6bfe';
      gg.beginPath();
      gg.moveTo(96, 150);
      gg.bezierCurveTo(140, 66, 300, 54, 372, 118);
      gg.bezierCurveTo(404, 148, 396, 196, 344, 214);
      gg.bezierCurveTo(272, 244, 150, 232, 96, 150);
      gg.closePath(); gg.fill();
      gg.beginPath();
      gg.moveTo(98, 150); gg.lineTo(36, 100); gg.lineTo(62, 150); gg.lineTo(36, 200);
      gg.closePath(); gg.fill();
      gg.fillStyle = '#dce7ff';
      gg.beginPath();
      gg.moveTo(128, 196);
      gg.bezierCurveTo(206, 238, 306, 226, 348, 196);
      gg.bezierCurveTo(308, 226, 206, 230, 128, 196);
      gg.closePath(); gg.fill();
      gg.fillStyle = '#1d2a55';
      gg.beginPath(); gg.arc(318, 128, 10, 0, Math.PI * 2); gg.fill();
      // 马赛克缝
      gg.strokeStyle = 'rgba(205,195,175,.5)'; gg.lineWidth = 2;
      for (let x = 4; x < 512; x += 18) { gg.beginPath(); gg.moveTo(x, 4); gg.lineTo(x, 296); gg.stroke(); }
      for (let y = 4; y < 300; y += 18) { gg.beginPath(); gg.moveTo(4, y); gg.lineTo(508, y); gg.stroke(); }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.76),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(59.1, 0.136, -19.25);
      m.receiveShadow = true;
      g.add(m);
    })();

    // 露天咖啡座（两套：桌口 + 两把椅子 + 遮阳口 + 杯子口
    function cafeSet(x, z, accent) {
      const gg = new THREE.Group();
      gg.position.set(x, 0.12, z);
      g.add(gg);
      const metal = std(0x40454d, 0.55, 0.4);
      cyl(0.46, 0.46, 0.05, 16, std(0x8b6b4a, 0.85), 0, 0.72, 0, gg);
      cyl(0.035, 0.035, 0.7, 8, metal, 0, 0.36, 0, gg);
      cyl(0.28, 0.32, 0.04, 12, metal, 0, 0.02, 0, gg);
      cyl(0.055, 0.045, 0.1, 8, std(0xfbf6ea, 0.6), 0.16, 0.795, 0.1, gg).castShadow = false;
      [-1, 1].forEach(function (s) {
        const c = new THREE.Group();
        c.position.set(0.84 * s, 0, 0);
        c.rotation.y = -Math.PI / 2 * s;
        gg.add(c);
        box(0.42, 0.05, 0.42, std(0x9a7a55, 0.9), 0, 0.44, 0, c);
        box(0.42, 0.45, 0.05, std(0x9a7a55, 0.9), 0, 0.66, -0.19, c);
        [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(function (p) {
          box(0.035, 0.44, 0.035, metal, p[0], 0.22, p[1], c).castShadow = false;
        });
      });
      cyl(0.03, 0.03, 2.2, 8, metal, 0, 1.1, 0, gg);
      const stripe = stripeTex(accent, '#fbf3e2');
      stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping;
      stripe.repeat.set(3, 1);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.4, 10, 1, false),
        new THREE.MeshStandardMaterial({ map: stripe, side: THREE.DoubleSide, roughness: 0.9 }));
      canopy.position.y = 2.16;
      canopy.castShadow = true;
      gg.add(canopy);
      return gg;
    }
    cafeSet(59.5, -14.6, '#c98a5a');
    cafeSet(55.7, -19.7, '#5b7f9c');

    // 花摊
    (function flowerStall() {
      const gg = new THREE.Group();
      gg.position.set(55.3, 0.12, -10.85);
      g.add(gg);
      const wood = std(0x7d5b3f, 0.92);
      box(1.8, 0.75, 0.7, wood, 0, 0.375, 0, gg);
      box(1.9, 0.08, 0.8, std(0x5f7a52, 0.9), 0, 0.79, 0, gg);
      const cols = [0xd76b6b, 0xe8b44a, 0xdfe4ea, 0xd58fc0];
      for (let i = 0; i < 3; i++) {
        const bx = -0.55 + i * 0.55;
        cyl(0.16, 0.13, 0.3, 10, std(0x9aa4a0, 0.8, 0.2), bx, 0.98, 0, gg);
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2;
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), std(cols[(i + k) % cols.length], 0.85));
          f.position.set(bx + Math.cos(a) * 0.09, 1.2 + (k % 2) * 0.07, Math.sin(a) * 0.09);
          f.castShadow = false;
          gg.add(f);
        }
      }
      const sm = new THREE.MeshBasicMaterial({ map: signTex('小花店', '一束 ¥8', '#fbf3e4', '#3a3128', '#c98a5a') });
      sm.toneMapped = false;
      cyl(0.028, 0.028, 1.35, 6, wood, 0.72, 0.68, -0.28, gg);
      plane(0.72, 0.44, sm, 0.72, 1.5, -0.26, gg).castShadow = false;
    })();

    // 长椅上睡着的猫
    (function benchCat() {
      const gg = new THREE.Group();
      gg.position.set(57.95, 0.52, -20.68);
      gg.rotation.y = -1.35;
      g.add(gg);
      const fur = std(0xd9b98a, 0.95);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), fur);
      body.scale.set(1.2, 0.72, 1.0);
      body.position.set(0, 0.1, 0);
      body.castShadow = true;
      gg.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), fur);
      head.position.set(0.19, 0.15, 0.02);
      head.castShadow = true;
      gg.add(head);
      [-1, 1].forEach(function (s) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 6), fur);
        ear.position.set(0.19, 0.25, 0.02 + s * 0.07);
        gg.add(ear);
        box(0.055, 0.012, 0.012, std(0x5b4a3a, 0.8), 0.29, 0.16, 0.02 + s * 0.05, gg).castShadow = false;
      });
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.032, 6, 12, Math.PI * 1.2), fur);
      tail.position.set(-0.06, 0.07, 0.13);
      tail.rotation.x = -Math.PI / 2;
      gg.add(tail);
      plaza.cat = gg;
    })();

    // 广场里的花瓣（几片慢慢飘）
    (function petals() {
      const list = [];
      const cols = [0xf7c9d8, 0xfaf6ee, 0xf3b8c8];
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.045),
          new THREE.MeshBasicMaterial({
            color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true, opacity: 0.85
          }));
        m.position.set(rnd(PLZ.x0 + 0.8, PLZ.x1 - 0.8), rnd(0.6, 4.2), rnd(PLZ.z0 + 0.8, PLZ.z1 - 0.8));
        m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
        g.add(m);
        list.push({ m: m, vy: rnd(0.1, 0.22), ph: rnd(0, 6), spin: rnd(0.4, 1.2) });
      }
      plaza.petals = list;
    })();

    plaza.jets = jets;
    plaza.water = water;
    plaza.waterMat = waterMat;
    plaza.on = false;
    plaza.k = 0;
    plaza.balloons = balloons;
    plaza.glow = glow;
    plaza.clockLamp = clockLamp;
    plaza.lastMin = -1;

    // ---------- 可点的地口 ----------
    if (interact) {
      interact.add({
        id: 'plaza-fountain', label: '喷泉',
        box: [PLZ_CX, 0.9, PLZ_CZ, 3.4, 2.0, 3.4],
        anchor: [PLZ_CX, 2.4, PLZ_CZ],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          plaza.on = !plaza.on;
          if (sfx && sfx.pour) sfx.pour(new THREE.Vector3(PLZ_CX, 0.8, PLZ_CZ));
          if (sfx && sfx.splash) sfx.splash();
        },
        say: function () { return plaza.on ? '水柱起来啦——再点一下我就关' : '喷泉开了，听水声'; }
      });
      interact.add({
        id: 'plaza-clock', label: '钟楼',
        box: [CLOCK.x, 3.9, CLOCK.z, 1.6, 1.6, 1.6],
        anchor: [CLOCK.x + 0.3, 4.8, CLOCK.z],
        when: function () { return !!isStreetNow(); },
        onClick: function () { if (sfx && sfx.chime) sfx.chime(); },
        say: function () {
          const n = new Date();
          const hh = n.getHours(), mm = n.getMinutes();
          return '现在 ' + hh + ':' + (mm < 10 ? '0' + mm : mm) + ' · 鲸鱼街钟楼';
        }
      });
      interact.add({
        id: 'plaza-board', label: '公告牌',
        box: [BOARD.x + 0.2, 1.4, BOARD.z, 0.6, 1.8, 2.9],
        anchor: [BOARD.x + 0.4, 2.2, BOARD.z],
        when: function () { return !!isStreetNow(); },
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: function () {
          const n = plaza.photoCount || 0;
          return n > 0 ? ('公告牌上挂着我拍的 ' + n + ' 张照片') : '公告牌还空着——等我拍几张照片再挂上';
        }
      });
      interact.add({
        id: 'plaza-balloon', label: '气球',
        box: [60.45, 2.1, -11.95, 1.3, 1.3, 0.9],
        anchor: [60.45, 2.85, -11.95],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          if (sfx && sfx.blip) sfx.blip();
          for (let i = 0; i < plaza.balloons.length; i++) plaza.balloons[i].bob = 1;
        },
        say: function () { return '气球五块一个——今天先挂着，等集市那天再接买卖'; }
      });
      // 长椅上睡着的猫
      interact.add({
        id: 'plaza-cat', label: '睡着的猫',
        box: [57.95, 0.72, -20.68, 0.9, 0.5, 0.7],
        anchor: [57.95, 1.3, -20.68],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          if (sfx && sfx.cat) sfx.cat();
          if (plaza.cat) plaza.cat.scale.y = 1.06;
        },
        say: '（呼噜呼噜）……它睡在长椅上，我不吵它'
      });
      // 喂鸽子
      interact.add({
        id: 'plaza-pigeons', label: '鸽子',
        box: [59.0, 0.25, -18.1, 3.0, 0.6, 2.4],
        anchor: [59.0, 1.1, -18.1],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          if (sfx && sfx.blip) sfx.blip();
          const list = frames.pigeons || [];
          for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (Math.abs(p.x - 59.0) < 3 && Math.abs(p.z + 18.1) < 3) p.hop = 1.0 + Math.random() * 0.6;
          }
        },
        say: '咕咕咕——一撒面包屑它们就都来了'
      });
      // 花摊
      interact.add({
        id: 'plaza-flowers', label: '小花店',
        box: [55.3, 1.0, -10.85, 1.9, 1.0, 0.9],
        anchor: [55.3, 1.9, -10.85],
        when: function () { return !!isStreetNow(); },
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '一束 ¥8——等集市那天就能买了'
      });
      // 露天座
      [[59.5, -14.6], [55.7, -19.7]].forEach(function (t, i) {
        interact.add({
          id: 'plaza-table' + i, label: '露天座',
          box: [t[0], 0.8, t[1], 1.4, 1.0, 1.4],
          anchor: [t[0], 1.9, t[1]],
          when: function () { return !!isStreetNow(); },
          onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
          say: '等咖啡馆开了，我就端一杯坐这儿，看喷泉'
        });
      });
    }
  }

  /* ================= 远处的楼（把地平线填上） ================= */
  function backdrop() {
    const rows = [
      { x: 42.5, z: 8, w: 9, h: 13, d: 8 },
      { x: 42.5, z: -10, w: 10, h: 16, d: 8 },
      { x: 42.5, z: -18.5, w: 8, h: 11, d: 7 },
      { x: 42.5, z: -27, w: 8, h: 12, d: 8 },
      { x: 42.5, z: 24, w: 10, h: 15, d: 8 },
      { x: 81.5, z: 12, w: 10, h: 16, d: 8 },
      { x: 81.5, z: -6, w: 9, h: 20, d: 8 },
      { x: 81.5, z: -22, w: 9, h: 14, d: 8 },
      { x: 81.5, z: 26, w: 8, h: 18, d: 8 }
    ];
    rows.forEach(function (r, i) {
      const tex = windowGridTex(5, 7);
      const mat = new THREE.MeshStandardMaterial({
        color: col(i % 2 ? 0xa7b0bb : 0x9aa3ae), roughness: 0.95,
        map: facadeTex(5, 7),                                  // M74：白天的立面（不然是一块灰板）
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0
      });
      (frames.far || (frames.far = [])).push(mat);
      const b = box(r.w, r.h, r.d, mat, r.x, r.h / 2, r.z);
      b.castShadow = false;      // 远处的楼只当背景：让它们投影会把整条街埋进阴影里
      b.receiveShadow = false;
      // 屋顶小水口 / 天线
      box(r.w * 0.3, 1.2, r.d * 0.3, std(0x555b64, 0.9), r.x, r.h + 0.6, r.z).castShadow = false;
    });
  }

  /* ================= 天上的球（白口 夜里换一张） ================= */
  function buildSky() {
    const dayTex = canvasTex(1024, 512, function (g, W, Hh) {
      const grad = g.createLinearGradient(0, 0, 0, Hh);
      grad.addColorStop(0, '#6f9fd6');
      grad.addColorStop(0.5, '#a8c8e4');
      grad.addColorStop(0.86, '#cfe2ee');
      grad.addColorStop(1, '#e4ecec');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, Hh);
      // 云：几道很淡的横云，别糊成大白团
      for (let i = 0; i < 9; i++) {
        const cy = 210 + Math.random() * 190;
        const cw = 120 + Math.random() * 260;
        g.fillStyle = 'rgba(255,255,255,' + (0.16 + Math.random() * 0.16) + ')';
        g.beginPath();
        g.ellipse(Math.random() * W, cy, cw, 9 + Math.random() * 10, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    const nightTex = canvasTex(1024, 512, function (g, W, Hh) {
      const grad = g.createLinearGradient(0, 0, 0, Hh);
      grad.addColorStop(0, '#0a1226');
      grad.addColorStop(0.6, '#152138');
      grad.addColorStop(1, '#25314a');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 260; i++) {
        const a = Math.random();
        g.fillStyle = 'rgba(255,246,220,' + (0.25 + a * 0.7) + ')';
        g.fillRect(Math.random() * W, Math.random() * Hh * 0.8, 1 + (a > 0.85 ? 1 : 0), 1 + (a > 0.85 ? 1 : 0));
      }
      // 一轮小月亮（贴地平线一点，别被球顶拉变形）
      g.fillStyle = 'rgba(245,238,214,.95)';
      g.beginPath();
      g.arc(W * 0.66, Hh * 0.42, 13, 0, Math.PI * 2);
      g.fill();
    });
    const mat = new THREE.MeshBasicMaterial({ map: dayTex, side: THREE.BackSide, toneMapped: false, fog: false });
    /* M74：天球原来半径 58、钉在街心（CX,0,0）。
     * 走到街尾时头顶那片天只剩 31 米远 —— 远处的楼和草地会被天球"切"掉，
     * 抬头还能看出球面在动。改成跟着玩家平移（半径 90），视距就只由 camera.far 决定。 */
    const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), mat);
    dome.position.set(CX, 0, 0);
    dome.name = 'street-sky';
    root.add(dome);
    frames.sky = { mat: mat, mesh: dome, day: dayTex, night: nightTex, isDay: null };
  }

  /* ================= 街上的居口 ================= */
  /* ================= M50：街上的熟客 =================
   * 妈妈 2026-11-15「继续建设和完善玩法吧」。
   *
   * 街上原来那三个「路过的人」只会随机说一句「今天街上挺热闹」。这次把他们变成有名有姓的熟客：
   *   ① 每个人有自己常待的店门口（不再满街乱跑，找得到人）
   *   ② 点他 = 打招呼：**每天第一次** +1 ♡（一天一次，存在 localStorage）
   *   ③ 他还会拜托你一件事，办成了 +2 ♡ 并塞给你一点钱：
   *        阿兔  · 面包房 · 带一个鲸鱼包来
   *        小满  · 码头   · 钓一条鱼（要现钓的，会记下"接活时你钓了几条"）
   *        豆豆  · 花店   · 带一束花回家插进花瓶
   *        龟爷爷 · 邮局   · 帮他寄一封信给鸭子
   *   ④ ♡3 起他会**记得你干过什么**（直接读别的模块的账：钓了几条鱼 / 寄了几封信 / 花还开着吗）
   *   ⑤ ♡5 你走近他会主动叫住你
   *
   * 只读别的模块（build 时传进来的 peek.*），一行都没改它们。
   */
  const REG_LS = 'xd_regulars_v1';
  const REG_HEART_MAX = 5;

  // side: 1 = 东侧人行道 / -1 = 西侧；home = 常待的 z；range = 来回走多远
  // 注意：z 范围要**避开各自店门口的点击热区**（门口 ±0.95），
  // 不然站着的人会抢走"点门面进店"的准星（试玩里就撞到了：pick=street-guest3）
  //
  // M50.1：每个人还有**作息**（sched）—— 早上/中午/下午/夜里可能站在不同的地方，
  // 小孩子（阿兔、豆豆）天黑就回家睡了。z 是新的常待点，present:false = 回家了。
  const REG_SLOTS = [
    { id: 'rabbi', side: 1, home: 8.0, range: 1.7,      // 阿兔 · 面包房门口旁边（门 10.95）
      sched: {
        morning: { z: 8.0, range: 1.6 },                // 一早在面包房门口等出炉
        noon: { z: 8.0, range: 1.6 },
        afternoon: { z: 13.4, range: 2.2 },             // 下午跑到面包房北边看橱窗
        night: { present: false }                       // 天黑回家睡觉
      } },
    { id: 'cat', side: 1, home: 24.4, range: 1.7,       // 小满 · 码头门口旁边（门 27.66）
      sched: {
        morning: { z: 11.0, range: 2.0 },               // 早上在面包房门口晒太阳（有面包味）
        noon: { z: 22.6, range: 1.8 },                  // 中午挪到邮局北边那块阴凉（别堵门口）
        afternoon: { z: 24.4, range: 2.4 },             // 下午去码头等鱼
        night: { z: 24.6, range: 2.6 }                  // 猫夜里最精神，一直守在码头
      } },
    { id: 'duck', side: -1, home: 13.2, range: 1.6,     // 豆豆 · 花店门口旁边（门 16.52）
      sched: {
        morning: { z: 13.2, range: 1.6 },               // 早上在花店门口数花
        noon: { z: 13.2, range: 1.6 },
        afternoon: { z: 5.0, range: 2.4 },              // 下午溜达到咖啡馆露台那边
        night: { present: false }                       // 天黑回家
      } },
    { id: 'turtle', side: 1, home: 18.2, range: 1.2,    // 龟爷爷 · 邮局门口旁边（门 20.95）
      sched: {
        morning: { z: 18.2, range: 1.2 },
        noon: { z: 18.2, range: 1.2 },
        afternoon: { z: 18.2, range: 1.2 },
        night: { z: 18.2, range: 1.0 }                  // 老人家慢，夜里也还在门口站着
      } }
  ];

  /* 一天分四段：白天按真实小时再分早/中/下午；夜里就是夜里（点 ☀️/🌙 能手动切） */
  let regPhaseOverride = null;      // 只给试玩脚本用（不然"下午"要等到 15 点）
  function regPhase() {
    if (regPhaseOverride) return regPhaseOverride;
    if (getMode() === 'night') return 'night';
    const h = new Date().getHours();
    if (h < 11) return 'morning';
    if (h < 15) return 'noon';
    return 'afternoon';
  }

  const REG_QUEST = {
    rabbi: {
      k: 'whale', reward: 8,
      ask: '我今天特别想吃鲸鱼包……你路过鲸麦坊帮我买一个好不好？',
      hint: '鲸鱼包在鲸麦坊的玻璃柜里（¥9），买了再来找我——袋子别丢',
      done: '真的是鲸鱼包！麦师傅捏的那条最像鲸鱼。这个给你，路上买点别的吃',
      ok: function () { return /whale/.test(String(peek.bakery() || '')); }
    },
    cat: {
      k: 'fish', reward: 10, read: 'fish',
      ask: '你身上……有股鱼味。你去码头钓鱼好不好？小鱼就行，我拿零花钱跟你换',
      hint: '鲸鱼码头在街东侧最南头，钓上来再回来找我（别放跑啦）',
      done: '真的有鱼味！今天的风都是咸的。这个给你——我自己攒的',
      ok: function (q) { return peek.fish() > q.base; }
    },
    duck: {
      k: 'flower', reward: 6,
      ask: '妈妈说家里有花才像家。你会插花瓶吗？带一束回去插好，再告诉我好不好看',
      hint: '鲸花屿在街西侧：挑花 → 「包起来」→ 回家餐桌上插进小花瓶',
      done: '插好啦！那我也要去买一束。这个给你，算是买花的钱',
      ok: function () { return peek.flower() > 0; }
    },
    turtle: {
      k: 'post', reward: 12, read: 'post',
      ask: '我这把年纪写字慢……你帮我寄一封给小鸭子吧，我等它的回信',
      hint: '去鲸邮局：买张邮票（¥2）→ 拿明信片 → 选小鸭子 → 盖章 → 投进绿邮筒',
      done: '寄出去了呀。那我就慢慢等——反正我有的是时间。这个你拿着',
      ok: function (q) { return peek.post() > q.base; }
    }
  };

  /* 每个熟客的说话口气：h = 好感（0~5） */
  const REG_TALK = {
    rabbi: {
      hi: ['……啊，是小D。', '又来啦。这条街有你就不冷清。', '你今天气色不错，比面包还松软。'],
      chat: ['面包要挑最上面那袋，压扁的不算。', '我抱着面包的时候，像抱着个暖水袋。'],
      mem: function () { return '你冰箱里那袋面包吃完了吗？别放到硬邦邦的。'; }
    },
    cat: {
      hi: ['……喵。', '你身上有河的味道。', '今天风是咸的，很适合去码头。'],
      chat: ['我在这条街上睡过的窗台，比走过的路还多。', '太阳挪一挪，我也挪一挪。'],
      mem: function () { return '你已经钓了 ' + peek.fish() + ' 条鱼了吧？我数着呢。'; }
    },
    duck: {
      hi: ['嘎！你回来啦！', '我刚才在这边数花。', '这条街上的花，我都认得。'],
      chat: ['我把花瓣数到十七就数不清了。', '花店的风铃响起来，像有人在笑。'],
      mem: function () { return '你花瓶里的花还开着吗？记得换水呀。'; }
    },
    turtle: {
      hi: ['……你走得好快。', '我刚走到这儿，正好碰上你。', '慢慢来，不着急。'],
      chat: ['我走一个来回要十分钟，但每天都走。', '这条街以前是土路，现在好看多了。'],
      mem: function () { return '你已经寄了 ' + peek.post() + ' 封信了。手写的信，现在不多啦。'; }
    }
  };

  let regState = null;      // { id: { h, day, q:{k, base}, done:{k:1} } }
  let peek = {
    fish: function () { return 0; }, post: function () { return 0; },
    flower: function () { return 0; }, bakery: function () { return ''; }
  };
  let earnFn = function () { return 0; };
  let walletOf = function () { return 0; };

  function regLoad() {
    try { regState = JSON.parse(localStorage.getItem(REG_LS) || '{}') || {}; } catch (e) { regState = {}; }
  }
  function regSave() {
    try { localStorage.setItem(REG_LS, JSON.stringify(regState)); } catch (e) { /* 无所谓 */ }
  }
  function regOf(id) {
    if (!regState) regLoad();
    if (!regState[id]) regState[id] = { h: 0, day: '', q: null, done: {} };
    const s = regState[id];
    if (!s.done) s.done = {};
    return s;
  }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function heartsStr(n) {
    let s = '';
    for (let i = 0; i < REG_HEART_MAX; i++) s += (i < n ? '♥' : '♡');
    return s;
  }
  function regHi(id, h) {
    const t = REG_TALK[id];
    if (!t) return '……';
    return h >= 5 ? t.hi[2] : (h >= 3 ? t.hi[1] : t.hi[0]);
  }

  /* 点一个熟客：委托结算 → 委托提醒 → 今天的招呼 → 闲聊 */
  function talkRegular(idx) {
    const r = residents[idx];
    if (!r || !r.def) return;
    const def = r.def;
    const st = regOf(def.id);
    const qd = REG_QUEST[def.id];
    r.spoke = 1.8;
    r.w.wave = 1.6;
    if (sfx && sfx.blip) sfx.blip();
    const sayAt = function (text, sec) {
      if (interact && interact.say) {
        interact.say(new THREE.Vector3(r.w.x, 1.62, r.w.z), text, sec || 4.6);
      }
    };
    // ① 委托办成了？
    if (st.q && qd && qd.ok(st.q)) {
      st.h = Math.min(REG_HEART_MAX, st.h + 2);
      st.done[qd.k] = 1;
      st.q = null;
      regSave();
      if (earnFn) earnFn(qd.reward);
      if (sfx && sfx.cash) sfx.cash();
      const tail = st.h >= REG_HEART_MAX
        ? '　（' + heartsStr(st.h) + ' 我们现在算是老熟人了）'
        : '　' + heartsStr(st.h);
      sayAt(def.name + '：' + qd.done + '　+¥' + qd.reward + tail, 6.5);
      return;
    }
    // ② 有委托还没办
    if (st.q && qd) {
      sayAt(def.name + '：' + qd.hint, 5.4);
      return;
    }
    // ③ 今天第一次见 → 打招呼（+1 ♡），顺便把委托说出来
    const tk = todayKey();
    if (st.day !== tk) {
      st.day = tk;
      st.h = Math.min(REG_HEART_MAX, st.h + 1);
      regSave();
      if (st.h >= REG_HEART_MAX && sfx && sfx.chime) sfx.chime();
      let line = regHi(def.id, st.h);
      if (qd && !st.done[qd.k]) {
        st.q = { k: qd.k, base: (qd.read === 'fish' ? peek.fish() : (qd.read === 'post' ? peek.post() : 0)) };
        regSave();
        line += ' ' + qd.ask;
        sayAt(def.name + '：' + line + '　' + heartsStr(st.h), 7);
      } else {
        sayAt(def.name + '：' + line + '　' + heartsStr(st.h), 5.2);
      }
      return;
    }
    // ④ 今天已经聊过了
    if (st.h >= 3 && REG_TALK[def.id] && REG_TALK[def.id].mem) {
      sayAt(def.name + '：' + REG_TALK[def.id].mem() + '　' + heartsStr(st.h), 5.6);
      return;
    }
    const chats = REG_TALK[def.id] ? REG_TALK[def.id].chat : ['……'];
    sayAt(def.name + '：' + pick(chats) + '　' + heartsStr(st.h), 5);
  }

  function makeResident(slot) {
    if (!XD.Customers || !XD.Customers.newWalker) return null;
    const cast = XD.Customers.cast();
    const cfg = REG_SLOTS[slot] || {};
    let def = null;
    for (let i = 0; i < cast.length; i++) {
      if (cast[i].id === cfg.id) { def = cast[i]; break; }
    }
    if (!def) def = pick(cast);
    const w = XD.Customers.newWalker(def);
    root.add(w.root);
    const side = cfg.side || (slot % 2 === 0 ? -1 : 1);
    // 走马路牙子边上，别贴太近（公交停站时这里会挤）
    const lane = side < 0 ? WX0 + 0.42 : WX1 - 0.62;
    const home = (cfg.home === undefined) ? 0 : cfg.home;
    const ph0 = regPhase();
    const slot0 = (cfg.sched && cfg.sched[ph0]) ? cfg.sched[ph0] : null;
    const z0 = (slot0 && slot0.z !== undefined) ? slot0.z : home;
    const r = {
      def: def, w: w, side: side, lane: lane,
      home: home, range: (cfg.range === undefined ? 8 : cfg.range),
      z: z0 + rnd(-1.2, 1.2), dir: Math.random() < 0.5 ? 1 : -1,
      speed: rnd(0.95, 1.3) * (def.speed || 1),
      wait: 0, phase: 'walk', t: 0, spoke: 0, greeted: false,
      sched: cfg.sched || null, phaseName: ph0, gone: false, goal: null
    };
    // 一建出来就按当前时段就位（夜里该回家的，直接是隐藏的）
    if (slot0) {
      if (slot0.range !== undefined) r.range = slot0.range;
      if (slot0.z !== undefined) { r.home = slot0.z; r.z = slot0.z + rnd(-0.8, 0.8); }
      if (slot0.present === false) { r.gone = true; w.root.visible = false; }
    }
    w.x = lane;
    w.z = r.z;
    w.yaw = r.dir > 0 ? 0 : Math.PI;
    w.yawTarget = w.yaw;
    return r;
  }

  function spawnResident() {
    for (let i = 0; i < 4; i++) {
      if (!residents[i]) {
        const r = makeResident(i);
        if (!r) return null;
        residents[i] = r;
        return r;
      }
    }
    return null;
  }

  /* M50.1：把某个时段的安排套到这个人身上（换地方 / 回家） */
  function applyRegSlot(r, slot) {
    if (!r || !r.def) return;
    if (!slot) return;
    if (slot.present === false) {
      r.gone = true;
      if (r.w && r.w.root) r.w.root.visible = false;
      return;
    }
    const wasGone = r.gone;
    r.gone = false;
    if (r.w && r.w.root) r.w.root.visible = true;
    if (slot.range !== undefined) r.range = slot.range;
    if (slot.z !== undefined) {
      // 刚"回家"回来的人直接出现在新位置；一直在街上的人**走过去**（别凭空瞬移）
      if (wasGone) { r.z = slot.z; r.home = slot.z; r.goal = null; }
      else if (Math.abs(slot.z - r.z) > 0.5) { r.home = slot.z; r.goal = slot.z; r.phase = 'walk'; r.wait = 0; }
      else r.home = slot.z;
    }
  }

  function updateResidents(dt, camPos) {
    const ph = regPhase();
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      if (!r) continue;
      // M50.1：作息到了就换地方（夜里回家的直接藏起来，热区也关掉）
      if (r.sched && r.phaseName !== ph) {
        r.phaseName = ph;
        applyRegSlot(r, r.sched[ph]);
      }
      if (r.gone) continue;
      r.t += dt;
      r.w.t += dt;
      // M50：玩家站在很近的地方 → 他停下来看着你（不然会"一边看着你一边横着滑走"）
      let near = false, ndx = 0, ndz = 0;
      if (camPos) {
        ndx = camPos.x - r.w.x;
        ndz = camPos.z - r.w.z;
        near = (ndx * ndx + ndz * ndz) < 16;
      }
      if (near) {
        r.w.moving = false;
        r.w.yawTarget = Math.atan2(ndx, ndz);
        r.waveT = (r.waveT || 0);
      } else if (r.phase === 'walk') {
        r.w.moving = true;
        // M50.1：换了地方就一路走过去（这时候先别用 home±range 夹住）
        if (r.goal !== null && r.goal !== undefined) {
          const gd = r.goal - r.z;
          if (Math.abs(gd) < 0.18) { r.z = r.goal; r.goal = null; }
          else r.dir = gd > 0 ? 1 : -1;
        }
        r.w.yawTarget = r.dir > 0 ? 0 : Math.PI;
        r.z += r.dir * r.speed * dt;
        // M50：只在自己那家店门口一带溜达（不然满街跑，客人找不到他）
        const hz = (r.home === undefined) ? 0 : r.home;
        const rg = (r.range === undefined) ? 8 : r.range;
        if (r.goal === null || r.goal === undefined) {
          if (r.z > hz + rg) { r.z = hz + rg; r.dir = -1; }
          if (r.z < hz - rg) { r.z = hz - rg; r.dir = 1; }
        }
        // 走到店门口会停一下看看橱口
        if (Math.random() < dt * 0.12) {
          r.phase = 'look';
          r.wait = rnd(2.2, 4.2);
          r.w.moving = false;
          r.w.yawTarget = r.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      } else {
        r.wait -= dt;
        r.w.moving = false;
        if (r.wait <= 0) r.phase = 'walk';
      }
      // 抬手打招呼（点它的时候）
      if (r.spoke > 0) r.spoke -= dt;
      // M50：♡5 的熟人，你走近会主动叫住你（走远了才重置，别一直喊）
      if (camPos) {
        const st = regOf(r.def.id);
        const dx = r.w.x - camPos.x, dz = r.w.z - camPos.z;
        const d2 = dx * dx + dz * dz;
        if (st.h >= REG_HEART_MAX && d2 < 12 && !r.greeted) {
          r.greeted = true;
          r.spoke = 1.8;
          r.w.wave = 1.6;
          if (interact && interact.say) {
            interact.say(new THREE.Vector3(r.w.x, 1.66, r.w.z),
              r.def.name + '：' + regHi(r.def.id, st.h) + '　' + heartsStr(st.h), 5);
          }
        } else if (d2 > 40) {
          r.greeted = false;
        }
      }
      r.w.x = r.lane;
      r.w.z = r.z;
      XD.Customers.poseWalker(r.w, dt, {
        armUp: r.spoke > 0,
        lookYaw: r.phase === 'look' ? Math.sin(r.t * 0.9) * 0.3 : 0
      });
    }
  }

  /* ================= M42：居民的一天 =================
   * 妈妈 2026-11-14 16:06「诶！！！好玩，继续完善小镇，检查一下bug」
   *
   * 街修好了、广场立起来了、咖啡馆也开了，就差"有人过日子"：
   *   - 3 路公交：从北边开过来，在公交站停住、开门，两个人上车、一个人下车，再往南开走
   *   - 邮差：从邮局出来，把信塞进家门口的邮筒，过斑马线，一路走到咖啡馆喝一杯
   *   - 等车的人：站牌下常驻两个；车走了会再从北边走过来两个
   *   - 下车的人：自己在路边走一段，拐进咖啡馆
   * 人还是借便利店那套小人（XD.Customers.newWalker），不另画模型；
   * 走路靠路边（不占人行道上那些树/灯/消防栓，免得穿模）
   */

  const BUS_X = 63.95;              // 西侧车道（往南开，靠西走口
  const BUS_STOP_Z = -16.0;         // 停在站牌前（往北挪了：别停在南门斑马线上）
  const BUS_ENTER_Z = 36, BUS_EXIT_Z = -38;

  let bus = null, postman = null;
  let crowd = [];                   // 等车口 / 上车口 / 下车口 / 邮差，共用一口
  let letterFx = [];                // 塞进邮筒后停一会儿的信

  /* ---------- 一个小口 + 一条路 ---------- */
  function addWalker(def, x, z, yaw) {
    if (!XD.Customers || !XD.Customers.newWalker) return null;
    const w = XD.Customers.newWalker(def || pick(XD.Customers.cast()));
    root.add(w.root);
    w.x = x; w.z = z; w.y = 0;
    w.yaw = w.yawTarget = yaw || 0;
    w.root.position.set(x, 0, z);
    w.root.rotation.y = w.yaw;
    return w;
  }

  function newActor(w, path, speed) {
    const a = {
      w: w, path: path || [], i: 0, speed: speed || 1.15,
      wait: 0, stand: false, faceYaw: 0, done: false, hideAtEnd: true
    };
    crowd.push(a);
    return a;
  }

  function retireActor(a) {
    if (!a || a.done) return;
    a.done = true;
    if (a.w && a.w.root) {
      a.w.root.visible = false;
      if (a.w.root.parent) a.w.root.parent.remove(a.w.root);
    }
  }

  // 沿路点走一格；路点可以口 wait（停几秒口  act（做件事口  hide（走到就消失口
  function stepPathActor(a, dt) {
    const w = a.w;
    if (!w || a.done) return;
    w.t += dt;

    if (a.wait > 0) {
      a.wait -= dt;
      w.moving = false;
      XD.Customers.poseWalker(w, dt, {});
      return;
    }

    if (a.i >= a.path.length) {
      if (a.stand) {
        // 站住：面朝马路，时不时左右看看
        w.moving = false;
        w.yawTarget = a.faceYaw;
        XD.Customers.poseWalker(w, dt, { lookYaw: Math.sin(w.t * 0.7 + 1.3) * 0.22 });
        return;
      }
      retireActor(a);
      return;
    }

    const tp = a.path[a.i];
    const dx = tp.x - w.x, dz = tp.z - w.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.07) {
      w.x = tp.x; w.z = tp.z;
      a.i++;
      a.wait = tp.wait || 0;
      if (tp.act) tp.act(a);
      if (tp.hide) { retireActor(a); return; }
      if (dist < 0.07) {
        w.moving = false;
        XD.Customers.poseWalker(w, dt, {});
      }
      return;
    }

    const step = Math.min(dist, a.speed * dt);
    w.x += dx / dist * step;
    w.z += dz / dist * step;
    w.yawTarget = Math.atan2(dx, dz);
    w.moving = true;
    XD.Customers.poseWalker(w, dt, {});
  }

  /* ---------- 公交 ---------- */
  function buildBus() {
    const g = new THREE.Group();
    g.name = 'street-bus-m42';
    const L = 5.6, W = 2.0;
    const cream = std(0xf6e7c8, 0.66);
    const trim = std(0xc9793f, 0.62, 0.08);
    const dark = std(0x39424c, 0.7, 0.25);
    const glass = new THREE.MeshStandardMaterial({
      color: col(0x1b2530), roughness: 0.22, metalness: 0.15,
      emissive: col(0xffc97a), emissiveIntensity: 0.03
    });

    box(W, 1.9, L, cream, 0, 1.45, 0, g);                     // 车身
    box(W - 0.12, 0.14, L - 0.12, cream, 0, 2.47, 0, g);       // 车顶
    box(W + 0.02, 0.22, L + 0.02, trim, 0, 1.18, 0, g);        // 腰线
    box(W + 0.08, 0.66, L - 1.6, glass, 0, 1.98, -0.1, g).castShadow = false;   // 侧窗
    // 侧窗的竖挺（不然侧面就是一大块黑玻璃，像货车）
    [-2.02, -1.12, 0.06, 1.02, 1.86].forEach(function (zz) {
      [-1, 1].forEach(function (sgn) {
        box(0.05, 0.72, 0.09, cream, sgn * (W / 2 + 0.03), 1.98, zz, g).castShadow = false;
      });
    });
    box(W + 0.06, 0.05, L - 1.6, dark, 0, 1.64, -0.1, g).castShadow = false;    // 窗下压条
    box(W - 0.22, 0.8, 0.06, glass, 0, 2.0, -L / 2 - 0.01, g).castShadow = false; // 前挡风
    box(W - 0.44, 0.6, 0.03, dark, 0, 2.06, L / 2 + 0.006, g).castShadow = false;  // 后窗框
    box(W - 0.52, 0.5, 0.06, glass, 0, 2.06, L / 2 + 0.02, g).castShadow = false;  // 后窗
    box(0.86, 0.17, 1.3, std(0xded5c2, 0.85), 0, 2.62, 0.5, g);                    // 车顶空调
    box(W - 0.06, 0.22, 0.14, dark, 0, 0.62, -L / 2 - 0.03, g);   // 前保险杠
    box(W - 0.06, 0.2, 0.12, dark, 0, 0.62, L / 2 + 0.02, g);    // 后保险杠
    box(W - 0.1, 0.1, 0.1, std(0x8c949c, 0.6, 0.3), 0, 0.44, L / 2 + 0.02, g);   // 后防擦条

    // 轮子（四个，转不转看不太出来，就不转了；中间加个浅色轮毂，别是一块黑砖）
    const wheelMat = std(0x22282e, 0.9);
    [[-1, -1.72], [1, -1.72], [-1, 1.72], [1, 1.72]].forEach(function (p) {
      const wh = cyl(0.36, 0.36, 0.22, 14, wheelMat, p[0] * (W / 2 - 0.05), 0.36, p[1], g);
      wh.rotation.z = Math.PI / 2;
      const hub = cyl(0.17, 0.17, 0.25, 12, std(0xa9b2ba, 0.5, 0.45), p[0] * (W / 2 - 0.05), 0.36, p[1], g);
      hub.rotation.z = Math.PI / 2;
      hub.castShadow = false;
    });

    // 车门：滑门（往车尾滑，不往外扫 —口 外面站着一排等车的人）
    const door = new THREE.Group();
    door.position.set(-W / 2, 1.36, 0);
    g.add(door);
    const leaf = new THREE.Group();
    leaf.position.set(0, 0, -0.53);
    door.add(leaf);
    box(0.06, 1.62, 1.06, std(0x93b7c9, 0.28, 0.2), 0, 0, 0, leaf).castShadow = false;
    box(0.05, 0.72, 0.78, glass, -0.02, 0.3, 0, leaf).castShadow = false;
    box(0.06, 1.62, 0.06, std(0x6d8797, 0.5, 0.3), 0.01, 0, -0.53, leaf).castShadow = false;

    // 侧面的小牌子（白底，别的城市巴士都有这么一块）
    const sideMat = new THREE.MeshBasicMaterial({ map: signTex('小鲸鱼巴士', 'XIAO JING YU BUS', '#fbf6ea', '#2f3442', '#c9793f') });
    sideMat.toneMapped = false;
    [-1, 1].forEach(function (sgn) {
      const p = plane(1.4, 0.36, sideMat, sgn * (W / 2 + 0.05), 1.44, 1.5, g, 0, sgn * Math.PI / 2);
      p.castShadow = false;
    });

    // 灯
    const headMat = new THREE.MeshStandardMaterial({
      color: col(0xfff4d8), emissive: col(0xffd489), emissiveIntensity: 0.35, roughness: 0.4
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: col(0xb8462f), emissive: col(0xff5a3a), emissiveIntensity: 0.25, roughness: 0.5
    });
    [-0.62, 0.62].forEach(function (x) {
      box(0.32, 0.19, 0.08, headMat, x, 0.92, -L / 2 - 0.06, g).castShadow = false;
      box(0.26, 0.17, 0.08, tailMat, x, 0.98, L / 2 + 0.05, g).castShadow = false;
    });
    const lamp = new THREE.PointLight(0xffd9a0, 0, 9, 1.8);
    lamp.position.set(0, 0.9, -L / 2 - 0.5);
    g.add(lamp);

    // 车头牌子
    const signMat = new THREE.MeshBasicMaterial({ map: signTex('3路', '街心广场 · 南门', '#2f4256', '#fbeccb', '#c9793f') });
    signMat.toneMapped = false;
    const sg = plane(1.12, 0.28, signMat, 0, 2.27, -L / 2 - 0.05, g);
    sg.rotation.y = Math.PI;
    sg.castShadow = false;

    // 车尾也挂一小块「3路」，跟在后面的人才知道是哪路车
    const rearMat = new THREE.MeshBasicMaterial({ map: signTex('3', '南门', '#2f4256', '#fbeccb', '#c9793f') });
    rearMat.toneMapped = false;
    plane(0.62, 0.3, rearMat, 0, 1.62, L / 2 + 0.03, g).castShadow = false;

    g.position.set(BUS_X, 0, BUS_ENTER_Z);
    g.visible = false;
    root.add(g);
    return {
      g: g, door: door, leaf: leaf, headMat: headMat, tailMat: tailMat, lamp: lamp,
      state: 'idle', timer: rnd(5, 9), z: BUS_ENTER_Z, spd: 0,
      wait: 0, doorK: 0, honk: 0, dropped: false, boarded: false
    };
  }

  function busOpen() {
    if (!bus) return;
    bus.state = 'open';
    bus.wait = 5.2;
    bus.doorK = 0;
    bus.dropped = false;
    bus.boarded = false;
  }

  function boardQueue() {
    let n = 0;
    const doorZ = BUS_STOP_Z - 0.55;
    for (let i = 0; i < crowd.length; i++) {
      const a = crowd[i];
      if (!a || a.tag !== 'queue' || !a.stand || a.boarding) continue;
      a.boarding = true;
      a.stand = false;
      a.wait = 0;
      a.speed = 1.5;
      a.path = [{ x: 62.6, z: doorZ }, { x: 63.05, z: doorZ, hide: true }];
      a.i = 0;
      n++;
      if (n >= 2) break;
    }
    return n;
  }

  function spawnRider() {
    const doorZ = BUS_STOP_Z - 0.55;
    const w = addWalker(null, 63.0, doorZ, Math.PI / 2);
    if (!w) return;
    const a = newActor(w, [
      { x: 62.6, z: doorZ + 0.2 },
      { x: 62.6, z: -11.0 },
      { x: 62.6, z: 8.2 },
      { x: 61.95, z: 4.95, wait: 0.45 },
      { x: 61.5, z: 4.92, hide: true }
    ], 1.2);
    a.tag = 'rider';
  }

  // M55：等车的人站到站台外侧（靠路牙这边），别站进长椅 / 玻璃里
  function standSpot(i) { return { x: 62.6, z: -16.5 + i * 1.05 }; }

  function spawnStanders(immediate) {
    for (let i = 0; i < 2; i++) {
      const sp = standSpot(i);
      const w = addWalker(null, 62.6, immediate ? sp.z + 0.5 : -10.6 - i * 1.2, Math.PI);
      if (!w) continue;
      const a = newActor(w, [
        { x: 62.6, z: sp.z + 0.5 },
        { x: sp.x, z: sp.z }
      ], immediate ? 1.4 : 1.1);
      a.stand = true;
      a.faceYaw = Math.PI / 2;
      a.tag = 'queue';
      if (immediate) a.speed = 1.4;
    }
  }

  function updateBus(dt, day, camPos, walking) {
    if (!bus) return;
    if (bus.lamp) bus.lamp.intensity = day ? 0 : 1.8;
    if (bus.headMat) bus.headMat.emissiveIntensity = day ? 0.35 : 2.1;
    if (bus.tailMat) bus.tailMat.emissiveIntensity = day ? 0.25 : 1.4;

    if (bus.state === 'idle') {
      bus.timer -= dt;
      if (bus.timer <= 0) {
        bus.state = 'arrive';
        bus.z = BUS_ENTER_Z;
        bus.spd = 5.4;
        bus.g.visible = true;
      }
      return;
    }

    if (bus.state === 'posed') {        // 截图用：定住不动
      bus.g.position.set(BUS_X, 0, bus.z);
      return;
    }

    if (bus.state === 'arrive' || bus.state === 'depart') {
      let target = 5.6;
      if (bus.state === 'arrive') {
        const d = bus.z - BUS_STOP_Z;
        target = d < 16 ? Math.max(0, d * 0.55) : 5.6;
        // 有人站在车头前面：刹住、按喇叭（别从妈妈身上开过去口
        if (walking && camPos) {
          const ahead = bus.z - camPos.z;
          if (ahead > 0 && ahead < 8.5 && Math.abs(camPos.x - BUS_X) < 1.75) {
            target = 0;
            if (bus.spd < 1.0) {
              bus.honk -= dt;
              if (bus.honk <= 0) { bus.honk = 2.4; if (sfx && sfx.horn) sfx.horn(); }
            }
          }
        }
      }
      bus.spd += (target - bus.spd) * Math.min(1, dt * (bus.state === 'arrive' ? 2.0 : 1.1));
      if (bus.spd < 0) bus.spd = 0;
      bus.z -= bus.spd * dt;

      if (bus.state === 'arrive' && bus.z <= BUS_STOP_Z + 0.02) {
        bus.z = BUS_STOP_Z;
        bus.spd = 0;
        busOpen();
      } else if (bus.state === 'depart' && bus.z < BUS_EXIT_Z) {
        bus.state = 'idle';
        bus.timer = rnd(14, 26);
        bus.g.visible = false;
      }
      bus.g.position.set(BUS_X, 0, bus.z);
      return;
    }

    if (bus.state === 'open') {
      bus.wait -= dt;
      const el = 5.2 - bus.wait;
      bus.doorK = Math.min(1, bus.doorK + dt * 2.4);
      bus.leaf.position.z = -0.53 - 1.04 * bus.doorK;
      if (!bus.dropped && el > 0.7) { bus.dropped = true; spawnRider(); }
      if (!bus.boarded && el > 1.5) { bus.boarded = true; boardQueue(); }
      if (bus.wait <= 0) { bus.state = 'close'; bus.wait = 0.7; }
      bus.g.position.set(BUS_X, 0, bus.z);
      return;
    }

    if (bus.state === 'close') {
      bus.wait -= dt;
      bus.doorK = Math.max(0, bus.doorK - dt * 3.0);
      bus.leaf.position.z = -0.53 - 1.04 * bus.doorK;
      if (bus.wait <= 0 && bus.doorK <= 0) {
        bus.state = 'depart';
        spawnStanders(false);
      }
      bus.g.position.set(BUS_X, 0, bus.z);
    }
  }

  /* ---------- 邮差 ---------- */
  function dressPostman(w) {
    if (!w) return;
    if (w.headG) {
      const capG = new THREE.Group();
      capG.position.set(0, 0.225, 0.01);
      capG.rotation.x = 0.10;
      w.headG.add(capG);
      const navy = std(0x3f5b86, 0.82);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), navy);
      crown.scale.set(0.245, 0.145, 0.235);
      crown.position.y = 0.02;
      crown.castShadow = true;
      capG.add(crown);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.026, 0.17), navy);
      brim.position.set(0, -0.02, 0.19);
      brim.rotation.x = 0.16;
      capG.add(brim);
    }
    if (w.bodyG) {
      const leather = std(0x8a6a48, 0.85);
      const sat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.11), leather);
      sat.position.set(-0.3, 0.56, -0.02);
      sat.castShadow = true;
      w.bodyG.add(sat);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.52, 0.03), std(0x6f5437, 0.9));
      strap.position.set(-0.16, 0.88, 0.19);
      strap.rotation.z = 0.52;
      w.bodyG.add(strap);
    }
  }

  function dropLetter(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: col(0xfdf6e4), roughness: 0.9 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.13), mat);
    m.position.set(x, y, z);
    m.rotation.y = -0.5;
    m.castShadow = false;
    root.add(m);
    letterFx.push({ m: m, t: 0 });
    if (sfx && sfx.mailbox) sfx.mailbox();
  }

  function startPostman() {
    if (!XD.Customers || !XD.Customers.newWalker) return false;
    if (postman && postman.actor && !postman.actor.done) return false;
    const def = {
      id: 'lintong', name: '邮差阿獾',
      fur: 0x8d99a8, belly: 0xdfe6ee, inner: 0xb98a8f,
      ear: 'dog', tail: 'puff', acc: 'vest', accColor: 0x3f5b86,
      scale: 1.0, speed: 1.0, tips: 0,
      likes: ['bread'], greet: '有信', hours: [[7, 19, 1]],
      chat: ['邮差阿獾的包总是鼓鼓的']
    };
    const w = addWalker(def, 70.55, 20.9, -Math.PI / 2);
    if (!w) return false;
    dressPostman(w);
    const a = newActor(w, [
      { x: 69.55, z: 23.2 },
      { x: 69.55, z: 27.7, wait: 1.7, act: function () { dropLetter(69.72, 0.92, 28.55); } },
      { x: 69.55, z: 27.3 },
      { x: 66.0, z: 27.18, wait: 0.2 },
      { x: 62.6, z: 27.18, wait: 0.2 },
      { x: 62.5, z: 8.4 },
      { x: 61.95, z: 4.95, wait: 0.5 },
      { x: 61.5, z: 4.92, hide: true }
    ], 1.15);
    a.tag = 'postman';
    postman = { actor: a, timer: 0 };
    return true;
  }

  function updatePostman(dt) {
    if (!postman) return;
    if (postman.actor) {
      if (postman.actor.done) {
        postman.actor = null;
        postman.timer = rnd(34, 58);
      }
    } else {
      postman.timer -= dt;
      if (postman.timer <= 0) startPostman();
    }
  }

  function updateCrowd(dt) {
    for (let i = crowd.length - 1; i >= 0; i--) {
      const a = crowd[i];
      if (!a || a.done) { crowd.splice(i, 1); continue; }
      stepPathActor(a, dt);
      if (a.done) crowd.splice(i, 1);
    }
    for (let i = letterFx.length - 1; i >= 0; i--) {
      const f = letterFx[i];
      f.t += dt;
      if (f.t > 4.5) {
        root.remove(f.m);
        if (f.m.material) f.m.material.dispose();
        letterFx.splice(i, 1);
      }
    }
  }

  /* ================= 三扇门的触发 ================= */
  function doorAt(p) {
    if (!p) return null;
    if (p.z > HOME_Z - 2.8 && Math.abs(p.x - CX) < 3.2) return 'home';
    if (p.z < GATE_Z + 2.8 && Math.abs(p.x - CX) < 4.2) return 'park';
    if (p.x > EAST_FACE - 1.1 && Math.abs(p.z - DOOR_STORE.z) < 0.95) return 'store';
    if (p.x < WX0 + 0.5 && Math.abs(p.z - 4.92) < 0.95) return 'cafe';   // 咖啡馆门口
    if (p.x < WX0 + 0.5 && Math.abs(p.z + 6.08) < 0.95) return 'earspa';  // M43：采耳馆门口
    if (p.x > EAST_FACE - 0.5 && Math.abs(p.z - 10.95) < 0.95) return 'bakery';  // M45：面包房门口
    if (p.x > EAST_FACE - 0.5 && Math.abs(p.z - 20.95) < 0.95) return 'post';    // M46：邮局门口
    if (p.x < WX0 + 0.5 && Math.abs(p.z - 16.52) < 0.95) return 'flower';        // M47：花店门口
    if (p.x > EAST_FACE - 0.5 && Math.abs(p.z - 27.66) < 0.95) return 'fishing';  // M49：鲸鱼码头门口
    // M61：鲸捏捏门口（门板世界坐标 = o.z + w*0.26 = 3.15 + 1.09 = 4.24）
    if (p.x > EAST_FACE - 0.5 && Math.abs(p.z - 4.24) < 0.95) return 'relax';
    return null;
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) return;
    t += dt;
    const day = getMode() === 'day';

    // 口 / 口
    frames.amb.intensity = day ? 0.24 : 0.06;
    frames.hemi.intensity = day ? 0.28 : 0.08;
    frames.sun.intensity = day ? 1.0 : 0.12;
    if (day) frames.sun.color.setHex(0xffe9c8);
    else frames.sun.color.setHex(0x9fb6e0);
    // 只在昼夜真的换了的时候换贴图：每帧改 map + needsUpdate 会让 three 一直重编材质（卡）
    if (frames.sky.isDay !== day) {
      frames.sky.isDay = day;
      frames.sky.mat.map = day ? frames.sky.day : frames.sky.night;
      frames.sky.mat.needsUpdate = true;
    }
    // M74：天球跟着玩家走（y 不动，地平线就一直在脚下那一条线上）
    if (frames.sky.mesh && camPos) {
      frames.sky.mesh.position.x = camPos.x;
      frames.sky.mesh.position.z = camPos.z;
    }

    // 夜里：窗 / 招牌 / 壁灯亮起来，路灯也亮
    const nightK = day ? 0.22 : 1.0;
    for (let i = 0; i < frames.glass.length; i++) {
      frames.glass[i].emissiveIntensity = 0.75 * nightK;
    }
    for (let i = 0; i < frames.bulbs.length; i++) {
      frames.bulbs[i].emissiveIntensity = day ? 0.35 : 1.35;
    }
    for (let i = 0; i < frames.far.length; i++) {
      frames.far[i].emissiveIntensity = day ? 0.10 : 0.95;
    }
    for (let i = 0; i < frames.lamps.length; i++) {
      frames.lamps[i].intensity = day ? 0 : 1.7;
    }
    for (let i = 0; i < frames.trees.length; i++) {
      const leaf = frames.trees[i];
      for (let k = 0; k < leaf.length; k++) {
        leaf[k].m.position.x = leaf[k].x0 + Math.sin(t * 1.1 + leaf[k].ph) * 0.022;
      }
    }

    updateResidents(dt, camPos);

    // M42：公口 / 等车的人 / 邮差
    updateBus(dt, day, camPos, walking);
    updateCrowd(dt);
    updatePostman(dt);

    // 公交和邮差的可点热区跟着口
    if (busHot) {
      const on = !!(bus && bus.g.visible);
      busHot.enabled = on;
      if (on) {
        busHot.mesh.position.set(BUS_X, 1.3, bus.z);
        busHot.anchor.set(BUS_X, 2.9, bus.z);
      }
    }
    if (postHot) {
      const pa = postman && postman.actor;
      const on = !!(pa && !pa.done && pa.w && pa.w.root.visible);
      postHot.enabled = on;
      if (on) {
        postHot.mesh.position.set(pa.w.x, 1.0, pa.w.z);
        postHot.anchor.set(pa.w.x, 1.9, pa.w.z);
      }
    }

    // 鸽子：被点了就扑腾两口
    if (frames.pigeons) {
      for (let i = 0; i < frames.pigeons.length; i++) {
        const pg = frames.pigeons[i];
        if (pg.hop > 0) {
          pg.hop -= dt;
          pg.g.position.y = (pg.baseY || 0) + Math.abs(Math.sin(t * 18 + pg.ph)) * 0.11;
          if (pg.hop <= 0) pg.g.position.y = pg.baseY || 0;
        }
      }
    }

    // M40：广场的动效（水柱升口 / 水面呼吸 / 气球口 / 钟面口 / 夜里打灯口
    if (plaza) {
      plaza.k += ((plaza.on ? 1 : 0) - plaza.k) * Math.min(1, dt * 2.6);
      for (let i = 0; i < plaza.jets.length; i++) {
        const j = plaza.jets[i];
        const k = plaza.k * (0.75 + 0.25 * Math.sin(t * 3.1 + j.ph));
        j.m.scale.y = 0.02 + k * 1.5;
        j.m.position.y = 0.9 + j.m.scale.y * 0.5;
        j.m.material.opacity = 0.12 + 0.45 * k;
      }
      if (plaza.water) {
        plaza.water.rotation.z = Math.sin(t * 0.5) * 0.01;
        plaza.waterMat.emissiveIntensity = day ? 0.22 : 0.55;
      }
      for (let i = 0; i < plaza.balloons.length; i++) {
        const b = plaza.balloons[i];
        if (b.bob > 0) b.bob -= dt;
        const wob = (b.bob > 0 ? 0.05 : 0.012) * Math.sin(t * (b.bob > 0 ? 9 : 1.4) + b.ph);
        b.m.position.y = b.y0 + wob;
        b.m.position.x += Math.sin(t * 1.1 + b.ph) * 0.0008;
      }
      if (plaza.glow) plaza.glow.intensity = day ? 0 : 1.0;
      if (plaza.clockLamp) plaza.clockLamp.intensity = day ? 0 : 1.2;
      // 花瓣口
      if (plaza.petals) {
        for (let i = 0; i < plaza.petals.length; i++) {
          const p = plaza.petals[i];
          p.m.position.y -= p.vy * dt;
          p.m.position.x += Math.sin(t * 0.7 + p.ph) * 0.18 * dt;
          p.m.rotation.z += p.spin * dt;
          if (p.m.position.y < 0.22) {
            p.m.position.y = rnd(3.8, 4.4);
            p.m.position.x = rnd(PLZ.x0 + 0.8, PLZ.x1 - 0.8);
            p.m.position.z = rnd(PLZ.z0 + 0.8, PLZ.z1 - 0.8);
          }
        }
      }
      // 猫：呼吸
      if (plaza.cat) {
        const s = plaza.cat.scale.y;
        plaza.cat.scale.y = s + (1 + Math.sin(t * 1.6) * 0.022 - s) * Math.min(1, dt * 3);
      }
      const nowMin = new Date().getMinutes();
      if (nowMin !== plaza.lastMin) {
        plaza.lastMin = nowMin;
        drawClockFace();
      }
    }

    // 居民的可点热区跟着口
    for (let i = 0; i < hots.length; i++) {
      const h = hots[i];
      const r = residents[i];
      if (!r || r.gone) { h.enabled = false; continue; }   // M50.1：回家睡了就不给人点
      h.enabled = true;
      h.mesh.position.set(r.w.x, 1.0, r.w.z);
      h.anchor.set(r.w.x, 1.55, r.w.z);
    }

    // 门口触发（走过去就进去，按钮也留着口
    if (cool > 0) cool -= dt;
    if (walking && cool <= 0 && camPos) {
      const d = doorAt(camPos);
      if (d) {
        cool = 3.0;
        onDoor(d);
      }
    }
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    isStreetNow = o.isStreet || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    renderer = o.renderer || null;
    // M50：熟客系统要用到「零花钱 / 别的模块的账」
    walletOf = o.wallet || function () { return 0; };
    earnFn = o.earn || function () { return 0; };
    if (o.peek) peek = o.peek;
    regLoad();
    if (!scene) return fallback();
    try {
      maxAniso = renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 4;
    } catch (e) { maxAniso = 4; }

    root = new THREE.Group();
    root.name = 'street-m39';
    root.visible = false;
    scene.add(root);

    frames = { glass: [], bulbs: [], far: [], lamps: [], trees: [], porch: [], signs: [] };

    // 街自己的光（跟乐园一个套路：白天亮、夜里暗，再靠路灯补口
    // 注意：家里的 hemi/ambient 是全局的、一直在亮，所以这里只补一点点，不然整个街口 发白、没影子"
    const amb = new THREE.AmbientLight(0xffe7c8, 0.24);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xcfe2f5, 0x9a8a72, 0.28);
    root.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe9c8, 1.0);
    sun.position.set(70, 30, -18);
    sun.target.position.set(CX, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0007;
    if (sun.shadow.normalBias !== undefined) sun.shadow.normalBias = 0.02;   // 大平地上口 自阴影麻口 
    sun.shadow.radius = 2;
    root.add(sun);
    root.add(sun.target);
    frames.amb = amb; frames.hemi = hemi; frames.sun = sun;

    // 路灯的实地光（只用三盏，别把显卡拖死）
    [-20, 0, 20].forEach(function (z) {
      const pl = new THREE.PointLight(0xffc98a, 0, 13, 1.6);
      pl.position.set(CX, 3.9, z);
      root.add(pl);
      frames.lamps.push(pl);
    });

    makePlaster();

    buildSky();
    buildGround();
    buildHomeEntrance();
    buildStore();
    buildGate();
    buildPlaza();          // M40：街心广场（喷泉 / 钟楼 / 公告牌 / 气球摊）
    backdrop();

    // 四间门面（先只做外观）
    shopFront({ side: 'west', z: 7, w: 8, sign: '咖啡馆', sub: 'CAFÉ · 手冲 · 窗边位', accent: '#c98a5a', signBg: '#fbf3e4' });
    shopFront({ side: 'west', z: -4, w: 8, sign: '采耳馆', sub: 'EAR SPA · 夜里开到十一点', accent: '#c9784a', signBg: '#2f1f16', signFg: '#f0cf92', wall: 0xe0d3bd, awning: false });
    shopFront({ side: 'east', z: 9, w: 7.5, sign: '面包房', sub: 'BAKERY · 早七点开', accent: '#c9a24a', signBg: '#fdf6e2', wall: 0xe9ddc4 });
    // M45：门口人行道上摆个面包摊（窗子里看不见，就摆到街上）
    (function () {
      const g2 = new THREE.Group();
      g2.position.set(70.67, SW_Y, 7.95);
      g2.rotation.y = Math.PI / 2;
      root.add(g2);
      const wood = std(0x8b6b4a, 0.9);
      const tray = std(0xb98f62, 0.9);
      const gold = std(0xd99a4e, 0.8);
      const gold2 = std(0xc3873f, 0.85);
      // 小桌子 + 木台面
      box(1.0, 0.06, 0.62, std(0xd8c6a4, 0.92), 0, 0.72, 0, g2);
      [-1, 1].forEach(function (s) {
        box(0.06, 0.72, 0.06, wood, s * 0.42, 0.36, -0.24, g2);
        box(0.06, 0.72, 0.06, wood, s * 0.42, 0.36, 0.24, g2);
      });
      // 两个筐，各装三个面包
      [-0.26, 0.26].forEach(function (bx, bi) {
        const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.15, 14, 1, true), tray);
        bk.position.set(bx, 0.82, 0);
        bk.material.side = THREE.DoubleSide;
        bk.castShadow = true;
        g2.add(bk);
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), i % 2 ? gold : gold2);
          b.position.set(bx + (i - 1) * 0.075, 0.9, (i === 1 ? 0.05 : -0.04));
          b.scale.set(1.4, 0.75, 1);
          b.castShadow = true;
          g2.add(b);
        }
      });
      // 旁边立一块小黑板（A 字架）
      const st = std(0x2b241c, 0.95);
      const bg = new THREE.Group();
      bg.position.set(0.62, 0, 0.02);
      bg.rotation.y = -0.22;
      g2.add(bg);
      const bd = box(0.4, 0.5, 0.04, st, 0, 0.42, 0, bg);
      bd.rotation.x = 0.12;
      [-1, 1].forEach(function (s) {
        const leg = box(0.03, 0.56, 0.03, std(0x6b4a30, 0.9), s * 0.17, 0.28, -0.1, bg);
        leg.rotation.x = -0.14;
      });
      // 板上画一行暖黄的字（用一小块布代替，远看是个牌子）
      box(0.32, 0.34, 0.01, std(0xd9a24a, 0.9), 0, 0.44, 0.03, bg).rotation.x = 0.12;
    })();
    shopFront({ side: 'east', z: 19, w: 7.5, sign: '邮局', sub: 'POST · 寄信 · 包裹', accent: '#4d6fa0', signBg: '#eef4fb', wall: 0xdedbd0 });
    // M60：解压游戏馆「鲸捏捏」（东侧 z 0，面包房北边那块空地）
    shopFront({
      side: 'east', z: 3.15, w: 4.2, sign: '鲸捏捏', sub: 'SQUISH · ASMR',
      accent: '#8f6fa8', signBg: '#241d2b', signFg: '#ffd9a0',
      wall: 0x4a4256, doorColor: 0x5a4a66, lit: 0xffc98a
    });

    // M49：街东侧最南头的「鲸鱼码头」（门在 z = 26.0 + 6.4*0.26 = 27.66）
    const pierFront = shopFront({
      side: 'east', z: 26.0, w: 6.4, sign: '鲸鱼码头', sub: 'WHARF · 钓鱼 · 现钓现卖',
      accent: '#3f7d96', signBg: '#eaf4f7', wall: 0xd6d8cd, doorColor: 0x6a7f88
    });
    // 门口摆的东西：一圈救生圈 + 一捆渔网 + 一只木桶（远看就知道是码头）
    (function (g) {
      const ropeMat = std(0xd8c9a8, 0.9);
      const ringMat = std(0xe0503c, 0.85);
      const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.075, 8, 18), ringMat);
      buoy.position.set(-1.55, 0.62, DEPTH / 2 + 0.24);
      buoy.castShadow = true;
      g.add(buoy);
      box(0.62, 0.06, 0.1, std(0xf2f0e6, 0.9), -1.55, 0.62, DEPTH / 2 + 0.29, g);
      // 渔网（一团挂着的小球）
      const netG = new THREE.Group();
      netG.position.set(1.45, 0.62, DEPTH / 2 + 0.22);
      g.add(netG);
      for (let i = 0; i < 12; i++) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), ropeMat);
        n.position.set(rnd(-0.16, 0.16), rnd(-0.1, 0.14), rnd(-0.06, 0.1));
        netG.add(n);
      }
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6), std(0xc9a25e, 0.9));
      cork.position.set(1.45, 0.88, DEPTH / 2 + 0.24);
      g.add(cork);
      // 木桶
      const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.42, 12), std(0x9b7a54, 0.92));
      bk.position.set(0.55, 0.21, DEPTH / 2 + 0.5);
      bk.castShadow = true;
      g.add(bk);
      const bkWater = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12),
        new THREE.MeshStandardMaterial({ color: col(0x6fa8bd), roughness: 0.2, metalness: 0.25 }));
      bkWater.rotation.x = -Math.PI / 2;
      bkWater.position.set(0.55, 0.42, DEPTH / 2 + 0.5);
      g.add(bkWater);
    })(pierFront);

    // M47：街西侧北段的「鲸花屿」花店（门在 z = 18.5 - 7.6*0.26 = 16.52）
    const flowerFront = shopFront({ side: 'west', z: 18.5, w: 7.6, sign: '鲸花屿', sub: 'FLOWERS · 现剪 · 现包', accent: '#d98a9a', signBg: '#fbf3e6', wall: 0xe7dcc6, doorColor: 0x8a6a48 });
    // 橱窗外面摆几张花箱（门面本体是实心的，橱窗是贴片 —— 花只能摆在窗台外沿）
    (function (g) {
      const potMat = std(0xb56b52, 0.9);
      const boxMat = std(0x8b6b4a, 0.9);
      const stemMat = std(0x6f9a5a, 0.9);
      const cols = [0xd9556b, 0xf2b53c, 0xfbf7ec, 0xc4a2d6];
      const spots = [[-1.75, 0], [-0.55, 1], [0.65, 2]];
      spots.forEach(function (sp) {
        const x = sp[0];
        // 小木花箱
        const bx = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.2), boxMat);
        bx.position.set(x, 0.63, DEPTH / 2 + 0.18);
        bx.castShadow = true;
        g.add(bx);
        for (let j = 0; j < 7; j++) {
          const dx = (j % 4 - 1.5) * 0.1;
          const dz = (j < 4 ? -0.04 : 0.05);
          const st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.24, 5), stemMat);
          st2.position.set(x + dx, 0.8, DEPTH / 2 + 0.18 + dz);
          st2.rotation.z = dx * 0.9;
          st2.castShadow = false;
          g.add(st2);
          const fl = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), std(cols[(sp[1] + j) % 4], 0.9));
          fl.position.set(x + dx * 1.5, 0.94 + (j % 3) * 0.02, DEPTH / 2 + 0.18 + dz);
          fl.scale.set(1.1, 0.8, 1.1);
          fl.castShadow = false;
          g.add(fl);
          // 绿叶：把"棒棒糖"压一压
          if (j < 5) {
            const lf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), std(0x54804a, 0.92));
            lf.position.set(x + dx * 1.2 + 0.03, 0.855 + (j % 2) * 0.02, DEPTH / 2 + 0.18 + dz * 1.6);
            lf.scale.set(1.5, 0.25, 0.6);
            lf.rotation.z = 0.4;
            lf.castShadow = false;
            g.add(lf);
          }
        }
      });
    })(flowerFront);
    // 门口摆两桶花 + 一块小黑板（街上路过就能看见今天有什么花）
    (function () {
      const g2 = new THREE.Group();
      g2.position.set(61.55, SW_Y, 15.3);
      g2.rotation.y = Math.PI / 2 + 0.1;
      root.add(g2);
      const steel = std(0xb9bcc0, 0.45, 0.5);
      const wood = std(0x8b6b4a, 0.9);
      const petalMats = [std(0xd9556b, 0.9), std(0xf2b53c, 0.9), std(0xfbf7ec, 0.9)];
      // 一个矮木台
      box(0.9, 0.06, 0.42, std(0xc9ab84, 0.92), 0, 0.34, 0, g2);
      [-1, 1].forEach(function (s) {
        box(0.06, 0.34, 0.06, wood, s * 0.38, 0.17, 0.14, g2);
        box(0.06, 0.34, 0.06, wood, s * 0.38, 0.17, -0.14, g2);
      });
      // 三只小铁桶，各插一色花
      [-0.28, 0, 0.28].forEach(function (dx, i) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.085, 0.24, 12, 1, true), steel);
        b.position.set(dx, 0.49, 0);
        b.material.side = THREE.DoubleSide;
        b.castShadow = true;
        g2.add(b);
        for (let j = 0; j < 3; j++) {
          const a = j * 2.1;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.22, 5),
            std(0x6f9a5a, 0.9));
          stem.position.set(dx + Math.cos(a) * 0.03, 0.62, Math.sin(a) * 0.03);
          stem.rotation.z = Math.cos(a) * 0.1;
          g2.add(stem);
          const fl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), petalMats[i]);
          fl.position.set(dx + Math.cos(a) * 0.05, 0.735, Math.sin(a) * 0.05);
          fl.scale.set(1.3, 0.75, 1.3);
          fl.castShadow = false;
          g2.add(fl);
        }
      });
      // 小黑板：今日花
      const bd = new THREE.Group();
      bd.position.set(0.02, 0, 0.34);
      bd.rotation.y = -0.28;
      g2.add(bd);
      const boardTex = canvasTex(200, 150, function (g, W, Hh) {
        g.fillStyle = '#2b241c'; g.fillRect(0, 0, W, Hh);
        g.strokeStyle = '#8b6b4a'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, Hh - 8);
        g.fillStyle = '#f3e6c8';
        g.font = 'bold 26px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center';
        g.fillText('今 日 花', W / 2, 44);
        g.font = '19px "Microsoft YaHei", sans-serif';
        g.fillStyle = '#e8c98a';
        g.fillText('小雏菊 ¥3 / 枝', W / 2, 82);
        g.fillStyle = '#d98a9a';
        g.fillText('玫瑰 ¥5 / 枝', W / 2, 112);
      });
      const bm = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false, side: THREE.DoubleSide });
      const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), bm);
      bp.position.set(0, 0.36, 0.02);
      bp.rotation.x = 0.1;
      bd.add(bp);
      [-1, 1].forEach(function (s) {
        const leg = box(0.03, 0.44, 0.03, std(0x6b4a30, 0.9), s * 0.19, 0.22, -0.02, bd);
        leg.rotation.x = s > 0 ? 0.16 : -0.16;
      });
    })();

    // M48：五间门面各自的"门口" + 街道细节（露台 / 灯笼 / 招牌 / 小猫 / 晾衣绳 / 井盖…）
    streetDressing();

    // 街上的小东西（M55：一律抬到人行道台面 SW_Y，站得住）
    streetSign(70.3, 27.4);
    busStop(61.70, -16.8);
    bench(61.7, -8.4, Math.PI / 2, SW_Y);
    bench(70.3, 2.6, -Math.PI / 2, SW_Y);
    bench(61.7, 12.6, Math.PI / 2, SW_Y);     // M47：原来在 21.5，正挡着花店橱窗，挪到咖啡馆和花店之间的空档
    stringLights(0);
    stringLights(12);
    stringLights(-12);
    // M55：自行车从采耳馆门口（-6.2，正压着门）挪到北边空墙，不压门框 / 灯笼
    bicycle(61.55, -2.0, 0.12);
    bicycle(70.45, 4.4, Math.PI - 0.1);     // M55：原来在 2.4，整辆插进长椅里；挪到长椅和面包房之间的空档
    // M55：花箱 1.5m 长，横着放会跨出 1.2m 的人行道（一头扎墙、一头悬空在车道）
    // 街边这两只转 90°，顺着人行道摆，再抬到台面
    flowerBox(61.7, 26.2, SW_Y, Math.PI / 2);      // M47：从花店门口（17.4）挪开
    flowerBox(70.36, -9.6, SW_Y, Math.PI / 2);     // M55：离路牙让出 17cm
    pigeon(61.65, 6.3, 0.7, SW_Y);
    pigeon(61.95, 6.8, -0.4, SW_Y);
    pigeon(61.55, 7.1, 2.3, SW_Y);
    mailbox(69.95, 28.4, -0.4);        // M55：原来在 69.7（路牙外 10cm），抬到台面后会悬空，挪上人行道
    mailbox(61.6, 1.6, Math.PI / 2 + 0.3);
    hydrant(61.65, 14.2);
    bin(70.35, 1.2, SW_Y);
    bin(61.65, 9.4, SW_Y);
    // M55：行道树的树池比人行道宽（1.15m）：不抬，抬了池边会悬在路牙外；保持原来的落地
    tree(61.75, 24.5, 1.05);
    tree(61.75, -22.5, 0.95);
    tree(61.75, 4.2, 0.85);
    tree(70.25, 14.6, 0.95);
    tree(70.25, -12.6, 1.0);
    tree(70.25, 24.2, 0.9);

    // 路灯：两侧错开（采耳馆门口那盏从 z=-6 挪到 -9.7，门口给门让出净空）
    lamp(61.9, -26, 1, SW_Y);
    lamp(61.9, -9.7, 1, SW_Y);
    lamp(61.9, 20.2, 1, SW_Y);   // M47：原来在 16，正戳在花店门口，往北挪了
    lamp(70.1, -16, -1, SW_Y);
    lamp(70.1, 6, -1, SW_Y);
    lamp(70.1, 26, -1, SW_Y);

    // 三扇门的可点热区（点口 = 进门 / 出去口
    if (interact) {
      interact.add({
        id: 'street-home', label: '我们家楼门',
        box: [DOOR_HOME.x, 1.2, HOME_Z - 0.35, 2.6, 2.6, 0.9],
        anchor: [DOOR_HOME.x, 2.6, HOME_Z - 0.6],
        when: function () { return !!isStreetNow(); },
        onClick: function () { onDoor('home'); },
        say: '回家'
      });
      interact.add({
        id: 'street-store', label: '便利店',
        box: [DOOR_STORE.x - 0.3, 1.2, DOOR_STORE.z, 0.9, 2.6, 2.0],
        anchor: [DOOR_STORE.x - 0.5, 2.4, DOOR_STORE.z],
        when: function () { return !!isStreetNow(); },
        onClick: function () { onDoor('store'); },
        say: '推门进去看看'
      });
      interact.add({
        id: 'street-gate', label: '南门',
        box: [CX, 2.0, GATE_Z + 0.4, 8.0, 3.6, 0.9],
        anchor: [CX, 3.2, GATE_Z + 0.5],
        when: function () { return !!isStreetNow(); },
        onClick: function () { onDoor('park'); },
        say: '出去就是水上乐园'
      });
      // 四间「还没开门」的门面：点一下我说一句（咖啡馆现在能进了口
      const shops = [
        { x: WEST_FACE + 0.4, z: 7 - 2.08, name: '咖啡馆', line: '咖啡馆开店啦，推门进去坐坐', cafe: true },
        { x: WEST_FACE + 0.4, z: -4 - 2.08, name: '采耳馆', line: '鲸耳堂——晚上开门，进去躺一会儿', ear: true },
        { x: EAST_FACE - 0.4, z: 9 + 1.95, name: '面包房', line: '鲸麦坊开店啦，推门进去闻闻香味', bakery: true },
        { x: EAST_FACE - 0.4, z: 19 + 1.95, name: '邮局', line: '鲸邮局开张啦——寄信、寄包裹、取信箱', post: true },
        { x: WEST_FACE + 0.4, z: 16.52, name: '鲸花屿', line: '鲸花屿开门啦——现剪现包，抱一束回家插瓶', flower: true },
        { x: EAST_FACE - 0.4, z: 27.66, name: '鲸鱼码头', line: '鲸鱼码头——点水面抛竿，钓上来的鱼能卖钱，也能带回家', fishing: true },
        // M61：门的热区必须对准**门板**，不是橱窗。shopFront 里门板在局部 x = w*0.26，
        // 西侧店 local x 往 -z 走，东侧店往 +z 走（rotation.y = -π/2）。
        // M60.1 把整间店从 z=0 挪到 3.15 时忘了同步这个偏移，结果判定落在橱窗上了。
        { x: EAST_FACE - 0.4, z: 3.15 + 4.2 * 0.26, name: '鲸捏捏', line: '鲸捏捏——解压馆，桌上有六样能捏能砸的东西', relax: true }
      ];
      shops.forEach(function (s, i) {
        interact.add({
          id: 'street-shop' + i, label: s.name,
          box: [s.x, 1.2, s.z, 0.9, 2.4, 1.4],
          anchor: [s.x, 2.5, s.z],
          when: function () { return !!isStreetNow(); },
          onClick: function () {
            if (s.cafe) { onDoor('cafe'); return; }
            if (s.bakery) {                       // M45：面包房（白天开）
              if (getMode() !== 'day') {
                if (sfx && sfx.blip) sfx.blip();
                if (interact && interact.say) {
                  interact.say(new THREE.Vector3(s.x, 2.5, s.z), '鲸麦坊打烊了——点右上角的 ☀️ 换成白天，麦师傅才在烤面包', 4.2);
                }
                return;
              }
              onDoor('bakery');
              return;
            }
            if (s.post) {                         // M46：邮局（全天开，信箱 24 小时）
              onDoor('post');
              return;
            }
            if (s.flower) {                       // M47：花店（全天开）
              onDoor('flower');
              return;
            }
            if (s.fishing) {                      // M49：鲸鱼码头（全天开）
              onDoor('fishing');
              return;
            }
            if (s.relax) {                        // M60：解压游戏馆（全天开）
              onDoor('relax');
              return;
            }
            if (s.ear) {
              if (getMode() !== 'night') {
                if (sfx && sfx.blip) sfx.blip();
                if (interact && interact.say) {
                  interact.say(new THREE.Vector3(s.x, 2.5, s.z), '鲸耳堂白天歇业——点右上角的 🌙 换成夜里，棉师傅才在', 4.2);
                }
                return;
              }
              onDoor('earspa');
              return;
            }
            if (sfx && sfx.blip) sfx.blip();
            if (interact && interact.say) {
              interact.say(new THREE.Vector3(s.x, 2.5, s.z), s.line, 3.6);
            }
          },
          say: function () {
            if (s.cafe) return s.line;
            if (s.ear) return getMode() === 'night' ? '鲸耳堂 · 采耳（进去了记得躺下）' : '白天歇业，晚上才开';
            if (s.bakery) return getMode() === 'day' ? '鲸麦坊 · 面包房（推门进去，能揉面）' : '打烊了，白天才开';
            if (s.post) return '鲸邮局 · 寄信 / 包裹 / 取信箱';
            if (s.flower) return '鲸花屿 · 现剪现包，抱一束回家插瓶';
            if (s.fishing) return '鲸鱼码头 · 钓鱼 / 卖鱼 / 带一条回家';
            if (s.relax) return '鲸捏捏 · 解压馆（脆皮 / 冰山泥 / 化妆品 / 木琴 / 泡泡纸 / 沙画）';
            return undefined;
          }
        });
      });
    }

    // M48：装修出来的几个能点的小东西（菜单板 / 门口的小黑猫 / 邮袋 / 红邮筒）
    if (interact) {
      interact.add({
        id: 'street-menu', label: '菜单',
        // M55：盒子缩到黑板实际外沿（板面 0.42×0.52，A 字架抬到 SW_Y 后板心 y≈0.56），
        // 以前 0.7×1.1×0.72 兜住周围一大圈，站在邮筒那边点也会被它吃掉
        box: [61.42, 0.56, 3.55, 0.4, 0.64, 0.52],
        anchor: [61.42, 1.1, 3.55],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          if (sfx && sfx.blip) sfx.blip();
          if (interact && interact.say) {
            interact.say(new THREE.Vector3(61.42, 1.3, 3.55),
              '今日手冲：莓果 / 坚果 / 可可。窗边那个位置今天空着', 4.0);
          }
        }
      });
      interact.add({
        id: 'street-shopcat', label: '小黑猫',
        box: [70.85, 0.42, 9.85, 0.45, 0.62, 0.45],
        anchor: [70.85, 1.05, 9.85],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          if (sfx && sfx.cat) sfx.cat();
          const L = ['小黑猫抬眼看你一下，又趴回去了',
            '（它尾巴尖动了一下，算是打招呼）',
            '它蹲在面包房门口，等掉出来的碎屑 —— 麦师傅默许的'];
          if (interact && interact.say) {
            interact.say(new THREE.Vector3(70.85, 1.15, 9.85), pick(L), 3.8);
          }
        },
        say: '面包房门口的小黑猫'
      });
      interact.add({
        id: 'street-postbag', label: '邮袋',
        box: [70.78, 0.42, 22.75, 0.5, 0.7, 0.5],
        anchor: [70.78, 1.0, 22.75],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          if (sfx && sfx.paper) sfx.paper();
          if (interact && interact.say) {
            interact.say(new THREE.Vector3(70.78, 1.05, 22.75),
              '阿獾的邮袋，今天有三十七封 —— 他说腰不疼，谁信呢', 4.0);
          }
        },
        say: '邮差的邮袋'
      });
      // M55：红邮筒自己的热区。以前它没有热区，准星穿过它打到后面咖啡馆的菜单板上，
      // 点邮筒会弹「菜单 点一下」；现在邮筒先被命中，说的是寄信的事。
      interact.add({
        id: 'street-mailbox', label: '红色邮筒',
        box: [61.6, 0.74, 1.6, 0.56, 1.32, 0.56],
        anchor: [61.6, 1.45, 1.6],
        when: function () { return !!isStreetNow(); },
        say: '把信从这个口投进去，阿獾每天早上来收 —— 写点什么好呢'
      });
    }

    // 街上的居民 → M50 起他们是「熟客」：各有各的店门口、会打招呼、会拜托你做事
    for (let i = 0; i < REG_SLOTS.length; i++) {
      residents[i] = makeResident(i);
      (function (idx) {
        if (!interact) return;
        const nm = (residents[idx] && residents[idx].def) ? residents[idx].def.name : '熟客';
        const h = interact.add({
          id: 'street-guest' + idx, label: nm,
          box: [0, 1.0, 0, 0.8, 1.8, 0.8],
          anchor: [0, 1.55, 0],
          when: function () { return !!isStreetNow(); },
          onClick: function () { talkRegular(idx); },
          say: function () {
            const r = residents[idx];
            if (!r || !r.def) return '街坊';
            const s = regOf(r.def.id);
            const q = REG_QUEST[r.def.id];
            let tail = '';
            if (s.q && q) tail = '（在等你帮忙）';
            else if (s.q === null && q && s.done && !s.done[q.k] && s.h >= 1) tail = '（有话想跟你说）';
            return r.def.name + '　' + heartsStr(s.h) + tail;
          },
          enabled: false
        });
        hots[idx] = h;
      })(i);
    }

    // M42：公口 + 站牌下等车的两个 + 邮差（第一班车很快就来口
    bus = buildBus();
    spawnStanders(true);
    postman = { actor: null, timer: 12 };

    if (interact) {
      busHot = interact.add({
        id: 'street-bus', label: '3路公交',
        // M55：热区比车体（宽 2.0）再宽 0.4，正面落在车板外面；车板/门板再被收成遮挡体也挡不住它
        box: [BUS_X, 1.3, BUS_STOP_Z, 2.4, 2.6, 6.0],
        anchor: [BUS_X, 2.9, BUS_STOP_Z],
        when: function () { return !!isStreetNow() && !!(bus && bus.g.visible); },
        onClick: function () {
          if (sfx && sfx.horn) sfx.horn();
          if (interact && interact.say) {
            interact.say(new THREE.Vector3(BUS_X, 3.0, bus.z), '3路车，往南门去的。车里总有一股晒过的味道', 4.2);
          }
        },
        // 台词只在 onClick 里说一次（M54：热区上再写 say 会弹两遍）
        enabled: false
      });
      postHot = interact.add({
        id: 'street-postman', label: '邮差',
        box: [0, 1.0, 0, 0.8, 1.7, 0.8],
        anchor: [0, 1.9, 0],
        when: function () { return !!isStreetNow(); },
        onClick: function () {
          const pa = postman && postman.actor;
          if (sfx && sfx.blip) sfx.blip();
          if (pa && pa.w) {
            pa.w.wave = 1.5;
            if (interact && interact.say) interact.say(new THREE.Vector3(pa.w.x, 1.9, pa.w.z), '邮差阿獾：有你们家一封信，我放邮筒里啦', 4.0);
          }
        },
        say: '邮差阿獾',
        enabled: false
      });
    }

    // 调试口 streetspawn=N 立刻来几个人
    let params = null;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    if (params) {
      const n = parseInt(params.get('streetspawn') || '0', 10);
      if (n > 0) {
        setTimeout(function () {
          for (let i = 0; i < n; i++) spawnResident();
        }, 500);
      }
      // 截图用：?plazaon=1 直接把喷泉开着（平时要点一下才开口
      if (params.has('plazaon') && plaza) plaza.on = true;
      // 截图用：?bus=1 车已经在路上口 busz=N 直接把车放到某处（给到站位置就是开门状态）
      //   再加 &bushold=1 停在开门状态不走（截图）；&bushalt=1 不让等车的人上来
      if (params.has('bus') && bus) {
        const bz = parseFloat(params.get('busz') || '');
        bus.state = 'arrive';
        bus.z = isNaN(bz) ? 6 : bz;
        bus.spd = isNaN(bz) ? 5.0 : 0.8;
        bus.g.visible = true;
        bus.g.position.set(BUS_X, 0, bus.z);
        if (!isNaN(bz) && Math.abs(bz - BUS_STOP_Z) < 0.6) {
          bus.z = BUS_STOP_Z;
          busOpen();
          if (params.has('bushold')) bus.wait = 99999;
          if (params.has('bushalt')) bus.boarded = true;
        } else if (params.has('bushold')) {
          bus.state = 'posed';
        }
      }
      // ?postman=1 邮差马上出门口 postat=N 直接站到口 N 个路点；&postwait=1 站住不动（截图）
      if (params.has('postman')) {
        const pi = parseInt(params.get('postat') || '0', 10);
        setTimeout(function () {
          startPostman();
          const a = postman && postman.actor;
          if (pi > 0 && a && a.path.length) {
            a.i = Math.min(pi, a.path.length - 1);
            a.w.x = a.path[a.i].x;
            a.w.z = a.path[a.i].z;
            if (params.has('postwait')) a.wait = 99999;
          }
        }, 300);
      }
    }

    return {
      root: root,
      setVisible: function (v) { if (root) root.visible = !!v; },
      clamp: clamp,
      addBlocker: addBlocker,
      festRect: { x0: FEST.x0, x1: FEST.x1, z0: FEST.z0, z1: FEST.z1 },
      update: update,
      spawnNorth: { x: CX, y: 1.62, z: 26.8, yaw: 0 },
      spawnFromHome: { x: CX, y: 1.62, z: 26.8, yaw: 0 },
      spawnFromStore: { x: X1 - 0.9, y: 1.62, z: DOOR_STORE.z, yaw: Math.PI / 2 },
      spawnFromPark: { x: CX, y: 1.62, z: -26.2, yaw: Math.PI },
      spawnFromCafe: { x: 61.9, y: 1.62, z: 4.92, yaw: -Math.PI / 2 },
      spawnFromEarSpa: { x: 61.9, y: 1.62, z: -6.08, yaw: -Math.PI / 2 },
      spawnFromBakery: { x: 70.15, y: 1.62, z: 10.95, yaw: -Math.PI / 2 },
      spawnFromPost: { x: 70.15, y: 1.62, z: 20.95, yaw: -Math.PI / 2 },
      spawnFromFlower: { x: 61.9, y: 1.62, z: 16.52, yaw: -Math.PI / 2 },
      spawnFromFishing: { x: 70.15, y: 1.62, z: 27.66, yaw: Math.PI / 2 },
      spawnFor: function (from) {
        if (from === 'store') return this.spawnFromStore;
        if (from === 'park') return this.spawnFromPark;
        if (from === 'cafe') return this.spawnFromCafe;
        if (from === 'earspa') return this.spawnFromEarSpa;
        if (from === 'bakery') return this.spawnFromBakery;
        if (from === 'post') return this.spawnFromPost;
        if (from === 'flower') return this.spawnFromFlower;
        if (from === 'fishing') return this.spawnFromFishing;
        return this.spawnFromHome;
      },
      // M50：熟客
      talkTo: function (i) { talkRegular(i); },
      regs: regDebug,
      scheduleNote: scheduleNote,
      // 测试用：把"现在几点"钉住（morning / noon / afternoon / night），传 null 恢复；不传 = 只查
      _regPhase: function (p) {
        if (p !== undefined) regPhaseOverride = p || null;
        return regPhase();
      },
      regHearts: function (id) { return regOf(id).h; },
      regReset: function () { regState = {}; regSave(); },
      // 测试用：直接把某人的好感设成 n（不然"每天只能 +1"要等好几天）
      _regSet: function (id, n) {
        const s = regOf(id);
        s.h = Math.max(0, Math.min(REG_HEART_MAX, n | 0));
        regSave();
        return s.h;
      },
      debug: debug
    };
  }

  /* M78：别的模块（冬夜集市）往街上加的实体，走路时一起挡 */
  const EXTRA_SOLID = [];
  function addBlocker(r) { if (r) EXTRA_SOLID.push(r); }

  function clamp(x, z, oldX, oldZ) {
    const maxX = WX1 - 0.28;
    const minZ = Z0 + 0.5, maxZ = Z1 - 0.6;
    z = Math.max(minZ, Math.min(maxZ, z));

    // 广场：z 在那一段时，西边放宽到广场口；集市：再往南那一块也一样
    const inPlazaBand = z > PLZ.z0 + 0.4 && z < PLZ.z1 - 0.4;
    const inFestBand = z <= PLZ.z0 + 0.4 && z > FEST.z0 + 0.4;
    const minX = inPlazaBand ? PLZ.x0 + 0.4 : (inFestBand ? FEST.x0 + 0.4 : WX0 + 0.28);
    x = Math.max(minX, Math.min(maxX, x));

    // 已经走进广场/集市了（x 比人行道还西）：南北也别出那一块的边
    if (x < WX0 - 0.05 && !(x > 60.42 && z <= PLZ.z0 + 0.4)) {
      if (inFestBand) {
        z = Math.max(FEST.z0 + 0.4, Math.min(PLZ.z0 + 0.4, z));
      } else {
        z = Math.max(PLZ.z0 + 0.4, Math.min(PLZ.z1 - 0.4, z));
      }
    }
    // 广场南沿的绿篱：只有东头那个缺口（x≈60.42~61.25）能下去
    if (oldZ !== undefined) {
      const line = PLZ.z0 + 0.4;
      const a = oldZ - line, b = z - line;
      if (a * b < 0 && x < 60.42) z = oldZ;
    }

    // 集市里的桌子/摊位/树：M78 由 festival.js 登记进来
    for (let i = 0; i < EXTRA_SOLID.length; i++) {
      const r = EXTRA_SOLID[i];
      if (!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
      const d2 = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
      const m = Math.min(d2[0], d2[1], d2[2], d2[3]);
      if (m === d2[0]) x = r.x0 - 0.02;
      else if (m === d2[1]) x = r.x1 + 0.02;
      else if (m === d2[2]) z = r.z0 - 0.02;
      else z = r.z1 + 0.02;
    }

    // 喷泉：圆的挡着（别走进池子里）
    const r = FOUNT_R + 0.3;
    let dx = x - PLZ_CX, dz = z - PLZ_CZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < r && dist > 0.0001) {
      x = PLZ_CX + dx / dist * r;
      z = PLZ_CZ + dz / dist * r;
    }
    // 钟楼 / 公告牌：方块挡着（左边的边收进可行走区，不然会被来回推、走起来抖）
    const SW_MINX = PLZ.x0 + 0.4;
    [[Math.max(SW_MINX, CLOCK.x - 0.85), CLOCK.z - 0.85, CLOCK.x + 0.85, CLOCK.z + 0.85],
     [Math.max(SW_MINX, BOARD.x - 0.28), BOARD.z - 1.5, BOARD.x + 0.75, BOARD.z + 1.5]].forEach(function (b) {
      if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) {
        const d2 = [x - b[0], b[2] - x, z - b[1], b[3] - z];
        const m = Math.min(d2[0], d2[1], d2[2], d2[3]);
        if (m === d2[0]) x = (b[0] <= SW_MINX + 0.001) ? b[0] + 0.02 : b[0] - 0.02;
        else if (m === d2[1]) x = b[2] + 0.02;
        else if (m === d2[2]) z = b[1] - 0.02;
        else z = b[3] + 0.02;
      }
    });

    return { x: x, z: z };
  }

  function debug() {
    const list = [];
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      if (r) list.push(r.def.id + ':' + r.phase + ':' + Math.round(r.z * 10) / 10);
    }
    return {
      mode: getMode(), n: list.length, list: list,
      bus: bus ? (bus.state + ':' + Math.round(bus.z * 10) / 10) : '-',
      crowd: crowd.length,
      post: postman && postman.actor ? ('walk:' + postman.actor.i) : ('wait:' + Math.round((postman ? postman.timer : 0) * 10) / 10),
      regs: regDebug()
    };
  }

  /* M50：熟客的状态（试玩脚本要看这个） */
  function regDebug() {
    const out = [];
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      if (!r || !r.def) continue;
      const s = regOf(r.def.id);
      out.push({
        id: r.def.id, name: r.def.name, h: s.h,
        q: s.q ? s.q.k : null,
        done: Object.keys(s.done || {}).join(','),
        present: !r.gone,
        ph: r.phaseName,
        x: Math.round(r.w.x * 100) / 100,
        z: Math.round(r.w.z * 100) / 100
      });
    }
    return out;
  }

  /* M50.1：给"刚上街"那句提示用的作息说明（谁回家了 / 谁还在） */
  function scheduleNote() {
    const away = [], here = [];
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      if (!r || !r.def) continue;
      (r.gone ? away : here).push(r.def.name);
    }
    if (!away.length) return '';
    let s = away.join('、') + ' 已经回家睡了';
    if (here.length) s += '，' + here.join('、') + ' 还在街上';
    return s;
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      update: function () {},
      spawnNorth: { x: 0, y: 1.62, z: 0, yaw: 0 },
      spawnFor: function () { return { x: 0, y: 1.62, z: 0, yaw: 0 }; },
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
