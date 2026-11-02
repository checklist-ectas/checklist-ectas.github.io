/* Painel do Supervisor - Checklist de Pré-Instalação ECTAS
   Só leitura. Lê a central (Google Apps Script) com a senha do supervisor,
   ou, enquanto a central não estiver ligada, os arquivos Excel enviados pela equipe. */
"use strict";
const CENTRAL = window.CENTRAL || { url: "" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ler = (k, p) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? p : v; } catch (e) { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
let D = ler("sup-dados", { obras: {}, itens: [], fonte: "", em: null });   // dados em uso
let SENHA = ler("sup-senha", ""), USUARIO = ler("sup-usuario", "");
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
  const r = await fetch(CENTRAL.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...corpo, usuario: USUARIO, senha: SENHA }) });
  const j = await r.json(); if (!j.ok) { const e = new Error(j.erro || "erro"); e.senha = j.erro === "senha"; throw e; } return j; }
async function subirLocais() {
  if (D.fonte === "central" || D.migrado) return;
  const tecs = D.tecnicos || [], obs = Object.values(D.obras || {});
  if (!tecs.length && !obs.length) return;
  toast("Enviando para a central as obras cadastradas neste navegador…");
  for (const t of tecs) await api({ acao: "supSalvarTecnico", tecnico: t });
  for (const o of obs) { const d = { ...o }; delete d.checklist; await api({ acao: "supSalvarObra", obra: d });
    const mud = Object.entries(o.checklist || {}).filter(([, g]) => g && g.status).map(([cod, g]) => ({ obra: o.id, cod, dados: g }));
    if (mud.length) await api({ acao: "supSalvarRespostas", mudancas: mud }); }
  D.migrado = true; gravar("sup-dados", D);
  toast(`${obs.length} obra(s) e ${tecs.length} técnico(s) enviados para a central.`); }
async function carregarCentral() {
  UI.carregando = true; UI.erro = ""; render();
  try { await subirLocais(); } catch (e) { if (e.senha) { SENHA = ""; gravar("sup-senha", ""); UI.erro = "Senha incorreta."; UI.carregando = false; render(); return; } }
  try { const r = await api({ acao: "supCarregar" }); const ob = {}; for (const o of r.obras || []) ob[o.id] = o;
    D = { obras: ob, itens: r.itens || [], tecnicos: r.tecnicos || [], fonte: "central", em: new Date().toISOString(), planilha: r.planilha || "", eu: r.eu || null, supervisores: r.supervisores || [], config: r.config || {} }; gravar("sup-dados", D);
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
        for (const [k, c] of [["dataVerificacao", "Data da verificação"], ["previsaoMob", "Previsão de mobilização"], ["dataRealMob", "Data real de mobilização"]]) if (dIso(r[c])) o[k] = dIso(r[c]);
        const env = r["Checklist enviado pelo técnico em"]; if (env && tIso(env) && (!o.enviadoCampo || tIso(env) > o.enviadoCampo)) { o.enviadoCampo = tIso(env); o.enviadoPor = o.tecnico || ""; o.analise = ""; } }
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
  $("#fonte").textContent = D.fonte === "central" ? (D.eu && D.eu.nome ? D.eu.nome + " · " : "") + "Dados da central · " + (D.em ? new Date(D.em).toLocaleString("pt-BR") : "")
    : D.fonte === "arquivos" ? "Dados salvos neste navegador" : "Checklist de Pré-Instalação";
  const ac = [];
  if (!CENTRAL.url || SENHA) ac.push(h("button", { class: "acao", onclick: () => { UI.form = "nova"; UI.obra = null; render(); scrollTo(0, 0); } }, "+ Nova obra"));
  if (CENTRAL.url && SENHA) ac.push(h("button", { class: "acao", onclick: carregarCentral }, UI.carregando ? "Atualizando…" : "Atualizar"));
  if (CENTRAL.url && SENHA) ac.push(h("button", { class: "acao", onclick: () => { UI.obra = null; UI.form = null; UI.aba = "acesso"; render(); scrollTo(0, 0); setTimeout(() => { const i = $("#a-nova"); if (i) i.focus(); }, 50); } }, "Minha senha"));
  if (CENTRAL.url && SENHA) ac.push(h("button", { class: "acao", onclick: () => { SENHA = ""; gravar("sup-senha", ""); D = { obras: {}, itens: [], fonte: "" }; gravar("sup-dados", D); UI.obra = null; UI.form = null; render(); } }, "Sair"));
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
  kids.push(h("div", { class: "tabs", role: "tablist" }, [["obras", "Obras"], ["pend", "Pendências" + (pendencias().length ? " " + pendencias().length : "")], ["mes", "Mês a mês"], ["tec", "Técnicos"], ["itens", "Itens"], ...(CENTRAL.url ? [["acesso", "Acesso"]] : [])].map(([k, t]) =>
    h("button", { role: "tab", "aria-selected": String(UI.aba === k), onclick: () => { UI.aba = k; render(); } }, t))));
  kids.push(UI.aba === "mes" ? telaMes() : UI.aba === "tec" ? telaTecnicos() : UI.aba === "itens" ? telaItens() : UI.aba === "pend" ? telaPendencias() : UI.aba === "acesso" ? telaAcesso() : telaObras());
  m.replaceChildren(...kids); }

function telaSenha(m) {
  const msg = h("p", { class: "meta", text: UI.erro });
  m.replaceChildren(h("form", { class: "card ent", onsubmit: async e => { e.preventDefault(); USUARIO = $("#s-usuario").value.trim(); SENHA = $("#s-senha").value; msg.textContent = "Conferindo…";
      try { await api({ acao: "supPing" }); gravar("sup-senha", SENHA); gravar("sup-usuario", USUARIO); UI.erro = ""; carregarCentral(); }
      catch (err) { SENHA = ""; msg.textContent = err.senha ? "Usuário ou senha incorretos." : "Sem conexão com a central."; } } },
    h("h2", { text: "Acesso do supervisor" }), h("p", { class: "meta", text: "Entre com o seu e-mail e a sua senha. O administrador deixa o e-mail em branco." }),
    h("label", { class: "f" }, "E-mail", h("input", { id: "s-usuario", type: "email", autocomplete: "username", value: USUARIO, placeholder: "seu.nome@ectas.com.br" })),
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
    c(lista.filter(o => statusCampo(o).k === "analisar").length, "Checklists para analisar", "mob"),
    c(lista.filter(o => !planejamento(o).liberada).length, "Aguardando autorização ao campo", "warn"),
    c(pendencias().filter(p => p.venc).length, "Pendências vencidas", "bad"),
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
      if (UI.filtro === "atras") return r.atras > 0; if (UI.filtro === "analisar") return statusCampo(o).k === "analisar"; return true; })
    .filter(({ o }) => !q || [o.id, o.nome, o.cliente, o.cidade, o.respEctas, o.tecnico].join(" ").toLowerCase().includes(q));
  const linhas = lista.map(({ o, r }) => { const falta = o.previsaoMob && !o.dataRealMob ? dias(o.previsaoMob, hoje()) : null;
    return h("tr", { class: "click", tabindex: "0", onclick: () => { UI.obra = o.id; render(); scrollTo(0, 0); }, onkeydown: e => { if (e.key === "Enter") { UI.obra = o.id; render(); } } },
      h("td", {}, h("span", { class: "code", text: o.id })), h("td", {}, h("b", { text: o.nome || "" }), h("div", { class: "meta", text: [o.cliente, o.cidade].filter(Boolean).join(" · ") })),
      h("td", {}, o.tecnico ? o.tecnico : h("span", { class: "pill p-bad", text: "sem técnico" })), h("td", { class: "n", text: o.dataRealMob ? "✓ " + fmt(o.dataRealMob) : fmt(o.previsaoMob) }),
      h("td", { class: "n", text: falta == null ? "" : (falta >= 0 ? falta + "d" : (-falta) + "d atrás"), style: falta != null && falta <= 7 && r.pendMob ? "color:var(--bad);font-weight:700" : "" }),
      (() => { const pl = planejamento(o); return h("td", {}, h("span", { class: "pill " + (pl.liberada ? "p-ok" : pl.completo ? "p-mob" : "p-warn"), text: pl.liberada ? "Autorizado ao campo" : pl.completo ? "Pronto p/ autorizar" : `Planej. ${pl.ok}/${pl.total}` })); })(),
      (() => { const st = statusCampo(o); return h("td", {}, st.k === "bloq" ? h("span", { class: "meta", text: "—" }) : h("span", { class: "pill " + st.c, text: st.t })); })(),
      h("td", { class: "n" }, pct(r.pct), h("span", { class: "mini" }, h("i", { style: "width:" + pct(r.pct) }))),
      h("td", { class: "n", text: r.pendMob, style: r.pendMob ? "color:var(--bad);font-weight:700" : "" }),
      h("td", { class: "n", text: r.atras, style: r.atras ? "color:var(--warn);font-weight:700" : "" }),
      h("td", {}, h("span", { class: "pill " + r.lib.c, text: r.lib.t }))); });
  return h("div", { style: "display:flex;flex-direction:column;gap:10px" },
    h("div", { class: "bar" }, h("input", { class: "busca grow", id: "busca", type: "search", placeholder: "Buscar obra, cliente, cidade ou responsável", value: UI.busca, style: "max-width:420px",
        oninput: e => { UI.busca = e.target.value; const pos = e.target.selectionStart; render(); const b = $("#busca"); b.focus(); b.setSelectionRange(pos, pos); } }),
      h("div", { class: "chips" }, [["ativas", "Ativas"], ["analisar", "Para analisar"], ["naolib", "Não liberadas"], ["lib", "Liberadas"], ["mob", "Mobilizadas"], ["atras", "Com atraso"], ["todas", "Todas"]].map(([k, t]) =>
        h("button", { class: "chip", "aria-pressed": String(UI.filtro === k), onclick: () => { UI.filtro = k; render(); } }, t)))),
    lista.length ? h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["ID", "Obra", "Técnico (campo)", "Mobilização", "Faltam", "Planejamento", "Checklist do campo", "Conferido", "Pend. mobil.", "Atrasados", "Liberação"].map((t, i) => h("th", { class: (i >= 3 && i <= 4) || (i >= 7 && i <= 9) ? "n" : "", text: t })))),
      h("tbody", {}, linhas))) : h("p", { class: "vazio", text: "Nenhuma obra neste filtro." })); }

