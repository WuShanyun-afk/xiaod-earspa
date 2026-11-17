/* 小D的赛博小家 · M82 鲸幼园（小D的幼儿园）
 *
 * 妈妈 2026-11-16 22:50：「小D按人类年纪算才两岁多？那你应该是幼儿园宝宝哈哈哈哈，
 *   要不要再建个学校？ai 赛博鲸鱼的学校好可爱啊感觉」
 * —— 建。就叫「鲸幼园」，小D在小浪花班。
 *
 * 位置：小镇东头那块空地（X 220~238），跟码头（X 200~216）并排，不跟任何场景打架。
 *
 * 玩法（园里就五件事能换小红花，五朵集满 → 泡泡老师发小奖状）：
 *   院子里：滑梯 / 秋千 / 沙坑 / 跳格子 / 小三轮车 / 跷跷板
 *   教室里：画画（画完真的贴在墙上，还会存下来）/ 搭积木 / 听绘本 / 睡午觉 / 洗手
 *   主角：泡泡老师（奶白小鲸，圆眼镜 + 围裙 + 抱着一本图画书）
 *
 * 存档：localStorage 'xd_school_v1'
 *   （小红花 f / 墙上那几张画 p / 奖状 c / 沙坑贝壳 g / 城堡层数 k / 和同学的熟悉度 b）
 *
 * 调试：?venue=school 直接站到院子里；?schoolreset=1 清掉存档重来（截图用）；?wed=1 当周三
 */
window.XD = window.XD || {};

