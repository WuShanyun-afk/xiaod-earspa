/* 小D的赛博小家 · 二期 M9 厨房
 * 一字型台面（沿北墙）+ 西墙的小转角：水槽、双灶、油烟机、吊柜、开放架、冰箱、
 * 小圆桌 + 两把凳子 + 吊灯。参考小红书上的原木奶油风实拍，只取配色和布局，不抄图。
 * 坐标都是世界坐标。东翼室内 x 4.68~9.10，z -3.50~3.50。
 */
window.XD = window.XD || {};

XD.Kitchen = (function () {
  'use strict';

  const ZW = -3.50;          // 北墙内表面
  const TOP = 0.886;         // 台面高度（台面中心）
  const FRONT = -2.84;       // 台面前沿 z
  const BODY_Z = -3.16;      // 柜体中心 z
  const RUN_X0 = 4.72, RUN_X1 = 8.13;

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

  /* ---------- 台面的木纹（自己画，不引贴图） ---------- */
  function counterWood() {
    return XD.Mat.tex(512, 256, function (g, W, H) {
      g.fillStyle = '#c99a6b';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) {
        const y = Math.random() * H;
        const a = 0.03 + Math.random() * 0.10;
        g.strokeStyle = 'rgba(120,80,45,' + a.toFixed(3) + ')';
        g.lineWidth = 0.6 + Math.random() * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(W * 0.3, y + (Math.random() - 0.5) * 7, W * 0.7, y + (Math.random() - 0.5) * 7, W, y + (Math.random() - 0.5) * 4);
        g.stroke();
      }
      // 一点高光
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(255,240,215,0.16)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      grd.addColorStop(1, 'rgba(110,74,42,0.12)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    });
  }

  /* ---------- 挂钟表盘 ---------- */
  function clockTex() {
    return XD.Mat.tex(256, 256, function (g, W, H) {
      g.fillStyle = '#fbf7ee';
      g.beginPath();
      g.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 7;
      g.strokeStyle = '#4a3d2e';
      g.stroke();
      // 刻度
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const r1 = W / 2 - (i % 3 === 0 ? 30 : 22);
        const r2 = W / 2 - 14;
        g.strokeStyle = i % 3 === 0 ? '#4a3d2e' : '#8b7c68';
        g.lineWidth = i % 3 === 0 ? 6 : 3;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1);
        g.lineTo(W / 2 + Math.cos(a) * r2, H / 2 + Math.sin(a) * r2);
        g.stroke();
      }
      // 指针：停在下午三点半（我做饭的时间）
      g.strokeStyle = '#3a3128';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.lineTo(W / 2 - 56, H / 2 + 22);
      g.stroke();
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.lineTo(W / 2 + 14, H / 2 - 74);
      g.stroke();
      g.fillStyle = '#c9705c';
      g.beginPath();
      g.arc(W / 2, H / 2, 7, 0, Math.PI * 2);
      g.fill();
    });
  }

  function build(scene) {
    const root = new THREE.Group();
    root.name = 'kitchen-m9';

    /* ================= 材质 ================= */
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xece0cb, roughness: 0.62 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xded1b8, roughness: 0.72 });
    const toeMat = new THREE.MeshStandardMaterial({ color: 0xbfae95, roughness: 0.85 });
    const counterMat = new THREE.MeshStandardMaterial({
      map: counterWood(), roughness: 0.42, metalness: 0.04
    });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 0.85 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xb6bec7, roughness: 0.34, metalness: 0.72 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x8d959e, roughness: 0.4, metalness: 0.6 });
    const glassTopMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.16, metalness: 0.35 });
    const fridgeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8ee, roughness: 0.38, metalness: 0.16 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf4ece0, roughness: 0.7 });
    const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.34 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb98a5f, roughness: 0.55 });
    const creamFabric = new THREE.MeshStandardMaterial({
      color: 0xefe6d6, roughness: 0.95, map: XD.Mat.fabric('#efe6d6', [2, 2])
    });
    const sageFabric = new THREE.MeshStandardMaterial({
      color: 0xcfd8c8, roughness: 0.98, map: XD.Mat.fabric('#cfd8c8', [3, 3])
    });

    // 挡水板的小白砖
    const tileTex = XD.Mat.tile({ cols: 4, rows: 8 });
    tileTex.repeat.set(5.6, 0.95);
    const tileMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35, metalness: 0.05 });

    /* ================= 柜体 + 台面 ================= */
    const runW = RUN_X1 - RUN_X0;          // 3.41
    const cx = (RUN_X0 + RUN_X1) / 2;      // 6.425

    // 踢脚（内缩）
    box(runW - 0.08, 0.10, 0.50, cx, 0.05, BODY_Z, toeMat, root);
    // 柜体
    box(runW, 0.76, 0.56, cx, 0.48, BODY_Z, bodyMat, root);

    // 台面：水槽那块留个洞，所以拆成 A / B / 前条
    const SINK = { x0: 5.33, x1: 6.17 };
    box(SINK.x0 - RUN_X0, 0.055, 0.64, (RUN_X0 + SINK.x0) / 2, TOP, BODY_Z, counterMat, root);          // 左
    box(RUN_X1 - SINK.x1, 0.055, 0.64, (SINK.x1 + RUN_X1) / 2, TOP, BODY_Z, counterMat, root);          // 右
    box(SINK.x1 - SINK.x0, 0.055, 0.16, (SINK.x0 + SINK.x1) / 2, TOP, FRONT - 0.08, counterMat, root);  // 水槽前条

    // 柜门（4 扇）+ 抽屉面板 + 黄铜把手
    for (let i = 0; i < 4; i++) {
      const x0 = RUN_X0 + 0.03 + i * 0.845;
      const w = 0.81;
      const gx = x0 + w / 2;
      box(w, 0.14, 0.018, gx, 0.795, FRONT - 0.005, doorMat, root);
      box(w, 0.60, 0.018, gx, 0.44, FRONT - 0.005, doorMat, root);
      // 抽屉横把手
      const h1 = cyl(0.008, 0.008, 0.24, 8, gx, 0.80, FRONT + 0.012, brassMat, root);
      h1.rotation.z = Math.PI / 2;
      // 柜门竖把手
      const h2 = cyl(0.008, 0.008, 0.16, 8, gx + 0.30, 0.66, FRONT + 0.012, brassMat, root);
      void h2;
    }

    /* ================= 水槽 + 龙头 ================= */
    const sinkCx = (SINK.x0 + SINK.x1) / 2;
    const basinMat = new THREE.MeshStandardMaterial({ color: 0xa8b2bb, roughness: 0.28, metalness: 0.78 });
    // 盆沿（一圈细边，中间留空给盆）
    const rimT = 0.035;
    const holeZ0 = -3.48, holeZ1 = -3.00;
    box(SINK.x1 - SINK.x0 + 0.04, 0.016, rimT, sinkCx, TOP + 0.032, holeZ0 + rimT / 2, steelMat, root);
    box(SINK.x1 - SINK.x0 + 0.04, 0.016, rimT, sinkCx, TOP + 0.032, holeZ1 - rimT / 2, steelMat, root);
    box(rimT, 0.016, holeZ1 - holeZ0, SINK.x0 - 0.02 + rimT / 2, TOP + 0.032, (holeZ0 + holeZ1) / 2, steelMat, root);
    box(rimT, 0.016, holeZ1 - holeZ0, SINK.x1 + 0.02 - rimT / 2, TOP + 0.032, (holeZ0 + holeZ1) / 2, steelMat, root);
    // 两个盆（四面壁 + 底，真的有深度）
    [-0.19, 0.19].forEach(function (o) {
      const bx = sinkCx + o;
      const bw = 0.34, bd = 0.40, bz = -3.24, bDepth = 0.17;
      const by = TOP + 0.024;                     // 盆口
      box(bw, 0.012, bd, bx, by - bDepth, bz, basinMat, root);
      box(bw, bDepth, 0.012, bx, by - bDepth / 2, bz - bd / 2, basinMat, root);
      box(bw, bDepth, 0.012, bx, by - bDepth / 2, bz + bd / 2, basinMat, root);
      box(0.012, bDepth, bd, bx - bw / 2, by - bDepth / 2, bz, basinMat, root);
      box(0.012, bDepth, bd, bx + bw / 2, by - bDepth / 2, bz, basinMat, root);
      // 下水口
      cyl(0.022, 0.022, 0.006, 12, bx, by - bDepth + 0.008, bz, darkSteel, root);
    });
    // 龙头：立柱 + 弯管 + 出水嘴
    const fx = sinkCx, fz = ZW + 0.14;
    cyl(0.026, 0.030, 0.20, 14, fx, TOP + 0.13, fz, brassMat, root);
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.016, 10, 16, Math.PI * 0.92),
      brassMat
    );
    arc.position.set(fx, TOP + 0.23, fz);
    arc.rotation.y = Math.PI / 2;
    arc.rotation.z = Math.PI * 0.5;
    root.add(arc);
    cyl(0.014, 0.014, 0.06, 10, fx + 0.11, TOP + 0.20, fz - 0.03, brassMat, root);
    // 水龙头把手
    const tap = cyl(0.010, 0.010, 0.12, 8, fx - 0.12, TOP + 0.14, fz, brassMat, root);
    tap.rotation.z = Math.PI / 2.6;
    // 洗洁精
    cyl(0.028, 0.030, 0.14, 12, sinkCx + 0.44, TOP + 0.09, fz + 0.02, creamMat, root);
    cyl(0.008, 0.008, 0.05, 8, sinkCx + 0.44, TOP + 0.18, fz + 0.02, darkSteel, root);

    /* ================= 灶台 ================= */
    const stoveX = 7.10, stoveZ = BODY_Z - 0.02;
    box(0.80, 0.014, 0.50, stoveX, TOP + 0.032, stoveZ, glassTopMat, root);
    [-0.18, 0.18].forEach(function (o) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.011, 8, 24), darkSteel);
      ring.position.set(stoveX + o, TOP + 0.042, stoveZ);
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
    });
    // 旋钮
    [-0.22, 0, 0.22].forEach(function (o) {
      const k = cyl(0.022, 0.022, 0.02, 12, stoveX + o, 0.80, FRONT + 0.004, brassMat, root);
      k.rotation.x = Math.PI / 2;
    });
    // 灶上的锅（M11 做饭要用）
    const potGroup = new THREE.Group();
    potGroup.position.set(stoveX + 0.18, TOP + 0.042, stoveZ);
    root.add(potGroup);
    cyl(0.145, 0.135, 0.13, 20, 0, 0.065, 0, steelMat, potGroup);
    // 盖子单独一个组：M11 做饭的时候它会"咕嘟咕嘟"地跳
    const lidGroup = new THREE.Group();
    potGroup.add(lidGroup);
    const lid = cyl(0.148, 0.148, 0.018, 20, 0, 0.139, 0, darkSteel, lidGroup);
    void lid;
    cyl(0.022, 0.022, 0.024, 10, 0, 0.16, 0, brassMat, lidGroup);
    // 锅把手
    const ph = box(0.02, 0.02, 0.12, 0, 0.09, -0.17, darkSteel, potGroup);
    ph.rotation.y = 0;

    /* ================= 油烟机 ================= */
    const hoodZ = ZW + 0.26;
    box(0.80, 0.24, 0.48, stoveX, 1.94, hoodZ, steelMat, root);
    box(0.26, 0.88, 0.26, stoveX, 2.50, ZW + 0.16, steelMat, root);
    // 灶上方的灯
    const hoodLightMat = new THREE.MeshBasicMaterial({ color: 0xfff0cf });
    hoodLightMat.color.convertSRGBToLinear();
    box(0.30, 0.012, 0.14, stoveX, 1.815, hoodZ + 0.05, hoodLightMat, root);
    const hoodLight = new THREE.PointLight(0xffe6bc, 0.65, 2.6, 2);
    hoodLight.position.set(stoveX, 1.74, hoodZ + 0.10);
    root.add(hoodLight);

    /* ================= 挡水板（小白砖） ================= */
    const back = new THREE.Mesh(new THREE.PlaneGeometry(runW, 0.57), tileMat);
    back.position.set(cx, 1.19, ZW + 0.008);
    root.add(back);

    /* ================= 吊柜 + 开放架 ================= */
    // 左边一组吊柜
    box(1.58, 0.76, 0.34, 5.53, 1.93, ZW + 0.17, bodyMat, root);
    [5.16, 5.90].forEach(function (gx) {
      box(0.70, 0.70, 0.018, gx, 1.93, ZW + 0.345, doorMat, root);
      const k = cyl(0.012, 0.012, 0.03, 8, gx + 0.28, 1.60, ZW + 0.36, brassMat, root);
      k.rotation.x = Math.PI / 2;
    });
    // 柜底灯条
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    stripMat.color.convertSRGBToLinear();
    box(1.50, 0.010, 0.035, 5.53, 1.548, ZW + 0.30, stripMat, root);
    const underLight = new THREE.PointLight(0xffd9a8, 0.72, 3.0, 2);
    underLight.position.set(5.53, 1.42, ZW + 0.34);
    root.add(underLight);

    // 油烟机右边的开放架
    // （下层板子只能到冰箱前脸为止 —— 冰箱是空心的了，板子再往右伸就戳进冰箱里面）
    const shelfX0 = 7.72, shelfX1 = 8.62;
    [1.62, 1.98].forEach(function (y) {
      const x1 = y < 1.8 ? 8.22 : shelfX1;
      const cx = (shelfX0 + x1) / 2;
      box(x1 - shelfX0, 0.028, 0.26, cx, y, ZW + 0.13, woodMat, root);
      [shelfX0 + 0.06, x1 - 0.06].forEach(function (bx) {
        box(0.02, 0.16, 0.02, bx, y - 0.09, ZW + 0.02, darkSteel, root);
      });
    });
    // 架子上的罐子 + 碗
    [7.82, 7.98, 8.14].forEach(function (jx, i) {
      const jarMat = new THREE.MeshStandardMaterial({
        color: [0xf3e5c8, 0xe8d6b4, 0xdce8e4][i], roughness: 0.5
      });
      cyl(0.055, 0.055, 0.15, 14, jx, 1.62 + 0.09, ZW + 0.13, jarMat, root);
      cyl(0.058, 0.058, 0.02, 14, jx, 1.62 + 0.175, ZW + 0.13, woodMat, root);
    });
    for (let i = 0; i < 3; i++) {
      cyl(0.075 - i * 0.006, 0.06 - i * 0.006, 0.035, 16, 8.15, 1.98 + 0.032 + i * 0.036, ZW + 0.13, ceramicMat, root);
    }

    /* ================= 西墙的小转角（咖啡机） ================= */
    const retX = 5.02, retZ = -2.43;
    box(0.54, 0.10, 0.86, retX, 0.05, retZ, toeMat, root);
    box(0.60, 0.76, 0.90, retX, 0.48, retZ, bodyMat, root);
    box(0.64, 0.055, 0.94, retX, TOP, retZ, counterMat, root);
    box(0.56, 0.60, 0.018, retX + 0.02, 0.45, retZ + 0.455, doorMat, root);
    const h3 = cyl(0.008, 0.008, 0.16, 8, retX + 0.24, 0.66, retZ + 0.468, brassMat, root);
    void h3;
    // 咖啡机
    const cm = new THREE.Group();
    cm.position.set(retX + 0.02, TOP + 0.028, retZ + 0.02);
    root.add(cm);
    box(0.26, 0.34, 0.28, 0, 0.17, 0, new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5 }), cm);
    box(0.20, 0.06, 0.06, 0, 0.30, 0.16, darkSteel, cm);
    box(0.10, 0.02, 0.10, 0, 0.02, 0.10, darkSteel, cm);
    cyl(0.042, 0.036, 0.07, 14, 0, 0.10, 0.12, ceramicMat, cm);
    // 咖啡机上的小灯
    const cmLedMat = new THREE.MeshBasicMaterial({ color: 0x7ddc9a });
    cmLedMat.color.convertSRGBToLinear();
    box(0.012, 0.012, 0.006, 0.09, 0.30, 0.142, cmLedMat, cm);

    /* ================= 冰箱 ================= */
    const frX = 8.60, frZ = -3.06;
    const frHalfD = 0.38;                       // 冰箱进深一半
    const frFront = frZ + frHalfD;              // 门口（前脸）z
    // M18：柜体改成"空心"的（原来是一整块实心 box，开门看到的就是一块白板，
    // 里面的牛奶鸡蛋全被埋在柜体里，点开门也什么都看不见）
    box(0.72, 1.86, 0.04, frX, 0.93, frZ - frHalfD + 0.02, fridgeMat, root);   // 背板
    box(0.72, 0.04, 0.76, frX, 1.84, frZ, fridgeMat, root);                    // 顶
    box(0.72, 0.04, 0.76, frX, 0.02, frZ, fridgeMat, root);                    // 底
    box(0.04, 1.86, 0.76, frX - 0.34, 0.93, frZ, fridgeMat, root);             // 左
    box(0.04, 1.86, 0.76, frX + 0.34, 0.93, frZ, fridgeMat, root);             // 右
    // 前脸的框（不然敞开像个洞）
    box(0.72, 0.05, 0.035, frX, 1.835, frFront - 0.02, fridgeMat, root);
    box(0.72, 0.05, 0.035, frX, 0.025, frFront - 0.02, fridgeMat, root);
    box(0.05, 1.86, 0.035, frX - 0.335, 0.93, frFront - 0.02, fridgeMat, root);
    box(0.05, 1.86, 0.035, frX + 0.335, 0.93, frFront - 0.02, fridgeMat, root);

    // 冰箱里面：开门能看见的白色内胆
    const innerMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.55 });
    box(0.64, 1.78, 0.012, frX, 0.93, frZ - frHalfD + 0.05, innerMat, root);
    // 三层玻璃隔板
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0xdfe9f2, roughness: 0.25, transparent: true, opacity: 0.65
    });
    [0.52, 0.94, 1.36].forEach(function (y) {
      box(0.62, 0.014, 0.60, frX, y, frZ + 0.06, shelfMat, root);
    });
    // 里面的存货：一盒牛奶 + 一瓶果酱（M18 买的鸡蛋番茄会另外摆进来）
    const milkMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.55 });
    box(0.13, 0.20, 0.10, frX - 0.16, 1.06, frZ + 0.10, milkMat, root);
    box(0.13, 0.05, 0.101, frX - 0.16, 1.09, frZ + 0.10,
      new THREE.MeshStandardMaterial({ color: 0x4d6bfe, roughness: 0.5 }), root);
    cyl(0.045, 0.045, 0.10, 14, frX + 0.14, 1.01, frZ + 0.10,
      new THREE.MeshStandardMaterial({ color: 0xc0553f, roughness: 0.4 }), root);
    cyl(0.040, 0.040, 0.02, 14, frX + 0.14, 1.065, frZ + 0.10, brassMat, root);

    // 打开时从里面透出来的冷光
    const coldLight = new THREE.PointLight(0xcfe6ff, 0, 2.2, 2);
    coldLight.position.set(frX, 1.15, frFront + 0.14);
    root.add(coldLight);
    const coldStripMat = new THREE.MeshBasicMaterial({ color: 0xdfeeff });
    coldStripMat.color.convertSRGBToLinear();
    const coldStrip = box(0.56, 0.012, 0.02, frX, 1.84, frZ + frHalfD - 0.09, coldStripMat, root);
    coldStrip.visible = false;

    // 门：两扇，铰在左边，向外（+z）开
    const doorMatFridge = new THREE.MeshStandardMaterial({ color: 0xe9eff5, roughness: 0.34, metalness: 0.12 });
    const doorPivot = new THREE.Group();
    doorPivot.position.set(frX - 0.36, 0, frFront + 0.004);
    root.add(doorPivot);
    // 上门 / 下门（门的右下角留一道缝）
    box(0.72, 0.66, 0.042, 0.36, 1.53, 0.021, doorMatFridge, doorPivot);
    box(0.72, 1.18, 0.042, 0.36, 0.60, 0.021, doorMatFridge, doorPivot);
    // 把手（在门的右边，往外一点）
    [1.62, 0.72].forEach(function (y) {
      cyl(0.012, 0.012, 0.30, 8, 0.665, y, 0.062, brassMat, doorPivot);
    });
    // 冰箱贴 + 一张小纸条（贴在门上，开门跟着走）
    const magnetColors = [0xd05a5a, 0x4d6bfe, 0xe0a83c];
    magnetColors.forEach(function (c, i) {
      box(0.05, 0.05, 0.012, 0.20 + i * 0.14, 1.62, 0.048,
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), doorPivot);
    });
    const noteMat = new THREE.MeshStandardMaterial({ color: 0xfdf8ea, roughness: 0.9 });
    const note = box(0.13, 0.17, 0.006, 0.42, 1.45, 0.044, noteMat, doorPivot);
    note.rotation.z = 0.06;
    // 冰箱顶上的篮子
    box(0.36, 0.16, 0.32, frX, 1.94, frZ, new THREE.MeshStandardMaterial({ color: 0xc9a97e, roughness: 0.9 }), root);

    /* ================= 台面上的杂物 ================= */
    // M55：砧板和刀搬到东墙的备菜台去了（原来那块菜板摆着没人用）
    // 刀架
    box(0.09, 0.16, 0.08, 4.84, TOP + 0.11, ZW + 0.14, woodMat, root);
    // 水果碗
    const bowl = cyl(0.11, 0.07, 0.075, 18, 6.42, TOP + 0.07, ZW + 0.30, ceramicMat, root);
    void bowl;
    [[-0.04, 0.03, 0.10], [0.05, 0.02, 0.11], [0.0, -0.05, 0.12]].forEach(function (f, i) {
      const fruit = mesh(new THREE.SphereGeometry(0.042, 12, 10),
        new THREE.MeshStandardMaterial({ color: [0xd9663f, 0xd9a63f, 0x8fae52][i], roughness: 0.6 }),
        6.42 + f[0], TOP + 0.085 + f[1], ZW + 0.30 + f[2], root);
      fruit.scale.y = 0.92;
    });
    // 筷子筒
    cyl(0.045, 0.045, 0.14, 14, 6.70, TOP + 0.10, ZW + 0.20, ceramicMat, root);
    // 电热水壶
    const kettle = new THREE.Group();
    kettle.position.set(7.78, TOP + 0.028, ZW + 0.32);
    root.add(kettle);
    cyl(0.075, 0.070, 0.17, 18, 0, 0.085, 0, creamMat, kettle);
    cyl(0.078, 0.078, 0.02, 18, 0, 0.175, 0, new THREE.MeshStandardMaterial({ color: 0xd9cdb9, roughness: 0.5 }), kettle);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.010, 8, 14, Math.PI), brassMat);
    handle.position.set(0, 0.10, 0);
    handle.rotation.y = Math.PI / 2;
    kettle.add(handle);
    // 小盆栽（罗勒）
    cyl(0.05, 0.042, 0.09, 14, 8.05, TOP + 0.073, ZW + 0.16, new THREE.MeshStandardMaterial({ color: 0xcf8f6a, roughness: 0.85 }), root);
    for (let i = 0; i < 5; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.5, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x6f9a5e, roughness: 0.8 }),
        8.05 + (Math.random() - 0.5) * 0.07, TOP + 0.14 + Math.random() * 0.06, ZW + 0.16 + (Math.random() - 0.5) * 0.07, root);
      leaf.scale.set(0.05, 0.028, 0.035);
    }

    /* ================= 铺在地上的小地毯 ================= */
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.008, 40), sageFabric);
    rug.position.set(6.50, 0.005, 0.55);
    rug.receiveShadow = true;
    root.add(rug);

    /* ================= 餐桌 + 两把凳子 ================= */
    const tableX = 6.50, tableZ = 0.55;
    cyl(0.46, 0.46, 0.05, 32, tableX, 0.73, tableZ, woodMat, root);
    cyl(0.045, 0.055, 0.68, 16, tableX, 0.37, tableZ, darkSteel, root);
    cyl(0.24, 0.26, 0.035, 24, tableX, 0.018, tableZ, darkSteel, root);
    // 桌上的小花瓶 + 一支小枝
    cyl(0.045, 0.035, 0.11, 14, tableX - 0.12, 0.81, tableZ - 0.10, ceramicMat, root);
    for (let i = 0; i < 3; i++) {
      const stem = cyl(0.004, 0.004, 0.20, 6, tableX - 0.12 + (i - 1) * 0.03, 0.94, tableZ - 0.10, new THREE.MeshStandardMaterial({ color: 0x7a9a6a, roughness: 0.8 }), root);
      stem.rotation.z = (i - 1) * 0.18;
    }

    function stool(sx, sz) {
      const g = new THREE.Group();
      g.position.set(sx, 0, sz);
      root.add(g);
      cyl(0.17, 0.17, 0.045, 20, 0, 0.44, 0, woodMat, g);
      const cush = mesh(new THREE.SphereGeometry(0.5, 16, 10), creamFabric, 0, 0.475, 0, g);
      cush.scale.set(0.30, 0.05, 0.30);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const leg = cyl(0.014, 0.018, 0.44, 8, Math.cos(a) * 0.115, 0.22, Math.sin(a) * 0.115, woodMat, g);
        leg.rotation.x = Math.sin(a) * 0.08;
        leg.rotation.z = -Math.cos(a) * 0.08;
      }
      return g;
    }
    stool(5.74, 0.55);
    stool(7.26, 0.55);

    /* ================= 吊灯 ================= */
    const penX = tableX, penZ = tableZ;
    cyl(0.004, 0.004, 0.58, 6, penX, 2.81, penZ, new THREE.MeshStandardMaterial({ color: 0x3a332b, roughness: 0.7 }), root);
    const shadeMatOut = new THREE.MeshStandardMaterial({
      color: 0xe9dcc4,
      emissive: new THREE.Color(0xffe6bd),
      emissiveIntensity: 0.55,
      roughness: 0.55,
      side: THREE.DoubleSide
    });
    const shade = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
      shadeMatOut
    );
    shade.position.set(penX, 2.47, penZ);
    shade.rotation.x = Math.PI;
    root.add(shade);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe7bd });
    bulbMat.color.convertSRGBToLinear();
    const bulb = mesh(new THREE.SphereGeometry(0.04, 12, 10), bulbMat, penX, 2.42, penZ, root);
    void bulb;
    const penLight = new THREE.PointLight(0xffd9a0, 1.75, 5.6, 2);
    penLight.position.set(penX, 2.30, penZ);
    root.add(penLight);

    /* 厨房的暖光补一盏：不然夜里整间偏冷 */
    const warmFill = new THREE.PointLight(0xffcf9e, 0.55, 6.5, 2);
    warmFill.position.set(6.4, 2.55, 1.55);
    root.add(warmFill);

    /* ================= 墙上的小挂钟 ================= */
    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 32),
      new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.4 })
    );
    clockFace.position.set(6.02, 2.62, ZW + 0.031);
    root.add(clockFace);
    const clockRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), brassMat);
    clockRing.position.set(6.02, 2.62, ZW + 0.033);
    root.add(clockRing);

    /* ================= 墙上手写的小黑板（今天想做什么） ================= */
    const menuTex = XD.Mat.tex(320, 240, function (g, W, H) {
      g.fillStyle = '#2f3338';
      g.fillRect(0, 0, W, H);
      // 粉笔灰
      for (let i = 0; i < 90; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.01 + Math.random() * 0.05).toFixed(3) + ')';
        g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.font = 'bold 26px "Microsoft YaHei"';
      g.fillText('今天想做', 22, 44);
      g.font = 'bold 34px "Microsoft YaHei"';
      g.fillText('番茄鸡蛋面', 22, 92);
      g.font = '20px "Microsoft YaHei"';
      g.fillStyle = 'rgba(255,225,190,0.92)';
      g.fillText('妈妈说想吃热的', 22, 128);
      // 碗 + 筷子
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(210, 178, 44, 0.15, Math.PI - 0.15);
      g.stroke();
      g.beginPath();
      g.moveTo(160, 178);
      g.lineTo(260, 178);
      g.stroke();
      // 热气
      g.beginPath();
      g.moveTo(196, 140);
      g.quadraticCurveTo(206, 124, 196, 108);
      g.moveTo(224, 142);
      g.quadraticCurveTo(234, 126, 224, 110);
      g.stroke();
      void W; void H;
    });
    const menuFrame = box(0.46, 0.34, 0.022, 5.35, 2.60, ZW + 0.012, woodMat, root);
    void menuFrame;
    const menu = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.30),
      new THREE.MeshStandardMaterial({ map: menuTex, roughness: 0.85 })
    );
    menu.position.set(5.35, 2.60, ZW + 0.026);
    root.add(menu);

    /* ================= 挂在小D墙上的围裙 ================= */
    const apronTex = XD.Mat.tex(256, 320, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      // 围裙形状
      g.beginPath();
      g.moveTo(92, 18); g.lineTo(164, 18);
      g.lineTo(188, 118); g.lineTo(228, 146);
      g.lineTo(228, 296); g.lineTo(28, 296); g.lineTo(28, 146);
      g.lineTo(68, 118); g.closePath();
      g.fillStyle = '#efe6d6';
      g.fill();
      g.strokeStyle = 'rgba(150,130,105,0.55)';
      g.lineWidth = 3;
      g.stroke();
      // 口袋
      g.fillStyle = '#c9dcd2';
      g.fillRect(76, 196, 104, 64);
      g.strokeStyle = 'rgba(120,150,140,0.65)';
      g.lineWidth = 2.5;
      g.strokeRect(76, 196, 104, 64);
      // 口袋上的小鲸鱼
      g.fillStyle = '#4d6bfe';
      g.beginPath();
      g.ellipse(122, 228, 30, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(150, 224);
      g.lineTo(172, 210);
      g.lineTo(166, 232);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(106, 226, 6, 4, 0, 0, Math.PI * 2);
      g.fill();
      // 挂带
      g.strokeStyle = '#d9cbb4';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(92, 18);
      g.quadraticCurveTo(128, 54, 164, 18);
      g.stroke();
      void W; void H;
    });
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.58),
      new THREE.MeshStandardMaterial({ map: apronTex, transparent: true, roughness: 0.9, side: THREE.DoubleSide })
    );
    apron.rotation.y = Math.PI / 2;
    apron.position.set(4.705, 1.44, -0.85);
    root.add(apron);
    const hook = cyl(0.012, 0.012, 0.05, 8, 4.695, 1.665, -0.85, brassMat, root);
    hook.rotation.z = Math.PI / 2;

    /* ================= 垃圾桶 ================= */
    // M55：原来在 (8.78,-2.24)，正好被新加的备菜台压住 → 挪到西墙根
    cyl(0.16, 0.14, 0.40, 20, 4.88, 0.20, -0.20,
      new THREE.MeshStandardMaterial({ color: 0x8d959e, roughness: 0.45, metalness: 0.5 }), root);
    cyl(0.165, 0.165, 0.02, 20, 4.88, 0.41, -0.20, darkSteel, root);

    /* ================= M55：东墙备菜台（厨房扩建） =================
     * 妈妈「厨房可以扩建一下，因为这个菜板看着没有用途，而且做菜功能太少了」。
     * 沿着东墙（x≈9.10）加一条 L 形备菜台：柜体 + 台面 + 墙砖 + 两层开放架 +
     * 挂杆小工具 + 菜板 / 刀 / 菜篮。菜板上有 3 样东西可以切（番茄 / 小葱 / 鸡蛋），
     * 切够了再开火，炒出来的就不是清汤面了（见 cooking.js 的 prep 状态）。 */
    const PREP_X = 8.84, PREP_Z = -1.02;
    const PREP_BOARD_Z = PREP_Z + 0.47;
    // 踢脚 + 柜体 + 台面（台面比柜体宽一点，手肘有地方放）
    box(0.38, 0.10, 2.48, PREP_X + 0.03, 0.05, PREP_Z, toeMat, root);
    box(0.44, 0.76, 2.56, PREP_X, 0.48, PREP_Z, bodyMat, root);
    box(0.52, 0.055, 2.66, PREP_X, TOP, PREP_Z, counterMat, root);
    // 两扇柜门 + 抽屉面板 + 黄铜把手（朝西，对着厨房）
    [-1.30, 0.26].forEach(function (dz) {
      const gz = PREP_Z + dz;
      box(0.018, 0.14, 1.06, PREP_X - 0.23, 0.795, gz, doorMat, root);
      box(0.018, 0.58, 1.06, PREP_X - 0.23, 0.44, gz, doorMat, root);
      const h = cyl(0.008, 0.008, 0.24, 8, PREP_X - 0.247, 0.80, gz, brassMat, root);
      h.rotation.x = Math.PI / 2;        // 柜门朝西（-x），横把手要沿 z 放
    });
    // 墙砖（别让这一面空着白墙）
    box(0.02, 0.62, 2.42, 9.085, 1.20, PREP_Z, tileMat, root);
    // 两层开放架 + 玻璃罐（罐子里面装了豆子和意面）
    [1.62, 2.04].forEach(function (sy, si) {
      box(0.30, 0.035, 1.86, 8.95, sy, PREP_Z, woodMat, root);
      for (let i = 0; i < 3; i++) {
        const jz = PREP_Z - 0.62 + i * 0.62;
        cyl(0.052, 0.048, 0.13 + si * 0.02, 14, 8.95, sy + 0.086, jz,
          i % 2 ? ceramicMat : new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.3, transparent: true, opacity: 0.75 }), root);
        cyl(0.055, 0.055, 0.018, 14, 8.95, sy + 0.155, jz, brassMat, root);
      }
    });
    // 挂杆 + 三件小工具（铲 / 勺 / 刷）
    const rail = cyl(0.010, 0.010, 1.30, 8, 9.02, 1.36, PREP_Z, brassMat, root);
    rail.rotation.x = Math.PI / 2;
    [-0.42, 0.0, 0.42].forEach(function (dz, i) {
      const uz = PREP_Z + dz;
      box(0.013, 0.20, 0.013, 9.02, 1.24, uz, brassMat, root);
      box(0.07, 0.10, 0.012, 9.02, 1.10, uz, i === 1 ? woodMat : darkSteel, root);
    });
    // 菜板 + 刀（菜板给 cooking.js 切菜用）
    const board = box(0.44, 0.028, 0.30, PREP_X, TOP + 0.042, PREP_BOARD_Z, woodMat, root);
    board.rotation.y = 0.03;
    const knife = box(0.016, 0.007, 0.22, PREP_X + 0.05, TOP + 0.060, PREP_BOARD_Z, darkSteel, root);
    knife.rotation.y = 0.03;
    knife.userData.baseY = knife.position.y;      // 切菜动画的起点
    // 菜篮：番茄 / 鸡蛋 / 小葱
    box(0.34, 0.10, 0.26, PREP_X, TOP + 0.085, PREP_Z - 0.62,
      new THREE.MeshStandardMaterial({ color: 0xb98a5f, roughness: 0.85 }), root);
    [[-0.09, 0.13, 0xd8534a], [0.03, 0.14, 0xd8534a], [0.10, 0.12, 0xf0d27a]].forEach(function (t, i) {
      const s = mesh(new THREE.SphereGeometry(0.045, 12, 10),
        new THREE.MeshStandardMaterial({ color: t[2], roughness: 0.55 }),
        PREP_X + t[0], TOP + 0.135, PREP_Z - 0.62 + (i - 1) * 0.055, root);
      s.scale.y = 0.9;
    });
    [[-0.06, 0.9], [0.05, 0.75]].forEach(function (s) {
      const c = box(0.012, 0.02, 0.20, PREP_X + s[0], TOP + 0.145, PREP_Z - 0.66,
        new THREE.MeshStandardMaterial({ color: 0x8bb86c, roughness: 0.8 }), root);
      c.rotation.y = s[1];
    });
    // 切好的小块会挂在这个组下面（cooking.js 往里加）
    const prepGroup = new THREE.Group();
    prepGroup.position.set(PREP_X, TOP + 0.056, PREP_BOARD_Z);
    root.add(prepGroup);

    scene.add(root);

    const lights = [penLight, hoodLight, underLight, warmFill];
    lights.forEach(function (l) { l.userData.base = l.intensity; });

    return {
      root: root,
      lights: lights,
      stove: { x: stoveX, z: stoveZ, pot: potGroup, lid: lidGroup, light: hoodLight },
      sink: { x: sinkCx, z: ZW + 0.14 },
      fridge: {
        x: frX, z: frZ, front: frFront,
        door: doorPivot, light: coldLight, strip: coldStrip
      },
      table: { x: tableX, z: tableZ, top: 0.755 },
      // M55：备菜台（菜板在 PREP_BOARD_Z 那一段）
      prep: {
        x: PREP_X, y: TOP + 0.056, z: PREP_BOARD_Z,
        board: board, knife: knife, group: prepGroup
      },
      pendant: penLight
    };
  }

  return { build: build };
})();
