Progress:

1. Review project and setup prettier and eslint. Fix all problems that were founded by these tools.
2. Replaced usage of mongo from MongoDB to Mongoose.
3. Replaced usage of mysql from mysql2/promise to Sequelize. Made more stable setup migrations and seeds.
4. Refactor design on the frontend
5. Fix the bug idempotency of requests for creation messages. Reproduce bug: create a new conversation, send a message. Result: server crashed.
6. Refactor routers, handlers and simple validation for http requests on endpoints. Update express from v4 to v5.2.1
7. Create registration and login features, add JWT token for authorization.
8. Refactor and fix conversation creation logic, adding users into the conversation.
9. Refactoring the base functionality of the application before tests.
10. body-hash-not-null migration and remove code
11. Prepare the environment for integration and load-performance testing
12. Create integration tests for the application
13. Create load-performance tests for the application.
14. Optimize speed of create messages by removing the planted pbkdf2Sync signature, verify the win with load tests.
15. Create a multi-instance feature, apply redis client and pub/sub feature in Redis. Add Redis to test environments.
16. Websocket load tests and optimization.
17. Migrate message bodies from MongoDB into MySQL: BIGINT message ids, expand-only migrations, batched backfill with verification tooling and a rollback mirror worker.
18. Rewrite message creation as a single MySQL transaction with a transactional outbox, so a Redis outage no longer fails committed writes.
19. Persistent per-user unread counters and read cursors, materialized conversation summaries for a Telegram-style sidebar.
20. Keyset pagination for message history with seamless infinite scroll on the frontend.
21. Remove MongoDB completely: drop Mongoose, legacy migration tooling and mongo containers from all environments.
22. Re-run load tests after the migration and compare against pre-refactor baselines: sidebar ~4x faster, message create ~30% faster, no realtime regressions.
23. Rate limiting for message sending: Redis sliding window, 429 with Retry-After