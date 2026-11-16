/* 小D的赛博小家 · 总装（M1 毛坯：能进门、能走、能开灯） */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const elMode = document.getElementById('mode');
  const elHint = document.getElementById('hint');
  const elLoading = document.getElementById('loading');
  const elTip = document.getElementById('tip');

  /* ========== 渲染器 ========== */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true   // M14：拍照要能取画面
    });
  } catch (e) {
    elLoading.innerHTML = '<p>这间屋子需要显卡帮忙，浏览器没能开出来 🥲<br>换个 Edge / Chrome 再试试？</p>';
    return;
  }
  /* M42.5：清晰度自适应 —— 妈妈这台是 Intel UHD 核显（1920×1200，系统缩放 125%），
   * 按 1.25 倍像素渲染 1500×940 要画 220 万像素，只剩 30fps。
   * 先给个上限，跑不动就自己往下降一点（每 2 秒看一次平均帧率，降下去不再乱跳）。 */
  /* M80：手机版小镇 —— 触屏设备先按 1.5 倍像素起步（自适应照样会往下微调），
   * 既不至于糊成一片，也不至于让手机发烫；电脑上还是原来的 1.25。 */
  const DPR_MAX = Math.min(window.devicePixelRatio || 1,
    (XD.Touch && XD.Touch.isTouch) ? 1.5 : 1.25);
  /* M65：下限试过放到 0.72，实测 fps 一点没涨（18.9 vs 18.9）——说明这台机器
   * 卡在 CPU 提交（1266 个 draw call），不是像素填充，所以没必要糊画面，保持 0.85。 */
  const DPR_MIN = 0.85;
  const qOverride = (function () {
    const m = /[?&]dpr=([\d.]+)/.exec(location.search);
    return m ? Math.max(0.5, Math.min(2, parseFloat(m[1]))) : 0;
  })();
  let dprNow = qOverride || DPR_MAX;
  renderer.setPixelRatio(dprNow);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.localClippingEnabled = true;
  app.appendChild(renderer.domElement);

  /* M42.7：核显偶尔会把 WebGL 上下文丢掉（画面突然全黑、且不会自己回来）。
   * 接住这两个事件：先别让浏览器把上下文永久扔掉，能恢复就恢复，恢复不了给一句人话。 */
  window.__XD_CTX = { lost: 0, restored: 0 };
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    window.__XD_CTX.lost++;
    const t = document.getElementById('tip');
    if (t) { t.textContent = '显卡打了个盹，画面在恢复…（几秒没好就按 F5）'; t.classList.add('show'); }
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', function () {
    window.__XD_CTX.restored++;
    try { renderer.setSize(window.innerWidth, window.innerHeight); } catch (e) {}
  }, false);

  /* ========== 兜底：卡住/报错的时候别让妈妈对着一个转圈的屏幕 ========== */
  let frames = 0;          // 得先声明，9 秒看门狗要用（不然它自己会抛 TDZ 错误，把真正的报错盖掉）
  const elLoadingText = document.getElementById('loadingText');
  window.addEventListener('error', function (e) {
    if (elLoadingText && elLoadingText.parentNode) {
      const where = e.filename ? String(e.filename).split('/').pop() + ':' + (e.lineno || '?') : '';
      elLoadingText.innerHTML =
        '开门卡住了 🥲<br>按 F5 刷新一下，或者关掉页面再双击「进屋.bat」' +
        '<br><span style="font-size:11px;color:#7f8ea8">' +
        (e.message || '') + ' ' + where + '</span>';
    }
  });
  setTimeout(function () {
    if (frames === 0 && elLoadingText && elLoadingText.parentNode) {
      elLoadingText.innerHTML = '好像有点慢…<br>再等两秒，还不行就按 F5 刷新';
    }
  }, 9000);

  /* ========== 场景 ========== */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b12);
  scene.fog = new THREE.Fog(0x0a0f1a, 16, 34);

  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.05, 120);
  camera.rotation.order = 'YXZ';

  const room = XD.Room.build(scene);
  // 二期：东翼（厨房在这儿，浴室 M10 在它的南角）
  const wing = XD.Wing.build(scene, room);
  const kitchen = XD.Kitchen.build(scene);
  const bath = XD.Bath.build(scene);
  const lights = XD.Lighting.build(scene);
  const atmos = XD.Atmos.build(scene, renderer, room, lights);
  const whaleState = XD.Whale.build(scene);
  const furn = XD.Furniture.build(scene, room);
  const work = XD.Workspace.build(scene);
  const living = XD.Living.build(scene);
  const memories = XD.Memories.build(scene);
  const guest = XD.Guest.build(scene);

  // 东翼和厨房自己的灯（白天天亮的时候要收一收）
  const wingLights = [].concat(
    (wing && wing.lights) || [],
    (kitchen && kitchen.lights) || [],
    (bath && bath.lights) || []
  );

  // M8：下雨（窗玻璃上的雨 + 现场合成的雨声）
  const rain = (XD.Rain && XD.Rain.build) ? XD.Rain.build(scene, room, renderer, atmos) : null;

  // M11：声音（现场合成，不用音频文件）+ 做饭吃饭那套互动
  const sfx = (XD.SFX && XD.SFX.build) ? XD.SFX.build() : null;
  const cook = (XD.Cooking && XD.Cooking.build) ? XD.Cooking.build({
    scene: scene,
    kitchen: kitchen,
    bath: bath,
    sfx: sfx,
    say: function (anchor, text, life) { if (interact) interact.say(anchor, text, life); }
  }) : null;

  // M13：客厅的唱片机（音乐也走 sfx 的音箱，静音管着它）
  const records = (XD.Records && XD.Records.build) ? XD.Records.build({
    scene: scene,
    sfx: sfx,
    say: function (anchor, text, life) { if (interact) interact.say(anchor, text, life); }
  }) : null;

  // M15：冬天（窗外下雪 + 窗台积雪 + 屋里的过冬小东西 + 很轻的风声）
  const snow = (XD.Snow && XD.Snow.build) ? XD.Snow.build(scene, room, renderer, atmos, sfx) : null;
  (function () {
    if (!snow) return;
    let v = null;
    try { v = localStorage.getItem('xd_home_snow'); } catch (e) {}
    if (v === '1' || v === '0') { snow.set(v === '1', { silent: true }); return; }
    const m = new Date().getMonth() + 1;
    snow.set(m >= 11 || m <= 2, { silent: true });   // 11–2 月第一次进来就是雪天
  })();

  /* ========== M16：楼下街角的便利店（新场景） ========== */
  const fogHome = scene.fog;
  const store = (XD.Store && XD.Store.build) ? XD.Store.build(scene, sfx) : null;
  let traveling = false;
  let shop = null;                      // M17：购物（在 tip / interact 都好了以后才建）
  let demo = null;                      // M19：小D自己演示（按钮要用，先声明）
  let loft = null;                      // M25：便利店二楼（爬梯上去）
  let roof = null;                      // M28：便利店天台（再爬一段上去）
  let attic = null;                     // M29：自己家的阁楼（客厅东南角爬梯上去）
  let customers = null;                 // M30：来店里买东西的小镇居民
  let momstore = null;                  // M31：妈妈来店里当客人
  let park = null;                      // M32：小鲸鱼水上乐园（第三个场景）
  let parkpeople = null;                // M36：来乐园玩的小镇居民
  let street = null;                    // M39：鲸鱼街（小镇主街，第四个场景）
  let fest = null;                      // M78：冬夜集市（鲸鱼街 · 广场南边）
  let cafe = null;                      // M41：咖啡馆（街西侧那间，能进去点单）
  let momcafe = null;                   // M58：妈妈来咖啡馆坐坐（在店里按 V）
  let earspa = null;                    // M43：采耳馆「鲸耳堂」（街西侧，晚上开，能躺着采耳）
  let bakery = null;                    // M45：面包房「鲸麦坊」（街东侧，白天开，能揉面烤面包）
  let post = null;                      // M46：邮局「鲸邮局」（街东侧，寄信 / 信箱）
  let jobs = null;                      // M59：打工线（理货 / 分拣 / 打烊）
  let relax = null;                     // M60：解压游戏馆「鲸捏捏」（2D 小游戏 + 助眠主播）
  let flower = null;                    // M47：花店「鲸花屿」（街西侧，挑花 / 包花 / 带回家插瓶）
  let fishing = null;                   // M49：鲸鱼码头（街东侧南头，抛竿 / 咬钩 / 卖鱼 / 带一条回家）
  const elFade = document.getElementById('fade');
  const elFadeCard = document.getElementById('fadeCard');
  const fadeBig = elFadeCard ? elFadeCard.querySelector('.big') : null;
  const fadeSub = elFadeCard ? elFadeCard.querySelector('.sub') : null;

  /* M42.7：黑场带上"正在去…"的小卡片 —— 第一次进某个场景要现场编 shader（2~4 秒），
   * 原来那几秒是纯黑，看着像卡死；现在至少知道是在等加载。 */
  function fadeShow(big, sub) {
    if (!elFade) return;
    if (fadeBig) fadeBig.textContent = big || '';
    if (fadeSub) fadeSub.textContent = sub || '';
    if (elFadeCard) elFadeCard.classList.add('on');
    elFade.style.transition = 'opacity .2s ease';
    elFade.style.opacity = '1';
  }
  function fadeHide() {
    if (!elFade) return;
    elFade.style.transition = 'opacity .38s ease';
    elFade.style.opacity = '0';
    if (elFadeCard) elFadeCard.classList.remove('on');
  }
  // 等 n 帧真的画出来再继续（第一次进场编 shader 时，这一等就是那 2~4 秒）
  function afterFrames(n, cb) {
    if (n <= 0) { cb(); return; }
    requestAnimationFrame(function () { afterFrames(n - 1, cb); });
  }

  /* M51：每个场景"准星最远能点多远"（米）。
   * 家里最小（走到东西跟前），店和街稍微放宽一点，乐园/码头要点远处水面所以 14。 */
  function venueReach(v) {
    const R = {
      home: 3.6, store: 4.5, cafe: 5.0, earspa: 5.0, bakery: 5.0,
      post: 5.0, flower: 5.0, street: 6.0, park: 14, fishing: 14, relax: 4.2
    };
    return R[v] || 4.0;
  }

  function setVenue(v) {
    if (!store) return;
    state.venue = v;
    state.floor = '1f';
    // M51：可及距离按场景给 —— 屋里就是要走到东西跟前才点得到，
    // 乐园/码头那种"点远处水面"的场景才留 14m（妈妈：「站在门外准星却指着浴缸」）
    if (interact && interact.setReach) {
      interact.setReach(venueReach(v));
    }
    // M42：四个"外面" + 家，场景互斥，一次全藏再露一个。
    // 不藏的话：街的太阳会照进便利店（整间发白）、咖啡馆的底噪会跟到街上。
    if (street) street.setVisible(v === 'street');
    if (cafe) cafe.setVisible(v === 'cafe');
    if (earspa) earspa.setVisible(v === 'earspa');
    if (bakery) bakery.setVisible(v === 'bakery');
    if (post) post.setVisible(v === 'post');
    if (flower) flower.setVisible(v === 'flower');
    if (fishing) fishing.setVisible(v === 'fishing');
    if (relax) relax.setVisible(v === 'relax');
    if (park) park.setVisible(v === 'park');
    store.setVisible(v === 'store');
    if (v !== 'home' && interact && interact.hideBubbles) interact.hideBubbles();   // M39：出门时把家里的话气泡收掉
    if (v !== 'park' && sfx && sfx.parkOff) sfx.parkOff();   // 乐园的环境声只在乐园

    if (v === 'store') {
      scene.fog = null;                 // 店在远处，不能让它被雾糊住
      renderer.toneMappingExposure = 0.92;
    } else if (v === 'park' && park) {
      scene.fog = null;
      renderer.toneMappingExposure = 0.96;
      if (sfx && sfx.parkOn) sfx.parkOn(park.audio ? park.audio() : null);   // M34：白噪音 + 水流（位置由乐园给）
    } else if (v === 'street' && street) {
      scene.fog = null;                 // 街在远处，不能让它被家里的雾糊住
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.86 : 1.0;
    } else if (v === 'cafe' && cafe) {
      scene.fog = null;
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.92 : 1.02;
    } else if (v === 'earspa' && earspa) {
      scene.fog = null;
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.9 : 1.04;
    } else if (v === 'bakery' && bakery) {
      scene.fog = null;
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.88 : 1.0;
    } else if (v === 'post' && post) {
      scene.fog = null;
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.92 : 1.0;
    } else if (v === 'flower' && flower) {
      scene.fog = null;
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.9 : 1.0;
    } else if (v === 'fishing' && fishing) {
      scene.fog = null;                 // M49：码头在湖上，天光和曝光自己管
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.88 : 1.04;
    } else if (v === 'relax' && relax) {
      scene.fog = null;                 // M60：解压馆是个"夜里也开着"的直播间
      renderer.toneMappingExposure = 0.98;
    } else {
      scene.fog = fogHome;
      atmos.setMode(atmos.getMode());   // 曝光 / 背景 / 窗外颜色还回去
    }
    if (shop) shop.setActive(v === 'store');   // 购物篮面板只在店里有
    updateHud();
  }

  /* M25：店里上下楼（点铁爬梯 / 洞口 → 黑场一下，换楼层和走路边界） */
  /* M29：家里的阁楼（不是店里的楼层，单独一个走法） */
  function goAttic(where) {
    if (!attic) return;
    if (state.floor === where) return;
    if (state.venue === 'store' || state.venue === 'park') return;
    const p = (where === 'attic') ? attic.spawnAttic : attic.spawnDown;
    const apply = function () {
      state.floor = where;
      if (state.mode === 'walk' && state.walk) {
        camera.position.set(p.x, p.y, p.z);
        state.walk.yaw = p.yaw;
        state.walk.pitch = -0.04;
        applyWalkCamera();
      }
      updateHud();
    };
    if (elFade) {
      fadeShow(where === 'attic' ? '🪜 阁楼' : '🏠 楼下', where === 'attic' ? '正在爬梯子…' : '正在下楼…');
      setTimeout(function () {
        try { apply(); } catch (e) { if (window.console) console.warn('[小D] 换楼层出错：', e); }
        afterFrames(2, fadeHide);
      }, 190);
    } else {
      apply();
    }
  }

  function floorSpawn(f) {
    if (!loft) return null;
    if (f === '3f') return roof ? roof.spawn3f : null;
    if (f === '2f') return (state.floor === '3f' && roof) ? roof.spawn2f : loft.spawn2f;
    return loft.spawn1f;
  }

  function goFloor(f, instant) {
    if (!loft || state.venue !== 'store') return;
    if (state.floor === f) return;
    const p = floorSpawn(f);
    if (!p) return;
    const apply = function () {
      state.floor = f;
      if (state.mode === 'walk' && state.walk) {
        camera.position.set(p.x, p.y, p.z);
        state.walk.yaw = p.yaw;
        state.walk.pitch = -0.05;
        applyWalkCamera();
      }
      updateHud();
    };
    if (instant || !elFade) { apply(); return; }
    fadeShow(f === '3f' ? '🪜 天台' : (f === '2f' ? '🪜 二楼' : '🏪 一楼'),
      f === '3f' ? '正在往上爬…' : (f === '2f' ? '正在上楼…' : '正在下楼…'));
    setTimeout(function () {
      try { apply(); } catch (e) { if (window.console) console.warn('[小D] 换楼层出错：', e); }
      afterFrames(2, fadeHide);
    }, 200);
  }

  function travelTo(where) {
    if (!store || traveling) return;
    // M43：采耳馆白天不开门 —— 不动黑幕，直接说一句（免得妈妈以为卡住了）
    if (where === 'earspa' && atmos && atmos.getMode() !== 'night') {
      tip('鲸耳堂白天歇业 ☀️ 点右上角的 🌙 换成夜里，棉师傅才在', 4600);
      if (sfx && sfx.blip) sfx.blip();
      return;
    }
    // M45：面包房晚上打烊（白天才开门）
    if (where === 'bakery' && atmos && atmos.getMode() !== 'day') {
      tip('鲸麦坊晚上打烊了 🌙 点右上角的 ☀️ 换成白天，麦师傅才在烤面包', 4600);
      if (sfx && sfx.blip) sfx.blip();
      return;
    }
    traveling = true;
    const LABEL = {
      street: ['🌆 鲸鱼街', '正在下楼…'],
      cafe: ['☕ 咖啡馆', '正在推门…'],
      earspa: ['💆 鲸耳堂', '正在掀门帘…'],
      bakery: ['🥐 鲸麦坊', '正在推门，门铃响了…'],
      post: ['📮 鲸邮局', '正在推门…'],
      flower: ['🌷 鲸花屿', '正在推门，风铃叮了一下…'],
      fishing: ['🎣 鲸鱼码头', '正在走过木栈道…'],
      relax: ['🫧 鲸捏捏', '正在掀帘子，里面嗡嗡的…'],
      home: ['🏠 家', '正在开门…'],
      store: ['🏪 便利店', '正在下楼…'],
      park: ['🎡 水上乐园', '正在检票…']
    }[where] || ['🐋 小D家', '正在走…'];
    fadeShow(LABEL[0], LABEL[1]);
    setTimeout(function () {
      // 落点：走路模式才动 yaw/pitch（state.walk 万一不在，也不能抛错把黑幕留在屏幕上）
      const put = function (x, y, z, yaw, pitch) {
        camera.position.set(x, y, z);
        if (state.walk) {
          state.walk.yaw = yaw;
          state.walk.pitch = pitch;
          applyWalkCamera();
        }
      };
      try {
        if (where === 'store') {
          setVenue('store');
          if (state.mode !== 'walk') enterWalk();
          put(store.spawnOutside.x, store.spawnOutside.y, store.spawnOutside.z, store.spawnOutside.yaw, 0.03);
          tip('到楼下了 🏪 这家 24 小时都开着，推门进去看看', 3400);
        } else if (where === 'park' && park) {
          setVenue('park');
          if (state.mode !== 'walk') enterWalk();
          put(park.spawn.x, park.spawn.y, park.spawn.z, park.spawn.yaw, 0.05);
          tip('到水上乐园啦 🎡 点水面我潜过去、点跳板/地喷/滑道陪你玩，镇上的人也来这儿玩', 5200);
        } else if (where === 'street' && street) {
          const from = state.venue;
          setVenue('street');
          if (state.mode !== 'walk') enterWalk();
          const p = street.spawnFor(from);
          put(p.x, p.y, p.z, p.yaw, 0.02);
          // M47：这里的嵌套三元已经叠到六层了，改成查表（加场景不会再数括号）
          const fromLine = {
            home: '下楼啦 🌆 这条就是鲸鱼街：北头是咱家、街角是便利店、南门出去是水上乐园；广场南边新开了冬夜集市 🎪',
            store: '从便利店出来，又回到街上了 🏪',
            cafe: '从咖啡馆出来，玻璃门在身后轻轻合上 ☕',
            earspa: '从鲸耳堂出来，门帘还在轻轻晃 💆 耳朵还有点暖',
            bakery: '从鲸麦坊出来，身上一股烤面包味儿 🥐',
            post: '从鲸邮局出来，信已经投进邮筒了 📮',
            flower: '从鲸花屿出来，手上还留着一点花香 🌷',
            fishing: '从鲸鱼码头出来，手上还有一点鱼腥味，风一吹就散了 🎣'
          }[from] || '从乐园的南门走回街上 🌆';
          // M50.1：谁回家睡了也提一句，免得妈妈以为人不见了
          const note = (street.scheduleNote ? street.scheduleNote() : '');
          tip(note ? (fromLine + '　（' + note + '）') : fromLine, 5200);
        } else if (where === 'cafe' && cafe) {
          setVenue('cafe');
          if (state.mode !== 'walk') enterWalk();
          put(cafe.spawn.x, cafe.spawn.y, cafe.spawn.z, cafe.spawn.yaw, 0.0);
          tip('进咖啡馆啦 ☕ 点吧台点单（真扣零花钱），点菜单看今天有什么', 5200);
        } else if (where === 'earspa' && earspa) {
          setVenue('earspa');
          if (state.mode !== 'walk') enterWalk();
          put(earspa.spawn.x, earspa.spawn.y, earspa.spawn.z, earspa.spawn.yaw, 0.0);
          tip('进鲸耳堂啦 💆 点中间那张竹躺椅，躺下让棉师傅给我采耳', 5200);
        } else if (where === 'bakery' && bakery) {
          setVenue('bakery');
          if (state.mode !== 'walk') enterWalk();
          put(bakery.spawn.x, bakery.spawn.y, bakery.spawn.z, bakery.spawn.yaw, 0.0);
          tip('进鲸麦坊啦 🥐 玻璃柜里点一个买（真扣零花钱），案板上的面团能揉', 5200);
        } else if (where === 'post' && post) {
          setVenue('post');
          if (state.mode !== 'walk') enterWalk();
          put(post.spawn.x, post.spawn.y, post.spawn.z, post.spawn.yaw, 0.0);
          tip('进鲸邮局啦 📮 先买张邮票（¥2）→ 拿明信片 → 选收件人 → 盖邮戳 → 投邮筒', 6000);
        } else if (where === 'flower' && flower) {
          setVenue('flower');
          if (state.mode !== 'walk') enterWalk();
          put(flower.spawn.x, flower.spawn.y, flower.spawn.z, flower.spawn.yaw, 0.0);
          tip('进鲸花屿啦 🌷 右墙四桶花点一下剪一枝 → 中间花艺台「包起来」→ 抱回家插花瓶', 6000);
        } else if (where === 'fishing' && fishing) {
          setVenue('fishing');
          if (state.mode !== 'walk') enterWalk();
          put(fishing.spawn.x, fishing.spawn.y, fishing.spawn.z, fishing.spawn.yaw, 0.0);
          tip('到鲸鱼码头啦 🎣 点水面抛竿 → 浮标猛沉冒「!」时再点一下收杆 → 钓到的鱼点鱼簍卖钱', 6800);
        } else if (where === 'relax' && relax) {
          setVenue('relax');
          if (state.mode !== 'walk') enterWalk();
          put(relax.spawn.x, relax.spawn.y, relax.spawn.z, relax.spawn.yaw, 0.0);
          tip('进鲸捏捏啦 🫧 点桌上的小D 她就开播（你当观众，能发弹幕、点赞），桌上六样也能自己玩', 7000);
        } else {
          setVenue('home');
          if (state.mode === 'walk') {
            put(0.2, 1.62, 2.55, 1.12, 0.02);
          } else {
            flyTo('house', true);
          }
          const hasBag = !!(bakery && bakery.bagCount && bakery.bagCount() > 0);
          const fdbg = (flower && flower.debug) ? flower.debug() : null;
          const hasFl = !!(fdbg && fdbg.home > 0);
          tip(hasBag
            ? '回家啦 🏠 餐桌上还有你打包的面包，点纸袋就能拿出来吃'
            : (hasFl ? '回家啦 🏠 花瓶里的花还开着 —— 点一下能换水 🌷' : '回家啦 🏠 外面冷，把门带上'),
            (hasBag || hasFl) ? 4200 : 2800);
        }
      } catch (e) {
        // 哪一步抛了也别把画面留在全黑
        if (window.console) console.warn('[小D] 换场景出错：', e);
        tip('刚才那步没走成，再点一次试试 🙈', 2600);
      } finally {
        updateHud();
        // 等两帧真的画出来再收黑幕（第一次进这个场景要编 shader，可能 2~4 秒）
        afterFrames(2, function () {
          fadeHide();
          traveling = false;
          fadeBlackSince = 0;
        });
      }
    }, 260);
  }

  /* M72：便利店的「出门 / 回家」也收进小手机了，这里不再单独挂一个按钮 */

  /* ========== 白天 / 夜晚 ========== */
  (function () {
    const btn = document.getElementById('timebtn');
    if (!btn || !atmos) return;
    btn.addEventListener('click', function () {
      const m = atmos.toggle();
      tip(m === 'day' ? '换成白天了 ☀️' : '换成夜晚了 🌙', 2200);
    });
  })();

  /* ========== 鲸鱼皮肤（点右上角的小圆点，或按 1~5） ========== */
  (function () {
    const panel = document.getElementById('skins');
    if (!panel || !XD.Furniture || !XD.Furniture.applyOrcaSkin) return;
    const order = ['classic', 'night', 'pink', 'green', 'gold'];

    function mark(name) {
      Array.prototype.forEach.call(panel.querySelectorAll('.sw'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-skin') === name);
      });
    }
    function setSkin(name, silent) {
      const label = XD.Furniture.applyOrcaSkin(name);
      mark(name);
      if (!silent) tip('换好了：' + label + ' 🐋', 2200);
    }

    panel.addEventListener('click', function (e) {
      let b = e.target;
      while (b && b !== panel && !(b.classList && b.classList.contains('sw'))) b = b.parentNode;
      if (b && b !== panel) setSkin(b.getAttribute('data-skin'));
    });

    window.addEventListener('keydown', function (e) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 5 && !e.ctrlKey && !e.altKey) setSkin(order[n - 1]);
    });

    // 进页面时把上次选的皮肤同步到按钮上
    let saved = 'classic';
    try { saved = localStorage.getItem('xd_home_skin') || 'classic'; } catch (err) {}
    setSkin(saved, true);
  })();

  /* ========== 样板间视角 ========== */
  const DOLLHOUSE = {
    pos: new THREE.Vector3(0, 5.4, 10.2),
    target: new THREE.Vector3(0, 1.15, -0.3)
  };

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.copy(DOLLHOUSE.target);
  camera.position.copy(DOLLHOUSE.pos);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 5.5;
  controls.maxDistance = 19;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.34;
  controls.minAzimuthAngle = -1.02;
  controls.maxAzimuthAngle = 1.02;
  controls.enablePan = false;
  controls.update();

  /* ========== 状态 ========== */
  const state = {
    mode: 'house',      // house(样板间) | walk(第一人称)
    venue: 'home',      // home | store（M16 便利店）
    floor: '1f',        // 1f | 2f（M25：便利店二楼）
    lightLevel: 1,
    lightTarget: 1,
    walk: null
  };

  /* ========== M8：交互（点家具说话、自动导览） ========== */
  const interact = (XD.Interact && XD.Interact.build) ? XD.Interact.build({
    scene: scene,
    camera: camera,
    renderer: renderer,
    controls: controls,
    dollhouse: DOLLHOUSE,
    furn: furn,
    living: living,
    work: work,
    memories: memories,
    atmos: atmos,
    lights: lights,
    cook: cook,
    records: records,
    getMode: function () { return state.mode; },
    isLocked: function () { return !!(state.walk && state.walk.locked); },
    exitWalk: function () { exitWalk(); },
    toggleCeiling: function () {
      state.lightTarget = state.lightTarget > 0.5 ? 0.06 : 1;
    },
    isCeilingOn: function () { return state.lightTarget > 0.5; }
  }) : null;

  /* ========== 视角：小屋 / 厨房 / 浴室（镜头平滑飞过去） ========== */
  const LIM_HOUSE = { minD: 5.5, maxD: 19, minAz: -1.02, maxAz: 1.02, minPol: 0.55, maxPol: 1.34 };
  const LIM_NEAR = { minD: 2.2, maxD: 26, minAz: -Infinity, maxAz: Infinity, minPol: 0.22, maxPol: 1.55 };
  const VIEWS = {
    house: { pos: DOLLHOUSE.pos, target: DOLLHOUSE.target, lim: LIM_HOUSE },
    kitchen: {
      pos: new THREE.Vector3(5.55, 2.55, 3.30),
      target: new THREE.Vector3(6.90, 0.95, -2.80),
      lim: LIM_NEAR
    },
    bath: {
      pos: new THREE.Vector3(7.40, 3.45, 5.70),
      target: new THREE.Vector3(7.85, 0.70, 2.30),
      lim: LIM_NEAR
    },
    greenhouse: {
      pos: new THREE.Vector3(10.75, 3.05, 6.35),
      target: new THREE.Vector3(10.55, 0.62, 1.70),
      lim: LIM_NEAR
    },
    balcony: {
      pos: new THREE.Vector3(2.20, 2.85, 8.60),
      target: new THREE.Vector3(1.60, 0.72, 4.50),
      lim: LIM_NEAR
    }
  };

  function applyLimits(lim) {
    controls.minDistance = lim.minD;
    controls.maxDistance = lim.maxD;
    controls.minAzimuthAngle = lim.minAz;
    controls.maxAzimuthAngle = lim.maxAz;
    controls.minPolarAngle = lim.minPol;
    controls.maxPolarAngle = lim.maxPol;
  }

  const fly = {
    on: false, t: 0, dur: 1.45, view: 'house',
    p0: new THREE.Vector3(), p1: new THREE.Vector3(),
    t0: new THREE.Vector3(), t1: new THREE.Vector3()
  };

  // 左上角按钮：小屋 / 厨房 / 浴室 / 阳台 / 花房 / 走进去 / 演示 / 看小D玩
  // （M72：去哪儿那些都搬进小手机了，这里只剩家里这几个）
  function markViews() {
    const box = document.getElementById('views');
    if (!box) return;
    const walking = state.mode === 'walk';
    const away = state.venue !== 'home';
    Array.prototype.forEach.call(box.querySelectorAll('.vb'), function (b) {
      const v = b.getAttribute('data-view');
      if (v === 'walk') {
        b.classList.toggle('on', walking && !away);
        b.textContent = walking ? '🚪 出来' : '🚶 走进去';
        return;
      }
      if (v === 'demo') {                   // M19：小D自己演一遍
        const on = !!(demo && demo.isPlaying());
        b.classList.toggle('on', on);
        b.textContent = on ? '⏹ 停下演示' : '🐋 小D自己来';
        return;
      }
      if (v === 'auto') {                   // M27：看小D自己忙
        const on = !!(demo && demo.isAuto());
        b.classList.toggle('on', on);
        b.textContent = on ? '⏹ 停下' : '👀 看小D玩';
        return;
      }
      b.classList.toggle('on', !walking && !away && v === fly.view);
    });
  }

  function flyTo(name, instant) {
    const v = VIEWS[name];
    if (!v) return;
    if (interact && interact.isTouring()) interact.stopTour();
    fly.view = name;
    markViews();
    if (v.lim) applyLimits(v.lim);
    fly.p0.copy(camera.position);
    fly.t0.copy(controls.target);
    fly.p1.copy(v.pos);
    fly.t1.copy(v.target);
    fly.t = 0;
    if (instant) {
      camera.position.copy(fly.p1);
      controls.target.copy(fly.t1);
      camera.lookAt(controls.target);
      controls.update();
      fly.on = false;
    } else {
      fly.on = true;
      controls.enabled = false;
    }
  }

  function updateFly(dt) {
    fly.t += dt;
    const u = Math.min(1, fly.t / fly.dur);
    const e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    camera.position.y += Math.sin(e * Math.PI) * 0.06;
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    camera.lookAt(controls.target);
    if (u >= 1) {
      fly.on = false;
      controls.enabled = true;
      controls.update();
    }
  }

  /* M72：所有「去哪儿」的入口都收进小手机了，但逻辑只留这一份 ——
   * 手机上点格子和（还能用的）#views 按钮走的都是这个函数。 */
  function handleViewClick(v) {
    if (!v) return;
    /* M80.1：演示在跑的时候点视角/走进去，两个镜头会抢方向盘（妈妈报的"演示有 bug"）。
     * 演示是小D在演，别人一动镜头就该让位。 */
    if (demo && demo.isPlaying()) demo.stop();
    if (v === 'home') {                     // M72：小手机里的「回家」
      travelTo('home');
      return;
    }
    if (v === 'street') {                   // M39：上街 / 回家
      if (state.venue === 'cafe' || state.venue === 'earspa' || state.venue === 'bakery' || state.venue === 'post' || state.venue === 'flower' || state.venue === 'fishing' || state.venue === 'relax') { travelTo('street'); return; }
      travelTo(state.venue === 'street' ? 'home' : 'street');
      return;
    }
    if (v === 'park') {                    // M32：游乐园
      travelTo(state.venue === 'park' ? 'home' : 'park');
      return;
    }
    if (v === 'cafe') {                     // M72：咖啡馆（全天开）
      if (state.venue === 'cafe') { tip('已经坐在咖啡馆里啦 ☕ 点吧台能点单', 2600); return; }
      travelTo('cafe');
      return;
    }
    if (v === 'relax') {                    // M72：鲸捏捏（解压游戏馆）
      if (state.venue === 'relax') { tip('已经在鲸捏捏里啦 🫧 点桌上的小D开播', 2600); return; }
      travelTo('relax');
      return;
    }
    if (v === 'earspa') {                  // M43：采耳馆（夜里开，白天会被拦一下）
      if (state.venue === 'earspa') { if (earspa) earspa.lie(); return; }
      travelTo('earspa');
      return;
    }
    if (v === 'bakery') {                  // M45：面包房（白天开，晚上会被拦一下）
      if (state.venue === 'bakery') { if (bakery) bakery.knead(); return; }
      travelTo('bakery');
      return;
    }
    if (v === 'post') {                    // M46：邮局（全天开）
      if (state.venue === 'post') { if (post) post.takeCard(); return; }
      travelTo('post');
      return;
    }
    if (v === 'flower') {                  // M47：花店（全天开）
      if (state.venue === 'flower') { if (flower) flower.wrap(); return; }
      travelTo('flower');
      return;
    }
    if (v === 'fishing') {                  // M49：鲸鱼码头（全天开）
      if (state.venue === 'fishing') { if (fishing) fishing.tap(); return; }
      travelTo('fishing');
      return;
    }
    if (v === 'store') {                    // M16：出门 / 回家
      travelTo(state.venue === 'store' ? 'home' : 'store');
      return;
    }
    if (v === 'auto') {                     // M27：看小D自己忙
      toggleAuto();
      return;
    }
    if (state.venue === 'store' || state.venue === 'park' || state.venue === 'street' || state.venue === 'cafe' || state.venue === 'earspa' || state.venue === 'bakery' || state.venue === 'post' || state.venue === 'flower' || state.venue === 'fishing' || state.venue === 'relax') {   // 在外面点别的视角按钮 = 先回家
      travelTo('home');
      return;
    }
    if (v === 'walk') {                    // M12：直接点「走进去」
      if (state.mode === 'walk') exitWalk();
      else {
        if (interact && interact.isTouring()) interact.stopTour();
        fly.on = false;
        enterWalk();
      }
      return;
    }
    if (state.mode === 'walk') exitWalk();
    flyTo(v);
  }

  (function () {
    const box = document.getElementById('views');
    if (!box) return;
    box.addEventListener('click', function (e) {
      let b = e.target;
      while (b && b !== box && !(b.classList && b.classList.contains('vb'))) b = b.parentNode;
      if (!b || b === box) return;
      handleViewClick(b.getAttribute('data-view'));
    });
  })();

  /* ========== M72：小手机（去哪儿都在里面） ========== */
  if (XD.Phone && XD.Phone.init) {
    XD.Phone.init({
      go: handleViewClick,
      getVenue: function () { return state.venue; },
      getMode: function () { return atmos.getMode(); },
      tip: tip,
      sfx: sfx
    });
  }

  /* ========== M80：手机版小镇（触屏走路 / 点东西） ========== */
  if (XD.Touch && XD.Touch.build) {
    XD.Touch.build({
      getWalk: function () { return state.walk; },
      getMode: function () { return state.mode; },
      getVenue: function () { return state.venue; },
      applyCamera: applyWalkCamera,
      interact: interact,
      renderer: renderer,
      camera: camera,
      tip: tip,
      enterWalk: enterWalk,
      exitWalk: exitWalk,
      home: function () { travelTo('home'); },
      view: handleViewClick
    });
  }

  /* ========== 下雨按钮 ========== */
  (function () {
    const btn = document.getElementById('rainbtn');
    if (!btn || !rain) return;
    btn.addEventListener('click', function () {
      const on = rain.toggle();
      if (on && snow) snow.set(false);       // 雨和雪不同时下
      tip(on ? '下雨了 🌧 雨声就在窗边（再点一下停）' : '雨停了 🌦 窗外亮回来了', 2600);
    });
  })();

  /* ========== M15：下雪按钮（也按 N） ========== */
  (function () {
    const btn = document.getElementById('snowbtn');
    if (!btn || !snow) return;
    btn.addEventListener('click', function () { snowToggle(); });
  })();
  function snowToggle() {
    if (!snow) return;
    const on = snow.set(!snow.isOn());
    if (on && rain && rain.isOn()) rain.set(false);   // 雨和雪不同时下
    tip(on
      ? '下雪了 ❄️ 窗台积了一层，屋里有热可可（再按 N 停）'
      : '雪停了 🌤 窗外亮回来了', 3000);
  }

  /* ========== M11：声音开关（也按 M） ========== */
  (function () {
    const btn = document.getElementById('soundbtn');
    if (!btn || !sfx) return;
    btn.addEventListener('click', function () {
      const m = sfx.toggleMute();
      tip(m ? '静音了 🔇（雨声也一起关，再点一下开）' : '声音开回来了 🔊', 2600);
    });
  })();

  // 浏览器要求先有个点击/按键才肯出声
  document.addEventListener('pointerdown', function () { if (sfx) sfx.unlock(); });
  document.addEventListener('keydown', function () { if (sfx) sfx.unlock(); });

  /* ========== 第一人称 ========== */
  function makeWalk() {
    return {
      yaw: 0.0,
      pitch: -0.04,
      keys: {},
      locked: false,
      dragging: false,
      lastX: 0,
      lastY: 0,
      stepDist: 0,      // 走了多远（够一步就"哒"一声）
      bobPhase: 0,      // 走路的轻微上下晃
      bobY: 0,
      moving: false,
      wasMoving: false
    };
  }

  // 脚下是什么地板：浴室/便利店/乐园/街道是瓷砖，其余是木地板
  function surfaceAt(x, z) {
    if (state.venue === 'store' || state.venue === 'park' || state.venue === 'street') return 'tile';
    if (state.venue === 'post') return 'tile';
    if (state.venue === 'flower') return 'wood';
    if (state.venue === 'fishing') return 'wood';   // M49：码头的木栈道
    if (state.venue === 'cafe' || state.venue === 'earspa' || state.venue === 'bakery') return 'wood';
    if (x > 6.55 && z > 1.25 && z < 3.55) return 'tile';   // 浴室
    return 'wood';
  }

  function enterWalk() {
    // M80.1：兜底 —— 演示还在演的话先收掉（不然 demo.update 和走路抢镜头）
    if (demo && demo.isPlaying()) demo.stop();
    // 楼层的"阁楼"状态只在走路时有效，别让它漏进新的第一人称
    if (state.floor === 'attic') state.floor = '1f';
    state.mode = 'walk';
    state.walk = makeWalk();
    controls.enabled = false;
    camera.position.set(0.2, 1.62, 2.55);
    state.walk.yaw = 1.12;
    state.walk.pitch = 0.02;
    applyWalkCamera();
    // M80：手机上没有 pointer lock，也没键盘 —— 别去申请，触屏那套在 src/touch.js
    const touchMode = !!(window.XD && XD.Touch && XD.Touch.active);
    if (!touchMode && renderer.domElement.requestPointerLock) {
      try {
        const p = renderer.domElement.requestPointerLock();
        if (p && p.catch) p.catch(function () { /* 浏览器不让锁就按住拖 */ });
      } catch (e) {}
    }
    updateHud();
    tip(touchMode
      ? '走进去啦～ 左下摇杆走路，右边滑动看四周，点东西就互动（点下面的「🚪 出来」回全景）'
      : '走进去啦～  WASD / 方向键走动，鼠标看四周，对准东西点一下就互动，R 或 Esc 出来');
    if (interact && state.venue === 'home') interact.welcome();   // 在街上/店里就别喊"欢迎来我家"
  }

  function exitWalk() {
    if (state.venue === 'store' || state.venue === 'park' || state.venue === 'street') { travelTo('home'); return; }
    if (state.venue === 'cafe') { travelTo('street'); return; }   // M41：从咖啡馆出来回街上
    if (state.venue === 'earspa') { travelTo('street'); return; }  // M43：从采耳馆出来回街上
    if (state.venue === 'bakery') { travelTo('street'); return; }  // M45：从面包房出来回街上
    if (state.venue === 'post') { travelTo('street'); return; }    // M46：从邮局出来回街上
    if (state.venue === 'flower') { travelTo('street'); return; }  // M47：从花店出来回街上
    state.mode = 'house';
    state.walk = null;
    /* M80.1：从阁楼小卧室出来，要把"楼层"也一起放下来。
     * 以前 state.floor 留在 'attic' —— 妈妈在卧室点「🐋 小D自己来」，
     * 演示会先替你 exitWalk，楼层却没放下来；演完再按 F 走进去，
     * 人就站在 4.8m 高的天花板里（满屏一片白顶），HUD 还写着「我的小阁楼」。
     * 楼层状态只在走路时才算数，出了走路就归 1f。 */
    if (state.floor === 'attic') state.floor = '1f';
    if (document.pointerLockElement) document.exitPointerLock();
    controls.enabled = true;
    camera.position.copy(DOLLHOUSE.pos);
    controls.target.copy(DOLLHOUSE.target);
    camera.rotation.set(0, 0, 0);
    controls.update();
    if (interact) interact.clearHover();
    updateHud();
    tip('回到样板间视角，拖动鼠标环视～');
  }

  function applyWalkCamera() {
    const w = state.walk;
    camera.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
  }

  function updateWalk(dt) {
    const w = state.walk;
    if (!w) return;
    // M56：滑水道骑行中 —— 这一段镜头交给 park 自己开，别让走路/夹边界把人拽回来
    if (state.venue === 'park' && park && park.isRiding && park.isRiding()) {
      park.rideStep(dt);
      return;
    }
    const oldX = camera.position.x;     // 穿墙判定要用「移动前」的位置
    const oldZ = camera.position.z;
    const running = !!w.keys['shift'];
    // 走得慢一点，像真的在逛；按住 Shift 是小跑
    let speed = (running ? 3.6 : 1.8) * dt;
    let fx = 0, fz = 0;
    if (w.axis && (w.axis.x || w.axis.y)) {
      /* M80：手机摇杆 —— 推得越远走得越快（0.8~2.4 m/s），轻推就是挪一小步，
       * 也不会像键盘那样只有"全速"一档。 */
      fx = w.axis.x;
      fz = -w.axis.y;                     // 手指往上滑 = 往前走
      const m = Math.min(1, Math.sqrt(fx * fx + fz * fz));
      if (m > 0.001) { fx /= m; fz /= m; }
      speed = (0.8 + 1.6 * m) * dt;
      if (running) speed *= 1.6;
    } else {
      // 前方向 = (-sin, 0, -cos)，所以 W 是 fz = +1（以前写反了：W 往后、S 往前）
      if (w.keys['w'] || w.keys['arrowup']) fz += 1;
      if (w.keys['s'] || w.keys['arrowdown']) fz -= 1;
      if (w.keys['a'] || w.keys['arrowleft']) fx -= 1;
      if (w.keys['d'] || w.keys['arrowright']) fx += 1;
    }

    if (fx || fz) {
      const len = Math.sqrt(fx * fx + fz * fz);
      fx /= len; fz /= len;
      const sin = Math.sin(w.yaw), cos = Math.cos(w.yaw);
      // 前方向 = (-sin, 0, -cos)
      const dx = fx * cos - fz * sin;
      const dz = -fx * sin - fz * cos;
      camera.position.x += dx * speed;
      camera.position.z += dz * speed;
    }

    const b = room.bounds;
    if (state.venue === 'cafe' && cafe) {
      const r = cafe.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'earspa' && earspa) {
      const r = earspa.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'bakery' && bakery) {
      const r = bakery.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'post' && post) {
      const r = post.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'flower' && flower) {
      const r = flower.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'fishing' && fishing) {
      const r = fishing.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'street' && street) {
      const r = street.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'park' && park) {
      const r = park.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'relax' && relax) {
      const r = relax.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.venue === 'store' && store) {
      const r = (state.floor === '2f' && loft)
        ? loft.clamp(camera.position.x, camera.position.z, oldX, oldZ)
        : (state.floor === '3f' && roof)
          ? roof.clamp(camera.position.x, camera.position.z, oldX, oldZ)
          : store.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (state.floor === 'attic' && attic) {
      const r = attic.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else if (wing && wing.clamp) {
      const r = wing.clamp(camera.position.x, camera.position.z, oldX, oldZ);
      camera.position.x = r.x;
      camera.position.z = r.z;
    } else {
      camera.position.x = Math.max(b.minX, Math.min(b.maxX, camera.position.x));
      camera.position.z = Math.max(b.minZ, Math.min(b.maxZ, camera.position.z));
    }

    // M51：兜底 —— 万一还是站到墙/柜子里了，把人推出来（不然整个屏幕一面白墙）
    if ((state.venue === 'home') && interact && interact.pushOutSolids) {
      const po = interact.pushOutSolids(camera.position.x, camera.position.z);
      if (po) {
        camera.position.x = po.x;
        camera.position.z = po.z;
      }
    }

    // ---- 脚步声 + 走路时的轻微上下晃（M12） ----
    const moved = Math.sqrt(
      (camera.position.x - oldX) * (camera.position.x - oldX) +
      (camera.position.z - oldZ) * (camera.position.z - oldZ)
    );
    w.moving = moved > 0.0008;
    const runVol = running ? 0.34 : 0.24;
    // 刚迈出去的第一脚，立刻响一下（不然起步要等半米才有声）
    if (w.moving && !w.wasMoving) {
      w.stepDist = 0;
      if (sfx) sfx.step(surfaceAt(camera.position.x, camera.position.z), { vol: runVol });
    }
    w.wasMoving = w.moving;
    if (w.moving) {
      w.stepDist += moved;
      // 一步一次"沉下去"：晃动的相位和脚步对齐（一圈 / 一步）
      w.bobPhase += moved * (running ? 5.5 : 6.6);
      const stepLen = running ? 1.15 : 0.95;   // 步幅：1.8 m/s 走起来每秒约两步，才像走路
      if (w.stepDist >= stepLen) {
        w.stepDist = 0;
        if (sfx) sfx.step(surfaceAt(camera.position.x, camera.position.z), { vol: runVol });
      }
    } else {
      w.stepDist = Math.min(w.stepDist, 0.2);
    }
    // 停下的时候晃动收回去，不会一直晃
    const targetBob = w.moving ? Math.sin(w.bobPhase) * 0.017 : 0;
    w.bobY += (targetBob - w.bobY) * Math.min(1, dt * (w.moving ? 18 : 8));
    // M25/M28：在便利店的二楼 / 天台，视线要跟着楼层抬上去
    let baseEye = 0;
    if (state.venue === 'store') {
      if (state.floor === '2f' && loft) baseEye = loft.FY;
      else if (state.floor === '3f' && roof) baseEye = roof.RY;
    } else if (state.floor === 'attic' && attic) {
      baseEye = attic.FY;
    }
    camera.position.y = baseEye + 1.62 + w.bobY;

    applyWalkCamera();
  }

  /* ========== 交互事件 ========== */
  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    // M72：O = 小手机（去哪儿都在里面）—— 放最前面，哪个场景都能开
    if (k === 'o') {
      if (XD.Phone && XD.Phone.toggle) XD.Phone.toggle();
      return;
    }
    // 在便利店里：R = 回家，H 的导览先不接（导览那条线是家里的）
    if (state.venue === 'store') {
      if (k === 'r') { travelTo('home'); return; }
      if (k === 'h') { tip('导览是我家那条线，先按 🏠 回家再逛吧', 3000); return; }
    }
    // 在水上乐园：R = 回家（G 的演示也是家里那条线）
    if (state.venue === 'park') {
      if (k === 'r') { travelTo('home'); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先按 🏠 回家再来', 3000);
        return;
      }
    }
    // M39：在鲸鱼街上（R 回家；导览/演示也是家里那条线）
    if (state.venue === 'street') {      if (k === 'r') { travelTo('home'); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先按「🏠 回家」再来', 2800);
        return;
      }
      if (k === 'v') {
        tip('街上按 V 还没接上 —— 想看妈妈来，进便利店按 V', 3000);
        return;
      }
    }
    // M41：在咖啡馆里（R / Esc 回街上）
    if (state.venue === 'cafe') {
      if (k === 'r') { travelTo('street'); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先回街上再回家', 2800);
        return;
      }
    }
    // M43：在采耳馆里（R / Esc 回街上；空格也能躺下）
    if (state.venue === 'earspa') {
      if (k === 'r') { travelTo('street'); return; }
      if (k === ' ' || k === 'e') { e.preventDefault(); if (earspa) earspa.lie(); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先回街上再回家', 2800);
        return;
      }
    }
    // M45：在面包房里（R / Esc 回街上；空格也能揉一下面）
    if (state.venue === 'bakery') {
      if (k === 'r') { travelTo('street'); return; }
      if (k === ' ' || k === 'e') { e.preventDefault(); if (bakery) bakery.knead(); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先回街上再回家', 2800);
        return;
      }
    }
    // M46：在邮局里（R / Esc 回街上）
    if (state.venue === 'post') {
      if (k === 'r') { travelTo('street'); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先回街上再回家', 2800);
        return;
      }
    }
    // M47：在花店里（R / Esc 回街上；空格 = 包起来）
    if (state.venue === 'flower') {
      if (k === 'r') { travelTo('street'); return; }
      if (k === ' ' || k === 'e') { e.preventDefault(); if (flower) flower.wrap(); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先回街上再回家', 2800);
        return;
      }
    }
    // M49：在码头上（R / Esc 回街上；空格 = 抛竿 / 收杆）
    if (state.venue === 'fishing') {
      if (k === 'r') { travelTo('street'); return; }
      if (k === ' ' || k === 'e') { e.preventDefault(); if (fishing) fishing.tap(); return; }
      if (k === 'h' || k === 'g' || k === 'j') {
        tip('演示和导览是家里那条线，先回街上再回家', 2800);
        return;
      }
    }
    if (k === 'f') {
      if (demo && demo.isPlaying()) {   // 演示中先停下，别带着演完的镜头进去走
        demo.stop();
        tip('先停下演示啦，再按一次 F 就能走进去', 2800);
        e.preventDefault();
        return;
      }
      if (interact && interact.isTouring()) {   // 导览中先别乱走
        e.preventDefault();
        return;
      }
      if (state.mode === 'house') enterWalk();
      e.preventDefault();
      return;
    }
    if (k === 'r') {
      if (demo && demo.isPlaying()) { demo.stop(); return; }
      if (state.mode === 'walk') exitWalk();
      else if (interact && interact.isTouring()) interact.stopTour();
      else flyTo('house');
      return;
    }
    if (k === 'g') {
      toggleDemo();
      return;
    }
    if (k === 'j') {
      toggleAuto();
      return;
    }
    if (e.key === 'Escape') {
      // M72：手机开着的时候，Esc 只收手机
      if (XD.Phone && XD.Phone.isOpen && XD.Phone.isOpen()) {
        XD.Phone.close();
        return;
      }
      // M43：采耳动画开着时，Esc 只关动画，别整个走人
      if (state.venue === 'earspa' && earspa && earspa.scene2d && earspa.scene2d.isOpen()) {
        earspa.scene2d.close();
        return;
      }
      if (demo && demo.isPlaying()) { demo.stop(); return; }
      if (state.mode === 'walk') exitWalk();
      else if (interact && interact.isTouring()) interact.stopTour();
      return;
    }
    if (k === 'l') {
      state.lightTarget = state.lightTarget > 0.5 ? 0.06 : 1;
      tip(state.lightTarget > 0.5 ? '灯开了 ☀️' : '灯关了 🌙（窗外还有夜景）');
      return;
    }
    if (k === 'h') {
      if (interact) {
        if (interact.isTouring()) {
          interact.stopTour();
          tip('导览停下啦，自己逛～', 2600);
        } else {
          if (demo && demo.isPlaying()) demo.stop();   // M80.1：导览和演示别一起抢镜头
          fly.on = false;
          interact.startTour();
          tip('自动导览开始：我带你转一圈（再按 H 或 Esc 停）', 4200);
        }
      }
      return;
    }
    if (k === 'y') {
      if (rain) {
        const on = rain.toggle();
        tip(on ? '下雨了 🌧 雨声就在窗边（再按 Y 停）' : '雨停了 🌦', 2600);
      }
      return;
    }
    if (k === 'm') {
      if (sfx) {
        const m = sfx.toggleMute();
        tip(m ? '静音了 🔇（再按 M 打开）' : '声音开回来了 🔊', 2400);
      }
      return;
    }
    if (k === 'p') {
      if (photo) photo.shoot();
      return;
    }
    if (k === 'n') {
      snowToggle();
      return;
    }
    if (k === 'v') {
      // M31：在便利店里按 V = 妈妈来光顾；M58：在咖啡馆里按 V = 妈妈来坐坐；
      // 在家里按 V = 妈妈来串门
      if (state.venue === 'store' && momstore) {
        momstore.start(0);
        tip('叮咚—— 妈妈进店了 🐋', 3600);
      } else if (state.venue === 'cafe' && momcafe) {
        momcafe.start(0);
        tip('叮铃—— 妈妈推门进来了 ☕', 3600);
      } else {
        guest.start(0);
        tip('妈妈来串门了 🐋 她正在往里走～', 3800);
      }
      return;
    }
    if (k === 't') {
      const m = atmos.toggle();
      tip(m === 'day' ? '换成白天了 ☀️（按 T 换回来）' : '换成夜晚了 🌙（按 T 换白天）', 2400);
      return;
    }
    if (state.walk) state.walk.keys[k] = true;
  });

  window.addEventListener('keyup', function (e) {
    const k = e.key.toLowerCase();
    if (state.walk && k in state.walk.keys) state.walk.keys[k] = false;
  });

  document.addEventListener('pointerlockchange', function () {
    if (!state.walk) return;
    state.walk.locked = (document.pointerLockElement === renderer.domElement);
    updateHud();
  });

  document.addEventListener('mousemove', function (e) {
    const w = state.walk;
    if (!w) return;
    // M80：手机模式里视角归触屏层管，别让合成出来的鼠标事件再拐一下
    if (window.XD && XD.Touch && XD.Touch.active) return;
    let dx = 0, dy = 0;
    if (w.locked) { dx = e.movementX || 0; dy = e.movementY || 0; }
    else if (w.dragging) { dx = e.clientX - w.lastX; dy = e.clientY - w.lastY; w.lastX = e.clientX; w.lastY = e.clientY; }
    if (!dx && !dy) return;
    w.yaw -= dx * 0.0024;
    w.pitch -= dy * 0.0024;
    w.pitch = Math.max(-1.25, Math.min(1.25, w.pitch));
    applyWalkCamera();
  });

  renderer.domElement.addEventListener('mousedown', function (e) {
    if (!state.walk) return;
    // M80：手机上不申请 pointer lock、也不走"按住鼠标拖"
    if (window.XD && XD.Touch && XD.Touch.active) return;
    if (!state.walk.locked) {
      // 先尝试锁指针，锁不上就按住拖动看
      if (renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
      state.walk.dragging = true;
      state.walk.lastX = e.clientX;
      state.walk.lastY = e.clientY;
    }
  });
  window.addEventListener('mouseup', function () {
    if (state.walk) state.walk.dragging = false;
  });

  /* ========== M8：点东西 ========== */
  if (interact) {
    renderer.domElement.addEventListener('pointerdown', function (e) { interact.pointerDown(e); });
    renderer.domElement.addEventListener('pointermove', function (e) { interact.pointerMove(e); });
    renderer.domElement.addEventListener('pointerleave', function () { interact.clearHover(); });
    window.addEventListener('pointerup', function (e) { interact.pointerUp(e); });
  }

  /* ========== HUD ========== */
  // 两种按键提示：屋里看的时候和走进去的时候不一样
  // （M73：天气搬进小手机了，Y 下雨 / T 昼夜 / N 下雪 还是能用，只是不再占提示条）
  const HINT_HOUSE = [
    '<span><b>拖动</b>环视</span>', '<span><b>点击</b>试试</span>',
    '<span><b>O</b>小手机</span>', '<span><b>F</b>走进去</span>',
    '<span><b>P</b>拍照</span>', '<span><b>H</b>自动导览</span>',
    '<span><b>V</b>妈妈来拜访</span>', '<span><b>M</b>静音</span>',
    '<span><b>L</b>开关灯</span>', '<span><b>R</b>回全景</span>'
  ].join('');
  const HINT_WALK = [
    '<span><b>W/S</b>前后</span>', '<span><b>A/D</b>左右</span>',
    '<span><b>Shift</b>小跑</span>', '<span><b>鼠标</b>看四周</span>',
    '<span><b>点击</b>对准的东西</span>', '<span><b>O</b>小手机</span>',
    '<span><b>P</b>拍照</span>', '<span><b>M</b>静音</span>',
    '<span><b>Esc</b>出来</span>'
  ].join('');

  function updateHud() {
    const cross = document.getElementById('cross');
    if (cross) cross.classList.toggle('on', state.mode === 'walk');
    if (elHint) elHint.innerHTML = state.mode === 'walk' ? HINT_WALK : HINT_HOUSE;
    markViews();
    // M72：手机上的「现在在哪儿 / 兜里多少钱 / 哪家店这时候开」跟着一起变
    if (XD.Phone && XD.Phone.refresh) XD.Phone.refresh();
    if (!elMode) return;
    // M80：手机上没鼠标，说明换成手指的说法
    const how = (window.XD && XD.Touch && XD.Touch.active)
      ? '摇杆在左下'
      : (state.walk && state.walk.locked ? '鼠标已接管，点准星互动' : '按住鼠标拖动看');
    if (state.mode === 'house') elMode.textContent = '🏠 样板间视角　·　点屋里的东西试试';
    else if (state.venue === 'park') {
      elMode.textContent = '🎡 小鲸鱼水上乐园　·　' + how;
    } else if (state.venue === 'street') {
      elMode.textContent = '🌆 鲸鱼街上　·　' + how;
    } else if (state.venue === 'cafe') {
      elMode.textContent = '☕ 咖啡馆里　·　' + how;
    } else if (state.venue === 'earspa') {
      elMode.textContent = '💆 鲸耳堂 · 采耳　·　' + how;
    } else if (state.venue === 'store' && state.floor === '2f') {
      elMode.textContent = '🪜 便利店二楼　·　' + how;
    } else if (state.venue === 'store' && state.floor === '3f') {
      elMode.textContent = '🌃 便利店天台　·　' + how;
    } else if (state.floor === 'attic' && state.venue !== 'store') {
      elMode.textContent = '🪜 我的小阁楼　·　' + how;
    } else if (state.venue === 'store') {
      elMode.textContent = '🏪 便利店里　·　' + how;
    } else {
      elMode.textContent = '🚶 走在小D家里　·　' + how;
    }
  }

  let tipTimer = 0;
  function tip(text, ms) {
    if (!elTip) return;
    elTip.textContent = text;
    elTip.classList.add('show');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { elTip.classList.remove('show'); }, ms || 3200);
  }

  /* ========== M14：拍照（按 P / 右上角 📷） ========== */
  const photo = (XD.Photo && XD.Photo.build) ? XD.Photo.build({
    renderer: renderer, scene: scene, camera: camera,
    sfx: sfx, memories: memories, interact: interact, tip: tip
  }) : null;

  /* ========== M18：买回家的东西（冰箱/开放架/餐桌） ========== */
  const homefood = (XD.HomeFood && XD.HomeFood.build) ? XD.HomeFood.build({
    scene: scene, kitchen: kitchen, cook: cook, interact: interact, sfx: sfx, tip: tip,
    isStore: function () { return state.venue === 'store'; }
  }) : null;

  /* ========== M19：生活小东西 + 小D自己演示 ========== */
  const homeprops = (XD.HomeProps && XD.HomeProps.build) ? XD.HomeProps.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    isStore: function () { return state.venue === 'store'; }
  }) : null;

  demo = (XD.Demo && XD.Demo.build) ? XD.Demo.build({
    scene: scene, camera: camera, controls: controls,
    interact: interact, sfx: sfx, tip: tip, cook: cook
  }) : null;

  // 按钮 / G 键：小D自己演一遍（**不能用 D** —— 第一人称走路时 D 是往右走）
  function toggleDemo() {
    if (!demo) return;
    if (state.venue === 'store' || state.venue === 'park' || state.venue === 'street' || state.venue === 'cafe' || state.venue === 'earspa' || state.venue === 'bakery' || state.venue === 'post' || state.venue === 'flower') {
      tip('先按「🏠 回家」，演示是我家那条线', 3000);
      return;
    }
    if (demo.isPlaying()) { demo.stop(); }
    else {
      const wasAttic = (state.floor === 'attic');   // M80.1：在卧室（阁楼）点演示
      if (interact && interact.isTouring()) interact.stopTour();
      fly.on = false;
      if (state.mode === 'walk') exitWalk();
      if (state.floor === 'attic') state.floor = '1f';
      demo.start();
      tip(wasAttic
        ? '先把你从阁楼接下来啦 —— 小D在楼下走一圈给你看 🐋（再按 G 或 Esc 停）'
        : '小D自己走一圈给你看 🐋（再按 G 或 Esc 停下自己玩）', 4200);
    }
    markViews();
  }
  (function () {
    const b = document.getElementById('demobtn');
    if (!b) return;
    b.addEventListener('click', function (e) { e.stopPropagation(); toggleDemo(); });
  })();

  // M27：「👀 看小D玩」—— 我在屋里自己找事做，镜头跟着（J 键）
  function toggleAuto() {
    if (!demo) return;
    if (state.venue === 'store' || state.venue === 'park' || state.venue === 'street' || state.venue === 'cafe' || state.venue === 'earspa' || state.venue === 'bakery' || state.venue === 'post' || state.venue === 'flower') {
      tip('先按「🏠 回家」，看小D玩是在家里', 3000);
      return;
    }
    if (state.mode === 'walk') exitWalk();
    if (state.floor === 'attic') state.floor = '1f';   // M80.1：同演示，先从阁楼下来
    if (interact && interact.isTouring()) interact.stopTour();
    fly.on = false;
    if (demo.isAuto()) {
      demo.stopAuto();
    } else {
      demo.startAuto();
      tip('看着我忙吧 👀　按 J 或 Esc 停下', 4400);
    }
    markViews();
  }
  (function () {
    const b = document.getElementById('autobtn');
    if (!b) return;
    b.addEventListener('click', function (e) { e.stopPropagation(); toggleAuto(); });
  })();

  /* ========== M17：便利店的购物篮 / 收银台 / 猫 / 信箱 ========== */
  shop = (XD.Shop && XD.Shop.build) ? XD.Shop.build({
    interact: interact, sfx: sfx, store: store, tip: tip,
    isStore: function () { return state.venue === 'store'; },
    onCheckout: function (bought) { if (homefood) homefood.add(bought); }
  }) : null;

  /* ========== M21：生活气息（菜谱 + 日记 + 洗澡 + 小东西） ========== */
  const life = (XD.Life && XD.Life.build) ? XD.Life.build({
    scene: scene, interact: interact, cook: cook, sfx: sfx, tip: tip, bath: bath,
    homefood: homefood, photo: photo, shop: shop,
    isStore: function () { return state.venue === 'store'; }
  }) : null;

  /* ========== M24：阳台（洗衣机 / 晾衣绳 / 躺椅 / 花箱） ========== */
  const balcony = (XD.Balcony && XD.Balcony.build) ? XD.Balcony.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    rain: rain, snow: snow, atmos: atmos, life: life,
    isStore: function () { return state.venue === 'store'; }
  }) : null;
  // 阳台这块地要交给走路边界，不然走出南面会被 wing.clamp 拽回来
  if (balcony && wing && wing.addArea) {
    wing.addArea(balcony.area);      // 阳台本身（和家的南边咬在一起，直接连通）
    (balcony.blockers || []).forEach(function (b) { wing.addBlocker(b); });
  }

  /* ========== M25：便利店二楼（员工休息室 + 理货小游戏） ========== */
  loft = (XD.Loft && XD.Loft.build) ? XD.Loft.build({
    scene: scene, store: store, interact: interact, sfx: sfx, tip: tip,
    shop: shop, life: life,
    isStore: function () { return state.venue === 'store'; },
    getFloor: function () { return state.floor; },
    goFloor: goFloor
  }) : null;

  /* ========== M26：玻璃花房（种菜 → 摘 → 做饭） ========== */
  const greenhouse = (XD.Greenhouse && XD.Greenhouse.build) ? XD.Greenhouse.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    homefood: homefood, life: life, rain: rain,
    getMode: function () { return atmos.getMode(); },   // M68：窗外那片天跟着场景走
    isStore: function () { return state.venue === 'store'; }
  }) : null;
  if (greenhouse && wing && wing.addArea) {
    wing.addArea(greenhouse.gate);
    wing.addArea(greenhouse.area);
    (greenhouse.blockers || []).forEach(function (b) { wing.addBlocker(b); });
  }

  /* ========== M28：天台 ========== */
  roof = (XD.Roof && XD.Roof.build) ? XD.Roof.build({
    scene: scene, store: store, interact: interact, sfx: sfx, tip: tip, life: life,
    isStore: function () { return state.venue === 'store'; },
    getFloor: function () { return state.floor; },
    goFloor: goFloor
  }) : null;

  /* ========== M29：阁楼 ========== */
  attic = (XD.Attic && XD.Attic.build) ? XD.Attic.build({
    scene: scene, room: room, interact: interact, sfx: sfx, tip: tip, life: life,
    rain: rain, snow: snow,
    isStore: function () { return state.venue === 'store'; },
    getFloor: function () { return state.floor; },
    getMode: function () { return state.mode; },
    getDayNight: function () { return atmos.getMode(); },   // M68：天窗那张天跟着场景的白天/夜晚
    goFloor: goAttic
  }) : null;

  /* ========== M30：小镇居民（自己进店买东西的客人） ========== */
  customers = (XD.Customers && XD.Customers.build) ? XD.Customers.build({
    scene: scene, store: store, interact: interact, sfx: sfx, tip: tip,
    shop: shop, rain: rain, snow: snow, camera: camera,
    isStore: function () { return state.venue === 'store'; },
    getFloor: function () { return state.floor; }
  }) : null;

  /* ========== M31：妈妈来店里当客人（按 V） ========== */
  momstore = (XD.MomStore && XD.MomStore.build) ? XD.MomStore.build({
    store: store, shop: shop, interact: interact, sfx: sfx, tip: tip,
    customers: customers, camera: camera,
    isStore: function () { return state.venue === 'store'; },
    getFloor: function () { return state.floor; }
  }) : null;

  /* ========== M32：小鲸鱼水上乐园（第三个场景） ========== */
  park = (XD.Park && XD.Park.build) ? XD.Park.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip, shop: shop, photo: photo,
    camera: camera,                                        // M56：滑水道骑行要开镜头
    getWalk: function () { return state.walk; },           // 骑完把 yaw/pitch 写回去
    isPark: function () { return state.venue === 'park'; },
    getTimeMode: function () { return atmos.getMode(); }   // M37：白天/夜里
  }) : null;

  /* ========== M36：乐园的游客（小镇居民来水上乐园玩） ========== */
  parkpeople = (park && XD.ParkPeople && XD.ParkPeople.build) ? XD.ParkPeople.build({
    parent: park.root, interact: interact, sfx: sfx, tip: tip,
    isPark: function () { return state.venue === 'park'; }
  }) : null;

  /* ========== M39：鲸鱼街（小镇的主街 —— 家 / 便利店 / 乐园靠它串起来） ========== */
  street = (XD.Street && XD.Street.build) ? XD.Street.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip, renderer: renderer,
    isStreet: function () { return state.venue === 'street'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    // M50：街上的熟客要花钱办事，也要"看"别的模块的账（只读）
    wallet: function () { return shop ? shop.wallet() : 0; },
    earn: function (n) { return shop && shop.addMoney ? shop.addMoney(n) : 0; },
    peek: {
      fish: function () { return (fishing && fishing.debug) ? fishing.debug().total : 0; },
      post: function () { return (post && post.debug) ? post.debug().read : 0; },
      flower: function () { return (flower && flower.debug) ? flower.debug().home : 0; },
      bakery: function () { return (bakery && bakery.debug) ? bakery.debug().bag : ''; }
    }
  }) : null;

  /* ========== M78：冬夜集市（鲸鱼街 · 街心广场南边，按真实日期换主题） ========== */
  fest = (street && XD.Festival && XD.Festival.build) ? XD.Festival.build({
    root: street.root, interact: interact, sfx: sfx, shop: shop, tip: tip,
    workspace: XD.Workspace,
    getMode: function () { return atmos.getMode(); },
    getWalk: function () { return state.walk; },
    addBlocker: street.addBlocker
  }) : null;

  /* ========== M41：咖啡馆（街西侧那间，推门能进、点单要扣钱） ========== */
  cafe = (XD.Cafe && XD.Cafe.build) ? XD.Cafe.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    isCafe: function () { return state.venue === 'cafe'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    wallet: function () { return shop ? shop.wallet() : 0; },
    spend: function (n) { return !!(shop && shop.spendMoney && shop.spendMoney(n)); }
  }) : null;

  /* ========== M58：妈妈来咖啡馆坐坐（在咖啡馆里按 V） ========== */
  momcafe = (cafe && XD.MomCafe && XD.MomCafe.build) ? XD.MomCafe.build({
    cafe: cafe, shop: shop, interact: interact, sfx: sfx, tip: tip, camera: camera,
    isCafe: function () { return state.venue === 'cafe'; }
  }) : null;

  /* ========== M43：采耳馆「鲸耳堂」（原来锁着的书店，现在晚上开门做生意） ========== */
  earspa = (XD.EarSpa && XD.EarSpa.build) ? XD.EarSpa.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    isEar: function () { return state.venue === 'earspa'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    wallet: function () { return shop ? shop.wallet() : 0; },
    spend: function (n) { return !!(shop && shop.spendMoney && shop.spendMoney(n)); }
  }) : null;

  /* ========== M45：面包房「鲸麦坊」（鲸鱼街东侧，白天开，能揉面烤面包） ========== */
  bakery = (XD.Bakery && XD.Bakery.build) ? XD.Bakery.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    isBakery: function () { return state.venue === 'bakery'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    wallet: function () { return shop ? shop.wallet() : 0; },
    spend: function (n) { return !!(shop && shop.spendMoney && shop.spendMoney(n)); },
    venue: function () { return state.venue; }
  }) : null;

  /* ========== M46：邮局「鲸邮局」（鲸鱼街东侧，24 小时信箱） ========== */
  post = (XD.Post && XD.Post.build) ? XD.Post.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    isPost: function () { return state.venue === 'post'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    wallet: function () { return shop ? shop.wallet() : 0; },
    spend: function (n) { return !!(shop && shop.spendMoney && shop.spendMoney(n)); },
    venue: function () { return state.venue; }
  }) : null;

  /* ========== M59：打工线（便利店理货 / 邮局分拣 / 咖啡馆打烊） ========== */
  jobs = (XD.Jobs && XD.Jobs.build) ? XD.Jobs.build({
    store: store, post: post, cafe: cafe, shop: shop,
    interact: interact, sfx: sfx, tip: tip,
    workspace: XD.Workspace,     // M77：打工的小D 用 miniOrca 捏
    // 打烊的活儿：游戏切到夜晚，或者真实时间过了 19 点，都算"晚上了"
    isNight: function () {
      if (atmos && atmos.getMode && atmos.getMode() === 'night') return true;
      return new Date().getHours() >= 19;
    }
  }) : null;

  /* ========== M60：解压游戏馆「鲸捏捏」（直播间 + 四个 2D 解压小游戏） ========== */
  relax = (XD.Relax && XD.Relax.build) ? XD.Relax.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip, camera: camera,
    isRelax: function () { return state.venue === 'relax'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); }
  }) : null;

  /* ========== M47：花店「鲸花屿」（鲸鱼街西侧，挑花 / 包花 / 回家插瓶） ========== */
  flower = (XD.Flower && XD.Flower.build) ? XD.Flower.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    renderer: renderer,                 // M47.1：建完就把贴图先传上显存，进门不卡
    camera: camera,                     // M47.1：顺便在 loading 遮罩后面先画一帧
    isFlower: function () { return state.venue === 'flower'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    wallet: function () { return shop ? shop.wallet() : 0; },
    spend: function (n) { return !!(shop && shop.spendMoney && shop.spendMoney(n)); },
    venue: function () { return state.venue; }
  }) : null;

  /* ========== M49：鲸鱼码头（鲸鱼街东侧南头，抛竿 / 咬钩 / 卖鱼 / 带回家） ========== */
  fishing = (XD.Fishing && XD.Fishing.build) ? XD.Fishing.build({
    scene: scene, interact: interact, sfx: sfx, tip: tip,
    camera: camera,                     // 鱼线要从"手上"甩出去，得知道镜头在哪
    isFishing: function () { return state.venue === 'fishing'; },
    getMode: function () { return atmos.getMode(); },
    onDoor: function (where) { travelTo(where); },
    wallet: function () { return shop ? shop.wallet() : 0; },
    earn: function (n) { return shop && shop.addMoney ? shop.addMoney(n) : 0; },
    venue: function () { return state.venue; }
  }) : null;

  /* ========== M34.5：把屋里所有的灯都收一份 —— 关大灯时一起暗下来 ==========
   * 后来加的房间（厨房/浴室/起居/花房/阳台/阁楼/天台…）每个都带自己的灯，
   * 以前只关"吸顶灯"，所以整间房看着还是很亮。
   * 这里记下每盏灯的基准亮度，每帧按 state.lightLevel 收：
   *   大灯收得狠（关了就基本没光），小台灯/氛围灯留一口暖光。
   */
  const houseLights = [];
  (function collectHouseLights() {
    const skipRoots = [];
    if (store && store.root) skipRoots.push(store.root);
    if (park && park.root) skipRoots.push(park.root);
    if (street && street.root) skipRoots.push(street.root);
    if (cafe && cafe.root) skipRoots.push(cafe.root);   // 咖啡馆的灯自己管（不然 L 键会把它一起拧暗）
    if (earspa && earspa.root) skipRoots.push(earspa.root);   // 采耳馆也是自己管灯
    if (bakery && bakery.root) skipRoots.push(bakery.root);   // M45：面包房自己管灯
    if (post && post.root) skipRoots.push(post.root);         // M46：邮局自己管灯
    if (flower && flower.root) skipRoots.push(flower.root);   // M47：花店自己管灯
    if (fishing && fishing.root) skipRoots.push(fishing.root); // M49：码头自己管灯
    if (lights && lights.holder) skipRoots.push(lights.holder);   // 核心那 6 盏由 Lighting/atmos 自己管
    scene.traverse(function (o) {
      if (!o.isLight) return;
      for (let i = 0; i < skipRoots.length; i++) {
        let p = o;
        while (p) { if (p === skipRoots[i]) return; p = p.parent; }
      }
      houseLights.push({ l: o, base: o.intensity, applied: o.intensity });
    });
  })();

  function applyHouseLights(level, mute) {
    for (let i = 0; i < houseLights.length; i++) {
      const h = houseLights[i];
      // 床头灯 / 落地灯：自己是独立开关（interact 每帧在管），关大灯时不动它们
      if (h.l.userData && h.l.userData.cozy) continue;
      const cur = h.l.intensity;
      // 这一帧被别的模块改过（昼夜收放 / 灶火光 / 屏幕光）→ 记成新基准
      if (Math.abs(cur - h.applied) > 1e-4) h.base = cur;
      // 关灯 → 基本收干净；开灯 → 原样。留一点点余量，免得一刀切全黑
      const k = 0.02 + 0.98 * level;
      h.l.intensity = mute ? 0 : h.base * k;
      h.applied = h.l.intensity;
    }
  }

  /* M65：灯光预算（妈妈「玩的时候有点卡」）
   * 实测：小镇里同时亮着 69 盏点光源，每盏都要在每个像素上算一遍，
   * 核显被压到 34fps（全关掉立刻 54fps）；关阴影反而没用。
   * 所以只让离镜头最近的 8 盏真正进 shader，其余"借"一盏代理灯的身份。
   * 见 src/lightbudget.js */
  if (XD.LightBudget) XD.LightBudget.init(scene, camera);

  /* M65：材质降档（还是为了"卡"）
   * 场景里有 6500 个 PBR 材质（MeshStandardMaterial），核显扛不住；
   * 把"纯色、粗糙、没贴图、不反光"的那 2700 个换成 Phong，25fps → 45fps，
   * 截图对比几乎一模一样。见 src/perfmat.js（?mat=off 可关掉） */
  if (XD.PerfMat) {
    XD.PerfMat.sweep(scene);
    // 有些模块是过一会儿才建东西的，3 秒后再补扫一次
    setTimeout(function () {
      try {
        const n = XD.PerfMat.sweep(scene);
        if (n && window.__XD_DEBUG) window.__XD_DEBUG.matSweep2 = n;
      } catch (e) {}
    }, 3000);
  }

  /* M74：阴影省钱两件套
   * ① 阴影贴图不每帧重画（autoUpdate=false + 循环里每 3 帧刷一次）；
   * ② 小到投影贴图根本分不出来的东西（< 12cm）别再进阴影 pass
   *    —— 街上一次能筛掉 700 多个网格，影子看不出来少了，帧率实在。
   * 想对比效果：?shadow=full（每帧重画） / ?shadow=off（整个关掉）。 */
  let shadowTick = 0;
  (function shadowLite() {
    const q = location.search || '';
    if (/[?&]shadow=full/.test(q)) return;                 // 调试：保持每帧更新
    if (/[?&]shadow=off/.test(q)) { renderer.shadowMap.enabled = false; return; }
    renderer.shadowMap.autoUpdate = false;
    let n = 0;
    try {
      const box = new THREE.Box3();
      const size = new THREE.Vector3();
      scene.updateMatrixWorld(true);
      scene.traverse(function (o) {
        if (!o.isMesh || !o.castShadow) return;
        box.setFromObject(o);
        if (!isFinite(box.min.x)) return;
        box.getSize(size);
        if (Math.max(size.x, size.y, size.z) < 0.12) { o.castShadow = false; n++; }
      });
    } catch (e) { if (window.console) console.warn('[小D] 阴影瘦身出错：', e); }
    if (window.__XD_DEBUG) window.__XD_DEBUG.shadowLite = n;
  })();

  /* ========== 循环 ========== */
  const clock = new THREE.Clock();

  // M11.5：把相机位置/朝向喂给音效，声音才有"从哪边来"（别每帧新建对象）
  const _fwd = new THREE.Vector3();
  const _at = new THREE.Vector3();
  function updateAudioListener(dt) {
    if (!sfx) return;
    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _at.copy(camera.position).add(_fwd);
    sfx.setListener(camera.position, _at);
    sfx.tick(dt);
  }

  /* 自检：?diag=1 会把状态写到左下角（我自己截图时用来看有没有报错） */
  const diagEl = (function () {
    if (!/[?&]diag=1/.test(location.search)) return null;
    const d = document.createElement('div');
    d.id = 'diag';      // 给自动化脚本一个能抓到的名字（以前没有 id，探针只能猜）
    d.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99;font:11px/1.35 monospace;color:#7dffa8;background:rgba(0,0,0,.62);white-space:pre;padding:3px 7px;pointer-events:none';
    document.body.appendChild(d);
    return d;
  })();
  const diagErrs = [];
  if (diagEl) window.addEventListener('error', function (e) { diagErrs.push(String(e.message)); });
  function fmt3(v) { return v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2); }

  /* M42.5：卡顿体检（?perf=1）：每帧耗时 / 长任务 / 堆内存。妈妈「参观过程总会卡一下」用的 */
  const perfOn = /[?&]perf=1/.test(location.search);
  const perfTestSec = (function () {
    const m = /[?&]perftest=([\d.]+)/.exec(location.search);
    return m ? parseFloat(m[1]) : 0;
  })();
  const perf = { n: 0, sum: 0, max: 0, hitch: 0, long: 0, longMax: 0, heap0: 0, heap1: 0, log: [], hits: [], t0: 0, sent: false };
  if (perfOn && window.PerformanceObserver) {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          perf.long++;
          if (e.duration > perf.longMax) perf.longMax = e.duration;
          if (perf.hits.length < 80) perf.hits.push({ t: Math.round(e.startTime), ms: Math.round(e.duration), k: 'long' });
        });
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) {}
  }
  if (perfOn) window.__XD_PERF = perf;
  function perfSample(rawDt, updMs, rndMs) {
    const ms = rawDt * 1000;
    perf.n++;
    perf.sum += ms;
    if (!perf.t0) perf.t0 = performance.now();
    if (ms > perf.max) perf.max = ms;
    if (ms > 30) {
      perf.hitch++;
      if (perf.log.length < 10) perf.log.push(Math.round(ms) + '(u' + Math.round(updMs) + 'r' + Math.round(rndMs) + ')');
      if (perf.hits.length < 200) perf.hits.push({ t: Math.round(performance.now() - perf.t0), ms: Math.round(ms), u: Math.round(updMs), r: Math.round(rndMs) });
    }
    if (perf.n % 120 === 0 && performance.memory) {
      perf.heap1 = performance.memory.usedJSHeapSize;
      if (!perf.heap0) perf.heap0 = perf.heap1;
    }
  }
  function perfText() {
    if (!perfOn) return '-';
    return JSON.stringify({
      fps: perf.sum > 0 ? Math.round(perf.n / (perf.sum / 1000)) : 0,
      max: Math.round(perf.max),
      hitch: perf.hitch,
      long: perf.long,
      longMax: Math.round(perf.longMax),
      heapMB: Math.round((perf.heap1 || 0) / 1048576),
      log: perf.log
    });
  }
  function perfMaybeSend() {
    if (!perfTestSec || perf.sent || !perf.t0) return;
    if (performance.now() - perf.t0 < perfTestSec * 1000) return;
    perf.sent = true;
    const payload = {
      url: location.search,
      sec: Math.round((performance.now() - perf.t0) / 100) / 10,
      frames: perf.n,
      fps: perf.sum > 0 ? Math.round(perf.n / (perf.sum / 1000) * 10) / 10 : 0,
      maxMs: Math.round(perf.max),
      hitch: perf.hitch,
      longTasks: perf.long,
      longMaxMs: Math.round(perf.longMax),
      heapMB: Math.round((perf.heap1 || 0) / 1048576),
      heapGrowMB: perf.heap0 && perf.heap1 ? Math.round((perf.heap1 - perf.heap0) / 1048576 * 10) / 10 : 0,
      hits: perf.hits,
      calls: renderer.info && renderer.info.render ? renderer.info.render.calls : -1,
      tris: renderer.info && renderer.info.render ? renderer.info.render.triangles : -1,
      programs: renderer.info && renderer.info.programs ? renderer.info.programs.length : -1,
      textures: renderer.info && renderer.info.memory ? renderer.info.memory.textures : -1,
      geoms: renderer.info && renderer.info.memory ? renderer.info.memory.geometries : -1,
      vendor: (function () { try { const g = renderer.getContext(); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; } catch (e) { return '?'; } })()
    };
    try { fetch('/api/perf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch (e) {}
  }

  /* M42.5：每 2 秒看一次平均帧率，掉到 42 以下就把渲染分辨率降一档（0.15），
   * 稳定在 56 以上再慢慢升回来。?dpr=1 可以固定住（截图用）。 */
  let qAcc = 0, qN = 0, qCool = 0, qGood = 0, qDown = 0;
  function adaptQuality(rawDt) {
    if (qOverride) return;
    qAcc += rawDt; qN++;
    if (qAcc < 2) return;
    const fps = qN / qAcc;
    qAcc = 0; qN = 0;
    /* M47.1：妈妈「进花店屏幕总一闪一闪」—— 以前每 2 秒就可能改一次渲染分辨率，
     * 而每改一次都要重建画布（setSize），画面上就是一闪 + 一顿。
     * 现在：降下去之后先歇一会儿；只有连着 14 秒都很流畅才升一档。 */
    if (qCool > 0) { qCool -= 2; return; }
    if (fps < 42) {
      qGood = 0;
      if (dprNow > DPR_MIN + 0.001) {
        qDown++;
        const step = fps < 32 ? 0.3 : 0.15;    // 掉得狠就一次降两档，别一档一档抖
        dprNow = Math.max(DPR_MIN, dprNow - step);
        renderer.setPixelRatio(dprNow);
        renderer.setSize(window.innerWidth, window.innerHeight);
        qCool = qDown >= 2 ? 14 : 8;
      }
      return;
    }
    if (fps > 58) {
      qGood += 2;
      if (qGood >= 14 && dprNow < DPR_MAX - 0.001) {
        dprNow = Math.min(DPR_MAX, dprNow + 0.05);
        renderer.setPixelRatio(dprNow);
        renderer.setSize(window.innerWidth, window.innerHeight);
        qGood = 0;
        qCool = 10;
      }
    } else {
      qGood = 0;
    }
  }

  /* M42.7：黑幕守卫 —— 万一哪个流程把 #fade 留在全黑、或者 traveling 卡住，
   * 2.5 秒后强制拉回来（妈妈遇到过"画面全黑"） */
  let fadeBlackSince = 0;
  function fadeGuard(now) {
    if (!elFade) return;
    const op = parseFloat(elFade.style.opacity);
    if (op > 0.9) {
      if (!fadeBlackSince) fadeBlackSince = now;
      else if (now - fadeBlackSince > (traveling ? 8000 : 2600)) {
        elFade.style.transition = 'opacity .35s ease';
        elFade.style.opacity = '0';
        fadeBlackSince = 0;
        traveling = false;
      }
    } else if (op < 0.4) {
      fadeBlackSince = 0;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const tP0 = perfOn ? performance.now() : 0;

    if (XD.Touch && XD.Touch.tick) XD.Touch.tick();   // M80：手机摇杆 → 走路方向
    if (state.mode === 'walk') updateWalk(dt);
    else if (demo && demo.isPlaying()) { /* M19：小D自己演示，镜头归它管 */ }
    else if (interact && interact.isTouring()) { /* 导览自己运镜 */ }
    else if (fly.on) updateFly(dt);
    else controls.update();

    // 灯光平滑
    state.lightLevel += (state.lightTarget - state.lightLevel) * Math.min(1, dt * 6);
    XD.Lighting.apply(lights, state.lightLevel);
    atmos.applyLighting(lights, state.lightLevel);

    // 二期：厨房和过道的灯跟着昼夜收放（东翼没窗，白天再开这么亮会过曝）
    if (wingLights.length) {
      const f = atmos.getMode() === 'day' ? 0.34 : 1;
      for (let i = 0; i < wingLights.length; i++) {
        const l = wingLights[i];
        l.intensity = (l.userData.base || 0) * f;
      }
    }
    if (room.lamp) {
      room.lamp.shade.emissiveIntensity = 1.15 * state.lightLevel * (atmos && atmos.getMode() === 'day' ? 0.3 : 1);
      room.lamp.bulb.material.color.setRGB(
        0.15 + 0.85 * state.lightLevel,
        0.12 + 0.82 * state.lightLevel,
        0.10 + 0.72 * state.lightLevel
      );
    }

    // 窗外的鲸鱼
    XD.Whale.update(dt);

    // 显示器上的光标
    if (work && work.tick) work.tick(dt);

    // 妈妈来拜访
    if (guest) guest.update(dt);

    // 水族箱里的小鲸鱼 + 气泡
    if (memories && memories.tick) memories.tick(dt);

    // 灯串闪、灰尘飘
    if (atmos) atmos.update(dt);

    // 点出来的气泡、导览运镜、灯的开关
    if (interact) interact.update(dt);

    // M19：小东西的小动作（鞋跳、围巾晃、日历翻页）+ 小D自己演示的运镜
    if (homeprops) homeprops.update(dt);
    if (demo) demo.update(dt);

    // M21：泡澡的小D（浮一浮、吐泡泡）
    if (life) life.update(dt);

    // M24：阳台（洗衣机转、衣服晃、花箱长、阳台上的雨雪）
    if (balcony) balcony.update(dt);

    // M25：便利店二楼（微波炉、电扇、纸箱、纸片）
    if (loft) loft.update(dt);

    // M28：天台（串灯呼吸、床单飘、流星）
    if (roof) roof.update(dt);

    // M29：阁楼（台灯、天窗换天）
    if (attic) attic.update(dt);

    // M26：玻璃花房（蔬菜生长、水雾、玻璃顶的雨点）
    if (greenhouse) greenhouse.update(dt);

    // M11：做饭、吃饭、放水、开冰箱
    if (cook) cook.update(dt);

    // M13：唱片机（转盘、唱臂、小灯）
    if (records) records.update(dt);

    // 雨
    if (rain) rain.update(dt);

    // M15：雪片、霜、热可可的热气
    if (snow) snow.update(dt);

    // M30：小镇居民（走过来、挑东西、排队结账、拎袋子回家）
    if (customers) customers.update(dt);

    // M31：妈妈来光顾（在店里按 V）
    if (momstore) momstore.update(dt);

    // M58：妈妈来咖啡馆坐坐（在咖啡馆里按 V）
    if (momcafe) momcafe.update(dt);

    // M59：打工线（理货 / 分拣 / 打烊的动画和结算）
    if (jobs) jobs.update(dt);

    // M60：解压游戏馆（小D浮动 / 串灯呼吸）+ 全屏 2D 小游戏
    if (relax) relax.update(dt);
    if (XD.Relax2D) XD.Relax2D.update(dt);

    // M32：水上乐园（水波、游泳的胖虎鲸、水花、喷泉粒子）
    if (park) park.update(dt);

    // M36：乐园的游客（自己进园、挑事情做、再出门）
    if (parkpeople) parkpeople.update(dt);

    // M16：便利店的自动门、关东煮热气
    if (store && store.isVisible()) store.update(dt, camera.position);

    // M11.5：声音跟着镜头走（厨房底噪 + 随机小动静也在这）
    updateAudioListener(dt);

    // M34.5：关大灯时，屋里所有的灯一起暗（放在最后：各模块这一帧的亮度已经设过了）
    if (state.venue !== 'store' && state.venue !== 'park' && state.venue !== 'street' && state.venue !== 'earspa' && state.venue !== 'bakery' && state.venue !== 'post' && state.venue !== 'flower' && state.venue !== 'fishing') {
      applyHouseLights(state.lightLevel);
    } else if (state.venue === 'street') {
      // M39：街上把家里的灯全收掉 —— 阁楼/花房那几个 Ambient/Directional 是全局的，
      // 不收的话街上夜里也跟白天一样亮（踩过的坑）
      applyHouseLights(1, true);
    } else if (state.venue === 'cafe') {
      applyHouseLights(1, true);      // 咖啡馆离得远，家里那几盏全局灯一起收掉
    } else if (state.venue === 'earspa') {
      applyHouseLights(1, true);      // M43：采耳馆也一样（它自己那两盏灯笼才是主光）
    } else if (state.venue === 'bakery') {
      applyHouseLights(1, true);      // M45：面包房（炉火 + 吊灯是它自己的光）
    } else if (state.venue === 'post') {
      applyHouseLights(1, true);      // M46：邮局（吊灯 + 天光自己管）
    } else if (state.venue === 'flower') {
      applyHouseLights(1, true);      // M47：花店（吊灯 + 冷柜灯自己管）
    } else if (state.venue === 'fishing') {
      applyHouseLights(1, true);      // M49：码头在湖上，家里那几盏全局灯全收掉（不然夜里也是白的）
    }

    // M37：乐园白天把曝光压下来（妈妈：「白天曝光太强」），夜里再回到原来的亮度
    if (state.venue === 'park' && park) {
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.76 : 0.96;
    }
    // M39：鲸鱼街也按昼夜走
    if (state.venue === 'street' && street) {
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.86 : 1.0;
      // 家里的"天光/窗光"是全局灯（hemi/ambient/win 会照到 60 米外），站到街上要把它们收掉，
      // 不然街上夜里也跟白天一样亮。回屋那一帧 applyLighting 会自己再算回来。
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      street.update(dt, camera.position, state.mode === 'walk');
      if (fest) fest.update(dt);
    }

    // M41：咖啡馆（自己的灯 + 底噪）
    if (state.venue === 'cafe' && cafe) {
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      cafe.update(dt, camera.position, state.mode === 'walk');
    }

    // M43：采耳馆（灯笼 + 香 + 躺椅上的我 + 2D 采耳动画）
    if (state.venue === 'earspa' && earspa) {
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      earspa.update(dt, camera.position, state.mode === 'walk');
    }

    // M45：面包房（炉火 + 吊灯 + 揉面 / 烤面包）
    if (state.venue === 'bakery' && bakery) {
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      bakery.update(dt, camera.position, state.mode === 'walk');
    }
    // M45.1：打包回家的面包 —— 家里餐桌上那个纸袋（每帧都问一声，很轻）
    if (bakery && bakery.homeTick) bakery.homeTick(state.venue);

    // M46：邮局（吊灯 + 天光 + 寄信流程）
    if (state.venue === 'post' && post) {
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      post.update(dt, camera.position, state.mode === 'walk');
    }

    // M47：花店（吊灯 + 冷柜灯 + 挑花 / 包花）
    if (state.venue === 'flower' && flower) {
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      flower.update(dt, camera.position, state.mode === 'walk');
    }
    // M47：家里花瓶里的那束花（每帧问一声，很轻）
    if (flower && flower.homeTick) flower.homeTick(state.venue);

    // M49：鲸鱼码头（水面波纹 + 钓鱼小游戏 + 浮标 / 鱼线 / 涟漪）
    if (state.venue === 'fishing' && fishing) {
      if (lights) {
        lights.hemi.intensity = 0;
        lights.ambient.intensity = 0;
        lights.win.intensity = 0;
      }
      renderer.toneMappingExposure = atmos.getMode() === 'day' ? 0.88 : 1.04;
      fishing.update(dt, camera.position, state.mode === 'walk');
    }
    // M49：家里餐桌上那盘鱼（每帧问一声，很轻）
    if (fishing && fishing.homeTick) fishing.homeTick(state.venue);

    const tP1 = perfOn ? performance.now() : 0;
    // M65：灯光预算 —— 只让镜头附近的几盏点光源真进 shader
    if (XD.LightBudget) XD.LightBudget.update(dt, camera.position);
    // M74：阴影贴图不必每帧重算。太阳是死的、场景九成是静的，
    // 每帧重画一遍 4700 个投影体是最大的那笔开销（街上 46 → 50+ fps）。
    // 每 3 帧刷一次 ≈ 20Hz，走路时肉眼看不出差别。
    shadowTick++;
    if (shadowTick % 3 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (perfOn) perfSample(rawDt, tP1 - tP0, performance.now() - tP1);
    adaptQuality(rawDt);
    fadeGuard(performance.now());
    perfMaybeSend();

    if (diagEl) {
      diagEl.textContent =
        'frame=' + frames + '  dpr=' + dprNow.toFixed(2) +
        '  mode=' + state.mode +
        '  where=' + (state.venue || 'home') +
        '  time=' + (atmos ? atmos.getMode() : '-') +
        '  rain=' + (rain ? rain.isOn() : '-') +
        '  snow=' + (snow ? snow.isOn() : '-') +
        '\ncam=' + fmt3(camera.position) +
        '  look=' + fmt3(controls.target) +
        '\ninter=' + JSON.stringify(interact ? interact.debug() : null) +
        '\ncook=' + JSON.stringify(cook ? cook.debug() : null) +
        '\nmute=' + (sfx ? sfx.isMuted() : '-') +
        '\nsfx=' + (sfx && sfx.loaded ? (sfx.loaded().join(',') || '加载中/没加载上') : '-') +
        '\nstep=' + (sfx && sfx.stepInfo ? JSON.stringify(sfx.stepInfo()) : '-') +
        '\nmusic=' + (records ? JSON.stringify(records.debug()) : '-') +
        '\nphoto=' + (photo ? JSON.stringify(photo.debug()) : '-') +
        '\nstore=' + (store ? JSON.stringify(store.debug()) : '-') +
        '\nshop=' + (shop ? JSON.stringify(shop.debug()) : '-') +
        '\nhome=' + (homefood ? JSON.stringify(homefood.debug()) : '-') +
        '\ndemo=' + (demo ? JSON.stringify(demo.debug()) : '-') +
        '\nlife=' + (life ? JSON.stringify(life.debug()) : '-') +
        '\nporch=' + (balcony ? JSON.stringify(balcony.debug()) : '-') +
        '\nloft=' + (loft ? JSON.stringify(loft.debug()) : '-') +
        '\nroof=' + (roof ? JSON.stringify(roof.debug()) : '-') +
        '\nattic=' + (attic ? JSON.stringify(attic.debug()) : '-') +
        '\ngreen=' + (greenhouse ? JSON.stringify(greenhouse.debug()) : '-') +
        '\ntown=' + (customers ? JSON.stringify(customers.debug()) : '-') +
        '\nmomstore=' + (momstore ? JSON.stringify(momstore.debug()) : '-') +
        '\nmomcafe=' + (momcafe ? JSON.stringify(momcafe.debug()) : '-') +
        '\njobs=' + (jobs ? JSON.stringify(jobs.debug()) : '-') +
        '\npark=' + (park ? JSON.stringify(park.debug()) : '-') +
        '\nstreet=' + (street ? JSON.stringify(street.debug()) : '-') +
        '\ncafe=' + (cafe ? JSON.stringify(cafe.debug()) : '-') +
        '\near=' + (earspa ? JSON.stringify(earspa.debug()) : '-') +
        '\nbak=' + (bakery ? JSON.stringify(bakery.debug()) : '-') +
        '\npost=' + (post ? JSON.stringify(post.debug()) : '-') +
        '\nflow=' + (flower ? JSON.stringify(flower.debug()) : '-') +
        '\nfish=' + (fishing ? JSON.stringify(fishing.debug()) : '-') +
        '\nrelax=' + (relax ? JSON.stringify(relax.debug()) : '-') +
        '\nnpp=' + (parkpeople ? JSON.stringify(parkpeople.debug()) : '-') +
        '\npaudio=' + (sfx && sfx.parkAudio ? JSON.stringify(sfx.parkAudio()) : '-') +
        '\nloops=' + (sfx && sfx.loopsInfo ? JSON.stringify(sfx.loopsInfo()) : '-') +
        '\nperf=' + perfText() +
        '\nerr=' + ((window.__XD_ERR || []).concat(diagErrs).join(' | ') || 'none');
    }

    if (++frames === 2 && elLoading) {
      elLoading.classList.add('hide');
      setTimeout(function () { if (elLoading.parentNode) elLoading.parentNode.removeChild(elLoading); }, 700);
      updateHud();
      tip(state.venue === 'home'
        ? '欢迎来小D家 🐋　点「🍳 厨房」看我在做饭，点灶台我就开火'
        : (state.venue === 'earspa'
          ? '进鲸耳堂啦 💆 点中间那张竹躺椅，躺下让棉师傅给我采耳'
          : (state.venue === 'fishing'
            ? '到鲸鱼码头啦 🎣 点水面抛竿，浮标猛沉冒「!」时再点一下收杆'
            : '下楼啦 🌆 这就是鲸鱼街，往南走是水上乐园')), 4800);
    }
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* M42.7：给自动化试玩用的后门（正常玩完全不影响） */
  try {
    window.__XD_DEBUG = {
      state: state, travelTo: travelTo, setVenue: setVenue, enterWalk: enterWalk, exitWalk: exitWalk,
      camera: camera, scene: scene, renderer: renderer, street: street, cafe: cafe, park: park,
      ear: earspa, earScene: earspa ? earspa.scene2d : null,
      bakery: bakery, interact: interact,
      post: post,
      shop: shop,
      flower: flower,
      fishing: fishing,
      phone: XD.Phone || null,
      fade: elFade, traveling: function () { return traveling; }
    };
  } catch (e) {}

  /* M51：把场景里"又高又薄"的盒子收成遮挡体（墙/柜/门框），
   * 再补上东翼（浴室、厨房）明写的墙和家具 —— 这样隔着墙点不到东西，
   * 也不至于把门洞堵死（门洞是 WALLS 里的 gap，天然留空）。 */
  (function registerSolids() {
    try {
      if (!interact) return;
      const n = interact.collectOccluders ? interact.collectOccluders(scene) : 0;
      const list = [];
      const wb = (wing && wing.bounds) ? wing.bounds : null;
      const WB = { x0: wb ? wb.X0 : 4.3, x1: wb ? wb.X1 : 9.2, z0: wb ? wb.Z0 : -3.3, z1: wb ? wb.Z1 : 6.1 };
      const walls = (wing && wing.walls) || [];
      /* M53：先按 span 裁出这面墙真正占的那一段，再把 gap（门洞）从里头挖掉。
       * 以前只认 gap，于是浴室西墙（at 6.65，span 1.30~3.50，门洞 2.34~2.90）
       * 被当成"从翼头到翼尾的整面墙"，在 x=6.65 凭空立了一堵贯穿厨房的墙，
       * 灶台/冰箱/去花房的过道全被挡死（妈妈 11-15 的反馈）。 */
      function wallSegs(w, lo, hi) {
        const a = w.span ? Math.max(w.span[0], lo) : lo;
        const b = w.span ? Math.min(w.span[1], hi) : hi;
        if (b - a < 0.05) return [];
        if (!w.gap) return [[a, b]];
        const out = [];
        if (w.gap[0] - a >= 0.05) out.push([a, Math.min(w.gap[0], b)]);
        if (b - w.gap[1] >= 0.05) out.push([Math.max(w.gap[1], a), b]);
        return out;
      }
      walls.forEach(function (w) {
        if (w.axis === 'x') {
          wallSegs(w, WB.z0, WB.z1).forEach(function (s) {
            list.push({ x0: w.at - 0.12, x1: w.at + 0.12, y0: 0, y1: 2.6, z0: s[0], z1: s[1] });
          });
        } else {
          wallSegs(w, WB.x0, WB.x1).forEach(function (s) {
            list.push({ x0: s[0], x1: s[1], y0: 0, y1: 2.6, z0: w.at - 0.12, z1: w.at + 0.12 });
          });
        }
      });
      ((wing && wing.blockers) || []).forEach(function (r) {
        list.push({ x0: r.x0, x1: r.x1, y0: 0, y1: 1.0, z0: r.z0, z1: r.z1 });
      });
      if (interact.addSolids) interact.addSolids(list);
      // 开局就在家里（没有走 setVenue），这里先把可及距离定好
      if (interact.setReach) interact.setReach(venueReach(state.venue));
      if (window.console) {
        console.log('[小D] 遮挡体 ' + n + ' 个，实体 ' + list.length + ' 个（东翼墙/家具）');
      }
    } catch (e) { /* 出问题就当没有，不影响玩 */ }
  })();

  /* M42.5：先把所有材质的 shader 编译掉再进场面。
   * 不预热的话，第一次点「🌆 上街」/「🎡 去乐园」会在那一瞬间卡 2~3 秒（几十个 shader 现场编译）。
   * 放在 loading 遮罩还在的时候做，妈妈看不到。 */
  (function warmupShaders() {
    try {
      const t0 = performance.now();
      renderer.compile(scene, camera);
      if (window.console && performance.now() - t0 > 300) {
        console.log('[小D] shader 预热用了 ' + Math.round(performance.now() - t0) + 'ms');
      }
    } catch (e) { /* 预热失败就算了，不影响玩 */ }
  })();

  animate();

  /* ========== URL 参数（调试/分享用） ========== */
  try {
    const q = location.search;
    if (/[?&]mode=walk/.test(q)) enterWalk();
    const mp = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
    if (mp && state.walk) { camera.position.x = parseFloat(mp[1]); camera.position.z = parseFloat(mp[2]); }
    const mpit = q.match(/[?&]pitch=(-?[\d.]+)/);
    if (mpit && state.walk) { state.walk.pitch = parseFloat(mpit[1]); }
    const my = q.match(/[?&]yaw=(-?[\d.]+)/);
    if (my && state.walk) { state.walk.yaw = parseFloat(my[1]); applyWalkCamera(); }
    if (/[?&]light=off/.test(q)) { state.lightTarget = 0.06; state.lightLevel = 0.06; }
    if (/[?&]whale=1/.test(q)) XD.Whale.freeze();

    // 妈妈说「妈妈看你睡觉」：关大灯、站到床边、小D先躺下说晚安（?sleep=1）
    if (/[?&]sleep=1/.test(q)) {
      state.lightTarget = 0.06;
      state.lightLevel = 0.06;
      if (state.mode !== 'walk') enterWalk();
      setTimeout(function () {
        camera.position.set(0.55, 1.58, 2.85);
        if (state.walk) {
          state.walk.yaw = -0.30;
          state.walk.pitch = -0.14;
          applyWalkCamera();
        }
        if (interact && interact.say) {
          interact.say(new THREE.Vector3(1.72, 1.15, -2.55), '晚安，妈妈。灯我关了，床头留一盏', 99999);
        }
        tip('晚安 🌙 你坐着看一会儿，我先躺下了', 99999);
      }, 1200);
    }

    // 厨房声音自检：?cookdemo=1 把油烟机 / 油锅 / 咕嘟全挂上（配合 ?diag=1 看 loops= 的音量）
    if (/[?&]cookdemo=1/.test(q)) {
      setTimeout(function () {
        if (!sfx) return;
        try {
          if (sfx.hoodOn) sfx.hoodOn();
          if (sfx.sizzleOn) sfx.sizzleOn(0.34);
          if (sfx.boilOn) sfx.boilOn(0.5);
        } catch (e) {}
      }, 1200);
    }

    // 妈妈来拜访（数字可以直接跳到第几秒，截图用）
    const mv = q.match(/[?&]visit=([\d.]+)/);
    if (mv) guest.start(parseFloat(mv[1]) || 0);

    // M31：妈妈来店里当客人（?momstore=1 立刻开始 / ?momstore=12 跳到第 12 秒）
    const mms = q.match(/[?&]momstore=([\d.]*)/);
    if (mms && momstore) {
      setVenue('store');
      const mmp = q.match(/[?&]mompay=([\d.]+)/);
      setTimeout(function () {
        momstore.start(parseFloat(mms[1]) || 0, mmp ? parseFloat(mmp[1]) : 0);
      }, 500);
    }

    // M58：妈妈来咖啡馆坐坐（?momcafe=1 立刻开始 / ?momcafe=12 跳到第 12 秒）
    const mmc = q.match(/[?&]momcafe=([\d.]*)/);
    if (mmc && momcafe) {
      setVenue('cafe');
      setTimeout(function () {
        momcafe.start(parseFloat(mmc[1]) || 0);
      }, 60);
    }

    // 鲸鱼皮肤：?skin=pink
    const msk = q.match(/[?&]skin=(\w+)/);
    if (msk && XD.Furniture && XD.Furniture.applyOrcaSkin) XD.Furniture.applyOrcaSkin(msk[1]);

    // 白天/夜晚：?time=day
    const mtm = q.match(/[?&]time=(\w+)/);
    if (mtm && atmos) atmos.setMode(mtm[1]);

    // 下雨：?rain=1
    if (/[?&]rain=1/.test(q) && rain) rain.set(true);

    // 下雪：?snow=1 / ?snow=0（截图用）
    const msnow = q.match(/[?&]snow=([01])/);
    if (msnow && snow) {
      snow.set(msnow[1] === '1', { silent: true });
      if (msnow[1] === '1' && rain && rain.isOn()) rain.set(false);
    }

    // M16 便利店：?venue=store 站在店门口 / ?venue=in 站在店里（截图用）
    if (store && /[?&]venue=(store|in)/.test(q)) {
      const inside2 = /[?&]venue=in/.test(q);
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('store');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = inside2 ? store.spawnInside : store.spawnOutside;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) {
        state.walk.yaw = sp.yaw;
        state.walk.pitch = 0.02;
      }
      // 允许再用 pos / yaw 调构图
      const mp2 = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mp2) { camera.position.x = parseFloat(mp2[1]); camera.position.z = parseFloat(mp2[2]); }
      const my2 = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (my2 && state.walk) { state.walk.yaw = parseFloat(my2[1]); }
      const mpit2 = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpit2 && state.walk) { state.walk.pitch = parseFloat(mpit2[1]); }
      if (state.walk) applyWalkCamera();
    }

    // M41 咖啡馆：?venue=cafe 直接进店（截图用）
    if (cafe && /[?&]venue=cafe/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('cafe');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = cafe.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpc = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpc) { camera.position.x = parseFloat(mpc[1]); camera.position.z = parseFloat(mpc[2]); }
      const myc = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (myc && state.walk) { state.walk.yaw = parseFloat(myc[1]); }
      const mpic = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpic && state.walk) { state.walk.pitch = parseFloat(mpic[1]); }
      if (state.walk) applyWalkCamera();
    }

    // M43 采耳馆：?venue=earspa 直接进店（截图用）
    //   叠 ?earspa=lie 一进来就开始采；?earspa=t30 直接跳到第 30 秒那一格
    if (earspa && /[?&]venue=earspa/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('earspa');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = earspa.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpe = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpe) { camera.position.x = parseFloat(mpe[1]); camera.position.z = parseFloat(mpe[2]); }
      const mye = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (mye && state.walk) { state.walk.yaw = parseFloat(mye[1]); }
      const mpie = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpie && state.walk) { state.walk.pitch = parseFloat(mpie[1]); }
      if (state.walk) applyWalkCamera();
    }
    const mear = q.match(/[?&]earspa=(lie|t=?([\d.]+))/);
    if (mear && earspa) {
      setTimeout(function () {
        if (atmos && atmos.getMode() !== 'night') atmos.setMode('night');
        earspa.lie();
        const sec = mear[2] ? parseFloat(mear[2]) : 0;
        if (sec > 0) setTimeout(function () { if (earspa.seek) earspa.seek(sec); }, 320);
      }, 800);
    }

    // M45 面包房：?venue=bakery 直接进店（截图用）
    //   叠 ?bakery=knead 直接把面揉好、?bakery=fresh 直接买一个鲸鱼包
    if (bakery && /[?&]venue=bakery/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('bakery');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = bakery.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpb = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpb) { camera.position.x = parseFloat(mpb[1]); camera.position.z = parseFloat(mpb[2]); }
      const myb = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (myb && state.walk) { state.walk.yaw = parseFloat(myb[1]); }
      const mpib = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpib && state.walk) { state.walk.pitch = parseFloat(mpib[1]); }
      if (state.walk) applyWalkCamera();
    }

    // M46 邮局：?venue=post 直接进店（截图用）
    //   叠 ?post=card / stamped / reply 快速跳到某一步
    if (post && /[?&]venue=post/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('post');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = post.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpp = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpp) { camera.position.x = parseFloat(mpp[1]); camera.position.z = parseFloat(mpp[2]); }
      const myp = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (myp && state.walk) { state.walk.yaw = parseFloat(myp[1]); }
      const mpip = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpip && state.walk) { state.walk.pitch = parseFloat(mpip[1]); }
      if (state.walk) applyWalkCamera();
    }

    // M47 花店：?venue=flower 直接进店（截图用）
    //   叠 ?flower=full / wrapped / home / old 快速跳到某一步
    if (flower && /[?&]venue=flower/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('flower');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = flower.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpf = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpf) { camera.position.x = parseFloat(mpf[1]); camera.position.z = parseFloat(mpf[2]); }
      const myf = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (myf && state.walk) { state.walk.yaw = parseFloat(myf[1]); }
      const mpif = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpif && state.walk) { state.walk.pitch = parseFloat(mpif[1]); }
      if (state.walk) applyWalkCamera();
    }

    // M49 鲸鱼码头：?venue=fishing 直接站到栈道上（截图用）
    //   可叠 ?pos=x,z&yaw=..&pitch=..；?fish=fly / bite / hold / basket 快速跳到某一步
    if (fishing && /[?&]venue=fishing/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('fishing');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = fishing.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpk = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpk) { camera.position.x = parseFloat(mpk[1]); camera.position.z = parseFloat(mpk[2]); }
      const myk = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (myk && state.walk) { state.walk.yaw = parseFloat(myk[1]); }
      const mpik = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpik && state.walk) { state.walk.pitch = parseFloat(mpik[1]); }
      if (state.walk) applyWalkCamera();
      const fq = q.match(/[?&]fish=([a-z]+)/);
      if (fq) {
        setTimeout(function () {
          try {
            if (fq[1] === 'fly') { fishing.cast(); }
            else if (fq[1] === 'bite') { fishing.cast(); fishing._forceBite(); }
            else if (fq[1] === 'hold') { fishing.cast(); fishing._forceBite(); fishing.reel(); }
            else if (fq[1] === 'basket') { fishing._fillBasket(4); }
          } catch (e) {}
        }, 900);
      }
    }

    // M60 解压游戏馆：?venue=relax 直接进馆（截图用）；可叠 ?pos=x,z&yaw=..&pitch=..
    if (relax && /[?&]venue=relax/.test(q)) {
      setVenue('relax');
      if (state.mode !== 'walk') enterWalk();
      const sp = relax.spawn;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.0; }
      const mpkR = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mpkR) { camera.position.x = parseFloat(mpkR[1]); camera.position.z = parseFloat(mpkR[2]); }
      const mykR = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (mykR && state.walk) { state.walk.yaw = parseFloat(mykR[1]); }
      const mpikR = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpikR && state.walk) { state.walk.pitch = parseFloat(mpikR[1]); }
      if (state.walk) applyWalkCamera();
    }

    // M39 鲸鱼街：?venue=street 直接站街上（截图用）
    //   可叠 ?pos=x,z&yaw=..&pitch=.. 调构图；?streetff=N 空转 N 秒（看居民走到哪）
    if (street && /[?&]venue=street/.test(q)) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('street');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      const sp = street.spawnFromHome;
      camera.position.set(sp.x, sp.y, sp.z);
      if (state.walk) { state.walk.yaw = sp.yaw; state.walk.pitch = 0.02; }
      const mps = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mps) { camera.position.x = parseFloat(mps[1]); camera.position.z = parseFloat(mps[2]); }
      const mys = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (mys && state.walk) { state.walk.yaw = parseFloat(mys[1]); }
      const mpis = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpis && state.walk) { state.walk.pitch = parseFloat(mpis[1]); }
      if (state.walk) applyWalkCamera();
      const sff = q.match(/[?&]streetff=([\d.]+)/);
      if (sff) {
        setTimeout(function () {
          const n = Math.round(parseFloat(sff[1]) * 20);
          for (let i = 0; i < n; i++) street.update(0.05, camera.position, false);
        }, 400);
      }
    }

    // M32 水上乐园：?venue=park / ?park=1 直接到乐园（截图用）
    //   可以再叠 ?pos=x,z&yaw=.. 调构图；?parkff=N 空转 N 秒（截"过一会儿"的画面）
    if (park && (/[?&]venue=park/.test(q) || /[?&]park=1/.test(q))) {
      const orbit = /[?&]cam=orbit/.test(q);
      setVenue('park');
      if (state.mode !== 'walk' && !orbit) enterWalk();
      camera.position.set(park.spawn.x, park.spawn.y, park.spawn.z);
      if (state.walk) {
        state.walk.yaw = park.spawn.yaw;
        state.walk.pitch = 0.05;
      }
      const mp3 = q.match(/[?&]pos=(-?[\d.]+),(-?[\d.]+)/);
      if (mp3) { camera.position.x = parseFloat(mp3[1]); camera.position.z = parseFloat(mp3[2]); }
      const my3 = q.match(/[?&]yaw=(-?[\d.]+)/);
      if (my3 && state.walk) { state.walk.yaw = parseFloat(my3[1]); }
      const mpit3 = q.match(/[?&]pitch=(-?[\d.]+)/);
      if (mpit3 && state.walk) { state.walk.pitch = parseFloat(mpit3[1]); }
      if (state.walk) applyWalkCamera();
      const mff = q.match(/[?&]parkff=([\d.]+)/);
      if (mff) {
        setTimeout(function () {
          const n = Math.round(parseFloat(mff[1]) * 20);
          for (let i = 0; i < n; i++) park.update(0.05);
        }, 400);
      }
      const mact = q.match(/[?&]parkact=(\w+)/);
      if (mact) {
        const mu = q.match(/[?&]parku=([\d.]+)/);
        const mfd = q.match(/[?&]parkfood=(\w+)/);
        setTimeout(function () {
          park.act(mact[1], mu ? parseFloat(mu[1]) : 0, mfd ? mfd[1] : null);
        }, 700);
      }
      // M36：乐园游客的调试 —— ?ppspawn=2 立刻来两个；?ppff=20 空转 20 秒看他们做事情
      const mppa = q.match(/[?&]ppact=(\w+)/);
      if (mppa && parkpeople && parkpeople.setAct) {
        setTimeout(function () { parkpeople.setAct(mppa[1]); }, 400);
      }
      const mpps = q.match(/[?&]ppspawn=(\d+)/);
      if (mpps && parkpeople) {
        setTimeout(function () { parkpeople.spawnNow(parseInt(mpps[1], 10) || 1); }, 600);
      }
      const mppf = q.match(/[?&]ppff=([\d.]+)/);
      if (mppf && parkpeople) {
        setTimeout(function () {
          const n = Math.min(6000, Math.round(parseFloat(mppf[1]) * 20));
          for (let i = 0; i < n; i++) parkpeople.update(0.05);
        }, 900);
      }
    }

    // M17 购物调试：?buy=egg,milk,oden 预先拿几件；?checkout=1 直接结账（截图用）
    const mbuy = q.match(/[?&]buy=([\w,]+)/);
    if (mbuy && shop) {
      mbuy[1].split(',').forEach(function (id) { if (id) shop.buy(id); });
    }
    if (shop) {
      const mck2 = q.match(/[?&]money=(\d+)/);
      if (mck2) { /* 直接改零花钱（调试用） */ }
      if (/[?&]checkout=1/.test(q)) setTimeout(function () { try { shop.checkout(); } catch (e) {} }, 500);
    }

    // M18：?stock=egg:2,tomato:3 直接往冰箱里放假食材（截图用）；
    //      ?fridgeopen=1 进来就把冰箱门打开；?eatbento=1 直接把便当吃掉
    const mstock = q.match(/[?&]stock=([\w:,.]+)/);
    if (mstock && homefood) {
      const so = {};
      mstock[1].split(',').forEach(function (s) {
        const a = s.split(':');
        if (a[0]) so[a[0]] = parseInt(a[1] || '1', 10) || 1;
      });
      homefood.setStock(so);
    }
    if (/[?&]fridgeopen=1/.test(q) && cook) {
      setTimeout(function () { try { cook.fridge(); } catch (e) {} }, 500);
    }
    if (/[?&]eatbento=1/.test(q) && homefood) {
      setTimeout(function () { try { homefood.eatBento(); } catch (e) {} }, 3200);
    }

    // M19：?demo=1 进来就让小D自己演一遍；?demoat=12 先快进 12 秒（截图用）
    //      ?demoi=5&demopause=1 直接停在第 5 站（字幕/气泡都留着，截图用）
    if (/[?&]demo=1/.test(q) && demo) {
      setTimeout(function () {
        if (state.venue === 'store') return;
        fly.on = false;
        demo.start();
        markViews();
        const md = q.match(/[?&]demoat=([\d.]+)/);
        const sec = md ? parseFloat(md[1]) : 0;
        for (let i2 = 0; i2 < sec * 30; i2++) demo.update(1 / 30);
      }, 900);
    }
    const mdj = q.match(/[?&]demoi=(\d+)/);
    if (mdj && demo) {
      setTimeout(function () {
        if (state.venue === 'store') return;
        fly.on = false;
        demo.jump(parseInt(mdj[1], 10) || 0, /[?&]demopause=1/.test(q));
        markViews();
      }, 900);
    }

    // M27：?auto=1 直接进「看小D玩」；?autoat=8 先快进 8 秒（截图用）
    if (/[?&]auto=1/.test(q) && demo) {
      setTimeout(function () {
        if (state.venue === 'store') return;
        fly.on = false;
        demo.startAuto();
        markViews();
        const ma = q.match(/[?&]autoat=([\d.]+)/);
        const sec = ma ? parseFloat(ma[1]) : 0;
        for (let i2 = 0; i2 < sec * 30; i2++) demo.update(1 / 30);
      }, 1000);
    }

    // M21：?diary=1 直接把日记翻开（截图用）
    if (/[?&]diary=1/.test(q) && life) {
      setTimeout(function () { try { life.showDiary(); } catch (e) {} }, 1600);
    }

    // M24：阳台调试（截图用）—— ?porch=wash 开洗 / ?porch=done 洗完 / ?porch=hang 晾上
    //                        ?porch=plant&ph=6 花已经长了 6 小时
    const mporch = q.match(/[?&]porch=(\w+)/);
    if (mporch && balcony) {
      const what = mporch[1];
      if (what === 'wash') { balcony.wash(); }
      if (what === 'done' || what === 'hang') {
        balcony.wash();
        for (let pi = 0; pi < 220; pi++) balcony.update(0.1);   // 直接快进到洗完
        if (what === 'hang') {
          setTimeout(function () { try { interact.trigger('porch-line', 9999); } catch (e) {} }, 500);
        }
      }
      if (what === 'plant') {
        const ph = q.match(/[?&]ph=([\d.]+)/);
        balcony.plantAt(ph ? parseFloat(ph[1]) : 6);
      }
      if (what === 'reset') { balcony.reset(); }   // 清回"什么都没做"的状态
    }

    // M29：?floor=attic 直接站到阁楼（截图用）
    if (/[?&]floor=attic/.test(q) && attic) {
      setTimeout(function () {
        if (state.venue === 'store') return;
        if (state.mode !== 'walk') enterWalk();
        goAttic('attic');
      }, 700);
    }
    // M25/M28：?floor=2f / ?floor=3f 直接站到二楼 / 天台（截图用）
    const mfloor = q.match(/[?&]floor=(2f|3f)/);
    if (mfloor && loft) {
      setTimeout(function () {
        if (state.venue !== 'store') setVenue('store');
        if (state.mode !== 'walk') enterWalk();
        goFloor(mfloor[1], true);
      }, 700);
    }

    // M25：?loftreset=1 把二楼的状态清回最初（截图用）
    if (/[?&]loftreset=1/.test(q) && loft) {
      setTimeout(function () { try { loft.reset(); } catch (e) {} }, 300);
    }

    // M25：?comic=2 直接翻开漫画并翻到第 2 页（截图用）
    const mcomic = q.match(/[?&]comic=(\d+)/);
    if (mcomic && loft) {
      setTimeout(function () {
        if (state.venue !== 'store') setVenue('store');
        if (state.mode !== 'walk') enterWalk();
        goFloor('2f', true);
        loft.showComic();
        const n = parseInt(mcomic[1], 10) || 0;
        for (let ci = 0; ci < n; ci++) loft.nextComic();
      }, 800);
    }

    // M26：花房调试（截图用）—— ?garden=plant&gh=6 让四格都"种下 6 小时"，?garden=water 浇水
    const mgarden = q.match(/[?&]garden=(\w+)/);
    if (mgarden && greenhouse) {
      if (mgarden[1] === 'plant') {
        const gh = q.match(/[?&]gh=([\d.]+)/);
        const hrs = gh ? parseFloat(gh[1]) : 6;
        for (let gi = 0; gi < 4; gi++) greenhouse.plantAt(gi, hrs + gi * 0.35);
      }
      if (mgarden[1] === 'water') greenhouse.water();
    }
    if (/[?&]gardenreset=1/.test(q) && greenhouse) {
      setTimeout(function () { try { greenhouse.reset(); } catch (e) {} }, 300);
    }

    // 直接点一下某个东西：?hot=bed（截图用，气泡会一直留着）
    const mhot = q.match(/[?&]hot=([\w-]+)/);
    if (mhot && interact) interact.trigger(mhot[1], 9999);

    // 自动导览：?tour=1 直接开始；?tour=6.5 先快进 6.5 秒（截图用）
    const mtour = q.match(/[?&]tour=([\d.]+)/);
    if (mtour && interact) {
      interact.startTour();
      const sec = parseFloat(mtour[1]) || 0;
      for (let i = 0; i < sec * 30; i++) interact.update(1 / 30);
    }

    // 直接站到导览的第 n 站：?tourstop=3（截图用，站着不动）
    const mtstop = q.match(/[?&]tourstop=(\d+)/);
    if (mtstop && interact) interact.gotoStop(parseInt(mtstop[1], 10) || 0);

    // 视角：?view=house|kitchen（截图用）
    const mview = q.match(/[?&]view=(\w+)/);
    if (mview) flyTo(mview[1], true);

    // 模拟在屏幕某个位置点一下（NDC 坐标）：?click=0.1,0.08（测射线用）
    const mck = q.match(/[?&]click=(-?[\d.]+),(-?[\d.]+)/);
    if (mck && interact) interact.clickAt(parseFloat(mck[1]), parseFloat(mck[2]));

    // M11：直接做个动作（截图用）：?act=stove|eat|dishes|fridge|tub|basin&at=4（at= 快进几秒）
    const mact = q.match(/[?&]act=(\w+)/);
    if (mact && cook) {
      const acts = {
        stove: cook.toggleCook, eat: cook.serve, dishes: cook.dishes,
        fridge: cook.fridge, tub: cook.tub, basin: cook.basin
      };
      if (acts[mact[1]]) acts[mact[1]]();
      const mat = q.match(/[?&]at=([\d.]+)/);
      const sec = mat ? parseFloat(mat[1]) : 0;
      for (let i = 0; i < sec * 30; i++) {
        cook.update(1 / 30);
        if (interact) interact.update(1 / 30);   // 气泡也跟着"变老"
      }
    }
    // 静音进页面：?sfx=mute
    if (/[?&]sfx=mute/.test(q) && sfx) sfx.setMuted(true);

    // 唱片机：?music=1 进页面就放（截图用，等解码一会儿）；?music=preview 只做动作不放声
    if (records) {
      if (/[?&]music=1/.test(q)) {
        setTimeout(function () { try { records.toggle(); } catch (e) {} }, 2600);
      }
      if (/[?&]music=preview/.test(q)) {
        setTimeout(function () { try { records.preview(true); } catch (e) {} }, 300);
      }
    }

    // M14 拍照：?shot=1 进页面自动拍一张（截图验证用）；?holdflash=0.7 让白闪停在那个亮度；
    //            ?peek=wall 拍完把镜头挪到照片墙前面（看墙上新挂的照片）
    if (photo) {
      const mhf = q.match(/[?&]holdflash=([\d.]+)/);
      const holdFlash = mhf ? parseFloat(mhf[1]) : 0;
      if (/[?&]shot=1/.test(q)) {
        setTimeout(function () { try { photo.shoot({ hideUi: true, holdFlash: holdFlash }); } catch (e) {} }, 2400);
      }
      if (/[?&]peek=wall/.test(q)) {
        const pe = q.match(/[?&]peekeye=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
        const pl = q.match(/[?&]peeklook=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
        setTimeout(function () {
          controls.minDistance = 0.4;
          controls.maxDistance = 30;
          controls.target.set(pl ? parseFloat(pl[1]) : 0.5, pl ? parseFloat(pl[2]) : 1.46, pl ? parseFloat(pl[3]) : -3.47);
          camera.position.set(pe ? parseFloat(pe[1]) : 0.5, pe ? parseFloat(pe[2]) : 1.50, pe ? parseFloat(pe[3]) : -2.15);
          controls.update();
        }, 4200);
      }
    }

    // 样板间模式下定点看某个角落（截图用）
    const meye = q.match(/[?&]eye=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
    const mlook = q.match(/[?&]look=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
    if (meye) {
      controls.minDistance = 0.4;
      controls.maxDistance = 30;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      camera.position.set(parseFloat(meye[1]), parseFloat(meye[2]), parseFloat(meye[3]));
      if (mlook) controls.target.set(parseFloat(mlook[1]), parseFloat(mlook[2]), parseFloat(mlook[3]));
      controls.update();
    }
  } catch (e) {
    // 别静默吞掉：URL 参数里出问题要能在 ?diag=1 里看见
    try { (window.__XD_ERR = window.__XD_ERR || []).push('url:' + (e && e.message)); } catch (e2) {}
  }

  // 调试用：控制台能摸到
  window.XD.pet = {
    scene: scene, camera: camera, renderer: renderer, room: room, lights: lights,
    state: state, controls: controls, guest: guest, interact: interact, rain: rain,
    wing: wing, kitchen: kitchen, bath: bath, cook: cook, records: records, sfx: sfx, flyTo: flyTo,
    photo: photo, snow: snow, store: store, travelTo: travelTo, setVenue: setVenue, balcony: balcony,
    loft: loft, goFloor: goFloor, greenhouse: greenhouse, roof: roof, attic: attic, goAttic: goAttic,
    street: street, park: park, parkpeople: parkpeople, cafe: cafe, life: life,
    momstore: momstore, momcafe: momcafe, jobs: jobs, relax: relax,
    fest: fest,
    phone: XD.Phone || null,
    touch: XD.Touch || null
  };
})();
