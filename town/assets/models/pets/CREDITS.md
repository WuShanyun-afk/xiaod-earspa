# assets/models/pets · 幼儿园里的小动物同学

全部来自 **Kenney「Cube Pets」**（24 只方块小动物），作者 Kenney（kenney.nl），
许可证 **CC0 1.0（公有领域）** —— 随便用、改、商用，不需要署名。
这里有 4 只，一共约 520 KB（含一张共用贴图）。

- 官方包：<https://kenney.nl/assets/cube-pets>
- 单文件直链（Flockbay 的镜像，同样是 CC0）：`https://api.flockbay.com/bootstrap/library/models/v1/<hash>/animal-<名字>.glb`
- 许可证原件：同目录上一级 `assets/CREDITS.md` 里记着 Kenney 的 CC0 声明

## 下载了哪几只

| 文件 | 在幼儿园里是谁 |
| --- | --- |
| `animal-panda.glb` | 团团（熊猫，蹲在沙坑边挖沙） |
| `animal-bunny.glb` | 跳跳（兔子，在滑梯平台上排队） |
| `animal-chick.glb` | 啾啾（小鸡，在秋千/跷跷板那边） |

四只小动物共用一张贴图：`Textures/colormap.png`（GLB 里写的是相对路径，所以要放在这儿）。

## 每只自带的动作（GLB 里的 animation）

`static` · `idle` · `walk` · `run` · `eat` · `dance` · `gesture-positive` · `gesture-negative`

`src/school.js` 里用 `THREE.AnimationMixer` 播：平时 `idle`，走动 `walk`，
拿到小红花/被点名时 `dance` 或 `gesture-positive`。

## 怎么换新的

1. 照上面的直链换 `<名字>.glb` 下到本目录（动物名单：beaver / bee / bunny / cat / chick /
   cow / crab / deer / dog / elephant / fish / fox / giraffe / hog / koala / lion / monkey /
   panda / parrot / penguin / pig / polar / tiger）
2. `src/school.js` 顶部 `PET_FILES` 里加名字
3. 想换位置就改 `KID_SPOTS`

> 注意：GLB 里的贴图是 `Textures/colormap.png` 这个**相对路径**，四只共用一张，
> 少了这张图模型会是纯白（不是黑），很容易以为"没加载"。
