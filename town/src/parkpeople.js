/* 小D的赛博小家 · M36 乐园的游客（小镇居民来水上乐园玩）
 *
 * 妈妈说：「继续完善水上乐园设施，加点居民」
 * 于是把便利店那五个居民（阿兔/柴叔/小满/豆豆/龟爷爷）请到乐园来：
 * 自己从园门走进来 → 走过会喷水的栈道 → 挑一件事做：
 *   排队买小吃、躺椅晒太阳、蘑菇池玩水、池边看水、水吧买饮料、淋浴冲一下、拍照位摆拍
 * → 做完再自己出门。点一下他们会挥手说话。
 *
 * 走路的样子直接借用 `XD.Customers` 那套小人（M36 在 customers.js 里开了 newWalker/poseWalker）。
 * 调试：?pp=N 空转 N 秒；?ppspawn=1 立刻来一个；?diag=1 里 npp=
 */
window.XD = window.XD || {};

XD.ParkPeople = (function () {
  'use strict';

  const MAX = 4;                       // 同时最多几个游客
  const GATE = { x: -6.0, z: -33.2 };  // 园门外
  const GATE_IN = [-6.0, -35.6];       // 进门第一脚

  /* ---------- 从门口出发的几条路（绕开泳池） ---------- */
  const P = {
    south: [[-6.0, -35.8], [-6.6, -41.2], [0.4, -42.7]],
    eastS: [[-6.0, -35.8], [-6.6, -41.2], [0.4, -42.7], [8.8, -42.6]],
    eastN: [[-6.0, -35.8], [-6.6, -41.2], [0.4, -42.7], [8.8, -42.6], [8.8, -53.0]],
    westN: [[-6.0, -35.8], [-8.6, -40.6], [-8.8, -52.8]],
    north: [[-6.0, -35.8], [-8.6, -40.6], [-8.8, -52.8], [-7.4, -55.2]]
  };

  /* ---------- 七个活动 ---------- */
  const ACTS = [
    {
      id: 'food', kind: '小吃街', base: 'eastN',
      tail: function () { return [[2.4, -56.6]]; },
      dur: 7.5, face: Math.PI,
      lines: ['要一桶焦糖爆米花', '老板，一根烤玉米', '椰子水加冰，谢谢'],
      eat: 4
    },
    {
      id: 'lounger', kind: '躺椅', base: 'eastS',
      tail: function () { return [[12.8, -40.2], [16.0, -38.0]]; },
      dur: 9, face: 0.78,
      lines: ['太阳刚好，晒一会儿', '这把椅子比我家沙发舒服', '摊平了，别叫我'],
      armUp: true
    },
    {
      id: 'splash', kind: '蘑菇池', base: 'eastS',
      tail: function () { return [[11.8, -44.6], [13.2, -45.8]]; },
      dur: 7, face: 2.28,
      lines: ['这个蘑菇会下雨诶', '水只到脚踝，凉凉的', '再淋一下就走'],
      splash: true
    },
    {
      id: 'photo', kind: '拍照位', base: 'south',
      tail: function () { return [[2.0, -41.6]]; },
      dur: 6, face: 0,
      lines: ['帮我拍一张！', '站这儿，背景是泳池', '这张要发群里'],
      wave: true
    },
    {
      id: 'bar', kind: '水吧', base: 'eastN',
      tail: function () { return [[13.8, -52.2], [15.6, -52.4]]; },
      dur: 5.5, face: Math.PI * 0.5,
      lines: ['一杯冰汽水', '西瓜汁有吗', '坐这儿看池子正好'],
      pour: true
    },
    {
      id: 'pool', kind: '池边', base: 'south',
      tail: function () { return [[0.4, -43.7]]; },
      dur: 6, face: Math.PI,
      lines: ['水好蓝啊', '谁把小鲸鱼也带来了', '等我吃完再下去'],
      lookDown: true
    },
    {
      id: 'shower', kind: '淋浴', base: 'eastS',
      tail: function () { return [[9.4, -43.5]]; },
      dur: 4.5, face: Math.PI,
      lines: ['冲一下再回去', '这里的水是温的', '好啦，干净了'],
      pour: true
    }
  ];

  /* ---------- 状态 ---------- */
  let root = null, interact = null, sfx = null, tip = null;
  let isParkNow = function () { return false; };
  let residents = [];       // 每个槽位一个（null = 空）
  let hots = [];
  let spawnT = 3.5;
  let visited = 0;          // 今天来了几个（园门小黑板用）
  let lastDef = null;
  let forceAct = null;      // 调试：?ppact=food 只做这一件事（截图用）

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- 说话 ---------- */
  function say(r, text, life) {
    if (!text || !interact || !interact.say) return;
    interact.say(new THREE.Vector3(r.w.x, 1.52, r.w.z), text, life || 3.0);
  }

  /* ---------- 手里拿着的小吃 ---------- */
  let snackMats = null;
  function makeSnack(kind) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xfaf6ee).convertSRGBToLinear(), roughness: 0.8
    });
    const red = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xf2876b).convertSRGBToLinear(), roughness: 0.85
    });
    const tan = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd8b078).convertSRGBToLinear(), roughness: 0.9
    });
    if (kind === 'ice') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), tan);
      cone.rotation.x = Math.PI;
      cone.position.y = 0.02;
      g.add(cone);
      const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), white);
      scoop.position.y = 0.09;
      g.add(scoop);
    } else {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.12, 10), red);
      cup.position.y = 0.04;
      g.add(cup);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), white);
        p.position.set((i - 1) * 0.03, 0.11 + (i % 2) * 0.01, 0);
        g.add(p);
      }
    }
    return g;
  }

  /* ---------- 一个游客 ---------- */
  function makeResident(def, act) {
    const w = XD.Customers.newWalker(def);
    root.add(w.root);
    const r = {
      def: def, w: w, act: act,
      phase: 'in', t: 0, spoke: false, eats: 0, eatT: 0,
      route: [], ri: 0, full: [], snack: null,
      bubble: 0, wave: 0, armUp: 0, lookDown: 0
    };
    // 进门第一段 → 活动路线
    const tail = act.tail ? act.tail() : [];
    r.full = [[GATE.x + rnd(-0.2, 0.2), GATE.z], GATE_IN].concat(P[act.base] || P.south).concat(tail);
    r.route = r.full.slice();
    r.ri = 0;
    w.x = r.route[0][0];
    w.z = r.route[0][1];
    w.yawTarget = 0;
    w.yaw = Math.PI;   // 刚进来背对着外面，朝园里（-z）
    return r;
  }

  function startLeaving(r) {
    r.phase = 'out';
    r.route = r.full.slice().reverse();
    r.route.push([GATE.x, GATE.z + 0.4]);
    r.ri = 0;
    if (r.snack) { r.snack.visible = false; }
  }

  function removeResident(r) {
    if (r.w && r.w.root && r.w.root.parent) r.w.root.parent.remove(r.w.root);
    const i = residents.indexOf(r);
    if (i >= 0) residents[i] = null;
  }

  /* ---------- 走路 ---------- */
  function stepRoute(r, dt) {
    const p = r.route[r.ri];
    if (!p) return true;
    const dx = p[0] - r.w.x, dz = p[1] - r.w.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.13) { r.ri++; return false; }
    const sp = 1.30 * (r.def.speed || 1);
    const k = Math.min(1, (sp * dt) / d);
    r.w.x += dx * k;
    r.w.z += dz * k;
    r.w.moving = true;
    r.w.yawTarget = Math.atan2(dx, dz);
    return false;
  }

  /* ---------- 到了之后做什么 ---------- */
  function startDoing(r) {
    r.phase = 'do';
    r.t = 0;
    r.w.moving = false;
    r.w.yawTarget = r.act.face === undefined ? r.w.yaw : r.act.face;
    const a = r.act;
    if (a.id === 'food') {
      say(r, pick(a.lines), 3.2);
      if (sfx && sfx.pickup) sfx.pickup();
    } else if (a.id === 'splash') {
      say(r, pick(a.lines), 3.4);
      if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
    } else if (a.id === 'photo') {
      say(r, pick(a.lines), 3.6);
      r.w.wave = 1.5;
    } else if (a.id === 'bar' || a.id === 'shower') {
      say(r, pick(a.lines), 3.4);
      if (sfx && sfx.pour) sfx.pour();
    } else {
      say(r, pick(a.lines), 3.4);
    }
  }

  function tickDoing(r, dt) {
    const a = r.act;
    r.t += dt;
    if (a.eat) {
      r.eatT -= dt;
      if (r.eatT <= 0 && r.eats < a.eat) {
        r.eatT = 1.15;
        r.eats++;
        if (r.snack) r.snack.visible = r.eats < a.eat;
        if (sfx && sfx.eat) sfx.eat(r.eats === a.eat ? 'gulp' : 'chew');
      }
    }
    if (a.splash) {
      r.armUp = Math.max(0, r.armUp - dt);
      if (Math.random() < dt * 1.5) {
        r.armUp = 0.6;
        if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
      }
    }
    if (a.wave) r.wave = Math.max(0, r.wave - dt);
    if (r.t > a.dur) startLeaving(r);
  }

  /* ---------- 生成 ---------- */
  function spawnOne() {
    if (!XD.Customers || !XD.Customers.newWalker) return null;
    const cast = XD.Customers.cast();
    let slot = -1;
    for (let i = 0; i < MAX; i++) if (!residents[i]) { slot = i; break; }
    if (slot < 0) return null;
    let def = pick(cast);
    // 尽量别来同一个（已经站在园里的先避开）
    const here = {};
    for (let i = 0; i < residents.length; i++) if (residents[i]) here[residents[i].def.id] = true;
    let tries = 0;
    while ((here[def.id] || (lastDef && def.id === lastDef.id)) && tries < 10) {
      def = pick(cast);
      tries++;
    }
    lastDef = def;
    let act;
    if (forceAct) {
      for (let i = 0; i < ACTS.length; i++) if (ACTS[i].id === forceAct) act = ACTS[i];
    }
    if (!act) act = pick(ACTS);
    const r = makeResident(def, act);
    residents[slot] = r;
    visited++;
    drawBoard();
    saveVisits();
    return r;
  }

  /* ---------- 园门小黑板：今日入园 ---------- */
  let boardTex = null, boardMesh = null, boardCanvas = null, boardCtx = null;
  const LS = 'xd_parkvisit';

  function dayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function loadVisits() {
    try {
      const o = JSON.parse(localStorage.getItem(LS) || 'null');
      if (o && o.d === dayKey()) return parseInt(o.v, 10) || 0;
    } catch (e) { /* 存坏了就从 0 开始 */ }
    return 0;
  }
  function saveVisits() {
    try { localStorage.setItem(LS, JSON.stringify({ d: dayKey(), v: visited })); } catch (e) { /* 无所谓 */ }
  }
  function drawBoard() {
    if (!boardCtx) return;
    const W = boardCanvas.width, H = boardCanvas.height;
    boardCtx.fillStyle = '#2f3b2f';
    boardCtx.fillRect(0, 0, W, H);
    boardCtx.strokeStyle = '#c9b98f';
    boardCtx.lineWidth = 10;
    boardCtx.strokeRect(8, 8, W - 16, H - 16);
    boardCtx.fillStyle = '#f6efd8';
    boardCtx.textAlign = 'center';
    boardCtx.font = 'bold 64px "Microsoft YaHei", sans-serif';
    boardCtx.fillText('今日入园', W / 2, 118);
    boardCtx.font = 'bold 120px "Microsoft YaHei", sans-serif';
    boardCtx.fillStyle = '#ffd76a';
    boardCtx.fillText(visited + ' 人', W / 2, 260);
    boardCtx.fillStyle = '#e8e2d0';
    boardCtx.font = '40px "Microsoft YaHei", sans-serif';
    boardCtx.fillText('小鲸鱼水上乐园', W / 2, 340);
    if (boardTex) boardTex.needsUpdate = true;
  }
  function buildBoard() {
    boardCanvas = document.createElement('canvas');
    boardCanvas.width = 512;
    boardCanvas.height = 384;
    boardCtx = boardCanvas.getContext('2d');
    boardTex = new THREE.CanvasTexture(boardCanvas);
    boardTex.encoding = THREE.sRGBEncoding;
    const g = new THREE.Group();
    g.position.set(-3.4, 0, -35.2);
    g.rotation.y = 0.28;   // 面朝门口（从外面走进来先看到"今日入园 N 人"）
    root.add(g);
    const wood = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xc9a06a).convertSRGBToLinear(), roughness: 0.85
    });
    [-0.52, 0.52].forEach(function (dx) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.32, 8), wood);
      leg.position.set(dx, 0.66, 0);
      leg.castShadow = true;
      g.add(leg);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.06),
      new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false, side: THREE.DoubleSide }));
    board.position.set(0, 1.22, 0.02);
    g.add(board);
    boardMesh = board;
    drawBoard();
  }

  /* ---------- 总装 ---------- */
  function build(opt) {
    const o = opt || {};
    root = o.parent;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    isParkNow = o.isPark || function () { return false; };
    if (!root) return { update: function () {}, debug: function () { return null; } };

    // 园门小黑板
    buildBoard();
    visited = loadVisits();

    // 四个可点的槽位（跟着游客走）
    for (let i = 0; i < MAX; i++) {
      (function (idx) {
        const h = interact.add({
          id: 'park-guest' + idx, label: '游客',
          box: [0, 1.05, 0, 0.72, 1.5, 0.72],
          anchor: [0, 1.95, 0],
          when: function () { return !!isParkNow(); },
          onClick: function () {
            const r = residents[idx];
            if (!r) return;
            r.w.wave = 1.5;
            const lines = [
              '你也来玩呀？',
              '这个乐园好大',
              '我刚从家门口走过来',
              '小鲸鱼在池子里呢',
              '那条滑道我们排过队了'
            ];
            say(r, pick(lines.concat(r.def.greet ? [r.def.greet] : [])), 3.2);
            if (sfx && sfx.blip) sfx.blip();
          },
          say: function () {
            const r = residents[idx];
            return r ? (r.def.name + ' · 游客') : '游客';
          },
          enabled: false
        });
        hots.push(h);
      })(i);
    }

    return {
      update: update,
      debug: debug,
      spawnNow: function (n) {
        const k = n || 1;
        for (let i = 0; i < k; i++) spawnOne();
      },
      count: function () {
        let c = 0;
        for (let i = 0; i < residents.length; i++) if (residents[i]) c++;
        return c;
      },
      // 调试：?ppact=food（只让他们做这一件事，截图用）
      setAct: function (id) { forceAct = id || null; }
    };
  }

  /* ---------- 每帧 ---------- */
  let wasIn = false;

  function update(dt) {
    if (!root) return;
    const inPark = !!isParkNow();
    if (!inPark) { wasIn = false; return; }
    if (!wasIn) {                    // 刚进乐园：别让人等太久，1.2 秒就来一个
      wasIn = true;
      if (spawnT > 1.2) spawnT = 1.2;
    }

    // 生成
    const alive = residents.filter(Boolean).length;
    if (alive < MAX) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnOne();
        spawnT = rnd(9, 20);
      }
    } else {
      spawnT = rnd(4, 9);
    }

    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      if (r) {
        r.w.t += dt;
        if (r.phase === 'in') {
          if (stepRoute(r, dt)) startDoing(r);
        } else if (r.phase === 'do') {
          tickDoing(r, dt);
        } else {
          if (stepRoute(r, dt)) { removeResident(r); continue; }
        }
        // 手里的小吃
        if (r.act.eat && r.phase === 'do' && !r.snack && r.t > 1.2) {
          r.snack = makeSnack('pop');
          r.snack.position.set(0.19, 0.74, 0.20);
          r.snack.rotation.x = -0.5;
          r.w.root.add(r.snack);
        }
        // 姿态
        XD.Customers.poseWalker(r.w, dt, {
          armUp: r.armUp > 0,
          lean: r.phase === 'do' ? 0.06 : 0,
          lookYaw: r.phase === 'do' ? Math.sin(r.w.t * 0.6) * 0.35 : 0,
          lookPitch: (r.phase === 'do' && r.act.lookDown) ? 0.18 : 0
        });
      }
      // 热区
      const h = hots[i];
      if (h) {
        if (r) {
          h.enabled = true;
          h.label = r.def.name + ' · 游客';
          if (h.mesh) {
            h.mesh.position.set(r.w.x, 1.05, r.w.z);
            h.mesh.rotation.y = r.w.yaw;
          }
          h.anchor.set(r.w.x, 1.95, r.w.z);
        } else {
          h.enabled = false;
        }
      }
    }
  }

  function debug() {
    const list = [];
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i];
      if (r) list.push(r.def.id + ':' + r.act.id + ':' + r.phase + ':' + Math.round(r.w.x * 10) / 10 + ',' + Math.round(r.w.z * 10) / 10);
    }
    return { n: list.length, visited: visited, list: list };
  }

  return { build: build };
})();
