/* Painel do Supervisor - Checklist de Pré-Instalação ECTAS
   Só leitura. Lê a central (Google Apps Script) com a senha do supervisor,
   ou, enquanto a central não estiver ligada, os arquivos Excel enviados pela equipe. */
"use strict";
const CENTRAL = window.CENTRAL || { url: "" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ler = (k, p) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? p : v; } catch (e) { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
let D = ler("sup-dados", { obras: {}, itens: [], fonte: "", em: null });   // dados em uso
let SENHA = ler("sup-senha", "");
const UI = { aba: "obras", filtro: "ativas", busca: "", ano: new Date().getFullYear(), obra: null, form: null, link: null, carregando: false, erro: "" };
const SITUACOES = ["Em pré-instalação", "Mobilizada", "Instalação concluída", "Suspensa", "Cancelada"];
const ROTULO = { "Concluído": "Sim", "Pendente": "Não", "Em andamento": "Não", "Não aplicável": "Não se aplica", "": "Sem resposta" };
const APP_CAMPO = "https://checklist-ectas.github.io/campo";

const $ = s => document.querySelector(s);
const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(a || {})) { if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "text") e.textContent = v; else e.setAttribute(k, v === true ? "" : v); }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return e; };
const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmt = d => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "";
const dias = (a, b) => Math.round((new Date(a + "T12:00") - new Date(b + "T12:00")) / 864e5);
const pct = x => Math.round(x * 100) + "%";

/* ---------- regras (as mesmas do app e da planilha) ---------- */
const itensAtivos = () => ((D.itens && D.itens.length) ? D.itens : ITENS_BASE()).filter(i => i.ativo !== false);
const reg = (o, c) => (o.checklist || {})[c] || {};
function situacaoPrazo(r) { const s = r.status || "Pendente";
  if (s === "Não aplicável") return "N/A";
  if (s === "Concluído") return (!r.prev || !r.concl) ? "Concluído" : r.concl <= r.prev ? "Concluído no prazo" : "Concluído com atraso";
  if (!r.prev) return "Sem data prevista"; return r.prev < hoje() ? "Atrasado" : "No prazo"; }
function resumo(o) { let apl = 0, conc = 0, pendMob = 0, atras = 0, and = 0;
  for (const it of itensAtivos()) { const r = reg(o, it.codigo), s = r.status || "Pendente";
    if (s !== "Não aplicável") apl++; if (s === "Concluído") conc++; if (s === "Em andamento") and++;
    if (it.etapa === "Mobilização" && s !== "Concluído" && s !== "Não aplicável") pendMob++;
    if (situacaoPrazo(r) === "Atrasado") atras++; }
  const lib = o.dataRealMob ? { t: "MOBILIZADA", c: "p-mob" } : pendMob === 0 ? { t: "LIBERADA", c: "p-ok" } : { t: "NÃO LIBERADA", c: "p-bad" };
  return { apl, conc, and, pendMob, atras, pct: apl ? conc / apl : 0, lib }; }
const obras = () => Object.values(D.obras || {}).sort((a, b) => (a.previsaoMob || "9999").localeCompare(b.previsaoMob || "9999"));
const encerrada = o => ["Instalação concluída", "Cancelada"].includes(o.situacao);

/* ---------- fontes de dados ---------- */
async function api(corpo) {
  const r = await fetch(CENTRAL.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...corpo, senha: SENHA }) });
  const j = await r.json(); if (!j.ok) { const e = new Error(j.erro || "erro"); e.senha = j.erro === "senha"; throw e; } return j; }
async function carregarCentral() {
  UI.carregando = true; UI.erro = ""; render();
  try { const r = await api({ acao: "supCarregar" }); const ob = {}; for (const o of r.obras || []) ob[o.id] = o;
    D = { obras: ob, itens: r.itens || [], tecnicos: r.tecnicos || [], fonte: "central", em: new Date().toISOString(), planilha: r.planilha || "" }; gravar("sup-dados", D);
  } catch (e) { if (e.senha) { SENHA = ""; gravar("sup-senha", ""); UI.erro = "Senha incorreta."; } else UI.erro = "Não foi possível falar com a central. Mostrando os últimos dados carregados."; }
  UI.carregando = false; render(); }

const dIso = v => { if (v instanceof Date && !isNaN(v)) return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
  const s = String(v || "").trim(); let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
const tIso = v => v instanceof Date && !isNaN(v) ? v.toISOString() : (String(v || "") ? new Date(v).toISOString() : "");
async function importar(arquivos) {
  let nObras = 0, nItens = 0; const base = D.fonte === "arquivos" ? D : { obras: {}, itens: [], tecnicos: D.tecnicos || [], fonte: "arquivos" };
  const cat = new Map((base.itens || []).map(i => [i.codigo, i]));
  for (const f of arquivos) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const so = wb.Sheets["OBRAS"], sr = wb.Sheets["REGISTRO"];
      if (!so || !sr) { UI.erro = `O arquivo ${f.name} não é uma exportação do app (faltam as abas OBRAS e REGISTRO).`; continue; }
      for (const r of XLSX.utils.sheet_to_json(so, { defval: "" })) { const id = String(r["ID Obra"] || "").trim().toUpperCase(); if (!id) continue;
        const o = base.obras[id] || (base.obras[id] = { id, checklist: {} }); nObras++;
        const map = { nome: "Obra / Empreendimento", cliente: "Cliente", cidade: "Cidade/UF", modelo: "Modelo / Tipo de ETE", respEctas: "Responsável ECTAS", tecnico: "Técnico responsável", contato: "Contato do cliente", telefone: "Telefone / E-mail", situacao: "Situação da obra", obs: "Observações gerais" };
        for (const [k, c] of Object.entries(map)) if (String(r[c] || "").trim()) o[k] = String(r[c]).trim();
        for (const [k, c] of [["dataVerificacao", "Data da verificação"], ["previsaoMob", "Previsão de mobilização"], ["dataRealMob", "Data real de mobilização"]]) if (dIso(r[c])) o[k] = dIso(r[c]); }
      for (const r of XLSX.utils.sheet_to_json(sr, { defval: "" })) { const id = String(r["ID Obra"] || "").trim().toUpperCase(), cod = String(r["Código item"] || "").trim(); if (!id || !cod) continue;
        if (!cat.has(cod)) cat.set(cod, { codigo: cod, categoria: r["Categoria"], item: r["Item de verificação"], etapa: r["Etapa limite"] || "Mobilização", ativo: true });
        const o = base.obras[id] || (base.obras[id] = { id, checklist: {} });
        const novo = { status: r["Status"] || "", parte: r["Parte responsável"], resp: r["Responsável (nome)"], prev: dIso(r["Data prevista"]), concl: dIso(r["Data conclusão"]),
          link: r["Evidência (link foto/doc)"], obs: r["Observações / Pendências"], em: tIso(r["Última atualização"]), por: r["Atualizado por"] || "" };
        const velho = o.checklist[cod];
        if (!velho || (novo.em && (!velho.em || novo.em > velho.em)) || (!velho.em && !novo.em)) { o.checklist[cod] = novo; nItens++; } }
    } catch (e) { UI.erro = `Não foi possível ler ${f.name}.`; }
  }
  D = { ...base, itens: [...cat.values()], em: new Date().toISOString() }; gravar("sup-dados", D);
  if (!UI.erro) toast(`${arquivos.length} arquivo(s) importado(s): ${Object.keys(D.obras).length} obra(s) no painel.`);
  render(); }
