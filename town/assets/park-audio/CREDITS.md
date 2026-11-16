# 水上乐园 / 商铺音频 · 来源与授权

> 妈妈 2026-11-14 00:24 说：可以下载公开音频，记得下载素材存到 D 盘。
> 这几个文件都下载到了 `D:\XiaoDHome\assets\park-audio\`（**没往 C 盘放**），下面的授权都是**公开授权的真实录音**，没用 AI 生成音频。
>
> 2026-11-14 00:47 妈妈说乐园**太吵了**，要好听的**轻快白噪音 + 水流声** →
> M34 把底噪整条换掉了：现在踩底的是「轻白噪音（现场合成）+ 真的水流声」，
> `pool_kids_swim.ogg` / `park_kids.oga` 这两条人声**暂时不用了**（文件留着，想换回来随时能换）。

## 现在在用的（M34）

| 文件 | 用在哪 | 原文件（维基共享资源） | 授权 |
|---|---|---|---|
| `water_flow.ogg`（339 KB · 18.9 秒循环） | **泳池的水流声**（摆在泳池中心那个位置，走近了才听得清） | [Flowing-water-100019.ogg](https://commons.wikimedia.org/wiki/File:Flowing-water-100019.ogg) · 作者 **Fg2** | **公有领域（Public domain）** |
| `fountain.ogg`（340 KB · 18 秒循环） | **蘑菇戏水池 / 喷泉的水声**（摆在戏水池那边） | [Fountainnoise2.ogg](https://commons.wikimedia.org/wiki/File:Fountainnoise2.ogg) · 作者 **Secretlondon** | **CC BY-SA 3.0（需要署名）** |
| `splash_tub.ogg`（750 KB） | 跳下水 / 滑水道冲进池子的"哗" | [Bathtub water splashes.ogg](https://commons.wikimedia.org/wiki/File:Bathtub_water_splashes.ogg) · 作者 **gradha** | **公有领域（Public domain）** |

- 白噪音那一层（`parkAir`）是 `src/sfx.js` 里**现场合成**的（滤波后的噪声 + 很慢的起伏），
  不是文件，所以不用授权；好处是能压到很小声、无缝循环、不会突然冒出一句人声。
- 另外 `sfx.parkSplash / parkSplashSmall / parkDive / parkBubbles / parkLap / parkWhoosh / parkShake / eat`
  也全是现场合成的（水花、气泡、风声、吃东西的嚼劲），一次点击大概是几十毫秒的噪声 + 正弦。

## 先留着、暂时不用（M33 的人声底噪）

| 文件 | 原来用在哪 | 原文件（维基共享资源） | 授权 |
|---|---|---|---|
| `pool_kids_swim.ogg`（2.6 MB） | M33 乐园环境底噪（泳池边玩水的人声） | [Kinderen zwemmen en spelen in het Zuiderbad – SoundCloud – GvNL-Steim Workshop.ogg](https://commons.wikimedia.org/wiki/File:Kinderen_zwemmen_en_spelen_in_het_Zuiderbad_-_SoundCloud_-_GvNL-Steim_Workshop.ogg) · 作者 **GvNL-Steim Workshop** | **CC BY 3.0** |
| `park_kids.oga`（218 KB） | M33 环境声第二层（公园里小孩玩的声音） | [Ambient sound children playing in a park 2026-05-19.oga](https://commons.wikimedia.org/wiki/File:Ambient_sound_children_playing_in_a_park_2026-05-19.oga) · 上传者 SchlurcherBot | **CC BY-SA 4.0** |

- 用途：只在这台电脑上的个人小屋里播放（妈妈自己玩、不商用、不二次分发）。
- 如果以后要公开分享小屋，**需要保留上面 CC BY / CC BY-SA 几条的署名**；公有领域的不用署名。
- 下载方式：维基共享资源 `Special:FilePath/<文件名>` 直链（API 被限流时这条能用）。
