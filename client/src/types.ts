export interface PartDetail {
  barcode: string
  partName: string
  specification?: string
  unit: string
  batchNo: string
  productionDate: string
  shelfLocation?: string
  quantity: number
  supplier: {
    id: number
    name: string
    contact?: string
    phone?: string
  }
  carModels: Array<{
    brand: string
    model: string
    yearRange?: string
  }>
  recall?: {
    reason: string
    recallDate: string
    isActive: boolean
  }
  suspension?: {
    reason: string
    issueCount: number
    suspendedAt: string
    suspendedBy?: string
    isActive: boolean
  }
  isRisk: boolean
  riskLevel: 'normal' | 'warning' | 'danger'
  recentIssues: Array<{
    type: string
    description?: string
    reportedAt: string
    reportedBy?: string
  }>
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  fromCache?: boolean
  cacheExpiresAt?: number
}

export interface BatchListItem {
  id: number
  batch_no: string
  part_name: string
  part_barcode: string
  supplier_name: string
  production_date: string
  shelf_location: string | null
  quantity: number
  is_suspended: number
  is_recalled: number
  recent_issue_count: number
}

export interface SuspensionDetail {
  id: number
  batch_id: number
  batch_no: string
  part_name: string
  reason: string
  issue_count: number
  suspended_at: string
  suspended_by: string | null
  is_active: number
}

export interface IssueDetail {
  id: number
  batch_id: number
  batch_no: string
  part_name: string
  type: string
  description: string | null
  reported_at: string
  reported_by: string | null
}

export interface DashboardStats {
  totalBatches: number
  suspendedBatches: number
  recalledBatches: number
  recentIssues: number
  topIssueBatches: Array<{
    batch_no: string
    part_name: string
    issue_count: number
  }>
}

export interface CacheEntry<T> {
  data: T
  expiresAt: number
  cachedAt: number
}
