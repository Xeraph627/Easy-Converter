/* 简易测试：不依赖任何框架，node test/run.mjs */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* 在同一个沙箱里加载公共库和全部工具，模拟浏览器里的加载顺序 */
function loadAll() {
  const registry = [];
  const win = {
    EasyConverter: {
      define(def) {
        registry.push(def);
      },
    },
  };
  const sandbox = {
    window: win,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Array,
    String,
    Math,
    console,
  };
  vm.createContext(sandbox);
  for (const file of ["assets/lib/bytes.js", "tools/hex-utf8.js", "tools/url-encode.js"]) {
    vm.runInContext(readFileSync(join(root, file), "utf8"), sandbox, { filename: file });
  }
  return { registry, bytes: win.EasyConverter.bytes, tool: (id) => registry.find((t) => t.id === id) };
}

const { registry, bytes, tool } = loadAll();

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = typeof actual === "string" ? actual : JSON.stringify(actual);
  const e = typeof expected === "string" ? expected : JSON.stringify(expected);
  if (a === e) pass++;
  else failures.push(`${name}\n  期望: ${e}\n  实际: ${a}`);
}

function checkTrue(name, cond, info = "") {
  if (cond) pass++;
  else failures.push(`${name}${info ? "\n  " + info : ""}`);
}

function group(title) {
  console.log(`\n· ${title}`);
}

/* ================= 十六进制 ↔ UTF-8 ================= */
group("十六进制 ↔ UTF-8");
checkTrue("注册了工具", registry.length >= 1, `实际 ${registry.length} 个`);
const t = tool("hex-utf8");

const D = (s, o = {}) => t.decode(s, { replaceInvalid: false, stripBom: true, charset: "utf-8", ...o });
const E = (s, o = {}) => t.encode(s, { upper: true, sep: "space", charset: "utf-8", ...o });

check("空格分隔", D("48 65 6C 6C 6F").text, "Hello");
check("无分隔", D("48656C6C6F").text, "Hello");
check("小写", D("48656c6c6f").text, "Hello");
check("0x 前缀", D("0x48 0x65 0x6C 0x6C 0x6F").text, "Hello");
check("\\x 前缀", D("\\x48\\x65\\x6c\\x6c\\x6f").text, "Hello");
check("逗号分隔", D("48,65,6C").text, "Hel");
check("换行分隔", D("48\n65\r\n6C").text, "Hel");
check("短横线分隔", D("48-65-6C").text, "Hel");
check("中文", D("E4 BD A0 E5 A5 BD").text, "你好");
check("中文无空格", D("E4BDA0E5A5BD").text, "你好");
check("全角标点", D("EF BC 8C").text, "，");
check("emoji 4 字节", D("F0 9F 8C 8A").text, "🌊");
check("Latin-1 区 2 字节", D("C3 A9").text, "é");
check("混合文本", D("48 65 6C 6C 6F 20 E4 B8 96 E7 95 8C 21").text, "Hello 世界!");
check("3 字节最大值", D("EF BF BF").text, "\uFFFF");
check("4 字节最大值", D("F4 8F BF BF").text, String.fromCodePoint(0x10ffff));
check("BOM 去掉", D("EF BB BF 41").text, "A");
check("BOM 保留", D("EF BB BF 41", { stripBom: false }).text, "\uFEFFA");
check("空行不影响", D("\n\n48 65\n\n").text, "He");

checkTrue("奇数位报错", D("4 8 6").ok === false);
checkTrue("奇数位报错文案", /奇数/.test(D("486").error || ""), D("486").error);
checkTrue("非法起始字节报错", D("FF").ok === false);
checkTrue("续字节错误报错", D("E4 41").ok === false);
checkTrue("续字节错误指位置", D("E4 41").pos === 0, String(D("E4 41").pos));
checkTrue("不完整序列报错", D("E4 BD").ok === false);
checkTrue("过长编码报错", D("C0 80").ok === false);
checkTrue("代理区报错", D("ED A0 80").ok === false);
checkTrue("超范围报错", D("F5 80 80 80").ok === false);
checkTrue("空输入报错", D("   ").ok === false);

