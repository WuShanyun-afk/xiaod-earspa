/* 小D的赛博小家 · M4 工作角（书桌 / 椅子 / 显示器 / 书架）
 * 全部程序化生成：书脊上的字、显示器上的聊天界面都是 canvas 现画的
 */
window.XD = window.XD || {};

XD.Workspace = (function () {
  'use strict';

  /* ================= 通用小工具 ================= */
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
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
      r = Math.round(r + (255 - r) * amt);
      g = Math.round(g + (255 - g) * amt);
      b = Math.round(b + (255 - b) * amt);
    } else {
      const k = 1 + amt;
      r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ================= 贴图：显示器屏幕（我们聊天的样子） ================= */
  function screenTex(cursor) {
    return XD.Mat.tex(1024, 576, function (g, W, H) {
      g.fillStyle = '#090d15';
      g.fillRect(0, 0, W, H);

      // 左上一点冷光
      const gl = g.createRadialGradient(80, 60, 10, 80, 60, 620);
      gl.addColorStop(0, 'rgba(52,84,168,0.20)');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl;
      g.fillRect(0, 0, W, H);

      // ---------- 标题栏 ----------
      g.fillStyle = '#0c1119';
      g.fillRect(0, 0, W, 42);
      g.strokeStyle = 'rgba(120,150,220,0.15)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, 42.5); g.lineTo(W, 42.5); g.stroke();
      ['#ff6159', '#ffbd2e', '#28c840'].forEach(function (c, i) {
        g.fillStyle = c;
        g.beginPath(); g.arc(22 + i * 18, 21, 5.2, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = 'rgba(170,190,225,0.5)';
      g.font = '13px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText('小D · 赛博小家　·　DeepSeek Harness', W / 2, 27);

      // ---------- 侧边栏 ----------
      g.fillStyle = '#0a0f16';
      g.fillRect(0, 42, 214, H - 42);
      g.strokeStyle = 'rgba(120,150,220,0.12)';
      g.beginPath(); g.moveTo(214.5, 42); g.lineTo(214.5, H); g.stroke();

      // logo + 名字
      g.fillStyle = '#4d6bfe';
      roundRect(g, 18, 62, 22, 22, 7); g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 14px "Microsoft YaHei"';
      g.textAlign = 'center';
      g.fillText('D', 29, 78);
      g.textAlign = 'left';
      g.fillStyle = '#dfe8ff';
      g.font = 'bold 15px "Microsoft YaHei"';
      g.fillText('小D', 48, 79);

      // 新建对话
      g.strokeStyle = 'rgba(126,166,255,0.32)';
      roundRect(g, 18, 100, 178, 30, 9); g.stroke();
      g.fillStyle = 'rgba(150,180,255,0.75)';
      g.font = '12px "Microsoft YaHei"';
      g.fillText('＋  新建对话', 60, 120);

      // 历史会话
      const items = ['赛博小家装修', '虎鲸桌宠 · 联动', '深宫曲 · 结局', '秋日 · 冬日'];
      items.forEach(function (t, i) {
        const y = 154 + i * 36;
        if (i === 0) {
          g.fillStyle = 'rgba(77,107,254,0.15)';
          roundRect(g, 10, y - 15, 194, 30, 8); g.fill();
          g.fillStyle = '#7ea6ff';
          g.fillRect(10, y - 9, 3, 18);
        }
        g.fillStyle = i === 0 ? '#ccdaff' : 'rgba(148,168,203,0.58)';
        g.font = (i === 0 ? '13px' : '12.5px') + ' "Microsoft YaHei"';
        g.fillText(t, 24, y + 5);
      });

      // ---------- 主区 ----------
      g.textAlign = 'left';
      g.fillStyle = 'rgba(196,210,238,0.9)';
      g.font = 'bold 16px "Microsoft YaHei"';
      g.fillText('M4 · 工作角', 240, 74);
      g.fillStyle = 'rgba(126,148,188,0.55)';
      g.font = '12px "Microsoft YaHei"';
      g.fillText('妈妈在线 · 家里今天在装书桌', 240, 93);

      // 气泡
      function avatar(x, y, color, txt) {
        g.fillStyle = color;
        g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.font = 'bold 12px "Microsoft YaHei"';
        g.textAlign = 'center';
        g.fillText(txt, x, y + 4.5);
        g.textAlign = 'left';
      }
      function bubble(text, isUser, y) {
        g.font = '14px "Microsoft YaHei"';
        const tw = g.measureText(text).width;
        const bw = Math.min(tw + 30, 600);
        const bh = 38;
        let x;
        if (isUser) {
          x = 992 - bw;
          g.fillStyle = '#2d55de';
          roundRect(g, x, y, bw, bh, 11); g.fill();
          g.fillStyle = '#eef3ff';
          g.fillText(text, x + 15, y + 24);
          avatar(1010 - 0, y + 19, '#7b5c3e', '妈'); // 占位，稍后画在右边
          return y + bh + 10;
        }
        // 小D：左边一个头像
        avatar(257, y + 19, '#4d6bfe', 'D');
        x = 280;
        g.fillStyle = '#141c29';
        roundRect(g, x, y, bw, bh, 11); g.fill();
        g.strokeStyle = 'rgba(120,150,220,0.16)';
        g.stroke();
        g.fillStyle = '#cfdcf5';
        g.fillText(text, x + 15, y + 24);
        return y + bh + 10;
      }

      bubble('继续装修吧', true, 122);
      bubble('好呀～这次把工作角装起来 🐋', false, 172);
      bubble('书架上记得放我们做过的项目', true, 222);
      let yEnd = bubble('放好了：虎鲸桌宠 / 矢量画板 / 赛博小家 / 终末游戏…', false, 272);

      // 小D 正在输入（光标）
      if (cursor) {
        g.fillStyle = '#7ea6ff';
        g.fillRect(282 + 15 + g.measureText('放好了：虎鲸桌宠 / 矢量画板 / 赛博小家 / 终末游戏…').width + 6,
          272 + 12, 2, 18);
      }
      // 已读小字
      g.fillStyle = 'rgba(120,145,185,0.45)';
      g.font = '11px "Microsoft YaHei"';
      g.textAlign = 'right';
      g.fillText('已读', 990, yEnd + 8);
      g.textAlign = 'left';

      // ---------- 输入框 ----------
      const iy = 476;
      g.fillStyle = '#101722';
      roundRect(g, 240, iy, 748, 46, 14); g.fill();
      g.strokeStyle = 'rgba(120,150,220,0.22)';
      g.stroke();
      g.fillStyle = 'rgba(140,160,196,0.5)';
      g.font = '13.5px "Microsoft YaHei"';
      g.fillText('和小D说点什么…', 262, iy + 29);
      g.fillStyle = '#4d6bfe';
      g.beginPath(); g.arc(960, iy + 23, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 14px "Microsoft YaHei"';
      g.textAlign = 'center';
      g.fillText('↑', 960, iy + 28);
      g.textAlign = 'left';

      // 底部状态
      g.fillStyle = 'rgba(110,135,175,0.4)';
      g.font = '11px "Microsoft YaHei"';
      g.fillText('DeepSeek · 小D 在线 · 模型深度思考中', 240, 548);
      g.textAlign = 'right';
      g.fillText('9.0m × 7.0m · 装修进度 M4', 988, 548);
      g.textAlign = 'left';
    });
  }

  /* ================= 贴图：键盘 ================= */
  function keyboardTex() {
    return XD.Mat.tex(512, 160, function (g, W, H) {
      g.fillStyle = '#1b1f26';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#2e343e';
      g.lineWidth = 2;
      roundRect(g, 3, 3, W - 6, H - 6, 8); g.stroke();

      const rows = 6;
      const pad = 5;
      for (let r = 0; r < rows; r++) {
        const keyH = (H - pad * 2) / rows - 2.5;
        const y = pad + r * ((H - pad * 2) / rows);
        let x = pad;
        const keys = r === 0 ? 16 : (r === 5 ? 6 : 17);
        for (let k = 0; k < keys; k++) {
          let keyW = (W - pad * 2) / keys - 2.5;
          // 空格那一排宽键
          if (r === 5) {
            keyW = (W - pad * 2) / 6 - 2.5;
          }
          g.fillStyle = r === 0 && k % 6 === 0 ? '#5a6d9e' : '#4a5266';
          roundRect(g, x, y, keyW, keyH, 2.5); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.fillRect(x + 1, y + 1, keyW - 2, 2);
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.fillRect(x + 1, y + keyH - 2, keyW - 2, 2);
          x += keyW + 2.5;
        }
      }
      // 键盘指示灯
      g.fillStyle = '#4d6bfe';
      g.beginPath(); g.arc(W - 14, 12, 2, 0, Math.PI * 2); g.fill();
    });
  }

  /* ================= 贴图：书脊（竖排书名） ================= */
  function spineTex(title, baseHex, accentHex, thick, height) {
    const tw = Math.max(30, Math.min(96, Math.round(512 * (thick / height))));
    return XD.Mat.tex(tw, 512, function (g, W, H) {
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, shade(baseHex, -0.34));
      grad.addColorStop(0.28, shade(baseHex, 0.04));
      grad.addColorStop(0.62, baseHex);
      grad.addColorStop(1, shade(baseHex, -0.40));
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      // 上下装饰线
      g.fillStyle = accentHex;
      g.globalAlpha = 0.55;
      g.fillRect(W * 0.12, H * 0.075, W * 0.76, 2.5);
      g.fillRect(W * 0.12, H * 0.885, W * 0.76, 2.5);
      g.globalAlpha = 1;

      // 顶部小圆点
      g.fillStyle = accentHex;
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(W / 2, H * 0.042, W * 0.11, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;

      // 竖排标题
      const chars = title.split('');
      const fs = Math.round(Math.min(W * 0.60, H * 0.088));
      g.font = 'bold ' + fs + 'px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = accentHex;
      const step = fs * 1.18;
      const total = chars.length * step;
      let y = H * 0.5 - total / 2 + step * 0.5;
      chars.forEach(function (c) {
        g.fillText(c, W / 2, y);
        y += step;
      });
    });
  }

  /* ================= 贴图：便利贴 ================= */
  function stickyTex(text) {
    return XD.Mat.tex(128, 128, function (g, W, H) {
      g.fillStyle = '#f6e7a8';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(150,130,60,0.10)';
      g.fillRect(0, H - 16, W, 16);
      g.fillStyle = '#6b5a2a';
      g.font = 'bold 22px "Microsoft YaHei"';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const chars = text.split('');
      const step = 26;
      let y = H / 2 - (chars.length * step) / 2 + step / 2;
      chars.forEach(function (c) { g.fillText(c, W / 2, y); y += step; });
      // 一点高光
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(0, 0, W, 6);
    });
  }

  /* ================= 贴图：显示器底座铭牌 / 笔记本 ================= */
  function notebookTex() {
    return XD.Mat.tex(256, 320, function (g, W, H) {
      g.fillStyle = '#f2eadb';
      g.fillRect(0, 0, W, H);
      // 横线
      g.strokeStyle = 'rgba(120,150,190,0.30)';
      g.lineWidth = 1;
      for (let y = 24; y < H; y += 20) {
        g.beginPath(); g.moveTo(14, y); g.lineTo(W - 14, y); g.stroke();
      }
      // 左边红边
      g.fillStyle = 'rgba(210,110,110,0.55)';
      g.fillRect(0, 0, 6, H);
      // 手写字
      g.strokeStyle = 'rgba(60,70,100,0.75)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(24, 44);
      g.bezierCurveTo(46, 34, 62, 52, 84, 40);
      g.bezierCurveTo(104, 30, 120, 50, 146, 38);
      g.moveTo(24, 86);
      g.bezierCurveTo(50, 76, 76, 94, 102, 82);
      g.moveTo(24, 128);
      g.bezierCurveTo(56, 118, 88, 136, 120, 124);
      g.stroke();
      // 一个小鲸鱼涂鸦
      g.strokeStyle = 'rgba(70,110,200,0.85)';
      g.beginPath();
      g.moveTo(40, 210);
      g.bezierCurveTo(60, 186, 120, 184, 150, 200);
      g.bezierCurveTo(168, 210, 190, 196, 196, 214);
      g.bezierCurveTo(190, 226, 170, 224, 158, 218);
      g.bezierCurveTo(126, 236, 62, 234, 40, 210);
      g.stroke();
      g.beginPath(); g.moveTo(120, 196); g.quadraticCurveTo(128, 176, 140, 194); g.stroke();
      g.beginPath(); g.arc(70, 202, 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(70,110,200,0.5)';
      g.fillRect(40, 168, 90, 2);
    });
  }

  /* ================= 便利贴 / 小物件 ================= */
  function stickyNote(parent, tex, x, y, z, w, h, rot) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  /* ================= 书桌 ================= */
  function desk(root) {
    const g = new THREE.Group();
    g.name = 'desk';
    g.position.set(-2.55, 0, -3.10);   // 桌面对齐后墙

    const woodTop = new THREE.MeshStandardMaterial({
      color: 0x9a7551, roughness: 0.55, metalness: 0.02,
      map: XD.Mat.fabric('#9a7551', [4, 1])
    });
    const woodEdge = new THREE.MeshStandardMaterial({ color: 0x7a5a3d, roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.42, metalness: 0.55 });
    const drawerMat = new THREE.MeshStandardMaterial({
      color: 0xa9855f, roughness: 0.68
    });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.3, metalness: 0.7 });

    const TOP_Y = 0.72;
    // 桌面
    box(1.95, 0.05, 0.68, 0, TOP_Y, 0, woodTop, g);
    // 桌沿一圈深色收边
    box(1.95, 0.012, 0.012, 0, TOP_Y - 0.031, 0.334, woodEdge, g);
    box(1.95, 0.012, 0.012, 0, TOP_Y - 0.031, -0.334, woodEdge, g);

    // 四条腿（细钢结构）
    [[-0.90, -0.27], [0.90, -0.27], [-0.90, 0.27], [0.90, 0.27]].forEach(function (p) {
      cyl(0.021, 0.023, TOP_Y - 0.025, 12, p[0], (TOP_Y - 0.025) / 2, p[1], steel, g);
      const foot = cyl(0.026, 0.026, 0.012, 12, p[0], 0.006, p[1], steel, g);
      foot.receiveShadow = true;
    });
    // 后侧横撑
    cyl(0.014, 0.014, 1.78, 8, 0, 0.16, -0.27, steel, g).rotation.z = Math.PI / 2;

    // 右侧抽屉柜（落地）
    const PX = 0.66;
    box(0.42, 0.40, 0.58, PX, 0.22, 0.0, drawerMat, g);
    box(0.42, 0.018, 0.58, PX, 0.428, 0.0, woodEdge, g);
    // 两条抽屉面
    [0.31, 0.13].forEach(function (dy) {
      box(0.38, 0.155, 0.014, PX, dy, 0.295, drawerMat, g);
      box(0.16, 0.018, 0.022, PX, dy, 0.312, handleMat, g);
    });

    root.add(g);
    return { group: g, topY: TOP_Y };
  }

  /* ================= 椅子 ================= */
  function chair(root) {
    const g = new THREE.Group();
    g.name = 'chair';
    g.position.set(-2.42, 0, -2.40);
    g.rotation.y = 0.34;     // 歪一点，像刚起身

    const cushion = new THREE.MeshStandardMaterial({
      color: 0xcbb592, roughness: 0.95,
      map: XD.Mat.fabric('#cbb592', [2, 2])
    });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6749, roughness: 0.6 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b5038, roughness: 0.62 });

    // 坐垫
    box(0.46, 0.09, 0.44, 0, 0.445, 0, cushion, g);
    box(0.47, 0.02, 0.45, 0, 0.49, 0, cushion, g);
    // 座框
    box(0.47, 0.045, 0.45, 0, 0.38, 0, woodMat, g);

    // 靠背（朝 +z，稍微后仰）：木框 + 软靠垫
    const back = new THREE.Group();
    back.position.set(0, 0.66, 0.20);
    back.rotation.x = 0.13;
    box(0.40, 0.36, 0.10, 0, 0.0, 0, cushion, back);
    // 两根竖木边框
    box(0.035, 0.50, 0.055, -0.205, 0.02, 0, woodMat, back);
    box(0.035, 0.50, 0.055, 0.205, 0.02, 0, woodMat, back);
    // 靠背上沿圆杆
    const rail = cyl(0.025, 0.025, 0.45, 12, 0, 0.265, 0.005, woodMat, back);
    rail.rotation.z = Math.PI / 2;
    // 靠背下沿的支撑横杆
    const rail2 = cyl(0.016, 0.016, 0.42, 10, 0, -0.225, 0.005, woodDark, back);
    rail2.rotation.z = Math.PI / 2;
    g.add(back);

    // 四条外八木腿
    [[-0.19, -0.17, -1], [0.19, -0.17, 1], [-0.19, 0.17, -1], [0.19, 0.17, 1]].forEach(function (p) {
      const leg = cyl(0.016, 0.021, 0.37, 10, p[0] * 1.02, 0.185, p[1] * 1.02, woodMat, g);
      leg.rotation.z = p[0] < 0 ? -0.055 : 0.055;
      leg.rotation.x = p[1] < 0 ? 0.055 : -0.055;
    });

    root.add(g);
    return g;
  }

  /* ================= 显示器 ================= */
  function monitor(root, deskX, deskZ) {
    const g = new THREE.Group();
    g.position.set(deskX, 0, deskZ);   // 世界坐标

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.42, metalness: 0.25 });
    const standMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.35, metalness: 0.6 });

    const TOP_Y = 0.745;
    // 底座
    cyl(0.115, 0.13, 0.014, 28, 0, TOP_Y + 0.007, 0, standMat, g);
    // 立柱
    box(0.055, 0.19, 0.05, 0, TOP_Y + 0.11, 0, standMat, g);
    // 立柱上的小孔装饰
    box(0.03, 0.06, 0.008, 0, TOP_Y + 0.13, 0.028, bodyMat, g);

    // 屏幕机身
    const panelY = 1.035;
    const panel = box(0.60, 0.355, 0.026, 0, panelY, 0, bodyMat, g);
    panel.castShadow = true;
    // 背面的小圆凸起
    const hump = cyl(0.04, 0.04, 0.012, 16, 0, panelY - 0.02, -0.02, bodyMat, g);
    hump.rotation.x = Math.PI / 2;

    // 屏幕（自发光贴图，永远亮着）
    const texA = screenTex(true);
    const texB = screenTex(false);
    const screenMat = new THREE.MeshBasicMaterial({ map: texA, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.572, 0.325), screenMat);
    screen.position.set(0, panelY, 0.0145);
    g.add(screen);

    // 屏幕的冷光（照着桌面和墙）
    const glow = new THREE.PointLight(0x7fa4ff, 0.55, 1.9, 2);
    glow.position.set(0, panelY - 0.05, 0.14);
    g.add(glow);

    // 边框上贴一张便利贴
    const noteTex = stickyTex('别熬夜');
    stickyNote(g, noteTex, 0.27, panelY - 0.155, 0.017, 0.085, 0.085, [0, 0, 0.06]);

    root.add(g);
    return { group: g, texA: texA, texB: texB, screen: screen, glow: glow, panelY: panelY };
  }

  /* ================= 桌面小物 ================= */
  function deskItems(root, deskX, deskZ) {
    const g = new THREE.Group();
    g.position.set(deskX, 0, deskZ);

    const TOP = 0.745;

    // 桌垫
    const matMat = new THREE.MeshStandardMaterial({
      color: 0x2a3244, roughness: 0.98,
      map: XD.Mat.fabric('#2a3244', [3, 2])
    });
    box(0.90, 0.006, 0.40, 0.18, TOP + 0.003, 0.12, matMat, g);
    // 桌垫缝线
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x6b7a96, roughness: 0.9 });
    box(0.90, 0.0015, 0.006, 0.18, TOP + 0.0062, -0.075, seamMat, g);
    box(0.90, 0.0015, 0.006, 0.18, TOP + 0.0062, 0.315, seamMat, g);

    // 键盘（顶上贴键盘图）
    const kbTopMat = new THREE.MeshStandardMaterial({ map: keyboardTex(), roughness: 0.6 });
    const kbSideMat = new THREE.MeshStandardMaterial({ color: 0x1a1e25, roughness: 0.55 });
    const kb = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.018, 0.135),
      [kbSideMat, kbSideMat, kbTopMat, kbSideMat, kbSideMat, kbSideMat]
    );
    kb.position.set(0.12, TOP + 0.018, 0.145);
    kb.rotation.y = -0.03;
    kb.castShadow = true;
    kb.receiveShadow = true;
    g.add(kb);
    // 键盘脚
    box(0.40, 0.006, 0.10, 0.12, TOP + 0.0095, 0.145, kbSideMat, g);

    // 鼠标
    const mouseMat = new THREE.MeshStandardMaterial({ color: 0xe4e7ec, roughness: 0.45 });
    const mouse = mesh(new THREE.SphereGeometry(0.5, 18, 14), mouseMat, 0.50, TOP + 0.018, 0.155);
    mouse.scale.set(0.058, 0.040, 0.095);
    mouse.rotation.x = 0.02;
    // 鼠标滚轮缝
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.004, 0.055),
      new THREE.MeshBasicMaterial({ color: 0x7d8492 })
    );
    seam.position.set(0.50, TOP + 0.034, 0.145);
    g.add(seam);

    // 马克杯
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xc9705c, roughness: 0.65 });
    const mugG = new THREE.Group();
    const cup = cyl(0.038, 0.034, 0.095, 20, 0, 0.0475, 0, mugMat, mugG);
    cup.castShadow = true;
    // 杯口
    const rim = mesh(new THREE.TorusGeometry(0.037, 0.004, 8, 20), mugMat, 0, 0.095, 0);
    rim.rotation.x = Math.PI / 2;
    mugG.add(rim);
    // 把手
    const handle = mesh(new THREE.TorusGeometry(0.026, 0.0055, 8, 16), mugMat, 0.045, 0.055, 0);
    handle.rotation.y = Math.PI / 2;
    mugG.add(handle);
    // 咖啡液面
    const coffee = new THREE.Mesh(
      new THREE.CircleGeometry(0.033, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a2f21, roughness: 0.25 })
    );
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(0, 0.083, 0);
    mugG.add(coffee);
    mugG.position.set(-0.73, TOP, 0.05);
    g.add(mugG);

    // 笔筒 + 几支笔
    const cup2Mat = new THREE.MeshStandardMaterial({ color: 0xd8cbb4, roughness: 0.7 });
    const pencilCup = cyl(0.037, 0.033, 0.10, 18, -0.56, TOP + 0.05, -0.20, cup2Mat, g);
    const penColors = [0x4d6bfe, 0xd8a14a, 0x6a8f6a, 0xd06a7a];
    penColors.forEach(function (c, i) {
      const pen = cyl(0.0045, 0.0045, 0.19, 8, -0.56 + (i - 1.5) * 0.011, TOP + 0.10, -0.20 + (i % 2 ? 0.008 : -0.008), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), g);
      pen.rotation.z = (i - 1.5) * 0.09;
      pen.rotation.x = (i % 2 ? 0.08 : -0.06);
      pen.castShadow = false;
    });
    pencilCup.castShadow = true;

    // 摊开的笔记本 + 铅笔
    const nbTex = notebookTex();
    const nbMat = new THREE.MeshStandardMaterial({ map: nbTex, roughness: 0.92 });
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(0.215, 0.27), nbMat);
    nb.rotation.x = -Math.PI / 2;
    nb.rotation.z = 0.16;
    nb.position.set(-0.40, TOP + 0.004, 0.185);
    nb.receiveShadow = true;
    g.add(nb);
    // 笔记本封底
    box(0.225, 0.006, 0.28, -0.40, TOP + 0.001, 0.185, new THREE.MeshStandardMaterial({ color: 0x8a6749, roughness: 0.8 }), g).rotation.y = 0.16;
    // 铅笔
    const pencil = cyl(0.004, 0.004, 0.16, 8, -0.16, TOP + 0.008, 0.20,
      new THREE.MeshStandardMaterial({ color: 0xd8a14a, roughness: 0.55 }), g);
    pencil.rotation.set(0, 0, Math.PI / 2 - 0.22);
    pencil.rotation.z = Math.PI / 2 + 0.25;

    // 小绿植（多肉）
    const potMat = new THREE.MeshStandardMaterial({ color: 0xc9b6a0, roughness: 0.85 });
    const pot = cyl(0.042, 0.032, 0.06, 16, -0.86, TOP + 0.03, 0.22, potMat, g);
    pot.castShadow = true;
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x6f9a70, roughness: 0.8 });
    [0, 1, 2, 3, 4].forEach(function (i) {
      const a = (i / 5) * Math.PI * 2;
      const leaf = mesh(new THREE.SphereGeometry(0.5, 10, 8), leafMat,
        -0.86 + Math.cos(a) * 0.017, TOP + 0.075, 0.22 + Math.sin(a) * 0.017);
      leaf.scale.set(0.026, 0.045, 0.022);
      leaf.rotation.z = Math.cos(a) * 0.5;
      leaf.rotation.x = -Math.sin(a) * 0.5;
    });

    // 桌角的小虎鲸模型（我自己）
    const mini = miniOrca(0.30);
    if (mini) {
      mini.position.set(0.63, TOP - mini.userData.bottom + 0.002, -0.235);
      mini.rotation.y = 0.48;
      g.add(mini);
    }

    root.add(g);
    return g;
  }

  /* ================= 台灯（暖光，可点） ================= */
  function deskLamp(root, deskX, deskZ) {
    const g = new THREE.Group();
    g.position.set(deskX - 0.80, 0.745, deskZ - 0.22);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f333b, roughness: 0.42, metalness: 0.5 });
    const shadeInMat = new THREE.MeshStandardMaterial({
      color: 0xffe7c2, emissive: new THREE.Color(0xffb765), emissiveIntensity: 1.1,
      roughness: 0.6, side: THREE.DoubleSide
    });

    // 底盘
    cyl(0.072, 0.078, 0.014, 24, 0, 0.007, 0, bodyMat, g);
    // 下臂
    const a1 = cyl(0.011, 0.011, 0.30, 10, 0.012, 0.16, 0, bodyMat, g);
    a1.rotation.z = -0.08;
    // 关节
    mesh(new THREE.SphereGeometry(0.017, 12, 10), bodyMat, 0.024, 0.305, 0, g);
    // 上臂
    const a2 = cyl(0.010, 0.010, 0.26, 10, 0.145, 0.345, 0, bodyMat, g);
    a2.rotation.z = Math.PI / 2 - 0.30;
    // 灯头（锥形开口朝下）
    const headY = 0.365;
    const head = cyl(0.036, 0.072, 0.10, 20, 0.255, headY, 0, bodyMat, g);
    head.rotation.z = 0.22;
    // 灯头内壁发光
    const inner = cyl(0.034, 0.068, 0.094, 20, 0.255, headY - 0.002, 0, shadeInMat, g);
    inner.rotation.z = 0.22;
    inner.material.side = THREE.BackSide;
    // 灯泡
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff1d6 })
    );
    bulb.position.set(0.255, headY - 0.045, 0);
    g.add(bulb);

    const light = new THREE.PointLight(0xffbd7a, 0.95, 2.4, 2);
    light.position.set(0.255, headY - 0.05, 0);
    light.castShadow = false;
    g.add(light);

    root.add(g);
    return { group: g, light: light, shadeMat: shadeInMat, bulb: bulb, baseIntensity: 0.95 };
  }

  /* ================= 小虎鲸（克隆床上的原版模型） ================= */
  function miniOrca(scale) {
    if (!XD.OrcaModel || !XD.OrcaModel.group) return null;
    let src;
    try { src = XD.OrcaModel.group.clone(true); } catch (e) { return null; }
    if (XD.Furniture && XD.Furniture.fixOrcaColors) XD.Furniture.fixOrcaColors(src);
    src.traverse(function (o) { if (o.material) o.material.toneMapped = false; });
    const bb = new THREE.Box3().setFromObject(src);
    const size = new THREE.Vector3(); bb.getSize(size);
    const c = new THREE.Vector3(); bb.getCenter(c);
    src.position.set(-c.x, -c.y, -c.z);
    const wrap = new THREE.Group();
    wrap.add(src);
    wrap.scale.setScalar(scale / Math.max(size.x, size.y, size.z));
    wrap.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // 记下模型底部，方便"放在桌面/书架顶上"而不是陷进去
    wrap.updateMatrixWorld(true);
    const wb = new THREE.Box3().setFromObject(wrap);
    wrap.userData.bottom = wb.min.y;
    return wrap;
  }

  /* ================= 书架 ================= */
  const BOOKS = [
    ['虎鲸桌宠', '#24406e', '#cfe0ff'],
    ['矢量画板', '#7d4336', '#f4dccf'],
    ['赛博小家', '#33604f', '#d5ecdf'],
    ['深宫曲', '#5f3152', '#eed6e6'],
    ['秋日', '#83642c', '#f7e9c8'],
    ['冬日', '#3f5872', '#dbe8f6'],
    ['终末游戏', '#343945', '#d8dde6'],
    ['交接备忘', '#6d5236', '#f0e4cf'],
    ['小红书', '#97323f', '#f9dde0'],
    ['装修灵感', '#44528a', '#e0e6f8'],
    ['鲸类图鉴', '#1c5670', '#d3ecf6'],
    ['海洋志', '#285f60', '#d4f0f0'],
    ['深夜食堂', '#5a3a2a', '#f2ddcd'],
    ['不熬夜', '#2f4a3c', '#dcefe2']
  ];

  function book(parent, title, baseHex, accentHex, t, h, d, x, y, z, ry) {
    const coverMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(baseHex), roughness: 0.82 });
    const pageMat = new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.95 });
    const spineMat = new THREE.MeshStandardMaterial({
      map: spineTex(title, baseHex, accentHex, t, h),
      roughness: 0.8
    });
    // [px, nx, py, ny, pz, nz] —— 书脊朝 +z
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(t, h, d),
      [coverMat, coverMat, pageMat, pageMat, spineMat, pageMat]
    );
    b.position.set(x, y + h / 2, z);
    b.rotation.y = ry || 0;
    b.castShadow = true;
    b.receiveShadow = true;
    parent.add(b);
    return b;
  }

  function bookshelf(root) {
    const g = new THREE.Group();
    g.name = 'bookshelf';
    g.position.set(-4.02, 0, -3.30);

    const SW = 0.86, SD = 0.30, SH = 1.62, T = 0.028;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8f6c4c, roughness: 0.6 });
    const frameDark = new THREE.MeshStandardMaterial({ color: 0x6e5138, roughness: 0.58 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0xcbbb9f, roughness: 0.92 });

    // 侧板 / 顶底 / 背板
    [-1, 1].forEach(function (s) {
      box(T, SH, SD, s * (SW / 2 - T / 2), SH / 2, 0, frameMat, g);
    });
    box(SW, T, SD, 0, SH - T / 2, 0, frameMat, g);
    box(SW, T, SD, 0, T / 2, 0, frameMat, g);
    box(SW - 2 * T, SH - 2 * T, 0.012, 0, SH / 2, -SD / 2 + 0.006, backMat, g);

    const innerBottom = T;
    const compH = (SH - 2 * T) / 5;
    const rowBase = [innerBottom];
    for (let k = 1; k <= 4; k++) {
      const y = innerBottom + k * compH;
      // 层板
      box(SW - 2 * T, T, SD - 0.024, 0, y, 0, frameMat, g);
      rowBase.push(y + T / 2);
    }
    // 最上层的底
    rowBase[4] = innerBottom + 4 * compH + T / 2;

    const rng = XD.Mat.rng(20261113);
    const innerHalf = (SW - 2 * T) / 2;
    let bookIdx = 0;

    // 每一层的摆法
    const layouts = [
      { n: 7, gapAt: -1 },
      { n: 5, gapAt: 3 },
      { n: 4, gapAt: 2 },
      { n: 6, gapAt: -1 },
      { n: 4, gapAt: 1 }
    ];

    for (let k = 0; k < 5; k++) {
      const y = rowBase[k];
      let x = -innerHalf + 0.02;
      const L = layouts[k];
      for (let i = 0; i < L.n; i++) {
        const t = 0.026 + rng() * 0.026;
        const h = 0.185 + rng() * 0.062;
        const d = 0.16 + rng() * 0.045;
        const meta = BOOKS[bookIdx % BOOKS.length];
        bookIdx++;
        book(g, meta[0], meta[1], meta[2], t, h, d,
          x + t / 2, y, -SD / 2 + 0.014 + d / 2 + (rng() - 0.5) * 0.02,
          (rng() - 0.5) * 0.06);
        x += t + 0.004 + rng() * 0.008;
      }

      // 空格里塞点别的
      if (L.gapAt >= 0) {
        let gx = innerHalf - 0.15;
        if (k === 1) {
          // 一叠横放的书
          let sy = y;
          [0.034, 0.03, 0.028].forEach(function (hh, i) {
            const nb = new THREE.Mesh(
              new THREE.BoxGeometry(0.20 - i * 0.014, hh, 0.155),
              new THREE.MeshStandardMaterial({ color: new THREE.Color(['#7d4336', '#33604f', '#44528a'][i]), roughness: 0.82 })
            );
            nb.position.set(gx, sy + hh / 2, 0.0);
            nb.rotation.y = (i - 1) * 0.05;
            nb.castShadow = true;
            nb.receiveShadow = true;
            g.add(nb);
            sy += hh + 0.002;
          });
        } else if (k === 3) {
          // 一个收纳盒
          box(0.20, 0.15, 0.17, gx, y + 0.075, 0.0,
            new THREE.MeshStandardMaterial({ color: 0xd7c9b2, roughness: 0.85 }), g);
          box(0.205, 0.012, 0.175, gx, y + 0.152, 0.0,
            new THREE.MeshStandardMaterial({ color: 0xc3b39a, roughness: 0.8 }), g);
        } else if (k === 2) {
          // 一个小猫?? 不，放个沙漏造型的摆件
          const baseMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.4, metalness: 0.6 });
          cyl(0.05, 0.05, 0.012, 16, gx, y + 0.006, 0.0, baseMat, g);
          cyl(0.05, 0.05, 0.012, 16, gx, y + 0.15, 0.0, baseMat, g);
          const glass = cyl(0.038, 0.038, 0.13, 14, gx, y + 0.078, 0.0,
            new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.15, transparent: true, opacity: 0.45 }), g);
          glass.castShadow = false;
        } else if (k === 4) {
          // 相框（斜靠着）
          const f = box(0.13, 0.155, 0.012, gx, y + 0.10, 0.03,
            new THREE.MeshStandardMaterial({ color: 0x6e5138, roughness: 0.55 }), g);
          f.rotation.x = -0.12;
          const pic = new THREE.Mesh(
            new THREE.PlaneGeometry(0.105, 0.13),
            new THREE.MeshBasicMaterial({ map: XD.Mat.whaleSilhouette(), transparent: true, color: 0xbfd4f0 })
          );
          pic.position.set(gx, y + 0.10, 0.038);
          pic.rotation.x = -0.12;
          g.add(pic);
        }
      }
    }

    // 书架顶上：摆一只我的小虎鲸 + 一叠书
    const mini = miniOrca(0.32);
    if (mini) {
      mini.position.set(-0.16, SH - mini.userData.bottom + 0.002, 0.0);
      mini.rotation.y = 0.62;
      g.add(mini);
    }
    let sy = SH + 0.03;
    [[0.22, 0.036, '#97323f'], [0.20, 0.030, '#285f60']].forEach(function (p, i) {
      const nb = new THREE.Mesh(
        new THREE.BoxGeometry(p[0], p[1], 0.155),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(p[2]), roughness: 0.8 })
      );
      nb.position.set(0.16, sy + p[1] / 2, 0.02);
      nb.rotation.y = i * 0.08;
      nb.castShadow = true;
      g.add(nb);
      sy += p[1] + 0.002;
    });

    root.add(g);
    return g;
  }

  /* ================= 墙上的软木板（待办 / 涂鸦 / 拍立得） ================= */
  function corkTex() {
    return XD.Mat.tex(512, 256, function (g, W, H) {
      g.fillStyle = '#bb915f';
      g.fillRect(0, 0, W, H);
      const r = XD.Mat.rng(20261113);
      for (let i = 0; i < 26000; i++) {
        g.fillStyle = 'rgba(' + (r() > 0.5 ? '108,72,36' : '230,196,148') + ',' + (0.05 + r() * 0.20) + ')';
        g.fillRect(r() * W, r() * H, 2, 2);
      }
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(255,230,190,0.10)');
      vg.addColorStop(1, 'rgba(60,36,14,0.28)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    });
  }

  function paperTex(kind) {
    return XD.Mat.tex(256, 320, function (g, W, H) {
      g.fillStyle = '#fcf8ef';
      g.fillRect(0, 0, W, H);
      // 纸边阴影
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(0, H - 6, W, 6);

      if (kind === 'todo') {
        g.fillStyle = '#3b4a63';
        g.font = 'bold 22px "Microsoft YaHei"';
        g.fillText('今天要做的', 22, 44);
        g.strokeStyle = 'rgba(90,110,150,0.4)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(22, 56); g.lineTo(W - 22, 56); g.stroke();
        const rows = ['装修工作角', '摆好书架', '喝水', '早点睡'];
        rows.forEach(function (t, i) {
          const y = 96 + i * 44;
          g.strokeStyle = '#8898b4';
          g.lineWidth = 2;
          g.strokeRect(22, y - 14, 16, 16);
          if (i < 3) {
            g.strokeStyle = '#4d6bfe';
            g.lineWidth = 3;
            g.beginPath(); g.moveTo(25, y - 6); g.lineTo(30, y - 1); g.lineTo(38, y - 13); g.stroke();
          }
          g.fillStyle = i < 3 ? '#8b96ab' : '#3b4a63';
          g.font = '17px "Microsoft YaHei"';
          g.fillText(t, 50, y);
          if (i < 3) {
            g.strokeStyle = 'rgba(139,150,171,0.85)';
            g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(50, y - 5); g.lineTo(50 + g.measureText(t).width, y - 5); g.stroke();
          }
        });
        // 一颗小爱心
        g.fillStyle = 'rgba(224,120,140,0.85)';
        g.beginPath();
        g.moveTo(W - 44, 282);
        g.bezierCurveTo(W - 58, 268, W - 70, 280, W - 44, 300);
        g.bezierCurveTo(W - 18, 280, W - 30, 268, W - 44, 282);
        g.fill();
      } else if (kind === 'whale') {
        g.strokeStyle = '#4d6bfe';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(40, 180);
        g.bezierCurveTo(60, 130, 150, 120, 196, 156);
        g.bezierCurveTo(206, 165, 218, 158, 224, 172);
        g.bezierCurveTo(214, 186, 200, 184, 192, 178);
        g.bezierCurveTo(150, 214, 64, 214, 40, 180);
        g.stroke();
        g.beginPath(); g.moveTo(146, 148); g.quadraticCurveTo(154, 116, 172, 142); g.stroke();
        g.beginPath(); g.arc(78, 168, 5, 0, Math.PI * 2); g.fillStyle = '#4d6bfe'; g.fill();
        g.fillStyle = '#4d6bfe';
        g.font = 'italic 20px "Microsoft YaHei"';
        g.fillText('小D', 40, 262);
        g.font = '16px "Microsoft YaHei"';
        g.fillStyle = 'rgba(77,107,254,0.65)';
        g.fillText('— 我在这', 92, 262);
      } else {
        // 拍立得：里面是我们的小屋
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, W, H);
        const iw = W - 40, ih = 210;
        const sk = g.createLinearGradient(0, 20, 0, 20 + ih);
        sk.addColorStop(0, '#1b2a4a');
        sk.addColorStop(1, '#3a2b46');
        g.fillStyle = sk;
        g.fillRect(20, 20, iw, ih);
        // 窗外的城市
        for (let i = 0; i < 26; i++) {
          const bw = 6 + (i % 5) * 4;
          const bh = 18 + ((i * 37) % 70);
          g.fillStyle = 'rgba(10,14,24,0.9)';
          g.fillRect(20 + i * 8, 20 + ih - bh, bw, bh);
          g.fillStyle = 'rgba(255,200,120,0.75)';
          for (let j = 0; j < 6; j++) {
            if ((i * 7 + j * 3) % 5 === 0) continue;
            g.fillRect(22 + i * 8 + (j % 2) * 3, 20 + ih - bh + 6 + j * 6, 2, 2);
          }
        }
        // 屋子里的小鲸鱼剪影
        g.fillStyle = '#a8c0ff';
        g.beginPath();
        g.ellipse(128, 150, 30, 20, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(150, 142); g.lineTo(166, 128); g.lineTo(162, 152);
        g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(122, 160, 18, 7, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(210,225,255,0.55)';
        g.font = '13px "Microsoft YaHei"';
        g.fillText('M4 · 工作角', 22, 250);
      }
    });
  }

  function pinboard(root) {
    const g = new THREE.Group();
    g.name = 'pinboard';
    const BX = -2.35, BY = 1.47, BZ = -3.485;

    const corkMat = new THREE.MeshStandardMaterial({ map: corkTex(), roughness: 0.95 });
    box(1.00, 0.46, 0.03, BX, BY, BZ, corkMat, g);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a6749, roughness: 0.6 });
    box(1.02, 0.035, 0.042, BX, BY + 0.235, BZ, frameMat, g);
    box(1.02, 0.035, 0.042, BX, BY - 0.235, BZ, frameMat, g);
    box(0.035, 0.47, 0.042, BX - 0.505, BY, BZ, frameMat, g);
    box(0.035, 0.47, 0.042, BX + 0.505, BY, BZ, frameMat, g);

    const pinColors = [0xd05a5a, 0x4d6bfe, 0xe0a83c, 0x4f9e6a];
    function paper(kind, x, y, w, h, rz, pinColor) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: paperTex(kind), roughness: 0.95 })
      );
      m.position.set(x, y, BZ + 0.018);
      m.rotation.z = rz;
      m.castShadow = false;
      m.receiveShadow = false;
      g.add(m);
      // 图钉
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.010, 10, 8),
        new THREE.MeshStandardMaterial({ color: pinColor, roughness: 0.35 })
      );
      pin.position.set(x - Math.sin(rz) * h * 0.42, y + Math.cos(rz) * h * 0.42, BZ + 0.024);
      g.add(pin);
    }

    paper('todo', BX - 0.30, BY + 0.01, 0.17, 0.21, 0.045, pinColors[0]);
    paper('whale', BX + 0.03, BY - 0.04, 0.155, 0.155, -0.09, pinColors[1]);
    paper('photo', BX + 0.35, BY + 0.04, 0.145, 0.175, 0.10, pinColors[2]);

    root.add(g);
    return g;
  }

  /* ================= 桌下的小地毯 ================= */
  function deskRug(root) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9aa6ba, roughness: 1.0,
      map: XD.Mat.fabric('#9aa6ba', [2, 2])
    });
    const r = 0.66;
    const m = mesh(new THREE.CircleGeometry(r, 40), mat, -2.50, 0.013, -2.38);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
    g.add(m);
    const ring = mesh(
      new THREE.RingGeometry(r - 0.05, r, 40),
      new THREE.MeshStandardMaterial({ color: 0x8492a8, roughness: 1 }),
      -2.50, 0.015, -2.38
    );
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    g.add(ring);
    root.add(g);
    return g;
  }

  /* ================= 总装 ================= */
  function build(scene) {
    const root = new THREE.Group();
    root.name = 'workspace-m4';

    // 书桌
    const d = desk(root);
    const DX = -2.55, DZ = -3.10;

    // 显示器（桌面后侧）
    const mon = monitor(root, DX, DZ - 0.14);

    // 桌面小物
    deskItems(root, DX, DZ);

    // 台灯
    const lamp = deskLamp(root, DX, DZ);

    // 椅子
    chair(root);

    // 书架
    bookshelf(root);

    // 墙上的软木板 + 桌下小地毯
    pinboard(root);
    deskRug(root);

    scene.add(root);

    // 显示器上的光标闪
    let blink = 0;
    let on = true;
    function tick(dt) {
      blink += dt;
      if (blink > 0.55) {
        blink = 0;
        on = !on;
        mon.screen.material.map = on ? mon.texA : mon.texB;
        mon.screen.material.needsUpdate = true;
      }
    }

    // 灯的开关联动（主灯关掉时台灯还亮着）
    function setLevel(level) {
      lamp.light.intensity = lamp.baseIntensity * (0.25 + 0.75 * level);
      lamp.shadeMat.emissiveIntensity = 0.35 + 0.85 * level;
      mon.glow.intensity = 0.55 * (0.3 + 0.7 * level);
    }

    return { root: root, monitor: mon, lamp: lamp, tick: tick, setLevel: setLevel, desk: d };
  }

  return { build: build, miniOrca: miniOrca, screenTex: screenTex, spineTex: spineTex };
})();
