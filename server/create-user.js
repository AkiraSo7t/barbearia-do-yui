// Cria contas da equipe pelo terminal, sem disponibilizar cadastro administrativo público.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { connectDatabase } from './database.js';
import { hashPassword } from './auth.js';
import { randomUUID } from 'node:crypto';

const { values } = parseArgs({
  options: {
    perfil: { type: 'string' },
    nome: { type: 'string' },
    usuario: { type: 'string' }
  }
});
if (
  !['barbeiro', 'administrador'].includes(values.perfil) ||
  !values.nome?.trim() ||
  !values.usuario?.trim()
) {
  console.error(
    'Use npm run criar-usuario -- --perfil administrador --nome "Seu Nome" --usuario seu.usuario'
  );
  process.exit(1);
}
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  }
});
const prompt = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY)
});
let client;
try {
  process.stdout.write('Senha (8 a 128 caracteres): ');
  muted = true;
  const password = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  const connection = await connectDatabase();
  client = connection.client;
  await connection.db.collection('usuarios').insertOne({
    _id: randomUUID(),
    username: values.usuario.trim().toLowerCase(),
    name: values.nome.trim(),
    role: values.perfil,
    passwordHash: await hashPassword(password),
    blocked: false,
    deleted: false,
    createdAt: new Date()
  });
  console.log('Conta criada. Entre no site com o usuário informado.');
} catch (error) {
  console.error(
    error.code === 11000
      ? 'Este usuário já existe.'
      : 'Não foi possível criar a conta: ' + error.message
  );
  process.exitCode = 1;
} finally {
  prompt.close();
  await client?.close();
}
