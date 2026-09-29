# ConnectClass

Plataforma escolar de comunicação entre alunos e secretaria, com Node.js, MySQL e HTML/CSS/JavaScript. **A versão oficial, originada da `tcc-final`, está na raiz deste repositório.** Não use a versão histórica `tcc1`. Visual, logo e controladores de interface preservados.

## Instalação e execução local

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
