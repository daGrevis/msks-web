const fp = require('lodash/fp')

const elastic = require('./index')

const toBody = message =>
  fp.pick([
    'timestamp',
    'from',
    'to',
    'text',
  ], message)

const indexMessage = message => {
  return elastic.index({
    index: 'messages',
    type: 'message',
    id: message.id,
    body: toBody(message),
  })
}

const indexMessages = messages => {
  return elastic.bulk({
    body: fp.flatMap(message => [
      { index: { _index: 'messages', _type: 'message', _id: message.id }},
      toBody(message),
    ], messages),
  })
}

const searchMessages = async (channel, query, limit, afterTimestamp) => {
  let body = {
    size: limit,
    sort: [{ timestamp: { order: 'desc' }}],
    query: {
      bool: {
        filter: fp.concat(
          { term: { to: channel }},
          !query.nick ? [] : { term: { from: query.nick }}
        ),
        must: !query.text ? [] : [{
          match: {
            text: {
              query: query.text,
              operator: 'and',
              fuzziness: 'auto',
            }
          },
        }],
      },
    },
  }

  if (afterTimestamp) {
    body.search_after = [+afterTimestamp]
  }

  const { hits } = await elastic.search({
    index: 'messages',
    type: 'message',
    body,
  })

  return hits
}

module.exports = { indexMessage, indexMessages, searchMessages }
