// Cria contas, verifica senhas e recupera a sessão que identifica o usuário em cada pedido.
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { fail, text, digits, profile } from './validation.js';
import { hashPassword, checkPassword, needsUpgrade } from './security/password.js';
export { hashPassword } from './security/password.js';

const cookieName = 'guren_session';

export function publicUser(user) {
  const { passwordHash, appliedPixPayments, ...safe } = user;
  return { ...safe, id: user._id };
}

export async function createAccount(db, data, role = 'cliente') {
  const cpf = digits(data.cpf);
  const details = profile(data);
  if (!/^\d{11}$/.test(cpf)) fail('Informe os 11 números do CPF.');
  const username = role === 'cliente' ? cpf : text(data.username).toLowerCase();
  if (!username) fail('Informe o usuário.');
  const user = {
    _id: randomUUID(),
    ...details,
    cpf,
    username,
    role,
    passwordHash: await hashPassword(data.password),
    blocked: false,
    deleted: false,
    createdAt: new Date()
  };
  await db.collection('usuarios').insertOne(user);
  return user;
}

function digest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(db, user, res, remember = false) {
  const token = randomBytes(32).toString('hex');
  const duration = (remember ? 7 * 24 : 8) * 60 * 60 * 1000;
  await db.collection('sessoes').insertOne({
    _id: digest(token),
    userId: user._id,
    expiresAt: new Date(Date.now() + duration)
  });
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(remember ? { maxAge: duration } : {})
  });
}

export function sessionMiddleware(db) {
  return async (req, res, next) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = await db
        .collection('sessoes')
        .findOne({ _id: digest(token), expiresAt: { $gt: new Date() } });
      if (session)
        req.user = await db.collection('usuarios').findOne({ _id: session.userId, deleted: false });
      req.sessionId = digest(token);
    }
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (!req.originalUrl.startsWith('/api/')) return res.redirect('/login/login/login.html');
      return res.status(401).json({ message: 'Entre na sua conta para continuar.' });
    }
    if (roles.length && !roles.includes(req.user.role))
      return res.status(403).json({ message: 'Seu perfil não pode realizar esta ação.' });
    next();
  };
}

export function mountAuth(app, db) {
  app.post('/api/auth/login', async (req, res) => {
    const identifier = text(req.body.username);
    const password = req.body.password;
    if (!identifier || typeof password !== 'string' || password.length > 128)
      fail('Usuário ou senha incorretos.', 401);
    const username = /^[\d.\s-]+$/.test(identifier) ? digits(identifier) : identifier.toLowerCase();
    const users = db.collection('usuarios');
    let user = await users.findOne({ username, deleted: false });
    if (!user && /[^\d.\s-]/.test(identifier)) {
      const matches = await users
        .find({ name: identifier, role: 'cliente', deleted: false })
        .collation({ locale: 'pt', strength: 2 })
        .limit(2)
        .toArray();
      if (matches.length > 1) fail('Use seu CPF para entrar.', 401);
      user = matches[0];
    }
    if (!user || !(await checkPassword(password, user.passwordHash)))
      fail('Usuário ou senha incorretos.', 401);
    if (needsUpgrade(user.passwordHash)) {
      await db.collection('usuarios').updateOne(
        { _id: user._id, passwordHash: user.passwordHash },
        {
          $set: { passwordHash: await hashPassword(password) }
        }
      );
    }
    if (req.sessionId) await db.collection('sessoes').deleteOne({ _id: req.sessionId });
    await createSession(db, user, res, req.body.remember === true);
    res.json(publicUser(user));
  });
  app.post('/api/auth/register', async (req, res) => {
    if (req.body.password !== req.body.confirm) fail('As senhas não coincidem.');
    const user = await createAccount(db, req.body);
    await createSession(db, user, res);
    res.status(201).json(publicUser(user));
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (req.sessionId) await db.collection('sessoes').deleteOne({ _id: req.sessionId });
    res.clearCookie(cookieName, { path: '/' });
    res.sendStatus(204);
  });
  app.get('/api/auth/me', requireRole(), (req, res) => res.json(publicUser(req.user)));
}
