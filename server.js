var port = 8888;
var socketIOLogLevel = 2;
var debug = true;

var heartbeat_interval = 10//25
var heartbeat_timeout = 15;//60
var close_timeout = 20;//60

var io = require('socket.io');
var connect = require('connect');

var dl  = require('delivery');
var fs  = require('fs');

var gm = require('gm');

var constructs = require('./scripts/constructors.js');
var assets = require('./scripts/extra.js');

var app = connect()
			.use(connect.static('public'))
			.use(connect.favicon('favicon.ico'))
			.listen(port);

var sockIOconns = io.listen(app, { log: true });
//setup
sockIOconns.set('log level', socketIOLogLevel);
sockIOconns.set('sync disconnect on unload',true);
sockIOconns.set('heartbeat timeout',heartbeat_timeout);
sockIOconns.set('close timeout',close_timeout);
sockIOconns.set('heartbeat interval',heartbeat_interval);

var rooms = [];
var RIDs  = [];

var sockets = [];

sockIOconns.sockets.on('connection', function (socket) {

    sockets.push(socket);

    var myClient;
    socket.on('who', function (data) {
        //daca nu mai este setat deja
        if (typeof myClient === 'undefined') {
            myClient = constructs.createClient(assets.escapeJS(data.name), socket, constructs.createColor(0, 0, 0, 1));
			myClient.delivery = dl.listen(socket);
			setUpDeliveryComms();
			socket.emit('nameSet');
        }
    });

	socket.on('sendClear', function(){
		if(typeof myClient === 'undefined') return;
		if(typeof myClient.room === 'undefined') return;
		
		if(debug)console.log("ROOM: sendClear pt. RoomID: " + myClient.room.ID);
		
		var neighbours = myClient.room.clients;
			for (var i = 0; i < neighbours.length; i++) {
				//daca socketul e nul
				if (!neighbours[i] || typeof neighbours[i] === 'undefined') continue;
				//daca socketul este deconectat
				if (neighbours[i].disconnected == true) continue;
				neighbours[i].socket.emit('clearCanvas',{});
			}
		//fs.unlink("./imgs/" + myClient.room.ID + ".png");
	});
	socket.on('sendClearImg', function(){
		if(typeof myClient === 'undefined') return;
		if(typeof myClient.room === 'undefined') return;
		
		if(debug)console.log("ROOM: sendClear pt. RoomID: " + myClient.room.ID);
		
		var neighbours = myClient.room.clients;
			for (var i = 0; i < neighbours.length; i++) {
				//daca socketul e nul
				if (!neighbours[i] || typeof neighbours[i] === 'undefined') continue;
				//daca socketul este deconectat
				if (neighbours[i].disconnected == true) continue;
				neighbours[i].socket.emit('clearCanvasImg',{});
			}
		fs.unlink("./imgs/" + myClient.room.ID + ".png");
	});
	
    socket.on('disconnect', function () {
		if(typeof myClient === 'undefined') return;
        //ma sterg din camera
		if(typeof myClient.room !== 'undefined'){
			myClient.room.clients.remove(myClient);
			sendNameList('');
			//daca camera e goala o sterg din lista de camere
			if (myClient.room.clients.length == 0) {
				RIDs.remove(myClient.room.ID);
				if(debug) console.log("ROOM: camera stearsa : " + myClient.room.ID);
				fs.unlink("./imgs/" + myClient.room.ID + ".png");
				if(debug) console.log("FILE: img stearsa : "  + "./imgs/" + myClient.room.ID + ".png");
				rooms.remove(myClient.room);
				delete myClient.room;
			}
		}
        //imi sterg obiectul
        delete myClient;
    });

    function didJoin(didIt, reason) {
        socket.emit('didJoin', { ID: myClient.room.ID,
            success: didIt,
            reason: reason
        });
        if (!didIt) {
			sockets.remove(socket);
            socket.disconnect('error');
        }
    }

	socket.on('haspass', function(data){
		var roomfound = false;
		var hasPass = true;
		for (var i = 0; i < rooms.length; i++){
			if (rooms[i].ID == data.ID){
				roomfound = true;
				if(rooms[i].password == ''){
					hasPass = false;
				}
			}
		}
		myClient.socket.emit('roomPass',{"RF":roomfound,
										 "HP":hasPass});
	});
	
    socket.on('enterRoom', function (data) {
        if (typeof myClient === 'undefined') {
            // protocol violation
            didJoin(false, "Protocol nerespectat (e1)");
            return;
        }
		if(debug)console.log("CLIENT: Join");
        //pt fiecare camera
        for (var i = 0; i < rooms.length; i++) {
            //daca gasim camera
            if (rooms[i].ID == data.ID) {
                //daca parola e corecta
				
                if (rooms[i].password == data.password) {
                    rooms[i].clients.push(myClient);
                    myClient.room = rooms[i];
                    didJoin(true, "");
					if(debug)console.log("CLIENT: se insereaza in camera: " + myClient.room.ID);
					sendFiletoClient(myClient,"./imgs/" + myClient.room.ID + ".png"); 
					if(debug)console.log("CLIENT: se trimite imagine");
                } else {
                    //TODO trimite parola gresita
					myClient.room = rooms[i];
                    didJoin(false, "Parola gresita");
					if(debug)console.log("ROOM: parola gresita");
                }
				
                return; //am incercat camera
            }
        }
        //dupa ce am incercat toate camerele, creem una noua
        //TODO crearea unei camere
		
		if(debug) console.log("ROOM: se creeaza camera");
        var room = constructs.createRoom(data.password, assets.generateRID(RIDs));
        RIDs.push(room.ID);
        room.clients.push(myClient);
        myClient.room = room;
        rooms.push(room);
		if(debug) console.log("ROOM: id nou : " + room.ID); 
        didJoin(true, "");
		
		sendFiletoClient(myClient,"./imgs/" + myClient.room.ID + ".png"); 
    });

    //  data.c - culoare ; data.p punct ; data.lp punct anterior ; data.w latimeLinie
    socket.on('push', function (data) {
		if(typeof myClient === 'undefined') return;
		if(typeof myClient.room === 'undefined') return;

        //reconstruim datele pt validare
        var toSend = {};
        if (typeof data.c !== undefined) {
            if (data.c.r === undefined || data.c.g === undefined || data.c.b === undefined || data.c.a === undefined) {
                return;
                //invalid data
            } else {
                toSend.c = data.c;
            }
        }
        if (typeof data.p !== undefined) {
            if (data.p.x === undefined || data.p.y === undefined) {
                return;
                //invalid data
            } else {
                toSend.p = constructs.createPoint(data.p.x, data.p.y);
            }
        }
		if (typeof data.lp !== undefined) {
            if (data.lp.x === undefined || data.lp.y === undefined) {
                return;
                //invalid data
            } else {
                toSend.lp = constructs.createPoint(data.lp.x, data.lp.y);
            }
        }
		if (typeof data.w !== undefined){
			if(isNaN(data.w)){
				data.w = 2;
			}
		}else{
			data.w = 2;
		}
		toSend.w = data.w;
		
		if(!assets.compColors(myClient.color,data.c)){
			sendNameList(data.c);
		}
		myClient.color = data.c;

        var neighbours = myClient.room.clients;
        for (var i = 0; i < neighbours.length; i++) {
            //daca socketul e nul
            if (!neighbours[i] || typeof neighbours[i] === 'undefined') continue;
            //daca socketul este deconectat
            if (neighbours[i].disconnected == true) continue;
            
            neighbours[i].socket.emit('get', toSend);

        }
    });
	
	socket.on('getNameList', sendNameList);
	
	function sendNameList(c){
		if(typeof myClient === 'undefined') return;
		if(typeof myClient.room === 'undefined') return;
	
		var nameArr = [];
		var neighbours = myClient.room.clients;
        for (var i = 0; i < neighbours.length; i++) {
            //daca socketul e nul
            if (!neighbours[i] || typeof neighbours[i] === 'undefined') continue;
            //daca socketul este deconectat
            if (neighbours[i].disconnected == true) continue;
            
			
			
			if(neighbours[i] == myClient && assets.isColor(c)){
				var NC = {"name": neighbours[i].name,
					  "color":c};
			}else{
				var NC = {"name": neighbours[i].name,
					  "color":neighbours[i].color};
			}
			
			nameArr.push(NC);

        }
		
		 for (var i = 0; i < neighbours.length; i++) {
			//daca socketul e nul
			if (!neighbours[i] || typeof neighbours[i] === 'undefined') continue;
			//daca socketul este deconectat
			if (neighbours[i].disconnected == true) continue;
			
			neighbours[i].socket.emit('nameList', nameArr);
		}
	}
	
	function setUpDeliveryComms(){
	
		myClient.delivery.on('receive.success',function(file){
			if(typeof myClient.room === 'undefined') return;
			
			if(debug) console.log("FILE: primit imagine, se salveaza");
			
			fs.writeFile("./imgs/" + myClient.room.ID + "-uc.png",file.buffer, function(err){
				if(err){
					console.log('error writing file ' + "./imgs/" + myClient.room.ID + "-uc.png");
				}else{
					if(debug) console.log("FILE: procesare imagine");
					assets.resizeImage(gm,
									   "./imgs/" + myClient.room.ID + "-uc.png",
									   "./imgs/" + myClient.room.ID + ".png",
									   function(){
											if(debug) console.log("FILE: procesare terminata");
											brodcastImageToRoom(myClient.room);
											fs.unlink("./imgs/" + myClient.room.ID + "-uc.png");
										}
									   );
					
				}
			});
		});
	}
	
	function brodcastImageToRoom(room){
		var filename = "./imgs/" + room.ID + ".png";
		if(debug) console.log("FILE: broadcast imagine");
		for(var i = 0; i < room.clients.length; i++){
			sendFiletoClient(room.clients[i],filename);
		}

	}
	
	function sendFiletoClient(client,filename){
		fs.exists(filename, function (exists) {
			if(exists){
				client.delivery.send({
					name: 'img.png',
					path : filename
				});
			}
		});
	}
});
