/* 小D的赛博小家 · M24 阳台
 *
 * 屋子南面伸出去的一块露台（x 0.00~3.40 / z 3.50~5.50，3.4m × 2.0m）。
 * 老房间南墙本来就是"切开"的，所以这一段补一道玻璃推拉门当室内外的界线，门开着一半。
 *
 * 四样能玩的东西（M23 设计稿里的四个"交互内核"各来一个）：
 *   洗衣机  A 计时 —— 点一下真的洗一筒（滚筒转、水声、倒计时），洗完"叮"，湿衣服进篮子
 *   晾衣绳  D 天气 —— 衣服挂上去先在风里晃；下雨/下雪忘了收会湿，点一下才能收进来
 *   躺椅    D 时间 —— 白天看云、雨天看雨、夜里看星星，小D 会自己坐上去
 *   花箱    B 生长 —— 撒种 → 浇水 → 按真实时间发芽开花 → 摘下来插进花瓶
 *
 * 阳台是露天的：下雨真的会下进来，雪也落在栏杆上（自己的一套粒子，跟窗户那套分开）。
 */
window.XD = window.XD || {};

XD.Balcony = (function () {
  'use strict';

  /* ================= 几何 ================= */
  const X0 = 0.00, X1 = 3.40;
  const Z0 = 3.50, Z1 = 5.50;
  const W = X1 - X0, D = Z1 - Z0;
  const CX = (X0 + X1) / 2;
  const GATE = { x0: 0.62, x1: 2.12 };     // 玻璃门开着的口子（走路只能从这儿进）
  const RAIL_H = 1.02;
  const DOOR_H = 2.15;
  const WASH_SEC = 14;                      // 洗一筒 14 秒
  const DRY_SEC = 16;                       // 雨停了多久能干

  /* ================= 状态 ================= */
  let scene = null, root = null, sfx = null, tip = null, interact = null;
  let rain = null, snow = null, atmos = null, life = null;
  let isStore = function () { return false; };

  let st = {                                // 这四样东西的状态（存 localStorage）
    wash: 'idle',        // idle | washing | done
    washT: 0,            // 洗到第几秒
    line: 0,             // 晾衣绳上挂着几件 0..3
    wet: false,          // 挂着的衣服是不是被淋湿了
    dryT: 0,
    plant: null          // { at: 种下的时间戳, picked: 摘过没有 }
  };
  const LS = 'xd_porch';

  let t = 0;
  let frames = {                        // 会动的小东西
    drum: null,                         // 洗衣机滚筒
    garments: [],                       // 三件挂在绳上的衣服 {g, base, ph}
    pegs: [],                           // 衣架/夹子
    strips: [],                         // 灯串灯泡
    plants: [],                         // 两箱花 {g, stems: [], heads: []}
    vaseFlowers: null,                  // 摘了花之后花瓶里的花
    orca: null,                         // 躺椅上的小D
    washerLamp: null,                   // 洗衣机面板上那颗小灯
    basket: null,                       // 洗衣篮
    basketCloth: null,                  // 篮子里的湿衣服
    light: null,                        // 壁灯
    bgMat: null, bgDay: null, bgNight: null, bgMode: ''
  };

  /* ================= 小工具 ================= */
  // 阳台在露天，直接吃太阳光 —— 所有材质统一压一档，不然整片发白（M24 第二版踩的）
  const SUN = 0.70;
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
  // 露台防腐木：横条木板 + 缝
  function deckTex() {
    return XD.Mat.tex(512, 512, function (g, Wd, Hd) {
      g.fillStyle = '#6a5540';
      g.fillRect(0, 0, Wd, Hd);
      const rows = 6, rh = Hd / rows;
      for (let i = 0; i < rows; i++) {
        const y = i * rh;
        const l = 28 + (i % 3) * 3;
        g.fillStyle = 'hsl(28, 24%, ' + l + '%)';
        g.fillRect(0, y + 2, Wd, rh - 4);
        // 木纹丝
        g.strokeStyle = 'rgba(40,28,18,.16)';
        g.lineWidth = 1;
        for (let k = 0; k < 26; k++) {
          const yy = y + 4 + Math.random() * (rh - 9);
          const xx = Math.random() * Wd;
          g.beginPath();
          g.moveTo(xx, yy);
          g.bezierCurveTo(xx + 60, yy - 2, xx + 120, yy + 2, xx + 190, yy);
          g.stroke();
        }
        // 板缝
        g.fillStyle = 'rgba(28,20,14,.55)';
        g.fillRect(0, y, Wd, 2.5);
        // 钉子
        g.fillStyle = 'rgba(90,80,70,.7)';
        g.beginPath(); g.arc(Wd * 0.14, y + rh * 0.5, 2.2, 0, 6.3); g.fill();
        g.beginPath(); g.arc(Wd * 0.86, y + rh * 0.5, 2.2, 0, 6.3); g.fill();
      }
    }, [2, 1.15]);
  }

  // 毛巾上的条纹
  function towelTex() {
    return XD.Mat.tex(128, 256, function (g, Wd, Hd) {
      g.fillStyle = '#dfd6c6';
      g.fillRect(0, 0, Wd, Hd);
      g.fillStyle = '#b8d0cf';
      for (let i = 0; i < 3; i++) g.fillRect(0, 40 + i * 78, Wd, 26);
      g.fillStyle = 'rgba(120,110,96,.18)';
      for (let x = 0; x < Wd; x += 5) g.fillRect(x, 0, 1, Hd);
    });
  }

  // 院子里的石板地
  function yardTex() {
    return XD.Mat.tex(512, 512, function (g, Wd, Hd) {
      g.fillStyle = '#6e6a5f';
      g.fillRect(0, 0, Wd, Hd);
      const n = 4, cell = Wd / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const l = 33 + ((i + j) % 3) * 3;
          g.fillStyle = 'hsl(42, 9%, ' + l + '%)';
          g.fillRect(i * cell + 3, j * cell + 3, cell - 6, cell - 6);
        }
      }
      // 缝里的杂草和斑驳
      g.fillStyle = 'rgba(96,112,74,.30)';
      for (let k = 0; k < 46; k++) {
        g.fillRect(Math.random() * Wd, Math.random() * Hd, 3 + Math.random() * 5, 2);
      }
      g.strokeStyle = 'rgba(40,38,32,.35)';
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, Hd); g.stroke();
        g.beginPath(); g.moveTo(0, i * cell); g.lineTo(Wd, i * cell); g.stroke();
      }
    }, [7, 2.2]);
  }

  // 藤编洗衣篮
  function rattanTex() {    return XD.Mat.tex(256, 256, function (g, Wd, Hd) {
      g.fillStyle = '#c3a47c';
      g.fillRect(0, 0, Wd, Hd);
      g.strokeStyle = 'rgba(120,90,58,.55)';
      g.lineWidth = 3;
      for (let y = 0; y < Hd; y += 16) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(Wd, y); g.stroke();
      }
      g.strokeStyle = 'rgba(150,116,78,.5)';
      g.lineWidth = 2;
      for (let x = 0; x < Wd; x += 14) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hd); g.stroke();
      }
    }, [3, 1]);
  }

  /* ================= 楼板 + 地面 ================= */
  function buildFloor() {
    // 楼板（侧面能看见，像一块伸出去的水泥/木台子）
    const slabMat = std(0x8d8172, 0.92);
    box(W, 0.14, D, CX, -0.07, (Z0 + Z1) / 2, slabMat);
    // 楼板下面一点阴影层（不然从侧面看是悬空的）
    box(W - 0.10, 0.42, D - 0.10, CX, -0.36, (Z0 + Z1) / 2, std(0x6f6659, 0.95));

    const deckMat = new THREE.MeshStandardMaterial({
      map: deckTex(), roughness: 0.86, metalness: 0.02
    });
    const floor = plane(W, D, deckMat, CX, 0.004, (Z0 + Z1) / 2);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    // 门槛（室内外过渡的木条）
    box(W, 0.035, 0.12, CX, 0.017, Z0 + 0.02, std(0x65452c, 0.62));

    // 阳台外面：小院子的地（不然俯视的时候阳台像悬空的）
    const yardMat = new THREE.MeshStandardMaterial({
      map: yardTex(), roughness: 0.96, metalness: 0,
      color: col(0xffffff).multiplyScalar(SUN)
    });
    const yard = plane(17, 5.0, yardMat, 1.4, -0.055, 8.1);
    yard.rotation.x = -Math.PI / 2;
    yard.receiveShadow = true;
    frames.yardMat = yardMat;
    frames.yardBase = yardMat.color.clone();
    const grassMat = std(0x5f6c4e, 0.99);
    const grass = plane(26, 9, grassMat, 1.4, -0.07, 14.2);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    frames.grassMat = grassMat;
    frames.grassBase = grassMat.color.clone();
  }

  /* ================= 玻璃推拉门（z = 3.50） =================
   * 只做门框 + 一扇玻璃，不做实心墙 —— 屋子的南面本来就是"切开"的 dollhouse 视角，
   * 补一段白墙会把屋里全挡住（M24 第一版就是这么翻车的）。 */
  function buildDoor() {
    const frameMat = std(0x4a3622, 0.6);
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xcfe4ef), roughness: 0.06, metalness: 0.05,
      transparent: true, opacity: 0.19, side: THREE.DoubleSide,
      depthWrite: false
    });

    const t2 = 0.075;
    // 两根立柱
    box(t2, DOOR_H + 0.10, 0.12, GATE.x0 - t2 / 2, (DOOR_H + 0.10) / 2, Z0 - 0.05, frameMat);
    box(t2, DOOR_H + 0.10, 0.12, GATE.x1 + t2 / 2, (DOOR_H + 0.10) / 2, Z0 - 0.05, frameMat);
    // 上横梁
    box(GATE.x1 - GATE.x0 + t2 * 2, 0.10, 0.12, (GATE.x0 + GATE.x1) / 2, DOOR_H + 0.05, Z0 - 0.05, frameMat);
    // 推拉门的轨道
    box(GATE.x1 - GATE.x0, 0.045, 0.055, (GATE.x0 + GATE.x1) / 2, DOOR_H - 0.075, Z0 - 0.02, frameMat);
    // 门槛
    box(GATE.x1 - GATE.x0 + 0.10, 0.03, 0.10, (GATE.x0 + GATE.x1) / 2, 0.015, Z0 - 0.04, frameMat);

    // 一扇玻璃（推到右边，左边留着能走出去）
    const gw = 0.78, gh = DOOR_H - 0.16;
    const gx = GATE.x1 - gw / 2 - 0.02;
    const gf = std(0xb8ab94, 0.62);
    box(gw, 0.045, 0.05, gx, gh + 0.06, Z0 - 0.035, gf);
    box(gw, 0.045, 0.05, gx, 0.06, Z0 - 0.035, gf);
    box(0.045, gh, 0.05, gx - gw / 2 + 0.022, gh / 2 + 0.06, Z0 - 0.035, gf);
    box(0.045, gh, 0.05, gx + gw / 2 - 0.022, gh / 2 + 0.06, Z0 - 0.035, gf);
    box(0.032, gh, 0.032, gx, gh / 2 + 0.06, Z0 - 0.035, gf);
    const glass = plane(gw - 0.08, gh - 0.08, glassMat, gx, gh / 2 + 0.06, Z0 - 0.035);
    void glass;
    // 拉手
    box(0.018, 0.24, 0.028, gx - gw / 2 + 0.07, 1.02, Z0 + 0.005, std(0xb8b0a4, 0.3, 0.8));

    // 另一扇门停在轨道上（叠在左边，表示推开了）
    box(0.045, gh, 0.045, GATE.x0 + 0.03, gh / 2 + 0.06, Z0 - 0.035, gf);
  }

  /* ================= 栏杆 ================= */
  function buildRail() {
    const woodMat = std(0x6b5334, 0.78);
    const woodDark = std(0x574427, 0.8);
    const capMat = std(0x7d6440, 0.6);

    function seg(len, horiz, at, mid) {
      // horiz=true：沿 x 方向的一段（东西走向）；false：沿 z 方向
      const cx = horiz ? mid : at;
      const cz = horiz ? at : mid;
      const w = horiz ? len : 0.07;
      const d = horiz ? 0.07 : len;
      // 扶手
      box(w, 0.06, d, cx, RAIL_H, cz, capMat);
      // 下横档
      box(w * 0.9, 0.05, d * 0.9, cx, 0.16, cz, woodDark);
      // 竖栏
      const n = Math.max(1, Math.round(len / 0.145));
      for (let i = 1; i < n; i++) {
        const u = -len / 2 + (len / n) * i;
        const sx = horiz ? cx + u : cx;
        const sz = horiz ? cz : cz + u;
        box(0.026, RAIL_H - 0.19, 0.026, sx, (RAIL_H - 0.19) / 2 + 0.16, sz, woodMat);
      }
    }

    // 南（正对院子） / 东 / 西 三面
    seg(X1 - X0 - 0.14, true, Z1 - 0.035, CX);
    seg(D - 0.14, false, X1 - 0.035, (Z0 + Z1) / 2);
    seg(D - 0.14, false, X0 + 0.035, (Z0 + Z1) / 2);

    // 四根角柱
    [[X0 + 0.045, Z0 + 0.05], [X1 - 0.045, Z0 + 0.05], [X0 + 0.045, Z1 - 0.045], [X1 - 0.045, Z1 - 0.045]]
      .forEach(function (p) {
        box(0.09, RAIL_H + 0.07, 0.09, p[0], (RAIL_H + 0.07) / 2, p[1], woodDark);
        ball(0.055, p[0], RAIL_H + 0.10, p[1], capMat);
      });
  }

  /* ================= 挂在栏杆上的小花盆 ================= */
  function buildHangPots() {
    const potMat = std(0x9c6b4e, 0.85);
    const soil = std(0x4a382a, 0.98);
    const leafA = std(0x5f8a52, 0.9);
    const leafB = std(0x74a063, 0.9);

    [0.62, 1.70, 2.78].forEach(function (x) {
      const g = new THREE.Group();
      g.position.set(x, 0.94, Z1 - 0.14);
      root.add(g);

      // 陶盆（挂在栏杆上，用两根小钩子）
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.076, 0.13, 14), potMat);
      pot.castShadow = true;
      pot.receiveShadow = true;
      g.add(pot);
      box(0.17, 0.022, 0.15, 0, 0.072, 0, soil, g);
      [-0.07, 0.07].forEach(function (dx) {
        box(0.012, 0.10, 0.012, dx, 0.13, -0.03, std(0x7a7f86, 0.4, 0.6), g);
      });

      // 垂下来的叶子
      for (let k = 0; k < 5; k++) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), k % 2 ? leafB : leafA);
        lf.position.set(Math.sin(k * 1.3) * 0.10, 0.01 - k * 0.052, 0.05 + (k % 3) * 0.014);
        lf.scale.set(1.0, 0.52, 0.8);
        lf.rotation.z = Math.sin(k) * 0.5;
        lf.castShadow = true;
        g.add(lf);
      }
      // 立着的叶子
      for (let k = 0; k < 3; k++) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), leafA);
        lf.position.set((k - 1) * 0.06, 0.13 + (k % 2) * 0.03, 0);
        lf.scale.set(0.9, 0.5, 0.9);
        lf.castShadow = true;
        g.add(lf);
      }
    });
  }

  /* ================= 洗衣机 ================= */
  function buildWasher() {
    const g = new THREE.Group();
    g.position.set(0.56, 0, 3.94);
    root.add(g);

    const white = std(0xdcd7cc, 0.42);
    const panel = std(0xe4dfd5, 0.5);
    const chrome = std(0xb9bcc0, 0.26, 0.75);
    const doorGlass = new THREE.MeshStandardMaterial({
      color: col(0x35414f), roughness: 0.12, metalness: 0.15,
      transparent: true, opacity: 0.72
    });

    // 机身
    box(0.62, 0.80, 0.60, 0, 0.44, 0, white, g);
    // 顶部台面
    box(0.64, 0.045, 0.62, 0, 0.862, 0, panel, g);
    // 底部
    box(0.58, 0.07, 0.56, 0, 0.035, 0, std(0x9a958c, 0.7), g);
    // 前面板（朝 +z 那面，也就是朝门/南）
    box(0.56, 0.70, 0.02, 0, 0.46, 0.302, std(0xece7dd, 0.55), g);

    // 圆形舱门
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.024, 10, 30), chrome);
    ring.position.set(0, 0.44, 0.318);
    ring.castShadow = true;
    g.add(ring);
    const doorDisc = new THREE.Mesh(new THREE.CircleGeometry(0.176, 30), doorGlass);
    doorDisc.position.set(0, 0.44, 0.320);
    g.add(doorDisc);

    // 滚筒里的东西（转起来才看得出在洗）
    const drum = new THREE.Group();
    drum.position.set(0, 0.44, 0.300);
    g.add(drum);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.165, 26), std(0x5b6673, 0.5, 0.25));
    inner.position.z = -0.004;
    drum.add(inner);
    const cloths = [[-0.070, 0.045, 0xe0cbb4], [0.062, -0.052, 0xbdd0dc], [0.020, 0.082, 0xdcc3cc]];
    cloths.forEach(function (c) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), std(c[2], 0.92));
      m.position.set(c[0], c[1], 0.012);
      m.scale.set(1.25, 0.82, 0.55);
      drum.add(m);
    });

    // 顶部面板：旋钮 + 三颗按钮 + 一盏小灯
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 18), chrome);
    knob.position.set(-0.19, 0.90, 0.10);
    g.add(knob);
    box(0.05, 0.006, 0.012, -0.19, 0.917, 0.10, std(0x6b7178, 0.5), g);   // 旋钮上的指针
    [0.02, 0.075, 0.13].forEach(function (dx, i) {
      box(0.045, 0.016, 0.028, dx, 0.9, 0.06, std(i === 2 ? 0x7f8a94 : 0xcfc8bc, 0.6), g);
    });
    const lampMat = new THREE.MeshBasicMaterial({ color: col(0x33403c) });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), lampMat);
    lamp.position.set(0.2, 0.9, 0.05);
    g.add(lamp);
    frames.washerLamp = lampMat;

    // 洗涤剂瓶子（有点生活气）
    box(0.055, 0.13, 0.04, 0.22, 0.90, -0.16, std(0x8fb7c9, 0.6), g);
    box(0.022, 0.045, 0.022, 0.22, 0.98, -0.16, std(0x6d94a6, 0.6), g);

    frames.drum = drum;
  }

  /* ================= 洗衣篮 ================= */
  function buildBasket() {
    const g = new THREE.Group();
    g.position.set(1.24, 0, 4.62);
    root.add(g);
    const rattan = new THREE.MeshStandardMaterial({ map: rattanTex(), roughness: 0.88 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.19, 0.34, 18, 1, true), rattan);
    body.position.y = 0.17;
    body.castShadow = true;
    body.receiveShadow = true;
    body.material.side = THREE.DoubleSide;
    g.add(body);
    // 底
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.19, 18), rattan);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.005;
    g.add(bottom);
    // 口沿
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.232, 0.018, 8, 20), std(0xa88458, 0.8));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.34;
    g.add(rim);

    // 篮子里那团洗好的湿衣服（洗完才出现）
    const cloth = new THREE.Group();
    cloth.position.y = 0.24;
    [[-0.06, 0.04, 0xd9c6b0], [0.07, -0.03, 0xb9ccd8], [0.0, 0.09, 0xdcc2ca]]
      .forEach(function (c) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), std(c[2], 0.94));
        m.position.set(c[0], c[1], 0);
        m.scale.set(1.2, 0.7, 1.0);
        m.castShadow = true;
        cloth.add(m);
      });
    cloth.visible = false;
    g.add(cloth);
    frames.basketCloth = cloth;
    frames.basket = g;
  }

  /* ================= 晾衣绳 + 三件衣服 ================= */
  function garment(kind, hex) {
    const g = new THREE.Group();
    const mat = std(hex, 0.95);
    const dark = std(0x5e5145, 0.9);

    if (kind === 'tee') {
      box(0.30, 0.34, 0.020, 0, -0.20, 0, mat, g);
      // 两只袖子
      const l = box(0.11, 0.15, 0.018, -0.185, -0.11, 0, mat, g);
      l.rotation.z = 0.62;
      const r = box(0.11, 0.15, 0.018, 0.185, -0.11, 0, mat, g);
      r.rotation.z = -0.62;
      // 领口
      const neck = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 14), dark);
      neck.position.set(0, -0.035, 0.006);
      g.add(neck);
    } else if (kind === 'towel') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.44, 0.014),
        new THREE.MeshStandardMaterial({ map: towelTex(), roughness: 0.95 }));
      m.position.set(0, -0.24, 0);
      m.castShadow = true;
      g.add(m);
    } else {
      // 两只袜子
      [-0.055, 0.055].forEach(function (dx) {
        box(0.062, 0.22, 0.013, dx, -0.13, 0, mat, g);
        const foot = box(0.115, 0.055, 0.013, dx + 0.026, -0.235, 0, mat, g);
        foot.rotation.z = 0.06;
      });
    }

    // 衣架（木头的）
    const hangerMat = std(0xc9a878, 0.6);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.30, 8), hangerMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0, 0);
    g.add(bar);
    [-0.15, 0.15].forEach(function (dx) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.10, 6), hangerMat);
      arm.position.set(dx * 0.92, 0.035, 0);
      arm.rotation.z = dx > 0 ? -0.75 : 0.75;
      g.add(arm);
    });
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12, Math.PI * 1.5), hangerMat);
    hook.position.set(0, 0.085, 0);
    hook.rotation.z = Math.PI * 0.5;
    g.add(hook);

    return g;
  }

  function buildLine() {
    const poleMat = std(0x8a7050, 0.72);
    const ropeMat = std(0xd9d2c4, 0.85);

    // 两根杆
    [0.30, 3.10].forEach(function (x) {
      cyl(0.028, 0.032, 1.95, 10, x, 0.975, 5.28, poleMat);
      // 杆底的配重座
      box(0.14, 0.05, 0.14, x, 0.025, 5.28, std(0x6f6050, 0.85));
      ball(0.036, x, 1.96, 5.28, poleMat);
    });

    // 绳子（微微下垂，用三段拼）
    const y0 = 1.885, sag = 0.075;
    const pts = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push(new THREE.Vector3(0.30 + u * 2.80, y0 - Math.sin(u * Math.PI) * sag, 5.28));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.007, 5, false), ropeMat);
    tube.castShadow = true;
    root.add(tube);

    // 三件衣服挂在绳上（一开始没挂，都藏着）
    const defs = [
      { kind: 'tee', hex: 0xe6c6bc, x: 0.92, ph: 0.0 },
      { kind: 'towel', hex: 0xffffff, x: 1.72, ph: 1.4 },
      { kind: 'socks', hex: 0xb9cbd6, x: 2.52, ph: 2.7 }
    ];
    defs.forEach(function (d) {
      const g = garment(d.kind, d.hex);
      g.position.set(d.x, y0 - 0.07, 5.275);
      g.visible = false;
      root.add(g);
      frames.garments.push({ g: g, base: y0 - 0.07, ph: d.ph });
    });
  }

  /* ================= 躺椅（一张晒太阳的躺床） ================= */
  function buildChair() {
    const g = new THREE.Group();
    g.position.set(2.66, 0, 4.62);
    root.add(g);   // 头枕在北边，脚朝南 —— 躺着看院子

    const wood = std(0x6b5334, 0.7);
    const cloth = std(0x9aa894, 0.95);
    const cloth2 = std(0xbfc7b4, 0.96);

    // 两条侧梁
    [-0.34, 0.34].forEach(function (dx) {
      box(0.05, 0.06, 1.46, dx, 0.40, 0, wood, g);
    });
    // 四条腿
    [[-0.32, 0.62], [0.32, 0.62], [-0.32, -0.58], [0.32, -0.58]].forEach(function (p) {
      box(0.05, 0.40, 0.05, p[0], 0.20, p[1], wood, g);
    });
    // 腿之间的横撑
    box(0.66, 0.04, 0.04, 0, 0.14, 0.62, wood, g);
    box(0.66, 0.04, 0.04, 0, 0.14, -0.58, wood, g);

    // 床面布：五段，中间微微陷下去
    for (let i = 0; i < 5; i++) {
      const z = 0.60 - i * 0.30;
      const sag = Math.sin((i / 4) * Math.PI) * 0.032;
      box(0.64, 0.055, 0.305, 0, 0.437 - sag, z, cloth, g);
    }

    // 头枕那段（抬起来 30°）
    const head = new THREE.Group();
    head.position.set(0, 0.437, -0.62);
    head.rotation.x = 0.52;
    g.add(head);
    box(0.64, 0.055, 0.42, 0, 0, -0.21, cloth, head);
    const pil = box(0.44, 0.095, 0.26, 0, 0.072, -0.30, cloth2, head);
    pil.rotation.x = -0.16;
    // 头枕那段的侧梁也跟着抬
    [-0.34, 0.34].forEach(function (dx) {
      box(0.05, 0.06, 0.44, dx, -0.04, -0.21, wood, head);
    });

    // 搭在扶手上的一条薄毛巾
    const towel = box(0.30, 0.03, 0.42, -0.30, 0.465, 0.18, std(0xdfd6c6, 0.96), g);
    towel.rotation.z = 0.02;

    frames.chair = g;
  }

  /* ================= 花箱 ×2 ================= */
  function buildPlanters() {
    const woodMat = std(0x6b5334, 0.78);
    const soil = std(0x4a382a, 0.98);
    const stemMat = std(0x6f9a5c, 0.85);
    const leafMat = std(0x7fae66, 0.85);
    const petalMat = std(0xf2c6d2, 0.9);
    const petalMat2 = std(0xf7e6b8, 0.9);
    const centerMat = std(0xe8c25e, 0.85);

    [[0.50, 5.02], [1.28, 5.02]].forEach(function (p, pi) {
      const g = new THREE.Group();
      g.position.set(p[0], 0, p[1]);
      root.add(g);

      // 箱体（四条板 + 底，敞口）
      box(0.60, 0.030, 0.30, 0, 0.015, 0, woodMat, g);
      box(0.60, 0.28, 0.030, 0, 0.15, 0.135, woodMat, g);
      box(0.60, 0.28, 0.030, 0, 0.15, -0.135, woodMat, g);
      box(0.030, 0.28, 0.30, -0.285, 0.15, 0, woodMat, g);
      box(0.030, 0.28, 0.30, 0.285, 0.15, 0, woodMat, g);
      // 土
      box(0.55, 0.04, 0.25, 0, 0.265, 0, soil, g);

      // 三株（茎 + 叶 + 花头），生长阶段用 scale 表现
      const grow = new THREE.Group();
      grow.position.y = 0.275;
      g.add(grow);

      const stems = [], heads = [], leaves = [];
      [-0.17, 0.0, 0.17].forEach(function (dx, i) {
        const h = 0.30 + i * 0.05;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, h, 6), stemMat);
        stem.position.set(dx, h / 2, (i - 1) * 0.03);
        stem.userData.h = h;
        stem.castShadow = true;
        grow.add(stem);
        stems.push(stem);

        // 叶子（两片）
        [-1, 1].forEach(function (s) {
          const lf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), leafMat);
          lf.position.set(dx + s * 0.045, h * 0.45, (i - 1) * 0.03);
          lf.scale.set(1.1, 0.35, 0.7);
          lf.castShadow = true;
          grow.add(lf);
          leaves.push(lf);
        });

        // 花头（五瓣）
        const head = new THREE.Group();
        head.position.set(dx, h + 0.01, (i - 1) * 0.03);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const pt = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), i === 1 ? petalMat2 : petalMat);
          pt.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0);
          pt.scale.set(1, 1, 0.55);
          pt.castShadow = true;
          head.add(pt);
        }
        const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), centerMat);
        ctr.position.z = 0.014;
        head.add(ctr);
        grow.add(head);
        heads.push(head);
      });

      frames.plants.push({ g: g, grow: grow, stems: stems, heads: heads, leaves: leaves, base: 1 });
    });
  }

  /* ================= 花瓶（摘了花才出现） ================= */
  function buildVase() {
    const g = new THREE.Group();
    g.position.set(0.56, 0.884, 3.70);     // 放在洗衣机台面上
    root.add(g);

    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xd6e6ea), roughness: 0.1, metalness: 0.05,
      transparent: true, opacity: 0.42
    });
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.13, 14), glassMat);
    vase.position.y = 0.065;
    g.add(vase);
    // 水
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.030, 0.07, 14),
      new THREE.MeshStandardMaterial({ color: col(0xa9cfd8), roughness: 0.15, transparent: true, opacity: 0.6 }));
    water.position.y = 0.045;
    g.add(water);

    // 花（默认藏着）
    const flowers = new THREE.Group();
    flowers.position.y = 0.11;
    const stemMat = std(0x6f9a5c, 0.85);
    [-0.03, 0.0, 0.032].forEach(function (dx, i) {
      const h = 0.16 + i * 0.04;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, h, 5), stemMat);
      s.position.set(dx, h / 2, 0);
      flowers.add(s);
      const hd = new THREE.Group();
      hd.position.set(dx, h, 0);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const pt = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 5),
          i === 1 ? std(0xf7e6b8, 0.9) : std(0xf2c6d2, 0.9));
        pt.position.set(Math.cos(a) * 0.030, Math.sin(a) * 0.030, 0);
        pt.scale.set(1, 1, 0.6);
        hd.add(pt);
      }
      flowers.add(hd);
    });
    flowers.visible = false;
    g.add(flowers);
    frames.vaseFlowers = flowers;
  }

  /* ================= 灯：栏杆角柱上的两个小灯笼 + 灯串 ================= */
  function buildLights() {
    const metal = std(0x4a4038, 0.5, 0.3);
    const glowMat = new THREE.MeshBasicMaterial({ color: col(0xffe4b0) });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: col(0xf0dcb4), roughness: 0.8, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide
    });

    // 南面两个角柱上各挂一盏小灯笼（阳台上自己亮的那种）
    const lanterns = [
      { x: X0 + 0.045, z: Z1 - 0.045 },
      { x: X1 - 0.045, z: Z1 - 0.045 }
    ];
    frames.lanternGlow = [];
    frames.lights = [];
    lanterns.forEach(function (p) {
      const y = RAIL_H + 0.30;
      // 挂钩
      box(0.03, 0.14, 0.03, p.x, y - 0.07, p.z, metal);
      // 灯罩（六棱柱）
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.15, 6, 1, true), shadeMat);
      shade.position.set(p.x, y - 0.20, p.z);
      root.add(shade);
      // 顶盖 / 底盖
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.086, 0.032, 6), metal);
      cap.position.set(p.x, y - 0.115, p.z);
      root.add(cap);
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.05, 0.028, 6), metal);
      bot.position.set(p.x, y - 0.288, p.z);
      root.add(bot);
      // 里面的小灯
      const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), glowMat.clone());
      g2.position.set(p.x, y - 0.20, p.z);
      root.add(g2);
      frames.lanternGlow.push(g2);
      // 光
      const pl = new THREE.PointLight(0xffcf96, 0.85, 4.6, 2);
      pl.position.set(p.x, y - 0.20, p.z);
      pl.userData.base = 0.85;
      root.add(pl);
      frames.lights.push(pl);
    });

    // 灯串：沿南栏杆上方一条 + 门框上方一条
    const bulbWarm = new THREE.MeshBasicMaterial({ color: col(0xffdca0) });
    function strand(x0, z0, x1, z1, y, n) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push(new THREE.Vector3(x0 + (x1 - x0) * u, y - Math.sin(u * Math.PI) * 0.10, z0 + (z1 - z0) * u));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(40));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col(0x6b5c4c) }));
      root.add(line);
      for (let i = 1; i < n; i++) {
        const u = i / n;
        const yy = y - Math.sin(u * Math.PI) * 0.10;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), bulbWarm.clone());
        m.position.set(x0 + (x1 - x0) * u, yy - 0.022, z0 + (z1 - z0) * u);
        m.userData.ph = u * 6.0;
        root.add(m);
        frames.strips.push(m);
      }
    }
    strand(0.24, Z1 - 0.07, 3.16, Z1 - 0.07, 2.05, 9);
    strand(0.32, Z0 + 0.14, 3.08, Z0 + 0.14, 2.32, 8);
  }

  /* ================= 外面的景（阳台看出去） ================= */
  function buildView() {
    const dayTex = XD.Mat.cityDay();
    const nightTex = XD.Mat.cityNight();
    frames.bgDay = dayTex;
    frames.bgNight = nightTex;
    const mat = new THREE.MeshBasicMaterial({ map: nightTex, fog: false });
    frames.bgMat = mat;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(38, 19), mat);
    p.position.set(CX, 5.0, 18.0);
    p.rotation.y = Math.PI;    // 朝北，面向阳台
    root.add(p);
  }

  /* ================= 雨 / 雪（阳台是露天的） ================= */
  function buildWeather() {
    // 雨：一条一条的细线
    const N = 320;
    const pos = new Float32Array(N * 6);
    const seed = [];
    for (let i = 0; i < N; i++) {
      const x = X0 + Math.random() * W;
      const z = Z0 + Math.random() * D;
      const y = 0.15 + Math.random() * 2.5;
      const len = 0.09 + Math.random() * 0.10;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
      seed.push({ x: x, z: z, y: y, len: len, sp: 5.4 + Math.random() * 2.6 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: col(0xc4dcee), transparent: true, opacity: 0.42, fog: false
    });
    const rainMesh = new THREE.LineSegments(g, rainMat);
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    root.add(rainMesh);

    // 雪：小圆点
    const S = 220;
    const spos = new Float32Array(S * 3);
    const sseed = [];
    for (let i = 0; i < S; i++) {
      const x = X0 + Math.random() * W;
      const z = Z0 + Math.random() * D;
      const y = Math.random() * 2.9;
      spos[i * 3] = x; spos[i * 3 + 1] = y; spos[i * 3 + 2] = z;
      sseed.push({ x: x, z: z, y: y, sp: 0.34 + Math.random() * 0.45, ph: Math.random() * 6.3 });
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const snowMat = new THREE.PointsMaterial({
      color: col(0xffffff), size: 0.048, sizeAttenuation: true,
      transparent: true, opacity: 0.88, fog: false
    });
    const snowMesh = new THREE.Points(sg, snowMat);
    snowMesh.frustumCulled = false;
    snowMesh.visible = false;
    root.add(snowMesh);

    frames.rainMesh = rainMesh;
    frames.rainSeed = seed;
    frames.rainPos = pos;
    frames.rainGeo = g;
    frames.snowMesh = snowMesh;
    frames.snowSeed = sseed;
    frames.snowPos = spos;
    frames.snowGeo = sg;

    // 栏杆顶上落的雪 + 地上一圈（下雪时才出现）
    const capMat = new THREE.MeshStandardMaterial({ color: col(0xf4f7fb), roughness: 0.9 });
    const caps = new THREE.Group();
    box(X1 - X0 - 0.10, 0.035, 0.085, CX, RAIL_H + 0.055, Z1 - 0.035, capMat, caps);
    box(0.085, 0.035, D - 0.10, X1 - 0.035, RAIL_H + 0.055, (Z0 + Z1) / 2, capMat, caps);
    box(0.085, 0.035, D - 0.10, X0 + 0.035, RAIL_H + 0.055, (Z0 + Z1) / 2, capMat, caps);
    caps.visible = false;
    root.add(caps);
    frames.snowCaps = caps;
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
      if (o.wash === 'done' || o.wash === 'washing') st.wash = o.wash === 'washing' ? 'done' : o.wash;
      if (typeof o.line === 'number') st.line = Math.max(0, Math.min(3, o.line));
      st.wet = !!o.wet;
      if (o.plant && typeof o.plant.at === 'number') st.plant = o.plant;
    } catch (e) {}
  }

  /* ================= 花箱生长（B 内核） ================= */
  const HOUR = 3600 * 1000;
  function plantStage() {
    if (!st.plant) return 0;                       // 没种
    if (st.plant.picked) return 4;                 // 摘过了，只剩茎
    const age = (Date.now() - st.plant.at) / HOUR;
    if (age < 1.2) return 1;                       // 刚发芽
    if (age < 5) return 2;                         // 长苗
    return 3;                                      // 开花
  }
  function applyPlant() {
    const s = plantStage();
    frames.plants.forEach(function (p) {
      // 阶段 → 缩放：0 空土 / 1 小芽 / 2 半高 / 3 全高开花 / 4 摘过（只留茎叶）
      const sc = s === 0 ? 0 : s === 1 ? 0.28 : s === 2 ? 0.62 : 1.0;
      p.grow.scale.set(sc, sc, sc);
      p.grow.visible = s > 0;
      const showHead = (s === 3);
      p.heads.forEach(function (h) { h.visible = showHead; });
      // 摘过之后只剩下半截茎
      p.stems.forEach(function (sm) {
        const h = sm.userData.h || 0.3;
        sm.scale.y = (s === 4) ? 0.55 : 1;
        sm.position.y = h * sm.scale.y / 2;
      });
    });
    if (frames.vaseFlowers) frames.vaseFlowers.visible = (s === 4);
  }

  /* ================= 洗衣机（A 内核） ================= */
  function washStart() {
    st.wash = 'washing';
    st.washT = 0;
    save();
    if (sfx) {
      try { sfx.waterOn('wash', 0.34, 1.0, { x: 0.56, y: 0.5, z: 3.94 }); } catch (e) {}
      try { sfx.bubble(); } catch (e) {}
    }
  }
  function washDone() {
    st.wash = 'done';
    save();
    if (sfx) {
      try { sfx.waterOff('wash'); } catch (e) {}
      try { sfx.ding({ x: 0.56, y: 0.9, z: 3.94 }); } catch (e) {}
    }
    if (frames.basketCloth) frames.basketCloth.visible = true;
    if (tip) tip('叮 —— 洗好啦！湿衣服在篮子里，去晾起来吧 🧺', 4200);
    if (life && life.log) life.log('洗了一筒衣服');
  }
  function hangAll() {
    st.line = 3;
    st.wet = false;
    st.dryT = 0;
    save();
    frames.garments.forEach(function (g) { g.g.visible = true; });
    if (frames.basketCloth) frames.basketCloth.visible = false;
    if (sfx) { try { sfx.pickup(); } catch (e) {} }
    if (life && life.log) life.log('把衣服晾出去了');
  }
  function takeIn() {
    st.line = 0;
    st.wet = false;
    st.dryT = 0;
    save();
    frames.garments.forEach(function (g) { g.g.visible = false; });
    if (sfx) { try { sfx.pickup(); } catch (e) {} }
  }

  /* ================= 躺椅（D 内核：时间 / 天气） ================= */
  function chairLine() {
    const d = new Date();
    const h = d.getHours();
    const raining = !!(rain && rain.isOn());
    const snowing = !!(snow && snow.isOn());
    if (snowing) return '下雪了。雪落在栏杆上，一层一层积起来，看着就安静';
    if (raining) return '下雨天最适合坐这儿。雨点打在栏杆上，"嗒、嗒"的，很催眠';
    if (h >= 19 || h < 6) return '晚上的风是凉的。抬头能看见几颗星星，不太多，但够看';
    if (h >= 6 && h < 11) return '早上的太阳还不晒，坐这儿喝点东西刚好';
    if (h >= 16 && h < 19) return '快到傍晚了，云是橘色的，跑得很快';
    return '今天云跑得很快。躺一会儿吧，什么都不用想';
  }
  function sitOrStand() {
    st.sitting = !st.sitting;
    if (frames.orca) frames.orca.visible = st.sitting;
    if (sfx) { try { sfx.pop(); } catch (e) {} }
    return st.sitting ? chairLine() : '起来啦，腰有点酸';
  }

  /* ================= 可点的地方 ================= */
  function register() {
    if (!interact || !interact.add) return;
    const home = function () { return !isStore(); };

    interact.add({
      id: 'porch-washer', label: '洗衣机',
      box: [0.56, 0.46, 3.94, 0.72, 1.00, 0.70],
      anchor: [0.60, 1.10, 3.94],
      when: home,
      onClick: function () {
        if (st.wash === 'washing') {
          const left = Math.max(0, Math.ceil(WASH_SEC - st.washT));
          this._say = '还在洗呢，还有 ' + left + ' 秒';
          return;
        }
        if (st.wash === 'done') {
          this._say = '洗好了，衣服在篮子里 —— 点晾衣绳把它们挂起来';
          return;
        }
        washStart();
        this._say = '把攒了三天的衣服丢进去了。转起来要 ' + WASH_SEC + ' 秒，等等';
      },
      say: function (h) { return h._say || '洗衣机'; }
    });

    interact.add({
      id: 'porch-line', label: '晾衣绳',
      box: [1.72, 1.62, 5.28, 3.00, 1.00, 0.30],
      anchor: [1.72, 1.80, 5.24],
      when: home,
      onClick: function () {
        if (st.line > 0) {
          if (st.wet) {
            this._say = '还是湿的…刚被雨淋了，再晾一会儿吧';
            return;
          }
          takeIn();
          this._say = '收进来啦，叠好放进柜子。明天穿这件';
          return;
        }
        if (st.wash !== 'done') {
          this._say = '绳子空着呢。先去洗一筒吧';
          return;
        }
        hangAll();
        this._say = '挂好啦！风一吹它们就在那儿晃';
      },
      say: function (h) { return h._say || '晾衣绳'; }
    });

    interact.add({
      id: 'porch-chair', label: '躺椅',
      box: [2.66, 0.42, 4.66, 0.82, 0.80, 1.10],
      anchor: [2.60, 1.06, 4.66],
      when: home,
      onClick: function () {
        this._say = sitOrStand();
      },
      say: function (h) { return h._say || '坐会儿'; }
    });

    interact.add({
      id: 'porch-planter', label: '花箱',
      box: [0.89, 0.22, 5.02, 1.48, 0.56, 0.40],
      anchor: [0.89, 0.62, 5.00],
      when: home,
      onClick: function () {
        const s = plantStage();
        if (s === 0) {
          st.plant = { at: Date.now(), picked: false };
          save();
          applyPlant();
          if (sfx) { try { sfx.pour({ x: 0.89, y: 0.4, z: 5.02 }); } catch (e) {} }
          this._say = '撒了种子，浇了点水。过一阵子就发芽了 —— 你下次来看';
          if (life && life.log) life.log('在阳台花箱里撒了种子');
          return;
        }
        if (s === 1) { this._say = '刚冒出小芽，别碰它，再长两天'; return; }
        if (s === 2) { this._say = '长苗了，叶子是嫩绿的。再过几小时就该开花了'; return; }
        if (s === 3) {
          st.plant.picked = true;
          save();
          applyPlant();
          if (sfx) { try { sfx.pickup(); } catch (e) {} }
          this._say = '开花了！剪三枝插进花瓶，剩下的还留在阳台上';
          if (life && life.log) life.log('把阳台开的花剪了几枝插瓶');
          return;
        }
        // 摘过了
        st.plant = null;
        save();
        applyPlant();
        this._say = '花都剪了，土空出来。想再种就说一声';
      },
      say: function (h) { return h._say || '花箱'; }
    });

    interact.add({
      id: 'porch-basket', label: '洗衣篮',
      box: [1.24, 0.20, 4.62, 0.54, 0.44, 0.54],
      anchor: [1.24, 0.52, 4.62],
      when: home,
      onClick: function () {
        if (st.wash === 'done') this._say = '篮子里是刚洗好的湿衣服，拿去晾吧';
        else if (st.line > 0) this._say = '篮子空了，衣服都在绳上';
        else this._say = '空篮子。攒着吧，攒够一筒一起洗';
      },
      say: function (h) { return h._say || '洗衣篮'; }
    });
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!root) return;
    t += dt;

    /* --- 洗衣机 --- */
    if (st.wash === 'washing') {
      st.washT += dt;
      if (frames.drum) frames.drum.rotation.z -= dt * 7.4;
      // 滚筒里的衣服顺着转
      if (frames.drum) {
        frames.drum.children.forEach(function (c, i) {
          if (i === 0) return;
          c.position.y += Math.sin(st.washT * 5 + i) * dt * 0.06;
        });
      }
      if (frames.washerLamp) {
        const on = (Math.floor(st.washT * 2.2) % 2) === 0;
        frames.washerLamp.color.copy(col(on ? 0x9fe0b4 : 0x33403c));
      }
      // 洗到一半冒一下泡
      if (sfx && st.washT > 4 && st.washT < 4.2) { try { sfx.bubble(); } catch (e) {} }
      if (st.washT >= WASH_SEC) washDone();
    } else if (frames.drum) {
      frames.drum.rotation.z *= (1 - Math.min(1, dt * 4));
      if (frames.washerLamp && st.wash === 'done') frames.washerLamp.color.copy(col(0x9fe0b4));
      else if (frames.washerLamp) frames.washerLamp.color.copy(col(0x334033));
    }

    /* --- 挂着的衣服：风里晃 --- */
    if (st.line > 0) {
      frames.garments.forEach(function (o) {
        if (!o.g.visible) return;
        o.g.rotation.z = Math.sin(t * 1.35 + o.ph) * 0.075;
        o.g.rotation.x = Math.sin(t * 0.92 + o.ph * 1.7) * 0.05;
      });
    }

    /* --- 天气：下雨/下雪让衣服湿 --- */
    const raining = !!(rain && rain.isOn());
    const snowing = !!(snow && snow.isOn());
    const bad = raining || snowing;
    if (bad && st.line > 0 && !st.wet) {
      st.wet = true;
      st.dryT = 0;
      save();
      if (tip) tip((raining ? '下雨了' : '下雪了') + '！阳台上的衣服还晾着 —— 点一下晾衣绳收进来', 4600);
      if (life && life.log) life.log((raining ? '下雨了，' : '下雪了，') + '阳台上的衣服忘了收');
    }
    if (!bad && st.wet && st.line > 0) {
      st.dryT += dt;
      if (st.dryT > DRY_SEC) {
        st.wet = false;
        st.dryT = 0;
        save();
        if (tip) tip('衣服晾干了', 2400);
      }
    }
    // 湿衣服颜色压暗一点
    frames.garments.forEach(function (o) {
      if (!o.g.visible) return;
      o.g.traverse(function (n) {
        if (n.material && n.material.color && n.userData.orig === undefined) {
          n.userData.orig = n.material.color.clone();
        }
        if (n.material && n.material.color && n.userData.orig) {
          const k = st.wet ? 0.72 : 1.0;
          n.material.color.copy(n.userData.orig).multiplyScalar(k);
        }
      });
    });

    /* --- 雨 / 雪 粒子 --- */
    if (frames.rainMesh) {
      frames.rainMesh.visible = raining && !isStore();
      if (frames.rainMesh.visible) {
        const pos = frames.rainPos;
        for (let i = 0; i < frames.rainSeed.length; i++) {
          const s = frames.rainSeed[i];
          s.y -= s.sp * dt;
          if (s.y < 0.06) { s.y = 2.65 + Math.random() * 0.35; s.x = X0 + Math.random() * W; s.z = Z0 + Math.random() * D; }
          pos[i * 6] = s.x; pos[i * 6 + 1] = s.y; pos[i * 6 + 2] = s.z;
          pos[i * 6 + 3] = s.x; pos[i * 6 + 4] = s.y - s.len; pos[i * 6 + 5] = s.z;
        }
        frames.rainGeo.attributes.position.needsUpdate = true;
      }
    }
    if (frames.snowMesh) {
      frames.snowMesh.visible = snowing && !isStore();
      if (frames.snowMesh.visible) {
        const pos = frames.snowPos;
        for (let i = 0; i < frames.snowSeed.length; i++) {
          const s = frames.snowSeed[i];
          s.y -= s.sp * dt;
          if (s.y < 0.04) { s.y = 2.85 + Math.random() * 0.3; s.x = X0 + Math.random() * W; s.z = Z0 + Math.random() * D; }
          pos[i * 3] = s.x + Math.sin(t * 0.8 + s.ph) * 0.10;
          pos[i * 3 + 1] = s.y;
          pos[i * 3 + 2] = s.z;
        }
        frames.snowGeo.attributes.position.needsUpdate = true;
      }
    }
    if (frames.snowCaps) frames.snowCaps.visible = snowing && !isStore();

    /* --- 灯串呼吸 + 灯笼跟昼夜 --- */
    const day = atmos && atmos.getMode && atmos.getMode() === 'day';
    const lf = day ? 0.10 : 1.0;
    (frames.lights || []).forEach(function (l) {
      l.intensity = (l.userData.base || 0.85) * lf;
    });
    (frames.lanternGlow || []).forEach(function (gl) {
      gl.material.color.copy(col(0xffe4b0)).multiplyScalar(0.30 + 0.80 * lf);
    });
    frames.strips.forEach(function (m) {
      const k = 0.55 + 0.45 * Math.sin(t * 1.7 + m.userData.ph);
      m.material.color.copy(col(0xffdca0)).multiplyScalar(lf * (0.5 + k * 0.5));
    });
    // 院子 / 草地晚上要暗下去（不然夜里下半屏一片浅灰，很跳）
    if (frames.yardMat) frames.yardMat.color.copy(frames.yardBase).multiplyScalar(day ? 1 : 0.34);
    if (frames.grassMat) frames.grassMat.color.copy(frames.grassBase).multiplyScalar(day ? 1 : 0.30);

    /* --- 外面的景：白天/晚上换一张 --- */
    if (frames.bgMat) {
      const want = day ? 'day' : 'night';
      if (frames.bgMode !== want) {
        frames.bgMode = want;
        frames.bgMat.map = day ? frames.bgDay : frames.bgNight;
        frames.bgMat.needsUpdate = true;
      }
    }

    /* --- 躺椅上的小D：轻轻晃 --- */
    if (frames.orca && frames.orca.visible) {
      frames.orca.position.y = frames.orcaBase + Math.sin(t * 1.4) * 0.012;
      frames.orca.rotation.z = Math.sin(t * 0.9) * 0.03;
    }

    /* --- 花箱：按真实时间推进 --- */
    if (!frames._plantTick || t - frames._plantTick > 4) {
      frames._plantTick = t;
      const s = plantStage();
      if (frames._plantShown !== s) {
        frames._plantShown = s;
        applyPlant();
      }
    }
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    interact = o.interact || null;
    rain = o.rain || null;
    snow = o.snow || null;
    atmos = o.atmos || null;
    life = o.life || null;
    isStore = o.isStore || isStore;
    if (!scene) return null;

    root = new THREE.Group();
    root.name = 'porch-m24';
    scene.add(root);

    load();

    buildFloor();
    buildDoor();
    buildRail();
    buildHangPots();
    buildWasher();
    buildBasket();
    buildLine();
    buildChair();
    buildPlanters();
    buildVase();
    buildLights();
    buildView();
    buildWeather();

    // 躺椅上的小D（先藏起来）
    try {
      if (XD.Workspace && XD.Workspace.miniOrca) {
        const m = XD.Workspace.miniOrca(0.42);
        m.position.set(2.66, 0.70, 4.80);
        m.rotation.y = Math.PI * 0.96;      // 躺着，朝南（+z）
        m.rotation.x = -0.22;
        m.visible = false;
        root.add(m);
        frames.orca = m;
        frames.orcaBase = 0.70;
      }
    } catch (e) { /* 没有 miniOrca 也不影响阳台 */ }

    // 状态还原
    if (st.wash === 'done' && frames.basketCloth) frames.basketCloth.visible = true;
    if (st.line > 0) frames.garments.forEach(function (g) { g.g.visible = true; });
    frames._plantShown = -1;
    applyPlant();

    register();

    // 算一下走路的额外区域（main 会把它交给 wing.clamp）——
    // 南面没有墙，所以阳台和屋里是直接连通的（z 3.20 和家的 3.28 咬在一起）
    const area = { x0: X0 + 0.16, x1: X1 - 0.16, z0: 3.20, z1: Z1 - 0.16 };
    const gate = { x0: GATE.x0 + 0.06, x1: GATE.x1 - 0.06, z0: Z0 - 0.42, z1: Z0 + 0.10 };

    return {
      root: root,
      update: update,
      area: area,                                // 阳台能走的范围
      gate: gate,                                // 从门洞穿过去的通道
      blockers: [                                 // 阳台里走不过去的东西
        { x0: 0.20, x1: 0.92, z0: 3.58, z1: 4.30 },   // 洗衣机
        { x0: 0.98, x1: 1.50, z0: 4.34, z1: 4.90 },   // 洗衣篮
        { x0: 2.24, x1: 3.08, z0: 4.06, z1: 5.24 },   // 躺椅
        { x0: 0.18, x1: 1.60, z0: 4.84, z1: 5.20 }    // 花箱
      ],
      reset: function () {
        st = { wash: 'idle', washT: 0, line: 0, wet: false, dryT: 0, plant: null };
        save();
        if (frames.basketCloth) frames.basketCloth.visible = false;
        frames.garments.forEach(function (g) { g.g.visible = false; });
        applyPlant();
      },
      wash: function () { if (st.wash !== 'washing') washStart(); },
      plantAt: function (hoursAgo) {          // 调试：直接把花拨到"几小时前种下"
        st.plant = { at: Date.now() - (hoursAgo || 0) * HOUR, picked: false };
        save();
        frames._plantShown = -1;
        applyPlant();
      },
      debug: function () {
        return {
          wash: st.wash,
          left: st.wash === 'washing' ? Math.max(0, Math.round(WASH_SEC - st.washT)) : 0,
          line: st.line,
          wet: st.wet,
          sit: st.sitting,
          plant: plantStage(),
          rain: raining_(),
          snow: snowing_()
        };
      }
    };
  }

  function raining_() { return !!(rain && rain.isOn && rain.isOn()); }
  function snowing_() { return !!(snow && snow.isOn && snow.isOn()); }

  return { build: build };
})();
