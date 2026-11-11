# Rhēma desktop site

This branch hosts the desktop Bible study site at `https://rhema-greek-vocab-desktop.web.app`. It is a separate Firebase Hosting site in the existing project, so it uses the same account and study data as the phone app.

The phone/PWA code lives on `main` and its Hosting site is `greek-vocab-leaderboard`. Keep desktop changes on this branch. The desktop-only entry points are `desktop-rhema.css` and `desktop-rhema.js`; `index.html` and `app.js` have desktop-specific guards. The existing Rhema code and data power both sites.

Deploy only the named desktop target:

```sh
firebase deploy --only hosting:rhemaDesktop --project greek-vocab-leaderboard
```

The Firebase config in this branch contains only that target and no functions, Firestore, Storage, or default Hosting deployment.
