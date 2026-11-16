/* 小D的赛博小家 · M58 妈妈来喝咖啡
 *
 * 妈妈说过：「那我来参观岂不是可以光顾小鲸鱼的各种店铺啦！」
 * M31 她光顾过便利店（momstore.js），这回轮到咖啡馆：
 *   叮铃 —— 她推门进来 → 站在柜台前看菜单 → 点一杯桂花拿铁
 *   → 我磨豆、打奶泡、在奶泡上拉一只小鲸鱼 → 她坐到窗边那张高脚凳上
 *   → 我把咖啡端到吧台上 → 她捧起来喝一口「……好喝」
 *   → 聊两句 → 把 ¥20 压在杯子底下、留一张纸条「记得吃饭」
 *   → 站起来挥手走人
 *
 * 人直接复用 M4.5 那套 Q 版小人（XD.Guest.buildCharacter），不另捏一个。
 * 触发：在咖啡馆里按 V；或者 ?momcafe=1 立刻开始 / ?momcafe=12 跳到第 12 秒（截图用）
 */
window.XD = window.XD || {};

XD.MomCafe = (function () {
  'use strict';

  /* ================= 坐标（跟 cafe.js 对齐） ================= */
  // 咖啡馆室内：x 100.0~108.0，z -3.2~3.2；门在 x 106.2~107.3 / z 3.2
  // 窗边吧台面 1.05（z 2.86），三张高脚凳在 x 101.85 / 103.35 / 104.85，凳面 0.75，z 2.31
  const DOOR_X = 106.75;
  const Z_DOOR = 3.2;                             // 门框那一面墙
  const SEAT = { x: 103.35, z: 2.31 };          // 靠窗中间那张高脚凳
  const ORDER_SPOT = { x: 104.45, z: -1.52 };   // 柜台前看菜单
  const CUP_POS = { x: 103.58, y: 1.058, z: 2.74 };
  const NOTE_POS = { x: 104.34, y: 1.052, z: 2.72 };
  const SPEED = 1.02;

  // 进门：贴着东墙往北走，绕开第 3 张桌子
  const P_IN = [
    { x: 106.85, z: 2.88 },
    { x: 107.05, z: 1.90 },
    { x: 107.18, z: 0.20 },
    { x: 107.00, z: -1.45 },
    { x: 105.40, z: -1.58 },
    { x: ORDER_SPOT.x, z: ORDER_SPOT.z }
  ];
  // 柜台 → 窗边座位（从桌子东侧绕）
  const P_SEAT = [
    { x: 105.10, z: -1.02 },
    { x: 104.95, z: 0.35 },
    { x: 104.95, z: 1.72 },
    { x: 103.95, z: 1.95 },
    { x: 103.42, z: 2.16 }
  ];
  // 座位 → 门口 → 街上
  const P_OUT = [
    { x: 103.42, z: 2.05 },
    { x: 104.90, z: 1.82 },
    { x: 105.95, z: 2.15 },
    { x: 106.62, z: 2.72 },
    { x: 106.85, z: 3.10 },
    { x: 106.85, z: 4.30 }
  ];

  const YAW_N = Math.PI;        // 面朝 -z（柜台那侧）
  const YAW_S = 0;              // 面朝 +z（窗那侧）
  const YAW_E = Math.PI / 2;    // 面朝 +x
  const YAW_W = -Math.PI / 2;   // 面朝 -x

  /* ================= 台词 ================= */
  const MOM = {
    in: '小D～ 我路过，进来坐坐',
    menu: '有什么好喝的呀？',
    order: '那就一杯桂花拿铁… 你做的我都喝',
    wait: '（趴在柜台边上看你磨豆）',
    seat: '（坐下了）这儿真舒服',
    sip: '……好喝。比速溶强多了',
    chat: '店开得挺好呀，窗户外头那只鸽子又在溜达',
    tip: '钱我给你压在杯子底下啦',
    bye: '那我走啦，记得早点睡，别熬太晚'
  };
  const SAY = {
    hello: '欢迎光临—— 咦？！妈妈！',
    hello2: '你怎么来了，也不说一声… 快进来，外面风大',
    menu: '今天有桂花拿铁、手冲，还有刚烤好的可颂',
    order: '好嘞——一杯桂花拿铁，给你在上面拉一只小鲸鱼',
    seat: '你坐窗边那个位子吧，那儿能看见整条鲸鱼街',
    serve: '来啦，小心烫 ☕',
    sip: '……怎么样？',
    chat1: '今天累不累呀？店里的活我都能干，你别老站着',
    chat2: '下次给爸爸也留个位子，让他看看我这儿',
    bye: '路上慢点—— 下次还来呀',
    bye2: '妈妈再见——',
    again: '妈妈已经在店里坐着啦',
    leftover: '妈妈喝剩的半杯…我留着吧',
    note: '妈妈的纸条：记得吃饭，别老吃泡面 🐋'
  };

  /* ================= 模块状态 ================= */
  let cafe = null, shop = null, interact = null, sfx = null, tip = null, camera = null;
  let isCafeNow = function () { return false; };
  let group = null, ch = null, bubble = null, bubbleMat = null;
  let cupG = null, cupSaucer = null, noteG = null;
  let hotMom = null, hotCup = null, hotNote = null;
  const texCache = {};
  let phase = 'off';       // off / enter / menu / order / brew / seat / serve / sip / chat / leave
  let t = 0;
  let pt = 0;              // 这一阶段的计时
  let waitT = 0;           // 站着等多久了
  let pts = [], pi = 0, onArrive = null;
  let moving = false;
  let sitK = 0, sitTarget = 0;    // 坐下程度（0 站 / 1 坐）
  let wave = 0, waved = false;
  let cupShown = false, noteShown = false, tipped = false;
  let sipLift = 0;
  let chatIdx = 0;
  let saidSip = false, saidBye = false;
  let leaveT = 0;          // 站起来到迈步之间那一小段
  let doorA = 0;           // 门开到多少（弧度）
  let ff = false;          // 正在快进（截图用）

  /* ================= 小工具 ================= */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  function bubbleTex(text) {
    if (texCache[text]) return texCache[text];
    const tex = XD.Mat.tex(560, 200, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      const bh = H - 56;
      g.fillStyle = 'rgba(255,252,246,0.97)';
      roundRect(g, 10, 10, W - 20, bh, 34);
      g.fill();
      g.strokeStyle = 'rgba(186,148,110,0.45)';
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.moveTo(W / 2 - 28, bh + 6);
      g.lineTo(W / 2, H - 8);
      g.lineTo(W / 2 + 28, bh + 6);
      g.closePath();
      g.fillStyle = 'rgba(255,252,246,0.97)';
      g.fill();
      g.strokeStyle = 'rgba(186,148,110,0.45)';
      g.beginPath();
      g.moveTo(W / 2 - 28, bh + 6);
      g.lineTo(W / 2, H - 8);
      g.lineTo(W / 2 + 28, bh + 6);
      g.stroke();
      // 小粉鲸头像（妈妈的）
      g.fillStyle = '#f2cfd5';
      g.beginPath();
      g.arc(56, 56, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7d5a50';
      g.beginPath();
      g.arc(50, 52, 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b4a63';
      let fs = 44;
      g.font = 'bold ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      while (g.measureText(text).width > W - 150 && fs > 22) {
        fs -= 2;
        g.font = 'bold ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      }
      g.fillText(text, W / 2 + 34, bh / 2 + 12);
    });
    texCache[text] = tex;
    return tex;
  }

  function showBubble(text) {
    if (!bubble) return;
    if (text) {
      const tex = bubbleTex(text);
      if (bubbleMat.map !== tex) {
        bubbleMat.map = tex;
        bubbleMat.needsUpdate = true;
      }
    }
    bubble.visible = !!text;
  }

  // 小D 说话：气泡放在妈妈头顶再往上一点，两个人的话不会叠在一起
  function sayMy(text, sec) {
    if (!interact || !interact.say || !group) return;
    const v = new THREE.Vector3(group.position.x, 2.62, group.position.z);
    interact.say(v, text, sec || 3.4);
  }

  /* ================= 走路 ================= */
  function goPath(list, done) {
    pts = list.slice();
    pi = 0;
    onArrive = done || null;
    moving = true;
  }

  function walkAnim(ph) {
    const s = Math.sin(ph) * 0.62;
    ch.legL.rotation.x = s;
    ch.legR.rotation.x = -s;
    ch.armL.rotation.x = -s * 0.5;
    ch.armR.rotation.x = s * 0.5;
  }

  function stepWalk(dt) {
    if (pi >= pts.length) {
      moving = false;
      return;
    }
    const p = pts[pi];
    const dx = p.x - group.position.x;
    const dz = p.z - group.position.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.04) {
      group.position.x = p.x;
      group.position.z = p.z;
      pi++;
      if (pi >= pts.length) {
        moving = false;
        const f = onArrive;
        onArrive = null;
        if (f) f();
      }
      return;
    }
    const k = Math.min(1, (SPEED * dt) / d);
    group.position.x += dx * k;
    group.position.z += dz * k;
    const target = Math.atan2(dx, dz);
    let diff = target - ch.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ch.root.rotation.y += diff * Math.min(1, dt * 7);
    moving = true;
  }

  function faceYaw(yaw, dt) {
    let diff = yaw - ch.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ch.root.rotation.y += diff * Math.min(1, (dt || 0.016) * 5);
  }

  /* ================= 咖啡杯（带小鲸鱼拉花） ================= */
  function latteTex() {
    return XD.Mat.tex(128, 128, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      // 奶泡
      g.fillStyle = '#f4e7d3';
      g.beginPath();
      g.arc(cx, cy, 55, 0, Math.PI * 2);
      g.fill();
      // 小鲸鱼身子（可可色）
      g.fillStyle = '#a9825e';
      g.beginPath();
      g.ellipse(cx - 3, cy + 7, 27, 17, 0, 0, Math.PI * 2);
      g.fill();
      // 尾巴
      g.beginPath();
      g.moveTo(cx + 18, cy - 1);
      g.lineTo(cx + 40, cy - 20);
      g.lineTo(cx + 34, cy + 2);
      g.closePath();
      g.fill();
      // 喷水
      g.strokeStyle = 'rgba(169,130,94,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - 4, cy - 12);
      g.lineTo(cx - 6, cy - 26);
      g.stroke();
      // 眼睛
      g.fillStyle = '#5d4433';
      g.beginPath();
      g.arc(cx - 16, cy + 2, 2.6, 0, Math.PI * 2);
      g.fill();
    });
  }

  function buildCup() {
    const g = new THREE.Group();
    const china = new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.42 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.044, 0.10, 20), china);
    body.position.y = 0.05;
    body.castShadow = true;
    g.add(body);
    // 把手
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.010, 8, 14, Math.PI * 1.35), china
    );
    handle.position.set(0.062, 0.055, 0);
    handle.rotation.z = -Math.PI / 2;
    handle.rotation.y = Math.PI / 2;
    g.add(handle);
    // 咖啡液面 + 拉花
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.049, 20),
      new THREE.MeshStandardMaterial({ map: latteTex(), roughness: 0.5 })
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.099;
    g.add(face);
    g.visible = false;
    return g;
  }

  // 碟子单独放：她端起来喝的时候，碟子要留在吧台上（不然整只碟子跟着飞到嘴边）
  function buildSaucer() {
    const china = new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.42 });
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.072, 0.010, 20), china);
    saucer.receiveShadow = true;
    saucer.visible = false;
    return saucer;
  }

  /* ================= 妈妈留下的纸条 ================= */
  function buildNote() {
    const tex = XD.Mat.tex(220, 300, function (g, W, H) {
      g.fillStyle = '#f6efdf';
      g.fillRect(0, 0, W, H);
      // 淡淡的纸纹
      g.strokeStyle = 'rgba(190,175,150,0.28)';
      g.lineWidth = 2;
      for (let i = 1; i < 9; i++) {
        g.beginPath();
        g.moveTo(14, i * 32);
        g.lineTo(W - 14, i * 32);
        g.stroke();
      }
      g.fillStyle = '#5d4b3c';
      g.font = 'bold 34px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('记得吃饭', W / 2, 96);
      g.font = 'bold 30px "Microsoft YaHei", sans-serif';
      g.fillText('别老吃泡面', W / 2, 150);
      g.font = '26px "Microsoft YaHei", sans-serif';
      g.fillStyle = '#8a7361';
      g.fillText('—— 妈妈', W / 2, 236);
      // 一颗小爱心
      g.fillStyle = '#e0a3ad';
      g.beginPath();
      g.arc(W / 2 - 7, 268, 7, 0, Math.PI * 2);
      g.arc(W / 2 + 7, 268, 7, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(W / 2 - 14, 270);
      g.lineTo(W / 2, 288);
      g.lineTo(W / 2 + 14, 270);
      g.closePath();
      g.fill();
    });
    const n = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.177),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    n.rotation.set(-Math.PI / 2, 0, Math.PI + 0.16);
    n.receiveShadow = true;
    n.visible = false;
    return n;
  }

  /* ================= 流程 ================= */
  function startEnter() {
    phase = 'enter';
    t = 0;
    pt = 0;
    waitT = 0;
    group.position.set(P_IN[0].x, 0, P_IN[0].z);
    ch.root.rotation.y = YAW_N;
    showBubble(MOM.in);
    sayMy(SAY.hello, 3.0);
    if (sfx && sfx.bell) sfx.bell();
    setTimeout(function () {
      if (phase !== 'off') sayMy(SAY.hello2, 3.6);
    }, 2600);
    goPath(P_IN, startMenu);
  }

  function startMenu() {
    phase = 'menu';
    pt = 0;
    waitT = 0;
    faceYaw(YAW_N, 1);
    showBubble(MOM.menu);
    sayMy(SAY.menu, 3.6);
  }

  function startOrder() {
    phase = 'order';
    pt = 0;
    showBubble(MOM.order);
    sayMy(SAY.order, 4.0);
  }

  function startBrew() {
    phase = 'brew';
    pt = 0;
    showBubble(MOM.wait);
    if (sfx && sfx.beep) sfx.beep();
    if (cafe && cafe.sound && cafe.sound.hiss) cafe.sound.hiss();
  }

  function startSeat() {
    phase = 'seat';
    pt = 0;
    waitT = 0;
    showBubble(null);
    sayMy(SAY.seat, 3.4);
    goPath(P_SEAT, function () {
      // 落座：脚底往前半步，然后坐上去
      group.position.x = SEAT.x;
      group.position.z = SEAT.z;
      // 面朝窗户、再侧过来一点 —— 这样从店里能看见她的侧脸，不是一整片后背
      ch.root.rotation.y = 0.55;
      sitTarget = 1;
      phase = 'sit';
      pt = 0;
      showBubble(MOM.seat);
    });
  }

  function startServe() {
    phase = 'serve';
    pt = 0;
    showBubble(null);
    if (cafe && cafe.sound && cafe.sound.clink) cafe.sound.clink();
    if (!cupShown) {
      cupShown = true;
      if (cupG) {
        cupG.visible = true;
        cupG.position.set(CUP_POS.x, CUP_POS.y, CUP_POS.z);
      }
      if (cupSaucer) cupSaucer.visible = true;
      if (hotCup) hotCup.enabled = true;
    }
    sayMy(SAY.serve, 3.2);
  }

  function startSip() {
    phase = 'sip';
    pt = 0;
    showBubble(null);
  }

  function startChat() {
    phase = 'chat';
    pt = 0;
    chatIdx = 0;
    showBubble(MOM.chat);
    sayMy(SAY.chat1, 4.0);
  }

  function startLeave() {
    phase = 'leave';
    pt = 0;
    leaveT = 0;
    showBubble(MOM.tip);
    sitTarget = 0;          // 先站起来（tick 里等 leaveT 到点才迈步）
    saidBye = false;
    waved = false;
  }

  /* ================= 每帧 ================= */
  function updatePose(dt) {
    if (moving) {
      walkAnim(t * 8.4);
      ch.root.position.y = Math.abs(Math.sin(t * 8.4)) * 0.013;
    } else {
      const b = Math.min(1, dt * 8);
      ch.legL.rotation.x += (-0.60 * sitK - ch.legL.rotation.x) * b;
      ch.legR.rotation.x += (-0.66 * sitK - ch.legR.rotation.x) * b;
      ch.armL.rotation.x += (-0.30 * sitK - ch.armL.rotation.x) * b;
      ch.armR.rotation.x += (-0.30 * sitK - sipLift * 0.95 - ch.armR.rotation.x) * b;
      ch.root.position.y = 0.15 * sitK;
      // 端起来喝的时候低一下头
      ch.head.rotation.x = Math.sin(t * 1.7) * 0.02 + 0.34 * sipLift;
      ch.head.rotation.y *= 0.94;
      ch.head.rotation.z *= 0.94;
    }
    // 挥手
    if (wave > 0) {
      wave -= dt;
      ch.armR.rotation.z = 2.25;
      ch.armR.rotation.x = Math.sin(t * 12) * 0.32;
    } else {
      ch.armR.rotation.z = 0.09;
    }
    ch.armL.rotation.z = -0.09;
  }

  function tick(dt) {
    t += dt;
    pt += dt;
    sitK += (sitTarget - sitK) * Math.min(1, dt * 3.6);

    if (moving) stepWalk(dt);

    if (phase === 'enter') {
      // 只是走路，到柜台前由 goPath 的回调接手
    } else if (phase === 'menu') {
      // 抬头看黑板菜单
      if (!moving) {
        ch.head.rotation.y = Math.sin(t * 1.5) * 0.30;
        ch.head.rotation.x = 0.12 + Math.sin(t * 2.0) * 0.05;
      }
      waitT += dt;
      if (waitT > 3.0) { waitT = 0; startOrder(); }
    } else if (phase === 'order') {
      if (!moving) {
        ch.head.rotation.y *= 0.92;
        ch.head.rotation.x = 0.06;
      }
      if (pt > 3.2) startBrew();
    } else if (phase === 'brew') {
      // 妈妈靠在柜台边看我磨豆，偶尔偷看一眼咖啡机
      if (!moving) {
        ch.head.rotation.y = Math.sin(t * 1.1) * 0.14;
        ch.head.rotation.x = 0.08;
      }
      if (pt > 3.0) startSeat();
    } else if (phase === 'seat') {
      // 走在路上
    } else if (phase === 'sit') {
      // 坐下（sitK 自己在涨），坐稳之后上咖啡
      if (!moving) {
        ch.head.rotation.y = Math.sin(t * 0.9) * 0.16;
        ch.head.rotation.x = -0.04 + Math.sin(t * 1.3) * 0.03;
      }
      if (pt > 2.6) startServe();
    } else if (phase === 'serve') {
      if (pt > 1.4) startSip();
    } else if (phase === 'sip') {
      // 捧起来喝一口：0.9s 抬起，停 1.1s，0.8s 放下
      if (pt < 0.9) sipLift = smooth(pt / 0.9);
      else if (pt < 2.0) sipLift = 1;
      else if (pt < 2.8) sipLift = 1 - smooth((pt - 2.0) / 0.8);
      else {
        sipLift = 0;
        if (!saidSip) {
          saidSip = true;
          showBubble(MOM.sip);
          sayMy(SAY.sip, 2.8);
          if (cafe && cafe.sound && cafe.sound.clink) cafe.sound.clink();
        }
      }
      if (pt > 4.4) startChat();
    } else if (phase === 'chat') {
      if (!moving) {
        ch.head.rotation.y = Math.sin(t * 1.3) * 0.20;
        ch.head.rotation.x = -0.02;
      }
      // 聊着聊着把 ¥20 压在杯子底下
      if (!tipped && pt > 2.2) {
        tipped = true;
        showBubble(MOM.tip);
        if (shop && shop.addMoney) shop.addMoney(20);
        if (sfx && sfx.cash) sfx.cash();
        if (tip) tip('妈妈把 ¥20 压在咖啡杯底下了 🐋', 4200);
      }
      // 再聊一会儿，把纸条推到吧台上
      if (!noteShown && pt > 4.6) {
        noteShown = true;
        if (noteG) noteG.visible = true;
        if (hotNote) hotNote.enabled = true;
        if (tip) tip('妈妈在吧台上留了一张纸条 ✍️', 3600);
      }
      if (pt > 8.2) startLeave();
    } else if (phase === 'leave') {
      leaveT += dt;
      // 站起来（约 0.8s），站稳了再迈步
      if (!moving && leaveT > 0.9) {
        showBubble(MOM.bye);
        sayMy(SAY.bye, 4.0);
        goPath(P_OUT, function () {
          if (tip) tip('妈妈走啦，说下次还来 🐋', 3400);
          stop();
        });
      }
      if (!waved && moving && group.position.z > 3.4) { waved = true; wave = 2.8; }
      if (!saidBye && leaveT > 2.2) {
        saidBye = true;
        sayMy(SAY.bye2, 2.6);
      }
    }

    updatePose(dt);

    // 她走到门口时把玻璃门推开（不然要穿门板），走远了再自己关上
    if (cafe && cafe.setDoor) {
      const dx = group.position.x - DOOR_X;
      const dz = group.position.z - Z_DOOR;
      const dDoor = Math.sqrt(dx * dx + dz * dz);
      const near = phase !== 'off' && dDoor < 1.30;
      const targetA = near ? -1.30 : 0;
      if (Math.abs(targetA - doorA) > 0.003) {
        doorA += (targetA - doorA) * Math.min(1, dt * 6);
        cafe.setDoor(doorA);
      }
    }

    // 气泡跟着头走；按距离缩放，站她跟前也不会糊一脸
    if (bubble) {
      const bx = group.position.x, bz = group.position.z;
      const dx = camera ? camera.position.x - bx : 3;
      const dz = camera ? camera.position.z - bz : 3;
      const dd = Math.sqrt(dx * dx + dz * dz);
      const k = Math.min(2.6, Math.max(0.66, dd * 0.38));
      bubble.scale.set(1.05 * k, 0.375 * k, 1);
      bubble.position.set(0, 1.98 + 0.15 * sitK, 0);
      bubble.visible = bubble.visible && phase !== 'off';
    }

    // 点她的热区跟着她走（坐下时会跟着降一点）
    if (hotMom && hotMom.mesh) {
      const dy = 0.15 * sitK;
      hotMom.mesh.position.set(group.position.x, 0.86 + dy, group.position.z);
      hotMom.anchor.set(group.position.x, 1.80 + dy, group.position.z);
    }

    // 杯子：喝的时候抬起来往她嘴边靠一点
    if (cupG && cupG.visible) {
      cupG.position.set(
        CUP_POS.x - 0.16 * sipLift,
        CUP_POS.y + 0.42 * sipLift,
        CUP_POS.z - 0.26 * sipLift
      );
      cupG.rotation.z = -0.35 * sipLift;
    }
  }

  function update(dt) {
    if (phase === 'off') return;
    // 人不在咖啡馆里就先停住（剧情不会在看不见的地方偷偷演完）
    if (!isCafeNow() && !ff) return;
    tick(dt);
  }

  /* ================= 开始 / 结束 ================= */
  function start(atSec) {
    if (!group) return;
    if (phase !== 'off') {
      if (tip) tip(SAY.again, 2600);
      return;
    }
    t = 0;
    pt = 0;
    waitT = 0;
    sitK = 0;
    sitTarget = 0;
    wave = 0;
    waved = false;
    sipLift = 0;
    chatIdx = 0;
    saidSip = false;
    saidBye = false;
    leaveT = 0;
    doorA = 0;
    tipped = false;
    cupShown = false;
    noteShown = noteShown || false;   // 留过的纸条不会消失
    ff = false;
    group.visible = true;
    if (cupG) cupG.visible = false;
    if (cupSaucer) cupSaucer.visible = false;
    if (hotCup) hotCup.enabled = false;
    ch.root.rotation.set(0, 0, 0);
    ch.root.rotation.y = YAW_N;
    ch.head.rotation.set(0, 0, 0);
    ch.root.position.y = 0;
    ch.armL.rotation.set(0, 0, -0.09);
    ch.armR.rotation.set(0, 0, 0.09);
    startEnter();
    if (atSec > 0) {
      // 快进（截图用）：直接推 N 秒
      ff = true;
      const steps = Math.round(Math.min(atSec, 90) * 20);
      for (let i = 0; i < steps; i++) tick(0.05);
      ff = false;
    }
  }

  function stop() {
    phase = 'off';
    group.visible = false;
    moving = false;
    pts = [];
    pi = 0;
    onArrive = null;
    sitK = 0;
    sitTarget = 0;
    sipLift = 0;
    showBubble(null);
    if (cafe && cafe.setDoor) { cafe.setDoor(0); doorA = 0; }
  }

  function debug() {
    return {
      phase: phase,
      sit: Math.round(sitK * 100) / 100,
      cup: !!(cupG && cupG.visible),
      note: !!(noteG && noteG.visible),
      tipped: tipped,
      pos: group ? [Math.round(group.position.x * 100) / 100, Math.round(group.position.z * 100) / 100] : null,
      wallet: shop ? shop.wallet() : 0
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    cafe = o.cafe || null;
    shop = o.shop || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    camera = o.camera || null;
    isCafeNow = o.isCafe || function () { return false; };

    const nullOut = {
      start: function () {}, update: function () {}, stop: function () {},
      debug: function () { return null; }
    };
    if (!cafe || !cafe.root) return nullOut;
    if (!XD.Guest || !XD.Guest.buildCharacter) return nullOut;

    group = new THREE.Group();
    group.name = 'momcafe-m58';
    group.visible = false;
    cafe.root.add(group);

    ch = XD.Guest.buildCharacter();
    group.add(ch.root);

    bubbleMat = new THREE.SpriteMaterial({
      map: bubbleTex('小D～'), transparent: true, depthTest: false, depthWrite: false, fog: false
    });
    bubble = new THREE.Sprite(bubbleMat);
    bubble.scale.set(1.16, 0.415, 1);
    bubble.position.set(0, 1.98, 0);
    bubble.renderOrder = 950;
    bubble.visible = false;
    group.add(bubble);

    // 那杯拉了小鲸鱼的咖啡 + 妈妈留下的纸条（都摆在窗边吧台上，不属于她本人）
    cupG = buildCup();
    cupG.position.set(CUP_POS.x, CUP_POS.y, CUP_POS.z);
    cafe.root.add(cupG);

    cupSaucer = buildSaucer();
    cupSaucer.position.set(CUP_POS.x, 1.062, CUP_POS.z);
    cafe.root.add(cupSaucer);

    noteG = buildNote();
    noteG.position.set(NOTE_POS.x, NOTE_POS.y, NOTE_POS.z);
    noteG.visible = false;
    cafe.root.add(noteG);

    // 点她 / 点那杯咖啡 / 点纸条
    if (interact && interact.add) {
      hotMom = interact.add({
        id: 'mom-cafe',
        label: '妈妈',
        box: [0, -60, 0, 0.68, 1.50, 0.56],
        anchor: [0, -60, 0],
        when: function () { return !!isCafeNow() && phase !== 'off' && group.visible; },
        onClick: function (h) {
          if (phase === 'chat') {
            // 陪她聊：她再多说一句（点几次都不一样）
            chatIdx++;
            if (chatIdx === 1) {
              showBubble('你爸要是在这儿，肯定也说好喝');
              sayMy(SAY.chat2, 4.0);
            } else if (chatIdx === 2) {
              showBubble('我不坐太久，你忙你的');
              sayMy('不忙不忙，今天店里就咱俩', 3.6);
            } else {
              showBubble('好啦好啦，我真走啦');
            }
            h._mute = true;
            return;
          }
          h._mute = false;
        },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          if (phase === 'off') return null;
          if (phase === 'brew') return '妈妈在柜台边上看你磨豆';
          if (phase === 'sit' || phase === 'serve') return '妈妈在等她的咖啡';
          if (phase === 'sip') return '妈妈在喝咖啡 ☕';
          if (phase === 'chat') return '妈妈坐在窗边，正说着话';
          return '妈妈在店里逛呢～';
        }
      });

      hotCup = interact.add({
        id: 'cafe-mom-cup',
        label: '妈妈的那杯',
        box: [CUP_POS.x, CUP_POS.y + 0.06, CUP_POS.z, 0.18, 0.30, 0.18],
        anchor: [CUP_POS.x, CUP_POS.y + 0.26, CUP_POS.z],
        enabled: false,
        when: function () { return !!isCafeNow() && cupShown; },
        onClick: function () { cafe.sound.clink && cafe.sound.clink(); },
        say: function () {
          if (phase !== 'off') return '妈妈的咖啡，奶泡上还留着小鲸鱼';
          return SAY.leftover;
        }
      });

      hotNote = interact.add({
        id: 'cafe-mom-note',
        label: '妈妈的纸条',
        box: [NOTE_POS.x, NOTE_POS.y + 0.07, NOTE_POS.z, 0.22, 0.32, 0.26],
        anchor: [NOTE_POS.x, NOTE_POS.y + 0.26, NOTE_POS.z],
        enabled: false,
        when: function () { return !!isCafeNow() && noteShown; },
        onClick: function () { if (sfx && sfx.blip) sfx.blip(); },
        say: SAY.note
      });
    }

    return {
      start: start,
      update: update,
      stop: stop,
      debug: debug
    };
  }

  return { build: build };
})();
