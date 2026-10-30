/* Checklist de Pré-Instalação ECTAS - app de campo
   Funciona sem internet: tudo fica salvo no celular e é enviado à central
   (Google Apps Script, ver central-Code.gs.txt) assim que houver conexão. */
"use strict";
const CENTRAL = window.CENTRAL || { url: "" };
const STATUS = ["Pendente", "Em andamento", "Concluído", "Não aplicável"];
const ROTULO = { "Pendente": "Pendente", "Em andamento": "Em andamento", "Concluído": "Concluído", "Não aplicável": "Não se aplica" };
const PARTES = ["Cliente", "ECTAS", "Terceiro"];
const SITUACOES = ["Em pré-instalação", "Mobilizada", "Instalação concluída", "Suspensa", "Cancelada"];
const ITENS_PADRAO = [["CIV-01", "Civil", "Bases para os tanques (cotas de nível conforme Guia Civil)", "Mobilização", "Guia Civil"], ["CIV-02", "Civil", "Base para os filtros pressurizados conforme Guia Civil", "Mobilização", "Guia Civil"], ["CIV-03", "Civil", "Base dos sopradores", "Mobilização", "Guia Civil"], ["CIV-04", "Civil", "Base das bombas", "Mobilização", "Guia Civil"], ["CIV-05", "Civil", "Base do painel elétrico", "Mobilização", "Guia Civil"], ["CIV-06", "Civil", "Base para a válvula automática dentro da casa de operação", "Mobilização", "Guia Civil"], ["CIV-07", "Civil", "Construção da casa de operação", "Mobilização", "Guia Civil"], ["CIV-08", "Civil", "Suportes de tubulações", "Montagem", "Guia Civil"], ["CIV-09", "Civil", "Concretagem da calha Parshall", "Montagem", "Guia Civil"], ["CIV-10", "Civil", "Bases de escadas", "Montagem", "Guia Civil"], ["CIV-11", "Civil", "Escada do distribuidor de vazão", "Montagem", "Guia Civil"], ["CIV-12", "Civil", "Bacia de contenção dos químicos", "Start-up", "Guia Civil"], ["CIV-13", "Civil", "Demais itens descritos no Guia Civil (detalhar nas observações)", "Montagem", "Guia Civil"], ["ELE-01", "Elétrica", "Disponibilidade de energia elétrica para a equipe de instalação", "Mobilização", ""], ["ELE-02", "Elétrica", "Caixas de passagem elétrica e dutos corrugados enterrados executados", "Montagem", "Projeto elétrico"], ["ELE-03", "Elétrica", "Alimentação elétrica para o painel de comando conforme projeto", "Testes", "Projeto elétrico"], ["MAT-01", "Materiais", "Materiais das listas disponíveis no local", "Mobilização", "Listas de materiais"], ["MAT-02", "Materiais", "Compra do meio filtrante para os filtros", "Montagem", "Lista de materiais"], ["MAT-03", "Materiais", "Itens dos filtros: crepinas superior e inferior e demais conexões", "Montagem", "Lista de materiais"], ["MON-01", "Montagem", "Posicionamento dos tanques", "Mobilização", ""], ["TES-01", "Testes", "Disponibilidade de água para testes (preferencialmente com caminhão-pipa)", "Testes", ""], ["STA-01", "Start-up", "Insumos para start-up", "Start-up", ""], ["SEG-01", "Segurança", "Integração de segurança e documentação de acesso da equipe liberadas", "Mobilização", "Exigências do cliente / NRs"], ["CIV-14", "Civil", "Acesso ao local liberado para caminhão e guindaste", "Mobilização", ""], ["CIV-15", "Civil", "Área para armazenamento de materiais e apoio da equipe", "Mobilização", ""], ["CIV-16", "Civil", "Tubulação de chegada do efluente bruto até o ponto de interligação", "Start-up", "Projeto hidráulico"], ["CIV-17", "Civil", "Ponto de lançamento do efluente tratado executado", "Start-up", "Projeto hidráulico"], ["PLA-01", "Planejamento", "Analise de projetos executivos e 3D", "Mobilização", "Projeto hidráulico"], ["PLA-02", "Planejamento", "Definição de equipe para obra", "Mobilização", ""], ["PLA-03", "Planejamento", "Confirmação do envio dos documentos com RH", "Mobilização", ""], ["PLA-04", "Planejamento", "Solicitação de carro ECTAS ou locação", "Mobilização", ""], ["PLA-05", "Planejamento", "Solicitação de hotel", "Mobilização", ""], ["PLA-06", "Planejamento", "Solicitação de passagem aérea (se aplicável)", "Mobilização", ""], ["PLA-07", "Planejamento", "Solicitação da diária", "Mobilização", ""], ["PLA-08", "Planejamento", "Reunião com a equipe de instalação", "Mobilização", ""], ["PLA-09", "Planejamento", "Reunião de alinhamento com cliente", "Mobilização", ""], ["PLA-10", "Planejamento", "Projetos impressos e placas de identificação", "Mobilização", ""], ["PLA-11", "Planejamento", "Criação do grupo no WhatsApp com as informações da obra", "Mobilização", ""], ["PLA-12", "Planejamento", "Conferencia das ferramentas e equipamentos", "Mobilização", ""]].map(r => ({ codigo: r[0], categoria: r[1], item: r[2], etapa: r[3], referencia: r[4], ativo: true }));

