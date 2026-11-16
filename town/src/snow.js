/* 小D的赛博小家 · M15 冬天来了（❄️ 雪天模式）
 * 点右上角「❄️ 雪」或按 N：窗外下雪 + 窗台积雪 + 窗角结霜 + 屋里过冬的小东西
 * 声音：雨声换成很轻的风声（风声走 sfx 的主音量，静音 M 一样管着它）
 */
window.XD = window.XD || {};

XD.Snow = (function () {
  'use strict';

  // 窗洞（跟 rain.js 用同一组数）：x≈-4.52 的玻璃，y 0.85~2.55，z -1.80~1.40
  const WIN = { x: -4.52, y0: 0.85, y1: 2.55, z0: -1.80, z1: 1.40 };
  const CY = (WIN.y0 + WIN.y1) / 2;
  const CZ = (WIN.z0 + WIN.z1) / 2;
  const WZ = WIN.z1 - WIN.z0;
  const WY = WIN.y1 - WIN.y0;
  const SILL = { y: 0.92, x: -4.451, z0: -1.82, z1: 1.42 };

  let refs = null;
  let group = null;
  let winGroup = null;
  let homeGroup = null;
  let on = false;
  let t = 0;

  let flakes = null;
  let flakeData = null;
  let veil = null;
  let snowSky = null;      // 下雪天的阴天背景（白天用，把亮度压下来）
  let steam = [];

  /* ================= 贴图 ================= */
  // 下雪天的阴天天空（白天把背景换成灰蓝渐变，屋里灯才显得暖）
  function snowSkyTex() {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#a7bacd');
    grd.addColorStop(0.55, '#c2d2e1');
    grd.addColorStop(1, '#dbe5ef');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function flakeTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(238,246,255,0.85)');
    grd.addColorStop(1, 'rgba(225,238,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // 玻璃四角结的霜：从角上往里长的小冰枝
  function frostTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);

    function branch(x, y, ang, len, depth, alpha) {
      if (depth <= 0 || len < 5) return;
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      g.strokeStyle = 'rgba(232,244,255,' + alpha.toFixed(3) + ')';
      g.lineWidth = Math.max(0.6, depth * 0.85);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      branch(x2, y2, ang + (Math.random() - 0.5) * 0.55, len * 0.74, depth - 1, alpha * 0.88);
      if (Math.random() < 0.72) {
        branch(x2, y2, ang + (Math.random() < 0.5 ? 0.6 : -0.6), len * 0.52, depth - 2, alpha * 0.7);
      }
    }
    const corners = [[2, 2, 0.35], [510, 2, Math.PI - 0.35], [2, 510, -0.35], [510, 510, Math.PI + 0.35]];
    corners.forEach(function (cn) {
      for (let i = 0; i < 5; i++) {
        branch(cn[0], cn[1], cn[2] + (i - 2) * 0.30, 58 + Math.random() * 46, 4, 0.42);
      }
    });
    // 边上薄薄一层霜
    [[0, 0, 512, 0, 1, 0], [0, 512, 512, 0, -1, 0], [0, 0, 0, 512, 0, 1], [512, 0, 0, 512, 0, -1]]
      .forEach(function (e) {
        const grd = g.createLinearGradient(e[0], e[1], e[0] + e[4] * 120, e[1] + e[5] * 120);
        grd.addColorStop(0, 'rgba(226,240,255,0.34)');
        grd.addColorStop(1, 'rgba(226,240,255,0)');
        g.fillStyle = grd;
        const pts = [[0, 0], [512, 0], [512, 512], [0, 512]];
        g.beginPath();
        pts.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
        g.closePath();
        g.fill();
      });

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ================= 窗外 ================= */
  function makeVeil() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa9bcd4, transparent: true, opacity: 0.18, depthWrite: false, fog: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WZ, WY), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(WIN.x + 0.014, CY, CZ);
    m.name = 'snow-veil';
    winGroup.add(m);
    veil = m;
  }

  function makeFrost() {
    const mat = new THREE.MeshBasicMaterial({
      map: frostTex(), transparent: true, opacity: 0.0,
      depthWrite: false, fog: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WZ, WY), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(WIN.x + 0.018, CY, CZ);
    m.name = 'snow-frost';
    winGroup.add(m);
    m.userData.fadeIn = true;
  }

  function makeFlakes() {
    const N = 1500;
    const pos = new Float32Array(N * 3);
    flakeData = [];
    for (let i = 0; i < N; i++) {
      const d = {
        x: WIN.x + 0.02 + Math.random() * 0.24,
        y: WIN.y0 - 0.2 + Math.random() * (WY + 0.8),
        z: WIN.z0 - 0.05 + Math.random() * (WZ + 0.1),
        v: 0.08 + Math.random() * 0.14,
        amp: 0.008 + Math.random() * 0.022,
        ph: Math.random() * Math.PI * 2,
        sp: 0.5 + Math.random() * 0.9
      };
      flakeData.push(d);
      pos[i * 3] = d.x;
      pos[i * 3 + 1] = d.y;
      pos[i * 3 + 2] = d.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: flakeTex(), color: 0xeaf3ff, size: 0.052, sizeAttenuation: true,
      transparent: true, opacity: 0.95, depthWrite: false, fog: false
    });
    flakes = new THREE.Points(geo, mat);
    flakes.frustumCulled = false;
    flakes.name = 'snow-flakes';
    winGroup.add(flakes);
  }

  function makeSillSnow() {
    const snowMat = new THREE.MeshStandardMaterial({ color: col(0xf4f8fd), roughness: 0.95 });
    const geo = new THREE.SphereGeometry(0.5, 14, 9);
    // 沿窗台铺一层连着的雪脊：一个个压扁的球挨着放，看起来是一片而不是一串珠子
    const zLen = SILL.z1 - SILL.z0;
    const n = Math.round(zLen / 0.085);
    for (let i = 0; i < n; i++) {
      const z = SILL.z0 + 0.04 + i * (zLen / n) + (Math.random() - 0.5) * 0.02;
      const m = new THREE.Mesh(geo, snowMat);
      m.scale.set(0.10 + Math.random() * 0.14, 0.030 + Math.random() * 0.020, 0.085 + Math.random() * 0.06);
      m.position.set(SILL.x + (Math.random() - 0.5) * 0.05, SILL.y + 0.012, z);
      m.receiveShadow = true;
      winGroup.add(m);
    }
    // 前排压出一点起伏，靠窗那侧再垫一层
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, snowMat);
      m.scale.set(0.07 + Math.random() * 0.10, 0.024 + Math.random() * 0.016, 0.10 + Math.random() * 0.09);
      m.position.set(SILL.x - 0.06 + Math.random() * 0.05, SILL.y + 0.006,
        SILL.z0 + Math.random() * zLen);
      winGroup.add(m);
    }
  }

  /* ================= 屋里过冬的东西 ================= */
  // 房间是 sRGB 输出：标准材质的颜色要转线性，不然米色会发白（坑清单 #3）
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  function knitMat(base, repeat) {
    return new THREE.MeshStandardMaterial({
      color: col(base), roughness: 0.98,
      map: XD.Mat.fabric('#' + ('000000' + base.toString(16)).slice(-6), repeat)
    });
  }

  function makeHome() {
    // 1) 沙发上多一条厚针织毯：搭在靠背一角，前面垂下来，底下带流苏
    const throwMat = knitMat(0xdcc6a4, [2, 2]);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.34), throwMat);
    back.position.set(-0.34, 0.895, -3.33);
    back.rotation.x = -0.04;
    back.castShadow = true;
    back.receiveShadow = true;
    homeGroup.add(back);

    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.34, 0.045), throwMat);
    drape.position.set(-0.34, 0.712, -3.17);
    drape.rotation.x = 0.05;
    drape.castShadow = true;
    homeGroup.add(drape);

    // 流苏：一排小细条（挂在垂下来的下沿）
    const fringeMat = new THREE.MeshStandardMaterial({ color: col(0xcdb492), roughness: 1.0 });
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.014), fringeMat);
      f.position.set(-0.61 + i * 0.09, 0.512, -3.155);
      homeGroup.add(f);
    }

    // 叠在座上的那一摞（毯子折起来的样子，圆鼓鼓的，不是方盒子）
    const foldMat = knitMat(0xd8c6a8, [2, 2]);
    const fold = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), foldMat);
    fold.scale.set(0.48, 0.15, 0.40);
    fold.position.set(0.42, 0.585, -2.92);
    fold.rotation.y = -0.10;
    fold.castShadow = true;
    homeGroup.add(fold);
    const fold2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), foldMat);
    fold2.scale.set(0.40, 0.12, 0.34);
    fold2.position.set(0.45, 0.685, -2.93);
    fold2.rotation.y = 0.06;
    fold2.castShadow = true;
    homeGroup.add(fold2);

    // 2) 床上厚被子（盖在原来的被子上，头上折回去一带）
    const duvetMat = knitMat(0xf0e6d4, [3, 2]);
    const duvet = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.115, 1.26), duvetMat);
    duvet.position.set(1.60, 0.785, -2.06);
    duvet.castShadow = true;
    duvet.receiveShadow = true;
    homeGroup.add(duvet);
    const turnBack = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.10, 0.16), duvetMat);
    turnBack.position.set(1.60, 0.845, -2.72);
    turnBack.rotation.x = 0.16;
    turnBack.castShadow = true;
    homeGroup.add(turnBack);
    // 被子上的蓬松褶
    const puffMat = knitMat(0xe9dcc8, [2, 2]);
    [[-0.55, 0], [0.05, 0.03], [0.60, -0.02]].forEach(function (o) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), puffMat);
      p.scale.set(0.50, 0.085, 1.10);
      p.position.set(1.60 + o[0], 0.845, -2.10 + o[1]);
      p.castShadow = true;
      homeGroup.add(p);
    });

    // 3) 茶几上一杯热可可 + 冒热气
    const mugMat = new THREE.MeshStandardMaterial({ color: col(0xd8b48f), roughness: 0.55 });
    const cocoa = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.034, 0.10, 20), mugMat);
    cocoa.position.set(-0.78, 0.487, -1.94);
    cocoa.castShadow = true;
    homeGroup.add(cocoa);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 14), mugMat);
    handle.position.set(-0.735, 0.492, -1.94);
    handle.rotation.y = Math.PI / 2;
    homeGroup.add(handle);
    // 杯里的热可可
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 18),
      new THREE.MeshStandardMaterial({ color: col(0x5a3524), roughness: 0.35 }));
    drink.position.set(-0.78, 0.538, -1.94);
    homeGroup.add(drink);
    // 杯垫
    const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 20),
      new THREE.MeshStandardMaterial({ color: col(0x8a6f52), roughness: 0.9 }));
    coaster.position.set(-0.78, 0.456, -1.94);
    homeGroup.add(coaster);

    // 热气：三个小 Sprite 循环往上飘
    const steamTex = steamTexMake();
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({
        map: steamTex, color: 0xdfe8f2, transparent: true, opacity: 0.0,
        depthWrite: false, fog: false
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(0.05, 0.05, 1);
      sp.position.set(-0.78 + (Math.random() - 0.5) * 0.02, 0.56, -1.94);
      sp.userData = { t: i * 1.3, life: 3.6, x0: sp.position.x, z0: sp.position.z };
      homeGroup.add(sp);
      steam.push(sp);
    }

    // 4) 床边一双毛绒拖鞋
    const furMat = new THREE.MeshStandardMaterial({ color: col(0xe6dac7), roughness: 1.0 });
    const soleMat = new THREE.MeshStandardMaterial({ color: col(0xb9a68c), roughness: 0.95 });
    [-2.02, -2.30].forEach(function (z, i) {
      const g2 = new THREE.Group();
      g2.position.set(2.72 + i * 0.02, 0, z);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.022, 0.25), soleMat);
      sole.position.y = 0.011;
      sole.receiveShadow = true;
      g2.add(sole);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), furMat);
      top.scale.set(0.105, 0.075, 0.225);
      top.position.set(0, 0.055, -0.005);
      top.castShadow = true;
      g2.add(top);
      homeGroup.add(g2);
    });
  }

  function steamTexMake() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,0.62)');
    grd.addColorStop(0.5, 'rgba(240,246,255,0.26)');
    grd.addColorStop(1, 'rgba(230,240,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ================= 声音：很轻的风（走 sfx 的主音量） ================= */
  function windStart() {
    const sfx = refs && refs.sfx;
    if (sfx && sfx.windOn) { try { sfx.windOn(); } catch (e) {} }
  }
  function windStop() {
    const sfx = refs && refs.sfx;
    if (sfx && sfx.windOff) { try { sfx.windOff(); } catch (e) {} }
  }

  /* ================= 开关 ================= */
  function set(v, opts) {
    const want = !!v;
    const o = opts || {};
    on = want;
    if (group) group.visible = on;
    if (on) {
      t = 0;
      windStart();
    } else {
      windStop();
      // 把窗外的颜色还给 atmos（雨那边的做法一样）
      if (refs && refs.atmos) refs.atmos.setMode(refs.atmos.getMode());
      if (refs && refs.room) {
        refs.room.sky.far.material.color.setHex(0xffffff);
        refs.room.sky.near.material.color.setHex(0xffffff);
      }
    }
    if (!o.silent) {
      try { localStorage.setItem('xd_home_snow', on ? '1' : '0'); } catch (e) {}
    }
    updateButton();
    return on;
  }

  function toggle() { return set(!on); }
  function isOn() { return on; }

  function updateButton() {
    const icon = document.getElementById('snowIcon');
    const text = document.getElementById('snowText');
    if (icon) icon.textContent = on ? '❄️' : '🌨';
    if (text) text.textContent = on ? '下着雪' : '下雪';
    const b = document.getElementById('snowbtn');
    if (b) b.classList.toggle('on', on);
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!on || !group) return;
    t += dt;

    // 雪片慢慢落 + 左右飘
    if (flakes && flakeData) {
      const arr = flakes.geometry.attributes.position.array;
      for (let i = 0; i < flakeData.length; i++) {
        const d = flakeData[i];
        d.y -= d.v * dt * (1 + Math.sin(t * 0.8 + d.ph) * 0.25);
        const x = d.x + Math.sin(t * d.sp + d.ph) * d.amp;
        const z = d.z + Math.sin(t * d.sp * 0.6 + d.ph) * d.amp * 1.4;
        arr[i * 3] = x;
        arr[i * 3 + 1] = d.y;
        arr[i * 3 + 2] = z;
        if (d.y < WIN.y0 - 0.15) {
          d.y = WIN.y1 + 0.15 + Math.random() * 0.25;
          d.x = WIN.x + 0.02 + Math.random() * 0.34;
          d.z = WIN.z0 - 0.05 + Math.random() * (WZ + 0.1);
        }
      }
      flakes.geometry.attributes.position.needsUpdate = true;
    }

    // 霜慢慢长出来（刚打开的时候）
    winGroup.children.forEach(function (m) {
      if (m.name === 'snow-frost' && m.userData.fadeIn) {
        m.material.opacity = Math.min(0.55, m.material.opacity + dt * 0.35);
        if (m.material.opacity >= 0.55) m.userData.fadeIn = false;
      }
    });

    // 热气往上飘
    for (let i = 0; i < steam.length; i++) {
      const s = steam[i];
      const u = s.userData;
      u.t += dt;
      if (u.t > u.life) u.t = 0;
      const k = u.t / u.life;
      s.position.y = 0.56 + k * 0.30;
      s.position.x = u.x0 + Math.sin(k * 6 + i) * 0.012;
      s.position.z = u.z0 + Math.cos(k * 5 + i) * 0.010;
      const sc = 0.045 + k * 0.075;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(k * Math.PI) * 0.30;
    }

    // 窗外压成雪天：偏冷偏白（跟昼夜模式配合，每帧纠一次）
    const day = !!(refs && refs.atmos && refs.atmos.getMode() === 'day');
    // 白天：把背景也换成阴天的灰蓝（雪天本来就该更暗一点），夜里不动
    if (day && refs && refs.scene && snowSky) refs.scene.background = snowSky;
    if (refs && refs.room) {
      refs.room.sky.far.material.color.setHex(day ? 0xc6d3e1 : 0xbccadb);
      refs.room.sky.near.material.color.setHex(day ? 0xc2cfdd : 0xb8c6d8);
      refs.room.sky.glass.material.color.setHex(day ? 0x93a6bc : 0x9fb0c6);
      if (refs.atmos && refs.atmos.getExposure) {
        refs.renderer.toneMappingExposure = refs.atmos.getExposure() * 0.99;
      }
    }
    if (veil) {
      // 晚上雪把窗外映得亮一点，白天是灰白的雪雾
      veil.material.color.setHex(day ? 0xaebfd4 : 0xc6d6e8);
      veil.material.opacity = (day ? 0.15 : 0.30) + Math.sin(t * 0.4) * 0.03;
    }
  }

  /* ================= 总装 ================= */
  function build(scene, room, renderer, atmos, sfx) {
    refs = { scene: scene, room: room, renderer: renderer, atmos: atmos, sfx: sfx };

    group = new THREE.Group();
    group.name = 'snow-m15';
    group.visible = false;

    winGroup = new THREE.Group();
    winGroup.name = 'snow-outside';
    group.add(winGroup);

    homeGroup = new THREE.Group();
    homeGroup.name = 'winter-indoor';
    group.add(homeGroup);

    makeVeil();
    makeFrost();
    makeFlakes();
    makeSillSnow();
    makeHome();
    snowSky = snowSkyTex();

    scene.add(group);
    updateButton();
    // 让别的模块（sfx 的 unlock）也能问一句"雪开着吗"
    XD.Snow.isOn = isOn;
    return {
      set: set, toggle: toggle, isOn: isOn, update: update,
      debug: function () { return { on: on, flakes: flakeData ? flakeData.length : 0 }; }
    };
  }

  return { build: build };
})();
