/* 小D的赛博小家 · M7 氛围
 * 白天/夜晚（跟着真实时间）、窗边的灯串、光束里的灰尘
 */
window.XD = window.XD || {};

XD.Atmos = (function () {
  'use strict';

  let refs = null;          // { scene, renderer, room, lights }
  let mode = 'night';
  let bulbs = [];
  let dust = null;
  let dustData = null;
  let t = 0;
  let dayTex = null;
  let nightTex = null;
  let skyDay = null;
  let skyNight = null;
  let stringsOn = true;     // 灯串开没开（M8 可以点它关掉）

  /* 背景：竖向渐变天空（画一张贴图贴到底） */
  function skyGradient(top, mid, bottom) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 512;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, top);
    grd.addColorStop(0.55, mid);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  let starTex = null;

  /* ================= 灯串（挂在窗户上方） ================= */
  function stringLights(root) {
    const g = new THREE.Group();
    g.name = 'string-lights';

    const X = -4.30, Y = 2.68;
    const Z0 = -1.86, Z1 = 1.44;
    const SAG = 0.26;
    const N = 15;

    const wirePts = [];
    const positions = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const z = Z0 + (Z1 - Z0) * u;
      // 悬链线：中间下垂
      const y = Y - Math.sin(u * Math.PI) * SAG;
      wirePts.push(new THREE.Vector3(X, y, z));
      positions.push({ x: X, y: y, z: z });
    }

    // 电线
    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
    const wire = new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: 0x2b2620, transparent: true, opacity: 0.9 }));
    g.add(wire);

    // 灯泡（暖光小球 + 一点点光晕）
    const glowTex = XD.Mat.glowSprite('rgba(255,214,150,1)');
    positions.forEach(function (p, i) {
      if (i % 2 === 1) return;      // 隔一个挂一颗，别太密
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.023, 10, 8), mat);
      b.position.set(p.x, p.y - 0.035, p.z);
      g.add(b);
      // 光晕（精灵）
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      s.scale.set(0.16, 0.16, 1);
      s.position.copy(b.position);
      g.add(s);
      bulbs.push({ mesh: b, mat: mat, glow: s, base: b.position.clone(), phase: i * 0.7 });
    });

    // 两盏小灯照着窗边（省得挂一排点光源）
    const warm = new THREE.PointLight(0xffbe7a, 0.42, 3.2, 2);
    warm.position.set(-4.15, 2.25, -0.2);
    g.add(warm);

    root.add(g);
    return g;
  }

  /* ================= 空气里的灰尘 ================= */
  function dustMotes(scene) {
    const N = 240;
    const pos = new Float32Array(N * 3);
    dustData = [];
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 8.2;
      const y = 0.15 + Math.random() * 2.7;
      const z = (Math.random() - 0.5) * 6.2;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      dustData.push({
        x: x, y: y, z: z,
        vy: 0.008 + Math.random() * 0.022,
        phase: Math.random() * Math.PI * 2,
        amp: 0.03 + Math.random() * 0.09
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      map: XD.Mat.glowSprite('rgba(255,244,214,1)'),
      color: 0xfff0cf,
      size: 0.028,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    dust.name = 'dust';
    scene.add(dust);
    return dust;
  }

  /* ================= 昼夜 ================= */
  const MODE = {
    night: {
      exposure: 1.06,
      bg: 0x080b12,
      fog: 0x0a0f1a,
      dust: 0.5,
      bulb: 1.0,
      sign: 1.0,
      signLight: 0.55,
      bulbColor: 0xffd9a0
    },
    day: {
      exposure: 1.0,
      bg: 0x8199ad,
      fog: 0xb3c8d8,
      dust: 0.18,
      bulb: 0.35,
      sign: 0.42,
      signLight: 0.12,
      bulbColor: 0xd9d2c2
    }
  };

  function ensureTextures() {
    if (!dayTex) {
      dayTex = { far: XD.Mat.cityDay(), near: XD.Mat.nearBuildingDay() };
      dayTex.near.wrapS = dayTex.near.wrapT = THREE.RepeatWrapping;
      dayTex.near.repeat.set(0.56, 0.30);
      dayTex.near.offset.set(0.22, 0.10);
      nightTex = null;
      skyDay = skyGradient('#7ea9d4', '#b9d3e8', '#e8f0f6');
      skyNight = skyGradient('#05070d', '#0b1526', '#1b2740');
    }
  }

  function setMode(m) {
    mode = (m === 'day') ? 'day' : 'night';
    const cfg = MODE[mode];
    ensureTextures();

    const room = refs.room;
    const scene = refs.scene;
    const renderer = refs.renderer;

    // 窗外（远景城市 / 对街楼 / 玻璃三处都要换）
    if (mode === 'day') {
      if (!nightTex) {
        nightTex = {
          far: room.sky.far.material.map,
          near: room.sky.near.material.map,
          glass: room.sky.glass.material.map
        };
      }
      room.sky.far.material.map = dayTex.far;
      room.sky.far.material.needsUpdate = true;
      room.sky.near.material.map = dayTex.near;
      room.sky.near.material.needsUpdate = true;
      room.sky.glass.material.map = dayTex.near;
      room.sky.glass.material.color.setHex(0xffffff);
      room.sky.glass.material.opacity = 0.99;
      room.sky.glass.material.needsUpdate = true;
    } else {
      if (nightTex) {
        room.sky.far.material.map = nightTex.far;
        room.sky.near.material.map = nightTex.near;
        room.sky.glass.material.map = nightTex.glass;
      }
      room.sky.far.material.needsUpdate = true;
      room.sky.near.material.needsUpdate = true;
      room.sky.glass.material.color.setHex(0x93a2c2);
      room.sky.glass.material.opacity = 0.97;
      room.sky.glass.material.needsUpdate = true;
    }

    // 背景 / 雾 / 曝光
    scene.background = mode === 'day' ? skyDay : skyNight;
    if (scene.fog) {
      scene.fog.color.setHex(cfg.fog);
      scene.fog.near = mode === 'day' ? 20 : 16;
      scene.fog.far = mode === 'day' ? 46 : 34;
    }
    renderer.toneMappingExposure = cfg.exposure;

    // 灯串
    bulbs.forEach(function (b) {
      b.mat.color.setHex(stringsOn ? cfg.bulbColor : 0x2b2620);
      b.glow.material.opacity = stringsOn ? 0.55 * cfg.bulb : 0;
    });

    // 灰尘
    if (dust) dust.material.opacity = cfg.dust;

    // 霓虹灯牌：白天收敛一点
    if (room.sign) {
      room.sign.mat.color.setHex(mode === 'day' ? 0x5e6f96 : 0xa8c4ff);
      room.sign.light.intensity = cfg.signLight;
    }

    updateButton();
    return mode;
  }

  /* 每帧跟随主灯开关等级，设置夜/白两套灯光 */
  function applyLighting(L, level) {
    if (!L) return;
    if (mode === 'day') {
      L.main.intensity = 0.85 * level;
      L.win.color.setHex(0xfff1d6);
      L.win.position.set(-9.5, 7.8, 1.2);
      L.win.intensity = 1.9;
      L.winFill.intensity = 0.15;
      L.hemi.color.setHex(0xc2daf2);
      L.hemi.groundColor.setHex(0x6b5a48);
      L.hemi.intensity = 1.0;
      L.ambient.color.setHex(0xa6bccf);
      L.ambient.intensity = 0.58;
      L.bounce.intensity = 0.42 * level;
    } else {
      L.main.intensity = 2.0 * level;
      L.win.color.setHex(0x9db8ff);
      L.win.position.set(-9.5, 4.6, -0.4);
      // M34.5：关灯时连"窗外漏进来的光"和天光也一起收，屋子才真的暗下来
      L.win.intensity = 0.55 * (0.45 + 0.55 * level);
      L.winFill.intensity = 0.35 * (0.30 + 0.70 * level);
      L.hemi.color.setHex(0x5a6f9a);
      L.hemi.groundColor.setHex(0x241c14);
      L.hemi.intensity = 0.42 * (0.30 + 0.70 * level);
      L.ambient.color.setHex(0x2a3550);
      L.ambient.intensity = 0.30 * (0.30 + 0.70 * level);
      L.bounce.intensity = 0.22 * level;
    }
  }

  /* ================= 动画 ================= */
  function update(dt) {
    t += dt;

    // 灯串轻轻闪
    const lit = stringsOn ? 1 : 0;
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const k = 0.86 + Math.sin(t * 1.6 + b.phase) * 0.08 + Math.sin(t * 3.7 + b.phase * 2) * 0.04;
      b.glow.material.opacity = (mode === 'day' ? 0.2 : 0.55) * k * lit;
      b.glow.scale.setScalar(0.14 + k * 0.05);
      b.mesh.scale.setScalar(0.94 + k * 0.08);
    }

    // 灰尘慢慢飘
    if (dust && dustData) {
      const arr = dust.geometry.attributes.position.array;
      for (let i = 0; i < dustData.length; i++) {
        const d = dustData[i];
        d.y += d.vy * dt;
        if (d.y > 3.05) {
          d.y = 0.12;
          d.x = (Math.random() - 0.5) * 8.2;
          d.z = (Math.random() - 0.5) * 6.2;
        }
        arr[i * 3] = d.x + Math.sin(t * 0.35 + d.phase) * d.amp;
        arr[i * 3 + 1] = d.y;
        arr[i * 3 + 2] = d.z + Math.cos(t * 0.28 + d.phase) * d.amp * 0.8;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ================= UI ================= */
  function updateButton() {
    const icon = document.getElementById('timeIcon');
    const text = document.getElementById('timeText');
    if (!icon || !text) return;
    icon.textContent = mode === 'day' ? '☀️' : '🌙';
    text.textContent = mode === 'day' ? '白天' : '夜晚';
  }

  /* 灯串开关（点窗边那一串，或者交互模块调用） */
  function setStrings(v) {
    stringsOn = !!v;
    const cfg = MODE[mode];
    bulbs.forEach(function (b) {
      b.mat.color.setHex(stringsOn ? cfg.bulbColor : 0x2b2620);
      b.glow.material.opacity = stringsOn ? 0.55 * cfg.bulb : 0;
    });
    return stringsOn;
  }
  function getStrings() { return stringsOn; }

  /* ================= 总装 ================= */
  function build(scene, renderer, room, lights) {
    refs = { scene: scene, renderer: renderer, room: room, lights: lights };

    const root = new THREE.Group();
    root.name = 'atmos-m7';
    stringLights(root);
    scene.add(root);
    dustMotes(scene);

    // 跟着真实时间：7 点到 18 点算白天
    const hour = new Date().getHours();
    setMode(hour >= 7 && hour < 18 ? 'day' : 'night');

    return {
      setMode: setMode,
      toggle: function () { return setMode(mode === 'day' ? 'night' : 'day'); },
      getMode: function () { return mode; },
      getExposure: function () { return MODE[mode].exposure; },
      setStrings: setStrings,
      getStrings: getStrings,
      applyLighting: applyLighting,
      update: update
    };
  }

  return { build: build };
})();
