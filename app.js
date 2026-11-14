/* 小D的采耳馆 · 手机版（M44）
 *
 * 妈妈 21:00：「等完成了，再建个手游版，我分享给我朋友玩」→ 选的是「链接版」。
 *
 * 这层只做手机外壳：开场 → 横屏 → 放动画 → 结束出「采耳报告」卡片，能截图/保存/分享。
 * 画面本身（十一个小节、canvas 手绘、CC0 音效）全部复用 src/earscene.js，
 * 所以手机版和电脑版永远是同一出戏，只是这里把 UI 缩成手机尺寸、加了触摸按钮。
 */
(function () {
  'use strict';

  var scene = null;
  var started = false;
  var muted = false;
  var finishedTimer = 0;

  /* ---------- 一个极小的合成音源（chime / pop / blip / bubble） ----------
   * earsceene.js 会调 sfx.chime() 这些；电脑版用的是整套 sfx.js（几十条录音），
   * 手机版只要这几个提示音，现场合成最省流量。 */
  var AC = null;
  var sfx = {
    isMuted: function () { return muted; },
    _ac: function () {
      if (!AC) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (C) AC = new C();
      }
      if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
      return AC;
    },
    _beep: function (freq, dur, type, vol, slideTo) {
      if (muted) return;
      var ac = this._ac();
      if (!ac) return;
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, ac.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur + 0.02);
    },
    chime: function () {          // 小钵：「叮——」
      this._beep(880, 1.6, 'sine', 0.1);
      this._beep(1320, 1.2, 'sine', 0.045);
      this._beep(1760, 0.8, 'sine', 0.02);
    },
    pop: function () { this._beep(520, 0.12, 'sine', 0.16, 180); },
    blip: function () { this._beep(660, 0.07, 'triangle', 0.09, 900); },
    bubble: function () { this._beep(300, 0.18, 'sine', 0.1, 620); }
  };

  function $(id) { return document.getElementById(id); }

  // 老一点的微信内核没有 roundRect，补一个
  (function () {
    var proto = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (!proto || proto.roundRect) return;
    proto.roundRect = function (x, y, w, h, r) {
      r = Math.min(r || 0, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  })();

  /* ---------- 手机尺寸的 UI 覆盖（电脑版那套字号是给 1500px 写的） ---------- */
  function injectMobileCss() {
    var css = [
      // 电脑版把 #es-scene 放在 z-index:58（要盖住 HUD）；
      // 手机上它的按钮得浮在上层，所以把这一幕压到 10，让 #bar / #share / #rotate 排在它上面。
      '#es-scene{z-index:10 !important;}',
      '@media (max-height:560px), (max-width:560px){',
      '  #es-scene .es-brand{font-size:14px;left:14px;top:10px;letter-spacing:2px;}',
      '  #es-scene .es-brand small{display:none;}',
      '  #es-scene .es-clock{display:none;}',
      '  #es-scene .es-skip{top:8px;right:10px;font-size:11px;padding:5px 11px;}',
      '  #es-scene .es-foot{padding:0 14px calc(44px + env(safe-area-inset-bottom));',
      '    background:linear-gradient(180deg, rgba(10,7,6,0), rgba(10,7,6,.5) 34%, rgba(10,7,6,.82));}',
      '  #es-scene .es-say{font-size:15px;line-height:1.55;min-height:20px;max-width:94vw;}',
      '  #es-scene .es-think{font-size:12px;margin-top:4px;min-height:16px;}',
      '  #es-scene .es-pills{gap:4px;margin-top:8px;}',
      '  #es-scene .es-pill{font-size:9.5px;padding:3px 7px;letter-spacing:0;}',
      '  #es-scene .es-meter{right:14px;bottom:calc(52px + env(safe-area-inset-bottom));font-size:10px;}',
      '  #es-scene .es-stars{font-size:13px;letter-spacing:3px;}',
      '  #es-scene .es-bar{left:14px;right:14px;bottom:calc(10px + env(safe-area-inset-bottom));}',
      '  #es-scene #es-done .es-card{padding:22px 26px 20px;}',
      '  #es-scene #es-done h2{font-size:24px;}',
      '}'
    ].join('\n');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- 横屏提示 ---------- */
  function isPortrait() {
    return window.innerHeight > window.innerWidth * 1.05;
  }
  function syncRotate() {
    var r = $('rotate');
    if (!r) return;
    var port = started && isPortrait();
    r.classList.toggle('on', port);
    // 竖着的时候把顶部按钮藏起来，别压在"把手机横过来"上面
    var bar = $('bar');
    if (bar) bar.style.visibility = port ? 'hidden' : 'visible';
  }

  /* ---------- 开始 / 重来 ---------- */
  function startShow() {
    if (!scene) {
      scene = XD.EarScene.create({ sfx: sfx });
    }
    started = true;
    $('start').style.display = 'none';
    $('share').classList.remove('on');
    $('bar').classList.add('on');
    syncRotate();
    sfx._ac();                    // 借这次点击把 AudioContext 唤醒
    scene.open(function () { /* 关掉时（起身）啥也不用做 */ });
    watchFinish();
  }

  function watchFinish() {
    clearTimeout(finishedTimer);
    (function poll() {
      if (!scene || !scene.isOpen()) return;
      if (scene.isDone()) {
        // 让"采耳完成"那张金卡片先亮 1.8 秒，再收起来换成手机版报告卡
        setTimeout(function () {
          if (!scene || !scene.isOpen()) return;
          scene.close();
          $('bar').classList.remove('on');
          showShare();
        }, 1800);
        return;
      }
      setTimeout(poll, 400);
    })();
  }

  function showShare() {
    var used = 69;
    try {
      var d = scene && scene.debug ? scene.debug() : null;
      if (d && d.total) used = Math.round(d.t || d.total);
    } catch (e) {}
    $('sUsed').textContent = String(used);
    $('share').classList.add('on');
  }

  /* ---------- 播放中的两个按钮 ---------- */
  function jumpNext() {
    if (!scene || !scene.isOpen()) return;
    var steps = XD.EarScene.STEPS;
    var t = 0;
    try { t = scene.debug().t; } catch (e) {}
    var acc = 0;
    for (var i = 0; i < steps.length; i++) {
      acc += steps[i].d;
      if (acc > t + 0.05) { scene.seek(acc); return; }
    }
  }

  function toggleMute() {
    muted = !muted;
    $('mMute').textContent = muted ? '🔇 静音' : '🔊 声音';
  }

  /* ---------- 报告卡：画成图片，能保存 / 分享 ---------- */
  function buildCard() {
    var W = 820, H = 1180;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    // 底
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1913');
    bg.addColorStop(0.55, '#1b110d');
    bg.addColorStop(1, '#0e0908');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 暖光
    var rg = g.createRadialGradient(W / 2, 240, 40, W / 2, 240, 560);
    rg.addColorStop(0, 'rgba(255,170,90,.28)');
    rg.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // 边框
    g.strokeStyle = 'rgba(255,200,150,.35)';
    g.lineWidth = 3;
    g.strokeRect(26, 26, W - 52, H - 52);

    g.textAlign = 'center';
    g.fillStyle = '#c79a6c';
    g.font = '600 22px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('鲸 耳 堂 · 采 耳 报 告', W / 2, 132);

    g.fillStyle = '#ffd9a0';
    g.font = '600 62px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('耳朵 ✔ 干干净净', W / 2, 246);

    g.fillStyle = '#ffb752';
    g.font = '40px sans-serif';
    g.fillText('★ ★ ★ ★ ★', W / 2, 320);

    // 小鲸鱼 + 猫（简笔）
    g.save();
    g.translate(W / 2, 470);
    // 竹躺椅
    g.fillStyle = '#8b6640';
    g.roundRect(-250, 60, 500, 34, 16);
    g.fill();
    g.fillStyle = '#5c3e28';
    g.fillRect(-240, 92, 14, 60);
    g.fillRect(226, 92, 14, 60);
    // 鲸鱼
    g.beginPath();
    g.ellipse(-40, 20, 190, 62, 0, 0, 6.2832);
    g.fillStyle = '#1c2b47';
    g.fill();
    g.beginPath();
    g.ellipse(-40, 46, 160, 34, 0, 0, 6.2832);
    g.fillStyle = '#f4efe2';
    g.fill();
    // 眼
    g.beginPath();
    g.arc(110, -8, 16, 0, 6.2832);
    g.fillStyle = '#f4efe2';
    g.fill();
    g.strokeStyle = '#10182a';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(112, -6, 10, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    // 尾巴
    g.beginPath();
    g.moveTo(-220, 20);
    g.quadraticCurveTo(-286, -20, -320, -56);
    g.quadraticCurveTo(-280, 34, -300, 62);
    g.quadraticCurveTo(-256, 48, -220, 42);
    g.closePath();
    g.fillStyle = '#141d31';
    g.fill();
    // 猫（先画身子，再画头，不然身子像顶帽子扣在脸上）
    g.fillStyle = '#44507a';
    g.beginPath();
    g.moveTo(198, 108); g.quadraticCurveTo(206, 40, 232, 26);
    g.lineTo(262, 28); g.quadraticCurveTo(284, 52, 292, 108);
    g.closePath(); g.fill();
    g.fillStyle = '#e8e2d4';
    g.beginPath();
    g.moveTo(224, 34); g.lineTo(236, 66); g.lineTo(250, 34);
    g.closePath(); g.fill();
    g.beginPath();
    g.arc(232, -10, 46, 0, 6.2832);
    g.fillStyle = '#f9e8d4';
    g.fill();
    g.beginPath();
    g.moveTo(196, -44); g.lineTo(186, -76); g.lineTo(216, -56); g.closePath();
    g.moveTo(268, -44); g.lineTo(280, -78); g.lineTo(248, -56); g.closePath();
    g.fill();
    g.strokeStyle = '#2a2118';
    g.lineWidth = 4;
    g.beginPath(); g.arc(214, -8, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(250, -8, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.fillStyle = '#e08d8d';
    g.beginPath(); g.moveTo(232, 4); g.lineTo(226, 10); g.lineTo(238, 10); g.closePath(); g.fill();
    g.restore();

    g.fillStyle = '#e6cfb3';
    g.font = '26px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('棉师傅 · 十一个小节', W / 2, 700);
    g.fillStyle = '#c9b193';
    g.font = '21px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('采耳 → 洗耳 → 耳烛 → 洗头 → 热毛巾', W / 2, 744);
    g.fillStyle = '#ffc978';
    g.font = '600 26px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('用时 69 秒 · 收费 ¥0（今晚我请）', W / 2, 800);

    g.fillStyle = 'rgba(255,220,180,.16)';
    g.fillRect(210, 878, W - 420, 2);
    g.fillStyle = 'rgba(240,220,190,.72)';
    g.font = '20px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('采耳师：棉师傅（白猫）　客人：小D 🐋', W / 2, 922);
    g.fillStyle = 'rgba(255,220,180,.55)';
    g.font = '19px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('— 小D 🐋 · 鲸鱼街 39 号楼下 —', W / 2, 1040);
    return c;
  }

  function saveOrShare() {
    var c = buildCard();
    c.toBlob(function (blob) {
      if (!blob) return;
      var file = null;
      try { file = new File([blob], 'xiaod-earspa.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: '小D的采耳馆',
          text: '我刚在鲸耳堂采了个耳，耳朵干干净净 🐋'
        }).catch(function () { download(blob); });
      } else {
        download(blob);
      }
    }, 'image/png');
  }
  function download(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'xiaod-earspa.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1200);
    var t = document.getElementById('sSave');
    if (t) { t.textContent = '已保存小图'; }
  }

  /* ---------- 绑定 ---------- */
  function boot() {
    injectMobileCss();
    $('go').addEventListener('click', startShow);
    $('mNext').addEventListener('click', jumpNext);
    $('mMute').addEventListener('click', toggleMute);
    $('sAgain').addEventListener('click', startShow);
    $('sSave').addEventListener('click', saveOrShare);
    window.addEventListener('resize', syncRotate);
    window.addEventListener('orientationchange', function () { setTimeout(syncRotate, 260); });
    syncRotate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 给截图/自检用的后门
  window.__mob = { buildCard: buildCard, start: startShow, jump: jumpNext, scene: function () { return scene; } };

  // 调试：?auto=1 直接开始、?seek=30 跳到第 30 秒（截图用）
  try {
    var q = new URLSearchParams(location.search);
    if (q.has('auto')) {
      setTimeout(function () {
        startShow();
        var s = parseFloat(q.get('seek') || '0');
        if (s > 0) setTimeout(function () { if (scene && scene.seek) scene.seek(s); }, 900);
      }, 300);
    }
  } catch (e) {}
})();
