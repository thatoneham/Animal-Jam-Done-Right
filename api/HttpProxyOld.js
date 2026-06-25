const http = require('http');
const { app,session } = require('electron');
const fs = require('fs');
const path = require('path');
const { watch } = fs



let proxyPath = path.join(app.getPath("userData"), "proxy")

const cdnRegex = /(?:^|\/)(\d+)/


// this is for loading custom stuff
class HttpProxy {
    constructor(opts = {}) {
        this.http = http
        this.fs = fs
        this.server = null
        this.port = 8089
		
		this.current_version = 1000 // last was 1819

        this.proxiedData = []

        this.filePath = ""

        this.log = typeof opts.log === "function" ? opts.log : () => {};


    }
    getRealServer(){
        return 'https://ajcontent.akamaized.net'
    }
    getCustomHeader(headers){
        return {
            ...headers,
            Host: 'ajcontent.akamaized.net',
            Referer: 'https://desktop.animaljam.com/gameClient/game/index.html'
        }
    }
    async tryStartHttpServer(){

        return new Promise((resolve, reject) => {
            try{
                this.server.once('listening', () => {
                    console.log(`[PROXY]: Proxy server started on port ${this.port}`)
                    resolve()
                })
                this.server.once("error", (err) => {
                    if (err.code == 'EADDRINUSE'){
                        console.error("[PROXY]: port taken! retrying on ", this.port)
                        this.port += 1
                        this.tryStartHttpServer()
                    } else {
                        console.error("[PROXY]: ", err)
                        reject(err)
                    }
                });
                this.server.listen(this.port)
            } catch (err){
                if (err.code == 'EADDRINUSE'){
                    console.error("[PROXY]: port taken! retrying on ", this.port)
                    this.port += 1
                    this.tryStartHttpServer()
                } else {
                    console.error("[PROXY]: ", err)
                    reject(err)
                }
            }
        })
    }
    async startProxy(){
        if (!fs.existsSync(proxyPath)){
            fs.mkdirSync(proxyPath) // create it if it doesnt exist

        }

        registerCache(this.proxiedData)
        await this.fillLocalData()
        this.log("[PROXY]: path directory is ", proxyPath)
        console.log("[PROXY]: path directory is ", proxyPath)
        console.log("[PROXY]: current cache is ", this.proxiedData)

        console.log("regex check ", cleanCDNURL("1822/ajclient.swf"))

        this.server = http.createServer((req, res) => {
            // req.url looks like /1822/ajclient.swf

            const baseURL = new URL(req.url,this.getRealServer())
            const proxyURL = cleanCDNURL(req.url)
            console.log("[PROXY]: ", proxyURL, this.proxiedData.includes(proxyURL))

            
            if (!this.proxiedData.includes(proxyURL)){ // if we dont have a local one

                const options = {
                    path: baseURL.pathname + baseURL.search,
                    hostname: baseURL.hostname,
                    method: req.method,
                    headers: this.getCustomHeader(req.headers)
                }
                const proxyRequest = http.request(options, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                });
                req.pipe(proxyRequest);
                
            } else {
                const resultPath = path.join(proxyPath, proxyURL)

                console.log("[PROXY]: proxing", proxyURL)


                if (!fs.existsSync(resultPath)){
                    console.error("[PROXY]: ", resultPath, " does not exist")
                    res.writeHead(404);
                    res.end();
                    return
                }
                fs.readFile(resultPath, (err, data) => {
                    if (err) {
                        console.error("[PROXY]: ", err)
                        res.writeHead(500);
                        res.end();
                        return
                    }
                    console.log("[PROXY LOCAL]: ", resultPath)
                    res.writeHead(200);
                    res.end(data);
                })
            }

        })

        this.server.on('error', (err) => {
            console.error("[PROXY ERROR]: ", err)
        })
        return await this.tryStartHttpServer() 
    }

    walkDirectory(dir){
        
        const fullPath = path.resolve(proxyPath, dir)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
            const entries = fs.readdirSync(fullPath)
            for (const entry of entries) {
                this.walkDirectory(path.join(dir, entry))
            }
        } else {
            this.proxiedData.push("/" + dir)
        }
    }
    async fillLocalData(){
        const saveData = await this.getSaveData()
        this.proxiedData = []

        const mainFolder = fs.readdirSync(proxyPath)
        for (const entry of mainFolder) {
            this.walkDirectory(entry)
        }
        if (saveData.proxyCache == null || !this.arraysEqual(this.proxiedData, saveData.proxyCache)) {
            saveData.proxyCache = this.proxiedData
            this.writeStore(saveData)
        }

        this.log("[PROXY]: Filled proxy data with: ", this.proxiedData)
    }
    arraysEqual(a, b) { // not my code
        if (a.length !== b.length) return false;

        return a.every((value, index) => value === b[index]);
    }

    async getSaveData() {
      const userDataPath = app.getPath("userData");;
      this.filePath = path.join(userDataPath, "config.json");

      return this.readStore()
    }
    
    readStore() {
      if (!fs.existsSync(this.filePath)) return {}
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"))
    }
    
    writeStore(data) {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2))
    }
    
}


function registerCache(proxiedFiles = []){
    console.log("registering onBeforeSendHeaders")
    session.defaultSession.webRequest.onBeforeSendHeaders({urls:["*://*/*"]}, (details, callback) => { // make it so any url will go here,
        const baseURL = new URL(details.url)
        // check if url is inside the proxied files


        if (cleanCDNURL(baseURL.pathname) in proxiedFiles) {
            details.requestHeaders["Cache-Control"] = "no-cache";
        }
        callback({ requestHeaders: details.requestHeaders });

    });
}

function cleanCDNURL(url = ""){
    return url.replace(cdnRegex,"")
}


module.exports = HttpProxy;
