# AGENTS.md

面向在**本仓库内工作的编码 Agent**的说明。人类贡献者请看 [CONTRIBUTING.md](CONTRIBUTING.md)，使用者看 [README.md](README.md)。

---

## 项目是什么

Easy-Converter 是一个**纯静态前端**的转换工具台：进制 ↔ 文本、URL 编解码。没有构建步骤、没有依赖、没有后端，`index.html` 双击即可运行，同时部署在 GitHub Pages。

**最重要的约束：零依赖、零构建。** 不要引入 npm 包、打包器、TypeScript、框架（React/Vue 等）。不要新增 `package.json` 的运行时依赖。所有代码是原生 ES2020+ JavaScript，直接跑在浏览器里。

## 运行与验证

```bash
node test/run.mjs          # 全部单元测试（当前 168 项）
node --check assets/app.js # 语法检查，改完顺手跑
```

没有 dev server 也能开发：直接用浏览器打开 `index.html`。需要**图形界面验证**时（布局、交互、主题），用浏览器工具打开 `file:///<仓库绝对路径>/index.html`。注意浏览器会缓存 localStorage，调试「选项/输入没按预期恢复」时先清 `easy-converter:v1` 这个 key。

**提交前必须做**：`node test/run.mjs` 全绿，且改动涉及 UI 时实际打开页面看过。

## 目录结构

```
index.html             页面骨架；在底部 <script> 里按顺序引入公共层和每个工具
assets/app.css         全部样式，CSS 变量控制深浅主题
assets/app.js          框架：注册表、渲染、事件、持久化、快捷键
assets/lib/bytes.js    公共层：字节 ↔ 文本、字符集（window.EasyConverter.bytes）
tools/hex-utf8.js      进制（二/四/八/十六）↔ 文本
tools/url-encode.js    URL 百分号编解码
test/run.mjs           单元测试，node:vm 里加载工具，无浏览器依赖
```

## 架构要点

**工具即插件。** 每个 `tools/*.js` 是 IIFE，调用 `window.EasyConverter.define({...})` 注册。界面（侧栏、工具栏、双面板、状态条、复制/下载）全部由框架生成，工具**只做纯数据转换**，不碰 DOM。

**转换函数必须纯粹。** `decode(text, opts)` / `encode(text, opts)` 只读参数、返回结果对象，不得读写 `window`/`document`/localStorage。这样测试能在 `node:vm` 里直接调用。副作用一律放到 `onOptionChange` 或框架里。

**结果对象契约**

```js
// 成功
{ ok: true, text: "输出文本", stats: "可选，显示在输出面板右上角" }
// 失败
{ ok: false, error: "人类可读的原因", pos: 12, near: "48 65 ff" }
```

`pos` 是 0 基偏移，框架显示时会 +1；`near` 是出错处附近的原文。**报错要指到具体字节/字符**，这是本项目区别于随手写的转换器的核心价值，不要退化成「转换失败」。

**方向即 dirs。** `dirs[0]` 是默认方向。`key === "encode"` 的走 `encode()`，其余走 `decode()`。单方向工具只写一项，界面就不显示切换按钮。

**选项持久化** 存 localStorage 的 `easy-converter:v1`，键格式 `tool.id:dirKey`。**工具的 `id` 是对外契约**：改 id 会让老用户的选项和输入丢失。`hex-utf8` 这个 id 貌不副实但必须保留，已有历史包袱。

## 框架能力（改 UI 时先看这里）

在工具定义里，以下字段支持**函数形式** `(opts) => string`，选项变化时实时刷新：`dirs[].title`、`dirs[].desc`、`dirs[].inputLabel`、`dirs[].outputLabel`、`dirs[].placeholder`、`dirs[].sample`。

其他钩子：

| 能力 | 位置 | 用途 |
| --- | --- | --- |
| `showIf(opts)` | 选项定义 | 联动显隐。如「大写」只在 16 进制下出现 |
| `onOptionChange({key,prev,next,text,dir})` | 工具定义 | 选项变化时改写输入，返回新字符串或 `null`。进制工具用它换算输入 |
| `dirs[].sample` | 方向定义 | 配合「示例」按钮 |
| `refreshOptions()` | app.js 内部 | 只重建选项区，**不打断输入框焦点**，别改成整页 `render()` |

