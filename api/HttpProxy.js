const http = require('http');
const { app,session } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');


let proxyPath = path.join(app.getPath("userData"), "proxy")

let serviceWorkerPath = path.join(__dirname, "sw.js")
let gameClientPath = path.join(__dirname, "gameClient", "index.html")

const toProxy = ["index.html"]

const cdnRegex = /^(?:[\/\\])?(?:\d{1,4}[\/\\])?/


// this is for loading custom stuff
class HttpProxy {
    constructor(opts = {}) {
        this.http = http
        this.fs = fs
        this.server = null
        this.port = 8089
		
		this.current_version = 1000 // last was 1819

        this.proxiedData = []
        this.lastChanged = {}
        this.changedFiles = []
        this.filePath = ""

        this.watcher = null


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
    attemptStartServer(){
        return new Promise(async (resolve, reject) => {
            const onListen = () =>{
                const onError = (err) => {
                    switch (err.code){
                        case "EADDRINUSE":
                            this.port += 1
                            console.error("[PROXY]: port taken! retrying on ", this.port)
                            
                            this.server.off('error', onError);
                            onListen()
                            break
                        default:
                            console.error("[PROXY]: ", err)
                            reject()
                            break
                    }
                }

                this.server.once("error",onError);
                this.server.once('listening',()=>{
                    this.server.off('error', onError);
                    resolve()
                })
                this.server.listen(this.port)
            } 
            onListen()
        })
    }

    async startProxy(){
        if (!fs.existsSync(proxyPath)){
            fs.mkdirSync(proxyPath) // create it if it doesnt exist
        }
        await this.fillLocalData()
        this.registerCache()
        this.setupWatcher()
        //console.log("[PROXY]: path directory is ", proxyPath)
        //console.log("[PROXY]: current cache is ", this.proxiedData)

        console.log("regex check ", cleanCDNURL("1822/ajclient.swf"), cleanCDNURL("/1822/ajclient.swf"))

        this.server = http.createServer(this.goClient.bind(this))

        this.server.on('error', (err) => {
            if (err.code == "EADDRINUSE") return
            console.error("[PROXY ERROR]: ", err)
        })
        console.log(this.proxiedData)
        return this.attemptStartServer().then(()=>{
            console.log(`[PROXY]: Proxy server started on port ${this.port}`)
        })
    }

    goClient(req,res){
        const baseURL = new URL(req.url,this.getRealServer())
        const proxyURL = cleanCDNURL(baseURL.pathname)
        console.log("[PROXY] ", proxyURL, this.proxiedData.includes(proxyURL))

        if (toProxy.includes(proxyURL)){
        
            this.handleImportantOverwrites(res,proxyURL)

        } else if (this.proxiedData.includes(proxyURL)){ // if we got a local one
        
            this.handleProxyOverwrite(req,res,proxyURL,baseURL)
        
        } else {
            this.handleRequest(res,req,baseURL)
        }
    }
    handleRequest(res,req,url){
        // we just fetch what it wants if we dont have the local one
        const options = {
            path: url.pathname + url.search,
            hostname: url.hostname,
            method: req.method,
            headers: this.getCustomHeader(req.headers)
        }
        const proxyRequest = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res); // first we setup proxyRes to add anything it sends to response.
        });
        req.pipe(proxyRequest); // then we setup request to send data TO proxy request if the client
        // sends some data
        // a little confusing at first but it works
    }


    handleProxyOverwrite(req,res,proxyURL,baseURL){
        const resultPath = path.join(proxyPath, proxyURL)

        console.log("[PROXY]: proxing", proxyURL)

        if (!fs.existsSync(resultPath)){
            console.error("[PROXY]: ", resultPath, " does not exist..? requesting original file")
            this.handleRequest(res,req,baseURL)
            return
        }
        fs.readFile(resultPath, (err, data) => {
            if (err) {
                console.error("[PROXY]: ", err)
                res.writeHead(500);
                res.end();
                return
            }
            //console.log("[PROXY LOCAL]: ", resultPath)
            res.writeHead(200);
            res.end(data);
        })
    }

    handleImportantOverwrites(res,proxyURL){
        var path = ""
        switch (proxyURL){
            case toProxy[0]:
                path = gameClientPath
                break
        }
        console.log(`[PROXY GAME CLIENT]: OVERWRITTING ${proxyURL} TO ${path}`)
        fs.readFile(path, (err, data) => {
            if (err) {
                console.error("[PROXY]: ", err)
                res.writeHead(500);
                res.end();
                return
            }
            
            // for setting custom headers
            switch (proxyURL){
                case toProxy[1]:
                    res.setHeader("Content-Type", "application/javascript");
                    break
            }
            
            res.writeHead(200);

            res.end(data);
        })
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
            this.proxiedData.push(dir)
            this.lastChanged[dir] =  String(stat.mtime)
        }
    }

    setupWatcher(){
        this.watcher = chokidar.watch(proxyPath, {
            persistent: true,
            ignorePermissionErrors: true,
            ignoreInitial: true,
            interval: 300,
            usePolling: true,
            binaryInterval: 300,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        })
        console.log("[PROXY] folder watcher is watching: ", proxyPath)
        this.watcher.on('add',path => this.fileChanged(path, "add"))
            .on('addDir', path => this.fileChanged(path, "add"))
            .on('change', path => this.fileChanged(path))
            .on("unlink",path => this.fileChanged(path, "remove"))
    }

    async fileChanged(path,type = "update"){
        if (!this.changedFiles.includes(path)){
            this.changedFiles.push(path)
        }

        await this.updateProxyCache(path,type)

        console.log("[PROXY] changed files:",this.changedFiles)
    }

    async updateProxyCache(path,type){
        const cdnPath = path.replace(proxyPath + "/","")
        if (type == "remove"){
            let index = this.proxiedData.indexOf(cdnPath);
            var err = false
            if (index != -1){
                this.proxiedData.splice(index, 1)
            } else {
                err = true
            }

            index = this.changedFiles.indexOf(cdnPath);
            if (index != -1){
                 this.changedFiles.splice(index, 1);
            } else {
                err = true
            }
            
            // im lazy and cant be asked to find how this happens. so this will do fo rnow
            if (err){
                this.fillProxyVariables()
            }

            //console.log("[PROXY] removing ", path)
            delete this.lastChanged[cdnPath]
        } else {
            const stat = fs.statSync(path) 
            if (type == "add"){
                this.proxiedData.push(cdnPath)
            }
            this.lastChanged[cdnPath] =  String(stat.mtime)
            
        }
        await this.updateStorage()
    }

    async fillLocalData(){
        const saveData = await this.getSaveData()
        this.fillProxyVariables()
        if (saveData.fileData == null ||saveData.fileData == undefined) saveData.fileData = {}
        if (saveData.changedFiles != null) this.changedFiles = saveData.changedFiles

        
        this.edited = this.getEdited(this.lastChanged, saveData.fileData)
        //console.log("edited files are ", this.edited)
        
        

        if ((saveData.proxyCache == null || saveData.fileData == null) || !this.arraysEqual(this.proxiedData, saveData.proxyCache) || this.edited.length > 0) {
            this.updateStorage(saveData)
        }
        
        //console.log("[PROXY]: Filled proxy data with: ", this.proxiedData)
    }
    fillProxyVariables(){
        this.proxiedData = []
        this.lastChanged = {}
        const mainFolder = fs.readdirSync(proxyPath)
        for (const entry of mainFolder) {
            this.walkDirectory(entry)
        }
    }

    async updateStorage(data = null){
        let saveData = data ? data : await this.getSaveData()
        saveData.proxyCache = this.proxiedData
        saveData.fileData = this.lastChanged
        saveData.changedFiles = this.changedFiles

        this.writeStore(saveData)
    }


    arraysEqual(a, b) { // from a stackoverflow question forgot original source
        if (a.length !== b.length) return false;

        return a.every((value, index) => value === b[index]);
    }

    getEdited(cur = [],last = []){
        var editedFiles = []

        for (const currentFileKey in cur){
            if (last[currentFileKey] != String(cur[currentFileKey])){
                editedFiles.push(currentFileKey)
            }
        }

        return editedFiles
    }

    registerCache(){
        console.log("registering onBeforeSendHeaders")
        var temp = []
        session.defaultSession.webRequest.onBeforeSendHeaders({urls:["*://*/*"]}, (details, callback) => { // make it so any url will go here,
            let baseURL = new URL(details.url)
            const pathname = baseURL.pathname

            const proxiedPath = path.join(proxyPath,cleanCDNURL(pathname))

            if (this.changedFiles.includes(proxiedPath)){
                console.log("[PROXY] attempting cache busting ", pathname)

                details.requestHeaders["Cache-Control"] = "no-store, no-cache, must-revalidate";
                details.requestHeaders["Pragma"] = "no-cache";
                details.requestHeaders["Expires"] = "0";
            }

            callback({url:baseURL, requestHeaders: details.requestHeaders });

        });
        session.defaultSession.webRequest.onCompleted((details) => {
            const baseURL = new URL(details.url)
            const pathname = baseURL.pathname

            const proxiedPath = path.join(proxyPath,cleanCDNURL(pathname))
            if (this.changedFiles.includes(proxiedPath)){
                if (!details.fromCache){
                    console.log(`[PROXY] ${pathname} successfully removed from cache`)
                    this.changedFiles.splice(this.changedFiles.indexOf(proxiedPath),1)
                } else {
                    console.log(`[PROXY] ${pathname} was not removed from cache :(`)
                }
            }
            
        });
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


function cleanCDNURL(url = ""){
    return url.replace(cdnRegex,"")
}

module.exports = HttpProxy;
