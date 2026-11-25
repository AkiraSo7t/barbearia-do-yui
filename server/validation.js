// Validações usadas pela API. O navegador também valida para orientar o usuário.
export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  throw error;
}

export function text(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function digits(value) {
  return text(value).replace(/\D/g, '');
}

export function validCpf(value) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  function check(length) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    return ((sum * 10) % 11) % 10 === Number(value[length]);
  }
  return check(9) && check(10);
}

export function profile(data) {
  const name = text(data.name);
  const phone = digits(data.phone);
  const whatsapp = digits(data.whatsapp || data.phone);
  if (name.split(/\s+/).length < 2) fail('Informe nome e sobrenome.');
  if (!/^\d{8,11}$/.test(phone) || !/^\d{8,11}$/.test(whatsapp)) {
    fail('Informe telefone e WhatsApp com 8 a 11 números.');
  }
  return { name, phone, whatsapp };
}

export const times = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00'
];

// Os horários seguem o fuso da barbearia, independentemente do computador do cliente.
export function startsAt(item) {
  return new Date(item.date + 'T' + item.time + ':00-03:00').getTime();
}

export function slot(data) {
  const date = text(data.date, 10);
  const time = text(data.time, 5);
  const day = new Date(date + 'T12:00:00-03:00');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date ||
    day.getUTCDay() === 0 ||
    date.endsWith('-12-25') ||
    !times.includes(time)
  ) {
    fail(
      'Escolha um horário de segunda a sábado, das 7h às 20h, exceto das 12h às 13h e no Natal.'
    );
  }
  if (startsAt({ date, time }) <= Date.now()) fail('Escolha um horário futuro.');
  return { date, time };
}
