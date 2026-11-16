/* 小D的赛博小家 · M11 音效
 * 优先放 assets/sfx/ 里的真录音（妈妈批准下载的，来源和许可证见 assets/sfx/CREDITS.md）；
 * 文件缺了 / 解码失败就自动退回现场合成（下面那套 WebAudio 兜底一直都在）。
 * 厨房：切菜、油锅滋滋、锅里咕嘟、抽油烟机低鸣、锅盖、碗筷
 * 吃饭：吸溜面、泡泡
 * 水：水龙头、浴缸放水、下水、溅水
 * 冰箱：开门、冷气"嘶"、关门
 * 右上角小喇叭 / 按 M 静音（静音对雨声也管用）
 */
window.XD = window.XD || {};

XD.SFX = (function () {
  'use strict';

  let ac = null;
  let master = null;        // 干声总线（静音就在这一层）
  let comp = null;          // 轻轻压一下，别让锅盖炸耳
  let room = null;          // 小房间混响（自己生成的脉冲响应）
  let roomSend = null;      // 送混响的那一路
  let noiseBuf = null;
  let muted = false;

  // 听者（相机）位置，用来做空间定位
  const listener = { x: 0, y: 1.6, z: 3, fx: 0, fy: 0, fz: -1 };
  let camPos = new THREE.Vector3(0, 1.6, 3);
  let camAt = null;

  // 厨房底噪 / 时不时的一声小动静
  let ambienceOn = false;
  let ambienceT = 0;
  let ambienceNext = 14 + Math.random() * 20;

  /* M35：妈妈 2026-11-14 12:36 说「厨房噪音太响了，你调低一点」
   * 只压厨房这一摊（乐园、店里的声音不动）：
   *   MIX_KITCHEN —— 常驻的那几层（冰箱嗡、抽油烟机、油锅滋滋、锅里咕嘟）
   *   MIX_ONE     —— 一下一下的（切菜、倒水、锅盖、碗筷、吸溜）
   * 以前做菜是"冰箱嗡 0.55 + 油烟机 0.42 + 油锅 0.34 + 咕嘟 0.5"叠在一起，确实像工地。
   */
  const MIX_KITCHEN = 0.50;
  const MIX_ONE = 0.75;

  // 正在循环的声音：sizzle / boil / water / hood / hum
  const loops = {};

  /* ================= 录音文件 ================= */
  // 路径相对 index.html；加载失败就当没有，走合成
  const ASSETS = {
    sizzle: 'assets/sfx/sizzle.mp3',
    boil: 'assets/sfx/boil.ogg',
    water: 'assets/sfx/water.ogg',
    hood: 'assets/sfx/hood.mp3',
    hum: 'assets/sfx/hum.mp3',
    stir: 'assets/sfx/stir.mp3',
    pour: 'assets/sfx/pour.mp3',
    lid: 'assets/sfx/lid.mp3',
    slurp: 'assets/sfx/slurp.mp3',
    chop: 'assets/sfx/chop.mp3',
    clink: 'assets/sfx/clink.mp3',
    hiss: 'assets/sfx/hiss.mp3',
    fridgeOpen: 'assets/sfx/fridge_open.mp3',
    fridgeClose: 'assets/sfx/fridge_close.mp3',
    drain: 'assets/sfx/drain.mp3',
    ding: 'assets/sfx/ding.mp3',
    stepWood: 'assets/sfx/step_wood.mp3',
    stepWood2: 'assets/sfx/step_wood2.mp3',
    stepTile: 'assets/sfx/step_tile.mp3',
    // 走路"序列"：一整段录音里有十几二十几脚，放的时候随机切一脚出来，最自然
    stepWoodSeq: 'assets/sfx/step_wood_seq.mp3',
    stepTileSeq: 'assets/sfx/step_tile_seq.mp3',
    // M34：水上乐园（妈妈嫌小孩人声吵 → 换成水流声；来源见 assets/park-audio/CREDITS.md）
    waterFlow: 'assets/park-audio/water_flow.ogg',
    fountainNoise: 'assets/park-audio/fountain.ogg',
    splashTub: 'assets/park-audio/splash_tub.ogg'
  };
  const buffers = {};
  let loading = false;
  let loadedAt = 0;

  function loadAll() {
    const c = ctx();
    if (!c || loading) return;
    loading = true;
    loadedAt = Date.now();
    Object.keys(ASSETS).forEach(function (key) {
      fetch(ASSETS[key])
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(function (ab) {
          return new Promise(function (res, rej) {
            c.decodeAudioData(ab, res, rej);
          });
        })
        .then(function (buf) {
          buffers[key] = buf;
          if (/Seq$/.test(key)) buildStepIndex(key, buf);
        })
        .catch(function () { /* 没有就没有，合成兜着 */ });
    });
    // 文件解码完再试一次厨房底噪（万一点击比下载早）
    setTimeout(function () { if (!muted) ambienceStart(); }, 1600);
  }

  /* ================= 从"走路录音"里把每一脚找出来 =================
   * 一整段踩木地板 / 瓷砖的录音，按 20ms 窗口算音量包络，挑出每一次"落下去"（起音），
   * 放的时候随机挑一脚、从那个时间点切一小段出来 —— 就是同一双鞋、同一块地，
   * 自然有轻重快慢的差别，不会像两三条样本轮播。
   */
  const STEP_INDEX = {};

  function buildStepIndex(key, buf) {
    try {
      const sr = buf.sampleRate;
      const chs = [];
      for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
      const win = Math.max(1, Math.floor(sr * 0.02));
      const frames = Math.floor(buf.length / win);
      // 只看前 16 秒就够（几十脚了），不然长录音会把主线程卡一下
      const useFrames = Math.min(frames, Math.floor(16 / 0.02));
      const env = new Float32Array(useFrames);
      let peak = 0;
      for (let f = 0; f < useFrames; f++) {
        const start = f * win;
        let acc = 0;
        for (let i = 0; i < win; i += 2) {         // 隔一个取一个，够用又快
          let m = 0;
          for (let c = 0; c < chs.length; c++) {
            const v = Math.abs(chs[c][start + i]);
            if (v > m) m = v;
          }
          if (m > peak) peak = m;
          acc += m * m;
        }
        env[f] = Math.sqrt(acc / Math.ceil(win / 2));
      }
      let maxEnv = 0;
      for (let i = 0; i < useFrames; i++) if (env[i] > maxEnv) maxEnv = env[i];
      if (maxEnv < 1e-4) return;
      const th = maxEnv * 0.15;                  // 门槛低一点：软底鞋的脚步声峰谷不明显
      const gap = Math.round(0.14 / 0.02);      // 两脚之间至少 140ms
      const onsets = [];
      const energies = [];
      let last = -999;
      for (let f = 1; f < useFrames; f++) {
        if (env[f] > th && env[f - 1] <= th && f - last > gap) {
          onsets.push(Math.max(0, f * 0.02 - 0.02));
          energies.push(env[f]);
          last = f;
        }
      }
      if (!onsets.length) return;
      STEP_INDEX[key] = {
        onsets: onsets,
        energies: energies,
        peak: peak,
        // 把这段录音拉到"峰值 0.9"再混音，免得有的录音天生很轻、有的很响
        gain: Math.max(0.5, Math.min(8, 0.9 / Math.max(0.02, peak)))
      };
    } catch (e) { /* 切不切都行，兜底走单条样本 */ }
  }

  function stepIndexInfo() {
    const out = {};
    Object.keys(STEP_INDEX).forEach(function (k) {
      out[k] = STEP_INDEX[k].onsets.length;
    });
    return out;
  }

  /* 放一段录音：返回 false 表示"没有这个文件"，交给合成 */
  function playBuf(name, opt) {
    const c = ctx();
    if (!c || !buffers[name]) return false;
    const o = opt || {};
    try {
      const src = c.createBufferSource();
      src.buffer = buffers[name];
      if (o.rate) src.playbackRate.value = o.rate;
      const g = c.createGain();
      g.gain.value = o.vol === undefined ? 0.9 : o.vol;
      if (o.fadeIn) {
        const t0 = c.currentTime;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(o.vol === undefined ? 0.9 : o.vol, t0 + o.fadeIn);
      }
      src.connect(g);
      let tail = g;
      // 脚步声这类：高通用一截把"轰"的低频拿掉，低通把最刺的那层拿掉，听着才轻
      try {
        const chain = [];
        if (o.hp) chain.push(['highpass', o.hp, 0.7]);
        if (o.lp) chain.push(['lowpass', o.lp, 0.7]);
        for (let fi = 0; fi < chain.length; fi++) {
          const b = c.createBiquadFilter();
          b.type = chain[fi][0];
          b.frequency.value = chain[fi][1];
          b.Q.value = chain[fi][2];
          tail.connect(b);
          tail = b;
        }
      } catch (e) { tail = g; }
      if (o.pan) {
        try {
          const sp = ac.createStereoPanner();
          sp.pan.value = o.pan;
          tail.connect(sp);
          routeTo(sp, o.pos, o.dry);
        } catch (e) {
          routeTo(tail, o.pos, o.dry);
        }
      } else {
        routeTo(tail, o.pos, o.dry);
      }
      const t = c.currentTime + (o.at || 0);
      if (o.max || o.offset) {
        // start(when, offset, duration)：能做"从这段录音的第几秒切一小段"
        src.start(t, o.offset || 0, o.max || undefined);
        if (o.fadeOut) {
          const v0 = g.gain.value;
          const ft = Math.min(o.fadeOut, (o.max || 0.2) * 0.8);
          try {
            g.gain.setValueAtTime(v0, t + Math.max(0, (o.max || 0) - ft));
            g.gain.linearRampToValueAtTime(0.0001, t + (o.max || 0));
          } catch (e) {}
        }
      } else {
        src.start(t);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 循环类录音：开/关（dry=true 不送房间混响，露天用） */
  function startBufLoop(key, name, vol, fadeIn, rate, pos, dry) {
    const c = ctx();
    const buf = buffers[key];
    if (!c || !buf || loops[name]) return false;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      if (rate && rate !== 1) src.playbackRate.value = rate;
      const g = createGainNode(vol);
      src.connect(g);
      const panner = routeTo(g, pos, dry);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + (fadeIn === undefined ? 0.35 : fadeIn));
      src.start(t0);
      loops[name] = {
        gain: g,
        vol: vol,                 // 记一下目标音量（自检 ?diag=1 里能看到）
        stop: function (fade) {
          const f = fade === undefined ? 0.4 : fade;
          const t = c.currentTime;
          try {
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
            g.gain.linearRampToValueAtTime(0.0001, t + f);
          } catch (e) {}
          setTimeout(function () {
            try { src.stop(); } catch (e) {}
          }, Math.round(f * 1000) + 60);
          delete loops[name];
        }
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  function createGainNode(v) {
    const g = ac.createGain();
    g.gain.value = v === undefined ? 0.0001 : v;
    return g;
  }

  function ctx() {
    if (ac) {
      if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
      return ac;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0.0001 : 0.85;

      // 轻轻压一下：录音素材电平不齐，压过之后听着"柔"一点（ASMR 要的就是这个）
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 18;
      comp.ratio.value = 2.6;
      comp.attack.value = 0.006;
      comp.release.value = 0.28;
      master.connect(comp);
      comp.connect(ac.destination);

      buildRoom();

      // 两秒白噪声：所有"沙沙""哗哗"的底子都用它
      const sr = ac.sampleRate;
      const len = Math.floor(sr * 2);
      noiseBuf = ac.createBuffer(1, len, sr);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) {
      ac = null;
      return null;
    }
    return ac;
  }

  // 浏览器不让自动播放，第一次点/按的时候"解锁"一下
  function unlock() {
    const c = ctx();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    if (!loading) loadAll();
    if (!muted) ambienceStart();
    // 冬天模式如果在进页面时就是开着的，第一下点击后把风声补上
    if (XD.Snow && XD.Snow.isOn && XD.Snow.isOn()) { try { windOn(); } catch (e) {} }
  }

  function noise(loop) {
    const c = ac;
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = !!loop;
    return s;
  }

  function filter(type, freq, q) {
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  function gainNode(v) {
    const g = ac.createGain();
    g.gain.value = v === undefined ? 0.0001 : v;
    return g;
  }

  /* ================= 小房间：让声音听起来像在屋里 ================= */
  function buildRoom() {
    if (room || !ac) return;
    try {
      const sr = ac.sampleRate;
      const dur = 1.1;
      const len = Math.max(1, Math.floor(sr * dur));
      const ir = ac.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * 0.5;
        }
        // 几个早期反射（墙、台面、天花）
        [0.009, 0.017, 0.028, 0.041, 0.058].forEach(function (tt, k) {
          const idx = Math.floor(tt * sr);
          if (idx < len) d[idx] += (k % 2 ? -1 : 1) * 0.45 / (1 + k * 0.8);
        });
      }
      const conv = ac.createConvolver();
      conv.buffer = ir;
      const wet = ac.createGain();
      wet.gain.value = 0.24;
      roomSend = ac.createGain();
      roomSend.gain.value = 1;
      roomSend.connect(conv);
      conv.connect(wet);
      wet.connect(master);
      room = conv;
    } catch (e) {
      room = null;
      roomSend = null;
    }
  }

  /* ================= 空间定位 ================= */
  function makePanner(pos) {
    if (!ac || !pos) return null;
    try {
      const p = ac.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.2;      // 1.2 米内最清楚，再远就散
      p.maxDistance = 18;
      p.rolloffFactor = 1.0;
      p.coneInnerAngle = 360;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else if (p.setPosition) {
        p.setPosition(pos.x, pos.y, pos.z);
      }
      return p;
    } catch (e) {
      return null;
    }
  }

  // 把一段声音接进总线：有位置就走 HRTF，再都送一点混响（脚步声 dry：不送，免得发闷）
  function routeTo(node, pos, dry) {
    const p = pos ? makePanner(pos) : null;
    if (p) {
      node.connect(p);
      p.connect(master);
      if (roomSend && !dry) p.connect(roomSend);
    } else {
      node.connect(master);
      if (roomSend && !dry) node.connect(roomSend);
    }
    return p;
  }

  // 每帧把相机位置/朝向告诉 WebAudio：走到哪儿，声音就从哪儿来
  function setListener(pos, at) {
    camPos.copy(pos);
    if (at) camAt = at.clone();
    if (!ac) return;
    const l = ac.listener;
    const fx = camAt ? camAt.x - camPos.x : 0;
    const fy = camAt ? camAt.y - camPos.y : 0;
    const fz = camAt ? camAt.z - camPos.z : -1;
    const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    try {
      if (l.positionX) {
        l.positionX.value = pos.x;
        l.positionY.value = pos.y;
        l.positionZ.value = pos.z;
        l.forwardX.value = fx / fl;
        l.forwardY.value = fy / fl;
        l.forwardZ.value = fz / fl;
        l.upX.value = 0;
        l.upY.value = 1;
        l.upZ.value = 0;
      } else {
        l.setPosition(pos.x, pos.y, pos.z);
        l.setOrientation(fx / fl, fy / fl, fz / fl, 0, 1, 0);
      }
    } catch (e) {}
  }

  /* 一小段噪声：切菜、冷气、溅水都靠它 */
  function burst(opt) {
    const c = ctx();
    if (!c) return;
    const o = opt || {};
    const t0 = c.currentTime + (o.at || 0);
    const dur = o.dur || 0.08;
    const s = noise(false);
    const f = filter(o.type || 'bandpass', o.freq || 2200, o.q === undefined ? 1.1 : o.q);
    const g = gainNode(0.0001);
    s.connect(f); f.connect(g); g.connect(master);
    const peak = o.vol === undefined ? 0.16 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  /* 一声"叮"：用两个正弦叠出小金属/小铃铛 */
  function tone(freq, opt) {
    const c = ctx();
    if (!c) return;
    const o = opt || {};
    const t0 = c.currentTime + (o.at || 0);
    const dur = o.dur || 0.3;
    const osc = c.createOscillator();
    const g = gainNode(0.0001);
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    osc.connect(g); g.connect(master);
    const peak = o.vol === undefined ? 0.08 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* ================= 循环类：开 / 关 ================= */
  function startLoop(name, makeNodes) {
    const c = ctx();
    if (!c || loops[name]) return;
    try {
      const h = makeNodes(c) || {};
      h.stop = function (fade) {
        const f = fade === undefined ? 0.35 : fade;
        if (h.gain) {
          const t = c.currentTime;
          try {
            h.gain.gain.cancelScheduledValues(t);
            h.gain.gain.setValueAtTime(Math.max(0.0001, h.gain.gain.value), t);
            h.gain.gain.linearRampToValueAtTime(0.0001, t + f);
          } catch (e) {}
        }
        if (h.timer) { clearInterval(h.timer); h.timer = null; }
        setTimeout(function () {
          (h.nodes || []).forEach(function (n) {
            try { if (n.stop) n.stop(); } catch (e) {}
          });
        }, Math.round(f * 1000) + 60);
        delete loops[name];
      };
      loops[name] = h;
    } catch (e) {}
  }

  function stopLoop(name, fade) {
    const h = loops[name];
    if (!h) return;
    try { h.stop(fade); } catch (e) {}
  }

  /* ================= 一个个声音 ================= */
  // 点东西的"叮"（原来 interact.js 里那个，搬到这儿统一静音）
  function blip() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = gainNode(0.0001);
    o.type = 'sine';
    o.frequency.setValueAtTime(720, t0);
    o.frequency.exponentialRampToValueAtTime(1160, t0 + 0.09);
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    o.start(t0);
    o.stop(t0 + 0.26);
  }

  // 拍照的"咔嚓"：两片快门 + 一点外壳闷响（M14）
  function snap() {
    const c = ctx();
    if (!c) return;
    burst({ freq: 3100, q: 0.5, dur: 0.022, vol: 0.17 });          // 第一片
    burst({ at: 0.055, freq: 1500, q: 0.9, dur: 0.06, vol: 0.11 }); // 第二片
    tone(118, { dur: 0.05, vol: 0.045, type: 'triangle' });         // 机身
  }

  // 切菜：笃、笃、笃（有录音就用录音，稍微变个调，像一刀一刀）
  function chop(times, pos) {
    const n = times || 4;
    for (let i = 0; i < n; i++) {
      const at = i * (0.14 + (i % 2) * 0.05);
      if (playBuf('chop', { at: at, vol: 0.75 * MIX_ONE, rate: 0.94 + (i % 3) * 0.06, pos: pos })) continue;
      burst({ at: at, freq: 1500 + (i % 3) * 260, q: 1.4, dur: 0.07, vol: 0.12 * MIX_ONE });
      tone(220 + (i % 2) * 40, { at: at, dur: 0.06, vol: 0.05 * MIX_ONE, type: 'triangle' });
    }
  }

  // 点火：一下轻轻的"啪"
  function ignite() {
    burst({ freq: 900, q: 0.8, dur: 0.10, vol: 0.13 });
    tone(120, { dur: 0.16, vol: 0.06, type: 'triangle' });
  }

  // 关火：气声收掉
  function extinguish() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const f = filter('lowpass', 900);
    f.frequency.setValueAtTime(900, t0);
    f.frequency.exponentialRampToValueAtTime(260, t0 + 0.4);
    const g = gainNode(0.0001);
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.06, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    s.start(t0);
    s.stop(t0 + 0.55);
  }

  // 油锅滋滋：一直响，直到关火（M35：音量乘 MIX_KITCHEN）
  function sizzleOn(vol, pos) {
    const v = (vol === undefined ? 0.40 : vol) * MIX_KITCHEN;
    if (startBufLoop('sizzle', 'sizzle', v, 0.4, 1, pos)) return;
    startLoop('sizzle', function (c) {
      const src = noise(true);
      const hp = filter('highpass', 1300);
      const bp = filter('bandpass', 3600, 0.55);
      const g = gainNode(0.0001);
      src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.050 * MIX_KITCHEN, t0 + 0.30);
      // 噼里啪啦的抖动
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 9.5;
      const lg = gainNode(0.015 * MIX_KITCHEN);
      lfo.connect(lg); lg.connect(g.gain);
      src.start();
      lfo.start();
      return { gain: g, nodes: [src, lfo] };
    });
  }
  function sizzleOff() { stopLoop('sizzle', 0.5); }

  // 锅里咕嘟咕嘟（录音是"盖着盖煮"的锅，正好）
  function boilOn(vol, pos) {
    const v = (vol === undefined ? 0.55 : vol) * MIX_KITCHEN;
    startBufLoop('boil', 'boil', v, 0.7, 1, pos);
  }
  function boilOff() { stopLoop('boil', 0.7); }

  // 往锅里倒水
  function pour(pos) {
    if (playBuf('pour', { vol: 0.7 * MIX_ONE, max: 3.0, pos: pos })) return;
    burst({ freq: 1200, q: 0.9, dur: 0.5, vol: 0.06 * MIX_ONE });
  }

  // 筷子搅锅 / 搅碗（妈妈说有点太响，音量压过一轮，M35 再乘 MIX_ONE）
  function stir(pos) {
    if (playBuf('stir', { vol: 0.26 * MIX_ONE, max: 2.4, pos: pos })) return;
    for (let i = 0; i < 4; i++) {
      burst({ at: i * 0.22, freq: 1600 + (i % 2) * 300, q: 1.4, dur: 0.12, vol: 0.03 * MIX_ONE });
    }
  }

  // 挂上抽油烟机：低低的一层嗡（有录音就用录音，位置在油烟机那儿）
  function hoodOn(pos) {
    if (startBufLoop('hood', 'hood', 0.42 * MIX_KITCHEN, 0.6, 1, pos)) return;
    startLoop('hood', function (c) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 47;
      const lp = filter('lowpass', 220, 0.4);
      const src = noise(true);
      const sg = gainNode(0.02 * MIX_KITCHEN);
      const g = gainNode(0.0001);
      osc.connect(lp); lp.connect(g);
      src.connect(sg); sg.connect(g);
      g.connect(master);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.035 * MIX_KITCHEN, t0 + 0.5);
      osc.start(); src.start();
      return { gain: g, nodes: [osc, src] };
    });
  }
  function hoodOff() { stopLoop('hood', 0.7); }

  // 水龙头：哗——（一直开，直到关）（M35：厨房这一带再压一点点，浴室放水还够用）
  function waterOn(name, vol, rate, pos) {
    const key = name || 'water';
    const v = (vol === undefined ? 0.55 : vol) * 0.82;
    if (startBufLoop('water', key, v, 0.25, rate || 1, pos)) return;
    // 没录音就用合成：合成的噪声本来就响，音量要缩一下
    const synthVol = Math.max(0.02, Math.min(0.06, v * 0.08));
    startLoop(key, function (c) {
      const src = noise(true);
      const bp = filter('bandpass', 1050, 0.9);
      const lp = filter('lowpass', 3800);
      const g = gainNode(0.0001);
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(synthVol, t0 + 0.18);

      // 时不时"咕"一小下水泡
      const timer = setInterval(function () {
        if (!ac) return;
        const t = ac.currentTime + 0.01;
        const o = ac.createOscillator();
        const og = ac.createGain();
        o.type = 'sine';
        const f0 = 380 + Math.random() * 460;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.7, t + 0.06);
        o.connect(og); og.connect(master);
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.018 + Math.random() * 0.012, t + 0.01);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.start(t);
        o.stop(t + 0.11);
      }, 130);

      return { gain: g, nodes: [src], timer: timer };
    });
  }
  function waterOff(name) { stopLoop(name || 'water', 0.30); }

  // 浴缸放满的那一下：哗啦
  function splash() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const src = noise(false);
    const bp = filter('bandpass', 1200, 0.7);
    const g = gainNode(0.0001);
    src.connect(bp); bp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    src.start(t0);
    src.stop(t0 + 0.6);
    for (let i = 0; i < 4; i++) {
      tone(300 + Math.random() * 300, { at: 0.05 + i * 0.07, dur: 0.10, vol: 0.035 });
    }
  }

  // 放水走下水道：呜噜呜噜往下
  function drain(pos) {
    if (playBuf('drain', { vol: 0.75 * MIX_ONE, max: 2.4, pos: pos })) return;
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const src = noise(false);
    const bp = filter('bandpass', 700, 1.6);
    bp.frequency.setValueAtTime(900, t0);
    bp.frequency.exponentialRampToValueAtTime(220, t0 + 1.1);
    const g = gainNode(0.0001);
    src.connect(bp); bp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.075, t0 + 0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
    src.start(t0);
    src.stop(t0 + 1.3);
  }

  // 冰箱开门：门把手 + 冷气"嘶——"
  function fridgeHiss(pos) {
    if (playBuf('hiss', { vol: 0.55, max: 1.4, pos: pos })) return;
    burst({ freq: 4200, q: 0.6, dur: 0.55, vol: 0.055, type: 'highpass' });
    burst({ at: 0.05, freq: 1800, q: 0.8, dur: 0.35, vol: 0.03 });
  }

  // 开门 = 把手声 + 冷气嘶；关门 = 闷闷一下
  function fridgeOpen(pos) {
    if (playBuf('fridgeOpen', { vol: 0.65 * MIX_ONE, max: 2.4, pos: pos })) {
      setTimeout(function () { playBuf('hiss', { vol: 0.45 * MIX_ONE, max: 1.0, pos: pos }); }, 320);
      return;
    }
    fridgeHiss(pos);
  }
  function fridgeClose(pos) {
    if (playBuf('fridgeClose', { vol: 0.65 * MIX_ONE, pos: pos })) return;
    tone(180, { dur: 0.12, vol: 0.05 * MIX_ONE, type: 'triangle' });
  }

  // 锅盖：铝盖碰锅沿（录音是一整个锅盖系列，截最前面 1.1 秒）
  function lid(pos) {
    if (playBuf('lid', { vol: 0.55 * MIX_ONE, max: 1.1, pos: pos })) return;
    tone(510, { dur: 0.18, vol: 0.075 * MIX_ONE, type: 'triangle' });
    tone(1180, { at: 0.012, dur: 0.13, vol: 0.045 * MIX_ONE });
    burst({ freq: 2600, q: 1.6, dur: 0.05, vol: 0.06 * MIX_ONE });
  }

  // 碗筷：叮、叮
  function clink(pos) {
    if (playBuf('clink', { vol: 0.7 * MIX_ONE, pos: pos })) return;
    tone(2050, { dur: 0.22, vol: 0.05 * MIX_ONE });
    tone(3050, { at: 0.008, dur: 0.13, vol: 0.032 * MIX_ONE });
  }

  // 吸溜一口面
  function slurp(pos) {
    if (playBuf('slurp', { vol: 0.85 * MIX_ONE, max: 2.6, pos: pos })) return;
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const src = noise(false);
    const bp = filter('bandpass', 900, 3.5);
    bp.frequency.setValueAtTime(600, t0);
    bp.frequency.exponentialRampToValueAtTime(1900, t0 + 0.28);
    const g = gainNode(0.0001);
    src.connect(bp); bp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.085 * MIX_ONE, t0 + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
    src.start(t0);
    src.stop(t0 + 0.38);
  }

  // 端碗上桌：轻轻一"啵"
  function pop() {
    tone(420, { to: 760, dur: 0.16, vol: 0.06, attack: 0.004 });
  }

  // 好了——小铃铛
  function ding(pos) {
    if (playBuf('ding', { vol: 0.7, pos: pos })) return;
    tone(880, { dur: 1.0, vol: 0.065 });
    tone(1320, { at: 0.005, dur: 0.8, vol: 0.035 });
    tone(1760, { at: 0.01, dur: 0.55, vol: 0.02 });
  }

  // 泡泡破掉
  function bubble() {
    tone(700, { to: 1400, dur: 0.07, vol: 0.04 });
  }

  /* ================= 脚步声（M12：第一人称参观） ================= */
  // 优先从"走路录音"里随机切一脚（同一双鞋、同一块地，最自然）；
  // 没有序列文件就退回单条样本；再没有就合成。
  let stepFlip = 0;
  let lastOnsetIdx = -1;

  function pickOnset(key, light) {
    const ix = STEP_INDEX[key];
    if (!ix || !ix.onsets.length) return null;
    let idxs = null;
    if (light && ix.energies && ix.onsets.length >= 3) {
      // 散步的时候优先挑"轻的那几脚"，听起来才不沉重
      const order = [];
      for (let k = 0; k < ix.onsets.length; k++) order.push(k);
      order.sort(function (a, b) { return ix.energies[a] - ix.energies[b]; });
      idxs = order.slice(0, Math.max(2, Math.ceil(order.length * 0.55)));
    }
    let i = idxs
      ? idxs[Math.floor(Math.random() * idxs.length)]
      : Math.floor(Math.random() * ix.onsets.length);
    if (ix.onsets.length > 2 && i === lastOnsetIdx) i = (i + 1) % ix.onsets.length;
    lastOnsetIdx = i;
    const start = ix.onsets[i];
    const next = ix.onsets[i + 1];
    // 切到下一脚之前就收住，别把第二脚带进来
    const dur = Math.max(0.18, Math.min(0.38, next ? (next - start) * 0.8 : 0.34));
    return { offset: start, dur: dur, gain: ix.gain };
  }

  function step(surface, opts) {
    const o = opts || {};
    const tile = surface === 'tile';
    const key = tile ? 'stepTileSeq' : 'stepWoodSeq';
    const base = o.vol === undefined ? 0.24 : o.vol;
    const vol = base * (0.88 + Math.random() * 0.22);
    // 稍微"轻"一点：音高高 2%（听着像步子轻快），变调只 ±1%
    const rate = (tile ? 1.03 : 1.02) + (Math.random() - 0.5) * 0.02;
    const pan = (stepFlip++ % 2 ? -0.05 : 0.05);                        // 左右脚，很轻
    const filt = {
      hp: 150,                       // 把"轰"的低频拿掉 —— 妈妈说太沉重就是这一块
      lp: tile ? 5600 : 4800,
      dry: true                      // 不送混响，省得发闷
    };
    const seg = pickOnset(key, true);
    if (seg && playBuf(key, {
      vol: vol * seg.gain,
      rate: rate,
      pan: pan,
      offset: seg.offset,
      max: Math.min(seg.dur, 0.38),
      fadeIn: 0.006,
      fadeOut: 0.06,
      hp: filt.hp,
      lp: filt.lp,
      dry: true
    })) return;
    // 退回单条样本
    const single = tile ? 'stepTile' : 'stepWood2';
    if (playBuf(single, {
      vol: vol, rate: rate, pan: pan, max: 0.36,
      fadeIn: 0.006, fadeOut: 0.06, hp: filt.hp, lp: filt.lp, dry: true
    })) return;
    // 再没有就合成
    burst({ freq: tile ? 2800 : 1400, q: 1.0, dur: 0.04, vol: 0.035 });
    tone(tile ? 220 : 160, { dur: 0.06, vol: 0.028, type: 'sine' });
  }

  /* ================= 唱片机（M13：客厅的背景音乐） ================= */
  const MUSIC = {};
  const MUSIC_POS = { x: 3.72, y: 0.98, z: -3.12 };
  let musicSrc = null, musicGain = null, musicKey = null;
  let musicEndedCb = null;
  let musicReadyCb = null;
  const MUSIC_VOL = 0.40;

  function loadMusic(key, url) {
    const c = ctx();
    if (!c || MUSIC[key]) return;
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (ab) {
        return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); });
      })
      .then(function (buf) {
        MUSIC[key] = buf;
        if (musicReadyCb) { try { musicReadyCb(key); } catch (e) {} }
      })
      .catch(function () { /* 没下载到就静着，不报错 */ });
  }

  function stopMusic(fade) {
    const c = ctx();
    if (!c || !musicSrc) return;
    const f = fade === undefined ? 1.2 : fade;
    const src = musicSrc, g = musicGain;
    musicSrc = null; musicGain = null; musicKey = null;
    try {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.linearRampToValueAtTime(0.0001, t + f);
      setTimeout(function () { try { src.stop(); } catch (e) {} }, Math.round(f * 1000) + 90);
    } catch (e) {}
  }

  function playMusic(key, vol) {
    const c = ctx();
    if (!c || !MUSIC[key]) return false;
    stopMusic(0.6);
    try {
      const src = c.createBufferSource();
      src.buffer = MUSIC[key];
      const g = ac.createGain();
      const v = vol === undefined ? MUSIC_VOL : vol;
      g.gain.value = 0.0001;
      src.connect(g);
      // 音乐从唱片机那个角落传出来，远近也跟着走
      const p = makePanner(MUSIC_POS);
      if (p) {
        g.connect(p);
        p.connect(master);
        if (roomSend) p.connect(roomSend);
      } else {
        g.connect(master);
      }
      const t0 = c.currentTime + 0.05;
      g.gain.linearRampToValueAtTime(v, t0 + 1.5);
      src.start(t0);
      src.onended = function () {
        if (musicSrc !== src) return;
        musicSrc = null; musicGain = null; musicKey = null;
        if (musicEndedCb) { try { musicEndedCb(); } catch (e) {} }
      };
      musicSrc = src;
      musicGain = g;
      musicKey = key;
      return true;
    } catch (e) {
      return false;
    }
  }

  function setMusicEnded(cb) { musicEndedCb = cb; }
  function onMusicReady(cb) { musicReadyCb = cb; }
  function isMusicPlaying() { return !!musicSrc; }
  function nowPlaying() { return musicKey; }
  function musicLoaded(key) { return !!MUSIC[key]; }

  /* ================= 厨房底噪（沉浸感的一半） ================= */
  const FRIDGE_POS = { x: 8.60, y: 1.15, z: -2.95 };
  let ambTries = 0;

  function ambienceStart() {
    if (ambienceOn || muted) return;
    ambienceOn = true;
    ambienceT = 0;
    ambienceNext = 16 + Math.random() * 22;
    if (!startBufLoop('hum', 'hum', 0.55 * MIX_KITCHEN, 2.2, 1, FRIDGE_POS)) {
      // 录音可能还没下载解码完（和乐园水声同一个毛病）：过一会儿再试，别就这么哑了
      ambienceOn = false;
      if (ambTries < 8) {
        ambTries++;
        setTimeout(function () { if (!muted) ambienceStart(); }, 1200);
      }
    } else {
      ambTries = 0;
    }
  }
  function ambienceStop() {
    ambienceOn = false;
    stopLoop('hum', 1.2);
  }

  // 每帧：给随机的小动静计时（只在厨房里、离得近才响，像屋里有人）
  function tick(dt) {
    if (!ambienceOn || !ac || muted) return;
    ambienceT += dt;
    if (ambienceT < ambienceNext) return;
    ambienceT = 0;
    ambienceNext = 22 + Math.random() * 38;
    if (camPos.x < 4.4 || camPos.z < -3.6 || camPos.z > 3.6) return;   // 不在厨房就不响
    const p = { x: 7.0 + Math.random() * 1.4, y: 1.05, z: -3.15 + Math.random() * 0.25 };
    const r = Math.random();
    if (r < 0.45) clink(p);
    else if (r < 0.72) lid(p);
    else playBuf('water', { vol: 0.13, max: 1.7, pos: { x: 5.86, y: 1.0, z: -3.3 } });
  }

  /* ================= 便利店购物（M17）：一堆小声音 ================= */
  // 扫码枪的"嘀"
  function beep() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = gainNode(0.0001);
    o.type = 'square';
    o.frequency.setValueAtTime(1760, t0);
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o.start(t0); o.stop(t0 + 0.11);
  }
  // 拿起商品：轻轻一声"嗒"
  function pickup() {
    burst({ freq: 1500, q: 1.2, dur: 0.05, vol: 0.06 });
    tone(520, { dur: 0.06, vol: 0.03, type: 'triangle' });
  }
  // 收银机抽屉 + 找零的叮当
  function cash() {
    burst({ freq: 900, q: 0.7, dur: 0.12, vol: 0.10 });
    tone(1560, { at: 0.05, dur: 0.20, vol: 0.05, type: 'sine' });
    tone(2340, { at: 0.09, dur: 0.22, vol: 0.035, type: 'sine' });
    tone(1180, { at: 0.14, dur: 0.26, vol: 0.04, type: 'sine' });
  }
  // 小票打印：咔咔咔
  function print() {
    for (let i = 0; i < 5; i++) {
      burst({ at: i * 0.075, freq: 2400 + (i % 2) * 700, q: 1.6, dur: 0.035, vol: 0.045 });
    }
  }
  // 塑料袋
  function bag() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const f = filter('highpass', 1800);
    const g = gainNode(0.0001);
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + 0.05);
    g.gain.linearRampToValueAtTime(0.012, t0 + 0.18);
    g.gain.linearRampToValueAtTime(0.04, t0 + 0.26);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    s.start(t0); s.stop(t0 + 0.55);
  }
  // 猫叫：两声短"喵"（正弦滑音 + 一点噪声，别指望像，够可爱就行）
  function cat() {
    const c = ctx();
    if (!c) return;
    [0, 0.26].forEach(function (at, i) {
      const t0 = c.currentTime + at;
      const o = c.createOscillator();
      const g = gainNode(0.0001);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(i ? 640 : 700, t0);
      o.frequency.linearRampToValueAtTime(i ? 900 : 980, t0 + 0.07);
      o.frequency.linearRampToValueAtTime(i ? 560 : 600, t0 + 0.20);
      const f = filter('lowpass', 1600, 2.5);
      o.connect(f); f.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      o.start(t0); o.stop(t0 + 0.26);
    });
  }
  // 咖啡机：泵声 + 蒸汽
  function coffee() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const f = filter('bandpass', 800, 0.9);
    f.frequency.setValueAtTime(600, t0);
    f.frequency.linearRampToValueAtTime(1100, t0 + 0.5);
    const g = gainNode(0.0001);
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.06, t0 + 0.15);
    g.gain.setValueAtTime(0.06, t0 + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    s.start(t0); s.stop(t0 + 1.6);
    tone(180, { dur: 0.5, vol: 0.02, type: 'triangle' });
  }
  // 冰柜开门：冷气"呼" + 低鸣
  function freezer() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const f = filter('lowpass', 1200);
    f.frequency.setValueAtTime(1200, t0);
    f.frequency.exponentialRampToValueAtTime(380, t0 + 0.6);
    const g = gainNode(0.0001);
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    s.start(t0); s.stop(t0 + 0.75);
    tone(120, { dur: 0.4, vol: 0.025, type: 'sine' });
  }
  // 门口信箱：金属"咔"
  function mailbox() {
    burst({ freq: 2600, q: 2.2, dur: 0.05, vol: 0.09 });
    burst({ at: 0.06, freq: 1400, q: 1.6, dur: 0.10, vol: 0.06 });
  }

  /* ========== M45：面包房的几个声音（全现场合成，不另外下文件） ========== */
  // 柜台铜铃：推门 / 摇一下
  function bell() {
    tone(1568, { dur: 0.85, vol: 0.055, type: 'sine' });
    tone(2350, { at: 0.005, dur: 0.55, vol: 0.026, type: 'sine' });
    tone(3136, { at: 0.012, dur: 0.35, vol: 0.013, type: 'sine' });
  }
  // 揉面：低低的「唰、唰」
  function knead() {
    for (let i = 0; i < 2; i++) {
      burst({ at: i * 0.17, freq: 460 + i * 90, q: 1.0, dur: 0.15, vol: 0.075 });
      tone(118, { at: i * 0.17, dur: 0.11, vol: 0.035, type: 'sine' });
    }
  }
  // 烤箱「叮」：闷在铁箱子里的一声，比 ding 拖得长
  function ovenDing() {
    tone(1046, { dur: 1.5, vol: 0.055, type: 'sine' });
    tone(1570, { at: 0.008, dur: 1.0, vol: 0.026, type: 'sine' });
    tone(2093, { at: 0.016, dur: 0.6, vol: 0.013, type: 'sine' });
  }
  // 咬一口面包：外壳「咔」，里面软
  function crunch() {
    burst({ freq: 2700, q: 0.7, dur: 0.055, vol: 0.16 });
    burst({ at: 0.05, freq: 1250, q: 1.2, dur: 0.10, vol: 0.10 });
    tone(92, { dur: 0.07, vol: 0.05, type: 'triangle' });
  }
  // 一团面粉的「噗」
  function puff() {
    burst({ freq: 820, q: 0.55, dur: 0.30, vol: 0.065 });
  }

  /* ========== M46：邮局的几个声音 ========== */
  // 盖章「咚」
  function thump() {
    tone(130, { dur: 0.16, vol: 0.085, type: 'sine', to: 66 });
    burst({ freq: 430, q: 0.8, dur: 0.09, vol: 0.075 });
  }
  // 纸张「唰」
  function paper() {
    for (let i = 0; i < 3; i++) {
      burst({ at: i * 0.055, freq: 2300 + i * 260, q: 0.9, dur: 0.06, vol: 0.045 });
    }
  }

  /* ========== M47：花店的几个声音 ========== */
  // 剪枝「咔、嚓」：两下很短的金属声
  function snip() {
    burst({ freq: 3200, q: 1.8, dur: 0.045, vol: 0.085 });
    burst({ at: 0.035, freq: 2100, q: 2.4, dur: 0.035, vol: 0.06 });
    tone(2480, { at: 0.01, dur: 0.09, vol: 0.012, type: 'sine' });
  }
  // 花叶 / 包装纸「沙沙」：一阵细碎的噪声
  function rustle() {
    for (let i = 0; i < 5; i++) {
      burst({ at: i * 0.045, freq: 1500 + i * 320, q: 0.7, dur: 0.10, vol: 0.038 + (i % 2) * 0.012 });
    }
  }

  /* ================= M42：公交车喇叭 =================
   * 两声闷闷的"叭—— 叭——"，别太响（街上本来就安静）
   */
  function horn() {
    const c = ctx();
    if (!c) return;
    tone(370, { dur: 0.30, vol: 0.055, type: 'sawtooth', to: 362 });
    tone(466, { dur: 0.30, vol: 0.032, type: 'sawtooth', to: 458 });
    tone(370, { at: 0.40, dur: 0.26, vol: 0.048, type: 'sawtooth', to: 364 });
    tone(466, { at: 0.40, dur: 0.26, vol: 0.028, type: 'sawtooth', to: 460 });
  }

  /* ================= 便利店（M16）：门铃 / 滑门 ================= */
  // 自动门的"叮咚"：两声小铃
  function chime() {
    const c = ctx();
    if (!c) return;
    tone(1180, { dur: 0.40, vol: 0.095, type: 'sine' });
    tone(880, { at: 0.19, dur: 0.52, vol: 0.085, type: 'sine' });
  }
  // 玻璃门滑开的气声
  function slide() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const f = filter('bandpass', 900, 0.9);
    f.frequency.setValueAtTime(680, t0);
    f.frequency.exponentialRampToValueAtTime(1700, t0 + 0.18);
    const g = gainNode(0.0001);
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30);
    s.start(t0);
    s.stop(t0 + 0.34);
  }

  /* ================= 冬天：很轻的风声（M15） ================= */
  function windOn(vol) {
    if (loops['wind']) return;
    startLoop('wind', function (c) {
      const src = noise(true);
      const lp = filter('lowpass', 420);
      const bp = filter('bandpass', 900, 0.7);
      const g = gainNode(0.0001);      // 低频那层：呼——
      const g2 = gainNode(0.0001);     // 高一点那层：气声
      src.connect(lp); lp.connect(g); g.connect(master);
      src.connect(bp); bp.connect(g2); g2.connect(master);
      const t0 = c.currentTime;
      const v = vol === undefined ? 0.075 : vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(v, t0 + 2.4);
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.linearRampToValueAtTime(v * 0.18, t0 + 3.0);
      // 风是一阵一阵的：慢慢扫低通 + 轻轻起伏音量
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.06;
      const lg = c.createGain();
      lg.gain.value = 240;
      lfo.connect(lg); lg.connect(lp.frequency);
      lfo.start(t0);
      const lfo2 = c.createOscillator();
      lfo2.frequency.value = 0.021;
      const lg2 = c.createGain();
      lg2.gain.value = 0.005;
      lfo2.connect(lg2); lg2.connect(g2.gain);
      lfo2.start(t0);
      src.start(t0);
      return { gain: g, nodes: [src, lfo, lfo2] };
    });
  }
  function windOff(fade) { stopLoop('wind', fade === undefined ? 1.6 : fade); }

  /* ================= 静音 ================= */
  function applyMute() {
    if (master && ac) {
      const t = ac.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.85, t + 0.18);
      } catch (e) {}
    }
    // 雨声是 rain.js 自己的 AudioContext，也让它一起安静
    if (XD.Rain && XD.Rain.setMuted) { try { XD.Rain.setMuted(muted); } catch (e) {} }
  }

  function setMuted(v) {
    muted = !!v;
    applyMute();
    updateButton();
    try { localStorage.setItem('xd_home_mute', muted ? '1' : '0'); } catch (e) {}
    if (!muted) ambienceStart();
    return muted;
  }

  function toggleMute() { return setMuted(!muted); }
  function isMuted() { return muted; }

  function updateButton() {
    const icon = document.getElementById('soundIcon');
    const text = document.getElementById('soundText');
    if (icon) icon.textContent = muted ? '🔇' : '🔊';
    if (text) text.textContent = muted ? '静音了' : '声音';
    const b = document.getElementById('soundbtn');
    if (b) b.classList.toggle('off', muted);
  }

  /* ================= M34：水上乐园的声音（重做） =================
   * 妈妈 11-14：「水上乐园有点太吵了，可以换成轻快的白噪音，以及水流声」
   * 所以：小孩人声整条不要了（文件留在 assets/park-audio 里，随时能换回来），
   * 底子换成两层 ——
   *   ① 很轻的白噪音（现场合成，能无缝循环、音量随时压得住）
   *   ② 真的水流声（公共领域录音，18 秒循环，摆在泳池和戏水池那两个位置）
   * 再时不时来一下"水波拍岸"/"滴答"，有点活气但不吵。
   */
  let parkDripT = null;

  // ① 轻的白噪音：一层软软的"沙——"，再慢一点起伏，像树荫底下的风
  function parkAirOn() {
    if (loops['parkAir']) return;
    startLoop('parkAir', function (c) {
      const src = noise(true);
      const hp = filter('highpass', 220, 0.7);
      const lp = filter('lowpass', 1100, 0.5);
      const g = gainNode(0.0001);
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.026, t0 + 3.2);
      // 慢慢起伏（很轻），别像一台机器在响
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.055;
      const lg = c.createGain();
      lg.gain.value = 0.009;
      lfo.connect(lg); lg.connect(g.gain);
      lfo.start(t0);
      src.start(t0);
      return { gain: g, nodes: [src, lfo] };
    });
  }

  // 水流合成兜底：录音没加载上（网断了/解码失败）也还有水声
  function parkFlowSynth() {
    if (loops['parkFlowSynth']) return;
    startLoop('parkFlowSynth', function (c) {
      const src = noise(true);
      const bp = filter('bandpass', 740, 0.75);
      const bp2 = filter('bandpass', 1600, 1.5);
      const g = gainNode(0.0001);
      const g2 = gainNode(0.0001);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.connect(bp2); bp2.connect(g2); g2.connect(master);
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.030, t0 + 2.6);
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.linearRampToValueAtTime(0.008, t0 + 3.0);
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.11;
      const lg = c.createGain();
      lg.gain.value = 160;
      lfo.connect(lg); lg.connect(bp.frequency);
      lfo.start(t0);
      src.start(t0);
      return { gain: g, nodes: [src, lfo] };
    });
  }

  // 水波拍一下池壁（一声很轻的"哗——"）
  function parkLap() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const lp = filter('lowpass', 520, 0.6);
    const g = gainNode(0.0001);
    s.connect(lp); lp.connect(g); g.connect(master);
    const dur = 0.85 + Math.random() * 0.75;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.010, t0 + dur * 0.42);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
    if (Math.random() < 0.4) burst({ freq: 1200 + Math.random() * 1100, q: 9, dur: 0.10, vol: 0.009 });
  }

  function parkDripPing() {
    if (!loops['parkAir'] && !loops['parkFlow'] && !loops['parkFlowSynth']) return;
    if (!muted) parkLap();
    parkDripT = setTimeout(parkDripPing, 2800 + Math.random() * 4400);
  }

  // 进乐园：白噪音 + 泳池水流 + 戏水池的水（位置在 park.js 里给）
  let parkPos = null;
  let parkRetry = null;
  let parkTries = 0;

  // 三层水声：水流（录音没到就用合成兜底）+ 戏水池
  // 注意：录音是异步下载解码的，进乐园那一刻可能还没就绪 —— 后面会重试补齐
  function parkWaterLayers() {
    const p = parkPos || {};
    const pool = p.pool || { x: 0, y: 0, z: -48 };
    const pad = p.pad || { x: 14.6, y: 0.2, z: -47 };
    if (!loops['parkFlow'] && buffers['waterFlow']) {
      if (startBufLoop('waterFlow', 'parkFlow', 0.34, 3.6, 1, pool, true)) {
        stopLoop('parkFlowSynth', 0.8);      // 真的水流来了，把合成的让位
      }
    }
    if (!loops['parkFlow'] && !loops['parkFlowSynth']) parkFlowSynth();
    if (!loops['parkPad'] && buffers['fountainNoise']) {
      startBufLoop('fountainNoise', 'parkPad', 0.26, 4.0, 1, pad, true);
    }
  }

  function parkScheduleRetry() {
    if (parkRetry || parkTries > 14) return;
    parkRetry = setTimeout(function () {
      parkRetry = null;
      parkTries++;
      if (!parkPos) return;
      parkWaterLayers();
      if (!loops['parkFlow'] || !loops['parkPad']) parkScheduleRetry();
    }, 700);
  }

  function parkOn(pos) {
    if (muted) return;
    ctx();
    parkAirOn();
    parkPos = pos || {};
    parkTries = 0;
    parkWaterLayers();
    parkScheduleRetry();
    if (!parkDripT) parkDripT = setTimeout(parkDripPing, 2600);
  }

  function parkOff() {
    parkPos = null;
    if (parkRetry) { clearTimeout(parkRetry); parkRetry = null; }
    stopLoop('parkAir', 1.6);
    stopLoop('parkFlow', 1.6);
    stopLoop('parkFlowSynth', 1.6);
    stopLoop('parkPad', 1.8);
    if (parkDripT) { clearTimeout(parkDripT); parkDripT = null; }
  }

  // 落水 / 跳进水里的水花（公开领域录音，见 assets/park-audio/CREDITS.md）
  function parkSplash(vol) {
    const v = vol === undefined ? 0.62 : vol;
    if (playBuf('splashTub', { vol: v, rate: 0.90 + Math.random() * 0.16, max: 3.0 })) return;
    splash();
  }
  // 小水花（甩水、踩水、鱼摆尾）
  function parkSplashSmall() {
    burst({ freq: 2100, q: 1.1, dur: 0.13, vol: 0.045 });
    burst({ at: 0.05, freq: 900, q: 1.4, dur: 0.16, vol: 0.030 });
  }
  // 扎进水里：一声闷"咚" + 水花 + 冒泡
  function parkDive() {
    tone(120, { dur: 0.40, vol: 0.045, to: 62, type: 'sine' });
    parkSplash(0.55);
    parkBubbles(7);
  }
  // 甩水（从水里出来抖一身）
  function parkShake() {
    for (let i = 0; i < 4; i++) {
      burst({ at: i * 0.11, freq: 2600 + Math.random() * 1200, q: 1.6, dur: 0.055, vol: 0.030 });
    }
    burst({ at: 0.06, freq: 500, q: 1.0, dur: 0.20, vol: 0.020 });
  }
  // 滑水道：风声从高到低
  function parkWhoosh() {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime;
    const s = noise(false);
    const bp = filter('bandpass', 2400, 0.9);
    bp.frequency.setValueAtTime(2600, t0);
    bp.frequency.exponentialRampToValueAtTime(420, t0 + 0.95);
    const g = gainNode(0.0001);
    s.connect(bp); bp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.042, t0 + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
    s.start(t0);
    s.stop(t0 + 1.1);
  }
  // 水里冒泡：一串小泡
  function parkBubbles(n) {
    const c = ctx();
    if (!c) return;
    const k = n || 6;
    for (let i = 0; i < k; i++) {
      const at = i * (0.055 + Math.random() * 0.05);
      const f = 320 + Math.random() * 520;
      burst({ at: at, freq: f, q: 7, dur: 0.055, vol: 0.016 + Math.random() * 0.008 });
      tone(f * 2.4, { at: at, dur: 0.055, vol: 0.007, to: f * 4.2, type: 'sine' });
    }
  }

  /* 吃东西（M34）：买了就真吃/真喝，别只"叮"一声
   * kind: 'sip' 吸管 / 'crunch' 脆的（甜筒、烤玉米）/ 'chew' 软一点的（爆米花、棉花糖）/ 'gulp' 咽一口
   */
  function eat(kind) {
    const k = kind || 'chew';
    if (k === 'sip') {
      if (playBuf('slurp', { vol: 0.42, rate: 1.02 + Math.random() * 0.10, max: 1.5 })) return;
    }
    if (k === 'crunch') {
      for (let i = 0; i < 3; i++) {
        burst({ at: i * 0.095, freq: 2300 + Math.random() * 900, q: 3.2, dur: 0.050, vol: 0.090 });
      }
      tone(150, { dur: 0.07, vol: 0.014, to: 110 });
      return;
    }
    if (k === 'gulp') {
      tone(180, { dur: 0.16, vol: 0.026, to: 88, type: 'sine' });
      burst({ freq: 700, q: 1.2, dur: 0.12, vol: 0.022 });
      return;
    }
    // chew：两三下闷闷的嚼
    for (let i = 0; i < 3; i++) {
      burst({ at: i * 0.135, freq: 620 + Math.random() * 320, q: 1.0, dur: 0.115, vol: 0.058 });
    }
    tone(110, { dur: 0.10, vol: 0.012, to: 80 });
  }

  function build() {
    try { muted = localStorage.getItem('xd_home_mute') === '1'; } catch (e) {}
    // 一进来就把录音预加载好（不用等点击，解码不需要手势）
    loadAll();
    // 按钮可能比脚本晚，等 DOM ready 再同步一次
    setTimeout(updateButton, 0);
    return api();
  }

  function api() {
    return {
      unlock: unlock,
      blip: blip,
      snap: snap,
      chop: chop,
      ignite: ignite,
      extinguish: extinguish,
      sizzleOn: sizzleOn,
      sizzleOff: sizzleOff,
      boilOn: boilOn,
      boilOff: boilOff,
      pour: pour,
      stir: stir,
      hoodOn: hoodOn,
      hoodOff: hoodOff,
      waterOn: waterOn,
      waterOff: waterOff,
      splash: splash,
      drain: drain,
      fridgeHiss: fridgeHiss,
      fridgeOpen: fridgeOpen,
      fridgeClose: fridgeClose,
      lid: lid,
      clink: clink,
      slurp: slurp,
      pop: pop,
      ding: ding,
      bubble: bubble,
      step: step,
      windOn: windOn,
      windOff: windOff,
      chime: chime,
      slide: slide,
      beep: beep,
      pickup: pickup,
      cash: cash,
      print: print,
      bag: bag,
      cat: cat,
      coffee: coffee,
      freezer: freezer,
      mailbox: mailbox,
      horn: horn,
      // M45：面包房
      bell: bell,
      knead: knead,
      ovenDing: ovenDing,
      crunch: crunch,
      puff: puff,
      // M46：邮局
      thump: thump,
      paper: paper,
      // M47：花店
      snip: snip,
      rustle: rustle,
      stepInfo: stepIndexInfo,
      // M33：水上乐园的环境声 / 水花（M34 重做成白噪音 + 水流）
      parkOn: parkOn,
      parkOff: parkOff,
      parkSplash: parkSplash,
      parkSplashSmall: parkSplashSmall,
      parkDive: parkDive,
      parkShake: parkShake,
      parkWhoosh: parkWhoosh,
      parkBubbles: parkBubbles,
      parkLap: parkLap,
      // M34：乐园声音自检（白噪音 / 水流 / 戏水池 是不是都开着）
      parkAudio: function () {
        return {
          air: !!loops['parkAir'],
          flow: !!loops['parkFlow'],
          flowSynth: !!loops['parkFlowSynth'],
          pad: !!loops['parkPad'],
          drip: !!parkDripT,
          retry: !!parkRetry,
          tries: parkTries,
          bufs: Object.keys(buffers).length,
          loaded: ['waterFlow', 'fountainNoise', 'splashTub'].filter(function (k) { return !!buffers[k]; })
        };
      },
      // M35：现在有哪几层在循环、目标音量多少（自检厨房喧不喧用）
      loopsInfo: function () {
        const out = {};
        Object.keys(loops).forEach(function (k) {
          const h = loops[k];
          out[k] = h.vol === undefined ? Math.round(h.gain.gain.value * 1000) / 1000 : h.vol;
        });
        return out;
      },
      eat: eat,
      setListener: setListener,
      ambienceStart: ambienceStart,
      ambienceStop: ambienceStop,
      tick: tick,
      loadMusic: loadMusic,
      playMusic: playMusic,
      stopMusic: stopMusic,
      setMusicEnded: setMusicEnded,
      onMusicReady: onMusicReady,
      isMusicPlaying: isMusicPlaying,
      nowPlaying: nowPlaying,
      musicLoaded: musicLoaded,
      setMuted: setMuted,
      toggleMute: toggleMute,
      isMuted: isMuted,
      updateButton: updateButton,
      // 自检：哪些录音真的加载上了
      loaded: function () { return Object.keys(buffers); },
      reload: loadAll
    };
  }

  // 别的地方可能直接 XD.SFX.xxx()（interact 的"叮"），所以 build 前也给一份
  const early = api();

  return Object.assign({ build: build }, early);
})();
