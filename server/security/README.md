# Segurança do servidor Guren

- **index.js** aplica o Helmet, a política de conteúdo (CSP), a proteção de origem e os limites do Express Rate Limit. A CSP autoriza os scripts locais, as fontes usadas pelo site e a imagem Pix gerada pelo Asaas. O site usa estilos dinâmicos, então a política permite estilos inline.
- **password.js** usa bcryptjs para armazenar hashes com salt e custo 12. O SHA-256 anterior ao Bcrypt permite usar senhas com mais de 72 bytes. Contas com hash scrypt continuam funcionando e migram depois de um login correto. Um hash não permite recuperar a senha original.
- **webhook.js** compara o segredo do cabeçalho do Asaas em tempo constante. O servidor ainda consulta a cobrança no Asaas e verifica o identificador, o valor, a referência interna e o meio de pagamento antes de ativar o plano.

A autenticação em `server/auth.js` comprova quem entrou. O navegador recebe um cookie HttpOnly e o servidor busca a sessão no MongoDB. A autorização verifica o perfil da conta e, no Pix, exige que o pagamento pertença à própria sessão. As funções compartilhadas de validação ficam em `server/validation.js`.

O navegador envia só o ID escolhido. O servidor busca o preço em centavos no catálogo e reserva uma vaga para a cobrança no MongoDB. O índice impede duas cobranças em aberto para o mesmo cliente. Uma confirmação repetida mantém a primeira data de ativação e a mesma validade.

O `.env` fica fora das pastas publicadas e é ignorado pelo Git. Ele guarda texto simples e não criptografa segredos. Restrinja o acesso ao arquivo. Configure um token próprio para o webhook, separado da chave do Asaas.

Execute `npm test` com o MongoDB local para verificar acesso sem sessão, perfis, dados inválidos, valor alterado pelo navegador, repetição de cobrança e confirmação duplicada. Para verificar o limite manualmente em desenvolvimento, faça tentativas de login inválidas até a API responder com HTTP 429. As respostas às tentativas de acesso a arquivos privados, como `/.env`, devem ser HTTP 404. Use a conta Sandbox e as instruções no README principal para testar a entrega do webhook por HTTPS.

O limite de requisições fica na memória de cada processo. Se o projeto usar várias instâncias, use um armazenamento compartilhado e configure o proxy conforme a hospedagem. As contas prontas pertencem ao ambiente de demonstração. Ao testar o webhook, exponha apenas a rota necessária.

