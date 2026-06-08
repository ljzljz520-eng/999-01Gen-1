import type { CacheEntry } from '../types'

const CACHE_TTL = 5 * 60 * 1000
const STORAGE_KEY = 'parts_tracker_cache'

class OfflineCacheService {
  private cache: Map<string, CacheEntry<any>>

  constructor() {
    this.cache = new Map()
    this.loadFromStorage()
    this.startPurgeTimer()
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Array<[string, CacheEntry<any>]>
        const now = Date.now()
        parsed.forEach(([key, entry]) => {
          if (entry.expiresAt > now) {
            this.cache.set(key, entry)
          }
        })
      }
    } catch (e) {
      console.error('加载缓存失败:', e)
    }
  }

  private saveToStorage(): void {
    try {
      const entries = Array.from(this.cache.entries())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } catch (e) {
      console.error('保存缓存失败:', e)
    }
  }

  private startPurgeTimer(): void {
    setInterval(() => {
      const now = Date.now()
      let changed = false
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key)
          changed = true
        }
      }
      if (changed) {
        this.saveToStorage()
      }
    }, 60 * 1000)
  }

  set<T>(key: string, data: T, ttl: number = CACHE_TTL): void {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    }
    this.cache.set(key, entry)
    this.saveToStorage()
  }

  get<T>(key: string): { data: T; fromCache: boolean; cacheExpiresAt: number } | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (entry.expiresAt <= now) {
      this.cache.delete(key)
      this.saveToStorage()
      return null
    }

    return {
      data: entry.data,
      fromCache: true,
      cacheExpiresAt: entry.expiresAt,
    }
  }

  delete(key: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
      this.saveToStorage()
    }
  }

  clear(): void {
    this.cache.clear()
    localStorage.removeItem(STORAGE_KEY)
  }

  getStats(): { count: number; keys: string[] } {
    return {
      count: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }

  isValid(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    return entry.expiresAt > Date.now()
  }

  getRemainingTime(key: string): number {
    const entry = this.cache.get(key)
    if (!entry) return 0
    return Math.max(0, entry.expiresAt - Date.now())
  }

  deletePattern(pattern: RegExp): void {
    let changed = false
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        changed = true
      }
    }
    if (changed) {
      this.saveToStorage()
    }
  }
}

export const offlineCache = new OfflineCacheService()
export default offlineCache
