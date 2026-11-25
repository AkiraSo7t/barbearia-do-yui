// O catálogo da API é compartilhado pelos três painéis.
(() => {
  window.gurenPreviewCatalog = {
    initialServices: ['Cabelo', 'Barba', 'Sobrancelha', 'Pigmentação'],
    getServices: () => gurenApi.data.services,
    readPlan: id => gurenApi.data.plans.find(plan => plan.id === id),
    readCustomPlans: () =>
      gurenApi.data.plans.filter(
        plan => !['basico', 'intermediario', 'completo'].includes(plan.id)
      ),
    requiresPigmentationTerm: name =>
      gurenApi.data.services.some(service => service.name === name && service.requiresTerm)
  };
})();
