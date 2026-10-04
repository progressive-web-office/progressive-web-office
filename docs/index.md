---
layout: home
title: Progressive Web Office
description: A simple, private office suite that runs entirely in your browser.
hero:
  name: Progressive Web Office
  text: Your office suite, in the browser
  tagline: "Documents, spreadsheets, presentations and PDF — nothing leaves your device."
  image:
    src: /logo.svg
    alt: Progressive Web Office
  actions:
    - theme: brand
      text: Open the app
      link: https://progressive-web-office.github.io/progressive-web-office/
      target: _self
    - theme: alt
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Supported formats
      link: /formats/
features:
  - icon: 🔒
    title: Private by design
    details: Files are opened, edited and saved locally. No upload, no account, no tracking.
  - icon: 📶
    title: Works offline
    details: Install it as a Progressive Web App; it keeps working without a network connection.
  - icon: 📄
    title: Open formats first
    details: OpenDocument, Office Open XML, Markdown and MDZ packages, CSV and PDF.
  - icon: 🧪
    title: Live documents
    details: Python and JavaScript cells that know their dependencies, and interactive widgets — knobs, gauges, sliders — next to the text.
  - icon: 📁
    title: Your folders, wherever they are
    details: A file explorer for a folder of the device, Nextcloud, or a GitHub or GitLab repository — with linked notes, tags and templates.
  - icon: 📖
    title: Read and review
    details: PDF files and documents as pages, side by side or one at a time, with comments and single-key shortcuts.
---

<script setup>
import { withBase } from 'vitepress';
</script>

<div class="pwo-band">

<h2>See it at work</h2>
<p class="lead">One application for the files of every day, on a computer or a phone.</p>

<div class="pwo-shots">
  <figure><img :src="withBase('/screenshots/document.png')" alt="A lab report with an equation and a table in the word processor"><figcaption>Text documents: Word, OpenDocument, Markdown</figcaption></figure>
  <figure><img :src="withBase('/screenshots/spreadsheet.png')" alt="A spreadsheet with formulas"><figcaption>Spreadsheets with formulas and charts</figcaption></figure>
  <figure><img :src="withBase('/screenshots/start.png')" alt="The start screen of the application"><figcaption>Start from a file, a folder or a template</figcaption></figure>
  <figure><img :src="withBase('/screenshots/letter.png')" alt="A French letter laid out as usual, dated by a field"><figcaption>Templates with fields and springs</figcaption></figure>
  <figure><img :src="withBase('/screenshots/form-design.png')" alt="Fields drawn on a PDF page"><figcaption>PDF forms, designed and compiled</figcaption></figure>
  <figure><img :src="withBase('/screenshots/palette.png')" alt="The command palette listing actions by category"><figcaption>Every action in the command palette</figcaption></figure>
</div>

</div>
