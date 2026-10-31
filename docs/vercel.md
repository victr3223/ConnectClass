# ConnectClass na Vercel

## Arquitetura e execução local

O projeto mantém HTML/CSS/JavaScript e Node.js nativo. `api/index.js` chama o mesmo handler de `server/app.js`; não inicia uma porta HTTP e não depende do Docker na nuvem. Para executar localmente, use as instruções Docker/Node do README. A configuração do projeto é Node24.x, mas `engines >=22` selecionou Node26.x no build hospedado; confira o runtime de cada novo build. Docker Node22 preservado.

`scripts/build-vercel.js` copia somente sete assets públicos para `public/`. HTML e rotas protegidas passam pelo handler. A allowlist `.vercelignore` exclui comercial, dados, ambientes privados, backups, ferramentas e dependências locais. A função inclui somente os arquivos necessários; não oferece rotas para fontes, schema, `.env` ou backups.

## Conta, plano e banco

**Produção oficial validada em31/10/2026:** https://connect-class.vercel.app, projeto `connectclass`, banco exclusivo `connectclass`. Publicação autorizada e testada sem migração de alunos/dados locais. A promoção automática de domínios está desativada no projeto; builds Git devem ser testados antes de promoção manual. Veja [o relatório de produção](production-validation.md). As restrições e bloqueios históricos abaixo foram superados por essa autorização e validação.

**Homologação independente validada em30/10/2026:** https://connectclass-staging.vercel.app, somente banco fictício Preview. Primeiro Production é permitido exclusivamente nesse projeto staging, não no oficial.85/85 testes locais e42/42 verificações hospedadas aprovados; veja [o relatório de homologação](staging-validation.md). Projeto oficial permanece sem deploy. O bloqueio histórico abaixo se refere à tentativa no oficial e não autoriza repeti-la.

**Bloqueio observado em 30/10/2026:** o primeiro deploy com `--environment preview` foi classificado como produção pela plataforma e removido imediatamente após confirmação. Não repetir deploy nem criar produção temporária para contornar isso sem orientação específica. Consulte [o relatório desta tentativa](preview-validation.md); não existe Preview hospedado aprovado.

Use um projeto `connectclass` na sua conta/equipe correta. Antes de operar, confira:

```sh
vercel whoami
vercel project inspect --non-interactive
```

CLI usada nesta preparação: 65.7.0. Pode ser executada com `npx --yes vercel@65.7.0`. Faça login pelo fluxo oficial, sem colocar tokens no chat, URL ou argumentos. A pasta `.vercel/` é privada e ignorada. Se precisar vincular uma cópia nova:

```sh
vercel link --project connectclass --scope <sua-equipe> --yes
vercel project inspect --non-interactive
```

