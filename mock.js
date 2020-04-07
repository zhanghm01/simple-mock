// 引用 http 服务依赖
const express = require('express')
const cookieParser = require('cookie-parser')
const formidableMiddleware = require('express-formidable')
const { createProxyMiddleware } = require('http-proxy-middleware')
// 引入辅助三方依赖
const fs = require('fs')
const path = require('path')
const clc = require('cli-color')
// 引入配置文件
const config = require('./config')
// 引入自定义工具库
const utils = require('./utils/utils')

let { prefix, port, host, delay, checkToken, proxyConfig } = config
prefix = prefix || '/api/v1/'
port = port || 3000
host = host || 'localhost'
delay = delay || 0

function calcApiLink (apis) {
  const res = []
  apis.forEach(api => {
    res.push(`http://${host}:${port}${prefix}${api}`)
  })
  return res
}

function showApisList (apis) {
  apis.forEach((api, index) => {
    index < 5 && console.log(clc.cyan(`[apilink] ${api}`))
  })
}

// Get all the api files
function getApis () {
  const srcPath = path.resolve(__dirname, './api')
  const apis = []
  const result = fs.readdirSync(srcPath)
  result.forEach(r => {
    const apiName = r.split('.')[0]
    apiName && apis.push(apiName)
  })
  return apis
}

const apis = getApis()
const apiLink = calcApiLink(apis)

showApisList (apiLink)

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use(formidableMiddleware())

// 默认首页
app.get('/', (req, res) => {
  res.json({
    host, port, prefix,
    "apis": apiLink
  })
})

// 代理接口处理
if (proxyConfig.status) {
  const { proxyApiList, proxyOption } = proxyConfig
  proxyApiList.forEach(i => {
    if (!i) return
    const apiName = prefix + i
    app.use(apiName, createProxyMiddleware(proxyOption))
  })
}

// mock 接口处理
app.all('*', (req, res) => {
  // Processing error prefix
  if (req.originalUrl.substr(0, prefix.length) !== prefix) {
    res.status(404).json({"error": "api prefix error"})
    return
  }

  // Analysis parameters
  const apiStr = req.params['0'].replace(new RegExp(prefix), '')
  const [apiName, apiId] = apiStr.split('/')

  // Processing api files undefined
  if (apis.indexOf(apiName) === -1) {
    res.status(404).json({"error": apiName + " not found"})
    return
  }

  // Auto load api file
  const apiJs = require('./api/' + apiName)

  // Processing api file error
  if ((apiId && !apiJs.item) || (!apiId && !apiJs.list)) {
    res.status(404).json({
      "error": `${apiName} not found, Please check /api/${apiName}.js`
    })
    return
  }

  const resObj = apiId ? apiJs.item : apiJs.list
  // Processing Method undefined
  const reqMethod = req.method.toLowerCase()
  if (!resObj[reqMethod]) {
    res.status(403).json({"error": "Method not supported"})
    return
  }

  // check token 
  if (checkToken.status) {
    const { tokenField, tokenPosition, noTokenApiList } = checkToken
    const noTokenApi = noTokenApiList.includes(apiName)
    const hasToken = req[tokenPosition][tokenField.toLowerCase()]
    if (!noTokenApi && !hasToken) {
      res.status(401).json({"error": "没有登录"})
      return
    }
  }

  // Return Response Data
  setTimeout(() => {
    const data = resObj[reqMethod]
    res.json(utils.toType(data) === 'function' ? data(req, res) : data)
  }, delay)
})

app.listen(
  port,
  host,
  () => {
    console.log(`Simple mock listening on http://${host}:${port}!`)
  }
)
