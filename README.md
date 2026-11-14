# Flashcards Study App

A single-page flashcards app built with plain HTML, CSS and JavaScript (no frameworks, no build tools).

## How to run
Open `index.html` with VS Code's Live Server (right-click → **Open with Live Server**).

## Features
- Multiple decks: create, rename, delete (with confirmation)
- Cards: create, edit, delete (front/back text)
- Study mode: flip (3D animation), previous/next (wraps around), shuffle
- Debounced keyword search (300 ms) with match count; search never changes saved data
- Data saved to LocalStorage (decks, cards, last active deck) with versioning and safe fallback
- Accessible modal: focus trap, Esc to close, focus returns to the opener, background made inert
- Keyboard shortcuts: Space (flip), ← / → (navigate), Enter (save), Esc (close)
- Responsive layout, dark mode (`prefers-color-scheme`), visible focus styles, empty states, reduced-motion support

## Reflection
- **Where AI saved time:** I used Claude as my AI coding assistant. It walked me through setting up VS Code, Git, Copilot and Live Server on my Mac, then generated the full HTML/CSS/JS app (deck and card CRUD, an accessible modal, the 3D flip, search and LocalStorage persistence) in minutes. That left my time for testing every feature in Safari and committing working versions to GitHub, instead of writing boilerplate.
- **An AI bug I identified and fixed:** The AI told me to open VS Code's Source Control panel with ⌘⇧G. On a Mac that shortcut didn't work. When I pushed back, the correct shortcut turned out to be ⌃⇧G (Control, not Command). It showed me that AI can be confidently wrong about platform details, so I verify each instruction instead of assuming it's right. In the code, I also checked that a flipped card resets to the front when moving to the next card, so the next answer never flashes on screen.
- **A snippet I refactored for clarity:** The flip-reset logic was an inline block of class toggles inside `renderStudyCard()`. I pulled it out into a named helper so the render function reads clearly and the intent is documented in one place:
  ```js
  // Before (inside renderStudyCard)
  if (card.id !== view.shownCardId) {
    view.flipped = false;
    els.card.classList.add('no-transition');
    els.card.classList.remove('is-flipped');
    void els.card.offsetWidth;
    els.card.classList.remove('no-transition');
    view.shownCardId = card.id;
  }

  // After
  if (card.id !== view.shownCardId) {
    showFrontInstantly();
    view.shownCardId = card.id;
  }
  ```
- **An accessibility improvement I added:** The New Deck, New Card, Edit and Rename dialogs trap keyboard focus, close with Esc, make the page behind them inert, and return focus to the button that opened them. I tested this keyboard-only in Safari. I first had to turn on Safari → Settings → Advanced → "Press Tab to highlight each item", because Safari skips buttons on Tab by default. Every input also has a real `<label>`, and focus outlines are clearly visible in both light and dark mode.
- **Prompt changes that improved AI output:** Vague prompts like "how do I get started" gave generic answers. Adding context made a big difference: saying I'm on a Mac (so I got Mac shortcuts), that I needed precise step-by-step instructions, and that I had only one hour (so the AI prioritized a working app plus testing over explanations). Reporting exactly what I saw, like "the console.log isn't showing in Safari's Console tab", got targeted fixes instead of guesses.
