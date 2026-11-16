# 咖啡馆音频（M41）· 出处与授权

全部是 **CC0 1.0（公有领域）**，可以随便用、商用也不用署名；这里还是把出处记下来，方便以后换。

| 文件 | 是什么 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- | --- |
| `cafe-ambience.mp3` | 咖啡店底噪（人声/杯碟，6 分多钟，循环用） | https://freesound.org/people/samyi/sounds/382314/ | samyi | CC0 1.0 |
| `espresso-machine.mp3` | 咖啡机启动 / 磨豆 | https://freesound.org/people/kyrika84/sounds/347429/ | kyrika84 | CC0 1.0 |
| `cup-clink.mp3` | 杯子放碟子上的"叮" | https://freesound.org/people/bowlingballout/sounds/568758/ | bowlingballout | CC0 1.0 |

下载的是 freesound 的 **lq 预览 mp3**（体积小，够当环境声用），没有转码。
`src/cafe.js` 里：进店循环放 `cafe-ambience`（音量 0.2）、点咖啡机放 `espresso-machine`、点单/端杯放 `cup-clink`；
按 **M 静音**时底噪会一起停。
