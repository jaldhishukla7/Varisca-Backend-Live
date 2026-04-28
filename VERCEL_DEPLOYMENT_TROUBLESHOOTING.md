# Vercel Deployment Troubleshooting (Varisca Backend)

## Error: "We were unable to fetch required git information required to complete the deployment"

This failure happens before app build/runtime starts. It is usually caused by a broken Vercel ↔ Git connection, not by Razorpay variables.

### Fix checklist

1. **Reconnect Git integration in Vercel**
   - Go to **Vercel → Project → Settings → Git**.
   - Disconnect and reconnect the repository provider (GitHub/GitLab/Bitbucket).
   - Ensure repository access is granted for the repo used by this project.

2. **Verify production branch mapping**
   - In **Settings → Git**, confirm the **Production Branch** is correct (usually `main`).

3. **Redeploy from a real commit**
   - Trigger deploy from a pushed commit (not only from local/manual state).
   - Use **Deployments → ... → Redeploy** after reconnecting Git.

4. **If still failing, import project again**
   - Create a new Vercel project from the same repository and copy env vars.
   - This often fixes stale project metadata.

## Razorpay env vars (runtime)

These are still required for payment runtime if you are not using DB-backed payment settings:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `DATABASE_URL`
- `JWT_SECRET`

> Add env vars for **Production** and click **Redeploy** so the new deployment picks them up.
