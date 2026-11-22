/* 十六进制 ↔ UTF-8 文本 */
(() => {
  "use strict";

  const hex2 = (n) => n.toString(16).padStart(2, "0");

  /* 把带分隔符/前缀的十六进制字符串切成字节 */
  function parseHex(src) {
    const cleaned = src.replace(/\\x/gi, " ").replace(/0x/gi, " ");
    const bytes = [];
    const re = /[0-9a-fA-F]+/g;
    let m;

    while ((m = re.exec(cleaned))) {
      const tok = m[0];
      if (tok.length % 2 !== 0) {
        return {
          ok: false,
          error: `十六进制位数是奇数（${tok.length} 位）`,
          pos: m.index,
          near: tok.slice(0, 24),
        };
      }
      for (let i = 0; i < tok.length; i += 2) {
        bytes.push(parseInt(tok.slice(i, i + 2), 16));
      }
    }

    if (!bytes.length) {
      return { ok: false, error: "没有找到十六进制内容" };
    }
    return { ok: true, bytes };
  }

  /* 手写 UTF-8 解码：为了能在出错时说出具体是第几个字节 */
  function decodeUtf8(bytes, replaceInvalid) {
    let out = "";
    let i = 0;
    const len = bytes.length;

    while (i < len) {
      const b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
        continue;
      }

      let need;
      let cp;
      let min;
      if (b >= 0xc2 && b <= 0xdf) {
        need = 1;
        cp = b & 0x1f;
        min = 0x80;
      } else if (b >= 0xe0 && b <= 0xef) {
        need = 2;
        cp = b & 0x0f;
        min = 0x800;
      } else if (b >= 0xf0 && b <= 0xf4) {
        need = 3;
        cp = b & 0x07;
        min = 0x10000;
      } else {
        if (!replaceInvalid) {
          return {
            ok: false,
            error: `字节 0x${hex2(b)} 不是合法的 UTF-8 起始字节`,
            pos: i,
            near: bytes
              .slice(Math.max(0, i - 3), i + 4)
              .map((x) => hex2(x))
              .join(" "),
          };
        }
        out += "\uFFFD";
        i += 1;
        continue;
      }

      if (i + need >= len) {
        if (!replaceInvalid) {
          return {
            ok: false,
            error: `UTF-8 序列不完整：0x${hex2(b)} 后面还缺 ${need - (len - 1 - i)} 个字节`,
            pos: i,
            near: bytes
              .slice(Math.max(0, i - 3), len)
              .map((x) => hex2(x))
              .join(" "),
          };
        }
        out += "\uFFFD";
        i += 1;
        continue;
      }

      let okSeq = true;
      for (let k = 1; k <= need; k++) {
        const cb = bytes[i + k];
        if ((cb & 0xc0) !== 0x80) {
          if (!replaceInvalid) {
            return {
              ok: false,
              error: `第 ${i + k + 1} 个字节 0x${hex2(cb)} 不是合法的续字节（应以 0x80~0xBF 开头）`,
              pos: i,
              near: bytes
                .slice(Math.max(0, i - 3), i + need + 2)
                .map((x) => hex2(x))
                .join(" "),
            };
          }
          okSeq = false;
          break;
        }
        cp = (cp << 6) | (cb & 0x3f);
      }

      if (!okSeq) {
        out += "\uFFFD";
        i += 1;
        continue;
      }

      const tooHigh = cp > 0x10ffff;
      const surrogate = cp >= 0xd800 && cp <= 0xdfff;
      if (cp < min || tooHigh || surrogate) {
        if (!replaceInvalid) {
          return {
            ok: false,
            error: tooHigh
              ? "码点超出 Unicode 范围（> U+10FFFF）"
              : surrogate
                ? "UTF-8 中不允许出现代理区码点（U+D800~U+DFFF）"
                : "非法的过长编码（overlong UTF-8）",
            pos: i,
            near: bytes
              .slice(i, i + need + 1)
              .map((x) => hex2(x))
              .join(" "),
          };
        }
        out += "\uFFFD";
        i += need + 1;
        continue;
      }

      out += String.fromCodePoint(cp);
      i += need + 1;
    }

    return { ok: true, text: out };
  }

  const SEPARATORS = {
    space: " ",
    none: "",
    newline: "\n",
    comma: ",",
    "comma-space": ", ",
  };

  window.EasyConverter.define({
    id: "hex-utf8",
    title: "十六进制 → UTF-8 文本",
    group: "编码转换",
    icon: "0x",
    desc: "把 48 65 6C 6C 6F 这样的字节串还原成文字，也能反过来把文字导成十六进制字节。支持 0x、\\x 前缀和空格、逗号、换行、短横线等分隔符。",
    keywords: ["hex", "utf8", "utf-8", "编码", "解码", "字节", "十六进制", "乱码"],

    dirs: [
      {
        key: "decode",
        label: "十六进制 → 文本",
        title: "十六进制 → UTF-8 文本",
        inputLabel: "十六进制字节",
        outputLabel: "UTF-8 文本",
        desc: "粘贴字节串，自动还原成文字。中间夹的 0x、\\x、逗号、短横线、换行都会被忽略。",
        sample: "E4 BD A0 E5 A5 BD EF BC 8C E4 B8 96 E7 95 8C",
        placeholder: "例如：48 65 6C 6C 6F 或者 48656C6C6F",
      },
      {
        key: "encode",
        label: "文本 → 十六进制",
        title: "UTF-8 文本 → 十六进制",
        inputLabel: "文本",
        outputLabel: "UTF-8 十六进制",
        desc: "把文字按 UTF-8 编码成字节，方便比对报文、写入协议字段。emoji 也会拆成 4 个字节。",
        sample: "你好，世界 Hello 🌊",
        placeholder: "在这里输入任意文本",
      },
    ],

    options: [
      {
        key: "replaceInvalid",
        label: "容错模式（坏字节不算错）",
        type: "check",
        default: false,
        dirs: ["decode"],
      },
      { key: "stripBom", label: "去掉 BOM", type: "check", default: true, dirs: ["decode"] },
      { key: "upper", label: "大写", type: "check", default: true, dirs: ["encode"] },
      {
        key: "sep",
        label: "分隔",
        type: "select",
        default: "space",
        dirs: ["encode"],
        choices: [
          ["space", "空格"],
          ["none", "无"],
          ["newline", "换行"],
          ["0x-with-space", "0x 前缀"],
          ["slash-x", "\\x 前缀"],
          ["comma", "逗号"],
          ["comma-space", "逗号+空格"],
        ],
      },
    ],

    decode(text, opts) {
      const parsed = parseHex(text);
      if (!parsed.ok) return parsed;

      let bytes = parsed.bytes;
      let bom = false;
      if (opts.stripBom && bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        bytes = bytes.slice(3);
        bom = true;
      }

      const dec = decodeUtf8(bytes, !!opts.replaceInvalid);
      if (!dec.ok) return dec;

      const chars = Array.from(dec.text).length;
      const parts = [`${parsed.bytes.length} 字节`, `${chars} 字符`];
      if (bom) parts.push("已去 BOM");
      return { ok: true, text: dec.text, stats: parts.join(" · ") };
    },

    encode(text, opts) {
      const bytes = Array.from(new TextEncoder().encode(text));
      if (!bytes.length) return { ok: false, error: "没有可编码的内容" };

      const sep = SEPARATORS[opts.sep] ?? " ";
      let hexList = bytes.map((b) => hex2(b));
      if (opts.upper !== false) hexList = hexList.map((h) => h.toUpperCase());

      let out;
      if (opts.sep === "0x-with-space") out = hexList.map((h) => "0x" + h).join(" ");
      else if (opts.sep === "slash-x") out = hexList.map((h) => "\\x" + h).join("");
      else out = hexList.join(sep);

      return {
        ok: true,
        text: out,
        stats: `${Array.from(text).length} 字符 · ${bytes.length} 字节`,
      };
    },
  });
})();
