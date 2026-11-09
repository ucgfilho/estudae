# estudaê — Dashboard de Estudos

Dashboard web para organizar e acompanhar estudos para concursos públicos. O
projeto nasceu com foco no concurso do Banco do Nordeste (BNB), mas permite
criar e alternar entre diferentes concursos, incluindo concursos
personalizados com edital verticalizado.

## Funcionalidades

- Cadastro, login e edição de perfil com autenticação JWT.
- Seleção de concurso a partir de modelos predefinidos ou de um concurso
  personalizado.
- Importação de edital verticalizado em texto ou arquivo e geração automática
  de disciplinas, tópicos e cronograma.
- Visão geral com metas, progresso, sequência de estudos e desempenho.
- Calendário mensal, semanal e diário para planejar e reagendar sessões.
- Cronograma de 24 semanas com distribuição de carga e recuperação de sessões
  atrasadas.
- Cronômetro de estudo com pausa, retomada, modo foco e anotações.
- Registro de questões, métricas de acerto e identificação de questões não
  classificadas.
- Caderno de erros com classificação, evolução e tarefas de revisão espaçada.
- Revisões organizadas por vencimento, com ações de concluir, adiar e reabrir.
- Simulados com folha de respostas, resultado e caderno de erros.
- Gerenciamento hierárquico de disciplinas, tópicos e subtópicos.
- Relatórios por dia, semana ou mês e exportação de sessões e questões em CSV.
- Configuração de metas, tema, data da prova, intervalos de revisão e backup
  ou restauração dos dados em JSON.
- Geração de cronograma por motor integrado ou Google Gemini, quando uma chave
  for configurada.

## Stack

### Frontend

- React 19 e TypeScript.
- Vite e Tailwind CSS 4.
- React Router e Lucide React.
- Recharts para gráficos.
- Zod para validação de dados e backups.

### Backend

- Servidor HTTP Node.js em TypeScript.
- API REST em `/api`.
- JWT para autenticação e bcrypt para hash de senhas.
- SQLite local usando `node:sqlite` como padrão.
- MongoDB Atlas opcional quando `MONGODB_URI` estiver configurada.
- Criptografia AES-256-GCM para dados sensíveis armazenados no backend.

O frontend mantém uma cópia reativa do workspace em memória e persiste as
alterações no backend por lotes. Um cache local no `localStorage` permite
recuperar o workspace quando a rede estiver indisponível; a sincronização é
retomada quando a API volta a responder.

## Requisitos

- Node.js 22 ou superior.
- npm.
- MongoDB acessível apenas se o modo MongoDB for utilizado.

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo de ambiente:

   ```bash
   cp .env.example .env
   ```

3. Para o uso padrão, mantenha o SQLite local e defina pelo menos um segredo
   JWT:

   ```dotenv
   PORT=8080
   NODE_ENV=development
   JWT_SECRET=uma-chave-aleatoria-com-pelo-menos-32-bytes
   ```

   O banco será criado em `data/bnb_estudos.sqlite` por padrão. Para usar
   MongoDB, preencha `MONGODB_URI`; nesse caso, o backend seleciona
   automaticamente os repositórios MongoDB.

4. Inicie o frontend em desenvolvimento:

   ```bash
   npm run dev
   ```

   Acesse a URL exibida pelo Vite, normalmente
   [http://localhost:5173](http://localhost:5173). As requisições `/api` são
   encaminhadas pelo servidor de desenvolvimento.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `PORT` | Não | Porta do servidor Node. O padrão é `3000`. |
| `NODE_ENV` | Não | Ambiente de execução. |
| `DB_PATH` | Não | Caminho do arquivo SQLite. |
| `MONGODB_URI` | Não | URI do MongoDB Atlas; ativa o modo MongoDB. |
| `JWT_SECRET` | Recomendada | Segredo usado para assinar tokens e criptografar dados sensíveis. |
| `JWT_ISSUER` | Não | Emissor do token JWT. |
| `JWT_AUDIENCE` | Não | Público do token JWT. |
| `JWT_EXPIRES_IN` | Não | Validade do token em segundos; padrão de 7 dias. |
| `SEED_FILE_PATH` | Não | Caminho do workspace inicial em JSON. |
| `DEFAULT_USER_EMAIL` | Não | E-mail opcional do usuário inicial. |
| `DEFAULT_USER_PASSWORD` | Não | Senha opcional do usuário inicial. |
| `DEFAULT_USER_NAME` | Não | Nome do usuário inicial. |

Nunca versionar `.env`, senhas, tokens ou chaves de APIs. O arquivo
`.env.example` contém apenas valores ilustrativos.

## Scripts

```bash
npm run dev        # servidor de desenvolvimento Vite
npm run build      # frontend, servidor SSR e handler da API
npm run start      # servidor de produção a partir de dist-server
npm run preview    # pré-visualização do build do frontend
npm run typecheck  # verificação de tipos TypeScript
npm run lint       # ESLint
npm run test       # testes com Vitest
npm run test:watch # testes em modo watch
```

## Docker

O `Dockerfile` gera uma imagem multiestágio com frontend compilado e backend
Node.js. O `docker-compose.yml` publica a aplicação na porta `8080` e monta
`./data` para preservar o banco SQLite fora do contêiner.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose stop
docker compose start
```

Depois de subir o serviço, acesse
[http://localhost:8080](http://localhost:8080). O endpoint
`/api/health` e o endpoint `/health` podem ser usados para verificar a
disponibilidade.

## API

Rotas públicas:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`

Rotas autenticadas, usando `Authorization: Bearer <token>`:

- `GET`, `PATCH` e `DELETE /api/auth/me`
- `GET /api/study-data`
- `POST /api/study-data/batch`
- `PUT /api/study-data/workspace`
- `POST /api/study-data/reset`
- `POST /api/study-data/table/:table`

Para trabalhar com mais de um concurso, o cliente envia o cabeçalho opcional
`X-Contest-Id`. Cada workspace é isolado por usuário e por escopo de concurso.

## Qualidade

Os testes ficam em `src/test` e cobrem domínio, serviços, componentes,
persistência e backend. Antes de abrir uma contribuição, execute:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Estrutura principal

```text
src/
  components/  componentes reutilizáveis da interface
  domain/      regras de negócio e cálculos
  screens/     telas da aplicação
  services/    autenticação, sincronização, agenda e backups
  db/          workspace em memória, tipos e dados iniciais
  test/        testes automatizados
server/
  controllers/ endpoints da API
  services/    autenticação e dados de estudo
  repositories/ SQLite e MongoDB
  database/    schema e inicialização
  security/    JWT, hash e criptografia
```

## Licença e dados

Este projeto é de uso pessoal. Os dados de estudo pertencem ao usuário e não
devem ser incluídos no repositório. Arquivos locais de dados, builds, segredos
e a pasta `docs/` são ignorados pelo Git.
