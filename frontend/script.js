/* ========================
   VARIÁVEIS GLOBAIS
======================== */
let chartDonut = null;
let chartBar   = null;
let chartLine  = null;

let todosOsPosts = [];     // todos os posts retornados
let postsFiltrados = [];   // filtro ativo
let paginaAtual = 1;
const POSTS_POR_PAGINA = 10;
let filtroAtivo = 'todos';

const POSITIVOS = ["bom","ótimo","excelente","incrível","maravilhoso","perfeito","gostei","amei","top","fantástico","feliz","sucesso","melhor","recomendo"];
const NEGATIVOS = ["ruim","péssimo","horrível","terrível","odio","problema","crise","lixo","decepcionante","triste","fracasso","pior","não recomendo"];

/* ========================
   BUSCA
======================== */
async function buscar() {
  const termo  = document.getElementById("searchInput").value.trim();
  const extra  = document.getElementById("searchInput2")?.value.trim() || "";
  const inicio = document.getElementById("dataInicio").value;
  const fim    = document.getElementById("dataFim").value;
  const filtro = document.getElementById("filtro").value;

  if (!termo) return;

  mostrarTela("tela-loading");

  try {
    const url = `http://localhost:3000/api/buscar?q=${encodeURIComponent(termo)}&extra=${encodeURIComponent(extra)}&inicio=${inicio}&fim=${fim}&filtro=${filtro}`;
    const response = await fetch(url);
    const data = await response.json();

    renderizarResultados(data, termo, extra);
    mostrarTela("tela-resultados");

  } catch (error) {
    alert("Erro ao buscar dados. Verifique se o servidor está rodando.");
    mostrarTela("tela-busca");
  }
}

/* ========================
   RENDERIZAÇÃO PRINCIPAL
======================== */
function renderizarResultados(data, termo, extra) {
  todosOsPosts = data.posts || [];

  const total = data.totalPosts;
  const label = extra ? `"${termo}" + "${extra}"` : `"${termo}"`;
  document.getElementById("results-term").textContent = label;
  document.getElementById("results-count").textContent = `${total} publicações analisadas`;

  // Contagens
  const nPos = todosOsPosts.filter(p => obterClasse(p.sentimento) === 'pos').length;
  const nNeu = todosOsPosts.filter(p => obterClasse(p.sentimento) === 'neu').length;
  const nNeg = todosOsPosts.filter(p => obterClasse(p.sentimento) === 'neg').length;
  const pctPos = total ? Math.round(nPos / total * 100) : 0;
  const pctNeu = total ? Math.round(nNeu / total * 100) : 0;
  const pctNeg = total ? Math.round(nNeg / total * 100) : 0;

  renderizarVeredicto(nPos, nNeu, nNeg, total);
  renderizarHighlightCards(nPos, nNeu, nNeg, pctPos, pctNeu, pctNeg, total);
  renderizarTermometro(todosOsPosts);
  renderizarDonut(nPos, nNeu, nNeg, pctPos, pctNeu, pctNeg);
  renderizarBarra(nPos, nNeu, nNeg);
  renderizarLinha(todosOsPosts);
  renderizarIntensidade(nPos, nNeu, nNeg, pctPos, pctNeu, pctNeg);
  renderizarMetricas(data, nPos, nNeu, nNeg, pctPos, pctNeg);
  renderizarWordCloud(todosOsPosts);
  filtrarPosts('todos', document.querySelector('.filter-btn.active'));
}

/* ── VEREDICTO ── */
function renderizarVeredicto(nPos, nNeu, nNeg, total) {
  const el = document.getElementById("hero-verdict");
  let icon, cls, txt;
  if (nPos >= nNeg && nPos >= nNeu) { icon='😊'; cls='pos'; txt='Opinião positiva'; }
  else if (nNeg >= nPos && nNeg >= nNeu) { icon='😡'; cls='neg'; txt='Opinião negativa'; }
  else { icon='😐'; cls='neu'; txt='Opinião neutra'; }

  el.innerHTML = `
    <div class="verdict-icon">${icon}</div>
    <div class="verdict-label">Veredicto geral</div>
    <div class="verdict-text ${cls}">${txt}</div>
  `;
  el.className = 'hero-verdict';
}

