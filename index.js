const Discord = require("discord.js");
const client = new Discord.Client();
const ytdl = require("ytdl-core");
const request = require("request");
const fs = require("fs");
const getYoutubeID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");

var config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const yt_api_key = config.yt_api_key;
const bot_controller = config.bot_controller;
const prefix = config.prefix;
const discord_token = config.discord_token;

var guilds = {};

client.login(discord_token);

client.on('message', function (message){

    const member = message.member;
    const msg = message.content.toLowerCase();
    const args = message.content.split(' ').slice(1).join(' ');

    if (!guilds[message.guild.id]){
        guilds[message.guild.id] = {
            songQueue : [],
            songNameQueue : [],
            isPlaying : false,
            dispatcher : null,
            voiceChannel : null,
            skipReq : 0,
            skippers : [],
        };
    }

    const guild = guilds[message.guild.id];

    if (msg.startsWith(prefix + "play")){

        try {

            if (member.voiceChannel) {
    
                if (guild.songQueue.length > 0 || guild.isPlaying){
                        
                    getID(args, function(id){
                        add_to_queue(id, message);
                        try {
                            fetchVideoInfo(id, function(err, videoInfo){
                                if (err) throw err;
                                message.reply(" added to queue **" + videoInfo.title + "**");
                                guild.songNameQueue.push(videoInfo.title);
                            });

                        } catch (err){
                            console.error(err);
                        }
                    });
    
                } else {
                    guild.isPlaying = true;
                    getID(args, function(id){
                        guild.songQueue.push("placeholder");
                        playMusic(id, message);
                        try {
                            fetchVideoInfo(id, function(err, videoInfo){
                                if (err) throw err;
                                message.reply(" now playing **" + videoInfo.title + "**");
                                guild.songNameQueue.push(videoInfo.title);
                            });
                        } catch (err){
                            console.error(err);
                            guild.songQueue = [];
                            guild.songNameQueue = [];
                            guild.isPlaying = false;
                            message.member.voiceChannel.leave();
                        }
                    });
                }
            } else {
                message.reply(" you must be in a voice channel");
            }
        } catch (error) {
            console.error(error);
        }

    } else if (msg.startsWith(prefix + "skip")){

        min = Math.ceil((guild.voiceChannel.members.size - 1) / 2);

        if (guild.skippers.indexOf(message.author.id) === -1){
            guild.skippers.push(message.author.id);
            guild.skipReq++;
            if (guild.skipReq >= min) { 
                message.reply(" **" + guild.skipReq + "/" + min + "** skip requests, skipping song");
                skipSong(message);
    
            } else {
                message.reply(" **" + guild.skipReq + "/" + min + "** skip requests. More **" 
                + min - guild.skipReq + "** to skip");
            }
        } else {
            message.reply(" you already voted to skip");
        }

    } else if (msg.startsWith(prefix + "queue")) {
        var str = "```";

        if (guild.songNameQueue.length > 0){
            for (var i = 0; i < guild.songNameQueue.length; i++) {
                var line = (i + 1) + ": " + guild.songNameQueue[i] +
                (i === 0 ? "(Current Song)" : "") + "\n";

                if ((str + line).length <= 2000 - 3){
                    str += line;
                } else {
                    str + "```";
                    message.channel.send(str);
                    str = "```";
                }
            }

            str += "```";
            message.channel.send(str);

        } else {
            message.reply(" queue is empty!");
        }
        
    } else if (msg.startsWith(prefix + "help")){
        const helpMessage = "```Usage: >[command] [args]\n\n" + 
        ">help: Shows this help menu\n\n" +
        ">play [song]: Searches for the song on youtube and plays it on your voice channel\n\n" + 
        ">skip: Votes for skipping the current song\n\n" + 
        ">queue: Shows the queue of songs playing\n" + 
        "```";

        message.channel.send(helpMessage);

    } else if (msg.startsWith(prefix + "stop")){

        guild.songQueue = [];
        guild.songNameQueue = [];
        guild.isPlaying = false;
        message.member.voiceChannel.leave();
    }


});

client.on('ready', function (){
    console.log("Goes is ready");
});

function skipSong(message){
    const guild = guilds[message.guild.id];
    guild.dispatcher.end();
}

function playMusic(id, message){

    const guild = guilds[message.guild.id];

    guild.voiceChannel = message.member.voiceChannel;

    guild.voiceChannel.join().then(function (connection){
        stream = ytdl("https://www.youtube.com/watch?v=" + id, {
            filter: 'audioonly',
            quality: 'lowest'
        });

        guild.skipReq = 0;
        guild.skippers = [];

        guild.dispatcher = connection.playStream(stream);

        guild.dispatcher.setVolumeLogarithmic(0.5);

        guild.dispatcher.on('end', function(){
            guild.skipReq = 0;
            guild.skippers = [];
            guild.songQueue.shift();
            guild.songNameQueue.shift();
            
            console.log("dispatcher ended, next = " + guild.songNameQueue[0]);

            if (guild.songQueue.length === 0){
                guild.songQueue = [];
                guild.songNameQueue = [];
                guild.isPlaying = false;
                
                message.member.voiceChannel.leave();

            } else {
                playMusic(guild.songQueue[0], message);
            }
        });

        guild.dispatcher.on('error', error => {
            console.error(error);
        });
    });
}
function getID(str, callback){
    if (str){
        
        if (isYoutube(str)){
            callback(getYoutubeID(str));
        } else {
            search_video(str, function (id){
                callback(id);
            });
        }
    }
}

function isYoutube(str){
    if (str != undefined){
        if (str.toLowerCase().indexOf("youtube.com") > -1){
            return true;
        }
        if (str.toLowerCase().indexOf("youtu.be") > -1){
            return true;
        }
    }
}

function add_to_queue(strID, message){
    const guild = guilds[message.guild.id];

    if (isYoutube(strID)){
        guild.songQueue.push(getYoutubeID(strID)); 
    } else {
        guild.songQueue.push(strID);
    }
}

function search_video(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + 
    encodeURIComponent(query) + "&key=" + yt_api_key, 
    function(error, response, body) {

        var json = JSON.parse(body);
        if (!json.items[0]) callback("3_-a9nVZYjk");
        else {
            callback(json.items[0].id.videoId);
        }

    });
}

