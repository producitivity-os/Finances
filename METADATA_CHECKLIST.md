# App Metadata Checklist

## Identity

- Finalize app name for all surfaces.
  Files: [package.json](/Users/mustafayousif/Code/Finances/package.json:1), [src-tauri/Cargo.toml](/Users/mustafayousif/Code/Finances/src-tauri/Cargo.toml:1), [src-tauri/tauri.conf.json](/Users/mustafayousif/Code/Finances/src-tauri/tauri.conf.json:1)
- Lock the bundle identifier.
  File: [src-tauri/tauri.conf.json](/Users/mustafayousif/Code/Finances/src-tauri/tauri.conf.json:1)
- Add a clear one-line description.
  Files: [package.json](/Users/mustafayousif/Code/Finances/package.json:1), [src-tauri/Cargo.toml](/Users/mustafayousif/Code/Finances/src-tauri/Cargo.toml:1)
- Fill in author, publisher, website, support email, and repository URL.
  Files: [src-tauri/Cargo.toml](/Users/mustafayousif/Code/Finances/src-tauri/Cargo.toml:1), [README.md](/Users/mustafayousif/Code/Finances/README.md:1)

## Versioning

- Choose the release versioning scheme.
- Keep app version aligned across frontend and Tauri config.
  Files: [package.json](/Users/mustafayousif/Code/Finances/package.json:1), [src-tauri/Cargo.toml](/Users/mustafayousif/Code/Finances/src-tauri/Cargo.toml:1), [src-tauri/tauri.conf.json](/Users/mustafayousif/Code/Finances/src-tauri/tauri.conf.json:1)
- Create a release notes template for future tags.

## Branding

- Create the master logo/icon source file.
- Export the full icon set for app bundles.
  Folder: [src-tauri/icons](/Users/mustafayousif/Code/Finances/src-tauri/icons:1)
- Verify small-size readability at `16px`, `32px`, `64px`, and installer sizes.
- Replace any generated placeholder icons.

## Product Copy

- Write the short product description.
- Write the long product description.
- Define 3-5 core feature bullets.
- Draft onboarding/help copy for first-run surfaces.
- Draft changelog/release summary copy style.

## Legal

- Choose and add the project license.
  File to add: `LICENSE`
- Document privacy expectations for financial data.
- Add terms/support/privacy links if the app will be distributed publicly.

## Distribution

- Review app title, installer title, and executable metadata on each platform.
- Confirm bundle targets are the ones you actually want to ship.
  File: [src-tauri/tauri.conf.json](/Users/mustafayousif/Code/Finances/src-tauri/tauri.conf.json:1)
- Prepare screenshots and release assets for GitHub/store listings.

## Validation

- Build on macOS, Windows, and Linux and inspect final bundle metadata.
- Check icon rendering in dock/taskbar/start menu.
- Check version, title, and identifier in the produced app bundle.
- Verify README, workflow, and release docs all use the same naming.

## Nice-to-Have

- Add an About screen inside the app.
- Add a visible app version/build number in Settings.
- Add a release checklist to the repo for every tagged build.
