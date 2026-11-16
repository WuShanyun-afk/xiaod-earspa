/* 小D的赛博小家 · 材质降档（M65）
 * ------------------------------------------------------------------
 * 妈妈：「我玩鲸鱼小镇的时候有点卡，是不是浏览器带不动啊」
 *
 * 实测（真 GPU，1920×1200，dpr 0.85）：
 *   街道场景 1256 个 draw call、6503 个 MeshStandardMaterial（PBR 材质），只有 25 fps。
 *   把「纯色 / 粗糙 / 不透明 / 没贴图 / 不反光」的那 2700 个换成 MeshPhongMaterial，
 *   立刻 45 fps，截图对比几乎看不出差别（Phong 一样有高光，只是不算 PBR 那一套）。
 *
 * 所以只换真正"平"的材质：带贴图 / 法线 / 金属感 / 半透明 / 玻璃 一律不碰。
 * 换掉的老材质会变成新材质的「遥控器」：别处代码照样 mat.color.setHex()、
 * mat.opacity = .5，改的是同一个东西，不会出现"改了颜色不变"的幽灵 bug。
 */
window.XD = window.XD || {};

XD.PerfMat = (function () {
  'use strict';

  var OFF = /[?&]mat=(off|std|0)\b/.test(location.search);
  var made = new Map();          // 老材质 uuid -> 新 Phong
  var stats = { converted: 0, kept: 0, sweeps: 0 };

  /* 是不是"平"材质：换掉也不会看出来 */
  function flat(m) {
    if (!m || !m.isMeshStandardMaterial) return false;
    if (m.isMeshPhysicalMaterial) return false;          // 玻璃 / 透射
    if (m.map || m.normalMap || m.aoMap || m.lightMap || m.bumpMap || m.envMap ||
      m.roughnessMap || m.metalnessMap || m.alphaMap || m.displacementMap || m.emissiveMap) return false;
    if (m.metalness > 0.2) return false;                 // 金属：留着 PBR
    if (m.roughness < 0.45) return false;                // 很光滑：留着 PBR（有反射变化）
    if (m.transparent && m.opacity < 0.995) return false; // 半透明：留着
    if (m.clippingPlanes && m.clippingPlanes.length) return false;
    return true;
  }

  /* 让老材质变成新材质的"遥控器"：读写都转给新的那一个 */
  function bind(old, neu) {
    ['color', 'emissive', 'emissiveIntensity', 'opacity', 'map', 'transparent', 'side', 'visible', 'clippingPlanes'].forEach(function (k) {
      try {
        Object.defineProperty(old, k, {
          configurable: true, enumerable: true,
          get: function () { return neu[k]; },
          set: function (v) { neu[k] = v; }
        });
      } catch (e) {}
    });
    old.__perfMat = neu;
  }

  function make(m) {
    var hit = made.get(m.uuid);
    if (hit) return hit;
    var rough = (m.roughness == null) ? 1 : m.roughness;
    var P = new THREE.MeshPhongMaterial({
      color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity: m.emissiveIntensity,
      specular: new THREE.Color(0.05, 0.05, 0.05),
      shininess: Math.max(2, Math.round(40 - 34 * rough)),
      flatShading: !!m.flatShading,
      side: m.side,
      transparent: !!m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      depthWrite: m.depthWrite,
      depthTest: m.depthTest,
      vertexColors: !!m.vertexColors,
      fog: m.fog,
      toneMapped: m.toneMapped
    });
    P.name = m.name;
    P.userData = m.userData;
    made.set(m.uuid, P);
    bind(m, P);
    stats.converted++;
    return P;
  }

  /* 扫一遍场景，把符合条件的材质换掉。root 可以只扫一个房间 */
  function sweep(scene, root) {
    if (OFF || !scene) return 0;
    var n = 0;
    (root || scene).traverse(function (o) {
      if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return;
      var m = o.material;
      if (!m) return;
      if (Array.isArray(m)) {
        var changed = false;
        var arr = [];
        for (var i = 0; i < m.length; i++) {
          if (flat(m[i])) { arr.push(make(m[i])); changed = true; }
          else { arr.push(m[i]); stats.kept++; }
        }
        if (changed) o.material = arr;
        return;
      }
      if (flat(m)) { o.material = make(m); n++; }
    });
    stats.sweeps++;
    return n;
  }

  function debug() {
    return { off: OFF, converted: stats.converted, kept: stats.kept, sweeps: stats.sweeps };
  }

  return { sweep: sweep, debug: debug, isOff: function () { return OFF; } };
})();
