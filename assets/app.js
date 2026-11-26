/* Easy-Converter · 应用框架
 * 用一个极小的注册机制管理转换器：每个工具是一个 JS 文件，调用 EasyConverter.define({...}) 注册，
 * 界面由框架统一生成，工具本身只负责纯数据转换（decode / encode）。
 */
(() => {
  "use strict";

  const EC = (window.EasyConverter = window.EasyConverter || {});
  EC.version = "0.3.0";

  /* ---------------- 注册表 ---------------- */

  const tools = new Map();
  const order = [];

  /**
   * 注册一个转换工具。
   * @param {Object} def
   * @param {string} def.id       唯一 id
   * @param {string} def.title    标题，如「十六进制 → UTF-8 文本」
   * @param {string} [def.group]  侧栏分组，默认「其他」
   * @param {string} [def.icon]   侧栏小图标（1~3 个字符）
   * @param {string} def.desc     一句话说明
   * @param {string[]} [def.keywords] 搜索关键词
   * @param {Array} def.dirs      方向 [{key,label,inputLabel?,outputLabel?}]
   * @param {string} [def.placeholder] 输入框提示
   * @param {string} [def.sample]  示例输入
   * @param {Array} [def.options]  选项 [{key,label,type:'check'|'select',choices:[[v,label]],default,dirs?}]
   * @param {(text:string, opts:Object) => {ok:boolean,value?:any,error?:string,pos?:number,stats?:string,errorAt?:[number,number]}} def.decode
   * @param {(value:any, opts:Object) => {ok:boolean,text?:string,error?:string,stats?:string}} [def.encode]
   */
  EC.define = function define(def) {
    if (!def || !def.id || !def.decode) {
      console.error("[Easy-Converter] 工具定义不完整：", def);
      return;
    }
    const tool = Object.assign(
      {
        group: "其他",
        icon: "•",
        keywords: [],
        dirs: [{ key: "decode", label: "解码", inputLabel: "输入", outputLabel: "输出" }],
        options: [],
      },
      def
    );
    tools.set(tool.id, tool);
    if (!order.includes(tool.id)) order.push(tool.id);
  };

  EC.list = () => order.map((id) => tools.get(id));

  /* ---------------- 工具函数 ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1600);
  }

  async function copyText(text) {
    if (!text) return toast("没有可复制的内容");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("已复制到剪贴板");
  }

  function download(text, tool, dirKey) {
    if (!text) return toast("没有可下载的内容");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tool.id}-${dirKey}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("已导出 txt");
  }

  /* ---------------- 持久化 ---------------- */

  const STORE_KEY = "easy-converter:v1";
  const store = loadStore();

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return {
        theme: data.theme === "light" ? "light" : "dark",
        toolId: data.toolId || null,
        dirs: data.dirs || {},
        inputs: data.inputs || {},
        opts: data.opts || {},
        seeded: data.seeded || {},
      };
    } catch {
      return { theme: "dark", toolId: null, dirs: {}, inputs: {}, opts: {}, seeded: {} };
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
      } catch {
        /* 存储满了就算了，不影响使用 */
      }
    }, 250);
  }

  /* ---------------- 状态 ---------------- */

  const state = {
    tool: null,
    dirKey: null,
  };

  const dirOf = () => state.tool.dirs.find((d) => d.key === state.dirKey) || state.tool.dirs[0];
  const inputKey = () => `${state.tool.id}:${state.dirKey}`;

  function optsFor(tool) {
    const saved = store.opts[tool.id] || {};
    const out = {};
    for (const o of tool.options) out[o.key] = o.key in saved ? saved[o.key] : o.default;
    return out;
  }

  /* ---------------- 主题 ---------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $("#themeBtn");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀" : "☾";
      btn.title = theme === "dark" ? "切换到浅色" : "切换到深色";
    }
  }

  /* ---------------- 侧栏 ---------------- */

  function renderNav(filter = "") {
    const nav = $("#nav");
    const q = filter.trim().toLowerCase();
    const groups = new Map();

    for (const tool of EC.list()) {
      const hay = [tool.title, tool.desc, tool.group, ...(tool.keywords || []), ...tool.dirs.map((d) => d.label)]
        .join(" ")
        .toLowerCase();
      if (q && !hay.includes(q)) continue;
      if (!groups.has(tool.group)) groups.set(tool.group, []);
      groups.get(tool.group).push(tool);
    }

    if (!groups.size) {
      nav.innerHTML = `<div class="empty">没有匹配「${esc(filter)}」的工具</div>`;
      return;
    }

    let html = "";
    for (const [group, list] of groups) {
      html += `<div class="nav-group"><div class="nav-group-title">${esc(group)}</div>`;
      for (const t of list) {
        const on = state.tool && t.id === state.tool.id ? " on" : "";
        html += `<button type="button" class="nav-item${on}" data-tool="${esc(t.id)}" title="${esc(t.desc)}">
          <span class="nav-glyph">${esc(t.icon)}</span><span class="nav-title">${esc(t.title)}</span>
        </button>`;
      }
      html += `</div>`;
    }
    nav.innerHTML = html;
  }

  /* ---------------- 选项渲染 ---------------- */

  function optionsHtml(tool) {
    const dirKey = state.dirKey;
    const opts = optsFor(tool);
    const parts = tool.options
      .filter((o) => !o.dirs || o.dirs.includes(dirKey))
      .filter((o) => {
        // showIf 让选项依赖其它选项的值，比如「大写」只在十六进制下出现
        if (typeof o.showIf !== "function") return true;
        try {
          return !!o.showIf(opts);
        } catch {
          return true;
        }
      })
      .map((o) => {
        const id = `opt-${tool.id}-${o.key}`;
        if (o.type === "select") {
          const cur = optsFor(tool)[o.key];
          const choices = o.choices
            .map(([v, label], i) => {
              const sel = String(cur) === String(v) ? " selected" : "";
              return `<option value="${i}"${sel}>${esc(label)}</option>`;
            })
            .join("");
          return `<label class="opt" for="${id}"><span>${esc(o.label)}</span><select id="${id}" data-opt="${esc(o.key)}">${choices}</select></label>`;
        }
        if (o.type === "text") {
          return `<label class="opt opt-text" for="${id}"><span>${esc(o.label)}</span><input type="text" id="${id}" data-opt="${esc(o.key)}" value="${esc(optsFor(tool)[o.key] ?? "")}" placeholder="${esc(o.placeholder || "")}"></label>`;
        }
        const checked = optsFor(tool)[o.key] ? " checked" : "";
        return `<label class="opt" for="${id}"><input type="checkbox" id="${id}" data-opt="${esc(o.key)}"${checked}><span>${esc(o.label)}</span></label>`;
      })
      .join("");

    return parts ? `<div class="options">${parts}</div>` : "";
  }

  /* ---------------- 主渲染 ---------------- */

  /* 标题、说明、面板名可以写成函数 (opts) => string，随选项实时变化 */
  function resolve(value, opts, fallback) {
    if (typeof value === "function") {
      try {
        return value(opts) || "";
      } catch {
        return fallback || "";
      }
    }
    return value != null ? value : fallback || "";
  }

  function applyLabels() {
    const tool = state.tool;
    if (!tool) return;
    const opts = optsFor(tool);
    const dir = dirOf();
    const set = (sel, text) => {
      const el = $(sel);
      if (el) el.textContent = text;
    };
    const title = resolve(dir.title, opts, tool.title);
    set("#toolTitle", title);
    $("#path").innerHTML = `<b>${esc(tool.group)}</b> / ${esc(title)}`;
    set("#toolDesc", resolve(dir.desc, opts, tool.desc));
    set("#labelIn", resolve(dir.inputLabel, opts, "输入"));
    set("#labelOut", resolve(dir.outputLabel, opts, "输出"));
  }

  function render() {
    const tool = state.tool;
    const dirKey = state.dirKey;
    const dir = dirOf();
    const opts = optsFor(tool);
    const title = resolve(dir.title, opts, tool.title);
    const desc = resolve(dir.desc, opts, tool.desc);

    $("#path").innerHTML = `<b>${esc(tool.group)}</b> / ${esc(title)}`;

    const segHtml =
      tool.dirs.length > 1
        ? `<div class="seg">${tool.dirs
            .map(
              (d) =>
                `<button type="button" class="seg-btn${d.key === dirKey ? " on" : ""}" data-dir="${esc(d.key)}">${esc(d.label)}</button>`
            )
            .join("")}</div>`
        : "";

    $("#tool").innerHTML = `
      <header class="tool-head">
        <div class="tool-icon">${esc(tool.icon)}</div>
        <div class="tool-meta">
          <h1 id="toolTitle">${esc(title)}</h1>
          <p id="toolDesc">${esc(desc)}</p>
        </div>
      </header>
      <div class="toolbar">
        ${segHtml}
        ${optionsHtml(tool)}
        <div class="toolbar-spacer"></div>
        <button type="button" class="btn" data-act="sample" title="填入示例输入">示例</button>
        <button type="button" class="btn" data-act="clear">清空</button>
      </div>
      <div class="panes">
        <div class="pane">
          <div class="pane-head">
            <span class="pane-label" id="labelIn">${esc(resolve(dir.inputLabel, opts, "输入"))}</span>
            <div class="pane-tools">
              <span class="stat" id="inStat"></span>
              <button type="button" class="btn tiny" data-act="paste">粘贴</button>
            </div>
          </div>
          <textarea id="input" spellcheck="false" autocomplete="off" placeholder="${esc(currentPlaceholder())}"></textarea>
          <div class="dropzone" id="dropIn">拖入文本文件，或点击选择</div>
        </div>
        <div class="pane-mid"><button type="button" class="swap-btn" id="swapBtn" title="${tool.dirs.length > 1 ? "交换方向，把输出放回输入" : "把输出放回输入"}">⇄</button></div>
        <div class="pane">
          <div class="pane-head">
            <span class="pane-label" id="labelOut">${esc(resolve(dir.outputLabel, opts, "输出"))}</span>
            <div class="pane-tools">
              <span class="stat" id="outStat"></span>
              <button type="button" class="btn tiny" data-act="copy">复制</button>
              <button type="button" class="btn tiny" data-act="download">下载</button>
            </div>
          </div>
          <textarea id="output" readonly spellcheck="false" autocomplete="off" placeholder="转换结果会显示在这里"></textarea>
        </div>
      </div>
      <div class="statusbar" id="status"></div>`;

    const input = $("#input");
    const saved = store.inputs[inputKey()];
    const seed = currentSample();
    if (saved != null) {
      input.value = saved;
    } else if (!store.seeded[`${tool.id}:${dirKey}`] && seed != null) {
      input.value = seed;
    }
    store.seeded[`${tool.id}:${dirKey}`] = true;
    convert();

    const nav = $(`.nav-item[data-tool="${CSS.escape(tool.id)}"]`);
    if (nav) nav.scrollIntoView({ block: "nearest" });
  }

  /* ---------------- 转换 ---------------- */

  let convertTimer = null;

  function scheduleConvert() {
    clearTimeout(convertTimer);
    convertTimer = setTimeout(convert, 90);
  }

  function setStatus(kind, html) {
    const bar = $("#status");
    bar.className = "statusbar" + (kind ? " " + kind : "");
    bar.innerHTML = html;
  }

  /* 输入框提示语也支持函数形式，随选项变化 */
  function currentPlaceholder() {
    const tool = state.tool;
    if (!tool) return "";
    const dir = dirOf();
    const opts = optsFor(tool);
    return resolve(dir.placeholder != null ? dir.placeholder : tool.placeholder, opts, "");
  }

  /* 示例值同样支持函数，切进制时示例跟着换 */
  function currentSample() {
    const tool = state.tool;
    if (!tool) return null;
    const dir = dirOf();
    const opts = optsFor(tool);
    const raw = dir.sample != null ? dir.sample : tool.sample;
    return typeof raw === "function" ? raw(opts) : raw;
  }

  function convert() {
    const tool = state.tool;
    const input = $("#input");
    const output = $("#output");
    if (!tool || !input || !output) return;

    const text = input.value;
    const opts = optsFor(tool);
    const inStat = $("#inStat");
    const outStat = $("#outStat");

    inStat.textContent = text ? `${Array.from(text).length} 字符 · ${text.split("\n").length} 行` : "";

    if (!text.trim()) {
      output.value = "";
      outStat.textContent = "";
      setStatus("info", `${esc(tool.dirs.length > 1 ? dirOf().label : "")} 输入内容后自动转换 · 数据只在本地处理`);
      return;
    }

    const t0 = performance.now();

    let res;
    try {
      res =
        state.dirKey === "encode" && typeof tool.encode === "function"
          ? tool.encode(text, opts)
          : tool.decode(text, opts);
    } catch (e) {
      res = { ok: false, error: e && e.message ? e.message : String(e) };
    }

    const ms = performance.now() - t0;

    if (!res || res.ok === false) {
      output.value = "";
      outStat.textContent = "";
      const msg = (res && res.error) || "无法转换";
      const bits = [];
      if (res && res.pos != null) bits.push(`位置 ${res.pos + 1}`);
      if (res && res.near) bits.push(`附近「${res.near}」`);
      const extra = bits.length ? `<span>· ${esc(bits.join(" · "))}</span>` : "";
      setStatus("error", `<strong>✕ ${esc(msg)}</strong>${extra}`);
      return;
    }

    output.value = res.text != null ? res.text : String(res.value);
    outStat.textContent = res.stats || "";
    setStatus(
      "info",
      `✓ 转换完成 <span class="muted">· 用时 ${ms < 1 ? "<1" : ms.toFixed(1)} ms</span>`
    );
  }

  /* ---------------- 交互 ---------------- */

  function pickTool(id) {
    const tool = tools.get(id);
    if (!tool) return;
    store.toolId = id;
    state.tool = tool;
    state.dirKey = store.dirs[id] || tool.dirs[0].key;
    if (!tool.dirs.some((d) => d.key === state.dirKey)) state.dirKey = tool.dirs[0].key;
    renderNav($("#search").value);
    render();
    save();
    $("#app").classList.remove("nav-open");
    if (window.innerWidth <= 900) $("#tool")?.scrollTo?.(0, 0);
  }

  function setDir(key) {
    if (key === state.dirKey) return;
    const keep = $("#input")?.value || "";
    store.inputs[inputKey()] = keep;
    state.dirKey = key;
    store.dirs[state.tool.id] = key;
    render();
    save();
  }

  function swap() {
    const tool = state.tool;
    const out = $("#output")?.value || "";
    const input = $("#input");
    if (tool.dirs.length > 1) {
      store.inputs[inputKey()] = input.value;
      const next = tool.dirs[(tool.dirs.findIndex((d) => d.key === state.dirKey) + 1) % tool.dirs.length].key;
      state.dirKey = next;
      store.dirs[tool.id] = next;
      store.inputs[inputKey()] = out;
      render();
      save();
    } else if (out) {
      input.value = out;
      convert();
      saveInput();
    }
  }

  function saveInput() {
    const input = $("#input");
    if (!input) return;
    store.inputs[inputKey()] = input.value;
    save();
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toast("文件太大（超过 4MB）");
    const reader = new FileReader();
    reader.onload = () => {
      const ta = $("#input");
      ta.value = String(reader.result || "");
      store.inputs[inputKey()] = ta.value;
      convert();
      save();
      toast(`已读取 ${file.name}`);
    };
    reader.readAsText(file, "utf-8");
  }

  function bind() {
    $("#nav").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tool]");
      if (btn) pickTool(btn.dataset.tool);
    });

    $("#search").addEventListener("input", (e) => renderNav(e.target.value));

    $("#themeBtn").addEventListener("click", () => {
      store.theme = store.theme === "dark" ? "light" : "dark";
      applyTheme(store.theme);
      save();
    });

    $("#menuBtn").addEventListener("click", () => $("#app").classList.toggle("nav-open"));
    $("#app").addEventListener("click", (e) => {
      if (e.target.id === "app" && $("#app").classList.contains("nav-open")) {
        $("#app").classList.remove("nav-open");
      }
    });

    $("#fileInput").addEventListener("change", (e) => {
      readFile(e.target.files && e.target.files[0]);
      e.target.value = "";
    });

    const toolRoot = $("#tool");

    function applyOptionChange(t) {
      if (!t.dataset || !t.dataset.opt) return false;
      const tool = state.tool;
      const o = tool.options.find((x) => x.key === t.dataset.opt);
      if (!o) return false;
      const prev = optsFor(tool);
      let val;
      if (o.type === "select") {
        const picked = o.choices[Number(t.value)] || o.choices[0];
        val = picked[0];
      } else if (o.type === "text") {
        val = t.value;
      } else {
        val = !!t.checked;
      }

      const next = Object.assign({}, prev, { [o.key]: val });
      store.opts[tool.id] = next;
      save();

      // 工具可以借这次变化顺手改写输入（例如切换进制时换算现有内容）
      if (typeof tool.onOptionChange === "function") {
        try {
          const input = $("#input");
          const text = input ? input.value : "";
          const replaced = tool.onOptionChange({
            key: o.key,
            prev,
            next: optsFor(tool),
            text,
            dir: state.dirKey,
          });
          if (typeof replaced === "string" && replaced !== text) {
            input.value = replaced;
            saveInput();
          }
        } catch (err) {
          console.error("[Easy-Converter] onOptionChange 出错：", err);
        }
      }

      // 选项变化可能让某些控件显隐，重建一次工具栏比逐个比对稳妥
      refreshOptions();
      applyLabels();
      convert();
      return true;
    }

    /* 只重建工具栏里的选项区，不打断输入框焦点 */
    function refreshOptions() {
      const wrap = toolRoot.querySelector(".options");
      const html = optionsHtml(state.tool);
      if (wrap) {
        if (html) wrap.outerHTML = html;
        else wrap.remove();
      } else if (html) {
        const spacer = toolRoot.querySelector(".toolbar-spacer");
        if (spacer) spacer.insertAdjacentHTML("beforebegin", html);
      }
      toolRoot.querySelectorAll("textarea").forEach((ta) => {
        if (ta.id === "input") ta.placeholder = currentPlaceholder();
      });
    }

    toolRoot.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "input") {
        saveInput();
        scheduleConvert();
        return;
      }
      if (t.dataset && t.dataset.opt) {
        const o = state.tool.options.find((x) => x.key === t.dataset.opt);
        // 下拉框等 change 再处理，避免中途状态
        if (o && o.type === "text") applyOptionChange(t);
      }
    });

    toolRoot.addEventListener("change", (e) => {
      if (e.target.dataset && e.target.dataset.opt) applyOptionChange(e.target);
    });

    toolRoot.addEventListener("click", async (e) => {
      const dirBtn = e.target.closest("[data-dir]");
      if (dirBtn) return setDir(dirBtn.dataset.dir);

      if (e.target.closest("#swapBtn")) return swap();

      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;

      if (act === "clear") {
        const input = $("#input");
        input.value = "";
        saveInput();
        convert();
        input.focus();
      } else if (act === "sample") {
        const sample = currentSample();
        if (sample == null) return toast("这个工具没有示例");
        const input = $("#input");
        input.value = sample;
        saveInput();
        convert();
      } else if (act === "copy") {
        copyText($("#output").value);
      } else if (act === "download") {
        download($("#output").value, state.tool, state.dirKey);
      } else if (act === "paste") {
        try {
          const txt = await navigator.clipboard.readText();
          const input = $("#input");
          input.value = txt;
          saveInput();
          convert();
        } catch {
          toast("浏览器不允许读取剪贴板，请手动粘贴");
        }
      } else if (act === "pick") {
        $("#fileInput").click();
      }
    });

    // 拖放文件
    toolRoot.addEventListener("click", (e) => {
      if (e.target.closest("#dropIn")) $("#fileInput").click();
    });
    toolRoot.addEventListener("dragover", (e) => {
      const dz = e.target.closest("#dropIn, #input");
      if (!dz) return;
      e.preventDefault();
      $("#dropIn")?.classList.add("hot");
    });
    toolRoot.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest?.("#dropIn, #input")) $("#dropIn")?.classList.remove("hot");
    });
    toolRoot.addEventListener("drop", (e) => {
      const dz = e.target.closest("#dropIn, #input");
      if (!dz) return;
      e.preventDefault();
      $("#dropIn")?.classList.remove("hot");
      readFile(e.dataTransfer.files[0]);
    });

    // 输入框粘贴后立刻转换，不等防抖
    toolRoot.addEventListener("paste", (e) => {
      if (e.target.id !== "input") return;
      setTimeout(() => {
        saveInput();
        convert();
      }, 0);
    });

    // 快捷键
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "enter") {
        e.preventDefault();
        convert();
      } else if (k === "k") {
        e.preventDefault();
        $("#search").focus();
        $("#search").select();
      } else if (e.shiftKey && k === "c") {
        e.preventDefault();
        copyText($("#output")?.value || "");
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  EC.boot = function boot() {
    if (booted) return;
    booted = true;
    applyTheme(store.theme);
    bind();
    const saved = store.toolId && tools.get(store.toolId) ? store.toolId : order[0];
    pickTool(saved || order[0]);
    $("#sidebarFoot").textContent = `v${EC.version} · 纯前端 · 数据不出本机`;
  };

  let booted = false;

  window.addEventListener("DOMContentLoaded", () => {
    if (!order.length) {
      $("#tool").innerHTML = '<div class="empty">没有加载到任何转换器，请检查 tools/ 目录下的文件与 index.html 中的引用。</div>';
      return;
    }
    EC.boot();
  });
})();
