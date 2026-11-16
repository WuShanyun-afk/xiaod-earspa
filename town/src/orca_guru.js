/* 小D的赛博小家 · 自建胖虎鲸
 * 不用外部模型，全部代码生成：
 *   身体 = 球体顶点变形（中段最胖、尾柄收细、背略平腹更鼓）
 *   背鳍/尾鳍/胸鳍 = 圆角挤出片
 *   黑背白肚 = 顶点色渐变
 *   眼睛 = 白眼斑 + 大眼珠 + 高光点 + 腮红
 * 坐标：头朝 +z，尾朝 -z，背朝 +y。
 */
window.XD = window.XD || {};

XD.OrcaGuru = (function () {

  const COL = {
    back: new THREE.Color(0x16223c),
    belly: new THREE.Color(0xf6f8fc),
    fin: new THREE.Color(0x141f36),
    blush: new THREE.Color(0xf7a8b8),
    eye: new THREE.Color(0x0d1524)
  };

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* ---------- 身体 ---------- */
  function makeBody() {
    const geo = new THREE.SphereGeometry(1, 72, 52);
    const p = geo.attributes.position;
    const count = p.count;

    // 半径参数
    const SX = 0.285;
    const SY = 0.335;
    const SZ = 0.615;

    const colors = new Float32Array(count * 3);
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);  // 单位球
      const t = uz;                                          // -1 尾 .. +1 头

      // 尾柄收细
      let taper = 1;
      if (t < -0.20) {
        const k = (-t - 0.20) / 0.80;
        taper = 1 - 0.70 * Math.pow(k, 1.22);
      }

      // 吻部略收（但保留圆钝）
      let snout = 1;
      if (t > 0.60) {
        const k = (t - 0.60) / 0.40;
        snout = 1 - 0.16 * k * k;
      }

      // 中段最胖
      const bulge = 1 + 0.14 * Math.cos(t * 1.85);

      let nx = ux * SX * taper * snout * bulge;
      let ny = uy * SY * taper * snout * bulge;
      const nz = uz * SZ;

      // 背略平、腹更鼓
      if (ny >= 0) ny *= 0.93;
      else ny *= 1.08;

      // 头部稍微抬一点（鲸鱼游起来的姿态）
      const lift = 0.02 * smoothstep(-0.2, 0.9, t);
      p.setXYZ(i, nx, ny + lift, nz);

      // 顶点色：黑背 → 白肚
      const w = smoothstep(0.04, -0.20, ny);   // ny 越小越白
      // 尾部不白
      const tailFade = smoothstep(-0.74, -0.40, t);
      const bellyW = w * (0.35 + 0.65 * tailFade);
      tmp.copy(COL.back).lerp(COL.belly, bellyW);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------- 圆角挤出片（鳍） ---------- */
  function finGeometry(points, depth) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      shape.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    }
    const last = points[points.length - 1];
    shape.quadraticCurveTo(last[0], last[1], points[0][0], points[0][1]);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: true,
      bevelSize: depth * 0.45,
      bevelThickness: depth * 0.45,
      bevelSegments: 2,
      curveSegments: 6
    });
    geo.center();
    return geo;
  }

  /* ---------- 组装 ---------- */
  function create(opts) {
    opts = opts || {};
    const scale = opts.scale || 0.92;      // 体长（含尾巴大约 = 2*0.52*scale + 鳍）
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.02
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: COL.fin, roughness: 0.8, metalness: 0.02
    });

    // 身体
    const body = new THREE.Mesh(makeBody(), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // 背鳍（圆角三角，微微后倾）
    const dorsal = new THREE.Mesh(
      finGeometry([
        [-0.085, 0],
        [-0.055, 0.115],
        [-0.012, 0.185],
        [0.035, 0.20],
        [0.062, 0.115],
        [0.075, 0]
      ], 0.035),
      finMat
    );
    dorsal.position.set(0, 0.330, 0.010);
    dorsal.scale.set(1.75, 1.75, 1.35);
    dorsal.rotation.x = -0.22;
    dorsal.castShadow = true;
    g.add(dorsal);

    // 尾鳍（两片圆叶，横向展开）
    [-1, 1].forEach(function (s) {
      const fluke = new THREE.Mesh(
        finGeometry([
          [0, 0],
          [0.085, -0.035],
          [0.155, -0.02],
          [0.175, 0.03],
          [0.115, 0.075],
          [0.035, 0.05]
        ], 0.022),
        finMat
      );
      fluke.position.set(s * 0.075, 0.005, -0.598);
      fluke.rotation.set(Math.PI / 2, 0, s * 0.32);
      fluke.scale.x = s;
      fluke.castShadow = true;
      g.add(fluke);
    });

    // 胸鳍（两片，贴在身体两侧偏前下）
    [-1, 1].forEach(function (s) {
      const pec = new THREE.Mesh(
        finGeometry([
          [0, 0],
          [0.075, -0.03],
          [0.135, -0.065],
          [0.10, 0.015],
          [0.03, 0.04]
        ], 0.02),
        finMat
      );
      pec.position.set(s * 0.226, -0.118, 0.145);
      pec.rotation.set(0.35, 0, s * 0.85);
      pec.scale.x = s;
      pec.castShadow = true;
      g.add(pec);
    });

    // 眼睛：白眼斑 + 黑眼珠 + 高光 + 腮红
    const patchMat = new THREE.MeshStandardMaterial({ color: COL.belly, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: COL.eye, roughness: 0.28 });
    const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blushMat = new THREE.MeshBasicMaterial({
      color: COL.blush, transparent: true, opacity: 0.75
    });

    [-1, 1].forEach(function (s) {
      // 眼斑（斜放的扁椭圆）
      const patch = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), patchMat);
      patch.scale.set(0.078, 0.052, 0.024);
      patch.position.set(s * 0.200, 0.128, 0.348);
      patch.rotation.set(-0.15, s * 0.5, s * -0.22);
      g.add(patch);

      // 眼珠（大，Q 版）
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), eyeMat);
      eye.scale.set(0.046, 0.050, 0.030);
      eye.position.set(s * 0.209, 0.120, 0.374);
      g.add(eye);

      // 高光
      const hi = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), hiMat);
      hi.scale.set(0.015, 0.016, 0.009);
      hi.position.set(s * 0.223, 0.138, 0.394);
      g.add(hi);

      // 腮红
      const blush = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), blushMat);
      blush.scale.set(0.046, 0.030, 0.013);
      blush.position.set(s * 0.208, 0.055, 0.360);
      blush.rotation.set(0, s * 0.5, 0);
      g.add(blush);
    });

    // 嘴：一条小小的弧
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.0075, 6, 20, Math.PI * 0.85),
      new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.6 })
    );
    mouth.position.set(0, -0.115, 0.492);
    mouth.rotation.set(Math.PI, 0, 0);
    mouth.rotation.z = Math.PI * 0.075;
    g.add(mouth);

    g.scale.setScalar(scale);
    return g;
  }

  return { create: create };
})();
