# Revisão de segurança e correções do Estudaê

**18 de novembro de 2026** · Base da revisão `e80c776084ad98e2f6f8a3a16a71f9fd17bf9297`.

A avaliação usa inspeção do código local, auditoria do lockfile e testes defensivos. A execução do ARTEX e a validação da implantação publicada ficaram fora do escopo. A revisão inicial registrou dois achados de severidade alta, três de média e três de baixa.

| Achado | Resultado no código local |
| --- | --- |
| E01 · Alta · Segredo JWT determinístico | O fallback foi removido. A API exige `JWT_SECRET` de pelo menos 32 bytes e uma chave de dados distinta. A adaptação das chaves existentes é uma etapa de implantação. [Configuração](/home/ucgfilho/projetos/projeto_bnb/server/config/env.ts) |
| E02 · Alta · Sessões antigas vinculadas a contas excluídas | A autenticação exige identidade persistida. Novos cadastros recebem IDs aleatórios. O Vercel exige MongoDB persistente. [Guard](/home/ucgfilho/projetos/projeto_bnb/server/middlewares/authMiddleware.ts), [Cadastro](/home/ucgfilho/projetos/projeto_bnb/server/services/AuthService.ts) |
| E03 · Média · Limite de autenticação local e origem não confiável | Os contadores têm expiração e ficam no banco. Login e cadastro têm limite por origem. O login também tem limite por conta. Cabeçalhos de origem são aceitos apenas no Vercel ou de proxies explicitamente configurados. [Controle de autenticação](/home/ucgfilho/projetos/projeto_bnb/server/security/AuthState.ts), [Documentação de cabeçalhos do Vercel](https://vercel.com/docs/headers/request-headers) |
| E04 · Média · JWT disponível ao JavaScript | O navegador recebe um cookie `HttpOnly` com `SameSite=Strict` e `Secure` em produção. As operações de escrita com cookie verificam a origem e o cabeçalho da sessão. A saída revoga o token no banco. A origem recebe CSP e o armazenamento local conserva apenas os metadados da sessão. O modo Bearer segue disponível para clientes da API. [API](/home/ucgfilho/projetos/projeto_bnb/server/app.ts), [Cliente](/home/ucgfilho/projetos/projeto_bnb/src/services/auth.ts), [CSP no Vercel](/home/ucgfilho/projetos/projeto_bnb/vercel.json) |
| E05 · Média · Disponibilidade do servidor de arquivos | O servidor responde 400 a URLs que falham na decodificação e trata erros assíncronos do fluxo HTTP. [Servidor](/home/ucgfilho/projetos/projeto_bnb/server/index.ts) |
| E06 · Baixa · Interpretação de fórmulas em CSV | O exportador neutraliza campos textuais que podem ser interpretados como fórmulas e preserva valores numéricos tipados. [Exportador](/home/ucgfilho/projetos/projeto_bnb/src/services/backup.ts) |
| E07 · Baixa · Enumeração de contas | **Mitigação parcial.** O login aplica scrypt mesmo para e-mail inexistente e usa o mesmo erro. O cadastro ainda revela duplicidade. Eliminar essa diferença sem quebrar o fluxo requer verificação de propriedade do endereço e entrega por e-mail. [Fluxos de autenticação](/home/ucgfilho/projetos/projeto_bnb/server/services/AuthService.ts) |
| E08 · Baixa · Dados pendentes persistem após sair | A interface pede confirmação se houver alterações pendentes. Após a saída confirmada, remove o cache e os lotes do usuário, com bloqueio de regravação por operações pendentes da sessão anterior. [Armazenamento e saída](/home/ucgfilho/projetos/projeto_bnb/src/services/auth.ts) |

## Dependências

A auditoria original encontrou 16 entradas. O lockfile atualizado usa `undici@8.12.4` e `minimatch@11.0.9`. A nova auditoria reportou 12 entradas altas, todas derivadas do mesmo aviso em `picomatch@4.0.7`, na cadeia de desenvolvimento e build. A auditoria filtrada para produção reportou zero entradas. O aviso de `picomatch` ainda indica que não há versão corrigida. [Lockfile](/home/ucgfilho/projetos/projeto_bnb/package-lock.json), [Aviso picomatch](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

## Verificação local

| Verificação | Resultado |
| --- | --- |
| Suíte automatizada | 269 testes passaram em 28 arquivos, incluindo regressões de exclusão e recadastro, configuração, proteção e revogação da sessão, persistência dos contadores, CSV e limpeza do armazenamento local. |
| Build | Frontend, servidor Node e bundle da API Vercel foram reconstruídos. |
| Lint | Zero erros e quatro avisos preexistentes de Fast Refresh. |
| Chrome local | Login pela interface, atributos do cookie, ausência da credencial em `localStorage`, consulta de perfil, logout e carregamento sob a CSP. |
| MongoDB 8.0 local | Duas instâncias do handler Vercel compartilharam uma sessão e sua revogação. Cadastro, login e exclusão de conta foram verificados com dados de teste. |

## Implantação

Antes de publicar, preserve o material que efetivamente cifra o banco atual em `DATA_ENCRYPTION_KEY` e gere um novo `JWT_SECRET`. Se a chave de dados anterior tiver sido derivada do fallback, a exposição anterior precisa ser avaliada e uma rotação da chave dos dados exige recifrar os registros e reconstruir os índices cegos. A atualização invalida as sessões anteriores. O ambiente Vercel deve ter MongoDB persistente, e a hospedagem de produção deve servir HTTPS. Nenhuma alteração foi aplicada a credenciais, bancos ou implantações existentes. [Instruções de configuração e migração](/home/ucgfilho/projetos/projeto_bnb/README.md)
