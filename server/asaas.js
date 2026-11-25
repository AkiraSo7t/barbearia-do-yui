// Envia as chamadas ao Asaas e interpreta as respostas do provedor de Pix.
import { fail } from './validation.js';

const sandbox = 'https://api-sandbox.asaas.com/v3';

export function asaasConfig(env = process.env) {
  const url = (env.ASAAS_API_URL || sandbox).replace(/\/$/, '');
  const key = env.ASAAS_API_KEY?.trim();
  const token = env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (url !== sandbox) throw new Error('ASAAS_API_URL deve apontar para o Sandbox.');
  if (key && !key.startsWith('$aact_hmlg_'))
    throw new Error('ASAAS_API_KEY deve ser uma chave Sandbox.');
  if (token && (token.length < 32 || token.length > 255 || /\s/.test(token) || token === key)) {
    throw new Error(
      'ASAAS_WEBHOOK_TOKEN deve ser um segredo separado, sem espaços, de 32 a 255 caracteres.'
    );
  }
  return { url, key, token, enabled: Boolean(key && token) };
}

export function createAsaas(config, fetchAsaas = fetch) {
  return async (path, method = 'GET', body) => {
    let response;
    try {
      response = await fetchAsaas(config.url + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'GurenBarbershop/1.0',
          access_token: config.key
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch {
      fail('O Asaas está indisponível. Tente consultar novamente em instantes.', 503);
    }
    if (!response.ok) {
      if (method === 'POST' && [400, 401, 403, 422].includes(response.status)) {
        fail(
          'O Asaas recusou a solicitação. Confira os dados do cadastro e a configuração Sandbox.',
          422
        );
      }
      fail('Não foi possível consultar o Asaas. Tente novamente em instantes.', 503);
    }
    return response.json();
  };
}
