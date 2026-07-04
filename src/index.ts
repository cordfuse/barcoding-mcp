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
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );

  const httpServer = createHttpServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    // Stateless: a fresh server + transport per request.
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
      : undefined;

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
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
