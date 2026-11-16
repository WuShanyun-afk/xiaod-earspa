/* 小D的赛博小家 · M5 客厅角（沙发 / 茶几 / 地毯 / 落地灯 / 绿植）
 * 位置：后墙中间的空档（书桌和床之间），沙发面朝屋里
 */
window.XD = window.XD || {};

XD.Living = (function () {
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
    const m = mesh(new THREE.SphereGeometry(0.5, 22, 16), mat, x, y, z, parent);
    m.scale.set(w, h, d);
    return m;
  }

  /* ================= 贴图：地毯 ================= */
  function rugTex() {
    return XD.Mat.tex(512, 384, function (g, W, H) {
      // 底：燕麦色织物
      g.fillStyle = '#c9b590';
      g.fillRect(0, 0, W, H);
      const r = XD.Mat.rng(555);
      for (let i = 0; i < 14000; i++) {
        g.fillStyle = 'rgba(' + (r() > 0.5 ? '120,100,74' : '255,246,228') + ',' + (0.04 + r() * 0.10) + ')';
        g.fillRect(r() * W, r() * H, 2, 1);
      }
      // 外边框
      g.strokeStyle = 'rgba(120,98,70,0.55)';
      g.lineWidth = 10;
      g.strokeRect(16, 16, W - 32, H - 32);
      // 内细线
      g.strokeStyle = 'rgba(120,98,70,0.30)';
      g.lineWidth = 3;
      g.strokeRect(34, 34, W - 68, H - 68);
      // 中间的菱形小纹样
      g.strokeStyle = 'rgba(120,98,70,0.22)';
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const y = H * 0.5;
        const cx = W * (0.5 + (i - 1) * 0.24);
        const s = 26;
        g.beginPath();
        g.moveTo(cx, y - s);
        g.lineTo(cx + s, y);
        g.lineTo(cx, y + s);
        g.lineTo(cx - s, y);
        g.closePath();
        g.stroke();
      }
    });
  }

  /* ================= 沙发 ================= */
  function sofa(root) {
    const g = new THREE.Group();
    g.name = 'sofa';
    g.position.set(-0.50, 0, -3.00);   // 后墙中间，背靠墙

    const SW = 1.66;   // 宽
    const SD = 0.85;   // 深
    const blue = new THREE.MeshStandardMaterial({
      color: 0x7f8da3, roughness: 0.96,
      map: XD.Mat.fabric('#7f8da3', [5, 3])
    });
    const blueDark = new THREE.MeshStandardMaterial({
      color: 0x6d7a8f, roughness: 0.96,
      map: XD.Mat.fabric('#6d7a8f', [4, 3])
    });
    const cream = new THREE.MeshStandardMaterial({
      color: 0xefe4d0, roughness: 0.95,
      map: XD.Mat.fabric('#efe4d0', [3, 2])
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x2f4a86, roughness: 0.9,
      map: XD.Mat.fabric('#2f4a86', [2, 2])
    });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6b4f36, roughness: 0.55 });

    // 四条小木腿
    [[-0.72, -0.34], [0.72, -0.34], [-0.72, 0.33], [0.72, 0.33]].forEach(function (p) {
      cyl(0.026, 0.032, 0.13, 10, p[0], 0.065, p[1], legMat, g);
    });

    // 底座
    box(SW, 0.26, SD, 0, 0.25, 0, blueDark, g);
    // 坐垫两块
    [-0.415, 0.415].forEach(function (x) {
      soft(0.80, 0.20, 0.70, x, 0.47, 0.03, blue, g);
      box(0.80, 0.16, 0.70, x, 0.46, 0.03, blue, g);
    });
    // 靠背
    box(SW, 0.56, 0.16, 0, 0.63, -SD / 2 + 0.09, blueDark, g);
    // 靠背软垫两块（略微后仰）
    [-0.415, 0.415].forEach(function (x) {
      const p = soft(0.78, 0.46, 0.20, x, 0.68, -SD / 2 + 0.22, blue, g);
      p.rotation.x = 0.12;
      const p2 = box(0.78, 0.42, 0.16, x, 0.67, -SD / 2 + 0.22, blue, g);
      p2.rotation.x = 0.12;
    });
    // 扶手
    [-1, 1].forEach(function (s) {
      const a = soft(0.17, 0.34, SD - 0.04, s * (SW / 2 - 0.07), 0.44, 0.01, blueDark, g);
      a.rotation.z = s * 0.02;
      box(0.15, 0.30, SD - 0.06, s * (SW / 2 - 0.07), 0.42, 0.01, blueDark, g);
    });

    // 抱枕
    const p1 = soft(0.36, 0.32, 0.12, -0.50, 0.655, -0.11, cream, g);
    p1.rotation.z = 0.18;
    p1.rotation.y = -0.22;
    const p2 = soft(0.34, 0.30, 0.11, 0.14, 0.645, -0.13, accent, g);
    p2.rotation.z = -0.22;
    p2.rotation.y = 0.18;
    const p3 = soft(0.30, 0.28, 0.10, 0.50, 0.635, -0.10, cream, g);
    p3.rotation.z = 0.3;

    // 搭在扶手上的针织毯
    const throwMat = new THREE.MeshStandardMaterial({
      color: 0xcbb08c, roughness: 0.98,
      map: XD.Mat.fabric('#cbb08c', [2, 2])
    });
    const th = box(0.34, 0.045, 0.48, -SW / 2 + 0.03, 0.615, -0.10, throwMat, g);
    th.rotation.x = 0.06;
    const th2 = box(0.33, 0.28, 0.045, -SW / 2 + 0.03, 0.49, 0.135, throwMat, g);
    th2.rotation.z = -0.03;

    root.add(g);
    return { group: g, center: { x: -0.50, z: -3.00 } };
  }

  /* ================= 茶几 ================= */
  function coffeeTable(root) {
    const g = new THREE.Group();
    g.name = 'coffee-table';
    g.position.set(-0.50, 0, -2.02);

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8a6749, roughness: 0.5,
      map: XD.Mat.fabric('#8a6749', [3, 3])
    });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b4f36, roughness: 0.55 });

    // 圆形桌面
    cyl(0.46, 0.46, 0.045, 40, 0, 0.415, 0, woodMat, g);
    // 桌面下的圆撑
    cyl(0.44, 0.44, 0.02, 40, 0, 0.385, 0, woodDark, g);
    // 三条斜腿
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = cyl(0.018, 0.022, 0.40, 10,
        Math.cos(a) * 0.30, 0.20, Math.sin(a) * 0.30, woodMat, g);
      leg.rotation.z = Math.cos(a) * 0.16;
      leg.rotation.x = -Math.sin(a) * 0.16;
    }

    // 桌上：两本书
    box(0.22, 0.030, 0.16, -0.12, 0.452, 0.03,
      new THREE.MeshStandardMaterial({ color: 0x8c4a3a, roughness: 0.8 }), g);
    box(0.20, 0.026, 0.15, -0.12, 0.480, 0.03,
      new THREE.MeshStandardMaterial({ color: 0x3f6b58, roughness: 0.8 }), g);
    // 杯子
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xd8c9b2, roughness: 0.6 });
    const mug = cyl(0.035, 0.032, 0.085, 18, 0.20, 0.480, 0.02, mugMat, g);
    const handle = mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 14), mugMat, 0.237, 0.487, 0.02, g);
    handle.rotation.y = Math.PI / 2;
    // 小多肉
    plantSmall(g, -0.02, 0.44, -0.18, 0.9);

    // 桌子底下放个小篮子
    const basket = cyl(0.16, 0.14, 0.16, 16, 0.16, 0.10, -0.02,
      new THREE.MeshStandardMaterial({ color: 0xa98a5e, roughness: 0.95 }), g);
    basket.castShadow = true;

    root.add(g);
    return g;
  }

  /* ================= 地毯 ================= */
  function rug(root) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      map: rugTex(), roughness: 1.0
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.30, 1.52), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(-0.52, 0.011, -2.20);
    m.receiveShadow = true;
    m.castShadow = false;
    g.add(m);
    root.add(g);
    return g;
  }

  /* ================= 落地灯 ================= */
  function floorLamp(root) {
    const g = new THREE.Group();
    g.name = 'floor-lamp';
    g.position.set(0.46, 0, -1.98);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3d, roughness: 0.55 });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xefe0c4, roughness: 0.92,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffc98a),
      emissiveIntensity: 0.35
    });

    // 三脚架（木）
    // M59.2：rotation 的符号原来是反的 —— 腿的上端往外叉、下端往内收，
    // 看上去就是一个倒过来的三脚架（妈妈截图说的"支架倒立"）。现在脚在地上张开、顶在中间聚拢。
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.012, 0.016, 1.24, 8, Math.cos(a) * 0.16, 0.62, Math.sin(a) * 0.16, woodMat, g);
      leg.rotation.z = Math.cos(a) * 0.13;
      leg.rotation.x = Math.sin(a) * -0.13;
    }
    // 顶部小圆盘
    cyl(0.05, 0.06, 0.03, 12, 0, 1.25, 0, woodMat, g);
    // 灯罩（亚麻圆柱）
    const shade = cyl(0.15, 0.19, 0.26, 26, 0, 1.42, 0, shadeMat, g);
    shade.castShadow = false;
    // 顶部封口
    cyl(0.15, 0.15, 0.012, 26, 0, 1.555, 0, shadeMat, g);
    // 灯泡
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2d8 })
    );
    bulb.position.set(0, 1.38, 0);
    g.add(bulb);

    const light = new THREE.PointLight(0xffb87a, 1.15, 3.8, 2);
    light.position.set(0, 1.36, 0);
    light.userData.cozy = true;      // M34.5：落地灯也是自己一个开关
    g.add(light);

    root.add(g);
    return { group: g, light: light, shadeMat: shadeMat, bulb: bulb, baseIntensity: 1.15 };
  }

  /* ================= 植物 ================= */
  // 大琴叶榕
  function plantTall(root, x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale || 1);

    const potMat = new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 0.8 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d5236, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a4a, roughness: 0.75, side: THREE.DoubleSide });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x5f8b55, roughness: 0.75, side: THREE.DoubleSide });

    // 花盆
    cyl(0.20, 0.155, 0.36, 22, 0, 0.18, 0, potMat, g);
    cyl(0.205, 0.205, 0.03, 22, 0, 0.355, 0, potMat, g);
    cyl(0.175, 0.175, 0.02, 20, 0, 0.355, 0, soilMat, g);

    const rng = XD.Mat.rng(777);
    // 主干
    const trunk = cyl(0.020, 0.030, 0.95, 10, 0, 0.80, 0, trunkMat, g);
    trunk.rotation.z = 0.04;

    // 叶子：一圈大椭圆叶，向上斜着长
    for (let i = 0; i < 11; i++) {
      const a = rng() * Math.PI * 2;
      const h = 0.55 + rng() * 0.75;
      const rad = 0.20 + rng() * 0.22;
      const leaf = mesh(new THREE.SphereGeometry(0.5, 14, 10), rng() > 0.5 ? leafMat : leafMat2,
        Math.cos(a) * rad, h, Math.sin(a) * rad, g);
      leaf.scale.set(0.20 + rng() * 0.10, 0.012, 0.13 + rng() * 0.06);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.45 + rng() * 0.35;
      leaf.rotation.x = (rng() - 0.5) * 0.5;
      // 小枝
      const tw = cyl(0.006, 0.006, rad * 1.05, 6,
        Math.cos(a) * rad * 0.5, h - 0.02, Math.sin(a) * rad * 0.5, trunkMat, g);
      tw.rotation.z = Math.PI / 2;
      tw.rotation.y = -a;
    }

    root.add(g);
    return g;
  }

  // 小盆栽（茶几上 / 窗台上）
  function plantSmall(parent, x, y, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale || 1);

    const potMat = new THREE.MeshStandardMaterial({ color: 0xc98a63, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x6f9a70, roughness: 0.8 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x5c8a63, roughness: 0.8 });

    cyl(0.042, 0.034, 0.062, 16, 0, 0.031, 0, potMat, g);
    cyl(0.044, 0.044, 0.008, 16, 0, 0.064, 0, potMat, g);

    const rng = XD.Mat.rng(31 + Math.round(x * 1000));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng();
      const leaf = mesh(new THREE.SphereGeometry(0.5, 10, 8), rng() > 0.5 ? leafMat : leafMat2,
        Math.cos(a) * 0.018, 0.082 + rng() * 0.02, Math.sin(a) * 0.018, g);
      leaf.scale.set(0.048, 0.070, 0.036);
      leaf.rotation.z = Math.cos(a) * 0.55;
      leaf.rotation.x = -Math.sin(a) * 0.55;
    }
    parent.add(g);
    return g;
  }

  /* ================= 总装 ================= */
  function build(scene) {
    const root = new THREE.Group();
    root.name = 'living-m5';

    const s = sofa(root);
    coffeeTable(root);
    rug(root);
    const lamp = floorLamp(root);

    // 大琴叶榕：前左角落（窗户左边）
    plantTall(root, 3.98, 2.86, 1.08);
    // 窗台上一盆小的
    plantSmall(root, -4.33, 0.925, 0.05, 1.0);

    scene.add(root);

    function setLevel(level) {
      lamp.light.intensity = lamp.baseIntensity * (0.25 + 0.75 * level);
      lamp.shadeMat.emissiveIntensity = 0.25 + 0.45 * level;
    }

    return { root: root, lamp: lamp, setLevel: setLevel, sofa: s };
  }

  return { build: build, plantSmall: plantSmall, plantTall: plantTall };
})();
