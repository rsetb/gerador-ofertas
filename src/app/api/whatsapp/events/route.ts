import { subscribeWhatsAppEvents, getWhatsAppStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encode = (value: string) => new TextEncoder().encode(value);

export async function GET() {
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encode(`event: ${event}\n`));
        controller.enqueue(encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send('state', getWhatsAppStatus());

      const unsubscribe = subscribeWhatsAppEvents((evt) => {
        send(evt.type, evt.data);
      });

      const interval = setInterval(() => {
        controller.enqueue(encode(': ping\n\n'));
      }, 25000);

      cleanup = () => {
        clearInterval(interval);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
