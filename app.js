'use strict';

/* =========================================================
   Flashcards Study App
   Saved state (localStorage):
   {
     version: 1,
     decks: [{ id, name, createdAt }],
     cardsByDeckId: { [deckId]: [{ id, front, back, updatedAt }] },
     activeDeckId: string | null
   }
   ========================================================= */

const STORAGE_KEY = 'flashcards-app-state';
const STATE_VERSION = 1;
const SEARCH_DELAY_MS = 300;

/* ---------- Storage ---------- */

function defaultState() {
  return { version: STATE_VERSION, decks: [], cardsByDeckId: {}, activeDeckId: null };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const data = JSON.parse(raw);
    if (!data || data.version !== STATE_VERSION || !Array.isArray(data.decks)) {
      return defaultState();
    }

    const cardsByDeckId =
      data.cardsByDeckId && typeof data.cardsByDeckId === 'object' ? data.cardsByDeckId : {};
    data.decks.forEach((deck) => {
      if (!Array.isArray(cardsByDeckId[deck.id])) cardsByDeckId[deck.id] = [];
    });

    const activeExists = data.decks.some((d) => d.id === data.activeDeckId);
    return {
      version: STATE_VERSION,
      decks: data.decks,
      cardsByDeckId,
      activeDeckId: activeExists ? data.activeDeckId : (data.decks[0]?.id ?? null),
    };
  } catch (err) {
    console.warn('Saved data was unreadable; starting fresh.', err);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save to localStorage.', err);
  }
}

function makeId() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ---------- State ---------- */

let state = loadState();

// View-only state (never saved)
const view = {
  order: [],          // card ids in study order (changed by Shuffle)
  index: 0,           // position within the current study list
  flipped: false,
  query: '',
  shownCardId: null,  // which card is on screen; used to reset the flip on change
};

/* ---------- Element references ---------- */

const byId = (id) => document.getElementById(id);

const els = {
  newDeckBtn: byId('new-deck-btn'),
  deckList: byId('deck-list'),
  deckListEmpty: byId('deck-list-empty'),
  main: byId('main'),
  noDeck: byId('no-deck'),
  noDeckText: byId('no-deck-text'),
  deckView: byId('deck-view'),
  deckTitle: byId('deck-title'),
  renameDeckBtn: byId('rename-deck-btn'),
  deleteDeckBtn: byId('delete-deck-btn'),
  search: byId('search'),
  shuffleBtn: byId('shuffle-btn'),
  newCardBtn: byId('new-card-btn'),
  matchCount: byId('match-count'),
  cardScene: byId('card-scene'),
  card: byId('card'),
  cardFront: byId('card-front'),
  cardBack: byId('card-back'),
  frontText: byId('card-front-text'),
  backText: byId('card-back-text'),
  cardEmpty: byId('card-empty'),
  prevBtn: byId('prev-btn'),
  flipBtn: byId('flip-btn'),
  nextBtn: byId('next-btn'),
  position: byId('position'),
  cardList: byId('card-list'),
  status: byId('status'),
  modalBackdrop: byId('modal-backdrop'),
  modal: byId('modal'),
  modalTitle: byId('modal-title'),
  modalForm: byId('modal-form'),
  modalFields: byId('modal-fields'),
  modalError: byId('modal-error'),
  modalCancel: byId('modal-cancel'),
  modalSubmit: byId('modal-submit'),
};

/* ---------- Helpers ---------- */

function activeDeck() {
  return state.decks.find((d) => d.id === state.activeDeckId) || null;
}

function activeCards() {
  if (!state.activeDeckId) return [];
  if (!Array.isArray(state.cardsByDeckId[state.activeDeckId])) {
    state.cardsByDeckId[state.activeDeckId] = [];
  }
  return state.cardsByDeckId[state.activeDeckId];
}

