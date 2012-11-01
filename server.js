//setup Dependencies
var connect = require('connect')
    , express = require('express')
    , io = require('socket.io')
    , port = process.env.PORT || 8081
		, everyauth = require('everyauth')
		, request = require('request')
		, sanitize = require('validator').sanitize
		, mongodb = require('mongodb')
		, ObjectID = require('mongodb').ObjectID
		, mongo = require('mongoskin')
		, wordsToImage = require("./tumblr-wordsToImage")
		, moniker = require("moniker")
		, adj_generator = moniker.generator([moniker.adjective])
		, noun_generator = moniker.generator([moniker.noun])
		, cron = require('cron')
		, activeStories = 0//number of uncompleted stories at any given time
		, word_limit = 500//max number words before story becomes inactive
		, cached_finished = {}
		, blocklist = {}
		, achievementsList = require('./achievements.json')
		, racistList = require('./racist.json')
		, firstWords = require('./firstWords');

var mongourl = (process.env.NODE_ENV == 'production') ? process.env.MONGOHQ_URL : 'localhost:27017/pulpierfiction_db';
var db = mongo.db(mongourl);

var stories = db.collection('stories');
var finished_stories = db.collection('finished_stories');
var users = db.collection('users');
var user_blocklist = db.collection('user_blocklist');
var logs = db.collection('logs');

everyauth.debug = true;


everyauth
	.facebook
	.appId('131998673616071')
	.appSecret('785eb60af1a166f9440c575a1d2d064c')
	.findOrCreateUser( function (session, accessToken, accessTokenExtra, fbUserMetadata) {
		console.log('fbUserMetadata name ',fbUserMetadata.name);
		return true;
	})
	.scope('publish_actions')//game achievements API
	.sendResponse(function(res,data){
		//var session = data.session;
		//var redirectTo = session.redirectTo;
		//delete session.redirectTo;
		//res.redirect(redirectTo);
		res.redirect('/play')
	});
	
//Setup Express - make sure to include EveryAuth!!!
var server = express.createServer();
server.configure(function(){
    server.set('views', __dirname + '/views');
    server.set('view options', { layout: false });
    server.use(connect.bodyParser());
    server.use(express.cookieParser());
    server.use(express.session({ secret: "shhhhhhhhh!"}));
    server.use(connect.static(__dirname + '/static'));
		server.use(everyauth.middleware());
    server.use(server.router);
});

//setup the errors
server.error(function(err, req, res, next){
	if (err instanceof NotFound) {
  	res.render('404.jade', { locals: { 
				title : '404 - Not Found'
			, description: ''
			, author: ''
			, analyticssiteid: 'XXXXXXX' 
			},status: 404 });
  } else {
		res.render('500.jade', { locals: { 
				title : 'The Server Encountered an Error'
			, description: ''
			, author: ''
			, analyticssiteid: 'XXXXXXX'
			, error: err 
			}, status: 500 });
  }
});
server.listen(port);



///////////////////////////////////////////
//              APP LOGIC                //
///////////////////////////////////////////

function create_user(name,user_id,callback) {
	//sets up a new user...
	var user = {};
	user.name = name;
	user.id =  user_id;
	user.points = 0;
	user.spam_count = 0;
	user.spam_warned = false;
	user.unreadMessages = [];
	user.unreadMessages.push('<div class="alert"><button type="button" class="close" data-dismiss="alert">×</button>Friendly reminder: don\'t spam nonsensical words or you will be permanently banned!</div>');
	user.timestamps = [];
	user.timestamps.push(Date.now());
	callback(user);
}

function noun(options) {
	//returns a random noun
	options = options || {};
	var n = noun_generator.choose();
	if (options.capitalize === true) {
		return n.charAt(0).toUpperCase() + n.slice(1);
	}
	return n;
}

function adjective(options) {
	//returns a random adjective
	options = options || {};
	var a = adj_generator.choose();
	if (options.capitalize === true) {
		return a.charAt(0).toUpperCase() + a.slice(1);
	}
	return a;
}

