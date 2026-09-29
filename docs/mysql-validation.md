# Validação MySQL de tcc-final — 29/09/2026

> Registro histórico anterior à promoção para a raiz/publicação. Consulte [a release atual](release.md). Restrições antigas de nome de banco/publicação abaixo descrevem somente aquela etapa.

## Resultado

Fonte oficial: somente `tcc-final`. A implementação anterior em `tcc1` foi consultada, não alterada. Nenhum commit, push ou deploy nesta tarefa.

- Baseline anterior à adaptação: **18/18 testes** passaram.
- `npm run verify`: **37/37**, zero falhas e zero ignorados; sintaxe/contratos aprovados.
- `npm run test:coverage`, repetido após as alterações finais de código: **37/37**, exit 0. Cobertura dos módulos importados: 97,88% linhas, 87,09% ramos, 95,42% funções; não mede toda a interface ou todos os scripts administrativos.
- **E2E HTTP passou**: cadastro, três categorias, gestor recebe/responde/altera status, aluno recebe, dashboard/filtros, autorização, logout, encerramento e criação de outro processo Node. Sessões antigas são invalidadas; dados SQL persistem.
- MySQL real **9.7.1**, banco `connectclass_final`, conta própria somente SELECT/INSERT/UPDATE/DELETE. Smoke HTTP da base migrada aprovado: health/login/logo 200, gestor sem sessão 401, configuração e dados privados 404.
- Testes isolados em `connectclass_final_test`; não acessam a base principal nem executam DDL. Configuração recusa os bancos da versão anterior.
- Origem legada importada e reconciliada sem exibir identidades, conteúdo ou hashes. Segunda importação foi idempotente. Arquivos originais iguais ao backup.
- `git diff --check` e `git diff --cached --check`: exit 0. Como esta pasta chegou não rastreada, houve também `git diff --no-index --check` dos arquivos alterados contra o backup e dos novos contra `/dev/null`, sem erros de whitespace.
- `.env`, `.env.test`, JSONs legados e backups ignorados, sem arquivos privados no índice Git.

## Preservação visual e de comportamento

Comparação SHA-256 anterior/posterior idêntica para `index.html`, `gestor.html`, `styles.css`, `manager.css`, `script.js`, `gestor.js`, `message-ui.js` e `assets/logo.png`. Demais assets e referência visual não foram editados. Mantidos `/assets/logo.png`, a rota da captura histórica e porta padrão **8081**.

Os testes originais de integração foram adaptados de inspeção de arquivos para SQL, conservando os cenários. A validação de JSON corrompido permanece no teste do importador explícito; o runtime agora recusa a opção de diretório JSON. O teste de contrato do gestor permaneceu inalterado.

SQL Copilot e a orientação de migrações fundamentaram a separação entre banco principal/testes, consultas parametrizadas, transações, preflight, backup e reconciliação. Não houve cópia indiscriminada da versão anterior: as diferenças do backend, testes, assets e porta foram comparadas antes da adaptação.

## Arquivos alterados ou adicionados nesta pasta

Alterados:

- `server.js`
- `server/app.js`, `server/users.js`, `server/messages.js`
- `test/auth.integration.test.js`
- `package.json`, `.gitignore`, `README.md`, `data/README.md`

Adicionados:

- `server/database/connection.js`, `server/database/migrations.js`, `server/database/import-json.js`
- `database/schema.sql`, `database/admin.env.example`
- `scripts/check.js`, `scripts/run-tests.js`, `scripts/init-db.js`, `scripts/setup-local-db.js`, `scripts/migrate-json-to-mysql.js`, `scripts/verify-migration.js`
- `test/mysql-fixture.js`, `test/mysql.integration.test.js`, `test/process.integration.test.js`, `test/server.unit.test.js`
- `package-lock.json`, `.env.example`, `AGENTS.md`, `docs/mysql-validation.md`

Removido: `server/json-store.js`, comprovadamente sem dependentes no runtime/testes. Cópia recuperável em `backups/pre-mysql-20260929/server/json-store.js`.

Arquivos privados locais gerados: `.env` e `.env.test`; seus valores não são parte desta documentação ou do Git. Backup prévio de código/dados em `backups/pre-mysql-20260929`, ignorado. Os JSONs originais e `data.json` foram preservados, nunca servidos ou usados como armazenamento de runtime.

## Limites e recuperação

E2E HTTP não é teste visual em navegador. Nenhuma suíte E2E de navegador existia nesta fonte; validação visual nova não foi executada. HTML/CSS/logo/controladores foram preservados byte a byte e contratos existentes passaram.

O banco anterior não foi mesclado com o novo: foram importados somente os dados da fonte oficial. Não há restauração SQL, teste de carga ou deploy certificados nesta tarefa. Sessões são locais ao processo. Para recuperação, pare escritas e faça backup SQL antes de qualquer restauração; não substitua o SQL pelos JSONs antigos depois de novas gravações. Não há rollback destrutivo automático.
