import { describe, it, expect } from 'vitest';
import { StreamReader } from '../core/StreamReader';
import { HttpClientConfig } from '../config/types';

describe('StreamReader', () => {
  const textEncoder = new TextEncoder();

  const makeStream = (chunks: string[]) => {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(textEncoder.encode(chunk));
        }
        controller.close();
      },
    });
  };

  const readAll = async <T>(stream: ReadableStream<T>): Promise<T[]> => {
    const reader = stream.getReader();
    const result: T[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(value);
    }
    return result;
  };

  it('SSE: parses data, event, id fields correctly', async () => {
    const stream = makeStream([
      'id: 1\nevent: message\ndata: hello\n\n',
      'id: 2\nevent: update\ndata: {"foo":"bar"}\n\n',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'sse',
    };

    const transformed = StreamReader.transform(response, config);
    const events = await readAll(transformed);

    expect(events).toEqual([
      { id: '1', event: 'message', data: 'hello' },
      { id: '2', event: 'update', data: { foo: 'bar' } },
    ]);
  });

  it('SSE: handles chunk boundary splitting mid-event (buffer accumulation)', async () => {
    // Event is split across two chunks at a boundary mid-field
    const stream = makeStream([
      'id: 1\nevent: message\nda',
      'ta: hello\n\n',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'sse',
    };

    const transformed = StreamReader.transform(response, config);
    const events = await readAll(transformed);

    expect(events).toEqual([
      { id: '1', event: 'message', data: 'hello' },
    ]);
  });

  it('SSE flush: last event emitted when stream closes without trailing \\n\\n', async () => {
    const stream = makeStream([
      'id: 42\nevent: goodbye\ndata: end-of-stream',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'sse',
    };

    const transformed = StreamReader.transform(response, config);
    const events = await readAll(transformed);

    expect(events).toEqual([
      { id: '42', event: 'goodbye', data: 'end-of-stream' },
    ]);
  });

  it('NDJSON: each newline-delimited JSON object emitted as parsed value', async () => {
    const stream = makeStream([
      '{"id":1,"name":"first"}\n',
      '{"id":2,"name":"second"}\n',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'json',
    };

    const transformed = StreamReader.transform(response, config);
    const items = await readAll(transformed);

    expect(items).toEqual([
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
    ]);
  });

  it('NDJSON flush: last line without trailing newline still emitted', async () => {
    const stream = makeStream([
      '{"id":1}\n{"id":2}',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'json',
    };

    const transformed = StreamReader.transform(response, config);
    const items = await readAll(transformed);

    expect(items).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it('SSE: data field that is valid JSON is parsed; plain string kept as string', async () => {
    const stream = makeStream([
      'data: {"validJson":true,"number":100}\n\n',
      'data: plain text string\n\n',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'sse',
    };

    const transformed = StreamReader.transform(response, config);
    const events = await readAll(transformed);

    expect(events).toEqual([
      { data: { validJson: true, number: 100 } },
      { data: 'plain text string' },
    ]);
  });

  it('SSE: comment lines (: comment) are ignored', async () => {
    const stream = makeStream([
      ': this is a comment and should be ignored\n',
      'id: 13\n',
      ': another comment\n',
      'data: working\n\n',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'sse',
    };

    const transformed = StreamReader.transform(response, config);
    const events = await readAll(transformed);

    expect(events).toEqual([
      { id: '13', data: 'working' },
    ]);
  });

  it('text stream: each chunk decoded correctly with stream: true option', async () => {
    const stream = makeStream([
      'chunk number one ',
      'chunk number two',
    ]);
    const response = new Response(stream);
    const config: HttpClientConfig = {
      stream: true,
      streamType: 'text',
    };

    const transformed = StreamReader.transform(response, config);
    const chunks = await readAll(transformed);

    expect(chunks).toEqual([
      'chunk number one ',
      'chunk number two',
      '',
    ]);
  });
});
