/* 小D的赛博小家 · 灯光 */
window.XD = window.XD || {};

XD.Lighting = (function () {
  function build(scene) {
    const holder = new THREE.Group();
    holder.name = 'lights';

    // 环境：夜晚偏冷的底子
    const hemi = new THREE.HemisphereLight(0x5a6f9a, 0x241c14, 0.42);
    holder.add(hemi);

    const ambient = new THREE.AmbientLight(0x2a3550, 0.30);
    holder.add(ambient);

    // 主灯：吸顶灯投下来的暖光锥
    const main = new THREE.SpotLight(0xffd2a0, 2.0, 16, 1.04, 0.92, 1.5);
    main.position.set(0, 3.02, 0);
    main.target.position.set(0, 0, 0);
    main.castShadow = true;
    main.shadow.mapSize.set(1024, 1024);
    main.shadow.bias = -0.0018;
    main.shadow.radius = 4;
    main.shadow.camera.near = 0.4;
    main.shadow.camera.far = 12;
    holder.add(main);
    holder.add(main.target);

    // 窗口漏进来的冷光（不投影，省性能）
    const win = new THREE.DirectionalLight(0x9db8ff, 0.55);
    win.position.set(-9.5, 4.6, -0.4);
    win.target.position.set(1.6, 1.0, -0.4);
    holder.add(win);
    holder.add(win.target);

    // 窗边一点点蓝紫色氛围补光
    const winFill = new THREE.PointLight(0x6f8cff, 0.35, 9, 2);
    winFill.position.set(-3.6, 2.2, 0);
    holder.add(winFill);

    // 地板反弹的暖光（让暗部不至于死黑）
    const bounce = new THREE.PointLight(0xffb877, 0.22, 8, 2);
    bounce.position.set(0.4, 0.5, 0.6);
    holder.add(bounce);

    scene.add(holder);

    return { holder: holder, hemi: hemi, ambient: ambient, main: main, win: win, winFill: winFill, bounce: bounce };
  }

  // level: 0 = 全关, 1 = 全开
  function apply(L, level) {
    L.main.intensity = 2.0 * level;
    L.winFill.intensity = 0.35 * (0.45 + 0.55 * level);
    L.bounce.intensity = 0.22 * level;
    L.hemi.intensity = 0.42 * (0.55 + 0.45 * level);
    L.ambient.intensity = 0.30 * (0.6 + 0.4 * level);
  }

  return { build: build, apply: apply };
})();
