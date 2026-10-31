# ConnectClass — plano de adaptação Vercel

Fonte: pedido completo de Victor em 29/10/2026. Execução por agente único.

Objetivo: mesmo frontend e backend Node.js nativo, com MySQL externo, HTTPS e sessões independentes do processo. Docker/local continuam disponíveis. O comercial permanece fora do escopo.

## Decisões de implementação

- Extrair o request handler já existente; uma função em `api/index.js` reutiliza as mesmas rotas, validações e permissões, sem Express/Next.js.
- No entrypoint Vercel, ativar sessões e limite de autenticação em duas tabelas MySQL auxiliares. Armazenar apenas SHA-256 dos tokens; cookies continuam HttpOnly/SameSite/ Secure em produção. O modo local existente permanece compatível.
- Migração explícita e idempotente antes de publicar, com conta própria de migração, sem DDL no atendimento de requisições. Inicialmente somente schema/fictícios; Victor autorizou depois, explicitamente em 29/10, copiar também os usuários e mensagens reais do Docker à Aiven. Preview permanece fictício e isolado; origem preservada.
- Reutilizar um pool por instância, com limite pequeno e integração oficial com Fluid Compute. TLS obrigatório no ambiente externo.
- Build estático por allowlist; excluir comercial, dados, backups, ambientes privados e ferramentas locais do upload/build.

## Execução e verificação

1. Backup do HEAD c2541ee e baseline dos testes antes de mudanças.
2. Testar duas instâncias, logout cruzado, expiração, limite compartilhado e concorrência em banco fictício isolado; implementar os repositórios SQL e sua migração.
3. Adaptar handler, pool, entrypoint, build e roteamento; testar rotas, arquivos privados, cookies, origem e disponibilidade do banco.
4. Executar suítes existentes, análise estática, regressão de frontend e Docker quando o daemon responder. Não alterar o Windows para corrigir o daemon.
5. Confirmar conta/equipe Hobby, projeto connectclass e MySQL externo. Informar limites/custos antes de criar banco; credenciais somente por canais privados.
6. Configurar ambientes e executar preview somente com banco funcional; testar HTTP e navegador desktop/mobile na URL retornada.
7. Após críticos aprovados, conferir alterações/secrets/proveniência Git e publicar produção pelo fluxo oficial, validando novamente a URL real.

## Critérios de bloqueio

Sem autenticação Vercel ou banco externo autorizado, a publicação e os E2E públicos ficam BLOQUEADOS. Não gerar frontend isolado como se o sistema estivesse completo. Serviços pagos e upgrades não autorizados.

## Riscos que os testes devem cobrir

- Sessão emitida por uma instância reconhecida e revogada em outra.
- Corrida entre tentativas de autenticação sem ultrapassar o limite.
- Corpo JSON, CSRF/origem e permissões preservados no handler reutilizado.
- Reset de inicialização depois de falha de conexão, sem cache permanente de erro.
- Rotas privadas e arquivos internos ausentes da saída estática.

Estado inicial: 56/57 testes (timeout MySQL no primeiro cadastro); Docker info excedeu 15s; conector Vercel requer reautenticação; MySQL externo ainda não confirmado. Esses resultados não autorizam publicação.
