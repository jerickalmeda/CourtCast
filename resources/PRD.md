# Project Requirements Document: Local Web Scoreboard

## 1. Product Overview
**Product Name:** (Working Title) CourtCast / Local Hoops Board  
**Objective:** Develop a completely free, 100% offline, web-based basketball scoreboard and timer system. The application must provide professional-grade visual layouts for gym projectors while offering the scorer a high-density, hidden control panel for rapid game management.

## 2. Target Use Cases & Constraints
*   **Primary Use Case:** Live basketball games where an operator connects a laptop or tablet directly to a gym TV or projector via HDMI/Wireless Cast. 
*   **Target Hardware Constraints:** The application must be incredibly lightweight. It needs to run flawlessly at 60fps without thermal throttling or memory bloat on portable devices with as little as 8GB of RAM (such as a standard Windows tablet) stationed at the scorer's table.
*   **Network Constraints:** Must function 100% offline. Zero reliance on active internet connections, cloud databases, or external asset loading (CDNs must be localized for the final build).

## 3. Tech Stack & Architecture
*   **Frontend UI:** HTML5 & Tailwind CSS. Tailwind will be utilized for rapid, high-contrast styling and responsive grid structures for the control panel.
*   **Logic & State:** Vanilla JavaScript (ES6+). No heavy frameworks (React/Vue) to ensure instant load times and zero build-step requirements for Version 1.
*   **Development Workflow:** Optimized for development within VS Code, leveraging GitHub Copilot to rapidly scaffold boilerplate DOM manipulation, hotkey mapping, and repetitive event listeners.
*   **Future Scalability (v2.0):** The architecture should remain decoupled so that a backend (e.g., PHP and PostgreSQL) can be easily attached later for tracking tournament brackets, player stats, and league standings.

## 4. Core Features & Specifications

### A. The Display Interface (Viewer Facing)
*   **High-Visibility Elements:** Large digital fonts for Game Clock, Shot Clock, Home Score, and Away Score.
*   **Free-Form Drag & Drop:** An "Edit Mode" toggle that unlocks absolute positioning, allowing the operator to click and drag individual scoreboard elements to fit the specific aspect ratio of the connected display.
*   **Dynamic Styling:** Elements must instantly reflect custom team names and jersey colors inputted by the operator.

### B. The Control Hub (Operator Facing)
*   **Hidden Modal:** A dense, settings-driven control panel hidden behind a hotkey (e.g., `M` for Menu).
*   **Configuration Inputs:** 
    *   Text inputs for Home/Away team names.
    *   Hex color pickers for team jersey colors.
    *   Numerical inputs for custom period durations and shot clock resets.
*   **Visibility Toggles:** Pill-style buttons to show/hide specific elements on the fly (e.g., hiding the shot clock if the league doesn't use one).

### C. The Timing Engine
*   **Anti-Drift Logic:** The timer cannot rely on standard `setInterval()` subtraction, which drifts out of sync on background tabs. It must calculate remaining time by comparing `Date.now()` to an absolute end-time timestamp.
*   **Clock Sync:** The Shot Clock and Game Clock must pause/play synchronously from a single master command.
*   **Buzzer Triggers:** The logic must support firing an auditory buzzer event precisely at `00.0` for both the shot clock violation and period end.

### D. Input Mapping (Hotkeys)
The system must be fully operable via a single hand on a standard keyboard without requiring a Numpad. 
*   `Spacebar`: Master Play/Pause toggle for all active clocks.
*   `Z` / `X`: Reset shot clock to full (24s) or offensive rebound (14s).
*   `H` / `J`: Increment/Decrement Home Score.
*   `K` / `L`: Increment/Decrement Away Score.
*   `E`: Toggle Edit/Drag Mode.
*   `M`: Toggle Settings Modal.

## 5. Milestones & Implementation Plan

*   **Phase 1: UI Skeleton & Tailwind Integration**
    *   Setup `index.html` with Tailwind utilities.
    *   Design the full-screen layout and typography.
*   **Phase 2: Core Engine & Hotkeys**
    *   Implement the `AccurateTimer` Javascript class.
    *   Bind alphanumeric hotkeys to scoring and timer state functions.
*   **Phase 3: The Control Panel & Customization**
    *   Build the hidden modal UI.
    *   Wire up color pickers, name inputs, and visibility toggles to the DOM.
*   **Phase 4: Drag & Drop Logic**
    *   Implement the mouse-tracking script for absolute positioning.
    *   Add the visual "Edit Mode" safety toggles.