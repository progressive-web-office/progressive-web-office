---
description: Open a Grist document (self-hosted or not) as a spreadsheet and send your changes back; server setup (API key, HTTPS, CORS).
---

# Grist

[Grist](https://www.getgrist.com/) is a relational spreadsheet, available as
open-source software and part of La Suite numérique. Progressive Web Office
can open a Grist document as a workbook, let you edit it with the usual
spreadsheet tools, and send the changes back to Grist.

## Opening a document

1. On the start screen, click **Open from Grist**.
2. The first time, enter the **server address** (for example
   `https://grist.example.org`) and your **API key**: in Grist, open your
   profile settings and create or copy the key in the *API* section. The key
   is checked, then kept only in this browser and sent only to that server.
3. Choose a team site, then a document.

Each table becomes a sheet named after it:

- the first row holds the column labels;
- the first column, **id**, holds the record ids — leave it alone: it tells
  existing rows from new ones;
- formula columns show their computed values; dates are shown as dates.

## Sending changes back

Click **Save** (<kbd>Ctrl</kbd>+<kbd>S</kbd>): only the changes are sent.

| In the sheet | In Grist |
|--------------|----------|
| a cell changed | the record is updated (that field only) |
| a row added at the end, with an empty **id** | a record is added |
| a row deleted | the record is deleted, after confirmation |

Formula columns, the id column and columns of complex types (references,
choice lists, attachments) are shown but never written. Sheets that are not
tables of the document (for example a new "Notes" sheet) are ignored. After
saving, the document is reloaded from Grist, so new rows get their ids and
formulas their new values.

Changes made meanwhile by other people are kept unless they touched the same
cells: only the cells you changed are written. **Save as…** still saves a
local copy (`.xlsx`, `.ods`, `.csv`).

## Server setup (self-hosted Grist)

Progressive Web Office calls the Grist REST API **from your browser**: nothing
goes through another server. Two conditions apply:

1. **HTTPS**: the application only connects to `https://` addresses.
2. **CORS**: by default, a browser blocks a web page from calling an API on
   another domain unless the server allows that page's origin. Allow the
   origin of the application — `https://progressive-web-office.github.io` for the public
   version, or your own address if you host it — on the `/api/` paths.

The simplest way is to add the headers in the reverse proxy in front of
Grist. With **nginx**:

```nginx
location /api/ {
    set $pwo "https://progressive-web-office.github.io";
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin $pwo always;
        add_header Access-Control-Allow-Methods "GET, POST, PATCH, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Max-Age 86400 always;
        return 204;
    }
    proxy_hide_header Access-Control-Allow-Origin;
    add_header Access-Control-Allow-Origin $pwo always;
    proxy_pass http://grist:8484;   # your Grist upstream
    proxy_set_header Host $host;
}
```

With **Caddy**:

```
grist.example.org {
    @api path /api/*
    @preflight {
        method OPTIONS
        path /api/*
    }
    header @api Access-Control-Allow-Origin "https://progressive-web-office.github.io"
    handle @preflight {
        header Access-Control-Allow-Origin "https://progressive-web-office.github.io"
        header Access-Control-Allow-Methods "GET, POST, PATCH, DELETE, OPTIONS"
        header Access-Control-Allow-Headers "Authorization, Content-Type"
        respond 204
    }
    reverse_proxy grist:8484
}
```

Only requests carrying a valid API key are accepted by Grist, and the key is
sent in the `Authorization` header (never in the URL). If the connection
fails, Progressive Web Office tells you whether the server could not be
reached (address, HTTPS or CORS) or refused the key.
