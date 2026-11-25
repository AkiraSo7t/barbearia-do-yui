// Confere os campos do cadastro e envia a solicitação de criação de conta.
(() => {
  const form = document.getElementById('signup-form');
  const name = document.getElementById('signup-name');
  const phone = document.getElementById('signup-phone');
  const whatsapp = document.getElementById('signup-whatsapp');
  const cpf = document.getElementById('signup-cpf');
  const password = document.getElementById('signup-password');
  const confirm = document.getElementById('signup-confirm');
  const fields = [name, phone, whatsapp, cpf, password, confirm];
  const status = document.querySelector('.form-status');
  const digits = value => value.replace(/\D/g, '');
  const applyMask = (field, maxDigits, formatter) => {
    field.addEventListener('input', () => {
      const caret = field.selectionStart ?? field.value.length;
      const digitsBeforeCaret = digits(field.value.slice(0, caret)).length;
      const formatted = formatter(digits(field.value).slice(0, maxDigits));
      field.value = formatted;
      let nextCaret = 0;
      let counted = 0;
      while (nextCaret < formatted.length && counted < digitsBeforeCaret) {
        if (/\d/.test(formatted[nextCaret])) counted++;
        nextCaret++;
      }
      field.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const formatPhone = value => {
    if (value.length <= 2) return value ? `(${value}` : '';
    const area = `(${value.slice(0, 2)}) `;
    if (value.length <= 6) return area + value.slice(2);
    const split = value.length === 11 ? 7 : 6;
    return area + value.slice(2, split) + '-' + value.slice(split);
  };
  applyMask(phone, 11, formatPhone);
  applyMask(whatsapp, 11, value => value);
  applyMask(cpf, 11, value => {
    let formatted = value.slice(0, 3);
    if (value.length > 3) formatted += '.' + value.slice(3, 6);
    if (value.length > 6) formatted += '.' + value.slice(6, 9);
    if (value.length > 9) formatted += '-' + value.slice(9, 11);
    return formatted;
  });
  fields.forEach(field =>
    field.addEventListener('input', () => {
      showFieldError(field);
      status.hidden = true;
    })
  );
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const phoneDigits = digits(phone.value);
    const whatsappDigits = digits(whatsapp.value);
    const errors = [
      [
        name,
        !name.value.trim() || name.value.trim().split(/\s+/).length < 2
          ? 'Informe seu nome e sobrenome.'
          : ''
      ],
      [
        phone,
        phoneDigits.length < 8 || phoneDigits.length > 11
          ? 'Digite um telefone com 8 a 11 números.'
          : ''
      ],
      [
        whatsapp,
        whatsappDigits.length < 8 || whatsappDigits.length > 11
          ? 'Digite um WhatsApp com 8 a 11 números.'
          : ''
      ],
      [cpf, digits(cpf.value).length !== 11 ? 'Informe os 11 números do CPF.' : ''],
      [password, password.value.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : ''],
      [confirm, confirm.value !== password.value ? 'As senhas não coincidem.' : '']
    ];
    errors.forEach(([field, message]) => showFieldError(field, message));
    const first = errors.find(([, message]) => message);
    if (first) {
      first[0].focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await gurenApi.request('/auth/register', 'POST', {
        name: name.value,
        phone: phone.value,
        whatsapp: whatsapp.value,
        cpf: cpf.value,
        password: password.value,
        confirm: confirm.value
      });
      const query = selectedPlanQuery();
      location.assign('/User/index.html' + (query ? query + '#planos' : ''));
    } catch (error) {
      status.textContent = error.message;
      status.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
})();
