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
14. Create a multi-instance feature, apply redis client and pub/sub feature in Redis. Add Redis to test environments.
15. Websocket load tests and optimization.
16. 