// Skip automatic Netlify build/deploy previews for the books PR branch only.
process.exitCode = process.env.BRANCH === "feat/lecture-livres-l1" ? 0 : 1;
