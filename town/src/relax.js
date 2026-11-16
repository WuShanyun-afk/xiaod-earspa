/* 小D的赛博小家 · M60 解压游戏馆「鲸捏捏」
 *
 * 妈妈的愿望单：「再加个解压游戏馆，互动动画做成 2D 的 —— 脆皮捏捏乐、冰山泥做黏土手工、
 * 破坏化妆品、敲击；然后你在馆里当助眠主播，音频可以合成加下载。」
 *
 * 所以这间店是**直播间**：深色墙、暖射灯、一张大桌子，桌上摆四样解压玩具，
 * 桌后坐着小D（胖鲸鱼主播，戴耳机、面前一支麦克风）。
 * 点点桌上的玩具 → 全屏铺一张 canvas，进 2D 小游戏（见 relax2d.js）。
 *
 * 调试：?venue=relax 直接进馆；?relax=crisp|slime|make|tap 进门直接打开那台机器。
 */
window.XD = window.XD || {};

XD.Relax = (function () {
  'use strict';

  /* ================= 尺寸 ================= */
  const X0 = 180.0, X1 = 188.0;
  const Z0 = -3.4, Z1 = 3.2;
  const H = 3.30;
  const DOOR = { x0: 184.30, x1: 185.40, z: Z1 };
  const TABLE = { x0: 182.30, x1: 184.90, z0: -1.35, z1: 0.15, h: 0.76 };

  /* ================= 状态 ================= */
  let root = null, interact = null, sfx = null, tip = null, camera = null;
  let scene_ = null;
  let isRelaxNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let frames = null;
  let t = 0;
  let whale = null;
  let toys = {};
  let ambient = null;          // 合成的房间底噪（Web Audio）
  let ambientOn = false;

  /* ================= 小工具 ================= */
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
  function ball(r, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 16, (seg || 16) * 0.7 | 0), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function canvasTex(w, h, draw) { return XD.Mat.tex(w, h, draw); }
  function signTex(text, sub, bg, fg) {
    return canvasTex(512, 200, function (g, W, Hh) {
      g.fillStyle = bg || '#f6efdd';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = 'rgba(120,92,64,0.5)';
      g.lineWidth = 8;
      g.strokeRect(6, 6, W - 12, Hh - 12);
      g.fillStyle = fg || '#3c2f24';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 72px "Microsoft YaHei","PingFang SC",sans-serif';
      g.fillText(text, W / 2, sub ? Hh * 0.40 : Hh / 2);
      if (sub) {
        g.font = 'bold 34px "Microsoft YaHei","PingFang SC",sans-serif';
        g.globalAlpha = 0.7;
        g.fillText(sub, W / 2, Hh * 0.72);
        g.globalAlpha = 1;
      }
    });
  }
  function labelTex(text, sub) {
    return canvasTex(256, 150, function (g, W, Hh) {
      g.fillStyle = '#fbf4e6';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = 'rgba(120,92,64,0.55)';
      g.lineWidth = 6;
      g.strokeRect(5, 5, W - 10, Hh - 10);
      g.fillStyle = '#4a3a2c';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 52px "Microsoft YaHei","PingFang SC",sans-serif';
      g.fillText(text, W / 2, sub ? Hh * 0.40 : Hh / 2);
      if (sub) {
        g.fillStyle = '#8a7361';
        g.font = '400 32px "Microsoft YaHei",sans-serif';
        g.fillText(sub, W / 2, Hh * 0.72);
      }
    });
  }

  /* ================= 房间 ================= */
  function buildRoom() {
    // 地板（深色木地板）
    const floorTex = canvasTex(256, 256, function (g, W, Hh) {
      g.fillStyle = '#4a3728';
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#523d2c' : '#463327';
        g.fillRect(0, i * 32, W, 30);
        g.fillStyle = 'rgba(20,12,8,0.35)';
        g.fillRect(0, i * 32 + 30, W, 2);
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(90,70,50,0.25)';
        g.fillRect(Math.random() * W, Math.random() * Hh, 30 + Math.random() * 40, 1.5);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(X1 - X0, Z1 - Z0),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    floor.receiveShadow = true;
    root.add(floor);

    // 天花板
    box(X1 - X0, 0.12, Z1 - Z0, std(0x2a2630, 0.95), (X0 + X1) / 2, H + 0.06, (Z0 + Z1) / 2);

    const wall = std(0x33384a, 0.94);
    const panel = std(0x4a4256, 0.88);
    // 北墙（背景墙）
    box(X1 - X0, H, 0.14, wall, (X0 + X1) / 2, H / 2, Z0 - 0.07);
    // 东墙 / 西墙
    box(0.14, H, Z1 - Z0, wall, X0 + 0.07, H / 2, (Z0 + Z1) / 2);
    box(0.14, H, Z1 - Z0, wall, X1 - 0.07, H / 2, (Z0 + Z1) / 2);
    // 南墙（门 + 一扇小窗）
    box(0.90, H, 0.14, wall, (X0 + DOOR.x0) / 2, H / 2, Z1 + 0.07);
    box(0.90, H, 0.14, wall, (DOOR.x1 + X1) / 2, H / 2, Z1 + 0.07);
    box(DOOR.x1 - DOOR.x0, H - 2.30, 0.14, wall, (DOOR.x0 + DOOR.x1) / 2, 2.30 + (H - 2.30) / 2, Z1 + 0.07);
    // 门框 + 门帘（布艺门帘，比玻璃门有直播间的味道）
    const trim = std(0x7d6a52, 0.85);
    box(0.24, 2.42, 0.18, trim, DOOR.x0 - 0.12, 1.21, Z1 + 0.02);
    box(0.24, 2.42, 0.18, trim, DOOR.x1 + 0.12, 1.21, Z1 + 0.02);
    box(DOOR.x1 - DOOR.x0 + 0.48, 0.18, 0.18, trim, (DOOR.x0 + DOOR.x1) / 2, 2.42, Z1 + 0.02);
    const curtainMat = new THREE.MeshStandardMaterial({
      color: col(0x6b5a76), roughness: 0.96, side: THREE.DoubleSide
    });
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR.x1 - DOOR.x0 - 0.06, 2.16, 8, 1),
      curtainMat
    );
    curtain.position.set((DOOR.x0 + DOOR.x1) / 2, 1.24, Z1 - 0.02);
    curtain.castShadow = false;
    root.add(curtain);
    frames.curtain = curtain;

    // 西墙：一排软包 + 串灯
    for (let i = 0; i < 3; i++) {
      box(0.10, 0.86, 1.05, panel, X0 + 0.12, 1.55, -1.9 + i * 1.5);
    }
    // 背景墙的大招牌
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.98),
      new THREE.MeshStandardMaterial({ map: signTex('鲸捏捏', 'SQUISH · ASMR · 24h', '#241d2b', '#ffd9a0'), roughness: 0.9 })
    );
    sign.position.set((X0 + X1) / 2, 2.42, Z0 + 0.02);
    root.add(sign);

    // 串灯（背景墙顶上一条）
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    lampMat.toneMapped = false;
    frames.bulbs = [];
    for (let i = 0; i < 14; i++) {
      const b = ball(0.035, lampMat, X0 + 0.8 + i * 0.46, 2.98, Z0 + 0.10, root, 8);
      b.castShadow = false;
      frames.bulbs.push(b);
    }

    // 地毯
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 36),
      new THREE.MeshStandardMaterial({ color: col(0x3f3550), roughness: 0.98 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(183.6, 0.009, -0.4);
    rug.receiveShadow = true;
    root.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 36),
      new THREE.MeshStandardMaterial({ color: col(0x584a6c), roughness: 0.98 }));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(183.6, 0.012, -0.4);
    root.add(rug2);

    // 抱枕堆（角落）
    [[0.42, 0x8a6f9e, 180.6, 0.30, -2.95], [0.38, 0xd9a08a, 181.3, 0.28, -3.02], [0.34, 0x7fa8b8, 180.9, 0.62, -2.98]]
      .forEach(function (p) {
        const m = ball(p[0], std(p[1], 0.98), p[2], p[3], p[4], root, 14);
        m.scale.set(1, 0.62, 1);
      });
  }

  /* ================= 桌子 ================= */
  function buildTable() {
    const wood = std(0x6b5138, 0.9);
    const top = std(0x8a6f52, 0.88);
    // 桌面
    box(TABLE.x1 - TABLE.x0, 0.06, TABLE.z1 - TABLE.z0, top,
      (TABLE.x0 + TABLE.x1) / 2, TABLE.h - 0.03, (TABLE.z0 + TABLE.z1) / 2);
    // 四条腿
    [[TABLE.x0 + 0.12, TABLE.z0 + 0.12], [TABLE.x1 - 0.12, TABLE.z0 + 0.12],
     [TABLE.x0 + 0.12, TABLE.z1 - 0.12], [TABLE.x1 - 0.12, TABLE.z1 - 0.12]].forEach(function (p) {
      box(0.09, TABLE.h - 0.06, 0.09, wood, p[0], (TABLE.h - 0.06) / 2, p[1]);
    });
    // 桌前沿的小挡条（防止东西滚下去）
    box(TABLE.x1 - TABLE.x0, 0.05, 0.05, wood, (TABLE.x0 + TABLE.x1) / 2, TABLE.h + 0.02, TABLE.z1 - 0.03);
  }

  /* ================= 小D（主播） ================= */
  function buildWhale() {
    const g = new THREE.Group();
    g.position.set(183.60, 0.88, -1.80);
    g.rotation.y = 0.16;
    root.add(g);

    const bodyMat = std(0x5f7fa6, 0.72);
    const bellyMat = std(0xdfe9f2, 0.82);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: 0.28 });
    const blushMat = new THREE.MeshStandardMaterial({
      color: 0xe08f92, roughness: 0.9, transparent: true, opacity: 0.65
    });

    // 身子（胖胖的椭球）
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 26, 20), bodyMat);
    body.scale.set(1.0, 0.92, 1.28);
    body.castShadow = true;
    g.add(body);
    // 肚子
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.50, 22, 16), bellyMat);
    belly.scale.set(0.95, 0.80, 1.15);
    belly.position.set(0, -0.20, 0.28);
    g.add(belly);
    // 尾鳍
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 10), bodyMat);
    tail.scale.set(1.5, 0.28, 0.62);
    tail.position.set(0, 0.10, -0.82);
    tail.rotation.x = 0.28;
    tail.castShadow = true;
    g.add(tail);
    // 背鳍
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bodyMat);
    fin.scale.set(0.62, 0.85, 0.95);
    fin.position.set(0, 0.46, -0.12);
    g.add(fin);
    // 胸鳍（两只小手）
    [-1, 1].forEach(function (s) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 10), bodyMat);
      f.scale.set(1.0, 0.42, 1.55);
      f.position.set(s * 0.56, -0.10, 0.10);
      f.rotation.z = s * -0.35;
      f.castShadow = true;
      g.add(f);
    });
    // 眼睛
    [-1, 1].forEach(function (s) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), eyeMat);
      e.position.set(s * 0.28, 0.22, 0.78);
      g.add(e);
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      sp.position.set(s * 0.28 + 0.018, 0.25, 0.822);
      g.add(sp);
      // 腮红
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), blushMat);
      b.scale.set(1, 0.62, 0.4);
      b.position.set(s * 0.42, -0.04, 0.66);
      g.add(b);
    });
    // 耳机（主播标配）
    const headMat = std(0x2b3240, 0.6, 0.2);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 8, 22, Math.PI), headMat);
    band.position.set(0, 0.30, 0.02);
    // M68：以前这里绕 y 转了 90°，头梁变成"前后方向"的一道拱 ——
    // 从正面看就是一根黑棍子插在头顶上（妈妈最烦穿模）。归零，让它横跨左右耳。
    band.rotation.y = 0;
    band.rotation.x = 0.06;
    g.add(band);
    [-1, 1].forEach(function (s) {
      const cup = cyl(0.125, 0.125, 0.10, 18, headMat, s * 0.62, 0.20, 0.08, g);
      cup.rotation.z = Math.PI / 2;
      const pad = cyl(0.09, 0.09, 0.03, 16, std(0xd08f9a, 0.95), s * 0.57, 0.20, 0.08, g);
      pad.rotation.z = Math.PI / 2;
    });
    // 一点小光泽
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }));
    shine.position.set(-0.26, 0.42, 0.42);
    g.add(shine);

    whale = { g: g, body: body, baseY: 0.88, head: g };
    return g;
  }

  /* ================= 直播设备 ================= */
  function buildGear() {
    // 麦克风（悬臂）
    const metal = std(0x3a3f4a, 0.55, 0.4);
    box(0.14, 0.03, 0.14, metal, 184.55, TABLE.h + 0.01, -1.20);
    cyl(0.022, 0.022, 0.50, 10, metal, 184.55, TABLE.h + 0.26, -1.20);
    const arm = cyl(0.02, 0.02, 0.42, 10, metal, 184.55, TABLE.h + 0.50, -1.02);
    arm.rotation.x = Math.PI / 2.6;
    const micBody = cyl(0.055, 0.055, 0.16, 14, std(0x22262e, 0.6), 184.55, TABLE.h + 0.55, -0.86);
    micBody.rotation.x = 0.4;
    const micGrill = ball(0.056, std(0x8a8f98, 0.5, 0.5), 184.55, TABLE.h + 0.62, -0.80, null, 12);
    void micGrill;

    // 补光灯 ×2（灯架 + 白色柔光罩）
    [[181.15, -1.55], [186.15, -1.55]].forEach(function (p) {
      cyl(0.025, 0.03, 1.55, 10, metal, p[0], 0.78, p[1]);
      // M61：三条腿按 120° 均分往外撇（以前是一根直两根乱歪，看着像一堆黑棍）
      [0, 2.094, 4.189].forEach(function (a) {
        const leg = cyl(0.016, 0.016, 0.44, 8, metal,
          p[0] + Math.cos(a) * 0.17, 0.20, p[1] + Math.sin(a) * 0.17);
        leg.rotation.z = Math.cos(a) * 0.34;
        leg.rotation.x = -Math.sin(a) * 0.34;
      });
      // M61：柔光罩改成**半球碗**、开口朝下前方。
      // 以前是一个扁圆盘 + 最后一句 rotation.set(-0.5,0,0) 把它翻成朝天，
      // 从屋里看就是一片飘在空中的白鸡蛋。
      const shade = new THREE.Mesh(
        new THREE.SphereGeometry(0.30, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
        new THREE.MeshStandardMaterial({
          color: col(0xf4ecdf), roughness: 0.55,
          emissive: col(0xffe7c4), emissiveIntensity: 0.60,
          side: THREE.DoubleSide
        })
      );
      shade.position.set(p[0], 1.60, p[1]);
      shade.rotation.set(0.42, 0, 0);
      root.add(shade);
      const gl = new THREE.PointLight(0xffe2b8, 0.85, 5.2, 2);
      gl.position.set(p[0], 1.48, p[1] + 0.30);
      gl.userData.cozy = true;
      root.add(gl);
      (frames.lights || (frames.lights = [])).push(gl);
    });

    // 摄像头三脚架（对着桌子）
    cyl(0.02, 0.02, 1.22, 8, metal, 186.35, 0.61, 1.35);
    [0, 2.094, 4.189].forEach(function (a) {
      const leg = cyl(0.014, 0.014, 0.46, 8, metal,
        186.35 + Math.cos(a) * 0.16, 0.19, 1.35 + Math.sin(a) * 0.16);
      leg.rotation.z = Math.cos(a) * 0.36;
      leg.rotation.x = -Math.sin(a) * 0.36;
    });
    box(0.16, 0.12, 0.20, std(0x24282f, 0.7), 186.35, 1.28, 1.35);
    cyl(0.05, 0.05, 0.06, 14, std(0x14171c, 0.4, 0.6), 186.35, 1.28, 1.24).rotation.x = Math.PI / 2;

    // 主播椅
    const chair = std(0x4a3f54, 0.95);
    box(0.62, 0.10, 0.60, chair, 183.60, 0.46, -1.82);
    box(0.62, 0.62, 0.10, chair, 183.60, 0.78, -2.10);
    [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]].forEach(function (p) {
      box(0.06, 0.46, 0.06, std(0x2f2a38, 0.8), 183.60 + p[0], 0.23, -1.82 + p[1]);
    });

    // 「直播中」的小红灯
    const liveMat = new THREE.MeshBasicMaterial({ color: 0xff5a6a });
    liveMat.toneMapped = false;
    const live = ball(0.05, liveMat, 184.90, 2.95, Z0 + 0.12, null, 10);
    const livePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.20),
      new THREE.MeshStandardMaterial({ map: labelTex('● LIVE', ''), roughness: 0.9 })
    );
    livePlate.position.set(184.90, 2.95, Z0 + 0.14);
    root.add(livePlate);
    frames.live = { mat: liveMat, plate: livePlate };

    // 背景墙的今日节目单
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.78),
      new THREE.MeshStandardMaterial({
        map: canvasTex(384, 256, function (g, W, Hh) {
          g.fillStyle = '#1f1b26';
          g.fillRect(0, 0, W, Hh);
          g.fillStyle = '#ffd9a0';
          g.font = 'bold 38px "Microsoft YaHei",sans-serif';
          g.textAlign = 'center';
          g.fillText('今晚的节目', W / 2, 52);
          g.font = '400 32px "Microsoft YaHei",sans-serif';
          g.fillStyle = '#e8dcc8';
          g.textAlign = 'left';
          ['· 脆皮捏捏 20:00', '· 冰山泥 21:30', '· 砸口红 23:00', '· 敲木琴 睡前'].forEach(function (s, i) {
            g.fillText(s, 44, 110 + i * 40);
          });
        }), roughness: 0.92
      })
    );
    board.position.set(181.35, 2.10, Z0 + 0.02);
    root.add(board);
  }

  /* ================= 助眠设备（M61） =================
   * 妈妈说「增加一些助眠设备，参考小红书上的助眠活动」。
   * 真实的助眠直播间里手边就是这几样：洞洞板上挂一排能刮麦的物件
   * （刷子 / 羽毛 / 木块 / 玻璃棒 / 蜂蜜勺），地上立一根雨棍，
   * 边几上摆颂钵和香薰机，头顶一个星空投影，再来一张能躺平的软椅。
   */
  const COMFORT = [
    { k: 'brush', name: '猪鬃刷', clip: 'brush.mp3', vol: 0.34,
      x: 187.62, y: 1.66, z: -2.15, w: 0.34, h: 1.12, d: 0.40,
      line: '刷子划过麦 —— 沙沙的，像有人在替你梳头发' },
    { k: 'feather', name: '羽毛', clip: 'feather.mp3', vol: 0.38,
      x: 187.62, y: 1.62, z: -1.62, w: 0.34, h: 1.02, d: 0.36,
      line: '羽毛最轻 —— 呼一下，耳朵先软了' },
    { k: 'woodtap', name: '小木块', clip: 'woodtap.mp3', vol: 0.46,
      x: 187.62, y: 1.58, z: -1.09, w: 0.34, h: 0.96, d: 0.36,
      line: '木头敲起来是暖的，哒、哒、哒' },
    { k: 'glassrod', name: '玻璃棒', clip: 'woodtap.mp3', vol: 0.36,
      x: 187.62, y: 1.62, z: -0.56, w: 0.34, h: 1.02, d: 0.36,
      line: '玻璃棒比木头亮一点 —— 敲玻璃杯就是这种声音' },
    { k: 'honeyspoon', name: '蜂蜜勺', clip: 'mouth.mp3', vol: 0.42,
      x: 187.62, y: 1.56, z: -0.03, w: 0.34, h: 0.94, d: 0.36,
      line: '蜂蜜勺 —— 口腔音就靠它，黏糊糊的那种' },
    // M62：照小红书上真实助眠主播又补的四样
    { k: 'glass', name: '玻璃杯', clip: 'glass.mp3', vol: 0.34,
      x: 187.62, y: 1.53, z: 0.55, w: 0.34, h: 0.56, d: 0.34,
      line: '刀背轻轻敲杯口 —— 叮的一下，玻璃会一直转音' },
    { k: 'cloth', name: '棉布', clip: 'cloth.mp3', vol: 0.38,
      x: 187.62, y: 1.56, z: 1.05, w: 0.34, h: 0.58, d: 0.36,
      line: '粗糙的棉布揉成一团 —— 低频的沙沙，最温柔的那一类' },
    { k: 'lipbalm', name: '唇膏', clip: 'mouth.mp3', vol: 0.42,
      x: 187.62, y: 1.56, z: 1.45, w: 0.32, h: 0.52, d: 0.32,
      line: '唇膏在麦上蹭一蹭 —— 最热的那种「涂麦」口腔音' },
    { k: 'waterstick', name: '流水棒', clip: 'water.mp3', vol: 0.34,
      x: 187.40, y: 0.28, z: 1.10, w: 0.34, h: 0.64, d: 0.34,
      line: '把流水棒翻过来 —— 像有人在你枕边放了条小溪' },
    { k: 'tape', name: '胶带卷', clip: 'peel.mp3', vol: 0.34,
      x: 186.72, y: 0.75, z: 2.72, w: 0.30, h: 0.28, d: 0.30,
      line: '一截胶带慢慢撕开 —— 那种黏黏的拉扯声' },
    { k: 'rainstick', name: '雨棍', clip: 'rain.mp3', vol: 0.36,
      x: 187.28, y: 0.62, z: 1.95, w: 0.44, h: 1.28, d: 0.44,
      line: '把雨棍倒过来 —— 整场雨都往下走' },
    { k: 'bowl', name: '颂钵', clip: 'bowl.mp3', vol: 0.42,
      x: 186.52, y: 0.76, z: 2.50, w: 0.66, h: 0.48, d: 0.66,
      line: '颂钵敲一下能响好久 —— 听着听着就困了' },
    { k: 'diffuser', name: '香薰机', clip: 'water.mp3', vol: 0.22,
      x: 186.54, y: 0.80, z: 2.86, w: 0.44, h: 0.50, d: 0.40,
      line: '香薰机在吐白雾 —— 是橘子味的' },
    { k: 'starlight', name: '星空灯', clip: 'bowl.mp3', vol: 0.16,
      x: 182.40, y: 2.84, z: 0.65, w: 0.70, h: 0.46, d: 0.70,
      line: '把灯关了，天花板就是一片星星' },
    { k: 'lounge', name: '软椅', clip: 'cloth.mp3', vol: 0.30,
      x: 186.05, y: 0.44, z: 2.50, w: 1.00, h: 0.90, d: 1.10,
      line: '躺下来听吧，我在这儿一直播到你睡着' }
  ];

  /* ================= 真实录音（M61 / M62） =================
   * 和 2D 那边同一个毛病：下回来的素材开头有静音，从 0 秒播就是"没声"。
   * 这里用 Web Audio 解码后扫出有声段（first~last），点一下从中间随机取一截播。
   * 解码失败 / 404 → 不出声（3D 只是点缀，不硬兜合成音）。
   */
  const clipRec = {};        // file -> { buf, first, last }
  const clipDead = {};
  const clipLoading = {};
  let clipAc = null, clipMaster = null;

  function clipAudio() {
    if (clipAc) return clipAc;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      clipAc = new AC();
      clipMaster = clipAc.createGain();
      clipMaster.gain.value = 0.6;
      clipMaster.connect(clipAc.destination);
    } catch (e) { clipAc = null; }
    return clipAc;
  }

  function analyzeBuffer(buf) {
    const ch = buf.getChannelData(0);
    const n = ch.length;
    const sr = buf.sampleRate || 44100;
    const step = Math.max(1, Math.floor(sr / 250));
    const peaks = [];
    for (let i = 0; i < n; i += step) {
      let m = 0;
      const end = Math.min(i + step, n);
      for (let j = i; j < end; j++) {
        const v = ch[j] < 0 ? -ch[j] : ch[j];
        if (v > m) m = v;
      }
      peaks.push(m);
    }
    let mx = 0;
    for (let i = 0; i < peaks.length; i++) if (peaks[i] > mx) mx = peaks[i];
    const gate = Math.max(0.012, mx * 0.16);
    let s = 0;
    while (s < peaks.length && peaks[s] < gate) s++;
    let e = peaks.length - 1;
    while (e > s && peaks[e] < gate) e--;
    const dur = buf.duration || (n / sr);
    let first = (s * step) / sr;
    let last = ((e + 1) * step) / sr;
    if (last - first < 0.12) { first = 0; last = dur; }
    return { buf: buf, first: first, last: Math.min(last, dur) };
  }

  function loadClip(file) {
    if (clipRec[file] || clipDead[file] || clipLoading[file]) return;
    const a = clipAudio();
    if (!a) { clipDead[file] = true; return; }
    clipLoading[file] = true;
    fetch('assets/relax-audio/' + file).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) {
        try { a.decodeAudioData(ab, res, rej); } catch (e) { rej(e); }
      });
    }).then(function (buf) {
      clipRec[file] = analyzeBuffer(buf);
    }).catch(function () { clipDead[file] = true; });
  }

  // M62.1：播放走 <audio>（Web Audio 在某些策略下会"成功但没声"），
  // 解码只用来拿「有声段」的起点，播放前 seek 过去。
  const clipEls = {};
  const clipTimers = {};
  let lastClip = null;
  const clipOff = {
    'crisp.mp3': 0.31, 'squish.mp3': 0.42, 'crack.mp3': 0.43, 'powder.mp3': 0.58,
    'sand.mp3': 0.02, 'woodtap.mp3': 0.62, 'bubble.mp3': 1.23, 'mouth.mp3': 0.07,
    'brush.mp3': 0.11, 'feather.mp3': 1.40, 'rain.mp3': 0.37, 'bowl.mp3': 0.04,
    'glass.mp3': 0.30, 'cloth.mp3': 0.40, 'water.mp3': 0.30, 'peel.mp3': 0.15
  };

  // 进店先把所有道具的声音解码好 —— 不然第一次点会用到上面那张"猜的"偏移表，可能落在静音上
  function preloadClips() {
    COMFORT.forEach(function (d) { if (d.clip) loadClip(d.clip); });
  }

  function playClip(file, vol, maxDur) {
    if (!file) return;
    if (XD.SFX && XD.SFX.isMuted && XD.SFX.isMuted()) return;
    loadClip(file);                     // 解码只为拿到有声段起点（失败就用写死的表）
    const rec = clipRec[file];
    const want = maxDur || 4;
    const first = rec ? rec.first : (clipOff[file] || 0.1);
    const last = rec ? rec.last : first + want + 2;
    const usable = Math.max(0.3, last - first);
    const span = Math.max(0, usable - want);
    const off = first + (span > 0.05 ? Math.random() * span : 0) + 0.01;
    let el = clipEls[file];
    if (!el) {
      try {
        el = new Audio('assets/relax-audio/' + file);
        el.preload = 'auto';
        el.addEventListener('error', function () { clipDead[file] = true; });
        clipEls[file] = el;
      } catch (e) { return; }
    }
    if (clipDead[file]) return;
    try {
      el.pause();
      try { el.currentTime = off; } catch (e) {}
      el.volume = Math.min(1, vol === undefined ? 0.4 : vol);
      const p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { return; }
    if (clipTimers[file]) clearTimeout(clipTimers[file]);
    clipTimers[file] = setTimeout(function () { try { el.pause(); } catch (e) {} }, want * 1000 + 40);
    lastClip = { file: file, off: Math.round(off * 100) / 100 };
  }

  function buildComfort() {
    const woodMat = std(0x8a6a48, 0.88);
    const brass = std(0xb8912f, 0.36, 0.6);
    const darkWood = std(0x5c4630, 0.9);
    const TAUd = Math.PI * 2;

    // ── 洞洞板（东墙，软木色 + 木框）──
    // M62：按小红书上真实助眠主播的做法又加了两样（玻璃杯 / 棉布），板子往南延长
    const BD = 4.10, BC = -0.30;
    box(0.05, 1.52, BD, std(0x7a5a3c, 0.96), 187.84, 1.60, BC);
    box(0.07, 0.07, BD + 0.08, std(0x4a3728, 0.9), 187.82, 2.36, BC);
    box(0.07, 0.07, BD + 0.08, std(0x4a3728, 0.9), 187.82, 0.84, BC);
    box(0.07, 1.52, 0.07, std(0x4a3728, 0.9), 187.82, 1.60, BC - BD / 2);
    box(0.07, 1.52, 0.07, std(0x4a3728, 0.9), 187.82, 1.60, BC + BD / 2);
    // 上面的小挂钩
    function hook(z) { cyl(0.012, 0.012, 0.07, 8, brass, 187.77, 1.90, z); }

    // ① 刷子（木柄 + 一大排毛）
    hook(-2.15);
    box(0.05, 0.34, 0.06, woodMat, 187.70, 1.80, -2.15);
    box(0.12, 0.18, 0.34, std(0xc8a878, 0.97), 187.66, 1.54, -2.15);
    for (let i = 0; i < 6; i++) {
      box(0.03, 0.10, 0.05, std(0xe0c49a, 0.98), 187.62, 1.42, -2.29 + i * 0.058);
    }

    // ② 羽毛（羽轴 + 两片羽面）
    hook(-1.62);
    cyl(0.008, 0.008, 0.52, 6, std(0xe8dcc8, 0.9), 187.68, 1.60, -1.62);
    const featherMat = new THREE.MeshStandardMaterial({
      color: col(0xfbf2e4), roughness: 0.96, side: THREE.DoubleSide
    });
    [-1, 1].forEach(function (s) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.42), featherMat);
      f.position.set(187.66, 1.62, -1.62 + s * 0.062);
      f.rotation.y = Math.PI / 2;
      f.rotation.x = s * 0.06;
      f.castShadow = false;
      root.add(f);
    });

    // ③ 小木块（三块，深浅不同）
    hook(-1.09);
    for (let i = 0; i < 3; i++) {
      box(0.13, 0.24 - i * 0.05, 0.13,
        std(i === 0 ? 0xb08a5a : (i === 1 ? 0x8a6a48 : 0x6b5138), 0.9),
        187.68, 1.70 - i * 0.16, -1.09);
    }

    // ④ 玻璃棒
    hook(-0.56);
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xdff2ff), roughness: 0.10, metalness: 0.05,
      transparent: true, opacity: 0.60
    });
    cyl(0.035, 0.035, 0.58, 12, glassMat, 187.68, 1.54, -0.56);
    ball(0.035, glassMat, 187.68, 1.25, -0.56, null, 10);

    // ⑤ 蜂蜜勺
    hook(-0.03);
    cyl(0.016, 0.016, 0.40, 8, brass, 187.68, 1.66, -0.03);
    const scoop = ball(0.075, brass, 187.68, 1.42, -0.03, null, 12);
    scoop.scale.set(1, 0.55, 1);

    // ⑥ 玻璃杯（刀背轻敲杯口 —— 真实助眠里最经典的一条）
    hook(0.55);
    // 奶白陶瓷杯：透明的玻璃在深色墙前面会糊成一根灰柱，陶瓷的反而一眼认得出
    const cupMat = std(0xf4ede2, 0.5);
    cyl(0.076, 0.058, 0.17, 18, cupMat, 187.66, 1.50, 0.55);
    cyl(0.079, 0.079, 0.02, 18, std(0xe8e0d2, 0.55), 187.66, 1.60, 0.55);

    // ⑦ 棉布（揉搓 —— 低频最温柔的那一类）
    hook(1.05);    const clothMat = new THREE.MeshStandardMaterial({
      color: col(0xd9c8ae), roughness: 0.99, side: THREE.DoubleSide
    });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.40), clothMat);
      c.position.set(187.68 - i * 0.008, 1.60, 1.05 + (i - 1) * 0.028);
      c.rotation.y = Math.PI / 2;
      c.rotation.z = -0.12 + i * 0.10;
      c.castShadow = false;
      root.add(c);
    }

    // ⑧ 流水棒（铜座 + 硅胶管，晃一晃是细细的水声）
    const brassMat = std(0xc9a24a, 0.42, 0.55);
    cyl(0.075, 0.085, 0.06, 16, brassMat, 187.40, 0.03, 1.10);
    const wtube = cyl(0.038, 0.038, 0.42, 12, std(0xd9e6ee, 0.5), 187.40, 0.26, 1.10);
    wtube.rotation.z = 0.14;
    cyl(0.04, 0.04, 0.06, 12, brassMat, 187.46, 0.47, 1.10);

    // ⑨ 胶带卷（慢慢撕开的那种黏黏声）
    const tapeMat = std(0xd8c7a8, 0.88);
    const tape = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.034, 8, 20), tapeMat);
    tape.position.set(186.72, 0.705, 2.72);
    tape.rotation.x = Math.PI / 2;
    tape.castShadow = true;
    root.add(tape);

    // ⑧ 唇膏（涂麦 —— 小红书上最热的那种口腔音玩法）
    hook(1.45);
    cyl(0.023, 0.023, 0.17, 10, std(0xc9a24a, 0.45, 0.5), 187.68, 1.63, 1.45);
    const balm = cyl(0.020, 0.020, 0.10, 10, std(0xd98a9a, 0.5), 187.68, 1.50, 1.45);
    balm.rotation.x = 0.22;

    // 每样下面挂一块小名牌（不然看不出挂的是啥）
    [['刷子', -2.15], ['羽毛', -1.62], ['木块', -1.09], ['玻璃棒', -0.56],
     ['蜂蜜勺', -0.03], ['玻璃杯', 0.55], ['棉布', 1.05], ['唇膏', 1.45]]
      .forEach(function (it) {
        const p = new THREE.Mesh(
          new THREE.PlaneGeometry(0.26, 0.11),
          new THREE.MeshStandardMaterial({ map: labelTex(it[0], ''), roughness: 0.94 })
        );
        p.position.set(187.80, 1.12, it[1]);
        p.rotation.y = -Math.PI / 2;
        root.add(p);
      });

    // ── 雨棍（立在东南角）──
    cyl(0.055, 0.055, 1.10, 12, std(0x8a5a3a, 0.9), 187.28, 0.57, 1.95);
    for (let i = 0; i < 5; i++) {
      cyl(0.062, 0.062, 0.014, 12, std(i % 2 ? 0xd9a05a : 0x5a7a8a, 0.9),
        187.28, 0.16 + i * 0.20, 1.95);
    }
    frames.rain = root.children[root.children.length - 1];

    // ── 边几 + 颂钵 + 香薰机 ──
    cyl(0.30, 0.30, 0.04, 20, darkWood, 186.52, 0.62, 2.55);
    cyl(0.035, 0.035, 0.58, 10, darkWood, 186.52, 0.31, 2.55);
    cyl(0.22, 0.24, 0.03, 20, darkWood, 186.52, 0.03, 2.55);

    const bowlMat = std(0xb08a2a, 0.32, 0.62);
    const bowlMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 22, 12, 0, TAUd, Math.PI * 0.5, Math.PI * 0.5),
      bowlMat
    );
    bowlMesh.position.set(186.48, 0.70, 2.46);
    bowlMesh.castShadow = true;
    root.add(bowlMesh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 8, 24), bowlMat);
    rim.position.set(186.48, 0.70, 2.46);
    rim.rotation.x = Math.PI / 2;
    root.add(rim);
    // 木槌
    const mallet = cyl(0.016, 0.016, 0.30, 8, woodMat, 186.68, 0.74, 2.52);
    mallet.rotation.z = 1.15;
    frames.bowl = bowlMesh;
    frames.bowlRing = 0;

    // 香薰机（小瓶子 + 雾）
    cyl(0.075, 0.09, 0.20, 16, std(0xe6dccb, 0.62), 186.54, 0.74, 2.88);
    cyl(0.05, 0.05, 0.04, 16, std(0x9a8a72, 0.7), 186.54, 0.86, 2.88);
    const mistMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.09, depthWrite: false
    });
    frames.mist = [];
    for (let i = 0; i < 3; i++) {
      const m = ball(0.055 + i * 0.022, mistMat.clone(), 186.54, 0.94 + i * 0.12, 2.88, null, 8);
      m.castShadow = false;
      frames.mist.push({ m: m, ph: i * 2.1 });
    }

    // ── 星空投影（天花板）──
    const domeMat = std(0x232029, 0.7);
    cyl(0.13, 0.16, 0.10, 18, domeMat, 182.40, 2.96, 0.65);
    const glow = new THREE.MeshBasicMaterial({ color: 0xa8c8ff, transparent: true, opacity: 0.55 });
    const glowDisc = ball(0.09, glow, 182.40, 2.90, 0.65, null, 12);
    glowDisc.castShadow = false;
    // 星星贴着天花板铺一圈（以前铺在 2.8 米高空，看着像屋里下雪）
    frames.stars = [];
    for (let i = 0; i < 34; i++) {
      const s = new THREE.MeshBasicMaterial({
        color: 0xcfe0ff, transparent: true, opacity: 0.2 + Math.random() * 0.5
      });
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * 1.75;
      const st = ball(0.012 + Math.random() * 0.010, s,
        182.40 + Math.cos(a) * rr, 3.22, 0.65 + Math.sin(a) * rr * 1.35, null, 6);
      st.castShadow = false;
      frames.stars.push({ m: st, ph: Math.random() * 6.28 });
    }

    // ── 软椅（能躺下的那张）──
    const sofa = std(0x5a4a66, 0.96);
    const sofa2 = std(0x6d5a7c, 0.94);
    box(0.96, 0.22, 1.24, sofa, 186.05, 0.30, 2.50);
    box(0.96, 0.16, 0.18, sofa2, 186.05, 0.62, 3.06);          // 靠背
    box(0.16, 0.30, 1.24, sofa2, 186.61, 0.44, 2.50);          // 扶手
    box(0.16, 0.30, 1.24, sofa2, 185.49, 0.44, 2.50);
    [[-0.36, -0.5], [0.36, -0.5], [-0.36, 0.5], [0.36, 0.5]].forEach(function (p) {
      box(0.07, 0.20, 0.07, darkWood, 186.05 + p[0], 0.10, 2.50 + p[1]);
    });
    // 搭在上面的小毯子
    const throwMat = std(0xd9a08a, 0.98);
    const th = box(0.70, 0.04, 0.54, throwMat, 186.02, 0.43, 2.10);
    th.rotation.y = 0.10;
  }

  /* ================= 四个解压玩具（桌上） ================= */
  const TOY_DEF = [
    { k: 'crisp', name: '脆皮捏捏', sub: '戳一戳', x: 182.55, z: -0.95, yaw: 0.10 },
    { k: 'slime', name: '冰山泥', sub: '拉一拉', x: 183.35, z: -0.95, yaw: -0.08 },
    { k: 'make', name: '化妆品', sub: '砸一砸', x: 184.15, z: -0.95, yaw: 0.08 },
    { k: 'tap', name: '敲击木琴', sub: '敲一敲', x: 182.55, z: -0.42, yaw: -0.05 },
    { k: 'bubble', name: '泡泡纸', sub: '按一按', x: 183.35, z: -0.42, yaw: 0.06 },
    { k: 'sand', name: '沙画', sub: '划一划', x: 184.15, z: -0.42, yaw: -0.06 }
  ];

  function buildToys() {
    TOY_DEF.forEach(function (d) {
      const g = new THREE.Group();
      g.position.set(d.x, TABLE.h + 0.03, d.z);
      g.rotation.y = d.yaw;
      root.add(g);
      toys[d.k] = g;

      if (d.k === 'crisp') {
        // 脆皮方块（奶白 + 巧克力脆面）
        const body = box(0.34, 0.20, 0.34, std(0xf7efdf, 0.86), 0, 0.10, 0, g);
        body.castShadow = true;
        box(0.36, 0.035, 0.36, std(0x6b4630, 0.7), 0, 0.20, 0, g);
        // 表面碎粒
        for (let i = 0; i < 16; i++) {
          const s = 0.012 + Math.random() * 0.016;
          box(s, s, s, std(i % 3 ? 0x8a5c3a : 0xe8d8bd, 0.8),
            (Math.random() - 0.5) * 0.32, 0.225, (Math.random() - 0.5) * 0.32, g).castShadow = false;
        }
      } else if (d.k === 'slime') {
        // 冰山泥（半透明蓝，不规则）
        const m = new THREE.MeshStandardMaterial({
          color: col(0x8fd0ee), roughness: 0.28, metalness: 0.05,
          transparent: true, opacity: 0.82
        });
        const b = ball(0.17, m, 0, 0.13, 0, g, 16);
        b.scale.set(1.15, 0.78, 1.0);
        const b2 = ball(0.11, m, 0.10, 0.10, -0.05, g, 14);
        b2.scale.set(1.0, 0.7, 1.1);
        const b3 = ball(0.09, m, -0.12, 0.09, 0.06, g, 14);
        b3.scale.set(1.1, 0.66, 0.9);
        // 白霜
        ball(0.05, new THREE.MeshStandardMaterial({
          color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.9
        }), 0.02, 0.22, 0.02, g, 10);
      } else if (d.k === 'make') {
        // 口红 + 粉饼
        const gold = std(0xc9a24a, 0.42, 0.55);
        cyl(0.045, 0.045, 0.12, 14, gold, -0.10, 0.06, 0, g);
        const lip = cyl(0.036, 0.036, 0.16, 14, std(0xc8324a, 0.42), -0.10, 0.19, 0, g);
        lip.rotation.x = 0.10;
        cyl(0.034, 0.034, 0.012, 14, std(0xe0637a, 0.4), -0.10, 0.272, 0.008, g);
        // 粉饼盒
        cyl(0.13, 0.13, 0.035, 20, std(0x2a2a30, 0.6), 0.11, 0.018, 0, g);
        cyl(0.115, 0.115, 0.012, 20, std(0xf0dcc4, 0.8), 0.11, 0.040, 0, g);
      } else if (d.k === 'tap') {
        // 敲击木琴（四根小木条）
        const barMat = std(0xb08a5a, 0.86);
        for (let i = 0; i < 4; i++) {
          const b = box(0.085, 0.05, 0.30 - i * 0.045, barMat, -0.14 + i * 0.093, 0.06 + i * 0.008, 0, g);
          b.castShadow = true;
        }
        box(0.40, 0.03, 0.34, std(0x5c4630, 0.9), 0, 0.015, 0, g);
      } else if (d.k === 'bubble') {
        // 泡泡纸（一片浅色板 + 一格一格的凸起）
        const board = box(0.40, 0.02, 0.34, std(0xd8e6f2, 0.55), 0, 0.012, 0, g);
        board.castShadow = true;
        for (let j = 0; j < 4; j++) {
          for (let i = 0; i < 5; i++) {
            const b = ball(0.024, std(0xf0f7fc, 0.32, 0.06), -0.16 + i * 0.08, 0.032, -0.12 + j * 0.08, g, 8);
            b.castShadow = false;
          }
        }
      } else {
        // 沙画盘（木盘 + 平沙面 + 已经划过的两道痕）
        cyl(0.21, 0.23, 0.05, 24, std(0x8a6f52, 0.9), 0, 0.025, 0, g);
        cyl(0.185, 0.185, 0.012, 24, std(0xe4d0a8, 0.98), 0, 0.054, 0, g);
        box(0.24, 0.006, 0.018, std(0xc6a97c, 0.95), 0.01, 0.063, -0.05, g).castShadow = false;
        box(0.15, 0.006, 0.018, std(0xc6a97c, 0.95), -0.05, 0.063, 0.04, g).castShadow = false;
      }
    });
  }

  /* ================= 名牌 ================= */
  function buildLabels() {
    // 名牌**平放在桌面上**（原来是立牌，六个立牌把玩具全挡住了）
    TOY_DEF.forEach(function (d) {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.30, 0.18),
        new THREE.MeshStandardMaterial({ map: labelTex(d.name, d.sub), roughness: 0.92 })
      );
      face.rotation.x = -Math.PI / 2;
      face.rotation.z = Math.PI;
      face.position.set(d.x, TABLE.h + 0.012, d.z + 0.30);
      face.receiveShadow = true;
      root.add(face);
    });
  }

  /* ================= 交互 ================= */
  function openToy(k) {
    if (!XD.Relax2D) { if (tip) tip('解压机还没装好…', 2400); return; }
    const names = { crisp: '脆皮捏捏乐', slime: '冰山泥', make: '破坏化妆品', tap: '敲击木琴', bubble: '泡泡纸', sand: '沙画' };
    if (sfx && sfx.blip) sfx.blip();
    // 妈妈说「进入直播间可以把背景音关了」—— 进 2D 前把 lo-fi 和房间底噪都停掉，
    // 只留解压本身的音效，耳朵才清净
    stopAmbient();
    if (tip) tip('（戴上耳机）' + (names[k] || '解压') + ' —— 现在轮到你了', 3200);
    XD.Relax2D.open(k, function () {
      if (tip) tip('回来了 ☕ 想再玩就点桌上的东西', 2600);
      if (sfx && sfx.pop) sfx.pop();
      startAmbient();
    });
  }

  // M61：点一下助眠设备 —— 出声 + 说一句话 + 给个小反馈动画
  const COMFORT_DUR = {
    brush: 5, feather: 4, woodtap: 3, glassrod: 3, honeyspoon: 8, rainstick: 6, bowl: 2.6,
    glass: 3, cloth: 4, waterstick: 5, tape: 3, lipbalm: 6,
    diffuser: 4, starlight: 2.6, lounge: 3
  };
  function useComfort(d) {
    if (sfx && sfx.blip) sfx.blip();
    if (d.clip) playClip(d.clip, d.vol, COMFORT_DUR[d.k] || 4);
    if (tip) tip(d.line, 3200);
    if (d.k === 'rainstick') frames.rainSpin = 1.4;
    if (d.k === 'bowl') frames.bowlRing = 1;
    if (d.k === 'starlight') frames.starBoost = 3.2;
  }

  function openLiveShow() {
    if (!XD.Relax2D || !XD.Relax2D.openLive) { if (tip) tip('直播还没架好…', 2400); return; }
    if (sfx && sfx.blip) sfx.blip();
    stopAmbient();
    if (tip) tip('（镜头打开）大家晚上好 —— 你躺着看就行，弹幕随便发', 3600);
    XD.Relax2D.openLive(function () {
      if (tip) tip('下播啦 ☕ 想再看就点我', 2600);
      startAmbient();
    });
  }

  function registerHots() {
    COMFORT.forEach(function (d) {
      interact.add({
        id: 'relax-comfort-' + d.k, label: d.name,
        box: [d.x, d.y, d.z, d.w, d.h, d.d],
        anchor: [d.x, d.y + 0.36, d.z],
        // M81：小道具（颂钵 / 香薰机）正好坐在软椅的大盒子里，小块优先
        prio: (d.w * d.h * d.d < 0.35) ? 2 : 0,
        when: function () { return !!isRelaxNow(); },
        onClick: function () { useComfort(d); },
        say: d.line
      });
    });
    TOY_DEF.forEach(function (d) {
      interact.add({
        id: 'relax-toy-' + d.k, label: d.name,
        box: [d.x, TABLE.h + 0.14, d.z, 0.46, 0.34, 0.46],
        anchor: [d.x, TABLE.h + 0.36, d.z],
        when: function () { return !!isRelaxNow(); },
        onClick: function () { openToy(d.k); },
        say: function () {
          return d.name + ' · ' + d.sub + '（进去慢慢玩）';
        }
      });
    });
    // 门（回街上）
    interact.add({
      id: 'relax-door', label: '门',
      box: [(DOOR.x0 + DOOR.x1) / 2, 1.2, Z1 - 0.05, 1.2, 2.3, 0.3],
      anchor: [(DOOR.x0 + DOOR.x1) / 2, 2.2, Z1 - 0.1],
      when: function () { return !!isRelaxNow(); },
      onClick: function () { onDoor('street'); },
      say: '掀帘子回鲸鱼街'
    });
    // 小D（主播）
    interact.add({
      id: 'relax-whale', label: '小D（主播）',
      box: [183.60, 0.95, -2.05, 1.5, 1.3, 1.6],
      anchor: [183.60, 1.55, -1.75],
      when: function () { return !!isRelaxNow(); },
      onClick: function () { openLiveShow(); },
      say: function () {
        const lines = [
          '点我 —— 我开播给你看，你当观众就好',
          '今晚的节目我自己排好了，你躺着听',
          '想说话就发弹幕，我挑着回你',
          '慢慢来，不着急。困了就直接睡，我自己播'
        ];
        const h = window.__relaxWhaleLine || 0;
        window.__relaxWhaleLine = (h + 1) % lines.length;
        return lines[h];
      }
    });
  }

  /* ================= 底噪 ================= */
  // 一层是项目里现成的 lo-fi（assets/music/lofi1.ogg，本来就是给放松/助眠用的），
  // 一层是我现场合成的"房间棕噪声"（Web Audio）—— 两样叠起来才像深夜直播间。
  let bgmEl = null;
  function startAmbient() {
    if (ambientOn) return;
    const quiet = !!(XD.SFX && XD.SFX.isMuted && XD.SFX.isMuted());
    // ① 背景音乐
    if (!bgmEl) {
      try {
        bgmEl = new Audio('assets/music/lofi1.ogg');
        bgmEl.loop = true;
        bgmEl.volume = 0.06;
        bgmEl.preload = 'none';
      } catch (e) { bgmEl = null; }
    }
    if (bgmEl && !quiet) {
      try {
        const p = bgmEl.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    // ② 合成的房间底噪
    if (!quiet) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          if (!ambient) {
            const ac = new AC();
            const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
            const d = buf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < d.length; i++) {
              // 一点点棕噪声（比白噪更"房间"）
              last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
              d[i] = last;
            }
            const src = ac.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            const lp = ac.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 420;
            const g = ac.createGain();
            g.gain.value = 0.035;
            src.connect(lp); lp.connect(g); g.connect(ac.destination);
            src.start();
            ambient = { ac: ac, src: src, gain: g };
          }
          if (ambient.ac.state === 'suspended') ambient.ac.resume();
          ambient.gain.gain.value = 0.035;
        }
      } catch (e) { /* 无所谓 */ }
    }
    ambientOn = true;
  }
  function stopAmbient() {
    if (!ambientOn) return;
    if (bgmEl) { try { bgmEl.pause(); } catch (e) {} }
    if (ambient) { try { ambient.gain.gain.value = 0; } catch (e) {} }
    ambientOn = false;
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!root || !root.visible) return;
    t += dt;
    // 小D 轻轻浮动 + 呼吸
    if (whale) {
      whale.g.position.y = whale.baseY + Math.sin(t * 1.1) * 0.035;
      whale.g.rotation.z = Math.sin(t * 0.7) * 0.03;
      const br = 1 + Math.sin(t * 1.6) * 0.012;
      whale.body.scale.set(1.0 * br, 0.92, 1.28);
    }
    // 串灯呼吸
    if (frames.bulbs) {
      for (let i = 0; i < frames.bulbs.length; i++) {
        const k = 0.72 + 0.28 * Math.sin(t * 1.6 + i * 0.7);
        frames.bulbs[i].material.color.setRGB(1 * k, 0.84 * k, 0.62 * k);
      }
    }
    // LIVE 灯慢慢闪
    if (frames.live) {
      const k = 0.45 + 0.55 * (Math.sin(t * 2.4) > 0 ? 1 : 0.25);
      frames.live.mat.color.setRGB(k, 0.18 * k, 0.24 * k);
    }
    // ── M61：助眠设备的小动画 ──
    // 星空灯：星星一闪一闪（点一下会更亮一阵）
    if (frames.stars) {
      frames.starBoost = Math.max(0, (frames.starBoost || 0) - dt);
      const boost = frames.starBoost > 0 ? 1.9 : 1;
      for (let i = 0; i < frames.stars.length; i++) {
        const s = frames.stars[i];
        const k = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.3 + s.ph));
        s.m.material.opacity = Math.min(0.95, k * boost);
      }
    }
    // 香薰机：白雾一圈一圈往上飘
    if (frames.mist) {
      for (let i = 0; i < frames.mist.length; i++) {
        const m = frames.mist[i];
        const ph = ((t * 0.35 + m.ph) % 3) / 3;
        m.m.position.y = 0.92 + ph * 0.70;
        m.m.scale.setScalar(0.7 + ph * 0.9);
        m.m.material.opacity = 0.10 * (1 - ph);
      }
    }
    // 颂钵：敲完还在一圈一圈地震
    if (frames.bowlRing > 0) {
      frames.bowlRing = Math.max(0, frames.bowlRing - dt * 0.55);
      if (frames.bowl) frames.bowl.position.y = 0.70 + Math.sin(t * 38) * 0.004 * frames.bowlRing;
    }
    // 雨棍：倒过来时晃一下
    if (frames.rainSpin > 0) {
      frames.rainSpin = Math.max(0, frames.rainSpin - dt);
      if (frames.rain) frames.rain.rotation.z = Math.sin(t * 9) * 0.10 * frames.rainSpin;
    }
  }

  /* ================= 走动边界 ================= */
  function clamp(x, z) {
    x = Math.max(X0 + 0.40, Math.min(X1 - 0.40, x));
    z = Math.max(Z0 + 0.55, Math.min(Z1 - 0.12, z));
    // 桌子挡人（别穿到桌子上）
    if (z < TABLE.z1 + 0.34 && z > TABLE.z0 - 0.34 &&
        x > TABLE.x0 - 0.34 && x < TABLE.x1 + 0.34) {
      // 推到最近的一边
      const dTop = Math.abs(z - (TABLE.z0 - 0.34));
      const dBot = Math.abs(z - (TABLE.z1 + 0.34));
      const dL = Math.abs(x - (TABLE.x0 - 0.34));
      const dR = Math.abs(x - (TABLE.x1 + 0.34));
      const m = Math.min(dTop, dBot, dL, dR);
      if (m === dBot) z = TABLE.z1 + 0.34;
      else if (m === dTop) z = TABLE.z0 - 0.34;
      else if (m === dL) x = TABLE.x0 - 0.34;
      else x = TABLE.x1 + 0.34;
    }
    // M61：东南角那张软椅也挡人（往最近的一边推，不硬跳）
    if (x > 185.40 && x < 186.76 && z > 1.82 && z < 3.16) {
      if (x - 185.40 < z - 1.82) x = 185.39;
      else z = 1.81;
    }
    return { x: x, z: z };
  }

  function debug() {
    return {
      venue: isRelaxNow(),
      toys: Object.keys(toys).join(','),
      comfort: COMFORT.map(function (d) { return d.k; }).join(','),
      clips: Object.keys(clipRec).join(','),
      lastClip: lastClip,
      game2d: XD.Relax2D ? XD.Relax2D.debug() : null,
      ambient: ambientOn
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene_ = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    camera = o.camera || null;
    isRelaxNow = o.isRelax || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    void getMode; void camera;

    if (!scene_) return fallback();

    root = new THREE.Group();
    root.name = 'relax-m60';
    root.visible = false;
    scene_.add(root);
    frames = { bulbs: [], lights: [] };

    buildRoom();
    buildTable();
    buildWhale();
    buildGear();
    buildComfort();
    buildToys();
    buildLabels();
    registerHots();

    // 馆里的灯（暖）
    const amb = new THREE.AmbientLight(0xffe2c0, 0.34);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0x8a9ec0, 0x3a2e2a, 0.22);
    root.add(hemi);
    const key = new THREE.PointLight(0xffd9a8, 1.55, 8.5, 2);
    key.position.set(183.6, 2.85, -0.4);
    key.castShadow = true;
    key.userData.cozy = true;
    root.add(key);
    const fill = new THREE.PointLight(0xa8c0e0, 0.55, 7, 2);
    fill.position.set(185.6, 2.2, 1.4);
    fill.userData.cozy = true;
    root.add(fill);
    (frames.lights || (frames.lights = [])).push(key, fill);

    // 调试：?relax=crisp 进门直接开那台机器
    try {
      const q = new URLSearchParams(location.search);
      const k = q.get('relax');
      if (k && XD.Relax2D) {
        setTimeout(function () { if (isRelaxNow()) openToy(k); }, 1200);
      }
    } catch (e) {}

    root.visible = false;
    return {
      root: root,
      setVisible: function (v) {
        if (root) root.visible = !!v;
        if (v) { t = 0; startAmbient(); preloadClips(); }
        else { stopAmbient(); if (XD.Relax2D && XD.Relax2D.isOpen()) XD.Relax2D.close(); }
      },
      clamp: clamp,
      update: update,
      spawn: { x: 184.85, y: 1.62, z: 2.55, yaw: 0.28 },
      // 出门回到街上鲸捏捏的门板前（M61：门板世界 z = 3.15 + 4.2*0.26 = 4.24）
      spawnOutside: { x: 70.4, y: 1.62, z: 4.24, yaw: Math.PI / 2 },
      openToy: openToy,
      openLive: openLiveShow,
      debug: debug
    };
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      update: function () {},
      spawn: { x: 0, y: 1.62, z: 0, yaw: 0 },
      // 出门回到街上鲸捏捏的门板前（M61：门板世界 z = 3.15 + 4.2*0.26 = 4.24）
      spawnOutside: { x: 70.4, y: 1.62, z: 4.24, yaw: Math.PI / 2 },
      openToy: function () {},
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
