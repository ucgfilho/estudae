import type { DateKey } from '../lib/dates';
import { addDays, weekdayIndex, startOfWeek } from '../lib/dates';
import { createId, nowIso } from '../lib/utils';
import type { Discipline, Settings, StudySession, Topic, WeeklyPlan } from '../db/types';
import { SIMULADO_DISCIPLINE_ID } from '../domain/schedule';
import { EDITAL_VERTICALIZADO_BNB_2022 } from '../db/seed';

export const BNB_TI_DISCIPLINES = [
  'arquitetura',
  'engenharia',
  'linguagens',
  'banco-dados',
  'logica-programacao',
  'nuvem',
] as const;

export const BNB_BASIC_DISCIPLINES = ['portugues', 'raciocinio'] as const;

export { EDITAL_VERTICALIZADO_BNB_2022 };

export interface AiScheduleOptions {
  apiKey?: string;
  provider?: 'builtin' | 'gemini';
  customInstructions?: string;
}

export interface AiSessionTemplate {
  disciplineId: string;
  plannedMinutes: number;
  objective: string;
  topicKeyword?: string;
}

export interface AiDayTemplate {
  /** 0..5: deslocamento em dias úteis/sábado (0 = segunda ... 4 = sexta, 5 = sábado) */
  dayOffset: number;
  sessions: AiSessionTemplate[];
}

export interface AiWeekTemplate {
  weekIndex: number;
  phase: string;
  objectives: string;
  plannedContent: string;
  days: AiDayTemplate[];
}

export interface AiScheduleResult {
  weeklyPlans: WeeklyPlan[];
  sessions: StudySession[];
  providerUsed: 'builtin' | 'gemini';
}

/**
 * Normaliza uma string removendo acentos, pontuação e caixa para comparação rigorosa de tópicos do edital.
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Retorna a lista oficial de tópicos do Edital Verticalizado BNB 2022 para uma disciplina.
 */
export function getOfficialEditalTopics(disciplineId: string): readonly string[] {
  return EDITAL_VERTICALIZADO_BNB_2022[disciplineId] ?? [];
}

/**
 * Verifica se o objetivo de uma sessão contém ao menos um tópico oficial literal do Edital Verticalizado BNB 2022,
 * ou, caso o Gemini tenha parafraseado, garante e normaliza para o tópico oficial mais próximo daquela disciplina
 * para que NENHUMA sessão fuja do PDF do Edital Verticalizado.
 */
export function enforceOfficialEditalObjective(
  rawObjective: string,
  disciplineId: string,
  fallbackIndex = 0,
): { objective: string; officialTopic: string } {
  const officialList = getOfficialEditalTopics(disciplineId);
  if (officialList.length === 0) {
    return { objective: rawObjective, officialTopic: rawObjective };
  }

  const normObj = normalizeText(rawObjective);

  // 1. Verifica correspondência exata ou inclusão direta do título oficial no objetivo
  for (const official of officialList) {
    const normOff = normalizeText(official);
    if (normObj.includes(normOff) || normOff.includes(normObj)) {
      return { objective: official, officialTopic: official };
    }
  }

  // 2. Pontuação por palavras-chave significativas (> 2 letras) com os tópicos do PDF
  const objWords = normObj.split(' ').filter((w) => w.length > 2);
  let bestTopic = officialList[fallbackIndex % officialList.length];
  let bestScore = -1;

  for (const official of officialList) {
    const offWords = normalizeText(official).split(' ').filter((w) => w.length > 2);
    let score = 0;
    for (const w of objWords) {
      if (offWords.some((ow) => ow === w || (w.length > 4 && (ow.includes(w) || w.includes(ow))))) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = official;
    }
  }

  return {
    objective: bestTopic,
    officialTopic: bestTopic,
  };
}

/**
 * Matriz Pedagógica de 24 Semanas Rigorosamente Baseada no PDF:
 * "EDITAL VERTICALIZADO — BNB 2022 — Especialista Técnico — Analista de Sistemas — Perfil 1: Desenvolvimento de Sistemas"
 * (Referência: Edital nº 1 — BNB, de 22 de setembro de 2022, item 14.2.1.1 e item 14.2.2, Perfil 1).
 *
 * Regras Inegociáveis:
 * 1. 100% dos objetivos e conteúdos estudados em cada sessão reproduzem fielmente os itens do PDF do Edital Verticalizado, sem inventar matérias fora do PDF.
 * 2. Dias de estudo com limite estrito de 2 horas (120 minutos).
 * 3. Sábados: exclusivamente dedicados a questões/simulados sobre os exatos tópicos do edital estudados na semana (120 min).
 * 4. Domingos: dia livre / descanso semanal (0 min).
 * 5. Segunda a Sexta: 80% Conhecimentos Específicos — Perfil 1: Desenvolvimento de Sistemas (8 sessões de 60m) e 20% Conhecimentos Gerais (2 sessões de 60m).
 */
