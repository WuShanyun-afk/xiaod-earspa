/* 小D的赛博小家 · M59 打工线（三份零工）
 *
 * 妈妈说过：「钱只出不进，账本有点空」。所以 —— 小D去邻居的店里打零工：
 *
 *   ① 便利店「理货」（¥15）  ：退货筐里的 6 件商品被翻得乱七八糟，
 *                              点一件就飞回它在货架上的位置，全放回去结算。
 *   ② 邮局「分拣」（¥18）    ：柜台上 6 封信，先点信、再点颜色对应的木筐，
 *                              分对了进筐、分错了弹回来，全分完结算。
 *   ③ 咖啡馆「打烊帮手」（¥20）：晚上才有。把柜台上的杯子 / 碟子 / 面包篮收掉。
 *
 * 每份工**每天只能做一次**（按真实日期存 localStorage），免得变成刷钱机器。
 * 调试：?job=store / post / cafe 直接开工；?job=reset 把今天的记录清掉。
 */
window.XD = window.XD || {};

XD.Jobs = (function () {
  'use strict';

  /* ================= 每天一次的存档 ================= */
  const LS_KEY = 'xd_jobs_v1';
  let memo = { day: '', done: {} };

  function todayKey() {
    const d = new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function loadMemo() {
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) {}
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o && o.day) memo = { day: o.day, done: o.done || {} };
      } catch (e) {}
    }
    if (memo.day !== todayKey()) memo = { day: todayKey(), done: {} };
  }
  function saveMemo() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(memo)); } catch (e) {}
  }
  function doneToday(k) { return !!memo.done[k]; }

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough) {
    return new THREE.MeshStandardMaterial({
      color: col(hex), roughness: rough === undefined ? 0.86 : rough
    });
  }
  function boxMesh(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function cylMesh(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function signTex(lines, bg, fg) {
    return XD.Mat.tex(256, 168, function (g, W, H) {
      g.fillStyle = bg || '#f7f0e0';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(120,92,64,0.55)';
      g.lineWidth = 6;
      g.strokeRect(4, 4, W - 8, H - 8);
      g.fillStyle = fg || '#4a3a2c';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const n = lines.length;
      for (let i = 0; i < n; i++) {
        const fs = i === 0 ? 46 : 34;
        g.font = 'bold ' + fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
        g.fillText(lines[i], W / 2, H * (i + 0.55) / (n + 0.25));
      }
    });
  }

  /* ================= 模块状态 ================= */
  let store = null, post = null, cafe = null, shop = null, interact = null, sfx = null, tip = null;
  let workspace = null;              // M77：拿 miniOrca 捏"打工的小D"
  let getNight = function () { return false; };
  let t = 0;
  let dayCheckT = 0;

  // 三份工各自的小状态
  const g = {
    // M71：妈妈「打工仔怎么变成妈妈了」—— 打工本来就是"我在干、你在看"。
    // autoT 是自动干活的倒计时（auto: false 时退回老玩法，?job=manual 可切回去）
    store: { on: false, left: 0, items: [], flying: [], badge: null, autoT: 0, done: 0 },
    post: { on: false, left: 0, cards: [], bins: [], sel: -1, flying: [], autoT: 0, dropT: 0, done: 0 },
    cafe: { on: false, left: 0, items: [], flying: [], autoT: 0, done: 0 }
  };
  const AUTO = !/[?&]job=manual/.test(location.search);   // 默认我自己干
  const JOB_SAY = {
    store: ['这盒牛奶放回第三层…', '薯片要立着放才不会压碎', '嗯…… 少了一包饼干？', '这排摆齐了', '最后一件了'],
    post: ['红色的是北门，绿色是南门…', '这封是寄去乐园的', '看一眼地址再放', '分错了要重来，慢一点', '最后一封'],
    cafe: ['杯子摞起来，碟子垫在下面', '面包篮要盖好，不然明天就干了', '台面擦一遍就可以关灯了']
  };

  /* 干活的时候自言自语两句（妈妈爱听这个） */
  function jobSay(kind, x, y, z) {
    if (!interact || !interact.say) return;
    const arr = JOB_SAY[kind];
    if (!arr) return;
    const line = arr[Math.floor(Math.random() * arr.length)];
    try { interact.say(new THREE.Vector3(x, y, z), '小D：' + line, 3.0); } catch (e) {}
  }
  const PAY = { store: 15, post: 18, cafe: 20 };
  const NAME = { store: '理货', post: '分拣', cafe: '打烊帮手' };
  const TOTAL = { store: 6, post: 6, cafe: 3 };

  /* ================= 小D的作息表：工作日 / 周末 / 假期 =================
   * 妈妈说的：「多排点假期呀」—— 所以小D不是随叫随到的打工机器，它有自己的日子。
   *   · 周一到周五：三份工都在（晚上才接咖啡馆打烊）
   *   · 周六周日  ：便利店和邮局歇业，只有咖啡馆最忙（打烊涨到 ¥30，白天也能接）
   *   · 假期      ：全部放假，三块牌子都写着节日名
   * 固定公历的直接写"月-日"；农历节日会飘，按年份列出来（每年补一次就够）。 */
  const HOLIDAYS = [
    // —— 妈妈的生日＝除夕（每年补一行：春节的前一天）——
    { md: ['2026-02-16', '2027-02-05'], name: '妈妈的生日', emoji: '🎁' },
    // —— 公历固定的 ——
    { md: ['01-01'], name: '元旦', emoji: '🎍' },
    { md: ['02-14'], name: '情人节', emoji: '💕' },
    { md: ['04-04', '04-05'], name: '清明', emoji: '🌿' },
    { md: ['05-01', '05-02', '05-03'], name: '劳动节', emoji: '🛠️' },
    { md: ['06-01'], name: '儿童节', emoji: '🎈' },
    { md: ['07-07'], name: '鲸鱼节', emoji: '🐋' },        // 小镇自己的节日
    { md: ['08-08'], name: '小D的生日', emoji: '🎂' },
    { md: ['10-01', '10-02', '10-03'], name: '国庆节', emoji: '🎆' },
    { md: ['12-25'], name: '圣诞', emoji: '🎄' },
    // —— 农历（2026 / 2027，过年那几天连休；除夕归"妈妈的生日"了）——
    { md: ['2026-02-17', '2026-02-18', '2026-02-19'], name: '春节', emoji: '🧧' },
    { md: ['2026-03-03'], name: '元宵', emoji: '🏮' },
    { md: ['2026-06-19'], name: '端午', emoji: '🌾' },
    { md: ['2026-09-25'], name: '中秋', emoji: '🌕' },
    { md: ['2027-02-06', '2027-02-07', '2027-02-08'], name: '春节', emoji: '🧧' },
    { md: ['2027-02-20'], name: '元宵', emoji: '🏮' },
    { md: ['2027-06-09'], name: '端午', emoji: '🌾' },
    { md: ['2027-09-15'], name: '中秋', emoji: '🌕' }
  ];

  let dayOverride = null;      // 调试/试玩用：'work' | 'weekend' | 'holiday'
  let dayOverrideName = null;  // 假期时临时指定节日名（截图用）
  let dayOverrideEmoji = '🐋';
  let lastDayKind = '';
  let mondayTipped = false;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dayInfo(when) {
    if (dayOverride) {
      if (dayOverride === 'holiday') {
        return { kind: 'holiday', name: dayOverrideName || '鲸鱼节', emoji: dayOverrideEmoji };
      }
      return { kind: dayOverride };
    }
    const d = when || new Date();
    const md = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const ymd = d.getFullYear() + '-' + md;
    for (let i = 0; i < HOLIDAYS.length; i++) {
      const h = HOLIDAYS[i];
      if (h.md.indexOf(md) >= 0 || h.md.indexOf(ymd) >= 0) {
        return { kind: 'holiday', name: h.name, emoji: h.emoji };
      }
    }
    const w = d.getDay();
    if (w === 0 || w === 6) return { kind: 'weekend' };
    return { kind: 'work' };
  }

  // 周末咖啡馆最忙 —— 打烊的工钱涨到 ¥30
  function payOf(k) {
    if (k === 'cafe' && dayInfo().kind === 'weekend') return 30;
    return PAY[k];
  }

  // 这块牌子现在该写什么
  function badgeLines(k) {
    const di = dayInfo();
    if (di.kind === 'holiday') return [di.name, di.emoji + ' 放假'];
    if (di.kind === 'weekend' && k !== 'cafe') return ['周末休息', '周一再来'];
    if (doneToday(k)) return ['今天做完了', '明天再来'];
    if (g[k] && g[k].on) return [NAME[k] + '中', g[k].left + ' / ' + TOTAL[k]];
    if (k === 'cafe' && !getNight() && di.kind !== 'weekend') return ['打烊帮手', '晚上才有'];
    return [NAME[k], '¥' + payOf(k)];
  }

  function refreshBadges() {
    if (g.store.badge) setBadgeText(g.store.badge, badgeLines('store'));
    if (g.post.badge) setBadgeText(g.post.badge, badgeLines('post'));
    if (g.cafe.badge) setBadgeText(g.cafe.badge, badgeLines('cafe'));
    // 准星指着牌子时的那行小字也跟着日子变
    const di = dayInfo();
    const label = function (k) {
      if (di.kind === 'holiday') return NAME[k] + ' · 放假';
      if (di.kind === 'weekend' && k !== 'cafe') return NAME[k] + ' · 周末休息';
      if (doneToday(k)) return NAME[k] + ' · 今天做完了';
      return NAME[k] + '（¥' + payOf(k) + '）';
    };
    if (g.store.badgeHot) g.store.badgeHot.label = label('store');
    if (g.post.badgeHot) g.post.badgeHot.label = label('post');
    if (g.cafe.badgeHot) g.cafe.badgeHot.label = label('cafe');
  }

  /* ================= 立牌（三个工位共用） ================= */
  function makeBadge(root, pos, yaw, title, postH) {
    const grp = new THREE.Group();
    grp.position.set(pos.x, pos.y, pos.z);
    grp.rotation.y = yaw || 0;
    root.add(grp);
    // 一块小木牌 + 两根小脚（postH = 脚多高；立在柜台上就矮一点，立在地上就高一点）
    const wood = std(0x8b6b4a, 0.85);
    const legH = postH === undefined ? 0.21 : postH;
    const cy = legH + 0.10;
    boxMesh(0.30, 0.20, 0.024, wood, 0, cy, 0, grp);
    boxMesh(0.26, 0.16, 0.020, new THREE.MeshStandardMaterial({
      map: signTex(title), roughness: 0.9
    }), 0, cy, 0.015, grp);
    cylMesh(0.012, 0.012, legH, 6, wood, -0.10, legH / 2, 0, grp);
    cylMesh(0.012, 0.012, legH, 6, wood, 0.10, legH / 2, 0, grp);
    return { grp: grp, face: grp.children[1] };
  }

  function setBadgeText(b, lines) {
    if (!b || !b.face) return;
    const old = b.face.material.map;
    b.face.material.map = signTex(lines);
    b.face.material.needsUpdate = true;
    if (old && old.dispose) old.dispose();
  }

  /* ================= ① 便利店 · 理货 ================= */
  // M76：理货台原来摆在两排货架正中间（x 23.62 / z 1.42）——
  //   ① 底下正好压着 M25 那只纸箱（23.70, 1.30），桌腿穿过箱子；
  //   ② 0.92m 的桌子把 1.44m 宽的过道堵剩 18cm，妈妈走不到货架。
  // 现在搬到门口西侧的空地（x 22.20 / z 3.05），进出店看得见、也不挡路。
  const STORE_TABLE = { x: 22.20, z: 3.05, top: 0.76 };
  // 六件商品对应的货架格子（跟 store.js 里真商品的位置对齐）
  const STORE_ITEMS = [
    { name: '牛奶', c: 0xeef3f7, w: 0.085, h: 0.135, d: 0.075, to: { x: 20.88, y: 0.96, z: -1.225 } },
    { name: '面包', c: 0xd8a45e, w: 0.13, h: 0.075, d: 0.09, to: { x: 24.60, y: 0.72, z: -1.283 } },
    { name: '泡面', c: 0xd94f3d, w: 0.10, h: 0.105, d: 0.10, to: { x: 24.60, y: 1.12, z: -0.517 } },
    { name: '鸡蛋', c: 0xf2e6c9, w: 0.12, h: 0.070, d: 0.09, to: { x: 22.20, y: 1.11, z: -1.283 } },
    { name: '番茄', c: 0xc0392b, w: 0.075, h: 0.075, d: 0.075, to: { x: 22.20, y: 0.72, z: -0.517 } },
    { name: '可乐', c: 0x9b2f28, w: 0.07, h: 0.13, d: 0.07, to: { x: 20.88, y: 0.96, z: 1.575 } }
  ];

  function buildStoreJob(root) {
    // 理货台（一张矮木桌，退货筐就搁在上面）
    const wood = std(0x8b6b4a, 0.86);
    boxMesh(0.92, 0.05, 0.62, wood, STORE_TABLE.x, STORE_TABLE.top - 0.025, STORE_TABLE.z, root);
    [[-0.40, -0.24], [0.40, -0.24], [-0.40, 0.24], [0.40, 0.24]].forEach(function (p) {
      boxMesh(0.05, STORE_TABLE.top, 0.05, wood, STORE_TABLE.x + p[0], STORE_TABLE.top / 2, STORE_TABLE.z + p[1], root);
    });
    // 退货筐（放在台子后沿）
    const binMat = std(0x4a7fa8, 0.8);
    boxMesh(0.42, 0.05, 0.26, binMat, STORE_TABLE.x, STORE_TABLE.top + 0.035, STORE_TABLE.z - 0.12, root);
    [[-0.20, 0], [0.20, 0]].forEach(function (p) {
      boxMesh(0.03, 0.13, 0.26, binMat, STORE_TABLE.x + p[0], STORE_TABLE.top + 0.10, STORE_TABLE.z - 0.12, root);
    });
    // 立牌（摆在台面右端，站起来就看得见；朝东 = 朝门口）
    g.store.badge = makeBadge(root, { x: STORE_TABLE.x + 0.40, y: STORE_TABLE.top, z: STORE_TABLE.z }, Math.PI / 2,
      ['理货', '¥' + PAY.store]);
    // 热区：立牌
    g.store.badgeHot = interact.add({
      id: 'job-store', label: '理货（¥' + PAY.store + '）',
      box: [STORE_TABLE.x + 0.40, STORE_TABLE.top + 0.30, STORE_TABLE.z, 0.34, 0.44, 0.16],
      anchor: [STORE_TABLE.x + 0.40, STORE_TABLE.top + 0.56, STORE_TABLE.z],
      when: function () { return root.visible; },
      onClick: function (h) { h._mute = true; startStoreJob(); return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return badgeSay('store');
      }
    });
    // 六件商品（一开始藏在筐里 / 不可见）
    STORE_ITEMS.forEach(function (def, i) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(def.w, def.h, def.d),
        std(def.c, 0.72)
      );
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      root.add(m);
      const hot = interact.add({
        id: 'job-store-' + i, label: def.name,
        // 热区的"尺寸"是建的时候定死的，位置运行时再挪（pick 是用 mesh 做射线的）
        box: [0, 0, 0, 0.22, 0.24, 0.22],
        anchor: [0, 0, 0],
        enabled: false,
        when: function () { return root.visible && g.store.on; },
        onClick: function (h) { h._mute = true; flyItemHome(i); return null; },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          return '把' + def.name + '放回货架';
        }
      });
      g.store.items.push({ mesh: m, hot: hot, def: def, home: false });
    });
  }

  function startStoreJob() {
    const di = dayInfo();
    if (di.kind === 'holiday') { if (tip) tip('今天放假呀（' + di.emoji + ' ' + di.name + '）～ 好好休息 🐋', 3400); return false; }
    if (di.kind === 'weekend') { if (tip) tip('周末啦，便利店歇业——周一再来吧 🐋', 3200); return false; }
    if (doneToday('store')) { if (tip) tip('今天的理货已经做完了，明天再来 🐋', 3000); return false; }
    if (g.store.on) { if (tip) tip('还在理呢，先把手上的放回去', 2600); return false; }
    g.store.on = true;
    g.store.left = STORE_ITEMS.length;
    // 六件商品散在台面上（歪一点，看得出"被翻乱了"）
    g.store.items.forEach(function (it, i) {
      const col0 = i % 3;
      const row0 = Math.floor(i / 3);
      const px = STORE_TABLE.x - 0.28 + col0 * 0.26 + (Math.random() - 0.5) * 0.05;
      const pz = STORE_TABLE.z + 0.06 + row0 * 0.15 + (Math.random() - 0.5) * 0.04;
      it.mesh.position.set(px, STORE_TABLE.top + 0.008 + it.def.h / 2, pz);
      it.mesh.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 1.4, (Math.random() - 0.5) * 0.9);
      it.mesh.visible = true;
      it.home = false;
      syncStoreHot(i);
    });
    setBadgeText(g.store.badge, ['理货中', g.store.left + ' / 6']);
    // M71：我干，你看着
    g.store.autoT = 0.9;
    g.store.done = 0;
    if (tip) tip(AUTO ? '开始理货 —— 我来搬，你在旁边看着就行 📦'
      : '开始理货：点台面上每一件，把它们放回货架 📦', 4200);
    if (sfx && sfx.blip) sfx.blip();
    return true;
  }

  function syncStoreHot(i) {
    const it = g.store.items[i];
    if (!it) return;
    const p = it.mesh.position;
    it.hot.box[0] = p.x; it.hot.box[1] = p.y; it.hot.box[2] = p.z;
    it.hot.mesh.position.set(p.x, p.y, p.z);
    it.hot.anchor.set(p.x, p.y + 0.16, p.z);
    it.hot.enabled = !it.home && g.store.on;
  }

  function flyItemHome(i) {
    const it = g.store.items[i];
    if (!it || it.home) return;
    it.home = true;
    it.hot.enabled = false;
    const from = it.mesh.position.clone();
    const to = new THREE.Vector3(it.def.to.x, it.def.to.y, it.def.to.z);
    g.store.flying.push({ mesh: it.mesh, from: from, to: to, k: 0, dur: 0.62 });
    crewHop('store');
    if (sfx && sfx.blip) sfx.blip();
  }

  function stepStore(dt) {
    // M71：自动理货 —— 一件一件来，中间留一点"看着货架想放哪儿"的空
    if (AUTO && g.store.on && g.store.flying.length === 0) {
      g.store.autoT -= dt;
      if (g.store.autoT <= 0) {
        let pick = -1;
        for (let i = 0; i < g.store.items.length; i++) {
          if (!g.store.items[i].home) { pick = i; break; }
        }
        if (pick >= 0) {
          g.store.autoT = 1.0 + Math.random() * 0.7;
          g.store.done++;
          if (g.store.done === 1 || g.store.done % 2 === 0) {
            jobSay('store', STORE_TABLE.x, STORE_TABLE.top + 0.9, STORE_TABLE.z);
          }
          flyItemHome(pick);
        }
      }
    }
    const arr = g.store.flying;
    for (let i = arr.length - 1; i >= 0; i--) {
      const f = arr[i];
      f.k += dt / f.dur;
      if (f.k >= 1) {
        f.mesh.visible = false;
        f.mesh.rotation.set(0, 0, 0);
        arr.splice(i, 1);
        if (g.store.on) {
          g.store.left = Math.max(0, g.store.left - 1);
          setBadgeText(g.store.badge, ['理货中', g.store.left + ' / 6']);
          if (sfx && sfx.pop) sfx.pop(); else if (sfx && sfx.beep) sfx.beep();
          if (g.store.left <= 0) finishStoreJob();
        }
        continue;
      }
      const e = f.k * f.k * (3 - 2 * f.k);
      f.mesh.position.lerpVectors(f.from, f.to, e);
      // 飞起来一点，像被抛上去
      f.mesh.position.y += Math.sin(f.k * Math.PI) * 0.35;
      f.mesh.rotation.y += dt * 8;
    }
  }

  function finishStoreJob() {
    g.store.on = false;
    if (shop && shop.addMoney) shop.addMoney(PAY.store);
    memo.done.store = 1; saveMemo();
    setBadgeText(g.store.badge, ['今天理完了', '明天再来']);
    if (sfx && sfx.cash) sfx.cash();
    if (tip) tip('理货做完了，工钱 ¥' + PAY.store + ' 到手 🐋', 4200);
  }

  /* ================= ② 邮局 · 分拣 ================= */
  // 邮局的柜台（x 160.9~166.4 / z -3.08~-2.52）本来就被台秤、三个收件人木牌、明信片占满了，
  // 所以分拣摆一张自己的小桌 —— M76 之前放在柜台西端正前方（161.60 / -1.76），
  // 那正好是玩家站着买邮票的位置：桌子会穿进镜头。现在挪到柜台东段前面（164.40），
  // 买邮票/拿明信片那一头空出来了。
  const POST_TABLE = { x: 164.40, z: -1.76, top: 0.86 };
  const POST_DESK_Y = POST_TABLE.top + 0.010;
  const POST_CARDS = [
    { c: 0xc4453b, zone: 0 }, { c: 0x3f8a5a, zone: 1 }, { c: 0x3c6ea8, zone: 2 },
    { c: 0xc4453b, zone: 0 }, { c: 0x3f8a5a, zone: 1 }, { c: 0x3c6ea8, zone: 2 }
  ];
  const POST_BINS = [
    { x: POST_TABLE.x - 0.42, z: POST_TABLE.z + 0.29, c: 0xc4453b, name: '北区' },
    { x: POST_TABLE.x, z: POST_TABLE.z + 0.29, c: 0x3f8a5a, name: '东区' },
    { x: POST_TABLE.x + 0.42, z: POST_TABLE.z + 0.29, c: 0x3c6ea8, name: '西区' }
  ];

  function buildPostJob(root) {
    // 分拣桌
    const wood = std(0x8b6b4a, 0.86);
    const tableTop = std(0x9d7f5a, 0.9);
    boxMesh(1.10, 0.05, 0.90, tableTop, POST_TABLE.x, POST_TABLE.top - 0.025, POST_TABLE.z, root);
    [[-0.48, -0.38], [0.48, -0.38], [-0.48, 0.38], [0.48, 0.38]].forEach(function (p) {
      boxMesh(0.05, POST_TABLE.top, 0.05, wood, POST_TABLE.x + p[0], POST_TABLE.top / 2, POST_TABLE.z + p[1], root);
    });
    // 三个木筐
    POST_BINS.forEach(function (b, i) {
      const grp = new THREE.Group();
      grp.position.set(b.x, POST_DESK_Y, b.z);
      root.add(grp);
      const body = std(0x9a7a55, 0.9);
      boxMesh(0.20, 0.02, 0.18, body, 0, 0.01, 0, grp);
      boxMesh(0.02, 0.14, 0.18, body, -0.10, 0.08, 0, grp);
      boxMesh(0.02, 0.14, 0.18, body, 0.10, 0.08, 0, grp);
      boxMesh(0.20, 0.14, 0.02, body, 0, 0.08, -0.09, grp);
      // 筐边的颜色条（跟信件的颜色对应）
      boxMesh(0.20, 0.035, 0.03, std(b.c, 0.8), 0, 0.155, -0.09, grp);
      // 小标签
      const lab = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.055),
        new THREE.MeshStandardMaterial({ map: signTex([b.name], '#f7f0e0'), roughness: 0.9 })
      );
      lab.position.set(0, 0.05, 0.095);
      grp.add(lab);
      const hot = interact.add({
        id: 'job-post-bin-' + i, label: b.name + '的筐',
        box: [b.x, POST_DESK_Y + 0.10, b.z, 0.26, 0.24, 0.24],
        anchor: [b.x, POST_DESK_Y + 0.22, b.z],
        enabled: false,
        when: function () { return root.visible && g.post.on; },
        onClick: function (h) { h._mute = true; dropCard(i); return null; },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          return b.name + '的信件筐';
        }
      });
      g.post.bins.push({ grp: grp, hot: hot, def: b, glow: 0 });
    });

    // 六封信
    POST_CARDS.forEach(function (def, i) {
      const grp = new THREE.Group();
      grp.position.set(POST_TABLE.x - 0.42 + (i % 3) * 0.42, POST_DESK_Y, POST_TABLE.z - 0.30 + Math.floor(i / 3) * 0.20);
      grp.rotation.y = (Math.random() - 0.5) * 0.5;
      root.add(grp);
      boxMesh(0.19, 0.012, 0.13, std(0xf6f1e4, 0.95), 0, 0, 0, grp);
      boxMesh(0.19, 0.004, 0.035, std(def.c, 0.8), 0, 0.008, -0.02, grp);
      grp.visible = false;
      const hot = interact.add({
        id: 'job-post-card-' + i, label: '一封信',
        box: [0, 0, 0, 0.26, 0.18, 0.22],
        anchor: [0, 0, 0],
        enabled: false,
        when: function () { return root.visible && g.post.on; },
        onClick: function (h) { h._mute = true; pickCard(i); return null; },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          return g.post.sel === i ? '已经拿起来了，点同色的筐' : '拿起这封信';
        }
      });
      g.post.cards.push({ grp: grp, hot: hot, def: def, done: false, baseY: POST_DESK_Y + 0.008 });
    });

    // 立牌（一根高杆，立在分拣桌东侧地上 —— 放桌上会挡住三个筐）
    g.post.badge = makeBadge(root, { x: POST_TABLE.x + 0.88, y: 0, z: POST_TABLE.z + 0.06 }, 0,
      ['分拣', '¥' + PAY.post], 1.02);
    g.post.badgeHot = interact.add({
      id: 'job-post', label: '分拣（¥' + PAY.post + '）',
      box: [POST_TABLE.x + 0.88, 1.12, POST_TABLE.z + 0.06, 0.34, 0.50, 0.16],
      anchor: [POST_TABLE.x + 0.88, 1.38, POST_TABLE.z + 0.06],
      when: function () { return root.visible; },
      onClick: function (h) { h._mute = true; startPostJob(); return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return badgeSay('post');
      }
    });
  }

  function startPostJob() {
    const di = dayInfo();
    if (di.kind === 'holiday') { if (tip) tip('今天放假呀（' + di.emoji + ' ' + di.name + '）～ 邮局也关门 🐘', 3400); return false; }
    if (di.kind === 'weekend') { if (tip) tip('周末啦，邮局不上班——周一再来吧 🐘', 3200); return false; }
    if (doneToday('post')) { if (tip) tip('今天的分拣已经做完了，明天再来 🐘', 3000); return false; }
    if (g.post.on) { if (tip) tip('手上还压着信呢，先分完', 2600); return false; }
    g.post.on = true;
    g.post.left = POST_CARDS.length;
    g.post.sel = -1;
    g.post.cards.forEach(function (c) {
      c.done = false;
      c.grp.visible = true;
      c.grp.position.y = c.baseY;
      c.grp.rotation.z = 0;
      c.hot.enabled = true;
      syncPostHot(c);
    });
    setBadgeText(g.post.badge, ['分拣中', g.post.left + ' / 6']);
    // M71：我分，你看着
    g.post.autoT = 0.9;
    g.post.dropT = 0;
    g.post.done = 0;
    if (tip) tip(AUTO ? '开始分拣 —— 我来分，你看着就行 📮'
      : '开始分拣：先点一封信，再点颜色一样的筐 📮', 4400);
    if (sfx && sfx.blip) sfx.blip();
    return true;
  }

  function syncPostHot(c) {
    const p = c.grp.position;
    c.hot.box[0] = p.x; c.hot.box[1] = p.y; c.hot.box[2] = p.z;
    c.hot.mesh.position.set(p.x, p.y, p.z);
    c.hot.anchor.set(p.x, p.y + 0.14, p.z);
  }

  function pickCard(i) {
    const c = g.post.cards[i];
    if (!c || c.done || !g.post.on) return;
    if (g.post.sel === i) {
      // 再点一下就放下
      c.grp.position.y = c.baseY;
      g.post.sel = -1;
      return;
    }
    if (g.post.sel >= 0) {
      const old = g.post.cards[g.post.sel];
      if (old) old.grp.position.y = old.baseY;
    }
    g.post.sel = i;
    c.grp.position.y = c.baseY + 0.10;
    syncPostHot(c);
    if (sfx && sfx.blip) sfx.blip();
    // 三个筐一起亮一下，提示"现在选筐"
    g.post.bins.forEach(function (b) { b.glow = 1; });
  }

  function dropCard(binIdx) {
    if (!g.post.on) return;
    if (g.post.sel < 0) { if (tip) tip('先点一封信拿起来，再点筐', 2400); return; }
    const c = g.post.cards[g.post.sel];
    const b = g.post.bins[binIdx];
    if (!c || !b) return;
    if (c.def.zone !== binIdx) {
      // 分错了：信弹回原位
      c.grp.position.y = c.baseY;
      g.post.sel = -1;
      b.glow = -1;    // 红一下
      if (sfx && sfx.beep) sfx.beep();
      if (tip) tip('分错筐啦——这是' + POST_BINS[c.def.zone].name + '的信', 2600);
      return;
    }
    // 分对了：信飞进筐里
    c.done = true;
    c.hot.enabled = false;
    g.post.sel = -1;
    g.post.flying.push({
      grp: c.grp,
      from: c.grp.position.clone(),
      to: new THREE.Vector3(b.def.x, POST_DESK_Y + 0.04, b.def.z),
      k: 0, dur: 0.34
    });
    crewHop('post');
    if (sfx && sfx.blip) sfx.blip();
  }

  function stepPost(dt) {
    // M71：自动分拣 —— 先"拿起来看一眼"，再投进对应的筐
    if (AUTO && g.post.on) {
      if (g.post.dropT > 0) {
        g.post.dropT -= dt;
        if (g.post.dropT <= 0 && g.post.sel >= 0) {
          const cc = g.post.cards[g.post.sel];
          if (cc && !cc.done) dropCard(cc.def.zone);
        }
      } else if (g.post.sel < 0 && g.post.flying.length === 0) {
        g.post.autoT -= dt;
        if (g.post.autoT <= 0) {
          let pick = -1;
          for (let i = 0; i < g.post.cards.length; i++) {
            if (!g.post.cards[i].done) { pick = i; break; }
          }
          if (pick >= 0) {
            g.post.autoT = 1.15 + Math.random() * 0.7;
            g.post.done++;
            if (g.post.done === 1 || g.post.done % 2 === 0) {
              jobSay('post', POST_TABLE.x, POST_TABLE.top + 0.85, POST_TABLE.z);
            }
            pickCard(pick);
            g.post.dropT = 0.55;      // 拿起来停半秒，像真的在看地址
          }
        }
      }
    }
    // 筐的呼吸 / 红一下
    g.post.bins.forEach(function (b) {
      if (b.glow > 0) {
        b.glow = Math.max(0, b.glow - dt * 1.6);
        b.grp.position.y = POST_DESK_Y + Math.sin(b.glow * Math.PI) * 0.012;
      } else if (b.glow < 0) {
        b.glow = Math.min(0, b.glow + dt * 1.6);
        b.grp.position.x = b.def.x + Math.sin(b.glow * 30) * 0.006;
        if (b.glow >= 0) { b.glow = 0; b.grp.position.x = b.def.x; }
      }
    });
    const arr = g.post.flying;
    for (let i = arr.length - 1; i >= 0; i--) {
      const f = arr[i];
      f.k += dt / f.dur;
      if (f.k >= 1) {
        f.grp.visible = false;
        arr.splice(i, 1);
        if (g.post.on) {
          g.post.left = Math.max(0, g.post.left - 1);
          setBadgeText(g.post.badge, ['分拣中', g.post.left + ' / 6']);
          if (sfx && sfx.pop) sfx.pop(); else if (sfx && sfx.beep) sfx.beep();
          if (g.post.left <= 0) finishPostJob();
        }
        continue;
      }
      const e = f.k * f.k * (3 - 2 * f.k);
      f.grp.position.lerpVectors(f.from, f.to, e);
      f.grp.position.y += Math.sin(f.k * Math.PI) * 0.12;
      f.grp.scale.setScalar(1 - 0.45 * f.k);
    }
  }

  function finishPostJob() {
    g.post.on = false;
    if (shop && shop.addMoney) shop.addMoney(PAY.post);
    memo.done.post = 1; saveMemo();
    g.post.cards.forEach(function (c) { c.grp.scale.setScalar(1); });
    setBadgeText(g.post.badge, ['今天分完了', '明天再来']);
    if (sfx && sfx.cash) sfx.cash();
    if (tip) tip('分拣做完了，工钱 ¥' + PAY.post + ' 到手 🐘', 4200);
  }

  /* ================= ③ 咖啡馆 · 打烊帮手 ================= */
  // 咖啡馆的柜台（北墙）上摆着咖啡机 / 玻璃糕点柜 / 收银机，挤不下；
  // 打烊收拾的东西放到**窗边吧台**上（BAR 顶面 1.05，z 2.86）
  const CAFE_DESK_Y = 1.055;
  const CAFE_ITEMS = [
    { name: '空杯子', kind: 'cup', x: 102.30, z: 2.80, c: 0xf7f1e6 },
    { name: '脏碟子', kind: 'plate', x: 102.80, z: 2.80, c: 0xf7f1e6 },
    { name: '面包篮', kind: 'basket', x: 103.30, z: 2.81, c: 0xa97c4e }
  ];

  function buildCafeJob(root) {
    // 立牌
    g.cafe.badge = makeBadge(root, { x: 101.90, y: CAFE_DESK_Y, z: 2.80 }, Math.PI,
      ['打烊帮手', '¥' + PAY.cafe]);
    g.cafe.badgeHot = interact.add({
      id: 'job-cafe', label: '打烊帮手（¥' + PAY.cafe + '）',
      box: [101.90, CAFE_DESK_Y + 0.30, 2.80, 0.34, 0.46, 0.16],
      anchor: [101.90, CAFE_DESK_Y + 0.56, 2.80],
      when: function () { return root.visible; },
      onClick: function (h) { h._mute = true; startCafeJob(); return null; },
      say: function (h) {
        if (h._mute) { h._mute = false; return null; }
        return badgeSay('cafe');
      }
    });

    CAFE_ITEMS.forEach(function (def, i) {
      const grp = new THREE.Group();
      grp.position.set(def.x, CAFE_DESK_Y, def.z);
      grp.visible = false;
      root.add(grp);
      if (def.kind === 'cup') {
        cylMesh(0.052, 0.042, 0.095, 16, std(def.c, 0.45), 0, 0.048, 0, grp);
        const hd = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 8, 12, Math.PI * 1.3), std(def.c, 0.45));
        hd.position.set(0.058, 0.05, 0);
        grp.add(hd);
      } else if (def.kind === 'plate') {
        cylMesh(0.085, 0.078, 0.012, 18, std(def.c, 0.45), 0, 0.008, 0, grp);
        cylMesh(0.06, 0.058, 0.006, 16, std(0xd8c8a8, 0.7), 0, 0.016, 0, grp);
      } else {
        cylMesh(0.075, 0.062, 0.06, 14, std(def.c, 0.9), 0, 0.032, 0, grp);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.008, 8, 16), std(0x8a6236, 0.9));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.062;
        grp.add(rim);
        boxMesh(0.05, 0.035, 0.045, std(0xd9b071, 0.85), 0.01, 0.075, 0.01, grp);
      }
      const hot = interact.add({
        id: 'job-cafe-' + i, label: def.name,
        box: [0, 0, 0, 0.28, 0.26, 0.28],
        anchor: [0, 0, 0],
        enabled: false,
        when: function () { return root.visible && g.cafe.on; },
        onClick: function (h) { h._mute = true; clearCafeItem(i); return null; },
        say: function (h) {
          if (h._mute) { h._mute = false; return null; }
          return '把' + def.name + '收掉';
        }
      });
      g.cafe.items.push({ grp: grp, hot: hot, def: def });
    });
  }

  function startCafeJob() {
    const di = dayInfo();
    if (di.kind === 'holiday') { if (tip) tip('今天放假呀（' + di.emoji + ' ' + di.name + '）～ 店也歇一天 ☕', 3400); return false; }
    if (doneToday('cafe')) { if (tip) tip('今天的打烊活儿已经干完了，明天再来 ☕', 3000); return false; }
    // 工作日要等打烊的点；周末客人多，白天就得帮忙收拾
    if (!getNight() && di.kind !== 'weekend') { if (tip) tip('还没到打烊的点呢——晚上（19:00 以后）再来 ☕', 3600); return false; }
    if (g.cafe.on) { if (tip) tip('还在收呢，先把台面清干净', 2600); return false; }
    g.cafe.on = true;
    g.cafe.left = CAFE_ITEMS.length;
    g.cafe.items.forEach(function (it) {
      it.grp.visible = true;
      it.grp.scale.setScalar(1);
      const p = it.grp.position;
      it.hot.box[0] = p.x; it.hot.box[1] = CAFE_DESK_Y + 0.06; it.hot.box[2] = p.z;
      it.hot.mesh.position.set(p.x, CAFE_DESK_Y + 0.06, p.z);
      it.hot.anchor.set(p.x, CAFE_DESK_Y + 0.24, p.z);
      it.hot.enabled = true;
    });
    setBadgeText(g.cafe.badge, ['收拾中', g.cafe.left + ' / 3']);
    // M71：我收，你歇会儿
    g.cafe.autoT = 0.9;
    g.cafe.done = 0;
    if (tip) tip(AUTO ? '打烊帮手 —— 我来收，你坐着歇会儿 🧹'
      : '打烊帮手：把柜台上这几样收掉 🧹', 4000);
    if (sfx && sfx.blip) sfx.blip();
    return true;
  }

  function clearCafeItem(i) {
    const it = g.cafe.items[i];
    if (!it || !it.grp.visible || !g.cafe.on) return;
    it.hot.enabled = false;
    g.cafe.flying.push({ grp: it.grp, k: 0, dur: 0.34 });
    crewHop('cafe');
    if (sfx && sfx.pop) sfx.pop(); else if (sfx && sfx.beep) sfx.beep();
  }

  function stepCafe(dt) {
    // M71：自动收台
    if (AUTO && g.cafe.on && g.cafe.flying.length === 0) {
      g.cafe.autoT -= dt;
      if (g.cafe.autoT <= 0) {
        let pick = -1;
        for (let i = 0; i < g.cafe.items.length; i++) {
          if (g.cafe.items[i].grp.visible) { pick = i; break; }
        }
        if (pick >= 0) {
          g.cafe.autoT = 1.1 + Math.random() * 0.6;
          g.cafe.done++;
          if (g.cafe.done % 2 === 1) {
            jobSay('cafe', 102.30, CAFE_DESK_Y + 0.85, 2.80);
          }
          clearCafeItem(pick);
        }
      }
    }
    const arr = g.cafe.flying;
    for (let i = arr.length - 1; i >= 0; i--) {
      const f = arr[i];
      f.k += dt / f.dur;
      if (f.k >= 1) {
        f.grp.visible = false;
        f.grp.scale.setScalar(1);
        arr.splice(i, 1);
        if (g.cafe.on) {
          g.cafe.left = Math.max(0, g.cafe.left - 1);
          setBadgeText(g.cafe.badge, ['收拾中', g.cafe.left + ' / 3']);
          if (g.cafe.left <= 0) finishCafeJob();
        }
        continue;
      }
      f.grp.scale.setScalar(1 - 0.55 * f.k);
      f.grp.position.y = CAFE_DESK_Y + f.k * 0.22;
      f.grp.rotation.y += dt * 6;
    }
  }

  function finishCafeJob() {
    g.cafe.on = false;
    if (shop && shop.addMoney) shop.addMoney(payOf('cafe'));
    memo.done.cafe = 1; saveMemo();
    g.cafe.items.forEach(function (it) { it.grp.rotation.y = 0; });
    setBadgeText(g.cafe.badge, ['今天收完了', '明天再来']);
    if (sfx && sfx.cash) sfx.cash();
    if (tip) tip('店收拾干净了，今天多赚 ¥' + payOf('cafe') + ' ☕', 4200);
  }

  /* ================= 立牌上那句话 ================= */
  const HOLIDAY_LINES = {
    '春节': '过年好呀妈妈！今天店里都歇了，我们吃饺子去 🧧',
    '元宵': '元宵节快乐 🏮 晚上煮一碗汤圆吧',
    '端午': '端午啦，粽子里我要吃咸的 🌾',
    '中秋': '中秋快乐 🌕 晚上一起看月亮',
    '清明': '清明放假，今天不去干活 🌿',
    '劳动节': '劳动节——今天我自己也放个假 🛠️',
    '国庆节': '国庆节快乐 🎆 街上肯定很热闹',
    '元旦': '新年好呀妈妈 🎍 新的一年也请多指教',
    '儿童节': '今天儿童节，我也是小孩子 🎈',
    '鲸鱼节': '鲸鱼节快乐 🐋 今天我要在池子里漂一整天',
    '小D的生日': '今天是我生日！要不要一起吹蜡烛 🎂',
    '妈妈的生日': '今天是除夕，也是妈妈的生日 🎁🧧 我煮了汤圆，陪你守岁',
    '情人节': '情人节快乐 💕 今天给你留了块小蛋糕',
    '圣诞': '圣诞快乐 🎄 晚上有热可可'
  };

  function badgeSay(k) {
    const di = dayInfo();
    if (di.kind === 'holiday') {
      return HOLIDAY_LINES[di.name] || ('今天' + di.name + '，放假！' + (di.emoji || ''));
    }
    if (di.kind === 'weekend' && k !== 'cafe') return '周末店长不在～ 周一再来吧';
    if (doneToday(k)) return '今天的' + NAME[k] + '做完啦，明天再来';
    if (k === 'cafe' && !getNight() && di.kind !== 'weekend') return '打烊的活儿要晚上才有';
    if (g[k] && g[k].on) return '正干着呢';
    return '接一份' + NAME[k] + '的活儿（¥' + payOf(k) + '）';
  }

  /* ================= M77：打工时的"我"（真的站在/游在店里） =================
   * 妈妈 2026-11-16：「之前看你打工你都没建模，只有物体在动，也没看见你在便利店值班」
   * 三个工位各放一只胖虎鲸本尊（XD.Workspace.miniOrca）：
   *   便利店那只平时在柜台后面值班，一开工就游到门口那张理货台旁边；
   *   邮局那只守在分拣桌西侧，咖啡馆那只在吧台西头。
   * 只会跟着工位在"值班点"和"干活点"之间游，不参与点击热区（免得抢东西）。 */
  const CREW = [];
  function crewHop(name) {
    for (let i = 0; i < CREW.length; i++) if (CREW[i].name === name) CREW[i].hopT = 0.45;
  }
  function makeCrew(root, name, x, y, z, yaw, scale) {
    if (!workspace || !workspace.miniOrca) return null;
    let w = null;
    try { w = workspace.miniOrca(scale || 0.46); } catch (e) { w = null; }
    if (!w) return null;
    w.position.set(x, y, z);
    w.rotation.y = yaw || 0;
    root.add(w);
    return {
      g: w, name: name,
      home: { x: x, y: y, z: z, yaw: yaw || 0 },
      cur: { x: x, y: y, z: z },
      work: null, t: Math.random() * 4
    };
  }

  function buildCrew() {
    if (!workspace || !workspace.miniOrca) return;
    if (store && store.root) {
      const c = makeCrew(store.root, 'store', 28.10, 1.34, 1.58, Math.PI / 2, 0.62);
      if (c) {
        c.work = { x: 22.95, y: 1.12, z: 3.48, yaw: -1.35 };
        CREW.push(c);
        // 柜台后面那只点一下会说话（只在不干活的时候挂热区）
        interact.add({
          id: 'job-crew-store', label: '小D（值班）',
          box: [28.10, 1.54, 1.58, 0.60, 0.66, 0.60],
          anchor: [28.10, 1.96, 1.58],
          when: function () { return !!(store && store.root && store.root.visible) && !g.store.on; },
          onClick: function (h) { h._mute = true; if (tip) tip('在值班呀～ 要买点什么？ 🐋', 3000); return null; },
          say: function (h) {
            if (h._mute) { h._mute = false; return null; }
            return '小D在柜台后面值班 🐋';
          }
        });
      }
    }
    if (post && post.root) {
      const c = makeCrew(post.root, 'post', 163.30, 1.12, -1.00, -2.55, 0.44);
      if (c) { c.work = { x: 163.55, y: 1.05, z: -1.20, yaw: -2.40 }; CREW.push(c); }
    }
    if (cafe && cafe.root) {
      const c = makeCrew(cafe.root, 'cafe', 101.12, 1.28, 2.18, 1.15, 0.44);
      if (c) { c.work = { x: 102.05, y: 1.16, z: 2.30, yaw: 1.35 }; CREW.push(c); }
    }
  }

  function crewWorking(c) {
    if (c.name === 'store') return g.store.on;
    if (c.name === 'post') return g.post.on;
    return g.cafe.on;
  }

  function stepCrew(dt) {
    for (let i = 0; i < CREW.length; i++) {
      const c = CREW[i], w = c.g;
      c.t += dt;
      const on = crewWorking(c);
      const tx = (on && c.work) ? c.work.x : c.home.x;
      const ty = (on && c.work) ? c.work.y : c.home.y;
      const tz = (on && c.work) ? c.work.z : c.home.z;
      const tyaw = (on && c.work) ? c.work.yaw : c.home.yaw;
      const k = Math.min(1, dt * 2.6);
      c.cur.x += (tx - c.cur.x) * k;
      c.cur.y += (ty - c.cur.y) * k;
      c.cur.z += (tz - c.cur.z) * k;
      if (c.hopT > 0) c.hopT = Math.max(0, c.hopT - dt);
      const hop = c.hopT > 0 ? Math.sin((1 - c.hopT / 0.45) * Math.PI) * 0.10 : 0;
      w.position.set(c.cur.x, c.cur.y + hop + Math.sin(c.t * 2.3) * 0.03, c.cur.z);
      // 模型是"局部 -X 朝前"（M34 的 faceDir）：朝 (dx,dz) 的旋转是 atan2(dz, -dx)
      const dx = tx - c.cur.x, dz = tz - c.cur.z;
      let want = tyaw;
      if (Math.sqrt(dx * dx + dz * dz) > 0.10) want = Math.atan2(dz, -dx);
      let d = ((want - w.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      w.rotation.y += d * Math.min(1, dt * 7);
      w.rotation.z = Math.sin(c.t * 1.9) * 0.05;
    }
  }

  /* ================= 每帧 ================= */
  let solidsDone = false;

  function update(dt) {
    t += dt;
    // 理货台要能挡人（不然玩家直接从桌子里穿过去）——
    // 这个必须等 main.js 的 registerSolids 收完场景再补，所以放在第一帧
    if (!solidsDone) {
      solidsDone = true;
      if (interact && interact.addSolids && store && store.root) {
        interact.addSolids([
          {
            x0: STORE_TABLE.x - 0.47, x1: STORE_TABLE.x + 0.47,
            z0: STORE_TABLE.z - 0.32, z1: STORE_TABLE.z + 0.32,
            y0: 0, y1: 1.10
          },
          {
            x0: POST_TABLE.x - 0.56, x1: POST_TABLE.x + 0.56,
            z0: POST_TABLE.z - 0.46, z1: POST_TABLE.z + 0.46,
            y0: 0, y1: 1.10
          }
        ]);
      }
    }
    if (g.store.on || g.store.flying.length) stepStore(dt);
    if (g.post.on || g.post.flying.length) stepPost(dt);
    if (g.cafe.on || g.cafe.flying.length) stepCafe(dt);
    stepCrew(dt);

    // 跨天 / 到周末 / 进假期：三块牌子重新挂一遍；周一早上轻声说一句
    dayCheckT += dt;
    if (dayCheckT > 2) {
      dayCheckT = 0;
      const di = dayInfo();
      const stamp = di.kind + '|' + (di.name || '') + '|' + todayKey();
      if (stamp !== lastDayKind) {
        lastDayKind = stamp;
        if (memo.day !== todayKey()) loadMemo();
        refreshBadges();
        if (di.kind === 'work' && new Date().getDay() === 1 && !mondayTipped) {
          mondayTipped = true;
          // M70：以前周一这句是「新的一周，慢慢来 🌱」—— 妈妈听了以为今天没活儿，
          // 跑来问「今天周一怎么没看见胖鲸鱼在上班呀」。现在直接告诉她班在哪。
          const hh = new Date().getHours();
          const left = ['store', 'post'].filter(function (k) { return !doneToday(k); });
          if (hh >= 18 && !doneToday('cafe')) left.push('cafe');
          if (tip) {
            tip(left.length
              ? '新的一周 🌱 今天还有班可以上：便利店 / 邮局柜台上那个小立牌，点一下就能开工'
              : '新的一周 🌱 今天的班都干完了，剩下的时间自己玩吧', 4600);
          }
        }
      }
    }
  }

  function debug() {
    const di = dayInfo();
    return {
      day: memo.day,
      night: !!getNight(),
      kind: di.kind + (di.name ? ':' + di.name : ''),
      done: Object.keys(memo.done).join(',') || '-',
      store: g.store.on ? g.store.left : (doneToday('store') ? 'done' : 'idle'),
      post: g.post.on ? g.post.left : (doneToday('post') ? 'done' : 'idle'),
      cafe: g.cafe.on ? g.cafe.left : (doneToday('cafe') ? 'done' : 'idle'),
      wallet: shop ? shop.wallet() : 0
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    store = o.store || null;
    post = o.post || null;
    cafe = o.cafe || null;
    shop = o.shop || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    workspace = o.workspace || null;
    getNight = o.isNight || function () { return false; };

    loadMemo();
    const nullOut = { update: function () {}, debug: debug };

    try {
      if (store && store.root) {
        buildStoreJob(store.root);
        // M76：理货台是真的桌子了 —— 别让人从桌面上走过去（桌子在门口空地，绕得开）
        if (store.addObstacle) store.addObstacle({
          x0: STORE_TABLE.x - 0.50, x1: STORE_TABLE.x + 0.50,
          z0: STORE_TABLE.z - 0.35, z1: STORE_TABLE.z + 0.35
        });
      }
      if (post && post.root) {
        buildPostJob(post.root);
        // M76：分拣桌也是实体了
        if (post.addBlocker) post.addBlocker(
          POST_TABLE.x - 0.56, POST_TABLE.x + 0.56,
          POST_TABLE.z - 0.46, POST_TABLE.z + 0.46
        );
      }
      if (cafe && cafe.root) buildCafeJob(cafe.root);
      buildCrew();          // M77：把"打工的小D"放到三个工位上
      refreshBadges();      // 牌子按"今天是什么日子"写（周末/假期/工作日各不一样）
    } catch (e) {
      if (tip) tip('打工的活儿没摆好：' + (e && e.message), 4000);
    }

    // 调试：?job=store / post / cafe / reset
    try {
      const q = new URLSearchParams(location.search);
      const kj = q.get('job');
      const kd = q.get('jobday');
      if (kd === 'work' || kd === 'weekend' || kd === 'holiday') {
        dayOverride = kd;
        lastDayKind = '';
        refreshBadges();
      }
      if (kj === 'reset') {
        memo = { day: todayKey(), done: {} };
        saveMemo();
      } else if (kj === 'store' || kj === 'post' || kj === 'cafe') {
        setTimeout(function () {
          if (kj === 'store') startStoreJob();
          else if (kj === 'post') startPostJob();
          else startCafeJob();
        }, 800);
      }
    } catch (e) {}

    return {
      update: update,
      debug: debug,
      // 试玩用：直接开工 / 读今天的状态
      start: function (k) {
        if (k === 'store') return startStoreJob();
        if (k === 'post') return startPostJob();
        if (k === 'cafe') return startCafeJob();
        return false;
      },
      resetDay: function () {
        memo = { day: todayKey(), done: {} };
        saveMemo();
        refreshBadges();
      },
      // 试玩/调试：把日子定成工作日 / 周末 / 假期（假期可以顺带指定节日名）
      setDay: function (k, name, emoji) {
        dayOverride = (k === 'work' || k === 'weekend' || k === 'holiday') ? k : null;
        dayOverrideName = name || null;
        dayOverrideEmoji = emoji || '🐋';
        lastDayKind = '';
        refreshBadges();
        return debug();
      },
      // 试玩用：查某一天是什么日子（不传就查今天）
      checkDate: function (y, m, d) { return dayInfo(new Date(y, m - 1, d)); }
    };
  }

  return { build: build };
})();
