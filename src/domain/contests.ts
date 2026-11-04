import { EDITAL_VERTICALIZADO_BNB_2022, DEFAULT_DISCIPLINES } from '../db/seed';
import type { Discipline, DisciplineKind, Topic } from '../db/types';

export interface ContestCatalogItem {
  id: string;
  name: string;
  sigla: string;
  role: string;
  banca: string;
  category: 'Bancários' | 'Tecnologia (TI)' | 'Policiais' | 'Fiscais e Controle' | 'Tribunais' | 'Administrativos' | 'Personalizado';
  color: string;
  disciplines: Array<{
    id: string;
    name: string;
    kind: DisciplineKind;
    topics: string[];
  }>;
}

export const DISCIPLINE_PALETTE = [
  '#f68b1f',
  '#a6193c',
  '#0996b6',
  '#07a684',
  '#ba2172',
  '#ffcb05',
  '#004b2c',
  '#1769aa',
  '#c20018',
  '#646464',
];

export const CONTEST_CATALOG: ContestCatalogItem[] = [
  {
    id: 'bnb-ti',
    name: 'Banco do Nordeste (BNB)',
    sigla: 'BNB',
    role: 'Analista de Sistemas — Desenvolvimento de Sistemas',
    banca: 'CESGRANRIO / CEBRASPE',
    category: 'Tecnologia (TI)',
    color: '#A6193C',
    disciplines: DEFAULT_DISCIPLINES.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      topics: [...(EDITAL_VERTICALIZADO_BNB_2022[d.id] ?? [])],
    })),
  },
  {
    id: 'bnb-bancario',
    name: 'Banco do Nordeste (BNB)',
    sigla: 'BNB',
    role: 'Analista Bancário',
    banca: 'CESGRANRIO',
    category: 'Bancários',
    color: '#F68B1F',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Compreensão e interpretação de textos.',
          'Ortografia oficial e acentuação gráfica.',
          'Coesão e coerência textual.',
          'Classes de palavras e sintaxe do período.',
          'Concordância verbal e nominal.',
          'Regência verbal e nominal e emprego da crase.',
          'Pontuação e reescrita de períodos.',
        ],
      },
      {
        id: 'matematica-financeira',
        name: 'Matemática e Raciocínio Lógico-Quantitativo',
        kind: 'general',
        topics: [
          'Lógica proposicional e tabelas-verdade.',
          'Juros simples e compostos.',
          'Sistemas de amortização (SAC e Price).',
          'Taxas de juros: nominal, efetiva, equivalente e real.',
          'Probabilidade, análise combinatória e estatística básica.',
          'Desconto simples e composto.',
        ],
      },
      {
        id: 'conhecimentos-bancarios',
        name: 'Conhecimentos Bancários',
        kind: 'technical',
        topics: [
          'Sistema Financeiro Nacional (SFN): estrutura e órgãos normativos.',
          'Conselho Monetário Nacional (CMN), Banco Central do Brasil (BACEN) e CVM.',
          'Produtos e serviços bancários: contas, cartões, crédito e investimentos.',
          'Operações de crédito bancário, garantias (fidejussórias e reais).',
          'Prevenção à lavagem de dinheiro (Lei nº 9.613/1998 e normas do BACEN).',
          'Autorregulação bancária, ética, LGPD e segurança cibernética.',
          'Fundo Constitucional de Financiamento do Nordeste (FNE) e atuação do BNB.',
          'Mercado de câmbio, mercado de capitais e derivativos.',
        ],
      },
    ],
  },
  {
    id: 'bb-ti',
    name: 'Banco do Brasil (BB)',
    sigla: 'BB',
    role: 'Agente de Tecnologia (TI)',
    banca: 'CESGRANRIO',
    category: 'Tecnologia (TI)',
    color: '#0996B6',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Compreensão de textos e mecanismos de coesão.',
          'Ortografia oficial, concordância e regência.',
          'Crase, colocação pronominal e pontuação.',
        ],
      },
      {
        id: 'ingles',
        name: 'Língua Inglesa',
        kind: 'general',
        topics: [
          'Compreensão de textos técnicos em língua inglesa.',
          'Vocabulário e estruturas gramaticais aplicadas à tecnologia.',
        ],
      },
      {
        id: 'matematica',
        name: 'Matemática',
        kind: 'general',
        topics: [
          'Lógica proposicional, conjuntos, funções e matrizes.',
          'Análise combinatória e probabilidade.',
        ],
      },
      {
        id: 'probabilidade-estatistica',
        name: 'Probabilidade e Estatística',
        kind: 'technical',
        topics: [
          'Medidas de tendência central e dispersão.',
          'Distribuições de probabilidade (Binomial, Normal, Poisson).',
          'Inferência estatística, intervalos de confiança e testes de hipóteses.',
        ],
      },
      {
        id: 'tecnologia-informacao',
        name: 'Tecnologia da Informação e Desenvolvimento',
        kind: 'technical',
        topics: [
          'Aprendizado de máquina (Machine Learning) e Ciência de Dados.',
          'Banco de Dados Relacionais (SQL, PostgreSQL, Oracle) e NoSQL (MongoDB, Redis).',
          'Big Data, Data Warehouse, ETL e processamento distribuído (Spark/Hadoop).',
          'Desenvolvimento Java, TypeScript, Python e React.',
          'Desenvolvimento Mobile (Android/Kotlin e iOS/Swift).',
          'Engenharia de Software, Scrum, Kanban, TDD e CI/CD.',
          'Segurança da Informação, criptografia e OWASP Top 10.',
        ],
      },
      {
        id: 'conhecimentos-bancarios',
        name: 'Conhecimentos Bancários e Atualidades do Mercado Financeiro',
        kind: 'technical',
        topics: [
          'Sistema Financeiro Nacional, PIX, Open Finance e Drex.',
          'Bancos digitais, fintechs e transformação digital no setor bancário.',
          'Produtos bancários, garantias e prevenção à lavagem de dinheiro.',
        ],
      },
    ],
  },
  {
    id: 'bb-comercial',
    name: 'Banco do Brasil (BB)',
    sigla: 'BB',
    role: 'Agente Comercial (Escriturário)',
    banca: 'CESGRANRIO',
    category: 'Bancários',
    color: '#FFCB05',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Compreensão e interpretação de textos.',
          'Ortografia, morfossintaxe, concordância e regência.',
        ],
      },
      {
        id: 'matematica-financeira',
        name: 'Matemática Financeira',
        kind: 'general',
        topics: [
          'Juros simples e compostos.',
          'Taxas de juros, séries de pagamentos e sistemas de amortização.',
        ],
      },
      {
        id: 'conhecimentos-bancarios',
        name: 'Conhecimentos Bancários',
        kind: 'technical',
        topics: [
          'Sistema Financeiro Nacional (SFN) e políticas econômicas.',
          'Produtos e serviços financeiros, crédito e mercado de capitais.',
          'Crime de lavagem de dinheiro, ética e LGPD.',
        ],
      },
      {
        id: 'vendas-negociacao',
        name: 'Vendas e Negociação',
        kind: 'technical',
        topics: [
          'Estratégias de marketing, segmentação e experiência do cliente.',
          'Técnicas de vendas de produtos financeiros e qualidade no atendimento.',
          'Código de Defesa do Consumidor e Ouvidoria.',
        ],
      },
      {
        id: 'informatica',
        name: 'Conhecimentos de Informática',
        kind: 'technical',
        topics: [
          'Sistemas operacionais (Windows e Linux) e pacote Office 365.',
          'Segurança da informação, redes de computadores e navegadores.',
        ],
      },
    ],
  },
  {
    id: 'cef-ti',
    name: 'Caixa Econômica Federal (CEF)',
    sigla: 'CEF',
    role: 'Técnico Bancário Novo — Tecnologia da Informação',
    banca: 'CESGRANRIO',
    category: 'Tecnologia (TI)',
    color: '#1769AA',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa e Inglês',
        kind: 'general',
        topics: [
          'Compreensão de textos, gramática normativa e redação oficial.',
          'Inglês técnico aplicado a sistemas de informação.',
        ],
      },
      {
        id: 'matematica-financeira',
        name: 'Matemática Financeira e Estatística',
        kind: 'general',
        topics: [
          'Juros simples, compostos e amortização SAC/Price.',
          'Estatística descritiva e probabilidades.',
        ],
      },
      {
        id: 'engenharia-software',
        name: 'Engenharia de Software e Agilidade',
        kind: 'technical',
        topics: [
          'Ciclo de vida de software, requisitos, UML e padrões de projeto (GoF).',
          'Scrum, Kanban, XP, DevOps e arquitetura de microsserviços.',
          'Qualidade e testes de software (TDD, BDD, testes automatizados).',
        ],
      },
      {
        id: 'linguagens-bd',
        name: 'Linguagens de Programação e Banco de Dados',
        kind: 'technical',
        topics: [
          'Java EE / Quarkus / Spring Boot, JavaScript, TypeScript e Python.',
          'Modelagem de dados, SQL avançado e bancos NoSQL.',
          'Arquitetura Cloud, containers (Docker/Kubernetes) e segurança OWASP.',
        ],
      },
    ],
  },
  {
    id: 'cef-geral',
    name: 'Caixa Econômica Federal (CEF)',
    sigla: 'CEF',
    role: 'Técnico Bancário Novo (Geral)',
    banca: 'CESGRANRIO',
    category: 'Bancários',
    color: '#07A684',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Compreensão textual, ortografia, concordância, regência e crase.',
        ],
      },
      {
        id: 'matematica-financeira',
        name: 'Matemática Financeira',
        kind: 'general',
        topics: [
          'Conceitos financeiros, juros simples e compostos, sistemas SAC e Price.',
        ],
      },
      {
        id: 'conhecimentos-bancarios',
        name: 'Conhecimentos Bancários',
        kind: 'technical',
        topics: [
          'SFN, FGTS, programas sociais, habitação e operações de crédito.',
          'Prevenção à lavagem de dinheiro, LGPD e conformidade.',
        ],
      },
      {
        id: 'atendimento-comportamentos',
        name: 'Atendimento Bancário e Comportamentos Digitais',
        kind: 'technical',
        topics: [
          'Vendas consultivas, relacionamento com clientes, CDC e ética bancária.',
          'Mindset ágil, inovação e transformação digital.',
        ],
      },
    ],
  },
  {
    id: 'bacen-ti',
    name: 'Banco Central do Brasil (BACEN)',
    sigla: 'BACEN',
    role: 'Analista — Tecnologia da Informação',
    banca: 'CEBRASPE',
    category: 'Tecnologia (TI)',
    color: '#004B2C',
    disciplines: [
      {
        id: 'portugues-logica',
        name: 'Língua Portuguesa e Raciocínio Lógico',
        kind: 'general',
        topics: [
          'Interpretação textual, reescrita e gramática normativa.',
          'Lógica proposicional, quantificadores e análise combinatória.',
        ],
      },
      {
        id: 'sfn-direito',
        name: 'Sistema Financeiro Nacional e Direito Administrativo',
        kind: 'general',
        topics: [
          'Estrutura e regulação do Sistema Financeiro Nacional.',
          'Atos administrativos, licitações (Lei nº 14.133/2021) e agentes públicos.',
        ],
      },
      {
        id: 'ciencia-dados-ia',
        name: 'Ciência de Dados e Inteligência Artificial',
        kind: 'technical',
        topics: [
          'Aprendizado supervisionado, não supervisionado e Deep Learning.',
          'Engenharia de dados, pipelines ETL/ELT, Data Lakehouse e governança.',
        ],
      },
      {
        id: 'engenharia-arquitetura',
        name: 'Engenharia e Arquitetura de Software',
        kind: 'technical',
        topics: [
          'Arquitetura limpa, DDD, microsserviços, APIs REST/gRPC e mensageria.',
          'DevSecOps, CI/CD, observabilidade e nuvem híbrida.',
        ],
      },
      {
        id: 'seguranca-infra',
        name: 'Segurança da Informação e Infraestrutura',
        kind: 'technical',
        topics: [
          'Criptografia, ICP-Brasil, gestão de identidade (IAM) e ISO 27001.',
          'Redes, Kubernetes, alta disponibilidade e resposta a incidentes.',
        ],
      },
    ],
  },
  {
    id: 'cnu-ti',
    name: 'Concurso Nacional Unificado (CNU)',
    sigla: 'CNU',
    role: 'Analista em Tecnologia da Informação (ATI / IBGE / DATAPREV)',
    banca: 'CESGRANRIO / FGV',
    category: 'Tecnologia (TI)',
    color: '#BA2172',
    disciplines: [
      {
        id: 'politicas-publicas',
        name: 'Políticas Públicas, Estado e Direito Constitucional',
        kind: 'general',
        topics: [
          'Constituição Federal: direitos fundamentais e organização do Estado.',
          'Ciclo de políticas públicas, ética, transparência e governo digital.',
        ],
      },
      {
        id: 'gestao-governanca-ti',
        name: 'Gestão e Governança de TI',
        kind: 'technical',
        topics: [
          'COBIT 2019, ITIL 4, PMBOK 7 e métodos ágeis (Scrum, Kanban, SAFe).',
          'Contratações de TIC no setor público (IN SGD/ME nº 94/2022 e Lei 14.133/2021).',
        ],
      },
      {
        id: 'engenharia-desenvolvimento',
        name: 'Engenharia de Software e Desenvolvimento de Sistemas',
        kind: 'technical',
        topics: [
          'Arquitetura de software, microsserviços, APIs, DevOps e qualidade de código.',
          'Desenvolvimento web moderno, padrões de projeto e testes automatizados.',
        ],
      },
      {
        id: 'dados-seguranca',
        name: 'Ciência de Dados, Bancos de Dados e Segurança da Informação',
        kind: 'technical',
        topics: [
          'Modelagem relacional e dimensional, SQL, NoSQL, BI e Machine Learning.',
          'Segurança cibernética, LGPD, gestão de riscos (ISO 27005) e nuvem.',
        ],
      },
    ],
  },
  {
    id: 'pf-agente',
    name: 'Polícia Federal (PF)',
    sigla: 'PF',
    role: 'Agente / Escrivão de Polícia Federal',
    banca: 'CEBRASPE',
    category: 'Policiais',
    color: '#1A1A1A',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Compreensão e interpretação de textos, tipologia textual e reescrita.',
          'Ortografia, morfossintaxe, pontuação, concordância, regência e crase.',
        ],
      },
      {
        id: 'raciocinio-estatistica',
        name: 'Raciocínio Lógico e Estatística',
        kind: 'general',
        topics: [
          'Lógica sentencial e de primeira ordem, tabelas-verdade e diagramas.',
          'Probabilidade, variáveis aleatórias, distribuição normal e amostragem.',
        ],
      },
      {
        id: 'direito-penal-processual',
        name: 'Direito Administrativo, Constitucional, Penal e Processual Penal',
        kind: 'technical',
        topics: [
          'Direitos e garantias fundamentais e Segurança Pública (art. 144 da CF).',
          'Inquérito policial, provas, prisões e leis penais especiais.',
          'Poderes administrativos, atos administrativos e responsabilidade civil.',
        ],
      },
      {
        id: 'informatica-pf',
        name: 'Informática e Tecnologia da Informação (Peso Máximo)',
        kind: 'technical',
        topics: [
          'Redes de computadores, modelo OSI, TCP/IP, DNS, HTTP/HTTPS e roteamento.',
          'Segurança da informação: malware, firewall, IDS/IPS, VPN e criptografia.',
          'Banco de dados, modelagem, SQL, Data Warehouse, Big Data e mineração de dados.',
          'Programação em Python e R, APIs e sistemas operacionais Linux/Windows.',
        ],
      },
      {
        id: 'contabilidade-geral',
        name: 'Contabilidade Geral',
        kind: 'technical',
        topics: [
          'Patrimônio, contas patrimoniais e de resultado, escrituração e balancete.',
          'Balanço Patrimonial e Demonstração do Resultado do Exercício (DRE) — Lei 6.404/1976.',
        ],
      },
    ],
  },
  {
    id: 'prf-policial',
    name: 'Polícia Rodoviária Federal (PRF)',
    sigla: 'PRF',
    role: 'Policial Rodoviário Federal',
    banca: 'CEBRASPE',
    category: 'Policiais',
    color: '#0996B6',
    disciplines: [
      {
        id: 'portugues-raciocinio',
        name: 'Língua Portuguesa, Raciocínio Lógico e Informática',
        kind: 'general',
        topics: [
          'Interpretação de textos, gramática aplicada e redação oficial.',
          'Raciocínio matemático, taxas, proporções e segurança em redes.',
        ],
      },
      {
        id: 'legislacao-transito',
        name: 'Legislação de Trânsito (CTB e Resoluções do CONTRAN)',
        kind: 'technical',
        topics: [
          'Código de Trânsito Brasileiro (Lei nº 9.503/1997): normas gerais de circulação.',
          'Infrações de trânsito, penalidades, medidas administrativas e crimes de trânsito.',
          'Resoluções do CONTRAN aplicáveis à fiscalização rodoviária federal.',
        ],
      },
      {
        id: 'direitos-prf',
        name: 'Direito Constitucional, Administrativo, Penal e Processual Penal',
        kind: 'technical',
        topics: [
          'Direitos fundamentais, poder de polícia e organização da segurança pública.',
          'Teoria do crime, crimes contra a Administração Pública e prisão em flagrante.',
        ],
      },
    ],
  },
  {
    id: 'rfb-auditor',
    name: 'Receita Federal do Brasil (RFB)',
    sigla: 'RFB',
    role: 'Auditor-Fiscal / Analista-Tributário',
    banca: 'FGV',
    category: 'Fiscais e Controle',
    color: '#A6193C',
    disciplines: [
      {
        id: 'portugues-raciocinio',
        name: 'Língua Portuguesa, Inglês e Raciocínio Lógico-Quantitativo',
        kind: 'general',
        topics: [
          'Interpretação textual avançada, argumentação e reescrita (banca FGV).',
          'Estatística, matemática financeira e lógica proposicional.',
        ],
      },
      {
        id: 'direito-tributario-legislacao',
        name: 'Direito Tributário e Legislação Tributária Federal',
        kind: 'technical',
        topics: [
          'Sistema Tributário Nacional, limitações ao poder de tributar e CTN.',
          'Obrigação e crédito tributário, suspensão, extinção e exclusão.',
          'Imposto de Renda (IRPF/IRPJ), IPI, PIS/PASEP, COFINS e Reforma Tributária.',
        ],
      },
      {
        id: 'contabilidade-auditoria',
        name: 'Contabilidade Geral, Avançada e Auditoria',
        kind: 'technical',
        topics: [
          'Pronunciamentos contábeis (CPCs), demonstrações financeiras e análise contábil.',
          'Normas de auditoria independente (NBC TA), amostragem e evidências.',
        ],
      },
      {
        id: 'comercio-internacional-aduaneira',
        name: 'Comércio Internacional e Legislação Aduaneira',
        kind: 'technical',
        topics: [
          'Jurisdição aduaneira, regimes aduaneiros especiais e tributos sobre o comércio exterior.',
          'Acordos da OMC, MERCOSUL, valoração aduaneira e controle aduaneiro.',
        ],
      },
      {
        id: 'fluencia-dados',
        name: 'Fluência em Dados e Administração Pública',
        kind: 'technical',
        topics: [
          'Banco de dados SQL, ciência de dados, Python/R e visualização analítica.',
          'Direito Constitucional, Administrativo e Administração Geral e Pública.',
        ],
      },
    ],
  },
  {
    id: 'tcu-auditor',
    name: 'Tribunal de Contas da União (TCU)',
    sigla: 'TCU',
    role: 'Auditor Federal de Controle Externo',
    banca: 'FGV / CEBRASPE',
    category: 'Fiscais e Controle',
    color: '#004B2C',
    disciplines: [
      {
        id: 'portugues-estatistica',
        name: 'Língua Portuguesa, Inglês e Estatística',
        kind: 'general',
        topics: [
          'Compreensão de textos, redação discursiva de controle e inferência estatística.',
        ],
      },
      {
        id: 'controle-externo-adm',
        name: 'Controle Externo e Direito Administrativo / Constitucional',
        kind: 'technical',
        topics: [
          'Competências constitucionais do TCU (arts. 70 a 75 da CF) e Lei Orgânica do TCU.',
          'Licitações e Contratos (Lei nº 14.133/2021), improbidade e responsabilidade fiscal (LRF).',
        ],
      },
      {
        id: 'auditoria-governamental-afi',
        name: 'Auditoria Governamental e Administração Financeira e Orçamentária (AFO)',
        kind: 'technical',
        topics: [
          'Normas Internacionais das Entidades Fiscalizadoras Superiores (ISSAI / NBASP).',
          'Orçamento público (PPA, LDO, LOA), créditos adicionais, receita e despesa pública.',
        ],
      },
      {
        id: 'analise-dados-ti',
        name: 'Análise de Dados e Tecnologia da Informação',
        kind: 'technical',
        topics: [
          'SQL, modelagem de dados, aprendizado de máquina, governança e segurança de TI.',
        ],
      },
    ],
  },
  {
    id: 'tse-unificado',
    name: 'TSE Unificado / TREs',
    sigla: 'TSE',
    role: 'Analista e Técnico Judiciário',
    banca: 'CEBRASPE',
    category: 'Tribunais',
    color: '#C20018',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Interpretação de textos, coesão, coerência e gramática normativa.',
        ],
      },
      {
        id: 'direito-eleitoral',
        name: 'Direito Eleitoral',
        kind: 'technical',
        topics: [
          'Código Eleitoral, Lei das Eleições (Lei nº 9.504/1997) e Partidos Políticos.',
          'Alistamento eleitoral, elegibilidade, inelegibilidades (LC nº 64/1990) e ações eleitorais.',
        ],
      },
      {
        id: 'direito-constitucional-adm',
        name: 'Direito Constitucional e Direito Administrativo',
        kind: 'technical',
        topics: [
          'Poder Judiciário, funções essenciais à Justiça e direitos políticos.',
          'Lei nº 8.112/1990, atos administrativos, poderes, licitações e processo administrativo.',
        ],
      },
      {
        id: 'especificas-cargo',
        name: 'Conhecimentos Específicos do Cargo (Judiciária / Administrativa / TI)',
        kind: 'technical',
        topics: [
          'Gestão pública, administração de recursos materiais e arquivologia / TI / Direito Civil e Processual.',
        ],
      },
    ],
  },
  {
    id: 'trt-analista',
    name: 'Tribunais Regionais do Trabalho (TRT)',
    sigla: 'TRT',
    role: 'Analista e Técnico Judiciário',
    banca: 'FCC / FGV',
    category: 'Tribunais',
    color: '#1769AA',
    disciplines: [
      {
        id: 'portugues-raciocinio',
        name: 'Língua Portuguesa e Raciocínio Lógico',
        kind: 'general',
        topics: [
          'Interpretação textual, sintaxe, concordância, regência, crase e lógica.',
        ],
      },
      {
        id: 'direito-trabalho',
        name: 'Direito do Trabalho',
        kind: 'technical',
        topics: [
          'Princípios do Direito do Trabalho, relação de trabalho e relação de emprego.',
          'Contrato individual de trabalho, jornada, férias, remuneração e rescisão (CLT).',
        ],
      },
      {
        id: 'processo-trabalho',
        name: 'Direito Processual do Trabalho',
        kind: 'technical',
        topics: [
          'Organização e competência da Justiça do Trabalho.',
          'Atos, termos e prazos processuais, dissídios individuais, recursos e execução trabalhista.',
        ],
      },
      {
        id: 'constitucional-administrativo',
        name: 'Direito Constitucional e Administrativo',
        kind: 'technical',
        topics: [
          'Direitos sociais (arts. 7º a 11 da CF), Poder Judiciário e regime jurídico (Lei 8.112/1990).',
        ],
      },
    ],
  },
  {
    id: 'inss-tecnico',
    name: 'Instituto Nacional do Seguro Social (INSS)',
    sigla: 'INSS',
    role: 'Técnico do Seguro Social',
    banca: 'CEBRASPE',
    category: 'Administrativos',
    color: '#07A684',
    disciplines: [
      {
        id: 'portugues-logica-informatica',
        name: 'Língua Portuguesa, Raciocínio Lógico e Informática',
        kind: 'general',
        topics: [
          'Compreensão de textos, ortografia, morfossintaxe e pontuação.',
          'Proposições lógicas, conjuntos, porcentagens e segurança da informação.',
        ],
      },
      {
        id: 'direito-constitucional-adm-etica',
        name: 'Direito Constitucional, Administrativo e Ética no Serviço Público',
        kind: 'general',
        topics: [
          'Direitos fundamentais, seguridade social na CF/88 e Decreto nº 1.171/1994.',
          'Atos administrativos, agentes públicos (Lei 8.112/1990) e responsabilidade civil do Estado.',
        ],
      },
      {
        id: 'seguridade-social',
        name: 'Seguridade Social e Direito Previdenciário (Peso Máximo)',
        kind: 'technical',
        topics: [
          'Seguridade Social: princípios, organização e custeio (Lei nº 8.212/1991).',
          'Regime Geral de Previdência Social (RGPS — Lei nº 8.213/1991 e Decreto nº 3.048/1999).',
          'Segurados obrigatórios e facultativos, dependentes, filiação e inscrição.',
          'Carência, salário de benefício, aposentadorias, pensão por morte e auxílios.',
          'Assistência Social (LOAS — Lei nº 8.742/1993 e Benefício de Prestação Continuada - BPC).',
        ],
      },
    ],
  },
  {
    id: 'dataprev-ti',
    name: 'DATAPREV / SERPRO',
    sigla: 'TI-PUB',
    role: 'Analista de Tecnologia da Informação',
    banca: 'CEBRASPE',
    category: 'Tecnologia (TI)',
    color: '#F68B1F',
    disciplines: [
      {
        id: 'portugues-ingles-logica',
        name: 'Língua Portuguesa, Inglês e Raciocínio Lógico',
        kind: 'general',
        topics: [
          'Interpretação textual, inglês técnico e lógica sentencial.',
        ],
      },
      {
        id: 'arquitetura-desenvolvimento',
        name: 'Arquitetura e Desenvolvimento de Sistemas',
        kind: 'technical',
        topics: [
          'Arquitetura de microsserviços, REST, GraphQL, mensageria (Kafka/RabbitMQ) e Design Patterns.',
          'Java, Spring Boot, Node.js, React, Angular, TypeScript e Python.',
        ],
      },
      {
        id: 'engenharia-devops',
        name: 'Engenharia de Software, DevOps e Nuvem',
        kind: 'technical',
        topics: [
          'Scrum, Kanban, TDD, BDD, CI/CD, Docker, Kubernetes e Terraform (IaC).',
        ],
      },
      {
        id: 'dados-seguranca-lgpd',
        name: 'Banco de Dados, Ciência de Dados, Segurança e LGPD',
        kind: 'technical',
        topics: [
          'PostgreSQL, Oracle, MongoDB, Redis, Data Warehouse e Machine Learning.',
          'Segurança da informação (ISO 27001, OWASP) e Lei Geral de Proteção de Dados (LGPD).',
        ],
      },
    ],
  },
  {
    id: 'petrobras-ti',
    name: 'Petrobras',
    sigla: 'PETR',
    role: 'Profissional Petrobras — Engenharia de Software / Ciência de Dados',
    banca: 'CEBRASPE',
    category: 'Tecnologia (TI)',
    color: '#004B2C',
    disciplines: [
      {
        id: 'portugues-ingles',
        name: 'Língua Portuguesa e Língua Inglesa',
        kind: 'general',
        topics: [
          'Compreensão e interpretação de textos em português e inglês técnico.',
        ],
      },
      {
        id: 'engenharia-arquitetura-sw',
        name: 'Engenharia de Software, Arquitetura e Cloud Computing',
        kind: 'technical',
        topics: [
          'Métodos ágeis, arquitetura de sistemas distribuídos, DevSecOps e Cloud (AWS/Azure).',
        ],
      },
      {
        id: 'ciencia-dados-bd',
        name: 'Ciência de Dados, Aprendizado de Máquina e Bancos de Dados',
        kind: 'technical',
        topics: [
          'Modelos preditivos, redes neurais, SQL, NoSQL e engenharia de dados.',
        ],
      },
    ],
  },
  {
    id: 'custom',
    name: 'Outro Concurso (Personalizado)',
    sigla: 'NOVO',
    role: 'Cargo Personalizado',
    banca: 'Qualquer Banca',
    category: 'Personalizado',
    color: '#A6193C',
    disciplines: [
      {
        id: 'portugues',
        name: 'Língua Portuguesa',
        kind: 'general',
        topics: [
          'Compreensão e interpretação de textos.',
          'Ortografia oficial, concordância, regência e crase.',
        ],
      },
      {
        id: 'raciocinio',
        name: 'Raciocínio Lógico',
        kind: 'general',
        topics: [
          'Estruturas lógicas, proposições e tabelas-verdade.',
          'Análise combinatória e probabilidade.',
        ],
      },
      {
        id: 'conhecimentos-especificos',
        name: 'Conhecimentos Específicos do Cargo',
        kind: 'technical',
        topics: [
          'Tópicos fundamentais da área específica do edital.',
          'Legislação e normas técnicas aplicáveis ao cargo.',
        ],
      },
    ],
  },
];

