 'use strict';

 function EventHandler() {
	this.listeners = [];
	this.event = null;
	this.addListener = function (function_reference) {
		this.event.addListener(function_reference);
		this.listeners.push(function_reference);
	}
	this.removeListener = function (function_reference) {
		for (var i = (this.listeners.length - 1); i >= 0; i--) {
			if (this.listeners[i] == function_reference) {
				this.event.removeListener(function_reference);
				this.listeners.splice(i, 1);
				break;
			}
		}
	}
}
 
var serial =  {
	connectionId:    false,
	openRequested:   false,
	openCanceled:    false,
	bitrate:         0,
	bytesReceived:   0,
	bytesSent:       0,
	failed:          0,

	driver:          null,
	driveType:       null,

	transmitting:   false,
	outputBuffer:  [],

	connect: function (path, options, callback) {
		var self = this;
		self.openRequested = true;

		var ipRegexp = /^((?:\w|.)+):(\d+)$/;

		var addrIP = path.match(ipRegexp);
		if(addrIP) {
			self.driver =  chrome.sockets.tcp;
			self.driverType = 'TCP';
			self.onReceive.event = self.driver.onReceive;
			self.onReceiveError.event = self.driver.onReceiveError;
				
			chrome.sockets.tcp.create({}, function(createInfo) {
				chrome.sockets.tcp.connect(createInfo.socketId, addrIP[1], +addrIP[2], function (result) {
					if (chrome.runtime.lastError) {
						console.error(self.driverType + ':' + chrome.runtime.lastError.message);
					}
					if(result >= 0) {
						self.connectionId = createInfo.socketId;
						self.bytesReceived = 0;
						self.bytesSent = 0;
						self.failed = 0;
						self.openRequested = false;

						self.onReceive.addListener(function log_bytesReceived(info) {
							self.bytesReceived += info.data.byteLength;
						});

						self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
							console.error(info);
							googleAnalytics.sendException(self.driverType + ': ' + info.resultCode, false);

							if (!self.failed++) {
								self.driver.setPaused(self.connectionId, false, function () {
									self.getInfo(function (info) {
										if (info) {
											if (!info.paused) {
												console.log(self.driverType + ': Connection recovered from last onReceiveError');
												googleAnalytics.sendException(self.driverType + ':  onReceiveError - recovered', false);

												self.failed = 0;
											} else {
												console.log(self.driverType + ': Connection did not recover from last onReceiveError, disconnecting');
												GUI.log('Unrecoverable <span style="color: red">failure</span> of ' + self.driverType + ' connection, disconnecting...');
												googleAnalytics.sendException(self.driverType + ':  onReceiveError - unrecoverable', false);

												if (GUI.connected_to || GUI.connecting_to) {
													$('a.connect').click();
												} else {
													self.disconnect();
												}
											}
										} else {
											if (chrome.runtime.lastError) {
												console.error(chrome.runtime.lastError.message);
											}
										}
									});
								});
							}
						});

						console.log(self.driverType + ': Connection opened with ID: ' + self.connectionId);

						if (callback)
							callback(createInfo);
					} else if (createInfo && self.openCanceled) {
						// connection opened, but this connect sequence was canceled
						// we will disconnect without triggering any callbacks
						self.connectionId = createInfo.connectionId;
						console.log(self.driverType + ':  Connection opened with ID: ' + self.connectionId + ', but request was canceled, disconnecting');

						self.openRequested = false;
						self.openCanceled = false;
						self.disconnect(function resetUI() {
							if (callback) callback(false);
						});
					} else if (self.openCanceled) {
						// connection didn't open and sequence was canceled, so we will do nothing
						console.log(self.driverType + ': Connection didn\'t open and request was canceled');
						self.openRequested = false;
						self.openCanceled = false;
						if (callback) callback(false);
					} else {
						self.openRequested = false;
						console.log(self.driverType + ': Failed to open serial port');
						googleAnalytics.sendException(self.driverType + ': FailedToOpen', false);
						if (callback) callback(false);
					}
				});
			});
		} else {
			self.driver =  chrome.serial;
			self.driverType = 'SERIAL';
			self.onReceive.event = self.driver.onReceive;
			self.onReceiveError.event = self.driver.onReceiveError;

			chrome.serial.connect(path, options, function (connectionInfo) {
				if (chrome.runtime.lastError) {
					console.error(chrome.runtime.lastError.message);
				}

				if (connectionInfo && !self.openCanceled) {
					self.connectionId = connectionInfo.connectionId;
					self.bitrate = connectionInfo.bitrate;
					self.bytesReceived = 0;
					self.bytesSent = 0;
					self.failed = 0;
					self.openRequested = false;

					self.onReceive.addListener(function log_bytesReceived(info) {
						self.bytesReceived += info.data.byteLength;
					});

					self.onReceiveError.addListener(function watch_for_on_receive_errors(info) {
						console.error(info);
						googleAnalytics.sendException('Serial: ' + info.error, false);

						switch (info.error) {
						case 'system_error': // we might be able to recover from this one
							if (!self.failed++) {
								chrome.serial.setPaused(self.connectionId, false, function () {
									self.getInfo(function (info) {
										if (info) {
											if (!info.paused) {
												console.log('SERIAL: Connection recovered from last onReceiveError');
												googleAnalytics.sendException('Serial: onReceiveError - recovered', false);

												self.failed = 0;
											} else {
												console.log('SERIAL: Connection did not recover from last onReceiveError, disconnecting');
												GUI.log('Unrecoverable <span style="color: red">failure</span> of serial connection, disconnecting...');
												googleAnalytics.sendException('Serial: onReceiveError - unrecoverable', false);

												if (GUI.connected_to || GUI.connecting_to) {
													$('a.connect').click();
												} else {
													self.disconnect();
												}
											}
										} else {
											if (chrome.runtime.lastError) {
												console.error(chrome.runtime.lastError.message);
											}
										}
									});
								});
							}
							break;
						case 'timeout':
							// TODO
							break;
						case 'device_lost':
							// TODO
							break;
						case 'disconnected':
							// TODO
							break;
						}
					});

					console.log('SERIAL: Connection opened with ID: ' + connectionInfo.connectionId + ', Baud: ' + connectionInfo.bitrate);

					if (callback) callback(connectionInfo);
				} else if (connectionInfo && self.openCanceled) {
					// connection opened, but this connect sequence was canceled
					// we will disconnect without triggering any callbacks
					self.connectionId = connectionInfo.connectionId;
					console.log('SERIAL: Connection opened with ID: ' + connectionInfo.connectionId + ', but request was canceled, disconnecting');

					// some bluetooth dongles/dongle drivers really doesn't like to be closed instantly, adding a small delay
					setTimeout(function initialization() {
						self.openRequested = false;
						self.openCanceled = false;
						self.disconnect(function resetUI() {
							if (callback) callback(false);
						});
					}, 150);
				} else if (self.openCanceled) {
					// connection didn't open and sequence was canceled, so we will do nothing
					console.log('SERIAL: Connection didn\'t open and request was canceled');
					self.openRequested = false;
					self.openCanceled = false;
					if (callback) callback(false);
				} else {
					self.openRequested = false;
					console.log('SERIAL: Failed to open serial port');
					googleAnalytics.sendException('Serial: FailedToOpen', false);
					if (callback) callback(false);
				}
			});
		}
	},
	disconnect: function (callback) {
		var self = this;
		if (self.connectionId) {
			self.emptyOutputBuffer();

			// remove listeners
			for (var i = (self.onReceive.listeners.length - 1); i >= 0; i--) {
				self.onReceive.removeListener(self.onReceive.listeners[i]);
			}

			for (var i = (self.onReceiveError.listeners.length - 1); i >= 0; i--) {
				self.onReceiveError.removeListener(self.onReceiveError.listeners[i]);
			}

			self.driver.disconnect(self.connectionId, function (result) {
				if (chrome.runtime.lastError) {
					console.error(chrome.runtime.lastError.message);
				}

				if (result) {
					console.log(self.driverType + ': Connection with ID: ' + self.connectionId + ' closed, Sent: ' + self.bytesSent + ' bytes, Received: ' + self.bytesReceived + ' bytes');
				} else {
					console.log(self.driverType + ': Failed to close connection with ID: ' + self.connectionId + ' closed, Sent: ' + self.bytesSent + ' bytes, Received: ' + self.bytesReceived + ' bytes');
					googleAnalytics.sendException(self.driverType + ': FailedToClose', false);
				}

				self.connectionId = false;
				self.bitrate = 0;

				if (callback) callback(result);
			});
		} else {
			// connection wasn't opened, so we won't try to close anything
			// instead we will rise canceled flag which will prevent connect from continueing further after being canceled
			self.openCanceled = true;
		}
	},
	getDevices: function (callback) {
		chrome.serial.getDevices(function (devices_array) {
			var devices = [];
			devices_array.forEach(function (device) {
				devices.push(device.path);
			});

			callback(devices);
		});
	},
	getInfo: function (callback) {
		this.driver.getInfo(self.connectionId, callback);
	},
	getControlSignals: function (callback) {
		if(this.driverType == 'SERIAL') {
			chrome.serial.getControlSignals(self.connectionId, callback);
		} else {
			if(callback) callback();
		}
	},
	setControlSignals: function (signals, callback) {
		if(this.driverType == 'SERIAL') {
			chrome.serial.setControlSignals(self.connectionId, signals, callback);
		} else {
			if(callback) callback();
		}
	},
	send: function (data, callback) {
		self = this;
		self.outputBuffer.push({'data': data, 'callback': callback});

		function send() {
			// store inside separate variables in case array gets destroyed
			var data = self.outputBuffer[0].data,
			callback = self.outputBuffer[0].callback;

			self.driver.send(self.connectionId, data, function (sendInfo) {
				// track sent bytes for statistics
				self.bytesSent += sendInfo.bytesSent;

				// fire callback
				if (callback) callback(sendInfo);

				// remove data for current transmission form the buffer
				self.outputBuffer.shift();

				// if there is any data in the queue fire send immediately, otherwise stop trasmitting
				if (self.outputBuffer.length) {
					// keep the buffer withing reasonable limits
					if (self.outputBuffer.length > 100) {
						var counter = 0;

						while (self.outputBuffer.length > 100) {
							self.outputBuffer.pop();
							counter++;
						}

						console.log('SERIAL: Send buffer overflowing, dropped: ' + counter + ' entries');
					}

					send();
				} else {
					self.transmitting = false;
				}
			});
		}

		if (!self.transmitting) {
			self.transmitting = true;
			send();
		}
	},
	onReceive: new EventHandler(),
	onReceiveError: new  EventHandler(),
	emptyOutputBuffer: function () {
		this.outputBuffer = [];
		this.transmitting = false;
	}
};
