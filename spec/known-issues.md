# Known Issues

## WS-001: Reconnect loop when a user has more than 100 conversations
The frontend subscribes to every loaded conversation, while the WebSocket server
allows only 100 unique conversation subscriptions per connection.

When the limit is exceeded, the server closes the connection with
`TOO_MANY_SUBSCRIPTIONS`. The client reconnects and repeats the same invalid
subscription, causing a reconnect loop.