export function getContestCatalogItem(id: string): ContestCatalogItem | undefined {
  return CONTEST_CATALOG.find((item) => item.id === id);
}

function slugifyId(text: string, fallbackPrefix = 'disc'): string {
  const s = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return s || `${fallbackPrefix}-${Math.random().toString(36).slice(2, 7)}`;
}

const GENERAL_KEYWORDS = [
  'portugues',
  'redacao',
  'ingles',
  'espanhol',
  'raciocinio',
  'matematica basica',
  'atualidades',
  'etica',
  'conhecimentos gerais',
  'conhecimentos basicos',
];

function inferDisciplineKind(name: string, index: number, total: number): DisciplineKind {
  const norm = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (GENERAL_KEYWORDS.some((kw) => norm.includes(kw))) {
    return 'general';
  }
  if (total > 2 && index === 0 && norm.includes('linguagem')) {
    return 'general';
  }
  return 'technical';
}

const IGNORED_SECTION_HEADERS = new Set([
  'edital verticalizado',
  'conhecimentos basicos',
  'conhecimentos gerais',
  'conhecimentos especificos',
  'conteudo programatico',
  'anexo',
  'anexo i',
  'anexo ii',
  'cargo',
  'disciplinas',
  'topicos',
  'item',
  'status',
  'teoria',
  'revisao',
  'questoes',
]);