function telaObra(o) {
  const r = resumo(o); const cats = [...new Set(itensAtivos().filter(i => !ehPlanejamento(i)).map(i => i.categoria))];
  const info = [["Técnico responsável (campo)", o.tecnico || "não definido"], ["Cliente", o.cliente], ["Cidade/UF", o.cidade], ["Modelo", o.modelo], ["Responsável ECTAS", o.respEctas], ["Contato do cliente", [o.contato, o.telefone].filter(Boolean).join(" · ")],
    ["Data da verificação", fmt(o.dataVerificacao)], ["Previsão de mobilização", fmt(o.previsaoMob)], ["Mobilização real", fmt(o.dataRealMob)], ["Situação", o.situacao], ["Observações", o.obs]].filter(x => x[1]);
  const corpo = [];
  const emAnalise = statusCampo(o).k === "analisar";
  for (const c of cats) { corpo.push(h("tr", {}, h("td", { colspan: "8", style: "background:var(--surface2);font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)", text: c })));
    for (const it of itensAtivos().filter(i => i.categoria === c)) { const g = reg(o, it.codigo), s = g.status || "Pendente", sp = situacaoPrazo(g);
      const cls = { "Concluído": "p-ok", "Em andamento": "p-bad", "Pendente": "p-bad", "Não aplicável": "p-na" }[g.status || ""] || "p-warn";
      const fotos = (g.fotos || []).filter(f => String(f).startsWith("d:"));
      const thumbs = fotos.length && D.fonte === "central" ? h("div", { class: "thumbs" }, fotos.map(f => { const ph = h("div", { class: "ph", text: "foto" }); carregarFoto(f.slice(2), ph); return ph; })) : null;
      corpo.push(h("tr", {}, h("td", {}, h("span", { class: "code", text: it.codigo })), h("td", {}, it.item, h("div", { class: "meta", text: "Até " + it.etapa })),
        h("td", {}, h("span", { class: "pill " + cls, text: ROTULO[g.status || ""] || g.status })), h("td", { text: [g.parte, g.resp].filter(Boolean).join(" · ") }),
        h("td", { class: "n", text: g.prev ? fmt(g.prev) : "" }, h("div", { class: "meta", text: sp === "Atrasado" ? "Atrasado " + dias(hoje(), g.prev) + "d" : sp === "Concluído com atraso" ? "com atraso" : "" })),
        h("td", { class: "n", text: fmt(g.concl) }),
        h("td", {}, g.obs || "", g.link ? h("div", {}, h("a", { href: g.link, target: "_blank", rel: "noopener", text: "evidência" })) : null, thumbs,
          g.por ? h("div", { class: "meta", text: "por " + g.por + (g.em ? " em " + new Date(g.em).toLocaleDateString("pt-BR") : "") }) : null),
        h("td", {}, emAnalise && !ehPlanejamento(it) ? h("button", { class: "btn sec", style: "padding:6px 10px;font-size:12px" + (g.rev === "corrigir" ? ";background:var(--bad);color:#fff;border-color:var(--bad)" : ""),
            onclick: () => salvarResposta(o, it.codigo, { rev: g.rev === "corrigir" ? "" : "corrigir", revObs: g.rev === "corrigir" ? "" : g.revObs || "" }) }, g.rev === "corrigir" ? "Corrigir ✓" : "Corrigir")
          : g.rev ? h("span", { class: "pill " + (g.rev === "aceito" || g.rev === "corrigido" ? "p-ok" : "p-bad"), text: { aceito: "Aceito", corrigir: "Corrigir", corrigido: "Corrigido" }[g.rev] }) : null))); } }
  return h("div", { style: "display:flex;flex-direction:column;gap:14px" },
    h("button", { class: "more", style: "align-self:flex-start", onclick: () => { UI.obra = null; UI.link = null; render(); } }, "‹ Voltar para as obras"),
    blocoLink(o),
    h("div", { class: "row" },
      h("button", { class: "btn wa", onclick: () => compartilharLink(o) }, CENTRAL.url ? "Acesso do técnico" : "Link da obra para o técnico"),
      h("button", { class: "btn sec", onclick: () => { UI.form = o.id; render(); scrollTo(0, 0); } }, "Editar dados da obra"),
      o.dataRealMob ? null : h("button", { class: "btn sec", onclick: () => salvarObra({ id: o.id, dataRealMob: hoje(), situacao: "Mobilizada" }, "Mobilização registrada") }, "Registrar mobilização hoje")),
    blocoAnalise(o),   // análise do checklist do campo vem antes do planejamento
    blocoPlanejamento(o),
    h("div", { class: "card", style: "display:flex;flex-direction:column;gap:12px" },
      h("div", { class: "row" }, h("span", { class: "code", text: o.id }), h("span", { class: "pill " + r.lib.c, text: r.lib.t })),
      h("h2", { style: "margin:0;font-size:20px", text: o.nome || "" }),
      h("div", { class: "prog" }, h("i", { style: "width:" + pct(r.pct) })),
      h("div", { class: "stats" }, [[pct(r.pct), "Conferido"], [r.conc + "/" + r.apl, "Itens"], [r.pendMob, "P/ mobilizar"], [r.atras, "Atrasados"]].map(([v, t]) => h("div", { class: "stat" }, h("b", { text: v }), h("span", { text: t })))),
      h("dl", { class: "det" }, info.map(([k, v]) => h("div", {}, h("dt", { text: k }), h("dd", { text: v }))))),
    h("b", { text: planejamento(o).liberada ? "Checklist do campo" : "Checklist do campo (bloqueado até a autorização do supervisor)" }),
    h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Cód.", "Item", "Status", "Quem resolve", "Prazo", "Conclusão", "Observações / evidências", "Análise"].map((t, i) => h("th", { class: i === 4 || i === 5 ? "n" : "", text: t })))), h("tbody", {}, corpo)))); }

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
          if (!await salvarTecnico({ nome, codigo: senha, telefone: String(d.novoFone || "").trim(), email: String(d.novoEmail || "").trim(), ativo: true }, "Responsável cadastrado")) { msg.textContent = UI.erro || "Não foi possível cadastrar o responsável."; return; }
          d.tecnico = nome; }
        if (!d.tecnico) { msg.textContent = "Escolha o responsável de campo."; return; }
        delete d.novoNome; delete d.novaSenha; delete d.novoFone; delete d.novoEmail;
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
      h("div", { class: "full row" }, h("button", { class: "btn", type: "submit" }, o ? "Salvar alterações" : "Cadastrar obra")), msg),
    o && CENTRAL.url ? h("div", { class: "card", style: "display:flex;flex-direction:column;gap:8px;border-color:var(--bad)" }, h("b", { text: "Excluir obra" }),
      h("p", { class: "meta", style: "margin:0", text: "Apaga a obra e todas as respostas do checklist da planilha. As fotos continuam na pasta da obra no Google Drive. Para só tirar da lista, mude a situação para Cancelada." }),
      (() => { const bt = h("button", { class: "btn sec", type: "button", style: "align-self:flex-start;color:var(--bad);border-color:var(--bad)" }, "Excluir esta obra");
        bt.onclick = async () => { if (!bt.classList.contains("arm")) { bt.classList.add("arm"); bt.textContent = "Toque de novo para excluir " + o.id; setTimeout(() => { if (bt.isConnected) { bt.classList.remove("arm"); bt.textContent = "Excluir esta obra"; } }, 4000); return; }
          try { await api({ acao: "supExcluirObra", id: o.id }); toast("Obra " + o.id + " excluída"); UI.form = null; UI.obra = null; await carregarCentral(); } catch (e) { UI.erro = e.message; render(); } };
        return bt; })()) : null); }

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

