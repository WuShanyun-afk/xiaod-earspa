/* 小D的赛博小家 · 二期 M9 东翼
 * 屋子往东边（右）长出去的那一间：厨房在这儿，浴室（M10）在它的南角。
 * 老房间（M1–M8）不碰；中间那道墙保留，只有原来那扇门能过去。
 * 东翼的南面和东面照旧「切开」，dollhouse 视角能看进去。
 */
window.XD = window.XD || {};

XD.Wing = (function () {
  'use strict';

  // 中间那道墙：x 4.50 ~ 4.68（墙厚 0.18），所以东翼室内从 4.68 开始
  const X0 = 4.68;
  const X1 = 9.10;          // 东边切开的位置
  const Z0 = -3.50, Z1 = 3.50;
  const H = 3.10;
  const T = 0.18;
  const W = X1 - X0;        // 4.42
  const D = Z1 - Z0;        // 7.00
  const CX = (X0 + X1) / 2;

  // 门的洞（跟 room.js 的 DOOR 一致）
  const DOOR = { z0: 0.90, z1: 1.95, y1: 2.15 };

  /* 走路的边界：老房间 + 东翼 + 浴室（浴室西墙上有门，浴缸/马桶/洗手台绕过去）
   * M24 起还能走到南面的阳台：阳台那片"长在外面"的地块由 balcony.js 注入 */
  const DOOR_WALK = { z0: 1.02, z1: 1.83 };          // 中间那道墙的门

  const HOME = { x0: -4.10, x1: 8.72, z0: -3.10, z1: 3.28 };
  const AREAS = [];        // 家外面合法能站的矩形（阳台 / 以后的天台、花房）
  const BLOCKERS2 = [];    // 那些地方上的家具

  function inside(r, x, z) {
    return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  }
  function allowed(x, z) {
    if (inside(HOME, x, z)) return true;
    for (var i = 0; i < AREAS.length; i++) if (inside(AREAS[i], x, z)) return true;
    return false;
  }

  // 墙：axis 是"法线方向"，at 是墙的位置，gap 是能穿过的口子
  const WALLS = [
    { axis: 'x', at: 4.59, gap: [DOOR_WALK.z0, DOOR_WALK.z1] },      // 老房间 ↔ 东翼
    { axis: 'z', at: 1.35, span: [6.60, 9.10] },                     // 浴室北墙（没有门）
    { axis: 'x', at: 6.65, gap: [2.34, 2.90], span: [1.30, 3.50] }   // 浴室西墙（门在 z 2.30~2.95）
  ];

  // 块状的家具：不能穿过去
  const BLOCKERS = [
    // M53：厨房的台面 / 冰箱也有实体了 —— 以前能一头钻进柜子里，
    // 现在走到台面前（z=-2.84）就停住，人站在灶台和冰箱"前面"点到它们
    { x0: 4.72, x1: 8.13, z0: -3.50, z1: -2.84 },  // 厨房台面（水槽 + 双灶那一长条）
    { x0: 8.24, x1: 8.98, z0: -3.44, z1: -2.70 },  // 冰箱
    { x0: 8.58, x1: 9.10, z0: -2.34, z1: 0.32 },   // M55：东墙备菜台（菜板那一条）
    { x0: 6.72, x1: 7.58, z0: 1.38, z1: 1.98 },   // 洗手台
    { x0: 7.76, x1: 8.24, z0: 1.38, z1: 2.14 },   // 马桶
    { x0: 8.24, x1: 9.08, z0: 1.43, z1: 3.32 }    // 浴缸
  ];

  function pushOut(x, z, r, oldX, oldZ) {
    if (!(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) return null;
    // 从哪个方向进来的，就往回推哪个方向
    if (oldX <= r.x0) return { x: r.x0 - 0.02, z: z };
    if (oldX >= r.x1) return { x: r.x1 + 0.02, z: z };
    if (oldZ <= r.z0) return { x: x, z: r.z0 - 0.02 };
    if (oldZ >= r.z1) return { x: x, z: r.z1 + 0.02 };
    // 兜底：往最近的一边推
    const d = [x - r.x0, r.x1 - x, z - r.z0, r.z1 - z];
    const m = Math.min(d[0], d[1], d[2], d[3]);
    if (m === d[0]) return { x: r.x0 - 0.02, z: z };
    if (m === d[1]) return { x: r.x1 + 0.02, z: z };
    if (m === d[2]) return { x: x, z: r.z0 - 0.02 };
    return { x: x, z: r.z1 + 0.02 };
  }

  function clamp(x, z, oldX, oldZ) {
    if (oldZ === undefined) { oldZ = z; oldX = x; }
    // 先粗夹一下，别让极端坐标把墙判定搞乱
    x = Math.max(-5.0, Math.min(13.5, x));
    z = Math.max(-3.6, Math.min(6.2, z));

    // 墙：只在"这一步跨过了墙面"时判定
    for (let i = 0; i < WALLS.length; i++) {
      const w = WALLS[i];
      if (w.axis === 'x') {
        const a = oldX - w.at, b = x - w.at;
        if (a * b < 0) {
          const t = (w.at - oldX) / (x - oldX);
          const zi = oldZ + (z - oldZ) * t;
          if (w.span && (zi < w.span[0] || zi > w.span[1])) continue;
          if (!(zi > w.gap[0] && zi < w.gap[1])) x = oldX;
        }
      } else {
        const a = oldZ - w.at, b = z - w.at;
        if (a * b < 0) {
          const t = (w.at - oldZ) / (z - oldZ);
          const xi = oldX + (x - oldX) * t;
          if (w.span && (xi < w.span[0] || xi > w.span[1])) continue;
          if (!(xi > w.gap[0] && xi < w.gap[1])) z = oldZ;
        }
      }
    }

    // 家具
    for (let i = 0; i < BLOCKERS.length; i++) {
      const r = pushOut(x, z, BLOCKERS[i], oldX, oldZ);
      if (r) { x = r.x; z = r.z; }
    }
    for (let k = 0; k < BLOCKERS2.length; k++) {
      const r2 = pushOut(x, z, BLOCKERS2[k], oldX, oldZ);
      if (r2) { x = r2.x; z = r2.z; }
    }

    // 能站的地方（家 + 阳台）：撞墙就贴着滑，别整只卡死
    if (!allowed(x, z)) {
      if (allowed(x, oldZ)) z = oldZ;
      else if (allowed(oldX, z)) x = oldX;
      else if (allowed(oldX, oldZ)) { x = oldX; z = oldZ; }
      else {
        x = Math.max(HOME.x0, Math.min(HOME.x1, x));
        z = Math.max(HOME.z0, Math.min(HOME.z1, z));
      }
    }

    return { x: x, z: z };
  }

  function mesh(geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function box(w, h, d, x, y, z, mat, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }

  function build(scene) {
    const root = new THREE.Group();
    root.name = 'wing-m9';

    /* ---------- 材质（跟老房间一套） ---------- */
    const floorMat = new THREE.MeshStandardMaterial({
      map: XD.Mat.woodFloor([W * 0.378, D * 0.371]),
      roughness: 0.50,
      metalness: 0.03
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      map: XD.Mat.ceiling([1.1, 1.8]),
      roughness: 1.0,
      color: 0xfaf4ea
    });

    const wallBaseTex = XD.Mat.wall();
    function wallMat(w, h) {
      const t = wallBaseTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, w * 0.45), Math.max(1, h * 0.45));
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.94, metalness: 0, color: 0xfdf3e6 });
    }
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9b39a, roughness: 0.7 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xece2d2, roughness: 0.72 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.6 });

    /* ---------- 地板 ---------- */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(CX, 0, 0);
    floor.receiveShadow = true;
    root.add(floor);

    /* ---------- 天花板（法线朝下，俯视时自动剔除） ---------- */
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(CX, H, 0);
    root.add(ceil);

    /* ---------- 北墙（后墙延长） ---------- */
    const northW = X1 - 4.50;
    root.add(box(northW, H, T, (4.50 + X1) / 2, H / 2, Z0 - T / 2, wallMat(northW, H)));

    /* ---------- 东墙（M26：给玻璃花房留一道门，z 0.58~1.28） ---------- */
    const GD = { z0: 0.58, z1: 1.28, y1: 2.05 };
    root.add(box(T, H, GD.z0 - Z0, X1 + T / 2, H / 2, (Z0 + GD.z0) / 2, wallMat(GD.z0 - Z0, H)));
    root.add(box(T, H, Z1 - GD.z1, X1 + T / 2, H / 2, (GD.z1 + Z1) / 2, wallMat(Z1 - GD.z1, H)));
    root.add(box(T, H - GD.y1, GD.z1 - GD.z0, X1 + T / 2, (H + GD.y1) / 2, (GD.z0 + GD.z1) / 2, wallMat(GD.z1 - GD.z0, H - GD.y1)));
    // 东墙踢脚线（门洞断开）+ 门套
    root.add(box(0.03, 0.10, GD.z0 - Z0, X1 - 0.015, 0.05, (Z0 + GD.z0) / 2, trimMat));
    root.add(box(0.03, 0.10, Z1 - GD.z1, X1 - 0.015, 0.05, (GD.z1 + Z1) / 2, trimMat));
    root.add(box(0.05, GD.y1 + 0.04, 0.06, X1 + 0.02, (GD.y1 + 0.04) / 2, GD.z0 - 0.03, frameMat));
    root.add(box(0.05, GD.y1 + 0.04, 0.06, X1 + 0.02, (GD.y1 + 0.04) / 2, GD.z1 + 0.03, frameMat));
    root.add(box(0.05, 0.06, GD.z1 - GD.z0 + 0.12, X1 + 0.02, GD.y1 + 0.02, (GD.z0 + GD.z1) / 2, frameMat));

    /* ---------- 护墙板（贴着中间那道墙的东面，跟老房间一个调子） ---------- */
    const wainBaseTex = XD.Mat.wainscot();
    function wainMat(len) {
      const t = wainBaseTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, len / 2.2), 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0 });
    }
    const waistMat = new THREE.MeshStandardMaterial({ color: 0xe8dbc4, roughness: 0.66 });
    const WH = 0.85, WT = 0.03, chz = 0.06, cht = 0.05;
    const faceX = X0 + WT / 2;      // 4.695

    // 门洞两侧各一段
    const segs = [
      { len: DOOR.z0 - Z0, cz: (Z0 + DOOR.z0) / 2 },      // -3.5 ~ 0.9
      { len: Z1 - DOOR.z1, cz: (DOOR.z1 + Z1) / 2 }        // 1.95 ~ 3.5
    ];
    segs.forEach(function (s) {
      root.add(box(WT, WH, s.len, faceX, WH / 2, s.cz, wainMat(s.len)));
      root.add(box(cht, chz, s.len, X0 + cht / 2, WH + chz / 2, s.cz, waistMat));
      // 踢脚线
      root.add(box(0.03, 0.10, s.len, X0 + 0.015, 0.05, s.cz, trimMat));
    });

    // 北墙的踢脚线
    root.add(box(W, 0.10, 0.03, CX, 0.05, Z0 + 0.015, trimMat));

    /* ---------- 门的门套（东翼这一侧） ---------- */
    root.add(box(0.05, DOOR.y1 + 0.05, 0.06, X0 + 0.025, (DOOR.y1 + 0.05) / 2, DOOR.z0 - 0.03, frameMat));
    root.add(box(0.05, DOOR.y1 + 0.05, 0.06, X0 + 0.025, (DOOR.y1 + 0.05) / 2, DOOR.z1 + 0.03, frameMat));
    root.add(box(0.05, 0.06, DOOR.z1 - DOOR.z0 + 0.12, X0 + 0.025, DOOR.y1 + 0.02, (DOOR.z0 + DOOR.z1) / 2, frameMat));
    // 门槛
    root.add(box(T + 0.06, 0.022, DOOR.z1 - DOOR.z0, 4.59, 0.011, (DOOR.z0 + DOOR.z1) / 2, darkWoodMat));

    /* ---------- 过道的小吸顶灯 ---------- */
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.6 });
    const lampPos = { x: 5.45, y: H - 0.06, z: 2.35 };
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 24), plateMat);
    plate.position.set(lampPos.x, lampPos.y, lampPos.z);
    root.add(plate);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0 });
    glowMat.color.convertSRGBToLinear();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
      glowMat
    );
    dome.position.set(lampPos.x, lampPos.y - 0.02, lampPos.z);
    dome.rotation.x = Math.PI;
    root.add(dome);
    const lampLight = new THREE.PointLight(0xffd9a8, 0.72, 5.6, 2);
    lampLight.position.set(lampPos.x, lampPos.y - 0.18, lampPos.z);
    lampLight.userData.base = 0.72;
    root.add(lampLight);

    scene.add(root);

    return {
      root: root,
      clamp: clamp,
      addArea: function (rect) { AREAS.push(rect); },        // M24：给阳台这种"长在外面"的地块用
      addBlocker: function (r) { BLOCKERS2.push(r); },
      lights: [lampLight],
      bounds: { X0: X0, X1: X1, Z0: Z0, Z1: Z1, H: H },
      // M51：把墙和家具的碰撞数据也交出去（main.js 会转成 AABB 交给 interact 做兜底）
      walls: WALLS,
      blockers: BLOCKERS,
      door: DOOR,
      lampLight: lampLight
    };
  }

  return { build: build };
})();
