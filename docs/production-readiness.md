# Produção oficial — pré-condições — 30/10/2026

## Estado vigente — 31/10/2026

Configuração corrigida pelo operador: gestor presente/válido, DB autenticado, TLS1.3/schema/privilégios mínimos e isolamento aprovados. Publicação oficial concluída em https://connect-class.vercel.app após testes na URL isolada. Consulte [a validação final](production-validation.md). As inspeções com falha abaixo são histórico preservado e não representam o estado atual. Não repetir setup, bootstrap ou migração de dados reais.

## Rechecagem após confirmação do operador — 31/10/2026

Operador respondeu “configurado”. O arquivo absoluto correto foi inspecionado sem exibir valores: UTF8, parâmetros DB presentes, mas a chave CONNECTCLASS_GESTOR_PASSWORD continua ausente (nem vazia, nem variação de caixa, nem outra cópia .txt nesse prefixo). A variável também não existe nas Secrets Production.

Nova autenticação MySQL com a configuração local atual retornou **ER_ACCESS_DENIED_ERROR**; antes da edição a mesma configuração autenticava. Isso indica credencial DB atual incorreta ou divergente, não comprova qual campo foi alterado. Não redefinir senha, buscar segredos em perfis, copiar staging ou sobrescrever configurações para contornar. As Secrets remotas não foram alteradas.

Pendências atuais: restaurar os valores DB originais, especialmente não usar a senha do gestor em DB_PASSWORD, e adicionar CONNECTCLASS_GESTOR_PASSWORD separadamente com senha exclusiva Production. Não enviar nenhum valor no chat. Nenhum deploy, Secret, conta ou dado foi alterado nesta rechecagem. As verificações MySQL aprovadas abaixo são anteriores à edição; não certificam a configuração local atual.

## Bloqueio antes do deploy

Victor autorizou o deploy oficial condicionado às verificações do pedido anexado de produção. A publicação foi interrompida antes de criar qualquer deployment: falta a credencial inicial do gestor de produção.

Inspeção real somente leitura confirmou:

- Conta/equipe Hobby corretas; projeto oficial `connectclass`, ID `prj_YVRvg7xO5yuLXeutLHNcCgZ57hUJ`, zero deployments.
- Build `node scripts/build-vercel.js`, instalação `npm ci --ignore-scripts --omit=dev`, saída `public`; Node24.x nas configurações. O engines>=22 pode selecionar versão mais nova, como Node26.x observado no staging; conferir o runtime do futuro build.
- GitHub `victr3223/ConnectClass`, branch Production main. HEAD local/remoto `c2541ee076859ba0c0afff5da26a22f7e60bc8e4`; a preparação serverless continua não commitada e foi preservada.
- Domínio cadastrado `connect-class.vercel.app`, ainda sem publicação oficial. Não foi presumida a disponibilidade de connectclass.vercel.app.
- Oito variáveis DB Production Secret, sem override de branch; NODEJS_HELPERS existente. Nenhum valor secreto foi exibido.
- Banco oficial descoberto no arquivo privado existente e confirmado por SELECT DATABASE(): `connectclass`, distinto de `connectclass_preview`. Autenticação do usuário próprio, TLS1.3/CA/identidade, privilégios DML mínimos e schemas principal/serverless aprovados. Zero usuários, gestores ativos, conversas e mensagens.
- Docker Linux respondeu; app e mysql running/healthy. Nenhum serviço/volume/banco local foi alterado. A pendência Docker anterior foi resolvida por esta inspeção, sem restart.
- Staging preservado e health HTTPS200; nenhuma alteração no projeto ou nos dados de homologação.

## Causa da interrupção

Não existe gestor ativo no banco oficial e `CONNECTCLASS_GESTOR_PASSWORD` não está definido no arquivo privado Production nem nas variáveis remotas Production. `server/users.js` exige essa credencial para criar o primeiro gestor; `server/app.js` executa esse bootstrap antes de servir rotas. O adaptador Vercel retorna503 se a inicialização falha. A exigência foi reproduzida em fixture isolada, sem qualquer escrita SQL real; **não foi publicado um deployment para observar503 em produção**.

Não copiar a conta, a senha ou os dados do staging. Não migrar usuários locais para contornar o bloqueio. Não enfraquecer a autenticação nem publicar o build sabendo que não inicializará.

## Informação necessária para retomar

Definir localmente uma senha forte exclusiva de produção em `CONNECTCLASS_GESTOR_PASSWORD` no arquivo privado `.env.vercel.production`, que continua ignorado pelo Git. Não colocar o valor no chat, README, comandos, logs ou arquivos versionados. Não modificar os parâmetros DB existentes. A implementação atual cria o gestor inicial com login `gestor@connectclass.local` e hash nativo; outro login exige provisionamento específico, não cópia do staging.

Depois de a credencial estar disponível localmente, enviá-la por stdin como Secret somente ao projeto oficial/Production, revalidar os gates, gerar deployment isolado sem domínio e testar antes de promover. A autorização de publicação já foi dada; não pedir nova aprovação redundante, mas não inventar a credencial administrativa ausente.

Nenhum deploy, alteração remota, cadastro de produção, migração, commit/push, alteração visual ou no comercial ocorreu nesta inspeção. Build/segurança/E2E de produção não executados após o bloqueio.85/85 locais e42/42 hospedados são evidências anteriores do staging, não testes de produção.
