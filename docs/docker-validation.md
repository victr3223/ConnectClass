# Validação Docker — 2026-09-30

Este relatório registra a etapa Docker anterior. A atualização posterior de gestor e do estado do botão está em [validação da atualização](manager-update-validation.md); os oito arquivos visuais idênticos abaixo referem-se à entrega anterior.

Preparação local na raiz oficial, sem alteração de design/logo/CSS, commit, push ou deploy externo. Docker Engine Linux 29.8.1, Compose 5.5.1, imagem Node 22 bookworm-slim e MySQL 8.4.11 (tag 8.4).

## Evidências executadas

| Verificação | Resultado |
| --- | --- |
| `docker compose config --quiet`, build e up com espera | Passou; app e mysql healthy |
| `npm run verify` | 45/45; sintaxe de 32 arquivos JS e contratos estáticos aprovados |
| `npm run test:coverage` | 45/45; 98,24% linhas, 87,25% ramos e 95,68% funções nos módulos instrumentados |
| `npm run test:docker` | 9/9 (oito subtestes e grupo principal); HTTP real, Node e MySQL em containers |
| Smoke do MySQL nativo anterior | 8/8; fingerprint dos registros antes/depois idêntico |
| Stack principal Docker | Health, página inicial e logo HTTP 200 em 127.0.0.1:8081 |
| Interface | Oito arquivos HTML/CSS/JS/logo sem diff; hashes iguais aos da imagem |
| Git/privacidade | Diff check aprovado; configs privadas ignoradas; sem valores privados ou assinaturas de tokens nos candidatos públicos/índice/histórico examinados |

Docker E2E usa projeto, contas e volume novos e isolados. Verificou cadastro forçado a aluno, login, Pergunta/Reclamação/Sugestão, gestor recebendo/respondendo, status Resolvida, dashboard/filtros, aluno recebendo resposta, acesso sem sessão/sem perfil e logout. Verificou processo não root, ausência de configurações/dados JSON na imagem e recusa de DDL pela conta runtime.

Repetiu leitura dos usuários, três mensagens, resposta e status após `restart`, recriação somente do app e `down`/`up`. A data de criação do volume permaneceu igual. Sessões expiram no restart, conforme arquitetura; novo login funciona. A segunda inicialização aplica o schema idempotentemente. Não houve remoção de volumes, reset, prune ou exclusão de dados reais.

## Correções feitas e revalidadas

- Inicialização MySQL agora funciona com script executado ou sourced: bind mount do Windows o marcou executável; a função interna do entrypoint não estava disponível. Usa cliente SQL por socket, sem senha na linha de comando. O volume principal recém-criado foi confirmado sem tabelas e sem conta migradora antes de concluir as contas, sem recriar/apagar volume.
- App participa também de uma rede para publicação HTTP; MySQL permanece somente na rede interna, sem porta publicada.
- Um timeout transitório da primeira conexão nativa deixou aberto o pool do fixture de testes. Cleanup agora cobre falha de aquisição; cadastro e suíte completa/coverage passaram na repetição.
- O E2E cria a pasta ignorada de fixtures quando ausente em um clone novo.

## Estado entregue e limites

`docker compose up -d` está preparado; stack principal deixada saudável. A configuração Docker é privada e separada da configuração nativa. O volume Docker principal é uma base nova; **os dados MySQL locais existentes não foram transferidos automaticamente**. Não repetir geração de contas/senhas sobre volume existente. Fixtures encerram apenas seus próprios containers/redes e preservam volumes/configuração privada para recuperação.

SQL Copilot orientou a separação de contas runtime/migração, inicialização idempotente com lock e recusa de downgrade, sem DDL destrutivo. O processo HTTP remove de seu ambiente a configuração de migração após inicializar; root não é fornecido ao app. Operadores com controle do Docker ainda acessam variáveis dos containers, portanto esse acesso deve ser restrito.

E2E é HTTP, não automação visual de navegador. Não havia suíte de navegador neste projeto. Coverage não instrumenta processos externos/container. Backup/restore, carga, domínio/TLS e servidor Ubuntu/VPS não foram certificados; README documenta a preparação e os cuidados. HTTPS e configuração de produção são necessários na futura VPS. Nenhuma publicação GitHub ou hospedagem externa executada nesta etapa.

## Arquivos

Criados: Dockerfile, docker-compose.yml, .dockerignore, .gitattributes, docker/mysql/01-accounts.sh, scripts/docker-entrypoint.js, scripts/docker-healthcheck.js, scripts/setup-docker-env.js, server/database/docker-migrations.js, test/docker.unit.test.js, test/docker.e2e.js e este relatório.

Atualizados: .env.example, package.json, README.md e test/mysql-fixture.js. Configurações privadas e registros de teste ficam fora do Git. O frontend não foi alterado.
