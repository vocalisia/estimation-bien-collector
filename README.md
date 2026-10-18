# Bounded property refresh

Generic updater for explicitly reviewed public URLs. No property catalogue, source registry, personal data or database credentials are included. Configuration is fetched from a private database using a narrowly scoped role. The role cannot read seller leads or erase observation history.

Daily GitHub-hosted Ubuntu execution uses standard public-repository runners, without paid APIs, caches, artifacts, a website build or a local computer. Monthly timestamp-only maintenance prevents repository inactivity from disabling the schedule. Scheduled start times may be delayed by GitHub.

New sources and changed physical facts require review. HTTP failures never become fresh price evidence. Source approval expiry is enforced. A failed or ambiguous check does not fabricate a comparable.

The sole runtime secret is PROPERTY_REFRESH_DATABASE_URL, stored as an Actions secret. Never enable a secret-bearing pull_request_target workflow or publish run reports.
