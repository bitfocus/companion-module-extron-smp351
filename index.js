import { InstanceBase, TelnetHelper, Regex, runEntrypoint } from '@companion-module/base'
import { getActions } from './actions.js'
//import { getPresets } from './presets.js'
import { getVariables } from './variables.js'
import { getFeedbacks } from './feedbacks.js'
import UpgradeScripts from './upgrades.js'

class ExtronInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config
		this.updateStatus('connecting')

		this.login = false
		this.states = {}

		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initTCP()
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'SMP IP address',
				width: 12,
				default: '192.168.254.254',
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'password',
				label: 'Admin or User Password',
				width: 8,
			},
		]
	}

	async configUpdated(config) {
		this.config = config

		this.initTCP()
	}

	async destroy() {
		clearInterval(this.heartbeat) // Stop Heartbeat
		this.states = {}

		if (this.socket !== undefined) {
			this.socket.destroy()
		}
	}

	CHANNEL = [
		{ label: 'A', id: '1' },
		{ label: 'B', id: '2' },
	]

	PRESET = {
		userPreset: 1,
		inputPreset: 2,
		streamPreset: 3,
		encoderPreset: 4,
		layoutPreset: 7,
		layoutPresetDual: 9,
	}

	RECORD = [
		{ label: 'Stop', id: '0' },
		{ label: 'Record', id: '1' },
		{ label: 'Pause', id: '2' },
	]

	ENCODER = [
		{ label: 'A', id: '1' },
		{ label: 'B', id: '2' },
		{ label: 'Confidence A', id: '3' },
	]

	ONOFF = [
		{ label: 'OFF', id: '0' },
		{ label: 'ON', id: '1' },
	]

	AUDIOINCHANNEL = [
		{ label: 'Analog In A Left', id: '0' },
		{ label: 'Analog In A Right', id: '1' },
		{ label: 'Digital In A Left', id: '2' },
		{ label: 'Digital In A Right', id: '3' },
		{ label: 'Analog In B Left', id: '4' },
		{ label: 'Analog In B Right', id: '5' },
		{ label: 'Digital In B Left', id: '6' },
		{ label: 'Digital In B Right', id: '7' },
	]

	AUDIOOUTCHANNEL = [
		{ label: 'Output Left', id: '0' },
		{ label: 'Output Right', id: '1' },
	]

	AUDIOTYPE = [
		{ label: 'Input', id: '4' },
		{ label: 'Output', id: '6' },
	]

	MUTEUNMUTE = [
		{ label: 'Mute', id: '1' },
		{ label: 'Unmute', id: '0' },
	]

	initVariables() {
		const variables = getVariables.bind(this)()
		this.setVariableDefinitions(variables)
		this.setVariableValues({
			recordStatus: 'Updating',
			timeRemain: '00:00:00',
			recordingTitle: 'None',
		})
	}

	initFeedbacks() {
		const feedbacks = getFeedbacks.bind(this)()
		this.setFeedbackDefinitions(feedbacks)
	}

	/* initPresets() {
		const presets = getPresets.bind(this)()
		this.setPresetDefinitions(presets)
	} */

	initActions() {
		const actions = getActions.bind(this)()
		this.setActionDefinitions(actions)
	}

	sendCommand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined) {
				this.socket.send(cmd + '\n')
			} else {
				this.log('connection_failure', 'Socket not connected :(')
			}
		}
	}

	initTCP() {
		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
			this.login = false
		}

		if (this.config.host) {
			this.socket = new TelnetHelper(this.config.host, 23)

			this.socket.on('status_change', (status, message) => {
				if (status !== 'ok') {
					this.updateStatus(status)
					this.log('unknown_error', message)
				}
			})

			this.socket.on('error', (err) => {
				this.log('connection_failure', 'Network error: ' + err.message)
				this.login = false
			})

			this.socket.on('connect', () => {
				this.login = false
			})

			// if we get any data, display it to stdout
			this.socket.on('data', (buffer) => {
				let inData = buffer.toString('utf8')
				this.incomingData(inData)
			})

			this.socket.on('iac', (type, info) => {
				// tell remote we WON'T do anything we're asked to DO
				if (type == 'DO') {
					this.socket.send(Buffer.from([255, 252, info]))
				}

				// tell the remote DON'T do whatever they WILL offer
				if (type == 'WILL') {
					this.socket.send(Buffer.from([255, 254, info]))
				}
			})
		}
	}

	setupHeartbeat() {
		// Heartbeat to keep connection alive
		clearInterval(this.heartbeat)

		let beat_period = 5
		if (this.recordStatus === 'Recording') {
			beat_period = 1
		} else {
			beat_period = 5 // Seconds
		}

		this.heartbeat = setInterval(() => {
			this.login = false
			this.socket?.send('2I\n') // should respond with model description eg: "Streaming Media Processor"
		}, beat_period * 1000)
	}

	incomingData(data) {
		// Match part of the copyright response from unit when a connection is made.
		if (this.login === false && data.match(/Extron Electronics/)) {
		}

		if (this.login === false && data.match(/Password:/)) {
			this.socket.send('\r' + this.config.password + '\r') // Enter Password Set
		}
		// Match login success response from unit.
		else if (this.login === false && data.match(/Login/)) {
			this.login = true
			this.socket.send('\x1B3CV\r') // Set Verbose mode to 3
			this.socket.send('2I\n') // Query model description

			this.socket.send('\x1BYRCDR\n') // Request Record Status
			this.socket.send('\x1BS1*1RTMP\n') // Request Pri A Stream Status
			this.socket.send('\x1BS1*2RTMP\n') // Request Pri B Stream Status
			this.socket.send('\x1BS1*3RTMP\n') // Request Pri Confidence A Stream Status
			this.socket.send('\x1BS2*1RTMP\n') // Request Bac A Stream Status
			this.socket.send('\x1BS2*2RTMP\n') // Request Bac B Stream Status
			this.socket.send('\x1BS2*3RTMP\n') // Request Bac Confidence A Stream Status
			this.socket.send('\x1B1ENCM\n') // Request Composite/Dual Channel Encoder mode
			this.socket.send('36I\n')
			this.socket.send('\x1BM13RCDR\n') // Metadata - Title

			//Audio Mute Status
			//Wait until we can properly process this info before implementing

			/* for (let x in this.AUDIOINCHANNEL) {
				let channel = this.AUDIOINCHANNEL[x].id
				console.log(channel)
				this.socket.send(`\x1BM4000${channel}AU`)
			}

			for (let x in this.AUDIOOUTCHANNEL) {
				let channel = this.AUDIOOUTCHANNEL[x].id
				this.socket.send(`\x1BM6000${channel}AU`)
			} */

			this.updateStatus('ok')
		}

		// Match expected response from unit.
		else if (this.login === false && data.match(/Streaming/)) {
			this.login = true
			this.socket.send('\x1BYRCDR\n') // Request Record Status
			this.socket.send('\x1BS1*1RTMP\n') // Request Pri A Stream Status
			this.socket.send('\x1BS1*2RTMP\n') // Request Pri B Stream Status
			this.socket.send('\x1BS1*3RTMP\n') // Request Pri Confidence A Stream Status
			this.socket.send('\x1BS2*1RTMP\n') // Request Bac A Stream Status
			this.socket.send('\x1BS2*2RTMP\n') // Request Bac B Stream Status
			this.socket.send('\x1BS2*3RTMP\n') // Request Bac Confidence A Stream Status
			this.socket.send('\x1B1ENCM\n') // Request Composite/Dual Channel Encoder mode
			this.socket.send('36I\n')
			this.socket.send('\x1BM13RCDR\n') // Metadata - Title
			this.updateStatus('ok')
		}

		if (this.login === true) {
			this.setupHeartbeat()
		}
		// Match recording state change expected response from unit.
		if (this.login === true && data.match(/RcdrY\d+/)) {
			this.states['record_bg'] = parseInt(data.match(/RcdrY(\d+)/)[1])
			this.checkFeedbacks('record_bg')

			if (this.states['record_bg'] === 2) {
				this.recordStatus = 'Paused'
			} else if (this.states['record_bg'] === 1) {
				this.recordStatus = 'Recording'
			} else if (this.states['record_bg'] === 0) {
				this.recordStatus = 'Stopped'
			} else {
				this.recordStatus = 'Updating'
			}
			this.setVariableValues({ recordStatus: this.recordStatus })
		}
		if (this.login === true && data.match(/^Inf36.+/)) {
			if (this.states['record_bg'] === 0) {
				this.states['time_remain'] = '00:00:00'
			} else {
				this.states['time_remain'] = data.slice(data.length - 10)
			}
			this.timeRemain = this.states['time_remain']
			this.setVariableValues({ timeRemain: this.timeRemain })
		}

		// Match stream state change expected response from unit.
		if (this.login === true && data.match(/RtmpE1\*\d+/)) {
			this.states['rtmpStatus_a_bg'] = parseInt(data.match(/RtmpE1\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_a_bg')
		}

		if (this.login === true && data.match(/RtmpS1\*1\*\d+/)) {
			this.states['rtmpStatus_a_bg'] = parseInt(data.match(/RtmpS1\*1\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_a_bg')
		}

		if (this.login === true && data.match(/RtmpS2\*1\*\d+/)) {
			this.states['rtmpStatus_a2_bg'] = parseInt(data.match(/RtmpS2\*1\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_a2_bg')
		}

		if (this.login === true && data.match(/RtmpE2\*\d+/)) {
			this.states['rtmpStatus_b_bg'] = parseInt(data.match(/RtmpE2\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_b_bg')
		}

		if (this.login === true && data.match(/RtmpS1\*2\*\d+/)) {
			this.states['rtmpStatus_b_bg'] = parseInt(data.match(/RtmpS1\*2\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_b_bg')
		}

		if (this.login === true && data.match(/RtmpS2\*2\*\d+/)) {
			this.states['rtmpStatus_b2_bg'] = parseInt(data.match(/RtmpS2\*2\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_b2_bg')
		}

		if (this.login === true && data.match(/RtmpE3\*\d+/)) {
			this.states['rtmpStatus_ca_bg'] = parseInt(data.match(/RtmpE3\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_ca_bg')
		}

		if (this.login === true && data.match(/RtmpS1\*3\*\d+/)) {
			this.states['rtmpStatus_ca_bg'] = parseInt(data.match(/RtmpS1\*3\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_ca_bg')
		}

		if (this.login === true && data.match(/RtmpS2\*3\*\d+/)) {
			this.states['rtmpStatus_ca2_bg'] = parseInt(data.match(/RtmpS2\*3\*(\d+)/)[1])
			this.checkFeedbacks('rtmpStatus_ca2_bg')
		}

		if (this.login === true && data.match(/Encm1\*\d/)) {
			this.states['encoder_mode_dual'] = parseInt(data.match(/Encm1\*(\d)/)[1])
			this.checkFeedbacks('encoder_mode_dual')
		}

		if (this.login === true && data.match(/RcdrM13/)) {
			if (data.match(/RcdrM13\*/)) {
				this.states['title'] = data.split(/RcdrM13\*/).pop()
			} else {
				this.states['title'] = 'None'
			}
			this.setVariableValues({ recordingTitle: this.states['title'] })
		}

		if (this.login === true && data.match(/DsM\d000\d\*\d/)) {
			//let audioMuteStatus = data.match(/DsM\d000\d\*\d/)[0]
			let audioType = data.match(/\d/g)[0]
			let audioChannel = data.match(/\d/g)[4]
			let audioStatus = data.match(/\d/g)[5]

			if (audioType === '4') {
				this.states[`audio_input_${audioChannel}`] = audioStatus
			} else {
				this.states[`audio_output_${audioChannel}`] = audioStatus
			}

			this.checkFeedbacks('audio_mute')
		}
	}
}

runEntrypoint(ExtronInstance, UpgradeScripts)