function toast(m) { const t = h("div", { class: "toast", role: "status", text: m }); document.body.append(t); setTimeout(() => t.remove(), 3200); }

/* ---------- telas ---------- */
function topo() {
  $("#fonte").textContent = D.fonte === "central" ? "Dados da central · " + (D.em ? new Date(D.em).toLocaleString("pt-BR") : "")
    : D.fonte === "arquivos" ? "Dados salvos neste navegador" : "Checklist de Pré-Instalação";
  const ac = [];
  if (!CENTRAL.url || SENHA) ac.push(h("button", { class: "acao", onclick: () => { UI.form = "nova"; UI.obra = null; render(); scrollTo(0, 0); } }, "+ Nova obra"));
  if (CENTRAL.url && SENHA) ac.push(h("button", { class: "acao", onclick: carregarCentral }, UI.carregando ? "Atualizando…" : "Atualizar"));
  if (D.fonte) ac.push(h("button", { class: "acao", onclick: exportar }, "Exportar Excel"));
  $("#acoes").replaceChildren(...ac); }

function render() {
  topo();
  const m = $("#main");
  if (CENTRAL.url && !SENHA) return telaSenha(m);
  const kids = [];
  if (UI.erro) kids.push(h("div", { class: "notice warn", text: UI.erro }));
  if (!CENTRAL.url) kids.push(blocoImportar());
  if (UI.form) { m.replaceChildren(...kids, telaForm(UI.form === "nova" ? null : D.obras[UI.form])); return; }
  if (UI.obra && D.obras[UI.obra]) { m.replaceChildren(...kids, telaObra(D.obras[UI.obra])); return; }
  kids.push(kpis());
  kids.push(h("div", { class: "tabs", role: "tablist" }, [["obras", "Obras"], ["mes", "Mês a mês"], ["tec", "Técnicos"], ["itens", "Itens"]].map(([k, t]) =>
    h("button", { role: "tab", "aria-selected": String(UI.aba === k), onclick: () => { UI.aba = k; render(); } }, t))));
  kids.push(UI.aba === "mes" ? telaMes() : UI.aba === "tec" ? telaTecnicos() : UI.aba === "itens" ? telaItens() : telaObras());
  m.replaceChildren(...kids); }

function telaSenha(m) {
  const msg = h("p", { class: "meta", text: UI.erro });
  m.replaceChildren(h("form", { class: "card ent", onsubmit: async e => { e.preventDefault(); SENHA = $("#s-senha").value; msg.textContent = "Conferindo…";
      try { await api({ acao: "supPing" }); gravar("sup-senha", SENHA); UI.erro = ""; carregarCentral(); }
      catch (err) { SENHA = ""; msg.textContent = err.senha ? "Senha incorreta." : "Sem conexão com a central."; } } },
    h("h2", { text: "Acesso do supervisor" }), h("p", { class: "meta", text: "Digite a senha do supervisor definida na central." }),
    h("label", { class: "f" }, "Senha", h("input", { id: "s-senha", type: "password", required: true, autocomplete: "current-password" })),
    h("button", { class: "btn", type: "submit" }, "Entrar"), msg)); }

function blocoImportar() {
  const inp = h("input", { type: "file", id: "imp", accept: ".xlsx", multiple: true, hidden: true, onchange: e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importar(f); } });
  const box = h("label", { class: "drop", for: "imp" }, h("b", { text: "Importar Excel da equipe" }), h("br"),
    h("span", { class: "meta", text: "Arraste aqui ou clique para escolher. Pode importar vários arquivos de uma vez; vale a atualização mais recente de cada item." }), inp);
  box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("on"); });
  box.addEventListener("dragleave", () => box.classList.remove("on"));
  box.addEventListener("drop", e => { e.preventDefault(); box.classList.remove("on"); const f = [...e.dataTransfer.files].filter(x => /\.xlsx$/i.test(x.name)); if (f.length) importar(f); });
  return h("div", { style: "display:flex;flex-direction:column;gap:6px" }, box,
    D.fonte === "arquivos" ? h("button", { class: "more", style: "align-self:flex-end", onclick: () => { D = { obras: {}, itens: [], fonte: "" }; gravar("sup-dados", D); render(); } }, "Limpar dados importados") : null); }

function kpis() {
  const lista = obras().filter(o => !encerrada(o)), rs = lista.map(resumo);
  const c = (n, t, cls) => h("div", { class: "kpi " + (cls || "") }, h("b", { text: n }), h("span", { text: t }));
  return h("div", { class: "kpis" },
    c(lista.length, "Obras ativas"), c(rs.filter(r => r.lib.t === "NÃO LIBERADA").length, "Não liberadas", "bad"),
    c(rs.filter(r => r.lib.t === "LIBERADA").length, "Liberadas, aguardando", "ok"), c(rs.filter(r => r.lib.t === "MOBILIZADA").length, "Mobilizadas", "mob"),
    c(rs.reduce((a, r) => a + r.atras, 0), "Itens atrasados", "warn"),
    c(lista.filter(o => !o.dataRealMob && o.previsaoMob && dias(o.previsaoMob, hoje()) >= 0 && dias(o.previsaoMob, hoje()) <= 7 && resumo(o).pendMob > 0).length, "Mobilizam em 7 dias com pendência", "bad")); }