/* ── HIGHLIGHT CARDS ── */
function renderizarHighlightCards(nPos, nNeu, nNeg, pctPos, pctNeu, pctNeg, total) {
  const row = document.getElementById("sentiment-highlight-row");
  row.innerHTML = `
    <div class="highlight-card pos">
      <div class="hc-icon">😊</div>
      <div class="hc-label">Publicações positivas</div>
      <div class="hc-value pos">${pctPos}<small style="font-size:.9rem">%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill pos" style="width:${pctPos}%"></div></div>
      <div class="hc-sub">${nPos} de ${total} publicações</div>
    </div>
    <div class="highlight-card neu">
      <div class="hc-icon">😐</div>
      <div class="hc-label">Publicações neutras</div>
      <div class="hc-value neu">${pctNeu}<small style="font-size:.9rem">%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill neu" style="width:${pctNeu}%"></div></div>
      <div class="hc-sub">${nNeu} de ${total} publicações</div>
    </div>
    <div class="highlight-card neg">
      <div class="hc-icon">😡</div>
      <div class="hc-label">Publicações negativas</div>
      <div class="hc-value neg">${pctNeg}<small style="font-size:.9rem">%</small></div>
      <div class="hc-bar-bg"><div class="hc-bar-fill neg" style="width:${pctNeg}%"></div></div>
      <div class="hc-sub">${nNeg} de ${total} publicações</div>
    </div>
  `;
}

/* ── TERMÔMETRO ── */
function renderizarTermometro(posts) {
  if (!posts.length) return;
  const mediaScore = posts.reduce((a, p) => a + (p.score || 0), 0) / posts.length;
  const normalizado = Math.max(-2, Math.min(2, mediaScore));
  const indice = Math.round(normalizado * 50); // -100 a +100
  const pct = ((normalizado + 2) / 4) * 100;

  const el = document.getElementById("thermo-value");
  const desc = document.getElementById("thermo-desc");
  el.textContent = (indice >= 0 ? '+' : '') + indice;

  if (indice > 10) { el.className = 'thermo-number pos'; desc.textContent = 'Predominantemente positivo'; }
  else if (indice < -10) { el.className = 'thermo-number neg'; desc.textContent = 'Predominantemente negativo'; }
  else { el.className = 'thermo-number neu'; desc.textContent = 'Equilibrado / Neutro'; }

  setTimeout(() => {
    document.getElementById("thermo-needle").style.left = `${pct}%`;
  }, 300);
}

