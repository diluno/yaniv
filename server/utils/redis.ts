import Redis from 'ioredis'

// One shared command client and one dedicated subscriber connection per
// function instance (a client in subscribe mode cannot issue commands).

let commandClient: Redis | null = null
let subscriberClient: Redis | null = null

function redisUrl(): string {
  return process.env.UPSTASH_REDIS_URL
    ?? process.env.REDIS_URL
    ?? 'redis://localhost:6379'
}

export function useRedis(): Redis {
  if (!commandClient) {
    commandClient = new Redis(redisUrl(), { maxRetriesPerRequest: 3, lazyConnect: false })
  }
  return commandClient
}

export function useRedisSubscriber(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(redisUrl(), { maxRetriesPerRequest: 3, lazyConnect: false })
  }
  return subscriberClient
}

export function roomKey(code: string): string {
  return `yaniv:room:${code}`
}

export function roomChannel(code: string): string {
  return `yaniv:room:${code}:pub`
}
