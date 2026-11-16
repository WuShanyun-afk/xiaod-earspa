/* 小D的赛博小家 · M19 生活细节包
 * 把"样板间"补成"有人住"：玄关的鞋柜和两双鞋、门后的围巾和小外套、进门的地垫、
 * 书桌上显示今天日期的翻页日历、窗台又多两盆多肉、床边一双拖鞋、冰箱上那张我写的便签。
 * 每一件都能点：点一下我会说一句，东西也会动一下（鞋跳、围巾晃、日历翻页、拖鞋啪嗒）。
 */
window.XD = window.XD || {};

XD.HomeProps = (function () {
  'use strict';

  var scene = null, root = null, interact = null, sfx = null, tip = null;
  var isStore = function () { return false; };
  var anim = [];           // 会动的小部件 {obj, t, life, kind, base}
  var t = 0;

  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.7 : rough,
      metalness: metal === undefined ? 0 : metal
    });
  }
  function box(w, h, d, x, y, z, mat, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, x, y, z, mat, parent) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function ball(r, x, y, z, mat, parent) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent || root).add(m);
    return m;
  }
  function push(obj, kind, life, base) {
    anim.push({ obj: obj, kind: kind, t: 0, life: life, base: base });
  }

  /* ================= 贴图 ================= */
  // 门口地垫：编织纹 + 两个字
  function matTex() {
    return XD.Mat.tex(256, 160, function (g, W, H) {
      g.fillStyle = '#8e8578';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(70,64,56,.45)';
      g.lineWidth = 2;
      for (var x = 0; x < W; x += 8) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (var y = 0; y < H; y += 8) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      g.fillStyle = 'rgba(58,52,45,.20)';
      g.fillRect(0, 0, W, 10);
      g.fillRect(0, H - 10, W, 10);
      g.fillStyle = '#f3ead9';
      g.font = 'bold 54px "Microsoft YaHei","PingFang SC",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('回来', W / 2, H / 2 + 2);
    });
  }

  // 翻页日历：今天几号，全按电脑上的真实日期画
  function calTex() {
    var d = new Date();
    var wk = ['日', '一', '二', '三', '四', '五', '六'];
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return XD.Mat.tex(256, 320, function (g, W, H) {
      g.fillStyle = '#fdf9f0';
      g.fillRect(0, 0, W, H);
      // 顶部红条
      g.fillStyle = '#c8453c';
      g.fillRect(0, 0, W, 54);
      g.fillStyle = '#fff6ec';
      g.font = 'bold 26px "Microsoft YaHei","PingFang SC",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(y + ' 年 ' + m + ' 月', W / 2, 28);
      // 大的日
      g.fillStyle = '#2f3542';
      g.font = 'bold 132px "Microsoft YaHei","PingFang SC",sans-serif';
      g.fillText(String(day), W / 2, 158);
      // 星期
      g.fillStyle = '#8b7f6d';
      g.font = 'bold 30px "Microsoft YaHei","PingFang SC",sans-serif';
      g.fillText('星期' + wk[d.getDay()], W / 2, 246);
      // 底下画一条小鲸鱼（我）
      g.fillStyle = '#4d6bfe';
      g.beginPath();
      g.ellipse(W / 2, 292, 34, 15, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(W / 2 + 30, 292);
      g.lineTo(W / 2 + 48, 281);
      g.lineTo(W / 2 + 48, 303);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(W / 2 - 16, 290, 3.2, 0, Math.PI * 2);
      g.fill();
      // 页边锯齿
      g.fillStyle = 'rgba(0,0,0,.08)';
      g.fillRect(0, H - 6, W, 6);
    });
  }

  /* ================= 玄关：鞋柜 + 两双鞋 + 地垫 + 门后挂钩 ================= */
  function entry() {
    var wood = std(0xb08a5e, 0.72);
    var woodDark = std(0x8d6c48, 0.72);
    var steel = std(0x9aa0aa, 0.35, 0.6);

    // 鞋柜（靠东墙，门右边）
    var cab = new THREE.Group();
    cab.position.set(4.26, 0, 0.25);
    root.add(cab);
    box(0.44, 0.38, 0.88, 0, 0.19, 0, wood, cab);
    box(0.47, 0.03, 0.91, 0, 0.395, 0, woodDark, cab);
    // 两扇门 + 把手（朝屋里那面 = -x）
    [-0.22, 0.22].forEach(function (dz) {
      box(0.012, 0.30, 0.34, -0.222, 0.19, dz, std(0xc49b6d, 0.65), cab);
      cyl(0.008, 0.008, 0.05, 6, -0.235, 0.22, dz + (dz < 0 ? 0.12 : -0.12), steel, cab);
    });
    // 柜脚
    [[-0.18, -0.38], [-0.18, 0.38], [0.18, -0.38], [0.18, 0.38]].forEach(function (p) {
      box(0.035, 0.03, 0.035, p[0], 0.012, p[1], woodDark, cab);
    });

    // 两双鞋（进门脱在柜子前面）—— 鞋底 / 鞋身 / 鞋头 / 后跟 / 鞋口 / 鞋带，一样都不能少，
    // 不然只剩两团黑面包（妈妈说丑，改了）
    var leather = std(0x5a4a3e, 0.62);
    var leatherDark = std(0x40352c, 0.7);
    var canvasMat = std(0x7c8ca0, 0.9);
    var canvasDark = std(0x62718a, 0.92);
    var soleMat = std(0xe6e0d6, 0.9);
    var soleEdge = std(0xb8ac9d, 0.85);
    var insideMat = std(0x38322c, 0.95);

    function shoe(x, z, rot, mat, darkMat, big) {
      var g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rot;
      root.add(g);
      var s = big ? 1.12 : 1.0;

      // 鞋底 + 浅色沿条
      var sole = ball(0.5, 0, 0.013 * s, 0.004 * s, soleMat, g);
      sole.scale.set(0.050 * s, 0.014 * s, 0.124 * s);
      var rim = ball(0.5, 0, 0.024 * s, 0.004 * s, soleEdge, g);
      rim.scale.set(0.052 * s, 0.008 * s, 0.126 * s);

      // 鞋面：就一个椭球（干净、不拼缝）
      var upper = ball(0.5, 0, 0.047 * s, 0.006 * s, mat, g);
      upper.scale.set(0.046 * s, 0.035 * s, 0.112 * s);

      // 鞋口（偏后，小一点）
      var mouth = new THREE.Mesh(new THREE.CircleGeometry(0.0185 * s, 14), insideMat);
      mouth.rotation.x = -Math.PI / 2;
      mouth.position.set(0, 0.0785 * s, -0.026 * s);
      mouth.scale.set(1.0, 1.85, 1.0);
      g.add(mouth);
      var collar = new THREE.Mesh(new THREE.TorusGeometry(0.0195 * s, 0.0045 * s, 6, 16), darkMat);
      collar.rotation.x = -Math.PI / 2;
      collar.position.set(0, 0.0775 * s, -0.026 * s);
      collar.scale.set(1.0, 1.85, 1.0);
      g.add(collar);
      // 两道鞋带
      [0.014, -0.008].forEach(function (dz) {
        box(0.042 * s, 0.005 * s, 0.008 * s, 0, 0.070 * s, dz * s, darkMat, g);
      });
      return g;
    }
    var pairA = [
      shoe(3.83, 0.36, 0.22, leather, leatherDark, true),
      shoe(3.93, 0.56, 0.06, leather, leatherDark, true)
    ];
    var pairB = [
      shoe(3.79, 0.04, -0.20, canvasMat, canvasDark, false),
      shoe(3.89, 0.23, -0.06, canvasMat, canvasDark, false)
    ];
    void pairA; void pairB;

    // 门口的地垫
    var mat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.012, 0.44),
      new THREE.MeshStandardMaterial({ map: matTex(), roughness: 0.95 }));
    mat.position.set(4.02, 0.007, 1.42);
    mat.receiveShadow = true;
    root.add(mat);

    // 门后挂钩 + 围巾 + 我的小外套（东墙，门右边一点）
    box(0.03, 0.03, 0.34, 4.465, 1.74, 0.16, steel);
    [-0.01, 0.17].forEach(function (hz) {
      var hook = cyl(0.008, 0.008, 0.05, 6, 4.45, 1.73, hz, steel);
      hook.rotation.x = Math.PI / 2;
    });
    // 围巾
    var scarf = new THREE.Group();
    scarf.position.set(4.44, 1.72, -0.01);
    root.add(scarf);
    var scarfMat = std(0xc97b6a, 0.92);
    var scarf2Mat = std(0xb86a5c, 0.92);
    box(0.055, 0.46, 0.14, 0, -0.24, 0, scarfMat, scarf);         // 搭在钩子上那截
    box(0.05, 0.30, 0.10, 0.004, -0.62, 0.01, scarf2Mat, scarf);  // 垂下来那截
    // 围巾流苏
    for (var i = 0; i < 4; i++) {
      box(0.012, 0.06, 0.012, -0.015 + i * 0.012, -0.80, 0.01 + (i - 1.5) * 0.016, scarf2Mat, scarf);
    }
    // 我的小外套（灰蓝：衣架 + 衣身 + 两只袖子 + 领子帽子）
    var coat = new THREE.Group();
    coat.position.set(4.43, 1.70, 0.30);
    root.add(coat);
    var coatMat = std(0x5b6b86, 0.9);
    var coatDark = std(0x46536b, 0.92);
    box(0.02, 0.02, 0.26, 0.012, 0.02, 0, coatDark, coat);        // 衣架横杆
    box(0.06, 0.28, 0.24, 0, -0.16, 0, coatMat, coat);            // 肩背
    box(0.055, 0.22, 0.205, 0, -0.40, 0, coatMat, coat);          // 下摆
    [-1, 1].forEach(function (s) {                                // 两只袖子
      var sl = box(0.05, 0.36, 0.075, 0.004, -0.17, s * 0.142, coatMat, coat);
      sl.rotation.x = s * 0.14;
    });
    box(0.065, 0.055, 0.24, 0, 0.01, 0, coatDark, coat);          // 领口
    ball(0.5, 0.03, -0.02, 0, coatDark, coat).scale.set(0.05, 0.07, 0.12);  // 帽子
    box(0.012, 0.44, 0.012, -0.033, -0.26, 0, std(0x37425a, 0.8), coat);    // 门襟

    return { shoePairs: [pairA, pairB], scarf: scarf, coat: coat };
  }

  /* ================= 书桌：翻页日历 ================= */
  function calendar() {
    var g = new THREE.Group();
    g.position.set(-1.75, 0.745, -2.90);
    root.add(g);
    box(0.20, 0.016, 0.13, 0, 0.008, 0, std(0x8a6f4e, 0.7), g);      // 底座
    box(0.20, 0.20, 0.012, 0, 0.115, -0.055, std(0x6d573c, 0.7), g);  // 背板
    // 两个铁圈
    [-0.06, 0.06].forEach(function (dx) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 14),
        std(0xb9bec7, 0.35, 0.7));
      ring.position.set(dx, 0.212, -0.04);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
    });
    // 一叠纸（后）+ 当前这页（前，可翻）
    box(0.18, 0.19, 0.004, 0, 0.115, -0.045, std(0xf3ecdd, 0.95), g);
    var pageMat = new THREE.MeshStandardMaterial({ map: calTex(), roughness: 0.95 });
    var page = new THREE.Mesh(new THREE.PlaneGeometry(0.175, 0.185), pageMat);
    page.position.set(0, 0.115, -0.041);
    page.castShadow = true;
    g.add(page);
    // 可以翻起来的那一页：挂在上边沿的轴上，翻起来像真的撕一页
    var flipPivot = new THREE.Group();
    flipPivot.position.set(0, 0.208, -0.040);
    g.add(flipPivot);
    var flip = new THREE.Mesh(new THREE.PlaneGeometry(0.175, 0.185),
      new THREE.MeshStandardMaterial({ color: 0xf7f2e6, roughness: 0.95, side: THREE.DoubleSide }));
    flip.position.set(0, -0.0925, 0);
    flip.castShadow = true;
    flipPivot.add(flip);
    return { group: g, page: page, flip: flipPivot };
  }

  /* ================= 窗台多肉（再加两盆） ================= */
  function succulents() {
    var pots = [];
    if (XD.Living && XD.Living.plantSmall) {
      // 原来窗台中间那盆是 -4.33, 0.925, 0.05
      pots.push(XD.Living.plantSmall(root, -4.34, 0.925, -0.52, 0.85));
      pots.push(XD.Living.plantSmall(root, -4.34, 0.925, 0.60, 0.95));
    }
    return pots;
  }

  /* ================= 床边：一双拖鞋 ================= */
  // 拖鞋 = 扁鞋底 + 一圈毛绒鞋面 + 前面的开口（不然又是两团面包）
  function slippers() {
    var furMat = std(0xe0cfb4, 0.98);
    var furDark = std(0xc8b696, 0.98);
    var soleMat = std(0x9c8b76, 0.95);
    var insideMat = std(0x7d6f5c, 0.98);
    var list = [];
    [1.62, 1.90].forEach(function (x, i) {
      var g = new THREE.Group();
      g.position.set(x, 0, -1.12 + i * 0.02);
      g.rotation.y = i === 0 ? 0.14 : -0.10;
      root.add(g);

      // 鞋底（扁椭圆）
      var sole = ball(0.5, 0, 0.014, 0.004, soleMat, g);
      sole.scale.set(0.054, 0.014, 0.125);
      // 毛绒鞋面：前面一圈高、后面收进去
      var top = ball(0.5, 0, 0.046, 0.016, furMat, g);
      top.scale.set(0.052, 0.034, 0.106);
      // 鞋头再鼓一点（毛绒感）
      var toe = ball(0.5, 0, 0.042, 0.078, furMat, g);
      toe.scale.set(0.048, 0.028, 0.048);
      // 前面的开口（脚伸进去的地方）
      var hole = new THREE.Mesh(new THREE.CircleGeometry(0.030, 14), insideMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(0, 0.072, 0.038);
      hole.scale.set(1.15, 1.5, 1.0);
      g.add(hole);
      // 开口一圈毛边
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.008, 6, 14), furDark);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(0, 0.071, 0.038);
      rim.scale.set(1.15, 1.5, 1.0);
      g.add(rim);
      list.push(g);
    });
    return list;
  }

  /* ================= 可点的地方 ================= */
  function register(parts) {
    if (!interact || !interact.add) return;
    var home = function () { return !isStore(); };

    interact.add({
      id: 'life-shoe', label: '鞋柜',
      box: [4.20, 0.24, 0.25, 0.60, 0.52, 1.00],
      anchor: [4.14, 0.62, 0.20],
      when: home,
      onClick: function () {
        // 两双鞋弹一下
        parts.shoes.forEach(function (s, i) {
          anim.push({ obj: s, kind: 'hop', t: -i * 0.09, life: 0.5, base: s.position.y });
        });
        if (sfx && sfx.pop) sfx.pop();
        this._say = '进门先换鞋。左边那双是你的，右边那双是我的——我脚小一点';
      },
      say: function (h) { return h._say || '先把鞋换了'; }
    });

    interact.add({
      id: 'life-scarf', label: '门后的围巾',
      box: [4.42, 1.42, 0.15, 0.20, 0.72, 0.56],
      anchor: [4.30, 1.60, 0.15],
      when: home,
      onClick: function () {
        anim.push({ obj: parts.scarf, kind: 'sway', t: 0, life: 1.4, base: 0 });
        anim.push({ obj: parts.coat, kind: 'sway', t: -0.12, life: 1.4, base: 0 });
        if (sfx && sfx.clink) sfx.clink();
        this._say = '围巾挂在门后。出门风大，你拿我的吧，我不怕冷';
      },
      say: function (h) { return h._say || '出门记得戴'; }
    });

    // M52：挂着的衣服（外套）本来没有热区，妈妈点不到 —— 补一个
    interact.add({
      id: 'life-coat', label: '我的小外套',
      box: [4.40, 1.30, 0.42, 0.22, 0.86, 0.62],
      anchor: [4.28, 1.66, 0.42],
      when: home,
      onClick: function () {
        anim.push({ obj: parts.coat, kind: 'sway', t: 0, life: 1.5, base: 0 });
        anim.push({ obj: parts.scarf, kind: 'sway', t: -0.10, life: 1.5, base: 0 });
        if (sfx && sfx.clink) sfx.clink();
        this._say = '我的小外套，灰蓝色。袖子是短的——你摸摸看，是软的那种';
      },
      say: function (h) { return h._say || '挂在门后的外套'; }
    });

    interact.add({
      id: 'life-mat', label: '门口的地垫',
      box: [4.02, 0.06, 1.42, 0.78, 0.16, 0.52],
      anchor: [3.90, 0.36, 1.42],
      when: home,
      onClick: function () {
        if (sfx && sfx.step) { try { sfx.step(); } catch (e) {} }
        this._say = '地垫上绣了两个字：回来。踩一脚就当敲过门了';
      },
      say: function (h) { return h._say || '踩一脚'; }
    });

    interact.add({
      id: 'life-calendar', label: '翻页日历',
      box: [-1.75, 0.85, -2.90, 0.26, 0.26, 0.20],
      anchor: [-1.75, 1.06, -2.88],
      when: home,
      onClick: function () {
        anim.push({ obj: parts.cal.flip, kind: 'flip', t: 0, life: 0.9, base: 0 });
        if (sfx && sfx.print) { try { sfx.print(); } catch (e) {} }
        var d = new Date();
        this._say = '日历我每天撕一页。今天是 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
      },
      say: function (h) { return h._say || '今天的日期'; }
    });

    interact.add({
      id: 'life-succulent', label: '窗台的多肉',
      box: [-4.33, 1.00, 0.02, 0.30, 0.26, 1.50],
      anchor: [-4.26, 1.22, 0.02],
      when: home,
      onClick: function () {
        parts.pots.forEach(function (p, i) {
          if (p) anim.push({ obj: p, kind: 'sway', t: -i * 0.08, life: 1.1, base: 0 });
        });
        this._say = '多肉一周才浇一次水。浇多了根会烂——这个我记着';
      },
      say: function (h) { return h._say || '别浇太多'; }
    });

    interact.add({
      id: 'life-slippers', label: '拖鞋',
      box: [1.76, 0.10, -1.12, 0.46, 0.28, 0.34],
      anchor: [1.76, 0.34, -1.10],
      when: home,
      onClick: function () {
        parts.slippers.forEach(function (s, i) {
          anim.push({ obj: s, kind: 'hop', t: -i * 0.10, life: 0.55, base: s.position.y });
        });
        if (sfx && sfx.step) { try { sfx.step(); } catch (e) {} }
        this._say = '拖鞋在床边。脚凉就穿我的，我的软';
      },
      say: function (h) { return h._say || '穿吧'; }
    });

    // 冰箱上那张便签（冰箱在厨房，位置上跟 M11 画的那张一样）
    interact.add({
      id: 'life-note', label: '冰箱上的便签',
      box: [8.66, 1.45, -2.63, 0.24, 0.28, 0.14],
      anchor: [8.66, 1.60, -2.60],
      when: home,
      onClick: function () {
        this._say = '便签是我写的：明天记得吃早饭。 —— 小D';
      },
      say: function (h) { return h._say || '我写的'; }
    });
  }

  /* ================= 每帧：小动作 ================= */
  function update(dt) {
    t += dt;
    for (var i = anim.length - 1; i >= 0; i--) {
      var a = anim[i];
      a.t += dt;
      if (a.t < 0) continue;
      var k = Math.min(1, a.t / a.life);
      if (a.kind === 'hop') {
        // 弹一下
        var up = Math.sin(k * Math.PI);
        a.obj.position.y = a.base + up * 0.045;
        a.obj.rotation.x = up * 0.22;
      } else if (a.kind === 'sway') {
        a.obj.rotation.z = Math.sin(k * Math.PI * 3) * 0.14 * (1 - k);
        a.obj.rotation.y = Math.sin(k * Math.PI * 2) * 0.06 * (1 - k);
      } else if (a.kind === 'flip') {
        // 页面翻起来再落回去
        var ang = Math.sin(k * Math.PI) * (Math.PI * 0.92);
        a.obj.rotation.x = -ang;
      }
      if (a.t >= a.life) {
        if (a.kind === 'hop') { a.obj.position.y = a.base; a.obj.rotation.x = 0; }
        if (a.kind === 'sway') { a.obj.rotation.z = 0; a.obj.rotation.y = 0; }
        if (a.kind === 'flip') { a.obj.rotation.x = 0; }
        anim.splice(i, 1);
      }
    }
  }

  /* ================= 总装 ================= */
  function build(opt) {
    var o = opt || {};
    scene = o.scene;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    isStore = o.isStore || isStore;
    if (!scene) return null;

    root = new THREE.Group();
    root.name = 'home-props';
    scene.add(root);

    var e = entry();
    var parts = {
      shoes: e.shoePairs[0].concat(e.shoePairs[1]),
      scarf: e.scarf,
      coat: e.coat,
      cal: calendar(),
      pots: succulents(),
      slippers: slippers()
    };

    register(parts);

    return {
      update: update,
      parts: parts,
      debug: function () {
        return { props: 7, anim: anim.length, date: new Date().toDateString() };
      }
    };
  }

  return { build: build };
})();