export const BNB_24_WEEKS_CURRICULUM: AiWeekTemplate[] = [
  // ============================================================================
  // FASE 1: CONHECIMENTOS DO EDITAL VERTICALIZADO — CICLO 1 (Semanas 1 a 6)
  // ============================================================================
  {
    weekIndex: 1,
    phase: 'Fase 1: Base do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 1: Construção de algoritmos e tipos de dados; Arquitetura de software e aplicações; Projeto de software; Características das linguagens; Arquitetura de dados; Nuvem básica; Compreensão textual e Estruturas lógicas.',
    plannedContent:
      'Construção de algoritmos. Tipos de dados simples e estruturados. Arquitetura de software. Arquitetura de aplicações. Conceitos e técnicas do projeto de software. Características estruturais das linguagens de programação. Arquitetura de dados. Conceitos básicos de computação em nuvem. Compreensão e interpretação de textos de gêneros variados. Estruturas lógicas.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Construção de algoritmos.',
            topicKeyword: 'Construção de algoritmos.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Características estruturais das linguagens de programação.',
            topicKeyword: 'Características estruturais das linguagens de programação.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura de software.',
            topicKeyword: 'Arquitetura de software.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Conceitos e técnicas do projeto de software.',
            topicKeyword: 'Conceitos e técnicas do projeto de software.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Arquitetura de dados.',
            topicKeyword: 'Arquitetura de dados.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Conceitos básicos de computação em nuvem.',
            topicKeyword: 'Conceitos básicos de computação em nuvem.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Tipos de dados simples e estruturados.',
            topicKeyword: 'Tipos de dados simples e estruturados.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura de aplicações.',
            topicKeyword: 'Arquitetura de aplicações.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Compreensão e interpretação de textos de gêneros variados.',
            topicKeyword: 'Compreensão e interpretação de textos de gêneros variados.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Estruturas lógicas.',
            topicKeyword: 'Estruturas lógicas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Construção de algoritmos, Tipos de dados simples e estruturados, Arquitetura de software, Conceitos e técnicas do projeto de software e Compreensão e interpretação de textos de gêneros variados.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 2,
    phase: 'Fase 1: Base do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 2: Variáveis, constantes e comandos de atribuição/E/S; Padrão arquitetural MVC e Sistemas de N camadas; Processo interativo e incremental; Orientação a objetos; Modelagem de dados conceitual, lógica e física; Tipologia IaaS, PaaS e SaaS.',
    plannedContent:
      'Variáveis e constantes. Comandos de atribuição, entrada e saída. Padrão arquitetural Model-View-Controller (MVC). Sistemas de N camadas. Processo interativo e incremental. Orientação a objetos. Modelagem de dados: conceitual, lógica e física. Tipologia: IaaS, PaaS e SaaS. Reconhecimento de tipos e gêneros textuais. Lógica de argumentação: analogias, inferências, deduções e conclusões.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Variáveis e constantes.',
            topicKeyword: 'Variáveis e constantes.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Orientação a objetos.',
            topicKeyword: 'Orientação a objetos.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Padrão arquitetural Model-View-Controller (MVC).',
            topicKeyword: 'Padrão arquitetural Model-View-Controller (MVC).',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Processo interativo e incremental.',
            topicKeyword: 'Processo interativo e incremental.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Modelagem de dados: conceitual, lógica e física.',
            topicKeyword: 'Modelagem de dados: conceitual, lógica e física.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Tipologia: IaaS, PaaS e SaaS.',
            topicKeyword: 'Tipologia: IaaS, PaaS e SaaS.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Comandos de atribuição, entrada e saída.',
            topicKeyword: 'Comandos de atribuição, entrada e saída.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Sistemas de N camadas.',
            topicKeyword: 'Sistemas de N camadas.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Reconhecimento de tipos e gêneros textuais.',
            topicKeyword: 'Reconhecimento de tipos e gêneros textuais.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica de argumentação: analogias, inferências, deduções e conclusões.',
            topicKeyword: 'Lógica de argumentação: analogias, inferências, deduções e conclusões.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Padrão arquitetural Model-View-Controller (MVC), Sistemas de N camadas, Orientação a objetos, Modelagem de dados: conceitual, lógica e física e Tipologia: IaaS, PaaS e SaaS.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 3,
    phase: 'Fase 1: Base do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 3: Avaliação de expressões e funções pré-definidas; Microsserviço e Arquitetura orientada a eventos; Práticas ágeis; Threads; Criação e alteração dos modelos lógico e físico de dados; Abordagem relacional.',
    plannedContent:
      'Avaliação de expressões. Funções pré-definidas. Microsserviço. Arquitetura orientada a eventos. Práticas ágeis de desenvolvimento de software. Threads. Criação e alteração dos modelos lógico e físico de dados. Abordagem relacional. Domínio da ortografia oficial. Lógica sentencial (ou proposicional).',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Avaliação de expressões.',
            topicKeyword: 'Avaliação de expressões.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Criação e alteração dos modelos lógico e físico de dados.',
            topicKeyword: 'Criação e alteração dos modelos lógico e físico de dados.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Microsserviço.',
            topicKeyword: 'Microsserviço.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Práticas ágeis de desenvolvimento de software.',
            topicKeyword: 'Práticas ágeis de desenvolvimento de software.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Abordagem relacional.',
            topicKeyword: 'Abordagem relacional.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Threads.',
            topicKeyword: 'Threads.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Funções pré-definidas.',
            topicKeyword: 'Funções pré-definidas.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura orientada a eventos.',
            topicKeyword: 'Arquitetura orientada a eventos.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Domínio da ortografia oficial.',
            topicKeyword: 'Domínio da ortografia oficial.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica sentencial (ou proposicional).',
            topicKeyword: 'Lógica sentencial (ou proposicional).',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Microsserviço, Arquitetura orientada a eventos, Abordagem relacional, Práticas ágeis de desenvolvimento de software e Lógica sentencial (ou proposicional).',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 4,
    phase: 'Fase 1: Base do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 4: Conceito de bloco de comandos e Estruturas de controle, seleção, repetição e desvio; Refatoração e modernização de aplicações; BDD e TDD; Escalonamento; Normalização das estruturas de dados; Modelos de nuvem privada, pública e híbrida.',
    plannedContent:
      'Conceito de bloco de comandos. Estruturas de controle, seleção, repetição e desvio. Refatoração e modernização de aplicações. Desenvolvimento orientado por comportamento (BDD). Desenvolvimento guiado por testes (TDD). Escalonamento. Normalização das estruturas de dados. Modelos: privada, pública e híbrida. Domínio dos mecanismos de coesão textual. Proposições simples e compostas.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento orientado por comportamento (BDD).',
            topicKeyword: 'Desenvolvimento orientado por comportamento (BDD).',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Refatoração e modernização de aplicações.',
            topicKeyword: 'Refatoração e modernização de aplicações.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Normalização das estruturas de dados.',
            topicKeyword: 'Normalização das estruturas de dados.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Escalonamento.',
            topicKeyword: 'Escalonamento.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Conceito de bloco de comandos.',
            topicKeyword: 'Conceito de bloco de comandos.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Estruturas de controle, seleção, repetição e desvio.',
            topicKeyword: 'Estruturas de controle, seleção, repetição e desvio.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento guiado por testes (TDD).',
            topicKeyword: 'Desenvolvimento guiado por testes (TDD).',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Modelos: privada, pública e híbrida.',
            topicKeyword: 'Modelos: privada, pública e híbrida.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Domínio dos mecanismos de coesão textual.',
            topicKeyword: 'Domínio dos mecanismos de coesão textual.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Proposições simples e compostas.',
            topicKeyword: 'Proposições simples e compostas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Estruturas de controle, seleção, repetição e desvio, Normalização das estruturas de dados, BDD, TDD e Proposições simples e compostas.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 5,
    phase: 'Fase 1: Base do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 5: Operadores e expressões; APIs e Arquitetura Cloud Native; ATDD; Primitivas de sincronização e deadlocks; Integridade referencial e Metadados; Tabelas-verdade e Referenciação textual.',
    plannedContent:
      'Operadores e expressões. APIs. Arquitetura Cloud Native. Desenvolvimento guiado por testes de aceitação (ATDD). Primitivas de sincronização e deadlocks. Integridade referencial. Metadados. Emprego de elementos de referenciação, substituição e repetição, conectores e outros elementos de sequenciação textual. Tabelas-verdade.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'APIs.',
            topicKeyword: 'APIs.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento guiado por testes de aceitação (ATDD).',
            topicKeyword: 'Desenvolvimento guiado por testes de aceitação (ATDD).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Integridade referencial.',
            topicKeyword: 'Integridade referencial.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Metadados.',
            topicKeyword: 'Metadados.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Primitivas de sincronização e deadlocks.',
            topicKeyword: 'Primitivas de sincronização e deadlocks.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Operadores e expressões.',
            topicKeyword: 'Operadores e expressões.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura Cloud Native.',
            topicKeyword: 'Arquitetura Cloud Native.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective:
              'Benefícios: alta disponibilidade, escalabilidade, elasticidade, agilidade e recuperação de desastres.',
            topicKeyword:
              'Benefícios: alta disponibilidade, escalabilidade, elasticidade, agilidade e recuperação de desastres.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective:
              'Emprego de elementos de referenciação, substituição e repetição, conectores e outros elementos de sequenciação textual.',
            topicKeyword:
              'Emprego de elementos de referenciação, substituição e repetição, conectores e outros elementos de sequenciação textual.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Tabelas-verdade.',
            topicKeyword: 'Tabelas-verdade.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): APIs, Arquitetura Cloud Native, Integridade referencial, Primitivas de sincronização e deadlocks e Tabelas-verdade.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 6,
    phase: 'Fase 1: Base do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 6: Passagem de parâmetros; Padrões de design de software; Elicitação e Gerenciamento de Requisitos e Experiência do Usuário; Tratamento de exceções; Modelagem dimensional e Avaliação de modelos de dados; Simulado BNB 1.',
    plannedContent:
      'Passagem de parâmetros. Padrões de design de software. Elicitação e Gerenciamento de Requisitos. Requisitos e Experiência do Usuário. Tratamento de exceções. Modelagem dimensional. Avaliação de modelos de dados. Emprego de tempos e modos verbais. Equivalências.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Elicitação e Gerenciamento de Requisitos.',
            topicKeyword: 'Elicitação e Gerenciamento de Requisitos.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Padrões de design de software.',
            topicKeyword: 'Padrões de design de software.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Modelagem dimensional.',
            topicKeyword: 'Modelagem dimensional.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Tratamento de exceções.',
            topicKeyword: 'Tratamento de exceções.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Passagem de parâmetros.',
            topicKeyword: 'Passagem de parâmetros.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective:
              'Componentes centrais da arquitetura em nuvem: distribuição geográfica, regiões, zonas de disponibilidade, subscrições, grupos de gestão e recursos.',
            topicKeyword:
              'Componentes centrais da arquitetura em nuvem: distribuição geográfica, regiões, zonas de disponibilidade, subscrições, grupos de gestão e recursos.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Requisitos e Experiência do Usuário.',
            topicKeyword: 'Requisitos e Experiência do Usuário.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Avaliação de modelos de dados.',
            topicKeyword: 'Avaliação de modelos de dados.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Emprego de tempos e modos verbais.',
            topicKeyword: 'Emprego de tempos e modos verbais.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Equivalências.',
            topicKeyword: 'Equivalências.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 1 (Edital Verticalizado): Padrões de design de software, Elicitação e Gerenciamento de Requisitos, Modelagem dimensional, Passagem de parâmetros e Equivalências.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // FASE 2: APROFUNDAMENTO NOS ITENS DO EDITAL VERTICALIZADO (Semanas 7 a 14)
  // ============================================================================
  {
    weekIndex: 7,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 7: Recursividade; Técnicas de componentização, ESB e Interoperabilidade; Histórias do usuário; Java; Engenharia reversa de modelos de dados; Segurança e conformidade na nuvem; Diagramas lógicos.',
    plannedContent:
      'Recursividade. Técnicas de componentização de software. Barramento de Serviços Corporativos (ESB). Interoperabilidade entre aplicações. Histórias do usuário. Java. Técnicas de engenharia reversa para criação e atualização de modelos de dados. Características gerais de identidade, privacidade, conformidade e segurança na nuvem. Domínio da estrutura morfossintática do período. Diagramas lógicos.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Técnicas de componentização de software.',
            topicKeyword: 'Técnicas de componentização de software.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Barramento de Serviços Corporativos (ESB).',
            topicKeyword: 'Barramento de Serviços Corporativos (ESB).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Interoperabilidade entre aplicações.',
            topicKeyword: 'Interoperabilidade entre aplicações.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Java.',
            topicKeyword: 'Java.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Técnicas de engenharia reversa para criação e atualização de modelos de dados.',
            topicKeyword: 'Técnicas de engenharia reversa para criação e atualização de modelos de dados.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Histórias do usuário.',
            topicKeyword: 'Histórias do usuário.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Características gerais de identidade, privacidade, conformidade e segurança na nuvem.',
            topicKeyword: 'Características gerais de identidade, privacidade, conformidade e segurança na nuvem.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Recursividade.',
            topicKeyword: 'Recursividade.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Domínio da estrutura morfossintática do período.',
            topicKeyword: 'Domínio da estrutura morfossintática do período.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Diagramas lógicos.',
            topicKeyword: 'Diagramas lógicos.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Técnicas de componentização de software, Barramento de Serviços Corporativos (ESB), Java, Recursividade e Diagramas lógicos.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 8,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 8: Conceitos básicos de programação estruturada e orientada a objetos; API Gateway, Servidores de aplicações e Conteinerização; Critérios de Aceitação; Spring Boot; SQL; Infrastructure as Code (IaC).',
    plannedContent:
      'Conceitos básicos de programação estruturada e orientada a objetos. API Gateway. Conceitos básicos sobre servidores de aplicações. Conteinerização de aplicação. Critérios de Aceitação. Spring Boot. Linguagem de consulta estruturada (SQL). Infrastructure as Code (IaC). Emprego das classes de palavras. Lógica de primeira ordem.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'API Gateway.',
            topicKeyword: 'API Gateway.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Conceitos básicos sobre servidores de aplicações.',
            topicKeyword: 'Conceitos básicos sobre servidores de aplicações.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Conteinerização de aplicação.',
            topicKeyword: 'Conteinerização de aplicação.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Spring Boot.',
            topicKeyword: 'Spring Boot.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Infrastructure as Code (IaC).',
            topicKeyword: 'Infrastructure as Code (IaC).',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Critérios de Aceitação.',
            topicKeyword: 'Critérios de Aceitação.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Linguagem de consulta estruturada (SQL).',
            topicKeyword: 'Linguagem de consulta estruturada (SQL).',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Conceitos básicos de programação estruturada e orientada a objetos.',
            topicKeyword: 'Conceitos básicos de programação estruturada e orientada a objetos.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Emprego das classes de palavras.',
            topicKeyword: 'Emprego das classes de palavras.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica de primeira ordem.',
            topicKeyword: 'Lógica de primeira ordem.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): API Gateway, Conteinerização de aplicação, Spring Boot, Linguagem de consulta estruturada (SQL) e Lógica de primeira ordem.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 9,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 9: Métodos de ordenação, pesquisa e hashing; Frameworks de persistência, ORM e Mensageria; Prototipação; .NET Core; Linguagem de definição de dados (DDL); Automação em nuvem.',
    plannedContent:
      'Métodos de ordenação, pesquisa e hashing. Frameworks de persistência de dados. Mapeamento objeto-relacional. Serviços de mensageria. Prototipação. .NET Core. Linguagem de definição de dados (DDL). Automação. Relações de coordenação entre orações e entre termos da oração. Princípios de contagem e probabilidade.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Frameworks de persistência de dados.',
            topicKeyword: 'Frameworks de persistência de dados.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Mapeamento objeto-relacional.',
            topicKeyword: 'Mapeamento objeto-relacional.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Serviços de mensageria.',
            topicKeyword: 'Serviços de mensageria.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: '.NET Core.',
            topicKeyword: '.NET Core.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Linguagem de definição de dados (DDL).',
            topicKeyword: 'Linguagem de definição de dados (DDL).',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Prototipação.',
            topicKeyword: 'Prototipação.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Automação.',
            topicKeyword: 'Automação.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Métodos de ordenação, pesquisa e hashing.',
            topicKeyword: 'Métodos de ordenação, pesquisa e hashing.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Relações de coordenação entre orações e entre termos da oração.',
            topicKeyword: 'Relações de coordenação entre orações e entre termos da oração.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Princípios de contagem e probabilidade.',
            topicKeyword: 'Princípios de contagem e probabilidade.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Mapeamento objeto-relacional, Serviços de mensageria, Métodos de ordenação, pesquisa e hashing, DDL e Princípios de contagem e probabilidade.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 10,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 10: Padrões SOAP, REST, XML, XSLT, UDDI, WSDL, JSON, RMI e XML-HTTPRequest; Projeto centrado no usuário; HTML 5 e CSS 3; DML, SGBD, Propriedades ACID e Independência de dados; Conjuntos e Leis de Morgan.',
    plannedContent:
      'Padrões: SOAP, REST, XML, XSLT, UDDI, WSDL, JSON, RMI e XML-HTTPRequest. Projeto centrado no usuário de software. Linguagens de desenvolvimento de interfaces ricas: HTML 5 e CSS 3. Linguagem de manipulação de dados (DML). Sistema Gerenciador de Banco de Dados (SGBD). Propriedades de banco de dados: atomicidade, consistência, isolamento e durabilidade (ACID). Independência de dados. Relações de subordinação entre orações e entre termos da oração. Conjuntos: regras básicas — pertinência; inclusão; operações de união e intersecção; complemento e diferença de conjuntos; Leis de Morgan —; problemas.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Linguagem de manipulação de dados (DML).',
            topicKeyword: 'Linguagem de manipulação de dados (DML).',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Sistema Gerenciador de Banco de Dados (SGBD).',
            topicKeyword: 'Sistema Gerenciador de Banco de Dados (SGBD).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Padrões: SOAP, REST, XML, XSLT, UDDI, WSDL, JSON, RMI e XML-HTTPRequest.',
            topicKeyword: 'Padrões: SOAP, REST, XML, XSLT, UDDI, WSDL, JSON, RMI e XML-HTTPRequest.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Conceitos básicos de computação em nuvem.',
            topicKeyword: 'Conceitos básicos de computação em nuvem.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Propriedades de banco de dados: atomicidade, consistência, isolamento e durabilidade (ACID).',
            topicKeyword: 'Propriedades de banco de dados: atomicidade, consistência, isolamento e durabilidade (ACID).',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Independência de dados.',
            topicKeyword: 'Independência de dados.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Projeto centrado no usuário de software.',
            topicKeyword: 'Projeto centrado no usuário de software.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Linguagens de desenvolvimento de interfaces ricas: HTML 5 e CSS 3.',
            topicKeyword: 'Linguagens de desenvolvimento de interfaces ricas: HTML 5 e CSS 3.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Relações de subordinação entre orações e entre termos da oração.',
            topicKeyword: 'Relações de subordinação entre orações e entre termos da oração.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective:
              'Conjuntos: regras básicas — pertinência; inclusão; operações de união e intersecção; complemento e diferença de conjuntos; Leis de Morgan —; problemas.',
            topicKeyword:
              'Conjuntos: regras básicas — pertinência; inclusão; operações de união e intersecção; complemento e diferença de conjuntos; Leis de Morgan —; problemas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Padrões SOAP, REST, XML, XSLT, UDDI, WSDL, JSON, RMI e XML-HTTPRequest, Propriedades ACID, DML e Conjuntos (Leis de Morgan).',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 11,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 11: Conceitos e ferramentas de DevOps, CI/CD e Gerência de configuração (GIT); Storytelling; JavaScript; Transações e Melhoria de performance de banco de dados; Problemas aritméticos, geométricos e matriciais.',
    plannedContent:
      'Conceitos e ferramentas de DevOps. Técnicas de Integração e Implantação Contínua de Código (CI/CD). Gerência de configuração de software (GIT). Storytelling. JavaScript. Transações de bancos de dados. Melhoria de performance de banco de dados. Emprego dos sinais de pontuação. Raciocínio lógico envolvendo problemas aritméticos, geométricos e matriciais.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Conceitos e ferramentas de DevOps.',
            topicKeyword: 'Conceitos e ferramentas de DevOps.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Técnicas de Integração e Implantação Contínua de Código (CI/CD).',
            topicKeyword: 'Técnicas de Integração e Implantação Contínua de Código (CI/CD).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Gerência de configuração de software (GIT).',
            topicKeyword: 'Gerência de configuração de software (GIT).',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'JavaScript.',
            topicKeyword: 'JavaScript.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Transações de bancos de dados.',
            topicKeyword: 'Transações de bancos de dados.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Melhoria de performance de banco de dados.',
            topicKeyword: 'Melhoria de performance de banco de dados.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Tipologia: IaaS, PaaS e SaaS.',
            topicKeyword: 'Tipologia: IaaS, PaaS e SaaS.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Storytelling.',
            topicKeyword: 'Storytelling.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Emprego dos sinais de pontuação.',
            topicKeyword: 'Emprego dos sinais de pontuação.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Raciocínio lógico envolvendo problemas aritméticos, geométricos e matriciais.',
            topicKeyword: 'Raciocínio lógico envolvendo problemas aritméticos, geométricos e matriciais.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): DevOps, CI/CD, Gerência de configuração de software (GIT), Transações de bancos de dados e Problemas aritméticos, geométricos e matriciais.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 12,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 12: Integração contínua e Arquitetura de Sistemas WEB (W3C); Práticas ágeis, MVP e Scrum/Kanban; Python; Bancos de dados NoSQL; Concordância verbal e nominal; Simulado de Meio de Curso BNB 2.',
    plannedContent:
      'Integração contínua. Arquitetura de Sistemas WEB e WEB Standards (W3C). Práticas ágeis. Minimum Viable Product (MVP). Gerenciamento de produtos com métodos ágeis: Scrum e Kanban. Python. Bancos de dados NoSQL. Modelos: privada, pública e híbrida. Concordância verbal e nominal. Estruturas lógicas.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Práticas ágeis.',
            topicKeyword: 'Práticas ágeis.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Minimum Viable Product (MVP).',
            topicKeyword: 'Minimum Viable Product (MVP).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Integração contínua.',
            topicKeyword: 'Integração contínua.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Python.',
            topicKeyword: 'Python.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Modelos: privada, pública e híbrida.',
            topicKeyword: 'Modelos: privada, pública e híbrida.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Bancos de dados NoSQL.',
            topicKeyword: 'Bancos de dados NoSQL.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura de Sistemas WEB e WEB Standards (W3C).',
            topicKeyword: 'Arquitetura de Sistemas WEB e WEB Standards (W3C).',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Gerenciamento de produtos com métodos ágeis: Scrum e Kanban.',
            topicKeyword: 'Gerenciamento de produtos com métodos ágeis: Scrum e Kanban.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Concordância verbal e nominal.',
            topicKeyword: 'Concordância verbal e nominal.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Estruturas lógicas.',
            topicKeyword: 'Estruturas lógicas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 2 (Edital Verticalizado): Gerenciamento de produtos com métodos ágeis: Scrum e Kanban, Bancos de dados NoSQL, Python, Arquitetura WEB (W3C) e Concordância verbal e nominal.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 13,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 13: Arquitetura de soluções Mobile e Gestão de Ativos; Testes de software, Ferramentas para automatização de testes e Análise por pontos de função (IFPUG e NESMA); Integração dos dados (ETL); Regência verbal e nominal.',
    plannedContent:
      'Arquitetura de soluções Mobile. Gestão de Ativos. Testes de software: unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade. Ferramentas para automatização de testes. Análise por pontos de função (IFPUG e NESMA). Integração dos dados: ETL, transferência de arquivos e integração via base de dados. Benefícios e Componentes centrais da arquitetura em nuvem. Regência verbal e nominal.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective:
              'Benefícios: alta disponibilidade, escalabilidade, elasticidade, agilidade e recuperação de desastres.',
            topicKeyword:
              'Benefícios: alta disponibilidade, escalabilidade, elasticidade, agilidade e recuperação de desastres.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective:
              'Componentes centrais da arquitetura em nuvem: distribuição geográfica, regiões, zonas de disponibilidade, subscrições, grupos de gestão e recursos.',
            topicKeyword:
              'Componentes centrais da arquitetura em nuvem: distribuição geográfica, regiões, zonas de disponibilidade, subscrições, grupos de gestão e recursos.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura de soluções Mobile.',
            topicKeyword: 'Arquitetura de soluções Mobile.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective:
              'Testes de software: unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade.',
            topicKeyword:
              'Testes de software: unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Ferramentas para automatização de testes.',
            topicKeyword: 'Ferramentas para automatização de testes.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Análise por pontos de função (IFPUG e NESMA).',
            topicKeyword: 'Análise por pontos de função (IFPUG e NESMA).',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Gestão de Ativos.',
            topicKeyword: 'Gestão de Ativos.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Integração dos dados: ETL, transferência de arquivos e integração via base de dados.',
            topicKeyword: 'Integração dos dados: ETL, transferência de arquivos e integração via base de dados.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Regência verbal e nominal.',
            topicKeyword: 'Regência verbal e nominal.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica de argumentação: analogias, inferências, deduções e conclusões.',
            topicKeyword: 'Lógica de argumentação: analogias, inferências, deduções e conclusões.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Testes de software (unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade), Análise por pontos de função (IFPUG e NESMA) e ETL.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 14,
    phase: 'Fase 2: Aprofundamento no Edital Verticalizado BNB 2022',
    objectives:
      'Semana 14: Protocolo HTTP / HTTPS; Qualidade de dados e gestão de dados mestres e de referência; Data Lakes e soluções para Big Data; Emprego do sinal indicativo de crase; Construção de algoritmos.',
    plannedContent:
      'Protocolo HTTP / HTTPS. Qualidade de dados e gestão de dados mestres e de referência. Data Lakes e soluções para Big Data. Características gerais de identidade, privacidade, conformidade e segurança na nuvem. Emprego do sinal indicativo de crase. Lógica sentencial (ou proposicional).',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Conceitos e técnicas do projeto de software.',
            topicKeyword: 'Conceitos e técnicas do projeto de software.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Processo interativo e incremental.',
            topicKeyword: 'Processo interativo e incremental.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Qualidade de dados e gestão de dados mestres e de referência.',
            topicKeyword: 'Qualidade de dados e gestão de dados mestres e de referência.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Data Lakes e soluções para Big Data.',
            topicKeyword: 'Data Lakes e soluções para Big Data.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura de software.',
            topicKeyword: 'Arquitetura de software.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Características gerais de identidade, privacidade, conformidade e segurança na nuvem.',
            topicKeyword: 'Características gerais de identidade, privacidade, conformidade e segurança na nuvem.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Protocolo HTTP / HTTPS.',
            topicKeyword: 'Protocolo HTTP / HTTPS.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Construção de algoritmos.',
            topicKeyword: 'Construção de algoritmos.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Emprego do sinal indicativo de crase.',
            topicKeyword: 'Emprego do sinal indicativo de crase.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica sentencial (ou proposicional).',
            topicKeyword: 'Lógica sentencial (ou proposicional).',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Protocolo HTTP / HTTPS, Qualidade de dados e gestão de dados mestres, Data Lakes e soluções para Big Data e Emprego do sinal indicativo de crase.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // FASE 3: FECHAMENTO INTEGRAL DO EDITAL VERTICALIZADO (Semanas 15 a 19)
  // ============================================================================
  {
    weekIndex: 15,
    phase: 'Fase 3: Fechamento Integral do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 15: Desenvolvimento para plataforma mobile Android e iOS; Construção de relatórios e dashboards interativos em ferramentas de BI; Infrastructure as Code (IaC); Colocação dos pronomes átonos.',
    plannedContent:
      'Desenvolvimento para plataforma mobile Android e iOS. Construção de relatórios e dashboards interativos em ferramentas de BI. Infrastructure as Code (IaC). Padrão arquitetural Model-View-Controller (MVC). Sistemas de N camadas. Microsserviço. Práticas ágeis de desenvolvimento de software. BDD. Colocação dos pronomes átonos. Proposições simples e compostas.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Padrão arquitetural Model-View-Controller (MVC).',
            topicKeyword: 'Padrão arquitetural Model-View-Controller (MVC).',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Sistemas de N camadas.',
            topicKeyword: 'Sistemas de N camadas.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Microsserviço.',
            topicKeyword: 'Microsserviço.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Desenvolvimento para plataforma mobile Android e iOS.',
            topicKeyword: 'Desenvolvimento para plataforma mobile Android e iOS.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Construção de relatórios e dashboards interativos em ferramentas de BI.',
            topicKeyword: 'Construção de relatórios e dashboards interativos em ferramentas de BI.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Infrastructure as Code (IaC).',
            topicKeyword: 'Infrastructure as Code (IaC).',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Práticas ágeis de desenvolvimento de software.',
            topicKeyword: 'Práticas ágeis de desenvolvimento de software.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento orientado por comportamento (BDD).',
            topicKeyword: 'Desenvolvimento orientado por comportamento (BDD).',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Colocação dos pronomes átonos.',
            topicKeyword: 'Colocação dos pronomes átonos.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Proposições simples e compostas.',
            topicKeyword: 'Proposições simples e compostas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Desenvolvimento para plataforma mobile Android e iOS, Construção de relatórios e dashboards interativos em ferramentas de BI e Colocação dos pronomes átonos.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 16,
    phase: 'Fase 3: Fechamento Integral do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 16: Ionic, Técnicas de refatoração de software, Tratamento do débito técnico e Noções de criptografia simétrica e assimétrica; Self BI; Automação em nuvem; Reescrita de frases e parágrafos do texto.',
    plannedContent:
      'Ionic. Técnicas de refatoração de software. Tratamento do débito técnico. Noções de criptografia simétrica e assimétrica. Self BI. Arquitetura orientada a eventos. Refatoração e modernização de aplicações. Automação. Reescrita de frases e parágrafos do texto. Tabelas-verdade.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Ionic.',
            topicKeyword: 'Ionic.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Técnicas de refatoração de software.',
            topicKeyword: 'Técnicas de refatoração de software.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Tratamento do débito técnico.',
            topicKeyword: 'Tratamento do débito técnico.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Noções de criptografia simétrica e assimétrica.',
            topicKeyword: 'Noções de criptografia simétrica e assimétrica.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura orientada a eventos.',
            topicKeyword: 'Arquitetura orientada a eventos.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Refatoração e modernização de aplicações.',
            topicKeyword: 'Refatoração e modernização de aplicações.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Self BI.',
            topicKeyword: 'Self BI.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Automação.',
            topicKeyword: 'Automação.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Reescrita de frases e parágrafos do texto.',
            topicKeyword: 'Reescrita de frases e parágrafos do texto.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Tabelas-verdade.',
            topicKeyword: 'Tabelas-verdade.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Ionic, Técnicas de refatoração de software, Tratamento do débito técnico, Noções de criptografia simétrica e assimétrica, Self BI e Reescrita de frases.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 17,
    phase: 'Fase 3: Fechamento Integral do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 17: Governança de dados; TDD, ATDD, Elicitação de Requisitos e Experiência do Usuário; APIs; Tipos de dados simples e estruturados; Significação das palavras e Equivalências.',
    plannedContent:
      'Governança de dados. Desenvolvimento guiado por testes (TDD). Desenvolvimento guiado por testes de aceitação (ATDD). Elicitação e Gerenciamento de Requisitos. Requisitos e Experiência do Usuário. APIs. Tipos de dados simples e estruturados. Significação das palavras. Equivalências.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento guiado por testes (TDD).',
            topicKeyword: 'Desenvolvimento guiado por testes (TDD).',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento guiado por testes de aceitação (ATDD).',
            topicKeyword: 'Desenvolvimento guiado por testes de aceitação (ATDD).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Elicitação e Gerenciamento de Requisitos.',
            topicKeyword: 'Elicitação e Gerenciamento de Requisitos.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Requisitos e Experiência do Usuário.',
            topicKeyword: 'Requisitos e Experiência do Usuário.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'APIs.',
            topicKeyword: 'APIs.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Conceitos básicos de computação em nuvem.',
            topicKeyword: 'Conceitos básicos de computação em nuvem.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Governança de dados.',
            topicKeyword: 'Governança de dados.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Tipos de dados simples e estruturados.',
            topicKeyword: 'Tipos de dados simples e estruturados.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Significação das palavras.',
            topicKeyword: 'Significação das palavras.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Equivalências.',
            topicKeyword: 'Equivalências.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Governança de dados, TDD, ATDD, Elicitação e Gerenciamento de Requisitos e Significação das palavras.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 18,
    phase: 'Fase 3: Fechamento Integral do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 18: Assinatura e certificação digital; Governança de dados utilizando metodologia DAMA-DMBoK; Histórias do usuário, Critérios de Aceitação e Prototipação; Substituição de palavras ou de trechos de texto; Simulado BNB 3.',
    plannedContent:
      'Assinatura e certificação digital. Governança de dados utilizando metodologia DAMA-DMBoK (Data Management Body of Knowledge). Histórias do usuário. Critérios de Aceitação. Prototipação. Arquitetura Cloud Native. Variáveis e constantes. Substituição de palavras ou de trechos de texto. Diagramas lógicos.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Histórias do usuário.',
            topicKeyword: 'Histórias do usuário.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Critérios de Aceitação.',
            topicKeyword: 'Critérios de Aceitação.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Arquitetura Cloud Native.',
            topicKeyword: 'Arquitetura Cloud Native.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Tipologia: IaaS, PaaS e SaaS.',
            topicKeyword: 'Tipologia: IaaS, PaaS e SaaS.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Governança de dados utilizando metodologia DAMA-DMBoK (Data Management Body of Knowledge).',
            topicKeyword: 'Governança de dados utilizando metodologia DAMA-DMBoK (Data Management Body of Knowledge).',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Assinatura e certificação digital.',
            topicKeyword: 'Assinatura e certificação digital.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Variáveis e constantes.',
            topicKeyword: 'Variáveis e constantes.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Prototipação.',
            topicKeyword: 'Prototipação.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Substituição de palavras ou de trechos de texto.',
            topicKeyword: 'Substituição de palavras ou de trechos de texto.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Diagramas lógicos.',
            topicKeyword: 'Diagramas lógicos.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 3 (Edital Verticalizado): Governança de dados utilizando metodologia DAMA-DMBoK, Assinatura e certificação digital, Arquitetura Cloud Native e Substituição de palavras.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 19,
    phase: 'Fase 3: Fechamento Integral do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 19: Robot Process Automation (RPA); Noções de administração de SGBD: IBM DB2, MS SQL Server e PostgreSQL; Projeto centrado no usuário, Storytelling, Práticas ágeis e MVP; Reorganização da estrutura de orações e de períodos do texto.',
    plannedContent:
      'Robot Process Automation (RPA). Noções de administração de SGBD: IBM DB2, MS SQL Server e PostgreSQL. Projeto centrado no usuário de software. Storytelling. Práticas ágeis. Minimum Viable Product (MVP). Padrões de design de software. Reorganização da estrutura de orações e de períodos do texto. Lógica de primeira ordem.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Projeto centrado no usuário de software.',
            topicKeyword: 'Projeto centrado no usuário de software.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Storytelling.',
            topicKeyword: 'Storytelling.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Práticas ágeis.',
            topicKeyword: 'Práticas ágeis.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Minimum Viable Product (MVP).',
            topicKeyword: 'Minimum Viable Product (MVP).',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Padrões de design de software.',
            topicKeyword: 'Padrões de design de software.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Noções de administração de SGBD: IBM DB2, MS SQL Server e PostgreSQL.',
            topicKeyword: 'Noções de administração de SGBD: IBM DB2, MS SQL Server e PostgreSQL.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Modelos: privada, pública e híbrida.',
            topicKeyword: 'Modelos: privada, pública e híbrida.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Robot Process Automation (RPA).',
            topicKeyword: 'Robot Process Automation (RPA).',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Reorganização da estrutura de orações e de períodos do texto.',
            topicKeyword: 'Reorganização da estrutura de orações e de períodos do texto.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica de primeira ordem.',
            topicKeyword: 'Lógica de primeira ordem.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Questões (Edital BNB 2022): Noções de administração de SGBD (IBM DB2, MS SQL Server e PostgreSQL), Robot Process Automation (RPA) e Reorganização da estrutura de orações.',
          },
        ],
      },
    ],
  },

  // ============================================================================
  // FASE 4: RETA FINAL & REVISÃO SISTEMÁTICA DO EDITAL VERTICALIZADO (Semanas 20 a 24)
  // ============================================================================
  {
    weekIndex: 20,
    phase: 'Fase 4: Reta Final & Consolidação do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 20: Low/No Code; Reescrita de textos de diferentes gêneros e níveis de formalidade; Revisão do Edital em Arquitetura de dados, Modelagem de dados, Técnicas de componentização, ESB e Interoperabilidade.',
    plannedContent:
      'Low/No Code. Reescrita de textos de diferentes gêneros e níveis de formalidade. Técnicas de componentização de software. Barramento de Serviços Corporativos (ESB). Interoperabilidade entre aplicações. Arquitetura de dados. Modelagem de dados: conceitual, lógica e física. Criação e alteração dos modelos lógico e físico de dados. Gerenciamento de produtos com métodos ágeis: Scrum e Kanban. Princípios de contagem e probabilidade.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Técnicas de componentização de software.',
            topicKeyword: 'Técnicas de componentização de software.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Barramento de Serviços Corporativos (ESB).',
            topicKeyword: 'Barramento de Serviços Corporativos (ESB).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Arquitetura de dados.',
            topicKeyword: 'Arquitetura de dados.',
          },
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Modelagem de dados: conceitual, lógica e física.',
            topicKeyword: 'Modelagem de dados: conceitual, lógica e física.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Criação e alteração dos modelos lógico e físico de dados.',
            topicKeyword: 'Criação e alteração dos modelos lógico e físico de dados.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Interoperabilidade entre aplicações.',
            topicKeyword: 'Interoperabilidade entre aplicações.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Gerenciamento de produtos com métodos ágeis: Scrum e Kanban.',
            topicKeyword: 'Gerenciamento de produtos com métodos ágeis: Scrum e Kanban.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Low/No Code.',
            topicKeyword: 'Low/No Code.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Reescrita de textos de diferentes gêneros e níveis de formalidade.',
            topicKeyword: 'Reescrita de textos de diferentes gêneros e níveis de formalidade.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Princípios de contagem e probabilidade.',
            topicKeyword: 'Princípios de contagem e probabilidade.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 4 (Edital Verticalizado): Low/No Code, Reescrita de textos de diferentes gêneros e níveis de formalidade, Barramento de Serviços Corporativos (ESB) e Modelagem de dados.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 21,
    phase: 'Fase 4: Reta Final & Consolidação do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 21: Revisão do Edital em Testes de software, Automatização de testes, Análise por pontos de função (IFPUG e NESMA), Benefícios e Componentes centrais da arquitetura em nuvem, Comandos de atribuição e Avaliação de expressões.',
    plannedContent:
      'Testes de software: unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade. Ferramentas para automatização de testes. Análise por pontos de função (IFPUG e NESMA). Conceitos e técnicas do projeto de software. Benefícios e Componentes centrais da arquitetura em nuvem. Comandos de atribuição, entrada e saída. Avaliação de expressões. Compreensão e interpretação de textos de gêneros variados. Conjuntos: regras básicas e Leis de Morgan.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective:
              'Testes de software: unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade.',
            topicKeyword:
              'Testes de software: unitário, integração, funcional, aceitação, desempenho, carga e vulnerabilidade.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Ferramentas para automatização de testes.',
            topicKeyword: 'Ferramentas para automatização de testes.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective:
              'Benefícios: alta disponibilidade, escalabilidade, elasticidade, agilidade e recuperação de desastres.',
            topicKeyword:
              'Benefícios: alta disponibilidade, escalabilidade, elasticidade, agilidade e recuperação de desastres.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective:
              'Componentes centrais da arquitetura em nuvem: distribuição geográfica, regiões, zonas de disponibilidade, subscrições, grupos de gestão e recursos.',
            topicKeyword:
              'Componentes centrais da arquitetura em nuvem: distribuição geográfica, regiões, zonas de disponibilidade, subscrições, grupos de gestão e recursos.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Comandos de atribuição, entrada e saída.',
            topicKeyword: 'Comandos de atribuição, entrada e saída.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Avaliação de expressões.',
            topicKeyword: 'Avaliação de expressões.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Análise por pontos de função (IFPUG e NESMA).',
            topicKeyword: 'Análise por pontos de função (IFPUG e NESMA).',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Conceitos e técnicas do projeto de software.',
            topicKeyword: 'Conceitos e técnicas do projeto de software.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Compreensão e interpretação de textos de gêneros variados.',
            topicKeyword: 'Compreensão e interpretação de textos de gêneros variados.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective:
              'Conjuntos: regras básicas — pertinência; inclusão; operações de união e intersecção; complemento e diferença de conjuntos; Leis de Morgan —; problemas.',
            topicKeyword:
              'Conjuntos: regras básicas — pertinência; inclusão; operações de união e intersecção; complemento e diferença de conjuntos; Leis de Morgan —; problemas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 5 (Edital Verticalizado): Testes de software, Análise por pontos de função (IFPUG e NESMA), Arquitetura em nuvem e Conjuntos (Leis de Morgan).',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 22,
    phase: 'Fase 4: Reta Final & Consolidação do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 22: Inteligência Artificial (IA); Revisão do Edital em API Gateway, Servidores de aplicações, Abordagem relacional, Funções pré-definidas, Segurança na nuvem e Problemas aritméticos, geométricos e matriciais.',
    plannedContent:
      'Inteligência Artificial (IA). API Gateway. Conceitos básicos sobre servidores de aplicações. Abordagem relacional. Características gerais de identidade, privacidade, conformidade e segurança na nuvem. Funções pré-definidas. Processo interativo e incremental. Práticas ágeis de desenvolvimento de software. Reconhecimento de tipos e gêneros textuais. Raciocínio lógico envolvendo problemas aritméticos, geométricos e matriciais.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'API Gateway.',
            topicKeyword: 'API Gateway.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Processo interativo e incremental.',
            topicKeyword: 'Processo interativo e incremental.',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Abordagem relacional.',
            topicKeyword: 'Abordagem relacional.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Características gerais de identidade, privacidade, conformidade e segurança na nuvem.',
            topicKeyword: 'Características gerais de identidade, privacidade, conformidade e segurança na nuvem.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Inteligência Artificial (IA).',
            topicKeyword: 'Inteligência Artificial (IA).',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Funções pré-definidas.',
            topicKeyword: 'Funções pré-definidas.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Práticas ágeis de desenvolvimento de software.',
            topicKeyword: 'Práticas ágeis de desenvolvimento de software.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Conceitos básicos sobre servidores de aplicações.',
            topicKeyword: 'Conceitos básicos sobre servidores de aplicações.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Reconhecimento de tipos e gêneros textuais.',
            topicKeyword: 'Reconhecimento de tipos e gêneros textuais.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Raciocínio lógico envolvendo problemas aritméticos, geométricos e matriciais.',
            topicKeyword: 'Raciocínio lógico envolvendo problemas aritméticos, geométricos e matriciais.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 6 (Edital Verticalizado): Inteligência Artificial (IA), API Gateway, Servidores de aplicações, Abordagem relacional e Segurança na nuvem.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 23,
    phase: 'Fase 4: Reta Final & Consolidação do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 23: Machine Learning; Revisão do Edital em Conteinerização de aplicação, Frameworks de persistência de dados, Normalização das estruturas de dados, Infrastructure as Code (IaC) e Bloco de comandos.',
    plannedContent:
      'Machine Learning. Conteinerização de aplicação. Frameworks de persistência de dados. Normalização das estruturas de dados. Infrastructure as Code (IaC). Conceito de bloco de comandos. Desenvolvimento orientado por comportamento (BDD). Desenvolvimento guiado por testes (TDD). Domínio da ortografia oficial. Estruturas lógicas.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Conteinerização de aplicação.',
            topicKeyword: 'Conteinerização de aplicação.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento orientado por comportamento (BDD).',
            topicKeyword: 'Desenvolvimento orientado por comportamento (BDD).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Normalização das estruturas de dados.',
            topicKeyword: 'Normalização das estruturas de dados.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Infrastructure as Code (IaC).',
            topicKeyword: 'Infrastructure as Code (IaC).',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Machine Learning.',
            topicKeyword: 'Machine Learning.',
          },
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Conceito de bloco de comandos.',
            topicKeyword: 'Conceito de bloco de comandos.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento guiado por testes (TDD).',
            topicKeyword: 'Desenvolvimento guiado por testes (TDD).',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Frameworks de persistência de dados.',
            topicKeyword: 'Frameworks de persistência de dados.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Domínio da ortografia oficial.',
            topicKeyword: 'Domínio da ortografia oficial.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Estruturas lógicas.',
            topicKeyword: 'Estruturas lógicas.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Simulado BNB 7 (Edital Verticalizado): Machine Learning, Conteinerização de aplicação, Normalização das estruturas de dados, Infrastructure as Code (IaC) e TDD.',
          },
        ],
      },
    ],
  },
  {
    weekIndex: 24,
    phase: 'Fase 4: Reta Final & Consolidação Definitiva do Edital Verticalizado BNB 2022',
    objectives:
      'Semana 24: Consolidação Definitiva do Edital Verticalizado BNB 2022 — Mapeamento objeto-relacional, Serviços de mensageria, Integridade referencial, Automação, Estruturas de controle, Características das linguagens, ATDD e Requisitos.',
    plannedContent:
      'Mapeamento objeto-relacional. Serviços de mensageria. Integridade referencial. Automação. Estruturas de controle, seleção, repetição e desvio. Características estruturais das linguagens de programação. Desenvolvimento guiado por testes de aceitação (ATDD). Elicitação e Gerenciamento de Requisitos. Domínio dos mecanismos de coesão textual. Lógica de argumentação: analogias, inferências, deduções e conclusões.',
    days: [
      {
        dayOffset: 0,
        sessions: [
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Mapeamento objeto-relacional.',
            topicKeyword: 'Mapeamento objeto-relacional.',
          },
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Desenvolvimento guiado por testes de aceitação (ATDD).',
            topicKeyword: 'Desenvolvimento guiado por testes de aceitação (ATDD).',
          },
        ],
      },
      {
        dayOffset: 1,
        sessions: [
          {
            disciplineId: 'banco-dados',
            plannedMinutes: 60,
            objective: 'Integridade referencial.',
            topicKeyword: 'Integridade referencial.',
          },
          {
            disciplineId: 'nuvem',
            plannedMinutes: 60,
            objective: 'Automação.',
            topicKeyword: 'Automação.',
          },
        ],
      },
      {
        dayOffset: 2,
        sessions: [
          {
            disciplineId: 'logica-programacao',
            plannedMinutes: 60,
            objective: 'Estruturas de controle, seleção, repetição e desvio.',
            topicKeyword: 'Estruturas de controle, seleção, repetição e desvio.',
          },
          {
            disciplineId: 'linguagens',
            plannedMinutes: 60,
            objective: 'Características estruturais das linguagens de programação.',
            topicKeyword: 'Características estruturais das linguagens de programação.',
          },
        ],
      },
      {
        dayOffset: 3,
        sessions: [
          {
            disciplineId: 'engenharia',
            plannedMinutes: 60,
            objective: 'Elicitação e Gerenciamento de Requisitos.',
            topicKeyword: 'Elicitação e Gerenciamento de Requisitos.',
          },
          {
            disciplineId: 'arquitetura',
            plannedMinutes: 60,
            objective: 'Serviços de mensageria.',
            topicKeyword: 'Serviços de mensageria.',
          },
        ],
      },
      {
        dayOffset: 4,
        sessions: [
          {
            disciplineId: 'portugues',
            plannedMinutes: 60,
            objective: 'Domínio dos mecanismos de coesão textual.',
            topicKeyword: 'Domínio dos mecanismos de coesão textual.',
          },
          {
            disciplineId: 'raciocinio',
            plannedMinutes: 60,
            objective: 'Lógica de argumentação: analogias, inferências, deduções e conclusões.',
            topicKeyword: 'Lógica de argumentação: analogias, inferências, deduções e conclusões.',
          },
        ],
      },
      {
        dayOffset: 5,
        sessions: [
          {
            disciplineId: SIMULADO_DISCIPLINE_ID,
            plannedMinutes: 120,
            objective:
              'Sábado de Fechamento BNB (Edital Verticalizado 2022): Simulado Geral Final com todos os tópicos de Conhecimentos Gerais e Conhecimentos Específicos — Perfil 1: Desenvolvimento de Sistemas.',
          },
        ],
      },
    ],
  },
];

