/* 十六进制 ↔ 文本（字符集可选，默认 UTF-8） */
(() => {
  "use strict";

  const B = window.EasyConverter.bytes;
  const hex2 = B.hex2;

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

  const SEPARATORS = {
    space: " ",
    none: "",
    newline: "\n",
    comma: ",",
    "comma-space": ", ",
  };

  window.EasyConverter.define({
    id: "hex-utf8",
    title: "十六进制 ↔ 文本",
    group: "编码转换",
    icon: "0x",
    desc: "把 48 65 6C 6C 6F 这样的字节串还原成文字，也能反过来把文字导成十六进制字节。支持 0x、\\x 前缀和空格、逗号、换行、短横线等分隔符，字符集可切换 GBK/Big5 等。",
    keywords: ["hex", "utf8", "utf-8", "gbk", "编码", "解码", "字节", "十六进制", "乱码"],

    dirs: [
      {
        key: "decode",
        label: "十六进制 → 文本",
        title: (opts) => `十六进制 → ${B.labelOf(opts.charset)} 文本`,
        inputLabel: "十六进制字节",
        outputLabel: (opts) => `${B.labelOf(opts.charset)} 文本`,
        desc: "粘贴字节串，自动还原成文字。中间夹的 0x、\\x、逗号、短横线、换行都会被忽略。",
        sample: "E4 BD A0 E5 A5 BD EF BC 8C E4 B8 96 E7 95 8C",
        placeholder: "例如：48 65 6C 6C 6F 或者 48656C6C6F",
      },
      {
        key: "encode",
        label: "文本 → 十六进制",
        title: (opts) => `${B.labelOf(opts.charset)} 文本 → 十六进制`,
        inputLabel: "文本",
        outputLabel: (opts) => `${B.labelOf(opts.charset)} 十六进制`,
        desc: "把文字按指定字符集编码成字节，方便比对报文、写入协议字段。emoji 也会拆成 4 个字节。",
        sample: "你好，世界 Hello 🌊",
        placeholder: "在这里输入任意文本",
      },
    ],

    options: [
      {
        key: "charset",
        label: "字符集",
        type: "select",
        default: "utf-8",
        choices: B.CHARSETS.map((c) => [c.id, c.label]),
      },
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
      const charset = opts.charset || "utf-8";
      let bom = false;
      if (opts.stripBom && bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        bytes = bytes.slice(3);
        bom = true;
      }

      const dec = B.decode(bytes, charset, !!opts.replaceInvalid);
      if (!dec.ok) return dec;

      const chars = Array.from(dec.text).length;
      const parts = [`${parsed.bytes.length} 字节`, `${chars} 字符`];
      if (bom) parts.push("已去 BOM");
      return { ok: true, text: dec.text, stats: parts.join(" · ") };
    },

    encode(text, opts) {
      const charset = opts.charset || "utf-8";
      const enc = B.encode(text, charset);
      if (!enc.ok) return enc;
      const bytes = enc.bytes;
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
