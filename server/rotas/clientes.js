import { createAccount, publicUser, requireRole } from '../auth.js';
import { fail, profile, text } from '../validation.js';

const equipe = requireRole('barbeiro', 'administrador');
const administrador = requireRole('administrador');

// As faltas são calculadas a partir dos registros finais, sem duplicar contadores.
export async function dadosDoCliente(db, user) {
  const history = await db
    .collection('agendamentos')
    .find({
      clientId: user._id,
      status: { $in: ['Concluído', 'Faltou'] },
      finalizedAt: { $gt: user.absencesResetAt || new Date(0) }
    })
    .sort({ date: -1, time: -1 })
    .toArray();
  const firstAttendance = history.findIndex(item => item.status === 'Concluído');
  const consecutiveAbsences = firstAttendance < 0 ? history.length : firstAttendance;
  return {
    ...publicUser(user),
    consecutiveAbsences,
    blocked: user.blocked || consecutiveAbsences >= 4
  };
}

export function registrarClientes(app, db) {
  const users = db.collection('usuarios');
  const plans = db.collection('planos');
  app.patch('/api/profile', async (req, res) => {
    await users.updateOne({ _id: req.user._id }, { $set: profile(req.body) });
    res.json(publicUser(await users.findOne({ _id: req.user._id })));
  });

  app.post('/api/clients', equipe, async (req, res) => {
    res.status(201).json(publicUser(await createAccount(db, req.body)));
  });
  app.patch('/api/clients/:id', administrador, async (req, res) => {
    const user = await users.findOne({ _id: req.params.id, role: 'cliente', deleted: false });
    if (!user) fail('Cliente não encontrado.', 404);
    await users.updateOne({ _id: user._id }, { $set: profile(req.body) });
    res.json(publicUser(await users.findOne({ _id: user._id })));
  });
  app.patch('/api/clients/:id/access', administrador, async (req, res) => {
    if (typeof req.body.blocked !== 'boolean') fail('Informe o estado do bloqueio.');
    const result = await users.updateOne(
      { _id: req.params.id, role: 'cliente', deleted: false },
      {
        $set: {
          blocked: req.body.blocked,
          ...(!req.body.blocked ? { absencesResetAt: new Date() } : {})
        }
      }
    );
    if (!result.matchedCount) fail('Cliente não encontrado.', 404);
    res.sendStatus(204);
  });
  app.patch('/api/clients/:id/plan', administrador, async (req, res) => {
    const client = await users.findOne({ _id: req.params.id, role: 'cliente', deleted: false });
    if (!client) fail('Cliente não encontrado.', 404);
    if (client.planEndsOn && client.planEndsOn >= new Date().toISOString().slice(0, 10)) {
      fail('Aguarde o término do plano vigente.');
    }
    const plan = await plans.findOne({ name: text(req.body.plan), active: true });
    if (!plan) fail('Selecione um plano disponível.');
    await users.updateOne(
      { _id: client._id },
      { $set: { pendingPlan: plan.name, pendingPlanId: plan._id } }
    );
    res.sendStatus(204);
  });
  app.delete('/api/clients/:id', administrador, async (req, res) => {
    // Desativa a conta e preserva o histórico de atendimentos e pagamentos.
    const result = await users.updateOne(
      { _id: req.params.id, role: 'cliente', deleted: false },
      {
        $set: { deleted: true, blocked: true, deletedAt: new Date() }
      }
    );
    if (!result.matchedCount) fail('Cliente não encontrado.', 404);
    await db.collection('sessoes').deleteMany({ userId: req.params.id });
    res.sendStatus(204);
  });
}
