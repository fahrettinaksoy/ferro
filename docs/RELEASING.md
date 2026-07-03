# Releasing Ferro

Releases are fully automated via GitHub Actions ([release.yml](../.github/workflows/release.yml)).

## Steps

1. Make sure `main` is green in CI.
2. Update the version and changelog:
   ```bash
   npm version minor        # or patch / major — updates package.json + creates the git tag
   ```
   Move the `[Unreleased]` entries in `CHANGELOG.md` under the new version heading, commit.
3. Push the branch and the tag:
   ```bash
   git push origin main --follow-tags
   ```
4. The `Release` workflow builds dmg (macOS arm64+x64), nsis (Windows x64), AppImage + deb (Linux) and attaches them to a GitHub Release. `electron-updater` serves updates from the same release (publish provider: `github`).

## Code signing secrets

Configure these repository secrets to produce signed builds; without them the workflow still runs and produces unsigned artifacts:

| Secret                                                     | Purpose                                  |
| ---------------------------------------------------------- | ---------------------------------------- |
| `CSC_LINK`                                                 | macOS signing certificate (.p12, base64) |
| `CSC_KEY_PASSWORD`                                         | Password for `CSC_LINK`                  |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization                       |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | Windows signing certificate              |

Local unsigned packaging: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:unpack`.

## Notes

- Linux packages are not signature-verified by electron-updater; integrity rests on HTTPS + blockmap. Consider publishing checksums in the release notes.
- The npm version in `.nvmrc` / `engines` is the build baseline used by CI.