check("替换非法字节", D("41 FF 42", { replaceInvalid: true }).text, "A\uFFFDB");
check("替换不完整序列", D("41 E4 BD", { replaceInvalid: true }).text, "A\uFFFD\uFFFD");
check("替换正常内容不受影响", D("E4 BD A0", { replaceInvalid: true }).text, "你");

check("编码 Hello", E("Hello").text, "48 65 6C 6C 6F");
check("编码中文", E("你好").text, "E4 BD A0 E5 A5 BD");
check("编码 emoji", E("🌊").text, "F0 9F 8C 8A");
check("小写选项", E("Hello", { upper: false }).text, "48 65 6c 6c 6f");
check("无分隔", E("Hi", { sep: "none" }).text, "4869");
check("换行分隔", E("Hi", { sep: "newline" }).text, "48\n69");
check("0x 前缀", E("Hi", { sep: "0x-with-space" }).text, "0x48 0x69");
check("\\x 前缀", E("Hi", { sep: "slash-x" }).text, "\\x48\\x69");
check("逗号分隔", E("Hi", { sep: "comma" }).text, "48,69");
check("逗号加空格", E("Hi", { sep: "comma-space" }).text, "48, 69");
checkTrue("空文本报错", E("").ok === false);

/* 非 UTF-8 字符集 */
check("GBK 解码", D("C4 E3 BA C3", { charset: "gbk" }).text, "你好");
check("GBK 编码", E("你好", { charset: "gbk" }).text, "C4 E3 BA C3");
check("GBK 往返", D(E("中文测试", { charset: "gbk" }).text, { charset: "gbk" }).text, "中文测试");
check("Big5 往返", D(E("中文測試", { charset: "big5" }).text, { charset: "big5" }).text, "中文測試");
check("Shift_JIS 往返", D(E("こんにちは", { charset: "shift_jis" }).text, { charset: "shift_jis" }).text, "こんにちは");
check("EUC-KR 往返", D(E("안녕하세요", { charset: "euc-kr" }).text, { charset: "euc-kr" }).text, "안녕하세요");
check("Latin-1 往返", D(E("café", { charset: "iso-8859-1" }).text, { charset: "iso-8859-1" }).text, "café");
checkTrue("GBK 坏字节报错", D("FF FF", { charset: "gbk" }).ok === false, JSON.stringify(D("FF FF", { charset: "gbk" })));
checkTrue("GBK 遇到 emoji 报错", E("你好🌊", { charset: "gbk" }).ok === false);
checkTrue("GBK emoji 报错带字符", /🌊/.test(E("你好🌊", { charset: "gbk" }).error || ""), E("你好🌊", { charset: "gbk" }).error);

/* ================= URL 编码 / 解码 ================= */
group("URL 编码 / 解码");
const u = tool("url-encode");
checkTrue("注册了 URL 工具", !!u);

const UD = (s, o = {}) => u.decode(s, { plusAsSpace: false, invalid: "keep", charset: "utf-8", ...o });
const UE = (s, o = {}) => u.encode(s, { preset: "component", spaceAsPlus: false, upper: true, ...o });

check("中文解码", UD("%E4%BD%A0%E5%A5%BD").text, "你好");
check("小写十六进制", UD("%e4%bd%a0%e5%a5%bd").text, "你好");
check("混合内容", UD("%E4%BD%A0%E5%A5%BD%EF%BC%8C%E4%B8%96%E7%95%8C%20a%2Bb%3Dc").text, "你好，世界 a+b=c");
check("空格编码", UD("a%20b").text, "a b");
check("未编码内容原样", UD("hello world").text, "hello world");
check("emoji 解码", UD("%F0%9F%8C%8A").text, "🌊");
check("全角标点", UD("%EF%BC%8C").text, "，");
check("查询串完整解码", UD("q=%E4%B8%AD%E6%96%87&page=2").text, "q=中文&page=2");

