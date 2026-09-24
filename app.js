// Daily Ref ver2.1 — GitHub Pages + Supabase
(() => {
const CFG = window.DAILY_REF_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const BUCKET = "ref-images";

/* ---------- state ---------- */
const S = {
  user: null, status: "loading", // loading | ready | error
  cats: [], refs: [], signed: {}, tab: "all", q: "", tag: null, lastLoad: 0,
};
try { const t = localStorage.getItem("dr.tab"); if (t) S.tab = t; } catch (e) {}

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
const domain = u => { try { const h = new URL(u).hostname.replace(/^www\./, ""); return h === "mail.google.com" ? "Gmail" : h; } catch (e) { return ""; } };
const imgSrc = r => r._local || (r.image_path ? S.signed[r.image_path] || "" : "") || safeUrl(r.image_url || "");
const DAY = 864e5;
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
function fmtDate(ms) {
  if (!ms) return "";
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  const d = new Date(ms), n = new Date();
  return (d.getFullYear() !== n.getFullYear() ? d.getFullYear() + ". " : "") + (d.getMonth() + 1) + "월 " + d.getDate() + "일";
}
$("#today").textContent = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });

const ICON_STAR = on => `<svg width="18" height="18" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"/></svg>`;
const IMG = (src, alt = "") => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" data-img>`;

const cats = () => [...S.cats].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
const catById = id => S.cats.find(c => c.id === id);

function matches(r) {
  if (S.tag && !(r.tags || []).includes(S.tag)) return false;
  const q = S.q.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  return [r.title, r.note, r.sender, r.snippet, domain(r.url || ""), ...(r.tags || [])].join(" ").toLowerCase().includes(q);
}
const filtering = () => !!(S.q.trim() || S.tag);

/* ---------- screens ---------- */
function show(which) {
  $("#bootMsg").hidden = true;
  $("#app").hidden = which !== "app";
  $("#login").hidden = which !== "login";
}

/* ---------- data ---------- */
async function load() {
  const [c, r] = await Promise.all([
    sb.from("categories").select("*").order("sort_order"),
    sb.from("refs").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);
  if (c.error || r.error) { S.status = "error"; render(); return; }
  S.cats = c.data;
  S.refs = r.data.map(x => ({ ...x, createdAt: Date.parse(x.created_at) }));
  S.lastLoad = Date.now();
  await signImages();
  S.status = "ready";
  render();
}
async function signImages() {
  const paths = [...new Set(S.refs.filter(r => r.image_path && !S.signed[r.image_path]).map(r => r.image_path))];
  if (!paths.length) return;
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
  (data || []).forEach(d => { if (d.signedUrl) S.signed[d.path] = d.signedUrl; });
}
// 다른 탭/기기에서 돌아오면 새 뉴스레터를 다시 불러와요
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.user && Date.now() - S.lastLoad > 60e3) load();
});

/* ---------- render ---------- */
function render() { renderTabs(); renderMain(); }

function renderTabs() {
  const counts = {};
  S.refs.forEach(r => counts[r.category_id] = (counts[r.category_id] || 0) + 1);
  if (S.tab !== "all" && !catById(S.tab)) S.tab = "all";
  const t = [{ id: "all", name: "전체", n: S.refs.length }, ...cats().map(c => ({ ...c, n: counts[c.id] || 0 }))];
  $("#tabs").innerHTML = t.map(x =>
    `<button class="tab" role="tab" type="button" data-tab="${esc(x.id)}" aria-selected="${S.tab === x.id}">${esc(x.name)}<span class="n">${x.n}</span></button>`
  ).join("") + `<button class="tab new" type="button" id="newCat">+ 카테고리</button>`;
}