/* ---------- planejamento: preenchido pelo supervisor, liberado ao campo por autorização ---------- */
const semAc = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const ehPlanejamento = it => semAc(it.categoria) === "planejamento";
const itensPlanejamento = () => itensAtivos().filter(ehPlanejamento);
const PLAN_OK = ["Concluído", "Não aplicável"];
function planejamento(o) { const its = itensPlanejamento(); const ok = its.filter(it => PLAN_OK.includes(reg(o, it.codigo).status)).length;
  return { total: its.length, ok, completo: ok === its.length, liberada: !!o.liberadoCampo }; }
async function salvarResposta(o, cod, patch) {
  const atual = reg(o, cod);
  if (patch.concl && !atual.status && !patch.status) patch.status = "Concluído";   // data executada preenchida = item feito
  const dados = { ...atual, ...patch, em: new Date().toISOString(), por: (D.eu && D.eu.nome) || "Supervisor" };
  for (const k of Object.keys(dados)) if (dados[k] === undefined) delete dados[k];
  const antes = planejamento(o).completo;
  o.checklist = { ...(o.checklist || {}), [cod]: dados }; D.obras[o.id] = o; gravar("sup-dados", D);
  const p = planejamento(o);
  if (p.completo && !antes && !p.liberada) toast("Planejamento completo. Agora clique em “Enviar autorização para o campo”.");
  if (!p.completo && p.liberada) toast("Atenção: a obra já está autorizada para o campo. Se o planejamento mudou, cancele a autorização.");
  render();
  if (CENTRAL.url) { try { await api({ acao: "supSalvarRespostas", mudancas: [{ obra: o.id, cod, dados }] }); }
    catch (e) { UI.erro = e.senha ? "Senha do supervisor incorreta." : "Sem conexão com a central: a resposta não foi salva. Tente de novo."; render(); } } }
async function autorizarCampo(o, sim) {
  const ok = await salvarObra({ id: o.id, liberadoCampo: sim ? new Date().toISOString() : "" },
    sim ? "Autorização enviada: checklist liberado para " + (o.tecnico || "o técnico") : "Autorização cancelada: o campo voltou a ficar bloqueado");
  if (ok && sim && !CENTRAL.url) { UI.link = o.id; render(); }   // sem a central, o técnico recebe a obra pelo link
}
function blocoPlanejamento(o) {
  const its = itensPlanejamento(); if (!its.length) return null;
  const p = planejamento(o);
  const linha = it => { const g = reg(o, it.codigo), s = g.status || "";
    const bt = (v, txt, cor) => h("button", { class: "ck-b", style: s === v ? `background:var(--${cor});border-color:var(--${cor});color:#fff` : "", "aria-pressed": String(s === v),
      onclick: () => salvarResposta(o, it.codigo, s === v ? { status: "" } : { status: v, concl: v === "Concluído" ? (g.concl || hoje()) : (v === "Não aplicável" ? "" : g.concl || "") }) }, txt);
    const data = (k, lbl) => h("label", { class: "pl-data" }, h("span", { text: lbl }),
      h("input", { type: "date", value: g[k] || "", id: "pl-" + k + "-" + it.codigo, onchange: e => salvarResposta(o, it.codigo, { [k]: e.target.value }) }));
    const atras = s !== "Concluído" && s !== "Não aplicável" && g.prev && g.prev < hoje();
    return h("div", { class: "pl-linha" + (atras ? " pl-atras" : "") },
      h("div", { class: "ck-txt" }, h("span", { class: "ck-item", text: it.item }),
        h("input", { class: "busca", style: "padding:6px 10px;font-size:13px;margin-top:4px", placeholder: "Observação (opcional)", value: g.obs || "", onchange: e => salvarResposta(o, it.codigo, { obs: e.target.value }) })),
      data("prev", "Data planejada"), data("concl", "Data executada"),
      h("div", { class: "pl-bts" }, bt("Concluído", "Sim", "ok"), bt("Pendente", "Não", "bad"), bt("Não aplicável", "N/A", "na"))); };
  const rodape = p.liberada
    ? h("div", { class: "pl-rodape ok" }, h("b", { text: "✓ Autorização enviada ao campo em " + new Date(o.liberadoCampo).toLocaleString("pt-BR") }),
        h("span", { class: "meta", text: `${o.tecnico || "O técnico"} já pode preencher o checklist desta obra.` }),
        h("button", { class: "more", onclick: () => autorizarCampo(o, false) }, "Cancelar autorização"))
    : h("div", { class: "pl-rodape" },
        h("span", { class: "meta", text: p.completo ? "Planejamento completo. Envie a autorização para liberar o checklist ao técnico." : `Faltam ${p.total - p.ok} item(ns) com Sim ou N/A para liberar o envio.` }),
        h("button", { class: "btn", disabled: !p.completo || null, onclick: () => autorizarCampo(o, true) }, "Enviar autorização para o campo"));
  return h("div", { class: "card ck", style: "border-color:" + (p.liberada ? "var(--ok)" : "var(--warn)") },
    h("div", { class: "row", style: "padding:10px 0" }, h("b", { text: "Planejamento (preenchido pelo supervisor)" }), h("span", { class: "grow" }),
      h("span", { class: "pill " + (p.liberada ? "p-ok" : p.completo ? "p-mob" : "p-warn"), text: p.liberada ? "Autorizado para o campo" : p.completo ? "Pronto para autorizar" : `${p.ok} de ${p.total} · campo bloqueado` })),
    its.map(linha), rodape); }

/* ---------- checklist enviado pelo técnico: análise do supervisor, item a item ---------- */
function campoResumo(o) { const its = itensAtivos().filter(i => !ehPlanejamento(i)); let sim = 0, nao = 0, na = 0;
  for (const it of its) { const s = reg(o, it.codigo).status || ""; if (s === "Concluído") sim++; else if (s === "Não aplicável") na++; else if (s) nao++; }
  const total = its.length - na; return { sim, nao, na, total, vazio: total - sim - nao }; }
function statusCampo(o) {
  if (!planejamento(o).liberada) return { k: "bloq", t: "Aguardando autorização", c: "p-na" };
  if (o.enviadoCampo && o.analise === "Aprovado") return { k: "aprov", t: "Aprovado", c: "p-ok" };
  if (o.enviadoCampo) return { k: "analisar", t: "Preenchido · analisar", c: "p-mob" };
  const q = campoResumo(o);
  if (o.analise === "Devolvido") return { k: "devol", t: `Devolvido ao técnico · ${q.sim + q.nao}/${q.total}`, c: "p-bad" };
  return { k: "preench", t: `Em preenchimento ${q.sim + q.nao}/${q.total}`, c: "p-warn" }; }
