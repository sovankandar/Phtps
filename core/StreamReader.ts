import { HttpClientConfig } from '../config/types';

export class StreamReader {
  public static transform<T = any>(
    response: Response,
    config: HttpClientConfig
  ): ReadableStream<T> {
    const rawStream = response.body;
    if (!rawStream) {
      throw new Error('[Eping] Response body is null, cannot stream.');
    }

    const streamType = config.streamType || 'raw';

    switch (streamType) {
      case 'text':
        return this.asTextStream(rawStream) as unknown as ReadableStream<T>;
      case 'json':
        return this.asJsonStream(rawStream) as unknown as ReadableStream<T>;
      case 'sse':
        return this.asSseStream(rawStream) as unknown as ReadableStream<T>;
      case 'raw':
      default:
        return rawStream as unknown as ReadableStream<T>;
    }
  }

  private static asTextStream(stream: ReadableStream<Uint8Array>): ReadableStream<string> {
    const decoder = new TextDecoder();
    return stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(decoder.decode(chunk, { stream: true }));
        },
        flush(controller) {
          controller.enqueue(decoder.decode());
        }
      })
    );
  }

  private static asJsonStream(stream: ReadableStream<Uint8Array>): ReadableStream<any> {
    const decoder = new TextDecoder();
    let buffer = '';

    return stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                controller.enqueue(JSON.parse(line));
              } catch {
                console.warn('[Eping] Failed to parse NDJSON line:', line);
              }
            }
          }
        },
        flush(controller) {
          if (buffer.trim()) {
            try {
              controller.enqueue(JSON.parse(buffer));
            } catch {
              // Ignore partial trailing line if it fails
            }
          }
        }
      })
    );
  }

  private static asSseStream(stream: ReadableStream<Uint8Array>): ReadableStream<{ event?: string; data: any; id?: string }> {
    const decoder = new TextDecoder();
    let buffer = '';

    return stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          buffer += decoder.decode(chunk, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const eventBlock of events) {
            const lines = eventBlock.split('\n');
            const event: any = {};
            
            for (const line of lines) {
              const colonIndex = line.indexOf(':');
              if (colonIndex === -1) continue;
              
              const field = line.slice(0, colonIndex).trim();
              const value = line.slice(colonIndex + 1).trim();
              
              if (field === 'data') {
                try {
                  event.data = JSON.parse(value);
                } catch {
                  event.data = value;
                }
              } else if (field === 'event') {
                event.event = value;
              } else if (field === 'id') {
                event.id = value;
              }
            }
            
            if (event.data !== undefined) {
              controller.enqueue(event);
            }
          }
        },
        flush(controller) {
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            const event: any = {};
            for (const line of lines) {
              const colonIndex = line.indexOf(':');
              if (colonIndex === -1) continue;
              const field = line.slice(0, colonIndex).trim();
              const value = line.slice(colonIndex + 1).trim();
              if (field === 'data') {
                try {
                  event.data = JSON.parse(value);
                } catch {
                  event.data = value;
                }
              } else if (field === 'event') {
                event.event = value;
              } else if (field === 'id') {
                event.id = value;
              }
            }
            if (event.data !== undefined) {
              controller.enqueue(event);
            }
          }
        }
      })
    );
  }
}