function telaObras() {
  if (!Object.keys(D.obras || {}).length) {
    return h("div", { class: "vazio" }, h("h2", { text: "Nenhuma obra cadastrada ainda" }),
      h("p", { text: "Toque em “+ Nova obra”. No cadastro você escolhe ou cadastra o responsável de campo, e a senha de acesso dele é gerada na hora." }),
      h("button", { class: "btn", style: "margin:10px auto 0", onclick: () => { UI.form = "nova"; render(); } }, "+ Nova obra")); }
  const q = UI.busca.trim().toLowerCase();
  const lista = obras().map(o => ({ o, r: resumo(o) })).filter(({ o, r }) => {
      if (UI.filtro === "ativas") return !encerrada(o); if (UI.filtro === "naolib") return !encerrada(o) && r.lib.t === "NÃO LIBERADA";
      if (UI.filtro === "lib") return !encerrada(o) && r.lib.t === "LIBERADA"; if (UI.filtro === "mob") return r.lib.t === "MOBILIZADA";
      if (UI.filtro === "atras") return r.atras > 0; return true; })
    .filter(({ o }) => !q || [o.id, o.nome, o.cliente, o.cidade, o.respEctas, o.tecnico].join(" ").toLowerCase().includes(q));
  const linhas = lista.map(({ o, r }) => { const falta = o.previsaoMob && !o.dataRealMob ? dias(o.previsaoMob, hoje()) : null;
    return h("tr", { class: "click", tabindex: "0", onclick: () => { UI.obra = o.id; render(); scrollTo(0, 0); }, onkeydown: e => { if (e.key === "Enter") { UI.obra = o.id; render(); } } },
      h("td", {}, h("span", { class: "code", text: o.id })), h("td", {}, h("b", { text: o.nome || "" }), h("div", { class: "meta", text: [o.cliente, o.cidade].filter(Boolean).join(" · ") })),
      h("td", {}, o.tecnico ? o.tecnico : h("span", { class: "pill p-bad", text: "sem técnico" })), h("td", { class: "n", text: o.dataRealMob ? "✓ " + fmt(o.dataRealMob) : fmt(o.previsaoMob) }),
      h("td", { class: "n", text: falta == null ? "" : (falta >= 0 ? falta + "d" : (-falta) + "d atrás"), style: falta != null && falta <= 7 && r.pendMob ? "color:var(--bad);font-weight:700" : "" }),
      h("td", { class: "n" }, pct(r.pct), h("span", { class: "mini" }, h("i", { style: "width:" + pct(r.pct) }))),
      h("td", { class: "n", text: r.pendMob, style: r.pendMob ? "color:var(--bad);font-weight:700" : "" }),
      h("td", { class: "n", text: r.atras, style: r.atras ? "color:var(--warn);font-weight:700" : "" }),
      h("td", {}, h("span", { class: "pill " + r.lib.c, text: r.lib.t }))); });
  return h("div", { style: "display:flex;flex-direction:column;gap:10px" },
    h("div", { class: "bar" }, h("input", { class: "busca grow", id: "busca", type: "search", placeholder: "Buscar obra, cliente, cidade ou responsável", value: UI.busca, style: "max-width:420px",
        oninput: e => { UI.busca = e.target.value; const pos = e.target.selectionStart; render(); const b = $("#busca"); b.focus(); b.setSelectionRange(pos, pos); } }),
      h("div", { class: "chips" }, [["ativas", "Ativas"], ["naolib", "Não liberadas"], ["lib", "Liberadas"], ["mob", "Mobilizadas"], ["atras", "Com atraso"], ["todas", "Todas"]].map(([k, t]) =>
        h("button", { class: "chip", "aria-pressed": String(UI.filtro === k), onclick: () => { UI.filtro = k; render(); } }, t)))),
    lista.length ? h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["ID", "Obra", "Técnico (campo)", "Mobilização", "Faltam", "Conferido", "Pend. mobil.", "Atrasados", "Liberação"].map((t, i) => h("th", { class: i >= 3 && i <= 7 ? "n" : "", text: t })))),
      h("tbody", {}, linhas))) : h("p", { class: "vazio", text: "Nenhuma obra neste filtro." })); }