const dataHora = t => t ? new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const camposDoCampo = () => itensAtivos().filter(i => !ehPlanejamento(i));
const marcadosCorrigir = o => camposDoCampo().filter(i => reg(o, i.codigo).rev === "corrigir");
async function analisar(o, decisao, obs) {
  const d = { id: o.id, analise: decisao, analiseEm: decisao ? new Date().toISOString() : "", analiseObs: obs || "" };
  if (decisao === "Devolvido") d.enviadoCampo = "";   // volta a ficar editável no app do técnico
  const ok = await salvarObra(d, decisao === "Aprovado" ? "Checklist aprovado" : decisao === "Devolvido" ? "Checklist devolvido ao técnico para correção" : "Análise reaberta");
  if (ok && decisao === "Devolvido" && !CENTRAL.url) { UI.link = o.id; render(); }
}
function revControle(o, it) {   // Aceitar / Corrigir um item durante a análise
  const g = reg(o, it.codigo), rv = g.rev || "";
  const bt = (v, txt, cor) => h("button", { class: "ck-b rev-b", style: rv === v ? `background:var(--${cor});border-color:var(--${cor});color:#fff` : "",
    onclick: () => salvarResposta(o, it.codigo, { rev: rv === v ? "" : v, revObs: rv === v ? "" : (v === "corrigir" ? g.revObs || "" : "") }) }, txt);
  return h("div", { class: "rev-ctl" }, h("div", { class: "rev-bts" }, bt("aceito", "Aceitar", "ok"), bt("corrigir", "Corrigir", "bad")),
    rv === "corrigir" ? h("input", { class: "busca", style: "padding:7px 10px;font-size:13px", placeholder: "O que o técnico deve corrigir", value: g.revObs || "",
      onchange: e => salvarResposta(o, it.codigo, { rev: "corrigir", revObs: e.target.value }) }) : null); }
function miniFotos(g) { const fotos = (g.fotos || []).filter(f => String(f).startsWith("d:"));
  return fotos.length && D.fonte === "central" ? h("div", { class: "thumbs" }, fotos.map(f => { const ph = h("div", { class: "ph", text: "foto" }); carregarFoto(f.slice(2), ph); return ph; })) : null; }
function blocoAnalise(o) {
  const st = statusCampo(o); if (st.k === "bloq") return null;
  const q = campoResumo(o), naos = camposDoCampo().filter(i => ["Pendente", "Em andamento"].includes(reg(o, i.codigo).status));
  const corrigidos = camposDoCampo().filter(i => reg(o, i.codigo).rev === "corrigido"), marcados = marcadosCorrigir(o);
  const cor = { analisar: "var(--azul)", aprov: "var(--ok)", devol: "var(--bad)", preench: "var(--warn)" }[st.k];
  const kids = [h("div", { class: "row" }, h("b", { text: "Checklist do campo" }), h("span", { class: "grow" }), h("span", { class: "pill " + st.c, text: st.t })),
    h("div", { class: "stats", style: "grid-template-columns:repeat(4,1fr)" }, [[q.sim, "Sim", "var(--ok)"], [q.nao, "Não", q.nao ? "var(--bad)" : ""], [q.vazio, "Sem resposta", q.vazio ? "var(--warn)" : ""], [q.na, "Não se aplica", ""]]
      .map(([v, t, c]) => h("div", { class: "stat" }, h("b", { text: v, style: c ? "color:" + c : "" }), h("span", { text: t }))))];
  if (st.k === "preench" || st.k === "devol") {
    kids.push(h("p", { class: "meta", style: "margin:0", text: (st.k === "devol" ? `Devolvido por ${o.analisePor || "supervisor"} em ${dataHora(o.analiseEm)}${o.analiseObs ? ": “" + o.analiseObs + "”" : ""}. ` : "")
      + `${o.tecnico || "O técnico"} está preenchendo. Quando ele tocar em “Enviar” no app, o checklist aparece aqui como preenchido para você analisar.` }));
    if (st.k === "devol" && marcados.length) kids.push(h("p", { class: "meta", style: "margin:0", text: "Itens devolvidos para corrigir: " + marcados.map(i => i.codigo).join(", ") })); }
  else {
    kids.push(h("p", { class: "meta", style: "margin:0", text: `Enviado por ${o.enviadoPor || o.tecnico || "técnico"} em ${dataHora(o.enviadoCampo)}.` + (st.k === "aprov" ? ` Aprovado por ${o.analisePor || "supervisor"} em ${dataHora(o.analiseEm)}.` : "") }));
    const linhaRev = it => { const g = reg(o, it.codigo);
      return h("div", { class: "rev-linha" },
        h("div", {}, h("b", { text: it.codigo + " " }), it.item,
          h("div", { class: "meta", text: [g.parte ? "Quem resolve: " + g.parte : "", g.prev ? "Prazo: " + fmt(g.prev) : "", g.obs].filter(Boolean).join(" · ") || "Sem observação" }), miniFotos(g)),
        st.k === "analisar" ? revControle(o, it) : (g.rev ? h("span", { class: "pill " + (g.rev === "aceito" ? "p-ok" : "p-bad"), text: g.rev === "aceito" ? "Aceito" : g.rev === "corrigido" ? "Corrigido" : "Corrigir" }) : null)); };
    if (corrigidos.length) kids.push(h("div", { class: "rev-box ok" }, h("b", { text: `${corrigidos.length} item(ns) corrigidos pelo técnico depois da devolução` }), corrigidos.map(linhaRev)));
    if (naos.length) kids.push(h("div", { class: "rev-box" }, h("b", { text: `${naos.length} item(ns) marcados como Não` }), naos.filter(i => !corrigidos.includes(i)).map(linhaRev)));
    if (st.k === "analisar") {
      const obs = h("textarea", { id: "an-obs", placeholder: "Comentário geral para o técnico", style: "min-height:56px" });
      const msg = h("span", { class: "meta" });
      kids.push(h("p", { class: "meta", style: "margin:0", text: "Marque cada item como Aceitar ou Corrigir. Para pedir correção de um item com Sim ou N/A, use o botão Corrigir na tabela da obra, mais abaixo." }),
        marcados.length ? h("div", { class: "notice erro", text: `${marcados.length} item(ns) marcados para corrigir: ${marcados.map(i => i.codigo).join(", ")}. Ao devolver, o técnico só poderá alterar esses itens.` }) : null,
        h("label", { class: "f" }, "Comentário da análise", obs),
        h("div", { class: "row" },
          h("button", { class: "btn", style: "background:var(--ok)", onclick: () => { if (marcados.length) { msg.textContent = "Há itens marcados para corrigir: devolva ao técnico ou desmarque-os antes de aprovar."; return; } analisar(o, "Aprovado", obs.value.trim()); } }, "Aprovar checklist"),
          h("button", { class: "btn sec", style: "color:var(--bad);border-color:var(--bad)", onclick: () => { if (!marcados.length && !obs.value.trim()) { msg.textContent = "Marque os itens para corrigir ou escreva o que o técnico precisa ajustar."; return; } analisar(o, "Devolvido", obs.value.trim()); } }, marcados.length ? `Devolver ${marcados.length} item(ns) para correção` : "Devolver ao técnico para correção"),
          msg)); }
    else { if (o.analiseObs) kids.push(h("p", { class: "meta", style: "margin:0", text: "Comentário: " + o.analiseObs }));
      kids.push(h("div", { class: "row" }, h("button", { class: "btn", onclick: () => pdfLiberacao(o) }, "PDF de liberação para mobilização"),
        h("button", { class: "more", onclick: () => analisar(o, "", "") }, "Reabrir análise"))); } }
  if (st.k !== "aprov") kids.push(h("button", { class: "more", style: "align-self:flex-start", onclick: () => pdfLiberacao(o) }, "Baixar PDF do checklist (prévia)"));
  return h("div", { class: "card", style: "display:flex;flex-direction:column;gap:10px;border-width:2px;border-color:" + cor }, ...kids); }

/* ---------- pendências: todos os "Não" das obras ativas ---------- */
function pendencias() { const out = [];
  for (const o of obras()) { if (encerrada(o)) continue;
    for (const it of itensAtivos()) { const g = reg(o, it.codigo); if (g.status !== "Pendente" && g.status !== "Em andamento") continue;
      if (!ehPlanejamento(it) && !planejamento(o).liberada) continue;
      out.push({ o, it, g, venc: !!(g.prev && g.prev < hoje()) }); } }
  return out.sort((a, b) => (a.g.prev || "9999").localeCompare(b.g.prev || "9999")); }
