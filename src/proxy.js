const WebSocket = require("ws");
const moment = require("moment");
const net = require("net");
const fs = require("fs");
const defaults = require("../config/defaults");
const addressConections = [];
const usersConnections = [];

//Function configuration new connection
function getConnection(ws, options, id_user) {
  //log("[SERVER] new websocket connection");
    
  return {
    id_user:  id_user,
    address: null,
    auth: false,
    online: null,
    workerId: null,
    rpcId: null,
    hashes: null,
    socket: null,
    buffer: "",
    ws: ws,
    options: options
  };
}


//Set a websockets
function bindWebSocket(connection) {
    
    //OnMessage 
    connection.ws.on("message", function(message) {
   
        //Auth user or Ignore
        if(connection.auth==false) {
                   
            //data to json
            var data = JSON.parse(message);

            //check is auth
            if(typeof data.type != 'undefined' && data.type != null) { 
                if(data.type=='auth') {
                    
                    //set address user
                    var id_user = connection.id_user;
                    connection.address = data.params.site_key;
                    connectSocket(connection, data.params.site_key);
                    
                    //get a address
                     if (typeof addressConections[usersConnections[id_user].address] == 'undefined' || addressConections[usersConnections[id_user].address] == null) {  
                        return;
                    }
                    
                    //set a login
                    let login = data.params.site_key;
                    
                    //aditional data
                    if (data.params.user) {
                        login += "." + data.params.user;
                    }
                    
                    //create a rpcID
                    var rpcId = getRpcId(usersConnections[id_user]);
                    
                    //add this ID for auth
                    addressConections[usersConnections[id_user].address].rpcIdAuths.push(rpcId);

                    //¿ERR?
					if(typeof connection.options.pass == null) {
						console.log(usersConnections[id_user]);
					}
                    
                    //send pool for login
                    sendToPool(usersConnections[id_user], {
                        id: rpcId,
                        method: "login",
                        params: {
                        login: login,
                        pass: usersConnections[id_user].options.pass || "x"
                    }});
                }
            }
        } else {
			//data to json
            var data = JSON.parse(message);
	
           if(typeof data.type != 'undefined' && data.type != null) { 
				if (data.type=='submit') {
					//set address user
					var id_user = connection.id_user;

					sendToPool(usersConnections[id_user], {
						id: getRpcId(usersConnections[id_user]),
						method: "submit",
						params: {
							id: addressConections[usersConnections[id_user].address].workerId[usersConnections[id_user].id_user],
							job_id: data.params.job_id,
							nonce: data.params.nonce,
							result: data.params.result
						}
					}); 
				}
		   }
            
        }
    });
    
    //OnClose
    connection.ws.on("close", () => {
        //log("connection to pool closed");
        killConnection(connection);
    });
    
    //on error
    connection.ws.on("error", error => {
        log("pool connection error",  error && error.message ? error.message : error);
		killConnection(connection);
    });
}



//Send data pool
function sendToPool(connection, payload) {
    const stratumMessage = JSON.stringify(payload) + "\n";
    log("[MINER][POOL]["+connection.id_user+"]", stratumMessage);
    addressConections[connection.address].socket.write(stratumMessage);
}

//Send data to miner (user)
function sendToMiner(connection, payload) {
    const coinHiveMessage = JSON.stringify(payload);
   
   if (typeof connection != 'undefined' && connection != null) { 
		if(connection.online) {
        try {
          connection.ws.send(coinHiveMessage);
          log("[POOL][MINER]["+connection.id_user+"]", coinHiveMessage);
        } catch (e) {
          log("socket seems to be already closed.");
          killConnection(connection);
        }
    } else {
        log("failed to send message to miner cos it was offline:", coinHiveMessage);
    }
   }
}

//function geRPVid
function getRpcId(connection) {
	
	if (typeof addressConections[connection.address].rpcIdtoUser == 'undefined' || addressConections[connection.address].rpcIdtoUser == null) {  
		killConnection(connection);
	}

    //set new rpcId
    var rpcId = addressConections[connection.address].rpcId++;
	
    //assoc rpcId to User
    addressConections[connection.address].rpcIdtoUser[rpcId] = connection.id_user;
    
    
    return rpcId;
}

//function getHashes
function getHashes(connection) {
  return connection.hashes++; 
}
 
