/* EVU HQ — ядро: сессия, вызовы Edge Function `hq`, UI-помощники и демо-режим (без Supabase) */
(function () {
"use strict";
var C = window.HQ_CONFIG || {}, SK = "evu_hq_session", configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
var $ = function (s, c) { return (c || document).querySelector(s); }, $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function err(code, message, status) { var e = new Error(message); e.code = code; e.status = status || 0; return e; }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2); }
function load() { try { var s = JSON.parse(localStorage.getItem(SK) || "null"); return s && s.token && s.user && new Date(s.user.expires_at) > new Date() ? s : null; } catch (e) { return null; } }
function save(s) { try { if (s) localStorage.setItem(SK, JSON.stringify(s)); else localStorage.removeItem(SK); } catch (e) {} }
function fmtDate(i) { try { return new Date(i).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return i || ""; } }
function fmtDay(i) { try { return new Date(i).toLocaleDateString("ru-RU"); } catch (e) { return i || ""; } }

/* ---------- UI ---------- */
var tbox;
function toast(m, bad) {
  if (!tbox) { tbox = document.createElement("div"); tbox.className = "toasts"; tbox.setAttribute("role", "status"); tbox.setAttribute("aria-live", "polite"); document.body.appendChild(tbox); }
  var t = document.createElement("div"); t.className = "tst" + (bad ? " er" : ""); t.textContent = m; tbox.appendChild(t);
  setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); }, bad ? 5500 : 3000);
}
function modal(o) {
  return new Promise(function (res) {
    var prev = document.activeElement, ov = document.createElement("div"), done = false;
    ov.className = "ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.innerHTML = '<div class="mod' + (o.wide ? " wide" : "") + '"><div class="mh"><h3>' + esc(o.title) + '</h3><button class="x" type="button" aria-label="Закрыть">✕</button></div><div class="mb">' + (o.html || "") + '</div><div class="acts"></div></div>';
    var acts = $(".acts", ov);
    function close(v) { if (done) return; done = true; document.removeEventListener("keydown", key, true); ov.classList.remove("show"); setTimeout(function () { ov.remove(); if (!$(".ov")) document.body.classList.remove("lock"); if (prev && prev.focus) try { prev.focus(); } catch (e) {} }, reduce ? 0 : 300); res(v); }
    function key(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(null); }
      if (e.key === "Tab") { var f = $$("button,input,select,textarea,a[href]", ov).filter(function (x) { return !x.disabled && x.offsetParent !== null; }); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
    }
    (o.buttons || []).forEach(function (b) {
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn sm " + (b.cls || "ghost"); btn.textContent = b.label;
      btn.addEventListener("click", function () { if (b.onClick) { var r = b.onClick(ov, close); if (r === false) return; if (r !== undefined && r !== true) { close(r); return; } } close(b.value); });
      acts.appendChild(btn);
    });
    if (!acts.children.length) acts.remove();
    $(".x", ov).addEventListener("click", function () { close(null); });
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(null); });
    document.addEventListener("keydown", key, true);
    document.body.appendChild(ov); document.body.classList.add("lock");
    requestAnimationFrame(function () { ov.classList.add("show"); var f = $("input,select,textarea", ov) || $(".acts .btn", ov); if (f) f.focus(); });
    if (o.onOpen) o.onOpen(ov, close);
  });
}
function confirmBox(title, text, ok) { return modal({ title: title, html: "<p>" + esc(text) + "</p>", buttons: [{ label: "Отмена", value: false }, { label: ok || "Подтвердить", cls: "solid", value: true }] }).then(function (v) { return !!v; }); }
/* форма в модальном окне: submit(el) возвращает Promise; пока он идёт, кнопка заблокирована; ошибки показываются тостом */
function formModal(title, html, submit, label, wide) {
  return modal({ title: title, html: html, wide: wide, buttons: [{ label: "Отмена", value: null }, { label: label || "Сохранить", cls: "solid", onClick: function (el, close) {
    var b = $(".acts .btn.solid", el); if (b.disabled) return false; b.disabled = true;
    Promise.resolve().then(function () { return submit(el); }).then(function (r) { close(r === undefined ? true : r); }, function (e) { b.disabled = false; toast(e.message || "Ошибка", true); });
    return false;
  } }] });
}
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  return new Promise(function (ok, no) { var a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(e); } a.remove(); });
}

