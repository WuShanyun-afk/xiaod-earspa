/* 小D的赛博小家 · 从轮廓扫掠出来的胖虎鲸
 * 建模思路移植自 elyoncatnecoe/whale-pet (MIT)：
 *   2D 侧视轮廓 -> 沿轴切片求中线和半径 -> 高斯平滑/去凹坑 -> 椭圆截面扫掠 -> 3D 身体
 * 黑背白肚用逐顶点颜色算（原版用 shader，这里简化）
 * 坐标：身体沿 x 轴（头在 -x），调用方自行旋转
 */
window.XD = window.XD || {};

XD.OrcaSwept = (function () {
  const PATH_BODY = "M 144.00 80.00 C 144.67 84.83, 143.00 95.34, 141.00 102.00 C 139.00 108.66, 136.50 113.84, 132.00 120.00 C 127.50 126.16, 119.66 134.34, 114.00 139.00 C 108.34 143.66, 103.49 146.17, 98.00 148.00 C 92.51 149.83, 87.83 150.83, 81.00 150.00 C 74.17 149.17, 63.83 146.66, 57.00 143.00 C 50.17 139.34, 44.50 134.16, 40.00 128.00 C 35.50 121.84, 31.83 113.16, 30.00 106.00 C 28.17 98.84, 28.17 90.99, 29.00 85.00 C 29.83 79.01, 32.17 74.50, 35.00 70.00 C 37.83 65.50, 41.67 61.00, 46.00 58.00 C 50.33 55.00, 56.01 53.00, 61.00 52.00 C 66.00 51.00, 70.51 51.00, 76.00 52.00 C 81.49 53.00, 85.34 52.34, 94.00 58.00 C 102.66 63.66, 120.84 83.50, 128.00 86.00 C 135.16 88.50, 134.34 74.00, 137.00 73.00 C 139.66 72.00, 143.33 75.17, 144.00 80.00 Z";

  /* ---------- SVG path 采样 ---------- */
  function bez(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  function catmullRomResample(points, targetCount, closed) {
    if (points.length < 2) return points;
    const n = points.length;
    const src = closed ? [...points, points[0], points[1], points[2]] : points;
    const arcLen = [0];
    for (let i = 1; i < src.length; i++) {
      const dx = src[i].x - src[i - 1].x, dy = src[i].y - src[i - 1].y;
      arcLen.push(arcLen[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalLen = arcLen[arcLen.length - 1];
    const result = [];
    for (let k = 0; k < targetCount; k++) {
      const t = (k / targetCount) * totalLen;
      let seg = 0;
      while (seg < arcLen.length - 2 && arcLen[seg + 1] < t) seg++;
      const segStart = arcLen[seg], segEnd = arcLen[seg + 1];
      const localT = (segEnd - segStart) > 0 ? (t - segStart) / (segEnd - segStart) : 0;
      const p0 = src[Math.max(0, seg - 1)], p1 = src[seg];
      const p2 = src[seg + 1], p3 = src[Math.min(src.length - 1, seg + 2)];
      const tt = localT, tt2 = tt * tt, tt3 = tt2 * tt;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * tt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * tt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3);
      result.push({ x, y });
    }
    return result;
  }

  function samplePathDense(d, stepsPerSegment, totalResample) {
    const toks = d.match(/[MLCZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    let i = 0, x = 0, y = 0;
    const rawPts = [];
    const num = () => parseFloat(toks[i++]);
    const b3 = (t, p0, p1, p2, p3) => bez(t, p0, p1, p2, p3);
    while (i < toks.length) {
      const c = toks[i++].toUpperCase();
      if (c === 'M' || c === 'L') {
        x = num(); y = num(); rawPts.push({ x, y });
      } else if (c === 'C') {
        const c1x = num(), c1y = num(), c2x = num(), c2y = num(), ex = num(), ey = num();
        for (let s = 1; s <= stepsPerSegment; s++) {
          const t = s / stepsPerSegment;
          rawPts.push({ x: b3(t, x, c1x, c2x, ex), y: b3(t, y, c1y, c2y, ey) });
        }
        x = ex; y = ey;
      }
    }
    return catmullRomResample(rawPts, totalResample, true);
  }

  /* ---------- 平滑工具 ---------- */
  function smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  function smoothGaussian(arr, sigma, iterations) {
    const len = arr.length, half = Math.ceil(sigma * 3), kernel = [];
    let sumK = 0;
    for (let j = -half; j <= half; j++) {
      const val = Math.exp(-0.5 * (j / sigma) * (j / sigma));
      kernel.push(val); sumK += val;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sumK;
    let work = [...arr];
    for (let iter = 0; iter < iterations; iter++) {
      const temp = [...work];
      for (let i = 0; i < len; i++) {
        let sum = 0;
        for (let j = -half; j <= half; j++) {
          const idx = Math.min(len - 1, Math.max(0, i + j));
          sum += temp[idx] * kernel[j + half];
        }
        work[i] = sum;
      }
    }
    return work;
  }

  function removeDents(arr, window) {
    window = window || 10;
    const res = [...arr];
    for (let i = 1; i < res.length - 1; i++) {
      const left = Math.max(0, i - window), right = Math.min(res.length - 1, i + window);
      let minNeighbor = Infinity;
      for (let j = left; j <= right; j++) { if (j === i) continue; if (res[j] < minNeighbor) minNeighbor = res[j]; }
      if (res[i] < minNeighbor) res[i] = minNeighbor;
    }
    return res;
  }

  /* ---------- 沿轴扫掠成身体 ---------- */
  function buildSwept(poly, nSlices, nRings) {
    nSlices = nSlices || 60; nRings = nRings || 48;
    let minX = 1e9, maxX = -1e9, polyMinY = Infinity, polyMaxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      polyMinY = Math.min(polyMinY, p.y); polyMaxY = Math.max(polyMaxY, p.y);
    }
    const totalX = maxX - minX, step = totalX / nSlices;
    const polyHeight = polyMaxY - polyMinY;
    const tailLiftAmount = 0.1 * polyHeight;

    const xs = [], midRaw = [], radRaw = [];
    let lastM = 0;
    for (let s = 0; s <= nSlices; s++) {
      const x = minX + s * step;
      let top = -Infinity, bot = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if (Math.abs(a.x - b.x) < 1e-9) continue;
        if ((a.x - x) * (b.x - x) > 0) continue;
        const y = a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y);
        if (y > top) top = y;
        if (y < bot) bot = y;
      }
      let m, r;
      if (isFinite(top) && isFinite(bot)) {
        m = (top + bot) / 2; r = (top - bot) / 2;
        if (r < 0) r = 0;
        lastM = m;
      } else { m = lastM; r = 0; }
      xs.push(x); midRaw.push(m); radRaw.push(Math.max(0, r));
    }

    let radSmooth = smoothGaussian(radRaw, 3.0, 2);
    let midSmooth = smoothGaussian(midRaw, 2.0, 1);
    radSmooth = removeDents(radSmooth, 8);
    radSmooth = smoothGaussian(radSmooth, 1.5, 1);

    let maxIdx = 0, maxVal = 0;
    for (let i = 0; i < radSmooth.length; i++) { if (radSmooth[i] > maxVal) { maxVal = radSmooth[i]; maxIdx = i; } }
    for (let i = maxIdx - 1; i >= 0; i--) { if (radSmooth[i] > radSmooth[i + 1]) radSmooth[i] = radSmooth[i + 1]; }
    for (let i = maxIdx + 1; i < radSmooth.length; i++) { if (radSmooth[i] > radSmooth[i - 1]) radSmooth[i] = radSmooth[i - 1]; }

    const tailRatio = 0.14, headRatio = 0.11;
    const tailLen = totalX * tailRatio, headLen = totalX * headRatio;
    const tailEnd = xs.findIndex(x => x >= minX + tailLen);
    if (tailEnd > 2) {
      const rBody = radSmooth[tailEnd];
      for (let i = 0; i <= tailEnd; i++) {
        const t = (xs[i] - minX) / tailLen;
        const ease = 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
        radSmooth[i] = Math.min(radSmooth[i], rBody * ease);
      }
    }
    const headStart = xs.findIndex(x => x >= maxX - headLen);
    if (headStart < nSlices - 2) {
      const rBody = radSmooth[headStart];
      for (let i = headStart; i <= nSlices; i++) {
        const t = (maxX - xs[i]) / headLen;
        const ease = 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
        radSmooth[i] = Math.min(radSmooth[i], rBody * ease);
      }
    }
    radSmooth[0] = 0; radSmooth[nSlices] = 0;
    radSmooth = smoothGaussian(radSmooth, 1.2, 1);
    radSmooth[0] = 0; radSmooth[nSlices] = 0;

    // 尾端微微上翘
    const tailLiftStartFrac = 0.75;
    for (let i = 0; i <= nSlices; i++) {
      const t = (xs[i] - minX) / totalX;
      if (t > tailLiftStartFrac) {
        const liftT = smoothstep(tailLiftStartFrac, 1.0, t);
        midSmooth[i] += tailLiftAmount * liftT;
      }
    }

    const pos = [];
    for (let s = 0; s <= nSlices; s++) {
      for (let k = 0; k < nRings; k++) {
        const th = (k / nRings) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        pos.push(xs[s], midSmooth[s] + radSmooth[s] * c, radSmooth[s] * sn);
      }
    }
    const idx = [];
    for (let s = 0; s < nSlices; s++) {
      for (let k = 0; k < nRings; k++) {
        const k2 = (k + 1) % nRings;
        const a = s * nRings + k, b = s * nRings + k2;
        const c2 = (s + 1) * nRings + k, d = (s + 1) * nRings + k2;
        idx.push(a, d, c2, a, b, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.userData.swept = { xs, mid: midSmooth, rad: radSmooth };
    return geo;
  }

  /* ---------- 组装 ---------- */
  function create(opts) {
    opts = opts || {};
    const targetLength = opts.length || 1.0;

    const rawContour = samplePathDense(PATH_BODY, 50, 800);
    let cx = 0, cy = 0;
    rawContour.forEach(p => { cx += p.x; cy += p.y; });
    cx /= rawContour.length; cy /= rawContour.length;
    const pts = rawContour.map(p => ({ x: (p.x - cx) * 1.1, y: -(p.y - cy) }));
    if (THREE.ShapeUtils.isClockWise(pts.map(p => new THREE.Vector2(p.x, p.y)))) pts.reverse();

    const geo = buildSwept(pts, opts.slices || 64, opts.rings || 52);

    // 逐顶点上色：背深蓝、腹白
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const back = new THREE.Color(opts.back || 0x0e1830);
    const belly = new THREE.Color(opts.belly || 0xf4f8ff);
    const tmp = new THREE.Color();
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const span = (maxY - minY) || 1;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) - minY) / span;           // 0 底 1 顶
      const w = 1 - smoothstep(0.30, 0.52, t);        // 越低越白
      tmp.copy(back).lerp(belly, w);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.04
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // 归一化：按包围盒把最长边缩到 targetLength
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const s = targetLength / Math.max(size.x, size.y, size.z);
    // 居中（在 inner 组内做，不缩放）
    const c = new THREE.Vector3();
    bb.getCenter(c);
    mesh.position.set(-c.x, -c.y, -c.z);

    const inner = new THREE.Group();
    inner.add(mesh);

    /* ---------- 鳍（用 swept 的截面数据定位） ---------- */
    const sw = geo.userData.swept;
    const sx = sw.xs, smid = sw.mid, srad = sw.rad;
    const nn = sx.length;
    const at = (f) => Math.min(nn - 1, Math.max(0, Math.round(f * (nn - 1))));
    const finColor = opts.fin || 0x0c1526;
    const finMat = new THREE.MeshStandardMaterial({ color: finColor, roughness: 0.7, metalness: 0.03 });

    function blade(pts, depth) {
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
      sh.closePath();
      const g2 = new THREE.ExtrudeGeometry(sh, {
        depth: depth, bevelEnabled: true,
        bevelSize: depth * 0.45, bevelThickness: depth * 0.45, bevelSegments: 2
      });
      g2.translate(0, 0, -depth / 2);
      return g2;
    }

    // 背鳍：立在背脊上
    const di = at(0.44);
    const dorsal = new THREE.Mesh(blade([
      [-26, -4], [-16, 18], [-4, 34], [8, 38], [20, 22], [26, 2]
    ], 2.2), finMat);
    dorsal.position.set(sx[di] - c.x, smid[di] - c.y + srad[di] - 4, 0);
    dorsal.rotation.z = 0.06;
    dorsal.castShadow = true;
    inner.add(dorsal);

    // 尾鳍：两片横向展开
    const ti = nn - 1;
    const tailX = sx[ti];
    const tailY = smid[ti];
    [-1, 1].forEach((side) => {
      const fluke = new THREE.Mesh(blade([
        [0, 0], [16, -10], [34, -8], [44, 4], [30, 14], [10, 8]
      ], 1.8), finMat);
      fluke.position.set(tailX - c.x - 2, tailY - c.y + 2, side * 4);
      fluke.rotation.y = side * Math.PI * 0.42;
      fluke.rotation.z = side * -0.25;
      fluke.castShadow = true;
      inner.add(fluke);
    });

    // 胸鳍：身体两侧偏下
    const pi = at(0.42);
    [-1, 1].forEach((side) => {
      const pec = new THREE.Mesh(blade([
        [0, 0], [10, -14], [26, -22], [40, -12], [30, 2], [8, 6]
      ], 1.4), finMat);
      pec.position.set(sx[pi] - c.x, smid[pi] - c.y - srad[pi] * 0.55, side * (srad[pi] * 0.92));
      pec.rotation.set(side * 0.5, side * 1.15, 0.25);
      pec.castShadow = true;
      inner.add(pec);
    });

    inner.scale.setScalar(s);
    const group = new THREE.Group();
    group.add(inner);
    group.userData.size = { x: size.x * s, y: size.y * s, z: size.z * s };
    group.userData.mesh = mesh;
    return group;
  }

  return { create: create, buildSwept: buildSwept, samplePathDense: samplePathDense };
})();
