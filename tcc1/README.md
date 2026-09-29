# ConnectClass

Plataforma escolar de comunicação entre alunos e secretaria. Backend Node.js + **MySQL**, frontend HTML/CSS/JavaScript preservado. Cadastro, login, histórico por categoria e painel do gestor com filtros, respostas e status persistentes.

## Requisitos e instalação

- Node.js 22+ e npm (validação local: Node 24.19.0).
- MySQL Server 8.4+; ambiente local validado com 9.7.1. Workbench é cliente, não substitui o servidor.
- Dependência de runtime: `mysql2`, versão fixada no lockfile.
- O aplicativo executável fica em `tcc1`; `ConnectClass Web App Design` é referência visual, não integra o runtime ou CI. Não há build.

Na pasta `tcc1`:

```sh
npm ci --ignore-scripts
```

Consulte também o [README da raiz](../README.md). A publicação do código não configura hospedagem nem disponibiliza um banco de dados.

## MySQL

**Em uma instalação já configurada, não repita o provisionamento nem apague a base. Use `npm start`.**

Para uma instalação local realmente nova:

1. Copie `database/admin.env.example` para `.env.mysql-admin` e preencha localmente as credenciais de uma conta autorizada a criar bancos/usuários. Não envie valores ao chat, Git ou terminal de logs.
2. Execute `npm run db:setup-local`. É um comando explícito, nunca executado por start/test. Ele cria `connectclass` e `connectclass_test`, inicializa o schema e gera contas próprias com permissões SELECT/INSERT/UPDATE/DELETE somente no respectivo banco.
3. O comando grava `.env` e `.env.test` privados com valores aleatórios e recusa sobrescrever arquivos ou contas existentes. Se houver falha parcial, preserve os recursos e revise o estado; não use DROP para recomeçar.
4. Para migrar dados anteriores, **importe antes de iniciar o aplicativo**, seguindo a seção abaixo. Para uma instalação sem dados anteriores, configure `CONNECTCLASS_GESTOR_PASSWORD` em `.env` antes do primeiro start.
5. Execute `npm run verify` e depois `npm start`.

`database/schema.sql` também pode ser executado no Workbench por uma conta administrativa. `npm run db:init` usa `.env.mysql-admin` e inicializa o banco indicado por DB_NAME (padrão connectclass; somente connectclass/connectclass_test são permitidos). O DDL usa IF NOT EXISTS e não remove dados; não corrige divergências arbitrárias de um schema preexistente. DDL MySQL tem commits implícitos.

Credenciais administrativas não são usadas pelo runtime. O provisionamento local limita contas a `localhost`; a exceção `%` existe somente no serviço descartável de CI para a rede do contêiner. Não use root nem a conta de CI em produção.

## Ambiente e execução

`npm start` carrega `.env` do diretório de trabalho usando Node nativo. Variáveis já definidas no processo prevalecem. Arquivos privados são ignorados pelo Git; `.env.example` contém apenas campos vazios/modelo.

| Variável | Uso |
| --- | --- |
| DB_HOST | Host MySQL; instalação local: 127.0.0.1. |
| DB_PORT | Porta MySQL; padrão 3306. |
| DB_USER | Conta própria da aplicação; root é recusado. |
| DB_PASSWORD | Segredo local obrigatório; nunca versionar. |
| DB_NAME | connectclass no runtime; connectclass_test nos testes. |
| HOST / PORT | HTTP; padrões 127.0.0.1 / 8080. |
| NODE_ENV | development local; production somente com HTTPS configurado. |
| CONNECTCLASS_GESTOR_PASSWORD | Somente para criar o primeiro gestor de uma base nova; 8–128 caracteres. |

`CONNECTCLASS_DATA_DIR` não seleciona persistência: o runtime não usa JSON nem possui fallback para arquivos. Opção interna antiga dataDirectory é recusada.

```sh
npm start
```