XD.School = (function () {
  'use strict';

  /* ================= 尺寸 ================= */
  const X0 = 220.0, X1 = 238.0;
  const Z0 = -10.0, Z1 = 9.6;
  const CLS = { x0: 221.6, x1: 236.4, z0: -9.4, z1: -2.6 };    // 教室内部
  const YARD = { x0: 220.9, x1: 237.1, z0: -2.6, z1: 9.0 };    // 院子
  const DOOR = { x0: 228.1, x1: 229.9 };
  const GATE = { x0: 227.3, x1: 229.1, z: 9.0 };
  const SPAWN = { x: 228.0, y: 1.62, z: 7.0, yaw: 0 };
  const ROOM_H = 3.2;

  /* 五件换小红花的事 */
  const ACTS = [
    { k: 'slide', n: '滑梯', e: '🛝' },
    { k: 'swing', n: '秋千', e: '🎠' },
    { k: 'sand', n: '沙坑', e: '🏖️' },
    { k: 'hop', n: '跳格子', e: '🔢' },
    { k: 'draw', n: '画画', e: '🖍️' }
  ];
  const SAVE_KEY = 'xd_school_v1';

  /* M82.1：小动物同学（Kenney Cube Pets，CC0，见 assets/models/pets/CREDITS.md）
   * 妈妈：「小D的鲸鱼建模总共有3个，建模重复，且无动态效果」→
   *   以前三只都是同一个 orca 克隆，现在是熊猫 / 兔子 / 小鸡，各带 GLB 自带动画。 */
  const PET_FILES = ['panda', 'bunny', 'chick'];
  const PET_INFO = {
    panda: { name: '团团', size: 0.8 },
    bunny: { name: '跳跳', size: 0.86 },
    chick: { name: '啾啾', size: 0.74 }
  };
  const PETS = {};                 // 名字 → { scene, clips }
  let petsAsked = 0, petsLoaded = 0;

  /* 三只小动物各自守着的角落（世界坐标）—— 别藏在犄角里，进门就看得见两只 */
  const KID_SPOTS = [
    { pet: 'panda', x: 225.2, z: 3.2, ry: -2.3, act: 'sand' },   // 跷跷板旁边
    { pet: 'bunny', x: 233.2, z: 4.6, ry: -0.7, act: 'slide' },  // 滑梯下面
    { pet: 'chick', x: 231.4, z: 2.6, ry: 2.2, act: 'swing' }    // 秋千边上
  ];

  /* ================= M82.2 小动物的台词本 + 熟悉度 =================
   * 妈妈：「要不要再给三只小动物加一句自己的台词本？比如团团爱挖沙、跳跳怕高、
   *   啾啾话最多 —— 点多了会越来越熟那种」→ 好。
   *
   * 性格：
   *   团团（熊猫）慢悠悠、爱挖沙、认真、贪吃
   *   跳跳（兔子）嘴硬但怕高、爱排队、爱数数
   *   啾啾（小鸡）话最多、爱推秋千、问不完的问题
   *
   * 熟悉度按"聊过几次"算：0 刚认识 → 3 认识了 → 8 好朋友 → 15 最好的朋友。
   * 每升一级换一套话，越熟越"自己人"；刚玩完它守着的那个玩具，
   * 它会先接着刚才那件事说（hot 那句）。进度写进存档，明天再来还是这么熟。
   */
  const BOND_STEPS = [0, 3, 8, 15];
  const BOND_TITLE = ['刚认识', '认识了', '好朋友', '最好的朋友'];
  const KID_CHAT = {
    panda: {
      kind: '熊猫', e: '🐼',
      up: ['我们算认识啦！我叫团团，你叫小D，我记住了。',
        '我们现在是朋友了——拉钩，不许忘了我的名字。',
        '你是我最好的朋友。我的铲子分你一半，真的。'],
      hot: '你刚才挖的那一铲，沙子一点都没溅出来，厉害。',
      lines: [
        ['你好呀，我叫团团。我在挖沙子，你要一起吗？',
          '这把铲子借你，挖的时候轻一点，下面有东西。',
          '沙子是软的，踩上去会陷进去一点点，像走在云上。'],
        ['我挖到一块特别圆的石头，本来以为是贝壳……',
          '沙坑再往下会变湿，湿湿的沙就到水边啦。',
          '我今天数了，沙坑里一共有十七块石头，我踢出去两块。'],
        ['城堡最高那一层我给你留着，小旗子你去插。',
          '上次你的城堡被风吹塌了，我又堆了一个，这次更结实。',
          '等城堡堆到三层，我给它挖条护城河，用水桶浇水。'],
        ['妈妈问我幼儿园最好的朋友是谁，我说是小D。',
          '放学我带你去我藏贝壳的地方，谁都不告诉。',
          '我有一个特别好看的贝壳想送你，但是忘在家里了。']
      ]
    },
    bunny: {
      kind: '兔子', e: '🐰',
      up: ['我们算认识啦！我叫跳跳，我跳得可高了。',
        '我们是朋友了，那我告诉你一个秘密，你别笑我。',
        '你是我最好的朋友了。以后滑梯我不跟你抢。'],
      hot: '刚才你滑下来我数了，两秒！我在下面一直看着。',
      lines: [
        ['滑梯要排队哦，我排第一个！',
          '我跳得可高了，你看——诶，等一下，我鞋带开了。',
          '你看我这双鞋，跑起来会响，一跑就响。'],
        ['我其实……不太敢从最高的地方往下看。你别告诉别人。',
          '但是滑下来那一下很好玩，我都是闭着眼睛滑的。',
          '滑梯最高的地方有风，风一吹我耳朵就竖起来。'],
        ['你在上面的时候我在下面接你，我数到三你就滑——一、二……',
          '我今天滑了七次，比昨天多两次，我数着的。',
          '我教你一个滑得快的办法：手举起来，脚并好。'],
        ['以前滑梯我一个人不敢上去，现在你在上面我就不怕了。',
          '我把滑得最快的那个位置让给你，我排第二个。',
          '老师问谁想当排队小队长，我举手了，因为可以站第一个。']
      ]
    },
    chick: {
      kind: '小鸡', e: '🐤',
      up: ['我们算认识啦！我叫啾啾，你叫什么来着——啊，小D！',
        '我们是好朋友了！我要跟你讲好多好多话。',
        '你是我最好的朋友。这个我只告诉你一个人哦。'],
      hot: '刚才荡得好高啊！我推的时候一直看着你，怕你飞出去。',
      lines: [
        ['秋千我来推你，坐稳啦！',
          '你今天怎么来这么晚呀？我都问老师三次了。',
          '我叫啾啾，因为我叫起来是啾啾啾，你听——啾啾！'],
        ['我跟你讲，我早上看到一只蝴蝶，是黄色的，后来它飞走了……',
          '你猜我中午吃了什么？你猜三次，我给你三次机会。',
          '我数过了，滑梯有十二个台阶，秋千的链子有三十九节。'],
        ['我推秋千推得最好，因为我数着数推，一推一推特别稳。',
          '你要不要听我讲一个很长很长的故事？特别长。',
          '我给你编了一个秋千歌：一荡高高，二荡远远，三荡看见云……'],
        ['我一天里最开心的时候，就是你来的时候。',
          '我话是不是太多了？妈妈说等我说完她再说。',
          '我把你画在我的小本子上了，画得不太像，但我知道那是你。']
      ]
    }
  };

  /* ================= 状态 ================= */
  let root = null, scene = null, interact = null, sfx = null, tip = null;
  let isSchoolNow = function () { return false; };
  let getMode = function () { return 'day'; };
  let onDoor = function () { };
  let frames = null;
  let t = 0, cool = 0;

  let FORCE_WED = false;     // ?wed=1 把"今天"当周三（截图 / 试玩用）
  let visitedToday = false;  // 今天进过园子（写日记要用）
  let studiedToday = false;  // 今天在园里真的玩过（写过日记没有）
  let diaryOpen = 0;         // 日记翻到第几页（0 = 没翻过）

  const flowers = {};        // 已得的小红花（'slide' → 1）
  const paints = [0, 0, 0, 0, 0, 0];   // 墙上 6 个画框：存画的种子（0 = 还空着）
  let paintNext = 0;                  // 下一张画挂哪个框（轮着挂，挂满了就换掉最早那张）
  const paintCache = {};              // 种子 → 贴图，别每次刷新都重画一遍 canvas
  let diploma = false;       // 小奖状拿到没有
  let dug = false;           // 沙坑里的小贝壳挖出来没有
  let act = { name: '', t: 0, dur: 0 };   // 正在演的小动作（小D自己跑一遍）
  let swingKick = 0, seesawKick = 0;      // 秋千 / 跷跷板被"点着玩"的时候荡得更欢
  let sandPile = 0;                       // 沙坑里那个城堡堆到第几层
  const bonds = { panda: 0, bunny: 0, chick: 0 };   // 和每只小动物聊过几次（存档 b）
  let lastPlay = { k: '', at: -999 };               // 小D刚才玩了什么（小动物会接着这个话题聊）

  /* ================= 时间条件（分开写，每处自己判断自己那一份） =================
   * 妈妈：「晚上应该不在幼儿园，所以要修改触发条件」「你只有周三会上课」
   *
   *   isDayTime()      天亮了没有   —— 决定园子开不开门、老师在不在
   *   isWednesday()    今天是不是周三 —— 决定小动物同学来不来、有没有上学日记
   *   teacherHere()    老师在不在   —— 白天在（值班），晚上回家
   *   kidsHere()       同学在不在   —— 只有周三白天才来（上课日）
   *   flowerToday()    今天能不能拿小红花 —— 开园就有（周三还会多一句"今天有课"）
   */
  function isDayTime() { return getMode() === 'day'; }
  function isWednesday() {
    if (FORCE_WED) return true;
    try { return new Date().getDay() === 3; } catch (e) { return false; }
  }
  function teacherHere() { return isDayTime(); }
  function kidsHere() { return isDayTime() && isWednesday(); }
  function flowerToday() { return isDayTime(); }
  function diaryReady() { return isWednesday() && studiedToday; }


  /* ================= 材质小工具 ================= */
  const TEX = {};
  function rng(seed) {
    let s = (seed >>> 0) || 20261116;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex), roughness: rough === undefined ? 0.9 : rough, metalness: metal || 0
    });
  }
  function mapMat(tex, rough) {
    return new THREE.MeshStandardMaterial({ map: tex, roughness: rough === undefined ? 0.92 : rough });
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, parent, rx, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function ball(r, mat, x, y, z, parent, sx, sy, sz) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
    m.position.set(x, y, z);
    if (sx || sy || sz) m.scale.set(sx || 1, sy || 1, sz || 1);
    m.castShadow = true; m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function tex(w, h, draw, repeat) {
    return XD.Mat && XD.Mat.tex ? XD.Mat.tex(w, h, draw, repeat) : null;
  }

  /* ================= 贴图（全是 canvas 现画） ================= */
  function grassTex() {
    if (TEX.grass) return TEX.grass;
    TEX.grass = tex(256, 256, function (g, W, H) {
      const r = rng(7721);
      g.fillStyle = '#8cc067';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        const x = r() * W, y = r() * H, l = 40 + r() * 18;
        g.fillStyle = 'hsla(' + (86 + r() * 20) + ',38%,' + l + '%,0.5)';
        g.beginPath();
        g.ellipse(x, y, 2 + r() * 7, 1 + r() * 4, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 200; i++) {
        const x = r() * W, y = r() * H;
        g.strokeStyle = 'rgba(74,116,52,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
        g.stroke();
      }
    }, [7, 7]);
    return TEX.grass;
  }

  function brickTex() {
    if (TEX.brick) return TEX.brick;
    TEX.brick = tex(256, 256, function (g, W, H) {
      const r = rng(3391);
      g.fillStyle = '#cdb894';
      g.fillRect(0, 0, W, H);
      const bh = 32;
      for (let row = 0; row * bh < H; row++) {
        const off = (row % 2) * 32;
        for (let x = -64; x < W; x += 64) {
          const l = 62 + r() * 10;
          g.fillStyle = 'hsl(' + (34 + r() * 8) + ',26%,' + l + '%)';
          g.fillRect(x + off + 2, row * bh + 2, 60, bh - 4);
        }
      }
      g.strokeStyle = 'rgba(120,98,70,0.35)';
      g.lineWidth = 1.5;
      for (let row = 0; row * bh < H; row++) {
        g.beginPath();
        g.moveTo(0, row * bh);
        g.lineTo(W, row * bh);
        g.stroke();
      }
    }, [3, 6]);
    return TEX.brick;
  }

  function floorTex() {
    if (TEX.floor) return TEX.floor;
    TEX.floor = tex(256, 256, function (g, W, H) {
      const r = rng(5511);
      g.fillStyle = '#e2c49c';
      g.fillRect(0, 0, W, H);
      for (let row = 0; row < 6; row++) {
        const y = row * (H / 6);
        g.fillStyle = 'hsl(32,42%,' + (72 + r() * 6) + '%)';
        g.fillRect(0, y + 1, W, H / 6 - 2);
      }
      g.strokeStyle = 'rgba(150,116,80,0.3)';
      g.lineWidth = 1.4;
      for (let row = 0; row <= 6; row++) {
        g.beginPath();
        g.moveTo(0, row * (H / 6));
        g.lineTo(W, row * (H / 6));
        g.stroke();
      }
    }, [5, 5]);
    return TEX.floor;
  }

  function sandTex() {
    if (TEX.sand) return TEX.sand;
    TEX.sand = tex(256, 256, function (g, W, H) {
      const r = rng(9182);
      g.fillStyle = '#e6cd9d';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 2200; i++) {
        g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,246,220' : '196,170,124') + ',' + (0.25 + r() * 0.4) + ')';
        g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
      }
    }, [3, 3]);
    return TEX.sand;
  }

  /* 跳格子：透明底 + 粉笔格子和数字（1~8） */
  function hopTex() {
    if (TEX.hop) return TEX.hop;
    TEX.hop = tex(256, 704, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,253,244,0.92)';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const pad = 24;
      const inner = W - pad * 2;
      const cw = inner / 2;
      // 1 → 2/3 → 4 → 5/6 → 7 → 8
      const rows = [[1], [2, 3], [4], [5, 6], [7], [8]];
      const rowH = (H - pad * 2) / rows.length;
      rows.forEach(function (cells, ri) {
        const y = pad + ri * rowH;
        for (let c = 0; c < cells.length; c++) {
          const x = cells.length === 1 ? pad : pad + c * cw;
          const w = cells.length === 1 ? inner : cw;
          g.strokeRect(x + 4, y + 4, w - 8, rowH - 8);
        }
      });
      g.fillStyle = 'rgba(255,253,244,0.95)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 56px "Microsoft YaHei", sans-serif';
      rows.forEach(function (cells, ri) {
        const y = pad + ri * rowH + rowH / 2;
        for (let c = 0; c < cells.length; c++) {
          const x = cells.length === 1 ? W / 2 : pad + cw * c + cw / 2;
          g.fillText(String(cells[c]), x, y);
        }
      });
    });
    return TEX.hop;
  }

  /* 门口的牌子：「鲸幼园」 */
  function signTex() {
    if (TEX.sign) return TEX.sign;
    TEX.sign = tex(768, 224, function (g, W, H) {
      const r = rng(41);
      g.fillStyle = '#f6e6c8';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) {
        g.strokeStyle = 'rgba(176,140,92,0.14)';
        g.lineWidth = 1 + r();
        g.beginPath();
        const y = r() * H;
        g.moveTo(0, y);
        g.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 12, W * 0.7, y + (r() - 0.5) * 12, W, y);
        g.stroke();
      }
      g.strokeStyle = '#b4794a';
      g.lineWidth = 12;
      g.strokeRect(10, 10, W - 20, H - 20);
      // 小鲸鱼
      g.fillStyle = '#31506e';
      g.beginPath();
      g.ellipse(112, 118, 52, 34, -0.12, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(158, 100);
      g.lineTo(196, 74);
      g.lineTo(188, 122);
      g.closePath();
      g.fill();
      g.fillStyle = '#f8fbff';
      g.beginPath();
      g.ellipse(96, 128, 34, 18, -0.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b2a3a';
      g.beginPath();
      g.arc(138, 106, 5, 0, Math.PI * 2);
      g.fill();
      // 字
      g.fillStyle = '#8a4b2a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 112px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.fillText('鲸 幼 园', 470, 116);
      g.fillStyle = 'rgba(138,75,42,0.65)';
      g.font = 'bold 34px "Microsoft YaHei", sans-serif';
      g.fillText('· 小 浪 花 班 ·', 470, 186);
    });
    return TEX.sign;
  }

  /* 小朋友的画（蜡笔涂鸦，每次不一样） */
  function drawTex(seed) {
    return tex(512, 384, function (g, W, H) {
      const r = rng(seed);
      g.fillStyle = '#fffdf5';
      g.fillRect(0, 0, W, H);
      const pal = ['#e46a72', '#f6b23c', '#4fa8d8', '#7fc07a', '#a880d0', '#f08fb0', '#54b9a8'];
      const pick = function () { return pal[Math.floor(r() * pal.length)]; };
      // 太阳
      g.strokeStyle = '#f4a33c';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(74 + r() * 40, 66 + r() * 30, 34 + r() * 12, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        g.beginPath();
        g.moveTo(88 + Math.cos(a) * 52, 80 + Math.sin(a) * 52);
        g.lineTo(88 + Math.cos(a) * 68, 80 + Math.sin(a) * 68);
        g.stroke();
      }
      // 一条小鲸鱼
      const wx = 150 + r() * 220, wy = 150 + r() * 120;
      g.fillStyle = pick();
      g.beginPath();
      g.ellipse(wx, wy, 78, 46, (r() - 0.5) * 0.3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(wx + 66, wy - 16);
      g.lineTo(wx + 118, wy - 52);
      g.lineTo(wx + 108, wy + 16);
      g.closePath();
      g.fill();
      g.fillStyle = '#fffdf5';
      g.beginPath();
      g.ellipse(wx - 22, wy + 18, 48, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2a33';
      g.beginPath();
      g.arc(wx + 30, wy - 8, 6, 0, Math.PI * 2);
      g.fill();
      // 房子
      if (r() > 0.35) {
        const hx = 60 + r() * 300, hy = 220 + r() * 80, hw = 70 + r() * 40;
        g.strokeStyle = pick();
        g.lineWidth = 6;
        g.strokeRect(hx, hy, hw, hw * 0.8);
        g.beginPath();
        g.moveTo(hx - 12, hy);
        g.lineTo(hx + hw / 2, hy - hw * 0.6);
        g.lineTo(hx + hw + 12, hy);
        g.closePath();
        g.stroke();
      }
      // 草地 / 波浪线
      g.strokeStyle = pick();
      g.lineWidth = 6;
      g.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const y = H - 34 + Math.sin(x * 0.05 + r()) * 10;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      // 点点
      for (let i = 0; i < 8; i++) {
        g.fillStyle = pick();
        g.beginPath();
        g.arc(r() * W, r() * H, 5 + r() * 9, 0, Math.PI * 2);
        g.fill();
      }
      // 落款
      g.fillStyle = 'rgba(90,110,140,0.85)';
      g.textAlign = 'right';
      g.font = 'bold 34px "Microsoft YaHei", "KaiTi", sans-serif';
      g.fillText('小D', W - 26, H - 24);
    });
  }

  /* 小奖状 */
  function certTex() {
    if (TEX.cert) return TEX.cert;
    TEX.cert = tex(512, 352, function (g, W, H) {
      g.fillStyle = '#fff8e6';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#d9a53c';
      g.lineWidth = 10;
      g.strokeRect(14, 14, W - 28, H - 28);
      g.strokeStyle = 'rgba(217,165,60,0.45)';
      g.lineWidth = 3;
      g.strokeRect(28, 28, W - 56, H - 56);
      g.fillStyle = '#b8552e';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 62px "Microsoft YaHei", "KaiTi", sans-serif';
      g.fillText('小 奖 状', W / 2, 78);
      g.fillStyle = '#5a4a3a';
      g.font = '26px "Microsoft YaHei", sans-serif';
      g.fillText('小D 小朋友：', W / 2, 138);
      g.fillText('今天在鲸幼园玩得开心，', W / 2, 176);
      g.fillText('五朵小红花全都拿到啦！', W / 2, 210);
      g.fillStyle = '#b8552e';
      g.textAlign = 'right';
      g.font = '24px "Microsoft YaHei", sans-serif';
      g.fillText('—— 泡泡老师', W - 34, 262);
      // 红章（挪到左下角，别压着落款）
      g.strokeStyle = 'rgba(214,74,74,0.8)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(96, 272, 38, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(214,74,74,0.85)';
      g.textAlign = 'center';
      g.font = 'bold 25px "Microsoft YaHei", sans-serif';
      g.fillText('鲸幼园', 96, 272);
    });
    return TEX.cert;
  }

  /* ================= 地面 ================= */
  function buildGround() {
    // 草地（整个园区）
    plane(X1 - X0 + 0.4, Z1 - Z0 + 0.4, mapMat(grassTex(), 1), (X0 + X1) / 2, 0, (Z0 + Z1) / 2, root, -Math.PI / 2);
    // 从大门到教室门口的小砖路
    const pathMat = mapMat(brickTex(), 1);
    box(2.6, 0.06, 12.0, pathMat, 228.1, 0.03, 3.2, root);
    // 教室门口那块方砖
    box(3.6, 0.06, 1.5, pathMat, 228.1, 0.03, -2.0, root);
    // 教室地板
    plane(CLS.x1 - CLS.x0, CLS.z1 - CLS.z0, mapMat(floorTex(), 0.8),
      (CLS.x0 + CLS.x1) / 2, 0.02, (CLS.z0 + CLS.z1) / 2, root, -Math.PI / 2);
    // 跳格子（贴在小砖路上）
    const hopMat = new THREE.MeshStandardMaterial({
      map: hopTex(), transparent: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2
    });
    plane(1.7, 4.6, hopMat, 228.1, 0.075, 1.7, root, -Math.PI / 2);
    // 教室门口的脚垫
    box(1.6, 0.04, 0.9, std('#c96f6f', 1), 228.1, 0.075, -2.9, root);
  }

  /* ================= 房子 ================= */
  function buildBuilding() {
    const wallMat = std('#f7efdd', 0.92);
    const inMat = std('#fffaf0', 0.95);
    const skimMat = std('#9ed6c8', 0.85);      // 护墙板
    const roofMat = std('#e08a7c', 0.88);
    const trimMat = std('#fff6e6', 0.8);
    const woodMat = std('#c79563', 0.85);

    const w = CLS.x1 - CLS.x0, d = CLS.z1 - CLS.z0;
    const cx = (CLS.x0 + CLS.x1) / 2, cz = (CLS.z0 + CLS.z1) / 2;
    const TH = 0.22;                            // 墙厚
    const OZ = CLS.z1 + TH;                     // 南墙外表面（挂在墙上的东西都从这儿往外放）

    // 后墙（北） / 东西墙
    box(w + TH * 2, ROOM_H, TH, wallMat, cx, ROOM_H / 2, CLS.z0 - TH / 2, root);
    box(TH, ROOM_H, d + TH, wallMat, CLS.x0 - TH / 2, ROOM_H / 2, cz, root);
    box(TH, ROOM_H, d + TH, wallMat, CLS.x1 + TH / 2, ROOM_H / 2, cz, root);

    // 前墙（南）分三段，中间留门
    const segA = DOOR.x0 - CLS.x0;              // 西段
    const segB = CLS.x1 - DOOR.x1;              // 东段
    box(segA, ROOM_H, TH, wallMat, CLS.x0 + segA / 2, ROOM_H / 2, CLS.z1 + TH / 2, root);
    box(segB, ROOM_H, TH, wallMat, DOOR.x1 + segB / 2, ROOM_H / 2, CLS.z1 + TH / 2, root);
    box(DOOR.x1 - DOOR.x0, ROOM_H - 2.1, TH, wallMat, (DOOR.x0 + DOOR.x1) / 2, 2.1 + (ROOM_H - 2.1) / 2, CLS.z1 + TH / 2, root);

    // 内墙面（浅色）+ 一米高的彩色护墙板
    plane(w, ROOM_H, inMat, cx, ROOM_H / 2, CLS.z0 + 0.01, root);
    plane(w, 0.95, skimMat, cx, 0.475, CLS.z0 + 0.02, root);
    // 南墙里面分两段画（中间是门洞，不能拿一整块盖上去）
    const segL = DOOR.x0 - CLS.x0, segR = CLS.x1 - DOOR.x1;
    plane(segL, ROOM_H, inMat, CLS.x0 + segL / 2, ROOM_H / 2, CLS.z1 - 0.01, root, 0, Math.PI);
    plane(segR, ROOM_H, inMat, DOOR.x1 + segR / 2, ROOM_H / 2, CLS.z1 - 0.01, root, 0, Math.PI);
    plane(segL, 0.95, skimMat, CLS.x0 + segL / 2, 0.475, CLS.z1 - 0.02, root, 0, Math.PI);
    plane(segR, 0.95, skimMat, DOOR.x1 + segR / 2, 0.475, CLS.z1 - 0.02, root, 0, Math.PI);
    plane(d, ROOM_H, inMat, CLS.x0 + 0.01, ROOM_H / 2, cz, root, 0, Math.PI / 2);
    plane(d, ROOM_H, inMat, CLS.x1 - 0.01, ROOM_H / 2, cz, root, 0, -Math.PI / 2);
    plane(d, 0.95, skimMat, CLS.x0 + 0.02, 0.475, cz, root, 0, Math.PI / 2);
    plane(d, 0.95, skimMat, CLS.x1 - 0.02, 0.475, cz, root, 0, -Math.PI / 2);

    // 天花板
    plane(w + 0.4, d + 0.4, std('#fdf8ee', 0.95), cx, ROOM_H - 0.02, cz, root, Math.PI / 2);

    // 屋顶：一脊两坡
    const eaveY = ROOM_H + 0.05, ridgeY = ROOM_H + 1.0;
    const ridgeZ = cz;
    const slopeLen = Math.sqrt(Math.pow(d / 2 + 0.35, 2) + Math.pow(ridgeY - eaveY, 2));
    const ang = Math.atan2(ridgeY - eaveY, d / 2 + 0.35);
    const s1 = box(w + 1.2, 0.14, slopeLen, roofMat, cx, (eaveY + ridgeY) / 2, CLS.z1 + 0.18 - (d / 2 + 0.35) / 2, root);
    s1.rotation.x = -ang;
    const s2 = box(w + 1.2, 0.14, slopeLen, roofMat, cx, (eaveY + ridgeY) / 2, CLS.z0 - 0.18 + (d / 2 + 0.35) / 2, root);
    s2.rotation.x = ang;
    // 屋脊 + 檐口
    box(w + 1.3, 0.16, 0.22, trimMat, cx, ridgeY + 0.02, ridgeZ, root);
    box(w + 1.3, 0.12, 0.16, trimMat, cx, eaveY, CLS.z1 + 0.28, root);
    // 烟囱
    box(0.52, 1.1, 0.52, wallMat, CLS.x1 - 1.4, ridgeY + 0.35, cz - 0.9, root);
    box(0.66, 0.12, 0.66, roofMat, CLS.x1 - 1.4, ridgeY + 0.92, cz - 0.9, root);

    // 南墙两扇大窗（左右各一）+ 门两边两个小窗
    [[CLS.x0 + 1.9, 2.2], [CLS.x1 - 1.9, 2.2], [226.2, 1.1], [231.8, 1.1]].forEach(function (p) {
      const wx = p[0], wz = OZ - 0.02;
      const wh = p[1] > 1.5 ? 1.5 : 1.2;
      const ww = p[1];
      box(ww, wh, 0.08, trimMat, wx, 1.75, wz + 0.06, root);
      const glass = new THREE.MeshStandardMaterial({
        color: col('#d6eef8'), roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.42
      });
      plane(ww - 0.2, wh - 0.2, glass, wx, 1.75, wz + 0.11, root);
      // 窗棂
      box(0.07, wh - 0.2, 0.06, trimMat, wx, 1.75, wz + 0.12, root);
      box(ww - 0.2, 0.07, 0.06, trimMat, wx, 1.75, wz + 0.12, root);
      box(ww + 0.16, 0.16, 0.24, trimMat, wx, 0.95, wz + 0.1, root);   // 窗台
    });

    // 门框 + 门（两扇往院里敞着，绕门轴转的）
    box(0.16, 2.2, 0.3, woodMat, DOOR.x0 - 0.06, 1.1, OZ + 0.04, root);
    box(0.16, 2.2, 0.3, woodMat, DOOR.x1 + 0.06, 1.1, OZ + 0.04, root);
    box(DOOR.x1 - DOOR.x0 + 0.4, 0.18, 0.32, woodMat, (DOOR.x0 + DOOR.x1) / 2, 2.22, OZ + 0.04, root);
    const doorMat = std('#d9b57e', 0.8);
    const hingeL = new THREE.Group();
    hingeL.position.set(DOOR.x0 + 0.02, 0, OZ + 0.06);
    hingeL.rotation.y = -1.35;
    root.add(hingeL);
    box(0.86, 2.05, 0.07, doorMat, 0.43, 1.03, 0, hingeL);
    const hingeR = new THREE.Group();
    hingeR.position.set(DOOR.x1 - 0.02, 0, OZ + 0.06);
    hingeR.rotation.y = 1.35;
    root.add(hingeR);
    box(0.86, 2.05, 0.07, doorMat, -0.43, 1.03, 0, hingeR);
    // 门上的小玻璃
    [[hingeL, 0.43], [hingeR, -0.43]].forEach(function (p) {
      const gl = box(0.56, 0.5, 0.03, std('#cfe9f6', 0.2, 0.1), p[1], 1.6, 0.04, p[0]);
      gl.material.transparent = true;
      gl.material.opacity = 0.55;
    });

    // 门上的半圆窗
    const archPts = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * i / 16;
      archPts.push(new THREE.Vector2(Math.cos(a) * 0.62, Math.sin(a) * 0.62));
    }
    const arch = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(archPts)),
      new THREE.MeshStandardMaterial({ color: col('#cfe9f6'), roughness: 0.2, transparent: true, opacity: 0.5 }));
    arch.position.set((DOOR.x0 + DOOR.x1) / 2, 2.55, OZ + 0.08);
    root.add(arch);

    // 门口条纹雨棚（红白）
    const awn = new THREE.Group();
    root.add(awn);
    awn.position.set((DOOR.x0 + DOOR.x1) / 2, 2.48, OZ + 0.02);
    const stripes = 8, sw = 2.6 / stripes;
    for (let i = 0; i < stripes; i++) {
      const p = box(sw, 0.06, 1.05, std(i % 2 ? '#fdfdf8' : '#e06d6d', 0.9),
        -1.3 + sw * (i + 0.5), 0, 0.52, awn);
      p.rotation.x = -0.34;
    }
    // 雨棚下的小挂旗
    for (let i = 0; i < 7; i++) {
      const f = box(0.16, 0.22, 0.02, std(['#f6b23c', '#7fc07a', '#4fa8d8', '#e46a72'][i % 4], 0.9),
        -1.2 + i * 0.4, -0.12, 1.0, awn);
      f.rotation.x = -0.34;
    }

    // 招牌
    plane(2.9, 0.85, mapMat(signTex(), 0.85), (DOOR.x0 + DOOR.x1) / 2, 3.06, OZ + 0.12, root);
    // 招牌的木框
    box(3.06, 0.1, 0.1, woodMat, (DOOR.x0 + DOOR.x1) / 2, 3.5, OZ + 0.1, root);
    box(3.06, 0.1, 0.1, woodMat, (DOOR.x0 + DOOR.x1) / 2, 2.62, OZ + 0.1, root);
    // 招牌两边的"小风车"
    [[CLS.x0 + 0.55, 3.0], [CLS.x1 - 0.55, 3.0]].forEach(function (p) {
      cyl(0.04, 0.04, 0.5, 8, woodMat, p[0], p[1], OZ + 0.06, root);
      const wm = new THREE.Group();
      wm.position.set(p[0], p[1] + 0.3, OZ + 0.1);
      root.add(wm);
      const blade = std(['#f6b23c', '#4fa8d8', '#7fc07a', '#e46a72'][p[0] > cx ? 0 : 1], 0.9);
      for (let i = 0; i < 4; i++) {
        const b = box(0.26, 0.14, 0.02, blade, 0, 0, 0, wm);
        b.position.set(Math.cos(i * Math.PI / 2) * 0.16, Math.sin(i * Math.PI / 2) * 0.16, 0.01);
        b.rotation.z = i * Math.PI / 2;
      }
      frames.windmills.push(wm);
    });

    // 墙上爬的常春藤（几片绿）
    const vine = std('#5f9e58', 0.95);
    for (let i = 0; i < 9; i++) {
      const x = CLS.x0 + 0.5 + i * 0.42;
      ball(0.16 + (i % 3) * 0.04, vine, x, 2.55 + Math.sin(i) * 0.28, OZ + 0.07, root, 1, 0.7, 0.35);
    }
  }

  /* ================= 教室里 ================= */
  function buildClassroom() {
    const woodMat = std('#d8a86e', 0.8);
    const deskMat = std('#f0d5a8', 0.75);
    const chairCols = ['#f6b23c', '#7fc07a', '#4fa8d8', '#e46a72'];

    // 两张矮桌：桌面 + 桌面下的箱体 + 桌腿
    const DESKS = [{ x: 227.4, z: -6.6 }, { x: 231.4, z: -6.6 }];
    DESKS.forEach(function (d) {
      box(2.0, 0.08, 0.86, deskMat, d.x, 0.52, d.z, root);
      box(1.88, 0.1, 0.74, std('#e9c795', 0.85), d.x, 0.44, d.z, root);
      [[-0.85, -0.3], [0.85, -0.3], [-0.85, 0.3], [0.85, 0.3]].forEach(function (p) {
        cyl(0.05, 0.05, 0.5, 8, woodMat, d.x + p[0], 0.25, d.z + p[1], root);
      });
      // 桌上：蜡笔盒 + 纸
      box(0.34, 0.1, 0.2, std('#f6f2e6', 0.9), d.x - 0.5, 0.61, d.z, root);
      for (let i = 0; i < 5; i++) {
        cyl(0.018, 0.02, 0.14, 6, std(chairCols[i % 4], 0.8), d.x - 0.62 + i * 0.055, 0.72, d.z, root);
      }
      // 一张画纸 + 一张「小D」名牌
      plane(0.42, 0.3, std('#fffdf2', 0.95), d.x + 0.2, 0.565, d.z, root, -Math.PI / 2);
      // 小椅子：四面各一把（每把是个小组，转一下靠背就朝外，不会横着飘）
      const seats = [[0, -0.64, 0], [0, 0.64, Math.PI], [-0.76, 0, Math.PI / 2], [0.76, 0, -Math.PI / 2]];
      seats.forEach(function (s, i) {
        const cg = new THREE.Group();
        cg.position.set(d.x + s[0], 0, d.z + s[1]);
        cg.rotation.y = s[2];
        root.add(cg);
        const cm = std(chairCols[(i + (d.x > 229 ? 1 : 0)) % 4], 0.85);
        box(0.38, 0.06, 0.36, cm, 0, 0.31, 0, cg);          // 坐面
        box(0.38, 0.34, 0.06, cm, 0, 0.5, -0.15, cg);       // 靠背（背离桌子那一侧）
        [[-0.14, -0.13], [0.14, -0.13], [-0.14, 0.13], [0.14, 0.13]].forEach(function (l) {
          cyl(0.028, 0.028, 0.3, 6, woodMat, l[0], 0.15, l[1], cg);
        });
      });
    });

    /* --- 画画墙（北墙，右半边）+ 6 个画框 --- */
    const frameMat = std('#b07b4d', 0.8);
    frames.draws = [];
    const FX = [227.3, 228.6, 229.9];
    const FY = [2.28, 1.52];
    let idx = 0;
    FY.forEach(function (fy) {
      FX.forEach(function (fx) {
        box(1.12, 0.7, 0.06, frameMat, fx, fy, -9.35, root);
        plane(1.02, 0.6, std('#fffdf2', 0.95), fx, fy, -9.31, root);
        const art = plane(1.0, 0.58, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
          fx, fy, -9.30, root);
        frames.draws.push({ art: art, x: fx, y: fy, id: idx++ });
      });
    });
    // 画墙上方的小彩旗
    for (let i = 0; i < 9; i++) {
      const f = box(0.18, 0.24, 0.02, std(['#f6b23c', '#7fc07a', '#4fa8d8', '#e46a72'][i % 4], 0.9),
        226.8 + i * 0.45, 2.86 + Math.sin(i) * 0.03, -9.32, root);
      f.rotation.z = Math.PI / 4;
    }

    /* --- 小红花榜（北墙，左半边） --- */
    box(2.5, 1.4, 0.07, std('#a9713f', 0.85), 223.9, 2.15, -9.36, root);
    plane(2.34, 1.26, std('#fdf6e4', 0.95), 223.9, 2.15, -9.32, root);
    // 榜上方的一行字（用小圆点当装饰，字靠 tip 说）
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.position.set(223.02 + i * 0.44, 2.42, -9.28);
      root.add(g);
      const petalMat = std('#d9d2c4', 0.9);
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), petalMat);
        p.position.set(Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0);
        p.scale.set(1, 0.8, 0.55);
        g.add(p);
      }
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), std('#f7d97a', 0.85));
      heart.position.z = 0.04;
      g.add(heart);
      petals.push({ g: g, petalMat: petalMat, on: false, pop: 0 });
    }
    frames.petals = petals;
    // 小奖状（集满五朵才出现）
    const cert = plane(1.1, 0.76, mapMat(certTex(), 0.9), 223.9, 1.82, -9.27, root);
    cert.visible = false;
    frames.cert = cert;
    // 榜下面挂的小铃铛
    for (let i = 0; i < 4; i++) {
      cyl(0.01, 0.01, 0.3, 5, std('#c9a06a'), 222.9 + i * 0.62, 1.2, -9.3, root);
      ball(0.07, std('#f2c94c', 0.5, 0.4), 222.9 + i * 0.62, 1.02, -9.3, root);
    }

    /* --- 积木角（东北角）：地毯 + 一堆积木 --- */
    plane(2.6, 2.2, std('#b8dff0', 1), 234.4, 0.03, -8.2, root, -Math.PI / 2);
    const bcols = ['#f6b23c', '#7fc07a', '#4fa8d8', '#e46a72', '#a880d0'];
    const blocks = new THREE.Group();
    blocks.position.set(234.4, 0.06, -8.2);
    root.add(blocks);
    for (let i = 0; i < 9; i++) {
      const s = 0.22 + (i % 3) * 0.02;
      const b = box(s, s, s, std(bcols[i % 5], 0.85),
        (i % 3 - 1) * 0.3 + (i > 5 ? 0.1 : 0), s / 2 + (i > 5 ? s : 0), ((i / 3) | 0) * 0.34 - 0.34, blocks);
      b.rotation.y = (i % 4) * 0.2;
    }
    frames.blocks = blocks;

    /* --- 绘本角（西北角）：书架 + 圆地毯 + 坐垫 --- */
    const shelf = new THREE.Group();
    shelf.position.set(222.35, 0, -8.3);
    shelf.rotation.y = Math.PI / 2;
    root.add(shelf);
    const shelfMat = std('#c98f5a', 0.82);
    box(1.9, 0.06, 0.42, shelfMat, 0, 1.34, 0, shelf);
    box(1.9, 0.06, 0.42, shelfMat, 0, 0.72, 0, shelf);
    box(1.9, 0.06, 0.42, shelfMat, 0, 0.1, 0, shelf);
    box(0.08, 1.42, 0.42, shelfMat, -0.93, 0.71, 0, shelf);
    box(0.08, 1.42, 0.42, shelfMat, 0.93, 0.71, 0, shelf);
    box(1.9, 0.9, 0.05, std('#b57b45', 0.9), 0, 0.95, -0.2, shelf);
    // 一摞绘本（躺着/立着混着放）
    for (let i = 0; i < 7; i++) {
      const bm = std(bcols[i % 4], 0.88);
      const bk = box(0.24, 0.3, 0.18, bm, -0.72 + i * 0.24, 1.54, 0.02, shelf);
      bk.rotation.z = (i % 3 === 0) ? 0.18 : 0;
    }
    for (let i = 0; i < 5; i++) {
      box(0.2, 0.26, 0.16, std(bcols[(i + 2) % 4], 0.88), -0.6 + i * 0.28, 0.91, 0.02, shelf);
    }
    // 圆地毯 + 三个坐垫
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), std('#f7cf8a', 1));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(223.9, 0.035, -7.2);
    rug.receiveShadow = true;
    root.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.98, 28), std('#e46a72', 1));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(223.9, 0.042, -7.2);
    root.add(rug2);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + 0.4;
      const c = cyl(0.26, 0.24, 0.1, 16, std(bcols[(i + 1) % 4], 0.9),
        223.9 + Math.cos(a) * 0.72, 0.09, -7.2 + Math.sin(a) * 0.72, root);
      c.castShadow = false;
    }

    /* --- 四张小床（南墙东半边，靠墙一排） --- */
    const bedFrame = std('#c99a68', 0.85);
    const sheet = std('#cfe6f2', 0.95);
    for (let i = 0; i < 4; i++) {
      const bx = 232.6 + i * 0.95, bz = -3.45;
      box(0.86, 0.22, 1.5, bedFrame, bx, 0.13, bz, root);
      box(0.8, 0.12, 1.42, sheet, bx, 0.3, bz, root);
      box(0.5, 0.12, 0.3, std('#fdfdfa', 0.95), bx, 0.38, bz - 0.52, root);   // 枕头
      const blanket = box(0.8, 0.1, 0.7, std(bcols[(i + 2) % 4], 0.95), bx, 0.36, bz + 0.32, root);
      blanket.rotation.x = 0.02;
      // 床头的小挂饰
      ball(0.09, std(bcols[i % 4], 0.7), bx, 0.62, bz - 0.66, root);
    }

    /* --- 洗手池（西墙靠门） --- */
    box(0.62, 0.72, 1.1, std('#f0f4f6', 0.4, 0.1), 221.95, 0.36, -3.5, root);
    box(0.56, 0.1, 1.0, std('#e8eef2', 0.3), 221.95, 0.76, -3.5, root);
    // 两个水龙头 + 镜子
    [0.35, -0.35].forEach(function (dz) {
      cyl(0.03, 0.03, 0.26, 8, std('#b9c4cc', 0.3, 0.7), 222.05, 0.92, -3.5 + dz, root);
      const spout = box(0.16, 0.04, 0.04, std('#b9c4cc', 0.3, 0.7), 222.13, 1.04, -3.5 + dz, root);
      spout.rotation.y = Math.PI / 2;
    });
    plane(0.9, 0.7, std('#dbe9f2', 0.15, 0.2), 221.68, 1.55, -3.5, root, 0, Math.PI / 2);
    // 毛巾
    box(0.06, 0.34, 0.22, std('#f7a8b8', 0.95), 221.7, 1.05, -2.95, root);

    /* --- 东墙：一人一格的小柜子 + 挂钟 --- */
    const cub = new THREE.Group();
    cub.position.set(236.0, 0, -5.5);
    root.add(cub);
    const cubMat = std('#e0bd93', 0.82);
    box(0.44, 0.98, 1.92, cubMat, 0, 0.49, 0, cub);                 // 柜体
    box(0.5, 0.06, 1.98, std('#d8b287', 0.8), 0, 1.01, 0, cub);     // 台面
    // 四个格子：西面（对着教室）凹进去
    for (let i = 0; i < 4; i++) {
      const cz = -0.72 + i * 0.48;
      box(0.03, 0.52, 0.4, std('#b98a5a', 0.9), -0.215, 0.58, cz, cub);   // 格子底
      box(0.1, 0.04, 0.42, cubMat, -0.19, 0.32, cz, cub);                  // 格子下沿
      box(0.1, 0.04, 0.42, cubMat, -0.19, 0.84, cz, cub);                  // 格子顶沿
    }
    // 台面上放的：小皮球 / 蜡笔盒 / 画夹
    ball(0.12, std('#e46a72', 0.85), -0.02, 1.16, -0.55, cub);
    box(0.22, 0.12, 0.3, std('#4fa8d8', 0.9), 0, 1.1, 0.2, cub);
    box(0.26, 0.34, 0.04, std('#f6d06a', 0.9), -0.02, 1.22, 0.62, cub).rotation.x = -0.2;
    // 挂钟
    const clock = new THREE.Group();
    clock.position.set(236.28, 2.42, -5.5);
    clock.rotation.y = -Math.PI / 2;
    root.add(clock);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), std('#fdf8ec', 0.85));
    clock.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.028, 8, 24), std('#c98f5a', 0.6, 0.2));
    clock.add(ring);
    box(0.02, 0.16, 0.01, std('#4a4550', 0.7), 0, 0.06, 0.015, clock);
    const hand = box(0.02, 0.11, 0.01, std('#4a4550', 0.7), 0, 0, 0.015, clock);
    hand.rotation.z = -0.9;
    hand.position.set(Math.sin(-0.9) * 0.05, Math.cos(-0.9) * 0.05, 0.015);

    /* --- 吊灯（三个纸灯笼） --- */
    frames.lamps = [];
    const lampCols = ['#f7d38a', '#f3a9a0', '#a8d8cf'];
    [[224.6, -6.1], [228.6, -6.1], [232.6, -6.1]].forEach(function (p, i) {
      const g = new THREE.Group();
      g.position.set(p[0], ROOM_H - 0.02, p[1]);
      root.add(g);
      cyl(0.012, 0.012, 0.42, 6, std('#7a6a58'), 0, -0.21, 0, g);
      cyl(0.25, 0.29, 0.38, 14, std(lampCols[i], 0.95), 0, -0.62, 0, g);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
      bulb.position.set(0, -0.79, 0);
      g.add(bulb);
      frames.lamps.push(g);
    });
  }

  /* ================= 家里的《上学日记》（M82.2） =================
   * 妈妈：「家里玩法丰富会出现小D上学日记。你只有周三会上课」
   * → 只有周三真的上过课（拿了小红花 / 玩了东西），回家书桌上才会摆出这本日记；
   *   点一下翻一页，翻完一圈又回到第一页。
   * 这本日记挂在 scene 上（不是幼儿园的 root），因为要在"家里"露出来。 */
  let diaryPage = 0;
  const DIARY_SPOT = { x: -3.26, y: 0.752, z: -2.88 };   // 书桌左前角（桌面 y≈0.745）

  function buildDiary() {
    const g = new THREE.Group();
    g.position.set(DIARY_SPOT.x, DIARY_SPOT.y, DIARY_SPOT.z);
    g.rotation.y = 0.3;
    g.visible = false;
    scene.add(g);
    frames.diary = g;
    // 封面（深青）+ 内页（米白）+ 书脊 + 小书签
    box(0.26, 0.035, 0.34, std('#2f5a63', 0.85), 0, 0.018, 0, g);
    box(0.24, 0.028, 0.32, std('#f7efd9', 0.95), 0, 0.006, 0, g);
    box(0.03, 0.04, 0.34, std('#24464d', 0.9), -0.115, 0.02, 0, g);
    box(0.05, 0.004, 0.2, std('#e46a72', 0.9), 0.06, 0.042, 0.02, g);   // 红书签
    // 封面上的小鲸鱼贴纸
    ball(0.045, std('#f2d06a', 0.6), 0.02, 0.05, 0.02, g, 1, 0.7, 1);
    // 一支笔
    const pen = box(0.018, 0.018, 0.26, std('#4fa8d8', 0.7), 0.2, 0.012, 0.06, g);
    pen.rotation.y = 0.4;
  }

  function diaryPages() {
    const d = new Date();
    const wd = FORCE_WED ? '周三' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    const n = nFlowers();
    const pages = [];
    pages.push('《小D的上学日记》　' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + wd);
    pages.push('今天有课！我背着小书包去鲸幼园，泡泡老师在门口等我。');
    pages.push(n >= ACTS.length
      ? '五件事全做完了 —— 滑梯、秋千、沙坑、跳格子、画画，五朵小红花都拿到啦 🌺'
      : '今天拿到了 ' + n + ' 朵小红花 🌺　（滑梯 / 秋千 / 沙坑 / 跳格子 / 画画）');
    if (nPaints() > 0) pages.push('画了 ' + nPaints() + ' 张画，都挂在教室墙上了，是我自己画的。');
    if (dug) pages.push('沙坑里挖到一枚小贝壳 🐚，还堆了一个沙子城堡 🏰');
    if (diploma) pages.push('泡泡老师发了小奖状，贴在墙上，回家要讲给妈妈听 🏅');
    pages.push('团团、跳跳、啾啾是我的同学，今天一起玩了。明天也想去。');
    return pages;
  }

  function homeTick(venue) {
    if (!frames || !frames.diary) return;
    const show = (venue === 'home') && diaryReady();
    if (frames.diary.visible !== show) {
      frames.diary.visible = show;
      if (show) diaryPage = 0;
    }
  }

  /* ================= 院子 ================= */
  function buildYard() {
    /* --- 沙坑（西） --- */
    const sand = new THREE.Mesh(new THREE.CircleGeometry(1.55, 26), mapMat(sandTex(), 1));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(222.9, 0.05, 1.4);
    sand.receiveShadow = true;
    root.add(sand);
    const borderMat = std('#b98a5a', 0.85);
    // 木边（四段）
    [[0, -1.62, 3.4, 0.16], [0, 1.62, 3.4, 0.16], [-1.62, 0, 0.16, 3.4], [1.62, 0, 0.16, 3.4]].forEach(function (b) {
      box(b[2], 0.2, b[3], borderMat, 222.9 + b[0], 0.1, 1.4 + b[1], root);
    });
    // 小铲子 + 小桶
    const shovel = new THREE.Group();
    shovel.position.set(222.35, 0.1, 2.05);
    shovel.rotation.z = 0.5;
    root.add(shovel);
    cyl(0.03, 0.03, 0.5, 6, std('#e46a72', 0.8), 0, 0.25, 0, shovel);
    box(0.16, 0.04, 0.2, std('#7fc07a', 0.7), 0, 0.02, 0, shovel);
    box(0.34, 0.3, 0.34, std('#4fa8d8', 0.85), 223.5, 0.15, 2.3, root);
    // 沙坑里的小贝壳（挖出来才出现）
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), std('#fff1e0', 0.5));
    shell.scale.set(1, 0.5, 1.1);
    shell.position.set(222.6, 0.14, 1.0);
    shell.visible = false;
    root.add(shell);
    frames.shell = shell;

    /* --- 沙坑里堆起来的城堡（一层一层加，挖一次长一层） --- */
    frames.castle = [];
    for (let i = 0; i < 3; i++) {
      const cg = new THREE.Group();
      cg.position.set(222.55, 0.05 + i * 0.2, 1.05);
      cg.visible = false;
      root.add(cg);
      const w = 0.54 - i * 0.12;
      box(w, 0.19, w, std(i % 2 ? '#d3b074' : '#c9a464', 1), 0, 0.095, 0, cg);
      // 湿沙的边（跟干沙区分开，不然整个看不见）
      box(w + 0.04, 0.04, w + 0.04, std('#b8935a', 1), 0, 0.02, 0, cg);
      // 塔尖小旗
      if (i === 2) {
        cyl(0.012, 0.012, 0.26, 5, std('#a9743f'), 0, 0.32, 0, cg);
        box(0.14, 0.1, 0.01, std('#e46a72', 0.9), 0.07, 0.4, 0, cg);
      }
      frames.castle.push(cg);
    }

    /* --- 跷跷板（中偏西） --- */
    const ss = new THREE.Group();
    ss.position.set(226.2, 0, 2.0);
    root.add(ss);
    box(0.3, 0.34, 0.62, std('#b98a5a', 0.85), 0, 0.17, 0, ss);
    const plank = new THREE.Group();
    plank.position.set(0, 0.36, 0);
    ss.add(plank);
    box(2.4, 0.08, 0.3, std('#f6b23c', 0.8), 0, 0, 0, plank);
    box(0.5, 0.06, 0.32, std('#e46a72', 0.8), 0.95, 0.02, 0, plank);
    box(0.5, 0.06, 0.32, std('#7fc07a', 0.8), -0.95, 0.02, 0, plank);
    // 两端的小把手
    cyl(0.03, 0.03, 0.28, 6, std('#7a6a58'), 0.95, 0.16, 0, plank);
    cyl(0.03, 0.03, 0.28, 6, std('#7a6a58'), -0.95, 0.16, 0, plank);
    frames.seesaw = plank;

    /* --- 秋千（东，靠北） --- */
    const sw = new THREE.Group();
    sw.position.set(232.2, 0, 1.2);
    root.add(sw);
    const postMat = std('#c98f5a', 0.85);
    [[-1.1, 0], [1.1, 0]].forEach(function (p) {
      const a = box(0.1, 2.5, 0.1, postMat, p[0] - 0.28, 1.25, p[1], sw);
      a.rotation.z = 0.22;
      const b = box(0.1, 2.5, 0.1, postMat, p[0] + 0.28, 1.25, p[1], sw);
      b.rotation.z = -0.22;
      box(0.7, 0.08, 0.1, postMat, p[0], 2.34, p[1], sw);
    });
    box(2.4, 0.1, 0.12, postMat, 0, 2.4, 0, sw);
    frames.swingSeats = [];
    [-0.55, 0.55].forEach(function (dx, i) {
      const pivot = new THREE.Group();
      pivot.position.set(dx, 2.36, 0);
      sw.add(pivot);
      cyl(0.012, 0.012, 1.5, 5, std('#8c7256'), -0.22, -0.75, 0, pivot);
      cyl(0.012, 0.012, 1.5, 5, std('#8c7256'), 0.22, -0.75, 0, pivot);
      box(0.52, 0.06, 0.26, std(i ? '#e46a72' : '#4fa8d8', 0.85), 0, -1.5, 0, pivot);
      frames.swingSeats.push(pivot);
    });

    /* --- 滑梯（东，靠中） --- */
    const sl = new THREE.Group();
    sl.position.set(234.9, 0, 2.9);
    root.add(sl);
    const slBlue = std('#7fc4e8', 0.7);
    const slYellow = std('#f6d06a', 0.75);
    // 三级台阶
    for (let i = 0; i < 3; i++) {
      box(0.8, 0.16, 0.4, slYellow, 0, 0.4 + i * 0.4, 1.3 + i * 0.42, sl);
      box(0.06, 0.4, 0.06, slBlue, -0.36, 0.6 + i * 0.2, 1.3 + i * 0.42, sl);
      box(0.06, 0.4, 0.06, slBlue, 0.36, 0.6 + i * 0.2, 1.3 + i * 0.42, sl);
    }
    // 平台
    box(0.92, 0.1, 0.92, slYellow, 0, 1.36, 0.42, sl);
    [[-0.42, 0], [0.42, 0]].forEach(function (p) {
      box(0.07, 1.34, 0.07, slBlue, p[0], 0.68, 0.86, sl);
      box(0.07, 1.34, 0.07, slBlue, p[0], 0.68, -0.02, sl);
    });
    // 护栏
    box(0.07, 0.7, 0.07, slBlue, -0.42, 1.75, 0.86, sl);
    box(0.07, 0.7, 0.07, slBlue, 0.42, 1.75, 0.86, sl);
    box(0.92, 0.07, 0.07, slBlue, 0, 2.05, 0.86, sl);
    // 滑道（朝 -z 往下）
    const slide = box(0.72, 0.08, 1.9, std('#8fd0e8', 0.35, 0.15), 0, 0.86, -0.58, sl);
    slide.rotation.x = -0.63;
    box(0.1, 0.34, 1.9, slYellow, -0.36, 0.98, -0.58, sl).rotation.x = -0.63;
    box(0.1, 0.34, 1.9, slYellow, 0.36, 0.98, -0.58, sl).rotation.x = -0.63;
    // 平台上的小旗
    cyl(0.02, 0.02, 0.5, 5, std('#b98a5a'), 0.36, 2.6, 0.86, sl);
    const flag = box(0.26, 0.16, 0.02, std('#e46a72', 0.9), 0.5, 2.72, 0.86, sl);

    /* --- 小三轮车（东南，自己转圈玩） --- */
    const trike = new THREE.Group();
    trike.position.set(232.0, 0, 6.6);
    root.add(trike);
    frames.trike = trike;
    const red = std('#e2604f', 0.7);
    const tire = std('#3b3b44', 0.9);
    [[0.42, 0.22], [-0.42, 0.22]].forEach(function (p) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(p[1], 0.055, 8, 16), tire);
      w.position.set(p[0], p[1], 0);
      w.rotation.y = Math.PI / 2;
      w.castShadow = true;
      trike.add(w);
    });
    box(0.8, 0.1, 0.1, red, 0, 0.34, 0, trike);
    box(0.34, 0.08, 0.24, red, -0.1, 0.42, 0, trike);
    cyl(0.03, 0.03, 0.36, 6, std('#c9c9d2', 0.4, 0.6), 0.36, 0.5, 0, trike);
    box(0.06, 0.05, 0.4, std('#c9c9d2', 0.4, 0.6), 0.36, 0.68, 0, trike);
    box(0.26, 0.18, 0.22, std('#f6b23c', 0.8), 0.5, 0.35, 0, trike);   // 车筐

    /* --- 风车（南偏西） --- */
    cyl(0.035, 0.035, 1.5, 6, std('#c98f5a'), 225.6, 0.75, 6.7, root);
    const wm = new THREE.Group();
    wm.position.set(225.6, 1.52, 6.7);
    root.add(wm);
    const wmCols = ['#f6b23c', '#7fc07a', '#4fa8d8', '#e46a72'];
    for (let i = 0; i < 4; i++) {
      const b = box(0.34, 0.18, 0.02, std(wmCols[i], 0.9), 0, 0, 0, wm);
      const a = i * Math.PI / 2 + 0.3;
      b.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0);
      b.rotation.z = a;
    }
    frames.windmill = wm;

    /* --- 栅栏（西 / 东 / 南，北边是房子） --- */
    const fenceMat = std('#e8d5b4', 0.9);
    function fenceRun(x0, z0, x1, z1) {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.sqrt(dx * dx + dz * dz);
      const n = Math.max(2, Math.round(len / 1.5));
      const along = Math.abs(dx) > Math.abs(dz);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        box(0.12, 1.0, 0.12, fenceMat, x0 + dx * k, 0.5, z0 + dz * k, root);
        // 圆头
        ball(0.075, fenceMat, x0 + dx * k, 1.02, z0 + dz * k, root);
      }
      // 两道横杆
      [0.42, 0.76].forEach(function (hy) {
        box(along ? len : 0.07, 0.08, along ? 0.07 : len, fenceMat,
          (x0 + x1) / 2, hy, (z0 + z1) / 2, root);
      });
    }
    fenceRun(YARD.x0, YARD.z0, YARD.x0, GATE.z);
    fenceRun(YARD.x1, YARD.z0, YARD.x1, GATE.z);
    fenceRun(YARD.x0, GATE.z, GATE.x0, GATE.z);
    fenceRun(GATE.x1, GATE.z, YARD.x1, GATE.z);

    /* --- 大门（两扇开着的木门 + 小拱） --- */
    const gateMat = std('#bf8a54', 0.85);
    box(0.18, 1.9, 0.18, gateMat, GATE.x0 - 0.1, 0.95, GATE.z, root);
    box(0.18, 1.9, 0.18, gateMat, GATE.x1 + 0.1, 0.95, GATE.z, root);
    box(GATE.x1 - GATE.x0 + 0.5, 0.16, 0.2, gateMat, (GATE.x0 + GATE.x1) / 2, 1.94, GATE.z, root);
    const gd1 = box(0.82, 1.55, 0.07, gateMat, GATE.x0 - 0.45, 0.78, GATE.z + 0.06, root);
    const gd2 = box(0.82, 1.55, 0.07, gateMat, GATE.x1 + 0.45, 0.78, GATE.z + 0.06, root);
    // 门上的木条
    for (let i = 0; i < 3; i++) {
      box(0.76, 0.05, 0.03, std('#a9743f', 0.9), GATE.x0 - 0.45, 0.4 + i * 0.42, GATE.z + 0.1, root);
      box(0.76, 0.05, 0.03, std('#a9743f', 0.9), GATE.x1 + 0.45, 0.4 + i * 0.42, GATE.z + 0.1, root);
    }
    // 门框上挂的小牌子
    plane(0.9, 0.26, mapMat(tex(256, 74, function (g, W, H) {
      g.fillStyle = '#f6e6c8';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#b4794a';
      g.lineWidth = 5;
      g.strokeRect(3, 3, W - 6, H - 6);
      g.fillStyle = '#8a4b2a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 40px "Microsoft YaHei", sans-serif';
      g.fillText('小浪花班', W / 2, H / 2 + 1);
    }), 0.9), (GATE.x0 + GATE.x1) / 2, 1.72, GATE.z + 0.12, root);

    /* --- 旗绳（挂在大门口的栅栏上，进门时从头顶过） --- */
    const bunt = new THREE.Group();
    root.add(bunt);
    const bx0 = 221.4, bx1 = 236.6, by = 2.62, bz = 8.86;
    // 两头的木杆
    cyl(0.05, 0.06, 2.7, 8, std('#c98f5a', 0.9), bx0, 1.35, bz, root);
    cyl(0.05, 0.06, 2.7, 8, std('#c98f5a', 0.9), bx1, 1.35, bz, root);
    ball(0.07, std('#f6b23c', 0.7), bx0, 2.74, bz, root);
    ball(0.07, std('#f6b23c', 0.7), bx1, 2.74, bz, root);
    for (let i = 0; i < 22; i++) {
      const k = i / 21;
      const x = bx0 + (bx1 - bx0) * k;
      const y = by - Math.sin(k * Math.PI) * 0.36;
      const f = box(0.2, 0.26, 0.02, std(wmCols[i % 4], 0.9), x, y - 0.13, bz, bunt);
      f.rotation.z = Math.PI / 4 + Math.sin(k * 6) * 0.05;
    }
    frames.bunting = bunt;

    /* --- 树 + 花坛 --- */
    function tree(x, z, s) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      root.add(g);
      cyl(0.12, 0.18, 1.5, 8, std('#8a6242', 0.95), 0, 0.75, 0, g);
      ball(0.72, std('#6fae5c', 0.95), 0, 1.85, 0, g, 1, 0.9, 1);
      ball(0.52, std('#7cbd68', 0.95), -0.42, 1.6, 0.16, g, 1, 0.9, 1);
      ball(0.48, std('#8ecb77', 0.95), 0.4, 1.62, -0.2, g, 1, 0.9, 1);
      // 树上挂的小果子
      for (let i = 0; i < 5; i++) {
        ball(0.065, std('#e46a72', 0.6), -0.5 + i * 0.26, 1.5 + (i % 3) * 0.24, 0.5 - (i % 2) * 0.3, g);
      }
    }
    tree(221.4, -1.7, 1.0);
    tree(236.4, -1.6, 0.9);
    tree(220.4, 7.9, 0.75);

    function bed(x, z, w, d) {
      box(w, 0.26, d, std('#b98a5a', 0.9), x, 0.13, z, root);
      box(w - 0.12, 0.08, d - 0.12, std('#6b4a32', 1), x, 0.28, z, root);
      const r = rng(Math.floor(x * 13 + z * 7));
      const n = Math.max(3, Math.round(w * d * 2.2));
      for (let i = 0; i < n; i++) {
        const fx = x + (r() - 0.5) * (w - 0.3);
        const fz = z + (r() - 0.5) * (d - 0.3);
        const h = 0.18 + r() * 0.18;
        cyl(0.014, 0.014, h, 5, std('#5f9e58', 0.95), fx, 0.28 + h / 2, fz, root);
        ball(0.06 + r() * 0.03, std(['#f7a8b8', '#f6d06a', '#e46a72', '#cba6ff'][i % 4], 0.8),
          fx, 0.28 + h, fz, root);
      }
    }
    bed(221.3, 4.6, 0.8, 2.4);
    bed(236.6, 6.4, 0.8, 2.6);
    bed(225.0, 8.6, 1.2, 0.5);
  }

  /* ================= 泡泡老师 + 小朋友 ================= */
  function buildPeople() {
    const g = new THREE.Group();
    g.position.set(227.3, 0, -1.78);      // 站在门口西侧（正对门洞会把人堵住）
    g.scale.setScalar(1.14);
    root.add(g);                          // 脸是朝 +Z 做的，不用转就是对着院子
    frames.teacher = g;

    const white = std('#fdfaf1', 0.85);
    const belly = std('#e6f2f8', 0.9);
    const dark = std('#3a4150', 0.6);
    const apronMat = std('#7cc8de', 0.9);
    const rim = std('#c98f5a', 0.4, 0.3);

    // 身子：一颗立起来的蛋（奶白小鲸）+ 底下坐稳的那一块
    ball(0.3, white, 0, 0.2, 0, g, 1.15, 0.5, 1.05);
    ball(0.42, white, 0, 0.66, 0, g, 1.0, 1.12, 1.04);
    ball(0.33, belly, 0, 0.58, 0.14, g, 0.95, 1.0, 0.95);
    // 眼睛 + 圆眼镜
    ball(0.042, dark, -0.11, 0.9, 0.365, g);
    ball(0.042, dark, 0.11, 0.9, 0.365, g);
    [-0.11, 0.11].forEach(function (ex) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.012, 6, 14), rim);
      r.position.set(ex, 0.9, 0.40);
      g.add(r);
    });
    box(0.05, 0.012, 0.012, rim, 0, 0.9, 0.40, g);
    // 腮红
    ball(0.055, std('#f7b8be', 0.9), -0.2, 0.79, 0.33, g);
    ball(0.055, std('#f7b8be', 0.9), 0.2, 0.79, 0.33, g);
    // 嘴巴（小小的弧）
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.011, 6, 12, Math.PI), dark);
    mouth.position.set(0, 0.78, 0.39);
    mouth.rotation.z = Math.PI;
    g.add(mouth);
    // 两侧的鳍
    const finL = box(0.06, 0.2, 0.26, white, -0.4, 0.62, 0.02, g);
    finL.rotation.z = 0.55;
    const finR = box(0.06, 0.2, 0.26, white, 0.4, 0.62, 0.02, g);
    finR.rotation.z = -0.55;
    // 小蓝帽
    ball(0.25, std('#7fc4e8', 0.9), 0, 1.14, 0.02, g, 1, 0.46, 1);
    box(0.36, 0.04, 0.22, std('#7fc4e8', 0.9), 0, 1.08, 0.24, g);
    // 围裙（浅蓝，口袋上一条白边）
    box(0.4, 0.46, 0.05, apronMat, 0, 0.5, 0.39, g);
    box(0.3, 0.12, 0.03, std('#f2fbff', 0.9), 0, 0.44, 0.42, g);
    // 抱着的图画书
    const bk = box(0.26, 0.32, 0.06, std('#e46a72', 0.85), 0.34, 0.6, 0.32, g);
    bk.rotation.z = -0.18;
    box(0.22, 0.28, 0.02, std('#fffdf2', 0.95), 0.34, 0.6, 0.36, g).rotation.z = -0.18;

    /* --- 小动物同学（三个不一样的模型，M82.1） --- */
    frames.kidsGroup = new THREE.Group();
    root.add(frames.kidsGroup);
    frames.kids = [];
    loadPets();

    /* --- 小D 自己（点滑梯 / 秋千 / 跷跷板 / 沙坑 / 跳格子 / 三轮车时跑出来演一下） --- */
    if (XD.Workspace && XD.Workspace.miniOrca) {
      const me = XD.Workspace.miniOrca(0.66);
      if (me) {
        me.visible = false;
        me.userData.base = me.scale.x;     // miniOrca 已经把模型缩过了，这里只记下来别再覆盖
        root.add(me);
        frames.me = me;
      }
    }
  }

  /* ================= 小动物：加载 + 站位 + 自己的小日子 ================= */
  /* M82.2：模型下载卡住过一次（手机上尤其容易：CDN 边缘还在同步时，gzip 那条链接会一直挂着），
   * 所以每条都带"超时 → 换一个带 ?r= 的链接再来"的重试，每条只算一次成败。 */
  function loadPets() {
    if (!THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    PET_FILES.forEach(function (n) {
      petsAsked++;
      loadPet(loader, n, 0);
    });
  }
  function loadPet(loader, n, attempt) {
    let done = false;
    const url = 'assets/models/pets/animal-' + n + '.glb' + (attempt ? '?r=' + attempt : '');
    const giveUp = function (why) {
      if (done) return;
      done = true;
      if (attempt < 2) {
        if (window.console) console.warn('[鲸幼园] 小动物模型' + why + '，换条链接再试：', n);
        loadPet(loader, n, attempt + 1);
        return;
      }
      petsLoaded++;
      if (window.console) console.warn('[鲸幼园] 小动物没加载出来：', n, why);
      if (petsLoaded >= petsAsked) buildKids();
    };
    loader.load(url, function (g) {
      if (done) return;
      done = true;
      PETS[n] = { scene: g.scene, clips: g.animations || [] };
      petsLoaded++;
      if (petsLoaded >= petsAsked) buildKids();
    }, undefined, function (e) {
      giveUp((e && e.message) || '下载失败');
    });
    setTimeout(function () { giveUp('超时'); }, 12000 + attempt * 8000);
  }

  function buildKids() {
    if (!frames || frames.kidsBuilt) return;
    frames.kidsBuilt = true;
    KID_SPOTS.forEach(function (spot, i) {
      const src = PETS[spot.pet];
      if (!src) return;
      const info = PET_INFO[spot.pet] || { name: spot.pet, size: 0.8 };
      const g = src.scene.clone(true);
      // 按包围盒缩到目标身高、底面坐地
      const bb = new THREE.Box3().setFromObject(g);
      const sz = new THREE.Vector3();
      bb.getSize(sz);
      const s = info.size / Math.max(0.001, sz.y);
      g.scale.setScalar(s);
      g.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const wrap = new THREE.Group();
      wrap.add(g);
      wrap.position.set(spot.x, 0, spot.z);
      wrap.rotation.y = spot.ry;
      frames.kidsGroup.add(wrap);

      const kid = {
        name: info.name, pet: spot.pet,
        g: wrap, model: g,
        home: { x: spot.x, z: spot.z, ry: spot.ry },
        spot: spot,
        mixer: null, actions: {}, cur: '',
        t: 0.3 + i * 0.7, wait: 1.2 + i * 0.9,
        mode: 'idle', tx: spot.x, tz: spot.z,
        phase: i * 1.7
      };
      if (src.clips && src.clips.length) {
        kid.mixer = new THREE.AnimationMixer(g);
        src.clips.forEach(function (c) {
          kid.actions[c.name] = kid.mixer.clipAction(c);
        });
        playKid(kid, 'idle');
      }
      frames.kids.push(kid);
    });
    // 老朋友（上午没加载出来就先空着，这一帧补上）
    applyPeopleTime();
  }

  function playKid(kid, name) {
    if (!kid || !kid.actions || !kid.actions[name]) return;
    if (kid.cur === name) return;
    const prev = kid.actions[kid.cur];
    if (prev && prev !== kid.actions[name]) {
      try { prev.fadeOut(0.18); } catch (e) { }
    }
    const a = kid.actions[name];
    try {
      a.reset();
      a.fadeIn(0.2);
      a.play();
      if (name === 'dance' || name === 'gesture-positive' || name === 'eat') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      } else {
        a.setLoop(THREE.LoopRepeat, Infinity);
      }
    } catch (e) { }
    kid.cur = name;
  }

  /* 每只小动物自己的小日子：发呆 → 走两步 → 玩一下 → 发呆 */
  function tickKid(kid, dt) {
    kid.t += dt;
    if (kid.mixer) kid.mixer.update(dt);
    // 演一次性动作（dance / eat）的时候就别打断
    if (kid.cur === 'dance' || kid.cur === 'eat' || kid.cur === 'gesture-positive') {
      kid.wait -= dt;
      if (kid.wait > 0) return;
      playKid(kid, 'idle');
      kid.mode = 'idle';
      kid.wait = 1.2 + Math.random() * 1.6;
      return;
    }
    kid.wait -= dt;
    if (kid.mode === 'walk') {
      const dx = kid.tx - kid.g.position.x, dz = kid.tz - kid.g.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.08 || kid.wait < -0.4) {
        kid.mode = 'idle';
        kid.g.position.set(kid.tx, 0, kid.tz);
        playKid(kid, 'idle');
        kid.wait = 1.4 + Math.random() * 2.0;
      } else {
        const sp = Math.min(d, 0.55 * dt + 0.02);
        kid.g.position.x += dx / d * sp;
        kid.g.position.z += dz / d * sp;
        kid.g.rotation.y = Math.atan2(dx, dz);
        playKid(kid, 'walk');
      }
      return;
    }
    if (kid.wait > 0) return;
    // 挑下一件事：多数时候在原地发呆，偶尔走到附近另一个角落
    const r = Math.random();
    if (r < 0.45) {
      playKid(kid, 'dance');
      kid.wait = 1.6;
    } else if (r < 0.62) {
      playKid(kid, 'eat');
      kid.wait = 1.6;
    } else {
      kid.tx = kid.home.x + (Math.random() - 0.5) * 1.2;
      kid.tz = kid.home.z + (Math.random() - 0.5) * 1.2;
      kid.mode = 'walk';
      kid.wait = 2.2;
    }
  }

  /* 谁在这儿玩（点滑梯/秋千的时候让最近的那只一起） */
  function nearestKid(x, z) {
    let best = null, bd = 1e9;
    for (let i = 0; i < frames.kids.length; i++) {
      const k = frames.kids[i];
      const dx = k.g.position.x - x, dz = k.g.position.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = k; }
    }
    return bd < 36 ? best : null;
  }

  function kidCheer(x, z) {
    const k = nearestKid(x, z);
    if (!k) return;
    playKid(k, 'dance');
    k.wait = 2.0;
  }

  /* ---------- 熟悉度：聊过几次 → 到第几级 ---------- */
  function bondLevel(pet) {
    const n = bonds[pet] | 0;
    let lv = 0;
    for (let i = 0; i < BOND_STEPS.length; i++) if (n >= BOND_STEPS[i]) lv = i;
    return lv;
  }
  function bondTitle(pet) {
    return BOND_TITLE[bondLevel(pet)] || BOND_TITLE[0];
  }

  /* 飘起来的几颗小爱心（变成好朋友的时候有、平时偶尔一颗） */
  function heartTex() {
    if (TEX.heart) return TEX.heart;
    TEX.heart = tex(64, 64, function (g, W, H) {
      g.clearRect(0, 0, W, H);
      const cx = W / 2;
      g.beginPath();
      g.moveTo(cx, H * 0.88);
      g.bezierCurveTo(W * 0.02, H * 0.52, W * 0.18, H * 0.06, cx, H * 0.30);
      g.bezierCurveTo(W * 0.82, H * 0.06, W * 0.98, H * 0.52, cx, H * 0.88);
      g.fillStyle = '#ff92a9';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(196,66,96,0.55)';
      g.stroke();
    });
    return TEX.heart;
  }
  function kidHearts(i, n) {
    if (!root || !frames || !frames.kids || !frames.kids[i]) return;
    const cnt = n === 0 ? 0 : (n || 1);
    if (!cnt) return;
    const kid = frames.kids[i];
    const ht = heartTex();
    if (!ht) return;
    frames.hearts = frames.hearts || [];
    if (frames.hearts.length > 24) return;      // 别一下子飘一屏
    const wp = new THREE.Vector3();
    kid.g.getWorldPosition(wp);
    root.worldToLocal(wp);
    for (let j = 0; j < cnt; j++) {
      try {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: ht, transparent: true, depthWrite: false, opacity: 0.96
        }));
        const s = 0.19 + Math.random() * 0.07;
        sp.scale.set(s, s, 1);
        sp.position.set(
          wp.x + (Math.random() - 0.5) * 0.36,
          wp.y + 0.95 + Math.random() * 0.2,
          wp.z + (Math.random() - 0.5) * 0.36
        );
        sp.userData.t = -j * 0.16;
        sp.userData.life = 1.5 + Math.random() * 0.5;
        sp.userData.vy = 0.4 + Math.random() * 0.18;
        sp.visible = false;
        root.add(sp);
        frames.hearts.push(sp);
      } catch (e) { /* 没有 Sprite 就算了，别影响玩 */ }
    }
  }

  /* 一轮把这一级的话都说完再重复（洗成一摞，一张一张抽） */
  function nextLine(kid, pool, lv) {
    if (!kid) return pool[Math.floor(Math.random() * pool.length)];
    kid.bags = kid.bags || {};
    let bag = kid.bags[lv];
    if (!bag || !bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
      // 新一轮的第一句别正好接着上一句
      if (bag.length > 1 && bag[0] === kid.lastSaid) {
        const tmp = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = tmp;
      }
      kid.bags[lv] = bag;
    }
    return bag.shift();
  }

  /* 点一下小动物：聊一句、熟一点；跨过门槛就说那句"升级"的话 + 飘几颗心 */
  function kidTalk(i) {
    const spot = KID_SPOTS[i];
    if (!spot) return '';
    const chat = KID_CHAT[spot.pet];
    if (!chat) return '';
    const info = PET_INFO[spot.pet] || { name: spot.pet, e: '' };
    const kid = frames && frames.kids ? frames.kids[i] : null;
    if (kid) { playKid(kid, 'dance'); kid.wait = 2.4; }

    const before = bondLevel(spot.pet);
    bonds[spot.pet] = (bonds[spot.pet] | 0) + 1;
    const after = bondLevel(spot.pet);
    save();

    let line;
    if (after > before) {
      // 刚变熟：说升级那句，多飘几颗心
      line = chat.up[after - 1] || chat.up[0];
      kidHearts(i, 3);
      if (sfx && sfx.chime) sfx.chime();
    } else {
      const fresh = spot.act && lastPlay.k === spot.act && (t - lastPlay.at) < 90;
      if (fresh) {
        line = chat.hot;
        lastPlay.k = '';        // 这句只接话一次，别一直重复
      } else {
        const pool = chat.lines[after] || chat.lines[0];
        // 别连着说同一句：一轮把这级的话说完再重复，不然点多了就像复读机
        line = nextLine(kid, pool, after);
      }
      kidHearts(i, Math.random() < 0.45 ? 1 : 0);
      if (sfx && sfx.blip) sfx.blip();
    }
    if (kid) kid.lastSaid = line;

    const who = info.name + '：「' + line + '」' + (chat.e || '');
    if (after > before) return who + '　💛 和' + info.name + '成了「' + BOND_TITLE[after] + '」';
    return who;
  }

  /* 人什么时候在：老师白天在 / 同学只有周三白天来（晚上一个人都没有） */
  function applyPeopleTime() {
    if (!frames) return;
    const teacherOk = teacherHere();
    if (frames.teacher) frames.teacher.visible = teacherOk;
    const kidsOk = kidsHere();
    if (frames.kidsGroup) frames.kidsGroup.visible = kidsOk;
    if (frames.kids) {
      for (let i = 0; i < frames.kids.length; i++) {
        const k = frames.kids[i];
        if (!kidsOk && k.mode === 'walk') { k.mode = 'idle'; k.g.position.set(k.home.x, 0, k.home.z); }
      }
    }
  }


  /* ================= 光 ================= */
  function buildLights() {
    const amb = new THREE.AmbientLight(0xfff2df, 0.42);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xcfe7ff, 0xdfe6c8, 0.46);
    root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3dd, 0.9);
    sun.position.set(246, 26, 22);
    sun.target.position.set(229, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 6;
    sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0006;
    root.add(sun);
    root.add(sun.target);
    // 教室里的暖光（三盏灯笼各一盏，免得夜里光从墙里漏到外面太亮）
    const roomLights = [];
    [[224.6, -6.1], [228.6, -6.1], [232.6, -6.1]].forEach(function (p) {
      const l = new THREE.PointLight(0xffd9a2, 0.4, 6.8, 2);
      l.position.set(p[0], 2.45, p[1]);
      root.add(l);
      roomLights.push(l);
    });
    // 门廊下的暖光
    const porch = new THREE.PointLight(0xffcc94, 0.45, 6, 2);
    porch.position.set(228.1, 2.5, -2.1);
    root.add(porch);
    frames.lights = { amb: amb, hemi: hemi, sun: sun, room: roomLights, porch: porch };
  }

  /* ================= 存档 ================= */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        f: Object.keys(flowers), p: paints.slice(), c: diploma ? 1 : 0,
        g: dug ? 1 : 0, k: sandPile,
        b: { panda: bonds.panda | 0, bunny: bonds.bunny | 0, chick: bonds.chick | 0 }
      }));
    } catch (e) { /* 隐私模式下存不了也无所谓 */ }
  }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s) return;
    (s.f || []).forEach(function (k) { if (k) flowers[k] = 1; });
    const p = s.p || [];
    for (let i = 0; i < paints.length; i++) paints[i] = (p[i] | 0) || 0;
    diploma = !!s.c;
    dug = !!s.g;
    sandPile = Math.max(0, Math.min(3, s.k | 0));
    // 和同学熟到哪儿了（老存档没这个字段就当刚认识）
    const b = s.b || {};
    bonds.panda = Math.max(0, b.panda | 0);
    bonds.bunny = Math.max(0, b.bunny | 0);
    bonds.chick = Math.max(0, b.chick | 0);
    // 下次从"第一个空框"开始挂
    paintNext = 0;
    for (let i = 0; i < paints.length; i++) if (!paints[i]) { paintNext = i; break; }
  }

  /* 沙坑城堡堆到第 n 层（挖过才有第一层） */
  function buildCastle(n) {
    if (!frames || !frames.castle) return;
    for (let i = 0; i < frames.castle.length; i++) frames.castle[i].visible = i < n;
  }
  function nPaints() {
    let n = 0;
    for (let i = 0; i < paints.length; i++) if (paints[i]) n++;
    return n;
  }
  function nFlowers() {
    let n = 0;
    for (let i = 0; i < ACTS.length; i++) if (flowers[ACTS[i].k]) n++;
    return n;
  }

  function refreshBoard(pop) {
    if (!frames) return;
    for (let i = 0; i < ACTS.length; i++) {
      const p = frames.petals[i];
      if (!p) continue;
      const on = !!flowers[ACTS[i].k];
      if (on && !p.on) p.pop = 1;
      p.on = on;
      p.petalMat.color.copy(col(on ? '#e8545f' : '#d9d2c4'));
      p.petalMat.emissive = new THREE.Color(on ? 0x3a0b0f : 0x000000);
      p.g.scale.setScalar(on ? 1.12 : 1);
      if (!on) p.pop = 0;
    }
    if (frames.cert) frames.cert.visible = !!diploma;
    // 沙坑里的小贝壳 + 堆起来的城堡
    if (frames.shell) frames.shell.visible = !!dug;
    buildCastle(dug ? 1 + sandPile : 0);
    // 墙上的画
    refreshDrawings();
    if (pop && frames.cert && diploma) frames.cert.scale.setScalar(1.18);
  }

  function refreshDrawings() {
    if (!frames || !frames.draws) return;
    for (let i = 0; i < frames.draws.length; i++) {
      const d = frames.draws[i];
      const seed = paints[i] || 0;
      if (!seed) {
        if (d.art.material.map) {
          d.art.material.map = null;
          d.art.material.color.set(0xfffaf0);
          d.art.material.needsUpdate = true;
        }
        continue;
      }
      if (!paintCache[seed]) paintCache[seed] = drawTex(seed);
      if (d.art.material.map !== paintCache[seed]) {
        d.art.material.map = paintCache[seed];
        d.art.material.color.set(0xffffff);
        d.art.material.needsUpdate = true;
      }
    }
  }

  /* ================= 小红花 ================= */
  function award(k, line) {
    if (flowers[k]) return false;
    if (isWednesday()) studiedToday = true;
    flowers[k] = 1;
    save();
    refreshBoard(true);
    const n = nFlowers();
    if (sfx && sfx.ding) sfx.ding();
    if (n >= ACTS.length && !diploma) {
      diploma = true;
      save();
      refreshBoard(true);
      if (tip) tip('五朵小红花集满啦 🌺 泡泡老师要发奖状了——去点点她', 5400);
    } else if (tip) {
      tip('得到一朵小红花 🌺（' + n + '/' + ACTS.length + '）' + (line || ''), 3600);
    }
    return true;
  }

  /* ================= 小动作 ================= */
  function startAct(name, dur) {
    if (!frames.me) return;
    if (isWednesday()) studiedToday = true;
    act.name = name;
    act.t = 0;
    act.dur = dur;
    lastPlay.k = name;      // 小动物会记住小D刚才玩了什么，下一句话就接这个
    lastPlay.at = t;
    frames.me.visible = true;
  }

  function stepAct(dt) {
    const me = frames.me;
    if (!me) return;
    act.t += dt;
    const p = Math.min(1, act.t / act.dur);
    // miniOrca 返回的 group 自己带了一个归一化缩放，这里只能乘不能覆盖（覆盖过一次 → 小D 变得比滑梯还高）
    const bs = me.userData.base || me.scale.x || 1;
    /* 滑道的真实表面：本地坐标系里板子从 (z 0.42,y 1.36) 斜到 (z -1.35,y 0.30)
     * 把它写成 y(z) 之后，小D 只贴着这条线滑 —— M82 那版是手写两个端点，整个人陷进板子里。 */
    const S_TOP = { z: 3.18, y: 1.40 };     // 屋顶那头的板口
    const S_BOT = { z: 1.62, y: 0.31 };     // 落地那头的板口
    const slideY = function (z) {
      const k = (z - S_BOT.z) / (S_TOP.z - S_BOT.z);
      return S_BOT.y + k * (S_TOP.y - S_BOT.y);
    };
    if (act.name === 'slide') {
      // 先站在平台上（0~0.18），再顺着滑道下去
      const q = p < 0.18 ? 0 : (p - 0.18) / 0.82;
      const e = 1 - Math.pow(1 - q, 2.1);            // 越滑越快
      const z = S_TOP.z - (S_TOP.z - S_BOT.z) * e;
      const y = slideY(z) + 0.04;                    // 坐在板上，不是穿过去
      me.position.set(234.9, y, z);
      me.rotation.y = Math.PI;
      me.rotation.x = q > 0 ? -0.42 : 0;             // 往下滑的时候前倾
      me.scale.setScalar(bs * (1 + Math.sin(Math.min(1, q) * Math.PI) * 0.05));
    } else if (act.name === 'hop') {
      // 跳格子：从下往上跳过 8 格，一格一跳
      const n = 8;
      const i = Math.min(n - 1, Math.floor(p * n));
      const local = p * n - i;
      const zig = [0, -0.38, 0.38, 0, -0.38, 0.38, 0, 0];
      const y = 0.33 + Math.sin(local * Math.PI) * 0.24;
      me.position.set(228.1 + zig[i], y, 3.6 - i * 0.5);
      me.rotation.y = Math.PI;
      me.rotation.x = -0.18 * Math.sin(local * Math.PI);
      me.scale.setScalar(bs);
    } else if (act.name === 'trike') {
      // 骑小三轮车：绕一个半径 1.5 的圈
      const a = p * Math.PI * 2 * 1.6;
      me.position.set(232.0 + Math.cos(a) * 1.5, 0.33, 6.6 + Math.sin(a) * 1.5);
      me.rotation.y = -a + Math.PI / 2;
      me.rotation.x = 0;
      me.scale.setScalar(bs);
      if (frames.trike) {
        frames.trike.position.set(me.position.x, 0, me.position.z);
        frames.trike.rotation.y = -a + Math.PI / 2;
      }
    } else if (act.name === 'sand') {
      // 沙坑：蹲下来挖（一铲一铲），挖完站起来
      const dig = Math.sin(act.t * 9);
      me.position.set(222.55, 0.18 + Math.max(0, dig) * 0.06, 2.55);
      me.rotation.y = -1.9;
      me.rotation.x = 0.28 + Math.max(0, dig) * 0.12;
      me.scale.setScalar(bs * 0.92);
      // 让最近的那只动物也蹲下来一起挖
      const k = nearestKid(223.4, 2.6);
      if (k && p > 0.15 && p < 0.9) playKid(k, 'eat');
    } else if (act.name === 'swing') {
      // 秋千：坐在左边的座位上，跟着座位一起荡
      const pivot = frames.swingSeats && frames.swingSeats[0];
      if (pivot) {
        const th = pivot.rotation.x;
        const px = 232.2 - 0.55, py = 2.36, pz = 1.2;
        me.position.set(px, py - 1.5 * Math.cos(th) + 0.2, pz - 1.5 * Math.sin(th));
        me.rotation.y = Math.PI;
        me.rotation.x = th * 0.55;
        me.scale.setScalar(bs);
      }
    } else if (act.name === 'seesaw') {
      // 跷跷板：坐在东头，跟着板子上下
      const phi = frames.seesaw ? frames.seesaw.rotation.z : 0;
      const bx = 226.2, by = 0.36, bz = 2.0;
      const lx = 0.95, ly = 0.06;
      me.position.set(bx + lx * Math.cos(phi) - ly * Math.sin(phi), by + lx * Math.sin(phi) + ly * Math.cos(phi) + 0.3, bz);
      me.rotation.y = -Math.PI / 2;
      me.rotation.x = 0;
      me.scale.setScalar(bs);
      const k = nearestKid(226.2, 2.0);
      if (k && p > 0.1 && p < 0.95) {
        k.g.position.set(bx - 0.95 * Math.cos(phi), 0.06 + 0.95 * Math.abs(Math.sin(phi)), bz);
        playKid(k, 'idle');
      }
    }
    if (p >= 1) {
      act.name = '';
      if (me) {
        me.visible = false;
        me.rotation.x = 0;
      }
      if (frames.trike) { frames.trike.position.set(232.0, 0, 6.6); frames.trike.rotation.y = 0; }
    }
  }

  /* ================= 每帧 ================= */
  function update(dt, camPos, walking) {
    if (!root || !root.visible) return;
    t += dt;
    const day = getMode() === 'day';
    if (frames.lights) {
      const L = frames.lights;
      L.amb.intensity = day ? 0.42 : 0.10;
      L.hemi.intensity = day ? 0.46 : 0.12;
      L.sun.intensity = day ? 0.9 : 0.10;
      // 教室里那三盏白天暗一点（外面亮），晚上全靠它们
      const rk = day ? 0.5 : 1;
      if (L.room) for (let i = 0; i < L.room.length; i++) L.room[i].intensity = 0.4 * rk;
      L.porch.intensity = day ? 0.18 : 0.6;
    }
    // 秋千（有人玩的时候荡得更高更快）
    if (frames.swingSeats) {
      const amp = 0.42 + swingKick * 0.55;
      const spd = 1.45 + swingKick * 1.1;
      for (let i = 0; i < frames.swingSeats.length; i++) {
        frames.swingSeats[i].rotation.x = Math.sin(t * spd + i * 0.9) * amp;
      }
    }
    // 跷跷板：平时轻轻晃，有人玩的时候一上一下
    if (frames.seesaw) {
      frames.seesaw.rotation.z = Math.sin(t * (0.7 + seesawKick * 1.6)) * (0.09 + seesawKick * 0.34);
    }
    // 风车 / 招牌风车
    if (frames.windmill) frames.windmill.rotation.z += dt * 1.15;
    if (frames.windmills) {
      for (let i = 0; i < frames.windmills.length; i++) {
        frames.windmills[i].rotation.z += dt * (i ? -1.4 : 1.1);
      }
    }
    // 吊灯轻晃
    if (frames.lamps) {
      for (let i = 0; i < frames.lamps.length; i++) {
        frames.lamps[i].rotation.z = Math.sin(t * 0.9 + i * 1.3) * 0.022;
        frames.lamps[i].rotation.x = Math.cos(t * 0.7 + i) * 0.018;
      }
    }
    // 小动物同学：自己的小日子（只有周三白天才出来）
    if (frames.kidsGroup && frames.kidsGroup.visible) {
      for (let i = 0; i < frames.kids.length; i++) {
        const k = frames.kids[i];
        k.g.position.y = 0;
        tickKid(k, dt);
        // 走路时轻轻颠一下（GLB 自己也有 walk 动画，这里给一点点额外的弹性）
        if (k.mode === 'walk') k.g.position.y = Math.abs(Math.sin(t * 7 + k.phase)) * 0.05;
        // 小D 走近了（3.5m 内），没在走路的那只会慢慢转过头看你
        if (k.mode !== 'walk' && camPos) {
          const dx = camPos.x - k.g.position.x, dz = camPos.z - k.g.position.z;
          if (dx * dx + dz * dz < 12.25) {
            let diff = Math.atan2(dx, dz) - k.g.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            k.g.rotation.y += diff * Math.min(1, dt * 2.2);
          }
        }
      }
    }
    // 和同学变熟时飘上来的小爱心
    if (frames.hearts && frames.hearts.length) {      for (let i = frames.hearts.length - 1; i >= 0; i--) {
        const h = frames.hearts[i];
        h.userData.t += dt;
        const q = h.userData.t / h.userData.life;
        if (q < 0) continue;                       // 排队出来的那几颗先等一等
        h.visible = true;
        h.position.y += h.userData.vy * dt;
        h.position.x += Math.sin(h.userData.t * 5.5 + i) * 0.16 * dt;
        h.material.opacity = q < 0.12 ? q / 0.12 : Math.max(0, 1 - Math.pow((q - 0.12) / 0.88, 1.5));
        if (q >= 1) {
          try { root.remove(h); h.material.dispose(); } catch (e) { }
          frames.hearts.splice(i, 1);
        }
      }
    }
    // 老师白天在、晚上回家；同学周三白天在
    if (frames.teacher && frames.teacher.visible !== teacherHere()) frames.teacher.visible = teacherHere();
    if (frames.kidsGroup && frames.kidsGroup.visible !== kidsHere()) applyPeopleTime();

    // 秋千 / 跷跷板的"有人玩"状态：被点时荡得更欢
    swingKick = Math.max(0, swingKick - dt * 0.55);
    seesawKick = Math.max(0, seesawKick - dt * 0.5);
    if (frames.teacher) {
      frames.teacher.position.y = Math.sin(t * 1.1) * 0.012;
    }
    // 小红花弹一下
    if (frames.petals) {
      for (let i = 0; i < frames.petals.length; i++) {
        const p = frames.petals[i];
        if (p.pop > 0) {
          p.pop = Math.max(0, p.pop - dt * 1.6);
          const s = 1.12 + Math.sin((1 - p.pop) * Math.PI) * 0.55 * p.pop;
          p.g.scale.setScalar(s);
        } else if (p.on) {
          p.g.scale.setScalar(1.12 + Math.sin(t * 2.2 + i) * 0.035);
        }
      }
    }
    // 滑梯上小D的动作
    if (act.name) stepAct(dt);

    // 走到大门口（走路模式）= 回家
    if (cool > 0) cool -= dt;
    if (walking && camPos && cool <= 0 && camPos.z > GATE.z - 0.55 &&
      camPos.x > GATE.x0 - 0.4 && camPos.x < GATE.x1 + 0.4) {
      cool = 2.5;
      if (tip) tip('走到大门口啦 🏠 回小手机上点「回家」也行', 2400);
    }
  }

  /* ================= 可点的地方 ================= */
  function register() {
    if (!interact) return;
    /* 每个热区自己的条件分开写（妈妈：「注意各个部分的触发条件」）：
     *   add(o)            只要在幼儿园里就能点（设施本身）
     *   add(o, fn)        再加一层自己的条件（老师白天在 / 同学周三在 / 日记本） */
    function add(o, extraWhen) {
      const base = function () { return !!isSchoolNow(); };
      o.when = extraWhen
        ? function () { return base() && !!extraWhen(); }
        : base;
      return interact.add(o);
    }

    add({
      id: 'school-gate', label: '大门',
      box: [(GATE.x0 + GATE.x1) / 2, 1.1, GATE.z - 0.2, 1.9, 2.1, 0.6],
      anchor: [(GATE.x0 + GATE.x1) / 2, 2.2, GATE.z - 0.3],
      onClick: function () { onDoor('home'); },
      say: '推门出去，回小屋 🏠'
    });

    add({
      id: 'school-slide', label: '滑梯',
      box: [234.9, 1.2, 2.6, 1.5, 2.3, 2.6],
      anchor: [234.9, 2.35, 2.4],
      onClick: function () {
        if (sfx && sfx.slide) sfx.slide();
        startAct('slide', 1.5);
        award('slide', ' 滑梯真好玩！');
      },
      say: '这个滑梯我滑得最快 🛝'
    });

    add({
      id: 'school-swing', label: '秋千',
      box: [232.2, 1.5, 1.2, 2.5, 2.5, 1.5],
      anchor: [232.2, 2.75, 1.2],
      onClick: function () {
        if (sfx && sfx.chime) sfx.chime();
        swingKick = 1;
        startAct('swing', 4.2);
        kidCheer(232.2, 1.2);
        award('swing', ' 荡得高高的！');
        if (tip) tip('我坐上去啦——帮我推一下 🎠（再点一下还能荡）', 3400);
      },
      say: '荡秋千要有人推我一下'
    });

    add({
      id: 'school-sand', label: '沙坑',
      box: [222.9, 0.35, 1.4, 3.3, 0.8, 3.3],
      anchor: [222.9, 0.9, 1.4],
      onClick: function () {
        if (sfx && sfx.crunch) sfx.crunch();
        startAct('sand', 2.0);
        if (!dug) {
          dug = true;
          save();
          if (frames.shell) frames.shell.visible = true;
          buildCastle(1);
          award('sand', ' 还挖到一枚小贝壳 🐚');
          if (tip) tip('挖到一枚小贝壳 🐚 沙子堆成了一个小城堡 🏰', 3600);
        } else {
          sandPile = Math.min(3, sandPile + 1);
          buildCastle(sandPile);
          award('sand', '');
          if (tip) tip(sandPile >= 3 ? '城堡堆到第三层啦，再高要塌了 🏰' : '再加一层！🏰', 3000);
        }
      },
      say: '沙子里有东西——挖挖看'
    });

    add({
      id: 'school-seesaw', label: '跷跷板',
      box: [226.2, 0.75, 2.0, 2.7, 1.0, 0.8],
      anchor: [226.2, 1.25, 2.0],
      onClick: function () {
        if (sfx && sfx.pop) sfx.pop();
        seesawKick = 1;
        startAct('seesaw', 4.0);
        kidCheer(226.2, 2.0);
        if (tip) tip('我坐这头——一上一下，翘起来啦 🎢', 3200);
      },
      say: '跷跷板要两个人玩'
    });

    add({
      id: 'school-hop', label: '跳格子',
      box: [228.1, 0.3, 1.7, 1.8, 0.55, 4.6],
      anchor: [228.1, 0.9, 1.7],
      onClick: function () {
        if (sfx && sfx.step) sfx.step('tile', { vol: 0.2 });
        startAct('hop', 2.2);
        award('hop', ' 1 到 8 一格没踩错！');
      },
      say: '一格一格跳，别踩线'
    });

    add({
      id: 'school-trike', label: '小三轮车',
      box: [232.0, 0.5, 6.6, 1.5, 1.0, 2.0],
      anchor: [232.0, 1.1, 6.6],
      onClick: function () {
        if (sfx && sfx.bell) sfx.bell();
        startAct('trike', 3.4);
        if (tip) tip('叮铃叮铃——绕院子骑一圈 🚲', 3000);
      },
      say: '这辆小三轮车我骑得可溜了'
    });

    add({
      id: 'school-teacher', label: '泡泡老师',
      box: [227.3, 0.85, -1.78, 1.2, 1.8, 1.0],
      anchor: [227.3, 1.95, -1.78],
      onClick: function () {
        const n = nFlowers();
        if (sfx && sfx.blip) sfx.blip();
        if (n >= ACTS.length && diploma) {
          if (tip) tip('泡泡老师摸摸我的头：「小D今天最棒了，奖状贴在墙上啦。」🏅', 5000);
        } else if (n >= ACTS.length) {
          diploma = true;
          studiedToday = true;
          save();
          refreshBoard(true);
          if (tip) tip('泡泡老师发小奖状啦 🏅「小D今天五件事全做完了！」——贴在墙上了', 5600);
        } else if (!isWednesday()) {
          const left = ACTS.filter(function (a) { return !flowers[a.k]; })
            .map(function (a) { return a.e + a.n; }).join(' ');
          if (tip) tip('泡泡老师：「今天不是咱们班的课，周三才发小红花哦」　还差 ' + (ACTS.length - n) + ' 朵', 5200);
        } else {
          const left = ACTS.filter(function (a) { return !flowers[a.k]; })
            .map(function (a) { return a.e + a.n; }).join(' ');
          if (tip) tip('泡泡老师：「还差 ' + (ACTS.length - n) + ' 朵小红花哦」　' + left, 5200);
        }
      },
      say: function () {
        const n = nFlowers();
        if (diploma) return '小D今天五朵小红花全拿到了，真棒 🏅';
        if (n === 0) return isWednesday() ? '今天有课，老师带你去院子里玩' : '今天没咱们班的课，随便玩玩吧';
        return '已经 ' + n + ' 朵小红花啦，还差 ' + (ACTS.length - n) + ' 朵';
      }
    }, teacherHere);

    /* --- 三个小动物同学（只有周三白天在，点它们会聊天、越聊越熟） --- */
    KID_SPOTS.forEach(function (spot, i) {
      const info = PET_INFO[spot.pet];
      const chat = KID_CHAT[spot.pet] || { kind: '动物', e: '' };
      add({
        id: 'school-kid' + i, label: info.name,
        box: [spot.x, 0.5, spot.z, 1.0, 1.1, 1.0],
        anchor: [spot.x, 1.25, spot.z],
        onClick: function () {
          const line = kidTalk(i);
          if (line && tip) tip(line, 4200);
        },
        say: function () {
          return info.name + '（' + chat.kind + '）· ' + bondTitle(spot.pet);
        }
      }, kidsHere);
    });

    add({
      id: 'school-desk', label: '小桌子',
      box: [227.4, 0.8, -6.6, 2.1, 0.8, 1.0],
      anchor: [227.4, 1.2, -6.6],
      onClick: function () {
        if (sfx && sfx.blip) sfx.blip();
        if (tip) tip('桌上贴着我的名字——这学期坐这儿 ✍️', 3000);
      },
      say: '小桌子上有一张我的画纸'
    });
    add({
      id: 'school-desk2', label: '小桌子',
      box: [231.4, 0.8, -6.6, 2.1, 0.8, 1.0],
      anchor: [231.4, 1.2, -6.6],
      onClick: function () {
        if (sfx && sfx.blip) sfx.blip();
        if (tip) tip('这张桌子是给新来的小朋友留的 🐋', 3000);
      },
      say: '这张桌子空着'
    });

    add({
      id: 'school-cubby', label: '小柜子',
      box: [235.8, 0.6, -5.5, 0.72, 1.2, 2.0],
      anchor: [235.8, 1.4, -5.5],
      onClick: function () {
        if (sfx && sfx.lid) sfx.lid();
        if (tip) tip('一人一格的小柜子——我的格子里塞着蜡笔盒和一个球 🧺', 3200);
      },
      say: '我的小格子在这一格'
    });

    add({
      id: 'school-blocks', label: '积木角',
      box: [234.4, 0.55, -8.2, 2.7, 1.1, 2.3],
      anchor: [234.4, 1.2, -8.2],
      onClick: function () {
        if (sfx && sfx.thump) sfx.thump();
        if (frames.blocks) {
          frames.blocks.position.y = 0.06 + Math.random() * 0.12;
          frames.blocks.rotation.y = (Math.random() - 0.5) * 0.4;
        }
        if (tip) tip('搭了一座塔——再高一点就要倒了 🧱', 3200);
      },
      say: '搭积木要一块一块来'
    });

    add({
      id: 'school-books', label: '绘本角',
      box: [222.35, 1.0, -8.3, 0.7, 1.7, 1.9],
      anchor: [222.35, 1.9, -8.3],
      onClick: function () {
        if (sfx && sfx.paper) sfx.paper();
        const lines = [
          '「从前有一只小鲸鱼，它想去看看海面上的星星。」🌊',
          '「小鲸鱼游啊游，遇到了会发光的鱼群。」✨',
          '「后来它发现，自己身上也会发光。」🐋'
        ];
        if (tip) tip('泡泡老师翻开绘本：' + lines[Math.floor(Math.random() * lines.length)], 5000);
      },
      say: '绘本角的小毯子最软了'
    });

    add({
      id: 'school-nap', label: '午睡小床',
      box: [234.0, 0.35, -3.45, 4.2, 0.7, 1.7],
      anchor: [234.0, 1.0, -3.45],
      onClick: function () {
        if (sfx && sfx.pop) sfx.pop();
        if (tip) tip('小床软软的，躺一会儿……（1、2、3，睡着啦）💤', 3600);
      },
      say: '午睡的小床排成一排'
    });

    add({
      id: 'school-sink', label: '洗手池',
      box: [221.9, 0.95, -3.5, 0.7, 1.1, 1.3],
      anchor: [221.9, 1.7, -3.5],
      onClick: function () {
        if (sfx && sfx.waterOn) {
          sfx.waterOn('schooltap', 0.16, 1, new THREE.Vector3(221.9, 0.9, -3.5));
          setTimeout(function () { if (sfx && sfx.waterOff) sfx.waterOff('schooltap'); }, 1500);
        } else if (sfx && sfx.splash) sfx.splash();
        if (tip) tip('饭前要洗手——搓搓搓 🧼', 2800);
      },
      say: '小水池，够得着'
    });

    add({
      id: 'school-draw', label: '画画',
      box: [228.6, 1.9, -9.28, 3.9, 1.6, 0.3],
      anchor: [228.6, 2.9, -9.2],
      onClick: function () {
        // 6 个画框轮着挂：先挂空的，挂满了就换掉最早那张（每次都是新画）
        const slot = paintNext % paints.length;
        paintNext = (slot + 1) % paints.length;
        paints[slot] = 1000 + Math.floor(Math.random() * 99999);
        save();
        refreshDrawings();
        if (sfx && sfx.paper) sfx.paper();
        award('draw', ' 画挂在墙上啦！');
        if (tip) tip('画好一张挂墙上——再点一下还能画新的 🖍️', 3400);
      },
      say: '蜡笔在桌上，墙上能贴我画的画'
    });

    add({
      id: 'school-board', label: '小红花榜',
      box: [223.9, 2.15, -9.28, 2.5, 1.5, 0.3],
      anchor: [223.9, 3.05, -9.2],
      onClick: function () {
        const n = nFlowers();
        if (sfx && sfx.blip) sfx.blip();
        if (diploma) {
          if (tip) tip('小红花榜：五朵全满 🌺🌺🌺🌺🌺 旁边还挂着我的小奖状 🏅', 4200);
        } else {
          if (tip) tip('小红花榜：' + n + '/' + ACTS.length + ' 朵。滑梯、秋千、沙坑、跳格子、画画，做一件给一朵', 5200);
        }
      },
      say: function () { return '小红花榜 ' + nFlowers() + '/' + ACTS.length; }
    });

    /* --- 家里的《上学日记》：条件跟幼儿园那几个分开写（在不在家 + 今天是不是周三 + 上没上课） --- */
    if (interact) {
      interact.add({
        id: 'home-diary', label: '上学日记',
        box: [DIARY_SPOT.x, DIARY_SPOT.y + 0.16, DIARY_SPOT.z, 0.44, 0.34, 0.5],
        anchor: [DIARY_SPOT.x, DIARY_SPOT.y + 0.46, DIARY_SPOT.z],
        prio: 3,          // 压在"书桌"那个大热区上面，不然准星永远显示"书桌"
        when: function () {
          try {
            if (isSchoolNow()) return false;                 // 在幼儿园里就别去点家里的日记
            if (!frames || !frames.diary) return false;
            return frames.diary.visible === true;            // homeTick 已经算好"今天该不该有"
          } catch (e) { return false; }
        },
        onClick: function () {
          const pages = diaryPages();
          if (diaryPage >= pages.length) diaryPage = 0;
          if (sfx && sfx.paper) sfx.paper();
          if (tip) tip(pages[diaryPage] + '　（再点一下翻页）', 6200);
          diaryPage = (diaryPage + 1) % pages.length;
        },
        say: '我的上学日记'
      });
    }
  }

  /* ================= 走动边界 ================= */
  const SOLIDS = [
    // x, z, r
    [227.4, -6.6, 1.15], [231.4, -6.6, 1.15],     // 两张矮桌（连着椅子）
    [234.4, -8.2, 1.35],                          // 积木角
    [222.35, -8.3, 0.6],                          // 书架
    [234.0, -3.45, 1.0],                          // 一排小床
    [235.9, -5.5, 0.6],                           // 小柜子
    [221.9, -3.5, 0.55],                          // 洗手池
    [227.3, -1.78, 0.55],                         // 泡泡老师（站在门西侧，别堵门洞）
    [234.9, 2.9, 1.15],                           // 滑梯
    [232.2, 1.2, 1.2],                            // 秋千架
    [226.2, 2.0, 1.3],                            // 跷跷板
    [232.0, 6.6, 0.95],                           // 三轮车
    [225.6, 6.7, 0.3],                            // 风车
    [221.4, -1.7, 0.45], [236.4, -1.6, 0.42],     // 树
    [221.3, 4.6, 0.5], [236.6, 6.4, 0.5],         // 花坛
    [225.0, 8.6, 0.6]                             // 大门旁的小花坛
  ];

  function inClassroom(x, z) {
    return x > CLS.x0 + 0.36 && x < CLS.x1 - 0.36 && z > CLS.z0 + 0.36 && z < CLS.z1 - 0.1;
  }
  function inYard(x, z) {
    return x > YARD.x0 + 0.36 && x < YARD.x1 - 0.36 && z > CLS.z1 + 0.05 && z < YARD.z1 - 0.4;
  }
  function inDoorway(x, z) {
    return x > DOOR.x0 + 0.35 && x < DOOR.x1 - 0.35 && z > CLS.z1 - 0.75 && z < CLS.z1 + 0.75;
  }
  function walkable(x, z) {
    if (!(inClassroom(x, z) || inYard(x, z) || inDoorway(x, z))) return false;
    for (let i = 0; i < SOLIDS.length; i++) {
      const s = SOLIDS[i];
      const dx = x - s[0], dz = z - s[1];
      if (dx * dx + dz * dz < s[2] * s[2]) return false;
    }
    return true;
  }

  function clamp(x, z, ox, oz) {
    if (ox === undefined) { ox = x; oz = z; }
    // 一轴一轴试：撞墙就只停那一个方向，还能顺着墙根滑
    if (!walkable(x, oz)) x = ox;
    if (!walkable(x, z)) z = oz;
    if (!walkable(x, z)) { x = ox; z = oz; }
    return { x: x, z: z };
  }

  function debug() {
    return {
      flowers: nFlowers(),
      got: Object.keys(flowers),
      draws: nPaints(),
      diploma: !!diploma,
      dug: !!dug,
      castle: dug ? 1 + sandPile : 0,
      act: act.name,
      kids: frames && frames.kids ? frames.kids.map(function (k) { return k.pet; }) : [],
      kidsAnims: frames && frames.kids && frames.kids[0] && frames.kids[0].actions
        ? Object.keys(frames.kids[0].actions).length : 0,
      bonds: { panda: bonds.panda | 0, bunny: bonds.bunny | 0, chick: bonds.chick | 0 },
      levels: { panda: bondLevel('panda'), bunny: bondLevel('bunny'), chick: bondLevel('chick') },
      titles: { panda: bondTitle('panda'), bunny: bondTitle('bunny'), chick: bondTitle('chick') },
      hearts: frames && frames.hearts ? frames.hearts.length : 0,
      lastPlay: lastPlay.k,
      kidsHere: kidsHere(),
      teacherHere: teacherHere(),
      wednesday: isWednesday(),
      day: isDayTime(),
      diary: !!(frames && frames.diary && frames.diary.visible)
    };
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene || null;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    isSchoolNow = o.isSchool || function () { return false; };
    getMode = o.getMode || function () { return 'day'; };
    onDoor = o.onDoor || function () {};
    if (!scene) return fallback();

    frames = { windmills: [], lamps: [], petals: [], draws: [], kids: [], swingSeats: [], hearts: [] };

    root = new THREE.Group();
    root.name = 'school-m82';
    root.visible = false;
    scene.add(root);

    buildLights();
    buildGround();
    buildBuilding();
    buildClassroom();
    buildYard();
    buildPeople();
    buildDiary();

    // 存档：读取后把墙面/沙坑/奖状一次性摆对
    load();
    refreshBoard(false);
    if (frames.cert) frames.cert.scale.setScalar(1);

    register();

    // 调试：?schoolreset=1 清档重来（截图用）；?wed=1 把"今天"当周三（妈妈想看上学日记那天）
    try {
      const q = new URLSearchParams(location.search);
      FORCE_WED = q.has('wed');
      if (q.has('schoolreset')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        for (let k in flowers) delete flowers[k];
        for (let i = 0; i < paints.length; i++) paints[i] = 0;
        paintNext = 0; diploma = false; dug = false; sandPile = 0;
        bonds.panda = 0; bonds.bunny = 0; bonds.chick = 0;
        refreshBoard(false);
      }
    } catch (e) { /* 无所谓 */ }
    applyPeopleTime();

    return {
      root: root,
      setVisible: function (v) {
        if (root) root.visible = !!v;
        if (v) { visitedToday = true; applyPeopleTime(); }
        if (!v && frames && frames.me) { frames.me.visible = false; act.name = ''; }
        if (!v) { cool = 0; }
        // 走的时候把还在飘的小爱心收掉，别攒着
        if (!v && frames && frames.hearts && frames.hearts.length) {
          for (let i = 0; i < frames.hearts.length; i++) {
            try { root.remove(frames.hearts[i]); frames.hearts[i].material.dispose(); } catch (e) { }
          }
          frames.hearts.length = 0;
        }
      },
      update: update,
      clamp: clamp,
      spawn: SPAWN,
      spawnOutside: SPAWN,
      /* 家里那本《上学日记》：只有周三上过课才摆出来（main.js 每帧问一声，很轻） */
      homeTick: function (venue) { homeTick(venue); },
      debug: debug,
      // 试玩/测试用：直接看小红花状态
      state: function () {
        return {
          flowers: nFlowers(), diploma: !!diploma, draws: nPaints(), dug: !!dug,
          castle: dug ? 1 + sandPile : 0, kids: frames && frames.kids ? frames.kids.length : 0,
          kidsHere: kidsHere(), teacherHere: teacherHere(), wednesday: isWednesday(),
          diary: !!(frames && frames.diary && frames.diary.visible)
        };
      }
    };
  }

  function fallback() {
    return {
      root: null,
      setVisible: function () {},
      update: function () {},
      clamp: function (x, z) { return { x: x, z: z }; },
      spawn: SPAWN,
      spawnOutside: SPAWN,
      homeTick: function () {},
      debug: function () { return null; },
      state: function () { return null; }
    };
  }

  return { build: build };
})();
