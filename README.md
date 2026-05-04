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
- Main scoreboard display is intentionally simplified for readability.

## Roadmap Ideas

- Multiple sport presets
- Theme packs and venue presets
- Optional remote sync mode
- OBS scene helper templates

## License

Choose and add your preferred license file for public release.