function filterBar(n) {
  if (!filtering()) return "";
  return `<div class="filters">${S.tag ? `<button class="chip-active" type="button" data-cleartag>#${esc(S.tag)} <span>✕</span></button>` : ""}
    <span class="result-count">검색 결과 <b>${n}</b>개</span></div>`;
}

function renderMain() {
  const m = $("#main");
  if (S.status === "loading") { m.innerHTML = skeleton(); return; }
  if (S.status === "error") {
    m.innerHTML = `<div class="empty"><p>레퍼런스를 불러오지 못했어요.</p><small>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</small><button class="btn-soft" type="button" data-reload>다시 불러오기</button></div>`;
    return;
  }
  m.innerHTML = S.tab === "all" ? renderAll() : renderCat(catById(S.tab));
}

function metaHtml(r, { star = false, showDomain = true } = {}) {
  const parts = [];
  if (star && r.starred) parts.push('<span class="badge-imp">중요</span>');
  if (r.source === "gmail") parts.push('<span class="src-mail">메일</span>');
  const who = r.source === "gmail" ? (r.sender || "") : (showDomain ? (domain(r.url || "") || "") : "");
  if (who) parts.push(`<span class="dom">${esc(who)}</span><span>·</span>`);
  parts.push(`<span>${fmtDate(r.createdAt)}</span>`);
  return `<div class="meta">${parts.join("")}</div>`;
}
const noteOf = r => r.note || r.snippet || "";

function renderAll() {
  const all = S.refs, vis = all.filter(matches);
  let h = filterBar(vis.length);
  if (!filtering()) {
    const todayN = all.filter(r => startOfDay(r.createdAt) === startOfDay(Date.now())).length;
    const impN = all.filter(r => r.starred).length;
    h += `<div class="summary"><span>레퍼런스 <b>${all.length}</b>개</span><span>오늘 저장 <b>${todayN}</b>개</span><span>중요 <b>${impN}</b>개</span></div>`;
  }
  if (!all.length) return h + emptyState(null);
  let any = false;
  for (const c of cats()) {
    const items = vis.filter(r => r.category_id === c.id);
    if (filtering() && !items.length) continue;
    any = true;
    h += `<section class="section"><div class="sec-head"><h2>${esc(c.name)}<span class="n">${items.length}</span></h2>
      ${items.length ? `<button class="link-more" type="button" data-tab="${esc(c.id)}">전체 보기 →</button>` : ""}</div>`;
    h += items.length
      ? `<div class="shelf">${items.slice(0, 12).map(r => shelfCard(r, c)).join("")}</div>`
      : `<div class="shelf"><button class="s-card text" type="button" data-add="${esc(c.id)}"><div class="body" style="justify-content:center;align-items:flex-start">
          <span class="note">아직 저장한 레퍼런스가 없어요</span><span style="color:var(--action);font-weight:600">+ 추가하기</span></div></button></div>`;
    h += `</section>`;
  }
  if (filtering() && !any) h += `<div class="empty"><p>조건에 맞는 레퍼런스가 없어요.</p><small>다른 검색어를 입력하거나 태그 필터를 해제해 보세요.</small></div>`;
  return h;
}

function shelfCard(r, c) {
  const src = imgSrc(r), useImg = c.view === "grid" || src;
  if (useImg) {
    return `<button class="s-card" type="button" data-open="${esc(r.id)}">
      <div class="thumb">${src ? IMG(src) : ""}${r.starred ? '<span class="corner">중요</span>' : ""}</div>
      <div class="body">${metaHtml(r)}<div class="title">${esc(r.title)}</div></div></button>`;
  }
  return `<button class="s-card text" type="button" data-open="${esc(r.id)}"><div class="body">${metaHtml(r, { star: true })}
    <div class="title">${esc(r.title)}</div>${noteOf(r) ? `<div class="note">${esc(noteOf(r))}</div>` : ""}</div></button>`;
}

function tagsHtml(r) {
  if (!(r.tags || []).length) return "";
  return `<div class="tags">${r.tags.map(t => `<button class="tag" type="button" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div>`;
}
const starBtn = r => `<button class="star" type="button" data-star="${esc(r.id)}" aria-pressed="${!!r.starred}" aria-label="중요 표시">${ICON_STAR(r.starred)}</button>`;

function renderCat(c) {
  const items = S.refs.filter(r => r.category_id === c.id), vis = items.filter(matches);
  let h = filterBar(vis.length);
  h += `<section class="section"><div class="sec-head"><h2>${esc(c.name)}<span class="n">${items.length}</span></h2>
    <span class="hint">${c.view === "grid" ? "카드 보기" : "리스트 보기"}</span></div>`;
  if (!items.length) return h + emptyState(c) + `</section>`;
  if (!vis.length) return h + `<div class="empty"><p>조건에 맞는 레퍼런스가 없어요.</p><small>검색어나 태그 필터를 바꿔 보세요.</small></div></section>`;
  if (c.view === "grid") {
    h += `<div class="masonry">${vis.map(r => {
      const src = imgSrc(r);
      return `<article class="m-card" data-open="${esc(r.id)}" tabindex="0">
        ${src ? `<div class="thumb">${IMG(src)}${r.starred ? '<span class="corner">중요</span>' : ""}${starBtn(r)}</div>`
              : `<div class="noimg"><span>${r.starred ? '<span class="badge-imp">중요</span>' : ""}</span>${starBtn(r)}</div>`}
        <div class="body">${metaHtml(r)}<div class="title">${esc(r.title)}</div>${noteOf(r) ? `<div class="note">${esc(noteOf(r))}</div>` : ""}${tagsHtml(r)}</div>
      </article>`;
    }).join("")}</div>`;
  } else {
    h += `<div class="list">${vis.map(r => {
      const src = imgSrc(r);
      return `<article class="row${src ? "" : " no-thumb"}" data-open="${esc(r.id)}" tabindex="0">
        ${src ? `<div class="thumb">${IMG(src)}</div>` : ""}
        <div class="content">${metaHtml(r, { star: true })}<div class="title">${esc(r.title)}</div>${noteOf(r) ? `<div class="note">${esc(noteOf(r))}</div>` : ""}${tagsHtml(r)}</div>
        ${starBtn(r)}
      </article>`;
    }).join("")}</div>`;
  }
  return h + `</section>`;
}

function emptyState(c) {
  const isMail = c && c.slug === "newsletter";
  return `<div class="empty"><p>${c ? esc(c.name) + "에 " : ""}아직 저장한 레퍼런스가 없어요.</p>
    <small>${isMail ? "Gmail에서 뉴스레터에 ref 라벨을 붙이면 15분 안에 여기로 들어와요." : "기사 링크나 이미지를 저장해 두면 여기에 모여요."}</small>
    <button class="btn-soft" type="button" data-add="${c ? esc(c.id) : ""}">+ 첫 레퍼런스 추가</button></div>`;
}
function skeleton() {
  const card = `<div class="skel" style="width:248px;height:260px;flex:none"></div>`;
  return `<div class="skel" style="height:18px;width:220px;margin-top:24px"></div>` +
    [1, 2].map(() => `<section class="section"><div class="skel" style="height:22px;width:90px;margin-bottom:12px"></div><div class="shelf">${card.repeat(5)}</div></section>`).join("");
}

// 깨진 이미지는 숨기기 (뉴스레터 이미지가 지워졌거나 막힌 경우)
document.addEventListener("error", e => {
  const t = e.target;
  if (t && t.tagName === "IMG" && t.hasAttribute("data-img")) {
    const row = t.closest(".row"); if (row) { row.classList.add("no-thumb"); t.closest(".thumb")?.remove(); return; }
    t.remove();
  }
}, true);

/* ---------- toast ---------- */
let toastT;
function toast(msg) {
  $(".toast")?.remove();
  const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = msg;
  document.body.appendChild(d); clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 2400);
}

/* ---------- writes ---------- */
async function toggleStar(id) {
  const r = S.refs.find(x => x.id === id); if (!r) return;
  r.starred = !r.starred; render(); // 먼저 화면에 반영
  const { error } = await sb.from("refs").update({ starred: r.starred }).eq("id", id);
  if (error) { r.starred = !r.starred; render(); toast("중요 표시를 바꾸지 못했어요. 잠시 후 다시 눌러 주세요."); }
}
async function deleteRef(r) {
  const { error } = await sb.from("refs").delete().eq("id", r.id);
  if (error) throw error;
  if (r.image_path) await sb.storage.from(BUCKET).remove([r.image_path]);
  S.refs = S.refs.filter(x => x.id !== r.id);
  render();
}

/* ---------- image prep ---------- */
async function prepImage(file) {
  const ok = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  if (!file || !file.type.startsWith("image/")) throw new Error("이미지 파일(PNG, JPG, GIF, WEBP)만 올릴 수 있어요.");
  if (file.type === "image/gif") { if (file.size > 10e6) throw new Error("GIF는 10MB 이하만 올릴 수 있어요."); return file; }
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) { if (ok.includes(file.type) && file.size < 10e6) return file; throw new Error("이 이미지 형식은 읽을 수 없어요. PNG나 JPG로 저장해서 다시 올려 주세요."); }
  const MAX = 2000, big = Math.max(bmp.width, bmp.height);
  if (big <= MAX && file.size < 1.5e6 && ok.includes(file.type)) return file;
  const s = Math.min(1, MAX / big);
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(res => cv.toBlob(res, "image/webp", .88));
  if (blob && blob.type === "image/webp") return blob;
  return await new Promise(res => cv.toBlob(res, "image/jpeg", .88));
}
async function uploadImage(blob) {
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[blob.type] || "img";
  const path = `${S.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return path;
}

/* ---------- modal plumbing ---------- */
let lastFocus = null, onPaste = null;
function openSheet(html, init) {
  lastFocus = document.activeElement;
  $("#layer").innerHTML = `<div class="overlay" data-close-bg><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.style.overflow = "hidden";
  init && init($(".sheet"));
}
function closeSheet() {
  $("#layer").innerHTML = ""; document.body.style.overflow = "";
  if (onPaste) { document.removeEventListener("paste", onPaste); onPaste = null; }
  lastFocus?.focus?.();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && $(".overlay")) closeSheet(); });
