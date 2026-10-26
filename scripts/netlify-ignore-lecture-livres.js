// Skip automatic Netlify build/deploy previews for books-only PR branches.
process.exitCode = ["feat/lecture-livres-l1", "fix/lecture-open-book-r1", "fix/atomic-habits-upload-recovery-20261026"].includes(process.env.BRANCH) ? 0 : 1;