/**
 * Converte um template pedagógico de sessão gerado por IA para uma StudySession persistível.
 */
export function createAiStudySession(
  date: DateKey,
  disciplineId: string,
  plannedMinutes: number,
  objective: string,
  order: number,
  matchingTopicId: string | null = null,
): StudySession {
  const now = nowIso();
  const isSimulado = disciplineId === SIMULADO_DISCIPLINE_ID;
  return {
    id: createId(),
    date,
    disciplineId,
    topicId: matchingTopicId,
    plannedStart: isSimulado ? '08:00' : null,
    plannedMinutes,
    actualSeconds: 0,
    status: 'planejada',
    objective,
    notes: isSimulado
      ? 'Sábado exclusivo de resolução de questões ou simulados baseado rigorosamente no Edital Verticalizado BNB 2022.'
      : 'Sessão gerada exclusivamente por IA com base rigorosa no Edital Verticalizado BNB 2022 (Perfil 1: Desenvolvimento de Sistemas).',
    origin: 'planejada',
    startedAt: null,
    endedAt: null,
    recoveredFromId: null,
    order,
    history: [
      {
        at: now,
        type: 'criada',
        description: isSimulado
          ? 'Sábado de questões/simulado (2h) gerado pelo cronograma IA (Edital Verticalizado BNB 2022).'
          : 'Sessão de 2h diárias gerada pelo cronograma IA segundo o Edital Verticalizado BNB 2022.',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Encontra tópico cadastrado no banco que tenha correspondência com o item do Edital Verticalizado BNB 2022.
 */
export function findMatchingTopic(
  objective: string,
  disciplineId: string,
  topics: Topic[],
  topicKeyword?: string,
): Topic | null {
  const discTopics = topics.filter((t) => t.disciplineId === disciplineId && t.active);
  if (discTopics.length === 0) return null;

  const targetNorm = normalizeText(topicKeyword || objective);
  if (!targetNorm) return null;

  // 1. Correspondência exata normalizada
  for (const t of discTopics) {
    if (normalizeText(t.title) === targetNorm) {
      return t;
    }
  }

  // 2. Inclusão direta normalizada
  for (const t of discTopics) {
    const titleNorm = normalizeText(t.title);
    if (titleNorm && (targetNorm.includes(titleNorm) || titleNorm.includes(targetNorm))) {
      return t;
    }
  }

  // 3. Correspondência por palavras-chave significativas
  const targetWords = targetNorm.split(' ').filter((w) => w.length > 2);
  let bestMatch: Topic | null = null;
  let bestScore = 0;

  for (const t of discTopics) {
    const titleWords = normalizeText(t.title).split(' ').filter((w) => w.length > 2);
    let score = 0;
    for (const w of targetWords) {
      if (titleWords.includes(w)) score += 1;
    }
    if (score > bestScore && score >= Math.min(2, titleWords.length)) {
      bestScore = score;
      bestMatch = t;
    }
  }

  return bestMatch;
}

/**
 * Identifica se o conjunto de disciplinas e tópicos corresponde ao Edital padrão BNB 2022.
 */
export function isDefaultBnbSyllabus(disciplines: Discipline[], topics: Topic[]): boolean {
  const bnbIds = new Set(Object.keys(EDITAL_VERTICALIZADO_BNB_2022));
  const activeDiscs = disciplines.filter((d) => d.active);
  if (activeDiscs.length === 0) return true;
  const allMatchBnb = activeDiscs.every((d) => bnbIds.has(d.id));
  if (!allMatchBnb) return false;
  if (topics.length > 0 && topics.length !== 148) {
    const officialSet = new Set(Object.values(EDITAL_VERTICALIZADO_BNB_2022).flat());
    const matchingCount = topics.filter((t) => officialSet.has(t.title.trim())).length;
    if (matchingCount < topics.length * 0.5) return false;
  }
  return true;
}

/**
 * Gera dinamicamente a matriz pedagógica de 24 semanas para QUALQUER concurso e Edital Verticalizado
 * enviado pelo usuário, distribuindo todos os tópicos nas 4 fases progressivas.
 */
export function buildDynamicCurriculumFromEdital(
  disciplines: Discipline[],
  topics: Topic[],
  contestLabel = 'Concurso Selecionado',
): AiWeekTemplate[] {
  const activeDiscs = disciplines.filter((d) => d.active).sort((a, b) => a.order - b.order);
  const fallbackDisc: Discipline = activeDiscs[0] ?? {
    id: 'geral',
    name: 'Conhecimentos Gerais',
    color: '#c20018',
    active: true,
    order: 0,
    kind: 'general',
  };
  const discList = activeDiscs.length > 0 ? activeDiscs : [fallbackDisc];

  const techDiscs = discList.filter((d) => d.kind === 'technical');
  const genDiscs = discList.filter((d) => d.kind === 'general');

  // Constrói rotação de 10 sessões semanais (Seg a Sex, 2 por dia = 10 sessões)
  // Se houver específicas e gerais: 8 sessões específicas (Seg-Qui) e 2 gerais (Sex)
  const buildWeeklyDisciplineSlots = (weekIdx: number): Discipline[] => {
    const slots: Discipline[] = [];
    if (techDiscs.length > 0 && genDiscs.length > 0) {
      for (let i = 0; i < 8; i++) {
        slots.push(techDiscs[(weekIdx * 3 + i) % techDiscs.length]);
      }
      for (let i = 0; i < 2; i++) {
        slots.push(genDiscs[(weekIdx + i) % genDiscs.length]);
      }
    } else {
      for (let i = 0; i < 10; i++) {
        slots.push(discList[(weekIdx * 2 + i) % discList.length]);
      }
    }
    return slots;
  };

  const topicsByDisc = new Map<string, Topic[]>();
  for (const d of discList) {
    const dTopics = topics
      .filter((t) => t.disciplineId === d.id && t.active)
      .sort((a, b) => a.order - b.order);
    topicsByDisc.set(d.id, dTopics);
  }

  const discTopicCursor = new Map<string, number>();
  const nextTopicForDiscipline = (disc: Discipline, weekNum: number): string => {
    const list = topicsByDisc.get(disc.id) ?? [];
    if (list.length === 0) {
      return `Estudo dirigido de ${disc.name} — Bloco ${weekNum}`;
    }
    const idx = discTopicCursor.get(disc.id) ?? 0;
    discTopicCursor.set(disc.id, idx + 1);
    const topic = list[idx % list.length];
    if (idx >= list.length && weekNum >= 15) {
      return `Revisão e Questões: ${topic.title}`;
    }
    return topic.title;
  };

  const getPhaseName = (w: number): string => {
    if (w <= 6) return `Fase 1: Base do Edital Verticalizado (${contestLabel})`;
    if (w <= 14) return `Fase 2: Aprofundamento no Edital Verticalizado (${contestLabel})`;
    if (w <= 20) return `Fase 3: Consolidação e Baterias de Questões (${contestLabel})`;
    return `Fase 4: Reta Final e Revisão Intensiva (${contestLabel})`;
  };

  const weeks: AiWeekTemplate[] = [];

  for (let w = 1; w <= 24; w++) {
    const slots = buildWeeklyDisciplineSlots(w - 1);
    const weekTopics: string[] = [];
    const days: AiWeekTemplate['days'] = [];

    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      const d1 = slots[dayOffset * 2];
      const d2 = slots[dayOffset * 2 + 1];
      const t1 = nextTopicForDiscipline(d1, w);
      const t2 = nextTopicForDiscipline(d2, w);
      weekTopics.push(t1, t2);

      days.push({
        dayOffset,
        sessions: [
          {
            disciplineId: d1.id,
            plannedMinutes: 60,
            objective: t1,
            topicKeyword: t1.replace(/^Revisão e Questões:\s*/i, ''),
          },
          {
            disciplineId: d2.id,
            plannedMinutes: 60,
            objective: t2,
            topicKeyword: t2.replace(/^Revisão e Questões:\s*/i, ''),
          },
        ],
      });
    }

    const uniqueTopics = Array.from(new Set(weekTopics));
    const saturdaySummary = uniqueTopics.slice(0, 5).join(', ');
    days.push({
      dayOffset: 5,
      sessions: [
        {
          disciplineId: SIMULADO_DISCIPLINE_ID,
          plannedMinutes: 120,
          objective: `Sábado de Questões e Simulado (${contestLabel}): ${saturdaySummary}.`,
        },
      ],
    });

    weeks.push({
      weekIndex: w,
      phase: getPhaseName(w),
      objectives: `Semana ${w} (${contestLabel}): ${uniqueTopics.slice(0, 6).join('; ')}.`,
      plannedContent: uniqueTopics.join('. ') + '.',
      days,
    });
  }

  return weeks;
}

/**
 * Formata o Edital Verticalizado dinâmico (de qualquer concurso enviado pelo usuário) para o prompt da IA.
 */
export function formatDynamicEditalForPrompt(
  disciplines: Discipline[],
  topics: Topic[],
): string {
  if (isDefaultBnbSyllabus(disciplines, topics)) {
    return formatEditalVerticalizadoForPrompt();
  }
  const activeDiscs = disciplines.filter((d) => d.active).sort((a, b) => a.order - b.order);
  return activeDiscs
    .map((d) => {
      const kindLabel =
        d.kind === 'technical' ? 'Conhecimentos Específicos' : 'Conhecimentos Gerais';
      const header = `### ${d.name} (ID: ${d.id} — ${kindLabel})`;
      const dTopics = topics
        .filter((t) => t.disciplineId === d.id && t.active)
        .sort((a, b) => a.order - b.order);
      const list =
        dTopics.length > 0
          ? dTopics.map((t) => `- "${t.title}"`).join('\n')
          : `- "Tópicos gerais de ${d.name}"`;
      return `${header}\n${list}`;
    })
    .join('\n\n');
}

/**
 * Monta o plano de 24 semanas utilizando o motor de IA especializado (Builtin),
 * adaptando-se dinamicamente ao Edital Verticalizado do concurso escolhido pelo usuário.
 */
export function buildBuiltinAiSchedule(
  startDate: DateKey,
  disciplines: Discipline[],
  topics: Topic[],
  customInstructions?: string,
  contestLabel?: string,
): { weeklyPlans: WeeklyPlan[]; sessions: StudySession[] } {
  const activeDisciplines = disciplines.filter((d) => d.active);
  const activeDisciplineIds = new Set(activeDisciplines.map((d) => d.id));
  activeDisciplineIds.add(SIMULADO_DISCIPLINE_ID);
  const fallbackDiscId = activeDisciplines[0]?.id ?? 'engenharia';

  const useBnbDefault = isDefaultBnbSyllabus(disciplines, topics);
  const effectiveContestLabel =
    contestLabel ||
    (useBnbDefault
      ? 'Edital Verticalizado BNB 2022 (Perfil 1: Desenvolvimento de Sistemas)'
      : 'Edital Verticalizado do Concurso');

  const curriculum = useBnbDefault
    ? BNB_24_WEEKS_CURRICULUM
    : buildDynamicCurriculumFromEdital(disciplines, topics, effectiveContestLabel);

  const weeklyPlans: WeeklyPlan[] = [];
  const sessions: StudySession[] = [];

  const firstWeekStart = startOfWeek(startDate);

  for (const weekTpl of curriculum) {
    const weekStart = addDays(firstWeekStart, (weekTpl.weekIndex - 1) * 7);
    let totalWeeklyMinutes = 0;

    const weekSessions: StudySession[] = [];
    const weekdayDayTemplates = weekTpl.days.filter((d) => d.dayOffset !== 5);
    const saturdayTemplate = weekTpl.days.find((d) => d.dayOffset === 5);

    for (let offset = 0; offset < 7; offset++) {
      const sessionDate = addDays(weekStart, offset);
      const wIdx = weekdayIndex(sessionDate); // 0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb

      // Domingo (0) é sempre dia livre / descanso semanal (0 min)
      if (wIdx === 0) continue;

      // Não agenda sessões em datas anteriores à data de início estipulada
      if (sessionDate < startDate) continue;

      // Sábado (6) recebe o template exclusivo de questões/simulado; Seg..Sex (1..5) recebem os templates de dias úteis
      const day = wIdx === 6 ? saturdayTemplate : weekdayDayTemplates[wIdx - 1];
      if (!day) continue;

      let dayMinutes = 0;

      day.sessions.forEach((sTpl, idx) => {
        // Garante que o dia respeita estritamente o limite de 2h (120 min)
        if (dayMinutes >= 120) return;
        const allocatedMinutes = Math.min(sTpl.plannedMinutes, 120 - dayMinutes);
        if (allocatedMinutes <= 0) return;

        const discId = activeDisciplineIds.has(sTpl.disciplineId)
          ? sTpl.disciplineId
          : fallbackDiscId;
        const matchedTopic = findMatchingTopic(sTpl.objective, discId, topics, sTpl.topicKeyword);

        const session = createAiStudySession(
          sessionDate,
          discId,
          allocatedMinutes,
          sTpl.objective,
          idx,
          matchedTopic?.id ?? null,
        );

        weekSessions.push(session);
        dayMinutes += allocatedMinutes;
        totalWeeklyMinutes += allocatedMinutes;
      });
    }

    const weeklyPlan: WeeklyPlan = {
      id: createId(),
      weekIndex: weekTpl.weekIndex,
      weekStart,
      objectives:
        weekTpl.objectives +
        (customInstructions ? ` (Foco personalizado: ${customInstructions.slice(0, 50)})` : ''),
      plannedContent: weekTpl.plannedContent,
      plannedMinutes: totalWeeklyMinutes || (weekSessions.length === 0 ? 0 : 720),
      status: 'pendente',
      notes: useBnbDefault
        ? `${weekTpl.phase} — Baseado rigorosamente no Edital Verticalizado BNB 2022 (Perfil 1: Desenvolvimento de Sistemas).`
        : `${weekTpl.phase} — Cronograma gerado sob medida para o Edital Verticalizado (${effectiveContestLabel}).`,
    };

    weeklyPlans.push(weeklyPlan);
    sessions.push(...weekSessions);
  }

  return { weeklyPlans, sessions };
}

/**
 * Extrai texto JSON limpo de resposta que possa conter marcação Markdown (```json ... ```) ou texto ao redor.
 */
function extractJsonFromText(rawText: string): string {
  const trimmed = rawText.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

const FALLBACK_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-4-argon',
];

/**
 * Consulta dinamicamente a lista de modelos suportados para generateContent na chave de API informada.
 * Se houver erro de rede ou na chamada de listagem, recorre à lista de fallback.
 */
async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal },
    ).finally(() => clearTimeout(timer));

    if (response.ok) {
      const data = (await response.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      if (Array.isArray(data.models) && data.models.length > 0) {
        const models = data.models
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => (m.name ?? '').replace(/^models\//, ''))
          .filter((name) => Boolean(name) && !name.includes('embedding') && !name.includes('aqa'));

        if (models.length > 0) {
          // Prioriza modelos flash ou mais rápidos
          models.sort((a, b) => {
            const aFlash = a.includes('flash') ? -1 : 1;
            const bFlash = b.includes('flash') ? -1 : 1;
            return aFlash - bFlash;
          });
          return models;
        }
      }
    }
  } catch (err) {
    console.warn('Não foi possível listar modelos dinamicamente do Gemini, usando fallback:', err);
  }
  return FALLBACK_GEMINI_MODELS;
}

/** Formata a listagem completa e literal do Edital Verticalizado BNB 2022 para instruir o Gemini sem desvios. */
export function formatEditalVerticalizadoForPrompt(): string {
  const disciplineNames: Record<string, string> = {
    portugues: 'Língua Portuguesa (ID: portugues — Conhecimentos Gerais)',
    raciocinio: 'Raciocínio Lógico e Quantitativo (ID: raciocinio — Conhecimentos Gerais)',
    'logica-programacao': 'Lógica de Programação (ID: logica-programacao — Conhecimentos Específicos)',
    arquitetura: 'Arquitetura de Software (ID: arquitetura — Conhecimentos Específicos)',
    engenharia: 'Engenharia de Software (ID: engenharia — Conhecimentos Específicos)',
    linguagens: 'Linguagens e Tecnologias de Programação (ID: linguagens — Conhecimentos Específicos)',
    'banco-dados': 'Banco de Dados (ID: banco-dados — Conhecimentos Específicos)',
    nuvem: 'Computação em Nuvem (ID: nuvem — Conhecimentos Específicos)',
  };

  return Object.entries(EDITAL_VERTICALIZADO_BNB_2022)
    .map(([discId, items]) => {
      const header = `### ${disciplineNames[discId] ?? discId}`;
      const list = items.map((item) => `- "${item}"`).join('\n');
      return `${header}\n${list}`;
    })
    .join('\n\n');
}

/** Chama generateContent (tentando modelos disponíveis) e devolve o array "weeks" já interpretado. */
async function requestGeminiWeeks(
  apiKey: string,
  systemInstruction: string,
  userPrompt: string,
  availableModels: string[],
): Promise<AiWeekTemplate[]> {
  let lastError = 'sem resposta';
  for (const model of availableModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 32000,
              responseMimeType: 'application/json',
            },
          }),
        },
      );
      if (!response.ok) {
        lastError = `Erro na API do Gemini (${response.status}, ${model}): ${(await response.text()).slice(0, 300)}`;
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          if (!/model|not found|unsupported/i.test(lastError)) throw new Error(lastError);
        }
        continue;
      }
      const json = await response.json();
      const text: string | undefined = (json?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('');
      if (!text) {
        lastError = `Resposta vazia do modelo ${model}.`;
        continue;
      }
      const parsedJson = JSON.parse(extractJsonFromText(text)) as { weeks?: AiWeekTemplate[] };
      if (!Array.isArray(parsedJson.weeks) || parsedJson.weeks.length === 0) {
        lastError = `Modelo ${model} não retornou semanas.`;
        continue;
      }
      return parsedJson.weeks;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Erro na API do Gemini')) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Falha ao gerar cronograma com o Gemini: ${lastError}`);
}

