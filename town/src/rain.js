/* 小D的赛博小家 · M8 下雨
 * 点右上角「🌧 下雨」，或者按 Y 键
 * 雨是挂在窗玻璃上的（窗外的景是一张贴图，所以雨就下在玻璃上）
 * 雨声是当场合成的，不用音频文件 —— 浏览器要求先有一个点击/按键才肯出声
 */
window.XD = window.XD || {};

XD.Rain = (function () {
  'use strict';

  // 窗洞：x=-4.52 的玻璃，y 0.85~2.55，z -1.8~1.4
  const WIN = { x: -4.52, y0: 0.85, y1: 2.55, z0: -1.80, z1: 1.40 };
  const CY = (WIN.y0 + WIN.y1) / 2;
  const CZ = (WIN.z0 + WIN.z1) / 2;
  const WZ = WIN.z1 - WIN.z0;
  const WY = WIN.y1 - WIN.y0;

  let refs = null;
  let group = null;
  let on = false;
  let t = 0;

  let sheet = null;        // 往下淌的雨帘
  let streaks = null;      // 落在玻璃上的雨丝
  let streakData = null;
  let drops = [];          // 玻璃上的水珠
  let veil = null;         // 灰濛濛的一层，压住窗外的城市

  let actx = null, master = null, audioReady = false;
  let muted = false;       // M11 的静音也管着雨声

  /* ================= 贴图 ================= */
  function rainSheetTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 512);
    // 一条条的雨痕
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * 256;
      const len = 30 + Math.random() * 150;
      const y = Math.random() * 512;
      const a = 0.05 + Math.random() * 0.20;
      const grd = g.createLinearGradient(x, y, x, y + len);
      grd.addColorStop(0, 'rgba(220,235,255,0)');
      grd.addColorStop(0.35, 'rgba(220,235,255,' + a.toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(220,235,255,0)');
      g.strokeStyle = grd;
      g.lineWidth = 0.7 + Math.random() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 3, y + len);
      g.stroke();
    }
    // 一些水痕结的块
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 256, y = Math.random() * 512;
      const r = 1 + Math.random() * 3;
      g.fillStyle = 'rgba(230,242,255,' + (0.05 + Math.random() * 0.12).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.4, 1.0);
    return tex;
  }

  function dropletTex() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    // 水珠：外圈淡、中间亮、右上一点高光
    const grd = g.createRadialGradient(30, 34, 2, 32, 32, 28);
    grd.addColorStop(0, 'rgba(240,250,255,0.85)');
    grd.addColorStop(0.5, 'rgba(190,220,245,0.45)');
    grd.addColorStop(1, 'rgba(150,190,225,0.0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(32, 32, 20, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(26, 24, 5, 7, -0.4, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ================= 视觉 ================= */
  function makeVeil() {
    // 稍微压暗窗外，看着才像阴天
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7e93ab, transparent: true, opacity: 0.20, depthWrite: false, fog: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WZ, WY), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(WIN.x + 0.014, CY, CZ);
    m.name = 'rain-veil';
    group.add(m);
    veil = m;
  }

  function makeSheet() {
    const mat = new THREE.MeshBasicMaterial({
      map: rainSheetTex(), transparent: true, opacity: 0.40,
      depthWrite: false, blending: THREE.NormalBlending, fog: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WZ, WY), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(WIN.x + 0.022, CY, CZ);
    m.name = 'rain-sheet';
    group.add(m);
    sheet = m;
  }

  function makeStreaks() {
    const N = 190;
    const pos = new Float32Array(N * 2 * 3);
    streakData = [];
    for (let i = 0; i < N; i++) {
      streakData.push(newDrop(true));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xd8e9fb, transparent: true, opacity: 0.5, depthWrite: false, fog: false
    });
    streaks = new THREE.LineSegments(geo, mat);
    streaks.frustumCulled = false;
    streaks.name = 'rain-streaks';
    group.add(streaks);
    writeStreaks();
  }

  function newDrop(anywhere) {
    return {
      x: WIN.x + 0.024 + Math.random() * 0.028,
      y: anywhere ? WIN.y0 + Math.random() * (WY + 0.5) : WIN.y1 + Math.random() * 0.5,
      z: WIN.z0 + Math.random() * WZ,
      v: 1.5 + Math.random() * 2.2,
      len: 0.10 + Math.random() * 0.20,
      tilt: (Math.random() - 0.5) * 0.03
    };
  }

  function writeStreaks() {
    const arr = streaks.geometry.attributes.position.array;
    for (let i = 0; i < streakData.length; i++) {
      const d = streakData[i];
      const o = i * 6;
      arr[o] = d.x; arr[o + 1] = d.y; arr[o + 2] = d.z;
      arr[o + 3] = d.x + d.tilt; arr[o + 4] = d.y - d.len; arr[o + 5] = d.z + 0.008;
    }
    streaks.geometry.attributes.position.needsUpdate = true;
  }

  function makeDrops() {
    const tex = dropletTex();
    for (let i = 0; i < 46; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.55 + Math.random() * 0.35,
        depthWrite: false, fog: false
      });
      const s = new THREE.Sprite(mat);
      const size = 0.012 + Math.random() * 0.030;
      s.scale.set(size, size * (1.0 + Math.random() * 0.8), 1);
      s.position.set(
        WIN.x + 0.030 + Math.random() * 0.010,
        WIN.y0 + Math.random() * WY,
        WIN.z0 + Math.random() * WZ
      );
      s.userData = {
        v: 0.012 + Math.random() * 0.055,
        amp: 0.004 + Math.random() * 0.010,
        phase: Math.random() * Math.PI * 2,
        z0: s.position.z,
        base: size
      };
      group.add(s);
      drops.push(s);
    }
  }

  /* ================= 声音（现场合成，不用文件） ================= */
  function initAudio() {
    if (audioReady) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      actx = new AC();
      const sr = actx.sampleRate;
      const len = Math.floor(sr * 4);
      const buf = actx.createBuffer(1, len, sr);
      const ch = buf.getChannelData(0);
      // 粉红噪声：比纯白噪声更像雨
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        ch[i] = (b0 + b1 + b2 + w * 0.1848) * 0.15;
      }
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const hp = actx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 360;
      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 5600; lp.Q.value = 0.4;
      const peak = actx.createBiquadFilter();
      peak.type = 'peaking'; peak.frequency.value = 1400; peak.Q.value = 0.8; peak.gain.value = 3.0;

      master = actx.createGain();
      master.gain.value = 0;

      src.connect(hp); hp.connect(lp); lp.connect(peak); peak.connect(master);
      master.connect(actx.destination);
      src.start();

      // 让雨声有起伏，不然是一坨死噪声
      const lfo = actx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = actx.createGain();
      lfoGain.gain.value = 520;
      lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
      lfo.start();

      audioReady = true;
      return true;
    } catch (e) {
      console.warn('[rain] 声音没起来', e);
      return false;
    }
  }

  function fadeTo(v) {
    if (!master) return;
    const now = actx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(v, now + 1.1);
  }

  /* ================= 开关 ================= */
  function set(v) {
    const want = !!v;
    if (want === on && group) {
      // 已经在这个状态了也把 UI 同步一下
      updateButton();
      return on;
    }
    on = want;

    if (on) {
      if (initAudio() && actx) {
        if (actx.state === 'suspended') actx.resume();
        fadeTo(muted ? 0 : 0.115);
      }
      if (group) {
        group.visible = true;
        t = 0;
      }
    } else {
      fadeTo(0);
      if (group) group.visible = false;
    }

    // 把窗外恢复成 atmos 该有的样子
    if (!on && refs && refs.atmos) refs.atmos.setMode(refs.atmos.getMode());
    if (!on && refs && refs.room) {
      refs.room.sky.far.material.color.setHex(0xffffff);
      refs.room.sky.near.material.color.setHex(0xffffff);
    }

    updateButton();
    return on;
  }

  function toggle() { return set(!on); }
  function isOn() { return on; }

  // 静音（M11）：雨声跟着一起收，别一边"静音"一边哗哗响
  function setMuted(v) {
    muted = !!v;
    if (on && audioReady) fadeTo(muted ? 0 : 0.115);
    return muted;
  }

  function updateButton() {
    const icon = document.getElementById('rainIcon');
    const text = document.getElementById('rainText');
    if (icon) icon.textContent = on ? '🌧' : '🌦';
    if (text) text.textContent = on ? '下着雨' : '下雨';
    const b = document.getElementById('rainbtn');
    if (b) b.classList.toggle('on', on);
  }

  /* ================= 每帧 ================= */
  function update(dt) {
    if (!on || !group) return;
    t += dt;

    // 雨帘往下淌
    if (sheet && sheet.material.map) {
      sheet.material.map.offset.y -= dt * 0.10;
      sheet.material.map.offset.x = Math.sin(t * 0.12) * 0.03;
      sheet.material.opacity = 0.36 + Math.sin(t * 1.3) * 0.04;
    }

    // 雨丝
    if (streaks && streakData) {
      for (let i = 0; i < streakData.length; i++) {
        const d = streakData[i];
        d.y -= d.v * dt;
        if (d.y < WIN.y0 - 0.05) {
          const nd = newDrop(false);
          d.y = nd.y; d.x = nd.x; d.z = nd.z; d.v = nd.v; d.len = nd.len; d.tilt = nd.tilt;
        }
      }
      writeStreaks();
    }

    // 水珠往下滑
    for (let i = 0; i < drops.length; i++) {
      const s = drops[i];
      const u = s.userData;
      s.position.y -= u.v * dt * (1 + Math.sin(t * 0.8 + u.phase) * 0.35);
      s.position.z = u.z0 + Math.sin(t * 0.5 + u.phase) * u.amp;
      if (s.position.y < WIN.y0 + 0.02) {
        s.position.y = WIN.y1 - Math.random() * 0.12;
        s.position.z = WIN.z0 + Math.random() * WZ;
        u.z0 = s.position.z;
        u.v = 0.012 + Math.random() * 0.055;
        const sc = u.base * (0.7 + Math.random() * 0.7);
        s.scale.set(sc, sc * (1.0 + Math.random() * 0.8), 1);
      }
    }

    // 窗外压暗（跟昼夜模式配合；atmos 换模式后一帧内会被这里纠正回来）
    if (refs) {
      const day = refs.atmos && refs.atmos.getMode() === 'day';
      refs.room.sky.glass.material.color.setHex(day ? 0xa3b2bf : 0x8a9cb4);
      refs.room.sky.far.material.color.setHex(0xc4d0dc);
      refs.room.sky.near.material.color.setHex(0xc4d0dc);
      if (refs.atmos && refs.atmos.getExposure) {
        refs.renderer.toneMappingExposure = refs.atmos.getExposure() * 0.94;
      }
    }

    // 灰濛濛那层轻轻呼吸
    if (veil) veil.material.opacity = 0.30 + Math.sin(t * 0.5) * 0.035;
  }

  /* ================= 总装 ================= */
  function build(scene, room, renderer, atmos) {
    refs = { scene: scene, room: room, renderer: renderer, atmos: atmos };

    group = new THREE.Group();
    group.name = 'rain-m8';
    group.visible = false;
    makeVeil();
    makeSheet();
    makeStreaks();
    makeDrops();
    scene.add(group);

    updateButton();
    return { set: set, toggle: toggle, isOn: isOn, update: update, setMuted: setMuted };
  }

  return { build: build };
})();
