import { Router, Request, Response } from 'express'
import { getPartDetailByBarcode, reportIssue, getBatchByBarcode } from '../services/partService'
import type { ApiResponse, PartDetail } from '../types'

const router = Router()

router.get('/lookup/:barcode', async (req: Request, res: Response) => {
  const { barcode } = req.params

  if (!barcode || barcode.trim() === '') {
    return res.status(400).json({
      success: false,
      error: '条码不能为空',
    } as ApiResponse<null>)
  }

  try {
    const result = await getPartDetailByBarcode(barcode.trim())

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '未找到该条码对应的配件信息',
      } as ApiResponse<null>)
    }

    res.json({
      success: true,
      data: result.data,
      fromCache: result.fromCache,
      cacheExpiresAt: result.cacheExpiresAt,
    } as ApiResponse<PartDetail>)
  } catch (error) {
    console.error('查询条码失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

router.post('/issue', async (req: Request, res: Response) => {
  const { barcode, type, description, reportedBy } = req.body

  if (!barcode || !type || !description) {
    return res.status(400).json({
      success: false,
      error: '条码、问题类型和描述不能为空',
    } as ApiResponse<null>)
  }

  try {
    const batch = await getBatchByBarcode(barcode.trim())

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: '未找到该条码对应的批次',
      } as ApiResponse<null>)
    }

    const result = await reportIssue(
      batch.id,
      type,
      description,
      reportedBy || '未知'
    )

    res.json({
      success: true,
      data: {
        batchId: batch.id,
        batchNo: batch.batch_no,
        autoSuspended: result.autoSuspended,
      },
    } as ApiResponse<{
      batchId: number
      batchNo: string
      autoSuspended?: boolean
    }>)
  } catch (error) {
    console.error('记录问题失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
    } as ApiResponse<null>)
  }
})

export default router
