import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../database.js';
import { createApp } from '../app.js';

test('Pix: preço do catálogo, proteção do histórico e confirmação única', async () => {
  const name = 'guren_pix_test_' + randomUUID().replaceAll('-', '');
  const { db, client } = await connectDatabase('mongodb://127.0.0.1:27017/' + name);
  const token = randomUUID();
  let posted = 0;
  let charge;
  let providerStatus = 'PENDING';
  let providerValue;
  const call = async (path, method, body) => {
    if (path.startsWith('/customers?')) return { data: [] };
    if (path === '/customers' && method === 'POST') return { id: 'cus_mock123' };
    if (path.startsWith('/payments?')) return { data: charge ? [charge] : [] };
    if (path === '/payments' && method === 'POST') {
      posted++;
      charge = { ...body, id: 'pay_mock123' };
      return charge;
    }
    if (path === '/payments/pay_mock123') {
      return { ...charge, value: providerValue ?? charge.value, status: providerStatus };
    }
    if (path === '/payments/pay_mock123/pixQrCode') {
      return {
        encodedImage: 'aW1hZ2Vt',
        payload: 'codigo-mock',
        expirationDate: '2099-12-01 20:00:00'
      };
    }
    assert.fail('Chamada inesperada: ' + path);
  };
  const server = createApp(db, { config: { enabled: true, token }, call }).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = 'http://127.0.0.1:' + server.address().port;
    async function request(path, { body, cookie, webhook } = {}) {
      const res = await fetch(url + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'guren',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(webhook ? { 'asaas-access-token': webhook } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      return {
        status: res.status,
        data: res.status === 204 ? null : await res.json(),
        cookie: res.headers.get('Set-Cookie')?.split(';')[0]
      };
    }
    const details = {
      name: 'Cliente Teste',
      phone: '31999999999',
      password: 'TesteSeguro123',
      confirm: 'TesteSeguro123'
    };
    const registration = await request('/api/auth/register', {
      body: { ...details, cpf: '52998224725' }
    });
    const other = await request('/api/auth/register', { body: { ...details, cpf: '11144477735' } });
    assert.equal(registration.status, 201);
    const { cookie } = registration;
    const body = { planId: 'basico' };
    assert.equal((await request('/api/pix', { body })).status, 401);
    assert.equal((await request('/api/pix', { body: { ...body, cents: 1 }, cookie })).status, 400);

    const concurrent = await Promise.all([
      request('/api/pix', { body, cookie }),
      request('/api/pix', { body, cookie })
    ]);
    const created = concurrent.find(result => result.status === 201);
    assert.ok(created, JSON.stringify(concurrent));
    assert.equal(posted, 1);
    assert.equal(charge.value, 130);
    assert.equal(created.data.pix.payload, 'codigo-mock');
    assert.equal(created.data.status, 'pendente');
    assert.equal((await request('/api/auth/me', { cookie })).data.plan, undefined);
    const detail = '/api/pix/' + created.data.id;
    assert.equal((await request(detail, { cookie: other.cookie })).status, 404);
    assert.deepEqual((await request('/api/pix', { cookie: other.cookie })).data.payments, []);

    const event = {
      event: 'PAYMENT_RECEIVED',
      payment: { id: charge.id, externalReference: charge.externalReference }
    };
    assert.equal((await request('/webhooks/asaas', { body: event })).status, 401);
    assert.equal((await request('/webhooks/asaas', { body: event, webhook: token })).status, 204);
    assert.equal((await request(detail, { cookie })).data.status, 'pendente');

    providerStatus = 'RECEIVED';
    providerValue = 1;
    assert.equal((await request('/webhooks/asaas', { body: event, webhook: token })).status, 409);
    assert.equal((await request('/api/auth/me', { cookie })).data.plan, undefined);

    providerValue = 130;
    const confirmations = await Promise.all([
      request('/webhooks/asaas', { body: event, webhook: token }),
      request('/webhooks/asaas', { body: event, webhook: token }),
      request(detail, { cookie })
    ]);
    assert.deepEqual(
      confirmations.map(result => result.status),
      [204, 204, 200]
    );
    const approved = (await request(detail, { cookie })).data;
    assert.equal(approved.status, 'aprovado');
    assert.equal(approved.pix, undefined);
    assert.equal((await request('/api/auth/me', { cookie })).data.planEndsOn, approved.planEndsOn);
    const account = await db.collection('usuarios').findOne({ _id: registration.data.id });
    assert.deepEqual(account.appliedPixPayments, [created.data.id]);
    assert.equal((await request('/api/pix', { body, cookie })).status, 409);
    assert.equal(posted, 1);
    assert.equal((await fetch(url + '/.env')).status, 404);
    assert.equal((await fetch(url + '/server/.env')).status, 404);
    for (let i = 0; i < 15; i++) {
      const invalid = await request('/api/auth/login', {
        body: { username: 'nao-existe', password: 'invalida' }
      });
      assert.equal(invalid.status, 401);
    }
    assert.equal(
      (await request('/api/auth/login', { body: { username: 'nao-existe', password: 'invalida' } }))
        .status,
      429
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
    await db.dropDatabase();
    await client.close();
  }
});
