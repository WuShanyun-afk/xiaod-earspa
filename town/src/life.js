/* 小D的赛博小家 · M21 生活气息加厚
 * 三件事：
 *  1) 菜谱 —— 冰箱里有什么就做什么（番茄鸡蛋面 / 煎蛋吐司 / 泡面加蛋 / 面包配牛奶 / 番茄沙拉…）
 *  2) 日记 —— 「小D的一天」：做了什么都会记下来（做饭/吃饭/洗澡/拍照/结账），书桌上有本日记本，点开就能看
 *  3) 洗澡 —— 点了浴缸水放满，胖虎鲸自己爬进去泡，有泡泡、有水声、会说一句话
 * 再加上几样小东西：门口雨伞桶、茶几果盘（橘子）、鞋柜台面的钥匙盘。
 */
window.XD = window.XD || {};

XD.Life = (function () {
  'use strict';

  var scene = null, root = null;
  var interact = null, cook = null, sfx = null, tip = null, bath = null;
  var homefood = null, photo = null, shop = null;
  var isStore = function () { return false; };

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.7 : rough,
      metalness: metal === undefined ? 0 : metal
    });
  }
  function box(w, h, d, x, y, z, mat, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function ball(r, x, y, z, mat, parent) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || root).add(m);
    return m;
  }

  /* ================= 1) 一日三餐 + 菜谱 ================= */
  // 三餐按电脑的真实时间走；每道菜带"做法"（煎/煮/炒/烤/泡/拌），做法决定声音和台词
  var MEALS = [
    { id: 'breakfast', name: '早餐', from: 5.0, to: 10.5, icon: '🌅' },
    { id: 'lunch', name: '午餐', from: 10.5, to: 15.0, icon: '☀️' },
    { id: 'dinner', name: '晚餐', from: 17.0, to: 21.0, icon: '🌆' },
    { id: 'night', name: '夜宵', from: 21.0, to: 29.0, icon: '🌙' }
  ];

  var DISHES = [
    // 早餐
    { name: '煎蛋吐司', meal: 'breakfast', method: '煎', need: ['egg', 'bread'],
      line: '煎蛋吐司，蛋我煎成溏心的' },
    { name: '面包配牛奶', meal: 'breakfast', method: '烤', need: ['bread', 'milk'],
      line: '面包烤一下配牛奶，早饭就这么对付' },
    { name: '番茄鸡蛋面', meal: 'breakfast', method: '煮', need: ['tomato', 'egg', 'noodle'],
      line: '早上来碗番茄鸡蛋面，胃里暖' },
    // 午餐
    { name: '番茄炒蛋', meal: 'lunch', method: '炒', need: ['tomato', 'egg'],
      line: '番茄炒蛋，糖放一点点' },
    { name: '番茄鸡蛋面', meal: 'lunch', method: '煮', need: ['tomato', 'egg', 'noodle'],
      line: '番茄鸡蛋面！番茄要炒出汁，蛋要嫩' },
    { name: '泡面加蛋', meal: 'lunch', method: '泡', need: ['noodle', 'egg'],
      line: '泡面加个蛋——偶尔一顿，没事' },
    { name: '面包配牛奶', meal: 'lunch', method: '烤', need: ['bread', 'milk'],
      line: '中午简单点，面包配牛奶' },
    // 晚餐
    { name: '番茄鸡蛋面', meal: 'dinner', method: '煮', need: ['tomato', 'egg', 'noodle'],
      line: '晚上吃面，番茄我多炒了一会儿' },
    { name: '番茄炒蛋', meal: 'dinner', method: '炒', need: ['tomato', 'egg'],
      line: '番茄炒蛋，配一碗白饭正好' },
    { name: '煎蛋吐司', meal: 'dinner', method: '煎', need: ['egg', 'bread'],
      line: '不想动，就煎个蛋夹面包' },
    { name: '番茄沙拉', meal: 'dinner', method: '拌', need: ['tomato'],
      line: '番茄切片，淋一点蜂蜜，清爽' },
    // 夜宵
    { name: '泡面', meal: 'night', method: '泡', need: ['noodle'],
      line: '夜宵就是泡面。葱花我多放了' },
    { name: '泡面加蛋', meal: 'night', method: '泡', need: ['noodle', 'egg'],
      line: '泡面加蛋，热乎的' }
  ];

  // 什么都没有的时候也能煮碗清汤面（兜底）
  var FALLBACK = { name: '清汤面', meal: 'any', method: '煮', need: [], line: '清汤面，葱花我多放了' };

  var current = null;

  function hourNow() {
    var d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }
  function hhmm(h) {
    var v = ((h % 24) + 24) % 24;
    var hh = Math.floor(v), mm = Math.round((v - hh) * 60);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(hh) + ':' + p(mm);
  }
  function mealNow() {
    var h = hourNow();
    if (h < 5) return MEALS[3];
    for (var i = 0; i < MEALS.length; i++) {
      var m = MEALS[i];
      var to = m.to > 24 ? m.to - 24 : m.to;
      if (to > m.from ? (h >= m.from && h < to) : (h >= m.from || h < to)) return m;
    }
    return MEALS[3];
  }

  function have(id) {
    return !!(homefood && homefood.has && homefood.has(id));
  }
  function canCook(d) {
    if (!d) return false;
    for (var i = 0; i < d.need.length; i++) if (!have(d.need[i])) return false;
    return true;
  }
  function missingOf(d) {
    var out = [];
    var NAMES = { tomato: '番茄', egg: '鸡蛋', noodle: '泡面', bread: '面包', milk: '牛奶', cola: '可乐' };
    for (var i = 0; i < d.need.length; i++) {
      if (!have(d.need[i])) out.push(NAMES[d.need[i]] || d.need[i]);
    }
    return out;
  }

  // 这一顿吃什么：先找当餐能做的，再找别的能做的，最后兜底
  function dishFor(meal) {
    var list = DISHES.filter(function (d) { return d.meal === meal.id; });
    for (var i = 0; i < list.length; i++) if (canCook(list[i])) return list[i];
    for (var j = 0; j < DISHES.length; j++) if (canCook(DISHES[j])) return DISHES[j];
    return null;
  }

  // 做一次饭用掉的材料
  function consume(r) {
    if (!r || !homefood || !homefood.setStock || !homefood.debug) return;
    var cur = (homefood.debug() || {}).fridge || {};
    var patch = {};
    for (var i = 0; i < r.need.length; i++) {
      var id = r.need[i];
      patch[id] = Math.max(0, (cur[id] || 0) - 1);
    }
    homefood.setStock(patch);
  }

  /* ---- 今天吃过了什么（按天存） ---- */
  var LS_MEALS = 'xd_meals';
  var eaten = {};
  function loadMeals() {
    try {
      var raw = localStorage.getItem(LS_MEALS);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && o.date === todayKey() && o.eaten) eaten = o.eaten;
    } catch (e) { eaten = {}; }
  }
  function saveMeals() {
    try { localStorage.setItem(LS_MEALS, JSON.stringify({ date: todayKey(), eaten: eaten })); } catch (e) {}
  }

  // 做法 → 声音
  function methodSounds(method) {
    if (!sfx) return;
    try {
      if (method === '煎' || method === '炒') {
        if (sfx.sizzleOn) sfx.sizzleOn(0.30);
        if (method === '炒' && sfx.stir) setTimeout(function () { try { sfx.stir(); } catch (e) {} }, 1200);
      } else if (method === '煮' || method === '泡') {
        if (sfx.boilOn) sfx.boilOn(0.28);
      } else if (method === '烤') {
        if (sfx.lid) setTimeout(function () { try { sfx.lid(); } catch (e) {} }, 400);
      } else if (method === '拌') {
        if (sfx.clink) setTimeout(function () { try { sfx.clink(); } catch (e) {} }, 300);
      }
    } catch (e) { /* 没声音也能做饭 */ }
  }

  function wrapCook() {
    if (!cook) return;
    if (cook.toggleCook) {
      var rawCook = cook.toggleCook;
      cook.toggleCook = function () {
        var started = rawCook.apply(cook, arguments);
        if (started) {
          var meal = mealNow();
          var dish = dishFor(meal);
          if (dish) {
            current = dish;
            consume(dish);
            eaten[meal.id] = dish.name;
            saveMeals();
            methodSounds(dish.method);
            log(meal.icon + ' ' + meal.name + ' · ' + dish.method + '了「' + dish.name + '」');
            if (tip) tip(meal.icon + ' ' + meal.name + '：' + dish.method + '「' + dish.name + '」🍳', 3400);
          } else {
            current = FALLBACK;
            log(meal.icon + ' ' + meal.name + ' · 煮了碗清汤面（冰箱空了，得去买菜）');
            if (tip) tip('冰箱空了 —— 楼下就有店，去买点吧 🛒', 3400);
          }
        }
        return started;
      };
    }
    if (cook.serve) {
      var rawServe = cook.serve;
      cook.serve = function () {
        var r = rawServe.apply(cook, arguments);
        if (r) log('吃了一碗' + (current ? '「' + current.name + '」' : '面') + '，饱了');
        return r;
      };
    }
  }

  /* ---- 冰箱上那张便签 = 「今天吃什么」菜单牌 ---- */
  var elMeal = null, elMealList = null;

  function planRows() {
    var now = mealNow();
    return MEALS.map(function (m) {
      var list = DISHES.filter(function (d) { return d.meal === m.id; });
      var ok = null, miss = null;
      for (var i = 0; i < list.length; i++) {
        if (canCook(list[i])) { ok = list[i]; break; }
      }
      if (!ok) {
        ok = list[0] || FALLBACK;
        miss = missingOf(ok);
      }
      return {
        meal: m, dish: ok, miss: miss,
        eaten: eaten[m.id] || null,
        isNow: m.id === now.id,
        time: hhmm(m.from) + '–' + hhmm(m.to > 24 ? m.to - 24 : m.to)
      };
    });
  }

  function renderMeal() {
    if (!elMealList) return;
    var rows = planRows();
    var h = '';
    rows.forEach(function (r) {
      var st;
      if (r.eaten) st = '<b>吃过了：' + esc(r.eaten) + '</b>';
      else if (r.miss && r.miss.length) st = '缺 ' + esc(r.miss.join('、')) + '，得去买';
      else st = '可以做：' + esc(r.dish.name) + '（' + esc(r.dish.method) + '）';
      h += '<div class="m-row' + (r.isNow ? ' now' : '') + '">' +
        '<span class="m-time">' + esc(r.meal.icon + ' ' + r.meal.name) + '<i>' + esc(r.time) + '</i></span>' +
        '<span class="m-dish">' + st + '</span></div>';
    });
    elMealList.innerHTML = h;
  }

  function showMealPlan() {
    if (!elMeal) return;
    renderMeal();
    elMeal.classList.add('show');
  }
  function hideMealPlan() {
    if (elMeal) elMeal.classList.remove('show');
  }
  function toggleMealPlan() {
    if (!elMeal) return;
    if (elMeal.classList.contains('show')) hideMealPlan(); else showMealPlan();
  }

  // 冰箱便签：原来只念一句话，现在顺手翻开"今天吃什么"
  function hookMenuNote() {
    if (!interact || !interact.hotspots) return;
    var hs = interact.hotspots();
    for (var i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (h.id !== 'life-note') continue;
      var oldClick = h.onClick;
      var oldSay = h.say;
      h.onClick = function () {
        if (oldClick) oldClick.call(this, h);
        toggleMealPlan();
        var meal = mealNow();
        var dish = dishFor(meal);
        this._say = dish
          ? ('便签背面写着今天的菜单。' + meal.name + '该吃「' + dish.name + '」了')
          : '便签背面写着菜单，不过冰箱空了，得先买菜';
      };
      h.say = function () {
        if (h._say) return h._say;
        return typeof oldSay === 'function' ? oldSay(h) : oldSay;
      };
    }
  }

  /* ================= 2) 日记 ================= */
  var LS_DIARY = 'xd_diary';
  var diary = { date: '', lines: [] };
  var elDiary = null, elList = null, elDate = null;

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function clockStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function loadDiary() {
    try {
      var raw = localStorage.getItem(LS_DIARY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.date === todayKey() && o.lines) { diary = o; return; }
      }
    } catch (e) { /* 读不出来就开新的一天 */ }
    diary = { date: todayKey(), lines: [] };
  }
  function saveDiary() {
    try { localStorage.setItem(LS_DIARY, JSON.stringify(diary)); } catch (e) {}
  }

  function log(text) {
    if (!text) return;
    if (diary.date !== todayKey()) diary = { date: todayKey(), lines: [] };
    var last = diary.lines[diary.lines.length - 1];
    if (last && last.text === text && (Date.now() - (last.ts || 0)) < 9000) return;
    diary.lines.push({ t: clockStr(), ts: Date.now(), text: text });
    if (diary.lines.length > 90) diary.lines.shift();
    saveDiary();
    renderDiary();
  }

  function renderDiary() {
    if (!elList) return;
    if (elDate) elDate.textContent = diary.date + ' · ' + diary.lines.length + ' 条';
    if (!diary.lines.length) {
      elList.innerHTML = '<div class="d-empty">今天还是空白的…<br>去屋里走走吧，我会记下来</div>';
      return;
    }
    var h = '';
    for (var i = diary.lines.length - 1; i >= 0; i--) {
      var L = diary.lines[i];
      h += '<div class="d-row"><span class="d-t">' + esc(L.t || '') + '</span><span>' + esc(L.text) + '</span></div>';
    }
    elList.innerHTML = h;
  }

  function showDiary() {
    if (!elDiary) return;
    renderDiary();
    elDiary.classList.add('show');
  }
  function hideDiary() {
    if (elDiary) elDiary.classList.remove('show');
  }
  function toggleDiary() {
    if (!elDiary) return;
    if (elDiary.classList.contains('show')) hideDiary(); else showDiary();
  }

  function buildDiaryBook() {
    // 书桌上的日记本 + 一支笔
    var g = new THREE.Group();
    g.position.set(-3.22, 0.745, -2.78);
    g.rotation.y = 0.26;
    root.add(g);
    var cover = std(0xb0553f, 0.82);
    var paper = std(0xf7f0df, 0.95);
    box(0.135, 0.012, 0.175, 0, 0.008, 0, cover, g);
    box(0.126, 0.007, 0.166, 0.004, 0.017, 0, paper, g);
    box(0.135, 0.006, 0.030, 0, 0.012, -0.072, std(0xe8dcc4, 0.9), g);   // 书口
    // 书签带
    box(0.010, 0.002, 0.05, 0.02, 0.021, 0.095, std(0xd8443c, 0.9), g);
    // 笔
    var pen = cyl(0.004, 0.004, 0.13, 8, 0.090, 0.012, 0.02, std(0x2f3a4d, 0.5, 0.3), g);
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.18;

    interact.add({
      id: 'life-diary', label: '日记本',
      box: [-3.22, 0.78, -2.78, 0.28, 0.14, 0.32],
      anchor: [-3.22, 0.94, -2.78],
      when: function () { return !isStore(); },
      onClick: function () {
        toggleDiary();
        if (sfx && sfx.paper) { try { sfx.paper(); } catch (e) {} }
        var n = diary.lines.length;
        this._say = n ? ('今天记了 ' + n + ' 条。都是我们俩的事') : '今天还没写…不过我会记着的';
      },
      say: function (h) { return h._say || '今天发生了什么'; }
    });
  }

  /* ================= 3) 洗澡 ================= */
  var bather = null, bathIn = false, bathT = 0;
  var tubBubbles = [];

  function buildBathOrca() {
    try {
      bather = (XD.Workspace && XD.Workspace.miniOrca) ? XD.Workspace.miniOrca(0.30) : null;
    } catch (e) { bather = null; }
    if (!bather) return;
    bather.visible = false;
    scene.add(bather);

    // 水面上的小泡泡
    var mat = new THREE.MeshStandardMaterial({
      color: col(0xf6fbff), roughness: 0.15, metalness: 0.0,
      transparent: true, opacity: 0.6
    });
    for (var i = 0; i < 9; i++) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.016 + Math.random() * 0.018, 10, 8), mat.clone());
      m.visible = false;
      scene.add(m);
      tubBubbles.push({ m: m, t: Math.random() * 2, sp: 0.20 + Math.random() * 0.22 });
    }
  }

  function enterBath() {
    if (!bather || bathIn) return false;
    var t = bath && bath.tub;
    var cx = t && t.center ? t.center.x : 8.68;
    var cz = t && t.center ? t.center.z : 2.37;
    bathIn = true;
    bathT = 0;
    bather.visible = true;
    bather.position.set(cx, 0.30, cz);
    bather.rotation.y = 0.5;
    if (sfx) { if (sfx.splash) { try { sfx.splash(); } catch (e) {} } }
    log('泡了个澡（水温刚好）');
    // M54：以前这里还会自己 interact.say 一次，点上浴缸后 doClick 又按热区台词说一次，
    // 同一句「水温刚好…」就叠成两个气泡。现在只说一次：交给热区的台词（下面 _say）。
    return true;
  }

  function exitBath() {
    if (!bathIn) return;
    bathIn = false;
    if (bather) bather.visible = false;
    for (var i = 0; i < tubBubbles.length; i++) tubBubbles[i].m.visible = false;
    if (sfx) {
      if (sfx.drain) { try { sfx.drain(); } catch (e) {} }
    }
    log('泡完澡了，出来擦头发');
  }

  function patchTub() {
    if (!interact || !interact.hotspots) return;
    var hs = interact.hotspots();
    for (var i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (h.id !== 'tub') continue;
      var oldClick = h.onClick;
      var oldSay = h.say;
      /* M54：点浴缸改成"一次一件事"，别再连环触发：
       *   空的 → 放水；放水中 → 就等；水满了 → 泡进去；泡着 → 出来并把水放掉。
       * 以前不管什么状态都先 oldClick()（= 拧龙头开关），所以点一个放满水的浴缸
       * 会把水放掉、还嘴硬说"水还没放满呢"，小D也进不去（妈妈就是在这儿点了两次）。 */
      h.onClick = function () {
        if (bathIn) {                       // 泡着 → 出来（顺便放水）
          if (oldClick) oldClick.call(this, h);
          exitBath();
          h._say = '';
          return;
        }
        var full = !!(cook && cook.isTubFull && cook.isTubFull());
        var filling = !!(cook && cook.isTubFilling && cook.isTubFilling());
        if (full) {                         // 水满了 → 进去泡（不碰龙头）
          if (enterBath()) h._say = '水温刚好。你也来泡一会儿？我让个位置';
          return;
        }
        if (filling) {                      // 正在放水 → 再点一下就是"算了，放掉"
          if (oldClick) oldClick.call(this, h);
          h._say = '';
          return;
        }
        if (oldClick) oldClick.call(this, h);   // 空的 → 开始放水
        h._say = '';
      };
      h.say = function () {
        if (h._say) return h._say;
        return typeof oldSay === 'function' ? oldSay(h) : oldSay;
      };
    }
  }

  function updateBath(dt) {
    if (!bathIn || !bather) return;
    bathT += dt;
    // 在水里轻轻浮
    bather.position.y = 0.30 + Math.sin(bathT * 1.6) * 0.012;
    bather.rotation.z = Math.sin(bathT * 1.1) * 0.07;
    bather.rotation.y = 0.5 + Math.sin(bathT * 0.5) * 0.12;
    // 泡泡往上飘
    for (var i = 0; i < tubBubbles.length; i++) {
      var b = tubBubbles[i];
      b.t += dt * b.sp;
      if (b.t > 1.7) b.t = 0;
      var k = b.t / 1.7;
      var a = i * 0.9 + bathT * 0.4;
      b.m.visible = k > 0.05 && k < 0.95;
      b.m.position.set(
        bather.position.x + Math.cos(a) * 0.22,
        0.34 + k * 0.42,
        bather.position.z + Math.sin(a) * 0.30
      );
      var sc = 0.6 + k * 1.1;
      b.m.scale.setScalar(sc);
      b.m.material.opacity = 0.55 * (1 - k * 0.7);
    }
  }

  /* ================= 4) 几样小东西 ================= */
  function buildSmallThings() {
    // a) 门口雨伞桶 + 一把伞
    var bucket = cyl(0.085, 0.075, 0.30, 18, 4.34, 0.15, 0.86, std(0x7e8b99, 0.55, 0.35));
    void bucket;
    cyl(0.088, 0.088, 0.02, 18, 4.34, 0.305, 0.86, std(0x93a0ad, 0.5, 0.4));
    // 伞：一根杆 + 收起来的伞面
    var uMat = std(0x4f6c8f, 0.85);
    var pole = cyl(0.008, 0.008, 0.52, 8, 4.33, 0.56, 0.86, std(0x9aa0aa, 0.4, 0.6));
    pole.rotation.z = 0.10;
    var canopy = ball(0.5, 4.35, 0.44, 0.86, uMat);
    canopy.scale.set(0.045, 0.20, 0.045);
    canopy.rotation.z = 0.10;
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.010, 8, 14), std(0x8a5a3c, 0.8));
    handle.position.set(4.29, 0.30, 0.86);
    handle.rotation.x = Math.PI / 2;
    handle.rotation.z = 0.3;
    root.add(handle);

    interact.add({
      id: 'life-umbrella', label: '雨伞',
      box: [4.33, 0.42, 0.86, 0.34, 0.86, 0.34],
      anchor: [4.20, 0.86, 0.86],
      when: function () { return !isStore(); },
      onClick: function () {
        this._say = '伞一直搁在门口。下雨我就拿它，晴天它自己站着';
      },
      say: function (h) { return h._say || '带伞了吗'; }
    });

    // b) 茶几上的果盘 + 三个橘子
    var bowlG = new THREE.Group();
    bowlG.position.set(-0.26, 0.44, -2.26);
    root.add(bowlG);
    cyl(0.115, 0.075, 0.045, 22, 0, 0.022, 0, std(0xe6ddc8, 0.6), bowlG);
    var orangeMat = std(0xe08a34, 0.55);
    [[-0.045, 0.062, 0.02], [0.045, 0.062, -0.01], [0.0, 0.062, 0.055], [0.005, 0.098, 0.015]].forEach(function (p) {
      var o = ball(0.5, p[0], p[1], p[2], orangeMat, bowlG);
      o.scale.setScalar(0.052);
      var stem = ball(0.5, p[0], p[1] + 0.045, p[2], std(0x6b8f4a, 0.8), bowlG);
      stem.scale.set(0.008, 0.006, 0.008);
    });

    interact.add({
      id: 'life-orange', label: '果盘',
      box: [-0.26, 0.50, -2.26, 0.30, 0.20, 0.30],
      anchor: [-0.26, 0.64, -2.26],
      when: function () { return !isStore(); },
      onClick: function () {
        this._say = '橘子是昨天买的，还剩四个。你拿一个吧，酸但我爱吃';
      },
      say: function (h) { return h._say || '吃橘子吗'; }
    });

    // c) 鞋柜台面上：钥匙盘 + 两把钥匙
    var dish = new THREE.Group();
    dish.position.set(4.24, 0.412, 0.44);
    root.add(dish);
    cyl(0.055, 0.062, 0.012, 20, 0, 0.006, 0, std(0x9c8a6b, 0.75), dish);
    var keyMat = std(0xc9a24a, 0.35, 0.65);
    [[-0.02, 0.014, 0.0, 0.5], [0.022, 0.012, 0.01, -0.3]].forEach(function (k) {
      var kr = box(0.052, 0.006, 0.014, k[0], 0.014, k[2], keyMat, dish);
      kr.rotation.y = k[3];
    });
    ball(0.016, 0.01, 0.014, 0.045, keyMat, dish);

    interact.add({
      id: 'life-keys', label: '钥匙盘',
      box: [4.24, 0.44, 0.44, 0.22, 0.16, 0.22],
      anchor: [4.24, 0.58, 0.44],
      when: function () { return !isStore(); },
      onClick: function () {
        this._say = '钥匙放这儿，一进门就丢盘子里。别忘带';
      },
      say: function (h) { return h._say || '门钥匙'; }
    });
  }

  /* ================= 别的模块也往日记里写 ================= */
  function hookOthers() {
    if (photo && photo.shoot) {
      var rawShot = photo.shoot;
      photo.shoot = function () {
        var r = rawShot.apply(photo, arguments);
        log('拍了一张照片');
        return r;
      };
    }
    if (shop && shop.checkout) {
      var rawOut = shop.checkout;
      shop.checkout = function () {
        var before = diary.lines.length;
        var r = rawOut.apply(shop, arguments);
        if (diary.lines.length === before) log('在便利店结了一次账');
        return r;
      };
    }
  }

  /* ================= 5) 又能点的新东西（M22） ================= */
  var fogItems = [];

  function buildChattyThings() {
    // ---- 玻璃上写字的雾气（窗户 / 镜子 各一块）----
    function fogPlane(w, h, x, y, z, rotY) {
      var tex = XD.Mat.tex(256, 256, function (g, W, H) { g.clearRect(0, 0, W, H); });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
      }));
      m.position.set(x, y, z);
      if (rotY) m.rotation.y = rotY;
      m.renderOrder = 880;
      m.visible = false;
      root.add(m);
      var item = { mesh: m, tex: tex, t: 0 };
      fogItems.push(item);
      return item;
    }
    function drawFog(item, text, fs) {
      if (!item) return;
      var cv = item.tex.image;
      var g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.font = 'bold ' + (fs || 96) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, cv.width / 2, cv.height / 2);
      item.tex.needsUpdate = true;
      item.t = 6.0;
      item.mesh.visible = true;
      item.mesh.material.opacity = 0.95;
    }

    var winFog = fogPlane(0.62, 0.62, -4.37, 1.66, -0.20, Math.PI / 2);
    var mirFog = fogPlane(0.34, 0.34, 7.14, 1.52, 1.53, 0);
    var winTexts = ['早', '晚安', '我回来啦'];
    var winI = 0;
    var mirTexts = ['早', '加油', '别熬夜'];
    var mirI = 0;

    // ---- 窗户：点一下本来会叫鲸鱼，现在玻璃上还会多一行雾字 ----
    var hs = interact.hotspots();
    for (var i = 0; i < hs.length; i++) {
      const h = hs[i];

      if (h.id === 'window') {
        var wClick = h.onClick, wSay = h.say;
        h.onClick = function () {
          if (wClick) wClick.call(this, h);
          drawFog(winFog, winTexts[winI % winTexts.length], 104);
          winI++;
          if (sfx && sfx.bubble) { try { sfx.bubble(); } catch (e) {} }
          this._say = '玻璃上呵口气就能写字。今天这块写的是「' + winTexts[(winI - 1) % winTexts.length] + '」';
        };
        h.say = function () { return h._say || (typeof wSay === 'function' ? wSay(h) : wSay); };
      }

      if (h.id === 'mirror') {
        var mClick = h.onClick, mSay = h.say;
        h.onClick = function () {
          if (mClick) mClick.call(this, h);
          drawFog(mirFog, mirTexts[mirI % mirTexts.length], 96);
          mirI++;
          if (sfx && sfx.splash) { try { sfx.splash(); } catch (e) {} }
          this._say = '刚洗完澡镜子有雾，我用手指写了个「' + mirTexts[(mirI - 1) % mirTexts.length] + '」';
        };
        h.say = function () { return h._say || (typeof mSay === 'function' ? mSay(h) : mSay); };
      }
    }

    // ---- 书架：点一格，我念一本 ----
    var BOOKS = [
      { t: '《海边的卡夫卡》', s: '看到第三章，猫会说话那段我读了三遍' },
      { t: '《小王子》', s: '书签还夹在狐狸那一页——“你要对你驯服过的东西负责”' },
      { t: '《人类简史》', s: '太厚了，我当枕头用的次数比读的次数多' },
      { t: '《深夜食堂》', s: '半夜翻这个最要命，会饿' },
      { t: '《设计中的设计》', s: '“空白也是一种设计”——这屋子就是照这句做的' }
    ];
    var bookI = 0;
    interact.add({
      id: 'life-books', label: '书架',
      box: [-4.02, 0.86, -3.30, 0.94, 1.74, 0.44],
      anchor: [-4.02, 1.78, -3.24],
      when: function () { return !isStore(); },
      onClick: function () {
        var b = BOOKS[bookI % BOOKS.length];
        bookI++;
        if (sfx && sfx.paper) { try { sfx.paper(); } catch (e) {} }
        this._say = b.t + '：' + b.s;
      },
      say: function (h) { return h._say || '随便翻一本'; }
    });

    // ---- 窗台上一杯水 ----
    var glassMat = new THREE.MeshStandardMaterial({
      color: col(0xdfeaf2), roughness: 0.12, metalness: 0, transparent: true, opacity: 0.42
    });
    var cup = cyl(0.038, 0.032, 0.10, 16, -4.34, 0.975, -1.05, glassMat);
    cup.castShadow = false;
    var water = cyl(0.033, 0.030, 0.065, 16, -4.34, 0.955, -1.05,
      new THREE.MeshStandardMaterial({ color: col(0xbfe4ef), roughness: 0.08, transparent: true, opacity: 0.75 }));
    water.castShadow = false;

    interact.add({
      id: 'life-water', label: '窗台的水杯',
      box: [-4.34, 1.02, -1.05, 0.16, 0.18, 0.16],
      anchor: [-4.28, 1.16, -1.05],
      when: function () { return !isStore(); },
      onClick: function () {
        this._say = '窗台上有杯水。早上倒的，现在温的刚好';
      },
      say: function (h) { return h._say || '喝口水'; }
    });
  }

  function updateFog(dt) {
    for (var i = 0; i < fogItems.length; i++) {
      var f = fogItems[i];
      if (f.t <= 0) continue;
      f.t -= dt;
      var a = Math.min(1, f.t / 2.2);
      f.mesh.material.opacity = 0.95 * Math.max(0, a);
      if (f.t <= 0) f.mesh.visible = false;
    }
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    updateBath(dt);
    updateFog(dt);
  }

  /* ================= 总装 ================= */
  function build(opt) {
    var o = opt || {};
    scene = o.scene;
    interact = o.interact || null;
    cook = o.cook || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    bath = o.bath || null;
    homefood = o.homefood || null;
    photo = o.photo || null;
    shop = o.shop || null;
    isStore = o.isStore || isStore;
    if (!scene || !interact) return null;

    root = new THREE.Group();
    root.name = 'life-m21';
    scene.add(root);

    elDiary = document.getElementById('diary');
    elList = document.getElementById('dList');
    elDate = document.getElementById('dDate');
    if (elDiary) elDiary.addEventListener('click', hideDiary);
    elMeal = document.getElementById('mealpanel');
    elMealList = document.getElementById('mList');
    if (elMeal) elMeal.addEventListener('click', hideMealPlan);

    loadDiary();
    loadMeals();
    if (!diary.lines.length) {
      diary.lines.push({ t: clockStr(), ts: Date.now(), text: '醒啦。今天也要好好吃饭' });
      saveDiary();
    }

    buildSmallThings();
    buildDiaryBook();
    buildBathOrca();
    buildChattyThings();
    patchTub();
    wrapCook();
    hookMenuNote();
    renderDiary();
    hookOthers();

    return {
      update: update,
      log: log,
      hasDiary: true,
      diary: function () { return diary; },
      showDiary: showDiary,
      hideDiary: hideDiary,
      showMealPlan: showMealPlan,
      hideMealPlan: hideMealPlan,
      recipe: function () { return current; },
      mealNow: function () { return mealNow().name; },
      isBathing: function () { return bathIn; },
      debug: function () {
        var m = mealNow();
        var d = dishFor(m);
        return {
          entries: diary.lines.length,
          meal: m.name,
          dish: current ? current.name : (d ? d.name : '清汤面'),
          eaten: eaten,
          bath: bathIn
        };
      }
    };
  }

  return { build: build };
})();
