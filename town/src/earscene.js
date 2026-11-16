/* 小D的赛博小家 · M43 采耳馆的「享受采耳」HTML 动画
 *
 * 妈妈 2026-11-14 18:01：
 *   「再开个采耳店，晚上去那里有看你享受采耳服务的 HTML 动画，
 *     声音你找公开的免费音频」
 *
 * 这段就是那个动画：一张 16:9 的 canvas 手绘 + 一层 DOM 界面，
 * 演棉师傅（一只白猫）给我采耳 + 洗耳 + 洗头 + 耳烛 + 热毛巾的全过程，十一个小节、共约 69 秒：
 *   ①净手点香 ②揉耳廓 ③耳勺清外侧 ④深处掏耳 ⑤洗耳（温水）⑥鹅毛棒 ⑦音叉
 *   ⑧耳烛 ⑨洗头 ⑩热毛巾敷眼 ⑪轻拍收工
 * 全程配 CC0 的真录音（assets/earspa/，出处见同目录 CREDITS.md）：
 *   ear-clean.mp3 —— 采耳 / 刮耳的真实声音（循环，音频跟着动作淡入淡出）
 *   ear-rub.mp3   —— 揉耳朵的沙沙声
 *   ear-wash.mp3  —— 洗耳的水流（妈妈 18:35 要的"洗耳朵"）
 *   hair-wash.mp3 —— 洗头发的水声（"洗头发"）
 *   pat.mp3       —— 收工那几下轻拍（"轻拍"）
 *   candle.mp3 / crackle.mp3 —— 耳烛的火苗 + 噼啪（19:xx 加的"耳烛"）
 *   cloth.mp3 / towel-wring.mp3 —— 热毛巾的布料声 + 拧毛巾
 *   ear-syringe.mp3 / shampoo.mp3 —— 冲水小球、挤洗发水的一次性小声音
 * 音叉/收工的「叮——」用 sfx.chime() 现场合成，不占文件。
 * 店里的背景音乐在 earspa.js（spa-music.mp3），音量比这些互动音效小。
 *
 * 用法：XD.EarScene.create({ sfx: sfx, title: '鲸耳堂' })
 *   open(onDone) / close() / skip() / isOpen() / debug()
 * 调试：?earspa=lie 进店就开始；?earspa=t=30 直接跳到第 30 秒那一格
 */
window.XD = window.XD || {};

