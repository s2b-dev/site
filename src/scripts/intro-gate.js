(function () {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (sessionStorage.getItem('s2b-intro-seen') === '1') return;
    sessionStorage.setItem('s2b-intro-seen', '1');
  } catch (e) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  }
  document.documentElement.classList.add('intro-on');
})();
