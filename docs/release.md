# ConnectClass — validação da versão oficial na raiz

Data: 29/09/2026. Fonte exclusiva: `tcc-final`, promovida para a raiz. O relatório descreve a validação local anterior à publicação; o estado do CI remoto é consultável no GitHub Actions.

## Recuperabilidade e preservação

- Tag `backup/pre-root-tcc-final-20260929` preserva o commit anterior `86b9dc7a585cbb6ae62e715287c4eff8b634f27f`.
- Bundle Git e cópia privada completa da fonte criados antes da promoção; 513 arquivos conferidos por hash. Configurações/dados privados não entram no Git.
- `tcc1` já estava ausente no disco ao iniciar; suas exclusões foram incorporadas à organização solicitada. A aplicação oficial agora está na raiz, sem pasta duplicada.
- HTML, CSS, logo e controladores da interface: oito arquivos idênticos por SHA-256 à fonte oficial anterior à promoção. A rota da captura/logo histórica foi preservada.
- Protótipo de design, capturas não utilizadas e ferramenta antiga de extração de logo foram arquivados localmente, recuperáveis, fora da publicação. Nenhum dado MySQL principal foi apagado.

## Testes locais

- Instalação limpa pelo lockfile: `npm ci --ignore-scripts`, exit 0; auditoria npm reportou zero vulnerabilidades.
- `npm run check`: 26 arquivos JavaScript, contratos HTML/assets e sanidade CSS/JSON aprovados.
- `npm run test:coverage`: **40/40**, zero falhas/ignorados. Cobertura dos módulos importados: 98,41% linhas, 87,56% ramos e 96,27% funções.
- `npm run verify` repetido na raiz: **40/40**. Exportação limpa da árvore preparada para Git (sem dados JSON e sem configuração principal), instalação pelo lockfile e `npm run verify`: **40/40**; somente a configuração isolada de testes foi fornecida privadamente.
- `npm run test:e2e:http` executado separadamente: **1/1**, exit 0.
- 18 testes HTTP de integração, quatro contratos do painel, seis testes MySQL, um E2E HTTP de processo e 11 testes unitários.
- Cadastro/login, Pergunta/Reclamação/Sugestão, gestor recebe/responde/altera status, aluno consulta resposta, dashboard/filtros, logout/autorização, isolamento/injeção/concorrência aprovados.
- E2E HTTP usa processos Node reais: encerra, inicia outro processo, exige novo login e confirma os dados/respostas/status persistidos. JSONs legados permanecem inalterados e não são usados pelo runtime.
- Smoke adicional na base principal: MySQL/schema válidos, oito verificações HTTP aprovadas e fingerprint dos registros igual antes/depois, sem imprimir dados privados.
- Testes usam exclusivamente `connectclass_final_test`, com conta DML separada e sem acesso ao banco principal. Nenhum provisionamento/importação foi repetido na base real.

## Preparação de produção

- `PORT` vem do ambiente; host padrão de produção `0.0.0.0`, local `127.0.0.1`.
- Nome de banco configurável para provedores; identificadores validados antes de DDL. Inicialização administrativa seleciona banco existente, sem CREATE DATABASE implícito.
- TLS MySQL opcional, verificando certificado e identidade; CA customizada no ambiente privado, sem modo inseguro.
- Unitários cobrem portas/hosts, nome de banco do provedor, rejeição de identificadores inválidos, TLS e schema sem criação implícita do banco.
- CI atualizado para raiz, Node.js 22/24, MySQL 8.4 descartável e conta de testes com mínimo privilégio. Nenhum workflow de deploy.
- SQL Copilot orientou a separação entre migração administrativa, runtime DML e isolamento dos testes; frontend e contrato da API preservados.

## Segurança e limites

Configurações `.env*` privadas, dependências, logs, dados e backups são ignorados. Exemplos públicos têm senhas vazias. A checagem de publicação procura valores secretos locais e assinaturas de tokens nos arquivos preparados e histórico, sem imprimir valores. O `tcc1/data.json` de dois commits antigos é a fixture estática do protótipo (sem credenciais); não é `data/usuarios.json` ou `data/mensagens.json`, e não integra a árvore publicada atual. Fixtures de CI usam valores demonstrativos somente no serviço descartável.

`git diff --check` e `git diff --cached --check`: aprovados, exit 0. Foram conferidos 44 caminhos preparados e 134 blobs de texto históricos; nenhum segredo local/assinatura de token detectado. A versão antiga permanece recuperável na tag/histórico; sua ausência se refere à árvore atual de `main`, não a apagar histórico.

E2E validado é **HTTP**, não navegador. Não existe suíte E2E de navegador; contratos DOM não certificam renderização visual. Não houve deploy, teste de carga, restauração SQL ou validação de uma hospedagem específica. Sessões/limites em memória exigem uma instância; HTTPS, MySQL remoto, backups e variáveis devem ser configurados no destino conforme README.