/* ---------- estado salvo no celular ---------- */
const ler = (k, pad) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? pad : v; } catch (e) { return pad; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Memória do celular cheia. Sincronize e libere espaço."); } };
let E = ler("ck-estado", { obras: {}, itens: null, ultimaSync: null, planilha: "" });   // última cópia da central
let P = ler("ck-pend", { obras: {}, itens: {} });                                        // alterações ainda não enviadas
let C = ler("ck-config", { codigo: "", autor: "" });
let LK = ler("ck-obras-link", {});                                                      // obras recebidas por link do supervisor
const salvarLK = () => gravar("ck-obras-link", LK);
const salvarE = () => gravar("ck-estado", E), salvarP = () => gravar("ck-pend", P), salvarC = () => gravar("ck-config", C);
const UI = { rota: { v: "lista" }, filtro: "ativas", busca: "", filtroItens: "todos", abertos: new Set(), sinc: false, sincMsg: "", sincErro: false, instalar: null };

/* ---------- fotos (IndexedDB) ---------- */
let dbp = null;
function idb() {
  if (!dbp) dbp = new Promise((ok, no) => { const q = indexedDB.open("checklist-ectas", 1); q.onupgradeneeded = () => q.result.createObjectStore("fotos"); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
  return dbp;
}
async function fGet(k) { const d = await idb(); return new Promise(ok => { const r = d.transaction("fotos").objectStore("fotos").get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); }); }
async function fPut(k, v) { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction("fotos", "readwrite"); t.objectStore("fotos").put(v, k); t.oncomplete = ok; t.onerror = () => no(t.error); }); }
async function fDel(k) { const d = await idb(); return new Promise(ok => { const t = d.transaction("fotos", "readwrite"); t.objectStore("fotos").delete(k); t.oncomplete = ok; t.onerror = ok; }); }
async function fPendentes() { const d = await idb(); return new Promise(ok => { const out = []; const c = d.transaction("fotos").objectStore("fotos").openCursor();
  c.onsuccess = () => { const cur = c.result; if (!cur) return ok(out); if (String(cur.key).startsWith("l:") && cur.value && cur.value.pendente) out.push({ key: cur.key, ...cur.value }); cur.continue(); }; c.onerror = () => ok(out); }); }

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) { if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "text") e.textContent = v; else e.setAttribute(k, v === true ? "" : v); }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return e; };
const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmt = d => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "";
const dias = (a, b) => Math.round((new Date(a + "T12:00") - new Date(b + "T12:00")) / 864e5);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function toast(m) { const t = h("div", { class: "toast", role: "status", text: m }); document.body.append(t); setTimeout(() => t.remove(), 2800); }

/* ---------- regras (as mesmas da planilha) ---------- */
const itensAtivos = () => (E.itens && E.itens.length ? E.itens : ITENS_PADRAO).filter(i => i.ativo !== false);
const reg = (o, c) => (o.checklist || {})[c] || {};
const stOf = (o, c) => reg(o, c).status || "Pendente";
function prazo(r) { const s = r.status || "Pendente";
  if (s === "Não aplicável") return null;
  if (s === "Concluído") { if (!r.prev || !r.concl) return null; return r.concl <= r.prev ? { t: "No prazo", c: "p-ok" } : { t: "Concluído com atraso", c: "p-warn" }; }
  if (!r.prev) return { t: "Sem data prevista", c: "p-na" };
  return r.prev < hoje() ? { t: "Atrasado " + dias(hoje(), r.prev) + "d", c: "p-bad" } : { t: "Prazo " + fmt(r.prev), c: "p-na" }; }
function resumo(o) { let apl = 0, conc = 0, pendMob = 0, atras = 0;
  for (const it of itensAtivos()) { const r = reg(o, it.codigo), s = r.status || "Pendente";
    if (s !== "Não aplicável") apl++; if (s === "Concluído") conc++;
    if (it.etapa === "Mobilização" && s !== "Concluído" && s !== "Não aplicável") pendMob++;
    if (s !== "Concluído" && s !== "Não aplicável" && r.prev && r.prev < hoje()) atras++; }
  const lib = o.dataRealMob ? { t: "MOBILIZADA", c: "p-mob" } : pendMob === 0 ? { t: "LIBERADA", c: "p-ok" } : { t: "NÃO LIBERADA", c: "p-bad" };
  return { apl, conc, pendMob, atras, pct: apl ? conc / apl : 0, lib }; }

/* obra como o celular a vê: cópia da central + alterações locais ainda não enviadas */
function obraView(id) {
  const base = E.obras[id] || LK[id], loc = P.obras[id];
  if (!base && !loc) return null;
  const o = { ...(base || {}), ...(loc || {}), id, checklist: { ...((base || {}).checklist || {}) } };
  for (const p of Object.values(P.itens)) if (p.obra === id) o.checklist[p.cod] = { ...(o.checklist[p.cod] || {}), ...p.dados };
  return o; }
