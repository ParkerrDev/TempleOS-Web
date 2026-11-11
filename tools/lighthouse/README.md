# Lighthouse check

Run `npm run test:lighthouse` after building the emulator. It runs the mobile
and desktop Lighthouse defaults, writes JSON/HTML reports under `tmp/lighthouse`,
and fails if a category scores below 100 or the run has warnings. Reports retain
the source commit, dirty-file list, key source/build hashes, Lighthouse version,
browser environment and measurement settings.

The default is a local production-style mirror: HTTP/2, TLS, Brotli, the site's
headers and CDN redirects. Chromium maps the production hostname to the mirror
so chat and presence receive the origin they allow. Their services, the OS and
the assets remain enabled. A temporary certificate is trusted only by the audit
browser. This needs Chromium and OpenSSL; `CHROMIUM` overrides the executable.

`node tools/lighthouse/check.mjs https://templeosweb.netlify.app/` audits the live
site without the mirror, hostname mapping or certificate override. Neither mode
is a PageSpeed Insights service result. Audit the deployed URL again after its
commit and sibling dependency pins have been published.

Agentic browsing reports both the category score and the number of applicable
checks passed. The current Lighthouse configuration has two applicable checks
for this site; non-applicable checks do not count as passes.
