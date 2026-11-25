// Abre a conexão com o banco antes de começar a receber requisições.
import { createApp } from './app.js';
import { asaasConfig } from './asaas.js';
import { connectDatabase } from './database.js';

try {
  const config = asaasConfig();
  const { client, db } = await connectDatabase();
  const app = createApp(db, { config });
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = app.listen(port, host, () =>
    console.log('GUREN disponível em http://' + host + ':' + port)
  );
  server.on('error', async error => {
    console.error('Não foi possível iniciar o servidor:', error.message);
    await client.close();
    process.exitCode = 1;
  });
  function stop() {
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  console.error(
    error.name === 'MongoServerSelectionError'
      ? 'Não foi possível conectar ao MongoDB. Confira MONGODB_URI e o serviço local.'
      : 'Falha na inicialização: ' +
          (error.message.startsWith('ASAAS_')
            ? error.message
            : 'Confira a configuração do servidor.')
  );
  process.exitCode = 1;
}