//function connect new socket
function connectSocket(connection, address) {  
    
    //Checking exists Socket Address
    if (typeof addressConections[address] != 'undefined' && addressConections[address] != null) {  
              
        //start 
        connection.auth = true;
        connection.online = true;
        connection.hashes = 1;
        
    } else {
      
        //Create a new socket
        addressConections[address] = {};
        addressConections[address].socket = new net.Socket();
        log("[SERVER][ Socket TCP Created at", address);
      
        //SET UT8
        addressConections[address].socket.setEncoding("utf8");
        
        //SET Buffer
        addressConections[address].buffer = "";
        addressConections[address].jobs = [];
        addressConections[address].workerId = [];
     
		//add users online
        addressConections[address].users = 0;
            
        //set rpcId, assoc to user and add 
        addressConections[address].rpcIdtoUser = [];
        addressConections[address].rpcIdAuths = [];
        addressConections[address].rpcId = 1;
	
        //Init Socket
        addressConections[address].socket.connect(+connection.options.port, connection.options.host, function() {
        
       
            
            //set online user, Hashes
            connection.online = true;
            connection.hashes = 1;
          
            //set on data
            addressConections[address].socket.on("data", function(chunk) {
                
                //save data recived in buffer
                addressConections[address].buffer += chunk;
              
                //Checking has buffer
                while(addressConections[address].buffer && addressConections[address].buffer.includes("\n")) {
                    
                    
                    //get end line
                    const newLineIndex = addressConections[address].buffer.indexOf("\n");
                    
                    //get mensaje
                    const stratumMessage = addressConections[address].buffer.slice(0, newLineIndex);
                    
                    //remove line from buffer
                    addressConections[address].buffer = addressConections[address].buffer.slice(newLineIndex + 1);
          
                    //ad 1 user
                    log("[ADDRESS]["+addressConections[address].users+"] "+ address);

                    //log("[POOL][MINER]", stratumMessage);
                    let data = null;

                    //transform data to json
                    try {
                        data = JSON.parse(stratumMessage);
                    } catch (e) {
                        // invalid pool message
                    }
                   
                    
                    //checking data
                    if (data != null) {
                        
                        //get user auth
                        if(data.id) {
                            var id_user = addressConections[connection.address].rpcIdtoUser[data.id];
                        } else {                
                            var id_user = addressConections[address].workerId.indexOf(data.params.id);
                        }
                        
                        //Logout users, bye bye
                        if(id_user=='-1') {
							return; 
                        }
                        
                        //is a login?                    
                        if(addressConections[connection.address].rpcIdAuths.indexOf(data.id) > -1) {
                           
                            addressConections[address].users++;
                            //Pool ERROR
                            if (data.error && data.error.code === -1) {
                                
                                //Remove Address
                                delete addressConections[address];
                                
                                //Say err miner
                                return sendToMiner(usersConnections[id_user], {
                                    type: "error",
                                    params: {
                                        error: "invalid_site_key"
                                    }
                                });
                            } 
                            
                            //User Is Auth!
                            connection.auth = true;
                            
                            //Notify User
                            sendToMiner(usersConnections[id_user], {
                                type: "authed",
                                params: {
                                    token: "",
                                    hashes: 0
                                }
                            });
                            
                            //define workerID User connection
                            addressConections[address].workerId[id_user] = data.result.id;
                            
                            //giveme a job?
                             if (data.result.job) {
                                 
                                //save a job
                                addressConections[address].jobs[id_user] = data;
                                               
                                 //send job user
                                sendToMiner(usersConnections[id_user], {
                                    type: "job",
                                    params: data.result.job
                                });
                            }                        
                        } else { //no auth
                            
                            //log("[POOL][MINER]", stratumMessage);
                            
                            if (data.method === "job") {
                                sendToMiner(usersConnections[id_user], {
                                    type: "job",
                                    params: data.params
                                });
                            }
                        
                            if (data.result && data.result.status === "OK") {
                                sendToMiner(usersConnections[id_user], {
                                    type: "hash_accepted",
                                    params: {
                                        hashes: getHashes(usersConnections[id_user])
                                    }
                                });
                            }
                        }
                    }
                }
            });
          
        
      }
  );
  }
}

//Function endConection
function killConnection(connection) {
	
	//only auth suers
	if(typeof addressConections[connection.address] != 'undefined' && addressConections[connection.address] != null) { 
		addressConections[connection.address].users = addressConections[connection.address].users -1;
		delete addressConections[connection.address].jobs[connection.id_user];
		delete addressConections[connection.address].workerId[connection.id_user];
    }
	
    if (connection.ws) {
        connection.ws.close();
    }

    //remove user from usersConnections
    delete usersConnections[connection.id_user];
    delete connection;
}

//Function create server proxy
function createProxy(options = defaults) {
    const constructorOptions = Object.assign({}, defaults, options);
    log = function () {
        const logString = "[" + moment().format("MMM Do hh:mm") + "] " + Array.prototype.slice.call(arguments).join(" ") + "\n";
        if (options.log) {
            console.log(logString);
        }
        if (typeof options.logFile === "string") {
            try {
                fs.appendFile(options.logFile || "proxy.log", logString, err => {
                    if (err) {
                        // error saving logs
                    }
                });
            }
            catch (e) {
                // exception while saving logs
            }
        }
    };
    return {
        listen: function listen(wssOptions) {
            if (wssOptions !== Object(wssOptions)) {
                wssOptions = {
                    port: +wssOptions
                };
            }
            if (options.path) {
                wssOptions.path = options.path;
            }
            const wss = new WebSocket.Server(wssOptions);
            log("WebSocket Started! | Listening on port", wssOptions.port);
            
            wss.on("connection", ws => {
                              
                //get a user ID
                var id_user = get_id_user();
                
                
                //set user data
                usersConnections[id_user] = getConnection(ws, constructorOptions, id_user);
                
                bindWebSocket(usersConnections[id_user]);
            });
        }
    };
}

//get id_user
function get_id_user() {
    var c = 0;
    var ok = false;
    
    //checking all numbers
    while(ok==false) {
        if(typeof usersConnections[c] == 'undefined' || usersConnections[c] == null) { 
            ok = true;
            return c;
        } else {
            c = c+1;
        }
    }
}


//save stats
function saveStats() {
    
    //Openfile
    var stats = "";
    
    //loop address
    for(var key in addressConections) {
         stats = stats+key+' :: '+addressConections[key].users+"\n";
    }
	
	fs.writeFile('./stats.log', stats, (err) => {  
    // throws an error, you could also catch it here
    if (err) throw err;

});

    
}
    
setInterval(saveStats, 15000);


module.exports = createProxy;
