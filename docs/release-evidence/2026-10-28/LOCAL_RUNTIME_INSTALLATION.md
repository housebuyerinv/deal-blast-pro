# BuyerMatch local runtime installation — October 28, 2026

Status: official runtime installation completed; Windows restart required before
Docker engine verification and full-stack acceptance.

## License and compatibility

The owner explicitly confirmed fewer than 250 employees AND less than US$10 million
annual revenue, with no government use. This meets Docker Desktop's published
small-business free-use criteria: https://docs.docker.com/subscription-billing/desktop-license/.
No purchase or subscription was initiated.

Read-only Windows inspection reported Windows 11 Home, 64-bit, build 26300.9711
(26H2), AMD Ryzen 7 3700X, 34,264,322,048 bytes physical RAM, firmware virtualization
enabled and SLAT supported. LanmanServer is running with Automatic startup.
Docker's installer passed its prerequisite phase on this host. Linux containers
are the intended backend. This is installation compatibility evidence, not a claim
that this Windows build has received independent Docker certification.

C: had 28,060,278,784 bytes free before installation and 21,486,247,936 bytes
after installation. Recheck before pulling local Supabase images; image and volume
capacity has not yet been measured.

## Actual installation receipts

- Initial `wsl --install --no-distribution` without Windows administrator rights
  failed. A Microsoft.WSL winget package attempt also failed with 0x80073d28
  (administrator privileges required).
- Elevated official Windows `wsl.exe --install --no-distribution` installed WSL.
  Verified `wsl --version`: WSL 3.0.3.0, kernel 6.18.54.1-1; default WSL version 2.
  No extra Ubuntu distribution was requested.
- Docker Desktop 4.97.0 (244584) installed through winget from
  https://desktop.docker.com/win/main/amd64/244584/Docker%20Desktop%20Installer.exe.
  Winget verified SHA256 2668273f82b342a058a28f9ab53ea7bddde10bb6d51307ce2ec54c2d36459744.
  Installer flags: `install --quiet --accept-license --backend=wsl-2`.
- Docker installer log at `C:\ProgramData\DockerDesktop\install-log-admin.txt`
  reports installation succeeded and Windows features VirtualMachinePlatform and
  Microsoft-Windows-Subsystem-Linux enabled with a required computer restart.
- Docker CLI runs: 29.9.2, API 1.56. First Desktop start attempted; engine pipe
  unavailable before reboot. WSL status likewise reports the virtual machine
  platform cannot start in the current boot. No engine success is claimed.

## Resume after owner-controlled restart

1. Verify WSL2 and Docker engine, then remaining free disk space.
2. Use only `acceptance/local-synthetic/supabase/config.toml`, project
   `buyermatch-local-synthetic`, API 55321, DB 55322, SMTP capture 55324,
   application origin http://127.0.0.1:5189. Never use the root Supabase config.
3. Inspect existing containers and ports; preserve unrelated resources. Start only
   the dedicated stack. Keep service credentials private and load no hosted env files.
4. Install actual schema into the fresh local database with the existing guarded
   loader. Run real Auth, private Storage, buyer workflows, matching and browser
   acceptance; fix demonstrated defects and commit changes locally.
5. Post actual results to PR #2. Do not repeat unrelated completed tests.

No full-stack acceptance ran during installation. No S2, Production or MoneyMap
changes, hosted deployments, Stripe transactions, purchases or customer campaigns
were initiated. No restart was initiated by the agent.

Official instructions: https://learn.microsoft.com/en-us/windows/wsl/install and
https://docs.docker.com/desktop/setup/install/windows-install/.