XD.EarScene = (function () {
  'use strict';

  const W = 1600, H = 900;                 // 设计分辨率（画布按这个比例缩放）
  const FONT = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';

  /* ================= 九个小节 =================
   * d = 这一节多少秒；tool = 师傅手上的东西；audio = 放哪段录音
   * 事件：chime 敲钵 / pop 掏出耳垢 / tingle 酥酥的 / water 冲水 / lather 搓出泡沫 / end 收工
   * 妈妈 18:35 补：「洗耳朵、洗头发、轻拍都没有音频」→ 加了洗耳/洗头/轻拍三节 + 三段 CC0 录音
   */
  const STEPS = [
    {
      key: 'wash', name: '净手 · 点香', d: 6.0, tool: 'none', audio: null, event: 'chime',
      say: '先把手洗干净，再点一炉沉香——不着急，慢慢来。',
      think: '（屋子里有股淡淡的檀香味…）', tip: '采耳之前，先把心静下来'
    },
    {
      key: 'rub', name: '揉耳廓', d: 5.0, tool: 'hand', audio: 'rub',
      say: '先揉一揉耳廓，把耳朵暖热乎了再动工具。',
      think: '唔…热热的，痒痒的', tip: '耳廓上有好几个穴位，揉开了特别放松'
    },
    {
      key: 'clean1', name: '耳勺 · 清外侧', d: 7.0, tool: 'pick', audio: 'clean',
      say: '耳勺轻轻刮一刮外面，力气大了会疼的。',
      think: '有点痒，但是好舒服…', tip: '银耳勺只在耳道口转，不会往里捅的'
    },
    {
      key: 'deep', name: '深处 · 掏耳', d: 8.0, tool: 'pick', audio: 'clean', event: 'pop',
      say: '别动哦——这有一小块，我轻轻带出来。',
      think: '（屏住呼吸）…出来了！', tip: '掏出来的一小块，是耳道自己脱落的角质'
    },
    {
      key: 'irrigate', name: '洗耳 · 温水', d: 7.0, tool: 'syringe', audio: 'earwash', event: 'water',
      say: '温水顺着耳道冲一冲，像小溪从耳朵里流过去。',
      think: '（凉凉的，又暖暖的…）', tip: '洗耳用的是温的生理盐水，冲完耳朵特别清爽'
    },
    {
      key: 'feather', name: '鹅毛棒', d: 6.0, tool: 'feather', audio: 'clean', event: 'tingle',
      say: '鹅毛棒在耳朵口转一转，酥酥的，别怕。',
      think: '啊…骨头都酥了～', tip: '鹅毛棒是最舒服的一步，痒到心里去'
    },
    {
      key: 'tuning', name: '音叉 · 震', d: 5.0, tool: 'tuning', audio: null, event: 'chime',
      say: '音叉一响，嗡——顺着骨头走，整只耳朵都松了。',
      think: '嗡嗡的…整个人都软了', tip: '音叉震动会顺着颞骨传，比揉更松',
      lines: ['音叉一响，嗡——顺着骨头走，整只耳朵都松了。', '听这声儿，嗡……比揉还松，肩膀也一起放下。']
    },
    {
      key: 'candle', name: '耳烛 · 暖火', d: 6.5, tool: 'candle', audio: 'candle', event: 'candle',
      say: '点一支耳烛，暖火顺着耳道慢慢走，别急。',
      think: '（有火苗在耳朵口轻轻跳…）', tip: '耳烛是"慢慢暖、慢慢松"，急了反而没感觉',
      lines: ['点一支耳烛，暖火顺着耳道慢慢走，别急。', '这一支烧完，耳朵里那点潮气也就散了。']
    },
    {
      key: 'hair', name: '洗头 · 松肩', d: 8.0, tool: 'ladle', audio: 'hairwash', event: 'lather',
      say: '耳朵干净了，头发也洗一洗吧——热水揉开了最松。',
      think: '唔…头皮的褶都松开了', tip: '采完耳再洗个头，是这家店的收尾'
    },
    {
      key: 'towel', name: '热毛巾 · 敷眼', d: 5.5, tool: 'towel', audio: 'cloth', event: 'towel',
      say: '最后敷一条热毛巾，眼睛也一并歇一歇。',
      think: '（热乎乎的…真的要睡着了）', tip: '热毛巾敷眼一分钟，比什么按摩都放得松',
      lines: ['最后敷一条热毛巾，眼睛也一并歇一歇。', '毛巾是刚拧的，温度刚好——闭上眼吧。']
    },
    {
      key: 'pat', name: '轻拍 · 收工', d: 5.0, tool: 'pat', audio: 'pat', event: 'end', taps: true,
      say: '好啦，轻拍两下收工——回去睡个好觉，别熬夜哦。',
      think: '（舒服得不想起来…）', tip: '收工那几下轻拍，是把人从"松"里叫回来'
    }
  ];
  const TOTAL = STEPS.reduce(function (s, x) { return s + x.d; }, 0);

  /* ================= 状态 ================= */
  let opt = {};
  let sfx = null;
  let built = false;
  let open = false;
  let elWrap = null, cv = null, ctx = null, elUi = null;
  let elSay = null, elThink = null, elStepName = null, elBar = null, elStars = null;
  let elDone = null, elPills = [], elClock = null;
  let raf = 0, lastT = 0;
  let t = 0;                     // 服务已经过的秒数
  let dtSmooth = 0.016;
  let stepIdx = 0, stepT = 0;    // 当前小节 / 小节内进度
  let stepFired = {};            // 每节的事件只触发一次
  let onDoneCb = null;
  let finished = false;
  let dpr = 1, sc = 1, offX = 0, offY = 0;

  // 画面里飘的小东西
  let hearts = [], notes = [], sparks = [], dusts = [], bokeh = [], drops = [];
  let popFx = null;              // 掏出耳垢那一下
  let shake = 0;
  let tapT = 0;                  // 轻拍那节：隔一会儿"啪"一下
  let blinkT = 0;

  /* ================= 音频 =================
   * 循环层（一直在放、音量淡入淡出）：rub 揉耳 / clean 采耳 / earwash 洗耳 / hairwash 洗头
   * 一次性（按一下放一次）：pat 轻拍 / syringe 冲水 / shampoo 挤洗发水
   * 背景音乐在店里那层（earspa.js 的 spa-music.mp3），比这些互动音效小声
   */
  const LOOPS = {
    rub: { file: 'assets/earspa/ear-rub.mp3', vol: 0.56, rate: 0.94, rateSwing: 0.06 },
    clean: { file: 'assets/earspa/ear-clean.mp3', vol: 0.62, rate: 0.97, rateSwing: 0.05 },
    earwash: { file: 'assets/earspa/ear-wash.mp3', vol: 0.5, rate: 0.98, rateSwing: 0.03 },
    hairwash: { file: 'assets/earspa/hair-wash.mp3', vol: 0.46, rate: 0.98, rateSwing: 0.03 },
    candle: { file: 'assets/earspa/candle.mp3', vol: 0.3, rate: 0.99, rateSwing: 0.02 },
    crackle: { file: 'assets/earspa/crackle.mp3', vol: 0.16, rate: 1.0, rateSwing: 0.02 },
    cloth: { file: 'assets/earspa/cloth.mp3', vol: 0.38, rate: 0.99, rateSwing: 0.02 }
  };
  const ONESHOTS = {
    pat: { file: 'assets/earspa/pat.mp3', vol: 0.5 },
    syringe: { file: 'assets/earspa/ear-syringe.mp3', vol: 0.42 },
    shampoo: { file: 'assets/earspa/shampoo.mp3', vol: 0.4 },
    wring: { file: 'assets/earspa/towel-wring.mp3', vol: 0.44 }
  };
  const AUD = { loop: {}, one: {} };
  let audReady = false;
  let audTarget = {};            // { rub: 0.56, clean: 0, ... }

  function audInit() {
    if (audReady) return;
    audReady = true;
    try {
      Object.keys(LOOPS).forEach(function (k) {
        const a = new Audio(LOOPS[k].file);
        a.loop = true;
        a.volume = 0;
        a.preload = 'auto';
        AUD.loop[k] = a;
        audTarget[k] = 0;
      });
      Object.keys(ONESHOTS).forEach(function (k) {
        const a = new Audio(ONESHOTS[k].file);
        a.loop = false;
        a.volume = ONESHOTS[k].vol;
        a.preload = 'auto';
        AUD.one[k] = a;
      });
    } catch (e) { /* 没声音也能演 */ }
  }
  // kind：'rub' | 'clean' | 'earwash' | 'hairwash' | 'candle' | 'cloth' | null
  //   candle 特殊一点：烛火 + 火苗噼啪两层叠着（别的都只有一层）
  function audTargetsFor(kind) {
    if (kind === 'candle') return { candle: 0.3, crackle: 0.16 };
    if (kind && LOOPS[kind]) {
      const o = {};
      o[kind] = LOOPS[kind].vol;
      return o;
    }
    return {};
  }
  function audKind(kind) {
    audInit();
    const want = audTargetsFor(kind);
    Object.keys(LOOPS).forEach(function (k) {
      audTarget[k] = want[k] || 0;
      const a = AUD.loop[k];
      if (!a) return;
      if (audTarget[k] > 0 && a.paused) { try { a.play().catch(function () {}); } catch (e) {} }
    });
  }
  function audOneShot(kind, force) {
    audInit();
    const a = AUD.one[kind];
    if (!a) return;
    if (sfx && sfx.isMuted && sfx.isMuted()) return;
    try {
      a.currentTime = 0;
      a.volume = ONESHOTS[kind].vol * (force === undefined ? 1 : force);
      a.play().catch(function () {});
    } catch (e) {}
  }
  function audFade(dt) {
    if (!AUD.loop.clean) return;
    const mutedNow = !!(sfx && sfx.isMuted && sfx.isMuted());
    const k = Math.min(1, dt * 2.6);
    Object.keys(AUD.loop).forEach(function (name) {
      const a = AUD.loop[name];
      const want = mutedNow ? 0 : (audTarget[name] || 0);
      a.volume = Math.max(0, Math.min(1, a.volume + (want - a.volume) * k));
      // 循环层别让人听出接缝：播放速度跟着动一下
      const L = LOOPS[name];
      if (!a.paused && a.volume > 0.02) {
        a.playbackRate = L.rate + L.rateSwing * Math.sin(t * (name === 'clean' ? 1.9 : 1.3) + name.length);
      }
    });
  }
  function audStop() {
    Object.keys(AUD.loop).forEach(function (name) {
      audTarget[name] = 0;
      const a = AUD.loop[name];
      try { a.pause(); a.volume = 0; } catch (e) {}
    });
  }
  function snd(fn, arg) {
    if (!sfx || (sfx.isMuted && sfx.isMuted())) return;
    try { if (sfx[fn]) sfx[fn](arg); } catch (e) {}
  }

  /* ================= DOM ================= */
  const CSS = [
    '#es-scene{position:fixed;inset:0;z-index:58;display:none;background:#120c0a;',
    '  font-family:' + FONT + ';color:#f6ead8;overflow:hidden;user-select:none;}',
    '#es-scene.on{display:block;}',
    '#es-cv{position:absolute;inset:0;width:100%;height:100%;display:block;}',
    '.es-ui{position:absolute;inset:0;pointer-events:none;}',
    '.es-brand{position:absolute;left:34px;top:26px;font-size:26px;letter-spacing:3px;',
    '  color:#ffd9a0;text-shadow:0 2px 14px rgba(255,150,60,.5);opacity:.95;}',
    '.es-brand small{display:block;font-size:14px;letter-spacing:2px;color:#e8b98a;opacity:.8;margin-top:4px;}',
    '.es-clock{position:absolute;right:34px;top:30px;font-size:15px;letter-spacing:2px;color:#e9c79c;opacity:.85;}',
    '.es-skip{position:absolute;right:30px;top:66px;pointer-events:auto;cursor:pointer;',
    '  border:1px solid rgba(255,205,150,.45);background:rgba(40,24,18,.55);color:#ffd9ac;',
    '  border-radius:999px;padding:7px 16px;font-size:14px;letter-spacing:1px;}',
    '.es-skip:hover{background:rgba(90,50,30,.75);}',
    '.es-foot{position:absolute;left:0;right:0;bottom:0;padding:0 34px 22px;box-sizing:border-box;}',
    '.es-say{font-size:21px;line-height:1.5;color:#ffe9cd;text-shadow:0 2px 10px rgba(0,0,0,.6);',
    '  max-width:1120px;min-height:32px;transition:opacity .35s ease;}',
    '.es-say b{color:#ffc978;font-weight:600;}',
    '.es-think{margin-top:7px;font-size:16px;color:#cfe3ff;opacity:.82;font-style:italic;letter-spacing:1px;min-height:22px;}',
    '.es-pills{display:flex;gap:7px;margin-top:15px;flex-wrap:wrap;}',
    '.es-pill{font-size:12px;letter-spacing:.5px;padding:4px 10px;border-radius:999px;',
    '  border:1px solid rgba(255,200,150,.22);color:#c8a98a;background:rgba(30,18,14,.45);',
    '  transition:all .35s ease;}',
    '.es-pill.on{border-color:#ffc06a;color:#2a1a10;background:#ffc06a;box-shadow:0 0 18px rgba(255,170,80,.45);}',
    '.es-pill.past{color:#ffd9ac;border-color:rgba(255,200,150,.5);background:rgba(120,70,40,.35);}',
    '.es-meter{position:absolute;right:34px;bottom:118px;text-align:right;font-size:13px;',
    '  letter-spacing:2px;color:#ffcf9a;opacity:.9;}',
    '.es-stars{font-size:21px;letter-spacing:5px;color:#ffb752;margin-top:3px;',
    '  text-shadow:0 0 14px rgba(255,150,60,.6);}',
    '.es-stars i{opacity:.22;font-style:normal;transition:opacity .4s ease,color .4s ease;}',
    '.es-stars i.on{opacity:1;}',
    '.es-bar{position:absolute;left:34px;right:34px;bottom:12px;height:3px;border-radius:2px;',
    '  background:rgba(255,220,180,.14);overflow:hidden;}',
    '.es-bar i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#ff9d4d,#ffd79a);',
    '  box-shadow:0 0 12px rgba(255,160,70,.8);}',
    '#es-done{position:absolute;inset:0;display:none;align-items:center;justify-content:center;',
    '  background:radial-gradient(60% 60% at 50% 45%,rgba(60,34,20,.88),rgba(10,7,6,.94));}',
    '#es-done.on{display:flex;}',
    '.es-card{text-align:center;padding:34px 52px 30px;border-radius:22px;',
    '  border:1px solid rgba(255,200,150,.3);background:rgba(38,22,16,.82);',
    '  box-shadow:0 24px 80px rgba(0,0,0,.6);backdrop-filter:blur(2px);}',
    '.es-card h2{margin:0 0 6px;font-size:31px;letter-spacing:5px;color:#ffd9a0;font-weight:600;}',
    '.es-card p{margin:5px 0;font-size:16px;color:#e6cfb3;letter-spacing:1px;}',
    '.es-card .big{font-size:19px;color:#ffe6c4;margin:14px 0 16px;letter-spacing:2px;}',
    '.es-card .es-stars{font-size:27px;margin-bottom:18px;}',
    '.es-btns{display:flex;gap:14px;justify-content:center;margin-top:8px;}',
    '.es-btn{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,205,150,.45);',
    '  background:rgba(255,190,110,.14);color:#ffe0b6;border-radius:999px;',
    '  padding:11px 26px;font-size:16px;letter-spacing:2px;transition:all .2s;}',
    '.es-btn:hover{background:rgba(255,190,110,.3);color:#fff6e8;}',
    '.es-btn.main{background:#ffc06a;color:#33200f;border-color:#ffc06a;font-weight:600;}',
    '.es-btn.main:hover{background:#ffd08a;}'
  ].join('');

  function build() {
    if (built) return;
    built = true;
    const st = document.createElement('style');
    st.id = 'es-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    const wrap = document.createElement('div');
    wrap.id = 'es-scene';
    wrap.innerHTML =
      '<canvas id="es-cv"></canvas>' +
      '<div class="es-ui">' +
      '  <div class="es-brand">🐋 鲸耳堂 · 采耳<small>EAR SPA · 夜里十点还开着</small></div>' +
      '  <div class="es-clock" id="es-clock">晚上 22:40</div>' +
      '  <div class="es-skip" id="es-skip">⏭ 跳过</div>' +
      '  <div class="es-meter">舒服度<div class="es-stars" id="es-stars">' +
      '    <i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div></div>' +
      '  <div class="es-foot">' +
      '    <div class="es-say" id="es-say"></div>' +
      '    <div class="es-think" id="es-think"></div>' +
      '    <div class="es-pills" id="es-pills"></div>' +
      '  </div>' +
      '  <div class="es-bar"><i id="es-bar"></i></div>' +
      '</div>' +
      '<div id="es-done"><div class="es-card">' +
      '  <h2>采耳完成</h2>' +
      '  <p>鲸耳堂 · 棉师傅 · 十一个小节</p>' +
      '  <div class="big">耳朵 ✔ 干干净净</div>' +
      '  <div class="es-stars" id="es-done-stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div>' +
      '  <p style="opacity:.75">用时 <span id="es-used">49</span> 秒 · 收费 ¥0（今晚我请）</p>' +
      '  <div class="es-btns">' +
      '    <div class="es-btn main" id="es-again">再采一次</div>' +
      '    <div class="es-btn" id="es-exit">起身回店里</div>' +
      '  </div>' +
      '</div></div>';
    document.body.appendChild(wrap);
    elWrap = wrap;
    cv = wrap.querySelector('#es-cv');
    ctx = cv.getContext('2d');
    elUi = wrap.querySelector('.es-ui');
    elSay = wrap.querySelector('#es-say');
    elThink = wrap.querySelector('#es-think');
    elBar = wrap.querySelector('#es-bar');
    elStars = wrap.querySelector('#es-stars');
    elClock = wrap.querySelector('#es-clock');
    elDone = wrap.querySelector('#es-done');
    const pills = wrap.querySelector('#es-pills');
    elPills = STEPS.map(function (s) {
      const d = document.createElement('div');
      d.className = 'es-pill';
      d.textContent = s.name;
      pills.appendChild(d);
      return d;
    });
    wrap.querySelector('#es-skip').addEventListener('click', function (e) {
      e.stopPropagation();
      skip();
    });
    wrap.querySelector('#es-exit').addEventListener('click', function (e) {
      e.stopPropagation();
      close();
    });
    wrap.querySelector('#es-again').addEventListener('click', function (e) {
      e.stopPropagation();
      restart();
    });
    window.addEventListener('resize', function () { if (open) resize(); });
  }

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.max(2, Math.round(w * dpr));
    cv.height = Math.max(2, Math.round(h * dpr));
    sc = Math.min(cv.width / W, cv.height / H);
    offX = (cv.width - W * sc) / 2;
    offY = (cv.height - H * sc) / 2;
  }

  /* ================= 开 / 关 / 重来 ================= */
  function openScene(cb) {
    build();
    resize();
    onDoneCb = cb || null;
    finished = false;
    open = true;
    t = 0; stepIdx = 0; stepT = 0; stepFired = {};
    hearts = []; notes = []; sparks = []; dusts = []; drops = []; popFx = null; shake = 0;
    curSay = null;
    curStepIdx = -1;
    makeBokeh();
    elWrap.classList.add('on');
    elDone.classList.remove('on');
    elUi.style.display = '';
    // 一打开就把四条循环录音都挂上（音量 0），点「躺下」那一下就是用户手势，之后能出声
    audInit();
    Object.keys(AUD.loop).forEach(function (k) {
      const a = AUD.loop[k];
      try { a.volume = 0; a.play().catch(function () {}); } catch (e) {}
    });
    applyStepText(true);
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
    lastT = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function restart() {
    t = 0; stepIdx = 0; stepT = 0; stepFired = {}; finished = false;
    hearts = []; notes = []; sparks = []; dusts = []; popFx = null;
    elDone.classList.remove('on');
    elUi.style.display = '';
    applyStepText(true);
    audStop();
    lastT = performance.now();
  }

  function close() {
    if (!open) return;
    open = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    audStop();
    if (elWrap) elWrap.classList.remove('on');
    const cb = onDoneCb;
    onDoneCb = null;
    if (cb) { try { cb(t); } catch (e) {} }
  }

  function skip() {
    if (!open) return;
    if (finished) { close(); return; }
    t = TOTAL;
    finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    audStop();
    elUi.style.display = 'none';
    elDone.classList.add('on');
    const used = document.getElementById('es-used');
    if (used) used.textContent = Math.round(Math.min(t, TOTAL));
    const ds = document.querySelectorAll('#es-done-stars i');
    for (let i = 0; i < ds.length; i++) {
      (function (i) {
        setTimeout(function () { if (ds[i]) ds[i].classList.add('on'); }, 190 * i + 120);
      })(i);
    }
    snd('chime');
    setTimeout(function () { snd('chime'); }, 700);
  }

  /* ================= 每帧 ================= */
  function loop(now) {
    if (!open) return;
    raf = requestAnimationFrame(loop);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;
    dtSmooth = dtSmooth * 0.9 + dt * 0.1;

    if (!finished) {
      t += dt;
      updateTimeline(dt);
    } else {
      // 结束卡片还在飘小星星
      if (Math.random() < dt * 3) spawnSpark(200 + Math.random() * 1200, 200 + Math.random() * 500);
    }
    updateParticles(dt);
    audFade(dt);
    draw(dt);
  }

  function stepOfTime(tt) {
    let acc = 0;
    for (let i = 0; i < STEPS.length; i++) {
      if (tt < acc + STEPS[i].d) return { i: i, p: (tt - acc) / STEPS[i].d, t: tt - acc };
      acc += STEPS[i].d;
    }
    return { i: STEPS.length - 1, p: 1, t: STEPS[STEPS.length - 1].d };
  }

  let curStepIdx = -1;

  function updateTimeline(dt) {
    const s = stepOfTime(t);
    stepIdx = s.i;
    stepT = s.t;
    const st = STEPS[s.i];

    if (s.i !== curStepIdx) {
      curStepIdx = s.i;
      enterStep(st, s.i);
    }
    // 小节内的小事件
    if (st.event === 'pop' && !stepFired['pop' + s.i] && s.p > 0.55) {
      stepFired['pop' + s.i] = true;
      doPop();
    }
    if (st.event === 'tingle' && !stepFired['tingle' + s.i] && s.p > 0.45) {
      stepFired['tingle' + s.i] = true;
      shake = 0.5;
      for (let i = 0; i < 5; i++) spawnNote(760 + Math.random() * 260, 480 + Math.random() * 60);
      snd('bubble');
    }
    // 进度条 / 舒服度
    const prog = Math.min(100, t / TOTAL * 100);
    if (elBar) elBar.style.width = prog.toFixed(1) + '%';
    const stars = Math.min(5, Math.floor(prog / 20) + (prog > 2 ? 1 : 0));
    if (elStars) {
      const kids = elStars.querySelectorAll('i');
      for (let i = 0; i < kids.length; i++) {
        if (i < stars) kids[i].classList.add('on'); else kids[i].classList.remove('on');
      }
    }
    if (elClock) {
      const mins = 40 + Math.floor(t / 6);
      elClock.textContent = '晚上 ' + (22 + Math.floor(mins / 60)) + ':' + ('0' + (mins % 60)).slice(-2);
    }
    // 不断冒的小东西
    if (Math.random() < dt * 2.2) spawnHeart(560 + Math.random() * 420, 470 + Math.random() * 40);
    if (Math.random() < dt * 1.4) spawnSpark(280 + Math.random() * 1100, 220 + Math.random() * 420);
    if (s.i >= 2 && s.i <= 5 && Math.random() < dt * 8) spawnDust(1330 + Math.random() * 90, 190 + Math.random() * 90);
    // 洗耳：水珠顺着耳道往里淌
    if (st.key === 'irrigate' && Math.random() < dt * 14) spawnDrop(962 + Math.random() * 40, 500 + Math.random() * 30);
    // 洗头：热水从竹舀子上淋下来
    if (st.key === 'hair' && Math.random() < dt * 18) spawnDrop(846 + Math.random() * 120, 452 + Math.random() * 26);
    // 轻拍：隔 0.8 秒"啪"一下（声音 + 画面跟着颤一下）
    if (st.taps) {
      tapT += dt;
      if (tapT > 0.8) {
        tapT = 0;
        audOneShot('pat', 0.85);
        shake = Math.max(shake, 0.22);
        for (let i = 0; i < 3; i++) spawnSpark(884 + Math.random() * 70, 520 + Math.random() * 40);
      }
    }

    if (t >= TOTAL) finish();
  }

  // 每次进来台词随机挑一句（第二次玩不一样）
  let curSay = null;

  function enterStep(st, i) {
    curStepIdx = i;
    // 小节药丸
    for (let k = 0; k < elPills.length; k++) {
      elPills[k].className = 'es-pill' + (k === i ? ' on' : (k < i ? ' past' : ''));
    }
    curSay = st.lines ? st.lines[Math.floor(Math.random() * st.lines.length)] : st.say;
    applyStepText(false);
    // 音频（循环层只留这一节那条）
    audKind(st.audio);
    tapT = 0;
    // 事件音
    if (st.event === 'chime') { snd('chime'); }
    if (st.event === 'end') {
      snd('chime');
      setTimeout(function () { snd('blip'); }, 480);
    }
    if (st.event === 'pop') {
      // 掏出来之前先屏一下
      setTimeout(function () { if (open && !finished) snd('blip'); }, 300);
    }
    if (st.event === 'water') {
      audOneShot('syringe');
      for (let n = 0; n < 14; n++) spawnDrop(986 + Math.random() * 26, 470 + Math.random() * 40);
    }
    if (st.event === 'lather') {
      audOneShot('shampoo');
      for (let n = 0; n < 7; n++) spawnSpark(880 + Math.random() * 90, 470 + Math.random() * 30);
    }
    if (st.event === 'candle') {
      snd('blip');
      for (let n = 0; n < 6; n++) spawnSpark(1030 + Math.random() * 50, 470 + Math.random() * 40);
    }
    if (st.event === 'towel') {
      audOneShot('wring');
      for (let n = 0; n < 8; n++) spawnSpark(880 + Math.random() * 110, 470 + Math.random() * 40);
    }
  }

  function applyStepText(instant) {
    const st = STEPS[Math.min(stepIdx, STEPS.length - 1)];
    if (!elSay) return;
    elSay.style.opacity = '0';
    elThink.style.opacity = '0';
    setTimeout(function () {
      if (elSay) elSay.innerHTML = curSay || st.say;
      if (elThink) elThink.textContent = st.think;
      if (elSay) elSay.style.opacity = '1';
      if (elThink) elThink.style.opacity = '.82';
    }, instant ? 0 : 170);
  }

  /* ================= 小粒子 ================= */
  function makeBokeh() {
    bokeh = [];
    for (let i = 0; i < 16; i++) {
      bokeh.push({
        x: Math.random() * W, y: Math.random() * 620,
        r: 24 + Math.random() * 90, a: 0.03 + Math.random() * 0.09,
        ph: Math.random() * 6.28, sp: 0.15 + Math.random() * 0.35,
        hue: Math.random() < 0.7 ? '#ffb35c' : '#ff8f5a'
      });
    }
  }
  function spawnHeart(x, y) {
    hearts.push({ x: x, y: y, vy: -22 - Math.random() * 26, a: 0.9, r: 8 + Math.random() * 7, rot: Math.random() * 0.6 - 0.3 });
  }
  function spawnNote(x, y) {
    notes.push({ x: x, y: y, vy: -30 - Math.random() * 20, a: 1, ch: Math.random() < 0.5 ? '♪' : '♫', s: 20 + Math.random() * 12, ph: Math.random() * 6 });
  }
  function spawnSpark(x, y) {
    sparks.push({ x: x, y: y, a: 1, r: 3 + Math.random() * 7, sp: 0.6 + Math.random() * 1.6 });
  }
  function spawnDust(x, y) {
    dusts.push({ x: x, y: y, vx: 12 + Math.random() * 26, vy: -8 - Math.random() * 20, a: 0.8, r: 2 + Math.random() * 4 });
  }
  // 洗耳 / 洗头的水珠：落下来、溅开
  function spawnDrop(x, y) {
    drops.push({
      x: x, y: y, vx: -6 + Math.random() * 30, vy: 40 + Math.random() * 90,
      a: 0.85, r: 2.5 + Math.random() * 3.5, ph: Math.random() * 6.28
    });
  }
  function doPop() {
    popFx = { x: 1385, y: 232, t: 0 };
    for (let i = 0; i < 10; i++) spawnSpark(1340 + Math.random() * 100, 200 + Math.random() * 70);
    snd('pop');
    shake = 0.65;
  }
  function updateParticles(dt) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.y += h.vy * dt; h.a -= dt * 0.55;
      if (h.a <= 0) hearts.splice(i, 1);
    }
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      n.y += n.vy * dt; n.x += Math.sin(t * 2 + n.ph) * 18 * dt; n.a -= dt * 0.45;
      if (n.a <= 0) notes.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.a -= dt * s.sp; s.r *= (1 + dt * 0.9);
      if (s.a <= 0) sparks.splice(i, 1);
    }
    for (let i = dusts.length - 1; i >= 0; i--) {
      const d = dusts[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.a -= dt * 0.5;
      if (d.a <= 0) dusts.splice(i, 1);
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const w = drops[i];
      w.vy += 260 * dt;             // 重力
      w.x += w.vx * dt; w.y += w.vy * dt;
      if (w.y > 632) { w.a -= dt * 2.6; } else { w.a -= dt * 0.14; }
      if (w.a <= 0) drops.splice(i, 1);
    }
    if (popFx) { popFx.t += dt; if (popFx.t > 1.1) popFx = null; }
    if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
  }

  /* ================= 画 ================= */
  function draw(dt) {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const sh = shake > 0 ? Math.sin(t * 42) * shake * 3.2 : 0;
    ctx.setTransform(sc, 0, 0, sc, offX + sh * sc, offY);

    const st = STEPS[Math.min(stepIdx, STEPS.length - 1)];
    const p = Math.min(1, stepT / Math.max(0.001, st.d));

    bgCanvas(dt);
    lanterms(dt);
    bench();
    whale(p, st);
    benchFront();
    master(st, p);
    if (stepIdx >= 2 && stepIdx <= 5) inset(st, p);
    drawParticles();
    vignette();
  }

  function bgCanvas(dt) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c1210');
    g.addColorStop(0.42, '#33201a');
    g.addColorStop(0.78, '#2a1915');
    g.addColorStop(1, '#150e0c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 暖光团
    const rg = ctx.createRadialGradient(760, 470, 60, 760, 470, 620);
    rg.addColorStop(0, 'rgba(255,170,90,.20)');
    rg.addColorStop(0.6, 'rgba(255,140,70,.06)');
    rg.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // 窗外的光斑（夜里街上的灯）
    for (let i = 0; i < bokeh.length; i++) {
      const b = bokeh[i];
      const x = b.x + Math.sin(t * b.sp + b.ph) * 16;
      const y = b.y + Math.cos(t * b.sp * 0.8 + b.ph) * 10;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, 6.2832);
      ctx.fillStyle = b.hue;
      ctx.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(t * 0.9 + b.ph));
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 左侧竹丛剪影
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#120c0a';
    for (let s = 0; s < 4; s++) {
      const bx = 20 + s * 46;
      ctx.fillRect(bx, -40, 12 + s * 2, H + 80);
      for (let k = 0; k < 6; k++) {
        const ly = 60 + k * 130 + (s % 2) * 40;
        const dir = (k + s) % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(bx + 8, ly);
        ctx.quadraticCurveTo(bx + 8 + dir * 46, ly - 16, bx + 8 + dir * 74, ly + 8);
        ctx.quadraticCurveTo(bx + 8 + dir * 40, ly - 2, bx + 8, ly + 6);
        ctx.fill();
      }
    }
    ctx.restore();

    // 木地板
    ctx.fillStyle = '#241612';
    ctx.fillRect(0, 690, W, H - 690);
    ctx.strokeStyle = 'rgba(255,190,130,.045)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = 700 + i * 26;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y + 6);
      ctx.stroke();
    }
  }

  function lanterms(dt) {
    // 两盏纸灯笼，轻轻摆
    const lamps = [
      { x: 300, y: 96, r: 46, ph: 0.2, col: '#ffb257' },
      { x: 1180, y: 72, r: 34, ph: 1.7, col: '#ff9d5c' }
    ];
    for (let i = 0; i < lamps.length; i++) {
      const L = lamps[i];
      const sw = Math.sin(t * 0.8 + L.ph) * 5;
      ctx.save();
      ctx.translate(L.x + sw, L.y);
      // 吊绳
      ctx.strokeStyle = 'rgba(255,200,150,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -L.y); ctx.lineTo(0, -L.r); ctx.stroke();
      // 光晕
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, L.r * 4.2);
      g.addColorStop(0, 'rgba(255,175,95,.36)');
      g.addColorStop(0.45, 'rgba(255,140,70,.10)');
      g.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, L.r * 4.2, 0, 6.2832); ctx.fill();
      // 灯笼身
      ctx.beginPath();
      ctx.ellipse(0, 0, L.r * 0.86, L.r, 0, 0, 6.2832);
      ctx.fillStyle = i === 0 ? '#f7c078' : '#f0a86a';
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(120,60,30,.45)';
      ctx.lineWidth = 1.5;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.ellipse(0, k * L.r * 0.34, L.r * 0.86 * Math.sqrt(Math.max(0.05, 1 - (k * 0.34) * (k * 0.34))), L.r * 0.13, 0, 0, 6.2832);
        ctx.stroke();
      }
      // 上下木盖
      ctx.fillStyle = '#3a2318';
      ctx.fillRect(-L.r * 0.3, -L.r - 7, L.r * 0.6, 8);
      ctx.fillRect(-L.r * 0.3, L.r - 1, L.r * 0.6, 8);
      ctx.restore();
    }
  }

  // 竹躺椅（后半：靠背 + 坐垫）
  function bench() {
    ctx.save();
    // 影子
    ctx.beginPath();
    ctx.ellipse(700, 726, 330, 26, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fill();
    // 后腿
    ctx.fillStyle = '#3d281b';
    [[420, 700], [700, 706], [960, 700]].forEach(function (p) {
      ctx.fillRect(p[0] - 9, p[1] - 92, 18, 96);
    });
    // 竹席坐垫
    roundRect(352, 606, 680, 54, 24);
    ctx.fillStyle = '#8b6640';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,36,20,.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const x = 366 + i * 30;
      ctx.beginPath(); ctx.moveTo(x, 612); ctx.lineTo(x, 654); ctx.stroke();
    }
    // 靠背（左边高起一小段）
    ctx.beginPath();
    ctx.moveTo(352, 610);
    ctx.quadraticCurveTo(330, 552, 372, 534);
    ctx.lineTo(470, 540);
    ctx.quadraticCurveTo(452, 596, 470, 610);
    ctx.closePath();
    ctx.fillStyle = '#7d5a38';
    ctx.fill();
    // 头枕（在身子底下，别顶到脸上）
    ctx.beginPath();
    ctx.ellipse(846, 606, 62, 22, -0.03, 0, 6.2832);
    ctx.fillStyle = '#c8a06a';
    ctx.fill();
    ctx.restore();
  }
  function benchFront() {
    ctx.save();
    // 扶手
    ctx.beginPath();
    roundRect(930, 640, 96, 20, 10);
    ctx.fillStyle = '#4d3322';
    ctx.fill();
    ctx.fillRect(1012, 640, 14, 54);
    // 椅面木沿
    roundRect(344, 650, 690, 16, 8);
    ctx.fillStyle = '#5c3e28';
    ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 小D（胖鲸，仰躺，头朝右）
  function whale(p, st) {
    const breathe = Math.sin(t * 1.15) * 2.4 + (st.key === 'feather' ? Math.sin(t * 8) * 1.6 : 0);
    const sleepy = st.key === 'done' ? Math.min(1, (t - (TOTAL - 5)) / 3) : 0;
    ctx.save();
    ctx.translate(0, breathe);

    // 影子
    ctx.beginPath();
    ctx.ellipse(700, 668, 250, 20, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fill();

    // 尾鳍
    ctx.beginPath();
    ctx.moveTo(470, 592);
    ctx.quadraticCurveTo(392, 566, 330, 512);
    ctx.quadraticCurveTo(392, 598, 360, 636);
    ctx.quadraticCurveTo(420, 620, 470, 612);
    ctx.closePath();
    ctx.fillStyle = '#141d31';
    ctx.fill();

    // 身体
    ctx.beginPath();
    ctx.moveTo(468, 596);
    ctx.bezierCurveTo(540, 496, 720, 470, 852, 486);
    ctx.bezierCurveTo(930, 496, 966, 520, 996, 566);
    ctx.bezierCurveTo(1012, 610, 986, 648, 940, 654);
    ctx.bezierCurveTo(830, 672, 640, 668, 520, 640);
    ctx.bezierCurveTo(486, 630, 466, 616, 468, 596);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, 470, 0, 670);
    bg.addColorStop(0, '#243553');
    bg.addColorStop(0.55, '#1a2740');
    bg.addColorStop(1, '#141c2e');
    ctx.fillStyle = bg;
    ctx.fill();

    // 白肚
    ctx.beginPath();
    ctx.moveTo(500, 618);
    ctx.bezierCurveTo(600, 660, 800, 664, 928, 632);
    ctx.bezierCurveTo(960, 624, 976, 606, 972, 588);
    ctx.bezierCurveTo(880, 620, 660, 626, 500, 600);
    ctx.closePath();
    ctx.fillStyle = '#f4efe2';
    ctx.globalAlpha = 0.96;
    ctx.fill();
    ctx.globalAlpha = 1;

    // 背脊上的一道微光（不是死黑一片，看着像有光从上面打下来）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(500, 590);
    ctx.bezierCurveTo(560, 500, 720, 476, 852, 490);
    ctx.bezierCurveTo(920, 498, 952, 516, 976, 548);
    ctx.strokeStyle = 'rgba(150,185,240,.16)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // 胸鳍
    ctx.beginPath();
    ctx.moveTo(742, 626);
    ctx.quadraticCurveTo(806, 646, 812, 690);
    ctx.quadraticCurveTo(766, 664, 726, 642);
    ctx.closePath();
    ctx.fillStyle = '#16203a';
    ctx.fill();

    // 眼斑（虎鲸那块白）
    ctx.save();
    ctx.translate(912, 526);
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 21, 0, 0, 6.2832);
    ctx.fillStyle = '#f4efe2';
    ctx.fill();
    ctx.restore();

    // 眼睛：舒服到闭着；收工那一下慢慢睁开
    ctx.save();
    ctx.translate(910, 528);
    ctx.strokeStyle = '#10182a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    if (sleepy > 0.55) {
      const openK = (sleepy - 0.55) / 0.45;
      ctx.beginPath();
      ctx.ellipse(2, 0, 15, 13 * openK + 2, 0, 0, 6.2832);
      ctx.fillStyle = '#10182a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(7, -4, 4.8 * openK + 1, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 2, 15, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.arc(0, 7, 17, Math.PI * 0.28, Math.PI * 0.72);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 腮红（点在白斑下缘那块奶油色上，才像"脸红"；点在深蓝身上会发灰）
    ctx.beginPath();
    ctx.ellipse(916, 546, 13, 7, 0.12, 0, 6.2832);
    ctx.fillStyle = 'rgba(252,146,164,' + (0.26 + 0.18 * Math.min(1, t / 20)) + ')';
    ctx.fill();

    // 嘴：舒服的小弧；掏深处那一下微微张嘴
    const mouthOpen = st.key === 'deep' ? 2.5 + 2.5 * Math.sin(t * 7) : 0;
    ctx.save();
    ctx.translate(966, 592);
    ctx.strokeStyle = '#12202f';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (mouthOpen > 1) {
      ctx.ellipse(0, 0, 6, mouthOpen + 1.5, 0, 0, 6.2832);
      ctx.fillStyle = '#3a2530';
      ctx.fill();
    } else {
      ctx.arc(-1, -2, 9, Math.PI * 0.18, Math.PI * 0.92);
      ctx.stroke();
    }
    ctx.restore();

    // 耳朵（被采的那只，在头的右上）
    ctx.save();
    ctx.translate(986, 552);
    ctx.beginPath();
    ctx.arc(0, 0, 14, Math.PI * 0.55, Math.PI * 1.75);
    ctx.strokeStyle = 'rgba(20,28,46,.8)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-1, 1, 6.5, 0, 6.2832);
    ctx.fillStyle = 'rgba(247,170,150,.5)';
    ctx.fill();
    ctx.restore();

    // 洗头那节：头上顶着一层泡沫（会轻轻鼓一下）
    if (st.key === 'hair') {
      const bs = [[860, 470, 16], [888, 452, 20], [916, 460, 15], [940, 472, 12],
        [874, 484, 11], [904, 480, 10], [926, 482, 9], [892, 434, 12]];
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        const k = 1 + Math.sin(t * 2.2 + i * 1.3) * 0.07;
        ctx.beginPath();
        ctx.arc(b[0], b[1], b[2] * k, 0, 6.2832);
        ctx.fillStyle = 'rgba(255,253,246,.8)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b[0] - b[2] * 0.3, b[1] - b[2] * 0.35, b[2] * 0.22, 0, 6.2832);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.fill();
      }
      // 湿亮的一道
      ctx.beginPath();
      ctx.moveTo(830, 500);
      ctx.quadraticCurveTo(884, 458, 952, 486);
      ctx.strokeStyle = 'rgba(200,230,255,.22)';
      ctx.lineWidth = 7;
      ctx.stroke();
    }

    // 舒服到冒的小泡泡（呼气）
    if (st.key === 'rub' || st.key === 'feather') {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.7 + i * 0.33) % 1;
        ctx.beginPath();
        ctx.arc(1010 + i * 16 + k * 22, 512 - k * 40, 4 + k * 7, 0, 6.2832);
        ctx.strokeStyle = 'rgba(255,235,200,' + (0.35 * (1 - k)) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 棉师傅（白猫，穿靛色汉服）
  function master(st, p) {
    const bob = Math.sin(t * 1.6) * 2.2;
    const lean = Math.sin(t * 0.9) * 0.012;
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(lean);

    // 影子
    ctx.beginPath();
    ctx.ellipse(1150, 742, 130, 20, 0, 0, 6.2832);
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.fill();

    // 身体（汉服）
    ctx.beginPath();
    ctx.moveTo(1066, 748);
    ctx.quadraticCurveTo(1082, 604, 1112, 556);
    ctx.lineTo(1210, 556);
    ctx.quadraticCurveTo(1236, 616, 1246, 748);
    ctx.closePath();
    const bg = ctx.createLinearGradient(1100, 550, 1200, 750);
    bg.addColorStop(0, '#4a5885');
    bg.addColorStop(1, '#2f3a5c');
    ctx.fillStyle = bg;
    ctx.fill();
    // 衣襟
    ctx.beginPath();
    ctx.moveTo(1136, 560);
    ctx.lineTo(1160, 640);
    ctx.lineTo(1186, 560);
    ctx.closePath();
    ctx.fillStyle = '#e8e2d4';
    ctx.fill();
    // 腰带
    ctx.fillStyle = 'rgba(200,150,90,.85)';
    ctx.fillRect(1100, 664, 132, 16);

    // 左臂（往小D耳朵那边伸）
    const reach = (st.tool === 'none') ? 0 : 1;
    let hx = 1064 - reach * 26, hy = 566 + reach * 4 + Math.sin(t * 5.5) * (st.tool === 'pick' ? 2.4 : 1.2);
    if (st.tool === 'ladle') { hx = 962; hy = 452; }        // 洗头时手要抬到头顶那边
    if (st.tool === 'pat') { hx = 1010; hy = 556; }        // 轻拍在肩背上
    ctx.beginPath();
    ctx.moveTo(1122, 574);
    ctx.quadraticCurveTo(1096, 600, hx, hy);
    ctx.strokeStyle = '#3d4a72';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.stroke();
    // 袖口
    ctx.beginPath();
    ctx.arc(hx, hy, 17, 0, 6.2832);
    ctx.fillStyle = '#e8e2d4';
    ctx.fill();

    // 右手（拿工具 / 放在膝上）
    ctx.beginPath();
    ctx.arc(1216, 648, 15, 0, 6.2832);
    ctx.fillStyle = '#f7e3cf';
    ctx.fill();

    // 头
    ctx.beginPath();
    ctx.arc(1162, 476, 58, 0, 6.2832);
    ctx.fillStyle = '#f9e8d4';
    ctx.fill();
    // 猫耳
    ctx.beginPath();
    ctx.moveTo(1126, 434);
    ctx.lineTo(1114, 396);
    ctx.lineTo(1152, 420);
    ctx.closePath();
    ctx.fillStyle = '#f9e8d4';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1198, 434);
    ctx.lineTo(1214, 398);
    ctx.lineTo(1174, 420);
    ctx.closePath();
    ctx.fill();
    // 耳内粉
    ctx.beginPath();
    ctx.moveTo(1129, 430); ctx.lineTo(1121, 406); ctx.lineTo(1146, 422); ctx.closePath();
    ctx.fillStyle = 'rgba(240,160,160,.7)'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1196, 430); ctx.lineTo(1207, 408); ctx.lineTo(1180, 422); ctx.closePath();
    ctx.fill();
    // 发髻
    ctx.beginPath();
    ctx.arc(1162, 414, 15, 0, 6.2832);
    ctx.fillStyle = '#3a2a22';
    ctx.fill();

    // 眼睛（闭着笑）
    ctx.strokeStyle = '#2a2118';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    [1138, 1186].forEach(function (x) {
      ctx.beginPath();
      ctx.arc(x, 480, 11, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    });
    // 鼻子 + 嘴
    ctx.beginPath();
    ctx.moveTo(1162, 496); ctx.lineTo(1156, 502); ctx.lineTo(1168, 502); ctx.closePath();
    ctx.fillStyle = '#e08d8d'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1162, 503);
    ctx.quadraticCurveTo(1152, 514, 1144, 508);
    ctx.moveTo(1162, 503);
    ctx.quadraticCurveTo(1172, 514, 1180, 508);
    ctx.stroke();
    // 胡须
    ctx.strokeStyle = 'rgba(140,120,100,.75)';
    ctx.lineWidth = 2;
    [[-1, 0], [-1, 8], [-1, -8]].forEach(function (o) {
      ctx.beginPath();
      ctx.moveTo(1130, 494 + o[1] * 0.5);
      ctx.lineTo(1096, 488 + o[1]);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1194, 494 + o[1] * 0.5);
      ctx.lineTo(1228, 488 + o[1]);
      ctx.stroke();
    });

    // 工具
    drawTool(st, hx, hy);
    ctx.restore();
  }

  function drawTool(st, hx, hy) {
    if (st.tool === 'none') return;
    const wob = Math.sin(t * (st.tool === 'pick' ? 13 : 5.2));
    if (st.tool === 'pat') {
      // 轻拍：两只爪子一上一下地在肩上拍
      const tap = Math.abs(Math.sin(t * 5.2));
      ctx.save();
      [[-30, -6], [-6, 8]].forEach(function (o) {
        ctx.save();
        ctx.translate(hx + o[0], hy + o[1] - tap * 7);
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, 6.2832);
        ctx.fillStyle = '#f7e3cf';
        ctx.fill();
        ctx.strokeStyle = 'rgba(220,170,150,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.2832); ctx.stroke();
        ctx.restore();
      });
      // 拍击的动感弧线
      ctx.strokeStyle = 'rgba(255,220,170,' + (0.2 + 0.45 * tap) + ')';
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(hx - 18, hy + 2, 24 + i * 11, Math.PI * 1.1, Math.PI * 1.8);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (st.tool === 'syringe') {
      // 冲耳球：软球 + 细嘴，嘴对着耳朵
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(-0.1 + wob * 0.05);
      ctx.beginPath();
      ctx.ellipse(16, 3, 15, 12, 0, 0, 6.2832);
      ctx.fillStyle = '#cfe0e6';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,185,198,.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(-36, -3);
      ctx.strokeStyle = '#e6e1d6';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-38, -3, 3.6, 0, 6.2832);
      ctx.fillStyle = 'rgba(198,234,255,.95)';
      ctx.fill();
      ctx.restore();
      return;
    }
    if (st.tool === 'ladle') {
      // 竹舀子：从上面淋热水下来（柄连到师傅手上）
      ctx.save();
      // 水线
      ctx.beginPath();
      ctx.moveTo(876, 436);
      ctx.quadraticCurveTo(862, 492, 868, 544);
      ctx.strokeStyle = 'rgba(196,232,255,.4)';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(238,250,255,.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // 柄
      ctx.beginPath();
      ctx.moveTo(890, 424);
      ctx.quadraticCurveTo(912, 438, hx - 8, hy - 10);
      ctx.strokeStyle = '#8a6234';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
      // 舀子
      ctx.beginPath();
      ctx.ellipse(884, 424, 17, 9.5, 0.2, 0, 6.2832);
      ctx.fillStyle = '#b3854f';
      ctx.fill();
      ctx.strokeStyle = '#7d5a34';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (st.tool === 'candle') {
      // 耳烛：一支细长的蜂蜡烛，火苗在耳朵外侧跳
      const fl = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23) * 0.06;
      ctx.save();
      // 烛身（从耳朵口斜着往外）
      ctx.translate(986, 552);
      ctx.rotate(-0.62);
      const cg = ctx.createLinearGradient(0, -6, 0, 6);
      cg.addColorStop(0, '#f7e6c4');
      cg.addColorStop(1, '#d8bd8e');
      ctx.fillStyle = cg;
      roundRect(6, -7, 92, 14, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,120,80,.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 蜡烛头（朝外那端）
      ctx.beginPath();
      ctx.ellipse(98, 0, 6, 7, 0, 0, 6.2832);
      ctx.fillStyle = '#f4e2c0';
      ctx.fill();
      ctx.restore();
      // 火苗 + 光晕
      ctx.save();
      ctx.translate(1064, 486);
      const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 60 * fl);
      gl.addColorStop(0, 'rgba(255,214,140,.5)');
      gl.addColorStop(0.45, 'rgba(255,160,70,.16)');
      gl.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(0, 0, 60 * fl, 0, 6.2832); ctx.fill();
      // 火苗形状
      ctx.beginPath();
      ctx.moveTo(0, -30 * fl);
      ctx.bezierCurveTo(9, -16 * fl, 8, -2, 0, 4);
      ctx.bezierCurveTo(-8, -2, -9, -16 * fl, 0, -30 * fl);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,214,130,.95)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -18 * fl);
      ctx.bezierCurveTo(5, -10 * fl, 4, -2, 0, 1);
      ctx.bezierCurveTo(-4, -2, -5, -10 * fl, 0, -18 * fl);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,235,.95)';
      ctx.fill();
      // 烟
      ctx.strokeStyle = 'rgba(220,215,205,' + (0.14 + 0.08 * Math.sin(t * 2)) + ')';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(2, -32 * fl);
      ctx.bezierCurveTo(16, -58, -12, -74, 6, -104);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (st.tool === 'towel') {
      // 热毛巾：一块叠好的毛巾盖在眼睛上，边上冒热气
      ctx.save();
      roundRect(856, 498, 138, 62, 12);
      const tg = ctx.createLinearGradient(0, 498, 0, 560);
      tg.addColorStop(0, '#fdf8ee');
      tg.addColorStop(1, '#e9ddc6');
      ctx.fillStyle = tg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,160,130,.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 毛巾的织纹（几道褶）
      ctx.strokeStyle = 'rgba(190,172,140,.45)';
      ctx.lineWidth = 2.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(862, 498 + i * 15);
        ctx.quadraticCurveTo(925, 496 + i * 15, 988, 500 + i * 15);
        ctx.stroke();
      }
      // 叠边
      ctx.fillStyle = 'rgba(214,198,168,.7)';
      roundRect(856, 548, 138, 12, 6);
      ctx.fill();
      // 热气
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.55 + i * 0.27) % 1;
        ctx.beginPath();
        ctx.moveTo(880 + i * 30, 486 - k * 6);
        ctx.bezierCurveTo(872 + i * 30, 486 - 22 - k * 22, 894 + i * 30, 486 - 30 - k * 26, 886 + i * 30, 486 - 54 - k * 30);
        ctx.strokeStyle = 'rgba(255,240,220,' + (0.26 * (1 - k)) + ')';
        ctx.lineWidth = 3.4;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (st.tool === 'hand') {
      // 只用手指揉耳廓
      ctx.save();
      ctx.translate(hx - 6, hy);
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, 6.2832);
      ctx.fillStyle = '#f7e3cf';
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,170,150,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.2832); ctx.stroke();
      ctx.restore();
      return;
    }
    if (st.tool === 'tuning') {
      // 音叉：两根叉臂 + 震动弧线
      ctx.save();
      ctx.translate(hx - 10, hy - 6);
      ctx.strokeStyle = '#d9d2c4';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -34 - wob * 1.5);
      ctx.moveTo(0, -34);
      ctx.lineTo(-11, -56);
      ctx.moveTo(0, -34);
      ctx.lineTo(11, -56);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,190,' + (0.25 + 0.25 * Math.abs(wob)) + ')';
      ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(0, -52, 14 + i * 9, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // 耳勺 / 鹅毛棒：一根杆子，尖朝着耳朵
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.06 + wob * 0.05);
    ctx.strokeStyle = '#cfc9bd';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-44, -4);
    ctx.stroke();
    if (st.tool === 'pick') {
      // 银耳勺的小勺头
      ctx.beginPath();
      ctx.ellipse(-50, -5, 9, 5.5, -0.25, 0, 6.2832);
      ctx.fillStyle = '#e6e1d6';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,110,100,.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // 鹅毛：一簇软毛
      for (let i = 0; i < 9; i++) {
        const a = -0.5 + i * 0.12;
        ctx.beginPath();
        ctx.moveTo(-44, -4);
        ctx.quadraticCurveTo(-60 + i * 0.6, -12 - i * 1.2, -74 - Math.sin(t * 3 + i) * 3, -6 - i * 2.4);
        ctx.strokeStyle = 'rgba(255,248,232,.86)';
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 耳朵里的特写
  function inset(st, p) {
    const cx = 1396, cy = 232, R = 152;
    ctx.save();
    // 外圈
    ctx.beginPath();
    ctx.arc(cx, cy, R + 8, 0, 6.2832);
    ctx.fillStyle = 'rgba(20,12,10,.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    const g = ctx.createRadialGradient(cx - 40, cy - 40, 10, cx, cy, R);
    g.addColorStop(0, '#5a3324');
    g.addColorStop(0.55, '#3a2018');
    g.addColorStop(1, '#1d100d');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 2, 0, 6.2832);
    ctx.clip();

    // 耳道（一圈套一圈）
    const scroll = (t * 20) % 26;
    for (let i = 8; i >= 0; i--) {
      const k = i + scroll / 26;
      ctx.beginPath();
      ctx.ellipse(cx + 16, cy + 6, 24 + k * 22, 18 + k * 17, -0.12, 0, 6.2832);
      ctx.strokeStyle = 'rgba(214,150,120,' + (0.06 + 0.035 * i) + ')';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    // 深处的暗
    const rg2 = ctx.createRadialGradient(cx + 30, cy + 6, 4, cx + 30, cy + 6, 80);
    rg2.addColorStop(0, 'rgba(10,5,4,.85)');
    rg2.addColorStop(1, 'rgba(10,5,4,0)');
    ctx.fillStyle = rg2;
    ctx.beginPath(); ctx.arc(cx + 30, cy + 6, 90, 0, 6.2832); ctx.fill();

    // 工具尖
    const wob = Math.sin(t * 12) * (st.tool === 'pick' ? 5 : 2.5);
    ctx.save();
    ctx.translate(cx + 26 + wob, cy + 8 + Math.cos(t * 9) * 6);
    ctx.rotate(-0.32);
    ctx.fillStyle = '#ded8cc';
    roundRect(-120, -6, 120, 12, 6);
    ctx.fill();
    if (st.tool === 'feather') {
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.quadraticCurveTo(-34, -14 - i * 3, -58 - Math.sin(t * 4 + i) * 4, -10 - i * 4);
        ctx.strokeStyle = 'rgba(255,250,240,.8)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    } else if (st.tool === 'pick') {
      ctx.beginPath();
      ctx.ellipse(4, 0, 10, 6, -0.2, 0, 6.2832);
      ctx.fillStyle = '#efeae0';
      ctx.fill();
    }
    ctx.restore();

    // 飘出来的耳垢小碎屑
    for (let i = 0; i < dusts.length; i++) {
      const d = dusts[i];
      // 把世界坐标的 dust 收进圆里画
      const dx = cx + (d.x - 1330) * 0.9, dy = cy - 40 + (d.y - 190) * 0.9;
      if (Math.hypot(dx - cx, dy - cy) > R - 8) continue;
      ctx.beginPath();
      ctx.arc(dx, dy, d.r, 0, 6.2832);
      ctx.fillStyle = 'rgba(214,166,96,' + d.a * 0.9 + ')';
      ctx.fill();
    }

    // 「掏出来啦」那一下
    if (popFx) {
      const k = Math.min(1, popFx.t / 0.9);
      const bx = cx + 20 + k * 90, by = cy - 10 - k * 60;
      ctx.beginPath();
      ctx.arc(bx, by, 9 * (1 - k * 0.4), 0, 6.2832);
      ctx.fillStyle = 'rgba(226,180,110,' + (1 - k) + ')';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 20 + k * 26, 0, 6.2832);
      ctx.strokeStyle = 'rgba(255,235,180,' + (0.7 * (1 - k)) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();

    // 圆环
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,200,140,.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 8, 0, 6.2832);
    ctx.strokeStyle = 'rgba(120,70,40,.7)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 文字
    ctx.font = '600 19px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,220,180,.88)';
    ctx.fillText('耳朵里 · 放大', cx, cy + R + 42);
    ctx.font = '15px ' + FONT;
    ctx.fillStyle = 'rgba(230,190,150,.6)';
    ctx.fillText('棉师傅手上很轻', cx, cy + R + 66);
    ctx.restore();
  }

  function drawParticles() {
    // 心
    for (let i = 0; i < hearts.length; i++) {
      const h = hearts[i];
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);
      ctx.globalAlpha = Math.max(0, h.a) * 0.85;
      ctx.fillStyle = '#ff8ea0';
      ctx.beginPath();
      const r = h.r;
      ctx.moveTo(0, r * 0.75);
      ctx.bezierCurveTo(-r * 1.5, -r * 0.3, -r * 0.55, -r * 1.25, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.55, -r * 1.25, r * 1.5, -r * 0.3, 0, r * 0.75);
      ctx.fill();
      ctx.restore();
    }
    // 音符
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, n.a) * 0.9;
      ctx.fillStyle = '#ffd28a';
      ctx.font = '600 ' + n.s + 'px ' + FONT;
      ctx.fillText(n.ch, n.x, n.y);
      ctx.restore();
    }
    // 星
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.a);
      ctx.translate(s.x, s.y);
      ctx.fillStyle = '#ffe6b0';
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        ctx.lineTo(Math.cos(a) * s.r, Math.sin(a) * s.r);
        ctx.lineTo(Math.cos(a + 0.785) * s.r * 0.3, Math.sin(a + 0.785) * s.r * 0.3);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // 洗耳 / 洗头的水珠
    for (let i = 0; i < drops.length; i++) {
      const w = drops[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, w.a));
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, w.r * 0.78, w.r * 1.4, 0, 0, 6.2832);
      ctx.fillStyle = 'rgba(190,228,246,.92)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w.x - w.r * 0.26, w.y - w.r * 0.42, w.r * 0.32, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fill();
      ctx.restore();
    }
  }

  function vignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ================= 对外 ================= */
  function create(o) {
    opt = o || {};
    sfx = opt.sfx || null;
    return {
      open: function (cb) { openScene(cb); },
      close: close,
      skip: skip,
      restart: restart,
      isOpen: function () { return open; },
      isDone: function () { return finished; },
      // 调试用：直接跳到第 n 秒
      seek: function (sec) {
        if (!open) return;
        t = Math.max(0, Math.min(TOTAL - 0.05, sec));
        const s = stepOfTime(t);
        curStepIdx = -1;
        stepIdx = s.i;
        stepT = s.t;
        enterStep(STEPS[s.i], s.i);
        applyStepText(true);
      },
      debug: function () {
        const out = {
          open: open, t: Math.round(t * 10) / 10, step: STEPS[Math.min(stepIdx, STEPS.length - 1)].key,
          total: TOTAL, done: finished
        };
        Object.keys(AUD.loop).forEach(function (k) {
          out[k] = Math.round((AUD.loop[k] ? AUD.loop[k].volume : 0) * 100);
        });
        out.cleanPaused = AUD.loop.clean ? AUD.loop.clean.paused : null;
        return out;
      }
    };
  }

  return { create: create, STEPS: STEPS, TOTAL: TOTAL };
})();
