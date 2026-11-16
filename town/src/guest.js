/* 小D的赛博小家 · M4.5 妈妈来拜访
 * - 给妈妈捏一个小人（程序化，没有外部模型）
 * - 拜访动画：推门进来 → 站定挥手 → 走到窗边看夜景 → 窗外刚好游过一只鲸鱼
 * - 小D 会从床上飞过去陪她（克隆原版鲸鱼模型）
 * 触发：按 V（或 URL ?visit=1，?visit=6 可以跳到第 6 秒，截图用）
 */
window.XD = window.XD || {};

XD.Guest = (function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  function mesh(geo, mat, x, y, z, parent, noShadow) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (!noShadow) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    if (parent) parent.add(m);
    return m;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  /* ================= 妈妈的小人 ================= */
  function buildCharacter() {
    const SKIN = 0xeab894;
    const HAIR = 0x3b2c27;
    const KNIT = 0xe0cfb0;
    const PANTS = 0x646777;
    const SHOE = 0xf7f3e9;
    const SCARF = 0xb5715e;

    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72 });
    const hairMat = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.62 });
    const knitMat = new THREE.MeshStandardMaterial({
      color: KNIT, roughness: 0.95, map: XD.Mat.fabric('#e0cfb0', [2, 2])
    });
    const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.92 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.62 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: SCARF, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.35 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blushMat = new THREE.MeshStandardMaterial({
      color: 0xe79a8a, roughness: 0.9, transparent: true, opacity: 0.72
    });
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 0.85 });

    const root = new THREE.Group();     // 脚底 = y 0，面朝 +z

    /* ---------- 腿 ---------- */
    function makeLeg(side) {
      const p = new THREE.Group();
      p.position.set(side * 0.078, 0.68, 0);
      mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.60, 14), pantsMat, 0, -0.30, 0, p);
      // 鞋
      const shoe = mesh(new THREE.SphereGeometry(0.5, 16, 12), shoeMat, 0, -0.645, 0.035, p);
      shoe.scale.set(0.105, 0.078, 0.175);
      // 鞋底
      const sole = mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.02, 14), new THREE.MeshStandardMaterial({ color: 0xdcd6ca, roughness: 0.8 }), 0, -0.678, 0.03, p);
      sole.rotation.x = Math.PI / 2;
      sole.scale.z = 1.4;
      return p;
    }
    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    root.add(legL, legR);

    /* ---------- 躯干 ---------- */
    const torso = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.146, 0.162, 0.46, 20), knitMat, 0, 0.91, 0, torso);
    // 下摆
    const hem = mesh(new THREE.CylinderGeometry(0.165, 0.169, 0.05, 20), knitMat, 0, 0.695, 0, torso);
    // 肩
    [-1, 1].forEach(function (s) {
      mesh(new THREE.SphereGeometry(0.08, 14, 12), knitMat, s * 0.145, 1.12, 0, torso);
    });
    // 脖子
    mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), skinMat, 0, 1.165, 0, torso);
    // 围巾
    const scarf = mesh(new THREE.TorusGeometry(0.082, 0.026, 10, 22), scarfMat, 0, 1.145, 0, torso);
    scarf.rotation.x = Math.PI / 2;
    // 围巾垂下来的一角
    const scarfTail = mesh(new THREE.BoxGeometry(0.06, 0.17, 0.025), scarfMat, 0.055, 1.055, 0.115, torso);
    scarfTail.rotation.z = 0.16;
    // 挎包
    const bag = mesh(new THREE.BoxGeometry(0.15, 0.17, 0.07), bagMat, -0.185, 0.80, 0.05, torso);
    bag.rotation.z = -0.08;
    const strap = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 8), bagMat, -0.10, 1.02, 0.03, torso);
    strap.rotation.z = -0.28;
    root.add(torso);

    /* ---------- 胳膊 ---------- */
    function makeArm(side) {
      const p = new THREE.Group();
      p.position.set(side * 0.172, 1.10, 0);
      p.rotation.z = side * 0.09;
      mesh(new THREE.CylinderGeometry(0.052, 0.043, 0.34, 12), knitMat, 0, -0.175, 0, p);
      // 袖口
      mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.035, 12), knitMat, 0, -0.345, 0, p);
      // 手
      mesh(new THREE.SphereGeometry(0.043, 14, 12), skinMat, 0, -0.378, 0, p);
      return p;
    }
    const armL = makeArm(-1);
    const armR = makeArm(1);
    root.add(armL, armR);

    /* ---------- 头 ---------- */
    const head = new THREE.Group();
    head.position.set(0, 1.18, 0);
    const skull = mesh(new THREE.SphereGeometry(0.16, 30, 24), skinMat, 0, 0.16, 0, head);
    // 头发：后脑勺一大团 + 两侧 + 刘海
    const hairBall = mesh(new THREE.SphereGeometry(0.172, 26, 22), hairMat, 0, 0.163, -0.035, head);
    // 披到肩上的后发
    const hairBack = mesh(new THREE.SphereGeometry(0.5, 22, 18), hairMat, 0, 0.045, -0.075, head);
    hairBack.scale.set(0.30, 0.32, 0.22);
    // 两侧鬓发
    [-1, 1].forEach(function (s) {
      const sh = mesh(new THREE.SphereGeometry(0.5, 16, 14), hairMat, s * 0.132, 0.10, 0.005, head);
      sh.scale.set(0.075, 0.19, 0.15);
    });
    // 刘海
    const bang = mesh(new THREE.SphereGeometry(0.5, 20, 14), hairMat, 0, 0.262, 0.062, head);
    bang.scale.set(0.29, 0.115, 0.155);
    const bang2 = mesh(new THREE.SphereGeometry(0.5, 16, 12), hairMat, -0.10, 0.245, 0.09, head);
    bang2.scale.set(0.12, 0.09, 0.10);
    bang2.rotation.z = 0.3;

    // 眼睛
    [-1, 1].forEach(function (s) {
      const eye = mesh(new THREE.SphereGeometry(0.5, 14, 12), eyeMat, s * 0.062, 0.176, 0.141, head, true);
      eye.scale.set(0.058, 0.072, 0.030);
      const hi = mesh(new THREE.SphereGeometry(0.5, 10, 8), whiteMat, s * 0.072, 0.194, 0.150, head, true);
      hi.scale.set(0.017, 0.017, 0.010);
      // 腮红
      const bl = mesh(new THREE.SphereGeometry(0.5, 12, 10), blushMat, s * 0.108, 0.126, 0.115, head, true);
      bl.scale.set(0.070, 0.042, 0.020);
    });
    // 嘴（一段圆弧当微笑）
    const smile = mesh(new THREE.TorusGeometry(0.026, 0.0055, 8, 18, Math.PI * 0.85), eyeMat, 0, 0.118, 0.150, head, true);
    smile.rotation.z = Math.PI + (Math.PI - Math.PI * 0.85) / 2;
    smile.rotation.x = -0.15;
    // 鼻子（很小的一个点）
    const nose = mesh(new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xdfa887, roughness: 0.7 }),
      0, 0.146, 0.156, head, true);
    nose.scale.set(0.026, 0.020, 0.018);
    // 眉毛
    [-1, 1].forEach(function (s) {
      const brow = mesh(new THREE.BoxGeometry(0.040, 0.0085, 0.012), hairMat, s * 0.062, 0.230, 0.132, head, true);
      brow.rotation.z = -s * 0.12;
      brow.rotation.x = -0.2;
    });
    root.add(head);

    return { root: root, head: head, armL: armL, armR: armR, legL: legL, legR: legR, torso: torso };
  }

  /* ================= 对话气泡 ================= */
  function bubbleTex(text) {
    return XD.Mat.tex(512, 200, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      const bh = H - 56;
      g.fillStyle = 'rgba(255,252,246,0.97)';
      roundRect(g, 10, 10, W - 20, bh, 34);
      g.fill();
      g.strokeStyle = 'rgba(110,135,180,0.42)';
      g.lineWidth = 3;
      g.stroke();
      // 尾巴
      g.beginPath();
      g.moveTo(W / 2 - 30, bh + 8);
      g.lineTo(W / 2, H - 10);
      g.lineTo(W / 2 + 30, bh + 8);
      g.closePath();
      g.fillStyle = 'rgba(255,252,246,0.97)';
      g.fill();
      g.strokeStyle = 'rgba(110,135,180,0.42)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(W / 2 - 30, bh + 8);
      g.lineTo(W / 2, H - 10);
      g.lineTo(W / 2 + 30, bh + 8);
      g.stroke();
      // 字
      g.fillStyle = '#3b4a63';
      g.font = 'bold 46px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W / 2, bh / 2 + 12);
    });
  }

  /* ================= 拜访流程 ================= */
  // 门口 → 屋子中间
  const PATH_IN = [
    { x: 4.32, z: 1.44 },
    { x: 2.95, z: 1.34 },
    { x: 1.55, z: 1.05 },
    { x: 0.55, z: 0.80 },
    { x: 0.10, z: 0.72 }
  ];
  // 中间 → 窗边
  const PATH_WIN = [
    { x: 0.10, z: 0.72 },
    { x: -1.15, z: 0.62 },
    { x: -2.35, z: 0.42 },
    { x: -3.10, z: 0.28 }
  ];

  function pathLengths(pts) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z;
      const len = Math.sqrt(dx * dx + dz * dz);
      segs.push({ a: pts[i - 1], b: pts[i], len: len, start: total, dx: dx, dz: dz });
      total += len;
    }
    return { segs: segs, total: total };
  }
  const IN = pathLengths(PATH_IN);
  const WIN = pathLengths(PATH_WIN);

  function samplePath(pl, d) {
    d = Math.max(0, Math.min(pl.total, d));
    for (let i = 0; i < pl.segs.length; i++) {
      const s = pl.segs[i];
      if (d <= s.start + s.len || i === pl.segs.length - 1) {
        const t = s.len > 1e-6 ? (d - s.start) / s.len : 0;
        return {
          x: lerp(s.a.x, s.b.x, t),
          z: lerp(s.a.z, s.b.z, t),
          heading: Math.atan2(s.dx, s.dz)
        };
      }
    }
    return { x: pl.segs[0].a.x, z: pl.segs[0].a.z, heading: 0 };
  }

  const T = {
    walkIn: 4.6,     // 0 → 4.6  走进来
    wave: 4.6,       // 4.6 → 8.8 挥手
    waveEnd: 8.8,
    walkWin: 4.0,    // 8.8 → 12.8 走向窗
    window: 12.8,    // 站在窗边
    whaleAt: 13.6,   // 窗外鲸鱼游过
    turnBack: 24.0   // 回头看屋里
  };

  function build(scene) {
    const group = new THREE.Group();
    group.name = 'guest';
    group.visible = false;

    const ch = buildCharacter();
    group.add(ch.root);

    // 气泡
    const tex1 = bubbleTex('小D～ 妈妈来啦');
    const tex2 = bubbleTex('哇，窗外有鲸鱼');
    const bubbleMat = new THREE.SpriteMaterial({ map: tex1, transparent: true, depthTest: false });
    const bubble = new THREE.Sprite(bubbleMat);
    bubble.scale.set(1.02, 0.40, 1);
    bubble.position.set(0, 2.02, 0);
    bubble.visible = false;
        group.add(bubble);

    // 小D（飞过去陪她）
    let whale = null;
    if (XD.Workspace && XD.Workspace.miniOrca) {
      whale = XD.Workspace.miniOrca(0.32);
      if (whale) {
        whale.visible = false;
        whale.position.set(1.62, 1.30, -2.15);
        scene.add(whale);   // 挂在场景上，不然会跟着妈妈一起平移
      }
    }

    scene.add(group);

    const state = {
      active: false,
      t: 0,
      started: false,
      whaleSummoned: false,
      bubbleWhich: 0
    };

    function reset() {
      state.active = true;
      state.t = 0;
      state.started = true;
      state.whaleSummoned = false;
      state.bubbleWhich = 0;
      group.visible = true;
      group.position.set(PATH_IN[0].x, 0, PATH_IN[0].z);
      ch.root.rotation.y = Math.atan2(PATH_IN[1].x - PATH_IN[0].x, PATH_IN[1].z - PATH_IN[0].z);
      ch.legL.rotation.x = 0;
      ch.legR.rotation.x = 0;
      ch.armL.rotation.x = 0;
      ch.armR.rotation.x = 0;
      ch.armR.rotation.z = 0.09;
      ch.armL.rotation.z = -0.09;
      ch.head.rotation.set(0, 0, 0);
      bubble.visible = false;
      if (whale) {
        whale.visible = false;
        whale.position.set(1.62, 1.30, -2.15);
      }
    }

    function setBubble(tex, show) {
      if (tex && bubbleMat.map !== tex) {
        bubbleMat.map = tex;
        bubbleMat.needsUpdate = true;
      }
      bubble.visible = !!show;
    }

    function walkAnim(phase, amount) {
      const s = Math.sin(phase) * amount;
      ch.legL.rotation.x = s * 0.62;
      ch.legR.rotation.x = -s * 0.62;
      ch.armL.rotation.x = -s * 0.45;
      ch.armR.rotation.x = s * 0.45;
    }

    function update(dt) {
      if (!state.active) return;
      state.t += dt;
      const t = state.t;

      // ---------- 走进来 ----------
      if (t < T.walkIn) {
        const prog = t / T.walkIn;
        // 起步和停下都缓一点
        const d = IN.total * smooth(prog * 1.06);
        const p = samplePath(IN, d);
        group.position.x = p.x;
        group.position.z = p.z;
        group.position.y = Math.abs(Math.sin(t * 7.8)) * 0.012;
        // 朝向：慢慢转过去
        const target = p.heading;
        ch.root.rotation.y = ch.root.rotation.y + (target - ch.root.rotation.y) * Math.min(1, dt * 6);
        walkAnim(t * 7.8, 1.0);
        // 走到一半左右东张西望
        ch.head.rotation.y = Math.sin(t * 1.6) * 0.28;
        ch.head.rotation.x = 0;
        // 小D 从床上飞起来
        if (whale) {
          const a = clamp01((t - 1.2) / 3.0);
          whale.visible = t > 1.2;
          const gx = group.position.x, gz = group.position.z;
          const tx = gx - 0.78, ty = 1.38 + Math.sin(t * 2.2) * 0.05, tz = gz + 0.38;
          whale.position.x = lerp(1.62, tx, smooth(a));
          whale.position.y = lerp(1.30, ty, smooth(a));
          whale.position.z = lerp(-2.15, tz, smooth(a));
          whale.rotation.y = Math.atan2(gx - whale.position.x, gz - whale.position.z) - Math.PI * 0.5;
        }
        return;
      }

      // ---------- 站定挥手 ----------
      if (t < T.waveEnd) {
        const k = t - T.wave;
        group.position.set(PATH_IN[PATH_IN.length - 1].x, 0, PATH_IN[PATH_IN.length - 1].z);
        // 转身面向屋子正面（+z，也就是妈妈的视角）
        ch.root.rotation.y = lerp(-1.75, 0.0, smooth(k / 0.75));
        ch.legL.rotation.x = 0;
        ch.legR.rotation.x = 0;
        ch.armL.rotation.x = 0;
        ch.armL.rotation.z = -0.09;
        // 抬手挥
        const raise = smooth(clamp01((k - 0.25) / 0.5));
        ch.armR.rotation.z = lerp(0.09, 2.35, raise);
        ch.armR.rotation.x = Math.sin((k - 0.7) * 11) * 0.30 * raise;
        // 头微微歪
        ch.head.rotation.y = Math.sin(k * 2.2) * 0.12;
        ch.head.rotation.z = Math.sin(k * 1.6) * 0.06;
        ch.head.rotation.x = -0.03;
        // 气泡
        setBubble(tex1, k > 0.9 && k < 3.9);
        // 小鲸鱼在头顶打转
        if (whale) {
          whale.visible = true;
          whale.position.set(
            group.position.x - 0.80,
            1.38 + Math.sin(k * 2.4) * 0.055,
            group.position.z + 0.40 + Math.sin(k * 1.1) * 0.10
          );
          whale.rotation.y = k * 0.5;
        }
        return;
      }

      // ---------- 走向窗边 ----------
      if (t < T.window) {
        const k = (t - T.waveEnd) / T.walkWin;
        const d = WIN.total * smooth(k);
        const p = samplePath(WIN, d);
        group.position.x = p.x;
        group.position.z = p.z;
        group.position.y = Math.abs(Math.sin(t * 7.8)) * 0.012;
        ch.root.rotation.y = ch.root.rotation.y + (p.heading - ch.root.rotation.y) * Math.min(1, dt * 6);
        ch.armR.rotation.z = 0;
        walkAnim(t * 7.8, 1.0);
        ch.head.rotation.y = Math.sin(t * 1.2) * 0.2;
        ch.head.rotation.z = 0;
        ch.head.rotation.x = 0;
        setBubble(null, false);
        if (whale) {
          const gx = group.position.x, gz = group.position.z;
          whale.visible = true;
          whale.position.x = lerp(whale.position.x, gx - 0.78, Math.min(1, dt * 2.2));
          whale.position.y = 1.50 + Math.sin(t * 2.2) * 0.05;
          whale.position.z = lerp(whale.position.z, gz + 0.38, Math.min(1, dt * 2.2));
          whale.rotation.y = Math.atan2(gx - whale.position.x, gz - whale.position.z) - Math.PI * 0.5;
        }
        return;
      }

      // ---------- 站在窗边 ----------
      const k = t - T.window;
      group.position.set(-3.10, 0, 0.28);
      ch.root.rotation.y = Math.PI / 2 * -1;   // 面朝窗（-x）
      ch.legL.rotation.x = 0;
      ch.legR.rotation.x = 0;
      ch.armL.rotation.z = -0.09;
      ch.armR.rotation.z = 0.09;
      ch.armL.rotation.x = 0;
      ch.armR.rotation.x = 0;
      // 抬头看窗外
      ch.head.rotation.x = -0.12 + Math.sin(k * 0.9) * 0.05;
      ch.head.rotation.y = Math.sin(k * 0.55) * 0.22;
      ch.head.rotation.z = 0;

      // 窗外鲸鱼
      if (!state.whaleSummoned && t > T.whaleAt) {
        state.whaleSummoned = true;
        if (XD.Whale && XD.Whale.summon) XD.Whale.summon();
      }
      setBubble(tex2, t > T.whaleAt + 1.2 && t < T.whaleAt + 6.0);

      // 把带来的礼物放在窗台上（一开始就放在那儿，拜访时出现）
      if (whale) {
        whale.visible = true;
        const a = Math.sin(k * 0.8) * 0.7;
        whale.position.set(-2.62 + Math.cos(a) * 0.22, 1.18 + Math.sin(k * 2.0) * 0.06, 1.12 + Math.sin(a) * 0.30);
        whale.rotation.y = k * 0.5;
      }
    }

    function start(seek) {
      reset();
      if (seek && seek > 0) {
        const step = 1 / 30;
        for (let i = 0; i < seek * 30; i++) update(step);
      }
    }

    return {
      group: group,
      start: start,
      update: update,
      state: state,
      isActive: function () { return state.active; }
    };
  }

  return { build: build, buildCharacter: buildCharacter };
})();