function isLikelyDisciplineHeader(line: string): { isHeader: boolean; cleanName: string } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 90) {
    return { isHeader: false, cleanName: '' };
  }

  // 1. Markdown headings: # Nome da Disciplina
  const mdMatch = /^#{1,4}\s+(.+)$/.exec(trimmed);
  if (mdMatch) {
    const clean = mdMatch[1].replace(/[:\-–—]+$/, '').trim();
    return { isHeader: clean.length >= 3, cleanName: clean };
  }

  // 2. Explicit prefix: Disciplina: Nome | Matéria: Nome
  const prefixMatch = /^(?:disciplina|mat[eé]ria|bloco|m[oó]dulo|eixo(?:\s+tem[aá]tico)?)\s*\d*\s*[:\-–—]\s*(.+)$/i.exec(trimmed);
  if (prefixMatch) {
    const clean = prefixMatch[1].replace(/[:\-–—]+$/, '').trim();
    return { isHeader: clean.length >= 3, cleanName: clean };
  }

  // Normalize to check ignored headers
  const norm = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  if (IGNORED_SECTION_HEADERS.has(norm)) {
    return { isHeader: false, cleanName: '' };
  }

  // 3. Ends with colon and has no period inside (e.g. "Língua Portuguesa:" or "1. Direito Constitucional:")
  if (trimmed.endsWith(':') && trimmed.length <= 65 && !/\.\s+[A-Z]/.test(trimmed)) {
    const clean = trimmed
      .replace(/^(?:[IVXLCDM]+|\d+)\s*[.\-–—)]\s*/i, '')
      .replace(/:+$/, '')
      .trim();
    const normClean = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (clean.length >= 3 && !IGNORED_SECTION_HEADERS.has(normClean)) {
      return { isHeader: true, cleanName: clean };
    }
  }

  // 4. ALL CAPS line (common in PDFs of Editais Verticalizados: "LÍNGUA PORTUGUESA", "DIREITO ADMINISTRATIVO")
  const lettersOnly = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const isAllUpper =
    lettersOnly.length >= 4 &&
    lettersOnly === lettersOnly.toUpperCase() &&
    lettersOnly !== lettersOnly.toLowerCase();

  if (isAllUpper && trimmed.length <= 70 && !trimmed.endsWith('.')) {
    const clean = trimmed
      .replace(/^(?:[IVXLCDM]+|\d+)\s*[.\-–—)]\s*/i, '')
      .replace(/[:\-–—]+$/, '')
      .trim();
    const normClean = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (clean.length >= 3 && !IGNORED_SECTION_HEADERS.has(normClean)) {
      // Title-case nicely if all uppercase
      const formatted = clean
        .toLowerCase()
        .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
        .replace(/\b(De|Da|Do|Das|Dos|E|Em|Para|Com|No|Na|Nos|Nas|A|O)\b/g, (m) => m.toLowerCase())
        .replace(/\b(ti|sfn|sgbd|sql|nosql|ia|tdd|bdd|atdd|mvc|api|apis|rest|soap|xml|json|git|ci\/cd|lgpd|cf|clt|ctb|inss|rfb|tcu|bnb|bb|cef|pf|prf|cnu)\b/gi, (m) => m.toUpperCase());
      return { isHeader: true, cleanName: formatted };
    }
  }

  return { isHeader: false, cleanName: '' };
}

