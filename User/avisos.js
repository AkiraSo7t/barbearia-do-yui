// Cada conta tem sua própria lista de avisos lidos neste navegador.
function iniciarAvisosDeRemarcacao(clienteId, appointments, showView, formatSlot) {
  const noticeDialog = document.getElementById('rescheduling-dialog');
  const bell = document.querySelector('.side-nav [data-view="notificacoes"]');
  const badge = document.createElement('span');
  badge.className = 'notice-count';
  badge.setAttribute('aria-hidden', 'true');
  bell.append(badge);
  const readKey = 'guren-rescheduling-read:' + clienteId;
  let readNotices = new Set();
  try {
    readNotices = new Set(JSON.parse(localStorage.getItem(readKey) || '[]'));
  } catch {}
  let displayedChanges = [];
  let displayedUnread = [];
  let dismissedForPage = false;

  function acknowledge(openBooking) {
    displayedUnread.forEach(change => readNotices.add(change.key));
    try {
      localStorage.setItem(readKey, JSON.stringify([...readNotices]));
    } catch {}
    const bookingId = displayedChanges[0]?.bookingId;
    displayedChanges = [];
    noticeDialog.close();
    if (openBooking) {
      showView('agendamentos');
      const row = document.getElementById('booking-' + bookingId);
      row?.focus();
      row?.scrollIntoView({ block: 'center' });
    }
    renderReschedulingNotices();
  }
  noticeDialog.querySelector('[data-acknowledge]').onclick = () => acknowledge(false);
  noticeDialog.querySelector('[data-open-rescheduled]').onclick = () => acknowledge(true);
  noticeDialog.addEventListener('cancel', () => {
    dismissedForPage = true;
  });
  document.addEventListener('close', () => renderReschedulingNotices(), true);
  window.addEventListener('storage', event => {
    if (event.key !== readKey) return;
    try {
      readNotices = new Set(JSON.parse(event.newValue || '[]'));
    } catch {
      return;
    }
    renderReschedulingNotices();
  });
  function reschedulingFor(item) {
    if (item.rescheduling?.length) return item.rescheduling;
    return item.status === 'Remarcado' ? [item] : [];
  }
  function renderReschedulingNotices() {
    const changes = appointments
      .flatMap(item =>
        reschedulingFor(item).map(change => ({
          ...change,
          service: item.service,
          bookingId: item.id,
          active: item.reserved && item.date === change.date && item.time === change.time,
          key: [item.id, change.changedAt || change.updatedAt, change.date, change.time].join(':')
        }))
      )
      .sort(
        (a, b) => Date.parse(b.changedAt || b.updatedAt) - Date.parse(a.changedAt || a.updatedAt)
      );

    const makeNotice = (change, canMarkRead = false) => {
      const notice = document.createElement('article');
      notice.className = 'rescheduling-notice';
      const icon = document.createElement('img');
      icon.className = 'rescheduling-icon';
      icon.src = 'assets/icons/calendar-days.svg';
      icon.alt = '';
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = change.byStaff
        ? 'A barbearia remarcou seu horário'
        : 'Seu horário foi remarcado';
      const detail = document.createElement('p');
      detail.textContent = change.service + ' · ' + formatSlot(change.date, change.time);
      content.append(title, detail);
      if (change.previousDate) {
        const previous = document.createElement('small');
        previous.textContent = 'Antes: ' + formatSlot(change.previousDate, change.previousTime);
        content.append(previous);
      }
      if (canMarkRead && change.byStaff !== false && !readNotices.has(change.key)) {
        const markRead = document.createElement('button');
        markRead.type = 'button';
        markRead.className = 'button button-outline';
        markRead.textContent = 'Marcar como lido';
        markRead.onclick = () => {
          readNotices.add(change.key);
          try {
            localStorage.setItem(readKey, JSON.stringify([...readNotices]));
          } catch {}
          renderReschedulingNotices();
        };
        content.append(markRead);
      }
      notice.append(icon, content);
      return notice;
    };
    document
      .getElementById('rescheduling-notices')
      .replaceChildren(...changes.map(change => makeNotice(change, true)));
    document
      .getElementById('latest-rescheduling-notice')
      .replaceChildren(...changes.slice(0, 1).map(change => makeNotice(change)));
    document.getElementById('notices-empty').hidden = changes.length > 0;
    const unread = changes.filter(
      change => change.byStaff !== false && !readNotices.has(change.key)
    );
    badge.hidden = !unread.length;
    badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
    bell.setAttribute(
      'aria-label',
      unread.length ? 'Notificações, ' + unread.length + ' não lidas' : 'Notificações'
    );
    const pending = unread
      .filter(change => change.active)
      .filter(
        (change, index, list) =>
          list.findIndex(item => item.bookingId === change.bookingId) === index
      );
    if (!dismissedForPage && pending.length && !document.querySelector('dialog[open]')) {
      displayedChanges = pending;
      displayedUnread = unread.filter(change =>
        pending.some(item => item.bookingId === change.bookingId)
      );
      document
        .getElementById('rescheduling-summary')
        .replaceChildren(...pending.map(change => makeNotice(change)));
      noticeDialog.showModal();
    }
  }

  return { renderReschedulingNotices, reschedulingFor };
}
