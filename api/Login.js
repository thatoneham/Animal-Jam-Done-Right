class LoginSimplifier {
    constructor(env,netFetch) {
        this.env = env
        this.netFetch = netFetch
        this.loginCallback = null

        this.debug = true
        
        this.user = ""
        this.df = "5eb3c822-74ef-4397-b1d4-d6a8fde512c2"
        this.otp = null
    }


    log(msg) {if (this.debug) console.log(msg)}
    // first we start the login by autenticating
    startLoginProcess(username, password,otp = null,callback = null) {
        this.loginCallback = callback  
        this.user = username
        this.opt = otp

        var data = {
            "df":this.df, // dont think i need any other DF value.
            "domain":"flash","username": username,"password": password,
        }
        if (otp) data.otp = otp
        this.log("STARTING LOGIN PROCESS")
        this.fetchUrl(this.env.authenticatePath, {
            "method": "POST",
            "body":JSON.stringify(data)
        },this.getFlashVars.bind(this))
    }

    startTokenLogin(data,otp = null,callback = null){
        if (otp){
            data.otp = otp
        }
        this.loginCallback = callback
        this.getFlashVars(JSON.stringify(data))
    }

    // after we successfully authenticate we get the flash vars
    getFlashVars(data) {
        
        try{ // incase the server is down, rate limited or something happens
            data = JSON.parse(data)
        }catch(e){
            this.loginCallback({"error": e})
            return
        }
        this.fetchUrl(this.env.flashVarsPath, {
        "method": "GET"
        },this.gotFlashVars.bind(this, data)) // we bind the authentication data, and make a null slot for the flash vars
    }


    gotFlashVars(authData, flashVars) {
        try{
            flashVars = JSON.parse(flashVars) 
        }catch(e){
            this.loginCallback({"error": e})
            return
        }
        this.getPlayerData({ // we bind all the data so we dont keep it in a variable
            "authData": authData,
            "flashVars": flashVars
        })
    }

    getPlayerData(data){
        this.log("STARTING PLAYER DATA PROCESS")
        const body = {"domain": "flash", "client_version": data.flashVars.smoke_version}

        this.fetchUrl(this.env.playerDataPath + "?domain=" + `${body.domain}&client_version=${body.client_version}`, {
        "method": "GET", // we do a GET request here for some reason?
        "headers": {"Authorization": "Bearer " + data.authData.auth_token}
        },this.getLoginAuth.bind(this,data))
    }



    // the last bit we do is do the login auth. that should give us a "ok" response. which means everything
    // is good and we can start the game
    getLoginAuth(data,playerData){
        this.log("STARTING LOGIN AUTH PROCESS")
        data.playerData = JSON.parse(playerData)
        
        const body = {"version": "1.5.7","platform": "win32","userId": data.playerData.id,"username": data.playerData.screen_name,"usedToken": false}
        //if (this.opt) body.otp = this.opt
        this.fetchUrl(this.env.loginAuthPath, {
            "method": "POST",
            "body": JSON.stringify(body)
        },this.gotLoginData.bind(this,data))
    }


    gotLoginData(data,res) {
        const requestedClientVersion = data.flashVars.smoke_version ?  data.flashVars.smoke_version :  data.flashVars.deploy_version
        if (data.playerData.game_server && data.playerData.game_server != "NONE_AVAIL"){
            if (!data.flashVars.deploy_version != requestedClientVersion){
                data.flashVars.deploy_version = requestedClientVersion
            }
            data.flashVars.smartfoxServer = data.playerData.game_server
            data.flashVars.blueboxServer = data.playerData.game_server
        }
        data.flashVars.df = this.df
        data.flashVars.username = data.playerData.screen_name
        
        const ajVars = {
            ...data.authData,
            ...data.playerData,
            ...data.flashVars
        } // merge it. dunno how else to do it
        if (!this.loginCallback){
            console.log("[LOGIN] finished login butno callback?")
        }
        this.loginCallback("success", ajVars)
    }



    // this just simplifies making the correct headers for the net request
    createHeaders(options,url_str){
        const url = new URL(url_str);
        return {
            "protocol": url.protocol,
            "port": url.port || 443,
            "hostname": url.hostname,
            "path": url.pathname + url.search,
            "Authority": "authenticator.animaljam.com",
            "User-Agent" : this.env.userAgent,
            ...options
        }
    }


    fetchUrl(url, options, callback) {
        this.netFetch(this.createHeaders(options, url))
            .then(res => {
                try {
                    console.log(res)
                    const data = res.data
                    const status = res.status
                    var err = data != "" ? JSON.parse(data) : { error:null }
                    if(data != "" && (err.error || err.error_code)){
                        if (this.loginCallback){
                            if (err.error_code){
                                throw {"error": err.error_code}
                            }
                            switch (err.error) {
                                case "pending_otp_confirmation": {
                                    throw {"error": "otp"}
                                    break
                                }
                                case 101: {
                                    throw {"error": "incorrect password"}
                                    break
                                }
                                default: {
                                    throw {"error": "Login failed"}
                                    break
                                }
                            }    
                        }
                        return
                    }
                }catch(e){
                    this.log(e)
                    this.loginCallback(e)
                    return
                }
                callback(res.data)
            }).catch(err => {
                if (!this.loginCallback) return
                this.log(err)
                this.loginCallback(err)
            });
    }
}
module.exports = LoginSimplifier
