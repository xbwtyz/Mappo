# Hosted standalone compilation

This development-only workflow supplements, rather than replaces, Mappo Fast Checks and full CI. It never publishes or merges, and accepts only a development version (x.y.z-dev).

## Request and transfer

1. Start an isolated build/standalone/<request> branch from the exact development source revision. Include the reviewed hosted workflow on that branch (until separately merged, use its reviewed blob). Do not use main, a release branch, a tag or an open product PR branch.
2. Push an explicit request commit containing the literal marker [standalone-build]. The compile job checks out the event SHA with read-only permissions and runs npm run build twice; both output files must be nonempty, byte-identical, and stable across rebuilds.
3. The recording job has contents write permission but does not execute repository build code. It downloads the same-run artifact, verifies version and digest, stages only index.html and the current development version's dist HTML, and pushes a normal non-forced commit to the same isolated branch only if its source head is still current. No change means no commit. All other distributions remain untouched.
4. Verify the successful run, source SHA, generated commit parent, changed paths and matching HTML blob identities. Transfer only the two generated blobs into the actual development commit; never merge the scratch branch or copy the workflow into a product PR. The source and generated output must be from the same build inputs. Review and verify the actual PR head under existing Fast Checks and full CI gates.
5. If a source ref changes, compilation fails, or the artifact cannot be verified, stop and issue a fresh request. Do not force push, modify CI requirements, or hand-edit HTML.

The isolated branch prefix is intentionally outside the existing automatic Fast Checks branch patterns. Scratch builds are not acceptance evidence; final PR parity and existing review/main checks remain mandatory. The workflow runs only on explicitly marked pushes to this prefix; the generated commit contains no request marker. There is no release, tag, deployment or automatic merge action. Treat workflow edits as separately reviewed infrastructure changes.

## Qualification

First validate a no-change build on the existing development version; then exercise recording with a genuine generated output change on a disposable isolated branch. Confirm no other tracked paths change and no source branch or historical distribution changes. Document actual run evidence before treating the workflow as operational.
