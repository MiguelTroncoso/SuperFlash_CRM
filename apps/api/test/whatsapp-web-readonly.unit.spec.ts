import { WhatsAppWebReadOnlyService } from '../src/modules/communication/providers/whatsapp-web-readonly/whatsapp-web-readonly.service';

describe('WhatsApp Web Read Only boundary', () => {
  it('does not expose outbound operations in the CRM service', () => {
    const service = new WhatsAppWebReadOnlyService(
      {} as never,
      {} as never,
      {} as never,
      {
        getOrThrow: () => ({
          whatsappReader: {
            enabled: false,
            serviceUrl: '',
            serviceToken: null,
            organizationId: null,
            missing: [],
          },
        }),
      } as never,
    );
    expect(service).not.toHaveProperty('sendMessage');
    expect(service).not.toHaveProperty('deleteMessage');
    expect(service).not.toHaveProperty('markAsRead');
  });
});
