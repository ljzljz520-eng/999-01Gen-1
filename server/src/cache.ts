import path from 'path'
import fs from 'fs'

interface CacheEntry<T> {
  data: T
  expiresAt: number
  cachedAt: number
}

const CACHE_TTL = 5 * 60 * 1000
const PURGE_INTERVAL = 60 * 1000

const appDir = path.resolve()
const cacheFilePath = path.join(appDir, 'data', 'cache.json')

function loadCacheFromFile(): Map<string, CacheEntry<any>> {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const content = fs.readFileSync(cacheFilePath, 'utf-8')
      const parsed = JSON.parse(content) as Array<[string, CacheEntry<any>]>
      const now = Date.now()
      const validEntries = parsed.filter(([_, entry]) => entry.expiresAt > now)
      return new Map(validEntries)
    }
  } catch (e) {
  }
  return new Map()
}

function saveCacheToFile(cache: Map<string, CacheEntry<any>>): void {
  try {
    const entries = Array.from(cache.entries())
    const cacheDir = path.dirname(cacheFilePath)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    fs.writeFileSync(cacheFilePath, JSON.stringify(entries), 'utf-8')
  } catch (e) {
  }
}

class CacheService {
  private cache: Map<string, CacheEntry<any>>
  private persistentCache: Map<string, CacheEntry<any>>

  constructor() {
    this.cache = new Map()
    this.persistentCache = loadCacheFromFile()
    this.startPurgeTimer()
  }

  private startPurgeTimer(): void {
    setInterval(() => {
      const now = Date.now()
      let changed = false
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key)
        }
      }
      for (const [key, entry] of this.persistentCache.entries()) {
        if (entry.expiresAt <= now) {
          this.persistentCache.delete(key)
          changed = true
        }
      }
      if (changed) {
        saveCacheToFile(this.persistentCache)
      }
    }, PURGE_INTERVAL)
  }

  set<T>(key: string, data: T, ttl: number = CACHE_TTL, persistent: boolean = false): void {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    }
    this.cache.set(key, entry)
    if (persistent) {
      this.persistentCache.set(key, entry)
      saveCacheToFile(this.persistentCache)
    }
  }

  get<T>(key: string): { data: T; fromCache: boolean; cacheExpiresAt: number } | null {
    let entry = this.cache.get(key)
    if (!entry) {
      entry = this.persistentCache.get(key)
    }
    if (!entry) return null

    const now = Date.now()
    if (entry.expiresAt <= now) {
      this.cache.delete(key)
      this.persistentCache.delete(key)
      return null
    }

    return {
      data: entry.data,
      fromCache: true,
      cacheExpiresAt: entry.expiresAt,
    }
  }

  delete(key: string): void {
    this.cache.delete(key)
    if (this.persistentCache.has(key)) {
      this.persistentCache.delete(key)
      saveCacheToFile(this.persistentCache)
    }
  }

  deletePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
      }
    }
    let changed = false
    for (const key of this.persistentCache.keys()) {
      if (pattern.test(key)) {
        this.persistentCache.delete(key)
        changed = true
      }
    }
    if (changed) {
      saveCacheToFile(this.persistentCache)
    }
  }

  clear(): void {
    this.cache.clear()
    this.persistentCache.clear()
    try {
      if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath)
      }
    } catch (e) {
    }
  }

  getStats(): {
    memoryCount: number
    persistentCount: number
    memoryKeys: string[]
  } {
    return {
      memoryCount: this.cache.size,
      persistentCount: this.persistentCache.size,
      memoryKeys: Array.from(this.cache.keys()),
    }
  }
}

export const cacheService = new CacheService()
export default cacheService