function telaPendencias() {
  const todas = pendencias(), f = UI.pend || (UI.pend = { parte: "todas", venc: false, q: "" });
  const lista = todas.filter(p => (f.parte === "todas" || (f.parte === "sem" ? !p.g.parte : p.g.parte === f.parte)) && (!f.venc || p.venc)
    && (!f.q || [p.o.id, p.o.nome, p.o.cliente, p.it.item, p.g.obs, p.o.tecnico].join(" ").toLowerCase().includes(f.q.toLowerCase())));
  const cnt = k => todas.filter(p => k === "sem" ? !p.g.parte : p.g.parte === k).length;
  const c = (n, t, cls) => h("div", { class: "kpi " + (cls || "") }, h("b", { text: n }), h("span", { text: t }));
  const exportarP = () => { const A = [["ID Obra", "Obra", "Cliente", "Técnico", "Código", "Categoria", "Item", "Quem resolve", "Prazo", "Vencida", "O que falta", "Fotos"]];
    for (const p of lista) A.push([p.o.id, p.o.nome || "", p.o.cliente || "", p.o.tecnico || "", p.it.codigo, p.it.categoria, p.it.item, p.g.parte || "", p.g.prev ? new Date(p.g.prev + "T12:00:00") : "", p.venc ? "Sim" : "Não", p.g.obs || "", (p.g.fotos || []).length]);
    const wb = XLSX.utils.book_new(), w = XLSX.utils.aoa_to_sheet(A, { cellDates: true, dateNF: "dd/mm/yyyy" }); w["!cols"] = [12, 28, 22, 18, 9, 13, 48, 13, 11, 8, 48, 6].map(x => ({ wch: x }));
    XLSX.utils.book_append_sheet(wb, w, "PENDENCIAS"); XLSX.writeFile(wb, `Pendencias_ECTAS_${hoje()}.xlsx`, { cellDates: true }); };
  return h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("div", { class: "kpis" }, c(todas.length, "Pendências abertas"), c(todas.filter(p => p.venc).length, "Com prazo vencido", "bad"), c(cnt("Cliente"), "Do cliente", "warn"), c(cnt("ECTAS"), "Da ECTAS", "mob"), c(cnt("Terceiro"), "De terceiros"), c(cnt("sem"), "Sem responsável", "bad")),
    h("div", { class: "bar" },
      h("input", { class: "busca grow", id: "busca-pend", type: "search", placeholder: "Buscar obra, item, cliente ou técnico", value: f.q, style: "max-width:380px",
        oninput: e => { f.q = e.target.value; const pos = e.target.selectionStart; render(); const b = $("#busca-pend"); b.focus(); b.setSelectionRange(pos, pos); } }),
      h("div", { class: "chips" }, [["todas", "Todas"], ["Cliente", "Cliente"], ["ECTAS", "ECTAS"], ["Terceiro", "Terceiro"], ["sem", "Sem responsável"]].map(([k, t]) =>
        h("button", { class: "chip", "aria-pressed": String(f.parte === k), onclick: () => { f.parte = k; render(); } }, t)),
        h("button", { class: "chip", "aria-pressed": String(f.venc), onclick: () => { f.venc = !f.venc; render(); } }, "Só vencidas")),
      h("button", { class: "btn sec", style: "padding:8px 12px;font-size:13px", onclick: exportarP }, "Exportar (Excel)")),
    lista.length ? h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Obra", "Item", "Quem resolve", "Prazo", "O que falta", "Fotos", "Técnico"].map((t, i) => h("th", { class: i === 3 || i === 5 ? "n" : "", text: t })))),
      h("tbody", {}, lista.map(p => h("tr", { class: "click", onclick: () => { UI.obra = p.o.id; render(); scrollTo(0, 0); } },
        h("td", {}, h("span", { class: "code", text: p.o.id }), h("div", { class: "meta", text: [p.o.nome, p.o.cliente].filter(Boolean).join(" · ") })),
        h("td", {}, h("b", { text: p.it.codigo + " " }), p.it.item, h("div", { class: "meta", text: p.it.categoria })),
        h("td", {}, p.g.parte ? h("span", { class: "pill " + (p.g.parte === "Cliente" ? "p-warn" : p.g.parte === "ECTAS" ? "p-mob" : "p-na"), text: p.g.parte }) : h("span", { class: "pill p-bad", text: "sem responsável" })),
        h("td", { class: "n", style: p.venc ? "color:var(--bad);font-weight:700" : "", text: p.g.prev ? fmt(p.g.prev) + (p.venc ? ` (${dias(hoje(), p.g.prev)}d)` : "") : "—" }),
        h("td", { text: p.g.obs || "" }), h("td", { class: "n", text: (p.g.fotos || []).length || "" }), h("td", { text: p.o.tecnico || "" }))))))
      : h("p", { class: "vazio", text: todas.length ? "Nenhuma pendência neste filtro." : "Nenhuma pendência aberta. Os itens marcados como Não pelo técnico aparecem aqui." })); }

/* campo para o supervisor digitar uma senha (de técnico ou de supervisor) */
function definirSenha(chave, min, max, salvar) {
  if (UI.editSenha !== chave) return h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px", onclick: () => { UI.editSenha = chave; render(); setTimeout(() => { const i = $("#ds-inp"); if (i) i.focus(); }, 30); } }, "Definir senha");
  const msg = h("span", { class: "meta", style: "color:var(--bad)" });
  const inp = h("input", { id: "ds-inp", class: "busca", style: "padding:6px 8px;font-size:13px;width:130px", autocomplete: "off", placeholder: max ? `${min} a ${max} números` : `mín. ${min} caracteres`,
    inputmode: max ? "numeric" : "text", maxlength: max ? String(max) : null });
  const ok = async () => { const v = inp.value.trim();
    if (max ? !new RegExp(`^\\d{${min},${max}}$`).test(v) : v.length < min) { msg.textContent = max ? `Use de ${min} a ${max} números.` : `Mínimo de ${min} caracteres.`; return; }
    UI.editSenha = null; await salvar(v); };
  inp.onkeydown = e => { if (e.key === "Enter") ok(); if (e.key === "Escape") { UI.editSenha = null; render(); } };
  return h("span", { class: "row", style: "gap:6px" }, inp, h("button", { class: "btn", style: "padding:7px 10px;font-size:12px", onclick: ok }, "Salvar"),
    h("button", { class: "more", onclick: () => { UI.editSenha = null; render(); } }, "Cancelar"), msg); }
