# Putting PRIME on GitHub (Windows, one time)

Repo: **`prime-csc4330`** (public). The project history so far (Phases 0–2) comes from `prime-history.bundle`, which sits next to this folder (in `Milestone 2\`).

## 1. Install the tools (about 5 minutes)
Open **PowerShell** and run:
```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```
Close PowerShell and open a new one (so it sees the new programs), then tell Git who you are and sign in to GitHub:
```powershell
git config --global user.name "Kasra Banijamali"
git config --global user.email "<the email on your GitHub account>"
gh auth login          # choose: GitHub.com → HTTPS → Yes (authenticate Git) → Login with a web browser
```

## 2. Turn this folder into a Git repo with the full history
```powershell
cd "C:\Users\sbanij2\Box\Courses\Fall 2026\CSC 4330 - Software System Development\Project\Milestone 2\PRIME_System"
git init -b main
git fetch ..\prime-history.bundle main:refs/remotes/bundle/main
git reset bundle/main
git checkout -- Makefile
git status
```
`git status` should list only two leftover files under "Untracked files": `frontend/src/pages/FoundationPage.tsx` and `FoundationPage.test.tsx`. Delete them:
```powershell
Remove-Item frontend\src\pages\FoundationPage.tsx, frontend\src\pages\FoundationPage.test.tsx
git status        # "nothing to commit, working tree clean"
git log --oneline # the Phase 0–2 commits
```

## 3. Create the GitHub repo and push
```powershell
gh repo create prime-csc4330 --public --source . --push --description "PRIME: real-time monitoring and AI process control for concrete 3D printing (CSC 4330, Fall 2026)"
```
Open it with `gh repo view --web`. Add Carlos: GitHub → repo → Settings → Collaborators → Add people.

## What is NOT in the repo (on purpose)
| Not pushed | Why | Where it lives |
|---|---|---|
| `ml_models\*.pkl` | The Random Forest is 125 MB (GitHub's limit is 100 MB per file) | Box: `Milestone 2\PRIME_System\ml_models\` – teammates copy them into their clone |
| `.env` | Local settings/secrets | Copy `.env.example` to `.env` |
| `data\processed\*.parquet`, `node_modules`, `.venv` | Generated / installed | Created by `docker compose up` (seed + ingest) or `npm install` |

Note: the repo is public, so `raw_data\raw.xlsx` (the lab reference sheet) and the demo passwords in the seed are public too. The demo passwords only work with `DEMO_MODE=true` on your own laptop.

## Day-to-day after this
```powershell
git add -A
git commit -m "Describe the change"
git push
```
Tip: Box syncing a `.git` folder usually works, but if Box ever reports sync conflicts inside `.git`, clone the repo to a non-Box folder (e.g. `C:\dev\prime-csc4330`) with `gh repo clone prime-csc4330` and copy `ml_models\` into it.
