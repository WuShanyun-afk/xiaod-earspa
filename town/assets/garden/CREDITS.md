# assets/garden · 花房用的免费模型

全部来自 **Kenney Nature Kit 2.0**，作者 Kenney（kenney.nl），许可证 **CC0 1.0（公有领域）**，
可以随便用、改、商用，不需要署名 —— 这里记下来是因为「知道东西是从哪来的」比什么都重要。

- 来源仓库（GitHub 镜像，jsdelivr 取单文件最快）：
  `https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_natureKit_2.1/Models/GLTF%20format/<名字>.glb`
- 许可证原件：本目录 `License.txt`

## 下载了哪些（12 个，共约 110 KB）

| 文件 | 用在哪儿 |
| --- | --- |
| `tree_oak.glb` / `tree_small.glb` / `tree_pineSmallA.glb` | 花房外面草地上的三棵树（代替手捏的那几棵） |
| `flower_redA.glb` / `flower_yellowA.glb` / `flower_purpleA.glb` | 北墙三层花架上的花盆里 |
| `plant_bushSmall.glb` | 架上两盆 + 地上一盆小灌木 |
| `mushroom_redGroup.glb` | 东南角一丛小蘑菇 |
| `log.glb` | 东墙边一截圆木（当小凳/装饰） |
| `rock_smallA.glb` / `rock_smallB.glb` | 外面小径旁的石头 |
| `grass_large.glb` | 外面草地上的草丛 |

## 怎么加新的

1. 照上面的 URL 换 `<名字>.glb` 下载到本目录（模型名单可以查
   `https://api.github.com/repos/ETdoFresh/kenney.nl/contents/kenney_natureKit_2.1/Models/GLTF%20format`）
2. `src/greenhouse.js` 顶部的 `loadModels()` 里的 `names` 数组加上名字
3. `decorate()` 里 `place('名字', x, y, z, 目标最大边长, 朝向)` 摆上去 —— 会自动按包围盒缩放、底面坐地
