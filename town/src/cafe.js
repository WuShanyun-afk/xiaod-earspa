/* 小D的赛博小家 · M41 咖啡馆（鲸鱼街上的第一间"别人的屋子"）
 *
 * 妈妈 2026-11-14 15:38：「下一步吧，咖啡馆音频下载到D盘」
 * 于是：鲸鱼街西侧的咖啡馆能推门进去了 —— 点单（真扣零花钱）→ 端到窗边坐下。
 * 音频下载到 D:\XiaoDHome\assets\cafe-audio\（3 个 CC0，出处见同目录 CREDITS.md）：
 *   cafe-ambience.mp3  —— 咖啡店底噪（人声/杯碟，轻轻垫着）
 *   espresso-machine.mp3 —— 咖啡机启动/磨豆
 *   cup-clink.mp3 —— 杯子放桌上的"叮"
 *
 * 调试：?venue=cafe 直接站店里；?cafeorder=1 直接点好一杯（截图用）
 */
window.XD = window.XD || {};

XD.Cafe = (function () {
  'use strict';

  /* ================= 尺寸 ================= */
  const X0 = 100.0, X1 = 108.0;        // 8m 宽
  const Z0 = -3.2, Z1 = 3.2;           // 6.4m 深
  const H = 3.4;
  const DOOR = { x0: 106.2, x1: 107.3, z: Z1 };
  const COUNTER = { x0: 100.7, x1: 105.9, z0: -3.05, z1: -2.2, h: 1.05 };
  const TABLES = [
    { x: 101.9, z: 0.35 },
    { x: 104.3, z: 1.35 },
    { x: 106.4, z: -0.55 }
  ];
  const BAR = { x0: 100.8, x1: 105.2, z: 2.86 };

  /* ================= 状态 ================= */
  let root = null, scene = null, interact = null, sfx = null, tip = null;
  let doorPivot = null;        // M58：可开合的玻璃门
  let isCafeNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let walletOf = function () { return 100; };
  let spend = function () { return true; };
  let frames = null;
  let cup = null;              // 手里那杯（柜台上 / 窗边）
  let cupHot = null;           // 「咖啡」那个可点热区，杯子出现才亮
  let ordered = false;
  // M41.1：杯底落在台面上（吧台顶 1.09 / 窗边吧台顶 1.05），不再悬空 1~2cm
  let cupPos = { x: COUNTER.x1 - 1.4, y: COUNTER.h + 0.04, z: COUNTER.z1 - 0.15 };
  let audios = null;
  let t = 0;

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
  function plane(w, h, mat, x, y, z, parent, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* ================= 音效（D 盘上那三个 CC0 录音） ================= */
  function loadAudios() {
    if (audios) return audios;
    audios = {};
    try {
      const amb = new Audio('assets/cafe-audio/cafe-ambience.mp3');
      amb.loop = true; amb.volume = 0.2; amb.preload = 'none';
      const hiss = new Audio('assets/cafe-audio/espresso-machine.mp3');
      hiss.volume = 0.45; hiss.preload = 'none';
      const clink = new Audio('assets/cafe-audio/cup-clink.mp3');
      clink.volume = 0.6; clink.preload = 'none';
      audios = { amb: amb, hiss: hiss, clink: clink };
    } catch (e) { audios = null; }
    return audios;
  }
  function muted() {
    return !!(XD.SFX && XD.SFX.isMuted && XD.SFX.isMuted());
  }
  function playHiss() {
    const a = loadAudios();
    if (!a || muted()) return;
    try { a.hiss.currentTime = 0; a.hiss.play(); } catch (e) {}
  }
  function playClink() {
    const a = loadAudios();
    if (!a || muted()) return;
    try { a.clink.currentTime = 0; a.clink.play(); } catch (e) {}
  }
  let ambTimer = null;
  function ambientOn() {
    if (!isCafeNow()) return;                 // 已经在街上了就别再响
    const a = loadAudios();
    if (!a || muted()) return;
    try {
      a.amb.volume = 0.2;
      const p = a.amb.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function ambientOff() {
    if (ambTimer) { clearTimeout(ambTimer); ambTimer = null; }
    if (!audios) return;
    try { audios.amb.pause(); } catch (e) {}
  }

  /* ================= 建模 ================= */
  const woodTex = function () {
    return canvasTex(256, 256, function (g, W, Hh) {
      g.fillStyle = '#b2835a';
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = i % 2 ? 'rgba(140,100,66,.25)' : 'rgba(255,236,210,.16)';
        g.fillRect(0, i * 37, W, 37);
      }
      g.strokeStyle = 'rgba(90,62,40,.35)';
      g.lineWidth = 2;
      for (let i = 0; i <= 7; i++) {
        g.beginPath(); g.moveTo(0, i * 37); g.lineTo(W, i * 37); g.stroke();
      }
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = 'rgba(110,80,52,.18)';
        g.beginPath();
        const y = Math.random() * Hh;
        g.moveTo(Math.random() * W, y); g.lineTo(Math.random() * W, y + 2); g.stroke();
      }
    });
  };

  function buildRoom() {
    const wood = woodTex();
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(3, 2.6);
    const floor = box(X1 - X0, 0.08, Z1 - Z0,
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.86 }),
      (X0 + X1) / 2, 0.04, (Z0 + Z1) / 2);
    floor.receiveShadow = true;

    const wallMat = std(0xe9ddc8, 0.94);
    const trim = std(0x7d5b3f, 0.9);
    // 北墙（吧台后面）+ 腰线
    box(X1 - X0, H, 0.12, wallMat, (X0 + X1) / 2, H / 2, Z0 - 0.06);
    box(X1 - X0, 0.18, 0.16, trim, (X0 + X1) / 2, 1.0, Z0 + 0.02);
    // 东西墙
    box(0.12, H, Z1 - Z0, wallMat, X0 - 0.06, H / 2, (Z0 + Z1) / 2);
    box(0.12, H, Z1 - Z0, wallMat, X1 + 0.06, H / 2, (Z0 + Z1) / 2);
    // 天花板
    box(X1 - X0, 0.1, Z1 - Z0, std(0xf3ead8, 0.95), (X0 + X1) / 2, H, (Z0 + Z1) / 2);
    // 南墙（窗 + 门）
    const z = Z1;
    // 窗下墙
    box(5.4, 0.9, 0.12, wallMat, X0 + 0.3 + 2.7, 0.45, z + 0.06);
    // 窗上墙
    box(5.4, 0.7, 0.12, wallMat, X0 + 0.3 + 2.7, 2.95, z + 0.06);
    // 窗两侧小段
    box(0.3, 2.6, 0.12, wallMat, X0 + 0.15, 1.3, z + 0.06);
    box(0.7, 2.6, 0.12, wallMat, X0 + 5.8 + 0.35, 1.3, z + 0.06);
    // 门（回到街上）：门框 + 玻璃门
    // M58：门框原来是"一整块实心板"，把门洞整个堵死了（玩家走不到门边，一直没露馅）。
    // 妈妈推门进出时就露出来了 —— 改成"口"字形：两根门柱 + 上梁 + 门洞上方的墙。
    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0x9fc0cf), transparent: true, opacity: 0.42, roughness: 0.12, metalness: 0.1
    });
    const dCx = (DOOR.x0 + DOOR.x1) / 2;
    box(0.26, 2.62, 0.14, trim, DOOR.x0 - 0.13, 1.31, z + 0.02);
    box(0.26, 2.62, 0.14, trim, DOOR.x1 + 0.13, 1.31, z + 0.02);
    box(DOOR.x1 - DOOR.x0, 0.16, 0.14, trim, dCx, 2.54, z + 0.02);
    box(DOOR.x1 - DOOR.x0, 0.78, 0.12, wallMat, dCx, 3.01, z + 0.06);
    // M58：玻璃门挂在一根门轴上（西侧），妈妈进出时能真的推开，不用穿门板
    doorPivot = new THREE.Group();
    doorPivot.position.set(DOOR.x0 + 0.06, 0, z + 0.03);
    root.add(doorPivot);
    const leafW = DOOR.x1 - DOOR.x0 - 0.08;
    box(leafW, 2.30, 0.05, glassMat, leafW / 2, 1.17, 0, doorPivot).castShadow = false;
    // 玻璃门的木边框 —— 转开的时候光靠一块浅蓝玻璃，跟窗外的天一个颜色，看不出是扇门
    const dtrim = std(0x7d5b3f, 0.82);
    box(0.05, 2.30, 0.06, dtrim, 0.025, 1.17, 0, doorPivot);
    box(0.05, 2.30, 0.06, dtrim, leafW - 0.025, 1.17, 0, doorPivot);
    box(leafW, 0.05, 0.06, dtrim, leafW / 2, 2.275, 0, doorPivot);
    box(leafW, 0.06, 0.06, dtrim, leafW / 2, 0.06, 0, doorPivot);
    box(leafW, 0.035, 0.06, dtrim, leafW / 2, 1.02, 0, doorPivot);
    box(0.06, 0.5, 0.06, std(0xc9a86a, 0.4, 0.6), leafW - 0.10, 1.1, 0.05, doorPivot);
    // 大窗玻璃 + 窗框
    box(5.4, 2.0, 0.05, glassMat, X0 + 0.3 + 2.7, 1.9, z + 0.02).castShadow = false;
    const frame = std(0x7d5b3f, 0.85);
    box(5.5, 0.1, 0.12, frame, X0 + 3.0, 0.92, z);
    box(5.5, 0.1, 0.12, frame, X0 + 3.0, 2.88, z);
    [X0 + 3.0, X0 + 5.7].forEach(function (fx) {
      box(0.1, 2.0, 0.12, frame, fx, 1.9, z);
    });
    box(0.08, 2.0, 0.1, frame, X0 + 0.3, 1.9, z);
    // 窗台（可以坐）
    box(5.5, 0.09, 0.34, std(0x8b6b4a, 0.85), X0 + 3.0, 0.86, z - 0.2).castShadow = true;

    // 墙上的灯带 / 画
    const art = canvasTex(256, 160, function (g, W, Hh) {
      g.fillStyle = '#f6efdd';
      g.fillRect(0, 0, W, Hh);
      // 一头朝右的小鲸鱼：身体 + 尾巴 + 肚皮 + 眼睛
      g.fillStyle = '#4d6bfe';
      g.beginPath();
      g.moveTo(78, 92);
      g.bezierCurveTo(96, 52, 168, 44, 206, 74);
      g.bezierCurveTo(222, 88, 214, 108, 190, 116);
      g.bezierCurveTo(150, 128, 100, 120, 78, 92);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(80, 94); g.lineTo(46, 70); g.lineTo(58, 94); g.lineTo(46, 118);
      g.closePath(); g.fill();
      g.fillStyle = '#dce7ff';
      g.beginPath();
      g.moveTo(104, 112);
      g.bezierCurveTo(146, 130, 184, 124, 200, 110);
      g.bezierCurveTo(180, 124, 140, 126, 104, 112);
      g.closePath(); g.fill();
      g.fillStyle = '#1d2a55';
      g.beginPath(); g.arc(186, 80, 5, 0, Math.PI * 2); g.fill();
    });
    const artMat = new THREE.MeshBasicMaterial({ map: art, toneMapped: false });
    const p = plane(1.7, 1.06, artMat, 106.8, 2.3, Z0 + 0.08);
    p.castShadow = false;
    box(1.86, 1.2, 0.05, trim, 106.8, 2.3, Z0 + 0.04).castShadow = false;
  }

  function buildCounter() {
    const wood = std(0x7d5b3f, 0.9);
    const top = std(0xcfc4ae, 0.75);
    const w = COUNTER.x1 - COUNTER.x0, d = COUNTER.z1 - COUNTER.z0;
    const cx = (COUNTER.x0 + COUNTER.x1) / 2, cz = (COUNTER.z0 + COUNTER.z1) / 2;
    box(w, COUNTER.h - 0.06, d, wood, cx, (COUNTER.h - 0.06) / 2, cz);
    box(w + 0.1, 0.08, d + 0.1, top, cx, COUNTER.h, cz);
    // 前脸的竖木条
    for (let i = 0; i < 10; i++) {
      box(0.05, COUNTER.h - 0.12, 0.04, std(0x6b4b32, 0.9), COUNTER.x0 + 0.25 + i * 0.55, COUNTER.h / 2, COUNTER.z1 + 0.02);
    }
    // 咖啡机
    const machine = new THREE.Group();
    machine.position.set(101.9, COUNTER.h + 0.04, cz);
    root.add(machine);
    box(0.8, 0.5, 0.5, std(0x3b3f45, 0.5, 0.5), 0, 0.25, 0, machine);
    box(0.84, 0.06, 0.54, std(0x9aa4a0, 0.4, 0.6), 0, 0.52, 0, machine);
    cyl(0.12, 0.12, 0.12, 12, std(0x2f3338, 0.6, 0.5), 0.2, 0.58, 0, machine);
    cyl(0.03, 0.03, 0.2, 8, std(0x9aa4a0, 0.4, 0.7), -0.26, 0.43, 0.2, machine);
    box(0.05, 0.05, 0.16, std(0x9aa4a0, 0.4, 0.7), -0.26, 0.34, 0.26, machine);
    box(0.6, 0.06, 0.06, std(0x1f2327, 0.7), 0, 0.12, 0.27, machine);
    // 蒸汽（点机器才冒）
    const steam = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xdfe9ee, transparent: true, opacity: 0, depthWrite: false
      }));
      s.scale.set(0.16, 0.16, 1);
      s.position.set(0.2 + (i % 3) * 0.04, 0.62 + (i % 4) * 0.1, 0.06);
      machine.add(s);
      steam.push({ s: s, ph: i * 0.7 });
    }
    // 糕点柜（玻璃罩着，蛋糕能看见）
    const caseGlass = new THREE.MeshStandardMaterial({
      color: col(0xdfeef0), transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.1
    });
    box(1.3, 0.55, 0.55, caseGlass, 103.6, COUNTER.h + 0.32, cz).castShadow = false;
    box(1.34, 0.05, 0.59, std(0x9aa4a0, 0.4, 0.5), 103.6, COUNTER.h + 0.6, cz);
    box(1.34, 0.05, 0.59, std(0x9aa4a0, 0.4, 0.5), 103.6, COUNTER.h + 0.04, cz);
    const cakeCols = [0xf3c98a, 0xe8a0a0, 0xf6e6c8, 0xc9a26a];
    for (let i = 0; i < 6; i++) {
      const cake = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std(cakeCols[i % 4], 0.8));
      cake.scale.set(1, 0.6, 1);
      cake.position.set(103.15 + (i % 3) * 0.28, COUNTER.h + 0.22, cz + (i < 3 ? -0.12 : 0.12));
      root.add(cake);
    }
    // 收银机
    box(0.5, 0.3, 0.4, std(0x3b3f45, 0.6, 0.3), 105.2, COUNTER.h + 0.18, cz);
    box(0.34, 0.2, 0.03, std(0x6fd6a0, 0.5), 105.2, COUNTER.h + 0.22, cz + 0.21).castShadow = false;
    // 杯子架（墙上两排）
    // M41.1：原来两排搁板横在「今日咖啡」黑板正中间（板 x 100.75~102.25、
    // 搁板 x 101.9~104.5），木板/白杯直接把黑板切成两半。现在整排往右挪到
    // x 102.9~105.5，黑板和搁板之间留 0.62m、搁板和鲸鱼画之间留 0.37m。
    const shelfMat = std(0x7d5b3f, 0.9);
    [2.05, 2.42].forEach(function (yy) {
      box(2.6, 0.06, 0.26, shelfMat, 104.2, yy, Z0 + 0.2);
      for (let i = 0; i < 7; i++) {
        // 杯底 = 搁板顶面（yy + 0.03）：高 0.11 的杯子中心放 yy + 0.085，不悬空也不陷进去
        cyl(0.06, 0.05, 0.11, 8, std(0xf6f0e2, 0.5), 103.1 + i * 0.36, yy + 0.085, Z0 + 0.2).castShadow = false;
      }
    });
    // 菜单黑板（挂在北墙上）
    const menuTex = canvasTex(512, 320, function (g, W, Hh) {
      g.fillStyle = '#33382f';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9b98f'; g.lineWidth = 10;
      g.strokeRect(10, 10, W - 20, Hh - 20);
      g.fillStyle = '#f6efd8';
      g.textAlign = 'center';
      g.font = 'bold 44px "Microsoft YaHei", sans-serif';
      g.fillText('今日咖啡', W / 2, 78);
      g.font = '30px "Microsoft YaHei", sans-serif';
      g.textAlign = 'left';
      const rows = [['桂花拿铁', '¥12'], ['美式', '¥10'], ['热可可', '¥13'], ['芝士蛋糕', '¥15']];
      rows.forEach(function (r, i) {
        g.fillStyle = '#e9e2cf';
        g.fillText(r[0], 60, 136 + i * 42);
        g.fillStyle = '#ffd76a';
        g.fillText(r[1], W - 120, 136 + i * 42);
      });
      g.fillStyle = '#c9b98f';
      g.textAlign = 'center';
      g.font = '24px "Microsoft YaHei", sans-serif';
      g.fillText('小D的咖啡馆 · 15 块能吃好', W / 2, Hh - 28);
    });
    const menuMat = new THREE.MeshBasicMaterial({ map: menuTex, toneMapped: false });
    const mp = plane(1.5, 0.94, menuMat, 101.5, 2.35, Z0 + 0.09);
    mp.castShadow = false;
    box(1.64, 1.08, 0.05, shelfMat, 101.5, 2.35, Z0 + 0.05).castShadow = false;
    return { steam: steam };
  }

  function buildSeats() {
    const wood = std(0x8b6b4a, 0.9);
    const metal = std(0x40454d, 0.55, 0.4);
    TABLES.forEach(function (tb) {
      cyl(0.5, 0.5, 0.05, 18, std(0xc9a26a, 0.8), tb.x, 0.73, tb.z);
      cyl(0.04, 0.04, 0.7, 8, metal, tb.x, 0.37, tb.z);
      cyl(0.3, 0.34, 0.04, 14, metal, tb.x, 0.02, tb.z);
      // 两把椅子
      [0, Math.PI].forEach(function (a) {
        const cx = tb.x + Math.sin(a) * 0.95;
        const cz = tb.z + Math.cos(a) * 0.95;
        const c = new THREE.Group();
        c.position.set(cx, 0, cz);
        c.rotation.y = a + Math.PI;
        root.add(c);
        box(0.42, 0.05, 0.42, wood, 0, 0.45, 0, c);
        box(0.42, 0.46, 0.05, wood, 0, 0.68, -0.19, c);
        [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(function (p) {
          box(0.04, 0.45, 0.04, metal, p[0], 0.22, p[1], c).castShadow = false;
        });
      });
      // 桌上小东西
      cyl(0.05, 0.04, 0.08, 8, std(0xf6f0e2, 0.5), tb.x + 0.12, 0.79, tb.z - 0.08).castShadow = false;
    });
    // 窗边吧台 + 三张高脚凳
    box(BAR.x1 - BAR.x0, 0.06, 0.34, std(0x8b6b4a, 0.85), (BAR.x0 + BAR.x1) / 2, 1.02, BAR.z);
    for (let i = 0; i < 3; i++) {
      // M41.1：原来第 3 张高脚凳 (104.35, 2.31) 正好插进 TABLE[1] 靠窗那把椅子
      // (104.3, 2.3) 的椅面里。整排往东挪到 101.85 / 103.35 / 104.85：
      // 第 3 张离椅面 18cm，吧台西头空出来给窗边那盆绿植，不再挤在一起。
      const sx = BAR.x0 + 1.05 + i * 1.5;
      cyl(0.16, 0.14, 0.06, 12, std(0x9a7a55, 0.85), sx, 0.72, BAR.z - 0.55);
      cyl(0.03, 0.03, 0.7, 8, metal, sx, 0.36, BAR.z - 0.55);
      cyl(0.16, 0.18, 0.03, 12, metal, sx, 0.02, BAR.z - 0.55);
    }
    // 地毯
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), std(0x9c8f7a, 0.98));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(102.1, 0.09, 1.65);
    rug.receiveShadow = true;
    root.add(rug);
  }

  function buildDecor() {
    // 吊灯 3 盏
    for (let i = 0; i < 3; i++) {
      const px = 101.6 + i * 2.4;
      cyl(0.012, 0.012, 1.1, 6, std(0x3b3f45, 0.6), px, H - 0.55, 0.2);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: col(0xf0e2c4), side: THREE.DoubleSide, roughness: 0.7 }));
      shade.position.set(px, H - 1.15, 0.2);
      shade.castShadow = false;
      root.add(shade);
      const bulbMat = new THREE.MeshStandardMaterial({
        color: col(0xfff0c8), emissive: col(0xffc46a), emissiveIntensity: 1.2, roughness: 0.4
      });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bulbMat);
      b.position.set(px, H - 1.22, 0.2);
      root.add(b);
      frames.bulbs.push(bulbMat);
    }
    // 主光
    const amb = new THREE.AmbientLight(0xffe6c8, 0.34);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xffe9d0, 0x6b5a48, 0.2);
    root.add(hemi);
    const warm = new THREE.PointLight(0xffc98a, 1.0, 9, 2);
    warm.position.set(103.4, 2.5, 0.2);
    root.add(warm);
    const warm2 = new THREE.PointLight(0xffd9a0, 0.55, 7, 2);
    warm2.position.set(102.0, 2.2, 2.2);
    root.add(warm2);
    frames.lights = { amb: amb, hemi: hemi, warm: warm, warm2: warm2 };

    // 植物（M41.1：花盆底 = 木地板面 y=0.08；叶子收窄，不再插进窗台）
    function plant(x, z) {
      const pot = std(0xa9604b, 0.92);
      const base = 0.08;                 // 地板顶面
      cyl(0.24, 0.19, 0.4, 10, pot, x, base + 0.2, z);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), std(0x4f7a4a, 0.95));
        leaf.scale.set(1, 1.5, 1);
        leaf.position.set(x + Math.cos(a) * 0.13, base + 0.55 + (i % 2) * 0.14, z + Math.sin(a) * 0.13);
        leaf.castShadow = true;
        root.add(leaf);
      }
    }
    // 窗边这盆原来在 (100.55, 2.85)：叶子 z 最远到 3.18，正好插进窗台（z 2.83~3.17）。
    // 整体往屋里挪 0.43m 到 z=2.42，叶子最远 2.70，离窗台还有 13cm。
    plant(100.55, 2.42);
    // 东北角这盆也离北墙 8cm（原来叶子会蹭进墙里）。
    plant(107.5, -2.82);

    // 书架上几本书
    box(0.8, 1.3, 0.3, std(0x6b4b32, 0.9), 107.5, 0.65, 0.35);
    const bcols = [0x7f95ef, 0xd76b6b, 0xe8b44a, 0x8fbf7a, 0xf6e6c8];
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 6; k++) {
        box(0.06, 0.24, 0.18, std(bcols[(i + k) % bcols.length], 0.9),
          107.25 + k * 0.07, 0.32 + i * 0.34, 0.35).castShadow = false;
      }
    }

    // 睡在椅子上的白猫（M41.1：蜷在椅面正中、四只脚收起来、尾巴绕身侧）
    // 椅子在 buildSeats 里：椅面 0.42×0.05×0.42、中心 y=0.45 → 椅面上表面 y=0.475。
    // 猫组原点就放在椅面中心 (104.3, 0.475, 2.25)，猫身球心 0.108、半径 0.15*0.72
    // → 最低点正好 = 0.475，不陷进椅子；尺寸也收在椅面 0.42 以内，不穿靠背。
    const cat = new THREE.Group();
    cat.position.set(104.3, 0.475, 2.25);
    cat.rotation.y = 0.95;                 // 头朝屋里（吧台这边），坐窗边也能看见脸
    root.add(cat);
    const fur = std(0xf3ecdd, 0.96);       // 白猫：跟木椅拉开颜色
    const furShade = std(0xd9cdb4, 0.96);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), fur);
    body.scale.set(1.12, 0.72, 1.0);
    body.position.y = 0.108;
    body.castShadow = true;
    cat.add(body);
    // 四只脚收在肚子底下（只露一点点爪尖，不垂到椅面外）
    [[0.135, 0.07], [0.135, -0.05], [-0.11, 0.07], [-0.11, -0.06]].forEach(function (p) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), furShade);
      paw.position.set(p[0], 0.03, p[1]);
      paw.scale.set(1, 0.6, 1.3);
      cat.add(paw);
    });
    // 头枕在前爪上
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), fur);
    head.position.set(0.115, 0.115, 0);
    head.castShadow = true;
    cat.add(head);
    [-1, 1].forEach(function (s) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.075, 6), furShade);
      ear.position.set(0.115, 0.205, s * 0.052);
      ear.rotation.x = s * 0.22;
      cat.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), std(0x4a3a30, 0.7));
      eye.position.set(0.203, 0.125, s * 0.037);
      eye.scale.set(0.6, 1, 1);
      cat.add(eye);
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), std(0xd98f8f, 0.8));
    nose.position.set(0.212, 0.105, 0);
    cat.add(nose);
    // 尾巴平放在椅面上、绕着身侧一圈（尾巴最远 z≈2.44，靠背前脸在 2.465）
    const tail = new THREE.Group();
    tail.position.set(-0.02, 0.032, -0.02);
    tail.rotation.y = 0.9;
    cat.add(tail);
    const tailMesh = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.026, 6, 18, Math.PI * 1.55), furShade);
    tailMesh.rotation.x = -Math.PI / 2;
    tailMesh.castShadow = true;
    tail.add(tailMesh);
    frames.cat = cat;

    // 门口地垫
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), std(0x8f7a62, 0.98));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set((DOOR.x0 + DOOR.x1) / 2, 0.03, Z1 - 0.4);
    root.add(mat);
  }

  /* ================= 一杯咖啡 ================= */
  function buildCup() {
    const g = new THREE.Group();
    const white = std(0xfbf6ea, 0.55);
    cyl(0.055, 0.045, 0.11, 12, white, 0, 0.055, 0, g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 12), white);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    g.add(ring);
    // 咖啡液面
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), std(0x5a3a28, 0.4));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.108;
    g.add(coffee);
    // 手柄
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI), white);
    handle.position.set(0.07, 0.07, 0);
    handle.rotation.z = -Math.PI / 2;
    g.add(handle);
    g.position.set(cupPos.x, cupPos.y, cupPos.z);
    g.visible = false;
    root.add(g);
    // 热气
    const steams = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xe8eef2, transparent: true, opacity: 0, depthWrite: false
      }));
      s.scale.set(0.14, 0.14, 1);
      s.position.set(0, 0.16 + i * 0.07, 0);
      g.add(s);
      steams.push({ s: s, ph: i * 1.3 });
    }
    cup = { g: g, steams: steams };
  }

  /* ================= 点单 / 端咖啡 ================= */
  let cool = 0;
  let lastCam = null;

  function showCup(where) {
    if (!cup) return;
    cup.g.visible = true;
    cup.g.position.set(where.x, where.y, where.z);
    // 热区跟着杯子走，杯子在柜台上就点柜台
    if (cupHot) {
      cupHot.enabled = true;
      cupHot.mesh.position.set(where.x, where.y + 0.2, where.z);
      cupHot.anchor.set(where.x, where.y + 0.42, where.z);
      cupHot.box[0] = where.x;
      cupHot.box[1] = where.y + 0.2;
      cupHot.box[2] = where.z;
    }
  }

  function order() {
    if (ordered) {
      // 续一杯：便宜的
      if (walletOf() < 4) { if (tip) tip('零花钱不够啦…', 2600); return false; }
      spend(4);
      playClink();
      showCup(cupPos);
      if (interact) interact.say(new THREE.Vector3(105.2, 1.9, -2.6), '续了一杯，还是热的 ☕', 3.2);
      return true;
    }
    const price = 12;
    if (walletOf() < price) {
      if (tip) tip('钱不太够啦…余额 ¥' + walletOf() + '，桂花拿铁要 ¥12', 3200);
      return false;
    }
    spend(price);
    ordered = true;
    playHiss();
    if (frames) frames.steamLevel = 1.2;
    if (sfx && sfx.beep) sfx.beep();
    if (tip) tip('桂花拿铁 ¥12 · 咖啡机在磨豆…', 2600);
    setTimeout(function () {
      if (!root || !root.visible) return;
      playClink();
      showCup(cupPos);
      if (interact) interact.say(new THREE.Vector3(103.4, 1.5, -2.4), '好嘞——桂花拿铁，端到窗边慢慢喝', 4.2);
    }, 1700);
    return true;
  }

  function carryCup() {
    if (!ordered || !cup || !cup.g.visible) return false;
    cup.g.position.set(103.1, 1.05, 2.78);
    if (cupHot) cupHot.enabled = false;
    playClink();
    if (interact) interact.say(new THREE.Vector3(103.1, 1.45, 2.78), '放在窗边了——坐下慢慢喝 ☕', 3.4);
    return true;
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) {
      if (audios) ambientOff();
      return;
    }
    t += dt;
    lastCam = camPos || null;
    const day = getMode() === 'day';
    if (frames && frames.lights) {
      if (frames.seatGlow > 0) frames.seatGlow = Math.max(0, frames.seatGlow - dt * 0.7);
      frames.lights.amb.intensity = day ? 0.34 : 0.12;
      frames.lights.hemi.intensity = day ? 0.2 : 0.06;
      frames.lights.warm.intensity = day ? 1.0 : 1.05;
      // 点「窗边座位」时窗边那盏灯轻轻亮一下（座位不挪相机，只给个坐下的反馈）
      frames.lights.warm2.intensity = (day ? 0.55 : 0.5) + (frames.seatGlow || 0) * 0.9;
    }
    // 底噪 / 静音（M 键静音时一起停）
    if (audios) {
      if (muted()) {
        audios.amb.volume = 0;
        if (!audios.amb.paused) audios.amb.pause();
      } else {
        audios.amb.volume = 0.2;
        if (audios.amb.paused) { try { audios.amb.play(); } catch (e) {} }
      }
    }
    if (frames && frames.cat) frames.cat.scale.y = 1 + Math.sin(t * 1.5) * 0.02;
    if (frames && frames.steam) {
      frames.steamLevel = Math.max(0, (frames.steamLevel || 0) - dt * 0.5);
      for (let i = 0; i < frames.steam.length; i++) {
        const s = frames.steam[i];
        s.s.material.opacity = 0.45 * frames.steamLevel;
        s.s.position.y = 0.62 + ((t * 0.5 + s.ph) % 1) * 0.5;
      }
    }
    if (cup && cup.g.visible) {
      for (let i = 0; i < cup.steams.length; i++) {
        const s = cup.steams[i];
        s.s.material.opacity = 0.32 * (0.6 + 0.4 * Math.sin(t * 2 + s.ph));
        s.s.position.y = 0.16 + ((t * 0.35 + s.ph) % 1) * 0.22;
      }
    }
    // 走到门口 = 回街上
    if (cool > 0) cool -= dt;
    if (walking && camPos && cool <= 0) {
      const nearDoor = camPos.z > Z1 - 0.55 && camPos.x > DOOR.x0 - 0.3 && camPos.x < DOOR.x1 + 0.3;
      if (nearDoor) {
        cool = 2.5;
        onDoor('street');
      }
    }
  }

  /* ================= 走动边界 ================= */
  function clamp(x, z) {
    x = Math.max(X0 + 0.35, Math.min(X1 - 0.35, x));
    z = Math.max(Z0 + 1.05, Math.min(Z1 - 0.15, z));
    // 窗边吧台：靠窗那一溜别穿过去
    if (z > 2.62 && x < 105.4) z = 2.62;
    // 三张桌子
    for (let i = 0; i < TABLES.length; i++) {
      const tb = TABLES[i];
      const dx = x - tb.x, dz = z - tb.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.72 && d > 0.0001) {
        x = tb.x + dx / d * 0.72;
        z = tb.z + dz / d * 0.72;
      }
    }
    return { x: x, z: z };
  }

  function debug() {
    return {
      ordered: ordered, cup: !!(cup && cup.g.visible), wallet: walletOf(),
      amb: !!(audios && audios.amb && !audios.amb.paused),
      ambReady: audios && audios.amb ? audios.amb.readyState : -1,
      door: doorPivot ? Math.round(doorPivot.rotation.y * 100) / 100 : null
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    isCafeNow = o.isCafe || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    walletOf = o.wallet || function () { return 0; };
    spend = o.spend || function () { return true; };
    if (!scene) return fallback();

    root = new THREE.Group();
    root.name = 'cafe-m41';
    root.visible = false;
    scene.add(root);
    frames = { bulbs: [], lights: null, steam: [], steamLevel: 0, cat: null, seatGlow: 0 };

    buildRoom();
    const c = buildCounter();
    frames.steam = c.steam;
    buildSeats();
    buildDecor();
    buildCup();

    // 可点的东西
    if (interact) {
      const when = function () { return !!isCafeNow(); };
      interact.add({
        id: 'cafe-door', label: '门',
        box: [(DOOR.x0 + DOOR.x1) / 2, 1.2, Z1 - 0.2, 1.4, 2.4, 0.5],
        anchor: [(DOOR.x0 + DOOR.x1) / 2, 2.5, Z1 - 0.3],
        when: when,
        onClick: function () { onDoor('street'); },
        say: '推门回鲸鱼街'
      });
      interact.add({
        id: 'cafe-menu', label: '菜单',
        // 贴住黑板本身（板面 z=-3.11、x 100.75~102.25），不再罩到右边的杯子架上
        box: [101.5, 2.35, Z0 + 0.2, 1.56, 1.02, 0.22],
        anchor: [101.5, 2.98, Z0 + 0.3],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '今日：桂花拿铁 ¥12 · 美式 ¥10 · 热可可 ¥13 · 芝士蛋糕 ¥15'
      });
      interact.add({
        id: 'cafe-seat', label: '窗边座位',
        // 贴着窗边吧台西头第一个高脚凳 + 吧台面（凳子在 x=101.85，吧台顶 y=1.05）
        box: [101.85, 1.02, 2.6, 0.8, 0.72, 0.55],
        anchor: [101.85, 1.3, 2.5],
        when: when,
        onClick: function () {
          if (sfx && sfx.blip) sfx.blip();
          if (frames) frames.seatGlow = 1.0;
        },
        say: '窗边这个位置我留着——坐吧，咖啡马上来'
      });
      interact.add({
        id: 'cafe-cake', label: '蛋糕柜',
        // 玻璃柜在 (103.6, 1.37, -2.625)，热区罩柜子前脸
        box: [103.6, 1.42, -2.3, 1.25, 0.6, 0.5],
        anchor: [103.6, 1.9, -2.05],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '今天有芝士蛋糕 ¥15、可丽露 ¥9、草莓挞 ¥13——挑一块？'
      });
      interact.add({
        id: 'cafe-plant', label: '小绿植',
        // 窗边那盆自己挪到了 (100.55, 2.42)，热区从花盆底一直罩到叶尖（y 0.09~0.95）
        box: [100.55, 0.52, 2.42, 0.62, 0.86, 0.58],
        anchor: [100.55, 1.0, 2.42],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '给你浇一点点水……叶子今天也在晒太阳呢 🌿'
      });
      interact.add({
        id: 'cafe-register', label: '点单',
        box: [105.2, 1.25, -2.65, 0.8, 0.6, 0.7],
        anchor: [105.2, 1.9, -2.5],
        when: when,
        onClick: function () { order(); },
        say: function () {
          if (!ordered) return '点一杯桂花拿铁吧（¥12）';
          return '还想再续一杯吗？（¥4）';
        }
      });
      interact.add({
        id: 'cafe-machine', label: '咖啡机',
        box: [101.9, 1.4, -2.65, 1.0, 0.8, 0.7],
        anchor: [101.9, 1.9, -2.4],
        when: when,
        onClick: function () {
          playHiss();
          if (frames) frames.steamLevel = 1.0;
          if (sfx && sfx.bubble) sfx.bubble();
        },
        say: '咖啡机嗡嗡的——磨豆子呢'
      });
      interact.add({
        id: 'cafe-cat', label: '睡着的猫',
        // 猫蜷在椅面中心 (104.3, y≥0.475, 2.25)，热区只罩猫身（0.49~0.87），
        // 不把椅面也算进去 —— 免得从门口瞄高脚凳时误指到猫。
        box: [104.3, 0.68, 2.28, 0.6, 0.38, 0.5],
        anchor: [104.3, 1.12, 2.28],
        when: when,
        onClick: function () { if (sfx && sfx.cat) sfx.cat(); },
        say: '（呼噜呼噜）……它也来蹭暖气的'
      });
      interact.add({
        id: 'cafe-window', label: '窗',
        box: [102.9, 1.9, Z1 - 0.1, 5.2, 2.0, 0.35],
        anchor: [102.9, 2.4, Z1 - 0.4],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '窗外就是鲸鱼街，能看见鸽子在广场上走'
      });
      cupHot = interact.add({
        id: 'cafe-cup', label: '咖啡',
        // 热区 0.34×0.36×0.34，只罩杯子本身；杯子放到柜台上时不会再和收银机/蛋糕柜的热区叠在一起
        box: [104.5, 1.29, -2.35, 0.34, 0.36, 0.34],
        anchor: [104.5, 1.49, -2.35],
        when: when,
        onClick: function () { carryCup(); },
        enabled: false,
        say: function () { return '端到窗边，坐下慢慢喝 ☕'; }
      });
    }

    // 调试：?cafeorder=1 直接点好一杯
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('cafeorder')) setTimeout(function () { order(); }, 600);
    } catch (e) { /* 无所谓 */ }

    // 浏览器要求"有手势"才出声：在店里点一下就再试着放一次底噪
    document.addEventListener('pointerdown', function () {
      if (isCafeNow()) ambientOn();
    });

    return {
      root: root,
      setVisible: function (v) {
        if (root) root.visible = !!v;
        if (!v) ambientOff();
        else {
          if (ambTimer) clearTimeout(ambTimer);
          ambTimer = setTimeout(function () { ambTimer = null; ambientOn(); }, 300);
        }
      },
      clamp: clamp,
      update: update,
      // M58：妈妈出门/进门时推开那扇玻璃门（0 = 关，负数 = 往街上开）
      setDoor: function (a) {
        if (doorPivot) doorPivot.rotation.y = Math.max(-1.35, Math.min(0, a || 0));
      },
      // M58：咖啡馆自己的磨豆声 / 杯碟声（妈妈点单时要用）
      sound: { hiss: playHiss, clink: playClink },
      spawn: { x: 106.6, y: 1.62, z: 2.45, yaw: 0.52 },
      spawnOutside: { x: 61.9, y: 1.62, z: 4.92, yaw: -Math.PI / 2 },
      order: order,
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
      spawnOutside: { x: 61.9, y: 1.62, z: 4.92, yaw: -Math.PI / 2 },
      order: function () {},
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
