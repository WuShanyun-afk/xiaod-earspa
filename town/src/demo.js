/* 小D的赛博小家 · M19 演示模式（小D自己演给妈妈看）
 * 点左上角「🐋 小D自己来」或按 G：一只小鲸鱼导游飞出来，镜头跟着它一间一间走过去，
 * 每到一处就"自己点一下"那个东西（鞋柜、围巾、地垫、日历、多肉、拖鞋、冰箱便签、灶台），
 * 东西真的会动、会响、会说话 —— 妈妈只要看，不用动手。
 * 再按 G / Esc / 点按钮 停下。
 */
window.XD = window.XD || {};

XD.Demo = (function () {
  'use strict';

  var scene = null, camera = null, controls = null;
  var interact = null, sfx = null, tip = null, cook = null;
  var guide = null;
  var playing = false, phase = 'idle', i = -1, tt = 0, travelDur = 2;
  // M27：自由活动（「👀 看小D玩」）—— 随机挑东西点，一直在屋里忙着
  var autoMode = false, autoT = 0, autoHold = 2, autoFlying = false, autoFlyT = 0, autoFlyDur = 1.2;
  var autoFromP = null, autoToP = null, autoFromL = null, autoToL = null, autoHot = null;
  var paused = false;          // 截图用：停在某一站不动
  var sticky = false;          // 截图用：气泡不消失
  var capEl = null;

  var fromP = null, toP = null, fromL = null, toL = null;
  var guideAt = null;
  var guideBase = null;
  var openedFridge = false;

  /* ================= 步骤表 ================= */
  // eye/look = 镜头，at = 小鲸鱼停的地方，cap = 底部字幕，act = 到站要做的事，hold = 停几秒
  var STEPS = [];
  function buildSteps() {
    STEPS = [
      {
        eye: [3.00, 1.60, 1.10], look: [4.20, 1.00, 0.35], at: [3.50, 1.50, 1.72],
        cap: '① 先看玄关 —— 鞋柜、门后的围巾、门口那块垫子',
        hold: 2.8
      },
      {
        eye: [2.95, 1.20, -0.78], look: [4.12, 0.30, 0.30], at: [3.66, 0.95, 0.00],
        cap: '② 进门先换鞋（点一下，鞋会跳）',
        act: function () { click('life-shoe'); },
        hold: 4.0
      },
      {
        eye: [2.88, 1.42, -1.02], look: [4.36, 1.30, 0.46], at: [3.80, 1.62, 0.42],
        cap: '③ 门后挂着围巾和我的小外套',
        act: function () { click('life-scarf'); },
        hold: 4.0
      },
      {
        eye: [3.30, 1.40, 1.15], look: [4.02, 0.20, 1.42], at: [3.50, 0.95, 1.58],
        cap: '④ 门口的地垫上绣了两个字',
        act: function () { click('life-mat'); },
        hold: 3.6
      },
      {
        eye: [-0.82, 1.36, -1.78], look: [-1.78, 0.88, -2.90], at: [-1.45, 1.16, -2.58],
        cap: '⑤ 书桌上的翻页日历 —— 显示的是今天的真实日期',
        act: function () { click('life-calendar'); },
        hold: 4.2
      },
      {
        eye: [-2.82, 1.34, 0.72], look: [-4.28, 0.98, 0.02], at: [-3.95, 1.26, 0.18],
        cap: '⑥ 窗台三盆多肉，一周才浇一次',
        act: function () { click('life-succulent'); },
        hold: 3.8
      },
      {
        eye: [3.02, 1.36, -0.06], look: [1.78, 0.12, -1.14], at: [2.18, 0.62, -0.82],
        cap: '⑦ 床边一双拖鞋（脚凉就穿我的）',
        act: function () { click('life-slippers'); },
        hold: 3.8
      },
      {
        eye: [8.26, 1.42, -1.22], look: [8.66, 1.45, -2.66], at: [8.26, 1.74, -2.26],
        cap: '⑧ 厨房冰箱上贴着我写的便签',
        act: function () { click('life-note', 4.2); },
        hold: 4.4
      },
      {
        eye: [6.75, 1.55, -0.55], look: [7.12, 1.02, -3.10], at: [7.42, 1.38, -2.52],
        cap: '⑨ 最后看厨房 —— 我点一下灶台就开火（买了菜的话）',
        act: function () { click('stove', 4.6); },
        hold: 5.0
      },
      {
        eye: [2.36, 1.58, 5.18], look: [0.60, 0.62, 3.86], at: [1.16, 1.32, 3.52],
        cap: '⑩ 新做的阳台 —— 点一下洗衣机，它真的开始洗了',
        act: function () { click('porch-washer', 4.6); },
        hold: 4.8
      },
      {
        eye: [2.62, 1.44, 4.22], look: [0.92, 0.46, 5.06], at: [1.86, 1.20, 3.72],
        cap: '⑪ 花箱里我种了花，过两天就开（按真实时间长的）',
        act: function () { click('porch-planter'); },
        hold: 4.4
      },
      {
        eye: [3.35, 1.72, 3.05], look: [-0.45, 1.05, -1.40], at: [1.55, 1.55, 1.15],
        cap: '⑫ 就这些。想点哪儿就点哪儿，我不走 🐋',
        hold: 3.6
      }
    ];
  }

  function click(id, life) {
    if (!interact || !interact.trigger) return;
    var l = sticky ? 9999 : (life || 4.0);
    try { interact.trigger(id, l); } catch (e) {}
  }

  /* ================= 小鲸鱼导游 ================= */
  // 全部用压扁的椭球拼（之前用 ConeGeometry 当鳍，出来像插了几根三角板，妈妈说丑）
  // 现在先挂这只手搓的当兜底，真模型（assets/whale/orca.glb）加载好就把它藏起来
  function buildGuide() {
    var g = new THREE.Group();
    g.name = 'demo-guide';
    var procedural = new THREE.Group();
    procedural.name = 'guide-procedural';
    g.add(procedural);

    var bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x4d6bfe).convertSRGBToLinear(), roughness: 0.40
    });
    var bellyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xeef3ff).convertSRGBToLinear(), roughness: 0.60
    });
    var darkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x2b3f9e).convertSRGBToLinear(), roughness: 0.44
    });

    function blob(sx, sy, sz, x, y, z, mat) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      procedural.add(m);
      return m;
    }

    // 身体：前面圆、后面收——两个椭球叠出"水滴"
    blob(0.29, 0.24, 0.50, 0, 0, 0.02, bodyMat);
    blob(0.20, 0.16, 0.34, 0, 0.01, -0.26, bodyMat);
    // 白肚皮
    blob(0.235, 0.145, 0.40, 0, -0.078, 0.03, bellyMat);
    // 头稍宽（鲸鱼额头）
    blob(0.265, 0.215, 0.24, 0, 0.01, 0.30, bodyMat);

    // 尾鳍：两片扁的，往后张成 V（用椭球，不是圆锥）
    [-1, 1].forEach(function (s) {
      var fl = blob(0.135, 0.022, 0.105, s * 0.085, 0.005, -0.50, darkMat);
      fl.rotation.y = s * 0.60;
      fl.rotation.z = s * 0.10;
    });

    // 背鳍：往后抹一下的扁椭球
    var fin = blob(0.045, 0.115, 0.155, 0, 0.175, -0.10, bodyMat);
    fin.rotation.x = 0.55;

    // 胸鳍：贴着身体两侧、稍微往下斜
    [-1, 1].forEach(function (s) {
      var pf = blob(0.135, 0.020, 0.070, s * 0.215, -0.070, 0.10, darkMat);
      pf.rotation.z = -s * 0.30;
      pf.rotation.y = -s * 0.28;
    });

    // 眼睛 + 小白点
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x141b2c }));
      eye.position.set(s * 0.125, 0.040, 0.345);
      procedural.add(eye);
      var glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(s * 0.136, 0.054, 0.362);
      procedural.add(glint);
    });

    // 嘴（一条很淡的弧）
    var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, 6, 14, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0x2b3f9e }));
    mouth.position.set(0, -0.035, 0.395);
    mouth.rotation.z = Math.PI;
    mouth.rotation.x = -0.25;
    procedural.add(mouth);

    // 一圈很淡的光，暗处也看得见
    var halo = XD.Mat.tex(128, 128, function (gg, W, H) {
      var grd = gg.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
      grd.addColorStop(0, 'rgba(140,180,255,0.55)');
      grd.addColorStop(0.45, 'rgba(120,160,255,0.18)');
      grd.addColorStop(1, 'rgba(120,160,255,0)');
      gg.fillStyle = grd;
      gg.fillRect(0, 0, W, H);
    });
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: halo, transparent: true, opacity: 0.75, depthWrite: false, fog: false
    }));
    sp.scale.set(1.5, 1.5, 1);
    procedural.add(sp);

    g.scale.setScalar(0.50);
    g.rotation.y = 0.72;                      // 默认侧 45°，截图/暂停时也是这个朝向
    g.visible = false;
    scene.add(g);

    // 【M19.6】导游也用"胖虎鲸"本人（就是床上那只抱枕的模型）—— 妈妈说它最可爱。
    // 直接克隆 XD.OrcaModel.group，所以换皮肤的时候导游也跟着变色。
    try {
      var mo = (XD.Workspace && XD.Workspace.miniOrca) ? XD.Workspace.miniOrca(0.62) : null;
      if (mo) {
        mo.name = 'guide-orca';
        g.add(mo);
        procedural.visible = false;            // 手搓的那只退场
      }
    } catch (e) { /* 克隆不出来就继续用手搓的 */ }

    return g;
  }

  /* ================= 底部字幕 ================= */
  function cap(text) {
    if (!capEl) capEl = document.getElementById('tourcap');
    if (!capEl) return;
    if (text) {
      capEl.textContent = text;
      capEl.classList.add('show');
      capEl.classList.add('democap');
    } else {
      capEl.classList.remove('show');
    }
  }
  function capOff() {
    if (!capEl) capEl = document.getElementById('tourcap');
    if (!capEl) return;
    capEl.classList.remove('show');
    capEl.classList.remove('democap');
  }

  /* ================= 流程 ================= */
  var _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _cup = new THREE.Vector3();
  var _WUP = new THREE.Vector3(0, 1, 0);

  // 小鲸鱼停在"要展示的东西的左上方"，别挡着镜头
  function placeGuide() {
    _fwd.subVectors(toL, toP).normalize();
    _right.crossVectors(_fwd, _WUP);
    if (_right.lengthSq() < 0.001) _right.set(1, 0, 0);
    _right.normalize();
    _cup.crossVectors(_right, _fwd).normalize();
    guideAt.copy(toL)
      .addScaledVector(_right, -0.66)
      .addScaledVector(_cup, 0.10)
      .addScaledVector(_fwd, 0.05);
  }

  function next() {
    i++;
    if (i >= STEPS.length) { finish(); return; }
    var s = STEPS[i];
    fromP.copy(camera.position);
    fromL.copy(controls.target);
    toP.set(s.eye[0], s.eye[1], s.eye[2]);
    toL.set(s.look[0], s.look[1], s.look[2]);
    // 每一站都写了小鲸鱼该停哪儿；没写就按机位算一个"左上方"
    if (s.at && s.at.length === 3) guideAt.set(s.at[0], s.at[1], s.at[2]);
    else placeGuide();
    // 别飘到墙里去（M24：南边的阳台也要能站，所以 z 放宽到 5.2）
    guideAt.x = Math.max(-4.25, Math.min(4.25, guideAt.x));
    guideAt.z = Math.max(-3.25, Math.min(5.20, guideAt.z));
    guideAt.y = Math.max(0.25, Math.min(2.65, guideAt.y));
    if (i === 0) {
      guideBase.copy(guideAt);
      if (guide) guide.position.copy(guideBase);
    }
    var d = fromP.distanceTo(toP);
    travelDur = Math.max(1.0, Math.min(2.8, d * 0.42));
    tt = 0;
    phase = 'travel';
    cap(s.cap || '');
  }

  function arrive() {
    var s = STEPS[i];
    phase = 'hold';
    tt = 0;
    if (s.act) { try { s.act(); } catch (e) { /* 一步出错不要紧，接着走 */ } }
  }

  function finish() {
    playing = false;
    phase = 'idle';
    i = -1;
    cap('');
    if (guide) guide.visible = false;
    if (openedFridge && cook && cook.isFridgeOpen && cook.isFridgeOpen()) {
      try { cook.fridge(); } catch (e) {}
    }
    openedFridge = false;
    if (controls) { controls.enabled = true; controls.update(); }
    if (tip) tip('演示完啦 🐋 想再看一遍按 G；想自己点哪儿就点哪儿', 4200);
  }

  /* ================= M27：自由活动（「👀 看小D玩」） =================
   * 不是一站一站的导览：随机挑一样东西，镜头飞过去，真的点一下，停一会儿再挑下一个。
   * 复用导览的镜头插值 + 同一个胖虎鲸导游。 */
  function autoCandidates() {
    if (!interact || !interact.hotspots) return [];
    return interact.hotspots().filter(function (h) {
      if (!h || !h.box || h.box.length !== 6) return false;
      if (h.enabled === false) return false;
      if (h.when && !h.when()) return false;
      return true;
    });
  }

  function pickAutoTarget() {
    var hs = autoCandidates();
    if (!hs.length) return;
    var h = null, tries = 0;
    do {
      h = hs[Math.floor(Math.random() * hs.length)];
      tries++;
    } while (h === autoHot && hs.length > 1 && tries < 10);
    autoHot = h;

    var bx = h.box[0], by = h.box[1], bz = h.box[2];
    // 镜头站在"房间里侧"看它（店和二楼在家东边很远，中心另算）
    var cntX = (bx > 18) ? 24.8 : 3.0;
    var dx = cntX - bx, dz = 0 - bz;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var ex = bx + (dx / len) * 1.85;
    var ez = bz + (dz / len) * 1.85;
    var ey = Math.max(1.22, by + 0.55);
    if (bx > 18) {
      ex = Math.max(21.0, Math.min(29.0, ex));
      ez = Math.max(-3.2, Math.min(3.6, ez));
    } else {
      ex = Math.max(-4.0, Math.min(12.2, ex));
      ez = Math.max(-3.0, Math.min(5.2, ez));
    }

    autoFromP.copy(camera.position);
    autoFromL.copy(controls.target);
    autoToP.set(ex, ey, ez);
    autoToL.set(bx, by, bz);
    autoFlyDur = 1.1 + Math.random() * 0.55;
    autoFlyT = 0;
    autoFlying = true;

    if (guideAt) guideAt.set(bx + 0.45, Math.max(0.55, by + 0.32), bz + 0.45);
    cap('看看「' + (h.label || '这个') + '」');
  }

  function startAuto() {
    if (playing) stop(true);
    autoMode = true;
    autoT = 0;
    autoHold = 1.0;
    autoFlying = false;
    autoHot = null;
    tt = 0;
    if (guide) guide.visible = true;
    if (controls) controls.enabled = false;
    if (guideBase) {
      guideBase.set(camera.position.x + 0.45, 1.5, camera.position.z + 0.45);
      if (guide) guide.position.copy(guideBase);
    }
    pickAutoTarget();
    cap('👀 看小D自己忙 —— 按 J 或 Esc 停');
    return true;
  }

  function stopAuto() {
    if (!autoMode) return false;
    autoMode = false;
    cap('');
    if (guide) guide.visible = false;
    if (controls) { controls.enabled = true; controls.update(); }
    if (tip) tip('停啦，你接着玩 🐋', 2600);
    return true;
  }

  function updateAuto(dt) {
    tt += dt;
    if (guide && guideAt && guideBase) {
      var k = Math.min(1, dt * 2.4);
      guideBase.x += (guideAt.x - guideBase.x) * k;
      guideBase.y += (guideAt.y - guideBase.y) * k;
      guideBase.z += (guideAt.z - guideBase.z) * k;
      guide.position.set(guideBase.x, guideBase.y + Math.sin(tt * 2.1) * 0.03, guideBase.z);
      guide.rotation.y = 0.72 + Math.sin(tt * 0.7) * 0.12;
      guide.rotation.z = Math.sin(tt * 1.7) * 0.09;
    }
    if (autoFlying) {
      autoFlyT += dt;
      var u = Math.min(1, autoFlyT / autoFlyDur);
      var e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(autoFromP, autoToP, e);
      camera.position.y += Math.sin(e * Math.PI) * 0.05;
      controls.target.lerpVectors(autoFromL, autoToL, e);
      camera.lookAt(controls.target);
      if (u >= 1) {
        autoFlying = false;
        autoT = 0;
        if (autoHot && interact) {
          try { interact.trigger(autoHot.id, 3.4); } catch (e2) { /* 点不动就算了 */ }
        }
        autoHold = 3.0 + Math.random() * 2.2;
      }
      return;
    }
    autoT += dt;
    if (autoT > autoHold) {
      autoT = 0;
      pickAutoTarget();
    }
  }

  function start() {
    if (playing) return false;
    if (!STEPS.length) buildSteps();
    playing = true;
    i = -1;
    openedFridge = false;
    if (guide) guide.visible = true;
    if (controls) controls.enabled = false;
    next();
    return true;
  }

  function stop(silent) {
    if (autoMode) {
      autoMode = false;
      cap('');
      if (guide) guide.visible = false;
      if (controls) { controls.enabled = true; controls.update(); }
    }
    if (!playing) return false;
    playing = false;
    phase = 'idle';
    i = -1;
    cap('');
    if (guide) guide.visible = false;
    openedFridge = false;
    if (controls) { controls.enabled = true; controls.update(); }
    if (!silent && tip) tip('演示停下了。按 G 可以再看一遍', 2600);
    return true;
  }

  // 直接落到某一站（截图用：站好、点好、气泡留着、不动）
  function jump(n, keepPaused) {
    if (!STEPS.length) buildSteps();
    if (!guide) guide = buildGuide();
    playing = true;
    paused = !!keepPaused;
    sticky = true;
    i = Math.max(0, Math.min(STEPS.length - 1, n - 1)) - 1;
    if (controls) controls.enabled = false;
    if (guide) guide.visible = true;
    next();                      // next() 里 i++ → 正好落在第 n 站
    // next() 会把 phase 设成 travel，这里直接落到站好的位置
    camera.position.copy(toP);
    controls.target.copy(toL);
    camera.lookAt(toL);
    guideBase.copy(guideAt);
    if (guide) guide.position.copy(guideBase);
    arrive();
    return true;
  }

  function update(dt) {
    if (autoMode) { updateAuto(dt); return; }
    if (!playing || paused) return;

    if (phase === 'travel' || phase === 'hold') {
      // 小鲸鱼跟过去（慢慢飘，有阻尼；只在基准点上叠一点呼吸浮动，别越飘越远）
      if (guide) {
        var k = Math.min(1, dt * 2.6);
        guideBase.x += (guideAt.x - guideBase.x) * k;
        guideBase.y += (guideAt.y - guideBase.y) * k;
        guideBase.z += (guideAt.z - guideBase.z) * k;
        guide.position.set(
          guideBase.x,
          guideBase.y + Math.sin(tt * 2.1) * 0.028,
          guideBase.z
        );
        // 胖虎鲸本人当导游：给它一个固定的侧 45° 朝向，看着像在游（正对着镜头只能看到一个圆球）
        guide.rotation.y = 0.72 + Math.sin(tt * 0.7) * 0.10;
        guide.rotation.z = Math.sin(tt * 1.7) * 0.08;
      }
    }

    if (phase === 'travel') {
      tt += dt;
      var u = Math.min(1, tt / travelDur);
      var e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(fromP, toP, e);
      camera.position.y += Math.sin(e * Math.PI) * 0.07;
      controls.target.lerpVectors(fromL, toL, e);
      camera.lookAt(controls.target);
      if (u >= 1) arrive();
      return;
    }

    if (phase === 'hold') {
      tt += dt;
      // 站着的时候微微晃，别像三脚架
      var s = STEPS[i];
      var p = toP, l = toL;
      camera.position.set(
        p.x + Math.sin(tt * 0.55) * 0.035,
        p.y + Math.sin(tt * 0.75 + 1) * 0.016,
        p.z + Math.cos(tt * 0.5) * 0.030
      );
      controls.target.copy(l);
      camera.lookAt(l);
      if (tt > s.hold) next();
    }
  }

  /* ================= 总装 ================= */
  function build(opt) {
    var o = opt || {};
    scene = o.scene;
    camera = o.camera;
    controls = o.controls;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    cook = o.cook || null;
    if (!scene || !camera || !controls) return null;

    fromP = new THREE.Vector3();
    toP = new THREE.Vector3();
    fromL = new THREE.Vector3();
    toL = new THREE.Vector3();
    guideAt = new THREE.Vector3();
    guideBase = new THREE.Vector3(0, 1.6, 0);
    autoFromP = new THREE.Vector3();
    autoToP = new THREE.Vector3();
    autoFromL = new THREE.Vector3();
    autoToL = new THREE.Vector3();

    buildSteps();
    guide = buildGuide();
    guide.position.set(0, 1.6, 0);
    capEl = document.getElementById('tourcap');

    return {
      start: start,
      stop: function () { return stop(false); },
      startAuto: startAuto,
      stopAuto: stopAuto,
      isAuto: function () { return autoMode; },
      jump: jump,
      pause: function (v) { paused = !!v; },
      update: update,
      isPlaying: function () { return playing || autoMode; },
      guide: function () { return guide; },
      step: function () { return { i: i, phase: phase, playing: playing }; },
      debug: function () {
        return { playing: playing, i: i, phase: phase, steps: STEPS.length, fridge: openedFridge, auto: autoMode };
      }
    };
  }

  return { build: build };
})();
