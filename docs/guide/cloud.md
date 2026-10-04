---
description: Open and save files on Nextcloud, ownCloud or any WebDAV server, with conflict detection; server setup (app password, HTTPS, CORS).
---

# Nextcloud and WebDAV

Progressive Web Office can open and save files directly on **Nextcloud**,
**ownCloud** or any **WebDAV** server — for example an institution's cloud.

## Connecting

1. On the start screen, click **Open from Nextcloud / WebDAV**.
2. The first time, enter:
   - the **server address**, for example `https://cloud.example.org`;
   - your **user name**;
   - an **app password**: in Nextcloud, *Settings → Security → Create new
     app password*. Prefer it to your main password: you can revoke it at
     any time, and it does not give access to your account settings.

   For another WebDAV server, enter its full WebDAV address (for example
   `https://dav.example.org/webdav`) and your password.
3. Browse the folders and choose a file.

Accounts are kept in this browser only and the password is sent only to that
server. **Forget** removes an account.

## Saving

- A file opened from the cloud is saved back to the same place with **Save**
  (<kbd>Ctrl</kbd>+<kbd>S</kbd>); the header shows **☁** and the server.
- **☁ Save to the cloud** saves any open document to a folder and file name
  you choose; the extension decides the format (`.docx`, `.odt`, `.md`,
  `.xlsx`…).

### Conflicts

Progressive Web Office never silently overwrites someone else's work. If the
file was modified on the server since you opened it (or already exists when
you save a new file), it asks you to:

- **save a copy next to it** (`name-copy-YYYYMMDD-HHMMSS.ext`, the default), or
- **replace the file on the server**.

## Folders used, and where documents come from

The folders you open files from, or save to, are listed on the start screen
under **Repositories and servers used**: a click opens the server at that
folder again; **×** forgets one. A document opened from or saved to the
server keeps its address (in the recent files, and in the properties of
OpenDocument and Microsoft Office files): opened again, **Save** writes it
back there — the server is asked before replacing a file that changed.
**✕ Detach** unties it. Both can be turned off in the settings, as for
[Git repositories](./git#repositories-used-and-where-documents-come-from).

## Server setup

The browser talks to the server directly; nothing goes through another
server. Two conditions apply:

1. **HTTPS**.
2. **CORS**: the server must allow the origin of the application —
   `https://progressive-web-office.github.io` for the public version, or your own address
   if you host it — on the WebDAV paths. Nextcloud does not do this by
   default, so it needs a change by the administrator.

With an **nginx** reverse proxy in front of Nextcloud:

```nginx
location /remote.php/dav/ {
    set $pwo "https://progressive-web-office.github.io";
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin $pwo always;
        add_header Access-Control-Allow-Methods "GET, PUT, PROPFIND, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth, If-Match, If-None-Match" always;
        add_header Access-Control-Max-Age 86400 always;
        return 204;
    }
    proxy_hide_header Access-Control-Allow-Origin;
    add_header Access-Control-Allow-Origin $pwo always;
    add_header Access-Control-Expose-Headers "ETag, OC-ETag" always;
    proxy_pass http://nextcloud;   # your Nextcloud upstream
    proxy_set_header Host $host;
}
```

Nextcloud apps that add CORS support to WebDAV for chosen origins can be used
instead of the proxy configuration.

If the connection fails, Progressive Web Office tells you whether the server
could not be reached (address, HTTPS or CORS) or refused the user name or app
password. On a cloud you do not administer, you can still download the file,
edit it, and upload it again.