$("#layer").addEventListener("mousedown", e => { if (e.target.matches("[data-close-bg]")) closeSheet(); });

/* ---------- add / edit form ---------- */
function openForm(existing, presetCat) {
  const r = existing || {};
  const firstCat = cats()[0]?.id;
  const st = {
    cat: r.category_id || presetCat || (S.tab !== "all" ? S.tab : firstCat),
    tags: [...(r.tags || [])], starred: !!r.starred,
    file: null, previewUrl: imgSrc(r) || "", keepPath: r.image_path || null, imageUrl: r.image_url || "", busy: false,
  };
  const allTags = [...new Set(S.refs.flatMap(x => x.tags || []))];
  const isMail = r.source === "gmail";
  openSheet(`
    <div class="sheet-head"><h3>${existing ? "레퍼런스 수정" : "레퍼런스 추가"}</h3><button class="x" type="button" data-close aria-label="닫기">✕</button></div>
    <form class="sheet-body" id="f" novalidate>
      <div class="field"><span class="lbl">카테고리</span><div class="pills" role="radiogroup" id="fcat"></div></div>
      ${isMail ? "" : `<div class="field"><label class="lbl" for="furl">링크<span class="opt">선택</span></label>
        <input class="input" id="furl" type="url" inputmode="url" placeholder="https://" value="${esc(r.url || "")}"></div>`}
      <div class="field"><label class="lbl" for="ftitle">제목</label>
        <input class="input" id="ftitle" type="text" maxlength="300" placeholder="예: 9월 금통위 기준금리 동결 기사" value="${esc(r.title || "")}"></div>
      <div class="field"><span class="lbl">이미지<span class="opt">선택</span></span><div id="fimg"></div>
        <input type="file" id="ffile" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
        <div id="furlbox"><div class="or" style="margin:4px 0 8px">또는 이미지 주소</div>
          <input class="input" id="fimgurl" type="url" inputmode="url" placeholder="https://… (이미지 우클릭 → 이미지 주소 복사)" value="${esc(st.imageUrl)}"></div></div>
      <div class="field"><label class="lbl" for="fnote">메모<span class="opt">선택</span></label>
        <textarea class="textarea" id="fnote" maxlength="3000" placeholder="왜 저장했는지, 무엇을 참고할지 적어 두세요">${esc(r.note || "")}</textarea></div>
      <div class="field"><label class="lbl" for="ftag">태그<span class="opt">Enter 또는 쉼표로 추가</span></label>
        <div class="tag-input" id="ftags"><input id="ftag" type="text" placeholder="예: 금리" autocomplete="off"></div>
        <div class="suggest" id="fsug"></div></div>
      <div class="field"><span class="lbl">중요 표시</span>
        <div class="pills"><button type="button" class="pill imp" id="fstar" aria-pressed="${st.starred}">★ 중요한 레퍼런스</button></div></div>
      <div id="ferr"></div>
    </form>
    <div class="sheet-foot"><button class="cta" type="submit" form="f" id="fsubmit">${existing ? "수정 완료" : "저장하기"}</button></div>
  `, sheet => {
    const drawCats = () => {
      $("#fcat").innerHTML = cats().map(c => `<button type="button" class="pill" role="radio" aria-checked="${st.cat === c.id}" data-c="${esc(c.id)}">${esc(c.name)}</button>`).join("");
    };
    const drawImg = () => {
      $("#fimg").innerHTML = st.previewUrl
        ? `<div class="preview"><img src="${esc(st.previewUrl)}" alt="선택한 이미지 미리보기" referrerpolicy="no-referrer"><button class="x" type="button" id="fimgx" aria-label="이미지 빼기">✕</button></div>`
        : `<div class="drop" id="fdrop" tabindex="0" role="button" aria-label="이미지 올리기"><b>클릭해서 이미지 올리기</b><span>파일을 끌어다 놓거나, 이미지를 복사한 뒤 Ctrl+V(⌘V)로 붙여넣을 수 있어요</span></div>`;
      $("#furlbox").hidden = !!st.file || !!st.keepPath;
    };
    const drawTags = () => {
      const box = $("#ftags"), inp = $("#ftag");
      box.querySelectorAll(".tchip").forEach(n => n.remove());
      st.tags.forEach(t => {
        const s = document.createElement("span"); s.className = "tchip";
        s.innerHTML = `#${esc(t)}<button type="button" aria-label="${esc(t)} 태그 삭제" data-rm="${esc(t)}">✕</button>`;
        box.insertBefore(s, inp);
      });
      $("#fsug").innerHTML = allTags.filter(t => !st.tags.includes(t)).slice(0, 10)
        .map(t => `<button type="button" class="tag" data-addtag="${esc(t)}">+ ${esc(t)}</button>`).join("");
    };
    const addTag = raw => {
      raw.split(",").map(t => t.trim().replace(/^#+/, "")).filter(Boolean).forEach(t => {
        if (!st.tags.includes(t) && st.tags.length < 12) st.tags.push(t.slice(0, 30));
      });
      drawTags();
    };
    const setFile = async f => {
      $("#ferr").innerHTML = "";
      try {
        const b = await prepImage(f);
        st.file = b; st.keepPath = null; st.imageUrl = ""; $("#fimgurl").value = "";
        st.previewUrl = URL.createObjectURL(b); drawImg();
      } catch (e) { $("#ferr").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    drawCats(); drawImg(); drawTags();

    $("#fimgurl").addEventListener("change", e => {
      const u = safeUrl(e.target.value.trim());
      st.imageUrl = u; st.previewUrl = u; drawImg();
    });
    sheet.addEventListener("click", e => {
      const t = e.target.closest("button,#fdrop"); if (!t) return;
      if (t.matches("[data-close]")) closeSheet();
      else if (t.dataset.c) { st.cat = t.dataset.c; drawCats(); }
      else if (t.id === "fdrop") $("#ffile").click();
      else if (t.id === "fimgx") { st.file = null; st.keepPath = null; st.imageUrl = ""; st.previewUrl = ""; $("#fimgurl").value = ""; drawImg(); }
      else if (t.dataset.rm) { st.tags = st.tags.filter(x => x !== t.dataset.rm); drawTags(); }
      else if (t.dataset.addtag) addTag(t.dataset.addtag);
      else if (t.id === "fstar") { st.starred = !st.starred; t.setAttribute("aria-pressed", st.starred); }
    });
    sheet.addEventListener("keydown", e => {
      if (e.target.id === "fdrop" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); $("#ffile").click(); }
      if (e.target.id === "ftag") {
        if ((e.key === "Enter" || e.key === ",") && !e.isComposing) { e.preventDefault(); addTag(e.target.value); e.target.value = ""; }
        else if (e.key === "Backspace" && !e.target.value && st.tags.length) { st.tags.pop(); drawTags(); }
      }
    });
    $("#ftag").addEventListener("blur", e => { if (e.target.value.trim()) { addTag(e.target.value); e.target.value = ""; } });
    $("#ffile").addEventListener("change", e => { const f = e.target.files[0]; if (f) setFile(f); e.target.value = ""; });
    sheet.addEventListener("dragover", e => { e.preventDefault(); $("#fdrop")?.classList.add("over"); });
    sheet.addEventListener("dragleave", e => { const d = $("#fdrop"); if (d && !d.contains(e.relatedTarget)) d.classList.remove("over"); });
    sheet.addEventListener("drop", e => { e.preventDefault(); const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith("image/")); if (f) setFile(f); });
    onPaste = e => {
      const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); setFile(f); toast("붙여넣은 이미지를 넣었어요"); }
    };
    document.addEventListener("paste", onPaste);

    $("#f").addEventListener("submit", async e => {
      e.preventDefault(); if (st.busy) return;
      const url = isMail ? (r.url || "") : $("#furl").value.trim();
      let title = $("#ftitle").value.trim();
      const note = $("#fnote").value.trim();
      const pend = $("#ftag").value.trim(); if (pend) { addTag(pend); $("#ftag").value = ""; }
      const typedImg = $("#fimgurl").value.trim();
      const err = m => { $("#ferr").innerHTML = `<div class="err">${esc(m)}</div>`; };
      if (!isMail && url && !safeUrl(url)) return err("링크는 https:// 로 시작하는 전체 주소로 넣어 주세요.");
      if (typedImg && !safeUrl(typedImg)) return err("이미지 주소는 https:// 로 시작하는 전체 주소로 넣어 주세요.");
      if (!title) title = domain(url);
      const hasImg = st.file || st.keepPath || typedImg;
      if (!title && !hasImg) return err("제목이나 링크, 이미지 중 하나는 넣어 주세요.");
      if (!title) title = "이미지 레퍼런스";
      if (!st.cat) return err("카테고리를 골라 주세요.");
      st.busy = true; const btn = $("#fsubmit"); btn.disabled = true; btn.textContent = st.file ? "이미지 올리는 중…" : "저장하는 중…";
      try {
        let image_path = st.keepPath;
        if (st.file) image_path = await uploadImage(st.file);
        const body = {
          title, note, tags: st.tags, starred: st.starred, category_id: st.cat,
          image_path: image_path || null,
          image_url: st.file || image_path ? null : (safeUrl(typedImg) || null),
        };
        if (!isMail) body.url = url ? safeUrl(url) : null;
        const q = existing ? sb.from("refs").update(body).eq("id", r.id) : sb.from("refs").insert(body);
        const { error } = await q;
        if (error) throw error;
        if (existing && r.image_path && r.image_path !== image_path) await sb.storage.from(BUCKET).remove([r.image_path]);
        closeSheet();
        if (!existing && S.tab !== "all" && S.tab !== st.cat) S.tab = st.cat;
        await load();
        toast(existing ? "수정했어요" : "저장했어요");
      } catch (ex) {
        console.error(ex);
        const msg = String(ex?.message || "");
        err(/exceed|too large|size/i.test(msg) ? "이미지가 너무 커요. 10MB 이하로 줄여서 다시 올려 주세요."
          : /JWT|auth|session/i.test(msg) ? "로그인이 만료됐어요. 새로고침한 뒤 다시 로그인해 주세요."
          : "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.");
        st.busy = false; btn.disabled = false; btn.textContent = existing ? "수정 완료" : "저장하기";
      }
    });
    setTimeout(() => (existing ? $("#ftitle") : ($("#furl") || $("#ftitle"))).focus({ preventScroll: true }), 30);
  });
}

