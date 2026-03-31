declare module '@hono/node-server' {
  export function serve(options: {
    fetch: (request: Request) => Response | Promise<Response>;
    port: number;
  }): void;
}
