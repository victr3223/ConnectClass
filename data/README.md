# Origem legada preservada — não é armazenamento de runtime

O servidor usa exclusivamente MySQL (`connectclass_final`). Não cria, consulta ou atualiza `usuarios.json`, `mensagens.json` ou `data.json` para executar a aplicação.

Os JSONs existentes foram mantidos como origem histórica privada. A importação é um comando explícito, nunca executado por `npm start`; veja ../README.md. Não apague os originais nem os use como rollback depois de novas gravações SQL. Dados e hashes continuam ignorados pelo Git.