const idsObras = () => [...new Set([...Object.keys(E.obras), ...Object.keys(LK), ...Object.keys(P.obras)])];
const nPend = () => Object.keys(P.obras).length + Object.keys(P.itens).length;

/* ---------- alterações ---------- */
function alterarItem(obra, cod, patch) {
  const atual = reg(obraView(obra), cod);
  const dados = { ...atual, ...patch, em: new Date().toISOString(), por: C.autor || "" };
  P.itens[obra + "|" + cod] = { obra, cod, dados }; salvarP(); render(); agendarSync(); }
function alterarObra(id, dados) {
  P.obras[id] = { ...(P.obras[id] || {}), ...dados, id, em: new Date().toISOString(), por: C.autor || "" }; salvarP(); agendarSync(); }

/* ---------- central ---------- */
async function api(corpo) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(CENTRAL.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...corpo, codigo: C.codigo, autor: C.autor }), signal: ctl.signal });
    const j = await r.json();
    if (!j.ok && j.erro === "codigo") { const e = new Error("codigo"); e.codigo = true; throw e; }
    if (!j.ok) throw new Error(j.erro || "erro da central");
    return j;
  } finally { clearTimeout(t); } }
let timerSync = null, deNovo = false;
function agendarSync() { clearTimeout(timerSync); timerSync = setTimeout(sincronizar, 1500); }
function setSync(msg, erro) { UI.sincMsg = msg; UI.sincErro = !!erro; pintarSync(); }
function pintarSync() {
  const el = $("#sync"); if (!el) return; el.className = "sync wrap" + (UI.sincErro ? " erro" : "");
  const n = nPend();
  el.replaceChildren(...[h("span", { text: UI.sincMsg + (CENTRAL.url && n && !UI.sinc ? ` · ${n} alteração(ões) no celular` : "") }),
    CENTRAL.url && !UI.sinc ? h("button", { onclick: () => sincronizar() }, "Sincronizar") : null].filter(Boolean)); }
async function sincronizar() {
  if (!CENTRAL.url) { setSync("Salvo neste celular. Envie o PDF ou o Excel ao supervisor."); return; }
  if (!C.codigo) return;
  if (UI.sinc) { deNovo = true; return; }
  if (!navigator.onLine) { setSync("Sem internet. As alterações ficam no celular.", true); return; }
  UI.sinc = true; setSync("Sincronizando…");
  try {
    // 1. fotos novas
    for (const f of await fPendentes()) {
      const r = await api({ acao: "foto", obra: f.obra, item: f.cod, b64: f.dataUrl.split(",")[1] });
      await fPut("d:" + r.id, { dataUrl: f.dataUrl }); await fDel(f.key);
      trocarFoto(f.obra, f.cod, f.key, "d:" + r.id);
    }
    // 2. obras
    const po = { ...P.obras };
    if (Object.keys(po).length) { await api({ acao: "salvarObras", obras: Object.values(po) });
      for (const [k, v] of Object.entries(po)) if (P.obras[k] === v) delete P.obras[k]; salvarP(); }
    // 3. itens (fotos ainda não enviadas ficam para a próxima rodada)
    const pi = Object.entries(P.itens).filter(([, v]) => !(v.dados.fotos || []).some(f => f.startsWith("l:")));
    if (pi.length) { await api({ acao: "salvarItens", mudancas: pi.map(([, v]) => v) });
      for (const [k, v] of pi) if (P.itens[k] === v) delete P.itens[k]; salvarP(); }
    // 4. traz tudo da central
    const r = await api({ acao: "carregar" });
    const obras = {}; for (const o of r.obras || []) obras[o.id] = o;
    E = { obras, itens: (r.itens && r.itens.length) ? r.itens : E.itens, ultimaSync: new Date().toISOString(), planilha: r.planilha || "" }; salvarE();
    setSync("Sincronizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  } catch (e) {
    if (e.codigo) { C.codigo = ""; salvarC(); setSync("Código da equipe incorreto.", true); }
    else setSync("Sem conexão com a central. As alterações ficam no celular.", true);
  } finally { UI.sinc = false; pintarSync(); render(); if (deNovo) { deNovo = false; agendarSync(); } } }
function trocarFoto(obra, cod, de, para) {
  const k = obra + "|" + cod;
  if (P.itens[k]) P.itens[k].dados.fotos = (P.itens[k].dados.fotos || []).map(f => f === de ? para : f);
  else { const r = reg(obraView(obra) || {}, cod); if ((r.fotos || []).includes(de)) P.itens[k] = { obra, cod, dados: { ...r, fotos: r.fotos.map(f => f === de ? para : f) } }; }
  salvarP(); }
addEventListener("online", () => sincronizar());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
setInterval(() => { if (nPend()) sincronizar(); }, 60000);

/* ---------- navegação ---------- */
function lerHash() { const x = decodeURIComponent(location.hash.slice(1));
  if (x.startsWith("obra-")) return { v: "obra", id: x.slice(5) };
  if (x.startsWith("o=")) { const id = receberObraDoLink(x.slice(2)); history.replaceState(null, "", id ? "#obra-" + id : location.pathname); return id ? { v: "obra", id } : { v: "lista" }; }
  if (x === "config") return { v: "config" };
  return { v: "lista" }; }
function ir(hash) { if ((location.hash || "#") === "#" + hash) { UI.rota = lerHash(); render(); } else location.hash = hash; scrollTo(0, 0); }
addEventListener("hashchange", () => { UI.rota = lerHash(); render(); scrollTo(0, 0); });

function topo(titulo, sub, voltar, acoes = []) {
  $("#h-titulo").textContent = titulo; $("#h-sub").textContent = sub || "";
  const b = $("#b-voltar"); b.hidden = voltar == null; b.onclick = () => ir(voltar || "");
  $("#logo-box").hidden = voltar != null;
  document.querySelectorAll(".top .acao").forEach(x => x.remove());
  for (const a of acoes) { a.classList.add("acao"); $(".top").append(a); } }

/* ---------- telas ---------- */
let sujo = false;
function render() {
  const ae = document.activeElement;
  if (ae && ae.id !== "busca" && $("#main").contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== "file") { sujo = true; return; }
  sujo = false; $("#fab").replaceChildren(); pintarSync();
  if (CENTRAL.url && !C.codigo) return telaEntrada();
  const r = UI.rota;
  if (r.v === "obra") return telaObra(r.id);
  if (r.v === "config") return telaConfig();
  return telaLista(); }
document.addEventListener("focusout", () => setTimeout(() => { if (sujo) render(); }, 0));

function telaEntrada() {
  topo("Checklist de Pré-Instalação", "Primeiro acesso");
  const msg = h("p", { class: "meta", id: "ent-msg" });
  const f = h("form", { class: "card ent", onsubmit: async e => { e.preventDefault();
      const cod = $("#e-cod").value.trim(), nome = $("#e-nome").value.trim(); if (!cod || !nome) return;
      msg.textContent = "Conferindo o código…";
      try { const r = await fetch(CENTRAL.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ acao: "ping", codigo: cod }) }).then(x => x.json());
        if (!r.codigoOk) { msg.textContent = "Código incorreto. Confira com o responsável pelo checklist."; return; }
      } catch (err) { msg.textContent = "Sem internet agora. O código será conferido na próxima conexão."; }
      C = { codigo: cod, autor: nome }; salvarC(); ir(""); sincronizar(); } },
    h("h2", { text: "Bem-vindo ao checklist" }),
    h("p", { class: "meta", text: "Digite o código da equipe que você recebeu e o seu nome. Isso é pedido só uma vez neste celular." }),
    h("label", { class: "f" }, "Código da equipe", h("input", { id: "e-cod", required: true, autocomplete: "off", autocapitalize: "off", value: C.codigo || "" })),
    h("label", { class: "f" }, "Seu nome", h("input", { id: "e-nome", required: true, autocomplete: "name", value: C.autor || "" })),
    h("button", { class: "btn", type: "submit" }, "Entrar"), msg);
  $("#main").replaceChildren(f); }

