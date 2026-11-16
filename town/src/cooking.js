/* 小D的赛博小家 · M11 做饭和吃饭
 * 点灶台：小鲸鱼飘到灶边，点火、油锅滋滋、锅盖咕嘟咕嘟跳、蒸汽往上冒
 * 点餐桌：端一碗番茄鸡蛋面上来，小鲸鱼飘到桌边，吸溜吸溜
 * 点水槽：出水洗碗（哗啦 + 碗筷叮当）
 * 点冰箱：门打开，冷光透出来，"嘶——"
 * 点浴缸：放热水，水面往上爬，一层泡泡
 * 点洗手台：水龙头出水
 * 声音全在 sfx.js 里现场合成，按 M 静音。
 * 所有坐标都是世界坐标：厨房台面 y=0.886，餐桌面 y=0.755。
 */
window.XD = window.XD || {};

XD.Cooking = (function () {
  'use strict';

  const TOP = 0.886;
  const POT = { x: 7.28, y: TOP + 0.042, z: -3.18 };   // 灶上那口锅的位置
  const TBL = { x: 6.50, y: 0.755, z: 0.55 };          // 餐桌面中心

  // 小鲸鱼停的三个点
  // 灶边那处：浮在锅的左边一点点，侧面对着屋外，头和锅都看得见
  const V = {
    home: new THREE.Vector3(5.02, 1.62, 1.60),
    stove: new THREE.Vector3(6.60, 1.52, -3.14),
    table: new THREE.Vector3(6.98, 1.16, 0.60)
  };

  const VEC = {
    pot: new THREE.Vector3(6.96, 0.93, -3.10),
    bowl: new THREE.Vector3(5.92, 0.96, 0.56),
    tub: new THREE.Vector3(8.68, 1.22, 2.37),
    sink: new THREE.Vector3(5.86, 1.46, -3.30),
    fridge: new THREE.Vector3(8.58, 2.02, -2.86),
    basin: new THREE.Vector3(7.14, 1.44, 1.66)
  };

  // 声音的"声源位置"（M11.5：空间音频用，单位是世界坐标）
  const POS = {
    pot: { x: 7.28, y: 1.05, z: -3.18 },
    hood: { x: 7.10, y: 1.84, z: -3.22 },
    board: { x: 8.84, y: 1.02, z: -0.55 },
    sink: { x: 5.86, y: 1.02, z: -3.32 },
    table: { x: 6.50, y: 0.95, z: 0.55 },
    fridge: { x: 8.55, y: 1.15, z: -2.82 },
    tub: { x: 8.68, y: 0.55, z: 2.40 },
    basin: { x: 7.14, y: 0.95, z: 1.62 }
  };

  let refs = null, scene = null, sfx = null, kitchen = null, bath = null;

  function snd(name) {
    if (!sfx || !sfx[name]) return;
    const args = Array.prototype.slice.call(arguments, 1);
    try { sfx[name].apply(sfx, args); } catch (e) {}
  }
  function say(anchor, text, life) {
    if (!refs || !refs.say) return;
    // 气泡的寿命按"秒"给；顺手兼容写成毫秒的老习惯（>50 就当成毫秒）
    const sec = (life && life > 50) ? life / 1000 : life;
    try { refs.say(anchor.clone(), text, sec); } catch (e) {}
  }

  /* ================= 小工具 ================= */
  function mesh(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function box(w, h, d, x, y, z, mat, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, parent);
  }
  function ball(r, seg, x, y, z, mat, parent) {
    return mesh(new THREE.SphereGeometry(r, seg || 12, Math.max(8, (seg || 12) - 2)), mat, x, y, z, parent);
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function ease(u) { return u * u * (3 - 2 * u); }
  // 角度插值（走近路，别绕一大圈）
  function angLerp(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  /* ================= 时间线（推迟一点做某件事） ================= */
  const tl = { t: 0, q: [] };
  function at(delay, fn, tag) {
    tl.q.push({ t: tl.t + (delay || 0), fn: fn, tag: tag || '' });
  }
  function updateTimeline(dt) {
    tl.t += dt;
    // 从后往前挑到点的，顺便把同一条时间线里取消掉的事件跳过
    for (let i = tl.q.length - 1; i >= 0; i--) {
      if (tl.q[i].t <= tl.t) {
        const e = tl.q.splice(i, 1)[0];
        try { e.fn(); } catch (err) { console.warn('[cooking] 时间线', err); }
      }
    }
  }
  function clearTag(tag) {
    tl.q = tl.q.filter(function (e) { return e.tag !== tag; });
  }

  /* ================= 小鲸鱼 ================= */
  const whale = {
    group: null, tilt: null, t: 0,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    dur: 1, moving: false, yaw: 0, tiltZ: 0, tiltTarget: 0,
    home: new THREE.Vector3()
  };

  function buildWhale() {
    const wrap = (XD.Workspace && XD.Workspace.miniOrca) ? XD.Workspace.miniOrca(0.42) : null;
    if (!wrap) return;
    whale.group = new THREE.Group();
    whale.group.name = 'cook-whale';
    whale.tilt = new THREE.Group();
    whale.group.add(whale.tilt);
    whale.tilt.add(wrap);
    whale.group.position.copy(V.home);
    whale.group.visible = false;
    scene.add(whale.group);
    whale.home.copy(V.home);
  }

  // 让鲸鱼头朝 (x, z) 那个点：模型头朝 +x，所以 yaw = atan2(-dz, dx)
  function faceTo(x, z) {
    const p = whale.group.position;
    return Math.atan2(-(z - p.z), (x - p.x));
  }

  function flyWhale(dest, dur, lookX, lookZ, tiltZ) {
    if (!whale.group) return;
    whale.group.visible = true;
    whale.from.copy(whale.group.position);
    // 如果刚才躲起来了，就从门口先冒出来
    if (whale.from.distanceTo(dest) > 6) whale.from.copy(V.home);
    whale.to.copy(dest);
    whale.dur = dur || 1.1;
    whale.t = 0;
    whale.moving = true;
    whale.yaw = Math.atan2(-(dest.z - whale.from.z), dest.x - whale.from.x);
    whale.tiltTarget = (tiltZ === undefined ? 0 : tiltZ);
    whale.lookX = lookX;
    whale.lookZ = lookZ;
  }

  function hideWhale() {
    if (!whale.group) return;
    whale.moving = false;
    whale.group.visible = false;
    whale.group.position.copy(V.home);
  }

  function updateWhale(dt) {
    if (!whale.group || !whale.group.visible) return;
    whale.t += dt;
    const g = whale.group;

    if (whale.moving) {
      const u = clamp01(whale.t / whale.dur);
      const e = ease(u);
      g.position.x = whale.from.x + (whale.to.x - whale.from.x) * e;
      g.position.z = whale.from.z + (whale.to.z - whale.from.z) * e;
      g.position.y = whale.from.y + (whale.to.y - whale.from.y) * e + Math.sin(Math.PI * e) * 0.18;
      // 飞的时候朝前进方向，落定了扭头看灶/看碗
      let want = whale.yaw;
      if (u > 0.55 && whale.lookX !== undefined) {
        const k = (u - 0.55) / 0.45;
        want = angLerp(whale.yaw, Math.atan2(-(whale.lookZ - g.position.z), whale.lookX - g.position.x), k);
      }
      g.rotation.y = angLerp(g.rotation.y, want, Math.min(1, dt * 3.4));
      if (u >= 1) {
        whale.moving = false;
        whale.t = 0;
        whale.home.copy(g.position);
      }
    } else {
      // 停着的时候轻轻浮
      g.position.y = whale.home.y + Math.sin(whale.t * 1.5) * 0.028;
      g.position.x = whale.home.x + Math.sin(whale.t * 0.7) * 0.012;
    }

    // 低头 / 摇头的小动作
    whale.tiltZ += (whale.tiltTarget - whale.tiltZ) * Math.min(1, dt * 3);
    whale.tilt.rotation.z = whale.tiltZ + Math.sin(whale.t * 1.2) * 0.03;
    whale.tilt.rotation.x = Math.sin(whale.t * 0.9 + 0.7) * 0.035;
  }

  /* ================= 灶台的火 + 锅盖 + 蒸汽 ================= */
  const fire = { level: 0, target: 0, group: null, light: null, cones: [] };
  let cookT = 0;

  function buildFlame() {
    const g = new THREE.Group();
    g.position.set(POT.x, POT.y, POT.z);
    g.visible = false;
    scene.add(g);
    fire.group = g;

    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff7a24, transparent: true, opacity: 0.72,
      depthWrite: false
    });
    outerMat.color.convertSRGBToLinear();
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x4a9bff, transparent: true, opacity: 0.88,
      depthWrite: false
    });
    innerMat.color.convertSRGBToLinear();

    // 一圈蓝色内焰 + 一圈橙色外焰（小小的，贴着锅底一圈）
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const inner = mesh(new THREE.ConeGeometry(0.012, 0.044, 6), innerMat, 0, 0, 0, g);
      inner.position.set(Math.cos(a) * 0.150, 0.026, Math.sin(a) * 0.150);
      inner.rotation.z = -Math.cos(a) * 0.22;
      inner.rotation.x = Math.sin(a) * 0.22;
      inner.userData.phase = Math.random() * 6.28;
      fire.cones.push({ m: inner, base: 1, phase: inner.userData.phase, mix: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const outer = mesh(new THREE.ConeGeometry(0.017, 0.058, 6), outerMat, 0, 0, 0, g);
      outer.position.set(Math.cos(a) * 0.168, 0.030, Math.sin(a) * 0.168);
      outer.rotation.z = -Math.cos(a) * 0.20;
      outer.rotation.x = Math.sin(a) * 0.20;
      fire.cones.push({ m: outer, base: 1.15, phase: Math.random() * 6.28, mix: 0 });
    }
    fire.light = new THREE.PointLight(0xff8a44, 0, 2.4, 2);
    fire.light.position.set(POT.x, 1.16, POT.z + 0.14);
    scene.add(fire.light);
  }

  function updateFire(dt) {
    if (!fire.group) return;
    fire.level += (fire.target - fire.level) * Math.min(1, dt * 5);
    const on = fire.level > 0.02;
    fire.group.visible = on;
    fire.light.intensity = fire.level * (1.05 + Math.sin(cookT * 17) * 0.18);
    for (let i = 0; i < fire.cones.length; i++) {
      const c = fire.cones[i];
      const f = 0.42 + 0.58 * fire.level;
      const k = 0.86 + Math.sin(cookT * 13 + c.phase) * 0.16;
      c.m.scale.set(c.base * f, c.base * f * k, c.base * f);
      c.m.material.opacity = (c.mix ? 0.88 : 0.72) * fire.level * (0.85 + Math.sin(cookT * 9 + c.phase) * 0.15);
    }
  }

  // 锅盖：做饭的时候"咕嘟咕嘟"地跳，还轻轻歪一点
  // 注：盖子和盖钮是 lidGroup 的子物体，已经在 y=0.139 那一层了，所以组本身从 0 开始
  const lidState = { base: 0, hop: 0, hopV: 0 };
  function updateLid(dt) {
    const lid = kitchen && kitchen.stove && kitchen.stove.lid;
    if (!lid) return;
    if (cookT > 0 && cooking.on) {
      // 时不时给一下，让它自己蹦
      if (lidState.hop <= 0 && Math.random() < dt * 0.9) lidState.hopV = 0.42 + Math.random() * 0.3;
      lidState.hop += lidState.hopV * dt;
      lidState.hopV -= 3.2 * dt;
      if (lidState.hop < 0) { lidState.hop = 0; lidState.hopV = 0; }
    } else {
      lidState.hop += (0 - lidState.hop) * Math.min(1, dt * 8);
      lidState.hopV = 0;
    }
    const steamPush = cooking.on ? Math.sin(cookT * 2.2) * 0.006 : 0;
    lid.position.y = lidState.base + lidState.hop + steamPush;
    lid.rotation.z = cooking.on ? Math.sin(cookT * 0.8) * 0.03 + lidState.hop * 0.35 : 0;
    lid.rotation.x = cooking.on ? Math.cos(cookT * 0.7) * 0.02 : 0;
  }

  /* ================= 蒸汽 / 泡泡（Sprite 粒子池） ================= */
  const puffs = [];
  let puffCursor = 0;
  let steamTex = null;

  function buildPuffs() {
    steamTex = XD.Mat.tex(96, 96, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      // 一圈圈叠出来的软圆：不用 canvas 的径向渐变（有的机器上渲出来是空的）
      const cx = w / 2, cy = h / 2;
      for (let i = 12; i >= 1; i--) {
        const r = (w / 2) * (i / 12);
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.085)';
        g.fill();
      }
    });
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.SpriteMaterial({
        map: steamTex, transparent: true, opacity: 0,
        color: 0x93a7ba,          // 冷灰蓝：白汽在白墙前面是隐形的，得压一点色才看得见
        depthWrite: false, depthTest: true, fog: false
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.renderOrder = 860;
      scene.add(sp);
      puffs.push({ sp: sp, active: false, t: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.1, s1: 0.25, op: 0.4 });
    }
    // 注：厨房很亮，纯白的汽在白墙前面是隐形的，所以贴图给一圈冷灰的色（见下面的 color）
  }

  function puff(x, y, z, opt) {
    if (!puffs.length) return;
    const o = opt || {};
    const p = puffs[puffCursor++ % puffs.length];
    p.active = true;
    p.t = 0;
    p.life = o.life || 1.7;
    p.x = x + (Math.random() - 0.5) * (o.spread || 0.05);
    p.y = y;
    p.z = z + (Math.random() - 0.5) * (o.spread || 0.05);
    p.vx = (Math.random() - 0.5) * (o.drift || 0.07);
    p.vy = o.rise === undefined ? 0.20 : o.rise;
    p.vz = (Math.random() - 0.5) * (o.drift || 0.07);
    p.s0 = o.size || 0.09;
    p.s1 = p.s0 * (o.grow || 2.2);
    p.op = o.opacity === undefined ? 0.42 : o.opacity;
    p.sp.material.opacity = 0;
    p.sp.visible = true;
  }

  function updatePuffs(dt) {
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      if (!p.active) continue;
      p.t += dt;
      const u = p.t / p.life;
      if (u >= 1) {
        p.active = false;
        p.sp.visible = false;
        continue;
      }
      p.vy *= (1 - dt * 0.30);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const sc = p.s0 + (p.s1 - p.s0) * u;
      p.sp.position.set(p.x, p.y, p.z);
      p.sp.scale.set(sc, sc, 1);
      p.sp.material.opacity = p.op * Math.min(1, u * 5) * (1 - u);
    }
  }

  /* ================= 餐桌上的那碗面 ================= */
  const bowl = { group: null, inner: null, soup: null, appear: 0, target: 0, eat: 0 };

  function buildBowl() {
    const g = new THREE.Group();
    g.position.set(TBL.x, TBL.y, TBL.z);
    g.visible = false;
    scene.add(g);
    bowl.group = g;

    const inner = new THREE.Group();
    g.add(inner);
    bowl.inner = inner;

    const porcelain = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.28, side: THREE.DoubleSide });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.072, 0.095, 30, 1, true), porcelain);
    side.position.y = 0.048;
    inner.add(side);
    cyl(0.072, 0.072, 0.012, 24, 0, 0.006, 0, porcelain, inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.0045, 8, 30), porcelain);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.096;
    inner.add(rim);

    // 汤 + 面 + 蛋 + 番茄 + 葱花
    const soup = new THREE.Group();
    g.add(soup);
    bowl.soup = soup;

    const soupMat = new THREE.MeshStandardMaterial({ color: 0xcf7a37, roughness: 0.22 });
    const broth = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.104, 0.014, 26), soupMat);
    broth.position.y = 0.086;
    soup.add(broth);

    const noodleMat = new THREE.MeshStandardMaterial({ color: 0xf3e2ba, roughness: 0.55 });
    for (let i = 0; i < 8; i++) {
      const a = i * 0.85;
      const noodle = new THREE.Mesh(
        new THREE.TorusGeometry(0.034 + (i % 3) * 0.009, 0.0062, 6, 14, Math.PI * (1.05 + (i % 2) * 0.55)),
        noodleMat
      );
      noodle.rotation.x = Math.PI / 2;
      noodle.rotation.z = a;
      noodle.position.set(Math.cos(a * 1.7) * 0.028, 0.094 + (i % 2) * 0.005, Math.sin(a * 1.3) * 0.028);
      soup.add(noodle);
    }
    const eggWhite = ball(0.036, 14, -0.036, 0.100, 0.030,
      new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.5 }), soup);
    eggWhite.scale.y = 0.55;
    ball(0.017, 12, -0.036, 0.112, 0.030,
      new THREE.MeshStandardMaterial({ color: 0xf0b13c, roughness: 0.45 }), soup);
    [[0.040, 0.098, -0.020], [0.020, 0.099, 0.045], [-0.010, 0.100, -0.042]].forEach(function (p) {
      const t = ball(0.014, 10, p[0], p[1], p[2],
        new THREE.MeshStandardMaterial({ color: 0xd1502f, roughness: 0.45 }), soup);
      t.scale.y = 0.9;
    });
    [[0.010, 0.104, 0.010], [0.045, 0.102, 0.030], [-0.030, 0.103, -0.005], [0.005, 0.101, -0.030]].forEach(function (p) {
      ball(0.0075, 8, p[0], p[1], p[2],
        new THREE.MeshStandardMaterial({ color: 0x6f9a4e, roughness: 0.7 }), soup);
    });

    // 筷子：搭在碗口上
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb98a5f, roughness: 0.55 });
    [-0.018, 0.018].forEach(function (off) {
      const stick = cyl(0.0042, 0.0042, 0.235, 6, off, 0.128, 0.012, woodMat, g);
      stick.rotation.z = Math.PI / 2;
      stick.rotation.y = 0.42;
    });

    g.scale.setScalar(0.001);
  }

  function updateBowl(dt) {
    if (!bowl.group) return;
    bowl.appear += (bowl.target - bowl.appear) * Math.min(1, dt * 9);
    if (bowl.target <= 0.001 && bowl.appear < 0.02) {
      bowl.group.visible = false;
      return;
    }
    bowl.group.visible = true;
    const v = clamp01(bowl.appear);
    // 端上来的时候带一点点回弹
    const p = v + Math.sin(v * Math.PI) * 0.10;
    bowl.group.scale.setScalar(Math.max(0.001, p));
    bowl.group.position.y = TBL.y + (1 - v) * 0.16;
    if (bowl.soup) {
      const s = 1 - clamp01(bowl.eat) * 0.92;
      bowl.soup.scale.setScalar(Math.max(0.02, s));
      bowl.soup.position.y = -clamp01(bowl.eat) * 0.02;
    }
  }

  /* ================= 水：水槽 / 洗手台 / 浴缸 ================= */
  const water = {
    sink: { mesh: null, on: false, t: 0, timer: null },
    basin: { mesh: null, on: false, t: 0, timer: null },
    tub: { fill: 0, target: 0, on: false, foam: null, bubbles: [], steamT: 0, lastY: 0.15 }
  };

  const waterMat = new THREE.MeshBasicMaterial({
    color: 0xd8f0fa, transparent: true, opacity: 0.55, depthWrite: false
  });

  function buildStreams() {
    // 水槽的出水（材质各自克隆一份，不然两个水柱会抢同一个透明度）
    const s = mesh(new THREE.CylinderGeometry(0.007, 0.011, 0.26, 8), waterMat.clone(), 5.88, 0.95, -3.36, null);
    s.visible = false;
    scene.add(s);
    water.sink.mesh = s;

    // 洗手台的出水
    const b = mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.13, 8), waterMat.clone(), 7.14, 0.905, 1.615, null);
    b.visible = false;
    scene.add(b);
    water.basin.mesh = b;
  }

  function toggleSink() {
    const w = water.sink;
    if (w.on) { stopSink(); return false; }
    w.on = true;
    w.t = 0;
    if (w.mesh) w.mesh.visible = true;
    snd('waterOn', 'sink', 0.5, 1, POS.sink);
    snd('clink', POS.sink);
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(function () {
      if (water.sink.on) stopSink();
    }, 6200);
    return true;
  }
  function stopSink() {
    const w = water.sink;
    w.on = false;
    if (w.mesh) w.mesh.visible = false;
    if (w.timer) { clearTimeout(w.timer); w.timer = null; }
    snd('waterOff', 'sink');
  }

  function toggleBasin() {
    const w = water.basin;
    if (w.on) {
      w.on = false;
      if (w.mesh) w.mesh.visible = false;
      if (w.timer) { clearTimeout(w.timer); w.timer = null; }
      snd('waterOff', 'basin');
      return false;
    }
    w.on = true;
    w.t = 0;
    if (w.mesh) w.mesh.visible = true;
    snd('waterOn', 'basin', 0.45, 1.05, POS.basin);
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(function () {
      water.basin.on = false;
      if (water.basin.mesh) water.basin.mesh.visible = false;
      snd('waterOff', 'basin');
    }, 5200);
    return true;
  }

  function buildTub() {
    const t = bath && bath.tub;
    if (!t || !t.water) return;
    // 泡泡：水面上一坨小小的白泡沫
    const foam = new THREE.Group();
    foam.visible = false;
    scene.add(foam);
    water.tub.foam = foam;
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xfbfeff, roughness: 0.95, metalness: 0 });
    for (let i = 0; i < 26; i++) {
      const r = 0.040 + Math.random() * 0.058;
      const s = ball(r, 10, 0, 0, 0, foamMat, foam);
      s.scale.set(1.2, 0.5, 1.1);
      s.position.set(
        t.x0 + 0.10 + Math.random() * (t.x1 - t.x0 - 0.20),
        0.352 + Math.random() * 0.016,
        t.z0 + 0.14 + Math.random() * (t.z1 - t.z0 - 0.28)
      );
      s.userData.bob = Math.random() * 6.28;
      s.userData.y0 = s.position.y;
    }
    // 水色压蓝一点，不然一缸白水泡在白浴缸里看不出来
    try {
      t.water.material.color.setHex(0x4fa8c4).convertSRGBToLinear();
      t.water.material.roughness = 0.35;
      t.water.material.metalness = 0.02;
    } catch (e) {}
    water.tub.mesh = t.water;
    t.water.position.y = 0.15;
    t.water.visible = false;
  }

  function toggleTub() {
    const t = bath && bath.tub;
    if (!t) return false;
    if (water.tub.target < 0.5) {
      water.tub.target = 1;
      water.tub.on = true;
      if (t.water) {
        t.water.visible = true;
        t.water.material.opacity = 0.16;
      }
      snd('waterOn', 'tub', 0.55, 0.92, POS.tub);
      at(4.0, function () {
        water.tub.on = false;
        snd('waterOff', 'tub');
        snd('splash');
        if (water.tub.foam) water.tub.foam.visible = true;
        say(VEC.tub, '水放好了，热的。浴盐在架子上', 4200);
      }, 'tub');
      return true;
    }
    // 再点一下：放掉
    water.tub.target = 0;
    water.tub.on = false;
    clearTag('tub');
    snd('drain', POS.tub);
    if (water.tub.foam) {
      water.tub.foam.visible = false;
    }
    return false;
  }

  function updateWater(dt) {
    // ---- 水槽 / 洗手台：水柱轻轻抖 ----
    [water.sink, water.basin].forEach(function (w) {
      if (!w.on || !w.mesh) return;
      w.t += dt;
      const k = 1 + Math.sin(w.t * 26) * 0.10;
      w.mesh.scale.set(1, k, 1);
      w.mesh.material.opacity = 0.45 + Math.sin(w.t * 18) * 0.12;
    });

    // ---- 浴缸：水面往上爬 ----
    const t = bath && bath.tub;
    if (!t || !t.water) return;
    const w = water.tub;
    const speed = w.target > w.fill ? 1 / 4.0 : 1 / 2.2;
    const d = w.target - w.fill;
    if (Math.abs(d) > 0.001) {
      w.fill += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    }
    const y = 0.15 + 0.175 * w.fill;
    t.water.position.y = y;
    t.water.scale.set(0.94 + 0.06 * w.fill, 1, 0.94 + 0.06 * w.fill);
    t.water.material.opacity = 0.24 + 0.64 * w.fill;
    // 注意：别在"刚开始放水"的那一帧就把水面藏起来，否则整缸水都看不见
    t.water.visible = w.fill > 0.004;

    if (w.foam && w.foam.visible) {
      w.foam.position.y = (y - 0.32) + Math.sin(cookT * 1.4) * 0.004;
      for (let i = 0; i < w.foam.children.length; i++) {
        const s = w.foam.children[i];
        s.position.y = s.userData.y0 + Math.sin(cookT * 2.1 + s.userData.bob) * 0.006;
        s.rotation.y = Math.sin(cookT * 0.8 + s.userData.bob) * 0.6;
      }
    }

    // 热水冒一点汽
    if (w.fill > 0.5) {
      w.steamT += dt;
      if (w.steamT > (w.on ? 0.14 : 0.42)) {
        w.steamT = 0;
        puff(
          t.center.x + (Math.random() - 0.5) * 0.5,
          y + 0.03,
          t.center.z + (Math.random() - 0.5) * 1.1,
          { size: 0.10, grow: 2.6, rise: 0.16, life: 2.0, opacity: 0.26, spread: 0.02 }
        );
      }
    }
  }

  /* ================= 冰箱 ================= */
  const fridge = { open: false, angle: 0, light: 0 };

  function toggleFridge() {
    if (!kitchen || !kitchen.fridge) return false;
    fridge.open = !fridge.open;
    if (fridge.open) snd('fridgeOpen', POS.fridge); else snd('fridgeClose', POS.fridge);
    return fridge.open;
  }

  function updateFridge(dt) {
    const f = kitchen && kitchen.fridge;
    if (!f) return;
    const target = fridge.open ? -1.56 : 0;
    fridge.angle += (target - fridge.angle) * Math.min(1, dt * 6.5);
    if (f.door) f.door.rotation.y = fridge.angle;
    const wantLight = fridge.open ? 0.95 : 0;
    fridge.light += (wantLight - fridge.light) * Math.min(1, dt * 7);
    if (f.light) f.light.intensity = fridge.light;
    if (f.strip) f.strip.visible = fridge.light > 0.08;
  }

  /* ================= 做饭 ================= */
  const cooking = { on: false, ready: false, dish: '清汤面' };

  /* M55：备菜 —— 在东墙菜板上切够几样，炒出来的就不是清汤面了
   * 妈妈：「这个菜板看着没有用途，而且做菜功能太少了」 */
  const prep = { n: 0, knifeT: 0, pieces: [] };
  const PREP_COLORS = [0xc0392b, 0x4e8b3c, 0xd8a93c];    // 番茄 / 小葱 / 鸡蛋（压深一点，别被厨房的灯照白）
  const PREP_NAMES = ['番茄', '小葱', '鸡蛋'];

  function dishName() {
    if (prep.n >= 3) return '番茄炒蛋';
    if (prep.n === 2) return '番茄蛋花面';
    if (prep.n === 1) return '葱花面';
    return '清汤面';
  }

  function prepText() {
    if (prep.n >= 3) return '番茄、小葱、鸡蛋都切好了';
    if (prep.n === 0) return '菜板上还空着';
    return '切好了 ' + prep.n + ' 样（' + PREP_NAMES.slice(0, prep.n).join('、') + '）';
  }

  function clearPrep() {
    for (let i = 0; i < prep.pieces.length; i++) {
      const p = prep.pieces[i];
      if (p.parent) p.parent.remove(p);
      if (p.geometry) p.geometry.dispose();
      if (p.material) p.material.dispose();
    }
    prep.pieces.length = 0;
    prep.n = 0;
    prep.knifeT = 0;
  }

  function chop() {
    if (prep.n >= 3) return false;
    const k = kitchen && kitchen.prep;
    const idx = prep.n % 3;
    prep.n++;
    if (k && k.group) {
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(0.032 + Math.random() * 0.012, 0.010, 0.032 + Math.random() * 0.012),
        new THREE.MeshStandardMaterial({ color: PREP_COLORS[idx], roughness: 0.85 })
      );
      piece.position.set((Math.random() - 0.5) * 0.16, 0.006, (Math.random() - 0.5) * 0.11);
      piece.rotation.y = Math.random() * Math.PI;
      piece.scale.setScalar(0.2);
      k.group.add(piece);
      prep.pieces.push(piece);
      prep.knifeT = 1;                      // 刀落一下
    }
    snd('chop', 1, POS.board);
    return true;
  }

  function updatePrep(dt) {
    const k = kitchen && kitchen.prep;
    if (!k || !k.knife) return;
    const baseY = (k.knife.userData.baseY !== undefined) ? k.knife.userData.baseY : k.knife.position.y;
    if (prep.knifeT > 0) {
      prep.knifeT = Math.max(0, prep.knifeT - dt * 3.6);
      k.knife.position.y = baseY - Math.sin((1 - prep.knifeT) * Math.PI) * 0.045;
    } else {
      k.knife.position.y = baseY;
    }
    for (let i = 0; i < prep.pieces.length; i++) {
      const p = prep.pieces[i];
      if (p.scale.x < 1) p.scale.setScalar(Math.min(1, p.scale.x + dt * 6));
    }
  }

  function startCooking() {
    cooking.on = true;
    cooking.ready = false;
    cooking.dish = dishName();
    cookT = 0;
    clearTag('cook');
    clearTag('leave');
    fire.target = 1;

    flyWhale(V.stove, 1.15, POT.x, POT.z, -0.28);
    // 开场那句话交给 interact 的"灶台"本身说，这里不重复

    snd('chop', 3, POS.board);

    // 一条"做饭"的声音线：切 → 倒水 → 点火 → 抽油烟机 + 油锅 + 锅咕嘟 → 盖子跳 + 搅两下
    at(0.30, function () { snd('pour', POS.pot); }, 'cook');
    at(0.62, function () { snd('ignite'); snd('hoodOn', POS.hood); }, 'cook');
    at(0.95, function () { snd('sizzleOn', 0.34, POS.pot); snd('boilOn', 0.5, POS.pot); }, 'cook');
    at(1.25, function () { snd('lid', POS.pot); }, 'cook');
    at(1.9, function () { snd('stir', POS.pot); }, 'cook');
    at(2.9, function () { snd('lid', POS.pot); }, 'cook');
    at(3.7, function () { snd('stir', POS.pot); }, 'cook');
    at(4.6, function () {
      say(VEC.pot, cooking.dish === '清汤面' ? '再等两分钟，面别煮烂了' : '再等两分钟，' + cooking.dish + '马上好', 3200);
    }, 'cook');
    at(4.8, function () { snd('lid', POS.pot); }, 'cook');
    at(6.2, function () { snd('lid', POS.pot); }, 'cook');
    at(7.2, function () {
      finishCooking();
    }, 'cook');
  }

  function finishCooking() {
    if (!cooking.on) return;
    cooking.on = false;
    cooking.ready = true;
    clearTag('cook');
    fire.target = 0;
    snd('sizzleOff');
    snd('boilOff');
    snd('extinguish');
    snd('hoodOff');
    snd('ding', POS.pot);
    say(VEC.pot, cooking.dish + '好了！端到桌上吃', 4600);
    // 收个尾：鲸鱼飘回门口，然后躲起来
    at(0.9, function () { flyWhale(V.home, 1.6, 5.6, 1.6, 0); }, 'leave');
    at(2.8, function () { hideWhale(); }, 'leave');
  }

  function stopCooking(quiet) {
    if (!cooking.on) return;
    cooking.on = false;
    cooking.ready = true;
    clearTag('cook');
    fire.target = 0;
    lidState.hop = 0;
    snd('sizzleOff');
    snd('boilOff');
    snd('extinguish');
    snd('hoodOff');
    if (!quiet) say(VEC.pot, '火关了，' + cooking.dish + '在锅里焖着', 3200);
    at(1.4, function () { flyWhale(V.home, 1.5, 5.6, 1.6, 0); }, 'leave');
    at(3.2, function () { hideWhale(); }, 'leave');
  }

  function toggleCook() {
    if (cooking.on) { stopCooking(false); return false; }
    startCooking();
    return true;
  }

  /* ================= 吃饭 ================= */
  const eating = { on: false, t: 0 };

  function serveFood() {
    if (eating.on) return false;
    if (cooking.on) stopCooking(true);
    eating.on = true;
    eating.t = 0;
    clearTag('eat');
    bowl.eat = 0;
    bowl.target = 1;
    bowl.group.visible = true;
    snd('pop');
    at(0.25, function () { snd('clink', POS.table); }, 'eat');
    flyWhale(V.table, 1.2, TBL.x, TBL.z, -0.14);

    at(1.4, function () { snd('slurp', POS.table); }, 'eat');
    at(2.6, function () {
      say(VEC.bowl, '好吃……你也来一口？', 3200);
    }, 'eat');
    at(2.4, function () { snd('clink', POS.table); }, 'eat');
    at(3.4, function () { snd('slurp', POS.table); snd('clink', POS.table); }, 'eat');
    at(3.6, function () {
      bowl.eat = 1;          // 面吃完了
    }, 'eat');
    at(4.6, function () {
      bowl.target = 0;       // 收碗
    }, 'eat');
    at(5.0, function () { flyWhale(V.home, 1.5, 5.6, 1.6, 0); }, 'eat');
    at(6.6, function () {
      hideWhale();
      eating.on = false;
      cooking.ready = false;
      clearPrep();                       // M55：吃完把菜板收拾干净
    }, 'eat');
    return true;
  }

  /* ================= 每帧 ================= */
  let steamT = 0;

  function update(dt) {
    cookT += dt;
    updateTimeline(dt);
    updateWhale(dt);
    updateFire(dt);
    updateLid(dt);
    updateBowl(dt);
    updateWater(dt);
    updateFridge(dt);
    updatePrep(dt);
    updatePuffs(dt);

    // 锅上冒汽
    if (cooking.on) {
      steamT += dt;
      if (steamT > 0.13) {
        steamT = 0;
        puff(POT.x + (Math.random() - 0.5) * 0.06, POT.y + 0.20, POT.z + (Math.random() - 0.5) * 0.06,
          { size: 0.115, grow: 3.0, rise: 0.26, life: 2.0, opacity: 0.55 });
      }
    }

    // 面上的热气
    if (bowl.group && bowl.group.visible && bowl.target > 0.5 && !bowl.eat) {
      if (Math.random() < dt * 5.5) {
        puff(TBL.x + (Math.random() - 0.5) * 0.05, TBL.y + 0.18, TBL.z + (Math.random() - 0.5) * 0.05,
          { size: 0.062, grow: 2.4, rise: 0.19, life: 1.6, opacity: 0.34 });
      }
    }
  }

  /* ================= 总装 ================= */
  function build(ctx) {
    refs = ctx || {};
    scene = refs.scene;
    sfx = refs.sfx || null;
    kitchen = refs.kitchen || null;
    bath = refs.bath || null;
    if (!scene) return null;

    try { buildWhale(); } catch (e) { console.warn('[cooking] 小鲸鱼没造出来', e); }
    buildFlame();
    buildPuffs();
    buildBowl();
    buildStreams();
    buildTub();
    if (kitchen && kitchen.fridge && kitchen.fridge.door) kitchen.fridge.door.rotation.y = 0;

    return {
      update: update,
      toggleCook: toggleCook,
      serve: serveFood,
      dishes: toggleSink,
      fridge: toggleFridge,
      tub: toggleTub,
      basin: toggleBasin,
      // M55：菜板
      chop: chop,
      prepCount: function () { return prep.n; },
      prepText: prepText,
      dish: function () { return cooking.dish; },
      isCooking: function () { return cooking.on; },
      isEating: function () { return eating.on; },
      isFoodReady: function () { return cooking.ready; },
      isFridgeOpen: function () { return fridge.open; },
      isTubFull: function () { return water.tub.target > 0.5 && water.tub.fill > 0.98; },
      isTubFilling: function () { return water.tub.target > 0.5 && water.tub.fill <= 0.98; },
      isSinkOn: function () { return water.sink.on; },
      isBasinOn: function () { return water.basin.on; },
      hideWhale: hideWhale,
      debug: function () {
        let live = 0;
        for (let i = 0; i < puffs.length; i++) if (puffs[i].active) live++;
        return {
          cook: cooking.on, ready: cooking.ready, fire: Math.round(fire.level * 100) / 100,
          eat: eating.on, bowl: Math.round(bowl.appear * 100) / 100,
          tub: Math.round(water.tub.fill * 100) / 100, fridge: fridge.open,
          tubVis: !!(bath && bath.tub && bath.tub.water && bath.tub.water.visible),
          tubOp: Math.round(((bath && bath.tub && bath.tub.water) ? bath.tub.water.material.opacity : 0) * 100) / 100,
          tubY: Math.round(((bath && bath.tub && bath.tub.water) ? bath.tub.water.position.y : 0) * 100) / 100,
          sink: water.sink.on, basin: water.basin.on, steam: live,
          whale: whale.group ? whale.group.visible : false,
          prep: prep.n, dish: cooking.dish
        };
      }
    };
  }

  return { build: build };
})();
