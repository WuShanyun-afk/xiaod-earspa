/* 小D的赛博小家 · 手机网页版直播（M64）
 *
 * 妈妈：「我朋友说也想看你直播，你修完 bug 再整个手机网页版，我发给我朋友玩玩」。
 * 这个页面不做 3D，只有一屏：小D 自己按节目单演触发音（真实录音），
 * 观众可以发弹幕、点爱心。手机上竖着拿就行，横屏也能看。
 *
 * 说明：所有音效的偏移都是**实测**的（assets/relax-audio 里每段素材开头/结尾
 * 常有静音，直接从头播就是"没声"，所以这里从一开始就只播有声段）。
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const CLIP_DIR = 'assets/relax-audio/';
  // f=文件名，a~b = 实测有声段（秒）
  const CLIP = {
    crisp: { f: 'crisp.mp3', a: 0.31, b: 4.32 },
    squish: { f: 'squish.mp3', a: 0.42, b: 25.63 },
    crack: { f: 'crack.mp3', a: 0.43, b: 1.04 },
    powder: { f: 'powder.mp3', a: 0.58, b: 13.15 },
    sand: { f: 'sand.mp3', a: 0.02, b: 8.00 },
    woodtap: { f: 'woodtap.mp3', a: 0.62, b: 23.82 },
    bubble: { f: 'bubble.mp3', a: 1.23, b: 16.44 },
    mouth: { f: 'mouth.mp3', a: 0.07, b: 13.81 },
    brush: { f: 'brush.mp3', a: 0.11, b: 10.56 },
    feather: { f: 'feather.mp3', a: 1.40, b: 11.35 },
    rain: { f: 'rain.mp3', a: 0.37, b: 72.38 },
    bowl: { f: 'bowl.mp3', a: 0.04, b: 1.66 },
    glass: { f: 'glass.mp3', a: 0.43, b: 5.12 },
    cloth: { f: 'cloth.mp3', a: 24.25, b: 26.54 },
    water: { f: 'water.mp3', a: 0.55, b: 67.41 },
    peel: { f: 'peel.mp3', a: 1.18, b: 2.99 }
  };

  const ACTS = [
    { k: 'lipbalm', name: '唇膏涂麦', clip: 'mouth', dur: 6.4, say: '唇膏在麦上蹭一蹭…… 黏黏的那种声音' },
    { k: 'brush', name: '刷子刷麦', clip: 'brush', dur: 6.0, say: '刷子从左边扫到右边，慢慢地' },
    { k: 'glass', name: '敲陶瓷杯', clip: 'glass', dur: 5.2, say: '叮 —— 这个音会转很久' },
    { k: 'feather', name: '羽毛', clip: 'feather', dur: 5.4, say: '羽毛最轻，别急着睡' },
    { k: 'woodtap', name: '敲小木块', clip: 'woodtap', dur: 4.8, say: '哒、哒、哒，木头是暖的' },
    { k: 'cloth', name: '揉棉布', clip: 'cloth', dur: 5.6, say: '棉布揉一揉，低频的沙沙' },
    { k: 'water', name: '流水棒', clip: 'water', dur: 6.0, say: '翻过来 —— 像有人在你枕边放了条小溪' },
    { k: 'bowl', name: '颂钵', clip: 'bowl', dur: 6.0, say: '颂钵敲一下，能响好久' },
    { k: 'rain', name: '雨棍', clip: 'rain', dur: 6.2, say: '雨棍倒过来，整场雨往下走' },
    { k: 'peel', name: '撕胶带', clip: 'peel', dur: 4.6, say: '胶带慢慢撕开…… 黏黏的' }
  ];

  let cv, c2, W = 0, H = 0, dpr = 1;
  let t = 0, last = 0, started = false;
  let act = null, actT = 0, said = false, nextSound = 0;
  let hearts = [], reply = null, likes = 0;
  let audience = 6;
  const danmu = [];
  let danmuT = 1.6;
  let likeHit = null;

  /* ---------------- 声音（M64.1：手机上改用 Web Audio） ----------------
   * 妈妈：「手机版好像没有声音诶！」
   * 手机上用 <audio> 有三个坑：
   *   ① iOS 必须在**用户手势的同步栈**里解锁，否则 play() 被拒；
   *   ② `currentTime` 在没加载完时设不上 → 又从头播那截静音；
   *   ③ iOS 根本不支持 `audio.volume`。
   * 所以手机上改成 Web Audio：手势里建/解锁 AudioContext，fetch + decodeAudioData 成
   * AudioBuffer，用 `start(when, offset, dur)` 精确播有声段，音量用 GainNode 控。
   */
  let ac = null, master = null;
  const bufs = {};
  const loading = {};
  let unlockTried = false;

  function ensureAudio() {
    if (ac) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }

  function unlockAudio() {
    const a = ensureAudio();
    if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    if (unlockTried) return;
    unlockTried = true;
    try {
      // M64.2：iOS / 微信要「真的有一段时长」的 buffer 才算解锁（1 帧不够）
      const len = Math.max(1, Math.floor(a.sampleRate * 0.3));
      const b = a.createBuffer(1, len, a.sampleRate);
      const s = a.createBufferSource();
      s.buffer = b;
      s.connect(a.destination);
      s.start(0);
    } catch (e) {}
  }

  // 微信内置浏览器：音频要等 WeixinJSBridgeReady 之后才能放
  function hookWeixin() {
    try {
      if (typeof WeixinJSBridge === 'undefined') return;
      document.addEventListener('WeixinJSBridgeReady', function () {
        unlockAudio();
        if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
      }, false);
    } catch (e) {}
  }
  hookWeixin();
  let wxTries = 0;
  const wxTimer = setInterval(function () {
    if (typeof WeixinJSBridge !== 'undefined' || ++wxTries > 24) {
      clearInterval(wxTimer);
      hookWeixin();
    }
  }, 300);

  function loadOne(k) {
    if (bufs[k] || loading[k]) return;
    const a = ensureAudio();
    if (!a) return;
    loading[k] = true;
    fetch(CLIP_DIR + CLIP[k].f).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) {
        try { a.decodeAudioData(ab, res, rej); } catch (e) { rej(e); }
      });
    }).then(function (b) {
      bufs[k] = b;
      delete loading[k];
    }).catch(function () { delete loading[k]; });
  }

  function loadAll() {
    Object.keys(CLIP).forEach(loadOne);
  }

  function loadedCount() { return Object.keys(bufs).length; }

  /* 双保险：Web Audio 不行就退回 <audio>（手机上两种都有人栽过，得留后路） */
  let useWebAudio = null;
  let lastInfo = 'none';
  let needTap = false;   // 被浏览器拦过 → 提示用户点一下
  const els = {};
  function elOf(k) {
    if (els[k]) return els[k];
    try {
      const a = new Audio(CLIP_DIR + CLIP[k].f);
      a.preload = 'auto';
      a.setAttribute('playsinline', '');
      els[k] = a;
      return a;
    } catch (e) { return null; }
  }
  function playEl(k, vol, want) {
    const c = CLIP[k];
    const a = elOf(k);
    if (!a) { lastInfo = k + ' no-el'; return; }
    const usable = Math.max(0.25, c.b - c.a);
    const dur = Math.min(want || 0.7, usable);
    const span = Math.max(0, usable - dur);
    const off = c.a + (span > 0.05 ? Math.random() * span : 0);
    const go = function () {
      try { a.currentTime = off; } catch (e) {}
      try {
        a.volume = vol === undefined ? 0.7 : Math.min(1, vol);
        const p = a.play();
        if (p && p.catch) p.catch(function () { lastInfo = k + '@' + off.toFixed(1) + ' blocked'; needTap = true; });
        lastInfo = k + '@' + off.toFixed(1) + ' el';
      } catch (e) { lastInfo = k + ' el-err'; needTap = true; }
      clearTimeout(a._t);
      a._t = setTimeout(function () { try { a.pause(); } catch (e) {} }, dur * 1000 + 40);
    };
    if (a.readyState >= 2) { go(); return; }
    if (!a._wait) {
      a._wait = true;
      const once = function () {
        a._wait = false;
        a.removeEventListener('canplay', once);
        a.removeEventListener('loadedmetadata', once);
        go();
      };
      a.addEventListener('canplay', once);
      a.addEventListener('loadedmetadata', once);
      if (a.readyState === 0) { try { a.load(); } catch (e) {} }
    }
  }

  function play(k, vol, want) {
    const c = CLIP[k];
    if (!c) return;
    if (useWebAudio === false) { playEl(k, vol, want); return; }
    const a = ensureAudio();
    if (!a) { playEl(k, vol, want); return; }
    if (a.state !== 'running') { playEl(k, vol, want); return; }
    const buf = bufs[k];
    if (!buf) { loadOne(k); return; }
    const usable = Math.max(0.25, c.b - c.a);
    const dur = Math.min(want || 0.7, usable);
    const span = Math.max(0, usable - dur);
    const off = c.a + (span > 0.05 ? Math.random() * span : 0);
    try {
      const src = a.createBufferSource();
      src.buffer = buf;
      const g = a.createGain();
      g.gain.value = vol === undefined ? 0.7 : vol;
      src.connect(g);
      g.connect(master);
      src.start(a.currentTime + 0.01, off, dur);
      lastInfo = k + '@' + off.toFixed(1) + ' wa';
    } catch (e) { playEl(k, vol, want); }
  }

  /* ---------------- 画布 ---------------- */
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, window.innerWidth);
    H = Math.max(480, window.innerHeight);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function nextAct(first) {
    if (first) act = ACTS[Math.floor(Math.random() * ACTS.length)];
    else {
      const i = ACTS.indexOf(act);
      act = ACTS[(i + 1 + Math.floor(Math.random() * 2)) % ACTS.length];
    }
    actT = 0;
    said = false;
    nextSound = 0.5;
  }

  function replyTo(txt) {
    if (/晚安|睡了|困/.test(txt)) return '晚安…… 我把声音放小一点，你闭眼就行';
    if (/好听|喜欢|舒服|治愈|牛|棒/.test(txt)) return '喜欢就好 —— 那你再躺一会儿';
    if (/加油|辛苦|主播/.test(txt)) return '谢谢…… 我不累，陪你到睡着';
    if (/妈妈|小D/.test(txt)) return '（小声）是我呀 —— 那我给你多演一会儿';
    if (/来了|我在|弹幕/.test(txt)) return '看到你了，坐在最前面那个对不对';
    if (/吵|小点|难听/.test(txt)) return '我把音量调小一点…… 这样呢';
    return '收到～ 那你躺着听，我继续';
  }

  function sendChat() {
    const inp = document.getElementById('chat');
    const txt = (inp.value || '').trim().slice(0, 30);
    if (!txt) return;
    inp.value = '';
    const lane = danmu.filter(function (d) { return d.mine; }).length % 3;
    danmu.push({ x: W + 20, y: 0, text: txt, mine: true, life: 1, sp: 42, lane: lane });
    audience += 1 + Math.floor(Math.random() * 2);
    reply = { text: replyTo(txt), t: 0 };
    play('mouth', 0.35, 0.5);
    inp.blur();
  }

  function doLike() {
    likes++;
    hearts.push({
      x: likeHit.x + (Math.random() - 0.5) * 18,
      y: likeHit.y - 8,
      vx: (Math.random() - 0.5) * 50,
      vy: -100 - Math.random() * 60,
      life: 1, s: 10 + Math.random() * 12
    });
    audience += 1 + Math.floor(Math.random() * 3);
    if (likes % 6 === 1) reply = { text: '谢谢你的心 🤍', t: 0 };
    play('glass', 0.22, 0.3);
  }

  /* ---------------- 画 ---------------- */
  function drawHeart(x, y, s, color) {
    c2.save();
    c2.translate(x, y);
    c2.fillStyle = color;
    c2.beginPath();
    c2.moveTo(0, s * 0.5);
    c2.bezierCurveTo(-s * 1.4, -s * 0.4, -s * 0.5, -s * 1.2, 0, -s * 0.45);
    c2.bezierCurveTo(s * 0.5, -s * 1.2, s * 1.4, -s * 0.4, 0, s * 0.5);
    c2.fill();
    c2.restore();
  }

  function bg() {
    const g = c2.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c1420');
    g.addColorStop(1, '#0b0810');
    c2.fillStyle = g;
    c2.fillRect(0, 0, W, H);
    const g1 = c2.createRadialGradient(W * 0.5, H * 0.30, 30, W * 0.5, H * 0.30, W * 0.8);
    g1.addColorStop(0, 'rgba(255,196,140,0.14)');
    g1.addColorStop(1, 'rgba(255,196,140,0)');
    c2.fillStyle = g1;
    c2.fillRect(0, 0, W, H);
    c2.save();
    const n = 12;
    for (let i = 0; i < n; i++) {
      const x = W * 0.08 + i * (W * 0.84 / (n - 1));
      const y = H * 0.10 + Math.sin(i * 0.8 + t * 0.8) * 5;
      c2.globalAlpha = 0.28 + 0.24 * Math.abs(Math.sin(t * 1.4 + i));
      c2.fillStyle = '#ffd9a0';
      c2.beginPath();
      c2.arc(x, y, 2.6, 0, TAU);
      c2.fill();
    }
    c2.restore();
  }

  function drawMic() {
    const mx = W * 0.26, my = H * 0.60;
    const R = Math.min(W, H) * 0.075;
    c2.save();
    c2.strokeStyle = 'rgba(150,158,170,0.8)';
    c2.lineWidth = 4;
    c2.beginPath();
    c2.moveTo(mx, my + R * 0.7);
    c2.lineTo(mx - R * 0.8, H * 0.74);
    c2.moveTo(mx, my + R * 0.7);
    c2.lineTo(mx + R * 0.8, H * 0.74);
    c2.stroke();
    const grd = c2.createRadialGradient(mx - R * 0.4, my - R * 0.5, R * 0.2, mx, my, R * 1.3);
    grd.addColorStop(0, '#eae4da');
    grd.addColorStop(1, '#9a8f84');
    c2.fillStyle = grd;
    c2.beginPath();
    c2.ellipse(mx, my, R, R * 1.2, 0, 0, TAU);
    c2.fill();
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(58,54,50,0.92)';
      c2.beginPath();
      c2.arc(mx + s * R * 0.94, my + R * 0.16, R * 0.30, 0, TAU);
      c2.fill();
      c2.fillStyle = 'rgba(186,192,202,0.7)';
      c2.beginPath();
      c2.arc(mx + s * R * 0.94, my + R * 0.16, R * 0.12, 0, TAU);
      c2.fill();
    });
    c2.restore();
  }

  function drawWhale(k) {
    const R = Math.min(W, H) * 0.185;
    const cx = W * 0.60, cy = H * 0.32;
    const bob = Math.sin(t * 1.2) * 3;
    const fin = Math.sin(t * 3.2) * 0.10 + Math.sin(Math.min(1, k) * Math.PI) * 0.45;
    c2.save();
    c2.translate(cx, cy + bob);
    const g1 = c2.createLinearGradient(-R, -R, 0, R);
    g1.addColorStop(0, 'rgba(160,192,224,0.99)');
    g1.addColorStop(1, 'rgba(104,140,180,0.99)');
    c2.fillStyle = g1;
    c2.beginPath(); c2.ellipse(0, 0, R * 1.05, R * 0.9, 0, 0, TAU); c2.fill();
    c2.fillStyle = 'rgba(238,246,253,0.96)';
    c2.beginPath(); c2.ellipse(0, R * 0.34, R * 0.70, R * 0.50, 0, 0, TAU); c2.fill();
    c2.fillStyle = 'rgba(104,140,180,0.99)';
    c2.beginPath();
    c2.moveTo(-R * 0.94, R * 0.12);
    c2.lineTo(-R * 1.52, -R * 0.34);
    c2.lineTo(-R * 1.48, R * 0.44);
    c2.closePath(); c2.fill();
    c2.save();
    c2.translate(-R * 0.52, R * 0.28);
    c2.rotate(0.7 + fin);
    c2.fillStyle = 'rgba(124,160,200,0.99)';
    c2.beginPath(); c2.ellipse(0, 0, R * 0.36, R * 0.16, 0, 0, TAU); c2.fill();
    c2.restore();
    const blink = (Math.sin(t * 0.95) > 0.985) ? 0.12 : 1;
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(28,34,44,0.95)';
      c2.beginPath();
      c2.ellipse(-s * R * 0.30, -R * 0.12, R * 0.075, R * 0.075 * blink, 0, 0, TAU);
      c2.fill();
    });
    c2.strokeStyle = 'rgba(38,44,56,0.95)';
    c2.lineWidth = R * 0.12;
    c2.lineCap = 'round';
    c2.beginPath();
    c2.arc(0, -R * 0.14, R * 1.02, Math.PI * 1.10, Math.PI * 1.90);
    c2.stroke();
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(38,44,56,0.95)';
      c2.beginPath(); c2.arc(s * R * 0.98, -R * 0.14, R * 0.19, 0, TAU); c2.fill();
      c2.fillStyle = 'rgba(224,143,154,0.95)';
      c2.beginPath(); c2.arc(s * R * 0.90, -R * 0.14, R * 0.10, 0, TAU); c2.fill();
    });
    c2.restore();
  }

  function drawProp(A, k) {
    const mx = W * 0.26, my = H * 0.60;
    const ease = function (x) { return x * x * (3 - 2 * x); };
    const pIn = Math.min(1, k / 0.15);
    const pOut = Math.max(0, (k - 0.85) / 0.15);
    const dx = W * 1.05, dy = H * 0.14;
    const x = dx + (mx + 18 - dx) * ease(pIn) + pOut * (W * 0.3);
    const y = dy + (my - 34 - dy) * ease(pIn) - pOut * (H * 0.2);
    const s = Math.max(0.45, H / 850);   // 按画面高度缩放：桌面 1.0，手机竖屏也差不多大小
    c2.save();
    c2.translate(x, y);
    c2.rotate(-0.5 + Math.sin(actT * 9) * 0.22 + pOut * 0.9);
    c2.scale(s, s);
    if (A.k === 'lipbalm') {
      c2.fillStyle = '#c9a24a'; c2.fillRect(-7, -34, 14, 40);
      c2.fillStyle = '#d98a9a'; c2.fillRect(-6, -46, 12, 16);
    } else if (A.k === 'brush') {
      c2.fillStyle = '#8a6a48'; c2.fillRect(-5, -40, 10, 34);
      c2.fillStyle = '#d9bb8c';
      c2.beginPath(); c2.ellipse(0, -46, 12, 14, 0, 0, TAU); c2.fill();
    } else if (A.k === 'glass') {
      c2.fillStyle = 'rgba(244,237,226,0.95)';
      c2.beginPath();
      c2.moveTo(-12, -42); c2.lineTo(12, -42); c2.lineTo(9, -12); c2.lineTo(-9, -12);
      c2.closePath(); c2.fill();
    } else if (A.k === 'feather') {
      c2.fillStyle = 'rgba(248,240,230,0.95)';
      c2.beginPath(); c2.ellipse(0, -40, 9, 30, 0.25, 0, TAU); c2.fill();
      c2.strokeStyle = 'rgba(216,206,192,0.9)';
      c2.lineWidth = 2;
      c2.beginPath(); c2.moveTo(0, -8); c2.lineTo(0, -66); c2.stroke();
    } else if (A.k === 'woodtap') {
      c2.fillStyle = '#b08a5a'; c2.fillRect(-12, -48, 24, 24);
    } else if (A.k === 'cloth') {
      c2.fillStyle = 'rgba(216,200,175,0.95)';
      c2.beginPath(); c2.ellipse(0, -38, 22, 16, 0.3, 0, TAU); c2.fill();
    } else if (A.k === 'water') {
      c2.fillStyle = 'rgba(214,232,240,0.9)'; c2.fillRect(-5, -62, 10, 48);
      c2.fillStyle = '#c9a24a'; c2.fillRect(-9, -14, 18, 10);
    } else if (A.k === 'bowl') {
      c2.fillStyle = '#b08a2a';
      c2.beginPath(); c2.arc(0, -26, 20, 0, Math.PI); c2.fill();
    } else if (A.k === 'rain') {
      c2.fillStyle = '#8a5a3a'; c2.fillRect(-8, -60, 16, 56);
    } else {
      c2.fillStyle = 'rgba(216,199,168,0.95)';
      c2.beginPath(); c2.arc(0, -34, 14, 0, TAU); c2.fill();
    }
    c2.restore();
    if (k > 0.2 && k < 0.85) {
      const a = 0.45 * Math.sin((k - 0.2) / 0.65 * Math.PI);
      c2.save();
      c2.globalAlpha = Math.max(0, a);
      c2.strokeStyle = '#ffd9a0';
      c2.lineWidth = 2;
      c2.beginPath();
      c2.arc(mx + 14, my - 14, 14 + Math.sin(actT * 6) * 5, 0, TAU);
      c2.stroke();
      c2.restore();
    }
  }

  const AUTO_LINES = [
    '这个声音好舒服…', '主播手好稳', '晚安晚安', '再来一次那个',
    '听着这个能睡着', '已收藏', '耳机党狂喜', '好解压啊',
    '比数羊管用', '这个点了还不睡吗', '偷偷看直播', '好温柔'
  ];

  let laneSeq = 0;
  function updateDanmu(dt) {
    danmuT -= dt;
    if (danmuT <= 0) {
      danmuT = 2.6 + Math.random() * 3.2;
      if (danmu.length < 8) {
        danmu.push({
          x: W + 20, mine: false, life: 1, sp: 38 + Math.random() * 26,
          y: H * 0.50 + (laneSeq++ % 6) * Math.min(54, H * 0.062),
          text: AUTO_LINES[Math.floor(Math.random() * AUTO_LINES.length)]
        });
      }
    }
    const top = H * 0.50, gap = Math.min(54, H * 0.062);
    for (let i = danmu.length - 1; i >= 0; i--) {
      const d = danmu[i];
      d.x -= d.sp * dt;
      if (d.x < -320) { danmu.splice(i, 1); continue; }
      if (!d.y) d.y = top + (d.lane || 0) * gap;
      c2.save();
      c2.font = '400 ' + Math.round(Math.min(W, H) * 0.038) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
      const tw = c2.measureText(d.text).width;
      c2.globalAlpha = 0.75;
      c2.fillStyle = d.mine ? 'rgba(255,140,170,0.26)' : 'rgba(255,255,255,0.10)';
      const ph = Math.round(Math.min(W, H) * 0.056);
      roundRect(d.x - tw - 14, d.y - ph / 2, tw + 24, ph, ph / 2);
      c2.fill();
      c2.globalAlpha = 0.94;
      c2.fillStyle = d.mine ? 'rgba(255,214,226,0.97)' : 'rgba(255,255,255,0.9)';
      c2.textAlign = 'left';
      c2.textBaseline = 'middle';
      c2.fillText(d.text, d.x - tw - 2, d.y);
      c2.restore();
    }
  }

  function roundRect(x, y, w, h, r) {
    c2.beginPath();
    c2.moveTo(x + r, y);
    c2.arcTo(x + w, y, x + w, y + h, r);
    c2.arcTo(x + w, y + h, x, y + h, r);
    c2.arcTo(x, y + h, x, y, r);
    c2.arcTo(x, y, x + w, y, r);
    c2.closePath();
  }

  function drawUI(dt) {
    const ts = Math.max(22, Math.round(Math.min(W, H) * 0.040));
    const small = Math.max(12, Math.round(Math.min(W, H) * 0.028));
    c2.save();
    c2.textAlign = 'left';
    c2.textBaseline = 'middle';
    c2.fillStyle = 'rgba(255,255,255,0.94)';
    c2.font = '700 ' + ts + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillText('小D 的助眠直播', W * 0.06, ts * 0.92);
    c2.font = '400 ' + Math.round(ts * 0.46) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.5)';
    c2.fillText('正在演：' + act.name, W * 0.06, ts * 1.78);
    const lv = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2));
    c2.fillStyle = 'rgba(255,90,106,' + lv + ')';
    c2.beginPath();
    c2.arc(W * 0.065, ts * 2.52, 5, 0, TAU);
    c2.fill();
    c2.fillStyle = 'rgba(255,255,255,0.85)';
    c2.font = '700 ' + Math.round(small * 0.72) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillText('LIVE', W * 0.085, ts * 2.52);
    c2.font = '400 ' + Math.round(small * 0.72) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.fillText(Math.floor(audience) + ' 人在看', W * 0.145, ts * 2.52);

    const r = Math.min(W, H) * 0.085;
    const bx = W - r * 1.5, by = H - r * 1.9;
    likeHit = { x: bx, y: by, r: r * 1.25 };
    c2.globalAlpha = 0.9;
    c2.fillStyle = 'rgba(255,255,255,0.10)';
    c2.beginPath();
    c2.arc(bx, by, r, 0, TAU);
    c2.fill();
    drawHeart(bx, by, r * 0.52, 'rgba(255,120,150,0.95)');
    c2.textAlign = 'center';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.font = '400 ' + Math.round(small * 0.7) + 'px "Microsoft YaHei",sans-serif';
    c2.fillText('点赞 ' + likes, bx, by + r * 0.86);

    if (needTap) {
      c2.save();
      c2.textAlign = 'center';
      c2.font = '700 ' + Math.round(small * 0.92) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,220,120,' + (0.55 + 0.45 * Math.abs(Math.sin(t * 3))) + ')';
      c2.fillText('🔈 点一下屏幕，把声音打开', W / 2, H * 0.70);
      c2.restore();
    }

    if (reply) {
      reply.t += dt;
      const a = Math.min(1, reply.t * 2);
      c2.globalAlpha = a * 0.92;
      c2.textAlign = 'center';
      c2.font = '400 ' + Math.round(small * 0.95) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,255,255,0.9)';
      c2.fillText('小D：' + reply.text, W / 2, H * 0.79);
      if (reply.t > 6) reply = null;
    }
    c2.textAlign = 'left';
    c2.restore();
  }

  function drawHearts(dt) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.vy += 22 * dt;
      h.life -= dt * 0.55;
      if (h.life <= 0 || h.y < -40) { hearts.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = Math.max(0, Math.min(1, h.life));
      drawHeart(h.x, h.y, h.s, 'rgba(255,120,150,0.92)');
      c2.restore();
    }
  }

  function tick(now) {
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (started) {
      if (loadedCount() === 0) {
        bg();
        drawLoading();
        requestAnimationFrame(tick);
        return;
      }
      actT += dt;
      const k = actT / act.dur;
      if (k > 0.18 && k < 0.82 && actT >= nextSound) {
        nextSound = actT + 0.42 + Math.random() * 0.22;
        play(act.clip, 0.62, 0.7);
      }
      if (!said && k > 0.12) {
        said = true;
        reply = { text: act.say, t: 0 };
      }
      if (k >= 1) nextAct(false);
      bg();
      drawMic();
      drawWhale(k);
      drawProp(act, k);
      updateDanmu(dt);
      drawHearts(dt);
      drawUI(dt);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- 启动 ---------------- */
  function begin() {
    if (started) return;
    started = true;
    const cover = document.getElementById('cover');
    if (cover) cover.style.display = 'none';
    const chat = document.getElementById('chat');
    if (chat) chat.style.display = 'block';
    // 必须在这次点击里同步做：建 AudioContext + 解锁 + 开始下载
    unlockAudio();
    loadAll();
    // 顺手把 <audio> 那条后备也解锁：iOS 要求每个音频元素在用户手势里 play 过一次
    try {
      const a0 = elOf('mouth');
      if (a0) {
        a0.muted = true;
        const p = a0.play();
        const done = function () { try { a0.pause(); } catch (e) {} a0.muted = false; };
        if (p && p.then) p.then(done).catch(function () { a0.muted = false; });
        else done();
      }
    } catch (e) {}
    nextAct(true);
    audience += 2 + Math.floor(Math.random() * 4);
    // 300ms 后看一眼 AudioContext 到底跑起来没有：没跑起来就退回 <audio> 那条路
    setTimeout(function () {
      useWebAudio = !!(ac && ac.state === 'running');
    }, 320);
  }

  function drawLoading() {
    const n = loadedCount(), total = Object.keys(CLIP).length;
    c2.save();
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillStyle = 'rgba(255,255,255,0.82)';
    c2.font = '400 ' + Math.round(Math.min(W, H) * 0.026) + 'px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillText('正在把声音搬过来… ' + n + ' / ' + total, W / 2, H * 0.56);
    const bw = Math.min(W * 0.5, 240), bh = 6;
    const bx = W / 2 - bw / 2, by = H * 0.60;
    c2.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(bx, by, bw, bh, 3);
    c2.fill();
    c2.fillStyle = 'rgba(255,180,200,0.9)';
    roundRect(bx, by, bw * (n / Math.max(1, total)), bh, 3);
    c2.fill();
    c2.restore();
  }

  function init() {
    cv = document.getElementById('cv');
    c2 = cv.getContext('2d');
    resize();
    window.addEventListener('resize', function () { setTimeout(resize, 60); });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 240); });

    document.getElementById('cover').addEventListener('pointerdown', function (e) {
      e.preventDefault();
      begin();
    });
    document.getElementById('cover').addEventListener('click', function (e) {
      e.preventDefault();
      begin();
    });

    const chat = document.getElementById('chat');
    chat.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });
    chat.addEventListener('focus', function () {
      setTimeout(function () { window.scrollTo(0, 0); }, 300);
    });

    cv.addEventListener('pointerdown', function (e) {
      // 每次摸屏幕都再试着把音频通道唤醒（iOS / 微信里有时第一次不生效）
      if (ac && ac.state === 'suspended') {
        try { ac.resume(); } catch (err) {}
        setTimeout(function () { if (ac && ac.state === 'running') useWebAudio = true; }, 200);
      }
      if (!started) { begin(); return; }
      if (needTap) {
        needTap = false;
        unlockAudio();
        if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (err) {} }
        // 这一下是真实触摸：直接用 <audio> 放一条，能把通道彻底打开
        playEl('mouth', 0.65, 0.6);
        return;
      }
      if (likeHit && Math.hypot(e.clientX - likeHit.x, e.clientY - likeHit.y) <= likeHit.r) {
        doLike();
      }
    });

    requestAnimationFrame(tick);
    // 给排查用（妈妈报"手机版没声音"时能一眼看出解码了几个、ctx 状态）
    window.__LIVE = {
      loaded: function () { return loadedCount(); },
      state: function () { return ac ? ac.state : 'none'; },
      bufs: bufs
    };
    // 手机上排查：打开 ...live.html?debug=1 会在左下角显示音频状态
    if (/[?&]debug=1/.test(location.search)) {
      const d = document.createElement('div');
      d.id = 'dbg';
      d.style.cssText = 'position:fixed;left:8px;bottom:70px;z-index:40;font:11px/1.6 monospace;' +
        'color:#9df0a8;background:rgba(0,0,0,0.62);padding:7px 9px;border-radius:8px;white-space:pre;max-width:92vw';
      document.body.appendChild(d);
      setInterval(function () {
        const n = loadedCount();
        d.textContent = 'ctx=' + (ac ? ac.state : 'none') + '  bufs=' + n +
          '\npath=' + (useWebAudio === false ? 'audio' : (useWebAudio === null ? '?' : 'webaudio')) +
          '\nlast=' + lastInfo + '\nua=' + navigator.userAgent.slice(0, 42);
      }, 400);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
