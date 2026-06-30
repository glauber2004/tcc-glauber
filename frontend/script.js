/* ============================================================
   SENTIMENTRADAR — script.js  v4
   Fontes: Reddit (backend), Bluesky (browser direto), Web RSS (backend)
============================================================ */

/* ── Globals ── */
let chartDonut = null, chartBar = null, chartLine = null;
let todosOsPosts = [], postsFiltrados = [];
let paginaAtual = 1;
const POSTS_POR_PAGINA = 10;

// Paginação independente da tela de Detalhamento por Fonte
let postsDetalheFonte = [];   // todos os posts da fonte atualmente aberta
let fonteDetalheAtual = null; // nome da fonte aberta ('youtube', 'reddit', etc.)
let paginaAtualDetalhe = 1;
const POSTS_POR_PAGINA_DETALHE = 50;

// Dados separados por fonte
let dadosFontes = { reddit: [], bluesky: [], web: [], youtube: [] };

const POSITIVOS = ["bom","ótimo","excelente","incrível","maravilhoso","perfeito","gostei","amei","top","fantástico","feliz","sucesso","melhor","recomendo"];
const NEGATIVOS = ["ruim","morreu","derrota","péssimo","horrível","terrível","odio","problema","crise","lixo","decepcionante","triste","fracasso","pior","não recomendo"];

/* ── Tema ── */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const nxt = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nxt);
  localStorage.setItem('sr-theme', nxt);
  atualizarCoresGraficos();
}
function carregarTheme() {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('sr-theme') || 'dark');
}
function atualizarCoresGraficos() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = isDark ? '#8ba3c7' : '#475569';
  const gc = isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)';
  [chartBar, chartLine].forEach(c => {
    if (!c) return;
    c.options.scales.x.ticks.color = tc; c.options.scales.y.ticks.color = tc;
    c.options.scales.x.grid.color  = gc; c.options.scales.y.grid.color  = gc;
    c.update();
  });
}
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    tick:   isDark ? '#8ba3c7' : '#475569',
    grid:   isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)',
    border: isDark ? '#182033' : '#ffffff',
  };
}

/* ── Tópicos dinâmicos ── */
const TOPICOS_EXEMPLOS = {
  tec:   { id:'exemplo-tec',   termos:['Inteligência Artificial','GPT-5','Apple Intelligence','Google Gemini','Samsung Galaxy'] },
  ent:   { id:'exemplo-ent',   termos:['Netflix','Stranger Things','Oscar 2025','Squid Game','Marvel'] },
  games: { id:'exemplo-games', termos:['Fortnite','GTA 6','Minecraft','eSports','Call of Duty'] },
  pol:   { id:'exemplo-pol',   termos:['Eleições','Lula','Trump','Congresso','Parlamento Europeu'] },
  eco:   { id:'exemplo-eco',   termos:['Bitcoin','Dólar','Inflação','IBOVESPA','Criptomoedas'] },
};
function carregarExemplosDinamicos() {
  const seed = new Date().getDate() + new Date().getMonth() * 31;
  Object.entries(TOPICOS_EXEMPLOS).forEach(([,cfg], i) => {
    const el = document.getElementById(cfg.id);
    if (el) el.textContent = cfg.termos[(seed + i*3) % cfg.termos.length];
  });
}
function pesquisarTopico(termo) {
  document.getElementById('searchInput').value = termo;
  document.getElementById('searchInput2').value = '';
  mostrarTela('tela-busca');
  setTimeout(buscar, 150);
}

/* ── Navegação ── */
function mostrarTela(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}
function voltarBusca() { mostrarTela('tela-busca'); }

/* ============================================================
   BUSCA — orquestra 3 fontes em paralelo
============================================================ */
async function buscar() {
  const termo  = document.getElementById("searchInput").value.trim();
  const extra  = document.getElementById("searchInput2")?.value.trim() || "";
  const inicio = document.getElementById("dataInicio").value;
  const fim    = document.getElementById("dataFim").value;
  const filtro = document.getElementById("filtro").value;
  if (!termo) return;

  mostrarTela("tela-loading");
  setLoadingStatus('loading','loading','loading');

  try {
    // ── Dispara as 4 fontes em paralelo ──────────────────────────
    const [redditResult, blueskyResult, webResult, youtubeResult] = await Promise.allSettled([
      buscarReddit(termo, extra, inicio, fim, filtro),
      buscarBluesky(termo),
      buscarWeb(termo),
      buscarYoutube(termo),
    ]);

    const postsReddit  = redditResult.status  === 'fulfilled' ? redditResult.value  : [];
    const postsBluesky = blueskyResult.status === 'fulfilled' ? blueskyResult.value : [];
    const postsWeb     = webResult.status     === 'fulfilled' ? webResult.value     : [];
    const postsYoutube = youtubeResult.status === 'fulfilled' ? youtubeResult.value : [];

    if (redditResult.status  === 'rejected') console.warn('[Reddit]',  redditResult.reason);
    if (blueskyResult.status === 'rejected') console.warn('[Bluesky]', blueskyResult.reason);
    if (webResult.status     === 'rejected') console.warn('[Web]',     webResult.reason);
    if (youtubeResult.status === 'rejected') console.warn('[YouTube]', youtubeResult.reason);

    setLoadingStatus(
      redditResult.status  === 'fulfilled' ? 'ok' : 'err',
      blueskyResult.status === 'fulfilled' ? 'ok' : 'err',
      webResult.status     === 'fulfilled' ? 'ok' : 'err',
      youtubeResult.status === 'fulfilled' ? 'ok' : 'err',
    );

    // Guarda por fonte
    dadosFontes.reddit  = postsReddit;
    dadosFontes.bluesky = postsBluesky;
    dadosFontes.web     = postsWeb;
    dadosFontes.youtube = postsYoutube;

    todosOsPosts = [...postsReddit, ...postsBluesky, ...postsWeb, ...postsYoutube];

    renderizarResultados(termo, extra);
    mostrarTela("tela-resultados");

  } catch (err) {
    console.error(err);
    alert("Erro ao buscar dados. Verifique se o servidor está rodando.");
    mostrarTela("tela-busca");
  }
}

function setLoadingStatus(reddit, bluesky, web, youtube) {
  const el = document.getElementById('loading-fontes');
  if (!el) return;
  const ic = { loading:'⏳', ok:'✅', err:'⚠️' };
  el.innerHTML = `<span>${ic[reddit]} Reddit</span><span>${ic[bluesky]} Bluesky</span><span>${ic[web]} Web/Blogs</span><span>${ic[youtube||'loading']} YouTube</span>`;
}

/* ── Fonte: Reddit (backend) ── */
async function buscarReddit(termo, extra, inicio, fim, filtro) {
  const url = `http://localhost:3000/api/buscar?q=${encodeURIComponent(termo)}&extra=${encodeURIComponent(extra)}&inicio=${inicio}&fim=${fim}&filtro=${filtro}`;
  const r = await fetch(url);
  const d = await r.json();
  return (d.posts || []).map(p => ({ ...p, fonte: 'reddit' }));
}

/* ── Fonte: Bluesky (via servidor) ──
   O backend já faz toda a paginação (até esgotar o cursor ou o teto de
   segurança), busca os replies de cada post via getPostThread, e aplica
   o sentiment.js completo tanto nos posts quanto nos comentários. */
async function buscarBluesky(query) {
  const inicio = document.getElementById("dataInicio").value;
  const fim    = document.getElementById("dataFim").value;

  const params = new URLSearchParams({ q: query });
  if (inicio) params.set('since', inicio);
  if (fim)    params.set('until', fim);

  const resp = await fetch(
    `http://localhost:3000/bluesky?${params.toString()}`,
    { headers: { 'Accept': 'application/json' } }
  );

  if (!resp.ok) throw new Error(`Bluesky HTTP ${resp.status}`);
  const data = await resp.json();

  // O backend já retorna tudo formatado (texto, sentimento, score, tipo, etc.)
  return (data.posts || []).map(p => ({ ...p, fonte: 'bluesky' }));
}

/* ── Fonte: Web/RSS (backend) ── */
async function buscarWeb(termo) {
  const inicio = document.getElementById("dataInicio").value;
  const fim    = document.getElementById("dataFim").value;
  const params = new URLSearchParams({ q: termo });
  if (inicio) params.set('inicio', inicio);
  if (fim)    params.set('fim',    fim);
  const url = `http://localhost:3000/api/web?${params.toString()}`;
  const r = await fetch(url);
  const d = await r.json();
  return (d.posts || []).map(p => ({ ...p, fonte: 'web' }));
}


/* ── Fonte: YouTube (via servidor) ── */
async function buscarYoutube(termo) {
  const inicio = document.getElementById("dataInicio").value;
  const fim    = document.getElementById("dataFim").value;
  const filtro = document.getElementById("filtro").value;

  const params = new URLSearchParams({ q: termo });
  if (inicio) params.set("inicio", inicio);
  if (fim)    params.set("fim",    fim);
  if (filtro) params.set("filtro", filtro);

  const resp = await fetch(`http://localhost:3000/youtube/buscar?${params.toString()}`);
  if (!resp.ok) throw new Error(`YouTube HTTP ${resp.status}`);

  const data  = await resp.json();
  const posts = data.posts || [];

  // O backend já calcula sentimento/score com o sentiment.js completo —
  // não reanalisar aqui para não sobrescrever com um léxico mais simples.
  return posts.map(p => ({ ...p, fonte: "youtube" }));
}

