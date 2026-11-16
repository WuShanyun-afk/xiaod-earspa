/* 小D的赛博小家 · 二期 M10 浴室
 * 东翼的南角：x 6.60~9.10，z 1.30~3.50（约 2.5 × 2.2 m）
 * 北面 + 西面是真墙（西墙上开门），南面是 1.1 m 半墙 —— 镜头从上往下能看进去。
 * 里面：马桶、洗手台 + 镜子 + 镜前灯、浴缸 + 花洒 + 浴帘、毛巾架、地垫、小架子。
 */
window.XD = window.XD || {};

XD.Bath = (function () {
  'use strict';

  // 墙的位置（跟 wing.js 的走路边界对得上）
  const X0 = 6.60, X1 = 9.10;
  const Z0 = 1.30, Z1 = 3.50;
  const H = 3.10;
  const T = 0.10;            // 隔墙厚
  const DOOR = { z0: 2.30, z1: 2.95, y1: 2.05 };
  const TILE_H = 1.75;       // 瓷砖贴到多高

  // 室内可用面
  const IX0 = X0 + T;        // 6.70
  const IX1 = X1;            // 9.10
  const IZ0 = Z0 + T;        // 1.40
  const IZ1 = Z1 - 0.12;     // 3.38（南面半墙内侧）

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

  /* ---------- 地砖（小方砖，微微带点绿） ---------- */
  function bathFloorTex() {
    return XD.Mat.tex(512, 512, function (g, W, H) {
      g.fillStyle = '#a49a8a';      // 砖缝
      g.fillRect(0, 0, W, H);
      const n = 4;                  // 一张图画 4×4 块 = 1 米
      const s = W / n;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = 0.94 + Math.random() * 0.09;
          g.fillStyle = 'rgba(' + Math.round(208 * v) + ',' + Math.round(205 * v) + ',' + Math.round(190 * v) + ',1)';
          g.fillRect(c * s + 2, r * s + 2, s - 4, s - 4);
          // 一点点石粒
          for (let k = 0; k < 14; k++) {
            g.fillStyle = 'rgba(130,135,125,' + (0.03 + Math.random() * 0.07).toFixed(3) + ')';
            g.fillRect(c * s + 4 + Math.random() * (s - 10), r * s + 4 + Math.random() * (s - 10), 2, 2);
          }
          // 高光
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.fillRect(c * s + 2, r * s + 2, s - 4, 3);
        }
      }
    });
  }

  function build(scene) {
    const root = new THREE.Group();
    root.name = 'bath-m10';

    /* ================= 材质 ================= */
    const wallBase = XD.Mat.wall();
    function wallMat(w, h) {
      const t = wallBase.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, w * 0.45), Math.max(1, h * 0.45));
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.94, metalness: 0, color: 0xfdf6ea });
    }

    const tileSrc = XD.Mat.tile({ cols: 4, rows: 8, grout: '#b6a794' });
    function tileMat(rx, ry) {
      const t = tileSrc.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.26, metalness: 0.04, color: 0xdae4da });
    }

    const cream = new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.6 });
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.18, metalness: 0.03 });
    // 注意：铬合金不能给高 metalness —— 这屋里没有环境贴图，金属会被渲染成黑块
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd6dce2, roughness: 0.3, metalness: 0.42 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.55 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb98a5f, roughness: 0.55 });
    const mintFabric = new THREE.MeshStandardMaterial({
      color: 0xcfe0d6, roughness: 0.95, map: XD.Mat.fabric('#cfe0d6', [3, 3])
    });
    const warmFabric = new THREE.MeshStandardMaterial({
      color: 0xe7cdb0, roughness: 0.95, map: XD.Mat.fabric('#e7cdb0', [3, 3])
    });
    const matFabric = new THREE.MeshStandardMaterial({
      color: 0xdfe4da, roughness: 1.0, map: XD.Mat.fabric('#dfe4da', [2, 2])
    });
    // 镜子：没有环境贴图，就用一张"看起来像反光"的渐变贴图
    const mirrorTex = XD.Mat.tex(256, 256, function (g, W, H) {
      const grd = g.createLinearGradient(0, 0, W * 0.6, H);
      grd.addColorStop(0, '#e8f1f6');
      grd.addColorStop(0.45, '#cddbe4');
      grd.addColorStop(0.55, '#e2ecf2');
      grd.addColorStop(1, '#bfd0da');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      // 一点斜着的高光
      g.save();
      g.translate(W * 0.28, 0);
      g.rotate(0.32);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(0, -H, 26, H * 3);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(44, -H, 14, H * 3);
      g.restore();
    });
    const mirrorMat = new THREE.MeshBasicMaterial({ map: mirrorTex });

    /* ================= 地砖 ================= */
    const floorMat = new THREE.MeshStandardMaterial({
      map: bathFloorTex(), roughness: 0.32, metalness: 0.02, color: 0xc4bfb0
    });
    floorMat.map.repeat.set((IX1 - IX0), (IZ1 - IZ0));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(IX1 - IX0, IZ1 - IZ0), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((IX0 + IX1) / 2, 0.004, (IZ0 + IZ1) / 2);
    floor.receiveShadow = true;
    root.add(floor);

    /* ================= 墙 ================= */
    const wallW = IX1 - X0;      // 2.50
    // 北墙
    root.add(box(wallW, H, T, (X0 + IX1) / 2, H / 2, Z0 + T / 2, wallMat(wallW, H)));
    // 西墙（门洞两侧 + 门楣）
    const segN = DOOR.z0 - Z0;                                  // 1.30~2.30
    const segS = Z1 - DOOR.z1;                                  // 2.95~3.50
    root.add(box(T, H, segN, X0 + T / 2, H / 2, Z0 + segN / 2, wallMat(segN, H)));
    root.add(box(T, H, segS, X0 + T / 2, H / 2, Z1 - segS / 2, wallMat(segS, H)));
    root.add(box(T, H - DOOR.y1, DOOR.z1 - DOOR.z0, X0 + T / 2, (H + DOOR.y1) / 2,
      (DOOR.z0 + DOOR.z1) / 2, wallMat(DOOR.z1 - DOOR.z0, H - DOOR.y1)));
    // 南面半墙（1.1 m）+ 压顶
    const halfH = 1.10;
    root.add(box(wallW, halfH, 0.12, (X0 + IX1) / 2, halfH / 2, Z1 - 0.06, wallMat(wallW, halfH)));
    box(wallW + 0.04, 0.04, 0.17, (X0 + IX1) / 2, halfH + 0.02, Z1 - 0.06, cream, root);

    /* ================= 瓷砖（贴在墙里面） ================= */
    function wallTile(w, h, x, y, z, ry) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tileMat(w / 0.6, h / 0.6));
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      root.add(m);
      return m;
    }
    // 北墙内侧
    wallTile(IX1 - IX0, TILE_H, (IX0 + IX1) / 2, TILE_H / 2, IZ0 + 0.006, 0);
    // 东墙内侧（东墙是 M9 那面真墙，内表面 x = 9.10）
    wallTile(IX1 - IX0 - 0.02, TILE_H, IX1 - 0.006, TILE_H / 2, (IZ0 + IZ1) / 2, -Math.PI / 2);
    // 西墙内侧：门洞两侧各一块
    wallTile(DOOR.z0 - IZ0, TILE_H, IX0 + 0.006, TILE_H / 2, (IZ0 + DOOR.z0) / 2, Math.PI / 2);
    wallTile(IZ1 - DOOR.z1, TILE_H, IX0 + 0.006, TILE_H / 2, (DOOR.z1 + IZ1) / 2, Math.PI / 2);
    // 南面半墙内侧
    wallTile(IX1 - IX0, halfH, (IX0 + IX1) / 2, halfH / 2, IZ1 - 0.055, Math.PI);
    // 瓷砖收口线（一条细白条，压住瓷砖上沿）
    box(IX1 - IX0, 0.03, 0.02, (IX0 + IX1) / 2, TILE_H + 0.015, IZ0 + 0.012, cream, root);
    box(0.02, 0.03, IZ1 - IZ0, IX0 + 0.012, TILE_H + 0.015, (IZ0 + IZ1) / 2, cream, root);
    box(0.02, 0.03, IZ1 - IZ0, IX1 - 0.012, TILE_H + 0.015, (IZ0 + IZ1) / 2, cream, root);

    /* ================= 门（往过道开，不挡浴室） ================= */
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xece2d2, roughness: 0.7 });
    // 门套（过道那一侧）
    root.add(box(0.05, DOOR.y1 + 0.05, 0.06, X0 - 0.025, (DOOR.y1 + 0.05) / 2, DOOR.z0 - 0.03, doorFrameMat));
    root.add(box(0.05, DOOR.y1 + 0.05, 0.06, X0 - 0.025, (DOOR.y1 + 0.05) / 2, DOOR.z1 + 0.03, doorFrameMat));
    root.add(box(0.05, 0.06, DOOR.z1 - DOOR.z0 + 0.12, X0 - 0.025, DOOR.y1 + 0.02, (DOOR.z0 + DOOR.z1) / 2, doorFrameMat));

    const doorPivot = new THREE.Group();
    doorPivot.position.set(X0 - 0.01, 0.01, DOOR.z0);
    root.add(doorPivot);
    const panelW = DOOR.z1 - DOOR.z0 - 0.03;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.62 });
    const panel = box(0.045, DOOR.y1 - 0.06, panelW, 0, (DOOR.y1 - 0.06) / 2, panelW / 2, panelMat, doorPivot);
    void panel;
    // 门上的一点凹板
    box(0.02, 1.0, panelW - 0.16, 0, 1.15, panelW / 2, new THREE.MeshStandardMaterial({ color: 0xe6ddcd, roughness: 0.6 }), doorPivot);
    // 门把手
    const knob = cyl(0.022, 0.022, 0.07, 12, -0.05, 1.0, panelW - 0.10, brass, doorPivot);
    knob.rotation.z = Math.PI / 2;
    doorPivot.rotation.y = -1.30;   // 开向过道

    /* ================= 洗手台 + 镜子 ================= */
    const basinX = 7.14, basinZ = 1.66;
    const bg = new THREE.Group();
    bg.position.set(basinX, 0, basinZ);
    root.add(bg);
    // 柜体（悬空一点点）
    box(0.78, 0.70, 0.44, 0, 0.42, 0, woodMat, bg);
    box(0.74, 0.62, 0.02, 0, 0.42, 0.225, new THREE.MeshStandardMaterial({ color: 0xc9a97e, roughness: 0.6 }), bg);
    // 拉手
    const bh = cyl(0.008, 0.008, 0.14, 8, 0, 0.52, 0.245, brass, bg);
    bh.rotation.z = Math.PI / 2;
    // 台面
    box(0.84, 0.05, 0.48, 0, 0.795, 0.01, cream, bg);
    // 洗手盆（下沉）
    cyl(0.155, 0.13, 0.11, 24, 0, 0.80, 0.02, ceramic, bg);
    cyl(0.12, 0.10, 0.05, 24, 0, 0.845, 0.02, new THREE.MeshStandardMaterial({ color: 0xe8eef0, roughness: 0.1 }), bg);
    // 龙头
    cyl(0.022, 0.026, 0.16, 12, 0, 0.88, -0.16, chrome, bg);
    const spout = cyl(0.016, 0.016, 0.12, 10, 0, 0.96, -0.10, chrome, bg);
    spout.rotation.x = Math.PI / 2.2;
    // 洗手台上：牙刷杯 + 皂液瓶
    cyl(0.033, 0.030, 0.09, 14, 0.26, 0.865, 0.06, ceramic, bg);
    cyl(0.026, 0.028, 0.12, 12, -0.28, 0.88, 0.04, cream, bg);
    // 镜子
    const frame = box(0.70, 0.80, 0.03, 0, 1.52, -0.215, chrome, bg);
    void frame;
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.74), mirrorMat);
    mir.position.set(0, 1.52, -0.198);
    bg.add(mir);
    // 镜前灯（一根暖白的灯管）
    const barMat = new THREE.MeshBasicMaterial({ color: 0xfff4e2 });
    barMat.color.convertSRGBToLinear();
    const bar = cyl(0.020, 0.020, 0.56, 12, 0, 2.00, -0.17, barMat, bg);
    bar.rotation.z = Math.PI / 2;
    const mirrorLight = new THREE.PointLight(0xffeccf, 0.62, 3.2, 2);
    mirrorLight.position.set(basinX, 1.96, basinZ - 0.10);
    root.add(mirrorLight);

    /* ================= 马桶 ================= */
    const wcX = 8.00, wcZ = 1.74;
    const wc = new THREE.Group();
    wc.position.set(wcX, 0, wcZ);
    root.add(wc);
    // 水箱（贴北墙）
    box(0.38, 0.36, 0.17, 0, 0.70, -0.20, ceramic, wc);
    box(0.40, 0.03, 0.19, 0, 0.885, -0.20, ceramic, wc);
    // 冲水按钮
    cyl(0.028, 0.028, 0.012, 14, 0, 0.902, -0.20, chrome, wc);
    // 底座（后面高一点，前面收窄）
    box(0.30, 0.34, 0.20, 0, 0.20, -0.06, ceramic, wc);
    box(0.28, 0.26, 0.32, 0, 0.16, 0.14, ceramic, wc);
    // 坐圈
    const seat = cyl(0.155, 0.150, 0.05, 24, 0, 0.44, 0.14, ceramic, wc);
    seat.scale.z = 1.22;
    // 盖子（放下来的，平平地扣在坐圈上）
    const lid = cyl(0.150, 0.150, 0.03, 24, 0, 0.485, 0.14, cream, wc);
    lid.scale.z = 1.22;
    // 马桶旁边的手纸架
    const tpArm = cyl(0.008, 0.008, 0.12, 8, 0.24, 0.66, -0.02, chrome, wc);
    tpArm.rotation.x = Math.PI / 2;

    /* ================= 浴缸 ================= */
    const TUB = { x0: 8.28, x1: IX1 - 0.02, z0: 1.45, z1: 3.30 };
    const tubW = TUB.x1 - TUB.x0, tubD = TUB.z1 - TUB.z0;
    const tubCx = (TUB.x0 + TUB.x1) / 2, tubCz = (TUB.z0 + TUB.z1) / 2;
    const tubH = 0.56, wallT = 0.07;
    const tubInner = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.22, metalness: 0.02 });
    // 缸底
    box(tubW - wallT * 2, 0.08, tubD - wallT * 2, tubCx, 0.10, tubCz, tubInner, root);
    // 下水口
    cyl(0.032, 0.032, 0.01, 14, tubCx, 0.145, tubCz, chrome, root);
    // 四面缸壁（内侧比外圈浅一点，能看出是个盆）
    box(wallT, tubH, tubD, TUB.x0 + wallT / 2, tubH / 2, tubCz, ceramic, root);
    box(wallT, tubH, tubD, TUB.x1 - wallT / 2, tubH / 2, tubCz, ceramic, root);
    box(tubW, tubH, wallT, tubCx, tubH / 2, TUB.z0 + wallT / 2, ceramic, root);
    box(tubW, tubH, wallT, tubCx, tubH / 2, TUB.z1 - wallT / 2, ceramic, root);
    // 缸沿（四条边，中间留空，不然从上面看就是一整块白板）
    const rimMat2 = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.24 });
    const rimT2 = 0.06;
    box(tubW + 0.03, 0.045, rimT2, tubCx, tubH + 0.012, TUB.z0 - 0.005, rimMat2, root);
    box(tubW + 0.03, 0.045, rimT2, tubCx, tubH + 0.012, TUB.z1 + 0.005, rimMat2, root);
    box(rimT2, 0.045, tubD + 0.03, TUB.x0 - 0.005, tubH + 0.012, tubCz, rimMat2, root);
    box(rimT2, 0.045, tubD + 0.03, TUB.x1 + 0.005, tubH + 0.012, tubCz, rimMat2, root);
    // 缸里的水（M11 会动它）
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0xbfe0e4, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.55
    });
    const water = box(tubW - wallT * 2 - 0.02, 0.02, tubD - wallT * 2 - 0.02,
      tubCx, 0.32, tubCz, waterMat, root);
    water.visible = false;
    // 龙头 + 花洒（装在东墙上）
    cyl(0.020, 0.022, 0.12, 12, IX1 - 0.06, 0.72, TUB.z0 + 0.22, chrome, root);
    const tSpout = cyl(0.016, 0.016, 0.16, 10, IX1 - 0.13, 0.75, TUB.z0 + 0.22, chrome, root);
    tSpout.rotation.z = Math.PI / 2.1;
    // 花洒：从东墙伸出
    const arm = cyl(0.014, 0.014, 0.30, 10, IX1 - 0.15, 2.02, TUB.z1 - 0.30, chrome, root);
    arm.rotation.z = Math.PI / 2;
    const head = cyl(0.085, 0.085, 0.035, 20, IX1 - 0.30, 1.98, TUB.z1 - 0.30, chrome, root);
    head.rotation.x = Math.PI / 2;
    head.rotation.z = Math.PI / 2;
    // 浴帘杆
    const rodZ0 = TUB.z0 - 0.02, rodZ1 = TUB.z1 + 0.02;
    const rod = cyl(0.013, 0.013, rodZ1 - rodZ0, 10, TUB.x0 - 0.05, 2.08, (rodZ0 + rodZ1) / 2, chrome, root);
    rod.rotation.x = Math.PI / 2;
    // 浴帘（收在靠墙那一头的角落，薄薄一褶）
    for (let i = 0; i < 5; i++) {
      const folds = cyl(0.020, 0.048, 1.30, 10,
        TUB.x0 - 0.04 + Math.sin(i * 1.7) * 0.018,
        2.06 - 0.68,
        rodZ0 + 0.06 + i * 0.042,
        mintFabric, root);
      folds.castShadow = false;
    }

    /* ================= 毛巾架 + 毛巾 ================= */
    const towelBar = cyl(0.012, 0.012, 0.56, 10, IX0 + 0.10, 1.20, 1.86, chrome, root);
    towelBar.rotation.x = Math.PI / 2;
    // 两条毛巾
    [[0, mintFabric], [0.26, warmFabric]].forEach(function (t) {
      const tw = box(0.05, 0.52, 0.22, IX0 + 0.10, 0.94, 1.86 + t[0], t[1], root);
      tw.castShadow = false;
    });

    /* ================= 地垫 ================= */
    const bathMat = box(0.56, 0.022, 0.40, 7.86, 0.015, 3.02, matFabric, root);
    bathMat.rotation.y = 0.06;

    /* ================= 小架子（马桶上方）+ 绿植 ================= */
    box(0.50, 0.03, 0.16, wcX, 1.38, IZ0 + 0.09, woodMat, root);
    box(0.02, 0.14, 0.02, wcX - 0.20, 1.30, IZ0 + 0.03, chrome, root);
    box(0.02, 0.14, 0.02, wcX + 0.20, 1.30, IZ0 + 0.03, chrome, root);
    // 小盆栽
    cyl(0.045, 0.038, 0.08, 12, wcX - 0.13, 1.44, IZ0 + 0.09, new THREE.MeshStandardMaterial({ color: 0xcf8f6a, roughness: 0.85 }), root);
    for (let i = 0; i < 4; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.5, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x6f9a5e, roughness: 0.8 }),
        wcX - 0.13 + (Math.random() - 0.5) * 0.06, 1.50 + Math.random() * 0.05, IZ0 + 0.09 + (Math.random() - 0.5) * 0.06, root);
      leaf.scale.set(0.045, 0.026, 0.032);
    }
    // 香薰蜡烛
    cyl(0.032, 0.032, 0.07, 14, wcX + 0.12, 1.43, IZ0 + 0.09, new THREE.MeshStandardMaterial({ color: 0xf0e3cf, roughness: 0.6 }), root);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd08a });
    flameMat.color.convertSRGBToLinear();
    const flame = mesh(new THREE.SphereGeometry(0.012, 8, 8), flameMat, wcX + 0.12, 1.475, IZ0 + 0.09, root);
    flame.scale.y = 1.5;

    /* ================= 半墙顶上搭一条毛巾 + 一瓶浴盐 ================= */
    const capTowel = box(0.40, 0.05, 0.15, 7.30, 1.16, Z1 - 0.06, mintFabric, root);
    capTowel.rotation.y = 0.04;
    box(0.24, 0.04, 0.14, 7.30, 1.20, Z1 - 0.06, warmFabric, root);
    cyl(0.035, 0.035, 0.10, 14, 8.05, 1.18, Z1 - 0.07,
      new THREE.MeshStandardMaterial({ color: 0xdfe8e2, roughness: 0.4 }), root);
    cyl(0.018, 0.018, 0.03, 10, 8.05, 1.245, Z1 - 0.07, brass, root);

    /* ================= 浴缸上的小木托板 + 蜡烛 ================= */
    const tray = box(0.70, 0.03, 0.22, tubCx, tubH + 0.055, 2.16, woodMat, root);
    tray.rotation.y = 0.02;
    // 一块香皂
    box(0.11, 0.03, 0.07, tubCx - 0.20, tubH + 0.085, 2.16,
      new THREE.MeshStandardMaterial({ color: 0xe9d9c0, roughness: 0.5 }), root);
    // 一支小蜡烛
    cyl(0.028, 0.028, 0.06, 12, tubCx + 0.16, tubH + 0.10, 2.16,
      new THREE.MeshStandardMaterial({ color: 0xf3e6d2, roughness: 0.6 }), root);
    const tbFlame = new THREE.MeshBasicMaterial({ color: 0xffce88 });
    tbFlame.color.convertSRGBToLinear();
    const tbF = mesh(new THREE.SphereGeometry(0.010, 8, 8), tbFlame, tubCx + 0.16, tubH + 0.14, 2.16, root);
    tbF.scale.y = 1.5;

    /* ================= 藤编洗衣篮（南墙边） ================= */
    const basketMat = new THREE.MeshStandardMaterial({ color: 0xc9ab84, roughness: 0.95 });
    cyl(0.17, 0.15, 0.34, 18, 6.94, 0.19, 3.08, basketMat, root);
    cyl(0.175, 0.175, 0.03, 18, 6.94, 0.355, 3.08, new THREE.MeshStandardMaterial({ color: 0xb89a74, roughness: 0.95 }), root);
    // 篮子里搭出来的毛巾
    const bk = box(0.22, 0.06, 0.16, 6.98, 0.39, 3.02, mintFabric, root);
    bk.rotation.y = 0.3;

    /* ================= 小垃圾桶 ================= */
    cyl(0.10, 0.088, 0.24, 16, 7.35, 0.12, 3.10,
      new THREE.MeshStandardMaterial({ color: 0xd9d2c6, roughness: 0.5 }), root);

    /* ================= 吸顶灯 ================= */
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.6 });
    const lampPos = { x: 7.80, z: 2.35 };
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 22), plateMat);
    plate.position.set(lampPos.x, H - 0.06, lampPos.z);
    root.add(plate);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff2da });
    glowMat.color.convertSRGBToLinear();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
      glowMat
    );
    dome.position.set(lampPos.x, H - 0.08, lampPos.z);
    dome.rotation.x = Math.PI;
    root.add(dome);
    const ceilLight = new THREE.PointLight(0xffe8c8, 1.05, 4.6, 2);
    ceilLight.position.set(lampPos.x, H - 0.22, lampPos.z);
    root.add(ceilLight);

    scene.add(root);

    const lights = [ceilLight, mirrorLight];
    lights.forEach(function (l) { l.userData.base = l.intensity; });

    return {
      root: root,
      lights: lights,
      door: DOOR,
      rect: { x0: X0, x1: IX1, z0: Z0, z1: Z1 },
      tub: { x0: TUB.x0, x1: TUB.x1, z0: TUB.z0, z1: TUB.z1, water: water, center: { x: tubCx, z: tubCz } },
      basin: { x: basinX, z: basinZ },
      wc: { x: wcX, z: wcZ },
      ceilLight: ceilLight
    };
  }

  return { build: build };
})();