function avisoInstalar() {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return null;
  try { if (+localStorage.getItem("ck-instalar-nao") > Date.now()) return null; } catch (e) { }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!UI.instalar && !ios) return null;
  return h("div", { class: "card instalar" }, h("img", { src: "icon-192.png", alt: "" }),
    h("div", { class: "grow" }, h("b", { text: "Instale no celular" }), h("div", { class: "meta", text: ios ? "No Safari: Compartilhar > Adicionar à Tela de Início." : "Fica com ícone na tela inicial e funciona sem internet." })),
    UI.instalar ? h("button", { class: "btn", style: "padding:10px 12px", onclick: async () => { UI.instalar.prompt(); await UI.instalar.userChoice; UI.instalar = null; render(); } }, "Instalar") : null,
    h("button", { class: "more", onclick: () => { try { localStorage.setItem("ck-instalar-nao", Date.now() + 7 * 864e5); } catch (e) { } render(); } }, "Agora não")); }
addEventListener("beforeinstallprompt", e => { e.preventDefault(); UI.instalar = e; render(); });

/* ---------- obras recebidas por link do supervisor ---------- */
function decodificarObra(b64) {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/"); const pad = s + "===".slice((s.length + 3) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(pad)))); }
function receberObraDoLink(cod) {
  try { const o = decodificarObra(cod); const id = String(o.id || "").toUpperCase(); if (!/^[A-Z0-9-]+$/.test(id)) throw new Error("id");
    LK[id] = { ...(LK[id] || {}), ...o, id }; salvarLK(); toast("Obra " + id + " recebida"); return id;
  } catch (e) { toast("Link de obra inválido. Peça um novo link ao supervisor."); return null; } }

function telaLista() {
  topo("Checklist de Pré-Instalação", (C.autor ? C.autor + " · " : "") + "Minhas obras", null, [h("button", { onclick: () => ir("config") }, "Mais")]);
  const kids = [avisoInstalar(),
    idsObras().length > 3 ? h("input", { class: "busca", id: "busca", type: "search", placeholder: "Buscar obra, cliente ou cidade", value: UI.busca, oninput: e => { UI.busca = e.target.value; desenharLista(); } }) : null,
    h("div", { id: "lista", style: "display:flex;flex-direction:column;gap:10px" })];
  $("#main").replaceChildren(...kids.filter(Boolean)); desenharLista(); }
function desenharLista() {
  const box = $("#lista"); if (!box) return;
  const q = UI.busca.trim().toLowerCase();
  const todas = idsObras().map(obraView).filter(o => o && !["Instalação concluída", "Cancelada"].includes(o.situacao));
  if (!todas.length) { box.replaceChildren(h("div", { class: "vazio" }, h("h2", { text: "Nenhuma obra para conferir" }),
    h("p", { text: CENTRAL.url ? (E.ultimaSync ? "As obras são cadastradas pelo supervisor e aparecem aqui sozinhas." : "Conecte-se à internet para receber as obras cadastradas pelo supervisor.")
      : "As obras são cadastradas pelo supervisor. Toque no link da obra que ele enviar pelo WhatsApp e ela aparece aqui." }))); return; }
  const lista = todas.filter(o => !q || [o.id, o.nome, o.cliente, o.cidade].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.previsaoMob || "9999").localeCompare(b.previsaoMob || "9999"));
  box.replaceChildren(...lista.map(o => { const r = resumoCampo(o);
    return h("button", { class: "card obra", onclick: () => ir("obra-" + o.id) },
      h("div", { class: "row" }, h("span", { class: "code", text: o.id }), h("span", { class: "grow" }),
        h("span", { class: "pill " + (r.nao ? "p-bad" : "p-ok"), text: r.nao ? r.nao + " não conferido(s)" : "Tudo conferido" })),
      h("h3", { text: o.nome || "(sem nome)" }), h("div", { class: "meta", text: [o.cliente, o.cidade].filter(Boolean).join(" · ") }),
      h("div", { class: "prog" }, h("i", { style: `width:${Math.round(r.pct * 100)}%` })),
      h("div", { class: "row meta" }, h("span", { text: `${r.conf} de ${r.total} conferidos` }), h("span", { class: "grow" }),
        o.previsaoMob ? h("span", { text: "Mobilização " + fmt(o.previsaoMob) }) : null)); })); }

