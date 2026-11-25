import { publicUser, requireRole } from '../auth.js';
import { comId } from '../database.js';
import { fail } from '../validation.js';
import { dadosDoCliente } from './clientes.js';

// O filtro pelo cliente limita tanto a agenda quanto os aceites que ele pode consultar.
export function registrarPainel(app, db) {
  const users = db.collection('usuarios');
  const agenda = db.collection('agendamentos');
  const services = db.collection('servicos');
  const plans = db.collection('planos');
  app.get('/api/panel', async (req, res) => {
    const isClient = req.user.role === 'cliente';
    const filter = isClient ? { clientId: req.user._id } : {};
    const [bookings, blocks, clientList, serviceList, planList, occupied, terms, acceptances] =
      await Promise.all([
        agenda
          .find({ ...filter, kind: 'booking' })
          .sort({ date: 1, time: 1 })
          .toArray(),
        isClient ? [] : agenda.find({ kind: 'block', reserved: true }).toArray(),
        isClient ? [] : users.find({ role: 'cliente', deleted: false }).toArray(),
        services.find().toArray(),
        plans.find({ active: true }).toArray(),
        agenda.find({ reserved: true }, { projection: { date: 1, time: 1 } }).toArray(),
        db.collection('termos').find({ active: true }).toArray(),
        db.collection('aceites_termos').find(filter).toArray()
      ]);
    const clientData = await Promise.all(clientList.map(user => dadosDoCliente(db, user)));
    res.json({
      me: req.user.role === 'cliente' ? await dadosDoCliente(db, req.user) : publicUser(req.user),
      bookings: bookings.map(comId),
      blocks: blocks.map(comId),
      clients: clientData,
      attendances: bookings.filter(item => item.status === 'Concluído').map(comId),
      services: serviceList.map(comId),
      plans: planList.map(comId),
      occupied: occupied.map(comId),
      terms: terms.map(comId),
      acceptances: acceptances.map(comId)
    });
  });

  app.post('/api/terms/:id/accept', requireRole('cliente'), async (req, res) => {
    const term = await db.collection('termos').findOne({ _id: req.params.id, active: true });
    if (!term || req.body.version !== term.version || req.body.accepted !== true)
      fail('Leia e aceite a versão vigente do termo.');
    const id = req.user._id + ':' + term._id + ':' + term.version;
    await db.collection('aceites_termos').updateOne(
      { _id: id },
      {
        $setOnInsert: {
          clientId: req.user._id,
          termId: term._id,
          version: term.version,
          acceptedAt: new Date(),
          accepted: true
        }
      },
      { upsert: true }
    );
    res.sendStatus(204);
  });
}
