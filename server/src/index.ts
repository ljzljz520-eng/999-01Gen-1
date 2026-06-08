import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { initDb } from './db'
import partsRouter from './routes/parts'
import adminRouter from './routes/admin'

const appDir = path.resolve()

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/parts', partsRouter)
app.use('/api/admin', adminRouter)

const clientDistDir = path.join(appDir, '../client/dist')
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'))
  })
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
  })
})

async function startServer() {
  try {
    await initDb()

    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🚗 汽配条码追踪接口站已启动                            ║
║                                                            ║
║     后端服务: http://localhost:${PORT}                        ║
║     API文档:                                                ║
║       GET  /api/parts/lookup/:barcode  - 条码查询           ║
║       POST /api/parts/issue             - 上报问题           ║
║       GET  /api/admin/dashboard        - 管理面板统计       ║
║       GET  /api/admin/batches          - 批次列表           ║
║                                                            ║
║     测试条码:                                               ║
║       6901234567890 - 前刹车片 (正常)                       ║
║       6901234567895 - 机油滤清器 (有召回)                   ║
║       6901234567899 - 正时皮带 (已挂起, 高风险)             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `)
    })
  } catch (error) {
    console.error('启动服务器失败:', error)
    process.exit(1)
  }
}

startServer()

export default app
