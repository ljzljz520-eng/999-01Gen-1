import { Router, Request, Response } from 'express'
import {
  getBatchList,
  suspendBatch,
  unsuspendBatch,
  getSuspensions,
  getIssues,
  getDashboardStats,
} from '../services/adminService'
import cacheService from '../cache'
import type { ApiResponse } from '../types'

const router = Router()

router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const stats = await getDashboardStats()
    res.json({
      success: true,
      data: stats,
    } as ApiResponse<typeof stats>)
  } catch (error) {
    console.error('获取统计数据失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.get('/batches', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20
    const suspendedOnly = req.query.suspendedOnly === 'true'
    const recalledOnly = req.query.recalledOnly === 'true'
    const keyword = (req.query.keyword as string) || undefined

    const result = await getBatchList(page, pageSize, {
      suspendedOnly,
      recalledOnly,
      keyword,
    })

    res.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>)
  } catch (error) {
    console.error('获取批次列表失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.post('/batches/:batchId/suspend', async (req: Request, res: Response) => {
  const { batchId } = req.params
  const { reason, suspendedBy } = req.body

  if (!reason || reason.trim() === '') {
    return res.status(400).json({
      success: false,
      error: '挂起原因不能为空',
    } as ApiResponse<null>)
  }

  try {
    const result = await suspendBatch(
      parseInt(batchId),
      reason.trim(),
      suspendedBy || 'admin'
    )

    if (!result.success && result.alreadySuspended) {
      return res.status(400).json({
        success: false,
        error: '该批次已被挂起',
      } as ApiResponse<null>)
    }

    res.json({
      success: true,
      data: { message: '挂起成功' },
    } as ApiResponse<{ message: string }>)
  } catch (error) {
    console.error('挂起批次失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.post('/batches/:batchId/unsuspend', async (req: Request, res: Response) => {
  const { batchId } = req.params

  try {
    const result = await unsuspendBatch(parseInt(batchId))

    if (!result.success && result.notSuspended) {
      return res.status(400).json({
        success: false,
        error: '该批次未被挂起',
      } as ApiResponse<null>)
    }

    res.json({
      success: true,
      data: { message: '解除挂起成功' },
    } as ApiResponse<{ message: string }>)
  } catch (error) {
    console.error('解除挂起失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.get('/suspensions', async (req: Request, res: Response) => {
  const activeOnly = req.query.activeOnly !== 'false'

  try {
    const suspensions = await getSuspensions(activeOnly)
    res.json({
      success: true,
      data: suspensions,
    } as ApiResponse<typeof suspensions>)
  } catch (error) {
    console.error('获取挂起列表失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.get('/issues', async (req: Request, res: Response) => {
  const batchId = req.query.batchId ? parseInt(req.query.batchId as string) : undefined
  const days = req.query.days ? parseInt(req.query.days as string) : 30

  try {
    const issues = await getIssues(batchId, days)
    res.json({
      success: true,
      data: issues,
    } as ApiResponse<typeof issues>)
  } catch (error) {
    console.error('获取问题记录失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.delete('/cache', async (_req: Request, res: Response) => {
  try {
    cacheService.clear()
    res.json({
      success: true,
      data: { message: '缓存已清除' },
    } as ApiResponse<{ message: string }>)
  } catch (error) {
    console.error('清除缓存失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.get('/cache/stats', async (_req: Request, res: Response) => {
  try {
    const stats = cacheService.getStats()
    res.json({
      success: true,
      data: stats,
    } as ApiResponse<typeof stats>)
  } catch (error) {
    console.error('获取缓存统计失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

export default router