/* Conferido = Concluído · Não conferido = Pendente (mesmos status da planilha) */
function resumoCampo(o) { let conf = 0, total = 0, mob = 0;
  for (const it of itensAtivos()) { const s = stOf(o, it.codigo); if (s === "Não aplicável") continue; total++;
    if (s === "Concluído") conf++; else if (it.etapa === "Mobilização") mob++; }
  return { conf, total, nao: total - conf, mob, pct: total ? conf / total : 0 }; }

function telaObra(id) {
  const o = obraView(id);
  if (!o) { topo("Obra", "", ""); $("#main").replaceChildren(h("div", { class: "vazio" }, h("h2", { text: "Obra não encontrada" }), h("p", { text: "Peça ao supervisor o link desta obra." }))); return; }
  const r = resumoCampo(o);
  topo(o.nome || o.id, o.id, "");
  const its = itensAtivos(), cats = [...new Set(its.map(i => i.categoria))];
  const head = h("section", { class: "card", style: "display:flex;flex-direction:column;gap:10px" },
    h("div", { class: "meta", text: [o.cliente, o.cidade, o.modelo].filter(Boolean).join(" · ") }),
    o.previsaoMob || o.respEctas ? h("div", { class: "meta", text: [o.previsaoMob ? "Mobilização prevista " + fmt(o.previsaoMob) : "", o.respEctas ? "Responsável ECTAS: " + o.respEctas : ""].filter(Boolean).join(" · ") }) : null,
    h("div", { class: "prog" }, h("i", { style: `width:${Math.round(r.pct * 100)}%` })),
    h("div", { class: "stats", style: "grid-template-columns:repeat(3,1fr)" },
      h("div", { class: "stat" }, h("b", { text: r.conf, style: "color:var(--ok)" }), h("span", { text: "Conferidos" })),
      h("div", { class: "stat" }, h("b", { text: r.nao, style: r.nao ? "color:var(--bad)" : "" }), h("span", { text: "Não conferidos" })),
      h("div", { class: "stat" }, h("b", { text: r.mob, style: r.mob ? "color:var(--bad)" : "" }), h("span", { text: "Faltam p/ mobilizar" }))),
    h("button", { class: "btn wa", onclick: () => enviarPdf(o) }, "Enviar checklist em PDF"));
  const filtros = [["todos", "Todos"], ["abertos", "Não conferidos"], ...cats.map(c => ["cat:" + c, c])];
  if (!filtros.some(f => f[0] === UI.filtroItens)) UI.filtroItens = "todos";
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Filtrar itens" }, filtros.map(([k, t]) =>
    h("button", { class: "chip", "aria-pressed": String(UI.filtroItens === k), onclick: () => { UI.filtroItens = k; render(); } }, t)));
  const lista = [];
  for (const c of cats) {
    let ci = its.filter(i => i.categoria === c && stOf(o, i.codigo) !== "Não aplicável");
    const tot = ci.length, ok = ci.filter(i => stOf(o, i.codigo) === "Concluído").length;
    ci = ci.filter(i => { if (UI.filtroItens === "abertos") return stOf(o, i.codigo) !== "Concluído";
      if (UI.filtroItens.startsWith("cat:")) return i.categoria === UI.filtroItens.slice(4); return true; });
    if (!ci.length) continue;
    const grupo = h("div", { class: "card lista-conf" }, h("div", { class: "cat", style: "margin:0 0 4px" }, c, h("span", { text: `${ok}/${tot}` })));
    for (const it of ci) grupo.append(linhaItem(o, it));
    lista.push(grupo);
  }
  if (!lista.length) lista.push(h("p", { class: "vazio", text: UI.filtroItens === "abertos" ? "Todos os itens foram conferidos." : "Nenhum item neste filtro." }));
  $("#main").replaceChildren(head, chips, ...lista); }