/* ---------- detail ---------- */
function openDetail(id) {
  const r = S.refs.find(x => x.id === id); if (!r) return;
  const c = catById(r.category_id), src = imgSrc(r), link = safeUrl(r.url || "");
  const isMail = r.source === "gmail";
  openSheet(`
    <div class="sheet-head"><h3 style="font-size:14px;font-weight:500;color:var(--grey-1)">${esc(c ? c.name : "분류 없음")} · ${fmtDate(r.createdAt)}</h3>
      <button class="x" type="button" data-close aria-label="닫기">✕</button></div>
    <div class="sheet-body">
      ${src ? `<div class="d-img">${IMG(src)}</div>` : ""}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${metaHtml(r, { star: true })}
        <h2 class="d-title">${esc(r.title)}</h2>
      </div>
      ${r.note ? `<p class="d-note">${esc(r.note)}</p>` : ""}
      ${isMail && r.snippet ? `<div class="field"><span class="lbl">본문 미리보기</span><p class="quote">${esc(r.snippet)}</p></div>` : ""}
      ${tagsHtml(r)}
      <div id="dconfirm"></div>
    </div>
    <div class="sheet-foot">
      <div class="d-row">
        ${link ? `<a class="btn-dark" href="${esc(link)}" target="_blank" rel="noopener">${domain(link) === "Gmail" ? "Gmail에서 열기" : "원문 열기"} ↗</a>` : ""}
        <button class="btn-line" type="button" data-dstar>${r.starred ? "★ 중요 해제" : "☆ 중요 표시"}</button>
        <button class="btn-line" type="button" data-edit>수정</button>
        <button class="btn-line" type="button" data-del>삭제</button>
      </div>
    </div>`, sheet => {
    sheet.addEventListener("click", async e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-close]")) closeSheet();
      else if (t.matches("[data-edit]")) { closeSheet(); openForm(r); }
      else if (t.matches("[data-dstar]")) { closeSheet(); toggleStar(r.id); }
      else if (t.dataset.tag) { S.tag = t.dataset.tag; closeSheet(); render(); }
      else if (t.matches("[data-del]")) {
        $("#dconfirm").innerHTML = `<div class="confirm"><span>이 레퍼런스를 삭제할까요? 되돌릴 수 없어요.${isMail ? "<br>(Gmail의 메일은 그대로 남아요)" : ""}</span>
          <span style="display:flex;gap:8px"><button class="btn-ghost" type="button" data-nodel>취소</button><button class="btn-ghost danger" type="button" data-yesdel>삭제</button></span></div>`;
      }
      else if (t.matches("[data-nodel]")) $("#dconfirm").innerHTML = "";
      else if (t.matches("[data-yesdel]")) {
        t.disabled = true;
        try { await deleteRef(r); closeSheet(); toast("삭제했어요"); }
        catch (_) { $("#dconfirm").innerHTML = `<div class="err">삭제하지 못했어요. 잠시 후 다시 시도해 주세요.</div>`; }
      }
    });
  });
}

