export function getActions() {
	let actions = {
		route: {
			name: 'Route input to output channel A or B',
			options: [
				{
					type: 'textinput',
					label: 'Input',
					id: 'input',
					regex: this.REGEX_NUMBER,
				},
				{
					type: 'dropdown',
					label: 'Output Channel',
					id: 'channel',
					choices: this.CHANNEL,
					default: '1',
				},
			],
			callback: (action) => {
				this.sendCommand(`${action.options.input}*${action.options.channel}!`)
			},
		},
		recall_ps_channel: {
			name: 'Recall a saved user preset',
			options: [
				{
					type: 'dropdown',
					label: 'Output Channel',
					id: 'channel',
					choices: this.CHANNEL,
					default: '1',
				},
				{
					type: 'number',
					label: 'User Preset',
					id: 'preset',
					default: 1,
					min: 1,
					max: 16,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`${this.PRESET.userPreset}*${action.options.channel}*${action.options.preset}.`)
			},
		},
		recall_ps_input: {
			name: 'Recall a saved input preset',
			options: [
				{
					type: 'dropdown',
					label: 'Output Channel',
					id: 'channel',
					choices: this.CHANNEL,
					default: '1',
				},
				{
					type: 'number',
					label: 'Input Preset',
					id: 'preset',
					default: 1,
					min: 1,
					max: 128,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`${this.PRESET.inputPreset}*${action.options.preset}*${action.options.channel}.`)
			},
		},
		recall_ps_stream: {
			name: 'Recall a saved stream preset',
			options: [
				{
					type: 'dropdown',
					label: 'Encoder',
					id: 'encoder',
					choices: this.ENCODER,
					default: '1',
				},
				{
					type: 'number',
					label: 'Stream Preset',
					id: 'preset',
					default: 1,
					min: 1,
					max: 16,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`${this.PRESET.streamPreset}*${action.options.encoder}*${action.options.preset}.`)
			},
		},
		recall_ps_encoder: {
			name: 'Recall a saved encoder preset',
			options: [
				{
					type: 'dropdown',
					label: 'Encoder',
					id: 'encoder',
					choices: this.ENCODER,
					default: '1',
				},
				{
					type: 'number',
					label: 'Encoder Preset',
					id: 'preset',
					default: 1,
					min: 1,
					max: 16,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`${this.PRESET.encoderPreset}*${action.options.encoder}*${action.options.preset}.`)
			},
		},
		recall_ps_layout: {
			name: 'Recall a saved layout preset',
			options: [
				{
					type: 'number',
					label: 'Layout Preset',
					id: 'preset',
					default: 1,
					min: 1,
					max: 16,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`${this.PRESET.layoutPreset}*${action.options.preset}.`)
			},
		},
		recall_ps_layout_dual: {
			name: 'Recall a saved layout preset in Dual Encoding Mode',
			options: [
				{
					type: 'number',
					label: 'Layout Preset',
					id: 'preset',
					default: 1,
					min: 1,
					max: 10,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`${this.PRESET.layoutPresetDual}*3*${action.options.preset}.`)
			},
		},
		record: {
			name: 'Stop/Record/Pause',
			options: [
				{
					type: 'dropdown',
					label: 'Action',
					id: 'record_action',
					choices: this.RECORD,
					default: '0',
				},
			],
			callback: (action) => {
				this.sendCommand(`\x1BY${action.options.record_action}RCDR`)
			},
		},
		extend_rec: {
			name: 'Extend Scheduled Recording',
			options: [
				{
					type: 'number',
					label: 'Duration to extend (1 to 60 min)',
					id: 'duration',
					default: 5,
					min: 1,
					max: 60,
					range: false,
				},
			],
			callback: (action) => {
				this.sendCommand(`\x1BE${action.options.duration}RCDR`)
			},
		},
		rtmp_stream: {
			name: 'RTMP Stream',
			options: [
				{
					type: 'dropdown',
					label: 'Stream',
					id: 'rtmp_stream',
					choices: this.ENCODER,
					default: '1',
				},
				{
					type: 'dropdown',
					label: 'On/Off',
					id: 'onoff',
					choices: this.ONOFF,
					default: '0',
				},
			],
			callback: (action) => {
				this.sendCommand(`\x1BE${action.options.rtmp_stream}*${action.options.onoff}RTMP`)
			},
		},
	}

	return actions
}
