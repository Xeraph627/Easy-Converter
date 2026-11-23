/* Easy-Converter · 字节与字符集公共工具
 * 各个转换器共用。核心目标：字节 ↔ 文本的双向转换，出错时能说清是第几个字节。
 * 支持 UTF-8、GBK、Big5、Shift_JIS、EUC-KR、Latin-1 等设备自带的字符集。
 */
(() => {
  "use strict";

  const EC = (window.EasyConverter = window.EasyConverter || {});

  const hex2 = (n) => n.toString(16).padStart(2, "0");
  const toHex = (bytes, from = 0, to = bytes.length) =>
    bytes.slice(from, to).map(hex2).join(" ");

  /* 字符集清单。encodable 表示可以反向编码（非 UTF-8 靠运行时反查表实现）。 */
  const CHARSETS = [
    { id: "utf-8", label: "UTF-8", decodable: true, encodable: true },
    { id: "gbk", label: "GBK（GB2312）", decodable: true, encodable: true },
    { id: "big5", label: "Big5", decodable: true, encodable: true },
    { id: "shift_jis", label: "Shift_JIS", decodable: true, encodable: true },
    { id: "euc-kr", label: "EUC-KR", decodable: true, encodable: true },
    { id: "iso-8859-1", label: "Latin-1", decodable: true, encodable: true },
    { id: "windows-1252", label: "Windows-1252", decodable: true, encodable: true },
  ];

  const labelOf = (id) => (CHARSETS.find((c) => c.id === id) || { label: id }).label;

  const decoderCache = new Map();
  function getDecoder(charset, fatal) {
    const key = charset + (fatal ? ":fatal" : "");
    if (!decoderCache.has(key)) {
      let td = null;
      try {
        td = new TextDecoder(charset, { fatal: !!fatal });
      } catch {
        td = null;
      }
      decoderCache.set(key, td);
    }
    return decoderCache.get(key);
  }

  function supported(charset) {
    return !!getDecoder(charset, false);
  }

  /* ---------------- UTF-8 解码（手写，为了精确定位出错字节） ---------------- */

  function utf8Decode(bytes, replaceInvalid) {
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
            near: toHex(bytes, Math.max(0, i - 3), i + 4),
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
            near: toHex(bytes, Math.max(0, i - 3), len),
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
              near: toHex(bytes, Math.max(0, i - 3), i + need + 2),
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
            near: toHex(bytes, i, i + need + 1),
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

  /* ---------------- 双字节字符集解码（GBK / Big5 / Shift_JIS / EUC-KR）
   * 不硬编码首尾字节范围，而是逐位试探：能以「一个字符」解出来就消费对应字节数，
   * 这样任何双字节字符集都能处理，并且能准确报出第一个坏字节的位置。
   * ---------------- */

  function dbcsDecode(bytes, charset, replaceInvalid) {
    const td = getDecoder(charset, false);
    if (!td) return { ok: false, error: `当前环境不支持 ${labelOf(charset)} 解码` };

    let out = "";
    let i = 0;

    while (i < bytes.length) {
      const b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
        continue;
      }

      if (i + 1 < bytes.length) {
        const pair = td.decode(new Uint8Array([bytes[i], bytes[i + 1]]));
        if (pair.length === 1 && pair !== "\uFFFD") {
          out += pair;
          i += 2;
          continue;
        }
      }

      const single = td.decode(new Uint8Array([b]));
      if (single.length === 1 && single !== "\uFFFD") {
        out += single;
        i += 1;
        continue;
      }

      if (!replaceInvalid) {
        return {
          ok: false,
          error: `字节 0x${hex2(b)} 无法按 ${labelOf(charset)} 解码`,
          pos: i,
          near: toHex(bytes, Math.max(0, i - 3), i + 4),
        };
      }
      out += "\uFFFD";
      i += 1;
    }

    return { ok: true, text: out };
  }

  /* ---------------- 统一解码入口 ---------------- */

  function decode(bytes, charset, replaceInvalid) {
    if (!bytes.length) return { ok: true, text: "" };
    if (charset === "utf-8" || !charset) return utf8Decode(bytes, replaceInvalid);
    if (!supported(charset)) return { ok: false, error: `当前环境不支持 ${labelOf(charset)}` };
    return dbcsDecode(bytes, charset, replaceInvalid);
  }

  /* ---------------- 反向编码表 ---------------- */

  const encoderCache = new Map();

  /* 运行时反查：先用平台解码器探明每个字符对应的字节，再建表。
   * 只在该字符集第一次被用来编码时构建，之后复用。 */
  function buildTable(charset) {
    const td = getDecoder(charset, false);
    if (!td) return null;

    const map = new Map();
    const add = (ch, bytes) => {
      if (ch === "\uFFFD" || !ch) return;
      if (!map.has(ch)) map.set(ch, bytes);
    };

    // 双字节优先，避免被单字节结果抢占
    for (let lead = 0x81; lead <= 0xfe; lead++) {
      for (let trail = 0x40; trail <= 0xfe; trail++) {
        if (trail === 0x7f) continue;
        const s = td.decode(new Uint8Array([lead, trail]));
        if (s.length === 1 && s !== "\uFFFD") add(s, [lead, trail]);
      }
    }

    // 单字节：ASCII 与半角片假名等
    for (let b = 0x00; b <= 0xff; b++) {
      const s = td.decode(new Uint8Array([b]));
      if (s.length === 1 && s !== "\uFFFD") add(s, [b]);
    }

    return map;
  }

  function tableFor(charset) {
    if (!encoderCache.has(charset)) encoderCache.set(charset, buildTable(charset));
    return encoderCache.get(charset);
  }

  /* 文本 → 字节。失败时返回是哪个字符表示不了。 */
  function encode(text, charset) {
    if (!text) return { ok: true, bytes: [] };

    if (charset === "utf-8" || !charset) {
      return { ok: true, bytes: Array.from(new TextEncoder().encode(text)) };
    }

    if (!supported(charset)) return { ok: false, error: `当前环境不支持 ${labelOf(charset)}` };

    const table = tableFor(charset);
    if (!table) return { ok: false, error: `当前环境不支持 ${labelOf(charset)} 编码` };

    const bytes = [];
    let index = 0;
    for (const ch of text) {
      const mapped = table.get(ch);
      if (!mapped) {
        return {
          ok: false,
          error: `字符「${ch}」无法用 ${labelOf(charset)} 表示`,
          pos: index,
          near: ch,
        };
      }
      for (const b of mapped) bytes.push(b);
      index += 1;
    }
    return { ok: true, bytes };
  }

  EC.bytes = {
    hex2,
    toHex,
    CHARSETS,
    labelOf,
    supported,
    decode,
    encode,
  };
})();