// Search filters the VIEW only; the saved cards are never changed.
function filteredCards() {
  const q = view.query.trim().toLowerCase();
  const cards = activeCards();
  if (!q) return cards;
  return cards.filter(
    (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
  );
}

// Cards in study order: keeps the shuffled order and appends any new cards.
function studyCards() {
  const cards = filteredCards();
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const known = new Set(view.order);
  cards.forEach((c) => {
    if (!known.has(c.id)) view.order.push(c.id);
  });
  return view.order.filter((id) => cardsById.has(id)).map((id) => cardsById.get(id));
}

function resetView() {
  view.order = [];
  view.index = 0;
  view.flipped = false;
  view.query = '';
  view.shownCardId = null;
  els.search.value = '';
  clearTimeout(searchTimer);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function truncate(text, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Screen-reader announcement via the role="status" region
function announce(message) {
  els.status.textContent = '';
  setTimeout(() => {
    els.status.textContent = message;
  }, 50);
}

/* ---------- Rendering ---------- */

function render() {
  renderDeckList();
  renderDeckView();
}

function renderDeckList() {
  els.deckListEmpty.hidden = state.decks.length > 0;
  els.deckList.replaceChildren(
    ...state.decks.map((deck) => {
      const count = (state.cardsByDeckId[deck.id] || []).length;

      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck-btn';
      btn.dataset.deckId = deck.id;
      if (deck.id === state.activeDeckId) btn.setAttribute('aria-current', 'true');

      const name = document.createElement('span');
      name.className = 'deck-name';
      name.textContent = deck.name;

      const badge = document.createElement('span');
      badge.className = 'deck-count';
      badge.textContent = count;
      const badgeLabel = document.createElement('span');
      badgeLabel.className = 'visually-hidden';
      badgeLabel.textContent = count === 1 ? ' card' : ' cards';
      badge.append(badgeLabel);

      btn.append(name, badge);
      li.append(btn);
      return li;
    })
  );
}

function renderDeckView() {
  const deck = activeDeck();
  els.noDeck.hidden = Boolean(deck);
  els.deckView.hidden = !deck;

  if (!deck) {
    els.noDeckText.textContent = state.decks.length
      ? 'Select a deck from the list to start studying.'
      : 'No decks yet. Click “New Deck” to create your first one.';
    return;
  }

  els.deckTitle.textContent = deck.name;
  renderDeckContent();
}

// Everything inside the active deck (used by search so focus stays in the search box)
function renderDeckContent() {
  const cards = studyCards();
  renderMatchCount(cards.length);
  renderStudyCard(cards);
  renderCardList();
}

function renderMatchCount(shown) {
  const total = activeCards().length;
  const q = view.query.trim();
  els.matchCount.textContent = q
    ? `${shown} of ${plural(total, 'card')} match “${q}”`
    : plural(total, 'card');
}

function renderStudyCard(cards = studyCards()) {
  const hasCards = cards.length > 0;
  els.cardScene.hidden = !hasCards;
  els.cardEmpty.hidden = hasCards;
  els.prevBtn.disabled = !hasCards;
  els.nextBtn.disabled = !hasCards;
  els.flipBtn.disabled = !hasCards;
  els.shuffleBtn.disabled = cards.length < 2;

  if (!hasCards) {
    els.cardEmpty.textContent = activeCards().length
      ? 'No cards match your search.'
      : 'This deck has no cards yet. Click “New Card” to add one.';
    els.position.textContent = '';
    view.shownCardId = null;
    return;
  }

  // Guard against out-of-range index (e.g. after deleting or filtering)
  view.index = Math.min(Math.max(view.index, 0), cards.length - 1);
  const card = cards[view.index];

  if (card.id !== view.shownCardId) {
    showFrontInstantly();
  view.shownCardId = card.id;
  }

  els.frontText.textContent = card.front;
  els.backText.textContent = card.back;
  applyFlip();
  els.position.textContent = `Card ${view.index + 1} of ${cards.length}`;
}

// Snap the card front-up WITHOUT the flip animation, so the next
// card's answer doesn't flash on screen while it rotates back.
function showFrontInstantly() {
  view.flipped = false;
  els.card.classList.add('no-transition');
  els.card.classList.remove('is-flipped');
  void els.card.offsetWidth; // force reflow so the change applies immediately
  els.card.classList.remove('no-transition');
}

function applyFlip() {
  els.card.classList.toggle('is-flipped', view.flipped);
  els.cardFront.setAttribute('aria-hidden', String(view.flipped));
  els.cardBack.setAttribute('aria-hidden', String(!view.flipped));
  els.flipBtn.setAttribute('aria-pressed', String(view.flipped));
}

function renderCardList() {
  els.cardList.replaceChildren(
    ...filteredCards().map((card) => {
      const li = document.createElement('li');
      li.className = 'card-item';

      const text = document.createElement('div');
      text.className = 'card-item-text';
      const front = document.createElement('span');
      front.className = 'card-item-front';
      front.textContent = card.front;
      const back = document.createElement('span');
      back.className = 'card-item-back';
      back.textContent = card.back;
      text.append(front, back);

      const actions = document.createElement('div');
      actions.className = 'card-item-actions';
      actions.append(
        makeCardButton('edit', 'Edit', card),
        makeCardButton('delete', 'Delete', card)
      );

      li.append(text, actions);
      return li;
    })
  );
}

function makeCardButton(action, label, card) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = action === 'delete' ? 'btn btn-small btn-danger' : 'btn btn-small';
  btn.dataset.action = action;
  btn.dataset.cardId = card.id;
  btn.textContent = label;
  btn.setAttribute('aria-label', `${label} card: ${truncate(card.front)}`);
  return btn;
}

/* ---------- Modal (focus trap, Esc to close, focus returns to opener) ---------- */

let modal = null; // { onSubmit, opener }

function openModal({ title, fields, submitLabel = 'Save', onSubmit, opener }) {
  modal = { onSubmit, opener: opener || document.activeElement };
  els.modalTitle.textContent = title;
  els.modalSubmit.textContent = submitLabel;
  els.modalError.textContent = '';
  els.modalFields.replaceChildren(...fields.map(buildField));
  els.modalBackdrop.hidden = false;
  setBackgroundInert(true);
  els.modalFields.querySelector('input, textarea')?.focus();
}

function closeModal() {
  if (!modal) return;
  const { opener } = modal;
  modal = null;
  els.modalBackdrop.hidden = true;
  els.modalFields.replaceChildren();
  setBackgroundInert(false);
  restoreFocus(opener);
}

function buildField({ name, label, value = '', multiline = false, maxLength = 200 }) {
  const id = `field-${name}`;
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;

  const input = document.createElement(multiline ? 'textarea' : 'input');
  if (multiline) {
    input.rows = 3;
  } else {
    input.type = 'text';
    input.autocomplete = 'off';
  }
  input.id = id;
  input.name = name;
  input.value = value;
  input.maxLength = maxLength;
  input.required = true;
  input.setAttribute('aria-describedby', 'modal-error');

  wrapper.append(labelEl, input);
  return wrapper;
}

// Make everything behind the modal unreachable by Tab and screen readers
function setBackgroundInert(isInert) {
  document.querySelectorAll('[data-page-region]').forEach((el) => {
    el.toggleAttribute('inert', isInert);
  });
}

// Return focus to the button that opened the modal. If that button was
// re-rendered, find its replacement; otherwise fall back to <main>.
function restoreFocus(el) {
  if (el && el !== document.body && document.contains(el)) {
    el.focus();
    return;
  }
  if (el && el.dataset && el.dataset.cardId) {
    const match = document.querySelector(
      `[data-action="${el.dataset.action}"][data-card-id="${el.dataset.cardId}"]`
    );
    if (match) {
      match.focus();
      return;
    }
  }
  els.main.focus();
}

function trapFocus(event) {
  const focusable = [
    ...els.modal.querySelectorAll('input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'),
  ].filter((el) => !el.disabled);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- Deck actions ---------- */

function validateDeckName(name, ignoreId = null) {
  if (!name) return 'Please enter a deck name.';
  const duplicate = state.decks.some(
    (d) => d.id !== ignoreId && d.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) return 'You already have a deck with that name.';
  return '';
}

function selectDeck(id, { focusInList = false } = {}) {
  state.activeDeckId = id;
  resetView();
  saveState();
  render();
  if (focusInList) {
    els.deckList.querySelector(`[data-deck-id="${id}"]`)?.focus();
  }
}

function openNewDeckModal(opener) {
  openModal({
    title: 'New Deck',
    submitLabel: 'Create deck',
    opener,
    fields: [{ name: 'name', label: 'Deck name', maxLength: 60 }],
    onSubmit: ({ name }) => {
      const error = validateDeckName(name);
      if (error) return error;

      const deck = { id: makeId(), name, createdAt: Date.now() };
      state.decks.push(deck);
      state.cardsByDeckId[deck.id] = [];
      selectDeck(deck.id);
      announce(`Deck “${name}” created.`);
      return '';
    },
  });
}

function openRenameDeckModal(opener) {
  const deck = activeDeck();
  if (!deck) return;
  openModal({
    title: 'Rename Deck',
    submitLabel: 'Save name',
    opener,
    fields: [{ name: 'name', label: 'Deck name', value: deck.name, maxLength: 60 }],
    onSubmit: ({ name }) => {
      const error = validateDeckName(name, deck.id);
      if (error) return error;

      deck.name = name;
      saveState();
      render();
      announce(`Deck renamed to “${name}”.`);
      return '';
    },
  });
}

function deleteActiveDeck() {
  const deck = activeDeck();
  if (!deck) return;
  const count = activeCards().length;
  const ok = window.confirm(
    `Delete the deck “${deck.name}” and its ${plural(count, 'card')}? This can't be undone.`
  );
  if (!ok) return;

  state.decks = state.decks.filter((d) => d.id !== deck.id);
  delete state.cardsByDeckId[deck.id];
  state.activeDeckId = state.decks[0]?.id ?? null;
  resetView();
  saveState();
  render();
  announce(`Deck “${deck.name}” deleted.`);
  els.main.focus();
}

/* ---------- Card actions ---------- */

function openCardModal(card, opener) {
  const isEdit = Boolean(card);
  openModal({
    title: isEdit ? 'Edit Card' : 'New Card',
    submitLabel: isEdit ? 'Save changes' : 'Add card',
    opener,
    fields: [
      { name: 'front', label: 'Front (question)', value: card?.front, multiline: true, maxLength: 500 },
      { name: 'back', label: 'Back (answer)', value: card?.back, multiline: true, maxLength: 500 },
    ],
    onSubmit: ({ front, back }) => {
      if (!front || !back) return 'Both the front and the back need some text.';

      const cards = activeCards();
      if (isEdit) {
        const target = cards.find((c) => c.id === card.id);
        if (!target) return 'This card no longer exists.';
        target.front = front;
        target.back = back;
        target.updatedAt = Date.now();
        announce('Card updated.');
      } else {
        cards.push({ id: makeId(), front, back, updatedAt: Date.now() });
        announce('Card added.');
      }
      saveState();
      render();
      return '';
    },
  });
}

function deleteCard(cardId) {
  const cards = activeCards();
  const card = cards.find((c) => c.id === cardId);
  if (!card) return;
  if (!window.confirm(`Delete the card “${truncate(card.front)}”?`)) return;

  state.cardsByDeckId[state.activeDeckId] = cards.filter((c) => c.id !== cardId);
  view.order = view.order.filter((id) => id !== cardId);
  saveState();
  render();
  announce('Card deleted.');
  els.newCardBtn.focus();
}

/* ---------- Study mode ---------- */

function move(step) {
  const cards = studyCards();
  if (!cards.length) return;
  // Wrap around at both ends (no off-by-one, no dead buttons)
  view.index = (view.index + step + cards.length) % cards.length;
  renderStudyCard(cards);
}

function flip() {
  if (!studyCards().length) return;
  view.flipped = !view.flipped;
  applyFlip();
}

function shuffle() {
  const ids = studyCards().map((c) => c.id);
  // Fisher–Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  view.order = ids;
  view.index = 0;
  view.shownCardId = null; // force a front-up reset
  renderStudyCard();
  announce('Cards shuffled.');
}

/* ---------- Event listeners (each bound once; lists use delegation) ---------- */

let searchTimer = null;

els.newDeckBtn.addEventListener('click', (e) => openNewDeckModal(e.currentTarget));
els.renameDeckBtn.addEventListener('click', (e) => openRenameDeckModal(e.currentTarget));
els.deleteDeckBtn.addEventListener('click', deleteActiveDeck);
els.newCardBtn.addEventListener('click', (e) => openCardModal(null, e.currentTarget));
els.shuffleBtn.addEventListener('click', shuffle);
els.prevBtn.addEventListener('click', () => move(-1));
els.nextBtn.addEventListener('click', () => move(1));
els.flipBtn.addEventListener('click', flip);
els.card.addEventListener('click', flip);

els.deckList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-deck-id]');
  if (btn) selectDeck(btn.dataset.deckId, { focusInList: true });
});

