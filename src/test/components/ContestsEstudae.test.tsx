import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../App";
import { AuthScreen } from "../../screens/AuthScreen";
import { resetDatabase } from "../../db/db";
import {
  setAuthSession,
  TEST_BYPASS_TOKEN,
  type AuthSessionDto,
} from "../../services/auth";
import { parseEditalVerticalizado } from "../../domain/contests";
import {
  buildBuiltinAiSchedule,
  buildContestSystemInstruction,
} from "../../services/aiSchedule";
import {
  createAndActivateContest,
  getUserContests,
} from "../../services/contests";

const REAL_SESSION: AuthSessionDto = {
  token: "real-jwt-session-token",
  tokenType: "Bearer",
  expiresIn: 86400,
  user: {
    id: "user-estudae-1",
    name: "Candidata Estudaê",
    email: "candidata@estudae.com.br",
    createdAt: new Date().toISOString(),
  },
};

const TEST_SESSION: AuthSessionDto = {
  token: TEST_BYPASS_TOKEN,
  tokenType: "Bearer",
  expiresIn: 86400,
  user: {
    id: "user-test-1",
    name: "Candidato Teste",
    email: "candidato@teste.com",
    createdAt: new Date().toISOString(),
  },
};

describe("estudaê — Multi-Concursos, Edital Verticalizado e Perfis Estilo Netflix", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    setAuthSession(null);
    await resetDatabase();
  });

  it("bloqueia o envio do edital verticalizado no cadastro até o usuário pesquisar e escolher o concurso no dropdown", async () => {
    render(<AuthScreen onAuthenticated={() => {}} />);

    // Alterna para a aba de cadastro
    fireEvent.click(screen.getByRole("tab", { name: /cadastrar novo/i }));

    // Antes de escolher o concurso, a área de envio do edital verticalizado deve estar bloqueada
    expect(screen.getByTestId("edital-upload-locked")).toBeInTheDocument();
    expect(
      screen.queryByTestId("edital-upload-unlocked"),
    ).not.toBeInTheDocument();

    // Abre o dropdown com pesquisa e filtra por "Polícia Federal"
    fireEvent.click(screen.getByTestId("contest-dropdown-trigger"));
    const searchInput = screen.getByTestId("contest-search-input");
    fireEvent.change(searchInput, { target: { value: "Polícia Federal" } });

    const pfOption = screen.getByTestId("contest-option-pf-agente");
    fireEvent.click(pfOption);

    // Após escolher o concurso, a área de enviar o edital verticalizado é liberada
    await waitFor(() => {
      expect(screen.getByTestId("edital-upload-unlocked")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("edital-upload-locked"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Edital Verticalizado — Polícia Federal/i),
    ).toBeInTheDocument();
  });

  it("adapta o prompt da IA e gera cronograma de 24 semanas específico para o Edital Verticalizado enviado pelo usuário", () => {
    const customEditalText = `
Direito Constitucional:
1. Direitos e Garantias Fundamentais
2. Organização do Estado e dos Poderes

Contabilidade Geral:
1. Patrimônio, Ativo, Passivo e Patrimônio Líquido
2. Demonstração do Resultado do Exercício (DRE)

Tecnologia da Informação e Ciência de Dados:
1. Bancos de Dados Relacionais e SQL
2. Aprendizado de Máquina e Redes Neurais
3. Segurança da Informação e Criptografia
`;

    const parsed = parseEditalVerticalizado(customEditalText, "rfb-auditor");
    expect(parsed.disciplines.length).toBe(3);
    expect(parsed.topics.length).toBe(7);

    const prompt = buildContestSystemInstruction(
      "2025-05-05",
      parsed.disciplines,
      parsed.topics,
      "Receita Federal — Auditor-Fiscal",
    );

    expect(prompt).toContain("Receita Federal — Auditor-Fiscal");
    expect(prompt).toContain("Direito Constitucional");
    expect(prompt).toContain("Demonstração do Resultado do Exercício (DRE)");
    expect(prompt).toContain("Aprendizado de Máquina e Redes Neurais");

    const schedule = buildBuiltinAiSchedule(
      "2025-05-05",
      parsed.disciplines,
      parsed.topics,
      undefined,
      "Receita Federal — Auditor-Fiscal",
    );

    expect(schedule.weeklyPlans).toHaveLength(24);
    expect(schedule.sessions.length).toBeGreaterThan(200);
    expect(
      schedule.sessions.some((s) =>
        s.objective.includes("Aprendizado de Máquina e Redes Neurais"),
      ),
    ).toBe(true);
  });

  it("exibe a tela de seleção de concursos estilo Netflix ao logar e redireciona para o dashboard ao escolher um concurso", async () => {
    setAuthSession(REAL_SESSION);

    render(<App />);

    // Deve exibir a tela estilo Netflix com os concursos do usuário
    const selectorScreen = await screen.findByTestId("contest-selector-screen");
    expect(selectorScreen).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /qual concurso (vamos|você vai) estudar agora\?/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("new-contest-card-button")).toBeInTheDocument();

    // Clica no card do concurso padrão para entrar no dashboard específico
    const defaultCard = screen.getByTestId("contest-card-default");
    fireEvent.click(defaultCard);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /visão geral/i }),
      ).toBeInTheDocument();
    });
  });

  it('exibe a opção "Novo concurso" no painel lateral esquerdo e permite criar múltiplos concursos na conta', async () => {
    setAuthSession(TEST_SESSION);
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /visão geral/i }),
      ).toBeInTheDocument();
    });

    // Verifica que a marca "estudaê" e o botão "+ Novo concurso" estão presentes na barra lateral esquerda
    expect(
      screen.getByRole("heading", { name: /^estudaê$/i }),
    ).toBeInTheDocument();
    const newContestBtn = screen.getByTestId("sidebar-new-contest-button");
    expect(newContestBtn).toBeInTheDocument();
    expect(newContestBtn).toHaveTextContent("Novo concurso");

    // Cria um segundo concurso para o usuário
    await createAndActivateContest({
      templateId: "bb-ti",
      editalText:
        "Língua Portuguesa:\n1. Interpretação de textos\nConhecimentos Bancários:\n1. Sistema Financeiro Nacional",
      editalFileName: "edital-bb.txt",
      generateScheduleNow: true,
    });

    const allContests = getUserContests();
    expect(allContests.length).toBe(2);
    expect(allContests.some((c) => c.templateId === "bb-ti")).toBe(true);
  });

  it("permite abrir o modal de editar perfil pelo header e atualizar nome e foto do usuário", async () => {
    setAuthSession(TEST_SESSION);
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /visão geral/i }),
      ).toBeInTheDocument();
    });

    const profileBtn = screen.getByTestId("header-profile-button");
    expect(profileBtn).toBeInTheDocument();
    expect(profileBtn).toHaveTextContent("Candidato Teste");

    fireEvent.click(profileBtn);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("Candidato Teste");
    fireEvent.change(nameInput, { target: { value: "Maria Aprovada" } });

    const fileInput = screen.getByTestId(
      "avatar-file-input",
    ) as HTMLInputElement;
    const fakePng = new File([new Uint8Array([137, 80, 78, 71])], "foto.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [fakePng] } });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /trocar foto/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("header-profile-button")).toHaveTextContent(
        "Maria Aprovada",
      );
    });
  });
});
