# ConnectClass

Plataforma escolar de comunicação entre alunos e secretaria. As Fases 1 e 2 estão concluídas: autenticação, sessão, controle de acesso e histórico persistente de mensagens.

## Requisitos

- Node.js 20 ou superior.

Não há dependências de terceiros para instalar nesta fase.

## Executar localmente

No PowerShell, dentro de `tcc1`:

```powershell
$env:CONNECTCLASS_GESTOR_PASSWORD = "defina-uma-senha-local-segura"
npm start
```

Abra `http://localhost:8080`.

Na primeira inicialização, o servidor cria o gestor inicial:

- E-mail: `gestor@connectclass.local`
- Senha: o valor de `CONNECTCLASS_GESTOR_PASSWORD`; se a variável não for definida, uma senha temporária aleatória é exibida uma única vez no terminal.

Nenhuma senha é versionada ou armazenada em texto puro. O arquivo de usuários contém somente hashes `scrypt`.

## Testes

```powershell
npm test
```

A suíte cobre cadastro, validações, RA/e-mail duplicados, hash, login por RA ou e-mail, persistência após reinício, bloqueio de acesso entre aluno e gestor e histórico de mensagens.

## Dados e segurança

- `data/usuarios.json`: usuários e hashes de senha.
- `data/mensagens.json`: mensagens e histórico persistente dos alunos.
- Os dois arquivos são criados pelo servidor e ignorados pelo Git.
- A sessão usa cookie `HttpOnly`, `SameSite=Strict`, expira em 8 horas (ou 7 dias com “Lembrar-me”) e fica em memória; portanto, reiniciar o servidor encerra as sessões, mas preserva os dados.
- Em produção, defina `NODE_ENV=production` e sirva a aplicação por HTTPS para que o cookie receba também o atributo `Secure`.

## Escopo pendente

O painel e filtros do gestor pertencem à Fase 3; respostas, à Fase 4; e o botão de logout, à Fase 5.
