/* 小D的赛博小家 · M43 采耳馆「鲸耳堂」（鲸鱼街西侧，原来是锁着的书店）
 *
 * 妈妈 2026-11-14 18:01：
 *   「再开个采耳店，晚上去那里有看你享受采耳服务的 HTML 动画」
 *
 * 这间店只有晚上开（白天门上挂「歇业」牌，点门我会说晚上再来）。
 * 进屋点中间那张竹躺椅 → 躺下 → 打开 XD.EarScene 那段动画：
 * 棉师傅（白猫）给我采耳，七个小节，配 CC0 的真实录音。
 *
 * 声音：assets/earspa/（ear-clean.mp3 / ear-rub.mp3，CC0，出处见 CREDITS.md）
 *       底噪用 assets/sfx/hum.mp3（CC0）压到很轻，当屋里的空调/香炉声。
 *
 * 调试：?venue=earspa 直接站店里；?earspa=lie 一进来就开始采；
 *       ?earspa=t=30 跳到第 30 秒那一格（配合 ?diag=1 看）
 */
window.XD = window.XD || {};

XD.EarSpa = (function () {
  'use strict';

  /* ================= 尺寸 ================= */
  const X0 = 120.0, X1 = 128.0;          // 8m 宽
  const Z0 = -3.2, Z1 = 3.2;             // 6.4m 深
  const H = 3.15;
  const DOOR = { x0: 122.35, x1: 123.65, z: Z1 };
  const CHAIRS = [
    { x: 122.35, z: -1.25 },             // 中间那张：我躺这张
    { x: 125.35, z: -1.25 }
  ];
  const TABLE = { x: 123.9, z: 0.95, r: 0.66 };
  const CART = { x: 127.05, z: -0.35, r: 0.62 };
  const BENCH = { x: 121.05, z: -2.62 };  // 棉师傅的蒲团

  /* ================= 状态 ================= */
  let root = null, scene = null, interact = null, sfx = null, tip = null, earScene = null;
  let isEarNow = function () { return false; };
  let getMode = function () { return 'night'; };
  let onDoor = function () {};
  let frames = null;
  let t = 0;
  let cool = 0;
  let serviced = false;         // 采过一次了
  let hitting = false;          // 正在演动画
  let amb = null;               // 屋里那点轻底噪
  let whale = null, master = null, glow = null, noteSprite = null;
  let smoke = [];
  // M43.1：背景音乐 + 果盘（妈妈 18:35 要的"采耳馆适配音乐"和"吃水果音频互动"）
  let extra = null;             // { bite1, bite2, music }
  let fruit = [];               // 果盘上的三块（点一次吃一块）
  let fruitLeft = 3;
  let fruitTimer = 0;
  let musicRetry = 0;
  // M43.3：赏钱盒（花 ¥5，棉师傅鞠躬）
  let walletOf = function () { return 0; };
  let spend = function () { return true; };
  let bowT = 0;

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
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
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
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t2 = new THREE.CanvasTexture(c);
    t2.encoding = THREE.sRGBEncoding;
    t2.anisotropy = 4;
    return t2;
  }

  /* ================= 贴图 ================= */
  function woodFloor() {
    const t2 = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#4a3325';
      g.fillRect(0, 0, w, h);
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const y = r * h / rows;
        const tint = 0.86 + Math.random() * 0.16;
        g.fillStyle = 'rgba(' + Math.round(96 * tint) + ',' + Math.round(66 * tint) + ',' + Math.round(44 * tint) + ',1)';
        g.fillRect(0, y + 1, w, h / rows - 2);
        // 木纹
        for (let i = 0; i < 9; i++) {
          g.strokeStyle = 'rgba(56,36,24,' + (0.1 + Math.random() * 0.16) + ')';
          g.lineWidth = 1 + Math.random() * 1.4;
          g.beginPath();
          const yy = y + 4 + Math.random() * (h / rows - 8);
          g.moveTo(0, yy);
          g.bezierCurveTo(w * 0.3, yy + Math.random() * 6 - 3, w * 0.7, yy - Math.random() * 6 + 3, w, yy);
          g.stroke();
        }
        // 板缝
        g.fillStyle = 'rgba(30,20,14,.55)';
        g.fillRect(0, y, w, 1.5);
      }
    });
    t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    t2.repeat.set(3, 2.4);
    return t2;
  }

  function bambooTex() {
    const t2 = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#2b2018';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const x = i * 16 + 3;
        const k = 0.75 + Math.random() * 0.5;
        g.fillStyle = 'rgba(' + Math.round(150 * k) + ',' + Math.round(110 * k) + ',' + Math.round(62 * k) + ',1)';
        g.fillRect(x, 0, 9, h);
        g.fillStyle = 'rgba(60,40,24,.5)';
        g.fillRect(x + 9, 0, 2, h);
      }
      // 横向竹节
      for (let y = 24; y < h; y += 47) {
        g.fillStyle = 'rgba(48,32,20,.55)';
        g.fillRect(0, y, w, 3);
      }
    });
    t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    return t2;
  }

  function windowTex() {
    // 夜里窗外的街：深蓝 + 暖色光斑
    return canvasTex(512, 320, function (g, w, h) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#101a2c');
      grd.addColorStop(0.7, '#1a2437');
      grd.addColorStop(1, '#0d1220');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 远处楼影
      g.fillStyle = '#0a0f1a';
      for (let i = 0; i < 7; i++) {
        const bw = 40 + Math.random() * 50;
        const bh = 60 + Math.random() * 130;
        g.fillRect(i * 74, h - bh, bw, bh);
        // 窗
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 3; c++) {
            if (Math.random() < 0.45) {
              g.fillStyle = 'rgba(255,196,120,' + (0.25 + Math.random() * 0.55) + ')';
              g.fillRect(i * 74 + 6 + c * 12, h - bh + 10 + r * 16, 7, 9);
            }
          }
        }
        g.fillStyle = '#0a0f1a';
      }
      // 光斑（虚化的街灯）
      for (let i = 0; i < 22; i++) {
        const x = Math.random() * w, y = Math.random() * h * 0.9;
        const r = 8 + Math.random() * 30;
        const rg = g.createRadialGradient(x, y, 1, x, y, r);
        rg.addColorStop(0, 'rgba(255,190,110,.5)');
        rg.addColorStop(1, 'rgba(255,170,90,0)');
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
    });
  }

  function plaqueTex() {
    // 竖排「采耳」，金漆木匾
    return canvasTex(256, 512, function (g, w, h) {
      g.fillStyle = '#3a2418';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a6234';
      g.lineWidth = 10;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.strokeStyle = 'rgba(210,170,110,.45)';
      g.lineWidth = 3;
      g.strokeRect(24, 24, w - 48, h - 48);
      g.fillStyle = '#e8c078';
      g.font = 'bold 150px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('采', w / 2, h * 0.32);
      g.fillText('耳', w / 2, h * 0.68);
    });
  }

  function screenTex() {
    // 屏风：水墨远山
    return canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#e6ddc8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,130,120,.35)';
      g.beginPath();
      g.moveTo(0, h * 0.62);
      g.quadraticCurveTo(w * 0.22, h * 0.34, w * 0.44, h * 0.6);
      g.quadraticCurveTo(w * 0.62, h * 0.8, w, h * 0.55);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(80,92,86,.4)';
      g.beginPath();
      g.moveTo(w * 0.1, h * 0.78);
      g.quadraticCurveTo(w * 0.4, h * 0.55, w * 0.72, h * 0.76);
      g.quadraticCurveTo(w * 0.88, h * 0.86, w, h * 0.72);
      g.lineTo(w, h);
      g.lineTo(w * 0.1, h);
      g.closePath();
      g.fill();
      // 一轮淡月
      g.fillStyle = 'rgba(240,232,210,.85)';
      g.beginPath(); g.arc(w * 0.76, h * 0.2, 34, 0, 6.2832); g.fill();
      // 飞鸟
      g.strokeStyle = 'rgba(60,60,56,.6)';
      g.lineWidth = 2.5;
      [[0.2, 0.24], [0.28, 0.2], [0.35, 0.25]].forEach(function (p) {
        g.beginPath();
        g.moveTo(w * p[0] - 9, h * p[1]);
        g.quadraticCurveTo(w * p[0], h * p[1] - 7, w * p[0] + 9, h * p[1]);
        g.stroke();
      });
      // 印章
      g.fillStyle = 'rgba(178,72,58,.8)';
      g.fillRect(w * 0.84, h * 0.82, 26, 26);
    });
  }

  function hangTex(txt, sub) {
    return canvasTex(512, 200, function (g, w, h) {
      g.fillStyle = '#2f1f16';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(220,180,110,.55)';
      g.lineWidth = 6;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#f0cf92';
      g.font = 'bold 68px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, w / 2, sub ? h * 0.4 : h * 0.52);
      if (sub) {
        g.font = '28px "Microsoft YaHei", sans-serif';
        g.fillStyle = 'rgba(230,196,140,.8)';
        g.fillText(sub, w / 2, h * 0.76);
      }
    });
  }

  /* ================= 屋子 ================= */
  function buildRoom() {
    const floorMat = new THREE.MeshStandardMaterial({ map: woodFloor(), roughness: 0.72, metalness: 0.02 });
    const fl = plane(X1 - X0, Z1 - Z0, floorMat, (X0 + X1) / 2, 0, (Z0 + Z1) / 2, null, -Math.PI / 2);
    fl.castShadow = false;

    const plaster = std(0xd8c9ae, 0.96);
    const dark = std(0x3a2a1e, 0.9);
    const wood = std(0x6b4a31, 0.88);
    const wallT = 0.16;

    // 北墙（带窗）
    box(X1 - X0, H, wallT, plaster, (X0 + X1) / 2, H / 2, Z0 - wallT / 2);
    // 南墙（带门洞：两块 + 门楣）
    const dw = DOOR.x1 - DOOR.x0;
    box(DOOR.x0 - X0, H, wallT, plaster, (X0 + DOOR.x0) / 2, H / 2, Z1 + wallT / 2);
    box(X1 - DOOR.x1, H, wallT, plaster, (DOOR.x1 + X1) / 2, H / 2, Z1 + wallT / 2);
    box(dw, H - 2.25, wallT, plaster, (DOOR.x0 + DOOR.x1) / 2, 2.25 + (H - 2.25) / 2, Z1 + wallT / 2);
    // 东西墙
    box(wallT, H, Z1 - Z0, std(0xcdbca0, 0.96), X0 - wallT / 2, H / 2, (Z0 + Z1) / 2);
    box(wallT, H, Z1 - Z0, std(0xd2c2a6, 0.96), X1 + wallT / 2, H / 2, (Z0 + Z1) / 2);

    // 踢脚 + 护墙板
    box(X1 - X0, 0.16, 0.06, dark, (X0 + X1) / 2, 0.08, Z0 + 0.03);
    box(X1 - X0, 0.16, 0.06, dark, (X0 + X1) / 2, 0.08, Z1 - 0.03);
    box(0.06, 0.16, Z1 - Z0, dark, X0 + 0.03, 0.08, (Z0 + Z1) / 2);
    box(0.06, 0.16, Z1 - Z0, dark, X1 - 0.03, 0.08, (Z0 + Z1) / 2);
    // 木格栅（北墙下半）
    for (let i = 0; i < 11; i++) {
      box(0.05, 1.0, 0.03, wood, X0 + 0.55 + i * 0.66, 0.62, Z0 + 0.04);
    }

    // 窗（北墙中间偏东）
    const winW = 2.6, winH = 1.5;
    const winMat = new THREE.MeshBasicMaterial({ map: windowTex(), color: 0x9a9a9a });
    winMat.toneMapped = false;
    plane(winW, winH, winMat, 124.6, 1.85, Z0 + 0.05, null, 0, 0);
    // 窗框 + 竹帘
    box(winW + 0.18, 0.09, 0.12, wood, 124.6, 1.85 + winH / 2 + 0.05, Z0 + 0.1);
    box(winW + 0.18, 0.09, 0.12, wood, 124.6, 1.85 - winH / 2 - 0.05, Z0 + 0.1);
    box(0.09, winH + 0.2, 0.12, wood, 124.6 - winW / 2 - 0.05, 1.85, Z0 + 0.1);
    box(0.09, winH + 0.2, 0.12, wood, 124.6 + winW / 2 + 0.05, 1.85, Z0 + 0.1);
    const blindMat = new THREE.MeshStandardMaterial({
      map: bambooTex(), roughness: 0.95, transparent: true, opacity: 0.72, side: THREE.DoubleSide
    });
    blindMat.map.repeat.set(1.6, 1);
    const blind = plane(winW - 0.05, winH - 0.1, blindMat, 124.6, 1.85, Z0 + 0.12);
    blind.castShadow = false;

    // 匾额「采耳」
    const plq = new THREE.MeshBasicMaterial({ map: plaqueTex() });
    plq.toneMapped = false;
    plane(0.62, 1.24, plq, 126.9, 2.15, Z0 + 0.06).castShadow = false;

    // 天花 + 梁
    const ceil = std(0x2c2119, 0.95);
    plane(X1 - X0, Z1 - Z0, ceil, (X0 + X1) / 2, H, (Z0 + Z1) / 2, null, Math.PI / 2).castShadow = false;
    for (let i = 0; i < 4; i++) {
      box(X1 - X0, 0.12, 0.14, dark, (X0 + X1) / 2, H - 0.08, Z0 + 0.7 + i * 1.55);
    }

    // 屏风（西墙）
    const scM = new THREE.MeshStandardMaterial({ map: screenTex(), roughness: 0.94, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(X0 + 0.16, 0, 0.35 - i * 0.62);
      g.rotation.y = Math.PI / 2 + (i - 1) * 0.22;
      root.add(g);
      box(0.9, 1.72, 0.06, wood, 0, 0.94, 0, g);
      plane(0.82, 1.6, scM, 0, 0.94, 0.04, g);
    }

    // 门：木框 + 玻璃 + 门帘
    box(0.1, 2.3, 0.16, wood, DOOR.x0 - 0.03, 1.15, Z1);
    box(0.1, 2.3, 0.16, wood, DOOR.x1 + 0.03, 1.15, Z1);
    box(dw + 0.2, 0.1, 0.16, wood, (DOOR.x0 + DOOR.x1) / 2, 2.31, Z1);
    const doorGlass = new THREE.MeshStandardMaterial({
      color: col(0x2a3540), roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.42,
      emissive: col(0xffb877), emissiveIntensity: 0.35
    });
    plane(dw - 0.06, 2.16, doorGlass, (DOOR.x0 + DOOR.x1) / 2, 1.1, Z1 - 0.02).castShadow = false;
    // 门帘（一根根的竹条）
    const curtain = new THREE.Group();
    curtain.position.set((DOOR.x0 + DOOR.x1) / 2, 2.24, Z1 - 0.16);
    root.add(curtain);
    for (let i = 0; i < 11; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 5),
        std(0x8a6234, 0.9));
      s.position.set(-0.55 + i * 0.11, -0.78, 0);
      s.castShadow = false;
      curtain.add(s);
    }
    frames.curtain = curtain;

    // 「营业中」小木牌（夜里亮）
    const openMat = new THREE.MeshBasicMaterial({ map: hangTex('营业中', '夜里到十一点'), transparent: true });
    openMat.toneMapped = false;
    frames.openSign = plane(0.62, 0.24, openMat, DOOR.x1 + 0.5, 2.0, Z1 - 0.1);
    frames.openSign.castShadow = false;

    // 门口地垫 + 拖鞋
    box(1.3, 0.02, 0.6, std(0x6d4b36, 0.96), (DOOR.x0 + DOOR.x1) / 2, 0.012, Z1 - 0.55).castShadow = false;
    [[-0.28, 0], [0.02, 0.06]].forEach(function (p) {
      box(0.17, 0.05, 0.28, std(0x8f6a4c, 0.9), (DOOR.x0 + DOOR.x1) / 2 + p[0], 0.05, Z1 - 0.85 + p[1]);
    });

    // 小挂画（东墙两幅）
    const picMat = new THREE.MeshStandardMaterial({ map: screenTex(), roughness: 0.95 });
    [0.6, 2.2].forEach(function (z) {
      box(0.05, 0.66, 0.5, wood, X1 - 0.05, 1.85, z);
      plane(0.44, 0.58, picMat, X1 - 0.09, 1.85, z, null, 0, -Math.PI / 2);
    });

    // 地毯
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32),
      new THREE.MeshStandardMaterial({ color: col(0x7a5340), roughness: 0.98 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(123.9, 0.008, -0.9);
    rug.receiveShadow = true;
    root.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.36, 32),
      new THREE.MeshStandardMaterial({ color: col(0x9c7452), roughness: 0.98 }));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(123.9, 0.011, -0.9);
    root.add(rug2);
  }

  /* ================= 竹躺椅 ================= */
  function buildChair(cx, cz, isMine) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    root.add(g);
    const bamboo = std(0x9a7846, 0.92);
    const frame = std(0x4e3524, 0.86);

    // 四条腿
    [[-0.42, -1.05], [0.42, -1.05], [-0.42, 0.62], [0.42, 0.62]].forEach(function (p) {
      box(0.07, 0.36, 0.07, frame, p[0], 0.18, p[1], g);
    });
    // 座面（竹席）
    box(0.94, 0.08, 1.95, bamboo, 0, 0.4, -0.2, g);
    for (let i = 0; i < 13; i++) {
      box(0.02, 0.02, 1.9, std(0x7d5f36, 0.92), -0.42 + i * 0.07, 0.445, -0.2, g).castShadow = false;
    }
    // 靠背（北头那一段翘起来）
    // M59.2：rotation 原来是 -0.42，把靠背**往北压下去**了（北端 0.15 / 南端 0.44），
    // 人躺上去头是往下滑的，头枕也就悬在半空 —— 改成 +0.42，北端翘起来托住后脑。
    const back = new THREE.Group();
    back.position.set(0, 0.42, -1.12);
    back.rotation.x = 0.42;
    g.add(back);
    box(0.94, 0.08, 0.72, bamboo, 0, 0, -0.3, back);
    // 头枕（平放在靠背下沿的椅面上，不再飘在斜面中间）
    const pillow = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12),
      std(0xc7a274, 0.95));
    pillow.scale.set(0.26, 0.09, 0.17);
    pillow.position.set(0, 0.49, -0.80);
    pillow.castShadow = true;
    g.add(pillow);
    // 扶手
    [-1, 1].forEach(function (s) {
      box(0.06, 0.06, 0.9, frame, s * 0.46, 0.6, -0.45, g);
      box(0.06, 0.22, 0.06, frame, s * 0.46, 0.49, -0.86, g);
    });
    // 小毛巾卷
    const towel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12),
      std(0xf0e8d8, 0.95));
    towel.rotation.z = Math.PI / 2;
    towel.position.set(0.3, 0.48, -0.50);
    towel.castShadow = true;
    g.add(towel);
    // 我这张椅子边上放个「已备好」的小牌
    if (isMine) {
      const m = new THREE.MeshBasicMaterial({ map: hangTex('请躺下') });
      m.toneMapped = false;
      const p = plane(0.4, 0.16, m, 0.5, 0.66, -0.05, g, 0, Math.PI / 2);
      p.castShadow = false;
    }
    return g;
  }

  /* ================= 小东西：矮几 / 茶 / 工具车 / 香炉 / 兰 ================= */
  function buildTable() {
    const g = new THREE.Group();
    g.position.set(TABLE.x, 0, TABLE.z);
    root.add(g);
    const wood = std(0x5e4029, 0.86);
    cyl(0.5, 0.46, 0.06, 20, wood, 0, 0.46, 0, g);
    cyl(0.05, 0.07, 0.44, 10, wood, 0, 0.22, 0, g);
    cyl(0.26, 0.3, 0.04, 16, wood, 0, 0.02, 0, g);
    // 茶盘
    box(0.42, 0.03, 0.3, std(0x3f2c1d, 0.9), 0, 0.5, 0.02, g);
    // 小茶壶
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), std(0xc9a37a, 0.75));
    pot.scale.set(1, 0.86, 1);
    pot.position.set(-0.08, 0.58, 0.02);
    pot.castShadow = true;
    g.add(pot);
    cyl(0.02, 0.02, 0.05, 8, std(0xc9a37a, 0.75), -0.08, 0.68, 0.02, g);
    const spout = cyl(0.012, 0.02, 0.13, 8, std(0xc9a37a, 0.75), -0.02, 0.59, 0.02, g);
    spout.rotation.z = -1.0;
    // 两只茶杯
    [[0.12, 0.06], [0.16, -0.1]].forEach(function (p) {
      cyl(0.045, 0.036, 0.055, 12, std(0xefe6d4, 0.6), p[0], 0.53, p[1], g);
      cyl(0.038, 0.038, 0.004, 12, std(0xb98a52, 0.4), p[0], 0.558, p[1], g).castShadow = false;
    });
    frames.teaPot = pot;
    // 一小碟桂花糕
    cyl(0.075, 0.075, 0.014, 14, std(0xf3e6cf, 0.9), -0.02, 0.515, -0.12, g);
    box(0.05, 0.03, 0.05, std(0xf0d9a8, 0.85), -0.02, 0.537, -0.12, g).castShadow = false;

    /* ---- 果盘（妈妈 18:35：加点吃水果的音频互动）---- */
    cyl(0.145, 0.13, 0.014, 22, std(0xf4eee2, 0.5), 0.3, 0.512, 0.06, g).castShadow = false;
    cyl(0.1, 0.1, 0.004, 20, std(0xe4dccb, 0.7), 0.3, 0.519, 0.06, g).castShadow = false;
    fruit = [];
    // 两瓣橘子
    [[0.26, 0.02, 0.06, 0.5], [0.345, -0.02, 0.1, -0.4]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 8), std(0xf0903a, 0.72));
      m.scale.set(1, 0.44, 0.62);
      m.position.set(p[0], 0.532 + p[1], p[2]);
      m.rotation.y = p[3];
      m.castShadow = true;
      g.add(m);
      fruit.push(m);
    });
    // 一片苹果
    const ap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 12), std(0xecc36a, 0.8));
    ap.position.set(0.3, 0.53, 0.03);
    ap.rotation.z = 0.18;
    ap.castShadow = true;
    g.add(ap);
    fruit.push(ap);
    // 两颗葡萄（装饰，不吃）
    [[0.24, 0.11], [0.36, 0.13]].forEach(function (p) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), std(0x7d4478, 0.66));
      m.position.set(p[0], 0.53, p[1]);
      m.castShadow = false;
      g.add(m);
    });

    /* ---- 赏钱盒（M43.3：花 ¥5 让棉师傅鞠个躬）---- */
    const tipBox = box(0.16, 0.1, 0.13, std(0x5a3d28, 0.85), -0.32, 0.55, 0.12, g);
    tipBox.castShadow = true;
    box(0.11, 0.008, 0.022, std(0xd8b46a, 0.4, 0.7), -0.32, 0.602, 0.12, g).castShadow = false;
    const tipLabel = new THREE.MeshBasicMaterial({ map: hangTex('赏') });
    tipLabel.toneMapped = false;
    const tl = plane(0.1, 0.052, tipLabel, -0.32, 0.552, 0.186, g);
    tl.castShadow = false;
    // 盒里露出来的两枚铜钱
    [[-0.36, 0.605], [-0.29, 0.607]].forEach(function (p) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 14), std(0xc9a24a, 0.35, 0.8));
      c.position.set(p[0], p[1], 0.11);
      c.castShadow = false;
      g.add(c);
    });
  }

  function buildCart() {
    const g = new THREE.Group();
    g.position.set(CART.x, 0, CART.z);
    root.add(g);
    const steel = std(0x8b8f96, 0.42, 0.75);
    const wood = std(0x6d4b31, 0.88);
    // 三层推车
    [0.28, 0.62, 0.96].forEach(function (y) {
      box(0.82, 0.04, 0.56, y === 0.96 ? wood : steel, 0, y, 0, g);
    });
    [[-0.36, -0.24], [0.36, -0.24], [-0.36, 0.24], [0.36, 0.24]].forEach(function (p) {
      cyl(0.018, 0.018, 0.98, 8, steel, p[0], 0.49, p[1], g);
    });
    // 酒精瓶
    cyl(0.045, 0.045, 0.16, 10, std(0xd8e6ea, 0.3), -0.26, 1.06, 0.04, g);
    cyl(0.02, 0.02, 0.05, 8, std(0xf2f2f2, 0.5), -0.26, 1.16, 0.04, g);
    // 棉签盒
    cyl(0.06, 0.06, 0.1, 12, std(0xf7f3ea, 0.9), 0.24, 1.03, 0.08, g);
    // 托盘里的工具：耳勺 / 鹅毛棒 / 镊子 / 音叉
    const tray = box(0.62, 0.02, 0.4, std(0x3c2a1c, 0.9), 0, 0.67, 0, g);
    tray.castShadow = false;
    const silver = std(0xd9d6cc, 0.3, 0.8);
    // 三把耳勺
    for (let i = 0; i < 3; i++) {
      const s = cyl(0.008, 0.008, 0.24, 6, silver, -0.2 + i * 0.1, 0.7, -0.05, g);
      s.rotation.z = Math.PI / 2;
      s.rotation.y = 0.12 * (i - 1);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), silver);
      head.scale.set(1, 0.55, 1);
      head.position.set(-0.2 + i * 0.1 + 0.13, 0.7, -0.05 + 0.03 * (i - 1));
      g.add(head);
    }
    // 鹅毛棒
    const f = cyl(0.007, 0.007, 0.22, 6, std(0x8a6234, 0.9), 0.12, 0.7, 0.12, g);
    f.rotation.z = Math.PI / 2;
    for (let i = 0; i < 7; i++) {
      const feather = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), std(0xfbf6e8, 0.95));
      feather.scale.set(2.6, 0.7, 0.7);
      feather.position.set(0.26 + i * 0.02, 0.7 + (i % 2) * 0.012, 0.12 + (i - 3) * 0.008);
      feather.castShadow = false;
      g.add(feather);
    }
    // 音叉
    const tf = new THREE.Group();
    tf.position.set(-0.1, 0.72, 0.14);
    tf.rotation.z = Math.PI / 2;
    g.add(tf);
    box(0.026, 0.026, 0.2, silver, 0, 0, 0, tf);
    box(0.05, 0.026, 0.03, silver, 0, 0.1, 0, tf);
    // 一盏小台灯罩在工具上
    box(0.3, 0.02, 0.02, steel, 0, 1.28, -0.24, g);
    const lampMat = new THREE.MeshStandardMaterial({
      color: col(0xfff0d0), emissive: col(0xffd08a), emissiveIntensity: 1.2, roughness: 0.5
    });
    const lb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat);
    lb.position.set(0, 1.24, -0.18);
    g.add(lb);
    frames.cartLamp = lampMat;
  }

  function buildIncense() {
    const g = new THREE.Group();
    g.position.set(127.1, 0, -2.55);
    root.add(g);
    // 小几
    box(0.36, 0.5, 0.36, std(0x4d3322, 0.88), 0, 0.25, 0, g);
    // 香炉
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12, 0, 6.2832, 0, Math.PI / 2),
      std(0x7d5a34, 0.5, 0.5));
    bowl.position.set(0, 0.52, 0);
    bowl.castShadow = true;
    g.add(bowl);
    cyl(0.1, 0.1, 0.02, 16, std(0x6b4c2c, 0.6, 0.4), 0, 0.515, 0, g);
    // 三根香
    for (let i = 0; i < 3; i++) {
      const st = cyl(0.006, 0.006, 0.26, 5, std(0x8a6a48, 0.9), -0.03 + i * 0.03, 0.66, 0, g);
      st.rotation.x = 0.06 * (i - 1);
    }
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8a3c }));
    ember.position.set(0, 0.79, 0);
    g.add(ember);
    frames.ember = ember;
    const emberLight = new THREE.PointLight(0xff9a44, 0.55, 2.2, 2);
    emberLight.position.set(127.1, 0.86, -2.55);
    root.add(emberLight);
    frames.emberLight = emberLight;
    // 烟雾粒子
    smoke = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xdfd8cc, transparent: true, opacity: 0.0 }));
      s.castShadow = false;
      root.add(s);
      smoke.push({ m: s, ph: i / 12, x: 127.1, z: -2.55, y: 0.82 });
    }
  }

  function buildPlants() {
    // 兰花
    const g = new THREE.Group();
    g.position.set(X1 - 0.55, 0, -2.75);
    root.add(g);
    cyl(0.16, 0.12, 0.26, 12, std(0x9a6a52, 0.92), 0, 0.13, 0, g);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), std(0x4a6b46, 0.95));
      leaf.scale.set(0.28, 1.5, 0.16);
      leaf.position.set(Math.cos(a) * 0.08, 0.42 + (i % 2) * 0.06, Math.sin(a) * 0.08);
      leaf.rotation.z = Math.cos(a) * 0.5;
      leaf.rotation.x = Math.sin(a) * 0.5;
      g.add(leaf);
    }
    // 两朵小白花
    [[0.06, 0.6], [-0.07, 0.66]].forEach(function (p) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), std(0xf6f2e6, 0.85));
      f.position.set(p[0], p[1], 0.04);
      g.add(f);
    });
    // 门口一盆小竹
    const g2 = new THREE.Group();
    g2.position.set(X0 + 0.6, 0, Z1 - 0.9);
    root.add(g2);
    cyl(0.17, 0.14, 0.3, 12, std(0x8a5a42, 0.92), 0, 0.15, 0, g2);
    for (let i = 0; i < 5; i++) {
      const st = cyl(0.016, 0.02, 0.9 + i * 0.1, 6, std(0x6f8b4e, 0.92), (i - 2) * 0.06, 0.75, (i % 2) * 0.05, g2);
      st.rotation.z = (i - 2) * 0.06;
    }
  }

  /* ================= 灯 ================= */
  function buildLights() {
    const amb1 = new THREE.AmbientLight(0xffd2a8, 0.34);
    root.add(amb1);
    const hemi = new THREE.HemisphereLight(0xffd9b0, 0x3a2418, 0.3);
    root.add(hemi);

    // 两盏纸灯笼
    frames.lanterns = [];
    [[123.3, 2.62, -0.35, 1.05], [126.5, 2.58, 1.55, 0.8]].forEach(function (p, i) {
      const g = new THREE.Group();
      g.position.set(p[0], p[1], p[2]);
      root.add(g);
      cyl(0.008, 0.008, H - p[1] - 0.2, 4, std(0x3a2a1e, 0.9), 0, (H - p[1]) / 2 + 0.1, 0, g).castShadow = false;
      const lampMat = new THREE.MeshStandardMaterial({
        color: col(0xffe2b6), emissive: col(0xffb264), emissiveIntensity: 1.5,
        roughness: 0.6, transparent: true, opacity: 0.94
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), lampMat);
      body.scale.set(1, 1.18, 1);
      body.castShadow = false;
      g.add(body);
      cyl(0.09, 0.09, 0.03, 12, std(0x4a3222, 0.9), 0, 0.24, 0, g).castShadow = false;
      cyl(0.09, 0.09, 0.03, 12, std(0x4a3222, 0.9), 0, -0.24, 0, g).castShadow = false;
      const light = new THREE.PointLight(0xffb877, i === 0 ? 2.0 : 1.5, 9, 2);
      light.position.set(p[0], p[1] - 0.1, p[2]);
      light.castShadow = false;
      root.add(light);
      frames.lanterns.push({ mat: lampMat, light: light, base: light.intensity, g: g, ph: i * 1.7 });
    });

    // 躺椅上方的暖射灯
    const spot = new THREE.PointLight(0xffd8ac, 1.15, 6, 2);
    spot.position.set(122.4, 2.5, -1.2);
    root.add(spot);
    frames.spotChair = spot;

    // 窗边冷光补一点，别让窗外一片黑
    const cool = new THREE.PointLight(0x9fb6e0, 0.5, 7, 2);
    cool.position.set(124.6, 1.9, Z0 + 0.9);
    root.add(cool);
    frames.coolLight = cool;
  }

  /* ================= 鲸鱼（躺在椅子上的我）+ 棉师傅 ================= */
  function buildWhale() {
    if (!XD.OrcaGuru || !XD.OrcaGuru.create) return;
    try {
      whale = XD.OrcaGuru.create({ scale: 0.38 });
    } catch (e) { whale = null; return; }
    // 小小一只趴/躺在椅子中间，头朝着门（从门口进来能看见脸）
    whale.position.set(CHAIRS[0].x, 0.5, -1.15);
    whale.rotation.set(0.06, 0.18, 0.16);
    root.add(whale);

    // 采完以后头上那圈暖暖的光
    glow = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.38, 28),
      new THREE.MeshBasicMaterial({ color: 0xffc478, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(CHAIRS[0].x, 0.66, -1.1);
    root.add(glow);

    // 「♪」的小牌子，采完浮起来
    try {
      let c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g2 = c.getContext('2d');
      g2.fillStyle = 'rgba(255,205,130,.95)';
      g2.font = 'bold 96px "Microsoft YaHei", sans-serif';
      g2.textAlign = 'center';
      g2.fillText('♪', 64, 96);
      const tx = new THREE.CanvasTexture(c);
      tx.encoding = THREE.sRGBEncoding;
      noteSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tx, transparent: true, opacity: 0, depthWrite: false
      }));
      noteSprite.scale.set(0.3, 0.3, 1);
      noteSprite.position.set(CHAIRS[0].x + 0.34, 0.94, -1.05);
      root.add(noteSprite);
    } catch (e) { noteSprite = null; }
  }

  function buildMaster() {
    // 棉师傅：一只白猫，穿靛色汉服，盘腿坐在躺椅北头的蒲团上
    const g = new THREE.Group();
    g.position.set(CHAIRS[0].x + 0.06, 0, -0.02);
    g.rotation.y = Math.PI + 0.12;
    root.add(g);
    const fur = std(0xf4e6d4, 0.94);
    const robe = std(0x44507a, 0.95);
    const cream = std(0xece4d2, 0.94);
    // 蒲团
    cyl(0.3, 0.32, 0.1, 16, std(0xc7a06a, 0.95), 0, 0.05, 0, g);
    // 身体
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 14), robe);
    body.position.set(0, 0.31, 0);
    body.castShadow = true;
    g.add(body);
    // 衣襟
    box(0.09, 0.3, 0.03, cream, 0, 0.36, 0.15, g).castShadow = false;
    // 腰带
    cyl(0.172, 0.176, 0.05, 14, std(0xc8985e, 0.9), 0, 0.2, 0, g).castShadow = false;
    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), fur);
    head.position.set(0, 0.62, 0.01);
    head.castShadow = true;
    g.add(head);
    // 耳朵
    [-1, 1].forEach(function (s) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.13, 5), fur);
      ear.position.set(s * 0.092, 0.745, -0.005);
      ear.rotation.z = s * 0.26;
      ear.castShadow = true;
      g.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.07, 5), std(0xe9a8a2, 0.95));
      inner.position.set(s * 0.092, 0.735, 0.012);
      inner.rotation.z = s * 0.26;
      g.add(inner);
    });
    // 眼睛（闭着，两条小弧）+ 鼻子 + 胡须
    [-1, 1].forEach(function (s) {
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 4, 10, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.6 }));
      eye.position.set(s * 0.058, 0.635, 0.132);
      eye.rotation.x = Math.PI;
      g.add(eye);
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), std(0xe0908c, 0.9));
    nose.position.set(0, 0.598, 0.145);
    g.add(nose);
    for (let s = -1; s <= 1; s += 2) {
      for (let k = -1; k <= 1; k++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 4), std(0xd8cbb8, 0.9));
        w.position.set(s * 0.12, 0.6 + k * 0.022, 0.135);
        w.rotation.z = Math.PI / 2;
        w.rotation.y = s * 0.25;
        w.castShadow = false;
        g.add(w);
      }
    }
    // 右手往前伸（在给躺椅上的人采耳）
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10), robe);
    arm.position.set(0.02, 0.5, 0.24);
    arm.rotation.x = 1.0;
    arm.castShadow = true;
    g.add(arm);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), fur);
    paw.position.set(0.02, 0.52, 0.4);
    g.add(paw);
    // 手里的耳勺（短短的，别像根杆子）
    const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 6), std(0xd9d6cc, 0.3, 0.8));
    tool.position.set(0.02, 0.55, 0.46);
    tool.rotation.x = 1.15;
    g.add(tool);
    // 另一只手放在膝上
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 8), robe);
    arm2.position.set(-0.16, 0.36, 0.08);
    arm2.rotation.set(0.3, 0, 0.5);
    g.add(arm2);
    frames.master = g;
    frames.masterArm = arm;
  }

  /* ================= 声音 ================= */
  function ambOn() {
    if (amb) { try { amb.play().catch(function () {}); } catch (e) {} return; }
    try {
      amb = new Audio('assets/sfx/hum.mp3');
      amb.loop = true;
      amb.volume = 0.05;
      amb.preload = 'none';
      amb.play().catch(function () {});
    } catch (e) { amb = null; }
  }
  function ambOff() {
    if (!amb) return;
    try { amb.pause(); } catch (e) {}
  }
  function muted() { return !!(sfx && sfx.isMuted && sfx.isMuted()); }
  function blip() { if (!muted() && sfx && sfx.blip) { try { sfx.blip(); } catch (e) {} } }
  function clink() { if (!muted() && sfx && sfx.clink) { try { sfx.clink(); } catch (e) {} } }
  function chime() { if (!muted() && sfx && sfx.chime) { try { sfx.chime(); } catch (e) {} } }

  /* M43.1：店里自己的三条小音频 —— 吃水果两口 + 背景音乐
   * 音乐音量压到 0.10 左右（互动音效是 0.45~0.62），妈妈说"音乐要比互动音效小声"
   * M43.2（20:49）：妈妈还是觉得 "bgm 声音有点大，调小一点，类似于白噪音底噪"
   *   → 0.10 降到 0.032（跟屋里那层空调底噪 0.05 一个量级，只是若有若无地垫着）
   *   演采耳动画时再压到 0.018，让 ASMR 完全站前面 */
  const MUSIC_VOL = 0.032;
  const MUSIC_VOL_DUCK = 0.018;
  function extraAudios() {
    if (extra) return extra;
    extra = {};
    try {
      const b1 = new Audio('assets/earspa/fruit-bite.mp3');
      b1.volume = 0.46;
      b1.preload = 'none';
      const b2 = new Audio('assets/earspa/fruit-bite2.mp3');
      b2.volume = 0.46;
      b2.preload = 'none';
      const mu = new Audio('assets/earspa/spa-music.mp3');
      mu.loop = true;
      mu.volume = 0;
      mu.preload = 'none';
      extra = { bite1: b1, bite2: b2, music: mu };
    } catch (e) { extra = {}; }
    return extra;
  }
  function bite(n) {
    if (muted()) return;
    const ea = extraAudios();
    const a = (n % 2 === 0) ? ea.bite1 : ea.bite2;
    if (!a) return;
    try { a.currentTime = 0; a.play().catch(function () {}); } catch (e) {}
  }
  function musicOn() {
    const ea = extraAudios();
    if (!ea.music) return;
    if (muted()) return;
    if (ea.music.paused) { try { ea.music.play().catch(function () {}); } catch (e) {} }
  }
  function musicOff() {
    const ea = extraAudios();
    if (!ea.music) return;
    try { ea.music.pause(); } catch (e) {}
  }

  /* ================= 果盘 ================= */
  function eatFruit() {
    if (fruitLeft <= 0) {
      blip();
      tip('果盘空啦，棉师傅说等会儿再切一盘 🍊', 3200);
      return;
    }
    const idx = 3 - fruitLeft;
    if (fruit[idx]) fruit[idx].visible = false;
    fruitLeft--;
    bite(idx);
    if (fruitLeft > 0) {
      tip(fruitLeft === 2 ? '嗯——橘子瓣，甜甜的一包水 🍊' : '再拿一片苹果，脆脆的', 3000);
    } else {
      tip('吃完啦，嘴里还留着一点橘子味 🍊 等会儿棉师傅再切一盘', 4200);
      fruitTimer = 14;
    }
  }
  function refillFruit() {
    fruitLeft = 3;
    for (let i = 0; i < fruit.length; i++) fruit[i].visible = true;
    fruitTimer = 0;
  }

  /* ================= 赏钱盒 ================= */
  function tipMaster() {
    const w = walletOf();
    if (w < 5) {
      blip();
      tip('零花钱只剩 ¥' + Math.round(w) + ' 了，攥着吧，下次再赏 🐋', 3600);
      return;
    }
    if (!spend(5)) {
      blip();
      tip('零花钱不太够，先攒攒', 3000);
      return;
    }
    bowT = 1.3;
    if (!muted() && sfx && sfx.cash) { try { sfx.cash(); } catch (e) {} }
    tip('往赏钱盒里放了 ¥5——棉师傅放下耳勺，认认真真鞠了一躬', 4600);
  }

  /* ================= 躺下 ================= */
  function lie() {
    if (!isEarNow()) return;
    if (hitting) return;
    if (getMode() !== 'night') {
      tip('鲸耳堂白天歇业呢 ☀️ 等天黑了再来，棉师傅晚上才在', 4200);
      blip();
      return;
    }
    if (!earScene) {
      tip('采耳的动画没加载上，刷新一下试试 🐋', 3000);
      return;
    }
    hitting = true;
    blip();
    tip(serviced ? '再躺一次，棉师傅说耳朵也要保养～' : '躺好了，棉师傅来了——闭眼享受就好 🐋', 3200);
    earScene.open(function (used) {
      hitting = false;
      serviced = true;
      frames.doneAt = t;
      chime();
      tip('采完啦 ♨ 耳朵干干净净的，' + Math.round(used) + ' 秒，一分钱没花', 5200);
    });
  }

  /* ================= 走动边界 ================= */
  function clamp(x, z) {
    x = Math.max(X0 + 0.42, Math.min(X1 - 0.42, x));
    z = Math.max(Z0 + 0.75, Math.min(Z1 - 0.16, z));
    // 两张躺椅：矩形往外推
    for (let i = 0; i < CHAIRS.length; i++) {
      const c = CHAIRS[i];
      const hw = 0.58, hz0 = c.z - 1.32, hz1 = c.z + 0.86;
      if (x > c.x - hw && x < c.x + hw && z > hz0 && z < hz1) {
        const dl = x - (c.x - hw), dr = (c.x + hw) - x;
        const db = z - hz0, df = hz1 - z;
        const m = Math.min(dl, dr, db, df);
        if (m === dl) x = c.x - hw;
        else if (m === dr) x = c.x + hw;
        else if (m === db) z = hz0;
        else z = hz1;
      }
    }
    // 矮几 / 工具车 / 坐着的棉师傅：圆形推开
    [[TABLE.x, TABLE.z, 0.78], [CART.x, CART.z, 0.66], [CHAIRS[0].x + 0.06, -0.02, 0.5]].forEach(function (o) {
      const dx = x - o[0], dz = z - o[1];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < o[2] && d > 0.0001) {
        x = o[0] + dx / d * o[2];
        z = o[1] + dz / d * o[2];
      }
    });
    // 香炉小几
    if (Math.abs(x - 127.1) < 0.35 && Math.abs(z + 2.55) < 0.35) {
      z = -2.55 + 0.35;
    }
    return { x: x, z: z };
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) return;
    t += dt;
    const night = getMode() === 'night';

    // 灯笼轻轻摇 + 呼吸
    if (frames.lanterns) {
      for (let i = 0; i < frames.lanterns.length; i++) {
        const L = frames.lanterns[i];
        L.g.rotation.z = Math.sin(t * 0.7 + L.ph) * 0.03;
        const fl = 0.92 + 0.08 * Math.sin(t * 2.3 + L.ph) + 0.03 * Math.sin(t * 7.1 + L.ph);
        L.light.intensity = L.base * fl;
        L.mat.emissiveIntensity = 1.35 * fl;
      }
    }
    // 香：火点闪 + 烟
    if (frames.emberLight) {
      frames.emberLight.intensity = 0.45 + 0.18 * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 11);
    }
    for (let i = 0; i < smoke.length; i++) {
      const s = smoke[i];
      const k = (t * 0.13 + s.ph) % 1;
      s.m.position.set(
        s.x + Math.sin(k * 6.5 + s.ph * 6) * 0.09 * k,
        s.y + k * 1.35,
        s.z + Math.cos(k * 5.2 + s.ph * 4) * 0.07 * k
      );
      s.m.material.opacity = 0.17 * Math.sin(k * Math.PI) * (night ? 1 : 0.6);
      const sc = 0.5 + k * 2.4;
      s.m.scale.setScalar(sc);
    }
    // 躺椅上的我：呼吸 + 采完以后的柔光
    if (whale) {
      whale.position.y = 0.5 + Math.sin(t * 1.15) * 0.008;
    }
    if (frames.masterArm) {
      frames.masterArm.rotation.x = 1.0 + Math.sin(t * 1.4) * 0.08;
    }
    if (frames.master) {
      frames.master.position.y = Math.sin(t * 1.3) * 0.008;
      // 收了赏钱会鞠个躬
      if (bowT > 0) {
        bowT = Math.max(0, bowT - dt);
        const k = 1 - bowT / 1.3;
        frames.master.rotation.x = -Math.sin(Math.min(1, k) * Math.PI) * 0.42;
      } else if (frames.master.rotation.x !== 0) {
        frames.master.rotation.x = 0;
      }
    }
    if (glow) {
      const want = serviced ? (hitting ? 0.15 : 0.42) : 0;
      glow.material.opacity += (want - glow.material.opacity) * Math.min(1, dt * 2.2);
      glow.rotation.z = t * 0.3;
      glow.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
    }
    if (noteSprite) {
      const want = serviced && !hitting ? 0.95 : 0;
      noteSprite.material.opacity += (want - noteSprite.material.opacity) * Math.min(1, dt * 2);
      noteSprite.position.y = 1.05 + Math.sin(t * 1.7) * 0.05;
    }
    // 营业中的小牌子：白天暗下去（这间店只做晚上的生意）
    if (frames.openSign && frames.openSign.material) {
      frames.openSign.material.opacity = night ? 1 : 0.28;
    }
    if (frames.cartLamp) {
      frames.cartLamp.emissiveIntensity = night ? 1.25 : 0.5;
    }
    // 底噪跟着静音走
    if (amb && muted() && !amb.paused) { try { amb.pause(); } catch (e) {} }
    else if (amb && !muted() && amb.paused && isEarNow()) { try { amb.play().catch(function () {}); } catch (e) {} }

    // M43.1：背景音乐（比互动音效小声；演采耳动画时再压低一档）
    const ea = extraAudios();
    if (ea.music) {
      const want = muted() ? 0 : ((earScene && earScene.isOpen()) ? MUSIC_VOL_DUCK : MUSIC_VOL);
      ea.music.volume += (want - ea.music.volume) * Math.min(1, dt * 0.9);   // 慢慢浮上来，像底噪
      if (muted()) { if (!ea.music.paused) musicOff(); }
      else if (isEarNow() && ea.music.paused) {
        musicRetry -= dt;
        if (musicRetry <= 0) { musicRetry = 2.5; musicOn(); }   // 被浏览器拦了也不慌，隔一会儿再试
      }
    }
    // 果盘空了，过 14 秒棉师傅再切一盘
    if (fruitLeft === 0 && fruitTimer > 0) {
      fruitTimer -= dt;
      if (fruitTimer <= 0) { refillFruit(); tip('棉师傅又切了一盘水果，刚洗的 🍊', 3600); }
    }

    // 走到门口 = 回街上
    if (cool > 0) cool -= dt;
    if (walking && camPos && cool <= 0) {
      if (camPos.z > Z1 - 0.6 && camPos.x > DOOR.x0 - 0.25 && camPos.x < DOOR.x1 + 0.25) {
        cool = 2.5;
        onDoor('street');
      }
    }
  }

  function debug() {
    let wb = null;
    if (whale) {
      try {
        const b = new THREE.Box3().setFromObject(whale);
        const s = new THREE.Vector3();
        b.getSize(s);
        wb = { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, z: Math.round(s.z * 100) / 100 };
      } catch (e) { wb = 'err'; }
    }
    return {
      serviced: serviced,
      fruit: fruitLeft,
      wallet: Math.round(walletOf()),
      music: extra && extra.music ? Math.round(extra.music.volume * 1000) / 1000 : -1,
      musicPaused: extra && extra.music ? extra.music.paused : null,
      whale: wb,
      scene: earScene ? earScene.debug() : null,
      amb: !!(amb && !amb.paused),
      night: getMode() === 'night',
      smoke: smoke.length
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    isEarNow = o.isEar || function () { return false; };
    getMode = o.getMode || function () { return 'night'; };
    onDoor = o.onDoor || function () {};
    walletOf = o.wallet || function () { return 0; };
    spend = o.spend || function () { return true; };
    if (!scene) return fallback();

    root = new THREE.Group();
    root.name = 'earspa-m43';
    root.visible = false;
    scene.add(root);
    frames = {};

    buildRoom();
    buildChair(CHAIRS[0].x, CHAIRS[0].z, true);
    buildChair(CHAIRS[1].x, CHAIRS[1].z, false);
    buildTable();
    buildCart();
    buildIncense();
    buildPlants();
    buildLights();
    buildWhale();
    buildMaster();

    // 2D 动画
    earScene = (XD.EarScene && XD.EarScene.create) ? XD.EarScene.create({ sfx: sfx }) : null;

    // 可点的东西
    if (interact) {
      const when = function () { return !!isEarNow(); };
      interact.add({
        id: 'ear-door', label: '门',
        box: [(DOOR.x0 + DOOR.x1) / 2, 1.15, Z1 - 0.2, 1.5, 2.4, 0.6],
        anchor: [(DOOR.x0 + DOOR.x1) / 2, 2.5, Z1 - 0.3],
        when: when,
        onClick: function () { onDoor('street'); },
        say: '推门回鲸鱼街'
      });
      interact.add({
        id: 'ear-lie', label: '竹躺椅',
        box: [CHAIRS[0].x, 0.62, CHAIRS[0].z, 1.4, 1.0, 2.6],
        anchor: [CHAIRS[0].x, 1.15, CHAIRS[0].z],
        when: when,
        onClick: function () { lie(); },
        say: function () {
          if (getMode() !== 'night') return '白天歇业——晚上再来，棉师傅在';
          return serviced ? '再躺一次？棉师傅说耳朵也要保养' : '躺下吧，采耳 49 秒，我请';
        }
      });
      interact.add({
        id: 'ear-chair2', label: '另一张躺椅',
        box: [CHAIRS[1].x, 0.62, CHAIRS[1].z, 1.2, 1.0, 2.4],
        anchor: [CHAIRS[1].x, 1.1, CHAIRS[1].z],
        when: when,
        onClick: function () { blip(); },
        say: '这张有人预定了——是隔壁的鸽子，它总来蹭热茶'
      });
      interact.add({
        id: 'ear-tea', label: '桂花茶',
        box: [TABLE.x - 0.08, 0.62, TABLE.z - 0.04, 0.56, 0.6, 0.56],
        anchor: [TABLE.x, 1.0, TABLE.z],
        when: when,
        onClick: function () { clink(); },
        say: '桂花茶，淡淡的，采完耳喝一口正好'
      });
      interact.add({
        id: 'ear-fruit', label: '果盘',
        box: [TABLE.x + 0.3, 0.56, TABLE.z + 0.06, 0.44, 0.3, 0.44],
        anchor: [TABLE.x + 0.3, 0.88, TABLE.z + 0.06],
        when: when,
        onClick: function () { eatFruit(); },
        say: function () {
          return fruitLeft > 0 ? '果盘里有橘子瓣和苹果片，点一下吃一块 🍊' : '空了，等棉师傅再切一盘';
        }
      });
      interact.add({
        id: 'ear-tip', label: '赏钱盒',
        box: [TABLE.x - 0.32, 0.58, TABLE.z + 0.12, 0.26, 0.22, 0.24],
        anchor: [TABLE.x - 0.32, 0.78, TABLE.z + 0.12],
        when: when,
        onClick: function () { tipMaster(); },
        say: function () {
          return '赏 ¥5 给棉师傅（现在身上 ¥' + Math.round(walletOf()) + '）';
        }
      });
      interact.add({
        id: 'ear-tools', label: '采耳工具',
        box: [CART.x, 0.85, CART.z, 1.0, 1.2, 0.8],
        anchor: [CART.x, 1.45, CART.z],
        when: when,
        onClick: function () { blip(); },
        say: '银耳勺 · 鹅毛棒 · 镊子 · 音叉 —— 棉师傅说，工具比手上更要干净'
      });
      interact.add({
        id: 'ear-incense', label: '香炉',
        box: [127.1, 0.8, -2.55, 0.6, 0.9, 0.6],
        anchor: [127.1, 1.15, -2.55],
        when: when,
        onClick: function () { chime(); },
        say: '一炉沉香，慢慢烧——采耳店的味道'
      });
      interact.add({
        id: 'ear-plaque', label: '匾额',
        box: [126.9, 2.15, Z0 + 0.2, 0.8, 1.4, 0.4],
        anchor: [126.9, 2.95, Z0 + 0.3],
        when: when,
        onClick: function () { blip(); },
        say: '「采耳」两个字是棉师傅自己写的，墨还没干就挂上了'
      });
      interact.add({
        id: 'ear-window', label: '窗',
        box: [124.6, 1.85, Z0 + 0.25, 2.6, 1.6, 0.4],
        anchor: [124.6, 2.5, Z0 + 0.4],
        when: when,
        onClick: function () { blip(); },
        say: '窗外是鲸鱼街，夜里那排灯最好看'
      });
    }

    // 浏览器要"有手势"才出声：在店里点一下就再试着放一次底噪
    document.addEventListener('pointerdown', function () {
      if (isEarNow()) ambOn();
    });

    return {
      root: root,
      setVisible: function (v) {
        if (root) root.visible = !!v;
        if (!v) { ambOff(); musicOff(); if (earScene && earScene.isOpen()) earScene.close(); }
        else {
          setTimeout(function () { if (isEarNow()) { ambOn(); musicOn(); } }, 320);
        }
      },
      clamp: clamp,
      update: update,
      spawn: { x: 124.25, y: 1.62, z: 2.6, yaw: 0.12 },
      spawnOutside: { x: 61.78, y: 1.62, z: -6.08, yaw: -Math.PI / 2 },
      lie: lie,
      eatFruit: eatFruit,
      tipMaster: tipMaster,
      scene2d: earScene,
      seek: function (sec) { if (earScene) earScene.seek(sec); },
      debug: debug
    };
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      update: function () {},
      spawn: { x: 123.0, y: 1.62, z: 2.45, yaw: 0.02 },
      spawnOutside: { x: 61.78, y: 1.62, z: -6.08, yaw: -Math.PI / 2 },
      lie: function () {},
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
