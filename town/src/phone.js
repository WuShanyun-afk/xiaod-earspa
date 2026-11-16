/* M72：小手机 —— 把「去哪儿」全搬进手机里，左上角只留家里那几个视角。
 *
 * 为什么做这个：
 *   原来左上角挤了 13 个按钮（11 个传送 + 2 个演示），一开窗就花花绿绿一大片，
 *   妈妈看一眼就晕。现在传送收进「手机」里 —— 一个能点开的小屏幕，
 *   屏保上就有「现在在哪儿 / 今天几号 / 几点 / 兜里多少钱 / 什么天气」。
 *
 * 手机上的传送格子里有店里的事（比如在邮局时那格会写「再寄一封」），
 * 点一下等于原来点那个按钮 —— 逻辑还是 main.js 里那一份，这里只是换了个门面。
 * 下面四个小开关也是「转发」给原来那几个真按钮（time/rain/snow/sound），
 * 状态只有一份，不用两边同步。
 *
 * 用法：
 *   XD.Phone.init({ go, getVenue, getMode, tip, sfx });
 *   XD.Phone.open() / close() / toggle() / isOpen() / refresh() / debug()
 */
(function () {
  'use strict';
  const XD = window.XD || (window.XD = {});
  if (XD.Phone) return;

  const VENUE_NAME = {
    home: '家里', street: '鲸鱼街', store: '便利店', park: '游乐园',
    cafe: '咖啡馆', earspa: '采耳馆', bakery: '面包房', post: '邮局',
    flower: '花店', fishing: '码头', relax: '鲸捏捏'
  };
  // 街边那几家店：在里面点「鲸鱼街」是「回街上」
  const TOWN = ['cafe', 'earspa', 'bakery', 'post', 'flower', 'fishing'];

  /* 十一个能去的地方。c1/c2 是每个格子渐变的两个色，跟那个场景的灯色对得上。 */
  const DEST = [
    { id: 'homebtn', go: 'home', emoji: '🏠', c1: '#a3b7e2', c2: '#465b86', sub: '小屋' },
    { id: 'streetbtn', go: 'street', emoji: '🌆', c1: '#f3ab63', c2: '#9a5226', sub: '主街' },
    { id: 'storebtn', go: 'store', emoji: '🏪', c1: '#7ddcb4', c2: '#2a7a63', sub: '24小时' },
    { id: 'cafebtn', go: 'cafe', emoji: '☕', c1: '#dcab6c', c2: '#6a4025', sub: '点单' },
    { id: 'bakbtn', go: 'bakery', emoji: '🥐', c1: '#f7d47c', c2: '#a4762a', sub: '白天开', day: true },
    { id: 'earbtn', go: 'earspa', emoji: '💆', c1: '#cba6ff', c2: '#59408c', sub: '夜里开', night: true },
    { id: 'postbtn', go: 'post', emoji: '📮', c1: '#84b8f2', c2: '#2e5a92', sub: '寄信' },
    { id: 'flowerbtn', go: 'flower', emoji: '🌷', c1: '#f78fa9', c2: '#8d2e51', sub: '剪花' },
    { id: 'fishbtn', go: 'fishing', emoji: '🎣', c1: '#6cc9da', c2: '#21697f', sub: '钓鱼' },
    { id: 'parkbtn', go: 'park', emoji: '🎡', c1: '#84dbff', c2: '#2c6da6', sub: '玩水' },
    { id: 'relaxbtn', go: 'relax', emoji: '🫧', c1: '#a3ebcd', c2: '#2c7a63', sub: '解压' }
  ];

  /* 手机底下的四个小开关：转发给原来那几个真按钮 */
  const DOCK = [
    {
      btn: 'timebtn', title: '换白天 / 夜晚（T）',
      state: function () { return txt('timeText') === '白天'; },
      icon: function (on) { return on ? '☀️' : '🌙'; },
      word: function (on) { return on ? '白天' : '夜晚'; }
    },
    {
      btn: 'rainbtn', title: '下雨 / 停雨（Y）',
      state: function () { return cls('rainbtn', 'on'); },
      icon: function (on) { return on ? '🌧' : '🌦'; },
      word: function () { return '雨'; }
    },
    {
      btn: 'snowbtn', title: '下雪 / 停雪（N）',
      state: function () { return cls('snowbtn', 'on'); },
      icon: function (on) { return on ? '❄️' : '🌨'; },
      word: function () { return '雪'; }
    },
    {
      btn: 'soundbtn', title: '声音开关（M）',
      state: function () { return cls('soundbtn', 'off'); },
      icon: function (on) { return on ? '🔇' : '🔊'; },
      word: function (on) { return on ? '静音' : '声音'; }
    },
    {
      btn: 'photobtn', title: '拍一张照片（P）',
      state: function () { return false; },
      icon: function () { return '📷'; },
      word: function () { return '拍照'; }
    }
  ];

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function txt(id) { const e = $(id); return e ? (e.textContent || '').trim() : ''; }
  function cls(id, c) { const e = $(id); return !!(e && e.classList.contains(c)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function put(node, s) { if (node && node.textContent !== s) node.textContent = s; }
  function mk(tag, k, html) {
    const n = document.createElement(tag);
    if (k) n.className = k;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ---------------- 状态 ---------------- */
  let root = null, tab = null, appsEl = null, dockEl = null;
  let whereEl = null, dateEl = null, whenEl = null, moneyEl = null;
  let clkEls = [], chipClk = null;
  let opened = false, built = false;
  const tiles = {};
  const dockTiles = {};
  let ticker = 0;

  let getVenue = function () { return 'home'; };
  let getMode = function () { return 'day'; };
  let onGo = function () {};
  let tipFn = function () {};
  let sfx = null;

  /* ---------------- 建 DOM ---------------- */
  function build() {
    if (built) return;
    built = true;

    /* 收起时右下角那台小手机 */
    tab = mk('div');
    tab.id = 'phonetab';
    tab.title = '小手机 · 去哪儿（也可以按 O）';
    tab.innerHTML =
      '<i class="notch"></i>' +
      '<div class="mini"><span class="mw">🐋</span><span class="mclk">--:--</span></div>';
    document.body.appendChild(tab);
    chipClk = tab.querySelector('.mclk');

    /* 点开之后的大手机 */
    root = mk('div');
    root.id = 'phone';
    root.innerHTML =
      '<div class="bg"></div>' +
      '<div class="frame">' +
        '<span class="kbtn k1"></span><span class="kbtn k2"></span><span class="kbtn k3"></span>' +
        '<div class="screen">' +
          '<div class="wp">' +
            '<i class="halo"></i>' +
            '<span class="bub b1"></span><span class="bub b2"></span><span class="bub b3"></span><span class="bub b4"></span>' +
            '<b class="pw">🐋</b>' +
          '</div>' +
          '<div class="sb"><span class="sb-l">小D手机</span>' +
            '<span class="sb-r"><b class="clk">--:--</b>' +
              '<i class="sig"><i></i><i></i><i></i></i><b class="bat">87%</b></span></div>' +
          '<div class="hero">' +
            '<span class="av">🐋</span>' +
            '<div class="hi"><b>小D</b><em class="where">现在在：家里</em><span class="date"></span></div>' +
            '<div class="tags"><span class="tag when">☀️ 白天</span><span class="tag money">💰 ¥100</span></div>' +
          '</div>' +
          '<div class="sec"><b>去哪儿玩</b><span>点一下，我带你过去</span></div>' +
          '<div class="apps"></div>' +
          '<div class="sec sec2"><b>天气 · 小开关</b><span>白天夜晚、雨、雪都在这儿</span></div>' +
          '<div class="dock"></div>' +
          '<div class="homebar"></div>' +
        '</div>' +
        '<span class="x" title="收起手机（Esc）">×</span>' +
      '</div>';
    document.body.appendChild(root);

    appsEl = root.querySelector('.apps');
    dockEl = root.querySelector('.dock');
    whereEl = root.querySelector('.where');
    dateEl = root.querySelector('.date');
    whenEl = root.querySelector('.when');
    moneyEl = root.querySelector('.money');
    clkEls = [root.querySelector('.sb .clk')];

    /* 十一个格子 */
    DEST.forEach(function (d) {
      const n = mk('div', 'app');
      n.id = d.id;
      n.setAttribute('data-go', d.go);
      n.title = d.sub;
      n.innerHTML = '<span class="ic">' + d.emoji + '</span>' +
        '<span class="nm">' + d.sub + '</span><span class="sub">' + d.sub + '</span>';
      n.querySelector('.ic').style.background = 'linear-gradient(160deg,' + d.c1 + ',' + d.c2 + ')';
      n.__dest = d;
      appsEl.appendChild(n);
      tiles[d.go] = n;
    });

    /* 四个小开关（前三个是天气，第四个静音、第五个拍照） */
    DOCK.forEach(function (k, i) {
      const n = mk('div', 'dk');
      n.setAttribute('data-btn', k.btn);
      n.title = k.title;
      n.innerHTML = '<span class="dk-ic">' + k.icon(false) + '</span><span class="dk-nm">' + k.word(false) + '</span>';
      n.__dock = k;
      if (i < 3) n.classList.add('wx');
      dockEl.appendChild(n);
      dockTiles[k.btn] = n;
      if (i === 2) dockEl.appendChild(mk('i', 'dksplit'));   // 天气 | 其他 之间的细线
    });

    bind();
  }

  /* ---------------- 交互 ---------------- */
  function bind() {
    tab.addEventListener('click', function (e) { e.stopPropagation(); open(); });

    /* 点暗处 / 点 × 都收起来 */
    root.addEventListener('click', function (e) {
      const t = e.target;
      if (t === root.firstChild) { close(); return; }
      let n = t;
      while (n && n !== root && !(n.classList && n.classList.contains('x'))) n = n.parentNode;
      if (n && n !== root) close();
    });

    /* 传送格子 */
    appsEl.addEventListener('click', function (e) {
      let n = e.target;
      while (n && n !== appsEl && !(n.classList && n.classList.contains('app'))) n = n.parentNode;
      if (!n || n === appsEl) return;
      tapDest(n);
    });

    /* 小开关：直接点原来那个按钮，状态只维护一份 */
    dockEl.addEventListener('click', function (e) {
      let n = e.target;
      while (n && n !== dockEl && !(n.classList && n.classList.contains('dk'))) n = n.parentNode;
      if (!n || n === dockEl) return;
      const k = n.__dock;
      if (!k) return;
      const real = $(k.btn);
      if (real) real.click();
      if (sfx && sfx.blip) sfx.blip();
      setTimeout(refresh, 24);
      setTimeout(refresh, 220);
      n.classList.remove('pop');
      void n.offsetWidth;
      n.classList.add('pop');
    });

    /* 每秒看一眼：手机开着就全量刷新，收起时只走小表盘 */
    ticker = setInterval(function () {
      if (opened) refresh();
      else if (chipClk) put(chipClk, clockText());
    }, 1000);
  }

  function tapDest(node) {
    const d = node.__dest;
    if (!d) return;
    if (node.classList.contains('lock')) {
      if (sfx && sfx.blip) sfx.blip();
      node.classList.remove('shake');
      void node.offsetWidth;     // 重排一下，shake 才能连着触发
      node.classList.add('shake');
      tipFn(d.night
        ? '鲸耳堂晚上才开门 🌙 点底下「小开关」里第一个，换成夜里，棉师傅就在了'
        : '鲸麦坊白天才开门 ☀️ 点底下「小开关」里第一个，换成白天，麦师傅正在烤面包', 4200);
      return;
    }
    if (d.go === 'home' && getVenue() === 'home') {
      if (sfx && sfx.blip) sfx.blip();
      tipFn('已经在家啦 🏠 想在屋里转，点左上角那几个视角', 2600);
      return;
    }
    if (sfx && sfx.blip) sfx.blip();
    close();
    // 让手机先收一下再进黑场，两个动画别撞在一起
    setTimeout(function () { onGo(d.go); }, 130);
  }

  /* ---------------- 刷新 ---------------- */
  function clockText() {
    const d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  const WEEK = '日一二三四五六';

  function label(d, venue) {
    const at = venue === d.go;
    switch (d.go) {
      case 'home': return at ? '在家' : '回家';
      case 'street': return at ? '回家' : (TOWN.indexOf(venue) >= 0 ? '回街上' : '上街');
      case 'store': return at ? '回家' : (venue === 'street' ? '进店' : '便利店');
      case 'park': return at ? '回家' : (venue === 'street' ? '去乐园' : '游乐园');
      case 'cafe': return at ? '再来一杯' : '咖啡馆';
      case 'earspa': return at ? '再采一次' : '采耳馆';
      case 'bakery': return at ? '再烤一个' : '面包房';
      case 'post': return at ? '再寄一封' : '邮局';
      case 'flower': return at ? '再挑一束' : '花店';
      case 'fishing': return at ? '抛一竿' : '码头';
      case 'relax': return at ? '再捏一次' : '鲸捏捏';
      default: return d.sub;
    }
  }

  function refresh() {
    if (!root) return;
    const venue = getVenue();
    const mode = getMode();
    const now = new Date();

    // 表盘 / 日期
    const ck = clockText();
    put(chipClk, ck);
    clkEls.forEach(function (n) { put(n, ck); });
    put(dateEl, (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + WEEK[now.getDay()]);
    put(whereEl, '现在在：' + (VENUE_NAME[venue] || '家里'));

    // 钱包（就从收银台那个 #wallet 里读，跟店里是同一个数）
    const w = txt('wallet');
    put(moneyEl, '💰 ' + (w || '¥0'));

    // 天气
    const rainOn = cls('rainbtn', 'on'), snowOn = cls('snowbtn', 'on');
    put(whenEl, (mode === 'day' ? '☀️ 白天' : '🌙 夜晚') +
      (snowOn ? ' · ❄️ 雪' : (rainOn ? ' · 🌧 雨' : '')));

    // 十一个格子
    DEST.forEach(function (d) {
      const n = tiles[d.go];
      if (!n) return;
      const at = venue === d.go;
      // 注意那个 !!：没有营业时间的店，(undefined && …) || (undefined && …) 得到的是
      // undefined，而 classList.toggle(name, undefined) 会当成"没给 force"→ 直接翻转，
      // 于是没限制的店每次刷新都随机变灰（M72 踩过一次）。
      const locked = !at && !!((d.day && mode !== 'day') || (d.night && mode !== 'night'));
      n.classList.toggle('lock', locked);
      n.classList.toggle('cur', at);
      put(n.querySelector('.nm'), label(d, venue));
      put(n.querySelector('.sub'), locked ? d.sub : (at ? '你在这' : d.sub));
      n.title = locked ? (d.night ? '晚上才开门' : '白天才开门') : label(d, venue);
    });

    // 四个小开关
    DOCK.forEach(function (k) {
      const n = dockTiles[k.btn];
      if (!n) return;
      const on = k.state();
      put(n.querySelector('.dk-ic'), k.icon(on));
      put(n.querySelector('.dk-nm'), k.word(on));
      n.classList.toggle('on', on);
    });
  }

  /* ---------------- 开 / 收 ---------------- */
  function open() {
    if (!built) build();
    if (opened) return;
    opened = true;
    // 走路模式里鼠标可能被锁在画面上 —— 先放出来，不然点不到手机上的格子
    try {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    } catch (e) {}
    root.classList.add('open');
    tab.classList.add('hide');
    if (sfx && sfx.blip) sfx.blip();
    refresh();
  }
  function close() {
    if (!built || !opened) return;
    opened = false;
    root.classList.remove('open');
    tab.classList.remove('hide');
  }
  function toggle() { if (opened) close(); else open(); }
  function isOpen() { return opened; }

  /* ---------------- 出口 ---------------- */
  function init(o) {
    o = o || {};
    if (o.go) onGo = o.go;
    if (o.getVenue) getVenue = o.getVenue;
    if (o.getMode) getMode = o.getMode;
    if (o.tip) tipFn = o.tip;
    sfx = o.sfx || null;
    build();
    refresh();
    return XD.Phone;
  }

  function debug() {
    const labels = {};
    DEST.forEach(function (d) {
      const n = tiles[d.go];
      labels[d.go] = n ? {
        nm: (n.querySelector('.nm') || {}).textContent,
        sub: (n.querySelector('.sub') || {}).textContent,
        cur: n.classList.contains('cur'),
        lock: n.classList.contains('lock')
      } : null;
    });
    return {
      open: opened,
      built: built,
      venue: getVenue(),
      mode: getMode(),
      where: whereEl ? whereEl.textContent : '',
      money: moneyEl ? moneyEl.textContent : '',
      date: dateEl ? dateEl.textContent : '',
      tiles: Object.keys(labels),
      labels: labels
    };
  }

  XD.Phone = {
    init: init, build: build, open: open, close: close, toggle: toggle,
    isOpen: isOpen, refresh: refresh, debug: debug,
    DEST: DEST, DOCK: DOCK, VENUE_NAME: VENUE_NAME
  };
})();