function generate_title() {
	var title_templates = [
		function(){return noun({capitalize:true}) + " in the " + noun();},
		function(){return noun({capitalize:true}) + " of " + noun();},
		function(){return "The " + adjective() + " " + noun();},
		function(){return "The " + noun() + "'s " + noun();},
		function(){return noun({capitalize:true}) + " of the " + noun();},
	]
	return title_templates[Math.floor(Math.random() * title_templates.length)]();
}

function randomPrettyPic() {
	//autogenerates a replacement pic in case missing one
	var pics = ['http://24.media.tumblr.com/tumblr_mbp7rqplIB1qb782to1_500.jpg',
	'http://25.media.tumblr.com/tumblr_mc7owuUqsl1qhtdsto1_500.jpg',
	'http://25.media.tumblr.com/tumblr_mca56np1qA1qitz6do1_400.jpg',
	'http://24.media.tumblr.com/tumblr_mca4usKDdl1qitz6do1_400.jpg',
	'http://distilleryimage8.instagram.com/7bfec396206d11e284b222000a1fbcf6_7.jpg',
	'http://24.media.tumblr.com/tumblr_mbc3eobjFL1qzr53co1_500.png',
	'http://25.media.tumblr.com/tumblr_mcke2fLSQm1rjkbzxo1_500.jpg'
	]
	return pics[Math.floor(Math.random() * pics.length)];
}

//hack - synchronous function
function create_story(user_id,default_pic) {
	var story = {
			name : generate_title()
		, created_by : user_id
		, snippets : []
		, wordCount : 0
	}
	
	//called from error handling of no stories left > easier than trying to call renderStory because we need to send it to user right away instead of saving
	if (default_pic) {
		
		var words = firstWords();
		story.snippets.push({
				words : words
			, created : Date.now()
			, img_url : randomPrettyPic()
		});
	}	
	
	return story;
}

function move_finished(story,callback) {
	callback = callback || function(){};
	activeStories -= 1;
	stories.remove({_id:story._id});
	story.story_id = story._id;
	/*
	TODO
	- join every 6 snippets into a sentence (for simplicity)
	- use most popular image for each sentence
	- give timestamp of when story was completed.
	*/
	story.pages = [];
	story.totalNotes = 0;
	var currentPage = -1;//similar scenario to bookshelf...
	
	//add a default note count to the first snippet (since it didn't start out with one but we are comparing it...)
	story.snippets[0].img_note_count = -1;//this will never be the cover!
	
	for (var i = 0, ii = story.snippets.length, snippetsPerSentence = 6; i<ii; i++){
		if (i%snippetsPerSentence === 0) {
			//start a new page
			var page = {
					img : ''
				, img_notes : 0
				, snippets : [story.snippets[i]]
			}
			story.pages.push(page);
			currentPage += 1;
		} else {
			//continue current page
			story.pages[currentPage].snippets.push(story.snippets[i]);
		}
		story.totalNotes += story.snippets[i].img_note_count; //accumulates 'total popularity' at the time this story was saved.
	}
	//clean up snippets - we don't need those anymore
	delete story.snippets;
	//use most popular image for each page 
	for (var i in story.pages) {
		var page = story.pages[i];
		for (var j in page.snippets) {
			var snippet = page.snippets[j];
			if (snippet.img_note_count > page.img_notes) {
				page.img = snippet.img_url;
				page.img_notes = snippet.img_note_count;
			}
		}
	}
	//use most globally popular image for cover
	story.cover_pic = '';
	var mostNotes = 0;
	for (var i in story.pages) {
		if (story.pages[i].img_notes > mostNotes) {
			story.cover_pic = story.pages[i].img;
			mostNotes = story.pages[i].img_notes;
		}
	}
	//add timestamp of when story was finished
	story.timeFinished = new Date;
	
	//clean up 
	for (var i in story.pages) {
		var page = story.pages[i];
		page.text = '';
		for (var j in page.snippets) {
			var words = page.snippets[j].words.join(' ')
			page.text += words + ' ';
		}
		delete page.snippets;//- we no longer have need for snippets data, just the words
	}
	
	//add to cache. -> eliminates the need of cron jobs!
	cached_finished[story.story_id] = story;
	finished_stories.insert(story,function(err,okay){
		if (err) {
      console.log(new Error(err.message));
      res.writeHead(500);
      return res.end("Uh oh, something went wrong...");
		}
		callback(err);
	});
}