O [Hobby](https://vercel.com/docs/plans/hobby) é destinado a uso pessoal não comercial, como esta demonstração acadêmica. Não habilite upgrades ou recursos pagos. O banco precisa ser externo para funcionar com o PC desligado.

A opção aprovada é [Aiven MySQL Free](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier): 1 CPU, 1 GB de RAM/disco, até 76 conexões, sem cartão. O serviço pode suspender por inatividade e não permite escolher uma região específica. Confirme disponibilidade e plano **Free de US$0**, não apenas um trial com créditos. Depois alinhe a região única das Functions à região real do banco, se houver região Vercel próxima.

## Preparação privada da Aiven

No serviço MySQL Free existente, baixe a CA no console da Aiven. Primeiro execute a inspeção autenticada somente leitura no PowerShell:

```powershell
.\scripts\configure-aiven.ps1 -InspectOnly
```

O script solicita endpoint, porta, usuário administrativo, caminho local da CA e senha sem exibi-la. Lê a CA como texto PEM (também no PowerShell 5.1), envia os valores ao Node pelo stdin e fixa o diretório de trabalho na raiz. Não carrega nem sobrescreve o `.env` local. `-InspectOnly` autentica com TLS e lista metadados dos dois destinos, sem DDL, criação de contas ou migração. O relatório sanitizado fica em `backups/aiven-recovery/latest.json`; falhas incluem etapa/código/errno/SQLSTATE, sem SQL ou credenciais.

Após validar a inspeção, execute sem `-InspectOnly` para configurar/retomar. O serviço não é recriado. Bancos e tabelas compatíveis são reutilizados por operações aditivas; schemas futuros/desconhecidos são bloqueados. Arquivos privados existentes são reutilizados apenas se corresponderem ao mesmo destino/CA; nunca sobrescritos. A senha gerada é guardada **antes** da criação da conta, permitindo retomar uma interrupção sem redefini-la. A conta existente é autenticada antes de completar privilégios ausentes. Privilégios excessivos bloqueiam a operação; nenhuma revogação/reset é feita automaticamente.

O setup prepara dois bancos e contas DML distintas, sem usar `avnadmin` na aplicação: `connectclass_preview` recebe gestor fictício somente quando novo/vazio, e `connectclass` não recebe dados fictícios, ficando reservado para migração autorizada. Dados já existentes não são apagados. As configurações ficam somente em `.env.vercel.preview` e `.env.vercel.production`, ignorados pelo Git e pelo deploy. A senha administrativa não fica nesses arquivos. Não compartilhe nem apague esses arquivos para contornar falhas.

O caminho Windows da CA serve apenas ao operador local. Nas Functions, `DB_SSL_CA` contém o próprio PEM; `DB_SSL=true`, `rejectUnauthorized=true` e `verifyIdentity=true` são obrigatórios.

DDL não é transacional no MySQL: se houver falha intermediária, preserve os recursos e inspecione o estado antes de repetir. Não apague bancos para contornar falhas.

## Schema e migrações

Estado verificado em31/10/2026: os dois bancos e contas próprias autenticam com TLS1.3 e privilégios DML mínimos. Acesso cruzado entre bancos foi recusado pelo MySQL. Production possui somente seu gestor inicial; os testes identificados foram removidos com limpeza previamente validada e reconciliação por hash. Preview mantém seus dados fictícios. Não executar cópia de dados reais sem nova autorização específica.

O schema principal permanece v1. A extensão aditiva `database/serverless.sql` contém `web_sessions` e `auth_attempts`. Tokens são aleatórios; somente seu SHA-256 fica no banco. Expiração e logout são verificados no backend, e o limite de autenticação é compartilhado com transações/bloqueio de linha.

Para um banco existente, execute explicitamente uma migração com conta DDL autorizada e TLS:

```sh
node --env-file=<arquivo-privado-de-migracao> scripts/migrate-vercel.js
```

A migração é idempotente, adquire lock e recusa schema incompatível. Não faz DROP, TRUNCATE, importação de dados pessoais ou DDL no início de cada Function. Não envie credenciais de migração para a aplicação web; ela só precisa de SELECT/INSERT/UPDATE/DELETE.

## Cópia autorizada do Docker

Somente com autorização para transferir os dados reais ao provedor, Docker Linux disponível e app/MySQL atuais em execução:

```sh
node --env-file=.env.vercel.production scripts/copy-docker-to-aiven.js
```

A origem é obrigatoriamente a stack Compose oficial, banco `connectclass`. Uma transação somente leitura captura usuários, atendimentos, mensagens/respostas e registros de importação. Um backup privado é gravado em `backups/cloud-transfer/` antes da cópia. Nenhuma conta de infraestrutura ou senha de banco é exportada.

O destino é obrigatoriamente `connectclass` na Aiven com TLS. A importação preserva IDs e hashes de senha, usa prepared statements e uma transação, recusa um destino divergente/não vazio e reconcilia os registros por hash antes de confirmar. Uma repetição idêntica é idempotente. A origem é conferida novamente; alterações simultâneas impedem declarar a migração concluída. Não há limpeza da origem nem remoção de volumes. Sessões locais em memória não são copiadas: faça login novamente na Vercel.

## Variáveis seguras na Vercel

Configure separadamente Preview e Production no painel seguro ou via `vercel env add`, enviando valores secretos por stdin, nunca `--value`/argumentos ou Git:

| Variável | Valor/configuração |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Endpoint e porta reais do MySQL externo |
| `DB_USER`, `DB_PASSWORD` | Conta DML do respectivo banco |
| `DB_NAME` | `connectclass_preview` ou `connectclass` |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | CA PEM do serviço; valida certificado e identidade |
| `DB_POOL_LIMIT` | `3` por instância; mantenha margem no limite do provedor |
| `NODEJS_HELPERS` | `0`, nos ambientes de build e runtime |
| `CONNECTCLASS_GESTOR_PASSWORD` | Secret exclusiva Production para criar o primeiro gestor em base nova; não redefine uma conta existente |

`NODEJS_HELPERS=0` preserva o stream HTTP nativo e seus limites/validação de JSON. Use a [configuração oficial dos helpers](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration). O pool é criado uma vez por instância e registrado com [`attachDatabasePool`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package); não encerre o pool após cada requisição.

Em uma base nova, a aplicação cria o gestor inicial com hash scrypt nativo usando a Secret `CONNECTCLASS_GESTOR_PASSWORD`; login inicial `gestor@connectclass.local`. A senha deve ser definida privadamente pelo operador, nunca em Git, argumento, chat ou README. Quando já existe gestor ativo, o bootstrap não altera sua senha. Não executar troca/reset para contornar login.

## Build, preview e testes

```sh
npm ci --ignore-scripts
npm run verify
vercel build --yes
vercel deploy --target preview
```

As suítes SQL exigem exclusivamente `connectclass_final_test`, com schema principal e extensão serverless preparados por uma conta de migração. Nunca use uma base real para `npm test`. O CI prepara um serviço MySQL 8.4 descartável. Não confunda o build local aprovado com E2E em uma URL hospedada.

Na CLI Windows, se o build retornar `spawn cmd.exe ENOENT` apesar de cmd.exe existir, a CLI pode ter recebido `Path` em vez de `PATH`. Normalize essa variável somente no processo que executa a CLI; não altere o PATH permanente do Windows. Não mude o backend por causa dessa falha do processo de build.

Valide na URL **real retornada**: home/assets, health MySQL, cadastro/login aluno e gestor, cookie Secure/HttpOnly, três categorias, painel/filtros, resposta/status/histórico, isolamento entre alunos, origem indevida, logout e sessão após nova instância. Confira também o navegador em desktop/celular. Para um preview protegido, use `vercel curl --deployment <url>` para os testes autenticados da plataforma; mantenha a proteção habilitada.

## Produção, logs, atualização e rollback

Só após validar testes, segurança e configuração independente de Production. A publicação atual não exige nem autoriza migração de dados reais:

```sh
vercel deploy --prod --skip-domain
# Testar também esse build com as variáveis/banco de produção.
vercel promote <url-do-build-de-producao-validado>
vercel inspect <url-producao>
vercel logs <url-producao>
```

No projeto oficial, `autoAssignCustomDomains=false` mantém novos builds Git sem promoção automática para o domínio oficial. Confira esse ajuste antes de cada push: uma promoção/rollback pode alterar a política da plataforma. Use `vercel promote` somente no deployment Production exato já testado. Preserve o vínculo Git existente. Não promover um novo build apenas porque ficou READY.

O build local Windows desta publicação retornou `spawn cmd.exe ENOENT`; foi usado build remoto com `--prod --skip-domain`, aprovado na Vercel. Não enviar saída parcial com `--prebuilt`. A URL isolada pode exigir autenticação: mantenha a proteção e use acesso temporário oficial restrito ao deployment para testes, revogando-o ao terminar. Não registrar links/cookies de acesso em documentação ou Git.

Promover um preview pode reconstruí-lo com variáveis de produção. Para publicar o mesmo artefato testado, use o build de produção sem atribuir domínio, teste-o e só então promova. Não invente um endereço disponível.

Para voltar a um deploy anterior, confira projeto e ambiente e execute `vercel rollback <url-anterior>`. Rollback de código não desfaz dados MySQL: use um backup privado reconciliado e um plano de restauração específico, sem apagar a base. Após rollback, novas atribuições automáticas de domínio podem permanecer suspensas até uma promoção.

Como esta é a primeira produção oficial, ainda não existe uma versão oficial anterior validada. Em uma falha crítica, interrompa novas promoções e retire somente o alias oficial do deployment defeituoso com `vercel alias rm <alias>`, após conferir o alvo. Isso interrompe o acesso; não apaga o deployment nem o banco. Não simular rollback na versão saudável. Backups privados incluem hashes de autenticação e exigem armazenamento restrito, fora do Git; restauração não foi ensaiada nesta publicação.

Antes de atualizar o GitHub, execute testes, revise o diff, os ignores e `git diff --check`. Nunca use `git add .` nesta cópia com o comercial não rastreado. A integração Git já existente pode gerar deploys da branch de produção; publique somente alterações aprovadas e testadas. Backups, `.env*`, `.vercel/` e `public/` gerado ficam fora do commit.