/** O Gemini às vezes devolve listas no lugar de texto; o servidor exige string. */
function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(' ');
  return typeof value === 'string' ? value : '';
}

/**
 * Constrói a instrução de sistema adaptada ao concurso e ao Edital Verticalizado enviado pelo usuário.
 */
export function buildContestSystemInstruction(
  startDate: DateKey,
  disciplines: Discipline[],
  topics: Topic[],
  contestLabel?: string,
): string {
  const useBnbDefault = isDefaultBnbSyllabus(disciplines, topics);
  const activeDiscsList = disciplines.filter((d) => d.active);
  const activeDiscs = activeDiscsList
    .map(
      (d) =>
        `${d.id} (${d.name} - ${
          d.kind === 'technical'
            ? useBnbDefault
              ? 'Conhecimentos Específicos — Perfil 1: Desenvolvimento de Sistemas'
              : 'Conhecimentos Específicos'
            : 'Conhecimentos Gerais'
        })`,
    )
    .join(', ');

  if (useBnbDefault) {
    const editalPromptBlock = formatEditalVerticalizadoForPrompt();
    return `Você é um mentor especialista no concurso do Banco do Nordeste do Brasil (BNB) para o cargo de Especialista Técnico — Analista de Sistemas — Perfil 1: Desenvolvimento de Sistemas (Edital nº 1 — BNB, de 22 de setembro de 2022, item 14.2.1.1 e item 14.2.2, Perfil 1).
Você DEVE estruturar um cronograma de exatamente 24 semanas a partir da data de início ${startDate} baseando-se RIGOROSAMENTE e EXCLUSIVAMENTE nos tópicos listados no EDITAL VERTICALIZADO — BNB 2022 abaixo.

PROIBIÇÃO ESTRITA:
- NÃO invente, NÃO extrapole e NÃO inclua assuntos que não estejam literalmente previstos na lista oficial do Edital Verticalizado BNB 2022 abaixo (por exemplo: não inclua ITIL, COBIT, OWASP, Kubernetes, GraphQL, gRPC ou qualquer outro tema ausente do PDF).
- Cada sessão de estudo de segunda a sexta DEVE ter no campo "objective" exatamente o nome literal de um tópico oficial da respectiva disciplina constante na lista abaixo.
- O campo "plannedContent" de cada semana DEVE listar somente os tópicos do Edital Verticalizado estudados naquela semana.

REGRAS OBRIGATÓRIAS DE CARGA E ESTRUTURA:
1. Dias de estudo com RIGOROSAMENTE 2 horas (120 minutos) de estudo (duas sessões de 60 minutos de segunda a sexta).
2. Sábados (dayOffset 5): EXCLUSIVAMENTE dedicados à resolução de questões ou simulados sobre os tópicos do Edital Verticalizado estudados na semana (1 sessão de 120 minutos com disciplineId "simulado").
3. Domingos: Dia livre / descanso semanal (0 minutos de estudo planejado).
4. Segunda a Sexta (dayOffset 0 a 4): Foco predominante nos Conhecimentos Específicos — Perfil 1: Desenvolvimento de Sistemas (logica-programacao, arquitetura, engenharia, linguagens, banco-dados, nuvem) com 80% do tempo dos dias úteis (4 dias / 8 sessões de 60 min), e Conhecimentos Gerais (portugues, raciocinio) com 20% do tempo dos dias úteis (1 dia / 2 sessões de 60 min).
5. Disciplinas ativas no sistema: ${activeDiscs}.

LISTA INTEGRAL E EXCLUSIVA DE TÓPICOS DO EDITAL VERTICALIZADO — BNB 2022:
${editalPromptBlock}

Retorne ESTRITAMENTE um objeto JSON válido contendo a chave "weeks" com array das semanas solicitadas na mensagem do usuário (cada uma com seu weekIndex correto, de 1 a 24).
Cada semana deve ter:
- "weekIndex": número de 1 a 24
- "objectives": resumo pedagógico da semana citando exclusivamente os tópicos do Edital Verticalizado BNB 2022 abordados
- "plannedContent": lista dos tópicos literais do Edital Verticalizado BNB 2022 estudados na semana
- "days": array de 6 dias (dayOffset 0 a 5, onde 0=segunda, 1=terça, 2=quarta, 3=quinta, 4=sexta e 5=sábado)
  Cada dia tem:
  - "dayOffset": 0 a 5
  - "sessions": array de sessões que somam exatamente 120 minutos (duas de 60m de segunda a sexta; uma de 120m no sábado)
    Cada sessão tem:
    - "disciplineId": ID válido de disciplina ("portugues", "raciocinio", "logica-programacao", "arquitetura", "engenharia", "linguagens", "banco-dados", "nuvem") ou "simulado" no sábado
    - "plannedMinutes": 60 (dias úteis) ou 120 (sábado)
    - "objective": título EXATO e LITERAL do tópico correspondente no Edital Verticalizado BNB 2022 acima (ou descrição do simulado/questões no sábado referenciando os tópicos da semana)`;
  }

  const label = contestLabel || 'Concurso Público Selecionado';
  const dynamicEditalBlock = formatDynamicEditalForPrompt(disciplines, topics);
  const validDiscIds = activeDiscsList.map((d) => `"${d.id}"`).join(', ');

  return `Você é um mentor especialista em preparação de alto desempenho para o concurso "${label}".
Você DEVE estruturar um cronograma estratégico de exatamente 24 semanas a partir da data de início ${startDate} baseando-se RIGOROSAMENTE e EXCLUSIVAMENTE nos tópicos do EDITAL VERTICALIZADO enviado pelo usuário abaixo.

DIRETRIZES DO EDITAL VERTICALIZADO (${label}):
- Adapte todo o planejamento às disciplinas e aos tópicos reais do edital verticalizado listado abaixo.
- Cada sessão de estudo de segunda a sexta DEVE ter no campo "objective" o título literal de um tópico oficial da respectiva disciplina constante no Edital Verticalizado abaixo.
- O campo "plannedContent" de cada semana DEVE listar os tópicos do Edital Verticalizado estudados naquela semana.

REGRAS OBRIGATÓRIAS DE CARGA E ESTRUTURA:
1. Dias de estudo com RIGOROSAMENTE 2 horas (120 minutos) de estudo (duas sessões de 60 minutos de segunda a sexta).
2. Sábados (dayOffset 5): EXCLUSIVAMENTE dedicados à resolução de questões da banca ou simulados sobre os tópicos do Edital Verticalizado estudados na semana (1 sessão de 120 minutos com disciplineId "simulado").
3. Domingos: Dia livre / descanso semanal (0 minutos de estudo planejado).
4. Segunda a Sexta (dayOffset 0 a 4): Priorize as disciplinas de Conhecimentos Específicos (80% do tempo quando presentes) e Conhecimentos Gerais (20% do tempo), cobrindo 100% do edital verticalizado nas 24 semanas.
5. Disciplinas ativas no edital: ${activeDiscs}.

LISTA INTEGRAL DE DISCIPLINAS E TÓPICOS DO EDITAL VERTICALIZADO (${label}):
${dynamicEditalBlock}

Retorne ESTRITAMENTE um objeto JSON válido contendo a chave "weeks" com array das semanas solicitadas na mensagem do usuário (cada uma com seu weekIndex correto, de 1 a 24).
Cada semana deve ter:
- "weekIndex": número de 1 a 24
- "objectives": resumo pedagógico da semana para o concurso ${label}
- "plannedContent": lista dos tópicos do Edital Verticalizado estudados na semana
- "days": array de 6 dias (dayOffset 0 a 5, onde 0=segunda, 1=terça, 2=quarta, 3=quinta, 4=sexta e 5=sábado)
  Cada dia tem:
  - "dayOffset": 0 a 5
  - "sessions": array de sessões que somam exatamente 120 minutos (duas de 60m de segunda a sexta; uma de 120m no sábado)
    Cada sessão tem:
    - "disciplineId": ID válido de disciplina (${validDiscIds}) ou "simulado" no sábado
    - "plannedMinutes": 60 (dias úteis) ou 120 (sábado)
    - "objective": título do tópico correspondente no Edital Verticalizado acima (ou descrição do simulado/questões no sábado)`;
}