function save_story(story, callback) {
  callback = callback || function () {};
  
	//count words again - in case user tampered with data...
	for (var i in story.snippets) {
		story.wordCount += story.snippets[i].words.length;
	}
	
	if (story.wordCount >= word_limit) {
		//move to finished story collection
		move_finished(story,function(err){
			if (err) {
				console.log(new Error(err.message));
			}
		});
	}

  return stories.save(story, { upsert: true }, function(err, okay) {
    if (err) {
      console.log(new Error(err.message));
      res.writeHead(500);
      return res.end("Uh oh, something went wrong...")
    }
    //console.log('saved', JSON.stringify(story, null, 2));
    callback(null, okay);
 });
}

//helper function to avoid nested async call
function renderStory(user_id,story,words,lastEdited) {
	var snippet = {
			user_id : user_id
		, words : words//array of words
		, created : Date.now()
		, img_url : ''
		, spam_reports : []
	};
	wordsToImage(words,function(err,img_url,note_count){
		snippet.img_url = img_url;
		snippet.img_note_count = note_count;
		story.snippets.push(snippet);
		story.lastEdited = lastEdited ? lastEdited : snippet.user_id;//allows us to set custom lastEdited (for new stories), otherwise defaults to the user id
		delete story.lock;
		
		save_story(story,function(err,ok){
			if (err) {
				console.log(new Error(err.message));
			}
		});
	});
}


//Setup Socket.IO


var io = io.listen(server);

io.configure('production',function(){
	io.set("transports", ["xhr-polling"]); 
	io.set("polling duration", 10);
});



