The CAPTCHA image comes from ccxpLite's sanitized login fixture
(`test/browser-fixtures/host-assets/1bc7243cd24e-auth_img.png`, MIT license,
https://github.com/sago-cream/ccxp-lite). It is an offline test image and carries
no account, session, or live challenge. The browser test intercepts every
request and never contacts CCXP. Login field names and meeting-link patterns
were checked against the live CCXP interface on 2026-09-24; test titles and
contents are synthetic.

`meeting.pdf` is a generated one-page PDF containing only “Campus budget
approved.” It verifies the actual PDF parser and indexing path on both Mac and
Oracle ARM64 without committing a protected university document.
