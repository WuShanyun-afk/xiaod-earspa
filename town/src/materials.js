/* 小D的赛博小家 · 材质与贴图生成
 * 全部用 canvas 现画，不依赖外部图片 —— 不丑、不卡、无版权问题
 */
window.XD = window.XD || {};

XD.Mat = (function () {
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function tex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    return t;
  }

  /* ---------- 木地板 ---------- */
  function woodFloor(repeat) {
    return tex(1024, 1024, function (g, W, H) {
      const r = rng(20261112);
      g.fillStyle = '#8a6242';
      g.fillRect(0, 0, W, H);

      const rows = 8;
      const rh = H / rows;
      for (let i = 0; i < rows; i++) {
        const y = i * rh;
        // 板条底色
        const l = 30 + r() * 12;
        g.fillStyle = 'hsl(28, 34%, ' + l + '%)';
        g.fillRect(0, y, W, rh - 2);

        // 木纹丝
        for (let k = 0; k < 60; k++) {
          g.strokeStyle = 'rgba(60,36,18,' + (0.03 + r() * 0.07) + ')';
          g.lineWidth = 0.8 + r() * 1.6;
          g.beginPath();
          const yy = y + r() * rh;
          g.moveTo(0, yy);
          g.bezierCurveTo(W * 0.3, yy + (r() - 0.5) * 8, W * 0.7, yy + (r() - 0.5) * 8, W, yy + (r() - 0.5) * 5);
          g.stroke();
        }
        // 结疤
        if (r() > 0.6) {
          const bx = r() * W, by = y + rh * (0.3 + r() * 0.4);
          for (let k = 6; k > 0; k--) {
            g.strokeStyle = 'rgba(52,30,14,' + (0.05 + k * 0.02) + ')';
            g.lineWidth = 1.2;
            g.beginPath();
            g.ellipse(bx, by, k * 4, k * 2.2, 0, 0, Math.PI * 2);
            g.stroke();
          }
        }
        // 板缝
        g.fillStyle = 'rgba(28,16,8,0.55)';
        g.fillRect(0, y + rh - 2, W, 2);
        // 竖缝错位
        const sx = (i % 2 ? W * 0.5 : W * 0.15) + (r() - 0.5) * 40;
        g.fillStyle = 'rgba(28,16,8,0.4)';
        g.fillRect(sx, y, 2, rh);
      }

      // 整体明暗起伏
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, 'rgba(255,224,180,0.10)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.05)');
      grad.addColorStop(1, 'rgba(255,224,180,0.06)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }, repeat);
  }

  /* ---------- 墙纸：奶油色 + 极细颗粒 ---------- */
  function wall(repeat) {
    return tex(512, 512, function (g, W, H) {
      const r = rng(77);
      g.fillStyle = '#efe4d4';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '150,132,110') + ',' + (0.02 + r() * 0.03) + ')';
        g.fillRect(r() * W, r() * H, 2, 2);
      }
      // 很淡的竖向布纹
      for (let x = 0; x < W; x += 4) {
        g.fillStyle = 'rgba(255,250,240,' + (r() * 0.03) + ')';
        g.fillRect(x, 0, 1, H);
      }
    }, repeat);
  }

  /* ---------- 天花板 ---------- */
  function ceiling(repeat) {
    return tex(512, 512, function (g, W, H) {
      const r = rng(9);
      g.fillStyle = '#f6f0e6';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = 'rgba(210,200,185,' + r() * 0.05 + ')';
        g.fillRect(r() * W, r() * H, 2, 2);
      }
    }, repeat);
  }

  /* ---------- 护墙板（奶白竖格板，奶油风标配） ---------- */
  function wainscot() {
    return tex(512, 256, function (g, W, H) {
      g.fillStyle = '#efe5d3';
      g.fillRect(0, 0, W, H);

      // 竖格凹槽
      const step = 128;
      for (let x = 0; x < W; x += step) {
        // 凹槽暗边
        g.fillStyle = 'rgba(150,132,108,0.75)';
        g.fillRect(x, 0, 3, H);
        g.fillStyle = 'rgba(255,252,244,0.85)';
        g.fillRect(x + 3, 0, 3, H);
        // 格内柔光
        const grd = g.createLinearGradient(x, 0, x + step, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0.00)');
        grd.addColorStop(0.45, 'rgba(255,251,241,0.55)');
        grd.addColorStop(1, 'rgba(178,160,136,0.34)');
        g.fillStyle = grd;
        g.fillRect(x + 6, 0, step - 6, H);
        // 格内上下的阴影收边
        g.fillStyle = 'rgba(200,186,163,0.20)';
        g.fillRect(x + 6, 0, step - 6, 6);
        g.fillStyle = 'rgba(150,134,110,0.10)';
        g.fillRect(x + 6, H - 5, step - 6, 5);
      }

      // 顶边线（腰线打光感）
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(0, 0, W, 4);

      // 底部积灰阴影
      const bt = g.createLinearGradient(0, H * 0.78, 0, H);
      bt.addColorStop(0, 'rgba(150,134,110,0)');
      bt.addColorStop(1, 'rgba(120,105,84,0.22)');
      g.fillStyle = bt;
      g.fillRect(0, H * 0.76, W, H * 0.24);

      // 细颗粒
      const r = rng(88);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = 'rgba(150,135,115,' + (r() * 0.04) + ')';
        g.fillRect(r() * W, r() * H, 2, 2);
      }
    });
  }

  /* ---------- 布艺（床/沙发/地毯） ---------- */
  function fabric(base, repeat) {
    return tex(256, 256, function (g, W, H) {
      const r = rng(31);
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 3) {
        g.fillStyle = 'rgba(0,0,0,' + (0.02 + r() * 0.05) + ')';
        g.fillRect(0, y, W, 1);
      }
      for (let x = 0; x < W; x += 3) {
        g.fillStyle = 'rgba(255,255,255,' + (0.02 + r() * 0.04) + ')';
        g.fillRect(x, 0, 1, H);
      }
    }, repeat);
  }

  /* ---------- 窗外：白天的城市 ---------- */
  function cityDay() {
    return tex(2048, 1024, function (g, W, H) {
      const r = rng(424243);
      // 天空
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#6ea6d8');
      sky.addColorStop(0.42, '#a9cbe8');
      sky.addColorStop(0.72, '#d9e8f3');
      sky.addColorStop(1, '#eef3f6');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      // 太阳光晕（右上）
      const sun = g.createRadialGradient(W * 0.78, H * 0.16, 10, W * 0.78, H * 0.16, W * 0.42);
      sun.addColorStop(0, 'rgba(255,250,225,0.85)');
      sun.addColorStop(0.25, 'rgba(255,244,205,0.35)');
      sun.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = sun;
      g.fillRect(0, 0, W, H);

      // 云
      for (let i = 0; i < 26; i++) {
        const cx = r() * W, cy = H * (0.05 + r() * 0.34), cw = 60 + r() * 190, ch = 14 + r() * 26;
        const cg = g.createRadialGradient(cx, cy, 2, cx, cy, cw);
        cg.addColorStop(0, 'rgba(255,255,255,' + (0.30 + r() * 0.35) + ')');
        cg.addColorStop(0.6, 'rgba(255,255,255,' + (0.10 + r() * 0.15) + ')');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cg;
        g.beginPath();
        g.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        g.fill();
      }

      // 楼群：越远越浅（空气透视）
      const layers = [
        { y: H * 0.52, col: '#9db4c8', hMax: H * 0.26, wMin: 40, wMax: 110, win: 0.10, wc: 'rgba(222,235,246,0.55)' },
        { y: H * 0.64, col: '#8299af', hMax: H * 0.34, wMin: 55, wMax: 140, win: 0.16, wc: 'rgba(214,230,244,0.6)' },
        { y: H * 0.79, col: '#6a8399', hMax: H * 0.30, wMin: 70, wMax: 170, win: 0.22, wc: 'rgba(205,224,240,0.65)' },
        { y: H * 0.96, col: '#54697d', hMax: H * 0.20, wMin: 90, wMax: 200, win: 0.28, wc: 'rgba(198,218,236,0.7)' }
      ];
      layers.forEach(function (L, li) {
        let x = -60;
        while (x < W + 60) {
          const bw = L.wMin + r() * (L.wMax - L.wMin);
          const bh = 30 + r() * L.hMax;
          const top = L.y - bh;
          g.fillStyle = L.col;
          g.fillRect(x, top, bw, bh + 40);
          // 受光面（左侧亮一点）
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.fillRect(x, top, Math.max(4, bw * 0.18), bh + 40);
          // 窗户
          const cols = Math.max(1, Math.floor(bw / 16));
          const rows = Math.max(1, Math.floor(bh / 18));
          for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
              if (r() > L.win) continue;
              g.fillStyle = L.wc;
              g.fillRect(x + 5 + cx * 16, top + 8 + cy * 18, 6, 8);
            }
          }
          x += bw + 6 + r() * 18;
        }
        // 层间雾
        const haze = g.createLinearGradient(0, L.y - 10, 0, L.y + 40);
        haze.addColorStop(0, 'rgba(226,238,246,0)');
        haze.addColorStop(1, 'rgba(226,238,246,0.45)');
        g.fillStyle = haze;
        g.fillRect(0, L.y - 10, W, 50);
      });

      // 底部轻雾
      const fog = g.createLinearGradient(0, H * 0.88, 0, H);
      fog.addColorStop(0, 'rgba(230,240,248,0)');
      fog.addColorStop(1, 'rgba(232,241,248,0.75)');
      g.fillStyle = fog;
      g.fillRect(0, H * 0.86, W, H * 0.14);
    });
  }

  /* ---------- 窗外近景：白天的对街楼 ---------- */
  function nearBuildingDay() {
    return tex(768, 768, function (g, W, H) {
      const r = rng(5151);

      // 天空
      const sky = g.createLinearGradient(0, 0, 0, H * 0.34);
      sky.addColorStop(0, '#8fbde2');
      sky.addColorStop(1, '#cfe3f0');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H * 0.34);

      // 楼体
      const bx0 = W * 0.04, bx1 = W * 0.96, by0 = H * 0.16;
      const bg = g.createLinearGradient(bx0, 0, bx1, 0);
      bg.addColorStop(0, '#a9b6c0');
      bg.addColorStop(0.42, '#c6d0d8');
      bg.addColorStop(1, '#8e9ca8');
      g.fillStyle = bg;
      g.fillRect(bx0, by0, bx1 - bx0, H - by0);

      // 楼顶边缘 + 受光
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(bx0, by0, bx1 - bx0, 4);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(bx0, by0, (bx1 - bx0) * 0.16, H - by0);

      // 窗户阵列（白天是反光的深蓝玻璃）
      const cols = 9, rows = 15;
      const cw = (bx1 - bx0 - 40) / cols;
      const ch = (H - by0 - 40) / rows;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const x = bx0 + 20 + cx * cw + cw * 0.16;
          const y = by0 + 22 + cy * ch + ch * 0.18;
          const ww = cw * 0.66, wh = ch * 0.6;
          const kind = r();
          if (kind > 0.86) {
            // 少数亮着灯的窗
            g.fillStyle = 'rgba(255,236,196,0.55)';
          } else if (kind > 0.72) {
            g.fillStyle = 'rgba(120,158,192,0.75)';
          } else {
            g.fillStyle = 'rgba(74,104,136,0.85)';
          }
          g.fillRect(x, y, ww, wh);
          // 玻璃反光
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.beginPath();
          g.moveTo(x, y + wh);
          g.lineTo(x + ww * 0.55, y);
          g.lineTo(x + ww * 0.8, y);
          g.lineTo(x + ww * 0.22, y + wh);
          g.closePath();
          g.fill();
        }
      }

      // 阳台横线
      g.strokeStyle = 'rgba(120,134,148,0.5)';
      g.lineWidth = 3;
      for (let cy = 0; cy < rows; cy++) {
        const y = by0 + 22 + cy * ch + ch * 0.86;
        g.beginPath(); g.moveTo(bx0 + 10, y); g.lineTo(bx1 - 10, y); g.stroke();
      }

      // 底部阴影
      const st = g.createLinearGradient(0, H * 0.9, 0, H);
      st.addColorStop(0, 'rgba(70,84,96,0)');
      st.addColorStop(1, 'rgba(60,72,84,0.85)');
      g.fillStyle = st;
      g.fillRect(0, H * 0.88, W, H * 0.12);
    });
  }

  /* ---------- 窗外：城市夜景 ---------- */
  function cityNight() {
    return tex(2048, 1024, function (g, W, H) {
      const r = rng(424242);
      // 夜空
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#05070f');
      sky.addColorStop(0.45, '#0c1428');
      sky.addColorStop(0.72, '#1a2340');
      sky.addColorStop(1, '#2a2240');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      // 星星
      for (let i = 0; i < 420; i++) {
        const a = 0.15 + r() * 0.7;
        g.fillStyle = 'rgba(220,235,255,' + a + ')';
        const s = r() > 0.9 ? 2 : 1;
        g.fillRect(r() * W, r() * H * 0.55, s, s);
      }

      // 远处雾光（城市光污染）
      const glow = g.createRadialGradient(W * 0.5, H * 0.72, 20, W * 0.5, H * 0.72, W * 0.55);
      glow.addColorStop(0, 'rgba(255,170,120,0.20)');
      glow.addColorStop(0.5, 'rgba(120,140,255,0.10)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);

      // 多层楼群（越靠下越近越暗）
      const layers = [
        { y: H * 0.50, col: '#0b1224', hMax: H * 0.26, wMin: 40, wMax: 110, win: 0.16 },
        { y: H * 0.62, col: '#080f1c', hMax: H * 0.34, wMin: 55, wMax: 140, win: 0.34 },
        { y: H * 0.78, col: '#060a14', hMax: H * 0.30, wMin: 70, wMax: 170, win: 0.5 },
        { y: H * 0.96, col: '#04060d', hMax: H * 0.20, wMin: 90, wMax: 200, win: 0.62 }
      ];
      layers.forEach(function (L) {
        let x = -60;
        while (x < W + 60) {
          const bw = L.wMin + r() * (L.wMax - L.wMin);
          const bh = 30 + r() * L.hMax;
          const top = L.y - bh;
          g.fillStyle = L.col;
          g.fillRect(x, top, bw, bh + 40);

          // 窗户
          const cols = Math.max(1, Math.floor(bw / 16));
          const rows = Math.max(1, Math.floor(bh / 18));
          for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
              if (r() > L.win) continue;
              const warm = r() > 0.35;
              g.fillStyle = warm
                ? 'rgba(255,' + (190 + Math.floor(r() * 40)) + ',' + (110 + Math.floor(r() * 60)) + ',' + (0.55 + r() * 0.45) + ')'
                : 'rgba(' + (110 + Math.floor(r() * 60)) + ',200,255,' + (0.4 + r() * 0.5) + ')';
              g.fillRect(x + 5 + cx * 16, top + 8 + cy * 18, 6, 8);
            }
          }
          x += bw + 6 + r() * 18;
        }
      });

      // 一两栋赛博霓虹
      for (let i = 0; i < 3; i++) {
        const nx = r() * W;
        const nh = H * (0.18 + r() * 0.16);
        g.fillStyle = '#050810';
        g.fillRect(nx, H * 0.8 - nh, 26 + r() * 40, nh);
        g.strokeStyle = r() > 0.5 ? 'rgba(255,90,170,0.85)' : 'rgba(80,230,255,0.85)';
        g.lineWidth = 2;
        g.shadowBlur = 14;
        g.shadowColor = g.strokeStyle;
        g.strokeRect(nx + 2, H * 0.8 - nh + 8, 22 + r() * 36, nh * 0.5);
        g.shadowBlur = 0;
      }

      // 底部雾（只留很薄一层，别把街景糊掉）
      const fog = g.createLinearGradient(0, H * 0.93, 0, H);
      fog.addColorStop(0, 'rgba(18,24,44,0)');
      fog.addColorStop(1, 'rgba(26,22,42,0.55)');
      g.fillStyle = fog;
      g.fillRect(0, H * 0.92, W, H * 0.08);
    });
  }

  /* ---------- 窗外近景：对街的一栋楼 ---------- */
  function nearBuilding() {
    return tex(768, 768, function (g, W, H) {
      const r = rng(5150);

      // 夜空底
      const sky = g.createLinearGradient(0, 0, 0, H * 0.3);
      sky.addColorStop(0, '#05070f');
      sky.addColorStop(1, '#101a30');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H * 0.3);

      // 楼体
      const bx0 = W * 0.06, bx1 = W * 0.94;
      const by0 = H * 0.12;
      const bg = g.createLinearGradient(bx0, 0, bx1, 0);
      bg.addColorStop(0, '#0a0f1c');
      bg.addColorStop(0.45, '#0d1526');
      bg.addColorStop(1, '#080c16');
      g.fillStyle = bg;
      g.fillRect(bx0, by0, bx1 - bx0, H - by0);

      // 楼顶边缘高光
      g.fillStyle = 'rgba(140,170,230,0.16)';
      g.fillRect(bx0, by0, bx1 - bx0, 3);

      // 窗户阵列
      const cols = 9, rows = 15;
      const cw = (bx1 - bx0 - 40) / cols;
      const ch = (H - by0 - 40) / rows;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const x = bx0 + 20 + cx * cw + cw * 0.16;
          const y = by0 + 22 + cy * ch + ch * 0.18;
          const ww = cw * 0.66, wh = ch * 0.6;
          const on = r() > 0.62;
          if (!on) {
            g.fillStyle = 'rgba(16,26,44,0.9)';
            g.fillRect(x, y, ww, wh);
            continue;
          }
          const warm = r() > 0.3;
          const a = 0.55 + r() * 0.45;
          g.fillStyle = warm
            ? 'rgba(255,' + (185 + Math.floor(r() * 45)) + ',' + (115 + Math.floor(r() * 55)) + ',' + a + ')'
            : 'rgba(' + (120 + Math.floor(r() * 50)) + ',205,255,' + (a * 0.85) + ')';
          g.fillRect(x, y, ww, wh);
          // 窗内一点点明暗
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(x, y + wh * 0.62, ww, wh * 0.38);
        }
      }

      // 侧面霓虹竖条
      const neon = r() > 0.5 ? 'rgba(255,90,175,0.9)' : 'rgba(80,235,255,0.9)';
      g.shadowBlur = 18;
      g.shadowColor = neon;
      g.strokeStyle = neon;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(bx0 + 14, by0 + 40);
      g.lineTo(bx0 + 14, H - 30);
      g.stroke();
      g.shadowBlur = 0;

      // 底部街道暗影
      const st = g.createLinearGradient(0, H * 0.86, 0, H);
      st.addColorStop(0, 'rgba(4,6,12,0)');
      st.addColorStop(1, 'rgba(2,3,7,1)');
      g.fillStyle = st;
      g.fillRect(0, H * 0.84, W, H * 0.16);
    });
  }

  /* ---------- 窗外的鲸鱼剪影（夜空里慢慢游过去的那只） ---------- */
  function whaleSilhouette() {
    return tex(1024, 512, function (g, W, H) {
      g.clearRect(0, 0, W, H);

      const body = new Path2D();
      // 吻部 → 上背 → 尾柄 → 尾鳍 → 腹线回吻部
      body.moveTo(64, 270);
      body.bezierCurveTo(118, 200, 262, 164, 420, 166);
      body.bezierCurveTo(566, 168, 686, 188, 800, 216);
      body.lineTo(872, 166);
      body.quadraticCurveTo(946, 242, 872, 316);
      body.lineTo(804, 288);
      body.bezierCurveTo(700, 332, 560, 354, 420, 352);
      body.bezierCurveTo(276, 350, 136, 322, 64, 270);
      body.closePath();

      const grad = g.createLinearGradient(0, 150, 0, 380);
      grad.addColorStop(0, '#22406e');
      grad.addColorStop(0.5, '#152743');
      grad.addColorStop(1, '#0b1526');

      // 月光描边
      g.shadowColor = 'rgba(160,205,255,0.95)';
      g.shadowBlur = 38;
      g.fillStyle = grad;
      g.fill(body);

      // 背鳍
      g.beginPath();
      g.moveTo(386, 172);
      g.quadraticCurveTo(432, 88, 506, 168);
      g.closePath();
      g.fill();

      // 胸鳍
      g.beginPath();
      g.moveTo(316, 328);
      g.quadraticCurveTo(356, 398, 432, 346);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;

      // 白色眼斑（夜里淡淡的，不是纯白）
      g.globalAlpha = 0.5;
      g.fillStyle = '#cfe0f8';
      g.beginPath();
      g.ellipse(252, 248, 62, 26, -0.2, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;

      // 腹部一点点反光
      g.globalAlpha = 0.10;
      g.fillStyle = '#9fc2ee';
      g.beginPath();
      g.ellipse(430, 332, 210, 20, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;

      // 眼睛
      g.fillStyle = 'rgba(190,225,255,0.8)';
      g.beginPath();
      g.arc(186, 262, 5.5, 0, Math.PI * 2);
      g.fill();
    });
  }

  /* ---------- 小白砖（厨房挡水板 / 浴室墙） ---------- */
  // 奶油色手工感 subway tile，砖缝略深，砖面有一点点不均匀
  function tile(opts) {
    opts = opts || {};
    const base = opts.base || '#f2ece0';
    const grout = opts.grout || '#cfc4b2';
    const cols = opts.cols || 4;
    const rows = opts.rows || 8;
    return tex(512, 512, function (g, W, H) {
      g.fillStyle = grout;
      g.fillRect(0, 0, W, H);
      const bw = W / cols;
      const bh = H / rows;
      const gap = Math.max(1.5, bw * 0.035);
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * bw * 0.5;
        for (let c = -1; c <= cols; c++) {
          const x = c * bw + off + gap / 2;
          const y = r * bh + gap / 2;
          const w = bw - gap;
          const h = bh - gap;
          const v = 0.94 + Math.random() * 0.12;
          g.fillStyle = 'rgba(' +
            Math.round(242 * v) + ',' + Math.round(236 * v) + ',' + Math.round(224 * v) + ',1)';
          g.fillRect(x, y, w, h);
          // 砖面高光（左上）
          g.fillStyle = 'rgba(255,255,255,0.42)';
          g.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.10));
          g.fillStyle = 'rgba(255,255,255,0.20)';
          g.fillRect(x + 1, y + 1, Math.max(1, w * 0.12), h - 2);
          // 砖面阴影（右下）
          g.fillStyle = 'rgba(150,136,116,0.16)';
          g.fillRect(x + 1, y + h - Math.max(1, h * 0.12), w - 2, Math.max(1, h * 0.12));
        }
      }
      void base;
    });
  }

  /* ---------- 灯光光晕（精灵用） ---------- */
  function glowSprite(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, color);
    rg.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  return {
    rng: rng,
    tex: tex,
    woodFloor: woodFloor,
    wall: wall,
    ceiling: ceiling,
    fabric: fabric,
    wainscot: wainscot,
    cityNight: cityNight,
    cityDay: cityDay,
    nearBuilding: nearBuilding,
    nearBuildingDay: nearBuildingDay,
    whaleSilhouette: whaleSilhouette,
    tile: tile,
    glowSprite: glowSprite
  };
})();
