/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17202a',
        paper: '#f8fafc',
        line: '#d9e2ec',
        mint: '#1f9d8a',
        coral: '#e85d50',
        amber: '#d58a00',
        berry: '#a23b72'
      },
      boxShadow: {
        soft: '0 18px 45px rgba(23, 32, 42, 0.08)'
      }
    }
  },
  plugins: []
}