/* ============================================================
   RENDERIZAÇÃO PRINCIPAL
============================================================ */
function renderizarResultados(termo, extra) {
  const total = todosOsPosts.length;
  const label = extra ? `"${termo}" + "${extra}"` : `"${termo}"`;
  document.getElementById("results-term").textContent  = label;
  document.getElementById("results-count").textContent = `${total} publicações analisadas`;

  const nPos = todosOsPosts.filter(p => obterClasse(p.sentimento) === 'pos').length;
  const nNeu = todosOsPosts.filter(p => obterClasse(p.sentimento) === 'neu').length;
  const nNeg = todosOsPosts.filter(p => obterClasse(p.sentimento) === 'neg').length;
  const pPos = total ? Math.round(nPos/total*100) : 0;
  const pNeu = total ? Math.round(nNeu/total*100) : 0;
  const pNeg = total ? Math.round(nNeg/total*100) : 0;

  renderizarVeredicto(nPos, nNeu, nNeg);
  renderizarHighlightCards(nPos, nNeu, nNeg, pPos, pNeu, pNeg, total);
  renderizarResumoFontes();          // ← novo resumo por rede
  renderizarTermometro(todosOsPosts);
  renderizarDonut(nPos, nNeu, nNeg, pPos, pNeu, pNeg);
  renderizarBarra(nPos, nNeu, nNeg);
  renderizarLinha(todosOsPosts);
  renderizarIntensidade(nPos, nNeu, nNeg, pPos, pNeu, pNeg);
  renderizarMetricas(nPos, nNeu, nNeg, pPos, pNeg);
  renderizarWordCloud(todosOsPosts);
  renderizarRankingPerfis(todosOsPosts);
  renderizarEmocoesBoard(todosOsPosts);
  filtrarPosts('todos', document.querySelector('.filter-btn.active'));
}

/* ── Veredicto ── */
function renderizarVeredicto(nPos, nNeu, nNeg) {
  const el = document.getElementById("hero-verdict");
  let icon, cls, txt;
  if      (nPos >= nNeg && nPos >= nNeu) { icon='😊'; cls='pos'; txt='Opinião positiva'; }
  else if (nNeg >= nPos && nNeg >= nNeu) { icon='😡'; cls='neg'; txt='Opinião negativa'; }
  else                                    { icon='😐'; cls='neu'; txt='Opinião neutra'; }
  el.innerHTML = `<div class="verdict-icon">${icon}</div><div class="verdict-label">Veredicto geral</div><div class="verdict-text ${cls}">${txt}</div>`;
}

/* ── Highlight cards ── */
function renderizarHighlightCards(nPos, nNeu, nNeg, pPos, pNeu, pNeg, total) {
  document.getElementById("sentiment-highlight-row").innerHTML = `
    <div class="highlight-card pos">
      <div class="hc-icon">😊</div><div class="hc-label">Publicações positivas</div>
      <div class="hc-value pos">${pPos}<small>%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill pos" style="width:${pPos}%"></div></div>
      <div class="hc-sub">${nPos} de ${total} publicações</div>
    </div>
    <div class="highlight-card neu">
      <div class="hc-icon">😐</div><div class="hc-label">Publicações neutras</div>
      <div class="hc-value neu">${pNeu}<small>%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill neu" style="width:${pNeu}%"></div></div>
      <div class="hc-sub">${nNeu} de ${total} publicações</div>
    </div>
    <div class="highlight-card neg">
      <div class="hc-icon">😡</div><div class="hc-label">Publicações negativas</div>
      <div class="hc-value neg">${pNeg}<small>%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill neg" style="width:${pNeg}%"></div></div>
      <div class="hc-sub">${nNeg} de ${total} publicações</div>
    </div>`;
}

/* ============================================================
   RESUMO POR FONTE  (novo — aparece antes do termômetro)
============================================================ */
function renderizarResumoFontes() {
  const el = document.getElementById('resumo-fontes');
  if (!el) return;

  const config = [
    { key:'reddit',  icon:'🔴', nome:'Reddit',          cor:'#ff6314' },
    { key:'bluesky', icon:'🦋', nome:'Bluesky',         cor:'#3b9eff' },
    { key:'web',     icon:'🌐', nome:'Web / Notícias',  cor:'#818cf8' },
    { key:'youtube', icon:'▶️', nome:'YouTube',         cor:'#ff0000' },
  ];

  el.innerHTML = config.map(({ key, icon, nome, cor }) => {
    const posts = dadosFontes[key] || [];
    const total = posts.length;
    const cmt   = posts.reduce((a,p) => a + (p.comentarios||0), 0);
    const likes = posts.reduce((a,p) => a + (p.upvotes||0), 0);

    const nPos = posts.filter(p => obterClasse(p.sentimento) === 'pos').length;
    const nNeg = posts.filter(p => obterClasse(p.sentimento) === 'neg').length;
    const pPos = total ? Math.round(nPos/total*100) : 0;
    const pNeg = total ? Math.round(nNeg/total*100) : 0;

    // Linha de stats específica por fonte
    let statsHtml = '';
    if (key === 'reddit') {
      statsHtml = `<span>📋 ${total} publicações</span><span>💬 ${cmt.toLocaleString('pt-BR')} comentários</span><span>⬆️ ${likes.toLocaleString('pt-BR')} upvotes</span>`;
    } else if (key === 'bluesky') {
      const rep = posts.reduce((a,p) => a + (p.reposts||0), 0);
      statsHtml = `<span>📋 ${total} publicações</span><span>💬 ${cmt.toLocaleString('pt-BR')} replies</span><span>❤️ ${likes.toLocaleString('pt-BR')} likes</span><span>🔁 ${rep.toLocaleString('pt-BR')} reposts</span>`;
    } else if (key === 'youtube') {
      const videos = posts.filter(p => p.tipo === 'video').length;
      const cmts   = posts.filter(p => p.tipo === 'comentario').length;
      statsHtml = `<span>🎬 ${videos} vídeos</span><span>💬 ${cmts} comentários analisados</span><span>⬆️ ${likes.toLocaleString('pt-BR')} likes</span>`;
    } else {
      statsHtml = `<span>📋 ${total} artigos</span><span>📰 via RSS público</span>`;
    }

    return `
    <div class="resumo-fonte-card">
      <div class="rfc-header">
        <div class="rfc-rede">
          <span class="rfc-icon">${icon}</span>
          <span class="rfc-nome" style="color:${cor}">${nome}</span>
        </div>
        <button class="btn-detalhar" onclick="abrirDetalheFonte('${key}')">
          🔍 Mostrar detalhamento
        </button>
      </div>
      <div class="rfc-stats">${statsHtml}</div>
      <div class="rfc-bar-wrap">
        <div class="rfc-bar-bg">
          <div class="rfc-bar-pos" style="width:${pPos}%" title="${pPos}% positivo"></div>
          <div class="rfc-bar-neg" style="width:${pNeg}%" title="${pNeg}% negativo"></div>
        </div>
        <span class="rfc-bar-label">
          <span class="pos-txt">😊 ${pPos}%</span>
          <span class="neg-txt">😡 ${pNeg}%</span>
        </span>
      </div>
      ${total === 0 ? '<div class="rfc-sem-dados">Nenhum dado coletado desta fonte</div>' : ''}
    </div>`;
  }).join('');
}

/* ============================================================
   TELA DE DETALHAMENTO POR FONTE  (nova tela completa)
============================================================ */
// Gráficos do detalhamento
let dChartDonut = null, dChartBar = null, dChartLine = null;

