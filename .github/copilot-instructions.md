# GitHub Copilot — ATLAS HQ

Read and follow the repository-wide instructions in [AGENTS.md](../AGENTS.md) before proposing commits, opening pull requests, pushing branches or starting Vercel deployments.

**Critical:** Vercel previews are often created automatically on each tracked branch push; batch and test changes before pushing. Aim for one validated preview per coherent feature, avoid manual redeploy loops, and always verify the production deployment SHA/READY/domain separately from the GitHub merge. If Vercel returns HTTP 402 for its daily deployment limit, stop retrying and report the blocker.