注意 `resolve()` 对函数形式的字段做了 try/catch，抛错时回退到默认文案，不会炸掉整个界面。

## 字符集公共层

`assets/lib/bytes.js` 是唯一处理「字节 ↔ 字符」的地方，两个工具都依赖它。改它等于改所有工具，**改动必须跑全量测试**。

- **UTF-8 是手写的**（`utf8Decode`），刻意不用 `TextDecoder`，因为要精确报出第几个字节坏了、是起始字节问题还是续字节问题。不要「简化」成 `new TextDecoder('utf-8')`，会丢掉错误定位能力。
- **GBK/Big5/Shift_JIS/EUC-KR** 走平台 `TextDecoder`，逐位试探（先试 2 字节、再试 1 字节）确定字符边界。不硬编码首尾字节范围表。
- **反向编码**没有预置码表：首次用某字符集编码时，用解码器反查出所有可用字符 → 字节的映射（约 18ms 建表，之后缓存）。所以 `encode` 对生僻字可能报「无法表示」，这是平台解码器能力决定的，不是 bug。

## 代码风格

- 中文注释与中文 UI 文案。文案口语、简短，不要客服腔（「您好」「希望可以帮到您」这类不要）。
- 缩进 2 空格；字符串用双引号；`(() => { "use strict"; ... })()` 包裹工具文件。
- 变量命名精简但达意；**不留死代码**，删掉的逻辑连同常量一起删（历史上 `SEPARATORS` 被删过两次，注意别复活）。
- 不写 `console.log` 调试输出；框架自身在 `define` 参数不全、`onOptionChange` 抛错时会 `console.error`，这是有意保留的。

## 测试约定

`test/run.mjs` 用 `node:vm` 把所有工具加载进同一沙箱，断言直接对着纯函数打。

**加工具时**：在 `loadAll()` 的 `for (const file of [...])` 列表里加上新文件，否则测试跑不到。

**写断言时**：用 `check(name, actual, expected)` 和 `checkTrue(name, cond, info)`。期望值要从**规范或独立实现**推出，不要从自己的实现倒抄。URL 工具那边就刻意与浏览器原生 `encodeURIComponent` / `encodeURI` 逐字节对照；进制工具的输出与 `Buffer` 对过。

**新工具至少覆盖**：正常路径、往返一致性、各类非法输入报错（含 `pos` 是否正确）、多字节字符（中文 / emoji）、边界值（空输入、最大码位）。

## 常见坑

- **别把工具 id 改了**（见上）。
- **别给转换函数加 DOM 依赖**，测试会在 Node 里直接调用并炸掉。
- **`index.html` 里脚本顺序**：`app.js` → `lib/bytes.js` → 各 `tools/*.js` → `boot()`。工具在定义时就会读 `EasyConverter.bytes`，顺序错了会 `undefined`。
- **改 `docs`/README 时**同步更新测试数量等具体数字，别让文档和代码漂移。
- Pages 部署是 `main` 分支根目录，推送后需一两分钟重建；验证线上请访问 <https://xeraph627.github.io/Easy-Converter/>。
- 提交信息用 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`），正文说明「为什么」而不只是「改了什么」。

## 扩展一个转换器（最短路径）

1. 复制 `tools/url-encode.js` 作为骨架。
2. 改 `id`（英文短横线）、`title`、`group`、`icon`、`keywords`、`dirs`、`options`。
3. 实现纯函数 `decode` / `encode`，失败时带 `pos`/`near`。
4. `index.html` 底部加一行 `<script src="tools/xxx.js"></script>`。
5. `test/run.mjs` 的 `loadAll()` 文件列表加进去，补断言。
6. `node test/run.mjs` 全绿，浏览器打开页面确认交互，README 的工具列表加一条。
