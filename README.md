# ConnectClass

Plataforma escolar de comunicação entre alunos e secretaria, com Node.js, MySQL e HTML/CSS/JavaScript. **A versão oficial, originada da `tcc-final`, está na raiz deste repositório.** Não use a versão histórica `tcc1`. Visual, logo e controladores de interface preservados.

## Docker Compose (app + MySQL 8.4)

Requisitos: Docker Engine em execução e Docker Compose v2.20+ (ou v5). Windows: Docker Desktop com Linux containers/WSL 2. Ubuntu/VPS: siga a [instalação oficial do Docker](https://docs.docker.com/engine/install/ubuntu/) e inclua o plugin Compose. Confirme `docker info` e `docker compose version`.

Em uma instalação nova, clone o repositório autorizado e entre na raiz:

```sh
git clone https://github.com/victr3223/ConnectClass.git
cd ConnectClass
```

O repositório é privado: use sua autenticação GitHub, sem colocar tokens na URL ou no código. Não copie dados/configurações de outra instalação nem inicialize novamente um volume existente. Na raiz do projeto:

```sh
# Uma única vez, antes de criar o volume (Node 22+ instalado no host):
npm run docker:configure
docker compose build
docker compose up -d --wait
docker compose ps
```

Se o servidor tiver somente Docker, gere a configuração sem instalar Node no host (Ubuntu):

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:22-bookworm-slim node scripts/setup-docker-env.js
docker compose build
docker compose up -d --wait
```

Abra [ConnectClass Docker local](http://127.0.0.1:8081). O gestor inicial é `gestor@connectclass.local`; consulte **privadamente** o valor de `CONNECTCLASS_GESTOR_PASSWORD` em `.env.docker.app`. Nunca copie esse valor para chat, logs ou Git. Não há senha fixa/demonstrativa de acesso.

### Configuração privada e isolamento

`docker:configure` cria `.env.docker.app` e `.env.docker.mysql` com segredos aleatórios e distintos. Não imprime valores e recusa sobrescrever arquivos existentes. Os dois arquivos são ignorados pelo Git e excluídos da imagem. **O `.env` nativo e os bancos MySQL locais não são alterados.** O Docker inicia outra base, vazia; não copia automaticamente seus dados reais.

Copiar `.env.example` para `.env` configura apenas o modo nativo; não substitui os dois arquivos privados do Docker. No clone novo, o gerador acima cria tudo que o Compose precisa, inclusive sem Node/MySQL/Workbench instalados no host. Em atualizações, preserve os arquivos existentes e o volume, depois execute somente build/up.

- `.env.docker.app`: `DB_USER`, `DB_PASSWORD`, `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD`, `CONNECTCLASS_GESTOR_PASSWORD`. Não recebe a senha root do MySQL.
- `.env.docker.mysql`: `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `DB_MIGRATION_PASSWORD`. Usuário/senha da aplicação e senha da migração precisam corresponder ao primeiro arquivo.
- O Compose fixa `DB_HOST=mysql`, `DB_PORT=3306`, `DB_NAME=connectclass`, `HOST=0.0.0.0`. `PORT` vem do ambiente (padrão 8081). MySQL não publica porta no host, e usa rede Docker interna.
- `APP_PORT` escolhe a porta no host; `APP_BIND` é `127.0.0.1` por padrão. `APP_NODE_ENV` é `development` para permitir o teste local HTTP. Essas opções não secretas podem ficar no `.env` ou no ambiente do terminal.
- A imagem executa como usuário não root, com filesystem somente leitura e `/tmp` temporário. `.dockerignore` usa lista de arquivos permitidos: sem `.env`, dados legados, backups, `.git` ou node_modules do host.

Não regenere senhas após inicializar o volume: variáveis da imagem MySQL criam contas **somente na primeira inicialização**; editar arquivos não altera contas existentes. Preserve as configurações junto de um backup privado. Se perdê-las, recupere-as; nunca apague o volume para contornar um erro de acesso. Use nomes de usuário da aplicação com letras, números e `_`, até 32 caracteres; não use root ou connectclass_migrator.

### Schema automático, healthchecks e persistência

O volume nomeado `mysql_data` é montado em `/var/lib/mysql` (nome padrão no host: `connectclass_mysql_data`). Na primeira inicialização, o MySQL cria o banco e as contas; o script `docker/mysql/01-accounts.sh` restringe a conta web a SELECT/INSERT/UPDATE/DELETE e cria a conta de migração com privilégios DDL limitados ao mesmo banco.

O app espera o healthcheck SQL do MySQL. Seu entrypoint tenta novamente falhas transitórias de conexão, adquire um lock e aplica o schema v1 idempotentemente antes de iniciar HTTP. Recusa versões futuras/incompatíveis, não executa DROP/TRUNCATE/limpeza de dados e encerra em falha. Credenciais de migração são retiradas do ambiente do processo HTTP após uso. Não há dependência do Workbench. Mudanças futuras de schema precisam ser versionadas/testadas; DDL MySQL não tem rollback transacional geral.

O healthcheck do app verifica HTTP **e MySQL/schema**. A rota `/health` isoladamente continua sendo liveness. Uma indisponibilidade posterior do banco torna o app unhealthy, sem apagar dados. Restart/recriação encerra sessões em memória: entre novamente; usuários, atendimentos, respostas e status ficam no volume. Runtime não persiste dados em JSON.

### Substituir o gestor com segurança

A troca preserva o ID e as respostas do gestor antigo, desativando sua autenticação e sessões. Usa o mesmo scrypt da aplicação e prepared statements. Cria/confere o novo gestor, testa login e Dashboard HTTP e só então desativa o antigo. Falhas anteriores preservam a conta antiga; falha na confirmação posterior recupera a alteração exata. Repetir com a mesma conta/senha não redefine senhas nem duplica usuários. Não remova a conta antiga por SQL se ela possuir respostas.

No Windows, após o build e o app saudável, execute na raiz:

```powershell
.\scripts\replace-manager.ps1
```

O script pede os e-mails e a senha com entrada oculta. A senha segue pela entrada padrão privada do processo no container, sem arquivo, argumento de comando ou configuração persistente do Docker. Não digite a senha na linha de comando e não ative transcrições/captura de entrada nessa operação. Não envie a senha no chat.

Outra opção é injetar `NEW_MANAGER_EMAIL`, `NEW_MANAGER_PASSWORD` e `OLD_MANAGER_EMAIL` temporariamente no processo do container e executar `node scripts/replace-manager.js`. O script consome/remove essas variáveis; não as adicione ao Compose, `.env.example`, Git ou README com valores. A execução direta fora do banco do Compose é recusada. O retorno mostra apenas confirmações, sem senha/e-mails/hashes.

### Comandos de operação

```sh
docker compose ps
docker compose logs --tail=100 app mysql
docker compose logs -f app
docker compose restart
docker compose stop
docker compose start
# Remove os containers/rede, mas mantém o volume:
docker compose down
docker compose up -d --wait
# Após atualizar o código:
docker compose build
docker compose up -d --wait
# Recriar somente o app, sem tocar no MySQL:
docker compose up -d --no-deps --force-recreate --wait app
```

**Não use `down -v`, `docker volume rm`, prune ou limpeza/reset do Docker Desktop** se houver dados a preservar. Não publique a saída de `docker compose config` sem `--quiet` nem `docker inspect` completo: podem conter credenciais resolvidas. Para validar configuração sem exibir segredos, use `docker compose config --quiet`.

### Backup MySQL e volume (Ubuntu/VPS)

Prefira um dump lógico consistente. Este comando grava o conteúdo privado dentro do container e o copia para uma pasta ignorada, sem colocar a senha na linha de comando:

```sh
mkdir -p backups
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction --routines --triggers --events --no-tablespaces --set-gtid-purged=OFF --databases connectclass > /tmp/connectclass-backup.sql'
docker compose cp mysql:/tmp/connectclass-backup.sql ./backups/connectclass-backup.sql
chmod 600 ./backups/connectclass-backup.sql
```

Use nomes datados para preservar backups anteriores. O dump contém dados pessoais e hashes: armazene criptografado/privadamente, fora do Git, junto das configurações necessárias à recuperação. Não cole seu conteúdo em tickets/chat.

Para uma cópia física do volume, **pare app e MySQL antes**, confirme o nome real (pode mudar com `-p`) e use um arquivo novo:

```sh
docker compose stop app mysql
docker volume inspect connectclass_mysql_data --format '{{.Name}}'
docker run --rm --mount type=volume,source=connectclass_mysql_data,target=/volume,readonly --mount type=bind,source="$PWD/backups",target=/backup alpine:3.23 sh -c 'umask 077; tar -czf /backup/mysql-volume-$(date +%Y%m%d-%H%M%S).tar.gz -C /volume .'
docker compose up -d --wait
```

Não faça cópia física de um MySQL em execução. Teste a restauração em outro projeto/volume antes de depender do backup; nunca restaure por cima da base ativa. A restauração física exige versão compatível do MySQL e as mesmas credenciais. A documentação de backup não significa que uma restauração dos seus dados reais foi executada.

### Ubuntu/VPS e HTTPS (nenhum deploy executado)

Clone o repositório na VPS, prepare os arquivos privados **novos para esse ambiente**, gere a imagem e suba com os comandos acima. Não envie o `.env` nem o volume local para o Git. Use uma única instância do app, pois sessões/limites ficam em memória.

Configure `APP_NODE_ENV=production`, mantenha `APP_BIND=127.0.0.1` e coloque Nginx/Caddy ou o proxy da hospedagem com HTTPS na frente de `127.0.0.1:8081`. Preserve o cabeçalho `Host` público. Libere apenas SSH e HTTP/HTTPS necessários no firewall; nunca exponha 3306. Não use cookies Secure de produção sobre HTTP. Se mudar `PORT`, Compose e healthcheck usam a mesma porta interna; `APP_PORT` controla a porta externa. Defina backups, monitoramento e atualização de imagens. Domínio, certificado, capacidade e conectividade da VPS só serão validados em um deploy autorizado.

Portas publicadas pelo Docker podem contornar regras de UFW; mantenha o bind local e configure a filtragem Docker conforme a documentação oficial. O serviço MySQL não possui publicação de portas.

### Testes Docker

```sh
docker compose build
npm run test:docker
npm run verify
npm run test:coverage
git diff --check
```

`test:docker` cria um projeto/volume de teste com nome único e senhas aleatórias, testa o fluxo HTTP real, privilégios, imagem sem dados JSON/segredos, restart, recriação do app e down/up. Ao final remove apenas os containers/rede de teste; **mantém o volume e a configuração privada em backups** para recuperação. Nunca opera sobre o volume principal nem sobre o MySQL nativo. Testes existentes continuam usando somente `connectclass_final_test`. E2E é HTTP; não certifica renderização visual.

Resultados e limites da validação local: [relatório Docker](docs/docker-validation.md).

Referências: [ordem de inicialização Compose](https://docs.docker.com/compose/how-tos/startup-order/) e [imagem MySQL oficial](https://hub.docker.com/_/mysql).

## Instalação e execução local sem Docker

Requisitos: Node.js 22+ e MySQL 8.4+ (validado localmente com MySQL 9.7.1). Não há build. Execute os comandos na **raiz**, onde fica `package.json`:

```sh
npm ci --ignore-scripts
# Configure o MySQL e o ambiente privado conforme abaixo.
npm start
```

Abra [ConnectClass local](http://127.0.0.1:8081). `Ctrl+C` encerra o servidor. O Node carrega `.env`; variáveis já definidas no processo prevalecem.

### MySQL local

Se `.env` e o banco já estiverem preparados, **não repita provisionamento/importação**. Preserve os dados e inicie normalmente.

Somente para uma instalação realmente nova:

1. Copie `database/admin.env.example` para `.env.mysql-admin` e configure uma conta administrativa local. Nunca versione ou envie credenciais.
2. Execute `npm run db:setup-local`. Cria apenas `connectclass_final` e `connectclass_final_test`, contas locais separadas com SELECT/INSERT/UPDATE/DELETE e arquivos privados `.env`/`.env.test`. Recusa sobrescrever bancos, contas ou configurações existentes. Em falha parcial, preserve os recursos para revisão.
3. Se houver dados legados, importe antes do primeiro start (seção abaixo). Em uma base nova sem gestor, configure `CONNECTCLASS_GESTOR_PASSWORD` no ambiente privado.
4. Execute `npm run verify` e `npm start`.

O runtime não executa DDL, não importa dados e não usa JSON como banco ou fallback. Testes são limitados ao banco descartável `connectclass_final_test`; nunca use dados pessoais nele.

### Banco existente ou gerenciado

Crie um banco **dedicado ao ConnectClass**, com o nome disponibilizado pelo provedor. Não selecione o banco antigo por engano. `DB_NAME` aceita letras, números, `_` e `-`, até 64 caracteres.

Inicialize uma única vez com uma conta de migração autorizada a criar tabelas:

```sh
# Configure .env.mysql-admin privadamente com DB_* e TLS, se necessário:
npm run db:init
# Alternativa para variáveis já injetadas pelo provedor, sem arquivo .env:
node scripts/init-db.js
```

`db:init` seleciona o banco existente e aplica `database/schema.sql`. Não exige CREATE DATABASE, não contém DROP/TRUNCATE e não apaga registros. DDL MySQL possui commits implícitos: faça backup e confira o destino antes de executar. Alternativamente, execute o schema no console do provedor com o banco correto selecionado.

Crie separadamente uma conta da aplicação limitada a SELECT, INSERT, UPDATE e DELETE **nesse banco**. Use-a no runtime; `root` é recusado. Credenciais administrativas não devem estar no serviço web. O startup verifica a versão do schema e falha sem ela, sem fallback.

## Variáveis de ambiente

`.env.example` e `database/admin.env.example` são modelos públicos sem segredos. `.env*` privados, dados legados, backups e logs são ignorados pelo Git e não são servidos por HTTP.

| Variável | Uso |
| --- | --- |
| `NODE_ENV` | `production` em uma implantação HTTPS; `development` localmente. |
| `PORT` | Porta fornecida pela plataforma, ou `8081` por padrão. |
| `HOST` | `0.0.0.0` por padrão em produção; `127.0.0.1` em desenvolvimento. Ao copiar o exemplo local para produção, ajuste ou remova `HOST`. |
| `DB_HOST` / `DB_PORT` | Host MySQL e porta (padrão 3306). |
| `DB_NAME` | Banco dedicado do provedor; localmente `connectclass_final`. |
| `DB_USER` / `DB_PASSWORD` | Conta DML e senha privada da aplicação. |
| `DB_SSL` | `true` para MySQL remoto com TLS; `false`/ausente para MySQL local. |
| `DB_SSL_CA` | CA PEM do provedor, quando necessária; aceita quebras reais ou `\n`. Exige `DB_SSL=true`. Sem CA customizada, usa as autoridades confiáveis do Node. |
| `CONNECTCLASS_GESTOR_PASSWORD` | Bootstrap do primeiro gestor, 8–128 caracteres. Não redefine gestor existente. |

TLS MySQL verifica certificado e identidade do servidor, com mínimo TLS 1.2; não há opção para desativar a verificação. Não adicione senhas a comandos, URLs, README ou Git. Use o gerenciador de segredos da hospedagem.

## Preparação para deploy (nenhum deploy automático)

1. Configure o diretório raiz como `.` e o runtime Node.js 22 ou 24. Instalação: `npm ci --omit=dev --ignore-scripts`; inicialização: `npm start`. Não há build.
2. Provisione MySQL compatível, inicialize o schema em etapa administrativa separada e injete as variáveis `DB_*` da conta DML. Para MySQL remoto, configure TLS e a CA exigida pelo provedor.
3. Defina `NODE_ENV=production` e `HOST=0.0.0.0`; respeite a `PORT` injetada pelo host. Não publique `.env` ou uma cópia do banco local.
4. Sirva por **HTTPS**, usando o proxy da plataforma ou um proxy reverso. Preserve o `Host` público, incluindo a porta quando aplicável. O Node serve HTTP internamente; `NODE_ENV=production` não instala certificados. Cookies recebem `Secure`, `HttpOnly` e `SameSite=Strict`; mutações com Origin devem vir da mesma origem HTTPS.
5. Use **uma instância**: sessões e limitador de login ficam em memória. Reiniciar encerra sessões; usuários, mensagens, respostas e status persistem no MySQL. Escala horizontal requer sessões/limites compartilhados.
6. Configure `GET /health` como liveness (HTTP 200). Não é uma sonda de disponibilidade contínua do MySQL; o startup verifica banco/schema. Monitore erros SQL sanitizados e valide login/atendimentos no destino.
7. Configure backups privados do MySQL e valide uma restauração separada antes de uso real. Não há backup automático ou restauração certificada incluídos.

O workflow de CI executa testes em Node.js 22/24 com MySQL 8.4 descartável e **não faz deploy**. Conectividade, domínio, TLS e credenciais de uma hospedagem específica precisam ser validados quando ela for escolhida.

## Importação legada explícita

Pare escritas na origem, preserve backups privados e use um destino SQL vazio. Importe antes do bootstrap do gestor:

```sh
npm run db:import -- data
npm run db:verify-import -- data
```

O importador valida referências, preserva IDs, hashes, conteúdo, datas e status, usa transação e reconcilia contagens. A mesma origem é idempotente; origem diferente em destino não vazio é recusada. A verificação não imprime dados pessoais nem altera originais. `data/*.json` e `data.json` não são lidos/escritos pelo runtime. JSON antigo não contém novas gravações SQL e não substitui backup atual. Recupere em ambiente separado, nunca apagando a base existente.

## Funcionalidades preservadas

- Cadastro apenas de aluno, RA/e-mail únicos, login por RA ou e-mail, autorização por papel e logout.
- Envio de Pergunta, Reclamação e Sugestão; histórico do aluno com respostas e status.
- Gestor inicial `gestor@connectclass.local`, criado somente com senha privada configurada; gestor existente/importado preservado. Não há recuperação automática de senha.
- Dashboard conta **mensagens**, não agrupamentos, e representa toda a base. Filtros combinam aluno, turma, categoria, status, texto e período. Datas de envio seguem o dia de Brasília.
- Conversas agrupadas visualmente por aluno + categoria; resposta/status aplicados ao atendimento selecionado. Status: Pendente, Em análise, Respondida e Resolvida. Responder marca Respondida.
- O aluno atualiza manualmente pelo botão Atualizar, mudança de categoria ou recarga. Não há push ou indicação de não lidas.

Arquitetura: `server.js` inicia HTTP; `server/app.js` controla rotas/autorização; usuários/mensagens usam pool e consultas parametrizadas. `users`, `conversations` e `messages` usam InnoDB, FKs, índices únicos, utf8mb4 e datas UTC. Senhas usam scrypt com salt e nunca são retornadas pela API. Operações compostas usam transações e bloqueio de linha; importação e versão ficam em `import_batches`/`schema_migrations`.

## Testes

Com o MySQL de testes isolado configurado em `.env.test`:

```sh
npm run verify
npm run test:unit
npm run test:integration
npm run test:e2e:http
npm run test:coverage
git diff --check
```

A suíte `node:test` cobre cadastro/login, três categorias, gestor/respostas/status, dashboard/filtros, logout/autorização, isolamento, injeção, integridade, concorrência e configuração de produção. O E2E **HTTP** cria processos Node reais e verifica persistência após restart. Fixtures limpam somente `connectclass_final_test`, com conta separada e trava exclusiva; FKs ficam habilitadas.

Contratos DOM e verificações de sintaxe/HTML/assets/CSS não substituem revisão visual. Não há suíte E2E de navegador neste repositório. Consulte [validação da publicação](docs/release.md) e [registro histórico da migração](docs/mysql-validation.md).

## Recuperação e problemas comuns

A tag `backup/pre-root-tcc-final-20260929` preserva a versão Git anterior. Ela continua recuperável no histórico/tag, mas não integra a árvore atual de `main`. Referência de design e ferramentas antigas foram preservadas em backup local, fora da publicação.

- Porta ocupada: encerre a instância conflitante ou configure outra `PORT`.
- Erro MySQL: confira variáveis e o código sanitizado localmente; nunca redefina contas/apague bancos para contornar falhas.
- Schema ausente: confira o banco e execute inicialização administrativa; não recrie JSON como fallback.
- Login em produção falha por HTTP: use HTTPS. Para desenvolvimento HTTP, use `NODE_ENV=development`.
- Sessão encerrada após restart: comportamento esperado; faça login novamente.
