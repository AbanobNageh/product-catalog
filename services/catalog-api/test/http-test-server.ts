import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/** A real HTTP server on a free localhost port, so fetch, sockets and timeouts are real. */
export interface TestServer {
  url: string;
  server: Server;
  close(): Promise<void>;
}

export async function startTestServer(
  handler: RequestListener,
): Promise<TestServer> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        if (!server.listening) return resolve();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Reads a request body; '' when there is none. */
export async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += (chunk as Buffer).toString();
  return body;
}
