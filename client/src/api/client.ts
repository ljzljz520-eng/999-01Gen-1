import offlineCache from '../utils/offlineCache'
import type {
  ApiResponse,
  PartDetail,
  DashboardStats,
  BatchListItem,
  SuspensionDetail,
  IssueDetail,
} from '../types'

const API_BASE = '/api'
const CACHE_TTL = 5 * 60 * 1000

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  useCache: boolean = false,
  cacheKey?: string
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint}`

  if (useCache && options.method === 'GET') {
    const key = cacheKey || endpoint
    const cached = offlineCache.get<T>(key)
    if (cached) {
      return {
        success: true,
        data: cached.data,
        fromCache: true,
        cacheExpiresAt: cached.cacheExpiresAt,
      }
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    const data = (await response.json()) as ApiResponse<T>

    if (data.success && useCache && options.method === 'GET' && data.data !== undefined) {
      const key = cacheKey || endpoint
      offlineCache.set(key, data.data, CACHE_TTL)
    }

    return data
  } catch (error) {
    console.error('API请求失败:', error)

    if (useCache && options.method === 'GET') {
      const key = cacheKey || endpoint
      const cached = offlineCache.get<T>(key)
      if (cached) {
        return {
          success: true,
          data: cached.data,
          fromCache: true,
          cacheExpiresAt: cached.cacheExpiresAt,
          error: '网络连接失败，使用离线缓存数据',
        }
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败',
    }
  }
}

export const partsApi = {
  lookup: (barcode: string): Promise<ApiResponse<PartDetail>> => {
    return request<PartDetail>(`/parts/lookup/${encodeURIComponent(barcode)}`, {}, true, `part:${barcode}`)
  },

  reportIssue: (
    barcode: string,
    type: string,
    description: string,
    reportedBy?: string
  ): Promise<ApiResponse<{ batchId: number; batchNo: string; autoSuspended?: boolean }>> => {
    offlineCache.delete(`part:${barcode}`)
    return request(`/parts/issue`, {
      method: 'POST',
      body: JSON.stringify({ barcode, type, description, reportedBy }),
    })
  },
}

export const adminApi = {
  getDashboard: (): Promise<ApiResponse<DashboardStats>> => {
    return request<DashboardStats>('/admin/dashboard')
  },

  getBatches: (
    page: number = 1,
    pageSize: number = 20,
    filters?: { suspendedOnly?: boolean; recalledOnly?: boolean; keyword?: string }
  ): Promise<ApiResponse<{ total: number; list: BatchListItem[] }>> => {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    })
    if (filters?.suspendedOnly) params.append('suspendedOnly', 'true')
    if (filters?.recalledOnly) params.append('recalledOnly', 'true')
    if (filters?.keyword) params.append('keyword', filters.keyword)

    return request(`/admin/batches?${params.toString()}`)
  },

  suspendBatch: (
    batchId: number,
    reason: string,
    suspendedBy?: string
  ): Promise<ApiResponse<{ message: string }>> => {
    offlineCache.deletePattern(/^part:/)
    Object.keys(localStorage)
      .filter(k => k.startsWith('parts_tracker_cache'))
      .forEach(k => localStorage.removeItem(k))
    return request(`/admin/batches/${batchId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason, suspendedBy }),
    })
  },

  unsuspendBatch: (batchId: number): Promise<ApiResponse<{ message: string }>> => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('parts_tracker_cache'))
      .forEach(k => localStorage.removeItem(k))
    return request(`/admin/batches/${batchId}/unsuspend`, {
      method: 'POST',
    })
  },

  getSuspensions: (activeOnly: boolean = true): Promise<ApiResponse<SuspensionDetail[]>> => {
    return request(`/admin/suspensions?activeOnly=${activeOnly}`)
  },

  getIssues: (batchId?: number, days: number = 30): Promise<ApiResponse<IssueDetail[]>> => {
    const params = new URLSearchParams({ days: days.toString() })
    if (batchId) params.append('batchId', batchId.toString())
    return request(`/admin/issues?${params.toString()}`)
  },

  clearCache: (): Promise<ApiResponse<{ message: string }>> => {
    offlineCache.clear()
    return request('/admin/cache', { method: 'DELETE' })
  },

  getCacheStats: (): Promise<ApiResponse<{ memoryCount: number; persistentCount: number }>> => {
    return request('/admin/cache/stats')
  },
}

export default { partsApi, adminApi }
