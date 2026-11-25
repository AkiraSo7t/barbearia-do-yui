// Carrega o painel do cliente e conecta os formulários à agenda, aos planos e aos avisos.
(async () => {
  const api = window.gurenApi;
  const initial = await api.load();
  api.renderTerms(initial);
  const views = [...document.querySelectorAll('.view')];
  const navButtons = [...document.querySelectorAll('.nav-item, .top-tab')];
  navButtons
    .filter(button => button.classList.contains('nav-item'))
    .forEach(button => {
      button.title = button.textContent.trim();
      button.setAttribute('aria-label', button.textContent.trim());
    });
  const sidebar = document.querySelector('.sidebar');
  const menuButton = document.querySelector('.mobile-menu');
  const dialog = document.getElementById('booking-dialog');
  const bookingForm = document.getElementById('booking-form');
  const { times, isOpenDate, getBlocks } = window.gurenAgenda;
  const catalog = window.gurenPreviewCatalog;
  const serviceSelect = bookingForm.elements.service;
  serviceSelect.options.length = 1;
  for (const service of catalog.getServices().filter(item => item.active)) {
    serviceSelect.add(new Option(service.name, service.name));
  }
  const timeSelect = bookingForm.elements.time;
  timeSelect.options.length = 1;
  for (const time of times) timeSelect.add(new Option(time, time));
  // Disponibilidade: desativa horários bloqueados pela equipe.
  const refreshBookingTimes = () => {
    const date = bookingForm.elements.date.value;
    const blocked = new Set(
      getBlocks()
        .filter(item => item.date === date)
        .map(item => item.time)
    );
    for (const option of timeSelect.options) option.disabled = blocked.has(option.value);
    if (blocked.has(timeSelect.value)) timeSelect.value = '';
  };
  bookingForm.elements.date.addEventListener('change', refreshBookingTimes);
  window.addEventListener('storage', refreshBookingTimes);
  const bookingList = document.getElementById('booking-list');
  const overviewNext = document.getElementById('overview-next');
  const toast = document.getElementById('toast');
  const feedback = document.getElementById('dialog-feedback');
  const appointments = initial.bookings;
  let editingId = null;
  let toastTimer;
  const priceFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const termsNote = document.getElementById('booking-terms-note');
  const planGrid = document.querySelector('#view-planos .plan-grid');
  planGrid.replaceChildren();
  for (const plan of initial.plans) {
    const card = document.createElement('article');
    card.className = 'plan-card' + (plan.id === 'intermediario' ? ' featured' : '');
    const title = document.createElement('h2');
    title.textContent = plan.name;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = priceFormat.format(plan.cents / 100) + ' / mês';
    const benefits = document.createElement('p');
    benefits.textContent = plan.benefits;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-outline';
    button.dataset.action = 'plan-info';
    button.dataset.planId = plan.id;
    button.textContent = 'Quero este plano';
    card.append(title, price, benefits, button);
    planGrid.append(card);
  }
  const showTermRequirement = () => {
    termsNote.hidden = !catalog.requiresPigmentationTerm(serviceSelect.value);
  };
  serviceSelect.addEventListener('change', showTermRequirement);
  for (const button of document.querySelectorAll('[data-service]')) {
    if (![...serviceSelect.options].some(option => option.value === button.dataset.service)) {
      button.disabled = true;
      button.title = 'Serviço indisponível no catálogo.';
    }
  }
  const notify = message => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
  };
  const showView = name => {
    views.forEach(view => view.classList.toggle('is-visible', view.id === `view-${name}`));
    navButtons.forEach(button => {
      const active = button.dataset.view === name;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    sidebar.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'pagamentos') void checkout.refreshHistory();
    history.replaceState(null, '', `#${name}`);
  };
  const checkout = window.setupGurenCheckout(api, initial, () => showView('pagamentos'));
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) showView(viewButton.dataset.view);
    const actionButton = event.target.closest('[data-action]');
    const action = actionButton?.dataset.action;
    if (action === 'new-booking')
      openBooking(null, actionButton.dataset.date, actionButton.dataset.service);
    if (action === 'plan-info') {
      const plan = initial.plans.find(item => item.id === actionButton.dataset.planId);
      if (plan) void checkout.open(plan);
    }
  });
  document.getElementById('view-pigmentation-term').addEventListener('click', () => {
    dialog.close();
    showView('termos');
  });
  menuButton.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      sidebar.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    }
  });
  const localDate = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const now = new Date();
  bookingForm.elements.date.min = localDate(now);
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    now
  );
  document.getElementById('dashboard-month').textContent =
    monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const calendarWeek = document.getElementById('dashboard-week');
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day' + (offset === 0 ? ' is-today' : '');
    button.dataset.action = 'new-booking';
    button.dataset.date = localDate(day);
    button.setAttribute('aria-label', 'Agendar em ' + day.toLocaleDateString('pt-BR'));
    if (!isOpenDate(button.dataset.date)) {
      button.disabled = true;
      button.title = 'Barbearia fechada nesta data';
    }
    const weekday = document.createElement('span');
    weekday.textContent = day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const number = document.createElement('strong');
    number.textContent = String(day.getDate());
    button.append(weekday, number);
    calendarWeek.append(button);
  }
  const openBooking = (appointment, date, service) => {
    editingId = appointment?.id ?? null;
    feedback.textContent = '';
    bookingForm.reset();
    bookingForm.elements.service.disabled = Boolean(appointment);
    bookingForm.elements.date.min = localDate(new Date());
    if (date) bookingForm.elements.date.value = date;
    if (service) bookingForm.elements.service.value = service;
    document.getElementById('dialog-title').innerHTML = appointment
      ? 'REMARCAR<br>HORÁRIO<span class="accent">.</span>'
      : 'AGENDAR<br>HORÁRIO<span class="accent">.</span>';
    if (appointment) {
      bookingForm.elements.service.value = appointment.service;
      bookingForm.elements.date.value = appointment.date;
      bookingForm.elements.time.value = appointment.time;
    }
    showTermRequirement();
    refreshBookingTimes();
    dialog.showModal();
  };
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  const appointmentDate = item => new Date(`${item.date}T${item.time}:00`);
  const formatDate = value =>
    new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  const formatSlot = (date, time) => formatDate(date) + ' às ' + time;
  const { renderReschedulingNotices, reschedulingFor } = iniciarAvisosDeRemarcacao(
    initial.me.id,
    appointments,
    showView,
    formatSlot
  );

  // Atualiza a agenda e os cartões a partir dos dados da conta.
  const render = () => {
    renderReschedulingNotices();
    bookingList.replaceChildren();
    const sorted = [...appointments].sort((a, b) => appointmentDate(a) - appointmentDate(b));
    const active = sorted.filter(item => item.reserved && appointmentDate(item) > gurenClock.now());
    document.getElementById('dashboard-booking-count').textContent = String(active.length);
    overviewNext.textContent = active.length
      ? `${formatDate(active[0].date)} · ${active[0].time}`
      : 'Nenhum agendamento';
    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const title = document.createElement('h2');
      title.textContent = 'SUA AGENDA ESTÁ LIVRE.';
      const copy = document.createElement('p');
      copy.textContent = 'Escolha um serviço e agende seu horário.';
      empty.append(title, copy);
      bookingList.append(empty);
      return;
    }
    sorted.forEach(item => {
      const card = document.createElement('article');
      card.className = 'booking-item';
      card.id = 'booking-' + item.id;
      card.tabIndex = -1;
      const date = document.createElement('div');
      date.className = 'booking-date';
      date.textContent = item.time;
      const dateSmall = document.createElement('small');
      dateSmall.textContent = formatDate(item.date);
      date.append(dateSmall);
      const detail = document.createElement('div');
      detail.className = 'booking-detail';
      const service = document.createElement('strong');
      service.textContent = item.service;
      const description = document.createElement('span');
      description.textContent =
        item.status === 'Remarcado' ? 'Horário remarcado' : (item.status ?? 'Agendado');
      description.classList.toggle('rescheduling-label', item.status === 'Remarcado');
      detail.append(service, description);
      const latestChange = reschedulingFor(item).at(-1);
      if (item.status === 'Remarcado' && latestChange?.previousDate) {
        const previous = document.createElement('span');
        previous.textContent =
          'Antes: ' + formatSlot(latestChange.previousDate, latestChange.previousTime);
        detail.append(previous);
      }
      const actions = document.createElement('div');
      actions.className = 'booking-actions';
      const move = document.createElement('button');
      move.type = 'button';
      move.textContent = 'Remarcar';
      move.addEventListener('click', () => {
        if (appointmentDate(item) - gurenClock.now() < 5 * 60 * 60 * 1000)
          return notify('A remarcação exige pelo menos 5 horas de antecedência.');
        openBooking(item);
      });
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancelar';
      cancel.addEventListener('click', async () => {
        if (appointmentDate(item) - gurenClock.now() < 24 * 60 * 60 * 1000)
          return notify('O cancelamento deve ser feito até um dia antes do atendimento.');
        try {
          await api.request('/bookings/' + item.id + '/status', 'POST', { status: 'Cancelado' });
          await refresh();
          notify('Horário cancelado.');
        } catch (error) {
          notify(error.message);
        }
      });
      if (item.reserved && appointmentDate(item) > gurenClock.now()) actions.append(move, cancel);
      card.append(date, detail, actions);
      bookingList.append(card);
    });
  };
  bookingForm.addEventListener('submit', async event => {
    event.preventDefault();
    const service = bookingForm.elements.service.value;
    const date = bookingForm.elements.date.value;
    const time = bookingForm.elements.time.value;
    if (!service || !date || !time)
      return (feedback.textContent = 'Preencha serviço, data e horário.');
    const selected = new Date(`${date}T${time}:00`);
    if (Number.isNaN(selected.getTime()) || selected <= new Date())
      return (feedback.textContent = 'Escolha um horário futuro.');
    if (!isOpenDate(date) || !times.includes(time))
      return (feedback.textContent = 'Escolha um horário de segunda a sábado, exceto no Natal.');
    if (getBlocks().some(item => item.date === date && item.time === time))
      return (feedback.textContent = 'Este horário está indisponível.');
    if (
      appointments.some(
        item =>
          item.status !== 'Cancelado' &&
          item.date === date &&
          item.time === time &&
          item.id !== editingId
      )
    )
      return (feedback.textContent = 'Este horário já foi adicionado nesta prévia.');
    const button = bookingForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const serviceId = catalog.getServices().find(item => item.name === service)?.id;
      await api.request(
        editingId ? '/bookings/' + editingId : '/bookings',
        editingId ? 'PATCH' : 'POST',
        { serviceId, date, time }
      );
      dialog.close();
      await refresh();
      showView('agendamentos');
      notify(editingId ? 'Horário remarcado.' : 'Agendamento confirmado.');
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.replace(/\D/g, '');
    if (name.split(/\s+/).length < 2 || !/^\d{8,11}$/.test(phone)) {
      document.getElementById('profile-feedback').textContent =
        'Informe nome completo e telefone com 8 a 11 números.';
      return;
    }
    const whatsapp = form.elements.whatsapp.value.replace(/\D/g, '');
    if (whatsapp && !/^\d{8,11}$/.test(whatsapp)) {
      document.getElementById('profile-feedback').textContent =
        'Informe um WhatsApp com 8 a 11 números.';
      return;
    }
    try {
      await api.request('/profile', 'PATCH', { name, phone, whatsapp });
      document.getElementById('profile-feedback').textContent = 'Dados salvos.';
    } catch (error) {
      document.getElementById('profile-feedback').textContent = error.message;
    }
  });
  const profile = document.getElementById('profile-form');
  for (const name of ['name', 'phone', 'whatsapp', 'cpf'])
    profile.elements[name].value = initial.me[name] || '';
  async function refresh() {
    const data = await api.load();
    if (JSON.stringify(appointments) === JSON.stringify(data.bookings)) {
      refreshBookingTimes();
      return;
    }
    appointments.splice(0, appointments.length, ...data.bookings);
    render();
    refreshBookingTimes();
  }
  window.addEventListener('focus', () => refresh().catch(error => notify(error.message)));
  setInterval(() => {
    if (!document.hidden) refresh().catch(() => {});
  }, 15000);
  window.addEventListener('guren-clock-change', render);
  const url = new URL(location.href);
  const requestedPlan = url.searchParams.get('plano');
  if (requestedPlan) {
    url.searchParams.delete('plano');
    history.replaceState(null, '', url);
  }
  const initialView = requestedPlan ? 'planos' : location.hash.slice(1);
  showView(views.some(view => view.id === `view-${initialView}`) ? initialView : 'inicio');
  render();
  if (requestedPlan) {
    const plan = initial.plans.find(item => item.id === requestedPlan);
    if (plan) void checkout.open(plan);
    else notify('Este plano não está disponível. Escolha uma das opções atuais.');
  }
})().catch(error => window.gurenApi.showError(error));
