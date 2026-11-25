(() => {
  const times = Object.freeze([
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
  ]);

  // Validação de datas: recusa datas inexistentes, domingos e Natal.
  function isOpenDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const day = new Date(date + 'T12:00:00');
    return (
      Number.isFinite(day.getTime()) &&
      day.getDate() === Number(date.slice(-2)) &&
      day.getDay() !== 0 &&
      !date.endsWith('-12-25')
    );
  }

  // A equipe só pode criar horários futuros dentro do expediente.
  function isFutureSlot(date, time) {
    return (
      isOpenDate(date) && times.includes(time) && new Date(date + 'T' + time).getTime() > Date.now()
    );
  }

  function getBlocks() {
    return document.documentElement.dataset.panelRole === 'cliente'
      ? gurenApi.data.occupied
      : gurenApi.data.blocks;
  }

  window.gurenAgenda = Object.freeze({ times, isOpenDate, isFutureSlot, getBlocks });
})();
