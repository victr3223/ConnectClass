# ConnectClass — homologação independente — 30/10/2026

## Resultado

Homologação publicada e validada em **https://connectclass-staging.vercel.app**. Não é publicação do projeto oficial.

- Projeto isolado: `connectclass-staging`, sem vínculo Git e sem domínios do oficial.
- Deployment: `dpl_8fHv2ezevBuxm27W5w2QvDpxF3Xg`, READY. A classificação `production` é somente do staging, explicitamente autorizada por Victor nesta etapa.
- Function `api/index`, Node26.x, região iad1, limite30s. O campo engines>=22 selecionou a versão suportada pela plataforma; Docker local não foi modificado.
- Banco exclusivo: `connectclass_preview`, conta própria com somente SELECT/INSERT/UPDATE/DELETE nesse banco. TLS1.3 com CA/identidade validadas; schema já compatível, sem migração.
- Oito variáveis DB Secret nos dois ambientes do staging; NODEJS_HELPERS=0. Nenhuma credencial administrativa, de produção ou senha do gestor foi enviada como variável da aplicação.

## Evidências reais

**85/85 testes locais** repetidos com MySQL TLS fictício isolado (incluem39 unitários), zero falhas/skips. Sintaxe49JS/contratos/assets e build local aprovados; build remoto/Function READY.

**42/42 verificações hospedadas**, sendo24 HTTP e18 em navegador Edge/Playwright: cadastro real do formulário, login aluno/gestor, três categorias, recebimento, resposta, alteração de status, filtros/Dashboard, histórico do aluno, isolamento entre alunos, acesso por tipo, origem externa recusada, logout/invalidação, novas requisições/página e persistência SQL. Sessões guardadas por hash no MySQL; cookie Secure/HttpOnly/SameSite=Strict e não disponível a document.cookie.

Mobile validado em360/390px e desktop1440px, sem overflow horizontal; conversa/resposta/status legíveis. Capturas finais aguardam a animação de entrada terminar. A primeira tentativa do teste de login preencheu campos antes da checagem inicial de sessão e foi preservada; corrigida somente a espera de prontidão do teste. Nenhum arquivo da aplicação foi alterado para fazer o teste passar.

Logs reais consultados no deployment correto:163 registros de requisição na primeira janela, nenhum5xx;401/403/404 correspondem aos testes de negação e caminhos inexistentes. Consultas finais de erros runtime e requisições>=500 retornaram zero registros na última hora. O logger da aplicação emite somente falhas, portanto ausência de registros runtime não é uma trilha completa de cada ação.

Verificação SQL posterior:5usuários,6conversas e10mensagens, todos fictícios, exclusivamente no Preview. Os dados de teste foram preservados. Não foi copiado nenhum dado Docker ou aluno real.

## Preservação e limites

- Projeto oficial `connectclass`: zero deployments confirmados após os testes. Nenhuma publicação ou alteração de suas variáveis/domínios.
- `.vercel/project.json` continua vinculado ao oficial, com hash inalterado. O staging foi selecionado por `--project <id>` em todos os comandos consequentes; o comando Production não deve ser repetido sem esse alvo explícito e conferido.
- Os29 arquivos publicados mantêm os mesmos hashes da preparação. HTML/JS/CSS/logo servidos foram comparados byte a byte com a origem. Visual e `media/comercial` não foram modificados.
- Arquivos privados continuam ignorados. Configurações/fontes/backups não são servidos por HTTP; valores privados conhecidos não aparecem nos assets públicos. Esta verificação funcional/de isolamento não equivale a pentest ou auditoria exaustiva.
- Sem commit/push nesta etapa; deployment foi feito da árvore local existente, que contém a preparação serverless não commitada. Não presumir que o GitHub já contém essas mudanças.
- Sem serviços pagos, reset, exclusão de bancos/tabelas/contas/volumes, restart Docker ou mudança de Windows/WSL.

**Docker local: BLOQUEADO na confirmação final.** A inspeção inicial expirou em15s; a final também não conseguiu acessar o Engine Linux. Nenhum comando de mutação foi executado, mas saúde/dados/volume finais não puderam ser reconfirmados. Abrir/verificar Docker Desktop e aguardar Engine Linux Running, sem reset/prune/down-v. Isso não impede a homologação externa, que utiliza exclusivamente Aiven.

Evidências privadas ignoradas: `backups/staging-validation-20261030/` (configuration, deploy-result, deployment-inspect, local-tests-report/log, api-e2e-report, browser-e2e-report, visual-final, request-status-report e final-verification). Não compartilhar arquivos de fixture-private ou configurações locais. O plano Aiven Free pode suspender por inatividade; a homologação não é uma promessa de SLA.
