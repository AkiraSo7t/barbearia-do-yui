# GUREN — servidor Express

Este projeto usa Node.js, Express e MongoDB local. As páginas e a API são entregues pelo mesmo servidor.

## Executar

Use Node.js 22.9 ou superior e mantenha o MongoDB local em execução.

Na pasta do projeto:

    npm install
    npm start

Abra http://127.0.0.1:3000. Para reiniciar automaticamente ao editar o servidor, use npm run dev.

O padrão é mongodb://127.0.0.1:27017/guren. Para mudar porta, endereço ou banco, use o .env da raiz. As configurações existentes em server/.env continuam funcionando. O arquivo .env é privado e está no .gitignore.

## Contas

O cliente cria sua conta pela página Cadastre-se e entra com nome completo ou CPF e senha. Em caso de nomes iguais, o sistema solicita o CPF.

Enquanto o projeto está em demonstração, a página de login exibe duas contas prontas, criadas automaticamente quando o servidor inicia:

- Barbeiro: `barbeiro.guren` / `Barbeiro@123`
- Administrador: `admin.guren` / `Admin@123`

As contas existentes não têm suas senhas redefinidas ao reiniciar o servidor.

Crie as contas da equipe pelo terminal:

    npm run criar-usuario -- --perfil administrador --nome "Seu Nome" --usuario seu.usuario
    npm run criar-usuario -- --perfil barbeiro --nome "Nome do Barbeiro" --usuario nome.barbeiro

O comando pede a senha e grava somente o hash. Sair da conta fica em Configurações. A opção Lembrar de mim mantém a sessão por até sete dias. Sem essa opção a sessão tem prazo máximo de oito horas.

## Por onde começar a ler

Para acompanhar uma remarcação de horário, siga o mesmo caminho que os dados percorrem.

1. Em `User/index.html`, encontre o formulário `booking-form`. Os campos de data e hora são definidos ali.
2. Em `User/client.js`, procure o evento `submit` desse formulário. Quando existe um agendamento em edição, ele envia o novo horário com o método PATCH.
3. Em `assets/api.js`, a função `request` monta o endereço da API e envia os dados ao Express.
4. Em `server/rotas/agenda.js`, procure `/api/bookings/:id`. A rota verifica quem pode remarcar, aplica o prazo e grava o horário anterior junto com o novo. O campo `updatedAt` evita sobrescrever uma mudança feita por outra pessoa nesse intervalo.
5. Quando o painel recebe a agenda atualizada, `User/avisos.js` usa esse histórico para mostrar a mudança e atualizar o contador de avisos.

Na página inicial, comece por `Landpage/index.html`. Para estudar a entrada no sistema, siga de `login/login/login.js` até `server/auth.js`. Os painéis da equipe começam em `Barbeiro/barber.js` e `Administrador/admin.js`. Ambos usam a navegação de `assets/staff-panel.js`. O relatório semanal fica em `Administrador/relatorio.js`.

No painel do cliente, leia os estilos na ordem em que o HTML os carrega. `User/estrutura.css` define a base, `User/painel.css` organiza os cartões e `User/client.css` aplica a paleta e os avisos.

## Estrutura

- server/index.js inicia a aplicação e encerra a conexão ao sair.
- server/app.js configura Express, acesso às páginas, JSON e tratamento de erros.
- server/database.js conecta ao MongoDB, cria índices e insere o catálogo inicial uma única vez.
- server/auth.js cuida de senhas, sessão e permissões.
- server/validation.js valida os campos e as regras dos horários.
- `server/routes.js` publica o catálogo e registra as rotas que exigem login.
- `server/rotas/agenda.js` trata disponibilidade, reservas, remarcações, faltas e bloqueios de horários.
- `server/rotas/clientes.js` trata perfis, acesso e faltas consecutivas.
- `server/rotas/catalogo.js` permite à administração editar serviços e planos.
- `server/rotas/painel.js` reúne os dados visíveis para cada perfil e registra os aceites de termos.
- `User/checkout.js` mostra o Pix. `server/payments.js` controla a cobrança e `server/asaas.js` se comunica com o provedor.
- assets/api.js faz as requisições das telas. Os painéis consultam os dados novamente ao retornar à janela.
- server/test/api.test.js verifica os fluxos com um banco temporário separado.

Os registros ficam nas coleções usuarios, sessoes, agendamentos, servicos, planos, termos e aceites_termos. Na primeira versão, atendimentos e faltas são estados finais do agendamento, consultados separadamente pela API. Reservas e bloqueios compartilham a coleção agendamentos para que um índice único impeça colisões até com requisições simultâneas.

Contas excluídas são desativadas para preservar o histórico. O usuário perde acesso, mas seu CPF permanece vinculado ao registro.

## API

