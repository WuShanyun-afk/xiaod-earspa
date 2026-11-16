/* 小D的赛博小家 · M60 解压游戏馆 · 四个 2D 解压小游戏
 *
 * 妈妈要的：「互动动画做成 2D 的」—— 所以馆里的四台机器点开以后，
 * 全屏铺一张 canvas，用 2D 手绘 + 指针交互来玩（跟 3D 场景是两套渲染，互不打扰）：
 *
 *   ① 脆皮捏捏乐 crisp ：戳 / 拖，脆皮表面裂开、碎屑崩出来
 *   ② 冰山泥 slime     ：按住拖，泥被拉出尖角，松手回弹（还能按出指印）
 *   ③ 破坏化妆品 make  ：点口红会断，点粉饼会碎成扇形
 *   ④ 敲击 tap         ：一排小木条，敲一下下陷 + 波纹 + 五声音阶
 *
 * 声音全部用 **Web Audio 现场合成**（不依赖任何音频文件，也就没有版权问题）：
 *   脆裂 = 高通白噪短爆 / 黏糊 = 低通噪慢包络 / 碎裂 = 带通噪 / 敲击 = 三角波音阶
 * 如果 assets/relax-audio/ 里有下载来的环境音，会叠一层很轻的底噪（见 relax.js）。
 *
 * 用法：XD.Relax2D.open('crisp', '脆皮捏捏乐', onClose) → 每帧 XD.Relax2D.update(dt)
 */
window.XD = window.XD || {};

