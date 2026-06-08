export interface Supplier {
  id: number
  name: string
  contact?: string
  phone?: string
  created_at: number
}

export interface Part {
  id: number
  barcode: string
  name: string
  specification?: string
  unit: string
  created_at: number
}

export interface CarModel {
  id: number
  brand: string
  model: string
  year_range?: string
  created_at: number
}

export interface Batch {
  id: number
  batch_no: string
  part_id: number
  supplier_id: number
  production_date: number
  shelf_location?: string
  quantity: number
  created_at: number
}

export interface Recall {
  id: number
  batch_id: number
  reason: string
  recall_date: number
  is_active: number
  created_at: number
}

export interface Suspension {
  id: number
  batch_id: number
  reason: string
  issue_count: number
  suspended_at: number
  suspended_by?: string
  is_active: number
  created_at: number
}

export interface IssueRecord {
  id: number
  batch_id: number
  type: string
  description?: string
  reported_at: number
  reported_by?: string
  created_at: number
}

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
