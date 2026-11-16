# CourtCast

CourtCast is a real-time basketball scoreboard overlay built for live games, events, and streams. It runs fully offline in the browser and provides fast keyboard-first control with a clean broadcast-friendly layout.

## Highlights

- Real-time game clock and shot clock controls
- Quick shot clock reset buttons (24s and 14s)
- Team branding with names, colors, and logo uploads
- Clickable possession arrows with visual active state
- Large team logo presentation for stronger team presence
- Control Hub modal for game configuration and operator actions
- Display mode for clean output on a second screen
- Editable drag-and-resize layout mode for custom positioning
- Local persistence so runtime state restores after reload
- Game log and printable game summary export
- Sound toggle and period auto-advance workflow

## Tech Stack

- HTML
- Vanilla JavaScript
- Tailwind CSS (compiled to style.css)

## Project Structure

- index.html: Main UI layout and controls
- app.js: State management, timers, input handlers, persistence, and rendering
- src/input.css: Tailwind source and custom component styles
- style.css: Built stylesheet output
- resources/PRD.md: Product requirements reference

## Getting Started

### Prerequisites

- Node.js 18+ (Node 22 works)
- npm
- Node.js 20+ for running Playwright tests

### Install

Run from the project root:

```bash
npm install
```

### Development Mode

Watches src/input.css and rebuilds style.css on changes:

```bash
npm run dev
```

### Production Build

Generates minified style.css:

```bash
npm run build
```

### Offline Release Build

Creates a distributable `dist` folder with minified JavaScript, the compiled stylesheet, and the buzzer audio. Open `dist/index.html` in a browser; Node.js is only needed to build it.

```bash
npm run build:release
```

This reduces file size and casual readability, but JavaScript delivered to a browser can still be inspected and copied. Do not treat minification as encryption or copy protection.

### Browser Tests

Install the test browser once, then run the suite. Tests build the release folder before starting:

```bash
npx playwright install chromium
npm test
```

The tests start a local server on port 4173 and also check that the app opens directly from disk while offline. Playwright and its browser are only needed for development, not to run CourtCast.

## Running the App

Open index.html in a browser.

For live operation, one common setup is:

1. Open index.html as the control view.
2. Click Open Display View to launch the clean output view.
3. Operate the clocks and controls from the control view.

## Core Controls

- Space: Play or pause clocks
- Z: Reset shot clock to 24
- X: Reset shot clock to 14
- H / J: Home score plus or minus
- K / L: Away score plus or minus
- A: Cycle possession
- B: Toggle buzzer sound
- E: Toggle Edit Mode
- M: Toggle Control Hub menu

## Notes

- CourtCast is designed for offline operation.
- Runtime state and layout settings are stored in localStorage.
- Team logos are processed on upload. Wait for the logo to be ready before applying settings; invalid images leave the previous logo unchanged. In Edit Mode, drag the logo's resize handles to change its size; the layout saves when you exit Edit Mode.
- Applying settings preserves clocks already in progress. A new duration updates a paused clock that is still at its previous full value; otherwise it applies on the next reset.
- Use **Correct Clocks** in the Control Hub or on the period-end screen to enter an exact game or shot clock time, or adjust a draft in one-second or one-tenth-second steps. Opening the editor pauses both clocks; closing it does not resume them. Apply each clock independently, then resume with Space.
- Applying a shot-clock correction turns it on even if it was automatically switched off. Later shot-clock resets and possession changes still follow the existing final-24-seconds rule. An active shot clock at zero must be corrected or reset before play can resume.
- Full Reset and clearing the game log require confirmation.
- Main scoreboard display is intentionally simplified for readability.

## Roadmap Ideas

- Multiple sport presets
- Theme packs and venue presets
- Optional remote sync mode
- OBS scene helper templates

## License

Choose and add your preferred license file for public release.
