//jquery logic for realtime story feed

//game logic goes here

$(document).ready(function() {
	
	//page flipping is annoying. Just render modal sliding boxes gallery-style
	
	//story thumbnails rendered via jade but use sockets to request specific stories.
	
	var socket = io.connect();
	
	//bind tooltip event to all covers
	$('.cover img').tooltip();
	
	
	function launchFancybox(story_id) {
		
		//fire up fancybox!!!
		var data = [];
		$('.'+story_id).each(function(index){
			var id = '#'+story_id+'_'+index+'img';//we are selecting the img
			//create a href string
			var text = $('#'+story_id+'_'+index + ' p').text()
			data.push({href:id,title:text});
		});
		
		$.fancybox.open(data,{helpers:{
			title:{type:'inside'}
		}});
	}
	
	$('#bookshelf .cover a').click(function(){
		//check if story already loaded.
		var story_id = $(this).attr('story_id');
		var existingstory = $('#'+story_id);
		if (existingstory.length == 0) {
			//make socket request for story data
			socket.emit('display story',story_id);	
		} else {
			//otherwise open fancybox manually because story already exists
			
			launchFancybox(story_id);
			
		}
		
	});
	
	socket.on('full story',function(story){
		console.log('full story received... loading fancybox...');
		//render span data into hidden div pointed to by stories
		var story_id = story.story_id
		
		$('#'+ story_id).html('');//clear out in case something is already there
		
		//construct a new hidden story
		$('#hiddenstories').append('<div id=\"'+ story_id +'\"></div>');
		for (var i in story.pages) {
			var page = story.pages[i];
			
			//append each page to that story.
			
			//story_id and _id are interchangeable (my mistake)
			var pageHTML = '<div id=' + story_id + '_' + i +
												' class=\"' + story_id +'\">'+
												'<img id='+ story_id + '_' + i + 'img' +' src=\"'+ page.img + '\" style=\"width:400px\">' +
												'<p>'+ page.text +'</p>'
											'</div>'
											
			$('#'+ story_id).append(pageHTML);
		}
		
		launchFancybox(story_id);
		
	});
	
		
});