function abrirDetalheFonte(fonte) {
  const posts = dadosFontes[fonte] || [];
  const nomes = { reddit:'🔴 Reddit', bluesky:'🦋 Bluesky', web:'🌐 Web / Notícias', youtube:'▶️ YouTube' };

  document.getElementById('detalhe-fonte-titulo').textContent = nomes[fonte];
  document.getElementById('detalhe-fonte-count').textContent  = `${posts.length} publicações coletadas`;

  // Renderiza todos os blocos analíticos para essa fonte
  renderizarDetalheConteudo(posts, fonte);

  mostrarTela('tela-detalhe-fonte');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fecharDetalheFonte() {
  mostrarTela('tela-resultados');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderizarDetalheConteudo(posts, fonte) {
  const total = posts.length || 1;
  const nPos = posts.filter(p => obterClasse(p.sentimento) === 'pos').length;
  const nNeu = posts.filter(p => obterClasse(p.sentimento) === 'neu').length;
  const nNeg = posts.filter(p => obterClasse(p.sentimento) === 'neg').length;
  const pPos = Math.round(nPos/total*100);
  const pNeu = Math.round(nNeu/total*100);
  const pNeg = Math.round(nNeg/total*100);

  // ─ Stats específicas por fonte
  const elStats = document.getElementById('detalhe-fonte-stats');
  let statsHtml = '';
  if (fonte === 'reddit') {
    const cmt  = posts.reduce((a,p) => a+(p.comentarios||0), 0);
    const ups  = posts.reduce((a,p) => a+(p.upvotes||0), 0);
    const subs = [...new Set(posts.map(p=>p.subreddit).filter(Boolean))].slice(0,6);
    statsHtml = `
      <div class="ds-stat-row">
        <div class="ds-stat"><span>📋</span><strong>${posts.length}</strong><small>publicações</small></div>
        <div class="ds-stat"><span>💬</span><strong>${cmt.toLocaleString('pt-BR')}</strong><small>comentários</small></div>
        <div class="ds-stat"><span>⬆️</span><strong>${ups.toLocaleString('pt-BR')}</strong><small>upvotes</small></div>
        <div class="ds-stat"><span>🗂️</span><strong>${subs.length}</strong><small>subreddits</small></div>
      </div>
      ${subs.length ? `<div class="ds-subs">Subreddits: ${subs.map(s=>`<span class="sub-tag">r/${s}</span>`).join('')}</div>` : ''}`;
  } else if (fonte === 'bluesky') {
    const postsBase = posts.filter(p => p.tipo === 'post');
    const comentariosBsky = posts.filter(p => p.tipo === 'comentario');
    const rep   = postsBase.reduce((a,p) => a+(p.reposts||0), 0);
    const likes = postsBase.reduce((a,p) => a+(p.upvotes||0), 0);
    statsHtml = `
      <div class="ds-stat-row">
        <div class="ds-stat"><span>📋</span><strong>${postsBase.length}</strong><small>publicações</small></div>
        <div class="ds-stat"><span>❤️</span><strong>${likes.toLocaleString('pt-BR')}</strong><small>likes</small></div>
        <div class="ds-stat"><span>💬</span><strong>${comentariosBsky.length.toLocaleString('pt-BR')}</strong><small>comentários analisados</small></div>
        <div class="ds-stat"><span>🔁</span><strong>${rep.toLocaleString('pt-BR')}</strong><small>reposts</small></div>
      </div>`;
  } else if (fonte === 'youtube') {
    const videos = posts.filter(p => p.tipo === 'video').length;
    const cmts   = posts.filter(p => p.tipo === 'comentario').length;
    const likes  = posts.reduce((a,p) => a+(p.upvotes||0), 0);
    const canais = [...new Set(posts.map(p=>p.canal).filter(Boolean))].slice(0,6);
    const canaisHtml = canais.length ? '<div class="ds-subs">Canais: ' + canais.map(c=>'<span class="sub-tag">'+escapar(c)+'</span>').join('') + '</div>' : '';
    statsHtml = `
      <div class="ds-stat-row">
        <div class="ds-stat"><span>🎬</span><strong>${videos}</strong><small>vídeos</small></div>
        <div class="ds-stat"><span>💬</span><strong>${cmts}</strong><small>comentários</small></div>
        <div class="ds-stat"><span>⬆️</span><strong>${likes.toLocaleString('pt-BR')}</strong><small>likes</small></div>
        <div class="ds-stat"><span>📺</span><strong>${canais.length}</strong><small>canais</small></div>
      </div>
      ${canaisHtml}`;
  } else {
    const fontes = [...new Set(posts.map(p=>p.autor).filter(Boolean))].slice(0,8);
    statsHtml = `
      <div class="ds-stat-row">
        <div class="ds-stat"><span>📰</span><strong>${posts.length}</strong><small>artigos</small></div>
        <div class="ds-stat"><span>🗞️</span><strong>${fontes.length}</strong><small>fontes distintas</small></div>
      </div>
      ${fontes.length ? `<div class="ds-subs">Fontes: ${fontes.map(f=>`<span class="sub-tag">${escapar(f)}</span>`).join('')}</div>` : ''}`;
  }
  elStats.innerHTML = statsHtml;

  // ─ Highlight cards
  document.getElementById('detalhe-fonte-highlights').innerHTML = `
    <div class="highlight-card pos">
      <div class="hc-icon">😊</div><div class="hc-label">Publicações positivas</div>
      <div class="hc-value pos">${pPos}<small>%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill pos" style="width:${pPos}%"></div></div>
      <div class="hc-sub">${nPos} de ${posts.length}</div>
    </div>
    <div class="highlight-card neu">
      <div class="hc-icon">😐</div><div class="hc-label">Publicações neutras</div>
      <div class="hc-value neu">${pNeu}<small>%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill neu" style="width:${pNeu}%"></div></div>
      <div class="hc-sub">${nNeu} de ${posts.length}</div>
    </div>
    <div class="highlight-card neg">
      <div class="hc-icon">😡</div><div class="hc-label">Publicações negativas</div>
      <div class="hc-value neg">${pNeg}<small>%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill neg" style="width:${pNeg}%"></div></div>
      <div class="hc-sub">${nNeg} de ${posts.length}</div>
    </div>`;

  // ─ Termômetro
  renderizarTermometroEl(posts,
    document.getElementById('d-thermo-value'),
    document.getElementById('d-thermo-desc'),
    document.getElementById('d-thermo-needle'));

  // ─ Donut
  const ctxD = document.getElementById('d-chartDonut').getContext('2d');
  if (dChartDonut) dChartDonut.destroy();
  const { border } = getChartColors();
  dChartDonut = new Chart(ctxD, {
    type: 'doughnut',
    data: { labels:['Positivo','Neutro','Negativo'], datasets:[{ data:[nPos,nNeu,nNeg], backgroundColor:['#22c55e','#475569','#ef4444'], borderColor:border, borderWidth:3 }] },
    options: { cutout:'70%', plugins:{legend:{display:false}}, animation:{animateRotate:true,duration:800} }
  });
  const maior = Math.max(nPos,nNeu,nNeg);
  document.getElementById('d-donut-center').innerHTML = `<span style="font-size:1.4rem">${nPos===maior?'😊':nNeg===maior?'😡':'😐'}</span><span class="donut-sub" style="margin-top:4px">${nPos===maior?'Positivo':nNeg===maior?'Negativo':'Neutro'}</span>`;
  document.getElementById('d-donut-legend').innerHTML = [
    {label:'Positivos',pct:pPos,n:nPos,color:'#22c55e'},
    {label:'Neutros',  pct:pNeu,n:nNeu,color:'#475569'},
    {label:'Negativos',pct:pNeg,n:nNeg,color:'#ef4444'},
  ].map(i=>`<div class="legend-item"><div class="legend-dot" style="background:${i.color}"></div><span>${i.label}</span><span class="legend-count">${i.n} posts</span><span class="legend-pct">${i.pct}%</span></div>`).join('');

  // ─ Barra
  const ctxB = document.getElementById('d-chartBar').getContext('2d');
  if (dChartBar) dChartBar.destroy();
  const { tick, grid } = getChartColors();
  dChartBar = new Chart(ctxB, {
    type:'bar',
    data:{ labels:['😊 Positivo','😐 Neutro','😡 Negativo'], datasets:[{ data:[nPos,nNeu,nNeg], backgroundColor:['rgba(34,197,94,.75)','rgba(71,85,105,.75)','rgba(239,68,68,.75)'], borderColor:['#22c55e','#475569','#ef4444'], borderWidth:2, borderRadius:8, borderSkipped:false }] },
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:grid},ticks:{color:tick}}, y:{grid:{color:grid},ticks:{color:tick},beginAtZero:true} }, animation:{duration:900} }
  });

  // ─ Linha do tempo
  const porDia = {};
  posts.forEach(p => {
    const d = new Date(p.dataPost).toISOString().slice(0,10);
    if (!porDia[d]) porDia[d] = {pos:0,neu:0,neg:0};
    porDia[d][obterClasse(p.sentimento)]++;
  });
  const dias = Object.keys(porDia).sort();
  const ctxL = document.getElementById('d-chartLine').getContext('2d');
  if (dChartLine) dChartLine.destroy();
  if (dias.length) {
    dChartLine = new Chart(ctxL, {
      type:'line',
      data:{
        labels: dias.map(d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})),
        datasets:[
          { label:'😊 Positivo', data:dias.map(d=>porDia[d].pos), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.08)', tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#22c55e' },
          { label:'😐 Neutro',   data:dias.map(d=>porDia[d].neu), borderColor:'#64748b', backgroundColor:'rgba(100,116,139,.06)', tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#64748b' },
          { label:'😡 Negativo', data:dias.map(d=>porDia[d].neg), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.08)', tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#ef4444' },
        ]
      },
      options:{ responsive:true, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:true,labels:{color:tick,font:{size:12},boxWidth:14}}}, scales:{ x:{grid:{color:grid},ticks:{color:tick,maxTicksLimit:10}}, y:{grid:{color:grid},ticks:{color:tick},beginAtZero:true} }, animation:{duration:1000} }
    });
  }

  // ─ Intensidade
  setTimeout(() => {
    document.getElementById('d-bar-pos').style.width = pPos+'%';
    document.getElementById('d-bar-neu').style.width = pNeu+'%';
    document.getElementById('d-bar-neg').style.width = pNeg+'%';
  }, 200);
  document.getElementById('d-pct-pos').textContent = pPos+'%';
  document.getElementById('d-pct-neu').textContent = pNeu+'%';
  document.getElementById('d-pct-neg').textContent = pNeg+'%';
  document.getElementById('d-sub-pos').textContent = nPos+' publicações';
  document.getElementById('d-sub-neu').textContent = nNeu+' publicações';
  document.getElementById('d-sub-neg').textContent = nNeg+' publicações';

  // ─ Métricas detalhadas
  const maxCmt = posts.length ? Math.max(...posts.map(p=>p.comentarios||0)) : 0;
  const mediaScore = posts.length ? (posts.reduce((a,p)=>a+(p.score||0),0)/posts.length).toFixed(2) : 0;
  const interacoes = posts.reduce((a,p)=>a+(p.comentarios||0)+(p.upvotes||0),0);
  const alcance = Math.round(interacoes * 3.2);
  document.getElementById('d-metrics-grid').innerHTML = [
    { icon:'📋', label:'Total de publicações', value:posts.length, sub:'coletadas e analisadas', accent:'blue-accent' },
    { icon:'💬', label:'Total de comentários', value:posts.reduce((a,p)=>a+(p.comentarios||0),0).toLocaleString('pt-BR'), sub:'soma de todas as interações', accent:'blue-accent' },
    { icon:'🔥', label:'Máx. comentários', value:maxCmt, sub:'em uma publicação', accent:'blue-accent' },
    { icon:'👥', label:'Pessoas impactadas', value:interacoes.toLocaleString('pt-BR'), sub:'comentários + curtidas', accent:'blue-accent' },
    { icon:'🌐', label:'Alcance estimado', value:alcance.toLocaleString('pt-BR'), sub:'visualizações potenciais', accent:'blue-accent' },
    { icon:'😊', label:'Positivas', value:`${pPos}%`, sub:`${nPos} posts`, accent:'pos-accent' },
    { icon:'😡', label:'Negativas', value:`${pNeg}%`, sub:`${nNeg} posts`, accent:'neg-accent' },
    { icon:'📊', label:'Score médio', value:mediaScore>0?'+'+mediaScore:mediaScore, sub:'índice de sentimento', accent: mediaScore>0?'pos-accent':mediaScore<0?'neg-accent':'blue-accent' },
  ].map(m=>`<div class="metric-card ${m.accent}"><div class="metric-icon">${m.icon}</div><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div><div class="metric-sub">${m.sub}</div></div>`).join('');

  // ─ Wordcloud
  const stopwords = new Set(['de','a','o','e','em','que','do','da','no','na','um','uma','para','com','se','por','mais','mas','como','seu','sua','os','as','dos','das','pelo','pela','também','ou','aos','nas','nos','foi','esse','essa','são','bem','já','sobre','isso','quando','então','pode','há','só','até','essa','está','ser','ter','não','lá','eu','me','te','ele','ela','nós','eles','você']);
  const freq = {};
  posts.forEach(p => {
    ((p.texto||'')+' '+(p.descricao||'')).toLowerCase().replace(/[^\wáéíóúãõâêîôûàèìòùç\s]/g,'').split(/\s+/).forEach(w => {
      if (w.length>3 && !stopwords.has(w)) freq[w]=(freq[w]||0)+1;
    });
  });
  const palavras = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,40);
  const maxF = palavras[0]?.[1]||1;
  document.getElementById('d-wordcloud').innerHTML = palavras.map(([w,c])=>{
    const t=c/maxF, sz=0.72+t*1.5;
    const ip=POSITIVOS.some(p=>w.includes(p)), in_=NEGATIVOS.some(n=>w.includes(n));
    const col=ip?`rgba(74,222,128,${0.5+t*0.5})`:in_?`rgba(248,113,113,${0.5+t*0.5})`:`rgba(139,163,199,${0.3+t*0.5})`;
    const bg=ip?'rgba(74,222,128,.08)':in_?'rgba(248,113,113,.08)':'rgba(255,255,255,.04)';
    return `<span class="wc-word" style="font-size:${sz}rem;color:${col};background:${bg}" title="${c}x">${w}</span>`;
  }).join('');

  // ─ Emoções
  renderizarEmocoesBoardEl(posts, document.getElementById('d-emocoes-board'));

  // ─ Posts (paginados, 50 por página — agrupados por vídeo no caso do YouTube)
  postsDetalheFonte = posts;
  fonteDetalheAtual = fonte;
  paginaAtualDetalhe = 1;
  renderizarPaginaDetalhe();
}

