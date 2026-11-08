const root = document.documentElement;
const toast = document.getElementById('toast');
let toastTimer: number | undefined;

function showToast(message: string) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* Theme ---------------------------------------------------------------- */

const themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');

function applyTheme(theme: 'light' | 'dark') {
  root.dataset.theme = theme;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* private mode */
  }
  themeButtons.forEach((button) => {
    button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');

themeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
  });
});

/* Copy buttons --------------------------------------------------------- */

const checkSvg =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 12.5 4.5 4.5L19.5 6.5"/></svg>';

document.addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!button) return;

  const text = button.dataset.copy ?? '';
  if (!text) return;

  const ok = await copyText(text);
  if (!ok) {
    showToast('Could not copy — select the text manually');
    return;
  }

  const original = button.innerHTML;
  const originalLabel = button.getAttribute('aria-label');
  button.classList.add('is-copied');
  button.innerHTML = checkSvg;
  button.setAttribute('aria-label', 'Copied');
  showToast('Copied to clipboard');
  window.setTimeout(() => {
    button.classList.remove('is-copied');
    button.innerHTML = original;
    button.setAttribute('aria-label', originalLabel ?? 'Copy to clipboard');
  }, 1600);
});

/* Header --------------------------------------------------------------- */

const header = document.querySelector<HTMLElement>('[data-header]');
if (header) {
  const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 6);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* Keyboard shortcuts --------------------------------------------------- */

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

  if (event.key === '/' && !typing) {
    const search = document.querySelector<HTMLInputElement>('#app-search');
    if (search) {
      event.preventDefault();
      search.focus();
    }
  }

  if (event.key === 'Escape' && target.id === 'app-search') {
    const search = target as HTMLInputElement;
    if (search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      search.blur();
    }
  }
});

export {};
