import _ from 'lodash'
import React, { Component } from 'react'
import { connect } from 'react-redux'

import { channelName, isChannelLoading, selectedChannel, channelMessages, messageRows } from '../selectors'
import { loadMessages } from '../actions'
import Link from '../components/Link'
import Maybe from '../components/Maybe'
import Text from '../components/Text'
import Message from '../components/Message'
import Loader from '../components/Loader'

import './Channel.css'

const DayHeader = ({ text, isoTimestamp }) => {
  return (
    <div className='day-header'>
      <span className='text bold' title={isoTimestamp}>
        {text}
      </span>
      <div className='divider' />
    </div>
  )
}

const getMessageRowKey = ({ type, payload }) => {
  const keyerMapping = {
    loader: () => 'loader',
    day: ({ isoTimestamp }) => isoTimestamp,
    message: ({ message }) => message.id,
  }

  return keyerMapping[type](payload)
}

const MessageRow = ({ type, payload = {} }) => {
  const componentMapping = {
    loader: Loader,
    day: DayHeader,
    message: Message,
  }

  const component = componentMapping[type]
  const props = payload

  return React.createElement(component, props)
}

const Messages = ({ messageRows }) => {
  return (
    <div className='messages'>
      {_.map(messageRows, props => <MessageRow {...props} key={getMessageRowKey(props)} />)}
    </div>
  )
}

class Channel extends Component {
  wrapperNode = null

  autoScroll = true
  persistScroll = false
  scrollHeight = 0
  scrollTop = 0

  state = {
    isTopicExpanded: false,
  }

  componentDidMount() {
    this.props.loadMessages()

    this.autoScroll = true
    this.scroll()
  }

  componentWillUpdate(nextProps) {
    const { wrapperNode } = this

    if (!wrapperNode) {
      return
    }

    this.autoScroll = wrapperNode.scrollTop + wrapperNode.offsetHeight === wrapperNode.scrollHeight

    if (!this.autoScroll) {
      this.persistScroll = (
        !_.isEmpty(nextProps.messages)
        && _.first(nextProps.messages) !== _.first(this.props.messages)
      )

      if (this.persistScroll) {
        this.scrollHeight = wrapperNode.scrollHeight
        this.scrollTop = wrapperNode.scrollTop
      }
    }
  }

  componentDidUpdate() {
    this.props.loadMessages()

    this.scroll()
  }

  scroll() {
    const { wrapperNode } = this

    if (wrapperNode) {
      if (this.autoScroll) {
        setTimeout(() => {
          wrapperNode.scrollTop = wrapperNode.scrollHeight
        })
      } else if (this.persistScroll) {
        wrapperNode.scrollTop = this.scrollTop + (wrapperNode.scrollHeight - this.scrollHeight)
      }
    }
  }

  onRef = node => {
    this.wrapperNode = node
  }

  onScroll = ev => {
    const { target: wrapperNode } = ev

    const threshold = document.documentElement.clientHeight
    if (wrapperNode.scrollTop <= threshold) {
      const messageFirst = _.first(this.props.messages)
      this.props.loadMessages(messageFirst ? messageFirst.timestamp : null)
    }
  }

  onTopicClick = () => {
    this.setState({ isTopicExpanded: !this.state.isTopicExpanded })
  }

  render() {
    if (this.props.isChannelLoading) {
      return null
    }

    const { selectedChannel, messageRows } = this.props

    return (
      <div id='channel'>
        <div className='header'>
          <Link href='/'>
            <h2 className='name bold'>{selectedChannel.name}</h2>
          </Link>
          <Maybe when={selectedChannel.topic}>
            <p className='topic-wrapper'>
              <Maybe when={this.state.isTopicExpanded}>
                <span className='topic'>
                  <Text>{selectedChannel.topic}</Text>
                </span>
              </Maybe>
              <span className='topic-ellipsis' onClick={this.onTopicClick}>…</span>
            </p>
          </Maybe>
        </div>

        <div className='messages-wrapper' ref={this.onRef} onScroll={this.onScroll}>
          <Messages messageRows={messageRows} />
        </div>
      </div>
    )
  }
}

function mapStateToProps(state, props) {
  const name = channelName(state)
  return {
    isChannelLoading: isChannelLoading(state),
    selectedChannel: selectedChannel(state),
    messages: channelMessages(name)(state),
    messageRows: messageRows(name)(state),
  }
}

function mapDispatchToProps(dispatch) {
  return {
    loadMessages: timestamp => dispatch(loadMessages(timestamp)),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Channel)