/* ── Termômetro genérico (reutilizável) ── */
function renderizarTermometroEl(posts, elVal, elDesc, elNeedle) {
  if (!posts.length || !elVal) return;
  const media = posts.reduce((a,p)=>a+(p.score||0),0)/posts.length;
  const norm  = Math.max(-2,Math.min(2,media));
  const idx   = Math.round(norm*50);
  const pct   = ((norm+2)/4)*100;
  elVal.textContent = (idx>=0?'+':'')+idx;
  if (idx>10)       { elVal.className='thermo-number pos'; elDesc.textContent='Predominantemente positivo'; }
  else if (idx<-10) { elVal.className='thermo-number neg'; elDesc.textContent='Predominantemente negativo'; }
  else              { elVal.className='thermo-number neu'; elDesc.textContent='Equilibrado / Neutro'; }
  setTimeout(()=>{ if(elNeedle) elNeedle.style.left=`${pct}%`; }, 300);
}

/* ── Termômetro da tela principal ── */
function renderizarTermometro(posts) {
  renderizarTermometroEl(posts,
    document.getElementById('thermo-value'),
    document.getElementById('thermo-desc'),
    document.getElementById('thermo-needle'));
}

/* ── Donut (tela principal) ── */
function renderizarDonut(nPos, nNeu, nNeg, pPos, pNeu, pNeg) {
  const { border } = getChartColors();
  const ctx = document.getElementById("chartDonut").getContext("2d");
  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:['Positivo','Neutro','Negativo'], datasets:[{ data:[nPos,nNeu,nNeg], backgroundColor:['#22c55e','#475569','#ef4444'], borderColor:border, borderWidth:3, hoverBorderWidth:4 }] },
    options:{ cutout:'70%', plugins:{legend:{display:false}}, animation:{animateRotate:true,duration:800} }
  });
  const maior = Math.max(nPos,nNeu,nNeg);
  document.getElementById("donut-center").innerHTML = `<span style="font-size:1.4rem">${nPos===maior?'😊':nNeg===maior?'😡':'😐'}</span><span class="donut-sub" style="margin-top:4px">${nPos===maior?'Positivo':nNeg===maior?'Negativo':'Neutro'}</span>`;
  document.getElementById("donut-legend").innerHTML = [
    {label:'Positivos',pct:pPos,n:nPos,color:'#22c55e'},
    {label:'Neutros',  pct:pNeu,n:nNeu,color:'#475569'},
    {label:'Negativos',pct:pNeg,n:nNeg,color:'#ef4444'},
  ].map(i=>`<div class="legend-item"><div class="legend-dot" style="background:${i.color}"></div><span>${i.label}</span><span class="legend-count">${i.n} posts</span><span class="legend-pct">${i.pct}%</span></div>`).join('');
}

/* ── Barra (tela principal) ── */
function renderizarBarra(nPos, nNeu, nNeg) {
  const { tick, grid } = getChartColors();
  const ctx = document.getElementById("chartBar").getContext("2d");
  if (chartBar) chartBar.destroy();
  chartBar = new Chart(ctx, {
    type:'bar',
    data:{ labels:['😊 Positivo','😐 Neutro','😡 Negativo'], datasets:[{ data:[nPos,nNeu,nNeg], backgroundColor:['rgba(34,197,94,.75)','rgba(71,85,105,.75)','rgba(239,68,68,.75)'], borderColor:['#22c55e','#475569','#ef4444'], borderWidth:2, borderRadius:8, borderSkipped:false }] },
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:grid},ticks:{color:tick}}, y:{grid:{color:grid},ticks:{color:tick},beginAtZero:true} }, animation:{duration:900} }
  });
}

/* ── Linha (tela principal) ── */
function renderizarLinha(posts) {
  const porDia = {};
  posts.forEach(p => {
    const d = new Date(p.dataPost).toISOString().slice(0,10);
    if (!porDia[d]) porDia[d]={pos:0,neu:0,neg:0};
    porDia[d][obterClasse(p.sentimento)]++;
  });
  const dias = Object.keys(porDia).sort();
  if (!dias.length) return;
  const { tick, grid } = getChartColors();
  const ctx = document.getElementById("chartLine").getContext("2d");
  if (chartLine) chartLine.destroy();
  chartLine = new Chart(ctx, {
    type:'line',
    data:{ labels:dias.map(d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})),
      datasets:[
        { label:'😊 Positivo', data:dias.map(d=>porDia[d].pos), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.08)', pointBackgroundColor:'#22c55e', tension:.4, fill:true, pointRadius:4 },
        { label:'😐 Neutro',   data:dias.map(d=>porDia[d].neu), borderColor:'#64748b', backgroundColor:'rgba(100,116,139,.06)', pointBackgroundColor:'#64748b', tension:.4, fill:true, pointRadius:4 },
        { label:'😡 Negativo', data:dias.map(d=>porDia[d].neg), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.08)', pointBackgroundColor:'#ef4444', tension:.4, fill:true, pointRadius:4 },
      ]
    },
    options:{ responsive:true, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:true,labels:{color:tick,font:{size:12},boxWidth:14,borderRadius:4}}}, scales:{ x:{grid:{color:grid},ticks:{color:tick,maxTicksLimit:10}}, y:{grid:{color:grid},ticks:{color:tick},beginAtZero:true} }, animation:{duration:1000} }
  });
}

/* ── Intensidade (tela principal) ── */
function renderizarIntensidade(nPos, nNeu, nNeg, pPos, pNeu, pNeg) {
  setTimeout(()=>{
    document.getElementById("bar-pos").style.width=pPos+'%';
    document.getElementById("bar-neu").style.width=pNeu+'%';
    document.getElementById("bar-neg").style.width=pNeg+'%';
  },200);
  document.getElementById("pct-pos").textContent=pPos+'%';
  document.getElementById("pct-neu").textContent=pNeu+'%';
  document.getElementById("pct-neg").textContent=pNeg+'%';
  document.getElementById("sub-pos").textContent=nPos+' publicações';
  document.getElementById("sub-neu").textContent=nNeu+' publicações';
  document.getElementById("sub-neg").textContent=nNeg+' publicações';
}

/* ── Métricas (tela principal) ── */
function renderizarMetricas(nPos, nNeu, nNeg, pPos, pNeg) {
  const posts = todosOsPosts;
  const total = posts.length;
  const media = total ? (posts.reduce((a,p)=>a+(p.comentarios||0),0)/total).toFixed(2) : 0;
  const maxCmt = total ? Math.max(...posts.map(p=>p.comentarios||0)) : 0;
  const mediaScore = total ? (posts.reduce((a,p)=>a+(p.score||0),0)/total).toFixed(2) : 0;
  const inter = posts.reduce((a,p)=>a+(p.comentarios||0)+(p.upvotes||0),0);
  const alcance = Math.round(inter*3.2);
  document.getElementById("metrics-grid").innerHTML = [
    { icon:'📋', label:'Total de publicações', value:total, sub:'coletadas e analisadas', accent:'blue-accent' },
    { icon:'💬', label:'Média de comentários', value:media, sub:'por publicação', accent:'blue-accent' },
    { icon:'🔥', label:'Máx. comentários', value:maxCmt, sub:'em uma publicação', accent:'blue-accent' },
    { icon:'👥', label:'Pessoas impactadas', value:inter.toLocaleString('pt-BR'), sub:'comentários + curtidas', accent:'blue-accent' },
    { icon:'🌐', label:'Alcance estimado', value:alcance.toLocaleString('pt-BR'), sub:'visualizações potenciais', accent:'blue-accent' },
    { icon:'😊', label:'Publicações positivas', value:`${pPos}%`, sub:`${nPos} posts`, accent:'pos-accent' },
    { icon:'😡', label:'Publicações negativas', value:`${pNeg}%`, sub:`${nNeg} posts`, accent:'neg-accent' },
    { icon:'📊', label:'Score médio', value:mediaScore>0?'+'+mediaScore:mediaScore, sub:'índice de sentimento', accent:mediaScore>0?'pos-accent':mediaScore<0?'neg-accent':'blue-accent' },
  ].map(m=>`<div class="metric-card ${m.accent}"><div class="metric-icon">${m.icon}</div><div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div><div class="metric-sub">${m.sub}</div></div>`).join('');
}

