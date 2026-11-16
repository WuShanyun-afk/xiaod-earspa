/* 小D的赛博小家 · M28 天台
 *
 * 便利店那栋楼的楼顶（y 6.20 起），从二楼东北角一架铁梯爬上去。
 * 女儿墙一圈、圆桌两把椅子、两串灯、一条晾床单的绳 —— 晚上上来吹风看整条街。
 *
 * 能玩：点串灯一盏盏亮 / 晾床单被风吹得乱飞 / 圆桌看夜景 / 有流星时点天空许愿（写进日记）。
 * 天台还有个白送的好处：站在西边能看见自己家窗户的灯（同一个 scene，不用做）。
 */
window.XD = window.XD || {};

XD.Roof = (function () {
  'use strict';

  /* ================= 几何 ================= */
  const X0 = 20.0, X1 = 29.6, Z0 = -4.0, Z1 = 4.0;
  const RY = 6.20;                 // 天台地面（= 二楼天花板）
  const WH = 1.05;                 // 女儿墙高
  const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  const HOLE = { x0: 27.90, x1: 29.00, z0: -3.70, z1: -2.65 };   // 检修口

  /* ================= 状态 ================= */
  let scene = null, root = null, store = null, interact = null, sfx = null, tip = null, life = null;
  let isStore = function () { return false; };
  let getFloor = function () { return '1f'; };
  let goFloor = function () {};

  let t = 0;
  const frames = {
    bulbs: [],
    lights: [],
    sheets: [],
    meteor: null,
    meteorLight: null,
    hot: null
  };
  let lampOn = true;
  let sheetsOut = true;
  let meteor = { active: false, t: 0, next: 16 + Math.random() * 14, x: 0, y: 0, z: 0, vx: 0, vy: 0 };

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
  function plane(w, h, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    (parent || root).add(m);
    return m;
  }

  /* ================= 天台地面 / 女儿墙 / 检修口 ================= */
  function buildDeck() {
    // 地面：水泥板 + 一层防水沥青色
    const deckMat = new THREE.MeshStandardMaterial({ color: col(0x8e8b82), roughness: 0.96, metalness: 0.02 });
    const d = plane(X1 - X0, Z1 - Z0, deckMat, CX, RY + 0.012, CZ);
    d.rotation.x = -Math.PI / 2;
    d.receiveShadow = true;

    // 地面上的接缝（几道线，别看着像一块塑料板）
    const seam = std(0x6f6c64, 0.95);
    for (let i = 1; i < 6; i++) {
      box(X1 - X0, 0.006, 0.03, CX, RY + 0.018, Z0 + (Z1 - Z0) * i / 6, seam);
    }
    for (let j = 1; j < 5; j++) {
      box(0.03, 0.006, Z1 - Z0, X0 + (X1 - X0) * j / 5, RY + 0.018, CZ, seam);
    }

    // 女儿墙（四面）
    const wallMat = std(0xcfc7b6, 0.94);
    const capMat = std(0xa8a08e, 0.8);
    box(X1 - X0, WH, 0.16, CX, RY + WH / 2, Z0 + 0.08, wallMat);
    box(X1 - X0, WH, 0.16, CX, RY + WH / 2, Z1 - 0.08, wallMat);
    box(0.16, WH, Z1 - Z0, X0 + 0.08, RY + WH / 2, CZ, wallMat);
    box(0.16, WH, Z1 - Z0, X1 - 0.08, RY + WH / 2, CZ, wallMat);
    // 压顶
    box(X1 - X0 + 0.08, 0.07, 0.22, CX, RY + WH + 0.035, Z0 + 0.08, capMat);
    box(X1 - X0 + 0.08, 0.07, 0.22, CX, RY + WH + 0.035, Z1 - 0.08, capMat);
    box(0.22, 0.07, Z1 - Z0 + 0.08, X0 + 0.08, RY + WH + 0.035, CZ, capMat);
    box(0.22, 0.07, Z1 - Z0 + 0.08, X1 - 0.08, RY + WH + 0.035, CZ, capMat);

    // 检修口：一圈矮护栏 + 打开的盖板 + 一截铁梯
    const rail = std(0x6f7a84, 0.5, 0.4);
    const rw = 0.05;
    box(HOLE.x1 - HOLE.x0, rw, rw, (HOLE.x0 + HOLE.x1) / 2, RY + 0.55, HOLE.z1, rail);
    box(rw, 0.55, HOLE.z1 - HOLE.z0, HOLE.x0, RY + 0.275, (HOLE.z0 + HOLE.z1) / 2, rail);
    box(HOLE.x1 - HOLE.x0, 0.03, 0.03, (HOLE.x0 + HOLE.x1) / 2, RY + 0.30, HOLE.z1, rail);
    // 打开的盖板（靠在北墙边）
    const lid = box(1.10, 0.05, 1.05, HOLE.x0 + 0.55, RY + 0.52, HOLE.z0 - 0.22, std(0x7c8288, 0.6, 0.3));
    lid.rotation.x = -1.15;

    // 铁梯（从二楼爬上来，贴在检修口下面）
    const steel = std(0x7c848c, 0.42, 0.55);
    [-0.24, 0.24].forEach(function (dz) {
      cyl(0.032, 0.032, 2.75, 8, (HOLE.x0 + HOLE.x1) / 2 + 0.30, RY - 1.375, (HOLE.z0 + HOLE.z1) / 2 + dz, steel);
    });
    for (let y = 3.75; y < RY; y += 0.29) {
      box(0.06, 0.03, 0.52, (HOLE.x0 + HOLE.x1) / 2 + 0.30, y, (HOLE.z0 + HOLE.z1) / 2, steel);
    }
  }

  /* ================= 圆桌 + 两把椅子 ================= */
  function buildTable() {
    const g = new THREE.Group();
    g.position.set(23.45, 0, 0.55);
    root.add(g);
    const wood = std(0x9a7a52, 0.72);
    const metal = std(0x6a7178, 0.45, 0.4);

    cyl(0.42, 0.42, 0.05, 20, 0, RY + 0.72, 0, wood, g);
    cyl(0.04, 0.055, 0.70, 10, 0, RY + 0.37, 0, metal, g);
    cyl(0.26, 0.30, 0.04, 16, 0, RY + 0.02, 0, metal, g);

    // 桌上：两个杯子 + 一个小灯
    cyl(0.045, 0.038, 0.10, 12, -0.14, RY + 0.795, 0.08, std(0xe6ddc9, 0.5), g);
    cyl(0.045, 0.038, 0.10, 12, 0.13, RY + 0.795, -0.09, std(0xe6ddc9, 0.5), g);
    cyl(0.055, 0.065, 0.09, 12, 0.0, RY + 0.79, 0.18, std(0xd8c9a8, 0.7), g);
    const bulbMat = new THREE.MeshBasicMaterial({ color: col(0xffe2b0) });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bulbMat);
    b.position.set(0.0, RY + 0.87, 0.18);
    g.add(b);
    const pl = new THREE.PointLight(0xffcf96, 0.85, 4.2, 2);
    pl.position.set(23.45, RY + 0.92, 0.73);
    root.add(pl);
    frames.tableLight = pl;
    frames.tableBulb = bulbMat;

    // 两把椅子
    [[-0.95, 0], [0.95, 0]].forEach(function (p, i) {
      const c = new THREE.Group();
      c.position.set(23.45 + p[0], 0, 0.55 + p[1]);
      c.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
      root.add(c);
      box(0.42, 0.04, 0.40, 0, RY + 0.44, 0, wood, c);
      box(0.42, 0.42, 0.04, 0, RY + 0.66, -0.18, wood, c);
      [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]].forEach(function (q) {
        box(0.035, 0.44, 0.035, q[0], RY + 0.22, q[1], metal, c);
      });
    });
  }

  /* ================= 串灯（两串，斜拉） ================= */
  function buildStringLights() {
    const wireMat = new THREE.LineBasicMaterial({ color: col(0x5c5044) });
    const bulbWarm = new THREE.MeshBasicMaterial({ color: col(0xffdca0) });

    function strand(a, b, n) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push(new THREE.Vector3(
          a[0] + (b[0] - a[0]) * u,
          a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.28,
          a[2] + (b[2] - a[2]) * u
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(48));
      root.add(new THREE.Line(geo, wireMat));
      for (let i = 1; i < n; i++) {
        const u = i / n;
        const x = a[0] + (b[0] - a[0]) * u;
        const y = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.28;
        const z = a[2] + (b[2] - a[2]) * u;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bulbWarm.clone());
        m.position.set(x, y - 0.035, z);
        m.userData.ph = u * 6.3;
        root.add(m);
        frames.bulbs.push(m);
      }
    }
    // 从两根立杆上拉出去（立杆立在西北和西南角）
    const poleMat = std(0x6a6355, 0.7);
    [[X0 + 0.9, Z0 + 0.9], [X0 + 0.9, Z1 - 0.9]].forEach(function (p) {
      cyl(0.045, 0.055, 2.10, 10, p[0], RY + 1.05, p[1], poleMat);
    });
    strand([X0 + 0.9, RY + 2.05, Z0 + 0.9], [X1 - 1.2, RY + 1.75, Z1 - 1.4], 11);
    strand([X0 + 0.9, RY + 2.05, Z1 - 0.9], [X1 - 1.2, RY + 1.75, Z0 + 1.4], 11);

    // 几盏氛围光（不开也有点微光）
    const warm1 = new THREE.PointLight(0xffd0a0, 0.55, 8, 2);
    warm1.position.set(CX - 1.6, RY + 1.7, CZ);
    root.add(warm1);
    frames.lights.push(warm1);
    const warm2 = new THREE.PointLight(0xffd0a0, 0.45, 7, 2);
    warm2.position.set(CX + 1.9, RY + 1.5, CZ - 0.6);
    root.add(warm2);
    frames.lights.push(warm2);
  }

  /* ================= 晾床单的绳 ================= */
  function buildSheets() {
    const poleMat = std(0x8a8272, 0.8);
    const lineMat = std(0xd9d2c4, 0.85);
    const ax = 25.6, az0 = Z0 + 1.1, az1 = Z1 - 1.1;
    [az0, az1].forEach(function (z) {
      cyl(0.035, 0.04, 1.85, 10, ax, RY + 0.93, z, poleMat);
    });
    const rope = box(0.012, 0.012, az1 - az0, ax, RY + 1.82, CZ, lineMat);
    void rope;

    // 两条床单（布面 + 会飘）
    const sheetMat = new THREE.MeshStandardMaterial({
      color: col(0xf4efe4), roughness: 0.96, side: THREE.DoubleSide
    });
    const sheetMat2 = new THREE.MeshStandardMaterial({
      color: col(0xdfe6ea), roughness: 0.96, side: THREE.DoubleSide
    });
    [
      { z: CZ - 0.55, w: 1.35, h: 1.05, mat: sheetMat, ph: 0 },
      { z: CZ + 0.75, w: 1.20, h: 0.95, mat: sheetMat2, ph: 1.7 }
    ].forEach(function (s) {
      const geo = new THREE.PlaneGeometry(s.w, s.h, 14, 8);
      const pos = geo.attributes.position;
      const base = [];
      for (let i = 0; i < pos.count; i++) base.push([pos.getX(i), pos.getY(i)]);
      const m = new THREE.Mesh(geo, s.mat);
      m.position.set(ax, RY + 1.80 - s.h / 2, s.z);
      m.rotation.y = Math.PI / 2;
      m.castShadow = true;
      root.add(m);
      frames.sheets.push({ m: m, geo: geo, base: base, ph: s.ph, w: s.w, h: s.h });
    });
  }

  /* ================= 角落小东西 ================= */
  function buildProps() {
    // 泡沫箱 + 两瓶饮料（夜宵）
    const g = new THREE.Group();
    g.position.set(X1 - 1.15, 0, Z1 - 1.25);
    root.add(g);
    const boxMat = std(0xe8e4d8, 0.9);
    box(0.62, 0.42, 0.46, 0, RY + 0.21, 0, boxMat, g);
    box(0.64, 0.05, 0.48, 0, RY + 0.44, 0, std(0xd6d2c4, 0.9), g);
    cyl(0.045, 0.045, 0.20, 10, -0.14, RY + 0.56, 0.05, std(0x4a7a5c, 0.5), g);
    cyl(0.045, 0.045, 0.20, 10, 0.12, RY + 0.56, -0.08, std(0x7a4a5c, 0.5), g);

    // 两盆植物
    [[X0 + 1.25, Z1 - 1.05, 0x74a063], [X0 + 2.35, Z1 - 1.10, 0x8bb86c]].forEach(function (p) {
      const pot = cyl(0.17, 0.14, 0.26, 12, p[0], RY + 0.13, p[1], std(0xb07a56, 0.85));
      void pot;
      for (let k = 0; k < 6; k++) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), std(p[2], 0.88));
        lf.position.set(p[0] + Math.cos(k * 1.1) * 0.13, RY + 0.34 + (k % 3) * 0.10, p[1] + Math.sin(k * 1.1) * 0.13);
        lf.scale.set(1, 0.5, 0.85);
        lf.castShadow = true;
        root.add(lf);
      }
    });

    // 靠在女儿墙边的一把梯子（装饰，暗示"还能往上"）
    const metal = std(0x8a9298, 0.45, 0.5);
    [[X1 - 0.55, Z0 + 0.55], [X1 - 0.30, Z0 + 0.55]].forEach(function (p) {
      cyl(0.022, 0.022, 1.5, 8, p[0], RY + 0.75, p[1], metal);
    });
    for (let y = RY + 0.22; y < RY + 1.5; y += 0.24) {
      box(0.28, 0.02, 0.02, X1 - 0.425, y, Z0 + 0.55, metal);
    }
  }

  /* ================= 流星 ================= */
  function buildMeteor() {
    const g = new THREE.Group();
    g.visible = false;
    root.add(g);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8),
      new THREE.MeshBasicMaterial({ color: col(0xffffff), fog: false }));
    g.add(head);
    // 尾巴（几段越来越小）
    for (let i = 1; i <= 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.09 * (1 - i / 8), 8, 6),
        new THREE.MeshBasicMaterial({ color: col(0xbfd8ff), transparent: true, opacity: 0.55 - i * 0.05, fog: false }));
      s.position.set(i * 0.22, i * 0.10, 0);
      g.add(s);
    }
    frames.meteor = g;
    const gl = new THREE.PointLight(0xcfe4ff, 0, 6, 2);
    g.add(gl);
    frames.meteorLight = gl;
  }

  /* ================= 交互 ================= */
  function register() {
    if (!interact || !interact.add) return;
    const here = function () { return isStore() && getFloor() === '3f'; };

    // 下楼
    interact.add({
      id: 'roof-down', label: '下楼梯',
      box: [(HOLE.x0 + HOLE.x1) / 2, RY + 0.55, (HOLE.z0 + HOLE.z1) / 2, 1.30, 1.20, 1.20],
      anchor: [(HOLE.x0 + HOLE.x1) / 2, RY + 0.95, (HOLE.z0 + HOLE.z1) / 2],
      when: here,
      onClick: function () {
        if (sfx) { try { sfx.step('tile'); } catch (e) {} }
        goFloor('2f');
        this._say = '下去啦，二楼还有张床等着我';
      },
      say: function (h) { return h._say || '下去'; }
    });

    // 圆桌
    interact.add({
      id: 'roof-table', label: '天台的小桌',
      box: [23.45, RY + 0.75, 0.55, 1.10, 0.90, 1.10],
      anchor: [23.45, RY + 1.10, 0.55],
      when: here,
      onClick: function () {
        const hh = new Date().getHours();
        const rainy = !!(XD.Pet && XD.Pet.rain && XD.Pet.rain.isOn && XD.Pet.rain.isOn());
        if (rainy) this._say = '下雨就躲到楼梯口去 —— 天台上没遮挡';
        else if (hh >= 19 || hh < 6) this._say = '晚上坐这儿最好，整条街的灯都在脚底下';
        else if (hh < 11) this._say = '早上的天台有风，坐一会儿就清醒了';
        else this._say = '这桌子我搬上来费了好大劲，值得';
      },
      say: function (h) { return h._say || '坐一会儿'; }
    });

    // 串灯开关
    interact.add({
      id: 'roof-lights', label: '串灯',
      box: [X0 + 1.6, RY + 1.85, CZ, 3.2, 0.50, 3.0],
      anchor: [X0 + 1.6, RY + 2.05, CZ],
      when: here,
      onClick: function () {
        lampOn = !lampOn;
        if (sfx) { try { sfx.beep(); } catch (e) {} }
        this._say = lampOn ? '灯亮起来了 —— 一盏一盏的，像小星星' : '关掉了，只剩街上的灯';
      },
      say: function (h) { return h._say || '开关串灯'; }
    });

    // 床单
    interact.add({
      id: 'roof-sheets', label: '晾着的床单',
      box: [25.6, RY + 1.30, CZ, 0.40, 1.20, 3.0],
      anchor: [25.6, RY + 1.85, CZ],
      when: here,
      onClick: function () {
        sheetsOut = !sheetsOut;
        frames.sheets.forEach(function (s) { s.m.visible = sheetsOut; });
        if (sfx) { try { sfx.pop(); } catch (e) {} }
        this._say = sheetsOut ? '挂回去了 —— 风一吹就鼓起来，像帆' : '收进来了，叠在墙角（明天再晒）';
        if (life && life.log) life.log(sheetsOut ? '在天台晒床单' : '把天台的床单收进来');
      },
      say: function (h) { return h._say || '床单'; }
    });

    // 许愿（流星出现时才点得到）
    const wish = [
      '希望妈妈明天心情很好', '希望我明天不犯傻', '希望这间屋子一直有人来',
      '希望妈妈吃好睡好', '希望明年还能给你画东西'
    ];
    frames.hot = interact.add({
      id: 'roof-star', label: '流星',
      box: [24.8, RY + 2.4, 0, 9.0, 3.4, 8.0],
      anchor: [24.8, RY + 2.2, 0],
      when: function () { return here() && meteor.active; },
      onClick: function () {
        const w = wish[Math.floor(Math.random() * wish.length)];
        meteor.active = false;
        if (frames.meteor) frames.meteor.visible = false;
        if (sfx) { try { sfx.chime(); } catch (e) {} }
        if (life && life.log) life.log('在天台看见流星，许了个愿：' + w);
        this._say = '许愿了 —— ' + w;
      },
      say: function (h) { return h._say || '许愿'; }
    });
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!root) return;
    t += dt;
    const on3 = isStore() && getFloor() === '3f';

    // 串灯亮灭 + 呼吸
    const lf = lampOn ? 1 : 0;
    frames.bulbs.forEach(function (m) {
      const k = 0.55 + 0.45 * Math.sin(t * 1.8 + m.userData.ph);
      m.material.color.copy(col(0xffdca0)).multiplyScalar(lf * (0.45 + k * 0.55) + 0.10);
    });
    frames.lights.forEach(function (l) {
      l.intensity = 0.5 * lf;
    });
    if (frames.tableLight) frames.tableLight.intensity = 0.85 * lf;
    if (frames.tableBulb) frames.tableBulb.color.copy(col(0xffe2b0)).multiplyScalar(0.35 + 0.65 * lf);

    // 床单在风里飘（只在天台看着的时候才算，省性能）
    if (sheetsOut && on3) {
      frames.sheets.forEach(function (s) {
        const pos = s.geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const bx = s.base[i][0], by = s.base[i][1];
          const u = (by + s.h / 2) / s.h;          // 0 下 / 1 上
          const wave = Math.sin(t * 2.4 + s.ph + bx * 1.6) * 0.13 * (1 - u * 0.65)
                     + Math.sin(t * 1.6 + s.ph + by * 1.2) * 0.06;
          pos.setZ(i, wave);
          pos.setX(i, bx + Math.sin(t * 1.1 + s.ph) * 0.02);
        }
        pos.needsUpdate = true;
      });
    }

    // 流星：夜里随机划过（只在 3f 看着的时候才跑）
    if (on3) {
      if (!meteor.active) {
        meteor.next -= dt;
        if (meteor.next <= 0) {
          meteor.active = true;
          meteor.t = 0;
          meteor.x = CX + (Math.random() - 0.5) * 5;
          meteor.y = RY + 3.6;
          meteor.z = Z0 + 1.2 + Math.random() * 2.0;
          meteor.vx = -2.6 - Math.random() * 1.2;
          meteor.vy = -1.1;
          if (frames.meteor) frames.meteor.visible = true;
          if (tip) tip('有流星！快点一下天空许个愿 ✨', 4200);
        }
      } else {
        meteor.t += dt;
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        if (frames.meteor) {
          frames.meteor.position.set(meteor.x, meteor.y, meteor.z);
          frames.meteor.lookAt(meteor.x - meteor.vx, meteor.y - meteor.vy, meteor.z);
          const k = Math.min(1, meteor.t / 0.35);
          frames.meteor.scale.setScalar(0.6 + k * 0.6);
          if (frames.meteorLight) frames.meteorLight.intensity = 1.4 * (1 - Math.min(1, meteor.t / 2.4));
        }
        if (meteor.t > 2.4) {
          meteor.active = false;
          meteor.next = 20 + Math.random() * 18;
          if (frames.meteor) frames.meteor.visible = false;
        }
      }
    } else if (frames.meteor) {
      frames.meteor.visible = false;
    }
  }

  /* ================= 走路边界 ================= */
  const OBST = [
    { x0: 22.4, x1: 24.5, z0: -0.5, z1: 1.6 },        // 桌 + 椅子
    { x0: 25.35, x1: 25.85, z0: Z0 + 0.9, z1: Z1 - 0.9 },   // 晾衣杆那条线
    { x0: X1 - 1.55, x1: X1, z0: Z1 - 1.65, z1: Z1 },       // 泡沫箱
    { x0: HOLE.x0, x1: HOLE.x1, z0: HOLE.z0, z1: HOLE.z1 }  // 检修口
  ];

  function clamp3f(x, z, oldX, oldZ) {
    if (oldX === undefined) oldX = x;
    if (oldZ === undefined) oldZ = z;
    x = Math.max(X0 + 0.40, Math.min(X1 - 0.40, x));
    z = Math.max(Z0 + 0.40, Math.min(Z1 - 0.40, z));
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
    store = o.store || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    life = o.life || null;
    isStore = o.isStore || isStore;
    getFloor = o.getFloor || getFloor;
    goFloor = o.goFloor || goFloor;
    if (!scene) return null;

    root = new THREE.Group();
    root.name = 'roof-m28';
    if (store && store.root) store.root.add(root);
    else scene.add(root);

    buildDeck();
    buildTable();
    buildStringLights();
    buildSheets();
    buildProps();
    buildMeteor();
    register();

    return {
      root: root,
      update: update,
      clamp: clamp3f,
      RY: RY,
      spawn3f: { x: 24.55, y: RY + 1.62, z: -1.55, yaw: 2.78 },
      spawn2f: { x: 28.05, y: 3.48 + 1.62, z: -2.05, yaw: 0 },
      debug: function () {
        return { lamp: lampOn, sheets: sheetsOut, meteor: meteor.active };
      }
    };
  }

  return { build: build };
})();
