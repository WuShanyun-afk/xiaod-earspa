/* 小D的赛博小家 · M80 手机版小镇（触屏操作）
 * ------------------------------------------------------------
 * 妈妈：「再弄个手机版小镇，给我朋友试玩一下」
 * 手机上原来能看不能走 —— 第一人称要靠 pointer lock + WASD，手机两样都没有。
 * 这一层只做四件事，不碰任何建模：
 *   ① 认设备：手指头粗的 = 手机/平板 → body.touch + 一套手机排版（index.html 里）
 *   ② 左手摇杆走路（连续推杆，不是八个方向）、右手滑动看四周
 *   ③ 点屏幕上的东西 = 点它（走的时候点准星附近也算）
 *   ④ 第一次进来给一句人话提示，竖屏时提一句"横过来更宽"
 * 键鼠那套（WASD / 鼠标拖动 / pointer lock）在电脑上完全不受影响。
 * 调试：?touch=1 强制手机模式 / ?touch=0 关掉。
 */
window.XD = window.XD || {};

XD.Touch = (function () {
  'use strict';

  /* ================= 判断设备 ================= */
  const Q = location.search || '';
  const force = (function () {
    const m = /[?&]touch=(1|0|on|off)/i.exec(Q);
    if (!m) return null;
    return /1|on/i.test(m[1]);
  })();
  const hasTouch = (navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0) > 0;
  let coarse = false;
  try { coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); } catch (e) {}
  /* 电脑上接了触摸屏也算鼠标优先：只有"主指针是粗的"才当手机。
   * 少数老安卓不报 pointer: coarse，用尺寸兜底（窄屏 + 有触点）。 */
  const isTouch = force === null
    ? ((coarse && hasTouch) || (hasTouch && Math.min(window.innerWidth, window.innerHeight) <= 560))
    : force;

  /* ================= 状态 ================= */
  let ctx = null;
  let built = false;
  let on = false;                 // 手机模式生效
  let lastWalk = null;
  let lastVenue = '';
  let stick = { id: null, ox: 0, oy: 0, vx: 0, vy: 0, mag: 0 };
  let look = { id: null, x: 0, y: 0, moved: 0, t: 0 };
  let hintTimer = 0, rotTimer = 0;
  let houseHinted = false, walkHinted = false, rotShown = false;
  let els = {};
  const SENS = 0.0032;            // 每像素转多少弧度（比鼠标的 0.0024 稍快，手指没鼠标准）
  const STICK_R = 52;             // 摇杆底盘半径（px）
  const DEAD = 0.18;              // 摇杆死区

  const HINT_HOUSE = '👆 拖动画面看看　·　点东西会动　·　点「🚶 走进去」用摇杆逛';
  const HINT_WALK = '🕹 左下摇杆走路　·　👉 右边滑动看　·　点东西互动';
  const HINT_ROT = '📱 横过来视野更宽（竖着也能玩）';

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* 手机版没有键盘，走进去的提示条换成一句人能看懂的 */
  function tip(text, ms) { if (ctx && ctx.tip) { try { ctx.tip(text, ms); } catch (e) {} } }

  function toast(which) {
    const el = els.hint;
    if (!el) return;
    el.textContent = which;
    el.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.classList.remove('on'); }, 5200);
  }

  /* 别的面板开着的时候，摇杆/点屏幕先让开（小手机、拍照、采耳 2D 动画…） */
  function busy() {
    if (document.body.classList.contains('shooting')) return true;
    if (document.body.classList.contains('earopen')) return true;
    const ph = document.getElementById('phone');
    if (ph && ph.classList.contains('open')) return true;
    return false;
  }

  /* ================= 点一下 ================= */
  function ndcOf(cx, cy) {
    const el = ctx.renderer && ctx.renderer.domElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1, r: r };
  }

  function tapAt(cx, cy) {
    if (!ctx || !ctx.interact || !ctx.interact.clickAt) return false;
    const n = ndcOf(cx, cy);
    if (!n) return false;
    let hit = false;
    try { hit = ctx.interact.clickAt(n.x, n.y); } catch (e) { hit = false; }
    /* 手指点的位置太偏、或者东西只有几像素宽 —— 准星附近也认一次 */
    if (!hit) {
      const midX = n.r.left + n.r.width / 2;
      const midY = n.r.top + n.r.height / 2;
      if (Math.abs(cx - midX) < n.r.width * 0.16 && Math.abs(cy - midY) < n.r.height * 0.16) {
        try { hit = ctx.interact.clickAt(0, 0); } catch (e) { hit = false; }
      }
    }
    return hit;
  }

  /* ================= 摇杆 ================= */
  function stickShow(x, y) {
    const b = els.stick;
    if (!b) return;
    b.style.left = x + 'px';
    b.style.top = y + 'px';
    b.classList.add('on');
    if (els.knob) els.knob.style.transform = 'translate(0,0)';
  }

  function stickHide() {
    stick.id = null; stick.mag = 0; stick.vx = 0; stick.vy = 0;
    if (els.stick) els.stick.classList.remove('on');
  }

  function stickStart(e) {
    if (stick.id !== null) return;
    stick.id = e.pointerId;
    stick.ox = e.clientX; stick.oy = e.clientY;
    stick.vx = 0; stick.vy = 0; stick.mag = 0;
    stickShow(e.clientX, e.clientY);
    const w = ctx.getWalk && ctx.getWalk();
    if (w) w.axis = null;
  }

  function stickMove(e) {
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
    if (els.knob) els.knob.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
    const raw = Math.min(1, d / STICK_R);
    const mag = raw <= DEAD ? 0 : (raw - DEAD) / (1 - DEAD);
    const len = Math.hypot(dx, dy);
    if (len > 0.001 && mag > 0) {
      stick.vx = dx / len * mag;
      stick.vy = dy / len * mag;
    } else {
      stick.vx = 0; stick.vy = 0;
    }
    stick.mag = mag;
  }

  /* ================= 滑动看四周 ================= */
  function lookStart(e) {
    if (look.id !== null) return;
    look.id = e.pointerId;
    look.x = e.clientX; look.y = e.clientY;
    look.moved = 0; look.t = now();
  }

  function lookMove(e) {
    const w = ctx.getWalk && ctx.getWalk();
    if (!w) return;
    const dx = e.clientX - look.x;
    const dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY;
    look.moved += Math.hypot(dx, dy);
    if (!dx && !dy) return;
    w.yaw -= dx * SENS;
    w.pitch = clamp(w.pitch - dy * SENS, -1.2, 1.2);
    if (ctx.applyCamera) ctx.applyCamera();
  }

  function lookEnd(e) {
    if (look.id === null) return;
    const quick = now() - look.t < 520;
    const still = look.moved < 10;
    look.id = null;
    if (quick && still) tapAt(e.clientX, e.clientY);
  }

  /* ================= 绑一块"手势区" ================= */
  function bindZone(el, kind) {
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      if (!on || busy()) return;
      if (e.pointerType === 'mouse' && force !== true) return;   // 真手机上鼠标还按老路子走；?touch=1 调试时允许鼠标拖摇杆
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      if (kind === 'stick') stickStart(e); else lookStart(e);
    }, { passive: false });

    el.addEventListener('pointermove', function (e) {
      if (kind === 'stick') { if (e.pointerId !== stick.id) return; stickMove(e); }
      else { if (e.pointerId !== look.id) return; lookMove(e); }
    }, { passive: false });

    function up(e) {
      if (kind === 'stick') {
        if (e.pointerId !== stick.id) return;
        stickHide();
      } else {
        if (e.pointerId !== look.id) return;
        lookEnd(e);
      }
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', function (e) {
      if (kind === 'stick' && e.pointerId === stick.id) stickHide();
      if (kind === 'look' && e.pointerId === look.id) look.id = null;
    });
  }

  /* ================= 组装（main.js 里调） ================= */
  function build(c) {
    if (built) return api;
    ctx = c;
    built = true;
    if (!isTouch) return api;

    on = true;
    api.active = true;
    document.body.classList.add('touch');
    if (window.__XD_DEBUG) window.__XD_DEBUG.touch = true;

    /* ---- 手势层 + 摇杆 + 两条提示 ---- */
    const pad = document.createElement('div');
    pad.id = 'tpad';
    pad.innerHTML =
      '<div class="tz" id="tl"></div>' +
      '<div class="tz" id="tr"></div>' +
      '<div id="tstick"><div class="tk" id="tknob"></div><div class="tl2">走</div></div>';
    document.body.appendChild(pad);

    /* 两条提示不在手势层里 —— 站在样板间视角（pad 没开）也要看得见 */
    const hintEl = document.createElement('div');
    hintEl.id = 'thint';
    document.body.appendChild(hintEl);
    const rotEl = document.createElement('div');
    rotEl.id = 'trot';
    rotEl.textContent = HINT_ROT;
    document.body.appendChild(rotEl);

    /* 最主要的那个按钮：走进去 / 出来 —— 竖屏时视角条会横向滑，它可能滑出屏幕，
     * 所以单独固定在底部中间（走起来就变成「出来」）。 */
    const actEl = document.createElement('div');
    actEl.id = 'tact';
    actEl.innerHTML = '<b id="tactlbl">🚶 走进去</b>';
    document.body.appendChild(actEl);
    els.act = actEl;
    els.actLbl = actEl.querySelector('#tactlbl');
    actEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (ctx && ctx.view) ctx.view('walk');
    });

    els.pad = pad;
    els.hint = document.getElementById('thint');
    els.stick = document.getElementById('tstick');
    els.knob = document.getElementById('tknob');
    els.rot = document.getElementById('trot');

    bindZone(document.getElementById('tl'), 'stick');
    bindZone(document.getElementById('tr'), 'look');

    /* 竖屏提示：点一下就收 */
    if (els.rot) {
      els.rot.addEventListener('pointerdown', function (e) { e.stopPropagation(); els.rot.classList.remove('on'); });
    }

    /* ---- 第一次的提示 ---- */
    setTimeout(function () { if (!houseHinted) { houseHinted = true; toast(HINT_HOUSE); } }, 1600);
    setTimeout(function () {
      if (!rotShown && window.innerHeight > window.innerWidth) {
        rotShown = true;
        if (els.rot) {
          els.rot.classList.add('on');
          clearTimeout(rotTimer);
          rotTimer = setTimeout(function () { els.rot.classList.remove('on'); }, 6500);
        }
      }
    }, 2600);

    return api;
  }

  /* ================= 每帧（main.js 的循环里调） ================= */
  function tick() {
    if (!on || !ctx) return;

    /* 摇杆 → 走路 */
    const w = ctx.getWalk && ctx.getWalk();
    if (w && stick.mag > 0.02) {
      w.axis = { x: stick.vx, y: stick.vy, mag: stick.mag };
    } else if (w && w.axis) {
      w.axis = null;
    }

    const walking = (ctx.getMode && ctx.getMode() === 'walk');
    if (walking !== lastWalk) {
      lastWalk = walking;
      if (els.pad) els.pad.classList.toggle('on', walking);
      if (els.actLbl) els.actLbl.textContent = walking ? '🚪 出来' : '🚶 走进去';
      if (walking) {
        if (!walkHinted) { walkHinted = true; toast(HINT_WALK); }
        else toast('🕹 左下摇杆走路　·　右边滑动看');
      } else {
        if (w) w.axis = null;
        if (stick.id !== null) stickHide();
        if (look.id !== null) look.id = null;
      }
    }

    /* 场景换了：摇杆别带着上一次的方向 */
    const venue = (ctx.getVenue && ctx.getVenue()) || '';
    if (venue !== lastVenue) { lastVenue = venue; if (w) w.axis = null; }
  }

  /* ================= 给 HUD / 调试用 ================= */
  const api = {
    isTouch: isTouch,
    active: false,                 // build() 之后才是 true（下面同步）
    build: build,
    tick: tick,
    tapAt: tapAt,
    openPad: function () { if (els.pad) els.pad.classList.add('on'); },
    closePad: function () { if (els.pad) els.pad.classList.remove('on'); },
    stick: function () { return { mag: stick.mag, vx: stick.vx, vy: stick.vy, on: stick.id !== null }; },
    debug: function () {
      const w = ctx && ctx.getWalk ? ctx.getWalk() : null;
      return {
        touch: isTouch, on: on, mode: ctx && ctx.getMode ? ctx.getMode() : '',
        pad: !!(els.pad && els.pad.classList.contains('on')),
        stick: { mag: Math.round(stick.mag * 100) / 100, vx: Math.round(stick.vx * 100) / 100, vy: Math.round(stick.vy * 100) / 100 },
        axis: w && w.axis ? { x: Math.round(w.axis.x * 100) / 100, y: Math.round(w.axis.y * 100) / 100, mag: Math.round(w.axis.mag * 100) / 100 } : null,
        hint: !!(els.hint && els.hint.classList.contains('on'))
      };
    }
  };

  return api;
})();
