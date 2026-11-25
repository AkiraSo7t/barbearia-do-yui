import { createHash, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest();

export function matchesWebhookToken(req, expected) {
  const token = req.get('asaas-access-token');
  return Boolean(token && expected && timingSafeEqual(digest(token), digest(expected)));
}
