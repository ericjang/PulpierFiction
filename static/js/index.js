/* Author: YOUR NAME HERE
*/

$(document).ready(function() {   
	function randomBebas() {
		colors = ['black','red','green','turquoise'];
		return colors[Math.floor(Math.random() * colors.length)];
	}
	
	$('#stories').cycle({fx:'fade',timeout:5000});
	
	$('#bebas_quote').attr('src','images/bebas_quote_'+randomBebas()+'.png');
	
	$('#playbutton').click(function(){
	   document.location.href='/play';
	});
	
	//use jquery cycle plugin	
	
});