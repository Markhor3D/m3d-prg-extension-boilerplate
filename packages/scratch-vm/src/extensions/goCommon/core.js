class GoConnection{
    constructor(){
        // ////////////////////////////////////////////////////
        //                 WS connection
        // ////////////////////////////////////////////////////
        this.wsIsConnected = false;
        this.wsGateway = "";
        this.Sensors = [0, 0, 0, 0, 0, 0, 0, 0];
        this.lastLeftMotor = -1;
        this.lastRightMotor = -1;
        this.lastServo1 = -1;
        this.lastServo2 = -1;
        this.lastServo1Speed = -1;
        this.lastServo2Speed = -1;
        this.lastScreenMsg = "";
        this.lastSentCommand = "";
        this.websocket = [];
        
        //////////////////////////////////////////////////////
        //                 BLE connection
        //////////////////////////////////////////////////////
        this.bleIsConnected = false;
        
        
        // Validate services UUID entered by user first.
        this.m3DScratchServiceUUID = "8e088cd2-8000-11ee-b9d1-0242ac120002";
        
        this.proximityAUUID = "8e088cd2-7001-11ee-b9d1-0242ac120002";
        this.proximityBUUID = "8e088cd2-7002-11ee-b9d1-0242ac120002";
        this.distanceUUID = "8e088cd2-7003-11ee-b9d1-0242ac120002";
        this.leftMotorUUID = "8e088cd2-6001-11ee-b9d1-0242ac120002";
        this.rightMotorUUID = "8e088cd2-6002-11ee-b9d1-0242ac120002";
        this.servoAAngleUUID = "8e088cd2-6003-11ee-b9d1-0242ac120002";
        this.servoBAngleUUID = "8e088cd2-6004-11ee-b9d1-0242ac120002";
        this.servoASpeedUUID = "8e088cd2-6005-11ee-b9d1-0242ac120002";
        this.servoBSpeedUUID = "8e088cd2-6006-11ee-b9d1-0242ac120002";
        this.expressionUUID = "8e088cd2-6007-11ee-b9d1-0242ac120002";
        this.textMessageUUID = "8e088cd2-6008-11ee-b9d1-0242ac120002";
        
        this.leftMotorCharacteristic;
        this.rightMotorCharacteristic;
        this.servoAAngleCharacteristic;
        this.servoAAngleCharacteristic;
        this.servoASpeedCharacteristic;
        this.servoBSpeedCharacteristic;
        this.expressionCharacteristic;
        this.textMessageCharacteristic;
        
        this.textMessageCharacteristic;
        this.useBytePercent = false;    
    }
    initWebSocket() {
        console.log('Trying to open a WebSocket connection on: ' + this.wsGateway);
    
        try {
            this.websocket = new WebSocket(this.wsGateway);
            this.websocket.onopen = onOpen;
            this.websocket.onclose = onClose;
            this.websocket.onmessage = onMessage; // <-- add this line
        } catch (_unused) {
            console.log("Connection failed. Will retry in a while");
            setTimeout(initWebSocket, 2000);
        }
    
        return this.wsIsConnected;
    }
    
    onOpen(event) {
        this.wsIsConnected = true;
        console.log('Connection opened');
    }
    
    onClose(event) {
        this.wsIsConnected = false;
        console.log('Connection closed');
        setTimeout(initWebSocket, 2000);
    }
    
    onMessage(event) {
        // console.log("ws message"); // to much logging
        var str = "";
        str = event.data;
    
        if (str.startsWith("s")) {
            var sensors = str.split(":");
    
            for (var i = 1; i < sensors.length; i++) {
                this.Sensors[i - 1] = parseFloat(sensors[i]);
            }
        }
    }
    
    sendCommand(COMMAND) {
        if (this.lastSentCommand == COMMAND) return true; // example implementation to return a string
    
        console.log("sendCommand(" + COMMAND + ")");
    
        try {
            if (this.wsIsConnected) {
                this.websocket.send(COMMAND);
                this.lastSentCommand = COMMAND;
                return true;
            }
        } catch (_unused2) {
            console.log("Couldn't send: " + COMMAND);
        }
    
        return false;
    }
    
    writeBLEFloat(characteristic, floatValue) {
        if (!characteristic) {
            console.log("Characteristic invalid");
            return;
        }
        console.log(`writeBLEFloat = ${floatValue}`);
        console.log('Characteristic', characteristic);
        console.log('useBytePercent', this.useBytePercent);

        if (!characteristic.properties.write && !characteristic.properties.writeWithoutResponse) {
            console.log("Characteristic not writable:", characteristic.properties);
            return;
        }
        let buffer = new ArrayBuffer(); // 4 bytes for a single float (Float32)
        if (this.useBytePercent){
            floatValue = Math.round(floatValue) + 100;
            // Convert float value to ArrayBuffer
            buffer = new ArrayBuffer(1)
            let dataView = new DataView(buffer);
            dataView.setUint8(0, floatValue, true); // true for little-endian encoding (adjust based on your system)
        }
        else{
            // Convert float value to ArrayBuffer
            buffer = new ArrayBuffer(4)
            let dataView = new DataView(buffer);
            dataView.setFloat32(0, floatValue, true); // true for little-endian encoding (adjust based on your system)
        }
        // Write the ArrayBuffer to the characteristic
        characteristic
            .writeValue(buffer)
            .then(() => {
                //console.log("Sent float value:", floatValue);
            })
            .catch((error) => {
                //console.error("Error sending float value:", error);
            });
    }
    writeBLEString(characteristic, stringToSend) {
        if (!characteristic) {
            // console.log("Characteristic invalid");
            return;
        }
        if (!characteristic.properties.write && !characteristic.properties.writeWithoutResponse) {
            console.log("Characteristic not writable:", characteristic.properties);
            return;
        }
        // Convert the string to an ArrayBuffer
        let encoder = new TextEncoder('utf-8');
        let encodedString = encoder.encode(stringToSend);
    
        // Write the value to the characteristic
        characteristic.writeValue(encodedString)
            .then(() => {
                // console.log('Sent string:', stringToSend);
            })
            .catch(error => {
                // console.error('Error sending string:', error);
            });
    }
    setLeftMotor(value) {
        console.log('setLeftMotor', value);
        this.writeBLEFloat(this.leftMotorCharacteristic, value);
    }
    setRightMotor(value) {
        console.log('setRightMotor', value);
        this.writeBLEFloat(this.rightMotorCharacteristic, value);
    }
    setServoAAngle(value) {
        this.writeBLEFloat(this.servoAAngleCharacteristic, value);
    }
    setServoBAngle(value) {
        this.writeBLEFloat(this.servoAAngleCharacteristic, value);
    }
    setServoASpeed(value) {
        this.writeBLEFloat(this.servoASpeedCharacteristic, value);
    }
    setServoBSpeed(value) {
        this.writeBLEFloat(this.servoBSpeedCharacteristic, value);
    }
    setExpresssion(expression) {
        this.writeBLEString(this.expressionCharacteristic, expression);
    }
    setTextMessage(text) {
        this.writeBLEString(this.textMessageCharacteristic, text);
    }
    proximityACharacteristicChangeHandler(event) {
        var value = event.target.value;
        var floatValue = 0;
        if (value.buffer.byteLength == 1) {// its a percent byte
            floatValue = new Uint8Array(value.buffer)[0] - 100;
            window.go.useBytePercent = true;
        }
        else
            floatValue = new Float32Array(value.buffer)[0];
        // console.log("Received proximity A: ", floatValue);
        window.go.Sensors[0] = floatValue;
    }
    proximityBCharacteristicChangeHandler(event) {
        var value = event.target.value;
        var floatValue = 0;
        if (value.buffer.byteLength == 1)  {// its a percent byte
            floatValue = new Uint8Array(value.buffer)[0] - 100;
            window.go.useBytePercent = true;
        }
        else
            floatValue = new Float32Array(value.buffer)[0];
        // console.log("Received proximity B: ", floatValue);
        // since this is Called by the BLE device, "this" wont work
        window.go.Sensors[1] = floatValue;
    }
    distancCharacteristicChangeHandler(event) {
        var value = event.target.value;
        var floatValue = 0;
        if (value.buffer.byteLength == 1)  {// its a percent byte
            floatValue = new Uint8Array(value.buffer)[0] - 100;
            // distance needs to change from 0 to 1200
            floatValue = (floatValue + 100) * 6;
            window.go.useBytePercent = true;
        }
        else
            floatValue = new Float32Array(value.buffer)[0];
        // console.log("Received distance: ", floatValue);
        window.go.Sensors[2] = floatValue;
    }
    endBLE() {
        if (this.bleIsConnected) {
            this.textMessageCharacteristic.gatt.disconnect();
            this.bleIsConnected = false;
        }
    }
    onDisconnected(event) {
      // Object event.target is Bluetooth Device getting disconnected.
      alert('M3D Go disconnected!');
      this.bleIsConnected = false;
    }
    initBLE() {
        
        console.log("begin");
        console.log("begin");
        console.log("Requesting any Bluetooth Device...");
        navigator.bluetooth
            .requestDevice({
                acceptAllDevices: false,
                filters: [{ services: [this.m3DScratchServiceUUID] }],
            })
            .then((device) => {
                alert('Connecting, please wait...');
                console.log("Connecting to GATT Server...");
                this.textMessageCharacteristic = device;
                this.textMessageCharacteristic.addEventListener('gattserverdisconnected', this.onDisconnected);
                return device.gatt.connect();
            })
            .then((server) => {
                // Note that we could also get all services that match a specific UUID by
                // passing it to getPrimaryServices().
                console.log("Getting Services...");
                alert('Almost there...');
                return server.getPrimaryService(this.m3DScratchServiceUUID);
            })
            .then((service) => {
                console.log("Setting up characteristics watch");
                this.bleIsConnected = true;
                service.getCharacteristic(this.proximityAUUID).then((ch0) => {
                    console.log("Got: proximityA characteristic");
                    this.proximityACharacteristic = ch0;
                    service.getCharacteristic(this.proximityBUUID).then((ch1) => {
                        console.log("Got: proximityB characteristic");
                        this.proximityBCharacteristic = ch1;
                        service.getCharacteristic(this.distanceUUID).then((ch2) => {
                            console.log("Got: distance characteristic");
                            this.distancCharacteristic = ch2;
                            service.getCharacteristic(this.leftMotorUUID).then((ch3) => {
                                console.log("Got: leftMotor characteristic");
                                this.leftMotorCharacteristic = ch3;
                                service.getCharacteristic(this.rightMotorUUID).then((ch4) => {
                                    console.log("Got: rightMotor characteristic");
                                    this.rightMotorCharacteristic = ch4;
                                    service.getCharacteristic(this.servoAAngleUUID).then((ch5) => {
                                        console.log("Got: servoAAngle characteristic");
                                        this.servoAAngleCharacteristic = ch5;
                                        service.getCharacteristic(this.servoBAngleUUID).then((ch6) => {
                                            console.log("Got: servoBAngle characteristic");
                                            this.servoAAngleCharacteristic = ch6;
                                            service.getCharacteristic(this.servoASpeedUUID).then((ch7) => {
                                                console.log("Got: servoASpeed characteristic");
                                                this.servoASpeedCharacteristic = ch7;
                                                service.getCharacteristic(this.servoBSpeedUUID).then((ch8) => {
                                                    console.log("Got: servoBSpeed characteristic");
                                                    this.servoBSpeedCharacteristic = ch8;
                                                    service.getCharacteristic(this.expressionUUID).then((ch9) => {
                                                        console.log("Got: expression characteristic");
                                                        this.expressionCharacteristic = ch9;
                                                        service.getCharacteristic(this.textMessageUUID).then((ch10) => {
                                                            console.log("Got: textMessage characteristic");
                                                            this.textMessageCharacteristic = ch10;
    
                                                            this.proximityACharacteristic.startNotifications().then((_) => {
                                                                this.proximityACharacteristic.addEventListener(
                                                                    "characteristicvaluechanged",
                                                                    this.proximityACharacteristicChangeHandler
                                                                );
    
                                                                this.proximityBCharacteristic.startNotifications().then((_) => {
                                                                    this.proximityBCharacteristic.addEventListener(
                                                                        "characteristicvaluechanged",
                                                                        this.proximityBCharacteristicChangeHandler
                                                                    );
    
                                                                    this.distancCharacteristic.startNotifications().then((_) => {
                                                                        this.distancCharacteristic.addEventListener(
                                                                            "characteristicvaluechanged",
                                                                            this.distancCharacteristicChangeHandler
                                                                        );
                                                                    });
                                                                });
                                                            });
                                                            alert('M3D Go connected!');
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
                return Promise.resolve();
            })
            .catch((error) => {
                console.log("Argh! " + error);
                alert('Could not connect to the selected M3D Go. Make sure the device is in range and try again.');
            });
    }
    
    
    //////////////////////////////////////////////////////
    //                 Common
    //////////////////////////////////////////////////////
    GoIsConnected() {
        if (this.wsIsConnected === null)
            this.wsIsConnected = false;
        if (this.bleIsConnected === null)
            this.bleIsConnected = false;
        return this.wsIsConnected || this.bleIsConnected;
    }
    sendLeftMotorCommand(power) {
        console.log('sendLeftMotorCommand', power);
        if (this.lastLeftMotor == power)
            return true;
    
        if (this.bleIsConnected) {
            this.lastLeftMotor = power;
            this.setLeftMotor(power);
            return true;
        }
        else {
            if (this.sendCommand("lm " + power + "%")) {
                this.lastLeftMotor = power;
                return true;
            }
        }
        return false;
    }
    
    sendRightMotorCommand(power) {
        console.log('sendRightMotorCommand', power);
        if (this.lastRightMotor == power)
            return true;
    
        if (this.bleIsConnected) {
            this.lastRightMotor = power;
            this.setRightMotor(power);
            return true;
        }
        else {
            if (this.sendCommand("rm " + power + "%")) {
                this.lastRightMotor = power;
                return true;
            }
        }
        return false;
    }
    sendServo1Command(angle) {
    
        if (this.lastServo1 == angle)
            return true;
        if (this.bleIsConnected) {
            this.lastServo1 = angle;
            this.setServoAAngle(angle);
            return true;
        }
        else {
            if (this.sendCommand("servo 1 " + angle))
                this.lastServo1 = angle;
            return true;
        }
    }
    sendServo2Command(angle) {
    
        if (this.lastServo2 == angle)
            return true;
        if (this.bleIsConnected) {
            this.lastServo2 = angle;
            this.setServoBAngle(angle);
            return true;
        }
        else {
            if (this.sendCommand("servo 2 " + angle))
                this.lastServo2 = angle;
            return true;
        }
    }
    sendServo1SpeedCommand(speed) {
    
        if (this.lastServo1Speed == speed)
            return true;
        if (this.bleIsConnected) {
            this.lastServo1Speed = speed;
            this.setServoASpeed(speed);
            return true;
        }
        else {
            if (sendCommand("servo 1 " + speed))
                this.lastServo1Speed = speed;
            return true;
        }
    }
    sendServo2SpeedCommand(speed) {
    
        if (this.lastServo2Speed == speed)
            return true;
        if (this.bleIsConnected) {
            this.lastServo2Speed = speed;
            this.setServoBSpeed(speed);
            return true;
        }
        else {
            if (this.sendCommand("servo 2 " + speed))
                this.lastServo2Speed = speed;
            return true;
        }
    }
    sendExpressionCommand(expression) {
        var com = "express " + expression;
        if (this.lastScreenMsg == com)
            return true;
        if (this.bleIsConnected) {
            this.lastScreenMsg = com;
            this.setExpresssion(expression);
            return true;
        }
        else {
            if (this.sendCommand(com))
                this.lastScreenMsg = com;
            return true;
        }
    }
    sendTextMessageCommand(text) {
        if (text.length > 16)
            text = text.substring(0, 16);
        var com = "show " + text;
        if (this.lastScreenMsg == com)
            return true;
        if (this.bleIsConnected) {
            this.lastScreenMsg = com;
            this.setTextMessage(text);
            return true;
        }
        else {
            if (this.sendCommand(com))
                this.lastScreenMsg = com;
            return true;
        }
    }
}

module.exports = GoConnection;