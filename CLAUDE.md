# Claude Code — ATLAS HQ

Follow [AGENTS.md](./AGENTS.md) for the complete shared instructions.

**Deployment budget:** Group code and test fixes before pushing. Vercel can deploy automatically for each tracked-branch push, so minimize preview builds (target one verified preview per feature), never retry HTTP 402 deployment limits in a loop, and verify the exact production SHA, READY status and official domain before claiming a release. Do not alter team billing or preview policy without user approval.
