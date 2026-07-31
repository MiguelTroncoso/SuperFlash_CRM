import { WhatsAppWebReadOnlyAdapter } from './reader-adapter.js';

const reader = new WhatsAppWebReadOnlyAdapter();

process.on('SIGTERM', () => void reader.stop().finally(() => process.exit(0)));
process.on('SIGINT', () => void reader.stop().finally(() => process.exit(0)));

await reader.server();
await reader.start();