function linhaItem(o, it) {
  const key = o.id + "|" + it.codigo, r = reg(o, it.codigo), conf = (r.status || "Pendente") === "Concluído", aberto = UI.abertos.has(key);
  const marcar = v => { if (v === conf && (r.status || "") !== "") return;
    alterarItem(o.id, it.codigo, v ? { status: "Concluído", concl: r.concl || hoje() } : { status: "Pendente", concl: "" }); };
  const extras = [(r.fotos || []).length ? "📷 " + r.fotos.length : "", r.obs ? "✎ " + (r.obs.length > 40 ? r.obs.slice(0, 40) + "…" : r.obs) : ""].filter(Boolean).join("  ");
  const linha = h("div", { class: "conf-linha", "data-c": conf ? "1" : (r.status ? "0" : "") },
    h("div", { class: "conf-txt" }, h("span", { class: "conf-item", text: it.item }),
      h("button", { class: "more conf-mais", "aria-expanded": String(aberto), onclick: () => { aberto ? UI.abertos.delete(key) : UI.abertos.add(key); render(); } },
        extras || (aberto ? "Fechar" : "+ observação / foto"))),
    h("div", { class: "conf-bts", role: "group", "aria-label": it.item },
      h("button", { class: "conf-sim", "aria-pressed": String(conf), onclick: () => marcar(true) }, "✓ Conferido"),
      h("button", { class: "conf-nao", "aria-pressed": String(!conf && !!r.status), onclick: () => marcar(false) }, "✗ Não conferido")));
  if (aberto) linha.append(obsFoto(o, it, r));
  return linha; }

function obsFoto(o, it, r) {
  const base = (o.id + "-" + it.codigo).replace(/[^A-Za-z0-9-]/g, "");
  const salvar = patch => alterarItem(o.id, it.codigo, patch);
  const fotos = h("div", { class: "fotos" });
  for (const ref of (r.fotos || [])) {
    const ph = h("div", { class: "ph", text: "carregando…" }); mostrarFoto(ref, ph);
    const x = h("button", { class: "x", type: "button", "aria-label": "Remover foto" }, "✕");
    x.onclick = ev => { ev.stopPropagation(); if (!x.classList.contains("arm")) { x.classList.add("arm"); x.textContent = "Remover?"; setTimeout(() => { x.classList.remove("arm"); x.textContent = "✕"; }, 3000); return; }
      salvar({ fotos: (r.fotos || []).filter(f => f !== ref) }); if (ref.startsWith("l:")) fDel(ref); };
    ph.append(x); if (ref.startsWith("l:")) ph.append(h("span", { class: "pend", text: "a enviar" })); fotos.append(ph); }
  const fi = h("input", { type: "file", accept: "image/*", id: "f-" + base, hidden: true, onchange: async e => {
    const arqs = [...e.target.files]; e.target.value = ""; const novas = [];
    for (const f of arqs) { try { const dataUrl = await reduzir(f); const k = "l:" + uid(); await fPut(k, { dataUrl, obra: o.id, cod: it.codigo, pendente: true }); novas.push(k); } catch (err) { toast("Não foi possível ler a foto."); } }
    if (novas.length) { const atual = reg(obraView(o.id), it.codigo); salvar({ fotos: [...(atual.fotos || []), ...novas] }); toast("Foto adicionada"); } } });
  fi.multiple = true;
  fotos.append(h("label", { class: "addph", for: "f-" + base }, h("b", { text: "+" }), "Foto"), fi);
  return h("div", { class: "conf-extra" },
    h("label", { class: "f" }, "Observação", h("textarea", { id: "ob-" + base, placeholder: "O que falta, quem resolve, previsão…", onchange: e => salvar({ obs: e.target.value }) }, r.obs || "")),
    fotos); }

async function reduzir(file) {
  const bmp = await createImageBitmap(file); const max = 1600, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.8); }
async function dadosFoto(ref) {
  const loc = await fGet(ref); if (loc && loc.dataUrl) return loc.dataUrl;
  if (ref.startsWith("d:") && CENTRAL.url && navigator.onLine) { try { const r = await api({ acao: "verFoto", id: ref.slice(2) }); const d = "data:image/jpeg;base64," + r.b64; await fPut(ref, { dataUrl: d }); return d; } catch (e) { } }
  return null; }
async function mostrarFoto(ref, ph) {
  const d = await dadosFoto(ref);
  const alvo = ph.firstChild && ph.firstChild.nodeType === 3 ? ph.firstChild : null;
  if (!d) { if (alvo) alvo.textContent = "Foto na central (sem internet)"; return; }
  const img = h("img", { src: d, alt: "Foto de evidência" }); if (alvo) alvo.replaceWith(img); else ph.prepend(img);
  ph.onclick = () => { const lb = h("div", { class: "lightbox", onclick: () => lb.remove() }, h("img", { src: d, alt: "Foto" })); document.body.append(lb); }; }

