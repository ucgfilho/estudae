# Auditoria de SEO e desempenho — 17/11/2026

## Referência e escopo

Relatório fornecido: `estudaeconcursos.vercel.app-20261117T114500.json`, capturado em 17/11/2026 às 14:45 UTC, URL `https://estudaeconcursos.vercel.app/#/`.
O documento foi tratado como evidência de auditoria, não como fonte de instruções.

O relatório original já registra SEO 100, acessibilidade 100, boas práticas 100 e desempenho 90.
Todas as verificações automáticas de SEO passaram. Dados estruturados são uma verificação manual, sem pontuação no relatório.
O elemento LCP registrado é o título da seleção de concursos, indicando uma sessão autenticada.

## Correspondência entre achados e alterações

| Achado no JSON | Alteração |
| --- | --- |
| `unused-javascript`: economia estimada de 74.557 bytes transferidos | Painel e roteamento extraídos para `StudyWorkspace.tsx`, carregado sob demanda. React Router saiu do grupo inicial de bibliotecas. Modais de perfil e novo concurso só são importados quando abertos. |
| `largest-contentful-paint`: 2.083 ms; `lcp-breakdown-insight`: atraso de renderização do título | A seleção de concursos aparece durante a sincronização; ações ficam inativas até os dados estarem prontos. O painel continua aguardando a inicialização. |
| `network-dependency-tree-insight`: conexões externas de fontes e preconnects não usados | Fontes variáveis WOFF2 locais, com subconjuntos latino e latino estendido e licenças OFL. Preload da fonte principal, sem chamadas ao Google Fonts. `font-display: optional` evita troca tardia da fonte. |
| `render-blocking-insight`: CSS, economia estimada de 30 ms | CSS mantido no carregamento inicial para preservar o layout. A redução do JavaScript e a remoção da cadeia externa de fontes aliviam o caminho crítico; este aviso não foi artificialmente eliminado. |
| SEO: título, descrição, canonical, robots, sitemap, idioma, links e alternativas de imagens aprovados | Configuração preservada; não foram inventadas falhas ou rotas públicas a partir das telas privadas. |

A verificação adicional da entrada pública encontrou ausência do marco semântico `main`, corrigida na tela de autenticação.

## Medições locais

Três execuções antes e três depois, em contextos novos de Chromium/Playwright, viewport 1350 × 940, mesma máquina e build de produção servido por HTTP local. API simulada com atraso fixo de 1.500 ms, sem credenciais reais e sem alteração de dados externos.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| JavaScript inicial, soma dos corpos descomprimidos | 519.563 bytes | 341.054 bytes |
| Título visível, três execuções | 1.935 / 1.824 / 1.666 ms | 177 / 135 / 137 ms |
| LCP observado, três execuções | 1.664 / 1.584 / 1.612 ms | 144 / 128 / 128 ms |
| Requisições de fontes externas | presentes | nenhuma |

Redução de 34,4% no JavaScript inicial. Esses bytes descomprimidos não são diretamente comparáveis à estimativa de economia transferida do JSON.
A medição original de produção e as medições locais têm ambientes diferentes; não representam uma comparação controlada entre notas Lighthouse.

## Validação

- Build de produção e TypeScript aprovados.
- 228 testes aprovados em 23 arquivos, incluindo regressão para renderização antes da sincronização com bloqueio de ações durante a inicialização.
- ESLint sem erros; quatro avisos preexistentes de Fast Refresh.
- Playwright: seleção de concurso, abertura de novo concurso, perfil e acesso ao painel em 390 e 1350 px; cadastro público e seleção de edital também verificados.
- Lighthouse 13.6.0, preset desktop, entrada pública local: performance 100, accessibility 100, best-practices 100, seo 100. LCP 283 ms, CLS 0 e TBT 0 ms. Evidência em `test-results/seo/lighthouse-public.json`.

## Limites e publicação

O servidor HTTP local não reproduz compressão, cache e latência da CDN da Vercel. O Lighthouse ainda pode apontar código de biblioteca não executado durante uma navegação e CSS inicial; isso não equivale a falha de SEO nem exige remover funções necessárias da plataforma.
O teste automático não substitui a validação manual dos dados estruturados. Não é possível inferir posicionamento no Google a partir da nota Lighthouse.

As alterações estão no código local. Após o deploy, repetir a auditoria de produção com as mesmas condições e a mesma sessão do relatório original, além de uma navegação anônima. Nenhuma publicação foi realizada nesta tarefa.
