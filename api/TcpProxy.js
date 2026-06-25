const tls = require('tls');
const net = require('net');
const EventEmitter = require('events');

class TcpProxy extends EventEmitter{
    constructor (origin){
        super()

        this.origin = origin.origin
        this.port = origin.port
        this.serverPort = origin.serverPort
        this.serverName = origin.servername
        this.httpPort = origin.httpPort
        this.server = null
        
        
        this.clients = []
        this.servers = []
    }

    setCrossDomainPolicy(){
        this.domainPolicy = `<?xml version="1.0"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.adobe.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
<site-control permitted-cross-domain-policies="master-only"/>
<allow-access-from domain="*" to-ports="80,${this.httpPort}"/>
<allow-access-from domain="*" to-ports="80,${this.serverPort}"/>
</cross-domain-policy>`
    }

    tryStartTcpServer(){
        return new Promise(async (resolve, reject) => {
            const onListen = () =>{
                const onError = (err) => {
                    switch (err.code){
                        case "EADDRINUSE":
                            this.serverPort += 1
                            console.error("[TCP PROXY]: port taken! retrying on ", this.serverPort)
                            
                            this.server.off('error', onError);
                            onListen()
                            break
                        default:
                            console.error("[TCP PROXY]: ", err)
                            reject()
                            break
                    }
                }

                this.server.once("error",onError);
                this.server.once('listening',()=>{
                    this.server.off('error', onError);
                    resolve()
                })
                this.server.listen(this.serverPort)
            } 
            onListen()
        })
    }
    
    async tryStartTcpServer(){
        return new Promise((resolve, reject) => {
            this.server.listen(this.serverPort, () => {})
                .once('listening', () => resolve())
                .once('error', (err) => {
                    if (err.code === 'EADDRINUSE'){
                        this.serverPort += 1
                        this.tryStartTcpServer()
                    } else{
                        reject(err)
                    }
                })
        })
    }

    setOriginDomain(){
        this.origin = this.origin.replace(/\.(stage|prod)\.animaljam\.internal$/, "-$1.animaljam.com");
        this.origin = "lb-" + this.origin;
    }

    async startTcpProxy(){
        this.setOriginDomain() 
        // i am going to be real. no clue how i got this to work
        // alot was from wasting time searching internet for no success

        // looking at past me (aka 5 ish months ago me). I have no clue what I was stuggling this stuff easy

        this.server = net.createServer({ pauseOnConnect: false }, (clientSocket) => {
            console.log("[TLS PROXY]: client connected")
            console.log("[TLS PROXY]: origin: ",this.origin, " port: ", this.port)
            
            this.clients.push(clientSocket)


            clientSocket.once("data", (firstData) => {
                const str = firstData.toString()
                console.log("[TLS PROXY]: first data: ", str)
                
                if (str.startsWith("<policy-file-request")) {
                    console.log("[TLS PROXY]: policy request")
                    this.setCrossDomainPolicy()
                    const policy = Buffer.from(this.domainPolicy + "\0", "utf8")
                    clientSocket.write(policy)
                    clientSocket.end() // we end connection cuz client reconnects, flash only behaviour i think
                    return
                }
                let clientBuffer = Buffer.alloc(0)
                let serverBuffer = Buffer.alloc(0)

                const upstream = tls.connect({
                    host: this.origin,
                    port: this.port,
                    servername: this.origin,
                    minVersion: 'TLSv1.2',
                    maxVersion: 'TLSv1.3',
                    rejectUnauthorized: false
                },() => { // once connected
                    this.servers.push(upstream)
                    console.log("[TLS PROXY]: upstream connected")
                    upstream.write(firstData) // should be <policy-file-request/>\0

                    clientSocket.resume()
                    clientSocket.pipe(upstream) // make client socket pipe all its stuff to that conncetion
                    upstream.pipe(clientSocket) // then make the conncetion pipe all the data to our clients connection
                })

                
                upstream.on("data", (data) => {
                    if (data.includes("<cross-domain-policy")) {
                        console.log("[TLS PROXY]: dropped server policy")
                        return
                    }
                    // i had this from a random script, probably used AI back then tbh :/
                    
                    serverBuffer = serverBuffer.length ? Buffer.concat([serverBuffer, data]) : data;
                    // if its 0 it returns false so we just set the buffer to the data. if not we merge em

                    let idx = -1
                    // way it works, is we find the null byte
                    // if its not -1 we then use subarray to get a fast view of that part specifically,
                    // then we set the buffer to what was left

                    while ((idx = serverBuffer.indexOf(0x00)) != -1){
                        const frame = serverBuffer.subarray(0, idx);
                        serverBuffer = serverBuffer.subarray(idx + 1);

                        if (frame.length) {
                            this.emit("data",frame.toString("utf8"),true);
                        }
                    }  
                })
                
                clientSocket.on("data",(data)=>{
                    clientBuffer = clientBuffer.length ? Buffer.concat([clientBuffer, data]) : data;
                    let idx = -1
                    while ((idx = clientBuffer.indexOf(0x00)) != -1){
                        const frame = clientBuffer.subarray(0, idx);
                        clientBuffer = clientBuffer.subarray(idx + 1);
                        if (frame.length) {
                            this.emit("data",frame.toString("utf8"),false);
                        }
                    }  
                })


                const closeBoth = () => {
                    if (!clientSocket.destroyed){
                        this.clients.splice(this.clients.indexOf(clientSocket),1)
                        clientSocket.destroy()
                    }
                    if (!upstream.destroyed){
                        this.servers.splice(this.servers.indexOf(upstream),1)
                        upstream.destroy()
                    }
                }

                clientSocket.on("error", closeBoth)
                    .on("close", closeBoth)
                upstream.on("error", closeBoth)
                    .on("close", closeBoth)
            })
        })
        await this.tryStartTcpServer()
        console.log(`[TLS PROXY]: Proxy server started on port ${this.serverPort}`)
        return this.serverPort
    }

}
module.exports = TcpProxy