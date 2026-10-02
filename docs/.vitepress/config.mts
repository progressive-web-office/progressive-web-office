import { defineConfig } from 'vitepress';

// The app is published one level above the documentation (see pages.yml).
const APP_URL = process.env.DOCS_URL ? process.env.DOCS_URL.replace(/\/docs\/?$/, '/') : 'https://s-celles.github.io/progressive-web-office/';

export default defineConfig({
  title: 'Progressive Web Office (PWO)',
  description: 'A simple office suite that runs entirely in your browser.',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Formats', link: '/formats/' },
      { text: 'Requirements', link: '/requirements' },
      { text: 'Development', link: '/development' },
      { text: 'Open the app', link: APP_URL, target: '_self' },
    ],
    sidebar: [
      {
        text: 'User guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Text documents', link: '/guide/documents' },
          { text: 'Equations', link: '/guide/equations' },
          { text: 'Diagrams', link: '/guide/diagrams' },
          { text: 'Code cells (Python, JavaScript)', link: '/guide/code' },
          { text: 'LaTeX', link: '/guide/latex' },
          { text: 'Spreadsheets', link: '/guide/spreadsheets' },
          { text: 'Presentations', link: '/guide/presentations' },
          { text: 'PDF', link: '/guide/pdf' },
          { text: 'Printing', link: '/guide/printing' },
          { text: 'Folders and master documents', link: '/guide/folders' },
          { text: 'Git repositories', link: '/guide/git' },
          { text: 'Nextcloud / WebDAV', link: '/guide/cloud' },
          { text: 'Grist', link: '/guide/grist' },
          { text: 'Real-time collaboration', link: '/guide/collaboration' },
          { text: 'Sending to another device', link: '/guide/sharing' },
          { text: 'AI assistant', link: '/guide/assistant' },
        ],
      },
      {
        text: 'Formats',
        items: [
          { text: 'Supported formats', link: '/formats/' },
          { text: 'MDZ packages', link: '/formats/mdz' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Requirements', link: '/requirements' },
          { text: 'Development', link: '/development' },
          { text: 'Architecture', link: '/architecture' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/s-celles/progressive-web-office' }],
    search: { provider: 'local' },
  },
});
