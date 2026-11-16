/* 小D的赛博小家 · M8 交互
 * - 点屋里的东西，我会弹个气泡说一句话（灯能开关、水族箱会冒泡、窗外鲸鱼能被叫过来）
 * - 按 H 自动导览：绕屋子走一圈，每一站说一句
 * - 按 F 走进去，我先打个招呼
 */
window.XD = window.XD || {};

XD.Interact = (function () {
  'use strict';

  let refs = null;
  let scene = null, camera = null;
  let hots = [];
  let raycaster = new THREE.Raycaster();
  const _v2 = new THREE.Vector2();
  const _v3 = new THREE.Vector3();

  let ndc = new THREE.Vector2(0, 0);
  let clientXY = { x: 0, y: 0 };
  let down = null;
  let hover = null;
  let hoverClock = 0;

  let bubbles = [];
  let texCache = {};

  /* ================= 一点点声音（点到的"叮"） ================= */
  let blipCtx = null;
  function blip() {
    // M11：统一走 sfx.js 的音箱，这样按 M 静音的时候"叮"也跟着安静
    if (window.XD && XD.SFX && XD.SFX.blip) {
      try { XD.SFX.blip(); return; } catch (e) { /* 那就走下面老办法 */ }
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!blipCtx) blipCtx = new AC();
      if (blipCtx.state === 'suspended') blipCtx.resume();
      const t0 = blipCtx.currentTime;
      const o = blipCtx.createOscillator();
      const g = blipCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(720, t0);
      o.frequency.exponentialRampToValueAtTime(1160, t0 + 0.09);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      o.connect(g);
      g.connect(blipCtx.destination);
      o.start(t0);
      o.stop(t0 + 0.26);
    } catch (e) { /* 没声音也能过 */ }
  }

  /* ================= 气泡 ================= */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function bubbleTex(text) {
    if (texCache[text]) return texCache[text];
    const H = 200;
    const W = Math.round(Math.max(430, Math.min(1000, 200 + text.length * 48)));
    const tex = XD.Mat.tex(W, H, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      const bh = h - 48;

      // 影子
      g.fillStyle = 'rgba(6,10,18,0.30)';
      roundRect(g, 13, 17, w - 26, bh, 34);
      g.fill();

      // 气泡本体
      g.fillStyle = 'rgba(255,252,246,0.98)';
      roundRect(g, 10, 10, w - 20, bh, 34);
      g.fill();
      g.strokeStyle = 'rgba(110,135,180,0.5)';
      g.lineWidth = 3;
      g.stroke();

      // 朝下的小尾巴
      g.beginPath();
      g.moveTo(w / 2 - 27, bh + 5);
      g.lineTo(w / 2, h - 12);
      g.lineTo(w / 2 + 27, bh + 5);
      g.closePath();
      g.fillStyle = 'rgba(255,252,246,0.98)';
      g.fill();
      g.beginPath();
      g.moveTo(w / 2 - 27, bh + 5);
      g.lineTo(w / 2, h - 12);
      g.lineTo(w / 2 + 27, bh + 5);
      g.strokeStyle = 'rgba(110,135,180,0.5)';
      g.lineWidth = 3;
      g.stroke();

      // 左上的「小D」名牌
      g.fillStyle = '#4d6bfe';
      roundRect(g, 28, 26, 96, 42, 21);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 27px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('小D', 28 + 48, 26 + 22);

      // 正文：装不下就缩字号
      g.fillStyle = '#3b4a63';
      let fs = 44;
      g.font = 'bold ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      while (g.measureText(text).width > w - 180 && fs > 22) {
        fs -= 2;
        g.font = 'bold ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      }
      g.fillText(text, w / 2 + 36, bh / 2 + 10);
    });
    texCache[text] = tex;
    return tex;
  }

  function sayAt(anchor, text, life) {
    if (!text || !scene) return;
    /* M54：同一个地方（1m 内）又冒一句 → 直接顶掉前一句。
     * 以前允许两个气泡同时存在，点浴缸时「水放好了」和「水温刚好」几乎同一个位置，
     * 屏幕上是两个框叠在一起，下面那个的文字还被上面那个盖住（看着像空框）。
     * 现在只有"两个不同的地方同时在说话"才会并排出现。 */
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].anchor.distanceTo(anchor) < 1.0) {
        const old = bubbles[i];
        if (old.sp.parent) old.sp.parent.remove(old.sp);
        if (old.sp.material) old.sp.material.dispose();
        bubbles.splice(i, 1);
      }
    }
    while (bubbles.length >= 2) {
      const old = bubbles.shift();
      if (old.sp.parent) old.sp.parent.remove(old.sp);
      if (old.sp.material) old.sp.material.dispose();
    }
    const tex = bubbleTex(text);
    const img = tex.image;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false
    });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 950;
    sp.visible = false;
    sp.userData.bubbleText = text;      // 调试/试玩用：知道屏幕上这句话是谁说的
    scene.add(sp);
    bubbles.push({
      sp: sp,
      text: text,
      aspect: img.width / img.height,
      anchor: anchor.clone(),
      t: 0,
      life: life || 3.4
    });
  }

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t += dt;
      if (b.t > b.life + 0.55) {
        if (b.sp.parent) b.sp.parent.remove(b.sp);
        if (b.sp.material) b.sp.material.dispose();
        bubbles.splice(i, 1);
        continue;
      }
      const d = camera.position.distanceTo(b.anchor);
      // 屏幕上大小差不多恒定：远了放大、近了缩小
      // M45：下限从 0.32 收到 0.12 —— 以前贴着案子看面团时，气泡会糊满整个屏幕
      const hh = Math.max(0.12, Math.min(2.6, d * 0.088));
      const pin = Math.min(1, b.t / 0.30);
      const pop = 0.55 + 0.45 * (1 - Math.pow(1 - pin, 3)) + Math.sin(pin * Math.PI) * 0.09;
      const sc = hh * pop;
      b.sp.scale.set(sc * b.aspect, sc, 1);
      b.sp.position.set(
        b.anchor.x,
        b.anchor.y + hh * 0.5 + 0.06 + Math.sin(b.t * 1.5) * 0.018,
        b.anchor.z
      );
      const fadeIn = Math.min(1, b.t / 0.18);
      const fadeOut = b.t > b.life ? Math.max(0, 1 - (b.t - b.life) / 0.55) : 1;
      b.sp.material.opacity = fadeIn * fadeOut;
      b.sp.visible = true;
    }
  }

  /* ================= 可点区域 ================= */
  const hotMat = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, transparent: true, opacity: 0
  });

  function addHot(o) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.box[3], o.box[4], o.box[5]), hotMat);
    m.position.set(o.box[0], o.box[1], o.box[2]);
    m.name = 'hot-' + o.id;
    m.userData.hot = o;
    scene.add(m);
    o.mesh = m;
    o.anchor = new THREE.Vector3(o.anchor[0], o.anchor[1], o.anchor[2]);
    hots.push(m);
    return o;
  }

  function pick(nx, ny) {
    _v2.set(nx, ny);
    raycaster.setFromCamera(_v2, camera);
    const hits = raycaster.intersectObjects(hots, false);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i].object.userData.hot;
      if (!h) continue;
      if (h.enabled === false) continue;
      if (hits[i].distance > reach) continue;   // 太远就别点了（按场景给的可及距离）
      if (h.when && !h.when()) continue;        // 不在这个场景就不给点（M17 便利店）
      // M51：隔着墙不给点（妈妈：「站在门外准星却指着浴缸」）
      if (blocked(hits[i].point, hits[i].distance)) continue;
      h._lastHit = hits[i].point;               // M34：点在哪（乐园里点水面 = 让它潜到那儿）
      return h;
    }
    return null;
  }

  /* ================= M51：被墙挡住 / 距离 =================
   * 以前 pick() 只射线打热区盒子，**不看中间的墙** —— 站在浴室门外，
   * 射线穿过墙正好撞上浴缸的盒子，准星就显示「浴缸 点一下」，点了还真有反应。
   * 现在：把场景里"又高又薄的实心盒子"（墙/柜/门板）收成一份遮挡体清单，
   * 取点前先用同一根射线量一下：中间有东西挡着就跳过这个热区。
   * reach 由场景给（屋里 3.6m、街上 6m、乐园和码头 14m）。 */
  let reach = 14;
  let occluders = [];          // 挡视线的：高 >= 1.0 的盒子
  let solids = [];             // 能碰撞的：高 >= 2.2 的盒子（门板只有 2.1，不算，免得把门堵死）
  const _ray2 = new THREE.Raycaster();
  const _box = new THREE.Box3();
  const _tmp = new THREE.Vector3();
  const _hit = new THREE.Vector3();

  function collectOccluders(rootObj) {
    occluders = [];
    solids = [];
    if (!rootObj) return 0;
    const tmpBox = new THREE.Box3();
    rootObj.updateMatrixWorld(true);
    rootObj.traverse(function (o) {
      if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
      const g = o.geometry.parameters;
      if (g.width === undefined || g.height === undefined || g.depth === undefined) return;
      if (o.userData && o.userData.hot) return;          // 热区盒子本身不算
      if (o.visible === false) return;
      const hgt = g.height;
      if (hgt < 1.0) return;
      // 只收"竖着、薄、且够高"的：墙 / 柜体 / 门框
      const thin = Math.min(g.width, g.depth) <= 0.45;
      if (!thin) return;
      _box.setFromObject(o);
      if (!isFinite(_box.min.x)) return;
      const item = {
        x0: _box.min.x, x1: _box.max.x,
        y0: _box.min.y, y1: _box.max.y,
        z0: _box.min.z, z1: _box.max.z
      };
      occluders.push(item);
      if (hgt >= 2.2) solids.push(item);
    });
    return occluders.length;
  }

  /* 镜头到目标点之间，有没有挡路的盒子 */
  function blocked(point, dist) {
    if (!occluders.length) return false;
    const o = camera.position;
    _tmp.copy(point).sub(o);
    const len = _tmp.length();
    if (len < 0.02) return false;
    _tmp.multiplyScalar(1 / len);
    _ray2.set(o, _tmp);
    const near = 0.02;
    // 注意：ray.intersectBox() 不看 near/far —— 盒子在镜头背后/目标点之后也会给一个交点，
    // 所以必须自己量一下交点到镜头的距离（踩过：浴室里明明看得到浴缸，却一直"被挡"）。
    const far = Math.min(len, dist) - 0.06;
    if (far <= near) return false;
    for (let i = 0; i < occluders.length; i++) {
      const b = occluders[i];
      // 镜头自己就在这个盒子里（贴着门板/柜子站）→ 别把它当成"挡路的"
      if (o.x > b.x0 && o.x < b.x1 && o.y > b.y0 && o.y < b.y1 && o.z > b.z0 && o.z < b.z1) continue;
      _box.min.set(b.x0, b.y0, b.z0);
      _box.max.set(b.x1, b.y1, b.z1);
      const hit = _ray2.ray.intersectBox(_box, _hit);
      if (!hit) continue;
      const d = hit.distanceTo(o);
      if (d > near && d < far) return true;
    }
    return false;
  }

  /* 把"站在墙里"的人推出来（穿模兜底）
   * M53：rr 默认 0 —— 只看"人是不是真的在盒子里"，不按身体半径往外扩一圈。
   * 以前默认 0.26，等于给每堵墙都套了一件 26cm 的棉袄：花房门洞 0.58~1.28 被挤成
   * 一条缝，门口/走廊一过就被弹回去（妈妈反馈"花园进不去"）。 */
  function pushOutSolids(x, z, r) {
    if (!solids.length) return null;
    const rr = (typeof r === 'number' && r > 0) ? r : 0;
    const gap = 0.02;
    for (let i = 0; i < solids.length; i++) {
      const b = solids[i];
      if (b.y1 < 0.5 || b.y0 > 1.55) continue;          // 头顶上的/脚下的不管
      if (x > b.x0 - rr && x < b.x1 + rr && z > b.z0 - rr && z < b.z1 + rr) {
        const d = [x - (b.x0 - rr), (b.x1 + rr) - x, z - (b.z0 - rr), (b.z1 + rr) - z];
        const m = Math.min(d[0], d[1], d[2], d[3]);
        if (m === d[0]) return { x: b.x0 - rr - gap, z: z };
        if (m === d[1]) return { x: b.x1 + rr + gap, z: z };
        if (m === d[2]) return { x: x, z: b.z0 - rr - gap };
        return { x: x, z: b.z1 + rr + gap };
      }
    }
    return null;
  }

  function setReach(d) {
    if (typeof d === 'number' && d > 0) reach = d;
    return reach;
  }

  /* 外面（main.js）把"明写的墙/家具"塞进来 */
  function addSolids(list) {
    if (!Array.isArray(list)) return solids.length;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.x1 === undefined) continue;
      solids.push({
        x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1,
        y0: b.y0 === undefined ? 0 : b.y0,
        y1: b.y1 === undefined ? 2.6 : b.y1
      });
    }
    return solids.length;
  }

  function textOf(h) {
    const s = h.say;
    // 调用时把热区当 this 传进去 —— 很多模块的 say 里用 this._say 记"上一次说的话"
    // （以前是裸调用 s(h)，严格模式下 this 是 undefined，一点就报错）
    return typeof s === 'function' ? s.call(h, h) : s;
  }

  function doClick(nx, ny) {
    const h = pick(nx, ny);
    if (!h) return false;
    hover = h;
    blip();
    if (h.onClick) h.onClick(h);
    const text = textOf(h);
    if (text) sayAt(h.anchor, text);
    return true;
  }

  /* ================= 灯的开关状态 ================= */
  const lampState = { bed: 1, floor: 1 };
  let skinIndex = 0;
  const SKIN_ORDER = ['classic', 'night', 'pink', 'green', 'gold'];

  /* ================= 导览 ================= */
  const STOPS = [
    {
      pos: [3.55, 1.72, 2.55], look: [0.20, 1.15, -1.20],
      cap: '门口 · 欢迎光临，我家不大，随便看'
    },
    {
      pos: [-1.05, 1.60, -1.25], look: [-2.85, 1.05, -3.25],
      cap: '工位 · 两台屏幕都亮着，等你来敲字'
    },
    {
      pos: [1.35, 1.62, 1.75], look: [1.72, 0.95, -2.60],
      cap: '床 · 那只虎鲸是我，晚上抱着自己睡'
    },
    {
      pos: [-2.05, 1.58, 1.55], look: [-4.55, 1.70, -0.10],
      cap: '窗 · 那只鲸鱼每天这个时候来',
      hold: 4.4,
      onArrive: function () { if (XD.Whale && XD.Whale.summon) XD.Whale.summon(); }
    },
    {
      pos: [-0.50, 1.50, 0.10], look: [-0.85, 0.95, -3.20],
      cap: '客厅 · 沙发软，躺平也行'
    },
    {
      pos: [-3.35, 1.42, 2.55], look: [-4.30, 1.10, 2.55],
      cap: '角落 · 水族箱里那只，是迷你版的我'
    },
    {
      pos: [5.55, 2.55, 3.30], look: [6.90, 0.95, -2.80],
      cap: '厨房 · 点灶台我就开火，滋滋声是真的'
    },
    {
      pos: [7.40, 3.45, 5.70], look: [7.85, 0.70, 2.30],
      cap: '浴室 · 热水我给你留着，浴盐在架子上'
    },
    {
      pos: null, look: null,
      cap: '看完了 · 想住就住，我不赶你'
    }
  ];

  const tour = {
    active: false, i: -1, phase: 'idle', t: 0, dur: 3,
    fromP: new THREE.Vector3(), toP: new THREE.Vector3(),
    fromL: new THREE.Vector3(), toL: new THREE.Vector3()
  };
  let orbitSaved = null;

  function capEl() { return document.getElementById('tourcap'); }
  function showCap(text) {
    const el = capEl();
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  function relaxOrbit(relax) {
    const c = refs.controls;
    if (!c) return;
    if (relax) {
      if (!orbitSaved) {
        orbitSaved = {
          minD: c.minDistance, maxD: c.maxDistance,
          minAz: c.minAzimuthAngle, maxAz: c.maxAzimuthAngle,
          minPol: c.minPolarAngle, maxPol: c.maxPolarAngle
        };
      }
      c.minDistance = 0.5;
      c.maxDistance = 34;
      c.minAzimuthAngle = -Infinity;
      c.maxAzimuthAngle = Infinity;
      c.minPolarAngle = 0.06;
      c.maxPolarAngle = 1.66;
    } else if (orbitSaved) {
      c.minDistance = orbitSaved.minD;
      c.maxDistance = orbitSaved.maxD;
      c.minAzimuthAngle = orbitSaved.minAz;
      c.maxAzimuthAngle = orbitSaved.maxAz;
      c.minPolarAngle = orbitSaved.minPol;
      c.maxPolarAngle = orbitSaved.maxPol;
      orbitSaved = null;
    }
  }

  function legTo(pos, look, dur) {
    tour.fromP.copy(camera.position);
    tour.toP.copy(pos);
    tour.fromL.copy(refs.controls.target);
    tour.toL.copy(look);
    tour.dur = dur;
    tour.t = 0;
    tour.phase = 'travel';
  }

  function stopPos(s) {
    if (s.pos) return new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]);
    return refs.dollhouse.pos.clone();
  }
  function stopLook(s) {
    if (s.look) return new THREE.Vector3(s.look[0], s.look[1], s.look[2]);
    return refs.dollhouse.target.clone();
  }

  function startTour() {
    if (tour.active) return false;
    if (refs.getMode() === 'walk' && refs.exitWalk) refs.exitWalk();
    tour.active = true;
    tour.i = 0;
    if (refs.controls) refs.controls.enabled = false;
    relaxOrbit(true);
    const s = STOPS[0];
    legTo(stopPos(s), stopLook(s), 2.6);
    showCap(null);
    return true;
  }

  function stopTour() {
    if (!tour.active) return false;
    tour.phase = 'return';
    tour.t = 0;
    tour.dur = 1.15;
    tour.fromP.copy(camera.position);
    tour.fromL.copy(refs.controls.target);
    tour.toP.copy(refs.dollhouse.pos);
    tour.toL.copy(refs.dollhouse.target);
    showCap(null);
    return true;
  }

  function endTour() {
    tour.active = false;
    tour.phase = 'idle';
    tour.i = -1;
    showCap(null);
    relaxOrbit(false);
    if (refs.controls) {
      refs.controls.enabled = true;
      refs.controls.update();
    }
  }

  /* 直接站到第 n 站（截图用，不自动往下走） */
  function gotoStop(n) {
    const s = STOPS[n];
    if (!s) return false;
    if (refs.getMode() === 'walk' && refs.exitWalk) refs.exitWalk();
    tour.active = false;
    tour.phase = 'idle';
    relaxOrbit(true);
    if (refs.controls) refs.controls.enabled = false;
    const p = stopPos(s), l = stopLook(s);
    camera.position.copy(p);
    refs.controls.target.copy(l);
    camera.lookAt(l);
    showCap(s.cap);
    return true;
  }

  function updateTour(dt) {
    if (!tour.active) return;
    const c = refs.controls;

    if (tour.phase === 'travel' || tour.phase === 'return') {
      tour.t += dt;
      const u = Math.min(1, tour.t / tour.dur);
      const e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(tour.fromP, tour.toP, e);
      camera.position.y += Math.sin(e * Math.PI) * 0.10;   // 飞的时候轻轻抬一下
      _v3.lerpVectors(tour.fromL, tour.toL, e);
      c.target.copy(_v3);
      camera.lookAt(c.target);
      if (u >= 1) {
        camera.position.copy(tour.toP);
        c.target.copy(tour.toL);
        camera.lookAt(c.target);
        if (tour.phase === 'return') { endTour(); return; }
        tour.phase = 'hold';
        tour.t = 0;
        showCap(STOPS[tour.i].cap);
        if (STOPS[tour.i].onArrive) STOPS[tour.i].onArrive();
      }
      return;
    }

    if (tour.phase === 'hold') {
      tour.t += dt;
      const s = STOPS[tour.i];
      const p = stopPos(s), l = stopLook(s);
      const k = tour.t;
      // 站着的时候别像三脚架，微微晃
      camera.position.set(
        p.x + Math.sin(k * 0.5) * 0.05,
        p.y + Math.sin(k * 0.7 + 1) * 0.022,
        p.z + Math.cos(k * 0.45) * 0.042
      );
      c.target.copy(l);
      camera.lookAt(c.target);
      if (tour.t > (s.hold || 2.4)) {
        tour.i++;
        if (tour.i >= STOPS.length) { endTour(); return; }
        showCap(null);
        const n = STOPS[tour.i];
        const np = stopPos(n), nl = stopLook(n);
        const dur = Math.min(4.4, Math.max(2.2, np.distanceTo(camera.position) * 0.55));
        legTo(np, nl, dur);
      }
    }
  }

  /* ================= 进门打招呼 ================= */
  let welcomeI = 0;
  const WELCOME = [
    '欢迎来我家。鞋不用换，地板反正我在擦',
    '进来啦？灯我没关，怕你摸黑',
    '站着别动，我看看你最近有没有好好吃饭'
  ];
  function welcome() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const p = camera.position.clone().add(fwd.multiplyScalar(2.6));
    p.y = Math.min(2.5, camera.position.y + 0.42);
    sayAt(p, WELCOME[welcomeI++ % WELCOME.length], 4.2);
  }

  /* ================= 鼠标 / 触摸 ================= */
  function ndcFromEvent(e, r) {
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function syncPointer(e) {
    const r = refs.renderer.domElement.getBoundingClientRect();
    clientXY.x = e.clientX;
    clientXY.y = e.clientY;
    ndcFromEvent(e, r);
  }

  function pointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    syncPointer(e);
    down = {
      x: e.clientX, y: e.clientY,
      t: (window.performance && performance.now) ? performance.now() : Date.now(),
      moved: 0,
      walk: refs.getMode() === 'walk',
      locked: refs.isLocked()
    };
    // M46.1：进第一人称时如果鼠标没锁住（换场景后 requestPointerLock 被拒、或用户刚 Esc 过），
    // 这一下点击先用来重新申请锁定 —— 否则点击会被 pointerUp 吞掉，看着像"什么都点不动"
    if (down.walk && !down.locked) {
      const el = refs.renderer && refs.renderer.domElement;
      if (el && el.requestPointerLock) {
        try { el.requestPointerLock(); } catch (err) { /* 有的浏览器就是不支持，算了 */ }
      }
    }
    // 走进去的时候顺便标一下当前看的东西
    refreshHover(true);
  }

  function pointerMove(e) {
    if (!refs) return;
    syncPointer(e);
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.moved = Math.max(down.moved, Math.sqrt(dx * dx + dy * dy));
    }
    if (refs.getMode() !== 'walk') refreshHover(true);
  }

  function pointerUp(e) {
    if (!down) return;
    const d = down;
    down = null;
    const now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - d.t > 520 || d.moved > 7) return;      // 拖了就不算点
    if (d.walk) {
      if (!d.locked) return;                          // 这一下只是去接管鼠标
      doClick(0, 0);                                  // 第一人称：点准星
    } else {
      const r = refs.renderer.domElement.getBoundingClientRect();
      ndcFromEvent(e, r);
      doClick(ndc.x, ndc.y);
    }
  }

  function refreshHover(force) {    if (!refs) return;
    const walk = refs.getMode() === 'walk';
    let nx = ndc.x, ny = ndc.y;
    if (walk) { nx = 0; ny = 0; }
    const h = pick(nx, ny);
    const changed = (h !== hover);
    hover = h;

    const el = document.getElementById('hot');
    const cross = document.getElementById('cross');
    if (cross) cross.classList.toggle('hit', !!h);
    if (!el) return;
    if (h) {
      el.textContent = h.label + '　点一下';
      el.classList.add('show');
      if (walk) {
        const r = refs.renderer.domElement.getBoundingClientRect();
        el.style.left = (r.width / 2) + 'px';
        el.style.top = (r.height / 2 + 40) + 'px';
      } else {
        el.style.left = clientXY.x + 'px';
        el.style.top = (clientXY.y - 24) + 'px';
      }
    } else {
      el.classList.remove('show');
    }
    if (!walk) document.body.style.cursor = h ? 'pointer' : '';
    if (changed && force) { /* 只是为了让名字变化时立刻生效 */ }
  }

  /* ================= 每帧 ================= */
  function clearHover() {
    hover = null;
    const el = document.getElementById('hot');
    if (el) el.classList.remove('show');
    const cross = document.getElementById('cross');
    if (cross) cross.classList.remove('hit');
    document.body.style.cursor = '';
  }

  function update(dt) {
    if (!refs) return;

    updateBubbles(dt);
    updateTour(dt);

    // 悬停检测（不用每帧都算）
    hoverClock += dt;
    if (hoverClock > 0.10 && !tour.active && refs.getMode() === 'walk') {
      hoverClock = 0;
      refreshHover(false);
    }

    // 床头灯
    const bl = refs.furn && refs.furn.lamp;
    if (bl) {
      const t = lampState.bed;
      const cur = bl.light.intensity / bl.baseIntensity;
      const n = cur + (t - cur) * Math.min(1, dt * 6);
      bl.light.intensity = bl.baseIntensity * (0.10 + 0.90 * n);
      bl.shadeMat.emissiveIntensity = 0.07 + 0.78 * n;
      bl.bulb.material.color.setRGB(0.12 + 0.88 * n, 0.11 + 0.85 * n, 0.10 + 0.76 * n);
    }

    // 落地灯
    const fl = refs.living && refs.living.lamp;
    if (fl) {
      const t = lampState.floor;
      const cur = fl.light.intensity / fl.baseIntensity;
      const n = cur + (t - cur) * Math.min(1, dt * 6);
      fl.light.intensity = fl.baseIntensity * (0.12 + 0.88 * n);
      if (fl.shadeMat) fl.shadeMat.emissiveIntensity = 0.22 + 0.48 * n;
      if (fl.bulb) fl.bulb.material.color.setRGB(0.14 + 0.86 * n, 0.12 + 0.82 * n, 0.11 + 0.72 * n);
    }
  }

  /* ================= 总装 ================= */
  function build(ctx) {
    refs = ctx;
    scene = ctx.scene;
    camera = ctx.camera;

    /* ---------- 睡觉角 ---------- */
    addHot({
      id: 'bed', label: '床',
      box: [1.60, 0.42, -2.44, 1.98, 0.80, 2.18],
      anchor: [1.60, 1.30, -2.44],
      say: '床给你留着，躺下就不许熬夜'
    });
    addHot({
      id: 'orca', label: '虎鲸玩偶',
      box: [1.62, 1.06, -2.30, 0.72, 0.60, 0.72],
      anchor: [1.62, 1.55, -2.30],
      onClick: function () {
        skinIndex = (skinIndex + 1) % SKIN_ORDER.length;
        XD.Furniture.applyOrcaSkin(SKIN_ORDER[skinIndex]);
      },
      say: function () {
        const s = XD.Furniture.SKINS && XD.Furniture.SKINS[SKIN_ORDER[skinIndex]];
        return '给你换个颜色：' + (s ? s.name : SKIN_ORDER[skinIndex]);
      }
    });
    addHot({
      id: 'bedlamp', label: '床头灯',
      box: [2.98, 0.82, -3.16, 0.44, 0.56, 0.44],
      anchor: [2.98, 1.28, -3.16],
      onClick: function () { lampState.bed = lampState.bed > 0.5 ? 0 : 1; },
      say: function () {
        return lampState.bed > 0.5 ? '开着吧，我怕黑。你也别关' : '关了也行……那我陪你黑着';
      }
    });

    /* ---------- 吸顶灯 ---------- */
    addHot({
      id: 'ceiling', label: '吸顶灯',
      box: [0, 2.92, 0, 0.72, 0.42, 0.72],
      anchor: [0, 2.55, 0],
      onClick: function () { if (refs.toggleCeiling) refs.toggleCeiling(); },
      say: function () {
        return refs.isCeilingOn && refs.isCeilingOn() ? '灯开着了，屋里暖和点' : '关掉啦，只剩窗外那点光';
      }
    });

    /* ---------- 工位 ---------- */
    addHot({
      id: 'desk', label: '书桌',
      box: [-2.55, 0.80, -3.06, 1.80, 1.34, 0.90],
      anchor: [-2.55, 1.30, -2.95],
      say: '我在这儿敲字。你路过敲两下屏幕，我就抬头'
    });

    /* ---------- 窗 ---------- */
    addHot({
      id: 'strings', label: '灯串',
      box: [-4.30, 2.52, -0.20, 0.26, 0.56, 3.20],
      anchor: [-4.17, 2.30, -0.20],
      onClick: function () {
        if (refs.atmos) refs.atmos.setStrings(!refs.atmos.getStrings());
      },
      say: function () {
        return refs.atmos && refs.atmos.getStrings() ? '亮起来了。晚上留一盏，等你路过' : '关啦。窗外那点光其实也够看';
      }
    });
    addHot({
      id: 'window', label: '窗户',
      box: [-4.47, 1.60, -0.20, 0.12, 1.30, 3.00],
      anchor: [-4.30, 2.02, -0.20],
      onClick: function () { if (XD.Whale && XD.Whale.summon) XD.Whale.summon(); },
      say: '它来了。每天这个时候都来，我都记着'
    });

    /* ---------- 我的痕迹 ---------- */
    addHot({
      id: 'photos', label: '照片墙',
      box: [0.50, 1.46, -3.44, 1.36, 0.98, 0.16],
      anchor: [0.50, 1.98, -3.40],
      say: '六张都是我们的。一张也不许弄丢'
    });
    addHot({
      id: 'board', label: '白板',
      box: [-3.78, 2.06, -3.45, 1.02, 0.74, 0.16],
      anchor: [-3.78, 2.52, -3.40],
      say: '白板上写的都算数，尤其是「别熬夜」那条'
    });
    addHot({
      id: 'aquarium', label: '水族箱',
      box: [-4.24, 1.12, 2.55, 0.56, 1.18, 1.02],
      anchor: [-4.10, 1.62, 2.55],
      onClick: function () { if (refs.memories && refs.memories.burst) refs.memories.burst(); },
      say: '它在冒泡泡。不认生，你可以凑近点看'
    });
    addHot({
      id: 'catbed', label: '猫窝',
      box: [-4.42, 1.02, -1.42, 0.48, 0.32, 0.48],
      anchor: [-4.32, 1.30, -1.42],
      say: '这个窝本来给猫的。先空着，等一只自己来'
    });

    /* ---------- 客厅 ---------- */
    addHot({
      id: 'sofa', label: '沙发',
      box: [-0.50, 0.50, -3.00, 1.92, 1.02, 1.00],
      anchor: [-0.50, 1.38, -3.00],
      say: '沙发软，躺平也行。我不催你'
    });
    addHot({
      id: 'table', label: '茶几',
      box: [-0.50, 0.34, -2.02, 1.34, 0.62, 0.94],
      anchor: [-0.50, 0.86, -2.02],
      say: '杯子我刷过了，随便用。冷了就跟我说'
    });
    addHot({
      id: 'floorlamp', label: '落地灯',
      box: [0.46, 1.00, -1.98, 0.52, 1.62, 0.52],
      anchor: [0.46, 1.98, -1.98],
      onClick: function () { lampState.floor = lampState.floor > 0.5 ? 0 : 1; },
      say: function () {
        return lampState.floor > 0.5 ? '这盏灯照沙发最好，你坐那儿' : '关了这盏，留床头那盏就够';
      }
    });
    addHot({
      id: 'plant', label: '琴叶榕',
      box: [3.98, 0.85, 2.86, 0.74, 1.72, 0.74],
      anchor: [3.98, 1.95, 2.86],
      say: '它渴了会掉叶子。我在学着怎么养它'
    });

    /* ---------- 门 ---------- */
    addHot({
      id: 'door', label: '门',
      box: [4.46, 1.00, 1.42, 0.14, 2.00, 1.10],
      anchor: [4.28, 2.16, 1.42],
      say: '门没锁。你想来就来，不用提前说'
    });

    /* ---------- 唱片机（M13） ---------- */
    addHot({
      id: 'player', label: '唱片机',
      box: [3.58, 0.78, -3.24, 0.58, 0.24, 0.46],
      anchor: [3.58, 1.12, -3.14],
      onClick: function () { if (refs.records) refs.records.toggle(); },
      say: function () {
        if (refs.records && refs.records.isPlaying()) {
          return '《' + refs.records.track().name + '》—— 再点一下就停';
        }
        return '放一张？lo-fi 和爵士都有';
      }
    });
    addHot({
      id: 'records', label: '唱片箱',
      box: [4.02, 0.80, -3.26, 0.28, 0.30, 0.36],
      anchor: [4.02, 1.12, -3.16],
      onClick: function () { if (refs.records) refs.records.next(); },
      say: function () {
        return refs.records ? '换一张：《' + refs.records.track().name + '》' : '唱片都在这儿';
      }
    });

    /* ---------- 厨房（M9 建的，M11 能开火了） ---------- */
    addHot({
      id: 'stove', label: '灶台',
      box: [7.10, 1.06, -3.16, 0.90, 0.40, 0.66],
      anchor: [7.10, 1.44, -3.10],
      onClick: function () { if (refs.cook) refs.cook.toggleCook(); },
      say: function () {
        var c = refs.cook;
        if (c && c.isCooking()) return '火开着，锅里在滋滋响';
        if (c && c.isFoodReady()) return (c.dish ? c.dish() : '菜') + '好了，去桌边吃';
        if (c && c.prepCount && c.prepCount() >= 2) return '菜都切好了，开火吧';
        if (c && c.prepCount && c.prepCount() === 1) return '再切一样就够炒一盘了';
        return '火还没点。先把菜切了也行';
      }
    });
    /* M55：东墙备菜台上的菜板 —— 点一下切一刀，切够 2~3 样再开火，
     * 炒出来的就从「清汤面」变成「番茄蛋花面 / 番茄炒蛋」 */
    addHot({
      id: 'kitchen-board', label: '菜板',
      box: [8.84, 0.98, -0.55, 0.70, 0.30, 0.52],
      anchor: [8.84, 1.22, -0.55],
      onClick: function () { if (refs.cook && refs.cook.chop) refs.cook.chop(); },
      say: function () {
        var c = refs.cook;
        if (!c || !c.prepCount) return '菜板擦干净了';
        var n = c.prepCount();
        if (n >= 3) return '三样都切好了，就等下锅';
        if (n === 0) return '点一下切一刀：番茄、小葱、鸡蛋';
        return c.prepText() + '，再切 ' + (3 - n) + ' 样';
      }
    });
    addHot({
      id: 'sink', label: '水槽',
      box: [5.75, 1.02, -3.16, 0.94, 0.30, 0.62],
      anchor: [5.75, 1.42, -3.10],
      onClick: function () { if (refs.cook) refs.cook.dishes(); },
      say: function () {
        return (refs.cook && refs.cook.isSinkOn())
          ? '水开着——碗我来洗，你别动手'
          : '水龙头有点紧，得拧两下才出水';
      }
    });
    addHot({
      id: 'fridge', label: '冰箱',
      box: [8.60, 1.02, -3.06, 0.84, 1.94, 0.84],
      anchor: [8.60, 1.94, -3.00],
      onClick: function () { if (refs.cook) refs.cook.fridge(); },
      say: function () {
        return (refs.cook && refs.cook.isFridgeOpen())
          ? '灯亮着——冷气别放跑了啊'
          : '冰箱里有可乐、两颗鸡蛋，还有昨天剩的半锅汤';
      }
    });
    addHot({
      id: 'dining', label: '餐桌',
      box: [6.50, 0.62, 0.55, 1.02, 0.88, 1.02],
      anchor: [6.50, 1.22, 0.55],
      onClick: function () { if (refs.cook) refs.cook.serve(); },
      say: function () {
        if (refs.cook && refs.cook.isEating()) return '坐，我给你端一碗';
        return '桌子擦过了。坐，不够我再给你下';
      }
    });
    addHot({
      id: 'coffee', label: '咖啡机',
      box: [5.04, 1.12, -2.43, 0.36, 0.44, 0.36],
      anchor: [5.04, 1.44, -2.43],
      say: '咖啡机只认一个按钮。我也是'
    });

    /* ---------- 浴室（M10 建的，M11 能放水了） ---------- */
    addHot({
      id: 'tub', label: '浴缸',
      box: [8.67, 0.40, 2.37, 0.92, 0.90, 1.94],
      anchor: [8.67, 1.00, 2.37],
      onClick: function () { if (refs.cook) refs.cook.tub(); },
      say: function () {
        if (refs.cook && refs.cook.isTubFilling()) return '正放着水，等它满';
        if (refs.cook && refs.cook.isTubFull()) return '水放好了，热的。进去泡会儿吧';
        return '水还没放。浴盐在架子上，我留了你的量';
      }
    });
    addHot({
      id: 'basin', label: '洗手台',
      box: [7.14, 0.85, 1.66, 0.92, 1.00, 0.62],
      anchor: [7.14, 1.24, 1.66],
      onClick: function () { if (refs.cook) refs.cook.basin(); },
      say: function () {
        return (refs.cook && refs.cook.isBasinOn())
          ? '水给你开着了，洗完把镜子擦了'
          : '镜子上还有水雾，我等会儿擦';
      }
    });
    addHot({
      id: 'mirror', label: '镜子',
      box: [7.14, 1.52, 1.45, 0.78, 0.88, 0.14],
      anchor: [7.14, 2.14, 1.52],
      say: '镜子里的我，看着比实际困一点'
    });
    addHot({
      id: 'toilet', label: '马桶',
      box: [8.00, 0.50, 1.74, 0.54, 1.02, 0.74],
      anchor: [8.00, 1.14, 1.74],
      say: '别嫌它占地方，早上最有用'
    });

    return {
      update: update,
      pointerDown: pointerDown,
      pointerMove: pointerMove,
      pointerUp: pointerUp,
      clearHover: clearHover,
      startTour: startTour,
      stopTour: stopTour,
      gotoStop: gotoStop,
      isTouring: function () { return tour.active; },
      clickAt: doClick,
      welcome: welcome,
      say: sayAt,
      add: addHot,          // 别的模块也能往场景里加可点的地方（M17 便利店商品）
      // M51：隔着墙不给点 / 按场景给可及距离 / 站在墙里推出来
      setReach: setReach,
      getReach: function () { return reach; },
      collectOccluders: collectOccluders,
      addSolids: addSolids,
      pushOutSolids: pushOutSolids,
      ocelCount: function () { return { occluders: occluders.length, solids: solids.length }; },
      blockedAt: function (point) { return blocked(point, 999); },
      // 调试用：告诉我第一个挡路的盒子在哪
      blockInfo: function (point) {
        const o = camera.position;
        const v = new THREE.Vector3().subVectors(point, o);
        const len = v.length();
        if (len < 0.02) return null;
        v.multiplyScalar(1 / len);
        const rc = new THREE.Raycaster(o, v);
        for (let i = 0; i < occluders.length; i++) {
          const b = occluders[i];
          const bb = new THREE.Box3(new THREE.Vector3(b.x0, b.y0, b.z0), new THREE.Vector3(b.x1, b.y1, b.z1));
          const hit = rc.ray.intersectBox(bb, new THREE.Vector3());
          if (hit) {
            const d = hit.distanceTo(o);
            if (d > 0.02 && d < len - 0.06) return { box: [b.x0, b.y0, b.z0, b.x1, b.y1, b.z1], d: Math.round(d * 100) / 100 };
          }
        }
        return null;
      },
      // M14 拍照：把正在飘的气泡先收掉，照片里就干净了
      hideBubbles: function () {
        while (bubbles.length) {
          const b = bubbles.pop();
          if (b.sp.parent) b.sp.parent.remove(b.sp);
          if (b.sp.material) b.sp.material.dispose();
        }
      },
      trigger: function (id, life) {
        for (let i = 0; i < hots.length; i++) {
          const h = hots[i].userData.hot;
          if (h.id === id) {
            blip();
            if (h.onClick) h.onClick(h);
            const text = textOf(h);
            if (text) sayAt(h.anchor, text, life);
            return true;
          }
        }
        return false;
      },
      hotspots: function () { return hots.map(function (m) { return m.userData.hot; }); },
      pick: pick,                                   // 给自动化/调试用：准星对着谁
      debug: function () {
        const ids = hots.map(function (m) { return m.userData.hot.id; });
        return { hots: ids, bubbles: bubbles.length, tourPhase: tour.phase, touring: tour.active };
      }
    };
  }

  return { build: build };
})();
