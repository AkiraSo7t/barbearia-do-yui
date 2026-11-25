import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';

export async function connectDatabase(
  uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/guren'
) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db();
  try {
    await db.collection('usuarios').createIndex({ username: 1 }, { unique: true });
    await db.collection('usuarios').createIndex({ cpf: 1 }, { unique: true, sparse: true });
    await db
      .collection('usuarios')
      .createIndex({ name: 1, role: 1, deleted: 1 }, { collation: { locale: 'pt', strength: 2 } });
    await db.collection('sessoes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    // Reservas e bloqueios usam a mesma coleção e o mesmo índice.
    // Duas requisições simultâneas não conseguem ocupar o mesmo horário.
    await db
      .collection('agendamentos')
      .createIndex(
        { date: 1, time: 1 },
        { unique: true, partialFilterExpression: { reserved: true } }
      );
    await db.collection('agendamentos').createIndex({ clientId: 1, date: 1 });
    await db
      .collection('servicos')
      .createIndex({ name: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });
    await db
      .collection('planos')
      .createIndex({ name: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });
    await db.collection('pagamentos').createIndex(
      { clientId: 1 },
      {
        unique: true,
        partialFilterExpression: { open: true }
      }
    );
    await db.collection('pagamentos').createIndex({ asaasId: 1 }, { unique: true, sparse: true });
    await db.collection('pagamentos').createIndex({ clientId: 1, createdAt: -1 });
    await seedCatalog(db);
    await seedDemoStaff(db);
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

// Contas de demonstração da equipe. Uma conta existente nunca tem a senha alterada.
async function seedDemoStaff(db) {
  const accounts = [
    {
      username: 'barbeiro.guren',
      password: 'Barbeiro@123',
      role: 'barbeiro',
      name: 'Barbeiro GUREN'
    },
    {
      username: 'admin.guren',
      password: 'Admin@123',
      role: 'administrador',
      name: 'Administrador GUREN'
    }
  ];
  for (const account of accounts) {
    if (await db.collection('usuarios').findOne({ username: account.username })) continue;
    await db.collection('usuarios').updateOne(
      { username: account.username },
      {
        $setOnInsert: {
          _id: randomUUID(),
          username: account.username,
          name: account.name,
          role: account.role,
          passwordHash: await hashPassword(account.password),
          blocked: false,
          deleted: false,
          demo: true,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}

async function seedCatalog(db) {
  const names = ['Cabelo', 'Barba', 'Sobrancelha', 'Pigmentação'];
  for (const [index, name] of names.entries()) {
    await db
      .collection('servicos')
      .updateOne(
        { _id: String(index) },
        { $setOnInsert: { name, active: true, requiresTerm: index === 3 } },
        { upsert: true }
      );
  }
  const plans = [
    {
      _id: 'basico',
      name: 'Básico',
      cents: 13000,
      benefits: 'Cabelo e barba, uma vez por semana.',
      services: ['0', '1'],
      weeklyLimit: 1
    },
    {
      _id: 'intermediario',
      name: 'Intermediário',
      cents: 15000,
      benefits: 'Cabelo, barba e sobrancelha ou pigmentação, uma vez por semana.',
      services: ['0', '1', '2', '3'],
      weeklyLimit: 1
    },
    {
      _id: 'completo',
      name: 'Completo',
      cents: 20000,
      benefits: 'Os quatro serviços, com uso ilimitado durante a validade.',
      services: ['0', '1', '2', '3'],
      weeklyLimit: null
    }
  ];
  for (const plan of plans) {
    await db
      .collection('planos')
      .updateOne({ _id: plan._id }, { $setOnInsert: { ...plan, active: true } }, { upsert: true });
  }
}

// O navegador usa id. Mantemos também o _id original do MongoDB na resposta.
export function comId(item) {
  return { ...item, id: item._id };
}
