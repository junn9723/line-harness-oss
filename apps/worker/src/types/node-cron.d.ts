declare module 'node-cron' {
  export interface ScheduledTask {
    start(): void;
    stop(): void;
    destroy(): void;
  }

  export function schedule(
    expression: string,
    fn: () => void | Promise<void>,
    options?: {
      timezone?: string;
      scheduled?: boolean;
    },
  ): ScheduledTask;
}