/**
 * Chamada à API Google Gemini para gerar o cronograma de 24 semanas vinculado
 * ao Edital Verticalizado do concurso escolhido pelo usuário.
 */
export async function callGeminiScheduleApi(
  apiKey: string,
  startDate: DateKey,
  disciplines: Discipline[],
  topics: Topic[],
  customInstructions?: string,
  contestLabel?: string,
): Promise<{ weeklyPlans: WeeklyPlan[]; sessions: StudySession[] }> {
  const useBnbDefault = isDefaultBnbSyllabus(disciplines, topics);
  const effectiveLabel =
    contestLabel ||
    (useBnbDefault
      ? 'BNB Analista de Sistemas — Perfil 1: Desenvolvimento de Sistemas'
      : 'Concurso Selecionado');

  const referenceCurriculum = useBnbDefault
    ? BNB_24_WEEKS_CURRICULUM
    : buildDynamicCurriculumFromEdital(disciplines, topics, effectiveLabel);

  const systemInstruction = buildContestSystemInstruction(
    startDate,
    disciplines,
    topics,
    effectiveLabel,
  );

  const extra = customInstructions
    ? ` Instruções adicionais do usuário (respeitando estritamente os tópicos do Edital Verticalizado): ${customInstructions}`
    : '';
  const buildUserPrompt = (from: number, to: number) => {
    const referenceSlice = referenceCurriculum
      .slice(from - 1, to)
      .map((w) => `Semana ${w.weekIndex}: ${w.plannedContent}`)
      .join('\n');
    return `Gere SOMENTE as semanas ${from} a ${to} (do total de 24) do cronograma para ${effectiveLabel}, com data de início em ${startDate}.
Use rigorosamente os tópicos do Edital Verticalizado. Distribuição de referência dos tópicos do edital para estas semanas:
${referenceSlice}
Responda apenas com o JSON {"weeks":[...]} contendo ${to - from + 1} semanas.${extra}`;
  };

  const CHUNK_SIZE = 6;
  const chunks: Array<[number, number]> = [];
  for (let from = 1; from <= 24; from += CHUNK_SIZE) chunks.push([from, from + CHUNK_SIZE - 1]);

  const availableModels = await getAvailableGeminiModels(apiKey);

  const chunkResults = await Promise.all(
    chunks.map(([from, to]) =>
      requestGeminiWeeks(apiKey, systemInstruction, buildUserPrompt(from, to), availableModels).catch((err: unknown) => err),
    ),
  );

  const weeksByIndex = new Map<number, AiWeekTemplate>();
  let firstError: unknown = null;
  chunkResults.forEach((r, ci) => {
    if (r instanceof Error || !Array.isArray(r)) {
      firstError ??= r;
      return;
    }
    const [from] = chunks[ci];
    r.forEach((w, i) => {
      const idx =
        Number.isInteger(w?.weekIndex) && w.weekIndex >= from && w.weekIndex < from + CHUNK_SIZE
          ? w.weekIndex
          : from + i;
      if (idx >= 1 && idx <= 24 && !weeksByIndex.has(idx)) weeksByIndex.set(idx, w);
    });
  });

  if (weeksByIndex.size === 0) {
    throw firstError instanceof Error
      ? firstError
      : new Error('A API do Gemini não retornou nenhuma semana válida.');
  }

  // Semanas ausentes/inválidas são completadas pela matriz pedagógica do Edital Verticalizado.
  const parsed: { weeks: AiWeekTemplate[] } = {
    weeks: Array.from({ length: 24 }, (_, i) => weeksByIndex.get(i + 1) ?? referenceCurriculum[i]),
  };

  const weeklyPlans: WeeklyPlan[] = [];
  const sessions: StudySession[] = [];
  const activeDisciplines = disciplines.filter((d) => d.active);
  const activeDisciplineIds = new Set(activeDisciplines.map((d) => d.id));
  activeDisciplineIds.add(SIMULADO_DISCIPLINE_ID);
  const fallbackDiscId = activeDisciplines[0]?.id ?? 'engenharia';

  const firstWeekStart = startOfWeek(startDate);
  const topicCounters: Record<string, number> = {};

  for (let i = 0; i < 24; i++) {
    const weekData = parsed.weeks[i];
    const fallbackWeek = referenceCurriculum[i];
    const weekStart = addDays(firstWeekStart, i * 7);
    let totalWeeklyMinutes = 0;

    const rawDays = weekData.days || [];
    const saturdayDay =
      rawDays.find((d) => d.sessions?.some((s) => s.disciplineId === SIMULADO_DISCIPLINE_ID)) ??
      rawDays.find((d) => d.dayOffset === 5) ??
      fallbackWeek.days.find((d) => d.dayOffset === 5);
    const weekdayDays = rawDays.filter((d) => d !== saturdayDay);
    const fallbackWeekdays = fallbackWeek.days.filter((d) => d.dayOffset !== 5);

    const weekOfficialTopics: string[] = [];

    for (let offset = 0; offset < 7; offset++) {
      const sessionDate = addDays(weekStart, offset);
      const wIdx = weekdayIndex(sessionDate); // 0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb

      // Domingo (0) é sempre dia livre (0 min)
      if (wIdx === 0) continue;

      // Não agenda sessões em datas anteriores à data de início estipulada
      if (sessionDate < startDate) continue;

      const isSaturday = wIdx === 6;
      const day = isSaturday
        ? saturdayDay
        : weekdayDays[wIdx - 1] ?? fallbackWeekdays[wIdx - 1];
      if (!day) continue;

      let dayMinutes = 0;

      for (let sIdx = 0; sIdx < (day.sessions || []).length; sIdx++) {
        const s = day.sessions[sIdx];
        if (dayMinutes >= 120) break;
        const rawMinutes = Math.max(1, Math.round(Number(s.plannedMinutes) || 60));
        const allocatedMinutes = Math.min(rawMinutes, 120 - dayMinutes);
        if (allocatedMinutes <= 0) continue;

        const discId = isSaturday
          ? SIMULADO_DISCIPLINE_ID
          : activeDisciplineIds.has(s.disciplineId)
            ? s.disciplineId
            : fallbackDiscId;

        let finalObjective = s.objective || '';
        let matchedTopic: Topic | null = null;

        if (isSaturday) {
          finalObjective =
            s.objective && s.objective.trim().length > 0
              ? s.objective.trim()
              : fallbackWeek.days.find((d) => d.dayOffset === 5)?.sessions[0]?.objective ??
                `Sábado de Questões/Simulado (${effectiveLabel})`;
        } else if (useBnbDefault) {
          const counter = topicCounters[discId] ?? 0;
          topicCounters[discId] = counter + 1;
          const enforced = enforceOfficialEditalObjective(finalObjective, discId, counter);
          finalObjective = enforced.objective;
          weekOfficialTopics.push(enforced.officialTopic);
          matchedTopic = findMatchingTopic(finalObjective, discId, topics, enforced.officialTopic);
        } else {
          const counter = topicCounters[discId] ?? 0;
          topicCounters[discId] = counter + 1;
          matchedTopic = findMatchingTopic(finalObjective, discId, topics);
          if (!matchedTopic) {
            const discTopics = topics.filter((t) => t.disciplineId === discId && t.active);
            if (discTopics.length > 0) {
              matchedTopic = discTopics[counter % discTopics.length];
            }
          }
          if (matchedTopic) {
            finalObjective = matchedTopic.title;
            weekOfficialTopics.push(matchedTopic.title);
          } else if (finalObjective) {
            weekOfficialTopics.push(finalObjective);
          }
        }

        sessions.push(
          createAiStudySession(
            sessionDate,
            discId,
            allocatedMinutes,
            finalObjective,
            sIdx,
            matchedTopic?.id ?? null,
          ),
        );

        dayMinutes += allocatedMinutes;
        totalWeeklyMinutes += allocatedMinutes;
      }
    }

    const plannedContentFromTopics =
      weekOfficialTopics.length > 0 ? Array.from(new Set(weekOfficialTopics)).join(' ') : fallbackWeek.plannedContent;

    weeklyPlans.push({
      id: createId(),
      weekIndex: i + 1,
      weekStart,
      objectives: asText(weekData.objectives) || fallbackWeek.objectives,
      plannedContent: asText(weekData.plannedContent) || plannedContentFromTopics,
      plannedMinutes: totalWeeklyMinutes || 720,
      status: 'pendente',
      notes: useBnbDefault
        ? 'Cronograma gerado via Google Gemini AI — Baseado rigorosamente no Edital Verticalizado BNB 2022 (Perfil 1: Desenvolvimento de Sistemas).'
        : `Cronograma gerado via Google Gemini AI — Adaptado ao Edital Verticalizado (${effectiveLabel}).`,
    });
  }

  return { weeklyPlans, sessions };
}

