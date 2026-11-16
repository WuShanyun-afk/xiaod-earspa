/* 小D的赛博小家 · M32 🎡 小鲸鱼水上乐园
 *
 * 妈妈 05:25 点名的那个大件：「我删掉了准备你建好水上乐园，然后给你拍你在游乐园的照片在挂上去呢」
 *
 * 位置：跟便利店一样是"另一个场景"，平时藏着（x 那一带很远，z 在 -46 那块），从家里点「🎡 游乐园」过去。
 * 里面：大泳池（水是真的会晃）+ 从 5 米高的塔上盘下来的滑水道 + 遮阳伞和躺椅 +
 *      卖冰棍的小摊（用便利店赚的零花钱买）+ 喷泉 + 更衣室 + 棕榈树 +
 *      一只胖虎鲸在水里游（点水它会跳出来，点滑水道它会滑下来）
 * 还有个「最佳拍照位」—— 妈妈要在这儿拍我，拍完照片会自己上图墙。
 *
 * 调试：?venue=park（直接站园门口）、?park=1（同上）、?parkff=N（空转 N 秒截图用）、
 *      ?diag=1 里的 park=
 */
window.XD = window.XD || {};

XD.Park = (function () {
  'use strict';

  /* ================= 场地范围 ================= */
  const PX0 = -14.0, PX1 = 20.0, PZ0 = -60.0, PZ1 = -34.0;
  const CX = 2.0, CZ = -47.0;
  const POOL = { x0: -6.0, x1: 6.0, z0: -52.0, z1: -44.0 };
  const POOL_CX = (POOL.x0 + POOL.x1) / 2;      // 0
  const POOL_CZ = (POOL.z0 + POOL.z1) / 2;      // -48
  const SUN = 0.80;                             // 露天太亮，颜色统一压一档
  const WATER_Y = -0.07;
  // M37：南边入口那条通道 —— 篱笆在这里真的留了一个洞，门外还有一小块广场
  const GATE_X0 = -8.7, GATE_X1 = -3.3;
  const PLAZA_Z = -30.6;                        // 门外广场最远能站到这儿

  /* ================= 小工具 ================= */
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function std(hex, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col(hex),
      roughness: rough === undefined ? 0.85 : rough,
      metalness: metal === undefined ? 0 : metal
    });
  }
  function sunStd(hex, rough, metal) {
    const m = std(hex, rough, metal);
    m.color.multiplyScalar(SUN);
    return m;
  }
  function M(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || root).add(m);
    return m;
  }
  function boxMesh(w, h, d, x, y, z, mat, parent) {
    return M(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  function planeMesh(w, h, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x || 0, y || 0, z || 0);
    (parent || root).add(m);
    return m;
  }
  function cylMesh(rt, rb, h, seg, x, y, z, mat, parent) {
    return M(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, parent);
  }
  function makeTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
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
  const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

  /* ================= 模块状态 ================= */
  let root = null, scene = null, interact = null, sfx = null, tip = null, shop = null, photo = null;
  let isParkNow = function () { return false; };
  let getTimeMode = function () { return 'day'; };   // M37：白天/夜里（乐园自己的灯跟着收放）
  let t = 0;
  let frames = {};
  let water = null, waterPos = null, waterBase = null;
  let orca = null;
  let orcaMode = 'swim';        // swim / slide / jump / pose / lie
  let orcaA = 0;                // 游泳相位
  let slideT = -1;              // 滑水道进度
  let plungeT = 0;              // M57.2：冲进水里之后往池子中间滑一段
  const plungeFrom = new THREE.Vector3(), plungeTo = new THREE.Vector3(3.6, WATER_Y + 0.05, -49.2);
  let jumpT = -1;
  let poseT = 0;
  let fountainParts = null;
  let drops = [];
  let rings = [];
  let ballMesh = null, ballVy = 0;
  let popsicle = null;
  let standLight = null;
  let glowT = 0;
  let built = false;

  /* ---------- M34：互动（点水面潜过去 / 点它甩水 / 吃买来的东西 / 玩设施） ---------- */
  let pathQ = null;             // 按路点走的队列 { pts, i, t, from, onDone }
  let eatT = -1;                // 吃东西进度（<0 = 没在吃）
  let eatKind = null;           // coconut / ice / pop / candy / corn / plush / drink
  let eatProp = null;           // 面前漂着的那份吃的
  let eatBites = 0, eatTotal = 4;
  let eatNext = 0;              // 下一口的时间
  let shakeT = -1;              // 甩水
  let floatT = -1;              // 趴在浮圈上
  let petT = -1;                // 被拍一下
  let volleyT = -1;             // 排球飞
  let volleyV = { x: 0, y: 0, z: 0 };
  let volleyHome = null;
  let trailT = 0;               // 游泳尾迹
  let orcaHot = null;           // 跟着小鲸鱼走的那个可点热区
  let bubblesFx = [];           // 水里冒的泡
  let snackSpot = { x: 0.9, z: -50.0 };    // 零食漂着的地方（挑了个旁边的浮圈不挡的角度）
  let lastSayT = 0;

  /* ---------- M36：新设施（会喷的步道 / 水雾拱门 / 跳板跳水） ---------- */
  let walkJets = null;          // 地喷（栈道上一排）
  let walkJetOn = true;         // 开着的时候一浪一浪地喷
  let walkJetTick = 0;
  let mistOn = true;            // 门口的水雾拱门
  let mistSpr = null;           // 雾气的小水珠
  let boardT = -1;              // 跳板跳水的进度

  /* ---------- M56：玩家自己滑滑水道 ----------
   * 妈妈：「水上乐园里，这个水上滑梯，小鲸鱼不能直接通过滑梯滑进水里」。
   * 以前点滑水道只有水池里那只胖虎鲸滑，人只能在旁边看。现在点一下滑水道，
   * 镜头会"跑上塔 → 顺着槽冲下来 → 扑通进水里 → 爬上岸"，这一段镜头由 park 接管。 */
  let camRef = null;            // main 的 camera
  let getWalkFn = null;         // 拿 state.walk（滑完要把 yaw/pitch 写回去，不然镜头会跳回旧方向）
  const ride = { on: false, phase: '', t: 0, frozen: false, from: new THREE.Vector3(), outFrom: new THREE.Vector3() };
  const SLIDE_TX = 11.6, SLIDE_TZ = -55.6, SLIDE_TOP = 4.6;   // 跟 buildSlide 里的塔一致
  // M57 修正：不再另造一只"小D" —— 池子里那只胖虎鲸就是小D本人，滑水道让它本尊去滑。


  /* ================= 材质/贴图 ================= */
  function tileTex() {
    return makeTex(256, 256, function (g, W, H) {
      g.fillStyle = '#efe6d6';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#d8cbb4';
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * W / 4, 0); g.lineTo(i * W / 4, H); g.stroke();
        g.beginPath(); g.moveTo(0, i * H / 4); g.lineTo(W, i * H / 4); g.stroke();
      }
      // 一点点斑点（旧瓷砖）
      for (let i = 0; i < 26; i++) {
        g.fillStyle = 'rgba(190,175,150,0.20)';
        g.beginPath();
        g.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 0, 6.3);
        g.fill();
      }
    }, [7, 7]);
  }

  function pavingTex() {
    return makeTex(256, 256, function (g, W, H) {
      g.fillStyle = '#cfd8cf';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#b3bdb4';
      g.lineWidth = 4;
      for (let i = 0; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * W / 2, 0); g.lineTo(i * W / 2, H); g.stroke();
        g.beginPath(); g.moveTo(0, i * H / 2); g.lineTo(W, i * H / 2); g.stroke();
      }
    }, [9, 8]);
  }

  function waterTex() {
    return makeTex(256, 256, function (g, W, H) {
      g.fillStyle = '#5fc3d8';
      g.fillRect(0, 0, W, H);
      // 水下的光斑
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = 'rgba(255,255,255,' + (0.08 + Math.random() * 0.14) + ')';
        g.lineWidth = 1 + Math.random() * 3;
        g.beginPath();
        const x0 = Math.random() * W, y0 = Math.random() * H;
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + 30, y0 - 18, x0 + 60, y0 + 22, x0 + 92, y0 + 4);
        g.stroke();
      }
    }, [3, 2]);
  }

  function stripeTex(c1, c2) {
    return makeTex(128, 128, function (g, W, H) {
      g.fillStyle = c1;
      g.fillRect(0, 0, W, H);
      g.fillStyle = c2;
      for (let i = 0; i < 4; i++) g.fillRect(i * W / 4, 0, W / 8, H);
    }, [1, 1]);
  }

  function blobTex() {
    return makeTex(128, 128, function (g, W, H) {
      const gd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      gd.addColorStop(0, 'rgba(30,40,45,0.34)');
      gd.addColorStop(0.6, 'rgba(30,40,45,0.16)');
      gd.addColorStop(1, 'rgba(30,40,45,0)');
      g.fillStyle = gd;
      g.fillRect(0, 0, W, H);
    });
  }
  let blobMat = null;
  function blob(x, z, r, y) {
    if (!blobMat) {
      blobMat = new THREE.MeshBasicMaterial({
        map: blobTex(), transparent: true, depthWrite: false, toneMapped: false
      });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), blobMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y === undefined ? 0.02 : y, z);
    m.renderOrder = 2;
    root.add(m);
    return m;
  }

  function signTex(text, sub, bg) {
    return makeTex(512, 256, function (g, W, H) {
      g.fillStyle = bg || '#ffd76a';
      roundRect(g, 6, 6, W - 12, H - 12, 46);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 10;
      roundRect(g, 18, 18, W - 36, H - 36, 38);
      g.stroke();
      g.fillStyle = '#3a5a6a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 74px ' + FONT;
      g.fillText(text, W / 2, H / 2 - (sub ? 22 : 0));
      if (sub) {
        g.font = 'bold 38px ' + FONT;
        g.fillStyle = '#4a6a7a';
        g.fillText(sub, W / 2, H / 2 + 58);
      }
    });
  }

  /* ================= 地面 / 泳池 ================= */
  /* ---------- M37：门外的小广场（从这儿走进园子） ---------- */
  function buildEntrancePlaza() {
    const deckMat = new THREE.MeshStandardMaterial({
      map: pavingTex(), roughness: 0.92, color: col(0xffffff)
    });
    deckMat.color.multiplyScalar(SUN * 0.92);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 4.6), deckMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(-6.0, 0.02, -32.2);
    p.receiveShadow = true;
    root.add(p);
    // 门口立一块「入口请进」的牌子
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.58),
      new THREE.MeshBasicMaterial({ map: signTex('入口', 'ENTRANCE · 请进', '#8fd6ea'), toneMapped: false }));
    sign.position.set(-9.4, 1.42, -31.6);
    sign.rotation.y = 2.86;
    root.add(sign);
    cylMesh(0.05, 0.06, 1.15, 8, -9.4, 0.56, -31.6, sunStd(0xdfd6c4, 0.7), root);
    // 门口两盆绿植
    [[-9.5, -34.2], [-2.5, -34.2]].forEach(function (q) {
      cylMesh(0.32, 0.27, 0.50, 12, q[0], 0.25, q[1], sunStd(0xd8cfbc, 0.85), root);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const lf = M(new THREE.SphereGeometry(0.5, 10, 8), sunStd(0x5f9450, 0.9),
          q[0] + Math.cos(a) * 0.15, 0.58, q[1] + Math.sin(a) * 0.15, root);
        lf.scale.set(0.15, 0.20, 0.05);
        lf.rotation.y = -a;
        lf.rotation.z = 0.3;
      }
    });
    // 广场边上两盏矮灯（夜里给门口一点光）
    [[-9.0, -31.2], [-3.0, -31.2]].forEach(function (q) {
      cylMesh(0.04, 0.05, 0.85, 8, q[0], 0.42, q[1], sunStd(0xdfd6c4, 0.7), root);
      const bulb = M(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe4a8, toneMapped: false }), q[0], 0.92, q[1], root);
      bulb.castShadow = false;
      frames.bulbs.push(bulb);
    });
  }

  function buildGround() {
    // 草地：也得绕着泳池挖洞，不然会从池子中间穿出来（贴在 -0.03 的草坪会盖住水面）
    const grassMat = sunStd(0x7fb264, 0.95);
    function grassSlab(x0, z0, x1, z1) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), grassMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, -0.04, (z0 + z1) / 2);
      m.receiveShadow = true;
      root.add(m);
    }
    const GX0 = PX0 - 24, GX1 = PX1 + 24, GZ0 = PZ0 - 20, GZ1 = PZ1 + 20;
    grassSlab(GX0, POOL.z1, GX1, GZ1);
    grassSlab(GX0, GZ0, GX1, POOL.z0);
    grassSlab(GX0, POOL.z0, POOL.x0, POOL.z1);
    grassSlab(POOL.x1, POOL.z0, GX1, POOL.z1);
    // 铺砖的场子（中间那块）
    const deckMat = new THREE.MeshStandardMaterial({
      map: pavingTex(), roughness: 0.92, color: col(0xffffff)
    });
    deckMat.color.multiplyScalar(SUN * 0.94);
    // 分成 4 块，中间留泳池的洞
    function slab(x0, z0, x1, z1) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), deckMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
      m.receiveShadow = true;
      root.add(m);
    }
    slab(PX0, POOL.z1, PX1, PZ1);
    slab(PX0, PZ0, PX1, POOL.z0);
    slab(PX0, POOL.z0, POOL.x0, POOL.z1);
    slab(POOL.x1, POOL.z0, PX1, POOL.z1);

    // 一圈绿篱（把远处的家和城市挡住，乐园才像个乐园）
    const hedge = sunStd(0x5f9450, 0.95);
    const HH = 2.15, HT = 1.1;
    boxMesh(PX1 - PX0 + 2, HH, HT, CX, HH / 2, PZ0 - 0.4, hedge, root);
    boxMesh(HT, HH, PZ1 - PZ0 + 2, PX0 - 0.4, HH / 2, CZ, hedge, root);
    boxMesh(HT, HH, PZ1 - PZ0 + 2, PX1 + 0.4, HH / 2, CZ, hedge, root);
    // 南边真的留一个门洞（M37：以前是整块封死的，看着有门其实进不去）
    const HX0 = PX0 - 1, HX1 = PX1 + 1;
    boxMesh(GATE_X0 - HX0, HH, HT, (HX0 + GATE_X0) / 2, HH / 2, PZ1 + 0.4, hedge, root);
    boxMesh(HX1 - GATE_X1, HH, HT, (GATE_X1 + HX1) / 2, HH / 2, PZ1 + 0.4, hedge, root);
    // 篱笆顶上的小花点
    for (let i = 0; i < 26; i++) {
      const xx = PX0 + Math.random() * (PX1 - PX0);
      M(new THREE.SphereGeometry(0.10, 8, 6), sunStd(i % 3 ? 0xffd1dc : 0xfff5c8, 0.85),
        xx, HH + 0.02, PZ0 - 0.4 + (Math.random() - 0.5) * 0.5, root);
    }

    // 再往上加一圈"竹篱笆"：把远处的城市挡住，乐园才关得住
    const fenceTex = makeTex(128, 128, function (g, W, H) {
      g.fillStyle = '#c9a06a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#b08a55';
      for (let i = 0; i < 6; i++) g.fillRect(i * W / 6 + 2, 0, W / 14, H);
      g.fillStyle = '#8e6c41';
      for (let i = 0; i <= 6; i++) g.fillRect(i * W / 6 - 1, 0, 3, H);
    }, [10, 1]);
    const fenceMat = new THREE.MeshStandardMaterial({
      map: fenceTex, roughness: 0.9, side: THREE.DoubleSide
    });
    fenceMat.color.multiplyScalar(SUN);
    const FH = 6.20, FZ = 0.06;
    const fN = new THREE.Mesh(new THREE.BoxGeometry(PX1 - PX0 + 2, FH - HH, 0.12), fenceMat);
    fN.position.set(CX, HH + (FH - HH) / 2, PZ0 - 0.4);
    root.add(fN);
    const fW = new THREE.Mesh(new THREE.BoxGeometry(0.12, FH - HH, PZ1 - PZ0 + 2), fenceMat);
    fW.position.set(PX0 - 0.4, HH + (FH - HH) / 2, CZ);
    root.add(fW);
    const fE = new THREE.Mesh(new THREE.BoxGeometry(0.12, FH - HH, PZ1 - PZ0 + 2), fenceMat);
    fE.position.set(PX1 + 0.4, HH + (FH - HH) / 2, CZ);
    root.add(fE);
    const fS = new THREE.Mesh(new THREE.BoxGeometry(GATE_X0 - HX0, FH - HH, 0.12), fenceMat);
    fS.position.set((HX0 + GATE_X0) / 2, HH + (FH - HH) / 2, PZ1 + 0.4);
    root.add(fS);
    const fS2 = new THREE.Mesh(new THREE.BoxGeometry(HX1 - GATE_X1, FH - HH, 0.12), fenceMat);
    fS2.position.set((GATE_X1 + HX1) / 2, HH + (FH - HH) / 2, PZ1 + 0.4);
    root.add(fS2);
    void FZ;
    // 篱笆上的横杆（南边同样断开）
    [HH + 0.3, FH - 0.12].forEach(function (yy) {
      const wood = sunStd(0x9a7a52, 0.85);
      boxMesh(PX1 - PX0 + 2, 0.10, 0.10, CX, yy, PZ0 - 0.5, wood, root);
      boxMesh(GATE_X0 - HX0, 0.10, 0.10, (HX0 + GATE_X0) / 2, yy, PZ1 + 0.5, wood, root);
      boxMesh(HX1 - GATE_X1, 0.10, 0.10, (GATE_X1 + HX1) / 2, yy, PZ1 + 0.5, wood, root);
      boxMesh(0.10, 0.10, PZ1 - PZ0 + 2, PX0 - 0.5, yy, CZ, wood, root);
      boxMesh(0.10, 0.10, PZ1 - PZ0 + 2, PX1 + 0.5, yy, CZ, wood, root);
    });

    // 天空（一个大球罩住，别让外面的黑天漏进来）
    const skyTex = makeTex(64, 512, function (g, W, H) {
      const gd = g.createLinearGradient(0, 0, 0, H);
      gd.addColorStop(0, '#79bde6');
      gd.addColorStop(0.42, '#a8d7ee');
      gd.addColorStop(0.62, '#d3ecf6');
      gd.addColorStop(0.74, '#f0f7f6');
      gd.addColorStop(1, '#fbf3e4');
      g.fillStyle = gd;
      g.fillRect(0, 0, W, H);
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(26, 20, 14),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, toneMapped: false, fog: false }));
    sky.position.set(CX, 0, CZ);
    sky.castShadow = false;
    sky.receiveShadow = false;
    root.add(sky);
    frames.sky = sky;
  }

  function buildPool() {
    const pool = new THREE.Group();
    pool.name = 'park-pool';
    root.add(pool);

    const tile = new THREE.MeshStandardMaterial({
      map: tileTex(), roughness: 0.5, metalness: 0.05
    });
    // 池子里那块瓷砖偏蓝，水面才透得出来"泳池味"
    tile.color.setRGB(0.62, 0.86, 0.95);
    tile.color.multiplyScalar(SUN + 0.12);

    // 池底
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0), tile);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(POOL_CX, -1.55, POOL_CZ);
    floor.receiveShadow = true;
    pool.add(floor);

    // 四壁（薄盒子，往里一点）
    const D = 1.55;
    boxMesh(POOL.x1 - POOL.x0, D, 0.14, POOL_CX, -D / 2, POOL.z1 - 0.07, tile, pool);
    boxMesh(POOL.x1 - POOL.x0, D, 0.14, POOL_CX, -D / 2, POOL.z0 + 0.07, tile, pool);
    boxMesh(0.14, D, POOL.z1 - POOL.z0, POOL.x0 + 0.07, -D / 2, POOL_CZ, tile, pool);
    boxMesh(0.14, D, POOL.z1 - POOL.z0, POOL.x1 - 0.07, -D / 2, POOL_CZ, tile, pool);

    // 池边压顶（白色的那圈）
    const cap = sunStd(0xf4efe4, 0.7);
    boxMesh(POOL.x1 - POOL.x0 + 0.5, 0.14, 0.30, POOL_CX, 0.06, POOL.z1 + 0.10, cap, pool);
    boxMesh(POOL.x1 - POOL.x0 + 0.5, 0.14, 0.30, POOL_CX, 0.06, POOL.z0 - 0.10, cap, pool);
    boxMesh(0.30, 0.14, POOL.z1 - POOL.z0, POOL.x0 - 0.10, 0.06, POOL_CZ, cap, pool);
    boxMesh(0.30, 0.14, POOL.z1 - POOL.z0, POOL.x1 + 0.10, 0.06, POOL_CZ, cap, pool);

    // 水面（顶点会动）
    const wgeo = new THREE.PlaneGeometry(POOL.x1 - POOL.x0 - 0.10, POOL.z1 - POOL.z0 - 0.10, 28, 20);
    const wmat = new THREE.MeshStandardMaterial({
      map: waterTex(),
      color: col(0x49b3cd),
      transparent: true,
      opacity: 0.86,
      roughness: 0.14,
      metalness: 0.20,
      side: THREE.DoubleSide
    });
    wmat.color.multiplyScalar(SUN + 0.05);
    water = new THREE.Mesh(wgeo, wmat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(POOL_CX, WATER_Y, POOL_CZ);
    pool.add(water);
    waterPos = wgeo.attributes.position;
    waterBase = new Float32Array(waterPos.count * 3);
    for (let i = 0; i < waterPos.count; i++) {
      waterBase[i * 3] = waterPos.getX(i);
      waterBase[i * 3 + 1] = waterPos.getY(i);
      waterBase[i * 3 + 2] = waterPos.getZ(i);
    }
    frames.water = water;

    // 池子北边的跳板
    const plank = boxMesh(0.55, 0.08, 2.30, POOL_CX, 0.85, POOL.z0 - 0.55, sunStd(0xe8e2d4, 0.6), root);
    plank.receiveShadow = true;
    [-1, 1].forEach(function (s) {
      cylMesh(0.06, 0.07, 1.05, 8, POOL_CX + s * 0.20, 0.52, POOL.z0 - 1.55, sunStd(0xbfc9d2, 0.4, 0.6), root);
    });
    boxMesh(0.70, 0.10, 0.30, POOL_CX, 0.94, POOL.z0 - 1.55, sunStd(0x8fd6ea, 0.8), root);

    // 扶着我下水的梯子（东边）
    // M57：原来两根扶手是"半圆环 + rotation.y=90°"，结果两根横着叠在一起、
    // 还浮在水面上（妈妈截图里那一团交叉的灰管）。改成正经的水池梯子：
    // 两根竖直扶手 + 三根水下踏棍，扶手头上弯一下搭在台面上。
    const steel = sunStd(0xbfc9d2, 0.35, 0.7);
    const ladderZ = POOL_CZ + 1.6;
    const lx = POOL.x1 - 0.17;           // 挂在池壁里侧
    [-0.26, 0.26].forEach(function (dz) {
      const rail = cylMesh(0.034, 0.034, 1.10, 8, lx, 0.28, ladderZ + dz, steel, pool);
      rail.castShadow = false;
      // 顶上的圆头（以前那个 1/4 圆环装偏了，把管子切出一个斜口）
      const cap = M(new THREE.SphereGeometry(0.034, 8, 6), steel, lx, 0.83, ladderZ + dz, pool);
      cap.castShadow = false;
    });
    // 扶手顶上的横杆，把两根竖杆连起来
    const topBar = cylMesh(0.030, 0.030, 0.52, 8, lx, 0.80, ladderZ, steel, pool);
    topBar.rotation.x = Math.PI / 2;
    topBar.castShadow = false;
    for (let i = 0; i < 3; i++) {
      const rung = cylMesh(0.026, 0.026, 0.52, 8, lx, 0.30 - i * 0.26, ladderZ, steel, pool);
      rung.rotation.x = Math.PI / 2;
      rung.castShadow = false;
    }

    // 救生圈（挂在柱子上）
    const buoyMat = sunStd(0xf25f4a, 0.7);
    [[-7.2, -44.6], [7.2, -51.6]].forEach(function (p) {
      const post = cylMesh(0.05, 0.06, 1.45, 8, p[0], 0.72, p[1], sunStd(0xe8e2d4, 0.7), root);
      const buoy = M(new THREE.TorusGeometry(0.30, 0.085, 10, 20), buoyMat, p[0], 1.30, p[1] + 0.12, root);
      buoy.rotation.y = Math.PI / 2 * 0.4;
      // 白色十字
      [[0, 0.30], [0, -0.30], [0.30, 0], [-0.30, 0]].forEach(function (q) {
        const w = boxMesh(0.10, 0.10, 0.10, p[0] + q[0] * 0.7, 1.30 + q[1] * 0.7, p[1] + 0.12, sunStd(0xfaf6ee, 0.8), root);
        void w;
      });
      void post;
    });
  }

  /* ================= 滑水道 ================= */
  /* 沿着曲线搓一条开口朝上的 U 型槽（不是封闭的管子，才看得见里面冲下来的小鲸鱼） */
  function buildFlume(curve, radius, seg, radial) {
    const pos = [], uv = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3();
    const upv = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, tan).normalize();
      side.crossVectors(tan, up).normalize();
      upv.crossVectors(side, tan).normalize();
      for (let j = 0; j <= radial; j++) {
        const a = -Math.PI * 0.62 + (j / radial) * Math.PI * 1.24;
        dir.copy(side).multiplyScalar(Math.sin(a));
        dir.addScaledVector(upv, -Math.cos(a));
        pos.push(p.x + dir.x * radius, p.y + dir.y * radius, p.z + dir.z * radius);
        uv.push((j / radial) * 2, u * 10);
      }
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  function buildSlide() {
    const g = new THREE.Group();
    g.name = 'park-slide';
    root.add(g);
    const steel = sunStd(0xc6d0d8, 0.4, 0.65);
    const wood = sunStd(0xc9a06a, 0.8);

    // 塔：四根柱子 + 平台 + 栏杆
    const TX = 11.6, TZ = -55.6, TOP = 4.6;
    [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].forEach(function (p) {
      cylMesh(0.09, 0.11, TOP, 8, TX + p[0], TOP / 2, TZ + p[1], steel, g);
    });
    boxMesh(2.10, 0.14, 2.10, TX, TOP, TZ, wood, g);
    // 平台栏杆
    [[-1.0, 0], [1.0, 0]].forEach(function (p) {
      for (let i = 0; i < 4; i++) {
        const rr = cylMesh(0.03, 0.03, 0.9, 6, TX + p[0] * 0.95, TOP + 0.52, TZ - 0.9 + i * 0.6, steel, g);
        void rr;
      }
      boxMesh(0.06, 0.06, 2.0, TX + p[0] * 0.95, TOP + 1.0, TZ, steel, g);
    });
    // 楼梯（从南边上去）
    for (let i = 0; i < 18; i++) {
      const yy = 0.24 + i * 0.25;
      const zz = TZ + 1.15 + i * 0.30;
      boxMesh(1.10, 0.08, 0.30, TX, yy, zz, wood, g);
    }
    // 楼梯扶手
    [-0.58, 0.58].forEach(function (dx) {
      const rail = boxMesh(0.06, 0.06, 5.9, TX + dx, 2.35, TZ + 3.6, steel, g);
      rail.rotation.x = -0.72;
    });

    // 滑道：一条从塔上盘下来的管子
    // M57.1：最后两个点原来在 (6.9,-48.2) / (6.2,-47.8) —— 可泳池只到 x=6.0，
    // 等于让鲸鱼停在池沿外面的地砖上（妈妈截图里半个身子埋进地皮）。现在收进池子里。
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(TX, TOP + 0.30, TZ - 0.2),
      new THREE.Vector3(10.2, 4.30, -54.6),
      new THREE.Vector3(9.0, 3.60, -53.2),
      new THREE.Vector3(8.4, 2.80, -51.6),
      new THREE.Vector3(8.6, 1.90, -50.2),
      new THREE.Vector3(8.0, 1.00, -49.0),
      new THREE.Vector3(6.55, 0.30, -48.35),
      new THREE.Vector3(5.55, 0.02, -47.95)
    ]);
    frames.slideCurve = curve;
    // 滑道做成"开口朝上的 U 型槽"（不是一根管子）——这样能看见小鲸鱼从里面冲下来
    const flume = buildFlume(curve, 0.66, 56, 10);
    const ribbonMat = new THREE.MeshStandardMaterial({
      map: stripeTex('#f7f2e6', '#4fb6cf'),
      roughness: 0.32, metalness: 0.05, side: THREE.DoubleSide
    });
    ribbonMat.color.multiplyScalar(SUN + 0.1);
    const ribbon = new THREE.Mesh(flume, ribbonMat);
    ribbon.castShadow = true;
    ribbon.receiveShadow = true;
    g.add(ribbon);
    frames.slideTube = ribbon;
    // 槽口两侧的护沿
    [0.30, 0.70].forEach(function (u) {
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u).normalize();
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      [-1, 1].forEach(function (s) {
        const rail = M(new THREE.SphereGeometry(0.055, 8, 6), steel,
          p.x + side.x * 0.62 * s, p.y + 0.42, p.z + side.z * 0.62 * s, g);
        void rail;
      });
    });
    // 管口的圈
    [0, 1].forEach(function (u) {
      const p = curve.getPointAt(u);
      const tg = curve.getTangentAt(u);
      const ring = M(new THREE.TorusGeometry(0.68, 0.05, 8, 20, Math.PI * 1.15), steel, p.x, p.y, p.z, g);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg);
      ring.rotateZ(Math.PI * 0.42);
    });
    // 支撑
    [[9.9, -54.2, 3.9], [8.45, -51.5, 2.75], [7.4, -48.8, 1.0]].forEach(function (p) {
      cylMesh(0.07, 0.08, p[2], 8, p[0], p[2] / 2, p[1], steel, g);
    });

    // 滑道顶端的小牌
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshBasicMaterial({ map: signTex('滑水道', '冲下去！', '#8fd6ea'), toneMapped: false }));
    sign.position.set(TX + 1.12, TOP + 1.55, TZ + 0.2);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    frames.slideGeomT = 0;
  }

  /* ================= 遮阳伞 / 躺椅 / 小桌 ================= */
  function buildLoungers() {
    const spots = [
      { x: PX0 + 3.0, z: -37.6, ry: 0.10 },
      { x: PX0 + 3.0, z: -40.4, ry: 0.02 },
      { x: PX1 - 3.2, z: -37.2, ry: -0.12 },
      { x: PX1 - 3.2, z: -40.2, ry: -0.04 },
      { x: -2.6, z: -55.4, ry: 0.06 },      // 北边那排（池子对面）
      { x: 2.4, z: -55.9, ry: -0.05 }
    ];
    const frame = sunStd(0xf2ede2, 0.75);
    const wood = sunStd(0xb98d5c, 0.8);
    spots.forEach(function (s, idx) {
      const grp = new THREE.Group();
      grp.position.set(s.x, 0, s.z);
      grp.rotation.y = s.ry;
      root.add(grp);

      // 躺椅
      const chair = new THREE.Group();
      chair.position.set(0, 0, 0);
      grp.add(chair);
      const seat = boxMesh(0.72, 0.06, 1.70, 0, 0.34, 0, frame, chair);
      void seat;
      for (let i = 0; i < 4; i++) {
        boxMesh(0.66, 0.03, 0.16, 0, 0.38, -0.62 + i * 0.42, sunStd(0x5fb6c8, 0.85), chair);
      }
      const back = boxMesh(0.72, 0.06, 0.86, 0, 0.66, -0.98, frame, chair);
      back.rotation.x = 0.55;
      [[-0.30, -0.72], [0.30, -0.72], [-0.30, 0.72], [0.30, 0.72]].forEach(function (p) {
        boxMesh(0.06, 0.36, 0.06, p[0], 0.18, p[1], wood, chair);
      });
      // 椅背上的小毛巾
      boxMesh(0.30, 0.02, 0.40, 0.12, 0.70, -0.92, sunStd(0xffd9a0, 0.9), chair).rotation.x = 0.55;

      // 遮阳伞
      const pole = cylMesh(0.05, 0.06, 2.55, 10, 0.85, 1.27, -0.35, sunStd(0xdfd6c4, 0.7), grp);
      void pole;
      const canopy = M(new THREE.ConeGeometry(1.55, 0.62, 10, 1, true),
        new THREE.MeshStandardMaterial({
          map: stripeTex(idx % 2 ? '#f7f2e6' : '#f6b8a0', idx % 2 ? '#f2876b' : '#f7f2e6'),
          roughness: 0.85, side: THREE.DoubleSide
        }), 0.85, 2.62, -0.35, grp);
      canopy.receiveShadow = true;
      // 伞顶小球
      M(new THREE.SphereGeometry(0.07, 10, 8), sunStd(0xf2876b, 0.8), 0.85, 2.97, -0.35, grp);

      // 小桌 + 杯子
      const tb = cylMesh(0.26, 0.24, 0.06, 14, -0.62, 0.42, 0.30, sunStd(0xf4efe4, 0.7), grp);
      void tb;
      cylMesh(0.035, 0.05, 0.42, 8, -0.62, 0.21, 0.30, sunStd(0xcfc5b2, 0.8), grp);
      const cup = cylMesh(0.06, 0.05, 0.14, 10, -0.62, 0.52, 0.30, sunStd(0xffb3c0, 0.8), grp);
      cup.castShadow = true;
      // 吸管
      const straw = cylMesh(0.012, 0.012, 0.18, 6, -0.60, 0.63, 0.30, sunStd(0xfaf6ee, 0.7), grp);
      straw.rotation.z = 0.2;

      blob(s.x, s.z, 1.15, 0.03);
    });
  }

  /* ================= 冰棍摊 ================= */
  function buildStand() {
    const g = new THREE.Group();
    g.position.set(-3.6, 0, -36.4);
    g.rotation.y = 0.22;
    root.add(g);
    const wood = sunStd(0xc9a06a, 0.82);
    const white = sunStd(0xf6f1e6, 0.7);

    // 柜台
    boxMesh(2.60, 0.95, 1.10, 0, 0.475, 0, white, g);
    boxMesh(2.70, 0.08, 1.20, 0, 0.98, 0, wood, g);
    // 柜台上的冰柜（玻璃顶）
    const chest = boxMesh(2.0, 0.30, 0.80, 0, 1.16, 0, sunStd(0xdfe9ef, 0.5), g);
    void chest;
    const glass = boxMesh(1.92, 0.06, 0.72, 0, 1.32, 0, new THREE.MeshStandardMaterial({
      color: col(0xcfeaf5), roughness: 0.06, transparent: true, opacity: 0.36, depthWrite: false
    }), g);
    void glass;
    // 冰柜里的冰棍（几根小柱子）
    for (let i = 0; i < 7; i++) {
      const px = -0.82 + i * 0.27;
      cylMesh(0.055, 0.045, 0.20, 8, px, 1.24, 0.02, sunStd(i % 2 ? 0xf58d7a : 0x8fd6a8, 0.7), g);
    }
    // 条纹遮阳篷
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.10, 1.35),
      new THREE.MeshStandardMaterial({
        map: stripeTex('#f7f2e6', '#f2876b'), roughness: 0.9, side: THREE.DoubleSide
      }));
    awn.position.set(0, 2.35, -0.15);
    awn.rotation.x = -0.52;
    g.add(awn);
    // 篷子支架
    [[-1.45, -0.55], [1.45, -0.55]].forEach(function (p) {
      cylMesh(0.045, 0.05, 2.55, 8, p[0], 1.27, p[1], sunStd(0xcfc5b2, 0.7), g);
    });
    // 招牌
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.30, 0.85),
      new THREE.MeshBasicMaterial({ map: signTex('冰棍 ¥6', '小鲸鱼冷饮', '#8fd6ea'), toneMapped: false }));
    sign.position.set(0, 2.62, -0.62);
    sign.rotation.x = -0.30;
    g.add(sign);
    // 价目小黑板
    const menuTex = makeTex(256, 320, function (gg, W, H) {
      gg.fillStyle = '#31463a';
      gg.fillRect(0, 0, W, H);
      gg.strokeStyle = '#8a6540';
      gg.lineWidth = 12;
      gg.strokeRect(6, 6, W - 12, H - 12);
      gg.fillStyle = '#eef4e6';
      gg.textAlign = 'center';
      gg.font = 'bold 38px ' + FONT;
      gg.fillText('冰棍 ¥6', W / 2, 82);
      gg.font = '24px ' + FONT;
      gg.fillText('西瓜 ¥8', W / 2, 148);
      gg.fillText('沙冰 ¥12', W / 2, 196);
      gg.font = '20px ' + FONT;
      gg.fillText('热了就来', W / 2, 258);
    });
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78),
      new THREE.MeshBasicMaterial({ map: menuTex, toneMapped: false }));
    menu.position.set(-1.15, 0.60, 0.60);
    menu.rotation.y = 0.30;
    g.add(menu);

    // 遮阳伞下面的暖光（夜里也亮）
    standLight = new THREE.PointLight(0xffd9a0, 0.55, 6, 2);
    standLight.position.set(-3.6, 2.2, -36.4);
    root.add(standLight);

    // 冰棍（点摊子买完拿在手上）
    popsicle = new THREE.Group();
    popsicle.position.set(-4.6, 1.35, -36.2);
    popsicle.visible = false;
    root.add(popsicle);
    cylMesh(0.012, 0.012, 0.22, 6, 0, -0.10, 0, sunStd(0xd8bf94, 0.9), popsicle);
    const pop = boxMesh(0.14, 0.20, 0.10, 0, 0.06, 0, sunStd(0xf58d7a, 0.6), popsicle);
    pop.rotation.z = 0.12;
    frames.popsicle = popsicle;

    blob(-3.6, -36.4, 1.6, 0.03);
  }

  /* ================= 喷泉 ================= */
  function buildFountain() {
    const g = new THREE.Group();
    g.position.set(6.6, 0, -36.6);
    root.add(g);
    const stone = sunStd(0xdcd5c6, 0.85);
    // 池子
    const basin = M(new THREE.CylinderGeometry(2.0, 2.1, 0.44, 26, 1, true), stone, 0, 0.22, 0, g);
    basin.receiveShadow = true;
    const rim = M(new THREE.TorusGeometry(2.02, 0.10, 8, 28), stone, 0, 0.44, 0, g);
    rim.rotation.x = Math.PI / 2;
    const disc = M(new THREE.CircleGeometry(2.0, 26),
      new THREE.MeshStandardMaterial({
        color: col(0x7fd0e2), roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9
      }), 0, 0.34, 0, g);
    disc.rotation.x = -Math.PI / 2;
    // 中间的小柱子
    cylMesh(0.14, 0.20, 0.55, 12, 0, 0.60, 0, stone, g);
    const bowl = M(new THREE.CylinderGeometry(0.55, 0.30, 0.16, 16, 1, true), stone, 0, 0.88, 0, g);
    bowl.receiveShadow = true;

    // 水柱（粒子）
    const pos = new Float32Array(40 * 3);
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd8f6ff, size: 0.10, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true, map: getJetTex()
    });
    const jet = new THREE.Points(g2, mat);
    jet.position.set(0, 0.9, 0);
    g.add(jet);
    fountainParts = { points: jet, pos: pos, phases: null };
    const ph = new Float32Array(40);
    const ang = new Float32Array(40);
    for (let i = 0; i < 40; i++) {
      ph[i] = Math.random();
      ang[i] = Math.random() * Math.PI * 2;
    }
    fountainParts.phases = ph;
    fountainParts.angles = ang;
    frames.fountain = fountainParts;

    blob(6.6, -36.6, 2.2, 0.03);
  }

  /* ================= 更衣室 / 园门 / 树 / 拍照位 ================= */
  function buildHuts() {
    const wood = sunStd(0xb98d5c, 0.85);
    const wall = sunStd(0xf4efe4, 0.8);
    // M37：更衣室原来堵在门口通道上（妈妈：「入口太小了进不去」）→ 往西挪，把门口让开
    [-11.6, -9.4].forEach(function (x, i) {
      const g = new THREE.Group();
      g.position.set(x, 0, -35.6);
      root.add(g);
      boxMesh(1.70, 2.20, 1.70, 0, 1.10, 0, wall, g);
      boxMesh(1.95, 0.14, 1.95, 0, 2.25, 0, wood, g);
      // 门帘
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 1.55),
        new THREE.MeshStandardMaterial({
          map: stripeTex('#f7f2e6', i ? '#8fd6ea' : '#f2876b'), roughness: 0.9, side: THREE.DoubleSide
        }));
      curtain.position.set(0, 1.02, 0.86);
      g.add(curtain);
      frames['curtain' + i] = curtain;
      // 小牌子
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.30),
        new THREE.MeshBasicMaterial({ map: signTex(i ? '女' : '男', null, '#f7f2e6'), toneMapped: false }));
      s.position.set(0, 2.0, 0.88);
      g.add(s);
      blob(x, -35.6, 1.2, 0.03);
    });
  }

  function buildGate() {
    const g = new THREE.Group();
    g.position.set(CX - 8.0, 0, -34.6);
    root.add(g);
    const post = sunStd(0xf4efe4, 0.75);
    [-2.6, 2.6].forEach(function (dx) {
      cylMesh(0.16, 0.18, 3.30, 12, dx, 1.65, 0, post, g);
      M(new THREE.SphereGeometry(0.20, 12, 10), sunStd(0xf2876b, 0.7), dx, 3.42, 0, g);
      // 三角小旗
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34),
        new THREE.MeshStandardMaterial({
          map: stripeTex('#ffd76a', '#f2876b'), roughness: 0.9, side: THREE.DoubleSide
        }));
      flag.position.set(dx + 0.30, 3.05, 0);
      g.add(flag);
    });
    // 拱门牌子
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.60, 1.35),
      new THREE.MeshBasicMaterial({ map: signTex('小鲸鱼水上乐园', 'WATER PARK · 今天免费', '#ffd76a'), toneMapped: false }));
    sign.position.set(0, 3.85, 0.02);
    g.add(sign);
    // 门口两根矮矮的门柱（M37：原来那两扇门斜在通道里，看着像"进不去"，干脆拿掉，整条通道全开）
    const tm = sunStd(0xc6d0d8, 0.4, 0.6);
    [-1, 1].forEach(function (s) {
      cylMesh(0.13, 0.15, 0.95, 12, s * 2.72, 0.47, 0.55, tm, g);
      const cap = M(new THREE.SphereGeometry(0.17, 12, 10), sunStd(0xf2876b, 0.7), s * 2.72, 0.99, 0.55, g);
      cap.castShadow = false;
    });
    blob(CX - 8.0, -34.6, 2.0, 0.03);

    // 售票小亭
    const hut = new THREE.Group();
    hut.position.set(CX - 11.6, 0, -34.9);
    root.add(hut);
    boxMesh(1.5, 0.95, 1.0, 0, 0.48, 0, sunStd(0xf4efe4, 0.8), hut);
    boxMesh(1.6, 0.08, 1.1, 0, 1.0, 0, sunStd(0xc9a06a, 0.8), hut);
    boxMesh(1.2, 0.10, 0.05, 0, 1.18, 0.5, sunStd(0xf2876b, 0.8), hut);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55),
      new THREE.MeshBasicMaterial({ map: signTex('售票处', '¥0', '#f7f2e6'), toneMapped: false }));
    s2.position.set(0, 1.55, 0.10);
    hut.add(s2);
  }

  function buildPalms() {
    const trunk = sunStd(0xb98d5c, 0.9);
    const leaf = sunStd(0x6fae66, 0.9);
    const spots = [
      [PX0 + 1.6, -46.0, 3.2],
      [PX0 + 2.2, -52.5, 3.6],
      [PX1 - 1.8, -44.4, 3.0],
      [PX1 - 1.4, -57.5, 3.5],
      [CX - 12.6, -43.2, 2.8]
    ];
    spots.forEach(function (p) {
      const g = new THREE.Group();
      g.position.set(p[0], 0, p[1]);
      root.add(g);
      const H = p[2];
      const tr = cylMesh(0.14, 0.20, H, 8, 0, H / 2, 0, trunk, g);
      tr.rotation.z = (Math.random() - 0.5) * 0.10;
      // 叶子：几片压扁的锥
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
        const lf = M(new THREE.ConeGeometry(0.30, 1.55, 4), leaf,
          Math.cos(a) * 0.55, H + 0.05, Math.sin(a) * 0.55, g);
        lf.rotation.z = Math.cos(a) * 1.05;
        lf.rotation.x = Math.sin(a) * 1.05;
        lf.scale.set(1, 1, 0.22);
      }
      blob(p[0], p[1], 1.1, 0.03);
    });
  }

  /* ================= 拍照位 ================= */
  function buildPhotoSpot() {
    const g = new THREE.Group();
    g.position.set(2.0, 0, -42.0);
    root.add(g);
    const gold = sunStd(0xe6c27a, 0.55, 0.25);
    // 立着的相框
    const frame = new THREE.Group();
    frame.position.set(0, 0, -0.75);
    frame.rotation.x = -0.12;
    g.add(frame);
    boxMesh(1.90, 0.16, 0.14, 0, 2.42, 0, gold, frame);
    boxMesh(1.90, 0.16, 0.14, 0, 0.05, 0, gold, frame);
    boxMesh(0.16, 2.55, 0.14, -0.87, 1.24, 0, gold, frame);
    boxMesh(0.16, 2.55, 0.14, 0.87, 1.24, 0, gold, frame);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.42),
      new THREE.MeshBasicMaterial({ map: signTex('最佳拍照位', '拍我！拍我！', '#ffd76a'), toneMapped: false }));
    txt.position.set(0, 2.72, 0.02);
    frame.add(txt);
    // 地上的爱心
    const heartMat = new THREE.MeshBasicMaterial({
      color: 0xf2876b, transparent: true, opacity: 0.55, toneMapped: false,
      map: makeTex(64, 64, function (gg, W, H) {
        gg.clearRect(0, 0, W, H);
        gg.fillStyle = '#ffffff';
        gg.beginPath();
        gg.moveTo(32, 56);
        gg.bezierCurveTo(2, 34, 8, 10, 22, 12);
        gg.bezierCurveTo(28, 13, 32, 20, 32, 22);
        gg.bezierCurveTo(32, 20, 36, 13, 42, 12);
        gg.bezierCurveTo(56, 10, 62, 34, 32, 56);
        gg.closePath();
        gg.fill();
      })
    });
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), heartMat);
      h.rotation.x = -Math.PI / 2;
      h.position.set(Math.cos(i / 5 * Math.PI * 2) * 1.15, 0.02, Math.sin(i / 5 * Math.PI * 2) * 0.9);
      g.add(h);
    }
    // 小牌子（插在地上）
    const stick = cylMesh(0.03, 0.03, 0.9, 6, -1.35, 0.45, -0.55, sunStd(0xc9a06a, 0.85), g);
    void stick;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 0.50),
      new THREE.MeshBasicMaterial({ map: signTex('站这儿', null, '#8fd6ea'), toneMapped: false }));
    card.position.set(-1.35, 0.98, -0.55);
    card.rotation.y = 0.18;
    g.add(card);
    frames.photoSpot = g;
  }

  /* ================= 沙滩球 ================= */
  function buildBall() {
    ballMesh = new THREE.Group();
    ballMesh.position.set(-2.6, 0.30, -40.6);
    root.add(ballMesh);
    const stripes = ['#f58d7a', '#ffd76a', '#8fd6ea', '#f7f2e6'];
    for (let i = 0; i < 4; i++) {
      const seg = M(new THREE.SphereGeometry(0.30, 14, 10, i * Math.PI / 2, Math.PI / 2),
        sunStd(parseInt(stripes[i].slice(1), 16), 0.6), 0, 0, 0, ballMesh);
      void seg;
    }
    frames.ball = ballMesh;
    blob(-2.6, -40.6, 0.42, 0.03);
  }

  /* ================= 胖虎鲸 ================= */
  function buildOrca() {
    if (!XD.Workspace || !XD.Workspace.miniOrca) return;
    orca = XD.Workspace.miniOrca(1.85);
    if (!orca) return;
    orca.position.set(POOL_CX, WATER_Y + 0.06, POOL_CZ);
    root.add(orca);
    frames.orc = orca;
    frames.orcScale = orca.scale.x;   // 记下原始大小，躺椅子的时候要临时缩一点
  }

  /* ================= 水花 ================= */
  function dropTex() {
    return makeTex(64, 64, function (g, W, H) {
      const gd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gd.addColorStop(0, 'rgba(255,255,255,0.95)');
      gd.addColorStop(0.5, 'rgba(220,245,255,0.55)');
      gd.addColorStop(1, 'rgba(200,235,255,0)');
      g.fillStyle = gd;
      g.fillRect(0, 0, W, H);
    });
  }
  let dropMat = null;
  // 只撒水珠（不发声、不打圈）：甩水 / 抽水 / 小鲸鱼抖毛都用它
  function spawnDrops(x, y, z, n, power) {
    if (!dropMat) {
      dropMat = new THREE.SpriteMaterial({
        map: dropTex(), transparent: true, depthWrite: false, depthTest: true, fog: false
      });
    }
    for (let i = 0; i < (n || 14); i++) {
      const sp = new THREE.Sprite(dropMat);
      const a = Math.random() * Math.PI * 2;
      const sp0 = 0.9 + Math.random() * 1.4;
      sp.position.set(x, y === undefined ? WATER_Y + 0.15 : y, z);
      sp.scale.set(0.16, 0.16, 1);
      root.add(sp);
      drops.push({
        sp: sp, vx: Math.cos(a) * sp0 * 0.6, vz: Math.sin(a) * sp0 * 0.6,
        vy: (2.2 + Math.random() * 2.4) * (power || 1), life: 0.9 + Math.random() * 0.5, t: 0
      });
    }
  }

  function splash(x, z, n, power) {
    spawnDrops(x, WATER_Y + 0.15, z, n, power);
    // 水面上的圈
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 22),
        new THREE.MeshBasicMaterial({
          color: 0xeafcff, transparent: true, opacity: 0.7,
          side: THREE.DoubleSide, depthWrite: false, toneMapped: false
        }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, WATER_Y + 0.02, z);
      root.add(ring);
      rings.push({ m: ring, t: -i * 0.16, life: 1.6 });
    }
    if (sfx && sfx.parkSplash) sfx.parkSplash();
    else if (sfx && sfx.splash) sfx.splash();
  }

  /* ================= M56/M57：滑水道（小D 本尊去滑，镜头跟着它） =================
   * M57 修正：妈妈笑我"池子里那只胖嘟嘟的虎鲸不就是你吗" —— 对，滑水道的应该是
   * 池子里那只 orca 本尊，别再另造一只。镜头跟着 `orca` 走，它自己的 'slide'
   * 动画（M32 就有）负责从塔上冲进水里。 */
  function startSlideRide() {
    if (ride.on || !isParkNow() || !camRef || !frames.slideCurve || !orca) return false;
    ride.on = true;
    ride.phase = 'climb';
    ride.t = 0;
    ride.from.copy(camRef.position);
    const dx = SLIDE_TX - camRef.position.x, dz = SLIDE_TZ - camRef.position.z;
    ride.dur = Math.max(1.3, Math.min(3.4, Math.sqrt(dx * dx + dz * dz) / 7));
    // 打断它正在做的事（吃 / 趴浮圈 / 按路点游），直接抱上塔
    pathQ = null; eatT = -1; floatT = -1; boardT = -1; petT = -1;
    orcaMode = 'rideWait';
    orca.position.set(SLIDE_TX, SLIDE_TOP + 0.52, SLIDE_TZ - 0.10);
    orca.rotation.set(0, -Math.PI / 2, 0);
    if (sfx && sfx.parkWhoosh) sfx.parkWhoosh();
    if (tip) tip('跑上塔——小D抓好扶手啦，马上冲下去！', 2200);
    return true;
  }

  function finishRide() {
    ride.on = false;
    ride.phase = '';
    ride.t = 0;
    ride.frozen = false;
    if (orcaMode === 'rideWait') orcaMode = 'swim';
    const w = getWalkFn ? getWalkFn() : null;
    if (w && camRef) {
      camRef.rotation.reorder('YXZ');
      w.yaw = camRef.rotation.y;
      w.pitch = Math.max(-0.6, Math.min(0.6, camRef.rotation.x));
      w.bobY = 0;
    }
    if (tip) tip('扑通——还想玩就再点一次滑水道', 3400);
  }

  function updateRide(dt) {
    if (!ride.on || !camRef) return;
    if (!isParkNow()) { ride.on = false; return; }
    const cam = camRef;
    const curve = frames.slideCurve;
    if (!curve || !orca) { finishRide(); return; }
    if (!ride.frozen) ride.t += dt;
    const tt = ride.t;

    if (ride.phase === 'climb') {
      const k = Math.min(1, tt / (ride.dur || 2));
      const e = k * k * (3 - 2 * k);
      // 镜头飞到塔前偏上一点，看着平台上等的小D
      cam.position.set(
        ride.from.x + (SLIDE_TX + 1.55 - ride.from.x) * e,
        ride.from.y + (SLIDE_TOP + 2.05 - ride.from.y) * e + Math.sin(e * Math.PI) * 0.7,
        ride.from.z + (SLIDE_TZ + 1.25 - ride.from.z) * e
      );
      cam.lookAt(SLIDE_TX, SLIDE_TOP + 0.55, SLIDE_TZ - 0.15);
      orca.position.y = SLIDE_TOP + 0.52 + Math.sin(tt * 3.2) * 0.02;
      orca.rotation.y = -Math.PI / 2 + Math.sin(tt * 1.6) * 0.12;
      if (k >= 1) {
        ride.phase = 'drop';
        ride.t = 0;
        orcaMode = 'slide';      // 交给它自己的滑道动画
        slideT = 0;
      }
      return;
    }
    if (ride.phase === 'drop') {
      if (orcaMode !== 'slide') { ride.phase = 'splash'; ride.t = 0; return; }   // 已经冲进水里了
      const u = Math.max(0, Math.min(1, slideT));
      const p = orca.position;
      const tg = curve.getTangentAt(u);
      const flat = Math.hypot(tg.x, tg.z) || 1;
      const sx = tg.z / flat, sz = -tg.x / flat;
      // 镜头从斜后方高处跟下来（小D是只胖虎鲸，站远一点才看得全；槽只有开口朝上，
      // 从后面平视会被槽壁挡住）
      cam.position.set(
        p.x - tg.x / flat * 3.40 + sx * 0.45,
        p.y + 3.20,
        p.z - tg.z / flat * 3.40 + sz * 0.45
      );
      cam.lookAt(
        p.x + tg.x / flat * 0.55,
        p.y + 0.10,
        p.z + tg.z / flat * 0.55
      );
      cam.rotateZ(Math.sin(u * 9.5) * 0.05);
      if (Math.random() < dt * 14) spawnDrops(p.x, p.y + 0.12, p.z, 2, 0.45);
      return;
    }
    if (ride.phase === 'splash') {
      const k = Math.min(1, tt / 1.7);
      const dip = Math.sin(k * Math.PI);
      cam.position.set(2.40 + k * 0.20, WATER_Y + 1.75 - dip * 1.50, -45.20);
      cam.lookAt(3.60, WATER_Y + 0.18, -49.20);      // 看落水点：小D滑到池子中间才冒头
      cam.rotateZ(Math.sin(tt * 19) * 0.035 * (1 - k));
      if (k >= 1) {
        ride.outFrom.copy(cam.position);
        ride.phase = 'out';
        ride.t = 0;
      }
      return;
    }
    if (ride.phase === 'out') {
      const k = Math.min(1, tt / 1.5);
      const e = k * k * (3 - 2 * k);
      const fx = ride.outFrom.x, fy = ride.outFrom.y, fz = ride.outFrom.z;
      cam.position.set(
        fx + (8.25 - fx) * e,
        fy + (1.62 - fy) * e,
        fz + (-46.35 - fz) * e
      );
      cam.lookAt(2.0, 0.8, -48.8);
      if (k >= 1) {
        cam.position.set(8.25, 1.62, -46.35);
        cam.lookAt(2.0, 0.8, -48.8);
        finishRide();
      }
      return;
    }
  }

  /* ================= M34：水面小工具（涟漪 / 泡泡 / 说话） ================= */
  let bubbleTexCache = null;
  function getBubbleTex() {
    if (bubbleTexCache) return bubbleTexCache;
    bubbleTexCache = makeTex(64, 64, function (g, W, H) {
      const gd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gd.addColorStop(0, 'rgba(255,255,255,0.9)');
      gd.addColorStop(0.55, 'rgba(226,248,255,0.5)');
      gd.addColorStop(0.78, 'rgba(190,235,255,0.28)');
      gd.addColorStop(1, 'rgba(190,235,255,0)');
      g.fillStyle = gd;
      g.fillRect(0, 0, W, H);
    });
    return bubbleTexCache;
  }

  // 水面上一圈涟漪（比 splash 轻，可以经常用）
  function ringAt(x, z, r, life) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r, 22),
      new THREE.MeshBasicMaterial({
        color: 0xeafcff, transparent: true, opacity: 0.62,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, WATER_Y + 0.02, z);
    root.add(ring);
    rings.push({ m: ring, t: 0, life: life || 1.3 });
  }

  // 水里冒出来的泡泡（会往上飘，到水面破掉）
  function spawnBubbles(x, y, z, n, spread) {
    for (let i = 0; i < (n || 4); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getBubbleTex(), transparent: true, depthWrite: false, fog: false
      }));
      const s = 0.05 + Math.random() * 0.055;
      sp.scale.set(s, s, 1);
      sp.position.set(
        x + (Math.random() - 0.5) * (spread || 0.3),
        y,
        z + (Math.random() - 0.5) * (spread || 0.3)
      );
      root.add(sp);
      bubblesFx.push({ sp: sp, t: 0, life: 0.7 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.10 });
    }
  }

  function updateBubblesFx(dt) {
    for (let i = bubblesFx.length - 1; i >= 0; i--) {
      const b = bubblesFx[i];
      b.t += dt;
      b.sp.position.y += dt * 0.55;
      b.sp.position.x += Math.sin(b.t * 9 + i) * 0.006 + b.vx * dt;
      b.sp.material.opacity = Math.max(0, 1 - b.t / b.life);
      if (b.t > b.life || b.sp.position.y > WATER_Y + 0.12) {
        if (b.sp.parent) b.sp.parent.remove(b.sp);
        b.sp.material.dispose();
        bubblesFx.splice(i, 1);
      }
    }
  }

  // 小鲸鱼说话（气泡从它头顶冒出来）
  function say(text, life) {
    if (!text || !interact || !interact.say) return;
    const p = orca ? orca.position : new THREE.Vector3(POOL_CX, 0.2, POOL_CZ);
    interact.say(new THREE.Vector3(p.x, p.y + 1.10, p.z), text, life || 3.4);
    lastSayT = t;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ================= M32.5：照着真人池子的样子加东西 =================
   * 来源见 小D的赛博小家\参考-水上乐园灵感.md
   * 入口彩旗/气球拱门/地图牌 · 会喷水的蘑菇浅水池 · 池边水吧 · 沙滩排球 · 凉棚餐桌 ·
   * 火烈鸟浮排和浮圈 · 救生员椅 · 淋浴柱 · 储物柜 · 横跨泳池的串灯 · 霓虹字牌 · 更多绿植
   */
  function ropeLine(list, hex) {
    const geo = new THREE.BufferGeometry().setFromPoints(list);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: hex, transparent: true, opacity: 0.8
    }));
    root.add(line);
    return line;
  }

  // 水珠用的小圆点贴图（不然 Points 是一颗颗方块）
  let jetTexCache = null;
  function getJetTex() {
    if (jetTexCache) return jetTexCache;
    jetTexCache = makeTex(32, 32, function (g, W, H) {
      const gd = g.createRadialGradient(16, 16, 1, 16, 16, 15);
      gd.addColorStop(0, 'rgba(255,255,255,0.95)');
      gd.addColorStop(0.55, 'rgba(222,246,255,0.55)');
      gd.addColorStop(1, 'rgba(210,240,255,0)');
      g.fillStyle = gd;
      g.fillRect(0, 0, W, H);
    });
    return jetTexCache;
  }

  // 一根竖直的小水柱（粒子），h 给负数就是往下落的水帘
  function makeJet(x, y, z, h, n, size, hex) {
    const arr = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) ph[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color: hex === undefined ? 0xcdf3ff : hex, size: size || 0.085,
      transparent: true, opacity: 0.9, depthWrite: false, map: getJetTex()
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(x, y, z);
    root.add(pts);
    frames.jets.push({ pts: pts, arr: arr, ph: ph, h: h, n: n });
    return pts;
  }

  /* ---------- 入口广场 ---------- */
  function buildEntrance() {
    const BCOL = [0xffffff, 0x8fd6ea, 0xf2876b, 0xffd76a, 0x9fd6a8];
    // 三角彩旗
    function strand(x0, z0, x1, z1, y, sag, n) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push(new THREE.Vector3(
          x0 + (x1 - x0) * u,
          y - Math.sin(u * Math.PI) * sag,
          z0 + (z1 - z0) * u
        ));
      }
      ropeLine(pts, 0x6b5540);
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, 0, 0, 0.20, 0, 0, 0.10, -0.27, 0], 3));
      tri.computeVertexNormals();
      for (let i = 1; i < n; i++) {
        const flag = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({
          color: BCOL[i % BCOL.length], side: THREE.DoubleSide, toneMapped: false
        }));
        flag.position.copy(pts[i]);
        flag.position.x -= 0.10;
        flag.castShadow = false;
        root.add(flag);
      }
    }
    strand(-8.70, -34.55, -3.30, -34.55, 2.60, 0.32, 13);   // 门口正上方那串
    strand(-8.70, -34.20, -8.70, -36.90, 2.40, 0.26, 8);    // 侧边那串
    strand(-3.30, -34.20, -3.30, -36.60, 2.40, 0.22, 7);

    // 气球拱门（门柱那一圈）
    const arch = new THREE.Group();
    root.add(arch);
    frames.balloons.push(arch);
    const archN = 15;
    for (let i = 0; i <= archN; i++) {
      const u = i / archN;
      const x = -8.45 + 4.90 * u;
      const y = 3.05 + Math.sin(u * Math.PI) * 1.35;
      const z = -34.52;
      for (let k = 0; k < 2; k++) {
        const r = 0.15 + Math.random() * 0.075;
        const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), sunStd(BCOL[(i + k) % BCOL.length], 0.55));
        b.position.set(x + (Math.random() - 0.5) * 0.24, y + (Math.random() - 0.5) * 0.22, z + (Math.random() - 0.5) * 0.16);
        b.castShadow = false;
        arch.add(b);
      }
    }
    // 拱门上挂的小牌
    const archSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5),
      new THREE.MeshBasicMaterial({ map: signTex('欢迎光临', 'WELCOME', '#f7f2e6'), toneMapped: false }));
    archSign.position.set(-6.0, 3.55, -34.45);
    root.add(archSign);

    // 园区地图牌
    const mapG = new THREE.Group();
    mapG.position.set(-12.55, 0, -37.9);
    mapG.rotation.y = 0.42;
    root.add(mapG);
    cylMesh(0.05, 0.06, 1.55, 8, -0.62, 0.78, 0, sunStd(0xc9a06a, 0.85), mapG);
    cylMesh(0.05, 0.06, 1.55, 8, 0.62, 0.78, 0, sunStd(0xc9a06a, 0.85), mapG);
    const mapTex = makeTex(320, 250, function (gg, W, H) {
      gg.fillStyle = '#f8f2e3';
      gg.fillRect(0, 0, W, H);
      gg.strokeStyle = '#c9a06a';
      gg.lineWidth = 12;
      gg.strokeRect(6, 6, W - 12, H - 12);
      gg.fillStyle = '#9be0ee';
      gg.fillRect(92, 96, 130, 84);
      gg.fillStyle = '#5fb6c8';
      gg.fillRect(232, 104, 26, 52);
      gg.fillStyle = '#ffd76a';
      gg.fillRect(40, 176, 46, 40);
      gg.fillStyle = '#f2876b';
      gg.fillRect(206, 176, 52, 40);
      gg.fillStyle = '#9fd6a8';
      gg.fillRect(96, 24, 122, 40);
      gg.fillStyle = '#3b4a63';
      gg.font = 'bold 30px ' + FONT;
      gg.textAlign = 'center';
      gg.fillText('园区地图', W / 2, 56);
      gg.font = 'bold 20px ' + FONT;
      gg.fillText('泳池', 156, 142);
      gg.fillText('滑道', 245, 134);
      gg.fillText('冰棍', 62, 202);
      gg.fillText('水吧', 232, 202);
      gg.fillText('戏水', 156, 50);
    });
    const mapBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.20),
      new THREE.MeshBasicMaterial({ map: mapTex, toneMapped: false }));
    mapBoard.position.set(0, 1.70, 0.04);
    mapG.add(mapBoard);

    // 门口排队栏杆（两根柱 + 一根绳）
    [[-7.55, -35.35], [-4.45, -35.35]].forEach(function (p) {
      cylMesh(0.05, 0.06, 0.95, 8, p[0], 0.48, p[1], sunStd(0xdfd6c4, 0.7), root);
      M(new THREE.SphereGeometry(0.075, 10, 8), sunStd(0xdfd6c4, 0.7), p[0], 0.98, p[1], root);
    });
    ropeLine([
      new THREE.Vector3(-7.55, 0.92, -35.35),
      new THREE.Vector3(-6.0, 0.74, -35.35),
      new THREE.Vector3(-4.45, 0.92, -35.35)
    ], 0x8a6540);

    // 脚垫
    const matTex = makeTex(256, 128, function (gg, W, H) {
      gg.fillStyle = '#d9c9a8';
      gg.fillRect(0, 0, W, H);
      gg.strokeStyle = '#b9a179';
      gg.lineWidth = 8;
      gg.strokeRect(6, 6, W - 12, H - 12);
      gg.fillStyle = '#5f6b48';
      gg.font = 'bold 40px ' + FONT;
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.fillText('WELCOME', W / 2, H / 2);
    });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.60, 0.80),
      new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95 }));
    mat.rotation.x = -Math.PI / 2;
    mat.rotation.z = 0;      // M37：从门外走进来的人是正的（以前反过来写字，门口看是镜像）
    mat.position.set(-6.0, 0.035, -35.95);
    root.add(mat);
  }

  /* ---------- 会喷水的蘑菇浅水池 ---------- */
  function buildSplashPad() {
    const SX = 14.6, SZ = -47.0, R = 2.35;
    const g = new THREE.Group();
    g.position.set(SX, 0, SZ);
    root.add(g);

    // 浅池：一圈矮沿 + 浅水
    const rim = M(new THREE.CylinderGeometry(R, R + 0.10, 0.34, 30, 1, true), sunStd(0xf4efe4, 0.7), 0, 0.17, 0, g);
    rim.receiveShadow = true;
    const rimTop = M(new THREE.TorusGeometry(R + 0.05, 0.075, 8, 34), sunStd(0xf7f2e6, 0.65), 0, 0.34, 0, g);
    rimTop.rotation.x = Math.PI / 2;
    const shallow = M(new THREE.CircleGeometry(R - 0.04, 30),
      new THREE.MeshStandardMaterial({
        color: col(0x8fe0ee), roughness: 0.12, metalness: 0.15,
        transparent: true, opacity: 0.9
      }), 0, 0.25, 0, g);
    shallow.rotation.x = -Math.PI / 2;
    frames.splashWater = shallow;

    // 蘑菇：白杆 + 红伞（上面白点点）+ 伞边往下淌水
    const stem = cylMesh(0.20, 0.26, 0.85, 12, 0, 0.42, 0, sunStd(0xf7f2e6, 0.75), g);
    void stem;
    const cap = M(new THREE.SphereGeometry(0.95, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      sunStd(0xf25f4a, 0.7), 0, 0.92, 0, g);
    cap.scale.set(1, 0.72, 1);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), sunStd(0xfaf6ee, 0.8));
      d.position.set(Math.cos(a) * 0.58, 1.10 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.58);
      d.castShadow = false;
      g.add(d);
    }
    makeJet(SX, 0.98, SZ, 0.30, 18, 0.07);                       // 顶上冒的小水柱
    makeJet(SX, 1.02, SZ, -0.95, 26, 0.09);                      // 伞边淌下来的水帘

    // 三个地喷（彩色喷嘴，往上喷小水柱）
    [[SX - 1.45, SZ + 1.15], [SX + 1.35, SZ + 1.30], [SX + 1.55, SZ - 0.95]].forEach(function (p, i) {
      cylMesh(0.075, 0.09, 0.20, 10, p[0], 0.10, p[1], sunStd(BCOL2[i % BCOL2.length], 0.7), root);
      makeJet(p[0], 0.22, p[1], 0.95, 14, 0.075);
    });

    // 迷你滑梯（给小孩子的那种，从西边滑进浅池）
    const mini = new THREE.Group();
    mini.position.set(SX - 2.85, 0, SZ - 0.25);
    mini.rotation.y = Math.PI / 2;
    root.add(mini);
    const mTop = 1.15;
    [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]].forEach(function (p) {
      cylMesh(0.04, 0.05, mTop, 6, p[0], mTop / 2, p[1], sunStd(0xc6d0d8, 0.5, 0.4), mini);
    });
    boxMesh(1.20, 0.08, 0.78, 0, mTop, 0, sunStd(0xc9a06a, 0.8), mini);
    for (let i = 0; i < 5; i++) {
      boxMesh(0.70, 0.06, 0.20, 0, 0.18 + i * 0.22, -0.55 - i * 0.22, sunStd(0xc9a06a, 0.8), mini);
    }
    const miniSlide = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.9),
      new THREE.MeshStandardMaterial({ map: stripeTex('#f7f2e6', '#8fd6ea'), roughness: 0.4 }));
    miniSlide.position.set(0, 0.80, 1.05);
    miniSlide.rotation.x = 0.46;
    mini.add(miniSlide);

    // 两把水枪（插在池边的柱子上，冲着池子）
    [[SX - 1.55, SZ - 1.85, 0.5], [SX + 1.65, SZ - 1.55, -0.6]].forEach(function (p) {
      cylMesh(0.05, 0.06, 1.05, 8, p[0], 0.52, p[1], sunStd(0x8fd6ea, 0.6), root);
      const gun = cylMesh(0.075, 0.06, 0.42, 8, p[0], 1.02, p[1] + 0.12, sunStd(0xf2876b, 0.6), root);
      gun.rotation.x = Math.PI / 2 * 0.35;
      M(new THREE.SphereGeometry(0.09, 10, 8), sunStd(0xffd76a, 0.6), p[0], 1.05, p[1] + 0.34, root);
    });

    // 一圈彩色橡胶垫
    const matRing = M(new THREE.TorusGeometry(R + 0.55, 0.16, 8, 30),
      sunStd(0x8fd6ea, 0.85), 0, 0.03, 0, g);
    matRing.rotation.x = Math.PI / 2;
    matRing.scale.z = 0.35;
    blob(SX, SZ, 2.6, 0.03);
  }

  /* ---------- 池边水吧 ---------- */
  function buildPoolBar() {
    const BX = 15.9, BZ = -53.5;
    const g = new THREE.Group();
    g.position.set(BX, 0, BZ);
    g.rotation.y = -0.10;
    root.add(g);
    const wood = sunStd(0xc9a06a, 0.82);
    const white = sunStd(0xf6f1e6, 0.7);

    // 吧台
    boxMesh(3.10, 1.05, 1.15, 0, 0.52, 0, white, g);
    boxMesh(3.24, 0.10, 1.28, 0, 1.08, 0, wood, g);
    // 台面上的杯子瓶子
    for (let i = 0; i < 7; i++) {
      const px = -1.25 + i * 0.42;
      const hh = 0.16 + (i % 3) * 0.05;
      cylMesh(0.05, 0.045, hh, 8, px, 1.16 + hh / 2, 0.18, sunStd(BCOL2[i % 4], 0.4, 0.05), g);
    }
    // 高脚凳 3 张
    for (let i = 0; i < 3; i++) {
      const px = -1.05 + i * 1.05;
      cylMesh(0.045, 0.05, 0.68, 8, px, 0.34, 1.10, sunStd(0xc6d0d8, 0.5, 0.4), g);
      cylMesh(0.22, 0.22, 0.06, 14, px, 0.70, 1.10, sunStd(0xf2876b, 0.75), g);
    }
    // 条纹顶
    [[-1.55, -0.45], [1.55, -0.45], [-1.55, 0.45], [1.55, 0.45]].forEach(function (p) {
      cylMesh(0.05, 0.06, 2.55, 8, p[0], 1.27, p[1], sunStd(0xdfd6c4, 0.7), g);
    });
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.60, 1.75),
      new THREE.MeshStandardMaterial({
        map: stripeTex('#f7f2e6', '#8fd6ea'), roughness: 0.9, side: THREE.DoubleSide
      }));
    roof.position.set(0, 2.58, 0);
    roof.rotation.x = -0.16;
    g.add(roof);
    // 招牌
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.62),
      new THREE.MeshBasicMaterial({ map: signTex('池边水吧', 'COLD DRINKS', '#ffd76a'), toneMapped: false }));
    s.position.set(0, 2.92, 0.35);
    s.rotation.x = -0.12;
    g.add(s);
    // 两盆大叶植物
    [[-1.95, 0.42], [1.95, 0.42]].forEach(function (p) {
      cylMesh(0.19, 0.15, 0.34, 12, p[0], 0.17, p[1], sunStd(0xd8cfbc, 0.85), g);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const lf = M(new THREE.SphereGeometry(0.5, 10, 8), sunStd(0x5f9450, 0.9),
          p[0] + Math.cos(a) * 0.22, 0.52, p[1] + Math.sin(a) * 0.22, g);
        lf.scale.set(0.20, 0.26, 0.05);
        lf.rotation.y = -a;
        lf.rotation.z = 0.30;
      }
    });
    blob(BX, BZ, 1.9, 0.03);
  }

  /* ---------- 沙滩排球 ---------- */
  function buildVolley() {
    const VX = -10.3, VZ = -56.3;
    // 沙地
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 6.6), sunStd(0xe8d7b0, 0.95));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(VX, 0.015, VZ);
    sand.receiveShadow = true;
    root.add(sand);
    // 沙子边上的石头
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const m = M(new THREE.SphereGeometry(0.10 + Math.random() * 0.06, 8, 6),
        sunStd(0xcfc9b8, 0.9), VX + Math.cos(a) * 2.5, 0.05, VZ + Math.sin(a) * 3.4, root);
      m.scale.y = 0.6;
      m.castShadow = false;
    }
    // 网 + 两根柱
    [-2.1, 2.1].forEach(function (dx) {
      cylMesh(0.06, 0.07, 2.15, 8, VX + dx, 1.07, VZ, sunStd(0xdfd6c4, 0.7), root);
    });
    const netTex = makeTex(128, 64, function (gg, W, H) {
      gg.clearRect(0, 0, W, H);
      gg.strokeStyle = 'rgba(255,255,255,0.85)';
      gg.lineWidth = 3;
      for (let i = 0; i <= 8; i++) {
        gg.beginPath(); gg.moveTo(i * W / 8, 0); gg.lineTo(i * W / 8, H); gg.stroke();
      }
      for (let j = 0; j <= 4; j++) {
        gg.beginPath(); gg.moveTo(0, j * H / 4); gg.lineTo(W, j * H / 4); gg.stroke();
      }
    }, [3, 1]);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.95),
      new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    net.position.set(VX, 1.52, VZ);
    root.add(net);
    const top = boxMesh(4.2, 0.06, 0.06, VX, 2.0, VZ, sunStd(0xfaf6ee, 0.7), root);
    void top;
    // 排球（M34：点网就扣一球）
    const ball = M(new THREE.SphereGeometry(0.19, 14, 10), sunStd(0xfaf6ee, 0.6), VX + 1.2, 0.20, VZ + 1.6, root);
    ball.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.192, 14, 10, 0, Math.PI * 0.5, 0, Math.PI),
      sunStd(0x8fd6ea, 0.6));
    stripe.position.copy(ball.position);
    root.add(stripe);
    frames.volley = ball;
    frames.volleyStripe = stripe;
    frames.volleyHome = new THREE.Vector3(VX + 1.2, 0.20, VZ + 1.6);
  }

  /* ---------- 凉棚 + 长桌 ---------- */
  function buildPergola() {
    const PX = 14.0, PZ = -38.2;
    const g = new THREE.Group();
    g.position.set(PX, 0, PZ);
    root.add(g);
    const wood = sunStd(0xc9a06a, 0.85);
    const white = sunStd(0xf6f1e6, 0.72);

    [[-2.1, -1.7], [2.1, -1.7], [-2.1, 1.7], [2.1, 1.7]].forEach(function (p) {
      boxMesh(0.14, 2.75, 0.14, p[0], 1.37, p[1], wood, g);
    });
    // 两根横梁 + 一排木条
    [-1.7, 1.7].forEach(function (dz) {
      boxMesh(4.6, 0.14, 0.14, 0, 2.78, dz, wood, g);
    });
    for (let i = 0; i < 9; i++) {
      boxMesh(0.10, 0.07, 3.6, -2.0 + i * 0.5, 2.86, 0, white, g);
    }
    // 长桌 + 两条长凳
    boxMesh(3.0, 0.10, 0.95, 0, 0.72, 0, white, g);
    [[-1.25, -0.40], [1.25, -0.40], [-1.25, 0.40], [1.25, 0.40]].forEach(function (p) {
      boxMesh(0.09, 0.72, 0.09, p[0], 0.36, p[1], wood, g);
    });
    [-0.85, 0.85].forEach(function (dz) {
      boxMesh(2.6, 0.08, 0.34, 0, 0.43, dz, wood, g);
      [[-1.0, dz], [1.0, dz]].forEach(function (p) {
        boxMesh(0.07, 0.43, 0.28, p[0], 0.21, p[1], wood, g);
      });
    });
    // 桌上：托盘、杯子、西瓜片
    boxMesh(0.60, 0.05, 0.42, -0.55, 0.79, 0, sunStd(0xd8cfbc, 0.8), g);
    for (let i = 0; i < 3; i++) {
      cylMesh(0.055, 0.05, 0.13, 10, -0.75 + i * 0.22, 0.85, 0.06, sunStd(BCOL2[i], 0.6), g);
    }
    const wm = M(new THREE.CylinderGeometry(0.20, 0.20, 0.03, 14), sunStd(0xf25f4a, 0.75), 0.55, 0.80, 0.05, g);
    wm.rotation.z = 0.25;
    // 串灯（沿两根横梁）
    for (let i = 0; i <= 10; i++) {
      const b = M(new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe4a8, toneMapped: false }),
        -2.0 + i * 0.4, 2.62 - Math.sin(i / 10 * Math.PI) * 0.14, -1.7, g);
      b.castShadow = false;
      frames.bulbs.push(b);
    }
    blob(PX, PZ, 2.4, 0.03);
  }

  /* ---------- 池边配套 / 水里的东西 ---------- */
  function buildPoolExtras() {
    // 水里的浮圈
    const ringCols = [0xf58d7a, 0xffd76a, 0x8fd6ea, 0xfaf6ee];
    [[2.8, -49.7], [-3.6, -46.4], [4.3, -45.4]].forEach(function (p, i) {
      const r = M(new THREE.TorusGeometry(0.52, 0.16, 8, 18), sunStd(ringCols[i], 0.7), p[0], WATER_Y + 0.06, p[1], root);
      r.rotation.x = Math.PI / 2;
      r.castShadow = false;
      frames.floats.push({ m: r, x: p[0], z: p[1], ph: i * 1.7, spin: 0.10 + i * 0.04 });
    });
    // 火烈鸟浮排（小红书上泳池派对必有）
    const fl = new THREE.Group();
    fl.position.set(-2.4, WATER_Y + 0.07, -50.6);
    root.add(fl);
    const pink = sunStd(0xf58fa8, 0.75);
    const body = M(new THREE.SphereGeometry(0.55, 16, 12), pink, 0, 0.10, 0, fl);
    body.scale.set(1.0, 0.55, 0.72);
    const wingL = M(new THREE.SphereGeometry(0.30, 12, 10), sunStd(0xf7a8bc, 0.8), -0.30, 0.22, 0.02, fl);
    wingL.scale.set(0.7, 0.5, 0.9);
    const wingR = wingL.clone();
    wingR.position.x = 0.30;
    fl.add(wingR);
    const neck = cylMesh(0.075, 0.10, 0.85, 10, 0.38, 0.52, 0.20, pink, fl);
    neck.rotation.z = -0.20;
    neck.rotation.x = -0.10;
    const head = M(new THREE.SphereGeometry(0.16, 12, 10), pink, 0.50, 0.94, 0.24, fl);
    head.scale.set(1, 0.9, 1.0);
    const beak = M(new THREE.ConeGeometry(0.07, 0.22, 8), sunStd(0xffd76a, 0.7), 0.60, 0.88, 0.36, fl);
    beak.rotation.z = -1.35;
    const eye = M(new THREE.SphereGeometry(0.026, 8, 6), std(0x2a2220, 0.4), 0.56, 0.98, 0.34, fl);
    eye.castShadow = false;
    frames.floats.push({ m: fl, x: -2.4, z: -50.6, ph: 2.2, spin: 0.06 });

    // 救生员椅（红白）
    const lg = new THREE.Group();
    lg.position.set(8.6, 0, -42.4);
    root.add(lg);
    [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].forEach(function (p) {
      boxMesh(0.09, 2.05, 0.09, p[0], 1.02, p[1], sunStd(0xf4efe4, 0.7), lg);
    });
    boxMesh(1.10, 0.09, 1.10, 0, 2.06, 0, sunStd(0xf25f4a, 0.75), lg);
    boxMesh(1.10, 0.36, 0.09, 0, 2.24, -0.50, sunStd(0xf25f4a, 0.75), lg);
    boxMesh(0.90, 0.09, 0.90, 0, 2.13, 0, sunStd(0xfaf6ee, 0.75), lg);
    for (let i = 0; i < 3; i++) {
      boxMesh(0.90, 0.07, 0.16, 0, 2.24 + i * 0.0, 0.28 - i * 0.22, sunStd(0xfaf6ee, 0.75), lg);
    }
    // 椅背后面挂的救生圈
    const buoy = M(new THREE.TorusGeometry(0.30, 0.085, 8, 18), sunStd(0xf25f4a, 0.7), 0, 2.55, -0.56, lg);
    void buoy;

    // 淋浴柱（两个）
    [[-8.9, -44.9], [9.6, -44.0]].forEach(function (p) {
      const g2 = new THREE.Group();
      g2.position.set(p[0], 0, p[1]);
      root.add(g2);
      cylMesh(0.06, 0.08, 2.35, 10, 0, 1.17, 0, sunStd(0xc6d0d8, 0.45, 0.5), g2);
      const head = M(new THREE.CylinderGeometry(0.30, 0.12, 0.10, 14), sunStd(0xc6d0d8, 0.4, 0.5), 0, 2.34, 0.16, g2);
      head.rotation.x = 0.2;
      cylMesh(0.34, 0.34, 0.05, 14, 0, 0.025, 0, sunStd(0xdfd6c4, 0.8), g2);
      makeJet(p[0], 2.20, p[1] + 0.16, -1.85, 12, 0.06, 0xd8f6ff);
      blob(p[0], p[1], 0.7, 0.03);
    });

    // 泳圈堆（池边，靠着柱子）
    const pole = cylMesh(0.05, 0.06, 1.15, 8, -6.6, 0.57, -43.6, sunStd(0xdfd6c4, 0.7), root);
    void pole;
    [[0, 0.30, 0], [0.05, 0.52, 0.06], [-0.04, 0.74, 0.02]].forEach(function (p, i) {
      const r = M(new THREE.TorusGeometry(0.34, 0.105, 8, 16), sunStd(ringCols[i], 0.7),
        -6.6 + p[0], p[1], -43.6 + p[2], root);
      r.rotation.x = Math.PI / 2;
      r.rotation.z = (i - 1) * 0.22;
    });

    // 储物柜
    const lk = new THREE.Group();
    lk.position.set(-13.15, 0, -36.6);
    lk.rotation.y = Math.PI / 2;
    root.add(lk);
    for (let i = 0; i < 3; i++) {
      boxMesh(0.62, 0.95, 0.44, -0.66 + i * 0.66, 0.62, 0, sunStd(0x8fb3c4, 0.7), lk);
      boxMesh(0.52, 0.80, 0.03, -0.66 + i * 0.66, 0.62, 0.23, sunStd(0x9fc4d4, 0.7), lk);
      M(new THREE.SphereGeometry(0.045, 8, 6), sunStd(0xdfd6c4, 0.5, 0.4), -0.66 + i * 0.66, 0.62, 0.26, lk);
    }
    boxMesh(2.05, 0.08, 0.50, 0, 1.13, 0, sunStd(0xc9a06a, 0.8), lk);

    // 毛巾架
    const tr = new THREE.Group();
    tr.position.set(-12.4, 0, -42.4);
    root.add(tr);
    [[-0.55], [0.55]].forEach(function (p) {
      cylMesh(0.04, 0.05, 1.25, 8, p[0], 0.62, 0, sunStd(0xc6d0d8, 0.5, 0.4), tr);
    });
    const bar = cylMesh(0.03, 0.03, 1.20, 8, 0, 1.20, 0, sunStd(0xc6d0d8, 0.5, 0.4), tr);
    bar.rotation.z = Math.PI / 2;
    [0, 1].forEach(function (i) {
      const tw = boxMesh(0.34, 0.46, 0.03, -0.30 + i * 0.62, 0.98, 0, sunStd(i ? 0x8fd6ea : 0xfaf6ee, 0.95), tr);
      tw.rotation.x = 0.06;
    });

    // 横跨泳池的串灯（两根斜着拉过去）
    const polePts = [
      [-6.8, -52.9], [6.8, -52.9], [6.8, -43.3], [-6.8, -43.3]
    ];
    polePts.forEach(function (p) {
      cylMesh(0.055, 0.07, 3.35, 8, p[0], 1.67, p[1], sunStd(0xdfd6c4, 0.7), root);
      M(new THREE.SphereGeometry(0.08, 10, 8), sunStd(0xffd76a, 0.7), p[0], 3.36, p[1], root);
    });
    function lightStrand(a, b, sag, n, skip) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push(new THREE.Vector3(
          a[0] + (b[0] - a[0]) * u,
          3.30 - Math.sin(u * Math.PI) * sag,
          a[1] + (b[1] - a[1]) * u
        ));
      }
      ropeLine(pts, 0x4a4038);
      for (let i = 1; i < n; i++) {
        if (skip && i === skip) continue;   // M75：两道灯串在正中交叉，交叉点只留一颗灯
        const bulb = M(new THREE.SphereGeometry(0.065, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }),
          pts[i].x, pts[i].y - 0.07, pts[i].z, root);
        bulb.castShadow = false;
        frames.bulbs.push(bulb);
      }
    }
    lightStrand([-6.8, -52.9], [6.8, -43.3], 0.85, 16);
    lightStrand([6.8, -52.9], [-6.8, -43.3], 0.85, 16, 8);

    // 篱笆上的霓虹字牌（做成一块真的招牌：深色底板 + 发光的字 + 一圈小灯泡）
    const neonTex = makeTex(1024, 256, function (gg, W, H) {
      gg.fillStyle = '#22384a';
      gg.fillRect(0, 0, W, H);
      gg.strokeStyle = '#3f5f74';
      gg.lineWidth = 14;
      gg.strokeRect(8, 8, W - 16, H - 16);
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.font = 'bold 116px ' + FONT;
      gg.shadowColor = '#7fe6ff';
      gg.shadowBlur = 34;
      gg.fillStyle = '#d8f7ff';
      gg.fillText('小鲸鱼水上乐园', W / 2, H / 2 + 4);
      gg.shadowBlur = 0;
      gg.fillStyle = '#ffffff';
      gg.fillText('小鲸鱼水上乐园', W / 2, H / 2 + 4);
    });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.90),
      new THREE.MeshBasicMaterial({ map: neonTex, toneMapped: false }));
    neon.position.set(CX, 3.05, PZ0 - 0.28);
    root.add(neon);
    frames.neon = neon;
    // 招牌上的小灯泡
    for (let i = 0; i < 13; i++) {
      const b = M(new THREE.SphereGeometry(0.075, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }),
        CX - 3.6 + i * 0.6, 4.12, PZ0 - 0.22, root);
      b.castShadow = false;
      frames.bulbs.push(b);
    }
  }

  /* ---------- 铺装 + 更多绿植 ---------- */
  function buildPromenade() {
    // 从门口到池边的一条暖色木栈道
    const plankTex = makeTex(128, 256, function (g, W, H) {
      g.fillStyle = '#d8c09a';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#bfa276';
      g.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(0, i * H / 8);
        g.lineTo(W, i * H / 8);
        g.stroke();
      }
    }, [1, 12]);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 8.4),
      new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(-6.0, 0.025, -39.9);
    root.add(walk);

    // 池边一圈彩色瓷砖镶边
    const bandMat = sunStd(0x8fd6ea, 0.8);
    const band2 = sunStd(0xf2876b, 0.8);
    [-1, 1].forEach(function (s) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(13.0, 0.30), s > 0 ? bandMat : band2);
      b.rotation.x = -Math.PI / 2;
      b.position.set(0, 0.02, s > 0 ? -43.55 : -52.45);
      root.add(b);
      const b2 = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 8.9), s > 0 ? bandMat : band2);
      b2.rotation.x = -Math.PI / 2;
      b2.position.set(s > 0 ? 6.55 : -6.55, 0.02, -48);
      root.add(b2);
    });

    // 沿篱笆的灌木 + 花坛
    for (let i = 0; i < 14; i++) {
      const x = -13.0 + i * 2.4;
      const b = M(new THREE.SphereGeometry(0.55 + Math.random() * 0.2, 10, 8),
        sunStd(0x5f9450, 0.9), x, 0.38, -59.3, root);
      b.scale.y = 0.8;
    }
    for (let i = 0; i < 8; i++) {
      const z = -57.5 + i * 2.6;
      M(new THREE.SphereGeometry(0.50 + Math.random() * 0.16, 10, 8),
        sunStd(0x5f9450, 0.9), -13.3, 0.35, z, root);
      M(new THREE.SphereGeometry(0.50 + Math.random() * 0.16, 10, 8),
        sunStd(0x5f9450, 0.9), 19.3, 0.35, z, root);
    }
    // 三个花坛（彩色小花）
    [[-0.4, -36.8], [10.5, -38.4], [-11.6, -48.6]].forEach(function (p) {
      boxMesh(2.2, 0.42, 0.85, p[0], 0.21, p[1], sunStd(0xcfc9b8, 0.9), root);
      const soil = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.68), sunStd(0x6b5a44, 0.95));
      soil.rotation.x = -Math.PI / 2;
      soil.position.set(p[0], 0.43, p[1]);
      root.add(soil);
      for (let i = 0; i < 9; i++) {
        const fl2 = M(new THREE.SphereGeometry(0.075, 8, 6),
          sunStd([0xf58fa8, 0xffd76a, 0xfaf6ee, 0xb98fe0][i % 4], 0.8),
          p[0] - 0.9 + i * 0.22, 0.50, p[1] + (Math.random() - 0.5) * 0.44, root);
        fl2.castShadow = false;
      }
    });

    // 再来两棵棕榈
    [[10.2, -58.7, 3.3], [-13.4, -49.4, 3.0], [18.9, -47.6, 3.1]].forEach(function (p) {
      const g2 = new THREE.Group();
      g2.position.set(p[0], 0, p[1]);
      root.add(g2);
      const H = p[2];
      cylMesh(0.13, 0.19, H, 8, 0, H / 2, 0, sunStd(0xb98d5c, 0.9), g2);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.35;
        const lf = M(new THREE.ConeGeometry(0.28, 1.45, 4), sunStd(0x6fae66, 0.9),
          Math.cos(a) * 0.5, H + 0.04, Math.sin(a) * 0.5, g2);
        lf.rotation.z = Math.cos(a) * 1.05;
        lf.rotation.x = Math.sin(a) * 1.05;
        lf.scale.set(1, 1, 0.22);
      }
      blob(p[0], p[1], 1.0, 0.03);
    });

    // 沙滩球再多两个
    [[-8.6, -40.2], [5.6, -55.4]].forEach(function (p, i) {
      const b = M(new THREE.SphereGeometry(0.26, 14, 10),
        sunStd([0x8fd6ea, 0xffd76a][i], 0.6), p[0], 0.27, p[1], root);
      b.castShadow = true;
    });
  }

  const BCOL2 = [0xf58fa8, 0xffd76a, 0x8fd6ea, 0x9fd6a8];

  /* ================= M33：四周的小吃街 / 商铺 ================= */
  function buyAt(price, itemName) {
    if (!shop || !shop.addMoney) return false;
    const w = shop.wallet ? shop.wallet() : 0;
    if (w < price) {
      if (sfx && sfx.beep) sfx.beep();
      if (tip) tip('零花钱不太够（¥' + w + ' / ¥' + price + '）… 回便利店理货赚点', 3000);
      return false;
    }
    shop.addMoney(-price);
    if (tip) tip('买了' + itemName + ' −¥' + price + ' 🎡（我叼到池子中间的托盘上吃）', 3200);
    return true;
  }

  // 通用小摊：柜台 + 四根柱 + 条纹顶 + 招牌 + 台面 + 可点的热区
  function makeStall(o) {
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.z);
    g.rotation.y = o.ry || 0;
    root.add(g);
    const W = o.w || 2.4;
    const wood = sunStd(0xc9a06a, 0.85);
    const white = sunStd(0xf6f1e6, 0.72);
    const colA = o.colA || '#f7f2e6';
    const colB = o.colB || '#f2876b';

    // 柜台
    boxMesh(W, 0.92, 0.85, 0, 0.46, 0.10, white, g);
    boxMesh(W + 0.12, 0.09, 1.00, 0, 0.96, 0.10, wood, g);
    // 台前的小瓷砖
    const tileTex2 = makeTex(128, 64, function (gg, WW, HH) {
      gg.fillStyle = colA;
      gg.fillRect(0, 0, WW, HH);
      gg.fillStyle = colB;
      for (let i = 0; i < 4; i++) gg.fillRect(i * WW / 4, 0, WW / 8, HH);
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.10, 0.70),
      new THREE.MeshStandardMaterial({ map: tileTex2, roughness: 0.9 }));
    front.position.set(0, 0.50, 0.531);
    g.add(front);
    // 四根柱 + 顶
    [[-W / 2 + 0.08, -0.34], [W / 2 - 0.08, -0.34], [-W / 2 + 0.08, 0.52], [W / 2 - 0.08, 0.52]].forEach(function (p) {
      cylMesh(0.045, 0.05, 2.35, 8, p[0], 1.17, p[1], sunStd(0xdfd6c4, 0.7), g);
    });
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.55, 1.55),
      new THREE.MeshStandardMaterial({
        map: stripeTex(colA, colB), roughness: 0.9, side: THREE.DoubleSide
      }));
    awning.position.set(0, 2.36, 0.10);
    awning.rotation.x = -0.40;
    g.add(awning);
    // 背板（挡一下后面）
    boxMesh(W, 1.55, 0.08, 0, 1.60, -0.52, white, g);
    // 招牌
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.10, 0.62),
      new THREE.MeshBasicMaterial({ map: signTex(o.title, o.sub, o.signBg || '#ffd76a'), toneMapped: false }));
    sign.position.set(0, 2.86, 0.06);
    g.add(sign);
    // 顶上两串小旗
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.22),
        new THREE.MeshBasicMaterial({
          color: [0xf2876b, 0xffd76a, 0x8fd6ea, 0xffffff][i % 4],
          side: THREE.DoubleSide, toneMapped: false
        }));
      f.position.set(-W / 2 + 0.30 + i * (W - 0.60) / 6, 2.20, 0.62);
      f.rotation.x = -0.2;
      g.add(f);
    }
    blob(o.x, o.z + 0.1, W * 0.7, 0.03);
    return { g: g, W: W, wood: wood, white: white };
  }

  function buildFoodStreet() {
    // 北边一排小吃摊（背靠篱笆，朝着泳池）
    const stops = [
      {
        x: -5.2, z: -58.3, title: '椰子水 ¥6', sub: 'COCONUT', kind: 'coconut',
        colB: '#8fd6ea', item: '一颗冰椰子', price: 6,
        say: '椰子水是现开的，插根吸管就能喝'
      },
      {
        x: -1.4, z: -58.3, title: '冰淇淋 ¥8', sub: 'ICE CREAM', kind: 'ice',
        colB: '#f58fa8', item: '一支香草甜筒', price: 8,
        say: '甜筒要趁它还没化，我挑了个尖的'
      },
      {
        x: 2.4, z: -58.3, title: '爆米花 ¥5', sub: 'POPCORN · HOTDOG', kind: 'pop',
        colB: '#ffd76a', item: '一桶焦糖爆米花', price: 5,
        say: '爆米花刚出锅，烫手，我拿个纸桶给你'
      },
      {
        x: 6.2, z: -58.3, title: '小鲸鱼周边 ¥12', sub: 'SOUVENIR', kind: 'shop',
        colB: '#9fd6a8', item: '一只小鲸鱼玩偶', price: 12,
        say: '这只小的像我 —— 抱回去放枕边'
      }
    ];
    stops.forEach(function (s) {
      const st = makeStall({
        x: s.x, z: s.z, w: 2.35, title: s.title, sub: s.sub,
        colA: '#f7f2e6', colB: s.colB, signBg: '#ffd76a'
      });
      const g = st.g;
      const W = st.W;
      if (s.kind === 'coconut') {
        // 椰子堆 + 吸管
        for (let i = 0; i < 4; i++) {
          const cx = -0.78 + i * 0.30;
          const co = M(new THREE.SphereGeometry(0.14, 10, 8), sunStd(0x8a6a48, 0.85), cx, 1.14, 0.16, g);
          co.scale.y = 0.9;
          const top = cylMesh(0.10, 0.10, 0.02, 12, cx, 1.26, 0.16, sunStd(0xf4efe4, 0.7), g);
          void top;
          const straw = cylMesh(0.014, 0.014, 0.22, 6, cx + 0.03, 1.36, 0.16, sunStd(0xf2876b, 0.6), g);
          straw.rotation.z = 0.16;
        }
        // 台面上的杯子
        cylMesh(0.055, 0.05, 0.16, 10, 0.95, 1.10, 0.15, sunStd(0x8fd6ea, 0.5), g);
      } else if (s.kind === 'ice') {
        // 冰淇淋车：两个轮子 + 四个甜筒 + 冰柜
        [-0.55, 0.55].forEach(function (dx) {
          const wheel = M(new THREE.TorusGeometry(0.22, 0.06, 8, 16), sunStd(0x3a3a3a, 0.7), dx, 0.22, 0.62, g);
          wheel.rotation.y = Math.PI / 2;
        });
        boxMesh(1.30, 0.34, 0.50, 0, 1.16, 0.16, sunStd(0xdfe9ef, 0.5), g);
        for (let i = 0; i < 4; i++) {
          const cone = M(new THREE.ConeGeometry(0.085, 0.20, 8), sunStd(0xd8b078, 0.8), -0.42 + i * 0.28, 1.42, 0.16, g);
          cone.rotation.x = Math.PI;
          M(new THREE.SphereGeometry(0.09, 10, 8), sunStd([0xfaf6ee, 0xf58fa8, 0x8fd6ea, 0xffd76a][i], 0.7),
            -0.42 + i * 0.28, 1.55, 0.16, g);
        }
      } else if (s.kind === 'pop') {
        // 爆米花机 + 热狗滚轮
        boxMesh(0.52, 0.46, 0.36, -0.70, 1.20, 0.16, sunStd(0xf2876b, 0.6), g);
        boxMesh(0.40, 0.22, 0.28, -0.70, 1.52, 0.16, new THREE.MeshStandardMaterial({
          color: col(0xdfeaf2), roughness: 0.1, transparent: true, opacity: 0.4
        }), g);
        for (let i = 0; i < 6; i++) {
          M(new THREE.SphereGeometry(0.055, 8, 6), sunStd(0xf7e2a8, 0.9),
            -0.70 + (Math.random() - 0.5) * 0.28, 1.47 + Math.random() * 0.10, 0.16 + (Math.random() - 0.5) * 0.16, g);
        }
        boxMesh(0.50, 0.10, 0.26, 0.05, 1.06, 0.16, sunStd(0xc6d0d8, 0.4, 0.5), g);
        for (let i = 0; i < 4; i++) {
          const hd = cylMesh(0.045, 0.045, 0.20, 8, -0.13 + i * 0.12, 1.15, 0.16, sunStd(0xc96b4a, 0.8), g);
          hd.rotation.z = Math.PI / 2;
        }
        // 台面上的纸桶
        for (let i = 0; i < 3; i++) {
          cylMesh(0.075, 0.055, 0.16, 10, 0.62 + i * 0.16, 1.09, 0.16, sunStd(0xf2876b, 0.8), g);
        }
      } else {
        // 周边：三只小鲸鱼 + 气球
        for (let i = 0; i < 3; i++) {
          const bx = -0.72 + i * 0.36;
          const bw = M(new THREE.SphereGeometry(0.13, 12, 10), std(0x3b6fd4, 0.6), bx, 1.16, 0.16, g);
          bw.scale.set(1.2, 0.85, 1.0);
          const belly = M(new THREE.SphereGeometry(0.10, 10, 8), sunStd(0xf2f7ff, 0.7), bx, 1.10, 0.26, g);
          belly.scale.set(1.0, 0.6, 0.5);
          const tail = M(new THREE.ConeGeometry(0.06, 0.14, 6), std(0x3b6fd4, 0.6), bx + 0.17, 1.22, 0.12, g);
          tail.rotation.z = -0.9;
        }
        // 气球
        for (let i = 0; i < 3; i++) {
          const bal = M(new THREE.SphereGeometry(0.14, 12, 10),
            sunStd([0xf58fa8, 0x8fd6ea, 0xffd76a][i], 0.6), 0.72 + i * 0.10, 1.95 + i * 0.18, 0.12, g);
          bal.castShadow = false;
          const str = cylMesh(0.006, 0.006, 0.55, 4, 0.72 + i * 0.10, 1.62 + i * 0.18, 0.12, sunStd(0xfaf6ee, 0.7), g);
          void str;
        }
      }
      // 可点：买东西
      interact.add({
        id: 'park-stall-' + s.kind,
        label: s.title,
        box: [s.x, 1.05, s.z + 0.10, 2.5, 1.9, 1.4],
        anchor: [s.x, 2.4, s.z + 0.16],
        when: function () { return !!isParkNow && isParkNow(); },
        onClick: function () {
          if (!buyAt(s.price, s.item)) { this._say = '钱不够…去便利店理货赚一点再来'; return; }
          if (s.kind === 'coconut' && sfx && sfx.slurp) sfx.slurp();
          else if (s.kind === 'ice' && sfx && sfx.pop) sfx.pop();
          else if (s.kind === 'pop' && sfx && sfx.bag) sfx.bag();
          else if (sfx && sfx.pickup) sfx.pickup();
          // M34：买了就真吃（小鲸鱼会叼到池子中间的托盘上，一口一口）
          startEat(s.kind === 'shop' ? 'plush' : s.kind);
          this._say = s.say;
        },
        say: function () { return this._say || s.title.replace(' ¥' + s.price, ''); }
      });
    });

    // 小吃街的横招牌
    const streetSign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.0),
      new THREE.MeshBasicMaterial({ map: signTex('小吃街', 'FOOD STREET · 4 家', '#f7f2e6'), toneMapped: false }));
    streetSign.position.set(0.5, 4.30, -58.1);
    root.add(streetSign);
    [[-2.2, -58.1], [3.2, -58.1]].forEach(function (p) {
      cylMesh(0.05, 0.06, 4.30, 8, p[0], 2.15, p[1], sunStd(0xdfd6c4, 0.7), root);
    });
    // 招牌下的小串灯
    for (let i = 0; i <= 12; i++) {
      const b = M(new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe4a8, toneMapped: false }),
        -2.0 + i * 0.42, 3.62 - Math.sin(i / 12 * Math.PI) * 0.16, -57.9, root);
      b.castShadow = false;
      frames.bulbs.push(b);
    }

    // 摊位前面的两张野餐桌
    [[-3.2, -55.6], [4.2, -55.6]].forEach(function (p) {
      const g2 = new THREE.Group();
      g2.position.set(p[0], 0, p[1]);
      root.add(g2);
      const wood = sunStd(0xc9a06a, 0.85);
      const white = sunStd(0xf6f1e6, 0.75);
      // 桌面 + 四条桌腿
      boxMesh(1.05, 0.08, 1.05, 0, 0.74, 0, white, g2);
      [[-0.40, -0.40], [0.40, -0.40], [-0.40, 0.40], [0.40, 0.40]].forEach(function (q) {
        boxMesh(0.07, 0.74, 0.07, q[0], 0.37, q[1], wood, g2);
      });
      // 两条长凳：M38 桌子腿原来贴着凳子（±0.52 正好插进腿里），往外挪到 ±0.70 并给凳子补两条腿
      [-0.70, 0.70].forEach(function (dz) {
        boxMesh(1.05, 0.07, 0.30, 0, 0.45, dz, wood, g2);
        [-0.40, 0.40].forEach(function (dx) {
          boxMesh(0.06, 0.45, 0.06, dx, 0.225, dz, wood, g2);
        });
      });
      // 桌上：托盘和一个杯子
      boxMesh(0.34, 0.04, 0.34, 0.10, 0.80, 0, sunStd(0xd8cfbc, 0.85), g2);
      cylMesh(0.05, 0.045, 0.13, 10, 0.10, 0.85, 0.04, sunStd(0x8fd6ea, 0.6), g2);
      blob(p[0], p[1], 1.0, 0.03);
    });

    // 垃圾桶 + 厕所牌
    [[-7.6, -57.4], [8.6, -57.2]].forEach(function (p) {
      const g3 = new THREE.Group();
      g3.position.set(p[0], 0, p[1]);
      root.add(g3);
      cylMesh(0.24, 0.20, 0.62, 14, 0, 0.31, 0, sunStd(0x8fa8b4, 0.8), g3);
      const lid = M(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 14), sunStd(0x6f8794, 0.8), 0, 0.65, 0, g3);
      void lid;
      boxMesh(0.16, 0.10, 0.02, 0, 0.42, 0.245, sunStd(0xfaf6ee, 0.8), g3);
    });
    const wc = new THREE.Mesh(new THREE.PlaneGeometry(0.60, 0.80),
      new THREE.MeshBasicMaterial({ map: signTex('WC', '洗手间 →', '#8fd6ea'), toneMapped: false }));
    wc.position.set(-13.0, 2.20, -35.4);
    wc.rotation.y = Math.PI / 2;
    root.add(wc);

    // 西边再补两个小摊（朝着泳池）：棉花糖 + 烤玉米
    const west = [
      { x: -13.1, z: -44.9, title: '棉花糖 ¥4', sub: 'COTTON CANDY', colB: '#f58fa8', kind: 'candy', item: '一支棉花糖', price: 4,
        say: '棉花糖比脸大，拍照先用这个' },
      { x: -13.1, z: -51.4, title: '烤玉米 ¥5', sub: 'GRILLED CORN', colB: '#ffd76a', kind: 'corn', item: '一根烤玉米', price: 5,
        say: '刷了黄油，趁热吃' }
    ];
    west.forEach(function (s) {
      const st = makeStall({
        x: s.x, z: s.z, ry: Math.PI / 2, w: 2.05,
        title: s.title, sub: s.sub, colA: '#f7f2e6', colB: s.colB, signBg: '#ffd76a'
      });
      const g = st.g;
      if (s.kind === 'candy') {
        // 棉花糖机 + 粉白棉花团
        cylMesh(0.16, 0.20, 0.26, 14, -0.45, 1.10, 0.16, sunStd(0xc6d0d8, 0.5, 0.4), g);
        for (let i = 0; i < 3; i++) {
          const c = M(new THREE.SphereGeometry(0.20 + i * 0.03, 12, 10),
            sunStd(i % 2 ? 0xf7c9d8 : 0xfaf6ee, 0.95), 0.35, 1.40 + i * 0.16, 0.16, g);
          c.castShadow = false;
        }
        const stick = cylMesh(0.012, 0.012, 0.55, 6, 0.35, 1.10, 0.16, sunStd(0xd8bf94, 0.9), g);
        void stick;
      } else {
        // 烤炉 + 三根玉米
        boxMesh(0.70, 0.24, 0.40, 0, 1.10, 0.16, sunStd(0x4a4a4a, 0.8), g);
        for (let i = 0; i < 3; i++) {
          const cn = cylMesh(0.06, 0.06, 0.34, 8, -0.20 + i * 0.20, 1.24, 0.16, sunStd(0xe8c45a, 0.8), g);
          cn.rotation.z = Math.PI / 2;
        }
        boxMesh(0.30, 0.10, 0.26, 0.55, 1.12, 0.16, sunStd(0xdfe9ef, 0.6), g);
      }
      interact.add({
        id: 'park-stall-' + s.kind,
        label: s.title,
        box: [s.x, 1.05, s.z + 0.10, 1.4, 1.9, 2.4],
        anchor: [s.x + 0.6, 2.4, s.z],
        when: function () { return !!isParkNow && isParkNow(); },
        onClick: function () {
          if (!buyAt(s.price, s.item)) { this._say = '钱不够…去便利店理货赚一点再来'; return; }
          if (s.kind === 'candy' && sfx && sfx.pop) sfx.pop();
          else if (sfx && sfx.bag) sfx.bag();
          // M34：买了就真吃（顺便把以前那条一直响的"烤炉滋滋"声去掉了）
          startEat(s.kind);
          this._say = s.say;
        },
        say: function () { return this._say || s.title.replace(' ¥' + s.price, ''); }
      });
    });
  }

  /* ================= 可点的地方 ================= */
  /* ================= M34：买来的东西真的吃 / 真的玩 =================
   * 妈妈说：买完东西要有吃东西的音效；水里要有跳/游的互动；游乐设施也要能玩。
   * 所以：小摊买完 → 小鲸鱼叼着那份东西到池子中间的托盘上吃（一口一口，带声音）；
   *      点水面 → 它潜过去再扎起来；点它 → 甩你一身水；
   *      滑水道冲下来 → 甩水；点浮圈 → 趴上去漂；点蘑菇池 → 跑去淋水；点排球网 → 扣一球。
   */

  // 每种吃的：咬几口 / 每口的声音（sip 吸管、crunch 脆、chew 软、gulp 咽）
  const EAT_KINDS = {
    coconut: { total: 4, sounds: ['sip', 'sip', 'sip', 'gulp'], start: '椰子水先吸一口——', end: '壳留着，回去能当小碗' },
    ice:     { total: 5, sounds: ['crunch', 'crunch', 'crunch', 'crunch', 'crunch'], start: '甜筒要趁化之前吃完', end: '脆的最后一口在我嘴里了' },
    pop:     { total: 5, sounds: ['chew', 'chew', 'chew', 'chew', 'chew'], start: '刚出锅的，烫', end: '桶底还有几颗焦糖的' },
    candy:   { total: 3, sounds: ['chew', 'chew', 'chew'], start: '棉花糖一咬就没了', end: '嘴巴黏住了，你别笑' },
    corn:    { total: 4, sounds: ['crunch', 'chew', 'crunch', 'chew'], start: '黄油化在玉米上了', end: '擦擦嘴，假装没吃过' },
    drink:   { total: 3, sounds: ['sip', 'sip', 'gulp'], start: '冰的，先含一口', end: '汽有点冲鼻子（咳）' },
    plush:   { total: 0, sounds: [], start: '这只小的像我 —— 抱紧', end: '回去放枕边，晚上不孤单' }
  };

  // 吃的长什么样（都是小东西，漂在水面的托盘上）
  function makeFood(kind) {
    const g = new THREE.Group();
    const white = sunStd(0xfaf6ee, 0.72);
    const wood = sunStd(0xd8bf94, 0.85);
    if (kind === 'coconut') {
      const co = M(new THREE.SphereGeometry(0.17, 14, 10), sunStd(0x8a6a48, 0.9), 0, 0.05, 0, g);
      co.scale.y = 0.94;
      cylMesh(0.115, 0.115, 0.022, 14, 0, 0.19, 0, sunStd(0xf4efe4, 0.7), g);
      const straw = cylMesh(0.014, 0.014, 0.26, 6, 0.045, 0.30, 0, sunStd(0xf2876b, 0.6), g);
      straw.rotation.z = 0.20;
    } else if (kind === 'ice') {
      const cone = M(new THREE.ConeGeometry(0.085, 0.22, 10), sunStd(0xd8b078, 0.88), 0, 0.10, 0, g);
      cone.rotation.x = Math.PI;
      M(new THREE.SphereGeometry(0.095, 12, 9), white, 0, 0.24, 0, g);
      M(new THREE.SphereGeometry(0.045, 8, 6), sunStd(0xf58fa8, 0.7), 0.05, 0.30, 0.03, g);
    } else if (kind === 'pop') {
      cylMesh(0.095, 0.075, 0.22, 14, 0, 0.13, 0, sunStd(0xf2876b, 0.85), g);
      const band = M(new THREE.TorusGeometry(0.092, 0.014, 6, 16), white, 0, 0.19, 0, g);
      band.rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        M(new THREE.SphereGeometry(0.038, 8, 6), sunStd(0xf7e2a8, 0.9),
          Math.cos(a) * 0.05, 0.26 + (i % 2) * 0.02, Math.sin(a) * 0.05, g);
      }
    } else if (kind === 'candy') {
      const stick = cylMesh(0.011, 0.011, 0.30, 6, 0, 0.14, 0, wood, g);
      void stick;
      const puff = M(new THREE.SphereGeometry(0.155, 14, 10), sunStd(0xf7c9d8, 0.98), 0, 0.34, 0, g);
      puff.castShadow = false;
      M(new THREE.SphereGeometry(0.10, 12, 9), sunStd(0xfaf6ee, 0.98), 0.06, 0.40, 0.05, g).castShadow = false;
    } else if (kind === 'corn') {
      cylMesh(0.013, 0.013, 0.24, 6, 0, 0.10, 0, wood, g);
      const c2 = cylMesh(0.062, 0.058, 0.24, 12, 0, 0.28, 0, sunStd(0xe8c45a, 0.85), g);
      void c2;
      boxMesh(0.055, 0.045, 0.055, 0, 0.33, 0, sunStd(0xf7e2a8, 0.6), g);
    } else if (kind === 'drink') {
      cylMesh(0.075, 0.062, 0.20, 14, 0, 0.12, 0, sunStd(0x8fd6ea, 0.45), g);
      cylMesh(0.078, 0.078, 0.018, 14, 0, 0.22, 0, white, g);
      const straw = cylMesh(0.012, 0.012, 0.24, 6, 0.03, 0.33, 0, sunStd(0xf2876b, 0.6), g);
      straw.rotation.z = 0.16;
    } else {
      const pl = (XD.Workspace && XD.Workspace.miniOrca) ? XD.Workspace.miniOrca(0.30) : null;
      if (pl) { pl.position.set(0, 0.16, 0); g.add(pl); }
      else M(new THREE.SphereGeometry(0.14, 12, 10), std(0x3b6fd4, 0.6), 0, 0.16, 0, g).scale.set(1.2, 0.85, 1);
    }
    // 漂在水上的小托盘
    const tray = M(new THREE.CylinderGeometry(0.26, 0.24, 0.035, 18), sunStd(0xd8cfbc, 0.85), 0, 0.015, 0, g);
    void tray;
    return g;
  }

  function clearEatProp() {
    if (eatProp) {
      if (eatProp.parent) eatProp.parent.remove(eatProp);
      eatProp = null;
    }
  }

  function orcaInPool() {
    if (!orca) return false;
    return orca.position.x > POOL.x0 - 0.4 && orca.position.x < POOL.x1 + 0.4 &&
      orca.position.z > POOL.z0 - 0.4 && orca.position.z < POOL.z1 + 0.4;
  }

  // 按路点游：pts=[{x,z,y,dur,fx,fxLoop,every,pitch}]，到点可以放个声音
  function startPath(pts, onDone) {
    if (!orca || !pts.length) return false;
    orcaMode = 'path';
    orca.scale.setScalar(frames.orcScale || 1);   // 躺椅子时缩过，出发前恢复
    shakeT = -1; petT = -1; floatT = -1; eatT = -1;
    pathQ = {
      pts: pts, i: 0, t: 0, onDone: onDone || null,
      from: { x: orca.position.x, y: orca.position.y, z: orca.position.z }
    };
    return true;
  }

  /* M34：胖虎鲸这个模型的身体是沿着**局部 -X** 朝前的（眼睛/嘴在 -X 那一头，尾鳍在 +X），
   * 所以"朝某方向"要按 (-x, z) 算；以前直接用 atan2(dx,dz) 是把它摆成"横着游"。
   */
  function faceDir(dx, dz) {
    return Math.atan2(dz, -dx);
  }

  function syncSwimAngle() {
    if (!orca) return;
    const rx = 3.30, rz = 2.30;
    orcaA = Math.atan2((orca.position.z - POOL_CZ) / rz, (orca.position.x - POOL_CX) / rx);
  }

  function backToSwim() {
    if (orca) {
      orca.rotation.x = 0;
      orca.rotation.z = 0;
      orca.scale.setScalar(frames.orcScale || 1);   // 恢复原大小（躺椅子时会缩到 0.78）
      if (!orcaInPool()) {
        orca.position.set(POOL_CX + 1.2, WATER_Y + 0.05, POOL_CZ);
      }
      syncSwimAngle();
    }
    pathQ = null;
    eatT = -1; shakeT = -1; petT = -1; floatT = -1; boardT = -1;
    orcaMode = 'swim';
  }

  /* ---- 吃买来的东西 ---- */
  function startEat(kind) {
    if (!orca || eatT >= 0 || pathQ || orcaMode === 'slide') return false;
    if (!EAT_KINDS[kind]) return false;
    if (!orcaInPool()) { say('等我游回池子里再吃——', 2600); return false; }
    const cfg = EAT_KINDS[kind];
    say(cfg.start || '我先尝一口', 3000);
    return startPath([
      { x: snackSpot.x, z: snackSpot.z - 0.92, y: WATER_Y + 0.05, dur: 1.45, pitch: 0 }
    ], function () {
      clearEatProp();
      eatProp = makeFood(kind);
      eatProp.position.set(snackSpot.x, WATER_Y + 0.06, snackSpot.z);
      eatProp.scale.setScalar(1.35);   // 放大一点，站在池边也看得清
      root.add(eatProp);
      ringAt(snackSpot.x, snackSpot.z, 0.55, 1.2);
      eatKind = kind;
      eatBites = 0;
      eatTotal = cfg.total;
      eatT = 0;
      eatNext = cfg.total > 0 ? 0.75 : 2.6;
      orcaMode = 'eat';
      orca.position.set(snackSpot.x, WATER_Y + 0.05, snackSpot.z - 0.92);
      orca.rotation.set(0, 0, 0);
    });
  }

  /* ---- 点水面：潜到那儿再扎起来 ---- */
  function startDive(x, z) {
    if (!orca || eatT >= 0 || orcaMode === 'slide' || petT >= 0 || floatT >= 0) return false;
    x = Math.max(POOL.x0 + 1.1, Math.min(POOL.x1 - 1.1, x));
    z = Math.max(POOL.z0 + 1.1, Math.min(POOL.z1 - 1.1, z));
    const swimY = WATER_Y + 0.05;
    return startPath([
      { x: x, z: z, y: swimY, dur: 0.85, pitch: 0 },
      { x: x, z: z, y: WATER_Y - 0.62, dur: 0.60, pitch: 0.34, fx: 'parkDive' },
      { x: x, z: z, y: swimY + 1.05, dur: 0.44, pitch: -0.55, fx: 'parkSplash' },
      { x: x, z: z, y: swimY, dur: 0.40, pitch: 0 }
    ], null);
  }

  /* ---- 拍它一下：甩你一身水 ---- */
  function petOrca() {
    if (!orca) return false;
    if (petT >= 0 || eatT >= 0 || orcaMode === 'slide' || orcaMode === 'path') return false;
    petT = 0;
    orcaMode = 'pet';
    if (sfx && sfx.parkShake) sfx.parkShake();
    spawnDrops(orca.position.x, orca.position.y + 0.35, orca.position.z, 12, 0.9);
    spawnBubbles(orca.position.x, WATER_Y - 0.1, orca.position.z, 4, 0.5);
    say(pick([
      '诶——凉！手别摸我背',
      '再拍一下我就翻过来了',
      '我抖一下水，你躲远点',
      '被你拍到就装不了高冷了'
    ]), 3400);
    return true;
  }

  /* ---- 浮圈：趴上去漂一会 ---- */
  function startFloat() {
    if (!orca || eatT >= 0 || petT >= 0 || orcaMode === 'slide' || orcaMode === 'path') return false;
    const f0 = (frames.floats && frames.floats[0]) || { x: 2.8, z: -49.7 };
    say('下巴搁在圈上，能漂一下午', 3200);
    return startPath([
      { x: f0.x + 1.02, z: f0.z, y: WATER_Y + 0.06, dur: 1.0, pitch: 0 }
    ], function () {
      orcaMode = 'float';
      floatT = 0;
    });
  }

  /* ---- 蘑菇戏水池：跑过去淋一身水 ---- */
  function startPad() {
    if (!orca || eatT >= 0 || petT >= 0 || floatT >= 0 || orcaMode === 'slide' || orcaMode === 'path') return false;
    say('蘑菇底下会下雨，我去淋一下', 3000);
    return startPath([
      { x: 6.5, z: -47.0, y: WATER_Y + 0.05, dur: 1.0 },
      { x: 9.9, z: -47.0, y: 0.46, dur: 0.80, pitch: 0.10, fx: 'parkSplashSmall' },
      { x: 11.8, z: -46.3, y: 0.34, dur: 0.80, pitch: 0.14 },
      { x: 13.6, z: -46.3, y: 0.28, dur: 0.90, pitch: 0.14, fxLoop: 'splash', every: 0.50 },
      { x: 13.6, z: -46.3, y: 0.28, dur: 1.70, pitch: 0.14, fxLoop: 'splash', every: 0.45 },
      { x: 11.5, z: -46.8, y: 0.36, dur: 0.70 },
      { x: 9.6, z: -47.0, y: 0.46, dur: 0.70 },
      { x: 6.4, z: -47.0, y: WATER_Y + 0.05, dur: 0.95, fx: 'parkSplash' }
    ], function () {
      say('凉快——蘑菇的雨比滑道温柔', 3200);
      ringAt(orca.position.x, orca.position.z, 0.6, 1.2);
    });
  }

  /* ---- 排球：我扣一球 ---- */
  function startVolley() {
    if (!frames.volley || volleyT >= 0) return false;
    const b = frames.volley;
    b.position.copy(frames.volleyHome);
    if (frames.volleyStripe) frames.volleyStripe.position.copy(b.position);
    volleyT = 0;
    volleyV = { x: (Math.random() - 0.5) * 0.7, y: 4.6, z: -0.9 - Math.random() * 0.6 };
    if (sfx && sfx.pop) sfx.pop();
    say(pick(['我扣一个！看球', '跳起来打的，别眨眼', '球不长眼睛，你别站网那边']), 3400);
    return true;
  }

  function register() {
    if (!interact || !interact.add) return;
    const when = function () { return !!isParkNow(); };

    // 泳池：点远处的水面 = 它潜过去，再"哗"一下扎起来
    interact.add({
      id: 'park-water', label: '泳池',
      box: [POOL_CX, WATER_Y + 0.05, POOL_CZ, POOL.x1 - POOL.x0 - 0.6, 0.30, POOL.z1 - POOL.z0 - 0.6],
      anchor: [POOL_CX, 0.55, POOL_CZ],
      when: when,
      onClick: function (h) {
        const p = h && h._lastHit;
        const x = p ? p.x : POOL_CX;
        const z = p ? p.z : POOL_CZ;
        if (startDive(x, z)) {
          say('潜到那边去——等我在水底下', 2600);
          this._say = '我扎下去的地方会先冒一圈泡';
        } else if (jumpT < 0) {
          jumpT = 0;
          orcaMode = 'jump';
          this._say = '水是温的，我试过了 —— 下来玩呀';
        }
      },
      say: function () {
        return this._say || ['点水面，我潜过去给你看', '水是温的，我试过了', '别踩池边，滑'][Math.floor(Math.random() * 3)];
      }
    });

    // 小鲸鱼本体：这个热区每帧跟着它走（点它就是拍它一下）
    orcaHot = interact.add({
      id: 'park-orca', label: '小鲸鱼 · 拍一下',
      box: [POOL_CX, WATER_Y + 0.45, POOL_CZ, 1.7, 1.3, 2.5],
      anchor: [POOL_CX, 1.15, POOL_CZ],
      when: when,
      onClick: function () { petOrca(); },
      say: function () {
        return this._say || '拍我一下试试——我会甩你一身水';
      }
    });

    // 水里的浮圈：点它，小鲸鱼趴上去漂
    interact.add({
      id: 'park-float', label: '浮圈',
      box: [2.8, 0.24, -49.7, 1.5, 0.6, 1.5],
      anchor: [2.8, 0.85, -49.7],
      when: when,
      onClick: function () {
        if (!startFloat()) this._say = '圈太小了，我下巴只能搁上去';
      },
      say: function () { return this._say || '点一下，我趴上去漂给你看'; }
    });

    // 滑水道
    interact.add({
      id: 'park-slide', label: '滑水道',
      box: [9.2, 2.6, -52.4, 4.4, 4.6, 6.0],
      anchor: [9.4, 5.1, -53.0],
      when: when,
      onClick: function () {
        // M56：以前只有池子里那只胖虎鲸滑；现在点一下是小D自己爬上去冲下来
        if (!startSlideRide()) this._say = '等一下，我还没站稳……';
      },
      say: function () {
        if (ride.on) return '冲下去啦——风好凉！';
        return this._say || '点一下，我就爬上去、顺着滑道冲进水里';
      }
    });

    // 冰棍摊
    interact.add({
      id: 'park-stand', label: '冰棍摊 ¥6',
      box: [-3.6, 1.15, -36.2, 2.6, 1.9, 1.3],
      anchor: [-3.6, 2.1, -36.2],
      when: when,
      onClick: function () {
        if (!shop || !shop.addMoney) return;
        const w = shop.wallet ? shop.wallet() : 0;
        if (w < 6) {
          if (sfx && sfx.beep) sfx.beep();
          this._say = '钱不够啦（¥' + w + ' / ¥6），去店里赚点再来';
          return;
        }
        shop.addMoney(-6);
        if (popsicle) popsicle.visible = true;
        if (sfx && sfx.pop) sfx.pop();
        setTimeout(function () { startEat('ice'); }, 420);
        this._say = '西瓜味的，我先咬一口——';
        if (tip) tip('买了一根冰棍 −¥6 🍧　（钱是店里赚的）', 3000);
      },
      say: function () { return this._say || '冰柜里还有西瓜和沙冰'; }
    });

    // 喷泉
    interact.add({
      id: 'park-fountain', label: '喷泉',
      box: [6.6, 0.55, -36.6, 4.2, 1.2, 4.2],
      anchor: [6.6, 1.5, -36.6],
      when: when,
      onClick: function () {
        glowT = 2.2;
        if (sfx && sfx.water) sfx.water();
        this._say = '水柱一冲能到两米高，我试过（湿了）';
      },
      say: function () { return this._say || '站在下风口会一身水'; }
    });

    // 沙滩球
    interact.add({
      id: 'park-ball', label: '沙滩球',
      box: [-2.6, 0.34, -40.6, 0.7, 0.7, 0.7],
      anchor: [-2.6, 0.85, -40.6],
      when: when,
      onClick: function () {
        if (ballVy !== 0) return;
        ballVy = 3.4;
        if (sfx && sfx.pop) sfx.pop();
        this._say = '拍一下能跳半米高';
      },
      say: function () { return this._say || '球太轻了，一吹就跑'; }
    });

    // 拍照位
    interact.add({
      id: 'park-photo', label: '最佳拍照位',
      box: [2.0, 1.25, -42.0, 2.0, 2.6, 1.6],
      anchor: [2.0, 2.9, -42.0],
      when: when,
      onClick: function () {
        if (orca) {
          orcaMode = 'pose';
          poseT = 0;
        }
        if (tip) tip('站好了 📷 按 P 拍我（照片会自己上图墙）', 4000);
        this._say = '来，我给你站好 —— 按 P 拍，别把我拍糊了';
      },
      say: function () { return this._say || '这儿拍出来最好看'; }
    });

    // 更衣室
    interact.add({
      id: 'park-hut', label: '更衣室',
      box: [-10.5, 1.20, -35.6, 4.0, 2.4, 2.0],
      anchor: [-10.5, 2.6, -35.6],
      when: when,
      say: '帘子里面我挂了条干毛巾，你随便用'
    });

    // 园门
    interact.add({
      id: 'park-gate', label: '园门',
      box: [CX - 8.0, 2.0, -34.6, 5.6, 4.0, 0.5],
      anchor: [CX - 8.0, 4.6, -34.6],
      when: when,
      say: '今天不收门票。想玩多久玩多久'
    });

    // 躺椅
    interact.add({
      id: 'park-lounger', label: '躺椅',
      box: [PX0 + 3.0, 0.55, -39.0, 2.0, 1.2, 3.4],
      anchor: [PX0 + 3.0, 1.2, -39.0],
      when: when,
      onClick: function () {
        if (orca) {
          orcaMode = 'lie';
          poseT = 0;
        }
        this._say = '躺这儿能看见天，也能看见你';
      },
      say: function () { return this._say || '伞底下晒不到'; }
    });

    // M36：跳板（点一下小鲸鱼爬上去跳下来）
    interact.add({
      id: 'park-board', label: '跳板',
      box: [POOL_CX, 1.05, -52.2, 1.5, 1.3, 2.8],
      anchor: [POOL_CX, 2.0, -52.4],
      when: when,
      onClick: function () {
        if (!startBoardDive()) this._say = '等我把这轮玩完';
      },
      say: function () { return this._say || '点一下，我从跳板上跳进池子'; }
    });

    // M36：地喷步道（点一下开/关）
    interact.add({
      id: 'park-walkjet', label: '地喷步道',
      box: [-6.0, 0.55, -39.1, 2.2, 1.3, 6.6],
      anchor: [-6.0, 1.5, -39.1],
      when: when,
      onClick: function () {
        walkJetOn = !walkJetOn;
        if (walkJetOn) {
          if (sfx && sfx.parkSplash) sfx.parkSplash();
          this._say = '喷起来了 —— 从这条路走过去会凉快';
        } else {
          this._say = '先关一会儿，路是干的';
        }
      },
      say: function () { return this._say || (walkJetOn ? '点一下，把水关掉' : '点一下，把水打开'); }
    });

    // M36：门口的水雾拱门
    interact.add({
      id: 'park-mist', label: '水雾拱门',
      box: [-6.0, 1.4, -40.5, 2.9, 2.8, 1.0],
      anchor: [-6.0, 3.0, -40.5],
      when: when,
      onClick: function () {
        mistOn = !mistOn;
        if (mistOn) {
          if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
          this._say = '雾打开了 —— 走过来像下小雨';
        } else {
          this._say = '雾先关了';
        }
      },
      say: function () { return this._say || (mistOn ? '点一下，把雾关掉' : '点一下，把雾打开'); }
    });

    /* ---------- M32.5 加的几处（照真人池子的样子） ---------- */
    // 会喷水的蘑菇浅水池
    interact.add({
      id: 'park-splash', label: '蘑菇戏水池',
      box: [14.6, 0.55, -47.0, 4.8, 2.2, 4.8],
      anchor: [14.6, 2.3, -47.0],
      when: when,
      onClick: function () {
        if (!startPad()) {
          if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
          this._say = '你等我玩完这个再去淋蘑菇';
        }
        if (tip) tip('点它一下，小鲸鱼会跑到蘑菇底下淋水', 3400);
      },
      say: function () { return this._say || '会喷水的蘑菇🍄'; }
    });

    // 池边水吧
    interact.add({
      id: 'park-bar', label: '池边水吧',
      box: [15.9, 1.35, -53.3, 3.6, 2.4, 2.4],
      anchor: [15.9, 2.9, -53.3],
      when: when,
      onClick: function () {
        if (!shop || !shop.addMoney) return;
        const w = shop.wallet ? shop.wallet() : 0;
        if (w < 8) {
          if (sfx && sfx.beep) sfx.beep();
          this._say = '钱不够啦（¥' + w + ' / ¥8），去店里理货赚点';
          return;
        }
        shop.addMoney(-8);
        if (sfx && sfx.pour) sfx.pour();
        this._say = '给你调了杯冰汽水，我先喝一口';
        if (tip) tip('在池边水吧喝了一杯 −¥8 🥤', 3000);
        setTimeout(function () { startEat('drink'); }, 480);
      },
      say: function () { return this._say || '冰汽水 ¥8 · 西瓜汁 ¥10'; }
    });

    // 沙滩排球
    interact.add({
      id: 'park-net', label: '沙滩排球',
      box: [-10.3, 1.35, -56.3, 4.6, 2.0, 2.2],
      anchor: [-10.3, 2.3, -56.3],
      when: when,
      onClick: function () {
        if (!startVolley()) this._say = '球还在飞，等它落下来';
      },
      say: function () { return this._say || '点网，我跳起来扣一个'; }
    });

    // 凉棚长桌
    interact.add({
      id: 'park-pergola', label: '凉棚',
      box: [14.0, 1.10, -38.2, 3.4, 1.4, 2.0],
      anchor: [14.0, 2.0, -38.2],
      when: when,
      onClick: function () {
        this._say = '西瓜切好了，先吃一块再下水';
      },
      say: function () { return this._say || '棚子底下凉快，风从池子那边来'; }
    });

    // 园区地图牌
    interact.add({
      id: 'park-map', label: '园区地图',
      box: [-12.55, 1.60, -37.9, 1.8, 1.6, 0.6],
      anchor: [-12.2, 2.7, -37.9],
      when: when,
      onClick: function () {
        this._say = '左边是沙滩排球，右边是滑水道，中间水池随便泡';
        if (tip) tip('地图：游泳池 · 滑水道 · 蘑菇浅水池 · 水吧 · 排球沙坑 · 凉棚', 4200);
      },
      say: function () { return this._say || '园区地图'; }
    });
  }

  /* ================= 每帧 ================= */
  function updateWater(dt) {
    if (!water || !waterPos) return;
    const arr = waterPos.array;
    for (let i = 0; i < waterPos.count; i++) {
      const bx = waterBase[i * 3];
      const by = waterBase[i * 3 + 1];
      const z = Math.sin(bx * 0.85 + t * 1.5) * 0.035 +
        Math.sin(by * 0.62 - t * 1.15) * 0.028 +
        Math.sin((bx + by) * 0.42 + t * 2.1) * 0.014;
      arr[i * 3 + 2] = z;
    }
    waterPos.needsUpdate = true;
    if (water.material.map) {
      water.material.map.offset.x = t * 0.012;
      water.material.map.offset.y = t * 0.008;
    }
    if (frames.waterTick === undefined) frames.waterTick = 0;
    frames.waterTick += dt;
    if (frames.waterTick > 0.12) {
      frames.waterTick = 0;
      water.geometry.computeVertexNormals();
    }
  }

  /* ---------- M34：按路点游（潜/淋水/去吃/趴浮圈都用它） ---------- */
  function updatePath(dt) {
    if (!pathQ || !orca) return;
    const seg = pathQ.pts[pathQ.i];
    if (!seg) { backToSwim(); return; }
    pathQ.t += dt;
    const dur = seg.dur || 0.8;
    const u = Math.min(1, pathQ.t / dur);
    const e = u * u * (3 - 2 * u);
    const f = pathQ.from;
    const yTo = seg.y === undefined ? (WATER_Y + 0.05) : seg.y;
    orca.position.x = f.x + (seg.x - f.x) * e;
    orca.position.z = f.z + (seg.z - f.z) * e;
    orca.position.y = f.y + (yTo - f.y) * e;
    const dx = seg.x - f.x, dz = seg.z - f.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.02) orca.rotation.y = faceDir(dx, dz);
    // 身体长轴是局部 X，所以"抬头/低头"是绕 Z 转（rotation.x 是滚转）
    orca.rotation.z = (seg.pitch || 0) * e + Math.sin(t * 2.2) * 0.04;
    orca.rotation.x = 0;
    // 在水底下：一路冒泡；贴着水面：一路小涟漪
    if (orca.position.y < WATER_Y - 0.12) {
      pathQ.bub = (pathQ.bub || 0) + dt;
      if (pathQ.bub > 0.16) { pathQ.bub = 0; spawnBubbles(orca.position.x, orca.position.y, orca.position.z, 1, 0.34); }
    } else if (orca.position.y < WATER_Y + 0.24) {
      if (Math.random() < dt * 2.0) ringAt(orca.position.x, orca.position.z, 0.36, 0.95);
    }
    // 停在一段里反复溅水（蘑菇池那种）
    if (seg.fxLoop) {
      seg._acc = (seg._acc || 0) + dt;
      if (seg._acc > (seg.every || 0.5)) {
        seg._acc = 0;
        if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
        spawnDrops(orca.position.x, orca.position.y + 0.10, orca.position.z, 5, 0.55);
        ringAt(orca.position.x, orca.position.z, 0.44, 1.0);
      }
    }
    if (u >= 1) {
      if (seg.fx && sfx && sfx[seg.fx]) { try { sfx[seg.fx](); } catch (err) { /* 没声音也能玩 */ } }
      if (seg.fx === 'parkSplash' || seg.fx === 'parkDive') {
        spawnDrops(orca.position.x, WATER_Y + 0.18, orca.position.z, 18, 1.1);
      }
      pathQ.from = { x: orca.position.x, y: orca.position.y, z: orca.position.z };
      pathQ.i++;
      pathQ.t = 0;
      if (pathQ.i >= pathQ.pts.length) {
        const cb = pathQ.onDone;
        pathQ = null;
        orcaMode = 'swim';
        if (cb) { try { cb(); } catch (err) { } }
        else backToSwim();
      }
    }
  }

  /* ---------- M34：吃买来的东西 ---------- */
  function updateEat(dt) {
    const cfg = EAT_KINDS[eatKind] || { total: 3, sounds: ['chew'] };
    eatT += dt;
    if (eatProp) {
      orca.rotation.y = faceDir(eatProp.position.x - orca.position.x, eatProp.position.z - orca.position.z);
    }
    orca.rotation.z = Math.sin(t * 2.0) * 0.05;
    orca.position.y = WATER_Y + 0.05 + Math.sin(t * 1.6) * 0.018;
    // 低头咬的那一下（绕 Z：正数 = 鼻子朝下）
    const since = eatT - (eatNext - 0.95);
    orca.rotation.x = 0;
    orca.rotation.z += (since > 0 && since < 0.95) ? 0.34 * Math.sin(since / 0.95 * Math.PI) : 0;
    if (eatBites < eatTotal && eatT >= eatNext) {
      eatBites++;
      eatNext = eatT + 0.95;
      const snd = cfg.sounds[Math.min(eatBites - 1, cfg.sounds.length - 1)];
      if (sfx && sfx.eat) sfx.eat(snd);
      if (eatProp) {
        const kk = Math.max(0.22, 1 - eatBites / (eatTotal + 0.6));
        eatProp.scale.setScalar(1.35 * kk);
        spawnBubbles(eatProp.position.x, WATER_Y + 0.02, eatProp.position.z, 3, 0.16);
        ringAt(eatProp.position.x, eatProp.position.z, 0.36, 1.0);
        spawnDrops(eatProp.position.x, WATER_Y + 0.12, eatProp.position.z, 3, 0.35);
      }
    }
    const done = eatTotal === 0 ? eatT > eatNext : (eatBites >= eatTotal && eatT > eatNext + 0.5);
    if (done) {
      if (eatProp) {
        ringAt(eatProp.position.x, eatProp.position.z, 0.7, 1.2);
        spawnDrops(eatProp.position.x, WATER_Y + 0.12, eatProp.position.z, 6, 0.5);
      }
      if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
      say(cfg.end || '好吃——', 3200);
      clearEatProp();
      eatT = -1;
      eatKind = null;
      backToSwim();
    }
  }

  function updateOrca(dt) {
    if (!orca) return;
    if (orcaMode === 'rideWait') return;    // 滑水道演出期间由 updateRide 摆位
    const swimY = WATER_Y + 0.05;
    if (orcaMode === 'swim') {
      orcaA += dt * 0.22;
      const rx = 3.30, rz = 2.30;
      const x = POOL_CX + Math.cos(orcaA) * rx;
      const z = POOL_CZ + Math.sin(orcaA) * rz;
      if (orca.scale.x !== (frames.orcScale || 1)) orca.scale.setScalar(frames.orcScale || 1);
      orca.position.set(x, swimY + Math.sin(t * 1.4) * 0.03, z);
      const dx = -Math.sin(orcaA) * rx, dz = Math.cos(orcaA) * rz;
      orca.rotation.y = faceDir(dx, dz);
      orca.rotation.z = Math.sin(t * 1.1) * 0.10;
      orca.rotation.x = 0;
      // 游过的水面上留一圈涟漪（尾巴那边）
      trailT += dt;
      if (trailT > 0.55) {
        trailT = 0;
        // 尾巴在局部 +X 那一头：世界方向 = (cos yaw, -sin yaw)
        ringAt(x + Math.cos(orca.rotation.y) * 0.85, z - Math.sin(orca.rotation.y) * 0.85, 0.42, 1.25);
      }
    } else if (orcaMode === 'path') {
      updatePath(dt);
    } else if (orcaMode === 'eat') {
      updateEat(dt);
    } else if (orcaMode === 'slide') {
      slideT += dt / 2.8;
      const u = Math.max(0, Math.min(1, slideT));
      const p = frames.slideCurve ? frames.slideCurve.getPointAt(u) : null;
      if (p) {
        orca.position.set(p.x, p.y - 0.10, p.z);
        const tg = frames.slideCurve.getTangentAt(u);
        orca.rotation.y = faceDir(tg.x, tg.z);
        orca.rotation.z = Math.sin(u * 22) * 0.18;
      }
      if (slideT >= 1) {
        slideT = -1;
        // M57.1：滑道终点收进池子里了，这里再兜一下 —— 落到水面高度、别停在池沿上
        orca.position.set(5.55, WATER_Y + 0.10, -47.95);
        orca.rotation.z = 0;
        orca.rotation.x = 0;
        splash(orca.position.x, orca.position.z, 20, 1.25);
        // M57.2：别停在滑梯脚边 —— 借着冲劲往池子中间滑一段（妈妈：离水滑梯太近了）
        plungeFrom.set(orca.position.x, orca.position.y, orca.position.z);
        plungeT = 0;
        orcaMode = 'plunge';
        if (sfx && sfx.parkSplash) sfx.parkSplash();
      }
    } else if (orcaMode === 'plunge') {
      // M57.2：冲进水里之后借着惯性往池子中间滑一段，别停在滑梯脚边
      plungeT += dt;
      const u = Math.min(1, plungeT / 0.85);
      const e = u * u * (3 - 2 * u);
      orca.position.x = plungeFrom.x + (plungeTo.x - plungeFrom.x) * e;
      orca.position.z = plungeFrom.z + (plungeTo.z - plungeFrom.z) * e;
      orca.position.y = WATER_Y + 0.06 - Math.sin(u * Math.PI) * 0.12;
      orca.rotation.y = faceDir(plungeTo.x - plungeFrom.x, plungeTo.z - plungeFrom.z);
      orca.rotation.z = Math.sin(u * 12) * 0.06;
      if (Math.random() < dt * 16) ringAt(orca.position.x, orca.position.z, 0.50, 1.0);
      if (Math.random() < dt * 10) spawnBubbles(orca.position.x, WATER_Y - 0.02, orca.position.z, 1, 0.3);
      if (u >= 1) {
        orcaMode = 'shake';
        shakeT = 0;
        if (sfx && sfx.parkShake) sfx.parkShake();
      }
    } else if (orcaMode === 'shake') {
      shakeT += dt;
      const k = Math.max(0, 1 - shakeT / 1.05);
      orca.rotation.z = Math.sin(shakeT * 26) * 0.24 * k;
      orca.rotation.x = 0;
      orca.position.y = swimY + Math.abs(Math.sin(shakeT * 18)) * 0.05 * k;
      // 水珠一圈圈往外甩
      if (shakeT > 0.10 && shakeT < 0.80 && Math.random() < dt * 12) {
        spawnDrops(orca.position.x, orca.position.y + 0.30, orca.position.z, 4, 0.8);
      }
      if (shakeT > 1.05) { shakeT = -1; backToSwim(); }
    } else if (orcaMode === 'jump') {
      jumpT += dt;
      const u = jumpT / 1.5;
      if (u >= 1) {
        jumpT = -1;
        splash(orca.position.x, orca.position.z, 18, 1.15);
        backToSwim();
      } else {
        const up = Math.sin(Math.min(1, u) * Math.PI);
        orca.position.set(POOL_CX + Math.cos(orcaA) * 3.3, swimY + up * 1.25, POOL_CZ + Math.sin(orcaA) * 2.3);
        // 腾空的时候鼻子朝上（绕 Z 负方向）+ 一点点滚转
        orca.rotation.z = -up * 0.42;
        orca.rotation.x = up * 0.22;
        orca.rotation.y += dt * 1.2;
        if (u < 0.08) splash(orca.position.x, orca.position.z, 8, 0.8);
      }
    } else if (orcaMode === 'pose') {
      poseT += dt;
      const px = 2.0, pz = -42.5;
      orca.position.set(px, 0.42 + Math.sin(t * 2.0) * 0.03, pz);
      // 站在相框前，斜着朝镜头（正对镜头只剩一个圆球，3/4 侧脸最好看）
      // M78.1：原来整只鲸鱼是背对"站这儿"的（拍出来只有一片蓝背），转了 180°
      orca.rotation.set(0, Math.PI - 0.55 + Math.sin(t * 0.8) * 0.08, Math.sin(t * 1.6) * 0.05);
      if (poseT > 26) { orcaMode = 'swim'; syncSwimAngle(); }
    } else if (orcaMode === 'lie') {
      /* M38：躺椅只有 1.7m 长，小鲸鱼 1.85m —— 以前直接摆在两张椅子中间，穿模穿成一片。
       * 现在缩到 0.78 倍，稳稳躺在一张椅子上：头朝椅脚那头、尾巴离椅背留一点缝。 */
      poseT += dt;
      const LY = 0.10;                        // 这张躺椅的朝向
      const cs = Math.cos(LY), sn = Math.sin(LY);
      const lz = 0.16;                        // 沿椅子长轴往椅脚那头挪一点
      orca.position.set(PX0 + 3.0 + sn * lz, 0.735 + Math.sin(t * 1.4) * 0.008, -37.6 + cs * lz);
      orca.scale.setScalar((frames.orcScale || 1) * 0.78);
      orca.rotation.set(0, Math.PI * 0.5 + LY, -0.16 + Math.sin(t * 1.1) * 0.015);
      if (poseT > 22) backToSwim();
    } else if (orcaMode === 'pet') {
      petT += dt;
      const k = Math.max(0, 1 - petT / 1.5);
      orca.rotation.z = Math.sin(petT * 24) * 0.26 * k;
      orca.rotation.x = 0;
      orca.position.y = swimY + Math.sin(petT * 12) * 0.02;
      if (petT > 0.30 && petT - dt <= 0.30) {
        spawnDrops(orca.position.x, orca.position.y + 0.32, orca.position.z, 12, 1.0);
        ringAt(orca.position.x, orca.position.z, 0.6, 1.2);
      }
      if (petT > 1.5) { petT = -1; backToSwim(); }
    } else if (orcaMode === 'float') {
      floatT += dt;
      const f0 = (frames.floats && frames.floats[0]) || { x: 2.8, z: -49.7 };
      orca.position.set(f0.x + 1.02, WATER_Y + 0.13 + Math.sin(t * 1.25) * 0.035, f0.z);
      // 鼻子（-X）朝着浮圈那边，脑袋微微往下搁
      orca.rotation.set(0.06, faceDir(-1.02, 0), 0.12 + Math.sin(t * 0.9) * 0.04);
      if (Math.random() < dt * 1.4) ringAt(orca.position.x, orca.position.z, 0.30, 0.9);
      if (floatT > 12) {
        say('漂够了，再游两圈', 2800);
        backToSwim();
      }
    } else if (orcaMode === 'board') {
      /* M36：跳板跳水 —— 先站在板头弹两下，再跳进池子 */
      boardT += dt;
      if (boardT < 1.35) {
        const k = Math.abs(Math.sin(boardT * 4.6));
        orca.position.set(POOL_CX, 1.27 + k * 0.10 * (1 - boardT / 1.35), -52.1);
        // 面朝池子（+z，鼻子在局部 -X → yaw = π/2）
        orca.rotation.set(0, Math.PI * 0.5, -0.14 - k * 0.10);
        if (boardT < dt * 1.5 && sfx && sfx.parkSplashSmall) sfx.parkSplashSmall();
      } else {
        const u = Math.min(1, (boardT - 1.35) / 0.85);
        if (u < 1) {
          const z = -52.1 + 4.5 * u;              // -52.1 → -47.6
          const y = 1.27 + Math.sin(u * Math.PI) * 0.45 - u * 1.24;
          orca.position.set(POOL_CX, Math.max(0.02, y), z);
          orca.rotation.set(Math.sin(u * 9) * 0.12, Math.PI * 0.5, -0.35 + u * 1.05);
        } else {
          splash(POOL_CX, -47.6, 26, 1.35);
          if (sfx && sfx.parkSplash) sfx.parkSplash();
          boardT = -1;
          say('啪——凉！板子比看着高', 2800);
          backToSwim();
        }
      }
    }
  }

  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      d.vy -= 9.0 * dt;
      d.sp.position.x += d.vx * dt;
      d.sp.position.y += d.vy * dt;
      d.sp.position.z += d.vz * dt;
      const k = 1 - d.t / d.life;
      d.sp.material.opacity = 0.9 * Math.max(0, k);
      const sc = 0.10 + (1 - k) * 0.16;
      d.sp.scale.set(sc, sc, 1);
      if (d.t > d.life || d.sp.position.y < WATER_Y - 0.4) {
        if (d.sp.parent) d.sp.parent.remove(d.sp);
        drops.splice(i, 1);
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t < 0) continue;
      const k = r.t / r.life;
      if (k >= 1) {
        if (r.m.parent) r.m.parent.remove(r.m);
        r.m.material.dispose();
        rings.splice(i, 1);
        continue;
      }
      const s = 0.6 + k * 2.6;
      r.m.scale.set(s, s, s);
      r.m.material.opacity = 0.65 * (1 - k);
    }
  }

  function updateFountain(dt) {
    if (!fountainParts) return;
    const fp = fountainParts;
    const boost = glowT > 0 ? 1.5 : 1;
    if (glowT > 0) glowT -= dt;
    for (let i = 0; i < 40; i++) {
      const ph = (fp.phases[i] + t * 0.85) % 1;
      const a = fp.angles[i];
      const r = Math.sin(ph * Math.PI) * 1.55 * boost;
      const y = 0.4 + Math.sin(ph * Math.PI) * (1.2 * boost) + (1 - ph) * 0.5;
      fp.pos[i * 3] = Math.cos(a) * 0.10;
      fp.pos[i * 3 + 1] = y;
      fp.pos[i * 3 + 2] = Math.sin(a) * 0.10;
      // 往外的水珠
      fp.pos[i * 3] += Math.cos(a) * r * 0.25;
      fp.pos[i * 3 + 2] += Math.sin(a) * r * 0.25;
    }
    fp.points.geometry.attributes.position.needsUpdate = true;
    if (standLight) standLight.intensity = 0.42 + (glowT > 0 ? 0.4 : 0);
  }

  function updateBall(dt) {
    if (!ballMesh) return;
    if (ballVy !== 0) {
      ballMesh.position.y += ballVy * dt;
      ballVy -= 9.0 * dt;
      ballMesh.rotation.x += dt * 6;
      if (ballMesh.position.y < 0.30) {
        ballMesh.position.y = 0.30;
        ballVy = 0;
      }
    } else {
      ballMesh.position.y = 0.30 + Math.sin(t * 1.2) * 0.01;
    }
  }

  /* ---------- M34：排球（点网扣一球，会弹两下） ---------- */
  function updateVolleyBall(dt) {
    if (volleyT < 0 || !frames.volley) return;
    volleyT += dt;
    const b = frames.volley;
    volleyV.y -= 9.2 * dt;
    b.position.x += volleyV.x * dt;
    b.position.y += volleyV.y * dt;
    b.position.z += volleyV.z * dt;
    b.rotation.x += dt * 5.5;
    b.rotation.z += dt * 3.0;
    if (frames.volleyStripe) frames.volleyStripe.position.copy(b.position);
    if (b.position.y < 0.22) {
      b.position.y = 0.22;
      if (volleyV.y < -0.9) {
        volleyV.y = -volleyV.y * 0.42;
        volleyV.x *= 0.65;
        volleyV.z *= 0.65;
        if (sfx && sfx.pop) sfx.pop();
        spawnDrops(b.position.x, b.position.y, b.position.z, 4, 0.5);
      } else {
        volleyV.x = 0; volleyV.y = 0; volleyV.z = 0;
        volleyT = -1;
      }
    }
    if (volleyT > 8) volleyT = -1;
  }

  function update(dt) {
    if (!built) return;
    t += dt;
    if (!isParkNow()) return;

    /* M37：乐园自己的灯跟着白天/夜里收放 —— 妈妈说白天曝光太强
     * 白天：人工光收一半；夜里：恢复原来的暖亮（串灯也才显出来） */
    if (frames.lights) {
      const day = getTimeMode() === 'day';
      const L = frames.lights;
      L.amb.intensity = day ? 0.20 : 0.18;
      L.hemi.intensity = day ? 0.18 : 0.16;
      L.sun.intensity = day ? 0.40 : 0.14;
      L.warm.intensity = day ? 0.10 : 0.46;
      if (frames.sky) {
        if (day) frames.sky.material.color.setRGB(0.86, 0.86, 0.86);
        else frames.sky.material.color.setRGB(0.30, 0.34, 0.52);
      }
    }

    updateWater(dt);
    updateOrca(dt);
    updateDrops(dt);
    updateBubblesFx(dt);
    updateFountain(dt);
    updateBall(dt);
    updateVolleyBall(dt);

    /* ---------- M34：可点的热区跟着小鲸鱼走 / 零食漂着 / 说话别刷屏 ---------- */
    if (orcaHot && orcaHot.mesh && orca) {
      orcaHot.mesh.position.set(orca.position.x, orca.position.y + 0.42, orca.position.z);
      orcaHot.mesh.rotation.y = orca.rotation.y;
      orcaHot.anchor.set(orca.position.x, orca.position.y + 1.16, orca.position.z);
    }
    if (eatProp) {
      eatProp.position.y = WATER_Y + 0.06 + Math.sin(t * 1.7) * 0.012;
      eatProp.rotation.y += dt * 0.22;
    }

    /* ---------- M36：地喷步道一浪一浪 / 门口的水雾 ---------- */
    if (walkJets) {
      for (let i = 0; i < walkJets.length; i++) {
        const w = walkJets[i];
        const k = walkJetOn ? 0.30 + 0.70 * Math.max(0, Math.sin(t * 2.2 - w.wph)) : 0;
        w.h = w.baseH * k;
        w.pts.visible = k > 0.03;
      }
      if (walkJetOn) {
        walkJetTick += dt;
        if (walkJetTick > 2.8) { walkJetTick = 0; if (sfx && sfx.parkSplashSmall) sfx.parkSplashSmall(); }
      }
    }
    if (mistSpr) {
      for (let i = 0; i < mistSpr.length; i++) {
        const m = mistSpr[i];
        m.sp.visible = mistOn;
        if (!mistOn) continue;
        m.sp.position.y -= dt * 0.26;
        m.sp.position.x += Math.sin(t * 0.6 + i) * 0.0016;
        if (m.sp.position.y < 0.15) {
          m.sp.position.set(-6.0 + (Math.random() - 0.5) * 2.1, 2.35 + Math.random() * 0.25, -40.5 + (Math.random() - 0.5) * 0.6);
        }
      }
    }
    if (frames.slideTube && frames.slideTube.material.map) {
      frames.slideTube.material.map.offset.y = (t * 0.35) % 1;
    }
    if (popsicle && popsicle.visible) {
      popsicle.position.y = 1.35 + Math.sin(t * 2.2) * 0.02;
    }
    if (frames.curtain0 && frames.curtain1) {
      frames.curtain0.rotation.y = Math.sin(t * 0.8) * 0.06;
      frames.curtain1.rotation.y = Math.sin(t * 0.7 + 1) * 0.06;
    }

    /* ---------- M32.5 加的东西 ---------- */
    // 浮圈 / 火烈鸟漂
    if (frames.floats) {
      for (let i = 0; i < frames.floats.length; i++) {
        const f = frames.floats[i];
        f.m.position.y = WATER_Y + 0.07 + Math.sin(t * 1.1 + f.ph) * 0.035;
        f.m.rotation.y = Math.sin(t * 0.45 + f.ph) * 0.28;
        f.m.rotation.z = Math.sin(t * 1.3 + f.ph) * 0.05;
      }
    }
    // 气球轻轻晃
    if (frames.balloons) {
      for (let i = 0; i < frames.balloons.length; i++) {
        frames.balloons[i].rotation.z = Math.sin(t * 1.25 + i) * 0.02;
      }
    }
    // 串灯呼吸
    if (frames.bulbs) {
      for (let i = 0; i < frames.bulbs.length; i++) {
        const k = 0.68 + 0.32 * (0.5 + 0.5 * Math.sin(t * 2.1 + i * 0.85));
        frames.bulbs[i].material.color.setRGB(k, k * 0.88, k * 0.62);
      }
    }
    // 水柱（蘑菇伞边淌的水 / 地喷 / 淋浴）
    if (frames.jets) {
      for (let j = 0; j < frames.jets.length; j++) {
        const e = frames.jets[j];
        for (let i = 0; i < e.n; i++) {
          const k = (e.ph[i] + t * 0.95) % 1;
          const a = i * 2.399 + j;
          const spread = (e.h > 0 ? 0.05 : 0.22) + k * (e.h > 0 ? 0.05 : 0.34);
          e.arr[i * 3] = Math.cos(a) * spread;
          e.arr[i * 3 + 1] = k * e.h;
          e.arr[i * 3 + 2] = Math.sin(a) * spread;
        }
        e.pts.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (frames.splashWater) {
      frames.splashWater.material.opacity = 0.84 + Math.sin(t * 1.7) * 0.05;
    }
    if (frames.neon) {
      frames.neon.material.color.setRGB(1, 1, 1);
    }
  }

  /* ================= 边界 ================= */
  const OBST = [
    { x0: -6.6, x1: 6.6, z0: -52.6, z1: -43.4 },     // 泳池（别掉进去）
    { x0: 10.4, x1: 12.8, z0: -56.9, z1: -54.4 },    // 滑水道塔
    { x0: -5.0, x1: -2.2, z0: -37.0, z1: -35.4 },    // 冰棍摊（M37：按摊子实际大小收窄，别挡住门口那条通道）
    { x0: 4.4, x1: 8.8, z0: -38.8, z1: -34.4 },      // 喷泉
    { x0: -12.6, x1: -8.6, z0: -36.6, z1: -34.6 },   // 更衣室（M37：跟着小屋挪到西边）
    { x0: -14.0, x1: -10.2, z0: -35.8, z1: -34.0 },  // 售票亭
    { x0: 12.2, x1: 17.1, z0: -49.5, z1: -44.5 },    // M32.5 蘑菇戏水池
    { x0: 14.2, x1: 17.7, z0: -54.2, z1: -52.7 },    // M32.5 池边水吧
    { x0: 12.4, x1: 15.6, z0: -39.1, z1: -37.3 },    // M32.5 凉棚长桌
    { x0: 8.0, x1: 9.2, z0: -43.1, z1: -41.7 },      // M32.5 救生员椅
    { x0: -13.7, x1: -12.6, z0: -37.4, z1: -35.9 },  // M32.5 储物柜
    { x0: -6.5, x1: 7.5, z0: -59.3, z1: -57.3 },     // M33 小吃街那排
    { x0: -14.0, x1: -12.2, z0: -52.6, z1: -43.7 }   // M33 西边两个小摊
  ];

  function clamp(x, z, oldX, oldZ) {
    if (oldX === undefined) oldX = x;
    if (oldZ === undefined) oldZ = z;
    x = Math.max(PX0 + 0.8, Math.min(PX1 - 0.8, x));
    // M37：南边门口那条通道可以走到门外的小广场（别的地方还是老边界）
    const zLimit = (x > GATE_X0 + 0.15 && x < GATE_X1 - 0.15) ? PLAZA_Z : PZ1 - 0.8;
    z = Math.max(PZ0 + 0.8, Math.min(zLimit, z));
    for (let i = 0; i < OBST.length; i++) {
      const r = OBST[i];
      if (!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
      if (oldX <= r.x0) { x = r.x0 - 0.05; continue; }
      if (oldX >= r.x1) { x = r.x1 + 0.05; continue; }
      if (oldZ <= r.z0) { z = r.z0 - 0.05; continue; }
      if (oldZ >= r.z1) { z = r.z1 + 0.05; continue; }
      const d = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
      const m = Math.min(d[0], d[1], d[2], d[3]);
      if (m === d[0]) x = r.x0 - 0.05;
      else if (m === d[1]) x = r.x1 + 0.05;
      else if (m === d[2]) z = r.z0 - 0.05;
      else z = r.z1 + 0.05;
    }
    return { x: x, z: z };
  }

  /* ================= M36：新设施 =================
   * ① 会喷的地喷步道：从园门到泳池那条木栈道上，六个喷嘴一浪一浪地喷（点一下开/关）
   * ② 门口的水雾拱门：走过去一脸凉，点一下开/关
   * ③ 跳板：点一下小鲸鱼爬上去，弹两下再跳进池子（大水花）
   */
  function buildWaterPlay() {
    // ① 地喷步道
    walkJets = [];
    [-36.6, -37.6, -38.6, -39.6, -40.6, -41.6].forEach(function (z, i) {
      cylMesh(0.10, 0.13, 0.10, 12, -6.0, 0.05, z, sunStd(BCOL2[i % BCOL2.length], 0.7), root);
      const ring = M(new THREE.TorusGeometry(0.15, 0.03, 6, 14), sunStd(0x8fd6ea, 0.65), -6.0, 0.10, z, root);
      ring.rotation.x = Math.PI / 2;
      makeJet(-6.0, 0.08, z, 1.15, 14, 0.085, 0x9fe8ff);
      const entry = frames.jets[frames.jets.length - 1];
      entry.baseH = 1.15;
      entry.wph = i * 0.55;
      walkJets.push(entry);
    });

    // ② 栈道中段的水雾拱门（两根柱子 + 顶上一道弯梁 + 一圈小灯）
    const arch = new THREE.Group();
    arch.position.set(-6.0, 0, -40.5);
    root.add(arch);
    [-1.25, 1.25].forEach(function (dx) {
      cylMesh(0.075, 0.09, 2.55, 10, dx, 1.27, 0, sunStd(0xdfeef5, 0.55, 0.15), arch);
    });
    const bend = M(new THREE.TorusGeometry(1.25, 0.075, 8, 26, Math.PI), sunStd(0xdfeef5, 0.55, 0.15), 0, 2.55, 0, arch);
    bend.rotation.z = 0;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (i / 8);
      const b = M(new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe4a8, toneMapped: false }),
        Math.cos(a) * 1.25, 2.55 + Math.sin(a) * 1.25, 0, arch);
      b.castShadow = false;
      frames.bulbs.push(b);
    }
    // 雾气：一小把慢慢往下飘的水珠，飘到底再从头来
    mistSpr = [];
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getJetTex(), color: 0xcdeef8, transparent: true, opacity: 0.42, depthWrite: false, fog: false
      }));
      sp.scale.set(0.62, 0.62, 1);
      sp.position.set(-6.0 + (Math.random() - 0.5) * 2.1, 0.4 + Math.random() * 2.0, -40.5 + (Math.random() - 0.5) * 0.6);
      root.add(sp);
      mistSpr.push({ sp: sp });
    }

    // ③ 跳板旁边补一把小梯子（原来只有板子和两根柱子，上去没路）
    const steel2 = sunStd(0xbfc9d2, 0.4, 0.6);
    [-0.22, 0.22].forEach(function (dx) {
      cylMesh(0.032, 0.032, 1.05, 8, POOL_CX + dx, 0.52, POOL.z0 - 1.02, steel2, root);
    });
    for (let i = 0; i < 3; i++) {
      const rung = cylMesh(0.024, 0.024, 0.44, 8, POOL_CX, 0.22 + i * 0.28, POOL.z0 - 1.02, steel2, root);
      rung.rotation.z = Math.PI / 2;
    }
  }

  /* M36：跳板跳水 —— 游到跳板下面 → 爬上去 → 站到板头弹两下 → 跳进池子 */
  function startBoardDive() {
    if (!orca || eatT >= 0 || petT >= 0 || floatT >= 0) return false;
    if (orcaMode === 'slide' || orcaMode === 'path' || orcaMode === 'board') return false;
    say('我去跳板那儿——池子里让一让', 3000);
    return startPath([
      { x: POOL_CX, z: -50.3, y: WATER_Y + 0.05, dur: 0.9 },
      { x: POOL_CX, z: -53.0, y: 1.27, dur: 0.85, pitch: -0.25 },
      { x: POOL_CX, z: -52.1, y: 1.27, dur: 0.65, pitch: 0 }
    ], function () {
      boardT = 0;
      orcaMode = 'board';
    });
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    scene = o.scene;
    interact = o.interact || null;
    sfx = o.sfx || null;
    tip = o.tip || null;
    shop = o.shop || null;
    photo = o.photo || null;
    isParkNow = o.isPark || function () { return false; };
    getTimeMode = o.getTimeMode || function () { return 'day'; };
    camRef = o.camera || null;                 // M56：滑水道要接管镜头
    getWalkFn = o.getWalk || null;
    if (!scene) return { update: function () {}, debug: function () { return null; } };

    root = new THREE.Group();
    root.name = 'park-m32';
    root.visible = false;
    scene.add(root);

    // 动画零件先开好，build* 里会往里塞
    frames = {};
    frames.jets = [];
    frames.balloons = [];
    frames.bulbs = [];
    frames.floats = [];

    // 乐园自己的光（M37：白天收一点、夜里亮起来 —— 原来是死亮，白天过曝）
    const amb = new THREE.AmbientLight(0xdfeef5, 0.45);
    root.add(amb);
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xe8dbc2, 0.40);
    root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3dd, 0.82);
    sun.position.set(24, 30, -28);
    sun.target.position.set(CX, 0, CZ);
    root.add(sun);
    root.add(sun.target);
    // 远处补一点点暖光，让躺椅那边不冷
    const warm = new THREE.PointLight(0xffd9a0, 0.28, 22, 2);
    warm.position.set(-8, 4.2, -40);
    root.add(warm);
    frames.lights = { amb: amb, hemi: hemi, sun: sun, warm: warm };

    buildGround();
    buildEntrancePlaza();   // M37：门外的小广场（门口那条通道真的能走了）
    buildPool();
    buildSlide();
    buildLoungers();
    buildStand();
    buildFountain();
    buildHuts();
    buildGate();
    buildPalms();
    buildPhotoSpot();
    buildBall();
    // M32.5：照真人池子的样子加的这些
    buildEntrance();
    buildSplashPad();
    buildPoolBar();
    buildVolley();
    buildPergola();
    buildPoolExtras();
    buildPromenade();
    buildWaterPlay();       // M36：地喷步道 + 水雾拱门 + 跳板梯子
    buildFoodStreet();
    buildOrca();
    register();

    built = true;

    return {
      root: root,
      update: update,
      clamp: clamp,
      setVisible: function (v) {
        if (root) root.visible = !!v;
        // M56：离开乐园时把滑水道骑行状态清掉（不然回来会接着上回的镜头乱飞）
        if (!v) { ride.on = false; ride.phase = ''; ride.t = 0; if (orcaMode === 'rideWait') orcaMode = 'swim'; }
      },
      isVisible: function () { return !!(root && root.visible); },
      spawn: { x: CX - 8.0, y: 1.62, z: -31.0, yaw: 0 },   // M37：站在门外的小广场上，朝里走两步就进园
      BOUNDS: { X0: PX0, X1: PX1, Z0: PZ0, Z1: PZ1 },
      // M56：玩家自己滑滑水道（镜头由 park 接管，main 的 updateWalk 会跳过这一段）
      isRiding: function () { return ride.on && isParkNow(); },
      rideStep: updateRide,
      slide: startSlideRide,
      // 截图/调试用：把骑行直接跳到某一段（phase: climb / drop / splash / out，sec 是这一段里的秒数）
      rideJump: function (phase, sec, freeze) {
        if (!ride.on && !startSlideRide()) return false;
        ride.phase = phase || 'drop';
        ride.t = (typeof sec === 'number' && sec > 0) ? sec : 0;
        ride.frozen = !!freeze;
        if (ride.phase === 'drop') {
          orcaMode = 'slide';
          slideT = Math.max(0, Math.min(1, (typeof sec === 'number' ? sec : 0) / 2.8));
        } else if (ride.phase === 'splash') {
          orcaMode = 'rideWait';
          orca.position.set(3.60, WATER_Y + 0.05, -49.20);
          orca.rotation.set(0, -0.4, 0);
        }
        updateRide(0.0001);
        return true;
      },
      // M34：环境声要摆在哪（泳池 / 蘑菇戏水池）
      audio: function () {
        return {
          pool: { x: POOL_CX, y: 0.10, z: POOL_CZ },
          pad: { x: 14.6, y: 0.30, z: -47.0 }
        };
      },
      debug: function () {
        return {
          orca: orcaMode,
          slide: Math.round(slideT * 100) / 100,
          ride: ride.on ? ride.phase + ':' + (Math.round(ride.t * 10) / 10) : null,
          camY: Math.round(camRef ? camRef.position.y * 100 : 0) / 100,
          drops: drops.length,
          path: pathQ ? pathQ.i + '/' + pathQ.pts.length : null,
          eat: eatKind ? eatKind + ' ' + eatBites + '/' + eatTotal : null,
          board: Math.round(boardT * 100) / 100,
          jets: walkJetOn ? 'on' : 'off',
          mist: mistOn ? 'on' : 'off',
          amb: frames.lights ? Math.round(frames.lights.amb.intensity * 100) / 100 : null,
          sun: frames.lights ? Math.round(frames.lights.sun.intensity * 100) / 100 : null,
          fx: { bub: bubblesFx.length, ring: rings.length },
          pos: orca ? [Math.round(orca.position.x * 10) / 10, Math.round(orca.position.z * 10) / 10] : null
        };
      },
      // 调试用：直接触发一个动作（截图看动画用）
      //   name: slide / jump / pose / lie / splash / dive / pet / float / pad / eat / volley / shake
      //   u: 滑道是 0~1 的进度；别的动作是我要"快进多少秒"，方便截到动画中间那一帧
      act: function (name, u, extra) {
        const secs = (typeof u === 'number' && u > 0) ? u : 0;
        const sim = function () {
          const n = Math.round(secs * 20);
          for (let i = 0; i < n; i++) update(0.05);
        };
        if (name === 'slide') {
          slideT = (typeof u === 'number' && u > 0 && u < 1) ? u : 0;
          orcaMode = 'slide';
        }
        else if (name === 'jump' && jumpT < 0) { jumpT = 0; orcaMode = 'jump'; sim(); }
        else if (name === 'pose') { orcaMode = 'pose'; poseT = 0; sim(); }
        else if (name === 'lie') { orcaMode = 'lie'; poseT = 0; sim(); }
        else if (name === 'splash') { splash(POOL_CX, POOL_CZ, 22, 1.25); sim(); }
        else if (name === 'dive') { if (startDive(POOL_CX, POOL_CZ)) sim(); }
        else if (name === 'pet') { if (petOrca()) sim(); }
        else if (name === 'float') { if (startFloat()) sim(); }
        else if (name === 'pad') { if (startPad()) sim(); }
        else if (name === 'eat') { if (startEat(extra || 'ice')) sim(); }
        else if (name === 'volley') { if (startVolley()) sim(); }
        else if (name === 'shake') { orcaMode = 'shake'; shakeT = 0; sim(); }
        else if (name === 'board') { if (startBoardDive()) sim(); }
      }
    };
  }

  return { build: build };
})();
