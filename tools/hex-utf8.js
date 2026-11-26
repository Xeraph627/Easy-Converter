/* 进制 ↔ 文本：二进制 / 四进制 / 八进制 / 十六进制 ↔ 字符集文本 */
(() => {
  "use strict";

  const B = window.EasyConverter.bytes;

  /* 每个字节用几位数表示：
   *   2 进制 8 位、4 进制 4 位、8 进制 3 位（od 的八进制惯例）、16 进制 2 位 */
  const RADICES = {
    2: { id: "2", name: "二进制", perByte: 8, prefix: "0b" },
    4: { id: "4", name: "四进制", perByte: 4, prefix: "" },
    8: { id: "8", name: "八进制", perByte: 3, prefix: "0o" },
    16: { id: "16", name: "十六进制", perByte: 2, prefix: "0x" },
  };

  const radixOf = (opts) => RADICES[Number(opts && opts.radix)] || RADICES[16];

  /* 补零到指定位数 */
  function padDigits(value, radix, width) {
    return value.toString(radix).padStart(width, "0");
  }

  function digitsOfByte(byte, radix, upper) {
    const info = RADICES[radix];
    let out = padDigits(byte, radix, info.perByte);
    if (radix === 16 && upper) out = out.toUpperCase();
    return out;
  }

  /* 解析：把任意分隔的内容切成字节。
   * 前缀（0x / 0b / 0o / \x）用等长空格替换，这样报错位置仍然对得上原文。 */
  function parseDigits(src, radix) {
    const info = RADICES[radix];
    const group = info.perByte;

    const mask = (m) => " ".repeat(m.length);
    const cleaned = src
      .replace(/\\x/gi, mask)
      .replace(/0[xXbBoO]/g, mask);

    const re =
      radix === 16 ? /[0-9a-fA-F]+/g : radix === 8 ? /[0-7]+/g : radix === 4 ? /[0-3]+/g : /[01]+/g;

    const bytes = [];
    let m;

    while ((m = re.exec(cleaned))) {
      const tok = m[0];
      if (tok.length % group !== 0) {
        return {
          ok: false,
          error: `${info.name}每 ${group} 位表示一个字节，这里出现了 ${tok.length} 位`,
          pos: m.index,
          near: tok.slice(0, 32),
        };
      }
      for (let i = 0; i < tok.length; i += group) {
        const piece = tok.slice(i, i + group);
        const value = parseInt(piece, radix);
        if (value > 0xff) {
          return {
            ok: false,
            error: `「${piece}」超出单字节范围（最大 ${padDigits(0xff, radix, group)}）`,
            pos: m.index + i,
            near: piece,
          };
        }
        bytes.push(value);
      }
    }

    if (!bytes.length) {
      return { ok: false, error: `没有找到${info.name}内容` };
    }
    return { ok: true, bytes };
  }

  /* 把字节按指定进制拼成文本 */
  function formatBytes(bytes, opts) {
    const info = radixOf(opts);
    const radix = Number(info.id);
    const upper = radix === 16 && opts.upper !== false;
    const list = bytes.map((b) => digitsOfByte(b, radix, upper));

    switch (opts.sep) {
      case "none":
        return list.join("");
      case "newline":
        return list.join("\n");
      case "comma":
        return list.join(",");
      case "comma-space":
        return list.join(", ");
      case "0x-with-space":
        return info.prefix ? list.map((d) => info.prefix + d).join(" ") : list.join(" ");
      case "slash-x":
        // C 语言的 \x 转义只对十六进制成立，别的进制退回空格分隔
        return radix === 16 ? list.map((d) => "\\x" + d).join("") : list.join(" ");
      case "space":
      default:
        return list.join(" ");
    }
  }

  /* 示例固定按「你好，世界」的字节算，保证切进制后示例依然对得上 */
  const SAMPLE_TEXT = "你好，世界";
  const SAMPLE_BYTES = Array.from(new TextEncoder().encode(SAMPLE_TEXT));

  window.EasyConverter.define({
    id: "hex-utf8",
    title: "进制 ↔ 文本",
    group: "编码转换",
    icon: "0x",
    desc: "把 48 65 6C 6C 6F 这样的字节串还原成文字，也能反过来把文字导成字节。支持二进制、四进制、八进制、十六进制，0x/0b/0o/\\x 前缀与空格、逗号、换行、短横线等分隔符随意混写，字符集可切 GBK/Big5 等。",
    keywords: [
      "hex",
      "utf8",
      "utf-8",
      "gbk",
      "binary",
      "octal",
      "进制",
      "二进制",
      "四进制",
      "八进制",
      "十六进制",
      "字节",
      "编码",
      "解码",
      "乱码",
    ],

    dirs: [
      {
        key: "decode",
        label: "进制 → 文本",
        title: (opts) => `${radixOf(opts).name} → ${B.labelOf(opts.charset)} 文本`,
        inputLabel: (opts) => `${radixOf(opts).name}字节`,
        outputLabel: (opts) => `${B.labelOf(opts.charset)} 文本`,
        desc: "粘贴字节串，自动还原成文字。中间夹的 0x、0b、0o、\\x、逗号、短横线、换行都会被忽略。",
        sample: (opts) => formatBytes(SAMPLE_BYTES, Object.assign({}, opts, { sep: "space" })),
        placeholder: (opts) => {
          const info = radixOf(opts);
          return `例如：${formatBytes([0x48, 0x65, 0x6c], { radix: info.id, sep: "space", upper: true })}`;
        },
      },
      {
        key: "encode",
        label: "文本 → 进制",
        title: (opts) => `${B.labelOf(opts.charset)} 文本 → ${radixOf(opts).name}`,
        inputLabel: "文本",
        outputLabel: (opts) => `${B.labelOf(opts.charset)} ${radixOf(opts).name}`,
        desc: "把文字按指定字符集编码成字节，再按进制输出，方便比对报文、写入协议字段。emoji 会拆成 4 个字节。",
        sample: "你好，世界 Hello 🌊",
        placeholder: "在这里输入任意文本",
      },
    ],

    options: [
      {
        key: "radix",
        label: "进制",
        type: "select",
        default: "16",
        choices: [
          ["2", "二进制（2）"],
          ["4", "四进制（4）"],
          ["8", "八进制（8）"],
          ["16", "十六进制（16）"],
        ],
      },
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
      {
        key: "upper",
        label: "大写",
        type: "check",
        default: true,
        dirs: ["encode"],
        showIf: (opts) => Number(opts.radix) === 16,
      },
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
          ["0x-with-space", "带前缀"],
          ["slash-x", "\\x 转义"],
          ["comma", "逗号"],
          ["comma-space", "逗号+空格"],
        ],
      },
    ],

    decode(text, opts) {
      const radix = Number(radixOf(opts).id);
      const parsed = parseDigits(text, radix);
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

      return {
        ok: true,
        text: formatBytes(bytes, opts),
        stats: `${Array.from(text).length} 字符 · ${bytes.length} 字节`,
      };
    },

    /* 切换进制时，把输入框里的内容换算成新进制，避免直接报错 */
    onOptionChange({ key, prev, next, text, dir }) {
      if (key !== "radix" || dir !== "decode") return null;
      if (!text.trim()) return null;

      const before = parseDigits(text, Number(radixOf(prev).id));
      if (!before.ok) return null;
      return formatBytes(before.bytes, Object.assign({}, next, { sep: "space" }));
    },
  });
})();
