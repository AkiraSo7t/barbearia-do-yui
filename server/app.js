// Monta a aplicação Express. A ordem dos middlewares define quando cada proteção entra em ação.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountAuth, sessionMiddleware, requireRole } from './auth.js';
import { mountRoutes } from './routes.js';
import { mountPayments } from './payments.js';
import { installSecurity } from './security/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export function createApp(db, paymentOptions) {
  const app = express();
  app.disable('x-powered-by');
  installSecurity(app);
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    if (
      ['POST', 'PATCH'].includes(req.method) &&
      req.path !== '/api/auth/logout' &&
      (!req.body || Array.isArray(req.body) || typeof req.body !== 'object')
    ) {
      return res.status(400).json({ message: 'Envie os campos da operação em JSON.' });
    }
    next();
  });
  app.use(sessionMiddleware(db));
  app.use('/api', (req, res, next) => {
    const role = req.get('X-Panel-Role');
    const userId = req.get('X-Panel-User');
    // Uma aba aberta pode ficar com os dados da conta anterior após outro login.
    if (req.user && ((role && role !== req.user.role) || (userId && userId !== req.user._id))) {
      return res.status(409).json({
        code: 'PANEL_SESSION_CHANGED',
        message: 'A conta ativa mudou. Entre novamente para continuar.'
      });
    }
    next();
  });
  app.get('/api/health', async (req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: 'ok', database: 'MongoDB' });
  });
  mountAuth(app, db);
  mountPayments(app, db, paymentOptions);
  mountRoutes(app, db);
  app.use('/api', (req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
  app.get('/', (req, res) => res.redirect('/Landpage/index.html'));
  app.use('/User/assets', express.static(path.join(root, 'User/assets')));
  for (const [folder, role] of [
    ['User', 'cliente'],
    ['Barbeiro', 'barbeiro'],
    ['Administrador', 'administrador']
  ]) {
    app.use(
      '/' + folder,
      requireRole(role),
      (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      },
      express.static(path.join(root, folder))
    );
  }
  // Apenas as pastas públicas são servidas. Configurações e código do servidor ficam privados.
  for (const folder of ['Landpage', 'login', 'assets'])
    app.use('/' + folder, express.static(path.join(root, folder)));
  app.use((req, res) => res.status(404).send('Página não encontrada.'));
  app.use((error, req, res, next) => {
    let status = error.status || 500;
    let message = error.message;
    if (error.code === 11000) {
      status = 409;
      message =
        'CPF, usuário, nome de catálogo ou horário já cadastrado. Atualize os dados e tente novamente.';
    }
    if (status >= 500) {
      if (!error.expose) console.error(error);
      message = 'Não foi possível concluir a operação.';
    }
    res.status(status).json({ message: error.expose && status >= 500 ? error.message : message });
  });
  return app;
}
