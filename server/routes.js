import { requireRole } from './auth.js';
import { comId } from './database.js';
import { times } from './validation.js';
import { registrarAgenda } from './rotas/agenda.js';
import { registrarClientes } from './rotas/clientes.js';
import { registrarEdicaoDoCatalogo } from './rotas/catalogo.js';
import { registrarPainel } from './rotas/painel.js';

export function mountRoutes(app, db) {
  const services = db.collection('servicos');
  const plans = db.collection('planos');

  app.get('/api/catalog', async (req, res) => {
    const [serviceList, planList] = await Promise.all([
      services.find().toArray(),
      plans.find({ active: true }).toArray()
    ]);
    res.json({ services: serviceList.map(comId), plans: planList.map(comId), times });
  });

  // O catálogo aparece na página inicial. A partir daqui, cada rota exige uma sessão.
  app.use('/api', requireRole());
  registrarAgenda(app, db);
  registrarPainel(app, db);
  registrarClientes(app, db);
  registrarEdicaoDoCatalogo(app, db);
}
