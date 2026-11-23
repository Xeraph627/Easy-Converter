/* URL 编码 / 解码（百分号编码，RFC 3986） */
(() => {
  "use strict";

  const B = window.EasyConverter.bytes;
  const hex2 = B.hex2;

  /* 先解开 %XX，得到字节数组。invalid 策略决定坏 % 序列怎么处理。 */
  function percentToBytes(src, invalid, plusAsSpace) {
    const bytes = [];
    let i = 0;

    while (i < src.length) {
      const ch = src[i];

      if (ch === "%") {
        const hex = src.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 3;
          continue;
        }
        if (invalid === "keep") {
          // 原样保留这个 %，当普通字符
          bytes.push(0x25);
          i += 1;
          continue;
        }
        // strict：直接报错
        const shown = src.slice(i, Math.min(src.length, i + 3));
        if (hex.length === 1 && /^[0-9a-fA-F]$/.test(hex)) {
          return {
            ok: false,
            error: `"%${hex}" 后面还缺一位十六进制数字`,
            pos: i,
            near: shown,
          };
        }
        return {
          ok: false,
          error: "百分号后面不是两位十六进制数字",
          pos: i,
          near: shown,
        };
      }

      if (ch === "+" && plusAsSpace) {
        bytes.push(0x20);
        i += 1;
        continue;
      }

      // 普通字符按 UTF-8 转成字节，保证和 %XX 字节流拼在一起
      const cp = src.codePointAt(i);
      const piece = String.fromCodePoint(cp);
      for (const b of new TextEncoder().encode(piece)) bytes.push(b);
      i += piece.length;
    }

    return { ok: true, bytes };
  }

  const PRESETS = {
    // encodeURIComponent 的保留集：字母数字和 -_.!~*'()
    component: new Set(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")),
    // encodeURI 额外放过的 URL 结构字符
    uri: new Set(
      Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,#")
    ),
    // 最严格：只留 RFC 3986 的 unreserved
    strict: new Set(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")),
  };

  window.EasyConverter.define({
    id: "url-encode",
    title: "URL 编码 / 解码",
    group: "编码转换",
    icon: "%",
    desc: "百分号编码（Percent-encoding）互转。解码认 %E4%BD%A0 这类 UTF-8 序列，也能处理表单里的 + 空格；编码可选保留哪些 URL 结构字符。",
    keywords: ["url", "urlencode", "urldecode", "percent", "百分号", "编码", "解码", "query", "链接"],

    dirs: [
      {
        key: "decode",
        label: "解码",
        title: "URL 解码",
        inputLabel: "已编码内容",
        outputLabel: "原文",
        desc: "把 %E4%BD%A0%E5%A5%BD 还原成「你好」。查询串里的 + 是否当空格处理，可在右侧切换。",
        sample: "%E4%BD%A0%E5%A5%BD%EF%BC%8C%E4%B8%96%E7%95%8C%20a%2Bb%3Dc",
        placeholder: "例如：%E4%BD%A0%E5%A5%BD 或 a%20b",
      },
      {
        key: "encode",
        label: "编码",
        title: "URL 编码",
        inputLabel: "原文",
        outputLabel: "编码结果",
        desc: "把文字转成 %XX 形式。「组件」用于参数值，「整条 URL」会保留 :/?&= 等结构字符。",
        sample: "你好，世界 a+b=c",
        placeholder: "在这里输入要编码的内容",
      },
    ],

    options: [
      {
        key: "preset",
        label: "保留范围",
        type: "select",
        default: "component",
        dirs: ["encode"],
        choices: [
          ["component", "组件（值）"],
          ["uri", "整条 URL"],
          ["strict", "最严格"],
        ],
      },
      {
        key: "spaceAsPlus",
        label: "空格写成 +",
        type: "check",
        default: false,
        dirs: ["encode"],
      },
      { key: "upper", label: "大写 %XX", type: "check", default: true, dirs: ["encode"] },
      {
        key: "plusAsSpace",
        label: "+ 当作空格",
        type: "check",
        default: false,
        dirs: ["decode"],
      },
      {
        key: "invalid",
        label: "坏的 % 序列",
        type: "select",
        default: "keep",
        dirs: ["decode"],
        choices: [
          ["keep", "原样保留"],
          ["strict", "报错"],
        ],
      },
      {
        key: "charset",
        label: "字符集",
        type: "select",
        default: "utf-8",
        dirs: ["decode"],
        choices: B.CHARSETS.map((c) => [c.id, c.label]),
      },
    ],

    decode(text, opts) {
      const charset = opts.charset || "utf-8";
      const parsed = percentToBytes(text, opts.invalid === "strict" ? "strict" : "keep", !!opts.plusAsSpace);
      if (!parsed.ok) return parsed;

      const dec = B.decode(parsed.bytes, charset, false);
      if (!dec.ok) return dec;

      const rawPct = (text.match(/%[0-9a-fA-F]{2}/g) || []).length;
      const parts = [`${parsed.bytes.length} 字节`, `${rawPct} 个 %XX`];
      if (rawPct === 0) parts.push("内容里没有 %XX");
      return { ok: true, text: dec.text, stats: parts.join(" · ") };
    },

    encode(text, opts) {
      if (!text) return { ok: false, error: "没有可编码的内容" };

      const keep = PRESETS[opts.preset] || PRESETS.component;
      const spaceAsPlus = !!opts.spaceAsPlus;
      const upper = opts.upper !== false;

      let out = "";
      for (const ch of text) {
        if (ch === " " && spaceAsPlus) {
          out += "+";
          continue;
        }
        if (keep.has(ch)) {
          out += ch;
          continue;
        }
        for (const b of new TextEncoder().encode(ch)) {
          const h = hex2(b);
          out += "%" + (upper ? h.toUpperCase() : h);
        }
      }

      const pct = (out.match(/%[0-9a-fA-F]{2}/g) || []).length;
      return {
        ok: true,
        text: out,
        stats: `${Array.from(text).length} 字符 · ${pct} 个 %XX`,
      };
    },
  });
})();
