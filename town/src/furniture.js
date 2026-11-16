/* 小D的赛博小家 · 家具（M3 睡觉角） */
window.XD = window.XD || {};

XD.Furniture = (function () {

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function box(w, h, d, x, y, z, mat) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }

  /* 圆角"软"块：用压扁的球体冒充枕头 / 靠垫 */
  function soft(w, h, d, x, y, z, mat) {
    const m = mesh(new THREE.SphereGeometry(0.5, 20, 14), mat, x, y, z);
    m.scale.set(w, h, d);
    return m;
  }

  /* ============ 床 ============ */
  function bed(root, mat) {
    const g = new THREE.Group();
    g.name = 'bed';

    const BX = 1.60;          // 床中心 x
    const BZ = -2.44;         // 床中心 z
    const BW = 1.80;          // 宽（x）
    const BL = 2.00;          // 长（z）

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6749, roughness: 0.62 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.85 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x6d5039, roughness: 0.58 });
    const sheetMat = new THREE.MeshStandardMaterial({
      color: 0xe4d4bb, roughness: 0.95,
      map: XD.Mat.fabric('#e4d4bb', [3, 2])
    });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ec, roughness: 0.92 });
    const blanketMat = new THREE.MeshStandardMaterial({
      color: 0xc7a98a, roughness: 0.98,
      map: XD.Mat.fabric('#c7a98a', [2, 2])
    });

    // 床箱（实心落地，不做细腿，量感更足）
    g.add(box(BW, 0.30, BL, BX, 0.15, BZ, woodMat));
    // 床沿压条
    g.add(box(BW + 0.03, 0.05, BL + 0.03, BX, 0.30, BZ, darkWoodMat));

    // 床垫
    g.add(box(BW - 0.04, 0.26, BL - 0.04, BX, 0.43, BZ, whiteMat));

    // 被子（盖住下半段）+ 两侧垂边
    g.add(box(BW + 0.02, 0.18, 1.16, BX, 0.60, BZ + 0.42, sheetMat));
    g.add(box(0.06, 0.40, 1.16, BX - BW / 2 - 0.01, 0.40, BZ + 0.42, sheetMat));
    g.add(box(0.06, 0.40, 1.16, BX + BW / 2 + 0.01, 0.40, BZ + 0.42, sheetMat));
    // 被子上的蓬松褶皱（几个压扁的软包，避免被面像木板）
    [[-0.55, 0.02], [0.0, 0.05], [0.55, 0.02]].forEach(function (o) {
      g.add(soft(0.52, 0.10, 1.02, BX + o[0], 0.695, BZ + 0.42 + o[1], sheetMat));
    });

    // 被子翻边
    g.add(box(BW + 0.03, 0.07, 0.12, BX, 0.69, BZ - 0.16, sheetMat));

    // 枕头两只
    const pz = BZ - 0.72;
    g.add(soft(0.66, 0.18, 0.42, BX - 0.42, 0.64, pz, pillowMat));
    g.add(soft(0.66, 0.18, 0.42, BX + 0.42, 0.64, pz, pillowMat));

    // 床尾针织毯
    g.add(box(BW - 0.10, 0.05, 0.50, BX, 0.72, BZ + 0.86, blanketMat));

    // 床头板
    const head = box(BW + 0.06, 0.92, 0.09, BX, 0.60, BZ - BL / 2 - 0.05, woodMat);
    g.add(head);
    // 床头板顶部圆角横杆
    const rail = mesh(new THREE.CylinderGeometry(0.05, 0.05, BW + 0.06, 14), woodMat, BX, 1.04, BZ - BL / 2 - 0.05);
    rail.rotation.z = Math.PI / 2;
    g.add(rail);

    root.add(g);
    return g;
  }

  /* ============ 床头柜 ============ */
  function nightstand(root) {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a7551, roughness: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x6f5238, roughness: 0.7 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.3, metalness: 0.8 });

    const X = 2.98, Z = -3.16;
    g.add(box(0.58, 0.50, 0.44, X, 0.27, Z, woodMat));
    // 柜面稍微出檐
    g.add(box(0.62, 0.04, 0.48, X, 0.54, Z, darkMat));
    // 抽屉缝 + 把手
    g.add(box(0.50, 0.012, 0.012, X, 0.40, Z + 0.222, darkMat));
    const knob = mesh(new THREE.SphereGeometry(0.022, 10, 8), knobMat, X, 0.40, Z + 0.235);
    g.add(knob);
    // 腿
    [[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]].forEach(function (o) {
      g.add(box(0.05, 0.08, 0.05, X + o[0], 0.04, Z + o[1], darkMat));
    });

    root.add(g);
    return { group: g, top: { x: X, y: 0.56, z: Z } };
  }

  /* ============ 蘑菇小台灯（会亮） ============ */
  function lamp(root, pos) {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xd8c9b4, roughness: 0.5 });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d8,
      emissive: new THREE.Color(0xffc07a),
      emissiveIntensity: 0.85,
      roughness: 0.6
    });

    const stalk = mesh(new THREE.CylinderGeometry(0.020, 0.024, 0.34, 12), baseMat, 0, 0.17, 0);
    g.add(stalk);
    const base = mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.03, 18), baseMat, 0, 0.015, 0);
    g.add(base);
    // 半圆灯罩
    const shade = mesh(
      new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      shadeMat, 0, 0.34, 0
    );
    shade.rotation.x = Math.PI;
    g.add(shade);
    // 灯罩里的小灯泡
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2d6 })
    );
    bulb.position.set(0, 0.325, 0);
    g.add(bulb);

    g.position.set(pos.x, pos.y, pos.z);
    root.add(g);

    const light = new THREE.PointLight(0xffb774, 1.9, 5.0, 2);
    light.position.set(pos.x, pos.y + 0.40, pos.z);
    light.userData.cozy = true;      // M34.5：床头灯有自己的开关，关大灯时别把它一起收掉
    root.add(light);

    return { group: g, light: light, shadeMat: shadeMat, bulb: bulb, baseIntensity: 1.9 };
  }

  /* ============ 床边长绒地毯 ============ */
  function rug(root) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe9dcc6,
      roughness: 1.0,
      map: XD.Mat.fabric('#e9dcc6', [2, 2])
    });
    const r = 1.38;
    const m = mesh(new THREE.CircleGeometry(r, 48), mat, 1.95, 0.012, -0.55);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.castShadow = false;
    g.add(m);

    // 外圈描边
    const ring = mesh(
      new THREE.RingGeometry(r - 0.06, r, 48),
      new THREE.MeshStandardMaterial({ color: 0xc2ad8e, roughness: 1 }),
      1.95, 0.014, -0.55
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);

    root.add(g);
    return g;
  }

  /* ============ 小D的虎鲸抱枕（趴在床上） ============ */
  function orcaPlush(root, pos, rotY) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22314f, roughness: 0.88 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.92 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.88 });

    // 身体（长一点的蛋）
    const body = mesh(new THREE.SphereGeometry(0.5, 26, 18), bodyMat, 0, 0, 0);
    body.scale.set(0.30, 0.19, 0.42);
    g.add(body);

    // 白肚皮（往下沉一点，露在身体外侧）
    const belly = mesh(new THREE.SphereGeometry(0.5, 22, 16), bellyMat, 0, -0.075, 0.04);
    belly.scale.set(0.235, 0.135, 0.34);
    g.add(belly);

    // 背鳍
    const fin = mesh(new THREE.SphereGeometry(0.5, 12, 10), finMat, 0, 0.155, -0.02);
    fin.scale.set(0.075, 0.20, 0.10);
    g.add(fin);

    // 尾鳍（两片）
    [-1, 1].forEach(function (s) {
      const t = mesh(new THREE.SphereGeometry(0.5, 12, 10), finMat, s * 0.075, 0.02, -0.40);
      t.scale.set(0.10, 0.055, 0.14);
      t.rotation.z = s * 0.5;
      g.add(t);
    });

    // 胸鳍（两片小扁片）
    [-1, 1].forEach(function (s) {
      const p = mesh(new THREE.SphereGeometry(0.5, 10, 8), finMat, s * 0.245, -0.045, 0.04);
      p.scale.set(0.06, 0.045, 0.143);
      p.rotation.z = s * 0.45;
      g.add(p);
    });

    // 眼睛白斑 + 眼珠
    [-1, 1].forEach(function (s) {
      const patch = mesh(new THREE.SphereGeometry(0.5, 14, 12), bellyMat, s * 0.135, 0.055, 0.235);
      patch.scale.set(0.105, 0.062, 0.05);
      patch.rotation.x = -0.25;
      g.add(patch);

      const eye = mesh(new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x101a2c, roughness: 0.4 }),
        s * 0.128, 0.048, 0.285);
      eye.scale.set(0.030, 0.030, 0.022);
      g.add(eye);
    });

    g.position.set(pos.x, pos.y, pos.z);
    g.rotation.y = rotY || 0;
    root.add(g);
    return g;
  }

  /* ============ 修正原版模型的颜色 ============
   * 原 pet.html 用默认（线性）输出，小家用 sRGB 输出 + ACES，
   * 不转换的话 0x4D6BFE 深寻蓝会被冲成浅藕蓝（#94AEFF）。
   * 把材质颜色和身体 shader 的 uDark/uWhite 都转成线性即可还原。
   * （顺带在这里接上 5 套皮肤）
   */
  const SKINS = {
    classic: { dark: 0x4d6bfe, white: 0xffffff, name: '深寻蓝' },
    night:   { dark: 0x271f19, white: 0xfff5e3, name: '虎鲸黑' },
    pink:    { dark: 0xe85a8a, white: 0xffe8f0, name: '草莓粉' },
    green:   { dark: 0x2e9e6b, white: 0xe8fff2, name: '薄荷绿' },
    gold:    { dark: 0xc78b20, white: 0xfff4d6, name: '土豪金' }
  };
  const BODY_BLUE = 0x4d6bfe;
  const orcaSkin = { mats: [], uniforms: null, pending: null };

  function lin(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  }

  function applyOrcaSkin(name) {
    
    const key = SKINS[name] ? name : 'classic';
    orcaSkin.pending = key;
    const sk = SKINS[key];
    // 尾鳍 / 背鳍 / 胸鳍是独立的基础材质
    orcaSkin.mats.forEach(function (m) { m.color.copy(lin(sk.dark)); });
    // 身体是自定义 shader，要等编译完才有 uniforms
    if (orcaSkin.uniforms) {
      if (orcaSkin.uniforms.uDark) orcaSkin.uniforms.uDark.value.copy(lin(sk.dark));
      if (orcaSkin.uniforms.uWhite) orcaSkin.uniforms.uWhite.value.copy(lin(sk.white));
    }
    try { localStorage.setItem('xd_home_skin', key); } catch (e) {}
    // 身体是自定义 shader：直接改 uniform 在小屋里不生效（onBeforeCompile 的 uniforms
    // 和实际绘制用的不是同一个对象），所以强制它重新编译一次，编译时读取 pending
    if (orcaSkin.bodyMat) orcaSkin.bodyMat.needsUpdate = true;
    return sk.name;
  }

  function fixOrcaColors(root) {
    if (!root) return;
    const seen = [];
    root.traverse(function (o) {
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(function (m) {
        if (seen.indexOf(m) >= 0) return;
        seen.push(m);
        if (m.color && !m.userData._xdColorFixed) {
          // 记下"身体蓝"的材质，换皮肤时要一起改
          if (m.color.getHex() === BODY_BLUE) {
            m.userData._xdSkinMat = true;
            orcaSkin.mats.push(m);
          }
          m.color.convertSRGBToLinear();
          m.userData._xdColorFixed = true;
        }
        // 注意：three 的 Material.prototype 上有默认的空 onBeforeCompile，
        // 所以必须判断"自己身上有"才算自定义 shader，否则会把每个材质都包一遍
        if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && !m.userData._xdShaderFixed) {
          m.userData._xdShaderFixed = true;
          orcaSkin.bodyMat = m;
          // 让程序缓存键跟着皮肤变：换皮肤时强制重新编译一次，onBeforeCompile 里
          // 会读取 orcaSkin.pending 把颜色写进 uniform（直接改 uniform 在小屋里不生效）
          if (typeof m.customProgramCacheKey === 'function') {
            m.customProgramCacheKey = function () { return 'xdskin_' + (orcaSkin.pending || 'classic'); };
          }
          const orig = m.onBeforeCompile;
          m.onBeforeCompile = function (sh) {
            orig.call(m, sh);
            
            if (sh.uniforms.uDark) sh.uniforms.uDark.value.convertSRGBToLinear();
            if (sh.uniforms.uWhite) sh.uniforms.uWhite.value.convertSRGBToLinear();
            orcaSkin.uniforms = sh.uniforms;
            // 如果换皮肤的请求发生在编译之前，这里补上
            if (orcaSkin.pending && SKINS[orcaSkin.pending]) {
              const p = SKINS[orcaSkin.pending];
              if (sh.uniforms.uDark) sh.uniforms.uDark.value.copy(lin(p.dark));
              if (sh.uniforms.uWhite) sh.uniforms.uWhite.value.copy(lin(p.white));
            }
          };
        }
      });
    });
  }

  /* ============ 加载现成的 GLB 虎鲸（Poly by Google，CC 署名） ============ */
  function loadOrcaModel(parent, opts) {
    opts = opts || {};
    if (!THREE.GLTFLoader) {
      console.warn('[orca] 没有 GLTFLoader');
      if (opts.fallback) opts.fallback(parent);
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/orca.glb', function (gltf) {
      const model = gltf.scene;
      model.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) {
          o.material.roughness = 0.78;
          o.material.metalness = 0.02;
          o.material.emissive = new THREE.Color(0x0a1220);
          o.material.emissiveIntensity = 0.85;
        }
        // 按高度上色：背黑、肚白（低模没有贴图，就手动给它虎鲸配色）
        if (o.geometry && o.geometry.attributes.position) {
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox;
          const p = o.geometry.attributes.position;
          const span = (bb.max.y - bb.min.y) || 1;
          const arr = new Float32Array(p.count * 3);
          for (let i = 0; i < p.count; i++) {
            const t = (p.getY(i) - bb.min.y) / span;
            if (t < 0.40) { arr[i * 3] = 0.96; arr[i * 3 + 1] = 0.97; arr[i * 3 + 2] = 0.99; }
            else { arr[i * 3] = 0.055; arr[i * 3 + 1] = 0.085; arr[i * 3 + 2] = 0.15; }
          }
          o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
          if (o.material) {
            o.material.vertexColors = true;
            o.material.color.set(0xffffff);
          }
        }
        }
      });
      if (opts.rotation) {
        model.rotation.set(opts.rotation[0], opts.rotation[1], opts.rotation[2]);
      }
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = (opts.length || 0.95) / maxDim;
      model.scale.setScalar(s);
      model.updateMatrixWorld(true);

      const box2 = new THREE.Box3().setFromObject(model);
      const c = new THREE.Vector3();
      box2.getCenter(c);
      model.position.sub(c);

      model.name = 'orcaModel';
      parent.add(model);
    }, undefined, function (err) {
      console.warn('[orca] GLB 加载失败，用备用抱枕', err);
      if (opts.fallback) opts.fallback(parent);
    });
  }

  /* ============ M3 总装 ============ */
  function build(scene, room) {
    const root = new THREE.Group();
    root.name = 'furniture-m3';

    bed(root);
    const ns = nightstand(root);
    const l = lamp(root, { x: ns.top.x, y: ns.top.y, z: ns.top.z });
    // 床上的胖虎鲸（自建模型，头朝 +z）
    const plushHolder = new THREE.Group();
    plushHolder.position.set(1.62, 1.00, -2.30);
    plushHolder.rotation.y = 0.38;
    root.add(plushHolder);
    try {
      var om = XD.OrcaModel.group;
      fixOrcaColors(om);
      om.traverse(function (o) { if (o.material) o.material.toneMapped = false; });
      var obb = new THREE.Box3().setFromObject(om);
      var osize = new THREE.Vector3(); obb.getSize(osize);
      var oc = new THREE.Vector3(); obb.getCenter(oc);
      om.position.set(-oc.x, -oc.y, -oc.z);
      var owrap = new THREE.Group();
      owrap.add(om);
      owrap.scale.setScalar(0.86 / Math.max(osize.x, osize.y, osize.z));
      owrap.rotation.y = 0.14;
      plushHolder.add(owrap);
      // 【M19.6 结论】妈妈说"还是那个胖虎鲸可爱，就是虎鲸抱枕那个" ——
      // 所以床头这只就用自建的胖虎鲸（还带 5 套皮肤）。原来接的现成模型先不用了，
      // 文件留在 assets/whale/orca.glb（以后想换窗外那只鲸鱼还能用）。
      void 0;
    } catch (e) {
      console.warn('[orca] 自建模型失败，退回手搓版', e);
      orcaPlush(plushHolder, { x: 0, y: 0, z: 0 }, 0);
    }
    rug(root);

    // 恢复上次选的皮肤（在第一次渲染编译 shader 前设好）
    try { applyOrcaSkin(localStorage.getItem('xd_home_skin') || 'classic'); } catch (e) {}

    scene.add(root);
    return { root: root, lamp: l };
  }

  return {
    build: build, bed: bed, nightstand: nightstand, lamp: lamp, rug: rug,
    orcaPlush: orcaPlush, loadOrcaModel: loadOrcaModel, fixOrcaColors: fixOrcaColors,
    applyOrcaSkin: applyOrcaSkin, SKINS: SKINS
  };
})();
