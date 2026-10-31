# Primeiro Preview Vercel — 30/10/2026

## Resultado: bloqueado pelo destino do primeiro deploy

Conta/equipe e projeto existentes confirmados; plano Hobby. O banco Preview é exclusivamente `connectclass_preview`, com gestor fictício, nenhum atendimento real, TLS1.3 validado e quatro privilégios DML. As oito variáveis Preview são Secret sem override de branch. Schema principal/serverless compatíveis: nenhuma migração necessária.

O dry-run confirmou somente29 arquivos; ambientes privados, CA local, dados, backups e comercial excluídos. Docker local saudável antes da tentativa. A aplicação, visual e comercial não foram alterados nesta etapa.

Comando solicitado explicitamente como Preview:

```text
vercel deploy --environment preview --project <projeto-existente> --scope <equipe-confirmada> --yes --json
```

Apesar desse argumento, a API retornou `target=production` para o primeiro deploy `dpl_A4EGuWPN5VCGh2sxwucEqxRUj8ug`, atribuindo os aliases de produção. A inspeção independente confirmou o destino incorreto. O build concluiu, mas **não é evidência de Preview funcional**. Nenhum teste de cadastro/login/mensagens foi executado nessa URL.

O comportamento coincide com o [relato no repositório oficial da Vercel](https://github.com/vercel/vercel/issues/17069), incluindo tentativas explícitas Preview em projetos sem deploy anterior. Não repetir com outro argumento/branch, nem criar um bootstrap de produção sem autorização específica. Um deploy marcado como produção pode receber as variáveis de produção, mesmo quando o comando pede Preview.

Somente o deploy recém-criado foi removido como reversão da publicação indevida. Não foram excluídos projeto, bancos, tabelas, contas ou volumes. Nenhum dado real foi copiado, nenhuma senha redefinida, nenhum commit/push feito.

Evidências privadas ignoradas em `backups/preview-validation-20261030/`: `preflight.json`, `deploy-stdout.json`, `deploy-build.log`, `unexpected-target.json`, `rollback-deployment.json` e `recovery-verification.json`. O último relatório registra a verificação posterior da remoção, das URLs, dos bancos e do Docker; consultar `passed` antes de afirmar preservação completa. A primeira tentativa dessa verificação encontrou HANDSHAKE_SSL_ERROR; conexões estritas posteriores autenticaram os dois ambientes sem mudança de CA, credenciais ou validação TLS. A falha transitória foi preservada no relatório first-attempt.

Verificações posteriores confirmaram zero deploys, três URLs404 e produção vazia. Preview permaneceu com1gestor fictício e nenhum atendimento/sessão. O pós-check Docker não concluiu: `docker info`, `compose ps` e a sonda somente leitura expiraram em15s, sem saída. O Docker estava saudável no preflight; nenhum comando de alteração/restart/remoção do Docker foi executado nesta etapa. Não é possível certificar seu estado final nem reconciliar novamente o hash local enquanto o Engine não responder. Verificar Docker Desktop/Engine Linux Running no Windows, sem resetar/recriar volumes.

## Próxima ação

Resolver com a Vercel um caminho suportado para primeiro deploy exclusivamente Preview, ou obter orientação explícita de Victor sobre o bloqueio. Não contornar a exigência de não publicar produção. E2E hospedado, cookies/sessões HTTPS, permissões e responsividade continuam não executados; os85 testes anteriores são locais, não certificam esta publicação.