/* ---------- new category ---------- */
function openCatForm() {
  const st = { view: "list" };
  openSheet(`
    <div class="sheet-head"><h3>카테고리 만들기</h3><button class="x" type="button" data-close aria-label="닫기">✕</button></div>
    <form class="sheet-body" id="cf" novalidate>
      <div class="field"><label class="lbl" for="cname">이름</label>
        <input class="input" id="cname" type="text" maxlength="20" placeholder="예: 투자 아이디어, 브랜딩"></div>
      <div class="field"><span class="lbl">보기 방식</span><div class="pills" role="radiogroup" id="cview"></div><span class="hint" id="chint"></span></div>
      <div id="cerr"></div>
    </form>
    <div class="sheet-foot"><button class="cta" type="submit" form="cf" id="csubmit">카테고리 만들기</button></div>`, sheet => {
    const draw = () => {
      $("#cview").innerHTML = [["list", "리스트"], ["grid", "카드"]].map(([v, l]) => `<button type="button" class="pill" role="radio" aria-checked="${st.view === v}" data-v="${v}">${l}</button>`).join("");
      $("#chint").textContent = st.view === "grid" ? "이미지 중심. 핀터레스트처럼 원본 비율 카드로 보여줘요." : "글 중심. 기사 목록처럼 한 줄씩 보여줘요.";
    };
    draw();
    sheet.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.matches("[data-close]")) closeSheet();
      else if (t.dataset.v) { st.view = t.dataset.v; draw(); }
    });
    $("#cf").addEventListener("submit", async e => {
      e.preventDefault();
      const name = $("#cname").value.trim();
      if (!name) { $("#cerr").innerHTML = `<div class="err">카테고리 이름을 입력해 주세요.</div>`; return; }
      if (S.cats.some(c => c.name === name)) { $("#cerr").innerHTML = `<div class="err">‘${esc(name)}’ 카테고리가 이미 있어요.</div>`; return; }
      $("#csubmit").disabled = true;
      const body = { slug: "c" + Date.now().toString(36), name, view: st.view, sort_order: Math.max(0, ...S.cats.map(c => c.sort_order || 0)) + 1 };
      const { data, error } = await sb.from("categories").insert(body).select().single();
      if (error) { $("#csubmit").disabled = false; $("#cerr").innerHTML = `<div class="err">만들지 못했어요. 잠시 후 다시 시도해 주세요.</div>`; return; }
      S.cats.push(data); S.tab = data.id; closeSheet(); render(); toast(`‘${name}’ 카테고리를 만들었어요`);
    });
    setTimeout(() => $("#cname").focus({ preventScroll: true }), 30);
  });
}