Abra [ConnectClass local](http://127.0.0.1:8080). Encerre pelo Ctrl+C. Nenhum serviço permanente é instalado.

## Migração de uma base JSON existente

1. Pare a instância antiga e mantenha-a sem escritas durante a migração.
2. Faça backup privado consistente de `usuarios.json` e `mensagens.json`, fora do Git.
3. Prepare o schema e a conta da aplicação, **sem iniciar o aplicativo**: o bootstrap de gestor tornaria o destino não vazio.
4. Confira DB_NAME/host da configuração privada. Execute:

```sh
npm run db:import -- "CAMINHO_ABSOLUTO_DA_ORIGEM"
```

O importador valida IDs, referências, categorias, status e formato de hash antes de inserir. Uma transação importa tudo ou reverte tudo; uma origem diferente é recusada em destino não vazio. A mesma origem pode ser repetida sem duplicar registros, pelo fingerprint registrado em import_batches. Os JSONs originais nunca são alterados pelo importador.

IDs de usuários e atendimentos, hashes scrypt, datas, status e conteúdo são preservados. A API conserva IDs antigos de respostas por legacy_reply_id; a PK interna das respostas usa um deslocamento para não colidir com IDs de mensagens-raiz. Datas de criação de usuários ausentes na origem recebem o instante da importação, sem inventar datas históricas.

Backups, contagens da base real e relatórios locais de migração devem permanecer privados. Os fluxos de mensagens/respostas são testados com dados fictícios em connectclass_test, nunca com dados pessoais da base original.

Não faça rollback apagando bancos ou recolocando o JSON antigo: ele não contém novas gravações SQL. Pare escritas, faça backup SQL e prepare uma restauração revisada em ambiente separado. Os scripts não oferecem downgrade automático.

## Aluno, gestor e atendimento

- Cadastro cria somente aluno, validando nome, RA, turma, e-mail e senha. RA/e-mail únicos; login por RA ou e-mail.
- O gestor inicial é `gestor@connectclass.local`. Se não existir, a senha configurada é obrigatória também em desenvolvimento; nenhuma senha é gerada ou impressa pelo runtime.
- Gestor já existente é preservado. Alterar a variável de bootstrap não redefine sua senha. Não há recuperação ou troca de senha pela interface.
- A UI agrupa conversas por **aluno + categoria**. Cada mensagem-raiz é um atendimento com status e respostas próprios.
- Dashboard conta atendimentos de toda a base; filtros não mudam esses totais. Filtros combinam aluno, turma, categoria, status, texto e período do envio original no dia de Brasília.
- Uma conversa encontrada mantém seu histórico completo. Busca inclui conteúdo de respostas. Selecione o atendimento correto antes de responder ou alterar status.
- Estados: Pendente, Em análise, Respondida, Resolvida. Resposta marca o atendimento selecionado como Respondida.
- Atualização é manual. Após erro de confirmação de gravação, confira o histórico antes de reenviar.

## Arquitetura e modelo relacional

`server.js` inicia HTTP; `server/app.js` controla autenticação, autorização e rotas; repositórios consultam o pool central em `server/database/connection.js`. Consultas recebem parâmetros, não concatenação de entrada do usuário. Alterações compostas usam transação; respostas/status usam bloqueio da linha do atendimento.

| Tabela | Responsabilidade |
| --- | --- |
| users | Identidade, papel e hash; RA/e-mail únicos. |
| conversations | Um atendimento: aluno, categoria, status e datas. Não é o agrupamento visual. |
| messages | Texto da mensagem-raiz e das respostas, com remetente e tipo. |
| import_batches | Fingerprint e contagens da importação concluída. |
| schema_migrations | Versão do schema inicial. |

FKs usam RESTRICT; exclusão de usuário/atendimento com histórico é recusada. Remetente/tipo possui FK composta. Índice único de raiz impede duas mensagens de aluno no mesmo atendimento. Índices cobrem aluno/categoria/data, status/data, categoria/data, última atividade e histórico/remetente.

DATETIME(3) é armazenado em UTC; a UI exibe America/Sao_Paulo. utf8mb4 preserva acentos e emojis; e-mail/RA são únicos sem distinguir maiúsculas, distinguindo acentos. A busca textual usa substring literal, não curingas SQL; não há índice full-text.

Sessões permanecem **em memória**, com cookie HttpOnly/SameSite Strict (Secure em produção), duração 8 horas ou 7 dias com Lembrar-me. Reiniciar Node invalida sessões, mas não dados MySQL. Use uma instância enquanto não houver armazenamento compartilhado de sessões.

## Rotas

| Método/rota | Finalidade |
| --- | --- |
| GET /health | Liveness HTTP; não certifica conexão, integridade ou escrita MySQL. |
| GET /login, /aluno, /gestor | Telas; áreas privadas verificam papel. |
| POST /api/auth/register, /login, /logout | Cadastro, entrada e saída (prefixo /api/auth). |
| GET /api/auth/me | Usuário da sessão, sem hash. |
| GET /api/mensagens | Histórico/contadores somente do aluno autenticado. |
| POST /api/mensagens | Criar atendimento como aluno. |
| GET /api/gestor | Indicadores, conversas e filtros como gestor. |
| PATCH /api/gestor/mensagens/:id/status | Alterar status como gestor. |
| POST /api/gestor/mensagens/:id/respostas | Responder como gestor. |

Corpos JSON com Content-Type application/json, até 16 KiB e prazo de leitura de 10 segundos. Erros internos são genéricos para o cliente; logs SQL registram somente código permitido, nunca consulta, parâmetros ou credenciais.

## Testes e CI

**Os testes de integração limpam somente connectclass_test. Nunca coloque dados pessoais nesse banco.** Verificam DB_NAME e isolamento, mantêm FKs habilitadas e usam conta própria sem DDL. A configuração é carregada de `.env.test` ou das variáveis do job; variáveis do processo prevalecem e uma seleção incorreta de banco é recusada.

```sh
npm run verify
npm run test:unit
npm run test:integration
npm run test:e2e:http
npm run test:coverage
```

- 16 testes unitários/contratos de UI.
- 24 testes HTTP/repositório/importação com MySQL real.
- 1 fluxo HTTP completo com encerramento e criação de outro processo Node, verificando persistência e ausência de JSON.
- O executor é node:test. Cobertura é nativa, não certifica a UI em navegador nem todos os scripts administrativos.
- `npm run check` verifica sintaxe JS, contratos HTML/assets e sanidade CSS; não é validador completo de HTML/CSS.
- **E2E HTTP não é E2E visual.** A validação automatizada em navegador não estava disponível nesta release; não é apresentada como executada. O design aprovado foi preservado.

O workflow `.github/workflows/ci.yml` na raiz usa Node 22/24, serviço MySQL 8.4 descartável, preparo administrativo separado e testes sob conta DML restrita. Credenciais presentes no workflow são fixtures públicas desse serviço, nunca credenciais reais. Permissões GitHub de leitura; sem deploy. Workflow preparado/revisado, ainda **não executado remotamente**.

## Workbench

Abra sua conexão local e selecione o schema configurado. Para verificar o destino e as tabelas sem expor registros:

```sql
SELECT VERSION() AS mysql_version, DATABASE() AS selected_database;
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;
```

Consulte o modelo em `database/schema.sql`. Resultados com identidade, conteúdo ou hashes são privados e não devem ser publicados.

## Segurança e limites de deploy

- scrypt com salt e comparação segura; papel e autoria determinados no backend; IDOR/CSRF/cookies/limites cobertos por testes.
- Renderização de mensagens como texto, CSP e lista explícita de arquivos públicos. .env, SQL e dados não são servidos.
- Rate limit de autenticação: 30/IP/minuto, até 4 operações de hash concorrentes. Pool: 10 conexões, fila limitada a 100.
- Não há paginação, proteção completa contra DDoS ou limite total de registros. Busca em respostas concatena até 16 MiB por atendimento; dimensione antes de bases grandes.
- Use HTTPS real, proxy preservando Host e NODE_ENV=production. Node sozinho continua HTTP. MySQL remoto precisa de rede privada e TLS configurado/revisado; esta configuração foi validada apenas localmente.
- Atrás de proxy, o limite usa IP da conexão, sem confiança em X-Forwarded-For; avalie impacto em usuários simultâneos.
- Proteja arquivos privados por ACL do Windows; mode 0600 não substitui ACL. Restrinja porta MySQL e conta por origem.
- Defina backup SQL, retenção, monitoramento e **teste de restauração** antes do uso em produção; isso ainda não foi validado.
- Sessões em memória impedem declarar suporte pronto a múltiplas instâncias. Sem recuperação de senha/e-mail, anexos ou notificações em tempo real.

## Estrutura e documentação

```text
server/database/         pool, schema e importador explícito
database/schema.sql      DDL público sem dados
scripts/                 check, testes e provisionamento explícito
test/                    testes isolados, inclusive reinício de processo
data/                    histórico/documentação; nenhum JSON de runtime
docs/release.md           escopo e evidências públicas da release
```

Referências: [mysql2](https://sidorares.github.io/node-mysql2/docs), [commits implícitos MySQL](https://dev.mysql.com/doc/refman/9.7/en/implicit-commit.html).

## Problemas comuns

- **ER_ACCESS_DENIED_ERROR:** confira usuário, host, porta e configuração privada localmente. “using password: YES” informa apenas que uma senha foi enviada; YES não é a senha.
- **Configuração ausente/schema incompatível:** confira DB_* e execute inicialização administrativa correta. Não crie arquivos JSON como contorno.
- **Banco de testes recusado:** remova variáveis de processo antigas e selecione exclusivamente connectclass_test; não altere a proteção.
- **EADDRINUSE:** encerre sua instância anterior ou escolha outra PORT.
- **Sessão perdida no restart:** esperado; entre novamente.
- **Dados não aparecem:** confira categoria/filtros e Atualizar. Preserve o banco e consulte logs sanitizados; não apague tabelas.
- **Login em HTTP com produção:** use HTTPS ou NODE_ENV=development no ambiente local.
