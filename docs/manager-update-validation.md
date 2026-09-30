# Atualização do gestor e botão — 2026-09-30

Alterações preparadas na raiz oficial e revalidadas após o operador concluir a troca real pelo script seguro. Nenhuma senha, identidade privada ou dado do banco faz parte deste relatório.

## Validado

- `npm run verify`: 52/52 testes passaram, incluindo cinco da troca segura e dois do estado do botão; sintaxe de 36 arquivos JS aprovada.
- `npm run test:docker`: 10/10 passaram. Novo gestor fictício criado e autenticado no MySQL Docker; Dashboard aprovado antes de desativar a conta antiga. Login e sessão antiga bloqueados. Alunos, mensagens e respostas preservados. Novo login e bloqueio antigo continuam após restart, recriação somente do app e down/up, sem remover volumes.
- Conta real no Docker: nova conta confirmada como `gestor`, ativa e com formato scrypt nativo; antiga com marcador de desativação. Login HTTP antigo recusado (401), busca de usuário antiga por ID recusada e Dashboard sem autenticação recusado. O operador informou conclusão do script: seu fluxo exige login real e Dashboard aprovados antes da desativação. A senha não ficou disponível para uma segunda tentativa de login deste executor; a autenticação foi repetida com contas fictícias nas suítes.
- Navegador em base nativa de testes isolada: campo vazio/espaços desabilita o botão e mantém aparência inicial; texto válido habilita e escurece somente o fundo. Retornar ao vazio restaura o estado. Dimensões/posição iguais (122×50 px), foco visível por teclado e console sem erros. Capturas locais ficam fora do Git. Transição de 150 ms respeita redução de movimento.
- Build e subida da stack principal repetidos e aprovados: app e MySQL healthy. Restart após a troca confirmou fingerprint de todos os usuários (incluindo os gestores), conversas e mensagens e data de criação do volume idênticos; health HTTP 200. Nenhum volume recriado ou removido.
- Diff check e varredura de candidatos públicos aprovados; configurações privadas, senhas e identidade da conta real fora do Git. Demais HTML, CSS do gestor, controladores do gestor/renderizador e logo sem alterações.

## Implementação

`server/replace-manager.js` reutiliza hash/verificação scrypt existentes. Todas as entradas SQL são parâmetros. A troca usa lock compartilhado com o bootstrap, valida contas e impede reutilizar uma conta de aluno. Cria/confere o destino, testa login/Dashboard HTTP e só então desativa exatamente o gestor antigo. O marcador de desativação não é senha nem hash autenticável. Seu ID fica preservado para as chaves estrangeiras e respostas; a busca de usuário por ID também bloqueia sessões anteriores. Falhas de validação mantêm a conta antiga; a confirmação posterior tem recuperação da mudança exata. A repetição validada não redefine senha nem duplica contas.

`scripts/replace-manager.js` recebe variáveis temporárias ou entrada padrão privada e recusa banco fora do Compose. `scripts/replace-manager.ps1` solicita senha com entrada oculta, usa UTF-8 e a envia somente pela entrada padrão do processo no container. Não grava senha em arquivo, argumentos, Compose ou logs. Operação geral descrita no README, sem valores privados.

O botão mantém fundo original quando vazio. Uma sombra interna translúcida escurece o fundo válido com transição, preservando texto, hover, foco e layout. O atributo disabled continua sendo usado.

## Publicação e limites

As suítes foram repetidas após a confirmação do operador: 62/62 testes aprovados, sem falha crítica. Release preparada para commit/push autorizado na `main` do repositório existente, após a revisão final do índice e de segredos. Nenhuma imagem publicada em registry e nenhum deploy externo executado. Docker local pronto; domínio/HTTPS, capacidade e restauração na VPS precisam ser validados quando houver deploy autorizado. A evidência de navegador acima é da validação anterior do botão; nenhum design foi alterado nesta retomada.