/**
 * Função principal que coordena a geração do cronograma de 24 semanas por Inteligência Artificial.
 */
export async function generateAiSchedulePlan(params: {
  startDate: DateKey;
  disciplines: Discipline[];
  topics: Topic[];
  settings: Settings;
  options?: AiScheduleOptions;
}): Promise<AiScheduleResult> {
  const { startDate, disciplines, topics, settings, options } = params;
  const effectiveProvider =
    options?.provider ??
    settings.aiProvider ??
    (options?.apiKey || settings.geminiApiKey ? 'gemini' : 'builtin');
  const apiKey = options?.apiKey || settings.geminiApiKey;
  const contestLabel = settings.contestName
    ? `${settings.contestName}${settings.contestRole ? ` — ${settings.contestRole}` : ''}`
    : undefined;

  if (effectiveProvider === 'gemini' && apiKey?.trim()) {
    try {
      const result = await callGeminiScheduleApi(
        apiKey.trim(),
        startDate,
        disciplines,
        topics,
        options?.customInstructions,
        contestLabel,
      );
      return {
        weeklyPlans: result.weeklyPlans,
        sessions: result.sessions,
        providerUsed: 'gemini',
      };
    } catch (err) {
      console.warn('Falha na chamada ao Gemini API, acionando motor IA Especialista Integrado:', err);
      if (options?.provider === 'gemini') {
        throw err;
      }
    }
  }

  // Motor Especialista Integrado (Builtin)
  const result = buildBuiltinAiSchedule(
    startDate,
    disciplines,
    topics,
    options?.customInstructions,
    contestLabel,
  );
  return {
    weeklyPlans: result.weeklyPlans,
    sessions: result.sessions,
    providerUsed: 'builtin',
  };
}

