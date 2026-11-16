/* 小D的赛博小家 · 灯光预算（M65）
 * ------------------------------------------------------------------
 * 妈妈「玩鲸鱼小镇的时候有点卡」—— 实测根因（不是多边形，是灯）：
 *   街道场景 tris 只有 5.7 万，dpr 已经自动降到 0.85，还是只有 34 fps；
 *   把 69 盏点光源全关掉 → 立刻 53.6 fps；只关阴影 → 33 fps（没用）。
 * 也就是说，卡在「每个像素都要循环 69 盏点光源」这件事上。
 *
 * 但小镇上真正照到镜头周围的，一次不会超过七八盏。所以：
 *   1. 把所有点光源从渲染里「摘出去」（layers 换通道，不进 shader；
 *      不动 visible / intensity，所以别的模块照常调它们）；
 *   2. 再造 MAX 盏「代理灯」，每 0.22 秒把离镜头最近、最亮的几盏的属性抄过来。
 *
 * 关键：代理灯数量恒定 —— shader 永远按 MAX 盏编译，不会因为灯数变化
 * 反复重编译（那种卡顿比灯本身还明显）。
 */
window.XD = window.XD || {};

XD.LightBudget = (function () {
  'use strict';

  var MAX = 8;            // 代理灯槽位数（也是 shader 里的 numPointLights）
  var PICK_EVERY = 0.22;  // 多久重新挑一次
  var HYST = 0.12;        // 滞回：新灯要比最弱的那盏亮 12% 才顶替，免得来回抖

  var scene = null, camera = null, camPos = null;
  var real = [];          // 逻辑灯（真的被别的模块拿着用）
  var slots = [];         // 代理灯（真的进 shader）
  var order = [];         // 排好序的候选
  var top = [];           // 当前被代理的灯
  var on = false;
  var enabled = true;
  var pickT = 0, scanT = 0, stat = { real: 0, picked: 0, scans: 0 };

  var _p = new THREE.Vector3();
  var _c = new THREE.Color();

  /* 灯是不是"真的在亮"：自己 visible，且一路上的父级都 visible */
  function lit(l) {
    var o = l;
    while (o) {
      if (o.visible === false) return false;
      o = o.parent;
    }
    return l.intensity > 0.002;
  }

  /* 记住一盏灯，并把它从渲染里摘掉（layers 换到 1，相机只看 0） */
  function adopt(l) {
    if (!l || !l.isPointLight || l.userData.__lbSlot) return;
    if (l.castShadow) return;            // 投影的点光只有 1 盏，留着不管
    if (l.userData.__lbAdopted) return;
    l.userData.__lbAdopted = true;
    l.userData.__lbLayer = l.layers.mask;
    try { l.layers.set(1); } catch (e) {}
    real.push(l);
  }

  function scan() {
    if (!scene) return;
    scanT = 0;
    stat.scans++;
    scene.traverse(function (o) { if (o.isPointLight) adopt(o); });
    stat.real = real.length;
  }

  function pick() {
    var cp = camPos || (camera && camera.position);
    if (!cp) return;
    // 相机位置（不是灯的位置）决定"哪几盏看得见"
    var cx = cp.x, cy = cp.y, cz = cp.z;
    order.length = 0;
    for (var i = 0; i < real.length; i++) {
      var l = real[i];
      if (!lit(l)) continue;
      l.getWorldPosition(_p);
      var dx = _p.x - cx, dy = _p.y - cy, dz = _p.z - cz;
      var d2 = dx * dx + dy * dy + dz * dz;
      var R = l.distance > 0.01 ? l.distance : 14;   // distance=0 表示不衰减，按 14 算
      // 影响权重：亮度 / (1 + (d/R)^2)。远远的、暗暗的灯自然排在后面
      var w = l.intensity / (1 + d2 / (R * R));
      order.push({ l: l, w: w, d2: d2 });
    }
    order.sort(function (a, b) { return b.w - a.w; });

    var want = [];
    for (var k = 0; k < order.length && want.length < MAX; k++) want.push(order[k]);

    // 滞回：上一轮还在里面的灯，只要不是弱太多就保留，避免明暗抖动
    if (top.length) {
      var keep = [];
      for (var a = 0; a < top.length; a++) {
        var t = top[a], found = null;
        for (var b = 0; b < order.length; b++) { if (order[b].l === t.l) { found = order[b]; break; } }
        if (!found) continue;
        keep.push(found);
      }
      // 只有当新来的明显更亮、且总数超过 MAX 时，才把最弱的换掉
      if (keep.length === MAX && want.length === MAX) {
        var weakest = keep[keep.length - 1];
        var bestNew = null;
        for (var c = 0; c < want.length; c++) {
          var inKeep = false;
          for (var d = 0; d < keep.length; d++) { if (keep[d].l === want[c].l) { inKeep = true; break; } }
          if (!inKeep) { bestNew = want[c]; break; }
        }
        if (bestNew && bestNew.w > weakest.w * (1 + HYST)) {
          keep.pop();
          keep.push(bestNew);
          keep.sort(function (x, y) { return y.w - x.w; });
        }
        want = keep;
      }
    }
    top = want;
    stat.picked = top.length;
  }

  function sync() {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (i >= top.length) {
        if (s.intensity !== 0) s.intensity = 0;
        continue;
      }
      var it = top[i];
      var l = it.l;
      l.getWorldPosition(_p);
      if (s.position.x !== _p.x || s.position.y !== _p.y || s.position.z !== _p.z) s.position.copy(_p);
      if (s.intensity !== l.intensity) s.intensity = l.intensity;
      if (s.distance !== l.distance) s.distance = l.distance;
      if (s.decay !== l.decay) s.decay = l.decay;
      if (s.color.getHex() !== l.color.getHex()) s.color.copy(l.color);
    }
  }

  function init(sc, cam, opt) {
    if (on) return;
    scene = sc; camera = cam;
    MAX = (opt && opt.max) || 8;
    if (opt && opt.off) { enabled = false; return; }

    scan();
    for (var i = 0; i < MAX; i++) {
      var p = new THREE.PointLight(0xffffff, 0, 1, 2);
      p.name = '__lb_slot' + i;
      p.userData.__lbSlot = true;
      p.position.set(0, -600 - i, 0);      // 先藏到地底下
      scene.add(p);
      slots.push(p);
    }
    on = true;
  }

  function update(dt, cam) {
    if (!on || !enabled) return;
    if (cam) camPos = cam;
    // 场景会陆续长出新灯（房间是分批建好的），每秒补扫一次
    scanT += dt;
    if (scanT > 1.0) scan();
    pickT += dt;
    if (pickT >= PICK_EVERY) { pickT = 0; pick(); }
    sync();
  }

  /* 临时全开 / 全关（截图对比用）：关掉 = 把摘出去的灯还回渲染 */
  function setEnabled(v) {
    enabled = !!v;
    for (var i = 0; i < real.length; i++) {
      try {
        if (enabled) real[i].layers.set(1);                       // 通道 1：相机看不见
        else real[i].layers.mask = real[i].userData.__lbLayer || 1; // 还回原来的通道
      } catch (e) {}
    }
    for (var k = 0; k < slots.length; k++) slots[k].visible = enabled;
  }

  function debug() {
    return {
      on: on, enabled: enabled, max: MAX, real: real.length,
      picked: top.length,
      names: top.map(function (t) {
        var n = t.l.name || '';
        return (n || '?') + '@' + Math.round(Math.sqrt(t.d2) * 10) / 10;
      })
    };
  }

  return { init: init, update: update, scan: scan, debug: debug, setEnabled: setEnabled };
})();
