# Easy-Converter

一个纯前端的小工具台。打开 `index.html` 就能用，不联网、不上传任何数据，所有转换都在浏览器里完成。

目前只有一个工具：**十六进制 ↔ UTF-8 文本**。框架是按「以后还要加更多」设计的，加新工具不需要动界面代码。

## 用法

双击 `index.html`，或者用任意浏览器打开。

- **十六进制 → 文本**：粘贴 `E4 BD A0 E5 A5 BD`、`E4BDA0E5A5BD`、`0xE4 0xBD`、`\xE4\xBD`、`E4,BD,A0` 都能识别，空格、逗号、换行、短横线随意混。
- **文本 → 十六进制**：输出大小写、分隔符（空格 / 无 / 换行 / `0x` 前缀 / `\x` 前缀 / 逗号）可选。
- 出错时会指出**第几个字节**有问题、附近是什么内容，而不是丢一句「转换失败」。
- 支持拖入 txt 文件、粘贴按钮、复制、导出 txt。
- 输入内容和选项自动保存，刷新页面不丢。

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

2. 在 `index.html` 底部按顺序加一行：

```html
<script src="tools/base64.js"></script>
```

刷新页面就有了。侧栏、搜索、双向切换、复制、下载、状态提示、选项保存全部由框架处理。

### 约定

- `decode` / `encode` 是**纯函数**：只读参数、不碰 DOM，返回结果对象。这样可以直接被 `test/run.mjs` 在 Node 里跑。
- 失败时尽量给 `pos`（出错位置，0 起）和 `near`（附近内容），界面会把它们显示在状态条里。
- `stats` 是可选的统计信息，显示在输出面板右上角。
- 只有一个方向时，`dirs` 只写一项，界面上就不会出现方向切换。

## 测试

```bash
node test/run.mjs
```

测试用 `vm` 加载 `tools/` 里的文件，不需要浏览器、不需要安装依赖。加新工具时照着 `test/run.mjs` 里的写法加断言即可。

## 目录

```
index.html          页面骨架，在这里引入工具脚本
assets/app.css      样式（深/浅主题）
assets/app.js       框架：注册、渲染、事件、持久化
tools/hex-utf8.js   十六进制 ↔ UTF-8
test/run.mjs        单元测试
```

## 说明

UTF-8 解码是手写的，没有直接用 `TextDecoder`，为的是出错时能准确报出是第几个字节、哪一段不合法。宽容模式下坏字节按 U+FFFD 替换，和浏览器的行为一致。

## License

MIT
