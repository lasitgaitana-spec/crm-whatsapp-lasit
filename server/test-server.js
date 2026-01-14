console.log('Starting test server...')

try {
  require('dotenv').config()
  console.log('Environment loaded')
  
  const express = require('express')
  console.log('Express loaded')
  
  const app = express()
  console.log('Express app created')
  
  const http = require('http')
  console.log('HTTP module loaded')
  
  const httpServer = http.createServer(app)
  console.log('HTTP server created')
  
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
  console.log('PORT:', PORT)
  
  httpServer.listen(PORT, () => {
    console.log('WhatsApp API on port', PORT)
  })
  
  console.log('Server setup complete')
  
} catch (error) {
  console.error('Error:', error)
}