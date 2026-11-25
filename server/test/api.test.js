import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../database.js';
import { createApp } from '../app.js';
import { hashPassword } from '../auth.js';

// Cada execução cria seu próprio banco. O banco guren nunca é limpo pelo teste.
test('API com MongoDB: contas, permissões, persistência e concorrência da agenda', async () => {
  const name = 'guren_test_' + randomUUID().replaceAll('-', '');
  const connection = await connectDatabase('mongodb://127.0.0.1:27017/' + name);
  const { db, client } = connection;
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/api';
  const password = 'TesteSeguro123';
  let count = 0;
  async function request(path, method = 'GET', data, cookie, expected = 200) {
    const response = await fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'guren',
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    const body = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    count++;
    return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  // No cadastro de demonstração são exigidos 11 dígitos, mesmo para um CPF fictício.
  const details = {
    name: 'Cliente Teste',
    cpf: '00000000000',
    phone: '31999999999',
    whatsapp: '31999999999',
    password,
    confirm: password
  };
  try {
    await request('/auth/me', 'GET', null, null, 401);
    await request('/auth/register', 'POST', { ...details, cpf: '0000000000' }, null, 400);
    const first = await request(
      '/auth/register',
      'POST',
      { ...details, role: 'administrador' },
      null,
      201
    );
    const cookie = first.cookie;
    assert.equal(first.body.role, 'cliente');
    assert.equal(first.body.passwordHash, undefined);
    assert.equal(
      (await db.collection('usuarios').findOne({ cpf: details.cpf })).password,
      undefined
    );
    await request('/auth/register', 'POST', details, null, 409);
    await request('/auth/login', 'POST', { username: details.cpf, password: 'errada' }, null, 401);
    await request('/auth/login', 'POST', { username: details.cpf, password });
    await request('/services', 'POST', { name: 'Teste' }, cookie, 403);
    const second = await request(
      '/auth/register',
      'POST',
      { ...details, name: 'Outro Cliente', cpf: '11144477735' },
      null,
      201
    );
    const admin = {
      _id: randomUUID(),
      name: 'Administrador Teste',
      username: 'admin.teste',
      role: 'administrador',
      deleted: false,
      blocked: false,
      passwordHash: await hashPassword(password)
    };
    const barber = { ...admin, _id: randomUUID(), username: 'barbeiro.teste', role: 'barbeiro' };
    await db.collection('usuarios').insertMany([admin, barber]);
    const adminSession = await request('/auth/login', 'POST', {
      username: admin.username,
      password
    });
    const barberSession = await request('/auth/login', 'POST', {
      username: barber.username,
      password
    });
    await request(
      '/profile',
      'PATCH',
      {
        name: 'Nome Atualizado',
        phone: '31988888888',
        whatsapp: '31988888888',
        role: 'administrador'
      },
      cookie
    );
    assert.equal((await request('/auth/me', 'GET', null, cookie)).body.role, 'cliente');
    const date = new Date(Date.now() + 4 * 86400000);
    if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    const value = { date: date.toISOString().slice(0, 10), time: '09:00', serviceId: '0' };
    await request('/bookings', 'POST', { ...value, time: '12:00' }, cookie, 400);
    // O índice único é quem garante exclusividade sob concorrência.
    const race = await Promise.all(
      [cookie, second.cookie].map(session =>
        fetch(url + '/bookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'guren',
            Cookie: session
          },
          body: JSON.stringify(value)
        })
      )
    );
    assert.deepEqual(race.map(item => item.status).sort(), [201, 409]);
    const ownerIndex = race[0].status === 201 ? 0 : 1;
    const ownerCookie = [cookie, second.cookie][ownerIndex];
    const otherCookie = [cookie, second.cookie][1 - ownerIndex];
    const booked = await race[ownerIndex].json();
    await request('/bookings/' + booked.id, 'PATCH', { ...value, time: '10:00' }, otherCookie, 403);
    await request('/bookings/' + booked.id, 'PATCH', { ...value, time: '10:00' }, ownerCookie);
    await request('/blocks', 'POST', { ...value, time: '10:00' }, barberSession.cookie, 409);
    const block = await request(
      '/blocks',
      'POST',
      { ...value, time: '11:00' },
      barberSession.cookie,
      201
    );
    await request('/bookings', 'POST', { ...value, time: '11:00' }, ownerCookie, 409);
    await request('/blocks/' + block.body.id, 'DELETE', null, cookie, 403);
    await request('/blocks/' + block.body.id, 'DELETE', null, barberSession.cookie, 204);
    assert.equal((await request('/panel', 'GET', null, otherCookie)).body.bookings.length, 0);
    await request(
      '/bookings/' + booked.id + '/status',
      'POST',
      { status: 'Cancelado' },
      ownerCookie
    );
    await request(
      '/bookings/' + booked.id + '/status',
      'POST',
      { status: 'Cancelado' },
      ownerCookie
    );
    await request('/bookings', 'POST', { ...value, time: '10:00' }, ownerCookie, 201);
    await request(
      '/plans/basico',
      'PATCH',
      { name: 'Básico', cents: 14500, benefits: 'Benefícios atualizados' },
      adminSession.cookie,
      204
    );
    assert.equal(
      (await request('/catalog')).body.plans.find(plan => plan.id === 'basico').cents,
      14500
    );
    const owner = ownerIndex === 0 ? first.body : second.body;
    await db.collection('agendamentos').insertMany(
      Array.from({ length: 4 }, (_, i) => ({
        _id: randomUUID(),
        clientId: owner.id,
        kind: 'booking',
        date: '2020-01-0' + (i + 1),
        time: '08:00',
        status: 'Faltou',
        finalizedAt: new Date(),
        reserved: false
      }))
    );
    await request('/bookings', 'POST', { ...value, time: '14:00' }, ownerCookie, 403);
    await request(
      '/clients/' + owner.id + '/access',
      'PATCH',
      { blocked: false },
      adminSession.cookie,
      204
    );
    const simulatedBooking = await request(
      '/bookings',
      'POST',
      { ...value, time: '14:00' },
      ownerCookie,
      201
    );
    await request(
      '/bookings/' + simulatedBooking.body.id + '/status',
      'POST',
      { status: 'Faltou' },
      barberSession.cookie,
      400
    );
    const simulatedTime = new Date(value.date + 'T14:11:00-03:00').toISOString();
    const simulatedResponse = await fetch(
      url + '/bookings/' + simulatedBooking.body.id + '/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'guren',
          'X-Demo-Time': simulatedTime,
          Cookie: barberSession.cookie
        },
        body: JSON.stringify({ status: 'Faltou' })
      }
    );
    assert.equal(simulatedResponse.status, 200);
    assert.equal((await simulatedResponse.json()).status, 'Faltou');
    await request('/clients/' + owner.id, 'DELETE', null, barberSession.cookie, 403);
    await request('/clients/' + owner.id, 'DELETE', null, adminSession.cookie, 204);
    await request('/auth/me', 'GET', null, ownerCookie, 401);
    await request('/auth/logout', 'POST', null, otherCookie, 204);
    await request('/auth/me', 'GET', null, otherCookie, 401);
    const forbidden = await fetch(url + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(forbidden.status, 403);
    const config = await fetch(url.replace('/api', '') + '/server/.env', { redirect: 'manual' });
    assert.equal(config.status, 404);
    const page = await fetch(url.replace('/api', '') + '/Administrador/index.html', {
      headers: { Cookie: barberSession.cookie }
    });
    assert.equal(page.status, 403);
    console.log(count + ' operações verificadas com banco isolado.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  }
});
