// Navegação, mensagens temporárias e datas dos painéis da equipe.
(() => {
  const $ = selector => document.querySelector(selector);
  let toastTimer;
  let loadingPayments = false;
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const paymentDate = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  });
  const paymentStatus = {
    gerando: 'Gerando Pix',
    pendente: 'Aguardando pagamento',
    aprovado: 'Pagamento aprovado',
    vencido: 'Cobrança vencida',
    expirado: 'Pix expirado',
    cancelado: 'Cobrança cancelada',
    recusado: 'Pagamento recusado',
    estornado: 'Pagamento estornado'
  };

  async function refreshPayments() {
    if (loadingPayments) return;
    loadingPayments = true;
    const list = $('#staff-payment-list');
    const feedback = $('#staff-payment-feedback');
    const button = $('#staff-payment-refresh');
    button.disabled = true;
    feedback.textContent = 'Consultando cobranças…';
    try {
      const payments = await gurenApi.request('/staff/payments');
      const rows = payments.map(payment => {
        const row = document.createElement('article');
        row.className = 'list-row';
        const details = document.createElement('div');
        details.className = 'row-copy';
        const title = document.createElement('strong');
        title.textContent = payment.planName + ' · ' + money.format(payment.cents / 100);
        const meta = document.createElement('small');
        meta.textContent =
          payment.clientName + ' · ' + paymentDate.format(new Date(payment.createdAt));
        const status = document.createElement('span');
        status.className = payment.status === 'aprovado' ? 'status done' : 'status';
        status.textContent = paymentStatus[payment.status] || 'Status indisponível';
        details.append(title, meta);
        row.append(details, status);
        return row;
      });
      list.replaceChildren(...rows);
      feedback.textContent = rows.length ? '' : 'Nenhuma cobrança Pix disponível.';
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      loadingPayments = false;
      button.disabled = false;
    }
  }

  function localDate(date = new Date()) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  function prettyDate(value) {
    if (!value) return '';
    const bits = value.split('-');
    return bits[2] + '/' + bits[1] + '/' + bits[0];
  }
  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
  function go(view) {
    if (!$('#view-' + view)) return false;
    document
      .querySelectorAll('.view')
      .forEach(el => el.classList.toggle('shown', el.id === 'view-' + view));
    document.querySelectorAll('.nav-button').forEach(el => {
      const active = el.dataset.view === view;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    history.replaceState(null, '', '#' + view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'pagamentos') void refreshPayments();
    return true;
  }
  $('#staff-payment-refresh')?.addEventListener('click', refreshPayments);
  // Os dois painéis usam os mesmos campos no editor e a mesma mensagem para listas vazias.
  function adicionarCampo(fields, label, name, type, value, required = true) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    input.required = required;
    input.value = value || '';
    if (type === 'date') input.min = localDate();
    if (type === 'tel') input.autocomplete = 'tel';
    wrapper.append(input);
    fields.append(wrapper);
    return input;
  }

  function listaVazia(title, detail, icon) {
    const box = document.createElement('div');
    box.className = 'empty';
    const img = document.createElement('img');
    img.src = '../User/assets/icons/' + icon + '.svg';
    img.alt = '';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = detail;
    box.append(img, strong, span);
    return box;
  }

  window.gurenStaff = { localDate, prettyDate, notify, go, adicionarCampo, listaVazia };
})();
