/* ============================================================
   M18 便利店真商品 —— Kenney Food Kit（CC0 公共领域）Glb 模型
   用法：
     GOODS.place(parent, 'bread', x, y, z, 0.26)
     - parent：要挂进去的组
     - 第 2 个参数是模型文件名（不带 .glb）
     - x/y/z 是位置，y 是"底面"的高度（模型会自动坐上去）
     - 最后一个是最大边的尺寸（米），会自动等比缩放
   模型是异步加载的，加载完才出现；失败的就不出现（不报错、不崩）。
   ============================================================ */
window.GOODS = (function () {
  'use strict';

  var BASE = 'assets/food-kit/';
  var loader = null;
  var cache = {};        // name -> gltf
  var fails = {};
  var count = { req: 0, ok: 0, fail: 0 };

  function getLoader() {
    if (!loader) loader = new THREE.GLTFLoader();
    return loader;
  }

  // 统一改材质：投影 + 不要太亮/太暗
  function dress(obj) {
    obj.traverse(function (n) {
      if (!n.isMesh) return;
      n.castShadow = true;
      n.receiveShadow = false;
      var m = n.material;
      if (m && m.isMeshStandardMaterial) {
        m.roughness = Math.min(1, (m.roughness === undefined ? 0.7 : m.roughness) + 0.1);
        m.metalness = Math.max(0, (m.metalness === undefined ? 0 : m.metalness) - 0.1);
      }
    });
  }

  // 把模型缩放到 size 那么大，底面落在 y 上，中心对齐 x/z
  function fit(obj, x, y, z, size) {
    var bb = new THREE.Box3().setFromObject(obj);
    var d = new THREE.Vector3();
    bb.getSize(d);
    var big = Math.max(d.x, d.y, d.z);
    if (!isFinite(big) || big <= 0) big = 1;
    obj.scale.setScalar(size / big);

    var bb2 = new THREE.Box3().setFromObject(obj);
    var c = new THREE.Vector3();
    bb2.getCenter(c);
    obj.position.set(
      x - c.x,
      y - bb2.min.y,
      z - c.z
    );
  }

  function place(parent, name, x, y, z, size, opt) {
    if (!parent || !name) return null;
    opt = opt || {};
    count.req++;

    // 先放一个空的占位组，模型到位后往里塞（这样后面想动位置也能动）
    var holder = new THREE.Group();
    holder.name = 'good-' + name;
    parent.add(holder);

    function put(g) {
      var o = g.scene.clone(true);
      dress(o);
      if (opt.rotY) o.rotation.y = opt.rotY;
      if (opt.rotX) o.rotation.x = opt.rotX;
      if (opt.rotZ) o.rotation.z = opt.rotZ;
      fit(o, x, y, z, size);
      holder.add(o);
      count.ok++;
    }

    if (cache[name]) {
      put(cache[name]);
    } else if (!fails[name]) {
      getLoader().load(
        BASE + name + '.glb',
        function (g) {
          cache[name] = g;
          put(g);
        },
        undefined,
        function () {
          fails[name] = true;
          count.fail++;
        }
      );
    }
    return holder;
  }

  return {
    place: place,
    fit: fit,
    stats: function () {
      return { req: count.req, ok: count.ok, fail: count.fail, cached: Object.keys(cache).length };
    },
    names: function () { return Object.keys(cache); }
  };
})();
