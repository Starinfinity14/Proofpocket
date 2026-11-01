(() => {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealSelector = '.stat-card, .panel, .quest-panel, .beta-banner, .onboarding-panel, .report-kpi, .deadline-item, .record-row, .step';
  const reveal = (root) => {
    if (reduceMotion || !root || !root.querySelectorAll) return;
    root.querySelectorAll(revealSelector).forEach((node, index) => {
      if (node.dataset.ppRevealed === '1') return;
      node.dataset.ppRevealed = '1';
      node.classList.add('pp-reveal');
      node.style.animationDelay = Math.min(index * 35, 210) + 'ms';
      node.addEventListener('animationend', () => {
        node.classList.remove('pp-reveal');
        node.style.removeProperty('animation-delay');
      }, { once: true });
    });
  };

  const activeView = () => document.querySelector('.view.active');
  const refreshMotion = () => {
    const view = activeView();
    if (!view) return;
    if (!reduceMotion) {
      view.classList.remove('pp-view-refresh');
      void view.offsetWidth;
    }
    reveal(view);
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshMotion();

    // The app switches screens by toggling .active; observe that without
    // changing its navigation/history logic.
    const viewObserver = new MutationObserver((changes) => {
      if (changes.some(change => change.attributeName === 'class')) refreshMotion();
    });
    document.querySelectorAll('.view').forEach(view => viewObserver.observe(view, {
      attributes: true, attributeFilter: ['class']
    }));

    // Newly rendered cards (records, deadlines, reports) receive the same
    // entrance treatment. No app data or HTML is modified.
    const contentObserver = new MutationObserver((changes) => {
      changes.forEach(change => change.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          if (node.matches?.(revealSelector)) reveal(node.parentElement || document);
          else reveal(node);
        }
      }));
    });
    document.querySelectorAll('.view').forEach(view => contentObserver.observe(view, {
      childList: true, subtree: true
    }));

    // Small press feedback for touch and mouse users.
    document.addEventListener('pointerdown', event => {
      const button = event.target.closest('button, .secondary-btn, .primary-btn');
      if (!button || button.disabled || reduceMotion) return;
      button.classList.add('pp-pressed');
      button.addEventListener('animationend', () => button.classList.remove('pp-pressed'), { once: true });
    }, { passive: true });

    // Keep motion observers lightweight when the page is hidden.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshMotion();
    });
  });

  if (document.readyState !== 'loading') {
    // DOMContentLoaded may already have fired when this file is loaded late.
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);
  }
})();