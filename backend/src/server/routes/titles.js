const fs = require('fs')

const _ = require('lodash')
const fp = require('lodash/fp')
const KoaRouter = require('koa-router')
const escapeHtml = require('escape-html')

const titles = require('../../env/titles')
const config = require('../../env/config')
const logger = require('../../env/logger')
const isUuid = require('../../utils/isUuid')
const store = require('../../store')
const { getMessage } = require('../../postgres/queries/messages')

const router = new KoaRouter()

router.get('/*', async (ctx, next) => {
  const params = ctx.params[0].split('/')

  const clientPath = _.isObject(config.http.clientPath)
    ? config.http.clientPath[ctx.request.headers['x-client-app']]
    : config.http.clientPath

  if (!clientPath) {
    return next()
  }

  const indexPath = `${clientPath}/index.html`

  let indexHtml
  try {
    indexHtml = fs.readFileSync(indexPath, 'utf8')
  } catch (e) {
    logger.warn(`Could not find '${indexPath}'!`)
    return next()
  }

  let title

  const lastParam = fp.last(params)
  const messageId = isUuid(lastParam) ? lastParam : undefined

  const message = messageId ? await getMessage(messageId) : null

  if (message) {
    const state = store.getState()

    const channel = state.channels[message.channelId]

    if (!channel || !channel.isPublic) {
      return next()
    }

    title = titles.getMessageTitle(message)
  } else {
    const [serverId, channelName, nick] = params

    title = titles.getChannelTitle(serverId, channelName, nick)
  }

  indexHtml = indexHtml.replace(
    '<title>msks</title>',
    `<title>${escapeHtml(title)}</title>`,
  )

  ctx.body = indexHtml
})

module.exports = router
