# ConnectClass

Plataforma escolar de comunicação entre alunos e secretaria, com Node.js, MySQL e frontend HTML/CSS/JavaScript.

O aplicativo está em **[tcc1](tcc1/README.md)**. Consulte esse guia para instalação, configuração privada do MySQL, execução e testes. Não há etapa de build.

```sh
cd tcc1
npm ci --ignore-scripts
# Configure o MySQL seguindo tcc1/README.md antes de executar:
npm run verify
npm start
```

O repositório contém código, schema e exemplos vazios de configuração, nunca a base de dados ou credenciais reais. Os testes de integração usam exclusivamente `connectclass_test`.

Validação local de release em 29/09/2026: **41 testes passaram**, incluindo E2E HTTP com reinício do processo e persistência MySQL. Consulte [a verificação da release](tcc1/docs/release.md) para o escopo e os limites.

As capturas e a pasta `ConnectClass Web App Design` são referências históricas do protótipo, com conteúdo demonstrativo; não fazem parte do runtime.
