# Easy-Converter

一个纯前端的小工具台。不联网、不上传任何数据，所有转换都在浏览器里完成。

## 在线使用

已部署到 GitHub Pages，直接用浏览器打开即可：

**<https://xeraph627.github.io/Easy-Converter/>**

手机上也能用，窄屏会自动变成抽屉式侧栏。收藏这个地址就不用管本地文件了。

## 离线使用

把仓库下载或 `git clone` 到本地，双击 `index.html` 即可，不需要安装依赖，也不需要起服务器。

## 现有的工具

框架是按「以后还要加更多」设计的，加新工具不需要动界面代码。

- **十六进制 ↔ 文本**：粘贴 `E4 BD A0 E5 A5 BD`、`E4BDA0E5A5BD`、`0xE4 0xBD`、`\xE4\xBD`、`E4,BD,A0` 都能识别，空格、逗号、换行、短横线随意混。字符集默认 UTF-8，可切 GBK / Big5 / Shift_JIS / EUC-KR / Latin-1 等，专治老系统的乱码。
- **URL 编码 / 解码**：百分号编码互转。解码认 `%E4%BD%A0` 这类 UTF-8 序列，可选把 `+` 当空格（表单提交的老习惯），坏的 `%` 序列默认原样保留而不是报错。编码可切换保留范围——「组件」按 `encodeURIComponent` 语义（斜杠也编码），「整条 URL」保留 `:/?&=` 等结构字符。

其他细节：

- 出错时会指出**第几个字节 / 哪个字符**有问题、附近是什么内容，而不是丢一句「转换失败」。
- 支持拖入 txt 文件、粘贴按钮、复制、导出 txt。
- 输入内容和选项自动保存，刷新页面不丢。
- 深色 / 浅色主题切换。

快捷键：

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl + K` | 聚焦搜索框 |
| `Ctrl + Enter` | 立即转换（平时是输入即转） |
| `Ctrl + Shift + C` | 复制输出 |

## 加一个新转换器

1. 在 `tools/` 下新建一个 js 文件，例如 `tools/base64.js`：

```js
window.EasyConverter.define({
  id: "base64",
  title: "Base64 编解码",
  group: "编码转换",      // 侧栏分组，相同分组会排在一起
  icon: "B64",           // 侧栏小图标，1~3 个字符
  desc: "一句话说明，会显示在标题下面",
  keywords: ["base64", "b64"],

  dirs: [
    {
      key: "decode",
      label: "Base64 → 文本",
      inputLabel: "Base64",
      outputLabel: "文本",
      sample: "5L2g5aW9",
    },
    {
      key: "encode",
      label: "文本 → Base64",
      inputLabel: "文本",
      outputLabel: "Base64",
      sample: "你好",
    },
  ],

  // 可选：控件自动渲染并持久化
  options: [
    { key: "urlSafe", label: "URL 安全", type: "check", default: false, dirs: ["decode", "encode"] },
    {
      key: "pad", label: "填充", type: "select", default: "on",
      choices: [["on", "保留 ="], ["off", "去掉 ="]],   // 内部按索引存，放心用任意值
    },
  ],

  // 必须：dirs 里 key 为 encode 的那个走 encode，其余走 decode
  decode(text, opts) {
    // 返回 { ok: true, text, stats } 或 { ok: false, error, pos?, near? }
    return { ok: true, text: "解出来的内容", stats: "12 字节" };
  },

  encode(text, opts) {
    return { ok: true, text: "编出来的内容", stats: "3 字符" };
  },
});
```

2. 在 `index.html` 底部按顺序加一行（注意要在 `assets/lib/bytes.js` 之后）：

```html
<script src="tools/base64.js"></script>
```

刷新页面就有了。侧栏、搜索、双向切换、复制、下载、状态提示、选项保存全部由框架处理。

### 约定

- `decode` / `encode` 是**纯函数**：只读参数、不碰 DOM，返回结果对象。这样可以直接被 `test/run.mjs` 在 Node 里跑。
- 失败时尽量给 `pos`（出错位置，0 起）和 `near`（附近内容），界面会把它们显示在状态条里。
- `stats` 是可选的统计信息，显示在输出面板右上角。
- 只有一个方向时，`dirs` 只写一项，界面上就不会出现方向切换。
- 需要字节 ↔ 文本转换的，直接用公共层 `EasyConverter.bytes`（见下），不用自己再写一遍。
- 想让标题、面板名随选项变化，把它们写成函数 `(opts) => string` 即可，改选项时会实时刷新。例如十六进制工具切到 GBK 后，面板名会变成「GBK（GB2312）文本」。

### 公共层：`EasyConverter.bytes`

`assets/lib/bytes.js` 提供字节与字符集的转换，是十六进制工具和 URL 工具共用的底层：

```js
const B = window.EasyConverter.bytes;

B.decode(bytes, "gbk");            // → { ok:true, text } 或 { ok:false, error, pos?, near? }
B.encode("你好", "gbk");           // → { ok:true, bytes:[0xC4,0xE3,...] }
B.CHARSETS;                        // [{id,label}, ...] 可直接喂给 select 的 choices
B.labelOf("big5");                 // "Big5"
B.toHex([0x41, 0xff]);             // "41 ff"
```

UTF-8 是手写解码器，为的是出错时能说清是第几个字节。GBK / Big5 / Shift_JIS / EUC-KR 走平台的 `TextDecoder`，逐位试探确定字符边界；反向编码则在运行时用解码器反查出字节表，所以不需要预置码表，也不额外占体积。

## 测试

```bash
node test/run.mjs
```

测试用 `vm` 加载 `assets/lib/` 和 `tools/` 里的文件，不需要浏览器、不需要安装依赖。加新工具时照着 `test/run.mjs` 里的写法加断言即可。URL 工具那部分还会和浏览器原生的 `encodeURIComponent` / `encodeURI` 逐字节对照。

## 目录

```
index.html             页面骨架，在这里引入工具脚本
assets/app.css         样式（深/浅主题）
assets/app.js          框架：注册、渲染、事件、持久化
assets/lib/bytes.js    公共层：字节 ↔ 文本、字符集支持
tools/hex-utf8.js      十六进制 ↔ 文本
tools/url-encode.js    URL 编码 / 解码
test/run.mjs           单元测试
```

## 部署

纯静态站点，没有任何构建步骤。GitHub Pages 直接指向仓库根目录的 `main` 分支即可。

推送到 `main` 后 Pages 需要一两分钟重新构建，然后访问 <https://xeraph627.github.io/Easy-Converter/> 就能看到更新。

## License

MIT
