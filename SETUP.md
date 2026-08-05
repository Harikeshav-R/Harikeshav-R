# How to publish this profile

Your GitHub profile README lives in a **special repo whose name matches your username exactly**: `Harikeshav-R`.

## 1. Create the repo

1. Go to https://github.com/new
2. **Repository name:** `Harikeshav-R` (must match your username exactly — GitHub will show a ✨ "you found a secret!" note)
3. Set it to **Public**, and **do not** add a README/`.gitignore`/license (this folder already has them).

## 2. Push this folder

From inside this `Harikeshav-R` folder:

```bash
git init -b main
git add .
git commit -m "✨ Fancy profile README"
git remote add origin https://github.com/Harikeshav-R/Harikeshav-R.git
git push -u origin main
```

## 3. Turn on the contribution snake 🐍

The snake animation needs the workflow to run once to create the `output` branch.

1. After pushing, go to the repo's **Actions** tab and enable workflows if prompted.
2. Open **"Generate Contribution Snake"** → **Run workflow** (manual trigger).
3. It commits the generated SVGs to an `output` branch, which the README already points at.
   It also re-runs automatically twice a day.

If Actions can't push, go to **Settings → Actions → General → Workflow permissions** and select **"Read and write permissions."**

## 4. Done

Visit https://github.com/Harikeshav-R — the README renders on your profile automatically.

---

## Notes on the live widgets

Everything renders from public services — no secrets or config needed:

| Widget | Service |
|--------|---------|
| Wave header / footer | capsule-render.vercel.app |
| Typing subtitle | readme-typing-svg.demolab.com |
| Stats / top languages / repo pins | github-readme-stats.vercel.app |
| Streak | streak-stats.demolab.com |
| Activity graph | github-readme-activity-graph.vercel.app |
| Trophies | github-profile-trophy.vercel.app |
| Profile views | komarev.com |
| Snake | your own Actions workflow (`snake.yml`) |

**Tip:** `github-readme-stats` can rate-limit on the public instance. If stats cards show errors,
the cleanest fix is to [deploy your own instance to Vercel](https://github.com/anuraghazra/github-readme-stats#deploy-on-your-own-vercel-instance)
(free, ~2 min) and swap the hostname in the README.

The color theme is a teal→navy gradient (`#0F2027 → #203A43 → #2C5364`). Search/replace `2C5364`
in the README to re-tint every badge and card at once.
