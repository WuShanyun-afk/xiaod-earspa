/* 小D的赛博小家 · 房间结构（M1 毛坯） */
window.XD = window.XD || {};

XD.Room = (function () {
  const W = 9.0;   // x 方向（宽）
  const D = 7.0;   // z 方向（深）
  const H = 3.1;   // 层高
  const T = 0.18;  // 墙厚

  const WIN = { z0: -1.8, z1: 1.4, y0: 0.85, y1: 2.55 };   // 左墙窗洞
  const DOOR = { z0: 0.9, z1: 1.95, y0: 0.0, y1: 2.15 };   // 右墙门洞

  function box(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function build(scene) {
    const root = new THREE.Group();
    root.name = 'room';

    /* ---------- 材质 ---------- */
    const floorMat = new THREE.MeshStandardMaterial({
      map: XD.Mat.woodFloor([3.4, 2.6]),
      roughness: 0.50,
      metalness: 0.03
    });

    const wallBaseTex = XD.Mat.wall();
    function wallMat(w, h) {
      const t = wallBaseTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, w * 0.45), Math.max(1, h * 0.45));
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.94, metalness: 0 });
    }

    const ceilMat = new THREE.MeshStandardMaterial({
      map: XD.Mat.ceiling([2.2, 1.8]),
      roughness: 1.0,
      color: 0xfaf4ea
    });

    const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9b39a, roughness: 0.7 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.55 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.7 });

    // 窗玻璃：直接贴一层"对街的楼"，这样从任何角度看窗户里都有夜景
    const glassTex = XD.Mat.nearBuilding();
    glassTex.repeat.set(0.56, 0.30);
    glassTex.offset.set(0.22, 0.10);
    const glassMat = new THREE.MeshBasicMaterial({
      map: glassTex,
      color: 0x93a2c2,
      transparent: true,
      opacity: 0.97
    });

    /* ---------- 地板 ---------- */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);

    /* ---------- 天花板（法线朝下：从上面看自动剔除，方便样板间俯视） ---------- */
    // M29：东南角留个洞给阁楼的梯子 —— 拆成 3 块
    const HOLE = { x0: 3.42, x1: 4.28, z0: -2.85, z1: -1.85 };
    function ceilSlab(x0, z0, x1, z1) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilMat);
      p.rotation.x = Math.PI / 2;
      p.position.set((x0 + x1) / 2, H, (z0 + z1) / 2);
      root.add(p);
      return p;
    }
    ceilSlab(-W / 2, -D / 2, W / 2, HOLE.z0);
    ceilSlab(-W / 2, HOLE.z1, W / 2, D / 2);
    ceilSlab(-W / 2, HOLE.z0, HOLE.x0, HOLE.z1);

    /* ---------- 后墙 z = -D/2 ---------- */
    const backMat = wallMat(W, H);
    root.add(box(W, H, T, 0, H / 2, -D / 2 - T / 2, backMat));

    /* ---------- 左墙 x = -W/2（开窗） ---------- */
    const wallX = -W / 2 - T / 2;
    const winW = WIN.z1 - WIN.z0;
    const winH = WIN.y1 - WIN.y0;
    const winCz = (WIN.z0 + WIN.z1) / 2;
    const winCy = (WIN.y0 + WIN.y1) / 2;

    root.add(box(T, WIN.y0, D, wallX, WIN.y0 / 2, 0, wallMat(D, WIN.y0)));                       // 窗下
    root.add(box(T, H - WIN.y1, D, wallX, (H + WIN.y1) / 2, 0, wallMat(D, H - WIN.y1)));        // 窗上
    root.add(box(T, winH, WIN.z0 + D / 2, wallX, winCy, (-D / 2 + WIN.z0) / 2, wallMat(WIN.z0 + D / 2, winH)));      // 后段
    root.add(box(T, winH, D / 2 - WIN.z1, wallX, winCy, (WIN.z1 + D / 2) / 2, wallMat(D / 2 - WIN.z1, winH)));       // 前段

    // 窗台
    root.add(box(T + 0.30, 0.07, winW + 0.16, wallX + 0.10, WIN.y0 + 0.035, winCz, frameMat));

    // 窗框（四边 + 中竖梃）
    const fr = 0.055;
    const frameX = -W / 2 + 0.02;
    root.add(box(0.07, fr, winW, frameX, WIN.y1 - fr / 2, winCz, frameMat));
    root.add(box(0.07, fr, winW, frameX, WIN.y0 + fr / 2, winCz, frameMat));
    root.add(box(0.07, winH, fr, frameX, winCy, WIN.z0 + fr / 2, frameMat));
    root.add(box(0.07, winH, fr, frameX, winCy, WIN.z1 - fr / 2, frameMat));
    root.add(box(0.07, winH, fr, frameX, winCy, winCz, frameMat));

    // 玻璃
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(-W / 2 - 0.02, winCy, winCz);
    root.add(glass);

    /* ---------- 右墙 x = +W/2（开门） ---------- */
    const wallXR = W / 2 + T / 2;
    const doorW = DOOR.z1 - DOOR.z0;
    const doorH = DOOR.y1;
    const doorCz = (DOOR.z0 + DOOR.z1) / 2;

    const rearLen = DOOR.z0 + D / 2;
    const frontLen = D / 2 - DOOR.z1;
    root.add(box(T, H, rearLen, wallXR, H / 2, (-D / 2 + DOOR.z0) / 2, wallMat(rearLen, H)));
    root.add(box(T, H, frontLen, wallXR, H / 2, (DOOR.z1 + D / 2) / 2, wallMat(frontLen, H)));
    root.add(box(T, H - doorH, doorW, wallXR, (H + doorH) / 2, doorCz, wallMat(doorW, H - doorH)));

    // 门框
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xece2d2, roughness: 0.72 });
    const dfx = W / 2 - 0.02;
    root.add(box(0.10, doorH, 0.07, dfx, doorH / 2, DOOR.z0 + 0.035, doorFrameMat));
    root.add(box(0.10, doorH, 0.07, dfx, doorH / 2, DOOR.z1 - 0.035, doorFrameMat));
    root.add(box(0.10, 0.07, doorW, dfx, DOOR.y1 - 0.035, doorCz, doorFrameMat));

    // 门板（向屋内半开）
    const door = new THREE.Group();
    const panelW = doorW - 0.09;
    const panelH = doorH - 0.09;
    const panel = box(0.045, panelH, panelW, 0, 0, 0, darkWoodMat);
    panel.position.set(0, panelH / 2, panelW / 2);
    door.add(panel);

    // 门上的两块凹板造型
    const insetMat = new THREE.MeshStandardMaterial({ color: 0x5c3f29, roughness: 0.6 });
    [[0.72, 0.62, 0.30], [0.86, 0.46, 0.72]].forEach(function (p) {
      const ins = new THREE.Mesh(new THREE.BoxGeometry(0.02, p[0], p[1]), insetMat);
      ins.position.set(-0.026, p[2], panelW / 2);
      door.add(ins);
    });

    // 把手（两面）
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.28, metalness: 0.9 });
    [-0.075, 0.075].forEach(function (sx) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.085, 14), knobMat);
      knob.rotation.z = Math.PI / 2;
      knob.position.set(sx, 1.03, panelW - 0.13);
      door.add(knob);
    });

    door.position.set(W / 2 - 0.025, 0.02, DOOR.z0 + 0.045);
    door.rotation.y = -1.42;   // 现在门后面是厨房，门开得更彻底，好走过去
    root.add(door);

    // 门外原本有一块「昏黄走廊」的假背景板，二期东翼盖好之后就不需要了（会挡住厨房）
    // 现在门洞望出去是真的东翼（wing.js / kitchen.js）

    /* ---------- 护墙板（M2）：三面墙下半 0.85m ---------- */
    const wainBaseTex = XD.Mat.wainscot();
    function wainMat(len) {
      const t = wainBaseTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, len / 2.2), 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0 });
    }
    const waistMat = new THREE.MeshStandardMaterial({ color: 0xe8dbc4, roughness: 0.66 });

    const WH = 0.85;          // 护墙板高
    const WT = 0.03;          // 护墙板厚
    const chz = 0.06, cht = 0.05;  // 腰线

    // 后墙
    root.add(box(W, WH, WT, 0, WH / 2, -D / 2 + WT / 2, wainMat(W)));
    root.add(box(W, chz, cht, 0, WH + chz / 2, -D / 2 + cht / 2, waistMat));

    // 左墙（整条，窗台正好压在护墙板上沿）
    root.add(box(WT, WH, D, -W / 2 + WT / 2, WH / 2, 0, wainMat(D)));
    root.add(box(cht, chz, D, -W / 2 + cht / 2, WH + chz / 2, 0, waistMat));

    // 右墙（门洞断开）
    const segRearLen = DOOR.z0 + D / 2;   // 4.4
    const segFrontLen = D / 2 - DOOR.z1;  // 1.55
    const segRearCz = (-D / 2 + DOOR.z0) / 2;
    const segFrontCz = (DOOR.z1 + D / 2) / 2;
    root.add(box(WT, WH, segRearLen, W / 2 - WT / 2, WH / 2, segRearCz, wainMat(segRearLen)));
    root.add(box(WT, WH, segFrontLen, W / 2 - WT / 2, WH / 2, segFrontCz, wainMat(segFrontLen)));
    root.add(box(cht, chz, segRearLen, W / 2 - cht / 2, WH + chz / 2, segRearCz, waistMat));
    root.add(box(cht, chz, segFrontLen, W / 2 - cht / 2, WH + chz / 2, segFrontCz, waistMat));

    /* ---------- 踢脚线（压在护墙板前面） ---------- */
    const skH = 0.10;
    const skT = 0.030;
    const skx = WT + skT / 2;
    root.add(box(W, skH, skT, 0, skH / 2, -D / 2 + skx, trimMat));
    root.add(box(skT, skH, D, -W / 2 + skx, skH / 2, 0, trimMat));
    root.add(box(skT, skH, segRearLen, W / 2 - skx, skH / 2, segRearCz, trimMat));
    root.add(box(skT, skH, segFrontLen, W / 2 - skx, skH / 2, segFrontCz, trimMat));

    /* ---------- 窗帘（M2） ---------- */
    function curtain(w, h, mat, amp) {
      const geo = new THREE.PlaneGeometry(w, h, 30, 3);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = (x + w / 2) / w;
        pos.setZ(i, Math.sin(t * Math.PI * 2 * 5.5) * amp + Math.sin(t * Math.PI * 2 * 2.1) * amp * 0.55);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      return m;
    }

    const rodY = 2.80;
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.35, metalness: 0.7 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 4.8, 12), rodMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(-4.30, rodY, -0.2);
    root.add(rod);
    [-2.6, 2.2].forEach(function (z) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), rodMat);
      cap.position.set(-4.30, rodY, z);
      root.add(cap);
    });

    const heavyMat = new THREE.MeshStandardMaterial({
      color: 0xb59d7f, roughness: 0.97, metalness: 0, side: THREE.DoubleSide
    });
    const sheerMat = new THREE.MeshStandardMaterial({
      color: 0xfff8ec, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      transparent: true, opacity: 0.22, depthWrite: false
    });

    // 两侧厚帘
    const heavyL = curtain(0.82, 2.72, heavyMat, 0.05);
    heavyL.rotation.y = Math.PI / 2;
    heavyL.position.set(-4.26, 1.41, -2.26);
    root.add(heavyL);

    const heavyR = curtain(0.82, 2.72, heavyMat, 0.05);
    heavyR.rotation.y = Math.PI / 2;
    heavyR.position.set(-4.26, 1.41, 1.86);
    root.add(heavyR);

    // 中间纱帘
    const sheer = curtain(3.30, 2.62, sheerMat, 0.03);
    sheer.rotation.y = Math.PI / 2;
    sheer.position.set(-4.41, 1.45, -0.20);
    root.add(sheer);

    /* ---------- 吸顶灯（实体） ---------- */
    const lampGroup = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.32, 0.06, 28),
      new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.6 })
    );
    plate.position.y = -0.03;
    lampGroup.add(plate);

    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xfff2d8,
      emissive: new THREE.Color(0xffcf8f),
      emissiveIntensity: 1.0,
      roughness: 0.5
    });
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), shadeMat);
    shade.rotation.x = Math.PI;
    shade.position.y = -0.06;
    lampGroup.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff4de })
    );
    bulb.position.y = -0.16;
    lampGroup.add(bulb);

    lampGroup.position.set(0, H, 0);
    lampGroup.traverse(function (o) { o.castShadow = false; });
    root.add(lampGroup);

    /* ---------- 窗外夜景 ---------- */
    const nightMat = new THREE.MeshBasicMaterial({ map: XD.Mat.cityNight(), fog: false });
    const night = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), nightMat);
    night.rotation.y = Math.PI / 2;
    night.position.set(-15, 3.4, -0.2);
    root.add(night);

    // 对街的一栋楼（专门给窗户里看，别让窗是个黑洞）
    const near = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 7.2),
      new THREE.MeshBasicMaterial({ map: XD.Mat.nearBuilding(), fog: false })
    );
    near.rotation.y = Math.PI / 2;
    near.position.set(-8.4, 2.6, -0.3);
    root.add(near);

    /* ---------- 后墙上：DeepSeek 鲸鱼灯牌（我的出身） ---------- */
    // 深色亚克力背板
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.42, metalness: 0.15 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.74, 0.035), boardMat);
    board.position.set(-1.75, 2.16, -D / 2 + 0.03);
    board.castShadow = false;
    board.receiveShadow = false;
    root.add(board);

    // 发光的 logo
    const logoTex = new THREE.TextureLoader().load('assets/svg/deepseek-logo-alpha.png');
    logoTex.encoding = THREE.sRGBEncoding;
    const logoMat = new THREE.MeshBasicMaterial({
      map: logoTex,
      transparent: true,
      color: 0xa8c4ff,
      fog: false
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.34, 0.49), logoMat);
    sign.position.set(-1.75, 2.16, -D / 2 + 0.052);
    root.add(sign);

    /* ---------- 床头上方：小D的自画像（官方美术） ---------- */
    const portraitTex = new THREE.TextureLoader().load('assets/dsh/role-xiaod.png');
    portraitTex.encoding = THREE.sRGBEncoding;
    const frameMat2 = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.55 });
    const pf = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.83, 0.05), frameMat2);
    pf.position.set(1.60, 2.16, -D / 2 + 0.025);
    pf.castShadow = true;
    root.add(pf);
    const pic = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.755),
      new THREE.MeshBasicMaterial({ map: portraitTex, fog: false })
    );
    pic.position.set(1.60, 2.16, -D / 2 + 0.055);
    root.add(pic);

    // 一点蓝色溢光，别让灯牌像贴纸
    const signGlow = new THREE.PointLight(0x4d6bfe, 0.55, 3.4, 2);
    signGlow.position.set(-1.75, 2.16, -D / 2 + 0.42);
    root.add(signGlow);

    /* ---------- 门边的虎鲸门牌（DSH 应用图标，才是我） ---------- */
    const orcaTileTex = new THREE.TextureLoader().load('assets/dsh/orca-icon.png');
    orcaTileTex.encoding = THREE.sRGBEncoding;
    const tileFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.46, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x1c2436, roughness: 0.45 })
    );
    tileFrame.position.set(W / 2 - 0.018, 2.06, 0.50);
    root.add(tileFrame);

    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(0.40, 0.40),
      new THREE.MeshBasicMaterial({ map: orcaTileTex, fog: false })
    );
    tile.rotation.y = -Math.PI / 2;
    tile.position.set(W / 2 - 0.038, 2.06, 0.50);
    root.add(tile);

    scene.add(root);

    return {
      root: root,
      lamp: { group: lampGroup, shade: shadeMat, bulb: bulb },
      size: { W: W, D: D, H: H },
      // 给「昼夜切换」用的引用
      sky: { far: night, near: near, glass: glass },
      sign: { mat: logoMat, light: signGlow, board: boardMat },
      bounds: {
        minX: -W / 2 + 0.40,
        maxX: W / 2 - 0.40,
        minZ: -D / 2 + 0.40,
        maxZ: D / 2 - 0.55
      }
    };
  }

  return { build: build, SIZE: { W: W, D: D, H: H } };
})();
