// Controla o ciclo da cobrança Pix, da criação à confirmação do plano.
import { randomUUID } from 'node:crypto';
import { requireRole } from './auth.js';
import { fail, validCpf } from './validation.js';
import { matchesWebhookToken } from './security/webhook.js';
import { asaasConfig, createAsaas } from './asaas.js';

const localDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
const day = date => localDay.format(date);
// O Sandbox também retorna identificadores com segmentos separados por sublinhados.
const providerId = value =>
  typeof value === 'string' && /^pay_[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$/.test(value);
const paid = new Set(['RECEIVED', 'CONFIRMED']);

function summary(payment) {
  const {
    _id: id,
    planId,
    planName,
    cents,
    status,
    createdAt,
    dueDate,
    confirmedAt,
    planEndsOn
  } = payment;
  const expired =
    payment.open &&
    ['pendente', 'vencido'].includes(status) &&
    payment.qrExpiresAt &&
    +payment.qrExpiresAt <= Date.now();
  return {
    id,
    planId,
    planName,
    cents,
    status: expired ? 'expirado' : status,
    createdAt,
    dueDate,
    confirmedAt,
    planEndsOn
  };
}

export function mountPayments(
  app,
  db,
  { config = asaasConfig(), call = createAsaas(config) } = {}
) {
  const payments = db.collection('pagamentos');
  const users = db.collection('usuarios');
  const plans = db.collection('planos');
  const client = requireRole('cliente');
  const staff = requireRole('barbeiro', 'administrador');

  const enabled = () => {
    if (!config.enabled) fail('O Pix Sandbox ainda não está configurado neste servidor.', 503);
  };
  async function storeProviderId(payment, id) {
    if (!providerId(id)) fail('O Asaas retornou uma cobrança sem identificação válida.', 502);
    await payments.updateOne(
      { _id: payment._id, asaasId: { $exists: false } },
      { $set: { asaasId: id } }
    );
    return payments.findOne({ _id: payment._id });
  }

  async function reconcile(payment, asaasId) {
    const remote = await call('/payments/' + asaasId);
    if (
      remote.id !== asaasId ||
      remote.externalReference !== payment._id ||
      remote.billingType !== 'PIX' ||
      typeof remote.value !== 'number' ||
      Math.round(remote.value * 100) !== payment.cents
    ) {
      fail('A cobrança retornada pelo Asaas não corresponde ao pagamento registrado.', 409);
    }
    if (!payment.asaasId) payment = await storeProviderId(payment, asaasId);
    if (payment.asaasId !== asaasId) fail('Identificador de cobrança divergente.', 409);
    if (payment.status === 'aprovado') return payment;
    if (paid.has(remote.status) && !remote.deleted) {
      // A primeira confirmação fixa a validade. Reentregas retomam a operação sem estender o plano.
      const now = new Date();
      payment = await payments.findOneAndUpdate(
        { _id: payment._id },
        [
          {
            $set: {
              confirmedAt: { $ifNull: ['$confirmedAt', now] },
              planEndsOn: { $ifNull: ['$planEndsOn', day(new Date(+now + 29 * 86_400_000))] }
            }
          }
        ],
        { returnDocument: 'after' }
      );
      await users.updateOne(
        { _id: payment.clientId, appliedPixPayments: { $ne: payment._id } },
        {
          $set: {
            plan: payment.planName,
            planId: payment.planId,
            planStartsOn: day(payment.confirmedAt),
            planEndsOn: payment.planEndsOn
          },
          $unset: { pendingPlan: '', pendingPlanId: '' },
          $addToSet: { appliedPixPayments: payment._id }
        }
      );
      await payments.updateOne({ _id: payment._id }, { $set: { status: 'aprovado', open: false } });
    } else {
      const status = remote.deleted
        ? 'cancelado'
        : {
            OVERDUE: 'vencido',
            REFUSED: 'recusado',
            REFUNDED: 'estornado'
          }[remote.status] || 'pendente';
      await payments.updateOne(
        { _id: payment._id, open: true, confirmedAt: { $exists: false } },
        {
          $set: { status, open: !['cancelado', 'recusado', 'estornado'].includes(status) }
        }
      );
    }
    return payments.findOne({ _id: payment._id });
  }

  async function getDetail(payment) {
    if (!payment.open) return summary(payment);
    if (!payment.asaasId) {
      const matches = await call(
        '/payments?' + new URLSearchParams({ externalReference: payment._id })
      );
      if (matches.data?.length !== 1 || !providerId(matches.data[0].id)) return summary(payment);
      payment = await reconcile(payment, matches.data[0].id);
    } else {
      payment = await reconcile(payment, payment.asaasId);
    }
    const result = summary(payment);
    if (!['pendente', 'vencido', 'expirado'].includes(result.status)) return result;
    const { encodedImage, payload, expirationDate } = await call(
      '/payments/' + payment.asaasId + '/pixQrCode'
    );
    const expiration = Date.parse(
      String(expirationDate).replace(' ', 'T') +
        (/(?:Z|[+-]\d\d:\d\d)$/.test(expirationDate) ? '' : '-03:00')
    );
    const expiresAt = Number.isFinite(expiration) ? new Date(expiration) : null;
    if (expiresAt && +expiresAt !== +payment.qrExpiresAt) {
      await payments.updateOne(
        { _id: payment._id, open: true },
        { $set: { qrExpiresAt: expiresAt } }
      );
    }
    if (expiresAt && expiration <= Date.now()) return { ...result, status: 'expirado' };
    if (typeof payload !== 'string' || !/^[a-zA-Z0-9+/=]+$/.test(encodedImage || '')) {
      fail('O Asaas ainda não disponibilizou o código Pix.', 503);
    }
    return { ...result, status: payment.status, pix: { encodedImage, payload, expiresAt } };
  }

  // Leitura e geração sempre usam o ID da sessão, inclusive ao retomar uma cobrança.
  app.get('/api/pix', client, async (req, res) => {
    const history = await payments
      .find({ clientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json({ enabled: config.enabled, payments: history.map(summary) });
  });
  app.get('/api/staff/payments', staff, async (req, res) => {
    const history = await payments.find().sort({ createdAt: -1 }).limit(100).toArray();
    const clientIds = [...new Set(history.map(payment => payment.clientId))];
    const accounts = await users
      .find({ _id: { $in: clientIds }, deleted: false }, { projection: { name: 1 } })
      .toArray();
    const names = new Map(accounts.map(account => [account._id, account.name]));
    res.json(
      history.map(payment => {
        const { planName, cents, status, createdAt } = summary(payment);
        return {
          planName,
          cents,
          status,
          createdAt,
          clientName: names.get(payment.clientId) || 'Cliente sem conta ativa'
        };
      })
    );
  });
  app.get('/api/pix/:id', client, async (req, res) => {
    const payment = await payments.findOne({ _id: req.params.id, clientId: req.user._id });
    if (!payment) fail('Pagamento não encontrado.', 404);
    res.json(config.enabled ? await getDetail(payment) : summary(payment));
  });
  app.post('/api/pix', client, async (req, res) => {
    enabled();
    if (
      typeof req.body.planId !== 'string' ||
      req.body.planId.length > 80 ||
      Object.keys(req.body).length !== 1
    ) {
      fail('Envie somente o identificador do plano.');
    }
    const plan = await plans.findOne({ _id: req.body.planId, active: true });
    if (!plan || !Number.isSafeInteger(plan.cents) || plan.cents <= 0)
      fail('Selecione um plano disponível.');
    if (!validCpf(req.user.cpf)) fail('Seu cadastro precisa ter um CPF válido.');
    const pending = await payments.findOne({ clientId: req.user._id, open: true });
    if (pending) {
      if (pending.planId !== plan._id)
        fail('Já existe um Pix pendente. Consulte a aba Pagamentos.', 409);
      return res.json(await getDetail(pending));
    }

    const now = new Date();
    const payment = {
      _id: randomUUID(),
      clientId: req.user._id,
      planId: plan._id,
      planName: plan.name,
      cents: plan.cents,
      createdAt: now,
      dueDate: day(new Date(+now + 86_400_000)),
      status: 'gerando',
      open: true
    };
    try {
      await payments.insertOne(payment);
    } catch (error) {
      if (error.code !== 11000) throw error;
      fail('Uma cobrança já está sendo criada. Acompanhe pela aba Pagamentos.', 409);
    }
    // O índice garante uma cobrança aberta por cliente. Releia o plano após adquirir essa vaga.
    let sent = false;
    let remote;
    try {
      const user = await users.findOne({ _id: req.user._id });
      if (user.deleted || user.blocked)
        fail('Sua conta não pode contratar um plano no momento.', 403);
      if (user.plan && (!user.planEndsOn || user.planEndsOn >= day(now)))
        fail('Aguarde o término do plano vigente.', 409);
      const matches = await call(
        '/customers?' + new URLSearchParams({ externalReference: user._id })
      );
      let customer = matches.data?.[0]?.id;
      if (!customer) {
        const created = await call('/customers', 'POST', {
          name: user.name,
          cpfCnpj: user.cpf,
          externalReference: user._id,
          notificationDisabled: true
        });
        customer = created.id;
      }
      if (typeof customer !== 'string' || !customer.startsWith('cus_'))
        fail('Cliente indisponível no Asaas.', 502);
      sent = true;
      remote = await call('/payments', 'POST', {
        customer,
        billingType: 'PIX',
        value: payment.cents / 100,
        dueDate: payment.dueDate,
        externalReference: payment._id,
        description: 'Guren • ' + payment.planName
      });
    } catch (error) {
      if (!sent || error.status === 422) {
        await payments.deleteOne({ _id: payment._id, asaasId: { $exists: false } });
      }
      // Após um timeout no POST, a próxima consulta procura pela referência antes de qualquer nova cobrança.
      throw error;
    }
    res.status(201).json(await getDetail(await storeProviderId(payment, remote.id)));
  });

  app.post('/webhooks/asaas', async (req, res) => {
    if (!config.enabled || !matchesWebhookToken(req, config.token))
      fail('Webhook não autorizado.', 401);
    const item = req.body?.payment;
    if (
      typeof req.body?.event !== 'string' ||
      !req.body.event.startsWith('PAYMENT_') ||
      !providerId(item?.id)
    )
      return res.sendStatus(204);
    const references = [{ asaasId: item.id }];
    if (typeof item.externalReference === 'string')
      references.push({ _id: item.externalReference });
    const payment = await payments.findOne({ open: true, $or: references });
    if (payment) await reconcile(payment, item.id);
    res.sendStatus(204);
  });
}