io.sockets.on('connection', function(socket){
  
	function sendStory(user_id,access_token,query){
		
		stories.findOne(query,function(err,story){
			//if no match, create a new story
			if (story === null) {
				console.log('no suitable stories found, creating a new story...');
				story = create_story(user_id,true);//use the default pretty pic
				activeStories += 1;
			}
			story.lastEdited = user_id;
			story.lock = {
					access_token : access_token
				, created : Date.now()
			};
			
			if (story.snippets[story.snippets.length-1].img_url === undefined || story.snippets[story.snippets.length-1].img_url === null) {
				story.snippets[story.snippets.length-1].img_url = randomPrettyPic();//default pretty pic
				story.snippets[story.snippets.length-1].img_note_count = 0;
			}
			save_story(story);
			story.story_id = story._id;//redundant, but in case story somehow was not created via intial story request <- make sure this is not BSON!
			socket.emit('story',story);
		});
	}
	
	
	socket.on('submit',function(data){
		
		/*
		TODO:
		
		- use the db.collections.findAndModify() function instead -> that's probably more efficient
		
		*/
		
		/*
		- sanitize access token and story
		- fetch the story
		- check in server that story matches access token
		- if match, delete the lock property and save it
		
		then:
		
		- fech an unlocked user or overdue lock, lock it, then send it back to user
		
		*/
		
		data.string = data.string || '';
		data.story_id = data.story_id || '';
		data.access_token = data.access_token || '';
		data.user_id = data.user_id || '';
		data.words = data.words || '';
		
		if (blocklist.hasOwnProperty(user_id)) return false;//hackish blocklist implementation.
		
		var string = sanitize(data.string).xss()
			, story_id = sanitize(data.story_id).xss()
			, access_token = sanitize(data.access_token).xss()
			, user_id = sanitize(data.user_id).xss()
			, words = string.split(' ');
		
		if (words.length !== 3) {
			//all other forms of grammar ought to be fine...
			var message = '<div class="alert"><button type="button" class="close" data-dismiss="alert">×</button>Sorry! Your entry wasn\'t formatted right. Please enter 3 words only</div>';
			socket.emit('user message',message);	
		}
		
		//check for profanity
		for (var i in words) {
			if (racistList.hasOwnProperty(words[i].toLowerCase())) {
				//make the POST request to the FB api
				var ach = achievementsList["dickweed"];
				//facebook should ignore multiple instances of achievement..
				request({
						uri : 'https://graph.facebook.com/'+ user_id +'/achievements?achievement=http://pulpier-fiction.herokuapp.com'+ach.url+'&access_token=131998673616071|l4c8OtBmJWG-uWknTBrR589S7LU'
					, method : 'POST'
				},function(err){
					if (err) console.log('problem with facebook achievement request...');
				});
			}
		}
		
		
		
		
		var story_objID;
		try {
			story_objID = new ObjectID(story_id);
			stories.findOne({'_id':story_objID},function(err,story){
				
				if (story !== null && story.lock.access_token === access_token) {
					//update the user's achievements
					users.findOne({id:user_id},function(err,user){
						if (err) return false;
						if (user === null) return false;
						user.points += 1;
						if (achievementsList.hasOwnProperty(user.points)) {
							debugger;//check achievementsList
							var ach = achievementsList[user.points];
							
							//make the POST request to the FB api... hope this works...
							request({
									uri : 'https://graph.facebook.com/'+ user_id +'/achievements?achievement=http://pulpier-fiction.herokuapp.com'+ach.url+'&access_token=131998673616071|l4c8OtBmJWG-uWknTBrR589S7LU'
								, method : 'POST'
							},function(err){
								if (err) console.log('problem with facebook achievement request...');
							});
							
							//don't bother putting it into messages. send it straight away to user.
							socket.emit('user message','<div class="alert alert-success"><button type="button" class="close" data-dismiss="alert">×</button>Congratulations! You just earned the <b>' + ach.title + '</b> badge! That\'s for ' + ach.condition +'</div>')
						}
						users.save(user,function(err,ok){});
						
					});
					
					
					return renderStory(user_id, story, words);//send it to the database...
					
				} else {
					console.log('access token does not match! Rejecting changes...');
				}
			});//end findOne update
		} catch (e) {
			console.log('malformed story_id! reject changes');
		}
		
		//send user new story
		//give user story that (NOT lastEdited by user) AND (no lock property OR expired lock)
		//if no such users, create a new story
		
		
		var query = {$and:[{'lastEdited':{$ne:user_id}},{$or:[{'lock':{$exists:false}},{'lock.created':{$lte:Date.now()-300000}}]}]};
		sendStory(user_id,access_token,query)
		
	});
	
	socket.on('initial story',function(user){
		var user_id = sanitize(user.user_id).xss()
			,	access_token = sanitize(user.access_token).xss()
			, name = sanitize(user.name).xss();
		
		
		users.findOne({id:user_id},function(err,user){
			if (err) return false;
			//check if user has any messages waiting for them
			if (user !== null && user.unreadMessages.length > 0) {
				//has messages! send them to user.
				
				for (var i = 0, ii = user.unreadMessages.length; i < ii; i++) {
					debugger;
					socket.emit('user message',user.unreadMessages[i]);
				}
				user.unreadMessages = [];//clear messages
				users.save(user,function(err,ok){});
			} else if (user === null) {
				//add new user
				create_user(name,user_id,function(user){
					//save to database
					users.save(user,function(){
						console.log('user saved!');
					});
				});
				
			}
			
			//probability new story is created is 1 if activeStories < 4, else 0.2
			var P_new = (activeStories < 1) ? 1 : (1/activeStories);
			console.log('active Stories...',activeStories);
			if (Math.random() < P_new) {
				activeStories += 1;
				var new_story = create_story(user_id);
				//render story and save
				renderStory(user_id,new_story,firstWords(),'none');
			}
		
			var query = {$and:[{'lastEdited':{$ne:user_id}},{$or:[{'lock':{$exists:false}},{'lock.created':{$lte:Date.now()-300000}}]}]};
			sendStory(user_id,access_token,query);
		});
		
		
	});
	
	socket.on('report spam',function(report){
		console.log('spam report received!!');
		var submitted_by = report.submitted_by
			, story_id = report.story_id
			, snippet_index = report.snippet_index
			, created = Date.now();
			
			try {
				stories.findOne({'_id':new ObjectID(story_id)},function(err,story){
					if (err) {console.log(new Error(err.message)); return false;}
					story.snippets[snippet_index].spam_reports.push({'created':created,'submitted_by':submitted_by});
					stories.save(story);
				});
			} catch (e) {
				console.log('spam report unsuccessful...')
			}
			
	});
	
	socket.on('display story',function(story_id){
		//this is for the story display
		if (cached_finished[story_id] === undefined) return false;
		debugger;
		//TODO : log the number of views per story for popularity.
		
		//send full story back to user so they can view it
		socket.emit('full story',cached_finished[story_id]);
		
	});
});