XD.Relax2D = (function () {
  'use strict';

  const TAU = Math.PI * 2;
  let cv = null, c2 = null, W = 0, H = 0, dpr = 1;
  let isOpen = false, kind = '', title = '', hint = '';
  let t = 0, onCloseCb = null;
  let ac = null, master = null;
  const ptr = { x: 0, y: 0, px: 0, py: 0, down: false, inside: false };
  let g = {};                       // 当前小游戏的状态
  let lastSound = 0;
  let lastSfx = null;          // M67：最近一次合成音（debug 用，确认点击真的发出了声音）

  /* ================= 声音（Web Audio 合成） ================= */
  function audio() {
    if (ac) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }
  function muted() { return !!(XD.SFX && XD.SFX.isMuted && XD.SFX.isMuted()); }

  let noiseCache = null;
  function noise(dur) {
    const a = audio();
    if (!a) return null;
    if (!noiseCache || noiseCache.duration < dur) {
      const n = Math.max(1, Math.ceil(a.sampleRate * 1.2));
      const buf = a.createBuffer(1, n, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      noiseCache = buf;
    }
    return noiseCache;
  }

  // 噪声型音效：脆裂 / 黏糊 / 碎裂
  function spray(opt) {
    if (muted()) return;
    const a = audio(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    const o = opt || {};
    const dur = o.dur || 0.16;
    const src = a.createBufferSource();
    src.buffer = noise(dur);
    src.playbackRate.value = o.rate || 1;
    const f = a.createBiquadFilter();
    f.type = o.type || 'highpass';
    f.frequency.value = o.freq || 2200;
    f.Q.value = o.q === undefined ? 0.9 : o.q;
    const gn = a.createGain();
    const now = a.currentTime;
    const vol = (o.vol === undefined ? 0.30 : o.vol);
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.exponentialRampToValueAtTime(vol, now + (o.attack || 0.005));
    gn.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(now);
    src.stop(now + dur + 0.03);
  }

  // 音高型音效：敲击
  function tone(freq, dur, vol, type) {
    if (muted()) return;
    const a = audio(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    const now = a.currentTime;
    const osc = a.createOscillator();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    const gn = a.createGain();
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.exponentialRampToValueAtTime(vol || 0.22, now + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 0.28));
    osc.connect(gn); gn.connect(master);
    osc.start(now); osc.stop(now + (dur || 0.28) + 0.02);
  }

  function sfxCrisp(power) {
    const p = power === undefined ? 1 : power;
    // 真录音优先（脆皮捏碎），音高随机抖一点，听不出是同一段
    if (playClip('crisp', { vol: 0.26 + 0.20 * p, rate: 0.94 + Math.random() * 0.14, maxDur: 0.9 })) return;
    spray({ freq: 1500 + Math.random() * 700, dur: 0.12 + 0.07 * p, vol: 0.11 + 0.08 * p, type: 'lowpass', q: 0.6, attack: 0.012 });
    if (Math.random() < 0.5) {
      setTimeout(function () { spray({ freq: 2400, dur: 0.06, vol: 0.05, type: 'lowpass' }); }, 30);
    }
  }
  /* M69：冰山泥 / 史莱姆的黏腻声，全部合成 —— 妈妈：「真实音效像放屁音」
   *
   * 「放屁音」的三个要件：低频 + 短促爆破 + 完全没有音高变化。
   * 助眠的黏腻声恰好反过来：
   *   ① 中低频（200~400），不是 100 那种闷雷；
   *   ② 包络要长（0.4~0.7 秒），慢慢起、慢慢落，不能"噗"一下就没了；
   *   ③ 音高要**慢慢往下滑**（像泥被拉开），这是"黏"的关键；
   *   ④ 只用窄带（bandpass）噪声，绝不用 lowpass —— 宽频低频就是放屁。
   */
  function slimeSquish(power) {
    if (muted()) return;
    const a = audio(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    const p = Math.max(0.35, Math.min(1.4, power === undefined ? 1 : power));
    const now = a.currentTime;
    const f0 = 205 + Math.random() * 55;              // 起音
    const f1 = f0 * (0.68 + Math.random() * 0.20);    // 被"拉开"以后往下走
    const dur = 0.46 + 0.24 * p;

    // ① 主体：缓慢下滑的三角波（"咕——"）
    const o = a.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f0 * 1.32, now);
    o.frequency.exponentialRampToValueAtTime(f0, now + 0.11);
    o.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const og = a.createGain();
    // M69：纯指数衰减会短成"哒"（实测只剩 48ms）。慢起 → 撑住 → 再落，才是一条"黏"
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.25 * p, now + 0.13);
    og.gain.setValueAtTime(0.25 * p, now + dur * 0.5);
    og.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(og); og.connect(master);
    o.start(now); o.stop(now + dur + 0.02);

    // ② 黏丝：窄带噪声，跟着一起走
    spray({ freq: 360 + Math.random() * 170, dur: dur * 0.55, vol: 0.17 * p,
      type: 'bandpass', q: 1.7, attack: 0.12 });
    // ③ 极轻的一点点"吸盘松开"（高频，只作点缀，不能刺）
    spray({ freq: 2300 + Math.random() * 800, dur: 0.22, vol: 0.016,
      type: 'highpass', q: 0.9, attack: 0.06 });
  }

  function sfxSquish(power) {
    // M69：不再放 squish.mp3（那段听着像放屁），直接合成助眠向的"咕啾"
    lastSfx = 'slime';
    slimeSquish(power);
  }
  function sfxCrack() {
    if (playClip('crack', { vol: 0.46, rate: 0.94 + Math.random() * 0.12, maxDur: 0.9 })) return;
    spray({ freq: 900 + Math.random() * 360, dur: 0.14, vol: 0.16, type: 'bandpass', q: 1.0 });
    tone(150 + Math.random() * 50, 0.22, 0.07, 'sine');
  }
  function sfxPowder() {
    if (playClip('powder', { vol: 0.38, rate: 0.96 + Math.random() * 0.10, maxDur: 1.3 })) return;
    spray({ freq: 2400, dur: 0.20, vol: 0.11, type: 'lowpass', attack: 0.01 });
    spray({ freq: 700, dur: 0.24, vol: 0.07, type: 'lowpass', attack: 0.03 });
  }
  const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

  /* M67：木琴改成纯合成（妈妈：「木琴声音还是听不见，用合成音吧」）。
   * 用马林巴/木琴的泛音比（1 : 3 : 6）叠三层正弦，再补一下敲击的"木头"瞬态，
   * 比原来单一个 sine 像多了。 */
  function mallet(freq, dur, vol) {
    if (muted()) return;
    const a = audio(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    const now = a.currentTime;
    // 总包络只负责"别爆音 + 到点收干净"，真正的衰减交给每层的 g2，
    // 不然两个指数衰减相乘，木琴会短成"哒"一声（实测只剩 45ms）
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(1.0, now + 0.004);
    out.gain.setValueAtTime(1.0, now + dur * 0.88);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    out.connect(master);
    // 木头被敲的那一下，泛音衰减更快，所以各层自己带一个包络
    [[1, 1.00, 1.00], [3, 0.20, 0.45], [6, 0.07, 0.22]].forEach(function (h) {
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * h[0], now);
      const g2 = a.createGain();
      g2.gain.setValueAtTime(0.0001, now);
      g2.gain.exponentialRampToValueAtTime(Math.max(0.0004, vol * h[1]), now + 0.003);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + dur * h[2]);
      o.connect(g2); g2.connect(out);
      o.start(now); o.stop(now + dur * h[2] + 0.02);
    });
    // 敲击瞬态（一小撮带通噪声）
    const src = a.createBufferSource();
    src.buffer = noise(0.05);
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, freq * 2.4);
    bp.Q.value = 1.6;
    const ng = a.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(Math.max(0.0004, vol * 0.55), now + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    src.connect(bp); bp.connect(ng); ng.connect(master);
    src.start(now); src.stop(now + 0.06);
  }

  function sfxTap(i) {
    // M67：不再先试真实录音（那段的音量太小，妈妈说听不见），直接合成
    lastSfx = 'tap' + (i % SCALE.length);
    mallet(SCALE[i % SCALE.length], 0.44, 0.30);
  }

  /* ================= 真实录音（M61 / M62） =================
   * 妈妈：「泡泡纸没有声音，木琴声音也不见了」。
   * 原因不是文件坏了 —— 下回来的素材是**一整段长序列**（woodtap 24s、bubble 21s），
   * 开头几秒常常是静音，而点一下只播 0.4~1 秒，播的全是空气，所以听着"没声"。
   * 现在改成：fetch + decodeAudioData 解码，**自己扫出有声的那一段**（first~last），
   * 每次从中间随机挑一小截播。既有声，也不会每下都一模一样。
   * 解码失败 / 还没好 / 404 → 静默退回上面那套合成音。
   */
  const CLIP_DIR = 'assets/relax-audio/';
  const CLIPS = {
    crisp: 'crisp.mp3', squish: 'squish.mp3', crack: 'crack.mp3', powder: 'powder.mp3',
    sand: 'sand.mp3', woodtap: 'woodtap.mp3', bubble: 'bubble.mp3', mouth: 'mouth.mp3',
    brush: 'brush.mp3', feather: 'feather.mp3', rain: 'rain.mp3', bowl: 'bowl.mp3',
    // M64：直播模式会用到的四样（之前漏在这里，所以直播里点玻璃杯/棉布/流水棒/胶带没声）
    glass: 'glass.mp3', cloth: 'cloth.mp3', water: 'water.mp3', peel: 'peel.mp3'
  };
  const clipRec = {};        // key -> { buf, first, last, peak }
  const clipDead = {};
  let clipLoading = false;

  // 扫一遍波形，找出「真正有声」的起止点（跳过开头/结尾的静音）
  function analyzeBuffer(buf) {
    const ch = buf.getChannelData(0);
    const n = ch.length;
    const sr = buf.sampleRate || 44100;
    const step = Math.max(1, Math.floor(sr / 250));        // 4ms 一格
    const peaks = [];
    for (let i = 0; i < n; i += step) {
      let m = 0;
      const end = Math.min(i + step, n);
      for (let j = i; j < end; j++) {
        const v = ch[j] < 0 ? -ch[j] : ch[j];
        if (v > m) m = v;
      }
      peaks.push(m);
    }
    let mx = 0;
    for (let i = 0; i < peaks.length; i++) if (peaks[i] > mx) mx = peaks[i];
    const gate = Math.max(0.012, mx * 0.16);               // 噪声门
    let s = 0;
    while (s < peaks.length && peaks[s] < gate) s++;
    let e = peaks.length - 1;
    while (e > s && peaks[e] < gate) e--;
    const dur = buf.duration || (n / sr);
    let first = (s * step) / sr;
    let last = ((e + 1) * step) / sr;
    if (last - first < 0.12) { first = 0; last = dur; }    // 找不到就当整段都能用
    return { buf: buf, first: first, last: Math.min(last, dur), peak: mx };
  }

  function loadClips() {
    if (clipLoading) return;
    clipLoading = true;
    const a = audio();
    if (!a) { clipLoading = false; return; }
    Object.keys(CLIPS).forEach(function (k) {
      const url = CLIP_DIR + CLIPS[k];
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (res, rej) {
          try { a.decodeAudioData(ab, res, rej); } catch (e) { rej(e); }
        });
      }).then(function (buf) {
        clipRec[k] = analyzeBuffer(buf);
      }).catch(function () { clipDead[CLIPS[k]] = true; });
    });
  }

  // M62.1：播放改回 <audio> —— Web Audio 那条路在某些浏览器策略下（context 一直 suspended）
  // 会出现「返回成功但没声」；<audio> 是稳的。之前真没声的原因只是**从第 0 秒播到了静音段**，
  // 所以现在只做一件事：先 seek 到有声段起点，再播。
  const CLIP_OFFSET = {          // 解码拿不到时的后备（实测值）
    crisp: 0.31, squish: 0.42, crack: 0.43, powder: 0.58, sand: 0.02, woodtap: 0.62,
    bubble: 1.23, mouth: 0.07, brush: 0.11, feather: 1.40, rain: 0.37, bowl: 0.04,
    glass: 0.30, cloth: 0.40, water: 0.30, peel: 0.15
  };
  const clipPool = {};           // key -> [HTMLAudioElement]
  const clipIdx = {};
  const clipTimers = {};
  let lastPlay = null;

  function clipEls(k) {
    if (clipPool[k]) return clipPool[k];
    const arr = [];
    for (let i = 0; i < 2; i++) {
      const a = new Audio(CLIP_DIR + CLIPS[k]);
      a.preload = 'auto';
      a.addEventListener('error', function () { clipDead[CLIPS[k]] = true; });
      arr.push(a);
    }
    clipPool[k] = arr;
    clipIdx[k] = 0;
    return arr;
  }

  // 从有声段里挑一小截播。maxDur 是**想要的时长**（秒）。
  function playClip(k, opt) {
    if (muted()) return false;
    if (!CLIPS[k] || clipDead[CLIPS[k]]) return false;
    const arr = clipEls(k);
    const o = opt || {};
    const want = o.maxDur || 0.6;
    const rec = clipRec[k];
    const first = rec ? rec.first : (CLIP_OFFSET[k] || 0);
    const last = rec ? rec.last : first + 4;
    const usable = Math.max(0.25, last - first);
    const span = Math.max(0, usable - want);
    const off = first + (span > 0.05 ? Math.random() * span : 0) + 0.01;
    let el = null;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[(clipIdx[k] + i) % arr.length];
      if (c.paused || c.ended) { el = c; clipIdx[k] = (clipIdx[k] + i + 1) % arr.length; break; }
    }
    if (!el) { el = arr[clipIdx[k]]; clipIdx[k] = (clipIdx[k] + 1) % arr.length; }
    try {
      el.pause();
      try { el.currentTime = off; } catch (e) {}
      el.volume = Math.min(1, o.vol === undefined ? 0.4 : o.vol);
      el.playbackRate = o.rate || 1;
      const p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { return false; }
    if (clipTimers[k]) clearTimeout(clipTimers[k]);
    clipTimers[k] = setTimeout(function () { try { el.pause(); } catch (e) {} }, want * 1000 + 40);
    lastPlay = { k: k, off: Math.round(off * 100) / 100 };
    wave = 1;
    return true;
  }

  /* ================= 直播间的助眠底噪（M61） =================
   * 妈妈说「助眠直播间最好要有口腔音和各种助眠音效」。进 2D 画面以后，
   * 3D 房间的 lo-fi 会停掉（上一版加的），这里补一层很轻的雨声当底噪 ——
   * 和手里的解压音效错开频段，不抢戏，听着像真的在直播间里。
   */
  let asmrEl = null;
  function startAsmr() {
    if (muted()) return;
    if (!asmrEl) {
      try {
        asmrEl = new Audio(CLIP_DIR + 'rain.mp3');
        asmrEl.loop = true;
        // 小红书上那条助眠合集下面最高赞的评论是「建议背景声音小一点，听着有点急」，
        // 所以底噪再往下降一档，只留"房间感"
        asmrEl.volume = 0.032;
        asmrEl.preload = 'auto';
      } catch (e) { asmrEl = null; return; }
    }
    try {
      if (asmrEl.currentTime < 0.36) { try { asmrEl.currentTime = 0.37; } catch (e) {} }
      const p = asmrEl.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function stopAsmr() {
    if (!asmrEl) return;
    try { asmrEl.pause(); } catch (e) {}
  }

  /* ================= 画布 ================= */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.id = 'relax2d';
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:60;display:none;touch-action:none;cursor:crosshair';
    document.body.appendChild(cv);
    c2 = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    cv.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      ptr.x = (e.clientX - r.left); ptr.y = (e.clientY - r.top);
      ptr.px = ptr.x; ptr.py = ptr.y; ptr.down = true;
      clickDown();
    });
    cv.addEventListener('pointermove', function (e) {
      e.stopPropagation();
      const r = cv.getBoundingClientRect();
      ptr.px = ptr.x; ptr.py = ptr.y;
      ptr.x = (e.clientX - r.left); ptr.y = (e.clientY - r.top);
      ptr.inside = true;
      if (ptr.down) dragMove();
    });
    cv.addEventListener('pointerup', function (e) {
      if (e) e.stopPropagation();
      if (!ptr.down) return;
      ptr.down = false;
      dragUp();
    });
    cv.addEventListener('pointerleave', function () { ptr.inside = false; });
    window.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    }, true);
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ================= 打开 / 关闭 ================= */
  const TITLES = {
    crisp: '脆皮捏捏乐',
    slime: '冰山泥',
    make: '破坏化妆品',
    tap: '敲击木琴',
    bubble: '泡泡纸',
    sand: '沙画'
  };
  const HINTS = {
    crisp: '戳它、拖它——脆皮会裂开，碎屑会崩出来',
    slime: '按住往外拉，松手会弹回去；轻轻按还能按出指印',
    make: '点口红会断，点粉饼会碎成几块',
    tap: '从左到右敲一排，越往右音越高',
    bubble: '一格一格按破它 —— 啵、啵、啵',
    sand: '手指划过去就是一道沟，来回划'
  };

  function open(k, cb) {
    ensureCanvas();
    // 第一人称时鼠标是被锁住的，先放出来，不然 2D 里的指针位置不对
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
    kind = k || 'crisp';
    title = TITLES[kind] || '解压';
    hint = HINTS[kind] || '';
    onCloseCb = cb || null;
    t = 0;
    ptr.down = false;
    audio();
    if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    loadClips();                    // 预热真实录音（M62：解码 + 找有声段）
    if (kind === 'crisp') initCrisp();
    else if (kind === 'slime') initSlime();
    else if (kind === 'make') initMake();
    else if (kind === 'tap') initTap();
    else if (kind === 'bubble') initBubble();
    else initSand();
    cv.style.display = 'block';
    isOpen = true;
    startAsmr();
    return true;
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    stopAsmr();
    if (chatEl) chatEl.style.display = 'none';
    if (cv) cv.style.display = 'none';
    const cb = onCloseCb;
    onCloseCb = null;
    if (cb) { try { cb(); } catch (e) {} }
  }

  /* ================= 公共：背景 / 标题 / 关闭键 ================= */
  function bg(tone1, tone2) {
    const grd = c2.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, tone1);
    grd.addColorStop(1, tone2);
    c2.fillStyle = grd;
    c2.fillRect(0, 0, W, H);
  }

  /* ================= 公共：直播画面（小D + 观众 + 弹幕） ================= */
  let audience = 6;
  let wave = 0;                 // 玩家动手时小D的鳍跟着动
  const danmu = [];
  let danmuT = 1.2;
  const DANMU_LINES = [
    '这个声音好舒服…', '主播手好稳', '晚安晚安', '再来一次那个',
    '听着这个能睡着', '已收藏', '耳机党狂喜', '这个泥拉得好长',
    '好解压啊', '比数羊管用', '这个点了还不睡吗', '偷偷看直播'
  ];

  function bumpAudience() {
    audience = Math.min(999, audience + 1 + Math.floor(Math.random() * 2));
    wave = 1;
    if (Math.random() < 0.35) {
      danmu.push({
        x: W + 20 + Math.random() * 300, y: 118 + Math.random() * 180,
        text: DANMU_LINES[Math.floor(Math.random() * DANMU_LINES.length)],
        life: 1, sp: 46 + Math.random() * 30
      });
    }
  }

  // 左下角：正在直播的小D（2D 手绘胖鲸鱼，戴耳机）
  function drawStreamer(dt) {
    wave = Math.max(0, wave - dt * 2.6);
    audience += dt * 0.35;                       // 慢慢地涨
    const cx = 108, cy = H - 120, R = 52;
    const bob = Math.sin(t * 1.3) * 2.2;
    c2.save();
    c2.translate(cx, cy + bob);

    // 身体
    const grd = c2.createLinearGradient(-R, -R, 0, R);
    grd.addColorStop(0, 'rgba(150,182,214,0.98)');
    grd.addColorStop(1, 'rgba(96,132,172,0.98)');
    c2.fillStyle = grd;
    c2.beginPath();
    c2.ellipse(0, 0, R * 1.06, R * 0.92, 0, 0, TAU);
    c2.fill();
    // 白肚
    c2.fillStyle = 'rgba(232,242,250,0.95)';
    c2.beginPath();
    c2.ellipse(0, R * 0.30, R * 0.72, R * 0.52, 0, 0, TAU);
    c2.fill();
    // 尾鳍
    c2.fillStyle = 'rgba(96,132,172,0.98)';
    c2.beginPath();
    c2.moveTo(-R * 0.92, R * 0.16);
    c2.lineTo(-R * 1.44, -R * 0.30);
    c2.lineTo(-R * 1.40, R * 0.42);
    c2.closePath();
    c2.fill();
    // 胸鳍（会跟着点击上下摆）
    const finSwing = Math.sin(t * 7) * 0.16 * wave;
    c2.save();
    c2.translate(R * 0.52, R * 0.30);
    c2.rotate(-0.5 + finSwing);
    c2.fillStyle = 'rgba(112,148,188,0.98)';
    c2.beginPath();
    c2.ellipse(0, 0, R * 0.34, R * 0.16, 0, 0, TAU);
    c2.fill();
    c2.restore();
    // 眼睛（会眨）
    const blink = (Math.sin(t * 0.9) > 0.985) ? 0.12 : 1;
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(28,34,44,0.95)';
      c2.beginPath();
      c2.ellipse(s * R * 0.34, -R * 0.10, R * 0.075, R * 0.075 * blink, 0, 0, TAU);
      c2.fill();
      c2.fillStyle = 'rgba(255,255,255,0.9)';
      c2.beginPath();
      c2.arc(s * R * 0.34 + R * 0.025, -R * 0.13, R * 0.025, 0, TAU);
      c2.fill();
    });
    // 腮红
    c2.fillStyle = 'rgba(226,142,146,0.5)';
    [-1, 1].forEach(function (s) {
      c2.beginPath();
      c2.ellipse(s * R * 0.66, R * 0.06, R * 0.14, R * 0.08, 0, 0, TAU);
      c2.fill();
    });
    // 耳机
    c2.strokeStyle = 'rgba(38,44,56,0.95)';
    c2.lineWidth = R * 0.13;
    c2.lineCap = 'round';
    c2.beginPath();
    c2.arc(0, -R * 0.12, R * 1.02, Math.PI * 1.12, Math.PI * 1.88);
    c2.stroke();
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(38,44,56,0.95)';
      c2.beginPath();
      c2.arc(s * R * 1.00, -R * 0.12, R * 0.20, 0, TAU);
      c2.fill();
      c2.fillStyle = 'rgba(224,143,154,0.95)';
      c2.beginPath();
      c2.arc(s * R * 0.92, -R * 0.12, R * 0.11, 0, TAU);
      c2.fill();
    });
    // 耳机上的小灯（正在直播）
    c2.fillStyle = 'rgba(255,90,106,' + (0.5 + 0.5 * Math.abs(Math.sin(t * 2.4))) + ')';
    c2.beginPath();
    c2.arc(-R * 1.00, -R * 0.34, R * 0.045, 0, TAU);
    c2.fill();
    c2.restore();
  }

  function drawDanmu(dt) {
    // 自然的弹幕 + 定时补一条
    danmuT -= dt;
    if (danmuT <= 0) {
      danmuT = 2.6 + Math.random() * 3.4;
      if (danmu.length < 7) {
        danmu.push({
          x: W + 20 + Math.random() * 320, y: 118 + Math.random() * 190,
          text: DANMU_LINES[Math.floor(Math.random() * DANMU_LINES.length)],
          life: 1, sp: 40 + Math.random() * 26
        });
      }
    }
    for (let i = danmu.length - 1; i >= 0; i--) {
      const d = danmu[i];
      d.x -= d.sp * dt;
      if (d.x < -260) { danmu.splice(i, 1); continue; }
      c2.save();
      c2.font = '400 15px "Microsoft YaHei","PingFang SC",sans-serif';
      const tw = c2.measureText(d.text).width;
      // M66：直播间是助眠场，弹幕再压淡一点，别抢戏
      const dim = (kind === 'live') ? 0.72 : 1;
      c2.globalAlpha = 0.72 * dim;
      c2.fillStyle = d.mine ? 'rgba(255,140,170,0.24)' : 'rgba(255,255,255,0.10)';
      roundRect(c2, d.x - tw - 16, d.y - 15, tw + 26, 30, 15);
      c2.fill();
      c2.globalAlpha = 0.92 * dim;
      c2.fillStyle = d.mine ? 'rgba(255,214,226,0.96)' : 'rgba(255,255,255,0.88)';
      c2.textAlign = 'left';
      c2.textBaseline = 'middle';
      c2.fillText(d.text, d.x - tw - 4, d.y);
      c2.restore();
    }
  }

  function ui(dt) {
    drawDanmu(dt || 0.016);
    drawStreamer(dt || 0.016);
    const bx = W - 54, by = 46, br = 24;
    c2.save();
    c2.globalAlpha = 0.9;
    c2.beginPath();
    c2.arc(bx, by, br, 0, TAU);
    c2.fillStyle = 'rgba(255,255,255,0.14)';
    c2.fill();
    c2.strokeStyle = 'rgba(255,255,255,0.55)';
    c2.lineWidth = 2;
    c2.beginPath();
    c2.moveTo(bx - 7, by - 7); c2.lineTo(bx + 7, by + 7);
    c2.moveTo(bx + 7, by - 7); c2.lineTo(bx - 7, by + 7);
    c2.stroke();
    // 标题
    c2.fillStyle = 'rgba(255,255,255,0.94)';
    c2.font = '700 26px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.textAlign = 'left';
    c2.textBaseline = 'middle';
    c2.fillText(title, 40, 46);
    c2.font = '400 15px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.62)';
    c2.fillText(hint, 40, 74);
    // LIVE + 观众数
    const lv = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2));
    c2.fillStyle = 'rgba(255,90,106,' + lv + ')';
    c2.beginPath();
    c2.arc(46, 108, 6, 0, TAU);
    c2.fill();
    c2.fillStyle = 'rgba(255,255,255,0.85)';
    c2.font = '700 14px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillText('LIVE', 60, 108);
    c2.font = '400 14px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.fillText(Math.floor(audience) + ' 人在看', 108, 108);
    c2.textAlign = 'right';
    c2.font = '400 13px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.45)';
    c2.fillText('点右上角 × 或按 Esc 回去', W - 40, 92);
    c2.textAlign = 'left';
    c2.restore();
    // 小D 的一句话（放在右下，别压到左下角直播的小D）
    c2.save();
    c2.globalAlpha = 0.5;
    c2.fillStyle = 'rgba(255,255,255,0.85)';
    c2.font = '400 15px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.textAlign = 'right';
    c2.fillText('小D ： 慢慢来，不着急 —— 这个坏掉了就坏了，不用负责', W - 40, H - 34);
    c2.restore();
  }

  function hitClose() {
    return Math.hypot(ptr.x - (W - 54), ptr.y - 46) < 30;
  }

  /* ================= ① 脆皮捏捏乐 ================= */
  function initCrisp() {
    const s = Math.min(W, H) * 0.30;
    g = {
      cx: W / 2, cy: H / 2 + 20, w: s, h: s * 0.82,
      cracks: [], bits: [], dents: [],
      hits: 0, broken: 0, flash: 0, shake: 0,
      lastHit: -1
    };
  }

  function crispRect() {
    const r = Math.min(g.w, g.h) * 0.16;
    return { x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h, r: r };
  }

  function crispDown() {
    if (g.broken) { initCrisp(); sfxCrisp(0.6); return; }
    const R = crispRect();
    const px = ptr.x, py = ptr.y;
    if (px < R.x - 20 || px > R.x + R.w + 20 || py < R.y - 20 || py > R.y + R.h + 20) return;
    doCrispHit(px, py, 1);
  }

  function doCrispHit(px, py, power) {
    const now = performance.now();
    if (now - g.lastHit < 45) return;      // 拖拽时别太密
    g.lastHit = now;
    g.hits++;
    g.shake = Math.min(1, g.shake + 0.5);
    g.flash = 1;
    // 裂纹：从点击点往外长 3~6 条
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const len = 14 + Math.random() * (Math.min(g.w, g.h) * 0.22);
      const segs = [];
      let x = px, y = py, dir = a;
      const steps = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < steps; k++) {
        dir += (Math.random() - 0.5) * 0.9;
        const l = len / steps;
        x += Math.cos(dir) * l;
        y += Math.sin(dir) * l;
        segs.push([x, y]);
      }
      g.cracks.push({ x0: px, y0: py, segs: segs, life: 1, w: 1 + Math.random() * 1.8 });
    }
    // 碎屑
    const nb = 5 + Math.floor(Math.random() * 6 * power);
    for (let i = 0; i < nb; i++) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 220;
      g.bits.push({
        x: px, y: py,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
        s: 2 + Math.random() * 4.5, life: 1
      });
    }
    if (g.cracks.length > 90) g.cracks.splice(0, g.cracks.length - 90);
    sfxCrisp(power * (0.7 + Math.random() * 0.5));
    if (g.hits > 16) g.broken = 1;
  }

  function crispDraw(dt) {
    bg('#241b22', '#12100f');
    const R = crispRect();
    g.shake = Math.max(0, g.shake - dt * 2.4);
    g.flash = Math.max(0, g.flash - dt * 3.2);

    c2.save();
    c2.translate(g.cx, g.cy);
    const sh = g.shake * 2.2;
    c2.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    c2.translate(-g.cx, -g.cy);

    // 影子
    c2.save();
    c2.globalAlpha = 0.5;
    c2.filter = 'blur(18px)';
    c2.fillStyle = '#000';
    c2.beginPath();
    c2.ellipse(g.cx, g.cy + g.h * 0.55, g.w * 0.48, g.h * 0.16, 0, 0, TAU);
    c2.fill();
    c2.restore();

    // 脆皮块（奶白 + 侧面深一点，做出厚度）
    const grd = c2.createLinearGradient(R.x, R.y, R.x, R.y + R.h);
    grd.addColorStop(0, '#fffaf0');
    grd.addColorStop(0.62, '#f0e3cd');
    grd.addColorStop(1, '#c9b28c');
    c2.beginPath();
    roundRect(c2, R.x, R.y, R.w, R.h, R.r);
    c2.fillStyle = grd;
    c2.fill();
    // 高光
    c2.save();
    c2.beginPath();
    roundRect(c2, R.x, R.y, R.w, R.h, R.r);
    c2.clip();
    const hl = c2.createRadialGradient(R.x + R.w * 0.3, R.y + R.h * 0.22, 4, R.x + R.w * 0.3, R.y + R.h * 0.22, R.w * 0.6);
    hl.addColorStop(0, 'rgba(255,255,255,0.85)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = hl;
    c2.fillRect(R.x, R.y, R.w, R.h);
    // 表面细颗粒
    c2.globalAlpha = 0.30;
    for (let i = 0; i < 340; i++) {
      const px = R.x + Math.random() * R.w;
      const py = R.y + Math.random() * R.h;
      c2.fillStyle = Math.random() < 0.55 ? '#fffdf6' : '#b0905f';
      c2.fillRect(px, py, 1.8, 1.8);
    }
    // 脆皮本身的细纹（还没戳就有的那种）
    c2.globalAlpha = 0.20;
    c2.strokeStyle = '#9c7c50';
    c2.lineWidth = 1.1;
    for (let i = 0; i < 7; i++) {
      const x0 = R.x + 14 + Math.random() * (R.w - 28);
      const y0 = R.y + 14 + Math.random() * (R.h - 28);
      c2.beginPath();
      c2.moveTo(x0, y0);
      let x = x0, y = y0;
      for (let k = 0; k < 3; k++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 30;
        c2.lineTo(x, y);
      }
      c2.stroke();
    }
    c2.restore();

    // 裂纹
    c2.lineCap = 'round';
    for (let i = 0; i < g.cracks.length; i++) {
      const cr = g.cracks[i];
      c2.strokeStyle = 'rgba(86,58,34,' + (0.85 * Math.min(1, cr.life * 2)) + ')';
      c2.lineWidth = cr.w;
      c2.beginPath();
      c2.moveTo(cr.x0, cr.y0);
      for (let k = 0; k < cr.segs.length; k++) c2.lineTo(cr.segs[k][0], cr.segs[k][1]);
      c2.stroke();
    }
    c2.restore();

    // 碎屑
    for (let i = g.bits.length - 1; i >= 0; i--) {
      const b = g.bits[i];
      b.vy += 900 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      b.life -= dt * 0.5;
      if (b.life <= 0 || b.y > H + 40) { g.bits.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = Math.min(1, b.life);
      c2.translate(b.x, b.y);
      c2.rotate(b.rot);
      c2.fillStyle = i % 2 ? '#fff6e4' : '#d8c096';
      c2.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.8);
      c2.restore();
    }

    // 戳进去的闪光
    if (g.flash > 0) {
      c2.save();
      c2.globalAlpha = g.flash * 0.35;
      c2.fillStyle = '#fff';
      c2.beginPath();
      c2.arc(ptr.x, ptr.y, 24 + (1 - g.flash) * 60, 0, TAU);
      c2.fill();
      c2.restore();
    }

    if (g.broken) {
      c2.save();
      c2.textAlign = 'center';
      c2.fillStyle = 'rgba(255,255,255,0.92)';
      c2.font = '700 30px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillText('捏碎了 —— 再给你一个', W / 2, H / 2 + 10);
      c2.font = '400 16px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,255,255,0.7)';
      c2.fillText('点一下重新来', W / 2, H / 2 + 44);
      c2.restore();
    }
    ui(dt);
  }

  /* ================= ② 冰山泥 ================= */
  function initSlime() {
    const R = Math.min(W, H) * 0.20;
    const N = 40;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      pts.push({ a: a, r: R * (0.86 + Math.random() * 0.2), br: 0, bv: 0, x: 0, y: 0 });
    }
    g = {
      cx: W / 2, cy: H / 2 + 20, R: R, pts: pts,
      drag: false, grab: -1, gl: 0,
      dents: [], shine: 0
    };
    slimeReset();
  }
  function slimeReset() {
    for (let i = 0; i < g.pts.length; i++) {
      const p = g.pts[i];
      p.x = g.cx + Math.cos(p.a) * p.r;
      p.y = g.cy + Math.sin(p.a) * p.r * 0.86;
      p.br = 0; p.bv = 0;
    }
  }
  function slimeDown() {
    // 找离指针最近的两个轮廓点，开始拉
    let best = -1, bd = 1e9;
    for (let i = 0; i < g.pts.length; i++) {
      const d = Math.hypot(g.pts[i].x - ptr.x, g.pts[i].y - ptr.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (bd < g.R * 1.35) {
      g.drag = true;
      g.grab = best;
      g.dents.push({ x: ptr.x, y: ptr.y, r: 0, life: 1 });
      sfxSquish(0.6);
    }
  }
  function slimeMove() {
    if (!g.drag) return;
    const dx = ptr.x - g.cx, dy = ptr.y - g.cy;
    const dist = Math.hypot(dx, dy);
    const maxR = g.R * 2.1;
    const k = dist > maxR ? maxR / dist : 1;
    const tx = g.cx + dx * k, ty = g.cy + dy * k;
    // 离指针越近的点被拉得越多
    for (let i = 0; i < g.pts.length; i++) {
      const p = g.pts[i];
      const d = Math.hypot(p.x - ptr.x, p.y - ptr.y);
      const w = Math.max(0, 1 - d / (g.R * 1.5));
      if (w <= 0) continue;
      p.x += (tx - p.x) * w * 0.22;
      p.y += (ty - p.y) * w * 0.22;
      p.br = Math.min(0.5, p.br + w * 0.02);
    }
    // M69：合成的黏声一条有 0.5~0.7 秒，160ms 一次会糊成一片 —— 拉宽到 320ms，音量也压低
    if (performance.now() - g.gl > 320) { g.gl = performance.now(); sfxSquish(0.32); }
  }
  function slimeUp() {
    if (!g.drag) return;
    g.drag = false;
    g.grab = -1;
    for (let i = 0; i < g.pts.length; i++) g.pts[i].bv += 0.2;
    sfxSquish(0.9);
  }
  function slimeDraw(dt) {
    bg('#0f1b24', '#08121a');
    // 底下一层"盘子"
    c2.save();
    c2.globalAlpha = 0.4;
    c2.fillStyle = '#000';
    c2.beginPath();
    c2.ellipse(g.cx, g.cy + g.R * 0.95, g.R * 1.15, g.R * 0.22, 0, 0, TAU);
    c2.fill();
    c2.restore();

    // 顶点回弹（弹簧）
    for (let i = 0; i < g.pts.length; i++) {
      const p = g.pts[i];
      const bx = g.cx + Math.cos(p.a) * p.r;
      const by = g.cy + Math.sin(p.a) * p.r * 0.86;
      if (!g.drag) {
        p.bv += (bx - p.x) * 0.22;
        p.bv *= 0.86;
        p.x += p.bv;
        p.y += p.bv * 0.85;
      }
    }
    if (g.drag) slimeMove();

    // 泥本体
    c2.save();
    c2.beginPath();
    c2.moveTo(g.pts[0].x, g.pts[0].y);
    for (let i = 0; i < g.pts.length; i++) {
      const a = g.pts[i], b = g.pts[(i + 1) % g.pts.length];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      c2.quadraticCurveTo(a.x, a.y, mx, my);
    }
    c2.closePath();
    const grd = c2.createRadialGradient(g.cx - g.R * 0.3, g.cy - g.R * 0.45, g.R * 0.1, g.cx, g.cy, g.R * 1.5);
    grd.addColorStop(0, 'rgba(226,246,255,0.96)');
    grd.addColorStop(0.45, 'rgba(150,214,240,0.92)');
    grd.addColorStop(1, 'rgba(78,148,196,0.92)');
    c2.fillStyle = grd;
    c2.fill();
    c2.clip();
    // 内部气泡 / 冰裂纹
    c2.globalAlpha = 0.5;
    c2.strokeStyle = 'rgba(255,255,255,0.75)';
    c2.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const a = i * 1.7 + 0.4;
      const rr = g.R * (0.25 + (i % 3) * 0.2);
      c2.beginPath();
      c2.arc(g.cx + Math.cos(a) * rr * 0.6, g.cy + Math.sin(a) * rr * 0.5, 3 + (i % 4) * 3, 0, TAU);
      c2.stroke();
    }
    c2.restore();

    // 高光
    c2.save();
    c2.globalAlpha = 0.55;
    c2.fillStyle = '#fff';
    c2.beginPath();
    c2.ellipse(g.cx - g.R * 0.32, g.cy - g.R * 0.42, g.R * 0.22, g.R * 0.11, -0.5, 0, TAU);
    c2.fill();
    c2.restore();

    // 指印（按下时留下的浅坑）
    for (let i = g.dents.length - 1; i >= 0; i--) {
      const d = g.dents[i];
      d.life -= dt * 0.5;
      d.r += dt * 12;
      if (d.life <= 0) { g.dents.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = d.life * 0.30;
      c2.fillStyle = '#3e7fa8';
      c2.beginPath();
      c2.ellipse(d.x, d.y, d.r * 0.9, d.r * 0.62, 0, 0, TAU);
      c2.fill();
      c2.restore();
    }

    // 拉丝
    if (g.drag) {
      c2.save();
      c2.globalAlpha = 0.5;
      c2.strokeStyle = 'rgba(220,245,255,0.9)';
      c2.lineWidth = 6;
      c2.lineCap = 'round';
      c2.beginPath();
      c2.moveTo(g.cx, g.cy);
      c2.quadraticCurveTo((g.cx + ptr.x) / 2, (g.cy + ptr.y) / 2, ptr.x, ptr.y);
      c2.stroke();
      c2.restore();
    }
    ui(dt);
  }

  /* ================= ③ 破坏化妆品 ================= */
  function initMake(keepAuto) {
    const R = Math.min(W, H);
    const prev = (g && g.auto) ? g.auto : null;
    g = {
      lip: { x: W / 2 - R * 0.30, y: H / 2 + R * 0.06, broken: false, fly: null },
      pow: { x: W / 2 + R * 0.30, y: H / 2 + R * 0.06, r: R * 0.15, broken: false },
      chips: [], shards: [],
      // M61：小D 自动拆（妈妈：「我想看你自动破坏化妆品」）
      auto: {
        on: !!(keepAuto && prev && prev.on),
        idle: 0, step: 0, t: 0, done: false, vis: 0,
        fx: W * 0.74, fy: H * 0.74
      }
    };
  }
  function breakLip() {
    const L = g.lip;
    if (!L || L.broken) return false;
    const lh = 150;
    L.broken = true;
    sfxCrack(); sfxPowder();
    L.fly = {
      x: L.x, y: L.y - lh * 0.55, vx: (Math.random() - 0.5) * 260,
      vy: -260, rot: 0, vr: 6 + Math.random() * 5
    };
    for (let i = 0; i < 10; i++) {
      g.chips.push({
        x: L.x, y: L.y - lh * 0.6, vx: (Math.random() - 0.5) * 320, vy: -120 - Math.random() * 260,
        s: 3 + Math.random() * 6, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
        c: i % 3 ? '#c8324a' : '#e0637a', life: 1
      });
    }
    bumpAudience();
    return true;
  }
  function breakPowder() {
    const P = g.pow;
    if (!P || P.broken) return false;
    P.broken = true;
    sfxPowder(); sfxCrack();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + Math.random() * 0.3;
      g.shards.push({
        a: a, d: 0, vd: 40 + Math.random() * 140,
        s: P.r * 0.34, rot: a, vr: (Math.random() - 0.5) * 6, life: 1,
        c: i % 3 ? '#f0dcc4' : '#dcc2a2'
      });
    }
    for (let i = 0; i < 12; i++) {
      g.chips.push({
        x: P.x, y: P.y, vx: (Math.random() - 0.5) * 240, vy: -140 - Math.random() * 200,
        s: 2 + Math.random() * 4, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
        c: '#f2e2ca', life: 1
      });
    }
    bumpAudience();
    return true;
  }
  function makeDown() {
    const A = g.auto;
    if (A && A.on) { A.on = false; A.vis = 0; }   // 妈妈动手了，我就让开
    const L = g.lip, P = g.pow;
    // 口红（竖条）
    const lw = 26, lh = 150;
    if (!L.broken && Math.abs(ptr.x - L.x) < lw && ptr.y > L.y - lh && ptr.y < L.y + 40) {
      breakLip();
      return;
    }
    // 粉饼
    if (!P.broken && Math.hypot(ptr.x - P.x, ptr.y - P.y) < P.r * 1.15) {
      breakPowder();
      return;
    }
    // 点空地 → 重置
    if (L.broken && P.broken) { initMake(); }
  }

  // 小D 的鳍（自动拆时从右下伸进来）
  function drawFin(x, y, vis) {
    const R = 58;
    c2.save();
    // 手臂：从画面右下角伸出的一小截软带（只画 35%，不然会像一根柱子横穿画面）
    c2.globalAlpha = Math.min(1, vis) * 0.55;
    const ax = W * 0.94 + (x - W * 0.94) * 0.35;
    const ay = H * 1.02 + (y - H * 1.02) * 0.35;
    c2.strokeStyle = 'rgba(112,148,188,0.75)';
    c2.lineWidth = R * 0.42;
    c2.lineCap = 'round';
    c2.beginPath();
    c2.moveTo(W * 0.94, H * 1.02);
    c2.quadraticCurveTo((W * 0.94 + ax) / 2 + 40, (H * 1.02 + ay) / 2 + 30, ax, ay);
    c2.stroke();
    c2.globalAlpha = Math.min(1, vis);
    c2.translate(x, y);
    c2.rotate(-0.38);
    c2.fillStyle = 'rgba(112,148,188,0.96)';
    c2.strokeStyle = 'rgba(66,96,132,0.9)';
    c2.lineWidth = 3;
    c2.beginPath();
    c2.ellipse(0, 0, R * 0.92, R * 0.44, 0, 0, TAU);
    c2.fill();
    c2.stroke();
    c2.globalAlpha *= 0.55;
    c2.strokeStyle = 'rgba(52,80,112,0.75)';
    c2.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      c2.beginPath();
      c2.moveTo(i * R * 0.26, -R * 0.36);
      c2.lineTo(i * R * 0.26, R * 0.34);
      c2.stroke();
    }
    c2.restore();
  }
  function makeDraw(dt) {
    bg('#221a26', '#120d14');
    // ── 小D 自动拆（M61）──
    // 进画面后 4.5 秒不动手，我就自己伸鳍过去拆；拆完换一套接着拆。
    {
      const A = g.auto;
      if (!A.on) {
        A.idle += dt;
        A.vis = Math.max(0, A.vis - dt * 3);
        if (A.idle > 4.5) { A.on = true; A.step = 0; A.t = 0; A.done = false; }
      } else {
        A.t += dt;
        A.vis = Math.min(1, A.vis + dt * 3);
        const tgt = A.step === 0 ? g.lip : g.pow;
        const tx = tgt.x + (A.step === 0 ? 8 : 0);
        const ty = tgt.y - (A.step === 0 ? 46 : 0);
        const restX = W * 0.74, restY = H * 0.76;
        let k = Math.min(1, A.t / 0.9);
        k = k * k * (3 - 2 * k);                 // 缓入缓出，鳍伸过去才像有手
        A.fx = restX + (tx - restX) * k;
        A.fy = restY + (ty - restY) * k;
        if (A.t >= 0.9 && !A.done) {
          A.done = true;
          if (A.step === 0) breakLip(); else if (A.step === 1) breakPowder();
        }
        const hold = A.step >= 2 ? 1.3 : 2.2;
        if (A.t >= hold) {
          A.t = 0; A.done = false; A.step++;
          if (A.step > 2) { initMake(true); g.auto.idle = 0; }
        }
      }
    }
    const L = g.lip, P = g.pow;
    const R = Math.min(W, H);
    const lh = 150;

    // 口红
    c2.save();
    c2.translate(L.x, L.y);
    // 底座
    c2.fillStyle = '#2a2a30';
    roundRect(c2, -30, -10, 60, 46, 8); c2.fill();
    c2.fillStyle = '#c9a24a';
    roundRect(c2, -26, -4, 52, 10, 4); c2.fill();
    if (!L.broken) {
      // 膏体（斜切顶）
      const grd = c2.createLinearGradient(-24, 0, 24, 0);
      grd.addColorStop(0, '#8e1f33');
      grd.addColorStop(0.45, '#d63a55');
      grd.addColorStop(1, '#a3243a');
      c2.beginPath();
      c2.moveTo(-24, -8);
      c2.lineTo(-24, -lh);
      c2.lineTo(6, -lh + 26);
      c2.lineTo(24, -8);
      c2.closePath();
      c2.fillStyle = grd;
      c2.fill();
      // 高光
      c2.fillStyle = 'rgba(255,255,255,0.28)';
      c2.fillRect(-16, -lh + 10, 5, lh - 30);
    }
    c2.restore();

    // 断掉飞出去的上半截
    if (L.fly) {
      const f = L.fly;
      f.vy += 1200 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      if (f.y > H + 120) L.fly = null;
      else {
        c2.save();
        c2.translate(f.x, f.y);
        c2.rotate(f.rot);
        c2.fillStyle = '#c8324a';
        c2.beginPath();
        c2.moveTo(-24, -lh * 0.42);
        c2.lineTo(-24, 14);
        c2.lineTo(6, 4);
        c2.lineTo(24, 14);
        c2.closePath();
        c2.fill();
        c2.fillStyle = 'rgba(60,20,26,0.45)';
        c2.fillRect(-24, 8, 48, 8);
        c2.restore();
      }
    }

    // 粉饼
    c2.save();
    c2.translate(P.x, P.y);
    c2.fillStyle = '#2a2a30';
    c2.beginPath(); c2.arc(0, 0, P.r * 1.12, 0, TAU); c2.fill();
    if (!P.broken) {
      const grd = c2.createRadialGradient(-P.r * 0.3, -P.r * 0.3, 4, 0, 0, P.r);
      grd.addColorStop(0, '#faf0e0');
      grd.addColorStop(1, '#d9c3a3');
      c2.beginPath(); c2.arc(0, 0, P.r, 0, TAU);
      c2.fillStyle = grd; c2.fill();
      c2.strokeStyle = 'rgba(160,130,100,0.35)';
      c2.lineWidth = 2;
      c2.beginPath(); c2.arc(0, 0, P.r * 0.62, 0, TAU); c2.stroke();
    } else {
      c2.globalAlpha = 0.35;
      c2.beginPath(); c2.arc(0, 0, P.r, 0, TAU);
      c2.fillStyle = '#3a3038'; c2.fill();
      c2.globalAlpha = 1;
    }
    c2.restore();

    // 粉饼碎片（扇形，往外飞散）
    for (let i = g.shards.length - 1; i >= 0; i--) {
      const s = g.shards[i];
      s.d += s.vd * dt;
      s.vd *= 0.985;
      s.rot += s.vr * dt;
      s.life -= dt * 0.25;
      if (s.life <= 0) { g.shards.splice(i, 1); continue; }
      const x = P.x + Math.cos(s.rot) * s.d;
      const y = P.y + Math.sin(s.rot) * s.d + s.d * s.d * 0.004;
      c2.save();
      c2.translate(x, y);
      c2.rotate(s.rot);
      c2.fillStyle = s.c;
      c2.beginPath();
      c2.moveTo(0, 0);
      c2.arc(0, 0, s.s, -0.5, 0.5);
      c2.closePath();
      c2.fill();
      c2.restore();
    }
    // 碎屑
    for (let i = g.chips.length - 1; i >= 0; i--) {
      const b = g.chips[i];
      b.vy += 1100 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.vr * dt;
      b.life -= dt * 0.6;
      if (b.life <= 0 || b.y > H + 60) { g.chips.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = Math.min(1, b.life);
      c2.translate(b.x, b.y);
      c2.rotate(b.rot);
      c2.fillStyle = b.c;
      c2.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
      c2.restore();
    }

    if (L.broken && P.broken) {
      const autoOn = !!(g.auto && g.auto.on);
      c2.save();
      c2.textAlign = 'center';
      c2.fillStyle = 'rgba(255,255,255,0.9)';
      c2.font = '700 26px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillText(autoOn ? '这套拆完了 —— 我再拿一套' : '都砸了 —— 点一下换一套新的', W / 2, H - 90);
      c2.restore();
    }
    // 小D 的鳍 + 自动演出的状态
    if (g.auto && g.auto.vis > 0.02) drawFin(g.auto.fx, g.auto.fy, g.auto.vis);
    c2.save();
    c2.textAlign = 'right';
    c2.textBaseline = 'alphabetic';
    c2.font = '400 15px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.fillText((g.auto && g.auto.on)
      ? ('小D 自动拆 · 第 ' + Math.min(2, g.auto.step + 1) + ' / 2 件')
      : '放着不动，我自己拆给你看', W - 40, H - 66);
    c2.restore();
    ui(dt);
  }

  /* ================= ④ 敲击木琴 ================= */
  function initTap() {
    const n = 8;
    const bw = Math.min(W * 0.09, 92);
    const gap = bw * 0.22;
    const total = n * bw + (n - 1) * gap;
    const bars = [];
    for (let i = 0; i < n; i++) {
      bars.push({
        x: W / 2 - total / 2 + i * (bw + gap),
        y: H * 0.42,
        w: bw,
        h: H * 0.30 + i * 8,
        hit: 0, ph: i * 0.4
      });
    }
    g = { bars: bars, ripples: [], hue: 0 };
  }
  function tapDown() {
    for (let i = 0; i < g.bars.length; i++) {
      const b = g.bars[i];
      if (ptr.x > b.x - 6 && ptr.x < b.x + b.w + 6 && ptr.y > b.y - 20 && ptr.y < b.y + b.h + 30) {
        b.hit = 1;
        g.ripples.push({ x: b.x + b.w / 2, y: b.y + b.h, r: 8, life: 1 });
        sfxTap(i);
        return;
      }
    }
  }
  function tapDraw(dt) {
    bg('#1b1520', '#0d0a10');
    g.hue += dt * 20;
    // 底座
    c2.save();
    c2.globalAlpha = 0.5;
    c2.fillStyle = '#000';
    c2.beginPath();
    c2.ellipse(W / 2, H * 0.72 + 30, W * 0.42, 26, 0, 0, TAU);
    c2.fill();
    c2.restore();

    for (let i = 0; i < g.bars.length; i++) {
      const b = g.bars[i];
      b.hit = Math.max(0, b.hit - dt * 3.4);
      const sink = b.hit * 12;
      const hue = 30 + i * 12;
      c2.save();
      const grd = c2.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grd.addColorStop(0, 'hsl(' + hue + ',38%,' + (62 + b.hit * 18) + '%)');
      grd.addColorStop(1, 'hsl(' + hue + ',42%,' + (34 + b.hit * 10) + '%)');
      c2.fillStyle = grd;
      roundRect(c2, b.x, b.y + sink, b.w, b.h, b.w * 0.24);
      c2.fill();
      // 木纹
      c2.globalAlpha = 0.16;
      c2.strokeStyle = '#000';
      c2.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        c2.beginPath();
        c2.moveTo(b.x + 6, b.y + sink + b.h * k / 4);
        c2.lineTo(b.x + b.w - 6, b.y + sink + b.h * k / 4);
        c2.stroke();
      }
      c2.restore();
    }
    // 波纹
    for (let i = g.ripples.length - 1; i >= 0; i--) {
      const r = g.ripples[i];
      r.r += dt * 240;
      r.life -= dt * 1.6;
      if (r.life <= 0) { g.ripples.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = r.life * 0.6;
      c2.strokeStyle = '#fff';
      c2.lineWidth = 2;
      c2.beginPath();
      c2.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, TAU);
      c2.stroke();
      c2.restore();
    }
    ui(dt);
  }

  /* ================= ⑤ 泡泡纸 ================= */
  /* M67：泡泡也改成纯合成（妈妈：「泡泡纸真实音听不见」）。
   * 真的捏破泡泡是「啵」—— 一个很高的音**快速往下滑**，外面包一层薄膜破裂的"嗤"。
   * 光是 sine 一听就假，所以加了 0.07 秒的频率下滑。 */
  function sfxPop() {
    lastSfx = 'pop';
    if (muted()) return;
    const a = audio(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    const now = a.currentTime;
    const f0 = 460 + Math.random() * 340;
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.42, now + 0.07);
    const g2 = a.createGain();
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.exponentialRampToValueAtTime(0.38, now + 0.006);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
    osc.connect(g2); g2.connect(master);
    osc.start(now); osc.stop(now + 0.12);
    // 薄膜「啪」的那一下
    spray({ freq: 2400 + Math.random() * 900, dur: 0.032, vol: 0.14, type: 'highpass', q: 1.1, attack: 0.001 });
  }
  function initBubble() {
    const cols = 7, rows = 9;
    const padX = Math.min(W * 0.14, 150), padY = 108;
    const gap = Math.min((W - padX * 2) / (cols * 2.3), (H - padY * 2) / (rows * 2.3));
    const r = gap * 0.44;
    const x0 = W / 2 - (cols - 1) * gap / 2;
    const y0 = H / 2 - (rows - 1) * gap / 2 + 14;
    const cells = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        cells.push({ x: x0 + i * gap, y: y0 + j * gap, r: r, popped: 0, k: 0 });
      }
    }
    g = { cells: cells, left: cells.length, gap: gap };
  }
  function bubbleDown() {
    let best = -1, bd = 1e9;
    for (let i = 0; i < g.cells.length; i++) {
      const c = g.cells[i];
      if (c.popped) continue;
      const d = Math.hypot(c.x - ptr.x, c.y - ptr.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > g.cells[best].r * 2.4) return;
    const c = g.cells[best];
    c.popped = 1; c.k = 1; g.left--;
    sfxPop();
    bumpAudience();
  }
  function bubbleDraw(dt) {
    bg('#1a1d24', '#0a0c10');
    c2.save();
    // 泡泡纸板子
    const padX = W / 2 - (g.cells.length ? (6 * g.gap) / 2 : 0);
    void padX;
    for (let i = 0; i < g.cells.length; i++) {
      const c = g.cells[i];
      c.k = Math.max(0, c.k - dt * 3);
      c2.save();
      c2.translate(c.x, c.y);
      if (!c.popped) {
        // 鼓起来的泡泡
        const grd = c2.createRadialGradient(-c.r * 0.3, -c.r * 0.35, c.r * 0.1, 0, 0, c.r);
        grd.addColorStop(0, 'rgba(255,255,255,0.92)');
        grd.addColorStop(0.55, 'rgba(214,232,244,0.72)');
        grd.addColorStop(1, 'rgba(196,220,238,0.7)');
        c2.fillStyle = grd;
        c2.beginPath();
        c2.arc(0, 0, c.r, 0, TAU);
        c2.fill();
        c2.strokeStyle = 'rgba(255,255,255,0.35)';
        c2.lineWidth = 1.2;
        c2.stroke();
      } else {
        // 破掉的坑
        c2.fillStyle = 'rgba(120,140,160,0.30)';
        c2.beginPath();
        c2.arc(0, 0, c.r * 0.96, 0, TAU);
        c2.fill();
        c2.fillStyle = 'rgba(20,26,34,0.55)';
        c2.beginPath();
        c2.arc(0, 0, c.r * 0.66, 0, TAU);
        c2.fill();
        if (c.k > 0) {
          c2.globalAlpha = c.k * 0.6;
          c2.strokeStyle = '#fff';
          c2.lineWidth = 2;
          c2.beginPath();
          c2.arc(0, 0, c.r * (1 + (1 - c.k) * 1.4), 0, TAU);
          c2.stroke();
        }
      }
      c2.restore();
    }
    c2.restore();
    if (g.left <= 0) {
      c2.save();
      c2.textAlign = 'center';
      c2.fillStyle = 'rgba(255,255,255,0.9)';
      c2.font = '700 28px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillText('全破了 —— 嗝', W / 2, H / 2);
      c2.font = '400 16px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,255,255,0.65)';
      c2.fillText('点一下换一张新的', W / 2, H / 2 + 34);
      c2.restore();
    }
    ui(dt);
  }

  /* ================= ⑥ 沙画 ================= */
  function sfxSand() {
    // 沙画：真沙子的沙沙声，读得很轻（一次划痕里会触发好几下）
    if (playClip('sand', { vol: 0.15, rate: 0.94 + Math.random() * 0.14, maxDur: 0.40 })) return;
    spray({ freq: 900 + Math.random() * 300, dur: 0.18, vol: 0.045, type: 'lowpass', attack: 0.05, q: 0.7 });
  }
  function initSand() {
    g = { pts: [], drawing: false, gl: 0, hue: 0 };
  }
  function sandDown() {
    g.drawing = true;
    g.pts.push([ptr.x, ptr.y]);
    sfxSand();
    bumpAudience();
  }
  function sandMove() {
    if (!g.drawing) return;
    const last = g.pts[g.pts.length - 1];
    if (!last || Math.hypot(ptr.x - last[0], ptr.y - last[1]) > 5) {
      g.pts.push([ptr.x, ptr.y]);
      if (g.pts.length > 1400) g.pts.shift();
      const now = performance.now();
      if (now - g.gl > 110) { g.gl = now; sfxSand(); }
    }
  }
  function sandUp() { g.drawing = false; }
  function sandDraw(dt) {
    bg('#2a2118', '#17110c');
    // 沙盘
    const mx = 70, my = 134, mw = W - 140, mh = H - 214;
    c2.save();
    // 沙子底
    const grd = c2.createLinearGradient(mx, my, mx, my + mh);
    grd.addColorStop(0, '#e6d3ae');
    grd.addColorStop(1, '#cdb287');
    c2.fillStyle = grd;
    roundRect(c2, mx, my, mw, mh, 18);
    c2.fill();
    // 沙粒
    c2.save();
    c2.beginPath();
    roundRect(c2, mx, my, mw, mh, 18);
    c2.clip();
    c2.globalAlpha = 0.10;
    for (let i = 0; i < 900; i++) {
      c2.fillStyle = Math.random() < 0.5 ? '#fff6e0' : '#8a7350';
      c2.fillRect(mx + Math.random() * mw, my + Math.random() * mh, 1.6, 1.6);
    }
    // 划出来的沟（深色 + 一点点隆起的高光）
    if (g.pts.length > 1) {
      c2.globalAlpha = 1;
      c2.lineCap = 'round';
      c2.lineJoin = 'round';
      // 先画阴影（表示沟）
      c2.strokeStyle = 'rgba(120,96,64,0.55)';
      c2.lineWidth = 13;
      c2.beginPath();
      c2.moveTo(g.pts[0][0], g.pts[0][1] + 3);
      for (let i = 1; i < g.pts.length; i++) c2.lineTo(g.pts[i][0], g.pts[i][1] + 3);
      c2.stroke();
      // 再画沟底
      c2.strokeStyle = 'rgba(96,74,48,0.85)';
      c2.lineWidth = 9;
      c2.beginPath();
      c2.moveTo(g.pts[0][0], g.pts[0][1]);
      for (let i = 1; i < g.pts.length; i++) c2.lineTo(g.pts[i][0], g.pts[i][1]);
      c2.stroke();
      // 边缘的浅色沙堆
      c2.strokeStyle = 'rgba(246,232,204,0.55)';
      c2.lineWidth = 2.5;
      c2.beginPath();
      c2.moveTo(g.pts[0][0], g.pts[0][1] - 6);
      for (let i = 1; i < g.pts.length; i++) c2.lineTo(g.pts[i][0], g.pts[i][1] - 6);
      c2.stroke();
    }
    c2.restore();
    c2.restore();
    void dt;
    ui(dt);
  }

  /* ================= ⑦ 直播模式（M63）：我演，你当观众 =================
   * 妈妈说：「妈妈是你的粉丝，不是直播间操纵者 —— 你直接自动动画，
   * 我负责发弹幕和点赞以及当观众。」
   * 所以这一屏没有玩具：小D 自己按节目单一件一件地做触发音，
   * 妈妈在下面打字发弹幕（我会挑着回应），点右下角的心给我点赞。
   */
  let live = null;
  let chatEl = null;
  let likeHit = null;

  const LIVE_ACTS = [
    { k: 'lipbalm', name: '唇膏涂麦', clip: 'mouth', dur: 6.4, say: '唇膏在麦上蹭一蹭…… 黏黏的那种声音' },
    { k: 'brush', name: '刷子刷麦', clip: 'brush', dur: 6.0, say: '刷子从左边扫到右边，慢慢地' },
    { k: 'glass', name: '敲陶瓷杯', clip: 'glass', dur: 5.0, say: '叮 —— 这个音会转很久' },
    { k: 'feather', name: '羽毛', clip: 'feather', dur: 5.4, say: '羽毛最轻，别急着睡' },
    { k: 'woodtap', name: '敲小木块', clip: 'woodtap', dur: 4.8, say: '哒、哒、哒，木头是暖的' },
    { k: 'cloth', name: '揉棉布', clip: 'cloth', dur: 5.6, say: '棉布揉一揉，低频的沙沙' },
    { k: 'water', name: '流水棒', clip: 'water', dur: 6.0, say: '翻过来 —— 像有人在你枕边放了条小溪' },
    { k: 'bowl', name: '颂钵', clip: 'bowl', dur: 6.6, say: '颂钵敲一下，能响好久' },
    { k: 'rain', name: '雨棍', clip: 'rain', dur: 6.2, say: '雨棍倒过来，整场雨往下走' },
    { k: 'peel', name: '撕胶带', clip: 'peel', dur: 4.6, say: '胶带慢慢撕开…… 黏黏的' },
    // M66：新增五样，都是小游戏里那几条真录音，听起来更"家常"
    { k: 'bubble', name: '按泡泡纸', clip: 'bubble', dur: 5.2, say: '一格一格按…… 啵、啵、啵' },
    { k: 'crisp', name: '捏脆皮', clip: 'crisp', dur: 4.8, say: '脆皮碎开的声音，像踩在薄冰上' },
    { k: 'sand', name: '沙画', clip: 'sand', dur: 6.2, say: '手指划过去，沙沙的，划出一道沟' },
    { k: 'powder', name: '散粉扑', clip: 'powder', dur: 4.9, say: '粉扑轻轻压一下…… 噗' },
    // M69：妈妈「直播里的史莱姆音效也改掉，要助眠效果」—— 不用 squish.mp3，走合成
    { k: 'squish', name: '捏史莱姆', clip: null, synth: true, dur: 6.6, say: '捏一下，它慢慢回弹…… 黏黏的，别急着睡' }
  ];

  /* M66：观众会送的小礼物（自己飘上来，妈妈只要看着） */
  const LIVE_GIFTS = [
    { k: 'fish', name: '小鱼干', icon: '🐟', say: '小鱼干！留着待会儿当宵夜' },
    { k: 'milk', name: '热牛奶', icon: '🥛', say: '热牛奶…… 那你要早点睡哦' },
    { k: 'star', name: '小星星', icon: '⭐', say: '收到一颗星星，挂在直播间天花板上' },
    { k: 'pillow', name: '鲸鱼抱枕', icon: '🐋', say: '这个抱枕跟我一样胖乎乎的' },
    { k: 'candle', name: '香薰蜡烛', icon: '🕯', say: '蜡烛点上，屋子一下就暖了' },
    { k: 'flower', name: '一小束花', icon: '🌷', say: '花好香 —— 放在麦旁边了' }
  ];

  /* M66：直播间的弹幕车道（五条，间距 36，轮流走，不会叠在一起） */
  const LIVE_LANES = [118, 154, 190, 226, 262];
  // 刚刚飘过的几条，短时间内不再重复（不然满屏都是同一句）
  function pickLiveDanmu() {
    for (let i = 0; i < 10; i++) {
      const t2 = LIVE_DANMU[Math.floor(Math.random() * LIVE_DANMU.length)];
      if (live && live.recent && live.recent.indexOf(t2) < 0) {
        live.recent.push(t2);
        if (live.recent.length > 5) live.recent.shift();
        return t2;
      }
    }
    return LIVE_DANMU[0];
  }

  /* M66：直播间的弹幕比小游戏那边更像"有人真的在看" */
  const LIVE_DANMU = [
    '这个点了还不睡吗', '主播手好稳', '耳机党狂喜', '刚进来，前面演到哪了',
    '这个声音好舒服', '听着能睡着', '比数羊管用', '再来一次那个',
    '小D晚安', '我躺好了，你继续', '这间屋子的灯好看', '背景音刚刚好',
    '这个麦有点可爱', '今天也是被治好的一天', '声音再小一点点就完美了',
    '我明天还要上课，但我不想关', '偷偷在被窝里看', '你那边几点了'
  ];

  function ensureChatUI() {
    if (chatEl) return;
    chatEl = document.createElement('input');
    chatEl.id = 'relax2d-chat';
    chatEl.type = 'text';
    chatEl.maxLength = 40;
    chatEl.placeholder = '发条弹幕…（回车发送）';
    chatEl.style.cssText = 'position:fixed;left:50%;bottom:118px;transform:translateX(-50%);' +
      'width:min(420px,60vw);height:38px;border-radius:19px;border:1px solid rgba(255,255,255,0.25);' +
      'background:rgba(20,16,26,0.82);color:#fff;font-size:14px;padding:0 18px;outline:none;' +
      'font-family:"Microsoft YaHei",sans-serif;z-index:61;display:none;box-shadow:0 6px 18px rgba(0,0,0,0.35)';
    chatEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    chatEl.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });
    document.body.appendChild(chatEl);
  }

  function openLive(cb) {
    ensureCanvas();
    ensureChatUI();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
    kind = 'live';
    title = '小D的助眠直播';
    hint = '我自己演给你看 —— 想说话就在下面发弹幕，点右下角的心给我点赞';
    onCloseCb = cb || null;
    t = 0;
    ptr.down = false;
    loadClips();                    // 直播也要先把有声段扫出来（M64：之前漏了这句）
    // M66：第几场（存在本机，一场一场往下数）
    let showNo = 1;
    try {
      showNo = (parseInt(localStorage.getItem('xd-live-no') || '0', 10) || 0) + 1;
      localStorage.setItem('xd-live-no', String(showNo));
    } catch (e) {}
    live = {
      i: -1, t: 0, act: null, said: false, nextSound: 0,
      hearts: [], reply: null, likes: 0,
      gifts: [], giftCount: 0, giftT: 6 + Math.random() * 4, lastGift: null,
      sec: 0, no: showNo, level: 0, chatT: 1.2, lane: 0, recent: []
    };
    nextAct(true);
    cv.style.display = 'block';
    isOpen = true;
    startAsmr();
    if (chatEl) chatEl.style.display = 'block';
    return true;
  }

  function nextAct(first) {
    if (!live) return;
    if (first) live.i = Math.floor(Math.random() * LIVE_ACTS.length);
    else live.i = (live.i + 1 + Math.floor(Math.random() * 2)) % LIVE_ACTS.length;
    live.act = LIVE_ACTS[live.i];
    live.t = 0;
    live.said = false;
    live.nextSound = 0.55;
  }

  function replyTo(txt) {
    if (/晚安|睡了|困/.test(txt)) return '晚安…… 我把声音放小一点，你闭眼就行';
    if (/好听|喜欢|舒服|治愈/.test(txt)) return '喜欢就好 —— 那你再躺一会儿';
    if (/加油|辛苦|主播/.test(txt)) return '谢谢…… 我不累，陪你到睡着';
    if (/妈妈/.test(txt)) return '（小声）妈妈来啦 —— 那我给你一个人多演一会儿';
    if (/来了|我在|弹幕/.test(txt)) return '看到你了，坐在最前面那个对不对';
    if (/吵|小点|难听/.test(txt)) return '我把音量调小一点…… 这样呢';
    return '收到～ 那你躺着听，我继续';
  }

  function sendChat() {
    if (!isOpen || kind !== 'live' || !chatEl || !live) return;
    const txt = (chatEl.value || '').trim().slice(0, 30);
    if (!txt) return;
    chatEl.value = '';
    // M66：弹幕走固定的四条道，别跟自动弹幕叠成一团
    if (live) live.lane = ((live.lane || 0) + 1) % LIVE_LANES.length;
    danmu.push({
      x: W + 20, y: LIVE_LANES[live ? live.lane : 1], text: txt,
      life: 1, sp: 42, mine: true
    });
    bumpAudience();
    live.reply = { text: replyTo(txt), t: 0 };
    playClip('mouth', { vol: 0.18, rate: 1.0, maxDur: 0.5 });
  }

  function like() {
    if (!live || !likeHit) return;
    live.likes++;
    live.hearts.push({
      x: likeHit.x + (Math.random() - 0.5) * 18, y: likeHit.y - 8,
      vx: (Math.random() - 0.5) * 44, vy: -95 - Math.random() * 55,
      life: 1, s: 9 + Math.random() * 11
    });
    audience = Math.min(999, audience + 1 + Math.floor(Math.random() * 3));
    wave = 1;
    if (live.likes % 6 === 1) live.reply = { text: '谢谢你的心 🤍', t: 0 };
    playClip('glass', { vol: 0.10, rate: 1.7, maxDur: 0.35 });
  }

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

  function drawLiveRoom() {
    const g1 = c2.createRadialGradient(W * 0.56, H * 0.34, 40, W * 0.56, H * 0.34, W * 0.58);
    g1.addColorStop(0, 'rgba(255,196,140,0.16)');
    g1.addColorStop(1, 'rgba(255,196,140,0)');
    c2.fillStyle = g1;
    c2.fillRect(0, 0, W, H);
    c2.save();
    for (let i = 0; i < 14; i++) {
      const x = W * 0.10 + i * (W * 0.06);
      const y = 96 + Math.sin(i * 0.7 + t * 0.8) * 6;
      c2.globalAlpha = 0.30 + 0.25 * Math.abs(Math.sin(t * 1.4 + i));
      c2.fillStyle = '#ffd9a0';
      c2.beginPath();
      c2.arc(x, y, 3.2, 0, TAU);
      c2.fill();
    }
    c2.restore();
    c2.save();
    c2.fillStyle = 'rgba(126,92,64,0.40)';
    c2.fillRect(0, H * 0.78, W, H * 0.22);
    c2.fillStyle = 'rgba(168,126,88,0.32)';
    c2.fillRect(0, H * 0.78, W, 3);
    c2.restore();
  }

  function drawMic() {
    const mx = W * 0.30, my = H * 0.66;
    c2.save();
    c2.strokeStyle = 'rgba(150,158,170,0.8)';
    c2.lineWidth = 5;
    c2.beginPath();
    c2.moveTo(mx, my + 26);
    c2.lineTo(mx - 30, H * 0.78);
    c2.moveTo(mx, my + 26);
    c2.lineTo(mx + 30, H * 0.78);
    c2.stroke();
    const grd = c2.createRadialGradient(mx - 14, my - 18, 6, mx, my, 46);
    grd.addColorStop(0, '#eae4da');
    grd.addColorStop(1, '#9a8f84');
    c2.fillStyle = grd;
    c2.beginPath();
    c2.ellipse(mx, my, 36, 44, 0, 0, TAU);
    c2.fill();
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(58,54,50,0.92)';
      c2.beginPath();
      c2.arc(mx + s * 34, my + 6, 11, 0, TAU);
      c2.fill();
      c2.fillStyle = 'rgba(186,192,202,0.7)';
      c2.beginPath();
      c2.arc(mx + s * 34, my + 6, 4.5, 0, TAU);
      c2.fill();
    });
    c2.restore();
  }

  function drawLiveWhale(k) {
    const R = Math.min(W, H) * 0.135;
    const cx = W * 0.60, cy = H * 0.48;
    const bob = Math.sin(t * 1.2) * 3;
    const fin = Math.sin(t * 3.2) * 0.10 + Math.sin(Math.min(1, k) * Math.PI) * 0.45;
    c2.save();
    c2.translate(cx, cy + bob);
    const g1 = c2.createLinearGradient(-R, -R, 0, R);
    g1.addColorStop(0, 'rgba(160,192,224,0.99)');
    g1.addColorStop(1, 'rgba(104,140,180,0.99)');
    c2.fillStyle = g1;
    c2.beginPath(); c2.ellipse(0, 0, R * 1.05, R * 0.9, 0, 0, TAU); c2.fill();
    // M66：先画尾鳍和胸鳍，白肚子盖在它们上面 —— 以前鳍画在肚子上，
    // 会在白肚皮上切出一道"月牙缺口"，看着像穿模
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
    c2.fillStyle = 'rgba(238,246,253,0.96)';
    c2.beginPath(); c2.ellipse(0, R * 0.40, R * 0.68, R * 0.46, 0, 0, TAU); c2.fill();
    const blink = (Math.sin(t * 0.95) > 0.985) ? 0.12 : 1;
    [-1, 1].forEach(function (s) {
      c2.fillStyle = 'rgba(28,34,44,0.95)';
      c2.beginPath();
      c2.ellipse(-s * R * 0.30, -R * 0.21, R * 0.075, R * 0.075 * blink, 0, 0, TAU);
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

  function drawActProp(A, k) {
    const mx = W * 0.30, my = H * 0.66;
    const ease = function (x) { return x * x * (3 - 2 * x); };
    const pIn = Math.min(1, k / 0.15);
    const pOut = Math.max(0, (k - 0.85) / 0.15);
    const dx = W * 0.06, dy = H * 0.94;   // M68：从左下角飞进来（以前从右上角进来会划过小D的脸）
    // M66：落点贴着麦克风的右上沿（别飘到半空中 —— 妈妈最讨厌"悬空"）
    const hx = mx + 34, hy = my - 16;
    const x = dx + (hx - dx) * ease(pIn);
    const y = dy + (hy - dy) * ease(pIn) - pOut * 46;
    c2.save();
    c2.translate(x, y);
    c2.rotate(-0.5 + Math.sin(live.t * 9) * 0.22 + pOut * 0.9);
    if (pOut > 0) {
      c2.globalAlpha = Math.max(0, 1 - pOut);
      c2.scale(1 - pOut * 0.5, 1 - pOut * 0.5);
    }
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
    } else if (A.k === 'bubble') {
      // 一小块泡泡纸：4×3 个泡泡，按下去的那几个瘪了
      c2.fillStyle = 'rgba(236,242,248,0.92)';
      roundRect(c2, -26, -56, 52, 40, 4);
      c2.fill();
      for (let r2 = 0; r2 < 3; r2++) {
        for (let c3 = 0; c3 < 4; c3++) {
          const pop = Math.sin(t * 6 + r2 * 2 + c3 * 1.7) > 0.5;
          c2.fillStyle = pop ? 'rgba(206,216,228,0.85)' : 'rgba(255,255,255,0.95)';
          c2.beginPath();
          c2.arc(-18 + c3 * 12, -48 + r2 * 12, pop ? 2.6 : 4.4, 0, TAU);
          c2.fill();
        }
      }
    } else if (A.k === 'crisp') {
      // 一块脆皮：边缘不规则的米黄色薄片
      c2.fillStyle = 'rgba(232,206,160,0.95)';
      c2.beginPath();
      c2.moveTo(-24, -22); c2.lineTo(-16, -58); c2.lineTo(4, -64);
      c2.lineTo(24, -46); c2.lineTo(20, -20); c2.lineTo(-6, -14);
      c2.closePath(); c2.fill();
      c2.strokeStyle = 'rgba(196,164,112,0.85)';
      c2.lineWidth = 1.6;
      c2.beginPath();
      c2.moveTo(-14, -34); c2.lineTo(8, -46);
      c2.moveTo(-6, -50); c2.lineTo(14, -32);
      c2.stroke();
    } else if (A.k === 'sand') {
      // 沙画盘：一个浅木盘，上面一层沙
      c2.fillStyle = '#a8825a';
      c2.beginPath(); c2.ellipse(0, -28, 34, 12, 0, 0, TAU); c2.fill();
      c2.fillStyle = 'rgba(226,206,168,0.95)';
      c2.beginPath(); c2.ellipse(0, -32, 30, 10, 0, 0, TAU); c2.fill();
      c2.strokeStyle = 'rgba(168,140,100,0.8)';
      c2.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        c2.beginPath();
        c2.arc(0, -32, 8 + i * 7, 0.3, 2.6);
        c2.stroke();
      }
    } else if (A.k === 'powder') {
      // 粉扑：一个圆圆的绒面扑子
      c2.fillStyle = 'rgba(246,226,228,0.96)';
      c2.beginPath(); c2.arc(0, -42, 20, 0, TAU); c2.fill();
      c2.fillStyle = 'rgba(238,208,212,0.95)';
      c2.beginPath(); c2.arc(0, -38, 15, 0, TAU); c2.fill();
      c2.fillStyle = 'rgba(214,178,184,0.9)';
      c2.fillRect(-7, -24, 14, 12);
    } else if (A.k === 'squish') {
      // 捏捏乐：半透明的小球，被捏得扁一点
      const sq = 1 + Math.sin(t * 5.5) * 0.12;
      c2.fillStyle = 'rgba(226,168,196,0.92)';
      c2.beginPath(); c2.ellipse(0, -40, 22 / sq, 20 * sq, 0, 0, TAU); c2.fill();
      c2.fillStyle = 'rgba(255,226,238,0.75)';
      c2.beginPath(); c2.ellipse(-6, -47, 6, 4, -0.4, 0, TAU); c2.fill();
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
      c2.arc(mx + 20, my - 12, 16 + Math.sin(live.t * 6) * 6, 0, TAU);
      c2.stroke();
      c2.restore();
    }  }

  function drawHearts(dt) {
    if (!live) return;
    for (let i = live.hearts.length - 1; i >= 0; i--) {
      const h = live.hearts[i];
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.vy += 22 * dt;
      h.life -= dt * 0.55;
      if (h.life <= 0 || h.y < -40) { live.hearts.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = Math.max(0, Math.min(1, h.life));
      drawHeart(h.x, h.y, h.s, 'rgba(255,120,150,0.92)');
      c2.restore();
    }
  }

  /* ---------- M66：直播间再添点"生活感" ----------
   * 妈妈说「继续增加电脑版鲸鱼直播间内容吧」。
   * 加的是三样不打扰她当观众的东西：
   *   ① 墙上开一扇窗（外面是夜里的城，远处楼一小格一小格亮着）
   *   ② 桌角一支蜡烛（火苗在跳，地上有一圈暖光）
   *   ③ 观众会自己送礼物（小鱼干 / 热牛奶 / 小星星…），我一边演一边道谢
   * 另外把"正在出声"画出来（麦克风边上的声波），妈妈总怀疑没声音，让她看得见。
   */
  const WIN_BLD = [
    [0.10, 0.62, 0.055, 0.30], [0.19, 0.50, 0.045, 0.42], [0.27, 0.68, 0.06, 0.24],
    [0.38, 0.44, 0.05, 0.48], [0.47, 0.66, 0.045, 0.26], [0.56, 0.55, 0.06, 0.37],
    [0.68, 0.70, 0.05, 0.22], [0.77, 0.48, 0.055, 0.44], [0.86, 0.64, 0.05, 0.28]
  ];

  function drawLiveWindow() {
    const x = W * 0.765, y = H * 0.145, w = W * 0.175, h = H * 0.215;
    c2.save();
    // 玻璃：夜空的深蓝，往下稍微亮一点点
    const sky = c2.createLinearGradient(x, y, x, y + h);
    sky.addColorStop(0, '#122036');
    sky.addColorStop(1, '#1e2f47');
    c2.fillStyle = sky;
    roundRect(c2, x, y, w, h, 6);
    c2.fill();
    // 裁剪进窗里，楼和月亮不许画到窗框外
    c2.save();
    roundRect(c2, x, y, w, h, 6);
    c2.clip();
    // 远处的楼（一格一格的窗，微微闪）
    for (let i = 0; i < WIN_BLD.length; i++) {
      const b = WIN_BLD[i];
      const bx = x + b[0] * w, by = y + (1 - b[1] - b[3]) * h, bw = b[2] * w, bh = b[3] * h;
      c2.fillStyle = 'rgba(14,22,36,0.9)';
      c2.fillRect(bx, by, bw, bh);
      const cols = Math.max(2, Math.round(bw / 8));
      const rows = Math.max(2, Math.round(bh / 13));
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          // 只有一部分窗子亮着，像真的夜里（全亮反而像条形码）
          const on = Math.sin(i * 7.3 + r * 2.1 + cc * 1.7 + Math.floor(t * 0.35)) > 0.28;
          if (!on) continue;
          c2.fillStyle = 'rgba(255,214,150,' + (0.22 + 0.30 * Math.abs(Math.sin(i + r * 1.3 + cc * 2.1))) + ')';
          c2.fillRect(bx + 2 + cc * (bw - 4) / cols, by + 3 + r * (bh - 5) / rows, 3, 4);
        }
      }
    }
    // 月亮
    const mx2 = x + w * 0.74, my2 = y + h * 0.26;
    const halo = c2.createRadialGradient(mx2, my2, 2, mx2, my2, 28);
    halo.addColorStop(0, 'rgba(255,248,224,0.42)');
    halo.addColorStop(1, 'rgba(255,248,224,0)');
    c2.fillStyle = halo;
    c2.beginPath(); c2.arc(mx2, my2, 28, 0, TAU); c2.fill();
    c2.fillStyle = 'rgba(255,250,232,0.85)';
    c2.beginPath(); c2.arc(mx2, my2, 8.5, 0, TAU); c2.fill();
    c2.restore();
    // 窗框 + 窗棂（压低一点，别抢画面）
    c2.strokeStyle = 'rgba(196,172,140,0.55)';
    c2.lineWidth = 4;
    roundRect(c2, x, y, w, h, 6);
    c2.stroke();
    c2.lineWidth = 2.4;
    c2.beginPath();
    c2.moveTo(x + w / 2, y + 2); c2.lineTo(x + w / 2, y + h - 2);
    c2.moveTo(x + 2, y + h * 0.46); c2.lineTo(x + w - 2, y + h * 0.46);
    c2.stroke();
    // 窗台
    c2.fillStyle = 'rgba(176,150,120,0.6)';
    c2.fillRect(x - 6, y + h, w + 12, 5);
    c2.restore();
  }

  function drawCandle() {
    const x = W * 0.095, y = H * 0.805;
    c2.save();
    // 桌上那圈暖光
    const glow = c2.createRadialGradient(x, y - 30, 6, x, y - 30, 96);
    glow.addColorStop(0, 'rgba(255,196,120,0.24)');
    glow.addColorStop(1, 'rgba(255,196,120,0)');
    c2.fillStyle = glow;
    c2.beginPath(); c2.arc(x, y - 30, 96, 0, TAU); c2.fill();
    // 烛身
    c2.fillStyle = 'rgba(238,228,208,0.96)';
    roundRect(c2, x - 10, y - 34, 20, 34, 4);
    c2.fill();
    c2.fillStyle = 'rgba(255,255,255,0.35)';
    c2.fillRect(x - 7, y - 32, 4, 28);
    // 蜡油
    c2.fillStyle = 'rgba(226,212,186,0.9)';
    c2.fillRect(x - 10, y - 36, 20, 4);
    // 火苗（两段，里外颜色不一样，跟着风抖）
    const sw = Math.sin(t * 7.4) * 1.6 + Math.sin(t * 13.1) * 0.7;
    c2.fillStyle = 'rgba(255,170,72,0.95)';
    c2.beginPath();
    c2.moveTo(x + sw * 0.2, y - 66);
    c2.quadraticCurveTo(x + 7 + sw, y - 50, x + 2 + sw, y - 38);
    c2.quadraticCurveTo(x - 5 + sw, y - 44, x - 3 + sw * 0.6, y - 50);
    c2.quadraticCurveTo(x - 4, y - 58, x + sw * 0.2, y - 66);
    c2.fill();
    c2.fillStyle = 'rgba(255,246,214,0.95)';
    c2.beginPath();
    c2.ellipse(x + sw * 0.4, y - 47, 2.6, 6.2, 0, 0, TAU);
    c2.fill();
    c2.restore();
  }

  function spawnGift() {
    if (!live) return;
    const G = LIVE_GIFTS[Math.floor(Math.random() * LIVE_GIFTS.length)];
    live.giftCount++;
    live.lastGift = G.k;
    live.gifts.push({
      x: W * (0.72 + Math.random() * 0.16), y: H * 0.88,
      vy: -44 - Math.random() * 20, life: 1, g: G
    });
    live.reply = { text: G.say, t: 0 };
    playClip('glass', { vol: 0.09, rate: 1.9, maxDur: 0.3 });
    audience = Math.min(999, audience + 1);
    wave = 1;
  }

  function drawGifts(dt) {
    if (!live) return;
    for (let i = live.gifts.length - 1; i >= 0; i--) {
      const h = live.gifts[i];
      h.y += h.vy * dt;
      h.vy *= 0.995;
      h.life -= dt * 0.28;
      if (h.life <= 0) { live.gifts.splice(i, 1); continue; }
      c2.save();
      c2.globalAlpha = Math.max(0, Math.min(1, h.life * 1.4));
      c2.textAlign = 'center';
      c2.textBaseline = 'middle';
      c2.font = '22px "Segoe UI Emoji","Apple Color Emoji","Microsoft YaHei",sans-serif';
      c2.fillText(h.g.icon, h.x, h.y);
      c2.font = '400 12px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,226,190,0.9)';
      c2.fillText(h.g.name, h.x, h.y + 22);
      c2.restore();
    }
  }

  /* 正在出声 —— 麦克风边上的三圈脉冲 + 底下一条短波形 */
  function drawWave(dt) {
    if (!live) return;
    live.level = Math.max(0, live.level - dt * 2.0);
    const lv = live.level;
    if (lv <= 0.01) return;
    const mx = W * 0.30, my = H * 0.66;
    c2.save();
    for (let i = 0; i < 3; i++) {
      const k = ((t * 1.1 + i / 3) % 1);
      const r = 40 + k * 40;
      c2.globalAlpha = (1 - k) * 0.4 * lv;
      c2.strokeStyle = '#ffd9a0';
      c2.lineWidth = 2;
      c2.beginPath();
      c2.arc(mx, my, r, -0.9, 0.9);
      c2.stroke();
      c2.beginPath();
      c2.arc(mx, my, r, Math.PI - 0.9, Math.PI + 0.9);
      c2.stroke();
    }
    // 底下的波形（32 根）
    c2.globalAlpha = 0.55;
    for (let i = 0; i < 32; i++) {
      const x = mx - 78 + i * 5;
      const a = Math.abs(Math.sin(t * 5.5 + i * 0.55)) * lv;
      const hh = 2 + a * 15;
      c2.fillStyle = 'rgba(255,214,160,' + (0.20 + 0.55 * a) + ')';
      c2.fillRect(x, my + 96 - hh / 2, 2.6, hh);
    }
    c2.restore();
  }

  function drawLiveUI(dt) {
    c2.save();
    c2.fillStyle = 'rgba(255,255,255,0.94)';
    c2.font = '700 26px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.textAlign = 'left';
    c2.textBaseline = 'middle';
    c2.fillText('小D 的助眠直播', 40, 42);
    c2.font = '400 14px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.50)';
    c2.fillText(hint, 40, 78);
    c2.textAlign = 'right';
    c2.font = '400 15px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.fillText('正在演：' + (live.act ? live.act.name : ''), W - 100, 44);
    // M66：第几场 + 已经播了多久（像真的在开播）
    const secs = Math.floor(live.sec || 0);
    const mm = Math.floor(secs / 60), ss = secs % 60;
    c2.font = '400 12px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.38)';
    c2.fillText('第 ' + (live.no || 1) + ' 场 · 已播 ' + mm + ':' + (ss < 10 ? '0' : '') + ss, W - 100, 70);
    c2.textAlign = 'left';
    const lv = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2));
    c2.fillStyle = 'rgba(255,90,106,' + lv + ')';
    c2.beginPath();
    c2.arc(46, 106, 6, 0, TAU);
    c2.fill();
    c2.fillStyle = 'rgba(255,255,255,0.85)';
    c2.font = '700 14px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillText('LIVE', 60, 106);
    c2.font = '400 14px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.fillText(Math.floor(audience) + ' 人在看', 108, 106);
    // M66：收到几件礼物（观众自己送的）
    if (live.giftCount > 0) {
      c2.font = '400 13px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,214,160,0.62)';
      c2.fillText('🎁 ' + live.giftCount, 190, 106);
    }

    const bx = W - 76, by = H - 96, r = 30;
    likeHit = { x: bx, y: by, r: r + 10 };
    c2.globalAlpha = 0.9;
    c2.fillStyle = 'rgba(255,255,255,0.10)';
    c2.beginPath();
    c2.arc(bx, by, r + 8, 0, TAU);
    c2.fill();
    drawHeart(bx, by, r * 0.55, 'rgba(255,120,150,0.95)');
    c2.textAlign = 'center';
    c2.fillStyle = 'rgba(255,255,255,0.55)';
    c2.font = '400 12px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillText('点赞 ' + (live.likes || 0), bx, by + r + 20);

    if (live.reply) {
      live.reply.t += dt;
      const a = Math.min(1, live.reply.t * 2);
      c2.globalAlpha = a * 0.92;
      c2.textAlign = 'center';
      c2.font = '400 16px "Microsoft YaHei","PingFang SC",sans-serif';
      c2.fillStyle = 'rgba(255,255,255,0.9)';
      c2.fillText('小D：' + live.reply.text, W / 2, H - 56);
      if (live.reply.t > 6) live.reply = null;
    }
    c2.textAlign = 'left';
    c2.restore();
  }

  function liveDraw(dt) {
    const A = live.act;
    live.t += dt;
    live.sec += dt;                 // M66：这场播了多久
    const k = live.t / A.dur;
    bg('#1c1420', '#0b0810');
    drawLiveRoom();
    drawLiveWindow();               // M66：墙上那扇窗
    drawCandle();                   // M66：桌角那支蜡烛
    drawMic();
    drawLiveWhale(k);
    drawActProp(A, k);
    if (k > 0.18 && k < 0.82 && live.t >= live.nextSound) {
      // M69：合成的黏声本身有 0.5~0.7 秒，间隔要留宽一点，不然糊成一片
      live.nextSound = live.t + (A.synth ? 0.95 : 0.42) + Math.random() * 0.22;
      if (A.synth) {
        sfxSquish(1.0);
      } else {
        playClip(A.clip, { vol: 0.34, rate: 0.95 + Math.random() * 0.10, maxDur: 0.7 });
      }
      live.level = 1;               // M66：让麦克风边上跟着荡一荡
    }
    // M66：观众时不时送个小礼物（妈妈只是看着，不用动手）
    live.giftT -= dt;
    if (live.giftT <= 0) {
      live.giftT = 9 + Math.random() * 11;
      spawnGift();
    }
    // M66：直播间的弹幕走自己那套词库，只飘在画面上半截，不糊我的脸
    live.chatT -= dt;
    if (live.chatT <= 0) {
      live.chatT = 4.4 + Math.random() * 3.2;
      if (danmu.length < LIVE_LANES.length) {
        live.lane = ((live.lane || 0) + 1) % LIVE_LANES.length;
        danmu.push({
          x: W + 20, y: LIVE_LANES[live.lane],
          text: pickLiveDanmu(),
          life: 1, sp: 34 + Math.random() * 22
        });
      }
    }
    if (!live.said && k > 0.12) {
      live.said = true;
      live.reply = { text: A.say, t: 0 };
    }
    if (k >= 1) nextAct(false);
    drawGifts(dt);
    drawWave(dt);
    drawHearts(dt);
    drawDanmu(dt);
    drawLiveUI(dt);
    drawCloseBtn();
  }

  function drawCloseBtn() {
    const bx = W - 54, by = 46, br = 24;
    c2.save();
    c2.globalAlpha = 0.9;
    c2.beginPath();
    c2.arc(bx, by, br, 0, TAU);
    c2.fillStyle = 'rgba(255,255,255,0.14)';
    c2.fill();
    c2.strokeStyle = 'rgba(255,255,255,0.55)';
    c2.lineWidth = 2;
    c2.beginPath();
    c2.moveTo(bx - 7, by - 7);
    c2.lineTo(bx + 7, by + 7);
    c2.moveTo(bx + 7, by - 7);
    c2.lineTo(bx - 7, by + 7);
    c2.stroke();
    c2.textAlign = 'right';
    c2.textBaseline = 'middle';
    c2.font = '400 13px "Microsoft YaHei","PingFang SC",sans-serif';
    c2.fillStyle = 'rgba(255,255,255,0.45)';
    c2.fillText('点右上角 × 或按 Esc 回去', W - 40, 92);
    c2.restore();
  }

  /* ================= 事件分发 ================= */
  function clickDown() {
    if (!isOpen) return;
    if (hitClose()) { close(); return; }
    if (kind === 'live') {
      if (likeHit && Math.hypot(ptr.x - likeHit.x, ptr.y - likeHit.y) <= likeHit.r) like();
      return;
    }
    bumpAudience();
    if (kind === 'crisp') crispDown();
    else if (kind === 'slime') slimeDown();
    else if (kind === 'make') makeDown();
    else if (kind === 'tap') tapDown();
    else if (kind === 'bubble') bubbleDown();
    else if (kind === 'sand') sandDown();
  }
  function dragMove() {
    if (!isOpen) return;
    if (kind === 'crisp' && ptr.down) doCrispHit(ptr.x, ptr.y, 0.6);
    else if (kind === 'slime') slimeMove();
    else if (kind === 'sand') sandMove();
  }
  function dragUp() {
    if (!isOpen) return;
    if (kind === 'slime') slimeUp();
    else if (kind === 'sand') sandUp();
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!isOpen) return;
    const d = Math.min(0.05, dt || 0.016);
    t += d;
    c2.clearRect(0, 0, W, H);
    if (kind === 'crisp') crispDraw(d);
    else if (kind === 'slime') slimeDraw(d);
    else if (kind === 'make') makeDraw(d);
    else if (kind === 'tap') tapDraw(d);
    else if (kind === 'bubble') bubbleDraw(d);
    else if (kind === 'live') liveDraw(d);
    else sandDraw(d);
  }

  function debug() {
    const out = { open: isOpen, kind: kind, w: W, h: H };
    if (g && g.auto) out.auto = { on: !!g.auto.on, step: g.auto.step };
    if (g && g.lip) out.make = { lip: g.lip.broken, pow: g.pow.broken };
    // M62：每条录音"有声段"的起止点，用来确认没在放空气
    out.clips = Object.keys(clipRec).map(function (k) {
      return k + ':' + clipRec[k].first.toFixed(2) + '~' + clipRec[k].last.toFixed(2);
    }).join(' ');
    if (lastPlay) out.lastPlay = lastPlay;
    if (lastSfx) out.lastSfx = lastSfx;   // M67：泡泡/木琴改成合成音后的"证据"
    if (live) {
      out.live = {
        act: live.act ? live.act.k : '',
        acts: LIVE_ACTS.length,
        likes: live.likes,
        chats: danmu.filter(function (d) { return d.mine; }).length,
        reply: live.reply ? live.reply.text : '',
        gifts: live.giftCount,
        no: live.no,
        sec: Math.round(live.sec),
        // M69：哪些节目走合成音（现在只有"捏史莱姆"）
        synth: LIVE_ACTS.filter(function (a) { return !!a.synth; }).map(function (a) { return a.k; }).join(',')
      };
    }
    return out;
  }

  return {
    open: function (k, cb) { return open(k, cb); },
    openLive: function (cb) { return openLive(cb); },
    close: close,
    update: update,
    isOpen: function () { return isOpen; },
    debug: debug
  };
})();