function telaObra(o) {
  const r = resumo(o); const cats = [...new Set(itensAtivos().map(i => i.categoria))];
  const info = [["Técnico responsável (campo)", o.tecnico || "não definido"], ["Cliente", o.cliente], ["Cidade/UF", o.cidade], ["Modelo", o.modelo], ["Responsável ECTAS", o.respEctas], ["Contato do cliente", [o.contato, o.telefone].filter(Boolean).join(" · ")],
    ["Data da verificação", fmt(o.dataVerificacao)], ["Previsão de mobilização", fmt(o.previsaoMob)], ["Mobilização real", fmt(o.dataRealMob)], ["Situação", o.situacao], ["Observações", o.obs]].filter(x => x[1]);
  const corpo = [];
  for (const c of cats) { corpo.push(h("tr", {}, h("td", { colspan: "7", style: "background:var(--surface2);font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)", text: c })));
    for (const it of itensAtivos().filter(i => i.categoria === c)) { const g = reg(o, it.codigo), s = g.status || "Pendente", sp = situacaoPrazo(g);
      const cls = { "Concluído": "p-ok", "Em andamento": "p-bad", "Pendente": "p-bad", "Não aplicável": "p-na" }[g.status || ""] || "p-warn";
      const fotos = (g.fotos || []).filter(f => String(f).startsWith("d:"));
      const thumbs = fotos.length && D.fonte === "central" ? h("div", { class: "thumbs" }, fotos.map(f => { const ph = h("div", { class: "ph", text: "foto" }); carregarFoto(f.slice(2), ph); return ph; })) : null;
      corpo.push(h("tr", {}, h("td", {}, h("span", { class: "code", text: it.codigo })), h("td", {}, it.item, h("div", { class: "meta", text: "Até " + it.etapa })),
        h("td", {}, h("span", { class: "pill " + cls, text: ROTULO[g.status || ""] || g.status })), h("td", { text: [g.parte, g.resp].filter(Boolean).join(" · ") }),
        h("td", { class: "n", text: g.prev ? fmt(g.prev) : "" }, h("div", { class: "meta", text: sp === "Atrasado" ? "Atrasado " + dias(hoje(), g.prev) + "d" : sp === "Concluído com atraso" ? "com atraso" : "" })),
        h("td", { class: "n", text: fmt(g.concl) }),
        h("td", {}, g.obs || "", g.link ? h("div", {}, h("a", { href: g.link, target: "_blank", rel: "noopener", text: "evidência" })) : null, thumbs,
          g.por ? h("div", { class: "meta", text: "por " + g.por + (g.em ? " em " + new Date(g.em).toLocaleDateString("pt-BR") : "") }) : null))); } }
  return h("div", { style: "display:flex;flex-direction:column;gap:14px" },
    h("button", { class: "more", style: "align-self:flex-start", onclick: () => { UI.obra = null; UI.link = null; render(); } }, "‹ Voltar para as obras"),
    blocoLink(o),
    h("div", { class: "row" },
      h("button", { class: "btn wa", onclick: () => compartilharLink(o) }, CENTRAL.url ? "Acesso do técnico" : "Link da obra para o técnico"),
      h("button", { class: "btn sec", onclick: () => { UI.form = o.id; render(); scrollTo(0, 0); } }, "Editar dados da obra"),
      o.dataRealMob ? null : h("button", { class: "btn sec", onclick: () => salvarObra({ id: o.id, dataRealMob: hoje(), situacao: "Mobilizada" }, "Mobilização registrada") }, "Registrar mobilização hoje")),
    h("div", { class: "card", style: "display:flex;flex-direction:column;gap:12px" },
      h("div", { class: "row" }, h("span", { class: "code", text: o.id }), h("span", { class: "pill " + r.lib.c, text: r.lib.t })),
      h("h2", { style: "margin:0;font-size:20px", text: o.nome || "" }),
      h("div", { class: "prog" }, h("i", { style: "width:" + pct(r.pct) })),
      h("div", { class: "stats" }, [[pct(r.pct), "Conferido"], [r.conc + "/" + r.apl, "Itens"], [r.pendMob, "P/ mobilizar"], [r.atras, "Atrasados"]].map(([v, t]) => h("div", { class: "stat" }, h("b", { text: v }), h("span", { text: t })))),
      h("dl", { class: "det" }, info.map(([k, v]) => h("div", {}, h("dt", { text: k }), h("dd", { text: v }))))),
    h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Cód.", "Item", "Status", "Responsável", "Prazo", "Conclusão", "Observações / evidências"].map((t, i) => h("th", { class: i === 4 || i === 5 ? "n" : "", text: t })))), h("tbody", {}, corpo)))); }

const cacheFoto = {};
async function carregarFoto(id, ph) {
  try { if (!cacheFoto[id]) cacheFoto[id] = api({ acao: "supFoto", id }).then(r => "data:image/jpeg;base64," + r.b64);
    const src = await cacheFoto[id]; const img = h("img", { src, alt: "Foto" }); ph.replaceChildren(img);
    ph.onclick = () => { const lb = h("div", { class: "lightbox", onclick: () => lb.remove() }, h("img", { src, alt: "Foto" })); document.body.append(lb); };
  } catch (e) { ph.textContent = "indisponível"; } }


/* ---------- cadastro de obras (supervisor) ---------- */
function telaForm(o) {
  const v = o || { situacao: "Em pré-instalação", dataVerificacao: hoje() };
  const f = (k, lbl, type = "text", x = {}) => h("label", { class: "f" + (x.full ? " full" : "") }, lbl,
    h("input", { id: "o-" + k, name: k, type, value: v[k] || "", required: x.req || null, placeholder: x.ph || "", readonly: x.ro || null }));
  const msg = h("div", { class: "full meta" });
  return h("div", { style: "display:flex;flex-direction:column;gap:12px;max-width:760px" },
    h("button", { class: "more", style: "align-self:flex-start", onclick: () => { UI.form = null; render(); } }, "‹ Cancelar"),
    h("h2", { style: "margin:0", text: o ? "Dados da obra " + o.id : "Nova obra" }),
    h("form", { class: "card form", onsubmit: async e => { e.preventDefault();
        const d = {}; for (const [k, val] of new FormData(e.target).entries()) d[k] = String(val).trim();
        if (!o) { d.id = d.id.toUpperCase().replace(/\s+/g, "-"); if (!/^[A-Z0-9-]+$/.test(d.id)) { msg.textContent = "Use só letras, números e hífen no ID (ex.: OBRA-014)."; return; }
          if (D.obras[d.id]) { msg.textContent = "Já existe uma obra com o ID " + d.id + "."; return; } }
        else d.id = o.id;
        if (d.tecnico === "__novo") {
          const nome = String(d.novoNome || "").trim(), senha = String(d.novaSenha || "").trim();
          if (!nome) { msg.textContent = "Digite o nome do responsável de campo."; return; }
          if (!/^\d{4,8}$/.test(senha)) { msg.textContent = "A senha do técnico tem de 4 a 8 números."; return; }
          if (tecnicoDe(nome)) { msg.textContent = "Já existe um técnico com esse nome. Escolha-o na lista."; return; }
          msg.textContent = "Cadastrando o responsável…";
          if (!await salvarTecnico({ nome, codigo: senha, telefone: String(d.novoFone || "").trim(), ativo: true }, "Responsável cadastrado")) { msg.textContent = UI.erro || "Não foi possível cadastrar o responsável."; return; }
          d.tecnico = nome; }
        if (!d.tecnico) { msg.textContent = "Escolha o responsável de campo."; return; }
        delete d.novoNome; delete d.novaSenha; delete d.novoFone;
        msg.textContent = "Salvando…";
        const trocouTecnico = !o || o.tecnico !== d.tecnico;
        const ok = await salvarObra(d, o ? "Dados salvos" : "Obra cadastrada");
        if (ok && trocouTecnico) { UI.form = null; UI.obra = d.id; UI.link = d.id; render(); scrollTo(0, 0); return; }
        if (ok) { UI.form = null; UI.obra = d.id; UI.link = o ? null : d.id; render(); scrollTo(0, 0); } else msg.textContent = UI.erro || "Não foi possível salvar."; } },
      f("id", "ID da obra", "text", { req: true, ph: "OBRA-014", ro: !!o }),
      h("label", { class: "f" }, "Situação", h("select", { id: "o-situacao", name: "situacao" }, SITUACOES.map(s => h("option", { value: s, selected: s === v.situacao || null }, s)))),
      f("nome", "Obra / empreendimento", "text", { req: true, full: true }), f("cliente", "Cliente"), f("cidade", "Cidade/UF", "text", { ph: "Joinville/SC" }),
      f("modelo", "Modelo / tipo de ETE", "text", { full: true }), f("respEctas", "Responsável ECTAS"),
      blocoResponsavel(v),
      f("contato", "Contato do cliente"),
      f("telefone", "Telefone / e-mail", "text", { full: true }), f("dataVerificacao", "Data da verificação", "date"), f("previsaoMob", "Previsão de mobilização", "date"),
      f("dataRealMob", "Data real de mobilização", "date"),
      h("label", { class: "f full" }, "Observações gerais", h("textarea", { id: "o-obs", name: "obs" }, v.obs || "")),
      h("div", { class: "full row" }, h("button", { class: "btn", type: "submit" }, o ? "Salvar alterações" : "Cadastrar obra")), msg)); }

async function salvarObra(d, aviso) {
  UI.erro = "";
  if (CENTRAL.url) {
    try { await api({ acao: "supSalvarObra", obra: d }); toast(aviso); await carregarCentral(); return true; }
    catch (e) { UI.erro = e.senha ? "Senha do supervisor incorreta." : "Sem conexão com a central. A obra não foi salva."; render(); return false; } }
  const atual = D.obras[d.id] || { id: d.id, checklist: {} };
  D.obras[d.id] = { ...atual, ...d, checklist: atual.checklist || {} };
  if (!D.fonte) D.fonte = "arquivos";
  if (!D.itens || !D.itens.length) D.itens = ITENS_BASE();
  gravar("sup-dados", D); toast(aviso); render(); return true; }

// lista de itens usada antes de importar o primeiro Excel (a mesma do app de campo)
function ITENS_BASE() { return (window.ITENS_CAMPO || []).map(r => ({ codigo: r[0], categoria: r[1], item: r[2], etapa: r[3], referencia: r[4], ativo: true })); }

/* ---------- itens do checklist (carregados da planilha) ---------- */
const ETAPAS = ["Mobilização", "Montagem", "Testes", "Start-up"];
function lerItensDaPlanilha(wb) {
  const nomes = wb.SheetNames;
  const aba = nomes.find(n => /^itens$/i.test(n.trim())) || nomes.find(n => /iten/i.test(n)) || nomes[0];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: "" });
  const sem = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  let cab = -1, col = {};
  for (let i = 0; i < Math.min(linhas.length, 15) && cab < 0; i++) {
    const r = linhas[i].map(sem);
    const iItem = r.findIndex(c => /^item/.test(c) || /verifica/.test(c));
    if (iItem >= 0 && r.some(c => /^cod/.test(c) || /^categ/.test(c))) {
      cab = i; col = { item: iItem, codigo: r.findIndex(c => /^cod/.test(c)), categoria: r.findIndex(c => /^categ/.test(c)),
        etapa: r.findIndex(c => /etapa/.test(c)), referencia: r.findIndex(c => /refer/.test(c)), ativo: r.findIndex(c => /^ativo/.test(c)) }; } }
  if (cab < 0) throw new Error(`Não achei o cabeçalho na aba "${aba}". A aba precisa ter as colunas Código, Categoria e Item de verificação.`);
  const pega = (r, k) => col[k] >= 0 ? String(r[col[k]] ?? "").trim() : "";
  const lista = [], vistos = new Set(); let n = 0;
  for (const r of linhas.slice(cab + 1)) {
    const item = pega(r, "item"); if (!item) continue;
    let codigo = pega(r, "codigo").toUpperCase().replace(/\s+/g, "-"); if (!codigo || vistos.has(codigo)) codigo = "IT-" + String(++n).padStart(2, "0");
    vistos.add(codigo);
    const etapa = ETAPAS.find(e => sem(e) === sem(pega(r, "etapa"))) || "Mobilização";
    lista.push({ codigo, categoria: pega(r, "categoria") || "Geral", item, etapa, referencia: pega(r, "referencia"), ativo: !/^n(ã|a)o$/i.test(pega(r, "ativo")) }); }
  if (!lista.length) throw new Error(`A aba "${aba}" não tem itens abaixo do cabeçalho.`);
  return { aba, lista }; }
