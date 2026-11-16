/* 小D的赛博小家 · M17 便利店购物
 * 点货架/冷柜/关东煮/咖啡机上的东西 → 飞进篮子（右上角面板）→ 点收银台结账 → 小票 + 扣钱
 * 零花钱存在 localStorage，一开始 ¥100。店里的猫、信箱也在这儿接互动。
 */
window.XD = window.XD || {};

XD.Shop = (function () {
  'use strict';

  const LS_WALLET = 'xd_wallet';
  const START_MONEY = 100;

  // 能买的十件东西（spot 对应 store.js 里的位置）
  const ITEMS = [
    { id: 'egg', name: '鸡蛋', price: 6, spot: 'shelfA', tip: '一盒鸡蛋，回去打两个炒' },
    { id: 'tomato', name: '番茄', price: 4, spot: 'shelfA2', tip: '番茄挑红的，这个不错' },
    { id: 'bread', name: '面包', price: 8, spot: 'shelfB', tip: '明天早上烤一下' },
    { id: 'noodle', name: '泡面', price: 5, spot: 'shelfB2', tip: '偶尔一顿，别老吃' },
    { id: 'milk', name: '牛奶', price: 7, spot: 'fridge', tip: '冷柜最里面那瓶，拿凉的' },
    { id: 'cola', name: '可乐', price: 4, spot: 'fridge2', tip: '冰的快乐水' },
    { id: 'oden', name: '关东煮', price: 5, spot: 'oden', eat: true, tip: '萝卜炖得真入味，汤也喝两口' },
    { id: 'bento', name: '便当', price: 12, spot: 'hotcase', tip: '还热着，回家微波一下正好' },
    { id: 'icecream', name: '冰淇淋', price: 6, spot: 'icecream', tip: '柜子里挑一支最喜欢的' },
    { id: 'coffee', name: '热咖啡', price: 6, spot: 'coffee', tip: '机器嗡一会儿，出来一小杯' }
  ];

  let interact = null, sfx = null, store = null, tip = null, say = null;
  let onCheckout = null;    // M18：结账后的交接（把东西带回家）
  let isStore = function () { return false; };
  let basket = [];          // [{id, name, price}]
  let wallet = START_MONEY;
  let built = false;

  /* ================= 零花钱 ================= */
  function loadWallet() {
    try {
      const v = localStorage.getItem(LS_WALLET);
      if (v !== null && v !== '') {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0) return n;
      }
    } catch (e) {}
    return START_MONEY;
  }
  function saveWallet() {
    try { localStorage.setItem(LS_WALLET, String(wallet)); } catch (e) {}
  }

  /* ================= 右上角面板 ================= */
  function refreshUI() {
    const c = document.getElementById('basketCount');
    const t = document.getElementById('basketTotal');
    const w = document.getElementById('wallet');
    const panel = document.getElementById('basket');
    let total = 0;
    for (let i = 0; i < basket.length; i++) total += basket[i].price;
    if (c) c.textContent = String(basket.length);
    if (t) t.textContent = '¥' + total;
    if (w) w.textContent = '¥' + wallet;
    if (panel) panel.style.display = (built && isStore()) ? 'block' : 'none';
  }

  /* ================= 买东西 ================= */
  function buy(item) {
    if (wallet < item.price) {
      if (sfx && sfx.beep) sfx.beep();
      tip('钱不太够啦…余额 ¥' + wallet + '，这个 ¥' + item.price, 3200);
      return '钱不够，先放回去吧';
    }
    if (basket.some(function (b) { return b.id === item.id; })) {
      tip('这个已经拿了一份啦', 2200);
      return '拿过了，一份就够';
    }
    wallet -= item.price;
    saveWallet();
    basket.push({ id: item.id, name: item.name, price: item.price });
    refreshUI();
    if (sfx && sfx.pickup) sfx.pickup();
    if (sfx && sfx.beep) setTimeout(function () { sfx.beep(); }, 220);
    if (item.eat) {
      // 关东煮：端起来就吃 —— 吸溜两口（在店里吃掉，不带回家）
      if (sfx && sfx.slurp) {
        setTimeout(function () { try { sfx.slurp(); } catch (e) {} }, 120);
        setTimeout(function () { try { sfx.slurp(); } catch (e) {} }, 640);
      }
      tip('热乎的' + item.name + '，就在店里吃掉了', 3200);
    }
    tip('拿了一份' + item.name + ' ¥' + item.price + '（篮子 ' + basket.length + ' 件）', 2600);
    return item.tip;
  }

  /* ================= 结账 ================= */
  function nowStr() {
    const d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function showReceipt(lines, total) {
    const el = document.getElementById('receipt');
    const inner = document.getElementById('receiptInner');
    if (!el || !inner) return;
    let html = '<div class="r-title">小D便利店</div>' +
      '<div class="r-sub">24H · 楼下街角</div>' +
      '<div class="r-time">' + nowStr() + '</div><div class="r-line"></div>';
    for (let i = 0; i < lines.length; i++) {
      html += '<div class="r-row"><span>' + lines[i].name + '</span><span>¥' + lines[i].price + '</span></div>';
    }
    html += '<div class="r-line"></div>' +
      '<div class="r-row r-total"><span>合计</span><span>¥' + total + '</span></div>' +
      '<div class="r-row r-small"><span>余额</span><span>¥' + wallet + '</span></div>' +
      '<div class="r-thanks">谢谢惠顾，欢迎再来 🐋</div>';
    inner.innerHTML = html;
    el.classList.add('show');
  }

  function hideReceipt() {
    const el = document.getElementById('receipt');
    if (el) el.classList.remove('show');
  }

  function checkout() {
    if (!basket.length) {
      if (sfx && sfx.beep) sfx.beep();
      tip('篮子还是空的，先去拿点东西吧', 2600);
      return '篮子空空的呢';
    }
    let total = 0;
    for (let i = 0; i < basket.length; i++) total += basket[i].price;
    if (wallet < 0) wallet = 0;
    if (sfx) {
      if (sfx.beep) sfx.beep();
      setTimeout(function () { if (sfx.cash) sfx.cash(); }, 260);
      setTimeout(function () { if (sfx.print) sfx.print(); }, 620);
      setTimeout(function () { if (sfx.bag) sfx.bag(); }, 1080);
    }
    showReceipt(basket.slice(), total);
    const bought = basket.slice();
    basket = [];
    refreshUI();
    tip('结账啦：' + bought.length + ' 件 · 一共 ¥' + total, 3400);
    // M18：结完账把东西交给"家里"（回厨房的冰箱/架子上）
    if (onCheckout) {
      try { onCheckout(bought); } catch (e) { /* 交接失败也不影响结账 */ }
    }
    return null;
  }

  /* ================= 猫 / 信箱 ================= */
  function petCat() {
    if (sfx && sfx.cat) sfx.cat();
    const lines = [
      '它趴在收银台上，尾巴一甩一甩的',
      '看店的猫。店长说它比我来的还早',
      '喵——它在跟我说这个位置是它的'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function openMailbox() {
    if (sfx && sfx.mailbox) sfx.mailbox();
    return '信箱里塞着一张传单：本店关东煮，买二送一';
  }

  /* ================= 注册可点的地方 ================= */
  function addSpot(o) {
    if (!interact || !interact.add) return null;
    return interact.add(o);
  }

  function register() {
    if (!store || !store.spots) return;
    const S = store.spots;

    ITEMS.forEach(function (it) {
      const p = S[it.spot];
      if (!p) return;
      addSpot({
        id: 'shop-' + it.id,
        label: it.name + ' ¥' + it.price,
        box: [p.x, p.y, p.z, 0.24, 0.24, 0.24],
        anchor: [p.x, p.y + 0.20, p.z],
        when: function () { return isStore(); },
        onClick: function () {
          const t = buy(it);
          this._say = t;
        },
        say: function (h) { return h._say || it.tip; }
      });
    });

    // 收银台
    const c = S.counter;
    addSpot({
      id: 'shop-checkout',
      label: '收银台',
      box: [c.x, c.y, c.z, 0.7, 0.5, 1.0],
      anchor: [c.x, c.y + 0.55, c.z],
      when: function () { return isStore(); },
      onClick: function () { this._say = checkout() || null; },
      say: function (h) { return h._say || '要结账就点我'; }
    });

    // 看店的猫
    const k = S.cat;
    addSpot({
      id: 'shop-cat',
      label: '看店的猫',
      box: [k.x, k.y, k.z, 0.40, 0.34, 0.46],
      anchor: [k.x, k.y + 0.28, k.z],
      when: function () { return isStore(); },
      onClick: function () { this._say = petCat(); },
      say: function (h) { return h._say || '喵'; }
    });

    // 信箱
    const m = S.mailbox;
    addSpot({
      id: 'shop-mailbox',
      label: '信箱',
      box: [m.x, m.y, m.z, 0.42, 0.42, 0.34],
      anchor: [m.x, m.y + 0.28, m.z],
      when: function () { return isStore(); },
      onClick: function () { this._say = openMailbox(); },
      say: function (h) { return h._say || '信'; }
    });

    // ===== 又加的几个小互动（妈妈 20:24 说"可以加点互动"） =====
    // 微波炉：叮一下
    addSpot({
      id: 'shop-micro',
      label: '微波炉',
      box: [22.40, 1.72, -3.62, 0.56, 0.44, 0.42],
      anchor: [22.40, 2.00, -3.62],
      when: function () { return isStore(); },
      onClick: function () {
        if (sfx && sfx.ding) sfx.ding();
        this._say = '叮——热好了，小心烫手';
      },
      say: function (h) { return h._say || '转一下两分钟'; }
    });

    // 挂钟：报一下现在几点（用的是电脑上的真时间）
    addSpot({
      id: 'shop-clock',
      label: '挂钟',
      box: [29.46, 2.30, 1.90, 0.5, 0.5, 0.5],
      anchor: [29.46, 2.62, 1.90],
      when: function () { return isStore(); },
      onClick: function () {
        const d = new Date();
        const p = function (n) { return (n < 10 ? '0' : '') + n; };
        this._say = '店里挂钟：' + p(d.getHours()) + ':' + p(d.getMinutes()) + '，和我家那个一样准';
      },
      say: function (h) { return h._say || '几点了'; }
    });

    // 扫码枪：对着空气也"嘀"一下
    addSpot({
      id: 'shop-scanner',
      label: '扫码枪',
      box: [27.40, 1.10, 1.58, 0.26, 0.26, 0.26],
      anchor: [27.40, 1.32, 1.58],
      when: function () { return isStore(); },
      onClick: function () {
        if (sfx && sfx.beep) sfx.beep();
        this._say = '嘀——（对着空气也响，我从小就想按一下这个）';
      },
      say: function (h) { return h._say || '嘀'; }
    });

    // 门口地垫
    addSpot({
      id: 'shop-mat',
      label: '门口地垫',
      box: [24.75, 0.12, 4.28, 1.70, 0.24, 0.90],
      anchor: [24.75, 0.40, 4.28],
      when: function () { return isStore(); },
      onClick: function () {
        this._say = '欢迎光临～ 地垫踩上去软软的，上面印着四个字';
      },
      say: function (h) { return h._say || '踩一脚'; }
    });

    // 24H 灯箱（抬头能点到）
    addSpot({
      id: 'shop-sign',
      label: '「24H」灯箱',
      box: [24.75, 3.55, 4.02, 1.80, 0.80, 0.34],
      anchor: [24.75, 3.10, 4.02],
      when: function () { return isStore(); },
      onClick: function () {
        this._say = '24 小时都开着。半夜来，店里的灯也是这么亮';
      },
      say: function (h) { return h._say || '24 小时'; }
    });
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    interact = o.interact || null;
    sfx = o.sfx || null;
    store = o.store || null;
    tip = o.tip || function () {};
    say = o.say || null;
    onCheckout = o.onCheckout || null;
    isStore = o.isStore || isStore;
    wallet = loadWallet();
    built = true;

    register();

    // 小票：点一下收起来
    const rc = document.getElementById('receipt');
    if (rc) rc.addEventListener('click', hideReceipt);
    refreshUI();

    return {
      setActive: function (v) { refreshUI(); if (!v) hideReceipt(); },
      items: function () { return ITEMS.slice(); },
      basket: function () { return basket.slice(); },
      wallet: function () { return wallet; },
      // M25：理货打工赚的钱走同一本账
      addMoney: function (n) {
        const d = Math.max(0, Math.round(n || 0));
        wallet += d;
        saveWallet();
        refreshUI();
        return wallet;
      },
      // M41：咖啡馆点单要花钱（addMoney 只加不减，这里单独开一个）
      spendMoney: function (n) {
        const d = Math.max(0, Math.round(n || 0));
        if (wallet < d) return false;
        wallet -= d;
        saveWallet();
        refreshUI();
        return true;
      },
      buy: function (id) {
        const it = ITEMS.filter(function (x) { return x.id === id; })[0];
        return it ? buy(it) : null;
      },
      checkout: checkout,
      resetWallet: function () { wallet = START_MONEY; saveWallet(); refreshUI(); },
      debug: function () {
        return { basket: basket.length, wallet: wallet, receipt: !!document.getElementById('receipt').classList.contains('show') };
      }
    };
  }

  return { build: build };
})();