function splitNumberedInlineTopics(line: string): string[] {
  const cleaned = line
    .replace(/^(?:[-*•–]|\[\s*[xX]?\s*\])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  // If line has inline numbered items like "1 Compreensão de textos. 2 Ortografia. 3 Crase."
  const inlineMatches = cleaned.split(/(?=\b\d{1,2}(?:\.\d{1,2})*\s+[A-ZÀ-Ÿ])/g);
  if (inlineMatches.length >= 2) {
    return inlineMatches
      .map((part) => part.replace(/^\d{1,2}(?:\.\d{1,2})*[.\-)\s]+/, '').trim())
      .filter((part) => part.length >= 3);
  }

  const single = cleaned.replace(/^\d{1,3}(?:\.\d{1,3})*[.\-)\s]+/, '').trim();
  return single.length >= 3 ? [single] : [];
}

export interface ParsedEditalResult {
  disciplines: Discipline[];
  topics: Topic[];
  distribution: Record<string, number>;
  summary: {
    disciplineCount: number;
    topicCount: number;
  };
}

/**
 *Constrói as disciplinas, tópicos e distribuição semanal de horas a partir de um item do catálogo de concursos.
 */
export function buildContestDefaultSyllabus(contestId: string): ParsedEditalResult {
  if (contestId === 'bnb-ti') {
    const now = new Date().toISOString();
    const disciplines = DEFAULT_DISCIPLINES.map((d) => ({ ...d }));
    const topics: Topic[] = Object.entries(EDITAL_VERTICALIZADO_BNB_2022).flatMap(
      ([disciplineId, titles]) =>
        titles.map((title, index) => ({
          id: `edital-bnb-2022-${disciplineId}-${String(index + 1).padStart(2, '0')}`,
          disciplineId,
          title,
          parentTopicId: null,
          status: 'nao-iniciado' as const,
          notes: '',
          order: index,
          active: true,
          createdAt: now,
          updatedAt: now,
        })),
    );
    const distribution = computeBalancedDistribution(disciplines);
    return {
      disciplines,
      topics,
      distribution,
      summary: { disciplineCount: disciplines.length, topicCount: topics.length },
    };
  }

  const catalogItem = getContestCatalogItem(contestId) ?? CONTEST_CATALOG[CONTEST_CATALOG.length - 1];
  const now = new Date().toISOString();

  const disciplines: Discipline[] = catalogItem.disciplines.map((d, idx) => ({
    id: d.id,
    name: d.name,
    color: DISCIPLINE_PALETTE[idx % DISCIPLINE_PALETTE.length],
    active: true,
    order: idx,
    kind: d.kind,
  }));

  const topics: Topic[] = catalogItem.disciplines.flatMap((d) =>
    d.topics.map((title, idx) => ({
      id: `edital-${catalogItem.id}-${d.id}-${String(idx + 1).padStart(2, '0')}`,
      disciplineId: d.id,
      title,
      parentTopicId: null,
      status: 'nao-iniciado' as const,
      notes: '',
      order: idx,
      active: true,
      createdAt: now,
      updatedAt: now,
    })),
  );

  const distribution = computeBalancedDistribution(disciplines);
  return {
    disciplines,
    topics,
    distribution,
    summary: { disciplineCount: disciplines.length, topicCount: topics.length },
  };
}