async function importarItens(f) {
  UI.erro = "";
  try {
    const { aba, lista } = lerItensDaPlanilha(XLSX.read(await f.arrayBuffer()));
    const ativos = lista.filter(i => i.ativo !== false).length;
    if (CENTRAL.url) { await api({ acao: "supSalvarItens", itens: lista }); await carregarCentral(); }
    else { D.itens = lista; D.itensOrigem = `${f.name} (aba ${aba}) em ${new Date().toLocaleString("pt-BR")}`; if (!D.fonte) D.fonte = "arquivos"; gravar("sup-dados", D); }
    toast(`${ativos} itens carregados da planilha.`); render();
  } catch (e) { UI.erro = e.senha ? "Senha do supervisor incorreta." : (e.message || "Não foi possível ler a planilha."); render(); } }
function telaItens() {
  const its = itensAtivos(), cats = [...new Set(its.map(i => i.categoria))];
  const inp = h("input", { type: "file", id: "imp-itens", accept: ".xlsx,.xls", hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ""; if (f) importarItens(f); } });
  return h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("div", { class: "card", style: "display:flex;flex-direction:column;gap:8px" },
      h("b", { text: "Itens da lista de checagem" }),
      h("p", { class: "meta", style: "margin:0", text: "A equipe de campo responde Sim ou Não para cada item desta lista. Para mudar os itens, edite a aba ITENS da planilha de controle (colunas Código, Categoria, Item de verificação, Etapa limite e, se quiser, Ativo) e carregue a planilha aqui." }),
      h("p", { class: "meta", style: "margin:0", text: CENTRAL.url ? "Com a central ligada, a lista vai para todas as obras automaticamente." : "Os links das obras enviados a partir de agora levam esta lista. Obras já enviadas mantêm a lista antiga até você reenviar o link." }),
      D.itensOrigem ? h("p", { class: "meta", style: "margin:0", text: "Última carga: " + D.itensOrigem }) : null,
      h("label", { class: "btn", for: "imp-itens", style: "align-self:flex-start;cursor:pointer" }, "Carregar itens da planilha (Excel)"), inp),
    h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Nº", "Código", "Item de verificação", "Etapa limite"].map(t => h("th", { text: t })))),
      h("tbody", {}, (() => { let n = 0; return cats.flatMap(c => [h("tr", {}, h("td", { colspan: "4", style: "background:var(--surface2);font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)", text: c + " · " + its.filter(i => i.categoria === c).length })),
        ...its.filter(i => i.categoria === c).map(i => h("tr", {}, h("td", { class: "n", text: ++n }), h("td", {}, h("span", { class: "code", text: i.codigo })), h("td", { text: i.item }), h("td", { text: i.etapa })))]); })())))); }