/* ── Wordcloud (tela principal) ── */
function renderizarWordCloud(posts) {
  const stopwords = new Set(['de','a','o','e','em','que','do','da','no','na','um','uma','para','com','se','por','mais','mas','como','seu','sua','os','as','dos','das','pelo','pela','também','ou','aos','nas','nos','foi','esse','essa','são','bem','já','sobre','isso','quando','então','pode','há','só','até','essa','está','ser','ter','não','lá','eu','me','te','ele','ela','nós','eles','você']);
  const freq={};
  posts.forEach(p=>{
    ((p.texto||'')+' '+(p.descricao||'')).toLowerCase().replace(/[^\wáéíóúãõâêîôûàèìòùç\s]/g,'').split(/\s+/).forEach(w=>{
      if(w.length>3&&!stopwords.has(w)) freq[w]=(freq[w]||0)+1;
    });
  });
  const palavras=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,40);
  const maxF=palavras[0]?.[1]||1;
  document.getElementById("wordcloud").innerHTML=palavras.map(([w,c])=>{
    const t=c/maxF,sz=0.72+t*1.5;
    const ip=POSITIVOS.some(p=>w.includes(p)),in_=NEGATIVOS.some(n=>w.includes(n));
    const col=ip?`rgba(74,222,128,${0.5+t*0.5})`:in_?`rgba(248,113,113,${0.5+t*0.5})`:`rgba(139,163,199,${0.3+t*0.5})`;
    const bg=ip?'rgba(74,222,128,.08)':in_?'rgba(248,113,113,.08)':'rgba(255,255,255,.04)';
    return `<span class="wc-word" style="font-size:${sz}rem;color:${col};background:${bg}" title="${c}x">${w}</span>`;
  }).join('');
}

/* ── Ranking de perfis ── */
function renderizarRankingPerfis(posts) {
  const freq={};
  posts.forEach(p=>{
    const autor=p.autor||'[deletado]';
    if(autor==='[deletado]'||autor==='AutoModerator') return;
    if(!freq[autor]) freq[autor]={total:0,pos:0,neg:0,neu:0,comentarios:0};
    freq[autor].total++;
    freq[autor].comentarios+=(p.comentarios||0);
    const cls=obterClasse(p.sentimento);
    if(cls==='pos') freq[autor].pos++; else if(cls==='neg') freq[autor].neg++; else freq[autor].neu++;
  });
  const ranking=Object.entries(freq).sort((a,b)=>b[1].total-a[1].total).slice(0,10);
  const el=document.getElementById('ranking-perfis');
  if(!el) return;
  if(!ranking.length){ el.innerHTML='<div style="text-align:center;color:var(--txt3);padding:24px">Dados de autoria não disponíveis.</div>'; return; }
  const maxP=ranking[0][1].total;
  el.innerHTML=ranking.map(([autor,d],i)=>{
    const pct=Math.round((d.total/maxP)*100);
    const dom=d.pos>=d.neg&&d.pos>=d.neu?'pos':d.neg>=d.pos&&d.neg>=d.neu?'neg':'neu';
    const ic=dom==='pos'?'😊':dom==='neg'?'😡':'😐';
    const med=i===0?'🥇':i===1?'🥈':i===2?'🥉':`<span class="rank-num">${i+1}</span>`;
    return `<div class="perfil-rank-row"><div class="rank-medal">${med}</div><div class="rank-body"><div class="rank-name">u/${escapar(autor)}</div><div class="rank-bar-wrap"><div class="rank-bar-bg"><div class="rank-bar-fill ${dom}" style="width:${pct}%"></div></div><span class="rank-count">${d.total} pub.</span></div><div class="rank-tags"><span class="rank-tag pos">😊 ${d.pos}</span><span class="rank-tag neu">😐 ${d.neu}</span><span class="rank-tag neg">😡 ${d.neg}</span><span class="rank-tag cmt">💬 ${d.comentarios.toLocaleString('pt-BR')}</span></div></div><div class="rank-emoji">${ic}</div></div>`;
  }).join('');
}

/* ── Emoções ──────────────────────────────────────────────────────────────
   O léxico de emoções (objeto EMOCOES_LEXICON, com 8 categorias e listas
   extensas de palavras/expressões) vem do arquivo emocoes_lexicon.js,
   carregado antes deste script no index.html. Aqui ficam apenas os rótulos
   de exibição e a lógica de contagem/renderização.
---------------------------------------------------------------------------*/
const NOMES_EMOCAO = { amor:'Amor', alegria:'Alegria', surpresa:'Surpresa', medo:'Medo', raiva:'Raiva', tristeza:'Tristeza', nojo:'Nojo', antecipacao:'Antecipação' };

// Termos de negação considerados na análise de emoções. Se uma palavra do
// léxico aparecer logo após um termo de negação (ex.: "não senti nenhuma
// alegria"), essa ocorrência é descartada para evitar falsos positivos —
// mesmo princípio já aplicado em sentiment.js para a polaridade geral.
const NEGACOES_EMOCAO = ['não', 'nao', 'nunca', 'jamais', 'nem', 'sem', 'nenhum', 'nenhuma'];

function ocorrenciaNegada(texto, posicao, janela = 25) {
  const inicio = Math.max(0, posicao - janela);
  const trecho = texto.slice(inicio, posicao);
  return NEGACOES_EMOCAO.some(neg => trecho.includes(neg));
}

function renderizarEmocoesBoardEl(posts, el) {
  if (!el) return;
  if (typeof EMOCOES_LEXICON === 'undefined') {
    console.warn('EMOCOES_LEXICON não encontrado — verifique se emocoes_lexicon.js foi carregado antes de script.js.');
    return;
  }

  const cnt = {};
  Object.keys(EMOCOES_LEXICON).forEach(e => { cnt[e] = 0; });

  posts.forEach(p => {
    const txt = (p.textoCompleto || '').toLowerCase();

    Object.entries(EMOCOES_LEXICON).forEach(([emocao, cfg]) => {
      cfg.palavras.forEach(palavra => {
        // Procura todas as ocorrências da palavra/expressão no texto e
        // conta a emoção assim que encontrar pelo menos uma ocorrência
        // que não esteja sob efeito de negação.
        let idx = txt.indexOf(palavra);
        while (idx !== -1) {
          if (!ocorrenciaNegada(txt, idx)) {
            cnt[emocao]++;
            break;
          }
          idx = txt.indexOf(palavra, idx + palavra.length);
        }
      });
    });
  });

  const total = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;
  const ranking = Object.entries(cnt).map(([k, v]) => ({ k, v, ...EMOCOES_LEXICON[k] })).sort((a, b) => b.v - a.v);
  const maxV = ranking[0]?.v || 1;

  if (maxV === 0) {
    el.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:24px">Nenhuma emoção identificada nas publicações coletadas.</div>';
    return;
  }

  el.innerHTML = ranking.map((em, i) => {
    const pct = Math.round((em.v / total) * 100);
    const bp  = Math.round((em.v / maxV) * 100);
    return `<div class="emocao-row ${i === 0 ? 'emocao-destaque' : ''}"><div class="emocao-icon">${em.icon}</div><div class="emocao-body"><div class="emocao-name">${NOMES_EMOCAO[em.k]}</div><div class="emocao-bar-wrap"><div class="emocao-bar-bg"><div class="emocao-bar-fill" style="width:${bp}%;background:${em.color}"></div></div><span class="emocao-pct" style="color:${em.color}">${pct}%</span></div><div class="emocao-count">${em.v} ocorrências</div></div>${i === 0 ? '<div class="emocao-crown">👑 Dominante</div>' : ''}</div>`;
  }).join('');
}
function renderizarEmocoesBoard(posts) {
  renderizarEmocoesBoardEl(posts, document.getElementById('emocoes-board'));
}

