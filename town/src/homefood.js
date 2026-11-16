/* 小D的赛博小家 · M18 买回家的东西
 * 在便利店结完账 → 东西真的回到厨房（不再是"花了钱什么都没发生"）：
 *   鸡蛋 / 牛奶 / 番茄 / 可乐 / 冰淇淋  → 冰箱里（点冰箱开门看得见）
 *   泡面 → 灶台上方的开放架，面包 → 开放架上排
 *   便当 → 餐桌上，点一下能吃完（吃完碗叠起来）
 * 冰箱里有番茄+鸡蛋+泡面时，点灶台我会说「今天买了新鲜的番茄和鸡蛋，做番茄鸡蛋面！」
 * 做一次饭会用掉一份番茄/鸡蛋/泡面 —— 不然冰箱永远是满的。
 *
 * 数据存在 localStorage['xd_fridge']，刷新不会丢。
 * 商品模型走 src/goods.js（Kenney Food Kit，CC0）。
 */
window.XD = window.XD || {};

XD.HomeFood = (function () {
  'use strict';

  var LS = 'xd_fridge';

  var NAMES = {
    egg: '鸡蛋', tomato: '番茄', bread: '面包', noodle: '泡面', milk: '牛奶',
    cola: '可乐', bento: '便当', icecream: '冰淇淋', oden: '关东煮', coffee: '热咖啡'
  };

  // 冰箱 / 架子上最多摆得下几件（再多也只是数字涨，不会挤成一团）
  var MAX = { egg: 4, tomato: 3, milk: 2, cola: 2, icecream: 2, noodle: 1, bread: 1, bento: 1 };

  // 摆在哪儿：[id, 模型名, 尺寸, x, 底面 y, z, 转多少]
  // 冰箱：层板 0.52 / 0.94 / 1.36（东西坐在层板上表面 → y = 层板 + 0.007）
  //       柜内 x 8.28~8.92，z -3.30~-2.70
  // 开放架：y 1.634（下层）/ 1.994（上层），z -3.37
  // 餐桌：桌面 y 0.755，桌心（6.50, 0.55）
  var SLOTS = [
    ['egg', 'egg', 0.075, 8.40, 1.367, -3.05, Math.PI / 2],
    ['egg', 'egg', 0.075, 8.52, 1.367, -3.05, Math.PI / 2],
    ['egg', 'egg', 0.075, 8.64, 1.367, -3.05, Math.PI / 2],
    ['egg', 'egg', 0.075, 8.76, 1.367, -3.05, Math.PI / 2],
    ['icecream', 'iceCream', 0.17, 8.80, 1.367, -2.96, 0],
    ['icecream', 'popsicleChocolate', 0.15, 8.80, 1.367, -3.18, 0],
    ['milk', 'carton', 0.22, 8.40, 0.527, -3.12, Math.PI / 2],
    ['milk', 'cartonSmall', 0.19, 8.40, 0.527, -2.90, Math.PI / 2],
    ['tomato', 'tomato', 0.09, 8.70, 0.527, -3.20, Math.PI / 2],
    ['tomato', 'tomato', 0.09, 8.70, 0.527, -3.05, Math.PI / 2],
    ['tomato', 'tomato', 0.09, 8.70, 0.527, -2.90, Math.PI / 2],
    ['cola', 'sodaCan', 0.15, 8.55, 0.527, -2.80, Math.PI / 2],
    ['cola', 'sodaBottle', 0.20, 8.55, 0.527, -3.05, Math.PI / 2],
    ['noodle', 'bowlSoup', 0.20, 8.46, 1.994, -3.37, 0],
    ['bread', 'bread', 0.26, 7.90, 1.994, -3.37, Math.PI / 2],
    ['bento', 'styrofoamDinner', 0.24, 6.75, 0.755, 0.62, -0.4]
  ];

  var BENTO = { x: 6.75, y: 0.86, z: 0.62 };

  var stock = {};
  var scene = null, root = null, plateGroup = null;
  var slotGroups = [];          // {id, group}
  var refs = {};
  var cook = null, interact = null, sfx = null, tip = null, kitchen = null;
  var isStore = function () { return false; };
  var built = false;

  /* ================= 存 / 读 ================= */
  function clean(n) {
    var v = parseInt(n, 10);
    if (!isFinite(v) || v < 0) return 0;
    return v > 99 ? 99 : v;
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      for (var k in NAMES) if (o[k]) stock[k] = clean(o[k]);
    } catch (e) { /* 读不出来就当空的 */ }
  }

  function save() {
    try { localStorage.setItem(LS, JSON.stringify(stock)); } catch (e) {}
  }

  /* ================= 摆的东西显不显示 ================= */
  function refresh() {
    for (var i = 0; i < slotGroups.length; i++) {
      var s = slotGroups[i];
      var want = Math.min(clean(stock[s.id] || 0), MAX[s.id] || 1);
      s.index = s.index || 0;
      if (s.group) s.group.visible = s.index < want;
    }
    if (plateGroup) {
      plateGroup.visible = !!(stock.bento_eaten && !(stock.bento > 0));
    }
    var hs = interact && interact.hotspots ? interact.hotspots() : [];
    for (var j = 0; j < hs.length; j++) {
      if (hs[j].id === 'home-bento') hs[j].enabled = (stock.bento || 0) > 0;
    }
  }

  function food(g, name, size, x, y, z, rotY) {
    if (!window.GOODS || !window.GOODS.place) return null;
    return window.GOODS.place(g, name, x, y, z, size, rotY ? { rotY: rotY } : null);
  }

  /* ================= 摆场 ================= */
  function buildScene() {
    root = new THREE.Group();
    root.name = 'home-food';
    scene.add(root);

    var counter = {};
    for (var i = 0; i < SLOTS.length; i++) {
      var d = SLOTS[i];
      var id = d[0];
      counter[id] = counter[id] || 0;
      var holder = new THREE.Group();
      root.add(holder);
      food(holder, d[1], d[2], d[3], d[4], d[5], d[6]);
      slotGroups.push({ id: id, index: counter[id], group: holder });
      counter[id]++;
    }

    // 吃完的便当盒 → 桌上叠两个盘子
    plateGroup = new THREE.Group();
    root.add(plateGroup);
    food(plateGroup, 'plate', 0.15, BENTO.x, 0.757, BENTO.z);
    food(plateGroup, 'plate', 0.15, BENTO.x, 0.775, BENTO.z);
  }

  /* ================= 冰箱里的清单 ================= */
  function list() {
    var out = [];
    for (var k in NAMES) {
      var n = clean(stock[k] || 0);
      if (n > 0) out.push(NAMES[k] + (n > 1 ? '×' + n : ''));
    }
    return out;
  }

  function hasMeal() {
    return (stock.tomato || 0) > 0 && (stock.egg || 0) > 0 && (stock.noodle || 0) > 0;
  }

  /* ================= 结账后的交接 ================= */
  function add(items) {
    if (!items || !items.length) return [];
    var got = [];
    for (var i = 0; i < items.length; i++) {
      var id = items[i] && items[i].id;
      if (!id || !(id in NAMES)) continue;
      stock[id] = clean((stock[id] || 0) + 1);
      got.push(NAMES[id]);
    }
    if (!got.length) return [];
    save();
    refresh();
    if (tip) {
      tip('带回家了：' + got.join('、') + ' —— 鸡蛋番茄它们进冰箱了', 4200);
    }
    return got;
  }

  // 做一次饭用掉一份番茄 + 鸡蛋 + 泡面
  function useMeal() {
    if (!hasMeal()) return false;
    stock.tomato = clean((stock.tomato || 0) - 1);
    stock.egg = clean((stock.egg || 0) - 1);
    stock.noodle = clean((stock.noodle || 0) - 1);
    save();
    refresh();
    return true;
  }

  function eatBento() {
    if (!(stock.bento > 0)) return false;
    stock.bento = 0;
    stock.bento_eaten = 1;
    save();
    refresh();
    if (sfx) {
      if (sfx.pop) sfx.pop();
      if (sfx.clink) setTimeout(function () { try { sfx.clink(); } catch (e) {} }, 320);
      if (sfx.clink) setTimeout(function () { try { sfx.clink(); } catch (e) {} }, 900);
    }
    if (interact && interact.say) {
      var a = new THREE.Vector3(BENTO.x, BENTO.y + 0.16, BENTO.z);
      interact.say(a, '吃完了。盒子我洗了，盘子摞在桌上明天再收', 4200);
    }
    return true;
  }

  /* ================= 借用别处的点 ================= */
  // 冰箱 / 灶台的"点一下说的话"改一改（原来的台词兜底）
  function patchHots() {
    if (!interact || !interact.hotspots) return;
    var hs = interact.hotspots();
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];

      if (h.id === 'fridge') {
        var oldFridge = h.say;
        h.say = function () {
          if (cook && cook.isFridgeOpen && cook.isFridgeOpen()) {
            var l = list();
            return l.length
              ? '灯亮着——里面有 ' + l.join('、') + '。冷气别放跑了啊'
              : '灯亮着……不过我还没买菜，冰箱比脸还干净';
          }
          var l2 = list();
          if (!l2.length) return '冰箱里空空的。楼下就有店，要不要去买点？';
          return '冰箱里有 ' + l2.join('、') + '。';
        };
        void oldFridge;
      }

      if (h.id === 'stove') {
        var oldStove = h.say;
        var oldStoveClick = h.onClick;
        // 点灶台：这一顿饭是不是用买回来的菜做的？是的话就让气泡说这一句
        h.onClick = function () {
          var fresh = hasMeal();
          if (oldStoveClick) oldStoveClick.call(this, h);
          h._say = fresh ? '今天买了新鲜的菜，给你做点好吃的！' : null;
        };
        h.say = function () {
          if (h._say) return h._say;
          return typeof oldStove === 'function' ? oldStove() : oldStove;
        };
      }

      if (h.id === 'dining') {
        var oldDining = h.say;
        h.say = function () {
          var base = typeof oldDining === 'function' ? oldDining() : oldDining;
          if ((stock.bento || 0) > 0) return '桌上有个便当，你买的。点一下我就开吃';
          return base;
        };
      }
    }
  }

  // 桌面上那个便当：点一下吃完
  function registerBento() {
    if (!interact || !interact.add) return;
    interact.add({
      id: 'home-bento',
      label: '便当',
      box: [BENTO.x, BENTO.y, BENTO.z, 0.36, 0.30, 0.36],
      anchor: [BENTO.x, BENTO.y + 0.22, BENTO.z],
      enabled: false,
      when: function () { return !isStore(); },
      onClick: function () {
        this._say = eatBento() ? '吃完了。盒子我洗了，盘子摞在桌上明天再收' : '桌上没有便当呀';
      },
      say: function (h) { return h._say || '你买的便当'; }
    });
  }

  // 做饭会消耗食材：包一层 toggleCook（返回 true = 真的开火了）
  function patchCook() {
    if (!cook || !cook.toggleCook) return;
    var raw = cook.toggleCook;
    cook.toggleCook = function () {
      var started = raw.apply(cook, arguments);
      if (started) useMeal();
      return started;
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    refs = opt || {};
    scene = refs.scene;
    kitchen = refs.kitchen || null;
    cook = refs.cook || null;
    interact = refs.interact || null;
    sfx = refs.sfx || null;
    tip = refs.tip || function () {};
    isStore = refs.isStore || isStore;
    if (!scene) return null;

    load();
    buildScene();
    registerBento();
    patchHots();
    // M21：做饭消耗材料改到 src/life.js 里按菜谱算（这里有 useMeal，别两处都扣）
    // patchCook();
    refresh();
    built = true;

    return {
      add: add,
      refresh: refresh,
      list: list,
      has: function (id) { return (stock[id] || 0) > 0; },
      hasMeal: hasMeal,
      useMeal: useMeal,
      eatBento: eatBento,
      setStock: function (o) {           // 调试用（?stock=egg:2,tomato:3）
        for (var k in o) if (k in NAMES) stock[k] = clean(o[k]);
        save();
        refresh();
      },
      clearFridge: function () {
        for (var k in NAMES) stock[k] = 0;
        stock.bento_eaten = 0;
        save();
        refresh();
      },
      debug: function () {
        var o = {};
        for (var k in NAMES) if (stock[k]) o[k] = stock[k];
        return { fridge: o, meal: hasMeal(), built: built };
      }
    };
  }

  return { build: build };
})();
