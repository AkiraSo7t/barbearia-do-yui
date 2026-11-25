import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export function installSecurity(app) {
  const production = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      referrerPolicy: { policy: 'same-origin' },
      xFrameOptions: { action: 'deny' },
      strictTransportSecurity: production,
      contentSecurityPolicy: {
        directives: {
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: production ? [] : null
        }
      }
    })
  );
  app.post('/api/auth/login', limit(15, true));
  const development = process.env.NODE_ENV === 'development';
  function isLocalRegistration(req) {
    return (
      development &&
      req.method === 'POST' &&
      /^\/api\/auth\/register\/?$/i.test(req.originalUrl.split('?')[0]) &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) &&
      !req.get('X-Forwarded-For') &&
      !req.get('Forwarded')
    );
  }
  const registration = limit(12);
  app.post('/api/auth/register', (req, res, next) => {
    if (isLocalRegistration(req)) return next();
    registration(req, res, next);
  });
  app.post('/api/pix', limit(20));
  const sensitive = limit(240);
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const origin = req.get('Origin');
    if (
      req.get('X-Requested-With') !== 'guren' ||
      (origin && origin !== req.protocol + '://' + req.get('host'))
    ) {
      return res.status(403).json({ message: 'Origem da requisição inválida.' });
    }
    if (isLocalRegistration(req)) return next();
    sensitive(req, res, next);
  });
}

function limit(count, skipSuccessfulRequests = false) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: count,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Muitas tentativas. Aguarde e tente novamente.' }
  });
}
