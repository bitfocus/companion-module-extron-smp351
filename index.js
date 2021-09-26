var instance_skel = require('../../instance_skel');
var TelnetSocket = require('../../telnet');
var debug;
var log;

function instance (system, id, config) {
	var self = this;

	// Request id counter
	self.request_id = 0;
	self.login = false;
	// super-constructor
	instance_skel.apply(this, arguments);
	self.status(1, 'Initializing');
	self.actions(); // export actions

	return self;
}

instance.prototype.updateConfig = function (config) {
	var self = this;
	self.config = config;
	self.init_tcp();
};

instance.GetUpgradeScripts = function() {
	return [
		instance_skel.CreateConvertToBooleanFeedbackUpgradeScript({
			'record_bg': true,
			'rtmpStatus_a_bg': true,
			'rtmpStatus_b_bg': true,
			'rtmpStatus_ca_bg': true,
			'rtmpStatus_a2_bg': true,
			'rtmpStatus_b2_bg': true,
			'rtmpStatus_ca2_bg': true
		}),
	]
}

instance.prototype.init = function () {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.states = {};
	self.init_feedbacks();
	self.init_variables();
	self.init_tcp();
};

instance.prototype.incomingData = function (data) {
	var self = this;
	debug(data);

	// Match part of the copyright response from unit when a connection is made.
	if (self.login === false && data.match(/Extron Electronics/)) {
		self.status(self.STATUS_WARNING, 'Logging in');
		self.socket.write('\x1B3CV\r'); // Set Verbose mode to 3
		self.socket.write('2I\n'); // Query model description
	}

	if (self.login === false && data.match(/Password:/)) {
		self.status(self.STATUS_WARNING, 'Logging in');
		self.socket.write('\r' + self.config.password + '\r'); // Enter Password Set
	}
	// Match login success response from unit.
	else if (self.login === false && data.match(/Login/)) {
		self.login = true;
		self.socket.write('\x1B3CV\r'); // Set Verbose mode to 3
		self.socket.write('\x1BYRCDR\n'); // Request Record Status
		self.socket.write('\x1BS1*1RTMP\n'); // Request Pri A Stream Status
		self.socket.write('\x1BS1*2RTMP\n'); // Request Pri B Stream Status
		self.socket.write('\x1BS1*3RTMP\n'); // Request Pri Confidence A Stream Status
		self.socket.write('\x1BS2*1RTMP\n'); // Request Bac A Stream Status
		self.socket.write('\x1BS2*2RTMP\n'); // Request Bac B Stream Status
		self.socket.write('\x1BS2*3RTMP\n'); // Request Bac Confidence A Stream Status
		self.socket.write('36I\n');
		self.socket.write('\x1BM13RCDR\n') // Metadata - Title
		self.status(self.STATUS_OK);
		debug('logged in');
	}
	// Match expected response from unit.
	else if (self.login === false && data.match(/Streaming/)) {
		self.login = true;
		self.socket.write('\x1BYRCDR\n'); // Request Record Status
		self.socket.write('\x1BS1*1RTMP\n'); // Request Pri A Stream Status
		self.socket.write('\x1BS1*2RTMP\n'); // Request Pri B Stream Status
		self.socket.write('\x1BS1*3RTMP\n'); // Request Pri Confidence A Stream Status
		self.socket.write('\x1BS2*1RTMP\n'); // Request Bac A Stream Status
		self.socket.write('\x1BS2*2RTMP\n'); // Request Bac B Stream Status
		self.socket.write('\x1BS2*3RTMP\n'); // Request Bac Confidence A Stream Status
		self.socket.write('36I\n');
		self.socket.write('\x1BM13RCDR\n') // Metadata - Title
		self.status(self.STATUS_OK);
		debug('Heartbeat done');
	}
	// Heartbeat to keep connection alive
	function heartbeat () {
		self.login = false;
		self.socket.write('2I\n'); // should respond with model description eg: "Streaming Media Processor"
		debug('Checking Connection');
	}
	if (self.login === true) {
		clearInterval(self.heartbeat_interval);
		if (self.recordStatus === 'Recording') {
			var beat_period = 1;
		} else {
			var beat_period = 5; // Seconds
		}
		self.heartbeat_interval = setInterval(heartbeat, beat_period * 1000);
	}
	// Match recording state change expected response from unit.
	if (self.login === true && data.match(/RcdrY\d+/)) {
		self.states['record_bg'] = parseInt(data.match(/RcdrY(\d+)/)[1]);
		self.checkFeedbacks('record_bg');
		debug('recording change');
		if (self.states['record_bg'] === 2) {
			self.recordStatus = 'Paused';
		} else if (self.states['record_bg'] === 1) {
			self.recordStatus = 'Recording';
		} else if (self.states['record_bg'] === 0) {
			self.recordStatus = 'Stopped';
		} else {
			self.recordStatus = 'Updating';
		}
		self.setVariable('recordStatus', self.recordStatus);
	}
	if (self.login === true && data.match(/^Inf36.+/)) {
		if (self.states['record_bg'] === 0) {
			self.states['time_remain'] = '00:00:00'
		} else {
			self.states['time_remain'] = data.slice(data.length -10);
			debug("time change", data);
			}
		self.timeRemain = self.states['time_remain']
		self.setVariable('timeRemain', self.timeRemain);
	}

	// Match stream state change expected response from unit.
	if (self.login === true && data.match(/RtmpE1\*\d+/)) {
		self.states['rtmpStatus_a_bg'] = parseInt(data.match(/RtmpE1\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_a_bg');
		debug('stream a change');
	}

	if (self.login === true && data.match(/RtmpS1\*1\*\d+/)) {
		self.states['rtmpStatus_a_bg'] = parseInt(data.match(/RtmpS1\*1\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_a_bg');
		debug('primary stream a change');
	}

	if (self.login === true && data.match(/RtmpS2\*1\*\d+/)) {
		self.states['rtmpStatus_a2_bg'] = parseInt(data.match(/RtmpS2\*1\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_a2_bg');
		debug('backup stream a change');
	}

	if (self.login === true && data.match(/RtmpE2\*\d+/)) {
		self.states['rtmpStatus_b_bg'] = parseInt(data.match(/RtmpE2\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_b_bg');
		debug('stream b change');
	}

	if (self.login === true && data.match(/RtmpS1\*2\*\d+/)) {
		self.states['rtmpStatus_b_bg'] = parseInt(data.match(/RtmpS1\*2\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_b_bg');
		debug('primary stream b change');
	}

	if (self.login === true && data.match(/RtmpS2\*2\*\d+/)) {
		self.states['rtmpStatus_b2_bg'] = parseInt(data.match(/RtmpS2\*2\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_b2_bg');
		debug('backup stream b change');
	}

	if (self.login === true && data.match(/RtmpE3\*\d+/)) {
		self.states['rtmpStatus_ca_bg'] = parseInt(data.match(/RtmpE3\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_ca_bg');
		debug('stream confidence a change');
	}

	if (self.login === true && data.match(/RtmpS1\*3\*\d+/)) {
		self.states['rtmpStatus_ca_bg'] = parseInt(data.match(/RtmpS1\*3\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_ca_bg');
		debug('primary stream confidence a change');
	}

	if (self.login === true && data.match(/RtmpS2\*3\*\d+/)) {
		self.states['rtmpStatus_ca2_bg'] = parseInt(data.match(/RtmpS2\*3\*(\d+)/)[1]);
		self.checkFeedbacks('rtmpStatus_ca2_bg');
		debug('backup stream confidence a change');
	}

	if (self.login === true && data.match(/RcdrM13\*/)) {
		self.states['title'] = data.split(/RcdrM13\*/).join("")
		self.setVariable('recordingTitle', self.states['title']);
	}

	else {
		debug('data no login', data);
	}
};

instance.prototype.init_tcp = function () {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
		self.login = false;
	}

	if (self.config.host) {
		self.socket = new TelnetSocket(self.config.host, 23);

		self.socket.on('status_change', function (status, message) {
			if (status !== self.STATUS_OK) {
				self.status(status, message);
			}
		});

		self.socket.on('error', function (err) {
			debug('Network error', err);
			self.log('error', 'Network error: ' + err.message);
			self.login = false;
		});

		self.socket.on('connect', function () {
			debug('Connected');
			self.login = false;
		});

		// if we get any data, display it to stdout
		self.socket.on("data", function (buffer) {
			var inData = buffer.toString("utf8");
			self.incomingData(inData);
		});

		self.socket.on("iac", function (type, info) {
			// tell remote we WONT do anything we're asked to DO
			if (type == 'DO') {
				self.socket.write(Buffer.from([ 255, 252, info ]));
			}

			// tell the remote DONT do whatever they WILL offer
			if (type == 'WILL') {
				self.socket.write(Buffer.from([ 255, 254, info ]));
			}
		});
	}
};

instance.prototype.CHOICES_CHANNEL = [
	{ label: 'A', id: '1' },
	{ label: 'B', id: '2' }
];

instance.prototype.CHOICES_PRESET = {
	userPreset: 1,
	inputPreset: 2,
	streamPreset: 3,
	encoderPreset: 4,
	layoutPreset: 7,
}

instance.prototype.CHOICES_RECORD = [
	{ label: 'Stop', id: '0' },
	{ label: 'Record', id: '1' },
	{ label: 'Pause', id: '2' }
];

instance.prototype.CHOICES_ENCODER = [
	{ label: 'A', id: '1' },
	{ label: 'B', id: '2' },
	{ label: 'Confidence A', id: '3' }
];

instance.prototype.CHOICES_ONOFF = [
	{ label: 'OFF', id: '0' },
	{ label: 'ON', id: '1' }
];

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This will establish a telnet connection to the SMP 351'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'SMP IP address',
			width: 12,
			default: '192.168.254.254',
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'password',
			label: 'Admin or User Password',
			width: 8
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this;
	clearInterval(self.heartbeat_interval); // Stop Heartbeat

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	self.states = {};

	debug('destroy', self.id);
};

instance.prototype.init_feedbacks = function () {
	var self = this;
	var feedbacks = {};

	feedbacks['record_bg'] = {
		type: 'boolean',
		label: 'Record Status',
		description: 'If the record state specified is in use, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(200, 0, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'Status',
				id: 'record',
				default: 1,
				choices: self.CHOICES_RECORD
			}
		]
	}

	feedbacks['rtmpStatus_a_bg'] = {
		type: 'boolean',
		label: 'Primary RTMP Stream A Status',
		description: 'If Primary RTMP Stream A is Live, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(0, 255, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				default: 0,
				choices: self.CHOICES_ONOFF
			}
		]
	}

	feedbacks['rtmpStatus_b_bg'] = {
		type: 'boolean',
		label: 'Primary RTMP Stream B Status',
		description: 'If Primary RTMP Stream B is Live, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(0, 255, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				default: 0,
				choices: self.CHOICES_ONOFF
			}
		]
	}

	feedbacks['rtmpStatus_ca_bg'] = {
		type: 'boolean',
		label: 'Primary RTMP Stream Confidence A Status',
		description: 'If Primary RTMP Stream Confidence A is Live, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(0, 255, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				default: 0,
				choices: self.CHOICES_ONOFF
			}
		]
	}

	feedbacks['rtmpStatus_a2_bg'] = {
		type: 'boolean',
		label: 'Backup RTMP Stream A Status',
		description: 'If Backup RTMP Stream A is Live, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(0, 255, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				default: 0,
				choices: self.CHOICES_ONOFF
			}
		]
	}

	feedbacks['rtmpStatus_b2_bg'] = {
		type: 'boolean',
		label: 'Backup RTMP Stream B Status',
		description: 'If Backup RTMP Stream B is Live, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(0, 255, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				default: 0,
				choices: self.CHOICES_ONOFF
			}
		]
	}

	feedbacks['rtmpStatus_ca2_bg'] = {
		type: 'boolean',
		label: 'RTMP Stream Confidence A Status',
		description: 'If Backup RTMP Stream Confidence A is Live, change the style of the button',
		style: {
			color: self.rgb(255, 255, 255),
			bgcolor: self.rgb(0, 255, 0)
		},
		options: [
			{
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				default: 0,
				choices: self.CHOICES_ONOFF
			}
		]
	}

	self.setFeedbackDefinitions(feedbacks);
};

instance.prototype.feedback = function (feedback, bank) {
	var self = this;

	if (feedback.type === 'record_bg') {
		if (self.states['record_bg'] === parseInt(feedback.options.record)) {
			return true
		}
	}

	if (feedback.type === 'rtmpStatus_a_bg') {
		if (self.states['rtmpStatus_a_bg'] === parseInt(feedback.options.onoff)) {
			return true
		}
	}

	if (feedback.type === 'rtmpStatus_b_bg') {
		if (self.states['rtmpStatus_b_bg'] === parseInt(feedback.options.onoff)) {
			return true
		}
	}

	if (feedback.type === 'rtmpStatus_ca_bg') {
		if (self.states['rtmpStatus_ca_bg'] === parseInt(feedback.options.onoff)) {
			return true
		}
	}

	if (feedback.type === 'rtmpStatus_a2_bg') {
		if (self.states['rtmpStatus_a2_bg'] === parseInt(feedback.options.onoff)) {
			return true
		}
	}

	if (feedback.type === 'rtmpStatus_b2_bg') {
		if (self.states['rtmpStatus_b2_bg'] === parseInt(feedback.options.onoff)) {
			return true
		}
	}

	if (feedback.type === 'rtmpStatus_ca2_bg') {
		if (self.states['rtmpStatus_ca2_bg'] === parseInt(feedback.options.onoff)) {
			return true
		}
	}

	return false
};

instance.prototype.init_variables = function () {
	var self = this;
	var variables = [];

	var recordStatus = 'Updating';
	var timeRemain = '00:00:00';

	variables.push({
		label: 'Current recording status',
		name: 'recordStatus'
	});
	self.setVariable('recordStatus', recordStatus);

	variables.push({
		label: 'Time remaining on recording hh:mm:ss',
		name: 'timeRemain'
	});
	self.setVariable('timeRemain', timeRemain);

	variables.push({
		label: 'Current recording title',
		name: 'recordingTitle'
	});
	self.setVariable('recordingTitle', 'None');

	self.setVariableDefinitions(variables);
}

instance.prototype.actions = function (system) {
	var self = this;
	var actions = {
		'route': {
			label: 'Route input to output channel A or B',
			options: [{
				type: 'textinput',
				label: 'Input',
				id: 'input',
				regex: self.REGEX_NUMBER
			}, {
				type: 'dropdown',
				label: 'Output Channel',
				id: 'channel',
				choices: self.CHOICES_CHANNEL, 
				default: '1'
			}]
		},
		'recall_ps_channel': {
			label: 'Recall a saved user preset',
			options: [{
				type: 'dropdown',
				label: 'Output Channel',
				id: 'channel',
				choices: self.CHOICES_CHANNEL,
				default: '1'
			}, {
				type: 'number',
				label: 'User Preset',
				id: 'preset',
				default: 1,
				min: 1,
				max: 16,
				range: false,
			}]
		},
		'recall_ps_input': {
			label: 'Recall a saved input preset',
			options: [{
				type: 'dropdown',
				label: 'Output Channel',
				id: 'channel',
				choices: self.CHOICES_CHANNEL,
				default: '1'
			},	{
				type: 'number',
				label: 'Input Preset',
				id: 'preset',
				default: 1,
				min: 1,
				max: 128,
				range: false,
			}]
		},
		'recall_ps_stream': {
			label: 'Recall a saved stream preset',
			options: [{
				type: 'dropdown',
				label: 'Encoder',
				id: 'encoder',
				choices: self.CHOICES_ENCODER,
				default: '1'
			}, {
				type: 'number',
				label: 'Stream Preset',
				id: 'preset',
				default: 1,
				min: 1,
				max: 16,
				range: false,
			}]
		},
		'recall_ps_encoder': {
			label: 'Recall a saved encoder preset',
			options: [{
				type: 'dropdown',
				label: 'Encoder',
				id: 'encoder',
				choices: self.CHOICES_ENCODER,
				default: '1'
			}, {
				type: 'number',
				label: 'Encoder Preset',
				id: 'preset',
				default: 1,
				min: 1,
				max: 16,
				range: false,
			}]
		},
		'recall_ps_layout': {
			label: 'Recall a saved layout preset',
			options: [{
				type: 'number',
				label: 'Layout Preset',
				id: 'preset',
				default: 1,
				min: 1,
				max: 16,
				range: false,
			}]
		},
		'record': {
			label: 'Stop/Record/Pause',
			options: [{
				type: 'dropdown',
				label: 'Action',
				id: 'record_action',
				choices: self.CHOICES_RECORD,
				default: '0'
			}]
		},
		'extend_rec': {
			label: 'Extend Scheduled Recording',
			options: [{
				type: 'number',
				label: 'Duration to extend (1 to 60 min)',
				id: 'duration',
				default: 5,
				min: 1,
				max: 60,
				range: false,
			}]
		},
		'rtmp_stream': {
			label: 'RTMP Stream',
			options: [{
				type: 'dropdown',
				label: 'Stream',
				id: 'rtmp_stream',
				choices: self.CHOICES_ENCODER,
				default: '1'
			}, {
				type: 'dropdown',
				label: 'On/Off',
				id: 'onoff',
				choices: self.CHOICES_ONOFF,
				default: '0'
			}]
		}
	};

	self.setActions(actions);
};

instance.prototype.action = function (action) {
	var self = this;
	var id = action.action;
	var opt = action.options;
	var cmd;

	switch (id) {
		case 'route':
			cmd = opt.input + '*' + opt.channel + '!';
			break;

		case 'recall_ps_channel':
			cmd = self.CHOICES_PRESET.userPreset + '*' + opt.channel + '*' + opt.preset + '.';
			break;

		case 'recall_ps_input':
			cmd = self.CHOICES_PRESET.inputPreset + '*' + opt.preset + '*' + opt.channel + '.';
			break;

		case 'recall_ps_stream':
			cmd = self.CHOICES_PRESET.streamPreset + '*' + opt.encoder + '*' + opt.preset + '.';
			break;

		case 'recall_ps_encoder':
			cmd = self.CHOICES_PRESET.encoderPreset + '*' + opt.encoder + '*' + opt.preset + '.';
			break;

		case 'recall_ps_layout':
			cmd = self.CHOICES_PRESET.layoutPreset + '*' + opt.preset + '.';
			break;

		case 'record':
			cmd = '\x1BY' + opt.record_action + 'RCDR';
			break;

		case 'extend_rec':
			cmd = '\x1BE' + opt.duration + 'RCDR';
			break;

		case 'rtmp_stream':
			cmd = '\x1BE' + opt.rtmp_stream + '*' + opt.onoff + 'RTMP';
			break;
	}

	if (cmd !== undefined) {
		if (self.socket !== undefined && self.socket.connected) {
			self.socket.write(cmd + '\n');
		} else {
			debug('Socket not connected :(');
		}
	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