/* ---------- técnicos ---------- */
const tecnicos = () => (D.tecnicos || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
const tecnicoDe = nome => (D.tecnicos || []).find(t => t.nome === nome) || null;
const novoCodigo = () => { const usados = new Set((D.tecnicos || []).map(t => t.codigo)); let c; do { c = String(100000 + Math.floor(Math.random() * 900000)); } while (usados.has(c)); return c; };
async function salvarTecnico(t, aviso) {
  UI.erro = "";
  if (CENTRAL.url) {
    try { await api({ acao: "supSalvarTecnico", tecnico: t }); toast(aviso); await carregarCentral(); return true; }
    catch (e) { UI.erro = e.senha ? "Senha do supervisor incorreta." : (e.message && e.message !== "erro" ? e.message : "Sem conexão com a central."); render(); return false; } }
  const lista = (D.tecnicos || []).filter(x => x.nome !== (t.nomeAntigo || t.nome));
  if (lista.some(x => x.codigo === t.codigo)) { UI.erro = "Esta senha já é de outro técnico."; render(); return false; }
  const novo = { nome: t.nome, codigo: t.codigo, telefone: t.telefone || "", ativo: t.ativo !== false };
  D.tecnicos = [...lista, novo];
  if (t.nomeAntigo && t.nomeAntigo !== t.nome) for (const o of Object.values(D.obras)) if (o.tecnico === t.nomeAntigo) o.tecnico = t.nome;
  if (!D.fonte) D.fonte = "arquivos";
  gravar("sup-dados", D); toast(aviso); render(); return true; }
const foneWa = t => String((t && t.telefone) || "").replace(/\D/g, "").replace(/^(?!55)(\d{10,11})$/, "55$1");
function telaTecnicos() {
  const msg = h("span", { class: "meta" });
  const form = h("form", { class: "card form", onsubmit: async e => { e.preventDefault();
      const nome = $("#t-nome").value.trim(), codigo = $("#t-cod").value.trim(), telefone = $("#t-fone").value.trim();
      if (!nome) return; if (!/^\d{4,8}$/.test(codigo)) { msg.textContent = "A senha tem de 4 a 8 números."; return; }
      if (tecnicoDe(nome)) { msg.textContent = "Já existe um técnico com esse nome."; return; }
      if (await salvarTecnico({ nome, codigo, telefone, ativo: true }, "Técnico cadastrado")) { $("#t-nome").value = ""; $("#t-fone").value = ""; $("#t-cod").value = novoCodigo(); } } },
    h("div", { class: "full", style: "font-weight:700", text: "Cadastrar técnico de campo" }),
    h("label", { class: "f" }, "Nome", h("input", { id: "t-nome", required: true, autocomplete: "off" })),
    h("label", { class: "f" }, "Telefone (WhatsApp)", h("input", { id: "t-fone", inputmode: "tel", placeholder: "(47) 99999-0000" })),
    h("label", { class: "f" }, "Senha de acesso (gerada)", h("input", { id: "t-cod", required: true, inputmode: "numeric", value: novoCodigo(), maxlength: "8" })),
    h("div", { class: "row", style: "align-items:flex-end" }, h("button", { class: "btn", type: "submit" }, "Cadastrar técnico"), msg));
  const linhas = tecnicos().map(t => { const n = Object.values(D.obras).filter(o => o.tecnico === t.nome && !encerrada(o)).length;
    const txt = `Olá, ${t.nome}! Seu acesso ao Checklist de Pré-Instalação ECTAS:\n${APP_CAMPO}\nSenha de acesso: ${t.codigo}\nNão compartilhe esta senha.`;
    return h("tr", { style: t.ativo === false ? "opacity:.55" : "" }, h("td", {}, h("b", { text: t.nome })), h("td", { text: t.telefone || "" }),
      h("td", { class: "n" }, h("span", { class: "code", text: t.codigo })), h("td", { class: "n", text: n }),
      h("td", {}, h("div", { class: "row" },
        h("a", { class: "btn wa", style: "padding:7px 10px;font-size:12px", href: "https://wa.me/" + foneWa(t) + "?text=" + encodeURIComponent(txt), target: "_blank", rel: "noopener" }, "Enviar acesso"),
        h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px", onclick: () => salvarTecnico({ ...t, codigo: novoCodigo(), nomeAntigo: t.nome }, "Nova senha gerada. Envie para o técnico.") }, "Gerar nova senha"),
        h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px", onclick: () => salvarTecnico({ ...t, ativo: t.ativo === false, nomeAntigo: t.nome }, t.ativo === false ? "Técnico reativado" : "Técnico desativado") }, t.ativo === false ? "Reativar" : "Desativar")))); });
  return h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("p", { class: "meta", style: "margin:0", text: "Cada técnico entra no app de campo com a senha dele e só vê as obras em que é o responsável. Também dá para cadastrar o responsável direto no cadastro da obra. Um técnico desativado perde o acesso." }),
    form,
    linhas.length ? h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Técnico", "Telefone", "Senha", "Obras ativas", ""].map((t, i) => h("th", { class: i === 2 || i === 3 ? "n" : "", text: t })))), h("tbody", {}, linhas)))
      : h("p", { class: "vazio", text: "Nenhum técnico cadastrado ainda." })); }

function blocoResponsavel(v) {
  const ativos = tecnicos().filter(t => t.ativo !== false || t.nome === v.tecnico);
  const novo = !ativos.length;
  const caixa = h("div", { class: "full card", id: "novo-resp", style: "display:" + (novo ? "grid" : "none") + ";grid-template-columns:1fr 1fr;gap:10px;background:var(--surface2)" },
    h("div", { style: "grid-column:1/-1;font-weight:700", text: "Novo responsável de campo" }),
    h("label", { class: "f" }, "Nome do responsável", h("input", { id: "o-novoNome", name: "novoNome", autocomplete: "off" })),
    h("label", { class: "f" }, "Telefone (WhatsApp)", h("input", { id: "o-novoFone", name: "novoFone", inputmode: "tel", placeholder: "(47) 99999-0000" })),
    h("label", { class: "f" }, "Senha de acesso (gerada)", h("input", { id: "o-novaSenha", name: "novaSenha", inputmode: "numeric", maxlength: "8", value: novoCodigo() })),
    h("p", { class: "meta", style: "margin:0;align-self:end", text: "O técnico usa esta senha para entrar no app e abrir as obras vinculadas a ele." }));
  const sel = h("select", { id: "o-tecnico", name: "tecnico", required: true, onchange: e => { $("#novo-resp").style.display = e.target.value === "__novo" ? "grid" : "none"; } },
    h("option", { value: "" }, "Escolha o responsável"),
    ativos.map(t => h("option", { value: t.nome, selected: t.nome === v.tecnico || null }, t.nome)),
    h("option", { value: "__novo", selected: novo || null }, "+ Cadastrar novo responsável"));
  return h("div", { class: "full", style: "display:flex;flex-direction:column;gap:10px" },
    h("label", { class: "f" }, "Responsável de campo (preenche o checklist)", sel), caixa); }

/* ---------- link da obra para o técnico responsável ---------- */
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function fecharPacote(dados, codigo) {   // cifra a obra com o código pessoal do técnico: só ele abre o link
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(codigo), "PBKDF2", false, ["deriveKey"]);
  const chave = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(JSON.stringify(dados)));
  return { s: b64u(salt), i: b64u(iv), c: b64u(c) }; }
const cacheLink = {};
async function linkObra(o) {
  if (CENTRAL.url) return APP_CAMPO + "#obra-" + o.id;   // com a central, a obra já chega só para o técnico responsável
  const t = tecnicoDe(o.tecnico); if (!t) throw new Error("sem técnico");
  const campos = ["id", "nome", "cliente", "cidade", "modelo", "respEctas", "contato", "telefone", "dataVerificacao", "previsaoMob", "situacao", "obs", "tecnico"];
  const dados = {}; for (const k of campos) if (o[k]) dados[k] = o[k];
  dados.itens = itensAtivos().map(i => [i.codigo, i.categoria, i.item, i.etapa, i.referencia || ""]);   // lista de checagem da planilha
  const chave = JSON.stringify(dados) + "|" + t.codigo;
  if (cacheLink[o.id] && cacheLink[o.id].k === chave) return cacheLink[o.id].url;
  const pac = { t: t.nome, ...(await fecharPacote(dados, t.codigo)) };
  const url = APP_CAMPO + "#o=" + b64u(new TextEncoder().encode(JSON.stringify(pac)));
  cacheLink[o.id] = { k: chave, url }; return url; }
const textoLink = o => { const t = tecnicoDe(o.tecnico); return `Olá, ${o.tecnico}! A obra ${o.id} ${o.nome || ""} foi liberada para você preencher o checklist de pré-instalação.\nSua senha de acesso: ${t ? t.codigo : ""}\nAbra o link:`; };
async function compartilharLink(o) {
  if (!tecnicoDe(o.tecnico)) { toast("Escolha o técnico responsável antes de enviar o link."); UI.form = o.id; render(); return; }
  UI.link = o.id; render(); }
function blocoLink(o) {
  if (UI.link !== o.id) return null;
  const t = tecnicoDe(o.tecnico);
  if (CENTRAL.url) {   // com a central, a obra aparece sozinha para o técnico ao entrar com a senha
    const txt = t ? `Olá, ${t.nome}! Seu acesso ao Checklist de Pré-Instalação ECTAS:\n${APP_CAMPO}\nSenha de acesso: ${t.codigo}\nAo entrar, as obras liberadas para você já aparecem.` : "";
    return h("div", { class: "card", style: "display:flex;flex-direction:column;gap:8px;border-color:var(--teal)" },
      h("b", { text: "Obra liberada para " + (t ? t.nome : "o técnico") }),
      h("p", { class: "meta", style: "margin:0", text: "Não precisa enviar link: quando o técnico entrar no app com a senha dele, o checklist desta obra já aparece." }),
      t ? h("div", { class: "row" }, h("span", { class: "meta", text: "Endereço do app: " + APP_CAMPO + " · Senha de acesso:" }), h("span", { class: "code", style: "font-size:20px", text: t.codigo })) : null,
      t ? h("a", { class: "btn sec", style: "align-self:flex-start", href: "https://wa.me/" + foneWa(t) + "?text=" + encodeURIComponent(txt), target: "_blank", rel: "noopener" }, "Enviar a senha ao técnico (só no primeiro acesso)") : null); }
  const inp = h("input", { class: "busca", id: "link-obra", readonly: true, value: "Gerando o link…", onfocus: e => e.target.select() });
  const wa = h("a", { class: "btn wa", target: "_blank", rel: "noopener" }, "Enviar no WhatsApp para " + (t ? t.nome : ""));
  linkObra(o).then(url => { inp.value = url; wa.href = "https://wa.me/" + foneWa(t) + "?text=" + encodeURIComponent(textoLink(o) + "\n" + url); })
    .catch(() => { inp.value = "Escolha o técnico responsável da obra."; });
  return h("div", { class: "card", style: "display:flex;flex-direction:column;gap:8px;border-color:var(--teal)" },
    h("b", { text: "Acesso da obra para " + (t ? t.nome : "o técnico") }),
    t ? h("div", { class: "row" }, h("span", { class: "meta", text: "Senha de acesso do técnico:" }), h("span", { class: "code", style: "font-size:20px", text: t.codigo })) : null,
    h("p", { class: "meta", style: "margin:0", text: "O técnico abre o link e entra com a senha dele. O link só abre para o responsável vinculado à obra." }),
    inp, h("div", { class: "row" },
      h("button", { class: "btn", onclick: async () => { try { await navigator.clipboard.writeText(textoLink(o) + "\n" + inp.value); toast("Link copiado"); } catch (e) { inp.focus(); inp.select(); toast("Selecione e copie o link"); } } }, "Copiar link"), wa)); }

/* ---------- mês a mês ---------- */
function calcMes(ano) {
  const linhas = MESES.map(() => ({ prev: 0, mob: 0, mobPrazo: 0, prazoMes: 0, conc: 0, noPrazo: 0, atraso: 0, atrasados: 0 }));
  const noAno = d => d && +d.slice(0, 4) === ano, mes = d => +d.slice(5, 7) - 1;
  for (const o of obras()) {
    if (noAno(o.previsaoMob)) linhas[mes(o.previsaoMob)].prev++;
    if (noAno(o.dataRealMob)) { const L = linhas[mes(o.dataRealMob)]; L.mob++; if (o.previsaoMob && o.dataRealMob <= o.previsaoMob) L.mobPrazo++; }
    for (const it of itensAtivos()) { const g = reg(o, it.codigo), s = g.status || "Pendente", sp = situacaoPrazo(g);
      if (noAno(g.prev) && s !== "Não aplicável") { linhas[mes(g.prev)].prazoMes++; if (sp === "Atrasado") linhas[mes(g.prev)].atrasados++; }
      if (s === "Concluído" && noAno(g.concl)) { const L = linhas[mes(g.concl)]; L.conc++; if (sp === "Concluído no prazo") L.noPrazo++; if (sp === "Concluído com atraso") L.atraso++; } } }
  const tot = linhas.reduce((a, l) => { for (const k in l) a[k] = (a[k] || 0) + l[k]; return a; }, {});
  return { linhas, tot }; }
function telaMes() {
  const anos = new Set([new Date().getFullYear()]);
  for (const o of obras()) { for (const d of [o.previsaoMob, o.dataRealMob]) if (d) anos.add(+d.slice(0, 4)); for (const g of Object.values(o.checklist || {})) for (const d of [g.prev, g.concl]) if (d) anos.add(+d.slice(0, 4)); }
  const { linhas, tot } = calcMes(UI.ano);
  const p = (a, b) => b ? pct(a / b) : "-";
  const row = (nome, l, cls) => h("tr", { class: cls || "" }, h("td", { text: nome }), ...[l.prev, l.mob, l.mobPrazo].map(v => h("td", { class: "n", text: v })),
    h("td", { class: "n", text: p(l.mobPrazo, l.mob) }), ...[l.prazoMes, l.conc, l.noPrazo, l.atraso].map(v => h("td", { class: "n", text: v })),
    h("td", { class: "n", text: p(l.noPrazo, l.noPrazo + l.atraso), style: l.noPrazo + l.atraso && l.noPrazo / (l.noPrazo + l.atraso) < .8 ? "color:var(--bad);font-weight:700" : "" }),
    h("td", { class: "n", text: l.atrasados, style: l.atrasados ? "color:var(--bad);font-weight:700" : "" }));
  const mesAtual = UI.ano === new Date().getFullYear() ? new Date().getMonth() : -1;
  const tabela = h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Mês", "Obras c/ mobilização prevista", "Obras mobilizadas", "Mobilizadas no prazo", "% mobil. no prazo", "Itens c/ prazo no mês", "Itens conferidos", "No prazo", "Com atraso", "% no prazo", "Atrasados em aberto"].map((t, i) => h("th", { class: i ? "n" : "", text: t, style: "white-space:normal;min-width:" + (i ? 78 : 90) + "px" })))),
    h("tbody", {}, linhas.map((l, i) => { const tr = row(MESES[i], l); if (i === mesAtual) tr.style.boxShadow = "inset 4px 0 0 var(--azul)"; return tr; }), row("TOTAL " + UI.ano, tot, "tot"))));
  return h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("div", { class: "bar" }, h("b", { text: "Ano" }), h("select", { class: "ano", id: "ano", onchange: e => { UI.ano = +e.target.value; render(); } }, [...anos].sort().map(a => h("option", { value: a, selected: a === UI.ano || null }, a))),
      h("span", { class: "grow" }), h("span", { class: "meta", text: "Conferidos contam pela data em que foram marcados; prazos pela data prevista; obras pela previsão e pela data real de mobilização." })),
    grafico(linhas), tabela); }