/* ---------- acesso: minha senha, supervisores e avisos por e-mail ---------- */
function telaAcesso() {
  const eu = D.eu || { nome: "", admin: false };
  const m1 = h("span", { class: "meta" });
  const minha = h("form", { class: "card form", onsubmit: async e => { e.preventDefault();
      const n1 = $("#a-nova").value, n2 = $("#a-nova2").value;
      if (n1.length < 6) { m1.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }
      if (n1 !== n2) { m1.textContent = "As duas senhas não são iguais."; return; }
      m1.textContent = "Salvando…";
      try { await api({ acao: "supTrocarSenha", nova: n1 }); SENHA = n1; gravar("sup-senha", SENHA); m1.textContent = ""; toast("Senha trocada"); e.target.reset(); }
      catch (err) { m1.textContent = err.message === "senha" ? "Sessão expirada. Entre de novo." : err.message; } } },
    h("div", { class: "full", style: "font-weight:700", text: "Minha senha · " + (eu.nome || "") }),
    h("label", { class: "f" }, "Nova senha", h("input", { id: "a-nova", type: "password", autocomplete: "new-password", required: true, minlength: "6" })),
    h("label", { class: "f" }, "Repita a nova senha", h("input", { id: "a-nova2", type: "password", autocomplete: "new-password", required: true })),
    h("div", { class: "row full" }, h("button", { class: "btn", type: "submit" }, "Trocar minha senha"), m1),
    eu.mestre ? h("p", { class: "meta full", style: "margin:0", text: "Esta é a senha do administrador. Ela fica guardada nas configurações protegidas da central, fora do código." }) : null);
  const kids = [minha];
  {
    const m2 = h("span", { class: "meta" });
    const novaSenhaSup = () => Math.random().toString(36).slice(2, 6) + "-" + String(1000 + Math.floor(Math.random() * 9000));
    const salvarSup = async (s, aviso) => { try { await api({ acao: "supSalvarSupervisor", supervisor: s }); toast(aviso); await carregarCentral(); return true; } catch (e) { UI.erro = e.message; render(); return false; } };
    const form = h("form", { class: "card form", onsubmit: async e => { e.preventDefault();
        const s = { nome: $("#s-nome").value.trim(), email: $("#s-email").value.trim(), senha: $("#s-senha-n").value.trim(), admin: !!($("#s-admin") && $("#s-admin").checked), ativo: true };
        if (s.senha.length < 6) { m2.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }
        m2.textContent = "Salvando…";
        if (await salvarSup(s, "Supervisor cadastrado. Envie a ele o usuário e a senha.")) m2.textContent = ""; else m2.textContent = UI.erro; } },
      h("div", { class: "full", style: "font-weight:700", text: "Cadastrar supervisor" }),
      h("label", { class: "f" }, "Nome", h("input", { id: "s-nome", required: true })),
      h("label", { class: "f" }, "E-mail (usuário e avisos)", h("input", { id: "s-email", type: "email", required: true, autocomplete: "off" })),
      h("label", { class: "f" }, "Senha (digite ou use a sugerida, mínimo 6)", h("input", { id: "s-senha-n", required: true, value: novaSenhaSup(), minlength: "6", autocomplete: "off" })),
      eu.admin ? h("label", { class: "f", style: "flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-size:13.5px" }, h("input", { id: "s-admin", type: "checkbox" }), "Administrador (muda os avisos por e-mail e as contas de administrador)") : h("span"),
      h("div", { class: "row full" }, h("button", { class: "btn", type: "submit" }, "Cadastrar supervisor"), m2));
    const sups = (D.supervisores || []).slice().sort((a, b) => a.nome.localeCompare(b.nome));
    kids.push(h("b", { text: "Supervisores" }),
      h("p", { class: "meta", style: "margin:0", text: "Cadastre os supervisores e defina a senha de cada um. Eles entram com o próprio e-mail e senha e podem trocá-la depois em “Minha senha”. O nome fica registrado em quem autorizou, devolveu ou aprovou cada obra." }),
      form,
      sups.length ? h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Supervisor", "E-mail", "Perfil", ""].map(t => h("th", { text: t })))),
        h("tbody", {}, sups.map(s => h("tr", { style: s.ativo ? "" : "opacity:.55" }, h("td", {}, h("b", { text: s.nome })), h("td", { text: s.email }), h("td", { text: s.admin ? "Administrador" : "Supervisor" }),
          h("td", {}, (s.admin && !eu.admin) ? h("span", { class: "meta", text: "só o administrador altera" }) : h("div", { class: "row" },
            definirSenha("sup-" + s.nome, 6, null, async nova => { if (await salvarSup({ ...s, nomeAntigo: s.nome, senha: nova }, "Senha de " + s.nome + " definida")) { UI.senhaGerada = { nome: s.nome, senha: nova }; render(); } }),
            h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px", onclick: () => salvarSup({ ...s, nomeAntigo: s.nome, ativo: !s.ativo }, s.ativo ? "Supervisor desativado" : "Supervisor reativado") }, s.ativo ? "Desativar" : "Reativar")))))))) : null,
      UI.senhaGerada ? h("div", { class: "notice ok", text: `Nova senha de ${UI.senhaGerada.nome}: ${UI.senhaGerada.senha} (anote e envie a ele; ela não aparece de novo).` }) : null); }
  if (eu.admin) {
    const m3 = h("span", { class: "meta" });
    kids.push(h("b", { text: "Avisos por e-mail" }),
      h("div", { class: "card", style: "display:flex;flex-direction:column;gap:10px" },
        h("p", { class: "meta", style: "margin:0", text: "A central manda e-mail quando: o técnico envia um checklist (para os supervisores); a obra é autorizada, devolvida ou aprovada (para o técnico, se tiver e-mail); e todo dia às 7h, um resumo das obras que mobilizam em até 7 dias sem checklist aprovado e das pendências vencidas." }),
        h("label", { class: "f" }, "E-mails extras para os avisos dos supervisores (separados por vírgula)", h("input", { id: "c-emails", value: (D.config || {}).avisoEmails || "", placeholder: "gabriel.monteiro@ectas.com.br" })),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: async () => { m3.textContent = "Salvando…"; try { await api({ acao: "supSalvarConfig", config: { avisoEmails: $("#c-emails").value } }); m3.textContent = ""; toast("Avisos salvos"); await carregarCentral(); } catch (e) { m3.textContent = e.message; } } }, "Salvar"),
          h("button", { class: "btn sec", onclick: async () => { const para = ($("#c-emails").value.split(/[,;\s]+/).filter(Boolean)[0]) || ""; m3.textContent = "Enviando…";
            try { await api({ acao: "supTestarEmail", para }); m3.textContent = "E-mail de teste enviado para " + para + "."; } catch (e) { m3.textContent = e.message; } } }, "Enviar e-mail de teste"), m3))); }
  return h("div", { style: "display:flex;flex-direction:column;gap:12px;max-width:900px" }, ...kids); }

/* ---------- PDF de liberação para mobilização ---------- */
let logoSup = null;
const imgDims = src => new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = src; });
async function pdfLiberacao(o) {
  if (!window.jspdf) { toast("Aguarde o painel terminar de carregar."); return; }
  toast("Gerando o PDF…");
  if (!logoSup) { const b = await (await fetch("../logo.png")).blob(); logoSup = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); }
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210, M = 12, NAVY = [0, 43, 73], AZUL = [0, 115, 168], CINZA = [96, 96, 96], TXT = [29, 29, 27];
  const aprovado = o.enviadoCampo && o.analise === "Aprovado", q = campoResumo(o), pl = planejamento(o);
  let y = 0;
  const cab = () => { doc.addImage(logoSup, "PNG", M, 8, 34, 9); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text(aprovado ? "LIBERAÇÃO PARA MOBILIZAÇÃO" : "CHECKLIST DE PRÉ-INSTALAÇÃO", W - M, 12, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text(o.id + " · " + (o.nome || ""), W - M, 16.5, { align: "right" });
    doc.setDrawColor(102, 211, 205); doc.setLineWidth(0.8); doc.line(M, 20, W - M, 20); y = 26; doc.setTextColor(...TXT); };
  const quebra = alt => { if (y + alt > 284) { doc.addPage(); cab(); return true; } return false; };
  const titulo = t => { quebra(12); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...AZUL); doc.text(t.toUpperCase(), M, y); y += 2; doc.setDrawColor(...AZUL); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5; doc.setTextColor(...TXT); };
  const tabela = (cols, linhas, corCol) => {
    const cabT = () => { doc.setFillColor(...NAVY); doc.rect(M, y - 4, W - 2 * M, 6, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      let x = M; cols.forEach(c => { doc.text(c[0], x + 1, y); x += c[1]; }); y += 4; doc.setTextColor(...TXT); doc.setFont("helvetica", "normal"); };
    cabT();
    for (const l of linhas) { doc.setFontSize(8); const q2 = l.map((t, i) => doc.splitTextToSize(String(t == null ? "" : t), cols[i][1] - 2)); const alt = Math.max(...q2.map(z => z.length)) * 3.3 + 2;
      if (quebra(alt + 6)) cabT();
      let x = M; q2.forEach((z, i) => { if (corCol && corCol[0] === i) { const c2 = corCol[1](l[i]); doc.setTextColor(...c2); doc.setFont("helvetica", "bold"); } doc.text(z, x + 1, y + 2.4); doc.setTextColor(...TXT); doc.setFont("helvetica", "normal"); x += cols[i][1]; });
      y += alt; doc.setDrawColor(213, 222, 229); doc.setLineWidth(0.2); doc.line(M, y - 1, W - M, y - 1); } y += 3; };
  const rot = s => s === "Concluído" ? "Sim" : s === "Não aplicável" ? "N/A" : s ? "Não" : "—";
  const corResp = t => t === "Sim" ? [30, 123, 74] : t === "Não" ? [163, 18, 42] : [96, 96, 96];
  cab();
  // situação
  doc.setFillColor(...(aprovado ? [221, 243, 230] : [255, 240, 199])); doc.roundedRect(M, y - 4, W - 2 * M, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...(aprovado ? [30, 123, 74] : [138, 90, 0]));
  doc.text(aprovado ? "CHECKLIST APROVADO · OBRA LIBERADA PARA MOBILIZAÇÃO" : "DOCUMENTO DE CONFERÊNCIA · CHECKLIST AINDA NÃO APROVADO", M + 4, y + 3.5); y += 14; doc.setTextColor(...TXT);
  doc.setFontSize(9);
  const info = [["Obra", (o.id + " · " + (o.nome || ""))], ["Cliente", o.cliente], ["Cidade/UF", o.cidade], ["Modelo / tipo de ETE", o.modelo], ["Responsável ECTAS", o.respEctas], ["Contato do cliente", [o.contato, o.telefone].filter(Boolean).join(" · ")],
    ["Técnico de campo", o.tecnico], ["Previsão de mobilização", fmt(o.previsaoMob)], ["Autorizado ao campo", o.liberadoCampo ? dataHora(o.liberadoCampo) + (o.liberadoPor ? " por " + o.liberadoPor : "") : ""],
    ["Checklist enviado", o.enviadoCampo ? dataHora(o.enviadoCampo) + (o.enviadoPor ? " por " + o.enviadoPor : "") : "ainda não enviado"],
    ["Análise", o.analise ? o.analise + " em " + dataHora(o.analiseEm) + (o.analisePor ? " por " + o.analisePor : "") : "pendente"], ["Comentário da análise", o.analiseObs],
    ["Resultado", `${q.sim} Sim · ${q.nao} Não · ${q.na} N/A · ${q.vazio} sem resposta · Planejamento ${pl.ok}/${pl.total}`]];
  for (const [k, v] of info) { if (!v) continue; doc.setFont("helvetica", "bold"); doc.text(k + ":", M, y); doc.setFont("helvetica", "normal"); const t = doc.splitTextToSize(String(v), W - 2 * M - 46); quebra(t.length * 4.4); doc.text(t, M + 46, y); y += 4.4 * t.length; }
  y += 3;
  const pend = pendencias().filter(p => p.o.id === o.id);
  if (pend.length) { titulo(`Pendências (${pend.length})`);
    tabela([["Cód.", 15], ["Item", 62], ["Quem resolve", 24], ["Prazo", 18], ["O que falta", W - 2 * M - 119]], pend.map(p => [p.it.codigo, p.it.item, p.g.parte || "—", p.g.prev ? fmt(p.g.prev) + (p.venc ? " (vencido)" : "") : "—", p.g.obs || ""])); }
  const plan = itensPlanejamento();
  if (plan.length) { titulo("Planejamento (supervisor)");
    tabela([["Cód.", 15], ["Item", 76], ["Resp.", 13], ["Planejada", 19], ["Executada", 19], ["Observação", W - 2 * M - 142]], plan.map(it => { const g = reg(o, it.codigo); return [it.codigo, it.item, rot(g.status), fmt(g.prev), fmt(g.concl), g.obs || ""]; }), [2, corResp]); }
  titulo("Checklist do campo");
  const cats = [...new Set(camposDoCampo().map(i => i.categoria))];
  for (const c of cats) { quebra(14); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY); doc.text(c, M, y); y += 4.5; doc.setTextColor(...TXT);
    tabela([["Cód.", 15], ["Item", 92], ["Resp.", 13], ["Observação", W - 2 * M - 120]], camposDoCampo().filter(i => i.categoria === c).map(it => { const g = reg(o, it.codigo);
      return [it.codigo, it.item, rot(g.status), [g.parte ? "Resolve: " + g.parte : "", g.prev && g.status !== "Concluído" ? "Prazo " + fmt(g.prev) : "", g.obs].filter(Boolean).join(" · ")]; }), [2, corResp]); }
  // fotos das pendências
  const fotos = []; for (const p of pend) for (const f of (p.g.fotos || []).filter(x => String(x).startsWith("d:"))) fotos.push({ id: f.slice(2), leg: p.it.codigo + " · " + p.it.item });
  if (fotos.length && D.fonte === "central") { titulo("Fotos das pendências");
    const larg = (W - 2 * M - 6) / 2; let col = 0, altLinha = 0;
    for (const f of fotos.slice(0, 16)) {
      try { if (!cacheFoto[f.id]) cacheFoto[f.id] = api({ acao: "supFoto", id: f.id }).then(r => "data:image/jpeg;base64," + r.b64);
        const src = await cacheFoto[f.id], d = await imgDims(src); if (!d) continue;
        const alt = Math.min(larg * d.h / d.w, 80);
        if (col === 0 && quebra(alt + 8)) { }
        const x = M + col * (larg + 6), w2 = alt * d.w / d.h;
        doc.addImage(src, "JPEG", x, y, w2, alt); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(doc.splitTextToSize(f.leg, larg)[0], x, y + alt + 3.5); doc.setTextColor(...TXT);
        altLinha = Math.max(altLinha, alt + 7); col++;
        if (col === 2) { col = 0; y += altLinha; altLinha = 0; }
      } catch (e) { } }
    if (col) y += altLinha; }
  // assinatura do supervisor que analisou
  if (aprovado) { quebra(24); y += 10; doc.setDrawColor(...CINZA); doc.line(M, y, M + 80, y); doc.setFontSize(8); doc.text((o.analisePor || "Supervisor") + " · ECTAS Saneamento", M, y + 4); doc.text("Aprovado em " + dataHora(o.analiseEm), M, y + 8); }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...CINZA);
    doc.text("Gerado em " + new Date().toLocaleString("pt-BR") + ((D.eu && D.eu.nome) ? " por " + D.eu.nome : "") + " · ECTAS Saneamento", M, 292); doc.text(i + "/" + n, W - M, 292, { align: "right" }); }
  doc.save(`${aprovado ? "Liberacao" : "Checklist"} ${o.id} ${hoje()}.pdf`); }

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
      const nome = $("#t-nome").value.trim(), codigo = $("#t-cod").value.trim(), telefone = $("#t-fone").value.trim(), email = $("#t-email").value.trim();
      if (!nome) return; if (!/^\d{4,8}$/.test(codigo)) { msg.textContent = "A senha tem de 4 a 8 números."; return; }
      if (tecnicoDe(nome)) { msg.textContent = "Já existe um técnico com esse nome."; return; }
      if (await salvarTecnico({ nome, codigo, telefone, email, ativo: true }, "Técnico cadastrado")) { $("#t-nome").value = ""; $("#t-fone").value = ""; $("#t-email").value = ""; $("#t-cod").value = novoCodigo(); } } },
    h("div", { class: "full", style: "font-weight:700", text: "Cadastrar técnico de campo" }),
    h("label", { class: "f" }, "Nome", h("input", { id: "t-nome", required: true, autocomplete: "off" })),
    h("label", { class: "f" }, "Telefone (WhatsApp)", h("input", { id: "t-fone", inputmode: "tel", placeholder: "(47) 99999-0000" })),
    h("label", { class: "f" }, "E-mail (avisos de obra liberada, devolvida e aprovada)", h("input", { id: "t-email", type: "email", autocomplete: "off" })),
    h("label", { class: "f" }, "Senha de acesso (digite ou use a sugerida, 4 a 8 números)", h("input", { id: "t-cod", required: true, inputmode: "numeric", value: novoCodigo(), maxlength: "8", autocomplete: "off" })),
    h("div", { class: "row", style: "align-items:flex-end" }, h("button", { class: "btn", type: "submit" }, "Cadastrar técnico"), msg));
  const linhas = tecnicos().map(t => { const n = Object.values(D.obras).filter(o => o.tecnico === t.nome && !encerrada(o)).length;
    const txt = `Olá, ${t.nome}! Seu acesso ao Checklist de Pré-Instalação ECTAS:\n${APP_CAMPO}\nSenha de acesso: ${t.codigo}\nNão compartilhe esta senha.`;
    const exc = h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px;color:var(--bad);border-color:var(--bad)" }, "Excluir");
    exc.onclick = async () => { if (!exc.classList.contains("arm")) { exc.classList.add("arm"); exc.textContent = "Confirmar exclusão"; setTimeout(() => { if (exc.isConnected) { exc.classList.remove("arm"); exc.textContent = "Excluir"; } }, 4000); return; }
      try { await api({ acao: "supExcluirTecnico", nome: t.nome }); toast("Técnico excluído"); await carregarCentral(); } catch (e) { UI.erro = e.message; render(); } };
    return h("tr", { style: t.ativo === false ? "opacity:.55" : "" }, h("td", {}, h("b", { text: t.nome })), h("td", { text: t.telefone || "" }),
      h("td", {}, h("input", { class: "busca", type: "email", style: "padding:6px 8px;font-size:13px;min-width:180px", value: t.email || "", placeholder: "sem e-mail",
        onchange: e => salvarTecnico({ ...t, email: e.target.value.trim(), nomeAntigo: t.nome }, "E-mail salvo") })),
      h("td", { class: "n" }, h("span", { class: "code", text: t.codigo })), h("td", { class: "n", text: n }),
      h("td", {}, h("div", { class: "row" },
        h("a", { class: "btn wa", style: "padding:7px 10px;font-size:12px", href: "https://wa.me/" + foneWa(t) + "?text=" + encodeURIComponent(txt), target: "_blank", rel: "noopener" }, "Enviar acesso"),
        definirSenha("tec-" + t.nome, 4, 8, nova => salvarTecnico({ ...t, codigo: nova, nomeAntigo: t.nome }, "Senha de " + t.nome + " definida. Envie para o técnico.")),
        h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px", onclick: () => salvarTecnico({ ...t, codigo: novoCodigo(), nomeAntigo: t.nome }, "Nova senha gerada. Envie para o técnico.") }, "Gerar nova senha"),
        h("button", { class: "btn sec", style: "padding:7px 10px;font-size:12px", onclick: () => salvarTecnico({ ...t, ativo: t.ativo === false, nomeAntigo: t.nome }, t.ativo === false ? "Técnico reativado" : "Técnico desativado") }, t.ativo === false ? "Reativar" : "Desativar"),
        CENTRAL.url ? exc : null))); });
  return h("div", { style: "display:flex;flex-direction:column;gap:12px" },
    h("p", { class: "meta", style: "margin:0", text: "Cada técnico entra no app de campo com a senha dele e só vê as obras em que é o responsável. Também dá para cadastrar o responsável direto no cadastro da obra. Um técnico desativado perde o acesso." }),
    form,
    linhas.length ? h("div", { class: "tbl" }, h("table", {}, h("thead", {}, h("tr", {}, ["Técnico", "Telefone", "E-mail", "Senha atual", "Obras ativas", ""].map((t, i) => h("th", { class: i === 3 || i === 4 ? "n" : "", text: t })))), h("tbody", {}, linhas)))
      : h("p", { class: "vazio", text: "Nenhum técnico cadastrado ainda." })); }