/* ── Posts colapsáveis ── */
function filtrarPosts(tipo, btn) {
  paginaAtual=1;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  postsFiltrados = tipo==='todos' ? [...todosOsPosts] : todosOsPosts.filter(p=>obterClasse(p.sentimento)===tipo);
  renderizarPagina();
}
function renderizarPagina() {
  const inicio=(paginaAtual-1)*POSTS_POR_PAGINA;
  const pagePosts=postsFiltrados.slice(inicio,inicio+POSTS_POR_PAGINA);
  const container=document.getElementById("posts-list");
  container.innerHTML='';
  if(!pagePosts.length){ container.innerHTML='<div style="text-align:center;color:var(--txt3);padding:40px">Nenhuma publicação encontrada.</div>'; document.getElementById("posts-pagination").innerHTML=''; return; }
  pagePosts.forEach((p,i)=>renderizarPostCard(p,i,container));
  renderizarPaginacao();
}
function renderizarPostCard(post, i, container) {
  const cls=obterClasse(post.sentimento);
  const icone=cls==='pos'?'😊':cls==='neg'?'😡':'😐';
  const data=new Date(post.dataPost).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const pPos=POSITIVOS.filter(p=>(post.textoCompleto||'').includes(p));
  const pNeg=NEGATIVOS.filter(p=>(post.textoCompleto||'').includes(p));
  const score=post.score||0;
  const ftag=post.fonte?`<span class="fonte-badge fonte-${post.fonte}">${post.fonte==='reddit'?'🔴 Reddit':post.fonte==='bluesky'?'🦋 Bluesky':post.fonte==='youtube'?'▶️ YouTube':'🌐 Web'}</span>`:'';
  // Thumbnail: só vídeos do YouTube têm post.thumbnail preenchido
  // (comentários do YouTube não têm thumbnail própria — herdam o vídeo de origem)
  const temThumb = post.fonte==='youtube' && post.thumbnail;
  const thumbHtml = temThumb
    ? `<img src="${post.thumbnail}" alt="${escapar(post.texto)}" class="post-thumb" loading="lazy">`
    : '';
  const card=document.createElement('div');
  card.className=`post-card ${cls} ${temThumb?'has-thumb':''}`;
  card.innerHTML=`
    <div class="post-header" onclick="togglePost(this.closest('.post-card'))">
      ${thumbHtml}
      <div class="post-sentiment-icon">${icone}</div>
      <div class="post-body">
        <div class="post-title">${escapar(post.texto)}</div>
        <div class="post-meta">
          ${ftag}
          <span class="post-badge ${cls}">${post.sentimento}</span>
          <span class="post-score-chip">Score ${score>=0?'+':''}${score}</span>
          <span>📅 ${data}</span>
          <span>💬 ${post.comentarios||0}</span>
        </div>
      </div>
      <div class="post-chevron">▾</div>
    </div>
    <div class="post-detail">
      ${post.descricao?`<div class="post-desc" id="desc-${i}">${escapar(post.descricao)}<div class="post-desc-fade" id="fade-${i}"></div></div><button class="btn-read-more" onclick="expandirDescricao(${i})">+ Ver descrição completa</button>`:'<p style="font-size:.82rem;color:var(--txt3);margin-bottom:12px">Sem descrição disponível.</p>'}
      ${pPos.length||pNeg.length?`<div class="post-words"><span class="post-words-label">Palavras-chave:</span>${pPos.map(w=>`<span class="word-tag pos">+${w}</span>`).join('')}${pNeg.map(w=>`<span class="word-tag neg">-${w}</span>`).join('')}</div>`:''}
      <div class="post-actions"><a class="post-link" href="${post.link}" target="_blank" rel="noopener">Abrir fonte ↗</a></div>
    </div>`;
  container.appendChild(card);
}
function togglePost(card) {
  const isOpen=card.classList.contains('open');
  document.querySelectorAll('.post-card.open').forEach(c=>c.classList.remove('open'));
  if(!isOpen) card.classList.add('open');
}
function expandirDescricao(i) {
  const desc=document.getElementById(`desc-${i}`);
  const fade=document.getElementById(`fade-${i}`);
  if(!desc) return;
  desc.classList.add('expanded');
  if(fade) fade.style.display='none';
  const btn=desc.nextElementSibling;
  if(btn&&btn.classList.contains('btn-read-more')) btn.style.display='none';
}
function renderizarPaginacao() {
  const total=postsFiltrados.length;
  const tPags=Math.ceil(total/POSTS_POR_PAGINA);
  const pag=document.getElementById("posts-pagination");
  if(tPags<=1){pag.innerHTML='';return;}
  let html=`<button class="page-btn" onclick="irParaPagina(${paginaAtual-1})" ${paginaAtual===1?'disabled':''}>← Anterior</button>`;
  for(let p=1;p<=tPags;p++){
    if(tPags>7&&p>2&&p<tPags-1&&Math.abs(p-paginaAtual)>1){ if(p===3||p===tPags-2) html+='<span style="color:var(--txt3);padding:0 4px">…</span>'; continue; }
    html+=`<button class="page-btn ${p===paginaAtual?'active':''}" onclick="irParaPagina(${p})">${p}</button>`;
  }
  html+=`<button class="page-btn" onclick="irParaPagina(${paginaAtual+1})" ${paginaAtual===tPags?'disabled':''}>Próxima →</button>`;
  pag.innerHTML=html;
}
function irParaPagina(p) {
  const total=Math.ceil(postsFiltrados.length/POSTS_POR_PAGINA);
  if(p<1||p>total) return;
  paginaAtual=p;
  renderizarPagina();
  document.querySelector('.posts-section-header')?.scrollIntoView({behavior:'smooth'});
}

/* ── Paginação — tela de Detalhamento por Fonte (50 por página) ── */
// Para fontes com comentários aninhados (YouTube, Bluesky) os itens são
// agrupados pelo post/vídeo "pai" + seus comentários; a paginação então
// conta unidades pai, não itens somados. Para as demais fontes (Reddit, Web),
// mantém a lista plana de sempre.

// Identifica a chave de agrupamento (videoId no YouTube, postUri no Bluesky)
function chaveAgrupamento(fonte) {
  if (fonte === 'youtube') return { tipoPai: 'video', chave: 'videoId' };
  if (fonte === 'bluesky') return { tipoPai: 'post',  chave: 'postUri', chavePai: 'uri' };
  return null;
}

function agruparPorPost(posts, fonte) {
  const cfg = chaveAgrupamento(fonte);
  const grupoMap = new Map();
  const semChave = [];

  posts.forEach(p => {
    if (p.tipo === cfg.tipoPai) {
      // Para o post/vídeo pai, usa sua própria chave (videoId no YT, uri no Bluesky)
      const k = cfg.chavePai ? p[cfg.chavePai] : p[cfg.chave];
      grupoMap.set(k, { pai: p, comentarios: grupoMap.get(k)?.comentarios || [] });
    } else if (p.tipo === 'comentario') {
      const k = p[cfg.chave];
      if (k && grupoMap.has(k)) {
        grupoMap.get(k).comentarios.push(p);
      } else if (k) {
        // Comentário cujo post "pai" não está nesta página/lista — agrupa à parte
        grupoMap.set(k, { pai: null, comentarios: [p] });
      } else {
        semChave.push(p);
      }
    } else {
      semChave.push(p);
    }
  });

  return { grupos: [...grupoMap.values()], orfaos: semChave };
}

// Mantido por compatibilidade com qualquer referência antiga
function agruparPorVideo(posts) {
  return agruparPorPost(posts, 'youtube');
}

function renderizarPaginaDetalhe() {
  const container = document.getElementById('d-posts-list');
  const pagDiv    = document.getElementById('d-posts-pagination');
  container.innerHTML = '';

  if (!postsDetalheFonte.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:40px">Nenhuma publicação encontrada.</div>';
    pagDiv.innerHTML = '';
    return;
  }

  const temAgrupamento = fonteDetalheAtual === 'youtube' || fonteDetalheAtual === 'bluesky';

  if (temAgrupamento) {
    const { grupos, orfaos } = agruparPorPost(postsDetalheFonte, fonteDetalheAtual);
    const totalGrupos = grupos.length;
    const inicio = (paginaAtualDetalhe-1)*POSTS_POR_PAGINA_DETALHE;
    const pageGrupos = grupos.slice(inicio, inicio+POSTS_POR_PAGINA_DETALHE);

    if (!pageGrupos.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:40px">Nenhuma publicação encontrada.</div>';
      pagDiv.innerHTML = '';
      return;
    }

    pageGrupos.forEach((g, i) => {
      if (fonteDetalheAtual === 'youtube') {
        renderizarVideoComComentarios(g.pai, g.comentarios, i, container);
      } else {
        renderizarPostComComentarios(g.pai, g.comentarios, i, container);
      }
    });

    // Comentários órfãos (sem post/vídeo correspondente nesta página) — mostra à parte
    if (orfaos.length && paginaAtualDetalhe === 1) {
      const bloco = document.createElement('div');
      bloco.className = 'video-group video-group-orfaos';
      bloco.innerHTML = `<div class="video-group-orfaos-label">💬 ${orfaos.length} comentário(s) sem publicação associada nesta página</div>`;
      const lista = document.createElement('div');
      lista.className = 'comentarios-lista';
      orfaos.forEach((c,i) => lista.appendChild(criarComentarioEl(c, `orfao-${i}`)));
      bloco.appendChild(lista);
      container.appendChild(bloco);
    }

    renderizarPaginacaoGenerica(totalGrupos, POSTS_POR_PAGINA_DETALHE, paginaAtualDetalhe, pagDiv, irParaPaginaDetalhe);
    return;
  }

  // ── Fontes sem agrupamento (Reddit, Web): lista plana, como antes ──
  const inicio = (paginaAtualDetalhe-1)*POSTS_POR_PAGINA_DETALHE;
  const pagePosts = postsDetalheFonte.slice(inicio, inicio+POSTS_POR_PAGINA_DETALHE);
  if (!pagePosts.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:40px">Nenhuma publicação encontrada.</div>';
    pagDiv.innerHTML = '';
    return;
  }
  pagePosts.forEach((p,i) => renderizarPostCard(p, i, container));
  renderizarPaginacaoGenerica(postsDetalheFonte.length, POSTS_POR_PAGINA_DETALHE, paginaAtualDetalhe, pagDiv, irParaPaginaDetalhe);
}

