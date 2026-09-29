# Verificação da release — 29/09/2026

- `npm run verify`: PASSOU, sintaxe de 25 arquivos JS, contratos HTML/assets, sanidade CSS/JSON e 41/41 testes; zero falhas ou testes ignorados.
- Inclui cadastro e login, Pergunta/Reclamação/Sugestão, recebimento/resposta/status pelo gestor, resposta no histórico do aluno, dashboard/filtros, logout e autorização por papel e autoria.
- Inclui testes unitários, contratos de UI, integração com MySQL e E2E HTTP com encerramento e criação de outro processo Node. Os dados persistem; sessões antigas são invalidadas; nenhum JSON de runtime é criado.
- Conexão real da aplicação confirmada em MySQL 9.7.1, com usuário próprio e cinco tabelas InnoDB. Os testes verificam que a conta de teste não acessa a base principal nem executa DDL.
- Testes usam dados fictícios em banco isolado. Nenhum registro, senha ou hash da base principal faz parte desta evidência.

## Limites

E2E HTTP não substitui validação visual em navegador. A ferramenta de navegador estava indisponível; design e funcionalidades aprovados não foram modificados. O workflow de CI está preparado, mas sua execução remota depende da publicação no GitHub. Deploy, restauração de backup e testes de carga não fazem parte desta release do código.