/**
 * Filtra e ajusta sessões geradas por IA para respeitar sessões pré-existentes (manuais ou executadas).
 */
export function filterAndAdjustAiSessions(
  aiSessions: StudySession[],
  preservedSessions: StudySession[],
): StudySession[] {
  // Mapeia minutos e disciplinas já alocadas por data nas sessões preservadas (manuais ou executadas)
  const dayMap = new Map<DateKey, { totalMinutes: number; preservedDisciplines: Set<string> }>();
  for (const s of preservedSessions) {
    const entry = dayMap.get(s.date) ?? { totalMinutes: 0, preservedDisciplines: new Set<string>() };
    entry.totalMinutes += s.plannedMinutes;
    entry.preservedDisciplines.add(s.disciplineId);
    dayMap.set(s.date, entry);
  }

  const finalSessions: StudySession[] = [];

  for (const session of aiSessions) {
    const existing = dayMap.get(session.date);
    if (existing) {
      // Se o dia já estiver com a cota de 2h (120m) preenchida, não adiciona mais
      if (existing.totalMinutes >= 120) continue;

      // Se a mesma disciplina já foi criada manualmente/executada no mesmo dia, evita duplicação
      if (existing.preservedDisciplines.has(session.disciplineId)) continue;

      // Ajusta minutos para nunca exceder o limite de 2h
      const remainingMinutes = 120 - existing.totalMinutes;
      if (remainingMinutes <= 0) continue;

      if (session.plannedMinutes > remainingMinutes) {
        session.plannedMinutes = remainingMinutes;
      }

      existing.totalMinutes += session.plannedMinutes;
    } else {
      dayMap.set(session.date, {
        totalMinutes: session.plannedMinutes,
        preservedDisciplines: new Set<string>(),
      });
    }

    finalSessions.push(session);
  }

  return finalSessions;
}