// Renderiza um vídeo em destaque (thumb grande) com seus comentários aninhados abaixo
function renderizarVideoComComentarios(video, comentarios, i, container) {
  const grupo = document.createElement('div');
  grupo.className = 'video-group';

  if (video) {
    const cls    = obterClasse(video.sentimento);
    const icone  = cls==='pos'?'😊':cls==='neg'?'😡':'😐';
    const data   = new Date(video.dataPost).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const score  = video.score||0;
    const thumb  = video.thumbnail
      ? `<img src="${video.thumbnail}" alt="${escapar(video.texto)}" class="video-thumb-grande" loading="lazy">`
      : `<div class="video-thumb-grande video-thumb-fallback">▶️</div>`;

    grupo.innerHTML = `
      <div class="video-card-header" onclick="toggleVideoGroup(this.closest('.video-group'))">
        <div class="video-thumb-wrap">${thumb}<span class="video-play-badge">▶</span></div>
        <div class="video-info">
          <div class="video-titulo">${escapar(video.texto)}</div>
          <div class="video-meta">
            <span class="fonte-badge fonte-youtube">▶️ YouTube</span>
            <span class="post-badge ${cls}">${video.sentimento}</span>
            <span class="post-score-chip">Score ${score>=0?'+':''}${score}</span>
            <span>📅 ${data}</span>
            <span>📺 ${escapar(video.canal||'')}</span>
            <span>👍 ${(video.upvotes||0).toLocaleString('pt-BR')}</span>
            <span>👁️ ${(video.views||0).toLocaleString('pt-BR')}</span>
            <span>💬 ${comentarios.length} analisados</span>
          </div>
        </div>
        <div class="post-chevron">▾</div>
      </div>
      <div class="video-card-detail">
        ${video.descricao?`<div class="post-desc" id="desc-v${i}">${escapar(video.descricao)}<div class="post-desc-fade" id="fade-v${i}"></div></div><button class="btn-read-more" onclick="expandirDescricao('v${i}')">+ Ver descrição completa</button>`:''}
        <div class="post-actions"><a class="post-link" href="${video.link}" target="_blank" rel="noopener">Abrir vídeo no YouTube ↗</a></div>
        ${comentarios.length ? `
          <div class="comentarios-header">💬 Comentários analisados (${comentarios.length})</div>
          <div class="comentarios-lista"></div>
        ` : '<div class="comentarios-vazio">Nenhum comentário coletado para este vídeo.</div>'}
      </div>`;
  } else {
    // Grupo sem dados do vídeo (caso raro: vídeo fora da página, mas comentário presente)
    grupo.innerHTML = `
      <div class="video-card-header" onclick="toggleVideoGroup(this.closest('.video-group'))">
        <div class="video-thumb-wrap"><div class="video-thumb-grande video-thumb-fallback">▶️</div></div>
        <div class="video-info">
          <div class="video-titulo">${escapar(comentarios[0]?.videoTitulo || 'Vídeo não identificado')}</div>
          <div class="video-meta"><span>💬 ${comentarios.length} comentários analisados</span></div>
        </div>
        <div class="post-chevron">▾</div>
      </div>
      <div class="video-card-detail">
        <div class="comentarios-header">💬 Comentários analisados (${comentarios.length})</div>
        <div class="comentarios-lista"></div>
      </div>`;
  }

  const listaEl = grupo.querySelector('.comentarios-lista');
  if (listaEl) comentarios.forEach((c, ci) => listaEl.appendChild(criarComentarioEl(c, `${i}-${ci}`)));

  container.appendChild(grupo);
}

// Renderiza um post do Bluesky (sem thumbnail, é texto) com suas replies aninhadas
function renderizarPostComComentarios(post, comentarios, i, container) {
  const grupo = document.createElement('div');
  grupo.className = 'video-group post-group-texto';

  if (post) {
    const cls   = obterClasse(post.sentimento);
    const icone = cls==='pos'?'😊':cls==='neg'?'😡':'😐';
    const data  = new Date(post.dataPost).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const score = post.score||0;

    grupo.innerHTML = `
      <div class="video-card-header post-header-texto" onclick="toggleVideoGroup(this.closest('.video-group'))">
        <div class="post-sentiment-icon-grande">${icone}</div>
        <div class="video-info">
          <div class="video-titulo post-titulo-texto">${escapar(post.texto)}</div>
          <div class="video-meta">
            <span class="fonte-badge fonte-bluesky">🦋 Bluesky</span>
            <span class="post-badge ${cls}">${post.sentimento}</span>
            <span class="post-score-chip">Score ${score>=0?'+':''}${score}</span>
            <span>📅 ${data}</span>
            <span>👤 ${escapar(post.autor||'')}</span>
            <span>❤️ ${(post.upvotes||0).toLocaleString('pt-BR')}</span>
            <span>🔁 ${(post.reposts||0).toLocaleString('pt-BR')}</span>
            <span>💬 ${comentarios.length} analisados</span>
          </div>
        </div>
        <div class="post-chevron">▾</div>
      </div>
      <div class="video-card-detail">
        <div class="post-actions"><a class="post-link" href="${post.link}" target="_blank" rel="noopener">Abrir post no Bluesky ↗</a></div>
        ${comentarios.length ? `
          <div class="comentarios-header">💬 Comentários analisados (${comentarios.length})</div>
          <div class="comentarios-lista"></div>
        ` : '<div class="comentarios-vazio">Nenhuma resposta coletada para este post.</div>'}
      </div>`;
  } else {
    // Grupo sem dados do post (caso raro: post fora da página, mas comentário presente)
    grupo.innerHTML = `
      <div class="video-card-header post-header-texto" onclick="toggleVideoGroup(this.closest('.video-group'))">
        <div class="post-sentiment-icon-grande">💬</div>
        <div class="video-info">
          <div class="video-titulo post-titulo-texto">${escapar(comentarios[0]?.postTexto || 'Post não identificado')}</div>
          <div class="video-meta"><span>💬 ${comentarios.length} comentários analisados</span></div>
        </div>
        <div class="post-chevron">▾</div>
      </div>
      <div class="video-card-detail">
        <div class="comentarios-header">💬 Comentários analisados (${comentarios.length})</div>
        <div class="comentarios-lista"></div>
      </div>`;
  }

  const listaEl = grupo.querySelector('.comentarios-lista');
  if (listaEl) comentarios.forEach((c, ci) => listaEl.appendChild(criarComentarioEl(c, `bsky-${i}-${ci}`)));

  container.appendChild(grupo);
}

// Cria o elemento de UM comentário (linha compacta, sem collapse — comentários são curtos)
function criarComentarioEl(c, key) {
  const cls   = obterClasse(c.sentimento);
  const icone = cls==='pos'?'😊':cls==='neg'?'😡':'😐';
  const data  = new Date(c.dataPost).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const score = c.score||0;
  const el = document.createElement('div');
  el.className = `comentario-item ${cls}`;
  el.innerHTML = `
    <div class="comentario-icon">${icone}</div>
    <div class="comentario-body">
      <div class="comentario-texto">${escapar(c.texto)}</div>
      <div class="comentario-meta">
        <span class="post-badge ${cls}">${c.sentimento}</span>
        <span class="post-score-chip">Score ${score>=0?'+':''}${score}</span>
        <span>👤 ${escapar(c.autor||'Anônimo')}</span>
        <span>👍 ${(c.upvotes||0).toLocaleString('pt-BR')}</span>
        <span>📅 ${data}</span>
        ${c.link ? `<a class="comentario-link" href="${c.link}" target="_blank" rel="noopener">Ver no YouTube ↗</a>` : ''}
      </div>
    </div>`;
  return el;
}

function toggleVideoGroup(grupo) {
  grupo.classList.toggle('open');
}

