# 声音素材来源（assets/sfx）

妈妈说了可以下载音频，所以这里放真录音；`src/sfx.js` 优先放这些文件，
文件缺了 / 加载失败就自动退回**现场合成**（原来那套 WebAudio 兜底还在）。
全部从开放素材站免费下载，逐条记来源，方便以后换或补。

文件夹：`D:\XiaoDHome\assets\sfx\`

| 文件 | 用途 | 时长 | 来源 | 作者 | 许可证 |
| --- | --- | --- | --- | --- | --- |
| `sizzle.mp3` | 油锅滋滋（循环） | 13.1s | freesound #753538「Frying Bacon, Seamless Loop」 | HECKFRICKER | CC0 |
| `boil.ogg` | 锅里咕嘟（循环，盖着盖） | 4s | OpenGameArt「boiling water loops」→ cooking_with_cover_01.ogg | TinyWorlds | CC0 |
| `water.ogg` | 水龙头 / 放水（循环） | 4s | OpenGameArt「30 CC0 SFX loops」→ water_flowing.ogg | rubberduck | CC0 |
| `hood.mp3` | 抽油烟机（循环，M11.5 加的） | 16.8s | freesound #472881「Kitchen extractor fan」 | bolkmar | CC0 |
| `hum.mp3` | 冰箱压缩机低鸣（循环，厨房底噪） | 11.8s | freesound #740110「Large Refrigerator compressor hum 1」 | FOSSarts | CC0 |
| `stir.mp3` | 筷子搅锅 / 搅碗（M11.5 加的） | 8.6s | freesound #624746「Stirring cereal with spoon.m4a」 | MinnyMelody | CC0 |
| `pour.mp3` | 往锅里倒水（M11.5 加的） | 4.5s | freesound #585516「Pouring Water Into Metal Pot or Kettle」 | ahriik | CC0 |
| `lid.mp3` | 锅盖碰锅沿（M11.5 加的） | 8s | freesound #835823「pot-lid」 | BogumilaMerc | CC0 |
| `slurp.mp3` | 吸溜面 | 3.1s | freesound #759264「Cartoon Slurp」 | lil_slugger | CC0 |
| `clink.mp3` | 碗筷 / 杯子碰 | 0.6s | freesound #214193「ceramicCups7.wav」 | kikuchiyo | CC0 |
| `hiss.mp3` | 开冰箱的冷气「嘶」 | 2.2s | freesound #367125「Air Hiss」 | Jofae | CC0 |
| `fridge_close.mp3` | 关冰箱门 | 1.0s | freesound #426362「Fridge Door Closing」 | pbharri | CC0 |
| `drain.mp3` | 浴缸下水 | 5.7s | freesound #624096「Water flowing into a drain 1」 | Magnesus | CC0 |
| `chop.mp3` | 切菜一刀 | 0.8s | freesound #66113「knife_chop.wav」 | deleted_user_877451 | **CC-BY 3.0（需要署名）** |
| `fridge_open.mp3` | 开冰箱门的把手声 | 2.5s | freesound #390995「Fridge_Open_Near.wav」 | pointparkcinema | **CC-BY 4.0（需要署名）** |
| `ding.mp3` | 「面好了」的铃 | 0.9s | freesound #411749「Bell Ding」 | Natty23 | **CC-BY 4.0（需要署名）** |
| `step_wood.mp3` | 木地板脚步声（单脚，M12 换成了下面的序列） | 0.5s | freesound #340983「Footstep on wood」 | SoundsAreGr8 | CC0 |
| `step_wood2.mp3` | 木地板另一个变体（兜底用） | 0.16s | freesound #421153「Footstep_Wood_Toe_1.wav」 | GiocoSound | CC0 |
| `step_tile.mp3` | 瓷砖脚步声（单脚，兜底用） | 0.25s | freesound #390762「FX_007_footstep_tile_l.wav」 | d00121058 | CC0 |
| `step_wood_seq.mp3` | 木地板**走路序列**（M12 用：随机切一脚） | 27.9s | freesound #148799「Footsteps, Solid Wood, Female Socks, On Toes, Medium Pace.wav」 | SpliceSound | CC0 |
| `step_tile_seq.mp3` | 瓷砖**走路序列**（M12 用：随机切一脚） | 23.5s | freesound #555296「Footsteps on Shower Room Floor Tiles Wearing Brogues.wav」 | F.M.Audio | **CC-BY 4.0（需要署名）** |

CC-BY 的三条按许可证要求署名，署名就在这张表里（本文件夹随小屋一起保留即可）。
如果哪天想全部换成 CC0，把这三条换掉、表里删掉对应行就行，代码不用动（文件名不变）。

下载时的原始文件留在 `_raw\`（含没用上的 `cooking_without_cover_01.ogg`、
`wet_squish_slurp.mp3`、`sfx_loops.zip` 里的其它循环），不占多少地方，想换声音可以直接挑。

## 候选脚步（`candidates\`，给妈妈挑的，还没接进小屋）

都是**独立作者/模组素材作者自己录制并公开授权**的 CC0 音效（不是从任何游戏里拆出来的）：
- `A1~A6_oga_step.ogg` ← OpenGameArt「Footsteps」（CC0）—— 6 条短脚步，独立游戏常用
- `B1~B4_stepcloth*.ogg` ← OpenGameArt「Footsteps Leather, Cloth, Armor」（CC0）—— 布/袜底
- `B5~B8_steplth*.ogg` ← 同上 —— 皮鞋

挑好后把选中的那条重命名成 `step_wood_seq.mp3` 之外的名字，接进 `sfx.js` 即可；
或者告诉小D编号，由小D来接。

## 关于「Minecraft 走路音效」

妈妈问过能不能用 MC 的走路音，还问"有没有模组作者做的公开音效"。结论分三层：

1. **不能用 MC 原版音效**：那是 Mojang 的版权资产，网上的"MC走路音效"都是拆包导出的，不是公开授权素材。
2. **模组资源包要小心**：Modrinth 上一堆 Presence Footsteps 资源包标着 MIT/CC0，但那个许可证通常只覆盖
   配置/代码，**音频往往还是原版或来历不明**，所以不碰。
3. **能用的是"作者自己录制 + 明确开放授权"的音效**：比如 OpenGameArt 上的 Fantozzi / 独立作者脚步包（CC0/CC-BY），
   独立游戏里用得很多。本文件夹 `candidates\` 就是这一路。
4. 另外，**MC 的脚步本来也不是"一段录音"**：它是程序把极短的一小段材质音随机变调、变音量、随机挑着播。
   我们现在做的事（从走路录音里切一脚 + 随机音高/音量）原理一样，所以"游戏感"可以合法做出来。

## M11.5「厨房 ASMR」新增的

`sizzle` / `boil` / `water` 还在用；另外加了 `hood`（抽油烟机）、`hum`（冰箱压缩机低鸣，当厨房底噪）、
`stir`（筷子搅）、`pour`（倒水）、`lid`（真锅盖碰）。
`src/sfx.js` 现在给每段声音一个**空间位置**（PannerNode + HRTF），你走到哪儿声音从哪儿来；
所有声音过一遍自己生成的小房间混响（卷积，1.2 秒衰减），听起来像真在一个厨房里。
冰箱低鸣是会一直在的（很轻），走近冰箱才听得清楚，这就是"沉浸"的一半。

## 没做成文件的（还是现场合成）
点火「啪」、关火气声、水花、泡泡破、点击「叮」、开门的"啵"。
（原来合成的抽油烟机低鸣和锅盖也退居兜底：有文件就用文件。）
