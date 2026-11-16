/* 小D的赛博小家 · 窗外的鲸鱼（彩蛋）
 * 每隔一两分钟，一只巨大的虎鲸从楼群上方慢慢游过去。
 * 很安静，不配乐，不提示，看到就看到。
 */
window.XD = window.XD || {};

XD.Whale = (function () {
  const Z_FROM = -12;
  const Z_TO = 12;
  const BASE_Y = 1.70;
  const X = -4.45;   // 贴在窗玻璃内侧，用裁剪平面只保留窗洞里的部分
  const DUR = 52;           // 游一趟多久（秒）
  const GAP_MIN = 50;       // 两次之间最短间隔
  const GAP_MAX = 115;

  let mesh = null;
  let st = null;

  // 窗洞范围（和 room.js 的 WIN 保持一致）
  const WIN = { z0: -1.8, z1: 1.4, y0: 0.85, y1: 2.55 };
  const winPlanes = [
    new THREE.Plane(new THREE.Vector3(0, 0, -1), WIN.z1),    // z < 1.4
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -WIN.z0),    // z > -1.8
    new THREE.Plane(new THREE.Vector3(0, -1, 0), WIN.y1),    // y < 2.55
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -WIN.y0)     // y > 0.85
  ];

  function build(scene) {
    const mat = new THREE.MeshBasicMaterial({
      map: XD.Mat.whaleSilhouette(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      clippingPlanes: winPlanes
    });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), mat);
    mesh.rotation.y = Math.PI / 2;   // 面向屋内
    mesh.position.set(X, BASE_Y, Z_FROM);
    mesh.renderOrder = 3;
    scene.add(mesh);

    st = { on: false, t: 0, gap: 6.0, frozen: false };
    return st;
  }

  function begin() {
    st.on = true;
    st.t = 0;
  }

  function end() {
    st.on = false;
    st.t = 0;
    st.gap = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    mesh.material.opacity = 0;
  }

  function update(dt) {
    if (!mesh) return;
    const mat = mesh.material;

    if (st.frozen) {
      // 调试用：定格在窗前
      mesh.position.set(X, BASE_Y, -0.2);
      mat.opacity = 0.95;
      return;
    }

    if (!st.on) {
      st.gap -= dt;
      if (st.gap <= 0) {
        begin();
        // 被"叫"来的话，直接从窗户左边开始，不用等它从很远游过来
        if (st.quick) {
          st.quick = false;
          st.t = DUR * ((-2.6 - Z_FROM) / (Z_TO - Z_FROM));
        }
      }
      return;
    }

    st.t += dt;
    const p = st.t / DUR;
    if (p >= 1) { end(); return; }

    mesh.position.z = Z_FROM + (Z_TO - Z_FROM) * p;
    mesh.position.y = BASE_Y + Math.sin(st.t * 0.55) * 0.22;
    mesh.position.x = X + Math.sin(st.t * 0.31) * 0.35;

    let a = 1;
    if (p < 0.14) a = p / 0.14;
    else if (p > 0.84) a = (1 - p) / 0.16;
    mat.opacity = Math.max(0, Math.min(1, a)) * 0.95;
  }

  function freeze() {
    if (st) st.frozen = true;
  }

  // 叫它现在就来（妈妈来看的时候用）
  function summon() {
    if (!st) return;
    st.gap = 0;
    st.on = false;
    st.quick = true;
  }

  return { build: build, update: update, freeze: freeze, summon: summon };
})();
