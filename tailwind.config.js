/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './app.js'],
  safelist: ['resize-handle-n', 'resize-handle-s', 'resize-handle-e', 'resize-handle-w', 'resize-handle-ne', 'resize-handle-nw', 'resize-handle-se', 'resize-handle-sw'],
  theme: {
    extend: {},
  },
  plugins: [],
}
