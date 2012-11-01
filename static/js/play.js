//game logic goes here

$(document).ready(function() {
	//first things that need to happen...
	var user_id = $('#user_id p').text(),
	var access_token = $('#access_token p').text();
	var name = $('#name p').text();
	
  var socket = io.connect();
	
	//make first (and initial) request for a story (and for any user messages that they need to see)
	socket.emit('initial story',{
			user_id : user_id
		, access_token : access_token
	});


	socket.on('user message', function(message){
		/*do a twitter bootstrap alert dialog for any of the following scenarios
		
		- spamming
		- abuse of spam flagging
		- miseuse of Pulpier Fiction
		
		we leave it up to the server to customize these dialogs
		*/
		$('#messages').append(message);
  });
	
	function randomBebas() {
		colors = ['black','red','green','turquoise'];
		return colors[Math.floor(Math.random() * colors.length)];
	}
	
	socket.on('story',function(story){
		//unbind search box so user can use it!
		console.log('received story',story);
		
		//clear out the previous story and submitted text and messages
		$('.story').html('');
		$('#submit').removeAttr('disabled');
		$('#threewords').removeAttr('disabled');
		$('#threewords').val('');
		$('#messages').html('');
		
		var snippets = story.snippets;
		for (var i in snippets) {
			var span = '<span '+ 'snippet_index='+ i + ' ' +'img_url=\"' + snippets[i].img_url + '\">' + snippets[i].words.join(' ') + '</span>'+'&nbsp;'
			$('.story').append(span);
		}
		$('#bebas_quote').attr('src','images/bebas_quote_'+randomBebas()+'.png');
		$('#storytitle').html(story.name);
		$('#tumblr_img').attr('src',snippets[snippets.length-1].img_url);
		$('.story').append('<span style=\"border-bottom:1px solid red;color:#fcfbf7\">Your Three Words</span>');
		$('.story').attr('story_id',story.story_id);
		
		//re-bind mouseover event to all snippets
		$('.story span').mouseover(function(){
				$('#tumblr_img').attr('src',$(this).attr('img_url'));
		});
	
		//re-bind click event to snippets for flagging spam
		$('.story span').click(function(){
			
	    $(this).popover({
					html : true
				, content : function(){
					//set attributes to inspect
					$('#flagspam').attr({
							story_id : $('.story').attr('story_id')
						, snippet_index : $(this).attr('snippet_index')
					});
					return $('#spamflag_wrapper').html();
				}
				, placement:'top'});
			$(this).popover('toggle');
			
			//re-bind flagspam. this is probably not 100% kosher code but it'll do.
			$('.popover-content #flagspam').click(function(){
				var spam_report = {
						submitted_by : user_id
					, story_id : $(this).attr('story_id')
					, snippet_index : $(this).attr('snippet_index')
				}
				socket.emit('report spam',spam_report);
				$('.story span').popover('destroy');
				$('.story span[snippet_index=' + spam_report.snippet_index +']').remove();
				$('#messages').append('<div class="alert alert-info"><button type="button" class="close" data-dismiss="alert">×</button>Snippet flagged as spam. Thanks for beinga good citizen!</div>');
			});
		});
		
	});
	
	
	
	$('#threewords').keypress(function(e){
	    if (e.which == 13){
	       $("#submit").click();
	    }
	});
	
	//bind submit functions to buttons (and enter key for search)
	$('#submit').bind('click', function(){
		$('#submit').attr('disabled','');
		$('#threewords').attr('disabled','');
		//get value of input, clear the input, and then emit it
		var data = {
				string : $('#threewords').val()
			, story_id : $('.story').attr('story_id')
			, access_token : access_token
			, user_id : user_id
		};
		socket.emit('submit',data);
	});
	
	
	
	//focus the submit button
	$('#playbutton').focus();
	
	
	
	
});