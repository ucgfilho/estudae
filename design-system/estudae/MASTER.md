# estudaê — padrões de interface

Revisão de 17/11/2026. Orientações aplicadas: Ponytail, UI UX Pro Max,
Responsive Design e UX Writing. A identidade, a família tipográfica e os
componentes existentes são a base deste sistema.

## Herança e composição

- `src/index.css` concentra os tokens de dimensões e cores semânticas.
- Telas internas usam `page-stack` e `PageHeader`: um título principal por tela.
- `Card`, `StatCard`, `EmptyState` e `Dialog` definem a hierarquia compartilhada.
- `Button`, `IconButton`, `Input`, `Select`, `DateInput`, `TimeInput` e o editor
  de texto reutilizam a escala de controles. Evite redefinir alturas por tela.
- `Field` associa rótulo, ajuda e erro ao controle visível. Grupos de opções
  usam `fieldset` e `legend`, em vez de um rótulo apontando para uma `div`.
- Use `stats-grid` para indicadores e `filter-grid` para filtros. As colunas
  acompanham o espaço disponível no conteúdo, inclusive com a barra lateral.

## Escala visual

| Elemento | Padrão |
| --- | --- |
| Título de página | 24 px no celular; 28 px a partir de 640 px |
| Título de seção ou diálogo | 16 px, semibold, entrelinha de 24 px |
| Texto e controles | 14 px; campos em telas menores que 1024 px usam pelo menos 16 px |
| Metadados e dicas | 12 px, com contraste e entrelinha para leitura |
| Espaço entre seções | `--page-gap`: 24 px |
| Espaço interno de painéis | `--panel-padding`: 16 px; 20 px a partir de 640 px |
| Campos e botões médios | mínimo de 40 px; 44 px abaixo de 1024 px |
| Botões pequenos / grandes | mínimo de 36 / 44 px; 44 / 48 px abaixo de 1024 px |
| Botões de ícone no celular | 44 px, inclusive na barra de formatação |
| Cantos | 8 px em controles, 12 px em painéis; cápsulas para estados curtos |

As alturas são mínimas: rótulos podem quebrar linha sem cortar o texto.
Exceções intencionais incluem cronômetro, gráficos, calendário mensal e anel
de progresso. Não imponha uma altura fixa aos cards para alinhar conteúdos diferentes.

## Cor, leitura e interação

O vermelho continua sendo a ação principal. No tema escuro, sua variante é
mais clara e usa texto vinho escuro nos botões. O texto de apoio foi ajustado
nos dois temas. As cores de disciplinas continuam sendo identificadores.

Textos longos quebram linha; truncamento fica reservado a listas e navegação.
Mantenha foco visível, estados selecionados explícitos e movimento reduzido.
Diálogos mantêm cabeçalho e ações visíveis enquanto o corpo rola. O menu
lateral fechado fica invisível em telas menores e não participa do foco.

## Escrita

- Português brasileiro, tom direto e acolhedor, títulos em caixa de frase.
- Use “disciplina”, “tópico”, “sessão”, “registrar questões” e “taxa de acerto”.
- Nomeie ações com verbo e objeto: “Salvar alterações”, “Registrar erro”.
- Ajude o estudante a decidir o próximo passo; evite fórmulas e jargão nos
  subtítulos quando uma instrução curta explica a mesma tarefa.
- Estados vazios explicam o que aparecerá ali e como começar.

## Cobertura da revisão

| Área | Ajuste principal |
| --- | --- |
| Login e cadastro | Controles herdados, identificação do acesso e textos mais diretos |
| Seleção de concurso | Hierarquia de títulos e leitura do nome e cargo sem corte de uma linha |
| Visão geral | Ritmo de seções, cards, indicadores e termos consistentes |
| Calendário | Cabeçalho e controles na escala compartilhada |
| Ciclo de estudos | Painel na escala de cards e grupo semântico para duração |
| Estudar agora | Textos de ações, campo de tópico rotulado e cabeçalho compacto com timer |
| Questões | Indicadores e filtros adaptáveis, rótulos associados e termos padronizados |
| Caderno de erros | Filtros e contadores adaptáveis, estado selecionado explícito |
| Revisões | Hierarquia herdada e estado vazio com orientação sobre o próximo agendamento |
| Simulados | Estrutura de página, formulários e indicadores herdados |
| Disciplinas | Hierarquia herdada e seleção de disciplina anunciada |
| Relatórios | Títulos concisos, indicadores adaptáveis e linhas que acomodam nomes longos |
| Configurações | Rótulos legíveis e descrições centradas nas decisões do estudante |
| Diálogos e editor | Espaçamento herdado, ações acessíveis e marcadores de seleção visíveis |

## Validação e limites

As 11 rotas internas foram abertas em 1440×900, 1024×768, 768×1024,
375×812, 320×640 e 812×375. A checagem inicial encontrou um único `h1`
por página e nenhum transbordamento horizontal do documento ou conteúdo
principal nas 66 combinações. Isso não substitui testes em aparelhos físicos.

Também foram exercitados registro de questões, criação de anotação, seleção
de gabarito, select dentro de diálogo e início, pausa e conclusão do cronômetro
com dados fictícios. Campos medidos: 40 px no desktop e 44 px no celular.
Marcadores de checkbox e radio selecionados: opacidade 1.

Verificações concluídas: `npm run typecheck`, `npm run build` e
`npm run test -- --maxWorkers=2` (227 testes, 22 arquivos). O lint terminou sem
erros e com quatro avisos preexistentes de Fast Refresh. Uma execução com
concorrência padrão excedeu o prazo de 1 segundo para carregar uma tela lazy;
a execução final com dois workers passou integralmente.

O servidor Vite padrão apresentou uma falha preexistente ao resolver imports
dinâmicos do plugin da API. A inspeção usou configuração temporária com imports
estáticos e banco SQLite separado. A configuração de produção não foi alterada.
