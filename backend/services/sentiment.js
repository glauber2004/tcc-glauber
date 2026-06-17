const { positivo, negativo } = require("./lexicon");

// ─── Termos de negação ────────────────────────────────────────────────────────
// Palavras que invertem o sentido da palavra de sentimento seguinte
const TERMOS_NEGACAO = new Set([
  "não", "nao", "nem", "nunca", "jamais",
  "nenhum", "nenhuma", "ninguém",
  "sem", "isento", "isenta",
  "nega", "negou", "negado", "negada", "negam",
  "recusa", "recusou", "recusado", "recusada",
  "rejeita", "rejeitou", "rejeitado", "rejeitada",
  "cancela", "cancelou", "cancelado", "cancelada",
  "impede", "impediu", "impedido", "impedida",
  "proíbe", "proibiu", "proibido", "proibida",
  "bloqueia", "bloqueou", "bloqueado", "bloqueada",
]);

// ─── Termos de descarte ───────────────────────────────────────────────────────
// Diferente da negação comum: "descarta caso de ebola" é POSITIVO (risco afastado)
// mas "descarta vacina" é NEGATIVO (abandona algo bom).
// Por isso tratamos separado — o descarte inverte palavras NEGATIVAS de domínio
// mas não afeta palavras positivas gerais.
const TERMOS_DESCARTE = new Set([
  "descarta", "descartou", "descartado", "descartada", "descartam",
  "afasta", "afastou", "afastado", "afastada",
  "exclui", "excluiu", "excluído", "excluída",
  "suspende", "suspendeu", "suspenso", "suspensa",
  "encerra", "encerrou", "encerrado", "encerrada",
  "derruba", "derrubou", "derrubado", "derrubada",
]);

// ─── Termos intensificadores ──────────────────────────────────────────────────
const TERMOS_INTENSIFICADOR = new Set([
  "muito", "demais", "bastante", "extremamente", "super",
  "ultra", "mega", "hiper", "incrivelmente", "absurdamente",
  "completamente", "totalmente", "absolutamente", "profundamente",
  "imensamente", "terrivelmente", "horrivelmente", "maravilhosamente",
  "excepcionalmente", "extraordinariamente",
]);

// ─── Stopwords ────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "a","o","as","os","um","uma","uns","umas",
  "de","do","da","dos","das","em","no","na","nos","nas",
  "ao","aos","à","às","pelo","pela","pelos","pelas",
  "por","para","com","sob","sobre","entre","até",
  "desde","após","ante","perante","conforme","segundo",
  "que","e","ou","mas","porém","contudo","todavia",
  "porque","pois","se","como","quando","enquanto",
  "é","são","foi","foram","ser","estar","ter","há",
  "eu","tu","ele","ela","nós","vós","eles","elas",
  "me","te","se","nos","vos","lhe","lhes",
  "isso","este","esta","esse","essa","aquele","aquela",
  // falsos positivos por nomes próprios de cidades/pessoas
  "alegre","bela","linda","paz","graça","vitoria","vitória","leal",
  ...TERMOS_NEGACAO,
  ...TERMOS_DESCARTE,
  ...TERMOS_INTENSIFICADOR,
]);

// ─── Domínios contextuais ─────────────────────────────────────────────────────
// Cada domínio define:
//   gatilhos: palavras que ativam o domínio quando encontradas no texto
//   negativos_extras: palavras que SÓ são negativas nesse contexto
//   positivos_invalidos: palavras do léxico positivo que perdem valor nesse contexto
//
// Isso resolve: "casos subindo" → neutro normalmente, negativo em contexto de saúde
const DOMINIOS = [
  {
    nome: "saude",
    gatilhos: [
      "ebola","covid","dengue","gripe","influenza","vírus","virus",
      "doença","doencas","epidemia","pandemia","surto","contágio",
      "infecção","infeccao","infectado","contaminação","contaminado",
      "hospital","uti","internado","internada","internação","paciente",
      "óbito","morte","mortes","morreu","faleceu","vítima","vítimas",
      "monkeypox","varíola","sarampo","tuberculose","hiv","aids",
      "câncer","cancer","tumor","diagnóstico","sintoma","sintomas",
      "isolamento","quarentena","lockdown",
      "meningite","hepatite","febre","malária","malaria",
      "surto","alerta sanitário","emergência sanitária",
    ],
    negativos_extras: [
      // verbos de crescimento que em saúde = coisa ruim
      "subindo","sobe","sobem","subiu","subiram",
      "aumentando","aumentou","aumentaram","aumento","aumenta",
      "crescendo","cresceu","cresceram","crescimento","cresce",
      "disparou","disparando","dispara","disparam","dispararam",
      "agravou","agravando","agrava","agravamento",
      "piorou","piorando","piora","pioras",
      "alastrou","alastrar","alastrando","alastramento",
      "se espalhou","espalhando","espalhou",
      "surto","novo caso","novos casos","novo surto","nova onda",
      "recorde","recordes","recorde de casos","recorde de mortes",
      "casos confirmados","morte confirmada","óbito confirmado",
      "suspeita","suspeito","sob suspeita","caso suspeito",
      "investigando","investiga","sob investigação",
      "vigilância","alerta","estado de alerta",
      "protocolo","protocolos","medida restritiva",
    ],
    positivos_invalidos: [
      // palavras positivas que perdem sentido em notícias de doença
      "subindo","crescimento","avanço","recorde","novo",
    ],
  },
  {
    nome: "violencia",
    gatilhos: [
      "crime","crimes","violência","violencia","assassinato","homicídio",
      "roubo","furto","assalto","tráfico","drogas","arma","armas",
      "bala","tiro","tiroteio","morte","mortes","vítima","vítimas",
      "preso","prisão","detido","detida","operação policial",
    ],
    negativos_extras: [
      "subindo","aumentando","crescendo","disparou","agravou","piorou",
      "novo caso","novos casos","recorde","alto índice",
    ],
    positivos_invalidos: [
      "subindo","crescimento","recorde",
    ],
  },
  {
    nome: "politica_crise",
    gatilhos: [
      "crise","escândalo","corrupção","impeachment","fraude",
      "golpe","protesto","manifestação","greve","colapso",
    ],
    negativos_extras: [
      "subindo","aumentando","crescendo","agravou","piorou",
      "tensão aumentando","crise se aprofunda",
    ],
    positivos_invalidos: [
      "subindo","crescimento",
    ],
  },
];

