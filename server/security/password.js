import bcrypt from 'bcryptjs';
import { createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fail } from '../validation.js';

const scrypt = promisify(derive);
const prefix = 'bcrypt-sha256:';
// O resumo preserva toda a senha, inclusive acima do limite de 72 bytes do Bcrypt.
const bcryptInput = password => createHash('sha256').update(password).digest('base64');

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    fail('A senha precisa ter entre 8 e 128 caracteres.');
  }
  return prefix + (await bcrypt.hash(bcryptInput(password), 12));
}

export async function checkPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  if (encoded.startsWith(prefix))
    return bcrypt.compare(bcryptInput(password), encoded.slice(prefix.length));
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) return false;
  const [salt, saved] = encoded.split(':');
  return timingSafeEqual(await scrypt(password, salt, 64), Buffer.from(saved, 'hex'));
}

export const needsUpgrade = encoded => !encoded.startsWith(prefix);
