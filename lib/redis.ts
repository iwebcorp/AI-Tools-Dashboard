import 'server-only';

import { Redis } from '@upstash/redis';

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis | undefined;
}

export function getRedis(): Redis {
  if (!globalThis.__redis__) {
    globalThis.__redis__ = Redis.fromEnv();
  }

  return globalThis.__redis__;
}
