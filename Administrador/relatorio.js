// Agrupa os atendimentos concluídos na semana da data selecionada, de segunda a domingo.
function exibirRelatorioSemanal(atendimentos, servicosIniciais) {
  const { localDate, prettyDate } = window.gurenStaff;
  const $ = selector => document.querySelector(selector);
  const selected = $('#report-date').value || localDate();
  const monday = new Date(selected + 'T12:00:00');
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const start = localDate(monday),
    end = localDate(sunday);
  const attendances = atendimentos.filter(item => item.date >= start && item.date <= end);
  $('#report-period').textContent = prettyDate(start) + ' a ' + prettyDate(end);
  const totals = $('#report-totals');
  totals.replaceChildren();
  for (const service of new Set([...servicosIniciais, ...attendances.map(item => item.service)])) {
    const term = document.createElement('dt');
    const value = document.createElement('dd');
    term.textContent = service;
    value.textContent = attendances.filter(item => item.service === service).length;
    totals.append(term, value);
  }
  const list = $('#report-attendance');
  list.replaceChildren();
  for (const row of attendances.length ? attendances : [null]) {
    const item = document.createElement('li');
    item.textContent = row
      ? [prettyDate(row.date), row.time, row.client, row.service].join(' · ')
      : 'Nenhum atendimento nesta semana.';
    list.append(item);
  }
}
