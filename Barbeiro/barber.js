// Liga os formulários da equipe às reservas, aos bloqueios e ao registro de atendimentos.
(async () => {
  const api = window.gurenApi;
  const initial = await api.load();
  api.renderTerms(initial);
  const { times, getBlocks } = window.gurenAgenda;
  const catalog = window.gurenPreviewCatalog;
  const attendances = [];
  const appointments = [];
  const clients = initial.clients;
  const $ = selector => document.querySelector(selector);
  const dialog = $('#editor');
  const form = $('#editor-form');
  const fields = $('#dialog-fields');
  let editor = { type: '', id: null };
  const { localDate, prettyDate, notify, go, adicionarCampo, listaVazia } = window.gurenStaff;

  function select(label, name, options, value) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const el = document.createElement('select');
    el.name = name;
    el.required = true;
    options.forEach(([optionValue, text]) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = text;
      if (optionValue === value) option.selected = true;
      el.append(option);
    });
    wrapper.append(el);
    fields.append(wrapper);
  }
  // Monta os campos conforme o tipo de atendimento ou bloqueio.
  function openEditor(type, id = null) {
    editor = { type, id };
    fields.replaceChildren();
    $('#form-error').textContent = '';
    const existing = type === 'booking' ? appointments.find(x => x.id === id) : null;
    if (type === 'booking') {
      $('#dialog-title').textContent = existing ? 'Remarcar horário' : 'Novo horário';
      $('#dialog-description').textContent = 'Selecione o cliente e um horário disponível.';
      select(
        'Cliente cadastrado',
        'clientId',
        [
          ['', 'Selecione'],
          ...clients.map(client => [client.id, client.name + ' · ' + client.cpf])
        ],
        existing?.clientId
      );
      const services = catalog
        .getServices()
        .filter(item => item.active)
        .map(item => item.name);
      if (existing) services.push(existing.service);
      select(
        'Serviço',
        'service',
        [['', 'Selecione um serviço'], ...[...new Set(services)].map(name => [name, name])],
        existing?.service
      );
      adicionarCampo(fields, 'Data', 'date', 'date', existing?.date || localDate());
      select('Horário', 'time', [['', 'Selecione'], ...times.map(x => [x, x])], existing?.time);
    } else if (type === 'client') {
      $('#dialog-title').textContent = 'Novo cliente';
      $('#dialog-description').textContent =
        'Informe os dados do cliente. Novas contas entram com CPF e senha inicial.';
      adicionarCampo(fields, 'Nome completo', 'name', 'text');
      adicionarCampo(fields, 'CPF', 'cpf', 'text');
      adicionarCampo(fields, 'Senha inicial', 'password', 'password');
      adicionarCampo(fields, 'Telefone', 'phone', 'tel');
      adicionarCampo(fields, 'WhatsApp', 'whatsapp', 'tel');
    } else {
      $('#dialog-title').textContent = 'Bloquear horário';
      $('#dialog-description').textContent =
        'O horário ficará indisponível para novos agendamentos.';
      adicionarCampo(fields, 'Data', 'date', 'date', localDate());
      select('Horário', 'time', [['', 'Selecione'], ...times.map(x => [x, x])]);
      adicionarCampo(fields, 'Motivo', 'reason', 'text', '', false);
    }
    dialog.showModal();
    fields.querySelector('input,select')?.focus();
  }
  function error(message) {
    $('#form-error').textContent = message;
  }
  // Valida o formulário antes de atualizar a agenda no servidor.
  async function save(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (editor.type === 'booking') {
        data.serviceId = catalog.getServices().find(service => service.name === data.service)?.id;
        await api.request(
          editor.id ? '/bookings/' + editor.id : '/bookings',
          editor.id ? 'PATCH' : 'POST',
          data
        );
      } else if (editor.type === 'client') {
        await api.request('/clients', 'POST', data);
      } else {
        await api.request('/blocks', 'POST', data);
      }
      dialog.close();
      await refresh();
      notify('Dados salvos.');
    } catch (failure) {
      error(failure.message);
    } finally {
      button.disabled = false;
    }
  }
  function row(title, subtitle, badge, actions) {
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
    el.append(avatar, copy);
    if (badge) {
      const status = document.createElement('span');
      status.className = 'status' + (badge === 'Concluído' ? ' done' : '');
      status.textContent = badge;
      el.append(status);
    }
    if (actions?.length) {
      const holder = document.createElement('div');
      holder.className = 'row-actions';
      actions.forEach(([text, handler]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.addEventListener('click', handler);
        holder.append(button);
      });
      el.append(holder);
    }
    return el;
  }
  function render() {
    const sorted = [...appointments].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time)
    );
    const upcoming = sorted.filter(
      x => x.status === 'scheduled' && new Date(x.date + 'T' + x.time) > gurenClock.now()
    );
    $('#today-count').textContent = upcoming.filter(x => x.date === localDate()).length;
    $('#served-count').textContent = attendances.length;
    $('#client-count').textContent = clients.length;
    $('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date());
    $('#next-appointment').textContent = upcoming.length
      ? prettyDate(upcoming[0].date) + ' · ' + upcoming[0].time
      : 'Agenda livre';
    const agenda = $('#agenda-list');
    agenda.replaceChildren();
    const filterDate = $('#agenda-date').value;
    const visible = sorted.filter(x => !filterDate || x.date === filterDate);
    if (!visible.length)
      agenda.append(
        listaVazia(
          'Sua agenda está livre.',
          'Adicione um horário para ver o atendimento aqui.',
          'calendar-days'
        )
      );
    const statuses = {
      scheduled: 'Agendado',
      done: 'Concluído',
      absent: 'Faltou',
      cancelled: 'Cancelado'
    };
    for (const item of visible) {
      const actions = [];
      if (item.status === 'scheduled') {
        actions.push(['Remarcar', () => openEditor('booking', item.id)]);
        actions.push(['Cancelar', () => updateStatus(item, 'cancelled')]);
        const start = new Date(item.date + 'T' + item.time).getTime();
        if (gurenClock.now().getTime() >= start) {
          actions.push([
            'Concluir',
            () => {
              updateStatus(item, 'done');
            }
          ]);
        }
        if (gurenClock.now().getTime() >= start + 600_000)
          actions.push(['Registrar falta', () => updateStatus(item, 'absent')]);
      }
      agenda.append(
        row(
          item.client,
          prettyDate(item.date) + ' · ' + item.time + ' · ' + item.service,
          statuses[item.status],
          actions
        )
      );
    }
    const clientList = $('#client-list');
    clientList.replaceChildren();
    if (!clients.length)
      clientList.append(
        listaVazia('Nenhum cliente adicionado.', 'Cadastre um cliente para começar.', 'user-round')
      );
    clients.forEach(item =>
      clientList.append(row(item.name, 'Telefone: ' + item.phone + ' · WhatsApp: ' + item.whatsapp))
    );
    const serviceList = $('#service-list');
    serviceList.replaceChildren();
    if (!attendances.length)
      serviceList.append(
        listaVazia(
          'Nenhum atendimento concluído.',
          'Conclua um agendamento para vê-lo aqui.',
          'scissors'
        )
      );
    attendances.forEach(item =>
      serviceList.append(
        row(
          item.client,
          prettyDate(item.date) + ' · ' + item.time + ' · ' + item.service,
          'Concluído'
        )
      )
    );
    const blockList = $('#block-list');
    blockList.replaceChildren();
    const blocks = getBlocks();
    if (!blocks.length)
      blockList.append(
        listaVazia(
          'Nenhum horário bloqueado.',
          'Bloqueie um período para organizar sua disponibilidade.',
          'calendar-check'
        )
      );
    blocks
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .forEach(item => {
        const release = async () => {
          try {
            await api.request('/blocks/' + item.id, 'DELETE');
            await refresh();
            notify('Horário liberado.');
          } catch (error) {
            notify(error.message);
          }
        };
        blockList.append(
          row(prettyDate(item.date) + ' · ' + item.time, item.reason || 'Indisponível', '', [
            ['Liberar', release]
          ])
        );
      });
  }
  async function updateStatus(item, status) {
    const statuses = { done: 'Concluído', absent: 'Faltou', cancelled: 'Cancelado' };
    try {
      await api.request('/bookings/' + item.id + '/status', 'POST', { status: statuses[status] });
      await refresh();
      notify('Agendamento atualizado.');
    } catch (error) {
      notify(error.message);
    }
  }
  function applyData(data) {
    const statuses = {
      Agendado: 'scheduled',
      Remarcado: 'scheduled',
      Concluído: 'done',
      Faltou: 'absent',
      Cancelado: 'cancelled'
    };
    appointments.splice(
      0,
      appointments.length,
      ...data.bookings.map(item => ({ ...item, status: statuses[item.status] }))
    );
    attendances.splice(0, attendances.length, ...data.attendances);
    clients.splice(0, clients.length, ...data.clients);
  }
  async function refresh() {
    applyData(await api.load());
    render();
  }
  document.addEventListener('click', event => {
    const view = event.target.closest('[data-view]');
    if (view) go(view.dataset.view);
    const action = event.target.closest('[data-action]');
    if (action) openEditor(action.dataset.action);
  });
  window.addEventListener('focus', () => refresh().catch(error => notify(error.message)));
  window.addEventListener('guren-clock-change', render);
  $('#agenda-date').addEventListener('change', render);
  $('#close-dialog').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', save);
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'inicio'));
  applyData(initial);
  render();
  go(location.hash.slice(1) || 'inicio');
})().catch(error => window.gurenApi.showError(error));
