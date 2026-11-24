# PRIME on GitHub (Windows)

Repo: **[kasra77bj/prime-csc4330](https://github.com/kasra77bj/prime-csc4330)** (public).

The repo root is the whole **`Milestone 2`** folder, not just this app:

| Repo path | What |
|---|---|
| `PRIME_System/` | The working app (this folder): backend, frontend, data, docs |
| `Claude/` | Milestone 2 design work: plan, design system, wireframes, report generator, exports |
| `Claude outputs/` | Screenshots of the running app |
| `README.md`, `.gitignore` | Repo-wide overview and ignore rules |

The Phase 0–2 history is in the repo (it was imported from `prime-history.bundle`, which is no longer needed and is git-ignored).

## Kasra: working from the Box folder
The Box folder `...\Project\Milestone 2` is already a Git repo connected to GitHub. Run Git commands **from `Milestone 2`**, not from `PRIME_System`:
```powershell
cd "C:\Users\sbanij2\Box\Courses\Fall 2026\CSC 4330 - Software System Development\Project\Milestone 2"
git pull
git add -A
git commit -m "Describe the change"
git push
```
Docker and `make` commands still run from `PRIME_System`.

## Teammates: first-time setup
1. Install the tools in **PowerShell**, then open a new PowerShell window:
   ```powershell
   winget install --id Git.Git -e
   ```
2. Tell Git who you are (use the email on your GitHub account, or your GitHub noreply address from github.com/settings/emails):
   ```powershell
   git config --global user.name "Your Name"
   git config --global user.email "<your GitHub email>"
   ```
3. Clone the repo to a non-Box folder and go into the app:
   ```powershell
   cd C:\dev
   git clone https://github.com/kasra77bj/prime-csc4330.git
   cd prime-csc4330\PRIME_System
   ```
   The first `git push` opens a browser window to sign in to GitHub. Kasra must first add you under GitHub → repo → Settings → Collaborators → Add people.
4. Copy the six `.pkl` files from Box (`Milestone 2\PRIME_System\ml_models\`) into `prime-csc4330\PRIME_System\ml_models\`.
5. Copy `.env.example` to `.env`, then follow the Quick start in `PRIME_System\README.md`.

## What is NOT in the repo (on purpose)
| Not pushed | Why | Where it lives |
|---|---|---|
| `PRIME_System\ml_models\*.pkl` | The Random Forest is 125 MB (GitHub's limit is 100 MB per file) | Box: `Milestone 2\PRIME_System\ml_models\`; teammates copy them into their clone |
| `.env` | Local settings/secrets | Copy `.env.example` to `.env` |
| `node_modules`, `.venv`, `PRIME_System\data\processed\*.parquet` | Generated / installed | Created by `docker compose up` (seed + ingest) or `npm install` |
| `prime-history.bundle` | Old history export, already imported | Box only |

Note: the repo is public, so `raw_data\raw.xlsx` (the lab reference sheet), the Milestone 2 report files in `Claude\`, and the demo passwords in the seed are public too. The demo passwords only work with `DEMO_MODE=true` on your own laptop.

Tip: Box syncing a `.git` folder usually works, but if Box ever reports sync conflicts inside `.git`, clone the repo to a non-Box folder (e.g. `C:\dev\prime-csc4330`) and copy `PRIME_System\ml_models\` into it.