/* ---------- app events ---------- */
function setTab(id) {
  S.tab = id; try { localStorage.setItem("dr.tab", id); } catch (e) {}
  render(); window.scrollTo({ top: 0 });
}
$("#app").addEventListener("click", e => {
  const t = e.target.closest("button,[data-open]"); if (!t) return;
  if (t.dataset.star) { e.stopPropagation(); toggleStar(t.dataset.star); return; }
  if (t.classList.contains("tag") && t.dataset.tag !== undefined) { e.stopPropagation(); S.tag = t.dataset.tag; render(); return; }
  if (t.dataset.tab) { setTab(t.dataset.tab); return; }
  if (t.id === "newCat") { openCatForm(); return; }
  if (t.id === "addTop" || t.id === "addBottom") { openForm(null); return; }
  if (t.id === "logout") { sb.auth.signOut(); return; }
  if (t.dataset.add !== undefined) { openForm(null, t.dataset.add || undefined); return; }
  if (t.matches("[data-cleartag]")) { S.tag = null; render(); return; }
  if (t.matches("[data-reload]")) { S.status = "loading"; render(); load(); return; }
  if (t.dataset.open) openDetail(t.dataset.open);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("article[data-open]")) { e.preventDefault(); openDetail(e.target.dataset.open); }
});
const qEl = $("#q");
qEl.addEventListener("input", () => { S.q = qEl.value; $("#qclear").hidden = !qEl.value; renderMain(); });
$("#qclear").addEventListener("click", () => { qEl.value = ""; S.q = ""; $("#qclear").hidden = true; renderMain(); qEl.focus(); });

