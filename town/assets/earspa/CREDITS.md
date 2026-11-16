# 采耳馆音频（M43 / M43.1）· 出处与授权

全部是 **CC0 1.0（公有领域）**，可以随便用、商用也不用署名；这里还是把出处记下来，方便以后换。

## 采耳 / 洗耳 / 洗头（M43 + M43.1，妈妈 18:35 补齐的）

| 文件 | 是什么 | 音量 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- | --- | --- |
| `ear-clean.mp3` | 采耳 / 刮耳的真实录音（循环，约 22 秒） | 0.62 | https://freesound.org/people/Elias79/sounds/690078/ | Elias79 | CC0 1.0 |
| `ear-rub.mp3` | 揉耳朵的沙沙声（循环，约 24 秒） | 0.56 | https://freesound.org/people/Elias79/sounds/690077/ | Elias79 | CC0 1.0 |
| `ear-wash.mp3` | **洗耳的水流**（循环，约 4 分钟，接触麦克风录的） | 0.50 | https://freesound.org/people/unfa/sounds/680616/ | unfa | CC0 1.0 |
| `hair-wash.mp3` | **洗头发的水声**（循环，约 1 分半） | 0.46 | https://freesound.org/people/BeeProductive/sounds/384924/ | BeeProductive | CC0 1.0 |
| `pat.mp3` | **收工那几下轻拍**（一次性，一声） | 0.50 | https://freesound.org/people/martian/sounds/349897/ | martian | CC0 1.0 |
| `candle.mp3` | **耳烛的烛火**（循环） | 0.30 | https://freesound.org/people/roisin.gleeson/sounds/680476/ | roisin.gleeson | CC0 1.0 |
| `crackle.mp3` | 火苗的噼啪（循环，和上面叠着用） | 0.16 | https://freesound.org/people/soundofsong/sounds/650574/ | soundofsong | CC0 1.0 |
| `cloth.mp3` | **热毛巾的布料声**（循环） | 0.38 | https://freesound.org/people/gokalp_gonen/sounds/640594/ | gokalp_gonen | CC0 1.0 |
| `towel-wring.mp3` | 拧热毛巾（一次性） | 0.44 | https://freesound.org/people/phonoflora/sounds/518475/ | phonoflora | CC0 1.0 |
| `ear-syringe.mp3` | 冲水小球"噗"的一下（一次性） | 0.42 | https://freesound.org/people/taure/sounds/465495/ | taure | CC0 1.0 |
| `shampoo.mp3` | 挤洗发水（一次性） | 0.40 | https://freesound.org/people/Spyboticer/sounds/407194/ | Spyboticer | CC0 1.0 |

## 吃水果（M43.1）

| 文件 | 是什么 | 音量 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- | --- | --- |
| `fruit-bite.mp3` | 咬一口苹果 + 嚼（一次性） | 0.46 | https://freesound.org/people/RoofDog/sounds/79243/ | RoofDog | CC0 1.0 |
| `fruit-bite2.mp3` | 咬西瓜 / 多汁的一口（一次性，和第 1 条交替用） | 0.46 | https://freesound.org/people/Leemuffin/sounds/585439/ | Leemuffin | CC0 1.0 |

## 背景音乐（M43.1，妈妈说"要比互动音效小声"）

| 文件 | 是什么 | 音量 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- | --- | --- |
| `spa-music.mp3` | 店里的背景音乐（亚洲弦乐 loop，循环用） | **0.032**（演采耳动画时压到 0.018） | https://freesound.org/people/CVLTIV8R/sounds/840945/ | CVLTIV8R | CC0 1.0 |

## 怎么用的

`src/earscene.js`（2D 采耳动画）：

- **循环层**：`rub` / `clean` / `earwash` / `hairwash` 四条同时挂着、音量 0，
  每一节只把那一条淡上去，其余淡到 0（不是硬切）；播放速度跟着动作微微浮动（0.94~0.99），听不出循环点。
- **一次性**：`pat`（轻拍那节每 0.8 秒一下）、`ear-syringe`（洗耳开头）、`shampoo`（洗头开头）。
- 音叉 / 收工的「叮——」用 `src/sfx.js` 的 `chime()` **现场合成**，不占文件。

`src/earspa.js`（3D 店里）：

- `spa-music.mp3` 循环放，音量 **0.032**；**演采耳动画时降到 0.018**，让 ASMR 站前面。
- 果盘点一下吃一块：两口录音交替（`fruit-bite` / `fruit-bite2`），吃完 14 秒棉师傅再切一盘。
- 屋里的底噪借用 `assets/sfx/hum.mp3`（CC0，原本是冰箱压缩机低鸣），音量 0.05，听着像店里的空调。

> 按 **M 静音** 时，上面的音乐 / 循环 / 一次性声音全部一起停。
> 想换声音：把新文件丢进这个文件夹（文件名不变），代码不用动。