/* ---------- боевой режим ---------- */
async function call(fn, body) {
  var s = load(), h = { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + C.SUPABASE_ANON_KEY };
  if (s) h["x-evu-session"] = s.token;
  var r;
  try { r = await fetch(C.SUPABASE_URL + "/functions/v1/" + fn, { method: "POST", headers: h, body: JSON.stringify(body || {}) }); }
  catch (e) { throw err("network", "Нет соединения с сервером. Проверьте интернет и повторите попытку.", 0); }
  var j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { if (r.status === 401 && s && j && j.error === "unauthorized") save(null); throw err(j && j.error || "server", j && j.message || "Ошибка сервера (" + r.status + ").", r.status); }
  return j;
}

/* ---------- ДЕМО-режим (данные в localStorage браузера) ---------- */
var DK = "evu_hq_demo_v1", NEED = { dashboard: 1, members_list: 1, member_get: 1, units_list: 1, academy_list: 1, academy_stage: 1, member_add: 2, member_update: 2, member_promote: 2, member_note: 2, academy_add: 2, academy_drop: 2, unit_save: 3, unit_delete: 3, rank_save: 3, rank_delete: 3, keys_list: 3, create_key: 3, revoke_key: 3, log_list: 3 };
var RK = { member: 1, commander: 2, owner: 3 }, PFX = { owner: "OWNER", commander: "CMD", member: "MBR" }, ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", TTL = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5, never: null };
function ddb() {
  var d = null; try { d = JSON.parse(localStorage.getItem(DK) || "null"); } catch (e) {}
  if (d) return d;
  var now = Date.now(), ago = function (n) { return new Date(now - n * 864e5).toISOString(); };
  d = { seq: { rank: 5, unit: 4 }, ranks: [1, 2, 3, 4].map(function (i) { return { id: i, name: "Ранг " + ["I", "II", "III", "IV"][i - 1] + " (демо)", level: i, discord_role_id: null }; }),
    units: [{ id: 1, name: "SGA", commander_id: "800000000000000001" }, { id: 2, name: "SOF «VANGUARD»", commander_id: null }, { id: 3, name: "ETD — ELITE TACTICAL DIVISION", commander_id: null }],
    members: [["800000000000000001", "Demo-Cmd", 3, 1, "active", 0], ["800000000000000002", "Demo-Alpha", 2, 1, "active", 0], ["800000000000000003", "Demo-Bravo", 1, 2, "active", 0], ["800000000000000004", "Demo-Charlie", 1, 3, "leave", 0], ["800000000000000005", "Demo-Echo", 1, 1, "active", 1], ["800000000000000006", "Demo-Delta", 4, 2, "active", 0], ["800000000000000007", "Demo-Foxtrot", 1, 3, "discharged", 0], ["800000000000000008", "Demo-Golf", 2, 2, "active", 0]].map(function (m, i) { return { discord_id: m[0], discord_name: m[1].toLowerCase(), callsign: m[1], rank_id: m[2], unit_id: m[3], status: m[4], is_instructor: !!m[5], joined_at: ago(60 - i * 5), created_at: ago(60 - i * 5) }; }),
    promotions: [], notes: [], recruits: [{ id: uid(), discord_id: "700000000000000001", callsign: "Recruit-One", status: "training", started_at: ago(3), finished_at: null }, { id: uid(), discord_id: "700000000000000002", callsign: "Recruit-Two", status: "training", started_at: ago(1), finished_at: null }], results: [], log: [],
    keys: [["owner", "900000000000000001", "DemoOwner"], ["commander", "800000000000000001", "Demo-Cmd"], ["member", "800000000000000005", "Demo-Echo"]].map(function (k) { return { id: uid(), discord_id: k[1], discord_name: k[2], role: k[0], key: "EVU-" + PFX[k[0]] + "-DEMX-2345", key_hint: "2345", expires_at: null, created_by: "seed", created_at: ago(30), revoked: false, revoked_at: null, last_used_at: null }; }) };
  d.promotions.push({ id: uid(), member_id: "800000000000000002", kind: "promotion", from_rank: 1, to_rank: 2, from_unit: 1, to_unit: 1, reason: "Демо-запись", promoted_by: "seed", promoted_at: ago(10) });
  d.results.push({ id: uid(), recruit_id: d.recruits[0].id, stage: 1, passed: true, instructor_id: "800000000000000005", note: "", at: ago(2) });
  dsave(d); return d;
}
function dsave(d) { localStorage.setItem(DK, JSON.stringify(d)); }
function dhq(act, b, u) {
  b = b || {}; var d = ddb(), need = NEED[act]; if (!need) throw err("unknown", "Неизвестное действие.", 400);
  if (RK[u.role] < need) throw err("forbidden", "Недостаточно прав для этого действия.", 403);
  var rk = function (id) { var r = d.ranks.filter(function (x) { return x.id === id; })[0]; return r ? r.level : -1; };
  var mem = function (id) { var m = d.members.filter(function (x) { return x.discord_id === String(id); })[0]; if (!m) throw err("not_found", "Боец не найден.", 404); return m; };
  var aLvl = function () { if (u.role === "owner") return Infinity; var m = d.members.filter(function (x) { return x.discord_id === u.discord_id && x.status === "active"; })[0]; return m ? rk(m.rank_id) : -1; };
  var log = function (a, t, det) { d.log.unshift({ id: uid(), created_at: new Date().toISOString(), admin_name: u.name, admin_discord_id: u.discord_id, action: a, target: t, details: det || {}, scope: "hq" }); d.log = d.log.slice(0, 500); };
  var V = function (c, m) { return err(c, m, 400); }, sx = function (v, a, z, w) { v = String(v == null ? "" : v).trim(); if (v.length < a || v.length > z) throw V("validation", w + ": от " + a + " до " + z + " символов."); return v; };
  var ID = /^\d{5,25}$/, out;
  function stats(id) { var r = d.results.filter(function (x) { return x.instructor_id === id; }); return { stages: r.length, passed: r.filter(function (x) { return x.passed; }).length, graduates: new Set(r.filter(function (x) { return x.stage === 3 && x.passed; }).map(function (x) { return x.recruit_id; })).size }; }
  switch (act) {
    case "dashboard": { var m = d.members; out = { counts: { total: m.length, active: m.filter(function (x) { return x.status === "active"; }).length, leave: m.filter(function (x) { return x.status === "leave"; }).length, discharged: m.filter(function (x) { return x.status === "discharged"; }).length, units: d.units.length }, recent: d.promotions.slice().sort(function (a, c) { return a.promoted_at < c.promoted_at ? 1 : -1; }).slice(0, 8).map(function (p) { var mm = m.filter(function (x) { return x.discord_id === p.member_id; })[0]; return Object.assign({}, p, { callsign: mm ? mm.callsign : p.member_id }); }) }; break; }
    case "members_list": out = { ranks: d.ranks.slice().sort(function (a, c) { return a.level - c.level; }), units: d.units, members: d.members.slice().sort(function (a, c) { return a.callsign.localeCompare(c.callsign); }) }; break;
    case "units_list": out = { units: d.units, members: d.members, ranks: d.ranks }; break;
    case "member_get": { var g = mem(b.discord_id); out = { member: g, history: d.promotions.filter(function (p) { return p.member_id === g.discord_id; }).sort(function (a, c) { return a.promoted_at < c.promoted_at ? 1 : -1; }), notes: u.role === "member" ? null : d.notes.filter(function (n) { return n.member_id === g.discord_id; }).reverse(), instructor: g.is_instructor ? stats(g.discord_id) : null }; break; }
    case "member_add": {
      var id = String(b.discord_id || "").trim(); if (!ID.test(id)) throw V("validation", "Укажите числовой Discord ID.");
      var cs = sx(b.callsign, 2, 40, "Позывной"), rid = b.rank_id ? Number(b.rank_id) : null, uid2 = b.unit_id ? Number(b.unit_id) : null;
      if (d.members.some(function (x) { return x.discord_id === id; })) throw err("db", "Боец с таким Discord ID уже есть в ростере.", 409);
      if (rid != null && u.role !== "owner" && rk(rid) >= aLvl()) throw err("forbidden", "Нельзя присвоить ранг, равный или выше вашего.", 403);
      var nm = { discord_id: id, discord_name: String(b.discord_name || "").trim().slice(0, 60) || null, callsign: cs, rank_id: rid, unit_id: uid2, status: "active", is_instructor: false, joined_at: new Date().toISOString(), created_at: new Date().toISOString() };
      d.members.push(nm); if (rid != null) d.promotions.push({ id: uid(), member_id: id, kind: "promotion", from_rank: null, to_rank: rid, from_unit: null, to_unit: uid2, reason: "Зачислен в состав", promoted_by: u.name, promoted_at: new Date().toISOString() });
      log("member_add", id, { callsign: cs }); out = { member: nm }; break;
    }
    case "member_update": {
      var t = mem(b.discord_id); if (u.role !== "owner" && rk(t.rank_id) >= aLvl()) throw err("forbidden", "Нельзя менять бойца с рангом, равным или выше вашего.", 403);
      var ch = {}; if (b.callsign !== undefined) t.callsign = ch.callsign = sx(b.callsign, 2, 40, "Позывной"); if (b.is_instructor !== undefined) t.is_instructor = ch.is_instructor = !!b.is_instructor;
      if (b.status !== undefined) { if (["active", "leave"].indexOf(b.status) < 0 || t.status === "discharged") throw V("validation", "Статус можно менять только между «активен» и «отпуск»."); t.status = ch.status = b.status; }
      log("member_update", t.discord_id, ch); out = { member: t }; break;
    }
    case "member_promote": {
      var kinds = ["promotion", "demotion", "transfer", "discharge", "reinstate"], kind = String(b.kind); if (kinds.indexOf(kind) < 0) throw V("validation", "Неизвестный тип действия.");
      var reason = sx(b.reason, 3, 500, "Причина"), tm = mem(b.discord_id), cur = rk(tm.rank_id), me = aLvl(), tr = b.to_rank ? Number(b.to_rank) : null, tu = b.to_unit ? Number(b.to_unit) : null;
      if (u.role !== "owner" && cur >= me) throw err("forbidden", "Нельзя менять бойца с рангом, равным или выше вашего.", 403);
      if (tm.discord_id === u.discord_id && u.role !== "owner") throw err("forbidden", "Нельзя менять собственный ранг.", 403);
      if (tm.status === "discharged" && kind !== "reinstate") throw V("validation", "Боец исключён: доступно только восстановление.");
      if (tm.status !== "discharged" && kind === "reinstate") throw V("validation", "Восстанавливать можно только исключённых.");
      if (kind === "promotion" || kind === "demotion") {
        if (tr == null || rk(tr) < 0) throw V("validation", "Выберите ранг.");
        if (kind === "promotion" && !(rk(tr) > cur)) throw V("validation", "Для повышения выберите ранг выше текущего."); if (kind === "demotion" && !(rk(tr) < cur)) throw V("validation", "Для понижения выберите ранг ниже текущего.");
        if (u.role !== "owner" && rk(tr) >= me) throw err("forbidden", "Нельзя присвоить ранг, равный или выше вашего.", 403);
      }
      if (kind === "transfer" && (tu == null || tu === tm.unit_id || !d.units.some(function (x) { return x.id === tu; }))) throw V("validation", "Выберите другое подразделение.");
      var fr = tm.rank_id, fu = tm.unit_id;
      if (kind === "promotion" || kind === "demotion") tm.rank_id = tr; else if (kind === "transfer") tm.unit_id = tu; else if (kind === "discharge") { tm.status = "discharged"; d.units.forEach(function (x) { if (x.commander_id === tm.discord_id) x.commander_id = null; }); } else { tm.status = "active"; if (tr != null) tm.rank_id = tr; if (tu != null) tm.unit_id = tu; }
      d.promotions.push({ id: uid(), member_id: tm.discord_id, kind: kind, from_rank: fr, to_rank: tm.rank_id, from_unit: fu, to_unit: tm.unit_id, reason: reason, promoted_by: u.name, promoted_at: new Date().toISOString() });
      log(kind, tm.discord_id, { reason: reason }); out = { member: tm, discord: b.sync_discord && (kind === "promotion" || kind === "demotion") ? { ok: false, error: "Демо-режим: роли Discord не меняются." } : null }; break;
    }
    case "member_note": { var nt = { id: uid(), member_id: mem(b.discord_id).discord_id, author: u.name, text: sx(b.text, 1, 2000, "Заметка"), created_at: new Date().toISOString() }; d.notes.push(nt); log("member_note", nt.member_id); out = { note: nt }; break; }
    case "unit_save": {
      var un = sx(b.name, 2, 60, "Название"), cm = b.commander_id ? String(b.commander_id) : null; if (cm && mem(cm).status !== "active") throw V("validation", "Командир должен быть активным бойцом.");
      if (d.units.some(function (x) { return x.name === un && String(x.id) !== String(b.id); })) throw V("db", "Подразделение с таким названием уже есть.");
      var uo = b.id ? d.units.filter(function (x) { return x.id === Number(b.id); })[0] : null; if (uo) { uo.name = un; uo.commander_id = cm; } else { uo = { id: d.seq.unit++, name: un, commander_id: cm }; d.units.push(uo); }
      log("unit_save", String(uo.id), { name: un }); out = { unit: uo }; break;
    }
    case "unit_delete": { var ui = Number(b.id); if (d.members.some(function (x) { return x.unit_id === ui; })) throw V("in_use", "В подразделении есть бойцы: сначала переведите их."); if (d.promotions.some(function (p) { return p.from_unit === ui || p.to_unit === ui; })) throw V("in_use", "Подразделение используется в истории и не может быть удалено."); d.units = d.units.filter(function (x) { return x.id !== ui; }); log("unit_delete", String(ui)); out = { ok: true }; break; }
    case "rank_save": {
      var rn = sx(b.name, 1, 40, "Название"), lv = Number(b.level); if (!Number.isInteger(lv) || lv < 0 || lv > 1000) throw V("validation", "Уровень: целое число от 0 до 1000.");
      var role = b.discord_role_id ? String(b.discord_role_id).trim() : null; if (role && !ID.test(role)) throw V("validation", "ID роли Discord — число.");
      if (d.ranks.some(function (x) { return String(x.id) !== String(b.id) && (x.name === rn || x.level === lv); })) throw V("db", "Ранг с таким названием или уровнем уже есть.");
      var ro = b.id ? d.ranks.filter(function (x) { return x.id === Number(b.id); })[0] : null; if (ro) { ro.name = rn; ro.level = lv; ro.discord_role_id = role; } else { ro = { id: d.seq.rank++, name: rn, level: lv, discord_role_id: role }; d.ranks.push(ro); }
      log("rank_save", String(ro.id), { name: rn, level: lv }); out = { rank: ro }; break;
    }
    case "rank_delete": { var ri = Number(b.id); if (d.members.some(function (x) { return x.rank_id === ri; }) || d.promotions.some(function (p) { return p.from_rank === ri || p.to_rank === ri; })) throw V("in_use", "Ранг используется бойцами или историей повышений и не может быть удалён."); d.ranks = d.ranks.filter(function (x) { return x.id !== ri; }); log("rank_delete", String(ri)); out = { ok: true }; break; }
    case "keys_list": out = { items: d.keys.map(function (k) { var c = Object.assign({}, k); delete c.key; return c; }).sort(function (a, c) { return a.created_at < c.created_at ? 1 : -1; }) }; break;
    case "create_key": {
      var kid = String(b.discord_id || "").trim(); if (!ID.test(kid)) throw V("validation", "Укажите числовой Discord ID.");
      var kn = sx(b.discord_name, 2, 60, "Ник в Discord"), kr = String(b.role); if (!PFX[kr]) throw V("validation", "Роль: owner, commander или member."); if (!(String(b.ttl) in TTL)) throw V("validation", "Некорректный срок.");
      var part = function () { var s = ""; for (var i = 0; i < 4; i++) s += ALPHA[crypto.getRandomValues(new Uint8Array(1))[0] % 32]; return s; }, key = "EVU-" + PFX[kr] + "-" + part() + "-" + part();
      d.keys.push({ id: uid(), discord_id: kid, discord_name: kn, role: kr, key: key, key_hint: key.slice(-4), expires_at: TTL[b.ttl] == null ? null : new Date(Date.now() + TTL[b.ttl]).toISOString(), created_by: u.name, created_at: new Date().toISOString(), revoked: false, revoked_at: null, last_used_at: null });
      log("create_key", kid, { role: kr, ttl: b.ttl }); out = { key: key, expires_at: d.keys[d.keys.length - 1].expires_at }; break;
    }
    case "revoke_key": { var kk = d.keys.filter(function (x) { return x.id === b.id; })[0]; if (!kk) throw err("not_found", "Ключ не найден.", 404); if (u.key_id === b.id) throw V("validation", "Нельзя отозвать ключ, под которым вы вошли."); kk.revoked = true; kk.revoked_at = new Date().toISOString(); log("revoke_key", b.id); out = { ok: true }; break; }
    case "log_list": out = { items: d.log }; break;
    case "academy_list": out = { recruits: d.recruits.slice().sort(function (a, c) { return a.started_at < c.started_at ? 1 : -1; }), results: d.results.map(function (r) { var i = d.members.filter(function (x) { return x.discord_id === r.instructor_id; })[0]; return Object.assign({}, r, { instructor: i ? i.callsign : r.instructor_id }); }), instructors: d.members.filter(function (x) { return x.is_instructor && x.status !== "discharged"; }).map(function (x) { return Object.assign({ discord_id: x.discord_id, callsign: x.callsign }, stats(x.discord_id)); }) }; break;
    case "academy_add": { var ai = String(b.discord_id || "").trim(); if (!ID.test(ai)) throw V("validation", "Укажите числовой Discord ID."); var ac = sx(b.callsign, 2, 40, "Позывной"); if (d.recruits.some(function (x) { return x.discord_id === ai && x.status === "training"; })) throw err("exists", "Этот новобранец уже проходит обучение.", 409); var rc = { id: uid(), discord_id: ai, callsign: ac, status: "training", started_at: new Date().toISOString(), finished_at: null }; d.recruits.push(rc); log("academy_add", ai); out = { recruit: rc }; break; }
    case "academy_stage": {
      var st = Number(b.stage); if ([1, 2, 3].indexOf(st) < 0) throw V("validation", "Этап: 1, 2 или 3.");
      if (u.role === "member") { var im = d.members.filter(function (x) { return x.discord_id === u.discord_id; })[0]; if (!im || !im.is_instructor || im.status !== "active") throw err("forbidden", "Этапы академии проводят инструкторы и командование.", 403); }
      var rr = d.recruits.filter(function (x) { return x.id === b.recruit_id; })[0]; if (!rr) throw err("not_found", "Новобранец не найден.", 404); if (rr.status !== "training") throw V("validation", "Новобранец уже не проходит обучение."); if (rr.discord_id === u.discord_id) throw err("forbidden", "Нельзя принимать этап у самого себя.", 403);
      var ps = d.results.filter(function (x) { return x.recruit_id === rr.id && x.passed; }).map(function (x) { return x.stage; }); if (ps.indexOf(st) >= 0) throw V("validation", "Этот этап уже сдан."); if (st > 1 && ps.indexOf(st - 1) < 0) throw V("validation", "Сначала нужно сдать предыдущий этап.");
      d.results.push({ id: uid(), recruit_id: rr.id, stage: st, passed: !!b.passed, instructor_id: u.discord_id, note: String(b.note || "").slice(0, 500), at: new Date().toISOString() });
      if (st === 3 && b.passed) { rr.status = "graduated"; rr.finished_at = new Date().toISOString(); } log("academy_stage", rr.discord_id, { stage: st, passed: !!b.passed }); out = { ok: true, graduated: st === 3 && !!b.passed }; break;
    }
    case "academy_drop": { var dr = d.recruits.filter(function (x) { return x.id === b.recruit_id; })[0]; if (!dr || dr.status !== "training") throw V("validation", "Новобранец не найден или уже не обучается."); dr.status = "dropped"; dr.finished_at = new Date().toISOString(); log("academy_drop", dr.discord_id); out = { ok: true }; break; }
  }
  dsave(d); return out;
}
function dUser() { var s = load(); return s && s.user; }
async function login(key) {
  if (!configured) {
    var d = ddb(), k = d.keys.filter(function (x) { return x.key === key; })[0];
    if (!k || k.revoked || (k.expires_at && new Date(k.expires_at) <= new Date())) throw err("bad_key", "Неверный, отозванный или просроченный ключ.", 401);
    k.last_used_at = new Date().toISOString(); dsave(d);
    var u = { discord_id: k.discord_id, name: k.discord_name, role: k.role, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), key_id: k.id }; save({ token: "demo", user: u }); return u;
  }
  var j = await call("staff_login", { action: "login", key: key }); save({ token: j.token, user: j.user }); return j.user;
}
async function logout() { try { if (configured && load()) await call("staff_login", { action: "logout" }); } catch (e) {} save(null); }
async function check() {
  if (!load()) return null;
  if (!configured) { var u = dUser(), k = ddb().keys.filter(function (x) { return x.id === u.key_id; })[0]; if (!k || k.revoked) { save(null); return null; } return u; }
  try { var j = await call("staff_login", { action: "me" }); var s = load(); if (s) { s.user = j.user; save(s); } return j.user; } catch (e) { if (e.code === "unauthorized") return null; throw e; }
}
function api(action, p) {
  if (configured) return call("hq", Object.assign({ action: action }, p || {}));
  return Promise.resolve().then(function () { var u = dUser(); if (!u) throw err("unauthorized", "Требуется вход по ключу.", 401); return dhq(action, p, u); });
}
window.HQ = { configured: configured, call: call, login: login, logout: logout, check: check, api: api, session: load, ROLES: { owner: "ВЛАДЕЛЕЦ", commander: "КОМАНДИР", member: "БОЕЦ" }, RK: RK,
  ui: { $: $, $$: $$, esc: esc, toast: toast, modal: modal, formModal: formModal, confirmBox: confirmBox, copyText: copyText, fmtDate: fmtDate, fmtDay: fmtDay } };
})();