export function computeBalancedDistribution(disciplines: readonly Discipline[]): Record<string, number> {
  const active = disciplines.filter((d) => d.active);
  if (active.length === 0) return {};

  const technical = active.filter((d) => d.kind === 'technical');
  const general = active.filter((d) => d.kind === 'general');

  const dist: Record<string, number> = {};
  if (technical.length > 0 && general.length > 0) {
    // 600 min (~71%) para específicas, 240 min (~29%) para gerais (total 840m)
    const techEach = Math.max(30, Math.round(600 / technical.length / 10) * 10);
    const genEach = Math.max(30, Math.round(240 / general.length / 10) * 10);
    for (const d of technical) dist[d.id] = techEach;
    for (const d of general) dist[d.id] = genEach;
  } else {
    const each = Math.max(30, Math.round(840 / active.length / 10) * 10);
    for (const d of active) dist[d.id] = each;
  }
  return dist;
}

/**
 * Interpreta o texto de um Edital Verticalizado (PDF, TXT, CSV, MD ou colado)
 * e gera automaticamente as disciplinas, os tópicos do edital e a distribuição semanal.
 */
export function parseEditalVerticalizado(
  rawText: string,
  fallbackContestId = 'custom',
): ParsedEditalResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return buildContestDefaultSyllabus(fallbackContestId);
  }

  // Check if CSV/TSV format (e.g. "Disciplina;Tópico" or "Disciplina,Tópico")
  const delimiter = lines.filter((l) => l.includes(';')).length >= Math.min(3, lines.length)
    ? ';'
    : lines.filter((l) => l.includes('\t')).length >= Math.min(3, lines.length)
    ? '\t'
    : null;

  const grouped = new Map<string, string[]>();

  if (delimiter) {
    for (const line of lines) {
      const parts = line.split(delimiter).map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2) {
        const [discRaw, topicRaw] = parts;
        const normDisc = discRaw.toLowerCase();
        if (normDisc === 'disciplina' || normDisc === 'materia' || normDisc === 'matéria') continue;
        if (discRaw.length >= 2 && topicRaw.length >= 3) {
          const list = grouped.get(discRaw) ?? [];
          list.push(topicRaw);
          grouped.set(discRaw, list);
        }
      }
    }
  }

  if (grouped.size === 0) {
    let currentDiscipline = '';
    const ungroupedTopics: string[] = [];

    for (const line of lines) {
      // Ignore pure page numbers or table headers
      if (/^(?:p[aá]gina\s*)?\d+(?:\s*de\s*\d+)?$/i.test(line)) continue;

      const headerCheck = isLikelyDisciplineHeader(line);
      if (headerCheck.isHeader) {
        currentDiscipline = headerCheck.cleanName;
        if (!grouped.has(currentDiscipline)) {
          grouped.set(currentDiscipline, []);
        }
        continue;
      }

      const extracted = splitNumberedInlineTopics(line);
      for (const item of extracted) {
        const normItem = item
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
        if (IGNORED_SECTION_HEADERS.has(normItem)) continue;

        if (currentDiscipline) {
          const list = grouped.get(currentDiscipline) ?? [];
          if (!list.includes(item)) list.push(item);
          grouped.set(currentDiscipline, list);
        } else {
          if (!ungroupedTopics.includes(item)) ungroupedTopics.push(item);
        }
      }
    }

    // Remove empty disciplines that had 0 topics
    for (const [k, v] of Array.from(grouped.entries())) {
      if (v.length === 0) grouped.delete(k);
    }

    // If there were ungrouped topics at the top before the first header, or no headers at all:
    if (grouped.size === 0 && ungroupedTopics.length > 0) {
      // Distribute across fallback contest disciplines or create a clean structure
      const catalogItem = getContestCatalogItem(fallbackContestId);
      if (catalogItem && catalogItem.id !== 'custom' && catalogItem.disciplines.length > 0) {
        // Assign topics to catalog disciplines by keyword or evenly
        for (const d of catalogItem.disciplines) {
          grouped.set(d.name, []);
        }
        ungroupedTopics.forEach((topic, idx) => {
          const targetDisc = catalogItem.disciplines[idx % catalogItem.disciplines.length].name;
          grouped.get(targetDisc)!.push(topic);
        });
      } else {
        grouped.set('Conteúdos do Edital Verticalizado', ungroupedTopics);
      }
    } else if (ungroupedTopics.length > 0 && grouped.size > 0) {
      const firstKey = grouped.keys().next().value!;
      grouped.set(firstKey, [...ungroupedTopics, ...(grouped.get(firstKey) ?? [])]);
    }
  }

  if (grouped.size === 0) {
    return buildContestDefaultSyllabus(fallbackContestId);
  }

  const now = new Date().toISOString();
  const disciplines: Discipline[] = [];
  const topics: Topic[] = [];
  const usedIds = new Set<string>();
  const entries = Array.from(grouped.entries());

  entries.forEach(([discName, topicTitles], dIdx) => {
    let discId = slugifyId(discName);
    if (usedIds.has(discId)) {
      discId = `${discId}-${dIdx + 1}`;
    }
    usedIds.add(discId);

    const kind = inferDisciplineKind(discName, dIdx, entries.length);
    disciplines.push({
      id: discId,
      name: discName.slice(0, 80),
      color: DISCIPLINE_PALETTE[dIdx % DISCIPLINE_PALETTE.length],
      active: true,
      order: dIdx,
      kind,
    });

    topicTitles.forEach((title, tIdx) => {
      topics.push({
        id: `edital-${discId}-${String(tIdx + 1).padStart(3, '0')}`,
        disciplineId: discId,
        title: title.slice(0, 280),
        parentTopicId: null,
        status: 'nao-iniciado',
        notes: '',
        order: tIdx,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  const distribution = computeBalancedDistribution(disciplines);
  return {
    disciplines,
    topics,
    distribution,
    summary: {
      disciplineCount: disciplines.length,
      topicCount: topics.length,
    },
  };
}