/* ── DONUT ── */
function renderizarDonut(nPos, nNeu, nNeg, pctPos, pctNeu, pctNeg) {
  const ctx = document.getElementById("chartDonut").getContext("2d");
  if (chartDonut) chartDonut.destroy();

  chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Positivo', 'Neutro', 'Negativo'],
      datasets: [{
        data: [nPos, nNeu, nNeg],
        backgroundColor: ['#22c55e','#475569','#ef4444'],
        borderColor: '#182033',
        borderWidth: 3,
        hoverBorderWidth: 4,
      }]
    },
    options: {
      cutout: '70%',
      plugins: { legend: { display: false } },
      animation: { animateRotate: true, duration: 800 }
    }
  });

  // Centro do donut
  const maior = Math.max(nPos, nNeu, nNeg);
  const dominante = nPos === maior ? 'Positivo' : nNeg === maior ? 'Negativo' : 'Neutro';
  const clsDom = nPos === maior ? 'pos' : nNeg === maior ? 'neg' : 'neu';
  document.getElementById("donut-center").innerHTML = `
    <span style="font-size:1.4rem">${nPos === maior ? '😊' : nNeg === maior ? '😡' : '😐'}</span>
    <span class="donut-sub" style="margin-top:4px">${dominante}</span>
  `;

  // Legenda
  const leg = document.getElementById("donut-legend");
  const items = [
    { label:'Positivos', pct:pctPos, n:nPos, color:'#22c55e' },
    { label:'Neutros',   pct:pctNeu, n:nNeu, color:'#475569' },
    { label:'Negativos', pct:pctNeg, n:nNeg, color:'#ef4444' },
  ];
  leg.innerHTML = items.map(i => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${i.color}"></div>
      <span>${i.label}</span>
      <span class="legend-count">${i.n} posts</span>
      <span class="legend-pct">${i.pct}%</span>
    </div>
  `).join('');
}

/* ── BARRA ── */
function renderizarBarra(nPos, nNeu, nNeg) {
  const ctx = document.getElementById("chartBar").getContext("2d");
  if (chartBar) chartBar.destroy();

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['😊 Positivo', '😐 Neutro', '😡 Negativo'],
      datasets: [{
        data: [nPos, nNeu, nNeg],
        backgroundColor: ['rgba(34,197,94,.75)', 'rgba(71,85,105,.75)', 'rgba(239,68,68,.75)'],
        borderColor:     ['#22c55e', '#475569', '#ef4444'],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { color:'rgba(255,255,255,.04)' }, ticks: { color:'#8ba3c7' } },
        y: { grid: { color:'rgba(255,255,255,.05)' }, ticks: { color:'#8ba3c7' }, beginAtZero:true }
      },
      animation: { duration: 900 }
    }
  });
}

/* ── LINHA DO TEMPO ── */
function renderizarLinha(posts) {
  const porDia = {};
  posts.forEach(p => {
    const d = new Date(p.dataPost).toISOString().slice(0,10);
    if (!porDia[d]) porDia[d] = { pos:0, neu:0, neg:0 };
    const cls = obterClasse(p.sentimento);
    porDia[d][cls]++;
  });

  const dias = Object.keys(porDia).sort();
  if (!dias.length) return;

  const ctx = document.getElementById("chartLine").getContext("2d");
  if (chartLine) chartLine.destroy();

  chartLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dias.map(d => {
        const dt = new Date(d + 'T12:00:00');
        return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
      }),
      datasets: [
        {
          label: '😊 Positivo',
          data: dias.map(d => porDia[d].pos),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,.08)',
          pointBackgroundColor: '#22c55e',
          tension: 0.4, fill: true, pointRadius: 4,
        },
        {
          label: '😐 Neutro',
          data: dias.map(d => porDia[d].neu),
          borderColor: '#64748b',
          backgroundColor: 'rgba(100,116,139,.06)',
          pointBackgroundColor: '#64748b',
          tension: 0.4, fill: true, pointRadius: 4,
        },
        {
          label: '😡 Negativo',
          data: dias.map(d => porDia[d].neg),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,.08)',
          pointBackgroundColor: '#ef4444',
          tension: 0.4, fill: true, pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: {
          display: true,
          labels: { color:'#8ba3c7', font:{ size:12 }, boxWidth:14, borderRadius:4 }
        }
      },
      scales: {
        x: { grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#8ba3c7', maxTicksLimit:10 } },
        y: { grid:{ color:'rgba(255,255,255,.05)' }, ticks:{ color:'#8ba3c7' }, beginAtZero:true }
      },
      animation: { duration: 1000 }
    }
  });
}

/* ── INTENSIDADE ── */
function renderizarIntensidade(nPos, nNeu, nNeg, pctPos, pctNeu, pctNeg) {
  setTimeout(() => {
    document.getElementById("bar-pos").style.width = pctPos + '%';
    document.getElementById("bar-neu").style.width = pctNeu + '%';
    document.getElementById("bar-neg").style.width = pctNeg + '%';
  }, 200);
  document.getElementById("pct-pos").textContent = pctPos + '%';
  document.getElementById("pct-neu").textContent = pctNeu + '%';
  document.getElementById("pct-neg").textContent = pctNeg + '%';
  document.getElementById("sub-pos").textContent = nPos + ' publicações';
  document.getElementById("sub-neu").textContent = nNeu + ' publicações';
  document.getElementById("sub-neg").textContent = nNeg + ' publicações';
}

/* ── MÉTRICAS ── */
function renderizarMetricas(data, nPos, nNeu, nNeg, pctPos, pctNeg) {
  const posts = data.posts || [];
  const total = data.totalPosts;
  const media = parseFloat(data.mediaComentarios) || 0;
  const maxComents = posts.length ? Math.max(...posts.map(p => p.comentarios)) : 0;
  const mediaScore = posts.length ? (posts.reduce((a,p) => a + (p.score||0), 0) / posts.length).toFixed(2) : 0;

  const grid = document.getElementById("metrics-grid");
  grid.innerHTML = [
    { icon:'📋', label:'Total de publicações', value:total, sub:'coletadas e analisadas', accent:'blue-accent' },
    { icon:'💬', label:'Média de comentários', value:media, sub:'por publicação', accent:'blue-accent' },
    { icon:'🔥', label:'Máx. comentários', value:maxComents, sub:'em uma publicação', accent:'blue-accent' },
    { icon:'😊', label:'Publicações positivas', value:`${pctPos}%`, sub:`${nPos} posts`, accent:'pos-accent' },
    { icon:'😡', label:'Publicações negativas', value:`${pctNeg}%`, sub:`${nNeg} posts`, accent:'neg-accent' },
    { icon:'📊', label:'Score médio', value:mediaScore > 0 ? '+'+mediaScore : mediaScore, sub:'índice de sentimento', accent: mediaScore > 0 ? 'pos-accent' : mediaScore < 0 ? 'neg-accent' : 'blue-accent' },
  ].map(m => `
    <div class="metric-card ${m.accent}">
      <div class="metric-icon">${m.icon}</div>
      <div class="metric-label">${m.label}</div>
      <div class="metric-value">${m.value}</div>
      <div class="metric-sub">${m.sub}</div>
    </div>
  `).join('');
}

/* ── WORDCLOUD ── */
function renderizarWordCloud(posts) {
  const stopwords = new Set(['de','a','o','e','em','que','do','da','no','na','um','uma','para','com','se','por','mais','mas','como','seu','sua','os','as','dos','das','pelo','pela','também','ou','aos','nas','nos','foi','esse','essa','são','bem','já','sobre','isso','quando','então','pode','há','só','até','essa','está','ser','ter','não','lá','eu','me','te','ele','ela','nós','eles','você']);
  const freq = {};

  posts.forEach(p => {
    const texto = ((p.texto || '') + ' ' + (p.descricao || '')).toLowerCase();
    texto.replace(/[^\wáéíóúãõâêîôûàèìòùç\s]/g, '').split(/\s+/).forEach(w => {
      if (w.length > 3 && !stopwords.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
  });

  const palavras = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 40);
  const maxFreq = palavras[0]?.[1] || 1;

  const el = document.getElementById("wordcloud");
  el.innerHTML = palavras.map(([word, count]) => {
    const t = count / maxFreq;
    const size = 0.72 + t * 1.5;
    const isPosWord = POSITIVOS.some(p => word.includes(p));
    const isNegWord = NEGATIVOS.some(n => word.includes(n));
    const color = isPosWord ? `rgba(74,222,128,${0.5+t*0.5})` : isNegWord ? `rgba(248,113,113,${0.5+t*0.5})` : `rgba(139,163,199,${0.3+t*0.5})`;
    const bg = isPosWord ? 'rgba(74,222,128,.08)' : isNegWord ? 'rgba(248,113,113,.08)' : 'rgba(255,255,255,.04)';
    return `<span class="wc-word" style="font-size:${size}rem;color:${color};background:${bg}" title="${count}x">${word}</span>`;
  }).join('');
}

/* ========================
   POSTS COLAPSÁVEIS
======================== */
function filtrarPosts(tipo, btn) {
  filtroAtivo = tipo;
  paginaAtual = 1;

  // Atualizar botões
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (tipo === 'todos') postsFiltrados = [...todosOsPosts];
  else postsFiltrados = todosOsPosts.filter(p => obterClasse(p.sentimento) === tipo);

  renderizarPagina();
}

function renderizarPagina() {
  const inicio = (paginaAtual - 1) * POSTS_POR_PAGINA;
  const fim = inicio + POSTS_POR_PAGINA;
  const pagePosts = postsFiltrados.slice(inicio, fim);

  const container = document.getElementById("posts-list");
  container.innerHTML = '';

  if (!pagePosts.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:40px">Nenhuma publicação encontrada.</div>';
    document.getElementById("posts-pagination").innerHTML = '';
    return;
  }

  pagePosts.forEach((post, i) => renderizarPostCard(post, i, container));
  renderizarPaginacao();
}

function renderizarPostCard(post, i, container) {
  const cls = obterClasse(post.sentimento);
  const icone = cls === 'pos' ? '😊' : cls === 'neg' ? '😡' : '😐';
  const data = new Date(post.dataPost).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

  const palavrasPos = POSITIVOS.filter(p => (post.textoCompleto || '').includes(p));
  const palavrasNeg = NEGATIVOS.filter(p => (post.textoCompleto || '').includes(p));
  const score = post.score || 0;

  const card = document.createElement('div');
  card.className = `post-card ${cls}`;
  card.dataset.index = i;

  card.innerHTML = `
    <div class="post-header" onclick="togglePost(this.closest('.post-card'))">
      <div class="post-sentiment-icon">${icone}</div>
      <div class="post-body">
        <div class="post-title">${escapar(post.texto)}</div>
        <div class="post-meta">
          <span class="post-badge ${cls}">${post.sentimento}</span>
          <span class="post-score-chip">Score ${score >= 0 ? '+' : ''}${score}</span>
          <span>📅 ${data}</span>
          <span>💬 ${post.comentarios} comentários</span>
        </div>
      </div>
      <div class="post-chevron">▾</div>
    </div>
    <div class="post-detail">
      ${post.descricao ? `
        <div class="post-desc" id="desc-${i}">
          ${escapar(post.descricao)}
          <div class="post-desc-fade" id="fade-${i}"></div>
        </div>
        <button class="btn-read-more" onclick="expandirDescricao(${i})">+ Ver descrição completa</button>
      ` : '<p style="font-size:.82rem;color:var(--txt3);margin-bottom:12px">Sem descrição disponível.</p>'}
      ${palavrasPos.length || palavrasNeg.length ? `
        <div class="post-words">
          <span class="post-words-label">Palavras-chave:</span>
          ${palavrasPos.map(w => `<span class="word-tag pos">+${w}</span>`).join('')}
          ${palavrasNeg.map(w => `<span class="word-tag neg">-${w}</span>`).join('')}
        </div>
      ` : ''}
      <div class="post-actions">
        <a class="post-link" href="${post.link}" target="_blank" rel="noopener">
          Abrir no Reddit ↗
        </a>
      </div>
    </div>
  `;

  container.appendChild(card);
}

function togglePost(card) {
  const isOpen = card.classList.contains('open');
  // Fechar todos
  document.querySelectorAll('.post-card.open').forEach(c => c.classList.remove('open'));
  if (!isOpen) card.classList.add('open');
}

function expandirDescricao(i) {
  const desc = document.getElementById(`desc-${i}`);
  const fade = document.getElementById(`fade-${i}`);
  if (!desc) return;
  desc.classList.add('expanded');
  if (fade) fade.style.display = 'none';
  const btn = desc.nextElementSibling;
  if (btn && btn.classList.contains('btn-read-more')) btn.style.display = 'none';
}

/* ── PAGINAÇÃO ── */
function renderizarPaginacao() {
  const total = postsFiltrados.length;
  const totalPags = Math.ceil(total / POSTS_POR_PAGINA);
  const pag = document.getElementById("posts-pagination");

  if (totalPags <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="irParaPagina(${paginaAtual-1})" ${paginaAtual===1?'disabled':''}>← Anterior</button>`;

  for (let p = 1; p <= totalPags; p++) {
    if (totalPags > 7 && p > 2 && p < totalPags - 1 && Math.abs(p - paginaAtual) > 1) {
      if (p === 3 || p === totalPags - 2) html += '<span style="color:var(--txt3);padding:0 4px">…</span>';
      continue;
    }
    html += `<button class="page-btn ${p===paginaAtual?'active':''}" onclick="irParaPagina(${p})">${p}</button>`;
  }

  html += `<button class="page-btn" onclick="irParaPagina(${paginaAtual+1})" ${paginaAtual===totalPags?'disabled':''}>Próxima →</button>`;
  pag.innerHTML = html;
}

