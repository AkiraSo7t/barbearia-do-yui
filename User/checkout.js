// Mostra o valor do plano, o QR Code e a situação da cobrança na tela do cliente.
window.setupGurenCheckout = function (api, initial, showPayments) {
  const byId = id => document.getElementById(id);
  const dialog = byId('checkout-dialog');
  const generate = byId('checkout-generate');
  const retry = byId('checkout-retry');
  const pix = byId('checkout-pix');
  const status = byId('checkout-status');
  const feedback = byId('checkout-feedback');
  const history = byId('payment-history');
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dates = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  });
  const labels = {
    gerando: 'Verificando cobrança',
    pendente: 'Aguardando pagamento',
    aprovado: 'Pagamento aprovado',
    vencido: 'Cobrança vencida',
    expirado: 'Código Pix expirado',
    cancelado: 'Cobrança cancelada',
    recusado: 'Pagamento recusado',
    estornado: 'Pagamento estornado'
  };
  const waiting = new Set(['gerando', 'pendente', 'vencido', 'expirado']);
  let checkout;
  let timer;

  function showPlan(user) {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(
      new Date()
    );
    const active = user.plan && (!user.planEndsOn || user.planEndsOn >= today);
    for (const node of document.querySelectorAll('[data-active-plan]')) {
      node.textContent = active ? user.plan : 'Sem plano ativo';
    }
  }
  showPlan(initial.me);

  function render(payment) {
    const changed = status.textContent !== labels[payment.status];
    status.textContent = labels[payment.status];
    status.dataset.state = payment.status;
    byId('checkout-total').textContent = money.format(payment.cents / 100);
    byId('checkout-plan').textContent = payment.planName;
    byId('checkout-summary-plan').textContent = payment.planName;
    generate.hidden = true;
    pix.hidden = !payment.pix;
    if (payment.pix) {
      const qr = byId('checkout-qr');
      const src = 'data:image/png;base64,' + payment.pix.encodedImage;
      if (qr.getAttribute('src') !== src) qr.src = src;
      const code = byId('checkout-code');
      if (code.value !== payment.pix.payload) code.value = payment.pix.payload;
      byId('checkout-expiry').textContent = payment.pix.expiresAt
        ? 'Código válido até ' + dates.format(new Date(payment.pix.expiresAt))
        : '';
    }
    if (payment.status === 'aprovado') {
      feedback.textContent = payment.confirmedAt
        ? 'Confirmado em ' + dates.format(new Date(payment.confirmedAt)) + '.'
        : 'Pagamento confirmado.';
      void api
        .request('/auth/me')
        .then(showPlan)
        .catch(() => {});
    } else if (payment.status === 'expirado') {
      feedback.textContent = 'O código venceu. Confira a situação da cobrança em Pagamentos.';
    } else if (changed && waiting.has(payment.status)) {
      feedback.textContent =
        payment.status === 'gerando'
          ? 'Estamos verificando a emissão do Pix.'
          : 'O status é atualizado automaticamente.';
    }
  }

  async function refreshHistory() {
    try {
      const settings = await api.request('/pix');
      const { payments } = settings;
      byId('payment-empty').hidden = payments.length > 0;
      byId('payment-overview').textContent = payments.length
        ? labels[payments[0].status]
        : 'Nenhum pagamento';
      history.replaceChildren();
      for (const payment of payments) {
        const row = document.createElement('article');
        row.className = 'payment-row';
        const title = document.createElement('strong');
        title.textContent = payment.planName;
        const meta = document.createElement('small');
        meta.textContent =
          dates.format(new Date(payment.createdAt)) + ' · ' + labels[payment.status];
        const amount = document.createElement('strong');
        amount.textContent = money.format(payment.cents / 100);
        const button = document.createElement('button');
        button.className = 'button button-outline';
        button.type = 'button';
        button.textContent = waiting.has(payment.status) ? 'Ver Pix' : 'Ver detalhes';
        button.addEventListener('click', () => open(payment, payment.id));
        row.append(title, meta, amount, button);
        history.append(row);
      }
      byId('payment-error').textContent = '';
      return { settings };
    } catch (error) {
      byId('payment-error').textContent = error.message;
      return { error };
    }
  }

  async function poll(current) {
    try {
      const payment = await api.request('/pix/' + current.id);
      if (checkout !== current) return;
      render(payment);
      if (!waiting.has(payment.status)) {
        void refreshHistory();
        return;
      }
    } catch (error) {
      if (checkout !== current) return;
      feedback.textContent = error.message;
    }
    timer = setTimeout(() => poll(current), 12_000);
  }

  async function open(plan, id) {
    clearTimeout(timer);
    const current = { plan, id };
    checkout = current;
    status.textContent = id ? 'Consultando pagamento' : 'Verificando disponibilidade do Pix';
    status.dataset.state = '';
    feedback.textContent = '';
    pix.hidden = true;
    retry.hidden = true;
    generate.hidden = true;
    generate.disabled = true;
    byId('checkout-plan').textContent = plan.name || plan.planName;
    byId('checkout-summary-plan').textContent = plan.name || plan.planName;
    byId('checkout-benefits').textContent = plan.benefits || '';
    byId('checkout-total').textContent = money.format(plan.cents / 100);
    dialog.showModal();
    if (id) return poll(current);
    await prepare(current);
  }

  async function prepare(current) {
    retry.hidden = true;
    status.textContent = 'Verificando disponibilidade do Pix';
    feedback.textContent = '';
    const { settings, error } = await refreshHistory();
    if (checkout !== current) return;
    if (error) {
      status.textContent = 'Não foi possível verificar o Pix';
      feedback.textContent = error.message;
      retry.hidden = false;
      return;
    }
    if (!settings.enabled) {
      status.textContent = 'Pix indisponível';
      feedback.textContent = 'O pagamento de teste ainda não foi configurado neste servidor.';
      return;
    }
    const pending = settings.payments.find(
      payment => payment.planId === current.plan.id && waiting.has(payment.status)
    );
    if (pending) {
      current.id = pending.id;
      generate.hidden = true;
      return poll(current);
    }
    status.textContent = 'Pronto para pagar';
    generate.hidden = false;
    generate.disabled = false;
  }

  retry.addEventListener('click', () => {
    if (checkout) void prepare(checkout);
  });

  generate.addEventListener('click', async () => {
    const current = checkout;
    generate.disabled = true;
    status.textContent = 'Gerando Pix';
    feedback.textContent = '';
    try {
      const payment = await api.request('/pix', 'POST', { planId: current.plan.id });
      if (checkout !== current) return;
      current.id = payment.id;
      render(payment);
      if (waiting.has(payment.status)) timer = setTimeout(() => poll(current), 12_000);
    } catch (error) {
      if (checkout !== current) return;
      status.textContent = 'Pix indisponível';
      feedback.textContent = error.message;
      generate.disabled = false;
    }
    void refreshHistory();
  });

  byId('checkout-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(byId('checkout-code').value);
      feedback.textContent = 'Código Pix copiado.';
    } catch {
      byId('checkout-code').select();
      feedback.textContent = 'Selecione e copie o código Pix.';
    }
  });
  byId('close-checkout').addEventListener('click', () => dialog.close());
  byId('checkout-history').addEventListener('click', () => {
    dialog.close();
    showPayments();
  });
  dialog.addEventListener('close', () => {
    checkout = null;
    clearTimeout(timer);
  });
  return { open, refreshHistory };
};
