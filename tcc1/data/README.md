# Dados históricos

O runtime agora persiste exclusivamente em MySQL. Esta pasta não recebe usuarios.json nem mensagens.json; não há fallback de arquivos.

Preserve as fontes JSON antigas e seus backups privados fora do Git. A importação é explícita, transacional e idempotente: veja ../README.md. Não inicie uma base vazia como se fosse a original nem apague dados para contornar falhas.

Testes de integração usam somente connectclass_test, com conta própria e limpeza controlada. Arquivos JSON fictícios são criados em diretórios temporários apenas para testar o importador, nunca como persistência da aplicação.
