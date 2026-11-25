// Conecta os editores da administração aos dados da conta e atualiza as listas após salvar.
(async () => {
  const api = window.gurenApi;
  const initial = await api.load();
  api.renderTerms(initial);
  const catalog = window.gurenPreviewCatalog;
  const state = {
    booking: [],
    attendance: [],
    service: catalog.getServices()
  };
  const { times, getBlocks } = window.gurenAgenda;
  const $ = selector => document.querySelector(selector);
  const dialog = $('#editor');
  const form = $('#editor-form');
  const fields = $('#dialog-fields');
  const clients = initial.clients;
  const clientDialog = $('#client-dialog');
  let pendingClientAction;
  const planCards = new Map();
  const priceFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  let editing = { type: '', id: null };
  const {
    localDate: today,
    prettyDate: dateLabel,
    notify: toast,
    adicionarCampo,
    listaVazia
  } = window.gurenStaff;

  function go(view) {
    if (window.gurenStaff.go(view) && view === 'agenda') render();
  }

  // Clientes: prepara a confirmação antes de aplicar a ação selecionada.
  function openClientAction(client, action) {
    pendingClientAction = { client, action };
    const blocking = action === 'block';
    $('#client-dialog-title').textContent = blocking ? 'Bloquear cliente' : 'Excluir conta';
    $('#client-dialog-description').textContent = blocking
      ? 'Impedir novos agendamentos de ' + client.name + ' até o desbloqueio administrativo?'
      : 'Confirme a remoção da conta de ' + client.name + ' desta lista.';
    $('#confirm-client-action').textContent = blocking ? 'Bloquear cliente' : 'Excluir conta';
    clientDialog.showModal();
    $('#cancel-client-action').focus();
  }
  function renderClients() {
    const list = $('#client-list');
    list.replaceChildren();
    $('#client-count').textContent = clients.length;
    if (!clients.length) {
      const item = document.createElement('li');
      item.append(
        listaVazia(
          'Nenhuma conta na lista',
          'Os cadastros aparecerão aqui quando o painel estiver conectado ao sistema.',
          'user-round'
        )
      );
      list.append(item);
      return;
    }
    for (const client of clients) {
      const row = $('#client-row').content.cloneNode(true);
      const blocked = client.blocked || client.consecutiveAbsences >= 4;
      row.querySelector('[data-client-name]').textContent = client.name;
      row.querySelector('[data-client-user]').textContent = client.username;
      row.querySelector('[data-client-plan]').textContent = client.pendingPlan
        ? client.pendingPlan + ' · aguardando pagamento'
        : client.plan || 'Sem plano ativo';
      row.querySelector('[data-client-absences]').textContent = client.consecutiveAbsences ?? 0;
      const status = row.querySelector('[data-client-status]');
      status.textContent = blocked ? 'Agendamento bloqueado' : 'Ativa';
      status.classList.add(blocked ? 'suspended' : 'done');
      const accessButton = row.querySelector('[data-client-action="block"]');
      accessButton.textContent = blocked ? 'Desbloquear' : 'Bloquear';
      accessButton.setAttribute(
        'aria-label',
        accessButton.textContent + ' conta de ' + client.name
      );
      accessButton.addEventListener('click', async () => {
        if (!blocked) {
          openClientAction(client, 'block');
          return;
        }
        try {
          await api.request('/clients/' + client.id + '/access', 'PATCH', { blocked: false });
          await refresh();
          toast('Cliente desbloqueado.');
        } catch (error) {
          toast(error.message);
        }
      });
      const deleteButton = row.querySelector('[data-client-action="delete"]');
      deleteButton.setAttribute('aria-label', 'Excluir conta de ' + client.name);
      deleteButton.addEventListener('click', () => openClientAction(client, 'delete'));
      row
        .querySelector('[data-client-action="edit"]')
        .addEventListener('click', () => openClientEditor(client, 'client-details'));
      row
        .querySelector('[data-client-action="plan"]')
        .addEventListener('click', () => openClientEditor(client, 'client-plan'));
      list.append(row);
    }
  }
  function openClientEditor(client, type) {
    if (
      type === 'client-plan' &&
      client.plan &&
      (!client.planEndsOn || client.planEndsOn >= today())
    ) {
      toast('O plano vigente só pode ser alterado depois do término.');
      return;
    }
    editing = { type, client };
    fields.replaceChildren();
    $('#form-error').textContent = '';
    $('#dialog-title').textContent =
      (type === 'client-plan' ? 'Alterar plano · ' : 'Editar dados · ') + client.name;
    $('#dialog-description').textContent = 'Os dados serão salvos na conta do cliente.';
    if (type === 'client-plan') {
      selectField(
        'Plano',
        'plan',
        [...planCards.values()].map(card => card.querySelector('h2').textContent)
      );
    } else {
      adicionarCampo(fields, 'Nome completo', 'name', 'text', client.name);
      adicionarCampo(fields, 'Telefone com DDD', 'phone', 'tel', client.phone);
      adicionarCampo(fields, 'WhatsApp com DDD', 'whatsapp', 'tel', client.whatsapp);
    }
    dialog.showModal();
  }
  function showPlanPrice(plan, cents) {
    plan.dataset.priceCents = String(cents);
    plan.querySelector('[data-price]').textContent = priceFormat.format(cents / 100);
  }
  // Planos: permite editar preço e benefícios no catálogo.
  function openPlanEditor(plan) {
    editing = { type: 'plan', id: plan?.dataset.plan ?? null };
    fields.replaceChildren();
    $('#form-error').textContent = '';
    $('#dialog-title').textContent = plan
      ? 'Editar plano · ' + plan.querySelector('h2').textContent
      : 'Criar plano';
    $('#dialog-description').textContent =
      'Atualize o preço e descreva os serviços, a frequência e os benefícios incluídos.';
    if (!plan) adicionarCampo(fields, 'Nome do plano', 'planName', 'text', '').maxLength = 80;
    const current = plan
      ? (Number(plan.dataset.priceCents) / 100).toFixed(2).replace('.', ',')
      : '';
    const input = adicionarCampo(fields, 'Valor mensal (R$)', 'price', 'text', current);
    input.inputMode = 'decimal';
    const label = document.createElement('label');
    label.textContent = 'O que está incluído';
    const benefits = document.createElement('textarea');
    benefits.name = 'benefits';
    benefits.rows = 4;
    benefits.required = true;
    benefits.maxLength = 1000;
    benefits.value = plan?.querySelector('[data-benefits]').textContent ?? '';
    label.append(benefits);
    fields.append(label);
    dialog.showModal();
    if (plan) input.select();
    else fields.querySelector('[name="planName"]').focus();
  }
  async function savePlan(value, benefits, name) {
    if (!/^\d{1,9}(?:[,.]\d{1,2})?$/.test(value)) return error('Informe um valor como 149,90.');
    const cents = Math.round(Number(value.replace(',', '.')) * 100);
    const plan = planCards.get(editing.id);
    try {
      await api.request(plan ? '/plans/' + editing.id : '/plans', plan ? 'PATCH' : 'POST', {
        name: plan ? plan.querySelector('h2').textContent : name,
        cents,
        benefits
      });
      dialog.close();
      await refresh();
      toast('Plano salvo.');
    } catch (failure) {
      error(failure.message);
    }
  }
  function addCustomPlan(item) {
    const plan = $('#custom-plan-card').content.firstElementChild.cloneNode(true);
    plan.dataset.plan = item.id;
    plan.querySelector('h2').textContent = item.name;
    plan.querySelector('[data-benefits]').textContent = item.benefits;
    const button = plan.querySelector('[data-edit-plan]');
    button.setAttribute('aria-label', 'Editar plano ' + item.name);
    button.addEventListener('click', () => openPlanEditor(plan));
    showPlanPrice(plan, item.cents);
    planCards.set(item.id, plan);
    $('#plan-grid').append(plan);
  }
  function open(type, itemId = null) {
    editing = { type, id: itemId };
    const item = state[type]?.find(x => x.id === itemId) || {};
    fields.replaceChildren();
    $('#form-error').textContent = '';
    const titles = {
      booking: itemId ? 'Remarcar agendamento' : 'Novo agendamento',
      service: itemId ? 'Editar serviço' : 'Novo serviço',
      block: 'Bloquear horário'
    };
    $('#dialog-title').textContent = titles[type];
    $('#dialog-description').textContent = 'Os dados serão salvos no sistema.';
    if (type === 'booking') {
      const client = selectField(
        'Cliente cadastrado',
        'clientId',
        clients.map(user => user.id),
        item.clientId
      );
      for (const option of client.options) {
        const user = clients.find(user => user.id === option.value);
        if (user) option.textContent = user.name + ' · ' + user.cpf;
      }
      client.disabled = Boolean(itemId);
      const services = state.service.filter(service => service.active).map(service => service.name);
      if (itemId) services.push(item.service);
      const service = selectField('Serviço', 'service', [...new Set(services)], item.service);
      service.disabled = Boolean(itemId);
    }
    if (type === 'booking' || type === 'block') {
      adicionarCampo(fields, 'Data', 'date', 'date', item.date || today());
      selectField('Horário', 'time', times, item.time);
    } else {
      adicionarCampo(fields, 'Nome do serviço', 'name', 'text', item.name);
    }
    dialog.showModal();
    fields.querySelector('input,select')?.focus();
  }
  function selectField(label, name, values, current) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const select = document.createElement('select');
    select.name = name;
    select.required = true;
    for (const value of ['', ...values]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || 'Selecione';
      select.append(option);
    }
    select.value = current || '';
    wrapper.append(select);
    fields.append(wrapper);
    return select;
  }
  const isReserved = booking => booking.status === 'Agendado' || booking.status === 'Remarcado';
  const startsAt = booking => new Date(booking.date + 'T' + booking.time).getTime();
  // Validação e gravação dos dados do editor.
  async function save(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (editing.type === 'plan') return savePlan(data.price, data.benefits, data.planName);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (editing.type === 'client-plan') {
        await api.request('/clients/' + editing.client.id + '/plan', 'PATCH', { plan: data.plan });
      } else if (editing.type === 'client-details') {
        await api.request('/clients/' + editing.client.id, 'PATCH', data);
      } else if (editing.type === 'booking') {
        data.serviceId = state.service.find(service => service.name === data.service)?.id;
        await api.request(
          editing.id ? '/bookings/' + editing.id : '/bookings',
          editing.id ? 'PATCH' : 'POST',
          data
        );
      } else if (editing.type === 'block') {
        await api.request('/blocks', 'POST', data);
      } else {
        await api.request(
          editing.id ? '/services/' + editing.id : '/services',
          editing.id ? 'PATCH' : 'POST',
          data
        );
      }
      dialog.close();
      await refresh();
      toast('Dados salvos.');
    } catch (failure) {
      error(failure.message);
    } finally {
      button.disabled = false;
    }
  }
  function error(message) {
    $('#form-error').textContent = message;
  }
  async function updateBooking(item, status) {
    try {
      await api.request('/bookings/' + item.id + '/status', 'POST', { status });
      await refresh();
      toast('Agendamento atualizado.');
    } catch (error) {
      toast(error.message);
    }
  }
  function bookingActions(item) {
    if (!isReserved(item)) return [];
    const actions = [
      ['Remarcar', () => open('booking', item.id)],
      ['Cancelar', () => updateBooking(item, 'Cancelado')]
    ];
    if (startsAt(item) <= Date.now()) {
      actions.push([
        'Registrar atendimento',
        () => {
          updateBooking(item, 'Concluído');
        }
      ]);
    }
    if (startsAt(item) + 600_000 <= Date.now()) {
      actions.push(['Registrar falta', () => updateBooking(item, 'Faltou')]);
    }
    return actions;
  }
  function row(type, item, title, subtitle) {
    const el = document.createElement('div');
    el.className = 'list-row';
    const avatar = document.createElement('span');
    avatar.className = 'row-icon';
    avatar.textContent = title.trim().slice(0, 2).toUpperCase();
    const copy = document.createElement('div');
    copy.className = 'row-copy';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const small = document.createElement('small');
    small.textContent = subtitle;
    copy.append(strong, small);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    let options;
    if (type === 'booking') {
      options = bookingActions(item);
    } else if (type === 'block') {
      options = [
        [
          'Liberar',
          async () => {
            try {
              await api.request('/blocks/' + item.id, 'DELETE');
              await refresh();
              toast('Horário liberado.');
            } catch (error) {
              toast(error.message);
            }
          }
        ]
      ];
    } else {
      options = [
        ['Editar', () => open(type, item.id)],
        [
          item.active ? 'Desativar' : 'Ativar',
          async () => {
            try {
              await api.request('/services/' + item.id, 'PATCH', { active: !item.active });
              await refresh();
            } catch (error) {
              toast(error.message);
            }
          }
        ]
      ];
    }
    options.forEach(([label, handler]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', handler);
      actions.append(button);
    });
    el.append(avatar, copy, actions);
    return el;
  }
  function renderList(selector, type, items, emptyTitle, emptyDetail, icon, map) {
    const list = $(selector);
    list.replaceChildren();
    if (!items.length) list.append(listaVazia(emptyTitle, emptyDetail, icon));
    items.forEach(item => {
      const [title, subtitle] = map(item);
      list.append(row(type, item, title, subtitle));
    });
  }
  function render() {
    const bookings = [...state.booking].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time)
    );
    const upcoming = bookings.filter(x => isReserved(x) && startsAt(x) > Date.now());
    $('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date());
    $('#today-count').textContent = bookings.filter(
      x => x.date === today() && x.status !== 'Cancelado'
    ).length;
    $('#next-appointment').textContent = upcoming.length
      ? dateLabel(upcoming[0].date) + ' · ' + upcoming[0].time
      : 'Agenda livre';
    $('#attendance-count').textContent = state.attendance.length;
    renderList(
      '#agenda-list',
      'booking',
      bookings.filter(x => !$('#agenda-date').value || x.date === $('#agenda-date').value),
      'Agenda livre',
      'Nenhum agendamento no período selecionado.',
      'calendar-days',
      x => [x.client, dateLabel(x.date) + ' · ' + x.time + ' · ' + x.service + ' · ' + x.status]
    );
    renderList(
      '#block-list',
      'block',
      getBlocks(),
      'Nenhum bloqueio',
      'Os horários bloqueados aparecerão aqui.',
      'calendar-check',
      x => [dateLabel(x.date), x.time]
    );
    renderList(
      '#service-list',
      'service',
      state.service,
      'Nenhum serviço cadastrado',
      'Adicione um serviço ao catálogo.',
      'sparkles',
      x => [x.name, x.active ? 'Ativo' : 'Inativo']
    );
    renderReport();
  }
  function renderReport() {
    exibirRelatorioSemanal(state.attendance, catalog.initialServices);
  }
  document.addEventListener('click', event => {
    const view = event.target.closest('[data-view]');
    if (view) go(view.dataset.view);
    const action = event.target.closest('[data-action]');
    if (action) open(action.dataset.action);
  });
  $('#agenda-date').addEventListener('change', render);
  $('#report-date').value = today();
  $('#report-date').addEventListener('change', renderReport);
  $('#print-report').addEventListener('click', () => window.print());
  $('#new-plan').addEventListener('click', () => openPlanEditor(null));
  $('#close-dialog').addEventListener('click', () => dialog.close());
  $('#cancel-client-action').addEventListener('click', () => clientDialog.close());
  clientDialog.addEventListener('close', () => {
    pendingClientAction = null;
  });
  $('#client-action-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!pendingClientAction) return;
    const { client, action } = pendingClientAction;
    try {
      await api.request(
        '/clients/' + client.id + (action === 'block' ? '/access' : ''),
        action === 'block' ? 'PATCH' : 'DELETE',
        action === 'block' ? { blocked: true } : undefined
      );
      clientDialog.close();
      await refresh();
      toast(action === 'block' ? 'Cliente bloqueado.' : 'Conta desativada.');
    } catch (error) {
      toast(error.message);
    }
  });
  form.addEventListener('submit', save);
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'inicio'));
  window.addEventListener('focus', () => refresh().catch(error => toast(error.message)));
  document.querySelectorAll('[data-plan]').forEach(plan => {
    planCards.set(plan.dataset.plan, plan);
    plan.querySelector('[data-edit-plan]').addEventListener('click', () => openPlanEditor(plan));
  });
  function applyData(data) {
    state.booking = data.bookings;
    state.attendance = data.attendances;
    state.service = data.services;
    clients.splice(0, clients.length, ...data.clients);
    for (const item of data.plans) {
      if (!planCards.has(item.id)) addCustomPlan(item);
      const card = planCards.get(item.id);
      showPlanPrice(card, item.cents);
      card.querySelector('[data-benefits]').textContent = item.benefits;
    }
  }
  async function refresh() {
    applyData(await api.load());
    render();
    renderClients();
  }
  applyData(initial);
  render();
  renderClients();
  go(location.hash.slice(1) || 'inicio');
})().catch(error => window.gurenApi.showError(error));
