/* 小D的赛博小家 · M14 拍照模式
 * 按 P（或右上角「📷 拍照」）：先把按钮藏起来 → 白闪一下 → 咔嚓 → 存进 D 盘相册
 * 拍完顺手压一张小图挂在照片墙上（照片墙最多挂 4 张，可以一键换回原来那六张）
 */
window.XD = window.XD || {};

XD.Photo = (function () {
  'use strict';

  const LS_KEY = 'xd_home_photos';
  const MAX_LOCAL = 4;      // 墙上最多换几张
  const THUMB_W = 640;      // 挂墙的小图宽度（4:3，跟拍立得对得上）

  let renderer = null, scene = null, camera = null, sfx = null, tip = null;
  let memories = null, interact = null, flashEl = null;
  let shots = 0, apiOk = null, busy = false, albumDir = '';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp() {
    const d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  /* ================= 白闪 ================= */
  function flash(hold) {
    if (!flashEl) return;
    if (hold) {                       // 截图调试用：让白闪停在那儿
      flashEl.style.transition = 'none';
      flashEl.style.opacity = String(typeof hold === 'number' ? hold : 0.9);
      return;
    }
    flashEl.style.transition = 'opacity .04s linear';
    flashEl.style.opacity = '0.92';
    setTimeout(function () {
      flashEl.style.transition = 'opacity .55s ease';
      flashEl.style.opacity = '0';
    }, 60);
  }

  /* ================= 本地相册（挂墙用的小图） ================= */
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const a = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(a)) return [];
      return a.filter(function (s) {
        return typeof s === 'string' && s.indexOf('data:image/') === 0;
      }).slice(0, MAX_LOCAL);
    } catch (e) { return []; }
  }
  function saveLocal(url) {
    if (!url) return;
    const list = loadLocal();
    list.unshift(url);
    while (list.length > MAX_LOCAL) list.pop();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) {
      // 存不下就少存两张，别把整件事搞崩
      try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 2))); } catch (e2) {}
    }
  }
  function clearLocal() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    if (memories && memories.setPhotos) memories.setPhotos([]);
    syncClearBtn(0);
  }
  function syncClearBtn(n) {
    const b = document.getElementById('photoreset');
    if (b) b.style.display = n > 0 ? 'block' : 'none';
  }

  // 截图 → 4:3 小图（居中裁一点，别拉变形）
  function thumb(dataUrl) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        try {
          const W = THUMB_W, H = Math.round(THUMB_W * 0.75);
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          const g = cv.getContext('2d');
          const s = Math.max(W / img.width, H / img.height);
          const dw = img.width * s, dh = img.height * s;
          g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
          resolve(cv.toDataURL('image/jpeg', 0.78));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  /* ================= 存盘 ================= */
  function postShot(name, dataUrl) {
    return fetch('/api/shot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, data: dataUrl })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error('server said no');
      apiOk = true;
      albumDir = j.dir || albumDir;
      return { where: 'album', name: j.file || name };
    });
  }

  function download(dataUrl, name) {
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 500);
    } catch (e) {}
  }

  function afterShot(res, dataUrl) {
    if (res.where === 'album') {
      tip('咔嚓！存进相册啦 ×' + shots + '（小D的赛博小家\\相册）', 3400);
    } else if (res.where === 'memory') {
      // M80：手机上（尤其是朋友打开的网页版）没有存盘接口，照片就挂家里照片墙
      tip('咔嚓！照片挂到小屋的照片墙上了 📷 回家看看', 3400);
    } else {
      tip('咔嚓！照片下到「下载」文件夹了（点一次「进屋.bat」重启一下服务，就能直接存进相册）', 5200);
    }
    thumb(dataUrl).then(function (small) {
      if (!small) return;
      saveLocal(small);
      const list = loadLocal();
      if (memories && memories.setPhotos) memories.setPhotos(list);
      syncClearBtn(list.length);
    });
  }

  /* ================= 拍一张 ================= */
  function shoot(opt) {
    const o = opt || {};
    if (busy || !renderer || !scene || !camera) return false;
    busy = true;
    const hideUi = o.hideUi !== false;
    if (hideUi) document.body.classList.add('shooting');
    if (interact && interact.hideBubbles) interact.hideBubbles();

    setTimeout(function () {
      // 白闪和快门声同时来
      flash(o.holdFlash);
      if (sfx && sfx.snap) { try { sfx.snap(); } catch (e) {} }

      let dataUrl = null;
      try {
        renderer.render(scene, camera);   // 必须同帧取，不然 toDataURL 是黑的
        dataUrl = renderer.domElement.toDataURL('image/png');
      } catch (e) { dataUrl = null; }

      setTimeout(function () {
        if (hideUi) document.body.classList.remove('shooting');
        busy = false;
        if (!dataUrl) {
          tip('拍不出来…画面没取到 🥲 换 Edge/Chrome 再试试', 3200);
          return;
        }
        const name = 'photo-' + stamp() + '.png';
        postShot(name, dataUrl).catch(function () {
          apiOk = false;
          // M80：静态网页（比如发给朋友的网址）没有存盘接口 —— 别在手机上硬跳一个下载，
          // 照片直接挂到小屋的照片墙上。
          if (window.XD && XD.Touch && XD.Touch.active) return { where: 'memory', name: name };
          download(dataUrl, name);
          return { where: 'download', name: name };
        }).then(function (res) {
          shots++;
          afterShot(res, dataUrl);
        });
      }, 280);
    }, hideUi ? 360 : 40);

    return true;
  }

  /* ================= 总装 ================= */
  function build(opt) {
    const o = opt || {};
    renderer = o.renderer; scene = o.scene; camera = o.camera;
    sfx = o.sfx || null;
    tip = o.tip || function () {};
    memories = o.memories || null;
    interact = o.interact || null;
    flashEl = document.getElementById('flash');

    const btn = document.getElementById('photobtn');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); shoot(); });

    const clr = document.getElementById('photoreset');
    if (clr) clr.addEventListener('click', function (e) {
      e.stopPropagation();
      const had = loadLocal().length;
      clearLocal();
      tip(had ? '换回原来那六张照片啦 🐋' : '照片墙本来就是原来的 🐋', 2600);
    });

    // 上次拍的还留在相册里，进来就挂回墙上
    const old = loadLocal();
    if (old.length && memories && memories.setPhotos) memories.setPhotos(old);
    syncClearBtn(old.length);

    return {
      shoot: shoot,
      clear: clearLocal,
      photos: loadLocal,
      debug: function () {
        return { shots: shots, api: apiOk, busy: busy, wall: loadLocal().length, dir: albumDir };
      }
    };
  }

  return { build: build };
})();