// Paginação genérica reutilizável (conta "unidades" abstratas — vídeos ou posts)
function renderizarPaginacaoGenerica(totalUnidades, porPagina, paginaAtualX, pagEl, callback) {
  const tPags = Math.ceil(totalUnidades/porPagina);
  if (!pagEl) return;
  if (tPags<=1){ pagEl.innerHTML=''; return; }
  let html = `<button class="page-btn" onclick="${callback.name}(${paginaAtualX-1})" ${paginaAtualX===1?'disabled':''}>← Anterior</button>`;
  for(let p=1;p<=tPags;p++){
    if(tPags>7&&p>2&&p<tPags-1&&Math.abs(p-paginaAtualX)>1){ if(p===3||p===tPags-2) html+='<span style="color:var(--txt3);padding:0 4px">…</span>'; continue; }
    html += `<button class="page-btn ${p===paginaAtualX?'active':''}" onclick="${callback.name}(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="${callback.name}(${paginaAtualX+1})" ${paginaAtualX===tPags?'disabled':''}>Próxima →</button>`;
  pagEl.innerHTML = html;
}

function renderizarPaginacaoDetalhe() {
  // mantido por compatibilidade — a lógica real está em renderizarPaginacaoGenerica,
  // chamada diretamente dentro de renderizarPaginaDetalhe()
}

function irParaPaginaDetalhe(p) {
  const temAgrupamento = fonteDetalheAtual === 'youtube' || fonteDetalheAtual === 'bluesky';
  const totalUnidades = temAgrupamento
    ? agruparPorPost(postsDetalheFonte, fonteDetalheAtual).grupos.length
    : postsDetalheFonte.length;
  const total = Math.ceil(totalUnidades/POSTS_POR_PAGINA_DETALHE);
  if(p<1||p>total) return;
  paginaAtualDetalhe = p;
  renderizarPaginaDetalhe();
  document.getElementById('d-posts-list')?.scrollIntoView({behavior:'smooth'});
}

/* ── Utilitários ── */
function obterClasse(s) {
  if(!s) return 'neu';
  const sl=s.toLowerCase();
  if(sl.includes('positivo')) return 'pos';
  if(sl.includes('negativo')) return 'neg';
  return 'neu';
}
function escapar(txt) {
  if(!txt) return '';
  return txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* ============================================================
   EXPORTAR PDF — relatório com dados reais (texto + tabelas)
   Não usa screenshot: todo o conteúdo é gerado via jsPDF/AutoTable.
============================================================ */

// Reaproveita a mesma lógica de frequência de palavras usada na nuvem,
// mas devolve um array de dados em vez de mexer no DOM.
function computarPalavrasFrequentes(posts, limite = 10) {
  const stopwords = new Set(['de','a','o','e','em','que','do','da','no','na','um','uma','para','com','se','por','mais','mas','como','seu','sua','os','as','dos','das','pelo','pela','também','ou','aos','nas','nos','foi','esse','essa','são','bem','já','sobre','isso','quando','então','pode','há','só','até','está','ser','ter','não','lá','eu','me','te','ele','ela','nós','eles','você']);
  const freq = {};
  posts.forEach(p => {
    ((p.texto || '') + ' ' + (p.descricao || '')).toLowerCase()
      .replace(/[^\wáéíóúãõâêîôûàèìòùç\s]/g, '').split(/\s+/).forEach(w => {
        if (w.length > 3 && !stopwords.has(w)) freq[w] = (freq[w] || 0) + 1;
      });
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limite);
}

// Reaproveita a mesma lógica do ranking de perfis, devolvendo dados puros.
function computarRankingAutores(posts, limite = 10) {
  const freq = {};
  posts.forEach(p => {
    const autor = p.autor || '[deletado]';
    if (autor === '[deletado]' || autor === 'AutoModerator') return;
    if (!freq[autor]) freq[autor] = { total: 0, pos: 0, neg: 0, neu: 0, comentarios: 0 };
    freq[autor].total++;
    freq[autor].comentarios += (p.comentarios || 0);
    const cls = obterClasse(p.sentimento);
    if (cls === 'pos') freq[autor].pos++; else if (cls === 'neg') freq[autor].neg++; else freq[autor].neu++;
  });
  return Object.entries(freq).sort((a, b) => b[1].total - a[1].total).slice(0, limite);
}

function calcularDistribuicao(posts) {
  const total = posts.length;
  const nPos = posts.filter(p => obterClasse(p.sentimento) === 'pos').length;
  const nNeu = posts.filter(p => obterClasse(p.sentimento) === 'neu').length;
  const nNeg = posts.filter(p => obterClasse(p.sentimento) === 'neg').length;
  return {
    total, nPos, nNeu, nNeg,
    pPos: total ? Math.round(nPos / total * 100) : 0,
    pNeu: total ? Math.round(nNeu / total * 100) : 0,
    pNeg: total ? Math.round(nNeg / total * 100) : 0,
  };
}

const NOME_FONTE = { reddit: 'Reddit', bluesky: 'Bluesky', web: 'Web / Notícias', youtube: 'YouTube' };

async function exportarPDF() {
  if (typeof window.jspdf === 'undefined') {
    alert('Aguarde a biblioteca de PDF carregar e tente novamente.');
    return;
  }
  const { jsPDF } = window.jspdf;

  const telaDetalhe = !document.getElementById('tela-detalhe-fonte').classList.contains('hidden');
  const fonteAtual  = telaDetalhe ? fonteDetalheAtual : null;
  const posts       = telaDetalhe ? (dadosFontes[fonteAtual] || []) : todosOsPosts;

  const titulo = telaDetalhe
    ? `SentimentRadar — Relatório: ${NOME_FONTE[fonteAtual] || fonteAtual}`
    : 'SentimentRadar — Relatório Geral';

  const termo       = document.getElementById('results-term')?.textContent || '';
  const dataGeracao = new Date().toLocaleString('pt-BR');

  const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW    = pdf.internal.pageSize.getWidth();
  const margin  = 12;

  const COR_HEADER = [13, 21, 38];
  const COR_POS    = [74, 222, 128];
  const COR_NEU    = [148, 163, 184];
  const COR_NEG    = [248, 113, 113];

  function desenharCabecalho(doc) {
    doc.setFillColor(...COR_HEADER);
    doc.rect(0, 0, pdfW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, margin, 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em ${dataGeracao}`, pdfW - margin, 11, { align: 'right' });
  }

  function desenharRodape(doc) {
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text('SentimentRadar — Análise léxica de sentimentos · Reddit · Bluesky · Web · YouTube', margin, h - 6);
      doc.text(`Página ${i} de ${totalPaginas}`, pdfW - margin, h - 6, { align: 'right' });
    }
  }

  desenharCabecalho(pdf);
  let y = 28;

  // ── Resumo da busca ──────────────────────────────────────────
  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Termo pesquisado', margin, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(termo || '—', margin, y + 6);
  y += 16;

  const dist = calcularDistribuicao(posts);

  // ── Cards de métricas (texto, não imagem) ────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Resumo geral', margin, y);
  y += 6;

  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Total de publicações', 'Positivas', 'Neutras', 'Negativas']],
    body: [[
      String(dist.total),
      `${dist.nPos} (${dist.pPos}%)`,
      `${dist.nNeu} (${dist.pNeu}%)`,
      `${dist.nNeg} (${dist.pNeg}%)`,
    ]],
    theme: 'grid',
    headStyles: { fillColor: COR_HEADER, fontSize: 9 },
    bodyStyles: { fontSize: 10, halign: 'center' },
    styles: { cellPadding: 3 },
  });
  y = pdf.lastAutoTable.finalY + 10;

  // ── Distribuição por fonte (somente no relatório geral) ──────
  if (!telaDetalhe) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Distribuição por fonte', margin, y);
    y += 4;

    const linhasFonte = Object.entries(dadosFontes).map(([key, arr]) => {
      const d = calcularDistribuicao(arr);
      const cmt = arr.reduce((a, p) => a + (p.comentarios || 0), 0);
      const likes = arr.reduce((a, p) => a + (p.upvotes || 0), 0);
      return [NOME_FONTE[key] || key, String(d.total), `${d.pPos}%`, `${d.pNeu}%`, `${d.pNeg}%`, cmt.toLocaleString('pt-BR'), likes.toLocaleString('pt-BR')];
    });

    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Fonte', 'Publicações', '% Pos.', '% Neu.', '% Neg.', 'Comentários', 'Curtidas/Upvotes']],
      body: linhasFonte,
      theme: 'striped',
      headStyles: { fillColor: COR_HEADER, fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
    });
    y = pdf.lastAutoTable.finalY + 10;
  }

  // ── Palavras mais frequentes ──────────────────────────────────
  const palavras = computarPalavrasFrequentes(posts, 10);
  if (palavras.length) {
    if (y > 240) { pdf.addPage(); desenharCabecalho(pdf); y = 28; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Palavras mais frequentes', margin, y);
    y += 4;
    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Palavra', 'Ocorrências']],
      body: palavras.map(([w, c], i) => [String(i + 1), w, String(c)]),
      theme: 'striped',
      headStyles: { fillColor: COR_HEADER, fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 30, halign: 'center' } },
    });
    y = pdf.lastAutoTable.finalY + 10;
  }

  // ── Ranking de autores por engajamento ───────────────────────
  const ranking = computarRankingAutores(posts, 10);
  if (ranking.length) {
    if (y > 230) { pdf.addPage(); desenharCabecalho(pdf); y = 28; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Ranking de autores por engajamento', margin, y);
    y += 4;
    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Autor', 'Publicações', 'Positivas', 'Neutras', 'Negativas', 'Comentários']],
      body: ranking.map(([autor, d], i) => [String(i + 1), autor, String(d.total), String(d.pos), String(d.neu), String(d.neg), d.comentarios.toLocaleString('pt-BR')]),
      theme: 'striped',
      headStyles: { fillColor: COR_HEADER, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });
    y = pdf.lastAutoTable.finalY + 10;
  }

  // ── Publicações com maior engajamento ────────────────────────
  const topPosts = [...posts]
    .sort((a, b) => ((b.comentarios || 0) + (b.upvotes || 0)) - ((a.comentarios || 0) + (a.upvotes || 0)))
    .slice(0, 15);

  if (topPosts.length) {
    if (y > 220) { pdf.addPage(); desenharCabecalho(pdf); y = 28; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Publicações com maior engajamento', margin, y);
    y += 4;
    pdf.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Fonte', 'Texto', 'Sentimento', 'Engajamento', 'Data']],
      body: topPosts.map(p => [
        NOME_FONTE[p.fonte] || p.fonte || '—',
        (p.texto || '').slice(0, 90),
        p.sentimento || '—',
        String((p.comentarios || 0) + (p.upvotes || 0)),
        p.dataPost ? new Date(p.dataPost).toLocaleDateString('pt-BR') : '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: COR_HEADER, fontSize: 8 },
      bodyStyles: { fontSize: 7.5, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 22 },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const v = (data.cell.raw || '').toLowerCase();
          if (v.includes('positivo')) data.cell.styles.textColor = COR_POS;
          else if (v.includes('negativo')) data.cell.styles.textColor = COR_NEG;
          else data.cell.styles.textColor = COR_NEU;
        }
      },
    });
  }

  desenharRodape(pdf);

  const nomeArquivo = telaDetalhe
    ? `sentimentradar-${(fonteAtual || 'detalhe').toLowerCase()}.pdf`
    : 'sentimentradar-relatorio-geral.pdf';

  pdf.save(nomeArquivo);
}

function exportarCSV() {
  if(!todosOsPosts.length) return;
  const header=['Fonte','Titulo','Sentimento','Score','Comentários','Data','Link'];
  const rows=todosOsPosts.map(p=>[
    `"${p.fonte||'reddit'}"`,
    `"${(p.texto||'').replace(/"/g,'""')}"`,
    `"${p.sentimento}"`,
    p.score, p.comentarios||0,
    new Date(p.dataPost).toLocaleDateString('pt-BR'),
    `"${p.link}"`
  ].join(','));
  const csv=[header.join(','),...rows].join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='sentiment-radar.csv'; a.click();
  URL.revokeObjectURL(url);
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', ()=>{
  carregarTheme();
  carregarExemplosDinamicos();
  document.getElementById('searchInput')?.addEventListener('keydown', e=>{ if(e.key==='Enter') buscar(); });
  document.getElementById('searchInput2')?.addEventListener('keydown', e=>{ if(e.key==='Enter') buscar(); });
});