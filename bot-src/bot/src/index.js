const Promise = require('bluebird')
const fs = require('fs')
const _ = require('lodash')
const Joi = require('joi')
const irc = require('irc')

const { humanizeDelta } = require('./utils')
const config = require('./config')
const schemas = require('./schemas')
const r = require('./rethink')

const validate = Promise.promisify(Joi.validate)

const REPO_URL = `https://github.com/daGrevis/msks-bot`

const isMe = (client, nick) => client.nick === nick

function createChannel(name) {
  const channel = { name }

  validate(channel, schemas.Channel).then(channel => {
    // This creates the channel or silently fails when it exists already.
    r.table('channels').insert(channel).run()
      .catch(_.noop)
  })
}

function joinChannel(nick, channel) {
  const activeUser = { nick, channel }

  validate(activeUser, schemas.ActiveUser).then(() => {
    r.table('active_users').insert(activeUser).run()
  })
}

function leaveChannel(nick, channel) {
  r.table('active_users').filter({ nick, channel }).delete().run()
}

function leaveNetwork(nick) {
  r.table('active_users').filter({ nick }).delete().run()
}

function updateNick(nickOld, nickNew) {
  // Done like this to avoid need of handling updates when listening to changefeed.
  r.table('active_users').filter({ nick: nickOld }).delete({ returnChanges: true }).run()
    .then(({ changes }) => {
      const channels = _.map(changes, 'old_val.channel')
      _.forEach(channels, channel => {
        joinChannel(nickNew, channel)
      })
    })
}

function updateChannelActiveUsers(channel, nicks) {
  const activeUsers = _.map(_.keys(nicks), nick => ({ nick, channel }))

  // TODO: I'm pretty here's a race condition with parallel joins/leaves.
  r.table('active_users').filter({ channel }).delete().run()
    .then(() => {
      r.table('active_users').insert(activeUsers).run()
    })
}

function updateTopic(channel, topic) {
  // TODO: Race condition when this runs before channel exists.
  r.table('channels').get(channel).update({ topic }).run()
}

function saveMessage(message, i = 1) {
  r.table('messages').insert(message).run()
    .catch(err => {
      console.error(err)

      const delay = 1000 * i

      console.log(`retrying to save message ${JSON.stringify(message)} in ${delay} ms`)
      setTimeout(
        () => saveMessage(message, i + 1),
        delay
      )
    })
}

function getVersion() {
  let output
  try {
    output = fs.readFileSync('VERSION', 'utf8')
  } catch (err) {
    return
  }

  const [rev, tag, subject, date] = output.split('\n')

  return { rev, tag, subject, date }
}

function formatVersion(version) {
  if (!version) {
    return `msks-bot, ${REPO_URL}`
  }

  const { tag, rev, subject, date } = version
  return (
    `msks-bot ${tag}@${rev.slice(0, 7)}: "${subject}" of ${date}, ${REPO_URL}`
  )
}

function onMessage(from, to, text, kind='message') {
  const now = new Date()

  // Apparently & is a valid prefix.
  const isPrivate = !_.startsWith(to, '#') && !_.startsWith(to, '&')
  const timestamp = now

  const message = {
    from, to, text, kind, timestamp,
  }

  validate(message, schemas.Message).then(message => {
    saveMessage(message)

    const recipient = isPrivate ? from : to

    if (text === '!ping') {
      client.say(recipient, 'pong')
    }

    if (text === '!version') {
      client.say(recipient, formatVersion(version))
    }

    if (text === '!uptime') {
      const bootUptime = now - bootTime
      const connectionUptime = now - connectionTime

      client.say(recipient,
        `${humanizeDelta(bootUptime)} (${humanizeDelta(connectionUptime)})`
      )
    }
  })
}

const bootTime = new Date()
let connectionTime

const version = getVersion()

console.log('starting bot...')

const client = new irc.Client(
  config.ircServer, config.ircNick,
  {
    sasl: config.ircSasl,
    nick: config.ircNick,
    userName: config.ircUserName,
    password: config.ircPassword,
    realName: config.ircRealName,
  }
)

client.on('error', err => {
  console.error('error:', err)
})

client.on('netError', err => {
  console.error('network error:', err)
})

client.on('registered', () => {
  connectionTime = new Date()

  console.log('connected to server!')

  _.forEach(config.ircChannels, channel => {
    console.log(`joining ${channel}...`)
    client.join(channel)
  })
})

client.on('join', (channel, nick) => {
  if (isMe(client, nick)) {
    console.log(`joined ${channel}!`)
    createChannel(channel)
  }

  joinChannel(nick, channel)
})

client.on('part', (channel, nick) => {
  leaveChannel(nick, channel)
})

client.on('kick', (channel, nick) => {
  leaveChannel(nick, channel)
})

client.on('kill', nick => {
  leaveNetwork(nick)
})

client.on('quit', nick => {
  leaveNetwork(nick)
})

client.on('nick', (nickOld, nickNew) => {
  updateNick(nickOld, nickNew)
})

client.on('names', (channel, nicks) => {
  updateChannelActiveUsers(channel, nicks)
})

client.on('topic', (channel, topic) => {
  updateTopic(channel, topic)
})

client.on('message', (from, to, text) => {
  onMessage(from, to, text)
})

client.on('selfMessage', (to, text) => {
  onMessage(config.ircNick, to, text)
})

client.on('action', (from, to, text) => {
  onMessage(from, to, text, 'action')
})
