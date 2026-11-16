/* 小D的赛博小家 · M13 客厅的唱片机
 * 玄关右边的矮柜上摆一台小唱机：点唱机 = 放 / 停，点旁边的唱片箱 = 换一张。
 * 唱片一转、唱臂落下去，声音从那个角落传出来（走远了会变小）。
 * 音乐文件在 assets/music/，都是 CC0，详见 assets/music/CREDITS.md。
 */
window.XD = window.XD || {};

XD.Records = (function () {
  'use strict';

  // 三张唱片（顺序就是换碟顺序）
  const TRACKS = [
    { key: 'lofi1', url: 'assets/music/lofi1.ogg', name: 'Lo-fi 一号', label: '#7b5ea7' },
    { key: 'lofi2', url: 'assets/music/lofi2.mp3', name: 'Lo-fi 二号', label: '#3f6f7a' },
    { key: 'jazz1', url: 'assets/music/jazz1.mp3', name: '深夜爵士', label: '#a2583f' }
  ];

  const ORIGIN = { x: 3.72, z: -3.24 };
  const TOP = 0.652;          // 柜面高度
  const SPIN = 2.6;           // 唱片转多快（rad/s，氛围用，不追求真转速）

  let refs = null, scene = null, sfx = null;
  let root = null, platter = null, recordMesh = null, toneArm = null, ledMat = null;
  let index = 0;
  let playing = false;
  let pending = false;        // 点了播放但音乐还没解码完
  let armAngle = 0.62;        // 唱臂：0 = 落在唱片上，0.62 = 抬起来
  let armTarget = 0.62;
  let spinT = 0;
  let glow = 0;

  function mesh(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function box(w, h, d, x, y, z, mat, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, parent);
  }

  function say(text, life) {
    if (refs && refs.say) {
      try { refs.say(new THREE.Vector3(ORIGIN.x, 1.22, ORIGIN.z + 0.06), text, life || 3.2); } catch (e) {}
    }
  }

  /* 唱片贴图：一圈圈纹路 + 中间标签 */
  function recordTex(labelColor) {
    return XD.Mat.tex(256, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      // 盘面
      g.beginPath();
      g.arc(cx, cy, w * 0.48, 0, Math.PI * 2);
      g.fillStyle = '#15161a';
      g.fill();
      // 纹路
      for (let r = w * 0.16; r < w * 0.48; r += 2.2) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.05).toFixed(3) + ')';
        g.lineWidth = 1;
        g.stroke();
      }
      // 标签
      g.beginPath();
      g.arc(cx, cy, w * 0.155, 0, Math.PI * 2);
      g.fillStyle = labelColor;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.font = 'bold 17px "Microsoft YaHei"';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('小D', cx, cy - 8);
      g.font = '11px "Microsoft YaHei"';
      g.fillText('SIDE A', cx, cy + 12);
    });
  }

  function build(ctx) {
    refs = ctx || {};
    scene = refs.scene;
    sfx = refs.sfx || null;
    if (!scene) return null;

    root = new THREE.Group();
    root.name = 'records-m13';
    root.position.set(ORIGIN.x, 0, ORIGIN.z);
    scene.add(root);

    /* ---------- 矮柜 ---------- */
    // 颜色统一转线性（不然在 sRGB 里会被渲染得发白，坑清单第 3 条）
    function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
    const woodMat = new THREE.MeshStandardMaterial({ color: col(0x8a6242), roughness: 0.62 });
    const woodDark = new THREE.MeshStandardMaterial({ color: col(0x6a4a30), roughness: 0.66 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: col(0xc9a227), roughness: 0.3, metalness: 0.6
    });
    const upL = 0.62;
    // 四条腿
    [[-0.38, -0.16], [0.38, -0.16], [-0.38, 0.16], [0.38, 0.16]].forEach(function (p) {
      cyl(0.022, 0.026, upL - 0.10, 8, p[0], (upL - 0.10) / 2, p[1], woodDark, root);
    });
    box(0.86, 0.46, 0.40, 0, 0.36, 0, woodMat, root);
    // 柜门 + 黄铜拉手
    box(0.40, 0.34, 0.016, -0.19, 0.34, 0.205, woodDark, root);
    box(0.40, 0.34, 0.016, 0.22, 0.34, 0.205, woodDark, root);
    cyl(0.012, 0.012, 0.05, 8, -0.02, 0.34, 0.228, brassMat, root);
    cyl(0.012, 0.012, 0.05, 8, 0.05, 0.34, 0.228, brassMat, root);
    // 柜面
    box(0.90, 0.036, 0.44, 0, TOP - 0.018, 0, woodMat, root);

    /* ---------- 唱机底座 ---------- */
    const deckMat = new THREE.MeshStandardMaterial({ color: col(0x22262c), roughness: 0.5, metalness: 0.25 });
    const aluMat = new THREE.MeshStandardMaterial({ color: col(0xb9c1c9), roughness: 0.32, metalness: 0.5 });
    const tt = { x: -0.14, y: TOP, z: 0 };
    box(0.50, 0.055, 0.40, tt.x, tt.y + 0.028, tt.z, deckMat, root);
    // 转速旋钮 + 铭牌
    cyl(0.018, 0.018, 0.016, 12, tt.x - 0.16, tt.y + 0.062, tt.z - 0.14, brassMat, root);
    // 电源小灯（放歌的时候亮）
    ledMat = new THREE.MeshBasicMaterial({ color: 0x2b3b33 });
    const led = box(0.020, 0.008, 0.010, tt.x + 0.16, tt.y + 0.059, tt.z - 0.14, ledMat, root);
    void led;

    /* ---------- 转盘 + 唱片 ---------- */
    platter = new THREE.Group();
    platter.position.set(tt.x, tt.y + 0.058, tt.z);
    root.add(platter);
    cyl(0.158, 0.158, 0.014, 40, 0, 0, 0, aluMat, platter);
    cyl(0.150, 0.150, 0.010, 40, 0, 0.012, 0, new THREE.MeshStandardMaterial({ color: 0x1a1b1f, roughness: 0.5 }), platter);

    const texRecord = recordTex(TRACKS[0].label);
    recordMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.142, 0.142, 0.004, 40),
      new THREE.MeshStandardMaterial({ map: texRecord, roughness: 0.35, metalness: 0.1 })
    );
    recordMesh.position.y = 0.019;
    platter.add(recordMesh);
    cyl(0.006, 0.006, 0.026, 8, 0, 0.024, 0, aluMat, platter);   // 中心轴

    /* ---------- 唱臂 ---------- */
    toneArm = new THREE.Group();
    toneArm.position.set(tt.x + 0.19, tt.y + 0.062, tt.z - 0.13);
    root.add(toneArm);
    cyl(0.014, 0.016, 0.05, 10, 0, 0.012, 0, aluMat, toneArm);
    const arm = box(0.30, 0.010, 0.012, -0.15, 0.032, 0, aluMat, toneArm);
    arm.rotation.z = 0.0;
    const head = box(0.045, 0.016, 0.020, -0.30, 0.028, 0.010, deckMat, toneArm);
    head.rotation.z = -0.22;
    toneArm.rotation.y = armAngle;
    void arm;

    /* ---------- 唱片箱 ---------- */
    const crate = { x: 0.30, y: TOP, z: -0.02 };
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5638, roughness: 0.7 });
    box(0.22, 0.12, 0.30, crate.x, crate.y + 0.06, crate.z, crateMat, root);
    box(0.20, 0.10, 0.28, crate.x, crate.y + 0.10, crate.z, new THREE.MeshStandardMaterial({ color: 0x5d4028, roughness: 0.9 }), root);
    // 里面竖着几张唱片套（露出一截彩色边）
    [[-0.055, '#7b5ea7'], [0.0, '#3f6f7a'], [0.055, '#a2583f']].forEach(function (s, i) {
      const sleeve = box(0.006, 0.20, 0.20, crate.x + s[0], crate.y + 0.19, crate.z + 0.01,
        new THREE.MeshStandardMaterial({ color: new THREE.Color(s[1]), roughness: 0.8 }), root);
      sleeve.rotation.z = (i - 1) * 0.06;
    });

    /* ---------- 一点点暖光（晚上唱机像个光源） ---------- */
    const glowLight = new THREE.PointLight(0xffc98a, 0, 2.2, 2);
    glowLight.position.set(ORIGIN.x, TOP + 0.30, ORIGIN.z + 0.18);
    root.add(glowLight);

    /* ---------- 音乐文件（异步，解码完就能放） ---------- */
    if (sfx && sfx.loadMusic) {
      TRACKS.forEach(function (t) { sfx.loadMusic(t.key, t.url); });
      if (sfx.onMusicReady) {
        // 点了播放但还没解码完：等它好了自动接着放
        sfx.onMusicReady(function (key) {
          if (pending && key === TRACKS[index].key) {
            pending = false;
            toggle();
          }
        });
      }
      if (sfx.setMusicEnded) {
        sfx.setMusicEnded(function () {
          // 一首放完自动换下一张，接着播
          if (!playing) return;
          index = (index + 1) % TRACKS.length;
          applyRecordTex();
          if (sfx.playMusic && sfx.playMusic(TRACKS[index].key)) {
            say('换下一张：《' + TRACKS[index].name + '》', 3200);
          } else {
            playing = false;
          }
        });
      }
    }

    return {
      root: root,
      update: update,
      toggle: toggle,
      next: nextTrack,
      isPlaying: function () { return playing; },
      track: function () { return TRACKS[index]; },
      // 只做"动作"不放声（截图用：唱臂落下去、小灯亮）
      preview: function (on) {
        playing = !!on;
        armTarget = on ? 0.06 : 0.62;
        return playing;
      },
      debug: function () {
        return {
          playing: playing, track: TRACKS[index].key, arm: Math.round(armAngle * 100) / 100,
          loaded: (sfx && sfx.musicLoaded) ? TRACKS.filter(function (t) { return sfx.musicLoaded(t.key); }).length : 0
        };
      }
    };
  }

  function applyRecordTex() {
    if (!recordMesh) return;
    const t = TRACKS[index];
    recordMesh.material.map = recordTex(t.label);
    recordMesh.material.needsUpdate = true;
  }

  function toggle() {
    if (!sfx) return false;
    if (playing) {
      playing = false;
      armTarget = 0.62;
      if (sfx.stopMusic) sfx.stopMusic(1.0);
      say('先停一下。想听再点我', 3000);
      return false;
    }
    index = index % TRACKS.length;
    if (sfx.playMusic && sfx.playMusic(TRACKS[index].key)) {
      playing = true;
      armTarget = 0.06;
      if (sfx.clink) {
        try { sfx.clink({ x: ORIGIN.x, y: TOP + 0.1, z: ORIGIN.z }); } catch (e) {}   // 唱针落下去
      }
      say('《' + TRACKS[index].name + '》—— 坐下听会儿', 3400);
      return true;
    }
    say('唱片机还没准备好，等我下载完…', 3000);
    pending = true;
    return false;
  }

  function nextTrack() {
    index = (index + 1) % TRACKS.length;
    applyRecordTex();
    if (playing && sfx && sfx.playMusic) {
      sfx.playMusic(TRACKS[index].key);
      say('换一张：《' + TRACKS[index].name + '》', 3200);
    } else {
      say('换好了：《' + TRACKS[index].name + '》。点唱机放？', 3400);
    }
    return TRACKS[index];
  }

  function update(dt) {
    // 唱片一直在慢慢转（放歌时快一点，停着也转一点点，像没关电源）
    const speed = playing ? SPIN : (armTarget > 0.5 ? 0.0 : 0.0);
    spinT += dt * speed;
    if (platter) platter.rotation.y = spinT;
    // 唱臂：慢慢落下去 / 抬起来
    armAngle += (armTarget - armAngle) * Math.min(1, dt * 3.2);
    if (toneArm) toneArm.rotation.y = armAngle;
    // 小灯 + 一束暖光
    glow += ((playing ? 1 : 0) - glow) * Math.min(1, dt * 4);
    if (ledMat) {
      ledMat.color.setRGB(0.10 + 0.85 * glow, 0.15 + 0.55 * glow, 0.12 + 0.30 * glow);
    }
    if (root) {
      // 找到那盏暖光（build 里加的第一盏 PointLight）
      for (let i = 0; i < root.children.length; i++) {
        const c = root.children[i];
        if (c.isPointLight) c.intensity = glow * 0.55;
      }
    }
  }

  return { build: build };
})();
