import { WhatsAppWebChannelProvider } from './bridge-provider.js';

const bridge = new WhatsAppWebChannelProvider();

process.on('SIGTERM', () => void bridge.stop().finally(() => process.exit(0)));
process.on('SIGINT', () => void bridge.stop().finally(() => process.exit(0)));

await bridge.serve();