function grafico(linhas) {
  const W = 720, H = 220, L = 34, B = 26, T = 12, max = Math.max(4, ...linhas.map(l => l.noPrazo + l.atraso + (l.conc - l.noPrazo - l.atraso)));
  const passo = Math.ceil(max / 4), topo = passo * 4, bw = (W - L - 10) / 12;
  const y = v => T + (H - T - B) * (1 - v / topo);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Itens concluídos por mês"); svg.style.width = "100%"; svg.style.height = "auto";
  const el = (n, a, t) => { const e = document.createElementNS("http://www.w3.org/2000/svg", n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; svg.append(e); return e; };
  for (let i = 0; i <= 4; i++) { const v = passo * i; el("line", { x1: L, x2: W - 6, y1: y(v), y2: y(v), stroke: "currentColor", "stroke-opacity": .12 }); el("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, v); }
  linhas.forEach((l, i) => { const x = L + i * bw + bw * .18, w = bw * .64, sem = l.conc - l.noPrazo - l.atraso; let base = 0;
    for (const [v, cor] of [[l.noPrazo, "#0073A8"], [l.atraso, "#E07B39"], [sem, "#66D3CD"]]) { if (!v) continue; el("rect", { x, y: y(base + v), width: w, height: y(base) - y(base + v), fill: cor, rx: 2 }); base += v; }
    if (l.conc) el("text", { x: x + w / 2, y: y(l.conc) - 4, "text-anchor": "middle", style: "font-weight:700" }, l.conc);
    el("text", { x: x + w / 2, y: H - 8, "text-anchor": "middle" }, MESES[i].slice(0, 3)); });
  return h("div", { class: "card" }, h("b", { text: "Itens conferidos por mês" }),
    h("div", { class: "legenda" }, h("span", {}, h("i", { style: "background:#0073A8" }), "No prazo"), h("span", {}, h("i", { style: "background:#E07B39" }), "Com atraso"), h("span", {}, h("i", { style: "background:#66D3CD" }), "Sem data prevista")), svg); }

/* ---------- exportar consolidado ---------- */
function exportar() {
  const d = s => s ? new Date(s + "T12:00:00") : "";
  const O = [["ID Obra", "Obra / Empreendimento", "Cliente", "Cidade/UF", "Modelo / Tipo de ETE", "Responsável ECTAS", "Técnico responsável", "Contato do cliente", "Telefone / E-mail", "Data da verificação", "Previsão de mobilização", "Data real de mobilização", "Situação da obra", "Observações gerais", "% conferido", "Pendências p/ mobilização", "Itens atrasados", "Liberação p/ mobilização"]];
  const R = [["ID Obra", "Código item", "Categoria", "Item de verificação", "Etapa limite", "Status", "Parte responsável", "Responsável (nome)", "Data prevista", "Data conclusão", "Situação do prazo", "Evidência (link foto/doc)", "Observações / Pendências", "Última atualização", "Atualizado por"]];
  for (const o of obras()) { const r = resumo(o);
    O.push([o.id, o.nome, o.cliente, o.cidade, o.modelo, o.respEctas, o.tecnico, o.contato, o.telefone, d(o.dataVerificacao), d(o.previsaoMob), d(o.dataRealMob), o.situacao, o.obs, r.pct, r.pendMob, r.atras, r.lib.t].map(x => x == null ? "" : x));
    for (const it of itensAtivos()) { const g = reg(o, it.codigo);
      R.push([o.id, it.codigo, it.categoria, it.item, it.etapa, g.status || "", g.parte || "", g.resp || "", d(g.prev), d(g.concl), situacaoPrazo(g), g.link || "", g.obs || "", g.em ? new Date(g.em) : "", g.por || ""]); } }
  const { linhas, tot } = calcMes(UI.ano);
  const M = [["Mês", "Obras c/ mobilização prevista", "Obras mobilizadas", "Mobilizadas no prazo", "Itens c/ prazo no mês", "Itens concluídos", "Concluídos no prazo", "Concluídos com atraso", "Atrasados em aberto"]];
  linhas.forEach((l, i) => M.push([MESES[i], l.prev, l.mob, l.mobPrazo, l.prazoMes, l.conc, l.noPrazo, l.atraso, l.atrasados]));
  M.push(["TOTAL " + UI.ano, tot.prev, tot.mob, tot.mobPrazo, tot.prazoMes, tot.conc, tot.noPrazo, tot.atraso, tot.atrasados]);
  const wb = XLSX.utils.book_new(), opt = { cellDates: true, dateNF: "dd/mm/yyyy" };
  const w1 = XLSX.utils.aoa_to_sheet(O, opt), w2 = XLSX.utils.aoa_to_sheet(R, opt), w3 = XLSX.utils.aoa_to_sheet(M);
  w1["!cols"] = [12, 32, 24, 16, 22, 20, 20, 20, 22, 13, 13, 13, 18, 40, 11, 12, 11, 16].map(w => ({ wch: w })); w2["!cols"] = [12, 10, 13, 52, 13, 14, 13, 20, 12, 12, 20, 26, 42, 16, 18].map(w => ({ wch: w })); w3["!cols"] = [14, 14, 12, 12, 12, 12, 12, 12, 12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, w1, "OBRAS"); XLSX.utils.book_append_sheet(wb, w2, "REGISTRO"); XLSX.utils.book_append_sheet(wb, w3, "MES A MES " + UI.ano);
  XLSX.writeFile(wb, `Checklist_ECTAS_consolidado_${hoje()}.xlsx`, { cellDates: true }); }

/* ---------- início ---------- */
render();
if (CENTRAL.url && SENHA) carregarCentral();