function blocoResponsavel(v) {
  const ativos = tecnicos().filter(t => t.ativo !== false || t.nome === v.tecnico);
  const novo = !ativos.length;
  const caixa = h("div", { class: "full card", id: "novo-resp", style: "display:" + (novo ? "grid" : "none") + ";grid-template-columns:1fr 1fr;gap:10px;background:var(--surface2)" },
    h("div", { style: "grid-column:1/-1;font-weight:700", text: "Novo responsável de campo" }),
    h("label", { class: "f" }, "Nome do responsável", h("input", { id: "o-novoNome", name: "novoNome", autocomplete: "off" })),
    h("label", { class: "f" }, "Telefone (WhatsApp)", h("input", { id: "o-novoFone", name: "novoFone", inputmode: "tel", placeholder: "(47) 99999-0000" })),
    h("label", { class: "f" }, "E-mail (opcional)", h("input", { id: "o-novoEmail", name: "novoEmail", type: "email", autocomplete: "off" })),
    h("label", { class: "f" }, "Senha de acesso (digite ou use a sugerida, 4 a 8 números)", h("input", { id: "o-novaSenha", name: "novaSenha", inputmode: "numeric", maxlength: "8", value: novoCodigo(), autocomplete: "off" })),
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
  const campos = ["id", "nome", "cliente", "cidade", "modelo", "respEctas", "contato", "telefone", "dataVerificacao", "previsaoMob", "situacao", "obs", "tecnico", "liberadoCampo", "analise", "analiseEm", "analiseObs"];
  const dados = {}; for (const k of campos) if (o[k]) dados[k] = o[k];
  dados.itens = itensAtivos().map(i => [i.codigo, i.categoria, i.item, i.etapa, i.referencia || ""]);   // lista de checagem da planilha
  dados.checklist = {}; for (const it of itensPlanejamento()) { const g = reg(o, it.codigo); if (g.status) dados.checklist[it.codigo] = { status: g.status, obs: g.obs || "", em: g.em, por: "Supervisor" }; }
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
  const O = [["ID Obra", "Obra / Empreendimento", "Cliente", "Cidade/UF", "Modelo / Tipo de ETE", "Responsável ECTAS", "Técnico responsável", "Contato do cliente", "Telefone / E-mail", "Data da verificação", "Previsão de mobilização", "Data real de mobilização", "Situação da obra", "Observações gerais", "% conferido", "Pendências p/ mobilização", "Itens atrasados", "Liberação p/ mobilização", "Checklist do campo", "Enviado pelo técnico em", "Análise do supervisor", "Comentário da análise"]];
  const R = [["ID Obra", "Código item", "Categoria", "Item de verificação", "Etapa limite", "Status", "Parte responsável", "Responsável (nome)", "Data prevista", "Data conclusão", "Situação do prazo", "Evidência (link foto/doc)", "Observações / Pendências", "Última atualização", "Atualizado por"]];
  for (const o of obras()) { const r = resumo(o);
    O.push([o.id, o.nome, o.cliente, o.cidade, o.modelo, o.respEctas, o.tecnico, o.contato, o.telefone, d(o.dataVerificacao), d(o.previsaoMob), d(o.dataRealMob), o.situacao, o.obs, r.pct, r.pendMob, r.atras, r.lib.t, statusCampo(o).t, o.enviadoCampo ? new Date(o.enviadoCampo) : "", o.analise || "", o.analiseObs || ""].map(x => x == null ? "" : x));
    for (const it of itensAtivos()) { const g = reg(o, it.codigo);
      R.push([o.id, it.codigo, it.categoria, it.item, it.etapa, g.status || "", g.parte || "", g.resp || "", d(g.prev), d(g.concl), situacaoPrazo(g), g.link || "", g.obs || "", g.em ? new Date(g.em) : "", g.por || ""]); } }
  const { linhas, tot } = calcMes(UI.ano);
  const M = [["Mês", "Obras c/ mobilização prevista", "Obras mobilizadas", "Mobilizadas no prazo", "Itens c/ prazo no mês", "Itens concluídos", "Concluídos no prazo", "Concluídos com atraso", "Atrasados em aberto"]];
  linhas.forEach((l, i) => M.push([MESES[i], l.prev, l.mob, l.mobPrazo, l.prazoMes, l.conc, l.noPrazo, l.atraso, l.atrasados]));
  M.push(["TOTAL " + UI.ano, tot.prev, tot.mob, tot.mobPrazo, tot.prazoMes, tot.conc, tot.noPrazo, tot.atraso, tot.atrasados]);
  const wb = XLSX.utils.book_new(), opt = { cellDates: true, dateNF: "dd/mm/yyyy" };
  const w1 = XLSX.utils.aoa_to_sheet(O, opt), w2 = XLSX.utils.aoa_to_sheet(R, opt), w3 = XLSX.utils.aoa_to_sheet(M);
  w1["!cols"] = [12, 32, 24, 16, 22, 20, 20, 20, 22, 13, 13, 13, 18, 40, 11, 12, 11, 16, 22, 18, 14, 40].map(w => ({ wch: w })); w2["!cols"] = [12, 10, 13, 52, 13, 14, 13, 20, 12, 12, 20, 26, 42, 16, 18].map(w => ({ wch: w })); w3["!cols"] = [14, 14, 12, 12, 12, 12, 12, 12, 12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, w1, "OBRAS"); XLSX.utils.book_append_sheet(wb, w2, "REGISTRO"); XLSX.utils.book_append_sheet(wb, w3, "MES A MES " + UI.ano);
  XLSX.writeFile(wb, `Checklist_ECTAS_consolidado_${hoje()}.xlsx`, { cellDates: true }); }

/* ---------- início ---------- */
render();
if (CENTRAL.url && SENHA) carregarCentral();
