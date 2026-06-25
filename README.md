Proxy path is located in these locations for OS's, same for config.json

Linux MX /home/<user>/.config/ajdr/

Windows C:\\Users\\<user>\\AppData\\Roaming\\ajdr\\ # might be the same for all linux distros idk

No mac os support. might change later but have no way to test :(

There is session support, so when you are in the game, if you click home your auth token stays, if you click log out auth token gets cleared and removed
from config.json, changing username also clears it

there is no need to put a cdn version for the proxy folder. E.G

NO --> proxy/1823/ajclient.swf

YES --> proxy/ajclient.swf

YES --> proxy/roomDefs/jamaa_township/97f6255e59d8249a27ec737784630177 # room_main.xroom

NO -- proxy/1823/roomDefs/jamaa_township/97f6255e59d8249a27ec737784630177

you can generate valid hashed file paths with my own website

https://thatoneham.github.io/Aj-Automator-tools/