check("+ 当空格", UD("a+b", { plusAsSpace: true }).text, "a b");
check("+ 不当空格", UD("a+b", { plusAsSpace: false }).text, "a+b");
check("+ 当空格（多字节）", UD("%E4%BD%A0+%E5%A5%BD", { plusAsSpace: true }).text, "你 好");

checkTrue("坏 %XX 默认保留", UD("100%25 done").text === "100% done");
checkTrue("孤立 % 默认保留", UD("100% off").text === "100% off", JSON.stringify(UD("100% off")));
checkTrue("坏 %XX 严格报错", UD("abc%ZZ", { invalid: "strict" }).ok === false);
checkTrue("坏 %XX 报错文案", /百分号/.test(UD("abc%ZZ", { invalid: "strict" }).error || ""), UD("abc%ZZ", { invalid: "strict" }).error);
checkTrue("缺一位十六进制报错", /缺一位/.test(UD("abc%2", { invalid: "strict" }).error || ""), UD("abc%2", { invalid: "strict" }).error);
checkTrue("坏 UTF-8 报错", UD("%FF").ok === false);

check("编码中文", UE("你好").text, "%E4%BD%A0%E5%A5%BD");
check("编码空格", UE("a b").text, "a%20b");
check("空格写 +", UE("a b", { spaceAsPlus: true }).text, "a+b");
check("小写 %xx", UE("你好", { upper: false }).text, "%e4%bd%a0%e5%a5%bd");
check("保留 unreserved", UE("a-b_c.d~e*'f!g") .text, "a-b_c.d~e*'f!g");
check("组件模式编码斜杠", UE("a/b").text, "a%2Fb");
check("整条 URL 保留斜杠", UE("https://a.com/x?y=1", { preset: "uri" }).text, "https://a.com/x?y=1");
check("整条 URL 编码中文", UE("https://a.com/中文", { preset: "uri" }).text, "https://a.com/%E4%B8%AD%E6%96%87");
check("最严格模式", UE("a=b&c", { preset: "strict" }).text, "a%3Db%26c");
check("严格模式保留点号", UE("a.b-c_d~e", { preset: "strict" }).text, "a.b-c_d~e");
check("加号要编码", UE("a+b").text, "a%2Bb");
checkTrue("空文本报错", UE("").ok === false);

/* 和浏览器原生实现对照 */
const sample = "你好 世界 a+b=c&d 100% 🌊 ~!*'()";
check("编码与 encodeURIComponent 一致", UE(sample).text, encodeURIComponent(sample));
check("编码与 encodeURI 一致", UE(sample, { preset: "uri" }).text, encodeURI(sample));
check("解码与 decodeURIComponent 一致", UD(encodeURIComponent(sample)).text, sample);

/* 往返 */
for (const s of ["你好，世界", "a b c", "100%", "a+b=c", "🌊🐳", "https://例子.com/路径?q=x y", "~!*'()"]) {
  check(`URL 往返 ${JSON.stringify(s)}`, UD(UE(s).text).text, s);
}

/* GBK 表单场景：老系统 %XX 是 GBK 字节 */
check("GBK 编码的 URL", UD("%C4%E3%BA%C3", { charset: "gbk" }).text, "你好");

/* ================= 共用层 ================= */
group("字节工具层");
check("labelOf", bytes.labelOf("gbk"), "GBK（GB2312）");
check("toHex", bytes.toHex([0x41, 0xff, 0x0a]), "41 ff 0a");
checkTrue("支持 gbk", bytes.supported("gbk"));
checkTrue("支持 big5", bytes.supported("big5"));
check("空字节解码", bytes.decode([], "utf-8").text, "");

/* ================= 结果 ================= */
console.log(`\n通过 ${pass} 项`);
if (failures.length) {
  console.log(`\n失败 ${failures.length} 项：\n`);
  for (const f of failures) console.log("✗ " + f + "\n");
  process.exit(1);
}
console.log("全部通过 ✓");