///////////////////////////////////////////
//              Routes                   //
///////////////////////////////////////////

/////// ADD ALL YOUR ROUTES HERE  /////////

server.get('/', function(req,res){
  res.render('index.jade', {
    locals : { 
              title : 'Pulpier Fiction'
             ,description: 'Real Time Collaborative Mad Libs'
             ,author: 'Eric Jang'
             ,analyticssiteid: 'UA-35901019-2' 
            }
  });
});

server.get('/play',function(req,res){
	if (!req.loggedIn) {
		req.session.redirectTo = '/play';
		return res.redirect(everyauth.facebook.entryPath());
	}//otherwise return requested apge
	res.render('play.jade', {
		locals : { 
			title : 'Pulpier Fiction'
			,description: 'Real Time Collaborative Mad Libs'
			,author: 'Eric Jang'
			,analyticssiteid: 'UA-35901019-2' 
		}
	});
});



server.get('/stories', function(req,res){
	var rowSize = 5;//number of covers in each row
	var bookshelf = [];//array of array of covers
	
	var count = 0;
	var currentRow = -1;//we will be incrementing this immediately so its okay
	
	for (var i in cached_finished) {
		
		if (count%rowSize === 0) {
			//new row is needed!
			var newRow = [];
			newRow.push({
				story_id : cached_finished[i].story_id,
				cover_pic : cached_finished[i].cover_pic,
				title : cached_finished[i].name
			});
			bookshelf.push(newRow);
			currentRow += 1;
		} else {
			//continue adding to last row
			bookshelf[currentRow].push({
				story_id : cached_finished[i].story_id,
				cover_pic : cached_finished[i].cover_pic,
				title : cached_finished[i].name
			});
		}
		
		count += 1;
		
	}
	
	debugger;//check what bookshelf looks like
 	res.render('stories.jade', {
    	locals : { 
              title : 'Pulpier Fiction : Stories'
             ,description: 'Real Time Stories'
             ,author: 'Eric Jang'
             ,analyticssiteid: 'UA-35901019-2'
			 			 ,bookshelf:bookshelf 
            }
  });
	
});


server.get('/about', function(req,res){
  res.render('about.jade', {
    locals : { 
              title : 'Pulpier Fiction : About'
             ,description: 'Your Page Description'
             ,author: 'Eric Jang'
             ,analyticssiteid: 'UA-35901019-2' 
            }
  });
});

server.get('/contact', function(req,res){
  res.render('contact.jade', {
    locals : { 
              title : 'Pulpier Fiction : Contact'
             ,description: 'Your Page Description'
             ,author: 'Eric Jang'
             ,analyticssiteid: 'UA-35901019-2' 
            }
  });
});
// 
// server.get('/shift', function(req,res){
// 	stories.findOne({},function(err,story){
// 		move_finished(story);
// 		res.writeHead(200, {'Content-Type': 'text/plain'});
// 		res.end('Done!\n');
// 	});
// });
// 
// server.get('/updatecache',function(req,res){
// 	console.log('starting cron job for cached_finished...');
// 	finished_stories.find({},function(err,cursor){
// 		cursor.each(function(err,story){
// 			if (story !== null) cached_finished[story._id] = story;
// 		});
// 		res.writeHead(200, {'Content-Type': 'text/plain'});
// 		res.end('Done!\n');
// 	});
// });


//achievements urls -> need to be scraped by Facebook
//dynamically create each of the achievement handlers

for (var point in achievementsList) {
	var url = achievementsList[point].url;
	server.get(url,function(req,res){
	  res.render('achievement.jade', {
	    locals : { 
	              title : 'Achievement : ' + achievementsList[point].title
	             ,description: achievementsList[point].condition
							 ,img_url : achievementsList[point].img_url
	             ,author: 'Eric Jang'
							 ,points : (achievementsList[point].point_val) ? achievementsList[point].point_val : point
							 ,url: url
	             ,analyticssiteid: 'UA-35901019-2'
	            }
	  });
	});
}