els.cardList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const card = activeCards().find((c) => c.id === btn.dataset.cardId);
  if (!card) return;
  if (btn.dataset.action === 'edit') openCardModal(card, btn);
  if (btn.dataset.action === 'delete') deleteCard(card.id);
});

// Debounced search (300 ms)
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    view.query = els.search.value;
    view.index = 0;
    renderDeckContent();
  }, SEARCH_DELAY_MS);
});

// Modal: submit, cancel, Esc, Enter, focus trap, click outside
els.modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!modal) return;

  const values = {};
  new FormData(els.modalForm).forEach((value, key) => {
    values[key] = String(value).trim();
  });

  const error = modal.onSubmit(values);
  if (error) {
    els.modalError.textContent = error;
    const inputs = [...els.modalFields.querySelectorAll('input, textarea')];
    (inputs.find((i) => !i.value.trim()) || inputs[0])?.focus();
    return;
  }
  closeModal();
});

els.modalCancel.addEventListener('click', closeModal);

els.modalBackdrop.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
  } else if (e.key === 'Enter' && e.target.matches('textarea') && !e.shiftKey && !e.isComposing) {
    e.preventDefault(); // Enter saves; Shift+Enter adds a new line
    els.modalSubmit.click();
  } else if (e.key === 'Tab') {
    trapFocus(e);
  }
});

els.modalBackdrop.addEventListener('mousedown', (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});

// Global keyboard shortcuts for study mode
document.addEventListener('keydown', (e) => {
  if (modal || els.deckView.hidden) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const target = e.target;
  if (target.matches('input, textarea, select') || target.isContentEditable) return;

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    move(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    move(-1);
  } else if (e.key === ' ') {
    // Let a focused button handle Space itself, otherwise it would fire twice
    if (target.matches('button, a, summary')) return;
    e.preventDefault();
    flip();
  }
});

/* ---------- Start ---------- */

render();