// ─── Detecta domínio ativo no texto ──────────────────────────────────────────
function detectarDominio(textoLower) {
  for (const dominio of DOMINIOS) {
    if (dominio.gatilhos.some(g => textoLower.includes(g))) {
      return dominio;
    }
  }
  return null;
}

// ─── Pré-processa léxico ──────────────────────────────────────────────────────
const positivoSimples  = positivo.filter(p => !p.includes(" ") && !STOPWORDS.has(p));
const positivoComposto = positivo.filter(p =>  p.includes(" "));
const negativoSimples  = negativo.filter(p => !p.includes(" ") && !STOPWORDS.has(p));
const negativoComposto = negativo.filter(p =>  p.includes(" "));

// ─── Tokenizador ─────────────────────────────────────────────────────────────
function tokenizar(texto) {
  return texto
    .toLowerCase()
    .replace(/[,;]/g, " __sep__ ")
    .replace(/[^\w\s__áàãâäéèêëíìîïóòõôöúùûüçñ]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// ─── Match de token ───────────────────────────────────────────────────────────
function matchToken(token, entrada) {
  if (token === entrada) return true;
  if (token === entrada + "s") return true;
  if (entrada.endsWith("o")  && token === entrada.slice(0,-1) + "a")  return true;
  if (entrada.endsWith("a")  && token === entrada.slice(0,-1) + "o")  return true;
  if (entrada.endsWith("os") && token === entrada.slice(0,-2) + "as") return true;
  if (entrada.endsWith("as") && token === entrada.slice(0,-2) + "os") return true;
  return false;
}

// ─── Verifica negação antes de expressão composta ────────────────────────────
function expressaoNegada(textoLower, expressao) {
  const idx = textoLower.indexOf(expressao);
  if (idx === -1) return false;
  const antes = textoLower.slice(Math.max(0, idx - 35), idx);
  return [...TERMOS_NEGACAO].some(n => {
    const ni = antes.lastIndexOf(n);
    if (ni === -1) return false;
    return !antes.slice(ni).includes(",");
  });
}

// ─── Verifica descarte antes de um trecho do texto ───────────────────────────
function temDescarteAntes(textoLower, idx) {
  const antes = textoLower.slice(Math.max(0, idx - 40), idx);
  return [...TERMOS_DESCARTE].some(d => antes.includes(d));
}

// ─── Função principal ─────────────────────────────────────────────────────────
function analisarSentimento(texto) {
  const textoLower = texto.toLowerCase();
  const tokens     = tokenizar(textoLower);
  const dominio    = detectarDominio(textoLower);
  let score        = 0;
  const detalhes   = [];

  // ── 1. Negativos extras de domínio ───────────────────────────────────────
  // Ex: "subindo" em contexto de saúde → negativo
  // Usa Set para evitar double-count quando variantes do mesmo termo batem
  // (ex: "dispara" e "disparam" não devem contar duas vezes)
  if (dominio) {
    const termosDominioContados = new Set();
    dominio.negativos_extras.forEach(termo => {
      if (!textoLower.includes(termo)) return;
      // Agrupa por raiz: se "dispara" já foi contado, pula "disparam"
      const raiz = termo.slice(0, 6);
      if (termosDominioContados.has(raiz)) return;
      termosDominioContados.add(raiz);
      const idx    = textoLower.indexOf(termo);
      const negado = temDescarteAntes(textoLower, idx);
      const delta  = negado ? 1 : -1;
      score += delta;
      detalhes.push({ match: termo, tipo: "dominio_negativo", dominio: dominio.nome, negado, delta });
    });
  }

  // ── 2. Expressões compostas do léxico ─────────────────────────────────────
  const expressoesMarcadas = new Set();
  // Rastreia tokens de negação já consumidos por expressões compostas
  // (evita que "não recomendo horrível" trate "horrível" como negado)
  const negacoesConsumidas = new Set();

  positivoComposto.forEach(expr => {
    if (!textoLower.includes(expr)) return;
    if (dominio && dominio.positivos_invalidos.includes(expr)) return;
    const negado = expressaoNegada(textoLower, expr);
    if (negado) {
      // Marca os tokens de negação dentro da expressão como consumidos
      expr.split(" ").filter(t => TERMOS_NEGACAO.has(t)).forEach(t => negacoesConsumidas.add(t));
      // Também marca negações do léxico que aparecem imediatamente antes
      [...TERMOS_NEGACAO].forEach(n => { if (textoLower.includes(n + " " + expr.split(" ")[0])) negacoesConsumidas.add(n); });
    }
    const delta = negado ? -1 : 1;
    score += delta;
    detalhes.push({ match: expr, tipo: "positivo", negado, delta });
    expr.split(" ").forEach(t => expressoesMarcadas.add(t));
  });

  negativoComposto.forEach(expr => {
    if (!textoLower.includes(expr)) return;
    const idx    = textoLower.indexOf(expr);
    const negado = expressaoNegada(textoLower, expr) || temDescarteAntes(textoLower, idx);
    if (negado) {
      expr.split(" ").filter(t => TERMOS_NEGACAO.has(t)).forEach(t => negacoesConsumidas.add(t));
      [...TERMOS_NEGACAO].forEach(n => { if (textoLower.includes(n + " " + expr.split(" ")[0])) negacoesConsumidas.add(n); });
    }
    const delta = negado ? 1 : -1;
    score += delta;
    detalhes.push({ match: expr, tipo: "negativo", negado, delta });
    expr.split(" ").forEach(t => expressoesMarcadas.add(t));
  });

  // ── 3. Tokens simples ─────────────────────────────────────────────────────
  let negacaoAtiva  = false;
  let descarteAtivo = false;
  let intensAtivo   = false;

  tokens.forEach(token => {
    // Vírgula/ponto-e-vírgula: reseta negação não consumida
    // (ex: "não é bom, péssima" → negação foi para "bom", não vaza para "péssima")
    if (token === "__sep__") {
      negacaoAtiva  = false;
      descarteAtivo = false;
      intensAtivo   = false;
      return;
    }

    if (TERMOS_NEGACAO.has(token)) {
      // Só ativa negação se esse token ainda não foi consumido por expressão composta
      if (!negacoesConsumidas.has(token)) negacaoAtiva = true;
      return;
    }
    if (TERMOS_DESCARTE.has(token))   { descarteAtivo = true; return; }
    if (TERMOS_INTENSIFICADOR.has(token)) { intensAtivo = true; return; }
    if (STOPWORDS.has(token) || token.length < 4) return;
    if (expressoesMarcadas.has(token)) return;

    // Ignora palavras positivas inválidas no domínio atual
    if (dominio && dominio.positivos_invalidos.some(inv => matchToken(token, inv))) return;

    const multiplicador = intensAtivo ? 2 : 1;
    intensAtivo = false;

    // ── Match positivo ──
    const matchPos = positivoSimples.find(p => matchToken(token, p));
    if (matchPos) {
      // Negação comum inverte positivo → negativo
      // Descarte NÃO afeta palavras positivas (descartou vacina ≠ bom)
      const delta = negacaoAtiva ? -1 * multiplicador : 1 * multiplicador;
      score += delta;
      detalhes.push({ token, match: matchPos, tipo: "positivo", negado: negacaoAtiva, descartado: false, delta });
      negacaoAtiva = false;
      descarteAtivo = false;
      return;
    }

    // ── Match negativo ──
    const matchNeg = negativoSimples.find(p => matchToken(token, p));
    if (matchNeg) {
      // Tanto negação comum quanto descarte invertem negativo → positivo
      const invertido = negacaoAtiva || descarteAtivo;
      const delta = invertido ? 1 * multiplicador : -1 * multiplicador;
      score += delta;
      detalhes.push({ token, match: matchNeg, tipo: "negativo", negado: negacaoAtiva, descartado: descarteAtivo, delta });
      negacaoAtiva  = false;
      descarteAtivo = false;
    }
  });

  // ── Rótulo final ──────────────────────────────────────────────────────────
  let sentimento = "😐 Neutro";
  if      (score >=  2) sentimento = "😊 Muito positivo";
  else if (score >=  1) sentimento = "🙂 Positivo";
  else if (score === 0) sentimento = "😐 Neutro";
  else if (score >= -1) sentimento = "🙁 Negativo";
  else                  sentimento = "😡 Muito negativo";

  return { sentimento, score, detalhes };
}

module.exports = { analisarSentimento };