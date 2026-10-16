### Install

1. Unzip the archive into `<Vencord>/src/userplugins/`; the folder has to be named `Questcord`
2. Rebuild Vencord, then press `Ctrl+R` in Discord
3. Enable **Questcord** under `Settings → Vencord → Plugins`

Updating? Replace the `Questcord` folder, rebuild and reload — your settings are kept.

Checking the download (optional): `sha256sum -c SHA256SUMS` verifies the archive, and `gh attestation verify Questcord-vX.Y.Z.zip -R zpt0/Questcord` verifies that this repository's release workflow built it.