function telaConfig() {
  topo("Mais opções", C.autor || "", "");
  const kids = [
    h("button", { class: "btn wa", onclick: () => exportarExcel() }, "Exportar todas as obras (Excel)"),
    h("p", { class: "meta", text: "O Excel sai com as abas OBRAS e REGISTRO no formato da planilha de controle: é só colar." })];
  if (CENTRAL.url) {
    kids.push(h("div", { class: "card" }, h("b", { text: "Central" }),
      h("p", { class: "meta", text: E.ultimaSync ? "Última sincronização: " + new Date(E.ultimaSync).toLocaleString("pt-BR") : "Ainda não sincronizou." }),
      h("p", { class: "meta", text: nPend() ? nPend() + " alteração(ões) aguardando envio." : "Nada pendente neste celular." }),
      h("button", { class: "btn sec", onclick: () => sincronizar() }, "Sincronizar agora")));
    kids.push(h("div", { class: "card" }, h("b", { text: "Seu nome" }),
      h("input", { class: "busca", id: "cfg-nome", value: C.autor, onchange: e => { C.autor = e.target.value.trim(); salvarC(); toast("Nome salvo"); } })));
    kids.push(h("button", { class: "btn sec", onclick: () => { if (nPend()) { toast("Sincronize antes de sair: há alterações não enviadas."); return; } C = { codigo: "", autor: C.autor }; salvarC(); ir(""); } }, "Trocar código da equipe"));
  } else kids.push(h("div", { class: "notice", text: "Este app está no modo só neste celular. Os dados ficam salvos aqui; envie o PDF ou o Excel para o escritório." }));
  kids.push(h("p", { class: "meta", style: "text-align:center", text: "Checklist de Pré-Instalação ECTAS · " + itensAtivos().length + " itens padrão" }));
  $("#main").replaceChildren(...kids); }

/* ---------- compartilhar arquivos ---------- */
async function entregar(blob, nome, texto) {
  const file = new File([blob], nome, { type: blob.type });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nome, text: texto }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  const a = h("a", { href: URL.createObjectURL(blob), download: nome }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast("Arquivo baixado: " + nome); }

