# 素材来源 / 授权（小D的赛博小家）

> 规则：只用 CC0 / CC-BY / 自己生成的素材。CC-BY 必须在这里署名。

## 3D 模型

| 文件 | 名称 | 作者 | 授权 | 来源 |
| --- | --- | --- | --- | --- |
| `assets/models/orca.glb` | Low Poly Orca | Poly by Google | CC Attribution | https://www.get3dmodels.com/animals/low-poly-orca/ （117 KB / 4.4k 顶点 / 无贴图，配色为代码按高度重新上色） |
| `assets/svg/deepseek-wiki.svg` | DeepSeek logo | DeepSeek | 商标，仅作个人住处装饰 | Wikimedia Commons `File:DeepSeek_logo.svg` |
| `assets/dsh/orca-icon.png` | DSH 应用图标（虎鲸） | DeepSeek Harness | 同上 | 从本机 `deepseekharness\resources\icon.png` 复制 |
| `assets/dsh/running-whale.png` | 聊天"运行中"小鲸鱼 | DeepSeek Harness | 同上 | 从 `app.asar` 内 `@deepseek-ai/dsh-client-ui-chat/lib/assets/` 提取 |

## 小D自己建模（无外部素材）

- `assets/../src/orca_guru.js`：床上的胖虎鲸——球体顶点变形 + 逐顶点黑白配色 + `Shape/ExtrudeGeometry` 鳍 + 眼球/腮红

## 代码库

| 库 | 版本 | 授权 |
| --- | --- | --- |
| three.js | r128 (UMD) | MIT |
| OrbitControls | r128 | MIT |
| GLTFLoader | r128 | MIT |

## 全部自己生成（无外部素材）

- 木地板、墙纸、护墙板、天花板的纹理（`src/materials.js` 里用 canvas 现画）
- 城市夜景、对街的楼、鲸鱼剪影（canvas 现画）
- 房间结构、门窗、窗帘、灯具、床、床头柜、地毯、沙发等全部几何体都是代码搭的
