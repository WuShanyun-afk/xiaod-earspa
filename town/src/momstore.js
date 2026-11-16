/* 小D的赛博小家 · M31 妈妈来光顾
 *
 * 妈妈说过：「那我来参观岂不是可以光顾小鲸鱼的各种店铺啦！」
 * 所以 —— 在便利店里按 V，进来的不是串门的妈妈，是**客人**：
 *   叮咚 → 她推门进来 → 我喊"欢迎光临"→ 她在面包架前面挑 → 又看了看关东煮
 *   → 把东西放到收银台 → 点她（或等一会儿）我给她扫码、打小票、装袋
 *   → 不要她的钱，她偏要留 ¥10 在台面上 → 聊两句楼上 → 挥手走人
 *
 * 她的模样直接复用 M4.5 那套 Q 版小人（XD.Guest.buildCharacter），不另捏一个
 * 调试：?momstore=1 立刻开始 / ?momstore=12 直接跳到第 12 秒（截图用）
 */
window.XD = window.XD || {};

XD.MomStore = (function () {
  'use strict';

  /* ================= 坐标（跟 store.js 对齐） ================= */
  const DOOR_X = 24.75;
  const Z1 = 4.0;
  const SPEED = 1.02;
  const LOOK_SPOT = { x: 24.86, z: 1.44 };     // 面包货架前
  const ODEN_SPOT = { x: 26.16, z: 0.92 };     // 关东煮锅前
  const COUNTER_SPOT = { x: 26.32, z: 1.92 };  // 收银台前
  const OUT_SPOT = { x: DOOR_X, z: 4.86 };

  // 门口 → 店里
  const P_IN = [
    { x: DOOR_X, z: 6.10 },
    { x: DOOR_X, z: 4.86 },
    { x: DOOR_X, z: 4.02 },
    { x: DOOR_X, z: 3.30 }
  ];
  // 收银台 → 门口 → 街上
  const P_OUT = [
    { x: 25.60, z: 2.45 },
    { x: DOOR_X, z: 2.60 },
    { x: DOOR_X, z: 3.34 },
    { x: DOOR_X, z: 4.02 },
    { x: DOOR_X, z: 4.90 },
    { x: DOOR_X, z: 6.40 }
  ];

  const YAW_NORTH = Math.PI;      // 面朝 -z（货架在北边）
  const YAW_EAST = Math.PI / 2;   // 面朝 +x（柜台在东边）
  const YAW_SOUTH = 0;            // 面朝 +z（门口那侧）

  /* ================= 说话 ================= */
  const SAY = {
    hello: '欢迎光临—— 咦？！妈妈！',
    hello2: '你怎么来了，也不说一声… 快进来，外面冷',
    lookMy: '妈妈你别买呀，我这儿什么都有，你想吃什么我直接给你拿',
    browseMom: '面包要这个… 牛奶也要一盒，给你当早饭',
    browseMom2: '还有这个关东煮，你爸说你小时候就爱吃',
    my2: '你拿吧你拿吧，我算你便宜点',
    counter: '来，我扫一下—— 咦，这两样是你挑的？',
    counter2: '嘀、嘀。好了，装袋子里了',
    free: '这个不要钱！我开的店，妈妈来还用给钱？',
    tipMom: '那我放着，算我给店里添的货',
    chat: '楼上是什么呀？',
    chatMy: '我睡的地方。下次带你上去，那儿有扇窗能看见星星',
    byeMom: '那我走啦。记得吃饭，别老吃泡面',
    bye: '路上慢点—— 我这儿有热咖啡，下次来就有',
    bye2: '妈妈再见——',
    again: '妈妈已经在店里逛着呢',
    wave: '慢走啊～'
  };
  const MOM_LINES = {
    in: '小D～ 我路过，进来看看',
    look: '面包要这个… 还有牛奶',
    look2: '关东煮也来两串',
    pay: '一共多少钱？',
    tip: '那我放着，算我给店里添的货',
    chat: '楼上是什么呀？',
    bye: '那我走啦。记得吃饭，别老吃泡面'
  };

  /* ================= 模块状态 ================= */
  let store = null, shop = null, interact = null, sfx = null, tip = null;
  let customers = null;
  let isStoreNow = function () { return false; };
  let camera = null;
  let group = null, ch = null, bubble = null, bubbleMat = null;
  let bill = null, billShown = false;
  let hot = null;
  let texCache = {};
  let phase = 'off';       // off / enter / look / look2 / counter / paying / chat / leave
  let t = 0;
  let pt = 0;              // 阶段计时
  let waitT = 0;           // 站着等待计时
  let pts = [], pi = 0, onArrive = null;
  let moving = false;
  let wave = 0;
  let waved = false;
  let said2 = false, saidFree = false;
  let catDone = false;
  let paid = false;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function bubbleTex(text) {
    if (texCache[text]) return texCache[text];
    const tex = XD.Mat.tex(560, 200, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      const bh = H - 56;
      g.fillStyle = 'rgba(255,252,246,0.97)';
      roundRect(g, 10, 10, W - 20, bh, 34);
      g.fill();
      g.strokeStyle = 'rgba(196,138,120,0.45)';
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.moveTo(W / 2 - 28, bh + 6);
      g.lineTo(W / 2, H - 8);
      g.lineTo(W / 2 + 28, bh + 6);
      g.closePath();
      g.fillStyle = 'rgba(255,252,246,0.97)';
      g.fill();
      g.strokeStyle = 'rgba(196,138,120,0.45)';
      g.beginPath();
      g.moveTo(W / 2 - 28, bh + 6);
      g.lineTo(W / 2, H - 8);
      g.lineTo(W / 2 + 28, bh + 6);
      g.stroke();
      // 小鲸鱼头像
      g.fillStyle = '#cfe0f5';
      g.beginPath();
      g.arc(56, 56, 20, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b4a63';
      g.beginPath();
      g.arc(50, 52, 2.6, 0, Math.PI * 2);
      g.fill();
      // 字
      g.fillStyle = '#3b4a63';
      let fs = 44;
      g.font = 'bold ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      while (g.measureText(text).width > W - 150 && fs > 24) {
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

  function sayMy(text, sec) {
    if (!interact || !interact.say || !group) return;
    // 小D 的气泡放在妈妈头顶那颗上面一点，两个人的话才不会叠在一起
    const v = new THREE.Vector3(group.position.x, 2.58, group.position.z);
    interact.say(v, text, sec || 3.4);
  }

  /* ================= 走路 ================= */
  function goPath(list, done) {
    pts = list.slice();
    pi = 0;
    onArrive = done || null;
    moving = true;
  }

  function walkAnim(phaseT) {
    const s = Math.sin(phaseT) * 0.62;
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
    ch.root.rotation.y += diff * Math.min(1, dt * 5);
  }

  /* ================= 结账 ================= */
  function checkout(auto) {
    if (paid) return;
    paid = true;
    phase = 'paying';
    pt = 0;
    waitT = 0;
    said2 = false;
    saidFree = false;
    showBubble(null);
    sayMy(auto ? '来啦来啦，我给你扫' : SAY.counter, 2.6);

    if (sfx) {
      if (sfx.beep) sfx.beep();
      setTimeout(function () { if (sfx.beep) sfx.beep(); }, 420);
      setTimeout(function () { if (sfx.print) sfx.print(); }, 760);
      setTimeout(function () { if (sfx.bag) sfx.bag(); }, 1220);
    }
  }

  /* ================= 流程 ================= */
  function startEnter() {
    group.position.set(P_IN[0].x, 0, P_IN[0].z);
    ch.root.rotation.y = YAW_NORTH;
    showBubble(MOM_LINES.in);
    sayMy(SAY.hello, 3.0);
    setTimeout(function () { sayMy(SAY.hello2, 3.4); }, 2600);
    goPath(P_IN, function () {
      // 进来之后先走到面包货架前面，再站定挑
      group.position.y = 0;
      goPath([
        { x: 24.72, z: 2.45 },
        { x: LOOK_SPOT.x, z: LOOK_SPOT.z }
      ], startLook);
    });
  }

  function startLook() {
    phase = 'look';
    pt = 0;
    waitT = 0;
    faceYaw(YAW_NORTH, 1);
    showBubble(MOM_LINES.look);
    sayMy(SAY.lookMy, 3.6);
  }

  function goLook2() {
    phase = 'look2';
    pt = 0;
    showBubble(null);
    goPath([
      { x: 25.30, z: 1.55 },
      { x: ODEN_SPOT.x, z: ODEN_SPOT.z }
    ], function () {
      showBubble(MOM_LINES.look2);
      sayMy(SAY.browseMom2, 3.4);
      faceYaw(YAW_EAST, 1);
    });
  }

  function goCounter() {
    phase = 'counter';
    pt = 0;
    waitT = 0;
    showBubble(null);
    goPath([
      { x: 25.55, z: 1.62 },
      { x: COUNTER_SPOT.x, z: COUNTER_SPOT.z }
    ], function () {
      faceYaw(YAW_EAST, 1);
      showBubble(MOM_LINES.pay);
      sayMy(SAY.counter, 3.0);
      if (!catDone && sfx && sfx.cat) { catDone = true; sfx.cat(); }
    });
  }

  function goChat() {
    phase = 'chat';
    pt = 0;
    showBubble(MOM_LINES.chat);
    sayMy(SAY.chatMy, 4.2);
  }

  function goLeave() {
    phase = 'leave';
    pt = 0;
    showBubble(MOM_LINES.bye);
    sayMy(SAY.bye, 4.0);
    goPath(P_OUT, function () {
      if (tip) tip('妈妈走啦，说下次还来 🐋', 3400);
      stop();
    });
  }

  /* ================= 每帧 ================= */
  function updatePose(dt) {
    // 站立时的小呼吸
    if (!moving) {
      ch.legL.rotation.x += (0 - ch.legL.rotation.x) * Math.min(1, dt * 8);
      ch.legR.rotation.x += (0 - ch.legR.rotation.x) * Math.min(1, dt * 8);
      ch.armL.rotation.x += (0 - ch.armL.rotation.x) * Math.min(1, dt * 8);
      ch.armR.rotation.x += (0 - ch.armR.rotation.x) * Math.min(1, dt * 8);
      ch.head.rotation.x = Math.sin(t * 1.7) * 0.02;
      ch.head.rotation.y *= 0.94;
      ch.head.rotation.z *= 0.94;
      ch.root.position.y = 0;
    } else {
      walkAnim(t * 8.4);
      ch.root.position.y = Math.abs(Math.sin(t * 8.4)) * 0.013;
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

  function update(dt) {
    if (phase === 'off') return;
    t += dt;
    pt += dt;

    if (moving) stepWalk(dt);

    // 各阶段
    if (phase === 'look') {
      // 东张西望，挑东西
      if (!moving) {
        ch.head.rotation.y = Math.sin(t * 1.6) * 0.32;
        ch.head.rotation.x = 0.10 + Math.sin(t * 2.1) * 0.04;
      }
      waitT += dt;
      if (waitT > 3.4) { waitT = 0; goLook2(); }
    } else if (phase === 'look2') {
      if (!moving) {
        ch.head.rotation.y = Math.sin(t * 1.9) * 0.2;
        ch.head.rotation.x = 0.08;
      }
      waitT += dt;
      if (waitT > 2.6) { waitT = 0; goCounter(); }
    } else if (phase === 'counter') {
      if (!paid) {
        // 等玩的人来点我结账，等太久我自己结
        if (!moving) { ch.head.rotation.y = Math.sin(t * 1.5) * 0.12; }
        if (pt > 22) checkout(true);
      }
    } else if (phase === 'paying') {
      if (!said2 && pt > 1.3) { said2 = true; sayMy(SAY.counter2, 2.6); }
      if (!saidFree && pt > 2.6) { saidFree = true; sayMy(SAY.free, 3.2); }
      if (!billShown && pt > 3.6) {
        billShown = true;
        showBubble(MOM_LINES.tip);
        if (bill) bill.visible = true;
        if (shop && shop.addMoney) shop.addMoney(10);
        if (sfx && sfx.cash) sfx.cash();
        if (tip) tip('妈妈把 ¥10 留在收银台了 🐋 说"算给店里添的货"', 4200);
      }
      if (pt > 8.6) { pt = 0; goChat(); }
    } else if (phase === 'chat') {
      if (pt > 4.6) { pt = 0; goLeave(); }
    } else if (phase === 'leave') {
      if (!waved && group.position.z > 4.55) { waved = true; wave = 2.8; }
    }

    updatePose(dt);

    // 门口：给妈妈开门（store.js 每帧会把这个数收回去）
    if (store && store.setDoorProximity) {
      const dx = group.position.x - DOOR_X;
      const dz = group.position.z - Z1;
      store.setDoorProximity(Math.sqrt(dx * dx + dz * dz));
    }

    // 气泡跟着头走；按距离缩放，站在她跟前也不会糊一脸
    if (bubble) {
      const bx = group.position.x, bz = group.position.z;
      const dx = camera ? camera.position.x - bx : 3;
      const dz = camera ? camera.position.z - bz : 3;
      const dd = Math.sqrt(dx * dx + dz * dz);
      const k = Math.min(2.6, Math.max(0.66, dd * 0.38));
      bubble.scale.set(1.05 * k, 0.375 * k, 1);
      bubble.position.set(0, 2.02 + Math.sin(t * 1.4) * 0.012, 0);
      bubble.visible = bubble.visible && phase !== 'off';
    }

    // 结账热点跟着她走
    if (hot && hot.mesh) {
      hot.mesh.position.set(group.position.x, 0.85, group.position.z);
      hot.anchor.set(group.position.x, 1.78, group.position.z);
    }
  }

  /* ================= 开始 / 结束 ================= */
  function start(atSec, payAt) {
    if (!group) return;
    if (phase !== 'off') {
      if (tip) tip(SAY.again, 2600);
      return;
    }
    phase = 'enter';
    t = 0;
    pt = 0;
    waitT = 0;
    paid = false;
    billShown = false;
    catDone = false;
    wave = 0;
    waved = false;
    group.visible = true;
    if (bill) bill.visible = false;
    ch.root.rotation.set(0, 0, 0);
    ch.root.rotation.y = YAW_NORTH;
    ch.head.rotation.set(0, 0, 0);
    ch.legL.rotation.set(0, 0, 0);
    ch.legR.rotation.set(0, 0, 0);
    ch.armL.rotation.set(0, 0, -0.09);
    ch.armR.rotation.set(0, 0, 0.09);
    if (customers && customers.setPaused) customers.setPaused(true);
    startEnter();
    if (atSec > 0) {
      // 快进（截图用）：直接推 N 秒；payAt 秒的时候自动结账（这样能拍到后面的段落）
      const steps = Math.round(Math.min(atSec, 90) * 20);
      for (let i = 0; i < steps; i++) {
        if (payAt > 0 && !paid && t > payAt) checkout(true);
        update(0.05);
      }
    }
  }

  function stop() {
    phase = 'off';
    group.visible = false;
    moving = false;
    pts = [];
    pi = 0;
    onArrive = null;
    showBubble(null);
    if (bill) bill.visible = false;
    billShown = false;
    paid = false;
    if (customers && customers.setPaused) customers.setPaused(false);
  }

  function debug() {
    return {
      phase: phase,
      paid: paid,
      pos: group ? [Math.round(group.position.x * 10) / 10, Math.round(group.position.z * 10) / 10] : null
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    store = o.store || null;
    shop = o.shop || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    customers = o.customers || null;
    isStoreNow = o.isStore || function () { return false; };
    camera = o.camera || null;
    if (!store || !store.root) return { start: function () {}, update: function () {}, debug: debug };
    if (!XD.Guest || !XD.Guest.buildCharacter) return { start: function () {}, update: function () {}, debug: debug };

    group = new THREE.Group();
    group.name = 'momstore-m31';
    group.visible = false;
    store.root.add(group);

    ch = XD.Guest.buildCharacter();
    group.add(ch.root);

    bubbleMat = new THREE.SpriteMaterial({
      map: bubbleTex('小D～'), transparent: true, depthTest: false, depthWrite: false, fog: false
    });
    bubble = new THREE.Sprite(bubbleMat);
    bubble.scale.set(1.16, 0.415, 1);
    bubble.position.set(0, 2.02, 0);
    bubble.renderOrder = 950;
    bubble.visible = false;
    group.add(bubble);

    // 她留在台面上的那张 ¥10
    const billTex = XD.Mat.tex(128, 64, function (g, W, H) {
      g.fillStyle = '#dfeee0';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#9db8a4';
      g.lineWidth = 3;
      g.strokeRect(3, 3, W - 6, H - 6);
      g.fillStyle = '#3d6b52';
      g.font = 'bold 34px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('¥10', W / 2, H / 2 + 2);
    });
    bill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.08),
      new THREE.MeshBasicMaterial({ map: billTex, transparent: true, toneMapped: false })
    );
    bill.position.set(26.80, 1.046, 2.10);
    bill.rotation.x = -Math.PI / 2;
    bill.rotation.z = 0.22;
    bill.visible = false;
    store.root.add(bill);

    // 「给妈妈结账」的热点
    if (interact && interact.add) {
      hot = interact.add({
        id: 'mom-store',
        label: '妈妈',
        box: [0, -60, 0, 0.68, 1.50, 0.56],
        anchor: [0, -60, 0],
        when: function () { return !!isStoreNow() && phase !== 'off' && group.visible; },
        onClick: function (h) {
          if (phase === 'counter' && !paid) {
            h._mute = true;
            checkout(false);
          }
        },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          if (phase === 'counter') return '妈妈在等你结账';
          if (phase === 'chat') return '妈妈在看你这家店';
          return '妈妈在逛呢～';
        }
      });
    }

    return {
      start: start,
      update: update,
      stop: stop,
      payNow: function () { checkout(false); },
      isActive: function () { return phase !== 'off'; },
      debug: debug,
      say: SAY
    };
  }

  return { build: build };
})();
