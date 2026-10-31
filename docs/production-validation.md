# ConnectClass — produção oficial — 31/10/2026

Produção: **https://connect-class.vercel.app**. Projeto `connectclass`, equipe `vitin32231-3322s-projects`, plano Hobby. Deployment testado e promovido: `dpl_EA7dHhWVB6gS4qiJGqa2tm5oDWr3`. Staging permanece independente em https://connectclass-staging.vercel.app.

## Evidências

- Credencial inicial do gestor presente e validada com a política nativa; Secret exclusiva de Production. Nenhuma senha exibida, redefinida ou copiada do staging. Bootstrap criou somente o gestor operacional, com scrypt nativo. Login e Dashboard testados no deployment e no domínio oficial.
- Aiven MySQL8.4, banco `connectclass`, schema principal v1 e extensão de sessões aprovados. Conta própria com apenas SELECT/INSERT/UPDATE/DELETE. TLS1.3 com validação da CA e hostname. `connectclass_preview` usa outra conta; tentativas SELECT entre os bancos foram recusadas nos dois sentidos.
- **85/85 testes locais** em MySQL TLS descartável próprio; mais **1/1 teste de limpeza segura**, que recusa atividade inesperada e preserva registros alheios por hash. Não foram executados contra o MySQL real local.
- **42/42 testes hospedados de produção**, antes de associar o domínio:24HTTP e18navegador Edge/Playwright. Cadastro/login, três categorias, recebimento, respostas, status, Dashboard/filtros, histórico, isolamento entre alunos, autorização por tipo, origem externa recusada, logout, sessão SQL e persistência após novas requisições/página. Desktop1440 e mobile360/390 sem overflow horizontal. Balões/resposta/status conferidos visualmente.
- **5/5 verificações após promoção**: HTTPS/DNS/health, HTML/assets byte a byte, TLS/schema/privilégios/isolamento, login gestor/Dashboard/logout/cookies no navegador e alias apontando ao mesmo deployment testado. Nenhum teste com aluno real ou migração de dados reais.
- Cookies Secure/HttpOnly/SameSite=Strict; tokens guardados somente por hash no MySQL. Respostas privadas sem cache, autorização e queries parametrizadas mantidas. Fontes, `.env`, CA, backups e comercial não são servidos.29fontes publicadas comparadas por SHA1 à origem; HTML/JS/CSS/logo preservados byte a byte. Valores secretos conhecidos ausentes dos arquivos publicados.
- Revisão de segurança das mudanças concluída sem achados reportáveis; comercial excluído por escopo. npm audit sem vulnerabilidades; sintaxe49JS e `git diff --check` aprovados. Isso não equivale a pentest/carga ou garantia de ausência de falhas.
- Build remoto aprovado, Node26.x observado, Function `api/index`, região iad1. Build local Windows apresentou `spawn cmd.exe ENOENT`; saída parcial não foi publicada com `--prebuilt`.
- Primeira consulta real de logs:155requisições, zero5xx; consulta de erros/fatal de runtime:zero registros.401/403/404 de negação e caminhos inexistentes foram esperados. O logger emite falhas; ausência de mensagens não é uma trilha completa de auditoria.

## Dados e preservação

Os testes usaram três alunos fictícios e seis atendimentos identificados por marcador aleatório exclusivo. Limpeza transacional com prepared statements, IDs/e-mails/nomes conferidos e recusa de atividade desconhecida. Após limpeza, hash dos dados igual ao baseline: **1gestor,0conversas,0mensagens**. Um snapshot privado foi guardado fora do Git; contém material de autenticação e não deve ser compartilhado. Não houve DELETE de dados reais, DROP, TRUNCATE ou reset de contas.

Preview mantém5usuários,6conversas e10mensagens fictícios; nenhuma escrita de teste no staging nesta publicação. Nenhuma alteração no comercial, design, banco/serviços/volumes Docker locais. A última consulta Docker local não respondeu em15s: saúde atual não reconfirmada; a aplicação Vercel usa exclusivamente Aiven e funciona sem o PC. Não reiniciar/resetar Docker automaticamente para resolver isso.

## Publicação e operação

O build foi gerado com Production e `--skip-domain`, testado por acesso temporário restrito ao deployment e só então promovido. Domínio oficial verificado por API e HTTPS. O link temporário de duas horas foi revogado após os testes; seu valor e cookies não fazem parte da documentação/Git. A consulta à preferência `connectclass.vercel.app` expirou; foi mantido o domínio gratuito já configurado, sem assumir disponibilidade nem comprar domínio.

O conteúdo foi publicado da árvore local revisada antes do commit de release. Os metadados Git do primeiro deployment ainda referenciam o HEAD anterior; a correspondência com o código final é demonstrada pela comparação dos29arquivos enviados. Não confundir metadado antigo com ausência das mudanças serverless no deployment.

Integração Git preservada, com `autoAssignCustomDomains=false` para exigir teste e promoção manual de futuros builds. Antes de atualizar, execute suítes no banco fictício isolado, revise segredos/diff e faça build Production sem domínio; promova somente esse artefato testado. Veja [operação e rollback](vercel.md). Primeira produção oficial sem predecessor validado; restauração de backup/rollback não executados. Sem contratação paga ou migração real. Limites Free/Hobby e eventual suspensão do Aiven por inatividade continuam aplicáveis.

Evidências operacionais privadas em `backups/production-release-20261031/`, ignoradas pelo Git. Credenciais, cookies, snapshots e links privados não fazem parte deste relatório público.