//A Route for Creating a 500 Error (Useful to keep around)
server.get('/500', function(req, res){
    throw new Error('This is a 500 Error');
});

//The 404 Route (ALWAYS Keep this as the last route)
server.get('/*', function(req, res){
    throw new NotFound;
});

function NotFound(msg){
    this.name = 'NotFound';
    Error.call(this, msg);
    Error.captureStackTrace(this, arguments.callee);
}


///////////////////////////////////////////
//       Lovely Lovely Cron Jobs         //
///////////////////////////////////////////


var updateFinished = new cron.CronJob('0 0 * * *', function(){
    // Runs every hour
		
		console.log('starting cron job for cached_finished...');
		finished_stories.find({},function(err,cursor){
			cursor.each(function(err,story){
				if (story !== null) cached_finished[story.story_id] = story;
			});
		});
		
  }, function () {
    // This function is executed when the job stops
		var now = new Date;
		//logs.insert('successfully updated cached finished books...',function(err,ok){})''
		console.log('updated cached finished books at ',now.toUTCString());
  }, 
  true /* Start the job right now */
);


var updateBlocklist = new cron.CronJob('0 0 * * *', function(){
    // Runs every hour
		
		console.log('starting cron job for blocklist...');
		user_blocklist.find({},function(err,cursor){
			cursor.each(function(err,user){
				blocklist[user.id] = true;
			});
		});
		
  }, function () {
    // This function is executed when the job stops
		var now = new Date;
		//logs.insert('successfully updated cached finished books...',function(err,ok){})''
		console.log('updated cached blocklist at ',now.toUTCString());
  }, 
  true /* Start the job right now */
);

var updateActive = new cron.CronJob('0 0 * * *',function(){
	//runs every hour
	activeStories = 0;
	stories.find({$or:[{'lock':{$exists:false}},{'lock.created':{$lte:Date.now()-300000}}]},function(err,cursor){
		cursor.each(function(err,story){
			activeStories += 1;
		})
	});
},null,true);


var cleanSpam = new cron.CronJob('* 0 * * *',function(){
	//run every 30 min
	console.log('initiating spam cleaning...');
	
	stories.find({},function(err,cursor){
		//probably more efficient to not return all stories but oh well
		if (err) return false;
		cursor.each(function(err,story){
			if (story === null) return false;
			var changed = false
				, offenders = {};
			for (var i in story.snippets) {
				if (story.snippets[i].spam_reports.length > 2) {
					changed = true;
					var offending_id = story.snippets[i].user_id;
					if (offenders.hasOwnProperty(offending_id)) {
						offenders[offending_id] += 1;
					} else {
						offenders[offending_id] = 1;
					}
					 story.snippets.splice(i,1);//remove the snippet
				} else {
					//not a spammy snippet
				}
			} //end looping over snippets
			
			if (changed) {
				stories.save(story,function(err){});
			}
			
			//find all offending users and update their spam_count, then check if they need to be blocked
			var id_array = [];
			for (var id in offenders) {
				id_array.push(id);
			}
			//we only need a couple of the fields
			users.find({'id':{$in:id_array}},{id:1,spam_count:1,unreadMessages:1},function(err,cursor){
				cursor.each(function(err,user){
					if (user === null) return false;
					user.spam_count += offenders[user.id];
					if (!user.spam_warned && user.spam_count > 10) {
						//first offense - send a spam warning
						user.unreadMessages.push('<div class="alert alert-error"><button type="button" class="close" data-dismiss="alert">×</button>Hey asshole! Stop spamming or you will be permanently banned! If you feel this has been a mistake please contact admin</div>')
						user.spam_warned = true;
					} else if (user.spam_warned && user.spam_count > 20) {
						//second offense - add user to blocklist
						user_blocklist.save(user);
					}
					users.save(user);
				});
			});
			
			
		});
	});
},function(){
	console.log('spam counts should be updated for all users...');
},true);



console.log('Listening on local.pulpierfiction.aws.af.cm:' + port );