function exportarExcel() {
  if (!window.XLSX) { toast("Aguarde o app terminar de carregar."); return; }
  const d = s => s ? new Date(s + "T12:00:00") : "";
  const O = [["ID Obra", "Obra / Empreendimento", "Cliente", "Cidade/UF", "Modelo / Tipo de ETE", "Responsável ECTAS", "Contato do cliente", "Telefone / E-mail", "Data da verificação", "Previsão de mobilização", "Data real de mobilização", "Situação da obra", "Observações gerais"]];
  const R = [["ID Obra", "Código item", "Categoria", "Item de verificação", "Etapa limite", "Status", "Parte responsável", "Responsável (nome)", "Data prevista", "Data conclusão", "Evidência (link foto/doc)", "Observações / Pendências", "Última atualização", "Atualizado por"]];
  for (const o of idsObras().sort().map(obraView)) {
    O.push([o.id, o.nome, o.cliente, o.cidade, o.modelo, o.respEctas, o.contato, o.telefone, d(o.dataVerificacao), d(o.previsaoMob), d(o.dataRealMob), o.situacao, o.obs].map(x => x == null ? "" : x));
    for (const it of itensAtivos()) { const r = reg(o, it.codigo);
      R.push([o.id, it.codigo, it.categoria, it.item, it.etapa, r.status || "Pendente", r.parte || "", r.resp || "", d(r.prev), d(r.concl),
        [r.link, (r.fotos || []).length ? r.fotos.length + " foto(s)" : ""].filter(Boolean).join(" | "), r.obs || "", r.em ? new Date(r.em) : "", r.por || ""]); } }
  const wb = XLSX.utils.book_new();
  const w1 = XLSX.utils.aoa_to_sheet(O, { cellDates: true, dateNF: "dd/mm/yyyy" }), w2 = XLSX.utils.aoa_to_sheet(R, { cellDates: true, dateNF: "dd/mm/yyyy" });
  w1["!cols"] = [12, 32, 24, 16, 22, 20, 20, 22, 13, 13, 13, 18, 40].map(w => ({ wch: w })); w2["!cols"] = [12, 10, 13, 52, 13, 14, 13, 20, 12, 12, 26, 42, 16, 18].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, w1, "OBRAS"); XLSX.utils.book_append_sheet(wb, w2, "REGISTRO");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true });
  entregar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Checklist_ECTAS_${hoje()}.xlsx`, "Checklist de pré-instalação ECTAS"); }

let logoData = null;
async function enviarPdf(o) {
  if (!window.jspdf) { toast("Aguarde o app terminar de carregar."); return; }
  toast("Gerando PDF…");
  if (!logoData) { const b = await (await fetch("logo.png")).blob(); logoData = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); }
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210, M = 12, r = resumo(o); let y = 12;
  const NAVY = [0, 43, 73], CINZA = [96, 96, 96];
  const cab = () => { doc.addImage(logoData, "PNG", M, 8, 34, 9); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text("CHECKLIST DE PRÉ-INSTALAÇÃO", W - M, 12, { align: "right" }); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...CINZA);
    doc.text(o.id + " · " + (o.nome || ""), W - M, 16.5, { align: "right" }); doc.setDrawColor(102, 211, 205); doc.setLineWidth(0.8); doc.line(M, 20, W - M, 20); y = 25; };
  cab();
  doc.setFontSize(9); doc.setTextColor(29, 29, 27);
  const linhasInfo = [["Obra", o.nome], ["Cliente", o.cliente], ["Cidade/UF", o.cidade], ["Modelo", o.modelo], ["Responsável ECTAS", o.respEctas], ["Contato do cliente", [o.contato, o.telefone].filter(Boolean).join(" · ")],
    ["Previsão de mobilização", fmt(o.previsaoMob)], ["Conferência", r.conc + " de " + r.apl + " itens conferidos (" + Math.round(r.pct * 100) + "%) · " + (r.apl - r.conc) + " não conferido(s) · " + r.pendMob + " deles necessário(s) para mobilizar"]];
  for (const [k, v] of linhasInfo) { if (!v) continue; doc.setFont("helvetica", "bold"); doc.text(k + ":", M, y); doc.setFont("helvetica", "normal");
    const t = doc.splitTextToSize(String(v), W - 2 * M - 42); doc.text(t, M + 42, y); y += 4.6 * t.length; }
  y += 3;
  const cols = [[M, 15, "Cód."], [M + 15, 70, "Item"], [M + 85, 22, "Status"], [M + 107, 28, "Responsável"], [M + 135, 18, "Prazo"], [M + 153, W - 2 * M - 153, "Observações"]];
  const cabTab = () => { doc.setFillColor(...NAVY); doc.rect(M, y - 4, W - 2 * M, 6, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    for (const c of cols) doc.text(c[2], c[0] + 1, y); y += 4; doc.setTextColor(29, 29, 27); doc.setFont("helvetica", "normal"); };
  cabTab();
  const cor = { "Concluído": [30, 123, 74], "Em andamento": [163, 18, 42], "Pendente": [163, 18, 42], "Não aplicável": [96, 96, 96] };
  let catAtual = "";
  const ordem = [...new Set(itensAtivos().map(i => i.categoria))];
  for (const it of ordem.flatMap(c => itensAtivos().filter(i => i.categoria === c))) {
    const g = reg(o, it.codigo), s = g.status || "Pendente";
    const cel = [it.codigo, it.item, s === "Concluído" ? "Conferido" : s === "Não aplicável" ? "Não se aplica" : "Não conferido", [g.parte, g.resp].filter(Boolean).join(" - "), g.concl ? "Ok " + fmt(g.concl).slice(0, 5) : g.prev ? fmt(g.prev) : "", g.obs || ""];
    const quebras = cel.map((t, i) => doc.splitTextToSize(String(t), cols[i][1] - 2));
    const alt = Math.max(...quebras.map(q => q.length)) * 3.4 + 2.2;
    if (it.categoria !== catAtual) { if (y + 6 + alt > 285) { doc.addPage(); cab(); cabTab(); }
      catAtual = it.categoria; doc.setFont("helvetica", "bold"); doc.setTextColor(0, 115, 168); doc.text(catAtual.toUpperCase(), M, y + 3); y += 5; doc.setFont("helvetica", "normal"); doc.setTextColor(29, 29, 27); }
    if (y + alt > 285) { doc.addPage(); cab(); cabTab(); }
    quebras.forEach((q, i) => { if (i === 2) { doc.setTextColor(...cor[s]); doc.setFont("helvetica", "bold"); } doc.text(q, cols[i][0] + 1, y + 2.6); doc.setTextColor(29, 29, 27); doc.setFont("helvetica", "normal"); });
    y += alt; doc.setDrawColor(213, 222, 229); doc.setLineWidth(0.2); doc.line(M, y - 1, W - M, y - 1); }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...CINZA);
    doc.text("Gerado em " + new Date().toLocaleString("pt-BR") + (C.autor ? " por " + C.autor : "") + " · ECTAS Saneamento", M, 292); doc.text(i + "/" + n, W - M, 292, { align: "right" }); }
  const pend = itensAtivos().filter(it => !["Concluído", "Não aplicável"].includes(stOf(o, it.codigo)));
  const texto = `Checklist de pré-instalação - ${o.id} ${o.nome || ""}\n${r.conc} de ${r.apl} itens conferidos · ${pend.length} não conferido(s)` +
    (r.pendMob ? `\nNão conferidos necessários para mobilizar: ${itensAtivos().filter(it => it.etapa === "Mobilização" && pend.includes(it)).map(it => it.codigo).join(", ")}` : "");
  entregar(doc.output("blob"), `Checklist ${o.id} ${hoje()}.pdf`, texto); }

/* ---------- início ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
UI.rota = lerHash(); render();
if (!CENTRAL.url) setSync("Salvo neste celular. Envie o PDF ou o Excel ao supervisor."); else sincronizar();
