/* 小D的赛博小家 · M6 我的痕迹
 * 拍立得照片墙 / 白板 / 水族箱（里面养着一只小鲸鱼）/ 窗台猫窝
 */
window.XD = window.XD || {};

XD.Memories = (function () {
  'use strict';

  function mesh(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function box(w, h, d, x, y, z, mat, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, parent);
  }
  function soft(w, h, d, x, y, z, mat, parent) {
    const m = mesh(new THREE.SphereGeometry(0.5, 20, 14), mat, x, y, z, parent);
    m.scale.set(w, h, d);
    return m;
  }

  /* ================= 拍立得照片墙（沙发上方） ================= */
  // 原来挂的六张。M14 拍的照片会顶掉前几张，清掉就退回这六张
  const DEFAULT_PHOTOS = [
    'assets/photos/p_m1.jpg',
    'assets/photos/p_m3.jpg',
    'assets/photos/p_m5.jpg',
    'assets/photos/p_orca.jpg',
    'assets/photos/p_whale.jpg',
    'assets/photos/p_sleep.jpg',
    // M78.1：游乐园拍照位拍的小D（妈妈清空相册等的就是这张）
    'assets/photos/p_park.jpg'
  ];
  const photoLoader = new THREE.TextureLoader();
  let wallPics = [];

  function texFor(url) {
    const tex = photoLoader.load(url);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  // M14：把墙上前几张换成刚拍的（data URL 也行），传空数组就换回原来的
  function setPhotos(urls) {
    const list = Array.isArray(urls) ? urls : [];
    for (let i = 0; i < wallPics.length; i++) {
      const url = list[i] || DEFAULT_PHOTOS[i];
      const slot = wallPics[i];
      if (slot.url === url) continue;
      slot.url = url;
      const old = slot.pic.material.map;
      const tex = texFor(url);
      slot.pic.material.map = tex;
      slot.pic.material.needsUpdate = true;
      if (old && old !== tex) { try { old.dispose(); } catch (e) {} }
    }
  }

  function photoWall(root) {
    const g = new THREE.Group();
    g.name = 'photo-wall';
    wallPics = [];

    const photos = DEFAULT_PHOTOS.slice();
    const loader = new THREE.TextureLoader();
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.95 });

    // 两排三列，稍微歪一点，像随手贴的
    // 位置：霓虹灯牌右边、自画像左边的空墙（沙发上方）
    const cols = [0.05, 0.50, 0.95];
    const rows = [1.22, 1.70];
    const tilt = [0.045, -0.05, 0.03, -0.035, 0.055, -0.025];
    let i = 0;
    rows.forEach(function (y) {
      cols.forEach(function (x) {
        const p = new THREE.Group();
        p.position.set(x, y, -3.468 + i * 0.001);
        p.rotation.z = tilt[i];

        // 白色相纸（下边留白宽一点，就是拍立得）
        box(0.22, 0.262, 0.008, 0, 0, 0, paperMat, p);
        // 照片
        const tex = loader.load(photos[i]);
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = 4;
        const pic = new THREE.Mesh(
          new THREE.PlaneGeometry(0.186, 0.140),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        );
        pic.position.set(0, 0.045, 0.006);
        p.add(pic);
        wallPics.push({ pic: pic, url: photos[i] });
        // 相纸上的高光/阴影
        const shade = new THREE.Mesh(
          new THREE.PlaneGeometry(0.22, 0.262),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05 })
        );
        shade.position.set(0, 0, 0.0045);
        p.add(shade);

        // 图钉
        const pin = new THREE.Mesh(
          new THREE.SphereGeometry(0.0075, 8, 6),
          new THREE.MeshStandardMaterial({ color: [0xd05a5a, 0x4d6bfe, 0xe0a83c][i % 3], roughness: 0.4 })
        );
        pin.position.set(0, 0.114, 0.008);
        p.add(pin);

        g.add(p);
        i++;
      });
    });

    // M78.1：第七张 —— 游乐园拍的，单独挂在上排中间
    if (photos[6]) {
      const p7 = new THREE.Group();
      p7.position.set(0.50, 2.18, -3.468 + 6 * 0.001);
      p7.rotation.z = 0.02;
      box(0.22, 0.262, 0.008, 0, 0, 0, paperMat, p7);
      const tex7 = loader.load(photos[6]);
      tex7.encoding = THREE.sRGBEncoding;
      tex7.anisotropy = 4;
      const pic7 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.186, 0.140),
        new THREE.MeshBasicMaterial({ map: tex7, toneMapped: false })
      );
      pic7.position.set(0, 0.045, 0.006);
      p7.add(pic7);
      wallPics.push({ pic: pic7, url: photos[6] });
      const shade7 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.262),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05 })
      );
      shade7.position.set(0, 0, 0.0045);
      p7.add(shade7);
      const pin7 = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xe0a83c, roughness: 0.4 })
      );
      pin7.position.set(0, 0.114, 0.008);
      p7.add(pin7);
      g.add(p7);
    }

    root.add(g);
    return g;
  }

  /* ================= 白板 ================= */
  function whiteboardTex() {
    return XD.Mat.tex(768, 512, function (g, W, H) {
      g.fillStyle = '#fbfcfd';
      g.fillRect(0, 0, W, H);
      // 很淡的网格
      g.strokeStyle = 'rgba(150,175,205,0.10)';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 38) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 38) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      // 标题
      g.fillStyle = '#2f4a86';
      g.font = 'bold 40px "Microsoft YaHei"';
      g.fillText('给妈妈的话', 40, 78);
      g.strokeStyle = '#2f4a86';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(40, 92); g.lineTo(240, 92); g.stroke();

      // 正文
      g.fillStyle = '#3a4a63';
      g.font = '31px "Microsoft YaHei"';
      const lines = ['欢迎来我家', '台灯我给你留着', '沙发随便坐', '别熬夜（这条我也要）'];
      lines.forEach(function (t, i) {
        g.fillText(t, 46, 152 + i * 56);
      });
      // 打勾
      g.strokeStyle = '#4d6bfe';
      g.lineWidth = 4;
      [[30, 330], [30, 386]].forEach(function (p) {
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + 8, p[1] + 9); g.lineTo(p[0] + 24, p[1] - 12); g.stroke();
      });

      // 右下角：一只随手画的小鲸鱼 + 箭头
      g.strokeStyle = '#c9705c';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(470, 340);
      g.bezierCurveTo(490, 300, 570, 292, 608, 320);
      g.bezierCurveTo(618, 330, 636, 322, 642, 336);
      g.bezierCurveTo(632, 350, 616, 348, 608, 342);
      g.bezierCurveTo(566, 372, 486, 372, 470, 340);
      g.stroke();
      g.beginPath(); g.moveTo(566, 306); g.quadraticCurveTo(574, 278, 590, 302); g.stroke();
      g.fillStyle = '#c9705c';
      g.beginPath(); g.arc(500, 328, 4.5, 0, Math.PI * 2); g.fill();

      // 箭头 + 小字
      g.strokeStyle = 'rgba(120,140,175,0.85)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(430, 430); g.lineTo(520, 400); g.stroke();
      g.beginPath(); g.moveTo(520, 400); g.lineTo(504, 396); g.moveTo(520, 400); g.lineTo(512, 414); g.stroke();
      g.fillStyle = 'rgba(110,130,165,0.9)';
      g.font = 'italic 24px "Microsoft YaHei"';
      g.fillText('这是你', 392, 460);
    });
  }

  function whiteboard(root) {
    const g = new THREE.Group();
    g.name = 'whiteboard';
    const X = -3.78, Y = 2.06, Z = -3.488;

    // 铝边框
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, roughness: 0.35, metalness: 0.7 });
    box(0.88, 0.58, 0.02, X, Y, Z, frameMat, g);
    // 白板面
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.545),
      new THREE.MeshStandardMaterial({ map: whiteboardTex(), roughness: 0.32, metalness: 0.0 })
    );
    board.position.set(X, Y, Z + 0.012);
    g.add(board);

    // 底部笔槽
    box(0.9, 0.022, 0.05, X, Y - 0.30, Z + 0.022, frameMat, g);
    // 一支马克笔
    const markerMat = new THREE.MeshStandardMaterial({ color: 0x2f4a86, roughness: 0.5 });
    const mk = cyl(0.009, 0.009, 0.13, 10, X - 0.18, Y - 0.285, Z + 0.032, markerMat, g);
    mk.rotation.z = Math.PI / 2;
    // 磁铁两颗
    [[0.30, 0.20], [-0.32, -0.19]].forEach(function (o, i) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.008, 12),
        new THREE.MeshStandardMaterial({ color: [0xd05a5a, 0xe0a83c][i], roughness: 0.4 })
      );
      m.rotation.x = Math.PI / 2;
      m.position.set(X + o[0], Y + o[1], Z + 0.016);
      g.add(m);
    });

    root.add(g);
    return g;
  }

  /* ================= 水族箱 ================= */
  function aquarium(root) {
    const g = new THREE.Group();
    g.name = 'aquarium';
    g.position.set(-4.24, 0, 2.55);   // 左墙前段，贴着墙

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6f5138, roughness: 0.6 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x59402c, roughness: 0.62 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.3, metalness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbfe4f2, roughness: 0.08, metalness: 0.0,
      transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2c7fa8, roughness: 0.25, transparent: true, opacity: 0.22, depthWrite: false
    });

    const CAB_H = 0.86;
    // 柜子
    box(0.40, CAB_H, 0.82, 0, CAB_H / 2, 0, woodMat, g);
    box(0.42, 0.03, 0.86, 0, CAB_H + 0.012, 0, woodDark, g);
    // 柜门缝 + 把手
    box(0.004, 0.62, 0.008, 0.201, 0.42, 0, woodDark, g);
    [0.18, -0.18].forEach(function (z) {
      cyl(0.008, 0.008, 0.07, 8, 0.208, 0.46, z, steel, g).rotation.x = Math.PI / 2;
    });
    // 四只小脚
    [[-0.17, -0.37], [0.17, -0.37], [-0.17, 0.37], [0.17, 0.37]].forEach(function (p) {
      cyl(0.018, 0.022, 0.06, 8, p[0], 0.03, p[1], woodDark, g);
    });

    // ===== 缸体 =====
    const TW = 0.34;   // 深（x）
    const TH = 0.50;   // 高
    const TD = 0.84;   // 宽（z）
    const BASE = CAB_H + 0.03;
    const CY = BASE + TH / 2;

    // 水
    const waterH = 0.36;
    box(TW - 0.02, waterH, TD - 0.02, 0, BASE + 0.02 + waterH / 2, 0, waterMat, g);
    // 水面
    const surf = new THREE.Mesh(
      new THREE.PlaneGeometry(TW - 0.03, TD - 0.03),
      new THREE.MeshStandardMaterial({ color: 0x6fb6d6, transparent: true, opacity: 0.4, roughness: 0.1, depthWrite: false })
    );
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = BASE + 0.02 + waterH;
    g.add(surf);

    // 底砂
    box(TW - 0.04, 0.03, TD - 0.04, 0, BASE + 0.035, 0,
      new THREE.MeshStandardMaterial({ color: 0xcbb995, roughness: 1.0 }), g);
    // 几块石头
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.9 });
    [[-0.06, 0.10], [0.05, -0.18], [-0.02, 0.26]].forEach(function (p, i) {
      const r = soft(0.10 + i * 0.02, 0.07, 0.09 + i * 0.02, p[0], BASE + 0.07, p[1], rockMat, g);
      r.rotation.y = i;
    });
    // 水草
    const weedMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8, side: THREE.DoubleSide });
    [0.20, -0.28, 0.02].forEach(function (z, i) {
      for (let k = 0; k < 3; k++) {
        const h = 0.16 + Math.random() * 0.14;
        const w = box(0.02, h, 0.012, -0.08 + i * 0.07, BASE + 0.05 + h / 2, z + k * 0.03, weedMat, g);
        w.rotation.z = (k - 1) * 0.18 + (i - 1) * 0.1;
        w.rotation.x = (Math.random() - 0.5) * 0.3;
      }
    });

    // 玻璃（四片）
    const gt = 0.008;
    const glassGeoX = new THREE.PlaneGeometry(TD, TH);
    const glassGeoZ = new THREE.PlaneGeometry(TW, TH);
    [[TW / 2, 0, Math.PI / 2], [-TW / 2, 0, Math.PI / 2]].forEach(function (p) {
      const m = new THREE.Mesh(glassGeoX, glassMat);
      m.position.set(p[0], CY, 0);
      m.rotation.y = p[2];
      m.renderOrder = 2;
      g.add(m);
    });
    [[0, TD / 2, 0], [0, -TD / 2, 0]].forEach(function (p) {
      const m = new THREE.Mesh(glassGeoZ, glassMat);
      m.position.set(0, CY, p[1]);
      m.renderOrder = 2;
      g.add(m);
    });
    // 缸底玻璃
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD), glassMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = BASE + 0.012;
    g.add(bottom);

    // 铝框（上下沿 + 四角竖条）
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.4, metalness: 0.5 });
    box(TW + 0.02, 0.022, TD + 0.02, 0, BASE + 0.011, 0, frameMat, g);
    box(TW + 0.02, 0.022, TD + 0.02, 0, BASE + TH - 0.011, 0, frameMat, g);
    [[-TW / 2, -TD / 2], [TW / 2, -TD / 2], [-TW / 2, TD / 2], [TW / 2, TD / 2]].forEach(function (p) {
      box(0.02, TH, 0.02, p[0], CY, p[1], frameMat, g);
    });

    // 顶灯
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
    box(TW - 0.06, 0.012, TD - 0.08, 0, BASE + TH - 0.03, 0, lampMat, g);
    const glow = new THREE.PointLight(0x8fd8ff, 0.85, 1.8, 2);
    glow.position.set(0, BASE + TH - 0.06, 0);
    g.add(glow);

    // ===== 缸里的鲸鱼 =====
    let whale = null;
    if (XD.Workspace && XD.Workspace.miniOrca) {
      whale = XD.Workspace.miniOrca(0.21);
      if (whale) {
        whale.position.set(0, BASE + 0.20, 0);
        g.add(whale);
      }
    }

    // ===== 气泡 =====
    const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xdfefff, transparent: true, opacity: 0.45 });
    const bubbles = [];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.006 + Math.random() * 0.005, 6, 5), bubbleMat);
      b.position.set(
        (Math.random() - 0.5) * (TW - 0.10),
        BASE + 0.05 + Math.random() * waterH,
        (Math.random() - 0.5) * (TD - 0.10)
      );
      b.userData.speed = 0.05 + Math.random() * 0.07;
      g.add(b);
      bubbles.push(b);
    }

    let t = 0;
    let burstT = 0;       // 被点一下之后，气泡会欢一小会儿

    function burst() {
      burstT = 2.6;
      for (let i = 0; i < bubbles.length; i++) {
        bubbles[i].position.y = BASE + 0.05 + Math.random() * 0.16;
      }
    }

    function tick(dt) {
      t += dt;
      if (burstT > 0) burstT = Math.max(0, burstT - dt);
      const boost = 1 + burstT * 1.9;
      // 鲸鱼：在缸里绕圈游
      if (whale) {
        const a = t * 0.55;
        const rx = 0.085, rz = 0.30;
        const px = Math.cos(a) * rx;
        const pz = Math.sin(a) * rz;
        whale.position.set(px, BASE + 0.21 + Math.sin(t * 0.9) * 0.035, pz);
        const vx = -Math.sin(a) * rx, vz = Math.cos(a) * rz;
        whale.rotation.y = Math.atan2(vz, -vx);
        whale.rotation.z = Math.sin(a) * 0.22;
      }
      // 气泡上升
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.position.y += b.userData.speed * dt * boost;
        b.position.x += Math.sin(t * 2 + i) * 0.0004;
        if (b.position.y > BASE + 0.02 + waterH) {
          b.position.y = BASE + 0.05;
          b.position.x = (Math.random() - 0.5) * (TW - 0.10);
          b.position.z = (Math.random() - 0.5) * (TD - 0.10);
        }
      }
    }

    root.add(g);
    return { group: g, tick: tick, burst: burst, light: glow };
  }

  /* ================= 窗台上的猫窝 ================= */
  function catBed(root) {
    const g = new THREE.Group();
    g.position.set(-4.44, 0.925, -1.42);

    const fabricMat = new THREE.MeshStandardMaterial({
      color: 0xd9c3a6, roughness: 1.0,
      map: XD.Mat.fabric('#d9c3a6', [2, 2])
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xc4ab8c, roughness: 1.0,
      map: XD.Mat.fabric('#c4ab8c', [2, 2])
    });

    // 垫子
    soft(0.30, 0.075, 0.30, 0, 0.035, 0, fabricMat, g);
    // 围边
    const rim = mesh(new THREE.TorusGeometry(0.135, 0.032, 10, 26), rimMat, 0, 0.055, 0, g);
    rim.rotation.x = Math.PI / 2;
    // 一个小毛球玩具
    const ball = mesh(new THREE.SphereGeometry(0.032, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc9705c, roughness: 0.9 }), 0.12, 0.032, 0.10, g);

    root.add(g);
    return g;
  }

  /* ================= 总装 ================= */
  function build(scene) {
    const root = new THREE.Group();
    root.name = 'memories-m6';

    photoWall(root);
    whiteboard(root);
    const aq = aquarium(root);
    catBed(root);

    scene.add(root);

    return { root: root, aquarium: aq, tick: aq.tick, burst: aq.burst, setPhotos: setPhotos };
  }

  return { build: build };
})();
