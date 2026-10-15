(function () {
  "use strict";
  const C = window.COURSE;
  const KEY = "aiesec-course-v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const strip = (h) => { const d = document.createElement("div"); d.innerHTML = h; return d.textContent.replace(/\s+/g, " ").trim(); };

  /* ---------- state ---------- */
  let S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
    S.done = S.done || {}; S.quiz = S.quiz || {}; S.rubric = S.rubric || {};
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }
  load();

  /* ---------- derived structure ---------- */
  const modById = Object.fromEntries(C.modules.map((m) => [m.id, m]));
  // Core trackable items (counted in progress). Optional items are tracked but not counted.
  const items = []; // {id,title,route,mod,week,optional,kind}
  C.modules.forEach((m) => {
    m.weekBlocks.forEach((wb) => wb.lessons.forEach((l) => items.push({ id: l.id, title: l.title, route: `#/module/${m.id}`, mod: m.id, week: wb.week, optional: !!l.optional, kind: "lesson" })));
    const lastWeek = m.weekBlocks[m.weekBlocks.length - 1].week;
    items.push({ id: m.project.id, title: `Project: ${m.project.name}`, route: `#/module/${m.id}`, mod: m.id, week: lastWeek, kind: "project" });
    items.push({ id: `${m.id}-quiz`, title: `Module ${m.num} checkpoint quiz`, route: `#/module/${m.id}`, mod: m.id, week: lastWeek, kind: "quiz" });
  });
  C.capstone.requirements.concat(C.capstone.deliverables).forEach((r) => items.push({ id: r.id, title: r.title, route: "#/capstone", mod: "capstone", week: 12, kind: "capstone" }));
  C.electives.items.forEach((e) => items.push({ id: e.id, title: e.title, route: "#/electives", mod: "electives", optional: true, kind: "elective" }));
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));

  function isDone(id) {
    if (id.endsWith("-quiz")) { const q = S.quiz[id.replace("-quiz", "")]; return !!(q && q.answers && q.answers.filter((a) => a != null).length === 5); }
    return !!S.done[id];
  }
  function stats(filter) {
    const list = items.filter((i) => !i.optional && (!filter || filter(i)));
    const d = list.filter((i) => isDone(i.id)).length;
    return { done: d, total: list.length, pct: list.length ? Math.round((100 * d) / list.length) : 0 };
  }

  /* ---------- deterministic option shuffle (so answer positions vary) ---------- */
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function order(qid, n) { const idx = [...Array(n).keys()]; let h = hash(qid); for (let i = n - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx; }

  /* ---------- toast ---------- */
  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200); }

  /* ---------- theme ---------- */
  function setTheme(t) { document.documentElement.setAttribute("data-theme", t); $("#themeBtn").textContent = t === "dark" ? "☀️" : "🌙"; S.theme = t; save(); }
  $("#themeBtn").addEventListener("click", () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  $("#themeBtn").textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";

  /* ---------- sidebar ---------- */
  function renderSidebar(route) {
    const all = stats();
    const link = (href, inner, active, extra = "") => `<a class="nav-link ${active ? "active" : ""} ${extra}" href="${href}">${inner}</a>`;
    let h = `<div class="side-progress"><div class="row"><span>Course progress</span><b id="sidePct">${all.pct}%</b></div><div class="bar"><span style="width:${all.pct}%"></span></div><div class="row" style="margin-top:6px"><span>${all.done} of ${all.total} items</span></div></div>`;
    h += `<div class="nav-group">${link("#/", "🏠 Home &amp; roadmap", route.page === "home")}</div>`;
    h += `<div class="nav-group"><div class="nav-title">Modules</div>`;
    C.modules.forEach((m) => {
      const s = stats((i) => i.mod === m.id);
      h += link(`#/module/${m.id}`, `<span class="dot">${s.pct === 100 ? "✓" : "M" + m.num}</span><span>${esc(m.short)}</span><span class="pct">${s.pct}%</span>`, route.page === "module" && route.id === m.id, s.pct === 100 ? "done" : "");
      h += `<div class="nav-weeks">${m.weekBlocks.map((wb) => `<a href="#/week/${wb.week}">Wk ${wb.week}</a>`).join("")}</div>`;
    });
    const cs = stats((i) => i.mod === "capstone");
    h += link("#/capstone", `<span class="dot">${cs.pct === 100 ? "✓" : "12"}</span><span>Capstone</span><span class="pct">${cs.pct}%</span>`, route.page === "capstone", cs.pct === 100 ? "done" : "");
    h += `</div><div class="nav-group"><div class="nav-title">More</div>`;
    h += link("#/electives", "🎨 Electives (optional)", route.page === "electives");
    h += link("#/repos", "📦 The 10 repos", route.page === "repos");
    h += link("#/progress", "📊 My progress", route.page === "progress");
    h += `</div>`;
    $("#sidebar").innerHTML = h;
  }
  function updateProgressUI() {
    const s = stats();
    $("#progressStrip").style.width = s.pct + "%";
    renderSidebar(current);
    $$("[data-mod-progress]").forEach((el) => { const id = el.dataset.modProgress; const st = stats((i) => i.mod === id); el.querySelector(".bar span").style.width = st.pct + "%"; el.querySelector(".txt").textContent = `${st.done}/${st.total} done · ${st.pct}%`; });
  }

  /* mobile menu */
  function closeMenu() { $("#sidebar").classList.remove("open"); $("#backdrop").hidden = true; $("#menuBtn").setAttribute("aria-expanded", "false"); }
  $("#menuBtn").addEventListener("click", () => { const o = !$("#sidebar").classList.contains("open"); $("#sidebar").classList.toggle("open", o); $("#backdrop").hidden = !o; $("#menuBtn").setAttribute("aria-expanded", String(o)); });
  $("#backdrop").addEventListener("click", closeMenu);

  /* ---------- resume ---------- */
  function firstUndone() { return items.find((i) => !i.optional && !isDone(i.id)); }
  function resumeTarget() {
    if (S.last && S.last.route) return S.last;
    const f = firstUndone();
    return f ? { route: f.route, item: f.id, label: f.title } : { route: "#/capstone", label: "Capstone" };
  }
  function resume() {
    const t = resumeTarget();
    let item = t.item && t.item.endsWith("-quiz") ? `quiz-${t.item.replace("-quiz", "")}` : t.item;
    if (!item) { const nx = items.find((i) => i.route === t.route && !i.optional && !isDone(i.id)); item = nx ? (nx.kind === "quiz" ? `quiz-${nx.mod}` : nx.id) : null; }
    pendingScroll = item || null;
    if (location.hash === t.route) route(); else location.hash = t.route;
  }
  $("#resumeTop").addEventListener("click", resume);
  function remember(itemId) {
    const it = itemById[itemId];
    S.last = { route: it ? it.route : location.hash, item: itemId || null, label: it ? it.title : document.title, ts: Date.now() };
    save();
  }

  /* ---------- lesson markup ---------- */
  function lessonRow(l, extraLabel) {
    const d = isDone(l.id);
    return `<div class="lesson ${d ? "done" : ""}" id="${l.id}">
      <input type="checkbox" class="check" data-item="${l.id}" ${d ? "checked" : ""} aria-label="Mark “${esc(strip(l.title))}” complete">
      <div class="body"><div class="t">${l.title}${l.optional ? ' <span class="pill">optional</span>' : ""}${extraLabel || ""}</div><div class="d">${l.html}</div></div></div>`;
  }

  /* ---------- quiz ---------- */
  function quizHTML(key, quiz, title) {
    const st = S.quiz[key] || { answers: [] };
    let h = `<section class="quiz card" id="quiz-${key}" data-quiz="${key}"><h2 style="margin-top:0">📝 ${title}</h2><p class="muted">Pick an answer for instant feedback. The explanation is the answer from the syllabus.</p>`;
    quiz.forEach((q, qi) => {
      const ord = order(`${key}-${qi}`, q.options.length);
      const chosen = st.answers[qi];
      const answered = chosen != null;
      h += `<div class="q" data-q="${qi}"><div class="qt">${qi + 1}. ${q.q}</div><div class="opts">`;
      ord.forEach((oi, pos) => {
        let cls = "";
        if (answered) { if (oi === q.a) cls = "correct"; else if (oi === chosen) cls = "wrong"; }
        h += `<button type="button" class="opt ${cls}" data-o="${oi}" ${answered ? "disabled" : ""}><span class="k">${"ABCD"[pos]}</span><span>${q.options[oi]}</span></button>`;
      });
      h += `</div>`;
      if (answered) h += feedbackHTML(chosen === q.a, q.explain);
      h += `</div>`;
    });
    h += `<div class="scorebox" aria-live="polite">${scoreText(key, quiz)}</div></section>`;
    return h;
  }
  function feedbackHTML(ok, explain) { return `<div class="feedback ${ok ? "ok" : "bad"}"><b>${ok ? "✅ Correct." : "❌ Not quite."}</b> ${explain}</div>`; }
  function scoreText(key, quiz) {
    const st = S.quiz[key] || { answers: [] };
    const answered = st.answers.filter((a) => a != null).length;
    const correct = st.answers.filter((a, i) => a != null && a === quiz[i].a).length;
    const best = st.best != null ? ` · Best: ${st.best}/5` : "";
    const msg = answered < 5 ? `<span><b>${correct}/${answered}</b> correct so far · ${5 - answered} to go${best}</span>`
      : `<span><b>Score: ${correct}/5</b> ${correct === 5 ? "🎉 Perfect!" : correct >= 4 ? "Great work." : correct >= 3 ? "Good. Review the misses." : "Revisit the lessons and retry."}${best}</span>`;
    return msg + (answered ? `<button type="button" class="btn btn-sm" data-retake="${key}">↺ Retake</button>` : "");
  }
  function quizData(key) { return key === "electives" ? C.electives.quiz : modById[key].quiz; }
  function onQuizClick(e) {
    const rt = e.target.closest("[data-retake]");
    if (rt) { const key = rt.dataset.retake; S.quiz[key] = { answers: [], best: (S.quiz[key] || {}).best }; save(); const sec = $(`#quiz-${key}`); sec.outerHTML = quizHTML(key, quizData(key), sec.querySelector("h2").textContent.replace("📝 ", "")); updateProgressUI(); toast("Quiz reset"); return; }
    const opt = e.target.closest(".opt"); if (!opt || opt.disabled) return;
    const sec = opt.closest("[data-quiz]"); const key = sec.dataset.quiz; const quiz = quizData(key);
    const qEl = opt.closest(".q"); const qi = +qEl.dataset.q; const oi = +opt.dataset.o; const q = quiz[qi];
    const st = S.quiz[key] = S.quiz[key] || { answers: [] };
    st.answers[qi] = oi;
    $$(".opt", qEl).forEach((b) => { b.disabled = true; const o = +b.dataset.o; if (o === q.a) b.classList.add("correct"); else if (o === oi) b.classList.add("wrong"); });
    qEl.insertAdjacentHTML("beforeend", feedbackHTML(oi === q.a, q.explain));
    const answered = st.answers.filter((a) => a != null).length;
    if (answered === 5) { const c = st.answers.filter((a, i) => a === quiz[i].a).length; st.best = Math.max(st.best || 0, c); toast(`Quiz complete: ${c}/5`); }
    save();
    if (key !== "electives") remember(`${key}-quiz`);
    $(".scorebox", sec).innerHTML = scoreText(key, quiz);
    updateProgressUI();
  }

  /* ---------- pages ---------- */
  function modProgressBlock(id) { return `<div data-mod-progress="${id}" style="max-width:360px"><div class="bar"><span></span></div><div class="txt muted" style="font-size:.85rem;margin-top:4px"></div></div>`; }
  const foot = `<footer class="site-foot">Content from the course files (README, syllabus, repos, capstone). Repo facts verified Oct 14, 2026 (~9 PM CT); stars change daily. Quiz answers come from the syllabus; the wrong answer choices were written for this site. Progress is saved only in this browser (localStorage).</footer>`;

  function pageHome() {
    const s = stats(); const t = resumeTarget(); const started = s.done > 0 || (S.last && S.last.route);
    let h = `<section class="hero"><span class="eyebrow">Free · Self-paced · 12 weeks</span><h1>${C.title}<br><span class="muted" style="font-size:.6em;font-weight:600">${C.subtitle}</span></h1><p>${C.pitch}</p><p>${C.free}</p>
      <div class="hero-actions">${started ? `<button class="btn btn-primary" id="resumeHero">▶ Resume where you left off</button><span class="muted" style="align-self:center;font-size:.9rem">Next up: ${esc(strip(t.label || ""))}</span>` : `<a class="btn btn-primary" href="#/module/m1">🚀 Start Week 1</a>`}<a class="btn" href="#/repos">📦 See the 10 repos</a><a class="btn" href="#/capstone">🏁 Capstone</a></div>
      <div class="stats"><div class="stat"><b>12</b><span>weeks</span></div><div class="stat"><b>~91 h</b><span>6–8 hrs/week</span></div><div class="stat"><b>7 + 1</b><span>modules + capstone</span></div><div class="stat"><b>$0</b><span>no paid API key</span></div></div>
      <div style="margin-top:18px"><div class="row" style="display:flex;justify-content:space-between;font-size:.9rem"><span>Your progress</span><b>${s.pct}% · ${s.done}/${s.total}</b></div><div class="bar" style="height:10px"><span style="width:${s.pct}%"></span></div></div></section>`;
    h += `<h2 id="roadmap">🗺️ 12-week roadmap</h2><p class="muted">${strip(C.timeline)}</p><div class="roadmap">`;
    C.roadmap.forEach((r) => {
      const modName = r.m === "capstone" ? "Capstone" : `M${modById[r.m].num} · ${modById[r.m].short}`;
      const st = stats((i) => i.week === r.w);
      h += `<a class="week ${st.pct === 100 ? "done" : ""}" href="${r.m === "capstone" ? "#/capstone" : `#/week/${r.w}`}"><div class="wk">Week ${r.w}</div><div class="mod">${esc(modName)}</div><h3>${esc(r.label)}</h3><p>${esc(r.out)}</p><div class="bar"><span style="width:${st.pct}%"></span></div></a>`;
    });
    h += `<a class="week" href="#/electives" style="border-style:dashed"><div class="wk">Optional</div><div class="mod">Electives</div><h3>Generative and computer vision</h3><p>Stable Diffusion, Segment Anything (Colab)</p></a></div>`;
    h += `<div class="grid-2"><div class="card"><h2 style="margin-top:0">👥 Who it's for</h2><ul class="clean">${C.who.map((x) => `<li>${x}</li>`).join("")}</ul></div><div class="card"><h2 style="margin-top:0">🧰 Prerequisites</h2><ul class="clean">${C.prereqs.map((x) => `<li>${x}</li>`).join("")}</ul></div></div>`;
    h += `<div class="card"><h2 style="margin-top:0">🧭 Why this order</h2><ol class="clean">${C.whyOrder.map((x) => `<li>${x}</li>`).join("")}</ol></div>`;
    h += `<div class="callout">${C.freeModelRule}</div>`;
    h += `<div class="card"><h2 style="margin-top:0">📏 Ground rules</h2><ul class="clean">${C.groundRules.map((x) => `<li>${x}</li>`).join("")}</ul></div>`;
    h += timeTable() + foot;
    return h;
  }
  function timeTable() {
    return `<h2>⏱️ Time summary</h2><div class="table-wrap"><table><thead><tr><th>Module</th><th>Weeks</th><th>Hours</th></tr></thead><tbody>${C.modules.map((m) => `<tr><td><a href="#/module/${m.id}">M${m.num} ${esc(m.title)}</a></td><td>${m.weeks}</td><td>${m.hours}</td></tr>`).join("")}<tr><td><a href="#/capstone">Capstone</a></td><td>12</td><td>~8</td></tr><tr><td><b>Total</b></td><td><b>12</b></td><td><b>~91</b> (electives extra)</td></tr></tbody></table></div>`;
  }

  function pageModule(m) {
    const i = C.modules.indexOf(m); const prev = C.modules[i - 1]; const next = C.modules[i + 1];
    let h = `<div class="crumbs"><a href="#/">Home</a> › Module ${m.num}</div>
      <div class="mod-head"><h1>M${m.num}: ${esc(m.title)}</h1></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"><span class="pill">📅 Week${m.weeks.includes("–") ? "s" : ""} ${m.weeks}</span><span class="pill">⏱️ ${m.hours} hrs</span></div>
      ${modProgressBlock(m.id)}
      <p>${m.repoLine}</p>`;
    if (m.num >= 5) h += `<div class="callout">${C.freeModelRule}</div>`;
    else h += `<details class="fold"><summary>Free-model rule (used throughout)</summary><p>${C.freeModelRule}</p></details>`;
    h += `<div class="card"><h2 style="margin-top:0">🎯 Learning objectives</h2><ul class="clean">${m.objectives.map((o) => `<li>${o}</li>`).join("")}</ul></div>`;
    m.weekBlocks.forEach((wb) => {
      h += `<div class="week-h" id="week-${wb.week}"><h2>Week ${wb.week}</h2><span class="pill">⏱️ ${wb.time}</span></div>`;
      h += wb.lessons.map((l) => lessonRow(l)).join("");
    });
    h += `<h2>🛠️ Project: <code>${m.project.name}</code></h2>` + lessonRow({ id: m.project.id, title: `Build <code>${m.project.name}</code> <span class="pill">${m.project.time}</span>`, html: m.project.html });
    h += quizHTML(m.id, m.quiz, `Module ${m.num} checkpoint quiz`);
    h += `<div class="pager">${prev ? `<a class="btn" href="#/module/${prev.id}">← M${prev.num} ${esc(prev.short)}</a>` : `<a class="btn" href="#/">← Home</a>`}${next ? `<a class="btn btn-primary" href="#/module/${next.id}">M${next.num} ${esc(next.short)} →</a>` : `<a class="btn btn-primary" href="#/capstone">Capstone →</a>`}</div>` + foot;
    return h;
  }

  function pageCapstone() {
    const c = C.capstone;
    let h = `<div class="crumbs"><a href="#/">Home</a> › Week 12</div><h1>🏁 Capstone: ${c.title}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"><span class="pill">⏱️ ${esc(c.time)}</span><span class="pill ok">💸 Cost: ${esc(c.cost)}</span></div>
      ${modProgressBlock("capstone")}
      <h2>The brief</h2><p>${c.brief}</p>${c.requirements.map((r, i) => lessonRow({ id: r.id, title: `${i + 1}. ${r.title}`, html: r.html })).join("")}
      <h2>📦 Deliverables</h2>${c.deliverables.map((d) => lessonRow({ id: d.id, title: d.title, html: d.html })).join("")}
      <div class="callout warn"><b>Constraints</b><ul class="clean">${c.constraints.map((x) => `<li>${x}</li>`).join("")}</ul></div>
      <h2 id="rubric">📊 Rubric (100 points)</h2><p class="muted">Self-assess each criterion to estimate your score. Your picks are saved.</p>
      <div class="table-wrap rubric"><table class="rubric-table"><thead><tr><th>Criterion</th><th>Excellent (full)</th><th>Adequate (~half)</th><th>Missing (0)</th><th>Pts</th><th>Self-score</th></tr></thead><tbody>`;
    c.rubric.forEach((r, i) => {
      const v = S.rubric[i] || "";
      h += `<tr><td data-l="Criterion"><b>${esc(r[0])}</b></td><td data-l="Excellent">${esc(r[1])}</td><td data-l="Adequate">${esc(r[2])}</td><td data-l="Missing">${esc(r[3])}</td><td data-l="Pts">${r[4]}</td><td data-l="Self-score"><select data-rub="${i}" aria-label="Self-score for ${esc(r[0])}"><option value="" ${v === "" ? "selected" : ""}>—</option><option value="full" ${v === "full" ? "selected" : ""}>Excellent (${r[4]})</option><option value="half" ${v === "half" ? "selected" : ""}>Adequate (~${r[4] / 2})</option><option value="zero" ${v === "zero" ? "selected" : ""}>Missing (0)</option></select></td></tr>`;
    });
    h += `</tbody></table></div><div class="scorebox" id="rubricTotal">${rubricTotal()}</div>
      <p><b>Grade bands:</b> ${c.bands.map((b) => `${esc(b[0])} ${esc(b[1])}`).join(" · ")}.</p>
      <h2>🚀 Stretch goals</h2><ul class="clean">${c.stretch.map((x) => `<li>${x}</li>`).join("")}</ul>
      <div class="pager"><a class="btn" href="#/module/m7">← M7 Production &amp; security</a><a class="btn" href="#/electives">Electives →</a></div>` + foot;
    return h;
  }
  function rubricTotal() {
    const r = C.capstone.rubric; let tot = 0, n = 0;
    r.forEach((row, i) => { const v = S.rubric[i]; if (v) { n++; tot += v === "full" ? row[4] : v === "half" ? row[4] / 2 : 0; } });
    if (!n) return `<span>Pick a self-score for each criterion to see your estimated total.</span>`;
    const band = tot >= 90 ? "portfolio-ready" : tot >= 75 ? "solid, polish the docs" : tot >= 60 ? "working prototype, harden security and evals" : "revisit M5–M7";
    return `<span class="total">Estimated: ${tot}/100</span><span>${n < r.length ? `${r.length - n} criteria not scored yet` : `Band: <b>${band}</b>`}</span>`;
  }

  function pageElectives() {
    const e = C.electives;
    return `<div class="crumbs"><a href="#/">Home</a> › Electives</div><h1>🎨 Optional Electives: Generative and Computer Vision</h1><div class="callout warn">${e.intro}</div>
      ${e.items.map((x) => lessonRow(x)).join("")}
      ${quizHTML("electives", e.quiz, "Electives quick quiz")}
      <div class="pager"><a class="btn" href="#/capstone">← Capstone</a><a class="btn" href="#/repos">The 10 repos →</a></div>` + foot;
  }

  let repoFilter = "all";
  function pageRepos() {
    const M = C.reposMeta;
    const filters = [["all", "All 10"], ["core", "Core path"], ["elective", "Electives"], ["caveat", "Has caveats"]];
    let h = `<div class="crumbs"><a href="#/">Home</a> › Repos</div><h1>📦 The 10 Repositories: Verified Facts</h1>
      <p><b>Source post:</b> ${M.source}</p>
      <div class="callout"><b>Verification:</b> ${M.verification}</div>
      <div class="callout warn"><b>⚠️ Caveats</b><ul class="clean">${M.caveats.map((x) => `<li>${x}</li>`).join("")}</ul></div>
      <details class="fold"><summary>How the list was found</summary><p>${M.howFound}</p><figure style="margin:0"><img class="src-img" src="assets/x-post-image.png" alt="Terminal screenshot titled TOP JUPYTER NOTEBOOK REPOSITORIES, attached to the X post" loading="lazy"><figcaption class="muted" style="font-size:.85rem">The image attached to the X post. The repo list comes from it.</figcaption></figure></details>
      <details class="fold"><summary>Unverified</summary><p>${M.unverified}</p></details>
      <div class="filters" role="group" aria-label="Filter repos">${filters.map((f) => `<button type="button" data-filter="${f[0]}" class="${repoFilter === f[0] ? "on" : ""}">${f[1]}</button>`).join("")}</div>
      <div class="repo-grid" id="repoGrid">${repoCards()}</div>
      <h2>🆓 Free-tools notes</h2><ul class="clean">${M.freeTools.map((x) => `<li>${x}</li>`).join("")}</ul>` + foot;
    return h;
  }
  function repoCards() {
    return C.repos.filter((r) => {
      const elective = r.n === 6 || r.n === 10;
      if (repoFilter === "core") return !elective;
      if (repoFilter === "elective") return elective;
      if (repoFilter === "caveat") return r.flags.length > 0;
      return true;
    }).map((r) => `<article class="repo" id="repo-${r.n}"><div class="repo-top"><span class="num">#${r.n}</span><h3><a href="${r.url}" target="_blank" rel="noopener">${esc(r.name)}</a></h3><span class="pill">${r.short}</span>${r.flags.map((f) => `<span class="pill ${/Inactive|No license/.test(f) ? "bad" : "warn"}">${esc(f)}</span>`).join("")}</div>
      <div class="facts"><div class="fact"><span class="lbl">⭐ Stars (image → now)</span>${r.stars}</div><div class="fact"><span class="lbl">⚖️ License</span>${r.license}</div><div class="fact"><span class="lbl">🕒 Last push (CT)</span>${r.push}</div></div>
      <div class="covers"><b>What it covers:</b> ${r.covers}</div><p style="margin-bottom:0"><b>Where it fits:</b> ${r.fit}</p></article>`).join("");
  }

  function pageProgress() {
    let h = `<div class="crumbs"><a href="#/">Home</a> › Progress</div><h1>📊 My progress</h1>${modProgressBlock("__all")}`;
    const groups = C.modules.map((m) => [m.id, `M${m.num} ${m.title}`, `#/module/${m.id}`]).concat([["capstone", "Capstone", "#/capstone"]]);
    h += `<div class="table-wrap"><table><thead><tr><th>Module</th><th>Done</th><th>Quiz</th><th>Next item</th></tr></thead><tbody>`;
    groups.forEach(([id, name, href]) => {
      const st = stats((i) => i.mod === id); const nx = items.find((i) => i.mod === id && !i.optional && !isDone(i.id));
      const q = S.quiz[id]; const qs = q && q.answers ? `${q.answers.filter((a, i) => a != null && a === modById[id].quiz[i].a).length}/5${q.best != null ? ` (best ${q.best})` : ""}` : id === "capstone" ? "—" : "not taken";
      h += `<tr><td><a href="${href}">${esc(name)}</a></td><td>${st.done}/${st.total} (${st.pct}%)</td><td>${qs}</td><td>${nx ? `<a href="${href}" data-goto="${nx.kind === "quiz" ? `quiz-${nx.mod}` : nx.id}">${nx.title}</a>` : "✓ complete"}</td></tr>`;
    });
    h += `</tbody></table></div><h2>Backup &amp; reset</h2><p class="muted">Progress lives only in this browser. Export it to move between devices.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="exportBtn">⬇ Export progress</button><label class="btn" style="cursor:pointer">⬆ Import<input type="file" id="importFile" accept="application/json" hidden></label><button class="btn" id="resetBtn" style="color:var(--bad)">🗑 Reset all progress</button></div>` + foot;
    return h;
  }

  /* ---------- search ---------- */
  let index = null;
  function buildIndex() {
    const ix = [];
    const add = (kind, title, html, route, anchor) => ix.push({ kind, title: strip(title), text: strip(html), route, anchor });
    add("Home", "Course overview", C.pitch + C.free + C.who.join(" ") + C.prereqs.join(" ") + C.timeline, "#/", null);
    add("Home", "Why this order", C.whyOrder.join(" "), "#/", null);
    add("Home", "Ground rules", C.groundRules.join(" "), "#/", null);
    add("Home", "Free-model rule", C.freeModelRule, "#/", null);
    C.modules.forEach((m) => {
      const r = `#/module/${m.id}`;
      add(`Module ${m.num}`, `M${m.num}: ${m.title}`, m.repoLine + m.objectives.join(" "), r, null);
      m.weekBlocks.forEach((wb) => wb.lessons.forEach((l) => add(`Week ${wb.week} lesson`, l.title, l.html, r, l.id)));
      add(`Module ${m.num} project`, `Project: ${m.project.name}`, m.project.html, r, m.project.id);
      m.quiz.forEach((q, qi) => add(`Module ${m.num} quiz`, `Q${qi + 1}: ${q.q}`, q.explain, r, `quiz-${m.id}`));
    });
    const c = C.capstone;
    add("Capstone", c.title, c.brief + c.constraints.join(" "), "#/capstone", null);
    c.requirements.concat(c.deliverables).forEach((x) => add("Capstone", x.title, x.html, "#/capstone", x.id));
    c.rubric.forEach((r) => add("Capstone rubric", r[0], r.slice(1, 4).join(" · "), "#/capstone", "rubric"));
    add("Capstone", "Stretch goals", c.stretch.join(" "), "#/capstone", null);
    C.electives.items.forEach((e) => add("Elective", e.title, e.html, "#/electives", e.id));
    C.repos.forEach((r) => add("Repo", `#${r.n} ${r.name}`, `${r.license} ${r.push} ${r.covers} ${r.fit} ${r.flags.join(" ")}`, "#/repos", `repo-${r.n}`));
    const M = C.reposMeta;
    add("Repos", "How the list was found", M.howFound, "#/repos", null);
    add("Repos", "Caveats", M.caveats.join(" "), "#/repos", null);
    add("Repos", "Free-tools notes", M.freeTools.join(" "), "#/repos", null);
    return ix;
  }
  function hl(text, terms) { let t = esc(text); terms.forEach((w) => { if (!w) return; t = t.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>"); }); return t; }
  function pageSearch(q) {
    index = index || buildIndex();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let h = `<h1>🔎 Search</h1>`;
    if (!terms.length) return h + `<p class="muted">Type in the search box above, e.g. <i>RAG</i>, <i>prompt injection</i>, <i>LoRA</i>, <i>license</i>.</p>`;
    const res = index.map((e) => {
      const T = e.title.toLowerCase(), X = e.text.toLowerCase();
      if (!terms.every((w) => T.includes(w) || X.includes(w))) return null;
      return { e, score: terms.reduce((s, w) => s + (T.includes(w) ? 5 : 0) + (X.split(w).length - 1), 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    h += `<p class="muted">${res.length} result${res.length === 1 ? "" : "s"} for “${esc(q)}”</p>`;
    res.slice(0, 60).forEach(({ e }) => {
      const X = e.text; const p = Math.max(0, X.toLowerCase().indexOf(terms[0]) - 70);
      const snip = (p > 0 ? "…" : "") + X.slice(p, p + 220) + (X.length > p + 220 ? "…" : "");
      h += `<a class="result" href="${e.route}" ${e.anchor ? `data-goto="${e.anchor}"` : ""}><div class="kind">${esc(e.kind)}</div><div class="rt">${hl(e.title, terms)}</div><div class="snip">${hl(snip, terms)}</div></a>`;
    });
    if (!res.length) h += `<p>No matches. Try fewer or different words.</p>`;
    return h;
  }
  let st;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(st); const q = e.target.value.trim();
    st = setTimeout(() => {
      const target = q ? `#/search?q=${encodeURIComponent(q)}` : "#/";
      if (current.page === "search") { history.replaceState(null, "", target); route(); } else location.hash = target;
    }, 180);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("#searchInput").focus(); } if (e.key === "Escape") closeMenu(); });

  /* ---------- router ---------- */
  let current = { page: "home" };
  let pendingScroll = null;
  function parse() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = new URLSearchParams(qs || "");
    if (!parts.length) return { page: "home" };
    if (parts[0] === "module" && modById[parts[1]]) return { page: "module", id: parts[1] };
    if (parts[0] === "week") { const w = +parts[1]; if (w === 12) return { page: "capstone" }; const m = C.modules.find((m) => m.weekBlocks.some((b) => b.week === w)); if (m) return { page: "module", id: m.id, week: w }; }
    if (["capstone", "repos", "electives", "progress"].includes(parts[0])) return { page: parts[0] };
    if (parts[0] === "search") return { page: "search", q: params.get("q") || "" };
    return { page: "home" };
  }
  function route() {
    current = parse();
    const main = $("#main");
    let html, title = C.title;
    switch (current.page) {
      case "module": { const m = modById[current.id]; html = pageModule(m); title = `M${m.num} ${m.title} · ${C.title}`; break; }
      case "capstone": html = pageCapstone(); title = `Capstone · ${C.title}`; break;
      case "repos": html = pageRepos(); title = `The 10 repos · ${C.title}`; break;
      case "electives": html = pageElectives(); title = `Electives · ${C.title}`; break;
      case "progress": html = pageProgress(); title = `My progress · ${C.title}`; break;
      case "search": html = pageSearch(current.q); title = `Search · ${C.title}`; if ($("#searchInput").value !== current.q && document.activeElement !== $("#searchInput")) $("#searchInput").value = current.q; break;
      default: html = pageHome();
    }
    main.innerHTML = html; document.title = title;
    if (current.page !== "search" && document.activeElement !== $("#searchInput")) $("#searchInput").value = "";
    if (["module", "capstone", "electives"].includes(current.page)) {
      const canon = current.page === "module" ? `#/module/${current.id}` : `#/${current.page}`;
      const keepItem = S.last && S.last.route === canon ? S.last.item : null;
      S.last = { route: canon, item: keepItem, label: document.title.split(" · ")[0], ts: Date.now() };
      save();
    }
    $("#resumeTop").title = "Resume: " + strip(resumeTarget().label || "");
    updateProgressUI(); closeMenu();
    const resumeHero = $("#resumeHero"); if (resumeHero) resumeHero.addEventListener("click", resume);
    // scrolling
    const anchor = pendingScroll || (current.week ? `week-${current.week}` : null);
    pendingScroll = null;
    requestAnimationFrame(() => {
      const el = anchor && document.getElementById(anchor);
      if (el) { el.scrollIntoView({ block: "center" }); if (el.classList.contains("lesson")) { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); } }
      else window.scrollTo(0, 0);
    });
  }
  window.addEventListener("hashchange", route);

  /* ---------- delegated events ---------- */
  document.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-item]");
    if (cb) {
      const id = cb.dataset.item; S.done[id] = cb.checked; if (!cb.checked) delete S.done[id];
      cb.closest(".lesson").classList.toggle("done", cb.checked);
      remember(id); save(); updateProgressUI();
      if (cb.checked) { const it = itemById[id]; const ms = it && stats((i) => i.mod === it.mod); toast(ms && ms.pct === 100 ? "🎉 Section complete!" : "Marked complete ✓"); }
      return;
    }
    const sel = e.target.closest("[data-rub]");
    if (sel) { S.rubric[sel.dataset.rub] = sel.value; if (!sel.value) delete S.rubric[sel.dataset.rub]; save(); $("#rubricTotal").innerHTML = rubricTotal(); return; }
    if (e.target.id === "importFile" && e.target.files[0]) {
      e.target.files[0].text().then((t) => { const d = JSON.parse(t); if (typeof d !== "object" || !d) throw 0; S = d; S.done = S.done || {}; S.quiz = S.quiz || {}; S.rubric = S.rubric || {}; save(); route(); toast("Progress imported"); }).catch(() => toast("That file isn't a valid progress export"));
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".quiz")) onQuizClick(e);
    const f = e.target.closest("[data-filter]");
    if (f) { repoFilter = f.dataset.filter; $$("[data-filter]").forEach((b) => b.classList.toggle("on", b === f)); $("#repoGrid").innerHTML = repoCards(); }
    const g = e.target.closest("[data-goto]");
    if (g) { e.preventDefault(); pendingScroll = g.dataset.goto; const r = g.getAttribute("href"); if (location.hash === r) route(); else location.hash = r; }
    if (e.target.id === "exportBtn") { const b = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "ai-engineer-course-progress.json"; a.click(); URL.revokeObjectURL(a.href); }
    if (e.target.id === "resetBtn" && confirm("Reset all progress, quiz answers and rubric scores in this browser?")) { const theme = S.theme; S = { done: {}, quiz: {}, rubric: {}, theme }; save(); route(); toast("Progress reset"); }
  });

  // the overall bar on the progress page
  const _upd = updateProgressUI;
  updateProgressUI = function () {
    _upd();
    $$('[data-mod-progress="__all"]').forEach((el) => { const s = stats(); el.querySelector(".bar span").style.width = s.pct + "%"; el.querySelector(".txt").textContent = `${s.done}/${s.total} done · ${s.pct}%`; });
  };

  window.__course = { stats, items, state: () => S }; // handy for debugging/tests
  route();
})();