/* ---------- login ---------- */
const redirectTo = location.origin + location.pathname;
$("#googleBox").hidden = !CFG.googleLogin;
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#email").value.trim();
  const msg = $("#loginMsg"), btn = $("#sendLink");
  if (!/^\S+@\S+\.\S+$/.test(email)) { msg.innerHTML = `<div class="err">이메일 주소를 정확히 입력해 주세요.</div>`; return; }
  btn.disabled = true; btn.textContent = "보내는 중…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
  btn.disabled = false; btn.textContent = "로그인 링크 받기";
  if (error) {
    const m = String(error.message || "");
    msg.innerHTML = `<div class="err">${/signup|not allowed|not found/i.test(m) ? "등록되지 않은 이메일이에요. 등록한 이메일 주소를 확인해 주세요."
      : /rate|security purposes|seconds/i.test(m) ? "잠시 후 다시 시도해 주세요. 로그인 메일은 짧은 시간에 여러 번 보낼 수 없어요."
      : "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."}</div>`;
    return;
  }
  msg.innerHTML = `<div class="ok"><b>${esc(email)}</b>로 로그인 링크를 보냈어요.<br>메일함에서 링크를 누르면 바로 들어와져요. 스팸함도 확인해 주세요.</div>`;
});
$("#google").addEventListener("click", async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) $("#loginMsg").innerHTML = `<div class="err">Google 로그인을 시작하지 못했어요. 이메일 링크로 로그인해 주세요.</div>`;
});

/* ---------- boot ---------- */
function onSession(session) {
  const u = session?.user || null;
  if (u && (!S.user || S.user.id !== u.id)) {
    S.user = u; S.status = "loading"; show("app"); render(); load();
    if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + location.search);
  } else if (!u) {
    S.user = null; S.refs = []; S.cats = []; S.signed = {}; closeSheet(); show("login");
  }
}
sb.auth.onAuthStateChange((_ev, session) => onSession(session));
sb.auth.getSession().then(({ data }) => onSession(data.session));
})();
