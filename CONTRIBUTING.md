# Contributing

Read README.md first. Windows is the supported target. Browser previews do not replace native desktop verification.

Run npm ci, npm run check, npm test, npm run test:rust, and npm run tauri build. Use Prettier for frontend code and cargo fmt for Rust. Write regression tests for observable user behavior.

Use an absolute disposable QUICKMD_DATA_DIR for desktop development and temporary folders for tests. Never test deletion, migration or write failures on personal notes. PRs should describe the trigger, resulting behavior, validation and unverified environments. Use Note, Scratchpad, Library and Archive consistently.

Keep translation keys stable and both src/locales catalogues complete, including interpolation parameters. User content is never translated or renamed when the language changes. Update lockfiles and dependency notices when dependencies change. See SECURITY.md before reporting security issues; do not share personal files or credentials.
