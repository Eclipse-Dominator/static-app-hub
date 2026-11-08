const search = document.querySelector<HTMLInputElement>('#app-search');
const grid = document.getElementById('app-grid');
const empty = document.getElementById('empty-state');
const count = document.getElementById('results-count');
const clearButton = document.getElementById('clear-filters');
const categorySelect = document.querySelector<HTMLSelectElement>('#category-select');
const sortSelect = document.querySelector<HTMLSelectElement>('#sort-select');
const platformChips = [...document.querySelectorAll<HTMLButtonElement>('[data-platform]')];

if (search && grid) {
  const cards = [...grid.querySelectorAll<HTMLElement>('[data-app]')];
  const total = cards.length;
  let platform = 'all';
  let category = 'all';
  let sort = 'recommended';

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get('q') ?? '';
  const initialPlatform = params.get('os') ?? 'all';
  const initialCategory = params.get('cat') ?? 'all';
  const initialSort = params.get('sort') ?? 'recommended';

  search.value = initialQuery;
  if (categorySelect) {
    const hasCategory = [...categorySelect.options].some((option) => option.value === initialCategory);
    categorySelect.value = hasCategory ? initialCategory : 'all';
    category = categorySelect.value;
  }
  if (sortSelect) {
    const hasSort = [...sortSelect.options].some((option) => option.value === initialSort);
    sortSelect.value = hasSort ? initialSort : 'recommended';
    sort = sortSelect.value;
  }
  if (platformChips.some((chip) => chip.dataset.platform === initialPlatform)) {
    platform = initialPlatform;
  }

  function syncChips() {
    for (const chip of platformChips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.platform === platform));
    }
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (search!.value.trim()) next.set('q', search!.value.trim());
    if (platform !== 'all') next.set('os', platform);
    if (category !== 'all') next.set('cat', category);
    if (sort !== 'recommended') next.set('sort', sort);
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  }

  function cardMatches(card: HTMLElement, tokens: string[]): boolean {
    if (platform !== 'all' && !(card.dataset.platforms ?? '').split(' ').includes(platform)) {
      return false;
    }
    if (category !== 'all' && card.dataset.category !== category) return false;
    if (tokens.length > 0) {
      const haystack = card.dataset.name ?? '';
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  }

  function applySort() {
    if (sort === 'recommended') {
      cards.forEach((card) => grid!.appendChild(card));
      return;
    }
    const sorted = [...cards].sort((a, b) => {
      if (sort === 'newest') {
        return (b.dataset.date ?? '').localeCompare(a.dataset.date ?? '');
      }
      return (a.dataset.nameSort ?? '').localeCompare(b.dataset.nameSort ?? '');
    });
    sorted.forEach((card) => grid!.appendChild(card));
  }

  function apply() {
    const tokens = search!.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;

    for (const card of cards) {
      const match = cardMatches(card, tokens);
      card.hidden = !match;
      if (match) visible += 1;
    }

    const filtered = tokens.length > 0 || platform !== 'all' || category !== 'all';
    if (count) {
      count.textContent = filtered
        ? `${visible} of ${total} app${total === 1 ? '' : 's'}`
        : `${total} app${total === 1 ? '' : 's'}`;
    }
    if (empty) empty.classList.toggle('is-visible', visible === 0);
    syncChips();
    applySort();
    syncUrl();
  }

  search.addEventListener('input', apply);

  for (const chip of platformChips) {
    chip.addEventListener('click', () => {
      platform = chip.dataset.platform ?? 'all';
      apply();
    });
  }

  categorySelect?.addEventListener('change', () => {
    category = categorySelect.value;
    apply();
  });

  sortSelect?.addEventListener('change', () => {
    sort = sortSelect.value;
    apply();
  });

  clearButton?.addEventListener('click', () => {
    search.value = '';
    platform = 'all';
    category = 'all';
    sort = 'recommended';
    if (categorySelect) categorySelect.value = 'all';
    if (sortSelect) sortSelect.value = 'recommended';
    apply();
    search.focus();
  });

  apply();
}

export {};
