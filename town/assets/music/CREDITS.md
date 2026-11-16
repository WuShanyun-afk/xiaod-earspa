# 音乐素材来源（assets/music）

唱片机（M13）放的三张唱片，全部来自 **OpenGameArt**，都是 **CC0**（可以让任何人随便用、不用署名，
这里还是记一手来源，方便以后换）。

| 文件 | 曲名（小屋里显示的） | 来源 | 作者 | 许可证 |
| --- | --- | --- | --- | --- |
| `lofi1.ogg` | Lo-fi 一号 | OpenGameArt「lofi hip hop」 | 见站点页面 | CC0 |
| `lofi2.mp3` | Lo-fi 二号 | OpenGameArt「Chill lofi inspired」 | 见站点页面 | CC0 |
| `jazz1.mp3` | 深夜爵士 | OpenGameArt「Jazz Slower」（Jazz Take 2） | 见站点页面 | CC0 |

播放方式：`src/sfx.js` 里的 `loadMusic / playMusic / stopMusic`（`decodeAudioData` 解码进内存，
走同一个主音量 + 静音 + 混响；音乐声源定位在唱片机那个角落，走远了会小）。
点唱机 = 放 / 停；点旁边的唱片箱 = 换一张；一首放完会自动接下一张。

> 想加/换歌：把新文件丢进这个文件夹（mp3/ogg 都行），改 `src/records.js` 顶部的 `TRACKS` 数组就行。