function irParaPagina(p) {
  const total = Math.ceil(postsFiltrados.length / POSTS_POR_PAGINA);
  if (p < 1 || p > total) return;
  paginaAtual = p;
  renderizarPagina();
  document.querySelector('.posts-section-header')?.scrollIntoView({ behavior:'smooth' });
}

/* ========================
   UTILITÁRIOS
======================== */
function obterClasse(sentimento) {
  if (!sentimento) return 'neu';
  const s = sentimento.toLowerCase();
  if (s.includes('positivo')) return 'pos';
  if (s.includes('negativo')) return 'neg';
  return 'neu';
}

function escapar(txt) {
  if (!txt) return '';
  return txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mostrarTela(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function voltarBusca() {
  mostrarTela('tela-busca');
}

function exportarCSV() {
  if (!todosOsPosts.length) return;
  const header = ['Titulo','Sentimento','Score','Comentários','Data','Link'];
  const rows = todosOsPosts.map(p => [
    `"${(p.texto || '').replace(/"/g,'""')}"`,
    `"${p.sentimento}"`,
    p.score,
    p.comentarios,
    new Date(p.dataPost).toLocaleDateString('pt-BR'),
    `"${p.link}"`
  ].join(','));

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sentiment-radar.csv'; a.click();
  URL.revokeObjectURL(url);
}

// Enter para buscar
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar();
  });
  document.getElementById('searchInput2')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar();
  });
});