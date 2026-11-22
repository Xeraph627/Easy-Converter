/* 简易测试：不依赖任何框架，node test/run.mjs */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadTool(file) {
  const registry = [];
  const win = {
    EasyConverter: {
      define(def) {
        registry.push(def);
      },
    },
  };
  const sandbox = { window: win, TextEncoder, TextDecoder, Array, String, Math, console };
  vm.createContext(sandbox);
  const code = readFileSync(join(root, file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
  return registry;
}

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = typeof actual === "string" ? actual : JSON.stringify(actual);
  const e = typeof expected === "string" ? expected : JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    failures.push(`${name}\n  期望: ${e}\n  实际: ${a}`);
  }
}

function checkTrue(name, cond, info = "") {
  if (cond) pass++;
  else failures.push(`${name}${info ? "\n  " + info : ""}`);
}

const tools = loadTool("tools/hex-utf8.js");
checkTrue("注册了一个工具", tools.length === 1, `实际 ${tools.length} 个`);
const t = tools[0];

const D = (s, o = {}) => t.decode(s, { replaceInvalid: false, stripBom: true, ...o });
const E = (s, o = {}) => t.encode(s, { upper: true, sep: "space", ...o });

/* ---- 解码 ---- */
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

/* ---- 解码错误 ---- */
const noReplace = { replaceInvalid: false };
checkTrue("奇数位报错", D("4 8 6").ok === false);
checkTrue("奇数位报错文案", /奇数/.test(D("486").error || ""), D("486").error);
checkTrue("非法起始字节报错", D("FF").ok === false);
checkTrue("续字节错误报错", D("E4 41").ok === false);
checkTrue("续字节错误指位置", D("E4 41").pos === 0, String(D("E4 41").pos));
checkTrue("不完整序列报错", D("E4 BD").ok === false);
checkTrue("过长编码报错", D("C0 80").ok === false, JSON.stringify(D("C0 80")));
checkTrue("代理区报错", D("ED A0 80").ok === false);
checkTrue("超范围报错", D("F5 80 80 80").ok === false);
checkTrue("空输入报错", D("   ").ok === false);

/* ---- 替换模式 ---- */
check("替换非法字节", D("41 FF 42", { replaceInvalid: true }).text, "A\uFFFDB");
check("替换不完整序列", D("41 E4 BD", { replaceInvalid: true }).text, "A\uFFFD\uFFFD");
check("替换正常内容不受影响", D("E4 BD A0", { replaceInvalid: true }).text, "你");

/* ---- 编码 ---- */
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

/* ---- 往返 ---- */
const samples = ["Hello", "你好，世界", "🌊🐳", "a\r\nb\tc", "\u0000\u0001", "ﬁ ligature", "𝄞 clef", "汉字与 ASCII 混排 test 123"];
for (const s of samples) {
  const enc = E(s).text;
  const back = D(enc).text;
  check(`往返 ${JSON.stringify(s)}`, back, s);
}

/* ---- 统计信息 ---- */
checkTrue("解码统计有字节数", /字节/.test(D("48 65").stats || ""), D("48 65").stats);
checkTrue("编码统计有字节数", /字节/.test(E("你好").stats || ""), E("你好").stats);
checkTrue("字节数正确", D("E4 BD A0").stats.startsWith("3 字节"), D("E4 BD A0").stats);

/* ---- 输出 ---- */
console.log(`\n通过 ${pass} 项`);
if (failures.length) {
  console.log(`\n失败 ${failures.length} 项：\n`);
  for (const f of failures) console.log("✗ " + f + "\n");
  process.exit(1);
}
console.log("全部通过 ✓");
