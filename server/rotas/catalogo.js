import { randomUUID } from 'node:crypto';
import { requireRole } from '../auth.js';
import { comId } from '../database.js';
import { fail, text } from '../validation.js';

// A consulta pública fica em routes.js. Aqui só a administração altera o catálogo.
export function registrarEdicaoDoCatalogo(app, db) {
  const admin = requireRole('administrador');
  const services = db.collection('servicos');
  const plans = db.collection('planos');
  app.post('/api/services', admin, async (req, res) => {
    const name = text(req.body.name);
    if (name.length < 2) fail('Informe o nome do serviço.');
    const item = { _id: randomUUID(), name, active: true, requiresTerm: false };
    await services.insertOne(item);
    res.status(201).json(comId(item));
  });
  app.patch('/api/services/:id', admin, async (req, res) => {
    const updates = {};
    if ('name' in req.body) {
      updates.name = text(req.body.name);
      if (updates.name.length < 2) fail('Informe o nome do serviço.');
    }
    if ('active' in req.body) {
      if (typeof req.body.active !== 'boolean') fail('Situação inválida.');
      updates.active = req.body.active;
    }
    const result = await services.updateOne({ _id: req.params.id }, { $set: updates });
    if (!result.matchedCount) fail('Serviço não encontrado.', 404);
    res.sendStatus(204);
  });

  app.post('/api/plans', admin, async (req, res) => {
    const fields = lerPlano(req.body);
    await plans.insertOne({ _id: randomUUID(), ...fields, active: true });
    res.sendStatus(204);
  });

  app.patch('/api/plans/:id', admin, async (req, res) => {
    const fields = lerPlano(req.body);
    const result = await plans.updateOne({ _id: req.params.id }, { $set: fields });
    if (!result.matchedCount) fail('Plano não encontrado.', 404);
    res.sendStatus(204);
  });
}

// O preço chega em centavos para que os cálculos usem números inteiros.
function lerPlano(body) {
  const name = text(body.name, 80);
  const benefits = text(body.benefits, 1000);
  const cents = body.cents;
  const precoValido = Number.isSafeInteger(cents) && cents > 0 && cents <= 99999999999;
  if (!name || !benefits || !precoValido) fail('Informe nome, benefícios e valor do plano.');
  return { name, benefits, cents };
}