Todas as operações de escrita exigem o cabeçalho X-Requested-With: guren e JSON. O navegador envia a sessão por cookie HttpOnly. A API aplica as permissões do perfil autenticado.

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | /api/health | Verificar aplicação e MongoDB |
| POST | /api/auth/register | Cadastro de cliente |
| POST | /api/auth/login | Entrar |
| POST | /api/auth/logout | Encerrar sessão |
| GET | /api/auth/me | Consultar usuário autenticado |
| GET | /api/catalog | Consultar planos e serviços |
| GET | /api/panel | Dados do painel conforme o perfil |
| GET | /api/availability | Horários ocupados, sem dados pessoais |
| PATCH | /api/profile | Editar os próprios dados |
| POST | /api/clients | Equipe cadastra cliente com CPF e senha inicial |
| PATCH | /api/clients/:id | Administrador edita os dados do cliente |
| PATCH | /api/clients/:id/access | Administrador bloqueia ou desbloqueia |
| PATCH | /api/clients/:id/plan | Administrador registra plano pretendido, pendente de pagamento |
| DELETE | /api/clients/:id | Administrador desativa a conta |
| POST | /api/bookings | Criar agendamento |
| PATCH | /api/bookings/:id | Remarcar |
| POST | /api/bookings/:id/status | Cancelar, concluir ou registrar falta |
| POST | /api/blocks | Bloquear horário |
| DELETE | /api/blocks/:id | Liberar horário |
| POST / PATCH | /api/services e /api/services/:id | Administrar serviços |
| POST / PATCH | /api/plans e /api/plans/:id | Administrar preços e benefícios |
| POST | /api/terms/:id/accept | Cliente registra aceite da versão vigente |

O servidor assume atendimentos de uma hora, conforme os intervalos já usados no front-end. O fuso é America/Sao_Paulo (UTC-3). Abre de segunda a sábado das 7h às 20h, com intervalo das 12h às 13h e fechamento no Natal. Cancelamento pelo cliente exige 24 horas de antecedência. Remarcação exige cinco horas. Conclusões só podem ser registradas após o início do horário. Faltas exigem dez minutos de tolerância.

Quatro faltas consecutivas impedem novos agendamentos. Ao desbloquear o cliente, o administrador reinicia a contagem considerada para bloqueio. O histórico permanece salvo.

### Horário de teste

Nas abas Agendamentos do Cliente e Agenda do Barbeiro, o controle **Horário de teste** permite escolher uma data e hora simuladas. Ele é compartilhado entre as duas abas no mesmo navegador. Para testar um atendimento marcado às 18h, simule 18h para ver **Concluir** e 18h10 ou depois para ver **Registrar falta**. O botão **Usar horário real** encerra a simulação. O servidor aceita o horário simulado somente fora do modo de produção e o usa nas regras de cancelamento, remarcação, conclusão e falta. Reservas novas continuam exigindo horários futuros reais. Reinicie o servidor após alterar o código do backend.

## Integrações seguintes

Esta etapa conecta cadastro, login, perfis, catálogo e agenda ao banco. Consumo automático de benefícios, bot de WhatsApp, tarefas agendadas e geração de PDF no servidor ficam para a próxima etapa. A escolha de plano pelo administrador apenas registra a intenção pendente de pagamento. Os relatórios existentes exibem atendimentos persistidos e continuam usando a impressão do navegador.

O texto oficial de pigmentação precisa ser fornecido pela barbearia. A API permite consultar termos publicados e registrar aceites. Um documento na coleção termos usa _id (string), serviceId "3", title, content, version (string) e active true. Cada versão deve ter identificação própria e conteúdo preservado. O sistema impede concluir pigmentação sem o aceite vigente.

## Pix com Asaas Sandbox

Preencha ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no .env da raiz. Use uma chave nova da conta Sandbox e um segredo separado de 32 a 255 caracteres, sem espaços. Deixe ASAAS_API_URL em https://api-sandbox.asaas.com/v3. As chaves ficam no servidor. Reinicie com npm start.

Entre como cliente de teste e abra Planos → Quero este plano → Gerar Pix. Use dados de teste no Sandbox. Consulte sua cobrança em Pagamentos. Confirme o recebimento pelo painel Sandbox do Asaas para testar a ativação. O checkout consulta o servidor automaticamente enquanto está aberto e o plano dura 30 dias, com renovação manual.

Para receber eventos com a página fechada, configure o webhook do Sandbox com a URL pública HTTPS terminada em /webhooks/asaas e o mesmo segredo em Auth Token. Assine os eventos de cobrança Pix, incluindo PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE e PAYMENT_DELETED. O servidor confere a situação consultando o Asaas. Sem URL pública, reabra o detalhe do pagamento para consultar a confirmação pelo servidor.

Quando o resultado da criação de uma cobrança é incerto, o servidor procura a referência no Asaas antes de prosseguir. Se ela permanecer sem identificação ou o QR expirar, verifique a cobrança no painel Sandbox antes de emitir outra. Uma cobrança vencida ainda pode ser liquidada pelo Asaas. A administração dessa situação fica no painel do Asaas.

## Testes

    npm test

Os testes usam o MongoDB em 127.0.0.1:27017 e criam um banco guren_test_ com nome aleatório. Somente esse banco é removido ao terminar.

Para publicar com HTTPS, configure NODE_ENV=production para habilitar cookies Secure. Se houver proxy reverso, ajuste a origem e o trust proxy de acordo com a hospedagem.
