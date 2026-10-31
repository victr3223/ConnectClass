# Recuperação Aiven — 29/10/2026

Escopo: somente lançador/configuração Aiven, sem deploy, reset de senha, exclusão de recursos, alterações visuais ou no comercial.

## Diagnóstico observado

O lançador não define `ProcessStartInfo.WorkingDirectory`. Reproduzido a partir de `C:\Users\Victr`: mesmo após `Set-Location` para a raiz oficial, o Node herda a pasta anterior e termina com `MODULE_NOT_FOUND`. O erro genérico da linha 26 não identifica essa causa. Sem o stderr original do operador, não é possível excluir outra falha naquela execução específica.

Na execução `-InspectOnly` enviada pelo operador, a causa foi confirmada: **PowerShell 5.1 serializa a string enriquecida de `Get-Content -Raw` como objeto com `value`/propriedades ETS**. `DB_SSL_CA` deixava de ser string e gerava `INVALID_CA` antes da conexão. Reproduzido na versão 5.1.19041.6456. Corrigido para `[IO.File]::ReadAllText(...)`, que produz string JSON. Teste executa o lançador inteiro em fixture com respostas fictícias, reproduzindo INVALID_CA antes da correção e passando depois. Não foi necessário substituir CA nem redefinir senha.

Serviço existente Free/RUNNING; API informa somente `defaultdb` e uma conta administrativa. Nenhum arquivo `.env.vercel.*` encontrado. CA local válida; TCP e TLS 1.3 com validação de CA/hostname passaram. Sonda TLS utilizou uma conta fictícia inexistente: a recusa de autenticação era esperada e **não valida a senha administrativa**.

## Plano de recuperação

- [x] Fixar raiz/script absolutos e diretório de trabalho do processo; capturar erro sanitizado com etapa e código original.
- [x] Adicionar inspeção autenticada somente leitura e relatório privado, sem expor SQL, senhas ou parâmetros.
- [x] Retomar setup aditivo: preservar bancos/tabelas/contas; guardar credenciais geradas antes de criar conta; reutilizar arquivos privados sem sobrescrever/resetar.
- [x] Implementar verificação de conta própria com somente SELECT/INSERT/UPDATE/DELETE no banco correspondente, TLS validado e schema compatível. Bloquear configurações divergentes ou privilégios excessivos sem revogar nada automaticamente. Execução no Aiven real ainda pendente da autenticação privada.
- [x] Cobrir falhas/retomada/idempotência com testes e MySQL TLS isolado: suíte completa **84/84**, zero falhas/skips. Inclui senha divergente preservada, interrupção após CREATE USER antes de GRANT, repetição sem mudança de arquivos/hashes/dados, recusa de GRANT OPTION e schema futuro. Relatórios privados em `backups/aiven-recovery/tests-report.json` e `tests-full.log`.
- [x] Inspeção Aiven real aprovada em 30/10/2026: autenticação administrativa, CA/hostname e TLS1.3 autorizados. Relatório sanitizado preservado privadamente em `backups/aiven-recovery/inspect-success-20261030.json`. Os dois destinos ainda não existem; nenhuma configuração privada foi criada.
- [x] Operador concluiu configure em 30/10; relatório `passed=true`, duas aplicações aprovadas. Validação independente posterior nas duas contas próprias confirmou autenticação, TLS1.3/CA/hostname, quatro privilégios DML exatos, schema principal e serverless. Contas são distintas; configurações privadas não foram modificadas pela validação. Login do gestor fictício preview aprovado. Produção vazia, aguardando migração autorizada. Evidências privadas `configure-success-20261030.json` e `cloud-validation-20261030.json` em `backups/aiven-recovery/`.

DDL MySQL tem commit implícito. Falhas deixam recursos preservados e identificáveis; não há limpeza destrutiva. A CA é conteúdo PEM em `DB_SSL_CA`, não caminho Windows dentro das Functions.

## Falso positivo de privilégios — 30/10/2026

Depois de criar o destino preview, a validação recusou `SHOW GRANTS` com `EXCESSIVE_APP_PRIVILEGES`. A inspeção real somente leitura mostrou exclusivamente USAGE global e SELECT/INSERT/UPDATE/DELETE em `"connectclass_preview".*`, sem GRANT OPTION. O servidor utiliza ANSI_QUOTES; aspas duplas também delimitam identificadores, conforme o [manual MySQL](https://dev.mysql.com/doc/refman/8.4/en/identifiers.html).

O parser foi corrigido para aceitar somente as representações delimitadas ou não delimitadas do **mesmo banco esperado**. Outros bancos, tabelas específicas, privilégios extras e GRANT OPTION continuam recusados. Regressão reproduziu a falha e passou após a correção. Conta, senha e privilégios reais não foram alterados. Após a correção, autenticação/TLS1.3/privilégios mínimos/schema do preview passaram na Aiven em modo somente leitura.

Suíte completa repetida com servidor MySQL isolado em modo ANSI e TLS validado: **85/85 aprovados, zero falhas/skips**; check49JS e diffcheck aprovados. Evidências preservadas privadamente em `backups/aiven-recovery/ansi-tests-report-20261030.json`, `ansi-tests-full-20261030.log` e `grants-readonly-20261030.json`.

Retomar o setup com `configure-aiven.ps1 -InspectOnly:$false`: reutiliza a configuração privada preview existente e conclui os ambientes. O administrador precisa inserir novamente a senha localmente; ela não é retida. Não apagar o arquivo privado existente para contornar falhas.

**Estado final desta recuperação:** setup concluído e ambos os bancos validados; não repetir configuração ou redefinir contas. No projeto Vercel existente, os oito parâmetros DB de cada ambiente foram gravados por stdin como Secret e sua presença, escopo e tipo foram conferidos (16 entradas). Contas DML separadas; CA enviada como conteúdo PEM, sem caminho Windows. NODEJS_HELPERS existente preservado e valor 0 também definido no vercel.json. Nenhuma senha administrativa ou senha do gestor fictício foi enviada. Configurações locais permaneceram intactas. Evidência privada: `backups/aiven-recovery/vercel-env-20261030.json`.

Ainda faltam validar preview/E2E público e realizar a migração autorizada antes de produção. A validação de metadados das variáveis não substitui o teste de uma Function hospedada. Nenhum deploy, commit/push ou alteração do Docker/design/comercial nesta recuperação.
