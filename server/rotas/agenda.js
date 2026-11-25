import { randomUUID } from 'node:crypto';
import { requireRole } from '../auth.js';
import { comId } from '../database.js';
import { fail, text, slot, startsAt } from '../validation.js';
import { dadosDoCliente } from './clientes.js';

const equipe = requireRole('barbeiro', 'administrador');
const HORA_EM_MS = 60 * 60 * 1000;
const TOLERANCIA_DE_ATRASO = 10 * 60 * 1000;

// O horário simulado só vale em desenvolvimento e apenas para as regras temporais.
function currentTime(req) {
  const value = req.get('X-Demo-Time');
  if (
    process.env.NODE_ENV !== 'production' &&
    value &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    const date = Date.parse(value);
    if (Number.isFinite(date)) return date;
  }
  return Date.now();
}

async function booking(db, req) {
  const item = await db.collection('agendamentos').findOne({ _id: req.params.id, kind: 'booking' });
  if (!item) fail('Agendamento não encontrado.', 404);
  if (req.user.role === 'cliente' && item.clientId !== req.user._id) fail('Acesso negado.', 403);
  return item;
}

export function registrarAgenda(app, db) {
  const users = db.collection('usuarios');
  const agenda = db.collection('agendamentos');
  const services = db.collection('servicos');
  // A disponibilidade expõe apenas horários ocupados, sem dados de outros clientes.
  app.get('/api/availability', async (req, res) => {
    const occupied = await agenda
      .find({ reserved: true }, { projection: { date: 1, time: 1 } })
      .toArray();
    res.json(occupied.map(comId));
  });

  app.post('/api/bookings', async (req, res) => {
    const ownerId = req.user.role === 'cliente' ? req.user._id : text(req.body.clientId);
    const owner = await users.findOne({ _id: ownerId, role: 'cliente', deleted: false });
    if (!owner) fail('Selecione um cliente cadastrado.');
    if ((await dadosDoCliente(db, owner)).blocked)
      fail('Este cliente está impedido de fazer novos agendamentos.', 403);
    const service = await services.findOne({ _id: text(req.body.serviceId), active: true });
    if (!service) fail('Selecione um serviço disponível.');
    const item = {
      _id: randomUUID(),
      ...slot(req.body),
      kind: 'booking',
      reserved: true,
      clientId: owner._id,
      client: owner.name,
      serviceId: service._id,
      service: service.name,
      status: 'Agendado',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await agenda.insertOne(item);
    res.status(201).json(comId(item));
  });

  app.patch('/api/bookings/:id', async (req, res) => {
    const item = await booking(db, req);
    if (!item.reserved) fail('Este agendamento já foi encerrado.', 409);
    if (req.user.role === 'cliente' && startsAt(item) - currentTime(req) < 5 * HORA_EM_MS) {
      fail('A remarcação exige pelo menos 5 horas de antecedência.');
    }
    const updated = { ...slot(req.body), status: 'Remarcado', updatedAt: new Date() };
    if (updated.date === item.date && updated.time === item.time) fail('Escolha outro horário.');
    const change = {
      previousDate: item.date,
      previousTime: item.time,
      date: updated.date,
      time: updated.time,
      changedAt: updated.updatedAt,
      byStaff: req.user.role !== 'cliente'
    };
    const result = await agenda.updateOne(
      { _id: item._id, reserved: true, updatedAt: item.updatedAt },
      { $set: updated, $push: { rescheduling: change } }
    );
    if (!result.matchedCount) fail('O agendamento foi alterado. Atualize a página.', 409);
    res.json(comId({ ...item, ...updated }));
  });

  app.post('/api/bookings/:id/status', async (req, res) => {
    const item = await booking(db, req);
    const status = req.body.status;
    if (!['Cancelado', 'Concluído', 'Faltou'].includes(status)) fail('Situação inválida.');
    if (item.status === status) return res.json(comId(item));
    if (!item.reserved) fail('Este agendamento já foi encerrado.', 409);
    if (req.user.role === 'cliente') {
      if (status !== 'Cancelado') fail('Apenas a equipe registra atendimentos e faltas.', 403);
      if (startsAt(item) - currentTime(req) < 24 * HORA_EM_MS)
        fail('O cancelamento exige um dia de antecedência.');
    }
    if (status !== 'Cancelado' && startsAt(item) > currentTime(req))
      fail('O horário do atendimento ainda não começou.');
    if (status === 'Faltou' && startsAt(item) + TOLERANCIA_DE_ATRASO > currentTime(req))
      fail('A tolerância de atraso é de 10 minutos.');
    if (status === 'Concluído') {
      const service = await services.findOne({ _id: item.serviceId });
      if (service?.requiresTerm) {
        const term = await db
          .collection('termos')
          .findOne({ serviceId: item.serviceId, active: true });
        const accepted =
          term &&
          (await db
            .collection('aceites_termos')
            .findOne({ clientId: item.clientId, termId: term._id, version: term.version }));
        if (!accepted) fail('O cliente precisa aceitar a versão vigente do termo de pigmentação.');
      }
    }
    const result = await agenda.updateOne(
      { _id: item._id, reserved: true },
      { $set: { status, reserved: false, finalizedAt: new Date(), updatedAt: new Date() } }
    );
    if (!result.matchedCount) fail('O agendamento foi alterado. Atualize a página.', 409);
    res.json({ ...comId(item), status, reserved: false });
  });

  app.post('/api/blocks', equipe, async (req, res) => {
    const item = {
      _id: randomUUID(),
      ...slot(req.body),
      kind: 'block',
      reserved: true,
      reason: text(req.body.reason, 300)
    };
    await agenda.insertOne(item);
    res.status(201).json(comId(item));
  });
  app.delete('/api/blocks/:id', equipe, async (req, res) => {
    const result = await agenda.deleteOne({ _id: req.params.id, kind: 'block' });
    if (!result.deletedCount) fail('Bloqueio não encontrado.', 404);
    res.sendStatus(204);
  });
}
