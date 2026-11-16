/* ============================================================================
 * M46：鲸鱼街东侧的「鲸邮局」（POST OFFICE）
 *
 *   - 全天开着（白天柜台有人，晚上留一盏值班灯 + 邮筒还能投）
 *   - 能玩的是一条完整小流程：
 *       ① 买邮票（¥2，真扣零花钱）
 *       ② 拿一张明信片
 *       ③ 在柜台上选收件人（鸭子 / 邮差阿獾 / 麦师傅）
 *       ④ 盖邮戳「咚」一下
 *       ⑤ 投进门口的绿邮筒
 *       ⑥ 等 8 秒「叮」——信箱格亮了
 *       ⑦ 打开信箱，读回信
 *   - 另外能点的：墙上的小镇地图、包裹堆、台秤、阿獾的帽子
 *   - 位置：世界坐标 x = 160 ~ 168、z = -3.2 ~ 3.2
 *     （咖啡馆 100~108、采耳馆 120~128、面包房 140~148，互相隔开）
 *   - 声音：sfx 的 print / cash / bag / ding / blip / pickup + 新加的 thump / paper
 * ==========================================================================*/
window.XD = window.XD || {};
XD.Post = (function () {
  'use strict';

  const X0 = 160.0, X1 = 168.0;
  const Z0 = -3.2, Z1 = 3.2;
  const H = 3.2;

  const DOOR = { x0: 166.2, x1: 167.3, z: Z1 };
  const COUNTER = { x0: 160.9, x1: 166.4, z0: -3.08, z1: -2.52, h: 1.04 };
  const BOXES = { x0: 161.05, x1: 166.25, y0: 1.32, y1: 2.88 };   // 墙上的信箱格
  const PILLAR = { x: 167.2, z: 1.55 };                            // 绿邮筒
  const RACK = { x: 161.5, z: -1.2 };                              // 明信片架
  const CARDSPOT = { x: 162.55, y: 1.09, z: -2.72 };               // 明信片放的位置

  // 三个收件人（柜台上三块木牌）
  const TO = [
    { k: 'duck', name: '小鸭子', x: 163.35, color: 0xf2c14e,
      lines: ['嘎！明信片收到了，我把它贴在冰箱上。周末来河边找我玩呀。',
        '谢谢你的明信片！我今天在广场捡到一颗漂亮的石头，给你留着。',
        '嘎嘎——你的字真好看。下次我想寄一张给你。'] },
    { k: 'badger', name: '邮差阿獾', x: 164.15, color: 0x8a8175,
      lines: ['信我收到了，字写得比镇上大部分人都工整。明天还给你送。',
        '这封我亲手投的，路上没淋湿。你下次可以试试寄包裹，我会轻点搬。',
        '谢谢关心。我腿不累，跑惯了。倒是你，别熬夜。'] },
    { k: 'baker', name: '麦师傅', x: 164.95, color: 0xd99a4e,
      lines: ['收到啦。我把明信片立在柜台上了，客人来了都夸好看。',
        '字写得不错。下次来，鲸鱼包给你留最大的那个。',
        '明信片比信好，能看见画。你画的那只鲸鱼，像我烤的那个。'] }
  ];

  let root = null, scene = null, interact = null, sfx = null, tip = null;
  let isPostNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () {};
  let walletOf = function () { return 0; };
  let spend = function () { return true; };
  let venueOf = function () { return 'home'; };

  let t = 0, cool = 0;
  const fr = {
    amb: null, hemi: null, sun: null, warm: null, bulbMat: null,
    boxLights: [], card: null, cardTex: null, cardCanvas: null, cardCtx: null,
    pillar: null, flag: null, postmanHat: null, replyLight: null, replies: []
  };

  // 状态机
  const st = {
    stamp: 0,          // 手上的邮票
    card: false,       // 手上有没有明信片
    to: null,          // 收件人 key
    stamped: false,    // 盖过邮戳
    posted: false,     // 投出去了
    replyIn: 0,        // 还有几秒回信
    replyReady: false, // 信箱亮了
    read: 0,           // 收到过几封回信
    lastReply: null
  };

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.9 : rough,
      metalness: metal || 0
    });
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function sph(r, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 12, (seg || 12) - 2), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || root).add(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, parent, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    (parent || root).add(m);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }
  function say(x, y, z, text, sec) {
    if (interact && interact.say) interact.say(new THREE.Vector3(x, y, z), text, sec || 3.6);
  }

  /* ================= 房间 ================= */
  function buildRoom() {
    const wallMat = std(0xe8e0cd, 0.95);
    const trim = std(0x2f5d4a, 0.9);        // 邮局绿
    const brass = std(0xc9a86a, 0.35, 0.7);
    const floorTex = canvasTex(512, 512, function (g, W, Hh) {
      g.fillStyle = '#9aa39a';
      g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 2400; i++) {
        const v = 140 + Math.random() * 50;
        g.fillStyle = 'rgba(' + v + ',' + (v + 4) + ',' + (v - 2) + ',.18)';
        g.beginPath();
        g.arc(Math.random() * W, Math.random() * Hh, 1 + Math.random() * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(70,80,70,.30)';
      g.lineWidth = 3;
      for (let k = 0; k <= 4; k++) {
        g.beginPath(); g.moveTo(k * W / 4, 0); g.lineTo(k * W / 4, Hh); g.stroke();
        g.beginPath(); g.moveTo(0, k * Hh / 4); g.lineTo(W, k * Hh / 4); g.stroke();
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 3.2);
    const floor = box(X1 - X0, 0.08, Z1 - Z0,
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }),
      (X0 + X1) / 2, 0.04, (Z0 + Z1) / 2);
    floor.receiveShadow = true;

    // 后墙 + 东西墙 + 天花板
    box(X1 - X0, H, 0.12, wallMat, (X0 + X1) / 2, H / 2, Z0 - 0.06);
    box(0.12, H, Z1 - Z0, wallMat, X0 - 0.06, H / 2, (Z0 + Z1) / 2);
    box(0.12, H, Z1 - Z0, wallMat, X1 + 0.06, H / 2, (Z0 + Z1) / 2);
    box(X1 - X0, 0.1, Z1 - Z0, std(0xf2ecdd, 0.95), (X0 + X1) / 2, H, (Z0 + Z1) / 2);
    // 踢脚线（墨绿）
    box(X1 - X0, 0.16, 0.06, trim, (X0 + X1) / 2, 0.08, Z0 + 0.03);
    box(0.06, 0.16, Z1 - Z0, trim, X0 + 0.03, 0.08, (Z0 + Z1) / 2);
    box(0.06, 0.16, Z1 - Z0, trim, X1 - 0.03, 0.08, (Z0 + Z1) / 2);

    /* 前墙：窗 + 门 */
    const WinX0 = 160.6, WinX1 = 165.6, zf = Z1;
    box(WinX0 - X0, H, 0.12, wallMat, (X0 + WinX0) / 2, H / 2, zf - 0.06);
    box(WinX1 - WinX0, 1.0, 0.12, wallMat, (WinX0 + WinX1) / 2, 0.5, zf - 0.06);
    box(WinX1 - WinX0, 0.45, 0.12, wallMat, (WinX0 + WinX1) / 2, H - 0.22, zf - 0.06);
    box(DOOR.x0 - WinX1, H, 0.12, wallMat, (WinX1 + DOOR.x0) / 2, H / 2, zf - 0.06);
    box(X1 - DOOR.x1, H, 0.12, wallMat, (DOOR.x1 + X1) / 2, H / 2, zf - 0.06);
    box(DOOR.x1 - DOOR.x0, H - 2.45, 0.12, wallMat, (DOOR.x0 + DOOR.x1) / 2, (H + 2.45) / 2, zf - 0.06);

    const glassMat = new THREE.MeshStandardMaterial({
      color: col(0xbfd6dc), transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.08
    });
    box(WinX1 - WinX0, 2.05, 0.05, glassMat, (WinX0 + WinX1) / 2, 2.0, zf - 0.02).castShadow = false;
    const frame = std(0x2f5d4a, 0.85);
    box(WinX1 - WinX0 + 0.12, 0.1, 0.14, frame, (WinX0 + WinX1) / 2, 0.96, zf - 0.02);
    box(WinX1 - WinX0 + 0.12, 0.1, 0.14, frame, (WinX0 + WinX1) / 2, 3.02, zf - 0.02);
    [WinX0, WinX0 + 1.25, WinX0 + 2.5, WinX0 + 3.75, WinX1].forEach(function (fx) {
      box(0.09, 2.05, 0.13, frame, fx, 2.0, zf - 0.02);
    });
    box(WinX1 - WinX0 + 0.3, 0.1, 0.34, std(0xd8d0bc, 0.9), (WinX0 + WinX1) / 2, 0.94, zf - 0.2).castShadow = true;
    // 窗外亮片（M47.1：单面平面从屋里看是背面 → 什么也没有，看到一片夜空的黑）
    const outMat = new THREE.MeshBasicMaterial({ color: 0xdfeaf2, side: THREE.DoubleSide });
    outMat.toneMapped = false;
    plane(WinX1 - WinX0 + 1.2, 3.0, outMat, (WinX0 + WinX1) / 2, 2.3, zf + 0.5).castShadow = false;

    // 门：墨绿门框（四根，别用一整块——不然玻璃后面是实心深绿，看着像一块黑板）
    const dfr = std(0x2f5d4a, 0.85);
    const dz = zf - 0.08;
    box(DOOR.x1 - DOOR.x0 + 0.2, 0.12, 0.14, dfr, (DOOR.x0 + DOOR.x1) / 2, 2.44, dz);   // 上框
    box(DOOR.x1 - DOOR.x0 + 0.2, 0.1, 0.14, dfr, (DOOR.x0 + DOOR.x1) / 2, 0.06, dz);    // 下槛
    box(0.1, 2.4, 0.14, dfr, DOOR.x0 - 0.05, 1.22, dz);                                 // 左框
    box(0.1, 2.4, 0.14, dfr, DOOR.x1 + 0.05, 1.22, dz);                                 // 右框
    box(DOOR.x1 - DOOR.x0 - 0.08, 2.26, 0.05, glassMat, (DOOR.x0 + DOOR.x1) / 2, 1.16, zf - 0.03).castShadow = false;
    box(0.06, 0.46, 0.06, brass, DOOR.x1 - 0.13, 1.1, zf - 0.14);
    const doorSign = canvasTex(256, 110, function (g, W, Hh) {
      g.fillStyle = '#f4efe2';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#2f5d4a'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, Hh - 12);
      g.fillStyle = '#2f5d4a';
      g.font = 'bold 30px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('鲸 邮 局', W / 2, 44);
      g.font = '16px "Microsoft YaHei", sans-serif';
      g.fillStyle = '#6b7a6a';
      g.fillText('寄信 · 包裹 · 信箱 24 小时', W / 2, 76);
      g.fillStyle = '#c9a86a';
      g.fillRect(40, 86, W - 80, 4);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: doorSign, toneMapped: false });
    plane(1.05, 0.45, signMat, (DOOR.x0 + DOOR.x1) / 2, 2.78, zf - 0.14).castShadow = false;

    // 门口地垫
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), std(0x3f5f4e, 0.95));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set((DOOR.x0 + DOOR.x1) / 2, 0.085, zf - 0.45);
    root.add(mat);
  }

  /* ================= 柜台 + 信箱墙 ================= */
  function buildCounter() {
    const wood = std(0x8a6a4a, 0.9);
    const greenTop = std(0x35594a, 0.65);
    const brass = std(0xc9a86a, 0.35, 0.7);
    const w = COUNTER.x1 - COUNTER.x0, d = COUNTER.z1 - COUNTER.z0;
    const cx = (COUNTER.x0 + COUNTER.x1) / 2, cz = (COUNTER.z0 + COUNTER.z1) / 2;

    box(w, COUNTER.h - 0.06, d, wood, cx, (COUNTER.h - 0.06) / 2, cz);
    box(w + 0.1, 0.07, d + 0.12, greenTop, cx, COUNTER.h - 0.02, cz);
    // 柜台前的黄铜挡脚 + 竖格
    box(w + 0.06, 0.1, 0.06, brass, cx, 0.16, cz + d / 2 + 0.02);
    for (let i = 0; i < 6; i++) {
      box(0.03, 0.7, 0.05, brass, COUNTER.x0 + 0.35 + i * 0.95, 0.5, cz + d / 2 + 0.02);
    }
    // 台面上的玻璃挡板（只挡一半，好让玩家看见台面）
    const glass = new THREE.MeshStandardMaterial({
      color: col(0xcfe0e4), transparent: true, opacity: 0.18, roughness: 0.08
    });
    box(w - 0.6, 0.5, 0.02, glass, cx - 0.2, COUNTER.h + 0.3, cz + d / 2 - 0.05).castShadow = false;

    /* 墙上的信箱格（6 列 × 3 行） */
    const bw = (BOXES.x1 - BOXES.x0) / 6;
    const bh = (BOXES.y1 - BOXES.y0) / 3;
    // 底板
    box(BOXES.x1 - BOXES.x0 + 0.12, BOXES.y1 - BOXES.y0 + 0.12, 0.08,
      std(0x2f5d4a, 0.9), (BOXES.x0 + BOXES.x1) / 2, (BOXES.y0 + BOXES.y1) / 2, Z0 + 0.05);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        const bx = BOXES.x0 + bw * (c + 0.5);
        const by = BOXES.y0 + bh * (r + 0.5);
        // 格子（金属门 + 凹进去的一块）
        const doorMat = std(0xd9d3c2, 0.55, 0.35);
        box(bw - 0.06, bh - 0.06, 0.04, doorMat, bx, by, Z0 + 0.11).castShadow = false;
        // 小锁 + 编号牌
        sph(0.018, 6, brass, bx + bw * 0.28, by, Z0 + 0.14);
        const numTex = canvasTex(64, 32, function (g, W, Hh) {
          g.fillStyle = '#efe8d6'; g.fillRect(0, 0, W, Hh);
          g.fillStyle = '#3a4a3a';
          g.font = 'bold 20px monospace';
          g.textAlign = 'center';
          g.fillText(String(r * 6 + c + 1), W / 2, 23);
        });
        const nm = new THREE.MeshBasicMaterial({ map: numTex, toneMapped: false });
        const np = plane(0.09, 0.045, nm, bx - bw * 0.22, by, Z0 + 0.135);
        np.castShadow = false;
        // 有一个格子是"你的"—— 亮一点，回信来了会更亮
        if (r === 1 && c === 3) {
          const mine = new THREE.MeshStandardMaterial({
            color: col(0x1f3b30), roughness: 0.6,
            emissive: col(0xffd27a), emissiveIntensity: 0.05
          });
          box(bw - 0.1, bh - 0.1, 0.03, mine, bx, by, Z0 + 0.13).castShadow = false;
          fr.replyLight = mine;
          fr.replyPos = { x: bx, y: by, z: Z0 + 0.2 };
        }
      }
    }
    // 信箱墙上方的招牌
    const headTex = canvasTex(768, 96, function (g, W, Hh) {
      g.fillStyle = '#2f5d4a'; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#c9a86a'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, Hh - 16);
      g.fillStyle = '#f6ecd0';
      g.font = 'bold 40px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('信 箱 · P.O. BOXES', W / 2, 62);
    });
    const hm = new THREE.MeshBasicMaterial({ map: headTex, toneMapped: false });
    // 挂在信箱墙顶上。天花板板子占 H-0.05 ~ H+0.05（3.15~3.25），
    // 牌子顶必须压在 3.15 以下 —— 以前中心 3.12、高 0.34，顶到 3.29 被天花板切掉一截。
    // 现在：2.2 宽 × 0.26 高、中心 3.01（顶 3.14 / 底 2.88，正好坐在信箱格顶边上）
    plane(2.2, 0.26, hm, (BOXES.x0 + BOXES.x1) / 2, 3.01, Z0 + 0.16).castShadow = false;

    /* 台面上的东西 */
    // ① 邮票小柜（左端）
    box(0.5, 0.18, 0.34, std(0x6b4a30, 0.9), 161.35, COUNTER.h + 0.09, -2.78);
    box(0.44, 0.06, 0.28, std(0xf4efe2, 0.7), 161.35, COUNTER.h + 0.19, -2.78);
    for (let i = 0; i < 3; i++) {
      const stm = canvasTex(64, 48, function (g, W, Hh) {
        g.fillStyle = ['#d76b6b', '#7f95ef', '#e8b44a'][i];
        g.fillRect(0, 0, W, Hh);
        g.strokeStyle = '#fff'; g.lineWidth = 3;
        g.beginPath(); g.arc(W / 2, Hh / 2, 12, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#fff';
        g.font = 'bold 14px sans-serif'; g.textAlign = 'center';
        g.fillText('¥2', W / 2, Hh / 2 + 5);
      });
      const mm = new THREE.MeshBasicMaterial({ map: stm, toneMapped: false });
      const p = plane(0.1, 0.075, mm, 161.2 + i * 0.13, COUNTER.h + 0.225, -2.78);
      p.rotation.x = -Math.PI / 2;
      p.castShadow = false;
    }
    // ② 明信片（放在台面上，拿起来就看不见了）
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 340;
    fr.cardCanvas = cvs;
    fr.cardCtx = cvs.getContext('2d');
    fr.cardTex = new THREE.CanvasTexture(cvs);
    fr.cardTex.anisotropy = 4;
    drawCard(false);
    const cardMat = new THREE.MeshBasicMaterial({ map: fr.cardTex, toneMapped: false, side: THREE.DoubleSide });
    const card = plane(0.62, 0.41, cardMat, CARDSPOT.x, CARDSPOT.y, CARDSPOT.z);
    card.rotation.x = -Math.PI / 2;
    card.rotation.z = 0.06;
    root.add(card);
    fr.card = card;

    // ③ 三个收件人木牌（牌面加大一点，字才看得清）
    TO.forEach(function (to) {
      box(0.26, 0.04, 0.18, std(0x8a6a4a, 0.9), to.x, COUNTER.h + 0.05, -2.78);
      box(0.04, 0.34, 0.04, std(0x6b4a30, 0.9), to.x, COUNTER.h + 0.22, -2.78);
      const tt = canvasTex(160, 120, function (g, W, Hh) {
        g.fillStyle = '#f4efe2'; g.fillRect(0, 0, W, Hh);
        g.strokeStyle = '#2f5d4a'; g.lineWidth = 6; g.strokeRect(4, 4, W - 8, Hh - 8);
        g.fillStyle = '#2f5d4a';
        g.font = 'bold 34px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center';
        g.fillText(to.name, W / 2, Hh / 2 + 12);
      });
      const tm = new THREE.MeshBasicMaterial({ map: tt, toneMapped: false, side: THREE.DoubleSide });
      const p = plane(0.28, 0.21, tm, to.x, COUNTER.h + 0.34, -2.75);
      p.rotation.x = -0.16;
      p.castShadow = false;
    });

    // ④ 邮戳台（右端）：印泥 + 一枚邮戳
    box(0.34, 0.05, 0.26, std(0x4a4a42, 0.8), 165.85, COUNTER.h + 0.03, -2.74);
    const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), std(0x8a2f2f, 0.7));
    ink.position.set(165.75, COUNTER.h + 0.07, -2.74);
    root.add(ink);
    const handle = box(0.05, 0.14, 0.05, std(0x6b4a30, 0.85), 165.98, COUNTER.h + 0.12, -2.74);
    box(0.11, 0.03, 0.11, std(0x3a3a34, 0.7), 165.98, COUNTER.h + 0.055, -2.74);

    // ⑤ 台秤（挪到左边空位：原来在 x 163.6 正好压着「小鸭子」那块木牌）
    //    顺便重做了一遍形状 —— 以前是一块大圆盘平躺在盘子上，像朵蘑菇
    const scX = 161.95, scZ = -2.84;
    box(0.36, 0.10, 0.30, std(0x4a4f57, 0.5, 0.4), scX, COUNTER.h + 0.05, scZ);           // 底座
    box(0.07, 0.20, 0.07, std(0x3f444b, 0.5, 0.4), scX, COUNTER.h + 0.15, scZ - 0.10);   // 立柱（靠后）
    const dial = cyl(0.105, 0.105, 0.028, 18, std(0xf2ead6, 0.6), scX, COUNTER.h + 0.29, scZ - 0.10);
    dial.rotation.x = Math.PI / 2 - 0.28;                                                 // 表盘朝前上方
    const needle = box(0.008, 0.078, 0.012, std(0xc0392b, 0.6), scX + 0.005, COUNTER.h + 0.29, scZ - 0.075);
    needle.rotation.x = 0.3;
    box(0.30, 0.02, 0.24, std(0xc9c4b4, 0.6), scX, COUNTER.h + 0.11, scZ + 0.05);         // 秤盘

    // ⑥ 柜台后面：一排抽屉 / 纸箱
    [162.4, 163.1].forEach(function (bx) {
      box(0.55, 0.4, 0.4, std(0xc0a37a, 0.92), bx, 0.2, -2.95);
    });
  }

  /* ================= 明信片正面 / 背面（canvas） ================= */
  function drawCard(stamped) {
    const g = fr.cardCtx;
    if (!g) return;
    const W = 512, Hh = 340;
    // 纸
    g.fillStyle = '#fdf8ec';
    g.fillRect(0, 0, W, Hh);
    g.strokeStyle = '#d8cbb0';
    g.lineWidth = 4;
    g.strokeRect(8, 8, W - 16, Hh - 16);
    // 右上角邮票框
    g.strokeStyle = '#c9a86a';
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeRect(W - 118, 30, 88, 66);
    g.setLineDash([]);
    g.fillStyle = '#7f95ef';
    g.fillRect(W - 112, 36, 76, 54);
    g.fillStyle = '#fff';
    g.font = 'bold 22px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText('鲸邮', W - 74, 72);
    // 收件人
    g.textAlign = 'left';
    g.fillStyle = '#3a4a3a';
    g.font = 'bold 30px "Microsoft YaHei", sans-serif';
    g.fillText('致：' + (st.to ? (TO.find(function (x) { return x.k === st.to; }) || {}).name : '＿＿＿＿'), 40, 74);
    // 横线（写地址的地方）
    g.strokeStyle = '#cfc4aa';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(40, 120 + i * 44);
      g.lineTo(W - 40, 120 + i * 44);
      g.stroke();
    }
    // 中间竖线（明信片格式）
    g.beginPath();
    g.moveTo(W * 0.56, 96);
    g.lineTo(W * 0.56, Hh - 30);
    g.stroke();
    // 邮戳
    if (stamped) {
      g.save();
      g.translate(W - 150, Hh - 96);
      g.rotate(-0.22);
      g.strokeStyle = 'rgba(150,45,45,.75)';
      g.lineWidth = 5;
      g.beginPath(); g.arc(0, 0, 64, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(150,45,45,.8)';
      g.font = 'bold 26px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('鲸鱼小镇', 0, -10);
      g.font = '18px monospace';
      g.fillText('11.14', 0, 18);
      g.restore();
    }
    fr.cardTex.needsUpdate = true;
  }

  /* ================= 门口的绿邮筒 ================= */
  function buildPillar() {
    const g = new THREE.Group();
    g.position.set(PILLAR.x, 0, PILLAR.z);
    root.add(g);
    fr.pillar = g;
    const green = std(0x2f5d4a, 0.7);
    const darkGreen = std(0x244a3b, 0.75);
    const brass = std(0xc9a86a, 0.35, 0.7);
    // 底座 + 筒身 + 圆顶
    cyl(0.3, 0.32, 0.08, 18, darkGreen, 0, 0.04, 0, g);
    cyl(0.27, 0.27, 1.05, 18, green, 0, 0.6, 0, g);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), green);
    dome.position.y = 1.12;
    dome.castShadow = true;
    g.add(dome);
    // 筒身加两道铜箍 + 背面的小徽章
    cyl(0.285, 0.285, 0.03, 18, brass, 0, 0.3, 0, g);
    cyl(0.285, 0.285, 0.03, 18, brass, 0, 0.98, 0, g);
    // 投信口
    box(0.38, 0.06, 0.06, std(0x141a16, 0.9), 0, 0.92, 0.245, g);
    box(0.42, 0.02, 0.07, brass, 0, 0.965, 0.245, g);
    // 取信门 + 铜锁
    box(0.34, 0.36, 0.02, darkGreen, 0, 0.55, 0.265, g);
    sph(0.03, 8, brass, 0, 0.55, 0.285, g);
    // 牌子
    const pt = canvasTex(256, 128, function (g2, W, Hh) {
      g2.fillStyle = '#f4efe2'; g2.fillRect(0, 0, W, Hh);
      g2.strokeStyle = '#2f5d4a'; g2.lineWidth = 6; g2.strokeRect(5, 5, W - 10, Hh - 10);
      g2.fillStyle = '#2f5d4a';
      g2.font = 'bold 34px "Microsoft YaHei", sans-serif';
      g2.textAlign = 'center';
      g2.fillText('投 递', W / 2, 56);
      g2.font = '18px "Microsoft YaHei", sans-serif';
      g2.fillStyle = '#6b7a6a';
      g2.fillText('POST', W / 2, 92);
    });
    const pm = new THREE.MeshBasicMaterial({ map: pt, toneMapped: false, side: THREE.DoubleSide });
    const p = plane(0.3, 0.15, pm, 0, 0.75, 0.272, g);
    p.castShadow = false;
    // 顶上小旗（投递时晃一下）—— 短一点，别像根引线
    const flagPole = cyl(0.01, 0.01, 0.16, 6, brass, 0.14, 1.3, 0, g);
    const flag = box(0.1, 0.06, 0.01, std(0xc9a86a, 0.6, 0.3), 0.19, 1.36, 0, g);
    fr.flag = flag;
    // 背面也放一块小牌子（从柜台那边看也有东西）
    const bpt = canvasTex(128, 64, function (g2, W, Hh) {
      g2.fillStyle = '#f4efe2'; g2.fillRect(0, 0, W, Hh);
      g2.strokeStyle = '#2f5d4a'; g2.lineWidth = 5; g2.strokeRect(3, 3, W - 6, Hh - 6);
      g2.fillStyle = '#2f5d4a';
      g2.font = 'bold 26px "Microsoft YaHei", sans-serif';
      g2.textAlign = 'center';
      g2.fillText('鲸邮局', W / 2, 42);
    });
    const bpm = new THREE.MeshBasicMaterial({ map: bpt, toneMapped: false, side: THREE.DoubleSide });
    const bp = plane(0.24, 0.12, bpm, 0, 0.78, -0.272, g);
    bp.rotation.y = Math.PI;
    bp.castShadow = false;
  }

  /* ================= 明信片架 / 地图 / 包裹堆 ================= */
  function buildProps() {
    const wood = std(0x8a6a4a, 0.9);
    const brass = std(0xc9a86a, 0.35, 0.7);

    // ① 西墙上的明信片展示板（原来那个旋转架做得像三根杆子插纸，换掉）
    const pbx = X0 + 0.07;
    box(0.06, 1.26, 1.06, std(0x35594a, 0.9), pbx, 1.55, RACK.z);
    box(0.05, 1.34, 0.06, wood, pbx + 0.01, 1.55, RACK.z - 0.55);
    box(0.05, 1.34, 0.06, wood, pbx + 0.01, 1.55, RACK.z + 0.55);
    box(0.05, 0.06, 1.16, wood, pbx + 0.01, 2.2, RACK.z);
    box(0.05, 0.06, 1.16, wood, pbx + 0.01, 0.9, RACK.z);
    const cardCols = ['#f2d7a0', '#cfe0ea', '#f0c0b0', '#d8e6c0', '#e8d8f0', '#f6e6c8'];
    for (let row = 0; row < 3; row++) {
      for (let c = 0; c < 3; c++) {
        const cz = RACK.z - 0.33 + c * 0.33;
        const cy = 1.16 + row * 0.32;
        const ct = canvasTex(96, 64, function (g2, W, Hh) {
          g2.fillStyle = cardCols[(row * 3 + c) % 6];
          g2.fillRect(0, 0, W, Hh);
          g2.strokeStyle = 'rgba(90,70,50,.45)'; g2.lineWidth = 3;
          g2.strokeRect(4, 4, W - 8, Hh - 8);
          g2.fillStyle = 'rgba(90,70,50,.5)';
          for (let k = 0; k < 3; k++) {
            g2.fillRect(12, 22 + k * 11, W - 24 - k * 12, 2);
          }
        });
        const cm = new THREE.MeshBasicMaterial({ map: ct, toneMapped: false, side: THREE.DoubleSide });
        const cp = plane(0.26, 0.17, cm, pbx + 0.06, cy, cz, root, Math.PI / 2);
        cp.castShadow = false;
      }
    }

    // ② 墙上的小镇地图（画板）
    const mapTex = canvasTex(512, 384, function (g, W, Hh) {
      g.fillStyle = '#f6efdc'; g.fillRect(0, 0, W, Hh);
      // 底图格
      g.strokeStyle = 'rgba(120,140,120,.25)'; g.lineWidth = 1;
      for (let x = 0; x <= W; x += 32) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke();
      }
      for (let y = 0; y <= Hh; y += 32) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      // 主街
      g.strokeStyle = '#b8a98a'; g.lineWidth = 26;
      g.beginPath(); g.moveTo(256, 20); g.lineTo(256, Hh - 20); g.stroke();
      g.strokeStyle = '#efe6cd'; g.lineWidth = 18;
      g.beginPath(); g.moveTo(256, 20); g.lineTo(256, Hh - 20); g.stroke();
      // 店（小方块 + 名字）
      const spots = [
        ['咖啡馆', 150, 120], ['采耳馆', 150, 210], ['便利店', 360, 90],
        ['面包房', 360, 170], ['邮局', 360, 250], ['水上乐园', 256, 340]
      ];
      spots.forEach(function (s) {
        g.fillStyle = '#c9a86a';
        g.fillRect(s[1] - 26, s[2] - 12, 52, 24);
        g.fillStyle = '#3a3a30';
        g.font = 'bold 15px "Microsoft YaHei", sans-serif';
        g.textAlign = 'center';
        g.fillText(s[0], s[1], s[2] + 5);
      });
      // 家
      g.fillStyle = '#7f95ef';
      g.beginPath(); g.arc(256, 44, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a3a66';
      g.font = 'bold 15px "Microsoft YaHei", sans-serif';
      g.fillText('小D家', 256, 74);
      // 指北针
      g.strokeStyle = '#3a3a30'; g.lineWidth = 3;
      g.beginPath(); g.arc(60, Hh - 60, 26, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#3a3a30';
      g.font = 'bold 20px sans-serif';
      g.fillText('N', 60, Hh - 52);
    });
    const mapMat = new THREE.MeshBasicMaterial({ map: mapTex, toneMapped: false });
    const mp = plane(1.5, 1.12, mapMat, X0 + 0.09, 1.75, 0.2);
    mp.rotation.y = Math.PI / 2;
    mp.castShadow = false;
    box(0.05, 1.24, 1.62, wood, X0 + 0.04, 1.75, 0.2).castShadow = false;

    // ③ 包裹堆（墙角）
    [[166.9, -1.2, 0.5, 0.42, 0.4], [166.9, -0.7, 0.42, 0.34, 0.34], [167.3, -1.15, 0.36, 0.3, 0.5]].forEach(function (p, i) {
      const bx = box(p[2], p[3], p[4], std(i === 1 ? 0xc0a37a : 0xcbb08c, 0.92), p[0], p[3] / 2, p[1]);
      bx.rotation.y = i * 0.4;
      // 胶带
      box(0.03, p[3] + 0.01, p[4] + 0.01, std(0xd8c8a8, 0.9), p[0], p[3] / 2, p[1]);
    });
    // 麻绳卷
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 14), std(0xc9b48a, 0.95));
    rope.position.set(167.1, 0.04, -0.15);
    rope.rotation.x = Math.PI / 2;
    root.add(rope);

    // ④ 阿獾的帽子（挂在西墙）
    const hatG = new THREE.Group();
    hatG.position.set(X0 + 0.12, 1.5, -1.4);
    hatG.rotation.y = Math.PI / 2;
    root.add(hatG);
    cyl(0.13, 0.14, 0.03, 14, std(0x3f5f4e, 0.9), 0, 0, 0, hatG);
    cyl(0.1, 0.11, 0.13, 14, std(0x35594a, 0.9), 0, 0.06, 0, hatG);
    box(0.2, 0.03, 0.02, std(0xc9a86a, 0.6), 0, 0.02, 0.1, hatG);
    fr.postmanHat = hatG;

    // ⑤ 吊灯两盏（墨绿罩子）
    [162.2, 165.0].forEach(function (x) {
      cyl(0.012, 0.012, 0.55, 6, std(0x3a3a30, 0.7), x, 2.95, -2.2);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 16, 1, true), std(0x2f5d4a, 0.85));
      shade.position.set(x, 2.66, -2.2);
      shade.rotation.x = Math.PI;
      shade.material.side = THREE.DoubleSide;
      shade.castShadow = true;
      root.add(shade);
      const b = sph(0.07, 8, fr.bulbMat || std(0xfff2cf, 0.5), x, 2.56, -2.2);
      b.castShadow = false;
    });
  }

  /* ================= 灯 ================= */
  function buildLights() {
    const amb = new THREE.AmbientLight(0xffeedd, 0.26);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xf6f2e6, 0x5a5f52, 0.14);
    root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e2, 0.7);
    sun.position.set(163.0, 4.0, 8.0);
    sun.target.position.set(163.6, 0.8, -1.6);
    root.add(sun);
    root.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -5.2; sc.right = 5.2; sc.top = 5.2; sc.bottom = -5.2;
    sc.near = 0.5; sc.far = 22;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.02;
    const warm = new THREE.PointLight(0xffd9a0, 0.95, 8.5, 2);
    warm.position.set(163.5, 2.5, -2.1);
    root.add(warm);
    fr.amb = amb; fr.hemi = hemi; fr.sun = sun; fr.warm = warm;
  }

  /* ================= 交互 ================= */
  function needStamp() {
    if (!st.stamp) {
      if (tip) tip('先买一张邮票吧（点左边那个小玻璃柜，¥2）', 3200);
      say(161.35, 1.35, -2.7, '邮票呢？先买一张', 2.8);
      return true;
    }
    return false;
  }

  function buyStamp() {
    if (st.stamp) {
      say(161.35, 1.35, -2.7, '手上已经有一张了——先寄出去吧', 3.0);
      return false;
    }
    if (walletOf() < 2) {
      if (tip) tip('零花钱不够啦…邮票 ¥2，余额 ¥' + walletOf(), 3200);
      return false;
    }
    spend(2);
    st.stamp = 1;
    if (sfx && sfx.cash) sfx.cash();
    if (sfx && sfx.paper) sfx.paper();
    if (tip) tip('买了一张邮票 ¥2 · 再拿一张明信片', 3000);
    say(161.35, 1.4, -2.7, '邮票给你——贴右上角就行', 3.2);
    return true;
  }

  function takeCard() {
    if (st.card) {
      say(CARDSPOT.x, 1.4, CARDSPOT.z, '手上已经有一张明信片了', 2.8);
      return false;
    }
    st.card = true;
    // 明信片留在台面上（不藏起来）—— 选收件人 / 盖邮戳时妈妈能看见它一点点被写满
    if (fr.card) fr.card.visible = true;
    drawCard(false);
    if (sfx && sfx.paper) sfx.paper();
    if (tip) tip('拿了一张明信片 · 在柜台上选收件人（三块小木牌）', 3400);
    say(CARDSPOT.x, 1.4, CARDSPOT.z, '空白的，写点什么吧', 2.8);
    return true;
  }

  function pickTo(to) {
    if (!st.card) {
      if (tip) tip('先拿一张明信片（点台面上那张白卡）', 3000);
      return false;
    }
    // M46.1：选收件人不用先有邮票（写好名字再去买邮票也行），邮票只在"投递"那一步扣
    st.to = to.k;
    st.stamped = false;
    drawCard(false);
    if (sfx && sfx.blip) sfx.blip();
    if (tip) tip('写给 ' + to.name + ' · 再去右边盖个邮戳', 3200);
    say(to.x, 1.5, -2.6, '写给「' + to.name + '」', 2.8);
    return true;
  }

  function stampIt() {
    if (!st.card) {
      if (tip) tip('先拿一张明信片', 2600);
      return false;
    }
    if (!st.stdout && !st.to) {
      if (tip) tip('先在柜台上选个收件人（三块小木牌）', 3000);
      return false;
    }
    if (st.stamped) {
      say(165.85, 1.45, -2.7, '已经盖过啦，戳挺清楚的', 2.6);
      return false;
    }
    st.stamped = true;
    drawCard(true);
    if (sfx && sfx.thump) sfx.thump();
    if (tip) tip('「咚」——盖好了 · 投进门口的绿邮筒', 3400);
    say(165.85, 1.5, -2.7, '盖上了，日期也对了', 2.8);
    return true;
  }

  function postCard() {
    if (!st.card) {
      if (tip) tip('手上没有明信片呀', 2600);
      return false;
    }
    if (!st.to) {
      if (tip) tip('还没选收件人——先回柜台选一块小木牌', 3200);
      return false;
    }
    if (!st.stamped) {
      if (tip) tip('还没盖邮戳——先去柜台右边盖一下', 3200);
      return false;
    }
    // M46.1：邮票是邮资，投递时必须有（以前漏了这个检查，不买邮票也能寄）
    if (!st.stamp) {
      if (tip) tip('还没贴邮票——柜台左边买一张（¥2）', 3200);
      say(PILLAR.x - 0.4, 1.5, PILLAR.z, '（信上没邮票，投不进去）', 2.8);
      return false;
    }
    // 投出去
    st.card = false;
    st.stamp = 0;
    st.stamped = false;
    st.posted = true;
    st.replyIn = 8;
    st.lastTo = st.to;
    st.to = null;                             // 这张寄出去了，下一张要重新选人
    if (fr.card) fr.card.visible = false;      // 卡片跟着信一起投进去了
    if (fr.flag) fr.flag.rotation.z = 0.5;
    if (sfx && sfx.mailbox) sfx.mailbox();
    if (tip) tip('投进去了 🎉 等 8 秒，回信会出现在墙上的信箱里', 4200);
    say(PILLAR.x - 0.4, 1.5, PILLAR.z, '（信顺着口子滑下去了）', 3.0);
    return true;
  }

  function readReply() {
    if (!st.replyReady) {
      say(fr.replyPos ? fr.replyPos.x : 163.6, 2.0, Z0 + 0.3,
        st.posted ? '还没到呢，再等等' : '你的信箱是空的——寄一张明信片试试？', 3.0);
      return false;
    }
    const to = TO.find(function (x) { return x.k === st.lastTo; }) || TO[0];
    const line = to.lines[st.read % to.lines.length];
    st.read++;
    st.replyReady = false;
    st.posted = false;
    if (fr.replyLight) fr.replyLight.emissiveIntensity = 0.05;
    if (sfx && sfx.paper) sfx.paper();
    if (tip) tip('收到「' + to.name + '」的回信了 💌', 3600);
    say(fr.replyPos ? fr.replyPos.x : 163.6, 1.6, Z0 + 0.4, to.name + '：' + line, 6.0);
    return true;
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) return;
    t += dt;
    const day = getMode() === 'day';
    if (fr.amb) fr.amb.intensity = day ? 0.26 : 0.1;
    if (fr.hemi) fr.hemi.intensity = day ? 0.14 : 0.05;
    if (fr.sun) fr.sun.intensity = day ? 0.7 : 0.05;
    if (fr.warm) fr.warm.intensity = day ? 0.95 : 1.05;

    // 投出去之后：倒计时 → 回信
    if (st.posted && st.replyIn > 0) {
      st.replyIn -= dt;
      if (st.replyIn <= 0) {
        st.replyIn = 0;
        st.replyReady = true;
        if (fr.replyLight) fr.replyLight.emissiveIntensity = 1.0;
        if (sfx && sfx.ding) sfx.ding();
        if (tip) tip('「叮」——信箱里有回信了 📮 去墙上那个亮着的格子', 4600);
      }
    }
    // 信箱灯的呼吸
    if (fr.replyLight && st.replyReady) {
      fr.replyLight.emissiveIntensity = 0.75 + Math.sin(t * 3) * 0.25;
    }
    // 邮筒小旗回弹
    if (fr.flag && Math.abs(fr.flag.rotation.z) > 0.01) {
      fr.flag.rotation.z *= (1 - dt * 2.2);
    }
    // 明信片在台面上时轻轻动一下（提示这里能点）
    if (fr.card && fr.card.visible) {
      fr.card.position.y = CARDSPOT.y + Math.sin(t * 1.6) * 0.004;
    }

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
  // M76：别的模块（分拣桌）要往屋里加实体时用这个
  const EXTRA_SOLID = [];
  function addBlocker(x0, x1, z0, z1) {
    EXTRA_SOLID.push({ x0: x0, x1: x1, z0: z0, z1: z1 });
  }
  function clamp(x, z) {
    x = Math.max(X0 + 0.4, Math.min(X1 - 0.4, x));
    z = Math.max(Z0 + 1.0, Math.min(Z1 - 0.18, z));
    // M76：分拣桌挡人（原来能直接从桌面走过去）
    for (let i = 0; i < EXTRA_SOLID.length; i++) {
      const r = EXTRA_SOLID[i];
      if (!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
      const d2 = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
      const m = Math.min(d2[0], d2[1], d2[2], d2[3]);
      if (m === d2[0]) x = r.x0 - 0.02;
      else if (m === d2[1]) x = r.x1 + 0.02;
      else if (m === d2[2]) z = r.z0 - 0.02;
      else z = r.z1 + 0.02;
    }
    // 明信片架
    let dx = x - RACK.x, dz = z - RACK.z;
    let d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.55 && d > 0.0001) {
      x = RACK.x + dx / d * 0.55;
      z = RACK.z + dz / d * 0.55;
    }
    // 绿邮筒
    dx = x - PILLAR.x; dz = z - PILLAR.z;
    d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.5 && d > 0.0001) {
      x = PILLAR.x + dx / d * 0.5;
      z = PILLAR.z + dz / d * 0.5;
    }
    return { x: x, z: z };
  }

  /* ================= 调试 ================= */
  function debug() {
    return {
      wallet: walletOf(), stamp: st.stamp, card: st.card, to: st.to,
      stamped: st.stamped, posted: st.posted, replyIn: Math.ceil(st.replyIn),
      replyReady: st.replyReady, read: st.read
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    isPostNow = o.isPost || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    walletOf = o.wallet || function () { return 0; };
    spend = o.spend || function () { return true; };
    venueOf = o.venue || function () { return 'home'; };
    if (!scene) return fallback();

    root = new THREE.Group();
    root.name = 'post-m46';
    root.visible = false;
    scene.add(root);

    buildRoom();
    buildCounter();
    buildPillar();
    buildProps();
    buildLights();
    drawCard(false);

    if (interact) {
      const when = function () { return !!isPostNow(); };

      interact.add({
        id: 'post-door', label: '门',
        box: [(DOOR.x0 + DOOR.x1) / 2, 1.2, Z1 - 0.22, 1.5, 2.4, 0.5],
        anchor: [(DOOR.x0 + DOOR.x1) / 2, 2.5, Z1 - 0.3],
        when: when,
        onClick: function () { onDoor('street'); },
        say: '推门回鲸鱼街'
      });

      // 买邮票
      interact.add({
        id: 'post-stamps', label: '邮票',
        box: [161.35, COUNTER.h + 0.16, -2.78, 0.55, 0.4, 0.42],
        anchor: [161.35, COUNTER.h + 0.55, -2.72],
        when: when,
        onClick: function () { buyStamp(); },
        say: function () { return st.stamp ? '手上已经有一张邮票了' : '邮票 ¥2 一张（鲸鱼图案）'; }
      });

      // 拿明信片
      interact.add({
        id: 'post-card', label: '明信片',
        box: [CARDSPOT.x, CARDSPOT.y + 0.04, CARDSPOT.z, 0.7, 0.2, 0.5],
        anchor: [CARDSPOT.x, CARDSPOT.y + 0.3, CARDSPOT.z],
        when: when,
        onClick: function () { takeCard(); },
        say: function () {
          if (st.card) return '明信片在手上，去选收件人';
          return '一张空白的明信片，要我拿起来吗';
        }
      });

      // 三个收件人
      TO.forEach(function (to, i) {
        interact.add({
          id: 'post-to' + i, label: '写给' + to.name,
          box: [to.x, COUNTER.h + 0.22, -2.78, 0.3, 0.42, 0.3],
          anchor: [to.x, COUNTER.h + 0.6, -2.72],
          when: when,
          onClick: function () { pickTo(to); },
          say: function () {
            return st.to === to.k ? '就写给他了' : '把明信片寄给' + to.name;
          }
        });
      });

      // 盖邮戳
      interact.add({
        id: 'post-stamp', label: '邮戳',
        box: [165.9, COUNTER.h + 0.14, -2.74, 0.42, 0.4, 0.4],
        anchor: [165.9, COUNTER.h + 0.55, -2.68],
        when: when,
        onClick: function () { stampIt(); },
        say: function () {
          if (!st.card) return '邮戳（还没拿明信片）';
          if (!st.to) return '先选收件人再盖章';
          return st.stamped ? '已经盖好了' : '按一下，给明信片盖个戳';
        }
      });

      // 邮筒
      interact.add({
        id: 'post-box', label: '邮筒',
        box: [PILLAR.x, 0.8, PILLAR.z, 0.7, 1.6, 0.7],
        anchor: [PILLAR.x, 1.5, PILLAR.z],
        when: when,
        onClick: function () { postCard(); },
        say: function () {
          if (st.posted && !st.replyReady) return '信已经在路上了，等回信';
          return '绿色邮筒——把信从这里投进去';
        }
      });

      // 信箱（取回信）
      interact.add({
        id: 'post-letters', label: '信箱',
        box: [(BOXES.x0 + BOXES.x1) / 2, 2.0, Z0 + 0.2, 5.4, 1.7, 0.5],
        anchor: [(BOXES.x0 + BOXES.x1) / 2, 2.6, Z0 + 0.35],
        when: when,
        onClick: function () { readReply(); },
        say: function () {
          if (st.replyReady) return '你的信箱亮着——有回信！';
          if (st.posted) return '还没到，再等等';
          return '一格一格的信箱，第 10 号是你的';
        }
      });

      // 小镇地图
      interact.add({
        id: 'post-map', label: '小镇地图',
        box: [X0 + 0.16, 1.75, 0.2, 0.3, 1.2, 1.6],
        anchor: [X0 + 0.4, 2.4, 0.2],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '鲸鱼街：北头是小D家、西边咖啡馆和采耳馆、东边便利店面包房和邮局，南门出去是水上乐园'
      });

      // 台秤
      interact.add({
        id: 'post-scale', label: '台秤',
        box: [161.95, COUNTER.h + 0.18, -2.84, 0.5, 0.36, 0.42],
        anchor: [161.95, COUNTER.h + 0.55, -2.78],
        when: when,
        onClick: function () {
          if (sfx && sfx.pickup) sfx.pickup();
          say(161.95, 1.5, -2.78, '指针晃了晃：「0.00 kg」——空着呢', 3.0);
        },
        say: '寄包裹先在柜台称一下'
      });

      // 包裹堆
      interact.add({
        id: 'post-parcels', label: '包裹',
        box: [167.0, 0.4, -0.9, 0.9, 0.9, 1.2],
        anchor: [167.0, 1.1, -0.9],
        when: when,
        onClick: function () { if (sfx && sfx.bag) sfx.bag(); },
        say: '等着被取走的包裹，有一个上面写着「易碎 · 是杯子」'
      });

      // 阿獾的帽子
      interact.add({
        id: 'post-hat', label: '邮差帽',
        box: [X0 + 0.18, 1.5, -1.4, 0.3, 0.3, 0.3],
        anchor: [X0 + 0.45, 1.75, -1.4],
        when: when,
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: '阿獾的帽子挂在这儿——他出去送信了，一会儿回来'
      });
    }

    // 调试：?post=fresh 直接跳到"有回信可以读"
    try {
      const q = new URLSearchParams(location.search);
      const v = q.get('post');
      if (v === 'card') {
        setTimeout(function () { st.stamp = 1; takeCard(); }, 700);
      } else if (v === 'stamped') {
        setTimeout(function () { st.stamp = 1; takeCard(); pickTo(TO[1]); stampIt(); }, 700);
      } else if (v === 'reply') {
        setTimeout(function () {
          st.read = 0; st.lastTo = 'badger';
          st.replyReady = true;
          if (fr.replyLight) fr.replyLight.emissiveIntensity = 1.0;
        }, 700);
      }
    } catch (e) { /* 无所谓 */ }

    return {
      root: root,
      setVisible: function (v) {
        const on = !!v;
        if (root) root.visible = on;
        if (on) {
          // 进门时台面上总有一张空白明信片（投掉了就换一张新的）
          st.card = false;
          st.stamp = 0;
          st.stamped = false;
          st.to = null;
          if (fr.card) fr.card.visible = true;
          drawCard(false);
        }
      },
      clamp: clamp,
      addBlocker: addBlocker,
      update: update,
      spawn: { x: 166.75, y: 1.62, z: 2.5, yaw: 0.34 },
      spawnOutside: { x: 70.15, y: 1.62, z: 20.95, yaw: -Math.PI / 2 },
      buyStamp: buyStamp,
      takeCard: takeCard,
      pickTo: pickTo,
      stampIt: stampIt,
      post: postCard,
      readReply: readReply,
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
      spawnOutside: { x: 70.15, y: 1.62, z: 20.95, yaw: -Math.PI / 2 },
      buyStamp: function () {}, takeCard: function () {}, pickTo: function () {},
      stampIt: function () {}, post: function () {}, readReply: function () {},
      debug: function () { return null; }
    };
  }

  return { build: build };
})();
