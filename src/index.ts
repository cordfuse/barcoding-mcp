#!/usr/bin/env node
import { createServer } from "./server.js";

interface CliOptions {
  http: boolean;
  port: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { http: false, port: 3900 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--http") opts.http = true;
    else if (a === "--port") opts.port = Number(argv[++i]);
  }
  return opts;
}

async function runStdio(): Promise<void> {
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio: the server owns the process lifetime.
}

async function runHttp(port: number): Promise<void> {
  const { createServer: createHttpServer } = await import("node:http");
  const { randomUUID } = await import("node:crypto");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { isInitializeRequest } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  // Stateful sessions: `initialize` mints a session id; later requests carry it
  // in the mcp-session-id header and route back to the same server+transport.
  type Transport = InstanceType<typeof StreamableHTTPServerTransport>;
  const transports = new Map<string, Transport>();

  const httpServer = createHttpServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let body: unknown;
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
        : undefined;
    }

    let transport: Transport | undefined = sessionId
      ? transports.get(sessionId)
      : undefined;

    if (!transport && req.method === "POST" && isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await createServer().connect(transport);
    }

    if (!transport) {
      res.writeHead(400, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "No valid session; send initialize first." },
          id: null,
        }),
      );
      return;
    }

    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, () => {
    process.stderr.write(`barcoding-mcp streamable HTTP on :${port}/mcp\n`);
  });
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.http) await runHttp(opts.port);
  else await runStdio();
}

main().catch((err) => {
  process.stderr.write(`barcoding-mcp fatal: ${String(err)}\n`);
  process.exit(1);
});
